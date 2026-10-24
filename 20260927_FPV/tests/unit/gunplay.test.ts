import { describe, expect, it } from 'vitest';
import { GUNPLAY } from '../../src/config/sim.ts';
import { getWeapon } from '../../src/data/content.ts';
import { clampPitch, commandLook } from '../../src/sim/command.ts';
import { recoilKick } from '../../src/sim/combat/recoil.ts';
import { sampleConeDirection, spreadAngle, type SpreadInputs } from '../../src/sim/combat/spread.ts';
import { DEG2RAD, forwardFromAngles, rightFromYaw, anglesTo } from '../../src/sim/math.ts';
import { createRng, nextRandom } from '../../src/sim/rng.ts';

const still: SpreadInputs = { ads: 0, bloom: 0, speedFraction: 0, airborne: false, stance: 0, modifier: 1 };

describe('spread', () => {
  const w = getWeapon('vesper_ar');

  it('uses hip spread at the hip and ADS spread fully aimed', () => {
    expect(spreadAngle(w, still)).toBeCloseTo(w.hipSpread);
    expect(spreadAngle(w, { ...still, ads: 1 })).toBeCloseTo(w.adsSpread);
  });

  it('grows with bloom, movement and air, shrinks when crouched, and is clamped', () => {
    const aimed = { ...still, ads: 1 };
    expect(spreadAngle(w, { ...aimed, bloom: 0.5 })).toBeCloseTo(w.adsSpread + 0.5);
    expect(spreadAngle(w, { ...aimed, speedFraction: 1 })).toBeCloseTo(w.adsSpread + w.spreadMoving);
    expect(spreadAngle(w, { ...aimed, airborne: true })).toBeCloseTo(w.adsSpread + GUNPLAY.airSpreadDeg);
    expect(spreadAngle(w, { ...aimed, stance: 1 })).toBeCloseTo(w.adsSpread * GUNPLAY.crouchSpreadMultiplier);
    expect(spreadAngle(w, { ...still, bloom: 100 })).toBe(w.maxSpread);
  });

  it('samples every direction inside the cone', () => {
    const rng = createRng(1);
    const yaw = 0.3;
    const pitch = -0.1;
    const fwd = forwardFromAngles(yaw, pitch);
    const right = rightFromYaw(yaw);
    const up = forwardFromAngles(yaw, pitch + Math.PI / 2);
    const cone = 3;
    for (let i = 0; i < 500; i++) {
      const d = sampleConeDirection(fwd, right, up, cone, nextRandom(rng), nextRandom(rng));
      const angle = Math.acos(Math.min(1, d.x * fwd.x + d.y * fwd.y + d.z * fwd.z));
      expect(angle).toBeLessThanOrEqual(cone * DEG2RAD + 1e-9);
    }
  });
});

describe('recoil pattern', () => {
  it('follows the pattern, then loops from loopFrom', () => {
    const r = { pattern: [[1, 0], [2, 0], [3, 0], [4, 0]] as const, loopFrom: 2, recovery: 1, adsMultiplier: 1, resetTime: 1 };
    const pitches = Array.from({ length: 8 }, (_, i) => recoilKick(r, i)[0]);
    expect(pitches).toEqual([1, 2, 3, 4, 3, 4, 3, 4]);
  });
});

describe('seeded RNG', () => {
  it('is deterministic per seed and uniform-ish in [0, 1)', () => {
    const a = createRng(42);
    const b = createRng(42);
    const xs = Array.from({ length: 1000 }, () => nextRandom(a));
    expect(xs).toEqual(Array.from({ length: 1000 }, () => nextRandom(b)));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(mean).toBeGreaterThan(0.45);
    expect(mean).toBeLessThan(0.55);
  });
});

describe('angle helpers', () => {
  it('anglesTo inverts forwardFromAngles', () => {
    const from = { x: 1, y: 2, z: 3 };
    const dir = forwardFromAngles(0.7, -0.2);
    const to = { x: from.x + dir.x * 10, y: from.y + dir.y * 10, z: from.z + dir.z * 10 };
    const a = anglesTo(from, to);
    expect(a.yaw).toBeCloseTo(0.7);
    expect(a.pitch).toBeCloseTo(-0.2);
  });

  it('never give a look angle of −0 (JSON writes it as 0; a recording must round-trip, ADR-0014 §3)', () => {
    // toBe compares with Object.is, which tells −0 from 0. Straight down −Z: atan2(−0, …) is −0.
    const ahead = anglesTo({ x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: -5 });
    expect(ahead.yaw).toBe(0);
    expect(ahead.pitch).toBe(0);
    expect(clampPitch(-0)).toBe(0);
    const look = commandLook({ yaw: 1, pitch: 0.5, spawnTick: 0 }, { yaw: -0, pitch: -0 }, 1);
    expect(look.yaw).toBe(0);
    expect(look.pitch).toBe(0);
  });
});
