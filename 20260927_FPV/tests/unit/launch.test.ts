import { describe, expect, it } from 'vitest';
import { defaultSeed, launchSearch, levelsForMode, readLaunchOptions } from '../../src/client/launch.ts';
import { LAUNCH, shotLaunch, SHOTS } from '../../src/config/client.ts';
import { AI_TIERS } from '../../src/config/sim.ts';
import { LEVELS } from '../../src/data/content.ts';
import { MODE_IDS, MODES } from '../../src/sim/modes/index.ts';

// Launch options from the page URL (src/client/launch.ts, ADR-0011 §7): defaults per mode,
// explicit values, and a visible error — never a silent fallback — for anything that names nothing.

const FALLBACK = { tier: AI_TIERS[0], seed: 1234 } as const;
const read = (search: string) => readLaunchOptions(search, FALLBACK);
const P = LAUNCH.params;

describe('readLaunchOptions', () => {
  it('uses the default mode, its default level and the fallback tier and seed without parameters', () => {
    const o = read('');
    expect(o.mode).toBe(LAUNCH.defaultMode);
    expect(o.level.id).toBe(LAUNCH.defaultLevel[LAUNCH.defaultMode]);
    expect(o.tier).toBe(FALLBACK.tier);
    expect(o.seed).toBe(FALLBACK.seed);
  });

  it('every mode has a default level that can host it', () => {
    for (const mode of MODE_IDS) {
      expect(read(`?${P.mode}=${mode}`).level.id, mode).toBe(LAUNCH.defaultLevel[mode]);
    }
  });

  it('reads explicit mode, level, tier and seed', () => {
    const tier = AI_TIERS[AI_TIERS.length - 1];
    const o = read(`?${P.mode}=range&${P.level}=saltworks&${P.tier}=${tier}&${P.seed}=42`);
    expect([o.mode, o.level.id, o.tier, o.seed]).toEqual(['range', 'saltworks', tier, 42]);
  });

  it('round-trips through launchSearch', () => {
    const o = readLaunchOptions(launchSearch({ mode: 'elimination', levelId: 'saltworks', tier: 'hard', seed: 0xffff_ffff }), FALLBACK);
    expect([o.mode, o.level.id, o.tier, o.seed]).toEqual(['elimination', 'saltworks', 'hard', 0xffff_ffff]);
  });

  it.each([
    [`?${P.mode}=deathmatch`, /'mode=deathmatch' names no mode/],
    [`?${P.level}=moon`, /'level=moon' names no level/],
    [`?${P.tier}=nightmare`, /'tier=nightmare' names no bot difficulty/],
    [`?${P.seed}=abc`, /'seed=abc' is not a whole number/],
    [`?${P.seed}=-1`, /'seed=-1' is not a whole number/],
    [`?${P.seed}=1.5`, /'seed=1.5' is not a whole number/],
    [`?${P.seed}=`, /'seed=' is not a whole number/],
    [`?${P.seed}=4294967296`, /'seed=4294967296' is not a whole number/],
  ])('rejects %s', (search, message) => {
    expect(() => read(search)).toThrow(message);
  });

  it('rejects a level that cannot host the mode and names the problem', () => {
    const unsuitable = LEVELS.find((l) => MODES.elimination.validateLevel(l).length > 0);
    if (!unsuitable) throw new Error('every level hosts elimination: pick another negative case');
    expect(() => read(`?${P.mode}=elimination&${P.level}=${unsuitable.id}`)).toThrow(/cannot host mode 'elimination'/);
  });
});

describe('launch helpers', () => {
  it('levelsForMode lists exactly the levels the mode accepts', () => {
    for (const mode of MODE_IDS) {
      const ids = levelsForMode(mode).map((l) => l.id);
      expect(ids, mode).toEqual(LEVELS.filter((l) => MODES[mode].validateLevel(l).length === 0).map((l) => l.id));
      expect(ids, mode).toContain(LAUNCH.defaultLevel[mode]);
    }
  });

  it('defaultSeed draws an unsigned 32-bit seed per load (or the fixed one)', () => {
    if (LAUNCH.seed !== 'perLoad') {
      expect(defaultSeed()).toBe(LAUNCH.seed);
      return;
    }
    expect(defaultSeed(() => 0)).toBe(0);
    expect(defaultSeed(() => 0.999_999_999_9)).toBe(0xffff_ffff);
  });

  it('every screenshot shot names a valid launch', () => {
    for (const [name, shot] of Object.entries(SHOTS)) {
      const l = shotLaunch(shot);
      const o = readLaunchOptions(launchSearch(l), FALLBACK);
      expect([o.mode, o.level.id, o.seed], name).toEqual([l.mode, l.levelId, l.seed]);
    }
  });
});
