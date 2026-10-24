// OWNER: agent "worldgen" (A). Caves: noise tunnels ("spaghetti") + chambers ("cheese") that
// grow denser with depth, bigger caverns in the 'deep' layer, random-walk worms, a few cave mouths
// that break through the surface. Carving only replaces fg with air; walls stay (enclosed look).
import { WORLD } from '../../config/sim.ts';
import { BIOMES } from '../../data/biomes.ts';
import { noise2, rand, randInt, randRange } from '../rng.ts';
import { clamp, expectedCount, lastOpenRow, spawnCentreX, subSeed, tileIdx, type GenContext } from './context.ts';

// NEW — worldgen-only cave tuning.
/** No noise caves above this depth below the surface (keeps the topsoil intact). */
const MIN_CAVE_DEPTH = 8;
/** Noise tunnels start this deep (thin ridges nearer the surface look like cracks). */
const TUNNEL_MIN_DEPTH = 18;
/** Ridge half-width of noise tunnels at full density. */
const TUNNEL_WIDTH = 0.075;
/** Chamber threshold in the caves layer / in the deep layer (lower = more open). */
const CHAMBER_THRESHOLD = 0.68;
const DEEP_CHAMBER_THRESHOLD = 0.5;
const WORMS_PER_100_COLUMNS = 2.5;
const MOUTHS_PER_100_COLUMNS = 0.7;
/** Columns around the world centre (spawn) kept free of cave mouths. */
const MOUTH_SPAWN_CLEARANCE = 30;

const ROT_COS = Math.cos(0.6);
const ROT_SIN = Math.sin(0.6);

const SALT_TUNNEL_A = 21;
const SALT_TUNNEL_B = 22;
const SALT_CHAMBER = 23;
const SALT_DEEP = 24;

const AIR = tileIdx('air');
const BEDROCK = tileIdx('bedrock');

function carveDisc(ctx: GenContext, cx: number, cy: number, r: number): void {
  const { world } = ctx;
  const maxY = lastOpenRow(world);
  const r2 = r * r;
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(world.width - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(maxY, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > r2) continue;
      const i = y * world.width + x;
      if (world.fg[i] !== BEDROCK) world.fg[i] = AIR;
    }
  }
}

/** Random walk; `down` biases the heading towards +y (cave mouths). */
function worm(ctx: GenContext, x: number, y: number, steps: number, radius: number, down: boolean): void {
  const { rng, world } = ctx;
  let angle = down ? Math.PI / 2 + randRange(rng, -0.5, 0.5) : randRange(rng, 0, Math.PI * 2);
  let r = radius;
  for (let s = 0; s < steps; s++) {
    carveDisc(ctx, x, y, r);
    angle += randRange(rng, -0.35, 0.35);
    if (down) angle = clamp(angle, Math.PI / 2 - 0.9, Math.PI / 2 + 0.9);
    x += Math.cos(angle);
    // Flatten non-mouth worms so tunnels run mostly sideways (walkable).
    y += Math.sin(angle) * (down ? 1 : 0.55);
    r = clamp(r + randRange(rng, -0.15, 0.15), radius * 0.7, radius * 1.4);
    if (x < 2 || x > world.width - 3 || y > lastOpenRow(world) - 2) break;
  }
}

export function carveCaves(ctx: GenContext): void {
  const { world, seed, rng } = ctx;
  const W = world.width;
  const sA = subSeed(seed, SALT_TUNNEL_A);
  const sB = subSeed(seed, SALT_TUNNEL_B);
  const sC = subSeed(seed, SALT_CHAMBER);
  const sD = subSeed(seed, SALT_DEEP);
  const maxY = lastOpenRow(world);

  // 1. Noise caves.
  for (let x = 0; x < W; x++) {
    const s = world.surfaceY[x] ?? WORLD.surfaceBase;
    for (let y = s + MIN_CAVE_DEPTH; y <= maxY; y++) {
      const depth = y - s;
      // Density ramps from 0 (MIN_CAVE_DEPTH) to 1 (cavesDepth).
      const t = clamp((depth - MIN_CAVE_DEPTH) / (WORLD.cavesDepth - MIN_CAVE_DEPTH), 0, 1);
      // Rotated domains (value noise has axis-aligned artefacts otherwise).
      const u = x * ROT_COS - y * ROT_SIN;
      const v = x * ROT_SIN + y * ROT_COS;
      let open = false;
      if (depth >= TUNNEL_MIN_DEPTH) {
        const tw = TUNNEL_WIDTH * (0.5 + 0.5 * t);
        open = Math.abs(noise2(sA, u, v * 1.6, 40)) < tw || Math.abs(noise2(sB, v * 0.8, u * 1.3, 32)) < tw * 0.8;
      }
      if (!open && depth >= WORLD.deepDepth) {
        open = noise2(sD, u, v * 1.4, 34) + 0.35 * noise2(sD + 1, v, u, 11) > DEEP_CHAMBER_THRESHOLD;
      } else if (!open && t >= 1) {
        open = noise2(sC, u, v * 1.5, 22) + 0.3 * noise2(sC + 1, v, u, 8) > CHAMBER_THRESHOLD;
      }
      if (!open) continue;
      const i = y * W + x;
      if (world.fg[i] !== BEDROCK) world.fg[i] = AIR;
    }
  }

  // 2. Worms (underground, wider deeper).
  const worms = expectedCount(rand(rng), (W / 100) * WORMS_PER_100_COLUMNS);
  for (let n = 0; n < worms; n++) {
    const x = randInt(rng, 4, W - 5);
    const s = world.surfaceY[x] ?? WORLD.surfaceBase;
    const y = randInt(rng, s + WORLD.cavesDepth, Math.max(s + WORLD.cavesDepth, maxY - 6));
    const deep = y - s >= WORLD.deepDepth;
    worm(ctx, x, y, randInt(rng, 80, 220), deep ? randRange(rng, 2.2, 3.4) : randRange(rng, 1.6, 2.6), false);
  }

  // 3. Cave mouths: surface entrances in natural (non-spawn) zones.
  for (const z of ctx.zones) {
    const b = BIOMES[z.biome];
    if (b.topTile !== 'grass') continue;
    const count = expectedCount(rand(rng), ((z.x1 - z.x0) / 100) * MOUTHS_PER_100_COLUMNS);
    for (let n = 0; n < count; n++) {
      const x = randInt(rng, z.x0 + 6, z.x1 - 7);
      if (x < WORLD.edgeMargin || x > W - WORLD.edgeMargin) continue;
      if (Math.abs(x - spawnCentreX(W)) < MOUTH_SPAWN_CLEARANCE) continue;
      const s = world.surfaceY[x] ?? WORLD.surfaceBase;
      worm(ctx, x, s - 1, randInt(rng, 35, 70), randRange(rng, 1.4, 2.1), true);
    }
  }
}
