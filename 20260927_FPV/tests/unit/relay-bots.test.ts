import { describe, expect, it } from 'vitest';
import { createTacticalMap, type TacticalMap } from '../../src/ai/brain.ts';
import { createBotController, stepMatch, type InspectableBotController } from '../../src/ai/controller.ts';
import { createNavGraph } from '../../src/ai/nav/graph.ts';
import { holdsChannel } from '../../src/ai/objective.ts';
import type { BotController, BrainSpec } from '../../src/ai/types.ts';
import { AI, MATCH_FORMAT, PLAYABLE_OPERATORS, RELAY, secondsToTicks, TICK_DT } from '../../src/config/sim.ts';
import { getAbility, getOperator } from '../../src/data/content.ts';
import { SALTWORKS_LEVEL } from '../../src/data/levels/saltworks.ts';
import type { Side } from '../../src/data/schema.ts';
import { ABILITY_BUTTONS, BUTTON, type Command } from '../../src/sim/command.ts';
import { fromTuple, vec3, type Vec3 } from '../../src/sim/math.ts';
import { defaultRoster, roundSpawnOptions, sideOf, teamOnSide, type RosterEntry } from '../../src/sim/modes/format.ts';
import { isReconAbility, relayOf } from '../../src/sim/modes/relay.ts';
import { Sim } from '../../src/sim/sim.ts';
import type { CharacterEntity, EntityId, MatchState, RelayMatch, RoundEndReason, SimEvent } from '../../src/sim/types.ts';
import { ofType, type EventOf } from './support/world.ts';

// Bots playing Relay's objective (ADR-0013 §7/§13) on Saltworks through the real Sim and the shared
// stepMatch in Node: attackers push their target site, one plants, the rest guard; defenders
// rotate to a heard plant and disrupt an uplink once no attacker stands in the way; the bots'
// setup (attackers frozen and never pressing a refused ability, defenders on posts at both sites
// using their placeables); a full bot-only match to matchEnd (side swap, overtime) without errors
// or stuck bots, with its round log and the controller's cost; determinism per seed; the
// channel-keeping rule. Scripted characters without a brain get their commands as `external`.

const LONG_TEST_MS = 120_000;
const MEDIUM: BrainSpec = { kind: 'combat', tier: 'medium' };
const T = {
  toLive: secondsToTicks(RELAY.preRoundSeconds + RELAY.setupSeconds),
  setup: secondsToTicks(RELAY.setupSeconds),
  live: secondsToTicks(RELAY.engagementSeconds),
  uplink: secondsToTicks(RELAY.uplinkSeconds),
  plant: secondsToTicks(RELAY.plantSeconds),
  roundEnd: secondsToTicks(RELAY.roundEndSeconds),
};
/** SPEC §13: any site is reachable from the attacker edge in about 20 s; plus the plant. */
const PLANT_WITHIN_SECONDS = 25 + RELAY.plantSeconds;
/** Above Saltworks' office ceiling: an upper-storey space closed on every side (no opening in its
 *  walls above the ground storey) — a character parked there is never seen, heard or reached. */
const HIDDEN = vec3(-14, 4, -8);
/** A bot that should be moving but stays within STUCK_RADIUS_M this long is stuck: longer than
 *  the nav's whole recovery (as in match.test.ts). */
const STUCK_TICKS = secondsToTicks(AI.nav.stuckWindowSeconds * (AI.nav.maxStuckRetries + 2));
const STUCK_RADIUS_M = 1;
/** Longest possible match: every round to both clocks, one overtime round. */
const MAX_MATCH_TICKS =
  (2 * (MATCH_FORMAT.roundsToWin - 1) + 1) * secondsToTicks(RELAY.preRoundSeconds + RELAY.setupSeconds + RELAY.engagementSeconds + RELAY.uplinkSeconds + RELAY.roundEndSeconds);

interface Member {
  operatorId: string;
  /** Driven by a medium combat bot; false: a scripted character (commands via `external`). */
  bot: boolean;
}

interface RelayRun {
  sim: Sim;
  bots: InspectableBotController;
  m: RelayMatch;
  map: TacticalMap;
  side: Record<Side, CharacterEntity[]>;
  team: Record<Side, number>;
  /** What stepMatch drives: the controller, or (picks off) the controller without its operator
   *  picks, so the given roster plays. */
  driver: BotController;
}

function matchOf(sim: Sim): RelayMatch {
  const m = relayOf(sim.state.match);
  if (!m) throw new Error('expected a relay match');
  return m;
}

/** A Relay match on Saltworks: the members of each side at their round spawns (attackers first in
 *  entity-id order), the bots among them on one controller (`picks`: with their operator picks). */
async function relayRun(seed: number, attack: readonly Member[], defend: readonly Member[], picks = true): Promise<RelayRun> {
  const sim = await Sim.create(SALTWORKS_LEVEL, seed, 'relay');
  const m = matchOf(sim);
  const team: Record<Side, number> = { attack: teamOnSide(m, 'attack'), defend: teamOnSide(m, 'defend') };
  const entry = (s: Side) => (x: Member): RosterEntry => ({ team: team[s], operatorId: x.operatorId, controller: 'bot' });
  const members = [...attack, ...defend];
  const chars = roundSpawnOptions(sim.level, m, [...attack.map(entry('attack')), ...defend.map(entry('defend'))]).map((o) => sim.spawnCharacter(o));
  const slots = chars.flatMap((e, i) => (members[i]?.bot ? [{ entityId: e.id, brain: MEDIUM }] : []));
  const bots = createBotController(sim, slots, seed);
  bots.observe(sim.drainEvents());
  const side = { attack: chars.filter((e) => e.team === team.attack), defend: chars.filter((e) => e.team === team.defend) };
  const driver: BotController = picks ? bots : { controls: () => [], commands: (t) => bots.commands(t), observe: (evs) => bots.observe(evs) };
  return { sim, bots, m, map: createTacticalMap(sim, createNavGraph(sim)), side, team, driver };
}

const bots = (n: number, from: readonly string[] = PLAYABLE_OPERATORS): Member[] =>
  Array.from({ length: n }, (_, i) => ({ operatorId: from[i % from.length] ?? 'wisp', bot: true }));

/** Commands for scripted characters: `buttons` held, no movement, the current look. */
function hold(sim: Sim, ids: readonly EntityId[], buttons = 0): Map<EntityId, Command> {
  const out = new Map<EntityId, Command>();
  for (const id of ids) {
    const e = sim.getCharacter(id);
    if (e?.alive) out.set(id, { tick: sim.state.tick + 1, moveX: 0, moveZ: 0, yaw: e.yaw, pitch: e.pitch, buttons });
  }
  return out;
}

/** Steps the match (stepMatch) until `done` holds after a tick, or throws after `maxTicks`. */
function until(r: RelayRun, done: (events: SimEvent[]) => boolean, maxTicks: number, external: () => ReadonlyMap<EntityId, Command> = () => new Map()): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < maxTicks; i++) {
    const events = stepMatch(r.sim, r.driver, external());
    all.push(...events);
    if (done(events)) return all;
  }
  throw new Error(`condition not reached within ${maxTicks} ticks`);
}

/** Steps the match `ticks` times. */
function advance(r: RelayRun, ticks: number, external: () => ReadonlyMap<EntityId, Command> = () => new Map()): void {
  for (let i = 0; i < ticks; i++) stepMatch(r.sim, r.driver, external());
}

const untilPhase = (r: RelayRun, phase: RelayMatch['phase'], maxTicks: number, external?: () => ReadonlyMap<EntityId, Command>): SimEvent[] =>
  until(r, (evs) => evs.some((e) => e.type === 'phase' && e.phase === phase), maxTicks, external);

const park = (sim: Sim, e: CharacterEntity, p: Vec3): void => sim.control({ type: 'teleport', entityId: e.id, position: p, yaw: 0, pitch: 0 });

/** The feet position at the centre of a site's floor. */
function siteFloor(id: string): Vec3 {
  const s = SALTWORKS_LEVEL.sites?.find((x) => x.id === id);
  if (!s) throw new Error(`no site ${id}`);
  return vec3(s.center[0], s.center[1] - s.size[1] / 2, s.center[2]);
}

const flat = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.z - b.z);

// ── Attackers ───────────────────────────────────────────────────────────────

describe('relay bots: attackers', () => {
  it('push their target site: the first there plants, the others guard its nodes; the uplink runs out', async () => {
    // No Heron (and no bot picks, which would bring one): its Sonar Pulse would reveal the parked
    // defender through the walls, a lead to follow.
    const r = await relayRun(3, bots(5, ['basalt', 'wisp', 'kestrel']), [{ operatorId: 'basalt', bot: false }], false);
    const [parked] = r.side.defend;
    if (!parked) throw new Error('missing defender');
    park(r.sim, parked, HIDDEN);
    untilPhase(r, 'live', T.toLive + 1);
    const live = r.sim.state.tick;
    const target = r.bots.plan(r.team.attack)?.targetSite ?? null;
    if (target === null) throw new Error('no target site');

    const started = until(r, (evs) => evs.some((e) => e.type === 'uplink' && e.stage === 'complete'), secondsToTicks(PLANT_WITHIN_SECONDS));
    const [start] = ofType(started, 'uplink');
    const planter = start?.entityId ?? -1;
    expect(start).toMatchObject({ action: 'plant', stage: 'start', siteId: target });
    expect(ofType(started, 'uplink').map((e) => e.stage)).toEqual(['start', 'complete']);
    expect(r.bots.plan(r.team.attack)?.objective.planter).toBe(planter);
    expect(r.m.uplink?.siteId).toBe(target);
    const plantedAfter = (r.sim.state.tick - live) * TICK_DT;

    // With no enemy about, every attacker ends up guarding a node of the site, spread over it
    // (five bots, four nodes: a node none can reach without passing a guard stays free).
    until(r, () => r.side.attack.every((e) => guardsSite(r, e, target)), secondsToTicks(20));
    const spots = new Set(r.side.attack.map((e) => r.bots.brain(e.id)?.task?.node));
    expect(spots.size).toBeGreaterThan(1);
    for (const node of spots) expect(r.map.graph.node(node ?? '').site).toBe(target);
    const end = ofType(untilPhase(r, 'roundEnd', T.uplink + 1), 'roundEnd');
    expect(end).toMatchObject([{ winner: r.team.attack, reason: 'uplink' }]);
    console.info(`attackers (seed 3): target ${target}, planter ${planter} planted ${plantedAfter.toFixed(1)} s into the engagement; guards on ${[...spots].join(', ')}`);
  }, LONG_TEST_MS);
});

/** Arrived at its task's node of `site` with a `guard` task (on it, or next to a teammate on it). */
function guardsSite(r: RelayRun, e: CharacterEntity, site: string): boolean {
  const b = r.bots.brain(e.id);
  return b?.state === 'objective' && b.task?.kind === 'guard' && b.task.siteId === site && b.task.node !== null && b.arrivedTick !== null;
}

// ── Defenders ───────────────────────────────────────────────────────────────

describe('relay bots: defenders', () => {
  it('rotate to a site when they hear a plant start there (the team alarm)', async () => {
    const r = await relayRun(4, [{ operatorId: 'wisp', bot: false }, { operatorId: 'basalt', bot: false }], bots(5));
    const [planter, parked] = r.side.attack;
    if (!planter || !parked) throw new Error('missing attackers');
    park(r.sim, parked, HIDDEN);
    untilPhase(r, 'live', T.toLive + 1);
    park(r.sim, planter, siteFloor('A'));
    const planting = (): Map<EntityId, Command> => hold(r.sim, [planter.id], BUTTON.interact);
    const [start] = ofType(until(r, (evs) => evs.some((e) => e.type === 'uplink' && e.stage === 'start'), 10, planting), 'uplink');
    expect(start).toMatchObject({ action: 'plant', siteId: 'A' });
    const siteA = fromTuple(SALTWORKS_LEVEL.sites?.find((s) => s.id === 'A')?.center ?? [0, 0, 0]);
    const before = new Map(r.side.defend.map((e) => [e.id, flat(e.pos, siteA)] as const));
    const postedAt = (e: CharacterEntity): string | null => {
      const b = r.bots.brain(e.id);
      const node = b?.role === 'hold' ? (b.post?.node ?? null) : null;
      return node === null ? null : (r.map.siteOf.get(node) ?? null);
    };
    const away = r.side.defend.filter((e) => postedAt(e) !== 'A');
    expect(away.length).toBeGreaterThan(0);

    // The team knows (from the start sound, or from seeing the planter on the site first) within
    // a think cycle, its members the callout delay later …
    if (!r.bots.plan(r.team.defend)?.objective.alarm) until(r, () => !!r.bots.plan(r.team.defend)?.objective.alarm, AI.brain.thinkIntervalTicks + 1, planting);
    const alarm = r.bots.plan(r.team.defend)?.objective.alarm;
    expect(alarm?.siteId).toBe('A');
    expect(alarm?.readableTick ?? Infinity).toBeLessThanOrEqual((start?.tick ?? 0) + AI.perception.calloutDelayTicks + AI.brain.thinkIntervalTicks);
    // … and the defenders posted elsewhere head for site A.
    const rotateSeconds = 8;
    advance(r, secondsToTicks(rotateSeconds), planting);
    const log: string[] = [];
    for (const e of away) {
      const was = before.get(e.id) ?? 0;
      const now = flat(e.pos, siteA);
      log.push(`${e.id} ${was.toFixed(1)} → ${now.toFixed(1)} m${e.alive ? '' : ' (dead)'}`);
      if (e.alive) expect(now, `defender ${e.id}`).toBeLessThan(Math.max(was - 5, AI.brain.holdInvestigateM));
    }
    console.info(`defenders rotating to A (seed 4, ${rotateSeconds} s after the plant start): ${log.join('; ')}`);
  }, LONG_TEST_MS);

  it('disrupt a planted uplink once the attackers are dead: the nearest calm defender, the round goes to the defenders', async () => {
    const r = await relayRun(5, [{ operatorId: 'wisp', bot: false }], bots(5));
    const [planter] = r.side.attack;
    if (!planter) throw new Error('missing attacker');
    const defenders = r.side.defend.map((e) => e.id);
    untilPhase(r, 'live', T.toLive + 1);
    // Scripted plant at site A while the defenders' bots stand still (their commands overridden).
    park(r.sim, planter, siteFloor('A'));
    const planting = (): Map<EntityId, Command> => new Map([...hold(r.sim, defenders), ...hold(r.sim, [planter.id], BUTTON.interact)]);
    until(r, (evs) => evs.some((e) => e.type === 'uplink' && e.action === 'plant' && e.stage === 'complete'), T.plant + 10, planting);
    expect(r.m.phase).toBe('uplink');

    // The planter stands on it doing nothing; the defenders are free.
    const events = untilPhase(r, 'roundEnd', T.uplink + 1, () => hold(r.sim, [planter.id]));
    const [kill] = ofType(events, 'kill').filter((e) => e.victimId === planter.id);
    const disrupts = ofType(events, 'uplink').filter((e) => e.action === 'disrupt');
    const [start] = disrupts.filter((e) => e.stage === 'start');
    expect(kill).toBeDefined();
    expect(start?.tick ?? -1).toBeGreaterThan(kill?.tick ?? Infinity);
    expect(defenders).toContain(start?.entityId);
    expect(disrupts.map((e) => e.stage)).toEqual(['start', 'complete']);
    expect(ofType(events, 'roundEnd')).toMatchObject([{ winner: r.team.defend, winnerSide: 'defend', reason: 'disrupted' }]);
    console.info(
      `disrupt (seed 5): planter killed ${((kill?.tick ?? 0) - (events[0]?.tick ?? 0)) * TICK_DT} s into the uplink, ` +
        `disrupt by ${start?.entityId} from ${((start?.tick ?? 0) - (events[0]?.tick ?? 0)) * TICK_DT} s`,
    );
  }, LONG_TEST_MS);
});

// ── Setup ───────────────────────────────────────────────────────────────────

describe('relay bots: setup', () => {
  it('attackers never press a refused ability; defenders take posts at both sites and place their hold gadgets', async () => {
    // The default 5v5 of bots, plus a Keel and a Lattice defender (placeable barrier and sensors,
    // usage hint `hold`)
    // spawned once operator select is over (the select would replace an unplayable operator).
    const seed = 2;
    const sim = await Sim.create(SALTWORKS_LEVEL, seed, 'relay');
    const m = matchOf(sim);
    const roster = defaultRoster(PLAYABLE_OPERATORS[0]).map((x): RosterEntry => ({ ...x, controller: 'bot' }));
    for (const o of roundSpawnOptions(SALTWORKS_LEVEL, m, roster)) sim.spawnCharacter(o);
    while (m.phase === 'preRound') sim.step(new Map());
    const defendTeam = teamOnSide(m, 'defend');
    for (const [node, operatorId] of [['svc_w', 'keel'], ['svc_e', 'lattice']] as const) {
      const pos = fromTuple(SALTWORKS_LEVEL.nav?.nodes.find((n) => n.id === node)?.pos ?? [0, 0, 0]);
      sim.spawnCharacter({ operatorId, team: defendTeam, controller: 'bot', position: pos, yaw: 0 });
    }
    const controller = createBotController(sim, sim.state.entities.map((e) => ({ entityId: e.id, brain: MEDIUM })), seed);
    controller.observe(sim.drainEvents());
    const events: SimEvent[] = [];
    let pressed = 0;
    while (m.phase === 'setup') {
      for (const msg of controller.controls(sim.state.tick + 1)) sim.control(msg);
      const commands = controller.commands(sim.state.tick + 1);
      for (const [id, cmd] of commands) {
        const e = sim.getCharacter(id);
        if (!e || sideOf(m, e.team) !== 'attack') continue;
        e.abilities.forEach((slot, i) => {
          const bit = ABILITY_BUTTONS[i] ?? 0;
          if (cmd.buttons & bit) pressed += 1;
          if (!isReconAbility(getAbility(slot.abilityId))) expect(cmd.buttons & bit, `attacker ${id} pressed ${slot.abilityId} in setup`).toBe(0);
        });
      }
      const evs = sim.step(commands);
      controller.observe(evs);
      events.push(...evs);
    }
    expect(ofType(events, 'abilityFailed')).toEqual([]);
    const byAttacker = ofType(events, 'ability').filter((e) => sideOf(m, sim.getCharacter(e.entityId)?.team ?? -1) === 'attack');
    for (const e of byAttacker) expect(isReconAbility(getAbility(e.abilityId))).toBe(true);
    // Every playable operator's ability is represented among the attackers (the refused ones too).
    const attackerAbilities = new Set(sim.state.entities.filter((e) => e.team !== defendTeam).flatMap((e) => getOperator(e.operatorId).abilities));
    expect([...attackerAbilities].some((id) => !isReconAbility(getAbility(id)))).toBe(true);

    const map = createTacticalMap(sim, createNavGraph(sim));
    const defenders = sim.state.entities.filter((e) => e.team === defendTeam);
    const postSites = new Set(defenders.flatMap((e) => {
      const node = controller.brain(e.id)?.post?.node ?? null;
      return controller.brain(e.id)?.role === 'hold' && node !== null ? [map.siteOf.get(node)] : [];
    }));
    expect([...postSites].sort()).toEqual(map.siteIds.slice().sort());
    const placed = ofType(events, 'gadgetPlaced').filter((e) => defenders.some((d) => d.id === e.ownerId));
    expect(placed.length).toBeGreaterThan(0);
    console.info(`setup (seed ${seed}): attacker ability presses ${pressed}, defender posts at sites ${[...postSites].join(', ')}, gadgets placed ${placed.map((e) => e.abilityId).join(', ')}`);
  }, LONG_TEST_MS);
});

// ── Full matches ────────────────────────────────────────────────────────────

interface RoundLog {
  round: number;
  /** Seconds from the start of the engagement. */
  seconds: number;
  reason: RoundEndReason;
  winnerSide: Side;
  plantedAt: number | null;
}

interface MatchRun {
  rounds: RoundLog[];
  end: EventOf<'matchEnd'> | null;
  stuck: string[];
  refusals: string[];
  /** Controller cost per tick (controls() + commands() + observe()), ms. */
  cost: number[];
  digest: string;
}

/** Bots that should be walking: not fighting, not standing at a post, an investigated spot or
 *  their objective spot (planting, disrupting, guarding), not reloading in place. */
function shouldMove(controller: InspectableBotController, e: CharacterEntity): boolean {
  const b = controller.brain(e.id);
  if (!b || b.state === 'engage') return false;
  if (b.state === 'objective') {
    const t = b.task;
    return !!t && (b.arrivedTick === null || (t.point !== null && flat(t.point, e.pos) > t.reachM));
  }
  if (b.arrivedTick !== null && (b.state === 'hold' || b.state === 'investigate')) return false;
  return !(b.state === 'reload' && b.dest === null);
}

/** The default 5v5 roster with a bot in the player's slot, every bot medium, until matchEnd (or
 *  the end of round `untilRound`). Watches for stuck bots (engagement and uplink), times the
 *  controller and checks every `checkEvery` ticks that controls()/commands() leave SimState alone. */
async function botMatch(seed: number, untilRound = Infinity, checkEvery = 0): Promise<MatchRun> {
  const sim = await Sim.create(SALTWORKS_LEVEL, seed, 'relay');
  const m = matchOf(sim);
  const roster = defaultRoster(PLAYABLE_OPERATORS[0]).map((x): RosterEntry => ({ ...x, controller: 'bot' }));
  for (const o of roundSpawnOptions(SALTWORKS_LEVEL, m, roster)) sim.spawnCharacter(o);
  const controller = createBotController(sim, sim.state.entities.map((e) => ({ entityId: e.id, brain: MEDIUM })), seed);
  controller.observe(sim.drainEvents());
  const run: MatchRun = { rounds: [], end: null, stuck: [], refusals: [], cost: [], digest: '' };
  const anchors = new Map<EntityId, { pos: Vec3; tick: number }>();
  const digest: string[] = [];
  let liveTick = 0;
  let plantedAt: number | null = null;
  while (!run.end && sim.state.tick < MAX_MATCH_TICKS && (run.rounds.at(-1)?.round ?? 0) < untilRound) {
    const check = checkEvery > 0 && sim.state.tick % checkEvery === 0 ? structuredClone(sim.state) : null;
    const t0 = performance.now();
    const controls = controller.controls(sim.state.tick + 1);
    const commands = controller.commands(sim.state.tick + 1);
    const t1 = performance.now();
    if (check) expect(sim.state).toEqual(check);
    for (const msg of controls) sim.control(msg);
    const events = sim.step(commands);
    const t2 = performance.now();
    controller.observe(events);
    run.cost.push(t1 - t0 + (performance.now() - t2));
    for (const ev of events) {
      if (ev.type === 'phase' && ev.phase === 'live') {
        liveTick = ev.tick;
        plantedAt = null;
      }
      if (ev.type === 'uplink' && ev.action === 'plant' && ev.stage === 'complete') plantedAt = (ev.tick - liveTick) * TICK_DT;
      if (ev.type === 'roundEnd') run.rounds.push({ round: ev.round, seconds: (ev.tick - liveTick) * TICK_DT, reason: ev.reason, winnerSide: ev.winnerSide, plantedAt });
      if (ev.type === 'matchEnd') run.end = ev;
      if (ev.type === 'abilityFailed') run.refusals.push(`tick ${ev.tick}: ${ev.entityId} ${ev.abilityId} ${ev.reason}`);
      if (ev.type !== 'footstep') digest.push(`${ev.tick}:${ev.type}:${'entityId' in ev ? ev.entityId : ''}`);
    }
    for (const e of sim.state.entities) {
      const a = anchors.get(e.id);
      const moved = !a || flat(e.pos, a.pos) > STUCK_RADIUS_M;
      if ((m.phase !== 'live' && m.phase !== 'uplink') || !e.alive || !shouldMove(controller, e) || moved) {
        anchors.set(e.id, { pos: { ...e.pos }, tick: sim.state.tick });
      } else if (sim.state.tick - a.tick > STUCK_TICKS) {
        const b = controller.brain(e.id);
        run.stuck.push(`round ${m.round} tick ${sim.state.tick}: bot ${e.id} ${b?.state} ${b?.task?.kind ?? ''} → ${b?.task?.node ?? b?.dest} at ${e.pos.x.toFixed(1)}, ${e.pos.y.toFixed(1)}, ${e.pos.z.toFixed(1)}`);
        anchors.set(e.id, { pos: { ...e.pos }, tick: sim.state.tick });
      }
    }
  }
  run.digest = `${digest.join('|')}#${JSON.stringify(sim.state)}`;
  return run;
}

const percentile = (xs: readonly number[], p: number): number => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))] ?? 0;
const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

describe('a full bot-only Relay match on Saltworks', () => {
  it('runs to matchEnd (side swap, possibly overtime) without errors or stuck bots; logs the rounds and the controller cost', async () => {
    const seed = 19; // today: 4:3 with the overtime round
    const run = await botMatch(seed, Infinity, 97);
    expect(run.end, 'no matchEnd').not.toBeNull();
    const score = run.end?.score ?? [0, 0];
    expect(Math.max(...score)).toBe(MATCH_FORMAT.roundsToWin);
    expect(run.rounds).toHaveLength(score[0] + score[1]);
    expect(run.rounds.length).toBeGreaterThan(MATCH_FORMAT.sideSwapAfterRounds);
    expect(run.stuck).toEqual([]);
    expect(run.refusals).toEqual([]);
    expect(run.rounds.filter((r) => r.plantedAt !== null).length).toBeGreaterThan(0);
    const avg = mean(run.cost);
    const count = (reason: RoundEndReason): number => run.rounds.filter((r) => r.reason === reason).length;
    console.info(
      [
        `relay bot match (seed ${seed}, 10 medium bots): score ${score.join(':')} in ${run.rounds.length} rounds${run.rounds.length === 2 * MATCH_FORMAT.roundsToWin - 1 ? ' (overtime)' : ''}`,
        ...run.rounds.map((r) => `  round ${r.round}: ${r.seconds.toFixed(1)} s, ${r.reason}, ${r.winnerSide} wins${r.plantedAt === null ? '' : `, planted at ${r.plantedAt.toFixed(1)} s`}`),
        `  elimination ${count('elimination')}, uplink ${count('uplink')}, disrupted ${count('disrupted')}, timeout ${count('timeout')}`,
        `  controller per tick: avg ${avg.toFixed(3)} ms, p99 ${percentile(run.cost, 0.99).toFixed(3)} ms, worst ${Math.max(...run.cost).toFixed(2)} ms (${run.cost.length} ticks)`,
      ].join('\n'),
    );
    // ADR-0011 §2: the controller stays under 1 ms per tick in Node.
    expect(avg).toBeLessThan(1);
  }, LONG_TEST_MS);

  it('is deterministic per seed (round 1 twice: same events and state)', async () => {
    const a = await botMatch(7, 1);
    const b = await botMatch(7, 1);
    expect(a.rounds).toHaveLength(1);
    expect(b.digest).toBe(a.digest);
    expect(b.rounds).toEqual(a.rounds);
  }, LONG_TEST_MS);
});

// ── Pure rules ──────────────────────────────────────────────────────────────

describe('relay bots: channel keeping', () => {
  it('keeps channelling near the end, or when letting go would lose it for good (holdsChannel)', () => {
    const self = { id: 3 } as CharacterEntity;
    const at = (startTick: number, endTick: number, phaseEndTick: number, entityId = 3): MatchState =>
      ({
        mode: 'relay',
        phase: 'uplink',
        round: 1,
        phaseEndTick,
        score: [0, 0],
        attackingTeam: 0,
        attackZoneId: 'west_gate',
        lastWinner: null,
        channel: { action: 'disrupt', entityId, siteId: 'A', startTick, endTick },
        uplink: { siteId: 'A', pos: vec3() },
      }) satisfies RelayMatch;
    const finish = secondsToTicks(AI.relay.finishChannelSeconds);
    const length = secondsToTicks(RELAY.disruptSeconds);
    expect(holdsChannel(self, at(0, length, 10_000), length - finish - 1)).toBe(false); // time to fight and restart
    expect(holdsChannel(self, at(0, length, 10_000), length - finish)).toBe(true); // nearly done
    expect(holdsChannel(self, at(0, length, 30 + length - 1), 30)).toBe(true); // a restart would miss the clock
    expect(holdsChannel(self, at(0, length, 10_000, 4), length)).toBe(false); // someone else's channel
    expect(holdsChannel(self, { mode: 'range' }, 0)).toBe(false);
  });
});
