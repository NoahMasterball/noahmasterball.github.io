// NEW — world-space drawing primitives shared by the entity/effect/overlay drawers.
import { worldToScreenX, worldToScreenY, type View } from '../camera.ts';
import { css } from '../color.ts';

/** Filled rect in world tiles, rounded to device pixels. */
export function rectW(ctx: CanvasRenderingContext2D, view: View, x: number, y: number, w: number, h: number, color: number, alpha = 1): void {
  if (w < 0) {
    x += w;
    w = -w;
  }
  if (h < 0) {
    y += h;
    h = -h;
  }
  const sx = Math.round(worldToScreenX(view, x));
  const sy = Math.round(worldToScreenY(view, y));
  const ex = Math.round(worldToScreenX(view, x + w));
  const ey = Math.round(worldToScreenY(view, y + h));
  if (ex <= sx || ey <= sy) return;
  ctx.fillStyle = css(color, alpha);
  ctx.fillRect(sx, sy, ex - sx, ey - sy);
}

/** Linear interpolation. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
