// OWNER: agent "worldgen" (A). Shared generation context + raw cell helpers.
// The world is not live during generation, so these write fg/wall/liquid directly (no chunk
// revisions, no wake-ups); index.ts runs a final settle pass that wakes anything left unstable.
import { WORLD } from '../../config/sim.ts';
import { TILE_DEFS, TILE_INDEX, WALL_INDEX } from '../../data/content.ts';
import type { BiomeId, TileId, WallId } from '../../data/schema.ts';
import { inBounds } from '../grid.ts';
import { hash2, type RngState } from '../rng.ts';
import type { Inventory, WorldGrid } from '../state.ts';

export interface Zone {
  biome: BiomeId;
  /** First column (inclusive). */
  x0: number;
  /** Last column + 1 (exclusive). */
  x1: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GenContext {
  seed: number;
  rng: RngState;
  world: WorldGrid;
  zones: Zone[];
  /** Columns claimed by the spawn area, lakes and surface structures (no trees/other structures). */
  reserved: Uint8Array;
  /** Underground rectangles claimed by cave rooms. */
  rooms: Rect[];
  /** Container tile indices in placement order; filled with loot once the world is final. */
  containerCells: number[];
  containers: Map<number, Inventory>;
  /** Scratch for flood fills (generation-stamped, avoids clearing a world-sized array). */
  visit: Uint32Array;
  visitStamp: number;
}

/** Bottom row that may still be carved/built (rows below are bedrock). */
export function lastOpenRow(world: WorldGrid): number {
  return world.height - WORLD.bedrockRows - 2;
}

/** Independent deterministic noise seed per generation stage. */
export function subSeed(seed: number, salt: number): number {
  return Math.floor(hash2(seed, salt, 0x5a17) * 0x7fffffff);
}

export function tileIdx(id: TileId): number {
  return TILE_INDEX[id];
}

export function wallIdx(id: WallId): number {
  return WALL_INDEX[id];
}

export function cellIndex(world: WorldGrid, x: number, y: number): number {
  return y * world.width + x;
}

export function fgAt(world: WorldGrid, x: number, y: number): number {
  if (!inBounds(world, x, y)) return TILE_INDEX.bedrock;
  return world.fg[y * world.width + x] ?? TILE_INDEX.bedrock;
}

export function solidAt(world: WorldGrid, x: number, y: number): boolean {
  return TILE_DEFS[fgAt(world, x, y)]?.solid ?? true;
}

export function blocksLiquid(world: WorldGrid, x: number, y: number): boolean {
  return TILE_DEFS[fgAt(world, x, y)]?.blocksLiquid ?? true;
}

/** Raw foreground write (generation only). A liquid-blocking tile removes liquid in the cell. */
export function putTile(world: WorldGrid, x: number, y: number, tile: number): void {
  if (!inBounds(world, x, y)) return;
  const i = y * world.width + x;
  world.fg[i] = tile;
  if (TILE_DEFS[tile]?.blocksLiquid) world.liquid[i] = 0;
}

export function putWall(world: WorldGrid, x: number, y: number, wall: number): void {
  if (!inBounds(world, x, y)) return;
  world.wall[y * world.width + x] = wall;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function zoneAt(ctx: GenContext, x: number): Zone | undefined {
  return ctx.zones.find((z) => x >= z.x0 && x < z.x1);
}

export function reserve(ctx: GenContext, x0: number, x1: number): void {
  for (let x = Math.max(0, x0); x < Math.min(ctx.world.width, x1); x++) ctx.reserved[x] = 1;
}

export function isFree(ctx: GenContext, x0: number, x1: number): boolean {
  if (x0 < 0 || x1 > ctx.world.width) return false;
  for (let x = x0; x < x1; x++) if (ctx.reserved[x]) return false;
  return true;
}

/** Expected count → integer: floor plus a chance for the fractional part. */
export function expectedCount(rngRoll: number, expected: number): number {
  const base = Math.floor(expected);
  return base + (rngRoll < expected - base ? 1 : 0);
}

// NEW — columns around the spawn centre kept free of lakes and buildings (and trees).
export const SPAWN_CLEARANCE = 10;

/** Column the spawn zone is centred on (zones.ts) and the spawn search starts from (spawn.ts). */
export function spawnCentreX(width: number): number {
  return Math.floor(width / 2);
}
