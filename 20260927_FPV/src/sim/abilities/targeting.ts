import { ABILITY_RULES, GUNPLAY } from '../../config/sim.ts';
import type { AbilityDef, EffectDef, EffectKind, EffectTargets, RadiusEffectKind } from '../../data/schema.ts';
import type { Command } from '../command.ts';
import type { SimContext } from '../context.ts';
import { bodyDistance, zoneWorldCenter } from '../hitbox.ts';
import { cloneVec3, distance, type Vec3 } from '../math.ts';
import type { ActiveModifier, CharacterEntity, EntityId, GadgetEntity } from '../types.ts';

// NEW — effect context and the only target selection of the ability framework (ADR-0012 §3.1–
// §3.2). A leaf module: the effect registry (effects.ts), the handlers (handlers.ts) and areas
// (areas.ts) all import it, never each other.

/** What applies an effect: the user directly, or one of its world objects. */
export type EffectVia = { kind: 'user' } | { kind: 'gadget' | 'projectile' | 'area'; id: EntityId };

export interface EffectContext {
  sim: SimContext;
  ability: AbilityDef;
  /** The ability's user; for a gadget, projectile or area: its owner (effects are credited to it,
   *  also after its death). */
  user: CharacterEntity;
  /** Centre of every radius: instant/hold/toggle the user's feet, a gadget's pos, a burst's
   *  point, an area's pos. */
  origin: Vec3;
  via: EffectVia;
  /** Radius multiplier: a hold ability's channel progress (channelProgress), else 1. */
  radiusScale: number;
  /** Damage/heal amount multiplier: 1 once; dt / maxDuration (hold); dt (toggle, aura). */
  amountScale: number;
  /** Re-applied every tick (hold, toggle, aura): modifiers last ABILITY_RULES.sustainSeconds. */
  sustained: boolean;
  /** The character a projectile hit: inside every radius, no line-of-sight check. */
  struck: EntityId | null;
  /** User-applied effects only (dash direction). */
  command: Command | null;
}

/** An effect handler: applies `effect` (the `index`-th effect of ctx.ability) once. */
export type Handler<K extends EffectKind> = (ctx: EffectContext, effect: Extract<EffectDef, { kind: K }>, index: number) => void;

/** A registered effect kind (HANDLERS in effects.ts). `implemented` is false while a batch has
 *  only its stub in place; isAbilitySupported reports it. */
export interface EffectHandler<K extends EffectKind> {
  readonly implemented: boolean;
  readonly apply: Handler<K>;
}

/** Optional EffectContext fields; everything else follows from the source. */
export type EffectScaling = Partial<Pick<EffectContext, 'radiusScale' | 'amountScale' | 'sustained' | 'struck' | 'command'>>;

/** An effect context with the defaults of a one-off application (scales 1, not sustained, no
 *  struck character, no command) and a copy of `origin`. */
export function effectContext(
  sim: SimContext,
  ability: AbilityDef,
  user: CharacterEntity,
  origin: Vec3,
  via: EffectVia,
  scaling: EffectScaling = {},
): EffectContext {
  return {
    sim,
    ability,
    user,
    origin: cloneVec3(origin),
    via,
    radiusScale: scaling.radiusScale ?? 1,
    amountScale: scaling.amountScale ?? 1,
    sustained: scaling.sustained ?? false,
    struck: scaling.struck ?? null,
    command: scaling.command ?? null,
  };
}

// NEW — GUNPLAY.friendlyFire was checked inline in the weapon system; bursts and areas need the
// same rule (ADR-0012 §3.2).
/** Whether damage from a member of `attackerTeam` harms something of `victimTeam` (a character,
 *  a gadget): always across teams, within a team (the attacker included) only with
 *  GUNPLAY.friendlyFire. */
export const canHarm = (attackerTeam: number, victimTeam: number): boolean => GUNPLAY.friendlyFire || attackerTeam !== victimTeam;

/** Who an effect selects: the data's EffectTargets, or `hostile` (damage and areas: enemies, plus
 *  teammates and the user only with friendly fire). */
export type TargetFilter = EffectTargets | 'hostile';

function passesFilter(user: CharacterEntity, e: CharacterEntity, filter: TargetFilter): boolean {
  switch (filter) {
    case 'self':
      return e.id === user.id;
    case 'allies':
      return e.team === user.team;
    case 'enemies':
      return e.team !== user.team;
    case 'all':
      return true;
    case 'hostile':
      return canHarm(user.team, e.team);
  }
}

/** Living characters an effect of `kind` with `radius` reaches: `filter` holds and the body
 *  (bodyDistance) is within radius × radiusScale of the origin — or it is the struck character
 *  (no radius or line-of-sight check). Kinds with ABILITY_RULES.lineOfSight also need a clear
 *  line (level geometry and barriers) from the origin, lifted by losLiftM, to the torso. */
export function affectedCharacters(ctx: EffectContext, filter: TargetFilter, radius: number, kind: RadiusEffectKind): CharacterEntity[] {
  const reach = radius * ctx.radiusScale;
  const eye = ABILITY_RULES.lineOfSight[kind] ? { ...ctx.origin, y: ctx.origin.y + ABILITY_RULES.losLiftM } : null;
  return ctx.sim.state.entities.filter((e) => {
    if (!e.alive || !passesFilter(ctx.user, e, filter)) return false;
    if (e.id === ctx.struck) return true;
    if (bodyDistance(e, ctx.origin) > reach) return false;
    return !eye || ctx.sim.query.lineOfSight(eye, zoneWorldCenter(e, 'torso'));
  });
}

/** Gadgets an effect with `radius` reaches: hostile ones (canHarm: enemy gadgets, own-team ones
 *  only with friendly fire) whose pos is within radius × radiusScale of the origin (point
 *  distance). A gadget never affects itself. */
export function affectedGadgets(ctx: EffectContext, radius: number): GadgetEntity[] {
  const reach = radius * ctx.radiusScale;
  const self = ctx.via.kind === 'gadget' ? ctx.via.id : null;
  return ctx.sim.state.gadgets.filter(
    (g) => g.id !== self && canHarm(ctx.user.team, g.team) && distance(g.pos, ctx.origin) <= reach,
  );
}

/** Adds a modifier; one from the same source refreshes it (new stats, the longer remaining time)
 *  instead of stacking (SPEC §8). Shared by the modifier effect and areas. */
export function addModifier(target: CharacterEntity, modifier: ActiveModifier): void {
  const existing = target.modifiers.find((m) => m.sourceId === modifier.sourceId);
  if (existing) {
    existing.stats = modifier.stats;
    existing.remaining = Math.max(existing.remaining, modifier.remaining);
  } else {
    target.modifiers.push(modifier);
  }
}
