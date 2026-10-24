import type { Page } from '@playwright/test';
import { PLAYER, WORLD } from '../../../src/config/sim.ts';
import type { ControlMessage } from '../../../src/sim/commands.ts';

// NEW — e2e helpers that drive the game only through window.__rotland (src/client/qa.ts): QA
// controls are queued into the next PlayerCommand, never written into the state directly.

/** Body cells the player occupies (whole tiles), for free-space searches. */
const BODY_COLS = Math.ceil(PLAYER.width);
const BODY_ROWS = Math.ceil(PLAYER.height);

/** Queues controls and waits until the sim has applied them (and rendered a few frames). */
export async function sendControls(page: Page, controls: ControlMessage[], settleTicks = 5): Promise<void> {
  await page.evaluate(
    async ({ controls, settleTicks }) => {
      const qa = window.__rotland;
      if (!qa) throw new Error('window.__rotland missing');
      for (const c of controls) qa.send(c);
      await qa.waitTicks(settleTicks);
    },
    { controls, settleTicks },
  );
}

export async function waitTicks(page: Page, n: number): Promise<void> {
  await page.evaluate((n) => window.__rotland?.waitTicks(n), n);
}

/** Distinct colours over a coarse 16×16 sample grid of the canvas (blank canvas → 1). */
export async function canvasColours(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.getElementById('game');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('no canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    const seen = new Set<number>();
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const d = ctx.getImageData(Math.floor(((x + 0.5) / 16) * canvas.width), Math.floor(((y + 0.5) / 16) * canvas.height), 1, 1).data;
        seen.add(((d[0] ?? 0) << 16) | ((d[1] ?? 0) << 8) | (d[2] ?? 0));
      }
    }
    return seen.size;
  });
}

export interface Spot {
  /** Player body top-left to teleport to. */
  x: number;
  y: number;
  /** The free cell block's left column and floor row (the solid row under it). */
  col: number;
  floor: number;
}

/**
 * Finds a dry free block of body size standing on a solid floor, searching columns outward from
 * `fromX`; rows from `minDepth` below the generated surface (cave) — or, with `minDepth` null,
 * the first standing spot from the top of each column (the surface, roofs included).
 */
export async function findSpot(page: Page, fromX: number, minDepth: number | null, columns?: readonly number[]): Promise<Spot> {
  const spot = await page.evaluate(
    ({ fromX, minDepth, cols, rows, pw, ph, columns }) => {
      const qa = window.__rotland;
      if (!qa) throw new Error('window.__rotland missing');
      const w = qa.state.world;
      const air = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w.width && y < w.height && w.fg[y * w.width + x] === 0 && w.liquid[y * w.width + x] === 0;
      const free = (x: number, y: number): boolean => {
        for (let dy = 0; dy < rows; dy++) for (let dx = 0; dx < cols; dx++) if (!air(x + dx, y + dy)) return false;
        return true;
      };
      const solidBelow = (x: number, y: number): boolean => {
        for (let dx = 0; dx < cols; dx++) if (air(x + dx, y + rows) || y + rows >= w.height) return false;
        return true;
      };
      const order: number[] = columns ? [...columns] : [];
      if (!columns) for (let r = 0; r < w.width; r++) order.push(fromX + r, fromX - r);
      for (const x of order) {
        if (x < 1 || x + cols >= w.width - 1) continue;
        const y0 = minDepth === null ? 0 : (w.surfaceY[x] ?? 0) + minDepth;
        for (let y = y0; y < w.height - rows - 1; y++) {
          if (free(x, y) && solidBelow(x, y)) return { x: x + (cols - pw) / 2, y: y + rows - ph - 0.01, col: x, floor: y + rows };
          // Surface mode: only the first standing spot of a column counts.
          if (minDepth === null && !air(x, y)) break;
        }
      }
      return null;
    },
    { fromX, minDepth, cols: BODY_COLS, rows: BODY_ROWS, pw: PLAYER.width, ph: PLAYER.height, columns: columns ? [...columns] : null },
  );
  if (!spot) throw new Error('findSpot: no free spot found');
  return spot;
}

/** A cave spot: free space at least WORLD.cavesDepth below the generated surface. */
export async function findCave(page: Page): Promise<Spot> {
  const px = await page.evaluate(() => Math.floor(window.__rotland?.state.player.body.x ?? 0));
  return findSpot(page, px, WORLD.cavesDepth);
}

/** Columns whose surface biome is one of `biomeIndices` (world.biome), centre of the first zone first. */
export async function biomeColumns(page: Page, biomeIndices: readonly number[]): Promise<number[]> {
  return page.evaluate((ids) => {
    const w = window.__rotland?.state.world;
    if (!w) throw new Error('window.__rotland missing');
    const cols: number[] = [];
    for (let x = 0; x < w.width; x++) if (ids.includes(w.biome[x] ?? -1)) cols.push(x);
    // Start in the middle of the first zone, so the shot shows the biome and not its border.
    let end = 0;
    while (end + 1 < cols.length && cols[end + 1] === (cols[end] ?? 0) + 1) end++;
    const mid = Math.floor(end / 2);
    return [...cols.slice(mid), ...cols.slice(0, mid)];
  }, [...biomeIndices]);
}

/** Holds the secondary button on world cell (x, y) for a few ticks (place / open). */
export async function useSecondaryAt(page: Page, x: number, y: number): Promise<void> {
  const box = await page.locator('#game').boundingBox();
  if (!box) throw new Error('no canvas box');
  // The camera looks ahead toward the cursor, so aim twice: the second aim uses the settled view.
  for (let pass = 0; pass < 2; pass++) {
    const css = await page.evaluate(([x, y]) => window.__rotland?.worldToCss(x, y), [x + 0.5, y + 0.5] as const);
    if (!css) throw new Error('window.__rotland missing');
    await page.mouse.move(box.x + css.x, box.y + css.y);
    await waitTicks(page, 40);
  }
  await page.mouse.down({ button: 'right' });
  await waitTicks(page, 3);
  await page.mouse.up({ button: 'right' });
  await waitTicks(page, 2);
}
