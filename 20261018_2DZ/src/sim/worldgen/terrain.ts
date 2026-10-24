// OWNER: agent "worldgen" (A). Surface height per column (per-biome noise blended across zone
// borders), soil/stone layers, background walls, bedrock. Patches/ores: deposits.ts.
import { WORLD } from '../../config/sim.ts';
import { BIOME_DEFS, BIOME_INDEX, TILE_DEFS } from '../../data/content.ts';
import { noise1 } from '../rng.ts';
import { clamp, subSeed, tileIdx, wallIdx, type GenContext } from './context.ts';

// NEW — worldgen-only terrain tuning.
/** Half-width (columns) of the border blend window between two zones' height functions. */
const BLEND_RADIUS = 24;
/** Fraction of a biome's amplitude carried by the detail octave (wavelength / 3). */
const DETAIL_SHARE = 0.3;
/** ± rows of noise on the dirt → stone boundary. */
const DIRT_DEPTH_JITTER = 3;
/** Surface never rises above / sinks below this many rows around WORLD.surfaceBase. */
const SURFACE_LIMIT = 40;

const SALT_HEIGHT = 11;
const SALT_DIRT = 12;
const SALT_BEDROCK = 17;

/** Height (row of the top tile) a single biome would produce at column x. */
function biomeHeight(seed: number, biomeIndex: number, x: number): number {
  const b = BIOME_DEFS[biomeIndex];
  if (!b) return WORLD.surfaceBase;
  const s = subSeed(seed, SALT_HEIGHT + biomeIndex * 101);
  const wl = Math.max(1, b.terrain.wavelength);
  const n = (1 - DETAIL_SHARE) * noise1(s, x, wl) + DETAIL_SHARE * noise1(s + 1, x, Math.max(1, wl / 3));
  return WORLD.surfaceBase + b.terrain.offset + b.terrain.amplitude * n;
}

/** Writes world.biome[] and world.surfaceY[] (box-filtered blend of the zone height functions). */
export function shapeSurface(ctx: GenContext): void {
  const { world, zones, seed } = ctx;
  for (const z of zones) for (let x = z.x0; x < z.x1; x++) world.biome[x] = BIOME_INDEX[z.biome];
  for (let x = 0; x < world.width; x++) {
    const a = Math.max(0, x - BLEND_RADIUS);
    const b = Math.min(world.width - 1, x + BLEND_RADIUS);
    let sum = 0;
    let weight = 0;
    for (const z of zones) {
      const overlap = Math.min(b + 1, z.x1) - Math.max(a, z.x0);
      if (overlap <= 0) continue;
      sum += overlap * biomeHeight(seed, BIOME_INDEX[z.biome], x);
      weight += overlap;
    }
    const h = weight > 0 ? sum / weight : WORLD.surfaceBase;
    world.surfaceY[x] = Math.round(clamp(h, WORLD.surfaceBase - SURFACE_LIMIT, WORLD.surfaceBase + SURFACE_LIMIT));
  }
}

/** Fills every column below its surface: top tile, soil, stone, walls, bedrock. */
export function fillTerrain(ctx: GenContext): void {
  const { world, seed } = ctx;
  const W = world.width;
  const sDirt = subSeed(seed, SALT_DIRT);
  const sBed = subSeed(seed, SALT_BEDROCK);
  const STONE = tileIdx('stone');
  const BEDROCK = tileIdx('bedrock');
  const DIRT_WALL = wallIdx('dirt_wall');
  const STONE_WALL = wallIdx('stone_wall');
  const bedrockTop = world.height - WORLD.bedrockRows;

  for (let x = 0; x < W; x++) {
    const s = world.surfaceY[x] ?? WORLD.surfaceBase;
    const biome = BIOME_DEFS[world.biome[x] ?? BIOME_INDEX.plains];
    if (!biome) throw new Error('worldgen: column without biome');
    const top = tileIdx(biome.topTile);
    const fill = tileIdx(biome.fillTile);
    const soil = WORLD.dirtDepth + Math.round(DIRT_DEPTH_JITTER * noise1(sDirt, x, 30));
    // Jagged bedrock top: one extra row in about half the columns.
    const bedRow = bedrockTop - (noise1(sBed, x, 4) > 0 ? 1 : 0);
    for (let y = s; y < world.height; y++) {
      const i = y * W + x;
      const depth = y - s;
      world.fg[i] = y >= bedRow ? BEDROCK : depth === 0 ? top : depth <= soil ? fill : STONE;
      if (depth > 0) world.wall[i] = depth <= soil ? DIRT_WALL : STONE_WALL;
    }
  }
}

/**
 * Gravity tiles with nothing solid below would fall at start: turn them into stable ground
 * (stone deep down, dirt near the surface). Bottom-up so a fixed tile supports the one above.
 */
export function stabiliseGravityTiles(ctx: GenContext): void {
  const { world } = ctx;
  const W = world.width;
  const SAND = tileIdx('sand');
  const GRAVEL = tileIdx('gravel');
  const STONE = tileIdx('stone');
  const DIRT = tileIdx('dirt');
  for (let y = world.height - 2; y >= 0; y--) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const t = world.fg[i];
      if (t !== SAND && t !== GRAVEL) continue;
      const below = world.fg[i + W] ?? STONE;
      if (TILE_DEFS[below]?.solid) continue;
      const depth = y - (world.surfaceY[x] ?? 0);
      world.fg[i] = depth > WORLD.dirtDepth ? STONE : DIRT;
    }
  }
}
