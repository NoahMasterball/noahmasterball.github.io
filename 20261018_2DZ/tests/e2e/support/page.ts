import { expect, type Page } from '@playwright/test';
import { SUB_PATH } from '../../../tools/lib/deploy.ts';

// NEW — page helpers for the e2e specs (pattern of 20260927_FPV/tests/e2e/support/page.ts):
// console and network watching, opening the game from the published sub-directory.

/** Collects a page's console errors and failed requests. */
export function watchPage(page: Page): { errors: string[]; failed: string[] } {
  const errors: string[] = [];
  const failed: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('requestfailed', (r) => failed.push(r.url()));
  page.on('response', (r) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
  });
  return { errors, failed };
}

/** Opens the game with a URL query (`search`, '' = default seed) and waits until it is ready. */
export async function openGame(page: Page, search: string): Promise<void> {
  await page.goto(`./${search}`);
  expect(new URL(page.url()).pathname).toBe(SUB_PATH); // served from the published sub-path
  await page.waitForFunction(() => window.__gameReady === true, null, { timeout: 120_000 });
}
