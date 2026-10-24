import { OPERATORS, WEAPONS } from '../data/content.ts';
import { ttk, type TtkResult } from '../sim/combat/damage.ts';

// NEW — time-to-kill matrix: every weapon × every operator, body and head, per range
// (SPEC §9.2). Uses the simulation's damage pipeline, so the table cannot drift from the game.

export interface TtkCell {
  body: TtkResult;
  head: TtkResult;
}

export interface TtkTable {
  range: number;
  /** weaponId → operatorId → cell */
  cells: Map<string, Map<string, TtkCell>>;
}

export function ttkMatrix(ranges: readonly number[]): TtkTable[] {
  return ranges.map((range) => {
    const cells = new Map<string, Map<string, TtkCell>>();
    for (const w of WEAPONS) {
      const row = new Map<string, TtkCell>();
      for (const op of OPERATORS) {
        row.set(op.id, { body: ttk(w, op, 'torso', range), head: ttk(w, op, 'head', range) });
      }
      cells.set(w.id, row);
    }
    return { range, cells };
  });
}
