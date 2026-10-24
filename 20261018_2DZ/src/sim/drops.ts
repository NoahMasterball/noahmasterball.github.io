// OWNER: agent "player" (C). Item entities in the world: spawn, physics, magnet, pickup, expiry.
import { DROPS, DT, PLAYER } from '../config/sim.ts';
import { allocId } from './ids.ts';
import { addItem, maxStackOf, roomFor } from './inventory.ts';
import { createBody, moveBody } from './physics.ts';
import { randRange } from './rng.ts';
import type { Body, Drop, ItemStack, SimState } from './state.ts';

export interface SpawnDropOptions {
  /** Initial velocity; omitted = small random pop (state.rng). */
  vx?: number;
  vy?: number;
  /** Seconds before the drop can be picked up (default DROPS.pickupDelay). */
  pickupDelay?: number;
}

export function bodyCentreX(b: Body): number {
  return b.x + b.w / 2;
}

export function bodyCentreY(b: Body): number {
  return b.y + b.h / 2;
}

/** Distance from a point to the nearest point of a body's box (0 inside). */
export function distanceToBody(b: Body, x: number, y: number): number {
  const dx = Math.max(b.x - x, 0, x - (b.x + b.w));
  const dy = Math.max(b.y - y, 0, y - (b.y + b.h));
  return Math.hypot(dx, dy);
}

/**
 * Spawns an item entity centred at (x, y). Joins an identical drop within DROPS.mergeRadius when
 * the merged stack fits. A drop may be picked up once `age ≥ DROPS.pickupDelay`; a longer delay is
 * expressed by starting `age` below 0 (lifetime grows by the same few seconds).
 */
export function spawnDrop(state: SimState, x: number, y: number, stack: ItemStack, opts: SpawnDropOptions = {}): void {
  if (stack.count <= 0) return;
  const max = maxStackOf(stack.item);
  if (stack.count > max) {
    for (let left = stack.count; left > 0; left -= max) {
      spawnDrop(state, x, y, { item: stack.item, count: Math.min(left, max) }, opts);
    }
    return;
  }
  for (const d of state.drops) {
    if (d.stack.item !== stack.item || d.stack.count + stack.count > max) continue;
    if (Math.hypot(bodyCentreX(d.body) - x, bodyCentreY(d.body) - y) > DROPS.mergeRadius) continue;
    d.stack.count += stack.count;
    return;
  }
  const s = DROPS.size;
  const body = createBody(x - s / 2, y - s / 2, s, s);
  body.vx = opts.vx ?? randRange(state.rng, -DROPS.popSpeed, DROPS.popSpeed);
  body.vy = opts.vy ?? -DROPS.popUpSpeed;
  const delay = opts.pickupDelay ?? DROPS.pickupDelay;
  state.drops.push({ id: allocId(state), body, stack: { item: stack.item, count: stack.count }, age: DROPS.pickupDelay - delay });
}

/** Moves a drop straight towards (tx, ty) (the magnet ignores tiles, like Terraria). */
function pullTowards(d: Drop, tx: number, ty: number): void {
  const b = d.body;
  const dx = tx - bodyCentreX(b);
  const dy = ty - bodyCentreY(b);
  const dist = Math.hypot(dx, dy);
  const stepLen = Math.min(dist, DROPS.magnetSpeed * DT);
  if (dist > 0) {
    b.x += (dx / dist) * stepLen;
    b.y += (dy / dist) * stepLen;
  }
  b.vx = 0;
  b.vy = 0;
  b.onGround = false;
}

export function updateDrops(state: SimState): void {
  const pb = state.player.body;
  let write = 0;
  for (let i = 0; i < state.drops.length; i++) {
    const d = state.drops[i];
    if (!d) continue;
    if (keepDrop(state, d, pb)) state.drops[write++] = d;
  }
  state.drops.length = write;
}

/** Advances one drop; returns false when it is gone (expired or fully picked up). */
function keepDrop(state: SimState, d: Drop, pb: Body): boolean {
  d.age += DT;
  if (d.age >= DROPS.lifetimeSeconds) return false;
  const p = state.player;
  const cx = bodyCentreX(d.body);
  const cy = bodyCentreY(d.body);
  const room = !p.dead && d.age >= DROPS.pickupDelay ? roomFor(p.inventory, d.stack.item) : 0;
  if (room > 0) {
    const dist = distanceToBody(pb, cx, cy);
    if (dist <= PLAYER.pickupRadius) {
      const n = Math.min(room, d.stack.count);
      const left = addItem(p.inventory, d.stack.item, n);
      const taken = n - left;
      if (taken > 0) state.events.push({ type: 'pickup', item: d.stack.item, count: taken });
      d.stack.count -= taken;
      return d.stack.count > 0;
    }
    if (dist <= PLAYER.pickupMagnet) {
      pullTowards(d, bodyCentreX(pb), bodyCentreY(pb));
      return true;
    }
  }
  const b = d.body;
  if (b.onGround) {
    const dec = DROPS.groundFriction * DT;
    b.vx = Math.abs(b.vx) <= dec ? 0 : b.vx - Math.sign(b.vx) * dec;
  }
  moveBody(state.world, b, DT, false);
  return true;
}
