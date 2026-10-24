import { describe, expect, it } from 'vitest';
import { WORLD } from '../../src/config/sim.ts';
import { TILE_INDEX } from '../../src/data/content.ts';
import { BIOME_IDS } from '../../src/data/schema.ts';
import { SPAWN_CLEARANCE, spawnCentreX } from '../../src/sim/worldgen/context.ts';
import { generateWorld } from '../../src/sim/worldgen/index.ts';
import { TREE_SPACING, TRUNK_HEIGHT } from '../../src/sim/worldgen/trees.ts';

const LOG = TILE_INDEX.log;
const LEAVES = TILE_INDEX.leaves;
const GRASS = TILE_INDEX.grass;

describe('worldgen trees (Terraria-style)', () => {
  for (const seed of [WORLD.defaultSeed, 42, 777]) {
    it(`grows tall single-tile trunks with a leaf crown (seed ${seed})`, () => {
      const w = generateWorld(seed).world;
      const at = (x: number, y: number): number => w.fg[y * w.width + x] ?? -1;
      const trunks: { x: number; h: number }[] = [];
      for (let x = 0; x < w.width; x++) {
        const ground = w.surfaceY[x] ?? 0;
        // Trunk base: log on grass with log above (roots are single stubs).
        if (at(x, ground) !== GRASS || at(x, ground - 1) !== LOG || at(x, ground - 2) !== LOG) continue;
        let h = 0;
        while (at(x, ground - 1 - h) === LOG) h++;
        trunks.push({ x, h });
        expect(h).toBeGreaterThanOrEqual(TRUNK_HEIGHT[0]);
        expect(h).toBeLessThanOrEqual(TRUNK_HEIGHT[1]);
        // Crown directly on top of the trunk.
        expect(at(x, ground - 1 - h)).toBe(LEAVES);
        // Single-tile trunk: no log beside the upper trunk except branches (never two in a row).
        let side = 0;
        for (let y = ground - 2; y > ground - 1 - h; y--) {
          if (at(x - 1, y) === LOG || at(x + 1, y) === LOG) side++;
          else side = 0;
          expect(side).toBeLessThan(2);
        }
      }
      expect(trunks.length).toBeGreaterThan(30);
      const mean = trunks.reduce((s, t) => s + t.h, 0) / trunks.length;
      expect(mean).toBeGreaterThan(12);
      for (let i = 1; i < trunks.length; i++) {
        expect((trunks[i]?.x ?? 0) - (trunks[i - 1]?.x ?? 0)).toBeGreaterThan(TREE_SPACING);
      }

      // Forest is dense: on average a trunk every few open grass columns.
      const forest = BIOME_IDS.indexOf('forest');
      let forestCols = 0;
      for (let x = 0; x < w.width; x++) if (w.biome[x] === forest && at(x, w.surfaceY[x] ?? 0) === GRASS) forestCols++;
      const forestTrunks = trunks.filter((t) => w.biome[t.x] === forest).length;
      if (forestCols > 0) expect(forestCols / forestTrunks).toBeLessThan(8);

      // Never in water, never into a structure/cave background, spawn area stays clear.
      const centre = spawnCentreX(w.width);
      for (let i = 0; i < w.fg.length; i++) {
        const t = w.fg[i];
        if (t !== LOG && t !== LEAVES) continue;
        const x = i % w.width;
        const y = (i / w.width) | 0;
        if (y > (w.surfaceY[x] ?? 0)) continue;
        expect(w.liquid[i]).toBe(0);
        expect(w.wall[i]).toBe(0);
        expect(Math.abs(x - centre) >= SPAWN_CLEARANCE || y >= (w.surfaceY[x] ?? 0)).toBe(true);
        expect(y).toBeGreaterThan(0);
      }
    });
  }
});
