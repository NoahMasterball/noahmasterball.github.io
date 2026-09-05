// Automated screenshot capture: starts the Vite dev server, opens the game in
// headless Chromium, waits for the explicit window.__gameReady signal, then
// captures 1920x1080 shots from the app's named camera positions (SSOT: the
// shot list lives in src/config.ts and is read back via window.__shotNames).
//
// Usage: npm run shots [-- --label somelabel]
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const shotsDir = join(root, 'docs', 'screenshots');
const PORT = 5173;
const URL = `http://127.0.0.1:${PORT}/`;
const SIZE = { width: 1920, height: 1080 };
// A solid-black 1920x1080 PNG compresses to ~5 KB — anything below this is
// treated as a broken capture, not a result. (Keep low: flat scenes compress well.)
const MIN_BYTES = 12_000;

const labelArg = process.argv.indexOf('--label');
const label = labelArg !== -1 ? `_${process.argv[labelArg + 1]}` : '';
// --scene <name> loads the app with ?scene=<name> (bake-off vignettes, test scene).
const sceneArg = process.argv.indexOf('--scene');
const sceneQuery = sceneArg !== -1 ? `?scene=${process.argv[sceneArg + 1]}` : '';

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
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // server not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Dev server did not respond at ${url} within ${timeoutMs}ms`);
}

function killTree(pid) {
  try {
    execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
  } catch {
    // already gone
  }
}

async function captureWith(launchOptions, iter) {
  const browser = await chromium.launch(launchOptions);
  try {
    const page = await browser.newPage({ viewport: SIZE, deviceScaleFactor: 1 });
    const errors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(String(err)));
    await page.goto(URL + sceneQuery, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__gameReady === true, null, { timeout: 120_000 });
    await page.waitForTimeout(700); // let the loading overlay fade out fully

    const names = await page.evaluate(() => window.__shotNames ?? []);
    if (!names.length) throw new Error('App exposed no shot names (window.__shotNames)');

    const results = [];
    for (const name of names) {
      const ok = await page.evaluate((n) => window.__setShot?.(n) ?? false, name);
      if (!ok) {
        console.warn(`  shot '${name}' rejected by app`);
        continue;
      }
      await page.waitForTimeout(150);
      const file = join(shotsDir, `iter${String(iter).padStart(2, '0')}_${name}${label}.png`);
      await page.screenshot({ path: file });
      const bytes = statSync(file).size;
      results.push({ name, file, bytes });
      console.log(`  ${name}: ${(bytes / 1024).toFixed(0)} KB -> ${file}`);
    }
    if (errors.length) {
      console.warn(`Console errors during capture (${errors.length}):`);
      for (const e of errors.slice(0, 10)) console.warn(`  ${e}`);
    }
    return results;
  } finally {
    await browser.close();
  }
}

const server = spawn(`npx vite --port ${PORT} --strictPort`, {
  cwd: root,
  shell: true,
  stdio: 'ignore',
});

let exitCode = 0;
try {
  await waitForServer(URL);
  const iter = nextIteration();
  console.log(`Capturing iteration ${iter}${label} ...`);

  // Headless WebGL on Windows sometimes needs explicit ANGLE flags; try in order.
  const attempts = [
    { headless: true },
    { headless: true, args: ['--use-angle=d3d11'] },
    { headless: true, args: ['--use-angle=gl'] },
    { headless: false },
  ];
  let results = null;
  let lastErr = null;
  for (const opts of attempts) {
    try {
      results = await captureWith(opts, iter);
      const broken = results.filter((r) => r.bytes < MIN_BYTES);
      if (results.length && broken.length === 0) break;
      lastErr = new Error(
        `Suspicious captures (likely blank): ${broken.map((b) => b.name).join(', ') || 'none captured'}`,
      );
      console.warn(`${lastErr.message} — retrying with ${JSON.stringify(opts)} successor`);
      results = null;
    } catch (err) {
      lastErr = err;
      console.warn(`Attempt ${JSON.stringify(opts)} failed: ${err.message}`);
    }
  }
  if (!results) throw lastErr ?? new Error('All capture attempts failed');
  console.log('Capture complete.');
} catch (err) {
  console.error(`Screenshot run failed: ${err.message}`);
  exitCode = 1;
} finally {
  killTree(server.pid);
}
process.exit(exitCode);
