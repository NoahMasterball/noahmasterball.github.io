import { GUNPLAY } from '../../config/sim.ts';
import type { WeaponDef } from '../../data/schema.ts';
import { clamp, DEG2RAD, lerp, normalize, type Vec3 } from '../math.ts';

// NEW — spread model (SPEC §6): the cone the next shot is sampled from.

export interface SpreadInputs {
  /** 0 hip … 1 fully aimed. */
  ads: number;
  /** Accumulated bloom, degrees. */
  bloom: number;
  /** Horizontal speed / operator move speed, clamped 0…1. */
  speedFraction: number;
  airborne: boolean;
  /** 0 standing … 1 crouched. */
  stance: number;
  /** Product of active `spread` modifiers. */
  modifier: number;
}

/** Cone half-angle in degrees. */
export function spreadAngle(w: WeaponDef, s: SpreadInputs): number {
  const base = lerp(w.hipSpread, w.adsSpread, s.ads);
  const raw = base + s.bloom + w.spreadMoving * clamp(s.speedFraction, 0, 1) + (s.airborne ? GUNPLAY.airSpreadDeg : 0);
  const stanceScale = lerp(1, GUNPLAY.crouchSpreadMultiplier, s.stance);
  return Math.min(w.maxSpread, raw * stanceScale * s.modifier);
}

/**
 * Direction uniformly distributed inside a cone around `forward`.
 * `u`, `v` are uniform [0,1) samples from the simulation RNG (deterministic).
 */
export function sampleConeDirection(forward: Vec3, right: Vec3, up: Vec3, coneDeg: number, u: number, v: number): Vec3 {
  const r = Math.tan(coneDeg * DEG2RAD) * Math.sqrt(u);
  const theta = 2 * Math.PI * v;
  const dx = r * Math.cos(theta);
  const dy = r * Math.sin(theta);
  return normalize({
    x: forward.x + right.x * dx + up.x * dy,
    y: forward.y + right.y * dx + up.y * dy,
    z: forward.z + right.z * dx + up.z * dy,
  });
}
