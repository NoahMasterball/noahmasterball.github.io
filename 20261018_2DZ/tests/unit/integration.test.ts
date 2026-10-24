// Integration: the real generated world + every system via step(), player idle.
// Spawning per biome (surface, caves, city), lake stability, lake drainage, tick cost.
import { describe, expect, it } from 'vitest';
import { PLAYER, SPAWN, TICK_RATE, WORLD } from '../../src/config/sim.ts';
import { BIOMES } from '../../src/data/biomes.ts';
import { AIR, BIOME_INDEX } from '../../src/data/content.ts';
import type { BiomeId } from '../../src/data/schema.ts';
import { biomeAt } from '../../src/sim/biome.ts';
import { emptyCommand } from '../../src/sim/commands.ts';
import { idx, liquidAt, setTile } from '../../src/sim/grid.ts';
import { overlapsSolid } from '../../src/sim/physics.ts';
import { createSim, step } from '../../src/sim/sim.ts';
import type { SimState } from '../../src/sim/state.ts';

const SEEDS = [WORLD.defaultSeed, 1, 777];
const MIDNIGHT = 0;
const NOON = 0.5;
/** Generous Node ceiling for the average cost of one full tick (ms). */
const MAX_MS_PER_TICK = 4;
/** Underground zombies must appear within this many seconds after reaching a cave. */
const CAVE_SPAWN_SECONDS = 20;
/** Whole-world active liquid cells allowed while nothing disturbs the water. */
const MAX_SETTLED_ACTIVE = 50;

/** Runs idle ticks; `timeOfDay` (if given) is pinned, health/hunger/thirst are refilled. */
function runIdle(state: SimState, seconds: number, timeOfDay: number | null = null): number {
  const cmd = emptyCommand();
  const t0 = performance.now();
  for (let i = 0; i < seconds * TICK_RATE; i++) {
    if (timeOfDay !== null) state.timeOfDay = timeOfDay;
    const p = state.player;
    p.health = PLAYER.maxHealth;
    p.hunger = PLAYER.maxHunger;
    p.thirst = PLAYER.maxThirst;
    step(state, cmd);
  }
  return (performance.now() - t0) / (seconds * TICK_RATE);
}

/** Nearest column to the player (then topmost row) where `ok` holds and the player body stands. */
function findStand(state: SimState, ok: (x: number, floorRow: number) => boolean): { x: number; y: number } {
  const w = state.world;
  const x0 = Math.floor(state.player.body.x);
  for (let d = 0; d < w.width; d++) {
    for (const x of [x0 - d, x0 + d]) {
      if (x < 2 || x > w.width - 4) continue;
      for (let r = 4; r < w.height - WORLD.bedrockRows; r++) {
        if (!ok(x, r)) continue;
        const y = r - PLAYER.height;
        if (overlapsSolid(w, x, y, PLAYER.width, PLAYER.height)) continue;
        if (!overlapsSolid(w, x, y + 0.05, PLAYER.width, PLAYER.height)) continue;
        if (liquidAt(w, x, r - 1) > 0) continue;
        return { x, y };
      }
    }
  }
  throw new Error('no standing spot found');
}

function teleport(state: SimState, at: { x: number; y: number }): void {
  const b = state.player.body;
  b.x = at.x;
  b.y = at.y;
  b.vx = 0;
  b.vy = 0;
  state.zombies = [];
}

const onSurfaceOf = (state: SimState, biome: BiomeId) => (x: number, r: number): boolean =>
  state.world.biome[x] === BIOME_INDEX[biome] && r <= (state.world.surfaceY[x] ?? 0) + 1;

function countHome(state: SimState, biomes: readonly BiomeId[]): number {
  return state.zombies.filter((z) => biomes.includes(z.home)).length;
}

/** Topmost water cell of a surface lake (the column with the deepest water), or null. */
function findLake(state: SimState): { x: number; top: number; bottom: number } | null {
  const w = state.world;
  let best: { x: number; top: number; bottom: number } | null = null;
  for (let x = WORLD.edgeMargin; x < w.width - WORLD.edgeMargin; x++) {
    const top = w.surfaceY[x] ?? 0;
    if (!BIOMES[biomeAt(w, x, top)].surface || liquidAt(w, x, top) === 0) continue;
    let bottom = top;
    while (liquidAt(w, x, bottom + 1) > 0) bottom++;
    if (!best || bottom - top > best.bottom - best.top) best = { x, top, bottom };
  }
  return best;
}

describe.each(SEEDS)('integration, seed %i', (seed) => {
  it('night at spawn: valid zombies in their biomes, within the tick budget', () => {
    const s = createSim(seed);
    const ms = runIdle(s, 180, MIDNIGHT);
    console.log(`seed ${seed}: ${ms.toFixed(3)} ms/tick avg over 3 min at night, ${s.zombies.length} zombies`);
    expect(ms).toBeLessThan(MAX_MS_PER_TICK);
    expect(s.zombies.length).toBeGreaterThan(0);
    expect(s.zombies.length).toBeLessThanOrEqual(SPAWN.maxZombies);
    for (const z of s.zombies) {
      const b = z.body;
      expect(overlapsSolid(s.world, b.x, b.y, b.w, b.h)).toBe(false);
      expect(BIOMES[z.home].zombies.weights[z.kind] ?? 0).toBeGreaterThan(0);
    }
  });

  it('cave: underground zombies appear soon after the player arrives', () => {
    const s = createSim(seed);
    teleport(s, findStand(s, (x, r) => biomeAt(s.world, x, r - 1) === 'caves'));
    expect(biomeAt(s.world, s.player.body.x + PLAYER.width / 2, s.player.body.y + PLAYER.height / 2)).toBe('caves');
    runIdle(s, CAVE_SPAWN_SECONDS, NOON);
    expect(countHome(s, ['caves', 'deep'])).toBeGreaterThan(0);
    for (const z of s.zombies) expect(overlapsSolid(s.world, z.body.x, z.body.y, z.body.w, z.body.h)).toBe(false);
  });

  it('city spawns noticeably more surface zombies than plains at the same time of day', () => {
    const plains = createSim(seed);
    teleport(plains, findStand(plains, onSurfaceOf(plains, 'plains')));
    const city = createSim(seed);
    teleport(city, findStand(city, onSurfaceOf(city, 'city')));
    runIdle(plains, 120, NOON);
    runIdle(city, 120, NOON);
    const surface = (st: SimState): number => st.zombies.filter((z) => BIOMES[z.home].surface).length;
    expect(surface(city)).toBeGreaterThan(2 * surface(plains));
  });

  it('a generated surface lake stays settled, and digging under it drains water down', () => {
    const s = createSim(seed);
    const lake = findLake(s);
    expect(lake).not.toBeNull();
    if (!lake) return;
    teleport(s, findStand(s, (x, r) => Math.abs(x - lake.x) > 3 && r <= (s.world.surfaceY[x] ?? 0) + 1));
    const before = liquidAt(s.world, lake.x, lake.top);
    runIdle(s, 30, NOON);
    expect(s.world.liquidActive.size).toBeLessThan(MAX_SETTLED_ACTIVE);
    expect(liquidAt(s.world, lake.x, lake.top)).toBe(before);

    // Shaft from the lake bed down: bed lining + some ground below it.
    const shaftTop = lake.bottom + 1;
    const shaftBottom = shaftTop + 8;
    for (let y = shaftTop; y <= shaftBottom; y++) setTile(s.world, lake.x, y, AIR);
    runIdle(s, 5, NOON);
    let below = 0;
    for (let y = shaftTop; y <= shaftBottom; y++) below += s.world.liquid[idx(s.world, lake.x, y)] ?? 0;
    expect(below).toBeGreaterThan(0);
  });
});
