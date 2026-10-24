# Roadmap

*Each milestone has a measurable definition of done (DoD). A milestone is done only when every
item is verified — build, tests, smoke test and a human look at the screenshots — and logged in
[`PROJECT_STATE.md`](PROJECT_STATE.md).*

## Phase 0 + 1 — Spec and foundation ✅ (this task)

- Spec, architecture, networking plan, ADRs, roadmap.
- Tech prototype: greybox range, first-person controller, one hitscan weapon system, two
  data-driven operators, debug overlay, balance script, unit tests, Playwright smoke test,
  production build from a sub-directory.

## M1 — Gunplay, movement and four operators vs. bots (one greybox map)

- 4 playable operators — Basalt, Wisp, Kestrel, Heron (user decision, 2026-09-27) — with
  primary + secondary weapons and weapon switching.
- Greybox map #1 built from level data following SPEC §13 (two floors, two sites): Saltworks,
  SPEC §13.1.
- Bots per SPEC §12: perception, state machine, aim model with three difficulty tiers,
  waypoint navigation, using the same command pipeline.
- Team deathmatch-style elimination rounds (no objective yet) 5v5, player + 4 bots vs 5 bots.
- User decisions 2026-09-27: Heron plays M1 with weapons only (Sonar Pulse in M2); elimination
  uses sides and Relay's match format, time-out → defenders win (design: ADR-0011).
- Feel checklist SPEC §11 complete: sprint/ADS/fire interplay, hit feedback, view-model sway
  and bob, footstep audio by weight class, damage-direction indicator.

**DoD**
- A 10-minute session vs. medium bots runs at ≥ 60 fps at 1080p on the reference machine
  (RTX 4080 class). Headless software rendering (used by the screenshot/smoke tools) is not
  a performance target.
- Blind test: a tester identifies anchor vs. speedster by movement alone within 1 s and by
  TTK within one magazine (recorded in PROJECT_STATE).
- Bots: medium bots win 30–70 % of duels against a mid-skill tester (measured over 20 duels).
- All operators inside the power-budget band; TTK matrix reviewed.
- `npm run check` green (lint, typecheck, unit, e2e); screenshots reviewed.

## M2 — Ability framework and round system

- ✅ **Built (2026-09-30, [ADR-0012](decisions/0012-ability-framework.md)):** all activation
  types (`hold`, `toggle`, `placeable`, `thrown`) and all effect types from SPEC §7, gadgets as
  entities with health, reveal markers, area visuals showing exact radii.
- ✅ **Built (2026-09-30, [ADR-0013](decisions/0013-relay-mode.md)):** Relay mode — operator
  select (select screen, pick limit), setup (setup walls, recon-only attackers), engagement,
  uplink plant/disrupt, round/match flow, side swap, overtime, HUD timers, objective HUD and
  kill feed. Round and phase timings live in `RELAY` (`src/config/sim.ts`); SPEC §4.1 links to
  them. Relay is the default mode on page load.
- Bots use abilities via data-declared usage hints (✅ built 2026-09-30) and play the
  objective (✅ built 2026-09-30: operator picks, plant, guard, rotate, disrupt).
- **Net-readiness spike (added, see "Order changes"):** run the simulation in a Web Worker
  behind a message channel with artificial latency (loopback), with client-side prediction
  of the local player. No server yet.

**DoD**
- Every roster ability that belongs to the 4 M1 operators works; every effect type has a unit
  test; `isAbilitySupported()` returns true for every ability in `src/data/`.
- Full Relay match (first to 4) completes vs. bots without errors; round flow covered by a
  sim-level unit test and a Playwright test.
- Loopback spike: at 100 ms simulated RTT the local player's movement and shooting feel
  unchanged (prediction), and a determinism test replays a recorded match from its commands
  to an identical final state.

**DoD status (2026-09-30)**
- Ability item met: every effect type has a unit test (`tests/unit/effects.test.ts`);
  `isAbilitySupported()` is true for every ability (`tests/unit/content.test.ts`); every
  ability of the M1 operators — and of the whole roster — works end to end through commands
  (`tests/unit/roster.test.ts`).
- Relay item met ([ADR-0013](decisions/0013-relay-mode.md) §12–§14): a full bot-only Relay
  match reaches `matchEnd` without errors, stuck bots or refused presses
  (`tests/unit/relay-bots.test.ts`; 20 seeds measured in ADR-0013 §13); the round flow is
  covered by the sim-level `tests/unit/relay.test.ts` (phases, picks, setup walls, plant and
  disrupt, every round result) and the Playwright test `tests/e2e/relay.spec.ts` (select →
  setup → plant → uplink → round end in the production build). A full match played by a
  human in the browser belongs to the open M1 playtest.
- Open: the net-readiness spike ([ADR-0014](decisions/0014-net-readiness-spike.md)) — so far a
  scripted ability round replays to an identical state (`tests/unit/replay.test.ts`), not yet
  a recorded match, and there is no worker loopback or prediction.

## M3 — Art pass

- Character models for the M1 operators (CC0 base + custom outfits/colour coding per SPEC §16),
  weapon view models, map dressing (modular kit), lighting pass, recorded/CC0 sounds.
- Everything in `ASSET_MANIFEST.md` with verified licence; `public/assets` pruned to used files.

**DoD**
- Screenshot set reviewed against a written visual target (to be added as `docs/VISUAL_SPEC.md`).
- Readability test: operator identified by silhouette alone at 20 m in 9 of 10 samples.
- Performance budget from M1 still met; initial download ≤ 60 MB.

## M4 — More operators and maps

- Remaining roster from SPEC §10 and a second map.
- Balance pass using the budget model plus playtest data; weights corrected where the model
  mispredicted.

**DoD**
- Every roster operator playable and inside the budget band; TTK matrix reviewed; every operator
  used in at least one bot match per map without errors.

## M5 — Destructible walls and surfaces

- Breachable surfaces in level data, destruction state in the simulation, bullet penetration
  of soft surfaces, Breacher kits complete.

**DoD**
- Destruction state is part of the serialisable simulation state (replay test passes); no
  frame drops > 5 ms from destruction events on the reference machine.

## M6 — Online multiplayer

- Authoritative Node + WebSocket server running the same `src/sim/` code, client prediction,
  interpolation, lag compensation for hitscan (plan: [`NETWORKING.md`](NETWORKING.md)).
- Hosting decision (the static GitHub Pages build cannot host it) — needs the user.

**DoD**
- 10 players (or bots filling slots) play a full Relay match on a hosted server with
  ≤ 150 ms RTT without desyncs; hit registration verified with the lag-compensation test.

## Order changes and reasons

The suggested order M1 → M6 is kept, with one addition: a **net-readiness spike inside M2**.
Online play is the riskiest cross-cutting feature but needs a hosted server and a hosting
decision; a loopback test (worker + artificial latency + replay determinism) proves the
architecture early without any hosting, so problems surface while the simulation is still
small. Destruction (M5) stays *before* online (M6) on purpose: destruction state must then be
part of the replicated snapshot from day one instead of being retrofitted into netcode.
