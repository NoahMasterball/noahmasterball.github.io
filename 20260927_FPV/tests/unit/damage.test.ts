import { describe, expect, it } from 'vitest';
import type { WeaponDef } from '../../src/data/schema.ts';
import { getWeapon } from '../../src/data/content.ts';
import {
  falloffDamage,
  pelletDamage,
  shotInterval,
  shotsToKill,
  timeToKill,
  ttk,
  zoneMultiplier,
} from '../../src/sim/combat/damage.ts';

// Synthetic weapon so the expectations do not change when balance data is tuned.
const RIFLE: WeaponDef = {
  ...getWeapon('vesper_ar'),
  damage: 40,
  falloff: { start: 10, end: 30, minDamage: 20 },
  pellets: 1,
  rpm: 600, // 0.1 s interval
  magazine: 3,
  reloadTime: 2,
  headshotMultiplier: 2,
  limbMultiplier: 0.5,
};

describe('damage falloff', () => {
  it('is flat up to the start range', () => {
    expect(falloffDamage(RIFLE, 0)).toBe(40);
    expect(falloffDamage(RIFLE, 10)).toBe(40);
  });

  it('drops linearly between start and end', () => {
    expect(falloffDamage(RIFLE, 20)).toBeCloseTo(30);
    expect(falloffDamage(RIFLE, 25)).toBeCloseTo(25);
  });

  it('is flat at minDamage from the end range on', () => {
    expect(falloffDamage(RIFLE, 30)).toBe(20);
    expect(falloffDamage(RIFLE, 500)).toBe(20);
  });

  it('never increases with distance for any shipped weapon', () => {
    for (const id of ['anvil_lmg', 'hornet_smg', 'maul_sg', 'longreed_dmr']) {
      const w = getWeapon(id);
      let last = Infinity;
      for (let d = 0; d <= 100; d += 0.5) {
        const dmg = falloffDamage(w, d);
        expect(dmg).toBeLessThanOrEqual(last);
        last = dmg;
      }
    }
  });
});

describe('damage pipeline', () => {
  it('applies zone multipliers', () => {
    expect(zoneMultiplier(RIFLE, 'head')).toBe(2);
    expect(zoneMultiplier(RIFLE, 'torso')).toBe(1);
    expect(zoneMultiplier(RIFLE, 'limb')).toBe(0.5);
  });

  it('applies armour and damage-taken modifiers after the zone', () => {
    // 40 × 2 (head) × (1 − 0.25) × 0.5 = 30
    expect(pelletDamage(RIFLE, 'head', 5, 0.25, 0.5)).toBeCloseTo(30);
    expect(pelletDamage(RIFLE, 'torso', 20, 0)).toBeCloseTo(30);
  });
});

describe('shots to kill', () => {
  it('rounds up and treats exact kills exactly', () => {
    expect(shotsToKill(25, 100)).toBe(4);
    expect(shotsToKill(0.1 + 0.2, 0.3)).toBe(1); // float noise must not add a shot
    expect(shotsToKill(33, 100)).toBe(4);
    expect(shotsToKill(150, 100)).toBe(1);
  });

  it('is infinite without damage', () => {
    expect(shotsToKill(0, 100)).toBe(Infinity);
  });
});

describe('time to kill', () => {
  it('counts intervals between shots, not the first shot', () => {
    expect(shotInterval(RIFLE)).toBeCloseTo(0.1);
    expect(timeToKill(RIFLE, 1)).toBe(0);
    expect(timeToKill(RIFLE, 3)).toBeCloseTo(0.2);
  });

  it('replaces the interval with the reload when the magazine runs dry', () => {
    // mag 3: shots 1-3 (2 intervals), reload, shots 4-5 (1 interval) → 3 × 0.1 + 2
    expect(timeToKill(RIFLE, 5)).toBeCloseTo(2.3);
    // 7 shots: 3 + 3 + 1 → two reloads, 4 intervals
    expect(timeToKill(RIFLE, 7)).toBeCloseTo(4.4);
  });

  it('combines everything in ttk()', () => {
    const target = { maxHealth: 100, armour: 0 };
    expect(ttk(RIFLE, target, 'torso', 5)).toEqual({ shots: 3, seconds: expect.closeTo(0.2) });
    expect(ttk(RIFLE, target, 'head', 5)).toEqual({ shots: 2, seconds: expect.closeTo(0.1) });
    // armour 0.5 at 30 m: 20 × 0.5 = 10 per shot → 10 shots → 3 reloads, 6 intervals
    expect(ttk(RIFLE, { maxHealth: 100, armour: 0.5 }, 'torso', 30).shots).toBe(10);
    expect(ttk(RIFLE, { maxHealth: 100, armour: 0.5 }, 'torso', 30).seconds).toBeCloseTo(6.6);
  });

  it('multiplies pellets for shotguns', () => {
    const shotgun = { ...RIFLE, pellets: 5, damage: 10, falloff: { start: 5, end: 10, minDamage: 2 } };
    expect(ttk(shotgun, { maxHealth: 100, armour: 0 }, 'torso', 1).shots).toBe(2);
  });
});
