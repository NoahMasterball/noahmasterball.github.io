import type { BotController } from '../ai/types.ts';
import type { Command } from '../sim/command.ts';
import { Sim } from '../sim/sim.ts';
import type { CharacterEntity, EntityId, SimEvent } from '../sim/types.ts';
import { createBotController, stepMatch } from '../ai/controller.ts';
import type { LaunchOptions } from './launch.ts';
import type { ModeHost } from './modes/host.ts';
import { MODE_HOSTS } from './modes/index.ts';

// NEW — one match on this page (ADR-0011 §7): owns the Sim, the local player's entity and the
// BotController, and advances them together through stepMatch (bot commands → the player's
// command → Sim.step → the bots observe the events). Every mode shares this path; the mode's
// ModeHost adds what differs. A mode or level change reloads the page, so a session never
// ends and needs no teardown.

/** A command without its tick: the session stamps the tick it is sent for. */
export type QaCommand = Omit<Command, 'tick'>;

export class Session {
  readonly launch: LaunchOptions;
  readonly sim: Sim;
  readonly host: ModeHost;
  readonly player: CharacterEntity;
  private readonly bots: BotController;
  private setupEvents: SimEvent[];
  /** QA staging: commands that replace a bot's own (through the normal Command path). */
  private readonly qaCommands = new Map<EntityId, QaCommand>();
  /** QA staging: bots send no commands (neutral input) and no control messages (Relay picks)
   *  while the controller keeps observing, so staged captures do not depend on what the bots
   *  would decide. */
  botsIdle = false;

  static async create(launch: LaunchOptions): Promise<Session> {
    return new Session(launch, await Sim.create(launch.level, launch.seed, launch.mode));
  }

  private constructor(launch: LaunchOptions, sim: Sim) {
    this.launch = launch;
    this.sim = sim;
    this.host = MODE_HOSTS[launch.mode]();
    const { player, slots } = this.host.spawn(sim, launch.tier);
    this.player = player;
    this.bots = createBotController(sim, slots, launch.seed);
    // The setup events (spawns; elimination: round 1's preRound phase, emitted by Sim.create)
    // reach the bots like every tick's.
    this.setupEvents = sim.drainEvents();
    this.bots.observe(this.setupEvents);
  }

  /** The setup events, once: the app handles them like a tick's (look, round HUD, log). */
  takeSetupEvents(): SimEvent[] {
    const events = this.setupEvents;
    this.setupEvents = [];
    return events;
  }

  /** Advances one tick with the player's command; returns the tick's events. */
  step(playerCommand: Command): SimEvent[] {
    const tick = this.sim.state.tick + 1;
    const external = new Map<EntityId, Command>([[this.player.id, playerCommand]]);
    for (const [id, cmd] of this.qaCommands) external.set(id, { ...cmd, tick });
    return stepMatch(this.sim, this.controller(), external);
  }

  /** QA: send `cmd` for a bot every tick instead of its own command (null: back to the bot). */
  setQaCommand(entityId: EntityId, cmd: QaCommand | null): void {
    if (cmd) this.qaCommands.set(entityId, cmd);
    else this.qaCommands.delete(entityId);
  }

  /** The controller for this tick: the bots' own, minus what QA staging replaces. */
  private controller(): BotController {
    const bots = this.bots;
    if (!this.botsIdle && this.qaCommands.size === 0) return bots;
    return {
      controls: (tick) => (this.botsIdle ? [] : bots.controls(tick)),
      commands: (tick) => {
        if (this.botsIdle) return new Map();
        const own = bots.commands(tick);
        for (const id of this.qaCommands.keys()) own.delete(id);
        return own;
      },
      observe: (events) => bots.observe(events),
    };
  }
}
