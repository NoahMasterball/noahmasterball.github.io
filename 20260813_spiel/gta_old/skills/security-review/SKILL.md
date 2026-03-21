---
name: security-review
description: Security audit — reviews key management, secrets, IPC, auth, and prepares parallel refactor batches
---

## Security Review

Review the application for security-related issues.

### Scope

Examine the following areas based on your professional judgment:

- **Key management** — how API keys, license keys, and encryption keys are stored, accessed, and rotated
- **Secrets handling** — are secrets ever logged, serialized to disk, or exposed via IPC?
- **Frontend-backend communication** — IPC surface, command argument validation, unauthorized command access
- **Authentication & authorization** — license verification, capability gating, privilege escalation paths
- **In-memory data exposure** — secrets in application state, clipboard content lifetime, sensitive data in logs
- **Input validation** — injection risks in user-provided strings (regex, URLs, headers, prompt text)
- **Dependency security** — known vulnerable crates or npm packages

Determine what should be investigated and addressed based on your professional judgment. Do not report theoretical issues that require "consider" or "might want to" — only actionable findings.

### Output

If security issues are identified:

1. **Prepare 3-5 batch files** named `docs/security_refactor_N.md` (N = 1, 2, 3, ...)
2. Each batch file must be **fully self-contained** — include file paths, exact changes needed, and rationale
3. Batches must be designed for **parallel execution** — no cross-dependencies between batches
4. If parallel execution is not possible for certain changes, **explain the dependency explicitly** and mark the execution order
5. Keep batches **small and context-window safe** — no single batch should require reading more than 5-6 files

If no actionable security issues are found, state: "No actionable security issues found."

### Rules

- Read CLAUDE.md first for architecture context
- Focus on real risk, not compliance checklists
- Severity rating per finding: Critical / High / Medium / Low
- Do NOT modify code directly — only produce the batch files in `docs/`
