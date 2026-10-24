// The only way the outside world (client input, tests) changes the simulation: one
// PlayerCommand per tick. Continuous input is sampled state; discrete UI actions are controls.
import type { RecipeId } from '../data/schema.ts';

export type SlotRef = { where: 'player'; slot: number } | { where: 'container'; slot: number };

export type ControlMessage =
  | { type: 'selectHotbar'; slot: number }
  /** Moves `count` (default: whole stack) from → to; merges equal items, swaps otherwise. */
  | { type: 'moveStack'; from: SlotRef; to: SlotRef; count?: number }
  /** Quick-move: player slot ↔ open container (or hotbar ↔ backpack when none is open). */
  | { type: 'quickMove'; from: SlotRef }
  | { type: 'dropStack'; from: SlotRef; count?: number }
  | { type: 'craft'; recipe: RecipeId; times: number }
  | { type: 'closeContainer' }
  /** QA only (tests/e2e, screenshots): sets the player body top-left and zeroes velocity. */
  | { type: 'qaTeleport'; x: number; y: number }
  /** QA only: sets timeOfDay (0..1). */
  | { type: 'qaSetTime'; timeOfDay: number };

export interface PlayerCommand {
  /** Horizontal intent, -1..1. */
  moveX: number;
  jump: boolean;
  /** Swim down / crouch. */
  down: boolean;
  /** Cursor position in world tiles (float). */
  aimX: number;
  aimY: number;
  /** Held: mine / attack / consume with the selected item. */
  primary: boolean;
  /** Held: place block / pour bucket; on a container/door: open/toggle. */
  secondary: boolean;
  controls: ControlMessage[];
}

export function emptyCommand(): PlayerCommand {
  return { moveX: 0, jump: false, down: false, aimX: 0, aimY: 0, primary: false, secondary: false, controls: [] };
}
