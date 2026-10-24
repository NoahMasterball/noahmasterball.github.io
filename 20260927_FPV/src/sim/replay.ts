import { getLevel } from '../data/content.ts';
import { commandsOf, RECORDING_FORMAT, type MatchRecording } from './recording.ts';
import { Sim } from './sim.ts';
import { digest } from './snapshot.ts';
import type { SimEvent } from './types.ts';

// NEW — ADR-0014 §3: plays a match recording back into a fresh Sim, without bots or any script:
// the DoD that the command log holds every input of a match.

/** Sim.create with the recording's level, seed and mode, then its ops in order (spawns, queued
 *  controls, steps) — no bots. `onStep` sees every step and its events (the first step's include
 *  those the setup emitted). Throws "replay diverged at tick N" at the first checkpoint whose
 *  state digest differs. */
export async function replayRecording(rec: Readonly<MatchRecording>, onStep?: (sim: Sim, events: SimEvent[]) => void): Promise<Sim> {
  if (rec.format !== RECORDING_FORMAT) throw new Error(`replayRecording: format ${String(rec.format)}, expected ${RECORDING_FORMAT}`);
  const sim = await Sim.create(getLevel(rec.levelId), rec.seed, rec.mode);
  let next = 0;
  for (const op of rec.ops) {
    switch (op.op) {
      case 'spawn':
        sim.spawnCharacter(op.options);
        break;
      case 'control':
        sim.control(op.msg);
        break;
      case 'step': {
        const events = sim.step(commandsOf(op.commands, sim.state.tick + 1));
        const checkpoint = rec.checkpoints[next];
        if (checkpoint?.tick === sim.state.tick) {
          if (digest(sim.state) !== checkpoint.digest) throw new Error(`replay diverged at tick ${checkpoint.tick}`);
          next += 1;
        }
        onStep?.(sim, events);
        break;
      }
    }
  }
  return sim;
}
