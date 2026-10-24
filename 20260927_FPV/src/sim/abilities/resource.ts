import { isTimeUp } from '../../config/sim.ts';
import type { ResourceDef } from '../../data/schema.ts';

// NEW — ability resource model (SPEC §7): a pure state machine for cooldown, charges and
// per-round uses. No knowledge of effects or entities, fully unit-tested.

export interface ResourceState {
  /** charges: current charges. Other kinds keep it at 0. */
  charges: number;
  /** cooldown: seconds until ready. charges: seconds until the next charge (0 = not recharging). */
  timer: number;
  /** uses: remaining uses this round. Other kinds keep it at 0. */
  usesLeft: number;
}

export function createResourceState(def: ResourceDef): ResourceState {
  switch (def.kind) {
    case 'charges':
      return { charges: def.maxCharges, timer: 0, usesLeft: 0 };
    case 'uses':
      return { charges: 0, timer: 0, usesLeft: def.usesPerRound };
    case 'cooldown':
    case 'none':
      return { charges: 0, timer: 0, usesLeft: 0 };
  }
}

export function canActivate(def: ResourceDef, s: ResourceState): boolean {
  switch (def.kind) {
    case 'cooldown':
      return s.timer <= 0;
    case 'charges':
      return s.charges >= 1;
    case 'uses':
      return s.usesLeft >= 1;
    case 'none':
      return true;
  }
}

/** Spends one activation. Returns false (and changes nothing) if not possible. */
export function consume(def: ResourceDef, s: ResourceState): boolean {
  if (!canActivate(def, s)) return false;
  switch (def.kind) {
    case 'cooldown':
      s.timer = def.cooldown;
      break;
    case 'charges':
      // A charge spent while at max starts the recharge; while already recharging the timer
      // keeps running (charges recharge one at a time).
      if (s.charges === def.maxCharges) s.timer = def.rechargeTime;
      s.charges -= 1;
      break;
    case 'uses':
      s.usesLeft -= 1;
      break;
    case 'none':
      break;
  }
  return true;
}

/** Counts the timers down by `dt`; a timer ends when its time is up (isTimeUp, the one rule). */
export function tick(def: ResourceDef, s: ResourceState, dt: number): void {
  switch (def.kind) {
    case 'cooldown':
      s.timer = isTimeUp(s.timer - dt) ? 0 : s.timer - dt;
      break;
    case 'charges': {
      if (s.charges >= def.maxCharges) {
        s.timer = 0;
        break;
      }
      s.timer -= dt;
      // Loop: a long dt may complete several charges; leftover time carries over.
      while (isTimeUp(s.timer) && s.charges < def.maxCharges) {
        s.charges += 1;
        s.timer = s.charges < def.maxCharges ? s.timer + def.rechargeTime : 0;
      }
      break;
    }
    case 'uses':
    case 'none':
      break;
  }
}

/** Round start: full charges, no cooldown, all uses back. */
export function resetForRound(def: ResourceDef, s: ResourceState): void {
  Object.assign(s, createResourceState(def));
}

/** 0…1 readiness for HUD sweeps: 1 = an activation is available now. */
export function readiness(def: ResourceDef, s: ResourceState): number {
  switch (def.kind) {
    case 'cooldown':
      return def.cooldown > 0 ? 1 - s.timer / def.cooldown : 1;
    case 'charges':
      return s.charges >= 1 ? 1 : 1 - s.timer / def.rechargeTime;
    case 'uses':
      return s.usesLeft >= 1 ? 1 : 0;
    case 'none':
      return 1;
  }
}
