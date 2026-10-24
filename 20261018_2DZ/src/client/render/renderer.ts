// NEW — frame composition: sky → tile chunks → liquid → cracks → drops/zombies/player →
// particles → light overlay → bright effects → cursor. Reads SimState only.
import { CAMERA } from '../../config/client.ts';
import type { SimState } from '../../sim/state.ts';
import { Camera, makeView, screenToWorld, type View } from '../camera.ts';
import type { Theme } from '../dom.ts';
import { ChunkLayer } from './chunks.ts';
import { EffectLayer } from './effects.ts';
import { EntityLayer } from './entities.ts';
import { Lighting } from './lighting.ts';
import { drawCracks, drawCursor, drawLiquid } from './overlay.ts';
import { SkyLayer } from './sky.ts';

export class Renderer {
  readonly camera = new Camera();
  readonly chunks = new ChunkLayer();
  readonly entities = new EntityLayer();
  readonly effects: EffectLayer;
  readonly lighting = new Lighting();
  private readonly sky = new SkyLayer();
  private readonly ctx: CanvasRenderingContext2D;
  private readonly theme: Theme;
  /** The view of the last frame (input aims with it). */
  view: View;

  private readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement, theme: Theme) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
    this.theme = theme;
    this.effects = new EffectLayer(theme);
    this.view = makeView(0, 0, 1, 1, 1, 1, 1);
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  /** Renders one frame. `alpha` interpolates between the last two ticks; `cursor` is CSS px. */
  render(state: SimState, alpha: number, dt: number, cursor: { x: number; y: number }, showCursor: boolean): void {
    this.resize();
    const dpr = window.devicePixelRatio || 1;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const b = state.player.body;
    const p = this.entities.pos('p', b, alpha);
    // Look-ahead toward the cursor (computed from the previous view, in tiles).
    const aim = screenToWorld(this.view, cursor.x, cursor.y);
    const cx = p.x + b.w / 2;
    const cy = p.y + b.h / 2 + CAMERA.focusOffsetY;
    this.camera.follow(cx + (aim.x - this.camera.x) * CAMERA.lookAhead, cy + (aim.y - this.camera.y) * CAMERA.lookAhead, dt);
    const world = state.world;
    const view = makeView(this.camera.x, this.camera.y, W, H, dpr, world.width, world.height);
    this.view = view;
    const ctx = this.ctx;

    this.sky.draw(ctx, view, state, this.camera.x);
    this.chunks.draw(ctx, view, world, state.seed);
    drawLiquid(ctx, view, world);
    drawCracks(ctx, view, world);
    this.entities.draw(ctx, view, state, alpha, dt);
    this.effects.update(dt);
    this.effects.drawWorld(ctx, view);
    this.lighting.compute(state, view);
    this.lighting.draw(ctx, view);
    this.effects.drawGlow(ctx, view);
    if (showCursor) {
      const a = screenToWorld(view, cursor.x, cursor.y);
      drawCursor(ctx, view, state, a.x, a.y, this.theme);
    }
  }
}
