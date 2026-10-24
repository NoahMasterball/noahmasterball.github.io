import { ELIMINATION, secondsToTicks } from '../../config/sim.ts';
import type { LevelDef } from '../../data/schema.ts';
import { idleCommand } from '../command.ts';
import type { SimContext } from '../context.ts';
import type { EliminationMatch, EliminationPhase, MatchState, RoundMatchBase } from '../types.ts';
import { decideRound, type RoundResult } from './format.ts';
import type { ModeRules } from './mode.ts';
import { ageDead, aliveBySide, beginPhase, bookRound, closeRound, openingFields, phaseOver, sideLevelProblems } from './rounds.ts';

// NEW — elimination rounds (SPEC §4.3, ADR-0011 §6): 5v5 without an objective, played with sides
// so Relay only adds phases and the uplink. preRound (freeze: look and operator choice) → live →
// roundEnd (result locked) → next preRound, or matchEnd once a team has
// MATCH_FORMAT.roundsToWin. No respawns inside a round; every round starts from the side spawns
// with a full kit. Timers are ticks; a kill in the weapons step is judged in the next tick. The
// round flow itself is shared with Relay (rounds.ts, ADR-0013 §2).

/** Length of each timed phase in ticks (matchEnd is terminal). */
const PHASE_TICKS: Record<Exclude<EliminationPhase, 'matchEnd'>, number> = {
  preRound: secondsToTicks(ELIMINATION.preRoundSeconds),
  live: secondsToTicks(ELIMINATION.roundSeconds),
  roundEnd: secondsToTicks(ELIMINATION.roundEndSeconds),
};

/** Phases in which living characters may only look around. `roundEnd` is not one: the result
 *  is locked, but everyone (bots included) may still move and shoot until the next round. */
const FROZEN_PHASES: ReadonlySet<EliminationPhase> = new Set<EliminationPhase>(['preRound', 'matchEnd']);

const frozen = (match: MatchState): boolean => match.mode === 'elimination' && FROZEN_PHASES.has(match.phase);

function matchOf(ctx: SimContext): EliminationMatch {
  const m = ctx.state.match;
  if (m.mode !== 'elimination') throw new Error(`Elimination rules running a '${m.mode}' match`);
  return m;
}

function enterPhase(ctx: SimContext, m: EliminationMatch, phase: EliminationPhase): void {
  beginPhase(ctx, m, phase, phase === 'matchEnd' ? null : PHASE_TICKS[phase]);
}

/** The current round's result (SPEC §4.3), or null while it goes on: living players per side
 *  and the round clock (`phaseEndTick` of the live phase). */
export function eliminationWinner(ctx: SimContext, match: Pick<RoundMatchBase, 'attackingTeam' | 'phaseEndTick'>): RoundResult | null {
  return decideRound(match, aliveBySide(ctx, match), phaseOver(ctx, match));
}

function tick(ctx: SimContext, dt: number): void {
  const m = matchOf(ctx);
  ageDead(ctx, dt);
  switch (m.phase) {
    case 'preRound':
      if (phaseOver(ctx, m)) enterPhase(ctx, m, 'live');
      break;
    case 'live': {
      const result = eliminationWinner(ctx, m);
      if (result) {
        bookRound(ctx, m, result);
        enterPhase(ctx, m, 'roundEnd');
      }
      break;
    }
    case 'roundEnd':
      if (phaseOver(ctx, m)) enterPhase(ctx, m, closeRound(ctx, m, ELIMINATION.attackZone) === 'next' ? 'preRound' : 'matchEnd');
      break;
    case 'matchEnd':
      break;
  }
}

function validateLevel(level: LevelDef): string[] {
  return sideLevelProblems(level, 'elimination');
}

export const ELIMINATION_RULES: ModeRules = {
  validateLevel,
  initialMatch(ctx) {
    const m: EliminationMatch = { mode: 'elimination', phase: 'preRound', ...openingFields(ctx, ELIMINATION.attackZone) };
    enterPhase(ctx, m, 'preRound');
    return m;
  },
  tick,
  frozen,
  filterCommand: (ctx, _e, cmd) => (frozen(matchOf(ctx)) ? idleCommand(cmd.tick, cmd.yaw, cmd.pitch) : cmd),
  acceptsControl: (ctx, msg) => msg.type !== 'selectOperator' || matchOf(ctx).phase === 'preRound',
};
