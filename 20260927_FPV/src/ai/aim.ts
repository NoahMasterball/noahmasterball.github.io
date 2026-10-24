import { AI, secondsToTicks, TICK_DT, type AiTierDef } from '../config/sim.ts';
import { angleDelta, anglesTo, DEG2RAD, distance, moveTowards } from '../sim/math.ts';
import { nextRandom, randomRange, type RngState } from '../sim/rng.ts';
import { activeWeapon, weaponOf } from '../sim/stats.ts';
import { aimOf } from '../sim/systems/weapons.ts';
import type { CharacterEntity, EntityId } from '../sim/types.ts';
import type { TargetView, TargetZone } from './perception.ts';

// NEW — the bot aim model (ADR-0011 §4, SPEC §12): reaction time, an aim error that shrinks
// while tracking and grows when the target changes direction, a turn-rate limit, recoil
// compensation, head/torso choice, a fire tolerance, bursts and strafe-or-stop. Tiers change
// only the AiTierDef numbers. Pure over plain data: the bot's own character, the TargetView
// perception built, its AimState and its RNG stream — deterministic per seed. The output feeds
// the bot's Command; the sim applies the same weapons, spread and recoil as for the player.

// NEW — the per-tick form of a look speed; aiming, the brain's turns and nav steering all limit
// the look by the tier's turnRateDeg (aim and brain each had their own copy of this).
/** The largest look change (radians) a turn rate (degrees per second: AiTierDef.turnRateDeg)
 *  allows in one tick. */
export const turnStep = (turnRateDeg: number): number => turnRateDeg * DEG2RAD * TICK_DT;

/** A yaw turned from `from` towards `to` (the short way) by at most turnStep(turnRateDeg). */
export const turnTowards = (from: number, to: number, turnRateDeg: number): number =>
  from + moveTowards(0, angleDelta(from, to), turnStep(turnRateDeg));

/** Per-bot aim memory (plain data, part of the bot state). */
export interface AimState {
  /** The target the error was sampled for, and the sighting (its firstSeenTick): a new target
   *  or a new sighting re-acquires. */
  targetId: EntityId | null;
  sightingTick: number;
  zone: TargetZone;
  /** Error size (deg) and its direction inside the unit disc (x → yaw, y → pitch). */
  errorDeg: number;
  errorX: number;
  errorY: number;
  /** Tick the error direction is redrawn next (AI.combat.errorResampleSeconds). */
  resampleTick: number;
  /** Last horizontal target velocity above AI.combat.directionChangeMinSpeed (null: none). */
  refVel: { x: number; z: number } | null;
  /** Shots of the running burst, counted from the magazine; the pause ends at burstPauseUntil. */
  burstCount: number;
  burstPauseUntil: number;
  lastWeaponId: string | null;
  lastAmmo: number;
  /** The fire bit of the previous output (semi-automatics need a press edge). */
  fireHeld: boolean;
  /** Strafe direction (−1 / 1) and the tick its leg ends. */
  strafeDir: number;
  strafeUntil: number;
}

export interface AimOutput {
  /** Absolute look angles for the Command (radians). */
  yaw: number;
  pitch: number;
  /** Hold BUTTON.fire this tick (the caller still owns reload, swap and sprint rules). */
  fire: boolean;
  /** Hold BUTTON.ads (target beyond AI.combat.adsBeyondM). */
  ads: boolean;
  /** Strafe input (Command.moveX) while engaging; 0 for tiers without strafe and on stop ticks. */
  strafe: number;
  /** The tier stops to shoot and fires this tick: no movement at all. */
  stop: boolean;
  /** The reaction time since the sighting has passed: the look is being driven. */
  ready: boolean;
}

export const createAimState = (): AimState => ({
  targetId: null,
  sightingTick: 0,
  zone: 'torso',
  errorDeg: 0,
  errorX: 0,
  errorY: 0,
  resampleTick: 0,
  refVel: null,
  burstCount: 0,
  burstPauseUntil: 0,
  lastWeaponId: null,
  lastAmmo: 0,
  fireHeld: false,
  strafeDir: 1,
  strafeUntil: 0,
});

const RESAMPLE_TICKS = secondsToTicks(AI.combat.errorResampleSeconds);
const DIRECTION_CHANGE_COS = Math.cos(AI.combat.directionChangeDeg * DEG2RAD);

/** New target or new sighting: head or torso, the full tier error in a random direction. */
function acquire(aim: AimState, tier: AiTierDef, target: TargetView, tick: number, rng: RngState): void {
  aim.targetId = target.entityId;
  aim.sightingTick = target.firstSeenTick;
  aim.zone = nextRandom(rng) < tier.headChance ? 'head' : 'torso';
  aim.errorDeg = tier.aimErrorDeg;
  const a = nextRandom(rng) * 2 * Math.PI;
  aim.errorX = Math.cos(a);
  aim.errorY = Math.sin(a);
  aim.resampleTick = tick + RESAMPLE_TICKS;
  aim.refVel = null;
  aim.burstCount = 0;
  aim.burstPauseUntil = 0;
  aim.strafeDir = nextRandom(rng) < 0.5 ? -1 : 1;
  aim.strafeUntil = 0;
}

/** Tracking a visible target: the error decays to the tier floor, grows (up to the acquisition
 *  error) when the target's horizontal velocity turns by more than directionChangeDeg, and its
 *  direction is redrawn inside the unit disc every errorResampleSeconds. */
function track(aim: AimState, tier: AiTierDef, target: TargetView, tick: number, rng: RngState): void {
  aim.errorDeg = Math.max(tier.aimErrorMinDeg, aim.errorDeg * Math.exp(-tier.aimErrorDecay * TICK_DT));
  const speed = Math.hypot(target.vel.x, target.vel.z);
  if (speed >= AI.combat.directionChangeMinSpeed) {
    const ref = aim.refVel;
    if (ref && ref.x * target.vel.x + ref.z * target.vel.z < DIRECTION_CHANGE_COS * speed * Math.hypot(ref.x, ref.z)) {
      aim.errorDeg = Math.min(tier.aimErrorDeg, aim.errorDeg + tier.directionChangeErrorDeg);
    }
    aim.refVel = { x: target.vel.x, z: target.vel.z };
  }
  if (tick >= aim.resampleTick) {
    const r = Math.sqrt(nextRandom(rng));
    const a = nextRandom(rng) * 2 * Math.PI;
    aim.errorX = r * Math.cos(a);
    aim.errorY = r * Math.sin(a);
    aim.resampleTick = tick + RESAMPLE_TICKS;
  }
}

/** Counts fired shots from the magazine (the sim fires; the bot only sees its ammo drop) and
 *  pauses after burstShots beyond burstBeyondM. True while the burst pause runs. */
function burstPaused(aim: AimState, tier: AiTierDef, self: Readonly<CharacterEntity>, dist: number, tick: number): boolean {
  const carried = activeWeapon(self);
  if (aim.lastWeaponId === carried.weaponId && carried.ammo < aim.lastAmmo) aim.burstCount += aim.lastAmmo - carried.ammo;
  aim.lastWeaponId = carried.weaponId;
  aim.lastAmmo = carried.ammo;
  if (dist <= AI.combat.burstBeyondM) {
    aim.burstCount = 0;
  } else if (aim.burstCount >= tier.burstShots) {
    aim.burstCount = 0;
    aim.burstPauseUntil = tick + secondsToTicks(tier.burstPause);
  }
  return tick < aim.burstPauseUntil;
}

/** ADAD legs of random length while engaging a visible target. */
function strafeInput(aim: AimState, tick: number, rng: RngState): number {
  if (tick >= aim.strafeUntil) {
    aim.strafeDir = -aim.strafeDir;
    aim.strafeUntil = tick + secondsToTicks(randomRange(rng, AI.combat.strafeSwitchMin, AI.combat.strafeSwitchMax));
  }
  return aim.strafeDir;
}

/** One tick of aiming at `target` (null: no target — the look is left alone). `tick` is the
 *  perception clock (view.state.tick). Before the tier's reaction time since the sighting the
 *  look does not move and nothing fires. Then the look turns — at most turnRateDeg per second —
 *  towards the zone's aim point plus the aim error, minus recoilCompensation × the own recoil
 *  offset; it fires while the target is in sight and the crosshair (look + recoil) is within
 *  atan(fireToleranceM / distance) of the aim point. */
export function aimStep(aim: AimState, tier: AiTierDef, self: Readonly<CharacterEntity>, target: TargetView | null, tick: number, rng: RngState): AimOutput {
  const hold: AimOutput = { yaw: self.yaw, pitch: self.pitch, fire: false, ads: false, strafe: 0, stop: false, ready: false };
  if (!target) {
    aim.targetId = null;
    aim.fireHeld = false;
    return hold;
  }
  if (target.entityId !== aim.targetId || target.firstSeenTick !== aim.sightingTick) acquire(aim, tier, target, tick, rng);
  if (tick - target.firstSeenTick < secondsToTicks(tier.reactionTime)) {
    aim.fireHeld = false;
    return hold;
  }
  if (target.visible) track(aim, tier, target, tick, rng);

  const eye = aimOf(self).origin;
  const point = target.points[aim.zone];
  const dist = distance(eye, point);
  const base = anglesTo(eye, point);
  const err = aim.errorDeg * DEG2RAD;
  const recoil = self.weapon;
  const goalYaw = base.yaw + aim.errorX * err - tier.recoilCompensation * recoil.recoilYaw;
  const goalPitch = base.pitch + aim.errorY * err - tier.recoilCompensation * recoil.recoilPitch;

  let dYaw = angleDelta(self.yaw, goalYaw);
  let dPitch = goalPitch - self.pitch;
  const maxStep = turnStep(tier.turnRateDeg);
  const step = Math.hypot(dYaw, dPitch);
  if (step > maxStep) {
    dYaw *= maxStep / step;
    dPitch *= maxStep / step;
  }
  const yaw = self.yaw + dYaw;
  const pitch = self.pitch + dPitch;

  // The crosshair is where the shot goes: the look plus the recoil offset (ADR-0009). Like a
  // player the bot also sees its bloom (the spread its last shots added) and lets it settle, so
  // the tolerance paces taps and sprays as well.
  const gap = Math.hypot(angleDelta(base.yaw, yaw + recoil.recoilYaw) * Math.cos(base.pitch), pitch + recoil.recoilPitch - base.pitch);
  const paused = burstPaused(aim, tier, self, dist, tick);
  // fireToleranceM is meant for the torso; a smaller zone scales it down (the head: about half).
  const tolerance = tier.fireToleranceM * (target.radius[aim.zone] / target.radius.torso);
  let fire = target.visible && !paused && gap + recoil.bloom * DEG2RAD < Math.atan(tolerance / dist);
  if (fire && aim.fireHeld && weaponOf(self).fireMode === 'semi') fire = false;
  aim.fireHeld = fire;

  const stop = tier.stopToShoot && fire;
  const strafe = tier.strafe && target.visible && !stop ? strafeInput(aim, tick, rng) : 0;
  return { yaw, pitch, fire, ads: dist > AI.combat.adsBeyondM, strafe, stop, ready: true };
}
