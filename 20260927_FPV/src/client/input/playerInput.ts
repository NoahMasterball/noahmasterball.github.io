import { BINDINGS, INPUT, type ClientAction } from '../../config/client.ts';
import { BUTTON, clampPitch, type ButtonName, type Command } from '../../sim/command.ts';
import { DEG2RAD } from '../../sim/math.ts';

// NEW — keyboard/mouse → per-tick Command (ADR-0003). Owns the local look angles (the intent);
// the simulation receives them in every command. Physical key codes keep WASD layout-independent.
// QA can hold extra buttons for scripted tests (src/client/qa.ts).

const isButton = (action: string): action is ButtonName => action in BUTTON;

export class PlayerInput {
  yaw = 0;
  pitch = 0;
  /** Look multiplier set each frame by the app (sensitivity × ADS scaling). */
  lookScale = 1;
  /** Accumulated look change since the last frame (view-model sway). */
  frameLookDelta = { yaw: 0, pitch: 0 };
  /** Whether mouse/keyboard input is accepted (pointer locked). */
  active = false;

  private readonly codes = new Set<string>();
  private readonly mouseButtons = new Set<number>();
  private qaButtons = 0;
  /** A wheel notch waiting to be sent; it is held for exactly one command, then released for at
   *  least one, so the simulation sees one press edge per notch. */
  private wheelPending = false;
  private wheelHeld = false;
  private lastWheelTime = -Infinity;
  private readonly onAction: (action: ClientAction) => void;

  constructor(onAction: (action: ClientAction) => void) {
    this.onAction = onAction;
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('mousedown', (e) => this.active && this.mouseButtons.add(e.button));
    window.addEventListener('mouseup', (e) => this.mouseButtons.delete(e.button));
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('wheel', (e) => this.onWheel(e), { passive: true });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', () => this.releaseAll());
  }

  setLook(yaw: number, pitch: number): void {
    this.yaw = yaw;
    this.pitch = clampPitch(pitch);
  }

  /** QA: buttons held in addition to real input until changed again. */
  setQaButtons(buttons: number): void {
    this.qaButtons = buttons;
  }

  releaseAll(): void {
    this.codes.clear();
    this.mouseButtons.clear();
    this.wheelPending = false;
  }

  consumeFrameLookDelta(): { yaw: number; pitch: number } {
    const d = this.frameLookDelta;
    this.frameLookDelta = { yaw: 0, pitch: 0 };
    return d;
  }

  sampleCommand(tick: number): Command {
    let buttons = this.qaButtons;
    let moveX = 0;
    let moveZ = 0;
    this.wheelHeld = !this.wheelHeld && this.wheelPending;
    if (this.wheelHeld) this.wheelPending = false;
    for (const b of BINDINGS) {
      const down = b.wheel
        ? this.wheelHeld
        : b.code !== undefined
          ? this.codes.has(b.code)
          : b.mouseButton !== undefined && this.mouseButtons.has(b.mouseButton);
      if (!down) continue;
      if (isButton(b.action)) buttons |= BUTTON[b.action];
      else if (b.action === 'moveForward') moveZ += 1;
      else if (b.action === 'moveBack') moveZ -= 1;
      else if (b.action === 'moveRight') moveX += 1;
      else if (b.action === 'moveLeft') moveX -= 1;
    }
    return { tick, moveX, moveZ, yaw: this.yaw, pitch: this.pitch, buttons };
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (!down) {
      this.codes.delete(e.code);
      return;
    }
    const binding = BINDINGS.find((b) => b.code === e.code);
    if (!binding || !this.active) return;
    e.preventDefault();
    if (e.repeat) return;
    this.codes.add(e.code);
    if (!isButton(binding.action) && (binding.action === 'switchOperator' || binding.action === 'toggleDebug')) {
      this.onAction(binding.action);
    }
  }

  private onWheel(e: WheelEvent): void {
    if (!this.active || e.deltaY === 0 || e.timeStamp - this.lastWheelTime < INPUT.wheelRepeatMs) return;
    this.lastWheelTime = e.timeStamp;
    this.wheelPending = true;
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.active) return;
    const k = INPUT.degreesPerCount * DEG2RAD * this.lookScale;
    const dYaw = -e.movementX * k;
    const oldPitch = this.pitch;
    this.yaw += dYaw;
    this.pitch = clampPitch(this.pitch - e.movementY * k);
    this.frameLookDelta.yaw += dYaw;
    this.frameLookDelta.pitch += this.pitch - oldPitch;
  }
}
