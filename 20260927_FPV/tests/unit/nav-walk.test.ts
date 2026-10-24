import { describe, expect, it } from 'vitest';
import { turnStep } from '../../src/ai/aim.ts';
import { pathLength } from '../../src/ai/nav/astar.ts';
import { NavGraph, type NavNode } from '../../src/ai/nav/graph.ts';
import { createNavState, setGoal, steer, type NavState, type SteerOptions, type StuckRecovery } from '../../src/ai/nav/steer.ts';
import { AI, AI_TIERS, secondsToTicks, TICK_DT } from '../../src/config/sim.ts';
import { getOperator, OPERATORS, siteAt } from '../../src/data/content.ts';
import { RANGE_LEVEL } from '../../src/data/levels/range.ts';
import { SALTWORKS_LEVEL } from '../../src/data/levels/saltworks.ts';
import type { LevelDef, NavGraphDef, NavLinkKind, SpawnPointDef, Vec3Tuple } from '../../src/data/schema.ts';
import { BUTTON, isHeld, type Command } from '../../src/sim/command.ts';
import { angleDelta, anglesTo, DEG2RAD, forwardFromAngles, fromTuple, rightFromYaw, vec3, type Vec3 } from '../../src/sim/math.ts';
import { Sim } from '../../src/sim/sim.ts';
import type { CharacterEntity } from '../../src/sim/types.ts';

// Bots walking the waypoint graph purely from steer() output (ADR-0011 §5), through the real Sim
// (Rapier character controller) in Node, with the slowest operator: spawn → site routes across
// the floors, every Saltworks link on its own, crouch and jump links on the range course, and
// the stuck recovery. Deterministic: no randomness anywhere in steering.

const NAV = SALTWORKS_LEVEL.nav as NavGraphDef;
const SLOWEST = [...OPERATORS].sort((a, b) => a.moveSpeed - b.moveSpeed)[0]?.id ?? '';
const WALK_SPEED = getOperator(SLOWEST).moveSpeed;
/** Bots face along their path at their tier's turn rate; the slowest tier turns the least. */
const SLOWEST_TURN_DEG = Math.min(...AI_TIERS.map((t) => AI.tiers[t].turnRateDeg));
/** Route time bound: path length at plain walking speed × this, plus the start-up below. */
const ROUTE_SLACK = 1.25;
const START_UP_SECONDS = 1;
/** Idle time after a spawn or teleport so the character rests on the ground. */
const SETTLE_SECONDS = 0.2;

interface DriveResult {
  arrived: boolean;
  seconds: number;
  recoveries: StuckRecovery[];
  /** Highest stance seen (1 = fully crouched). */
  maxStance: number;
}

/** Steps the sim with steer() as the character's only input until it arrives, gives up or
 *  runs out of time. */
function drive(
  sim: Sim,
  e: CharacterEntity,
  graph: NavGraph,
  nav: NavState,
  maxSeconds: number,
  opts: SteerOptions = { sprint: true, turnRateDeg: SLOWEST_TURN_DEG },
): DriveResult {
  const startTick = sim.state.tick;
  const recoveries: StuckRecovery[] = [];
  let maxStance = e.stance;
  const result = (arrived: boolean): DriveResult => ({ arrived, seconds: (sim.state.tick - startTick) * TICK_DT, recoveries, maxStance });
  for (let i = 0; i < secondsToTicks(maxSeconds); i++) {
    const tick = sim.state.tick + 1;
    const s = steer(nav, graph, e, null, tick, opts);
    if (s.recovery) recoveries.push(s.recovery);
    if (s.arrived) return result(true);
    if (nav.goal === null) return result(false);
    const cmd: Command = { tick, moveX: s.moveX, moveZ: s.moveZ, yaw: s.yaw, pitch: 0, buttons: s.buttons };
    sim.step(new Map([[e.id, cmd]]));
    maxStance = Math.max(maxStance, e.stance);
  }
  return result(false);
}

function idle(sim: Sim, e: CharacterEntity, seconds: number): void {
  for (let i = 0; i < secondsToTicks(seconds); i++) {
    const tick = sim.state.tick + 1;
    sim.step(new Map([[e.id, { tick, moveX: 0, moveZ: 0, yaw: e.yaw, pitch: 0, buttons: 0 }]]));
  }
}

async function start(level: LevelDef, at: SpawnPointDef): Promise<{ sim: Sim; graph: NavGraph; e: CharacterEntity }> {
  const sim = await Sim.create(level);
  const graph = new NavGraph(level, sim.query);
  const e = sim.spawnCharacter({ operatorId: SLOWEST, team: 0, controller: 'bot', position: fromTuple(at.position), yaw: at.yawDeg * DEG2RAD });
  idle(sim, e, SETTLE_SECONDS);
  return { sim, graph, e };
}

/** Puts the character on `from`, facing `to`, at rest. */
function teleport(sim: Sim, e: CharacterEntity, from: Vec3, to: Vec3): void {
  sim.control({ type: 'teleport', entityId: e.id, position: from, yaw: anglesTo(from, to).yaw, pitch: 0 });
  idle(sim, e, SETTLE_SECONDS);
}

/** A path straight along one link (the brain never builds these; tests pin a single link). */
function onLink(from: string, to: string): NavState {
  return { ...createNavState(), goal: to, path: [from, to], index: 1 };
}

/** The node of a site closest to the site's centre. */
function siteAnchor(graph: NavGraph, siteId: string): NavNode {
  const site = SALTWORKS_LEVEL.sites?.find((s) => s.id === siteId);
  const nodes = graph.siteNodes(siteId);
  if (!site || nodes.length === 0) throw new Error(`no nodes in site ${siteId}`);
  const c = fromTuple(site.center);
  const d = (n: NavNode): number => Math.hypot(n.pos.x - c.x, n.pos.z - c.z);
  return nodes.reduce((best, n) => (d(n) < d(best) ? n : best));
}

const feet = (e: CharacterEntity): Vec3Tuple => [e.pos.x, e.pos.y, e.pos.z];
const routeBound = (length: number): number => (length / WALK_SPEED) * ROUTE_SLACK + START_UP_SECONDS;

describe('steering Saltworks routes (real Sim, slowest operator)', () => {
  const cases = (SALTWORKS_LEVEL.spawnZones ?? []).flatMap((zone) =>
    (SALTWORKS_LEVEL.sites ?? []).map((site) => ({ zone: zone.id, site: site.id, point: zone.points[0] })),
  );

  it.each(cases)('walks $zone → site $site without getting stuck', async ({ site, point }) => {
    if (!point) throw new Error('empty spawn zone');
    const { sim, graph, e } = await start(SALTWORKS_LEVEL, point);
    const nav = createNavState();
    expect(setGoal(nav, graph, e.pos, siteAnchor(graph, site).id, sim.state.tick + 1)).toBe(true);
    const length = pathLength(nav.path.map((id) => graph.node(id)));
    const run = drive(sim, e, graph, nav, routeBound(length) * 2);
    expect(run.recoveries).toEqual([]);
    expect(run.arrived).toBe(true);
    expect(run.seconds).toBeLessThan(routeBound(length));
    expect(siteAt(SALTWORKS_LEVEL, feet(e))?.id).toBe(site);
    expect(e.grounded).toBe(true);
  });

  it('is deterministic: the same route twice gives the same ticks and positions', async () => {
    const point = SALTWORKS_LEVEL.spawnZones?.find((z) => z.side === 'defend')?.points[0];
    if (!point) throw new Error('expected a defender spawn');
    const runOnce = async (): Promise<{ seconds: number; pos: Vec3Tuple; path: string[] }> => {
      const { sim, graph, e } = await start(SALTWORKS_LEVEL, point);
      const nav = createNavState();
      setGoal(nav, graph, e.pos, siteAnchor(graph, 'B').id, sim.state.tick + 1);
      const run = drive(sim, e, graph, nav, 60);
      return { seconds: run.seconds, pos: feet(e), path: nav.path };
    };
    expect(await runOnce()).toEqual(await runOnce());
  });

  it('climbs the hall stairs to the catwalk and drops back into site A', async () => {
    const siteA = NAV.nodes.find((n) => n.id === 'siteA_c');
    if (!siteA) throw new Error('expected siteA_c');
    const { sim, graph, e } = await start(SALTWORKS_LEVEL, { position: siteA.pos, yawDeg: 0 });
    const legs: [string, string[]][] = [
      ['catwalk_s', ['hall_stairs_bottom', 'catwalk_top']],
      [siteA.id, ['catwalk_drop', siteA.id]],
    ];
    for (const [goal, via] of legs) {
      const nav = createNavState();
      expect(setGoal(nav, graph, e.pos, goal, sim.state.tick + 1)).toBe(true);
      expect(nav.path.join(' ')).toContain(via.join(' '));
      const length = pathLength(nav.path.map((id) => graph.node(id)));
      const run = drive(sim, e, graph, nav, routeBound(length) * 2);
      expect(run.recoveries, goal).toEqual([]);
      expect(run.arrived, goal).toBe(true);
      expect(run.seconds, goal).toBeLessThan(routeBound(length));
    }
    expect(siteAt(SALTWORKS_LEVEL, feet(e))?.id).toBe('A');
  });

  it('walks every link, in each allowed direction, from a standstill', async () => {
    const first = NAV.nodes[0];
    if (!first) throw new Error('expected nodes');
    const { sim, graph, e } = await start(SALTWORKS_LEVEL, { position: first.pos, yawDeg: 0 });
    const failures: string[] = [];
    for (const k of NAV.links) {
      for (const [from, to] of k.oneWay ? [[k.from, k.to]] : [[k.from, k.to], [k.to, k.from]]) {
        if (!from || !to) continue;
        const a = graph.node(from);
        const b = graph.node(to);
        teleport(sim, e, a.pos, b.pos);
        expect(Math.hypot(e.pos.x - a.pos.x, e.pos.z - a.pos.z), from).toBeLessThan(AI.nav.arriveRadiusM);
        const run = drive(sim, e, graph, onLink(from, to), routeBound(pathLength([a, b])) * 2);
        const name = `${from} → ${to}`;
        if (!run.arrived || run.recoveries.length > 0) failures.push(`${name}: arrived ${run.arrived}, recoveries ${run.recoveries.join(',')}`);
        else if (run.seconds > routeBound(pathLength([a, b]))) failures.push(`${name}: ${run.seconds.toFixed(2)} s`);
      }
    }
    expect(failures).toEqual([]);
  }, 120_000);
});

// ── Crouch and jump links on the range course ───────────────────────────────

/** Range course: crouch tunnel along −Z at x 21.5 (z −15 … −21, 1.4 m clearance) and the 0.6 m
 *  jump box at x 30 (z −17 … −19); see src/data/levels/range.ts. */
function courseLevel(tunnel: NavLinkKind, box: NavLinkKind): LevelDef {
  return {
    ...RANGE_LEVEL,
    nav: {
      nodes: [
        { id: 'tunnel_s', pos: [21.5, 0, -12.5] },
        { id: 'tunnel_n', pos: [21.5, 0, -23.5] },
        { id: 'box_run', pos: [30, 0, -10] },
        { id: 'box_foot', pos: [30, 0, -15.8] },
        { id: 'box_top', pos: [30, 0.6, -18] },
      ],
      links: [
        { from: 'tunnel_s', to: 'tunnel_n', kind: tunnel },
        { from: 'box_run', to: 'box_foot' },
        { from: 'box_foot', to: 'box_top', kind: box },
      ],
    },
  };
}

const TUNNEL_START: SpawnPointDef = { position: [21.5, 0, -12.5], yawDeg: 0 };
const BOX_START: SpawnPointDef = { position: [30, 0, -10], yawDeg: 0 };

describe('crouch and jump links (range course, real Sim)', () => {
  it('holds crouch through the tunnel on a crouch link; a walk link there gets stuck', async () => {
    const crouch = await start(courseLevel('crouch', 'jump'), TUNNEL_START);
    const run = drive(crouch.sim, crouch.e, crouch.graph, onLink('tunnel_s', 'tunnel_n'), 12);
    expect(run.recoveries).toEqual([]);
    expect(run.arrived).toBe(true);
    expect(run.maxStance).toBe(1);

    const walk = await start(courseLevel('walk', 'jump'), TUNNEL_START);
    const stuck = drive(walk.sim, walk.e, walk.graph, onLink('tunnel_s', 'tunnel_n'), 12);
    expect(stuck.arrived).toBe(false);
    expect(stuck.recoveries[0]).toBe('jump');
  });

  it('presses jump once near the start of a jump link and lands on the box; a walk link needs the stuck jump', async () => {
    const jump = await start(courseLevel('crouch', 'jump'), BOX_START);
    const nav = createNavState();
    expect(setGoal(nav, jump.graph, jump.e.pos, 'box_top', jump.sim.state.tick + 1)).toBe(true);
    let presses = 0;
    let previous = 0;
    for (let i = 0; i < secondsToTicks(6) && nav.index < nav.path.length; i++) {
      const tick = jump.sim.state.tick + 1;
      const s = steer(nav, jump.graph, jump.e, null, tick, { sprint: true });
      if (isHeld(s.buttons, BUTTON.jump) && !isHeld(previous, BUTTON.jump)) presses += 1;
      previous = s.buttons;
      jump.sim.step(new Map([[jump.e.id, { tick, moveX: s.moveX, moveZ: s.moveZ, yaw: s.yaw, pitch: 0, buttons: s.buttons }]]));
    }
    expect(nav.index).toBe(nav.path.length);
    expect(presses).toBe(1);
    idle(jump.sim, jump.e, 0.3);
    expect(jump.e.pos.y).toBeCloseTo(0.6, 1);

    const walk = await start(courseLevel('crouch', 'walk'), BOX_START);
    const walkNav = createNavState();
    expect(setGoal(walkNav, walk.graph, walk.e.pos, 'box_top', walk.sim.state.tick + 1)).toBe(true);
    const run = drive(walk.sim, walk.e, walk.graph, walkNav, 6);
    expect(run.recoveries[0]).toBe('jump');
  });
});

// ── Stuck recovery ──────────────────────────────────────────────────────────

describe('stuck recovery (real Sim)', () => {
  const service = SALTWORKS_LEVEL.spawnZones?.find((z) => z.side === 'defend')?.points[0];
  if (!service) throw new Error('expected a defender spawn');

  it('jumps, then blocks the link and replans around a blocked door, and still arrives', async () => {
    // The hall's back door (corridor → site A) bricked up; the graph still has the link.
    const bricked: LevelDef = {
      ...SALTWORKS_LEVEL,
      id: 'saltworks_bricked',
      boxes: [...SALTWORKS_LEVEL.boxes, { center: [-6, 1.3, -32], size: [0.4, 2.6, 2.4], surface: 'wall' }],
    };
    const { sim, graph, e } = await start(bricked, service);
    const nav = createNavState();
    const goal = siteAnchor(graph, 'A').id;
    expect(setGoal(nav, graph, e.pos, goal, sim.state.tick + 1)).toBe(true);
    expect(nav.path).toContain('hall_door_back');
    const run = drive(sim, e, graph, nav, 60);
    expect(run.recoveries[0]).toBe('jump');
    expect(run.recoveries).toContain('replan');
    expect(run.recoveries).not.toContain('newGoal');
    expect(run.arrived).toBe(true);
    expect(nav.path).not.toContain('hall_door_back');
    expect(nav.blocked.length).toBeGreaterThan(0);
    expect(siteAt(bricked, feet(e))?.id).toBe('A');
  });

  it('drops the goal when no way around is left', async () => {
    // One link straight through the solid south facade next to the office door.
    const walled: LevelDef = {
      ...SALTWORKS_LEVEL,
      nav: {
        nodes: [
          { id: 'yard', pos: [-18, 0, -1] },
          { id: 'office', pos: [-18, 0, -8] },
        ],
        links: [{ from: 'yard', to: 'office' }],
      },
    };
    const { sim, graph, e } = await start(walled, { position: [-18, 0, -1], yawDeg: 0 });
    const nav = createNavState();
    expect(setGoal(nav, graph, e.pos, 'office', sim.state.tick + 1)).toBe(true);
    const run = drive(sim, e, graph, nav, 10);
    expect(run.recoveries).toEqual(['jump', 'newGoal']);
    expect(nav.goal).toBeNull();
    // Two stuck windows after it reached the wall.
    expect(run.seconds).toBeGreaterThanOrEqual(2 * AI.nav.stuckWindowSeconds);
    expect(run.seconds).toBeLessThan(2 * AI.nav.stuckWindowSeconds + START_UP_SECONDS);
  });

  it('escalates jump → replan → … → new goal after AI.nav.maxStuckRetries', async () => {
    const { sim, graph, e } = await start(SALTWORKS_LEVEL, service);
    const nav = createNavState();
    const t0 = sim.state.tick + 1;
    expect(setGoal(nav, graph, e.pos, siteAnchor(graph, 'B').id, t0)).toBe(true);
    // The character never moves: steer() alone, the sim is not stepped.
    const recoveries: [number, StuckRecovery][] = [];
    for (let tick = t0; nav.goal !== null && tick < t0 + secondsToTicks(30); tick++) {
      const r = steer(nav, graph, e, null, tick).recovery;
      if (r) recoveries.push([tick - t0, r]);
    }
    const window = secondsToTicks(AI.nav.stuckWindowSeconds);
    const replans = Array.from({ length: AI.nav.maxStuckRetries - 1 }, (): StuckRecovery => 'replan');
    expect(recoveries.map(([, r]) => r)).toEqual(['jump', ...replans, 'newGoal']);
    expect(recoveries.map(([t]) => t)).toEqual(recoveries.map((_, i) => (i + 1) * window));
  });

  it('gives way at a node a standing teammate holds: no jump or replan, on to the next node or done beside it', async () => {
    // Courtyard lane y_wc_n → y_wc_m (10.5 m) → cont_w; the teammate stands on y_wc_m.
    const held = 'y_wc_m';
    const walk = async (path: string[], shareMate: boolean): Promise<DriveResult & { gap: number }> => {
      const first = NAV.nodes.find((n) => n.id === path[0]);
      if (!first) throw new Error('expected the lane');
      const { sim, graph, e } = await start(SALTWORKS_LEVEL, { position: first.pos, yawDeg: 0 });
      const mate = sim.spawnCharacter({ operatorId: SLOWEST, team: 0, controller: 'bot', position: graph.node(held).pos, yaw: 0 });
      idle(sim, e, SETTLE_SECONDS);
      const nav: NavState = { ...createNavState(), goal: path[path.length - 1] ?? null, path, index: 1 };
      const run = drive(sim, e, graph, nav, 12, { sprint: true, turnRateDeg: SLOWEST_TURN_DEG, teammates: shareMate ? [mate.pos] : [] });
      const last = graph.node(path[path.length - 1] ?? held).pos;
      return { ...run, gap: Math.hypot(last.x - e.pos.x, last.z - e.pos.z) };
    };
    const window = AI.nav.stuckWindowSeconds;

    // Without knowing about the teammate the bot pushes into it and starts the stuck recovery.
    expect((await walk(['y_wc_n', held], false)).recoveries[0]).toBe('jump');
    // Its goal held: done beside the teammate after one stuck window.
    const beside = await walk(['y_wc_n', held], true);
    expect(beside.recoveries).toEqual([]);
    expect(beside.arrived).toBe(true);
    expect(beside.gap).toBeLessThan(AI.nav.separationM);
    expect(beside.seconds).toBeLessThan(routeBound(10.5) + window);
    // A node on the way held: on past the teammate to the next one.
    const past = await walk(['y_wc_n', held, 'cont_w'], true);
    expect(past.recoveries).toEqual([]);
    expect(past.arrived).toBe(true);
    expect(past.gap).toBeLessThan(AI.nav.arriveRadiusM);
  });
});

// ── Steering output (no stepping) ───────────────────────────────────────────

describe('steer() output', () => {
  /** A bot on the courtyard lane at y_wc_n heading for y_wc_m, 10.5 m north-west-ish. */
  async function lane(): Promise<{ sim: Sim; graph: NavGraph; e: CharacterEntity; nav: NavState }> {
    const from = NAV.nodes.find((n) => n.id === 'y_wc_n');
    if (!from) throw new Error('expected y_wc_n');
    const { sim, graph, e } = await start(SALTWORKS_LEVEL, { position: from.pos, yawDeg: 0 });
    return { sim, graph, e, nav: onLink('y_wc_n', 'y_wc_m') };
  }
  const direction = (graph: NavGraph, e: CharacterEntity): Vec3 => {
    const t = graph.node('y_wc_m').pos;
    const len = Math.hypot(t.x - e.pos.x, t.z - e.pos.z);
    return vec3((t.x - e.pos.x) / len, 0, (t.z - e.pos.z) / len);
  };

  it('faces along the path, sprints on long straight segments only when allowed', async () => {
    const { sim, graph, e, nav } = await lane();
    const tick = sim.state.tick + 1;
    const s = steer(nav, graph, e, null, tick, { sprint: true });
    expect(s.moveZ).toBeCloseTo(1, 5);
    expect(s.moveX).toBeCloseTo(0, 5);
    expect(s.yaw).toBeCloseTo(anglesTo(e.pos, graph.node('y_wc_m').pos).yaw, 5);
    expect(isHeld(s.buttons, BUTTON.sprint)).toBe(true);
    expect(isHeld(steer(nav, graph, e, null, tick + 1).buttons, BUTTON.sprint)).toBe(false);
  });

  it('with a turn rate, turns towards the path at most that fast while still walking to the node', async () => {
    const { sim, graph, e, nav } = await lane();
    const target = graph.node('y_wc_m').pos;
    const gap = (): number => Math.hypot(target.x - e.pos.x, target.z - e.pos.z);
    const turnTicks = Math.ceil(Math.abs(angleDelta(e.yaw, anglesTo(e.pos, target).yaw)) / turnStep(SLOWEST_TURN_DEG));
    expect(turnTicks).toBeGreaterThan(secondsToTicks(0.5)); // the lane starts facing away from the path
    const startGap = gap();
    for (let i = 0; i < turnTicks; i++) {
      const tick = sim.state.tick + 1;
      const yaw = e.yaw;
      const d = direction(graph, e);
      const s = steer(nav, graph, e, null, tick, { turnRateDeg: SLOWEST_TURN_DEG });
      expect(Math.abs(angleDelta(yaw, s.yaw))).toBeLessThanOrEqual(turnStep(SLOWEST_TURN_DEG) + 1e-9);
      // The move, relative to the turned facing, still points at the node.
      const fwd = forwardFromAngles(s.yaw, 0);
      const right = rightFromYaw(s.yaw);
      expect(right.x * s.moveX + fwd.x * s.moveZ).toBeCloseTo(d.x, 5);
      expect(right.z * s.moveX + fwd.z * s.moveZ).toBeCloseTo(d.z, 5);
      sim.step(new Map([[e.id, { tick, moveX: s.moveX, moveZ: s.moveZ, yaw: s.yaw, pitch: 0, buttons: s.buttons }]]));
    }
    expect(Math.abs(angleDelta(e.yaw, anglesTo(e.pos, target).yaw))).toBeLessThan(DEG2RAD);
    expect(startGap - gap()).toBeGreaterThan(1);
  });

  it('strafe-walks relative to a given facing, without sprinting', async () => {
    const { sim, graph, e, nav } = await lane();
    const faceYaw = anglesTo(e.pos, graph.node('y_wc_m').pos).yaw + Math.PI / 2; // path is on the right hand
    const s = steer(nav, graph, e, faceYaw, sim.state.tick + 1, { sprint: true });
    expect(s.yaw).toBe(faceYaw);
    expect(s.moveX).toBeCloseTo(1, 5);
    expect(s.moveZ).toBeCloseTo(0, 5);
    expect(isHeld(s.buttons, BUTTON.sprint)).toBe(false);
  });

  it('sidesteps teammates ahead within AI.nav.separationM and ignores those behind or far', async () => {
    const { sim, graph, e, nav } = await lane();
    const d = direction(graph, e);
    const at = (dist: number): Vec3 => vec3(e.pos.x + d.x * dist, e.pos.y, e.pos.z + d.z * dist);
    const tick = sim.state.tick + 1;
    const moveX = (teammates: Vec3[]): number => steer(nav, graph, e, null, tick, { teammates }).moveX;
    expect(moveX([at(AI.nav.separationM / 2)])).toBeGreaterThan(0.1);
    expect(moveX([at(-AI.nav.separationM / 2)])).toBeCloseTo(0, 5);
    expect(moveX([at(AI.nav.separationM * 2)])).toBeCloseTo(0, 5);
  });
});
