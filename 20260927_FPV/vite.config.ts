import { defineConfig } from 'vite';
import { DEV_PORT, DIST_DIR, LOCAL_HOST } from './tools/lib/deploy.ts';

export default defineConfig({
  // Relative base: the build must run from any sub-directory of the GitHub Pages site.
  base: './',
  // Only the source page is an entry: the published build (PUBLISH_DIR) also has an
  // index.html, and the dependency scan must not crawl its bundled chunks.
  optimizeDeps: { entries: ['index.html'] },
  build: {
    outDir: DIST_DIR,
    target: 'es2022',
    rolldownOptions: {
      output: {
        // Engine libraries in their own long-cacheable chunks; game code stays small.
        codeSplitting: {
          groups: [
            { name: 'rapier', test: /[\\/]@dimforge[\\/]rapier3d-compat[\\/]/ },
            { name: 'three', test: /[\\/]node_modules[\\/]three[\\/]/ },
          ],
        },
      },
    },
    // Rapier's compat build inlines its WASM binary as base64 (ADR-0002), so its chunk is
    // ~4.3 MB and cannot be split. The limit sits just above that chunk so any *other*
    // oversized chunk still warns.
    chunkSizeWarningLimit: 4400,
  },
  server: {
    host: LOCAL_HOST,
    port: DEV_PORT,
    strictPort: true,
  },
});
