# ADR-0010 — Balance/roster tables and README controls are generated

*Status: accepted · 2026-09-27*

## Context
The spec needs full stats for the example roster and the README needs the controls, but the
repo rule (SSOT) forbids copying numbers or key bindings into documents by hand.

## Decision
- `npm run docs:gen` (`tools/gen-docs.ts`) writes `docs/generated/ROSTER.md` (all operators,
  weapons, abilities), `docs/generated/BALANCE.md` (budget + TTK matrix) and the block between
  `<!-- GENERATED:controls -->` markers in `README.md` from `src/data/` and
  `src/config/client.ts`.
- `tests/unit/generated-docs.test.ts` fails when any generated file is stale.
- The in-game controls help is generated from the same key-binding config.

## Consequences
- Changing a number or a key binding requires `npm run docs:gen`; the test reminds you.
