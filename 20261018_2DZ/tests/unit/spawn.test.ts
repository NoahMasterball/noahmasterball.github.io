import { describe, expect, it } from 'vitest';
import { DAY_NIGHT, PLAYER, SPAWN, TICK_RATE } from '../../src/config/sim.ts';
import { ZOMBIES } from '../../src/data/zombies.ts';
import { overlapsSolid } from '../../src/sim/physics.ts';
import { biomeTarget, populateInitialZombies, updateSpawning } from '../../src/sim/spawn.ts';
import type { SimState } from '../../src/sim/state.ts';
import { createZombie } from '../../src/sim/zombies.ts';
import { makeState } from './support/makeState.ts';

const W = 240;
const GROUND = 20;
const MIDNIGHT = 0;

function world(surfaceRows: string[] = []): string[] {
  const rows: string[] = [];
  for (let y = 0; y < GROUND - surfaceRows.length; y++) rows.push('.'.repeat(W));
  rows.push(...surfaceRows);
  for (let y = 0; y < 6; y++) rows.push('#'.repeat(W));
  rows.push('B'.repeat(W));
  return rows;
}

function setup(timeOfDay: number = DAY_NIGHT.startTime, rows = world()): SimState {
  return makeState(rows, { player: { x: W / 2, y: GROUND - PLAYER.height }, timeOfDay });
}

function runSpawning(state: SimState, seconds: number): void {
  for (let i = 0; i < seconds * TICK_RATE; i++) updateSpawning(state);
}

function centreDistance(state: SimState, x: number, y: number): number {
  const p = state.player.body;
  return Math.hypot(x - (p.x + p.w / 2), y - (p.y + p.h / 2));
}

function expectValid(state: SimState): void {
  for (const z of state.zombies) {
    const b = z.body;
    expect(overlapsSolid(state.world, b.x, b.y, b.w, b.h)).toBe(false);
    expect(overlapsSolid(state.world, b.x, b.y + 0.05, b.w, b.h)).toBe(true);
    expect(centreDistance(state, b.x + b.w / 2, b.y + b.h / 2)).toBeGreaterThanOrEqual(SPAWN.minDistance);
    expect(ZOMBIES[z.kind]).toBeDefined();
  }
}

describe('spawning', () => {
  it('spawns up to the biome budget on valid ground outside minDistance', () => {
    const s = setup();
    runSpawning(s, 120);
    const target = biomeTarget(s, 'plains');
    expect(s.zombies.length).toBeGreaterThan(0);
    expect(s.zombies.length).toBeLessThanOrEqual(Math.ceil(target));
    expectValid(s);
  });

  it('spawns more at night', () => {
    const day = setup();
    const night = setup(MIDNIGHT);
    expect(biomeTarget(night, 'plains')).toBeGreaterThan(biomeTarget(day, 'plains'));
    runSpawning(day, 120);
    runSpawning(night, 120);
    expect(night.zombies.length).toBeGreaterThan(day.zombies.length);
    expectValid(night);
  });

  it('respects SPAWN.maxZombies', () => {
    const s = setup(MIDNIGHT);
    for (let i = 0; i < SPAWN.maxZombies; i++) s.zombies.push(createZombie(s, 'walker', 10 + i, GROUND - ZOMBIES.walker.height, 'caves'));
    runSpawning(s, 30);
    expect(s.zombies.length).toBe(SPAWN.maxZombies);
  });

  it('never spawns in water', () => {
    const water = '~'.repeat(W);
    const s = setup(MIDNIGHT, world([water, water]));
    runSpawning(s, 60);
    expect(s.zombies.length).toBe(0);
  });

  it('despawns zombies beyond despawnDistance', () => {
    const rows = world().map((r) => r + r.slice(0, 120));
    const s = makeState(rows, { player: { x: 2, y: GROUND - PLAYER.height } });
    const far = createZombie(s, 'walker', 2 + SPAWN.despawnDistance + 20, GROUND - ZOMBIES.walker.height, 'plains');
    const near = createZombie(s, 'walker', 60, GROUND - ZOMBIES.walker.height, 'plains');
    s.zombies.push(far, near);
    updateSpawning(s);
    expect(s.zombies).toContain(near);
    expect(s.zombies).not.toContain(far);
  });

  it('populates the start area deterministically', () => {
    const a = setup();
    const b = setup();
    populateInitialZombies(a);
    populateInitialZombies(b);
    expect(a.zombies.length).toBeGreaterThan(0);
    expect(a.zombies.map((z) => [z.kind, z.body.x, z.body.y])).toEqual(b.zombies.map((z) => [z.kind, z.body.x, z.body.y]));
    expectValid(a);
  });
});
