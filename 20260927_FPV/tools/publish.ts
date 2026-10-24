// NEW — `npm run deploy` runs the full check (which builds dist/ and plays it in Playwright)
// and only then calls this tool, so the published folder only ever holds a verified, playable
// build. Commit and push the folder to update GitHub Pages.
//
// Usage: node tools/publish.ts
import { cpSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DIST_DIR, PAGES_URL, PUBLISH_DIR } from './lib/deploy.ts';

if (!existsSync(join(DIST_DIR, 'index.html'))) {
  throw new Error(`${DIST_DIR} holds no build — run \`npm run deploy\` (check + publish), not this tool alone`);
}
rmSync(PUBLISH_DIR, { recursive: true, force: true });
cpSync(DIST_DIR, PUBLISH_DIR, { recursive: true });
console.log(`Published ${DIST_DIR} → ${PUBLISH_DIR}`);
console.log(`Commit and push that folder; the game is then playable at ${PAGES_URL}`);
