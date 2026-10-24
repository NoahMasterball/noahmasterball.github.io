import { describe, expect, it } from 'vitest';
import { ITEMS } from '../../src/data/items.ts';
import { LOOT_TABLES } from '../../src/data/loot.ts';
import { LOOT_TABLE_IDS } from '../../src/data/schema.ts';
import { createLootContainer, rollLoot } from '../../src/sim/loot.ts';
import { createRng } from '../../src/sim/rng.ts';

describe('loot', () => {
  it('is deterministic for the same rng seed', () => {
    for (const t of LOOT_TABLE_IDS) {
      expect(rollLoot(createRng(42), t)).toEqual(rollLoot(createRng(42), t));
      expect(createLootContainer(createRng(7), t, 10)).toEqual(createLootContainer(createRng(7), t, 10));
    }
  });

  it('only yields table items, merged and within stack limits', () => {
    for (const t of LOOT_TABLE_IDS) {
      const allowed = new Set(LOOT_TABLES[t].entries.map((e) => e.item));
      for (let seed = 1; seed <= 200; seed++) {
        const stacks = rollLoot(createRng(seed), t);
        const partial = new Set<string>();
        for (const s of stacks) {
          expect(allowed.has(s.item)).toBe(true);
          expect(s.count).toBeGreaterThan(0);
          expect(s.count).toBeLessThanOrEqual(ITEMS[s.item].maxStack);
          // Merged: at most one non-full stack per item.
          if (s.count < ITEMS[s.item].maxStack) {
            expect(partial.has(s.item)).toBe(false);
            partial.add(s.item);
          }
        }
      }
    }
  });

  it('rolls empty sometimes for tables with emptyChance and never for 0', () => {
    let empty = 0;
    for (let seed = 1; seed <= 400; seed++) if (rollLoot(createRng(seed), 'zombie_common').length === 0) empty++;
    expect(empty).toBeGreaterThan(100);
    expect(empty).toBeLessThan(300);
    expect(LOOT_TABLES.zombie_brute.emptyChance).toBe(0);
    for (let seed = 1; seed <= 100; seed++) expect(rollLoot(createRng(seed), 'zombie_brute').length).toBeGreaterThan(0);
  });

  it('fills containers in distinct random slots', () => {
    let spread = false;
    for (let seed = 1; seed <= 50; seed++) {
      const inv = createLootContainer(createRng(seed), 'military_crate', 10);
      expect(inv.slots.length).toBe(10);
      const filled = inv.slots.filter((s) => s !== null);
      expect(filled.length).toBe(Math.min(10, rollLoot(createRng(seed), 'military_crate').length));
      if (inv.slots[0] === null && filled.length > 0) spread = true;
    }
    expect(spread).toBe(true);
  });
});
