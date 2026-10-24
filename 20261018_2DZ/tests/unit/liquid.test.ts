import { describe, expect, it } from 'vitest';
import { LIQUID } from '../../src/config/sim.ts';
import { AIR, TILE_DEFS, TILE_INDEX } from '../../src/data/content.ts';
import { setTile } from '../../src/sim/grid.ts';
import { stepLiquid } from '../../src/sim/liquid.ts';
import type { WorldGrid } from '../../src/sim/state.ts';
import { makeState } from './support/makeState.ts';

// Mass tolerance: transfers are integer and exact; only evaporation of stalled films below
// LIQUID.minAmount loses mass, at most minAmount per surface cell. Tests allow
// minAmount × (open surface cells) units.

function mass(w: WorldGrid): number {
  let m = 0;
  for (const a of w.liquid) m += a;
  return m;
}

/** Steps until the active set is empty; returns the step count (throws past maxSteps). */
function settle(w: WorldGrid, maxSteps = 5000): number {
  for (let s = 1; s <= maxSteps; s++) {
    stepLiquid(w);
    if (w.liquidActive.size === 0) return s;
  }
  throw new Error(`liquid did not settle within ${maxSteps} steps`);
}

function at(w: WorldGrid, x: number, y: number): number {
  return w.liquid[y * w.width + x] ?? 0;
}

describe('stepLiquid', () => {
  it('water falls down a 1-wide shaft to the bottom, one row per step', () => {
    const { world } = makeState([
      '#~#', //
      '#.#',
      '#.#',
      '#.#',
      '#.#',
      '###',
    ]);
    stepLiquid(world);
    expect(at(world, 1, 0)).toBe(0);
    expect(at(world, 1, 1)).toBe(LIQUID.max);
    expect(at(world, 1, 2)).toBe(0);
    settle(world);
    expect(at(world, 1, 4)).toBe(LIQUID.max);
    expect(mass(world)).toBe(LIQUID.max);
  });

  it('spreads on a flat floor to an even level', () => {
    const { world } = makeState([
      '#..........~~..........#', //
      '########################',
    ]);
    const m0 = mass(world);
    settle(world);
    const row = Array.from({ length: 22 }, (_, k) => at(world, k + 1, 0));
    expect(Math.min(...row)).toBeGreaterThan(0);
    // Layer levelling leaves at most the integer remainder (±1).
    expect(Math.max(...row) - Math.min(...row)).toBeLessThanOrEqual(1);
    expect(Math.abs(mass(world) - m0)).toBeLessThanOrEqual(LIQUID.minAmount * 22);
  });

  it('fills a U-shaped basin from one side up to the level the mass allows', () => {
    const { world } = makeState([
      '#~~~~#....#', //
      '#~~~~#....#',
      '#....#....#',
      '#....#....#',
      '#.........#',
      '#.........#',
      '###########',
    ]);
    const m0 = mass(world); // 8 full cells
    settle(world);
    // Bottom two rows (9 cells each) need 18 full cells; 8 cells of water fill most of row 5.
    const bottom = Array.from({ length: 9 }, (_, k) => at(world, k + 1, 5));
    const above = Array.from({ length: 9 }, (_, k) => at(world, k + 1, 4));
    expect(Math.min(...bottom)).toBeGreaterThan(LIQUID.max * 0.8);
    expect(Math.max(...above)).toBeLessThan(LIQUID.max * 0.2);
    // Both arms reached: rightmost bottom cell is wet.
    expect(at(world, 9, 5)).toBeGreaterThan(LIQUID.max * 0.8);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 11; x++) expect(at(world, x, y)).toBe(0);
    expect(Math.abs(mass(world) - m0)).toBeLessThanOrEqual(LIQUID.minAmount * 9);
  });

  it('has no pressure: a full shared bottom does not push water up the far arm', () => {
    const { world } = makeState([
      '#~~~~#....#', //
      '#~~~~#....#',
      '#~~~~#....#',
      '#~~~~#....#',
      '#.........#',
      '###########',
    ]);
    const m0 = mass(world); // 16 cells: bottom row takes 9, 7 stay in the left arm
    settle(world);
    const leftRow = [1, 2, 3, 4].map((x) => at(world, x, 3));
    const rightRow = [6, 7, 8, 9].map((x) => at(world, x, 3));
    expect(Math.max(...leftRow) - Math.min(...leftRow)).toBeLessThanOrEqual(1);
    expect(rightRow).toEqual([0, 0, 0, 0]);
    expect(Math.abs(mass(world) - m0)).toBeLessThanOrEqual(LIQUID.minAmount * 4);
  });

  it('settled water leaves the active set and costs nothing', () => {
    const { world } = makeState([
      '#~~~~#', //
      '#~~~~#',
      '######',
    ]);
    stepLiquid(world);
    expect(world.liquidActive.size).toBe(0);
    const rev = Array.from(world.chunkRev);
    stepLiquid(world);
    expect(Array.from(world.chunkRev)).toEqual(rev);
  });

  it('digging next to a full pool makes it flow again', () => {
    const { world } = makeState([
      '#~~~#....#', //
      '#~~~#....#',
      '##########',
    ]);
    settle(world);
    const m0 = mass(world);
    setTile(world, 4, 1, AIR); // open the wall at floor level
    expect(world.liquidActive.size).toBeGreaterThan(0);
    settle(world);
    expect(at(world, 8, 1)).toBeGreaterThan(0);
    expect(Math.abs(mass(world) - m0)).toBeLessThanOrEqual(LIQUID.minAmount * 8);
  });

  it('digging below a pool lets it drain down', () => {
    const { world } = makeState([
      '#~~#', //
      '####',
      '#..#',
      '####',
    ]);
    settle(world);
    setTile(world, 1, 1, AIR);
    settle(world);
    expect(at(world, 1, 2) + at(world, 2, 2)).toBeGreaterThan(LIQUID.max * 1.5);
  });

  it('water never enters solid cells', () => {
    const { world } = makeState([
      '#~~~~~~~~#', //
      '#.#.##.#.#',
      '#........#',
      '##########',
    ]);
    for (let s = 0; s < 300; s++) {
      stepLiquid(world);
      for (let i = 0; i < world.fg.length; i++) {
        if (TILE_DEFS[world.fg[i] ?? 0]?.blocksLiquid) expect(world.liquid[i]).toBe(0);
      }
    }
  });

  it('clears liquid found inside a blocking tile', () => {
    const { world } = makeState(['#.#', '###']);
    world.liquid[1 * 3 + 1] = 100; // inside stone (bypassing setters on purpose)
    world.liquidActive.add(1 * 3 + 1);
    stepLiquid(world);
    expect(world.liquid[1 * 3 + 1]).toBe(0);
    expect(world.fg[1 * 3 + 1]).toBe(TILE_INDEX.stone);
  });

  it('is deterministic', () => {
    const rows = [
      '#~~~~~......#', //
      '#~~~~~..#...#',
      '#.....#.....#',
      '#...........#',
      '#############',
    ];
    const a = makeState(rows).world;
    const b = makeState(rows).world;
    for (let s = 0; s < 200; s++) {
      stepLiquid(a);
      stepLiquid(b);
    }
    expect(Buffer.from(a.liquid).equals(Buffer.from(b.liquid))).toBe(true);
    expect([...a.liquidActive]).toEqual([...b.liquidActive]);
  });

  it('is left/right symmetric (no drift)', () => {
    const { world } = makeState([
      '#.........~.........#', //
      '#####################',
    ]);
    for (let s = 0; s < 40; s++) stepLiquid(world);
    // Mirror cells agree up to the ±1 integer remainder a levelled layer hands out.
    for (let k = 1; k <= 9; k++) expect(Math.abs(at(world, 10 - k, 0) - at(world, 10 + k, 0))).toBeLessThanOrEqual(1);
  });

  it('performance: a 200×30 dam break settles; steps with ≥ 4 000 active cells are fast', () => {
    // Measured (Node 24, dev laptop): settles in ~2 900 steps (~97 s game time at 30 steps/s),
    // ~1.1 ms/step (plain Node) / ~1.8 ms (under Vitest) on average while ≥ 4 000 cells are
    // active; worst single step 3–4 ms (JIT warm-up).
    const W = 400;
    const rows: string[] = [];
    for (let y = 0; y < 45; y++) rows.push('#' + (y < 30 ? '~'.repeat(200) + '.'.repeat(W - 200) : '.'.repeat(W)) + '#');
    rows.push('#'.repeat(W + 2));
    const { world } = makeState(rows);
    const m0 = mass(world);
    let steps = 0;
    let busySteps = 0;
    let busyMs = 0;
    let worstMs = 0;
    while (world.liquidActive.size > 0 && steps < 6000) {
      const size = world.liquidActive.size;
      const s0 = performance.now();
      stepLiquid(world);
      const ms = performance.now() - s0;
      if (size >= 4000) {
        busySteps++;
        busyMs += ms;
      }
      worstMs = Math.max(worstMs, ms);
      steps++;
    }
    console.log(
      `[liquid perf] settled in ${steps} steps; ${busySteps} steps with ≥4k active: ` +
        `avg ${(busyMs / Math.max(1, busySteps)).toFixed(3)} ms, worst step ${worstMs.toFixed(2)} ms`,
    );
    expect(world.liquidActive.size).toBe(0);
    expect(busySteps).toBeGreaterThan(0);
    // Final level 6000 cells / 400 = 15 rows; evaporation only on the one surface row.
    expect(Math.abs(mass(world) - m0)).toBeLessThanOrEqual(LIQUID.minAmount * W);
  });
});
