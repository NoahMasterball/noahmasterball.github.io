# ADR-0008 — Content as typed TS modules; tools run via Node type stripping

*Status: accepted · 2026-09-27*

## Context
Operators, weapons, abilities, hitboxes, budget weights and levels must have exactly one source
(SSOT) and be readable by the game (browser), the tests (Vitest/Node) and the balance tool
(`npm run balance`, Node).

## Decision
- Content lives in typed TypeScript modules under `src/data/` with interfaces in
  `src/data/schema.ts` (compile-time checking of every field) plus `validateContent()` for
  value ranges and references (run-time checking).
- Node 24 runs the tools directly with built-in type stripping (`node tools/balance.ts`), so no
  extra runner (tsx/ts-node) is needed. This requires:
  - relative imports with explicit `.ts` extensions (`allowImportingTsExtensions`);
  - only erasable syntax — no `enum`, `namespace`, parameter properties
    (`erasableSyntaxOnly`);
  - `import type` for type-only imports (`verbatimModuleSyntax`).

## Consequences
- JSON would be friendlier for non-programmers but loses type checking and comments; an
  export-to-JSON step can be added if an external balance editor is ever needed.
- All code, not only data, follows the three tsconfig rules above.
