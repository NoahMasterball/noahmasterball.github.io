import type { SimState } from './state.ts';

/** Allocates a unique entity id (zombies, drops). */
export function allocId(state: SimState): number {
  return state.nextId++;
}
