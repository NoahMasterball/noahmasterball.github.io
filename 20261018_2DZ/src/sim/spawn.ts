// OWNER: agent "zombies" (D). Biome-budgeted zombie spawning/despawning (day/night).
//
// Budget window: the columns within SPAWN.despawnDistance of the player (zombies outside it are
// despawned, so only this window can hold zombies). For a biome B:
//   cols(B)   = window columns whose surface biome is B; for the depth layers 'caves'/'deep' every
//               window column counts (they lie under every column).
//   target(B) = BiomeDef.zombies.density × cols(B) / 100 × (night && B.surface ? nightMultiplier : 1)
// Live zombies are counted per home biome; a spawn attempt only succeeds while count(B) < target(B)
// and state.zombies.length < SPAWN.maxZombies.
// World start (populateInitialZombies) fills the window to
//   initial(B) = min(density, SPAWN.initialPer100Columns) × cols(B) / 100
// (day values; the cap keeps dense biomes from swarming a fresh start), never closer than
// SPAWN.minDistance to the player.
import { DT, SPAWN, WORLD } from '../config/sim.ts';
import { BIOMES } from '../data/biomes.ts';
import { BIOME_INDEX } from '../data/content.ts';
import { BIOME_IDS, type BiomeId } from '../data/schema.ts';
import { ZOMBIES } from '../data/zombies.ts';
import { biomeAt } from './biome.ts';
import { bodyCentreX, bodyCentreY } from './drops.ts';
import { isSolidAt, liquidAt } from './grid.ts';
import { overlapsSolid } from './physics.ts';
import { chance, pickWeighted, randInt, randRange } from './rng.ts';
import type { SimState, Zombie } from './state.ts';
import { isNight } from './time.ts';
import { createZombie } from './zombies.ts';

type TargetFn = (state: SimState, biome: BiomeId) => number;

/** Window columns [x0, x1] around the player (clamped to the world). */
function windowColumns(state: SimState): [number, number] {
  const px = bodyCentreX(state.player.body);
  const x0 = Math.max(0, Math.floor(px - SPAWN.despawnDistance));
  const x1 = Math.min(state.world.width - 1, Math.floor(px + SPAWN.despawnDistance));
  return [x0, x1];
}

/** Columns of the budget window that belong to `biome` (see header). */
export function biomeColumns(state: SimState, biome: BiomeId): number {
  const [x0, x1] = windowColumns(state);
  if (!BIOMES[biome].surface) return x1 - x0 + 1;
  const bi = BIOME_INDEX[biome];
  let n = 0;
  for (let x = x0; x <= x1; x++) if (state.world.biome[x] === bi) n++;
  return n;
}

/** Zombies `biome` wants around the player right now (day/night aware). */
export function biomeTarget(state: SimState, biome: BiomeId): number {
  const z = BIOMES[biome].zombies;
  const night = BIOMES[biome].surface && isNight(state.timeOfDay) ? z.nightMultiplier : 1;
  return (z.density * night * biomeColumns(state, biome)) / 100;
}

/** Start-of-world fill per biome (see header). */
export function initialTarget(state: SimState, biome: BiomeId): number {
  const z = BIOMES[biome].zombies;
  return (Math.min(z.density, SPAWN.initialPer100Columns) * biomeColumns(state, biome)) / 100;
}

function countHome(state: SimState, biome: BiomeId): number {
  let n = 0;
  for (const z of state.zombies) if (z.home === biome) n++;
  return n;
}

/** First floor row (solid cell with air above) in column x scanning down from y0, or -1. */
function findFloor(state: SimState, x: number, y0: number): number {
  const w = state.world;
  const yEnd = Math.min(w.height - 1, y0 + SPAWN.floorSearchRows);
  for (let r = Math.max(1, y0); r <= yEnd; r++) if (isSolidAt(w, x, r) && !isSolidAt(w, x, r - 1)) return r;
  return -1;
}

/** True if any cell overlapped by the box holds liquid. */
function boxHasLiquid(state: SimState, x: number, y: number, bw: number, bh: number): boolean {
  for (let ty = Math.floor(y); ty <= Math.floor(y + bh - 1e-4); ty++) {
    for (let tx = Math.floor(x); tx <= Math.floor(x + bw - 1e-4); tx++) if (liquidAt(state.world, tx, ty) > 0) return true;
  }
  return false;
}

/**
 * One spawn attempt: random cell at horizontal distance [minDist, maxDist] on either side of the
 * player, on the surface or underground; spawns there if the cell's biome is under `target`.
 */
function spawnAttempt(state: SimState, minDist: number, maxDist: number, target: TargetFn): boolean {
  if (state.zombies.length >= SPAWN.maxZombies) return false;
  const w = state.world;
  const pb = state.player.body;
  const px = bodyCentreX(pb);
  const py = bodyCentreY(pb);
  const cx = Math.floor(px + (chance(state.rng, 0.5) ? 1 : -1) * randRange(state.rng, minDist, maxDist));
  if (cx < 0 || cx >= w.width) return false;
  const surfaceY = w.surfaceY[cx] ?? 0;
  const playerUnderground = !BIOMES[biomeAt(w, px, py)].surface;
  let y0: number;
  if (playerUnderground) {
    // Underground player: search around its own depth.
    y0 = Math.floor(py) + randInt(state.rng, -SPAWN.floorSearchRows, 0);
  } else if (chance(state.rng, SPAWN.undergroundChance)) {
    const top = surfaceY + WORLD.cavesDepth;
    if (top >= w.height) return false;
    y0 = randInt(state.rng, top, w.height - 1);
  } else {
    // Surface: start above the generated surface (buildings/roofs, terrain changed by the player).
    y0 = surfaceY - Math.floor(SPAWN.floorSearchRows / 2);
  }
  const floor = findFloor(state, cx, y0);
  if (floor < 0) return false;
  const biome = biomeAt(w, cx, floor - 1);
  if (countHome(state, biome) >= target(state, biome)) return false;
  const kind = pickWeighted(state.rng, BIOMES[biome].zombies.weights);
  if (!kind) return false;
  const def = ZOMBIES[kind];
  const x = cx + 0.5 - def.width / 2;
  const y = floor - def.height;
  if (overlapsSolid(w, x, y, def.width, def.height) || boxHasLiquid(state, x, y, def.width, def.height)) return false;
  // Inside the ring and inside the despawn radius (deep underground cells would vanish next tick).
  const dist = Math.hypot(x + def.width / 2 - px, y + def.height / 2 - py);
  if (dist < SPAWN.minDistance || dist > SPAWN.despawnDistance) return false;
  const z = createZombie(state, kind, x, y, biome);
  z.body.onGround = true;
  state.zombies.push(z);
  return true;
}

export function populateInitialZombies(state: SimState): void {
  let wanted = 0;
  for (const b of BIOME_IDS) wanted += Math.ceil(initialTarget(state, b));
  const tries = Math.min(wanted, SPAWN.maxZombies) * SPAWN.initialTriesPerZombie;
  for (let i = 0; i < tries; i++) spawnAttempt(state, SPAWN.minDistance, SPAWN.despawnDistance, initialTarget);
}

export function updateSpawning(state: SimState): void {
  const pb = state.player.body;
  const px = bodyCentreX(pb);
  const py = bodyCentreY(pb);
  const near = (z: Zombie): boolean => Math.hypot(bodyCentreX(z.body) - px, bodyCentreY(z.body) - py) <= SPAWN.despawnDistance;
  if (!state.zombies.every(near)) state.zombies = state.zombies.filter(near);

  state.accum.spawn += DT * SPAWN.attemptsPerSecond;
  while (state.accum.spawn >= 1) {
    state.accum.spawn -= 1;
    spawnAttempt(state, SPAWN.minDistance, SPAWN.maxDistance, biomeTarget);
  }
}
