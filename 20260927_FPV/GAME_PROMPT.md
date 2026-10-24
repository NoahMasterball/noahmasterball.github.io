# MASTER TASK: Design and lay the foundation for an original operator-based tactical FPS (browser, Three.js)

You are the lead game designer, technical architect, and gameplay engineer for this project.

This task covers **Phase 0 (design documents)** and **Phase 1 (technical foundation)** of a large, long-running game project. You do NOT build the full game in this task. You finish with a spec ready for review, a clean project structure, and a small playable tech prototype that proves the core idea. Then you stop and report.

## 0. Ground truth

* This project folder (`20260927_FPV`) is empty except for this brief. You build from scratch.
* It is a subfolder of a GitHub Pages repository (`noahmasterball.github.io`). The production build must work when served statically from a subdirectory: Vite `base: './'`, relative asset paths. **GitHub Pages cannot run a server.**
* The repo-root `CLAUDE.md` applies: SSOT principle, constants in one place, no warning suppression, no silent `catch`. Follow it strictly. This project will grow large, and SSOT violations get expensive fast.
* A sibling project, `../20260208_FTB4`, already solved the browser-3D pipeline on this machine: Vite + TS strict + Three.js, glTF loaders with DRACO/KTX2/meshopt, a Playwright screenshot loop gated on a `window.__gameReady` flag, and CC0 asset acquisition with a manifest. Read its `README.md`, `HANDOVER.md` (section "Kritisches Wissen") and `tools/screenshot.mjs` before scaffolding. Adopt the same patterns instead of reinventing them. Do not import files across projects, because each project deploys independently.
* Node 24 and npm 11 are installed.

## 1. Vision

An original, round-based, tactical first-person shooter built around **operators**. Each operator has a distinct kit (weapons plus unique abilities) and a distinct place on the speed/power spectrum.

Inspiration: the operator variety and ability-driven tactics of Rainbow Six Siege, with a much wider range of playstyles. At one end are slow, heavily armoured anchors. At the other are extremely fast flankers who pay for their mobility with lower damage, lower accuracy, or less health.

Originality: copy no names, operators, maps, logos, UI layouts or sounds from Rainbow Six Siege or any other game. The identity is our own.

### Design pillars (use these to settle every design question)

1. **Every strength costs something.** No operator is strictly better than another. Every advantage is paid for with a disadvantage the player can see and feel.
2. **Gunplay first.** Moving, aiming and shooting must feel good with abilities switched off. Abilities build on solid gunplay; they never make up for bad gunplay.
3. **Readable at a glance.** Silhouette, sound and effect alone tell a player which operator they face and what an ability just did.
4. **Data-driven by design.** A new operator, weapon or ability is mostly data. Adding content must never require changes to the core simulation.

## 2. Fixed technical decisions (do not re-open)

* **Stack:** Vite + TypeScript (strict) + Three.js (latest stable). Vitest for unit tests, Playwright for screenshot and smoke tests.
* **Physics and collision:** Rapier (`@dimforge/rapier3d-compat`). Use its kinematic character controller for the player and bots, raycasts for hitscan weapons, and separate colliders for hitboxes (head/body/limbs). Verify that the WASM loads in the production build under `base: './'`.
* **No other engine or framework:** no Unity, Unreal, Godot, Babylon.js or React Three Fiber.
* **Simulation is separated from rendering (hard rule):**
  * A fixed-tick simulation owns all gameplay state: positions, health, ammo, cooldowns, ability state, round state. The tick rate is a config constant (e.g. 60 Hz).
  * The simulation layer must not import Three.js or touch the DOM. Rendering, audio and UI only *read* simulation state, and they interpolate between ticks.
  * Player input becomes serialisable per-tick commands (move vector, look angles, buttons). Bots produce the same commands.
  * Enforce the boundary mechanically, for example with ESLint `no-restricted-imports` on the sim folder, not just by convention.
  * This separation is what makes online multiplayer possible later without a rewrite (see section 4).
* Decide everything else yourself: entity architecture (e.g. a lightweight ECS vs. plain component objects), state management, event bus, UI approach. Record each significant decision as a short ADR in `docs/decisions/`.

## 3. Operator, weapon and ability model

Design this system carefully in the spec. It is the heart of the game.

**Operator stats**, at minimum: max health, armour/damage reduction, move speed, sprint multiplier, acceleration, crouch speed, ADS move penalty, ability slots, weapon loadout.

**Weapon stats**, at minimum: damage, damage falloff (start range, end range, minimum damage), fire rate, magazine size, reload time, hip-fire spread, ADS spread, spread growth per shot and while moving, recoil pattern, ADS time, headshot multiplier, move-speed modifier.

**Abilities** are assembled from reusable building blocks, not hand-coded per operator:

* activation types: instant, hold/channel, toggle, placeable gadget, thrown projectile, passive;
* resource models: cooldown, charges, limited uses per round;
* effects: damage, heal, shield/barrier, speed buff/debuff, dash/slide/mobility, reveal/scan, area denial, gadget disable;
* an ability = one activation type + one resource model + one or more effects + tuning values. A new ability is new data plus at most one new effect type.

**Balance model:**

* Define a "power budget": the total amount of mobility, survivability, damage and utility an operator may have, and how each stat converts into budget points. Speedsters and anchors spend the same budget in different ways.
* `src/data/` (operators, weapons, abilities) is the single source of truth for every balance number. Nothing is hardcoded elsewhere, and nothing is copied into docs by hand.
* Provide `npm run balance`: a script that reads the data files and prints a **time-to-kill matrix** (every weapon × every operator, body and head, at several ranges) plus each operator's budget total. Balance docs point to this output instead of duplicating numbers.

**Archetypes** the spec must cover (at least): Anchor (slow, tanky, high damage), Speedster/Flanker (very fast, fragile, low damage or wide spread), Breacher (opens paths), Intel (information/reveal), Support (heal/shield), Trapper (area control). Define 2–3 example operators per archetype in the spec, with full stats and abilities. Names and themes are original.

## 4. Multiplayer strategy

* **Milestone 1 is offline:** player vs. bots, running entirely in the browser on GitHub Pages.
* **Online PvP comes later.** It needs a separately hosted authoritative server, for example Node + WebSocket running the same simulation code. Do not implement networking now.
* Write `docs/NETWORKING.md`: the planned approach (authoritative server, client-side prediction, interpolation, lag compensation for hitscan), and confirmation that the architecture from section 2 supports it.

## 5. Deliverables of this task

### 5.1 Documentation (write first, keep in sync with the code)

* `README.md`: what the game is, how to run/build/test, controls, folder overview, links to the docs.
* `CLAUDE.md` (project level): project-specific rules only, never repeating the repo-root `CLAUDE.md`. Cover where config and data live, the sim/render boundary, the commands, and a checklist "How to add an operator / weapon / ability".
* `docs/SPEC.md`: the game design spec. It covers:
  * vision, pillars, core loop, round structure and game mode(s);
  * the operator/weapon/ability model, archetypes and example roster;
  * movement and gunplay feel requirements: pointer lock with raw input where supported, FOV and sensitivity settings, recoil, spread, hit markers, view-model sway;
  * bot behaviour;
  * map design principles: sightlines, flanks, verticality, spawn protection;
  * HUD and audio needs;
  * an explicit out-of-scope list.
* `docs/ARCHITECTURE.md`: layers, folder structure, data flow (input → commands → sim tick → render interpolation), module responsibilities, where each kind of state lives, how content is loaded, testing strategy.
* `docs/ROADMAP.md`: milestones, each with a measurable definition of done. Suggested order:
  * M1: gunplay, movement and 4 operators vs. bots on one greybox map;
  * M2: complete ability framework and round system;
  * M3: art pass;
  * M4: more operators and maps;
  * M5: destructible walls and surfaces;
  * M6: online multiplayer.

  Change the order if you have good reasons, and write down why.
* `docs/decisions/`: ADRs for the stack, physics, sim/render split, entity architecture and multiplayer strategy.
* `docs/ASSET_MANIFEST.md`: every external asset with creator, source URL, licence, local path and modifications. CC0 or explicitly redistributable assets only.
* `docs/PROJECT_STATE.md`: a dated progress log with handover notes, so a future session can continue without rediscovering anything.

### 5.2 Tech prototype (proves the core idea)

A small playable build that demonstrates the foundation. It is not the game.

* A greybox test range with proper lighting: directional light with shadows, a simple sky, readable surfaces. Primitives are fine here.
* A first-person controller: pointer lock, WASD, sprint, crouch, jump, fixed-tick movement with render interpolation, Rapier character collision.
* One hitscan weapon: fire rate, spread, simple recoil, ammo and reload, hit markers, damage numbers or health bars on targets, headshot detection through a separate hitbox.
* **Two operators loaded from `src/data/`**, one heavy anchor and one speedster, switchable with a key. The speed/damage trade-off must be directly noticeable in play.
* A debug overlay (FPS, tick rate, current operator stats), toggled with a key.
* `npm run balance` working on the prototype data.
* Vitest tests covering at least damage falloff, the TTK calculation and the ability resource model (cooldowns/charges).
* Playwright:
  * a screenshot script with fixed, named camera positions;
  * a smoke test: the game loads, `window.__gameReady` is set, there are no console errors, and a shot hits a target.
* The production build succeeds and runs from a subdirectory.

Assets are optional for the prototype. If you use any:

* take them from CC0 sources: Quaternius, Kenney, KayKit, Poly Haven, ambientCG. FTB4's manifest lists packs known to work, and Quaternius Universal Animation Library characters are good bot candidates;
* verify the licence and check that the asset renders in-engine before you rely on it;
* first-person arms rarely exist as CC0, so a floating weapon view model without arms is acceptable.

## 6. Explicitly out of scope for this task

Online multiplayer, accounts, progression/unlocks, monetisation, destructible environments, more than one map, implementing the full ability roster, art pass, matchmaking, anti-cheat. These belong in the roadmap, not in code.

## 7. Working rules

* For reversible, in-scope decisions: decide yourself, document the decision (ADR or `PROJECT_STATE.md`) and continue. Do not ask about naming, folder layout, tooling details or example operator themes.
* Pause only for credentials, payment, irreversible actions or genuine scope changes.
* Verify every claim before reporting: run the build, the tests, the balance script and the Playwright checks, and look at the screenshots yourself. If something failed or was skipped, say so plainly.
* Use subagents where work is genuinely parallel (asset/licence research, doc review). One owner keeps architecture and naming consistent.

## 8. Stop point and final report

When 5.1 and 5.2 are done and verified, **stop**. Do not start Milestone 1 feature work until the user has reviewed the spec.

Report concisely:

* what was built;
* key decisions and the reasons for them;
* open design questions for the user (at most 5, each with your recommendation);
* build, test and smoke-test results;
* exact commands to run the project;
* screenshot locations;
* known limitations;
* the proposed next step.

Begin now: read the FTB4 references, write the docs, then scaffold.
