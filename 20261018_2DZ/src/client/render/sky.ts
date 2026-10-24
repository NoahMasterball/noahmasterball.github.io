// NEW — sky: banded gradient from daylight(timeOfDay) blended with the biome sky/haze across the
// view (smooth at zone borders), stars, pixel sun and moon on an arc, and Terraria-style parallax
// layers: pale stepped mountains, far pines, near forest (or a skyline in urban biomes —
// SKY.skylineBiomes). Tree density per layer comes from BiomeDef.presentation.backdrop.
// Backdrop art is drawn at texel resolution (one art px = one tile texel) into a small offscreen
// canvas from cached sprites/strips, tinted there (fog, biome haze, night) and blitted up unsmoothed.
import { RENDER, SKY } from '../../config/client.ts';
import { BIOME_DEFS } from '../../data/content.ts';
import { BIOME_IDS } from '../../data/schema.ts';
import { hash2, noise1 } from '../../sim/rng.ts';
import type { SimState } from '../../sim/state.ts';
import { daylight } from '../../sim/time.ts';
import { screenToWorld, worldToScreenY, type View } from '../camera.ts';
import { abgr, css, mix } from '../color.ts';

const URBAN: readonly number[] = BIOME_IDS.map((id) => SKY.skylineBiomes[id] ?? 0);

/** Hash seeds of the backdrop features (fixed: the backdrop looks the same in every world). */
const SEED = { mountains: 101, tree: 211, slot: 307, building: 401, crater: 503 } as const;

export interface SkyColors {
  top: number;
  horizon: number;
  haze: number;
  light: number;
}

/** Pure: sky colours for a daylight value and biome sky/haze, with a dusk tint around 0.5 light. */
export function skyColors(light: number, biomeSky: number, biomeHaze: number): SkyColors {
  const dusk = Math.max(0, 1 - Math.abs(light - 0.45) / 0.3) * SKY.duskStrength;
  const top = mix(SKY.nightTop, biomeSky, light);
  const horizon = mix(mix(SKY.nightHorizon, biomeHaze, light), SKY.duskColor, dusk);
  return { top, horizon, haze: mix(SKY.nightHorizon, biomeHaze, light), light };
}

function lerp(range: readonly [number, number], t: number): number {
  return range[0] + (range[1] - range[0]) * t;
}

function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, w);
  canvas.height = Math.max(1, h);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return { canvas, ctx };
}

/** Pine silhouette: stacked jagged tiers, lit left edge, short trunk. */
function pineSprite(layer: (typeof SKY.treeLayers)[number], li: number, vi: number): HTMLCanvasElement {
  const t = SKY.treeVariants > 1 ? vi / (SKY.treeVariants - 1) : 0.5;
  const h = Math.round(lerp(layer.height, (t + hash2(SEED.tree, li, vi) * 0.5) / 1.5));
  const w = Math.max(3, Math.round(h * layer.width) | 1);
  const trunkH = Math.max(2, Math.round(h * 0.08));
  const crownH = h - trunkH;
  const tiers = SKY.pineTiers[0] + Math.floor(hash2(SEED.tree, li, vi + 100) * SKY.pineTiers[1]);
  const { canvas, ctx } = makeCanvas(w, h);
  const cx = (w - 1) / 2;
  for (let y = 0; y < crownH; y++) {
    const p = (y + 1) / crownH;
    const tierF = (p * tiers) % 1;
    const jag = hash2(SEED.tree, vi * 977 + li, y) < 0.3 ? 1 : 0;
    const hw = Math.max(0.5, (w / 2) * (0.2 + 0.8 * p) * (0.5 + 0.5 * tierF)) - jag;
    const x0 = Math.round(cx - hw);
    const x1 = Math.round(cx + hw);
    const lit = Math.max(1, Math.round((x1 - x0) * 0.3));
    ctx.fillStyle = css(layer.color);
    ctx.fillRect(x0, y, x1 - x0 + 1, 1);
    ctx.fillStyle = css(layer.light);
    ctx.fillRect(x0, y, lit, 1);
  }
  ctx.fillStyle = css(layer.trunk);
  const tw = Math.max(1, Math.round(w * 0.12));
  ctx.fillRect(Math.round(cx - tw / 2), crownH, tw, trunkH);
  return canvas;
}

/** Repeating mountain strip: triangular stepped peaks, lit left faces. Bottom row = baseline. */
function mountainStrip(): HTMLCanvasElement {
  const m = SKY.mountains;
  const H = Math.ceil(m.height[1]) + 1;
  const { canvas, ctx } = makeCanvas(m.period, H);
  const peaks = Array.from({ length: m.peaks }, (_, i) => ({
    x: ((i + 0.2 + hash2(SEED.mountains, i, 0) * 0.6) / m.peaks) * m.period,
    h: lerp(m.height, hash2(SEED.mountains, i, 1)),
    s: lerp(m.slope, hash2(SEED.mountains, i, 2)),
  }));
  for (let x = 0; x < m.period; x++) {
    let best = 0;
    let left = false;
    for (const pk of peaks) {
      let dx = x - pk.x;
      if (dx > m.period / 2) dx -= m.period;
      if (dx < -m.period / 2) dx += m.period;
      const hh = pk.h - Math.abs(dx) * pk.s;
      if (hh > best) {
        best = hh;
        left = dx < 0;
      }
    }
    const h = Math.floor(best / m.step) * m.step;
    if (h <= 0) continue;
    ctx.fillStyle = css(left ? m.light : m.color);
    ctx.fillRect(x, H - h, 1, h);
  }
  return canvas;
}

/** Pixel disc with stepped glow rings; sun gets rays, moon craters. */
function bodySprite(kind: 'sun' | 'moon', glowScale: number): HTMLCanvasElement {
  const sun = SKY.sun;
  const r = kind === 'sun' ? sun.radius : SKY.moon.radius;
  const outer = SKY.glow.reduce((a, g) => Math.max(a, g.r), 1);
  const R = Math.ceil(r * outer) + sun.rays + 1;
  const size = R * 2;
  const { canvas, ctx } = makeCanvas(size, size);
  const img = ctx.createImageData(size, size);
  const px = new Uint32Array(img.data.buffer);
  const glowColor = kind === 'sun' ? sun.color : SKY.moon.color;
  const rings = [...SKY.glow].sort((a, b) => a.r - b.r);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - R, y + 0.5 - R);
      let c = -1;
      let a = 255;
      if (d <= r) {
        c = kind === 'sun' ? (d <= r * sun.coreFrac ? sun.core : sun.color) : SKY.moon.color;
      } else {
        const ring = rings.find((g) => d <= r * g.r);
        if (ring) {
          c = glowColor;
          a = Math.round(255 * ring.alpha * glowScale);
        }
      }
      if (c >= 0) px[y * size + x] = abgr(c, a);
    }
  }
  if (kind === 'sun') {
    // Rays: short pixel spikes on the 8 compass directions.
    for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * Math.PI * 2;
      for (let s = 1; s <= sun.rays; s++) {
        const d = r * SKY.glow[0].r + s;
        const x = Math.round(R - 0.5 + Math.cos(ang) * d);
        const y = Math.round(R - 0.5 + Math.sin(ang) * d);
        if (x >= 0 && y >= 0 && x < size && y < size) px[y * size + x] = abgr(sun.rayColor, Math.round(255 * (1 - s / (sun.rays + 1))));
      }
    }
  } else {
    for (let k = 0; k < 3; k++) {
      const cr = 1 + Math.floor(hash2(SEED.crater, k, 0) * 2);
      const ox = Math.round(R + (hash2(SEED.crater, k, 1) - 0.5) * r);
      const oy = Math.round(R + (hash2(SEED.crater, k, 2) - 0.5) * r);
      for (let y = -cr; y <= cr; y++) {
        for (let x = -cr; x <= cr; x++) {
          if (x * x + y * y > cr * cr) continue;
          const i = (oy + y) * size + ox + x;
          if (Math.hypot(ox + x + 0.5 - R, oy + y + 0.5 - R) <= r - 1) px[i] = abgr(SKY.moon.crater);
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

interface Art {
  mountains: HTMLCanvasElement;
  trees: HTMLCanvasElement[][];
  sun: HTMLCanvasElement;
  moon: HTMLCanvasElement;
}

/** Per-frame biome blend across the view: averaged sky/haze, and per-sample urban/backdrop weights. */
interface Blend {
  sky: number;
  haze: number;
  urban: Float32Array;
  density: Float32Array[];
}

export class SkyLayer {
  private art: Art | null = null;
  /** Art-resolution canvases: one layer being tinted, and the stack of all tinted layers. */
  private off: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }[] = [];

  private getArt(): Art {
    if (!this.art) {
      this.art = {
        mountains: mountainStrip(),
        trees: SKY.treeLayers.map((layer, li) => Array.from({ length: SKY.treeVariants }, (_, vi) => pineSprite(layer, li, vi))),
        sun: bodySprite('sun', 1),
        moon: bodySprite('moon', SKY.moonGlow),
      };
    }
    return this.art;
  }

  /** Offscreen art-resolution canvases covering the view (resized on demand). */
  private getOff(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }[] {
    if (this.off[0]?.canvas.width !== w || this.off[0].canvas.height !== h) this.off = [makeCanvas(w, h), makeCanvas(w, h)];
    return this.off;
  }

  private blend(state: SimState, view: View): Blend {
    const w = state.world;
    const n = SKY.biomeSamples;
    let r = 0;
    let g = 0;
    let b = 0;
    let hr = 0;
    let hg = 0;
    let hb = 0;
    const urban = new Float32Array(n);
    const density = SKY.treeLayers.map(() => new Float32Array(n));
    for (let i = 0; i < n; i++) {
      const sx = ((i + 0.5) / n) * (view.width / view.dpr);
      const col = Math.max(0, Math.min(w.width - 1, Math.floor(screenToWorld(view, sx, 0).x)));
      const biome = w.biome[col] ?? 0;
      const p = BIOME_DEFS[biome]?.presentation;
      const sky = p?.sky ?? 0;
      const haze = p?.haze ?? 0;
      r += (sky >> 16) & 255;
      g += (sky >> 8) & 255;
      b += sky & 255;
      hr += (haze >> 16) & 255;
      hg += (haze >> 8) & 255;
      hb += haze & 255;
      urban[i] = URBAN[biome] ?? 0;
      SKY.treeLayers.forEach((layer, li) => {
        const d = density[li];
        if (d) d[i] = p?.backdrop[layer.trees] ?? 0;
      });
    }
    const pack = (x: number, y: number, z: number): number => (Math.round(x / n) << 16) | (Math.round(y / n) << 8) | Math.round(z / n);
    return { sky: pack(r, g, b), haze: pack(hr, hg, hb), urban, density };
  }

  draw(ctx: CanvasRenderingContext2D, view: View, state: SimState, camX: number): void {
    const art = this.getArt();
    const light = daylight(state.timeOfDay);
    const bl = this.blend(state, view);
    const c = skyColors(light, bl.sky, bl.haze);
    const W = view.width;
    const H = view.height;
    /** Device px per art px (= one tile texel). */
    const a = Math.max(1, Math.round(view.scale / RENDER.tileTexels));

    // Banded gradient: flat stripes snapped to the art grid.
    const rows = Math.ceil(H / a);
    const bandRows = Math.max(1, Math.ceil(rows / SKY.bands));
    for (let y = 0; y < rows; y += bandRows) {
      const t = Math.min(1, (y + bandRows / 2) / rows / SKY.horizonAt);
      ctx.fillStyle = css(mix(c.top, c.horizon, t * t * (3 - 2 * t)));
      ctx.fillRect(0, y * a, W, bandRows * a);
    }

    // Stars fade in at night (fixed to the screen, slowly twinkling).
    const starAlpha = Math.max(0, 1 - light * 2.2);
    if (starAlpha > 0.01) {
      ctx.fillStyle = css(0xffffff, starAlpha * 0.8);
      for (let i = 0; i < SKY.starCount; i++) {
        const tw = 0.6 + 0.4 * Math.sin(state.tick * 0.03 + i * 1.7);
        if (hash2(7, i, 2) > tw) continue;
        const sx = Math.floor((hash2(7, i, 0) * W) / a) * a;
        const sy = Math.floor((hash2(7, i, 1) * H * 0.6) / a) * a;
        ctx.fillRect(sx, sy, a, a);
      }
    }

    const smoothing = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;

    // Sun (day half) and moon (opposite) on an arc across the view.
    const drawBody = (angle: number, sprite: HTMLCanvasElement): void => {
      if (Math.sin(angle) < -0.1) return;
      const x = W / 2 - Math.cos(angle) * W * 0.45;
      const y = H * 0.85 - Math.sin(angle) * H * SKY.arcHeight;
      const s = sprite.width * a;
      ctx.drawImage(sprite, Math.round((x - s / 2) / a) * a, Math.round((y - s / 2) / a) * a, s, s);
    };
    // timeOfDay 0.25 = sunrise (angle 0), 0.5 = noon (π/2), 0.75 = sunset (π).
    const sunAngle = (state.timeOfDay - 0.25) * Math.PI * 2;
    drawBody(sunAngle, art.sun);
    drawBody(sunAngle + Math.PI, art.moon);

    // Parallax layers, drawn at art resolution into the offscreen canvas, tinted, blitted.
    const ow = Math.ceil(W / a) + 1;
    const oh = Math.ceil(H / a) + 1;
    const [off, stack] = this.getOff(ow, oh);
    if (!off || !stack) return;
    const o = off.ctx;
    stack.ctx.clearRect(0, 0, ow, oh);
    const centreCol = Math.max(0, Math.min(state.world.width - 1, Math.floor(screenToWorld(view, W / 2 / view.dpr, 0).x)));
    const surfaceScreenY = worldToScreenY(view, state.world.surfaceY[centreCol] ?? 0);
    /** Baseline (art px) follows the world surface on screen, damped for far layers. */
    const baseline = (factor: number, lift: number): number => Math.round((H / 2 + (surfaceScreenY - H / 2) * (0.5 + factor) - lift * H * 0.5) / a);
    const offset = (factor: number): number => Math.round((camX * view.scale * factor) / a);
    /** Linear interpolation of per-sample weights at art column x. */
    const sample = (arr: Float32Array, x: number): number => {
      const f = Math.max(0, Math.min(arr.length - 1, ((x * a) / W) * arr.length - 0.5));
      const i = Math.floor(f);
      const v0 = arr[i] ?? 0;
      const v1 = arr[Math.min(arr.length - 1, i + 1)] ?? v0;
      return v0 + (v1 - v0) * (f - i);
    };
    const finish = (fog: number): void => {
      o.globalCompositeOperation = 'source-atop';
      o.fillStyle = css(c.horizon, fog);
      o.fillRect(0, 0, ow, oh);
      o.fillStyle = css(c.haze, SKY.biomeTint);
      o.fillRect(0, 0, ow, oh);
      const night = (1 - light) * SKY.nightDarken;
      if (night > 0.001) {
        o.fillStyle = css(SKY.nightTop, night);
        o.fillRect(0, 0, ow, oh);
      }
      o.globalCompositeOperation = 'source-over';
      stack.ctx.drawImage(off.canvas, 0, 0);
    };

    // Mountains: repeating strip.
    {
      const m = SKY.mountains;
      o.clearRect(0, 0, ow, oh);
      const base = baseline(m.factor, m.lift);
      const strip = art.mountains;
      const ox = offset(m.factor);
      const start = -(((ox % m.period) + m.period) % m.period);
      for (let x = start; x < ow; x += m.period) o.drawImage(strip, x, base - strip.height + 1);
      o.fillStyle = css(m.color);
      o.fillRect(0, base + 1, ow, oh);
      finish(m.fog);
    }

    // Tree / skyline layers.
    const cellSlots = SKY.buildingSlots[1];
    SKY.treeLayers.forEach((layer, li) => {
      o.clearRect(0, 0, ow, oh);
      const sprites = art.trees[li] ?? [];
      const dens = bl.density[li];
      if (!dens) return;
      const base = baseline(layer.factor, layer.lift);
      const ox = offset(layer.factor);
      const maxW = Math.ceil(layer.height[1] * layer.width);
      const cell = layer.slot * cellSlots;
      const k0 = Math.floor((ox - maxW) / cell) * cellSlots;
      const k1 = Math.ceil((ox + ow + maxW) / layer.slot);
      const ground = (k: number): number => base + Math.round(noise1(SEED.slot + li, k * layer.slot, layer.hillWave) * layer.hill);
      const isUrban = (k: number): boolean => {
        const ci = Math.floor(k / cellSlots);
        return hash2(SEED.building + li, ci, 0) < sample(bl.urban, ci * cell + cell / 2 - ox);
      };
      // Ground band under the layer (stepped per slot).
      for (let k = k0; k <= k1; k++) {
        const x = k * layer.slot - ox;
        o.fillStyle = css(isUrban(k) ? layer.building : layer.color);
        o.fillRect(x, ground(k), layer.slot, oh);
      }
      // Buildings (one per urban cell) and trees (per slot, by biome density).
      for (let k = k0; k <= k1; k++) {
        const x = k * layer.slot - ox;
        if (isUrban(k)) {
          if (k % cellSlots !== 0) continue;
          const ci = k / cellSlots;
          const bw = Math.round(lerp(SKY.buildingSlots, hash2(SEED.building + li, ci, 1)) * layer.slot) - 1;
          const bh = Math.round(lerp(SKY.buildingHeight, hash2(SEED.building + li, ci, 2)) * layer.height[1]);
          const g = ground(k);
          o.fillStyle = css(layer.building);
          o.fillRect(x, g - bh, bw, bh + 1);
          o.fillStyle = css(layer.buildingLight);
          o.fillRect(x, g - bh, Math.max(1, Math.round(bw * 0.25)), bh + 1);
          if (hash2(SEED.building + li, ci, 3) < 0.4) {
            o.fillStyle = css(layer.building);
            o.fillRect(x + Math.round(bw * 0.6), g - bh - 4, 1, 4);
          }
          continue;
        }
        if (hash2(SEED.tree + li, k, 1) >= sample(dens, x + layer.slot / 2)) continue;
        const sprite = sprites[Math.floor(hash2(SEED.tree + li, k, 2) * sprites.length)];
        if (!sprite) continue;
        const cx = x + Math.floor(hash2(SEED.tree + li, k, 3) * layer.slot);
        const gy = ground(k) + Math.floor(hash2(SEED.tree + li, k, 4) * 3);
        o.drawImage(sprite, cx - (sprite.width >> 1), gy - sprite.height + 1);
      }
      finish(layer.fog);
    });

    ctx.drawImage(stack.canvas, 0, 0, ow, oh, 0, 0, ow * a, oh * a);
    ctx.imageSmoothingEnabled = smoothing;
  }
}
