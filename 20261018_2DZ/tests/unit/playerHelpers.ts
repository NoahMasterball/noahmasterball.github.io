// NEW — shared helpers for the player/item test files (player, interact, inventory, crafting,
// drops). Not a *.test.ts file, so Vitest does not collect it.
import { TICK_RATE } from '../../src/config/sim.ts';
import type { ItemId } from '../../src/data/schema.ts';
import { emptyCommand, type PlayerCommand } from '../../src/sim/commands.ts';
import { step } from '../../src/sim/sim.ts';
import type { SimState } from '../../src/sim/state.ts';

/** 20 × 8 world, stone floor on the bottom row. Player (default (1, 0)) lands with feet at y = 7. */
export const FLAT = [
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '####################',
];

export function cmd(o: Partial<PlayerCommand> = {}): PlayerCommand {
  return { ...emptyCommand(), ...o, controls: o.controls ?? [] };
}

/** Runs `ticks` sim steps with the same (fresh-controls) command. */
export function run(state: SimState, c: Partial<PlayerCommand>, ticks: number): void {
  for (let i = 0; i < ticks; i++) step(state, cmd(i === 0 ? c : { ...c, controls: [] }));
}

/** Lets the player fall onto the ground (1 s idle). */
export function settle(state: SimState): void {
  run(state, {}, TICK_RATE);
}

export function ticksFor(seconds: number): number {
  return Math.ceil(seconds * TICK_RATE - 1e-9);
}

export function give(state: SimState, slot: number, item: ItemId, count: number): void {
  state.player.inventory.slots[slot] = { item, count };
}

/** Aim at the centre of cell (x, y). */
export function aimAt(x: number, y: number): Pick<PlayerCommand, 'aimX' | 'aimY'> {
  return { aimX: x + 0.5, aimY: y + 0.5 };
}
