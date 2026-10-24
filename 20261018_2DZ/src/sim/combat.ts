// OWNER: agent "zombies" (D). Damage, knockback, melee arcs, hitscan shots, noise, deaths + loot.
import { COMBAT, PLAYER, ZOMBIE_AI } from '../config/sim.ts';
import { TILE_DEFS } from '../data/content.ts';
import type { MeleeStats, RangedStats } from '../data/schema.ts';
import { ZOMBIES } from '../data/zombies.ts';
import { bodyCentreX, bodyCentreY, spawnDrop } from './drops.ts';
import { tileAt } from './grid.ts';
import { rand } from './rng.ts';
import { rollLoot } from './loot.ts';
import type { Body, SimState, WorldGrid, Zombie } from './state.ts';

// ── Rays ─────────────────────────────────────────────────────────────────────

/** Tiles that stop sight lines and bullets: solid and not see-through (glass, leaves pass). */
export function blocksRay(tile: number): boolean {
  const def = TILE_DEFS[tile];
  return def ? def.solid && !def.transparent : true;
}

export interface RayHit {
  /** Distance travelled until the first blocking cell (or maxDist). */
  dist: number;
  blocked: boolean;
}

// NEW — no grid ray cast existed yet; shared by zombie line of sight (zombies.ts) and shots.
/** DDA ray from (x0, y0) along the unit vector (dx, dy) until a blocking tile or maxDist. */
export function castRay(world: WorldGrid, x0: number, y0: number, dx: number, dy: number, maxDist: number): RayHit {
  let cx = Math.floor(x0);
  let cy = Math.floor(y0);
  if (blocksRay(tileAt(world, cx, cy))) return { dist: 0, blocked: true };
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  let tMaxX = dx > 0 ? (cx + 1 - x0) / dx : dx < 0 ? (x0 - cx) / -dx : Infinity;
  let tMaxY = dy > 0 ? (cy + 1 - y0) / dy : dy < 0 ? (y0 - cy) / -dy : Infinity;
  for (;;) {
    let t: number;
    if (tMaxX < tMaxY) {
      t = tMaxX;
      cx += stepX;
      tMaxX += tDeltaX;
    } else {
      t = tMaxY;
      cy += stepY;
      tMaxY += tDeltaY;
    }
    if (t > maxDist) return { dist: maxDist, blocked: false };
    if (blocksRay(tileAt(world, cx, cy))) return { dist: t, blocked: true };
  }
}

/** True if nothing blocks the straight line between two points. */
export function hasLineOfSight(world: WorldGrid, x0: number, y0: number, x1: number, y1: number): boolean {
  const d = Math.hypot(x1 - x0, y1 - y0);
  if (d === 0) return !blocksRay(tileAt(world, Math.floor(x0), Math.floor(y0)));
  return !castRay(world, x0, y0, (x1 - x0) / d, (y1 - y0) / d, d).blocked;
}

/** Ray/AABB entry distance (slab test), or Infinity when the ray misses the box. */
function rayBox(x0: number, y0: number, dx: number, dy: number, b: Body): number {
  let tmin = -Infinity;
  let tmax = Infinity;
  const axes: [number, number, number, number][] = [
    [x0, dx, b.x, b.x + b.w],
    [y0, dy, b.y, b.y + b.h],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (d === 0) {
      if (o < lo || o > hi) return Infinity;
      continue;
    }
    const t1 = (lo - o) / d;
    const t2 = (hi - o) / d;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
  }
  if (tmax < Math.max(tmin, 0)) return Infinity;
  return Math.max(tmin, 0);
}

// ── Damage ───────────────────────────────────────────────────────────────────

/** Pushes a body away horizontally with a small hop so ground friction does not eat it at once. */
function knockBody(b: Body, dir: number, speed: number): void {
  b.vx = dir * speed;
  b.vy = Math.min(b.vy, -speed * COMBAT.knockbackLift);
  b.onGround = false;
}

/** Damages the player unless invulnerable; sets invuln, knockback away from fromX, emits 'hit'. */
export function damagePlayer(state: SimState, amount: number, fromX: number): void {
  const p = state.player;
  if (p.dead || p.invuln > 0 || amount <= 0) return;
  // Death / respawn is handled by player.ts once health reaches 0.
  p.health = Math.max(0, p.health - amount);
  p.invuln = PLAYER.hitInvuln;
  const cx = bodyCentreX(p.body);
  knockBody(p.body, cx >= fromX ? 1 : -1, COMBAT.knockbackBase);
  state.events.push({ type: 'hit', target: 'player', id: 0, x: cx, y: bodyCentreY(p.body), damage: amount });
}

/**
 * Damages a zombie (knockback, 'hit'; the zombie turns on the player). On death: 'zombieDied',
 * ZombieDef.loot drops, and the zombie is removed from state.zombies immediately — callers must
 * not be iterating state.zombies directly (meleeAttack/fireRanged iterate copies; updateZombies
 * iterates a snapshot and skips dead zombies).
 */
export function damageZombie(state: SimState, z: Zombie, amount: number, dir: -1 | 1, knockback: number): void {
  if (z.health <= 0) return;
  z.health -= amount;
  const x = bodyCentreX(z.body);
  const y = bodyCentreY(z.body);
  state.events.push({ type: 'hit', target: 'zombie', id: z.id, x, y, damage: amount });
  if (z.health <= 0) {
    killZombie(state, z);
    return;
  }
  if (knockback > 0) knockBody(z.body, dir, COMBAT.knockbackBase * knockback);
  if (!state.player.dead) {
    z.targetX = bodyCentreX(state.player.body);
    z.targetY = bodyCentreY(state.player.body);
    z.mode = 'chase';
    z.timer = ZOMBIE_AI.loseTargetSeconds;
  }
}

function killZombie(state: SimState, z: Zombie): void {
  const x = bodyCentreX(z.body);
  const y = bodyCentreY(z.body);
  state.events.push({ type: 'zombieDied', id: z.id, x, y });
  for (const stack of rollLoot(state.rng, ZOMBIES[z.kind].loot)) spawnDrop(state, x, y, stack);
  const i = state.zombies.indexOf(z);
  if (i >= 0) state.zombies.splice(i, 1);
}

// ── Attacks ──────────────────────────────────────────────────────────────────

/** Player melee swing from (x, y) facing dir. Hits every zombie in the box in front (not through walls). */
export function meleeAttack(state: SimState, x: number, y: number, dir: -1 | 1, stats: MeleeStats): boolean {
  state.events.push({ type: 'melee', x, y, dir });
  const left = dir > 0 ? x : x - stats.range;
  const right = left + stats.range;
  const top = y - COMBAT.meleeHeight / 2;
  const bottom = y + COMBAT.meleeHeight / 2;
  const hits = state.zombies.filter((z) => {
    const b = z.body;
    if (b.x >= right || b.x + b.w <= left || b.y >= bottom || b.y + b.h <= top) return false;
    // Aim at the nearest point of the body inside the swing box.
    const tx = Math.max(left, Math.min(right, Math.max(b.x, Math.min(x, b.x + b.w))));
    const ty = Math.max(top, Math.min(bottom, Math.max(b.y, Math.min(y, b.y + b.h))));
    return hasLineOfSight(state.world, x, y, tx, ty);
  });
  for (const z of hits) damageZombie(state, z, stats.damage, dir, stats.knockback);
  return hits.length > 0;
}

/** Player hitscan shot from (x, y) towards (aimX, aimY), stopped by solid tiles. Emits 'shot' + noise. */
export function fireRanged(state: SimState, x: number, y: number, aimX: number, aimY: number, stats: RangedStats): void {
  const base = Math.atan2(aimY - y, aimX - x);
  const spread = (stats.spreadDeg * Math.PI) / 180;
  const maxDist = Math.min(stats.range, COMBAT.maxRayDistance);
  for (let p = 0; p < stats.pellets; p++) {
    const a = base + (rand(state.rng) - 0.5) * spread;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let dist = castRay(state.world, x, y, dx, dy, maxDist).dist;
    let target: Zombie | null = null;
    for (const z of state.zombies) {
      const t = rayBox(x, y, dx, dy, z.body);
      if (t < dist) {
        dist = t;
        target = z;
      }
    }
    state.events.push({ type: 'shot', x0: x, y0: y, x1: x + dx * dist, y1: y + dy * dist });
    if (target) damageZombie(state, target, stats.damage, dx >= 0 ? 1 : -1, stats.knockback);
  }
  emitNoise(state, x, y, COMBAT.gunshotNoise);
}

/** Emits a noise; a zombie hears it when its distance ≤ ZombieDef.hearing × loudness. */
export function emitNoise(state: SimState, x: number, y: number, loudness: number): void {
  state.events.push({ type: 'noise', x, y, loudness });
}
