// OWNER: agent "liquid" (B). Cellular-automaton water over WorldGrid.liquid, active-set driven.
//
// One step (stepLiquid) over a deterministic snapshot of world.liquidActive:
//   A) Fall (Gauss-Seidel, bottom-up): every cell drops as much as fits into the cell below.
//      Bottom-up order means the receiving cell was already processed → at most 1 row per step.
//   B) Level layers: a "layer" is a horizontal run of wet, resting cells (below blocked or full).
//      Each layer touching a processed cell moves every cell LIQUID.layerLevelRate of the way to
//      the layer mean (snaps to even once the spread is ≤ layerSnapSpread). This stands in for
//      water pressure inside one connected layer: lakes level out quickly and exactly, no
//      integer staircases remain, and a lake drains evenly through a dug hole.
//   C) Spread: every horizontal pair touching a processed cell that is NOT inside one layer (i.e.
//      the edge of the water: wet → empty, wet → falling) moves max(1, floor(diff × sideFlowRate))
//      from a resting higher cell to the lower one. The wet front advances ≤ 1 column per step.
//   B and C are computed from the same post-fall snapshot and applied together (Jacobi), so there
//   is no left/right bias and no parity state; every result stays inside 0..max (see sideFlow).
//   D) Evaporate: a processed cell below LIQUID.minAmount that moved nothing this step is cleared.
// Writes go through setLiquid (chunk revision + wakeAround), so exactly the changed cells and their
// neighbours are active next step; a settled lake drops out of the set and costs nothing.
// Mass is conserved exactly (integer transfers) except for evaporation (< minAmount per cell).
// No vertical pressure: water does not rise in the far arm of a U-tube above the shared layer.
import { LIQUID } from '../config/sim.ts';
import { TILE_DEFS } from '../data/content.ts';
import { setLiquid } from './grid.ts';
import type { WorldGrid } from './state.ts';

/** Per-world scratch buffers (never part of the saved state; rebuilt on demand). */
interface Scratch {
  /** Net delta per cell for the current step (layers + spread). */
  delta: Int32Array;
  /** === stamp: cell is in this step's processed list. */
  inStep: Uint32Array;
  /** === stamp: cell already belongs to a layer levelled this step. */
  inLayer: Uint32Array;
  /** 1 = cell gave or received liquid this step. */
  moved: Uint8Array;
  /** Cells with a non-zero entry in `delta`/`moved` (for O(changes) reset). */
  touched: number[];
  /** Per-step id for the stamp arrays (avoids clearing them). */
  stamp: number;
}

// NEW — liquid.ts is the only system needing per-cell step scratch; kept private to this module.
const scratchByWorld = new WeakMap<WorldGrid, Scratch>();

function scratchFor(w: WorldGrid): Scratch {
  const n = w.width * w.height;
  let s = scratchByWorld.get(w);
  if (!s || s.delta.length !== n) {
    s = {
      delta: new Int32Array(n),
      inStep: new Uint32Array(n),
      inLayer: new Uint32Array(n),
      moved: new Uint8Array(n),
      touched: [],
      stamp: 0,
    };
    scratchByWorld.set(w, s);
  }
  return s;
}

/** True if cell i (in bounds) can hold liquid. */
function holds(w: WorldGrid, i: number): boolean {
  return !(TILE_DEFS[w.fg[i] ?? 0]?.blocksLiquid ?? true);
}

/** True if liquid in cell i rests on something (cannot fall further). */
function resting(w: WorldGrid, i: number): boolean {
  const b = i + w.width;
  if (b >= w.liquid.length) return true;
  return !holds(w, b) || (w.liquid[b] ?? 0) >= LIQUID.max;
}

/** Wet, liquid-holding and resting: member of a layer. */
function layerCell(w: WorldGrid, i: number): boolean {
  return (w.liquid[i] ?? 0) > 0 && holds(w, i) && resting(w, i);
}

/** Fraction of the level difference moved per pair; > 0.5 would overshoot. */
const SIDE_RATE = Math.min(0.5, LIQUID.sideFlowRate);

/**
 * Amount the higher cell `a` hands to the lower `b` (a > b). Never more than (a − b) / 2, so a
 * cell's result is a convex combination of its neighbours and stays inside 0..max.
 */
function sideFlow(a: number, b: number): number {
  const d = a - b;
  if (d < 2) return 0;
  return Math.max(1, Math.floor(d * SIDE_RATE));
}

function addDelta(s: Scratch, i: number, d: number): void {
  if (s.moved[i] === 0 && s.delta[i] === 0) s.touched.push(i);
  s.moved[i] = 1;
  s.delta[i] = (s.delta[i] ?? 0) + d;
}

/** Writes and clears every pending delta (moved flags stay for the rest of the step). */
function applyDeltas(w: WorldGrid, s: Scratch): void {
  for (const i of s.touched) {
    const d = s.delta[i] ?? 0;
    if (d === 0) continue;
    setLiquid(w, i % w.width, (i / w.width) | 0, (w.liquid[i] ?? 0) + d);
    s.delta[i] = 0;
  }
}

/** Levels the layer of `len` cells starting at index `start` (same row) into s.delta. */
function levelLayer(w: WorldGrid, s: Scratch, start: number, len: number): void {
  const liquid = w.liquid;
  let total = 0;
  let min: number = LIQUID.max;
  let max = 0;
  for (let k = 0; k < len; k++) {
    const a = liquid[start + k] ?? 0;
    total += a;
    if (a < min) min = a;
    if (a > max) max = a;
  }
  if (max - min <= 1) return;
  const base = Math.floor(total / len);
  const rem = total - base * len;
  const snap = max - min <= LIQUID.layerSnapSpread;
  let deficit = 0;
  // First pass: blended targets (rounded down); remember the rounding loss.
  for (let k = 0; k < len; k++) {
    const a = liquid[start + k] ?? 0;
    const even = base + (k < rem ? 1 : 0);
    const t = snap ? even : Math.floor(a + (even - a) * LIQUID.layerLevelRate);
    deficit += a - t;
    if (t !== a) addDelta(s, start + k, t - a);
  }
  // Second pass: hand the rounding loss back, left to right, to cells with room.
  for (let k = 0; k < len && deficit > 0; k++) {
    const i = start + k;
    if ((liquid[i] ?? 0) + (s.delta[i] ?? 0) < LIQUID.max) {
      addDelta(s, i, 1);
      deficit--;
    }
  }
}

export function stepLiquid(world: WorldGrid): void {
  const active = world.liquidActive;
  if (active.size === 0) return;
  const w = world.width;
  const liquid = world.liquid;
  const s = scratchFor(world);
  s.stamp = (s.stamp + 1) >>> 0 || 1;
  const stamp = s.stamp;

  // Deterministic snapshot: first maxActivePerStep cells in insertion order; leftovers wait.
  const count = Math.min(active.size, LIQUID.maxActivePerStep);
  const list = new Int32Array(count);
  let n = 0;
  for (const i of active) {
    if (n >= count) break;
    list[n++] = i;
    active.delete(i);
  }
  // Ascending index = top-down, left-right; iterate from the end for bottom-up.
  list.sort();
  for (let k = 0; k < n; k++) s.inStep[list[k] as number] = stamp;

  // A) Fall.
  for (let k = n - 1; k >= 0; k--) {
    const i = list[k] as number;
    const a = liquid[i] ?? 0;
    if (a === 0) continue;
    const x = i % w;
    const y = (i / w) | 0;
    if (!holds(world, i)) {
      setLiquid(world, x, y, 0);
      continue;
    }
    const b = i + w;
    if (b >= liquid.length || !holds(world, b)) continue;
    const below = liquid[b] ?? 0;
    const m = Math.min(a, LIQUID.max - below);
    if (m <= 0) continue;
    setLiquid(world, x, y + 1, below + m);
    setLiquid(world, x, y, a - m);
    addDelta(s, i, 0);
    addDelta(s, b, 0);
  }

  // B) Level every layer touching a processed cell (each layer once per step).
  for (let k = 0; k < n; k++) {
    const i = list[k] as number;
    if (s.inLayer[i] === stamp || !layerCell(world, i)) continue;
    const row = i - (i % w);
    let l = i;
    let r = i;
    while (l > row && layerCell(world, l - 1)) l--;
    while (r < row + w - 1 && layerCell(world, r + 1)) r++;
    for (let j = l; j <= r; j++) s.inLayer[j] = stamp;
    if (r > l) levelLayer(world, s, l, r - l + 1);
  }
  // Applied before C so edge flows see the levelled amounts (keeps every cell ≥ 0).
  applyDeltas(world, s);

  // C) Spread across water edges (pairs not inside one layer).
  const pair = (l: number, r: number): void => {
    const la = liquid[l] ?? 0;
    const ra = liquid[r] ?? 0;
    if (la === ra || !holds(world, l) || !holds(world, r)) return;
    const leftHigher = la > ra;
    const src = leftHigher ? l : r;
    const dst = leftHigher ? r : l;
    if (!resting(world, src)) return;
    // Both wet and resting → same layer, already levelled in B.
    if ((liquid[dst] ?? 0) > 0 && resting(world, dst)) return;
    const f = leftHigher ? sideFlow(la, ra) : sideFlow(ra, la);
    if (f === 0) return;
    addDelta(s, src, -f);
    addDelta(s, dst, f);
  };
  for (let k = 0; k < n; k++) {
    const i = list[k] as number;
    const x = i % w;
    // Each pair once: a processed cell owns its right pair, and its left pair unless the left
    // cell is processed too (then the left cell owns it as its right pair).
    if (x + 1 < w) pair(i, i + 1);
    if (x > 0 && s.inStep[i - 1] !== stamp) pair(i - 1, i);
  }
  applyDeltas(world, s);

  // D) Evaporate stalled thin films.
  for (let k = 0; k < n; k++) {
    const i = list[k] as number;
    const a = liquid[i] ?? 0;
    if (a > 0 && a < LIQUID.minAmount && s.moved[i] === 0) setLiquid(world, i % w, (i / w) | 0, 0);
  }
  for (const i of s.touched) {
    s.delta[i] = 0;
    s.moved[i] = 0;
  }
  s.touched.length = 0;
}

/**
 * Liquid fill of cell (x, y) as 0..1, for rendering: the visible surface sits at
 * y + 1 − fill. Cells with liquid directly above draw full (no gap inside a falling column).
 */
export function liquidFill(world: WorldGrid, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= world.width || y >= world.height) return 0;
  const i = y * world.width + x;
  const a = world.liquid[i] ?? 0;
  if (a === 0) return 0;
  if (y > 0 && (world.liquid[i - world.width] ?? 0) > 0) return 1;
  return a / LIQUID.max;
}
