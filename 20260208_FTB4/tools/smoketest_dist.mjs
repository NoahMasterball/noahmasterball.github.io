// Smoke test of the production build: serves dist/ with vite preview, waits
// for readiness, captures one screenshot, reports console errors + stats.
import { spawn, execSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4173;
const server = spawn(`npx vite preview --port ${PORT} --strictPort`, { cwd: root, shell: true, stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let exitCode = 0;
try {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/`);
      if (r.ok) break;
    } catch {
      /* not up */
    }
    await wait(300);
  }
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  const failed = [];
  page.on('requestfailed', (r) => failed.push(r.url()));
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__gameReady === true, null, { timeout: 120_000 });
  await page.screenshot({ path: join(root, 'docs', 'screenshots', 'dist_titlescreen.png') });
  await page.click('#start-btn');
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(root, 'docs', 'screenshots', 'dist_smoketest.png') });
  const stats = await page.evaluate(() => window.__stats?.() ?? null);
  console.log('STATS:', JSON.stringify(stats));
  console.log('FAILED REQUESTS:', failed.length ? failed.slice(0, 10) : 'none');
  console.log('CONSOLE ERRORS:', errors.length ? errors.slice(0, 10) : 'none');
  await browser.close();
  if (failed.length || errors.length) exitCode = 1;
} catch (err) {
  console.error('Smoke test failed:', err.message);
  exitCode = 1;
} finally {
  try {
    execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: 'ignore' });
  } catch {
    /* gone */
  }
}
process.exit(exitCode);
