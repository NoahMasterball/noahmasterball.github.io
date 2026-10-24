import { ABILITY_RULES } from '../../config/sim.ts';
import type { AbilityDef, Vec3Tuple } from '../../data/schema.ts';
import { allocateId, type SimContext } from '../context.ts';
import { cloneVec3, type Vec3 } from '../math.ts';
import type { AbilityOf } from '../systems/abilities.ts';
import type { CharacterEntity, DamageCause, EntityId, GadgetEntity } from '../types.ts';

// NEW — placed gadgets as entities with health (ADR-0012 §2, §4). The state is a GadgetEntity in
// SimState.gadgets; its collider lives in the physics side table (PhysicsWorld.addGadget). Shape
// and health come from data via abilityId. When a gadget acts (triggers) is triggers.ts.

/** A gadget's collision shape: a barrier cuboid (width across the placer's view, height, a fixed
 *  thickness) standing on its pos, or a small device ball around it. */
export type GadgetShape = { kind: 'barrier'; halfExtents: Vec3Tuple } | { kind: 'device'; radius: number };

/** The shape of an ability's gadget (pure: the physics and the client both build from it). */
export function gadgetShape(ability: AbilityDef): GadgetShape {
  const barrier = ability.effects.find((e) => e.kind === 'barrier');
  if (barrier?.kind === 'barrier') {
    return { kind: 'barrier', halfExtents: [barrier.width / 2, barrier.height / 2, ABILITY_RULES.barrier.thicknessM / 2] };
  }
  return { kind: 'device', radius: ABILITY_RULES.gadget.deviceRadiusM };
}

/** Where a gadget goes (placementPose's result without its verdict). */
export interface GadgetPose {
  /** Barrier: base centre on the floor. Device: its centre. */
  pos: Vec3;
  yaw: number;
  /** Normal of the surface it is attached to. */
  normal: Vec3;
}

/** Places `owner`'s gadget of `ability` at `pose` (no checks: placement validity and the resource
 *  are the activation's). Emits `gadgetPlaced`. Bullets see its collider from this tick's
 *  physics step on, movement from the next tick. */
export function spawnGadget(ctx: SimContext, owner: CharacterEntity, ability: AbilityOf<'placeable'>, pose: GadgetPose): GadgetEntity {
  const trigger = ability.activation.trigger;
  const g: GadgetEntity = {
    id: allocateId(ctx.state),
    kind: 'gadget',
    abilityId: ability.id,
    ownerId: owner.id,
    team: owner.team,
    pos: cloneVec3(pose.pos),
    yaw: pose.yaw,
    normal: cloneVec3(pose.normal),
    health: ability.activation.gadgetHealth,
    placedTick: ctx.state.tick,
    timer: trigger.kind === 'timer' ? trigger.delay : 0,
    disabled: 0,
  };
  ctx.state.gadgets.push(g);
  ctx.physics.addGadget(g.id, gadgetShape(ability), g.pos, g.yaw);
  ctx.emit({ type: 'gadgetPlaced', gadgetId: g.id, ownerId: owner.id, abilityId: ability.id, pos: cloneVec3(g.pos) });
  return g;
}

/** Removes a gadget silently (consumed by its trigger, operator change): out of the state list
 *  now, collider disabled now and removed in the next physics step. */
export function removeGadget(ctx: SimContext, g: GadgetEntity): void {
  const i = ctx.state.gadgets.indexOf(g);
  if (i < 0) return;
  ctx.state.gadgets.splice(i, 1);
  ctx.physics.removeGadget(g.id);
}

/** Destroys a gadget by damage: removal plus `gadgetDestroyed`. */
export function destroyGadget(ctx: SimContext, g: GadgetEntity, attackerId: EntityId, cause: DamageCause): void {
  removeGadget(ctx, g);
  ctx.emit({
    type: 'gadgetDestroyed',
    gadgetId: g.id,
    abilityId: g.abilityId,
    ownerId: g.ownerId,
    pos: cloneVec3(g.pos),
    attackerId,
    cause: { ...cause },
  });
}

/** Deals `amount` to a gadget (`gadgetHit`); at 0 health it is destroyed. No zones, armour or
 *  modifiers. A gadget already removed (earlier this tick) takes nothing. */
export function damageGadget(ctx: SimContext, g: GadgetEntity, amount: number, attackerId: EntityId, cause: DamageCause, point: Vec3): void {
  if (!ctx.state.gadgets.includes(g) || amount <= 0) return;
  g.health = Math.max(0, g.health - amount);
  ctx.emit({ type: 'gadgetHit', gadgetId: g.id, attackerId, amount, point: cloneVec3(point), cause: { ...cause } });
  if (g.health <= 0) destroyGadget(ctx, g, attackerId, cause);
}

/** Removes every gadget `ownerId` placed, silently (operator change: they belong to the old kit). */
export function removeGadgetsOf(ctx: SimContext, ownerId: EntityId): void {
  for (const g of ctx.state.gadgets.filter((x) => x.ownerId === ownerId)) removeGadget(ctx, g);
}
