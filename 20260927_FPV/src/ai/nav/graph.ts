import { AI } from '../../config/sim.ts';
import { siteAt } from '../../data/content.ts';
import type { LevelDef, NavLinkKind, NavTag } from '../../data/schema.ts';
import { DEG2RAD, distance, fromTuple, type Vec3 } from '../../sim/math.ts';
import type { SimQuery } from '../../sim/query.ts';
import type { SimView } from '../types.ts';

// NEW — the runtime waypoint graph (ADR-0011 §5): LevelDef.nav (validated in src/data/content.ts)
// turned into indexed nodes with adjacency lists, plus the queries bots need (node by id, tag or
// site, nearest reachable node). Built once per level and sim; read-only afterwards, so it is not
// bot state and never needs serialising.

export interface NavNode {
  /** Position in NavGraph.nodes = definition order (A* breaks ties by it). */
  index: number;
  id: string;
  /** Feet position on the walkable surface. */
  pos: Vec3;
  tags: readonly NavTag[];
  /** Direction a hold node watches, radians like Command.yaw; null for other nodes. */
  watchYaw: number | null;
  /** Id of the site whose area contains the node (derived from LevelDef.sites), else null. */
  site: string | null;
}

/** One traversable direction of a link. */
export interface NavEdge {
  from: number;
  to: number;
  kind: NavLinkKind;
  length: number;
  /** A* cost: length × AI.nav.linkCost[kind] (≥ length, so the Euclidean heuristic holds). */
  cost: number;
}

const kneeHeight = (p: Vec3): Vec3 => ({ x: p.x, y: p.y + AI.nav.kneeHeightM, z: p.z });

export class NavGraph {
  readonly nodes: readonly NavNode[];
  private readonly byId: ReadonlyMap<string, NavNode>;
  private readonly edges: readonly (readonly NavEdge[])[];
  private readonly query: SimQuery;

  constructor(level: LevelDef, query: SimQuery) {
    const def = level.nav;
    if (!def) throw new Error(`Level '${level.id}' has no nav graph`);
    this.query = query;
    this.nodes = def.nodes.map((n, index) => ({
      index,
      id: n.id,
      pos: fromTuple(n.pos),
      tags: n.tags ?? [],
      watchYaw: n.watchYawDeg === undefined ? null : n.watchYawDeg * DEG2RAD,
      site: siteAt(level, n.pos)?.id ?? null,
    }));
    this.byId = new Map(this.nodes.map((n) => [n.id, n] as const));
    const edges: NavEdge[][] = this.nodes.map(() => []);
    const add = (from: NavNode, to: NavNode, kind: NavLinkKind): void => {
      const length = distance(from.pos, to.pos);
      edges[from.index]?.push({ from: from.index, to: to.index, kind, length, cost: length * AI.nav.linkCost[kind] });
    };
    for (const link of def.links) {
      const a = this.node(link.from);
      const b = this.node(link.to);
      const kind = link.kind ?? 'walk';
      add(a, b, kind);
      if (!link.oneWay) add(b, a, kind);
    }
    this.edges = edges;
  }

  node(id: string): NavNode {
    const n = this.byId.get(id);
    if (!n) throw new Error(`Unknown nav node '${id}'`);
    return n;
  }

  /** Edges leaving a node, in link-definition order. */
  edgesFrom(n: NavNode): readonly NavEdge[] {
    return this.edges[n.index] ?? [];
  }

  /** The edge from → to, if the link can be walked in that direction. */
  edge(from: NavNode, to: NavNode): NavEdge | undefined {
    return this.edgesFrom(from).find((e) => e.to === to.index);
  }

  tagged(tag: NavTag): NavNode[] {
    return this.nodes.filter((n) => n.tags.includes(tag));
  }

  siteNodes(siteId: string): NavNode[] {
    return this.nodes.filter((n) => n.site === siteId);
  }

  /** Knee-height line of sight between two feet positions: nothing taller than a step between. */
  clear(a: Vec3, b: Vec3): boolean {
    return this.query.lineOfSight(kneeHeight(a), kneeHeight(b));
  }

  /** The node to start a path from: of the AI.nav.snapCandidates closest nodes (vertical distance
   *  × verticalWeight, so the other floor counts as far), the first one in clear sight; the
   *  closest one if none is. */
  nearest(pos: Vec3): NavNode {
    const w = AI.nav.verticalWeight;
    const ranked = this.nodes
      .map((n) => ({ n, d: Math.hypot(n.pos.x - pos.x, (n.pos.y - pos.y) * w, n.pos.z - pos.z) }))
      .sort((a, b) => a.d - b.d || a.n.index - b.n.index)
      .slice(0, AI.nav.snapCandidates);
    const best = ranked.find(({ n }) => this.clear(pos, n.pos)) ?? ranked[0];
    if (!best) throw new Error('Nav graph has no nodes');
    return best.n;
  }
}

/** The graph of the view's level; the view's query answers its line-of-sight checks. */
export const createNavGraph = (view: Pick<SimView, 'level' | 'query'>): NavGraph => new NavGraph(view.level, view.query);
