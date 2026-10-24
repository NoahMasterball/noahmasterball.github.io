import { angleDelta, cloneVec3, copyVec3, lerp, lerpVec3, wrapAngle, type Vec3 } from './math.ts';
import type { CharacterEntity } from './types.ts';

// NEW — ADR-0014 §8: the one list of a character's interpolated values. Sim.step stores them as
// prev* (storePrevPose) and the renderer blends prev* → current; the net view (N2) blends two
// snapshots with the same list (lerpPose) and writes the result back (setPose).

/** What is drawn between two ticks: position, look, stance and the weapon's aim offset, ADS
 *  blend and swap progress. */
export interface CharacterPose {
  pos: Vec3;
  yaw: number;
  pitch: number;
  stance: number;
  recoilPitch: number;
  recoilYaw: number;
  ads: number;
  swapRemaining: number;
}

/** The pose `e` has now (copies). */
export function currentPose(e: Readonly<CharacterEntity>): CharacterPose {
  const w = e.weapon;
  return {
    pos: cloneVec3(e.pos),
    yaw: e.yaw,
    pitch: e.pitch,
    stance: e.stance,
    recoilPitch: w.recoilPitch,
    recoilYaw: w.recoilYaw,
    ads: w.ads,
    swapRemaining: w.swapRemaining,
  };
}

/** prev* = current: the start of the interpolation for the tick about to run (Sim.step 3). */
export function storePrevPose(e: CharacterEntity): void {
  const w = e.weapon;
  copyVec3(e.prevPos, e.pos);
  e.prevYaw = e.yaw;
  e.prevPitch = e.pitch;
  e.prevStance = e.stance;
  w.prevRecoilPitch = w.recoilPitch;
  w.prevRecoilYaw = w.recoilYaw;
  w.prevAds = w.ads;
  w.prevSwapRemaining = w.swapRemaining;
}

/** The pose a fraction `t` (0…1) of the way from `a` to `b`; yaw along the shorter arc. */
export function lerpPose(a: Readonly<CharacterPose>, b: Readonly<CharacterPose>, t: number): CharacterPose {
  return {
    pos: lerpVec3(a.pos, b.pos, t),
    yaw: wrapAngle(a.yaw + angleDelta(a.yaw, b.yaw) * t),
    pitch: lerp(a.pitch, b.pitch, t),
    stance: lerp(a.stance, b.stance, t),
    recoilPitch: lerp(a.recoilPitch, b.recoilPitch, t),
    recoilYaw: lerp(a.recoilYaw, b.recoilYaw, t),
    ads: lerp(a.ads, b.ads, t),
    swapRemaining: lerp(a.swapRemaining, b.swapRemaining, t),
  };
}

/** Current and prev* = `p`: `e` is drawn at `p` for any blend factor. */
export function setPose(e: CharacterEntity, p: Readonly<CharacterPose>): void {
  const w = e.weapon;
  copyVec3(e.pos, p.pos);
  e.yaw = p.yaw;
  e.pitch = p.pitch;
  e.stance = p.stance;
  w.recoilPitch = p.recoilPitch;
  w.recoilYaw = p.recoilYaw;
  w.ads = p.ads;
  w.swapRemaining = p.swapRemaining;
  storePrevPose(e);
}
