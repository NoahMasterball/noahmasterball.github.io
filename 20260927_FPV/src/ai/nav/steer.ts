import { AI, secondsToTicks } from '../../config/sim.ts';
import { BUTTON } from '../../sim/command.ts';
import { anglesTo, forwardFromAngles, rightFromYaw, type Vec3 } from '../../sim/math.ts';
import type { CharacterEntity } from '../../sim/types.ts';
import { turnTowards } from '../aim.ts';
import { findPath } from './astar.ts';
import type { NavGraph, NavNode } from './graph.ts';

// NEW — path following (ADR-0011 §5): turns a bot's NavState into the move/look/button part of a
// Command. Floors, stairs, ramps and drops are plain walking (the character controller climbs
// and falls), `crouch` links hold crouch, `jump` links press jump once near their start. Stuck
// recovery: too little progress over AI.nav.stuckWindowSeconds → (1) jump, (2) block the link
// for blockLinkSeconds and replan from the nearest node, (3) after maxStuckRetries drop the goal
// so the brain picks a new one — unless a teammate holds the spot (crowdedNode: the node counts
// as reached). Never teleports. NavState is plain data owned by the bot.

export interface NavState {
  /** Goal node id; null = no goal (never set, or dropped after getting stuck). */
  goal: string | null;
  /** Node ids from the start node to the goal. */
  path: string[];
  /** Index in `path` of the node being walked to (path.length = arrived). */
  index: number;
  /** Start of the current progress window: tick and horizontal distance to the target then. */
  progress: { tick: number; dist: number };
  /** Link directions skipped by planning until `untilTick`. */
  blocked: { from: string; to: string; untilTick: number }[];
  /** Stuck detections since a node was last reached (the recovery stage). */
  stuck: number;
  /** Path index whose jump link has pressed jump (one press per traversal); −1 = none. */
  jumpedIndex: number;
  /** Tick of the last steer() call; a gap (the brain stopped steering) restarts the progress
   *  window instead of reading the pause as being stuck. */
  lastTick: number;
}

export type StuckRecovery = 'jump' | 'replan' | 'newGoal';

export interface Steer {
  /** Command inputs, relative to `yaw`. */
  moveX: number;
  moveZ: number;
  yaw: number;
  buttons: number;
  /** The goal node has been reached. */
  arrived: boolean;
  /** Stuck recovery started this tick; `newGoal` means the goal was dropped (nav.goal = null). */
  recovery: StuckRecovery | null;
}

export interface SteerOptions {
  /** Sprint on long straight walk segments (the brain passes: no known contacts). Default off. */
  sprint?: boolean;
  /** Feet positions of teammates; those ahead within AI.nav.separationM push sideways. */
  teammates?: readonly Vec3[];
  /** Look speed (degrees per second: the bot tier's turnRateDeg) while facing along the path:
   *  the facing turns towards the path at most this fast, the move keeps heading for the next
   *  node meanwhile (strafe-walked). Default: faces along the path at once. */
  turnRateDeg?: number;
}

const STUCK_WINDOW_TICKS = secondsToTicks(AI.nav.stuckWindowSeconds);
const BLOCK_LINK_TICKS = secondsToTicks(AI.nav.blockLinkSeconds);
/** Directions shorter than this (m) count as "already there" (no move input). */
const MIN_DIRECTION = 1e-6;

export const createNavState = (): NavState => ({
  goal: null,
  path: [],
  index: 0,
  progress: { tick: 0, dist: 0 },
  blocked: [],
  stuck: 0,
  jumpedIndex: -1,
  lastTick: -1,
});

const horizontalDistance = (a: Vec3, b: Vec3): number => Math.hypot(b.x - a.x, b.z - a.z);

/** A node counts as reached within AI.nav.arriveRadiusM horizontally and arriveHeightM
 *  vertically (the floors differ in height, stairs are in between). */
export const reachedNode = (pos: Vec3, n: NavNode): boolean =>
  horizontalDistance(pos, n.pos) < AI.nav.arriveRadiusM && Math.abs(n.pos.y - pos.y) < AI.nav.arriveHeightM;

export function clearGoal(nav: NavState): void {
  nav.goal = null;
  nav.path = [];
  nav.index = 0;
  nav.stuck = 0;
  nav.jumpedIndex = -1;
}

const pathNode = (nav: NavState, graph: NavGraph, i: number): NavNode | null => {
  const id = nav.path[i];
  return id === undefined ? null : graph.node(id);
};

function restartProgress(nav: NavState, graph: NavGraph, pos: Vec3, tick: number): void {
  const target = pathNode(nav, graph, nav.index);
  nav.progress = { tick, dist: target ? horizontalDistance(pos, target.pos) : 0 };
}

/** Plans from the nearest node to `goal` around the currently blocked links. Skips the start
 *  node when the next one is closer, on the same floor, in clear sight and a plain walk away
 *  (no backtracking to a node behind the bot). */
function plan(nav: NavState, graph: NavGraph, pos: Vec3, goal: string, tick: number): boolean {
  nav.blocked = nav.blocked.filter((b) => b.untilTick > tick);
  const start = graph.nearest(pos);
  const nodes = findPath(graph, start, graph.node(goal), (e) =>
    nav.blocked.some((b) => b.from === graph.nodes[e.from]?.id && b.to === graph.nodes[e.to]?.id),
  );
  if (!nodes) return false;
  nav.goal = goal;
  nav.path = nodes.map((n) => n.id);
  nav.index = 0;
  nav.jumpedIndex = -1;
  const next = nodes[1];
  const firstEdge = next ? graph.edge(start, next) : undefined;
  if (
    next &&
    firstEdge?.kind === 'walk' &&
    horizontalDistance(pos, next.pos) < horizontalDistance(start.pos, next.pos) &&
    Math.abs(next.pos.y - pos.y) < AI.nav.arriveHeightM &&
    graph.clear(pos, next.pos)
  ) {
    nav.index = 1;
  }
  restartProgress(nav, graph, pos, tick);
  return true;
}

/** Walks to `goal` from wherever `pos` is. Keeps the current path if the goal is unchanged (so a
 *  brain may call it every think tick). Returns false (and clears the goal) if unreachable. */
export function setGoal(nav: NavState, graph: NavGraph, pos: Vec3, goal: string, tick: number): boolean {
  if (nav.goal === goal && nav.path.length > 0) return true;
  nav.stuck = 0;
  if (plan(nav, graph, pos, goal, tick)) return true;
  clearGoal(nav);
  return false;
}

/** Plans again from `pos` to the current goal (after the bot left its path, e.g. while
 *  fighting). Returns false (and clears the goal) if there is none or it became unreachable. */
export function replan(nav: NavState, graph: NavGraph, pos: Vec3, tick: number): boolean {
  const goal = nav.goal;
  nav.stuck = 0;
  if (goal !== null && plan(nav, graph, pos, goal, tick)) return true;
  clearGoal(nav);
  return false;
}

/** One stuck detection: escalate through the recovery stages. */
function recover(nav: NavState, graph: NavGraph, pos: Vec3, tick: number): StuckRecovery {
  nav.stuck += 1;
  if (nav.stuck === 1) return 'jump';
  const goal = nav.goal;
  const from = nav.path[nav.index - 1];
  const to = nav.path[nav.index];
  if (from !== undefined && to !== undefined) nav.blocked.push({ from, to, untilTick: tick + BLOCK_LINK_TICKS });
  if (nav.stuck > AI.nav.maxStuckRetries || goal === null || !plan(nav, graph, pos, goal, tick)) {
    clearGoal(nav);
    return 'newGoal';
  }
  return 'replan';
}

// NEW — giving way at a spot a teammate holds: the stuck recovery (jump, replan, new goal)
// took ~6 s of visible pushing when a standing teammate occupied the node the bot walked to.
/** Stuck within AI.nav.separationM of the node it walks to (on its floor) with a teammate
 *  within separationM of the bot: the teammate holds the spot (stands on it or right before it),
 *  so the node counts as reached and the bot gives way instead of pushing, jumping and
 *  replanning. A node on the way only when the next link is a plain walk in clear sight (no
 *  missed jump or crouch, no corner cut through a wall); otherwise the recovery runs as usual. */
function crowdedNode(nav: NavState, graph: NavGraph, pos: Vec3, teammates: readonly Vec3[]): boolean {
  const near = (p: Vec3): boolean => horizontalDistance(pos, p) < AI.nav.separationM && Math.abs(p.y - pos.y) < AI.nav.arriveHeightM;
  const node = pathNode(nav, graph, nav.index);
  if (!node || !near(node.pos) || !teammates.some(near)) return false;
  const next = pathNode(nav, graph, nav.index + 1);
  return !next || (graph.edge(node, next)?.kind === 'walk' && graph.clear(pos, next.pos));
}

/** Lateral push away from teammates ahead within AI.nav.separationM, along `side` (the left/right
 *  normal of the travel direction). Someone dead ahead is passed on the right. */
function separation(self: Vec3, dir: { x: number; z: number }, teammates: readonly Vec3[]): number {
  const side = { x: -dir.z, z: dir.x };
  let push = 0;
  for (const q of teammates) {
    const ox = self.x - q.x;
    const oz = self.z - q.z;
    const d = Math.hypot(ox, oz);
    const ahead = -(ox * dir.x + oz * dir.z) >= 0;
    if (d < MIN_DIRECTION || d >= AI.nav.separationM || !ahead || Math.abs(q.y - self.y) >= AI.nav.arriveHeightM) continue;
    const lateral = (ox * side.x + oz * side.z) / d;
    const strength = 1 - d / AI.nav.separationM;
    push += (Math.abs(lateral) < MIN_DIRECTION ? 1 : Math.sign(lateral)) * strength;
  }
  return push;
}

/** Move/look/buttons towards the next node of the path. `faceYaw` null = face along the path;
 *  set while aiming (the move is then strafe-walked relative to it). Mutates `nav` only. */
export function steer(
  nav: NavState,
  graph: NavGraph,
  self: Readonly<CharacterEntity>,
  faceYaw: number | null,
  tick: number,
  opts: SteerOptions = {},
): Steer {
  const idle = (arrived: boolean, recovery: StuckRecovery | null = null): Steer => ({
    moveX: 0,
    moveZ: 0,
    yaw: faceYaw ?? self.yaw,
    buttons: 0,
    arrived,
    recovery,
  });
  const pos = self.pos;
  const resumed = nav.lastTick !== tick - 1;
  nav.lastTick = tick;
  if (nav.goal === null || !self.alive) return idle(false);

  let advanced = false;
  for (let n = pathNode(nav, graph, nav.index); n && reachedNode(pos, n); n = pathNode(nav, graph, nav.index)) {
    // Reaching a node is progress, except the start node a (re)plan snapped to: a bot stuck
    // next to it would otherwise reset its recovery stage on every replan.
    if (nav.index > 0) nav.stuck = 0;
    nav.index += 1;
    advanced = true;
  }
  if (nav.index >= nav.path.length) return idle(true);
  if (advanced || resumed) restartProgress(nav, graph, pos, tick);

  let recovery: StuckRecovery | null = null;
  const dist = horizontalDistance(pos, pathNode(nav, graph, nav.index)?.pos ?? pos);
  if (dist < nav.progress.dist - AI.nav.stuckMinProgressM) {
    nav.progress = { tick, dist };
  } else if (tick - nav.progress.tick >= STUCK_WINDOW_TICKS) {
    if (crowdedNode(nav, graph, pos, opts.teammates ?? [])) {
      nav.stuck = 0;
      nav.index += 1;
      if (nav.index >= nav.path.length) return idle(true);
    } else {
      recovery = recover(nav, graph, pos, tick);
      if (recovery === 'newGoal') return idle(false, recovery);
    }
    restartProgress(nav, graph, pos, tick);
  }

  const target = pathNode(nav, graph, nav.index);
  if (!target) return idle(true, recovery);
  const from = pathNode(nav, graph, nav.index - 1);
  const kind = from ? (graph.edge(from, target)?.kind ?? 'walk') : 'walk';

  const dx = target.pos.x - pos.x;
  const dz = target.pos.z - pos.z;
  const len = Math.hypot(dx, dz);
  const dir = len > MIN_DIRECTION ? { x: dx / len, z: dz / len } : { x: 0, z: 0 };
  const push = separation(pos, dir, opts.teammates ?? []);
  const mx = dir.x - dir.z * push;
  const mz = dir.z + dir.x * push;
  const mLen = Math.hypot(mx, mz);
  const move = mLen > 1 ? { x: mx / mLen, z: mz / mLen } : { x: mx, z: mz };

  const pathYaw = len > MIN_DIRECTION ? anglesTo(pos, target.pos).yaw : self.yaw;
  const yaw = faceYaw ?? (opts.turnRateDeg === undefined ? pathYaw : turnTowards(self.yaw, pathYaw, opts.turnRateDeg));

  let buttons = 0;
  if (kind === 'crouch') buttons |= BUTTON.crouch;
  if (kind === 'jump' && from && nav.jumpedIndex !== nav.index && horizontalDistance(pos, from.pos) < AI.nav.jumpTriggerM) {
    buttons |= BUTTON.jump;
    nav.jumpedIndex = nav.index;
  }
  if (recovery === 'jump') buttons |= BUTTON.jump;
  if (opts.sprint && faceYaw === null && kind === 'walk' && len >= AI.nav.sprintMinSegmentM) buttons |= BUTTON.sprint;

  return { ...moveInput(move, yaw), yaw, buttons, arrived: false, recovery };
}

// NEW — ADR-0013 §7: the objective state walks straight to a point off the graph; the projection
// was private to steer().
/** Command move inputs (strafe, forward) for a horizontal world direction `move` (length ≤ 1)
 *  while looking along `yaw`. */
export function moveInput(move: { x: number; z: number }, yaw: number): { moveX: number; moveZ: number } {
  const fwd = forwardFromAngles(yaw, 0);
  const right = rightFromYaw(yaw);
  return { moveX: move.x * right.x + move.z * right.z, moveZ: move.x * fwd.x + move.z * fwd.z };
}
