// OWNER: agent "worldgen" (A). Seeded world generation: biome zones, terrain, caves, ores,
// water pockets/lakes, trees, structures (farm, town, city, …) with loot containers.
// Order matters: terrain → caves → deposits → water → structures → gravity fix → trees → loot →
// spawn → settle pass. Deterministic per seed (own RNG stream + hash noise, never Math.random).
import { LIQUID, PLAYER, WORLD } from '../../config/sim.ts';
import { SPAWN_BIOME } from '../../data/biomes.ts';
import { BIOME_INDEX, TILE_DEFS } from '../../data/content.ts';
import { createWorldGrid } from '../grid.ts';
import { createRng } from '../rng.ts';
import type { Inventory, WorldGrid } from '../state.ts';
import { carveCaves } from './caves.ts';
import { placeDeposits } from './deposits.ts';
import { fillContainers, scatterGroundLoot } from './containers.ts';
import { reserve, solidAt, spawnCentreX, SPAWN_CLEARANCE, type GenContext } from './context.ts';
import { placeStructures } from './structures.ts';
import { fillTerrain, shapeSurface, stabiliseGravityTiles } from './terrain.ts';
import { plantTrees } from './trees.ts';
import { placeLakes, placeWaterPockets } from './water.ts';
import { layoutZones } from './zones.ts';

export interface GeneratedWorld {
  world: WorldGrid;
  /** Player spawn: body top-left in tiles. */
  spawnX: number;
  spawnY: number;
  /** Filled loot containers keyed by tile index. */
  containers: Map<number, Inventory>;
}

// NEW — separates the worldgen RNG stream from the gameplay stream (sim.ts uses seed ^ 0x5eed).
const WORLDGEN_SALT = 0x3017d;

/** Columns the player body overlaps when its left edge is at column x. */
const BODY_COLUMNS = Math.ceil(PLAYER.width);
const BODY_ROWS = Math.ceil(PLAYER.height);

function openCell(world: WorldGrid, x: number, y: number): boolean {
  const i = y * world.width + x;
  return !(TILE_DEFS[world.fg[i] ?? 0]?.solid ?? true) && (world.liquid[i] ?? 0) === 0;
}

/** Body top-left on solid ground in open air in the spawn zone, nearest the world centre. */
export function findSpawn(world: WorldGrid): { x: number; y: number } {
  const centre = spawnCentreX(world.width);
  const spawnBiome = BIOME_INDEX[SPAWN_BIOME];
  for (let d = 0; d < world.width / 2; d++) {
    for (const x of [centre - d, centre + d]) {
      if (x < 1 || x + BODY_COLUMNS >= world.width) continue;
      let ok = true;
      // Ground = topmost solid row of the left column; all body columns must share it.
      let ground = 0;
      while (ground < world.height && !solidAt(world, x, ground)) ground++;
      for (let c = 0; c < BODY_COLUMNS && ok; c++) {
        if (world.biome[x + c] !== spawnBiome || !solidAt(world, x + c, ground)) ok = false;
        for (let r = 1; r <= BODY_ROWS && ok; r++) if (!openCell(world, x + c, ground - r)) ok = false;
      }
      if (ok) return { x: x + (BODY_COLUMNS - PLAYER.width) / 2, y: ground - PLAYER.height };
    }
  }
  throw new Error('worldgen: no valid spawn position');
}

/** Safety net: wake any liquid cell that could still move (none expected) and loose gravity tiles. */
function settle(world: WorldGrid): void {
  const W = world.width;
  for (let i = 0; i < world.fg.length; i++) {
    const amount = world.liquid[i] ?? 0;
    if (amount > 0) {
      const x = i % W;
      const canFlow = (n: number): boolean =>
        !(TILE_DEFS[world.fg[n] ?? 0]?.blocksLiquid ?? true) && (world.liquid[n] ?? 0) < LIQUID.max;
      const below = i + W < world.fg.length && canFlow(i + W);
      const side = (x > 0 && (world.liquid[i - 1] ?? 0) < amount && canFlow(i - 1)) ||
        (x < W - 1 && (world.liquid[i + 1] ?? 0) < amount && canFlow(i + 1));
      if (below || side) world.liquidActive.add(i);
    }
    if (TILE_DEFS[world.fg[i] ?? 0]?.gravity && i + W < world.fg.length && !(TILE_DEFS[world.fg[i + W] ?? 0]?.solid ?? true)) {
      world.fallingActive.add(i);
    }
  }
}

export function generateWorld(seed: number): GeneratedWorld {
  const world = createWorldGrid(WORLD.width, WORLD.height);
  const rng = createRng((seed ^ WORLDGEN_SALT) >>> 0);
  const ctx: GenContext = {
    seed,
    rng,
    world,
    zones: layoutZones(rng, world.width),
    reserved: new Uint8Array(world.width),
    rooms: [],
    containerCells: [],
    containers: new Map(),
    visit: new Uint32Array(world.width * world.height),
    visitStamp: 0,
  };
  const centre = spawnCentreX(world.width);
  reserve(ctx, centre - SPAWN_CLEARANCE, centre + SPAWN_CLEARANCE);

  shapeSurface(ctx);
  fillTerrain(ctx);
  carveCaves(ctx);
  placeDeposits(ctx);
  placeLakes(ctx);
  placeWaterPockets(ctx);
  placeStructures(ctx);
  stabiliseGravityTiles(ctx);
  plantTrees(ctx);
  scatterGroundLoot(ctx);
  fillContainers(ctx);
  const spawn = findSpawn(world);
  settle(world);
  return { world, spawnX: spawn.x, spawnY: spawn.y, containers: ctx.containers };
}
