# ADR-0001 — Stack: Vite + TypeScript 6 (strict) + Three.js

*Status: accepted · 2026-09-27*

## Context
The brief fixes Vite + strict TypeScript + Three.js (latest stable), Vitest and Playwright,
and forbids other engines/frameworks. The sibling project FTB4 proved this pipeline on this
machine (Vite 8, Three 0.185, TypeScript 7, Playwright 1.62). Deployment is static GitHub
Pages from a sub-directory.

## Decision
- Three.js 0.186.1 (latest stable at start), Vite 8.3, Vitest 5, Playwright 1.62.1,
  ESLint 10 + typescript-eslint 8.
- **TypeScript 6.0.x, not 7.** typescript-eslint 8.70 supports TypeScript `< 6.1`; ESLint is
  needed to enforce the simulation boundary (ADR-0003). TypeScript is pinned with `~6.0.3`.
  Revisit when typescript-eslint supports TypeScript 7.
- **Playwright pinned to 1.62.1** so the Chromium build already installed for FTB4
  (`chromium-1234`) is reused; upgrading requires `npx playwright install chromium`.
- `vite.config.ts`: `base: './'` and relative asset paths.
- `tsconfig`: `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`,
  `erasableSyntaxOnly`, `allowImportingTsExtensions` (see ADR-0008).

## Consequences
- The production build runs from any sub-directory; verified by the e2e test that serves
  `dist/` under `/20260927_FPV/`.
- Upgrading TypeScript to 7 is a deliberate step gated on typescript-eslint support.
