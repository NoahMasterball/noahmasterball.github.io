import { describe, expect, it } from 'vitest';
import { LIQUID, PLAYER, WORLD } from '../../src/config/sim.ts';
import { BIOMES, FAR_BIOMES, SPAWN_BIOME } from '../../src/data/biomes.ts';
import { TILE_DEFS, TILE_INDEX, tileIdOf } from '../../src/data/content.ts';
import { BIOME_IDS, STRUCTURE_KINDS, TILE_IDS, type BiomeId, type TileId } from '../../src/data/schema.ts';
import { TILES } from '../../src/data/tiles.ts';
import { biomeAt } from '../../src/sim/biome.ts';
import type { WorldGrid } from '../../src/sim/state.ts';
import { generateWorld, type GeneratedWorld } from '../../src/sim/worldgen/index.ts';
import { blueprintWidth, buildBlueprint, LEGEND } from '../../src/sim/worldgen/structures.ts';
import { createRng } from '../../src/sim/rng.ts';

const SEED = WORLD.defaultSeed;
const EXTRA_SEEDS = [1, 42, 777, 123456];

const cache = new Map<number, GeneratedWorld>();
function gen(seed: number): GeneratedWorld {
  let g = cache.get(seed);
  if (!g) {
    g = generateWorld(seed);
    cache.set(seed, g);
  }
  return g;
}

function same(a: ArrayLike<number> & { buffer: ArrayBufferLike }, b: ArrayLike<number> & { buffer: ArrayBufferLike }): boolean {
  return Buffer.from(a.buffer).equals(Buffer.from(b.buffer));
}

function zonesOf(world: WorldGrid): { biome: BiomeId; x0: number; x1: number }[] {
  const out: { biome: BiomeId; x0: number; x1: number }[] = [];
  for (let x = 0; x < world.width; x++) {
    const biome = BIOME_IDS[world.biome[x] ?? 0] ?? 'plains';
    const last = out[out.length - 1];
    if (last && last.biome === biome) last.x1 = x + 1;
    else out.push({ biome, x0: x, x1: x + 1 });
  }
  return out;
}

function countTiles(world: WorldGrid): Record<TileId, number> {
  const counts = Object.fromEntries(TILE_IDS.map((id) => [id, 0])) as Record<TileId, number>;
  for (const t of world.fg) counts[tileIdOf(t)] += 1;
  return counts;
}

function checkSpawn(g: GeneratedWorld): void {
  const w = g.world;
  const x0 = Math.floor(g.spawnX);
  const x1 = Math.floor(g.spawnX + PLAYER.width - 1e-6);
  const y0 = Math.floor(g.spawnY);
  const y1 = Math.floor(g.spawnY + PLAYER.height - 1e-6);
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      const i = y * w.width + x;
      expect(TILE_DEFS[w.fg[i] ?? 0]?.solid, `body cell ${x},${y} solid`).toBe(false);
      expect(w.liquid[i], `body cell ${x},${y} wet`).toBe(0);
    }
    const below = (y1 + 1) * w.width + x;
    expect(TILE_DEFS[w.fg[below] ?? 0]?.solid, `ground under ${x}`).toBe(true);
    expect(biomeAt(w, x, y1)).toBe(SPAWN_BIOME);
  }
  // Feet rest exactly on the ground row.
  expect(g.spawnY + PLAYER.height).toBe(y1 + 1);
}

describe('worldgen', () => {
  it('is deterministic per seed', () => {
    const a = gen(SEED);
    const b = generateWorld(SEED);
    expect(same(a.world.fg, b.world.fg)).toBe(true);
    expect(same(a.world.wall, b.world.wall)).toBe(true);
    expect(same(a.world.liquid, b.world.liquid)).toBe(true);
    expect(same(a.world.biome, b.world.biome)).toBe(true);
    expect(same(a.world.surfaceY, b.world.surfaceY)).toBe(true);
    expect([a.spawnX, a.spawnY]).toEqual([b.spawnX, b.spawnY]);
    expect([...a.containers.keys()]).toEqual([...b.containers.keys()]);
  });

  it('differs between seeds', () => {
    expect(same(gen(SEED).world.fg, gen(EXTRA_SEEDS[0] ?? 1).world.fg)).toBe(false);
  });

  it('stays within the time budget', () => {
    const t0 = performance.now();
    generateWorld(SEED + 1);
    expect(performance.now() - t0).toBeLessThan(1500);
  });

  it('spawns the player on solid ground in open air in the spawn biome', () => {
    for (const seed of [SEED, ...EXTRA_SEEDS]) checkSpawn(gen(seed));
  });

  it('lays out every surface biome; far biomes never touch the spawn zone', () => {
    for (const seed of [SEED, ...EXTRA_SEEDS]) {
      const g = gen(seed);
      const zones = zonesOf(g.world);
      const present = new Set(zones.map((z) => z.biome));
      for (const id of BIOME_IDS) if (BIOMES[id].surface) expect(present.has(id), `${id} (seed ${seed})`).toBe(true);
      const k = zones.findIndex((z) => g.spawnX >= z.x0 && g.spawnX < z.x1);
      const spawnZone = zones[k];
      expect(spawnZone?.biome).toBe(SPAWN_BIOME);
      for (const n of [zones[k - 1], zones[k + 1]]) if (n) expect(FAR_BIOMES.includes(n.biome), `seed ${seed}`).toBe(false);
      // Spawn zone sits near the world centre.
      expect(Math.abs(g.spawnX - g.world.width / 2)).toBeLessThan(BIOMES[SPAWN_BIOME].width[1]);
    }
  });

  it('writes surfaceY near the surface base and a bedrock bottom row', () => {
    const w = gen(SEED).world;
    for (let x = 0; x < w.width; x++) {
      expect(Math.abs((w.surfaceY[x] ?? 0) - WORLD.surfaceBase)).toBeLessThan(50);
      expect(w.fg[(w.height - 1) * w.width + x]).toBe(TILE_INDEX.bedrock);
    }
  });

  it('carves caves below cavesDepth and fills them with ore by depth', () => {
    const w = gen(SEED).world;
    let air = 0;
    let cells = 0;
    const depthSum: Partial<Record<TileId, { sum: number; n: number }>> = {};
    for (let x = 0; x < w.width; x++) {
      const s = w.surfaceY[x] ?? 0;
      for (let y = s + 1; y < w.height; y++) {
        const t = tileIdOf(w.fg[y * w.width + x] ?? 0);
        if (y - s >= WORLD.cavesDepth) {
          cells++;
          if (t === 'air') air++;
        }
        if (t.startsWith('ore_')) {
          const d = (depthSum[t] ??= { sum: 0, n: 0 });
          d.sum += y - s;
          d.n++;
        }
      }
    }
    expect(air / cells).toBeGreaterThan(0.1);
    expect(air / cells).toBeLessThan(0.45);
    const mean = (t: TileId): number => (depthSum[t] ? depthSum[t].sum / depthSum[t].n : NaN);
    for (const t of ['ore_coal', 'ore_copper', 'ore_iron'] as const) expect(depthSum[t]?.n ?? 0).toBeGreaterThan(300);
    expect(mean('ore_coal')).toBeLessThan(mean('ore_copper'));
    expect(mean('ore_copper')).toBeLessThan(mean('ore_iron'));
  });

  it('places settled water on the surface and underground', () => {
    const w = gen(SEED).world;
    let surface = 0;
    let underground = 0;
    let unsettled = 0;
    for (let i = 0; i < w.liquid.length; i++) {
      if (!w.liquid[i]) continue;
      const x = i % w.width;
      const y = (i / w.width) | 0;
      if (y - (w.surfaceY[x] ?? 0) >= WORLD.cavesDepth) underground++;
      else surface++;
      const below = i + w.width;
      if (!(TILE_DEFS[w.fg[below] ?? 0]?.blocksLiquid ?? true) && (w.liquid[below] ?? 0) < LIQUID.max) unsettled++;
      expect(TILE_DEFS[w.fg[i] ?? 0]?.blocksLiquid).toBe(false);
    }
    expect(surface).toBeGreaterThan(50);
    expect(underground).toBeGreaterThan(200);
    expect(unsettled).toBe(0);
    expect(w.liquidActive.size).toBe(0);
  });

  it('grows trees and gives backgrounds to underground cells', () => {
    const w = gen(SEED).world;
    const c = countTiles(w);
    expect(c.log).toBeGreaterThan(100);
    expect(c.leaves).toBeGreaterThan(300);
    const x = 100;
    const y = (w.surfaceY[x] ?? 0) + WORLD.cavesDepth;
    expect(w.wall[y * w.width + x]).not.toBe(0);
  });

  it('places structures with filled containers in every biome that defines container loot', () => {
    for (const seed of [SEED, ...EXTRA_SEEDS]) {
      const g = gen(seed);
      const w = g.world;
      const perBiome = new Map<BiomeId, number>();
      let containerTiles = 0;
      for (let i = 0; i < w.fg.length; i++) {
        const t = tileIdOf(w.fg[i] ?? 0);
        if (!TILES[t].containerSlots) continue;
        containerTiles++;
        const b = biomeAt(w, i % w.width, (i / w.width) | 0);
        perBiome.set(b, (perBiome.get(b) ?? 0) + 1);
        expect(g.containers.get(i)?.slots.length).toBe(TILES[t].containerSlots);
      }
      expect(g.containers.size).toBe(containerTiles);
      for (const id of BIOME_IDS) {
        if (Object.keys(BIOMES[id].containerLoot).length === 0) continue;
        expect(perBiome.get(id) ?? 0, `${id} (seed ${seed})`).toBeGreaterThan(0);
      }
    }
  });

  it('scatters scrap piles on the surface and in caves', () => {
    const w = gen(SEED).world;
    let surface = 0;
    let caves = 0;
    for (let i = 0; i < w.fg.length; i++) {
      if (w.fg[i] !== TILE_INDEX.scrap_pile) continue;
      const x = i % w.width;
      const y = (i / w.width) | 0;
      if (y - (w.surfaceY[x] ?? 0) >= WORLD.cavesDepth) caves++;
      else surface++;
      expect(TILE_DEFS[w.fg[i + w.width] ?? 0]?.solid).toBe(true);
    }
    expect(surface).toBeGreaterThan(20);
    expect(caves).toBeGreaterThan(5);
  });

  it('leaves no loose gravity tiles', () => {
    expect(gen(SEED).world.fallingActive.size).toBe(0);
  });

  it('has valid blueprints for every structure kind', () => {
    const rng = createRng(1);
    for (const kind of STRUCTURE_KINDS) {
      const bp = buildBlueprint(kind, rng);
      expect(blueprintWidth(bp)).toBeGreaterThan(0);
      expect(bp.ground).toBeLessThan(bp.rows.length);
      for (const row of bp.rows) for (const ch of row) if (ch !== ' ') expect(LEGEND[ch], `${kind} '${ch}'`).toBeDefined();
    }
  });
});
