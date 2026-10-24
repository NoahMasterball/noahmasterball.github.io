import { AI, RELAY, secondsToTicks } from '../config/sim.ts';
import type { Command } from '../sim/command.ts';
import { relayOf } from '../sim/modes/relay.ts';
import { deriveSeed } from '../sim/rng.ts';
import type { CharacterEntity, ControlMessage, EntityId, SimEvent } from '../sim/types.ts';
import { botCommand, botObserve, createBotState, createTacticalMap, createTeamPlan, planRound, roundKey, type BotState, type BrainContext, type TacticalMap, type TeamPlan } from './brain.ts';
import { DummyBrain } from './dummy.ts';
import { createTeamIntel, observeIntel, type TeamIntel } from './intel.ts';
import { createNavGraph } from './nav/graph.ts';
import { botPicks } from './picks.ts';
import type { BotController, BotSlot, CreateBotController, SimView, StepMatch } from './types.ts';

// NEW — the bot controller and the shared match step (ADR-0011 §1/§7). One controller drives
// every bot of a match: combat bots (brain.ts: one BotState with its own RNG stream, contacts,
// aim and nav state each; one TeamIntel and TeamPlan per team; one nav graph for all) and range
// dummies (dummy.ts). Hosts — the client Session and the tests — advance a match only through
// stepMatch, so bots see exactly what a player sees: the state after the previous tick. Relay
// operator picks (ADR-0013 §3) are control messages from the same place (picks.ts).

/** Ticks into a Relay operator select before the bots pick (the player picks first). */
const PICK_AFTER_TICKS = secondsToTicks(AI.relay.pickDelaySeconds);
const SELECT_TICKS = secondsToTicks(RELAY.preRoundSeconds);

/** A BotController that also lets tests and debug overlays read the bots' minds. */
export interface InspectableBotController extends BotController {
  /** The brain of a combat bot (read-only; undefined for dummies and unknown ids). */
  brain(entityId: EntityId): Readonly<BotState> | undefined;
  /** A team's round plan (read-only; undefined for teams without combat bots). */
  plan(team: number): Readonly<TeamPlan> | undefined;
}

interface TeamBots {
  plan: TeamPlan;
  intel: TeamIntel;
  bots: BotState[];
}

/** createBotController(view, slots, seed): builds the bots of `slots` (characters already
 *  spawned). Bot RNG streams derive from `seed` and the entity id (deriveSeed), team streams
 *  from `seed` and the team. The nav graph is built only when a combat bot needs it and the
 *  level has one (without it, combat bots hold where they stand). */
export const createBotController = ((view: SimView, slots: readonly BotSlot[], seed: number): InspectableBotController => {
  const character = (id: EntityId): CharacterEntity | undefined => view.state.entities.find((e) => e.id === id);
  const ordered = [...slots].sort((a, b) => a.entityId - b.entityId);

  const dummies = new Map<EntityId, DummyBrain>();
  const brains = new Map<EntityId, BotState>();
  const teams = new Map<number, TeamBots>();
  let k = 0;
  for (const slot of ordered) {
    const e = character(slot.entityId);
    if (!e) throw new Error(`Bot slot ${slot.entityId}: no such character`);
    if (slot.brain.kind === 'dummy') {
      dummies.set(slot.entityId, new DummyBrain(slot.entityId, slot.brain.behaviour, deriveSeed(seed, slot.entityId)));
      continue;
    }
    const bot = createBotState(slot.entityId, slot.brain.tier, seed, k++);
    brains.set(slot.entityId, bot);
    let team = teams.get(e.team);
    if (!team) {
      team = { plan: createTeamPlan(e.team, seed), intel: createTeamIntel(), bots: [] };
      teams.set(e.team, team);
    }
    team.bots.push(bot);
  }
  const map: TacticalMap | null = brains.size > 0 && view.level.nav ? createTacticalMap(view, createNavGraph(view)) : null;

  const selvesOf = (bots: readonly BotState[]): CharacterEntity[] =>
    bots.map((b) => {
      const e = character(b.entityId);
      if (!e) throw new Error(`Bot ${b.entityId} has no character`);
      return e;
    });

  return {
    controls(): ControlMessage[] {
      // Relay: once per operator select and team, AI.relay.pickDelaySeconds into it.
      const m = relayOf(view.state.match);
      if (!m || m.phase !== 'preRound' || m.phaseEndTick === null) return [];
      if (SELECT_TICKS - (m.phaseEndTick - view.state.tick) < PICK_AFTER_TICKS) return [];
      const out: ControlMessage[] = [];
      for (const team of teams.values()) {
        if (team.plan.pickedRound === m.round) continue;
        team.plan.pickedRound = m.round;
        out.push(...botPicks(view, team.bots.map((b) => b.entityId), team.plan.rng));
      }
      return out;
    },

    commands(tick: number): Map<EntityId, Command> {
      const now = view.state.tick;
      const round = roundKey(view.state.match);
      for (const team of teams.values()) {
        if (team.plan.round !== round) planRound(team.plan, team.bots, selvesOf(team.bots), { view, map }, now);
      }
      const out = new Map<EntityId, Command>();
      for (const slot of ordered) {
        const self = character(slot.entityId);
        if (!self?.alive) continue;
        const dummy = dummies.get(slot.entityId);
        const bot = brains.get(slot.entityId);
        const team = teams.get(self.team);
        if (dummy) {
          out.set(slot.entityId, dummy.command(self, tick));
        } else if (bot && team) {
          const teammates = view.state.entities.filter((e) => e.alive && e.team === self.team && e.id !== self.id).map((e) => e.pos);
          const ctx: BrainContext = { view, map, intel: team.intel, plan: team.plan, teammates };
          out.set(slot.entityId, botCommand(bot, self, ctx, tick));
        }
      }
      return out;
    },

    observe(events: readonly SimEvent[]): void {
      for (const team of teams.values()) observeIntel(team.intel, events);
      for (const [id, bot] of brains) {
        const self = character(id);
        if (self) botObserve(bot, self, view, events);
      }
    },

    brain: (entityId) => brains.get(entityId),
    plan: (team) => teams.get(team)?.plan,
  };
}) satisfies CreateBotController;

/** One match tick (ADR-0011 §1): the bots' control messages (queued after the host's) and
 *  commands from the state after the previous tick, merged with `external` (the characters no bot
 *  drives: the player), the sim step, then the tick's events to the bots. Returns the events for
 *  the host's own handlers. */
export const stepMatch: StepMatch = (sim, bots, external) => {
  const tick = sim.state.tick + 1;
  for (const msg of bots.controls(tick)) sim.control(msg);
  const commands = bots.commands(tick);
  for (const [id, cmd] of external) commands.set(id, cmd);
  const events = sim.step(commands);
  bots.observe(events);
  return events;
};
