// OWNER: agent "worldgen" (A). Structures per BiomeDef.structures (StructureKind).
// Blueprints are ASCII (top row first; see LEGEND); apartment/store/field are built procedurally
// into the same format. Surface structures level their footprint (clear above, foundation below)
// so they sit flat; cave rooms are stamped into solid rock and get short access tunnels.
// Doors are 3 cells tall (PLAYER.height 2.8); interiors are ≥ 4 rows; stairs use 1-tile steps
// (PHYSICS.stepHeight) with 3 rows of headroom.
import { WORLD } from '../../config/sim.ts';
import { BIOMES } from '../../data/biomes.ts';
import { TILE_DEFS } from '../../data/content.ts';
import { BIOME_IDS, type BiomeId, type StructureKind, type TileId, type WallId } from '../../data/schema.ts';
import { biomeAt } from '../biome.ts';
import { chance, rand, randInt, type RngState } from '../rng.ts';
import {
  expectedCount,
  isFree,
  lastOpenRow,
  reserve,
  solidAt,
  tileIdx,
  wallIdx,
  type GenContext,
  type Rect,
  type Zone,
} from './context.ts';

export interface Blueprint {
  /** Top row first. All rows are padded to the longest one with ' '. */
  rows: readonly string[];
  /** Row index that sits on the terrain surface row (surface structures). */
  ground: number;
  /** Background wall behind every stamped cell ('none' for open-air structures). */
  wall: WallId;
}

/**
 * ' ' leave the cell as it is (cleared air above ground, earth below) · '.' air with interior wall
 * · '_' air without wall · 'T' torch (TORCH_CHANCE, else '.') · everything else: LEGEND tile.
 */
export const LEGEND: Readonly<Record<string, TileId>> = {
  '.': 'air',
  _: 'air',
  P: 'planks',
  B: 'brick',
  C: 'concrete',
  M: 'metal',
  G: 'glass',
  D: 'door',
  H: 'hay',
  F: 'fence',
  w: 'wheat',
  W: 'workbench',
  U: 'furnace',
  T: 'torch',
  c: 'chest',
  k: 'crate',
  f: 'fridge',
  b: 'cabinet',
  l: 'locker',
  L: 'log',
  d: 'dirt',
};

// NEW — worldgen-only structure tuning.
const TORCH_CHANCE = 0.6;
/** Columns levelled on each side of a footprint (smooth ramp to the terrain). */
const LEVEL_MARGIN = 2;
/** Extra free columns required between two structures. */
const STRUCTURE_GAP = 3;
/** Max surface height difference across a footprint. */
const MAX_SITE_SLOPE = 6;
/** Max rows of foundation filled under a footprint (over cave mouths / dips). */
const MAX_FOUNDATION = 30;
const SITE_ATTEMPTS = 40;
/** Cave rooms: min solid share of the footprint, free distance to other rooms, tunnel length. */
const ROOM_MIN_SOLID = 0.45;
const ROOM_SPACING = 6;
const ROOM_TUNNEL = 30;

// ── Fixed blueprints ─────────────────────────────────────────────────────────

const CABIN: Blueprint = {
  wall: 'wood_wall',
  ground: 8,
  rows: [
    '   PPPPPPP   ',
    '  PPPPPPPPP  ',
    ' PPPPPPPPPPP ',
    '  P.......P  ',
    '  P...T...P  ',
    '  D.......P  ',
    '  D.......P  ',
    '  Db....cWP  ',
    'PPPPPPPPPPPPP',
  ],
};

const FARMHOUSE: Blueprint = {
  wall: 'wood_wall',
  ground: 8,
  rows: [
    '    PPPPPPPPPPP    ',
    '   PPPPPPPPPPPPP   ',
    '  PPPPPPPPPPPPPPP  ',
    '   P...........P   ',
    '   P..T.....T..P   ',
    '   D...........D   ',
    '   D...........D   ',
    '   Df.b..U..b..D   ',
    'PPPPPPPPPPPPPPPPPPP',
  ],
};

const BARN: Blueprint = {
  wall: 'wood_wall',
  ground: 9,
  rows: [
    '      PPPPPPPPP      ',
    '    PPPPPPPPPPPPP    ',
    '  PPPPPPPPPPPPPPPPP  ',
    '  P...............P  ',
    '  P.......T.......P  ',
    '  P...............P  ',
    '  D...............D  ',
    '  D..H............D  ',
    '  D.HHH..k..c...k.D  ',
    'PPPPPPPPPPPPPPPPPPPPP',
  ],
};

const HOUSE: Blueprint = {
  wall: 'brick_wall',
  ground: 9,
  rows: [
    '    PPPPPPP    ',
    '   PPPPPPPPP   ',
    '  PPPPPPPPPPP  ',
    '  BBBBBBBBBBB  ',
    '  G....T....G  ',
    '  G.........G  ',
    '  D.........D  ',
    '  D.........D  ',
    '  Db.f...b..D  ',
    'BBBBBBBBBBBBBBB',
  ],
};

const SHOP: Blueprint = {
  wall: 'brick_wall',
  ground: 7,
  rows: [
    'BBBBBBBBBBBBBBBBB',
    'B...............B',
    'G..T.........T..G',
    'G...............G',
    'D...............D',
    'D...............D',
    'D.kk.c.MMM.c.kk.D',
    'BBBBBBBBBBBBBBBBB',
  ],
};

// Entrance hut above ground, stairs (4 steps) down into a concrete/metal room below the surface.
const BUNKER: Blueprint = {
  wall: 'concrete_wall',
  ground: 5,
  rows: [
    'CCCCCCCCCC         ',
    'C........C         ',
    'D........C         ',
    'D........C         ',
    'D...T....C         ',
    'CCCCC....CCCCCCCCCC',
    '    MC............M',
    '    MCC...........M',
    '    MCCC.....T....M',
    '    MCCCC.k.c.l.lkM',
    '    MMMMMMMMMMMMMMM',
  ],
};

// Open platform on log posts, reached by an outside staircase.
const WATCHTOWER: Blueprint = {
  wall: 'none',
  ground: 9,
  rows: [
    '    PPPPPPPPP',
    '     L     L ',
    '     L  T  L ',
    '     L  k  LF',
    '    PPPPPPPPP',
    '   PL     L  ',
    '  PPL     L  ',
    ' PPPL     L  ',
    'PPPPL     L  ',
    '             ',
  ],
};

const CAVE_ROOM: Blueprint = {
  wall: 'wood_wall',
  ground: 5,
  rows: [
    'PPPPPPPPPPP',
    'P.........P',
    'D...T.....D',
    'D.........D',
    'D.c.k...W.D',
    'PPPPPPPPPPP',
  ],
};

// ── Procedural blueprints ────────────────────────────────────────────────────

/** Mutable char grid → Blueprint. */
function grid(w: number, h: number, fill: string): string[][] {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => fill));
}

function setChar(g: string[][], r: number, c: number, ch: string): void {
  const row = g[r];
  if (row && c >= 0 && c < row.length) row[c] = ch;
}

const STOREY = 5; // floor row + 4 interior rows
const APARTMENT_WIDTH = 20;

/** Multi-storey block: alternating staircases, holes in the floor above each staircase. */
function apartment(rng: RngState): Blueprint {
  const storeys = randInt(rng, 2, 4);
  const W = APARTMENT_WIDTH;
  const H = storeys * STOREY + 1;
  const g = grid(W, H, '.');
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      if ((H - 1 - r) % STOREY === 0 || c === 0 || c === W - 1) setChar(g, r, c, 'C');
    }
  }
  for (let i = 0; i < storeys; i++) {
    const fr = H - 1 - STOREY * i;
    if (i === 0) {
      for (let r = fr - 3; r <= fr - 1; r++) {
        setChar(g, r, 0, 'D');
        setChar(g, r, W - 1, 'D');
      }
    } else {
      for (const r of [fr - 3, fr - 2]) {
        setChar(g, r, 0, 'G');
        setChar(g, r, W - 1, 'G');
      }
    }
    const left = i % 2 === 0;
    if (i < storeys - 1) {
      // Step j (1..4) is j cells tall; the floor above is open over steps 2..4.
      for (let j = 1; j <= 4; j++) {
        const c = left ? 2 + j : W - 1 - (2 + j);
        for (let r = fr - j; r <= fr - 1; r++) setChar(g, r, c, 'C');
        if (j >= 2) setChar(g, fr - STOREY, c, '.');
      }
    }
    // Furniture away from this storey's stairs and the floor hole of the stairs below.
    const base = left ? 9 : 8;
    setChar(g, fr - 1, base, 'f');
    setChar(g, fr - 1, base + 2, 'b');
    setChar(g, fr - 3, left ? W - 2 : 1, 'T');
  }
  return { wall: 'concrete_wall', ground: H - 1, rows: g.map((row) => row.join('')) };
}

const STORE_GOODS = ['l', 'k', 'c', 'k', 'l'];

function store(rng: RngState): Blueprint {
  const W = randInt(rng, 22, 28);
  const g = grid(W, 7, '.');
  const mid = W >> 1;
  for (let c = 0; c < W; c++) {
    setChar(g, 0, c, 'C');
    setChar(g, 6, c, 'C');
  }
  for (const c of [0, W - 1]) {
    setChar(g, 1, c, 'C');
    setChar(g, 2, c, 'G');
    for (let r = 3; r <= 5; r++) setChar(g, r, c, 'D');
  }
  let k = 0;
  for (let c = 2; c < W - 2; c += 3) {
    if (Math.abs(c - mid) <= 1) continue;
    setChar(g, 5, c, STORE_GOODS[k++ % STORE_GOODS.length] ?? 'k');
  }
  for (let c = mid - 1; c <= mid + 1; c++) setChar(g, 5, c, 'M');
  for (let c = 3; c < W - 3; c += 6) setChar(g, 2, c, 'T');
  return { wall: 'concrete_wall', ground: 6, rows: g.map((row) => row.join('')) };
}

function field(rng: RngState): Blueprint {
  const w = randInt(rng, 10, 18);
  return { wall: 'none', ground: 1, rows: ['F' + 'w'.repeat(w - 2) + 'F', 'd'.repeat(w)] };
}

const BUILDERS: Record<StructureKind, (rng: RngState) => Blueprint> = {
  farmhouse: () => FARMHOUSE,
  barn: () => BARN,
  field,
  cabin: () => CABIN,
  house: () => HOUSE,
  shop: () => SHOP,
  apartment,
  store,
  bunker: () => BUNKER,
  watchtower: () => WATCHTOWER,
  cave_room: () => CAVE_ROOM,
};

export function buildBlueprint(kind: StructureKind, rng: RngState): Blueprint {
  return BUILDERS[kind](rng);
}

export function blueprintWidth(bp: Blueprint): number {
  return Math.max(...bp.rows.map((r) => r.length));
}

// ── Stamping ─────────────────────────────────────────────────────────────────

/** Writes the blueprint with its top-left at (x0, y0); records container tiles. */
function stamp(ctx: GenContext, bp: Blueprint, x0: number, y0: number, mirror: boolean): void {
  const { world, rng } = ctx;
  const w = blueprintWidth(bp);
  const wall = wallIdx(bp.wall);
  for (let r = 0; r < bp.rows.length; r++) {
    const row = bp.rows[r] ?? '';
    for (let c = 0; c < w; c++) {
      let ch = row[mirror ? w - 1 - c : c] ?? ' ';
      if (ch === ' ') continue;
      const x = x0 + c;
      const y = y0 + r;
      if (x < 0 || y < 0 || x >= world.width || y >= world.height) continue;
      if (ch === 'T' && !chance(rng, TORCH_CHANCE)) ch = '.';
      const id = LEGEND[ch];
      if (!id) throw new Error(`worldgen: unknown blueprint char '${ch}'`);
      const i = y * world.width + x;
      world.fg[i] = tileIdx(id);
      world.liquid[i] = 0;
      world.wall[i] = ch === '_' ? 0 : wall;
      if (TILE_DEFS[world.fg[i] ?? 0]?.containerSlots) ctx.containerCells.push(i);
    }
  }
}

/** Flattens [x0 - margin, x0 + w + margin) to surface row g and builds the foundation. */
function level(ctx: GenContext, bp: Blueprint, x0: number, w: number, g: number, biome: BiomeId): void {
  const { world } = ctx;
  const top = tileIdx(BIOMES[biome].topTile);
  const fill = tileIdx(BIOMES[biome].fillTile);
  const AIR = tileIdx('air');
  const DIRT_WALL = wallIdx('dirt_wall');
  const below = bp.rows.length - 1 - bp.ground;
  for (let x = x0 - LEVEL_MARGIN; x < x0 + w + LEVEL_MARGIN; x++) {
    const inside = x >= x0 && x < x0 + w;
    const s = world.surfaceY[x] ?? g;
    const clearFrom = inside ? Math.min(s, g - bp.ground - 1) : Math.min(s, g);
    for (let y = Math.max(0, clearFrom); y < g; y++) {
      const i = y * world.width + x;
      world.fg[i] = AIR;
      world.wall[i] = 0;
      world.liquid[i] = 0;
    }
    world.fg[g * world.width + x] = top;
    world.wall[g * world.width + x] = 0;
    const deepest = g + (inside ? below : 0) + MAX_FOUNDATION;
    for (let y = g + 1; y <= Math.min(deepest, lastOpenRow(world)); y++) {
      const i = y * world.width + x;
      const mustFill = inside && y <= g + below;
      if (!mustFill && solidAt(world, x, y)) break;
      if (!solidAt(world, x, y)) world.fg[i] = fill;
      world.liquid[i] = 0;
      if (world.wall[i] === 0) world.wall[i] = DIRT_WALL;
    }
    world.surfaceY[x] = g;
  }
}

interface Site {
  x0: number;
  g: number;
}

function findSurfaceSite(ctx: GenContext, z: Zone, w: number): Site | null {
  const { world, rng } = ctx;
  const pad = LEVEL_MARGIN + STRUCTURE_GAP;
  const lo = Math.max(z.x0, WORLD.edgeMargin) + LEVEL_MARGIN;
  const hi = Math.min(z.x1, world.width - WORLD.edgeMargin) - w - LEVEL_MARGIN;
  if (hi < lo) return null;
  for (let attempt = 0; attempt < SITE_ATTEMPTS; attempt++) {
    const x0 = randInt(rng, lo, hi);
    if (!isFree(ctx, x0 - pad, x0 + w + pad)) continue;
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    for (let x = x0; x < x0 + w; x++) {
      const s = world.surfaceY[x] ?? 0;
      min = Math.min(min, s);
      max = Math.max(max, s);
      sum += s;
    }
    if (max - min > MAX_SITE_SLOPE) continue;
    return { x0, g: Math.round(sum / w) };
  }
  return null;
}

function placeSurface(ctx: GenContext, z: Zone, kind: StructureKind): boolean {
  const bp = buildBlueprint(kind, ctx.rng);
  const w = blueprintWidth(bp);
  const site = findSurfaceSite(ctx, z, w);
  if (!site) return false;
  level(ctx, bp, site.x0, w, site.g, z.biome);
  stamp(ctx, bp, site.x0, site.g - bp.ground, chance(ctx.rng, 0.5));
  reserve(ctx, site.x0 - LEVEL_MARGIN, site.x0 + w + LEVEL_MARGIN);
  return true;
}

function overlapsRoom(ctx: GenContext, r: Rect): boolean {
  const m = ROOM_SPACING;
  return ctx.rooms.some((o) => r.x < o.x + o.w + m && o.x < r.x + r.w + m && r.y < o.y + o.h + m && o.y < r.y + r.h + m);
}

/** Carves 3-row tunnels out of both doors until they meet open cave (or give up); stops before
 *  touching water so settled pools stay settled. */
function tunnels(ctx: GenContext, bp: Blueprint, rect: Rect): void {
  const { world } = ctx;
  const AIR = tileIdx('air');
  const doorRows: number[] = [];
  bp.rows.forEach((row, r) => {
    if (row[0] === 'D') doorRows.push(rect.y + r);
  });
  for (const dir of [-1, 1]) {
    let x = dir < 0 ? rect.x - 1 : rect.x + rect.w;
    for (let n = 0; n < ROOM_TUNNEL; n++, x += dir) {
      if (x <= 0 || x >= world.width - 1) break;
      if (doorRows.every((y) => !solidAt(world, x, y)) || wetNear(world, x, doorRows)) break;
      for (const y of doorRows) world.fg[y * world.width + x] = AIR;
    }
  }
}

function wetNear(world: GenContext['world'], x: number, rows: readonly number[]): boolean {
  const top = Math.min(...rows) - 1;
  const bottom = Math.max(...rows);
  for (let y = top; y <= bottom; y++) {
    for (let xx = x - 1; xx <= x + 1; xx++) if ((world.liquid[y * world.width + xx] ?? 0) > 0) return true;
  }
  return false;
}

/** Stamps a structure into solid rock of a depth layer ('caves' / 'deep'). */
function placeUnderground(ctx: GenContext, layer: BiomeId, kind: StructureKind): boolean {
  const { world, rng } = ctx;
  const bp = buildBlueprint(kind, rng);
  const w = blueprintWidth(bp);
  const h = bp.rows.length;
  for (let attempt = 0; attempt < SITE_ATTEMPTS; attempt++) {
    const x = randInt(rng, WORLD.edgeMargin, world.width - WORLD.edgeMargin - w);
    const s = world.surfaceY[x] ?? WORLD.surfaceBase;
    const y = randInt(rng, s + WORLD.cavesDepth, lastOpenRow(world) - h - 1);
    if (biomeAt(world, x, y - 2) !== layer || biomeAt(world, x + w, y + h) !== layer) continue;
    const rect = { x, y, w, h };
    if (overlapsRoom(ctx, rect)) continue;
    let solid = 0;
    let wet = false;
    for (let yy = y - 2; yy < y + h + 2; yy++) {
      for (let xx = x - 2; xx < x + w + 2; xx++) {
        if ((world.liquid[yy * world.width + xx] ?? 0) > 0) wet = true;
        if (xx >= x && xx < x + w && yy >= y && yy < y + h && solidAt(world, xx, yy)) solid++;
      }
    }
    if (wet || solid < ROOM_MIN_SOLID * w * h) continue;
    stamp(ctx, bp, x, y, false);
    tunnels(ctx, bp, rect);
    ctx.rooms.push(rect);
    return true;
  }
  return false;
}

/** Kinds to build in one surface zone; at least one if the biome has any structures. */
function zonePlan(ctx: GenContext, z: Zone): StructureKind[] {
  const { rng } = ctx;
  const spawns = BIOMES[z.biome].structures;
  const width = z.x1 - z.x0;
  const plan: StructureKind[] = [];
  for (const sp of spawns) {
    const n = expectedCount(rand(rng), (width / 100) * sp.per100Columns);
    for (let k = 0; k < n; k++) plan.push(sp.kind);
  }
  const first = spawns[0];
  if (plan.length === 0 && first) plan.push(first.kind);
  // Interleave kinds deterministically so a full zone does not run out of space for one kind.
  for (let i = plan.length - 1; i > 0; i--) {
    const j = randInt(rng, 0, i);
    const a = plan[i] as StructureKind;
    plan[i] = plan[j] as StructureKind;
    plan[j] = a;
  }
  return plan;
}

export function placeStructures(ctx: GenContext): void {
  const { world, rng } = ctx;
  for (const z of ctx.zones) {
    const plan = zonePlan(ctx, z);
    let placed = 0;
    for (const kind of plan) if (placeSurface(ctx, z, kind)) placed++;
    // A zone that defines structures always gets at least one (retry the first kind).
    const first = BIOMES[z.biome].structures[0];
    if (placed === 0 && first) placeSurface(ctx, z, first.kind);
  }
  for (const layer of BIOME_IDS) {
    const b = BIOMES[layer];
    if (b.surface) continue;
    for (const sp of b.structures) {
      const n = expectedCount(rand(rng), (world.width / 100) * sp.per100Columns);
      for (let k = 0; k < n; k++) placeUnderground(ctx, layer, sp.kind);
    }
  }
}
