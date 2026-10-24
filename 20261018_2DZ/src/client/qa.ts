// NEW — QA hook on window (pattern of 20260927_FPV/src/client/qa.ts): readiness flag, the live
// SimState, tick, fps and recent events for the Playwright tests. It never writes state: `send`
// queues a ControlMessage into the next PlayerCommand, exactly like the UI does.
import type { ControlMessage } from '../sim/commands.ts';
import type { SimEvent, SimState } from '../sim/state.ts';

export interface RotlandQa {
  /** The live state (read it; never mutate it from tests). */
  readonly state: SimState;
  readonly tick: number;
  readonly paused: boolean;
  fps(): number;
  /** Events of recent ticks (oldest first), optionally filtered by type. */
  events(type?: SimEvent['type']): SimEvent[];
  /** Resolves once the sim has advanced `n` more ticks. */
  waitTicks(n: number): Promise<void>;
  /** Queues a control (e.g. qaTeleport / qaSetTime) for the next sim tick. */
  send(control: ControlMessage): void;
  /** World tiles → CSS px relative to the canvas, with the last rendered view (to aim the mouse). */
  worldToCss(x: number, y: number): { x: number; y: number };
}

export interface QaHost {
  state(): SimState;
  paused(): boolean;
  fps(): number;
  events(): readonly SimEvent[];
  send(control: ControlMessage): void;
  worldToCss(x: number, y: number): { x: number; y: number };
}

declare global {
  interface Window {
    __gameReady?: boolean;
    __rotland?: RotlandQa;
  }
}

export function installQa(host: QaHost): void {
  window.__rotland = {
    get state() {
      return host.state();
    },
    get tick() {
      return host.state().tick;
    },
    get paused() {
      return host.paused();
    },
    fps: () => host.fps(),
    events: (type) => host.events().filter((e) => !type || e.type === type),
    send: (control) => host.send(control),
    worldToCss: (x, y) => host.worldToCss(x, y),
    waitTicks: (n) =>
      new Promise<void>((resolve) => {
        const target = host.state().tick + n;
        const poll = (): void => {
          if (host.state().tick >= target) resolve();
          else requestAnimationFrame(poll);
        };
        poll();
      }),
  };
}

export function markReady(): void {
  window.__gameReady = true;
}
