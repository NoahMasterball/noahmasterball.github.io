import { distance } from '../../sim/math.ts';
import type { NavEdge, NavGraph, NavNode } from './graph.ts';

// NEW — A* over the waypoint graph (ADR-0011 §5): Euclidean heuristic (admissible and consistent,
// every edge costs at least its length), edge cost = length × AI.nav.linkCost[kind], blocked edges
// skipped. Deterministic: equal f values go to the lower node index, and edges are relaxed in
// link-definition order with strict improvements only. Maps have ≤ ~100 nodes, so the open set is
// a plain list scanned for its minimum and nothing is cached.

/** True for edges the search must not use (links a bot got stuck on). */
export type EdgeBlocked = (edge: NavEdge) => boolean;

/** Cheapest node sequence from `start` to `goal` (both included), or null if unreachable. */
export function findPath(graph: NavGraph, start: NavNode, goal: NavNode, blocked?: EdgeBlocked): NavNode[] | null {
  const n = graph.nodes.length;
  const g = new Array<number>(n).fill(Infinity);
  const f = new Array<number>(n).fill(Infinity);
  const cameFrom = new Array<number>(n).fill(-1);
  const closed = new Array<boolean>(n).fill(false);
  const heuristic = (i: number): number => {
    const node = graph.nodes[i];
    return node ? distance(node.pos, goal.pos) : Infinity;
  };
  const fOf = (i: number): number => f[i] ?? Infinity;

  g[start.index] = 0;
  f[start.index] = heuristic(start.index);
  const open: number[] = [start.index];
  while (open.length > 0) {
    let pick = 0;
    for (let k = 1; k < open.length; k++) {
      const a = open[k] ?? 0;
      const b = open[pick] ?? 0;
      if (fOf(a) < fOf(b) || (fOf(a) === fOf(b) && a < b)) pick = k;
    }
    const current = open.splice(pick, 1)[0] ?? start.index;
    if (current === goal.index) return reconstruct(graph, cameFrom, current);
    closed[current] = true;
    const node = graph.nodes[current];
    if (!node) continue;
    for (const e of graph.edgesFrom(node)) {
      if (closed[e.to] || blocked?.(e)) continue;
      const tentative = (g[current] ?? Infinity) + e.cost;
      if (tentative >= (g[e.to] ?? Infinity)) continue;
      cameFrom[e.to] = current;
      g[e.to] = tentative;
      f[e.to] = tentative + heuristic(e.to);
      if (!open.includes(e.to)) open.push(e.to);
    }
  }
  return null;
}

function reconstruct(graph: NavGraph, cameFrom: readonly number[], end: number): NavNode[] {
  const path: NavNode[] = [];
  for (let i = end; i !== -1; i = cameFrom[i] ?? -1) {
    const node = graph.nodes[i];
    if (!node) throw new Error(`A* reached unknown node index ${i}`);
    path.push(node);
  }
  return path.reverse();
}

/** Summed edge lengths along a node sequence (metres). */
export function pathLength(path: readonly NavNode[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (a && b) total += distance(a.pos, b.pos);
  }
  return total;
}
