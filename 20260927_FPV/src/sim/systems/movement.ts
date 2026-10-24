import { CHARACTER, isTimeUp, MOVEMENT, SIM } from '../../config/sim.ts';
import { BUTTON, commandLook, isHeld, wasPressed, type Command } from '../command.ts';
import type { SimContext } from '../context.ts';
import { cloneVec3, forwardFromAngles, moveTowards, rightFromYaw, type Vec3 } from '../math.ts';
import { footstepLoudness, operatorOf, topSpeed } from '../stats.ts';
import type { CharacterEntity, DashState } from '../types.ts';

// NEW — movement system (SPEC §11): look, stance with head-room check, sprint rules,
// acceleration-based ground movement, air control, jump, dash, Rapier KCC collision, footsteps.

function updateStance(ctx: SimContext, e: CharacterEntity, cmd: Command, dt: number): void {
  const target = isHeld(cmd.buttons, BUTTON.crouch) ? 1 : 0;
  let next = moveTowards(e.stance, target, CHARACTER.stanceRate * dt);
  // Standing up needs head-room for the full standing capsule; otherwise stay where you are
  // (no half-standing wedged under a ceiling).
  if (next < e.stance && !ctx.physics.fits(e.id, e.pos, target)) next = e.stance;
  if (next !== e.stance) {
    e.stance = next;
    ctx.physics.applyStance(e.id, next);
  }
}

/** Sprint is forward-only and cancelled by crouch, fire and ADS. It only *starts* on the ground;
 *  one started there carries on through a jump or a fall. A pending trigger press
 *  (WeaponState.triggerBuffer) holds it off, so a click out of a sprint gets its shot even with
 *  the sprint key still down. */
function updateSprint(e: CharacterEntity, cmd: Command, dt: number): void {
  const wasSprinting = e.sprinting;
  e.sprinting =
    isHeld(cmd.buttons, BUTTON.sprint) &&
    cmd.moveZ > MOVEMENT.sprintForwardThreshold &&
    e.stance === 0 &&
    !isHeld(cmd.buttons, BUTTON.fire) &&
    e.weapon.triggerBuffer <= 0 &&
    !isHeld(cmd.buttons, BUTTON.ads) &&
    (wasSprinting || e.grounded);
  e.sinceSprint = e.sprinting ? 0 : wasSprinting ? 0 : e.sinceSprint + dt;
}

function accelerateHorizontal(e: CharacterEntity, cmd: Command, dt: number): void {
  const op = operatorOf(e);
  let mx = cmd.moveX;
  let mz = cmd.moveZ;
  const len = Math.hypot(mx, mz);
  if (len > 1) {
    mx /= len;
    mz /= len;
  }
  const fwd = forwardFromAngles(e.yaw, 0);
  const right = rightFromYaw(e.yaw);
  const speed = topSpeed(e);
  const tx = (right.x * mx + fwd.x * mz) * speed;
  const tz = (right.z * mx + fwd.z * mz) * speed;
  const hasInput = len > 1e-3;
  const accel =
    op.acceleration * (e.grounded ? (hasInput ? 1 : MOVEMENT.groundBrakeMultiplier) : MOVEMENT.airControl);
  const dx = tx - e.vel.x;
  const dz = tz - e.vel.z;
  const dl = Math.hypot(dx, dz);
  const maxStep = accel * dt;
  const k = dl > maxStep ? maxStep / dl : 1;
  e.vel.x += dx * k;
  e.vel.z += dz * k;
}

/** Dash velocity for this tick. The last tick (the one after which its time is up, isTimeUp)
 *  moves by all the time that is left, so a dash covers exactly its distance in
 *  secondsToTicks(duration) ticks unless something blocks it. */
function applyDash(e: CharacterEntity, dash: DashState, dt: number): void {
  const share = isTimeUp(dash.remaining - dt) ? dash.remaining / dt : 1;
  e.vel.x = dash.velocity.x * share;
  e.vel.y = dash.velocity.y * share;
  e.vel.z = dash.velocity.z * share;
  dash.remaining -= dt;
}

/** Leaves a dash with what normal movement could have produced: at most top speed horizontally
 *  and no upward momentum (only a jump creates that). A dash thus moves its `distance` and no
 *  further; an upward dash peaks where it ends instead of coasting on. */
function endDash(e: CharacterEntity): void {
  e.dash = null;
  const h = Math.hypot(e.vel.x, e.vel.z);
  const cap = topSpeed(e);
  if (h > cap) {
    e.vel.x *= cap / h;
    e.vel.z *= cap / h;
  }
  e.vel.y = Math.min(e.vel.y, 0);
}

/** Footsteps (ADR-0011 §2): one event per stride of grounded travel, so the cadence follows the
 *  speed. Climbing counts only its horizontal part; airborne travel counts nothing. */
function advanceStride(ctx: SimContext, e: CharacterEntity, delta: Vec3): void {
  if (!e.grounded) return;
  e.strideProgress += Math.hypot(delta.x, delta.z);
  const stride = MOVEMENT.footsteps.strideM;
  if (e.strideProgress < stride) return;
  e.strideProgress -= stride;
  ctx.emit({ type: 'footstep', entityId: e.id, pos: cloneVec3(e.pos), loudness: footstepLoudness(e) });
}

export function movementSystem(ctx: SimContext, e: CharacterEntity, cmd: Command, dt: number): void {
  // The command look, but the spawn facing on the spawn tick (commandLook).
  const look = commandLook(e, cmd, ctx.state.tick);
  e.yaw = look.yaw;
  e.pitch = look.pitch;
  updateStance(ctx, e, cmd, dt);
  updateSprint(e, cmd, dt);

  if (e.dash) {
    applyDash(e, e.dash, dt);
  } else {
    accelerateHorizontal(e, cmd, dt);
    if (e.grounded && e.stance < 0.5 && wasPressed(cmd.buttons, e.lastButtons, BUTTON.jump)) {
      e.vel.y = Math.sqrt(2 * SIM.gravity * operatorOf(e).jumpHeight);
    }
  }
  // Standing on walkable ground there is no gravity: the move follows the ground instead
  // (PhysicsWorld.move). Elsewhere, including on a step edge or a too-steep slope, gravity acts.
  const standing = e.grounded && e.vel.y <= 0 && ctx.physics.onWalkableGround(e.id);
  if (!e.dash && !standing) e.vel.y = Math.max(e.vel.y - SIM.gravity * dt, -SIM.maxFallSpeed);

  const desired = { x: e.vel.x * dt, y: e.vel.y * dt, z: e.vel.z * dt };
  const { delta, grounded, walls } = ctx.physics.move(e.id, desired, standing);
  e.pos.x += delta.x;
  e.pos.y += delta.y;
  e.pos.z += delta.z;
  e.grounded = grounded;
  advanceStride(ctx, e, delta);

  // Collision response (SPEC §11). Velocity is the intended motion: climbing a step or a slope
  // costs distance, not speed. Only walls take away the part of the velocity that pushes into
  // them, so they stop you and slide you along without speed building up against them.
  if (grounded && e.vel.y < 0) e.vel.y = 0;
  if (e.vel.y > 0 && delta.y < desired.y * 0.5) e.vel.y = 0; // head against a ceiling
  for (const n of walls) {
    const into = e.vel.x * n.x + e.vel.z * n.z;
    if (into < 0) {
      e.vel.x -= into * n.x;
      e.vel.z -= into * n.z;
    }
  }
  if (e.dash && isTimeUp(e.dash.remaining)) endDash(e);

  ctx.physics.setNextPose(e.id, e.pos, e.yaw);
}
