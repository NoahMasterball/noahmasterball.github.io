import { expect, test } from '@playwright/test';
import { KEY_BINDINGS, MOUSE_HELP } from '../../src/config/client.ts';
import { PLAYER, WORLD } from '../../src/config/sim.ts';
import { openGame, watchPage } from './support/page.ts';
import { canvasColours, findCave, sendControls, waitTicks } from './support/qa.ts';

// Smoke test of the production build served from the GitHub-Pages-style sub-directory: it
// loads, the sim ticks, the canvas shows a picture, holding D walks the player right, E opens
// the inventory screen, F3 the debug overlay, Esc the pause menu — with no console errors and no
// failed requests. window.__rotland (read-only) is typed in src/client/qa.ts.

const SEED = 4242;
/** A rendered frame shows more distinct colours than this on the 16×16 sample grid. */
const MIN_COLOURS = 8;
/** Deep night (DAY_NIGHT: 0 = midnight). */
const MIDNIGHT = 0;

test('production build: loads from a sub-directory, renders, walks, inventory, debug, pause', async ({ page }) => {
  const { errors, failed } = watchPage(page);
  await openGame(page, `?seed=${SEED}`);

  const boot = await page.evaluate(async () => {
    const qa = window.__rotland;
    if (!qa) throw new Error('window.__rotland missing');
    const t0 = qa.tick;
    await qa.waitTicks(30);
    return { seed: qa.state.seed, t0, t1: qa.tick, width: qa.state.world.width };
  });
  expect(boot.seed).toBe(SEED);
  expect(boot.width).toBe(WORLD.width);
  expect(boot.t1).toBeGreaterThan(boot.t0);

  // Canvas is not blank: many distinct colours across a coarse sample grid.
  expect(await canvasColours(page), 'distinct colours on the canvas').toBeGreaterThan(MIN_COLOURS);

  // Holding D walks right.
  const x0 = await page.evaluate(() => window.__rotland?.state.player.body.x ?? Number.NaN);
  await page.keyboard.down('d');
  await page.evaluate(() => window.__rotland?.waitTicks(60));
  await page.keyboard.up('d');
  const x1 = await page.evaluate(() => window.__rotland?.state.player.body.x ?? Number.NaN);
  expect(x1 - x0, 'player moved right').toBeGreaterThan(1);

  // E opens the inventory screen with every player slot; Esc closes it.
  await page.keyboard.press('e');
  const inv = page.locator('.inventory-screen');
  await expect(inv).toBeVisible();
  await expect(inv.locator('.slot[data-where="player"]')).toHaveCount(PLAYER.inventorySlots);
  await expect(inv.locator('.craft-row').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(inv).toBeHidden();

  // F3 shows the debug overlay.
  await page.keyboard.press('F3');
  const dbg = page.locator('.debug-overlay');
  await expect(dbg).toBeVisible();
  await expect(dbg).toContainText(`seed     ${SEED}`);

  // Esc opens the pause menu with the controls generated from the binding table; the sim stops.
  await page.keyboard.press('Escape');
  await expect(page.locator('.pause-menu')).toBeVisible();
  await expect(page.locator('.controls-key')).toHaveCount(Object.keys(KEY_BINDINGS).length + MOUSE_HELP.length);
  const paused = await page.evaluate(async () => {
    const qa = window.__rotland;
    if (!qa) throw new Error('window.__rotland missing');
    const t = qa.tick;
    await new Promise((r) => setTimeout(r, 300));
    return { paused: qa.paused, advanced: qa.tick - t };
  });
  expect(paused).toEqual({ paused: true, advanced: 0 });
  await page.locator('.pause-menu .btn-primary').click();
  await expect(page.locator('.pause-menu')).toBeHidden();

  expect(failed, 'failed requests').toEqual([]);
  expect(errors, 'console errors').toEqual([]);
});

test('QA controls: night and a cave render without errors', async ({ page }) => {
  const { errors, failed } = watchPage(page);
  await openGame(page, `?seed=${SEED}`);

  await sendControls(page, [{ type: 'qaSetTime', timeOfDay: MIDNIGHT }], 30);
  const night = await page.evaluate(() => window.__rotland?.state.timeOfDay ?? Number.NaN);
  expect(night, 'clock set to midnight').toBeLessThan(0.05);
  expect(await canvasColours(page), 'night frame is not blank').toBeGreaterThan(MIN_COLOURS);

  const cave = await findCave(page);
  await sendControls(page, [{ type: 'qaTeleport', x: cave.x, y: cave.y }], 60);
  const body = await page.evaluate(() => window.__rotland?.state.player.body);
  expect(body?.x ?? Number.NaN, 'teleported into the cave').toBeCloseTo(cave.x, 0);
  expect(body?.y ?? Number.NaN).toBeGreaterThan(cave.y - 1);
  await waitTicks(page, 30);
  // Underground frames are mostly dark but still drawn (player, glow, tiles near the player).
  expect(await canvasColours(page), 'cave frame is not blank').toBeGreaterThan(1);

  expect(failed, 'failed requests').toEqual([]);
  expect(errors, 'console errors').toEqual([]);
});
