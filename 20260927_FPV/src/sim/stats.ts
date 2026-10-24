import { GUNPLAY, MOVEMENT } from '../config/sim.ts';
import { getAbility, getOperator, getWeapon } from '../data/content.ts';
import type { ModifiableStat, OperatorDef, WeaponDef } from '../data/schema.ts';
import { spreadAngle } from './combat/spread.ts';
import { lerp } from './math.ts';
import type { AbilityState, CarriedWeapon, CharacterEntity, EntityId, SimState } from './types.ts';

// NEW — effective (derived) stats: operator × weapon × active modifiers. Computed on demand
// here and nowhere else (ADR-0004); never stored in state.

export const operatorOf = (e: CharacterEntity): OperatorDef => getOperator(e.operatorId);

/** The carried weapon in the active slot (ammo and reserve of the weapon in hand). */
export function activeWeapon(e: CharacterEntity): CarriedWeapon {
  const carried = e.weapons[e.activeSlot];
  if (!carried) throw new Error(`Character ${e.id} has no weapon in slot ${e.activeSlot}`);
  return carried;
}

export const weaponOf = (e: CharacterEntity): WeaponDef => getWeapon(activeWeapon(e).weaponId);

/** 0…1 through a weapon swap for the given remaining swap time, null when not swapping. */
export const swapProgress = (remaining: number): number | null =>
  remaining > 0 ? 1 - remaining / GUNPLAY.weaponSwapSeconds : null;

// NEW — ADR-0012 §1.3: a channel or a placement takes the hands off the weapon (toggles never do:
// Cairn fires while mounted).
/** The ability activity that blocks the weapon now, or null: while one runs the weapon does not
 *  fire, aim, reload or swap (weaponSystem) and the view model lowers it. */
export function weaponBlockedBy(e: Pick<CharacterEntity, 'abilities'>): 'channel' | 'placing' | null {
  for (const slot of e.abilities) {
    const kind = slot.active?.kind;
    if (kind === 'channel' || kind === 'placing') return kind;
  }
  return null;
}

// NEW — the fire-block rule was an inline expression in weaponSystem; exported so the client and
// bots can read every block (swap, sprint, sprint-out, reload, ability), not just the sprint pose.
/** Whether the weapon in hand is up and may fire: not swapping, sprinting, within the sprint-out
 *  time (GUNPLAY.sprintOutTime), reloading or blocked by an ability (weaponBlockedBy). Ammo and
 *  the fire cadence are separate checks. */
export function canFire(e: CharacterEntity): boolean {
  const ws = e.weapon;
  return (
    ws.swapRemaining <= 0 &&
    !e.sprinting &&
    e.sinceSprint >= GUNPLAY.sprintOutTime &&
    ws.reloadRemaining <= 0 &&
    weaponBlockedBy(e) === null
  );
}

// NEW — derived ability values (ADR-0012 §1–§4) for the sim, the HUD and bots; never stored.

/** 0…1 through a hold ability's channel (its effect radius scale), null when the slot is not
 *  channelling. */
export function channelProgress(slot: Readonly<AbilityState>): number | null {
  if (slot.active?.kind !== 'channel') return null;
  const activation = getAbility(slot.abilityId).activation;
  if (activation.kind !== 'hold') throw new Error(`Ability '${slot.abilityId}' channels but is not a hold ability`);
  return Math.min(1, slot.active.elapsed / activation.maxDuration);
}

/** Gadgets of `abilityId` that `ownerId` has in the world (placeable maxActive, HUD, bots). */
export const gadgetCount = (state: Readonly<Pick<SimState, 'gadgets'>>, ownerId: EntityId, abilityId: string): number =>
  state.gadgets.filter((g) => g.ownerId === ownerId && g.abilityId === abilityId).length;

/** Whether `e` is revealed to `team` now (reveal effects). */
export const isRevealedTo = (e: Pick<CharacterEntity, 'reveals'>, team: number): boolean =>
  e.reveals.some((r) => r.team === team && r.remaining > 0);

/** Temporary HP from all active shields. */
export const shieldAmount = (e: Pick<CharacterEntity, 'shields'>): number => e.shields.reduce((sum, s) => sum + s.amount, 0);

/** Product of all active modifiers for a stat (1 = unmodified). */
export function modifierProduct(e: CharacterEntity, stat: ModifiableStat): number {
  let product = 1;
  for (const m of e.modifiers) product *= m.stats[stat] ?? 1;
  return product;
}

/** Top horizontal speed for the entity's current stance, sprint and ADS state. */
export function topSpeed(e: CharacterEntity): number {
  const op = operatorOf(e);
  const standing = op.moveSpeed * (e.sprinting ? op.sprintMultiplier : 1);
  const base = lerp(standing, op.crouchSpeed, e.stance);
  const ads = lerp(1, op.adsMovePenalty, e.weapon.ads);
  return base * ads * weaponOf(e).moveSpeedModifier * modifierProduct(e, 'moveSpeed');
}

/** Cone half-angle (degrees) the next shot is sampled from (SPEC §6 spread model). */
export function currentSpread(e: CharacterEntity, w: WeaponDef = weaponOf(e)): number {
  const reference = operatorOf(e).moveSpeed;
  return spreadAngle(w, {
    ads: e.weapon.ads,
    bloom: e.weapon.bloom,
    speedFraction: reference > 0 ? Math.hypot(e.vel.x, e.vel.z) / reference : 0,
    airborne: !e.grounded,
    stance: e.stance,
    modifier: modifierProduct(e, 'spread'),
  });
}

// NEW — footstep loudness (ADR-0011 §2): bot hearing radius and footstep audio volume.
/** Loudness of the character's next footstep: 1 = a standing walk (MOVEMENT.footsteps). */
export function footstepLoudness(e: CharacterEntity): number {
  const f = MOVEMENT.footsteps;
  return modifierProduct(e, 'footstepVolume') * (e.sprinting ? f.sprintLoudness : 1) * lerp(1, f.crouchLoudness, e.stance);
}

/** Product of the victim's damage-taken modifiers (armour is applied with it in mitigatedDamage). */
export const damageTakenMultiplier = (e: CharacterEntity): number => modifierProduct(e, 'damageTaken');
