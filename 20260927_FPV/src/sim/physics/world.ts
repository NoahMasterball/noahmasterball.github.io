import RAPIER from '@dimforge/rapier3d-compat';
import { CHARACTER, TICK_DT } from '../../config/sim.ts';
import type { HitboxProfileDef, HitboxShape, HitZone, LevelDef, VolumeDef } from '../../data/schema.ts';
import type { GadgetShape } from '../abilities/gadgets.ts';
import { CAPSULE_REST_GAP, capsuleDims, layoutHitboxes } from '../hitbox.ts';
import { DEG2RAD, quatFromDegrees, quatFromYaw, type Vec3 } from '../math.ts';
import type { EntityId } from '../types.ts';
import { COLLISION_GROUPS } from './groups.ts';

// NEW — the simulation's Rapier wrapper (ADR-0002). Owns the Rapier world and the side tables
// that map entity ids to bodies/colliders (characters, gadgets). Rapier handles never enter
// SimState.

let initPromise: Promise<void> | null = null;

/** Loads Rapier's WASM (inlined base64 in the compat build). Safe to call repeatedly. */
export function initPhysics(): Promise<void> {
  initPromise ??= RAPIER.init();
  return initPromise;
}

interface CharacterBody {
  body: RAPIER.RigidBody;
  capsule: RAPIER.Collider;
  hitboxes: RAPIER.Collider[];
  profile: HitboxProfileDef;
}

/** What the character controller made of a desired translation. */
export interface MoveResult {
  /** Translation actually achieved. */
  delta: Vec3;
  /** Supported by something below after the move: Rapier's ground detection (any surface that
   *  is not vertical, including a step edge being climbed) or the settle onto the ground. */
  grounded: boolean;
  /** Horizontal unit normals (pointing out of the obstacle) of the walls the move ran into.
   *  Walkable slopes and steps the controller can climb onto are not walls. */
  walls: Vec3[];
}

const UP: Vec3 = { x: 0, y: 1, z: 0 };
const DOWN: Vec3 = { x: 0, y: -1, z: 0 };
const NO_ROTATION = { x: 0, y: 0, z: 0, w: 1 };
/** Surface normals with at least this up component are floors — walkable ground (within
 *  CHARACTER.maxSlopeClimbDeg of up); the one floor class for movement, placement (ADR-0012 §4.6)
 *  and resting projectiles. */
export const FLOOR_MIN_NORMAL_Y = Math.cos(CHARACTER.maxSlopeClimbDeg * DEG2RAD);
/** Height of the capsule's bottom-sphere centre above the feet (the same for every stance). */
const FOOT_CENTER_Y = capsuleDims(0).centerY - capsuleDims(0).halfHeight;
/** Normals with a smaller horizontal part are floors/ceilings, which never block horizontally. */
const MIN_WALL_NORMAL_XZ = 1e-3;

// NEW — ADR-0012 §4.2: bullets and projectile sweeps also hit gadgets.
/** What a bullet ray hit besides level geometry: a character's hitbox or a gadget. */
export type RayTarget = { kind: 'character'; entityId: EntityId; zone: HitZone } | { kind: 'gadget'; entityId: EntityId };

export interface BulletHit {
  point: Vec3;
  normal: Vec3;
  distance: number;
  /** The hitbox or gadget hit; null for level geometry (and for a gadget removed this tick). */
  target: RayTarget | null;
}

// NEW — ADR-0014 §4: what the physics side tables are derived from when a snapshot is restored.
/** A character's body as the state implies it (syncCharacters). */
export interface CharacterBodyState {
  id: EntityId;
  profile: HitboxProfileDef;
  /** Feet. */
  pos: Vec3;
  yaw: number;
  stance: number;
  /** Dead characters' colliders are disabled (setActive). */
  alive: boolean;
}

/** A gadget's collider as the state implies it (resetGadgets). */
export interface GadgetColliderState {
  id: EntityId;
  shape: GadgetShape;
  pos: Vec3;
  yaw: number;
}

/** A level surface hit by a probe (SimQuery.surfaceAlong). */
export interface SurfaceHit {
  point: Vec3;
  /** Unit normal pointing out of the surface. */
  normal: Vec3;
  distance: number;
}

function shapeDesc(shape: HitboxShape): RAPIER.ColliderDesc {
  switch (shape.kind) {
    case 'ball':
      return RAPIER.ColliderDesc.ball(shape.radius);
    case 'cuboid':
      return RAPIER.ColliderDesc.cuboid(shape.halfExtents[0], shape.halfExtents[1], shape.halfExtents[2]);
    case 'capsule':
      return RAPIER.ColliderDesc.capsule(shape.halfHeight, shape.radius);
  }
}

function resizeCollider(collider: RAPIER.Collider, shape: HitboxShape): void {
  switch (shape.kind) {
    case 'ball':
      collider.setRadius(shape.radius);
      break;
    case 'cuboid':
      collider.setHalfExtents({ x: shape.halfExtents[0], y: shape.halfExtents[1], z: shape.halfExtents[2] });
      break;
    case 'capsule':
      collider.setHalfHeight(shape.halfHeight);
      collider.setRadius(shape.radius);
      break;
  }
}

export class PhysicsWorld {
  private readonly world: RAPIER.World;
  private readonly controller: RAPIER.KinematicCharacterController;
  private readonly characters = new Map<EntityId, CharacterBody>();
  /** Collider handle → what a bullet ray reports for it (hitboxes, gadgets). */
  private readonly colliderOwners = new Map<number, RayTarget>();
  private readonly gadgets = new Map<EntityId, RAPIER.Collider>();
  /** Gadget colliders disabled by removeGadget, removed at the start of the next step(). */
  private readonly pendingRemovals: RAPIER.Collider[] = [];
  /** The bottom sphere of every movement capsule; ground and step probes sweep it. */
  private readonly footBall = new RAPIER.Ball(CHARACTER.radius);
  /** The level's setup walls (ADR-0013 §4). */
  private readonly setupWallVolumes: readonly VolumeDef[];
  /** Their colliders, created when first raised (setSetupWalls): even disabled colliders change
   *  Rapier's handles and broad phase, and with them the tie-breaks of every mode without walls. */
  private setupWalls: RAPIER.Collider[] | null = null;
  private setupWallsUp = false;

  /** Requires initPhysics() to have resolved. */
  constructor(level: LevelDef) {
    // Only kinematic bodies exist; gravity is applied by the movement system.
    this.world = new RAPIER.World({ x: 0, y: 0, z: 0 });
    this.world.timestep = TICK_DT;
    for (const box of level.boxes) {
      const desc = RAPIER.ColliderDesc.cuboid(box.size[0] / 2, box.size[1] / 2, box.size[2] / 2)
        .setTranslation(box.center[0], box.center[1], box.center[2])
        .setRotation(quatFromDegrees(box.rotationDeg))
        .setCollisionGroups(COLLISION_GROUPS.static);
      this.world.createCollider(desc);
    }
    this.setupWallVolumes = level.setupWalls ?? [];
    // Scene queries only see colliders that a step has indexed: without this step the first
    // tick's controller query misses the level and every spawned character settles ~6 mm low.
    this.world.step();
    const c = this.world.createCharacterController(CHARACTER.controllerOffset);
    c.setUp(UP);
    c.setSlideEnabled(true);
    c.setMaxSlopeClimbAngle(CHARACTER.maxSlopeClimbDeg * DEG2RAD);
    c.setMinSlopeSlideAngle(CHARACTER.minSlopeSlideDeg * DEG2RAD);
    c.enableAutostep(CHARACTER.autostepMaxHeight, CHARACTER.autostepMinWidth, false);
    // No Rapier snap-to-ground: standing moves settle onto the ground themselves (move()).
    c.setApplyImpulsesToDynamicBodies(false);
    this.controller = c;
  }

  addCharacter(id: EntityId, profile: HitboxProfileDef, pos: Vec3, yaw: number): void {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(pos.x, pos.y, pos.z).setRotation(quatFromYaw(yaw)),
    );
    const dims = capsuleDims(0);
    const capsule = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(dims.halfHeight, dims.radius)
        .setTranslation(0, dims.centerY, 0)
        .setCollisionGroups(COLLISION_GROUPS.mover),
      body,
    );
    const entry: CharacterBody = { body, capsule, hitboxes: [], profile };
    this.characters.set(id, entry);
    this.buildHitboxes(id, entry, 0);
  }

  // NEW — ADR-0014 §4: a restored snapshot may lack characters this world has (back in time).
  /** Removes a character's body with its capsule and hitboxes. */
  removeCharacter(id: EntityId): void {
    const c = this.get(id);
    for (const h of c.hitboxes) this.colliderOwners.delete(h.handle);
    this.world.removeRigidBody(c.body);
    this.characters.delete(id);
  }

  /** Makes the character bodies match `list` (Sim.restore, ADR-0014 §4): removes bodies without
   *  an entry, adds missing ones, replaces a hitbox set whose profile differs, then applies each
   *  entry's stance, enabled state and pose. Scene queries see the result after settle(). */
  syncCharacters(list: readonly CharacterBodyState[]): void {
    const wanted = new Set(list.map((c) => c.id));
    for (const id of [...this.characters.keys()]) if (!wanted.has(id)) this.removeCharacter(id);
    for (const c of list) {
      const body = this.characters.get(c.id);
      if (!body) this.addCharacter(c.id, c.profile, c.pos, c.yaw);
      else if (body.profile !== c.profile) this.setProfile(c.id, c.profile, c.stance);
      this.applyStance(c.id, c.stance);
      this.setActive(c.id, c.alive);
      this.teleport(c.id, c.pos, c.yaw);
    }
  }

  /** Replaces the hitbox set (operator change). */
  setProfile(id: EntityId, profile: HitboxProfileDef, stance: number): void {
    const c = this.get(id);
    for (const h of c.hitboxes) {
      this.colliderOwners.delete(h.handle);
      this.world.removeCollider(h, false);
    }
    c.profile = profile;
    this.buildHitboxes(id, c, stance);
  }

  private buildHitboxes(id: EntityId, c: CharacterBody, stance: number): void {
    c.hitboxes = layoutHitboxes(c.profile, stance).map((pose) => {
      const collider = this.world.createCollider(
        shapeDesc(pose.shape)
          .setTranslation(pose.center.x, pose.center.y, pose.center.z)
          .setSensor(true)
          .setCollisionGroups(COLLISION_GROUPS.hitbox),
        c.body,
      );
      this.colliderOwners.set(collider.handle, { kind: 'character', entityId: id, zone: pose.part.zone });
      return collider;
    });
  }

  /** Resizes the movement capsule and re-lays the hitboxes for a stance. */
  applyStance(id: EntityId, stance: number): void {
    const c = this.get(id);
    const dims = capsuleDims(stance);
    c.capsule.setHalfHeight(dims.halfHeight);
    c.capsule.setTranslationWrtParent({ x: 0, y: dims.centerY, z: 0 });
    layoutHitboxes(c.profile, stance).forEach((pose, i) => {
      const collider = c.hitboxes[i];
      if (!collider) return;
      resizeCollider(collider, pose.shape);
      collider.setTranslationWrtParent(pose.center);
    });
  }

  /** True if a character at `feet` could occupy the capsule of `stance` without intersecting geometry. */
  fits(id: EntityId, feet: Vec3, stance: number): boolean {
    const c = this.get(id);
    const dims = capsuleDims(stance);
    const skin = CHARACTER.headroomSkin;
    const shape = new RAPIER.Capsule(dims.halfHeight - skin, dims.radius - skin);
    const hit = this.world.intersectionWithShape(
      { x: feet.x, y: feet.y + dims.centerY + skin, z: feet.z },
      { x: 0, y: 0, z: 0, w: 1 },
      shape,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      COLLISION_GROUPS.moveQuery,
      c.capsule,
      c.body,
    );
    return hit === null;
  }

  /** Runs the kinematic character controller for a desired translation and reports the walls it
   *  ran into. With `followGround` (standing on walkable ground: move along it, never into it)
   *  the capsule then settles at CAPSULE_REST_GAP above the ground, which replaces Rapier's
   *  snap-to-ground. Rapier handles the floor under a standing character badly: pushed into it,
   *  its slide logic swallows the whole move on some ticks (dead stops); grazing it at exactly
   *  the controller offset, it reads noisy normals (centimetre hops). */
  move(id: EntityId, desired: Vec3, followGround: boolean): MoveResult {
    const c = this.get(id);
    this.controller.computeColliderMovement(
      c.capsule,
      desired,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      COLLISION_GROUPS.moveQuery,
    );
    const m = this.controller.computedMovement();
    const delta = { x: m.x, y: m.y, z: m.z };
    const foot = this.footCenter(c);
    foot.x += delta.x;
    foot.y += delta.y;
    foot.z += delta.z;
    const walls: Vec3[] = [];
    let steppedUp = false;
    for (let i = 0; i < this.controller.numComputedCollisions(); i++) {
      const n = this.controller.computedCollision(i)?.normal1;
      if (!n || n.y >= FLOOR_MIN_NORMAL_Y) continue;
      const xz = Math.hypot(n.x, n.z);
      if (xz < MIN_WALL_NORMAL_XZ) continue;
      const wall = { x: n.x / xz, y: 0, z: n.z / xz };
      if (this.canStepOnto(c, foot, wall)) steppedUp = true;
      else walls.push(wall);
    }

    // Settle onto the ground (down a slope or a step, or back from a hop), except while climbing
    // a step: the capsule rides up its edge, and settling would pull it back off.
    let grounded = this.controller.computedGrounded();
    if (followGround && !steppedUp) {
      const reach = Math.max(delta.y, 0) + CAPSULE_REST_GAP + CHARACTER.snapToGround;
      const ground = this.sweepFoot(c, foot, DOWN, reach, 0);
      if (ground) {
        // The rest gap is measured along the surface normal.
        delta.y -= ground.time_of_impact - CAPSULE_REST_GAP / Math.max(ground.normal1.y, FLOOR_MIN_NORMAL_Y);
        grounded = true;
      }
    }
    return { delta, grounded, walls };
  }

  /** True if the character stands on walkable ground: its capsule rests on a surface of at most
   *  CHARACTER.maxSlopeClimbDeg, or on an edge (a stair nose) with walkable ground within
   *  step-down reach right under the feet. False on a ledge overhang, a slope too steep or in the
   *  air, where gravity must keep acting. */
  onWalkableGround(id: EntityId): boolean {
    const c = this.get(id);
    const foot = this.footCenter(c);
    const support = this.sweepFoot(c, foot, DOWN, CAPSULE_REST_GAP + CHARACTER.groundProbe, 0);
    if (!support) return false;
    if (support.normal1.y >= FLOOR_MIN_NORMAL_Y) return true;
    const below = this.world.castRayAndGetNormal(
      new RAPIER.Ray(foot, DOWN),
      FOOT_CENTER_Y + CHARACTER.snapToGround,
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      COLLISION_GROUPS.moveQuery,
      c.capsule,
      c.body,
    );
    return below !== null && below.normal.y >= FLOOR_MIN_NORMAL_Y;
  }

  /** Centre of the capsule's bottom sphere, from the body (feet) position. */
  private footCenter(c: CharacterBody): Vec3 {
    const feet = c.body.translation();
    return { x: feet.x, y: feet.y + FOOT_CENTER_Y, z: feet.z };
  }

  /** Sweeps the capsule's bottom sphere from `from` along unit `dir` until it comes within
   *  `gap` of something. Ground probes sweep to contact (gap 0): a sweep that starts exactly at
   *  its gap from a surface (as the controller leaves walls beside the capsule) reports spurious
   *  hits with unreliable normals. */
  private sweepFoot(c: CharacterBody, from: Vec3, dir: Vec3, distance: number, gap: number): RAPIER.ColliderShapeCastHit | null {
    return this.world.castShape(
      from,
      NO_ROTATION,
      dir,
      this.footBall,
      gap,
      distance,
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      COLLISION_GROUPS.moveQuery,
      c.capsule,
      c.body,
    );
  }

  /** True if the obstacle behind a wall contact (outward normal `wall`) is a step: low enough to
   *  climb and with room on top. Mirrors Rapier's autostep test (lift by the step height plus the
   *  offset, then advance by the minimum width); the head-room part is left out, since this only
   *  decides whether blocked motion is a wall. */
  private canStepOnto(c: CharacterBody, foot: Vec3, wall: Vec3): boolean {
    const lift = CHARACTER.autostepMaxHeight + CHARACTER.controllerOffset;
    const lifted = { x: foot.x, y: foot.y + lift, z: foot.z };
    const into = { x: -wall.x, y: 0, z: -wall.z };
    return this.sweepFoot(c, lifted, into, CHARACTER.autostepMinWidth, CHARACTER.controllerOffset) === null;
  }

  /** Target pose for the next physics step (kinematic interpolation inside Rapier). */
  setNextPose(id: EntityId, feet: Vec3, yaw: number): void {
    const c = this.get(id);
    c.body.setNextKinematicTranslation(feet);
    c.body.setNextKinematicRotation(quatFromYaw(yaw));
  }

  /** Instant move (spawn, respawn, teleport). */
  teleport(id: EntityId, feet: Vec3, yaw: number): void {
    const c = this.get(id);
    c.body.setTranslation(feet, true);
    c.body.setRotation(quatFromYaw(yaw), true);
    this.setNextPose(id, feet, yaw);
    this.world.propagateModifiedBodyPositionsToColliders();
  }

  /** Dead characters keep their colliders (stable handles) but disable them. */
  setActive(id: EntityId, active: boolean): void {
    const c = this.get(id);
    c.capsule.setEnabled(active);
    for (const h of c.hitboxes) h.setEnabled(active);
  }

  // NEW — gadget colliders (ADR-0012 §4.1–§4.3), fixed (no body): barriers are solid cuboids
  // standing on their base centre, devices sensor balls around their centre.

  /** Creates a gadget's collider. Scene queries see it after the next step() (Rapier indexes
   *  colliders there): bullets later in the same tick, movement from the next tick. */
  addGadget(id: EntityId, shape: GadgetShape, pos: Vec3, yaw: number): void {
    if (this.gadgets.has(id)) throw new Error(`Gadget ${id} already has a collider`);
    const desc =
      shape.kind === 'barrier'
        ? RAPIER.ColliderDesc.cuboid(shape.halfExtents[0], shape.halfExtents[1], shape.halfExtents[2])
            .setTranslation(pos.x, pos.y + shape.halfExtents[1], pos.z)
            .setRotation(quatFromYaw(yaw))
            .setCollisionGroups(COLLISION_GROUPS.barrier)
        : RAPIER.ColliderDesc.ball(shape.radius)
            .setTranslation(pos.x, pos.y, pos.z)
            .setSensor(true)
            .setCollisionGroups(COLLISION_GROUPS.device);
    const collider = this.world.createCollider(desc);
    this.gadgets.set(id, collider);
    this.colliderOwners.set(collider.handle, { kind: 'gadget', entityId: id });
  }

  /** Disables a gadget's collider now (as dead characters') and removes it inside the next
   *  step(), before Rapier steps, when no query runs. A ray that still reaches it before then
   *  reports level geometry (target null). */
  removeGadget(id: EntityId): void {
    const collider = this.gadgets.get(id);
    if (!collider) throw new Error(`No gadget collider for entity ${id}`);
    collider.setEnabled(false);
    this.colliderOwners.delete(collider.handle);
    this.gadgets.delete(id);
    this.pendingRemovals.push(collider);
  }

  /** Removes every gadget collider now (pending removals too) and creates one per entry of `list`
   *  (Sim.restore, ADR-0014 §4). Scene queries see them after settle(). */
  resetGadgets(list: readonly GadgetColliderState[]): void {
    for (const collider of this.gadgets.values()) {
      this.colliderOwners.delete(collider.handle);
      this.world.removeCollider(collider, false);
    }
    this.gadgets.clear();
    for (const collider of this.pendingRemovals.splice(0)) this.world.removeCollider(collider, false);
    for (const g of list) this.addGadget(g.id, g.shape, g.pos, g.yaw);
  }

  /** One Rapier step outside the tick (Sim.restore): scene queries index the moved, created and
   *  toggled colliders. Kinematic bodies rest at their next pose and there is no gravity, so
   *  nothing moves (as in setSetupWalls). */
  settle(): void {
    this.world.step();
  }

  // NEW — ADR-0013 §4: the setup walls follow the match state (Sim calls this after the mode
  // step and at creation), so a restored snapshot rebuilds them from state alone (ADR-0014 §4).
  /** Raises or lowers every setup wall (no-op without a change; the colliders are created the
   *  first time). Scene queries see a new, enabled or disabled collider only after a Rapier step,
   *  so a change steps the world once (as the constructor does): kinematic bodies rest at their
   *  next pose between ticks, so nothing moves, and this tick's movement already meets (or
   *  passes) the walls. */
  setSetupWalls(up: boolean): void {
    if (up === this.setupWallsUp) return;
    this.setupWallsUp = up;
    this.setupWalls ??= this.setupWallVolumes.map((v) =>
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(v.size[0] / 2, v.size[1] / 2, v.size[2] / 2)
          .setTranslation(v.center[0], v.center[1], v.center[2])
          .setCollisionGroups(COLLISION_GROUPS.setupWall),
      ),
    );
    for (const collider of this.setupWalls) collider.setEnabled(up);
    this.world.step();
  }

  /** Pending gadget removals, then the Rapier step (indexes new and changed colliders). */
  step(): void {
    for (const collider of this.pendingRemovals.splice(0)) this.world.removeCollider(collider, false);
    this.world.step();
  }

  /** Hitscan ray from `origin` along unit `dir`, ignoring the shooter's own body. */
  castBullet(origin: Vec3, dir: Vec3, maxRange: number, shooterId: EntityId): BulletHit | null {
    const ray = new RAPIER.Ray(origin, dir);
    const hit = this.world.castRayAndGetNormal(
      ray,
      maxRange,
      true,
      undefined,
      COLLISION_GROUPS.bulletQuery,
      undefined,
      this.get(shooterId).body,
    );
    if (!hit) return null;
    const t = hit.timeOfImpact;
    return {
      point: { x: origin.x + dir.x * t, y: origin.y + dir.y * t, z: origin.z + dir.z * t },
      normal: { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z },
      distance: t,
      target: this.colliderOwners.get(hit.collider.handle) ?? null,
    };
  }

  // NEW — read-only probes for SimQuery (src/sim/query.ts, ADR-0011 §1, ADR-0012 §4.2). Level
  // probes (COLLISION_GROUPS.levelQuery) see static geometry only, which never moves; sight and
  // free-box probes also see barriers as of the last step().

  /** True if no level geometry and no barrier lies on the segment from `a` to `b`. Characters
   *  (capsules and hitboxes) and devices never block; a segment starting inside geometry is
   *  blocked. */
  castSight(a: Vec3, b: Vec3): boolean {
    const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (len === 0) return true;
    const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len, z: (b.z - a.z) / len };
    const hit = this.world.castRay(
      new RAPIER.Ray(a, dir),
      len,
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      COLLISION_GROUPS.sightQuery,
    );
    return hit === null;
  }

  /** Y of the first level surface straight below `p` within `maxDrop` (p itself if it lies
   *  inside geometry), or null. Gadgets are not level. */
  castGround(p: Vec3, maxDrop: number): number | null {
    const hit = this.world.castRay(
      new RAPIER.Ray(p, DOWN),
      maxDrop,
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      COLLISION_GROUPS.levelQuery,
    );
    return hit ? p.y - hit.timeOfImpact : null;
  }

  /** The first level surface along unit `dir` from `origin` within `maxDist` (placement
   *  surfaces), or null. Gadgets are not level. */
  castSurface(origin: Vec3, dir: Vec3, maxDist: number): SurfaceHit | null {
    const hit = this.world.castRayAndGetNormal(
      new RAPIER.Ray(origin, dir),
      maxDist,
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      COLLISION_GROUPS.levelQuery,
    );
    if (!hit) return null;
    const t = hit.timeOfImpact;
    return {
      point: { x: origin.x + dir.x * t, y: origin.y + dir.y * t, z: origin.z + dir.z * t },
      normal: { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z },
      distance: t,
    };
  }

  /** True if nothing that blocks movement (level geometry, barriers, character capsules)
   *  overlaps the box with centre `center`, half extents `halfExtents` and rotation `yaw`
   *  (as of the last step()). */
  boxFree(center: Vec3, halfExtents: Vec3, yaw: number): boolean {
    const hit = this.world.intersectionWithShape(
      center,
      quatFromYaw(yaw),
      new RAPIER.Cuboid(halfExtents.x, halfExtents.y, halfExtents.z),
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      COLLISION_GROUPS.moveQuery,
    );
    return hit === null;
  }

  private get(id: EntityId): CharacterBody {
    const c = this.characters.get(id);
    if (!c) throw new Error(`No physics body for entity ${id}`);
    return c;
  }
}
