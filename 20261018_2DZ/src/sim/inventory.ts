// OWNER: agent "player" (C). Pure inventory helpers (stacking via ItemDef.maxStack).
import { ITEMS } from '../data/items.ts';
import type { ItemId } from '../data/schema.ts';
import type { Inventory, ItemStack } from './state.ts';

export function createInventory(slots: number): Inventory {
  return { slots: Array.from({ length: slots }, () => null) };
}

export function maxStackOf(item: ItemId): number {
  return ITEMS[item].maxStack;
}

/**
 * Adds items into slots [start, end), filling existing stacks first, then empty slots in order.
 * Returns the count that did not fit.
 */
export function addItemRange(inv: Inventory, item: ItemId, count: number, start: number, end: number): number {
  const max = maxStackOf(item);
  let left = count;
  for (let i = start; i < end && left > 0; i++) {
    const s = inv.slots[i];
    if (s && s.item === item && s.count < max) {
      const n = Math.min(left, max - s.count);
      s.count += n;
      left -= n;
    }
  }
  for (let i = start; i < end && left > 0; i++) {
    if (inv.slots[i] === null) {
      const n = Math.min(left, max);
      inv.slots[i] = { item, count: n };
      left -= n;
    }
  }
  return left;
}

/** Adds items, filling existing stacks first. Returns the count that did not fit. */
export function addItem(inv: Inventory, item: ItemId, count: number): number {
  return addItemRange(inv, item, count, 0, inv.slots.length);
}

/** How many of `item` the slots [start, end) can still take. */
export function roomForRange(inv: Inventory, item: ItemId, start: number, end: number): number {
  const max = maxStackOf(item);
  let room = 0;
  for (let i = start; i < end; i++) {
    const s = inv.slots[i];
    if (s === null || s === undefined) room += max;
    else if (s.item === item) room += Math.max(0, max - s.count);
  }
  return room;
}

export function roomFor(inv: Inventory, item: ItemId): number {
  return roomForRange(inv, item, 0, inv.slots.length);
}

export function hasRoomFor(inv: Inventory, item: ItemId, count: number): boolean {
  return roomFor(inv, item) >= count;
}

export function countItem(inv: Inventory, item: ItemId): number {
  let n = 0;
  for (const s of inv.slots) if (s && s.item === item) n += s.count;
  return n;
}

/** Removes up to `count` of `item` (last slots first, so the hotbar keeps its stacks). Returns removed count. */
export function removeItem(inv: Inventory, item: ItemId, count: number): number {
  let left = count;
  for (let i = inv.slots.length - 1; i >= 0 && left > 0; i--) {
    const s = inv.slots[i];
    if (!s || s.item !== item) continue;
    const n = Math.min(left, s.count);
    s.count -= n;
    left -= n;
    if (s.count <= 0) inv.slots[i] = null;
  }
  return count - left;
}

/** Takes up to `count` (default: all) from one slot. Returns the taken stack or null. */
export function takeFromSlot(inv: Inventory, slot: number, count?: number): ItemStack | null {
  const s = inv.slots[slot];
  if (!s) return null;
  const n = Math.max(0, Math.min(count ?? s.count, s.count));
  if (n === 0) return null;
  s.count -= n;
  if (s.count <= 0) inv.slots[slot] = null;
  return { item: s.item, count: n };
}

/** Empties the inventory and returns every stack it held. */
export function takeAll(inv: Inventory): ItemStack[] {
  const out: ItemStack[] = [];
  for (let i = 0; i < inv.slots.length; i++) {
    const s = inv.slots[i];
    if (s) out.push(s);
    inv.slots[i] = null;
  }
  return out;
}
