import type { BotSlot } from '../../ai/types.ts';
import { bindingLabel } from '../../config/client.ts';
import { RANGE_MODE } from '../../config/sim.ts';
import { DEG2RAD, fromTuple } from '../../sim/math.ts';
import { rangeOperators } from '../../sim/modes/range.ts';
import type { ModeHost } from './host.ts';

// NEW — hosting the range (SPEC §4.2): the player at the level's player spawn, the level's
// dummies driven by dummy brains, health bars over every dummy, no rounds. The switch key cycles
// the operators the range rules accept (rangeOperators: with RANGE_MODE.allOperators every
// operator in src/data/operators, ADR-0012 Q1); matches and bots keep PLAYABLE_OPERATORS.

export function createRangeHost(): ModeHost {
  const first = rangeOperators()[0];
  if (first === undefined) throw new Error('The range has no playable operator');
  return {
    usesTier: false,
    waitsForPlayer: false,
    spawn(sim) {
      const spawn = sim.level.playerSpawn;
      const player = sim.spawnCharacter({
        operatorId: first,
        team: RANGE_MODE.playerTeam,
        controller: 'player',
        position: fromTuple(spawn.position),
        yaw: spawn.yawDeg * DEG2RAD,
      });
      const slots = (sim.level.range?.dummies ?? []).map((d): BotSlot => {
        const dummy = sim.spawnCharacter({
          operatorId: d.operatorId,
          team: RANGE_MODE.dummyTeam,
          controller: 'bot',
          position: fromTuple(d.position),
          yaw: d.yawDeg * DEG2RAD,
        });
        return { entityId: dummy.id, brain: { kind: 'dummy', behaviour: d.behaviour } };
      });
      return { player, slots };
    },
    attach() {
      // The range has no screens of its own.
    },
    hint: () => `${bindingLabel('switchOperator')}: switch operator · ${bindingLabel('toggleDebug')}: debug overlay`,
    labelled: () => true,
    onEvents() {
      // The range has no match flow: respawns are the simulation's (range rules).
    },
    frame() {
      // Nothing per frame: health bars are the App's (labelled).
    },
    roundHud: () => null,
  };
}
