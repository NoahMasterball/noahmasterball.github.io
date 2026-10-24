import { AI, secondsToTicks } from '../config/sim.ts';
import type { HitZone } from '../data/schema.ts';
import { getHitboxProfile, getOperator } from '../data/content.ts';
import { eyeHeight, mainZonePart, shapeFrontalArea, zoneWorldCenter } from '../sim/hitbox.ts';
import { angleDelta, anglesTo, cloneVec3, DEG2RAD, distance, vec3, type Vec3 } from '../sim/math.ts';
import { randomRange, type RngState } from '../sim/rng.ts';
import { isRevealedTo } from '../sim/stats.ts';
import { aimOf } from '../sim/systems/weapons.ts';
import type { CharacterEntity, EntityId, SimEvent } from '../sim/types.ts';
import type { SimView } from './types.ts';

// NEW — bot perception (ADR-0011 §2, SPEC §12): sight (range → view cone → line of sight),
// hearing (gunshots, footsteps × loudness and ability activations, all muffled by walls; incoming
// weapon hits), reveals (ADR-0012 §8) and a memory of contacts. The ONLY ai module that reads
// enemy characters: brain and aim see Contacts and TargetViews, and a true position leaves this
// file only for an enemy whose line of sight was confirmed this tick or who is revealed to the
// bot's team (what a player sees as a marker) — so bots cannot see through walls otherwise.
//
// Clock: every tick here is the sim tick the observation belongs to — `view.state.tick` in
// BotController.commands() (the state after the previous step), `ev.tick` for events.

/** A Relay uplink event (hear() returns the enemy starts it heard). */
export type UplinkEvent = Extract<SimEvent, { type: 'uplink' }>;

/** Zones a bot looks for, in sight-check order, and may aim at (the head first). */
export const TARGET_ZONES = ['head', 'torso'] as const satisfies readonly HitZone[];
export type TargetZone = (typeof TARGET_ZONES)[number];

/** Where a contact's newest information came from. `reveal`: a reveal effect (sonar, sensors,
 *  mines) shows the enemy to the whole team — exact, but not in sight (ADR-0012 §8). */
export type ContactSource = 'sight' | 'sound' | 'damage' | 'callout' | 'reveal';

/** What a bot believes about one enemy (ADR-0011 §2, plus `seenTick`). Plain data. */
export interface Contact {
  entityId: EntityId;
  /** Last known feet position; last seen or revealed velocity (0 for sounds, hits and
   *  callouts). */
  pos: Vec3;
  vel: Vec3;
  /** Tick of the newest information (memory expires from here). */
  tick: number;
  /** Start of the current sighting or awareness — the reaction timer runs from here. */
  firstSeenTick: number;
  /** Last tick the enemy was in sight (null = never): occlusions shorter than
   *  AI.perception.reacquireGraceSeconds keep firstSeenTick. */
  seenTick: number | null;
  visible: boolean;
  source: ContactSource;
}

/** A contact as the aim model sees it (built by targetView). */
export interface TargetView {
  entityId: EntityId;
  /** Aim point per zone: the true pose while in sight this tick, else estimated at the last
   *  known position (standing). */
  points: Readonly<Record<TargetZone, Vec3>>;
  /** Apparent size per zone: radius (m) of a disc with the zone's frontal area. */
  radius: Readonly<Record<TargetZone, number>>;
  vel: Vec3;
  /** In sight this tick (line of sight confirmed). */
  visible: boolean;
  firstSeenTick: number;
}

/** Contacts (and callouts) are forgotten this many ticks after their information. */
export const MEMORY_TICKS = secondsToTicks(AI.perception.memorySeconds);
const GRACE_TICKS = secondsToTicks(AI.perception.reacquireGraceSeconds);
const HALF_FOV = (AI.perception.fovDeg / 2) * DEG2RAD;

/** True on the ticks bot `k` runs its full sight scan (bots are staggered by k). */
export const isScanTick = (tick: number, k: number): boolean => (tick + k) % AI.perception.scanIntervalTicks === 0;

export const findContact = (contacts: readonly Contact[], id: EntityId): Contact | undefined =>
  contacts.find((c) => c.entityId === id);

function forget(contacts: Contact[], id: EntityId): void {
  const i = contacts.findIndex((c) => c.entityId === id);
  if (i >= 0) contacts.splice(i, 1);
}

function characterOf(view: SimView, id: EntityId): CharacterEntity {
  const e = view.state.entities.find((x) => x.id === id);
  if (!e) throw new Error(`Perception: no entity ${id}`);
  return e;
}

// ── Sight ───────────────────────────────────────────────────────────────────

/** Range, then the horizontal view cone (all round within nearAwarenessM). No rays. */
function inView(self: Readonly<CharacterEntity>, e: Readonly<CharacterEntity>): boolean {
  const d = distance(self.pos, e.pos);
  if (d > AI.perception.maxSightM) return false;
  if (d <= AI.perception.nearAwarenessM) return true;
  return Math.abs(angleDelta(self.yaw, anglesTo(self.pos, e.pos).yaw)) <= HALF_FOV;
}

/** Eye → the target zones in order; at most one ray per zone. */
function inSight(view: SimView, eye: Vec3, e: Readonly<CharacterEntity>): boolean {
  for (const zone of TARGET_ZONES) if (view.query.lineOfSight(eye, zoneWorldCenter(e, zone))) return true;
  return false;
}

function see(contacts: Contact[], e: Readonly<CharacterEntity>, tick: number): void {
  const c = findContact(contacts, e.id);
  if (!c) {
    contacts.push({ entityId: e.id, pos: cloneVec3(e.pos), vel: cloneVec3(e.vel), tick, firstSeenTick: tick, seenTick: tick, visible: true, source: 'sight' });
    return;
  }
  if (!c.visible && (c.seenTick === null || tick - c.seenTick > GRACE_TICKS)) c.firstSeenTick = tick;
  c.pos = cloneVec3(e.pos);
  c.vel = cloneVec3(e.vel);
  c.tick = tick;
  c.seenTick = tick;
  c.visible = true;
  c.source = 'sight';
}

/** One bot's perception for this tick (call in commands(), every tick, for living bots):
 *  on its scan ticks (isScanTick) every living enemy by id — range → view cone → line of sight
 *  from the eye to the head, then the torso; on the other ticks only `targetId` is re-checked.
 *  Every tick, each living enemy revealed to the bot's team (isRevealedTo) that is not in sight
 *  becomes a `reveal` contact: exact feet position and velocity, not visible (aim may pre-aim,
 *  the fire gate still needs sight) — the same moment for every bot of the team, as the marker
 *  for a player (ADR-0012 §8). Contacts of dead enemies (kill feed) and memories older than
 *  AI.perception.memorySeconds are dropped. Ray cost: ≤ 2 per checked enemy; reveals cost none.
 *  `k` staggers the bots (e.g. the slot index). */
export function perceive(view: SimView, self: Readonly<CharacterEntity>, contacts: Contact[], k: number, targetId: EntityId | null): void {
  const tick = view.state.tick;
  const scan = isScanTick(tick, k);
  const eye = aimOf(self).origin;
  for (const e of view.state.entities) {
    if (e.team === self.team) continue;
    if (!e.alive) {
      forget(contacts, e.id);
      continue;
    }
    if (scan || e.id === targetId) {
      if (inView(self, e) && inSight(view, eye, e)) {
        see(contacts, e, tick);
        continue;
      }
      const c = findContact(contacts, e.id);
      if (c) c.visible = false;
    }
    // Sight (this tick's or the last scan's) is better news than a reveal (learnContact's rule).
    if (isRevealedTo(e, self.team)) learnContact(contacts, e.id, e.pos, tick, tick, 'reveal', e.vel);
  }
  for (let i = contacts.length - 1; i >= 0; i--) {
    const c = contacts[i];
    if (c && tick - c.tick > MEMORY_TICKS) contacts.splice(i, 1);
  }
}

// ── Indirect information: sounds, hits, reveals, callouts ───────────────────

/** How direct a source is: information of the same tick only replaces a less direct one (the
 *  hit after the same tick's gunshot, a reveal over both; never the same callout twice). */
const SOURCE_RANK: Record<ContactSource, number> = { callout: 0, sound: 1, damage: 2, reveal: 3, sight: 4 };

type IndirectSource = Exclude<ContactSource, 'sight'>;

/** Whether `source` information observed at `tick` would change contact `c` (learnContact's
 *  merge rule): never over sight or newer information. */
const isNews = (c: Readonly<Contact> | undefined, tick: number, source: IndirectSource): boolean =>
  !c || !(c.visible || c.tick > tick || (c.tick === tick && SOURCE_RANK[c.source] >= SOURCE_RANK[source]));

/** Merges indirect information about `id` observed at `tick` and learnt at `now` (sounds, hits
 *  and reveals: the same tick; callouts: later) if it is news (isNews); a new awareness after
 *  more than the re-acquire grace restarts the reaction timer. */
export function learnContact(contacts: Contact[], id: EntityId, pos: Vec3, tick: number, now: number, source: IndirectSource, vel: Vec3 = vec3()): void {
  const c = findContact(contacts, id);
  if (!isNews(c, tick, source)) return;
  if (!c) {
    contacts.push({ entityId: id, pos: cloneVec3(pos), vel: cloneVec3(vel), tick, firstSeenTick: now, seenTick: null, visible: false, source });
    return;
  }
  if (now - c.tick > GRACE_TICKS) c.firstSeenTick = now;
  c.pos = cloneVec3(pos);
  c.vel = cloneVec3(vel);
  c.tick = tick;
  c.source = source;
}

/** Feet estimate below an eye position (shot origins and hit sources; standing eye height). */
const feetBelow = (eye: Vec3): Vec3 => ({ x: eye.x, y: eye.y - eyeHeight(0), z: eye.z });
/** Standing eye height above a feet position (footsteps are heard from there: low cover does
 *  not muffle them, walls do — as for gunshots, which start at the eye; a flush throw needs a
 *  clear line to it). */
export const eyeAbove = (feet: Vec3): Vec3 => ({ x: feet.x, y: feet.y + eyeHeight(0), z: feet.z });

/** A heard position: ± `err` horizontally, from the bot's RNG. */
function blur(p: Vec3, err: number, rng: RngState): Vec3 {
  return { x: p.x + randomRange(rng, -err, err), y: p.y, z: p.z + randomRange(rng, -err, err) };
}

/** The position error a sound is heard with `d` m away, or null if it is not heard. `radius` is
 *  its reach along a clear line; if static geometry blocks the line from `source` to `ear`
 *  (one ray, cast only within `radius`) it reaches occludedRangeFactor × radius and is placed
 *  within occludedPositionErrorM. */
function audibleError(view: SimView, d: number, radius: number, source: Vec3, ear: Vec3): number | null {
  if (d > radius) return null;
  if (view.query.lineOfSight(source, ear)) return AI.hearing.positionErrorM;
  return d <= radius * AI.hearing.occludedRangeFactor ? AI.hearing.occludedPositionErrorM : null;
}

/** Hearing and awareness from one tick's events (call in observe(), for living bots): enemy
 *  gunshots within gunshotRadiusM of the ear, enemy footsteps within footstepRadiusM × loudness
 *  enemy ability activations (`ability`: the user's feet — also the placement confirm that
 *  comes with every `gadgetPlaced`) within abilityRadiusM and an enemy starting to plant or
 *  disrupt the Relay uplink (`uplink` start) within uplinkRadiusM become `sound` contacts — through
 *  walls only within AI.hearing.occludedRangeFactor of that, placed less precisely
 *  (audibleError); a weapon hit on this bot becomes a `damage` contact at the shooter (what the
 *  damage indicator tells a human). An ability hit (burst, area) makes no contact: its source is
 *  the burst point, not the attacker (the brain takes it as the threat); a `burst` is not heard
 *  as its owner for the same reason. A kill drops the victim's contact; a new round (preRound)
 *  clears the memory. Ray cost: one per enemy sound within its radius that would be news — none
 *  for an enemy in sight or already heard this tick. Returns the enemy uplink starts it heard
 *  (the Relay objective's alarm, objective.ts). */
export function hear(view: SimView, self: Readonly<CharacterEntity>, contacts: Contact[], events: readonly SimEvent[], rng: RngState): UplinkEvent[] {
  const isEnemy = (id: EntityId): boolean => characterOf(view, id).team !== self.team;
  const ear = aimOf(self).origin;
  const heardUplinks: UplinkEvent[] = [];
  /** A sound of `id` at `tick`, `d` m away with reach `radius`, emitted at `source`; its feet
   *  estimate is `feet`. Only an enemy's, and only if it would be news. True if it was heard. */
  const listen = (id: EntityId, tick: number, feet: Vec3, source: Vec3, d: number, radius: number): boolean => {
    if (!isEnemy(id) || !isNews(findContact(contacts, id), tick, 'sound')) return false;
    const err = audibleError(view, d, radius, source, ear);
    if (err === null) return false;
    learnContact(contacts, id, blur(feet, err, rng), tick, tick, 'sound');
    return true;
  };
  for (const ev of events) {
    switch (ev.type) {
      case 'shot':
        listen(ev.entityId, ev.tick, feetBelow(ev.origin), ev.origin, distance(ear, ev.origin), AI.hearing.gunshotRadiusM);
        break;
      case 'footstep':
        listen(ev.entityId, ev.tick, ev.pos, eyeAbove(ev.pos), distance(self.pos, ev.pos), AI.hearing.footstepRadiusM * ev.loudness);
        break;
      case 'ability':
        listen(ev.entityId, ev.tick, ev.pos, eyeAbove(ev.pos), distance(self.pos, ev.pos), AI.hearing.abilityRadiusM);
        break;
      case 'uplink':
        if (ev.stage === 'start' && listen(ev.entityId, ev.tick, ev.pos, eyeAbove(ev.pos), distance(self.pos, ev.pos), AI.hearing.uplinkRadiusM)) heardUplinks.push(ev);
        break;
      case 'hit':
        if (ev.victimId === self.id && ev.cause.kind === 'weapon' && isEnemy(ev.attackerId)) {
          learnContact(contacts, ev.attackerId, feetBelow(ev.sourcePos), ev.tick, ev.tick, 'damage');
        }
        break;
      case 'kill':
        forget(contacts, ev.victimId);
        break;
      case 'phase':
        if (ev.phase === 'preRound') contacts.length = 0;
        break;
    }
  }
  return heardUplinks;
}

// ── What the aim model gets ─────────────────────────────────────────────────

/** The aim model's view of a contact. The enemy's true pose is read only when its line of sight
 *  was confirmed this tick (perceive() re-checks the current target every tick); otherwise the
 *  aim points stand at the last known position. */
export function targetView(view: SimView, contact: Readonly<Contact>): TargetView {
  const e = characterOf(view, contact.entityId);
  const visible = contact.visible && contact.seenTick === view.state.tick;
  const pose = visible ? e : { operatorId: e.operatorId, stance: 0, pos: contact.pos, yaw: 0 };
  const points = { head: zoneWorldCenter(pose, 'head'), torso: zoneWorldCenter(pose, 'torso') } satisfies Record<TargetZone, Vec3>;
  const profile = getHitboxProfile(getOperator(e.operatorId).hitboxProfile);
  const discRadius = (zone: TargetZone): number => Math.sqrt(shapeFrontalArea(mainZonePart(profile, zone).shape) / Math.PI);
  return {
    entityId: contact.entityId,
    points,
    radius: { head: discRadius('head'), torso: discRadius('torso') },
    vel: cloneVec3(visible ? e.vel : contact.vel),
    visible,
    firstSeenTick: contact.firstSeenTick,
  };
}
