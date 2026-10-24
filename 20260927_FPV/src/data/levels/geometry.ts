import type { BoxDef, LevelDef, Surface, Vec3Tuple, VolumeDef } from '../schema.ts';

// NEW — greybox building blocks shared by the level files (stairs, wedge ramps, walls with
// openings) plus the level-extent query used by validation and tests. The builders only emit
// plain BoxDefs, so collision and visuals keep coming from the one LevelDef.

/** Prop dimensions shared by every level, so the same prop reads (and plays) the same everywhere. */
export const PROPS = {
  /** Low cover: hides a crouched operator (1.2 m capsule); a standing one shoots over it. */
  lowCoverHeight: 1.15,
} as const;

/** Horizontal build/climb direction of stairs and ramps. */
export type Direction = '+x' | '-x' | '+z' | '-z';

/** Axis, sign and the yaw (degrees, Y-up, yaw 0 looks down −Z) that faces each direction. */
const DIRECTIONS: Record<Direction, { axis: 'x' | 'z'; sign: 1 | -1; yawDeg: number }> = {
  '+x': { axis: 'x', sign: 1, yawDeg: -90 },
  '-x': { axis: 'x', sign: -1, yawDeg: 90 },
  '+z': { axis: 'z', sign: 1, yawDeg: 180 },
  '-z': { axis: 'z', sign: -1, yawDeg: 0 },
};

/** Yaw in degrees that looks along a direction (same convention as spawn `yawDeg`). */
export const directionYawDeg = (d: Direction): number => DIRECTIONS[d].yawDeg;

/** Point `distance` metres from `origin` along a horizontal direction. */
export function alongDirection(origin: Vec3Tuple, d: Direction, distance: number): Vec3Tuple {
  const { axis, sign } = DIRECTIONS[d];
  return axis === 'x' ? [origin[0] + sign * distance, origin[1], origin[2]] : [origin[0], origin[1], origin[2] + sign * distance];
}

export interface StairsDef {
  /** Centre of the bottom edge of the first step (x, floor height, z). */
  start: Vec3Tuple;
  direction: Direction;
  steps: number;
  rise: number;
  depth: number;
  width: number;
}

/** Solid stairs: every step is a block down to the start height, so nothing can be walked under. */
export function stairs(s: StairsDef): BoxDef[] {
  const { axis, sign } = DIRECTIONS[s.direction];
  return Array.from({ length: s.steps }, (_, i): BoxDef => {
    const h = s.rise * (i + 1);
    const offset = sign * s.depth * (i + 0.5);
    const y = s.start[1] + h / 2;
    return axis === 'x'
      ? { center: [s.start[0] + offset, y, s.start[2]], size: [s.depth, h, s.width], surface: 'platform' }
      : { center: [s.start[0], y, s.start[2] + offset], size: [s.width, h, s.depth], surface: 'platform' };
  });
}

/** Horizontal length of a flight of stairs. */
export const stairsRun = (s: StairsDef): number => s.steps * s.depth;

export interface RampDef {
  /** Centre of the bottom edge of the walking surface. */
  bottom: Vec3Tuple;
  direction: Direction;
  /** Horizontal length and height gain of the walking surface. */
  run: number;
  rise: number;
  width: number;
}

/** Slope of a ramp's walking surface in degrees. */
export const rampSlopeDeg = (r: RampDef): number => (Math.atan2(r.rise, r.run) * 180) / Math.PI;

/** Solid wedge ramp: one tilted box whose underside reaches the bottom height at the top end, so
 *  there is no gap to walk under. The top end tucks `rise·tan(slope)` under whatever it leads
 *  to, which must therefore be solid (a landing block or a floor). */
export function wedgeRamp(r: RampDef): BoxDef {
  const { axis, sign, yawDeg } = DIRECTIONS[r.direction];
  const slope = Math.atan2(r.rise, r.run);
  const thickness = r.rise / Math.cos(slope);
  // Surface midpoint pushed down along the surface normal by half the thickness.
  const along = sign * (r.run / 2 + (thickness / 2) * Math.sin(slope));
  const y = r.bottom[1] + r.rise / 2 - (thickness / 2) * Math.cos(slope);
  const center: Vec3Tuple = axis === 'x' ? [r.bottom[0] + along, y, r.bottom[2]] : [r.bottom[0], y, r.bottom[2] + along];
  return {
    center,
    size: [r.width, thickness, Math.hypot(r.run, r.rise)],
    rotationDeg: [(slope * 180) / Math.PI, yawDeg, 0],
    surface: 'ramp',
  };
}

/** A hole in a wall, in the wall's own coordinates: `from`/`to` along it, `bottom`/`top` absolute. */
export interface OpeningDef {
  from: number;
  to: number;
  bottom: number;
  top: number;
}

export interface WallDef {
  /** The horizontal axis the wall runs along. */
  axis: 'x' | 'z';
  /** Centre-line coordinate on the other horizontal axis. */
  at: number;
  from: number;
  to: number;
  bottom: number;
  top: number;
  thickness: number;
  openings?: readonly OpeningDef[];
  surface?: Surface;
}

/** Where a wall runs: its axis, centre line and thickness. */
export type WallLine = Pick<WallDef, 'axis' | 'at' | 'thickness'>;

/** The volume of a wall's section from `a0` to `a1` along it, `y0` to `y1` high. */
function wallSection(w: WallLine, a0: number, a1: number, y0: number, y1: number): VolumeDef {
  const mid = (a0 + a1) / 2;
  const y = (y0 + y1) / 2;
  return w.axis === 'x'
    ? { center: [mid, y, w.at], size: [a1 - a0, y1 - y0, w.thickness] }
    : { center: [w.at, y, mid], size: [w.thickness, y1 - y0, a1 - a0] };
}

// NEW — ADR-0013 §4: Relay's setup walls close a building's exterior openings exactly; the
// opening's volume is the wall section the opening leaves out.
/** The volume an opening leaves out of a wall (full wall thickness). */
export const openingVolume = (w: WallLine, o: OpeningDef): VolumeDef => wallSection(w, o.from, o.to, o.bottom, o.top);

/** A straight wall split into boxes around its door and window openings. */
export function wall(w: WallDef): BoxDef[] {
  const surface = w.surface ?? 'wall';
  const piece = (a0: number, a1: number, y0: number, y1: number): BoxDef => ({ ...wallSection(w, a0, a1, y0, y1), surface });
  const out: BoxDef[] = [];
  let cursor = w.from;
  for (const o of [...(w.openings ?? [])].sort((a, b) => a.from - b.from)) {
    if (o.from < cursor || o.to > w.to || o.bottom < w.bottom || o.top > w.top) {
      throw new Error(`Wall opening [${o.from}, ${o.to}] overlaps another opening or leaves the wall`);
    }
    if (o.from > cursor) out.push(piece(cursor, o.from, w.bottom, w.top));
    if (o.bottom > w.bottom) out.push(piece(o.from, o.to, w.bottom, o.bottom));
    if (o.top < w.top) out.push(piece(o.from, o.to, o.top, w.top));
    cursor = o.to;
  }
  if (cursor < w.to) out.push(piece(cursor, w.to, w.bottom, w.top));
  return out;
}

export interface Extent {
  min: Vec3Tuple;
  max: Vec3Tuple;
}

/** Half extents of a box's axis-aligned bounds: exact when unrotated, its bounding sphere when
 *  rotated (conservative, and keeps rotation maths out of src/data). */
export function boxHalfExtents(b: BoxDef): Vec3Tuple {
  const rotated = b.rotationDeg?.some((a) => a !== 0) ?? false;
  if (!rotated) return [b.size[0] / 2, b.size[1] / 2, b.size[2] / 2];
  const r = Math.hypot(b.size[0], b.size[1], b.size[2]) / 2;
  return [r, r, r];
}

/** Axis-aligned extent of all level geometry (see boxHalfExtents for rotated boxes). */
export function levelExtent(level: LevelDef): Extent {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const b of level.boxes) {
    const h = boxHalfExtents(b);
    for (const i of [0, 1, 2] as const) {
      min[i] = Math.min(min[i], b.center[i] - h[i]);
      max[i] = Math.max(max[i], b.center[i] + h[i]);
    }
  }
  return { min, max };
}

/** True if a point lies inside an extent (inclusive). */
export const insideExtent = (e: Extent, p: Vec3Tuple): boolean =>
  p[0] >= e.min[0] && p[0] <= e.max[0] && p[1] >= e.min[1] && p[1] <= e.max[1] && p[2] >= e.min[2] && p[2] <= e.max[2];
