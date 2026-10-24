import { PLAYABLE_OPERATORS } from '../../config/sim.ts';
import { ELIMINATION_RULES } from './elimination.ts';
import type { AbilityDef } from '../../data/schema.ts';
import type { CharacterEntity, MatchState } from '../types.ts';
import type { ModeId, ModeRules } from './mode.ts';
import { RANGE_RULES, rangeOperators } from './range.ts';
import { RELAY_RULES } from './relay.ts';

// NEW — the mode registry (ADR-0011 §6): Sim.create looks the rules up here, menus list its keys.

export const MODES: Record<ModeId, ModeRules> = {
  range: RANGE_RULES,
  elimination: ELIMINATION_RULES,
  relay: RELAY_RULES,
};

/** Every mode id in registry order. */
export const MODE_IDS = Object.keys(MODES) as ModeId[];

/** Whether the match's rules freeze `team`'s living characters now (look only; ModeRules.frozen). */
export const matchFrozen = (match: MatchState, team: number): boolean => MODES[match.mode].frozen(match, team);

/** The match rules' ability gate (ModeRules.abilityAllowed; allowed when a mode has none). */
export const matchAbilityAllowed = (match: MatchState, e: Readonly<CharacterEntity>, ability: AbilityDef): boolean =>
  MODES[match.mode].abilityAllowed?.(match, e, ability) ?? true;

/** Whether the level's setup walls stand now (ModeRules.setupWallsUp; never when a mode has none). */
export const matchSetupWallsUp = (match: MatchState): boolean => MODES[match.mode].setupWallsUp?.(match) ?? false;

// NEW — ADR-0013 §3: the host's operator list (ModeHost.playableOperators) is gone.
/** The operators a player chooses from in this match, in data order: the range's (rangeOperators),
 *  PLAYABLE_OPERATORS in the round modes. Whether a choice is accepted now is Sim.accepts'. */
export const operatorChoices = (match: MatchState): readonly string[] => (match.mode === 'range' ? rangeOperators() : PLAYABLE_OPERATORS);
