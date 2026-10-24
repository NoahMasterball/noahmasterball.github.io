// OWNER: agent "worldgen" (A). Deposits: ore veins by depth (coal shallow, copper mid, iron deep)
// and soil patches (clay/sand in the soil, gravel/dirt pockets in stone). Each deposit is a short
// random walk of discs (organic shapes, no noise-grid artefacts). Runs after the caves so veins
// show on cave walls; only replaces the listed host tiles (never air, water or bedrock).
import { WORLD } from '../../config/sim.ts';
import type { TileId } from '../../data/schema.ts';
import { rand, randInt, randRange } from '../rng.ts';
import { expectedCount, lastOpenRow, tileIdx, type GenContext } from './context.ts';

interface Deposit {
  tile: TileId;
  /** Tiles the deposit may replace. */
  hosts: readonly TileId[];
  /** Depth range below the local surface (rows). */
  minDepth: number;
  maxDepth: number;
  per100Columns: number;
  /** Random-walk steps and disc radius. */
  steps: readonly [number, number];
  radius: readonly [number, number];
}

// NEW — worldgen-only deposit distribution.
const DEPOSITS: readonly Deposit[] = [
  { tile: 'clay', hosts: ['dirt'], minDepth: 2, maxDepth: WORLD.dirtDepth + 2, per100Columns: 5, steps: [4, 9], radius: [1.2, 2.2] },
  { tile: 'sand', hosts: ['dirt'], minDepth: 1, maxDepth: 6, per100Columns: 2, steps: [3, 7], radius: [1.2, 2] },
  { tile: 'dirt', hosts: ['stone'], minDepth: WORLD.dirtDepth, maxDepth: WORLD.deepDepth, per100Columns: 6, steps: [5, 12], radius: [1.5, 2.8] },
  { tile: 'gravel', hosts: ['stone'], minDepth: WORLD.dirtDepth, maxDepth: Infinity, per100Columns: 6, steps: [5, 12], radius: [1.4, 2.6] },
  { tile: 'ore_coal', hosts: ['stone'], minDepth: WORLD.dirtDepth - 4, maxDepth: 170, per100Columns: 34, steps: [3, 8], radius: [0.8, 1.4] },
  { tile: 'ore_copper', hosts: ['stone'], minDepth: WORLD.cavesDepth - 10, maxDepth: 290, per100Columns: 26, steps: [3, 7], radius: [0.8, 1.3] },
  { tile: 'ore_iron', hosts: ['stone'], minDepth: WORLD.deepDepth - 60, maxDepth: Infinity, per100Columns: 26, steps: [3, 7], radius: [0.8, 1.3] },
];

/** Random-walk blob of discs; replaces cells holding one of `hosts`. */
export function blob(ctx: GenContext, x: number, y: number, steps: number, radius: number, tile: number, hosts: readonly number[]): void {
  const { world, rng } = ctx;
  const maxY = lastOpenRow(world);
  let angle = randRange(rng, 0, Math.PI * 2);
  for (let s = 0; s < steps; s++) {
    const r = radius * (0.6 + 0.4 * (1 - s / steps));
    const r2 = r * r;
    for (let yy = Math.floor(y - r); yy <= Math.ceil(y + r); yy++) {
      if (yy < 0 || yy > maxY) continue;
      for (let xx = Math.floor(x - r); xx <= Math.ceil(x + r); xx++) {
        if (xx < 0 || xx >= world.width || (xx - x) ** 2 + (yy - y) ** 2 > r2) continue;
        const i = yy * world.width + xx;
        if (hosts.includes(world.fg[i] ?? -1)) world.fg[i] = tile;
      }
    }
    angle += randRange(rng, -0.8, 0.8);
    x += Math.cos(angle) * r * 0.9;
    y += Math.sin(angle) * r * 0.7;
  }
}

export function placeDeposits(ctx: GenContext): void {
  const { world, rng } = ctx;
  const maxY = lastOpenRow(world);
  for (const d of DEPOSITS) {
    const tile = tileIdx(d.tile);
    const hosts = d.hosts.map(tileIdx);
    const n = expectedCount(rand(rng), (world.width / 100) * d.per100Columns);
    for (let k = 0; k < n; k++) {
      const x = randInt(rng, 0, world.width - 1);
      const s = world.surfaceY[x] ?? WORLD.surfaceBase;
      const y0 = s + d.minDepth;
      const y1 = Math.min(maxY, s + d.maxDepth);
      if (y1 <= y0) continue;
      blob(ctx, x, randInt(rng, y0, y1), randInt(rng, d.steps[0], d.steps[1]), randRange(rng, d.radius[0], d.radius[1]), tile, hosts);
    }
  }
}
