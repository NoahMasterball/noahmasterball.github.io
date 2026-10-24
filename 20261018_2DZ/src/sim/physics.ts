// AABB-vs-tile movement shared by the player, zombies and item drops. Axis-separated sweep in
// sub-steps of at most MAX_SUBSTEP tiles so fast bodies never tunnel through one-tile walls.
import { LIQUID, PHYSICS } from '../config/sim.ts';
import { isSolidAt, liquidAt } from './grid.ts';
import type { Body, WorldGrid } from './state.ts';

const EPS = 1e-4;
const MAX_SUBSTEP = 0.4;
/** Distance below the feet probed for ground contact. */
const GROUND_PROBE = 0.02;
/** Gravity and terminal speed factors while submerged. */
const LIQUID_GRAVITY = 0.35;
const LIQUID_MAX_FALL = 0.25;

export interface MoveResult {
  blockedX: boolean;
  blockedUp: boolean;
  /** True on the tick the body touched ground after being airborne. */
  landed: boolean;
  /** Highest fall speed of the finished fall (only meaningful when landed). */
  landingSpeed: number;
  /** True when the body climbed a ledge this tick (zombie AI / animation). */
  stepped: boolean;
}

export function createBody(x: number, y: number, w: number, h: number): Body {
  return { x, y, w, h, vx: 0, vy: 0, onGround: false, inLiquid: false, fallSpeed: 0 };
}

/** True if a w×h box at (x, y) overlaps any solid tile. */
export function overlapsSolid(world: WorldGrid, x: number, y: number, w: number, h: number): boolean {
  const x0 = Math.floor(x);
  const x1 = Math.floor(x + w - EPS);
  const y0 = Math.floor(y);
  const y1 = Math.floor(y + h - EPS);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (isSolidAt(world, tx, ty)) return true;
    }
  }
  return false;
}

/** True if the body's centre cell holds deep liquid. */
export function isSubmerged(world: WorldGrid, b: Body): boolean {
  return liquidAt(world, Math.floor(b.x + b.w / 2), Math.floor(b.y + b.h / 2)) >= LIQUID.deepAmount;
}

/**
 * Integrates gravity and velocity for one tick and resolves tile collisions.
 * The caller sets `b.vx` (intent) and may set `b.vy` (jump) before calling.
 */
export function moveBody(world: WorldGrid, b: Body, dt: number, canStepUp: boolean): MoveResult {
  const result: MoveResult = { blockedX: false, blockedUp: false, landed: false, landingSpeed: 0, stepped: false };
  const wasOnGround = b.onGround;
  b.inLiquid = isSubmerged(world, b);

  const g = PHYSICS.gravity * (b.inLiquid ? LIQUID_GRAVITY : 1);
  const maxFall = PHYSICS.maxFallSpeed * (b.inLiquid ? LIQUID_MAX_FALL : 1);
  b.vy = Math.min(b.vy + g * dt, maxFall);
  if (b.vy > 0 && !b.onGround) b.fallSpeed = Math.max(b.fallSpeed, b.vy);
  if (b.inLiquid) b.fallSpeed = 0;

  const dx = b.vx * dt * (b.inLiquid ? PHYSICS.waterDrag : 1);
  const dy = b.vy * dt;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / MAX_SUBSTEP));
  const sx = dx / steps;
  let sy = dy / steps;

  for (let s = 0; s < steps; s++) {
    if (sx !== 0 && !result.blockedX) {
      const nx = b.x + sx;
      if (!overlapsSolid(world, nx, b.y, b.w, b.h)) {
        b.x = nx;
      } else {
        // Ledge climb: put the feet on top of the blocking row if the space above is free.
        const feetRow = Math.floor(b.y + b.h - EPS);
        const climbY = feetRow - b.h;
        const canClimb =
          canStepUp && wasOnGround && b.y - climbY <= PHYSICS.stepHeight + EPS &&
          !overlapsSolid(world, nx, climbY, b.w, b.h);
        if (canClimb) {
          b.x = nx;
          b.y = climbY;
          result.stepped = true;
        } else {
          b.x = sx > 0 ? Math.floor(nx + b.w - EPS) - b.w : Math.floor(nx) + 1;
          b.vx = 0;
          result.blockedX = true;
        }
      }
    }
    if (sy !== 0) {
      const ny = b.y + sy;
      if (!overlapsSolid(world, b.x, ny, b.w, b.h)) {
        b.y = ny;
      } else {
        if (sy > 0) {
          b.y = Math.floor(ny + b.h - EPS) - b.h;
        } else {
          b.y = Math.floor(ny) + 1;
          result.blockedUp = true;
        }
        b.vy = 0;
        sy = 0;
      }
    }
  }

  b.onGround = overlapsSolid(world, b.x, b.y + GROUND_PROBE, b.w, b.h);
  if (b.onGround && b.vy > 0) b.vy = 0;
  if (b.onGround && !wasOnGround) {
    result.landed = true;
    result.landingSpeed = b.fallSpeed;
  }
  if (b.onGround) b.fallSpeed = 0;
  return result;
}

/** Fall damage for a landing speed (0 below PHYSICS.fallDamageSpeed). */
export function fallDamage(landingSpeed: number): number {
  const over = landingSpeed - PHYSICS.fallDamageSpeed;
  return over > 0 ? Math.round(over * PHYSICS.fallDamagePerSpeed) : 0;
}
