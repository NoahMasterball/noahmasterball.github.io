import { AI } from '../config/sim.ts';
import { cloneVec3, type Vec3 } from '../sim/math.ts';
import type { EntityId, SimEvent } from '../sim/types.ts';
import { learnContact, MEMORY_TICKS, type Contact } from './perception.ts';

// NEW — team callouts (ADR-0011 §2, SPEC §12 "information shared with teammates after a short
// delay"). One TeamIntel per team, owned by the bot controller; plain data. A bot posts what it
// learnt first-hand (sight, sound, damage); teammates read it AI.perception.calloutDelayTicks
// later as `callout` contacts, merged by perception's learnContact rule. Reveals are not called
// out: a reveal is already team knowledge — every bot of the revealing team reads it the same
// tick in perceive() (ADR-0012 §8), so a delayed copy would only ever be stale.

export interface Callout {
  entityId: EntityId;
  pos: Vec3;
  vel: Vec3;
  /** Tick of the observation (the contact's tick) and of the earliest reading. */
  tick: number;
  readableTick: number;
  /** The bot that made it (it does not read its own callouts). */
  from: EntityId;
}

export interface TeamIntel {
  callouts: Callout[];
}

export const createTeamIntel = (): TeamIntel => ({ callouts: [] });

const isPending = (c: Callout, tick: number): boolean => c.readableTick > tick;

/** Drops callouts older than the memory and readable ones a newer readable callout of the same
 *  enemy supersedes: at most one readable and one pending callout per enemy remain. */
function prune(intel: TeamIntel, tick: number): void {
  intel.callouts = intel.callouts.filter(
    (c) =>
      tick - c.tick <= MEMORY_TICKS &&
      (isPending(c, tick) || !intel.callouts.some((o) => o !== c && o.entityId === c.entityId && !isPending(o, tick) && o.tick > c.tick)),
  );
}

/** Posts the first-hand contacts `from` updated at `tick` (call once per tick in commands(),
 *  after perceive(), with tick = view.state.tick); not callouts and reveals (team knowledge
 *  already). While a callout of an enemy is still on its way, newer news of it waits for the next
 *  post, so teammates get an update per delay. */
export function shareContacts(intel: TeamIntel, from: EntityId, contacts: readonly Contact[], tick: number): void {
  for (const c of contacts) {
    if (c.source === 'callout' || c.source === 'reveal' || c.tick !== tick) continue;
    if (intel.callouts.some((o) => o.entityId === c.entityId && isPending(o, tick))) continue;
    intel.callouts.push({
      entityId: c.entityId,
      pos: cloneVec3(c.pos),
      vel: cloneVec3(c.vel),
      tick,
      readableTick: tick + AI.perception.calloutDelayTicks,
      from,
    });
  }
  prune(intel, tick);
}

/** Merges the team's readable callouts into `reader`'s contacts (never its own; never over
 *  sight or newer knowledge). */
export function receiveCallouts(intel: Readonly<TeamIntel>, reader: EntityId, contacts: Contact[], tick: number): void {
  for (const c of intel.callouts) {
    if (c.from === reader || isPending(c, tick)) continue;
    learnContact(contacts, c.entityId, c.pos, c.tick, tick, 'callout', c.vel);
  }
}

/** Team-wide event handling (call in observe()): a kill retracts the victim's callouts; a new
 *  round (preRound) clears them all. */
export function observeIntel(intel: TeamIntel, events: readonly SimEvent[]): void {
  for (const ev of events) {
    if (ev.type === 'kill') intel.callouts = intel.callouts.filter((c) => c.entityId !== ev.victimId);
    else if (ev.type === 'phase' && ev.phase === 'preRound') intel.callouts = [];
  }
}
