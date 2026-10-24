import { AI, GUNPLAY, secondsToTicks, type AiTier, type AiTierDef } from '../config/sim.ts';
import type { Side } from '../data/schema.ts';
import { BUTTON, idleCommand, isHeld, type Command } from '../sim/command.ts';
import { WEAPON_SLOTS } from '../sim/entities.ts';
import { eyeHeight } from '../sim/hitbox.ts';
import { anglesTo, cloneVec3, DEG2RAD, distance, forwardFromAngles, fromTuple, moveTowards, type Vec3 } from '../sim/math.ts';
import { roundMatchOf, sideOf, sideZones } from '../sim/modes/format.ts';
import { matchFrozen } from '../sim/modes/index.ts';
import { createRng, deriveSeed, randomIndex, type RngState } from '../sim/rng.ts';
import { activeWeapon, operatorOf, weaponOf } from '../sim/stats.ts';
import type { CharacterEntity, EntityId, MatchState, SimEvent } from '../sim/types.ts';
import { abilityStep, createBotAbilities, type BotAbilities } from './abilities.ts';
import { aimStep, createAimState, turnStep, turnTowards, type AimState } from './aim.ts';
import { receiveCallouts, shareContacts, type TeamIntel } from './intel.ts';
import type { NavGraph, NavNode } from './nav/graph.ts';
import { clearGoal, createNavState, moveInput, setGoal, steer, type NavState, type Steer } from './nav/steer.ts';
import { createObjectivePlan, holdsChannel, objectiveDuty, ownChannel, sameTask, type HeardUplink, type ObjectivePlan, type ObjectiveTask } from './objective.ts';
import { findContact, hear, perceive, targetView, type Contact } from './perception.ts';
import type { SimView } from './types.ts';

// NEW — the bot decision layer (ADR-0011 §3, SPEC §12 "Decisions"): a small state machine per
// combat bot — hold, patrol, investigate, engage, reposition, reload, retreat — on top of
// perception (what the bot knows), the aim model (how it shoots) and the nav steering (how it
// walks), plus ability use from the data's usage hints (abilities.ts, ADR-0012 §10). It only
// turns knowledge into a Command, the same record the keyboard produces; every rule of movement,
// weapons, abilities and damage stays in the sim. Plain data per bot (BotState) and per
// team (TeamPlan), owned by the controller (src/ai/controller.ts); never part of SimState.
// Deterministic: only the bot's and the team's own RNG streams and the sim tick. Relay's
// objective (ADR-0013 §7): src/ai/objective.ts decides a duty (ObjectiveTask), the state
// `objective` here acts it out.
//
// Clock: `now` = view.state.tick (the state the bot reads, as in perception); the Command
// carries the tick it is for (now + 1).

export type BotStateName = 'hold' | 'patrol' | 'investigate' | 'engage' | 'reposition' | 'reload' | 'retreat' | 'objective';

/** Round role (ADR-0011 §3): `hold` takes a post, `push` patrols (attackers: to a site first). */
export type BotRole = 'hold' | 'push';

/** Where a holding bot stands and looks. `node` null = where it stood (no nav walking). */
export interface Post {
  node: string | null;
  yaw: number;
  crouch: boolean;
}

/** An enemy the bot walks to, and where it believes the enemy is. */
export interface Lead {
  entityId: EntityId;
  pos: Vec3;
}

/** One combat bot's brain (plain data). */
export interface BotState {
  entityId: EntityId;
  tier: AiTier;
  rng: RngState;
  /** Stagger index: perception scans and decisions of the bots fall on different ticks. */
  k: number;
  state: BotStateName;
  stateSinceTick: number;
  role: BotRole;
  contacts: Contact[];
  aim: AimState;
  nav: NavState;
  /** The contact being fought (engage, retreat) or last fought. */
  targetId: EntityId | null;
  /** Destination node of the current state; null = none (patrol picks one, others stand). */
  dest: string | null;
  /** Tick the destination (or a post without one) was reached; null = on the way. */
  arrivedTick: number | null;
  post: Post | null;
  lead: Lead | null;
  /** Contacts with information up to this tick have been dealt with (no second investigation). */
  leadDoneTick: number;
  /** Where danger last came from (the last line of fire): reposition, retreat and reload look
   *  there and take cover from it. */
  threat: Vec3 | null;
  /** Ticks of the last hit taken and the last own kill (−1 = none this life). */
  hitTick: number;
  killTick: number;
  /** State to return to after a reload. */
  resume: BotStateName;
  /** Retreats at most once per life (then it fights it out). */
  retreated: boolean;
  /** Attackers: a node of the team's target site has been reached (then they hunt). */
  siteReached: boolean;
  /** Recently reached patrol nodes (AI.brain.patrolMemory). */
  visited: string[];
  /** Ability use: the running plan, check timing, scout and flush memory (abilities.ts). */
  abilities: BotAbilities;
  /** The objective duty being acted out (state `objective`), else null. */
  task: ObjectiveTask | null;
  /** Relay: the newest enemy plant or disrupt start this bot heard this life (hear()), else null
   *  (objective.ts: the defenders' alarm). */
  heardUplink: HeardUplink | null;
}

/** What a team's bots agree on for a round (plain data, owned by the controller). */
export interface TeamPlan {
  team: number;
  /** The team's own RNG stream (roles, posts, target site, Relay operator picks). */
  rng: RngState;
  /** Round the plan belongs to (roundKey); −1 = none yet. */
  round: number;
  side: Side | null;
  /** Attackers: the site the pushers go to first. */
  targetSite: string | null;
  /** Relay: the round whose operator picks the team's bots made (ai/picks.ts); −1 = none yet. */
  pickedRound: number;
  /** Relay objective roles (ai/objective.ts), fresh every round plan. */
  objective: ObjectivePlan;
}

/** The side-based reading of a level's waypoint graph (built once per controller). */
export interface TacticalMap {
  graph: NavGraph;
  /** The defended ground: node ids the defenders reach AI.brain.defendedMarginM (path) before
   *  the attackers (their nearest spawn zones). */
  defended: ReadonlySet<string>;
  /** Hold posts by the side whose approach they watch; `any` for side-less modes. */
  holds: Readonly<Record<Side | 'any', readonly NavNode[]>>;
  /** Patrol pools: defenders walk the defended ground's patrol and site nodes, attackers hunt
   *  it (its hold, cover, patrol and site nodes); `any`: patrol and site nodes. */
  patrol: Readonly<Record<Side | 'any', readonly NavNode[]>>;
  /** Site id each node belongs to or is closest to (defender posts are spread over the sites). */
  siteOf: ReadonlyMap<string, string | null>;
  siteIds: readonly string[];
}

/** What a bot reads besides its own state (built by the controller every tick). */
export interface BrainContext {
  view: SimView;
  map: TacticalMap | null;
  intel: TeamIntel;
  plan: TeamPlan;
  /** Feet positions of the bot's living teammates (steering separation). */
  teammates: readonly Vec3[];
}

const THINK = AI.brain.thinkIntervalTicks;
const HOLD_MAX_TICKS = secondsToTicks(AI.brain.holdMaxSeconds);
const INVESTIGATE_TICKS = secondsToTicks(AI.brain.investigateSeconds);
const LOSE_TARGET_TICKS = secondsToTicks(AI.brain.loseTargetSeconds);
const PRIMARY_SLOT = 0;
/** Directions shorter than this (m) have no bearing (also objective.ts). */
export const MIN_DIRECTION = 1e-6;

// ── Setup ───────────────────────────────────────────────────────────────────

export function createBotState(entityId: EntityId, tier: AiTier, seed: number, k: number): BotState {
  return {
    entityId,
    tier,
    rng: createRng(deriveSeed(seed, entityId)),
    k,
    state: 'hold',
    stateSinceTick: 0,
    role: 'hold',
    contacts: [],
    aim: createAimState(),
    nav: createNavState(),
    targetId: null,
    dest: null,
    arrivedTick: null,
    post: null,
    lead: null,
    leadDoneTick: -1,
    threat: null,
    hitTick: -1,
    killTick: -1,
    resume: 'hold',
    retreated: false,
    siteReached: false,
    visited: [],
    abilities: createBotAbilities(),
    task: null,
    heardUplink: null,
  };
}

/** A team's plan stream: the stream id is negative, so it never collides with a bot's (entity
 *  ids start at 1). */
export const createTeamPlan = (team: number, seed: number): TeamPlan => ({
  team,
  rng: createRng(deriveSeed(seed, -(team + 1))),
  round: -1,
  side: null,
  targetSite: null,
  pickedRound: -1,
  objective: createObjectivePlan(),
});

/** The round a plan is made for: the rounds of a round mode; side-less modes plan once. */
export const roundKey = (match: MatchState): number => roundMatchOf(match)?.round ?? 0;

// NEW — shortest path costs from one node to all (A* in astar.ts answers one pair; the side
// halves need every node's distance from the spawns).
/** A* edge costs from `start` to every node (Dijkstra; Infinity = unreachable). */
function costsFrom(graph: NavGraph, start: NavNode): number[] {
  const cost = graph.nodes.map((): number => Infinity);
  const done = graph.nodes.map(() => false);
  cost[start.index] = 0;
  for (;;) {
    let best = -1;
    for (let i = 0; i < cost.length; i++) {
      if (!done[i] && (cost[i] ?? Infinity) < (best < 0 ? Infinity : (cost[best] ?? Infinity))) best = i;
    }
    const node = graph.nodes[best];
    if (!node) return cost;
    done[best] = true;
    for (const e of graph.edgesFrom(node)) cost[e.to] = Math.min(cost[e.to] ?? Infinity, (cost[best] ?? Infinity) + e.cost);
  }
}

/** Per node the cheapest path cost from any spawn zone of a side (its first point's node);
 *  null if the level has no zone for the side. */
function sideCosts(view: SimView, graph: NavGraph, side: Side): number[] | null {
  const tables = sideZones(view.level, side).flatMap((z) => {
    const p = z.points[0];
    return p ? [costsFrom(graph, graph.nearest(fromTuple(p.position)))] : [];
  });
  if (tables.length === 0) return null;
  return graph.nodes.map((n) => Math.min(...tables.map((t) => t[n.index] ?? Infinity)));
}

/** The side a hold post serves, from the neighbour its watch direction points at most: if that
 *  way leads towards the attackers' spawn and away from the defenders' (path costs), it watches
 *  the attackers' approach — a defender post; the reverse is an attacker post. Posts that watch
 *  no neighbour, or one both sides come through (equal within MIN_DIRECTION), belong to the
 *  half they stand in. */
function holdSide(graph: NavGraph, n: NavNode, att: readonly number[], def: readonly number[]): Side {
  const f = forwardFromAngles(n.watchYaw ?? 0, 0);
  let watched: NavNode | null = null;
  let bestDot = 0;
  for (const e of graph.edgesFrom(n)) {
    const m = graph.nodes[e.to];
    if (!m) continue;
    const dx = m.pos.x - n.pos.x;
    const dz = m.pos.z - n.pos.z;
    const len = Math.hypot(dx, dz);
    const dot = len > MIN_DIRECTION ? (dx * f.x + dz * f.z) / len : 0;
    if (dot > bestDot) {
      watched = m;
      bestDot = dot;
    }
  }
  const cost = (t: readonly number[], x: NavNode): number => t[x.index] ?? Infinity;
  if (watched) {
    const towardAttackers = cost(att, n) - cost(att, watched) - (cost(def, n) - cost(def, watched));
    if (Math.abs(towardAttackers) > MIN_DIRECTION) return towardAttackers > 0 ? 'defend' : 'attack';
  }
  return cost(def, n) < cost(att, n) ? 'defend' : 'attack';
}

/** Reads the level's waypoint graph by side (build once per controller; costs a few rays). */
export function createTacticalMap(view: SimView, graph: NavGraph): TacticalMap {
  const holds = graph.tagged('hold');
  const isSite = (n: NavNode): boolean => n.site !== null;
  const tagged = (n: NavNode, ...tags: NavNode['tags'][number][]): boolean => tags.some((t) => n.tags.includes(t));
  const anyPatrol = graph.nodes.filter((n) => tagged(n, 'patrol') || isSite(n));
  const sites = view.level.sites ?? [];
  const siteOf = new Map(
    graph.nodes.map((n) => {
      if (n.site !== null) return [n.id, n.site] as const;
      const closest = [...sites].sort((a, b) => distance(n.pos, fromTuple(a.center)) - distance(n.pos, fromTuple(b.center)))[0];
      return [n.id, closest?.id ?? null] as const;
    }),
  );
  const base = { graph, siteOf, siteIds: sites.map((s) => s.id) };
  const att = sideCosts(view, graph, 'attack');
  const def = sideCosts(view, graph, 'defend');
  if (!att || !def) {
    return { ...base, defended: new Set(), holds: { attack: holds, defend: holds, any: holds }, patrol: { attack: anyPatrol, defend: anyPatrol, any: anyPatrol } };
  }
  const defended = graph.nodes.filter((n) => (att[n.index] ?? Infinity) - (def[n.index] ?? Infinity) >= AI.brain.defendedMarginM);
  const sideOfHold = new Map(holds.map((n) => [n.id, holdSide(graph, n, att, def)] as const));
  return {
    ...base,
    defended: new Set(defended.map((n) => n.id)),
    holds: {
      attack: holds.filter((n) => sideOfHold.get(n.id) === 'attack'),
      defend: holds.filter((n) => sideOfHold.get(n.id) === 'defend'),
      any: holds,
    },
    patrol: {
      attack: defended.filter((n) => tagged(n, 'hold', 'cover', 'patrol') || isSite(n)),
      defend: defended.filter((n) => tagged(n, 'patrol') || isSite(n)),
      any: anyPatrol,
    },
  };
}

// ── Round plan ──────────────────────────────────────────────────────────────

const postAt = (n: NavNode, fallbackYaw: number): Post => ({ node: n.id, yaw: n.watchYaw ?? fallbackYaw, crouch: n.tags.includes('cover') });

/** Defender posts spread over the sites: one per site in turn, from a random first site. */
function defenderPosts(map: TacticalMap, rng: RngState, count: number): NavNode[] {
  const groups = map.siteIds.map((id) => map.holds.defend.filter((n) => map.siteOf.get(n.id) === id));
  const out: NavNode[] = [];
  let site = randomIndex(rng, Math.max(1, groups.length));
  while (out.length < count && groups.some((g) => g.length > 0)) {
    const group = groups[site % groups.length] ?? [];
    const [pick] = group.splice(randomIndex(rng, group.length), 1);
    if (pick) out.push(pick);
    site += 1;
  }
  return out;
}

/** Up to `count` distinct items of `pool` in random order (all of them: a permutation). */
export function draw<T>(pool: readonly T[], rng: RngState, count: number = pool.length): T[] {
  const left = [...pool];
  const out: T[] = [];
  while (out.length < count && left.length > 0) {
    const [pick] = left.splice(randomIndex(rng, left.length), 1);
    if (pick !== undefined) out.push(pick);
  }
  return out;
}

/** A new round for one team (ADR-0011 §3): AI.brain.holdFraction[side] of its bots (drawn
 *  from the team stream) take hold posts — defenders spread over the sites, attackers on
 *  their side's angles — the rest push; attackers pick the site they push to. Without a nav
 *  graph everyone holds where they stand. `selves` = the bots' characters, same order. */
export function planRound(plan: TeamPlan, bots: readonly BotState[], selves: readonly CharacterEntity[], ctx: Pick<BrainContext, 'view' | 'map'>, now: number): void {
  const match = ctx.view.state.match;
  const round = roundMatchOf(match);
  const map = ctx.map;
  plan.round = roundKey(match);
  plan.side = round ? sideOf(round, plan.team) : null;
  plan.objective = createObjectivePlan();
  plan.targetSite = plan.side === 'attack' && map && map.siteIds.length > 0 ? (map.siteIds[randomIndex(plan.rng, map.siteIds.length)] ?? null) : null;

  const order = draw(bots.map((_, i) => i), plan.rng);
  const holders = map ? Math.round((plan.side ? AI.brain.holdFraction[plan.side] : 0) * bots.length) : bots.length;
  const posts = !map ? [] : plan.side === 'defend' ? defenderPosts(map, plan.rng, holders) : draw(map.holds[plan.side ?? 'any'], plan.rng, holders);
  order.forEach((i, rank) => {
    const bot = bots[i];
    const self = selves[i];
    if (!bot || !self) return;
    const node = posts[rank];
    const holdInPlace = !map;
    bot.role = holdInPlace || node ? 'hold' : 'push';
    bot.post = node ? postAt(node, self.yaw) : holdInPlace ? { node: null, yaw: self.yaw, crouch: false } : null;
    resetMemory(bot);
    enterDefault(bot, now);
  });
}

// ── State changes ───────────────────────────────────────────────────────────

/** Forgets everything of the last life or round (a spawn, a new round plan). */
function resetMemory(bot: BotState): void {
  bot.contacts.length = 0;
  bot.aim = createAimState();
  bot.nav = createNavState();
  bot.targetId = null;
  bot.lead = null;
  bot.leadDoneTick = -1;
  bot.threat = null;
  bot.hitTick = -1;
  bot.killTick = -1;
  bot.retreated = false;
  bot.siteReached = false;
  bot.visited = [];
  bot.abilities = createBotAbilities();
  bot.heardUplink = null;
}

/** Every state walks from where the bot stands: the old path is dropped (and the objective task
 *  with it; enterObjective sets the new one). */
function enter(bot: BotState, state: BotStateName, now: number, dest: string | null = null): void {
  bot.state = state;
  bot.stateSinceTick = now;
  bot.dest = dest;
  bot.arrivedTick = null;
  bot.task = null;
  clearGoal(bot.nav);
}

/** Acts out an objective duty (ADR-0013 §7): walk to its node, then to its point, then hold. */
function enterObjective(bot: BotState, task: ObjectiveTask, now: number): void {
  enter(bot, 'objective', now, task.node);
  bot.task = task;
}

/** Back to the round role: the post, or patrol. */
function enterDefault(bot: BotState, now: number): void {
  if (bot.role === 'hold' && bot.post) {
    enter(bot, 'hold', now, bot.post.node);
    if (bot.post.node === null) bot.arrivedTick = now;
  } else {
    enter(bot, 'patrol', now);
  }
}

/** Holds where it stands, looking at `lookAt` (else ahead). */
function holdHere(bot: BotState, self: Readonly<CharacterEntity>, now: number, lookAt: Vec3 | null): void {
  bot.post = { node: null, yaw: lookAt ? anglesTo(self.pos, lookAt).yaw : self.yaw, crouch: false };
  enter(bot, 'hold', now);
  bot.arrivedTick = now;
}

/** A spawn (range respawn, round reset): fresh memory, back to the role. */
function onSpawn(bot: BotState, self: Readonly<CharacterEntity>, now: number): void {
  resetMemory(bot);
  if (bot.post?.node === null) bot.post.yaw = self.yaw;
  enterDefault(bot, now);
}

// ── Knowledge helpers ───────────────────────────────────────────────────────

const contactOf = (bot: BotState, id: EntityId | null): Contact | undefined => (id === null ? undefined : findContact(bot.contacts, id));

/** Closest visible contact; the current target is kept unless another visible one is
 *  AI.combat.switchTargetRatio × its distance or closer. Unseen: the current target stays. */
function chooseTarget(bot: BotState, self: Readonly<CharacterEntity>): EntityId | null {
  const current = contactOf(bot, bot.targetId);
  const d = (c: Contact): number => distance(self.pos, c.pos);
  let best: Contact | null = null;
  for (const c of bot.contacts) {
    if (c.visible && (!best || d(c) < d(best) || (d(c) === d(best) && c.entityId < best.entityId))) best = c;
  }
  if (!best) return current ? current.entityId : null;
  if (current?.visible && d(best) > AI.combat.switchTargetRatio * d(current)) return current.entityId;
  return best.entityId;
}

/** Newest unseen contact not dealt with yet (ties: the closest), within `maxM` horizontally. */
export function newestLead(bot: BotState, self: Readonly<CharacterEntity>, maxM: number): Contact | null {
  let best: Contact | null = null;
  const d = (c: Contact): number => Math.hypot(c.pos.x - self.pos.x, c.pos.z - self.pos.z);
  for (const c of bot.contacts) {
    if (c.visible || c.tick <= bot.leadDoneTick || d(c) > maxM) continue;
    if (!best || c.tick > best.tick || (c.tick === best.tick && (d(c) < d(best) || (d(c) === d(best) && c.entityId < best.entityId)))) best = c;
  }
  return best;
}

/** Cover (a `cover` node on the bot's floor — within AI.nav.arriveHeightM, so the way there is
 *  short — and within `maxM`), preferring nodes the threat cannot see (eye to eye):
 *  `near` = closest to the bot first (reposition, reload), `far` = farthest from the threat
 *  first (retreat). At most AI.brain.coverCandidates rays; null if none is in reach. */
function pickCover(ctx: BrainContext, self: Readonly<CharacterEntity>, threat: Vec3 | null, maxM: number, mode: 'near' | 'far'): NavNode | null {
  const map = ctx.map;
  if (!map) return null;
  const from = (p: Vec3): number => distance(self.pos, p);
  const candidates = map.graph
    .tagged('cover')
    .filter((n) => from(n.pos) <= maxM && from(n.pos) >= AI.nav.arriveRadiusM && Math.abs(n.pos.y - self.pos.y) < AI.nav.arriveHeightM)
    .sort((a, b) => (mode === 'near' || !threat ? from(a.pos) - from(b.pos) : distance(b.pos, threat) - distance(a.pos, threat)) || a.index - b.index)
    .slice(0, AI.brain.coverCandidates);
  if (!threat) return candidates[0] ?? null;
  const eye = (p: Vec3): Vec3 => ({ x: p.x, y: p.y + eyeHeight(0), z: p.z });
  return candidates.find((n) => !ctx.view.query.lineOfSight(eye(threat), eye(n.pos))) ?? candidates[0] ?? null;
}

/** The weapon slot a bot wants in hand: in a fight an empty weapon gives way to the other one
 *  when that is faster than its reload (GUNPLAY.weaponSwapSeconds); out of a fight the primary
 *  comes back while it has any ammunition. */
function wantedSlot(self: Readonly<CharacterEntity>, fighting: boolean): number {
  const slot = self.activeSlot;
  const carried = activeWeapon(self);
  const otherSlot = (slot + 1) % self.weapons.length;
  const other = self.weapons[otherSlot];
  if (fighting) {
    const slowReload = self.weapon.reloadRemaining > GUNPLAY.weaponSwapSeconds || carried.reserve <= 0;
    return carried.ammo <= 0 && other && other.ammo > 0 && slowReload ? otherSlot : slot;
  }
  const primary = self.weapons[PRIMARY_SLOT];
  return slot !== PRIMARY_SLOT && primary && primary.ammo + primary.reserve > 0 ? PRIMARY_SLOT : slot;
}

/** Out of a fight, the weapon in hand (the one the bot keeps) wants a reload: at or below
 *  AI.combat.reloadBelowFraction of its magazine, with reserve, not reloading or swapping. */
function wantsReload(self: Readonly<CharacterEntity>): boolean {
  const carried = activeWeapon(self);
  const ws = self.weapon;
  return (
    ws.reloadRemaining <= 0 &&
    ws.swapRemaining <= 0 &&
    wantedSlot(self, false) === self.activeSlot &&
    carried.reserve > 0 &&
    carried.ammo <= AI.combat.reloadBelowFraction * weaponOf(self).magazine
  );
}

const reloadDone = (self: Readonly<CharacterEntity>): boolean => self.weapon.reloadRemaining <= 0 && !wantsReload(self);

// ── Decisions (every AI.brain.thinkIntervalTicks, staggered) ────────────────

/** Walks to an unseen contact. Defenders only follow leads on the defended ground. */
function investigate(bot: BotState, ctx: BrainContext, lead: Contact, now: number): boolean {
  const map = ctx.map;
  if (!map) return false;
  const node = map.graph.nearest(lead.pos);
  if (ctx.plan.side === 'defend' && !map.defended.has(node.id)) {
    bot.leadDoneTick = Math.max(bot.leadDoneTick, lead.tick);
    return false;
  }
  enter(bot, 'investigate', now, node.id);
  bot.lead = { entityId: lead.entityId, pos: cloneVec3(lead.pos) };
  return true;
}

/** To nearby cover off the line of fire from `threat`, facing it; holds in place if none. */
function reposition(bot: BotState, self: Readonly<CharacterEntity>, ctx: BrainContext, threat: Vec3 | null, now: number): void {
  bot.threat = threat;
  const cover = pickCover(ctx, self, threat, AI.brain.repositionMaxM, 'near');
  if (cover) enter(bot, 'reposition', now, cover.id);
  else holdHere(bot, self, now, threat);
}

function startReload(bot: BotState, self: Readonly<CharacterEntity>, ctx: BrainContext, resume: BotStateName, now: number): void {
  const threat = bot.threat;
  const cover = threat && bot.hitTick >= 0 ? pickCover(ctx, self, threat, AI.brain.repositionMaxM, 'near') : null;
  enter(bot, 'reload', now, cover?.id ?? null);
  bot.resume = resume;
}

/** After a fight: reposition after an own kill, else back to the role. */
function afterFight(bot: BotState, self: Readonly<CharacterEntity>, ctx: BrainContext, now: number): void {
  if (bot.killTick >= bot.stateSinceTick) reposition(bot, self, ctx, bot.threat, now);
  else enterDefault(bot, now);
}

function decideEngage(bot: BotState, self: Readonly<CharacterEntity>, ctx: BrainContext, now: number): void {
  const target = contactOf(bot, bot.targetId);
  if (!target) {
    afterFight(bot, self, ctx, now);
    return;
  }
  const tier = AI.tiers[bot.tier];
  if (target.visible) {
    bot.threat = cloneVec3(target.pos);
    const low = self.health < tier.retreatHealthFraction * operatorOf(self).maxHealth;
    if (low && !bot.retreated && ctx.map) {
      bot.retreated = true;
      const cover = pickCover(ctx, self, target.pos, AI.brain.retreatMaxM, 'far');
      if (cover) enter(bot, 'retreat', now, cover.id);
    }
    return;
  }
  const seen = target.seenTick ?? target.firstSeenTick;
  if (bot.killTick > seen || bot.hitTick > seen) reposition(bot, self, ctx, bot.threat, now);
  else if (wantsReload(self)) startReload(bot, self, ctx, 'engage', now);
  else if (now - seen > LOSE_TARGET_TICKS && !investigate(bot, ctx, target, now)) enterDefault(bot, now);
}

/** Attackers leave holds after AI.brain.holdMaxSeconds, and so does anyone pushing. */
const leavesHolds = (bot: BotState, plan: TeamPlan): boolean => bot.role === 'push' || plan.side === 'attack';

/** hold, patrol and investigate: an objective duty first (Relay), else react to hits, reload,
 *  follow leads, move on. */
function decideCalm(bot: BotState, self: Readonly<CharacterEntity>, ctx: BrainContext, now: number): void {
  const task = objectiveDuty(bot, self, ctx, now);
  if (task) {
    enterObjective(bot, task, now);
    return;
  }
  if (bot.hitTick > bot.stateSinceTick) {
    reposition(bot, self, ctx, bot.threat, now);
    return;
  }
  if (wantsReload(self)) {
    startReload(bot, self, ctx, bot.state, now);
    return;
  }
  if (bot.state === 'investigate') {
    const lead = bot.lead;
    const c = lead ? contactOf(bot, lead.entityId) : undefined;
    const settled = bot.arrivedTick !== null && now - bot.arrivedTick >= INVESTIGATE_TICKS;
    if (!lead || !c || settled) {
      bot.leadDoneTick = now;
      enterDefault(bot, now);
    } else if (distance(c.pos, lead.pos) > AI.brain.leadUpdateM && !investigate(bot, ctx, c, now)) {
      enterDefault(bot, now);
    }
    return;
  }
  const guarding = bot.state === 'hold' && bot.role === 'hold' && ctx.plan.side === 'defend';
  const lead = newestLead(bot, self, guarding ? AI.brain.holdInvestigateM : Infinity);
  if (lead && investigate(bot, ctx, lead, now)) return;
  if (bot.state === 'hold' && bot.arrivedTick !== null && ctx.map && leavesHolds(bot, ctx.plan) && now - bot.arrivedTick >= HOLD_MAX_TICKS) {
    bot.role = 'push';
    enter(bot, 'patrol', now);
  }
}

function decide(bot: BotState, self: Readonly<CharacterEntity>, ctx: BrainContext, now: number): void {
  switch (bot.state) {
    case 'engage':
      decideEngage(bot, self, ctx, now);
      break;
    case 'reload':
      if (reloadDone(self)) {
        if (bot.resume === 'engage') decideEngage(bot, self, ctx, now);
        else enterDefault(bot, now);
      }
      break;
    case 'reposition':
    case 'retreat':
      if (bot.dest === null) holdHere(bot, self, now, bot.threat);
      break;
    case 'hold':
    case 'patrol':
    case 'investigate':
      decideCalm(bot, self, ctx, now);
      break;
    case 'objective': {
      // The duty is re-asked every think tick: none left → the round role; another → re-enter.
      // On the way and on guard a hit or an empty magazine is answered as in the calm states
      // (the duty comes back afterwards); a running plant or disrupt of its own is not given up
      // for either (damage does not interrupt it, the reload would).
      const task = objectiveDuty(bot, self, ctx, now);
      const channelling = ownChannel(self, ctx.view.state.match) !== null;
      if (!task) enterDefault(bot, now);
      else if (!channelling && bot.hitTick > bot.stateSinceTick) reposition(bot, self, ctx, bot.threat, now);
      else if (!channelling && wantsReload(self)) startReload(bot, self, ctx, bot.state, now);
      else if (!bot.task || !sameTask(task, bot.task)) enterObjective(bot, task, now);
      break;
    }
  }
}

// ── Acting (every tick) ─────────────────────────────────────────────────────

/** Next patrol node: attackers first a node of the target site, then (and everyone else) one
 *  of the AI.brain.patrolChoices nearest unvisited nodes of the side's pool. */
function pickPatrol(bot: BotState, self: Readonly<CharacterEntity>, ctx: BrainContext): string | null {
  const map = ctx.map;
  if (!map) return null;
  const site = ctx.plan.targetSite;
  if (site !== null && !bot.siteReached) {
    const nodes = map.graph.siteNodes(site);
    return nodes[randomIndex(bot.rng, nodes.length)]?.id ?? null;
  }
  const pool = map.patrol[ctx.plan.side ?? 'any'];
  const w = AI.nav.verticalWeight;
  const d = (n: NavNode): number => Math.hypot(n.pos.x - self.pos.x, (n.pos.y - self.pos.y) * w, n.pos.z - self.pos.z);
  const fresh = pool
    .filter((n) => !bot.visited.includes(n.id) && d(n) > AI.nav.arriveRadiusM)
    .sort((a, b) => d(a) - d(b) || a.index - b.index)
    .slice(0, AI.brain.patrolChoices);
  const pick = fresh.length > 0 ? fresh[randomIndex(bot.rng, fresh.length)] : pool[randomIndex(bot.rng, pool.length)];
  return pick?.id ?? null;
}

/** Walks towards bot.dest (planning when it changed); drops the destination when it cannot be
 *  reached or steering gave up on it. Faces `faceYaw`, or (null) turns along the path at the
 *  tier's turn rate like every other look change of the bot. Null = nothing to walk to. */
function travel(bot: BotState, self: Readonly<CharacterEntity>, ctx: BrainContext, now: number, faceYaw: number | null, sprint: boolean): Steer | null {
  const graph = ctx.map?.graph;
  if (!graph || bot.dest === null) return null;
  if (!setGoal(bot.nav, graph, self.pos, bot.dest, now)) {
    bot.dest = null;
    return null;
  }
  const s = steer(bot.nav, graph, self, faceYaw, now, { sprint, teammates: ctx.teammates, turnRateDeg: AI.tiers[bot.tier].turnRateDeg });
  if (s.recovery === 'newGoal') bot.dest = null;
  return s;
}

/** A look angle turned towards `to` by at most the tier's turn rate this tick. */
function turned(bot: BotState, from: number, to: number): number {
  return turnTowards(from, to, AI.tiers[bot.tier].turnRateDeg);
}

const bearing = (self: Readonly<CharacterEntity>, p: Vec3): number | null =>
  Math.hypot(p.x - self.pos.x, p.z - self.pos.z) > MIN_DIRECTION ? anglesTo(self.pos, p).yaw : null;

/** Faces `p` at the tier's turn rate (null: keeps the current facing). */
function faceTowards(bot: BotState, self: Readonly<CharacterEntity>, p: Vec3 | null): number {
  const b = p ? bearing(self, p) : null;
  return b === null ? self.yaw : turned(bot, self.yaw, b);
}

/** Whether a spread term of the weapon in hand (degrees: the hip cone, the extra cone at full
 *  move speed) puts shots further off at `dist` than the tier's fire tolerance. The brain
 *  refines the aim model's movement with it: no strafing where running ruins the shots (long
 *  range, weapons that need a standstill), and sights up where the hip cone is too wide (a
 *  DMR up close), not only beyond AI.combat.adsBeyondM. */
function coneMisses(self: Readonly<CharacterEntity>, tier: AiTierDef, dist: number, term: 'hipSpread' | 'spreadMoving'): boolean {
  return Math.tan(weaponOf(self)[term] * DEG2RAD) * dist > tier.fireToleranceM;
}

function applySteer(cmd: Command, s: Steer | null): void {
  if (!s) return;
  cmd.moveX = s.moveX;
  cmd.moveZ = s.moveZ;
  cmd.yaw = s.yaw;
  cmd.buttons |= s.buttons;
}

/** Presses the button of the wanted weapon slot (wantedSlot) — on alternate ticks at most: the
 *  sim reacts to press edges, like the reload button below. */
function weaponButtons(self: Readonly<CharacterEntity>, cmd: Command, fighting: boolean): void {
  const want = wantedSlot(self, fighting);
  const button = WEAPON_SLOTS[want]?.button;
  if (want !== self.activeSlot && button && !isHeld(self.lastButtons, BUTTON[button])) cmd.buttons |= BUTTON[button];
}

function act(bot: BotState, self: Readonly<CharacterEntity>, ctx: BrainContext, tick: number): Command {
  const now = ctx.view.state.tick;
  const tier = AI.tiers[bot.tier];
  const cmd = idleCommand(tick, self.yaw, self.pitch);
  const target = contactOf(bot, bot.targetId);
  const fighting = target?.visible === true && (bot.state === 'engage' || bot.state === 'retreat');
  const level = (): void => {
    cmd.pitch = moveTowards(self.pitch, 0, turnStep(tier.turnRateDeg));
  };
  /** The contact fought this tick once the aim model reacted to it (abilities' "in a fight"). */
  let fight: Contact | null = null;

  if (fighting || bot.state === 'engage') {
    const out = aimStep(bot.aim, tier, self, target ? targetView(ctx.view, target) : null, now, bot.rng);
    if (fighting && out.ready && target) fight = target;
    cmd.yaw = out.yaw;
    cmd.pitch = out.pitch;
    if (out.fire) cmd.buttons |= BUTTON.fire;
    const dist = target ? distance(self.pos, target.pos) : 0;
    if (out.ads || (out.ready && coneMisses(self, tier, dist, 'hipSpread'))) cmd.buttons |= BUTTON.ads;
    if (bot.state === 'engage' && !out.stop && !coneMisses(self, tier, dist, 'spreadMoving')) cmd.moveX = out.strafe;
  } else {
    aimStep(bot.aim, tier, self, null, now, bot.rng);
    level();
  }
  const noContacts = bot.contacts.length === 0;

  switch (bot.state) {
    case 'engage':
      break;
    case 'hold': {
      const post = bot.post;
      const s = bot.arrivedTick === null ? travel(bot, self, ctx, now, null, noContacts) : null;
      if (s && !s.arrived) {
        applySteer(cmd, s);
        break;
      }
      bot.arrivedTick ??= now;
      if (post) {
        cmd.yaw = turned(bot, self.yaw, post.yaw);
        if (post.crouch) cmd.buttons |= BUTTON.crouch;
      }
      break;
    }
    case 'patrol': {
      bot.dest ??= pickPatrol(bot, self, ctx);
      const s = travel(bot, self, ctx, now, null, noContacts);
      if (s?.arrived && bot.dest !== null) {
        const reached = bot.dest;
        if (ctx.map?.graph.node(reached).site === ctx.plan.targetSite) bot.siteReached = true;
        bot.visited = [...bot.visited, reached].slice(-AI.brain.patrolMemory);
        enter(bot, 'patrol', now);
      }
      applySteer(cmd, s);
      break;
    }
    case 'investigate': {
      const leadPos = bot.lead?.pos ?? null;
      const near = leadPos !== null && distance(self.pos, leadPos) < AI.brain.cautionM;
      const s = bot.arrivedTick === null ? travel(bot, self, ctx, now, near ? faceTowards(bot, self, leadPos) : null, !near) : null;
      if (s && !s.arrived) {
        applySteer(cmd, s);
        break;
      }
      bot.arrivedTick ??= now;
      cmd.yaw = faceTowards(bot, self, leadPos);
      break;
    }
    case 'objective': {
      // ADR-0013 §7: the task's node over the nav graph (none, or unreachable: from here), then
      // straight to within reachM of its point, then hold interact and/or face faceYaw.
      const task = bot.task;
      if (!task) break;
      const s = bot.arrivedTick === null ? travel(bot, self, ctx, now, null, noContacts) : null;
      if (s && !s.arrived) {
        applySteer(cmd, s);
        break;
      }
      bot.arrivedTick ??= now;
      const p = task.point;
      if (p && Math.hypot(p.x - self.pos.x, p.z - self.pos.z) > task.reachM) {
        cmd.yaw = faceTowards(bot, self, p);
        const b = bearing(self, p);
        if (b !== null) Object.assign(cmd, moveInput(forwardFromAngles(b, 0), cmd.yaw));
        break;
      }
      if (task.faceYaw !== null) cmd.yaw = turned(bot, self.yaw, task.faceYaw);
      if (task.interact) cmd.buttons |= BUTTON.interact;
      break;
    }
    case 'reposition':
    case 'retreat':
    case 'reload': {
      const face = fighting ? cmd.yaw : faceTowards(bot, self, bot.threat);
      const s = travel(bot, self, ctx, now, face, false);
      applySteer(cmd, s);
      cmd.yaw = face;
      if (s?.arrived && bot.state !== 'reload') {
        const node = bot.dest;
        bot.post = { node, yaw: bot.threat ? (bearing(self, bot.threat) ?? self.yaw) : self.yaw, crouch: node !== null && !!ctx.map?.graph.node(node).tags.includes('cover') };
        enter(bot, 'hold', now, node);
        bot.arrivedTick = now;
      }
      if (bot.state === 'reload' && wantsReload(self) && !isHeld(self.lastButtons, BUTTON.reload)) {
        cmd.buttons |= BUTTON.reload;
      }
      break;
    }
  }
  weaponButtons(self, cmd, fighting);
  abilityStep(bot, self, ctx, cmd, now, fight);
  return cmd;
}

// ── Per tick ────────────────────────────────────────────────────────────────

/** One bot's command for `tick` (= view.state.tick + 1; call for living bots, in entity-id
 *  order). Perception and callouts every tick; decisions on the bot's think ticks; engaging a
 *  newly visible enemy at once (unless it holds on to its own uplink channel: holdsChannel). While the
 *  mode freezes the bot's team (matchFrozen: the pre-round, Relay's setup for the attackers, the
 *  match end) the bot only stands and looks, so steering never reads the freeze as being stuck;
 *  every other phase (a round's result included) it plays on, like a player. Reads the
 *  simulation, never writes it. */
export function botCommand(bot: BotState, self: Readonly<CharacterEntity>, ctx: BrainContext, tick: number): Command {
  const view = ctx.view;
  const now = view.state.tick;
  if (matchFrozen(view.state.match, self.team)) {
    aimStep(bot.aim, AI.tiers[bot.tier], self, null, now, bot.rng);
    return idleCommand(tick, self.yaw, self.pitch);
  }
  perceive(view, self, bot.contacts, bot.k, bot.targetId);
  shareContacts(ctx.intel, self.id, bot.contacts, now);
  receiveCallouts(ctx.intel, self.id, bot.contacts, now);

  bot.targetId = chooseTarget(bot, self);
  const engage = bot.state !== 'engage' && bot.state !== 'retreat' && !holdsChannel(self, view.state.match, now);
  if (engage && contactOf(bot, bot.targetId)?.visible) enter(bot, 'engage', now);
  if ((now + bot.k) % THINK === 0) decide(bot, self, ctx, now);
  return act(bot, self, ctx, tick);
}

/** One tick's events for a bot (call for every bot, alive or not, after the step): its spawn
 *  resets it; own kills and hits taken mark the line of fire — a weapon hit the shooter's
 *  contact, an ability hit (burst, area) its source point, since the attacker is not there
 *  (ADR-0012 §10); then hearing (living bots), which also keeps the newest enemy uplink start
 *  heard (heardUplink). */
export function botObserve(bot: BotState, self: Readonly<CharacterEntity>, view: SimView, events: readonly SimEvent[]): void {
  let hitBy: EntityId | null = null;
  let burstAt: Vec3 | null = null;
  for (const ev of events) {
    if (ev.type === 'spawn' && ev.entityId === bot.entityId) {
      onSpawn(bot, self, ev.tick);
    } else if (ev.type === 'kill' && ev.attackerId === bot.entityId) {
      bot.killTick = ev.tick;
      const victim = findContact(bot.contacts, ev.victimId);
      if (victim) bot.threat = cloneVec3(victim.pos);
    } else if (ev.type === 'hit' && ev.victimId === bot.entityId) {
      bot.hitTick = ev.tick;
      if (ev.cause.kind === 'weapon') hitBy = ev.attackerId;
      else burstAt = ev.sourcePos;
    }
  }
  if (!self.alive) return;
  for (const ev of hear(view, self, bot.contacts, events, bot.rng)) bot.heardUplink = { action: ev.action, siteId: ev.siteId, tick: ev.tick };
  const source = contactOf(bot, hitBy);
  if (source) bot.threat = cloneVec3(source.pos);
  else if (burstAt) bot.threat = cloneVec3(burstAt);
}
