# ADR-0007 — UI in plain DOM + CSS, no framework

*Status: accepted · 2026-09-27*

## Context
HUD, menu, settings and debug overlay are small and update from simulation state. A UI
framework (React, Vue, Svelte) adds build complexity; React Three Fiber is explicitly excluded.

## Decision
- UI is plain DOM elements created by small TypeScript modules in `src/client/ui/`, styled with
  CSS custom properties defined once in `index.html`.
- Lists (settings sliders, controls help, ability slots) are generated from data/config, never
  hand-written markup.
- HUD values are written only when they change; the debug overlay refreshes at a throttled rate.

## Consequences
- Zero runtime UI dependencies. If menus grow large (M2 operator select, M6 lobbies) this ADR
  will be revisited.
