import type { AbilityDef, LevelDef } from '../../data/schema.ts';
import type { Command } from '../command.ts';
import type { SimContext } from '../context.ts';
import type { CharacterEntity, ControlMessage, MatchState } from '../types.ts';

// NEW — the contract every game mode implements (ADR-0011 §6). A Sim runs exactly one mode; the
// registry is MODES in ./index.ts. Relay (ADR-0013) is the third implementation. Every member
// except the steps is a pure function of the match state.

/** Mode ids, derived from the match states so the two can never drift apart. */
export type ModeId = MatchState['mode'];

export interface ModeRules {
  /** Problems that make a level unplayable in this mode; Sim.create throws on any. */
  validateLevel(level: LevelDef): string[];
  /** The match state at creation. May draw from SimState.rng and emit events (tick 0). */
  initialMatch(ctx: SimContext): MatchState;
  /** Step 2 of Sim.step: phase flow, respawns, round resets (Relay: the uplink channel). */
  tick(ctx: SimContext, dt: number): void;
  /** Whether the living characters of `team` may only look around now (a freeze such as the
   *  pre-round; Relay's setup freezes the attackers only). The rules' filterCommand applies it;
   *  bots read it (matchFrozen) and stand still meanwhile. */
  frozen(match: MatchState, team: number): boolean;
  /** The part of a living character's command the rules let through (freeze, setup rules). */
  filterCommand(ctx: SimContext, e: CharacterEntity, cmd: Command): Command;
  /** Whether a queued control message is applied now (operator-select window, pick limit).
   *  Read-only: Sim.accepts asks it too (UIs grey out refused picks). */
  acceptsControl(ctx: SimContext, msg: ControlMessage): boolean;
  /** The ability gate (ADR-0013 §4): whether `e` may activate `ability` now (Relay setup: recon
   *  abilities only). A pure function of the match state; absent = always allowed. Every
   *  activation asks it where it would spend (matchAbilityAllowed); passives are never gated. */
  abilityAllowed?(match: MatchState, e: Readonly<CharacterEntity>, ability: AbilityDef): boolean;
  /** Whether the level's setup walls stand now (ADR-0013 §4; Relay: phase setup). A pure
   *  function of the match state; absent = never. Sim re-derives the colliders from it after
   *  every mode step (matchSetupWallsUp). */
  setupWallsUp?(match: MatchState): boolean;
}
