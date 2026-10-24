// NEW — minimal vector/angle helpers for the simulation (Three.js is off-limits here, ADR-0003).
// Conventions match Three.js so the client can use sim values directly: Y up, yaw rotates
// about +Y (counter-clockwise seen from above), yaw 0 looks down −Z, positive pitch looks up,
// Euler order YXZ.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export const DEG2RAD = Math.PI / 180;

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const fromTuple = (t: readonly [number, number, number]): Vec3 => ({ x: t[0], y: t[1], z: t[2] });
export const cloneVec3 = (v: Vec3): Vec3 => ({ x: v.x, y: v.y, z: v.z });

export function copyVec3(out: Vec3, v: Vec3): Vec3 {
  out.x = v.x;
  out.y = v.y;
  out.z = v.z;
  return out;
}

export const distance = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z);
  return len > 0 ? { x: v.x / len, y: v.y / len, z: v.z / len } : { x: 0, y: 0, z: 0 };
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// NEW — ease-in-out curve (first used by the view-model weapon swap); none existed before.
/** Hermite ease 0…1 → 0…1 with zero slope at both ends (input clamped). */
export function smoothstep(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

export function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) };
}

/** Moves `current` towards `target` by at most `maxDelta`. */
export function moveTowards(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

/** View direction for yaw/pitch (radians). */
export function forwardFromAngles(yaw: number, pitch: number): Vec3 {
  const cp = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}

// NEW — ADR-0014 §3: a recording must JSON round-trip exactly, but JSON writes −0 as 0, and atan2,
// min/max and negation pass −0 on; nothing turned it into 0.
/** `a` with −0 replaced by 0 (every other value unchanged): for angles the simulation stores or
 *  puts into commands. */
export const withoutNegativeZero = (a: number): number => (a === 0 ? 0 : a);

/** Inverse of forwardFromAngles: yaw/pitch that look from `from` towards `to` (never −0). */
export function anglesTo(from: Vec3, to: Vec3): { yaw: number; pitch: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  return { yaw: withoutNegativeZero(Math.atan2(-dx, -dz)), pitch: withoutNegativeZero(Math.atan2(dy, Math.hypot(dx, dz))) };
}

// NEW — angle wrapping (bot FOV checks and turn-rate limits, ADR-0011 §2/§4); none existed.
const TWO_PI = 2 * Math.PI;

/** An angle in radians wrapped to (−π, π]. */
export function wrapAngle(a: number): number {
  const t = (((a + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI; // [0, 2π)
  return t === 0 ? Math.PI : t - Math.PI;
}

/** Signed shortest rotation from angle `from` to angle `to`, in (−π, π]. */
export const angleDelta = (from: number, to: number): number => wrapAngle(to - from);

/** Horizontal right vector for a yaw. */
export const rightFromYaw = (yaw: number): Vec3 => ({ x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) });

/** Rotates a local offset about +Y by `yaw` (same as a Three.js object with rotation.y = yaw). */
export function rotateY(v: Vec3, yaw: number): Vec3 {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: v.x * c + v.z * s, y: v.y, z: -v.x * s + v.z * c };
}

/** Quaternion for Euler angles in radians, order YXZ (identical to THREE.Quaternion.setFromEuler). */
export function quatFromEulerYXZ(x: number, y: number, z: number): Quat {
  const c1 = Math.cos(x / 2);
  const c2 = Math.cos(y / 2);
  const c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2);
  const s2 = Math.sin(y / 2);
  const s3 = Math.sin(z / 2);
  return {
    x: s1 * c2 * c3 + c1 * s2 * s3,
    y: c1 * s2 * c3 - s1 * c2 * s3,
    z: c1 * c2 * s3 - s1 * s2 * c3,
    w: c1 * c2 * c3 + s1 * s2 * s3,
  };
}

export const quatFromYaw = (yaw: number): Quat => quatFromEulerYXZ(0, yaw, 0);

/** Quaternion for a data rotation given in degrees (level boxes). */
export function quatFromDegrees(deg: readonly [number, number, number] | undefined): Quat {
  if (!deg) return { x: 0, y: 0, z: 0, w: 1 };
  return quatFromEulerYXZ(deg[0] * DEG2RAD, deg[1] * DEG2RAD, deg[2] * DEG2RAD);
}
