// OWNER: agent "liquid" (B). Gravity tiles (TileDef.gravity: sand, gravel) fall when unsupported.
//
// Each call moves every candidate in world.fallingActive whose cell below is air (with or without
// water) down by exactly one row. Bottom-up order lets a whole column drop together while no tile
// moves twice (the receiving cell was already processed). Water in the target cell swaps up into
// the vacated cell (mass is kept). setTile/setLiquid wake neighbours, so a falling tile, the tile
// above it and the displaced water stay active; supported tiles leave the set.
// Bodies (player, zombies, drops) are not checked: a tile may fall into a body's cells.
import { AIR, TILE_DEFS } from '../data/content.ts';
import { setLiquid, setTile } from './grid.ts';
import type { SimState } from './state.ts';

export function stepFalling(state: SimState): void {
  const world = state.world;
  const active = world.fallingActive;
  if (active.size === 0) return;
  const w = world.width;
  const list = Int32Array.from(active);
  active.clear();
  list.sort();
  for (let k = list.length - 1; k >= 0; k--) {
    const i = list[k] as number;
    const tile = world.fg[i] ?? AIR;
    if (!TILE_DEFS[tile]?.gravity) continue;
    const x = i % w;
    const y = (i / w) | 0;
    if (y + 1 >= world.height) continue;
    const b = i + w;
    if (world.fg[b] !== AIR) continue;
    // A liquid-blocking tile displaces the water (setTile clears it below); others share the cell.
    const water = TILE_DEFS[tile]?.blocksLiquid ? (world.liquid[b] ?? 0) : 0;
    setTile(world, x, y + 1, tile);
    setTile(world, x, y, AIR);
    setLiquid(world, x, y, water);
  }
}
