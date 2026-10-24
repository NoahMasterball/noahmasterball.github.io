import type { BoxDef, LevelDef, SiteDef, SpawnPointDef, SpawnZoneDef, Surface, Vec3Tuple, VolumeDef } from '../schema.ts';
import {
  alongDirection,
  directionYawDeg,
  openingVolume,
  PROPS,
  stairs,
  stairsRun,
  wall,
  wedgeRamp,
  type OpeningDef,
  type RampDef,
  type StairsDef,
} from './geometry.ts';
import { saltworksNav } from './saltworks.nav.ts';

// NEW — "Saltworks", greybox map #1 for attack/defence (SPEC §13) and SSOT for its geometry:
// the simulation builds colliders and the client builds meshes from this definition.
// Coordinates: metres, Y up, north = −Z. Attackers come from the south courtyard, the two-storey
// building fills the north edge of the map.
//
//   z −36  ┌─ north facade = map edge ─────────────────────────────────────┐
//          │ A hall (open to the roof),  │ service corridor: defender spawn │
//          │ catwalk (upper) on its east │ service stairs → upper corridor  │
//   z −28  │ side, hall stairs up to it  ├─ lobby ──────┬─ storage (ground) ┤
//          │         [SITE A]            │ gallery      │ [SITE B] upstairs │
//   z −12  ├─ office ────────────────────┤ atrium with  │  control room     │
//          │                             │ lobby stairs │                   │ landing
//   z  −4  └─ door ────────────────── main door ───────┴─ window ──────────┘ ramp ↑
//          courtyard: pump house, containers, low walls, crates
//   z  30  spawn shields (block sight from the building to the attacker spawns)
//   z  35  attacker spawn "West Gate"                 attacker spawn "East Lot"
//          x −30 … west alley … −22 ─────── building ─────── 22 … east alley … 30

const FLOOR = { ground: 0, upper: 4 } as const;
/** Upper-floor slab thickness: ground-storey ceilings are at upper − SLAB. */
const SLAB = 0.4;
const WALL = { thickness: 0.4, top: 7.5 } as const;
const H = WALL.thickness / 2;
const DOOR = { width: 2.4, height: 2.6 } as const;
const MAIN_DOOR = { width: 3, height: 3 } as const;
/** Window sill and top above the floor it belongs to: standing eyes see out, crouched do not. */
const WINDOW = { sill: 1.1, top: 2.2 } as const;
const RAIL = { height: 1, thickness: 0.2 } as const;
/** Stair steps: rise below the controller's autostep height, depth above its minimum width. */
const STEP = { rise: 0.25, depth: 0.45, width: 2.8 } as const;
const STEPS_PER_STOREY = Math.round((FLOOR.upper - FLOOR.ground) / STEP.rise);
const STAIRS_RUN = STEPS_PER_STOREY * STEP.depth;

const MAP = { minX: -30, maxX: 30, minZ: -36, maxZ: 40 } as const;
const BOUNDARY = { height: 6, thickness: 1 } as const;
const BUILDING = { minX: -22, maxX: 22, minZ: -36, maxZ: -4 } as const;
/** Centre lines of the interior walls. */
const LINE = { hallEast: -6, officeNorth: -12, lobbyEast: 6, corridorSouth: -28 } as const;
/** Upper-floor edges that are not walls. */
const CATWALK = { westX: -10, southZ: -14 } as const;
const GALLERY_EDGE_Z = -20;
/** Landing in front of site B's east door, reached by the east ramp; the east alley keeps a
 *  lane of this width beside it. */
const ALLEY_LANE = 4.2;
const LANDING = { x0: BUILDING.maxX + H, x1: MAP.maxX - ALLEY_LANE, z0: -14, z1: -8 } as const;
const LANDING_DOOR_Z = (LANDING.z0 + LANDING.z1) / 2;
const RAMP_RUN = 10;

const CRATE = { small: [1, 1, 1], large: [1.2, 1.2, 1.2], stack: [1.5, 1.5, 1.5] } as const satisfies Record<string, Vec3Tuple>;
const CONTAINER_NS: Vec3Tuple = [2.4, 2.6, 6];
const CONTAINER_EW: Vec3Tuple = [6, 2.6, 2.4];
const DESK_HEIGHT = 1.1;
const SITE_HEIGHT = 3;
/** Spawn points: spacing within a row and distance between the two rows. */
const SPAWN = { spacing: 3, rowGap: 2.5 } as const;

// ── Vertical connections (every one climbable by the character controller) ──

const LOBBY_STAIRS: StairsDef = {
  start: [LINE.lobbyEast - H - STEP.width / 2, FLOOR.ground, GALLERY_EDGE_Z + STAIRS_RUN],
  direction: '-z',
  steps: STEPS_PER_STOREY,
  ...STEP,
};
const SERVICE_STAIRS: StairsDef = {
  start: [12, FLOOR.ground, BUILDING.minZ + H + STEP.width / 2],
  direction: '+x',
  steps: STEPS_PER_STOREY,
  ...STEP,
};
const HALL_STAIRS: StairsDef = {
  start: [CATWALK.westX - STAIRS_RUN, FLOOR.ground, BUILDING.minZ + H + STEP.width / 2],
  direction: '+x',
  steps: STEPS_PER_STOREY,
  ...STEP,
};
const EAST_RAMP: RampDef = {
  bottom: [(LANDING.x0 + LANDING.x1) / 2, FLOOR.ground, LANDING.z1 + RAMP_RUN],
  direction: '-z',
  run: RAMP_RUN,
  rise: FLOOR.upper - FLOOR.ground,
  width: LANDING.x1 - LANDING.x0,
};

const SERVICE_TOP_X = alongDirection(SERVICE_STAIRS.start, SERVICE_STAIRS.direction, stairsRun(SERVICE_STAIRS))[0];
const STAIRWELL_SOUTH_Z = SERVICE_STAIRS.start[2] + STEP.width / 2;
const LOBBY_STAIRS_WEST_X = LOBBY_STAIRS.start[0] - STEP.width / 2;
const HALL_STAIRS_SOUTH_Z = HALL_STAIRS.start[2] + STEP.width / 2;
/** The catwalk door and site B's west door face each other across the gallery. */
const GALLERY_DOOR_Z = -24;

// ── Builders ────────────────────────────────────────────────────────────────

const door = (at: number, floor: number, d: { width: number; height: number } = DOOR): OpeningDef => ({
  from: at - d.width / 2,
  to: at + d.width / 2,
  bottom: floor,
  top: floor + d.height,
});

/** The catwalk railing leaves a gap in front of the catwalk door: the drop into site A. */
const CATWALK_DROP = door(GALLERY_DOOR_Z, FLOOR.upper);

const windowOpening = (from: number, to: number, floor: number): OpeningDef => ({
  from,
  to,
  bottom: floor + WINDOW.sill,
  top: floor + WINDOW.top,
});

/** Building wall over both storeys. */
const fullWall = (axis: 'x' | 'z', at: number, from: number, to: number, openings: OpeningDef[] = []): BoxDef[] =>
  wall({ axis, at, from, to, bottom: FLOOR.ground, top: WALL.top, thickness: WALL.thickness, openings });

// NEW — ADR-0013 §4: the facade openings are needed twice — left open by the facade walls and
// closed by Relay's setup walls — so they are defined once, per facade.
/** An outer wall of the building: its line and its openings. */
interface Facade {
  axis: 'x' | 'z';
  at: number;
  openings: readonly OpeningDef[];
}

/** The building's outer walls and every exterior opening (the defenders' ways out). */
const FACADES: Record<'south' | 'north' | 'west' | 'east', Facade> = {
  /** Office door, main door, site B window (upper floor). */
  south: { axis: 'x', at: BUILDING.maxZ, openings: [door(-14, FLOOR.ground), door(0, FLOOR.ground, MAIN_DOOR), windowOpening(10, 18, FLOOR.upper)] },
  north: { axis: 'x', at: BUILDING.minZ, openings: [] },
  /** Hall door (site A). */
  west: { axis: 'z', at: BUILDING.minX, openings: [door(-21, FLOOR.ground)] },
  /** Storage door; site B's east door onto the ramp landing. */
  east: { axis: 'z', at: BUILDING.maxX, openings: [door(-23, FLOOR.ground), door(LANDING_DOOR_Z, FLOOR.upper)] },
};

/** A facade over both storeys; the south and north ones span the corners. */
function facade(f: Facade): BoxDef[] {
  const [from, to] = f.axis === 'x' ? [BUILDING.minX - H, BUILDING.maxX + H] : [BUILDING.minZ + H, BUILDING.maxZ - H];
  return fullWall(f.axis, f.at, from, to, [...f.openings]);
}

/** Relay setup walls: one per exterior opening, filling it over the facade's thickness. */
const setupWalls: VolumeDef[] = Object.values(FACADES).flatMap((f) =>
  f.openings.map((o) => openingVolume({ axis: f.axis, at: f.at, thickness: WALL.thickness }, o)),
);

/** Upper-floor slab, walkable at FLOOR.upper. */
const slab = (x0: number, x1: number, z0: number, z1: number): BoxDef => ({
  center: [(x0 + x1) / 2, FLOOR.upper - SLAB / 2, (z0 + z1) / 2],
  size: [x1 - x0, SLAB, z1 - z0],
  surface: 'floor',
});

/** A box standing on a floor. */
const block = (x: number, z: number, size: Vec3Tuple, surface: Surface, floor: number = FLOOR.ground): BoxDef => ({
  center: [x, floor + size[1] / 2, z],
  size,
  surface,
});

const railAlongX = (z: number, x0: number, x1: number): BoxDef =>
  block((x0 + x1) / 2, z, [x1 - x0, RAIL.height, RAIL.thickness], 'trim', FLOOR.upper);
const railAlongZ = (x: number, z0: number, z1: number): BoxDef =>
  block(x, (z0 + z1) / 2, [RAIL.thickness, RAIL.height, z1 - z0], 'trim', FLOOR.upper);

/** Five spawn points: a row of three at `z` and a row of two at z + `back` × rowGap (`back` =
 *  +1/−1 along Z; with a north/south facing: the front row and the back row). */
function spawnRows(x: number, z: number, yawDeg: number, back: 1 | -1): SpawnPointDef[] {
  const s = SPAWN.spacing;
  const zBack = z + back * SPAWN.rowGap;
  return [
    { position: [x - s, FLOOR.ground, z], yawDeg },
    { position: [x, FLOOR.ground, z], yawDeg },
    { position: [x + s, FLOOR.ground, z], yawDeg },
    { position: [x - s / 2, FLOOR.ground, zBack], yawDeg },
    { position: [x + s / 2, FLOOR.ground, zBack], yawDeg },
  ];
}

// ── Geometry ────────────────────────────────────────────────────────────────

const mapW = MAP.maxX - MAP.minX;
const mapD = MAP.maxZ - MAP.minZ;
const mapCx = (MAP.minX + MAP.maxX) / 2;
const mapCz = (MAP.minZ + MAP.maxZ) / 2;
const bt = BOUNDARY.thickness;

const groundAndBoundary: BoxDef[] = [
  { center: [mapCx, FLOOR.ground - 0.5, mapCz], size: [mapW, 1, mapD], surface: 'floor' },
  { center: [mapCx, BOUNDARY.height / 2, MAP.maxZ + bt / 2], size: [mapW + 2 * bt, BOUNDARY.height, bt], surface: 'wall' },
  { center: [mapCx, BOUNDARY.height / 2, MAP.minZ - bt / 2], size: [mapW + 2 * bt, BOUNDARY.height, bt], surface: 'wall' },
  { center: [MAP.minX - bt / 2, BOUNDARY.height / 2, mapCz], size: [bt, BOUNDARY.height, mapD], surface: 'wall' },
  { center: [MAP.maxX + bt / 2, BOUNDARY.height / 2, mapCz], size: [bt, BOUNDARY.height, mapD], surface: 'wall' },
];

// Walls end at the faces of the walls they meet, slabs at wall faces, so no faces overlap.
const building: BoxDef[] = [
  // Facades (FACADES: their openings are also the setup walls).
  ...facade(FACADES.south),
  ...facade(FACADES.north),
  ...facade(FACADES.west),
  ...facade(FACADES.east),

  // Interior walls. Hall + office | lobby + corridor: hall back door, catwalk door, hall lobby door.
  ...fullWall('z', LINE.hallEast, BUILDING.minZ + H, BUILDING.maxZ - H, [
    door(-32, FLOOR.ground),
    door(GALLERY_DOOR_Z, FLOOR.upper),
    door(-17, FLOOR.ground),
  ]),
  // Office | hall.
  ...fullWall('x', LINE.officeNorth, BUILDING.minX + H, LINE.hallEast - H, [door(-16, FLOOR.ground)]),
  // Lobby | storage + site B: site B west door (from the gallery), storage door.
  ...fullWall('z', LINE.lobbyEast, LINE.corridorSouth + H, BUILDING.maxZ - H, [
    door(GALLERY_DOOR_Z, FLOOR.upper),
    door(-7, FLOOR.ground),
  ]),
  // Lobby | corridor, ground storey only (gallery and upper corridor are open to each other).
  ...wall({
    axis: 'x',
    at: LINE.corridorSouth,
    from: LINE.hallEast + H,
    to: LINE.lobbyEast - H,
    bottom: FLOOR.ground,
    top: FLOOR.upper,
    thickness: WALL.thickness,
    openings: [door(-3.6, FLOOR.ground)],
  }),
  // Storage + site B | corridor: storage back door, site B north door.
  ...fullWall('x', LINE.corridorSouth, LINE.lobbyEast - H, BUILDING.maxX - H, [door(10.2, FLOOR.ground), door(17, FLOOR.upper)]),

  // Upper floor.
  slab(BUILDING.minX + H, LINE.hallEast - H, LINE.officeNorth + H, BUILDING.maxZ - H), // office ceiling (no access)
  slab(CATWALK.westX, LINE.hallEast - H, BUILDING.minZ + H, CATWALK.southZ), // hall catwalk
  slab(LINE.hallEast + H, LINE.lobbyEast - H, LINE.corridorSouth + H, GALLERY_EDGE_Z), // gallery over the lobby
  slab(LINE.lobbyEast + H, BUILDING.maxX - H, LINE.corridorSouth + H, BUILDING.maxZ - H), // site B floor
  // Upper corridor around the service stairwell.
  slab(LINE.hallEast + H, SERVICE_STAIRS.start[0], BUILDING.minZ + H, LINE.corridorSouth - H),
  slab(SERVICE_STAIRS.start[0], SERVICE_TOP_X, STAIRWELL_SOUTH_Z, LINE.corridorSouth - H),
  slab(SERVICE_TOP_X, BUILDING.maxX - H, BUILDING.minZ + H, LINE.corridorSouth - H),

  // Railings on open upper edges; the catwalk keeps a gap to drop into site A.
  railAlongX(GALLERY_EDGE_Z - RAIL.thickness / 2, LINE.hallEast + H, LOBBY_STAIRS_WEST_X),
  railAlongX(STAIRWELL_SOUTH_Z + RAIL.thickness / 2, SERVICE_STAIRS.start[0], SERVICE_TOP_X),
  railAlongZ(SERVICE_STAIRS.start[0] - RAIL.thickness / 2, BUILDING.minZ + H, STAIRWELL_SOUTH_Z),
  railAlongZ(CATWALK.westX + RAIL.thickness / 2, HALL_STAIRS_SOUTH_Z, CATWALK_DROP.from),
  railAlongZ(CATWALK.westX + RAIL.thickness / 2, CATWALK_DROP.to, CATWALK.southZ),
  railAlongX(CATWALK.southZ - RAIL.thickness / 2, CATWALK.westX, LINE.hallEast - H),

  // Vertical connections.
  ...stairs(LOBBY_STAIRS),
  ...stairs(SERVICE_STAIRS),
  ...stairs(HALL_STAIRS),
  wedgeRamp(EAST_RAMP),
  {
    center: [(LANDING.x0 + LANDING.x1) / 2, FLOOR.upper / 2, (LANDING.z0 + LANDING.z1) / 2],
    size: [LANDING.x1 - LANDING.x0, FLOOR.upper, LANDING.z1 - LANDING.z0],
    surface: 'platform',
  },
];

const cover: BoxDef[] = [
  // Courtyard: the pump house and containers break the long approach lanes; the spawn shields
  // keep every building door, window and the landing out of sight of the attacker spawns.
  block(0, 12, [8, 3.5, 6], 'wall'),
  block(-17, 30, [18, 3, 0.6], 'wall'),
  block(17, 30, [18, 3, 0.6], 'wall'),
  block(-19, 14, CONTAINER_NS, 'cover'),
  block(19, 16, CONTAINER_NS, 'cover'),
  block(12, 4, CONTAINER_EW, 'cover'),
  block(-11, 22, CONTAINER_EW, 'cover'),
  block(-8, 3, [4, PROPS.lowCoverHeight, 0.4], 'cover'),
  block(6, 22, [4, PROPS.lowCoverHeight, 0.4], 'cover'),
  block(-25, 6, [0.4, PROPS.lowCoverHeight, 4], 'cover'),
  block(26, 10, [0.4, PROPS.lowCoverHeight, 4], 'cover'),
  block(-5, -2, CRATE.small, 'cover'),
  block(5, -2, CRATE.large, 'cover'),
  block(-19, -1.5, CRATE.large, 'cover'),
  block(16, -1.5, CRATE.small, 'cover'),
  // Alleys.
  block(-27, -12, CRATE.stack, 'cover'),
  block(-25.5, -29, CRATE.small, 'cover'),
  block(27.5, -18, CRATE.large, 'cover'),
  block(25, -31, CRATE.stack, 'cover'),
  // Site A (tank hall).
  block(-18.5, -27, [3, 3, 3], 'wall'),
  block(-13.5, -19.5, [2.4, 3, 2.4], 'wall'),
  block(-13, -28.5, [3, PROPS.lowCoverHeight, 0.4], 'cover'),
  block(-16, -23, CRATE.small, 'cover'),
  block(-20.5, -15.5, CRATE.stack, 'cover'),
  block(-8, -21, CRATE.large, 'cover'),
  // Lobby: the desk blocks the straight view from the main door to the corridor door.
  block(-1.5, -10, [5, DESK_HEIGHT, 1], 'cover'),
  block(-3.5, -16, [0.8, WALL.top, 0.8], 'wall'),
  block(3.5, -25, CRATE.large, 'cover'),
  block(-1, -24, CRATE.small, 'cover'),
  // Storage shelves and crates.
  block(10, -17, [1, 2.2, 6], 'cover'),
  block(15, -11, [1, 2.2, 6], 'cover'),
  block(17.5, -19.5, [1, 2.2, 5], 'cover'),
  block(12, -7, CRATE.large, 'cover'),
  block(19.5, -26, CRATE.small, 'cover'),
  // Service corridor.
  block(-4.5, -35, CRATE.small, 'cover'),
  block(21, -30, CRATE.large, 'cover'),
  // Site B (control room, upper floor): server block and consoles.
  block(14, -16, [2, 2.2, 4], 'wall', FLOOR.upper),
  block(10, -11, [3, DESK_HEIGHT, 1], 'cover', FLOOR.upper),
  block(18, -21, [3, DESK_HEIGHT, 1], 'cover', FLOOR.upper),
  block(11, -24, [1, DESK_HEIGHT, 3], 'cover', FLOOR.upper),
  block(20, -6, CRATE.large, 'cover', FLOOR.upper),
  block(8, -6.5, CRATE.small, 'cover', FLOOR.upper),
  // Gallery and upper corridor.
  block(-4.5, -27, CRATE.small, 'cover', FLOOR.upper),
  block(7, -34.5, CRATE.large, 'cover', FLOOR.upper),
];

const sites: SiteDef[] = [
  { id: 'A', name: 'Tank Hall', center: [-14, FLOOR.ground + SITE_HEIGHT / 2, -24], size: [10, SITE_HEIGHT, 10] },
  { id: 'B', name: 'Control Room', center: [14, FLOOR.upper + SITE_HEIGHT / 2, -16], size: [10, SITE_HEIGHT, 12] },
];

const FACE_NORTH_DEG = directionYawDeg('-z');
/** The defenders look west along the service corridor, not across it at its south wall (3 m
 *  away): the lobby door and the hall back door (site A) ahead, the service stairs (site B)
 *  behind. Their slot 0 stands at the west end of the row of three, nobody in front of it. */
const FACE_WEST_DEG = directionYawDeg('-x');

const spawnZones: SpawnZoneDef[] = [
  { id: 'west_gate', name: 'West Gate', side: 'attack', points: spawnRows(-19, 35, FACE_NORTH_DEG, 1) },
  { id: 'east_lot', name: 'East Lot', side: 'attack', points: spawnRows(19, 35, FACE_NORTH_DEG, 1) },
  { id: 'service', name: 'Service Corridor', side: 'defend', points: spawnRows(3, -31.5, FACE_WEST_DEG, -1) },
];

/** Layout anchors that tests and the bot waypoint graph (saltworks.nav.ts) refer to. */
export const SALTWORKS_LAYOUT = {
  floors: FLOOR,
  step: STEP,
  /** Every connection between the floors; each ends on the upper floor. */
  vertical: { lobbyStairs: LOBBY_STAIRS, serviceStairs: SERVICE_STAIRS, hallStairs: HALL_STAIRS, eastRamp: EAST_RAMP },
  /** Z of site B's east door, in the middle of the ramp landing. */
  landingDoorZ: LANDING_DOOR_Z,
  /** Z of the gallery doors (catwalk door, site B west door). */
  galleryDoorZ: GALLERY_DOOR_Z,
  /** X of the catwalk's open west edge; its railing gap at galleryDoorZ is the drop into site A. */
  catwalkEdgeX: CATWALK.westX,
} as const;

export const SALTWORKS_LEVEL: LevelDef = {
  id: 'saltworks',
  name: 'Saltworks',
  boxes: [...groundAndBoundary, ...building, ...cover],
  playerSpawn: { position: [0, FLOOR.ground, 32], yawDeg: FACE_NORTH_DEG },
  spawnZones,
  sites,
  setupWalls,
  nav: saltworksNav(SALTWORKS_LAYOUT),
};
