// OWNER: agent "worldgen" (A). Loot for placed container tiles (BiomeDef.containerLoot of the
// biome at the container, depth layers included) and loose scrap piles (BiomeDef.groundLoot).
import { WORLD } from '../../config/sim.ts';
import { BIOMES } from '../../data/biomes.ts';
import { tileDef, tileIdOf } from '../../data/content.ts';
import { BIOME_IDS } from '../../data/schema.ts';
import { biomeAt } from '../biome.ts';
import { createInventory } from '../inventory.ts';
import { createLootContainer } from '../loot.ts';
import { rand, randInt } from '../rng.ts';
import { expectedCount, fgAt, lastOpenRow, solidAt, tileIdx, type GenContext } from './context.ts';

/** Fills every recorded container cell (call once the world, incl. surfaceY, is final). */
export function fillContainers(ctx: GenContext): void {
  const { world, rng } = ctx;
  for (const i of ctx.containerCells) {
    const tile = world.fg[i] ?? 0;
    const slots = tileDef(tile).containerSlots;
    if (!slots) continue; // overwritten by a later stamp
    const x = i % world.width;
    const y = (i / world.width) | 0;
    const table = BIOMES[biomeAt(world, x, y)].containerLoot[tileIdOf(tile)];
    ctx.containers.set(i, table ? createLootContainer(rng, table, slots) : createInventory(slots));
  }
}

/** A free open-air cell standing on solid ground. */
function freeFloor(ctx: GenContext, x: number, y: number): boolean {
  const { world } = ctx;
  return (
    fgAt(world, x, y) === tileIdx('air') && (world.liquid[y * world.width + x] ?? 0) === 0 && solidAt(world, x, y + 1)
  );
}

export function scatterGroundLoot(ctx: GenContext): void {
  const { world, rng } = ctx;
  const SCRAP = tileIdx('scrap_pile');
  // Surface zones: on the ground outside structures.
  for (const z of ctx.zones) {
    const n = expectedCount(rand(rng), ((z.x1 - z.x0) / 100) * BIOMES[z.biome].groundLoot.per100Columns);
    for (let k = 0; k < n; k++) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const x = randInt(rng, Math.max(z.x0, WORLD.edgeMargin / 2), Math.min(z.x1, world.width - WORLD.edgeMargin / 2) - 1);
        const y = (world.surfaceY[x] ?? 0) - 1;
        if (ctx.reserved[x] || !freeFloor(ctx, x, y)) continue;
        world.fg[y * world.width + x] = SCRAP;
        break;
      }
    }
  }
  // Depth layers: on cave floors inside the layer.
  for (const layer of BIOME_IDS) {
    const b = BIOMES[layer];
    if (b.surface) continue;
    const n = expectedCount(rand(rng), (world.width / 100) * b.groundLoot.per100Columns);
    for (let k = 0; k < n; k++) {
      for (let attempt = 0; attempt < 20; attempt++) {
        const x = randInt(rng, 2, world.width - 3);
        let y = randInt(rng, (world.surfaceY[x] ?? 0) + WORLD.cavesDepth, lastOpenRow(world));
        if (fgAt(world, x, y) !== tileIdx('air')) continue;
        while (y < lastOpenRow(world) && !solidAt(world, x, y + 1)) y++;
        if (biomeAt(world, x, y) !== layer || !freeFloor(ctx, x, y)) continue;
        world.fg[y * world.width + x] = SCRAP;
        break;
      }
    }
  }
}
