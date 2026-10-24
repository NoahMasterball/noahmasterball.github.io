# ADR-0011 — Bot architecture and 5v5 elimination rounds

*Status: accepted · 2026-09-27*

## Context
M1 needs bots per SPEC §12 and 5v5 elimination rounds (player + 4 bots vs 5 bots, no
objective) within ADR-0003/0004/0006: `sim` never imports `ai`, `ai` runs in Node, bots emit
player `Command`s, state is plain data, events are data. Built: weapon switching and map #1
**Saltworks** (`saltworks`); `LevelDef` has `playerSpawn`, `spawnZones` per side (`SIDES` =
attack/defend — teams swap sides, so spawns never belong to a team; team-size points each),
`sites` and a range-only `range` block; no nav data yet. The user decided the proposal's four
open questions on 2026-09-27 (timeout, format, default mode, death camera: §6, §7).

## Decision

### 1. Boundary and per-tick order
- Bot state and logic live in `src/ai/`; the sim exposes a **read-only query surface** and
  knows nothing about bots. `Sim` satisfies the ai's `SimView` structurally.
- Per tick N — one shared `stepMatch()` used by the client `Session` and by tests:
  `bots.commands(N)` (reads state after N−1) → merge player command → `sim.step()` →
  `bots.observe(events)` → client handlers. Bots get the player's one-tick input latency;
  LOS queries see the colliders of the last `physics.step()`.

```ts
// src/sim/query.ts (new) — never mutates; valid between steps.
export interface SimQuery {
  lineOfSight(a: Vec3, b: Vec3): boolean;               // no static geometry between (characters never block sight)
  groundBelow(p: Vec3, maxDrop: number): number | null; // Y of the first static surface below p (nav validation)
}
// Sim gains `readonly query: SimQuery` → PhysicsWorld.castSight/castGround, new
// COLLISION_GROUPS.sightQuery = groups(LAYER.sightQuery, LAYER.static).

// src/ai/types.ts (new — the contract the client codes against)
export interface SimView { readonly state: SimState; readonly level: LevelDef; readonly query: SimQuery }
export type BrainSpec = { kind: 'combat'; tier: AiTier } | { kind: 'dummy'; behaviour: DummyBehaviour };
export interface BotSlot { entityId: EntityId; brain: BrainSpec }
export interface BotController { commands(tick: number): Map<EntityId, Command>; observe(events: readonly SimEvent[]): void }
// src/ai/controller.ts: createBotController(view, slots, seed) and
//   stepMatch(sim, bots, external: ReadonlyMap<EntityId, Command>): SimEvent[]
```
Range dummies become `BrainSpec` kind `dummy`, so range and elimination share one host path.

### 2. Perception (`src/ai/perception.ts`, `src/ai/intel.ts`)
```ts
export interface Contact {
  entityId: EntityId; pos: Vec3; vel: Vec3;   // last known feet position / velocity (0 for sounds)
  tick: number; firstSeenTick: number;        // last update / start of sighting (reaction timer)
  visible: boolean; source: 'sight' | 'sound' | 'damage' | 'callout';
}
```
- **Sight scan**, staggered (bot k scans when `(tick + k) % AI.perception.scanIntervalTicks
  === 0`): per living enemy by id — range ≤ `maxSightM` → FOV (`|angleDelta(yaw, bearing)| ≤
  fovDeg/2`, or all round within `nearAwarenessM`) → LOS eye → `zoneWorldCenter(head)`, then
  `torso`. The current target is re-checked every tick. Occlusions shorter than
  `reacquireGraceSeconds` keep `firstSeenTick` (re-peeks do not reset the reaction timer).
- **Hearing** from events in `observe()`: `shot` within `AI.hearing.gunshotRadiusM`;
  `footstep` within `footstepRadiusM × ev.loudness`; a `hit` on the bot adds a `damage`
  contact at the attacker (what the damage indicator tells a human). Sound positions get
  ± `positionErrorM` noise from the bot RNG. *(2026-09-30: sounds whose straight line to the
  listener is blocked by static geometry carry only `occludedRangeFactor` × the range and get
  ± `occludedPositionErrorM` noise.)*
- **Footsteps become a sim event** (also feeds M1 footstep audio): `{ type: 'footstep';
  entityId; pos; loudness }` every `MOVEMENT.footsteps.strideM` of grounded travel;
  `loudness = modifierProduct(e,'footstepVolume') × (sprinting ? sprintLoudness : 1) ×
  lerp(1, crouchLoudness, stance)`. The client picks the timbre from `presentation.weightClass`.
- **Memory** expires after `memorySeconds`; **callouts** go to a per-team `TeamIntel`, readable
  by teammate bots from `tick + calloutDelayTicks`. **No wall-hacks by construction**: only
  `perception.ts` reads enemy entity fields; brain and aim see `Contact`s.
- **Cost**: 9 combat bots, scan every 3 ticks → ≤ 3 scanners × 5 enemies × 2 rays + 9 target
  rays ≈ 40 rays/tick worst case; decisions every `AI.brain.thinkIntervalTicks` (staggered), aim
  and steering every tick; controller < 1 ms/tick in Node (B4 logs it).

### 3. Decision state machine (`src/ai/brain.ts`)
| State | Does | Leaves to |
| --- | --- | --- |
| `hold` | stand at a `hold` node, watch `watchYawDeg`, crouch if also `cover` | engage · investigate (sound/callout/damage) · patrol (attackers, after `holdMaxSeconds`) |
| `patrol` | path to `patrol` nodes and sites (attackers: towards the sites; defenders: around their own); re-pick on arrival | engage · investigate |
| `investigate` | path to `contact.pos`, look at it, no sprint within `cautionM` | engage · patrol (arrived + `investigateSeconds`, or contact expired) |
| `engage` | aim model (§4), fire gate, strafe/stop per tier, ADS beyond `AI.combat.adsBeyondM` | reposition (own kill / damage while target unseen) · reload · retreat · investigate (unseen > `loseTargetSeconds`) |
| `reposition` | path to a nearby `cover` node off the last line of fire | hold (arrived) · engage |
| `reload` | press reload; with a known threat move to cover away from it | previous state when the reload ends |
| `retreat` | health < `tier.retreatHealthFraction` and a threat known: cover node farthest from it within `retreatMaxM` | hold (arrived — no regen) |

Target: closest visible contact; switch only if another is `AI.combat.switchTargetRatio` ×
closer. *Use ability* is M2 (data usage hints). At round start `AI.brain.holdFraction[side]`
holds, the rest push; the clock favours defenders (§6), so only attackers leave holds.
```ts
export type BotStateName = 'hold' | 'patrol' | 'investigate' | 'engage' | 'reposition' | 'reload' | 'retreat';
export interface BotState {        // plain data, one per bot, owned by the controller
  entityId: EntityId; tier: AiTier; rng: RngState;   // createRng(deriveSeed(seed, entityId))
  state: BotStateName; stateSinceTick: number; role: 'hold' | 'push';
  contacts: Contact[]; aim: AimState; nav: NavState; lastHealth: number;
}
```
**Not in `SimState`**: the sim must not know ai types, and bot memory is hidden information
that must never be replicated (M6). Replays are command logs, so bots need not re-run.
Determinism holds anyway: the controller is a pure function of (seed, states, events), iterates
by entity id and never touches `SimState.rng`; plain data lets the M2 worker spike move bots
next to the sim. A test asserts `commands()` leaves the state unchanged.

### 4. Aim model and tiers (`src/ai/aim.ts`)
Global tuning in `AI` (`src/config/sim.ts`); tiers change parameters only.
```ts
// B1: AI_TIERS, AiTier and AiTierDef live in src/config/sim.ts next to AI.tiers (see §10).
export const AI_TIERS = ['easy', 'medium', 'hard'] as const;
export type AiTier = (typeof AI_TIERS)[number];
export interface AiTierDef {
  reactionTime: number;                 // s after firstSeenTick before turning/firing
  aimErrorDeg: number; aimErrorMinDeg: number; aimErrorDecay: number; // sampled on acquisition; floor; 1/s decay while visible
  directionChangeErrorDeg: number;      // added when target velocity turns > AI.combat.directionChangeDeg
  turnRateDeg: number;                  // max look speed, deg/s
  recoilCompensation: number;           // 0…1 of the own recoil offset subtracted from the look
  headChance: number;                   // per acquisition: aim zone head, else torso
  fireToleranceM: number;               // fire when look is within this lateral offset of the aim point
  burstShots: number; burstPause: number;   // beyond AI.combat.burstBeyondM
  strafe: boolean; stopToShoot: boolean;    // ADAD while engaging; zero move on fire ticks
  retreatHealthFraction: number;        // 0 = never retreats
}
```
Per tick: `aimPoint = zoneWorldCenter(target, zone)` (true position only while `visible`) →
`desired = anglesTo(eye, aimPoint) + err` → look moves towards `desired − recoilCompensation ×
recoil offset`, capped at `turnRateDeg × dt` via `angleDelta`. Fire when `reactionTime` has
elapsed and the gap < `atan(fireToleranceM / distance)`; semi-auto alternates the fire bit (the
sim needs a press edge). Only bot RNG and tick time → deterministic.

Starting values (B1 writes them; `config/sim.ts` is the source afterwards; the M1 DoD tunes
medium to 30–70 % duel wins):

| | reaction | error / min / decay | dir. change | turn | recoil comp | head | tolerance | burst | strafe / stop | retreat |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| easy | 0.45 s | 6° / 1.2° / 1.5 | 3° | 180°/s | 0.2 | 0.1 | 0.45 m | 4 / 0.35 s | no / no | 0 |
| medium | 0.28 s | 4° / 0.6° / 2.5 | 2° | 300°/s | 0.55 | 0.25 | 0.3 m | 6 / 0.25 s | yes / no | 0.3 |
| hard | 0.18 s | 2.5° / 0.25° / 4 | 1.2° | 480°/s | 0.85 | 0.45 | 0.2 m | 8 / 0.2 s | yes / yes | 0.35 |

### 5. Navigation (`src/ai/nav/`)
```ts
// src/data/schema.ts — LevelDef gains `nav?: NavGraphDef`
export const NAV_TAGS = ['cover', 'hold', 'patrol'] as const;
export type NavTag = (typeof NAV_TAGS)[number];
export interface NavNodeDef { id: string; pos: Vec3Tuple /* feet on the surface */; tags?: readonly NavTag[]; watchYawDeg?: number /* required for 'hold' */ }
export interface NavLinkDef { from: string; to: string; kind?: 'walk' | 'jump' | 'crouch'; oneWay?: boolean }
export interface NavGraphDef { nodes: readonly NavNodeDef[]; links: readonly NavLinkDef[] }
```
Site membership is derived from the `sites` areas, never tagged twice.
- **Authoring: hand-authored** in `src/data/levels/saltworks.nav.ts` with two helpers
  (`node(id, pos, tags?, watchYawDeg?)`, `chain(...ids)`), imported by `saltworks.ts`; ~50–80
  nodes. Nodes at the three staircases, the east ramp and the landing door derive from
  `SALTWORKS_LAYOUT` (not retyped); the catwalk drop into site A is a `oneWay` link. Not
  generated from boxes (ramps, rotated boxes, autostep and two floors make that a navmesh
  generator; tags need a designer anyway). A debug overlay and a `nav_overview` shot review it.
- **Validation.** `content.ts` (pure): unique ids, links reference nodes, no self/duplicate
  links, `hold` has `watchYawDeg`, strongly connected (forward + reverse BFS honouring
  `oneWay`), link length ≤ `AI.nav.maxLinkM`, every `spawnZones` point within `maxSpawnSnapM`
  of a node. `nav.test.ts` (Rapier via `Sim.query`): ground under every node; walk/crouch links
  clear at knee (walk also chest) height.
- **Runtime**: `NavGraph` (adjacency; `nearest(pos)` = best of `snapCandidates` by distance
  with `verticalWeight`, first with LOS); A* with Euclidean heuristic, cost ×
  `linkCost[kind]`, blocked links skipped (≤ 100 nodes, no cache).
```ts
export interface NavState { goal: string | null; path: string[]; index: number;
  progress: { tick: number; dist: number }; blocked: { from: string; to: string; untilTick: number }[] }
export interface Steer { moveX: number; moveZ: number; yaw: number; buttons: number; arrived: boolean }
/** faceYaw null = face along the path; set while aiming (strafe-walk). */
export function steer(nav: NavState, graph: NavGraph, self: Readonly<CharacterEntity>, faceYaw: number | null, tick: number): Steer;
```
- World direction → `moveZ = dir·forward(yaw)`, `moveX = dir·right(yaw)`. A node is reached
  when horizontal distance < `arriveRadiusM` and `|dy| < arriveHeightM` (floors differ in y;
  stairs/ramps are walk links handled by the KCC). `jump` links press jump once within
  `jumpTriggerM` of `from`; `crouch` links hold crouch. Sprint only without contacts and with
  ≥ `sprintMinSegmentM` straight ahead; lateral push from teammates within `separationM`.
- **Stuck**: progress < `stuckMinProgressM` over `stuckWindowSeconds` → (1) jump, (2) block the
  link for `blockLinkSeconds` and replan from the nearest node, (3) after `maxStuckRetries` a new
  goal. Never teleport.

### 6. Elimination mode (`src/sim/modes/`)
```ts
// src/sim/modes/mode.ts (new); registry MODES: Record<ModeId, ModeRules> in modes/index.ts
export type ModeId = 'range' | 'elimination';   // B1: derived as MatchState['mode'] (§10)
export interface ModeRules {
  validateLevel(level: LevelDef): string[];                                  // Sim.create throws on problems
  initialMatch(ctx: SimContext): MatchState;                                 // may draw from SimState.rng
  tick(ctx: SimContext, dt: number): void;                                   // step 2 of Sim.step
  filterCommand(ctx: SimContext, e: CharacterEntity, cmd: Command): Command; // freeze / setup rules
  acceptsControl(ctx: SimContext, msg: ControlMessage): boolean;             // operator-select window
}
// src/sim/types.ts — SimState gains `match: MatchState` (Side = data/schema.ts SIDES)
export type MatchPhase = 'preRound' | 'live' | 'roundEnd' | 'matchEnd';
export type MatchState = { mode: 'range' } | { mode: 'elimination'; phase: MatchPhase; round: number;
  phaseEndTick: number | null; score: [number, number]; attackingTeam: number;
  attackZoneId: string; lastWinner: number | null };
// SimEvents: footstep (§2) plus
//   { type: 'phase'; phase; round; attackingTeam; endsAtTick: number | null }
//   { type: 'roundEnd'; round; winner: number; winnerSide: Side; reason: 'elimination' | 'timeout'; score }
//   { type: 'matchEnd'; winner: number; score }
// Sim.create(level, seed = SIM.defaultSeed, mode: ModeId = 'range') stays compatible;
// SimContext gains `level`; rangeModeTick becomes MODES.range.
```
- **Sides and format** (user decision: as Relay, SPEC §4.1): the match tracks the attacking
  team; `sideOf(match, team)` derives sides. Pure helpers in `sim/modes/format.ts` (reused by
  Relay): first attackers and overtime sides by coin flip from `SimState.rng`; swap after
  `MATCH_FORMAT.sideSwapAfterRounds`; one overtime round at `roundsToWin − 1` each.
- **Flow**: `preRound` (`preRoundSeconds`; `filterCommand` keeps only look; operator select
  accepted) → `live` → `roundEnd` (`roundEndSeconds`, result locked) → next `preRound` via
  `resetRound()`, or `matchEnd` at `roundsToWin` (terminal, frozen). Timers are integer
  `phaseEndTick`s; a kill in step 7 is judged in step 2 of the next tick.
- **Round result** (user decision: timeout → defenders, as in Relay): a side at 0 alive loses;
  both at 0 in one tick → defenders; `roundSeconds` expired → defenders (`timeout`). No draws.
- **Spawns** by side: `initialMatch`/`resetRound()` set `attackingTeam` and draw `attackZoneId`
  from `SimState.rng` among the `attack` zones (picking the edge: Relay, M2); defenders use the
  `defend` zone. Pure `roundSpawnOptions(level, match, roster)` and
  `defaultRoster(playerOperatorId)` (player = `ELIMINATION.playerTeam` slot 0; bots cycle the
  playable-operator list, hoisted so `RANGE_MODE` references it); slot = index in the team by
  entity id = index into the zone's `points`. `resetRound()` and range respawns share
  `respawnAt(ctx, e, pos, yaw)` in `entities.ts` (revive, `loadOperator` → both weapons full,
  primary in hand, per-round `uses`; stance 0, colliders on, teleport, `spawn` event).
  `validateLevel` (elimination) requires zones for both sides and `nav` (**B1 deviation**: the
  `nav` requirement is not in yet, §10).
- **Constants** (`config/sim.ts`): `MATCH_FORMAT` (`roundsToWin` 4, `sideSwapAfterRounds` 3;
  shared with Relay), `ELIMINATION` (`preRoundSeconds` 5, `roundSeconds` 120, `roundEndSeconds`
  4, `playerTeam` 0); team size is the global rule there (spawn-zone validation uses it).

### 7. Client hosting (`src/client/`)
- **Selection**: URL params `?mode=&level=&tier=&seed=` (`launch.ts`; used by QA, e2e, shots)
  plus menu lists generated from `MODES`, levels passing `validateLevel` (a default per mode
  replaces today's `LAUNCH.defaultLevelId`) and `AI_TIERS`. **Default mode** (user decision): `elimination` once bots work (B5 switches it
  when B4 has landed); the range stays in the menu and at `?mode=range`, which the smoke test
  uses. A mode/level change reloads the page (no teardown code). Difficulty is a persisted
  setting (new `select` kind), one tier for all bots.
- **Structure**: `session.ts` owns `Sim`, player id and `BotController` and calls `stepMatch`;
  `modes/rangeHost.ts` / `modes/eliminationHost.ts` implement a small `ModeHost` (spawns +
  slots, `onEvents`, label targets, round-HUD data); `app.ts` keeps frame loop, camera, view
  model, base HUD and QA. New `ui/roundHud.ts` (timer, score, alive counts, own side, banners)
  and `ui/killFeed.ts`. **Dead player** (user decision, M1): fixed camera at the death position
  and a round banner; spectating teammates is M2. `__qa.state()` gains `match` and `team`.

### 8. Tests (real `Sim` in Node unless noted)
| File | Proves |
| --- | --- |
| `query.test.ts` | LOS blocked by a wall, clear in the open; `groundBelow`; footstep cadence and loudness (crouch/sprint/modifier) |
| `elimination.test.ts` | phase order and durations; freeze drops movement/fire; elimination win via scripted aimed fire; timeout and mutual wipe → defenders; reset (alive, side-correct spawn slots, both weapons' ammo, `uses`); side swap and overtime per `MATCH_FORMAT`, deterministic per seed; `matchEnd` at `roundsToWin`, then frozen |
| `nav.test.ts` | pure A* and every validation error; Saltworks physical checks; `steer` walks each spawn zone → each site across floors (stairs, ramp, catwalk drop) without tripping stuck detection |
| `perception.test.ts` | seen in FOV, not behind a wall or outside FOV; hearing radius × loudness; memory expiry; callout delay |
| `aim.test.ts` (pure) | error decays to the floor, grows on direction change; no fire before `reactionTime`; recoil compensation shrinks drift; hard converges faster than easy |
| `bots.test.ts` | medium bot kills a static dummy at 15 m within N s; never fires through a wall; `commands()` leaves state unchanged; two hard bots duel → identical result and state hash on two runs with one seed |
| `match.test.ts` | 10 medium bots resolve a round and a full match on Saltworks without errors, deterministic per seed; logs controller cost per tick |
| `smoke.spec.ts` (e2e) | the existing range checks run on `?mode=range`; the default page (elimination) loads 10 characters, round HUD visible, no console errors |

### 9. Implementation batches (disjoint file ownership)
Prerequisites: weapon switching and Saltworks (landed); the movement fix for stalls on stairs,
ramps and flat floors (`sim/systems/movement.ts`) lands before B1, which then owns that file.
Waves: A = B1; B = B2 ∥ B3; C = B4 ∥ B5 (B5 codes against `src/ai/types.ts`; green once B4
lands). Contract files (`ai/types.ts`, `config/sim.ts`, `data/schema.ts`) are frozen after B1;
later changes go through the coordinator. Every batch ends with `npm run check`. `+` = new file.
Docs (ARCHITECTURE, ROADMAP, SPEC, PROJECT_STATE, ADR index) and `docs:gen` stay with the
coordinator.

| Batch | Owns (paths under `src/` unless noted) | Tests | Needs |
| --- | --- | --- | --- |
| **B1 Sim foundation + contracts** | `config/sim.ts` (every key in this ADR), `data/schema.ts` (nav types), `sim/sim.ts`, `sim/types.ts`, `sim/context.ts`, `sim/query.ts`+, `sim/modes/mode.ts`+, `sim/modes/index.ts`+, `sim/modes/format.ts`+, `sim/modes/range.ts`, `sim/modes/elimination.ts`+, `sim/entities.ts`, `sim/physics/world.ts`, `sim/physics/groups.ts`, `sim/systems/movement.ts`, `sim/math.ts` (`wrapAngle`, `angleDelta`), `sim/hitbox.ts` (`zoneWorldCenter`), `sim/rng.ts` (`deriveSeed`), `ai/types.ts`+ | `query.test.ts`+, `elimination.test.ts`+, `sim.test.ts` (only if needed) | prerequisites |
| **B2 Navigation** | `data/content.ts` (nav validation), `data/levels/saltworks.nav.ts`+, one import line in `data/levels/saltworks.ts`, `ai/nav/graph.ts`+, `ai/nav/astar.ts`+, `ai/nav/steer.ts`+ | `nav.test.ts`+ | B1 |
| **B3 Perception + aim** | `ai/perception.ts`+, `ai/intel.ts`+, `ai/aim.ts`+ | `perception.test.ts`+, `aim.test.ts`+ | B1 |
| **B4 Brain + controller** | `ai/brain.ts`+, `ai/controller.ts`+ (`createBotController`, `stepMatch`), `ai/dummy.ts` | `bots.test.ts`+, `match.test.ts`+ | B2, B3 |
| **B5 Client hosting** | `client/app.ts`, `client/session.ts`+, `client/launch.ts` (has `?level=`; adds mode/tier/seed), `client/modes/*`+, `client/ui/roundHud.ts`+, `client/ui/killFeed.ts`+, `client/ui/menu.ts`, `client/ui/settings.ts`, `client/qa.ts`, `client/render/navDebug.ts`+, `client/audio/sfx.ts`, `config/client.ts`, `index.html`, `tools/screenshot.mjs`, `tests/e2e/smoke.spec.ts` | e2e, `npm run shots` reviewed | B1; B4 to run |

### 10. B1 as built (2026-09-28) — deviations and additions
**Deviations** (everything else is built as above):
- **`nav` not yet required** by elimination's `validateLevel`: Saltworks has no nav graph
  until B2, and the sim runs rounds without one. When `saltworks.nav.ts` lands, add
  `if (!level.nav) problems.push(…)` to `validateLevel` in `sim/modes/elimination.ts`
  (coordinator or B2, one line).
- **Tier types** `AI_TIERS`, `AiTier`, `AiTierDef` live in `config/sim.ts` (`AI.tiers` needs
  them and config must not import `ai/`); `ai/types.ts` imports `AiTier` from there.
- **`ModeId = MatchState['mode']`**, so mode ids and match states cannot drift; `MODE_IDS`
  (registry order) sits next to `MODES` in `modes/index.ts`.
- **Footstep loudness has no weight-class term**: `presentation` is never read by the sim;
  per-operator loudness comes only from `footstepVolume` modifiers (Kestrel's Lightfoot), the
  cadence from speed. Crouch-walking is quiet (`crouchLoudness` 0.3), not silent — the SPEC
  asks for nothing more.
- **Open points decided**: `roundEnd` passes commands through (move/shoot, result locked);
  only `preRound` and `matchEnd` freeze. Round 1's `preRound` `phase` event is emitted by
  `Sim.create` (tick 0, collect with `drainEvents()`). The deciding round shows `roundEnd`
  for `roundEndSeconds`, then `matchEnd` + `phase: matchEnd` follow. `zoneWorldCenter(e,
  zone)` = centre of the zone's part with the largest frontal area (head, chest, a leg);
  `shapeFrontalArea` moved from `balance/budget.ts` to `sim/hitbox.ts` for it.

**Additions** (contract for B2–B5):
- `config/sim.ts`: `secondsToTicks()`; `PLAYABLE_OPERATORS` (hoisted, `RANGE_MODE` references
  it); `MOVEMENT.footsteps` `{ strideM 1.8, sprintLoudness 1.5, crouchLoudness 0.3 }`;
  `MATCH_FORMAT.firstAttackingTeam` / `overtimeAttackingTeam` (`'coinFlip'` or a team),
  `timeoutWinner` / `mutualWipeWinner` (`'defend'`); `ELIMINATION.attackZone`
  (`'random'` | `'first'`); team size stays `MATCH.teamSize`; every `AI.*` key of §2–§5 with
  starting values.
- `data/schema.ts`: `NAV_TAGS`, `NAV_LINK_KINDS`/`NavLinkKind` (keys of `AI.nav.linkCost`),
  `NavNodeDef`, `NavLinkDef`, `NavGraphDef`, `LevelDef.nav?`.
- `sim/modes/format.ts`: `TEAMS`, `otherTeam`, `sideOf`, `teamOnSide`, `pickTeam`,
  `isOvertime`, `matchWinner`, `addRoundWin`, `nextAttackingTeam`, `sideZones`,
  `drawAttackZone`, `roundSpawnZone`, `roundSpawnPoint`, `teamSlots`, `RosterEntry`,
  `roundSpawnOptions`, `decideRound` (pure round-result rule). `sim/modes/elimination.ts`:
  `ELIMINATION_RULES`, `eliminationWinner(ctx, match)`, `defaultRoster`.
- `ai/types.ts` also declares `SteppableSim` (a `SimView` with `step`), `CreateBotController`
  and `StepMatch`, the signatures B4 implements and B5 calls.
- Sim: `Sim.query` (`createSimQuery`, `PhysicsWorld.castSight` / `castGround` on
  `COLLISION_GROUPS.sightQuery`); `CharacterEntity.strideProgress`; `footstepLoudness(e)` in
  `stats.ts`; `randomIndex` in `rng.ts`; `respawnAt` also levels the pitch, clears sprint and
  stride and makes the point the new `spawnPos`. A control message the mode refuses is dropped.
- Hosts must re-sync the player's look input on its `spawn` event: `Command` look angles are
  absolute, so a round reset's facing would otherwise be overwritten on the next tick.

**B3 as built (2026-09-30) — perception, intel, aim; deviations and additions:**
- **API** (B4 composes per bot and tick): `perceive(view, self, contacts, k, targetId)` (sight
  scan on `isScanTick(tick, k)`, else the target only; drops dead enemies and expired memory),
  `receiveCallouts` + `shareContacts` (`TeamIntel` per team), `targetView(view, contact)` →
  `aimStep(aim, AI.tiers[tier], self, view | null, tick, rng)`; in `observe()` `hear(view, self,
  contacts, events, rng)` and `observeIntel(intel, events)`. Clock = `view.state.tick`.
- **`Contact.seenTick`** (last tick in sight, null = never) added: the re-acquire grace needs the
  last *sighting*; `tick` also moves on sounds. Indirect news of one tick ranks sight > damage >
  sound > callout; a kill drops the victim, `preRound` clears contacts and callouts.
- **`TargetView`** (perception) is all aim sees: per-zone aim points and zone radii, velocity,
  `visible` = line of sight confirmed *this* tick (only then the true pose; else the last known
  position). Shot origins and `hit.sourcePos` are eye positions → feet = y − standing eye
  height; sound noise is horizontal; damage contacts are exact.
- **Fire gate** deviates: crosshair (look + recoil) to the *true* aim point, plus the own bloom,
  `< atan(fireToleranceM × zoneRadius / torsoRadius / distance)`. Without the bloom term
  sustained fire bloomed out for every tier; with the torso tolerance on the head (≈ 2× its
  radius) head-aiming bots missed over the head and hard hit less than medium. The error decays
  from the end of the reaction time; its direction is redrawn inside the unit circle every
  `AI.combat.errorResampleSeconds`; direction-change growth is capped at `aimErrorDeg` and needs
  `directionChangeMinSpeed`. Callouts: at most one pending per enemy and team.
- New `AI.combat` keys: `directionChangeMinSpeed`, `errorResampleSeconds`, `strafeSwitchMin/Max`.
  Tier values unchanged. Measured (Wisp vs static Basalt, 15 m, 3 × 100 shots): easy 52 %,
  medium 61 %, hard 73 % hits. Medium strafes while firing: at 35 m it kills slower than easy
  (tune in the DoD duels). Cost: 9 bots on Saltworks ≈ 15 rays/tick (worst 30), 0.05 ms/tick.

**B2 as built (2026-09-30) — navigation; deviations and additions:**
- **Saltworks graph**: 100 nodes, 131 links; tags: 22 cover, 18 hold, 15 patrol (ADR guessed
  50–80: the 12 m `maxLinkM` over the open courtyard and walls/rails between rooms need the
  extra nodes; A* stays trivial). Walk links
  only plus the one-way catwalk drop — no Saltworks geometry needs `jump`/`crouch` (steering of
  both kinds is tested on the range course). `saltworks.nav.ts` exports `saltworksNav(layout)`,
  called by `saltworks.ts` with `SALTWORKS_LAYOUT` (a function: no import cycle); the layout
  gained `galleryDoorZ` and `catwalkEdgeX`, from which the drop and the gallery doors derive.
- **Resolved** the B1 deviation: elimination's `validateLevel` requires `nav`.
- **content.ts**: `insideSite(site, p)` / `siteAt(level, p)` (feet within `CHARACTER.groundProbe`
  below the floor count); nav validation also requires a node in every site and every node
  inside the level geometry.
- **`AI.nav.kneeHeightM`** (0.5) added: height of `nearest()`/shortcut LOS and the link checks.
  The link test checks knee and *eye* height (not chest), each on the centre line and ±capsule
  radius; drops as a ledge walk plus a fall. Nodes are also checked for head-room and a
  capsule-wide footprint.
- **API** (`src/ai/nav/`): `createNavGraph(view)` / `NavGraph` (`node`, `edgesFrom`, `edge`,
  `tagged`, `siteNodes`, `nearest`, `clear`; nodes carry `watchYaw` in radians and `site`);
  `findPath(graph, start, goal, blocked?)`, `pathLength`; `createNavState`, `setGoal(nav, graph,
  pos, goal, tick)` (keeps the path while the goal is unchanged), `replan`, `clearGoal`,
  `reachedNode`, `steer(nav, graph, self, faceYaw, tick, opts?)` with `opts = { sprint?,
  teammates? }` (sprint defaults off: the brain passes "no contacts").
- **`NavState`** gains `stuck` (recovery stage), `jumpedIndex` (one press per jump link) and
  `lastTick` (a pause in steering restarts the progress window). **`Steer`** gains `recovery`
  (`'jump' | 'replan' | 'newGoal'`). Stages: 1st detection jump; 2nd … `maxStuckRetries`-th block
  the link and replan from the nearest node; after that — or when no path is left — the goal is
  dropped (`nav.goal = null`) for the brain to replace. Reaching the start node of a replan does
  not reset the stage. A plan skips its start node when the next node is closer, on the same
  floor, in knee-height sight and a walk link away (no backtracking).
- Tests: `nav.test.ts` (validation errors, A* on toy graphs, Saltworks physical checks, A* from
  every spawn point of both sides to both sites) and `nav-walk.test.ts` (steering only, slowest
  operator Basalt, sprint allowed: West Gate → A 19.7 s / → B 24.8 s (lobby stairs), East Lot →
  A 22.1 s / → B 22.7 s (east ramp), Service → A 4.4 s / → B 12.8 s (service stairs); hall stairs
  and the drop as a round trip; every link in each allowed direction from a standstill; crouch
  and jump links; stuck recovery; determinism).

**B4 as built (2026-09-30) — brain and controller; deviations and additions:**
- **API** (`src/ai/controller.ts`): `createBotController(view, slots, seed)` satisfies
  `CreateBotController` and returns an `InspectableBotController` (read-only `brain(id)` and
  `plan(team)` for tests and debug overlays); `stepMatch` as in §1. Dummy slots drive the
  unchanged `DummyBrain`, now seeded `deriveSeed(seed, entityId)` (the client used slot index + 1).
  Combat bots: one `BotState` each (`createBotState`: RNG `deriveSeed(seed, entityId)`, stagger
  `k` = combat-slot index), one `TeamPlan` (own stream `deriveSeed(seed, −(team + 1))`) and
  `TeamIntel` per team, one nav graph and `TacticalMap` for all — built only if a combat bot
  exists and the level has `nav`; without it combat bots hold where they stand (range duels).
- **Per tick** (`botCommand`, `src/ai/brain.ts`): bots act only in the `live` phase (a bot
  policy, not a copy of the mode's freeze rule: look-only commands and no steering otherwise, so
  the freeze never reads as stuck; side-less modes are always live) → perceive → share → receive
  callouts → target (closest visible, `switchTargetRatio`) → engage at once on a visible target →
  decide on think ticks `(tick + k) % thinkIntervalTicks` → act. `observe`: `observeIntel` per
  team, then per bot its spawn (reset), own kills and hits (line of fire), `hear` (living bots).
- **`BotState`** deviates from the §3 sketch: no `lastHealth` (hit events give `hitTick`); adds
  `targetId`, `dest` (the current state's node), `arrivedTick`, `post`, `lead`, `leadDoneTick`,
  `threat`, `hitTick`/`killTick`, `resume`, `retreated`, `siteReached`, `visited`.
- **`TacticalMap`** (derived, nothing authored): path costs from each side's spawn zones;
  *defended ground* = nodes the defenders reach ≥ `AI.brain.defendedMarginM` before the attackers
  (Saltworks: the building — indoor nodes lead by ≥ 25 m, outdoor ones by ≤ 11 m); *hold side*:
  the neighbour a post watches most leading towards the attackers' spawn and away from the
  defenders' is a defender post, the reverse an attacker post, a tie (dead ends, windows, both
  sides arriving through it) the half it stands in. Saltworks: 15 defender posts, 3 attacker
  posts (`lowwall_c`, `y_ec_n`, `alley_w_crate`), as the authoring comments intend. Rejected: a
  roof test (the greybox has no roofs) and ray-cast "what the post sees" (hits the other floor).
- **Round plan** (`planRound`, every round; once in side-less modes): holders =
  round(`holdFraction[side]` × bots), drawn from the team stream; defender posts round-robin over
  the sites (`siteOf` = the node's site or the nearest), attacker posts at random; attackers draw
  a target site. Attack pushers go to a random node of it first, then hunt the defended ground's
  hold, cover, patrol and site nodes; defender pushers patrol its patrol and site nodes. A patrol
  picks among the `patrolChoices` nearest nodes not in the last `patrolMemory`.
- **States** (deviations from §3 marked ⚠):
  hold — walk to the post, face `watchYaw` at the tier turn rate, crouch on cover posts; attackers
  and pushers leave `holdMaxSeconds` after arriving. Leads: defender holders only within
  `holdInvestigateM`, defenders only on the defended ground, everyone else the newest lead.
  ⚠ Damage from an unseen enemy → *reposition* facing the source (not investigate).
  investigate — sprint beyond `cautionM`, then walk facing the lead; new destination when the
  contact moved > `leadUpdateM`; done after `investigateSeconds` there or when forgotten → back to
  the role (⚠ holders return to their post rather than patrol: only attackers leave holds).
  engage — the aim model's output, ⚠ refined by the weapon's spread: no strafing while
  `tan(spreadMoving) × distance > fireToleranceM` (running would ruin the shots), sights up also
  while `tan(hipSpread) × distance > fireToleranceM` (a DMR up close). Unseen target: reposition
  if hit or after an own kill since the last sighting, else reload if low, else investigate after
  `loseTargetSeconds`.
  reposition / retreat — cover nodes on the bot's floor within `repositionMaxM` / `retreatMaxM`,
  nearest first / farthest from the threat first, the first the threat cannot see (≤
  `coverCandidates` rays); face the threat (retreat keeps firing at a visible target); arrival →
  hold there. ⚠ Retreat at most once per life.
  reload — out of a fight at ≤ `AI.combat.reloadBelowFraction` of the magazine (press edges on
  alternate ticks; the sim's rules otherwise), to near cover if hit before, then back. Weapon
  swap: in a fight an empty weapon gives way to the other when its reload outlasts
  `GUNPLAY.weaponSwapSeconds` (or it has no reserve); out of a fight the primary comes back.
- **New keys**: `AI.brain.repositionMaxM` 10, `coverCandidates` 4, `holdInvestigateM` 10,
  `defendedMarginM` 15, `leadUpdateM` 3, `patrolChoices` 4, `patrolMemory` 6;
  `AI.combat.reloadBelowFraction` 0.5. **Tier values unchanged**: B3's inversion (medium slower
  than easy at 35 m) came from strafing while firing; the spread rule above fixes it.
- **Measured** (range, mirror operators cycling the playable list; `bots.test.ts`): duels, 24 per
  pair and range — medium beats easy 83 / 92 / 79 % at 10 / 20 / 35 m, hard beats medium
  83 / 79 / 92 %, hard beats easy 96 / 100 / 88 %; time to kill a standing Basalt — easy
  2.6 / 4.1 / 10.3 s, medium 1.7 / 3.4 / 7.9 s, hard 1.2 / 1.7 / 4.9 s. Saltworks, 10 medium
  bots, 6 seeds: 36 rounds, 35 eliminations and 1 timeout, attackers won 26, rounds 21–120 s
  (median 53 s), no stuck bot. Controller cost (10 bots, Node): 0.035 ms/tick average, p99
  ≈ 0.22 ms, worst ≈ 3 ms (the first live tick: JIT warm-up and ten path plans at once); the sim
  step averages 0.13 ms.
- **Tests**: `bots.test.ts` (range: deterministic duel, tier ordering in duels and against a
  standing target at three ranges, dummies through the controller) and `match.test.ts`
  (Saltworks: a lone attacker hunts a standing defender and never fires without sight; defender
  posts, angles and patrol ground; attackers in their target site within 25 s, both sites;
  `commands()` leaves `SimState` unchanged; a full 10-bot match to `matchEnd` without stuck bots,
  logging rounds and cost; determinism per seed).

**Polish after integration (2026-09-30):**
- **Freeze = one definition.** `ModeRules.frozen(match)` (range: never; elimination:
  `FROZEN_PHASES` = `preRound`, `matchEnd`) drives both the mode's `filterCommand` and the bots
  (`matchFrozen(match)` in `sim/modes/index.ts`). Supersedes B4's "bots act only in `live`":
  bots now play on through `roundEnd` like the player (before, they stood defenceless for the
  4 s after a timeout). Test: a defender shoots an enemy in sight during `roundEnd`.
- **Travel facing is rate-limited**: `SteerOptions.turnRateDeg` (the brain passes its tier's
  `turnRateDeg`) turns the look towards the path at most that fast while the move keeps heading
  for the node (strafe-walked); no more snapping at path corners. `turnStep` / `turnTowards`
  (`ai/aim.ts`) replace the three copies of the per-tick conversion. `nav-walk.test.ts` drives
  every route with the slowest tier's rate; its bounds are unchanged.
- **Giving way**: at a stuck detection, a bot within `AI.nav.separationM` of its next node with a
  teammate within `separationM` counts the node as reached (a node on the way only if the next
  link is a clear walk) instead of jump → replan → new goal. In 18 bot matches (6 seeds × 3
  tiers) 46 of 47 stuck detections had a teammate within `separationM`; now 15 remain.
  Left: a bot pinned against a standing teammate *between* nodes — the two movement capsules end
  up at the controller-offset distance and the KCC stops sliding (physics, not the brain); the
  usual recovery still frees it.
- Saltworks: the defenders' "Service Corridor" spawn faces west along the corridor (it faced the
  corridor's south wall 3 m away).

## Consequences
- The sim gains a mode registry, a query surface and four event types but no ai knowledge.
  Bot skill is data in one place (`AI.tiers`).
- Relay (M2, not built) is a sibling `ModeRules` (`relay` `MatchState`, phases
  `operatorSelect`/`setup`/`uplink`; `filterCommand` = setup restrictions, `acceptsControl` =
  pick-once) that reuses sides, format helpers, the timeout rule and the exported
  `eliminationWinner(ctx)`: it adds phases and the uplink, not a new round flow.
- Nav authoring is manual per map (≈ 1 h for Saltworks), guarded by tests; a navmesh stays a
  later option. Characters do not block sight in M1; walls muffle hearing since 2026-09-30.
- Rejected: a separate Rapier world for the ai (duplicate physics), bot state in `SimState`
  (couples sim to ai, replicates hidden info), aim assistance in the sim (SPEC §12 fairness),
  auto-generated waypoints for M1 (§5; revisit with map #2), the proposal's timeout rule "more
  alive wins, else draw" (user chose defenders).
