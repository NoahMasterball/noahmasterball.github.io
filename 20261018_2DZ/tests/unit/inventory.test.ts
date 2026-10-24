import { describe, expect, it } from 'vitest';
import { PLAYER } from '../../src/config/sim.ts';
import { ITEMS } from '../../src/data/items.ts';
import { addItem, countItem, createInventory, hasRoomFor, removeItem, roomFor, takeFromSlot } from '../../src/sim/inventory.ts';
import { makeState } from './support/makeState.ts';
import { FLAT, give, run, settle } from './playerHelpers.ts';

const STONE_MAX = ITEMS.stone.maxStack;

describe('inventory helpers', () => {
  it('fills existing stacks first, then empty slots, and reports overflow', () => {
    const inv = createInventory(3);
    inv.slots[1] = { item: 'stone', count: STONE_MAX - 5 };
    expect(addItem(inv, 'stone', 10)).toBe(0);
    expect(inv.slots[1]?.count).toBe(STONE_MAX);
    expect(inv.slots[0]).toEqual({ item: 'stone', count: 5 });
    expect(roomFor(inv, 'stone')).toBe(STONE_MAX * 2 - 5);
    expect(addItem(inv, 'stone', STONE_MAX * 3)).toBe(STONE_MAX + 5);
    expect(hasRoomFor(inv, 'stone', 1)).toBe(false);
    expect(countItem(inv, 'stone')).toBe(STONE_MAX * 3);
  });

  it('removes across stacks and takes from one slot', () => {
    const inv = createInventory(3);
    addItem(inv, 'ammo_9mm', 20);
    inv.slots[2] = { item: 'ammo_9mm', count: 5 };
    expect(removeItem(inv, 'ammo_9mm', 7)).toBe(7);
    expect(countItem(inv, 'ammo_9mm')).toBe(18);
    expect(inv.slots[2]).toBeNull();
    expect(takeFromSlot(inv, 0, 100)).toEqual({ item: 'ammo_9mm', count: 18 });
    expect(inv.slots[0]).toBeNull();
    expect(removeItem(inv, 'ammo_9mm', 1)).toBe(0);
  });

  it('single-stack items never stack', () => {
    const inv = createInventory(2);
    expect(addItem(inv, 'pistol', 3)).toBe(1);
    expect(inv.slots.every((s) => s?.count === 1)).toBe(true);
  });
});

describe('inventory controls', () => {
  it('selectHotbar clamps', () => {
    const s = makeState(FLAT);
    run(s, { controls: [{ type: 'selectHotbar', slot: 99 }] }, 1);
    expect(s.player.hotbar).toBe(PLAYER.hotbarSlots - 1);
    run(s, { controls: [{ type: 'selectHotbar', slot: -3 }] }, 1);
    expect(s.player.hotbar).toBe(0);
  });

  it('moveStack merges up to maxStack, swaps different items, moves partial counts', () => {
    const s = makeState(FLAT);
    const inv = s.player.inventory;
    give(s, 10, 'stone', STONE_MAX - 3);
    give(s, 11, 'stone', 10);
    run(s, { controls: [{ type: 'moveStack', from: { where: 'player', slot: 11 }, to: { where: 'player', slot: 10 } }] }, 1);
    expect(inv.slots[10]?.count).toBe(STONE_MAX);
    expect(inv.slots[11]?.count).toBe(7);
    give(s, 12, 'dirt', 4);
    run(s, { controls: [{ type: 'moveStack', from: { where: 'player', slot: 12 }, to: { where: 'player', slot: 11 } }] }, 1);
    expect(inv.slots[11]).toEqual({ item: 'dirt', count: 4 });
    expect(inv.slots[12]).toEqual({ item: 'stone', count: 7 });
    run(s, { controls: [{ type: 'moveStack', from: { where: 'player', slot: 12 }, to: { where: 'player', slot: 20 }, count: 2 }] }, 1);
    expect(inv.slots[12]?.count).toBe(5);
    expect(inv.slots[20]).toEqual({ item: 'stone', count: 2 });
    // partial onto a different item: nothing happens
    run(s, { controls: [{ type: 'moveStack', from: { where: 'player', slot: 12 }, to: { where: 'player', slot: 11 }, count: 1 }] }, 1);
    expect(inv.slots[11]).toEqual({ item: 'dirt', count: 4 });
  });

  it('quickMove without a container moves hotbar ↔ backpack', () => {
    const s = makeState(FLAT);
    const inv = s.player.inventory;
    const torch = { ...inv.slots[2] };
    run(s, { controls: [{ type: 'quickMove', from: { where: 'player', slot: 2 } }] }, 1);
    expect(inv.slots[2]).toBeNull();
    expect(inv.slots[PLAYER.hotbarSlots]).toEqual(torch);
    run(s, { controls: [{ type: 'quickMove', from: { where: 'player', slot: PLAYER.hotbarSlots } }] }, 1);
    expect(inv.slots[PLAYER.hotbarSlots]).toBeNull();
    expect(countItem(inv, 'torch')).toBe(torch?.count);
  });

  it('dropStack throws the stack in front of the player', () => {
    const s = makeState(FLAT);
    settle(s);
    run(s, { aimX: 19 }, 1); // face right
    run(s, { aimX: 19, controls: [{ type: 'dropStack', from: { where: 'player', slot: 2 }, count: 2 }] }, 1);
    expect(s.drops).toHaveLength(1);
    expect(s.drops[0]?.stack).toEqual({ item: 'torch', count: 2 });
    expect(s.drops[0]?.body.vx).toBeGreaterThan(0);
    expect(countItem(s.player.inventory, 'torch')).toBe(PLAYER.startKit.torch - 2);
  });
});
