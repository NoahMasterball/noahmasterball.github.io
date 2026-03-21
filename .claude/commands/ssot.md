---
name: ssot
description: Quick SSoT compliance check + regression check — verifies SSoT adherence and checks for regressions in YOUR OWN changes
user_invocable: true
---

## Phase 1: SSoT Compliance Check

Answer the question: **Was SSoT adhered to in the changes I just made?**

**Scope: ONLY the code you just implemented in this session.** Do not audit unrelated files, pre-existing code, or the broader codebase. This is a self-check, not a codebase-wide review.

### What to check (only in your own changes)

1. **Constants**: Any new or changed constant — is it defined in the project's designated constants file and only there?
2. **UI strings**: Any user-visible string — does it use the project's i18n/localization mechanism instead of being hardcoded?
3. **Derived values sync**: If you changed a value that has derived copies in other files (per the project's SSoT table in CLAUDE.md) — did you sync all copies?
4. **Frontend hardcoding**: No hardcoded defaults, provider names, or option lists in frontend code — must come from backend or centralized config.
5. **New types/structs**: Any new backend type used in IPC — is it mirrored in the frontend type definitions?
6. **Layer violations**: Does each layer only import from allowed layers (per the project's layering rules in CLAUDE.md)?

### How to check

1. Read CLAUDE.md (SSoT tables + Derived Values table).
2. Review only the files and lines you touched in this session.
3. For each change, verify the rules above.

### SSoT Output

- **If compliant**: "SSoT OK" with a brief summary of what was checked.
- **If violations found**: List each violation with file, line, what's wrong, and where the value should live according to CLAUDE.md. Then fix the violations.

---

## Phase 2: Regression Check

After SSoT is done, answer: **Did my changes break any existing behavior?**

**Scope: Same as Phase 1 — only YOUR OWN changes from this session.** You already know which files and symbols you touched — review them from your conversation context. Do NOT use git commands.

### What to check

For every file you edited, function you changed, and symbol you renamed/removed in this session:

1. **Removed/renamed public API**: Did you delete or rename a public function, struct, field, or API method? If so — grep for ALL callers across the codebase.
2. **Changed function signatures**: Did you add/remove/reorder parameters on a function that's called from multiple places? Grep for all call sites.
3. **Changed serialization names**: Did you rename a field on a serialized struct? All IPC callers and frontend type definitions must match exactly.
4. **Changed event names/payloads**: Did you modify an event name constant or change the payload shape? Check that all listeners still match.
5. **Changed config/settings fields**: Did you rename/remove a settings field? Existing user config files will have the old name — is there a migration? Does the frontend still read the correct field?
6. **Changed enum variants**: Did you add/remove/rename a variant on an enum used in serialization? Check that frontend comparisons and constant mirrors are updated.
7. **Removed imports/exports**: Did you delete something from a module that other modules import? Check cross-language re-exports manually.
8. **Changed default values**: Did you change a default that would silently alter behavior for existing users?
9. **Broken chain of calls**: If you refactored a helper used in multiple execution paths — did you verify all paths still work?

### How to check

1. Review your own changes from the conversation context — you know exactly which files and symbols you touched.
2. For each deleted/renamed/changed symbol: **grep the codebase** for all usages.
3. For signature changes: verify every call site passes the right arguments.
4. For serialization changes: verify frontend types + all IPC calls match.

### Regression Output

- **If clean**: "No regressions found." with a brief summary of what was verified.
- **If regressions found**: List each issue with: what broke, where the callers are, and what needs fixing. Then fix them.

---

## Phase 3: Pattern Consistency Check

After Phase 2, answer: **Do my changes follow the established patterns from CLAUDE.md's "Pattern Consistency Rule" table?**

**Scope: Same as Phase 1+2 — only YOUR OWN changes from this session.**

### What to check (only in your own changes)

For each file you touched, check if it falls into one of the pattern categories listed in CLAUDE.md's "Pattern Consistency Rule" table. If it does, compare your implementation against the reference implementation listed there.

Common pattern categories to watch for:
1. **Window/overlay creation and display** — does it follow the established show/create sequence?
2. **Event listeners** — proper registration and cleanup?
3. **IPC error handling** — consistent error handling with existing patterns?
4. **Shared UI patterns** — using shared helpers instead of inline reimplementation?
5. **Backend command errors** — using the project's localized error mechanism?

### How to check

1. Read the "Pattern Consistency Rule" table in CLAUDE.md.
2. For each file you touched, identify which pattern category it falls into (if any).
3. Compare your implementation against the reference implementation listed in the table.

### Pattern Output

- **If consistent**: "Patterns OK" with which patterns were checked.
- **If drift found**: List each instance with file, line, which pattern was violated, what the reference implementation does, and what your code does differently. Then fix the drift.

---

## Final Summary

After all three phases, output a combined verdict:

```
SSoT: OK | N violations (fixed/remaining)
Regression: OK | N issues (fixed/remaining)
Patterns: OK | N drift instances (fixed/remaining)
```