import { SIM, TICK_DT } from '../../../src/config/sim.ts';
import { getAbility } from '../../../src/data/content.ts';
import { RANGE_LEVEL } from '../../../src/data/levels/range.ts';
import type { LevelDef } from '../../../src/data/schema.ts';
import { applyEffects } from '../../../src/sim/abilities/effects.ts';
import { effectContext, type EffectContext, type EffectScaling, type EffectVia } from '../../../src/sim/abilities/targeting.ts';
import { createSimContext, type SimContext } from '../../../src/sim/context.ts';
import { addCharacter, type SpawnOptions } from '../../../src/sim/entities.ts';
import type { Vec3 } from '../../../src/sim/math.ts';
import { initPhysics, PhysicsWorld } from '../../../src/sim/physics/world.ts';
import { createSimState } from '../../../src/sim/sim.ts';
import { movementSystem } from '../../../src/sim/systems/movement.ts';
import { weaponSystem } from '../../../src/sim/systems/weapons.ts';
import type { CharacterEntity, SimEvent } from '../../../src/sim/types.ts';
import { commandFor, type Input } from './world.ts';

// A SimContext over a real PhysicsWorld without a Sim (ADR-0012 §11): the state, context and
// characters are built exactly as Sim builds them (createSimState, createSimContext,
// addCharacter), but nothing steps on its own — tests apply effects, spawn gadgets or run single
// systems directly. Physics colliders created here reach scene queries only after a physics step.

/** Where and how an effect is applied (defaults: at the user's feet, via the user, scales 1). */
export type ApplyOptions = { origin?: Vec3; via?: EffectVia } & EffectScaling;

export interface AbilityWorld {
  ctx: SimContext;
  /** Every event emitted so far (drain() empties it). */
  events: SimEvent[];
  /** A character of `operatorId` on `team` with its feet at `position` (bot, facing −Z unless
   *  given), added as Sim.spawnCharacter adds it. */
  add(operatorId: string, team: number, position: Vec3, options?: Partial<Pick<SpawnOptions, 'controller' | 'yaw'>>): CharacterEntity;
  /** The effect context of `abilityId` used by `user` (see ApplyOptions for the defaults). */
  effect(abilityId: string, user: CharacterEntity, options?: ApplyOptions): EffectContext;
  /** Applies every effect of `abilityId` once as used by `user`; returns the events it emitted. */
  apply(abilityId: string, user: CharacterEntity, options?: ApplyOptions): SimEvent[];
  /** Returns and clears the events emitted so far. */
  drain(): SimEvent[];
  /** One physics step: pending gadget removals, then Rapier indexes new colliders and poses. */
  stepPhysics(): void;
  /** One tick for `e` alone: advances the tick, then Sim.step's movement (7), physics (8) and
   *  weapons (9) for it with `input` held, and its lastButtons (11). No abilities, triggers,
   *  areas or projectiles run. Returns the events. */
  stepCharacter(e: CharacterEntity, input?: Input): SimEvent[];
}

export async function abilityWorld(level: LevelDef = RANGE_LEVEL, seed: number = SIM.defaultSeed): Promise<AbilityWorld> {
  await initPhysics();
  const state = createSimState(seed);
  const physics = new PhysicsWorld(level);
  const w: AbilityWorld = {
    events: [],
    ctx: createSimContext(state, level, physics, (event) => w.events.push(event)),
    add: (operatorId, team, position, options = {}) =>
      addCharacter(w.ctx, { operatorId, team, position, controller: options.controller ?? 'bot', yaw: options.yaw ?? 0 }),
    effect: (abilityId, user, options = {}) => {
      const { origin, via, ...scaling } = options;
      return effectContext(w.ctx, getAbility(abilityId), user, origin ?? user.pos, via ?? { kind: 'user' }, scaling);
    },
    apply: (abilityId, user, options) => {
      const before = w.events.length;
      applyEffects(w.effect(abilityId, user, options));
      return w.events.slice(before);
    },
    drain: () => w.events.splice(0),
    stepPhysics: () => physics.step(),
    stepCharacter: (e, input = {}) => {
      state.tick += 1;
      state.time = state.tick * TICK_DT;
      const before = w.events.length;
      const cmd = commandFor(state.tick, e, input);
      if (e.alive) movementSystem(w.ctx, e, cmd, TICK_DT);
      physics.step();
      if (e.alive) weaponSystem(w.ctx, e, cmd, TICK_DT);
      e.lastButtons = cmd.buttons;
      return w.events.slice(before);
    },
  };
  return w;
}
