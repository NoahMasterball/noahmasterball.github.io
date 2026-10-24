# ADR-0013 — Relay mode: phases, uplink, operator select, objective bots

*Status: accepted · 2026-09-30*

## Context
M2 builds Relay (SPEC §4.1), the primary mode: operator select → setup → engagement → uplink
running, first to `MATCH_FORMAT.roundsToWin`. ADR-0011 left the foundation: the mode registry
(`MODES`, `ModeRules`), `MATCH_FORMAT` and the pure format helpers (sides, coin flips, side swap,
overtime, spawn zones, `decideRound`), `respawnAt`, bots on `stepMatch`, mode hosts, the round
HUD, the kill feed and the death camera. DoD (ROADMAP M2): a full Relay match (first to 4)
completes vs. bots without errors; the round flow is covered by a sim-level unit test and a
Playwright test. ADR-0012 (ability framework, written in parallel) owns abilities, gadgets and bot
ability use; this ADR only defines the gate Relay needs from it.

What the existing code forces:
- `ModeRules.frozen(match)` is match-wide; setup freezes only the attackers (bots must not read a
  movement block as "stuck").
- `ModeRules.tick` (step 2) never sees the tick's commands; the plant needs held buttons.
- Elimination's round flow (`enterPhase`, `endRound`, `resetRound`) is private, and
  `eliminationWinner` treats the end of *any* phase as the round clock (wrong in setup).
- `BotController` emits only `Command`s; a bot's operator pick is a `ControlMessage`.
- `brain.ts` (`roundKey`, `planRound`) and `app.ts` (`matchLine`, `matchPhase`) test
  `mode === 'elimination'` to mean "a round mode".
- `PLAYABLE_OPERATORS` has 4 operators, a team 5 players: SPEC's "an operator can be picked once
  per team" cannot hold today.
- Nothing stops a defender from leaving the building during setup and killing frozen attackers
  (SPEC §13 asks for hard boundaries).
- `ModeId = MatchState['mode']`: `MODES`, `MODE_HOSTS`, `LAUNCH.defaultLevel` and `MODE_TEXT`
  do not compile until `relay` exists on the sim *and* the client side.
- Playwright on software WebGL (~5 fps, tick cap) cannot wait out 50 s of select + setup.

## Decision

### 1. Phases and match state
`src/sim/modes/relay.ts` (new) exports `RELAY_RULES`, registered as `relay` in `MODES` (after
`elimination`). Where a phase means the same as in elimination it keeps the id — the frozen round
opening with operator choice is `preRound`, the round-clock phase is `live` — so callout resets,
stingers and bot planning work unchanged.

| Phase | SPEC name | Clock (`RELAY`) | Living characters may | Then |
| --- | --- | --- | --- | --- |
| `preRound` | Operator select | `preRoundSeconds` 20 | look; `selectOperator` accepted (§3) | `setup` |
| `setup` | Setup | `setupSeconds` 30 | defenders: everything, inside the setup walls; attackers: look + abilities the gate allows (§4) | `live` |
| `live` | Engagement | `engagementSeconds` 150 | everything; a channeller only looks (§5) | `uplink` on a plant, else `roundEnd` (§6) |
| `uplink` | Uplink running | `uplinkSeconds` 40 | as `live` | `roundEnd` (§6) |
| `roundEnd` | — | `roundEndSeconds` 5 | everything, result locked (as elimination) | next `preRound`, or `matchEnd` |
| `matchEnd` | — | none (terminal) | look | — |

`teleport` (QA) is always accepted, as in elimination.

```ts
// src/sim/types.ts
export type EliminationPhase = 'preRound' | 'live' | 'roundEnd' | 'matchEnd';
export type RelayPhase = 'preRound' | 'setup' | 'live' | 'uplink' | 'roundEnd' | 'matchEnd';
export type MatchPhase = EliminationPhase | RelayPhase;          // `phase` events, ShotDef.phase
export type RoundEndReason = 'elimination' | 'timeout' | 'uplink' | 'disrupted';
/** What every side-based round mode keeps (today's EliminationMatch minus mode and phase). */
export interface RoundMatchBase {
  round: number; phaseEndTick: number | null; score: Score;
  attackingTeam: number; attackZoneId: string; lastWinner: number | null;
}
export interface EliminationMatch extends RoundMatchBase { mode: 'elimination'; phase: EliminationPhase }
export type UplinkAction = 'plant' | 'disrupt';
/** A plant or disrupt being channelled (§5). */
export interface UplinkChannel { action: UplinkAction; entityId: EntityId; siteId: string; startTick: number; endTick: number }
export interface RelayMatch extends RoundMatchBase {
  mode: 'relay'; phase: RelayPhase;
  channel: UplinkChannel | null;
  /** The planted uplink (phase `uplink`): its site and the planter's feet. */
  uplink: { siteId: string; pos: Vec3 } | null;
}
export type RoundMatch = EliminationMatch | RelayMatch;
export type MatchState = { mode: 'range' } | RoundMatch;
// SimEvent gains { type: 'uplink'; action: UplinkAction; stage: 'start' | 'cancel' | 'complete';
//   entityId; siteId; pos: Vec3 }; abilityFailed.reason gains 'blocked' (§4).
```

```ts
// src/config/sim.ts — SPEC §4.1 proposals accepted 2026-09-27; the SPEC table then links here.
export const RELAY = {
  preRoundSeconds: 20, setupSeconds: 30, engagementSeconds: 150, uplinkSeconds: 40, roundEndSeconds: 5,
  attackZone: 'random' as AttackZonePick,
  /** Proposal values (the SPEC names none): hold interact this long; disrupt within this radius. */
  plantSeconds: 4, disruptSeconds: 6, disruptRadiusM: 2,
  /** "Recon abilities only": an attacker's ability qualifies in setup if every effect is of these kinds. */
  setupAttackerEffects: ['reveal'] as readonly EffectKind[],
} as const;
// MATCH gains playerTeam: 0 (moved from ELIMINATION: defaultRoster serves both modes).
// AI gains relay: { pickDelaySeconds: 3, rushSeconds: 45, finishChannelSeconds: 1, approachFraction: 0.5 }
//   and hearing.uplinkRadiusM: 30 (plant/disrupt starts; walls ignored like every M1 sound).
```

### 2. Shared round flow (extracted from `elimination.ts`)
Nothing of the round flow is duplicated: elimination's private helpers move, unchanged in
behaviour (its tests stay green), to `src/sim/modes/rounds.ts` (new):

```ts
export function ageDead(ctx: SimContext, dt: number): void;
export function openingFields(ctx: SimContext, attackZone: AttackZonePick): RoundMatchBase;     // round 1: coin flip + zone
export function beginPhase<M extends RoundMatch>(ctx: SimContext, m: M, phase: M['phase'], ticks: number | null): void; // emits `phase`; null = terminal
export function aliveBySide(ctx: SimContext, m: Pick<RoundMatchBase, 'attackingTeam'>): Record<Side, number>;
export function bookRound(ctx: SimContext, m: RoundMatch, result: RoundResult): void;           // score, lastWinner, `roundEnd`
/** End of the result phase: `matchEnd` event → 'matchEnd'; else the next round's sides
 *  (MATCH_FORMAT), attack zone and respawns (respawnAt) → 'next'. The caller begins the phase. */
export function closeRound(ctx: SimContext, m: RoundMatch, attackZone: AttackZonePick): 'next' | 'matchEnd';
```
- `eliminationWinner` = `decideRound(m, aliveBySide(ctx, m), timedOut)`, still exported.
- `format.ts`: `SideMatch` picks from `RoundMatchBase`; `roundMatchOf(match): RoundMatch | null`
  replaces every `mode === 'elimination'`-means-rounds test (`brain.ts`, `app.ts`);
  `defaultRoster` moves here (player = slot 0 of `MATCH.playerTeam`).
- `ModeRules` (`mode.ts`) — every new member is a pure function of the match state:
  ```ts
  frozen(match: MatchState, team: number): boolean;   // was frozen(match): per team for setup (§4)
  abilityAllowed(match: MatchState, e: Readonly<CharacterEntity>, ability: AbilityDef): boolean; // §4
  setupWallsUp(match: MatchState): boolean;            // §4
  // modes/index.ts: matchFrozen(match, team), matchAbilityAllowed(match, e, ability), matchSetupWallsUp(match)
  // range: false / true / false · elimination: its FROZEN_PHASES for every team / true / false
  ```
- `Sim` gains `accepts(msg: ControlMessage): boolean` (the rules' `acceptsControl` now,
  read-only — UIs grey out picks with it) and calls `physics.setSetupWalls(rules.setupWallsUp(match))`
  after step 2 and after `initialMatch`, so the walls follow the match state (snapshot-safe).

### 3. Operator select (`preRound`)
- **Pickable** = `PLAYABLE_OPERATORS` (`config/sim.ts`, already mode-neutral). The alias
  `RANGE_MODE.playableOperators` and `ModeHost.playableOperators` are removed; the range host, the
  O key, `content.test.ts`, SPEC §7/§10.2 and the CLAUDE.md checklist name `PLAYABLE_OPERATORS`.
- **Limit** per team: `operatorPickLimit() = ceil(MATCH.teamSize / PLAYABLE_OPERATORS.length)` —
  SPEC's "once" as soon as a team can be filled with distinct operators; 2 today (Q1).
- **Player**: the existing `selectOperator` is accepted iff phase `preRound`, the id is in
  `PLAYABLE_OPERATORS` and `pickAllowed` holds. One pure rule for the sim, the select screen and
  the bots:
  ```ts
  /** Fewer than operatorPickLimit() of the *other* members of the team have `operatorId`. */
  export function pickAllowed(team: readonly Pick<CharacterEntity, 'id' | 'operatorId'>[], entityId: EntityId, operatorId: string): boolean;
  ```
- **No timeout or auto-pick**: every character always has an operator (round 1: `defaultRoster`,
  whose cycling stays within the limit; later: last round's). The phase just ends.
- **Bots** (`src/ai/picks.ts`, new): at the first `controls()` call ≥ `AI.relay.pickDelaySeconds`
  into a Relay `preRound` (the player picks first), each team draws a permutation p of
  `PLAYABLE_OPERATORS` from its `TeamPlan` stream; bot i (entity-id order) takes the first of
  p[i], p[i+1], … (cyclic) that `pickAllowed` accepts on a scratch roster updated in queue order —
  exactly what the sim will accept. With 4 bots and 4 operators each operator is taken once on
  the player's team, so every operator stays open to the player. `TeamPlan.pickedRound` marks it.
  ```ts
  export function botPicks(view: SimView, botIds: readonly EntityId[], rng: RngState): ControlMessage[];
  // src/ai/types.ts: BotController gains controls(tick: number): ControlMessage[];
  //   SteppableSim gains control(msg); stepMatch queues controls before commands(); the session's
  //   QA wrapper forwards them ([] while botsIdle).
  ```

### 4. Setup
- **Attackers are held by the freeze**: `frozen(match, attackingTeam)` is true in `setup`
  (bots stand and look); their `filterCommand` keeps the look and the `ABILITY_BUTTONS` bits
  (`preRound`/`matchEnd`: look only, everyone).
- **Defenders stay in the building by setup walls** (SPEC §13): level data, movement-only
  colliders that stand while `setupWallsUp(match)` (Relay: phase `setup`). They block every
  character; attackers are frozen anyway.
  ```ts
  // src/data/schema.ts — one shape for axis-aligned volumes
  export interface VolumeDef { center: Vec3Tuple; size: Vec3Tuple }
  export interface SiteDef extends VolumeDef { id: string; name: string }
  // LevelDef gains setupWalls?: readonly VolumeDef[]  (content.ts: volumeExtent replaces siteExtent)
  // src/sim/physics/groups.ts: LAYER.setupWall; COLLISION_GROUPS.setupWall seen only by moveQuery
  //   (moveQuery's filter adds it) — bullets and sight pass. world.ts builds them disabled;
  //   setSetupWalls(up) toggles on change (collider.setEnabled, like setActive).
  ```
  Saltworks gets one wall per exterior opening (office door, main door, site B window, west hall
  door, storage door, landing door), derived from the facade anchors the openings use; the client
  draws them translucent while up (`render/level.ts`, `SETUP_WALL_STYLE`). Relay's
  `validateLevel`: both spawn sides, `nav`, ≥ 1 site, ≥ 1 setup wall.
- **Ability gate — the interface ADR-0012 consumes**: `ModeRules.abilityAllowed(match, e,
  ability)`. Relay: in `setup` an attacker may activate an ability only if
  `isReconAbility(ability)` (every effect kind in `RELAY.setupAttackerEffects`: Sonar Pulse yes;
  Slipstream, Updraft, Brace no); true otherwise. Derived from the effects, no new data tag.
  Contract for ADR-0012: every activation path calls `matchAbilityAllowed` where it would spend
  the resource (instant press, hold/toggle start, placeable confirm, throw) and emits
  `abilityFailed` `'blocked'` when false; the ability HUD greys the slot and bot usage hints skip
  it with the same predicate. Passives are never gated. R1 adds the call to today's path in
  `systems/abilities.ts`.

### 5. The uplink
- **No carrier item**: any living attacker can plant.
- **`BUTTON.interact = 1 << 11`** (held state, key F). Generic; Relay is its first user.
- **Channel** (Relay `tick`, step 2 of tick N, reading `lastButtons` = the command of N−1 — one
  tick of latency, no new hook):
  1. A running channel is cancelled (`uplink`/`cancel`) if the channeller is dead, no longer holds
     interact or no longer qualifies; it completes at `N ≥ endTick`.
  2. With none running, the lowest-id living character that holds interact and qualifies starts
     one (`endTick = N + secondsToTicks(plantSeconds | disruptSeconds)`, `uplink`/`start`).
  - Plant qualifies: phase `live`, attacking side, grounded, feet in a site (`siteAt`). Disrupt:
    phase `uplink`, defending side, grounded, `distance(feet, uplink.pos) ≤ RELAY.disruptRadiusM`.
  - Plant complete: `uplink = { siteId, pos: feet }`, phase `uplink`. Disrupt complete: the round
    goes to the defenders (`disrupted`).
- **While channelling**: as long as its command holds interact, `filterCommand` gives the
  channeller no movement and only `interact | crouch` (no fire, ADS, sprint, jump, reload, swap,
  abilities); the look stays free. Releasing frees movement at once (the cancel follows next
  tick). Damage does not interrupt, death does; a cancel loses the progress. One channel at a time.
- **Pure helpers** (rules, HUD prompt, bots): `relayOf(match)`, `plantSiteFor(level, match, e):
  SiteDef | null`, `canDisrupt(match, e)`, `channelProgress(match, tick): number | null`.
- **Events** feed the HUD, audio (starts positional within `AI.hearing.uplinkRadiusM`; planted /
  disrupted stingers for everyone) and bot hearing (`hear()` takes an enemy's `start` as a sound).

### 6. Round result
Per tick, in step 2: the channel first, then wipes, then the clock; a kill in step 7 counts
the next tick (as elimination).

| Situation | Result |
| --- | --- |
| `setup`: a side wiped (only by gadgets) | `decideRound(m, alive, false)` |
| `live`: one side wiped | the other side, `elimination` |
| `live`: both wiped in one tick | `MATCH_FORMAT.mutualWipeWinner` (defend), `elimination` |
| `live`: clock runs out, also while a plant is channelling | `MATCH_FORMAT.timeoutWinner` (defend), `timeout` |
| `live`: plant completes on the clock's last tick | counts (channel before clock) |
| `uplink`: disrupt completes (also on the last tick) | defenders, `disrupted` |
| `uplink`: every attacker dead | round goes on — defenders must disrupt (Q2) |
| `uplink`: every defender dead (also both at once) | attackers, `elimination` |
| `uplink`: clock runs out | attackers, `uplink` |

### 7. Bots
- `botCommand` reads `matchFrozen(match, self.team)`: attackers stand through select and setup,
  defenders walk to their round plan's posts during setup (unchanged `planRound`: posts spread
  over the sites; attackers draw `targetSite`). `roundKey`/`planRound` read `roundMatchOf`.
- New brain state **`objective`**, decided in `src/ai/objective.ts` (brain.ts only acts it out):
  ```ts
  export interface ObjectiveTask {
    kind: 'goto' | 'plant' | 'guard' | 'disrupt';
    siteId: string;
    node: string | null;       // walk here first (nav)
    point: Vec3 | null;        // then straight to within reachM of it (disrupt: the uplink)
    reachM: number;
    interact: boolean;         // then hold interact (plant, disrupt)
    faceYaw: number | null;    // and face this (guard)
  }
  export interface ObjectivePlan { planter: EntityId | null; disrupter: EntityId | null } // TeamPlan.objective, reset per round
  export function createObjectivePlan(): ObjectivePlan;
  /** Think ticks: the bot's duty now, or null (the brain's own rules decide). May assign plan roles. */
  export function objectiveDuty(bot: BotState, self: Readonly<CharacterEntity>, ctx: BrainContext, now: number): ObjectiveTask | null;
  ```
  brain.ts: `BotState.task`; `TeamPlan.objective` and `pickedRound`; `decideCalm` asks
  `objectiveDuty` first; `decide` re-asks in `objective` (null → `enterDefault`, another task →
  re-enter); `act` walks node → point → holds. A visible enemy still means `engage`, except for a
  bot whose own channel ends within `AI.relay.finishChannelSeconds`.
- **Duties** (M2, pragmatic):
  - Attackers, `live`: pushers go to `targetSite` (as today); inside it without a visible enemy,
    `planter` (first to arrive; replaced when it dies) plants where it stands, the others guard
    site nodes facing out. Below `AI.relay.rushSeconds` of engagement clock every attacker,
    holders included, heads for the target site. `uplink`: guard the uplink site.
  - Defenders, `live`: unchanged (posts, defended ground); a heard plant start is a sound lead.
    `uplink`: all go to the uplink site; the nearest without a visible enemy becomes `disrupter`
    (`point` = uplink, `reachM = RELAY.disruptRadiusM × AI.relay.approachFraction`), the rest guard.
- Not in M2: counter-picking, switching sites mid-round, fakes, recon abilities in setup (ADR-0012
  usage hints).

### 8. Client
- **Registration**: `MODE_HOSTS.relay = createRelayHost`, `LAUNCH.defaultLevel.relay =
  'saltworks'`, `MODE_TEXT.relay` → the menu entry and `?mode=relay` come for free (`launch.ts`
  unchanged). `waitsForPlayer` and `usesTier`: true.
- **`client/modes/sideHost.ts`** (new): the mode-neutral part of `eliminationHost.ts` moves here —
  spawning `defaultRoster` at the round's side spawns with combat bots, the event bookkeeping
  (result, killer, side swap), score/sides/alive, and the eliminated, round-result and match
  banners with one result text per `RoundEndReason` (a `Record`, so no reason is forgotten).
  `eliminationHost.ts` keeps its preRound/live texts; `relayHost.ts` adds setup and uplink.
- **`ModeHost` contract** (`host.ts`):
  ```ts
  export interface HostUi {
    readonly root: HTMLElement;                          // the HUD root
    project(p: Vec3): { x: number; y: number } | null;  // CSS px; null behind the camera
    capturePointer(): void;                              // only from a click (browser rule)
    openMenu(): void;
    setMenuSuppressed(suppressed: boolean): void;        // a free pointer shows the host's screen, not the menu
  }
  // ModeHost: − playableOperators; + attach(ui: HostUi): void; + frame(sim, player, visible: boolean): void
  ```
- **Operator select** (`ui/operatorSelect.ts`, ADR-0007): cards generated from
  `PLAYABLE_OPERATORS` + `getOperator` (name, archetype, accent colour, both weapons, abilities,
  teammates' picks against the limit); a card is disabled when `sim.accepts` refuses it. Shown in
  `preRound`: with a free pointer it is interactive (a click picks and captures the pointer; the
  menu is suppressed, a Menu button opens it); with a locked pointer a compact strip ("O: next
  operator · Esc: choose with the mouse"). The O key cycles to the next operator `sim.accepts`.
- **Objective HUD** (`ui/objectiveHud.ts`): site markers (letter, name, distance) at
  `SiteDef.center` in setup/live/uplink and a marker at `uplink.pos`; the prompt "Hold F: plant /
  disrupt uplink" from `plantSiteFor`/`canDisrupt`; a progress bar for the player's own channel.
- **Round HUD** (`RoundHudState` unchanged): captions "Operator select", "Setup", the engagement
  clock (urgent in the last `HUD.roundHud.urgentSeconds`), "Uplink · A" (urgent); banners for the
  setup task per side, uplink running (attackers: hold it; defenders: disrupt it) and the new
  reasons. Kill feed and death camera are reused unchanged.
- **Audio** (`AUDIO.uplink`, `AUDIO.spatial.reach.uplink` → `AI.hearing.uplinkRadiusM`,
  `AUDIO.ui.setupStart/uplinkPlanted/uplinkDisrupted`; `Sfx.uplink(action, stage, source)`).
- **QA**: `__qa.advanceTicks(n)` (synchronous steps with the current input; events handled, no
  rendering) and `__qa.setBotsIdle(idle)`; match shots fast-forward to their phase and gain
  `plant?: boolean` (the player plants at the nearest site); shots `relay_select`,
  `relay_setup`, `relay_uplink` on a seed whose round 1 has the player's team attacking.
- **Default mode** stays `elimination` until the DoD is met (Q3).

### 9. Tests (real `Sim` in Node unless noted)
| File | Proves |
| --- | --- |
| `relay.test.ts` (R1) | registry and `validateLevel` (Saltworks yes, range no, no setup walls → problem); phase order and clocks; look-only `preRound`; in setup attackers cannot move and Wisp's dash is `blocked`, `abilityAllowed` accepts Heron's Sonar Pulse (data), defenders move but a wall stops one in a doorway and is gone in `live`; picks accepted within the limit, refused over it / not playable / outside `preRound`, `Sim.accepts` agrees; plant start → complete → `uplink`; release, death, leaving the site → cancel and lost progress; no plant outside a site or by a defender; a channeller neither moves nor fires; every row of §6; swap, overtime and `matchEnd` via `MATCH_FORMAT`; determinism per seed |
| `elimination.test.ts`, `match.test.ts` (R1) | unchanged behaviour after the `rounds.ts` extraction (imports and signatures only) |
| `relay-bots.test.ts` (R2) | bot picks legal, deterministic, every operator left open on the player's team; attackers reach the target site, one plants, the rest guard; defenders rotate and disrupt a scripted plant; a full 10-bot Relay match to `matchEnd` (first to 4) without errors or stuck bots, logging reasons and controller cost (< 1 ms average); determinism per seed; `commands()`/`controls()` leave `SimState` unchanged |
| `relay.spec.ts` (R3, e2e) | `?mode=relay`: select screen with one card per playable operator, a click picks; `advanceTicks` → setup HUD and walls; → `live`: teleport into site A, hold F → progress, then `uplink` phase and clock; → `roundEnd` banner; clean console and network |

### 10. Implementation batches (disjoint file ownership)
Waves: **A** = ADR-0012's foundation batch (F12), then R1 — or one agent doing both: they share
`sim/types.ts`, `sim/command.ts`, `sim/sim.ts`, `config/sim.ts`, `config/client.ts`,
`ai/brain.ts`, `client/app.ts`. **B** = R2 ∥ R3 ∥ ADR-0012 batches that avoid R2/R3 files.
**C** = R4. Contract files (`sim/types.ts`, `sim/modes/mode.ts`, `ai/types.ts`, the types of
`ai/objective.ts`, `client/modes/host.ts`, `config/*.ts`) freeze after R1; later changes go
through the coordinator. Every batch ends with `npm run check`. `+` = new file; paths under `src/`.

R1 is one batch on purpose: `ModeId = MatchState['mode']` makes `relay` compile only when the
rules and the client host land together. After R1, Relay is playable (O picks, F plants, walls,
phase texts, bots fight but ignore the objective); R2 and R3 add behaviour in Relay-owned files.

| Batch | Owns | Tests | Needs |
| --- | --- | --- | --- |
| **R1 Relay foundation + rules** | *shared with ADR-0012:* `sim/types.ts`, `sim/command.ts`, `sim/sim.ts`, `sim/systems/abilities.ts` (gate call only), `config/sim.ts` (every key of this ADR), `config/client.ts` (every key: `LAUNCH`, `MODE_TEXT`, interact binding, `HUD.relay`, `SETUP_WALL_STYLE`, `AUDIO`, `SHOTS`), `data/schema.ts`, `data/content.ts`, `sim/physics/world.ts`, `sim/physics/groups.ts`, `ai/brain.ts`, `ai/perception.ts`, `client/app.ts`, `client/audio/sfx.ts`; *Relay/modes:* `sim/modes/{mode,index,format,elimination,range}.ts`, `sim/modes/rounds.ts`+, `sim/modes/relay.ts`+, `data/levels/saltworks.ts`, `ai/types.ts`, `ai/controller.ts`, `ai/picks.ts`+, `ai/objective.ts`+ (types, `createObjectivePlan`, `objectiveDuty` returning null), `client/session.ts`, `client/qa.ts`, `client/render/level.ts`, `client/modes/{host,index,rangeHost,eliminationHost}.ts`, `client/modes/sideHost.ts`+, `client/modes/relayHost.ts`+ (phase texts); README controls + `docs/generated` via `npm run docs:gen` | `relay.test.ts`+; updates to `elimination.test.ts`, `match.test.ts`, `content.test.ts` | F12 |
| **R2 Bots play the objective** | `ai/objective.ts` (duties; may extend `ObjectivePlan`) | `relay-bots.test.ts`+ | R1 |
| **R3 Relay client UI** | `client/modes/relayHost.ts`, `client/ui/operatorSelect.ts`+, `client/ui/objectiveHud.ts`+, `index.html` (one Relay style block — shared with ADR-0012's client batch: never concurrently), shots review | `tests/e2e/relay.spec.ts`+ | R1 |
| **R4 Integration** (coordinator) | `LAUNCH.defaultMode` (Q3) and the default-page test in `tests/e2e/smoke.spec.ts`; docs: SPEC §4.1 (timings → `RELAY`), §4.3, §7, §10.2, §13.1, §14, §15; ARCHITECTURE §3, §12–§14; ROADMAP; PROJECT_STATE; ADR index; CLAUDE.md checklist (`PLAYABLE_OPERATORS`); `AI.relay` tuning from R2 | DoD: a full match vs. bots in the browser, `npm run check` | R2, R3 |

### 11. Open questions for the user (defaults used until answered)
1. **Pick limit with 4 playable operators and 5 per team.** Default: `ceil(5 / 4)` = each
   operator at most twice per team; it becomes SPEC's "once" when ≥ 5 operators are playable.
2. **Wiping out the attackers after a plant.** Default (genre standard, matches SPEC's "defenders
   win by disrupting it"): the round goes on and the defenders must disrupt; a defender wipe during
   `uplink` wins for the attackers. Alternative: SPEC literal — any attacker wipe ends the round.
3. **Default mode.** Default: `relay` on page load once the M2 Relay DoD is met; elimination and
   the range stay in the menu and the URL.
4. **Spawn-edge choice** (SPEC §13: attackers choose between edges). Default: not in M2 — the
   edge is drawn per round (`RELAY.attackZone`) and named on the select screen; later a
   `selectSpawnZone` ControlMessage in `preRound`.

### 12. R1 as built (2026-09-30)
The contract for R2 and R3; where it differs from §1–§11, this section wins. Q1–Q4 are built as
their defaults (flagged in `config/sim.ts`); Q5 (plant 4 s, disrupt 6 s, radius 2 m) is
`RELAY.plantSeconds/disruptSeconds/disruptRadiusM`.

**Deviations**
- **Gate and walls are optional rules members**, as ADR-0012 §16 built the gate:
  `abilityAllowed?(match, e, ability)` and `setupWallsUp?(match)` (absent = allowed / never);
  `frozen(match, team)` is required. `matchFrozen(match, team)`, `matchAbilityAllowed`,
  `matchSetupWallsUp(match)` in `modes/index.ts`. No new gate call site: `spendActivation` (sim),
  the ability HUD and `ai/abilities.ts` already ask `matchAbilityAllowed`.
- **Auto-pick at the end of operator select** (§3 had none): `settlePicks` in `relay.ts` gives a
  character whose operator is not in `PLAYABLE_OPERATORS`, or is over `operatorPickLimit()`
  beside its lower-id teammates, a legal one drawn from `SimState.rng` (`operatorChanged`, tick of
  the `setup` phase event). Never fires with `defaultRoster` and accepted picks (no RNG draw then);
  it makes the SPEC rule hold for any roster (QA, tests, a changed list).
- **`channelProgress(match, tick)` is `uplinkProgress(match, tick)`** (`stats.ts` already has
  `channelProgress(slot)` for ability channels).
- **Elimination still accepts any operator in its pre-round** (`replay.test.ts` selects Salve);
  only Relay checks `PLAYABLE_OPERATORS` + `pickAllowed`. `ModeHost.playableOperators` and
  `RANGE_MODE.playableOperators` are gone; the O key cycles `operatorChoices(match)`
  (`modes/index.ts`: the range's `rangeOperators()`, else `PLAYABLE_OPERATORS`) and takes the
  next one `Sim.accepts`. The range rules now refuse ids outside `rangeOperators()` (an unknown
  id used to throw in `loadOperator`).
- **Setup wall colliders are created on the first raise** (`PhysicsWorld.setSetupWalls`): even
  disabled, six extra colliders changed Rapier's handles and broad phase, and bot-only
  elimination matches diverged (seed 1: 4:3 → 2:4). Every toggle also runs one `world.step()` —
  scene queries see new/enabled/disabled colliders only after a step — so this tick's movement
  meets or passes the walls (kinematic bodies rest at their next pose between ticks: nothing
  moves). ADR-0014's `restore` needs nothing else: `setSetupWalls(matchSetupWallsUp(match))`.
- **Round flow details**: after a plant completes, the same tick is judged by the uplink rules;
  a round that ends with a channel running emits `uplink`/`cancel` first; `m.channel` and
  `m.uplink` are reset when the next round begins (`uplink` stays visible through `roundEnd`).
- **Shots**: every phase wait fast-forwards synchronously (`advanceTicks`, elimination shots
  too); `SHOT_STAGING.phaseTimeoutSeconds = RELAY.preRoundSeconds + setupSeconds + 10`; free
  shots take `phase?`. Shots `relay_select`, `relay_setup_walls` (free camera on the south
  facade in setup), `relay_uplink` (`plant: true`) on seed 7 (team 0 attacks from West Gate).
- **Relay HUD until R3**: no select screen (O picks); the plant/disrupt prompt and the own
  channel's percentage are the round HUD clock caption (`relayHost.ts`); setup and uplink banners
  show only for `HUD.relay.bannerSeconds`.

**Names and signatures (R2/R3 build on these)**
- Types (`sim/types.ts`): `EliminationPhase`, `RelayPhase`, `MatchPhase`, `RoundMatchBase`,
  `EliminationMatch`, `RelayMatch {channel: UplinkChannel | null; uplink: PlantedUplink | null}`,
  `RoundMatch`, `UplinkAction`, `UplinkStage`, `UplinkChannel {action, entityId, siteId,
  startTick, endTick}`, `PlantedUplink {siteId, pos}`, `RoundEndReason` + `'uplink' |
  'disrupted'`. Event `{ type: 'uplink'; action; stage: 'start'|'cancel'|'complete'; entityId;
  siteId; pos }` (`pos` = the channeller's feet); picks are `operatorChanged`; phases `phase`.
- `BUTTON.interact = 1 << 11` (key F, binding `interact`).
- `sim/modes/relay.ts`: `RELAY_RULES`, `relayOf(match)`, `plantSiteFor(level, match, e):
  SiteDef | null`, `canDisrupt(match, e)`, `uplinkProgress(match, tick)`, `isReconAbility(a)`.
- `sim/modes/format.ts`: `roundMatchOf`, `defaultRoster(playerOperatorId)` (player = slot 0 of
  `MATCH.playerTeam`; `ELIMINATION.playerTeam` is gone), `isPlayableOperator(id)`,
  `pickAllowed(team, entityId, operatorId)`, `sideResult(match, side, reason)`.
  `config/sim.ts`: `operatorPickLimit()`, `RELAY`, `AI.relay`, `AI.hearing.uplinkRadiusM`.
- `sim/modes/rounds.ts`: `ageDead`, `openingFields`, `beginPhase`, `phaseOver(ctx, m)`,
  `aliveBySide`, `bookRound`, `closeRound`, `sideLevelProblems(level, mode)`.
- `Sim.accepts(msg)`; `changeOperator(ctx, e, id)` (`entities.ts`, the one operator change);
  `VolumeDef`, `LevelDef.setupWalls`, `volumeExtent` (`content.ts`), `openingVolume`
  (`levels/geometry.ts`; Saltworks' `FACADES` feed the facade walls and the six setup walls).
- Bots: `BotController.controls(tick)`; `SteppableSim.control`; `stepMatch` queues the bots'
  controls after the host's; `ai/picks.ts` `botPicks(view, botIds, rng)` (team plan stream,
  `AI.relay.pickDelaySeconds` into each select, `TeamPlan.pickedRound`); `draw` is exported from
  `brain.ts`. `ai/objective.ts`: `ObjectiveTask`, `ObjectivePlan`, `createObjectivePlan`,
  `sameTask`, `ObjectiveDuty`, `objectiveDuty` (R1: `() => null`). `brain.ts`: state
  `objective`, `BotState.task`, `TeamPlan.objective` (fresh per `planRound`); `decideCalm`
  asks `objectiveDuty` first; in `objective` every think tick re-asks (null → `enterDefault`,
  a task that is not `sameTask` → re-enter, which drops the path); `act` walks `task.node`
  (nav), then straight (`moveInput`, `nav/steer.ts`) until within `reachM` of `point`
  (horizontal), then turns to `faceYaw` and holds interact. The brain handles no hits or reloads
  in `objective`: return null to hand them back. A visible enemy does not trigger `engage` while
  the bot's own channel ends within `AI.relay.finishChannelSeconds`. `hear()` takes an enemy's
  `uplink` start within `uplinkRadiusM`.
- Client: `HostUi {root, project, capturePointer, openMenu, setMenuSuppressed}`, `ModeHost.attach(ui)`
  (once, after the HUD exists) and `frame(sim, player, visible)` (every frame after the round HUD);
  `sideHost.ts` `createSideHost(view: SideModeView<M>)` with `SidePhaseContext`, `PhaseView`,
  `SIDE_NOUN`, `roundTitle`; `relayHost.ts` `createRelayHost`. `LevelView.setSetupWalls`
  (`render/level.ts`, fed `matchSetupWallsUp` per frame), `SETUP_WALL_STYLE`, `HUD.relay`
  (`bannerSeconds`, `text`), `AUDIO.uplink[action][start|cancel]`, `AUDIO.ui.setupStart /
  uplinkPlanted / uplinkDisrupted`, `AUDIO.spatial.reach.uplink`, `Sfx.uplink(action, stage,
  source)`, `MODE_TEXT.relay`, `LAUNCH.defaultLevel.relay`.
- QA: `__qa.advanceTicks(n): number` (synchronous steps with the held buttons, events handled,
  no rendering), `__qa.setBotsIdle(idle)` (no commands, no picks); `__qa.state().match` carries
  `channel` and `uplink`. Tests: `tests/unit/support/match.ts` (`step`, `stepUntil`,
  `untilPhase`, `fireAt`, `Inputs`), `tests/unit/relay.test.ts` (25 cases).

**Measured** (Node, bot-only, medium, Saltworks, seeds 1–10): elimination 64 rounds, attackers
win 64.1 %, median round 66.0 s — bit-identical to before R1 (every seed ends on the same tick
with the same score). Relay (bots fight, the objective is R2): all 10 matches reach `matchEnd`
without errors, 57 rounds, attackers win 66.7 % (38 by elimination; defenders 19 by elimination,
no timeout), median engagement 49.7 s, no stuck bot in live/uplink, no defender held at a setup
wall when the round went live, 401 bot operator picks, controller 0.039 ms/tick average (worst
3.7 ms). Shots reviewed: the setup walls read as amber fills with outlines in the office door,
main door and site B window; the fill (`SETUP_WALL_STYLE.opacity` 0.22) is faint at range —
R3's shots review may raise it.

### 13. R2 as built (2026-09-30)
The objective duties of §7 in `ai/objective.ts` (`objectiveDuty`); no sim change was needed.
Everything is Relay-only (`relayOf`, phases `live`/`uplink`): elimination is bit-identical.

**Duties**
- **Attackers.** `TeamPlan.targetSite` (the round plan's seeded draw) is weighed once, at the
  first duty of the engagement, against the team's contacts (fewest known enemies closest to a
  site wins, a tie keeps the draw — in practice the draw: the spawn shields hide the building in
  setup). Pushers (holders after `AI.brain.holdMaxSeconds`, everyone below `AI.relay.rushSeconds`)
  `goto` the site; the first on it (`plantSiteFor`) without an enemy in sight becomes `planter`
  and plants where it stands (`node`/`point` null, interact); the planter is replaced when it dies
  or is off the site while a teammate stands on it. The others `guard` site nodes; after the plant
  everyone guards the uplink's site.
- **Defenders.** Setup and engagement keep the round plan (posts spread over both sites, patrols,
  placeables per their `hold` hints — Lattice's sensors in the test) until the team's **alarm**
  (`ObjectivePlan.alarm`, first evidence wins): a heard enemy plant start or an enemy contact
  standing in a site. The finder acts at once, teammates `AI.perception.calloutDelayTicks` after
  the evidence; everyone not posted at that site (`TacticalMap.siteOf`) takes its nodes. Uplink:
  the **disrupter** is the living defender nearest the uplink with no enemy in sight (after a
  think cycle without a claim, any calm defender); it walks to `nearest(uplink)`, then to
  `approachFraction × disruptRadiusM`, and once `canDisrupt` holds interact where it stands (a
  player's uplink on a crate stays disruptable). The others guard the site's nodes facing the
  uplink, clear of `disruptRadiusM + AI.nav.separationM` around it (a guard on the node next to
  the uplink blocked the disrupter's straight walk).
- **Where guards stand** (`ObjectivePlan.spots`, one claim per bot and round): on the way, the
  site node nearest the bot (kept while walking); on the site or arrived there, the **farthest**
  unclaimed node whose path passes no claimed node — the site fills from the back; none left:
  the nearest node, shared (the steering's crowded-node rule gives way). First nearest-first and
  id-order assignments jammed guards in the tank hall's single path past its pillar and flipped at
  a site's edge. A guard faces its newest lead, else the node's watch yaw, its first link out of
  the site, or away from the centre.
- **Fight first.** A visible enemy means `engage` unless `holdsChannel` (exported; replaces the
  brain's `finishingChannel`): the own channel ends within `finishChannelSeconds`, **or** a restart
  could no longer finish before the phase clock (letting go loses the round anyway). A `goto` or
  `guard` bot hands a lead to the brain (duty null) while it investigates, or when its newest lead
  is within `AI.brain.holdInvestigateM` (reused: "guards investigate only leads this close").
  Interrupted plants and disrupts come back through the duty after the fight.
- **Setup abilities.** Frozen attackers keep `botCommand`'s early return (look only), so no
  ability is pressed at all: recon in setup stays out of M2 (§7) — Sonar Pulse's 18 m from the
  attacker spawn reaches no defender. The test checks every attacker command in setup.
- **Unstick** (`unstickTask`): `graph.nearest` falls back to the closest node even when none of
  its candidates is in sight; a bot pushed into the west end of the upper corridor snapped to a
  catwalk node behind the hall wall for the rest of the round. When the steering gives up, or is
  stuck for a progress window walking to a node out of clear sight (duty or investigation), the
  duty walks it straight to the closest node in clear sight, then resumes.

**Deviations from §7/§12**
- `brain.ts` answers hits (`reposition`) and reloads in state `objective` like the calm states,
  except during the bot's own running channel (§12: "return null to hand them back" — after
  `enterDefault` the hit is older than the state and was lost).
- `perception.hear()` returns the enemy uplink starts it heard; `BotState.heardUplink` keeps the
  newest (reset per life/round). `brain.ts` exports `newestLead` and `MIN_DIRECTION`.
- `ObjectivePlan` gains `disrupterFreeTick`, `siteChecked`, `alarm` (`ObjectiveAlarm`), `spots`
  (`SpotClaim[]`); `objective.ts` exports `HeardUplink`, `ownChannel`, `holdsChannel`.
- `AI.relay` values unchanged (3 s, 45 s, 1 s, 0.5): the measured outcomes needed no retune.

**Tests** — `relay-bots.test.ts` (7): attackers plant and guard with no defender about (parked
above the office ceiling, a closed space; no Heron — its sonar reveals through walls); defenders
rotate on a heard plant (alarm ≤ callout delay + a think cycle, every off-site defender ≥ 5 m
closer or within 10 m after 8 s); a defender disrupts once the planter is dead; setup (no ability
pressed by attackers, posts at both sites, a `hold` gadget placed); a full bot-only match (seed
19: 4:3 with overtime, no stuck bot, no refusal, `controls()`/`commands()` leave `SimState`
unchanged, controller < 1 ms); determinism (round 1 twice); `holdsChannel`.

**Measured** (Node, bot-only 5v5, medium, Saltworks, seeds 1–20): 20 matches to `matchEnd`,
116 rounds, plants in 81 (69.8 %). Attackers win 53.4 % — 51 by elimination after a plant, 2 by
the uplink, 9 by elimination without a plant; defenders 26 by elimination (no plant), 28 by
disrupt, 0 timeouts. Median round 41.5 s from the engagement's start. No stuck bot, no
`abilityFailed`. Controller 0.053 ms/tick average (per seed 0.042–0.061), worst ≤ 5.6 ms (one
91 ms tick did not reproduce on a rerun: host noise). Elimination (seeds 1–10) unchanged: 64
rounds, attackers 64.1 %, median 66.0 s, every round identical. Open: the uplink clock rarely
decides (2 of 81 plants) — post-plant rounds end in fights; the nav fallback above deserves a
fix at its source (`nearest()` searching past its candidates, or a node at the corridor's end).

### 14. R3 as built (2026-09-30)
The Relay client UI of §8 (batch R3). No sim change was needed.

**What the player sees**
- **Operator select** (`ui/operatorSelect.ts`): a select phase frees the pointer once
  (`releasePointer`, new in `input/pointerLock.ts`) and suppresses the menu; the screen shows the
  round title, the side's task, where the attackers enter and the countdown, one card per
  `PLAYABLE_OPERATORS` entry from the operator data (name, archetype, accent colour, HP / armour /
  speed, both loadout weapons, abilities with recon ones tagged "usable in setup", bio), per card
  the team's picks as pips against `operatorPickLimit()` and a "Selected" / "Team limit" badge —
  disabled exactly when `Sim.accepts` refuses the pick — and the team's operators as chips. A
  click or number key (`HUD.relay.select.pickKeyPrefix` + n) picks (the `selectOperator`
  ControlMessage) and captures the pointer; Enter (`readyKey`) or "Ready" keeps the operator;
  "Menu" opens the menu. With a locked pointer a strip under the round HUD names the operator,
  the O key and Esc (`systemKeyLabel('release')`, SYSTEM_KEYS gained an `id`). While the screen
  shows, the round-start banner is left out (it showed through the panel; the header carries it).
  A page load in Relay opens on this screen instead of the menu; a pick or Ready starts the match.
- **Objective HUD** (`ui/objectiveHud.ts`) in setup, engagement and uplink: a line under the round
  HUD — own side badge + task (setup: attackers "Hold at the spawn: recon abilities only" plus the
  player's abilities `matchAbilityAllowed` lets through, or "yours unlock when the round starts";
  defenders fortify; engagement "Plant the uplink at A or B" / "Hold A and B"; uplink "Hold /
  Disrupt the uplink"; a teammate's running channel replaces it) and, once planted, the site, a bar
  over `RELAY.uplinkSeconds` in the own/enemy colour and the time left. Under the crosshair the
  prompt "[F] Hold to plant the uplink · A · Tank Hall" (key from `bindingLabel('interact')`,
  rules `plantSiteFor` / `canDisrupt`) or the player's channel with its bar and percentage. World
  markers (DOM, through walls, first in the HUD root so the crosshair stays on top): site letter,
  name and distance at `SiteDef.center`, hidden while the player stands in that site; in uplink
  the planted site gives way to a square uplink marker `HUD.relay.markers.uplinkLiftM` above
  `uplink.pos` (own/enemy colour), the other sites fade.
- **Round HUD** captions from `HUD.relay.text.caption`: Operator select, Setup, Engagement, and
  "Uplink · A · Tank Hall"; the R1 caption prompt is gone.

**Deviations and details**
- `relayHost.ts` composes the side host instead of extending `SideModeView` (`sideHost.ts`
  untouched): `RelayHost` delegates every `ModeHost` member and takes this frame's
  `SidePhaseContext` from its `running` callback (roundHud runs right before frame), so
  `left`, sides and the swap flag are not re-derived.
- Layout: `.revealed-warning` moved from 88 px to 128 px (the objective line took its slot) and
  `.round-banner` from 21 % to 23 % (clears both at 720p). `SIDE_LABEL` is exported from
  `roundHud.ts`; the button styles of the menu are shared with the select screen.
- `SETUP_WALL_STYLE.opacity` 0.22 → 0.55: the fill is tone-mapped like the scene; 0.4 still read
  as faint beige in `relay_setup_walls`.
- Audio: nothing to add — R1 already plays `setupStart`, the uplink start/cancel cues and the
  planted/disrupted stingers (§8).
- Shots (iter17, all reviewed): `relay_select` (the screen), `relay_setup_walls`, new
  `relay_setup` (attacker HUD with the recon hint and both site markers), new `relay_live`
  (engagement line and markers from the spawn), `relay_uplink` (bar at 0:40). The own plant bar
  and a half-run uplink bar were reviewed in scratch captures only: `ShotDef` has no partial plant
  or "seconds into the phase" staging (would need `app.ts`).
- Tests: `tests/e2e/relay.spec.ts` (seed `RELAY_SHOT_SEED`, now exported); the page helpers moved
  from `smoke.spec.ts` to `tests/e2e/support/page.ts`.

### 15. R4 as built (2026-09-30)
Integration (batch R4); no sim or bot change. The Relay DoD (ROADMAP M2) is met: §13's full
bot-only match, `relay.test.ts`, `relay.spec.ts`.
- **Default mode** (Q3, user default confirmed): `LAUNCH.defaultMode` = `relay`; §8's "stays
  `elimination` until the DoD is met" is done. The menu keeps generating its mode list from
  `MODE_IDS` / `MODE_TEXT` (registry order unchanged); `?mode=elimination` and `?mode=range`
  keep working.
- **e2e** (`smoke.spec.ts`): the default-page test now expects `LAUNCH.defaultMode` in round 1's
  operator select with the select screen shown and the menu hidden; the former default-page
  checks (menu, pre-round banner) moved to a `?mode=elimination` test, so elimination keeps a
  browser test. `launch.test.ts` was already default-neutral.
- **Docs**: SPEC §4.1 links its phase timings to `RELAY` and gained the as-built rules, §4.3,
  §12–§15 name Relay; ARCHITECTURE §1–§15, ROADMAP M2 (DoD status), ADR index.
- `AI.relay` stays as tuned in §13 (no retune).

## Consequences
- Relay adds phases, a channel, one button and setup walls — not a new round flow: format
  helpers, `rounds.ts`, sides, spawns, respawns, the result rule, stingers, callout resets, kill
  feed and death camera are shared with elimination.
- `ModeRules` grows to eight members, each a pure function of the match state; the wall
  colliders are re-derived from it, so the M2 net spike and M6 snapshots need nothing extra.
- The plant reads held buttons from `lastButtons`: one tick of latency, as for every input.
- Setup walls are level data like sites: a map without them cannot host Relay.
- Rejected: an uplink carrier item (pickup/drop rules for no gain); disrupting anywhere in the
  site (from cover); a movement-only filter for attackers without a per-team freeze (bots would
  read it as stuck); blocking fire during setup instead of walls (defenders could still walk out
  and trap the attacker spawn); keeping partial progress on cancel; interact as a ControlMessage
  (held state belongs in `Command`); a new `ModeRules` command hook for the channel.
