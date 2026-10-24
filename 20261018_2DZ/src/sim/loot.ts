// OWNER: agent "zombies" (D). Loot-table rolls and container filling. Deterministic for a given rng.
import { ITEMS } from '../data/items.ts';
import { LOOT_TABLES } from '../data/loot.ts';
import type { ItemId, LootTableId } from '../data/schema.ts';
import { chance, pickWeighted, randInt, type RngState } from './rng.ts';
import type { Inventory, ItemStack } from './state.ts';

/**
 * Rolls a table: empty with `emptyChance`, else `rolls` weighted draws with replacement.
 * Equal items are merged, then split into stacks of at most ItemDef.maxStack.
 */
export function rollLoot(rng: RngState, table: LootTableId): ItemStack[] {
  const def = LOOT_TABLES[table];
  if (chance(rng, def.emptyChance)) return [];
  // Entry index → weight, so pickWeighted (the one weighted picker) works on an array.
  const weights: Record<string, number> = {};
  def.entries.forEach((e, i) => {
    weights[i] = e.weight;
  });
  const totals = new Map<ItemId, number>();
  const rolls = randInt(rng, def.rolls[0], def.rolls[1]);
  for (let r = 0; r < rolls; r++) {
    const key = pickWeighted(rng, weights);
    const entry = key === null ? undefined : def.entries[Number(key)];
    if (!entry) continue;
    const n = randInt(rng, entry.count[0], entry.count[1]);
    totals.set(entry.item, (totals.get(entry.item) ?? 0) + n);
  }
  const stacks: ItemStack[] = [];
  for (const [item, total] of totals) {
    const max = ITEMS[item].maxStack;
    for (let left = total; left > 0; left -= max) stacks.push({ item, count: Math.min(max, left) });
  }
  return stacks;
}

/** New container inventory with `slots` slots filled from `table` (random distinct slot positions). */
export function createLootContainer(rng: RngState, table: LootTableId, slots: number): Inventory {
  const inv: Inventory = { slots: Array.from({ length: slots }, () => null) };
  const stacks = rollLoot(rng, table);
  // Fisher–Yates over slot indices; the first stacks.length entries are the chosen slots.
  const order = Array.from({ length: slots }, (_, i) => i);
  for (let i = slots - 1; i > 0; i--) {
    const j = randInt(rng, 0, i);
    const a = order[i] ?? i;
    order[i] = order[j] ?? j;
    order[j] = a;
  }
  const n = Math.min(stacks.length, slots);
  for (let k = 0; k < n; k++) inv.slots[order[k] ?? k] = stacks[k] ?? null;
  return inv;
}
