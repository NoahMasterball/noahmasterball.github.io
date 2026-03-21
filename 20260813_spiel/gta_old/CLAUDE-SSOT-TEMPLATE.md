# CLAUDE.md — SSoT Template (Language-Agnostic)

> Copy this file as `CLAUDE.md` into any project root.
> Fill in the `[PLACEHOLDER]` sections with your project-specific paths and conventions.
> Delete sections that don't apply.

---

## SSoT Principle (MOST IMPORTANT RULE)

**Every constant, string, setting, and list is defined EXACTLY ONCE.**
Before writing any value, ask: **"Where is this already defined?"**

### SSoT Implementation Rule

Before writing new code:
1. **Grep for the concept** (try at least 3 naming variations: camelCase, snake_case, UPPER_CASE, the English word, abbreviations).
2. **Found?** Extend the existing definition (add a parameter, export, etc.). Do NOT create a second copy.
3. **Not found?** Write `// NEW — [justification]` above the definition explaining why this doesn't exist yet.

After each sub-task, verify:
- No hardcoded user-visible strings in UI components (use a localization function like `t()`, `i18n()`, `intl.formatMessage()`, etc.)
- No magic numbers outside the constants file
- If you changed the constants file, check all derived copies (see table below)
- If you changed a shared type/model, update all consumers

### SSoT Ownership Table

Fill this in for your project. Every row answers: "Where is the ONE canonical definition?"

| What | SSoT File | Notes |
|------|-----------|-------|
| App name, version | `[e.g. package.json]` | All other references derive from here |
| App constants (limits, timeouts, sizes) | `[e.g. src/constants.ts]` | Single file, grouped by domain |
| UI strings / i18n | `[e.g. src/locales/en.json]` | Frontend uses `t("key")`, never hardcoded |
| API endpoints / route paths | `[e.g. src/routes.ts]` | Never hardcode URLs in components |
| Feature flags | `[e.g. src/config/features.ts]` | |
| Environment config | `[e.g. .env + src/config.ts]` | Secrets in env vars or secret manager, never in code |
| Type definitions / models | `[e.g. src/types/]` | Shared between frontend and backend if applicable |
| Settings / user preferences | `[e.g. src/config/settings.ts]` | Defaults defined here, frontend reads only |
| Error messages | `[e.g. src/errors.ts or locales]` | Never hardcode error strings in handlers |
| Validation rules (min/max/regex) | `[e.g. src/constants.ts]` | Shared between frontend + backend validation |

### Derived Values Table

Some values MUST exist in multiple files (e.g. a port number in both config and dev server). Track them here so they stay in sync.

| Category | Values | SSoT Owner | Derived Copy | Sync Rule |
|----------|--------|-----------|--------------|-----------|
| `[e.g. Dev port]` | `[e.g. 3000]` | `[e.g. .env]` | `[e.g. vite.config.ts]` | Manual sync -- change env first |
| `[e.g. App version]` | `[e.g. 1.2.3]` | `[e.g. package.json]` | `[e.g. footer component]` | Read at build time, no manual sync |

---

## Documentation Requirements

After EVERY coding task, you MUST:
1. **Update changelog** — entry at TOP with date, category, and summary
2. **Update README** if user-facing features, GUI, or config changed
3. **Update this CLAUDE.md** if new files, endpoints, patterns, or SSoT entries were added

New documentation files ALWAYS go into `docs/`. Never in the project root.

---

## Coding Rules

### MUST
- **Read before edit** — understand existing code before modifying
- **Constants in one place** — all magic numbers, limits, timeouts go in the constants file
- **User-visible strings through i18n** — never hardcode text in UI components
- **Errors through a central error mechanism** — never hardcode error messages inline
- **Secrets in secure storage only** — never in code, config files, or version control

### MUST NOT
- Hardcode user-visible strings in UI components
- Hardcode app name/version outside the canonical source
- Duplicate constants across files (use imports)
- Store secrets in settings, env files committed to git, or plaintext
- Skip changelog updates
- Use `#[allow(...)]` / `// eslint-disable` / `@ts-ignore` to suppress warnings — fix the root cause
- Create new UI component variants (button styles, color classes, etc.) without checking if an existing one fits first

### Anti-Patterns to Avoid
- **Copy-paste constants**: If you need a value in two places, import it or derive it. Never copy it.
- **Hardcoded option lists**: Dropdowns, selects, radio groups — generate from data, don't hardcode `<option>` tags.
- **Inline defaults in UI**: Component default values must come from the config/settings layer, not be hardcoded in JSX/HTML.
- **Silent error swallowing**: No empty `.catch(() => {})` without an explicit comment explaining why.

---

## Pattern Consistency Rule

Before implementing any pattern, **find an existing instance in the codebase and match it exactly.**
Do not invent a new approach for something that already has an established pattern.

Fill in your project's patterns:

| Pattern | Reference Implementation | Must Match |
|---------|------------------------|------------|
| `[e.g. API call + error handling]` | `[e.g. src/api/users.ts fetchUser()]` | Try/catch, error toast, loading state |
| `[e.g. Form validation]` | `[e.g. src/components/UserForm.tsx]` | Validation schema, error display, submit flow |
| `[e.g. State management]` | `[e.g. src/store/userStore.ts]` | Store structure, action naming, selector pattern |
| `[e.g. Event listeners]` | `[e.g. src/hooks/useEventListener.ts]` | Setup + cleanup pattern |

---

## Architecture Rules

### Layering (adapt to your stack)

```
UI Components  -->  API/Service Layer  -->  Business Logic
                                       -->  Data Access / External APIs

Business Logic MUST NOT import from UI.
UI MUST NOT directly access data storage.
```

### Settings / Config
- All defaults defined in ONE settings file
- Frontend/UI reads settings, never defines defaults
- Scoped overrides use `null`/`undefined` = "use global fallback" (not boolean flags like `useGlobal: true`)

### Types / Models
- Shared types in a dedicated types file/directory
- When backend types change, update frontend mirrors immediately
- Discriminator values (status, mode, type) should be enums/unions, not loose strings

---

## No-Overengineering Rules

- Don't add features, refactor code, or make "improvements" beyond what was asked
- Don't add error handling for scenarios that can't happen
- Don't create abstractions for one-time operations
- Don't design for hypothetical future requirements
- Three similar lines of code is better than a premature abstraction
- No backwards-compatibility shims when you can just change the code (unless there are real users)

---

## Quick Reference: SSoT Checklist

Use this checklist before finishing any task:

- [ ] No new hardcoded strings in UI (used i18n/localization)
- [ ] No new magic numbers outside constants file
- [ ] No duplicated constants (checked with grep)
- [ ] Derived values table updated if new cross-file dependency added
- [ ] Changelog updated
- [ ] README updated (if user-facing change)
- [ ] CLAUDE.md updated (if new pattern/file/endpoint)
