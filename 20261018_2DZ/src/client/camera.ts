// NEW — 2D camera: smooth follow, world clamp, devicePixelRatio aware, pixel-snapped origin.
// Canvas coordinates are DEVICE pixels; world coordinates are tiles (y down).
import { CAMERA } from '../config/client.ts';

export interface View {
  /** Device pixels per tile. */
  scale: number;
  /** World → device px: sx = wx * scale - originX (originX is an integer: pixel-snapped). */
  originX: number;
  originY: number;
  /** Canvas size in device pixels. */
  width: number;
  height: number;
  dpr: number;
}

/** Pure: the view for a camera centre (tiles), clamped so it never shows outside the world. */
export function makeView(cx: number, cy: number, width: number, height: number, dpr: number, worldW: number, worldH: number): View {
  const scale = CAMERA.tileCssPx * CAMERA.zoom * dpr;
  const halfW = width / scale / 2;
  const halfH = height / scale / 2;
  const x = clampCentre(cx, halfW, worldW);
  const y = clampCentre(cy, halfH, worldH);
  return { scale, originX: Math.round(x * scale - width / 2), originY: Math.round(y * scale - height / 2), width, height, dpr };
}

function clampCentre(c: number, half: number, size: number): number {
  if (half * 2 >= size) return size / 2;
  return Math.max(half, Math.min(size - half, c));
}

/** Pure: CSS pixel (relative to the canvas) → world tiles. */
export function screenToWorld(view: View, cssX: number, cssY: number): { x: number; y: number } {
  return { x: (cssX * view.dpr + view.originX) / view.scale, y: (cssY * view.dpr + view.originY) / view.scale };
}

/** Pure: world tiles → CSS pixel relative to the canvas (inverse of screenToWorld). */
export function worldToCss(view: View, wx: number, wy: number): { x: number; y: number } {
  return { x: worldToScreenX(view, wx) / view.dpr, y: worldToScreenY(view, wy) / view.dpr };
}

export function worldToScreenX(view: View, wx: number): number {
  return wx * view.scale - view.originX;
}
export function worldToScreenY(view: View, wy: number): number {
  return wy * view.scale - view.originY;
}

/** Visible integer tile range (inclusive start, exclusive end), unclamped. */
export function visibleTiles(view: View): { x0: number; y0: number; x1: number; y1: number } {
  return {
    x0: Math.floor(view.originX / view.scale),
    y0: Math.floor(view.originY / view.scale),
    x1: Math.ceil((view.originX + view.width) / view.scale),
    y1: Math.ceil((view.originY + view.height) / view.scale),
  };
}

export class Camera {
  x = 0;
  y = 0;
  private placed = false;

  /** Eases toward the target (tiles); the first call snaps. */
  follow(tx: number, ty: number, dt: number): void {
    if (!this.placed) {
      this.x = tx;
      this.y = ty;
      this.placed = true;
      return;
    }
    const k = 1 - Math.exp(-CAMERA.followRate * dt);
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;
  }

  /** Snap on the next follow (respawn / teleport). */
  cut(): void {
    this.placed = false;
  }
}
