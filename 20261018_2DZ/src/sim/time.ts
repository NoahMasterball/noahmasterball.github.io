// Day/night clock. The one place that decides what "night" means.
import { DAY_NIGHT, DT } from '../config/sim.ts';
import type { SimState } from './state.ts';

export function advanceTime(state: SimState): void {
  state.timeOfDay += DT / DAY_NIGHT.cycleSeconds;
  if (state.timeOfDay >= 1) {
    state.timeOfDay -= 1;
    state.day += 1;
  }
}

export function isNight(timeOfDay: number): boolean {
  return timeOfDay >= DAY_NIGHT.nightStart || timeOfDay < DAY_NIGHT.nightEnd;
}

/** Sky brightness 0 (deep night) .. 1 (noon), smooth over dusk and dawn. */
export function daylight(timeOfDay: number): number {
  return Math.max(0, Math.min(1, 0.5 - Math.cos(timeOfDay * Math.PI * 2) * 0.9));
}
