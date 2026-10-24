import type { LevelDef } from '../data/schema.ts';
import type { PhysicsWorld } from './physics/world.ts';
import { createSimQuery, type SimQuery } from './query.ts';
import type { CharacterEntity, Entity, EntityId, SimEvent, SimState } from './types.ts';

// NEW — what every system receives: state, level, physics, the query surface and the event sink
// for the current tick.

/** A SimEvent without its tick (filled in by `emit`). */
export type EventInput = SimEvent extends infer E ? (E extends SimEvent ? Omit<E, 'tick'> : never) : never;

export interface SimContext {
  readonly state: SimState;
  /** The level being played (mode rules read spawn zones from it). */
  readonly level: LevelDef;
  readonly physics: PhysicsWorld;
  /** The same read-only queries bots and the client use (placement, area line of sight). */
  readonly query: SimQuery;
  emit(event: EventInput): void;
}

// NEW — the Sim built its context inline; the ability test harness (tests/unit/support/) needs
// the identical one without a Sim (ADR-0012 §11).
/** The context of a simulation over `state`: `emit` stamps events with the current tick and
 *  hands them to `sink`. */
export function createSimContext(state: SimState, level: LevelDef, physics: PhysicsWorld, sink: (event: SimEvent) => void): SimContext {
  return {
    state,
    level,
    physics,
    query: createSimQuery(physics),
    emit: (event) => sink({ ...event, tick: state.tick } as SimEvent),
  };
}

// NEW — one id space for characters and world objects (ADR-0012 §2), so physics side tables and
// events never collide. Lives in this leaf module (not entities.ts): gadgets, projectiles and
// areas allocate ids, and entities.ts depends on them through the effect registry.
/** The next free entity id (advances SimState.nextId). */
export const allocateId = (state: SimState): EntityId => state.nextId++;

// NEW — ADR-0012 batch K: Sim.getCharacter, the weapon hit and the areas, gadget triggers and
// projectiles each searched state.entities inline. In this leaf module for the same reason as
// allocateId.
/** The character with id `id`, if any. */
export const characterById = (state: Readonly<Pick<SimState, 'entities'>>, id: EntityId): CharacterEntity | undefined =>
  state.entities.find((e) => e.id === id);

/** The owner of a world object (gadget, projectile, area): credited with its effects also after
 *  death. Characters are never removed from the state, so it always exists; throws otherwise. */
export function ownerOf(state: Readonly<Pick<SimState, 'entities'>>, object: Readonly<Exclude<Entity, CharacterEntity>>): CharacterEntity {
  const owner = characterById(state, object.ownerId);
  if (!owner) throw new Error(`${object.kind} ${object.id} has no owner ${object.ownerId}`);
  return owner;
}
