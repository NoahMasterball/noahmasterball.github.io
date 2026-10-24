import { PLAYABLE_OPERATORS } from '../config/sim.ts';
import { pickAllowed } from '../sim/modes/format.ts';
import type { RngState } from '../sim/rng.ts';
import type { ControlMessage, EntityId } from '../sim/types.ts';
import { draw } from './brain.ts';
import type { SimView } from './types.ts';

// NEW — the bots' Relay operator picks (ADR-0013 §3): seeded, legal by the sim's own pick rule
// (pickAllowed), and spread over the operators so the player keeps every choice open.

/** One team's bot picks: a permutation p of PLAYABLE_OPERATORS drawn from `rng` (the team's plan
 *  stream); bot i (entity-id order) takes the first of p[i], p[i+1], … (cyclic) that pickAllowed
 *  accepts on a scratch roster of its team, updated in queue order — exactly what the sim will
 *  accept when the messages are applied in this order. A bot that keeps its operator sends
 *  nothing. `botIds` must be one team's. */
export function botPicks(view: SimView, botIds: readonly EntityId[], rng: RngState): ControlMessage[] {
  const bots = [...botIds].sort((a, b) => a - b);
  const team = view.state.entities.find((e) => e.id === bots[0])?.team;
  const roster = view.state.entities.filter((e) => e.team === team).map((e) => ({ id: e.id, operatorId: e.operatorId }));
  const order = draw(PLAYABLE_OPERATORS, rng);
  const out: ControlMessage[] = [];
  bots.forEach((id, i) => {
    const me = roster.find((m) => m.id === id);
    if (!me) throw new Error(`Bot ${id} is not on team ${team}`);
    for (let k = 0; k < order.length; k++) {
      const operatorId = order[(i + k) % order.length];
      if (operatorId === undefined || !pickAllowed(roster, id, operatorId)) continue;
      if (operatorId !== me.operatorId) out.push({ type: 'selectOperator', entityId: id, operatorId });
      me.operatorId = operatorId;
      break;
    }
  });
  return out;
}
