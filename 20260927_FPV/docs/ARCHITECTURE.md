# Architecture

*Status: M1 as built (2026-09-30): the Phase 1 foundation plus bots, game modes and 5v5
elimination rounds ([ADR-0011](decisions/0011-bots-and-elimination.md)); M2's ability framework
(2026-09-30, [ADR-0012](decisions/0012-ability-framework.md)) and the Relay mode (2026-09-30,
[ADR-0013](decisions/0013-relay-mode.md)) as built. Decisions behind this document:
[`decisions/`](decisions/).*

## 1. Layers

```
┌─────────────────────────────── browser only ───────────────────────────────┐
│ src/client/   Three.js rendering · DOM UI · Web Audio · input · QA hooks   │
│               launch → Session (Sim + player + BotController) → mode host  │
│      reads ▲ sim state + events             │ writes: Commands, Controls   │
└────────────┼────────────────────────────────┼──────────────────────────────┘
             │                                ▼
┌────────────┴──────────── runs in browser AND Node ─────────────────────────┐
│ src/ai/       bots: perception · brain · aim · nav → Commands (as players) │
│ src/sim/      fixed-tick simulation · Rapier · modes · all gameplay state  │
│ src/balance/  TTK matrix, power budget (design tooling, uses sim helpers)  │
│ src/data/     operators · weapons · abilities · hitboxes · budget · levels │
│               (incl. nav graphs)                                           │
│ src/config/sim.ts   global rules: tick, physics, movement, gunplay, match, │
│                     bot tiers and tuning                                   │
└────────────────────────────────────────────────────────────────────────────┘
```

**Hard rule:** the simulation-side code — `src/sim/`, `src/ai/`, `src/data/`, `src/balance/`
and `src/config/sim.ts` (`BOUNDARY_FILES` in `eslint.config.js`) — must not import Three.js or
client code (including `config/client.ts`), must not touch the DOM or browser globals, must not
read wall-clock time and must not use `Math.random`. ESLint enforces it (`eslint.config.js`,
block "Simulation boundary"); `npm run lint` fails on a violation. Consequence: the
simulation, the bots and the balance tool run unchanged in Node — in Vitest today and on an
authoritative server later ([`NETWORKING.md`](NETWORKING.md)).

Dependency direction (arrows = "may import"):

```
client ──► ai ──► sim ──► data, config/sim
client ──► sim, data, config/client, config/sim
ai ──► data, config/sim
config/client ──► config/sim   (read-only, e.g. audio reach = bot hearing radii; never the reverse)
balance ──► sim (combat, abilities, math), data
tools/ ──► balance, data, config, client/launch.ts (pure)   (Node scripts)
```

`sim` never imports `ai`, `balance` or `client` (a second ESLint block enforces `ai`/`balance`).

### 1.1 The sim/ai boundary

- The simulation knows nothing about bots. A bot sees the sim only through **`SimView`**
  (`src/ai/types.ts`): read-only `state`, the `level` and `query`. `Sim` satisfies it
  structurally, so there is no sim → ai import; tests and the client pass the `Sim` itself.
- **`SimQuery`** (`src/sim/query.ts`, `Sim.query`, also `SimContext.query`) is the read-only
  world-question surface for bots, the sim's own ability rules (placement, area line of sight)
  and the client (placement ghost): `lineOfSight(a, b)` (no level geometry and no barrier
  between; characters and devices never block sight, `COLLISION_GROUPS.sightQuery`),
  `groundBelow(p, maxDrop)` and `surfaceAlong(origin, dir, maxDist)` (level geometry only,
  `levelQuery` — gadgets are not level) and `boxFree(center, halfExtents, yaw)` (nothing that
  blocks movement overlaps: level, barriers, capsules). It never mutates and is valid between
  steps: level probes see geometry that never moves, sight and free-box probes see barriers as
  of the last physics step.
- Besides `SimView`, the ai uses pure sim helpers (`stats.ts`, hitbox zone centres, `aimOf`,
  `commandLook`, `math.ts`, `rng.ts`, `modes/format.ts` incl. `pickAllowed`, `matchFrozen`, for
  abilities `placementPose`, `ballisticPitch`, `projectileGravity`, `canActivate`,
  `matchAbilityAllowed`, `isAbilitySupported`, and for Relay `relayOf`, `plantSiteFor`,
  `canDisrupt`) — never a method that changes state. A bot's output is a `Command`, the same
  record the keyboard produces, plus — only for Relay's operator picks — a `selectOperator`
  `ControlMessage`, the same one the select screen sends; every rule of movement, weapons,
  damage and picks stays in the sim. `match.test.ts` and `relay-bots.test.ts` assert that
  `commands()` and `controls()` leave `SimState` unchanged.
- **No wall-hacks by construction:** only `src/ai/perception.ts` reads other characters'
  entity fields. Brain and aim see `Contact`s and `TargetView`s; a true position leaves
  perception only for an enemy whose line of sight was confirmed that tick, or who is revealed
  to the bot's team by an ability (a `reveal` contact, ADR-0012 §8).

## 2. Folder structure

```
20260927_FPV/
├─ index.html                 app shell (canvas host, overlay roots, UI colours as CSS custom properties)
├─ src/
│  ├─ main.ts                 entry: boots the client
│  ├─ config/
│  │  ├─ sim.ts               global simulation rules (tick, secondsToTicks + isTimeUp, physics, movement,
│  │  │                       footsteps, gunplay, match format, elimination, Relay, range, playable
│  │  │                       operators + operatorPickLimit, ABILITY_RULES, bot tiers + AI tuning)
│  │  └─ client.ts            launch defaults, team colours, render, nav overlay, ability visuals, camera,
│  │                          view model, input bindings, settings schema, HUD, audio, loop limits, shots
│  ├─ data/                   balance + content SSOT (typed TS modules)
│  │  ├─ schema.ts            OperatorDef, WeaponDef, AbilityDef (+ GadgetTriggerDef, BotAbilityHint), EffectDef,
│  │  │                       HitboxProfileDef, LevelDef (+ VolumeDef, SiteDef, setupWalls), NavGraphDef
│  │  ├─ weapons.ts · abilities.ts · operators.ts · hitboxes.ts · budget.ts
│  │  ├─ levels/geometry.ts   shared greybox builders (stairs, wedge ramps, walls with openings, openingVolume,
│  │  │                       directions), extents
│  │  ├─ levels/range.ts      greybox test range (geometry, player spawn, `range` block with dummies)
│  │  ├─ levels/saltworks.ts  map #1 Saltworks (two floors, two sites, side spawn zones, facade openings = setup
│  │  │                       walls, SALTWORKS_LAYOUT)
│  │  ├─ levels/saltworks.nav.ts  Saltworks waypoint graph, hand-authored (built from SALTWORKS_LAYOUT)
│  │  └─ content.ts           lookups (getOperator, …), site helpers (siteAt, volumeExtent), validateContent()
│  │                          incl. level, nav and ability checks (abilityProblems)
│  ├─ sim/
│  │  ├─ sim.ts               Sim: create(level, seed, mode), spawnCharacter, control(), accepts(), step(commands),
│  │  │                       query; createSimState
│  │  ├─ query.ts             SimQuery: lineOfSight, groundBelow, surfaceAlong, boxFree (read-only; bots,
│  │  │                       ability rules, placement ghost, tests)
│  │  ├─ types.ts             SimState (incl. match, gadgets, projectiles, areas), entity components, SimEvent,
│  │  │                       ControlMessage
│  │  ├─ command.ts           Command, button bits, command helpers (commandLook, clampPitch)
│  │  ├─ context.ts           SimContext passed to every system and mode (state, level, physics, query, event
│  │  │                       sink); allocateId (the one id space), characterById, ownerOf
│  │  ├─ entities.ts          character creation (addCharacter), operator kit (re)load, respawnAt (the one
│  │  │                       respawn path), clearWorldObjects, WEAPON_SLOTS
│  │  ├─ math.ts · rng.ts     vector/angle helpers (wrapAngle, angleDelta, withoutNegativeZero — no −0 in state),
│  │  │                       seeded PRNG (deriveSeed streams)
│  │  ├─ stats.ts             effective stats, weapon-in-hand accessors, canFire, weaponBlockedBy,
│  │  │                       footstepLoudness, channelProgress, gadgetCount, isRevealedTo, shieldAmount
│  │  ├─ hitbox.ts            hitbox layout per stance, zone centres, bodyDistance, capsule dimensions,
│  │  │                       CAPSULE_REST_GAP
│  │  ├─ physics/             Rapier world (character move, ground, bullets, sight and surface probes, gadget
│  │  │                       colliders, setup walls, FLOOR_MIN_NORMAL_Y), collision groups
│  │  ├─ systems/             movement (+ footsteps), weapons, abilities (dispatcher, isAbilitySupported),
│  │  │                       health (shields, death clean-up) — run in fixed order (§3)
│  │  ├─ combat/              damage/falloff/TTK/mitigatedDamage, spread, recoil (pure functions)
│  │  ├─ abilities/           the ability framework (ADR-0012):
│  │  │  ├─ resource.ts       resource models (pure)
│  │  │  ├─ activation/       one controller per activation kind (instant + passive, hold, toggle,
│  │  │  │                    placeable, thrown); spend.ts (the one spend path + mode gate)
│  │  │  ├─ effects.ts        HANDLERS registry (+ modifier, dash), applyEffects, activation × effect table
│  │  │  ├─ handlers.ts       damage, heal, shield, barrier, reveal, areaDenial, disableGadgets
│  │  │  ├─ targeting.ts      EffectContext, affectedCharacters / affectedGadgets, canHarm, addModifier
│  │  │  ├─ interrupt.ts      endActivity / endAllActivities (leaf, so health.ts can call it)
│  │  │  ├─ gadgets.ts        gadgetShape, spawn / damage / destroy / remove gadgets
│  │  │  ├─ placement.ts      placementPose (pure over SimQuery: sim, client ghost, bots)
│  │  │  ├─ triggers.ts       gadgetSystem (arming, disabled countdown, aura, proximity, timer)
│  │  │  ├─ projectiles.ts    spawnProjectile, projectileSystem, projectileGravity, ballisticPitch
│  │  │  └─ areas.ts          spawnArea, areaSystem, areaEffectOf, applyAbilityDamage
│  │  └─ modes/               mode.ts (ModeRules), index.ts (MODES registry, matchFrozen, matchAbilityAllowed,
│  │                          matchSetupWallsUp, operatorChoices), range.ts, elimination.ts, relay.ts (Relay
│  │                          rules + plantSiteFor, canDisrupt, uplinkProgress, isReconAbility), rounds.ts
│  │                          (the shared round flow), format.ts (sides, match format, side spawns, round
│  │                          result, default roster, pick rule — pure)
│  ├─ ai/
│  │  ├─ types.ts             the contract: SimView, SteppableSim, BrainSpec, BotSlot, BotController, StepMatch
│  │  ├─ controller.ts        createBotController (every bot of a match), stepMatch (one match tick)
│  │  ├─ brain.ts             combat-bot state machine, team round plan, tactical map (derived from nav)
│  │  ├─ objective.ts         Relay duties (objectiveDuty: goto, plant, guard, disrupt; ObjectivePlan per team)
│  │  ├─ picks.ts             Relay operator picks (botPicks: seeded, legal by pickAllowed)
│  │  ├─ perception.ts        sight scan, hearing, contact memory, TargetView (the only reader of enemy state)
│  │  ├─ intel.ts             team callouts (TeamIntel)
│  │  ├─ aim.ts               aim model per tier (reaction, error, turn rate, recoil compensation, fire gate)
│  │  ├─ abilities.ts         ability use from the data's usage hints (abilityStep, called at the end of act())
│  │  ├─ dummy.ts             range-dummy brain (static / strafe)
│  │  └─ nav/                 graph.ts (NavGraph from LevelDef.nav), astar.ts (findPath),
│  │                          steer.ts (path following, stuck recovery)
│  ├─ balance/                ttk matrix, power budget, report formatting (pure)
│  └─ client/
│     ├─ app.ts               composition root: frame loop, camera (incl. death camera), view model, HUD, audio, QA host
│     ├─ launch.ts            launch options from the URL (`?mode=&level=&tier=&seed=`), levelsForMode, launchSearch
│     ├─ session.ts           one match: Sim + player + BotController, advanced through stepMatch
│     ├─ modes/               ModeHost + HostUi contract (host.ts), MODE_HOSTS (index.ts), rangeHost.ts,
│     │                       sideHost.ts (shared by the round modes), eliminationHost.ts, relayHost.ts
│     ├─ loop.ts              fixed-step accumulator
│     ├─ dom.ts               DOM helpers
│     ├─ input/               pointer lock, keyboard/mouse → Command, QA-held buttons
│     ├─ render/              scene, lights+sky, level meshes (+ setup walls), actors (team bands, shield shell), view model,
│     │                       effects, abilities.ts (AbilityViews: gadgets, projectiles, areas, rings, ghost,
│     │                       flashes), navDebug.ts
│     ├─ ui/                  HUD (+ damageIndicator.ts, ability slots), roundHud.ts, killFeed.ts, world labels,
│     │                       revealMarkers.ts, operatorSelect.ts, objectiveHud.ts (Relay), menu, settings, debug
│     ├─ audio/               sfx.ts (synthesised sounds, positional voices), spatial.ts (pure distance maths)
│     └─ qa.ts                window.__gameReady / __shotNames / __setShot / __stats / __qa hooks
├─ tests/
│  ├─ unit/                   Vitest (runs in Node, incl. Rapier-backed sim and bot tests; §10)
│  └─ e2e/                    Playwright against the production build: smoke.spec.ts, relay.spec.ts, support/page.ts
├─ tools/                     balance.ts, gen-docs.ts, screenshot.mjs, serve-dist.ts, lib/ (generated-docs, deploy)
└─ docs/                      SPEC, ARCHITECTURE, ROADMAP, NETWORKING, PROJECT_STATE, decisions/, generated/, screenshots/
```

## 3. Data flow per frame

```
 mouse/keys ──► PlayerInput ──(look angles every frame)──► camera
                      │ sample once per tick
                      ▼
               Command {tick, moveX, moveZ, yaw, pitch, buttons}      (the player's)
                      │
  frame: accumulator += dt ── while acc ≥ TICK_DT (max N per frame; once the match runs):
                      ▼
  Session.step(cmd) → stepMatch(sim, bots, {player: cmd})            (src/ai/controller.ts)
    a. bots.controls(N)   Relay operator picks, queued after the host's (usually none);
       bots.commands(N)   reads the state after tick N−1 → one Command per living bot
    b. merge the player's command (and QA overrides) over them
    c. Sim.step(commands)                                            (order: ADR-0012 §6)
         1. controls     (queued ControlMessages the mode accepts: operator select, teleport)
         2. mode rules   (ModeRules.tick: range respawns · elimination / Relay phases, Relay's
                          uplink channel, result, round reset → clearWorldObjects + respawnAt);
                          then the setup walls follow the match (PhysicsWorld.setSetupWalls)
         3. store prev* values for interpolation (characters, projectiles' prevPos);
            ModeRules.filterCommand per living character
         4. abilities    (first expireEffects for every living character — modifiers/shields/
                          reveals, so durations never depend on entity ids — then per living
                          character: resource tick, activations → gadgets placed, projectiles
                          launched, instant effects;
                          returns the command without the buttons abilities consumed)
         5. gadgets      (triggers.ts: arming, disabled countdown, aura, proximity, timer)
         6. areas        (areas.ts: damage over time, stat modifiers, expiry)
         7. movement     (look, stance, sprint, accel, jump, dash → PhysicsWorld.move; footsteps;
                          the KCC sees barriers indexed by the last physics step)
         8. physics step (pending gadget removals, then Rapier world.step — indexes this tick's
                          colliders, hitboxes and new gadgets)
         9. weapons      (swap, ADS, reload, trigger buffer, fire → spread → raycasts → damage to
                          characters and gadgets → deaths)
        10. projectiles  (sweeps see the same colliders; bursts → effects, areas)
        11. lastButtons = the raw (unfiltered) buttons
         → this tick's events
    d. bots.observe(events)   hearing, callouts, own hits and kills, spawns
                      │ events returned to the client
                      ▼
  ModeHost.onEvents, then App handlers (HUD, kill feed, damage indicator, audio, look re-sync)
  render(alpha = acc / TICK_DT): positions, stance, recoil, ADS lerp(prev, curr, alpha);
  local camera angles = latest input look + interpolated aim offset (dead: death camera, §14)
```

- **One match tick, one implementation:** `stepMatch()` is shared by the client `Session` and
  the tests. Bots decide on the state after the previous tick, exactly like the player's input
  (one tick of latency for both); their line-of-sight queries see the colliders of the last
  `physics.step()`.
- **Commands** are small, serialisable, per tick and per controlled entity. Buttons are held
  state (bit mask); the simulation derives press edges by comparing with the previous
  command, so a lost or duplicated command cannot create phantom presses. Missing commands
  mean "no input".
- **ControlMessages** are rare, reliable, non-tick-critical requests (select operator,
  teleport — the latter for QA/screenshot shots). They are applied at the start of the next
  tick if the mode accepts them (`ModeRules.acceptsControl`; elimination: operator select only
  in the pre-round freeze; Relay: only in operator select, a playable operator within the
  team's pick limit) and dropped otherwise. `Sim.accepts(msg)` asks the same rule read-only
  (the select screen disables refused cards with it). Online they become reliable RPCs.
- **Spawns**: initial spawns go through `Sim.spawnCharacter()` at setup (called by the mode
  host), outside `step()`; their events — plus a round mode's round-1 `phase` event, emitted by
  `Sim.create` — are collected with `Sim.drainEvents()`, handed to the bots and handled by the
  app like a tick's. Respawns and round resets are mode rules (step 2) through `respawnAt()`.
- **Look after a spawn**: `Command` look angles are absolute. A (re)spawn records
  `spawnTick`, and that tick's command look is ignored, so the spawn facing holds; the `spawn`
  event carries yaw and pitch, from which controllers adopt it (the client re-syncs the
  player's input look; a bot resets on its own spawn).
- **SimEvents** are data records emitted during a tick (`spawn` with the facing it set,
  `operatorChanged`, `shot`, `hit` with `sourcePos` (the shooter's eye at fire time, or an
  ability's origin), `cause` and `absorbed`, `impact`, `kill` with `cause` (weapon or ability),
  `reloadStart`, `reloadEnd`, `dryFire`, `weaponSwap`, `ability`, `abilityEnd`, `abilityFailed`,
  `gadgetPlaced`, `gadgetHit`, `gadgetDestroyed`, `burst`, `revealed`, `shieldGained`,
  `shieldBroken`, `healed`, `footstep`, `phase`, `roundEnd`, `matchEnd`, `uplink` (plant or
  disrupt start, cancel, complete); fields in ADR-0012 §7 and ADR-0013 §12).
  They replace a global event bus (ADR-0006) and are the only way the bots learn about sounds
  and hits. What state already says is not an event (projectile launch, area start/end, reveal
  end, placing started/cancelled).

## 4. Where state lives

| State | Owner | Notes |
| --- | --- | --- |
| Entity positions, velocities, look, stance | `sim` (`SimState.entities`, characters only) | plain objects; `prev*` copies for interpolation |
| Health, armour, ammo, cooldowns, charges, modifiers, shields, reveals | `sim` | derived stats computed on demand in `sim/stats.ts` |
| Ability slots: resource, running activity (channel, on, placing); buttons an ability consumed | `sim` (`CharacterEntity.abilities[].active`, `suppressedButtons`) | reset by `loadOperator` (spawn, round reset, operator change) |
| Gadgets, projectiles, areas | `sim` (`SimState.gadgets` / `projectiles` / `areas`) | one typed list each, not in `entities`; shape, radius, damage and stats come from data via `abilityId` (+ `effectIndex`), never copied; cleared by `clearWorldObjects` at a round reset |
| Entity ids | `sim` (`SimState.nextId`, `allocateId`) | one id space for characters and world objects, so physics side tables and events never collide |
| Carried weapons (ammo per slot) vs. the weapon in hand (handling state, swap timer, trigger buffer) | `sim` (`CharacterEntity.weapons` / `activeSlot` / `weapon`) | see §5.1 |
| Footstep stride, spawn tick | `sim` (`CharacterEntity.strideProgress`, `spawnTick`) | §3, §8 |
| Match state (mode, phase, round, score, attacking team, attack zone; Relay: the running plant/disrupt channel and the planted uplink) | `sim` (`SimState.match`) | written only by the mode's rules (§12); client and bots read it |
| Rapier bodies/colliders | `sim/physics` side tables keyed by entity id | *not* in `SimState`; rebuilt from state + level data (setup walls: from `matchSetupWallsUp(match)`) |
| RNG | `sim` (`SimState.rng`) | seeded, single stream for gameplay randomness |
| Bot memory: contacts, aim, nav path, state machine (`BotState`); team plans and callouts (`TeamPlan`, `TeamIntel`) | `ai` (the bot controller) | **never in `SimState`**: the sim must not know ai types, and it is hidden information that must never be replicated (ADR-0011 §3). Plain data; own RNG streams (`deriveSeed(seed, id)`), never `SimState.rng` |
| Runtime nav graph, tactical map | `ai` (built once per controller from `LevelDef.nav`) | derived and read-only, never serialised |
| The match on this page (Sim, player entity, bots) | `client/session.ts` | a mode or level change reloads the page |
| Launch options (mode, level, tier, seed) | `client/launch.ts`, from the URL | §14 |
| Round-HUD presentation (last result, killer, side swap); Relay's select screen and objective HUD | the client mode host | derived from state and events, never fed back |
| Latest look angles (local player) | `client/input` | the *intent*; the sim receives it via commands; re-synced from the player's `spawn` event |
| Settings (FOV, sensitivity, volume, bot difficulty, …) | `client/ui/settings` | schema + defaults in `config/client.ts`; persisted in `localStorage` |
| Transient visuals (hit markers, damage numbers, damage arcs, kill feed, impact marks, burst flashes) | `client` | created from SimEvents, never fed back |
| Ability views, reveal markers, area loops | `client` (`AbilityViews`, `RevealMarkers`, `Sfx.areaLoops`) | diffed against the sim state by id every frame |

## 5. Entity architecture

Plain component objects, not a full ECS (ADR-0004). An entity is a record with an `id`,
a `kind` and component fields (`kinematics`, `health`, `weapon`, `abilities`, …). Systems
are functions `(sim, commands) → void` run in a fixed order. Reasons: tens of entities, not
tens of thousands; snapshots for netcode are trivial to serialise; the code stays readable.
World objects of abilities (`GadgetEntity`, `ProjectileEntity`, `AreaEntity`) are records of the
same kind in their own typed lists, so every system iterates exactly what it handles
(ADR-0012 §2).

### 5.1 Weapon state

A character's weapon state is split by lifetime (`src/sim/types.ts`):

- `weapons: CarriedWeapon[]` — one per slot: weapon id, magazine, reserve. This is what
  survives holstering. The slots are defined once in `WEAPON_SLOTS` (`src/sim/entities.ts`):
  index = position in `weapons`, the operator `loadout` key it is filled from (first option)
  and the `Command` button that selects it (`selectPrimary`, `selectSecondary`; `swapWeapon`
  cycles to the next slot).
- `activeSlot` — the weapon in hand; during a swap, the weapon being drawn.
- `weapon: WeaponState` — handling state of the weapon in hand only: fire cooldown, trigger
  buffer, reload, bloom, recoil-pattern index, recoil aim offset, ADS and the swap timer
  (`swapRemaining`). A swap resets it (keeping recoil offset and ADS so the camera eases
  instead of snapping), so nothing of one weapon's handling leaks into the next.

The weapon in hand is always read through `src/sim/stats.ts`: `activeWeapon(e)` returns its
`CarriedWeapon`, `weaponOf(e)` its `WeaponDef`, `swapProgress(remaining)` the 0…1 swap progress
for the view model and HUD (timing from `GUNPLAY.weaponSwapSeconds`). Other code walks
`weapons` only to cover every slot (holstered HUD line, range reserve refill). The swap rules
live in `src/sim/systems/weapons.ts`, run first in the weapons step and emit `weaponSwap`.

**Firing rules.** Whether the weapon in hand is up is one rule, `canFire(e)` in `stats.ts`
(not swapping, not sprinting, past `GUNPLAY.sprintOutTime`, not reloading); the weapons system
and the HUD crosshair read it. Ammo and the fire cadence are separate checks. A fire press the
weapon cannot answer yet is not lost: `WeaponState.triggerBuffer` keeps it pending while the
trigger is held and for `GUNPLAY.triggerBufferSeconds` after release, and the first tick the
weapon can fire answers it exactly once (a shot, subject to the cadence, or a dry fire). A
pending press also keeps a sprint from starting, so a click out of a sprint gets its shot.

## 6. Content loading

- Content is typed TypeScript modules in `src/data/` (ADR-0008). They are bundled, so there is
  no runtime fetch and no loading failure mode for balance data.
- `validateContent()` checks referential integrity and value ranges; `Sim.create()` runs it
  and refuses to start on invalid content; a unit test runs it too. `Sim.create()` also asks
  the mode whether the level can host it (`ModeRules.validateLevel`) and throws otherwise.
- Levels are data (`LevelDef`): the simulation builds Rapier colliders and the client builds
  meshes from the same definition, so collision and visuals cannot drift apart. A level has
  `boxes`, a free-play `playerSpawn` and optional parts per use: `spawnZones` (id, name,
  `side` ∈ `SIDES` = attack/defend, one point per player of a team — `MATCH.teamSize` —
  spawns belong to a side because teams swap sides), `sites` (objective volumes), `setupWalls`
  (Relay's movement-only boundary in setup; `VolumeDef`, the shape sites share), `nav` (the
  bot waypoint graph) and a `range` block (`firingLineZ`, dummies) that only the test range
  has. `validateContent()` checks every registered level (spawns, sites and setup walls inside
  the geometry, unique ids, both sides present, full zones).
- Level files build their boxes with the shared helpers in `src/data/levels/geometry.ts`
  (`stairs`, `wedgeRamp`, `wall` with openings, directions, shared prop sizes, `levelExtent`);
  they only emit plain `BoxDef`s, so the one-definition rule above holds. Saltworks defines
  each facade's openings once: the facade walls leave them open and `openingVolume` turns the
  same openings into the setup walls.
- **Nav graphs** (`NavGraphDef`: nodes with a feet position, optional tags `cover`/`hold`/
  `patrol` and a `watchYawDeg` for holds; links of kind walk/jump/crouch, optionally one-way)
  are hand-authored level data. Saltworks' graph lives in `levels/saltworks.nav.ts` as a
  function of `SALTWORKS_LAYOUT`, so the ends of stairs, ramp, landing and catwalk drop derive
  from the geometry's anchors (and `saltworks.ts` imports it without a cycle).
  `validateContent()` checks it (unique ids, known nodes, no self or duplicate links, holds
  have a direction, strongly connected honouring one-way links, link length ≤ `AI.nav.maxLinkM`,
  every spawn point near a node, a node in every site, nodes inside the geometry);
  `nav.test.ts` checks it against the real colliders. Site membership is derived from `sites`
  (`siteAt`), never tagged. The client's nav overlay draws the same data (§9).
- Hitbox layouts are data; the simulation builds colliders and the client builds the greybox
  character visuals from the same layout function (`sim/hitbox.ts`).
- External assets (none shipped yet) live under `public/assets/` and must be listed in
  [`ASSET_MANIFEST.md`](ASSET_MANIFEST.md).

## 7. Configuration

| File | Contains | Imported by |
| --- | --- | --- |
| `src/config/sim.ts` | tick rate, gravity, capsule and eye heights, character-controller tuning (`CHARACTER`, incl. `groundClearance`), movement feel and footsteps (`MOVEMENT`), gunplay rules (`GUNPLAY`: air/crouch spread, sprint-out time, weapon swap time, trigger buffer, friendly fire), match rules (`MATCH.teamSize` and `playerTeam`, `MATCH_FORMAT`, `ELIMINATION`, `RELAY`: phase timings, plant/disrupt times and radius, attack zone, setup recon effects), range-mode rules (incl. `RANGE_MODE.allOperators`), `PLAYABLE_OPERATORS` and `operatorPickLimit()`, global ability rules (`ABILITY_RULES`: sustain, line of sight, placement, gadgets, barriers, thrown, areas), bot tiers and tuning (`AI_TIERS`, `AI`: dummies, tiers, perception, hearing incl. `abilityRadiusM` and `uplinkRadiusM`, brain, combat, nav, `abilities`, `relay`), `secondsToTicks` and `isTimeUp` (the one "time is up" rule of every countdown) | sim, ai, client, tests |
| `src/config/client.ts` | launch defaults and URL parameter names (`LAUNCH`, incl. the default mode), mode texts, team colours (`TEAM_STYLE`), renderer/shadows/sky/fog, nav overlay, ability visuals (`ABILITY_VISUALS`), setup-wall look (`SETUP_WALL_STYLE`), camera, view model (incl. `VIEWMODEL.lowered`), key bindings (incl. `interact`), settings schema, HUD (incl. damage indicator, kill feed, round HUD, `HUD.abilities`, `HUD.reveal`, `HUD.relay`), audio (incl. `AUDIO.spatial`, `AUDIO.ability`, `AUDIO.uplink`, voice cap), loop limits, screenshot shots and staging (`SHOT_STAGING`, `RELAY_SHOT_SEED`), version | client, tools (docs:gen, shots), e2e tests |
| `src/data/*` | every per-content balance number; levels and their nav graphs | sim, ai, client (read-only), balance, tools |

## 8. Physics

Rapier (`@dimforge/rapier3d-compat`, WASM inlined as base64 — no separate `.wasm` request,
so it works from any sub-directory; verified by the e2e smoke test). ADR-0002.

- One kinematic, position-based rigid body per character. Its colliders:
  - a **movement capsule** (collision group `COLLISION_GROUPS.mover`) moved by Rapier's
    kinematic character controller (autostep, slope limit) through `PhysicsWorld.move()`;
    Rapier's snap-to-ground is **off** (see below);
  - **hitbox sensors** (group `COLLISION_GROUPS.hitbox`) for head/torso/limbs, positioned
    from the hitbox layout for the current stance.
- Static level geometry: fixed colliders (group `COLLISION_GROUPS.static`).
- Gadgets (ADR-0012 §4): one fixed collider per gadget from `gadgetShape` — a solid cuboid for a
  barrier (`COLLISION_GROUPS.barrier`), a sensor ball for any other device
  (`COLLISION_GROUPS.device`). `PhysicsWorld.addGadget` / `removeGadget`; a removed gadget is
  disabled at once and its collider removed at the start of the next `step()`, when no query
  runs.
- Setup walls (Relay, ADR-0013 §4 and §12): one fixed cuboid per `LevelDef.setupWalls` volume
  (`COLLISION_GROUPS.setupWall`), seen only by movement queries — bullets, projectiles and sight
  pass. `PhysicsWorld.setSetupWalls(up)` follows `matchSetupWallsUp(match)`, called by `Sim`
  after `initialMatch` and after step 2 of every tick; the colliders are created on the first
  raise (even disabled ones changed Rapier's handles and broad phase, so other modes'
  matches diverged) and every toggle runs one `world.step()`, so this tick's movement already
  meets or passes them. The state alone decides them, so a snapshot needs nothing extra.
- Groups are defined in `src/sim/physics/groups.ts`: `static`, `mover`, `hitbox`, `barrier`,
  `device`, `setupWall`, `moveQuery` (controller, head-room and free-box queries: level,
  capsules, barriers, setup walls),
  `bulletQuery` (bullets and projectile sweeps: level, hitboxes, barriers, devices),
  `sightQuery` (level and barriers — `SimQuery.lineOfSight`, §1.1) and `levelQuery` (level
  geometry only — ground and placement-surface probes).
- Hitscan: `castBullet` (`world.castRayAndGetNormal` with `COLLISION_GROUPS.bulletQuery`),
  excluding the shooter's body. A collider-handle → `RayTarget` table (character + zone, or
  gadget) maps hits; a pellet that hits a gadget stops there.
- Order matters: movement → `world.step()` → weapons → projectiles, so rays and sweeps see this
  tick's hitboxes and gadgets; a gadget placed in the abilities step blocks bullets in the same
  tick and movement from the next.

**Character movement** (`movementSystem` + `PhysicsWorld.move` / `onWalkableGround`):

- **Velocity is the intended motion.** After the controller move, only the part of the
  velocity that pushes into a wall is removed. `move()` reports walls as horizontal normals and
  leaves out steps the character can climb onto (a check mirroring Rapier's autostep) and
  walkable slopes, so climbing costs distance, not speed, and no speed builds up against a
  wall (you stop, or slide along it).
- **No gravity on walkable ground.** `onWalkableGround()` is true when the capsule rests on a
  surface of at most `CHARACTER.maxSlopeClimbDeg` (as a normal: `FLOOR_MIN_NORMAL_Y`, which
  placement and resting projectiles share), or on a stair nose with walkable ground
  within step-down reach right under the feet (the stair-edge rule). Standing there, the move
  follows the ground; on a ledge overhang, a too-steep slope or in the air gravity acts.
- **Settling replaces snap-to-ground.** A standing move then settles onto the ground within
  `CHARACTER.snapToGround` (down slopes and steps, back from a hop), except while climbing a
  step. The capsule rests `CAPSULE_REST_GAP` (= `controllerOffset` + `groundClearance`,
  `sim/hitbox.ts`) above the ground and the capsule layout is offset by the same gap, so the
  feet touch the floor exactly and floor sweeps never start at the controller offset (Rapier
  reads noisy normals there: dead stops and centimetre hops).
- **Dash**: a dash overrides the velocity for its duration, covers exactly its distance and
  ends with at most top speed horizontally and no upward speed — an upward dash (Updraft)
  peaks where it ends.
- Standing up checks head-room for the full standing capsule (`fits`). Sprint only *starts*
  on the ground; one started there carries on through a jump or fall.
- Footsteps: every `MOVEMENT.footsteps.strideM` of grounded horizontal travel the movement
  system emits a `footstep` event with `footstepLoudness(e)` (`stats.ts`: `footstepVolume`
  modifiers × sprint × crouch factors); airborne travel counts nothing.

## 9. Rendering

Three.js `WebGLRenderer`, ACES tone mapping, sRGB output, PCF shadows (`PCFShadowMap`) from one directional
sun whose direction also drives the procedural sky (`Sky` addon) and the image-based ambient
light (PMREM of the sky). Level surfaces use procedural dev textures (1 m grid) with world-space
UVs. The view model renders in a second pass with its own camera and cleared depth.

- **Characters** are the greybox hitbox set plus an unlit torso band in the team colour as
  the local player sees it (`TEAM_STYLE`; the HUD reads the same colours as the CSS properties
  `--ally` / `--enemy`, set from it at boot). The local player's actor is hidden, not skipped.
- **View model** (`render/viewmodel.ts`, tuning in `VIEWMODEL`): look-lag sway, one bob dip
  per footstep stride (the sim's `MOVEMENT.footsteps.strideM`, so bob and step sounds share a
  cadence) and a landing dip, all shaped by the operator's `presentation.weightClass`
  (`VIEWMODEL.weightClasses`); recoil kick scaled by the camera kick the shot applied; a
  sprint pose that is fully out within `GUNPLAY.sprintOutTime`, exactly when the weapon may
  fire again; hip and ADS depth derived per weapon from its length (`hipRearDepth`,
  `adsEyeRelief`); lowered while `weaponBlockedBy(player)` (channel, placing;
  `VIEWMODEL.lowered`).
- **Abilities** (`render/abilities.ts`, `AbilityViews`, looks in `ABILITY_VISUALS`): diffs
  `state.gadgets` / `projectiles` / `areas` by id every frame (pooled meshes). Barrier boxes
  from `gadgetShape` and device balls in the owner's team colour, greyed while disabled;
  projectiles interpolated `prevPos → pos`; areas as disc + ring at the data radius
  (`areaEffectOf`), for everyone; trigger/aura rings for the local team's gadgets only; a
  channel ring (`channelProgress`); burst and destruction flashes from events; the placement
  ghost at `placementPose(sim.query, player, ability, input look)` — the same rule the sim
  confirms with. Shields are a translucent shell in `render/actors.ts`. Visibility rules:
  SPEC §16.
- **Setup walls** (`render/level.ts`, look in `SETUP_WALL_STYLE`): built hidden from the same
  `LevelDef.setupWalls` as the colliders, as translucent fills with outlines; the App passes
  `matchSetupWallsUp(match)` to `LevelView.setSetupWalls` every frame.
- **Nav overlay** (`render/navDebug.ts`, `NAV_DEBUG`): draws `LevelDef.nav` from the data (not
  the ai's runtime graph) through walls — nodes by tag, links by kind, one-way links marked.
  It toggles with the debug overlay; the `nav_overview` shot shows it.

## 10. Testing strategy

| Layer | Tool | What |
| --- | --- | --- |
| Pure logic | Vitest | damage falloff, zone/armour pipeline, shots-to-kill, TTK incl. reloads, spread, recoil pattern, ability resource model, match-format helpers, A* on toy graphs, the aim model, launch-URL parsing, spatial-audio maths |
| Content | Vitest | `validateContent()` incl. level, nav and ability validation, every operator inside the power-budget band, every ability supported (`isAbilitySupported`), generated docs up to date |
| Simulation | Vitest + Rapier in Node | movement and collision, gunplay, weapon swap, trigger buffer, respawn facing, every activation and effect kind, gadgets, projectiles, areas, every roster ability end to end, `SimQuery`, footsteps, elimination and Relay rounds (phases, picks, setup walls, plant/disrupt, every round result), replay determinism, Saltworks floors and nav graph against real colliders |
| Bots | Vitest + Rapier in Node | perception (incl. reveals, ability hearing), aim, steering, ability use per usage hint, Relay picks and objective duties, and whole matches through `stepMatch` on the real `Sim`; determinism per seed; `commands()` and `controls()` never write state |
| Architecture | ESLint | simulation boundary (no Three.js/DOM/`Math.random` in `src/sim`, `src/ai`, `src/data`, `src/balance`, `src/config/sim.ts`); `src/sim` never imports `src/ai` or `src/balance` |
| Integration | Playwright (`tests/e2e`) | production build served from a sub-directory: range (incl. a gadget placed through the Command path), the default page (Relay's operator select), elimination, and a scripted Relay round (select → setup → plant → uplink → round end) |
| Visual | `npm run shots` | named camera positions and staged match moments per launch → `docs/screenshots/`; a human looks at them |

Which file proves what (`tests/unit/` unless noted; "real Sim" = Rapier-backed in Node):

| File | Proves |
| --- | --- |
| `sim.test.ts` | movement (landing, feet exactly on the floor, wall stop and slide without speed build-up, per-operator top speeds, sprint forward only and started only on the ground, crouch head-room); hitscan zones, kill and range respawn, `hit.sourcePos`, no friendly fire; fire rate, reload, recoil; weapon swap; trigger buffer (a click out of a sprint fires once, a press during a swap, never faster than the cadence); respawn facing (range and round reset); abilities (Slipstream, Brace, Updraft peaks at its distance, Lightfoot); operator switch; replay determinism |
| `gunplay.test.ts` · `damage.test.ts` · `resource.test.ts` | spread, recoil pattern, seeded RNG, angle helpers; falloff, damage pipeline, shots/time to kill; ability resource models (pure) |
| `content.test.ts` | content validation (incl. ability rules: triggers, surfaces, barriers, bot hints, fuse vs. flight limit), archetype coverage, every ability compatible and supported, power-budget band |
| `abilities-core.test.ts` | gadget colliders (barriers block walking, standing up, bullets and sight; devices stop bullets only; removal without Rapier errors), damage pipeline (mitigation → shields → health, `kill.cause`), world objects (one id space, death and round-reset clean-up, operator change), dispatcher contract (input suppression, interrupts, mode gate), the activation × effect table |
| `effects.test.ts` | one block per effect kind through the effect registry on a real `PhysicsWorld` (damage, heal, shield, reveal, areaDenial, disableGadgets, barrier) plus round reset |
| `channel.test.ts` | `hold` (Sonar Pulse: spend, weapon block, linear progress, release/maxDuration/death, cooldown from the end) and `toggle` (Set Piton: on/off, sustained modifier, cooldown after off) |
| `gadgets.test.ts` | `placementPose` cases, the placeable activation (open, confirm, cancel, refuse, no weapon shot from a confirm), triggers (none, aura, proximity, timer, arming, disabled) |
| `projectiles.test.ts` | throws along the crosshair, flight on the closed-form arc, impacts, landing and resting, fuses, flight limit, `ballisticPitch` (pure) |
| `roster.test.ts` | every roster ability end to end through Commands on the real Sim (one case per id; a missing id fails); an elimination round reset clears gadgets (and colliders), projectiles and areas |
| `replay.test.ts` | a scripted ability round (place, throw, channel, heal, reveal, kill, reset) recorded as seed + inputs in ADR-0014's recording shape, replayed (in memory and via JSON) to an identical state and event stream; the digest separates −0 and non-finite values |
| `bot-abilities.test.ts` | one scenario per usage hint (engage, escape, hold, scout, support, flush, never) through `stepMatch`; every operator plays its hints without refused presses and `commands()` never writes state; `abilityReach` |
| `levels.test.ts` | level data (registration, sites, spawn zones, footprint, climbable steps and slopes, broken data reported); spawns, Saltworks floor connections and the range movement course on the real Sim |
| `query.test.ts` | `SimQuery` line of sight (walls block, characters never) and ground probe; zone centres; `Sim` satisfies `SimView`; `wrapAngle` / `angleDelta` / `deriveSeed`; footstep events (cadence per stride, loudness per operator and move state, none while standing or airborne) |
| `elimination.test.ts` | mode registry; format helpers (round result, side swap, overtime coin flip, default roster); real-Sim match: side spawns, phase clock and freeze, operator-select window, elimination by aimed fire and reset to a full kit, timeout and mutual wipe → defenders, swap + overtime + `matchEnd` freeze, determinism per seed |
| `relay.test.ts` | Relay registry and `validateLevel`; phase order and clocks; look-only select; in setup the attackers frozen with only recon abilities (`isReconAbility`), defenders stopped by a setup wall that is gone in the engagement; picks within the limit, refused over it / not playable / outside select, `Sim.accepts` agrees, auto-pick at the end of select; plant start → complete → uplink, cancels (release, death, leaving the site) lose the progress, no plant outside a site or by a defender, a channeller neither moves nor fires; every round result of ADR-0013 §6; swap, overtime and `matchEnd`; determinism per seed |
| `relay-bots.test.ts` | bot Relay play through `stepMatch`: attackers plant and guard; defenders rotate on a heard plant and disrupt; setup (no attacker ability, posts at both sites, a `hold` gadget placed); a full bot-only match to `matchEnd` (no stuck bot, no refused press, `controls()`/`commands()` never write state, controller cost); determinism; `holdsChannel` |
| `nav.test.ts` | nav validation errors, A* and `nearest()` on toy graphs, the Saltworks graph against real colliders (ground, head-room, clear links), every spawn point routes to both sites |
| `nav-walk.test.ts` | steering on the real Sim: Saltworks routes with the slowest operator, hall stairs and catwalk drop, every link from a standstill, crouch and jump links on the range course, stuck recovery stages, `steer()` output, determinism |
| `perception.test.ts` | sight (never through walls, view cone, near awareness, reaction timer and re-acquire grace, no true position without line of sight), hearing (gunshots, footsteps × loudness, damage contacts, teammates ignored, forgetting on kill and new round), memory expiry, callout delay, ray budget; reveal contacts (exact, not visible, rank), ability hearing, no contact from ability hits |
| `aim.test.ts` | aim model, pure (reaction, turn rate, error decay and growth, re-acquisition, head chance, semi/auto trigger, bursts, strafe/stop, ADS, determinism) and on the real Sim (tier ordering of hits, recoil compensation, determinism) |
| `bots.test.ts` | range duels: determinism per seed, tier ordering in duels and in time to kill at three ranges; dummies through the controller |
| `match.test.ts` | Saltworks: a lone attacker hunts a defender and never fires without sight; defender posts and patrols; attackers reach their target site; `commands()` never writes `SimState`; a full 10-bot match to `matchEnd` without stuck bots (logs the controller cost and ability use per operator; bots never press what the sim refuses); determinism per seed |
| `launch.test.ts` | URL launch options: defaults, explicit values, round trip through `launchSearch`, unsuitable levels rejected, `levelsForMode`, `defaultSeed`, every screenshot shot names a valid launch |
| `spatial-audio.test.ts` | listener axes match the sim's aim; `reachGain` (footsteps audible exactly within the bots' hearing radius × loudness); distance colouring; voice stealing |
| `generated-docs.test.ts` | generated docs and the README controls block are up to date |
| `tests/e2e/smoke.spec.ts` | `?mode=range`: loads from a sub-directory, clean console and network, ADS shots hit a dummy's head and torso hitboxes, a weapon swap fires the secondary, an operator places a gadget through the Command path; default page (`LAUNCH.defaultMode`, Relay): round 1's operator select with the full roster, the select screen instead of the menu, round HUD, runs clean; `?mode=elimination`: full roster, menu and pre-round banner, runs clean |
| `tests/e2e/relay.spec.ts` | `?mode=relay` on `RELAY_SHOT_SEED` with idle bots: select screen (a card per playable operator, key and click picks through the ControlMessage path); setup walls and the objective line; the plant prompt on site A, held interact → own progress → uplink HUD and marker; the uplink runs out → round won; clean console and network. Long phases skipped with `__qa.advanceTicks` |

Shared test helpers live in `tests/unit/support/`: `world.ts` (`run`, `world`, `commandFor`,
event filters), `abilityWorld.ts` (a `SimContext` over a real `PhysicsWorld` for effect
handlers without activations), `abilityInput.ts` (aim, throw and place inputs for the roster
and replay tests) and `match.ts` (`step`, `stepUntil`, `untilPhase`, `fireAt` for round-mode
matches); the e2e specs share `tests/e2e/support/page.ts` (`openGame` from the published
sub-path, `watchPage` for console errors and failed requests).

## 11. QA hooks (window)

Exposed by `src/client/qa.ts` (same pattern as FTB4):

- `__gameReady` — true after the first frame with the level, actors and HUD in place.
- `__shotNames`, `__setShot(name)` — named shots from `config/client.ts` that belong to the
  loaded launch (mode, level, seed); the screenshot tool loads each launch via its URL.
  `__setShot` returns false for another launch's shot or one that could not be staged.
- `__stats()` — fps, draw calls, triangles, tick.
- `__qa` — `state()` (tick, player id, a copy of the match state — Relay's with its channel
  and uplink —, every character incl. team, controller, life and ability slots, plus gadgets,
  projectiles and areas), `aimAt(entityId, part)`, `setButtons(buttons)`, `waitTicks(n)`,
  `advanceTicks(n)` (steps `n` ticks synchronously with the held buttons, events handled,
  nothing rendered — skips Relay's long select and setup at headless frame rates),
  `setBotsIdle(idle)` (no bot commands or picks), `events(type)`, `clearEvents()`,
  `teleport(...)`, `selectOperator(id)`: deterministic scripted input for tests.
- Match shots stage bots through the normal Command path: `Session.setQaCommand` replaces one
  bot's command, `Session.botsIdle` sends no commands or picks while the controller keeps
  observing. A match
  shot fast-forwards to its `phase` with `advanceTicks` (within
  `SHOT_STAGING.phaseTimeoutSeconds`); Relay's `plant` shot has the player plant at the nearest
  site through held interact.

## 12. Game modes (`src/sim/modes/`)

- **Contract**: `ModeRules` (`mode.ts`), every member a function of the match state —
  `validateLevel`, `initialMatch` (may draw from `SimState.rng` and emit events), `tick` (step 2
  of `Sim.step`), `frozen(match, team)` (look only, per team: Relay's setup freezes only the
  attackers; bots read it so a freeze never looks like being stuck), `filterCommand` (freeze,
  setup and channel rules), `acceptsControl` (operator-select window, pick rules) and the
  optional `abilityAllowed` (the ability gate; absent = allowed) and `setupWallsUp` (absent =
  never). Callers go through `index.ts`: `matchFrozen`, `matchAbilityAllowed` (the sim's spend
  path, the HUD and bots), `matchSetupWallsUp` (physics, rendering), and `operatorChoices(match)`
  (what the operator key cycles: the range's operators, else `PLAYABLE_OPERATORS`; the
  accepted choice is `Sim.accepts`'). A `Sim` runs exactly one mode:
  `Sim.create(level, seed, mode = 'range')` looks it up in the registry `MODES` (`index.ts`,
  with `MODE_IDS` in registry order). `ModeId = MatchState['mode']`, so mode ids and match
  states cannot drift apart.
- **Range** (`range.ts`): dead characters respawn at their spawn point after
  `RANGE_MODE.dummyRespawnSeconds` (world objects stay); reserve ammo never runs out; any level;
  every command passes, and operator picks within `rangeOperators()`.
- **Round flow** (`rounds.ts`, ADR-0013 §2): what both side-based modes share, so Relay adds
  phases, not a second round flow — `openingFields` (round 1's coin flip and attack zone),
  `beginPhase` (integer-tick clock, `phase` event), `phaseOver`, `aliveBySide`, `bookRound`
  (score, `roundEnd`), `closeRound` (the `matchEnd` event once a team has
  `MATCH_FORMAT.roundsToWin`; otherwise the next round's sides from `MATCH_FORMAT`, a fresh
  attack zone from `SimState.rng`, every gadget, projectile and area removed by
  `clearWorldObjects`, everyone revived with `respawnAt()` at their side's spawn zone — slot =
  index in the team by entity id) and `sideLevelProblems` (both spawn sides and a nav graph).
  A kill in steps 4–10 is judged in step 2 of the next tick.
- **Elimination** (`elimination.ts`, SPEC §4.3): `preRound` → `live` → `roundEnd` → next
  `preRound`, or `matchEnd` (terminal); clocks from `ELIMINATION`. The frozen phases
  (`preRound`, `matchEnd`) pass only the look; operator select (any operator) is accepted only
  in `preRound`. The round result comes from the living players per side and the round clock
  (`eliminationWinner` → `decideRound`).
- **Relay** (`relay.ts`, SPEC §4.1, ADR-0013): `preRound` (operator select) → `setup` → `live`
  (engagement) → `uplink` → `roundEnd` → next `preRound`, or `matchEnd`; clocks from `RELAY`.
  `preRound` and `matchEnd` pass only the look; in `setup` the attackers are frozen with their
  ability keys (the gate lets `isReconAbility` abilities through) and the setup walls stand.
  Picks are accepted only in `preRound`: a `PLAYABLE_OPERATORS` id that `pickAllowed` allows
  (fewer than `operatorPickLimit()` teammates play it); `settlePicks` makes any other roster
  legal when select ends. The **uplink channel** runs in step 2 from `lastButtons` (the previous
  tick's command — one tick of latency): a running channel is cancelled when its channeller
  dies, lets go of `BUTTON.interact` or no longer qualifies, and completes at its `endTick`;
  otherwise the lowest-id living character holding interact who qualifies starts one.
  `plantSiteFor` (engagement, attacker, grounded, feet in a site: `siteAt`) and `canDisrupt`
  (uplink phase, defender, grounded, within `RELAY.disruptRadiusM`) are the one rule for the
  sim, the HUD prompt and the bots; `uplinkProgress` feeds the HUD bars. While a channeller
  holds interact, `filterCommand` leaves it the look plus interact and crouch. Each tick the
  channel is judged first, then wipes, then the clock (the full table: ADR-0013 §6).
  `validateLevel` adds ≥ 1 site and ≥ 1 setup wall to `sideLevelProblems`.
- **Format helpers** (`format.ts`, pure): teams and sides (`sideOf`, `teamOnSide`,
  `roundMatchOf` — "is this a round mode", used by bots and the client), coin flips
  (`pickTeam`), overtime, match winner, next attacking team, side zones and spawn points,
  `roundSpawnOptions`, `decideRound`, `sideResult`, the pick rules (`isPlayableOperator`,
  `pickAllowed`) and `defaultRoster()`: the player in slot 0 of `MATCH.playerTeam`, bots
  cycling `PLAYABLE_OPERATORS` (within the pick limit).

## 13. Bots (`src/ai/`)

The design and every as-built deviation, API detail and measurement is in
[ADR-0011](decisions/0011-bots-and-elimination.md) §1–§5 and §10 (Relay:
[ADR-0013](decisions/0013-relay-mode.md) §7, §12 and §13); this section is the map.

- **Controller** (`controller.ts`): `createBotController(view, slots, seed)` builds every bot
  of a match from its `BotSlot`s (`BrainSpec`: a combat bot of a tier, or a range dummy with a
  behaviour) — one `BotState` per combat bot (own RNG stream `deriveSeed(seed, entityId)`,
  stagger index), one `TeamPlan` and `TeamIntel` per team, one nav graph and tactical map per
  match (only if a combat bot needs it and the level has `nav`), a `DummyBrain` per dummy. It
  returns an `InspectableBotController` (read-only `brain(id)` / `plan(team)` for tests and
  debugging). `stepMatch()` is the per-tick order of §3: `controls(tick)` first, then
  `commands(tick)`.
- **Operator picks** (`picks.ts`, Relay): `controls()` returns, once per Relay operator select
  and `AI.relay.pickDelaySeconds` into it (the player picks first), each team's `botPicks` —
  a permutation of `PLAYABLE_OPERATORS` from the team plan's RNG stream, each bot taking the
  first entry `pickAllowed` accepts on a scratch roster in queue order, so the sim accepts every
  pick and the player's team leaves every operator open (`TeamPlan.pickedRound`).
- **Per bot and tick** (`brain.ts`, `botCommand`): perceive → share and receive callouts →
  pick a target → engage a visible one at once, otherwise decide on staggered think ticks →
  act (aim + steering) → `Command`. Bots act whenever `matchFrozen(match, team)` is false; in a
  frozen phase they only look (no steering, so a freeze never reads as stuck). States: hold,
  patrol, investigate, engage, reposition, reload, retreat, objective; a per-round team plan
  (keyed by `roundMatchOf`) splits holders and pushers and picks posts from the tactical map,
  which is derived from the nav graph and the spawn zones (nothing extra authored).
- **Objective** (`objective.ts`, Relay): `objectiveDuty(bot, self, ctx, now)` returns the bot's
  duty — an `ObjectiveTask` (`goto`, `plant`, `guard`, `disrupt`: a nav node, then a point
  within `reachM`, then hold interact or face a yaw) — or null to leave the bot to the brain.
  `decideCalm` asks it first and state `objective` re-asks every think tick; the brain only
  acts the task out. Per team and round an `ObjectivePlan` holds the roles (planter,
  disrupter), the defenders' alarm (a heard plant start or an enemy seen in a site) and the
  guard spots claimed. A visible enemy still means `engage` unless `holdsChannel` (the bot's
  own channel ends within `AI.relay.finishChannelSeconds`, or letting go would lose the round).
  Tuning in `AI.relay`.
- **Perception** (`perception.ts`): staggered sight scans (range → view cone or near
  awareness → line of sight to head, then torso), the current target re-checked every tick,
  a reaction timer that survives short occlusions; hearing in `observe()` from `shot`,
  `footstep` (radius × loudness), enemy `ability` events (`AI.hearing.abilityRadiusM`), enemy
  `uplink` starts (`AI.hearing.uplinkRadiusM`; returned to the brain as heard plant/disrupt
  starts) and incoming weapon `hit` events (a damage contact at `hit.sourcePos`; an ability hit only sets
  the threat); every enemy revealed to the bot's team becomes an exact `reveal` contact each
  tick; contact memory with expiry. **Intel** (`intel.ts`): callouts per team, readable by
  teammates `AI.perception.calloutDelayTicks` later.
- **Abilities** (`abilities.ts`, ADR-0012 §10 and §17): `abilityStep` runs at the end of `act()`
  and turns the data's usage hint (`AbilityDef.bot`) into key, fire and ADS bits plus a look
  override — only when the mode's gate, the resource and `maxActive` allow; placements confirm
  only on a valid `placementPose`, throws aim with `ballisticPitch`. Plan and check timing are
  plain data in `BotState` (`BotAbilities`); tuning in `AI.abilities`.
- **Aim** (`aim.ts`): reaction time, an aim error that decays while tracking and grows on
  direction changes, turn-rate limit, recoil compensation, head/torso choice, a fire gate on
  the crosshair (look + recoil + own bloom) against the true aim point, bursts,
  strafe-or-stop. Difficulty tiers (`AI.tiers`) change numbers only.
- **Navigation** (`nav/`): `NavGraph` from `LevelDef.nav` (`nearest()` snaps to a node in
  sight at knee height), A* (`findPath`, cost × `AI.nav.linkCost[kind]`, blocked links
  skipped), `steer()` (move, look and buttons for a path; sprint on long straight segments,
  teammate separation, crouch and jump links, stuck recovery: jump → block the link and
  replan → drop the goal for the brain; never teleports).
- **Determinism**: the controller is a function of (seed, states, events), iterates by entity
  id and never touches `SimState.rng`; bot state is plain data, so it could later move to a
  worker next to the sim.

## 14. Client hosting (`src/client/`)

**Launch → session → mode host.**

- **Launch** (`launch.ts`, pure — the screenshot tool and unit tests use it in Node):
  `readLaunchOptions(location.search, fallback)` reads `?mode=&level=&tier=&seed=` (names in
  `LAUNCH.params`). Without them: `LAUNCH.defaultMode` (Relay since M2; elimination and the
  range at `?mode=elimination` / `?mode=range`), `LAUNCH.defaultLevel` per mode, the
  persisted `difficulty` setting, and `LAUNCH.seed` (`perLoad`: fresh per page load, shown in
  the debug overlay; `?seed=` replays it). A value that names nothing, or a
  level the mode's `validateLevel` rejects, fails the boot with a visible message — no silent
  fallback. `launchSearch()` builds launch URLs; `levelsForMode()` feeds the menu.
- **Session** (`session.ts`): `Session.create(launch)` creates the `Sim` for the launch's
  level, seed and mode, lets the mode host spawn every character and name the bot slots,
  builds the `BotController` with the launch seed and hands the setup events to the bots (and
  once to the app). `step(playerCommand)` is `stepMatch`. A mode, level or difficulty change
  reloads the page (`launchSearch`), so a session never ends and needs no teardown code.
- **Mode hosts** (`modes/`): `ModeHost` (`host.ts`) is what differs per mode — whether the
  tier matters, whether the match waits for the player's first "play" click (so the round
  clock does not run behind the menu), `spawn`, `attach(ui)` (once, after the HUD exists), the
  key hint, which characters get a floating health bar, `onEvents`, the round-HUD state and
  `frame(sim, player, visible)` for the host's own screens. `HostUi` is what the App lends a
  host for them: the HUD root, world → screen `project`, `capturePointer` (from a click only),
  `openMenu` and `setMenuSuppressed` (a free pointer then shows the host's screen, not the
  menu). `MODE_HOSTS` is keyed by `ModeId`, so a new sim mode does not compile without a host.
  Which operator the operator key picks is the simulation's: the App cycles
  `operatorChoices(match)` to the next one `Sim.accepts`.
  - **Range** (`rangeHost.ts`): the player at `playerSpawn` and the dummies.
  - **Side modes** (`sideHost.ts`, `createSideHost(view)`): shared by elimination and Relay —
    `defaultRoster` at the round's side spawns with combat bots of the launch tier, the event
    bookkeeping (result reason, killer, side swap), score, sides, alive markers and the
    eliminated, round-result (one text per `RoundEndReason`) and match banners. A mode adds
    the clock and banner of its running phases (`SideModeView`): `eliminationHost.ts` the
    pre-round and live texts.
  - **Relay** (`relayHost.ts`): composes the side host (phase captions and the setup / uplink
    banners from `HUD.relay`) and drives two screens. `ui/operatorSelect.ts` in operator
    select: a select phase frees the pointer once and suppresses the menu; cards generated from
    `PLAYABLE_OPERATORS` and the operator data, each with the team's picks against
    `operatorPickLimit()` and disabled when `Sim.accepts` refuses it; a click or number key
    sends `selectOperator` and captures the pointer, the ready key keeps the operator; with a
    locked pointer a strip. `ui/objectiveHud.ts` in setup, engagement and uplink: the
    objective line (side, task, uplink bar), the prompt under the crosshair (from
    `plantSiteFor` / `canDisrupt`, the key from `bindingLabel('interact')`, or the own channel's
    `uplinkProgress`) and site and uplink markers projected through `HostUi.project`. Plant
    and disrupt are the held `interact` button (`BUTTON.interact`, key F) in the player's
    ordinary `Command`.
- **App** (`app.ts`): frame loop, camera, view model, base HUD, round HUD, kill feed, world
  labels, the level's setup walls, debug and nav overlays, audio, QA; it calls the host's
  `frame` every frame after the round HUD. **Death camera** (SPEC §4.3): a dead player's
  camera stays at the eye of the death position with free look, without weapon and base HUD
  (the round HUD shows an "eliminated" banner), until the player's own `spawn` event returns
  first person and re-syncs the look.
- **Menu** (`ui/menu.ts`): controls, a Match section (mode and map lists generated from
  `MODE_IDS` / `MODE_TEXT` and `levelsForMode`, a new-match button) and settings (the
  `difficulty` select from `AI_TIERS`). Shown whenever the pointer is free, unless the mode
  host suppresses it (Relay's operator select; its "Menu" button opens it).
- **HUD pieces** (DOM, ADR-0007): the round HUD (`ui/roundHud.ts`, top centre: score, round,
  sides, phase clock, alive markers, banners), the kill feed (`ui/killFeed.ts`, top right,
  from `kill` events, names in team colours, weapon or ability by `kill.cause`), the
  damage-direction indicator (`ui/damageIndicator.ts`, owned by the base HUD, fed by the
  player's incoming `hit` events with `sourcePos`), the ability slots, channel bar, placement
  hint, shield/heal numbers and "REVEALED" warning (base HUD; `app.ts` derives each slot's
  state from the sim, greyed by `matchAbilityAllowed`) and the reveal markers
  (`ui/revealMarkers.ts`, over enemies `isRevealedTo` the player's team, projected with
  `worldLabels.ts`). Tuning in `HUD` (`config/client.ts`).
- **Ability wiring** (`app.ts`): each frame `AbilityViews.sync` and `RevealMarkers.update` read
  the state, the placement ghost gets `placementPose` for the slot being placed, and ability
  events feed the views (flashes), HUD and audio.

## 15. Audio (`src/client/audio/`)

- `sfx.ts` synthesises every sound (noise burst + body tone per `Impulse`; no assets until
  M3). The `AudioContext` is created on the first "play" click (autoplay policy).
- **Own vs. world sounds**: the local player's own sounds play non-positional, dry and
  uncapped. World sounds — other characters' shots and footsteps, impacts — each get their
  own `PannerNode` at the source (`AUDIO.spatial.panningModel` = HRTF, for front/back and
  above/below cues); the Web Audio listener follows the render camera every frame
  (`setListener`, so it also works for the death camera and shots).
- **One distance curve** (`spatial.ts`, pure, tested in Node): the panner only places a sound
  (its own rolloff is 0); `reachGain` gives inverse-distance falloff beyond `refDistance`,
  fades out over the last `edgeFade` of the reach and is silent at `maxDistance` × loudness.
  Gunshot and footstep reach are `AI.hearing.gunshotRadiusM` / `footstepRadiusM`, so players
  and bots hear by one rule. `distanceColour` makes far sounds duller and longer.
- **Voice cap**: at most `AUDIO.voices.maxWorld` positional voices; a new sound louder than
  the quietest playing voice replaces it (`voiceToSteal`), otherwise it is skipped; sounds
  inaudible at the listener never start.
- **Footsteps**: the sim owns cadence and loudness (`footstep` events, §8); the client only
  picks the timbre by the walker's `presentation.weightClass` (`AUDIO.footstep`), plays the
  player's own steps quieter (`ownFootstepGain`) and dry.
- Round stingers come from `phase` (live; Relay's setup: `AUDIO.ui.setupStart`) and `roundEnd`
  events; impacts sound once per attacker and tick (shotgun pellets do not stack).
- **Uplink** (Relay): `Sfx.uplink(action, stage, source)` on `uplink` events — a start or cancel
  cue per action (`AUDIO.uplink`), own dry, others positional with reach
  `AUDIO.spatial.reach.uplink` = `AI.hearing.uplinkRadiusM`; a completed plant or disrupt plays
  the `uplinkPlanted` / `uplinkDisrupted` stinger for everyone.
- **Abilities** (`AUDIO.ability`): `abilitySignature(abilityId)` derives each ability's sound
  (waveform per activation kind, tone from its place among that kind's abilities) and plays it
  on `ability` for both teams (own dry, others positional with reach
  `AUDIO.spatial.reach.ability` = `AI.hearing.abilityRadiusM`); positional cues on
  `gadgetPlaced`, `gadgetDestroyed`, `burst`, `healed`, `shieldGained`, `shieldBroken`,
  `abilityEnd`; a reveal ping on `revealed` for the player or their team; `Sfx.areaLoops`
  diffs `state.areas` every frame into positional loops under the voice cap; the player's
  `abilityFailed` plays the dry-fire click.
