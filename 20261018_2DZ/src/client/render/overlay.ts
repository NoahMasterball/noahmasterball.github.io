// NEW — per-frame world overlays: liquid (live, per visible cell: drawn here instead of in the
// chunk textures so flowing water never forces texture rebuilds), mining cracks from
// world.mining, and the cursor tile highlight (in reach vs out of reach).
import { RENDER } from '../../config/client.ts';
import { LIQUID, PLAYER } from '../../config/sim.ts';
import type { SimState, WorldGrid } from '../../sim/state.ts';
import { visibleTiles, worldToScreenX, worldToScreenY, type View } from '../camera.ts';
import { css } from '../color.ts';
import type { Theme } from '../dom.ts';
import { cellInRange } from '../../sim/interact.ts';
import { hash2 } from '../../sim/rng.ts';

/** Pure: fill fraction (0..1) of a liquid cell, full when liquid sits above it. */
export function liquidFill(amount: number, amountAbove: number): number {
  if (amount <= 0) return 0;
  return amountAbove > 0 ? 1 : Math.min(1, amount / LIQUID.max);
}

export function drawLiquid(ctx: CanvasRenderingContext2D, view: View, world: WorldGrid): void {
  const vis = visibleTiles(view);
  const x0 = Math.max(0, vis.x0);
  const y0 = Math.max(0, vis.y0);
  const x1 = Math.min(world.width, vis.x1);
  const y1 = Math.min(world.height, vis.y1);
  const body = new Path2D();
  const surf = new Path2D();
  const glow = new Path2D();
  const w = RENDER.water;
  const lineH = Math.max(1, Math.round(view.dpr * w.surfaceCssPx));
  const glowH = Math.max(1, Math.round(view.dpr * w.glowCssPx));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * world.width + x;
      const a = world.liquid[i] ?? 0;
      if (a === 0) continue;
      const above = y > 0 ? (world.liquid[i - world.width] ?? 0) : 0;
      const fill = liquidFill(a, above);
      const sx = Math.round(worldToScreenX(view, x));
      const ex = Math.round(worldToScreenX(view, x + 1));
      const top = Math.round(worldToScreenY(view, y + 1 - fill));
      const bottom = Math.round(worldToScreenY(view, y + 1));
      if (bottom <= top) continue;
      body.rect(sx, top, ex - sx, bottom - top);
      if (above === 0) {
        surf.rect(sx, top, ex - sx, lineH);
        const gh = Math.min(glowH, bottom - top - lineH);
        if (gh > 0) glow.rect(sx, top + lineH, ex - sx, gh);
      }
    }
  }
  ctx.fillStyle = css(w.color, w.alpha);
  ctx.fill(body);
  ctx.fillStyle = css(w.surfaceColor, w.surfaceAlpha);
  ctx.fill(surf);
  ctx.fillStyle = css(w.surfaceColor, w.glowAlpha);
  ctx.fill(glow);
}

export function drawCracks(ctx: CanvasRenderingContext2D, view: View, world: WorldGrid): void {
  if (world.mining.size === 0) return;
  ctx.save();
  ctx.strokeStyle = css(RENDER.crackColor, 0.85);
  ctx.lineWidth = Math.max(1, view.dpr * 1.5);
  for (const [i, m] of world.mining) {
    const stage = Math.min(RENDER.crackStages, Math.ceil(m.progress * RENDER.crackStages));
    if (stage <= 0) continue;
    const tx = i % world.width;
    const ty = (i / world.width) | 0;
    const sx = worldToScreenX(view, tx);
    const sy = worldToScreenY(view, ty);
    const s = view.scale;
    ctx.beginPath();
    // Each stage adds one deterministic crack line from near the centre outward.
    for (let k = 0; k < stage * 2; k++) {
      const ang = hash2(i, k, 0) * Math.PI * 2;
      const len = (0.25 + hash2(i, k, 1) * 0.25) * s;
      const mx = sx + s / 2 + (hash2(i, k, 2) - 0.5) * s * 0.2;
      const my = sy + s / 2 + (hash2(i, k, 3) - 0.5) * s * 0.2;
      ctx.moveTo(mx, my);
      const kx = mx + Math.cos(ang + 0.4) * len * 0.5;
      const ky = my + Math.sin(ang + 0.4) * len * 0.5;
      ctx.lineTo(kx, ky);
      ctx.lineTo(mx + Math.cos(ang) * len, my + Math.sin(ang) * len);
    }
    ctx.stroke();
  }
  ctx.restore();
}

export function drawCursor(ctx: CanvasRenderingContext2D, view: View, state: SimState, aimX: number, aimY: number, theme: Theme): void {
  if (state.player.dead) return;
  const tx = Math.floor(aimX);
  const ty = Math.floor(aimY);
  const ok = cellInRange(state.player, tx, ty, PLAYER.reach);
  const c = RENDER.cursor;
  const lw = Math.max(1, Math.round(c.lineCssPx * view.dpr));
  const sx = Math.round(worldToScreenX(view, tx));
  const sy = Math.round(worldToScreenY(view, ty));
  const ex = Math.round(worldToScreenX(view, tx + 1));
  const ey = Math.round(worldToScreenY(view, ty + 1));
  ctx.strokeStyle = css(ok ? theme.fg : theme.danger, c.alpha);
  ctx.lineWidth = lw;
  ctx.strokeRect(sx + lw / 2, sy + lw / 2, ex - sx - lw, ey - sy - lw);
}
