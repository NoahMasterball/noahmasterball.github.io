import { describe, expect, it } from 'vitest';
import { createTacticalMap, type TacticalMap } from '../../src/ai/brain.ts';
import { createBotController, stepMatch, type InspectableBotController } from '../../src/ai/controller.ts';
import { createNavGraph } from '../../src/ai/nav/graph.ts';
import { reachedNode } from '../../src/ai/nav/steer.ts';
import type { BrainSpec } from '../../src/ai/types.ts';
import { AI, ELIMINATION, MATCH, MATCH_FORMAT, PLAYABLE_OPERATORS, secondsToTicks, TICK_DT, type AiTier } from '../../src/config/sim.ts';
import { getAbility, getOperator, siteAt } from '../../src/data/content.ts';
import { SALTWORKS_LEVEL } from '../../src/data/levels/saltworks.ts';
import type { Side } from '../../src/data/schema.ts';
import { zoneWorldCenter } from '../../src/sim/hitbox.ts';
import { angleDelta, anglesTo, DEG2RAD, vec3, type Vec3 } from '../../src/sim/math.ts';
import { defaultRoster, otherTeam, roundSpawnOptions, type RosterEntry } from '../../src/sim/modes/format.ts';
import { matchFrozen } from '../../src/sim/modes/index.ts';
import { Sim } from '../../src/sim/sim.ts';
import type { CharacterEntity, EliminationMatch, EntityId, RoundEndReason, SimEvent } from '../../src/sim/types.ts';

// Bots playing elimination on Saltworks (ADR-0011 §3/§6/§8) through the real Sim and the shared
// stepMatch in Node: a lone attacker hunting a standing defender, defender posts, the attackers'
// push, bots playing on after a round's result, commands() never writing the simulation, a full
// 5v5 bot match to matchEnd (with its round statistics and the controller's cost per tick) and
// determinism per seed.

const STANDING: BrainSpec = { kind: 'dummy', behaviour: { kind: 'static' } };
const combat = (tier: AiTier): BrainSpec => ({ kind: 'combat', tier });
/** SPEC §13: any site is reachable from the attacker edge in about 20 s; the bound adds slack. */
const SITE_REACH_SECONDS = 25;
/** A bot that should be moving but stays within STUCK_RADIUS_M this long is stuck: longer than
 *  the nav's whole recovery (a jump, maxStuckRetries replans, then a new goal). */
const STUCK_SECONDS = AI.nav.stuckWindowSeconds * (AI.nav.maxStuckRetries + 2);
const STUCK_RADIUS_M = 1;
/** Longest possible match: every round to the clock, one overtime round. */
const MAX_ROUNDS = 2 * (MATCH_FORMAT.roundsToWin - 1) + 1;
const MAX_MATCH_TICKS = MAX_ROUNDS * secondsToTicks(ELIMINATION.preRoundSeconds + ELIMINATION.roundSeconds + ELIMINATION.roundEndSeconds);
const LONG_TEST_MS = 120_000;

interface Match {
  sim: Sim;
  bots: InspectableBotController;
  match: EliminationMatch;
  side: Record<Side, { team: number; members: CharacterEntity[] }>;
}

function eliminationOf(sim: Sim): EliminationMatch {
  const m = sim.state.match;
  if (m.mode !== 'elimination') throw new Error('not an elimination match');
  return m;
}

/** An elimination match on Saltworks with `perSide` characters a side (operators cycle the
 *  playable list) and one brain per side. */
async function saltworks(seed: number, perSide: number, brains: Record<Side, BrainSpec>): Promise<Match> {
  const sim = await Sim.create(SALTWORKS_LEVEL, seed, 'elimination');
  const match = eliminationOf(sim);
  const teams: Record<Side, number> = { attack: match.attackingTeam, defend: otherTeam(match.attackingTeam) };
  const roster: RosterEntry[] = Array.from({ length: perSide }, (_, i) =>
    (['attack', 'defend'] as const).map((s): RosterEntry => ({ team: teams[s], operatorId: PLAYABLE_OPERATORS[i % PLAYABLE_OPERATORS.length] ?? 'wisp', controller: 'bot' })),
  ).flat();
  for (const o of roundSpawnOptions(SALTWORKS_LEVEL, match, roster)) sim.spawnCharacter(o);
  const sideOfTeam = (team: number): Side => (team === teams.attack ? 'attack' : 'defend');
  const bots = createBotController(sim, sim.state.entities.map((e) => ({ entityId: e.id, brain: brains[sideOfTeam(e.team)] })), seed);
  bots.observe(sim.drainEvents());
  const members = (s: Side): CharacterEntity[] => sim.state.entities.filter((e) => e.team === teams[s]);
  return { sim, bots, match, side: { attack: { team: teams.attack, members: members('attack') }, defend: { team: teams.defend, members: members('defend') } } };
}

/** Steps until the round goes live; returns that tick. */
function untilLive(m: Match): number {
  while (m.match.phase !== 'live') stepMatch(m.sim, m.bots, new Map());
  return m.sim.state.tick;
}

const inSite = (e: CharacterEntity): string | null => siteAt(SALTWORKS_LEVEL, [e.pos.x, e.pos.y, e.pos.z])?.id ?? null;

describe('bots on Saltworks', () => {
  it('a lone attacker finds and kills a standing defender, never firing without line of sight', async () => {
    const report: string[] = [];
    for (const seed of [1, 3]) {
      const m = await saltworks(seed, 1, { attack: combat('medium'), defend: STANDING });
      const [hunter] = m.side.attack.members;
      const [target] = m.side.defend.members;
      if (!hunter || !target) throw new Error('missing characters');
      const live = untilLive(m);
      let kill: SimEvent | undefined;
      let shots = 0;
      while (!kill && m.match.phase === 'live') {
        for (const ev of stepMatch(m.sim, m.bots, new Map())) {
          if (ev.type === 'shot' && ev.entityId === hunter.id) {
            shots += 1;
            const seen = (['head', 'torso'] as const).some((z) => m.sim.query.lineOfSight(ev.origin, zoneWorldCenter(target, z)));
            expect(seen, `shot at tick ${ev.tick} without sight`).toBe(true);
          }
          if (ev.type === 'kill') kill = ev;
        }
      }
      expect(kill).toMatchObject({ attackerId: hunter.id, victimId: target.id });
      report.push(`seed ${seed}: killed after ${((m.sim.state.tick - live) * TICK_DT).toFixed(1)} s with ${shots} shots`);
    }
    console.info(`hunt a standing defender: ${report.join('; ')}`);
  }, LONG_TEST_MS);

  it('defenders take posts spread over the sites and watch their angles; the rest patrol the defended ground', async () => {
    const m = await saltworks(2, MATCH.teamSize, { attack: STANDING, defend: combat('medium') });
    const map: TacticalMap = createTacticalMap(m.sim, createNavGraph(m.sim));
    const live = untilLive(m);
    const defenders = m.side.defend.members;
    while (m.sim.state.tick < live + secondsToTicks(25)) {
      stepMatch(m.sim, m.bots, new Map());
      for (const e of defenders) {
        const b = m.bots.brain(e.id);
        if (b?.state === 'patrol' && b.dest !== null) expect(map.defended.has(b.dest), `${b.dest} is not defended ground`).toBe(true);
      }
    }
    const holders = defenders.filter((e) => m.bots.brain(e.id)?.role === 'hold');
    expect(holders).toHaveLength(Math.round(AI.brain.holdFraction.defend * defenders.length));
    const posts = map.holds.defend.map((n) => n.id);
    const sites = new Set<string>();
    for (const e of holders) {
      const b = m.bots.brain(e.id);
      const node = b?.post?.node ?? null;
      if (!b?.post || node === null) throw new Error(`holder ${e.id} has no post`);
      expect(posts).toContain(node);
      expect(b.state).toBe('hold');
      expect(reachedNode(e.pos, map.graph.node(node))).toBe(true);
      expect(Math.abs(angleDelta(e.yaw, b.post.yaw))).toBeLessThan(DEG2RAD);
      sites.add(map.siteOf.get(node) ?? '');
    }
    expect(sites.size).toBe(Math.min(holders.length, map.siteIds.length));
    console.info(`defender posts: ${holders.map((e) => `${m.bots.brain(e.id)?.post?.node} (site ${map.siteOf.get(m.bots.brain(e.id)?.post?.node ?? '')})`).join(', ')}`);
  }, LONG_TEST_MS);

  it(`attackers push into their target site within ${SITE_REACH_SECONDS} s, both sites over the seeds`, async () => {
    const reached = new Map<string, number>();
    for (let seed = 1; seed <= 8 && reached.size < (SALTWORKS_LEVEL.sites ?? []).length; seed++) {
      const m = await saltworks(seed, MATCH.teamSize, { attack: combat('medium'), defend: STANDING });
      const map = createTacticalMap(m.sim, createNavGraph(m.sim));
      const live = untilLive(m);
      const site = m.bots.plan(m.side.attack.team)?.targetSite ?? null;
      if (site === null) throw new Error('the attackers have no target site');
      for (const e of m.side.attack.members) {
        const b = m.bots.brain(e.id);
        if (b?.role === 'hold') expect(map.holds.attack.map((n) => n.id)).toContain(b.post?.node);
      }
      let at: number | null = null;
      while (at === null && m.sim.state.tick < live + secondsToTicks(SITE_REACH_SECONDS) && m.match.phase === 'live') {
        stepMatch(m.sim, m.bots, new Map());
        if (m.side.attack.members.some((e) => e.alive && inSite(e) === site)) at = m.sim.state.tick;
      }
      expect(at, `seed ${seed}: nobody reached site ${site}`).not.toBeNull();
      if (at !== null && !reached.has(site)) reached.set(site, (at - live) * TICK_DT);
    }
    expect([...reached.keys()].sort()).toEqual((SALTWORKS_LEVEL.sites ?? []).map((s) => s.id).sort());
    console.info(`first attacker in the target site: ${[...reached].map(([s, t]) => `${s} ${t.toFixed(1)} s`).join(', ')}`);
  }, LONG_TEST_MS);

  it('bots play on after a result: a defender shoots an enemy in sight during roundEnd', async () => {
    // The round runs out of time with both sides alive; then an enemy (a player who keeps playing
    // after the result, as the rules allow) stands in the open in front of the defender.
    const m = await saltworks(6, 1, { attack: STANDING, defend: combat('medium') });
    const [enemy] = m.side.attack.members;
    const [bot] = m.side.defend.members;
    if (!enemy || !bot) throw new Error('missing characters');
    untilLive(m);
    let end: SimEvent | undefined;
    while (m.match.phase === 'live') end = stepMatch(m.sim, m.bots, new Map()).find((ev) => ev.type === 'roundEnd') ?? end;
    expect(end).toMatchObject({ type: 'roundEnd', reason: 'timeout' });
    expect(m.match.phase).toBe('roundEnd');
    expect(matchFrozen(m.match, bot.team)).toBe(false);

    const botAt = vec3(0, 0, 18);
    const enemyAt = vec3(0, 0, 26); // the open lane between the pump house and the spawn shields
    m.sim.control({ type: 'teleport', entityId: bot.id, position: botAt, yaw: anglesTo(botAt, enemyAt).yaw, pitch: 0 });
    m.sim.control({ type: 'teleport', entityId: enemy.id, position: enemyAt, yaw: anglesTo(enemyAt, botAt).yaw, pitch: 0 });
    let shots = 0;
    let hits = 0;
    while (m.match.phase === 'roundEnd') {
      for (const ev of stepMatch(m.sim, m.bots, new Map())) {
        if (ev.type === 'shot' && ev.entityId === bot.id) shots += 1;
        if (ev.type === 'hit' && ev.attackerId === bot.id) hits += 1;
      }
    }
    expect(shots).toBeGreaterThan(0);
    expect(hits).toBeGreaterThan(0);
  }, LONG_TEST_MS);

  it('commands() never writes the simulation state (10 bots, through the first fights)', async () => {
    const m = await saltworks(4, MATCH.teamSize, { attack: combat('medium'), defend: combat('medium') });
    const seen = new Set<string>();
    for (let i = 0; i < secondsToTicks(ELIMINATION.preRoundSeconds + 45); i++) {
      if (i % 10 !== 0) {
        stepMatch(m.sim, m.bots, new Map());
        continue;
      }
      const before = structuredClone(m.sim.state);
      const commands = m.bots.commands(m.sim.state.tick + 1);
      expect(m.sim.state).toEqual(before);
      m.bots.observe(m.sim.step(commands));
      for (const e of m.sim.state.entities) seen.add(m.bots.brain(e.id)?.state ?? '');
    }
    expect([...seen]).toEqual(expect.arrayContaining(['hold', 'patrol', 'engage']));
  }, LONG_TEST_MS);
});

// ── Full matches ────────────────────────────────────────────────────────────

interface RoundLog {
  round: number;
  seconds: number;
  reason: RoundEndReason;
  winnerSide: Side;
}

interface MatchRun {
  rounds: RoundLog[];
  end: Extract<SimEvent, { type: 'matchEnd' }> | null;
  stuck: string[];
  /** Controller cost per tick (commands() + observe()), ms; and the sim step's. */
  cost: number[];
  simCost: number[];
  digest: string;
  /** Ability uses (`ability` events) by operator and ability id, e.g. "heron heron_sonar". */
  uses: Map<string, number>;
  /** `abilityFailed` events: a bot never presses what the sim refuses. */
  refusals: string[];
}

/** Bots that should be walking (not fighting, not standing at a post or an investigated spot,
 *  not reloading in place). */
function shouldMove(bots: InspectableBotController, id: EntityId): boolean {
  const b = bots.brain(id);
  if (!b || b.state === 'engage') return false;
  if (b.arrivedTick !== null && (b.state === 'hold' || b.state === 'investigate')) return false;
  return !(b.state === 'reload' && b.dest === null);
}

/** The default 5v5 roster with a bot in the player's slot, every bot `tier`, until matchEnd
 *  (or the end of round `untilRound`). Watches for stuck bots and times the controller. */
async function botMatch(seed: number, tier: AiTier, untilRound = Infinity): Promise<MatchRun> {
  const sim = await Sim.create(SALTWORKS_LEVEL, seed, 'elimination');
  const match = eliminationOf(sim);
  const roster = defaultRoster(PLAYABLE_OPERATORS[0]).map((r): RosterEntry => ({ ...r, controller: 'bot' }));
  for (const o of roundSpawnOptions(SALTWORKS_LEVEL, match, roster)) sim.spawnCharacter(o);
  const bots = createBotController(sim, sim.state.entities.map((e) => ({ entityId: e.id, brain: combat(tier) })), seed);
  bots.observe(sim.drainEvents());
  const run: MatchRun = { rounds: [], end: null, stuck: [], cost: [], simCost: [], digest: '', uses: new Map(), refusals: [] };
  const anchors = new Map<EntityId, { pos: Vec3; tick: number }>();
  const digest: string[] = [];
  let liveTick = 0;
  while (!run.end && sim.state.tick < MAX_MATCH_TICKS && (run.rounds.at(-1)?.round ?? 0) < untilRound) {
    const t0 = performance.now();
    const commands = bots.commands(sim.state.tick + 1);
    const t1 = performance.now();
    const events = sim.step(commands);
    const t2 = performance.now();
    bots.observe(events);
    const t3 = performance.now();
    run.cost.push(t1 - t0 + (t3 - t2));
    run.simCost.push(t2 - t1);
    for (const ev of events) {
      if (ev.type === 'phase' && ev.phase === 'live') liveTick = ev.tick;
      if (ev.type === 'roundEnd') run.rounds.push({ round: ev.round, seconds: (ev.tick - liveTick) * TICK_DT, reason: ev.reason, winnerSide: ev.winnerSide });
      if (ev.type === 'matchEnd') run.end = ev;
      if (ev.type !== 'footstep') digest.push(`${ev.tick}:${ev.type}:${'entityId' in ev ? ev.entityId : ''}`);
      if (ev.type === 'ability') {
        const key = `${sim.getCharacter(ev.entityId)?.operatorId} ${ev.abilityId}`;
        run.uses.set(key, (run.uses.get(key) ?? 0) + 1);
      }
      if (ev.type === 'abilityFailed') run.refusals.push(`tick ${ev.tick}: ${ev.entityId} ${ev.abilityId} ${ev.reason}`);
    }
    for (const e of sim.state.entities) {
      const a = anchors.get(e.id);
      const moved = !a || Math.hypot(e.pos.x - a.pos.x, e.pos.z - a.pos.z) > STUCK_RADIUS_M;
      if (match.phase !== 'live' || !e.alive || !shouldMove(bots, e.id) || moved) {
        anchors.set(e.id, { pos: { ...e.pos }, tick: sim.state.tick });
      } else if (sim.state.tick - a.tick > secondsToTicks(STUCK_SECONDS)) {
        const b = bots.brain(e.id);
        run.stuck.push(`round ${match.round} tick ${sim.state.tick}: bot ${e.id} ${b?.state} → ${b?.dest} at ${e.pos.x.toFixed(1)}, ${e.pos.y.toFixed(1)}, ${e.pos.z.toFixed(1)}`);
        anchors.set(e.id, { pos: { ...e.pos }, tick: sim.state.tick });
      }
    }
  }
  run.digest = `${digest.join('|')}#${JSON.stringify(sim.state)}`;
  return run;
}

const percentile = (xs: readonly number[], p: number): number => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))] ?? 0;
const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

describe('a full 5v5 bot match on Saltworks', () => {
  it('runs to matchEnd without errors or stuck bots; logs the rounds and the controller cost', async () => {
    const run = await botMatch(5, 'medium');
    expect(run.end, 'no matchEnd').not.toBeNull();
    const score = run.end?.score ?? [0, 0];
    expect(Math.max(...score)).toBe(MATCH_FORMAT.roundsToWin);
    expect(run.rounds).toHaveLength(score[0] + score[1]);
    for (const r of run.rounds) expect(r.seconds).toBeLessThanOrEqual(ELIMINATION.roundSeconds);
    expect(run.stuck).toEqual([]);
    // ADR-0012 §10: every playable operator uses each ability its data lets bots use; never a
    // press the sim refuses.
    expect(run.refusals).toEqual([]);
    const usable = PLAYABLE_OPERATORS.flatMap((op) => getOperator(op).abilities.filter((id) => getAbility(id).bot.use !== 'never').map((id) => `${op} ${id}`));
    for (const key of usable) expect(run.uses.get(key) ?? 0, `${key} was never used`).toBeGreaterThan(0);

    const avg = mean(run.cost);
    console.info(
      [
        `bot match (seed 5, 10 medium bots): score ${score.join(':')} in ${run.rounds.length} rounds`,
        ...run.rounds.map((r) => `  round ${r.round}: ${r.seconds.toFixed(1)} s, ${r.reason}, ${r.winnerSide} wins`),
        `  eliminations ${run.rounds.filter((r) => r.reason === 'elimination').length}, timeouts ${run.rounds.filter((r) => r.reason === 'timeout').length}`,
        `  ability uses: ${[...run.uses].map(([k, n]) => `${k} ×${n}`).join(', ') || 'none'}`,
        `  controller per tick: avg ${avg.toFixed(3)} ms, p99 ${percentile(run.cost, 0.99).toFixed(3)} ms, worst ${Math.max(...run.cost).toFixed(2)} ms` +
          ` (sim step avg ${mean(run.simCost).toFixed(3)} ms, worst ${Math.max(...run.simCost).toFixed(2)} ms; ${run.cost.length} ticks)`,
      ].join('\n'),
    );
    // ADR-0011 §2: the controller stays under 1 ms per tick in Node (a 60 fps frame has 16 ms).
    expect(avg).toBeLessThan(1);
  }, LONG_TEST_MS);

  it('is deterministic per seed (round 1 twice: same events and state)', async () => {
    const a = await botMatch(9, 'medium', 1);
    const b = await botMatch(9, 'medium', 1);
    expect(a.rounds).toHaveLength(1);
    expect(b.digest).toBe(a.digest);
    expect(b.rounds).toEqual(a.rounds);
  }, LONG_TEST_MS);
});

