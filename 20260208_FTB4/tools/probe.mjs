// Quick runtime probe of the world scene (rig/camera positions over time).
import { spawn, execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const server = spawn('npx vite --port 5173 --strictPort', { cwd: root, shell: true, stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch('http://127.0.0.1:5173/');
      if (r.ok) break;
    } catch {
      /* not up */
    }
    await wait(300);
  }
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 300)));
  await page.goto('http://127.0.0.1:5173/?scene=world', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__gameReady === true, null, { timeout: 120_000 });
  for (const t of [0, 1000, 3000]) {
    await wait(t);
    const d = await page.evaluate(() => window.__debug?.());
    console.log('t+', t, JSON.stringify(d));
  }
  const gl = await page.evaluate(() => {
    const c = document.createElement('canvas');
    const g = c.getContext('webgl2');
    const ext = g?.getExtension('WEBGL_debug_renderer_info');
    return ext && g ? g.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
  });
  console.log('GPU:', gl);
  await browser.close();
} finally {
  try {
    execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: 'ignore' });
  } catch {
    /* gone */
  }
}
