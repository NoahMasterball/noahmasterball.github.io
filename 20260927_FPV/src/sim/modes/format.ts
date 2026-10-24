import { MATCH, MATCH_FORMAT, operatorPickLimit, PLAYABLE_OPERATORS, type AttackZonePick, type TeamPick } from '../../config/sim.ts';
import type { LevelDef, Side, SpawnPointDef, SpawnZoneDef } from '../../data/schema.ts';
import type { SpawnOptions } from '../entities.ts';
import { DEG2RAD, fromTuple } from '../math.ts';
import { randomIndex, type RngState } from '../rng.ts';
import type { CharacterEntity, EntityId, MatchState, RoundEndReason, RoundMatch, RoundMatchBase, Score } from '../types.ts';

// NEW — sides, match format, spawns by side and the round-result rule of the attack/defence
// modes (SPEC §4.1/§4.3, ADR-0011 §6). Pure functions shared by elimination and Relay (ADR-0013),
// plus the roster rules both use (default roster, playable operators, the Relay pick limit).
// Constants: MATCH, MATCH_FORMAT and PLAYABLE_OPERATORS in src/config/sim.ts.

/** The two teams of a side-based match (index into Score). */
export const TEAMS: readonly number[] = [0, 1];

export const otherTeam = (team: number): number => 1 - team;

/** What the side helpers read from a side-based match state. */
export type SideMatch = Pick<RoundMatchBase, 'round' | 'score' | 'attackingTeam' | 'attackZoneId'>;
type Sides = Pick<SideMatch, 'attackingTeam'>;

// NEW — ADR-0013 §2: bots and the client tested `mode === 'elimination'` to mean "a round mode".
/** The match state of a side-based round mode (elimination, Relay), or null (range). */
export const roundMatchOf = (match: MatchState): RoundMatch | null => (match.mode === 'range' ? null : match);

/** The side a team plays this round. */
export const sideOf = (match: Sides, team: number): Side => (team === match.attackingTeam ? 'attack' : 'defend');

/** The team playing a side this round. */
export const teamOnSide = (match: Sides, side: Side): number =>
  side === 'attack' ? match.attackingTeam : otherTeam(match.attackingTeam);

/** A team by pick: a fair coin flip from `rng`, or the fixed team index. */
export function pickTeam(pick: TeamPick, rng: RngState): number {
  if (pick !== 'coinFlip') return pick;
  const team = TEAMS[randomIndex(rng, TEAMS.length)];
  if (team === undefined) throw new Error('No team to pick');
  return team;
}

/** Both teams one win short: the next round is the single overtime round. */
export const isOvertime = (score: Score): boolean => score.every((wins) => wins === MATCH_FORMAT.roundsToWin - 1);

/** The team that has won the match, or null while it goes on. */
export const matchWinner = (score: Score): number | null =>
  TEAMS.find((team) => (score[team] ?? 0) >= MATCH_FORMAT.roundsToWin) ?? null;

/** Adds a round win (Score has one entry per team). */
export function addRoundWin(score: Score, team: number): void {
  const wins = score[team];
  if (wins === undefined) throw new Error(`No team ${team} in this match`);
  score[team] = wins + 1;
}

/** Attackers of the round after `match.round`: sides swap every sideSwapAfterRounds rounds; the
 *  overtime round's attackers are MATCH_FORMAT.overtimeAttackingTeam (may draw from `rng`). */
export function nextAttackingTeam(match: SideMatch, rng: RngState): number {
  if (isOvertime(match.score)) return pickTeam(MATCH_FORMAT.overtimeAttackingTeam, rng);
  return match.round % MATCH_FORMAT.sideSwapAfterRounds === 0 ? otherTeam(match.attackingTeam) : match.attackingTeam;
}

/** A level's spawn zones of one side, in level order. */
export const sideZones = (level: LevelDef, side: Side): SpawnZoneDef[] =>
  (level.spawnZones ?? []).filter((z) => z.side === side);

/** The attackers' spawn zone for a round (may draw from `rng`). */
export function drawAttackZone(level: LevelDef, pick: AttackZonePick, rng: RngState): string {
  const zones = sideZones(level, 'attack');
  const zone = zones[pick === 'random' ? randomIndex(rng, zones.length) : 0];
  if (!zone) throw new Error(`Level '${level.id}' has no attack spawn zone`);
  return zone.id;
}

/** Where a team spawns this round: the drawn attack zone, or the level's (first) defend zone. */
export function roundSpawnZone(level: LevelDef, match: Pick<SideMatch, 'attackingTeam' | 'attackZoneId'>, team: number): SpawnZoneDef {
  const side = sideOf(match, team);
  const zones = sideZones(level, side);
  const zone = side === 'attack' ? zones.find((z) => z.id === match.attackZoneId) : zones[0];
  if (!zone) throw new Error(`Level '${level.id}' has no ${side} spawn zone '${side === 'attack' ? match.attackZoneId : ''}'`);
  return zone;
}

/** Slot of each entry within its team, in list order (entity id order for characters):
 *  slot n of a team spawns on point n of its zone. */
export function teamSlots(teams: readonly number[]): number[] {
  const next = new Map<number, number>();
  return teams.map((team) => {
    const slot = next.get(team) ?? 0;
    next.set(team, slot + 1);
    return slot;
  });
}

/** Spawn point of a team's slot this round. */
export function roundSpawnPoint(
  level: LevelDef,
  match: Pick<SideMatch, 'attackingTeam' | 'attackZoneId'>,
  team: number,
  slot: number,
): SpawnPointDef {
  const zone = roundSpawnZone(level, match, team);
  const point = zone.points[slot];
  if (!point) throw new Error(`Spawn zone '${zone.id}' has no point for slot ${slot} (MATCH.teamSize)`);
  return point;
}

/** Who plays: a character before it has a place (SpawnOptions without position and facing). */
export type RosterEntry = Omit<SpawnOptions, 'position' | 'yaw'>;

/** Initial spawns of a roster at the current round's sides. Spawn them in this order
 *  (Sim.spawnCharacter), so each team's entity id order matches its slots. */
export function roundSpawnOptions(
  level: LevelDef,
  match: Pick<SideMatch, 'attackingTeam' | 'attackZoneId'>,
  roster: readonly RosterEntry[],
): SpawnOptions[] {
  const slots = teamSlots(roster.map((r) => r.team));
  return roster.map((r, i) => {
    const p = roundSpawnPoint(level, match, r.team, slots[i] ?? 0);
    return { ...r, position: fromTuple(p.position), yaw: p.yawDeg * DEG2RAD };
  });
}

export interface RoundResult {
  winner: number;
  winnerSide: Side;
  reason: RoundEndReason;
}

/** The result "`side` takes the round for `reason`" (Relay's objective results use it too). */
export const sideResult = (match: Sides, side: Side, reason: RoundEndReason): RoundResult => ({ winner: teamOnSide(match, side), winnerSide: side, reason });

/** The round result from the living players per side and the clock (SPEC §4.3), or null while
 *  the round goes on: a side with nobody alive loses (both at once → MATCH_FORMAT.mutualWipeWinner),
 *  otherwise the clock running out gives the round to MATCH_FORMAT.timeoutWinner. No draws. */
export function decideRound(match: Sides, alive: Readonly<Record<Side, number>>, timedOut: boolean): RoundResult | null {
  let side: Side | null = null;
  let reason: RoundEndReason = 'elimination';
  if (alive.attack === 0 && alive.defend === 0) side = MATCH_FORMAT.mutualWipeWinner;
  else if (alive.attack === 0) side = 'defend';
  else if (alive.defend === 0) side = 'attack';
  else if (timedOut) {
    side = MATCH_FORMAT.timeoutWinner;
    reason = 'timeout';
  }
  return side === null ? null : sideResult(match, side, reason);
}

// ── Rosters and operator picks ──────────────────────────────────────────────

/** The default 5v5 (SPEC §4.3): the player is slot 0 of MATCH.playerTeam, every other slot is a
 *  bot cycling PLAYABLE_OPERATORS by slot (within operatorPickLimit per team). Spawn with
 *  roundSpawnOptions. Moved from elimination.ts: Relay plays the same roster (ADR-0013 §2). */
export function defaultRoster(playerOperatorId: string): RosterEntry[] {
  return TEAMS.flatMap((team) =>
    Array.from({ length: MATCH.teamSize }, (_, slot): RosterEntry => {
      if (team === MATCH.playerTeam && slot === 0) return { team, operatorId: playerOperatorId, controller: 'player' };
      const operatorId = PLAYABLE_OPERATORS[slot % PLAYABLE_OPERATORS.length];
      if (!operatorId) throw new Error('PLAYABLE_OPERATORS is empty');
      return { team, operatorId, controller: 'bot' };
    }),
  );
}

// NEW — ADR-0013 §3: Relay's picks (elimination keeps accepting any operator in its select window).
/** Whether matches let anyone pick this operator (PLAYABLE_OPERATORS). */
export const isPlayableOperator = (operatorId: string): boolean => (PLAYABLE_OPERATORS as readonly string[]).includes(operatorId);

// NEW — ADR-0013 §3: the one pick rule of the sim (Relay's acceptsControl), the select screen and
// the bots' picks (src/ai/picks.ts).
/** Whether `entityId` may play `operatorId` beside the rest of its team: fewer than
 *  operatorPickLimit() of the team's *other* members play it. `team` = the team's members (the
 *  picker may be among them). */
export function pickAllowed(team: readonly Readonly<Pick<CharacterEntity, 'id' | 'operatorId'>>[], entityId: EntityId, operatorId: string): boolean {
  const taken = team.filter((m) => m.id !== entityId && m.operatorId === operatorId).length;
  return taken < operatorPickLimit();
}
