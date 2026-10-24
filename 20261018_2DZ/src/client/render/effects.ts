// NEW — short-lived visual feedback driven by SimEvents: particles (tile chips, blood, splash),
// shot tracers, melee swooshes and floating damage numbers. Client-only state (Math.random ok).
import { EFFECTS } from '../../config/client.ts';
import { TILE_DEFS, WALL_DEFS } from '../../data/content.ts';
import type { SimEvent } from '../../sim/state.ts';
import { worldToScreenX, worldToScreenY, type View } from '../camera.ts';
import { css } from '../color.ts';
import type { Theme } from '../dom.ts';
import { rectW } from './draw.ts';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: number;
}
interface Tracer {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  life: number;
}
interface Swoosh {
  x: number;
  y: number;
  dir: -1 | 1;
  life: number;
}
interface Number_ {
  x: number;
  y: number;
  text: string;
  color: number;
  life: number;
}

const rand = (a: number, b: number): number => a + Math.random() * (b - a);

export class EffectLayer {
  private particles: Particle[] = [];
  private tracers: Tracer[] = [];
  private swooshes: Swoosh[] = [];
  private numbers: Number_[] = [];
  private readonly theme: Theme;

  constructor(theme: Theme) {
    this.theme = theme;
  }

  private burst(x: number, y: number, n: number, color: number, speed: number): void {
    for (let i = 0; i < n && this.particles.length < EFFECTS.maxParticles; i++) {
      const life = rand(EFFECTS.particleLife[0], EFFECTS.particleLife[1]);
      this.particles.push({ x, y, vx: rand(-speed, speed), vy: rand(-speed * 1.4, speed * 0.3), life, max: life, color });
    }
  }

  handle(e: SimEvent): void {
    switch (e.type) {
      case 'tileBroken':
        this.burst(e.x + 0.5, e.y + 0.5, EFFECTS.breakParticles, TILE_DEFS[e.tile]?.presentation.color ?? 0, 7);
        break;
      case 'wallBroken':
        this.burst(e.x + 0.5, e.y + 0.5, EFFECTS.breakParticles, WALL_DEFS[e.wall]?.presentation.color ?? 0, 7);
        break;
      case 'tileHit':
        this.burst(e.x + 0.5, e.y + 0.5, EFFECTS.hitParticles, TILE_DEFS[e.tile]?.presentation.color ?? 0, 4);
        break;
      case 'shot':
        this.tracers.push({ x0: e.x0, y0: e.y0, x1: e.x1, y1: e.y1, life: EFFECTS.tracerSeconds });
        break;
      case 'melee':
        this.swooshes.push({ x: e.x, y: e.y, dir: e.dir, life: EFFECTS.swooshSeconds });
        break;
      case 'hit':
        this.burst(e.x, e.y, EFFECTS.hitParticles + 2, EFFECTS.bloodColor, 5);
        this.numbers.push({
          x: e.x,
          y: e.y,
          text: String(Math.round(e.damage)),
          color: e.target === 'player' ? this.theme.danger : this.theme.fg,
          life: EFFECTS.damageNumberSeconds,
        });
        break;
      case 'splash':
        this.burst(e.x, e.y, EFFECTS.splashParticles, EFFECTS.waterColor, 5);
        break;
      case 'zombieDied':
        this.burst(e.x, e.y, EFFECTS.breakParticles, EFFECTS.bloodColor, 6);
        break;
      default:
        break;
    }
  }

  update(dt: number): void {
    for (const p of this.particles) {
      p.vy += EFFECTS.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const t of this.tracers) t.life -= dt;
    this.tracers = this.tracers.filter((t) => t.life > 0);
    for (const s of this.swooshes) s.life -= dt;
    this.swooshes = this.swooshes.filter((s) => s.life > 0);
    for (const n of this.numbers) {
      n.life -= dt;
      n.y -= (EFFECTS.damageNumberRise / EFFECTS.damageNumberSeconds) * dt;
    }
    this.numbers = this.numbers.filter((n) => n.life > 0);
  }

  /** World-space effects (under the light overlay). */
  drawWorld(ctx: CanvasRenderingContext2D, view: View): void {
    const s = EFFECTS.particleSize;
    for (const p of this.particles) rectW(ctx, view, p.x - s / 2, p.y - s / 2, s, s, p.color, Math.min(1, (p.life / p.max) * 2));
  }

  /** Bright effects drawn above the light overlay (tracers, swooshes, numbers). */
  drawGlow(ctx: CanvasRenderingContext2D, view: View): void {
    ctx.save();
    ctx.lineCap = 'round';
    for (const t of this.tracers) {
      ctx.strokeStyle = css(EFFECTS.tracerColor, t.life / EFFECTS.tracerSeconds);
      ctx.lineWidth = Math.max(1, view.dpr * 2);
      ctx.beginPath();
      ctx.moveTo(worldToScreenX(view, t.x0), worldToScreenY(view, t.y0));
      ctx.lineTo(worldToScreenX(view, t.x1), worldToScreenY(view, t.y1));
      ctx.stroke();
    }
    for (const w of this.swooshes) {
      const k = w.life / EFFECTS.swooshSeconds;
      ctx.strokeStyle = css(this.theme.fg, k * 0.8);
      ctx.lineWidth = Math.max(1, view.dpr * 3 * k);
      const r = EFFECTS.swooshRadius * view.scale;
      const a0 = w.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
      const sweep = (1 - k) * Math.PI;
      ctx.beginPath();
      ctx.arc(worldToScreenX(view, w.x), worldToScreenY(view, w.y), r, a0, a0 + sweep * w.dir, w.dir < 0);
      ctx.stroke();
    }
    ctx.font = `bold ${Math.round(EFFECTS.damageFontCss * view.dpr)}px ${this.theme.font}`;
    ctx.textAlign = 'center';
    for (const n of this.numbers) {
      const x = worldToScreenX(view, n.x);
      const y = worldToScreenY(view, n.y);
      const a = Math.min(1, n.life / (EFFECTS.damageNumberSeconds * 0.5));
      ctx.fillStyle = css(0x000000, a * 0.7);
      ctx.fillText(n.text, x + view.dpr, y + view.dpr);
      ctx.fillStyle = css(n.color, a);
      ctx.fillText(n.text, x, y);
    }
    ctx.restore();
  }
}
