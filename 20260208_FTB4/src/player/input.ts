import { INTERACT } from '../config';

/** Keyboard + pointer state for the third-person controls. */
export class Input {
  private readonly keys = new Set<string>();
  /** Accumulated mouse deltas since last consume (pointer-locked). */
  dx = 0;
  dy = 0;
  wheel = 0;
  private interactQueued = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === INTERACT.key) this.interactQueued = true;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('click', () => {
      if (document.pointerLockElement !== canvas) void canvas.requestPointerLock();
    });
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === this.canvas) {
        this.dx += e.movementX;
        this.dy += e.movementY;
      }
    });
    window.addEventListener('wheel', (e) => {
      this.wheel += Math.sign(e.deltaY);
    });
  }

  get forward(): number {
    return (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) -
      (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0);
  }

  get strafe(): number {
    return (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) -
      (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
  }

  get running(): boolean {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }

  /** Returns true once per E press. */
  consumeInteract(): boolean {
    const q = this.interactQueued;
    this.interactQueued = false;
    return q;
  }

  /** Read and reset accumulated pointer/wheel deltas (call once per frame). */
  consumeDeltas(): { dx: number; dy: number; wheel: number } {
    const d = { dx: this.dx, dy: this.dy, wheel: this.wheel };
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
    return d;
  }
}
