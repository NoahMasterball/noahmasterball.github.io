// NEW — player, zombies and drops drawn from rects (pixel-art figures), interpolated between the
// last two sim ticks. Looks: PLAYER_LOOK / ZOMBIE_LOOK / DROP_LOOK (config) and
// ZombieDef/ItemDef.presentation (data).
import { DROP_LOOK, PLAYER_LOOK, ZOMBIE_LOOK } from '../../config/client.ts';
import { ITEMS } from '../../data/items.ts';
import { ZOMBIES } from '../../data/zombies.ts';
import type { Body, SimState } from '../../sim/state.ts';
import type { View } from '../camera.ts';
import { shade, tint } from '../color.ts';
import { lerp, rectW } from './draw.ts';

interface Prev {
  x: number;
  y: number;
}

interface Anim {
  /** Distance walked (tiles) — drives the leg cycle. */
  walked: number;
  flash: number;
  lastX: number;
}

export class EntityLayer {
  private prev = new Map<string, Prev>();
  private anim = new Map<string, Anim>();
  /** Seconds left of the player's arm swing (set by use events). */
  swing = 0;
  private clock = 0;

  /** Call before each sim step: remembers positions for interpolation. */
  snapshot(state: SimState): void {
    const seen = new Set<string>();
    const put = (key: string, b: Body): void => {
      seen.add(key);
      const p = this.prev.get(key);
      if (p) {
        p.x = b.x;
        p.y = b.y;
      } else this.prev.set(key, { x: b.x, y: b.y });
    };
    put('p', state.player.body);
    for (const z of state.zombies) put(`z${z.id}`, z.body);
    for (const d of state.drops) put(`d${d.id}`, d.body);
    for (const key of this.prev.keys()) if (!seen.has(key)) this.prev.delete(key);
  }

  flash(key: string, seconds: number): void {
    const a = this.anim.get(key);
    if (a) a.flash = seconds;
    else this.anim.set(key, { walked: 0, flash: seconds, lastX: Number.NaN });
  }

  /** Interpolated top-left of a body. */
  pos(key: string, b: Body, alpha: number): Prev {
    const p = this.prev.get(key);
    if (!p || Math.abs(p.x - b.x) > 4 || Math.abs(p.y - b.y) > 4) return { x: b.x, y: b.y };
    return { x: lerp(p.x, b.x, alpha), y: lerp(p.y, b.y, alpha) };
  }

  private animFor(key: string, x: number, dt: number): Anim {
    let a = this.anim.get(key);
    if (!a) {
      a = { walked: 0, flash: 0, lastX: x };
      this.anim.set(key, a);
    }
    if (!Number.isNaN(a.lastX)) a.walked += Math.min(1, Math.abs(x - a.lastX));
    a.lastX = x;
    a.flash = Math.max(0, a.flash - dt);
    return a;
  }

  draw(ctx: CanvasRenderingContext2D, view: View, state: SimState, alpha: number, dt: number): void {
    this.clock += dt;
    this.swing = Math.max(0, this.swing - dt);
    for (const d of state.drops) this.drawDrop(ctx, view, d.id, d.body, d.stack.item, alpha);
    for (const z of state.zombies) this.drawZombie(ctx, view, state, z.id, alpha, dt);
    if (!state.player.dead) this.drawPlayer(ctx, view, state, alpha, dt);
    const live = new Set<string>(['p', ...state.zombies.map((z) => `z${z.id}`)]);
    for (const key of this.anim.keys()) if (!live.has(key)) this.anim.delete(key);
  }

  private drawDrop(ctx: CanvasRenderingContext2D, view: View, id: number, b: Body, item: keyof typeof ITEMS, alpha: number): void {
    const p = this.pos(`d${id}`, b, alpha);
    const bob = Math.sin(this.clock * DROP_LOOK.bobRate + id) * DROP_LOOK.bobAmplitude;
    const s = b.w;
    const y = p.y - Math.abs(bob);
    rectW(ctx, view, p.x - 0.06, y - 0.06, s + 0.12, s + 0.12, DROP_LOOK.outline, 0.8);
    rectW(ctx, view, p.x, y, s, s, ITEMS[item].presentation.color);
    rectW(ctx, view, p.x, y, s, s * 0.3, tint(ITEMS[item].presentation.color, 0.35));
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, view: View, state: SimState, alpha: number, dt: number): void {
    const pl = state.player;
    const b = pl.body;
    const p = this.pos('p', b, alpha);
    const a = this.animFor('p', p.x, dt);
    const L = PLAYER_LOOK;
    const f = pl.facing;
    const moving = Math.abs(b.vx) > 0.2 && b.onGround;
    const phase = a.walked * L.strideFreq * Math.PI * 2;
    const swingLeg = moving ? Math.sin(phase) : 0;
    const bob = moving ? Math.abs(Math.sin(phase)) * L.bob : 0;
    const air = !b.onGround;
    const W = b.w;
    const H = b.h;
    const x = p.x;
    const y = p.y - bob;
    const cx = x + W / 2;
    // Proportions in body units.
    const headH = H * 0.28;
    const torsoH = H * 0.36;
    const legH = H - headH - torsoH;
    const torsoW = W * 0.62;
    const legW = W * 0.26;
    const torsoX = cx - torsoW / 2;
    const torsoY = y + headH;
    const legY = torsoY + torsoH;
    const step = legW * 0.9;
    // Back leg, back arm, torso, front leg, head, front arm + held item.
    const backLegDX = air ? -f * step * 0.6 : -swingLeg * step;
    const frontLegDX = air ? f * step * 0.8 : swingLeg * step;
    rectW(ctx, view, cx - legW + backLegDX * 0.5, legY, legW, legH, shade(L.pants, 0.8));
    rectW(ctx, view, cx - legW + backLegDX * 0.5, legY + legH - legH * 0.2, legW, legH * 0.2, L.boots);
    const armW = W * 0.2;
    const armH = torsoH * 0.95;
    const swingT = this.swing > 0 ? this.swing : 0;
    rectW(ctx, view, cx - f * torsoW * 0.35 - armW / 2 - swingLeg * f * 0.1, torsoY + 0.05, armW, armH, shade(L.shirt, 0.75));
    rectW(ctx, view, torsoX, torsoY, torsoW, torsoH, L.shirt);
    rectW(ctx, view, torsoX, torsoY + torsoH * 0.82, torsoW, torsoH * 0.18, shade(L.pants, 0.7));
    rectW(ctx, view, cx + frontLegDX * 0.5, legY, legW, legH, L.pants);
    rectW(ctx, view, cx + frontLegDX * 0.5, legY + legH - legH * 0.2, legW, legH * 0.2, L.boots);
    const headW = W * 0.56;
    const headX = cx - headW / 2;
    rectW(ctx, view, headX, y, headW, headH, L.skin);
    rectW(ctx, view, headX, y, headW, headH * 0.3, L.hair);
    rectW(ctx, view, f > 0 ? headX : headX + headW * 0.75, y, headW * 0.25, headH * 0.6, L.hair);
    rectW(ctx, view, cx + f * headW * 0.22 - 0.05, y + headH * 0.45, 0.1, 0.12, 0x1a1410);
    // Front arm: reaches forward while swinging.
    const reach = swingT > 0 ? Math.sin((1 - swingT / L.swingSeconds) * Math.PI) : 0;
    const armX = cx + f * torsoW * 0.2 - armW / 2 + f * reach * 0.35;
    const armY = torsoY + 0.05 - reach * 0.15;
    rectW(ctx, view, armX, armY, armW, armH, L.shirt);
    rectW(ctx, view, armX, armY + armH - armW, armW, armW, L.skin);
    const held = pl.inventory.slots[pl.hotbar];
    if (held) {
      const def = ITEMS[held.item];
      const long = def.tool || def.melee || def.ranged;
      const hx = armX + armW / 2 + (f > 0 ? 0 : -0.5);
      const hy = armY + armH - armW;
      if (long) {
        if (def.ranged) rectW(ctx, view, f > 0 ? hx : hx - 0.2, hy - 0.05, 0.75, 0.2, def.presentation.color);
        else rectW(ctx, view, hx + (f > 0 ? 0.05 : 0.35), hy - 0.75 + reach * 0.3, 0.14, 0.85, def.presentation.color);
      } else rectW(ctx, view, hx + (f > 0 ? 0.1 : 0.2), hy - 0.15, 0.32, 0.32, def.presentation.color);
    }
    if (a.flash > 0) rectW(ctx, view, x, y, W, H, L.flashColor, (a.flash / L.flashSeconds) * 0.6);
    if (pl.invuln > 0 && Math.floor(this.clock * 20) % 2 === 0) rectW(ctx, view, x, y, W, H, L.flashColor, 0.12);
  }

  private drawZombie(ctx: CanvasRenderingContext2D, view: View, state: SimState, id: number, alpha: number, dt: number): void {
    const z = state.zombies.find((q) => q.id === id);
    if (!z) return;
    const key = `z${id}`;
    const b = z.body;
    const p = this.pos(key, b, alpha);
    const a = this.animFor(key, p.x, dt);
    const look = ZOMBIES[z.kind].presentation;
    const Z = ZOMBIE_LOOK;
    const f = z.facing;
    const phase = a.walked * Z.strideFreq * Math.PI * 2;
    const swing = Math.abs(b.vx) > 0.1 ? Math.sin(phase) : Math.sin(this.clock * 1.5 + id) * 0.15;
    const W = b.w;
    const H = b.h;
    const x = p.x;
    const y = p.y + Math.abs(swing) * 0.04;
    const cx = x + W / 2;
    const cloth = look.color;
    const skin = look.accent;
    const leg = shade(cloth, Z.legShade);
    if (H < W * 1.2) {
      // Low body (crawler): drawn lying, head forward.
      const torsoW = W * 0.7;
      const tx = f > 0 ? x : x + W - torsoW;
      rectW(ctx, view, tx, y + H * 0.35, torsoW, H * 0.45, cloth);
      const hx = f > 0 ? x + W - W * 0.3 : x;
      rectW(ctx, view, hx, y + H * 0.15 + swing * 0.05, W * 0.3, H * 0.55, skin);
      rectW(ctx, view, hx + (f > 0 ? W * 0.18 : W * 0.04), y + H * 0.3, 0.1, 0.1, Z.eyeColor);
      rectW(ctx, view, x + W * 0.2 + swing * 0.1, y + H * 0.8, W * 0.2, H * 0.2, skin);
      rectW(ctx, view, x + W * 0.6 - swing * 0.1, y + H * 0.8, W * 0.2, H * 0.2, skin);
    } else {
      const headH = H * 0.26;
      const torsoH = H * 0.38;
      const legH = H - headH - torsoH;
      const torsoW = W * 0.62;
      const legW = W * 0.26;
      const lean = f * Z.lean * W;
      const torsoY = y + headH;
      const legY = torsoY + torsoH;
      const step = legW * 0.7 * swing;
      rectW(ctx, view, cx - legW - step * 0.5, legY, legW, legH, shade(leg, 0.85));
      // Back arm stretched forward.
      rectW(ctx, view, cx + lean, torsoY + torsoH * 0.12 + swing * 0.05, f * W * 0.75, W * 0.18, shade(skin, 0.8));
      rectW(ctx, view, cx - torsoW / 2 + lean * 0.6, torsoY, torsoW, torsoH, cloth);
      rectW(ctx, view, cx - torsoW / 2 + lean * 0.6, torsoY + torsoH * 0.5, torsoW * 0.4, torsoH * 0.25, shade(cloth, 0.7));
      rectW(ctx, view, cx + step * 0.5, legY, legW, legH, leg);
      const headW = W * 0.56;
      const hx = cx - headW / 2 + lean;
      rectW(ctx, view, hx, y + Math.abs(swing) * 0.05, headW, headH, skin);
      rectW(ctx, view, hx + (f > 0 ? headW * 0.6 : headW * 0.15), y + headH * 0.4, 0.12, 0.1, Z.eyeColor);
      rectW(ctx, view, hx, y, headW, headH * 0.2, shade(skin, 0.7));
      // Front arm.
      rectW(ctx, view, cx + lean, torsoY + torsoH * 0.22 - swing * 0.05, f * W * 0.8, W * 0.18, skin);
    }
    if (a.flash > 0) rectW(ctx, view, x, y, W, H, PLAYER_LOOK.flashColor, (a.flash / Z.flashSeconds) * 0.7);
  }
}
