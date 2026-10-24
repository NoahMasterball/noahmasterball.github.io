# Networking plan (M6)

*Status: plan only. Nothing here is implemented. Offline play (M1–M5) runs entirely in the
browser on GitHub Pages; online PvP needs a separately hosted server.*

## 1. Model: authoritative server

- A **Node.js process** runs the *same* simulation code (`src/sim/`, `src/data/`,
  `src/config/sim.ts`, and `src/ai/` for bots filling empty slots). It is the only authority
  over gameplay state: positions, health, ammo, cooldowns, round state.
- Transport: **WebSocket** (binary frames) for the first version — simple, works through
  proxies, same code path in Node and browser. WebTransport/datagrams are a later
  optimisation for unreliable snapshot delivery.
- Clients send **Commands** (the exact type the offline game already uses) and receive
  **snapshots** and **events**.
- Tick rate: the simulation tick (`SIM.tickRate`). Snapshot send rate may be lower
  (e.g. 30 Hz) with delta compression against the last acknowledged snapshot.

## 2. Client-side prediction (local player)

- The client runs the simulation for its own operator every tick using its own commands,
  immediately — the local game already works this way.
- Each command carries its `tick`. The server acknowledges the last processed command per
  client in every snapshot.
- On a snapshot the client **reconciles**: restore the authoritative state for its operator,
  then re-simulate all unacknowledged commands. Small corrections are smoothed visually
  (render offset decays over ~100 ms); large ones snap.
- Predicted locally: movement, stance, sprint, ADS, reload timing, ability *activation
  feedback*, muzzle flash and sound. **Not** predicted: damage and deaths (shown only when
  confirmed), to avoid phantom kills. Hit markers wait for server confirmation (≈ RTT).

## 3. Interpolation (remote entities)

- Remote operators are rendered **in the past**: at `serverTime − interpolationDelay`,
  interpolating between the two surrounding snapshots. Delay = 2 snapshot intervals plus
  jitter buffer (≈ 70–100 ms at 30 Hz).
- The offline client already renders every entity by interpolating between `prev*` and
  current values; online, the same render code reads from a snapshot buffer instead.

## 4. Lag compensation for hitscan

- The server keeps a **history ring buffer** of hitbox poses (per entity: position, yaw,
  stance) for the last ~500 ms of ticks.
- A fire command carries the client's **view tick** (the interpolated time the shooter saw).
  The server rewinds all *other* entities' hitbox colliders to that tick (bounded by a max
  rewind, e.g. 250 ms), performs the ray cast with the same `castRayAndGetNormal` code, then
  restores them.
- Because hitboxes are separate sensor colliders in their own collision group, rewinding moves
  only those colliders; the movement capsules and static geometry are untouched.
- Favour-the-shooter is capped to limit "shot behind cover" complaints at high ping.

## 5. Why the current architecture supports this

| Requirement | Already true in Phase 1 |
| --- | --- |
| Simulation runs without a browser | `src/sim/` has no Three.js/DOM imports (ESLint-enforced); Vitest runs it in Node with Rapier. |
| Input is serialisable | `Command {tick, moveX, moveZ, yaw, pitch, buttons}`; buttons are held-state bits, edges derived in the sim. |
| Bots and players are interchangeable | Bots emit the same `Command` type; the server can fill empty slots. |
| Fixed tick | Single `SIM.tickRate` constant; the sim never reads wall-clock time. |
| Deterministic randomness | Seeded RNG in `SimState`; spread samples are reproducible and server-checkable. |
| State is snapshot-friendly | `SimState` holds plain data; Rapier handles live in side tables that can be rebuilt. Rapier also offers `world.takeSnapshot()` for full physics snapshots. |
| Render reads, never writes | Client reads state and drains events; interpolation already uses `prev*` values. |
| Rare requests separated from ticks | `ControlMessage` (select operator, teleport) maps to reliable RPCs. |

## 6. Open risks and notes

- **Cross-platform float determinism** is *not* required: the server is authoritative and the
  client reconciles. Replay/determinism tests (M2) run on one platform. If lockstep or exact
  cross-machine replays become a goal, switch to Rapier's deterministic build.
- **Rewind cost:** moving hitbox colliders per shot is cheap (one sensor per hitbox part), but
  must be measured with 10 players at the tick rate.
- **Hosting:** GitHub Pages cannot run the server. Needs a decision (small VPS, container host
  or a game-server service) and a budget — to be raised with the user at M6.
- **Cheating:** the authoritative model prevents speed/teleport/damage hacks; aim-assist
  cheats are out of scope (SPEC §17).
