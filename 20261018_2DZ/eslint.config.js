import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { DIST_DIR_NAME, PUBLISH_DIR_NAME } from './tools/lib/deploy.ts';

// ── Simulation boundary (ARCHITECTURE.md §2) ─────────────────────────────────
// Everything that must run unchanged in Node (tests, worldgen tools) may not import client
// code, touch browser globals, read wall-clock time or use Math.random.
const BOUNDARY_FILES = [
  'src/sim/**/*.ts',
  'src/data/**/*.ts',
  'src/config/sim.ts',
];

const RENDER_IMPORTS = [
  { group: ['**/client/**', '**/client'], message: 'Simulation-side code must not import client code (ARCHITECTURE.md §2).' },
  { group: ['**/config/client*'], message: 'Use src/config/sim.ts; client config is render-side (ARCHITECTURE.md §2).' },
];

const FORBIDDEN_GLOBALS = [
  'window',
  'document',
  'navigator',
  'localStorage',
  'sessionStorage',
  'performance',
  'requestAnimationFrame',
  'setTimeout',
  'setInterval',
  'Date',
].map((name) => ({ name, message: `'${name}' is not available to simulation-side code (ARCHITECTURE.md §2).` }));

export default defineConfig(
  { ignores: [`${DIST_DIR_NAME}/`, `${PUBLISH_DIR_NAME}/`, 'node_modules/', 'test-results/', 'playwright-report/'] },
  js.configs.recommended,
  tseslint.configs.strict,
  {
    // Leading underscore marks a parameter that is intentionally unused (fixed signatures).
    rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
  {
    files: ['src/client/**/*.ts', 'src/main.ts'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['tools/**/*.{ts,mjs}', 'tests/**/*.ts', '*.config.{ts,js}'],
    languageOptions: { globals: globals.node },
  },
  {
    // Playwright drivers: page.evaluate() callbacks run in the browser.
    files: ['tools/screenshot.mjs', 'tests/e2e/**/*.ts'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: BOUNDARY_FILES,
    rules: {
      'no-restricted-imports': ['error', { patterns: RENDER_IMPORTS }],
      'no-restricted-globals': ['error', ...FORBIDDEN_GLOBALS],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded RNG in src/sim/rng.ts (determinism).' },
      ],
    },
  },
);
