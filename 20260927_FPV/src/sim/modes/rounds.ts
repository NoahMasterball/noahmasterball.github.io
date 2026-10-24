import { MATCH_FORMAT, type AttackZonePick } from '../../config/sim.ts';
import { SIDES, type LevelDef, type Side } from '../../data/schema.ts';
import type { SimContext } from '../context.ts';
import { clearWorldObjects, respawnAt } from '../entities.ts';
import { DEG2RAD, fromTuple } from '../math.ts';
import type { RoundMatch, RoundMatchBase, Score } from '../types.ts';
import {
  addRoundWin,
  drawAttackZone,
  matchWinner,
  nextAttackingTeam,
  pickTeam,
  roundSpawnPoint,
  sideOf,
  sideZones,
  teamSlots,
  TEAMS,
  type RoundResult,
} from './format.ts';

// NEW — the round flow shared by the side-based modes (ADR-0013 §2), moved unchanged out of
// elimination.ts so Relay adds phases and the uplink, not a second round flow: the opening coin
// flip and zone draw, phase changes, alive counts, booking a result and the reset into the next
// round (sides per MATCH_FORMAT, a fresh attack zone, world objects cleared, everyone respawned
// at their side) or the match end. Timers are ticks.

/** Dead characters' deadTime grows (mode steps run it first). */
export function ageDead(ctx: SimContext, dt: number): void {
  for (const e of ctx.state.entities) if (!e.alive) e.deadTime += dt;
}

/** The fields of round 1 (phase clock not started): the first attackers (MATCH_FORMAT, may draw a
 *  coin flip from SimState.rng) and their spawn zone (`attackZone`, may draw). */
export function openingFields(ctx: SimContext, attackZone: AttackZonePick): RoundMatchBase {
  return {
    round: 1,
    phaseEndTick: null,
    score: [0, 0],
    attackingTeam: pickTeam(MATCH_FORMAT.firstAttackingTeam, ctx.state.rng),
    attackZoneId: drawAttackZone(ctx.level, attackZone, ctx.state.rng),
    lastWinner: null,
  };
}

/** Enters `phase` for `ticks` ticks (null: terminal, no clock) and emits `phase`. */
export function beginPhase<M extends RoundMatch>(ctx: SimContext, m: M, phase: M['phase'], ticks: number | null): void {
  m.phase = phase;
  m.phaseEndTick = ticks === null ? null : ctx.state.tick + ticks;
  ctx.emit({ type: 'phase', phase, round: m.round, attackingTeam: m.attackingTeam, endsAtTick: m.phaseEndTick });
}

/** Whether the current phase's clock has run out (never for a terminal phase). */
export const phaseOver = (ctx: SimContext, m: Pick<RoundMatchBase, 'phaseEndTick'>): boolean =>
  m.phaseEndTick !== null && ctx.state.tick >= m.phaseEndTick;

/** Living characters per side this round (teams outside TEAMS do not count). */
export function aliveBySide(ctx: SimContext, m: Pick<RoundMatchBase, 'attackingTeam'>): Record<Side, number> {
  const alive: Record<Side, number> = { attack: 0, defend: 0 };
  for (const e of ctx.state.entities) {
    if (e.alive && TEAMS.includes(e.team)) alive[sideOf(m, e.team)] += 1;
  }
  return alive;
}

const copyScore = (score: Score): Score => [score[0], score[1]];

/** Books a round result: the score, lastWinner and the `roundEnd` event. The caller begins its
 *  result phase. */
export function bookRound(ctx: SimContext, m: RoundMatch, result: RoundResult): void {
  addRoundWin(m.score, result.winner);
  m.lastWinner = result.winner;
  ctx.emit({ type: 'roundEnd', round: m.round, ...result, score: copyScore(m.score) });
}

/** The end of the result phase: once a team has MATCH_FORMAT.roundsToWin, the `matchEnd` event →
 *  'matchEnd'. Otherwise the next round → 'next': sides per MATCH_FORMAT, a fresh attack zone
 *  (`attackZone`), no gadgets, projectiles or areas left (clearWorldObjects), everyone revived at
 *  their side's spawn (slot = index in the team by entity id) with a full kit. The caller resets
 *  its own fields and begins the phase. */
export function closeRound(ctx: SimContext, m: RoundMatch, attackZone: AttackZonePick): 'next' | 'matchEnd' {
  const winner = matchWinner(m.score);
  if (winner !== null) {
    ctx.emit({ type: 'matchEnd', winner, score: copyScore(m.score) });
    return 'matchEnd';
  }
  m.attackingTeam = nextAttackingTeam(m, ctx.state.rng);
  m.round += 1;
  m.attackZoneId = drawAttackZone(ctx.level, attackZone, ctx.state.rng);
  clearWorldObjects(ctx);
  const entities = ctx.state.entities;
  const slots = teamSlots(entities.map((e) => e.team));
  entities.forEach((e, i) => {
    const p = roundSpawnPoint(ctx.level, m, e.team, slots[i] ?? 0);
    respawnAt(ctx, e, fromTuple(p.position), p.yawDeg * DEG2RAD);
  });
  return 'next';
}

/** What every side mode needs of a level: both spawn sides and a nav graph (its bots walk it). */
export function sideLevelProblems(level: LevelDef, mode: string): string[] {
  const problems = SIDES.filter((side) => sideZones(level, side).length === 0).map(
    (side) => `level '${level.id}': ${mode} needs a '${side}' spawn zone`,
  );
  if (!level.nav) problems.push(`level '${level.id}': ${mode} needs a nav graph (its bots walk it)`);
  return problems;
}
