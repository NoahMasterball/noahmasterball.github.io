# ADR-0003 — Fixed-tick simulation separated from rendering, lint-enforced

*Status: accepted · 2026-09-27*

## Context
Online multiplayer (M6) needs the gameplay simulation to run on a server without a browser,
and clients to predict/interpolate. Retrofitting this into a render-coupled game is a rewrite.

## Decision
- `src/sim/` owns all gameplay state and advances in fixed ticks (`SIM.tickRate`).
- The client accumulates frame time and runs 0…N ticks per frame (N capped in
  `config/client.ts`), then renders with `alpha = accumulator / TICK_DT`, interpolating
  positions, stance, aim offset and ADS between `prev*` and current values.
- Player input and bots produce `Command`s (move vector, absolute look angles, held-button
  bits) per tick. Rare requests (operator select, teleport) are `ControlMessage`s; initial
  spawns during match setup go through `Sim.spawnCharacter()`.
- **Mechanical enforcement** in `eslint.config.js`: for `src/sim/**`, `src/ai/**`,
  `src/data/**`, `src/balance/**` and `src/config/sim.ts`:
  - `no-restricted-imports`: `three`, `three/*`, anything under `client/`, `config/client`;
    the sim additionally may not import `ai/` or `balance/`;
  - `no-restricted-globals`: `window`, `document`, `navigator`, `localStorage`,
    `sessionStorage`, `performance`, `requestAnimationFrame`, `setTimeout`, `setInterval`,
    `Date`;
  - `no-restricted-properties`: `Math.random` (use the seeded RNG).
- Mouse look is applied to the camera every frame from the latest input (not quantised to the
  tick) for responsiveness; the simulation receives the same angles in the next command.

## Consequences
- Vitest runs the simulation (with Rapier) in Node — the same situation as a future server.
- The client can never mutate gameplay state directly; everything goes through commands or
  control messages.
- At very low frame rates the simulation slows down instead of spiralling (tick cap).
