// Headed performance measurement on the real GPU: settled fps at 1080p,
// renderer stats, GPU string, and a resize sanity check.
import { spawn, execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4173;
const server = spawn(`npx vite preview --port ${PORT} --strictPort`, { cwd: root, shell: true, stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__gameReady === true, null, { timeout: 120_000 });
  await page.click('#start-btn');

  const gpu = await page.evaluate(() => {
    const g = document.createElement('canvas').getContext('webgl2');
    const ext = g?.getExtension('WEBGL_debug_renderer_info');
    return ext && g ? g.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
  });
  console.log('GPU:', gpu);

  await wait(10_000); // settle
  console.log('IDLE STATS:', JSON.stringify(await page.evaluate(() => window.__stats?.())));

  await page.keyboard.down('w');
  await page.keyboard.down('Shift');
  await wait(5_000);
  console.log('MOVING STATS:', JSON.stringify(await page.evaluate(() => window.__stats?.())));
  await page.keyboard.up('Shift');
  await page.keyboard.up('w');

  await page.setViewportSize({ width: 900, height: 1200 });
  await wait(1_500);
  const resized = await page.evaluate(() => {
    const c = document.querySelector('#app canvas');
    return { canvas: [c.width, c.height], stats: window.__stats?.() };
  });
  console.log('AFTER RESIZE 900x1200:', JSON.stringify(resized));

  await browser.close();
} finally {
  try {
    execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: 'ignore' });
  } catch {
    /* gone */
  }
}
