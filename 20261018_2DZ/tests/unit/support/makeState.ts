// Test helper: a SimState around a small hand-built world (no worldgen), so system tests stay
// fast and readable. Rows are strings, one char per tile, top row first; see LEGEND.
import { DAY_NIGHT, LIQUID } from '../../../src/config/sim.ts';
import { TILE_INDEX } from '../../../src/data/content.ts';
import type { TileId } from '../../../src/data/schema.ts';
import { createWorldGrid } from '../../../src/sim/grid.ts';
import { createPlayer } from '../../../src/sim/player.ts';
import { createRng } from '../../../src/sim/rng.ts';
import type { SimState } from '../../../src/sim/state.ts';

export const LEGEND: Record<string, TileId> = {
  '.': 'air',
  '~': 'air', // air + full water
  '#': 'stone',
  d: 'dirt',
  g: 'grass',
  s: 'sand',
  p: 'planks',
  D: 'door',
  B: 'bedrock',
  c: 'chest',
  w: 'workbench',
};

export interface MakeStateOptions {
  /** Player body top-left (tiles). Default: (1, 0). */
  player?: { x: number; y: number };
  seed?: number;
  timeOfDay?: number;
}

export function makeState(rows: readonly string[], opts: MakeStateOptions = {}): SimState {
  const height = rows.length;
  const width = Math.max(...rows.map((r) => r.length));
  const world = createWorldGrid(width, height);
  for (let y = 0; y < height; y++) {
    const row = rows[y] ?? '';
    for (let x = 0; x < width; x++) {
      const ch = row[x] ?? '.';
      const id = LEGEND[ch];
      if (!id) throw new Error(`makeState: unknown tile char '${ch}'`);
      world.fg[y * width + x] = TILE_INDEX[id];
      if (ch === '~') {
        world.liquid[y * width + x] = LIQUID.max;
        world.liquidActive.add(y * width + x);
      }
    }
  }
  for (let x = 0; x < width; x++) {
    let s = 0;
    while (s < height && world.fg[s * width + x] === TILE_INDEX.air) s++;
    world.surfaceY[x] = s;
  }
  const p = opts.player ?? { x: 1, y: 0 };
  const seed = opts.seed ?? 1;
  return {
    seed,
    tick: 0,
    timeOfDay: opts.timeOfDay ?? DAY_NIGHT.startTime,
    day: 1,
    rng: createRng(seed),
    nextId: 1,
    world,
    player: createPlayer(p.x, p.y),
    zombies: [],
    drops: [],
    containers: new Map(),
    events: [],
    accum: { liquid: 0, falling: 0, spawn: 0 },
  };
}
