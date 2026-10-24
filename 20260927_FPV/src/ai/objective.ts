import { AI, RELAY, secondsToTicks } from '../config/sim.ts';
import { siteAt } from '../data/content.ts';
import { anglesTo, cloneVec3, distance, fromTuple, type Vec3 } from '../sim/math.ts';
import { characterById } from '../sim/context.ts';
import { sideOf } from '../sim/modes/format.ts';
import { canDisrupt, plantSiteFor, relayOf } from '../sim/modes/relay.ts';
import type { CharacterEntity, EntityId, MatchState, RelayMatch, UplinkAction, UplinkChannel } from '../sim/types.ts';
import { MIN_DIRECTION, newestLead, type BotState, type BrainContext, type TacticalMap } from './brain.ts';
import { findPath } from './nav/astar.ts';
import type { NavNode } from './nav/graph.ts';
import { reachedNode } from './nav/steer.ts';

// NEW — bots and the Relay objective (ADR-0013 §7): what a bot's duty is now — walk to a site,
// plant, guard, disrupt. This module only decides; brain.ts acts a task out (state `objective`:
// walk to `node` over the nav graph, then straight to within `reachM` of `point`, then hold
// interact and/or face `faceYaw`). R2 (ADR-0013 §13): attackers push their target site (weighed
// against the team's intel once the engagement starts), the first of them on it without an enemy
// in sight plants, the others take the site's nodes (claimed, so arrivals do not push through
// the guards) facing out or towards their newest lead — before and after the plant;
// defenders keep their round plan until they know the attackers' site (a heard plant start, an
// attacker known on a site: the team's alarm), then rotate there; once the uplink runs they all
// go to it and the nearest calm one disrupts. Fights come first: the brain engages a visible
// enemy (holdsChannel is the exception) and asks for the duty again afterwards. Reads the
// simulation only (a bot's own knowledge, its team's positions, the public match state).

/** A bot's objective duty (plain data). */
export interface ObjectiveTask {
  kind: 'goto' | 'plant' | 'guard' | 'disrupt';
  siteId: string;
  /** Walk here first (nav node id); null = start at `point`. */
  node: string | null;
  /** Then straight to within `reachM` of it (disrupt: the uplink); null = the node is the spot. */
  point: Vec3 | null;
  reachM: number;
  /** Then hold interact (plant, disrupt). */
  interact: boolean;
  /** And face this yaw (guard); null = keep the facing. */
  faceYaw: number | null;
}

/** Defenders: the site the attackers were found at, as the team knows it. */
export interface ObjectiveAlarm {
  siteId: string;
  /** The bot that found it (it acts at once) … */
  by: EntityId;
  /** … its teammates from this tick (the evidence's tick + AI.perception.calloutDelayTicks). */
  readableTick: number;
}

/** What a bot heard of the enemy's uplink channel (BotState.heardUplink). */
export interface HeardUplink {
  action: UplinkAction;
  siteId: string;
  tick: number;
}

/** A team's objective roles this round (TeamPlan.objective; a fresh one per round plan). */
export interface ObjectivePlan {
  /** The attacker that plants (first on the site; replaced when it dies or is off the site while
   *  a teammate stands on it). */
  planter: EntityId | null;
  /** The defender that disrupts the uplink (replaced when it dies). */
  disrupter: EntityId | null;
  /** Since this tick the disrupter role has been free (null: taken, or no uplink yet). */
  disrupterFreeTick: number | null;
  /** Attackers: TeamPlan.targetSite has been weighed against the team's intel (the first duty of
   *  the engagement). */
  siteChecked: boolean;
  /** Defenders: where the team rotates to during the engagement (first evidence wins). */
  alarm: ObjectiveAlarm | null;
  /** The site nodes the team's bots have claimed to stand on (spotFor; one claim per bot). */
  spots: SpotClaim[];
}

/** A bot's place on a site (ObjectivePlan.spots). */
export interface SpotClaim {
  siteId: string;
  node: string;
  entityId: EntityId;
}

export const createObjectivePlan = (): ObjectivePlan => ({ planter: null, disrupter: null, disrupterFreeTick: null, siteChecked: false, alarm: null, spots: [] });

/** Whether two tasks ask for the same thing (the brain re-enters only on a change). */
export const sameTask = (a: Readonly<ObjectiveTask>, b: Readonly<ObjectiveTask>): boolean =>
  a.kind === b.kind &&
  a.siteId === b.siteId &&
  a.node === b.node &&
  a.reachM === b.reachM &&
  a.interact === b.interact &&
  a.faceYaw === b.faceYaw &&
  (a.point === b.point || (a.point !== null && b.point !== null && a.point.x === b.point.x && a.point.y === b.point.y && a.point.z === b.point.z));

/** Think ticks (the brain's calm decisions, and every think tick in state `objective`): the bot's
 *  duty now, or null (the brain's own rules decide). May assign the team's plan roles
 *  (ctx.plan.objective). Reads the simulation only. */
export type ObjectiveDuty = (bot: BotState, self: Readonly<CharacterEntity>, ctx: BrainContext, now: number) => ObjectiveTask | null;

const FINISH_CHANNEL_TICKS = secondsToTicks(AI.relay.finishChannelSeconds);
const RUSH_TICKS = secondsToTicks(AI.relay.rushSeconds);
/** Every calm bot thinks once within this many ticks (the brain's stagger). */
const THINK = AI.brain.thinkIntervalTicks;
/** An unstick walk (unstickTask) is given up after the steering's whole recovery time. */
const UNSTICK_TICKS = secondsToTicks(AI.nav.stuckWindowSeconds * AI.nav.maxStuckRetries);

// ── Pure helpers (brain.ts, tests) ──────────────────────────────────────────

/** The plant or disrupt `self` is channelling, or null. */
export function ownChannel(self: Readonly<CharacterEntity>, match: MatchState): UplinkChannel | null {
  const c = relayOf(match)?.channel ?? null;
  return c?.entityId === self.id ? c : null;
}

/** Whether `self` keeps holding its channel instead of turning to a visible enemy: it ends within
 *  AI.relay.finishChannelSeconds, or letting go would lose it for good — a restart could no
 *  longer finish before the phase clock ends (engagement: the round goes to the defenders;
 *  uplink: the uplink completes). */
export function holdsChannel(self: Readonly<CharacterEntity>, match: MatchState, now: number): boolean {
  const c = ownChannel(self, match);
  const end = relayOf(match)?.phaseEndTick ?? null;
  if (!c) return false;
  return c.endTick - now <= FINISH_CHANNEL_TICKS || (end !== null && end - now < c.endTick - c.startTick);
}

// ── Where to stand ──────────────────────────────────────────────────────────

/** Yaw from `from` towards `to`, or null when they are (horizontally) the same spot. */
const yawTowards = (from: Vec3, to: Vec3): number | null => (Math.hypot(to.x - from.x, to.z - from.z) > MIN_DIRECTION ? anglesTo(from, to).yaw : null);

const siteCentre = (ctx: BrainContext, siteId: string): Vec3 | null => {
  const s = ctx.view.level.sites?.find((x) => x.id === siteId);
  return s ? fromTuple(s.center) : null;
};

/** The sites with their centres. */
const siteCentres = (ctx: BrainContext, map: TacticalMap): { id: string; c: Vec3 }[] =>
  map.siteIds.flatMap((id) => {
    const c = siteCentre(ctx, id);
    return c ? [{ id, c }] : [];
  });

/** The site whose centre is closest to `p`, or null without sites. */
const closestSite = (ctx: BrainContext, map: TacticalMap, p: Vec3): string | null =>
  siteCentres(ctx, map).reduce<{ id: string; c: Vec3 } | null>((best, x) => (!best || distance(p, x.c) < distance(p, best.c) ? x : best), null)?.id ?? null;

/** Path-free distance to a node (vertical × AI.nav.verticalWeight: the other floor is far). */
const nodeCost = (self: Readonly<CharacterEntity>, n: NavNode): number =>
  Math.hypot(n.pos.x - self.pos.x, (n.pos.y - self.pos.y) * AI.nav.verticalWeight, n.pos.z - self.pos.z);

const nearestOf = (self: Readonly<CharacterEntity>, nodes: readonly NavNode[]): NavNode | null =>
  nodes.reduce<NavNode | null>((best, n) => (!best || nodeCost(self, n) < nodeCost(self, best) ? n : best), null);

/** The node of `siteId` (inside its volume) `self` stands on: its claim, kept for the round
 *  (ObjectivePlan.spots); without one, on the way the site node it already walks to, else the one
 *  nearest to it. On the site, or arrived at that node (a teammate on it counts as arrived), it
 *  claims the farthest node no living teammate has claimed whose path from here passes no claimed
 *  node — the site fills from the back, so nobody has to push past the guards standing on its
 *  nodes (a single path through a site, like Saltworks' tank hall, jammed at its pillar); none:
 *  the nearest node, shared (the steering gives way to a teammate on it). `except` (the planter
 *  or disrupter) holds none; nodes within RELAY.disruptRadiusM + AI.nav.separationM of
 *  `keepClear` (the uplink, for the disrupter's teammates) are left free while the site has
 *  others. Null if the site has no node. */
function spotFor(
  ctx: BrainContext,
  map: TacticalMap,
  bot: BotState,
  self: Readonly<CharacterEntity>,
  siteId: string,
  except: EntityId | null,
  keepClear: Vec3 | null = null,
): NavNode | null {
  const all = map.graph.siteNodes(siteId);
  const away = keepClear ? all.filter((n) => distance(n.pos, keepClear) > RELAY.disruptRadiusM + AI.nav.separationM) : all;
  const nodes = away.length > 0 ? away : all;
  const plan = ctx.plan.objective;
  plan.spots = plan.spots.filter((c) => c.entityId !== except && characterById(ctx.view.state, c.entityId)?.alive);
  const mine = plan.spots.find((c) => c.entityId === self.id && c.siteId === siteId && nodes.some((n) => n.id === c.node));
  if (mine) return map.graph.node(mine.node);
  const walking = bot.state === 'objective' ? nodes.find((n) => n.id === bot.task?.node) : undefined;
  const onSite = siteAt(ctx.view.level, [self.pos.x, self.pos.y, self.pos.z])?.id === siteId;
  if (!onSite && (walking === undefined || bot.arrivedTick === null)) return walking ?? nearestOf(self, nodes);
  const taken = new Set(plan.spots.filter((c) => c.siteId === siteId).map((c) => c.node));
  const start = map.graph.nearest(self.pos);
  const clearWay = (n: NavNode): boolean => !(findPath(map.graph, start, n) ?? []).some((x) => x !== start && x !== n && taken.has(x.id));
  const open = nodes.filter((n) => !taken.has(n.id) && clearWay(n)).sort((a, b) => nodeCost(self, b) - nodeCost(self, a) || a.index - b.index);
  const pick = open[0] ?? nearestOf(self, nodes);
  if (pick && self.id !== except) plan.spots = [...plan.spots.filter((c) => c.entityId !== self.id), { siteId, node: pick.id, entityId: self.id }];
  return pick;
}

/** Where a guard on node `n` of a site looks out: the node's watch direction; else along its first
 *  link that leaves the site; else away from the site's centre. */
function outwardYaw(ctx: BrainContext, map: TacticalMap, n: NavNode): number {
  if (n.watchYaw !== null) return n.watchYaw;
  const exit = map.graph.edgesFrom(n).map((e) => map.graph.nodes[e.to]).find((x) => x !== undefined && x.site !== n.site);
  const centre = n.site === null ? null : siteCentre(ctx, n.site);
  return (exit ? yawTowards(n.pos, exit.pos) : null) ?? (centre ? yawTowards(centre, n.pos) : null) ?? 0;
}

/** Where a bot on `node` looks: towards the newest lead it has (an enemy heard, or lost from
 *  sight, not investigated yet), else `otherwise`. */
function lookout(bot: BotState, self: Readonly<CharacterEntity>, node: NavNode, otherwise: number): number {
  const lead = newestLead(bot, self, Infinity);
  return (lead ? yawTowards(node.pos, lead.pos) : null) ?? otherwise;
}

/** Walk to a site node and face `faceYaw` there. */
const standTask = (kind: 'goto' | 'guard', siteId: string, node: NavNode, faceYaw: number): ObjectiveTask => ({
  kind,
  siteId,
  node: node.id,
  point: null,
  reachM: 0,
  interact: false,
  faceYaw,
});

/** Hold interact where the bot stands (it qualifies there). */
const holdHereTask = (kind: 'plant' | 'disrupt', siteId: string): ObjectiveTask => ({ kind, siteId, node: null, point: null, reachM: 0, interact: true, faceYaw: null });

// ── Duties ──────────────────────────────────────────────────────────────────

/** The walk of a duty or of an investigation (a lead followed from a duty) goes nowhere: stuck for
 *  a progress window while walking to a node out of clear sight (a path that starts behind a
 *  wall), or given up by the steering (no way to the task's node; an investigation's node is
 *  dropped — investigate() always sets one). */
function gaveUp(bot: BotState, self: Readonly<CharacterEntity>, map: TacticalMap): boolean {
  if (bot.state !== 'objective' && bot.state !== 'investigate') return false;
  const next = bot.nav.path[bot.nav.index];
  if (bot.nav.stuck > 0 && next !== undefined && !map.graph.clear(self.pos, map.graph.node(next).pos)) return true;
  if (bot.state === 'investigate') return bot.dest === null;
  const node = bot.task?.node ?? null;
  return node !== null && bot.dest === null && !reachedNode(self.pos, map.graph.node(node));
}

// NEW — a way back onto the graph: every path starts at graph.nearest(), which falls back to the
// closest node even when none of its candidates is in sight (a bot pushed off the graph in a
// fight, e.g. into the end of Saltworks' upper corridor, snapped to a node behind the hall wall
// and pressed against it for the rest of the round).
/** After the steering gave up: a `goto` straight to the closest node (AI.nav.verticalWeight) in
 *  clear sight at knee height that the bot is not standing on; null if none is. The duty keeps it
 *  until the bot is there or UNSTICK_TICKS passed, then walks its task again from there. */
function unstickTask(self: Readonly<CharacterEntity>, map: TacticalMap, siteId: string): ObjectiveTask | null {
  const target = map.graph.nodes
    .filter((n) => !reachedNode(self.pos, n))
    .sort((a, b) => nodeCost(self, a) - nodeCost(self, b) || a.index - b.index)
    .find((n) => map.graph.clear(self.pos, n.pos));
  return target ? { kind: 'goto', siteId, node: null, point: cloneVec3(target.pos), reachM: AI.nav.arriveRadiusM, interact: false, faceYaw: null } : null;
}

/** The unstick walk being acted out (the only task that is a bare point without interact), while
 *  it is short of its point and younger than UNSTICK_TICKS. */
function unsticking(bot: BotState, self: Readonly<CharacterEntity>, now: number): ObjectiveTask | null {
  const t = bot.state === 'objective' ? bot.task : null;
  if (!t || t.node !== null || t.point === null || t.interact) return null;
  const short = Math.hypot(t.point.x - self.pos.x, t.point.z - self.pos.z) > t.reachM;
  return short && now - bot.stateSinceTick < UNSTICK_TICKS ? t : null;
}

/** The attackers' target site: TeamPlan.targetSite (drawn with the round plan), weighed once, at
 *  the first duty of the engagement, against what the team knows: the site with the fewest known
 *  enemies closest to it wins, a tie keeps the draw. */
function targetSite(bot: BotState, ctx: BrainContext, map: TacticalMap): string | null {
  const plan = ctx.plan;
  if (!plan.objective.siteChecked) {
    plan.objective.siteChecked = true;
    const centres = siteCentres(ctx, map);
    const known = new Map(centres.map(({ id }) => [id, 0]));
    for (const contact of bot.contacts) {
      const closest = closestSite(ctx, map, contact.pos);
      if (closest !== null) known.set(closest, (known.get(closest) ?? 0) + 1);
    }
    const drawn = plan.targetSite;
    const least = Math.min(...known.values());
    if (drawn === null || (known.get(drawn) ?? 0) > least) plan.targetSite = centres.find(({ id }) => known.get(id) === least)?.id ?? drawn;
  }
  return plan.targetSite;
}

/** The attacker planting now: the one channelling a plant; else the plan's planter while it lives
 *  and stands on the site — or while `self` does not (nobody else could plant now). */
function planterOf(ctx: BrainContext, m: RelayMatch, siteId: string, self: Readonly<CharacterEntity>, selfOnSite: boolean): EntityId | null {
  if (m.channel?.action === 'plant') return m.channel.entityId;
  const id = ctx.plan.objective.planter;
  const p = id === null ? undefined : characterById(ctx.view.state, id);
  if (!p?.alive) return null;
  if (p.id !== self.id && selfOnSite && plantSiteFor(ctx.view.level, m, p)?.id !== siteId) return null;
  return p.id;
}

/** Attackers. Engagement: the pushers (and after AI.relay.rushSeconds before the clock everyone)
 *  go to the target site; the first on it without an enemy in sight plants where it stands, the
 *  others take the site's nodes facing out (`goto` until someone plants, then `guard`); holders
 *  keep their angles. Uplink: everyone guards the uplink's site. */
function attackerDuty(bot: BotState, self: Readonly<CharacterEntity>, ctx: BrainContext, map: TacticalMap, m: RelayMatch, now: number): ObjectiveTask | null {
  if (m.phase === 'uplink') {
    const up = m.uplink;
    const spot = up ? spotFor(ctx, map, bot, self, up.siteId, null) : null;
    return up && spot ? standTask('guard', up.siteId, spot, lookout(bot, self, spot, outwardYaw(ctx, map, spot))) : null;
  }
  const siteId = targetSite(bot, ctx, map);
  if (siteId === null) return null;
  const onSite = plantSiteFor(ctx.view.level, m, self)?.id === siteId;
  const planter = planterOf(ctx, m, siteId, self, onSite);
  if (onSite && (planter === null || planter === self.id) && !bot.contacts.some((c) => c.visible)) {
    ctx.plan.objective.planter = self.id;
    return holdHereTask('plant', siteId);
  }
  const rush = m.phaseEndTick !== null && m.phaseEndTick - now <= RUSH_TICKS;
  if (bot.role === 'hold' && !rush && planter !== self.id) return null;
  const spot = spotFor(ctx, map, bot, self, siteId, planter);
  return spot ? standTask(planter === null ? 'goto' : 'guard', siteId, spot, lookout(bot, self, spot, outwardYaw(ctx, map, spot))) : null;
}

/** Posts this bot's evidence of the attackers' site as the team's alarm (the first evidence wins):
 *  a heard plant start (bot.heardUplink), else an enemy it knows of standing in a site. */
function noteAlarm(bot: BotState, ctx: BrainContext): void {
  const plan = ctx.plan.objective;
  if (plan.alarm) return;
  let found: { siteId: string; tick: number } | null = bot.heardUplink?.action === 'plant' ? bot.heardUplink : null;
  for (const c of bot.contacts) {
    if (found) break;
    const site = siteAt(ctx.view.level, [c.pos.x, c.pos.y, c.pos.z]);
    if (site) found = { siteId: site.id, tick: c.tick };
  }
  if (found) plan.alarm = { siteId: found.siteId, by: bot.entityId, readableTick: found.tick + AI.perception.calloutDelayTicks };
}

/** Whether `self` is (or now becomes) the disrupter: the role stays with a living holder; a free
 *  role goes to the living defender nearest to the uplink — or, once it has been free for a whole
 *  think cycle (the nearest is fighting, or no bot), to any defender that asks — never to one with
 *  an enemy in sight. */
function claimsDisrupt(bot: BotState, self: Readonly<CharacterEntity>, ctx: BrainContext, uplink: Vec3, now: number): boolean {
  const plan = ctx.plan.objective;
  const holder = plan.disrupter === null ? undefined : characterById(ctx.view.state, plan.disrupter);
  if (holder?.alive) return holder.id === self.id;
  plan.disrupter = null;
  plan.disrupterFreeTick ??= now;
  if (bot.contacts.some((c) => c.visible)) return false;
  let nearest: Readonly<CharacterEntity> | null = null;
  for (const e of ctx.view.state.entities) {
    if (e.alive && e.team === self.team && (!nearest || distance(e.pos, uplink) < distance(nearest.pos, uplink))) nearest = e;
  }
  if (nearest?.id !== self.id && now - plan.disrupterFreeTick < THINK) return false;
  plan.disrupter = self.id;
  plan.disrupterFreeTick = null;
  return true;
}

/** Defenders. Engagement: the round plan (posts spread over the sites, patrols) until the team's
 *  alarm names the attackers' site; then everyone not posted at it takes its nodes. Uplink: the
 *  disrupter walks to the uplink (to AI.relay.approachFraction of RELAY.disruptRadiusM; once in
 *  reach it holds interact where it stands), the others take the site's nodes (clear of the
 *  disrupter's way) facing the uplink. */
function defenderDuty(bot: BotState, self: Readonly<CharacterEntity>, ctx: BrainContext, map: TacticalMap, m: RelayMatch, now: number): ObjectiveTask | null {
  const up = m.uplink;
  if (m.phase === 'uplink' && up) {
    if (claimsDisrupt(bot, self, ctx, up.pos, now)) {
      if (canDisrupt(m, self)) return holdHereTask('disrupt', up.siteId);
      return { kind: 'disrupt', siteId: up.siteId, node: map.graph.nearest(up.pos).id, point: cloneVec3(up.pos), reachM: RELAY.disruptRadiusM * AI.relay.approachFraction, interact: true, faceYaw: null };
    }
    const spot = spotFor(ctx, map, bot, self, up.siteId, ctx.plan.objective.disrupter, up.pos);
    return spot ? standTask('guard', up.siteId, spot, lookout(bot, self, spot, yawTowards(spot.pos, up.pos) ?? outwardYaw(ctx, map, spot))) : null;
  }
  noteAlarm(bot, ctx);
  const alarm = ctx.plan.objective.alarm;
  if (!alarm || (alarm.by !== self.id && now < alarm.readableTick)) return null;
  const post = bot.role === 'hold' ? (bot.post?.node ?? null) : null;
  if (post !== null && map.siteOf.get(post) === alarm.siteId) return null;
  const spot = spotFor(ctx, map, bot, self, alarm.siteId, null);
  const centre = siteCentre(ctx, alarm.siteId);
  return spot ? standTask('goto', alarm.siteId, spot, lookout(bot, self, spot, (centre ? yawTowards(spot.pos, centre) : null) ?? outwardYaw(ctx, map, spot))) : null;
}

/** The duties of Relay's engagement and uplink phases (ADR-0013 §7/§13); null in every other
 *  phase and mode — setup keeps the round plan (defenders take their posts and use placeables per
 *  their usage hints; attackers are frozen), the round's result lets everyone play on. */
export const objectiveDuty: ObjectiveDuty = (bot, self, ctx, now) => {
  const m = relayOf(ctx.view.state.match);
  const map = ctx.map;
  if (!m || !map || (m.phase !== 'live' && m.phase !== 'uplink')) return null;
  const walking = unsticking(bot, self, now);
  if (walking) return walking;
  if (gaveUp(bot, self, map)) {
    const siteId = bot.task?.siteId ?? closestSite(ctx, map, self.pos);
    return siteId === null ? null : unstickTask(self, map, siteId);
  }
  const task = sideOf(m, self.team) === 'attack' ? attackerDuty(bot, self, ctx, map, m, now) : defenderDuty(bot, self, ctx, map, m, now);
  return task && !task.interact && followsLead(bot, self) ? null : task;
};

/** Fight first: a bot on its way or on guard (not planting or disrupting) leaves a lead to the
 *  brain's calm rules — an investigation runs to its end, and the newest lead (the one the brain
 *  follows) starts one when it is within AI.brain.holdInvestigateM; then the duty comes back. */
function followsLead(bot: BotState, self: Readonly<CharacterEntity>): boolean {
  if (bot.state === 'investigate') return true;
  const lead = newestLead(bot, self, Infinity);
  return lead !== null && Math.hypot(lead.pos.x - self.pos.x, lead.pos.z - self.pos.z) <= AI.brain.holdInvestigateM;
}
