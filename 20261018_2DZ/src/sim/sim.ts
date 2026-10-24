// Simulation entry point. Fixed system order per tick (ARCHITECTURE.md §4) — change it only
// together with that section.
import { DAY_NIGHT, DT, FALLING, LIQUID } from '../config/sim.ts';
import type { PlayerCommand } from './commands.ts';
import { applyControls } from './controls.ts';
import { updateDrops } from './drops.ts';
import { stepFalling } from './falling.ts';
import { useHeldItem } from './interact.ts';
import { stepLiquid } from './liquid.ts';
import { createPlayer, updatePlayer } from './player.ts';
import { createRng } from './rng.ts';
import { populateInitialZombies, updateSpawning } from './spawn.ts';
import type { SimState } from './state.ts';
import { advanceTime } from './time.ts';
import { generateWorld } from './worldgen/index.ts';
import { updateZombies } from './zombies.ts';

export function createSim(seed: number): SimState {
  const gen = generateWorld(seed);
  const state: SimState = {
    seed,
    tick: 0,
    timeOfDay: DAY_NIGHT.startTime,
    day: 1,
    // Gameplay stream is separate from the worldgen stream (worldgen derives its own from seed).
    rng: createRng(seed ^ 0x5eed),
    nextId: 1,
    world: gen.world,
    player: createPlayer(gen.spawnX, gen.spawnY),
    zombies: [],
    drops: [],
    containers: gen.containers,
    events: [],
    accum: { liquid: 0, falling: 0, spawn: 0 },
  };
  populateInitialZombies(state);
  return state;
}

export function step(state: SimState, cmd: PlayerCommand): void {
  state.events.length = 0;
  state.tick += 1;
  advanceTime(state);
  applyControls(state, cmd.controls);
  updatePlayer(state, cmd);
  useHeldItem(state, cmd);
  updateZombies(state);
  updateSpawning(state);
  updateDrops(state);

  state.accum.liquid += DT * LIQUID.stepsPerSecond;
  while (state.accum.liquid >= 1) {
    state.accum.liquid -= 1;
    stepLiquid(state.world);
  }
  state.accum.falling += DT;
  while (state.accum.falling >= FALLING.fallInterval) {
    state.accum.falling -= FALLING.fallInterval;
    stepFalling(state);
  }
}
