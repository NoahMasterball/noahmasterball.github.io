import { ABILITY_RULES } from '../../config/sim.ts';
import type { PlacementSurface } from '../../data/schema.ts';
import { anglesTo, cloneVec3, forwardFromAngles, vec3, type Vec3 } from '../math.ts';
import { FLOOR_MIN_NORMAL_Y, type SurfaceHit } from '../physics/world.ts';
import type { SimQuery } from '../query.ts';
import type { AbilityOf } from '../systems/abilities.ts';
import { aimOf } from '../systems/weapons.ts';
import type { CharacterEntity } from '../types.ts';
import { gadgetShape, type GadgetPose } from './gadgets.ts';

// NEW — the placement rule (ADR-0012 §4.6), pure over SimQuery: the sim confirms with it, the
// client draws the ghost with it, bots aim with it.

/** Why a placement is not valid: no level surface in reach, the wrong kind of surface (or a
 *  ceiling), or the barrier box is not free (geometry, a barrier or a character). */
export type PlacementFailure = 'noSurface' | 'surface' | 'blocked';

export interface PlacementPose extends GadgetPose {
  valid: boolean;
  /** null when valid. */
  failure: PlacementFailure | null;
}

const UP: Vec3 = { x: 0, y: 1, z: 0 };
const DOWN: Vec3 = { x: 0, y: -1, z: 0 };

type SurfaceClass = 'floor' | 'wall' | 'ceiling';

/** Floor = within CHARACTER.maxSlopeClimbDeg of up, ceiling = the mirror, anything else a wall. */
function surfaceClass(normal: Vec3): SurfaceClass {
  if (normal.y >= FLOOR_MIN_NORMAL_Y) return 'floor';
  return normal.y <= -FLOOR_MIN_NORMAL_Y ? 'ceiling' : 'wall';
}

/** Whether a surface class takes a gadget of `surface` (a ceiling never does). */
const takes = (surface: PlacementSurface, cls: SurfaceClass): boolean => cls !== 'ceiling' && (surface === 'any' || surface === cls);

/** Where `e` would place `ability`'s gadget looking along `look` (the sim passes this tick's
 *  look, commandLook; the crosshair adds the recoil offset, aimOf): a ray from the eye
 *  `placeRange` long on level geometry (SimQuery.surfaceAlong), else a drop of at most
 *  ABILITY_RULES.placement.maxDropM from its end; the surface class must match the activation's
 *  `surface`; barriers need a free box (SimQuery.boxFree, shrunk and lifted by
 *  ABILITY_RULES.placement.skinM). Barriers stand on the
 *  hit point facing the crosshair's yaw; devices sit `deviceRadiusM` out of the surface, facing
 *  the crosshair's yaw on a floor and out of the surface on a wall. An invalid pose still says
 *  where the gadget would go (the ghost is drawn there); without a surface that is the ray's end. */
export function placementPose(
  query: SimQuery,
  e: Readonly<CharacterEntity>,
  ability: AbilityOf<'placeable'>,
  look: { yaw: number; pitch: number },
): PlacementPose {
  const { placeRange, surface } = ability.activation;
  const aim = aimOf(e, look);
  const dir = forwardFromAngles(aim.yaw, aim.pitch);
  const end = vec3(aim.origin.x + dir.x * placeRange, aim.origin.y + dir.y * placeRange, aim.origin.z + dir.z * placeRange);
  const hit = query.surfaceAlong(aim.origin, dir, placeRange) ?? query.surfaceAlong(end, DOWN, ABILITY_RULES.placement.maxDropM);
  if (!hit) return { pos: end, yaw: aim.yaw, normal: cloneVec3(UP), valid: false, failure: 'noSurface' };

  const cls = surfaceClass(hit.normal);
  const shape = gadgetShape(ability);
  if (shape.kind === 'device') {
    const pose = devicePose(hit, cls, aim.yaw, shape.radius);
    return takes(surface, cls) ? { ...pose, valid: true, failure: null } : { ...pose, valid: false, failure: 'surface' };
  }
  const pose: GadgetPose = { pos: cloneVec3(hit.point), yaw: aim.yaw, normal: cloneVec3(hit.normal) };
  if (!takes(surface, cls)) return { ...pose, valid: false, failure: 'surface' };
  const skin = ABILITY_RULES.placement.skinM;
  const [hx, hy, hz] = shape.halfExtents;
  // Lifted off the floor it stands on, shrunk so touching neighbours do not count as overlaps.
  const centre = vec3(pose.pos.x, pose.pos.y + hy + skin, pose.pos.z);
  const free = query.boxFree(centre, vec3(hx - skin, hy - skin, hz - skin), pose.yaw);
  return free ? { ...pose, valid: true, failure: null } : { ...pose, valid: false, failure: 'blocked' };
}

/** A device's pose on a surface hit: its centre `radius` out along the normal; floor devices face
 *  the placer's yaw, wall devices face out of the wall. */
function devicePose(hit: SurfaceHit, cls: SurfaceClass, lookYaw: number, radius: number): GadgetPose {
  const n = hit.normal;
  return {
    pos: vec3(hit.point.x + n.x * radius, hit.point.y + n.y * radius, hit.point.z + n.z * radius),
    yaw: cls === 'wall' ? anglesTo(vec3(), n).yaw : lookYaw,
    normal: cloneVec3(n),
  };
}
