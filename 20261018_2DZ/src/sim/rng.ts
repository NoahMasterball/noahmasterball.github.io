// Seeded RNG (mulberry32). All gameplay randomness goes through here; visuals may use Math.random.
// State is a plain object so it serialises with SimState.

export interface RngState {
  s: number;
}

export function createRng(seed: number): RngState {
  return { s: seed >>> 0 };
}

/** Uniform float in [0, 1). */
export function rand(r: RngState): number {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Uniform float in [min, max). */
export function randRange(r: RngState, min: number, max: number): number {
  return min + rand(r) * (max - min);
}

/** Uniform integer in [min, max] (inclusive). */
export function randInt(r: RngState, min: number, max: number): number {
  return min + Math.floor(rand(r) * (max - min + 1));
}

export function chance(r: RngState, p: number): boolean {
  return rand(r) < p;
}

/** Picks a key of `weights` proportional to its weight; null if all weights are 0. */
export function pickWeighted<K extends string>(r: RngState, weights: Partial<Record<K, number>>): K | null {
  let total = 0;
  for (const k in weights) total += weights[k] ?? 0;
  if (total <= 0) return null;
  let roll = rand(r) * total;
  for (const k in weights) {
    roll -= weights[k] ?? 0;
    if (roll < 0) return k;
  }
  return null;
}

/** Deterministic hash noise for world generation: value in [0, 1) for integer inputs. */
export function hash2(seed: number, x: number, y: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth 1D value noise in [-1, 1] (cosine-interpolated hash lattice). */
export function noise1(seed: number, x: number, wavelength: number): number {
  const p = x / wavelength;
  const i = Math.floor(p);
  const f = p - i;
  const t = (1 - Math.cos(f * Math.PI)) / 2;
  const a = hash2(seed, i, 0);
  const b = hash2(seed, i + 1, 0);
  return (a + (b - a) * t) * 2 - 1;
}

/** Smooth 2D value noise in [-1, 1]. */
export function noise2(seed: number, x: number, y: number, wavelength: number): number {
  const px = x / wavelength;
  const py = y / wavelength;
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  const fx = px - ix;
  const fy = py - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash2(seed, ix, iy);
  const b = hash2(seed, ix + 1, iy);
  const c = hash2(seed, ix, iy + 1);
  const d = hash2(seed, ix + 1, iy + 1);
  const top = a + (b - a) * sx;
  const bottom = c + (d - c) * sx;
  return (top + (bottom - top) * sy) * 2 - 1;
}
