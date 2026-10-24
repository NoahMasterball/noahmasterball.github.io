import { RANGE_MODE, secondsToTicks } from '../../../src/config/sim.ts';
import { RANGE_LEVEL } from '../../../src/data/levels/range.ts';
import type { Command } from '../../../src/sim/command.ts';
import type { Vec3 } from '../../../src/sim/math.ts';
import { Sim } from '../../../src/sim/sim.ts';
import type { CharacterEntity, SimEvent } from '../../../src/sim/types.ts';

// Shared helpers for tests that drive the real Sim through commands (moved out of sim.test.ts for
// the ability tests, ADR-0012 §11).

export const EAST = -Math.PI / 2; // yaw looking down +X
/** Whole ticks for `s` seconds: the sim's own rounding (secondsToTicks). */
export const SECONDS = secondsToTicks;

/** One character's input for `run`; omitted look angles keep the character's current look. */
export interface Input {
  moveX?: number;
  moveZ?: number;
  yaw?: number;
  pitch?: number;
  buttons?: number;
}

/** The command for tick `tick` that holds `input` for `e`. */
export const commandFor = (tick: number, e: Readonly<CharacterEntity>, input: Input = {}): Command => ({
  tick,
  moveX: input.moveX ?? 0,
  moveZ: input.moveZ ?? 0,
  yaw: input.yaw ?? e.yaw,
  pitch: input.pitch ?? e.pitch,
  buttons: input.buttons ?? 0,
});

/** Steps `ticks` ticks with `input` held for `e` (every other character idle); returns the events. */
export function run(sim: Sim, e: CharacterEntity, ticks: number, input: Input = {}): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) events.push(...sim.step(new Map([[e.id, commandFor(sim.state.tick + 1, e, input)]])));
  return events;
}

/** A range Sim with one player of `operatorId` at `position`, settled onto the floor. */
export async function world(operatorId: string, position: Vec3, yaw: number): Promise<{ sim: Sim; player: CharacterEntity }> {
  const sim = await Sim.create(RANGE_LEVEL);
  const player = sim.spawnCharacter({ operatorId, team: RANGE_MODE.playerTeam, controller: 'player', position, yaw });
  run(sim, player, 10); // settle onto the floor
  return { sim, player };
}

export type EventOf<T extends SimEvent['type']> = Extract<SimEvent, { type: T }>;

/** The events of one type, typed. */
export const ofType = <T extends SimEvent['type']>(events: readonly SimEvent[], type: T): EventOf<T>[] =>
  events.filter((e): e is EventOf<T> => e.type === type);
