import { isTimeUp, PLAYABLE_OPERATORS, RANGE_MODE } from '../../config/sim.ts';
import { getWeapon, OPERATORS } from '../../data/content.ts';
import type { SimContext } from '../context.ts';
import { respawnAt, startingReserve } from '../entities.ts';
import type { ModeRules } from './mode.ts';

// NEW — range mode rules (SPEC §4.2): dead characters respawn at their spawn point after a
// delay; reserve ammo never runs out. Any level works; every command passes, and every control
// except a switch to an operator the range does not offer.

// NEW — ADR-0013 §3: the host's operator list (ModeHost.playableOperators) is gone; the rules say
// which switches they accept, and the client cycles through what Sim.accepts.
/** Operators the range lets the player switch between, in data order: every operator in
 *  src/data/operators with RANGE_MODE.allOperators, else the match list. */
export const rangeOperators = (): readonly string[] => (RANGE_MODE.allOperators ? OPERATORS.map((o) => o.id) : PLAYABLE_OPERATORS);

function tick(ctx: SimContext, dt: number): void {
  for (const e of ctx.state.entities) {
    if (!e.alive) {
      e.deadTime += dt;
      if (isTimeUp(RANGE_MODE.dummyRespawnSeconds - e.deadTime)) respawnAt(ctx, e, e.spawnPos, e.spawnYaw);
      continue;
    }
    if (RANGE_MODE.infiniteReserve) {
      for (const carried of e.weapons) carried.reserve = startingReserve(getWeapon(carried.weaponId));
    }
  }
}

export const RANGE_RULES: ModeRules = {
  validateLevel: () => [],
  initialMatch: () => ({ mode: 'range' }),
  tick,
  frozen: () => false,
  filterCommand: (_ctx, _e, cmd) => cmd,
  acceptsControl: (_ctx, msg) => msg.type !== 'selectOperator' || rangeOperators().includes(msg.operatorId),
};
