import { ABILITY_RULES, isTimeUp, SIM } from '../../config/sim.ts';
import { getAbility } from '../../data/content.ts';
import { allocateId, ownerOf, type SimContext } from '../context.ts';
import { cloneVec3, forwardFromAngles, type Vec3 } from '../math.ts';
import { FLOOR_MIN_NORMAL_Y, type BulletHit } from '../physics/world.ts';
import type { AbilityOf } from '../systems/abilities.ts';
import type { CharacterEntity, EntityId, ProjectileEntity } from '../types.ts';
import { applyEffects } from './effects.ts';
import { effectContext } from './targeting.ts';

// NEW — thrown abilities in flight (ADR-0012 §5). A ProjectileEntity is plain data in
// SimState.projectiles; its flight is swept against the bullet query group (level geometry,
// barriers, devices, hitboxes; never the thrower's own body). A burst applies the ability's
// effects at the projectile's position through the effect registry (applyEffects).

/** The ability of a projectile (thrown, by construction of spawnProjectile). */
function thrownAbility(p: ProjectileEntity): AbilityOf<'thrown'> {
  const ability = getAbility(p.abilityId);
  if (ability.activation.kind !== 'thrown') throw new Error(`Projectile ${p.id}: ability '${p.abilityId}' is not thrown`);
  // Safe narrowing: checked right above (hasActivation lives in systems/abilities.ts, which this
  // module must not import as a value — ADR-0012 §16 module graph).
  return ability as AbilityOf<'thrown'>;
}

/** Launches `owner`'s projectile of `ability` from `aim.origin` (the eye) along aim yaw/pitch
 *  (the crosshair: aimOf(e, commandLook(e, cmd, tick))): vel = dir × speed (no inherited
 *  velocity), prevPos = pos, fuse from data, id from allocateId. It first moves in this tick's
 *  projectile step; its fuse runs from the next tick (countDownFuse). */
export function spawnProjectile(
  ctx: SimContext,
  owner: CharacterEntity,
  ability: AbilityOf<'thrown'>,
  aim: { origin: Vec3; yaw: number; pitch: number },
): void {
  ctx.state.projectiles.push({
    id: allocateId(ctx.state),
    kind: 'projectile',
    abilityId: ability.id,
    ownerId: owner.id,
    team: owner.team,
    pos: cloneVec3(aim.origin),
    prevPos: cloneVec3(aim.origin),
    vel: launchVelocity(ability, forwardFromAngles(aim.yaw, aim.pitch)),
    fuse: ability.activation.fuse,
    resting: false,
    age: 0,
  });
}

/** Step 10 of Sim.step, per projectile: resting → fuse countdown; flying → gravity × gravityScale,
 *  sweep with PhysicsWorld.castBullet (owner excluded), burst / land / rest; removed without
 *  effect once it has flown ABILITY_RULES.thrown.maxFlightSeconds (isTimeUp). Burst =
 *  applyEffects (origin = position, via projectile, struck = the character hit) + `burst` event +
 *  removal. */
export function projectileSystem(ctx: SimContext, dt: number): void {
  // A copy: bursts and expiry remove projectiles from the state list.
  for (const p of [...ctx.state.projectiles]) {
    if (p.resting) countDownFuse(ctx, p, dt);
    else fly(ctx, p, dt);
  }
}

/** One tick of flight. The move is exact for constant gravity (displacement v·dt − ½·g·dt²), so
 *  the positions at tick times lie on the closed-form arc that ballisticPitch aims with; the sweep
 *  follows the chord between them. */
function fly(ctx: SimContext, p: ProjectileEntity, dt: number): void {
  if (isTimeUp(ABILITY_RULES.thrown.maxFlightSeconds - p.age)) {
    // Left the level (or never came down): gone without effect.
    remove(ctx, p);
    return;
  }
  // The launch step (age 0) is in the throw tick, which does not count for the fuse.
  const launching = p.age === 0;
  p.age += dt;
  const ability = thrownAbility(p);
  const gravity = projectileGravity(ability);
  const move: Vec3 = { x: p.vel.x * dt, y: p.vel.y * dt - 0.5 * gravity * dt * dt, z: p.vel.z * dt };
  p.vel.y -= gravity * dt;

  const hit = sweep(ctx, p, move);
  if (!hit) {
    p.pos.x += move.x;
    p.pos.y += move.y;
    p.pos.z += move.z;
  } else {
    const offset = ABILITY_RULES.thrown.surfaceOffsetM;
    p.pos = {
      x: hit.point.x + hit.normal.x * offset,
      y: hit.point.y + hit.normal.y * offset,
      z: hit.point.z + hit.normal.z * offset,
    };
    if (p.fuse === null) {
      burst(ctx, p, ability, hit.target?.kind === 'character' ? hit.target.entityId : null);
      return;
    }
    // Fused projectiles never burst on contact (Firebreak lands, then burns).
    land(p, hit);
  }
  if (!launching) countDownFuse(ctx, p, dt);
}

/** The first thing on the way from `p.pos` along `move`: level geometry, a barrier, a device or a
 *  hitbox — never the thrower's own body (not even on the launch tick, inside it). */
function sweep(ctx: SimContext, p: ProjectileEntity, move: Vec3): BulletHit | null {
  const length = Math.hypot(move.x, move.y, move.z);
  if (length === 0) return null;
  const dir = { x: move.x / length, y: move.y / length, z: move.z / length };
  return ctx.physics.castBullet(p.pos, dir, length, p.ownerId);
}

/** A fused projectile's contact: horizontal velocity is dropped. On a level floor it rests (level
 *  geometry never moves); anything else (walls, ceilings, steep slopes, characters, gadgets) only
 *  stops the vertical velocity into it, so it keeps falling off walls and drops when what it lay
 *  on moves away. */
function land(p: ProjectileEntity, hit: BulletHit): void {
  if (hit.target === null && hit.normal.y >= FLOOR_MIN_NORMAL_Y) {
    p.resting = true;
    p.vel = { x: 0, y: 0, z: 0 };
    return;
  }
  p.vel.x = 0;
  p.vel.z = 0;
  if (p.vel.y * hit.normal.y < 0) p.vel.y = 0;
}

/** A fused projectile's fuse runs in flight and at rest from the tick after the throw (as a gadget
 *  timer from the tick after placement), so it bursts exactly secondsToTicks(fuse) ticks after the
 *  throw tick, when its time is up (isTimeUp), where it is (mid-air too). */
function countDownFuse(ctx: SimContext, p: ProjectileEntity, dt: number): void {
  if (p.fuse === null) return;
  p.fuse -= dt;
  if (isTimeUp(p.fuse)) burst(ctx, p, thrownAbility(p), null);
}

/** Removal, the `burst` event, then every effect of the ability once at the projectile's position,
 *  credited to its owner (also after the owner's death). */
function burst(ctx: SimContext, p: ProjectileEntity, ability: AbilityOf<'thrown'>, struck: EntityId | null): void {
  remove(ctx, p);
  const owner = ownerOf(ctx.state, p);
  ctx.emit({ type: 'burst', source: 'projectile', sourceId: p.id, abilityId: p.abilityId, ownerId: p.ownerId, pos: cloneVec3(p.pos) });
  applyEffects(effectContext(ctx, ability, owner, p.pos, { kind: 'projectile', id: p.id }, { struck }));
}

function remove(ctx: SimContext, p: ProjectileEntity): void {
  const i = ctx.state.projectiles.indexOf(p);
  if (i >= 0) ctx.state.projectiles.splice(i, 1);
}

/** Launch velocity of `ability` along unit `dir` (for bots and a later arc preview). */
export const launchVelocity = (ability: AbilityOf<'thrown'>, dir: Vec3): Vec3 => ({
  x: dir.x * ability.activation.speed,
  y: dir.y * ability.activation.speed,
  z: dir.z * ability.activation.speed,
});

// NEW — the projectile system and every aimer (bots' ballisticPitch, a later arc preview) need the
// same downward acceleration of a thrown ability; nothing named it.
/** Downward acceleration (m/s²) of `ability`'s projectile: SIM.gravity × gravityScale. */
export const projectileGravity = (ability: AbilityOf<'thrown'>): number => SIM.gravity * ability.activation.gravityScale;

/** The low-arc pitch (radians) that lands a projectile launched at `speed` under `gravity`
 *  (projectileGravity) `horizontalDist` m away and `dy` m higher, or null if out of reach. Without
 *  gravity: the straight line. */
export function ballisticPitch(speed: number, gravity: number, horizontalDist: number, dy: number): number | null {
  if (gravity <= 0) return Math.atan2(dy, horizontalDist);
  const v2 = speed * speed;
  if (horizontalDist <= 0) {
    // Straight up (if the apex v²/2g reaches) or straight down.
    if (dy <= 0) return -Math.PI / 2;
    return v2 >= 2 * gravity * dy ? Math.PI / 2 : null;
  }
  const discriminant = v2 * v2 - gravity * (gravity * horizontalDist * horizontalDist + 2 * dy * v2);
  if (discriminant < 0) return null;
  return Math.atan((v2 - Math.sqrt(discriminant)) / (gravity * horizontalDist));
}
