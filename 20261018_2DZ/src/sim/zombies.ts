// OWNER: agent "zombies" (D). Zombie AI (perception, chase, attack, block breaking, digging).
// Per zombie and tick: perceive (sight via line of sight, hearing via this tick's 'noise' events)
// → decide a walk intent (chase / attack / break / dig / wander / idle) → moveBody.
import { DT, LIQUID, PHYSICS, ZOMBIE_AI } from '../config/sim.ts';
import { AIR, TILE_DEFS, TILE_INDEX } from '../data/content.ts';
import type { BiomeId, ZombieDef, ZombieId } from '../data/schema.ts';
import { ZOMBIES } from '../data/zombies.ts';
import { biomeAt } from './biome.ts';
import { damagePlayer, hasLineOfSight } from './combat.ts';
import { bodyCentreX, bodyCentreY, spawnDrop } from './drops.ts';
import { idx, inBounds, isSolidAt, liquidAt, setTile, tileAt } from './grid.ts';
import { allocId } from './ids.ts';
import { createBody, moveBody, overlapsSolid } from './physics.ts';
import { chance, randRange } from './rng.ts';
import type { Body, SimEvent, SimState, WorldGrid, Zombie } from './state.ts';

const EPS = 1e-4;
/** Distance probed ahead of the body to detect a wall in the walk direction. */
const PROBE = 0.05;
/** Horizontal distance to the target below which the zombie stops walking. */
const ARRIVE = 0.3;

type NoiseEvent = Extract<SimEvent, { type: 'noise' }>;
type NavResult = 'walk' | 'jump' | 'blocked' | 'water' | 'ledge';

/** New zombie of `kind` with its body's top-left corner at (x, y). Not added to state.zombies. */
export function createZombie(state: SimState, kind: ZombieId, x: number, y: number, home: BiomeId): Zombie {
  const def = ZOMBIES[kind];
  return {
    id: allocId(state),
    kind,
    body: createBody(x, y, def.width, def.height),
    facing: 1,
    health: def.health,
    mode: 'idle',
    timer: 0,
    attackCooldown: 0,
    targetX: null,
    targetY: null,
    breakTile: -1,
    home,
  };
}

/** Peak jump height (tiles) of a zombie kind, slightly conservative for the discrete integration. */
export function jumpHeight(def: ZombieDef): number {
  return (def.jumpSpeed * def.jumpSpeed) / (2 * PHYSICS.gravity) - def.jumpSpeed * DT;
}

/**
 * Zombie damage the cell (x, y) needs to break for this zombie kind (TileDef.zombieHealth;
 * Infinity = cannot). Non-diggers only break built tiles (!TileDef.natural) and tiles the player
 * placed (world.placed), never generated terrain; diggers break any finite tile.
 */
export function zombieBreakHealth(world: WorldGrid, x: number, y: number, def: ZombieDef): number {
  const tile = TILE_DEFS[tileAt(world, x, y)];
  if (!tile?.solid || def.breakPower <= 0) return Infinity;
  if (!def.digs && tile.natural && !(inBounds(world, x, y) && world.placed[idx(world, x, y)] === 1)) return Infinity;
  return tile.zombieHealth;
}

/** Horizontal/vertical gap between two boxes is within `range` on both axes. */
function inReach(a: Body, b: Body, range: number): boolean {
  const gx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
  const gy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
  return gx <= range && gy <= range;
}

export function updateZombies(state: SimState): void {
  if (state.zombies.length === 0) return;
  const noises = state.events.filter((e): e is NoiseEvent => e.type === 'noise');
  const push = separation(state.zombies);
  // Snapshot: nothing here removes zombies, but a zombie killed by another system mid-tick is skipped.
  const list = state.zombies.slice();
  for (let i = 0; i < list.length; i++) {
    const z = list[i];
    if (!z || z.health <= 0) continue;
    updateZombie(state, z, noises, push[i] ?? 0);
  }
  if (state.zombies.some((z) => z.health <= 0)) state.zombies = state.zombies.filter((z) => z.health > 0);
}

/** Cheap O(n²) push-apart speed per zombie so overlapping zombies do not stack perfectly. */
function separation(zs: readonly Zombie[]): number[] {
  const out = zs.map(() => 0);
  for (let i = 0; i < zs.length; i++) {
    const a = zs[i];
    if (!a) continue;
    for (let j = i + 1; j < zs.length; j++) {
      const b = zs[j];
      if (!b) continue;
      const dx = bodyCentreX(b.body) - bodyCentreX(a.body);
      const minDx = (a.body.w + b.body.w) * 0.5 * ZOMBIE_AI.separationOverlap;
      if (Math.abs(dx) >= minDx) continue;
      if (a.body.y >= b.body.y + b.body.h || b.body.y >= a.body.y + a.body.h) continue;
      const s = dx !== 0 ? Math.sign(dx) : 1;
      out[i] = (out[i] ?? 0) - s * ZOMBIE_AI.separationSpeed;
      out[j] = (out[j] ?? 0) + s * ZOMBIE_AI.separationSpeed;
    }
  }
  return out;
}

function updateZombie(state: SimState, z: Zombie, noises: readonly NoiseEvent[], push: number): void {
  const def = ZOMBIES[z.kind];
  const b = z.body;
  const p = state.player;
  z.attackCooldown = Math.max(0, z.attackCooldown - DT);
  z.breakTile = -1;

  // ── Perception ──
  const ex = bodyCentreX(b);
  const ey = b.y + b.h * ZOMBIE_AI.eyeFraction;
  let sees = false;
  if (!p.dead) {
    const px = bodyCentreX(p.body);
    const py = bodyCentreY(p.body);
    if (Math.hypot(px - ex, py - ey) <= def.sight && hasLineOfSight(state.world, ex, ey, px, py)) {
      sees = true;
      z.targetX = px;
      z.targetY = py;
      z.timer = ZOMBIE_AI.loseTargetSeconds;
    }
  }
  if (!sees) {
    let heard = false;
    for (const n of noises) {
      if (Math.hypot(n.x - ex, n.y - ey) <= def.hearing * n.loudness) {
        z.targetX = n.x;
        z.targetY = n.y;
        heard = true;
      }
    }
    if (heard) z.timer = ZOMBIE_AI.loseTargetSeconds;
    else if (z.targetX !== null) {
      z.timer -= DT;
      if (z.timer <= 0) {
        z.targetX = null;
        z.targetY = null;
        z.mode = 'wander';
        z.timer = 0;
      }
    }
  }

  // ── Decision → horizontal intent ──
  let intent = 0;
  let jump = false;
  if (z.targetX !== null && z.targetY !== null) {
    z.mode = 'chase';
    const dxT = z.targetX - bodyCentreX(b);
    if (dxT !== 0) z.facing = dxT > 0 ? 1 : -1;
    if (sees && inReach(b, p.body, def.attackRange)) {
      z.mode = 'attack';
      if (z.attackCooldown <= 0) {
        damagePlayer(state, def.damage, bodyCentreX(b));
        z.attackCooldown = def.attackCooldown;
      }
    } else if (def.digs && b.onGround && Math.abs(dxT) <= ZOMBIE_AI.digVerticalRange && digVertical(state, z, def, z.targetY)) {
      // digVertical set mode / jump intent itself.
      jump = z.mode === 'chase' && z.targetY < b.y && !overlapsSolid(state.world, b.x, b.y - 1, b.w, 1);
    } else if (Math.abs(dxT) > ARRIVE) {
      const nav = navigate(state, z, def, z.facing, false);
      if (nav === 'walk' || nav === 'jump') intent = z.facing * def.speed;
      if (nav === 'jump') jump = true;
      if (nav === 'blocked') breakAhead(state, z, def);
    }
  } else {
    wander(state, z);
    if (z.mode === 'wander') {
      const nav = navigate(state, z, def, z.facing, true);
      if (nav === 'walk' || nav === 'jump') intent = z.facing * def.speed * ZOMBIE_AI.wanderSpeedFactor;
      if (nav === 'jump') jump = true;
      if (nav === 'blocked' || nav === 'water' || nav === 'ledge' || leavesHome(state, z)) z.facing = z.facing > 0 ? -1 : 1;
    }
  }

  // ── Physics ──
  intent += push;
  if (b.onGround) {
    b.vx = intent;
    if (jump) b.vy = -def.jumpSpeed;
  } else if (b.vx * intent >= 0 && Math.abs(b.vx) < Math.abs(intent)) {
    b.vx = intent;
  } else {
    // Airborne: decay knockback towards the intent.
    const step = ZOMBIE_AI.airAccel * DT;
    b.vx = b.vx < intent ? Math.min(intent, b.vx + step) : Math.max(intent, b.vx - step);
  }
  moveBody(state.world, b, DT, true);
}

/** Wander/idle leg timer: picks a new direction or a pause when it runs out. */
function wander(state: SimState, z: Zombie): void {
  if (z.mode !== 'wander' && z.mode !== 'idle') z.mode = 'wander';
  z.timer -= DT;
  if (z.timer > 0) return;
  z.timer = randRange(state.rng, ZOMBIE_AI.wanderTurnMin, ZOMBIE_AI.wanderTurnMax);
  if (chance(state.rng, ZOMBIE_AI.idleChance)) {
    z.mode = 'idle';
  } else {
    z.mode = 'wander';
    z.facing = chance(state.rng, 0.5) ? 1 : -1;
  }
}

/** True if the next step leaves the zombie's home biome while it is still inside it. */
function leavesHome(state: SimState, z: Zombie): boolean {
  const b = z.body;
  const cy = bodyCentreY(b);
  const ahead = z.facing > 0 ? b.x + b.w + 1 : b.x - 1;
  return biomeAt(state.world, bodyCentreX(b), cy) === z.home && biomeAt(state.world, ahead, cy) !== z.home;
}

/** Column directly ahead of the body in direction dir. */
function frontColumn(b: Body, dir: -1 | 1): number {
  return dir > 0 ? Math.floor(b.x + b.w + PROBE - EPS) : Math.floor(b.x - PROBE);
}

/** Can the body walk / jump forward, or is it blocked / facing deep water / a deep drop? */
function navigate(state: SimState, z: Zombie, def: ZombieDef, dir: -1 | 1, careful: boolean): NavResult {
  const w = state.world;
  const b = z.body;
  const fx = b.x + dir * PROBE;
  const col = frontColumn(b, dir);
  const feetRow = Math.floor(b.y + b.h - EPS);
  if (!overlapsSolid(w, fx, b.y, b.w, b.h)) {
    if (!b.inLiquid && (liquidAt(w, col, feetRow) >= LIQUID.deepAmount || liquidAt(w, col, feetRow + 1) >= LIQUID.deepAmount)) {
      return 'water';
    }
    if (careful && b.onGround) {
      let ground = false;
      for (let r = feetRow + 1; r <= feetRow + 1 + ZOMBIE_AI.wanderMaxDrop && !ground; r++) ground = isSolidAt(w, col, r);
      if (!ground) return 'ledge';
    }
    return 'walk';
  }
  const maxRise = Math.min(ZOMBIE_AI.maxJumpTiles, jumpHeight(def));
  for (let k = 1; k <= Math.ceil(maxRise); k++) {
    if (overlapsSolid(w, fx, b.y - k, b.w, b.h) || overlapsSolid(w, b.x, b.y - k, b.w, b.h)) continue;
    if (k <= PHYSICS.stepHeight) return 'walk';
    return k <= maxRise && b.onGround ? 'jump' : 'blocked';
  }
  return 'blocked';
}

/** Attacks the tile blocking the way ahead (doors first, then the topmost breakable one). */
function breakAhead(state: SimState, z: Zombie, def: ZombieDef): void {
  if (def.breakPower <= 0) return;
  const b = z.body;
  const col = frontColumn(b, z.facing);
  const top = Math.floor(b.y);
  const bottom = Math.floor(b.y + b.h - EPS);
  let pick = -1;
  for (let r = top; r <= bottom; r++) {
    if (!Number.isFinite(zombieBreakHealth(state.world, col, r, def))) continue;
    if (tileAt(state.world, col, r) === TILE_INDEX.door) {
      pick = r;
      break;
    }
    if (pick < 0) pick = r;
  }
  if (pick >= 0) hitTile(state, z, def, col, pick);
}

/**
 * Digger with a target roughly below/above: digs the floor under its feet or the ceiling over its
 * head. Returns false when there is nothing to dig vertically (caller falls back to walking).
 */
function digVertical(state: SimState, z: Zombie, def: ZombieDef, targetY: number): boolean {
  const b = z.body;
  const w = state.world;
  const c0 = Math.floor(b.x);
  const c1 = Math.floor(b.x + b.w - EPS);
  let rows: number[];
  if (targetY > b.y + b.h + ZOMBIE_AI.digVerticalMin) rows = [Math.floor(b.y + b.h - EPS) + 1];
  else if (targetY < b.y - ZOMBIE_AI.digVerticalMin) rows = [Math.floor(b.y - EPS), Math.floor(b.y - 1)];
  else return false;
  for (const r of rows) {
    for (let c = c0; c <= c1; c++) {
      if (Number.isFinite(zombieBreakHealth(w, c, r, def))) {
        hitTile(state, z, def, c, r);
        return true;
      }
    }
  }
  // Nothing diggable above: let the caller jump into the open shaft (only when heading up).
  return targetY < b.y && !overlapsSolid(w, b.x, b.y - 1, b.w, 1);
}

/** Applies one tick of breakPower to a tile; breaks it at zombieBreakHealth. */
function hitTile(state: SimState, z: Zombie, def: ZombieDef, x: number, y: number): void {
  const w = state.world;
  const t = tileAt(w, x, y);
  const health = zombieBreakHealth(w, x, y, def);
  if (!Number.isFinite(health)) return;
  const i = idx(w, x, y);
  z.breakTile = i;
  z.mode = def.digs ? 'dig' : 'break';
  const dmg = (w.zombieDamage.get(i) ?? 0) + def.breakPower * DT;
  if (dmg < health) {
    w.zombieDamage.set(i, dmg);
    return;
  }
  // A broken container spills its contents instead of deleting them.
  const inv = state.containers.get(i);
  if (inv) {
    for (const s of inv.slots) if (s) spawnDrop(state, x + 0.5, y + 0.5, s);
    state.containers.delete(i);
    if (state.player.openContainer === i) state.player.openContainer = -1;
  }
  setTile(w, x, y, AIR);
  state.events.push({ type: 'tileBroken', x, y, tile: t });
}
