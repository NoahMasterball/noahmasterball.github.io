import type { Vec3 } from './math.ts';
import type { PhysicsWorld, SurfaceHit } from './physics/world.ts';

// NEW — the simulation's read-only query surface (ADR-0011 §1, ADR-0012 §4.2). Bots (src/ai/),
// the sim's own ability rules (placement, area line of sight), the client (placement ghost) and
// level tests ask the world questions through it; it never mutates state and needs no Rapier
// types. Valid between steps: level probes see the level geometry, which never moves; sight and
// free-box probes also see barrier gadgets as of the last physics step.

export interface SimQuery {
  /** True if neither level geometry nor a barrier lies between `a` and `b`. Characters and
   *  devices never block sight. */
  lineOfSight(a: Vec3, b: Vec3): boolean;
  /** Y of the first level surface straight below `p` within `maxDrop` m, or null (nav checks,
   *  area drops). Gadgets are not level. */
  groundBelow(p: Vec3, maxDrop: number): number | null;
  /** The first level surface along unit `dir` from `origin` within `maxDist` m, or null
   *  (placement). Gadgets are not level. */
  surfaceAlong(origin: Vec3, dir: Vec3, maxDist: number): SurfaceHit | null;
  /** True if nothing that blocks movement (level geometry, barriers, character capsules)
   *  overlaps the box (centre, half extents, rotation about +Y). */
  boxFree(center: Vec3, halfExtents: Vec3, yaw: number): boolean;
}

export function createSimQuery(physics: PhysicsWorld): SimQuery {
  return {
    lineOfSight: (a, b) => physics.castSight(a, b),
    groundBelow: (p, maxDrop) => physics.castGround(p, maxDrop),
    surfaceAlong: (origin, dir, maxDist) => physics.castSurface(origin, dir, maxDist),
    boxFree: (center, halfExtents, yaw) => physics.boxFree(center, halfExtents, yaw),
  };
}
