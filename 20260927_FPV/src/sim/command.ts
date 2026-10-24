import { CHARACTER } from '../config/sim.ts';
import { clamp, DEG2RAD, withoutNegativeZero } from './math.ts';
import type { CharacterEntity } from './types.ts';

// NEW — the per-tick input record shared by players and bots (ADR-0003, NETWORKING.md §5).
// Buttons are *held* state; press edges are derived inside the simulation by comparing with
// the previous command, so a lost or repeated command cannot create phantom presses.

export const BUTTON = {
  fire: 1 << 0,
  ads: 1 << 1,
  jump: 1 << 2,
  crouch: 1 << 3,
  sprint: 1 << 4,
  reload: 1 << 5,
  ability1: 1 << 6,
  ability2: 1 << 7,
  selectPrimary: 1 << 8,
  selectSecondary: 1 << 9,
  /** Swap to the next weapon slot (wraps around). */
  swapWeapon: 1 << 10,
  /** Held interaction with the world (ADR-0013 §5): Relay plants and disrupts the uplink with it. */
  interact: 1 << 11,
} as const;
export type ButtonName = keyof typeof BUTTON;

/** Ability slot index → button bit. */
export const ABILITY_BUTTONS = [BUTTON.ability1, BUTTON.ability2] as const;

export interface Command {
  tick: number;
  /** Strafe input, −1 (left) … 1 (right). */
  moveX: number;
  /** Forward input, −1 (back) … 1 (forward). */
  moveZ: number;
  /** Absolute look angles in radians (ADR-0009). */
  yaw: number;
  pitch: number;
  buttons: number;
}

export const idleCommand = (tick: number, yaw: number, pitch: number): Command => ({
  tick,
  moveX: 0,
  moveZ: 0,
  yaw,
  pitch,
  buttons: 0,
});

export const isHeld = (buttons: number, bit: number): boolean => (buttons & bit) !== 0;
export const wasPressed = (buttons: number, previous: number, bit: number): boolean =>
  isHeld(buttons, bit) && !isHeld(previous, bit);

const MAX_PITCH = CHARACTER.maxPitchDeg * DEG2RAD;

// NEW — ADR-0012 batch K: movement and the client input each clamped the pitch with a private copy.
/** A look pitch limited to ±CHARACTER.maxPitchDeg (never −0: withoutNegativeZero). */
export const clampPitch = (pitch: number): number => withoutNegativeZero(clamp(pitch, -MAX_PITCH, MAX_PITCH));

// NEW — ADR-0012 batch K: the spawn-tick rule was private to movement, so abilities (step 4 of
// Sim.step, before movement adopts the look) aimed with the raw command look.
/** The look `cmd` gives `e` on tick `tick`: the command's absolute look with the pitch clamped
 *  (clampPitch) and no −0 (withoutNegativeZero: the state stays JSON-exact), except on e's spawn
 *  tick — the command was chosen before a respawn in this tick's mode rules, so the spawn facing
 *  holds (CharacterEntity.spawnTick). Movement adopts it; throws and placements aim with it. */
export function commandLook(
  e: Readonly<Pick<CharacterEntity, 'yaw' | 'pitch' | 'spawnTick'>>,
  cmd: Readonly<Pick<Command, 'yaw' | 'pitch'>>,
  tick: number,
): { yaw: number; pitch: number } {
  return e.spawnTick === tick ? { yaw: e.yaw, pitch: e.pitch } : { yaw: withoutNegativeZero(cmd.yaw), pitch: clampPitch(cmd.pitch) };
}
