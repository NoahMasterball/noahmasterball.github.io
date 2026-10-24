# CLAUDE.md — Counterweight (project rules)

Project-specific rules only. The repo-root `CLAUDE.md` (SSOT, constants in one place, no
warning suppression, no silent `catch`) applies in full and is not repeated here.

## Where things live

| What | Where | Notes |
| --- | --- | --- |
| Every per-content balance number (operators, weapons, abilities, hitboxes, budget weights, levels) | `src/data/` | Types in `src/data/schema.ts`; id lookups and validation via `src/data/content.ts` |
| Global simulation rules (tick rate, gravity, capsule, movement feel, footsteps, gunplay rules, match format, range + elimination + Relay rules, bot tiers and tuning) | `src/config/sim.ts` | Three.js-free; imported by sim, ai, client, tests |
| Rendering, camera, view model, key bindings, settings schema + defaults, HUD, audio, screenshot shots | `src/config/client.ts` | Plain data (no Three.js import) so Node tools can read it |
| UI colours/fonts | CSS custom properties in `index.html` `:root` | |
| Generated docs | `docs/generated/*.md`, README controls block | Never edit by hand — `npm run docs:gen` |

Units in data: metres, seconds, degrees (angles in sim *state* are radians). Colours are
`0xRRGGBB` numbers.

## Simulation / render boundary (ADR-0003) — hard rule

- `src/sim/`, `src/ai/`, `src/data/`, `src/balance/`, `src/config/sim.ts` must run in Node:
  no Three.js, no client imports, no DOM/browser globals, no `Date`/`performance`/timers,
  no `Math.random`. ESLint enforces it (`npm run lint`); do not weaken that block.
- `src/sim/` additionally never imports `src/ai/` or `src/balance/`.
- The client only **reads** simulation state. Every change goes through a per-tick `Command`
  (players and bots alike) or a `ControlMessage` (operator select, teleport); initial spawns
  via `Sim.spawnCharacter()`. QA hooks follow the same rule.
- Gameplay randomness uses the seeded RNG in `SimState` (`src/sim/rng.ts`); bots own separate
  RNG streams. Anything visual may use `Math.random`.
- Derived stats are computed in `src/sim/stats.ts`, never cached in state.
- System order in `Sim.step` (ADR-0012 §6): controls → mode rules → store `prev*` → abilities →
  gadgets → areas → movement → `physics.step()` → weapons → projectiles. Weapons and projectile
  sweeps must run after the physics step (they need this tick's hitboxes and gadgets).

## Code conventions specific to this project

- Relative imports carry the `.ts` extension; only erasable TypeScript (no `enum`,
  `namespace`, parameter properties); type-only imports use `import type` (ADR-0008 — the tools
  run with Node's type stripping).
- New sim state must be plain serialisable data (future snapshots/netcode). Rapier handles stay
  in `src/sim/physics/world.ts` side tables.
- New simulation behaviour gets a Vitest test that runs the real `Sim` in Node where possible
  (`tests/unit/sim.test.ts` shows the pattern).

## Commands

```bash
npm run dev          # prints the local URL; host/ports in `tools/lib/deploy.ts`
npm run build        # tsc + vite build → dist/ (base './')
npm test             # Vitest (unit + Rapier-backed sim tests)
npm run lint         # ESLint incl. the boundary rule
npm run test:e2e     # build + Playwright smoke test from the sub-directory server
npm run check        # lint + typecheck + unit + e2e — run before calling anything done
npm run balance      # budget + TTK matrix; exit 1 if an operator leaves the band
npm run docs:gen     # regenerate docs/generated + README controls
npm run shots        # screenshots → docs/screenshots/iterNN_* and latest_*
npm run deploy       # check, then copy the verified build to play/ (PAGES_URL in tools/lib/deploy.ts)
```

## Checklists

### Add a weapon
1. Add a `WeaponDef` to `src/data/weapons.ts` (unique `id`, existing `class`).
2. New class? Add it to `WEAPON_CLASSES` in `src/data/schema.ts`; TypeScript then requires a
   view-model entry (`VIEWMODEL.classes`) and a sound (`AUDIO.shot`) in `src/config/client.ts`.
3. Reference it in an operator `loadout`.
4. `npm run balance` — read the TTK row; check the budget of every operator that uses it.
5. `npm test`, then `npm run docs:gen`.

### Add an operator
1. Add an `OperatorDef` to `src/data/operators.ts`: archetype, `hitboxProfile`,
   `abilitySlots` = number of abilities, primary + secondary weapons, a distinct
   `presentation.color`, silhouette note and bio.
2. `npm run balance` — the total must be inside the band in `src/data/budget.ts`. Tune the
   operator, never the band or weights to fit one operator.
3. Write the identity paragraph in `docs/SPEC.md` §10 (no numbers — they are generated).
4. Playable in matches (Relay, elimination, bots)? Add the id to `PLAYABLE_OPERATORS`
   (`src/config/sim.ts`). The range offers every operator while `RANGE_MODE.allOperators` is on.
5. `npm test`, `npm run docs:gen`, `npm run shots` if it is visible.

### Add an ability
1. Compose it in `src/data/abilities.ts` from existing activation, resource and effect kinds,
   with a reviewed `budgetCost` and a `bot` usage hint (ADR-0012 §10).
2. Needs a new effect kind? Add the variant to `EffectDef` in `src/data/schema.ts`, one handler
   in `HANDLERS` (`src/sim/abilities/effects.ts`, implementation in `handlers.ts`) and a unit
   test. That is the only core change allowed per ability. A new *modifiable stat* or
   *activation kind* needs an ADR.
3. Its activation × effect pairs must be supported combinations (`isCombinationSupported()`,
   `effects.ts`); `isAbilitySupported()` (`src/sim/systems/abilities.ts`) must return true —
   the content tests require it for every ability.
4. Add it to an operator, then `npm run balance`, `npm test`, `npm run docs:gen`.

### Add a level
Create a `LevelDef` in `src/data/levels/`, register it in `src/data/content.ts`. Collision and
visuals are both built from it — never add geometry only on one side.

## Critical knowledge (learned the hard way — do not rediscover)

1. **Rapier compat** inlines WASM into one large chunk; for `chunkSizeWarningLimit` see the
   comment in `vite.config.ts`. Hitboxes are *sensors* (`COLLISION_GROUPS.hitbox`, see
   `src/sim/physics/groups.ts`): KCC queries exclude them, bullet rays
   (`COLLISION_GROUPS.bulletQuery`) hit them. Standing up checks head-room for the *full*
   standing capsule.
2. **Three r186 removed `PCFSoftShadowMap`** (it logs a warning and falls back). Use
   `PCFShadowMap`.
3. **The local player's actor must be hidden, not skipped**: after a free-camera shot its
   view exists, and its visor ends up centimetres in front of the camera.
4. **View model**: it needs `scene.environment` (shared PMREM) or it renders black; ADS depth
   and height are derived per weapon from its size (`VIEWMODEL.adsEyeRelief`); the hip depth
   too (`VIEWMODEL.hipRearDepth` — a fixed hip offset put short weapons' rear sights on the HUD).
5. **TypeScript is pinned to 6.0.x** (typescript-eslint supports < 6.1) and **Playwright to
   1.62.1** (reuses the cached `chromium-1234`). Upgrading either is a deliberate step.
6. **Headless screenshots run on software WebGL at ~5 fps** — never use them for performance;
   timing-sensitive visuals (hit markers) may not show. The tick cap then slows the sim.
7. **OneDrive path**: the Read tool can return stale snapshots; verify with `cat`/`git`
   before editing when in doubt.
8. **Never judge visuals from code** — after a visible change run `npm run shots`, look at the
   PNGs and log the finding in `docs/PROJECT_STATE.md`.

## Keeping docs in sync

- Architecture change → update `docs/ARCHITECTURE.md` and add/supersede an ADR.
- Every session ends with a dated entry in `docs/PROJECT_STATE.md` (what changed, how it was
  verified, what is next).
- **Publishing (user decision 2026-09-30):** whenever the game is in a playable, verified state,
  keep the browser version current: `npm run deploy`, then commit and push **only** the `play/`
  folder to `main` (GitHub Pages serves it). Never publish a red check. Everything else in this
  repository (source, docs, other projects' files) is still committed only when the user asks.
