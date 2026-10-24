import { REPLAY } from '../config/sim.ts';
import type { Command } from './command.ts';
import type { SpawnOptions } from './entities.ts';
import type { ModeId } from './modes/mode.ts';
import { digest } from './snapshot.ts';
import type { ControlMessage, EntityId, SimState } from './types.ts';

// NEW — ADR-0014 §3: a match recording is the command log of a Sim (replays are command logs,
// ADR-0011 §3). The Sim records itself (Sim.create's `record` option), so no caller can bypass it;
// replayRecording (replay.ts) plays one back. This module is the format only and imports no Sim,
// so sim.ts and replay.ts both depend on it without an import cycle.

/** Bumped whenever the shape or the meaning of a recording changes. */
export const RECORDING_FORMAT = 1;

/** [entityId, moveX, moveZ, yaw, pitch, buttons] — the tick is the step's (Command.tick is
 *  informational, ADR-0014 §2). */
export type RecordedCommand = [EntityId, number, number, number, number, number];

export type RecordedOp =
  | { op: 'spawn'; options: SpawnOptions }
  /** Queued; applied at the next step, as live. */
  | { op: 'control'; msg: ControlMessage }
  /** Ascending entity id. */
  | { op: 'step'; commands: RecordedCommand[] };

/** Every input of a Sim since Sim.create, in call order. Plain data: it round-trips through JSON
 *  exactly (commands, spawn options and controls hold finite numbers, never −0). */
export interface MatchRecording {
  format: typeof RECORDING_FORMAT;
  levelId: string;
  mode: ModeId;
  seed: number;
  ops: RecordedOp[];
  /** State digests after the steps to multiples of REPLAY.checkpointEveryTicks. */
  checkpoints: { tick: number; digest: string }[];
}

/** An empty recording of a Sim created with `levelId`, `seed` and `mode`. */
export const createRecording = (levelId: string, mode: ModeId, seed: number): MatchRecording => ({
  format: RECORDING_FORMAT,
  levelId,
  mode,
  seed,
  ops: [],
  checkpoints: [],
});

/** A step's commands as recorded: ascending entity id, the tick dropped. */
export const recordCommands = (commands: ReadonlyMap<EntityId, Command>): RecordedCommand[] =>
  [...commands]
    .map(([id, c]): RecordedCommand => [id, c.moveX, c.moveZ, c.yaw, c.pitch, c.buttons])
    .sort((a, b) => a[0] - b[0]);

/** The commands of a recorded step, stamped with the tick they are stepped on. */
export const commandsOf = (recorded: readonly RecordedCommand[], tick: number): Map<EntityId, Command> =>
  new Map(recorded.map(([id, moveX, moveZ, yaw, pitch, buttons]) => [id, { tick, moveX, moveZ, yaw, pitch, buttons }]));

/** After a step: the checkpoint of `state` if its tick is a checkpoint tick, else null. */
export const checkpointOf = (state: Readonly<SimState>): MatchRecording['checkpoints'][number] | null =>
  state.tick % REPLAY.checkpointEveryTicks === 0 ? { tick: state.tick, digest: digest(state) } : null;
