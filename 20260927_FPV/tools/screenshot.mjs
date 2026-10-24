// Automated screenshots (pattern from FTB4): starts the Vite dev server, opens the game in
// headless Chromium once per launch that has shots (mode, level and seed as URL parameters:
// launchSearch in src/client/launch.ts), waits for window.__gameReady, then captures 1920x1080
// shots in SHOTS order (SSOT: SHOTS and shotLaunch in src/config/client.ts; the app lists the
// loaded launch's shots in window.__shotNames). Match shots continue one match, so their order
// matters. Each shot is saved as iterNN_<name>.png and copied to latest_<name>.png.
//
// Usage: npm run shots [-- --label somelabel]
import { execSync, spawn } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { launchSearch } from '../src/client/launch.ts';
import { SHOTS, shotLaunch } from '../src/config/client.ts';
import { DEV_URL, PROJECT_ROOT } from './lib/deploy.ts';

const shotsDir = join(PROJECT_ROOT, 'docs', 'screenshots');
const SIZE = { width: 1920, height: 1080 };
// A blank 1920x1080 PNG compresses to a few KB; anything this small is a broken capture.
const MIN_BYTES = 20_000;
const READY_TIMEOUT_MS = 120_000;

const labelArg = process.argv.indexOf('--label');
const label = labelArg !== -1 ? `_${process.argv[labelArg + 1]}` : '';
mkdirSync(shotsDir, { recursive: true });

function nextIteration() {
  const nums = readdirSync(shotsDir)
    .map((f) => /^iter(\d+)_/.exec(f))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  return nums.length ? Math.max(...nums) + 1 : 1;
}

async function waitForServer(url, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet — keep polling until the timeout below
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Dev server did not respond at ${url} within ${timeoutMs} ms`);
}

/** Polls until the game reports ready. A console error before that is a failed boot (the entry
 *  point logs every boot error, e.g. an unknown level id) and is reported at once. */
async function waitForGame(page, errors) {
  const before = errors.length;
  const start = Date.now();
  while (Date.now() - start < READY_TIMEOUT_MS) {
    if (await page.evaluate(() => window.__gameReady === true)) return;
    if (errors.length > before) throw new Error(`Game failed to start:\n  ${errors.slice(before).join('\n  ')}`);
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Game did not become ready within ${READY_TIMEOUT_MS} ms`);
}

function killTree(pid) {
  try {
    execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
  } catch {
    // process already exited — nothing to clean up
  }
}

/** Shot names per launch (its URL query string), in SHOTS order. */
const shotsByLaunch = new Map();
for (const [name, shot] of Object.entries(SHOTS)) {
  const search = launchSearch(shotLaunch(shot));
  shotsByLaunch.set(search, [...(shotsByLaunch.get(search) ?? []), name]);
}

// Host, port and strictPort come from vite.config.ts (SSOT: tools/lib/deploy.ts).
const server = spawn('npx vite', { cwd: PROJECT_ROOT, shell: true, stdio: 'ignore' });
let exitCode = 0;
try {
  await waitForServer(DEV_URL);
  const iter = String(nextIteration()).padStart(2, '0');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: SIZE, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));

  for (const [search, expected] of shotsByLaunch) {
    const url = new URL(DEV_URL);
    url.search = search;
    console.log(`Launch ${search} (${url.href})`);
    await page.goto(url.href, { waitUntil: 'domcontentloaded' });
    await waitForGame(page, errors);
    await page.waitForTimeout(600); // loading overlay fade

    // The app lists the loaded launch's shots: a mismatch means a URL parameter was ignored.
    const names = await page.evaluate(() => window.__shotNames ?? []);
    if (names.join() !== expected.join()) {
      throw new Error(`Launch ${search}: the app lists shots [${names.join(', ')}], expected [${expected.join(', ')}]`);
    }
    for (const name of names) {
      const ok = await page.evaluate((n) => window.__setShot?.(n) ?? false, name);
      if (!ok) {
        console.warn(`  shot '${name}' rejected by the app, or its staging failed (see its ShotDef)`);
        exitCode = 1;
        continue;
      }
      const file = join(shotsDir, `iter${iter}_${name}${label}.png`);
      await page.screenshot({ path: file });
      const bytes = statSync(file).size;
      if (bytes < MIN_BYTES) {
        console.error(`  ${name}: only ${bytes} bytes — likely a blank capture`);
        exitCode = 1;
      }
      copyFileSync(file, join(shotsDir, `latest_${name}.png`));
      console.log(`  ${name}: ${(bytes / 1024).toFixed(0)} KB -> ${file}`);
    }
    const stats = await page.evaluate(() => window.__stats?.());
    console.log(`  STATS ${search} (headless software rendering):`, JSON.stringify(stats));
  }
  if (errors.length) {
    console.error(`Console errors (${errors.length}):\n  ${errors.slice(0, 10).join('\n  ')}`);
    exitCode = 1;
  }
  await browser.close();
} catch (err) {
  console.error(`Screenshot run failed: ${err.message}`);
  exitCode = 1;
} finally {
  killTree(server.pid);
}
process.exit(exitCode);
