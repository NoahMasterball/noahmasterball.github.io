import type { WebGLRenderer } from 'three';
import { SHOTS, shotLaunch, type ShotDef, type ShotLaunch } from '../config/client.ts';
import { BUTTON, type ButtonName } from '../sim/command.ts';
import type { AbilityState, ActiveReveal, AreaEntity, GadgetEntity, MatchState, ProjectileEntity, SimEvent } from '../sim/types.ts';

// NEW — QA hooks on window (same pattern as FTB4, ARCHITECTURE §11): readiness flag, named
// screenshot shots, renderer stats and deterministic scripted input for the Playwright tests.
// Abilities are driven through the same buttons (setButtons: ability1/2, fire, ads — Commands
// only); the state shows their slots and the world objects they made (ADR-0012 §9). Long match
// phases (Relay's select and setup) are skipped with advanceTicks (ADR-0013 §8): Playwright on
// software WebGL runs far below real time.

export interface QaCharacter {
  id: number;
  operatorId: string;
  controller: 'player' | 'bot';
  team: number;
  alive: boolean;
  health: number;
  pos: { x: number; y: number; z: number };
  stance: number;
  ads: number;
  activeSlot: number;
  weaponId: string;
  swapping: boolean;
  /** Temporary HP from shields (shieldAmount). */
  shield: number;
  reveals: ActiveReveal[];
  /** Ability slots: resource and running activity (channel, on, placing). */
  abilities: AbilityState[];
}

export interface QaState {
  tick: number;
  playerId: number;
  /** A copy of the match state (mode, and for the round modes phase, round, score, sides; Relay
   *  also its channel and uplink). */
  match: MatchState;
  characters: QaCharacter[];
  /** Copies of the ability world objects. */
  gadgets: GadgetEntity[];
  projectiles: ProjectileEntity[];
  areas: AreaEntity[];
}

/** What the app exposes to the QA layer. */
export interface QaHost {
  readonly renderer: WebGLRenderer;
  /** The loaded launch (mode, level, seed); only its shots can be taken. */
  readonly launch: ShotLaunch;
  fps(): number;
  currentTick(): number;
  state(): QaState;
  events(): readonly SimEvent[];
  clearEvents(): void;
  waitTicks(n: number): Promise<void>;
  /** Steps `n` ticks now, synchronously, with the current input (events handled, nothing
   *  rendered); returns the tick reached. */
  advanceTicks(n: number): number;
  /** Bots send no commands or picks while idle (the controller keeps observing). */
  setBotsIdle(idle: boolean): void;
  waitFrames(n: number): Promise<void>;
  setQaButtons(buttons: number): void;
  aimAt(entityId: number, part: string): boolean;
  teleport(x: number, y: number, z: number, yawDeg: number, pitchDeg: number): Promise<void>;
  selectOperator(operatorId: string): Promise<void>;
  /** False if the shot could not be staged (e.g. the mode refused an operator switch). */
  applyShot(shot: ShotDef): Promise<boolean>;
}

export interface QaApi {
  state(): QaState;
  events(type?: SimEvent['type']): SimEvent[];
  clearEvents(): void;
  /** Buttons held (in addition to real input) until the next call; [] releases. */
  setButtons(buttons: ButtonName[]): void;
  waitTicks(n: number): Promise<void>;
  /** Steps `n` ticks at once (synchronously, with the held buttons; no rendering in between)
   *  and returns the tick reached: skips long phases where real time is too slow. */
  advanceTicks(n: number): number;
  /** Bots send neutral input and no operator picks while idle. */
  setBotsIdle(idle: boolean): void;
  aimAt(entityId: number, part: string): boolean;
  teleport(x: number, y: number, z: number, yawDeg: number, pitchDeg: number): Promise<void>;
  selectOperator(operatorId: string): Promise<void>;
}

declare global {
  interface Window {
    __gameReady?: boolean;
    /** Shots of the loaded launch (the screenshot tool loads each launch via the URL). */
    __shotNames?: string[];
    /** False for an unknown shot, one that belongs to another launch, or one that failed. */
    __setShot?: (name: string) => Promise<boolean>;
    __stats?: () => { fps: number; calls: number; triangles: number; tick: number };
    __qa?: QaApi;
  }
}

export function installQa(host: QaHost): void {
  const loaded = host.launch;
  const inLaunch = (shot: ShotDef | undefined): shot is ShotDef => {
    if (!shot) return false;
    const l = shotLaunch(shot);
    return l.mode === loaded.mode && l.levelId === loaded.levelId && l.seed === loaded.seed;
  };
  window.__shotNames = Object.keys(SHOTS).filter((name) => inLaunch(SHOTS[name]));
  window.__setShot = async (name: string): Promise<boolean> => {
    const shot = SHOTS[name];
    return inLaunch(shot) && host.applyShot(shot);
  };
  window.__stats = () => ({
    fps: host.fps(),
    calls: host.renderer.info.render.calls,
    triangles: host.renderer.info.render.triangles,
    tick: host.currentTick(),
  });
  window.__qa = {
    state: () => host.state(),
    events: (type) => host.events().filter((e) => !type || e.type === type),
    clearEvents: () => host.clearEvents(),
    setButtons: (buttons) => host.setQaButtons(buttons.reduce((bits, b) => bits | BUTTON[b], 0)),
    waitTicks: (n) => host.waitTicks(n),
    advanceTicks: (n) => host.advanceTicks(n),
    setBotsIdle: (idle) => host.setBotsIdle(idle),
    aimAt: (entityId, part) => host.aimAt(entityId, part),
    teleport: (x, y, z, yawDeg, pitchDeg) => host.teleport(x, y, z, yawDeg, pitchDeg),
    selectOperator: (id) => host.selectOperator(id),
  };
}

export function markReady(): void {
  window.__gameReady = true;
}
