---
name: arch-audit
description: Architecture audit with triage — discovers issues, decides direct-fix vs spec vs defer, then executes or generates spec files
user_invocable: true
---

## Architecture Audit → Verify → Triage → Execute

Full architecture audit with built-in verification and decision framework. Discovers candidate issues, **independently verifies each one**, triages verified findings into direct-fix / spec / defer / leave-alone, then executes.

**Three phases in one run:**
1. **Bounded Architecture Audit** — find candidate issues (max 10)
2. **Adversarial Verification** — challenge each finding, drop false positives
3. **Triage & Execution** — decide and act per verified finding

---

### Hard Rules (NON-NEGOTIABLE)

These apply to ALL direct implementations AND all generated specs:

1. Jede existierende Funktion muss nachher weiterhin existieren und funktionieren.
2. Keine unbeabsichtigte Änderung von UI, Optik, UX, Verhalten oder Datenfluss.
3. Nur interne Vereinheitlichung, keine fachliche Verhaltensänderung.
4. Payload-/Architektur-Umstellung darf keine sichtbare Regression erzeugen.
5. Wenn Unsicherheit besteht, bestehendes Verhalten 1:1 beibehalten.
6. Keine neuen Abstraktionen nur um der Abstraktion willen.
7. Keine Umsetzung von Findings mit schlechter Kosten/Nutzen-Relation.
8. Wenn ein Befund in Overengineering kippen würde, explizit nicht umsetzen.
9. Do NOT add comments like `// removed`, `// deprecated`, `_unused` vars, or lint suppressions.
10. Do NOT change any function's public API signature unless explicitly specified.

---

### Phase 1 — Bounded Architecture Audit (Discovery)

#### Task

Scan the codebase for **candidate** architecturally relevant inconsistencies, duplication, and SSoT violations.

This is **NOT an exhaustive completeness audit**. Stop once the important candidates are found.

**IMPORTANT**: Phase 1 produces CANDIDATES, not confirmed findings. Every candidate MUST pass Phase 1b verification before being reported as a finding.

#### What to look for

1. Duplicated core logic across files
2. Inconsistent implementations for functionally identical flows
3. Real SSoT violations (constants, defaults, types defined in multiple places)
4. Inconsistent config/override/persistence behavior
5. Unnecessary special paths where a shared mechanism would help
6. Architecture issues that concretely hurt maintainability or error risk

#### What NOT to look for

- Cosmetic style differences
- Mini-deviations without real impact
- Theoretically "cleaner" abstractions without clear benefit
- Unification for unification's sake

#### Focus areas

1. Similar Execute/Run/Apply/Transform/Save/Load flows
2. Duplicated mapping, parsing, merge, validation, or normalization logic
3. Global vs local vs per-item settings patterns
4. Defaults, overrides, effective values, persisted vs runtime values
5. Save/load/hydration/persistence patterns
6. Business logic in UI instead of services
7. Similar features with near-identical flow but different implementation
8. SSoT violations in defaults, types, validation, or merge rules

#### Hard limit

- **Maximum 10 candidates** — target 6-10 if real issues exist
- Do NOT inflate to 10 if only 3-5 are genuine
- Do NOT trim to 5 if 8 real high-leverage findings exist
- Stop searching once the important issues are identified

#### Per candidate, deliver

1. **Affected area**
2. **Current problem** (what appears wrong)
3. **Why architecturally relevant**
4. **Recommended fix or unification**
5. **Initial classification**: Must unify / Can improve later / Leave as-is

#### Discovery method

Launch 4 Explore agents in parallel:

**Agent A — Backend Patterns** (Explore, sonnet)
- Scope: backend source directory
- Search: duplicated logic blocks, inconsistent patterns (error handling, option resolution, hardcoded strings), SSoT violations, layer violations
- Grep patterns: hardcoded numerics, repeated struct field assignments, inconsistent error handling

**Agent B — Frontend Patterns** (Explore, sonnet)
- Scope: frontend source directory
- Search: business logic in components, duplicated UI patterns, inconsistent state management, hardcoded values
- Grep patterns: direct API calls bypassing hooks, silent `.catch(() => {})`, literal strings not using i18n

**Agent C — Cross-Layer Consistency** (Explore, sonnet)
- Scope: both backend and frontend source directories
- Search: backend-frontend type drift, constant drift, event name drift
- Compare: backend models vs frontend type definitions, backend constants vs frontend constants, event names across layers

**Agent D — Existing Context** (Explore, haiku)
- Scope: docs directory, project instructions (CLAUDE.md or equivalent)
- Build lists: ADDRESSED (already done), DEFERRED (explicitly postponed), FORBIDDEN (overengineering traps)

---

### Phase 1b — Adversarial Verification (MANDATORY)

**Every candidate from Phase 1 MUST be verified before proceeding to Phase 2.**

This phase exists because discovery agents see surface-level patterns ("A does X, B does Y") and report them as inconsistencies, without checking **whether the difference is intentional and correct**.

#### Verification method

For each candidate finding, launch a **verification agent** (Explore, sonnet) with this exact prompt pattern:

```
Research task (DO NOT edit files). You are a DEVIL'S ADVOCATE.
Your job is to try to DISPROVE the following finding:

FINDING: "[paste the candidate finding summary]"
CLAIMED PROBLEM: "[paste what the discovery agent said is wrong]"

Your task:
1. Read ALL the code the finding references
2. Actively try to find reasons WHY the current code is CORRECT:
   - Is the difference intentional due to different requirements?
   - Does the "inconsistent" path handle a case the other doesn't need to?
   - Is there a compensating mechanism (e.g., event-based refresh, backend-side handling)?
   - Does the surrounding context explain why it's done differently?
3. Check the FULL call chain — not just the immediate function, but what calls it and what it calls
4. Check if there's a comment, commit message, or project docs entry explaining the design choice

Deliver one of:
- CONFIRMED: The finding is real. [explain why the difference is NOT justified]
- DISPROVED: The finding is a false positive. [explain why the current code is correct]
- DOWNGRADED: The finding is technically real but lower impact than claimed. [explain]

You MUST pick one. No "partially confirmed" hedging.
```

#### Verification rules

- Launch verification agents in **parallel** (up to 5 at a time) for efficiency
- Each verification agent MUST read the actual code, not rely on the discovery agent's description
- A finding that is DISPROVED is dropped entirely — do NOT include it in Phase 2
- A finding that is DOWNGRADED gets its classification adjusted (e.g., "Must unify" → "Can improve later")
- A finding that is CONFIRMED proceeds unchanged
- **Report the verification results transparently** — show which findings were dropped and why

#### Typical false positive patterns to watch for

These are patterns that discovery agents frequently misidentify as bugs:

1. **"X bypasses the Y hook"** — Check if X has a separate backend command that handles the same concern differently (e.g., OS-level integration + event-based refresh instead of frontend hook)
2. **"A and B use different conditions for the same logic"** — Check if A and B operate on different data models where different conditions are semantically equivalent
3. **"Missing deduplication/validation"** — Check if the data flow makes duplicates impossible in practice (e.g., UI enforces uniqueness, or IDs are generated server-side)
4. **"Hardcoded value should use constant"** — Check if the value is used exactly once and has no derived copies
5. **"Business logic in component"** — Check if the "logic" is actually pure UI concern (display formatting, conditional rendering)

---

### Phase 2 — Triage & Execution Decision

**Phase 2 operates ONLY on CONFIRMED and DOWNGRADED findings from Phase 1b.**

#### Step 1 — Filter

Using Agent D results:
- Remove findings already ADDRESSED
- Remove findings matching FORBIDDEN list
- Flag DEFERRED items — include only if new evidence raises priority
- Remove trivial findings

#### Step 2 — Classify each finding into exactly one group

**A. Direct implementation** — only if:
- Clearly described
- Real leverage
- Functionally neutral
- Specifiable with exact files/changes/verification
- Low regression risk

**B. Generate refactor spec** — if:
- Too large for direct fix
- Multiple files/subsystems need coordinated changes
- Sequential + parallel batches make sense
- Explicit safeguards needed
- Higher side-effect risk

**C. Not yet actionable** — if:
- Benefit too small right now
- Specification would be too vague
- Needs follow-up audit first

**D. Leave as-is** — if:
- Poor cost/benefit ratio
- Would tip into overengineering

---

### Required Output Format

Deliver in exactly this order:

#### 1. Executive Summary
Short, hard overall verdict: architecture health, real high-leverage problems, recommended approach (direct vs spec).

#### 2. Verification Results
Table showing each Phase 1 candidate and its verification outcome:
| # | Candidate | Verdict | Reason |
|---|-----------|---------|--------|
Findings marked DISPROVED are struck through and NOT included in subsequent sections.

#### 3. Verified Findings (max 10)
Per finding: Title, Affected Area, Current Problem, Why Relevant, Recommendation, Classification.

#### 4. Prioritized List
Ranked list: Rank, Finding, Why Important, Why Now (or Why Later).

#### 5. Things NOT to Abstract Further
Only genuine points. No filler. If only 2-4 make sense, list 2-4.

#### 6. Triage Decision
Split confirmed findings into groups A/B/C/D (see above).

#### 7. Direct Implementation Proposals (Group A only)
Per item:
- Why direct implementation is safe enough
- Affected files
- Target change
- What worked before
- How it stays working
- Risks
- Safeguards (before/after, hook/event parity, payload parity, config parity, UI parity)
- Recommended order

#### 8. Refactor Spec Files (Group B only)
Generate spec files using the spec format from the `refactor-file` skill:
- Hard rules embedded
- Execution plan with batches + agents
- Per agent: files, instructions, before/after, risks, safeguards, verification
- Post-execution verification checklist
- "What this spec does NOT cover" section

#### 9. Clear Final Verdict
- What should be done NOW
- What is optional
- Where to consciously stop

#### 10. Interactive Next Step Block
```
If you say "OK: Direct" → execute Group A only.
If you say "OK: Specs" → generate Group B spec files only (no re-audit).
If you say "OK: Both" → start with Group A, then generate Group B specs.
```

---

### Anti-Pattern Rules

1. Do NOT keep searching after enough high-leverage findings are found.
2. Do NOT artificially trim to 5 when 6-10 real points exist.
3. Do NOT inflate to 10 when only 3-6 are genuine.
4. Do NOT simultaneously audit and invent unconfirmed changes.
5. Do NOT propose "improvements" that are actually behavioral changes.
6. Do NOT propose abstract large-scale rewrites without concrete safeguards.
7. If direct implementation isn't safely verifiable, MUST generate a spec instead.
8. If even a spec would be too vague, consciously exclude.
9. Concreteness over completeness.
10. High leverage over theoretical perfection.
11. **NEVER skip Phase 1b verification.** Every finding must be challenged before being reported.
12. **NEVER report a finding that was DISPROVED** — drop it silently from the final output sections (but show it in the Verification Results table).

---

### Rules

- Read CLAUDE.md first for architecture context, SSoT rules, and overengineering traps
- Read the "DO NOT Centralize" section (if present) — respect those boundaries
- Check docs directory for already-addressed issues before reporting
- Do NOT re-discover issues already handled in existing specs
- Spec files must be self-contained and follow the `refactor-file` spec format
- Update changelog after generating specs or implementing changes
- Prioritize low-risk, high-impact changes over ambitious refactors