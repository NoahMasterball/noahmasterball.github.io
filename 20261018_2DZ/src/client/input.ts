// NEW — keyboard/mouse → one PlayerCommand per sim tick. Held controls are sampled (with a latch
// so a tap shorter than a tick still counts once); discrete controls are queued and sent once.
// Client-only actions (inventory, menu, debug, mute, drop) are forwarded to the app.
import { HOTBAR_KEYS, KEY_BINDINGS, MOUSE_BUTTONS, type ActionId } from '../config/client.ts';
import { PLAYER } from '../config/sim.ts';
import type { ControlMessage, PlayerCommand } from '../sim/commands.ts';
import { screenToWorld, type View } from './camera.ts';

const ACTIONS = Object.keys(KEY_BINDINGS) as ActionId[];

/** Pure: KeyboardEvent.code → bound action (first match in binding order), or null. */
export function actionForCode(code: string): ActionId | null {
  return ACTIONS.find((a) => KEY_BINDINGS[a].keys.includes(code)) ?? null;
}

/** Pure: hotbar slot after `steps` wheel notches from `current` (wraps). */
export function wheelSlot(current: number, steps: number): number {
  const n = PLAYER.hotbarSlots;
  return (((current + steps) % n) + n) % n;
}

/** Keys whose browser default (scroll, focus change, F3 search) must not fire. */
const PREVENT = new Set(['Space', 'Tab', 'F3', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class Input {
  private held = new Set<string>();
  private latched = new Set<ActionId>();
  private mouse = { x: 0, y: 0, primary: false, secondary: false, primaryLatch: false, secondaryLatch: false };
  private wheel = 0;
  private pendingHotbar: number | null = null;
  private queue: ControlMessage[] = [];
  /** True while a UI screen should swallow world clicks (pause menu). */
  worldBlocked = false;
  shiftHeld = false;

  private readonly onAction: (action: ActionId) => void;

  constructor(canvas: HTMLCanvasElement, onAction: (action: ActionId) => void) {
    this.onAction = onAction;
    window.addEventListener('keydown', (e) => this.keyDown(e));
    window.addEventListener('keyup', (e) => {
      this.held.delete(e.code);
      this.shiftHeld = e.shiftKey;
    });
    window.addEventListener('blur', () => this.releaseAll());
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === MOUSE_BUTTONS.primary) this.mouse.primary = this.mouse.primaryLatch = true;
      if (e.button === MOUSE_BUTTONS.secondary) this.mouse.secondary = this.mouse.secondaryLatch = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === MOUSE_BUTTONS.primary) this.mouse.primary = false;
      if (e.button === MOUSE_BUTTONS.secondary) this.mouse.secondary = false;
    });
    window.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left;
      this.mouse.y = e.clientY - r.top;
      this.shiftHeld = e.shiftKey;
    });
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.wheel += Math.sign(e.deltaY);
      },
      { passive: false },
    );
  }

  private keyDown(e: KeyboardEvent): void {
    this.shiftHeld = e.shiftKey;
    if (PREVENT.has(e.code)) e.preventDefault();
    const slot = HOTBAR_KEYS.indexOf(e.code);
    if (slot >= 0 && slot < PLAYER.hotbarSlots && !e.repeat) {
      this.pendingHotbar = slot;
      return;
    }
    const action = actionForCode(e.code);
    if (!action) return;
    if (!this.held.has(e.code)) this.latched.add(action);
    this.held.add(e.code);
    if (!e.repeat) this.onAction(action);
  }

  private isHeld(action: ActionId): boolean {
    return KEY_BINDINGS[action].keys.some((k) => this.held.has(k));
  }

  releaseAll(): void {
    this.held.clear();
    this.latched.clear();
    this.mouse.primary = this.mouse.secondary = this.mouse.primaryLatch = this.mouse.secondaryLatch = false;
  }

  /** Queues a UI control (inventory/crafting) for the next tick. */
  send(control: ControlMessage): void {
    this.queue.push(control);
  }

  /** Cursor in CSS px relative to the canvas. */
  cursor(): { x: number; y: number } {
    return { x: this.mouse.x, y: this.mouse.y };
  }

  /** Builds the command for one tick and consumes latches/queued controls. */
  buildCommand(view: View, currentHotbar: number): PlayerCommand {
    const aim = screenToWorld(view, this.mouse.x, this.mouse.y);
    const left = this.isHeld('left') || this.latched.has('left');
    const right = this.isHeld('right') || this.latched.has('right');
    const blocked = this.worldBlocked;
    const controls = this.queue;
    this.queue = [];
    const base = this.pendingHotbar ?? currentHotbar;
    const target = this.wheel !== 0 ? wheelSlot(base, this.wheel) : this.pendingHotbar;
    if (target !== null && target !== currentHotbar) controls.unshift({ type: 'selectHotbar', slot: target });
    this.pendingHotbar = null;
    this.wheel = 0;
    const cmd: PlayerCommand = {
      moveX: blocked ? 0 : (right ? 1 : 0) - (left ? 1 : 0),
      jump: !blocked && (this.isHeld('jump') || this.latched.has('jump')),
      down: !blocked && (this.isHeld('down') || this.latched.has('down')),
      aimX: aim.x,
      aimY: aim.y,
      primary: !blocked && (this.mouse.primary || this.mouse.primaryLatch),
      secondary: !blocked && (this.mouse.secondary || this.mouse.secondaryLatch),
      controls,
    };
    this.latched.clear();
    this.mouse.primaryLatch = this.mouse.secondaryLatch = false;
    return cmd;
  }
}
