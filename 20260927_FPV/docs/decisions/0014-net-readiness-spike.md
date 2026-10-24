# ADR-0014 — Net-readiness spike: determinism, snapshots, loopback worker, local prediction

*Status: proposed · 2026-09-30*

## Context
M2 (ROADMAP, "Order changes") adds a net-readiness spike: the simulation in a Web Worker behind a
message channel with artificial latency, client-side prediction of the local player, no server.
DoD: *at 100 ms simulated RTT the local player's movement and shooting feel unchanged
(prediction), and a determinism test replays a recorded match from its commands to an identical
final state.* NETWORKING.md is the M6 plan the spike validates. Foundations: ADR-0003 (Node-safe
sim, `Command`/`ControlMessage` only), ADR-0004 (plain state, Rapier in side tables), ADR-0006
(events as data), ADR-0011 §3 (bot state is *not* in `SimState`: "replays are command logs"),
ADR-0012 (`gadgets`/`projectiles`/`areas` in `SimState`, gadget colliders with deferred removal),
ADR-0013 (bots emit `ControlMessage`s through `stepMatch`; setup walls derived from `match`).

What the code forces:
- **Spread samples draw from the shared `SimState.rng`** (`systems/weapons.ts`). A client that
  predicts its own shots cannot reproduce them once anybody else fired in between. Bot streams
  already use `deriveSeed(seed, entityId)`.
- **Four determinism tests build ad-hoc JSON digests** (`bots`, `elimination`, `match`, `sim`
  tests): `JSON.stringify` maps `Infinity` (passive modifiers) to `null` and `−0` to `0`, and the
  pattern is copied. `sim.test.ts` "replays identically from the same seed and commands" runs one
  script twice; ADR-0012 batch R extends it with ability state. Neither records a *bot-driven*
  match, so neither proves that the command log holds every input.
- **State outside `SimState`**: `Sim` queues `controls` and keeps undrained `events`;
  `PhysicsWorld` holds character bodies (pose = `e.pos`/`yaw` after each step, capsule and
  hitboxes from `stance` and the operator's profile, enabled = `alive`), gadget colliders incl.
  `pendingRemovals`, and ADR-0013's setup walls. All of it is derivable from `SimState` + level.
- **Rapier compat** is deterministic for one binary on one platform (the existing per-seed tests
  rely on it), not across platforms (NETWORKING §6). Scene queries see a collider only after a
  `world.step()`. A world whose bodies were re-placed has a different broad-phase tree, which may
  break ties between equally close hits differently.
- **`Command.tick` is never read by a system** (`filterCommand` only copies it).
- **The client is welded to `Sim`**: `App` caches `session.player` (an entity reference), reads
  `session.sim` (state, `getCharacter`, `level`) and calls `sim.control`; `ModeHost.spawn(sim,
  tier)` builds the roster in client code, which a worker (and the M6 Node server) cannot import.
- Vite builds workers as a separate bundle (`worker.*` options). Rapier compat inlines its WASM
  (~4.3 MB chunk), so `RAPIER.init()` works inside a worker without a fetch. GitHub Pages cannot
  send COOP/COEP headers, so `SharedArrayBuffer` is unavailable: `postMessage` only.

## Decision

### 1. Scope and pacing
- **Loopback**: the authoritative `Sim` + `BotController` run in a module Web Worker (the
  "server"); the main thread is the client with a *predicted* `Sim`. Both ends talk through a link
  that delays every message by ½ RTT ± jitter, in order (as TCP/WebSocket). One human, any mode,
  `?net=loopback[&rtt=100][&jitter=10]`. Offline stays the default and is unchanged.
- **Command-paced server** (spike simplification): the server steps tick N when the player's
  input N arrives. No server clock, no input buffer, no starvation — so the authoritative run is
  *identical* to an offline run with the same player commands (§10 asserts it). M6 replaces the
  pacing (§14); the protocol already carries what M6 needs (`ackTick`, `viewTick`).

```
main thread (client, tick C)                                  worker (server)
1 link.receive(now): snapshots ≈ C − RTT and their events
2 newest snapshot → SnapshotBuffer; PredictedClient.reconcile:
  restore(S) · drop inputs ≤ ackTick · re-step S+1 … C−1
3 predicted step C (player command + tick-stamped controls)
4 link.send(input C)  ── ½RTT ± jitter, in order ──►  controls → stepMatch(sim, bots, {player: C})
5 present events per EVENT_SOURCE (§7)            ◄──  every NET.snapshotEveryTicks: snapshot
frame: beforeRender(α) → NetView: local pose (+ correction offset), remote poses at the render clock
```

### 2. Determinism
| Risk | Decision |
| --- | --- |
| Rapier, float order, `Math.*` | Deterministic for one build in one engine. Recordings and digests are same-build artefacts; Node (tests) and Chrome (worker) are never compared bit for bit — the client reconciles (NETWORKING §6). |
| Shared RNG | **Per-character gameplay streams** (below); `SimState.rng` keeps match-level draws (coin flips, zones). |
| Iteration order | Systems iterate state arrays; `Map`s are lookups or insertion-ordered from sorted input (`controller.ts`). Stays a review rule; the replay test catches violations. |
| Hidden inputs | State changes only through `Sim.create`, `spawnCharacter`, `control`, `step`. The recording logs exactly these calls *inside* `Sim` (§3). |
| State outside `SimState` | Snapshots are taken between steps; `restore` drops queued controls and undrained events and derives all Rapier state (§4). |
| `Command.tick` | Stays informational: hosts stamp the step tick, recordings drop it, a system that needs time reads `state.tick`. |
| Rebuilt broad phase | Restore is expected bit-exact; only `PREDICTION.reportM` is binding (§4). The DoD replay never restores. |

- **Per-character RNG.** `SimState.seed: number` (the creation seed, never changes) and
  `CharacterEntity.rng: RngState = createRng(characterSeed(state.seed, id))`, set in
  `createCharacter`. `rng.ts`: `RNG_DOMAIN = { character: 0x43484152 }` and
  `characterSeed(seed, id) = deriveSeed(deriveSeed(seed, RNG_DOMAIN.character), id)` — apart from
  the bot streams `deriveSeed(seed, id)`. `weapons.ts` draws spread from `e.rng`. The stream
  survives respawns and operator changes. Old `?seed=` values replay differently (none is stored).
- **One digest.** `digest(value: unknown): string` in `src/sim/snapshot.ts`: canonical walk (object
  keys sorted, arrays in order, numbers by their float64 bits so `−0`, `Infinity`, `NaN` are
  exact), 64-bit hash as 16 hex characters. It replaces the four JSON digests (N5).

### 3. Recording and replay (`src/sim/replay.ts`)
```ts
export const RECORDING_FORMAT = 1;
/** [entityId, moveX, moveZ, yaw, pitch, buttons] — the tick is the step's. */
export type RecordedCommand = [EntityId, number, number, number, number, number];
export type RecordedOp =
  | { op: 'spawn'; options: SpawnOptions }
  | { op: 'control'; msg: ControlMessage }             // queued; applied at the next step, as live
  | { op: 'step'; commands: RecordedCommand[] };        // ascending entity id
export interface MatchRecording {
  format: typeof RECORDING_FORMAT;
  levelId: string; mode: ModeId; seed: number;
  ops: RecordedOp[];                                    // every input since Sim.create, in call order
  checkpoints: { tick: number; digest: string }[];      // after the step, every REPLAY.checkpointEveryTicks
}
/** Sim.create with the recording's level, seed and mode, then its ops — no bots. Throws
 *  "replay diverged at tick N" at the first checkpoint that differs. */
export function replayRecording(rec: MatchRecording, onStep?: (sim: Sim, events: SimEvent[]) => void): Promise<Sim>;
// src/sim/sim.ts
static create(level: LevelDef, seed?: number, mode?: ModeId, options?: { record?: boolean }): Promise<Sim>;
readonly recording: Readonly<MatchRecording> | null;   // live log; structuredClone to export
```
- Recording lives **in `Sim`**, not in a wrapper: the client calls `control` outside
  `stepMatch`, and any caller holding the raw `Sim` would bypass a wrapper. `restore()` on a
  recording `Sim` throws (recordings start at creation).
- Plain data, JSON round-trips exactly (commands, spawn options and controls hold finite numbers).
  Size ≈ 10 characters × 60 Hz × 6 numbers ≈ 20 MB per 10 min in memory; opt-in (tests only in M2).
- **Reconciled with ADR-0012 R.** The DoD test is `replay.test.ts` (a full bot-driven match,
  §12). The scripted `sim.test.ts` test and R's ability extension move into `replay.test.ts` as its
  scripted case on `replayRecording` + `digest` (N5; or R itself if N1 has landed when R starts):
  one replay test file, one digest.

### 4. Snapshot and restore
```ts
// src/sim/sim.ts
snapshot(): SimState;                        // structuredClone(state); only between steps
restore(state: Readonly<SimState>): void;    // same level and mode (throws otherwise)
```
`restore`:
1. Clones `state`. The top-level `SimState` object (the `ctx` holds it) and every
   `CharacterEntity` whose id exists before and after **keep their identity** (`Object.assign`);
   nested objects are replaced; ids missing from the snapshot are removed.
2. Drops queued controls and undrained events.
3. Rebuilds physics from state, in this order: `syncCharacters`, `resetGadgets`,
   `setSetupWalls(rules.setupWallsUp(match))` (ADR-0013), `settle` — new `PhysicsWorld` methods
   (the sim derives profiles and shapes from content, as today):
   ```ts
   syncCharacters(list: readonly { id: EntityId; profile: HitboxProfileDef; pos: Vec3; yaw: number; stance: number; alive: boolean }[]): void;
   //   adds missing bodies, removeCharacter(id) for extra ones, setProfile when the profile object
   //   differs, applyStance, setActive, teleport
   resetGadgets(list: readonly { id: EntityId; shape: GadgetShape; pos: Vec3; yaw: number }[]): void;
   //   removes every gadget collider (pending removals too), re-adds the list
   settle(): void;   // one world.step(): scene queries index the moved and created colliders
   //   (kinematic bodies with next pose = pose, zero gravity: nothing moves)
   ```
- No Rapier byte snapshots (`world.takeSnapshot()`): large, platform-bound, and not what M6 sends.
- **Cost** (10 characters, Saltworks; estimates, `snapshot.test.ts` logs the measured values):
  clone ≈ 0.05 ms; physics ≈ 0.1–0.3 ms (≈ 110 collider updates + one step); a reconcile at
  100 ms RTT re-steps ≈ 6 ticks × ≈ 0.13 ms. Budget: reconcile ≤ 2 ms p95 on the reference machine.

### 5. Protocol and server (`src/net/`, Node-safe)
```ts
// src/net/protocol.ts
export interface MatchSetup { mode: ModeId; levelId: string; seed: number; tier: AiTier }
export type InputMessage = { type: 'input'; tick: number; command: Command; controls: ControlMessage[];
  /** The remote render tick the player saw when sampling (§8): measured now, lag compensation in M6. */
  viewTick: number };
export type ClientMessage = { type: 'join'; setup: MatchSetup } | InputMessage;
export type WelcomeMessage = { type: 'welcome'; playerId: EntityId; state: SimState; events: SimEvent[] };
export type SnapshotMessage = { type: 'snapshot'; ackTick: number; state: SimState;
  /** Every event since the previous snapshot (each carries its tick, ADR-0006). */
  events: SimEvent[] };
export type ServerMessage = WelcomeMessage | SnapshotMessage | { type: 'error'; message: string };

// src/net/server.ts — no timers: messages in, messages out
export class NetServer {
  static create(setup: MatchSetup, spawn: SpawnMatch): Promise<{ server: NetServer; welcome: WelcomeMessage }>;
  receive(msg: InputMessage): ServerMessage[];
  readonly stats: ServerStats;   // viewTick lag; JSON bytes of every NET.statsEveryTicks-th snapshot (M6 bandwidth baseline)
}
// src/ai/types.ts — the roster at setup, moved out of the client (§9)
export type SpawningSim = SimView & { spawnCharacter(o: SpawnOptions): CharacterEntity };
export interface MatchRoster { playerId: EntityId; slots: BotSlot[] }
export type SpawnMatch = (sim: SpawningSim, tier: AiTier) => MatchRoster;
```
- `create`: `Sim.create` → `spawn` → `createBotController` → `welcome` with the state and the
  setup events (bots observe them, as in `Session`).
- `receive`: `tick` must be `sim.state.tick + 1` and every control must name the player's own
  character — else an `error` message (a bug; never silently fixed). Then `sim.control(c)` for each
  control, `stepMatch(sim, bots, {player: {...command, tick}})`, events accumulate; every
  `NET.snapshotEveryTicks` a `snapshot` with `ackTick = tick`, `state = sim.snapshot()`.

### 6. Worker and loopback transport (`src/client/net/`)
- **`server.worker.ts`**: module worker; `join` → `NetServer.create(setup, MODE_SPAWNS[setup.mode])`
  (`initPhysics()` runs inside the worker); `input` → `receive` → `postMessage` each reply.
  Exceptions become `error` messages; the client throws them (visible boot/runtime error).
- **`loopback.ts`**: `LoopbackLink` owns the `Worker` and two `OrderedDelay`s (ms);
  `send(msg)` posts after the delay (`setTimeout`); `receive(nowMs)` returns the arrived messages
  that are due, in order. Polled once per client tick.
- **`src/net/delay.ts`** (Node-safe, unit-agnostic — the browser link in ms and the test link in
  ticks share it): `new OrderedDelay(oneWay, jitter, rng).schedule(now)` =
  `max(previous, now + oneWay + jitter × (2u − 1))`, never before `now`; `u` from
  `createRng(LOOPBACK.jitterSeed)` (reproducible e2e runs).
- **Vite**: `new Worker(new URL('./server.worker.ts', import.meta.url), { type: 'module' })`;
  `worker: { format: 'es', rolldownOptions: { output: { codeSplitting: { groups: CHUNK_GROUPS } } } }`
  with `CHUNK_GROUPS` hoisted from today's `build` block (one definition), so Rapier is its own
  chunk in the worker bundle too and no chunk crosses `chunkSizeWarningLimit`. `startApp` imports
  the net client dynamically only when `launch.net` is set: the default page never downloads the
  worker or a second Rapier (e2e asserts it).
- **ESLint** (`eslint.config.js`): `src/net/**` and `src/config/net.ts` join `BOUNDARY_FILES`
  (Node-safe rules); `src/client/net/*.worker.ts` gets `globals.worker` and `RENDER_IMPORTS`
  restrictions (no Three.js, no client or client-config imports), so the worker stays lean.
- **Launch**: `LAUNCH.params` gains `net`, `rtt`, `jitter`; `LaunchOptions.net: NetLaunch | null`
  with `NetLaunch = { transport: NetTransport; rttMs: number; jitterMs: number }` (defaults from
  `LOOPBACK`, bounds `maxRttMs`/`maxJitterMs`, a bad value fails the boot like every param).
  `launchSearch` leaves `net` out: a menu relaunch returns offline (Q3).

### 7. Client-side prediction (`src/net/predictor.ts`, `src/net/events.ts`)
```ts
export interface PendingInput { tick: number; command: Command; controls: ControlMessage[] }
export class PredictedClient {
  static create(setup: MatchSetup, welcome: WelcomeMessage): Promise<PredictedClient>;  // Sim.create + restore
  readonly sim: Sim;               // the predicted world; bots never run here
  readonly playerId: EntityId;
  /** restore(msg.state); drop pending ≤ ackTick; re-step the rest (controls, then the command). */
  reconcile(msg: SnapshotMessage): { correction: Vec3; replayed: SimEvent[] };
  /** One local tick: the controls, then a step with the player's command only. */
  step(command: Command, controls: readonly ControlMessage[], viewTick: number): { input: InputMessage; events: SimEvent[] };
}
```
- Remote characters get no command in the predicted world (the sim's idle command): they stand
  where the snapshot put them, which is all prediction needs from them (collisions).
- Only the newest arrived snapshot reconciles; older ones feed the buffer and their events.
- Pending inputs must be contiguous from `ackTick + 1`; more than `NET.maxPendingTicks` → throws
  (the server stopped answering).
- **Controls are tick-stamped** (sent with the input of the tick they apply to) and predicted
  like commands; a refused pick or a teleport the server saw differently is corrected by the next
  snapshot.
- **Correction smoothing**: `err = pos(C−1) before − after reconcile`; `|err| ≤ PREDICTION.snapM`
  → `offset += err`, else `offset = 0` (snap: spawns, teleports, round resets). The view shows
  `pos + offset`; the offset halves every `PREDICTION.smoothingHalfLifeSeconds` of frame time.
  Look angles are input-owned (ADR-0009) and never corrected; recoil/ADS snap (sub-degree, only
  on a misprediction).

| Predicted (from the predicted sim, at once) | Not predicted (server) |
| --- | --- |
| movement, stance, sprint, jump, look + recoil, ADS, fire cadence, spread (own stream), ammo, reload, swap, ability activation and resources, own gadget placement and projectiles, own impacts and bursts, footsteps, own spawns, controls | other characters (interpolated, §8); health, shields, deaths, kills; hit markers and damage numbers (≈ RTT + ≤ one snapshot interval, Q2); match phase, clock, score, banners |

**Event routing** — one table, total over `SimEventType`, so a new event type does not compile
until it is classified:
```ts
export type EventSource = 'predicted' | 'server';
export const EVENT_SOURCE: Record<SimEventType, EventSource>;
/** The character whose own action the event is; null for world/match events. */
export function eventActor(ev: SimEvent): EntityId | null;
export class EventPresenter {
  fromPrediction(events: readonly SimEvent[], localId: EntityId): SimEvent[];  // forward step and re-steps
  fromServer(events: readonly SimEvent[], localId: EntityId): SimEvent[];
  prune(ackTick: number): void;
}
```
- `predicted`: `shot`, `impact` (actor `attackerId`), `reloadStart`, `reloadEnd`, `dryFire`,
  `weaponSwap`, `footstep`, `spawn`, `operatorChanged`, `ability`, `abilityEnd`, `abilityFailed`,
  `gadgetPlaced` (actor `ownerId`), `burst` (actor `ownerId`). `server`: `hit`, `kill`,
  `gadgetHit`, `gadgetDestroyed`, `revealed`, `shieldGained`, `shieldBroken`, `healed`, `phase`,
  `roundEnd`, `matchEnd`, `uplink`.
- A `predicted` event is presented from the prediction when its actor is the local player, from
  the server otherwise; the server's copies of local `predicted` events are dropped.
- Re-steps emit their ticks' events again: a multiset keyed by `type | tick | actor` presents only
  the *extra* ones (e.g. a local `spawn` the first prediction missed — the look must be re-synced
  on it, ADR-0011 §10). `prune(ackTick)` forgets older keys.

### 8. Remote interpolation and the view (`src/sim/pose.ts`, `src/net/interpolation.ts`, `src/net/view.ts`)
```ts
// src/sim/pose.ts — the one list of interpolated character values (Sim.step's "store prev*"
// block becomes storePrevPose; the net view reads the same list)
export interface CharacterPose { pos: Vec3; yaw: number; pitch: number; stance: number;
  recoilPitch: number; recoilYaw: number; ads: number; swapRemaining: number }
export function currentPose(e: Readonly<CharacterEntity>): CharacterPose;
export function storePrevPose(e: CharacterEntity): void;
export function lerpPose(a: CharacterPose, b: CharacterPose, t: number): CharacterPose;  // angles via angleDelta
export function setPose(e: CharacterEntity, p: CharacterPose): void;                     // current = prev* = p

// src/net/interpolation.ts
export class SnapshotBuffer {    // the last INTERPOLATION.bufferSnapshots server states
  push(state: SimState): void;
  readonly newest: SimState | null;
  bracket(tick: number): { a: SimState; b: SimState; t: number; starved: boolean } | null;  // past the newest: hold it (starved)
}
export class RenderClock {       // remote render time, in ticks
  advance(newestTick: number): void;   // per client tick: +1, then close INTERPOLATION.catchUp of the gap
                                       // to newestTick − delaySnapshots × NET.snapshotEveryTicks; jump beyond snapTicks
  at(alpha: number): number;
}
```
- Remote pose = `lerpPose(a, b, t)`; no lerp (take `b`) when the character is missing in `a`,
  `alive` or `operatorId` differ, or it moved more than `INTERPOLATION.teleportM`. No
  extrapolation: starved frames hold the newest pose and are counted.
- **`NetView`** (satisfies the client's `MatchView`, §9; one object per session). `query` and
  `accepts` are the predicted sim's. `refreshLocal()` runs after every client step (so event
  handlers read the tick's recoil) and every frame; `compose(renderTick)` every frame:

| View field | Source |
| --- | --- |
| `tick`, `time`, `match` (phase, clock, score, channel) | latest snapshot |
| local character | predicted sim (shallow copy into one stable object); `health`, `alive`, `deadTime`, `shields` from the latest snapshot; `pos`/`prevPos` + correction offset |
| remote characters | snapshot `b`'s entity with the interpolated pose (`setPose`) |
| `gadgets`, `projectiles`, `areas` | predicted sim — they evolve without inputs, so it continues them exactly; only the local player's own actions on them are predictions |

### 9. Client seam (`src/client/match.ts`)
```ts
/** What hosts and the app read. Offline: the Sim. Online: NetView. */
export interface MatchView extends SimView {
  getCharacter(id: EntityId): CharacterEntity | undefined;
  accepts(msg: ControlMessage): boolean;                        // ADR-0013
}
export interface ClientMatch {
  readonly launch: LaunchOptions;
  readonly host: ModeHost;
  readonly view: MatchView;
  readonly player: CharacterEntity;        // one object for the session
  readonly clientTick: number;             // the last tick this client stepped (offline = sim tick; online = predicted)
  step(command: Command): SimEvent[];      // the events to present
  control(msg: ControlMessage): void;      // online: stamped with the next tick, predicted, sent
  takeSetupEvents(): SimEvent[];
  beforeRender(alpha: number): void;       // online: render clock, NetView.compose, offset decay
  readonly staging: MatchStaging | null;   // offline only: Session's QA members (setQaCommand, botsIdle, advanceTicks)
  readonly net: { stats(): NetStats } | null;   // online only; NetStats in src/net/metrics.ts
}
```
- `Session` implements it (`view = sim`, `beforeRender` no-op); `NetSession`
  (`client/net/netSession.ts`) implements it over `LoopbackLink` + `PredictedClient` +
  `SnapshotBuffer`/`RenderClock` + `EventPresenter` + `NetView`, and measures reconcile time and
  the hit-confirm delay (`performance.now()` is client-side only).
- **Roster out of the client**: the `spawn` bodies of `rangeHost` and ADR-0013's `sideHost` move
  unchanged to `src/ai/spawn.ts` as `MODE_SPAWNS: Record<ModeId, SpawnMatch>`; `ModeHost.spawn` is
  removed; host methods take `MatchView` instead of `Sim` (type-only).
- **App**: `this.sim` → `session.view`; `sim.control` → `session.control`; commands for
  `session.clientTick + 1`; `session.beforeRender(alpha)` before `render`; the debug overlay adds a
  NET line (rtt ± jitter, pending, mispredictions, max correction, reconcile ms, render lag,
  starved frames). QA: `__qa.net(): NetStats | null`; staging (`setQaCommand`, `botsIdle`, shots,
  `advanceTicks`) throws "offline only (ADR-0014)" online; `state()`, `events()` (presented),
  `setButtons`, `aimAt`, `teleport`, `selectOperator`, `waitTicks` (client ticks) work online.

### 10. Measuring "feel unchanged"
`tests/unit/support/netHarness.ts` runs the same seed and the same scripted player input twice
in Node: **offline** (`Sim` + `stepMatch`) and **net** (`NetServer` + `PredictedClient` +
`NetView` over a tick link built from `OrderedDelay`; `rttTicks = secondsToTicks(LOOPBACK.rttMs /
1000)`, jitter likewise). Metrics:
- **Extra input latency** per script edge (move start/stop, jump, crouch, fire, ADS, reload,
  swap, ability): first tick with a predicted response − the offline tick. Must be **0**.
- **Prediction error**: max over client ticks of |predicted − offline| local position, and
  equality of recoil, bloom, ammo, stance per tick. ≤ `PREDICTION.reportM`.
- **Mispredictions**: reconciles with |correction| > `PREDICTION.reportM`.
- **Hit-confirm delay**: presentation tick − `hit.tick`, within
  `[rttTicks − 2·jitterTicks, rttTicks + 2·jitterTicks + NET.snapshotEveryTicks + 1]` (jitter
  both ways, the wait for the next snapshot, one tick of polling).
- **Authority unchanged**: `digest(server state) === digest(offline state)` at the end.
- Logged: reconcile ms p50/p95, render lag, starved frames, snapshot JSON bytes.

| Scenario | Setup | Asserts |
| --- | --- | --- |
| Movement | range, away from dummies: walk, sprint, stop, jump, crouch-walk, strafe, ADS-walk, Wisp's dash, Kestrel's Updraft | extra latency 0; error ≤ `reportM`; 0 mispredictions; authority unchanged |
| Shooting | range, standing dummy at 15 m: ADS bursts with every playable operator's primary and secondary, reload, swap | as movement; confirmed hits = offline hits (zone, damage, tick); predicted impacts = offline impacts; confirm delay in bounds |
| Contact | Saltworks, `relay`, 10 medium bots, view-independent player script through setup and 60 s of `live` | authority unchanged; corrections > `snapM` only at spawns/deaths/resets; costs logged |
| RTT 0 | shooting script, `rtt 0`, `jitter 0` | presented events = offline events (type, tick, order) |
| Moving target | range, strafing dummy at 15 m, the script aims at the *view* torso | nothing — logs hit ratio net vs offline: the M6 lag-compensation baseline (Q1) |

**Playwright** (`tests/e2e/net.spec.ts`): `?mode=range&net=loopback&rtt=100&seed=…` loads;
`__qa.net()` reports the loopback, `ackTick` advances, pending > 0; aim at a dummy and fire → a
presented `shot` in the tick of its command and a presented `hit` ≥ 1 tick later; `teleport`
moves the player (a control through the server); `?net=loopback` on the default mode shows the full
roster and the round HUD; the page without `?net` requests no worker script; clean console and
network (worker errors arrive as `error` messages → `console.error`). Headless runs at ~5 fps
(tick cap), so the spec bounds ticks, never milliseconds.

### 11. Configuration
`src/config/net.ts` (new, Node-safe — the server, the predictor and the tests read it; CLAUDE.md
gains a row):
```ts
export const NET_TRANSPORTS = ['loopback'] as const;          // M6 adds 'websocket'
export type NetTransport = (typeof NET_TRANSPORTS)[number];
export const NET = { snapshotEveryTicks: 2 /* 30 Hz, NETWORKING §1 */, maxPendingTicks: 180, statsEveryTicks: 30 } as const;
export const LOOPBACK = { rttMs: 100 /* the DoD value */, jitterMs: 10, jitterSeed: 0x6c6f6f70, maxRttMs: 1000, maxJitterMs: 200 } as const;
export const PREDICTION = { snapM: 1, smoothingHalfLifeSeconds: 0.025, reportM: 0.001 } as const;
export const INTERPOLATION = { delaySnapshots: 2, catchUp: 0.05, snapTicks: 12, bufferSnapshots: 32, teleportM: 3 } as const;
```
`src/config/sim.ts`: `REPLAY = { checkpointEveryTicks: 600 }`. `src/config/client.ts`:
`LAUNCH.params.net/rtt/jitter` and the NET overlay label only. `rng.ts`: `RNG_DOMAIN`.

### 12. Tests (real `Sim` in Node unless noted; `+` = new file)
| File | Batch | Proves |
| --- | --- | --- |
| `replay.test.ts`+ | N1 | **DoD**: a full Relay match (first to 4) with 10 medium bots, recorded (bot commands *and* bot picks), JSON round trip, `replayRecording` without bots → final `SimState` `toStrictEqual` and equal event-stream digest; a flipped button changes the digest; a character's spread samples are the same whether or not another character fires; character streams ≠ bot streams for one id; `digest` separates `−0`/`0` and `Infinity`/`null`, ignores key order |
| `snapshot.test.ts`+ | N1 | `restore(snapshot T)` + the same commands ≡ the uninterrupted run at T + k (`digest`), into a fresh `Sim` and back in time in the same one; crouched, dead, mid-reload, mid-swap, operator changed (hitbox profile), gadgets (a barrier still blocks; a pending removal is gone), setup walls, a round reset in the window; entity identity kept; controls/events dropped; logs snapshot and restore cost |
| `net-core.test.ts`+ (pure) | N2 | `OrderedDelay` never reorders or delivers early; `EVENT_SOURCE`/`eventActor` for every type; presenter dedupe (re-step duplicates dropped, a missed local spawn presented, prune); `lerpPose` shortest-arc yaw and the no-lerp rules; `RenderClock` converges and snaps; `SnapshotBuffer` brackets and starves |
| `net-loopback.test.ts`+ | N2 | §10 scenarios |
| `launch.test.ts` | N3 | `?net=loopback&rtt=&jitter=`: defaults, bounds, errors, absent → `null` |
| `tests/e2e/net.spec.ts`+ | N4 | §10 Playwright |

### 13. Implementation batches (disjoint file ownership)
Waves: **A** = N1 after ADR-0012 F and ADR-0013 R1 (they own `sim.ts`, `types.ts`, `world.ts`,
`entities.ts`, `weapons.ts`); N1 runs alongside ADR-0012 wave B/C and ADR-0013 R2/R3, which own
none of its files. **B** = N2 (alongside ADR-0012 wave C). **C** = N3 once *every* M2 client batch
has landed (ADR-0012 U, V; ADR-0013 R1, R3, R4 — they own `app.ts`, `session.ts`, `qa.ts`,
`modes/*`, `config/client.ts`). **D** = N4. **E** = N5. N1 lands the per-character RNG first, in
its own commit, and announces it: seeded outcomes change for wave-B agents (a statistical test
that flips gets a new sample, never a different RNG). N1 may make compile-only edits to test
fixtures that build `CharacterEntity`/`SimState` literals. Contract files after N2:
`net/protocol.ts`, `config/net.ts`; after N3: `client/match.ts`. Every batch ends with
`npm run check`. Paths under `src/` unless noted.

| Batch | Owns | Tests | Needs |
| --- | --- | --- | --- |
| **N1 Determinism + snapshots** | `sim/types.ts` (`SimState.seed`, `CharacterEntity.rng`), `sim/rng.ts`, `sim/entities.ts`, `sim/systems/weapons.ts` (spread stream), `sim/sim.ts` (`snapshot`, `restore`, record option, `storePrevPose`), `sim/physics/world.ts` (`syncCharacters`, `removeCharacter`, `resetGadgets`, `settle`), `sim/snapshot.ts`+, `sim/pose.ts`+, `sim/replay.ts`+, `config/sim.ts` (`REPLAY` only) | `replay.test.ts`+, `snapshot.test.ts`+ | ADR-0012 F, ADR-0013 R1 |
| **N2 Net core** | `config/net.ts`+, `net/protocol.ts`+, `net/delay.ts`+, `net/server.ts`+, `net/predictor.ts`+, `net/events.ts`+, `net/interpolation.ts`+, `net/view.ts`+, `net/metrics.ts`+, `ai/types.ts` (`SpawningSim`, `MatchRoster`, `SpawnMatch` only), `eslint.config.js` | `net-core.test.ts`+, `net-loopback.test.ts`+, `tests/unit/support/netHarness.ts`+ (rosters built as `match.test.ts` does) | N1 |
| **N3 Client seam** | `client/match.ts`+, `ai/spawn.ts`+ (moved roster code), `client/modes/*`, `client/session.ts`, `client/app.ts`, `client/qa.ts`, `client/launch.ts`, `config/client.ts` (launch params, overlay label), `client/net/netSession.ts`+ as a stub (final signature, `create` throws "net client not built") | `launch.test.ts`; offline e2e unchanged (pure refactor) | N2; ADR-0012 U, V; ADR-0013 R1, R3, R4 |
| **N4 Net client** | `client/net/netSession.ts`, `client/net/loopback.ts`+, `client/net/server.worker.ts`+, `vite.config.ts` | `tests/e2e/net.spec.ts`+; `npm run build` shows the worker and its Rapier chunk, no new size warning | N3 |
| **N5 Integration** (coordinator) | scripted replay test from `sim.test.ts` → `replay.test.ts`; `digest` in `bots`/`elimination`/`match` tests; NETWORKING (as built), ARCHITECTURE (§1, §2, §3, §4, §7, §10, §11, §14), CLAUDE.md (config row, boundary list, `src/net/`), ROADMAP, PROJECT_STATE (measured costs, snapshot bytes, moving-target baseline), ADR index; a human plays `?net=loopback&rtt=100` and offline back to back | `npm run check` | N4, ADR-0012 R |

### 14. What M6 replaces and keeps
| Spike (M2) | M6 |
| --- | --- |
| Worker + `LoopbackLink`, structured clone | WebSocket to a Node process running `NetServer`; binary codec (must encode `Infinity`, `−0`); delta snapshots against the last acked |
| Command-paced server, one human | Clock-paced server at `SIM.tickRate`; per-client input buffers (starved → repeat the last command; late → dropped); client clock sync + time dilation towards a target buffer depth |
| Full `SimState` to the client | Per-client snapshots; hidden enemies culled (interest management) |
| `viewTick` measured only | Hitbox rewind to `viewTick` (NETWORKING §4) |
| Fixed interpolation delay; reconcile on every snapshot | Delay adapted to measured jitter; skip the reconcile when the acked local state matches the predicted history |

Kept: the message shapes, `NetServer`'s step rules, `PredictedClient`, `EVENT_SOURCE` and the
presenter, `NetView`, `ClientMatch`, `Sim.snapshot`/`restore`, recordings, per-character RNG,
`digest`.

### 15. Open questions for the user (defaults used until answered)
1. **Hitting moving targets at 100 ms.** Without lag compensation the server checks shots against
   where targets are *now*, while the player sees them ≈ RTT + interpolation delay in the past.
   Default: the DoD's "shooting feel" = identical local feedback (flash, recoil, spread, ammo,
   impacts) and identical registration on stationary targets; the moving-target hit ratio is
   measured (§10) and fixed by M6's rewind. Alternative: pull a minimal hitbox rewind into M2 as an
   extra batch (`weapons.ts`, `world.ts`; `viewTick` is already in the input).
2. **Hit markers** wait for the server (≈ 100–130 ms at 100 ms RTT, NETWORKING §2). Default: yes.
   Alternative: predicted markers — phantom hits on moving targets without Q1's rewind.
3. **Visibility of the net mode.** Default: URL-only (`?net=loopback`, dev/QA; the overlay shows
   the NET line; a menu relaunch returns offline). Alternative: a "simulated latency" setting.

## Consequences
- The authoritative simulation is provably unchanged by the transport (server digest = offline
  digest); the spike tests prediction, interpolation and event routing on top, in Node and in the
  browser.
- `SimState` grows by `seed` and one `RngState` per character; snapshots are plain clones and
  include ADR-0012's world objects and ADR-0013's match state unchanged. M5's destruction state
  must be restorable by `restore` from day one (the snapshot test gets a case).
- Replays are command logs recorded inside `Sim` and replayed without bots; a new input path that
  bypasses `Sim`'s four entry points fails the DoD test.
- The client codes against `ClientMatch`/`MatchView`, not `Sim`; hosts no longer spawn; the roster
  code runs in Node (worker now, server in M6).
- Two Rapier instances run in net mode (main thread and worker); the default page is unaffected.
- Rejected: Rapier byte snapshots for restore (size, platform-bound, not what M6 sends); a
  recording wrapper around `Sim` (bypassable); a clock-paced server with time dilation in M2 (no
  gain with one human, all of it M6); predicting or extrapolating remote characters (wrong on every
  direction change; NETWORKING §3); bots in the predicted world (hidden information, double cost);
  keeping the shared spread RNG (own shots unpredictable); `SharedArrayBuffer` (needs COOP/COEP,
  impossible on GitHub Pages); importing the client mode hosts into the worker (DOM modules, no
  Node path for M6).
