import type { HitZone } from '../../data/schema.ts';
import { endAllActivities } from '../abilities/interrupt.ts';
import type { SimContext } from '../context.ts';
import { cloneVec3, type Vec3 } from '../math.ts';
import type { CharacterEntity, DamageCause } from '../types.ts';

// NEW — damage application and death. Damage amounts come from the combat pipeline
// (src/sim/combat/damage.ts: falloff, zone, mitigation); this applies them to shields, then
// health (ADR-0012 §3.3), and emits events. Bullets and abilities share it.

export interface DamageInfo {
  /** Mitigated damage (armour and damage-taken modifiers applied: mitigatedDamage). */
  amount: number;
  zone: HitZone;
  point: Vec3;
  distance: number;
  cause: DamageCause;
  /** Where the damage came from: a shot's ray origin at fire time, an ability effect's origin. */
  sourcePos: Vec3;
}

/** Lets `victim`'s shields absorb up to `amount`, the one expiring soonest first; a shield
 *  absorbed to 0 is removed (`shieldBroken`). Returns the amount absorbed. */
function absorbWithShields(ctx: SimContext, victim: CharacterEntity, amount: number): number {
  let rest = amount;
  for (const shield of [...victim.shields].sort((a, b) => a.remaining - b.remaining)) {
    if (rest <= 0) break;
    const taken = Math.min(shield.amount, rest);
    shield.amount -= taken;
    rest -= taken;
    if (shield.amount <= 0) ctx.emit({ type: 'shieldBroken', entityId: victim.id, abilityId: shield.sourceId });
  }
  victim.shields = victim.shields.filter((s) => s.amount > 0);
  return amount - rest;
}

export function applyDamage(ctx: SimContext, attacker: CharacterEntity, victim: CharacterEntity, d: DamageInfo): void {
  if (!victim.alive) return;
  const absorbed = absorbWithShields(ctx, victim, d.amount);
  victim.health = Math.max(0, victim.health - (d.amount - absorbed));
  const killed = victim.health <= 0;
  ctx.emit({
    type: 'hit',
    attackerId: attacker.id,
    victimId: victim.id,
    zone: d.zone,
    damage: d.amount,
    distance: d.distance,
    point: d.point,
    // A copy: the shot event (and every other victim of the same shot) carries the same origin.
    sourcePos: cloneVec3(d.sourcePos),
    killed,
    cause: { ...d.cause },
    absorbed,
  });
  if (!killed) return;
  victim.alive = false;
  victim.deadTime = 0;
  victim.dash = null;
  victim.shields = [];
  victim.reveals = [];
  endAllActivities(ctx, victim, 'died');
  ctx.physics.setActive(victim.id, false);
  ctx.emit({ type: 'kill', attackerId: attacker.id, victimId: victim.id, cause: { ...d.cause }, headshot: d.zone === 'head' });
}
