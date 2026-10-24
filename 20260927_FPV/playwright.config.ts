import { defineConfig } from '@playwright/test';
import { E2E_URL } from './tools/lib/deploy.ts';

// Smoke tests run against the *production build* served from the GitHub-Pages-style
// sub-directory (npm run test:e2e builds first).
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: E2E_URL,
    viewport: { width: 1280, height: 720 },
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node tools/serve-dist.ts',
    url: E2E_URL,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
