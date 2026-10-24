import type { HitZone, WeaponDef } from '../../data/schema.ts';

// NEW — the damage pipeline (SPEC §6) and time-to-kill maths. Single implementation shared by
// the simulation (actual hits) and the balance tool (TTK matrix, power budget).

type FalloffFields = Pick<WeaponDef, 'damage' | 'falloff'>;

/** Per-pellet torso damage at a distance: flat to `start`, linear to `minDamage` at `end`, flat after. */
export function falloffDamage(w: FalloffFields, distance: number): number {
  const { start, end, minDamage } = w.falloff;
  if (distance <= start) return w.damage;
  if (distance >= end) return minDamage;
  const t = (distance - start) / (end - start);
  return w.damage + (minDamage - w.damage) * t;
}

export function zoneMultiplier(w: Pick<WeaponDef, 'headshotMultiplier' | 'limbMultiplier'>, zone: HitZone): number {
  switch (zone) {
    case 'head':
      return w.headshotMultiplier;
    case 'torso':
      return 1;
    case 'limb':
      return w.limbMultiplier;
  }
}

// NEW — ADR-0012 §3.3: ability damage is mitigated like bullets; the rule was inline in
// pelletDamage.
/** Damage a victim takes from `amount`: × (1 − armour) × its damage-taken modifiers (the one
 *  mitigation rule for bullets and abilities; shields absorb what is left, then health). */
export const mitigatedDamage = (amount: number, armour: number, damageTakenMultiplier = 1): number =>
  amount * (1 - armour) * damageTakenMultiplier;

/**
 * Damage one pellet deals: falloff × zone, mitigated (mitigatedDamage).
 * `damageTakenMultiplier` is the product of the victim's active modifiers (1 = none).
 */
export function pelletDamage(
  w: FalloffFields & Pick<WeaponDef, 'headshotMultiplier' | 'limbMultiplier'>,
  zone: HitZone,
  distance: number,
  armour: number,
  damageTakenMultiplier = 1,
): number {
  return mitigatedDamage(falloffDamage(w, distance) * zoneMultiplier(w, zone), armour, damageTakenMultiplier);
}

/** Shots needed to deal `health` damage at `damagePerShot` (Infinity if no damage). */
export function shotsToKill(damagePerShot: number, health: number): number {
  if (damagePerShot <= 0) return Infinity;
  // Epsilon guards against float noise turning an exact kill (e.g. 4 × 25 = 100) into one more shot.
  return Math.max(1, Math.ceil(health / damagePerShot - 1e-9));
}

export const shotInterval = (w: Pick<WeaponDef, 'rpm'>): number => 60 / w.rpm;

/**
 * Seconds from the first shot to the killing shot. The attacker starts with a full magazine;
 * when it runs dry, the reload starts immediately and replaces the shot interval.
 * Semi-automatic weapons are assumed to be fired at their cyclic cap.
 */
export function timeToKill(w: Pick<WeaponDef, 'rpm' | 'magazine' | 'reloadTime'>, shots: number): number {
  if (!Number.isFinite(shots)) return Infinity;
  const reloads = Math.ceil(shots / w.magazine) - 1;
  return (shots - 1 - reloads) * shotInterval(w) + reloads * w.reloadTime;
}

export interface TtkResult {
  shots: number;
  seconds: number;
}

/** TTK for every shot landing in `zone` at `distance` with all pellets hitting. */
export function ttk(w: WeaponDef, target: { maxHealth: number; armour: number }, zone: HitZone, distance: number): TtkResult {
  const perShot = pelletDamage(w, zone, distance, target.armour) * w.pellets;
  const shots = shotsToKill(perShot, target.maxHealth);
  return { shots, seconds: timeToKill(w, shots) };
}
