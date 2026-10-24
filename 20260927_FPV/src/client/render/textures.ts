import { BoxGeometry, CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import { DEV_TEXTURE, SURFACE_STYLE } from '../../config/client.ts';
import type { Surface } from '../../data/schema.ts';
import { hexColor } from '../dom.ts';

// NEW — procedural greybox textures (no external assets): a 1 m grid with a bold line every
// tile, per surface class, plus text textures for range labels. Boxes get world-space UVs so
// one metre on screen is one metre on every surface.

function canvas2d(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return { canvas, ctx };
}

export function devTexture(surface: Surface, anisotropy: number): CanvasTexture {
  const style = SURFACE_STYLE[surface];
  const px = DEV_TEXTURE.pixels;
  const cells = DEV_TEXTURE.tileMeters;
  const cell = px / cells;
  const { canvas, ctx } = canvas2d(px, px);
  ctx.fillStyle = hexColor(style.base);
  ctx.fillRect(0, 0, px, px);

  if (surface === 'trim') {
    // Hazard stripes for edges and benches.
    ctx.fillStyle = hexColor(style.line);
    for (let i = -px; i < px * 2; i += cell) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + cell / 2, 0);
      ctx.lineTo(i + cell / 2 - px, px);
      ctx.lineTo(i - px, px);
      ctx.fill();
    }
  } else {
    // Subtle checker so motion and distance read even without lines in view.
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = hexColor(style.accent);
    for (let y = 0; y < cells; y++) for (let x = (y % 2); x < cells; x += 2) ctx.fillRect(x * cell, y * cell, cell, cell);
    ctx.globalAlpha = 1;
    ctx.fillStyle = hexColor(style.line);
    for (let i = 0; i < cells; i++) {
      ctx.fillRect(i * cell, 0, DEV_TEXTURE.lineWidthPx, px);
      ctx.fillRect(0, i * cell, px, DEV_TEXTURE.lineWidthPx);
    }
    ctx.fillStyle = hexColor(style.accent);
    ctx.fillRect(0, 0, DEV_TEXTURE.majorLineWidthPx, px);
    ctx.fillRect(0, 0, px, DEV_TEXTURE.majorLineWidthPx);
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.anisotropy = anisotropy;
  return texture;
}

export function textTexture(text: string, color: string, pixelsHigh = 128): CanvasTexture {
  const { canvas, ctx } = canvas2d(pixelsHigh * 2, pixelsHigh);
  ctx.font = `800 ${Math.round(pixelsHigh * 0.62)}px Segoe UI, system-ui, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, pixelsHigh, pixelsHigh / 2);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Box whose UVs are in tiles of DEV_TEXTURE.tileMeters (world-space texel density). */
export function worldUvBox(sx: number, sy: number, sz: number): BoxGeometry {
  const geometry = new BoxGeometry(sx, sy, sz);
  const uv = geometry.getAttribute('uv');
  const t = DEV_TEXTURE.tileMeters;
  // BoxGeometry face order: +x, −x, +y, −y, +z, −z; 4 vertices per face.
  const spans: [number, number][] = [
    [sz, sy],
    [sz, sy],
    [sx, sz],
    [sx, sz],
    [sx, sy],
    [sx, sy],
  ];
  spans.forEach(([su, sv], face) => {
    for (let v = 0; v < 4; v++) {
      const i = face * 4 + v;
      uv.setXY(i, (uv.getX(i) * su) / t, (uv.getY(i) * sv) / t);
    }
  });
  uv.needsUpdate = true;
  return geometry;
}
