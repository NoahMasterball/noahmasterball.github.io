---
name: bug-auto-finder
description: Autonomous loop-mode bug finder — same method as bug-finder but records confirmed bugs to findings.md instead of fixing them. Designed for /loop usage. Skips both disproved AND already-confirmed findings automatically.
user_invocable: true
---

## Autonomous Bug Finder (Loop Mode)

Same detection method as `bug-finder` (flow-divergence, adversarial verification), but optimized for **unattended loop operation**:

- **Does NOT fix bugs** — records confirmed findings to `findings.md`
- **Skips known findings** — reads both `disproved.md` and `findings.md` at startup, skips unchanged entries
- **Designed for `/loop`** — each run is idempotent, accumulates knowledge across runs

### AUTONOMOUS MODE (NON-NEGOTIABLE)

This skill runs **fully unattended**. The following rules override all other behavior:

1. **NEVER ask the user a question.** No clarifications, no confirmations, no "should I proceed?" — just proceed.
2. **NEVER wait for user input.** If something is ambiguous, make the conservative choice (skip, not report).
3. **If a tool call fails or is denied**, skip that step and continue with the rest. Do not retry, do not ask why.
4. **If you are unsure whether something is a bug**, mark it DISPROVED and move on. False negatives are acceptable; blocking the loop is not.
5. **All file writes** (findings.md, disproved.md) are essential outputs — proceed with writing them without confirmation.

---

### Core Principle: Top-Down Flow Analysis

The bug finder works by: **understand the intended flow first, then find where reality diverges, then VERIFY each divergence is actually a bug**.

A bug is a place where:
- **Two paths that should behave identically don't** (e.g., one entry point handles errors differently than another, one swallows, one shows)
- **A value flows through multiple stages and gets corrupted or lost** (e.g., setting resolved in backend, serialized to frontend, but frontend reads a different field name)
- **A contract is assumed but not enforced** (e.g., function assumes input is non-empty but caller can pass empty)
- **State is shared but not synchronized** (e.g., AtomicBool set in thread A, read in thread B with wrong ordering)
- **An event/callback fires at a time when the receiver isn't ready** (e.g., emit before listener registered, timer fires after window destroyed)

---

### What counts as a bug

- **Flow divergence**: Two code paths that should produce the same result but don't (different error handling, different defaults, different ordering)
- **Contract violation**: Function assumes precondition that caller doesn't guarantee
- **State corruption**: Value modified by one path while another path holds a stale copy
- **Silent data loss**: Error swallowed, field dropped during serialization, truncation without warning
- **Race conditions**: TOCTOU, lock ordering, async gaps where state changes between check and use
- **Type lies**: Serde shape differs from TS type, enum variant casing mismatch, Option fields that are actually required
- **Resource leaks**: Handles/timers/listeners not cleaned up on the relevant lifecycle boundary
- **Platform traps**: OS-specific issues (handle lifetime, clipboard races, Unicode path edge cases)
- **Boundary violations**: Off-by-one, integer overflow, empty input, zero-length, max-size edge cases
- **Dead paths that mask bugs**: Match arms that can never trigger but hide the fact that a case is unhandled

### What does NOT count as a bug

- Architecture inconsistency (that's arch-audit's job)
- SSoT violations without behavioral impact (that's ssot/ssot-review's job)
- Missing features
- Style or naming issues
- "Could be refactored" suggestions
- Theoretical improvements without a concrete trigger path
- Security issues without a concrete exploit path (that's security-review's job)

---

### Discovery Method — Three Phases

#### Phase 1: Flow Mapping (parallel agents)

Each agent maps the **actual execution flows** in a narrow, focused scope. The goal is NOT to scan for patterns — it's to build a mental model of "how does data X get from point A to point B, and what are ALL the paths it can take?"

Launch all agents in a single parallel batch (flow-mapping + 1 history pre-loader).

**Agent H — History Pre-Loader** (general-purpose)
- Read `.claude/skills/bug-auto-finder-disproved.md` AND `.claude/skills/bug-auto-finder-findings.md`
- For EACH entry in BOTH files: run `git log --since="<date>" -- <file1> <file2> ...` on all referenced files
- Return two lists (disproved + confirmed), each entry marked: `unchanged` (no commits since date) or `changed` (needs re-verification)
- Additionally, return a **known-files summary**: a flat list of all `file:line-range (function)` tuples from UNCHANGED entries (both disproved + confirmed). Format: one per line, e.g. `path/to/file.rs:37-49 (fn some_function) [disproved: reason summary]`. The function name is the innermost `fn`/`const`/`struct`/React component that contains the line range — used as a stable anchor when line numbers shift.
- This result is used in Phase 1b to skip unchanged candidates AND by discovery agents to avoid re-reporting known issues

**IMPORTANT — After Agent H completes but before evaluating Phase 1 candidates:**
Read Agent H's known-files summary. When evaluating candidates from discovery agents, **immediately discard** any candidate whose file(s) + line range overlap with an unchanged known-files entry. Do not even send these to Phase 1b verification — they are already known. Log them as "Skipped (known, code unchanged)" in the verification table.

**Adapt the following agent templates to your project's architecture. Create one agent per major subsystem or execution flow:**

**Agent A — Primary Execution Paths** (Explore, sonnet)
- Scope: command handlers, orchestrators, helpers
- Map all entry points end-to-end: trigger → validation → processing → output
- For each step: do all paths handle errors the same way? Do they apply the same transforms, validations, gates?
- Note every branch point where paths diverge

**Agent B — Settings & Configuration** (Explore, sonnet)
- Scope: settings/config files, resolver/helper functions, constants
- For each scoped setting, trace the fallback chain: per-item → per-scope → global → constant default
- Are there settings where one level is skipped or uses a different default?
- Check all resolver functions: do they all follow the same pattern?

**Agent C — Data Pipeline** (Explore, sonnet)
- Scope: core processing pipeline, transforms
- Trace data input through processing stages → normalize → transform → output
- Where can data be lost or corrupted between stages?
- Check retry logic, fallback behavior, edge case detection

**Agent D — Persistence & Catalog** (Explore, sonnet)
- Scope: data storage, catalog/repository files
- For each catalog/store: trace load → modify → save
- Can a concurrent modification lose data? Does a save failure leave in-memory state out of sync with disk?
- Check error recovery on parse failure: does it warn + continue or destructively overwrite?

**Agent E — UI/Overlay Lifecycle** (Explore, sonnet)
- Scope: window/overlay management code
- For each window/overlay type: trace create → show → update → hide → destroy
- Can an event arrive after destroy? Can show be called before create finishes?
- Check handle save/restore patterns — are they consistent?

**Agent F — Frontend State & Events** (Explore, sonnet)
- Scope: frontend state management, event listeners, API client
- Map state refresh: what gets refreshed, in what order? Can a component render between two refreshes and see inconsistent state?
- For each event listener: when registered, when unsubscribed? Can events arrive before registration or after cleanup?

**Agent G — Frontend Forms & Types** (Explore, sonnet)
- Scope: form components, type definitions
- In each form component: trace local form state vs what's actually saved
- Compare frontend type definitions with backend command signatures — where do shapes differ?

**Agent I — Shared State & Threading** (Explore, sonnet)
- Scope: static variables, threading, IPC
- Find every static variable (Mutex, AtomicBool, etc.) — who writes, who reads, what ordering? Can two writers race?
- Check for lock ordering — can two locks be acquired in different order from different paths (deadlock risk)?
- Check file I/O atomicity: are saves atomic (write-tmp + rename) or direct write?

---

#### Phase 1b: Adversarial Verification (MANDATORY)

**Every bug candidate from Phase 1 MUST be verified before being reported.**

This phase exists because flow-mapping agents see differences between paths and report them as bugs, without checking whether the difference is **intentional, guarded elsewhere, or impossible to trigger**.

##### History Check (uses Agent H pre-loaded results)

Agent H (launched in Phase 1 batch) already has the disproved + confirmed history with git log results ready. Use its output to filter candidates:

##### Matching rule (how to recognize a candidate as "already known")

A Phase 1 candidate matches a history entry when **any referenced file path + line range overlaps** with the history entry's `Files` field. Title similarity is secondary — two entries about different bugs in the same file at the same lines are the same finding. Two entries with similar titles but different files are NOT the same finding.

**Fuzzy line-range matching (handles code edits that shift lines):**
- Line ranges overlap if they share any line number **after expanding both ranges by +/-15 lines**. E.g., history entry `file.rs:37-49` matches candidate `file.rs:55-68` because `49+15=64` overlaps `55-15=40`.
- If line ranges do NOT overlap even after +/-15 expansion, fall back to **function-name anchor**: if both entries reference the same file AND the same function/struct/component name, treat them as matching. This catches cases where large insertions shift code by more than 15 lines.
- Only when NEITHER line-range overlap NOR function-name match exists, treat the candidate as new.

**Disproved history check:**
1. For each Phase 1 candidate, check if it matches a disproved entry in Agent H's results (match by **overlapping file(s) + line range**, title as tiebreaker)
2. If Agent H marked the entry as `unchanged` → **skip verification**, mark as "Previously disproved (code unchanged)" in the verification table
3. If Agent H marked the entry as `changed` → **re-verify** (launch a verification agent as normal). The code changed, the old disproval may no longer hold.

**Confirmed findings check:**
4. For each Phase 1 candidate, check if it matches a confirmed entry in Agent H's results (match by **overlapping file(s) + line range**, title as tiebreaker)
5. If Agent H marked the entry as `unchanged` → **skip verification**, mark as "Known finding (code unchanged, not yet fixed)" in the verification table
6. If Agent H marked the entry as `changed` → **re-verify**. The code changed — maybe the bug was fixed. If now DISPROVED, move entry from `findings.md` to `disproved.md`.

**New candidates:**
7. Candidates with no match in either history → verify as normal

##### Intra-run dedup (before launching verification agents)

Multiple discovery agents can independently report the same bug from different perspectives. Before launching verification agents, **merge candidates that reference the same file(s) + overlapping line ranges** (using the same +/-15 fuzzy matching as history checks). Pick the most specific description, merge the referenced files, and launch **one** verification agent for the merged candidate — not one per duplicate.

If the user says **"fresh scan"** or **"ignore history"**, skip this check entirely and verify all candidates.

##### Verification method

For each candidate bug, launch a **verification agent** (Explore, sonnet) with this exact prompt pattern:

```
Research task (DO NOT edit files). You are a DEVIL'S ADVOCATE.
Your job is to try to DISPROVE the following bug candidate:

BUG CANDIDATE: "[paste the candidate title]"
CLAIMED ISSUE: "[paste the discovery agent's description]"
TRIGGER SCENARIO: "[paste the claimed trigger]"

Your task:
1. Read ALL the code the finding references — BOTH sides of the divergence
2. Trace the FULL execution path for the trigger scenario step by step:
   - Can the trigger scenario actually happen in practice?
   - Is there a guard, check, or early-return that prevents the bad state?
   - Does a compensating mechanism elsewhere handle this case?
3. If the bug claims "path A and B diverge":
   - Check if A and B SHOULD behave differently (different requirements, documented in project docs)
   - Check if the "missing" behavior in one path is handled at a different layer
   - Check if the difference is cosmetic (same end result, different mechanism)
4. If the bug claims a race condition or timing issue:
   - Trace the actual threading model — can the two operations really overlap?
   - Check for locks, atomics, or serialization points that prevent the race
   - Check if the consequence of the race is benign (e.g., extra refresh, idempotent operation)
5. If the bug claims a contract violation:
   - Check ALL callers — do any actually violate the contract?
   - Check if the function handles the "violation" gracefully anyway (returns default, logs warning)

Deliver one of:
- CONFIRMED: The bug is real. [explain the concrete trigger + what breaks]
- DISPROVED: This is not a bug. [explain why the code is correct or the trigger is impossible]
- DOWNGRADED: Technically real but lower severity than claimed. [explain why impact is limited]

You MUST pick one. No hedging.
```

##### Verification rules

- Launch **one verification agent per bug candidate, all in parallel** — 3 bugs = 3 agents, 10 bugs = 10 agents. No batching.
- Each verification agent MUST read the actual code, not rely on the discovery agent's description
- A finding that is DISPROVED is dropped entirely — do NOT include it in the bug list
- A finding that is DOWNGRADED gets its severity adjusted
- A finding that is CONFIRMED proceeds unchanged
- **Report all verification results transparently** in a verification table

##### History Update (after all verification completes)

After Phase 1b verification (and Phase 2 verification if applicable), update BOTH history files:

**`.claude/skills/bug-auto-finder-disproved.md`:**
1. **Add** newly DISPROVED findings (title, date, files, one-line reason)
2. **Remove** any entries whose candidate was re-verified and now CONFIRMED (code changed, it became a real bug)
3. **Keep** existing entries that were skipped (code unchanged)

**`.claude/skills/bug-auto-finder-findings.md`:**
1. **Add** newly CONFIRMED findings (title, severity, date, files, description, trigger scenario)
2. **Remove** any entries whose candidate was re-verified and now DISPROVED (code changed, bug was fixed) — move to `disproved.md` with reason "Fixed in code since last scan"
3. **Keep** existing entries that were skipped (code unchanged, bug still present)

Use this format for `disproved.md` entries:

```markdown
### [Candidate title]
- **Date**: YYYY-MM-DD
- **Files**: path/to/file1.rs:100-120 (fn foo), path/to/file2.ts:50-60 (Component)
- **Reason**: [one-line why it was disproved]
```

Use this format for `findings.md` entries:

```markdown
### [Candidate title]
- **Severity**: Critical / High / Medium / Low
- **Date**: YYYY-MM-DD
- **Files**: path/to/file1.rs:100-120 (fn foo), path/to/file2.ts:50-60 (Component)
- **Description**: [2-3 sentences: what's broken, which flow, what contract]
- **Trigger**: [concrete scenario that hits this bug]
- **Impact**: [what goes wrong — crash, wrong output, data loss, silent failure]
- **User perspective**: [plain-language: "When you [do X], [Y happens] instead of [Z]."]
```

The `(fn name)` / `(Component)` anchor after each file:line-range is **required** — it enables stable matching across line-number shifts. Use the innermost enclosing `fn`/`struct`/`impl`/`const`/React component name.

##### Typical false positive patterns to watch for

These are patterns that discovery agents frequently misidentify as bugs:

1. **"Path A does X, path B doesn't"** — Check if path B's context makes X unnecessary (e.g., one path needs cleanup, the other doesn't because of different trigger mechanism)
2. **"Function assumes non-empty but caller can pass empty"** — Check the full call chain: often an earlier step guarantees non-empty (UI validation, required field, upstream filter)
3. **"Race between thread A and thread B"** — Check if the operations are serialized by a shared Mutex, or if the "race" outcome is benign (last-writer-wins is fine for some settings)
4. **"Event fires before listener ready"** — Check for readiness patterns (wait loops, ready acknowledgments) that handle exactly this
5. **"Error swallowed silently"** — Check if the error is non-critical (best-effort operation, optional enhancement) and has an explicit comment explaining why
6. **"These two commands return different error shapes"** — Check if the caller handles both shapes, or if one command genuinely can't fail in the way described
7. **"Save failure leaves stale in-memory state"** — Check if the in-memory state was updated BEFORE or AFTER the save call. If after (common pattern), save failure means in-memory stays consistent
8. **"Handle can go stale"** — Check if the stale handle is used in a way that's safe (e.g., API call on invalid handle just returns false, doesn't crash)

---

#### Phase 2: Divergence Analysis

After all Phase 1 agents report and Phase 1b verification completes, **cross-reference the verified flows to find any remaining divergences**:

1. **Parallel path comparison**: Where two paths should behave the same but don't:
   - Same operation via different entry points
   - Same setting resolved in different contexts
   - Same event handled by different listeners
   - Read each path's code carefully — the bug is often in the subtle difference

2. **Contract gap analysis**: Where a function assumes something its callers don't guarantee:
   - Function expects non-empty input → find all callers → any pass empty?
   - Function expects lock held → find all callers → any skip the lock?
   - Command expects state available → can it be called before setup?

3. **State consistency analysis**: Where shared state can become inconsistent:
   - In-memory state vs on-disk state after a failed save
   - Frontend state vs backend state during a settings update
   - Two atomics that should change together but don't (non-atomic composite update)

4. **Timing analysis**: Where event ordering assumptions can be violated:
   - Event emitted before listener registered
   - Callback fires after resource destroyed
   - Two async operations assumed sequential but actually concurrent

**Any new bugs found in Phase 2 cross-referencing MUST also be verified** using the same Phase 1b adversarial method before being included in the final report.

**Phase 2 dedup guard:** Before launching Phase 2 verification agents, check each Phase 2 candidate against (a) all Phase 1b CONFIRMED findings, (b) all Phase 1b DISPROVED candidates, and (c) Agent H's known-files summary. If a Phase 2 candidate matches any of these (same fuzzy matching rule), skip it. This prevents re-verifying bugs that were already confirmed or disproved in Phase 1b.

---

### Analysis Rules

1. **Every finding must trace back to a specific flow divergence or contract break** — not just "this code looks suspicious"
2. **Every bug MUST pass adversarial verification (Phase 1b)** — unverified bugs are not reported
3. **Rate severity**:
   - **Critical**: Data loss, crash, or silent wrong result that triggers in normal use
   - **High**: Incorrect behavior visible to the user in common scenarios
   - **Medium**: Incorrect behavior in edge cases or race conditions hard to trigger
   - **Low**: Defensive gap that hasn't caused issues yet but will under specific conditions
4. **Drop non-bugs** — if investigation shows both paths are actually correct (e.g., intentionally different behavior documented in project docs), drop it. Do NOT pad the report.
5. **Merge findings with same root cause** — if the same flow divergence causes 3 symptoms, that's 1 bug with 3 manifestations, not 3 bugs

---

### Hard Limits

- **Maximum 15 findings** — target real bugs, not volume
- If only 3 real bugs exist, report 3. Do NOT inflate.
- Every reported bug MUST include:
  - The exact file(s) and line range(s)
  - Which flow or contract is broken
  - A concrete scenario that triggers it
- Do NOT report bugs that are already guarded against (check the surrounding code first)
- **Do NOT fix bugs** — record them in `findings.md` only

---

### Required Output Format

#### 1. Flow Map Summary
Brief overview of the critical flows mapped and any surprising discoveries about how the system actually works (vs how docs describe it).

#### 2. History Skip Summary
How many disproved entries were skipped (code unchanged), how many confirmed findings were skipped, how many were re-verified due to code changes.

#### 3. Verification Results
Table showing each Phase 1 candidate and its verification outcome:
| # | Candidate | Verdict | Reason |
|---|-----------|---------|--------|
Candidates marked DISPROVED are NOT included in subsequent sections.

#### 4. Bug List (sorted by severity, verified only)

Per bug:

**Bug N: [Short title]**
- **Severity**: Critical / High / Medium / Low
- **Verification**: CONFIRMED / DOWNGRADED (from original severity)
- **Flow**: Which execution flow or data path is affected
- **Divergence**: What should be the same but isn't, or what contract is broken
- **File(s)**: exact path(s) and line range(s) on BOTH sides of the divergence
- **Trigger scenario**: How a real user or real execution path hits this bug
- **Impact**: What goes wrong when triggered (crash? wrong output? data loss? silent failure?)
- **User perspective**: Plain-language description of what the user sees/experiences on the GUI. Written for someone who does NOT read code. Format: "When you [do X], [Y happens] instead of [Z]. This means [consequence]."
- **Suggested fix**: Which side should change and in what direction

#### 5. False Positives Investigated But Dropped
List anything that looked like a divergence but turned out to be intentional or safe, with a one-line explanation. This prevents re-investigation.

#### 6. User Impact Summary

Plain-language summary of ALL confirmed bugs, written for someone who does NOT read code and does NOT know the architecture. No file paths, no function names, no technical jargon.

For each bug, one paragraph in this style:
> **[Bug title in plain words]**: When you [action the user takes], [what actually happens wrong]. Instead, [what should happen]. [How often / how likely this is to hit you]. [Workaround if any, or "no workaround".]

Group by user-visible impact area (e.g., "Actions", "Settings", "Recording", "Chat", "Clipboard").

#### 7. Final Verdict
- How many bugs should be fixed immediately (Critical + High)
- How many can wait
- How many are new this run vs previously known
- Overall correctness confidence: "I'd ship this" / "Fix the criticals first" / "Significant risk"

---

### Anti-Pattern Rules

1. Do NOT report architecture issues as bugs — wrong tool for that.
2. Do NOT report "missing error handling" unless the missing handling causes concrete incorrect behavior in a traced flow.
3. Do NOT report style issues (naming, formatting, comment quality).
4. Do NOT report "potential" bugs without tracing the actual flow that triggers them.
5. Do NOT suggest refactors — only fixes.
6. Do NOT scan for isolated code patterns (unwrap, empty catch) without understanding the flow they're in.
7. Do NOT conflate "these two paths are different" with "these two paths should be the same" — check intent first.
8. Every finding MUST answer: "Which flow breaks, how, and when?"
9. **NEVER skip Phase 1b verification.** Every candidate must be challenged before reporting.
10. **NEVER report a candidate that was DISPROVED** — drop it from the bug list (but show it in Verification Results and False Positives).
11. **NEVER fix bugs directly.** Record in `findings.md` only. The user decides when to fix.

---

### Rules

- Read CLAUDE.md first for architecture context (understand what's intentional before calling it a bug)
- Check for lint suppression configs — some patterns may be explicitly allowed
- The "DO NOT Centralize" section (if present) lists intentional divergences — these are NOT bugs
- Do NOT update changelog — this skill does not modify code
