// World grid access. EVERY write to fg/wall/liquid goes through the setters here so chunk
// revisions (renderer cache) and the liquid/falling active sets stay correct.
import { LIQUID, WORLD } from '../config/sim.ts';
import { TILE_DEFS, TILE_INDEX, tileDef } from '../data/content.ts';
import type { WorldGrid } from './state.ts';

const BEDROCK = TILE_INDEX.bedrock;

export function createWorldGrid(width: number, height: number): WorldGrid {
  const cs = WORLD.chunkSize;
  const chunksX = Math.ceil(width / cs);
  const chunksY = Math.ceil(height / cs);
  return {
    width,
    height,
    fg: new Uint16Array(width * height),
    wall: new Uint8Array(width * height),
    liquid: new Uint8Array(width * height),
    biome: new Uint8Array(width),
    surfaceY: new Int16Array(width),
    mining: new Map(),
    zombieDamage: new Map(),
    liquidActive: new Set(),
    fallingActive: new Set(),
    chunkRev: new Uint32Array(chunksX * chunksY),
    placed: new Uint8Array(width * height),
    chunksX,
    chunksY,
  };
}

export function inBounds(w: WorldGrid, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < w.width && y < w.height;
}

export function idx(w: WorldGrid, x: number, y: number): number {
  return y * w.width + x;
}

export function xOf(w: WorldGrid, i: number): number {
  return i % w.width;
}

export function yOf(w: WorldGrid, i: number): number {
  return (i / w.width) | 0;
}

/** Tile index at integer cell; outside the world counts as bedrock (solid). */
export function tileAt(w: WorldGrid, x: number, y: number): number {
  if (!inBounds(w, x, y)) return BEDROCK;
  return w.fg[y * w.width + x] ?? BEDROCK;
}

export function isSolidAt(w: WorldGrid, x: number, y: number): boolean {
  return TILE_DEFS[tileAt(w, x, y)]?.solid ?? true;
}

export function blocksLiquidAt(w: WorldGrid, x: number, y: number): boolean {
  return TILE_DEFS[tileAt(w, x, y)]?.blocksLiquid ?? true;
}

export function liquidAt(w: WorldGrid, x: number, y: number): number {
  if (!inBounds(w, x, y)) return 0;
  return w.liquid[y * w.width + x] ?? 0;
}

/** Bumps the revision of the chunk holding (x, y) so the renderer redraws it. */
export function markChanged(w: WorldGrid, x: number, y: number): void {
  const cs = WORLD.chunkSize;
  const c = ((y / cs) | 0) * w.chunksX + ((x / cs) | 0);
  w.chunkRev[c] = (w.chunkRev[c] ?? 0) + 1;
}

/** Wakes liquid and gravity tiles in the 3×3 block around (x, y). */
export function wakeAround(w: WorldGrid, x: number, y: number): void {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inBounds(w, nx, ny)) continue;
      const i = ny * w.width + nx;
      if ((w.liquid[i] ?? 0) > 0) w.liquidActive.add(i);
      if (TILE_DEFS[w.fg[i] ?? 0]?.gravity) w.fallingActive.add(i);
    }
  }
}

/** Sets a foreground tile; `byPlayer` records it in `placed` (cleared by any other change). */
export function setTile(w: WorldGrid, x: number, y: number, tile: number, byPlayer = false): void {
  if (!inBounds(w, x, y)) return;
  const i = y * w.width + x;
  w.placed[i] = byPlayer ? 1 : 0;
  if (w.fg[i] === tile) return;
  w.fg[i] = tile;
  w.mining.delete(i);
  w.zombieDamage.delete(i);
  // A cell that now blocks liquid cannot hold any.
  if (tileDef(tile).blocksLiquid) w.liquid[i] = 0;
  markChanged(w, x, y);
  wakeAround(w, x, y);
}

export function setWall(w: WorldGrid, x: number, y: number, wall: number): void {
  if (!inBounds(w, x, y)) return;
  const i = y * w.width + x;
  if (w.wall[i] === wall) return;
  w.wall[i] = wall;
  markChanged(w, x, y);
}

export function setLiquid(w: WorldGrid, x: number, y: number, amount: number): void {
  if (!inBounds(w, x, y)) return;
  const i = y * w.width + x;
  const a = Math.max(0, Math.min(LIQUID.max, Math.round(amount)));
  if (w.liquid[i] === a) return;
  w.liquid[i] = a;
  markChanged(w, x, y);
  wakeAround(w, x, y);
}
