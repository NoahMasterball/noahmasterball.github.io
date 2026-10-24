import type { BoxDef, DummySpawnDef, LevelDef, Vec3Tuple } from '../schema.ts';
import { PROPS, stairs, type Direction, type StairsDef } from './geometry.ts';

// NEW — greybox test range (SSOT for its geometry). The simulation builds Rapier colliders and
// the client builds meshes from this same definition. Coordinates: metres, Y up, downrange is −Z.
// Layout: firing line with dummy lanes in the middle; movement course (stairs, ramp, crouch
// tunnel, jump boxes, cover) on the right (+X); peek walls and low cover on the left (−X).

const FIRING_LINE_Z = 5;
/** Dummy z for a given distance from the firing line. */
const downrange = (distance: number): number => FIRING_LINE_Z - distance;
const FACING_PLAYER_DEG = 180;

// Movement-course climbs, named so the climb tests walk exactly the geometry built from them.
/** Stairs (0.3 m rise, climbed by autostep) up to platform A (1.8 m). */
const COURSE_STAIRS: StairsDef = { start: [26, 0, 12], direction: '-z', steps: 6, rise: 0.3, depth: 0.5, width: 3 };
const PLATFORM_A: BoxDef = { center: [26, 0.9, 6], size: [3, 1.8, 6], surface: 'platform' };
/** 20° ramp up to platform B (2.4 m); its pitch makes it rise towards `COURSE_RAMP_DIRECTION`. */
const COURSE_RAMP: BoxDef = { center: [34, 1.06, 1.25], size: [4, 0.3, 7.4], rotationDeg: [20, 0, 0], surface: 'ramp' };
const COURSE_RAMP_DIRECTION: Direction = '-z';
/** Ground point at the low end of the ramp (its unrotated half length out from the centre). */
const COURSE_RAMP_FOOT: Vec3Tuple = [COURSE_RAMP.center[0], 0, COURSE_RAMP.center[2] + COURSE_RAMP.size[2] / 2];
const PLATFORM_B: BoxDef = { center: [34, 1.2, -6], size: [6, 2.4, 8], surface: 'platform' };

const boxes: BoxDef[] = [
  // Ground and perimeter.
  { center: [0, -0.5, -20], size: [80, 1, 110], surface: 'floor' },
  { center: [0, 3, 35.5], size: [82, 6, 1], surface: 'wall' },
  { center: [0, 3, -75.5], size: [82, 6, 1], surface: 'wall' },
  { center: [-40.5, 3, -20], size: [1, 6, 110], surface: 'wall' },
  { center: [40.5, 3, -20], size: [1, 6, 110], surface: 'wall' },
  // Firing-line bench (waist high), open at both ends.
  { center: [0, 0.5, FIRING_LINE_Z], size: [24, 1, 0.6], surface: 'trim' },
  // Backstop berm behind the far dummies.
  { center: [0, 2, -62], size: [40, 4, 3], surface: 'cover' },

  // ── Movement course (+X) ──
  ...stairs(COURSE_STAIRS),
  PLATFORM_A,
  COURSE_RAMP,
  PLATFORM_B,
  // Crouch tunnel: 1.4 m clearance (standing capsule 1.8 m does not fit, crouched 1.2 m does).
  { center: [20.1, 0.7, -18], size: [0.4, 1.4, 6], surface: 'wall' },
  { center: [22.9, 0.7, -18], size: [0.4, 1.4, 6], surface: 'wall' },
  { center: [21.5, 1.55, -18], size: [3.2, 0.3, 6], surface: 'wall' },
  // Jump boxes: 0.6 m (every operator) and 1.0 m (only high jumpers).
  { center: [30, 0.3, -18], size: [2, 0.6, 2], surface: 'cover' },
  { center: [34, 0.5, -18], size: [2, 1, 2], surface: 'cover' },
  // Cover crates and a pillar.
  { center: [24, 0.5, -28], size: [1, 1, 1], surface: 'cover' },
  { center: [28, 0.75, -32], size: [1.5, 1.5, 1.5], surface: 'cover' },
  { center: [33, 0.5, -27], size: [2, 1, 1], surface: 'cover' },
  { center: [30, 1.5, -36], size: [1, 3, 1], surface: 'cover' },

  // ── Peek walls (−X) ──
  // Wall with a doorway (1.2 m wide, 2.2 m high).
  { center: [-27.8, 1.5, -10], size: [4.4, 3, 0.4], surface: 'wall' },
  { center: [-22.2, 1.5, -10], size: [4.4, 3, 0.4], surface: 'wall' },
  { center: [-25, 2.6, -10], size: [1.2, 0.8, 0.4], surface: 'wall' },
  // Low cover: hides a crouched operator, a standing one can shoot over it.
  { center: [-26, PROPS.lowCoverHeight / 2, -20], size: [6, PROPS.lowCoverHeight, 0.4], surface: 'cover' },
  // Corner block for jiggle-peeking.
  { center: [-30, 1.5, -30], size: [3, 3, 3], surface: 'wall' },
];

const dummies: DummySpawnDef[] = [
  // 10 m lane: anchor next to speedster — feel the TTK difference.
  { position: [-11, 0, downrange(10)], yawDeg: FACING_PLAYER_DEG, operatorId: 'basalt', behaviour: { kind: 'static' } },
  { position: [-8, 0, downrange(10)], yawDeg: FACING_PLAYER_DEG, operatorId: 'wisp', behaviour: { kind: 'static' } },
  // 20 m lane.
  { position: [-3.5, 0, downrange(20)], yawDeg: FACING_PLAYER_DEG, operatorId: 'basalt', behaviour: { kind: 'static' } },
  { position: [-0.5, 0, downrange(20)], yawDeg: FACING_PLAYER_DEG, operatorId: 'wisp', behaviour: { kind: 'static' } },
  // 35 m lane.
  { position: [4.5, 0, downrange(35)], yawDeg: FACING_PLAYER_DEG, operatorId: 'basalt', behaviour: { kind: 'static' } },
  { position: [7.5, 0, downrange(35)], yawDeg: FACING_PLAYER_DEG, operatorId: 'wisp', behaviour: { kind: 'static' } },
  // Strafing lane: tracking practice.
  { position: [13, 0, downrange(15)], yawDeg: FACING_PLAYER_DEG, operatorId: 'wisp', behaviour: { kind: 'strafe', width: 6 } },
  { position: [13, 0, downrange(25)], yawDeg: FACING_PLAYER_DEG, operatorId: 'basalt', behaviour: { kind: 'strafe', width: 6 } },
  // 50 m: long range falloff check.
  { position: [-6, 0, downrange(50)], yawDeg: FACING_PLAYER_DEG, operatorId: 'basalt', behaviour: { kind: 'static' } },
];

export const RANGE_LAYOUT = {
  /** Movement-course climbs: walking `direction` from `foot` (ground level) leads onto `platform`. */
  climbs: {
    stairs: { foot: COURSE_STAIRS.start, direction: COURSE_STAIRS.direction, platform: PLATFORM_A },
    ramp: { foot: COURSE_RAMP_FOOT, direction: COURSE_RAMP_DIRECTION, platform: PLATFORM_B },
  },
} as const;

export const RANGE_LEVEL: LevelDef = {
  id: 'range',
  name: 'Test Range',
  boxes,
  playerSpawn: { position: [0, 0, 12], yawDeg: 0 },
  range: { firingLineZ: FIRING_LINE_Z, dummies },
};
