import { defineConfig } from 'vite';
import { DEV_PORT, DIST_DIR, LOCAL_HOST } from './tools/lib/deploy.ts';

export default defineConfig({
  // Relative base: the build must run from any sub-directory of the GitHub Pages site.
  base: './',
  // Only the source page is an entry: the published build (PUBLISH_DIR) also has an index.html.
  optimizeDeps: { entries: ['index.html'] },
  build: { outDir: DIST_DIR, target: 'es2022' },
  server: { host: LOCAL_HOST, port: DEV_PORT, strictPort: true },
});
