import { describe, expect, it } from 'vitest';
import { ELIMINATION, MATCH, MATCH_FORMAT, PLAYABLE_OPERATORS, secondsToTicks } from '../../src/config/sim.ts';
import { getOperator } from '../../src/data/content.ts';
import { RANGE_LEVEL } from '../../src/data/levels/range.ts';
import { SALTWORKS_LEVEL } from '../../src/data/levels/saltworks.ts';
import { BUTTON } from '../../src/sim/command.ts';
import { WEAPON_SLOTS, weaponForSlot } from '../../src/sim/entities.ts';
import { DEG2RAD, vec3 } from '../../src/sim/math.ts';
import {
  decideRound,
  defaultRoster,
  isOvertime,
  matchWinner,
  nextAttackingTeam,
  otherTeam,
  roundSpawnOptions,
  roundSpawnPoint,
  roundSpawnZone,
  sideOf,
  teamOnSide,
  type RosterEntry,
} from '../../src/sim/modes/format.ts';
import { matchFrozen, MODE_IDS, MODES } from '../../src/sim/modes/index.ts';
import { createRng } from '../../src/sim/rng.ts';
import { Sim } from '../../src/sim/sim.ts';
import type { CharacterEntity, EliminationMatch, SimEvent } from '../../src/sim/types.ts';
import { fireAt, step, stepUntil, untilPhase, type Inputs } from './support/match.ts';
import { ofType, type EventOf } from './support/world.ts';

// Elimination rounds (SPEC §4.3, ADR-0011 §6) on the real Sim with Rapier in Node, driven only by
// Commands and ControlMessages.

const PRE_ROUND = secondsToTicks(ELIMINATION.preRoundSeconds);
const ROUND = secondsToTicks(ELIMINATION.roundSeconds);
const ROUND_END = secondsToTicks(ELIMINATION.roundEndSeconds);

function matchOf(sim: Sim): EliminationMatch {
  const m = sim.state.match;
  if (m.mode !== 'elimination') throw new Error('expected an elimination match');
  return m;
}

/** One player per team: the smallest match. */
const DUEL: RosterEntry[] = [
  { team: 0, operatorId: 'wisp', controller: 'player' },
  { team: 1, operatorId: 'basalt', controller: 'bot' },
];

async function eliminationMatch(roster: readonly RosterEntry[], seed = 1): Promise<{ sim: Sim; chars: CharacterEntity[]; created: SimEvent[] }> {
  const sim = await Sim.create(SALTWORKS_LEVEL, seed, 'elimination');
  const chars = roundSpawnOptions(sim.level, matchOf(sim), roster).map((o) => sim.spawnCharacter(o));
  return { sim, chars, created: sim.drainEvents() };
}

describe('mode registry', () => {
  it('lists range, elimination and relay; the range needs no spawn zones, elimination does', async () => {
    expect(MODE_IDS).toEqual(['range', 'elimination', 'relay']);
    expect(MODES.range.validateLevel(RANGE_LEVEL)).toEqual([]);
    expect(MODES.elimination.validateLevel(SALTWORKS_LEVEL)).toEqual([]);
    expect(MODES.elimination.validateLevel(RANGE_LEVEL).join('\n')).toMatch(/needs a 'attack' spawn zone/);
    await expect(Sim.create(RANGE_LEVEL, 1, 'elimination')).rejects.toThrow(/cannot host mode 'elimination'/);
    expect((await Sim.create(RANGE_LEVEL)).state.match).toEqual({ mode: 'range' });
    expect(matchFrozen({ mode: 'range' }, 0)).toBe(false);
  });
});

describe('format helpers (pure)', () => {
  it('decides rounds: wipe loses, mutual wipe and timeout go to the defenders, no draws', () => {
    const m = { attackingTeam: 1 };
    const defenders = teamOnSide(m, 'defend');
    expect(defenders).toBe(0);
    expect(decideRound(m, { attack: 2, defend: 1 }, false)).toBeNull();
    expect(decideRound(m, { attack: 0, defend: 1 }, false)).toEqual({ winner: defenders, winnerSide: 'defend', reason: 'elimination' });
    expect(decideRound(m, { attack: 1, defend: 0 }, false)).toEqual({ winner: 1, winnerSide: 'attack', reason: 'elimination' });
    // Coordinator default: a mutual wipe in one tick goes to the defenders.
    expect(decideRound(m, { attack: 0, defend: 0 }, false)).toEqual({ winner: defenders, winnerSide: 'defend', reason: 'elimination' });
    // User decision 2026-09-27: time runs out → the defending side wins.
    expect(decideRound(m, { attack: 3, defend: 3 }, true)).toEqual({ winner: defenders, winnerSide: 'defend', reason: 'timeout' });
    // A wipe in the last tick counts as the wipe.
    expect(decideRound(m, { attack: 1, defend: 0 }, true)?.reason).toBe('elimination');
  });

  it('swaps sides every sideSwapAfterRounds and flips a coin for the overtime round', () => {
    const rng = createRng(3);
    const last = MATCH_FORMAT.roundsToWin - 1;
    expect(isOvertime([last, last])).toBe(true);
    expect(isOvertime([last, last - 1])).toBe(false);
    expect(matchWinner([MATCH_FORMAT.roundsToWin, last])).toBe(0);
    expect(matchWinner([last, last])).toBeNull();
    const swap = MATCH_FORMAT.sideSwapAfterRounds;
    expect(nextAttackingTeam({ round: 1, score: [1, 0], attackingTeam: 0, attackZoneId: 'x' }, rng)).toBe(0);
    expect(nextAttackingTeam({ round: swap, score: [1, 0], attackingTeam: 0, attackZoneId: 'x' }, rng)).toBe(1);
    const overtimeTeams = new Set(
      Array.from({ length: 16 }, () => nextAttackingTeam({ round: 2 * last, score: [last, last], attackingTeam: 0, attackZoneId: 'x' }, rng)),
    );
    expect(overtimeTeams).toEqual(new Set([0, 1]));
  });

  it('builds the default 5v5: the player in slot 0 of their team, bots cycling the playable operators', () => {
    const roster = defaultRoster('kestrel');
    expect(roster).toHaveLength(2 * MATCH.teamSize);
    const players = roster.filter((r) => r.controller === 'player');
    expect(players).toEqual([{ team: MATCH.playerTeam, operatorId: 'kestrel', controller: 'player' }]);
    expect(roster.filter((r) => r.team === MATCH.playerTeam)[0]).toBe(players[0]);
    for (const team of [0, 1]) expect(roster.filter((r) => r.team === team)).toHaveLength(MATCH.teamSize);
    const botOps = new Set(roster.filter((r) => r.controller === 'bot').map((r) => r.operatorId));
    expect(botOps).toEqual(new Set(PLAYABLE_OPERATORS));
  });
});

describe('elimination match (real Sim)', () => {
  it('spawns a full 5v5 by side: attackers in the drawn attack zone, defenders in the defend zone', async () => {
    const { sim, chars, created } = await eliminationMatch(defaultRoster(PLAYABLE_OPERATORS[0]));
    const m = matchOf(sim);
    expect(ofType(created, 'phase')).toEqual([
      { type: 'phase', tick: 0, phase: 'preRound', round: 1, attackingTeam: m.attackingTeam, endsAtTick: PRE_ROUND },
    ]);
    expect(SALTWORKS_LEVEL.spawnZones?.find((z) => z.id === m.attackZoneId)?.side).toBe('attack');
    untilPhase(sim, 'live', PRE_ROUND + 1);
    const slots = new Map<number, number>();
    for (const e of chars) {
      const slot = slots.get(e.team) ?? 0;
      slots.set(e.team, slot + 1);
      expect(roundSpawnZone(sim.level, m, e.team).side).toBe(sideOf(m, e.team));
      const p = roundSpawnPoint(sim.level, m, e.team, slot).position;
      expect(Math.hypot(e.pos.x - p[0], e.pos.z - p[2])).toBeLessThan(0.05);
      expect(e.grounded).toBe(true);
    }
  });

  it('runs preRound → live on the tick clock, freezing movement and fire but not the look', async () => {
    const { sim, chars } = await eliminationMatch(DUEL);
    const [a] = chars;
    if (!a) throw new Error('missing character');
    const start = { ...a.pos };
    const push = (): Inputs => new Map([[a.id, { moveZ: 1, yaw: 1.2, pitch: 0.1, buttons: BUTTON.fire | BUTTON.sprint | BUTTON.ability1 }]]);
    const frozen = stepUntil(sim, () => sim.state.tick === PRE_ROUND - 1, PRE_ROUND, push);
    expect(matchOf(sim).phase).toBe('preRound');
    expect(matchFrozen(sim.state.match, a.team)).toBe(true);
    expect(Math.hypot(a.pos.x - start.x, a.pos.z - start.z)).toBeLessThan(0.01);
    expect(a.yaw).toBeCloseTo(1.2, 9);
    expect(a.pitch).toBeCloseTo(0.1, 9);
    expect(ofType(frozen, 'shot')).toHaveLength(0);
    expect(ofType(frozen, 'ability')).toHaveLength(0);
    const opening = step(sim, push());
    expect(sim.state.tick).toBe(PRE_ROUND);
    expect(ofType(opening, 'phase')).toEqual([
      { type: 'phase', tick: PRE_ROUND, phase: 'live', round: 1, attackingTeam: matchOf(sim).attackingTeam, endsAtTick: PRE_ROUND + ROUND },
    ]);
    expect(ofType(opening, 'shot')).toHaveLength(1); // the first live tick already fires
    expect(matchFrozen(sim.state.match, a.team)).toBe(false);
    step(sim, push());
    expect(Math.hypot(a.pos.x - start.x, a.pos.z - start.z)).toBeGreaterThan(0);
  });

  it('accepts operator select only during the pre-round freeze', async () => {
    const { sim, chars } = await eliminationMatch(DUEL);
    const [a] = chars;
    if (!a) throw new Error('missing character');
    sim.control({ type: 'selectOperator', entityId: a.id, operatorId: 'kestrel' });
    expect(ofType(step(sim), 'operatorChanged')).toHaveLength(1);
    untilPhase(sim, 'live', PRE_ROUND);
    sim.control({ type: 'selectOperator', entityId: a.id, operatorId: 'heron' });
    expect(ofType(step(sim), 'operatorChanged')).toHaveLength(0);
    expect(a.operatorId).toBe('kestrel');
  });

  it('ends a round by elimination through aimed fire, then resets everyone to a full kit at their side', async () => {
    const roster: RosterEntry[] = [
      { team: 0, operatorId: 'kestrel', controller: 'player' },
      { team: 1, operatorId: 'basalt', controller: 'bot' },
      { team: 1, operatorId: 'wisp', controller: 'bot' },
    ];
    const { sim, chars } = await eliminationMatch(roster, 5);
    const [shooter, v1, v2] = chars;
    if (!shooter || !v1 || !v2) throw new Error('missing characters');
    // Face-off in the open courtyard (teleport is a QA control, accepted in every phase).
    const place = (e: CharacterEntity, x: number, z: number, yawDeg: number): void =>
      sim.control({ type: 'teleport', entityId: e.id, position: vec3(x, 0, z), yaw: yawDeg * DEG2RAD, pitch: 0 });
    place(shooter, 0, 26, 0);
    place(v1, -2, 18, 180);
    place(v2, 2, 18, 180);
    untilPhase(sim, 'live', PRE_ROUND + 1);

    const round = matchOf(sim).round;
    const kills: SimEvent[] = [];
    // Shoot the first victim with the primary; the round goes on while the second one lives.
    kills.push(...stepUntil(sim, () => !v1.alive, secondsToTicks(10), () => new Map([[shooter.id, fireAt(sim, shooter, v1)]])));
    step(sim);
    expect(matchOf(sim).phase).toBe('live');
    // Use Updraft (cooldown) and switch to the secondary mid-round: the reset must undo both.
    step(sim, new Map([[shooter.id, { buttons: BUTTON.selectSecondary | BUTTON.ability1 }]]));
    expect(shooter.activeSlot).toBe(1);
    const updraft = shooter.abilities[0]?.resource;
    expect(updraft?.timer).toBeGreaterThan(0);
    stepUntil(sim, () => shooter.grounded && shooter.dash === null, secondsToTicks(3));
    kills.push(...stepUntil(sim, () => !v2.alive, secondsToTicks(10), () => new Map([[shooter.id, fireAt(sim, shooter, v2)]])));
    expect(ofType(kills, 'kill').map((k) => k.victimId)).toEqual([v1.id, v2.id]);
    expect(ofType(kills, 'roundEnd')).toHaveLength(0); // judged in the next tick's mode step

    const judged = step(sim);
    const m = matchOf(sim);
    expect(ofType(judged, 'roundEnd')).toEqual([
      { type: 'roundEnd', tick: sim.state.tick, round, winner: 0, winnerSide: sideOf(m, 0), reason: 'elimination', score: [1, 0] },
    ]);
    expect(m.phase).toBe('roundEnd');
    expect(m.lastWinner).toBe(0);
    expect(m.phaseEndTick).toBe(sim.state.tick + ROUND_END);
    expect(shooter.weapons[1]?.ammo).toBeLessThan(weaponForSlot(getOperator('kestrel'), WEAPON_SLOTS[1]).magazine);

    // Round end → next round: alive, full health and ammo in both slots, primary in hand,
    // abilities back to their per-round state, standing at the new sides' spawn slots.
    const reset = untilPhase(sim, 'preRound', ROUND_END + 1);
    expect(ofType(reset, 'spawn').map((e) => e.entityId)).toEqual(chars.map((e) => e.id));
    expect(matchOf(sim).round).toBe(round + 1);
    const slots = new Map<number, number>();
    for (const e of chars) {
      const slot = slots.get(e.team) ?? 0;
      slots.set(e.team, slot + 1);
      const op = getOperator(e.operatorId);
      expect(e.alive).toBe(true);
      expect(e.health).toBe(op.maxHealth);
      expect(e.activeSlot).toBe(0);
      expect(e.weapons.map((w) => w.ammo)).toEqual(WEAPON_SLOTS.map((s) => weaponForSlot(op, s).magazine));
      const p = roundSpawnPoint(sim.level, matchOf(sim), e.team, slot).position;
      expect(Math.hypot(e.pos.x - p[0], e.pos.z - p[2])).toBeLessThan(1e-3);
      expect(Math.abs(e.pos.y - p[1])).toBeLessThan(0.01);
      expect(e.yaw).toBeCloseTo((roundSpawnPoint(sim.level, matchOf(sim), e.team, slot).yawDeg) * DEG2RAD, 9);
    }
    expect(shooter.abilities[0]?.resource.timer).toBe(0);
  });

  it('gives a timed-out round to the defenders', async () => {
    const { sim } = await eliminationMatch(DUEL);
    untilPhase(sim, 'live', PRE_ROUND + 1);
    const liveAt = sim.state.tick;
    const events = untilPhase(sim, 'roundEnd', ROUND + 1);
    const m = matchOf(sim);
    const [end] = ofType(events, 'roundEnd');
    expect(sim.state.tick).toBe(liveAt + ROUND);
    expect(end).toMatchObject({ winner: teamOnSide(m, 'defend'), winnerSide: 'defend', reason: 'timeout' });
    expect(m.score[teamOnSide(m, 'defend')]).toBe(1);
    // The result is locked, but nobody is frozen until the next pre-round.
    for (const team of [0, 1]) expect(matchFrozen(m, team)).toBe(false);
  });

  it('gives a round with both sides empty (a mutual wipe) to the defenders at once', async () => {
    // The weapons step resolves shooters one after another, so a same-tick wipe needs area damage
    // (M2); an empty match reaches the same rule through the real mode step.
    const { sim } = await eliminationMatch([]);
    untilPhase(sim, 'live', PRE_ROUND + 1);
    const [end] = ofType(untilPhase(sim, 'roundEnd', 2), 'roundEnd');
    expect(end).toMatchObject({ winner: teamOnSide(matchOf(sim), 'defend'), winnerSide: 'defend', reason: 'elimination' });
  });

  /** Plays a whole duel match where every round runs out of time; returns the per-round log. */
  async function timeoutMatch(seed: number): Promise<{ sim: Sim; rounds: { attackingTeam: number; zone: string; winner: number }[]; end: EventOf<'matchEnd'> }> {
    const { sim } = await eliminationMatch(DUEL, seed);
    const rounds: { attackingTeam: number; zone: string; winner: number }[] = [];
    const maxTicks = 2 * MATCH_FORMAT.roundsToWin * (PRE_ROUND + ROUND + ROUND_END);
    const events = stepUntil(sim, (evs) => {
      for (const e of ofType(evs, 'roundEnd')) {
        const m = matchOf(sim);
        rounds.push({ attackingTeam: m.attackingTeam, zone: m.attackZoneId, winner: e.winner });
      }
      return evs.some((e) => e.type === 'matchEnd');
    }, maxTicks);
    const [end] = ofType(events, 'matchEnd');
    if (!end) throw new Error('no matchEnd');
    return { sim, rounds, end };
  }

  it('swaps sides per MATCH_FORMAT, plays one overtime round at roundsToWin − 1 each, ends the match and freezes', async () => {
    const { sim, rounds, end } = await timeoutMatch(11);
    const swap = MATCH_FORMAT.sideSwapAfterRounds;
    const first = rounds[0]?.attackingTeam ?? -1;
    // Defenders win every timed-out round, so the teams trade wins until the overtime round.
    rounds.forEach((r, i) => {
      if (i < 2 * swap) expect(r.attackingTeam, `round ${i + 1}`).toBe(Math.floor(i / swap) % 2 === 0 ? first : otherTeam(first));
      expect(r.winner, `round ${i + 1}`).toBe(otherTeam(r.attackingTeam));
    });
    expect(rounds).toHaveLength(2 * MATCH_FORMAT.roundsToWin - 1);
    const overtime = rounds[rounds.length - 1];
    expect(end.winner).toBe(overtime?.winner);
    expect([...end.score].sort()).toEqual([MATCH_FORMAT.roundsToWin - 1, MATCH_FORMAT.roundsToWin]);

    // Terminal: no more phases, nobody moves or fires, no operator changes.
    const m = matchOf(sim);
    expect(m.phase).toBe('matchEnd');
    expect(m.phaseEndTick).toBeNull();
    for (const team of [0, 1]) expect(matchFrozen(m, team)).toBe(true);
    const [a] = sim.state.entities;
    if (!a) throw new Error('missing character');
    const at = { ...a.pos };
    sim.control({ type: 'selectOperator', entityId: a.id, operatorId: 'heron' });
    const after: SimEvent[] = [];
    for (let i = 0; i < secondsToTicks(ELIMINATION.roundEndSeconds * 2); i++) {
      after.push(...step(sim, new Map([[a.id, { moveZ: 1, buttons: BUTTON.fire }]])));
    }
    expect(after.filter((e) => e.type !== 'footstep')).toEqual([]);
    expect(Math.hypot(a.pos.x - at.x, a.pos.z - at.z)).toBeLessThan(0.01);
    expect(a.operatorId).not.toBe('heron');
  }, 60_000);

  it('is deterministic per seed; the coin flips and zone draws come from the seed', async () => {
    const run = async (seed: number): Promise<string> => {
      const { sim, rounds } = await timeoutMatch(seed);
      return JSON.stringify({ rounds, match: sim.state.match, entities: sim.state.entities, rng: sim.state.rng });
    };
    expect(await run(21)).toBe(await run(21));
    const draws = await Promise.all(
      Array.from({ length: 12 }, async (_, seed) => matchOf(await Sim.create(SALTWORKS_LEVEL, seed, 'elimination'))),
    );
    expect(new Set(draws.map((m) => m.attackingTeam))).toEqual(new Set([0, 1]));
    expect(new Set(draws.map((m) => m.attackZoneId))).toEqual(
      new Set(SALTWORKS_LEVEL.spawnZones?.filter((z) => z.side === 'attack').map((z) => z.id)),
    );
  }, 60_000);
});
