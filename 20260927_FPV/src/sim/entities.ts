import { getAbility, getHitboxProfile, getOperator, loadoutWeapon, type LoadoutSlot } from '../data/content.ts';
import type { HitboxProfileDef, OperatorDef, WeaponDef } from '../data/schema.ts';
import { applyEffects, areEffectsImplemented, isAbilityCompatible } from './abilities/effects.ts';
import { removeGadgetsOf } from './abilities/gadgets.ts';
import { createResourceState } from './abilities/resource.ts';
import { effectContext } from './abilities/targeting.ts';
import type { ButtonName } from './command.ts';
import { allocateId, type SimContext } from './context.ts';
import { cloneVec3, withoutNegativeZero, type Vec3 } from './math.ts';
import { characterSeed, createRng } from './rng.ts';
import type { CarriedWeapon, CharacterEntity, EntityId, SimState, WeaponState } from './types.ts';

// NEW — character creation and (re)loading an operator's kit. Used on spawn, operator change
// and respawn (respawnAt, shared by every mode), so all three reset state identically. Also the
// clean-up of the world objects abilities leave (clearWorldObjects, ADR-0012 §2).

// NEW — weapon slots (M1 weapon swapping): index = position in CharacterEntity.weapons, with the
// operator loadout key it is filled from and the Command button that selects it.
export const WEAPON_SLOTS = [
  { loadout: 'primary', button: 'selectPrimary' },
  { loadout: 'secondary', button: 'selectSecondary' },
] as const satisfies readonly { loadout: LoadoutSlot; button: ButtonName }[];

export type WeaponSlot = (typeof WEAPON_SLOTS)[number];

// NEW — ADR-0014 §4: Sim.restore derives bodies from state; spawn and operator change did the
// same lookup inline.
/** The hitbox profile an operator's body carries. */
export const hitboxProfileOf = (operatorId: string): HitboxProfileDef => getHitboxProfile(getOperator(operatorId).hitboxProfile);

/** Reserve ammo a weapon spawns with (and the range refills to). */
export const startingReserve = (w: WeaponDef): number => w.magazine * w.reserveMagazines;

/** The weapon an operator spawns with in a weapon slot (lookup: loadoutWeapon in content.ts). */
export const weaponForSlot = (op: OperatorDef, slot: WeaponSlot): WeaponDef => loadoutWeapon(op, slot.loadout);

function createCarriedWeapon(w: WeaponDef): CarriedWeapon {
  return { weaponId: w.id, ammo: w.magazine, reserve: startingReserve(w) };
}

const carriedWeaponsOf = (op: OperatorDef): CarriedWeapon[] =>
  WEAPON_SLOTS.map((slot) => createCarriedWeapon(weaponForSlot(op, slot)));

/** Handling state of a weapon freshly in hand: ready, hip, no bloom or recoil. */
export function createWeaponState(): WeaponState {
  return {
    fireCooldown: 0,
    triggerBuffer: 0,
    reloadRemaining: 0,
    bloom: 0,
    shotIndex: 0,
    sinceLastShot: Infinity,
    recoilPitch: 0,
    recoilYaw: 0,
    prevRecoilPitch: 0,
    prevRecoilYaw: 0,
    ads: 0,
    prevAds: 0,
    swapRemaining: 0,
    prevSwapRemaining: 0,
  };
}

export interface SpawnOptions {
  operatorId: string;
  team: number;
  controller: 'player' | 'bot';
  position: Vec3;
  yaw: number;
}

/** A new character, spawned now (`at`: the simulation's current tick and its creation seed, which
 *  seeds the character's own RNG stream). */
export function createCharacter(id: EntityId, o: SpawnOptions, at: Readonly<Pick<SimState, 'tick' | 'seed'>>): CharacterEntity {
  const op = getOperator(o.operatorId);
  const yaw = withoutNegativeZero(o.yaw);
  return {
    id,
    kind: 'character',
    team: o.team,
    controller: o.controller,
    operatorId: op.id,
    pos: cloneVec3(o.position),
    prevPos: cloneVec3(o.position),
    vel: { x: 0, y: 0, z: 0 },
    yaw,
    pitch: 0,
    prevYaw: yaw,
    prevPitch: 0,
    stance: 0,
    prevStance: 0,
    grounded: false,
    strideProgress: 0,
    sprinting: false,
    sinceSprint: Infinity,
    health: op.maxHealth,
    alive: true,
    deadTime: 0,
    spawnPos: cloneVec3(o.position),
    spawnYaw: yaw,
    spawnTick: at.tick,
    weapons: carriedWeaponsOf(op),
    activeSlot: 0,
    weapon: createWeaponState(),
    abilities: [],
    modifiers: [],
    shields: [],
    reveals: [],
    dash: null,
    lastButtons: 0,
    suppressedButtons: 0,
    rng: createRng(characterSeed(at.seed, id)),
  };
}

/** Resets health, weapons, abilities (idle, full resources), modifiers, shields, reveals and
 *  consumed buttons to the operator's kit and applies passives (without `abilityEnd` events:
 *  the `spawn` or `operatorChanged` event says it). An operator change also removes the gadgets
 *  the old kit placed. Passives whose effects the simulation cannot run yet are kept in the kit
 *  but never applied. */
export function loadOperator(ctx: SimContext, e: CharacterEntity, operatorId: string): void {
  const op = getOperator(operatorId);
  const changed = e.operatorId !== op.id;
  e.operatorId = op.id;
  e.health = op.maxHealth;
  e.weapons = carriedWeaponsOf(op);
  e.activeSlot = 0;
  e.weapon = createWeaponState();
  e.modifiers = [];
  e.shields = [];
  e.reveals = [];
  e.dash = null;
  e.suppressedButtons = 0;
  e.abilities = op.abilities.map((abilityId) => ({
    abilityId,
    resource: createResourceState(getAbility(abilityId).resource),
    active: null,
  }));
  if (changed) {
    ctx.physics.setProfile(e.id, hitboxProfileOf(op.id), e.stance);
    removeGadgetsOf(ctx, e.id);
  }
  for (const slot of e.abilities) {
    const ability = getAbility(slot.abilityId);
    if (ability.activation.kind !== 'passive' || !isAbilityCompatible(ability) || !areEffectsImplemented(ability.effects)) continue;
    applyEffects(effectContext(ctx, ability, e, e.pos, { kind: 'user' }));
  }
}

// NEW — ADR-0013 §3: an operator change was inline in Sim (selectOperator); Relay's auto-pick at
// the end of operator select makes the same change.
/** Switches `e` to `operatorId` (a fresh kit, loadOperator) and emits `operatorChanged`. */
export function changeOperator(ctx: SimContext, e: CharacterEntity, operatorId: string): void {
  loadOperator(ctx, e, operatorId);
  ctx.emit({ type: 'operatorChanged', entityId: e.id, operatorId });
}

// NEW — Sim.spawnCharacter did this inline; the ability test harness (tests/unit/support/) adds
// characters to a bare SimContext the same way (ADR-0012 §11).
/** Adds a character to the simulation now (id from allocateId): state, physics body and
 *  hitboxes, the operator's kit; emits `spawn`. */
export function addCharacter(ctx: SimContext, o: SpawnOptions): CharacterEntity {
  const e = createCharacter(allocateId(ctx.state), o, ctx.state);
  ctx.state.entities.push(e);
  ctx.physics.addCharacter(e.id, hitboxProfileOf(o.operatorId), e.pos, e.yaw);
  loadOperator(ctx, e, o.operatorId);
  emitSpawn(ctx, e);
  return e;
}

// NEW — ADR-0012 §2: a round reset starts without the last round's gadgets, projectiles and
// areas (elimination's resetRound calls it before the respawns; Relay will too).
/** Removes every gadget (and its collider), projectile and area, silently. */
export function clearWorldObjects(ctx: SimContext): void {
  for (const g of ctx.state.gadgets) ctx.physics.removeGadget(g.id);
  ctx.state.gadgets.length = 0;
  ctx.state.projectiles.length = 0;
  ctx.state.areas.length = 0;
}

// NEW — the spawn event was built in two places (Sim.spawnCharacter, respawnAt); it now also
// carries the facing, so it has one definition.
/** Emits `spawn` for `e` with the facing it spawned with. */
export function emitSpawn(ctx: SimContext, e: CharacterEntity): void {
  ctx.emit({ type: 'spawn', entityId: e.id, yaw: e.yaw, pitch: e.pitch });
}

// NEW — the one respawn path of every mode (range respawns, elimination round resets;
// ADR-0011 §6); the range used to have its own copy.
/** Revives `e` at a spawn point (which becomes its spawn point) with a fresh kit: full health,
 *  both weapons full with the primary in hand, per-round ability resources; standing still,
 *  looking level along `spawnYaw` (for the rest of this tick too, whatever look its command carries:
 *  CharacterEntity.spawnTick), colliders on. Emits `spawn`. */
export function respawnAt(ctx: SimContext, e: CharacterEntity, pos: Vec3, spawnYaw: number): void {
  const yaw = withoutNegativeZero(spawnYaw);
  e.spawnPos = cloneVec3(pos);
  e.spawnYaw = yaw;
  e.spawnTick = ctx.state.tick;
  e.pos = cloneVec3(pos);
  e.prevPos = cloneVec3(pos);
  e.vel = { x: 0, y: 0, z: 0 };
  e.yaw = yaw;
  e.prevYaw = yaw;
  e.pitch = 0;
  e.prevPitch = 0;
  e.alive = true;
  e.deadTime = 0;
  e.stance = 0;
  e.prevStance = 0;
  e.sprinting = false;
  e.sinceSprint = Infinity;
  e.strideProgress = 0;
  loadOperator(ctx, e, e.operatorId);
  ctx.physics.applyStance(e.id, 0);
  ctx.physics.setActive(e.id, true);
  ctx.physics.teleport(e.id, e.pos, e.yaw);
  emitSpawn(ctx, e);
}
