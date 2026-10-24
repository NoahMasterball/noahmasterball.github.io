import { describe, expect, it } from 'vitest';
import { DT, PLAYER, TICK_RATE } from '../../src/config/sim.ts';
import type { ItemId } from '../../src/data/schema.ts';
import { countItem } from '../../src/sim/inventory.ts';
import { makeState } from './support/makeState.ts';
import { FLAT, run, settle } from './playerHelpers.ts';

describe('player', () => {
  it('starts with the start kit', () => {
    const s = makeState(FLAT);
    for (const [item, n] of Object.entries(PLAYER.startKit) as [ItemId, number][]) {
      expect(countItem(s.player.inventory, item)).toBe(n);
    }
  });

  it('lands on the floor and walks right with acceleration', () => {
    const s = makeState(FLAT);
    settle(s);
    expect(s.player.body.onGround).toBe(true);
    expect(s.player.body.y + s.player.body.h).toBeCloseTo(7, 5);
    const x0 = s.player.body.x;
    run(s, { moveX: 1, aimX: 19 }, 1);
    expect(s.player.body.vx).toBeCloseTo(PLAYER.accel * DT, 5);
    run(s, { moveX: 1, aimX: 19 }, TICK_RATE - 1);
    expect(s.player.body.vx).toBeCloseTo(PLAYER.walkSpeed, 5);
    expect(s.player.body.x - x0).toBeGreaterThan(PLAYER.walkSpeed * 0.8);
    expect(s.player.facing).toBe(1);
  });

  it('jumps and lands again', () => {
    const s = makeState(FLAT);
    settle(s);
    const y0 = s.player.body.y;
    run(s, { jump: true }, 1);
    expect(s.player.body.vy).toBeLessThan(0);
    run(s, {}, 10);
    expect(s.player.body.y).toBeLessThan(y0 - 1);
    run(s, {}, TICK_RATE * 2);
    expect(s.player.body.onGround).toBe(true);
    expect(s.player.body.y).toBeCloseTo(y0, 5);
  });

  it('steps up a one-tile ledge without jumping', () => {
    const s = makeState([
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '....................',
      '......##############',
      '####################',
    ]);
    settle(s);
    run(s, { moveX: 1, aimX: 19 }, TICK_RATE);
    expect(s.player.body.x).toBeGreaterThan(7);
    expect(s.player.body.y + s.player.body.h).toBeCloseTo(6, 5);
  });

  it('takes fall damage from a high fall but not from a short one', () => {
    const rows = Array.from({ length: 40 }, (_, y) => (y === 39 ? '#'.repeat(10) : '.'.repeat(10)));
    const s = makeState(rows);
    run(s, {}, TICK_RATE * 3);
    expect(s.player.body.onGround).toBe(true);
    expect(s.player.health).toBeLessThan(PLAYER.maxHealth - 10);
    expect(s.player.dead).toBe(false);

    const short = makeState(FLAT);
    run(short, {}, TICK_RATE * 2);
    expect(short.player.health).toBe(PLAYER.maxHealth);
  });

  it('drains hunger/thirst and starves at 0', () => {
    const s = makeState(FLAT);
    settle(s);
    const h0 = s.player.hunger;
    run(s, {}, TICK_RATE * 10);
    expect(s.player.hunger).toBeCloseTo(h0 - PLAYER.hungerRate * 10, 3);
    s.player.hunger = 0;
    const hp = s.player.health;
    run(s, {}, TICK_RATE * 2);
    expect(s.player.health).toBeCloseTo(hp - PLAYER.starveDamage * 2, 3);
  });

  it('regenerates while fed', () => {
    const s = makeState(FLAT);
    settle(s);
    s.player.health = 50;
    run(s, {}, TICK_RATE * 2);
    expect(s.player.health).toBeCloseTo(50 + PLAYER.regenRate * 2, 3);
  });

  it('dies: drops the inventory, ignores input, respawns with full stats and the start kit', () => {
    const s = makeState(FLAT);
    settle(s);
    s.player.inventory.slots[9] = { item: 'stone', count: 30 };
    s.player.spawnX = 10;
    s.player.spawnY = 0;
    s.player.health = 0;
    run(s, {}, 1);
    expect(s.events.some((e) => e.type === 'playerDied')).toBe(true);
    expect(s.player.dead).toBe(true);
    expect(s.player.inventory.slots.every((x) => x === null)).toBe(true);
    const stone = s.drops.filter((d) => d.stack.item === 'stone').reduce((n, d) => n + d.stack.count, 0);
    expect(stone).toBe(30);
    const x = s.player.body.x;
    run(s, { moveX: 1, aimX: 19 }, 30);
    expect(s.player.body.x).toBe(x);
    run(s, {}, Math.ceil(PLAYER.respawnSeconds * TICK_RATE));
    expect(s.player.dead).toBe(false);
    expect(s.player.health).toBe(PLAYER.maxHealth);
    expect(s.player.body.x).toBe(10);
    expect(countItem(s.player.inventory, 'stone')).toBe(0);
    expect(countItem(s.player.inventory, 'kitchen_knife')).toBe(PLAYER.startKit.kitchen_knife);
  });

  it('swims up with jump in deep water', () => {
    const rows = ['..........', ...Array.from({ length: 10 }, () => '#~~~~~~~~#'), '##########'];
    const s = makeState(rows, { player: { x: 3, y: 6 } });
    run(s, {}, 10);
    expect(s.player.body.inLiquid).toBe(true);
    const y0 = s.player.body.y;
    run(s, { jump: true }, 10);
    expect(s.player.body.y).toBeLessThan(y0 - 1);
  });
});
