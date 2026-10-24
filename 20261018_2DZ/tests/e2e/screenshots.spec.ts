import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { BIOME_IDS } from '../../src/data/schema.ts';
import { openGame, watchPage } from './support/page.ts';
import { biomeColumns, findCave, findSpot, sendControls, useSecondaryAt, waitTicks } from './support/qa.ts';

// Regenerates docs/screenshots/ through QA controls and real input only (no state writes).
// Opt-in, so `npm run check` does not rewrite the images:  ROTLAND_SHOTS=1 npx playwright test screenshots

const SHOTS_ENV = 'ROTLAND_SHOTS';
const SEED = 20261018;
const OUT = fileURLToPath(new URL('../../docs/screenshots/', import.meta.url));
/** Clock values (DAY_NIGHT: 0 = midnight, 0.5 = noon). */
const TIME = { day: 0.45, dusk: 0.76, night: 0.02 } as const;
/** Ticks to let the camera and lighting settle before a shot. */
const SETTLE = 90;
/** Columns left/right of the cave spot tried for the torch. */
const TORCH_OFFSETS = [4, -4, 5, -5, 3, -3] as const;

test.skip(!process.env[SHOTS_ENV], `set ${SHOTS_ENV}=1 to regenerate docs/screenshots`);

test('regenerate docs/screenshots', async ({ page }) => {
  const { errors } = watchPage(page);
  await openGame(page, `?seed=${SEED}`);
  const shot = async (name: string): Promise<void> => {
    await waitTicks(page, SETTLE);
    await page.screenshot({ path: `${OUT}${name}.png` });
  };
  const box = await page.locator('#game').boundingBox();
  if (!box) throw new Error('no canvas');
  // Cursor slightly right of the player: a little look-ahead, like normal play.
  await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.45);

  await sendControls(page, [{ type: 'qaSetTime', timeOfDay: TIME.day }]);
  await shot('surface-day');
  await sendControls(page, [{ type: 'qaSetTime', timeOfDay: TIME.dusk }]);
  await shot('surface-dusk');
  await sendControls(page, [{ type: 'qaSetTime', timeOfDay: TIME.night }]);
  await shot('surface-night');

  // Town / city: the first standing spot from the top in the middle of such a zone.
  const urban = await biomeColumns(page, [BIOME_IDS.indexOf('city'), BIOME_IDS.indexOf('town')]);
  expect(urban.length, 'world has a town or city').toBeGreaterThan(0);
  const street = await findSpot(page, 0, null, urban);
  await sendControls(page, [{ type: 'qaTeleport', x: street.x, y: street.y }, { type: 'qaSetTime', timeOfDay: TIME.day }]);
  await shot('town');

  // Cave at noon (sky light must not leak in), with a torch placed by the player (start kit).
  const cave = await findCave(page);
  await sendControls(page, [{ type: 'qaTeleport', x: cave.x, y: cave.y }], SETTLE);
  const torchSlot = await page.evaluate(() => window.__rotland?.state.player.inventory.slots.findIndex((s) => s?.item === 'torch') ?? -1);
  expect(torchSlot, 'start kit has torches').toBeGreaterThanOrEqual(0);
  await sendControls(page, [{ type: 'selectHotbar', slot: torchSlot }]);
  for (const dx of TORCH_OFFSETS) {
    const before = await page.evaluate(() => window.__rotland?.events('tilePlaced').length ?? 0);
    await useSecondaryAt(page, cave.col + dx, cave.floor - 1);
    const after = await page.evaluate(() => window.__rotland?.events('tilePlaced').length ?? 0);
    if (after > before) break;
  }
  await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.45);
  await shot('cave');

  await page.keyboard.press('e');
  await expect(page.locator('.inventory-screen')).toBeVisible();
  await shot('inventory');
  expect(errors, 'console errors').toEqual([]);
});
