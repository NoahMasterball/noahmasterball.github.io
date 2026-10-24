// NEW — per-frame lighting: sky light down open columns (scaled by daylight), TileDef.light
// emitters, a small player glow, propagated over the visible area + margin, drawn as a low-res
// darkness overlay scaled up smoothly (plus a warm screen-blended glow near emitters).
import { LIGHT } from '../../config/client.ts';
import { NO_WALL, TILE_DEFS } from '../../data/content.ts';
import type { SimState } from '../../sim/state.ts';
import { daylight } from '../../sim/time.ts';
import { visibleTiles, worldToScreenX, worldToScreenY, type View } from '../camera.ts';
import { abgr, mix } from '../color.ts';
import { addRadialLight, propagateLight } from './lightgrid.ts';

/** Per tile index: 1 if it blocks light (derived from TileDef.transparent, never typed twice). */
const OPAQUE_TILE = Uint8Array.from(TILE_DEFS, (d) => (d.transparent ? 0 : 1));
const EMIT_TILE = Float32Array.from(TILE_DEFS, (d) => d.light);

export class Lighting {
  private shadowCanvas = document.createElement('canvas');
  private glowCanvas = document.createElement('canvas');
  private light = new Float32Array(0);
  private warm = new Float32Array(0);
  private opaque = new Uint8Array(0);
  private w = 0;
  private h = 0;
  /** Light value (0..1) at a world cell from the last computed frame, for entity tinting. */
  private gx0 = 0;
  private gy0 = 0;

  private ensure(w: number, h: number): void {
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.light = new Float32Array(w * h);
    this.warm = new Float32Array(w * h);
    this.opaque = new Uint8Array(w * h);
    for (const c of [this.shadowCanvas, this.glowCanvas]) {
      c.width = w;
      c.height = h;
    }
  }

  compute(state: SimState, view: View): void {
    const world = state.world;
    const vis = visibleTiles(view);
    const m = LIGHT.margin;
    const x0 = vis.x0 - m;
    const y0 = vis.y0 - m;
    const w = vis.x1 - vis.x0 + 2 * m;
    const h = vis.y1 - vis.y0 + 2 * m;
    this.ensure(w, h);
    this.gx0 = x0;
    this.gy0 = y0;
    const { light, warm, opaque } = this;
    light.fill(0);
    warm.fill(0);
    const sky = LIGHT.nightFloor + (1 - LIGHT.nightFloor) * daylight(state.timeOfDay);
    const W = world.width;
    for (let gx = 0; gx < w; gx++) {
      // Columns beyond the world edge mirror the edge column (no dark seam at the border).
      const x = Math.max(0, Math.min(W - 1, x0 + gx));
      // Sky light: walk the column from the top; it stops at the first opaque tile or wall.
      let open = true;
      const yStart = Math.min(0, y0);
      for (let y = yStart; y < y0 + h; y++) {
        const gy = y - y0;
        const cellInside = y >= 0 && y < world.height;
        const i = y * W + x;
        const fg = cellInside ? (world.fg[i] ?? 0) : 0;
        const op = cellInside ? (OPAQUE_TILE[fg] ?? 1) : y >= world.height ? 1 : 0;
        if (cellInside && (op || (world.wall[i] ?? NO_WALL) !== NO_WALL)) open = false;
        if (gy < 0) continue;
        const gi = gy * w + gx;
        opaque[gi] = op;
        let v = open || y < 0 ? sky : 0;
        const e = cellInside ? (EMIT_TILE[fg] ?? 0) : 0;
        if (e > 0) {
          warm[gi] = e;
          if (e > v) v = e;
        }
        light[gi] = v;
      }
    }
    propagateLight(light, opaque, w, h, LIGHT.airFalloff, LIGHT.solidFalloff, LIGHT.sweeps);
    propagateLight(warm, opaque, w, h, LIGHT.airFalloff, LIGHT.solidFalloff, LIGHT.sweeps);
    const p = state.player.body;
    if (!state.player.dead) addRadialLight(light, w, h, p.x + p.w / 2 - x0, p.y + p.h / 2 - y0, LIGHT.playerGlow.radius, LIGHT.playerGlow.intensity);
    this.paint();
  }

  private paint(): void {
    const { w, h, light, warm } = this;
    const sctx = this.shadowCanvas.getContext('2d');
    const gctx = this.glowCanvas.getContext('2d');
    if (!sctx || !gctx) throw new Error('2D canvas unavailable');
    const shadow = sctx.createImageData(w, h);
    const glow = gctx.createImageData(w, h);
    const s32 = new Uint32Array(shadow.data.buffer);
    const g32 = new Uint32Array(glow.data.buffer);
    const tint = LIGHT.emitterTint;
    for (let i = 0; i < w * h; i++) {
      const l = Math.min(1, light[i] ?? 0);
      s32[i] = abgr(LIGHT.shadowColor, Math.round((1 - l) * 255));
      const wv = Math.min(1, warm[i] ?? 0) * tint.strength;
      g32[i] = abgr(mix(0x000000, tint.color, wv), 255);
    }
    sctx.putImageData(shadow, 0, 0);
    gctx.putImageData(glow, 0, 0);
  }

  /** Light 0..1 at a world cell (last computed frame); 1 outside the grid. */
  at(x: number, y: number): number {
    const gx = Math.floor(x) - this.gx0;
    const gy = Math.floor(y) - this.gy0;
    if (gx < 0 || gy < 0 || gx >= this.w || gy >= this.h) return 1;
    return Math.min(1, this.light[gy * this.w + gx] ?? 1);
  }

  draw(ctx: CanvasRenderingContext2D, view: View): void {
    const sx = worldToScreenX(view, this.gx0);
    const sy = worldToScreenY(view, this.gy0);
    const dw = this.w * view.scale;
    const dh = this.h * view.scale;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(this.glowCanvas, sx, sy, dw, dh);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.shadowCanvas, sx, sy, dw, dh);
    ctx.restore();
  }
}
