import { beforeAll, describe, expect, it } from 'vitest';
import { findPath, pathLength } from '../../src/ai/nav/astar.ts';
import { NavGraph, type NavNode } from '../../src/ai/nav/graph.ts';
import { AI, CHARACTER, MATCH } from '../../src/config/sim.ts';
import { levelProblems, siteAt } from '../../src/data/content.ts';
import { SALTWORKS_LEVEL } from '../../src/data/levels/saltworks.ts';
import type { LevelDef, NavGraphDef, NavLinkDef, NavNodeDef, SiteDef } from '../../src/data/schema.ts';
import { eyeHeight } from '../../src/sim/hitbox.ts';
import { fromTuple, vec3, type Vec3 } from '../../src/sim/math.ts';
import { MODES } from '../../src/sim/modes/index.ts';
import type { SimQuery } from '../../src/sim/query.ts';
import { Sim } from '../../src/sim/sim.ts';

// The bot waypoint graph (ADR-0011 §5): data validation (content.ts), A* on toy graphs, and the
// Saltworks graph against the real colliders (Rapier via Sim.query in Node). The steering walks
// are in nav-walk.test.ts.

const NAV = SALTWORKS_LEVEL.nav as NavGraphDef;
const KNEE = AI.nav.kneeHeightM;
/** Walk links must also be clear where a standing character's eyes are. */
const EYE = eyeHeight(0);
/** Nodes must lie this close to the surface found below them. */
const ON_SURFACE = 0.02;

const withNav = (nav: NavGraphDef, extra: Partial<LevelDef> = {}): LevelDef => ({ ...SALTWORKS_LEVEL, ...extra, nav });
const problemsOf = (level: LevelDef): string => levelProblems(level).join('\n');

describe('nav graph data (content.ts)', () => {
  it('gives Saltworks a valid graph that elimination requires', () => {
    expect(levelProblems(SALTWORKS_LEVEL)).toEqual([]);
    expect(MODES.elimination.validateLevel(SALTWORKS_LEVEL)).toEqual([]);
    expect(MODES.elimination.validateLevel({ ...SALTWORKS_LEVEL, nav: undefined }).join('\n')).toMatch(/needs a nav graph/);
  });

  it('tags every kind of node and puts nodes inside both sites', () => {
    for (const tag of ['cover', 'hold', 'patrol'] as const) expect(NAV.nodes.some((n) => n.tags?.includes(tag)), tag).toBe(true);
    for (const site of SALTWORKS_LEVEL.sites ?? []) {
      expect(NAV.nodes.filter((n) => siteAt(SALTWORKS_LEVEL, n.pos)?.id === site.id).length, site.id).toBeGreaterThanOrEqual(3);
    }
  });

  it('reports broken references, duplicates, holds without a direction and long links', () => {
    const [a, b] = NAV.nodes;
    if (!a || !b) throw new Error('expected nodes');
    const far: NavNodeDef = { id: 'far', pos: [a.pos[0] + AI.nav.maxLinkM + 1, a.pos[1], a.pos[2]] };
    const broken = withNav({
      nodes: [...NAV.nodes, a, far, { id: 'lookout', pos: a.pos, tags: ['hold'] }],
      links: [
        ...NAV.links,
        { from: a.id, to: 'nowhere' },
        { from: b.id, to: b.id },
        { from: b.id, to: a.id, oneWay: true },
        { from: a.id, to: b.id, kind: 'crouch' },
        { from: a.id, to: 'far' },
        { from: 'far', to: 'lookout' },
      ],
    });
    const problems = problemsOf(broken);
    expect(problems).toMatch(/nav node ids must be unique/);
    expect(problems).toMatch(`'${a.id}' → 'nowhere' references an unknown node`);
    expect(problems).toMatch(`'${b.id}' → '${b.id}' links a node to itself`);
    expect(problems).toMatch(/duplicates another link between the same nodes/);
    expect(problems).toMatch(/hold node 'lookout' needs watchYawDeg/);
    expect(problems).toMatch(`'${a.id}' → 'far' is longer than ${AI.nav.maxLinkM} m`);
  });

  it('reports nodes that cannot be reached or cannot get back (one-way links honoured)', () => {
    const [a] = NAV.nodes;
    if (!a) throw new Error('expected nodes');
    const near = (id: string): NavNodeDef => ({ id, pos: [a.pos[0] + 1, a.pos[1], a.pos[2]] });
    const oneWayOut: NavLinkDef = { from: a.id, to: 'sink', oneWay: true };
    const oneWayIn: NavLinkDef = { from: 'source', to: a.id, oneWay: true };
    const problems = problemsOf(
      withNav({ nodes: [...NAV.nodes, near('island'), near('sink'), near('source')], links: [...NAV.links, oneWayOut, oneWayIn] }),
    );
    expect(problems).toMatch(/nav nodes unreachable from '[^']+': island, source/);
    expect(problems).toMatch(/nav nodes without a way back to '[^']+': island, sink/);
  });

  it('reports spawn points far from every node, sites without nodes and nodes outside the level', () => {
    const spawnIds = new Set(['wg_1', 'wg_2']);
    const extraSite: SiteDef = { id: 'C', name: 'Nowhere', center: [0, 1.5, 25], size: [1, 3, 1] };
    const problems = problemsOf(
      withNav(
        {
          nodes: [...NAV.nodes.filter((n) => !spawnIds.has(n.id)), { id: 'sky', pos: [0, 500, 0] }],
          links: NAV.links.filter((k) => !spawnIds.has(k.from) && !spawnIds.has(k.to)),
        },
        { sites: [...(SALTWORKS_LEVEL.sites ?? []), extraSite] },
      ),
    );
    expect(problems).toMatch(`spawn point west_gate[0] is farther than ${AI.nav.maxSpawnSnapM} m from every nav node`);
    expect(problems).toMatch(/site 'C' contains no nav node/);
    expect(problems).toMatch(/nav node 'sky' lies outside the level geometry/);
  });
});

// ── A* and snapping on toy graphs (no physics) ──────────────────────────────

/** A query that sees everything except what `blocked` says. */
const toyQuery = (blocked: (a: Vec3, b: Vec3) => boolean = () => false): SimQuery => ({
  lineOfSight: (a, b) => !blocked(a, b),
  groundBelow: () => 0,
  surfaceAlong: () => null,
  boxFree: () => true,
});
const toyGraph = (nav: NavGraphDef, query = toyQuery()): NavGraph =>
  new NavGraph({ id: 'toy', name: 'Toy', boxes: [], playerSpawn: { position: [0, 0, 0], yawDeg: 0 }, nav }, query);
const ids = (path: readonly NavNode[] | null): string[] | null => path?.map((n) => n.id) ?? null;

/** A 10 m square a–b–c–d. */
const SQUARE: NavGraphDef = {
  nodes: [
    { id: 'a', pos: [0, 0, 0] },
    { id: 'b', pos: [10, 0, 0] },
    { id: 'c', pos: [10, 0, 10] },
    { id: 'd', pos: [0, 0, 10] },
  ],
  links: [
    { from: 'a', to: 'b' },
    { from: 'b', to: 'c' },
    { from: 'c', to: 'd' },
    { from: 'd', to: 'a' },
  ],
};

describe('A* (toy graphs)', () => {
  it('finds the cheapest path and breaks ties by node order, deterministically', () => {
    const g = toyGraph(SQUARE);
    expect(ids(findPath(g, g.node('a'), g.node('c')))).toEqual(['a', 'b', 'c']);
    expect(ids(findPath(g, g.node('a'), g.node('a')))).toEqual(['a']);
    // Same square, d defined before b: the equal-cost route through d wins now.
    const swapped = toyGraph({ ...SQUARE, nodes: [SQUARE.nodes[0], SQUARE.nodes[3], SQUARE.nodes[2], SQUARE.nodes[1]] as NavNodeDef[] });
    expect(ids(findPath(swapped, swapped.node('a'), swapped.node('c')))).toEqual(['a', 'd', 'c']);
  });

  it('weights links by kind and skips blocked edges', () => {
    const diagonal = (kind: NavLinkDef['kind']): NavGraph => toyGraph({ ...SQUARE, links: [...SQUARE.links, { from: 'a', to: 'c', kind }] });
    // Diagonal 14.1 m: walked it beats the 20 m way round; crouched (× linkCost.crouch) it does not.
    expect(AI.nav.linkCost.crouch * Math.SQRT2 * 10).toBeGreaterThan(20);
    const walk = diagonal('walk');
    expect(ids(findPath(walk, walk.node('a'), walk.node('c')))).toEqual(['a', 'c']);
    const crouch = diagonal('crouch');
    expect(ids(findPath(crouch, crouch.node('a'), crouch.node('c')))).toEqual(['a', 'b', 'c']);
    const g = toyGraph(SQUARE);
    const blockAB = (e: { from: number; to: number }): boolean => e.from === g.node('a').index && e.to === g.node('b').index;
    expect(ids(findPath(g, g.node('a'), g.node('c'), blockAB))).toEqual(['a', 'd', 'c']);
    // Only that direction is blocked.
    expect(ids(findPath(g, g.node('b'), g.node('a'), blockAB))).toEqual(['b', 'a']);
  });

  it('honours one-way links and reports unreachable goals', () => {
    const g = toyGraph({ nodes: SQUARE.nodes, links: [{ from: 'a', to: 'b', oneWay: true }, { from: 'b', to: 'c' }] });
    expect(ids(findPath(g, g.node('a'), g.node('c')))).toEqual(['a', 'b', 'c']);
    expect(findPath(g, g.node('c'), g.node('a'))).toBeNull();
    expect(findPath(g, g.node('a'), g.node('d'))).toBeNull();
    expect(pathLength(findPath(g, g.node('a'), g.node('c')) ?? [])).toBeCloseTo(20);
  });

  it('snaps to the nearest node in sight, counting height differences extra', () => {
    const nav: NavGraphDef = {
      nodes: [
        { id: 'here', pos: [0, 0, 0] },
        { id: 'above', pos: [0.5, 4, 0] },
        { id: 'aside', pos: [3, 0, 0] },
      ],
      links: [
        { from: 'here', to: 'aside' },
        { from: 'above', to: 'aside' },
      ],
    };
    const p = vec3(0.5, 0, 0);
    // 'above' is 4 m straight up, but × verticalWeight that is further than 'aside' (2.5 m).
    expect(toyGraph(nav).nearest(vec3(0.4, 3.9, 0)).id).toBe('above');
    expect(toyGraph(nav).nearest(p).id).toBe('here');
    const wallToHere = toyQuery((_, b) => b.x === 0 && b.z === 0);
    expect(toyGraph(nav, wallToHere).nearest(p).id).toBe('aside');
    // Nothing in sight: the closest one anyway.
    expect(toyGraph(nav, toyQuery(() => true)).nearest(p).id).toBe('here');
  });
});

// ── Saltworks against the real colliders ───────────────────────────────────

/** Horizontal unit vector perpendicular to a → b (zero for vertical segments). */
function sideways(a: Vec3, b: Vec3): Vec3 {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  return len > 0 ? vec3(-dz / len, 0, dx / len) : vec3();
}

const lift = (p: Vec3, dy: number, side: Vec3 = vec3(), offset = 0): Vec3 =>
  vec3(p.x + side.x * offset, p.y + dy, p.z + side.z * offset);

describe('Saltworks nav graph (real Sim)', () => {
  let sim: Sim;
  let graph: NavGraph;
  beforeAll(async () => {
    sim = await Sim.create(SALTWORKS_LEVEL);
    graph = new NavGraph(SALTWORKS_LEVEL, sim.query);
  });

  it('has ground under every node, room to stand and a capsule-wide footprint', () => {
    const r = CHARACTER.radius + CHARACTER.controllerOffset;
    const bad: string[] = [];
    for (const n of graph.nodes) {
      const ground = sim.query.groundBelow(lift(n.pos, KNEE), KNEE + ON_SURFACE);
      if (ground === null || Math.abs(ground - n.pos.y) > ON_SURFACE) bad.push(`${n.id}: ground at ${ground}`);
      if (!sim.query.lineOfSight(lift(n.pos, KNEE), lift(n.pos, CHARACTER.standHeight))) bad.push(`${n.id}: no head-room`);
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        const out = vec3(Math.cos(a) * r, 0, Math.sin(a) * r);
        for (const h of [KNEE, EYE]) {
          const from = lift(n.pos, h);
          if (!sim.query.lineOfSight(from, vec3(from.x + out.x, from.y, from.z + out.z))) bad.push(`${n.id}: wall within ${r} m`);
        }
      }
    }
    expect([...new Set(bad)]).toEqual([]);
  });

  it('keeps every link clear for a capsule: knee height (walk: eyes too), drops as ledge + fall', () => {
    const bad: string[] = [];
    const r = CHARACTER.radius;
    for (const k of NAV.links) {
      const a = graph.node(k.from).pos;
      const b = graph.node(k.to).pos;
      const side = sideways(a, b);
      const name = `${k.from} → ${k.to}`;
      const drop = k.oneWay === true && a.y - b.y > AI.nav.arriveHeightM;
      const kind = k.kind ?? 'walk';
      const heights = kind === 'crouch' ? [KNEE] : kind === 'jump' ? [EYE] : [KNEE, EYE];
      for (const h of heights) {
        for (const o of [-r, 0, r]) {
          // A drop walks off the ledge at its own height, then falls straight down.
          const ledgeEnd = drop ? vec3(b.x, a.y, b.z) : b;
          if (!sim.query.lineOfSight(lift(a, h, side, o), lift(ledgeEnd, h, side, o))) bad.push(`${name} at ${h} m, offset ${o}`);
          if (drop && !sim.query.lineOfSight(lift(ledgeEnd, h, side, o), lift(b, h, side, o))) bad.push(`${name}: fall at ${h} m`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('routes every spawn point of both sides to both sites (A*)', () => {
    const sites = SALTWORKS_LEVEL.sites ?? [];
    expect(sites).toHaveLength(2);
    for (const zone of SALTWORKS_LEVEL.spawnZones ?? []) {
      expect(zone.points).toHaveLength(MATCH.teamSize);
      for (const [i, point] of zone.points.entries()) {
        const start = graph.nearest(fromTuple(point.position));
        for (const site of sites) {
          const goal = graph.siteNodes(site.id)[0];
          const path = goal ? findPath(graph, start, goal) : null;
          expect(path, `${zone.id}[${i}] → ${site.id}`).not.toBeNull();
          expect(path?.[path.length - 1]?.site).toBe(site.id);
        }
      }
    }
  });
});
