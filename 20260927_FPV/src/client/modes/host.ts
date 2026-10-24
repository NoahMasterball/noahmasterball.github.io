import type { BotSlot } from '../../ai/types.ts';
import type { AiTier } from '../../config/sim.ts';
import type { Vec3 } from '../../sim/math.ts';
import type { Sim } from '../../sim/sim.ts';
import type { CharacterEntity, SimEvent } from '../../sim/types.ts';
import type { RoundHudState } from '../ui/roundHud.ts';

// NEW — what differs between the modes the client hosts (ADR-0011 §7). The Session and the App
// run every mode through one code path and ask the mode's host for the rest; the registry
// MODE_HOSTS (./index.ts) has one host per simulation mode. ADR-0013 §8: which operators a switch
// may pick is the simulation's (Sim.accepts), not the host's; hosts may draw their own screens
// (Relay's operator select) through HostUi.

export interface HostSpawn {
  player: CharacterEntity;
  /** Every bot and its brain (src/ai/types.ts). */
  slots: BotSlot[];
}

// NEW — ADR-0013 §8: a host's own DOM (operator select, objective markers) needs the HUD root,
// world → screen projection and the pointer/menu interplay, all owned by the App.
/** What the App lends a host for its own screens. */
export interface HostUi {
  /** The HUD root: hosts add their layers here (ADR-0007). */
  readonly root: HTMLElement;
  /** A world point in CSS pixels of the viewport; null behind the camera or beyond its range. */
  project(p: Vec3): { x: number; y: number } | null;
  /** Locks the pointer and runs the match (only from a click: a browser rule). */
  capturePointer(): void;
  /** Shows the menu (the pointer is free then). */
  openMenu(): void;
  /** While suppressed, a free pointer shows the host's own screen instead of the menu. */
  setMenuSuppressed(suppressed: boolean): void;
}

export interface ModeHost {
  /** Combat bots play, so the difficulty setting matters. */
  readonly usesTier: boolean;
  /** The match only runs from the player's first "play" click (or the first QA action). */
  readonly waitsForPlayer: boolean;
  /** Spawns every character of the match (setup, Sim.spawnCharacter) and names the bots' brains. */
  spawn(sim: Sim, tier: AiTier): HostSpawn;
  /** Once, after the App has built its HUD: the host's own screens attach to `ui`. */
  attach(ui: HostUi): void;
  /** Key help at the top of the base HUD, or null. */
  hint(): string | null;
  /** Whether a character other than the player shows a floating health bar. */
  labelled(e: CharacterEntity): boolean;
  /** Every tick's events (and the setup events) as they happen. */
  onEvents(events: readonly SimEvent[], sim: Sim, player: CharacterEntity): void;
  /** Every rendered frame, after the camera is posed: the host's own screens. `visible` is false
   *  while a free (screenshot) camera shows the scene, when the HUD is hidden. */
  frame(sim: Sim, player: CharacterEntity, visible: boolean): void;
  /** What the round HUD shows now, or null in a mode without rounds. */
  roundHud(sim: Sim, player: CharacterEntity): RoundHudState | null;
}
