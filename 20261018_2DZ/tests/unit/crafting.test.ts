import { describe, expect, it } from 'vitest';
import { PLAYER } from '../../src/config/sim.ts';
import { ITEMS } from '../../src/data/items.ts';
import { RECIPES } from '../../src/data/recipes.ts';
import { canCraft, craft } from '../../src/sim/crafting.ts';
import { countItem } from '../../src/sim/inventory.ts';
import { makeState } from './support/makeState.ts';
import { FLAT, give, run, settle } from './playerHelpers.ts';

function withBenchAt(x: number): string[] {
  const width = Math.max(20, x + 1);
  const rows = FLAT.map((r) => r.padEnd(width, r[0]));
  rows[6] = '.'.repeat(x) + 'w' + '.'.repeat(width - x - 1);
  return rows;
}

describe('crafting', () => {
  it('crafts planks anywhere, limited by inputs', () => {
    expect(RECIPES.planks.station).toBeNull();
    const s = makeState(FLAT);
    give(s, 10, 'wood', 2);
    expect(craft(s, 'planks', 5)).toBe(2);
    expect(countItem(s.player.inventory, 'wood')).toBe(0);
    expect(countItem(s.player.inventory, 'planks')).toBe(2 * RECIPES.planks.output.count);
    expect(s.events).toContainEqual({ type: 'crafted', item: 'planks', count: 2 * RECIPES.planks.output.count });
  });

  it('needs the station in range', () => {
    expect(RECIPES.chest.station).toBe('workbench');
    const planks = RECIPES.chest.inputs.find((i) => i.item === 'planks')?.count ?? 0;

    const none = makeState(FLAT);
    give(none, 10, 'planks', planks);
    expect(canCraft(none, 'chest')).toBe(false);
    expect(craft(none, 'chest', 1)).toBe(0);

    const far = makeState(withBenchAt(Math.ceil(PLAYER.reach * PLAYER.stationReachFactor) + 4));
    settle(far);
    give(far, 10, 'planks', planks);
    expect(canCraft(far, 'chest')).toBe(false);

    const near = makeState(withBenchAt(5));
    settle(near);
    give(near, 10, 'planks', planks);
    expect(canCraft(near, 'chest')).toBe(true);
    run(near, { controls: [{ type: 'craft', recipe: 'chest', times: 1 }] }, 1);
    expect(countItem(near.player.inventory, 'chest')).toBe(1);
    expect(countItem(near.player.inventory, 'planks')).toBe(0);
  });

  it('drops output that does not fit', () => {
    const s = makeState(FLAT);
    const slots = s.player.inventory.slots;
    for (let i = 0; i < slots.length; i++) slots[i] = { item: 'stone', count: ITEMS.stone.maxStack };
    slots[0] = { item: 'wood', count: 1 };
    expect(craft(s, 'planks', 1)).toBe(1);
    // the wood slot freed up and holds the planks
    expect(countItem(s.player.inventory, 'planks')).toBe(RECIPES.planks.output.count);
    slots[0] = { item: 'wood', count: 2 };
    slots[1] = { item: 'planks', count: ITEMS.planks.maxStack - 1 };
    for (let i = 2; i < slots.length; i++) slots[i] = { item: 'stone', count: ITEMS.stone.maxStack };
    expect(craft(s, 'planks', 1)).toBe(1);
    const dropped = s.drops.filter((d) => d.stack.item === 'planks').reduce((n, d) => n + d.stack.count, 0);
    expect(dropped).toBe(RECIPES.planks.output.count - 1);
  });
});
