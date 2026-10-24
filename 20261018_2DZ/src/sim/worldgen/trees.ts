// OWNER: agent "worldgen" (A). Trees (Terraria-style): tall 1-tile log trunk, round leaf crown on
// top, occasional short side branches with a leaf tuft, optional log roots at the foot. Density
// from BiomeDef.trees (per 100 columns). Runs after structures so it never grows through buildings:
// every tree cell must be open air (no liquid, no background wall, not a reserved column).
import { WORLD } from '../../config/sim.ts';
import { BIOMES } from '../../data/biomes.ts';
import { chance, rand, randInt } from '../rng.ts';
import { expectedCount, fgAt, tileIdx, type GenContext } from './context.ts';

// NEW — worldgen-only tree shapes.
export const TRUNK_HEIGHT: readonly [number, number] = [10, 20];
export const CROWN_RADIUS: readonly [number, number] = [2, 3];
/** Added to the crown radius for the circle test (rounder outline, no single-cell spikes). */
const CROWN_ROUNDING = 0.5;
/** Rows the crown centre sits above the last trunk tile (trunk reaches into the crown). */
const CROWN_LIFT = 1;
/** Minimum columns between two trunks. */
export const TREE_SPACING = 3;
/** Rows kept free between a crown and the top world edge. */
const TOP_MARGIN = 2;
/** Per trunk row chance of a side branch (branches only in the middle part of the trunk). */
const BRANCH_CHANCE = 0.14;
/** Trunk rows at the bottom and below the crown without branches. */
const BRANCH_CLEAR_BOTTOM = 3;
const BRANCH_CLEAR_TOP = 3;
/** Chance per side of a log root next to the trunk foot. */
const ROOT_CHANCE = 0.5;
/** Random columns tried per tree before giving up (spacing, ground or headroom unsuitable). */
const PLACE_ATTEMPTS = 10;

/** Open air a tree may grow into: in bounds, air, no liquid, no structure/cave background. */
function openAir(ctx: GenContext, x: number, y: number): boolean {
  const { world } = ctx;
  if (x < 0 || x >= world.width || y < TOP_MARGIN || ctx.reserved[x]) return false;
  const i = y * world.width + x;
  return world.fg[i] === tileIdx('air') && (world.liquid[i] ?? 0) === 0 && (world.wall[i] ?? 0) === 0;
}

function put(ctx: GenContext, x: number, y: number, tile: number): void {
  if (openAir(ctx, x, y)) ctx.world.fg[y * ctx.world.width + x] = tile;
}

/** Free trunk rows above `ground` (stops at the first blocked cell), capped at `max`. */
function freeHeight(ctx: GenContext, x: number, ground: number, max: number): number {
  let h = 0;
  while (h < max && openAir(ctx, x, ground - 1 - h)) h++;
  return h;
}

function growTree(ctx: GenContext, x: number, ground: number): boolean {
  const { rng } = ctx;
  const LOG = tileIdx('log');
  const LEAVES = tileIdx('leaves');
  const r = randInt(rng, CROWN_RADIUS[0], CROWN_RADIUS[1]);
  const crownSpan = r + CROWN_LIFT + 1;
  // Clamp against the top world edge: trunk + crown must stay below TOP_MARGIN.
  const want = Math.min(randInt(rng, TRUNK_HEIGHT[0], TRUNK_HEIGHT[1]), ground - TOP_MARGIN - crownSpan);
  const h = freeHeight(ctx, x, ground, want);
  if (h < TRUNK_HEIGHT[0]) return false;
  const top = ground - h;
  for (let y = ground - 1; y >= top; y--) put(ctx, x, y, LOG);

  // Side branches: one log sideways plus a small leaf tuft, never on adjacent rows.
  let lastBranch = Infinity;
  for (let y = ground - 1 - BRANCH_CLEAR_BOTTOM; y > top + BRANCH_CLEAR_TOP; y--) {
    if (lastBranch - y < 2 || !chance(rng, BRANCH_CHANCE)) continue;
    const s = chance(rng, 0.5) ? -1 : 1;
    if (!openAir(ctx, x + s, y) || !openAir(ctx, x + 2 * s, y)) continue;
    put(ctx, x + s, y, LOG);
    put(ctx, x + 2 * s, y, LEAVES);
    put(ctx, x + 2 * s, y - 1, LEAVES);
    put(ctx, x + s, y - 1, LEAVES);
    lastBranch = y;
  }

  // Round crown centred just above the trunk top.
  const cy = top - CROWN_LIFT;
  const rr = (r + CROWN_ROUNDING) * (r + CROWN_ROUNDING);
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= rr) put(ctx, x + dx, cy + dy, LEAVES);
    }
  }

  // Roots: log stubs left/right of the foot, only where they rest on ground.
  for (const s of [-1, 1]) {
    if (chance(rng, ROOT_CHANCE) && fgAt(ctx.world, x + s, ground) === tileIdx('grass')) put(ctx, x + s, ground - 1, LOG);
  }
  return true;
}

export function plantTrees(ctx: GenContext): void {
  const { world, rng } = ctx;
  const trunks = new Uint8Array(world.width);
  for (const z of ctx.zones) {
    const density = BIOMES[z.biome].trees;
    if (density <= 0) continue;
    const count = expectedCount(rand(rng), ((z.x1 - z.x0) / 100) * density);
    for (let n = 0; n < count; n++) {
      for (let attempt = 0; attempt < PLACE_ATTEMPTS; attempt++) {
        const x = randInt(rng, Math.max(z.x0, WORLD.edgeMargin / 2), Math.min(z.x1, world.width - WORLD.edgeMargin / 2) - 1);
        if (ctx.reserved[x]) continue;
        let near = false;
        for (let k = x - TREE_SPACING; k <= x + TREE_SPACING; k++) if (trunks[k]) near = true;
        if (near) continue;
        const ground = world.surfaceY[x] ?? 0;
        if (fgAt(world, x, ground) !== tileIdx('grass')) continue;
        if (!growTree(ctx, x, ground)) continue;
        trunks[x] = 1;
        break;
      }
    }
  }
}
