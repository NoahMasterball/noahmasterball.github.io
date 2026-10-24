import { CHARACTER } from '../config/sim.ts';
import { getHitboxProfile, getOperator } from '../data/content.ts';
import type { HitboxPartDef, HitboxProfileDef, HitboxShape, HitZone } from '../data/schema.ts';
import { lerp, rotateY, type Vec3 } from './math.ts';
import type { CharacterEntity } from './types.ts';

// NEW — stance-dependent body geometry. Used by the physics (colliders) and by the client
// (greybox character visuals), so what you see is exactly what you can hit (SPEC §5.1).

/** Height scale for a stance: 1 standing … crouchHeight/standHeight crouched. */
export const stanceHeightRatio = (stance: number): number =>
  lerp(1, CHARACTER.crouchHeight / CHARACTER.standHeight, stance);

export const eyeHeight = (stance: number): number => CHARACTER.eyeHeight * stanceHeightRatio(stance);

// NEW — the distance an ability radius is measured to (ADR-0012 §3.2): a disc on the floor must
// catch feet, a chest-height burst the torso; no body-to-point distance existed.
/** Distance from `p` to the nearest point of the character's vertical body axis, from the feet
 *  to the top of its current stance. */
export function bodyDistance(e: Pick<CharacterEntity, 'pos' | 'stance'>, p: Vec3): number {
  const top = e.pos.y + CHARACTER.standHeight * stanceHeightRatio(e.stance);
  const y = Math.min(Math.max(p.y, e.pos.y), top);
  return Math.hypot(p.x - e.pos.x, p.y - y, p.z - e.pos.z);
}

// NEW — the capsule/ground gap was implicit (0: feet = capsule bottom), which put a resting
// character's feet a controller offset above the floor and spawns inside the offset band.
/** Gap between a standing character's movement capsule and the ground (see groundClearance). */
export const CAPSULE_REST_GAP = CHARACTER.controllerOffset + CHARACTER.groundClearance;

/** Movement capsule for a stance; `centerY` is relative to the feet. The capsule floats
 *  CAPSULE_REST_GAP above the feet, so a resting character's feet touch the floor exactly and
 *  a spawn at floor height starts at rest. */
export function capsuleDims(stance: number): { halfHeight: number; radius: number; centerY: number } {
  const height = CHARACTER.standHeight * stanceHeightRatio(stance);
  return {
    halfHeight: height / 2 - CHARACTER.radius,
    radius: CHARACTER.radius,
    centerY: height / 2 + CAPSULE_REST_GAP,
  };
}

export interface HitboxPose {
  part: HitboxPartDef;
  shape: HitboxShape;
  /** Centre relative to the feet in the character's local frame (facing −Z). */
  center: Vec3;
}

function compressShape(shape: HitboxShape, ratio: number): HitboxShape {
  switch (shape.kind) {
    case 'ball':
      return shape;
    case 'cuboid':
      return { kind: 'cuboid', halfExtents: [shape.halfExtents[0], shape.halfExtents[1] * ratio, shape.halfExtents[2]] };
    case 'capsule':
      return { kind: 'capsule', halfHeight: shape.halfHeight * ratio, radius: shape.radius };
  }
}

/** Hitbox layout for a stance: vertical positions and heights compress with the stance ratio. */
export function layoutHitboxes(profile: HitboxProfileDef, stance: number): HitboxPose[] {
  const ratio = stanceHeightRatio(stance);
  return profile.parts.map((part) => ({
    part,
    shape: compressShape(part.shape, ratio),
    center: { x: part.center[0], y: part.center[1] * ratio, z: part.center[2] },
  }));
}

/** World-space centre of a named hitbox part for a character pose (QA aiming, tests). */
export function partWorldCenter(profile: HitboxProfileDef, stance: number, feet: Vec3, yaw: number, partName: string): Vec3 {
  const pose = layoutHitboxes(profile, stance).find((p) => p.part.name === partName);
  if (!pose) throw new Error(`Hitbox profile '${profile.id}' has no part '${partName}'`);
  const local = rotateY(pose.center, yaw);
  return { x: feet.x + local.x, y: feet.y + local.y, z: feet.z + local.z };
}

// Moved here from src/balance/budget.ts (exposure) so the sim can pick a zone's main part too.
/** Area a hitbox shape shows from the front, m² (standing, overlaps ignored). */
export function shapeFrontalArea(shape: HitboxShape): number {
  switch (shape.kind) {
    case 'ball':
      return Math.PI * shape.radius ** 2;
    case 'cuboid':
      return 4 * shape.halfExtents[0] * shape.halfExtents[1];
    case 'capsule':
      return 4 * shape.radius * shape.halfHeight + Math.PI * shape.radius ** 2;
  }
}

// NEW — aim point of a hit zone (bot sight checks and aim, ADR-0011 §2/§4); partWorldCenter
// only resolves named parts.
/** The part of a hit zone that shows the most area (head, chest, a leg). */
export function mainZonePart(profile: HitboxProfileDef, zone: HitZone): HitboxPartDef {
  let best: HitboxPartDef | null = null;
  for (const part of profile.parts) {
    if (part.zone === zone && (!best || shapeFrontalArea(part.shape) > shapeFrontalArea(best.shape))) best = part;
  }
  if (!best) throw new Error(`Hitbox profile '${profile.id}' has no '${zone}' part`);
  return best;
}

/** World-space centre of a character's hit zone (its main part) in its current pose. */
export function zoneWorldCenter(e: Pick<CharacterEntity, 'operatorId' | 'stance' | 'pos' | 'yaw'>, zone: HitZone): Vec3 {
  const profile = getHitboxProfile(getOperator(e.operatorId).hitboxProfile);
  return partWorldCenter(profile, e.stance, e.pos, e.yaw, mainZonePart(profile, zone).name);
}
