import { ABILITY_RULES, AI, secondsToTicks } from '../config/sim.ts';
import { getAbility } from '../data/content.ts';
import type { AbilityDef, ActivationKind, BotAbilityHint, BotAbilityUse } from '../data/schema.ts';
import { placementPose } from '../sim/abilities/placement.ts';
import { ballisticPitch, projectileGravity } from '../sim/abilities/projectiles.ts';
import { canActivate } from '../sim/abilities/resource.ts';
import { ABILITY_BUTTONS, BUTTON, clampPitch, commandLook, isHeld, type Command } from '../sim/command.ts';
import { eyeHeight, zoneWorldCenter } from '../sim/hitbox.ts';
import { angleDelta, anglesTo, distance, forwardFromAngles, fromTuple, moveTowards, type Vec3 } from '../sim/math.ts';
import { matchAbilityAllowed } from '../sim/modes/index.ts';
import { randomRange } from '../sim/rng.ts';
import { gadgetCount, operatorOf } from '../sim/stats.ts';
import { hasActivation, isAbilitySupported, type AbilityOf } from '../sim/systems/abilities.ts';
import { aimOf } from '../sim/systems/weapons.ts';
import type { AbilityState, CharacterEntity, EntityId } from '../sim/types.ts';
import { turnStep, turnTowards } from './aim.ts';
import type { BotState, BrainContext } from './brain.ts';
import { eyeAbove, type Contact } from './perception.ts';

// NEW — bots use abilities (ADR-0012 §10, SPEC §12 "Use ability"): the data's usage hint
// (AbilityDef.bot) says in which situation a bot uses an ability; this module only recognises the
// situation and acts it out through the same Command bits a player presses — the ability key, fire
// to confirm a placement, ADS to cancel it — and a look override for throws and placements. Every
// rule of the ability itself (resources, the mode's gate, placement, flight, effects) stays in the
// sim; the bot asks the sim's own pure helpers (placementPose, ballisticPitch, projectileGravity,
// canActivate, matchAbilityAllowed) so it never presses what the sim would refuse. Knowledge: the
// bot's contacts, its teammates' own state and SimQuery — never an enemy's state (no wall-hacks).
// Plain data per bot (BotAbilities, part of BotState); deterministic (the bot's RNG stream only).
//
// Clock: `now` = view.state.tick (the state the bot reads); the command acts in the next step, so
// what a command pressed is visible in the slot state at the next call.

/** A running activation that takes more than the one tick of a press. */
export interface BotAbilityPlan {
  slot: number;
  /** `aim`: turning the crosshair to the point (throws, placements); the key is pressed once it
   *  is there. `placing`: the ghost is up, fire confirms. `channel`: the key is held down. */
  phase: 'aim' | 'placing' | 'channel';
  /** Where the throw or the gadget goes; null for a channel. */
  point: Vec3 | null;
  /** A throw at a teammate follows its torso (support); null = the fixed point. */
  followId: EntityId | null;
  /** A placement must reach this position within the ability's footprint (flush: the contact's
   *  last known position); null = any valid pose. */
  reach: Vec3 | null;
  /** The aim is given up, the placement cancelled (ADS) or the channel released at this tick. */
  untilTick: number;
}

/** One bot's ability memory (plain data, part of BotState; reset every life and round). */
export interface BotAbilities {
  plan: BotAbilityPlan | null;
  /** Per slot: the next situation check waits until this tick — unless the bot's state changed or
   *  it was hit since the slot's last check (`checkedTick`), or (engage, escape) it is in a fight. */
  nextTryTick: number[];
  checkedTick: number[];
  /** Last use of a `scout` ability (null: none this life). */
  lastScoutTick: number | null;
  /** Newest contact information a `flush` was spent on (never twice on one sighting). */
  flushedTick: number;
}

export const createBotAbilities = (): BotAbilities => ({ plan: null, nextTryTick: [], checkedTick: [], lastScoutTick: null, flushedTick: -1 });

const SCOUT_TICKS = secondsToTicks(AI.abilities.scoutIntervalSeconds);
const PLACE_TIMEOUT_TICKS = secondsToTicks(AI.abilities.placeTimeoutSeconds);
/** Angle differences below this (radians) count as "the crosshair is there" (float residue). */
const AIM_EPSILON = 1e-9;
/** Buttons a throw or placement owns while it aims or places: a fire or ADS press would confirm
 *  or cancel, a weapon select would cancel, sprint and jump would move the crosshair. */
const AIM_OWNED_BUTTONS =
  BUTTON.fire | BUTTON.ads | BUTTON.reload | BUTTON.sprint | BUTTON.jump | BUTTON.selectPrimary | BUTTON.selectSecondary | BUTTON.swapWeapon;

/** Activation kinds each hint is acted out with (ADR-0012 §10). No channel or placement starts in
 *  a fight (they take the hands off the weapon); escapes and fights want an effect now. An
 *  ability whose kind is not listed for its hint is never used — no combination crashes. */
const HINT_KINDS: Readonly<Record<Exclude<BotAbilityUse, 'never'>, readonly ActivationKind[]>> = {
  engage: ['instant', 'toggle', 'thrown'],
  escape: ['instant', 'toggle'],
  hold: ['placeable', 'toggle'],
  scout: ['instant', 'hold', 'thrown', 'placeable'],
  support: ['instant', 'thrown'],
  flush: ['instant', 'thrown', 'placeable'],
};

// ── Derived ability values ──────────────────────────────────────────────────

/** The largest effect radius of an ability (0 without one). */
const largestRadius = (a: AbilityDef): number => Math.max(0, ...a.effects.map((e) => ('radius' in e ? e.radius : 0)));

/** How far one use of `a` reaches, the default of the hints' `maxRangeM` (ADR-0012 §10): thrown =
 *  the range of a 45° throw on level ground (speed² / projectileGravity; without gravity the
 *  distance flown in ABILITY_RULES.thrown.maxFlightSeconds), placeable = placeRange + the largest
 *  effect radius, self-centred = the largest effect radius. */
export function abilityReach(a: AbilityDef): number {
  if (hasActivation(a, 'thrown')) {
    const g = projectileGravity(a);
    const speed = a.activation.speed;
    return g > 0 ? (speed * speed) / g : speed * ABILITY_RULES.thrown.maxFlightSeconds;
  }
  if (hasActivation(a, 'placeable')) return a.activation.placeRange + largestRadius(a);
  return largestRadius(a);
}

/** How far a gadget of `a` covers: its largest effect radius, a barrier its width. Hold placements
 *  keep this far from the bot's own gadgets of the ability; a flush placement must get the
 *  contact within it. */
function footprint(a: AbilityDef): number {
  return Math.max(largestRadius(a), ...a.effects.map((e) => (e.kind === 'barrier' ? e.width : 0)));
}

/** The barrier height of `a` (0 = no barrier). */
const barrierHeight = (a: AbilityDef): number => Math.max(0, ...a.effects.map((e) => (e.kind === 'barrier' ? e.height : 0)));

/** A hint's range: its maxRangeM, else the ability's reach. */
const rangeOf = (hint: { maxRangeM?: number }, a: AbilityDef): number => hint.maxRangeM ?? abilityReach(a);

// ── Situations (what the hints mean) ────────────────────────────────────────

/** What the bot knows and does this tick, for the situation checks. */
interface Situation {
  bot: BotState;
  self: Readonly<CharacterEntity>;
  ctx: BrainContext;
  cmd: Command;
  now: number;
  /** The contact being fought this tick (in sight, engage or retreat, reaction time over). */
  fight: Readonly<Contact> | null;
  /** Any enemy in sight: no weapon-blocking or look-taking activation starts. */
  engaged: boolean;
}

/** A use the situation calls for: where it goes (throws, placements) and how. */
interface Want {
  point: Vec3 | null;
  followId: EntityId | null;
  reach: Vec3 | null;
  /** flush: the information tick of the contact it is spent on. */
  contactTick: number | null;
}

const want = (point: Vec3 | null = null, extra: Partial<Want> = {}): Want => ({ point, followId: null, reach: null, contactTick: null, ...extra });

/** engage: an enemy is being fought within range (ADR-0012 §10: self buffs, throws at it). */
function engageWant(s: Situation, a: AbilityDef, hint: Extract<BotAbilityHint, { use: 'engage' }>): Want | null {
  const target = s.fight;
  if (!target || distance(s.self.pos, target.pos) > rangeOf(hint, a)) return null;
  return want(target.pos);
}

/** Running for cover after a hit (reposition, retreat — the brain's answer to damage) … */
function fleeing(s: Situation): boolean {
  const b = s.bot;
  return (b.state === 'reposition' || b.state === 'retreat') && b.dest !== null && b.hitTick >= b.stateSinceTick - AI.brain.thinkIntervalTicks;
}

/** escape: hit by an unseen enemy (running for cover), or at ≤ healthBelow in a fight. */
function escapeWant(s: Situation, hint: Extract<BotAbilityHint, { use: 'escape' }>): Want | null {
  const low = s.fight !== null && s.self.health <= hint.healthBelow * operatorOf(s.self).maxHealth;
  return fleeing(s) || low ? want() : null;
}

/** hold: standing at the post (no enemy in sight): toggles switch on; placements go
 *  AI.abilities.placeAheadM (at most placeRange) ahead along the watch direction at feet height —
 *  once per post (no own gadget of the ability within its footprint of the point), and never a
 *  barrier the holder could not see over at the post's stance. */
function holdWant(s: Situation, a: AbilityDef): Want | null {
  const { bot, self } = s;
  const post = bot.post;
  if (s.engaged || bot.state !== 'hold' || bot.arrivedTick === null || !post) return null;
  if (!hasActivation(a, 'placeable')) return want();
  if (barrierHeight(a) >= eyeHeight(post.crouch ? 1 : 0)) return null;
  const ahead = Math.min(AI.abilities.placeAheadM, a.activation.placeRange);
  const f = forwardFromAngles(post.yaw, 0);
  const point = { x: self.pos.x + f.x * ahead, y: self.pos.y, z: self.pos.z + f.z * ahead };
  const room = footprint(a);
  if (s.ctx.view.state.gadgets.some((g) => g.ownerId === self.id && g.abilityId === a.id && distance(g.pos, point) < room)) return null;
  return want(point);
}

/** scout (at most once per AI.abilities.scoutIntervalSeconds, no enemy in sight): an enemy the
 *  bot knows of but cannot see (nor sees revealed right now) within reach — a lead, a lost
 *  target — or, attacking, the target site within reach (approaching likely enemy positions). */
function scoutWant(s: Situation, a: AbilityDef): Want | null {
  const { bot, self, now } = s;
  const last = bot.abilities.lastScoutTick;
  if (s.engaged || (last !== null && now - last < SCOUT_TICKS)) return null;
  const reach = abilityReach(a);
  const lead = newest(bot.contacts.filter((c) => !(c.source === 'reveal' && c.tick === now) && distance(self.pos, c.pos) <= reach), self);
  if (lead) return want(lead.pos);
  const siteId = s.ctx.plan.side === 'attack' ? s.ctx.plan.targetSite : null;
  const site = s.ctx.view.level.sites?.find((x) => x.id === siteId);
  const centre = site ? fromTuple(site.center) : null;
  return centre && distance(self.pos, centre) <= reach ? want(centre) : null;
}

/** support: the living teammate (or the bot itself) with the lowest health fraction at or below
 *  healthBelow within range — for a throw also in the thrower's line of sight (torso), and not
 *  mid-fight (the throw takes the crosshair). */
function supportWant(s: Situation, a: AbilityDef, hint: Extract<BotAbilityHint, { use: 'support' }>): Want | null {
  const { self, ctx } = s;
  const thrown = hasActivation(a, 'thrown');
  if (thrown && s.engaged) return null;
  const eye = aimOf(self).origin;
  const range = rangeOf(hint, a);
  const fraction = (e: Readonly<CharacterEntity>): number => e.health / operatorOf(e).maxHealth;
  let best: Readonly<CharacterEntity> | null = null;
  for (const e of ctx.view.state.entities) {
    if (!e.alive || e.team !== self.team || fraction(e) > hint.healthBelow || distance(self.pos, e.pos) > range) continue;
    if (thrown && e.id !== self.id && !ctx.view.query.lineOfSight(eye, zoneWorldCenter(e, 'torso'))) continue;
    if (!best || fraction(e) < fraction(best) || (fraction(e) === fraction(best) && e.id < best.id)) best = e;
  }
  if (!best) return null;
  // Oneself: a dart at the own feet; a teammate: at the torso, followed while aiming.
  return best.id === self.id ? want(self.pos) : want(zoneWorldCenter(best, 'torso'), { followId: best.id });
}

/** flush (no enemy in sight): the newest contact lost from sight (or revealed) within range that
 *  no flush was spent on — a throw needs a clear line to where it stood (eye height), a placement
 *  must get it within the gadget's footprint (checked when the pose is known). */
function flushWant(s: Situation, a: AbilityDef, hint: Extract<BotAbilityHint, { use: 'flush' }>): Want | null {
  const { bot, self, ctx } = s;
  if (s.engaged) return null;
  const range = rangeOf(hint, a);
  const lost = newest(
    bot.contacts.filter((c) => (c.seenTick !== null || c.source === 'reveal') && c.tick > bot.abilities.flushedTick && distance(self.pos, c.pos) <= range),
    self,
  );
  if (!lost) return null;
  if (hasActivation(a, 'placeable')) return want(eyeAbove(lost.pos), { reach: lost.pos, contactTick: lost.tick });
  if (hasActivation(a, 'thrown') && !ctx.view.query.lineOfSight(aimOf(self).origin, eyeAbove(lost.pos))) return null;
  return want(lost.pos, { contactTick: lost.tick });
}

/** The newest unseen contact (ties: the closest, then the lowest id). */
function newest(contacts: readonly Contact[], self: Readonly<CharacterEntity>): Contact | null {
  let best: Contact | null = null;
  const d = (c: Contact): number => distance(self.pos, c.pos);
  for (const c of contacts) {
    if (c.visible) continue;
    if (!best || c.tick > best.tick || (c.tick === best.tick && (d(c) < d(best) || (d(c) === d(best) && c.entityId < best.entityId)))) best = c;
  }
  return best;
}

function situationWant(s: Situation, a: AbilityDef): Want | null {
  const hint = a.bot;
  switch (hint.use) {
    case 'never':
      return null;
    case 'engage':
      return engageWant(s, a, hint);
    case 'escape':
      return escapeWant(s, hint);
    case 'hold':
      return holdWant(s, a);
    case 'scout':
      return scoutWant(s, a);
    case 'support':
      return supportWant(s, a, hint);
    case 'flush':
      return flushWant(s, a, hint);
  }
}

/** A switched-on toggle stays on while its situation lasts: `hold` at the post, fighting or
 *  reloading there (off when the bot leaves), `engage` while fighting, `escape` while escaping. */
function keepsOn(s: Situation, a: AbilityDef): boolean {
  const b = s.bot;
  switch (a.bot.use) {
    case 'hold':
      return (b.state === 'hold' && b.arrivedTick !== null) || b.state === 'engage' || (b.state === 'reload' && b.dest === null);
    case 'engage':
    case 'escape':
      return situationWant(s, a) !== null;
    default:
      return false;
  }
}

// ── Acting it out ───────────────────────────────────────────────────────────

/** The ability bit of slot `i` can make a press edge this tick (it was up last tick). */
const canPress = (self: Readonly<CharacterEntity>, i: number): boolean => {
  const bit = ABILITY_BUTTONS[i];
  return bit !== undefined && !isHeld(self.lastButtons, bit);
};

function press(cmd: Command, i: number): void {
  const bit = ABILITY_BUTTONS[i];
  if (bit !== undefined) cmd.buttons |= bit;
}

/** Whether slot `i` would be accepted if pressed now: idle, supported, the resource can spend, the
 *  mode's gate is open (matchAbilityAllowed), fewer own gadgets than maxActive, and a press edge
 *  is possible. The sim's own rules — a bot never presses what the sim would refuse. */
function ready(s: Situation, slot: Readonly<AbilityState>, a: AbilityDef, i: number): boolean {
  const { self, ctx } = s;
  if (slot.active !== null || !isAbilitySupported(a) || !canActivate(a.resource, slot.resource)) return false;
  if (!matchAbilityAllowed(ctx.view.state.match, self, a)) return false;
  if (hasActivation(a, 'placeable') && gadgetCount(ctx.view.state, self.id, a.id) >= a.activation.maxActive) return false;
  return canPress(self, i);
}

/** The next check of a slot waits AI.abilities.retrySeconds plus up to as long again (bot RNG
 *  jitter), so the bots of a team do not act in lockstep. */
function waitRetry(s: Situation, i: number): void {
  const st = s.bot.abilities;
  const retry = AI.abilities.retrySeconds;
  st.checkedTick[i] = s.now;
  st.nextTryTick[i] = s.now + secondsToTicks(randomRange(s.bot.rng, retry, 2 * retry));
}

/** The look that puts the crosshair (look + recoil offset, aimOf) on `point`: a placement looks
 *  straight at it, a throw along the low ballistic arc (ballisticPitch under projectileGravity)
 *  — null when the throw cannot reach it. The pitch is clamped as the sim clamps a command's
 *  look (clampPitch). */
function lookFor(self: Readonly<CharacterEntity>, a: AbilityDef, point: Vec3): { yaw: number; pitch: number } | null {
  const eye = aimOf(self).origin;
  const direct = anglesTo(eye, point);
  let pitch = direct.pitch;
  if (hasActivation(a, 'thrown')) {
    const arc = ballisticPitch(a.activation.speed, projectileGravity(a), Math.hypot(point.x - eye.x, point.z - eye.z), point.y - eye.y);
    if (arc === null) return null;
    pitch = arc;
  }
  return { yaw: direct.yaw - self.weapon.recoilYaw, pitch: clampPitch(pitch - self.weapon.recoilPitch) };
}

/** Turns the command's look towards `goal` at the tier's turn rate; true once it is there. */
function turnTo(s: Situation, goal: { yaw: number; pitch: number }): boolean {
  const rate = AI.tiers[s.bot.tier].turnRateDeg;
  s.cmd.yaw = turnTowards(s.self.yaw, goal.yaw, rate);
  s.cmd.pitch = moveTowards(s.self.pitch, goal.pitch, turnStep(rate));
  return Math.abs(angleDelta(s.cmd.yaw, goal.yaw)) < AIM_EPSILON && Math.abs(s.cmd.pitch - goal.pitch) < AIM_EPSILON;
}

/** Standing still with the aim buttons owned by the throw or placement. */
function holdStill(cmd: Command): void {
  cmd.moveX = 0;
  cmd.moveZ = 0;
  cmd.buttons &= ~AIM_OWNED_BUTTONS;
}

/** Whether the placement pose for `look` is valid and (flush) gets `reach` within the gadget's
 *  footprint — the sim's own rule (placementPose). */
function poseFits(s: Situation, a: AbilityOf<'placeable'>, look: { yaw: number; pitch: number }, reach: Vec3 | null): boolean {
  const pose = placementPose(s.ctx.view.query, s.self, a, look);
  return pose.valid && (reach === null || distance(pose.pos, reach) <= footprint(a));
}

/** The look the sim takes from the command on the tick it is for (commandLook). */
const lookOf = (s: Situation): { yaw: number; pitch: number } => commandLook(s.self, s.cmd, s.cmd.tick);

/** Starts the use `w` of slot `i` (ready, situation given): instant and toggle press now, a
 *  channel presses and becomes a plan, throws and placements become an aiming plan — only if the
 *  throw reaches the point and a placement there would be valid (checked before turning to it).
 *  False if nothing started. */
function start(s: Situation, i: number, a: AbilityDef, w: Want): boolean {
  const st = s.bot.abilities;
  if (hasActivation(a, 'thrown') || hasActivation(a, 'placeable')) {
    const goal = w.point ? lookFor(s.self, a, w.point) : null;
    if (!goal || (hasActivation(a, 'placeable') && !poseFits(s, a, goal, w.reach))) return false;
    if (w.contactTick !== null) st.flushedTick = Math.max(st.flushedTick, w.contactTick);
    st.plan = { slot: i, phase: 'aim', point: w.point, followId: w.followId, reach: w.reach, untilTick: s.now + PLACE_TIMEOUT_TICKS };
    if (!runPlan(s, st.plan)) endPlan(s);
    return true;
  }
  if (w.contactTick !== null) st.flushedTick = Math.max(st.flushedTick, w.contactTick);
  press(s.cmd, i);
  if (a.bot.use === 'scout') st.lastScoutTick = s.now;
  if (hasActivation(a, 'hold')) {
    // The sim ends the channel at maxDuration; the bound only guards against holding on forever.
    st.plan = { slot: i, phase: 'channel', point: null, followId: null, reach: null, untilTick: s.now + secondsToTicks(a.activation.maxDuration) + 1 };
    return true;
  }
  // A dash along the move input needs one: in a fight without movement, dodge sideways.
  const dashesAlongMove = a.effects.some((e) => e.kind === 'dash' && e.direction === 'move');
  if (dashesAlongMove && s.cmd.moveX === 0 && s.cmd.moveZ === 0) s.cmd.moveX = s.bot.aim.strafeDir;
  waitRetry(s, i);
  return true;
}

function endPlan(s: Situation): void {
  const plan = s.bot.abilities.plan;
  if (plan) waitRetry(s, plan.slot);
  s.bot.abilities.plan = null;
}

/** One tick of a running plan; false when it is over (placed, thrown, released, given up). */
function runPlan(s: Situation, plan: BotAbilityPlan): boolean {
  const { self, cmd, now } = s;
  const slot = self.abilities[plan.slot];
  if (!slot) return false;
  const a = getAbility(slot.abilityId);
  if (plan.phase === 'channel') {
    // Held to the end of the channel (the sim ends it at maxDuration); released for a fight.
    if (slot.active?.kind !== 'channel' || s.engaged || now >= plan.untilTick) return false;
    press(cmd, plan.slot);
    return true;
  }
  const target = plan.followId === null ? plan.point : followed(s, plan.followId);
  const goal = target ? lookFor(self, a, target) : null;
  if (plan.phase === 'placing') {
    if (slot.active?.kind !== 'placing') return false; // placed, or cancelled
    holdStill(cmd);
    if (goal) turnTo(s, goal);
    if (now >= plan.untilTick || s.engaged || !goal) {
      // Cancel: ADS (a press edge), then the slot is idle at the next call.
      if (!isHeld(self.lastButtons, BUTTON.ads)) cmd.buttons |= BUTTON.ads;
      return true;
    }
    if (hasActivation(a, 'placeable') && poseFits(s, a, lookOf(s), plan.reach) && !isHeld(self.lastButtons, BUTTON.fire)) cmd.buttons |= BUTTON.fire;
    return true;
  }
  // phase 'aim'
  const mayAim = !s.engaged || a.bot.use === 'engage';
  if (!goal || !mayAim || now >= plan.untilTick || !ready(s, slot, a, plan.slot)) return false;
  holdStill(cmd);
  if (!turnTo(s, goal)) return true;
  if (hasActivation(a, 'placeable')) {
    if (!poseFits(s, a, lookOf(s), plan.reach)) return false;
    press(cmd, plan.slot);
    plan.phase = 'placing';
    plan.untilTick = now + PLACE_TIMEOUT_TICKS;
    return true;
  }
  press(cmd, plan.slot); // a throw leaves at once along the crosshair
  return false;
}

/** The torso of a living teammate a throw follows, or null (it died: give up). */
function followed(s: Situation, id: EntityId): Vec3 | null {
  const e = s.ctx.view.state.entities.find((x) => x.id === id);
  return e?.alive ? zoneWorldCenter(e, 'torso') : null;
}

/** Whether a slot's situation is checked this tick: its retry wait is over, the bot's state
 *  changed or it was hit since the last check, or — for fight hints — it is fighting. */
function due(s: Situation, i: number, hint: BotAbilityHint): boolean {
  const st = s.bot.abilities;
  const checked = st.checkedTick[i] ?? -1;
  if (s.now >= (st.nextTryTick[i] ?? 0) || s.bot.stateSinceTick > checked || s.bot.hitTick > checked) return true;
  return s.fight !== null && (hint.use === 'engage' || hint.use === 'escape');
}

/** The bot's ability use this tick (ADR-0012 §10), called at the end of the brain's act() with
 *  its command: continues a running plan, switches toggles off whose situation ended, else checks
 *  the ready slots whose check is due (in slot order) and starts the first use its hint's
 *  situation calls for. At most one ability action per tick. `fight` = the contact being fought
 *  (in sight, engage or retreat, the aim model's reaction time over), else null. May add the
 *  ability, fire and ADS bits, stop the movement and override the look. */
export function abilityStep(bot: BotState, self: Readonly<CharacterEntity>, ctx: BrainContext, cmd: Command, now: number, fight: Readonly<Contact> | null): void {
  const s: Situation = { bot, self, ctx, cmd, now, fight, engaged: bot.contacts.some((c) => c.visible) };
  const st = bot.abilities;
  if (st.plan) {
    if (runPlan(s, st.plan)) return;
    endPlan(s);
  }
  for (const [i, slot] of self.abilities.entries()) {
    if (slot.active?.kind !== 'on' || keepsOn(s, getAbility(slot.abilityId))) continue;
    if (canPress(self, i)) press(cmd, i);
    return;
  }
  for (const [i, slot] of self.abilities.entries()) {
    const a = getAbility(slot.abilityId);
    const hint = a.bot;
    if (hint.use === 'never' || !HINT_KINDS[hint.use].includes(a.activation.kind)) continue;
    if (!due(s, i, hint) || !ready(s, slot, a, i)) continue;
    const w = situationWant(s, a);
    if (w && start(s, i, a, w)) return;
    waitRetry(s, i);
  }
}
