import { ABILITY_RULES, isTimeUp } from '../../config/sim.ts';
import { getAbility } from '../../data/content.ts';
import type { EffectDef } from '../../data/schema.ts';
import { mitigatedDamage } from '../combat/damage.ts';
import { allocateId, ownerOf, type SimContext } from '../context.ts';
import { zoneWorldCenter } from '../hitbox.ts';
import { cloneVec3, distance, type Vec3 } from '../math.ts';
import { damageTakenMultiplier, operatorOf } from '../stats.ts';
import { applyDamage } from '../systems/health.ts';
import type { AreaEntity, CharacterEntity } from '../types.ts';
import { addModifier, affectedCharacters, effectContext, type EffectContext } from './targeting.ts';

// NEW — lasting areas (areaDenial, ADR-0012 §3.3): an AreaEntity in SimState.areas on the ground;
// radius, damage per second, stats and duration come from its effect in data (abilityId +
// effectIndex, never copied). Also the one ability-damage path to a character, shared by the
// damage effect (handlers.ts) and area ticks — it lives here because handlers.ts imports this
// module (spawnArea), not the other way round.

type AreaDenialDef = Extract<EffectDef, { kind: 'areaDenial' }>;

/** The areaDenial effect an area (or an area about to spawn) stands for, from data. The client
 *  draws its radius from it too. */
export function areaEffectOf(area: Pick<AreaEntity, 'abilityId' | 'effectIndex'>): AreaDenialDef {
  const effect = getAbility(area.abilityId).effects[area.effectIndex];
  if (effect?.kind !== 'areaDenial') {
    throw new Error(`Effect ${area.effectIndex} of ability '${area.abilityId}' is not an areaDenial effect`);
  }
  return effect;
}

/** Deals an ability's `amount` (before mitigation) to `victim`: mitigatedDamage with its armour
 *  and damage-taken modifiers, then applyDamage (shields, health) on the torso, credited to
 *  `attacker` with cause `ability`, coming from `sourcePos`. */
export function applyAbilityDamage(ctx: SimContext, attacker: CharacterEntity, victim: CharacterEntity, amount: number, abilityId: string, sourcePos: Vec3): void {
  const point = zoneWorldCenter(victim, 'torso');
  applyDamage(ctx, attacker, victim, {
    amount: mitigatedDamage(amount, operatorOf(victim).armour, damageTakenMultiplier(victim)),
    zone: 'torso',
    point,
    distance: distance(sourcePos, point),
    cause: { kind: 'ability', abilityId },
    sourcePos,
  });
}

/** Spawns the area of the `effectIndex`-th effect of ctx.ability (an areaDenial) on the first
 *  level surface within ABILITY_RULES.area.maxDropM below ctx.origin (SimQuery.groundBelow), else
 *  at the origin; id from allocateId, owner/team from ctx.user, remaining = the effect's duration. */
export function spawnArea(ctx: EffectContext, effectIndex: number): void {
  const effect = areaEffectOf({ abilityId: ctx.ability.id, effectIndex });
  const state = ctx.sim.state;
  const ground = ctx.sim.query.groundBelow(ctx.origin, ABILITY_RULES.area.maxDropM);
  state.areas.push({
    id: allocateId(state),
    kind: 'area',
    abilityId: ctx.ability.id,
    effectIndex,
    ownerId: ctx.user.id,
    team: ctx.user.team,
    pos: ground === null ? cloneVec3(ctx.origin) : { x: ctx.origin.x, y: ground, z: ctx.origin.z },
    remaining: effect.duration,
  });
}

/** One tick of one area on the hostile characters inside it. */
function tickArea(ctx: SimContext, area: AreaEntity, dt: number): void {
  const effect = areaEffectOf(area);
  const owner = ownerOf(ctx.state, area);
  const ectx = effectContext(ctx, getAbility(area.abilityId), owner, area.pos, { kind: 'area', id: area.id }, { amountScale: dt, sustained: true });
  const amount = effect.damagePerSecond * ectx.amountScale;
  const slows = Object.keys(effect.stats).length > 0;
  for (const target of affectedCharacters(ectx, 'hostile', effect.radius, 'areaDenial')) {
    // Refreshed while inside, lapses ABILITY_RULES.sustainSeconds after leaving; the ability id as
    // source keeps overlapping areas of one ability from stacking (SPEC §8).
    if (slows) addModifier(target, { sourceId: area.abilityId, stats: effect.stats, remaining: ABILITY_RULES.sustainSeconds });
    if (amount > 0) applyAbilityDamage(ctx, owner, target, amount, area.abilityId, area.pos);
  }
}

/** Step 6 of Sim.step: per area (in id order), hostile characters inside (affectedCharacters, line
 *  of sight on) take damagePerSecond × dt via applyDamage (attacker = owner, cause ability) and
 *  get the effect's stats as a modifier (sourceId = ability id, remaining =
 *  ABILITY_RULES.sustainSeconds, addModifier); then remaining -= dt, and the area is removed once
 *  its time is up (isTimeUp) — it acts on exactly secondsToTicks(duration) ticks, so it deals
 *  exactly damagePerSecond per second of its duration. */
export function areaSystem(ctx: SimContext, dt: number): void {
  const areas = ctx.state.areas;
  for (const area of areas) {
    tickArea(ctx, area, dt);
    area.remaining -= dt;
  }
  // In place, so readers holding the list see the removal.
  for (let i = areas.length - 1; i >= 0; i--) {
    const area = areas[i];
    if (area && isTimeUp(area.remaining)) areas.splice(i, 1);
  }
}
