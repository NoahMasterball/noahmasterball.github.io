// NEW — pixel art of one tile cell (RENDER.tileTexels² texels) into an ImageData buffer. Colours
// come from TileDef/WallDef.presentation; the pattern per tile from TILE_PATTERNS (config).
// Deterministic per-tile/per-texel variation via the sim's hash2 (seeded by the world seed).
// Terraria-like look: tiles bordering open cells get a dark 1-texel outline (natural ground with
// rounded, notched edges), different natural materials meet at a dark seam, grass is a bright
// cap that wraps the sides and grows blades into the air cell above, walls are darker and duller.
import { RENDER, TILE_PATTERNS, type TilePattern } from '../../config/client.ts';
import { WORLD } from '../../config/sim.ts';
import { NO_WALL, TILE_DEFS, WALL_DEFS, WALL_INDEX } from '../../data/content.ts';
import { TILE_IDS, type TileDef } from '../../data/schema.ts';
import { hash2 } from '../../sim/rng.ts';
import type { WorldGrid } from '../../sim/state.ts';
import { abgr, mix, saturate, shade, tint } from '../color.ts';

const T = RENDER.tileTexels;
const R = RENDER.cornerRadius;
const PATTERN: readonly TilePattern[] = TILE_IDS.map((id) => TILE_PATTERNS[id] ?? 'noise');
/** Open = light/background visible through it (derived from TileDef.transparent). */
const OPEN: readonly boolean[] = TILE_DEFS.map((d) => d.transparent);
const AIR_INDEX = 0;
/** Patterns of natural terrain: rounded, notched outer edges like Terraria. */
const ROUNDED = new Set<TilePattern>(['noise', 'grass', 'gravel', 'specks', 'rock', 'leaves']);
/** Tiles that get the dark outline at open edges (opaque tiles; leaves outline their canopy). */
const OUTLINED: readonly boolean[] = TILE_DEFS.map((d, i) => !d.transparent || PATTERN[i] === 'leaves');
const SHAPED: readonly boolean[] = TILE_DEFS.map((d, i) => d.natural && ROUNDED.has(PATTERN[i] ?? 'noise'));
const SOIL: TileDef | undefined = TILE_DEFS[TILE_IDS.indexOf(RENDER.grass.soil)];
/** Body material per tile: grass shows its soil, so grass and soil merge without a seam. */
const MATERIAL: readonly number[] = TILE_DEFS.map((d, i) => (PATTERN[i] === 'grass' && SOIL ? SOIL.presentation.color : d.presentation.color));
/** Natural solid ground that draws seams against other materials. */
const SEAMED: readonly boolean[] = TILE_DEFS.map((d, i) => SHAPED[i] === true && d.solid && PATTERN[i] !== 'leaves');

function wallColor(color: number, f: number): number {
  return shade(saturate(color, RENDER.wallSaturation), f);
}
const WALL_COLOR: readonly number[] = WALL_DEFS.map((w) => wallColor(w.presentation.color, RENDER.wallShade));
const BACKDROP_SHALLOW = wallColor(WALL_DEFS[WALL_INDEX[RENDER.backdropWalls.shallow]]?.presentation.color ?? 0, RENDER.backdropShade);
const BACKDROP_DEEP = wallColor(WALL_DEFS[WALL_INDEX[RENDER.backdropWalls.deep]]?.presentation.color ?? 0, RENDER.backdropShade);

// Texel mask states of the current cell.
const IN = 0;
const OUT = 1;
const EDGE = 2;
const SEAM = 3;
const LIT = 4;
const mask = new Uint8Array(T * T);
/** First inside texel per column from the top / per row from the left and right (grass cap). */
const topIn = new Int8Array(T);
const leftIn = new Int8Array(T);
const rightIn = new Int8Array(T);

/** hash2 salts per edge side (top, bottom, left, right). */
const SIDE_TOP = 0;
const SIDE_BOTTOM = 1;
const SIDE_LEFT = 2;
const SIDE_RIGHT = 3;

interface Cell {
  def: TileDef;
  fg: number;
  pattern: TilePattern;
  wx: number;
  wy: number;
  /** Per-tile brightness factor. */
  vary: number;
  openT: boolean;
  openB: boolean;
  openL: boolean;
  openR: boolean;
  seed: number;
}

/** Texel alpha (0..1) set by the pattern for partly transparent texels (glass). */
let texAlpha = 1;
/** Outline colour requested by the pattern for the current texel (-1 = darkened texel colour). */
let texOutline = -1;

function n(seed: number, x: number, y: number): number {
  return hash2(seed, x, y);
}

/** 1 when the 2-texel edge segment at `along` of an open side is notched one texel deep. */
function notch(seed: number, side: number, along: number, across: number): number {
  return n(seed + 40 + side, along >> 1, across) < RENDER.edgeNotchShare ? 1 : 0;
}

/** Natural ground texture: base with irregular darker clumps (accent) and a few light grains. */
function noiseTexel(base: number, accent: number | undefined, seed: number, gx: number, gy: number, f: number, grain: number): number {
  if (accent === undefined) return shade(base, f);
  // Two offset 2×2 grids: their union makes irregular 2–3 texel clumps.
  const a = n(seed + 13, gx >> 1, gy >> 1);
  const b = n(seed + 14, (gx + 1) >> 1, (gy + 1) >> 1);
  if (a < RENDER.blotchShare || b < RENDER.blotchShare * 0.4) return shade(accent, grain * (0.95 + a * 0.3));
  if (n(seed + 15, gx, gy) < 0.04) return tint(shade(base, f), 0.14);
  return shade(base, f);
}

/** Stone: chunky fragments in three tones with dark cracks along some fragment borders. With
 *  `ore` (≥ 0) a share of the fragments are ore nuggets (lit top-left, shaded bottom-right). */
function rockTexel(base: number, dark: number, seed: number, gx: number, gy: number, f: number, ore = -1): number {
  const k = RENDER.rock;
  // Coarse coordinate warp so the fragment grid breaks up into irregular shards.
  const wy = gy + Math.floor(n(seed + 34, gx >> 1, gy >> 2) * 2);
  const cy = Math.floor(wy / k.cell);
  const off = (cy & 1) * (k.cell >> 1) + Math.floor(n(seed + 35, gx >> 2, wy >> 1) * 2);
  const cx = Math.floor((gx + off) / k.cell);
  const h = n(seed + 30, cx, cy);
  const col = h < k.darkShare ? dark : h > 1 - k.lightShare ? tint(base, k.light) : base;
  const lx = gx + off - cx * k.cell;
  const ly = wy - cy * k.cell;
  if (ore >= 0 && n(seed + 33, cx, cy) < k.oreShare) {
    if (lx === 0 || ly === 0) return shade(ore, f * k.crackShade * 0.8);
    return lx === 1 && ly === 1 ? tint(ore, 0.35) : shade(ore, f * (lx + ly > k.cell ? 0.8 : 1));
  }
  if ((lx === 0 || ly === 0) && n(seed + 31, cx, cy) < 0.55) return shade(col, f * k.crackShade);
  return shade(col, f);
}

/** Returns 0xRRGGBB or -1 (transparent: the wall/backdrop shows). */
function texel(c: Cell, tx: number, ty: number): number {
  const { def } = c;
  const base = def.presentation.color;
  const accent = def.presentation.accent;
  const gx = c.wx * T + tx;
  const gy = c.wy * T + ty;
  const grain = 1 + (n(c.seed, gx, gy) * 2 - 1) * RENDER.texelNoise;
  const f = c.vary * grain;
  texAlpha = 1;
  texOutline = -1;
  switch (c.pattern) {
    case 'grass': {
      const g = RENDER.grass;
      const soilBase = SOIL?.presentation.color ?? base;
      const soil = (): number => noiseTexel(soilBase, SOIL?.presentation.accent, c.seed, gx, gy, f, grain);
      if (!c.openT) return soil();
      const cap = g.capMin + Math.floor(n(c.seed + 21, gx, c.wy) * (g.capMax - g.capMin + 1));
      const d = ty - (topIn[tx] ?? 0);
      let green = d <= cap || (d === cap + 1 && n(c.seed + 23, gx, c.wy) < 0.3);
      if (!green) {
        const side = cap + Math.floor(n(c.seed + 22, c.wx, c.wy) * (g.sideExtra + 1));
        if (c.openL && tx - (leftIn[ty] ?? 0) <= 1 && ty <= side) green = true;
        if (c.openR && (rightIn[ty] ?? T - 1) - tx <= 1 && ty <= side) green = true;
      }
      if (!green) return soil();
      texOutline = accent ?? shade(base, RENDER.outlineShade);
      if (d <= 2) return tint(shade(base, grain), g.topLight);
      return shade(base, f * (n(c.seed + 24, gx, gy) < 0.18 ? 0.82 : 1));
    }
    case 'bricks': {
      const mortar = accent ?? shade(base, 0.62);
      const half = T / 2;
      const row = Math.floor(gy / half);
      if (ty % half === half - 1) return shade(mortar, grain);
      const off = row % 2 === 0 ? 0 : half;
      if ((tx + off) % T === T - 1) return shade(mortar, grain);
      const brick = n(c.seed + 2, Math.floor((gx + off) / T), row);
      return shade(base, f * (0.92 + brick * 0.16));
    }
    case 'planks': {
      const seam = accent ?? shade(base, 0.65);
      const half = T / 2;
      if (ty % half === half - 1) return shade(seam, grain);
      const board = Math.floor(gy / half);
      const joint = Math.floor(n(c.seed + 3, c.wx, board) * T);
      if (tx === joint && n(c.seed + 4, c.wx, board) < 0.5) return shade(seam, grain);
      const streak = n(c.seed + 5, gx >> 1, gy) < 0.25 ? 0.93 : 1;
      return shade(base, f * streak * (ty % half === 0 ? 1.08 : 1));
    }
    case 'specks': {
      const speck = accent ?? tint(base, 0.45);
      if (def.natural) return rockTexel(base, shade(base, 0.76), c.seed, gx, gy, f, speck);
      const block = n(c.seed + 6, gx >> 1, gy >> 1);
      if (block < 0.22) return (gx & 1) === 0 && (gy & 1) === 0 ? tint(speck, 0.3) : shade(speck, grain * (0.9 + block));
      return noiseTexel(base, shade(base, 0.8), c.seed, gx, gy, f, grain);
    }
    case 'rock':
      return rockTexel(base, accent ?? shade(base, 0.76), c.seed, gx, gy, f);
    case 'gravel': {
      const pebble = n(c.seed + 7, gx >> 1, gy >> 1);
      const col = pebble < 0.33 ? (accent ?? shade(base, 0.75)) : base;
      return (gx & 1) === 0 && (gy & 1) === 0 ? tint(shade(col, f), 0.12) : shade(col, f * (0.88 + pebble * 0.24));
    }
    case 'log': {
      const dark = accent ?? shade(base, 0.65);
      const off = Math.floor(n(c.seed + 8, c.wx, 0) * 3);
      const knot = n(c.seed + 10, c.wx, c.wy) < 0.1 && Math.abs(tx - T / 2) <= 1 && Math.abs(ty - T / 2) <= 1;
      if (knot) return tx === T / 2 && ty === T / 2 ? shade(dark, 0.8) : dark;
      if ((tx + off) % 3 === 0 && n(c.seed + 9, gx, gy >> 2) > 0.2) return shade(dark, grain);
      return shade(base, f * ((tx + off) % 3 === 1 ? 1.1 : 1));
    }
    case 'leaves': {
      // Overlapping leaf clumps: lit upper-left texels, shaded lower edge; shadow under the crown.
      const CW = 4;
      const CH = 3;
      const cy = Math.floor(gy / CH);
      const off = (cy & 1) * 2;
      const cx = Math.floor((gx + off) / CW);
      const lx = gx + off - cx * CW;
      const ly = gy - cy * CH;
      const h = n(c.seed + 11, cx, cy);
      texOutline = accent ?? shade(base, RENDER.outlineShade);
      const light = (c.openT && ty < 3 ? 1.08 : 1) * (c.openB && ty > T - 4 ? 0.82 : 1);
      if (ly === 0 && lx > 0 && lx < CW - 1 && h > 0.35) return tint(shade(base, grain * light), 0.22);
      if (ly === CH - 1 && lx === CW - 1 && h < 0.3) return shade(base, grain * light * 0.72);
      return shade(base, f * light * (0.92 + h * 0.14));
    }
    case 'glass': {
      const frame = (ty === 0 && c.openT) || (ty === T - 1 && c.openB) || (tx === 0 && c.openL) || (tx === T - 1 && c.openR);
      if (frame) return shade(accent ?? shade(base, 0.7), 1);
      const shine = (tx + ty) % T === 2 || (tx + ty) % T === 3;
      texAlpha = shine ? 0.55 : 0.25;
      return shine ? tint(base, 0.6) : base;
    }
    case 'box': {
      const frame = tx === 0 || ty === 0 || tx === T - 1 || ty === T - 1;
      const trim = accent ?? shade(base, 0.6);
      if (frame) return shade(trim, grain * (tx === 0 || ty === 0 ? 1 : 0.7));
      if (ty === Math.floor(T / 2) - 1) return shade(trim, grain * 1.1);
      if (ty === Math.floor(T / 2) && (tx === Math.floor(T / 2) - 1 || tx === Math.floor(T / 2))) return tint(trim, 0.5);
      return shade(base, f * (ty === 1 ? 1.12 : 1));
    }
    case 'door': {
      if (!def.solid) return tx < 2 ? shade(base, f * (tx === 0 ? 0.8 : 1)) : -1;
      const trim = accent ?? shade(base, 0.65);
      if (tx === 0 || tx === T - 1) return shade(trim, grain);
      if (tx === T - 2 && c.wy % 3 === 1 && ty === Math.floor(T / 2)) return tint(trim, 0.6);
      return shade(base, f * (tx % 3 === 0 ? 0.92 : 1));
    }
    case 'torch': {
      const mid = Math.floor(T / 2);
      const stick = accent ?? shade(base, 0.45);
      if (tx >= mid - 1 && tx <= mid && ty >= mid - 1) return shade(stick, grain);
      if (tx >= mid - 1 && tx <= mid && ty >= 1 && ty < mid - 1) return tint(base, ty === 1 ? 0.5 : 0.15);
      return -1;
    }
    case 'stalks': {
      if (def.solid) {
        const straw = n(c.seed + 11, gx, gy >> 1) < 0.3 ? (accent ?? shade(base, 0.8)) : base;
        return shade(straw, f);
      }
      const col = (tx + Math.floor(n(c.seed + 12, c.wx, 0) * 3)) % 3 === 0;
      if (!col) return -1;
      if (ty < 2) return shade(accent ?? tint(base, 0.2), grain);
      return shade(base, f);
    }
    case 'fence': {
      const post = tx === 1 || tx === 2 || tx === T - 3 || tx === T - 2;
      const rail = ty === 2 || ty === T - 3;
      if (post || rail) return shade(base, f * (post ? 1 : 0.88));
      return -1;
    }
    case 'metal': {
      const rivet = (tx === 1 || tx === T - 2) && (ty === 1 || ty === T - 2);
      if (rivet) return tint(accent ?? base, 0.35);
      return shade(base, grain * (1.06 - (ty / T) * 0.12));
    }
    case 'stripes': {
      if (accent !== undefined && c.openT && ty === 1 && ((c.wx % 6) * T + tx) % (T * 6) < T * 3) return accent;
      return shade(base, f);
    }
    case 'noise':
      return noiseTexel(base, accent, c.seed, gx, gy, f, grain);
  }
}

function openAt(world: WorldGrid, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= world.width || y >= world.height) return false;
  return OPEN[world.fg[y * world.width + x] ?? AIR_INDEX] ?? true;
}

function tileAt(world: WorldGrid, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= world.width || y >= world.height) return -1;
  return world.fg[y * world.width + x] ?? AIR_INDEX;
}

/** Seam toward a solid neighbour of another natural material; the softer tile draws it. */
function seamTo(world: WorldGrid, fg: number, x: number, y: number): boolean {
  const o = tileAt(world, x, y);
  if (o < 0 || o === fg || !SEAMED[o] || MATERIAL[o] === MATERIAL[fg]) return false;
  const mine = TILE_DEFS[fg]?.hardness ?? 0;
  const theirs = TILE_DEFS[o]?.hardness ?? 0;
  return mine < theirs || (mine === theirs && fg < o);
}

/** Whether texel (tx, ty) — possibly one texel outside the cell — is cut away (open). */
function isOut(c: Cell, shaped: boolean, tx: number, ty: number): boolean {
  if (tx < 0) return c.openL;
  if (tx >= T) return c.openR;
  if (ty < 0) return c.openT;
  if (ty >= T) return c.openB;
  if (!shaped) return false;
  const gx = c.wx * T + tx;
  const gy = c.wy * T + ty;
  if (c.openT && ty < notch(c.seed, SIDE_TOP, gx, c.wy)) return true;
  if (c.openB && T - 1 - ty < notch(c.seed, SIDE_BOTTOM, gx, c.wy)) return true;
  if (c.openL && tx < notch(c.seed, SIDE_LEFT, gy, c.wx)) return true;
  if (c.openR && T - 1 - tx < notch(c.seed, SIDE_RIGHT, gy, c.wx)) return true;
  const cx = tx < R ? R - tx - 0.5 : tx >= T - R ? tx - (T - R) + 0.5 : 0;
  const cy = ty < R ? R - ty - 0.5 : ty >= T - R ? ty - (T - R) + 0.5 : 0;
  if (cx === 0 || cy === 0 || cx * cx + cy * cy <= R * R) return false;
  const vOpen = ty < R ? c.openT : c.openB;
  const hOpen = tx < R ? c.openL : c.openR;
  return vOpen && hOpen;
}

/** Fills `mask` (+ topIn/leftIn/rightIn) for an outlined cell; false when nothing is special. */
function buildMask(world: WorldGrid, c: Cell): boolean {
  const { fg, wx, wy } = c;
  const shaped = SHAPED[fg] === true;
  const seamed = SEAMED[fg] === true;
  const sT = seamed && !c.openT && seamTo(world, fg, wx, wy - 1);
  const sB = seamed && !c.openB && seamTo(world, fg, wx, wy + 1);
  const sL = seamed && !c.openL && seamTo(world, fg, wx - 1, wy);
  const sR = seamed && !c.openR && seamTo(world, fg, wx + 1, wy);
  // Inner corners: only the diagonal neighbour is open → one outline texel in that corner.
  const dTL = !c.openT && !c.openL && openAt(world, wx - 1, wy - 1);
  const dTR = !c.openT && !c.openR && openAt(world, wx + 1, wy - 1);
  const dBL = !c.openB && !c.openL && openAt(world, wx - 1, wy + 1);
  const dBR = !c.openB && !c.openR && openAt(world, wx + 1, wy + 1);
  if (!c.openT && !c.openB && !c.openL && !c.openR && !sT && !sB && !sL && !sR && !dTL && !dTR && !dBL && !dBR) return false;
  for (let ty = 0; ty < T; ty++) {
    for (let tx = 0; tx < T; tx++) {
      let m = IN;
      if (isOut(c, shaped, tx, ty)) m = OUT;
      else if (isOut(c, shaped, tx - 1, ty) || isOut(c, shaped, tx + 1, ty) || isOut(c, shaped, tx, ty - 1) || isOut(c, shaped, tx, ty + 1)) m = EDGE;
      else if ((dTL && tx === 0 && ty === 0) || (dTR && tx === T - 1 && ty === 0) || (dBL && tx === 0 && ty === T - 1) || (dBR && tx === T - 1 && ty === T - 1)) m = EDGE;
      else if ((sT && ty === 0) || (sB && ty === T - 1) || (sL && tx === 0) || (sR && tx === T - 1)) m = SEAM;
      else if (ty > 0 && mask[(ty - 1) * T + tx] === EDGE && c.openT) m = LIT;
      mask[ty * T + tx] = m;
    }
  }
  for (let i = 0; i < T; i++) {
    let t = 0;
    while (t < T - 1 && mask[t * T + i] === OUT) t++;
    topIn[i] = t;
    let l = 0;
    while (l < T - 1 && mask[i * T + l] === OUT) l++;
    leftIn[i] = l;
    let r = T - 1;
    while (r > 0 && mask[i * T + r] === OUT) r--;
    rightIn[i] = r;
  }
  return true;
}

/** Per-cell wall edges: a wall bordering an open cell without wall gets a darker rim there. */
interface WallCell {
  color: number;
  rimT: boolean;
  rimB: boolean;
  rimL: boolean;
  rimR: boolean;
}

function wallRim(world: WorldGrid, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= world.width || y >= world.height) return false;
  const i = y * world.width + x;
  return (world.wall[i] ?? NO_WALL) === NO_WALL && (OPEN[world.fg[i] ?? AIR_INDEX] ?? true);
}

function wallCell(world: WorldGrid, wx: number, wy: number): WallCell | null {
  const wall = world.wall[wy * world.width + wx] ?? NO_WALL;
  if (wall === NO_WALL) return null;
  return {
    color: WALL_COLOR[wall] ?? 0,
    rimT: wallRim(world, wx, wy - 1),
    rimB: wallRim(world, wx, wy + 1),
    rimL: wallRim(world, wx - 1, wy),
    rimR: wallRim(world, wx + 1, wy),
  };
}

/** Background texel: wall (darker, duller) or the underground backdrop, else -1 (sky shows). */
function background(world: WorldGrid, wall: WallCell | null, wx: number, wy: number, tx: number, ty: number, seed: number): number {
  const gx = wx * T + tx;
  const gy = wy * T + ty;
  const grain = 1 + (n(seed + 20, gx, gy) * 2 - 1) * RENDER.texelNoise * 1.5;
  const lump = n(seed + 25, gx >> 1, gy >> 1) < 0.22 ? 0.86 : 1;
  if (wall) {
    const rim = (wall.rimT && ty === 0) || (wall.rimB && ty === T - 1) || (wall.rimL && tx === 0) || (wall.rimR && tx === T - 1);
    const seam = ty === 0 || (tx === 0 && (wy & 1) === 0) ? 0.9 : 1;
    return shade(wall.color, grain * lump * seam * (rim ? RENDER.outlineShade * 1.6 : 1));
  }
  const depth = wy - (world.surfaceY[wx] ?? 0);
  if (depth < RENDER.backdropStartDepth) return -1;
  return shade(depth >= WORLD.cavesDepth ? BACKDROP_DEEP : BACKDROP_SHALLOW, grain * lump);
}

/** Grass blades growing from the grass tile below into air cell (wx, wy): colour or -1. */
function blade(world: WorldGrid, wx: number, wy: number, tx: number, ty: number, seed: number, below: TileDef): number {
  const g = RENDER.grass;
  const gx = wx * T + tx;
  const gyBelow = wy + 1;
  if (n(seed + 50, gx, gyBelow) >= g.bladeShare) return -1;
  const height = 1 + Math.floor(n(seed + 51, gx, gyBelow) * g.bladeMax);
  if (ty < T - height) return -1;
  // No blades over notches or rounded corners of the grass top.
  if (notch(seed, SIDE_TOP, gx, gyBelow) > 0) return -1;
  if ((tx < R && openAt(world, wx - 1, gyBelow)) || (tx >= T - R && openAt(world, wx + 1, gyBelow))) return -1;
  const col = below.presentation.color;
  return ty === T - height ? tint(col, g.topLight) : shade(col, 0.9 + n(seed + 52, gx, ty) * 0.2);
}

/** Paints cell (wx, wy) into `buf` (ABGR, row stride `stride` texels) at texel (ox, oy). */
export function paintCell(world: WorldGrid, wx: number, wy: number, buf: Uint32Array, stride: number, ox: number, oy: number, seed: number): void {
  const fg = world.fg[wy * world.width + wx] ?? AIR_INDEX;
  const def = TILE_DEFS[fg];
  const pattern = PATTERN[fg] ?? 'noise';
  const isAir = fg === AIR_INDEX || !def;
  const wall = wallCell(world, wx, wy);
  let cell: Cell | null = null;
  let masked = false;
  if (!isAir) {
    // Glass/leaves borders: "open" means a different tile, so panes and canopies merge.
    const glassLike = pattern === 'glass' || pattern === 'leaves';
    const edge = (x: number, y: number): boolean => (glassLike ? tileAt(world, x, y) !== fg && tileAt(world, x, y) >= 0 : openAt(world, x, y));
    cell = {
      def,
      fg,
      pattern,
      wx,
      wy,
      vary: 1 + (n(seed, wx, wy) * 2 - 1) * RENDER.tileVariation,
      openT: edge(wx, wy - 1),
      openB: edge(wx, wy + 1),
      openL: edge(wx - 1, wy),
      openR: edge(wx + 1, wy),
      seed,
    };
    masked = OUTLINED[fg] === true && buildMask(world, cell);
  }
  const belowFg = isAir ? tileAt(world, wx, wy + 1) : -1;
  const grassBelow = belowFg >= 0 && PATTERN[belowFg] === 'grass' ? TILE_DEFS[belowFg] : undefined;
  for (let ty = 0; ty < T; ty++) {
    for (let tx = 0; tx < T; tx++) {
      let col = -1;
      let alpha = 1;
      if (cell) {
        const m = masked ? (mask[ty * T + tx] ?? IN) : IN;
        if (m !== OUT) {
          col = texel(cell, tx, ty);
          alpha = texAlpha;
          if (col >= 0) {
            if (m === EDGE) col = texOutline >= 0 ? texOutline : shade(col, RENDER.outlineShade);
            else if (m === SEAM) col = shade(col, RENDER.seamShade);
            else if (m === LIT) col = tint(col, RENDER.edgeHighlight);
          }
        }
      } else if (grassBelow) col = blade(world, wx, wy, tx, ty, seed, grassBelow);
      let out: number;
      if (col >= 0 && alpha >= 1) out = abgr(col);
      else {
        const bg = background(world, wall, wx, wy, tx, ty, seed);
        if (col >= 0) out = bg >= 0 ? abgr(mix(bg, col, alpha)) : abgr(col, Math.round(alpha * 255));
        else out = bg >= 0 ? abgr(bg) : 0;
      }
      buf[(oy + ty) * stride + ox + tx] = out;
    }
  }
}
