// Keyboard + Mouse + Pointer-Lock.
// API:
//   input.isDown(code)               – keydown state (KeyW, Space, ShiftLeft …)
//   input.consumeKey(code)           – true wenn seit letztem Consume neu gedrückt
//   input.mouseDx / mouseDy          – akkumulierte Delta seit letztem consumeMouseDelta
//   input.consumeMouseDelta()        – liefert {dx, dy} und resettet
//   input.mouseButtons               – { left: bool, right: bool }
//   input.consumeMouseButton(which)  – just-pressed für 'left' / 'right'
//   input.consumeWheel()             – akkumulierter Scroll-Step (±1 pro Notch)
//   input.locked                     – Pointer-Lock aktiv
//   input.onLockChange(cb)           – Callback beim Lock-State-Wechsel

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this._keys = new Set();
    this._keysJustPressed = new Set();
    this._mouseDx = 0;
    this._mouseDy = 0;
    this.mouseButtons = { left: false, right: false };
    this._mouseJustPressed = { left: false, right: false };
    this._wheelDelta = 0;
    this.locked = false;
    this._lockChangeHandlers = [];

    this._onKeyDown = (e) => {
      if (!this._keys.has(e.code)) this._keysJustPressed.add(e.code);
      this._keys.add(e.code);
    };
    this._onKeyUp = (e) => {
      this._keys.delete(e.code);
    };
    this._onMouseMove = (e) => {
      if (!this.locked) return;
      this._mouseDx += e.movementX || 0;
      this._mouseDy += e.movementY || 0;
    };
    this._onMouseDown = (e) => {
      if (!this.locked) return;
      if (e.button === 0) { this.mouseButtons.left = true;  this._mouseJustPressed.left = true; }
      if (e.button === 2) { this.mouseButtons.right = true; this._mouseJustPressed.right = true; }
    };
    this._onMouseUp = (e) => {
      if (e.button === 0) this.mouseButtons.left = false;
      if (e.button === 2) this.mouseButtons.right = false;
    };
    this._onWheel = (e) => {
      if (!this.locked) return;
      e.preventDefault();
      this._wheelDelta += Math.sign(e.deltaY);
    };
    this._onCanvasClick = () => {
      if (!this.locked && canvas.requestPointerLock) canvas.requestPointerLock();
    };
    this._onLockChange = () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) {
        this._keys.clear();
        this._keysJustPressed.clear();
        this.mouseButtons.left = false;
        this.mouseButtons.right = false;
        this._mouseJustPressed.left = false;
        this._mouseJustPressed.right = false;
        this._wheelDelta = 0;
      }
      this._lockChangeHandlers.forEach((cb) => cb(this.locked));
    };
    this._onContextMenu = (e) => e.preventDefault();

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    canvas.addEventListener('click', this._onCanvasClick);
    canvas.addEventListener('contextmenu', this._onContextMenu);
    canvas.addEventListener('wheel', this._onWheel, { passive: false });
    document.addEventListener('pointerlockchange', this._onLockChange);
  }

  isDown(code) {
    return this._keys.has(code);
  }

  consumeKey(code) {
    if (this._keysJustPressed.has(code)) {
      this._keysJustPressed.delete(code);
      return true;
    }
    return false;
  }

  consumeMouseDelta() {
    const dx = this._mouseDx;
    const dy = this._mouseDy;
    this._mouseDx = 0;
    this._mouseDy = 0;
    return { dx, dy };
  }

  consumeMouseButton(which) {
    if (this._mouseJustPressed[which]) {
      this._mouseJustPressed[which] = false;
      return true;
    }
    return false;
  }

  consumeWheel() {
    const v = this._wheelDelta;
    this._wheelDelta = 0;
    return v;
  }

  onLockChange(cb) {
    this._lockChangeHandlers.push(cb);
  }

  // Ruft man nach jedem Frame auf – räumt "just pressed"-Events auf, die niemand konsumiert hat.
  endFrame() {
    this._keysJustPressed.clear();
    this._mouseJustPressed.left = false;
    this._mouseJustPressed.right = false;
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    this.canvas.removeEventListener('click', this._onCanvasClick);
    this.canvas.removeEventListener('contextmenu', this._onContextMenu);
    this.canvas.removeEventListener('wheel', this._onWheel);
    document.removeEventListener('pointerlockchange', this._onLockChange);
  }
}
