// OWNER: agent "worldgen" (A). Settled water: surface lakes (dug bowls) and underground pockets
// in cave floors. Every body is a flood fill of all liquid-passable cells at or below a level row;
// if that fill is bounded it is a closed basin, so full cells there never move (nothing to wake).
import { LIQUID, WORLD } from '../../config/sim.ts';
import { BIOMES } from '../../data/biomes.ts';
import { TILE_DEFS } from '../../data/content.ts';
import { rand, randInt } from '../rng.ts';
import {
  clamp,
  expectedCount,
  isFree,
  lastOpenRow,
  reserve,
  tileIdx,
  type GenContext,
} from './context.ts';

// NEW — worldgen-only water tuning. Lake count per zone comes from BiomeDef.lakes.
const LAKE_WIDTH: readonly [number, number] = [9, 24];
const LAKE_DEPTH: readonly [number, number] = [3, 6];
/** Max height difference of the two rim columns (steeper sites are skipped). */
const LAKE_MAX_RIM_DELTA = 3;
const POCKETS_PER_100_COLUMNS = 2;
const POCKET_MAX_CELLS = 500;
const LAKE_MAX_CELLS = 900;

/**
 * Flood fill from (sx, sy) over liquid-passable cells with y >= level. Returns the cell indices,
 * or null if the region exceeds `maxCells` (not a closed basin at this level).
 */
function basin(ctx: GenContext, sx: number, sy: number, level: number, maxCells: number): number[] | null {
  const { world } = ctx;
  const W = world.width;
  ctx.visitStamp += 1;
  const stamp = ctx.visitStamp;
  const start = sy * W + sx;
  const out: number[] = [start];
  ctx.visit[start] = stamp;
  for (let k = 0; k < out.length; k++) {
    const i = out[k] ?? 0;
    const x = i % W;
    const y = (i / W) | 0;
    const next = [
      x > 0 ? i - 1 : -1,
      x < W - 1 ? i + 1 : -1,
      i + W < world.fg.length ? i + W : -1,
      y - 1 >= level ? i - W : -1,
    ];
    for (const n of next) {
      if (n < 0 || ctx.visit[n] === stamp) continue;
      if (TILE_DEFS[world.fg[n] ?? 0]?.blocksLiquid ?? true) continue;
      ctx.visit[n] = stamp;
      out.push(n);
      if (out.length > maxCells) return null;
    }
  }
  return out;
}

/** Fills the highest closed basin around the passable cell (sx, sy) with level in [level, sy]. */
function fillBasin(ctx: GenContext, sx: number, sy: number, level: number, maxCells: number): number {
  for (let l = level; l <= sy; l++) {
    const cells = basin(ctx, sx, sy, l, maxCells);
    if (!cells) continue;
    for (const i of cells) ctx.world.liquid[i] = LIQUID.max;
    return l;
  }
  return -1;
}

function digLake(ctx: GenContext, x0: number, w: number, depth: number): void {
  const { world } = ctx;
  const AIR = tileIdx('air');
  const SAND = tileIdx('sand');
  const CLAY = tileIdx('clay');
  const left = world.surfaceY[x0 - 1] ?? 0;
  const right = world.surfaceY[x0 + w] ?? 0;
  // Water top = the lower rim (larger y): both rims hold water there.
  const level = Math.max(left, right);
  let deepest = level;
  let centreFloor = level;
  for (let k = 0; k < w; k++) {
    const x = x0 + k;
    const d = Math.max(1, Math.round(depth * Math.sin((Math.PI * (k + 0.5)) / w)));
    const bottom = level + d; // first solid row of the bed
    const s = world.surfaceY[x] ?? level;
    for (let y = Math.min(s, level); y < bottom; y++) {
      world.fg[y * world.width + x] = AIR;
      if (y < level) world.wall[y * world.width + x] = 0;
    }
    // Lining: sand bed over clay so the basin is sealed even above a cave.
    for (let y = bottom; y < bottom + 3; y++) world.fg[y * world.width + x] = y === bottom ? SAND : CLAY;
    // Terrain that dipped below the bed inside the bowl: fill up so the lining does not float.
    for (let y = bottom + 3; y < s && !(TILE_DEFS[world.fg[y * world.width + x] ?? 0]?.solid ?? true); y++) {
      world.fg[y * world.width + x] = CLAY;
    }
    if (k === w >> 1) centreFloor = bottom - 1;
    world.surfaceY[x] = level;
    deepest = Math.max(deepest, bottom - 1);
  }
  // Seal the rim walls against caves right next to the bowl.
  for (const x of [x0 - 1, x0 + w]) {
    for (let y = level; y <= deepest + 1; y++) {
      if (!(TILE_DEFS[world.fg[y * world.width + x] ?? 0]?.solid ?? true)) world.fg[y * world.width + x] = CLAY;
    }
  }
  fillBasin(ctx, x0 + (w >> 1), centreFloor, level, LAKE_MAX_CELLS);
}

export function placeLakes(ctx: GenContext): void {
  const { world, rng } = ctx;
  for (const z of ctx.zones) {
    const perHundred = BIOMES[z.biome].lakes;
    if (perHundred <= 0) continue;
    const count = expectedCount(rand(rng), ((z.x1 - z.x0) / 100) * perHundred);
    for (let n = 0; n < count; n++) {
      for (let attempt = 0; attempt < 12; attempt++) {
        const w = randInt(rng, LAKE_WIDTH[0], LAKE_WIDTH[1]);
        const lo = Math.max(z.x0 + 3, WORLD.edgeMargin);
        const hi = Math.min(z.x1 - w - 3, world.width - WORLD.edgeMargin - w);
        if (hi <= lo) break;
        const x0 = randInt(rng, lo, hi);
        if (!isFree(ctx, x0 - 4, x0 + w + 4)) continue;
        const rimDelta = Math.abs((world.surfaceY[x0 - 1] ?? 0) - (world.surfaceY[x0 + w] ?? 0));
        if (rimDelta > LAKE_MAX_RIM_DELTA) continue;
        digLake(ctx, x0, w, randInt(rng, LAKE_DEPTH[0], LAKE_DEPTH[1]));
        reserve(ctx, x0 - 3, x0 + w + 3);
        break;
      }
    }
  }
}

export function placeWaterPockets(ctx: GenContext): void {
  const { world, rng } = ctx;
  const W = world.width;
  const maxY = lastOpenRow(world);
  const count = expectedCount(rand(rng), (W / 100) * POCKETS_PER_100_COLUMNS);
  let placed = 0;
  for (let attempt = 0; attempt < count * 8 && placed < count; attempt++) {
    const x = randInt(rng, 2, W - 3);
    const s = world.surfaceY[x] ?? WORLD.surfaceBase;
    let y = randInt(rng, s + WORLD.cavesDepth, Math.max(s + WORLD.cavesDepth, maxY - 4));
    if (TILE_DEFS[world.fg[y * W + x] ?? 0]?.blocksLiquid ?? true) continue;
    // Drop to the cave floor.
    while (y < maxY && !(TILE_DEFS[world.fg[(y + 1) * W + x] ?? 0]?.blocksLiquid ?? true)) y++;
    if ((world.liquid[y * W + x] ?? 0) > 0) continue;
    const level = clamp(y - randInt(rng, 1, 5), 0, y);
    if (fillBasin(ctx, x, y, level, POCKET_MAX_CELLS) >= 0) placed++;
  }
}
