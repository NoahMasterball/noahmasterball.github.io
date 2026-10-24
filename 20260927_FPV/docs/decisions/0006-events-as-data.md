# ADR-0006 — Per-tick event lists instead of a global event bus

*Status: accepted · 2026-09-27*

## Context
Rendering, UI and audio must react to things that happen in the simulation (shots, hits,
kills, reloads, ability activations) without the simulation knowing about them.

## Decision
- The simulation appends plain `SimEvent` records to a list for the current tick. After each
  tick the host drains the list and hands it to the client subsystems (HUD, audio, effects).
- There is no global pub/sub emitter and no callbacks from the simulation into the client.

## Consequences
- Events are serialisable and can be sent to clients unchanged (online) or recorded (replays).
- The order of reactions is explicit in `client/app.ts` instead of hidden in subscriptions.
