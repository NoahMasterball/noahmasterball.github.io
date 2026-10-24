import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { DIST_DIR_NAME, PUBLISH_DIR_NAME } from './tools/lib/deploy.ts';

// ── Simulation boundary (ADR-0003) ──────────────────────────────────────────
// Everything that must run unchanged in Node (tests today, authoritative server later) may not
// import Three.js or client code, touch browser globals, read wall-clock time or use
// Math.random. The block below is the mechanical enforcement of that rule.
const BOUNDARY_FILES = [
  'src/sim/**/*.ts',
  'src/ai/**/*.ts',
  'src/data/**/*.ts',
  'src/balance/**/*.ts',
  'src/config/sim.ts',
];

const RENDER_IMPORTS = [
  { group: ['three', 'three/*'], message: 'Simulation-side code must not import Three.js (ADR-0003).' },
  { group: ['**/client/**', '**/client'], message: 'Simulation-side code must not import client code (ADR-0003).' },
  { group: ['**/config/client*'], message: 'Use src/config/sim.ts; client config is render-side (ADR-0003).' },
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
].map((name) => ({ name, message: `'${name}' is not available to simulation-side code (ADR-0003).` }));

export default defineConfig(
  { ignores: [`${DIST_DIR_NAME}/`, `${PUBLISH_DIR_NAME}/`, 'node_modules/', 'test-results/', 'playwright-report/'] },
  js.configs.recommended,
  tseslint.configs.strict,
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
  {
    // The simulation core additionally must not depend on bots or design tooling.
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...RENDER_IMPORTS,
            { group: ['**/ai/**', '**/balance/**'], message: 'src/sim must not depend on ai/ or balance/.' },
          ],
        },
      ],
    },
  },
);
