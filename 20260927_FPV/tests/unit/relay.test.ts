import { describe, expect, it } from 'vitest';
import { createBotController, stepMatch } from '../../src/ai/controller.ts';
import { AI, MATCH, MATCH_FORMAT, operatorPickLimit, PLAYABLE_OPERATORS, RELAY, secondsToTicks, TICK_DT } from '../../src/config/sim.ts';
import { getAbility, getLevel } from '../../src/data/content.ts';
import { RANGE_LEVEL } from '../../src/data/levels/range.ts';
import { SALTWORKS_LEVEL } from '../../src/data/levels/saltworks.ts';
import type { LevelDef } from '../../src/data/schema.ts';
import { BUTTON, type Command } from '../../src/sim/command.ts';
import { cloneVec3, DEG2RAD, vec3, type Vec3 } from '../../src/sim/math.ts';
import { defaultRoster, otherTeam, roundSpawnOptions, sideOf, teamOnSide, type RosterEntry } from '../../src/sim/modes/format.ts';
import { matchAbilityAllowed, matchFrozen, matchSetupWallsUp, MODES } from '../../src/sim/modes/index.ts';
import { canDisrupt, isReconAbility, plantSiteFor, RELAY_RULES, relayOf, uplinkProgress } from '../../src/sim/modes/relay.ts';
import { Sim } from '../../src/sim/sim.ts';
import { applyDamage } from '../../src/sim/systems/health.ts';
import type { CharacterEntity, ControlMessage, RelayMatch, SimEvent } from '../../src/sim/types.ts';
import { abilityWorld } from './support/abilityWorld.ts';
import { fireAt, step, stepUntil, untilPhase, type Inputs } from './support/match.ts';
import { ofType, type EventOf } from './support/world.ts';

// Relay (SPEC §4.1, ADR-0013) on the real Sim with Rapier in Node, driven only by Commands and
// ControlMessages: phases and clocks, the per-team freeze, setup walls, the ability gate, operator
// picks (limit, auto-pick), plant and disrupt with their interrupts, every round result of
// ADR-0013 §6, the match format and determinism. The two "both wiped in one tick" rows run the
// mode rules on a bare context (support/abilityWorld.ts) where both kills can land in one tick.

const T = {
  select: secondsToTicks(RELAY.preRoundSeconds),
  setup: secondsToTicks(RELAY.setupSeconds),
  live: secondsToTicks(RELAY.engagementSeconds),
  uplink: secondsToTicks(RELAY.uplinkSeconds),
  roundEnd: secondsToTicks(RELAY.roundEndSeconds),
  plant: secondsToTicks(RELAY.plantSeconds),
  disrupt: secondsToTicks(RELAY.disruptSeconds),
};
const TO_LIVE = T.select + T.setup;
const LONG_TEST_MS = 120_000;

function matchOf(sim: Sim): RelayMatch {
  const m = relayOf(sim.state.match);
  if (!m) throw new Error('expected a relay match');
  return m;
}

interface Relay {
  sim: Sim;
  m: RelayMatch;
  att: CharacterEntity[];
  def: CharacterEntity[];
  created: SimEvent[];
}

/** A Relay match on Saltworks: attackers then defenders (entity ids in that order) of the given
 *  operators at their side's spawn slots. */
async function relayMatch(attack: readonly string[], defend: readonly string[], seed = 1): Promise<Relay> {
  const sim = await Sim.create(SALTWORKS_LEVEL, seed, 'relay');
  const m = matchOf(sim);
  const entry = (side: 'attack' | 'defend') => (operatorId: string): RosterEntry => ({ team: teamOnSide(m, side), operatorId, controller: 'bot' });
  const roster = [...attack.map(entry('attack')), ...defend.map(entry('defend'))];
  const chars = roundSpawnOptions(sim.level, m, roster).map((o) => sim.spawnCharacter(o));
  return { sim, m, att: chars.filter((e) => e.team === m.attackingTeam), def: chars.filter((e) => e.team !== m.attackingTeam), created: sim.drainEvents() };
}

const place = (sim: Sim, e: CharacterEntity, p: Vec3, yawDeg = 0): void =>
  sim.control({ type: 'teleport', entityId: e.id, position: p, yaw: yawDeg * DEG2RAD, pitch: 0 });

/** The feet position at the centre of a site's floor. */
function siteFloor(level: LevelDef, id: string): Vec3 {
  const s = level.sites?.find((x) => x.id === id);
  if (!s) throw new Error(`no site ${id}`);
  return vec3(s.center[0], s.center[1] - s.size[1] / 2, s.center[2]);
}

const SITE_A = siteFloor(SALTWORKS_LEVEL, 'A');
/** A clear line to SITE_A inside the tank hall, 5 m east of it. */
const SITE_A_SHOOTER = vec3(SITE_A.x + 5, SITE_A.y, SITE_A.z);

const hold = (e: CharacterEntity, buttons: number, extra: Partial<Command> = {}): Inputs => new Map([[e.id, { buttons, ...extra }]]);

/** Teleports `e` onto site A's floor and lets it land (grounded). */
function toSiteA(sim: Sim, e: CharacterEntity): void {
  place(sim, e, SITE_A);
  step(sim);
  step(sim);
}

/** Holds interact for `e` until its plant completes; returns the events. */
const plant = (sim: Sim, e: CharacterEntity): SimEvent[] =>
  stepUntil(sim, (evs) => evs.some((ev) => ev.type === 'uplink' && ev.stage === 'complete'), T.plant + 3, () => hold(e, BUTTON.interact));

/** `shooter` fires at `victim` from `from` until the victim is dead (victim inputs: `victimInput`). */
function kill(sim: Sim, shooter: CharacterEntity, victim: CharacterEntity, from: Vec3, victimInput: Partial<Command> = {}): SimEvent[] {
  place(sim, shooter, from);
  step(sim, new Map([[victim.id, victimInput]]));
  return stepUntil(sim, () => !victim.alive, secondsToTicks(10), () => new Map([[shooter.id, fireAt(sim, shooter, victim)], [victim.id, victimInput]]));
}

/** The attackers plant at site A (attacker `a`, the match in live); returns the uplink tick. */
function plantAtA(r: Relay, a: CharacterEntity): number {
  if (matchOf(r.sim).phase !== 'live') untilPhase(r.sim, 'live', TO_LIVE + 1);
  toSiteA(r.sim, a);
  plant(r.sim, a);
  return r.sim.state.tick;
}

// ── Registry, phases, freeze ────────────────────────────────────────────────

describe('relay: registry and phases', () => {
  it('is registered; Saltworks hosts it, the range does not, a level without setup walls or sites does not', async () => {
    expect(MODES.relay).toBe(RELAY_RULES);
    expect(RELAY_RULES.validateLevel(SALTWORKS_LEVEL)).toEqual([]);
    const range = RELAY_RULES.validateLevel(RANGE_LEVEL).join('\n');
    expect(range).toMatch(/relay needs a 'attack' spawn zone/);
    expect(range).toMatch(/relay needs at least one site/);
    expect(range).toMatch(/relay needs setup walls/);
    const open: LevelDef = { ...SALTWORKS_LEVEL, setupWalls: [] };
    expect(RELAY_RULES.validateLevel(open)).toEqual([`level 'saltworks': relay needs setup walls (the defenders' boundary in setup)`]);
    await expect(Sim.create(RANGE_LEVEL, 1, 'relay')).rejects.toThrow(/cannot host mode 'relay'/);
    // One setup wall per exterior opening of the building (6 on Saltworks), inside the level.
    expect(getLevel('saltworks').setupWalls).toHaveLength(6);
  });

  it('runs operator select → setup → live on the RELAY clocks; the freeze is per team and the walls stand in setup only', async () => {
    const r = await relayMatch(['wisp'], ['basalt']);
    const { sim, m } = r;
    const defenders = otherTeam(m.attackingTeam);
    expect(ofType(r.created, 'phase')).toEqual([{ type: 'phase', tick: 0, phase: 'preRound', round: 1, attackingTeam: m.attackingTeam, endsAtTick: T.select }]);
    expect([matchFrozen(m, m.attackingTeam), matchFrozen(m, defenders), matchSetupWallsUp(m)]).toEqual([true, true, false]);

    const toSetup = untilPhase(sim, 'setup', T.select + 1);
    expect(sim.state.tick).toBe(T.select);
    expect(ofType(toSetup, 'phase')).toEqual([{ type: 'phase', tick: T.select, phase: 'setup', round: 1, attackingTeam: m.attackingTeam, endsAtTick: TO_LIVE }]);
    expect([matchFrozen(m, m.attackingTeam), matchFrozen(m, defenders), matchSetupWallsUp(m)]).toEqual([true, false, true]);

    const toLive = untilPhase(sim, 'live', T.setup + 1);
    expect(sim.state.tick).toBe(TO_LIVE);
    expect(ofType(toLive, 'phase')).toEqual([{ type: 'phase', tick: TO_LIVE, phase: 'live', round: 1, attackingTeam: m.attackingTeam, endsAtTick: TO_LIVE + T.live }]);
    expect([matchFrozen(m, m.attackingTeam), matchFrozen(m, defenders), matchSetupWallsUp(m)]).toEqual([false, false, false]);
  });

  it('operator select is look-only for everyone: no movement, fire, abilities or interact', async () => {
    const r = await relayMatch(['wisp'], ['wisp']);
    const [a] = r.att;
    const [d] = r.def;
    if (!a || !d) throw new Error('missing characters');
    const starts = [cloneVec3(a.pos), cloneVec3(d.pos)];
    const everything = BUTTON.fire | BUTTON.sprint | BUTTON.ability1 | BUTTON.interact | BUTTON.jump;
    const push = (): Inputs =>
      new Map([
        [a.id, { moveZ: 1, yaw: 1.1, pitch: 0.1, buttons: r.sim.state.tick % 2 ? everything : BUTTON.interact }],
        [d.id, { moveX: 1, yaw: -0.4, buttons: r.sim.state.tick % 2 ? everything : 0 }],
      ]);
    const events = stepUntil(r.sim, () => r.sim.state.tick === T.select - 1, T.select, push);
    for (const [i, e] of [a, d].entries()) expect(Math.hypot(e.pos.x - (starts[i]?.x ?? 0), e.pos.z - (starts[i]?.z ?? 0))).toBeLessThan(0.01);
    expect(a.yaw).toBeCloseTo(1.1, 9);
    expect(d.yaw).toBeCloseTo(-0.4, 9);
    expect(events.filter((e) => ['shot', 'ability', 'abilityFailed', 'uplink'].includes(e.type))).toEqual([]);
  });
});

// ── Setup: freeze, gate, walls ──────────────────────────────────────────────

describe('relay: setup', () => {
  it('holds the attackers (look and recon abilities only) and lets the defenders move and use every ability', async () => {
    const r = await relayMatch(['wisp', 'heron'], ['wisp']);
    const [wisp, heron] = r.att;
    const [defender] = r.def;
    if (!wisp || !heron || !defender) throw new Error('missing characters');
    untilPhase(r.sim, 'setup', T.select + 1);
    const at = cloneVec3(wisp.pos);
    const defenderAt = cloneVec3(defender.pos);
    const events: SimEvent[] = [];
    for (let i = 0; i < 30; i++) {
      events.push(
        ...step(
          r.sim,
          new Map([
            [wisp.id, { moveZ: 1, yaw: 0.5, buttons: i % 2 === 0 ? BUTTON.ability1 | BUTTON.fire : 0 }],
            [heron.id, { buttons: BUTTON.ability1 }],
            [defender.id, { moveZ: 1, buttons: i === 6 ? BUTTON.ability1 : 0 }],
          ]),
        ),
      );
    }
    expect(Math.hypot(wisp.pos.x - at.x, wisp.pos.z - at.z)).toBeLessThan(0.01);
    expect(wisp.yaw).toBeCloseTo(0.5, 9);
    expect(ofType(events, 'shot')).toEqual([]);
    const failed = ofType(events, 'abilityFailed');
    expect(failed.length).toBeGreaterThan(0);
    expect(new Set(failed.map((f) => `${f.entityId} ${f.abilityId} ${f.reason}`))).toEqual(new Set([`${wisp.id} wisp_slipstream blocked`]));
    // Sonar Pulse (reveal only) is recon: the attacker channels it; the defender's dash goes.
    expect(ofType(events, 'ability').map((e) => `${e.entityId} ${e.abilityId}`)).toEqual([`${heron.id} heron_sonar`, `${defender.id} wisp_slipstream`]);
    expect(Math.hypot(defender.pos.x - defenderAt.x, defender.pos.z - defenderAt.z)).toBeGreaterThan(1);

    // The gate is derived from the effects and ends with the setup.
    expect(isReconAbility(getAbility('heron_sonar'))).toBe(true);
    for (const id of ['wisp_slipstream', 'kestrel_updraft', 'basalt_brace']) expect(isReconAbility(getAbility(id)), id).toBe(false);
    const slipstream = getAbility('wisp_slipstream');
    expect([matchAbilityAllowed(r.m, wisp, slipstream), matchAbilityAllowed(r.m, defender, slipstream)]).toEqual([false, true]);
    untilPhase(r.sim, 'live', T.setup);
    expect(matchAbilityAllowed(r.m, wisp, slipstream)).toBe(true);
  });

  it('closes the exterior openings for movement while bullets and sight pass; the walls fall when the round goes live', async () => {
    const r = await relayMatch(['basalt'], ['wisp']);
    const [d] = r.def;
    if (!d) throw new Error('missing defender');
    // Inside the lobby, facing out of the main door (south facade at z = −4, 0.4 m thick).
    place(r.sim, d, vec3(0, 0, -6.5), 180);
    untilPhase(r.sim, 'setup', T.select + 1);
    const walkOut = (): Inputs => new Map([[d.id, { moveZ: 1, yaw: Math.PI }]]);
    for (let i = 0; i < secondsToTicks(2); i++) step(r.sim, walkOut());
    expect(d.pos.z).toBeGreaterThan(-5); // walked up to the doorway …
    expect(d.pos.z).toBeLessThan(-4.4); // … and stopped at the wall's inner face
    expect(r.sim.query.lineOfSight(vec3(0, 1.5, -6), vec3(0, 1.5, -2))).toBe(true);
    untilPhase(r.sim, 'live', T.setup, walkOut);
    for (let i = 0; i < secondsToTicks(1); i++) step(r.sim, walkOut());
    expect(d.pos.z).toBeGreaterThan(-3);
  });
});

// ── Operator select ─────────────────────────────────────────────────────────

describe('relay: operator picks', () => {
  const limit = operatorPickLimit();
  const pick = (e: CharacterEntity, operatorId: string): ControlMessage => ({ type: 'selectOperator', entityId: e.id, operatorId });

  it('derives the pick limit from the team size and the playable operators', () => {
    expect(limit).toBe(Math.ceil(MATCH.teamSize / PLAYABLE_OPERATORS.length));
    // The default roster is legal: no team plays an operator more than `limit` times.
    for (const team of [0, 1]) {
      const ops = defaultRoster('basalt').filter((x) => x.team === team).map((x) => x.operatorId);
      for (const id of new Set(ops)) expect(ops.filter((o) => o === id).length).toBeLessThanOrEqual(limit);
    }
  });

  it('accepts picks in operator select within the limit; refuses more, unplayable operators and later phases; Sim.accepts agrees', async () => {
    // limit × basalt, the pickers, and kestrel one short of the limit (2 · limit + 1 ≤ teamSize).
    const r = await relayMatch([...Array<string>(limit).fill('basalt'), 'wisp', 'heron', ...Array<string>(limit - 1).fill('kestrel')], ['wisp']);
    const { sim } = r;
    const wisp = r.att[limit];
    const heron = r.att[limit + 1];
    if (!wisp || !heron) throw new Error('missing attackers');
    expect([sim.accepts(pick(wisp, 'basalt')), sim.accepts(pick(wisp, 'keel')), sim.accepts(pick(wisp, 'kestrel'))]).toEqual([false, false, true]);
    expect(sim.accepts({ type: 'selectOperator', entityId: 999, operatorId: 'kestrel' })).toBe(false);
    expect(sim.accepts({ type: 'teleport', entityId: wisp.id, position: vec3(), yaw: 0, pitch: 0 })).toBe(true);
    // Queue order: the second of two picks of an operator with one place left is refused.
    sim.control(pick(wisp, 'basalt'));
    sim.control(pick(wisp, 'keel'));
    sim.control(pick(wisp, 'kestrel'));
    sim.control(pick(heron, 'kestrel'));
    const changed = ofType(step(sim), 'operatorChanged');
    expect(changed).toEqual([{ type: 'operatorChanged', tick: sim.state.tick, entityId: wisp.id, operatorId: 'kestrel' }]);
    expect([wisp.operatorId, heron.operatorId]).toEqual(['kestrel', 'heron']);
    // Later phases refuse every pick.
    untilPhase(sim, 'setup', T.select);
    expect(sim.accepts(pick(heron, 'wisp'))).toBe(false);
    sim.control(pick(heron, 'wisp'));
    expect(ofType(step(sim), 'operatorChanged')).toEqual([]);
  });

  it('ends operator select with every team within the rules: over-limit and unplayable operators get a seeded legal pick', async () => {
    const run = async (seed: number): Promise<{ r: Relay; changed: EventOf<'operatorChanged'>[] }> => {
      const r = await relayMatch([...Array<string>(limit + 1).fill('basalt'), 'keel'], ['wisp'], seed);
      return { r, changed: ofType(untilPhase(r.sim, 'setup', T.select + 1), 'operatorChanged') };
    };
    const { r, changed } = await run(4);
    const extra = r.att[limit];
    const keel = r.att[limit + 1];
    if (!extra || !keel) throw new Error('missing attackers');
    // The lowest ids keep theirs; the one over the limit and the unplayable one are re-picked.
    expect(changed.map((c) => [c.tick, c.entityId])).toEqual([
      [T.select, extra.id],
      [T.select, keel.id],
    ]);
    const ops = r.att.map((e) => e.operatorId);
    for (const id of ops) {
      expect(PLAYABLE_OPERATORS as readonly string[]).toContain(id);
      expect(ops.filter((o) => o === id).length).toBeLessThanOrEqual(limit);
    }
    expect((await run(4)).changed).toEqual(changed);
  });

  it('bots pick once per operator select after AI.relay.pickDelaySeconds, legally, deterministically and without writing the state', async () => {
    const run = async (seed: number): Promise<{ picks: EventOf<'operatorChanged'>[]; sim: Sim }> => {
      const sim = await Sim.create(SALTWORKS_LEVEL, seed, 'relay');
      const roster = defaultRoster(PLAYABLE_OPERATORS[0] ?? 'basalt').map((x): RosterEntry => ({ ...x, controller: 'bot' }));
      for (const o of roundSpawnOptions(sim.level, matchOf(sim), roster)) sim.spawnCharacter(o);
      const bots = createBotController(sim, sim.state.entities.map((e) => ({ entityId: e.id, brain: { kind: 'combat', tier: 'medium' } })), seed);
      bots.observe(sim.drainEvents());
      const picks: EventOf<'operatorChanged'>[] = [];
      while (matchOf(sim).phase === 'preRound') {
        const before = structuredClone(sim.state);
        const controls = bots.controls(sim.state.tick + 1);
        bots.commands(sim.state.tick + 1);
        expect(sim.state).toEqual(before);
        for (const msg of controls) sim.control(msg);
        const events = sim.step(new Map());
        bots.observe(events);
        picks.push(...ofType(events, 'operatorChanged'));
      }
      return { picks, sim };
    };
    const { picks, sim } = await run(3);
    expect(picks.length).toBeGreaterThan(0);
    expect(new Set(picks.map((p) => p.tick))).toEqual(new Set([secondsToTicks(AI.relay.pickDelaySeconds) + 1]));
    for (const team of [0, 1]) {
      const ops = sim.state.entities.filter((e) => e.team === team).map((e) => e.operatorId);
      for (const id of ops) expect(ops.filter((o) => o === id).length, `team ${team} ${id}`).toBeLessThanOrEqual(limit);
    }
    expect((await run(3)).picks).toEqual(picks);
    // stepMatch queues the same picks.
    const viaStep = await Sim.create(SALTWORKS_LEVEL, 3, 'relay');
    for (const o of roundSpawnOptions(viaStep.level, matchOf(viaStep), defaultRoster(PLAYABLE_OPERATORS[0] ?? 'basalt').map((x): RosterEntry => ({ ...x, controller: 'bot' })))) {
      viaStep.spawnCharacter(o);
    }
    const bots = createBotController(viaStep, viaStep.state.entities.map((e) => ({ entityId: e.id, brain: { kind: 'combat', tier: 'medium' } })), 3);
    bots.observe(viaStep.drainEvents());
    const stepped: EventOf<'operatorChanged'>[] = [];
    while (matchOf(viaStep).phase === 'preRound') stepped.push(...ofType(stepMatch(viaStep, bots, new Map()), 'operatorChanged'));
    expect(stepped).toEqual(picks);
  }, LONG_TEST_MS);
});

// ── The uplink ──────────────────────────────────────────────────────────────

describe('relay: plant and disrupt', () => {
  it('plants: interact held in a site starts a channel next tick, it completes after RELAY.plantSeconds and the uplink runs', async () => {
    const r = await relayMatch(['wisp'], ['basalt']);
    const { sim, m } = r;
    const [a] = r.att;
    if (!a) throw new Error('missing attacker');
    untilPhase(sim, 'live', TO_LIVE + 1);
    toSiteA(sim, a);
    expect(plantSiteFor(sim.level, m, a)?.id).toBe('A');
    const t0 = sim.state.tick;
    expect(ofType(step(sim, hold(a, BUTTON.interact)), 'uplink')).toEqual([]); // read from lastButtons next tick
    const started = ofType(step(sim, hold(a, BUTTON.interact)), 'uplink');
    const start = t0 + 2;
    expect(started).toMatchObject([{ type: 'uplink', tick: start, action: 'plant', stage: 'start', entityId: a.id, siteId: 'A' }]);
    expect(Math.hypot((started[0]?.pos.x ?? 0) - a.pos.x, (started[0]?.pos.z ?? 0) - a.pos.z)).toBeLessThan(1e-3);
    expect(m.channel).toEqual({ action: 'plant', entityId: a.id, siteId: 'A', startTick: start, endTick: start + T.plant });
    // A channeller holding interact neither moves nor fires (the look stays free).
    const at = cloneVec3(a.pos);
    for (let i = 0; i < T.plant / 2; i++) {
      const evs = step(sim, hold(a, BUTTON.interact | BUTTON.fire | BUTTON.sprint, { moveZ: 1, yaw: 0.3 }));
      expect(ofType(evs, 'shot')).toEqual([]);
    }
    expect(Math.hypot(a.pos.x - at.x, a.pos.z - at.z)).toBeLessThan(0.01);
    expect(a.yaw).toBeCloseTo(0.3, 9);
    expect(uplinkProgress(m, sim.state.tick)).toBeCloseTo((sim.state.tick - start) / T.plant, 9);
    const done = plant(sim, a);
    expect(sim.state.tick).toBe(start + T.plant);
    const [complete] = ofType(done, 'uplink');
    expect(complete).toMatchObject({ action: 'plant', stage: 'complete', entityId: a.id, siteId: 'A' });
    expect(ofType(done, 'phase')).toEqual([{ type: 'phase', tick: start + T.plant, phase: 'uplink', round: 1, attackingTeam: m.attackingTeam, endsAtTick: start + T.plant + T.uplink }]);
    // Planted where the planter stood when the channel completed (the complete event's feet).
    expect(m.uplink).toEqual({ siteId: 'A', pos: complete?.pos });
    expect([m.channel, uplinkProgress(m, sim.state.tick), m.phase]).toEqual([null, null, 'uplink']);
  });

  it('cancels on release, on leaving the site and on death; a cancel loses the progress', async () => {
    const r = await relayMatch(['wisp'], ['basalt']);
    const { sim, m } = r;
    const [a] = r.att;
    const [d] = r.def;
    if (!a || !d) throw new Error('missing characters');
    untilPhase(sim, 'live', TO_LIVE + 1);
    toSiteA(sim, a);
    const cancelled = (events: SimEvent[]): EventOf<'uplink'>[] => ofType(events, 'uplink').filter((e) => e.stage === 'cancel');

    // Release: cancelled the tick after, and a new press starts from zero.
    for (let i = 0; i < 60; i++) step(sim, hold(a, BUTTON.interact));
    const first = m.channel;
    expect(first?.action).toBe('plant');
    step(sim);
    expect(cancelled(step(sim))).toHaveLength(1);
    expect(m.channel).toBeNull();
    step(sim, hold(a, BUTTON.interact));
    step(sim, hold(a, BUTTON.interact));
    expect(m.channel?.endTick).toBe(sim.state.tick + T.plant);

    // Leaving the site (a teleport: movement is locked while channelling).
    place(sim, a, vec3(SITE_A.x, SITE_A.y, SITE_A.z + 12));
    const left = [...step(sim, hold(a, BUTTON.interact)), ...step(sim, hold(a, BUTTON.interact))];
    expect(cancelled(left)).toHaveLength(1);
    expect(plantSiteFor(sim.level, m, a)).toBeNull();

    // Death: the defender shoots the planter mid-channel.
    toSiteA(sim, a);
    step(sim, hold(a, BUTTON.interact));
    step(sim, hold(a, BUTTON.interact));
    expect(m.channel?.entityId).toBe(a.id);
    const fight = kill(sim, d, a, SITE_A_SHOOTER, { buttons: BUTTON.interact });
    expect(ofType(fight, 'kill')).toHaveLength(1);
    const after = [...fight, ...step(sim)];
    expect(cancelled(after)).toHaveLength(1);
    expect(m.channel).toBeNull();
  }, LONG_TEST_MS);

  it('never plants outside a site, by a defender, or before the round is live', async () => {
    const r = await relayMatch(['wisp'], ['basalt']);
    const { sim, m } = r;
    const [a] = r.att;
    const [d] = r.def;
    if (!a || !d) throw new Error('missing characters');
    const tries: SimEvent[] = [];
    // In setup (the defender in the site, the attacker frozen) nothing starts.
    untilPhase(sim, 'setup', T.select + 1);
    toSiteA(sim, d);
    for (let i = 0; i < 30; i++) tries.push(...step(sim, new Map([[d.id, { buttons: BUTTON.interact }], [a.id, { buttons: BUTTON.interact }]])));
    untilPhase(sim, 'live', T.setup);
    // Live: a defender in the site, an attacker outside it.
    place(sim, a, vec3(0, 0, 20));
    for (let i = 0; i < 30; i++) tries.push(...step(sim, new Map([[d.id, { buttons: BUTTON.interact }], [a.id, { buttons: BUTTON.interact }]])));
    expect(ofType(tries, 'uplink')).toEqual([]);
    expect([plantSiteFor(sim.level, m, d), plantSiteFor(sim.level, m, a), canDisrupt(m, d)]).toEqual([null, null, false]);
  });

  it('disrupts: a defender within RELAY.disruptRadiusM of the uplink holds interact for RELAY.disruptSeconds; the defenders take the round', async () => {
    const r = await relayMatch(['wisp'], ['basalt']);
    const { sim, m } = r;
    const [a] = r.att;
    const [d] = r.def;
    if (!a || !d) throw new Error('missing characters');
    plantAtA(r, a);
    const uplink = m.uplink;
    if (!uplink) throw new Error('no uplink');
    // Every attacker dead: the round goes on (the defenders must disrupt, ADR-0013 Q2).
    const fight = kill(sim, d, a, SITE_A_SHOOTER);
    const more = [...fight, ...step(sim), ...step(sim)];
    expect(ofType(more, 'roundEnd')).toEqual([]);
    expect(m.phase).toBe('uplink');
    // Too far away: nothing starts.
    place(sim, d, vec3(uplink.pos.x + RELAY.disruptRadiusM + 1, uplink.pos.y, uplink.pos.z));
    step(sim);
    step(sim);
    for (let i = 0; i < 10; i++) expect(ofType(step(sim, hold(d, BUTTON.interact)), 'uplink')).toEqual([]);
    place(sim, d, vec3(uplink.pos.x + RELAY.disruptRadiusM / 2, uplink.pos.y, uplink.pos.z));
    step(sim);
    step(sim);
    expect(canDisrupt(m, d)).toBe(true);
    const events = stepUntil(sim, (evs) => evs.some((e) => e.type === 'roundEnd'), T.disrupt + 3, () => hold(d, BUTTON.interact));
    const [start] = ofType(events, 'uplink');
    expect(start).toMatchObject({ action: 'disrupt', stage: 'start', entityId: d.id, siteId: 'A' });
    expect(ofType(events, 'uplink').map((e) => e.stage)).toEqual(['start', 'complete']);
    expect(sim.state.tick).toBe((start?.tick ?? 0) + T.disrupt);
    expect(ofType(events, 'roundEnd')).toEqual([
      { type: 'roundEnd', tick: sim.state.tick, round: 1, winner: d.team, winnerSide: 'defend', reason: 'disrupted', score: d.team === 0 ? [1, 0] : [0, 1] },
    ]);
    expect(m.phase).toBe('roundEnd');
  }, LONG_TEST_MS);
});

// ── Round results (ADR-0013 §6) ─────────────────────────────────────────────

describe('relay: round results', () => {
  const resultOf = (events: SimEvent[]): Omit<EventOf<'roundEnd'>, 'tick' | 'score' | 'round' | 'type'> | undefined => {
    const [end] = ofType(events, 'roundEnd');
    return end && { winner: end.winner, winnerSide: end.winnerSide, reason: end.reason };
  };

  it('setup: a missing side loses at once by elimination (decideRound without the clock); both missing → mutualWipeWinner', async () => {
    const alone = await relayMatch(['wisp'], []);
    const events = untilPhase(alone.sim, 'roundEnd', T.select + 2);
    expect(alone.sim.state.tick).toBe(T.select + 1);
    expect(resultOf(events)).toEqual({ winner: alone.m.attackingTeam, winnerSide: 'attack', reason: 'elimination' });
    const empty = await relayMatch([], []);
    const side = MATCH_FORMAT.mutualWipeWinner;
    expect(resultOf(untilPhase(empty.sim, 'roundEnd', T.select + 2))).toEqual({ winner: teamOnSide(empty.m, side), winnerSide: side, reason: 'elimination' });
  });

  it('live: a wiped side loses by elimination', async () => {
    const r = await relayMatch(['wisp'], ['basalt']);
    const [a] = r.att;
    const [d] = r.def;
    if (!a || !d) throw new Error('missing characters');
    untilPhase(r.sim, 'live', TO_LIVE + 1);
    place(r.sim, d, SITE_A);
    const fight = kill(r.sim, a, d, SITE_A_SHOOTER);
    expect(resultOf(fight)).toBeUndefined(); // judged in the next tick's mode step
    expect(resultOf(step(r.sim))).toEqual({ winner: a.team, winnerSide: 'attack', reason: 'elimination' });
  }, LONG_TEST_MS);

  it('live: the clock gives the round to MATCH_FORMAT.timeoutWinner even while a plant is being channelled', async () => {
    const r = await relayMatch(['wisp'], ['basalt']);
    const [a] = r.att;
    if (!a) throw new Error('missing attacker');
    untilPhase(r.sim, 'live', TO_LIVE + 1);
    const end = r.m.phaseEndTick ?? 0;
    toSiteA(r.sim, a);
    while (r.sim.state.tick < end - T.plant / 2) step(r.sim);
    const events = stepUntil(r.sim, (evs) => evs.some((e) => e.type === 'roundEnd'), T.plant, () => hold(a, BUTTON.interact));
    expect(r.sim.state.tick).toBe(end);
    expect(ofType(events, 'uplink').map((e) => e.stage)).toEqual(['start', 'cancel']);
    const side = MATCH_FORMAT.timeoutWinner;
    expect(resultOf(events)).toEqual({ winner: teamOnSide(r.m, side), winnerSide: side, reason: 'timeout' });
  }, LONG_TEST_MS);

  it("live: a plant completing on the clock's last tick counts (the channel before the clock)", async () => {
    const r = await relayMatch(['wisp'], ['basalt']);
    const [a] = r.att;
    if (!a) throw new Error('missing attacker');
    untilPhase(r.sim, 'live', TO_LIVE + 1);
    const end = r.m.phaseEndTick ?? 0;
    toSiteA(r.sim, a);
    // The channel starts at end − plant: its first held command is the tick before.
    while (r.sim.state.tick < end - T.plant - 2) step(r.sim);
    const events = stepUntil(r.sim, (evs) => evs.some((e) => e.type === 'phase'), T.plant + 3, () => hold(a, BUTTON.interact));
    expect(r.sim.state.tick).toBe(end);
    expect(ofType(events, 'roundEnd')).toEqual([]);
    expect(r.m.phase).toBe('uplink');
  }, LONG_TEST_MS);

  it('uplink: the clock running out wins for the attackers', async () => {
    const r = await relayMatch(['wisp'], ['basalt']);
    const [a] = r.att;
    if (!a) throw new Error('missing attacker');
    const planted = plantAtA(r, a);
    const events = untilPhase(r.sim, 'roundEnd', T.uplink + 1);
    expect(r.sim.state.tick).toBe(planted + T.uplink);
    expect(resultOf(events)).toEqual({ winner: a.team, winnerSide: 'attack', reason: 'uplink' });
  }, LONG_TEST_MS);

  it("uplink: a disrupt completing on the clock's last tick wins for the defenders", async () => {
    const r = await relayMatch(['wisp'], ['basalt']);
    const [a] = r.att;
    const [d] = r.def;
    if (!a || !d) throw new Error('missing characters');
    plantAtA(r, a);
    const end = r.m.phaseEndTick ?? 0;
    const pos = r.m.uplink?.pos ?? SITE_A;
    place(r.sim, d, vec3(pos.x + 1, pos.y, pos.z));
    while (r.sim.state.tick < end - T.disrupt - 2) step(r.sim);
    const events = stepUntil(r.sim, (evs) => evs.some((e) => e.type === 'roundEnd'), T.disrupt + 3, () => hold(d, BUTTON.interact));
    expect(r.sim.state.tick).toBe(end);
    expect(resultOf(events)).toEqual({ winner: d.team, winnerSide: 'defend', reason: 'disrupted' });
  }, LONG_TEST_MS);

  it('uplink: every defender dead wins for the attackers', async () => {
    const r = await relayMatch(['wisp'], ['basalt']);
    const [a] = r.att;
    const [d] = r.def;
    if (!a || !d) throw new Error('missing characters');
    plantAtA(r, a);
    place(r.sim, d, vec3(SITE_A.x - 3, SITE_A.y, SITE_A.z));
    const fight = kill(r.sim, a, d, SITE_A_SHOOTER);
    expect(resultOf([...fight, ...step(r.sim)])).toEqual({ winner: a.team, winnerSide: 'attack', reason: 'elimination' });
  }, LONG_TEST_MS);

  // Both sides' last members dying in one tick: the mode rules on a bare context, both kills
  // through the real damage path between two mode steps.
  async function rulesWorld(): Promise<{ m: RelayMatch; a: CharacterEntity; d: CharacterEntity; tick: () => SimEvent[]; killBoth: () => void; until: (phase: RelayMatch['phase']) => void }> {
    const w = await abilityWorld(SALTWORKS_LEVEL, 1);
    const match = RELAY_RULES.initialMatch(w.ctx);
    w.ctx.state.match = match;
    const m = relayOf(match);
    if (!m) throw new Error('expected a relay match');
    const a = w.add('wisp', m.attackingTeam, SITE_A);
    const d = w.add('basalt', otherTeam(m.attackingTeam), vec3(SITE_A.x + 5, 0, SITE_A.z));
    const tick = (): SimEvent[] => {
      w.ctx.state.tick += 1;
      RELAY_RULES.tick(w.ctx, TICK_DT);
      return w.drain();
    };
    const hit = (victim: CharacterEntity, attacker: CharacterEntity): void =>
      applyDamage(w.ctx, attacker, victim, {
        amount: victim.health,
        zone: 'torso',
        point: cloneVec3(victim.pos),
        distance: 0,
        cause: { kind: 'weapon', weaponId: attacker.weapons[0]?.weaponId ?? '' },
        sourcePos: cloneVec3(attacker.pos),
      });
    return {
      m,
      a,
      d,
      tick,
      killBoth: () => {
        hit(a, d);
        hit(d, a);
      },
      until: (phase) => {
        while (m.phase !== phase) tick();
      },
    };
  }

  it('live: both sides wiped in one tick → MATCH_FORMAT.mutualWipeWinner by elimination', async () => {
    const w = await rulesWorld();
    w.until('live');
    w.killBoth();
    const side = MATCH_FORMAT.mutualWipeWinner;
    expect(resultOf(w.tick())).toEqual({ winner: teamOnSide(w.m, side), winnerSide: side, reason: 'elimination' });
  });

  it('uplink: both sides wiped in one tick → the attackers (the defenders can no longer disrupt)', async () => {
    const w = await rulesWorld();
    w.until('live');
    // The planter stands on site A holding interact (what the movement and command steps leave).
    w.a.grounded = true;
    w.a.lastButtons = BUTTON.interact;
    w.until('uplink');
    w.killBoth();
    expect(resultOf(w.tick())).toEqual({ winner: w.a.team, winnerSide: 'attack', reason: 'elimination' });
  });
});

// ── Match format, determinism ───────────────────────────────────────────────

describe('relay: match', () => {
  /** A 1v1 Relay match in which every round runs out of time; the per-round log. */
  async function timeoutMatch(seed: number): Promise<{ sim: Sim; rounds: { attackingTeam: number; zone: string; winner: number }[]; end: EventOf<'matchEnd'> }> {
    const r = await relayMatch(['wisp'], ['basalt'], seed);
    const rounds: { attackingTeam: number; zone: string; winner: number }[] = [];
    const maxTicks = 2 * MATCH_FORMAT.roundsToWin * (TO_LIVE + T.live + T.roundEnd);
    const events = stepUntil(r.sim, (evs) => {
      for (const e of ofType(evs, 'roundEnd')) rounds.push({ attackingTeam: r.m.attackingTeam, zone: r.m.attackZoneId, winner: e.winner });
      return evs.some((e) => e.type === 'matchEnd');
    }, maxTicks);
    const [end] = ofType(events, 'matchEnd');
    if (!end) throw new Error('no matchEnd');
    return { sim: r.sim, rounds, end };
  }

  it('swaps sides per MATCH_FORMAT, plays one overtime round, ends the match and freezes everyone', async () => {
    const { sim, rounds, end } = await timeoutMatch(11);
    const swap = MATCH_FORMAT.sideSwapAfterRounds;
    const first = rounds[0]?.attackingTeam ?? -1;
    rounds.forEach((x, i) => {
      if (i < 2 * swap) expect(x.attackingTeam, `round ${i + 1}`).toBe(Math.floor(i / swap) % 2 === 0 ? first : otherTeam(first));
      expect(x.winner, `round ${i + 1}`).toBe(otherTeam(x.attackingTeam));
    });
    expect(rounds).toHaveLength(2 * MATCH_FORMAT.roundsToWin - 1);
    expect(end.winner).toBe(rounds.at(-1)?.winner);
    const m = matchOf(sim);
    expect([m.phase, m.phaseEndTick, m.channel, m.uplink]).toEqual(['matchEnd', null, null, null]);
    for (const team of [0, 1]) expect(matchFrozen(m, team)).toBe(true);
  }, LONG_TEST_MS);

  it('resets the uplink and the channel for the next round and respawns everyone at the new sides', async () => {
    const r = await relayMatch(['wisp'], ['basalt']);
    const [a] = r.att;
    if (!a) throw new Error('missing attacker');
    plantAtA(r, a);
    untilPhase(r.sim, 'roundEnd', T.uplink + 1);
    const reset = untilPhase(r.sim, 'preRound', T.roundEnd + 1);
    expect(ofType(reset, 'spawn')).toHaveLength(2);
    expect([r.m.round, r.m.uplink, r.m.channel]).toEqual([2, null, null]);
    for (const e of [...r.att, ...r.def]) expect(sideOf(r.m, e.team) === 'attack' ? e.pos.z > 20 : e.pos.z < -20).toBe(true);
  }, LONG_TEST_MS);

  it('is deterministic per seed', async () => {
    const run = async (seed: number): Promise<string> => {
      const { sim, rounds } = await timeoutMatch(seed);
      return JSON.stringify({ rounds, match: sim.state.match, entities: sim.state.entities, rng: sim.state.rng });
    };
    expect(await run(21)).toBe(await run(21));
  }, LONG_TEST_MS);
});
