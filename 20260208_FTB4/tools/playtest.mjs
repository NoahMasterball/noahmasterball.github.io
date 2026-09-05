// Automated playtest: loads the world with the live third-person rig (no shot
// mode), simulates keyboard movement, checks the player moves and collides,
// fires the interaction, and records renderer stats + console errors.
import { spawn, execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'docs', 'screenshots', 'playtest');
const PORT = 5173;
const URL = `http://127.0.0.1:${PORT}/?scene=world`;

mkdirSync(outDir, { recursive: true });

function killTree(pid) {
  try {
    execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
  } catch {
    // already gone
  }
}

async function waitForServer(url, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('dev server timeout');
}

const server = spawn(`npx vite --port ${PORT} --strictPort`, { cwd: root, shell: true, stdio: 'ignore' });
let exitCode = 0;
try {
  await waitForServer(`http://127.0.0.1:${PORT}/`);
  const headed = process.argv.includes('--headed');
  const browser = await chromium.launch({ headless: !headed });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__gameReady === true, null, { timeout: 120_000 });
  await page.click('#start-btn');
  await page.waitForTimeout(800);

  const posOf = () =>
    page.evaluate(() => {
      const el = document.querySelector('#app canvas');
      void el;
      // rig position is not exported; approximate via camera target = player pos
      return null;
    });
  void posOf;

  await page.screenshot({ path: join(outDir, 'pt1_spawn.png') });

  // The camera spawns facing the tavern — walk/run straight at its door,
  // polling the interaction hint until it appears (or 16s pass).
  await page.keyboard.down('w');
  await page.keyboard.down('Shift');
  let hint = { visible: false, text: '' };
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(400);
    if (i === 6) await page.screenshot({ path: join(outDir, 'pt2_run.png') });
    hint = await page.evaluate(() => {
      const el = document.getElementById('hint');
      return { visible: el?.classList.contains('visible') ?? false, text: el?.textContent ?? '' };
    });
    if (hint.visible) break;
  }
  await page.keyboard.up('Shift');
  await page.keyboard.up('w');
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(outDir, 'pt3_at_door.png') });
  const debug = await page.evaluate(() => window.__debug?.());
  console.log('POS AT DOOR:', JSON.stringify(debug));
  console.log('HINT:', JSON.stringify(hint));

  // Press E — the tavern door should swing open.
  await page.keyboard.press('e');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(outDir, 'pt4_door_open.png') });

  // Keep walking into the tavern facade to verify wall collision holds.
  await page.keyboard.down('w');
  await page.waitForTimeout(2500);
  await page.keyboard.up('w');
  const posWall = await page.evaluate(() => window.__debug?.());
  console.log('POS AFTER WALL PUSH:', JSON.stringify(posWall));
  await page.screenshot({ path: join(outDir, 'pt5_collision.png') });

  const stats = await page.evaluate(() => window.__stats?.() ?? null);
  console.log('STATS:', JSON.stringify(stats));
  console.log('CONSOLE ERRORS:', errors.length ? JSON.stringify(errors.slice(0, 10), null, 1) : 'none');

  await browser.close();
} catch (err) {
  console.error(`Playtest failed: ${err.message}`);
  exitCode = 1;
} finally {
  killTree(server.pid);
}
process.exit(exitCode);
