// NEW — tile layer: one offscreen canvas per WORLD.chunkSize chunk (fg + walls, no liquid),
// rebuilt only when its content changed. A chunk's revision key is the sum of the 3×3
// neighbourhood's chunkRev (revs only grow, so the sum changes iff any did — edges depend on
// neighbours); on a change a cheap content hash of fg/wall (+1-cell ring) decides whether the
// texture really needs repainting (liquid flow bumps chunkRev but leaves the texture unchanged).
import { RENDER } from '../../config/client.ts';
import { WORLD } from '../../config/sim.ts';
import type { WorldGrid } from '../../sim/state.ts';
import { visibleTiles, worldToScreenX, worldToScreenY, type View } from '../camera.ts';
import { paintCell } from './tileart.ts';

const CS = WORLD.chunkSize;
const T = RENDER.tileTexels;
const PX = CS * T;

interface ChunkTex {
  canvas: HTMLCanvasElement;
  revKey: number;
  hash: number;
  lastUsed: number;
}

export class ChunkLayer {
  private cache = new Map<number, ChunkTex>();
  private frame = 0;
  /** Chunk textures (re)built in the last frame (debug overlay). */
  builtLastFrame = 0;
  private world: WorldGrid | null = null;
  private seed = 0;

  get cachedCount(): number {
    return this.cache.size;
  }

  private revKey(w: WorldGrid, cx: number, cy: number): number {
    let sum = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= w.chunksX || y >= w.chunksY) continue;
        sum += w.chunkRev[y * w.chunksX + x] ?? 0;
      }
    }
    return sum;
  }

  private contentHash(w: WorldGrid, cx: number, cy: number): number {
    let h = 0x811c9dc5;
    const x0 = Math.max(0, cx * CS - 1);
    const y0 = Math.max(0, cy * CS - 1);
    const x1 = Math.min(w.width, cx * CS + CS + 1);
    const y1 = Math.min(w.height, cy * CS + CS + 1);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * w.width + x;
        h = Math.imul(h ^ ((w.fg[i] ?? 0) | ((w.wall[i] ?? 0) << 16)), 0x01000193);
      }
    }
    return h >>> 0;
  }

  private build(w: WorldGrid, cx: number, cy: number, tex: ChunkTex): void {
    const ctx = tex.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    const img = ctx.createImageData(PX, PX);
    const buf = new Uint32Array(img.data.buffer);
    const xEnd = Math.min(CS, w.width - cx * CS);
    const yEnd = Math.min(CS, w.height - cy * CS);
    for (let ty = 0; ty < yEnd; ty++) {
      for (let tx = 0; tx < xEnd; tx++) paintCell(w, cx * CS + tx, cy * CS + ty, buf, PX, tx * T, ty * T, this.seed);
    }
    ctx.putImageData(img, 0, 0);
  }

  draw(ctx: CanvasRenderingContext2D, view: View, world: WorldGrid, seed: number): void {
    if (this.world !== world || this.seed !== seed) {
      this.cache.clear();
      this.world = world;
      this.seed = seed;
    }
    this.frame += 1;
    let budget = RENDER.maxChunkBuildsPerFrame;
    this.builtLastFrame = 0;
    const vis = visibleTiles(view);
    const cx0 = Math.max(0, Math.floor(vis.x0 / CS));
    const cy0 = Math.max(0, Math.floor(vis.y0 / CS));
    const cx1 = Math.min(world.chunksX - 1, Math.floor((vis.x1 - 1) / CS));
    const cy1 = Math.min(world.chunksY - 1, Math.floor((vis.y1 - 1) / CS));
    ctx.imageSmoothingEnabled = false;
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const key = cy * world.chunksX + cx;
        const revKey = this.revKey(world, cx, cy);
        let tex = this.cache.get(key);
        if (!tex || tex.revKey !== revKey) {
          const hash = this.contentHash(world, cx, cy);
          if (!tex) {
            if (budget <= 0) continue;
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = PX;
            tex = { canvas, revKey, hash, lastUsed: 0 };
            this.build(world, cx, cy, tex);
            this.cache.set(key, tex);
            budget -= 1;
            this.builtLastFrame += 1;
          } else if (tex.hash !== hash) {
            // Over budget: keep showing the stale texture and retry next frame.
            if (budget > 0) {
              this.build(world, cx, cy, tex);
              tex.hash = hash;
              tex.revKey = revKey;
              budget -= 1;
              this.builtLastFrame += 1;
            }
          } else tex.revKey = revKey;
        }
        tex.lastUsed = this.frame;
        // Rounded both ends so neighbouring chunks meet without seams at fractional scales.
        const sx = Math.round(worldToScreenX(view, cx * CS));
        const sy = Math.round(worldToScreenY(view, cy * CS));
        const ex = Math.round(worldToScreenX(view, (cx + 1) * CS));
        const ey = Math.round(worldToScreenY(view, (cy + 1) * CS));
        ctx.drawImage(tex.canvas, sx, sy, ex - sx, ey - sy);
      }
    }
    this.evict();
  }

  private evict(): void {
    if (this.cache.size <= RENDER.maxCachedChunks) return;
    const byAge = [...this.cache.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    for (const [key] of byAge.slice(0, this.cache.size - RENDER.maxCachedChunks)) this.cache.delete(key);
  }
}
