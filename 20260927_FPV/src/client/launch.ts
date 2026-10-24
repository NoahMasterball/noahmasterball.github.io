import { LAUNCH } from '../config/client.ts';
import { AI_TIERS, type AiTier } from '../config/sim.ts';
import { getLevel, LEVELS } from '../data/content.ts';
import type { LevelDef } from '../data/schema.ts';
import { MODE_IDS, MODES } from '../sim/modes/index.ts';
import type { ModeId } from '../sim/modes/mode.ts';

// NEW — launch options from the page URL (ADR-0011 §7: `?mode=&level=&tier=&seed=`, used by
// players, the menu, QA, the e2e test and the screenshot tool). A value that names nothing, or a
// level that cannot host the mode, fails the boot with a visible message instead of silently
// falling back to a default. Pure (no DOM), so Node tools and unit tests use it too.

export interface LaunchOptions {
  mode: ModeId;
  level: LevelDef;
  /** Difficulty of every combat bot (ADR-0011 §4). */
  tier: AiTier;
  /** Seed of the gameplay RNG and of the bots' RNG streams. */
  seed: number;
}

/** Launch values that do not come from LAUNCH when the URL names none: the persisted difficulty
 *  setting and the page load's seed (defaultSeed()). */
export interface LaunchFallback {
  tier: AiTier;
  seed: number;
}

/** What a launch URL carries; tier and seed are left out unless given (menu relaunches omit them). */
export interface LaunchParams {
  mode: ModeId;
  levelId: string;
  tier?: AiTier;
  seed?: number;
}

/** Seeds are unsigned 32-bit integers (the RNG state is one int32, src/sim/rng.ts). */
const MAX_SEED = 0xffff_ffff;

type ParamName = keyof typeof LAUNCH.params;

function fail(param: ParamName, value: string, problem: string, cause?: unknown): never {
  throw new Error(`URL parameter '${LAUNCH.params[param]}=${value}' ${problem}.`, cause === undefined ? undefined : { cause });
}

const isMode = (value: string): value is ModeId => (MODE_IDS as readonly string[]).includes(value);
const isTier = (value: string): value is AiTier => (AI_TIERS as readonly string[]).includes(value);

/** The levels that can host a mode (its validateLevel finds no problem), in registry order. */
export const levelsForMode = (mode: ModeId): LevelDef[] => LEVELS.filter((l) => MODES[mode].validateLevel(l).length === 0);

function modeFromParam(value: string | null): ModeId {
  if (value === null) return LAUNCH.defaultMode;
  if (!isMode(value)) fail('mode', value, `names no mode (known: ${MODE_IDS.join(', ')})`);
  return value;
}

function levelFromParam(value: string | null, mode: ModeId): LevelDef {
  const id = value ?? LAUNCH.defaultLevel[mode];
  let level: LevelDef;
  try {
    level = getLevel(id);
  } catch (err) {
    fail('level', id, `names no level (known: ${LEVELS.map((l) => l.id).join(', ')})`, err);
  }
  const problems = MODES[mode].validateLevel(level);
  if (problems.length) {
    const suitable = levelsForMode(mode).map((l) => l.id).join(', ') || 'none';
    const what = value === null ? `The default level '${id}'` : `Level '${id}'`;
    throw new Error(`${what} cannot host mode '${mode}' (levels for it: ${suitable}):\n- ${problems.join('\n- ')}`);
  }
  return level;
}

function tierFromParam(value: string | null, fallback: AiTier): AiTier {
  if (value === null) return fallback;
  if (!isTier(value)) fail('tier', value, `names no bot difficulty (known: ${AI_TIERS.join(', ')})`);
  return value;
}

function seedFromParam(value: string | null, fallback: number): number {
  if (value === null) return fallback;
  const seed = value.trim() === '' ? NaN : Number(value);
  if (!Number.isInteger(seed) || seed < 0 || seed > MAX_SEED) fail('seed', value, `is not a whole number from 0 to ${MAX_SEED}`);
  return seed;
}

/** Reads the launch options from a URL query string (`location.search`). */
export function readLaunchOptions(search: string, fallback: LaunchFallback): LaunchOptions {
  const params = new URLSearchParams(search);
  const get = (name: ParamName): string | null => params.get(LAUNCH.params[name]);
  const mode = modeFromParam(get('mode'));
  return {
    mode,
    level: levelFromParam(get('level'), mode),
    tier: tierFromParam(get('tier'), fallback.tier),
    seed: seedFromParam(get('seed'), fallback.seed),
  };
}

/** The seed of a launch whose URL names none (LAUNCH.seed): fixed, or fresh per page load. */
export function defaultSeed(random: () => number = Math.random): number {
  return LAUNCH.seed === 'perLoad' ? Math.floor(random() * (MAX_SEED + 1)) : LAUNCH.seed;
}

/** The query string (with '?') of a launch; readLaunchOptions reads it back. */
export function launchSearch(l: LaunchParams): string {
  const params = new URLSearchParams({ [LAUNCH.params.mode]: l.mode, [LAUNCH.params.level]: l.levelId });
  if (l.tier !== undefined) params.set(LAUNCH.params.tier, l.tier);
  if (l.seed !== undefined) params.set(LAUNCH.params.seed, String(l.seed));
  return `?${params.toString()}`;
}
