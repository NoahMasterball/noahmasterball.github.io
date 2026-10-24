// NEW — seeded PRNG (mulberry32). Its whole state is one integer inside SimState (match-level
// draws in SimState.rng, spread samples in each CharacterEntity.rng), so it is serialisable and
// replays reproduce every sample (NETWORKING.md §5).

export interface RngState {
  s: number;
}

export const createRng = (seed: number): RngState => ({ s: seed | 0 });

/** Uniform float in [0, 1); advances the state. */
export function nextRandom(rng: RngState): number {
  rng.s = (rng.s + 0x6d2b79f5) | 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Uniform float in [min, max). */
export const randomRange = (rng: RngState, min: number, max: number): number => min + (max - min) * nextRandom(rng);

// NEW — uniform choice among n options (coin flips, spawn-zone draws); only float helpers existed.
/** Uniform integer in [0, n). */
export const randomIndex = (rng: RngState, n: number): number => Math.floor(nextRandom(rng) * n);

// NEW — independent RNG streams from one seed (one per bot: createRng(deriveSeed(seed, id)),
// ADR-0011 §3), so no stream ever draws from SimState.rng.
/** Seed for stream `stream` of `seed`: murmur3's 32-bit finaliser over the combined value. */
export function deriveSeed(seed: number, stream: number): number {
  let h = (seed ^ Math.imul(stream | 0, 0x9e3779b1)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) | 0;
}

// NEW — ADR-0014 §2: gameplay streams inside SimState need their own seed domain, apart from the
// bot streams deriveSeed(seed, id) that share the entity ids.
/** Seed domains of the gameplay RNG streams in SimState (one stream per domain and entity). */
export const RNG_DOMAIN = {
  /** CharacterEntity.rng: the character's spread samples, so a client can predict its own shots
   *  whoever else fires (ADR-0014 §2). ASCII "CHAR". */
  character: 0x43484152,
} as const;

/** Seed of character `id`'s gameplay stream in a simulation created with `seed`. */
export const characterSeed = (seed: number, id: number): number => deriveSeed(deriveSeed(seed, RNG_DOMAIN.character), id);
