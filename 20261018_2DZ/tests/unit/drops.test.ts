import { describe, expect, it } from 'vitest';
import { DROPS, PLAYER, TICK_RATE } from '../../src/config/sim.ts';
import { ITEMS } from '../../src/data/items.ts';
import { spawnDrop } from '../../src/sim/drops.ts';
import { countItem } from '../../src/sim/inventory.ts';
import { makeState } from './support/makeState.ts';
import { FLAT, run, settle } from './playerHelpers.ts';

describe('drops', () => {
  it('merges an identical drop nearby and allocates ids', () => {
    const s = makeState(FLAT);
    spawnDrop(s, 15, 3, { item: 'stone', count: 3 });
    spawnDrop(s, 15.2, 3, { item: 'stone', count: 4 });
    spawnDrop(s, 15, 3, { item: 'dirt', count: 1 });
    expect(s.drops).toHaveLength(2);
    expect(s.drops[0]?.stack.count).toBe(7);
    expect(s.drops[0]?.id).not.toBe(s.drops[1]?.id);
  });

  it('splits stacks above maxStack', () => {
    const s = makeState(FLAT);
    spawnDrop(s, 15, 3, { item: 'pistol', count: 2 });
    expect(s.drops).toHaveLength(2);
  });

  it('falls and comes to rest on the ground', () => {
    const s = makeState(FLAT);
    spawnDrop(s, 15, 1, { item: 'stone', count: 1 });
    run(s, {}, TICK_RATE * 2);
    const d = s.drops[0];
    expect(d?.body.onGround).toBe(true);
    expect((d?.body.y ?? 0) + DROPS.size).toBeCloseTo(7, 5);
    expect(d?.body.vx).toBe(0);
  });

  it('is pulled in and picked up by the player', () => {
    const s = makeState(FLAT);
    settle(s);
    const b = s.player.body;
    spawnDrop(s, b.x + b.w + PLAYER.pickupMagnet - 0.5, b.y + b.h - 0.5, { item: 'clay', count: 2 }, { vx: 0, vy: 0 });
    run(s, {}, TICK_RATE);
    expect(s.drops).toHaveLength(0);
    expect(countItem(s.player.inventory, 'clay')).toBe(2);
  });

  it('partial pickup keeps the remainder', () => {
    const s = makeState(FLAT);
    settle(s);
    const slots = s.player.inventory.slots;
    for (let i = 0; i < slots.length; i++) slots[i] = { item: 'stone', count: ITEMS.stone.maxStack };
    slots[0] = { item: 'clay', count: ITEMS.clay.maxStack - 3 };
    const b = s.player.body;
    spawnDrop(s, b.x + b.w / 2, b.y + b.h - 0.5, { item: 'clay', count: 10 }, { vx: 0, vy: 0 });
    run(s, {}, TICK_RATE);
    expect(slots[0]?.count).toBe(ITEMS.clay.maxStack);
    expect(s.drops).toHaveLength(1);
    expect(s.drops[0]?.stack.count).toBe(7);
  });

  it('thrown drops are not picked up again at once', () => {
    const s = makeState(FLAT);
    settle(s);
    const b = s.player.body;
    spawnDrop(s, b.x + b.w / 2, b.y + b.h - 0.5, { item: 'clay', count: 1 }, { vx: 0, vy: 0, pickupDelay: DROPS.throwPickupDelay });
    run(s, {}, Math.floor(TICK_RATE * DROPS.throwPickupDelay) - 2);
    expect(s.drops).toHaveLength(1);
    run(s, {}, 4);
    expect(s.drops).toHaveLength(0);
  });

  it('expires after its lifetime and is not picked up by a dead player', () => {
    const s = makeState(FLAT);
    spawnDrop(s, 15, 3, { item: 'stone', count: 1 });
    const d = s.drops[0];
    if (!d) throw new Error('no drop');
    d.age = DROPS.lifetimeSeconds - 0.5 / TICK_RATE;
    run(s, {}, 1);
    expect(s.drops).toHaveLength(0);

    const dead = makeState(FLAT);
    settle(dead);
    dead.player.dead = true;
    dead.player.respawnTimer = 100;
    const pb = dead.player.body;
    spawnDrop(dead, pb.x + pb.w / 2, pb.y + pb.h - 0.5, { item: 'clay', count: 1 });
    run(dead, {}, TICK_RATE);
    expect(dead.drops).toHaveLength(1);
  });
});
