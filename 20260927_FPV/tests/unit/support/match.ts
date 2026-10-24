import { BUTTON, type Command } from '../../../src/sim/command.ts';
import { eyeHeight, zoneWorldCenter } from '../../../src/sim/hitbox.ts';
import { anglesTo, type Vec3 } from '../../../src/sim/math.ts';
import type { Sim } from '../../../src/sim/sim.ts';
import type { CharacterEntity, EntityId, MatchPhase, SimEvent } from '../../../src/sim/types.ts';

// Shared helpers for the round-mode tests (elimination, Relay): stepping a real Sim with partial
// per-character inputs until a condition or a phase, and aimed fire (moved out of
// elimination.test.ts for relay.test.ts, ADR-0013 §9).

/** Per character: the fields of its command this tick (the rest: no input, the current look). */
export type Inputs = ReadonlyMap<EntityId, Partial<Command>>;

/** One tick with `inputs`; characters without an entry send no command. Returns the events. */
export function step(sim: Sim, inputs: Inputs = new Map()): SimEvent[] {
  const commands = new Map<EntityId, Command>();
  for (const [id, input] of inputs) {
    const e = sim.getCharacter(id);
    if (e) commands.set(id, { tick: sim.state.tick + 1, moveX: 0, moveZ: 0, yaw: e.yaw, pitch: e.pitch, buttons: 0, ...input });
  }
  return sim.step(commands);
}

/** Steps until the condition holds (checked after every tick) or `maxTicks` passed. */
export function stepUntil(sim: Sim, done: (events: SimEvent[]) => boolean, maxTicks: number, inputs: () => Inputs = () => new Map()): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < maxTicks; i++) {
    const events = step(sim, inputs());
    all.push(...events);
    if (done(events)) return all;
  }
  throw new Error(`condition not reached within ${maxTicks} ticks`);
}

/** Steps until a `phase` event of `phase`; returns every event on the way. */
export const untilPhase = (sim: Sim, phase: MatchPhase, maxTicks: number, inputs?: () => Inputs): SimEvent[] =>
  stepUntil(sim, (events) => events.some((e) => e.type === 'phase' && e.phase === phase), maxTicks, inputs);

/** Aimed, recoil-compensated fire of `shooter` at the torso of `target`, ADS held. The trigger
 *  is pressed every other tick, so semi-automatic weapons fire too. */
export function fireAt(sim: Sim, shooter: CharacterEntity, target: CharacterEntity): Partial<Command> {
  const eye: Vec3 = { x: shooter.pos.x, y: shooter.pos.y + eyeHeight(shooter.stance), z: shooter.pos.z };
  const aim = anglesTo(eye, zoneWorldCenter(target, 'torso'));
  const trigger = sim.state.tick % 2 === 0 ? BUTTON.fire : 0;
  return { yaw: aim.yaw - shooter.weapon.recoilYaw, pitch: aim.pitch - shooter.weapon.recoilPitch, buttons: trigger | BUTTON.ads };
}
