---
name: refactor-file
description: Write a refactor spec file from findings already in the conversation — packages them into docs/refactor_spec_NN.md with safe-refactor rules and agent batches
user_invocable: true
---

## Refactor Spec Writer

Takes findings **already identified in the current conversation** and packages them into a structured, executable spec file at `docs/refactor_spec_NN.md`.

**This skill does NOT scan or audit the codebase.** It only formats and writes.

**Input**: The findings from the conversation context (already discussed with the user).
**Output**: One `docs/refactor_spec_NN.md` file (NN = next free number).

---

### How to run

1. Determine the next free spec number: check `docs/` for existing `refactor_spec_*.md` files
2. Collect all findings from the current conversation that the user wants in the spec
3. For each finding, read the affected source files to get exact line numbers and code context
4. Group findings into batches (parallel where no file overlap, sequential otherwise)
5. Write the spec file using the template below
6. Add changelog entry

---

### Safe Refactor Rules (embedded verbatim in every spec)

1. Jede existierende Funktion muss nachher weiterhin existieren und funktionieren.
2. Keine unbeabsichtigte Änderung von UI, Optik, UX, Verhalten oder Datenfluss.
3. Nur interne Vereinheitlichung, keine fachliche Verhaltensänderung.
4. Payload-/Architektur-Umstellung darf keine sichtbare Regression erzeugen.
5. Wenn Unsicherheit besteht, bestehendes Verhalten 1:1 beibehalten.
6. Do NOT add comments like `// removed`, `// deprecated`, `_unused` vars, or lint suppressions.
7. Do NOT change any function's public API signature unless explicitly specified.
8. Do NOT touch files not listed in the agent's scope.

**For every change**: name what worked before, explain how it stays working, list risks, propose safeguards (before/after comparison, hook/event parity, payload parity, config save/load parity, UI parity).

**Guiding principle**: No new architecture for architecture's sake. Only refactor where identical flows can genuinely be unified without endangering existing behavior.

---

### Spec File Template

Every generated spec MUST follow this structure:

```markdown
# Refactor NN — [Theme Title]

**Date**: [YYYY-MM-DD]
**Status**: Ready for execution
**Scope**: Functionally neutral refactoring — no behavioral, UI, or data-flow changes
**Prerequisite**: [None | "Requires Refactor NN-1 to be completed first"]

---

## Hard Rules (NON-NEGOTIABLE)

1. Jede existierende Funktion muss nachher weiterhin existieren und funktionieren.
2. Keine unbeabsichtigte Änderung von UI, Optik, UX, Verhalten oder Datenfluss.
3. Nur interne Vereinheitlichung, keine fachliche Verhaltensänderung.
4. Payload-/Architektur-Umstellung darf keine sichtbare Regression erzeugen.
5. Wenn Unsicherheit besteht, bestehendes Verhalten 1:1 beibehalten.
6. Do NOT add comments like `// removed`, `// deprecated`, `_unused` vars, or lint suppressions.
7. Do NOT change any function's public API signature unless explicitly specified.
8. Do NOT touch files not listed in the agent's scope.

---

## Execution Plan

**N Batches, M Sub-Agents total.**

[ASCII diagram showing parallel/sequential structure]

---

## Batch N — [Title] (K Agents, Parallel/Sequential)

### Agent NA: [Task Title]

**File(s)**: [exact file paths]

**What to do**:
- Read [file] first
- [precise change instructions]

#### What was working before
[List each function/behavior this change touches]

#### How it stays working after
[For each item above, explain preservation]

#### Risks
- [specific risk]

#### Safeguards
- [ ] Before/after comparison: [what to compare]
- [ ] Hook/event parity: [which events to verify]
- [ ] Payload parity: [which payloads to check]
- [ ] Config save/load parity: [which configs to verify]
- [ ] UI parity: [which UI elements to check]

#### Exact Changes
- Approximate location: [~line range]
- Imports to add/change: [if any]
- BEFORE:
\```[language]
...
\```
- AFTER:
\```[language]
...
\```

#### Verification
- [ ] Typecheck / lint
- [ ] Behavior parity verified
- [ ] No UI drift
- [ ] No payload regression
- [ ] No config regression

---

## Verification Checklist (Post-Execution)

### 1. Compilation
`cargo check` + `npm run build` must pass.

### 2. Behavioral Parity
[Table: Check | How to verify]

### 3. Smoke Test (Manual)
[Numbered list of manual verification steps]

---

## Files Touched (Complete List)

[Table: Agent | Files | Lines Changed (Est.)]

---

## What This Spec Does NOT Cover (Intentionally)

[Items excluded with rationale]
```

---

### Content Rules

1. **Read before writing**: Every agent instruction MUST start with "Read [file] first".
2. **Exact code**: Include BEFORE/AFTER code blocks. No "refactor as appropriate".
3. **Line references**: Approximate line numbers with `~` prefix.
4. **Import awareness**: Specify new imports explicitly.
5. **Fallback preservation**: State current fallback, verify new code produces same result.
6. **No scope creep**: Each agent lists ONLY its files. "Do NOT touch files not listed" is mandatory.
7. **Max 5 agents per spec file** for orchestrator manageability.
8. **Zero file overlap** between parallel agents in the same batch.

---

### Rules

- Do NOT scan or audit the codebase — only use findings already in the conversation
- Do NOT modify source code — only produce the spec file
- Read the affected source files to get accurate line numbers and code context for the spec
- Add changelog entry: `- **[YYYY-MM-DD]** Docs -- Generated refactoring spec: [theme]`
