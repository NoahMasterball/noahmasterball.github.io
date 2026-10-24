import { describe, expect, it } from 'vitest';
import { LIQUID } from '../../src/config/sim.ts';
import { AIR, TILE_INDEX } from '../../src/data/content.ts';
import { stepFalling } from '../../src/sim/falling.ts';
import { setTile } from '../../src/sim/grid.ts';
import type { SimState } from '../../src/sim/state.ts';
import { makeState } from './support/makeState.ts';

const SAND = TILE_INDEX.sand;

function tile(s: SimState, x: number, y: number): number {
  return s.world.fg[y * s.world.width + x] ?? -1;
}

function wakeAll(s: SimState): void {
  for (let i = 0; i < s.world.fg.length; i++) if (s.world.fg[i] === SAND) s.world.fallingActive.add(i);
}

describe('stepFalling', () => {
  it('a sand column falls one row per step and stacks on the floor', () => {
    const s = makeState([
      '#s#', //
      '#s#',
      '#.#',
      '#.#',
      '#.#',
      '###',
    ]);
    wakeAll(s);
    stepFalling(s);
    expect([0, 1, 2, 3].map((y) => tile(s, 1, y))).toEqual([AIR, SAND, SAND, AIR]);
    for (let k = 0; k < 10; k++) stepFalling(s);
    expect(tile(s, 1, 4)).toBe(SAND);
    expect(tile(s, 1, 3)).toBe(SAND);
    expect(tile(s, 1, 2)).toBe(AIR);
    expect(s.world.fallingActive.size).toBe(0);
  });

  it('supported sand does not move and leaves the active set', () => {
    const s = makeState(['.s.', '###']);
    wakeAll(s);
    stepFalling(s);
    expect(tile(s, 1, 0)).toBe(SAND);
    expect(s.world.fallingActive.size).toBe(0);
  });

  it('digging under sand makes it fall (setTile wakes it)', () => {
    const s = makeState(['#s#', '#d#', '#.#', '###']);
    setTile(s.world, 1, 1, AIR);
    for (let k = 0; k < 5; k++) stepFalling(s);
    expect(tile(s, 1, 2)).toBe(SAND);
  });

  it('sand falling into water displaces it upward', () => {
    const s = makeState([
      '#s#', //
      '#~#',
      '#~#',
      '###',
    ]);
    s.world.liquidActive.clear();
    wakeAll(s);
    for (let k = 0; k < 5; k++) stepFalling(s);
    expect(tile(s, 1, 2)).toBe(SAND);
    const w = s.world;
    expect(w.liquid[2 * w.width + 1]).toBe(0);
    expect((w.liquid[0 * w.width + 1] ?? 0) + (w.liquid[1 * w.width + 1] ?? 0)).toBe(2 * LIQUID.max);
  });
});
