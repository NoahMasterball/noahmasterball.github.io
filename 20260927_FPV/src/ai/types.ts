import type { AiTier } from '../config/sim.ts';
import type { DummyBehaviour, LevelDef } from '../data/schema.ts';
import type { Command } from '../sim/command.ts';
import type { SimQuery } from '../sim/query.ts';
import type { ControlMessage, EntityId, SimEvent, SimState } from '../sim/types.ts';

// NEW — the contract between the bots (src/ai/) and their hosts (client Session, tests) —
// ADR-0011 §1. Frozen after batch B1: later batches implement it (B4: createBotController and
// stepMatch in src/ai/controller.ts) and the client codes against it (B5). Tiers and their
// tuning: AI_TIERS / AI.tiers in src/config/sim.ts. ADR-0013 §3 adds the bots' control messages
// (Relay operator picks).

/** What a bot may see of the simulation: read-only state, level data and world queries. `Sim`
 *  satisfies it structurally, so src/sim never imports src/ai. */
export interface SimView {
  readonly state: SimState;
  readonly level: LevelDef;
  readonly query: SimQuery;
}

/** A simulation the match loop can advance (`Sim` satisfies it). */
export interface SteppableSim extends SimView {
  step(commands: ReadonlyMap<EntityId, Command>): SimEvent[];
  /** Queues a control message for the start of the next step. */
  control(msg: ControlMessage): void;
}

/** Which brain drives a character: a combat bot of a tier, or a range dummy. */
export type BrainSpec = { kind: 'combat'; tier: AiTier } | { kind: 'dummy'; behaviour: DummyBehaviour };

export interface BotSlot {
  entityId: EntityId;
  brain: BrainSpec;
}

/** All bots of a match. Per tick N: controls(N) and commands(N) read the state after tick N − 1,
 *  the host queues the controls, merges the player's command and steps the sim, then hands that
 *  tick's events to observe(). */
export interface BotController {
  /** The bots' control messages for tick N (Relay operator picks), in queue order; usually none.
   *  Must not mutate the simulation state. */
  controls(tick: number): ControlMessage[];
  /** One command per living bot. Must not mutate the simulation state. */
  commands(tick: number): Map<EntityId, Command>;
  observe(events: readonly SimEvent[]): void;
}

/** createBotController(view, slots, seed) — bot RNG streams derive from `seed` (deriveSeed). */
export type CreateBotController = (view: SimView, slots: readonly BotSlot[], seed: number) => BotController;

/** stepMatch(sim, bots, external): one tick in the order above (the bots' controls are queued
 *  after any the host queued before); `external` holds the commands of the characters no bot
 *  drives (the player). Returns the tick's events. */
export type StepMatch = (sim: SteppableSim, bots: BotController, external: ReadonlyMap<EntityId, Command>) => SimEvent[];
