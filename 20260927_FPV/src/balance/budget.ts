import { BUDGET } from '../data/budget.ts';
import { getAbility, getHitboxProfile, getWeapon, loadoutWeapon } from '../data/content.ts';
import type { OperatorDef, WeaponDef } from '../data/schema.ts';
import { pelletDamage, shotInterval } from '../sim/combat/damage.ts';
import { shapeFrontalArea } from '../sim/hitbox.ts';
import { DEG2RAD } from '../sim/math.ts';

// NEW — power-budget model (SPEC §9.1). Formulas only; every weight/reference is data
// (src/data/budget.ts). Heuristic by design — playtests correct the weights.

/** Frontal area of a hitbox profile (overlaps ignored), m². */
export function frontalArea(profileId: string): number {
  return getHitboxProfile(profileId).parts.reduce((sum, p) => sum + shapeFrontalArea(p.shape), 0);
}

/** How much easier a profile is to hit than the reference profile (1 = same). */
export const exposure = (profileId: string): number => frontalArea(profileId) / frontalArea(BUDGET.reference.hitboxProfile);

export const effectiveHp = (maxHealth: number, armour: number, profileId: string): number =>
  maxHealth / (1 - armour) / exposure(profileId);

/** Chance that a shot sampled uniformly in a cone lands on a disc of `radius` at `distance`. */
export function hitProbability(coneDeg: number, distance: number, radius: number): number {
  const spreadRadius = distance * Math.tan(coneDeg * DEG2RAD);
  return spreadRadius <= radius ? 1 : (radius / spreadRadius) ** 2;
}

/**
 * Expected torso TTK (seconds, continuous) of an aimed, stationary attacker against the
 * reference target: hit probability from ADS spread plus average bloom over the burst.
 */
export function expectedTtk(w: WeaponDef, distance: number): number {
  const ref = BUDGET.reference;
  const perPellet = pelletDamage(w, 'torso', distance, ref.armour);
  const shotsAt = (cone: number): number =>
    ref.maxHealth / (perPellet * w.pellets * hitProbability(cone, distance, BUDGET.hitProbabilityTargetRadius));
  const firstGuess = shotsAt(w.adsSpread);
  const cone = Math.min(w.maxSpread, w.adsSpread + (w.spreadPerShot * Math.max(0, firstGuess - 1)) / 2);
  const shots = Math.max(1, shotsAt(cone));
  const reloads = Math.max(0, Math.ceil(shots / w.magazine) - 1);
  return (shots - 1 - reloads) * shotInterval(w) + reloads * w.reloadTime;
}

export interface BudgetBreakdown {
  operatorId: string;
  survivability: number;
  mobility: number;
  firepower: number;
  utility: number;
  total: number;
  effectiveHp: number;
  exposure: number;
}

const relative = (value: number, reference: number): number => value / reference - 1;

export function operatorBudget(op: OperatorDef): BudgetBreakdown {
  const ref = BUDGET.reference;
  const W = BUDGET.weights;
  const refWeapon = getWeapon(ref.weaponId);
  const weapon = loadoutWeapon(op, 'primary');

  const ehp = effectiveHp(op.maxHealth, op.armour, op.hitboxProfile);
  const survivability = W.survivability * relative(ehp, effectiveHp(ref.maxHealth, ref.armour, ref.hitboxProfile));

  const mobility =
    W.moveSpeed * relative(op.moveSpeed * weapon.moveSpeedModifier, ref.moveSpeed * refWeapon.moveSpeedModifier) +
    W.sprintMultiplier * relative(op.sprintMultiplier, ref.sprintMultiplier) +
    W.acceleration * relative(op.acceleration, ref.acceleration) +
    W.jumpHeight * relative(op.jumpHeight, ref.jumpHeight) +
    W.adsMovePenalty * relative(op.adsMovePenalty, ref.adsMovePenalty);

  const engagement = (w: WeaponDef, d: number): number => BUDGET.acquisitionTime + expectedTtk(w, d);
  const ratios = BUDGET.firepowerRanges.map((d) => engagement(refWeapon, d) / engagement(weapon, d) - 1);
  const firepower = W.firepower * (ratios.reduce((a, b) => a + b, 0) / ratios.length);

  const utility = op.abilities.reduce((sum, id) => sum + getAbility(id).budgetCost, 0);

  return {
    operatorId: op.id,
    survivability,
    mobility,
    firepower,
    utility,
    total: survivability + mobility + firepower + utility,
    effectiveHp: ehp,
    exposure: exposure(op.hitboxProfile),
  };
}

export type BudgetStatus = 'ok' | 'over' | 'under';

export function budgetStatus(total: number): BudgetStatus {
  if (total > BUDGET.target + BUDGET.tolerance) return 'over';
  if (total < BUDGET.target - BUDGET.tolerance) return 'under';
  return 'ok';
}
