// Id ↔ numeric index lookups and definition arrays derived from the data files (never typed
// twice). Grid code stores numeric indices; everything else talks in string ids.
import { BIOMES } from './biomes.ts';
import { ITEMS } from './items.ts';
import { LOOT_TABLES } from './loot.ts';
import { RECIPES } from './recipes.ts';
import {
  BIOME_IDS,
  ITEM_IDS,
  LOOT_TABLE_IDS,
  RECIPE_IDS,
  TILE_IDS,
  WALL_IDS,
  type BiomeDef,
  type BiomeId,
  type TileDef,
  type TileId,
  type WallDef,
  type WallId,
} from './schema.ts';
import { TILES } from './tiles.ts';
import { WALLS } from './walls.ts';
import { ZOMBIES } from './zombies.ts';

function indexOf<T extends string>(ids: readonly T[]): Record<T, number> {
  return Object.fromEntries(ids.map((id, i) => [id, i])) as Record<T, number>;
}

export const TILE_INDEX: Record<TileId, number> = indexOf(TILE_IDS);
export const WALL_INDEX: Record<WallId, number> = indexOf(WALL_IDS);
export const BIOME_INDEX: Record<BiomeId, number> = indexOf(BIOME_IDS);

/** Definition by numeric grid value. */
export const TILE_DEFS: readonly TileDef[] = TILE_IDS.map((id) => TILES[id]);
export const WALL_DEFS: readonly WallDef[] = WALL_IDS.map((id) => WALLS[id]);
export const BIOME_DEFS: readonly BiomeDef[] = BIOME_IDS.map((id) => BIOMES[id]);

export const AIR = TILE_INDEX.air;
export const NO_WALL = WALL_INDEX.none;

export function tileDef(index: number): TileDef {
  const def = TILE_DEFS[index];
  if (!def) throw new Error(`unknown tile index ${index}`);
  return def;
}

export function tileIdOf(index: number): TileId {
  const id = TILE_IDS[index];
  if (!id) throw new Error(`unknown tile index ${index}`);
  return id;
}

/**
 * Cross-reference checks TypeScript cannot express. Returns human-readable problems (empty = ok).
 * Run by tests/unit/content.test.ts.
 */
export function validateContent(): string[] {
  const problems: string[] = [];
  if (TILE_IDS[0] !== 'air') problems.push("TILE_IDS[0] must be 'air'");
  for (const id of ITEM_IDS) {
    const item = ITEMS[id];
    if (item.maxStack < 1) problems.push(`item ${id}: maxStack < 1`);
    if (item.ranged && ITEMS[item.ranged.ammo].category !== 'ammo') problems.push(`item ${id}: ammo is not an ammo item`);
    if (item.presentation.icon.length > 3) problems.push(`item ${id}: icon longer than 3 chars`);
  }
  for (const id of TILE_IDS) {
    const tile = TILES[id];
    if (tile.solid && !tile.blocksLiquid && id !== 'fence') problems.push(`tile ${id}: solid but lets liquid through`);
  }
  for (const id of RECIPE_IDS) {
    const r = RECIPES[id];
    if (r.station && !TILES[r.station].station) problems.push(`recipe ${id}: station ${r.station} is not a station tile`);
    if (r.inputs.length === 0) problems.push(`recipe ${id}: no inputs`);
  }
  for (const id of BIOME_IDS) {
    const b = BIOMES[id];
    for (const tile of Object.keys(b.containerLoot) as TileId[]) {
      if (!TILES[tile].containerSlots) problems.push(`biome ${id}: containerLoot key ${tile} is not a container tile`);
    }
    if (b.surface && b.width[0] > b.width[1]) problems.push(`biome ${id}: width min > max`);
  }
  for (const id of LOOT_TABLE_IDS) {
    const t = LOOT_TABLES[id];
    if (t.entries.length === 0) problems.push(`loot ${id}: no entries`);
    for (const e of t.entries) if (e.count[0] < 1 || e.count[0] > e.count[1]) problems.push(`loot ${id}: bad count for ${e.item}`);
  }
  for (const id of Object.keys(ZOMBIES) as (keyof typeof ZOMBIES)[]) {
    const z = ZOMBIES[id];
    if (z.health <= 0 || z.speed <= 0) problems.push(`zombie ${id}: health/speed must be > 0`);
  }
  return problems;
}
