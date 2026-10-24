// OWNER: agent "worldgen" (A). Surface biome zones left → right.
// Rules (docs/SPEC.md §3, biomes.ts): the spawn zone (SPAWN_BIOME) sits at the world centre, every
// surface biome appears at least once, FAR_BIOMES never touch the spawn zone, zones that would be
// clipped to a sliver at the world edge are merged into their neighbour.
import { WORLD } from '../../config/sim.ts';
import { BIOMES, FAR_BIOMES, SPAWN_BIOME } from '../../data/biomes.ts';
import { BIOME_IDS, type BiomeId } from '../../data/schema.ts';
import { randInt, type RngState } from '../rng.ts';
import { spawnCentreX, type Zone } from './context.ts';

// NEW — a zone narrower than this at the world edge is merged into its inner neighbour.
const MIN_EDGE_ZONE = WORLD.edgeMargin * 2;

export const SURFACE_BIOMES: readonly BiomeId[] = BIOME_IDS.filter((b) => BIOMES[b].surface);

function shuffle<T>(rng: RngState, list: T[]): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = randInt(rng, 0, i);
    const a = list[i] as T;
    list[i] = list[j] as T;
    list[j] = a;
  }
  return list;
}

function zoneWidth(rng: RngState, b: BiomeId): number {
  const [lo, hi] = BIOMES[b].width;
  return randInt(rng, lo, hi);
}

/** Random filler biome for the outer world: anything but the previous zone's biome. */
function filler(rng: RngState, previous: BiomeId): BiomeId {
  const options = SURFACE_BIOMES.filter((b) => b !== previous);
  return options[randInt(rng, 0, options.length - 1)] ?? previous;
}

/**
 * One side of the world, walking outward from the spawn zone. `mandatory` is laid out first (in
 * order, nearest the spawn), then fillers until `space` columns are covered.
 * Returns zone widths, nearest first.
 */
function layoutSide(rng: RngState, mandatory: BiomeId[], space: number): { biome: BiomeId; w: number }[] {
  const out = mandatory.map((biome) => ({ biome, w: zoneWidth(rng, biome) }));
  const need = out.reduce((s, z) => s + z.w, 0);
  const room = space - MIN_EDGE_ZONE;
  if (need > room && need > 0) {
    // Mandatory zones must fit; shrink them proportionally (rare, only for very small worlds).
    for (const z of out) z.w = Math.max(1, Math.floor((z.w * room) / need));
  }
  let used = out.reduce((s, z) => s + z.w, 0);
  while (used < space) {
    const prev = out[out.length - 1]?.biome ?? SPAWN_BIOME;
    const biome = filler(rng, prev);
    const w = zoneWidth(rng, biome);
    out.push({ biome, w });
    used += w;
  }
  // Clip the outermost zone at the edge; merge a sliver into its neighbour.
  let excess = used - space;
  while (excess > 0) {
    const last = out[out.length - 1];
    if (!last) break;
    const cut = Math.min(excess, last.w);
    last.w -= cut;
    excess -= cut;
    if (last.w <= 0) out.pop();
  }
  const last = out[out.length - 1];
  const inner = out[out.length - 2];
  if (last && inner && last.w < MIN_EDGE_ZONE && !mandatory.includes(last.biome)) {
    inner.w += last.w;
    out.pop();
  }
  return out;
}

export function layoutZones(rng: RngState, width: number): Zone[] {
  const spawnW = zoneWidth(rng, SPAWN_BIOME);
  const spawnX0 = spawnCentreX(width) - Math.floor(spawnW / 2);
  const spawnX1 = spawnX0 + spawnW;

  const others = shuffle(rng, SURFACE_BIOMES.filter((b) => b !== SPAWN_BIOME));
  const near = others.filter((b) => !FAR_BIOMES.includes(b));
  const left: BiomeId[] = [];
  const right: BiomeId[] = [];
  if (near[0]) left.push(near[0]);
  if (near[1]) right.push(near[1]);
  else if (near[0]) right.push(near[0]);
  // Remaining biomes alternate sides, the lighter side (by expected width) first.
  const mid = (b: BiomeId): number => (BIOMES[b].width[0] + BIOMES[b].width[1]) / 2;
  const sideWeight = (side: BiomeId[]): number => side.reduce((s, b) => s + mid(b), 0);
  for (const b of others) {
    if (left.includes(b) || right.includes(b)) continue;
    (sideWeight(left) <= sideWeight(right) ? left : right).push(b);
  }

  const zones: Zone[] = [{ biome: SPAWN_BIOME, x0: spawnX0, x1: spawnX1 }];
  let cursor = spawnX0;
  for (const z of layoutSide(rng, left, spawnX0)) {
    zones.unshift({ biome: z.biome, x0: cursor - z.w, x1: cursor });
    cursor -= z.w;
  }
  cursor = spawnX1;
  for (const z of layoutSide(rng, right, width - spawnX1)) {
    zones.push({ biome: z.biome, x0: cursor, x1: cursor + z.w });
    cursor += z.w;
  }
  return zones;
}
