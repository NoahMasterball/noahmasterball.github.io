// OWNER: agent "player" (C). Inventory/crafting UI actions (ControlMessage) → state changes.
import { DROPS, PLAYER } from '../config/sim.ts';
import type { ControlMessage, SlotRef } from './commands.ts';
import { craft } from './crafting.ts';
import { bodyCentreX, bodyCentreY, spawnDrop } from './drops.ts';
import { addItemRange, maxStackOf, takeFromSlot } from './inventory.ts';
import type { Inventory, SimState } from './state.ts';

/** The open container's inventory, or null. */
export function openContainerInventory(state: SimState): Inventory | null {
  const c = state.player.openContainer;
  return c >= 0 ? (state.containers.get(c) ?? null) : null;
}

function resolve(state: SimState, ref: SlotRef): Inventory | null {
  const inv = ref.where === 'player' ? state.player.inventory : openContainerInventory(state);
  if (!inv || ref.slot < 0 || ref.slot >= inv.slots.length) return null;
  return inv;
}

function moveStack(state: SimState, from: SlotRef, to: SlotRef, count?: number): void {
  const a = resolve(state, from);
  const b = resolve(state, to);
  if (!a || !b) return;
  if (a === b && from.slot === to.slot) return;
  const src = a.slots[from.slot];
  if (!src) return;
  const n = Math.max(0, Math.min(count ?? src.count, src.count));
  if (n === 0) return;
  const dst = b.slots[to.slot];
  if (!dst) {
    b.slots[to.slot] = takeFromSlot(a, from.slot, n);
    return;
  }
  if (dst.item === src.item) {
    const moved = Math.min(n, maxStackOf(dst.item) - dst.count);
    if (moved <= 0) return;
    dst.count += moved;
    takeFromSlot(a, from.slot, moved);
    return;
  }
  // Different items: only a whole-stack move swaps.
  if (n !== src.count) return;
  a.slots[from.slot] = dst;
  b.slots[to.slot] = src;
}

function quickMove(state: SimState, from: SlotRef): void {
  const a = resolve(state, from);
  if (!a) return;
  const src = a.slots[from.slot];
  if (!src) return;
  const p = state.player;
  const container = openContainerInventory(state);
  let target: Inventory;
  let start: number;
  let end: number;
  if (from.where === 'container') {
    target = p.inventory;
    start = 0;
    end = p.inventory.slots.length;
  } else if (container) {
    target = container;
    start = 0;
    end = container.slots.length;
  } else {
    target = p.inventory;
    const inHotbar = from.slot < PLAYER.hotbarSlots;
    start = inHotbar ? PLAYER.hotbarSlots : 0;
    end = inHotbar ? p.inventory.slots.length : PLAYER.hotbarSlots;
  }
  // The target range never contains the source slot, so `src` is untouched by the add.
  const left = addItemRange(target, src.item, src.count, start, end);
  takeFromSlot(a, from.slot, src.count - left);
}

function dropStack(state: SimState, from: SlotRef, count?: number): void {
  const a = resolve(state, from);
  if (!a) return;
  const stack = takeFromSlot(a, from.slot, count);
  if (!stack) return;
  const p = state.player;
  const x = bodyCentreX(p.body) + p.facing * (p.body.w / 2 + DROPS.size);
  spawnDrop(state, x, bodyCentreY(p.body), stack, {
    vx: p.facing * DROPS.throwSpeed,
    vy: -DROPS.popUpSpeed,
    pickupDelay: DROPS.throwPickupDelay,
  });
}

/** QA: puts the player body's top-left at (x, y) and stops it (no fall damage from the jump). */
function qaTeleport(state: SimState, x: number, y: number): void {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const b = state.player.body;
  b.x = x;
  b.y = y;
  b.vx = 0;
  b.vy = 0;
  b.fallSpeed = 0;
  b.onGround = false;
}

/** QA: sets the clock; any finite value is wrapped into [0, 1) like advanceTime does. */
function qaSetTime(state: SimState, timeOfDay: number): void {
  if (!Number.isFinite(timeOfDay)) return;
  state.timeOfDay = timeOfDay - Math.floor(timeOfDay);
}

export function applyControls(state: SimState, controls: readonly ControlMessage[]): void {
  const p = state.player;
  for (const c of controls) {
    // QA controls work at any time; player actions are ignored while dead.
    if (c.type === 'qaTeleport') {
      qaTeleport(state, c.x, c.y);
      continue;
    }
    if (c.type === 'qaSetTime') {
      qaSetTime(state, c.timeOfDay);
      continue;
    }
    if (p.dead) continue;
    switch (c.type) {
      case 'selectHotbar':
        p.hotbar = Math.max(0, Math.min(PLAYER.hotbarSlots - 1, Math.floor(c.slot)));
        break;
      case 'moveStack':
        moveStack(state, c.from, c.to, c.count);
        break;
      case 'quickMove':
        quickMove(state, c.from);
        break;
      case 'dropStack':
        dropStack(state, c.from, c.count);
        break;
      case 'craft':
        craft(state, c.recipe, c.times);
        break;
      case 'closeContainer':
        p.openContainer = -1;
        break;
    }
  }
}
