import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// NEW — deployment facts shared by the static server, the Playwright config, the Vite config,
// ESLint, the publish tool and the screenshot tool. GitHub Pages serves the repository folder
// by folder, so the public sub-path and URL are derived, not typed twice.

export const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
/** Vite's build output (git-ignored; rewritten by every build and e2e run). */
export const DIST_DIR_NAME = 'dist';
export const DIST_DIR = resolve(PROJECT_ROOT, DIST_DIR_NAME);
/** The published copy of a verified build (`npm run deploy`), committed so GitHub Pages serves
 *  it. The project folder itself holds the Vite *source* `index.html`, which a browser cannot
 *  run, so the playable build lives one folder deeper. */
export const PUBLISH_DIR_NAME = 'play';
export const PUBLISH_DIR = resolve(PROJECT_ROOT, PUBLISH_DIR_NAME);
export const SUB_PATH = `/${basename(PROJECT_ROOT)}/${PUBLISH_DIR_NAME}/`;
/** The repository folder is named after its Pages host (`<user>.github.io`). */
export const PAGES_URL = `https://${basename(dirname(PROJECT_ROOT))}${SUB_PATH}`;
export const LOCAL_HOST = '127.0.0.1';
export const DEV_PORT = 5173;
export const DEV_URL = `http://${LOCAL_HOST}:${DEV_PORT}/`;
export const E2E_PORT = 4180;
export const E2E_URL = `http://${LOCAL_HOST}:${E2E_PORT}${SUB_PATH}`;
