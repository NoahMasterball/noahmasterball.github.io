# ADR-0012 — Ability framework: activations, gadgets, projectiles, areas, bot hints

*Status: accepted · 2026-09-30*

## Context
M2 (ROADMAP) needs every activation type (`hold`, `toggle`, `placeable`, `thrown`) and every
effect type (`damage`, `heal`, `shield`, `barrier`, `reveal`, `areaDenial`, `disableGadgets`)
working, `isAbilitySupported()` true for all 16 abilities in `src/data/abilities.ts`, a unit test
per effect type, gadgets as entities with health, reveal markers, area visuals at the exact data
radius, and bots using abilities through data-declared usage hints (SPEC §7, §12, §14–§16).
Constraints: ADR-0003 (sim/render split, Node-safe sim), ADR-0004 (plain records, systems in
order, Rapier handles in side tables, derived values in `stats.ts`), ADR-0006 (events as data),
ADR-0008 (typed content), ADR-0011 (bots emit `Command`s; only `perception.ts` reads enemies).

Built: the resource model (`sim/abilities/resource.ts`, pure, tested); activations `instant` and
`passive`; effects `modifier` and `dash`; `isAbilityDeferred` + `DEFERRED_*` for Heron's Sonar.

Findings that shape this ADR:
- `SimState.entities` is character-only in practice: 26 call sites (sim, ai, client, tests)
  treat every entry as a `CharacterEntity`.
- The data cannot say *when* a placed gadget acts: Bore Charge (detonates after planting),
  Tripline Nodes (sense continuously), Burr Mines (fire once on contact) and the two barriers
  (the gadget *is* the effect) share `{ kind: 'placeable' }` with no further field.
- `kill.weaponId` cannot name an ability kill; `DamageInfo` requires a weapon id.
- Rapier 0.21: a collider created mid-tick is visible to scene queries only after the next
  `world.step()` (see the comment in `PhysicsWorld`'s constructor); removing a collider between
  queries and the step is unverified territory.
- A fire press that confirms a placement would also arm the weapon's trigger buffer
  (`GUNPLAY.triggerBufferSeconds`) and fire a surprise shot.
- While this ADR was written, `config/sim.ts` / `ai/perception.ts` gained hearing occlusion
  (`AI.hearing.occludedRangeFactor`); this ADR builds on that version.

## Decision

### 1. Activations and input

**1.1 The `Command` does not change.** Every ability input fits the existing held-button bits
(press edges are derived from `lastButtons`, as today):

| Input | Meaning |
| --- | --- |
| `ability1`/`ability2` press | activate the slot (per kind below); pressed while placing that slot → cancel |
| `ability1`/`ability2` held | `hold`: keep channelling; release ends |
| `fire` press while placing | confirm the placement |
| `ads` press while placing | cancel the placement |
| weapon select / swap press while placing | cancel the placement (the swap then happens) |
| another slot's press while channelling or placing | ends the current one (`interrupted`), then activates the pressed slot |

**Input ownership.** `CharacterEntity.suppressedButtons` (bit mask, plain data): bits an ability
consumed (the confirming `fire`, the cancelling `ads`) stay masked from movement and weapons
until the key is released (`suppressedButtons &= cmd.buttons` each tick). `abilitySystem`
returns the command later systems see (`buttons & ~suppressedButtons`); `lastButtons` keeps
the raw buttons. So a confirm never fires the weapon, not even a held auto trigger.

**1.2 Slot state** (`src/sim/types.ts`):
```ts
export type AbilityActivity =
  | { kind: 'channel'; elapsed: number }   // hold: seconds channelled
  | { kind: 'on'; elapsed: number }        // toggle: seconds switched on
  | { kind: 'placing' };                   // placeable: ghost shown, fire places
export interface AbilityState { abilityId: string; resource: ResourceState; active: AbilityActivity | null }
```

**1.3 State machines** (one controller per kind, `ACTIVATIONS: { [K in ActivationKind]: ActivationController<K> }`):

| Kind | Press (slot idle) | Every tick while `active` | Ends | Events |
| --- | --- | --- | --- | --- |
| `instant` | `consume()` → `applyEffects` once at the user | — | — | `ability` / `abilityFailed notReady` |
| `passive` | ignored (applied by `loadOperator`, as now) | — | — | — |
| `hold` | `consume()` → `channel` | while held: `elapsed += dt`; `applyEffects` with `radiusScale = min(1, elapsed / maxDuration)`, `amountScale = dt / maxDuration`, `sustained` | release · `elapsed ≥ maxDuration` · interrupt · death | `ability`, `abilityEnd` (`released`/`maxDuration`/`interrupted`/`died`) |
| `toggle` | off → `consume()` → `on`; on → off | `elapsed += dt`; `applyEffects` with `amountScale = dt`, `sustained` | press · `maxDuration` (if not null) · death | `ability`, `abilityEnd` (`toggledOff`/`maxDuration`/`died`) |
| `placeable` | `canActivate()` and own gadgets of this ability < `maxActive` → `placing` (nothing spent) | `fire` press: pose = `placementPose(...)`; valid → `consume()`, `spawnGadget`, idle; invalid → stay placing. `ads`/own key/swap press → cancel | confirm · cancel · interrupt · death (silent) | `ability` + `gadgetPlaced`; `abilityFailed` `notReady`/`maxActive`/`invalidPlacement` |
| `thrown` | `consume()` → `spawnProjectile` from the eye along the crosshair | — | — | `ability` |

- **Weapon block.** `weaponBlockedBy(e): 'channel' | 'placing' | null` (`stats.ts`) is part of
  `canFire(e)`; while blocked the weapon system also drives ADS to 0, refuses reload starts,
  cancels a running reload and ignores swap presses (a swap press already cancelled a
  placement in step 4). Fire presses during a channel use the trigger buffer as during a swap.
  Toggles never block the weapon (Cairn fires while mounted).
- **Resources.** `consume()` at activation for every kind; a slot's resource does not tick while
  it is `channel` or `on`, so a cooldown or recharge runs from the end (SPEC §7 "cooldown starts
  when the toggle is switched off" — for holds too). `startCooldown()` becomes unused and is
  removed. Placing spends only on confirm.
- **Aim.** Placement and throws use the command's look plus the recoil offset from the eye —
  the crosshair. `aimOf(e)` (`systems/weapons.ts`) gains an optional look override:
  `aimOf(e, look?: { yaw: number; pitch: number })`.
- **End.** `endActivity(ctx, e, index, reason)` / `endAllActivities(ctx, e, reason)` in the leaf
  module `sim/abilities/interrupt.ts` (imports types only, so `health.ts` can call it on death
  without a module cycle). Sustained modifiers lapse on their own (§3.4), so ending needs no
  clean-up beyond `active = null`. Round reset and operator change: `loadOperator` resets
  `active`, `suppressedButtons`, `shields`, `reveals` (no `abilityEnd`; the `spawn` event says it).

**1.4 Dispatcher** (`sim/systems/abilities.ts`): first `expireEffects(e, dt)` for every living
character (modifiers, shields, reveals: `remaining -= dt`, dropped once `isTimeUp`), then per
living character, in entity-id order: free released suppressed bits →
tick resources of idle/placing slots → per slot in index order: `active` ? `sustain()` :
pressed ? (end any other channel/placement `interrupted`, then `press()`) → return the filtered
command.
```ts
type AbilityOf<K extends ActivationKind> = AbilityDef & { activation: Extract<ActivationDef, { kind: K }> };
export interface ActivationController<K extends ActivationKind> {
  press(ctx: SimContext, e: CharacterEntity, index: number, ability: AbilityOf<K>, cmd: Command): void;
  sustain(ctx: SimContext, e: CharacterEntity, index: number, ability: AbilityOf<K>, cmd: Command, dt: number): void;
}
export function abilitySystem(ctx: SimContext, e: CharacterEntity, cmd: Command, dt: number): Command;
```

### 2. Simulation state

```ts
// src/sim/types.ts — additions (all plain, serialisable; no Infinity in new fields)
export type DamageCause = { kind: 'weapon'; weaponId: string } | { kind: 'ability'; abilityId: string };
export interface ActiveShield { sourceId: string; amount: number; remaining: number }   // sourceId = ability id
export interface ActiveReveal { team: number; sourceId: string; remaining: number }     // visible to `team`
// CharacterEntity += shields: ActiveShield[]; reveals: ActiveReveal[]; suppressedButtons: number

export interface GadgetEntity {
  id: EntityId; kind: 'gadget'; abilityId: string; ownerId: EntityId; team: number;
  pos: Vec3;          // barrier: base centre on the floor; device: centre (surface + normal × deviceRadiusM)
  yaw: number;        // floor gadgets face the placer's look; wall gadgets face out of the wall
  normal: Vec3;       // surface it is attached to
  health: number;     // starts at activation.gadgetHealth
  placedTick: number;
  timer: number;      // `timer` trigger: seconds left (paused while disabled); 0 otherwise
  disabled: number;   // seconds left disabled (disableGadgets); 0 = working
}
export interface ProjectileEntity {
  id: EntityId; kind: 'projectile'; abilityId: string; ownerId: EntityId; team: number;
  pos: Vec3; prevPos: Vec3; vel: Vec3;
  fuse: number | null;   // seconds left; null = bursts on impact
  resting: boolean;      // a fused projectile that landed
  age: number;           // seconds in flight
}
export interface AreaEntity {
  id: EntityId; kind: 'area'; abilityId: string; effectIndex: number;  // the areaDenial effect in data
  ownerId: EntityId; team: number; pos: Vec3 /* on the ground */; remaining: number;
}
export type Entity = CharacterEntity | GadgetEntity | ProjectileEntity | AreaEntity;
export interface SimState {
  tick: number; time: number; rng: RngState;
  entities: CharacterEntity[];            // characters only (name kept: 26 call sites)
  gadgets: GadgetEntity[]; projectiles: ProjectileEntity[]; areas: AreaEntity[];
  nextId: number; match: MatchState;
}
```
- **Separate typed lists**, not a union in `entities`: every system iterates exactly what it
  handles; no character code has to narrow. Radius, damage per second and stats of an area,
  and a gadget's shape, come from data via `abilityId` / `effectIndex` (never copied).
- **One id space**: `allocateId(state)` in `entities.ts` (`state.nextId++`) for characters
  (`Sim.spawnCharacter`), gadgets, projectiles and areas — physics side tables and events never
  collide.
- **Removal is immediate in state**: a destroyed or consumed gadget, a burst projectile and an
  expired area leave their list in the tick it happens (§4.3 for the collider).
- **Clean-up**: `clearWorldObjects(ctx)` (`entities.ts`) empties gadgets (and their colliders),
  projectiles and areas; elimination's `resetRound()` calls it before the respawns (Relay will
  too). An operator change (`loadOperator` with `changed`) removes that character's gadgets
  (they belong to the old kit); death does not (gadgets outlive their owner, and their
  effects stay credited to the owner). Range respawns clear nothing.
- Death (`applyDamage` kill path) also clears `shields`, `reveals` and calls
  `endAllActivities(…, 'died')`.

### 3. Effects: origin, targets, scaling, line of sight

**3.1 Context** — the existing `EffectContext` is extended (moved to the leaf module
`sim/abilities/targeting.ts`, re-exported by `effects.ts`, so handlers and the registry do not
import each other):
```ts
export interface EffectContext {
  sim: SimContext;
  ability: AbilityDef;
  user: CharacterEntity;       // the ability's user; for a gadget, projectile or area: its owner
  origin: Vec3;                // centre of every radius (table below)
  via: { kind: 'user' } | { kind: 'gadget' | 'projectile' | 'area'; id: EntityId };
  radiusScale: number;         // hold: channel progress; else 1
  amountScale: number;         // damage/heal amounts: 1 once; dt/maxDuration (hold); dt (toggle, aura)
  sustained: boolean;          // re-applied every tick (hold, toggle, aura): modifiers get ABILITY_RULES.sustainSeconds
  struck: EntityId | null;     // the character a projectile hit: inside every radius, no LOS check
  command: Command | null;     // user-applied only (dash direction)
}
export function applyEffects(ctx: EffectContext): void;   // every effect of ctx.ability, in data order
```

| Source | `origin` |
| --- | --- |
| instant, hold, toggle | the user's feet (`e.pos`) |
| placed gadget (aura, proximity, timer) | `gadget.pos` |
| projectile burst | the impact point (pushed `ABILITY_RULES.thrown.surfaceOffsetM` out of the surface) or the mid-air position |
| area tick | `area.pos` (ground) |

**3.2 Targets.** `affectedCharacters(ctx, filter, radius, kind)` and `affectedGadgets(ctx, radius)`
(`targeting.ts`) are the only target selection:
- Living characters with `bodyDistance(e, origin) ≤ radius × radiusScale`, or `struck`.
  `bodyDistance` (new, `sim/hitbox.ts`) = distance to the nearest point of the character's
  vertical body axis (feet → top of the current stance): a disc on the floor catches feet, a
  chest-height burst catches the torso, a floor 4 m above is out of a 3 m radius.
- `filter`: the data's `targets` (`self` = the user only, `allies` includes the user, `enemies`,
  `all`) for `heal`, `shield`, `modifier`; **hostile** for `damage`, `areaDenial` (enemies; plus
  teammates *and the user* only when `GUNPLAY.friendlyFire`, which becomes the one rule for all
  damage between teammates); enemies for `reveal`; enemy gadgets for `disableGadgets` and the
  gadget part of `damage` (own team's too with friendly fire). A gadget never affects itself.
- **Line of sight** per kind, `ABILITY_RULES.lineOfSight` (a global rule table, typed
  `Record<RadiusEffectKind, boolean>`): only `areaDenial` needs it — from `origin + up ×
  ABILITY_RULES.losLiftM` to the target's torso centre through `SimQuery.lineOfSight` (level
  geometry and barriers), so fire does not burn through walls. `damage` ignores cover (the only
  damage effect is Bore Charge, which "damages anything behind the surface it is planted on");
  buffs and reveals ignore walls (sensors, sonar). The first effect that needs the other rule
  adds a per-effect override to the schema.

**3.3 Per effect** (handlers in `HANDLERS: { [K in EffectKind]: Handler<K> }` — total, so a new
kind does not compile without one):

| Effect | Applies |
| --- | --- |
| `damage` | hostile characters: `mitigatedDamage(amount × amountScale, armour, damageTakenMultiplier)` via `applyDamage` (zone `torso`, `point` = torso centre, `sourcePos` = origin, cause `ability`); hostile gadgets within radius (point distance): `damageGadget(amount × amountScale)` |
| `heal` | `health = min(maxHealth, health + amount × amountScale)`; `healed` when > 0; never revives |
| `shield` | per target and source: `amount = max(old, amount)`, `remaining = max(old, duration)`; `shieldGained` |
| `barrier` | nothing at apply time: the barrier *is* its gadget's collider (`gadgetShape`, §4.1) |
| `modifier` | as now (same-source refresh); `remaining` = `Infinity` (passive) · `ABILITY_RULES.sustainSeconds` (`sustained`) · `duration` |
| `dash` | as now (user only) |
| `reveal` | enemies in radius: `(team = user.team, sourceId)` entry, `remaining = max(old, duration)`; `revealed` when the target was not yet revealed to that team |
| `areaDenial` | `spawnArea(ctx, effectIndex)` on the first level surface within `ABILITY_RULES.area.maxDropM` below the origin (`SimQuery.groundBelow`), else at the origin |
| `disableGadgets` | enemy gadgets in radius: `disabled = max(disabled, duration)` |

- **Shields** are temporary HP *after* mitigation: `applyDamage` receives the mitigated amount
  (armour and `damageTaken` first — Brace protects the shield too), shields absorb it (the one
  expiring soonest first), the rest hits health. `hit` gains `absorbed`; a shield absorbed to 0
  is removed with `shieldBroken`; expiry is silent. `shieldAmount(e)` in `stats.ts`.
- **Reveals**: `isRevealedTo(e, team)` in `stats.ts`; entries expire with modifiers.
- **Areas** (`sim/abilities/areas.ts`): each tick, for hostile characters inside (same
  `affectedCharacters`, LOS on): `damagePerSecond × dt` via `applyDamage` (attacker = owner),
  and the effect's `stats` as a modifier with `sourceId` = ability id and `remaining =
  ABILITY_RULES.sustainSeconds` — refreshed while inside, gone right after leaving, never
  stacked with the same ability's other areas (SPEC §8). `remaining -= dt`; removed at 0.
- `combat/damage.ts` gains `mitigatedDamage(amount, armour, damageTakenMultiplier)`;
  `pelletDamage` uses it (one mitigation rule).

**3.4 Supported combinations.** `isAbilitySupported(a)` stays (ROADMAP DoD, HUD, ROSTER) and
becomes the activation × effect compatibility table — every combination with a semantics in
this ADR:

| Activation | Supported effects |
| --- | --- |
| `instant` | all except `barrier` |
| `passive` | `modifier` |
| `hold` | `reveal`, `modifier` (others need a written channel semantics first) |
| `toggle` | `modifier` |
| `placeable` | all except `dash` (`barrier` ⇔ trigger `none`, checked by `validateContent`) |
| `thrown` | all except `dash`, `barrier` |

All 16 roster abilities pass. `DEFERRED_ACTIVATIONS`, `DEFERRED_EFFECTS`, `SUPPORTED_ACTIVATIONS`
and `isAbilityDeferred` are removed.

**3.5 Schema additions** (`src/data/schema.ts`):
```ts
export const PLACEMENT_SURFACES = ['floor', 'wall', 'any'] as const;
export type PlacementSurface = (typeof PLACEMENT_SURFACES)[number];
/** When a placed gadget applies its effects (ADR-0012 §4.4). */
export type GadgetTriggerDef =
  | { kind: 'none' }                       // the gadget itself is the effect (barrier)
  | { kind: 'aura' }                       // every tick while armed and not disabled
  | { kind: 'proximity'; radius: number }  // once, when an enemy body comes within `radius`; consumed
  | { kind: 'timer'; delay: number };      // once, `delay` s after placement; consumed
//   placeable: { kind: 'placeable'; maxActive; placeRange; gadgetHealth; surface: PlacementSurface; trigger: GadgetTriggerDef }
/** Effect kinds that act within a radius (keys of ABILITY_RULES.lineOfSight). */
export type RadiusEffectKind = Extract<EffectDef, { radius: number }>['kind'];
// AbilityDef += bot: BotAbilityHint (§10)
```
Data (starting values; `budgetCost` unchanged): Breakwater and Scaffold Screen `surface
'floor'`, trigger `none`; Bore Charge `'any'`, `{ timer, delay 2 }`; Tripline Nodes `'any'`,
`aura`; Burr Mines `'floor'`, `{ proximity, radius 1.2 }`.

`validateContent()` adds: positive radii, amounts, durations, `maxDuration`, `placeRange`,
`gadgetHealth`, integer `maxActive ≥ 1`, `speed > 0`, `gravityScale ≥ 0`, `fuse` null or > 0,
trigger radius/delay > 0; `barrier` only on `placeable` with `surface 'floor'` and trigger
`none`, and trigger `none` only with a `barrier`; bot hints per §10.

### 4. Gadgets, physics, bullets

**4.1 Shapes and collision groups.** `gadgetShape(ability)` (`sim/abilities/gadgets.ts`, pure;
physics and client both use it):
`{ kind: 'barrier'; halfExtents: [width/2, height/2, ABILITY_RULES.barrier.thicknessM/2] }` for
an ability with a `barrier` effect (width across the placer's view, standing on `pos`), else
`{ kind: 'device'; radius: ABILITY_RULES.gadget.deviceRadiusM }`.

`physics/groups.ts` gains layers `barrier`, `device`, `levelQuery`:

| Group | Interacts with |
| --- | --- |
| `barrier` (solid cuboid, fixed) | seen by `moveQuery`, `bulletQuery`, `sightQuery` |
| `device` (sensor ball) | seen by `bulletQuery` only (walk through, see through) |
| `moveQuery` | static, mover, **barrier** (KCC and head-room: barriers block movement and standing up) |
| `bulletQuery` | static, hitbox, **barrier**, **device** (bullets *and* projectiles) |
| `sightQuery` | static, **barrier** (`SimQuery.lineOfSight`: barriers block bot sight and area LOS) |
| `levelQuery` (new) | static only: `castGround` / `groundBelow` (nav checks, area drop) and placement surfaces |

**4.2 `PhysicsWorld` API** (Rapier stays behind it):
```ts
export type RayTarget = { kind: 'character'; entityId: EntityId; zone: HitZone } | { kind: 'gadget'; entityId: EntityId };
// BulletHit.target: RayTarget | null  (was { entityId; zone } | null); hitboxOwners → colliderOwners
addGadget(id: EntityId, shape: GadgetShape, pos: Vec3, yaw: number): void;
removeGadget(id: EntityId): void;          // disables now; the collider is removed inside the next step()
castSurface(origin: Vec3, dir: Vec3, maxDist: number): { point: Vec3; normal: Vec3; distance: number } | null;  // levelQuery
boxFree(center: Vec3, halfExtents: Vec3, yaw: number): boolean;   // nothing that blocks movement overlaps (moveQuery, sensors excluded)
step(): void;                              // pending gadget removals, then world.step()
```
`SimQuery` gains `surfaceAlong(origin, dir, maxDist)` and `boxFree(...)`; `lineOfSight` now means
"no level geometry and no barrier"; `groundBelow` stays level-only. `SimContext` gains
`readonly query: SimQuery` (placement, area LOS use the same surface as bots and the client).

**4.3 Timing.** A gadget collider created in step 4 is indexed by the physics step (8) and hit
by bullets in step 9 of the same tick; movement sees it from the next tick. Destroyed/consumed
gadgets are disabled at once (`setEnabled(false)`, as dead characters) and removed right before
`world.step()`, when no query runs — a test proves it (§11).

**4.4 Gadget runtime.** `gadgets.ts` (F): `spawnGadget(ctx, owner, ability, pose)`,
`damageGadget(ctx, g, amount, attacker, cause, point)`, `destroyGadget`, `removeGadgetsOf`;
the derived `gadgetCount(state, ownerId, abilityId)` lives in `stats.ts` (placing, HUD, bots).
`triggers.ts` (G): `gadgetSystem(ctx, dt)`, per gadget: `disabled > 0` → count down, nothing
else (timer paused) · armed = `tick − placedTick ≥ secondsToTicks(ABILITY_RULES.gadget.armSeconds)`
(proximity, aura; a timer runs from placement) · `none`: nothing · `aura`: `applyEffects`
(origin gadget, `amountScale dt`, `sustained`) · `proximity`: a living enemy with
`bodyDistance ≤ radius` → `burst`, `applyEffects` once, consumed · `timer`: `timer -= dt`, at 0
→ `burst`, `applyEffects`, consumed. Teammates never trigger. A barrier ignores `disabled`.

**4.5 Bullets vs gadgets** (`weapons.ts`): a pellet that hits a gadget stops there; per shot and
gadget the pellets' `falloffDamage(w, distance)` add up (no zone, armour or modifiers) →
`damageGadget` (`gadgetHit`; at 0 health `gadgetDestroyed` and removal). Own-team gadgets take no
damage without friendly fire (the pellet still stops). A hit on a gadget removed earlier in the
tick counts as level geometry (`impact`).

**4.6 Placement pose** (`sim/abilities/placement.ts`, pure over `SimQuery`; the sim confirms with
it, the client draws the ghost with it — one rule):
```ts
export type PlacementFailure = 'noSurface' | 'surface' | 'blocked';
export interface PlacementPose { pos: Vec3; yaw: number; normal: Vec3; valid: boolean; failure: PlacementFailure | null }
export function placementPose(query: SimQuery, e: Readonly<CharacterEntity>, ability: AbilityOf<'placeable'>, look: { yaw: number; pitch: number }): PlacementPose;
```
Ray from the eye along the look, `placeRange` long, on level geometry (`surfaceAlong`); no hit →
drop from the ray's end ≤ `ABILITY_RULES.placement.maxDropM`; none → `noSurface`. Floor = normal
within `CHARACTER.maxSlopeClimbDeg` of up, ceiling = the mirror (never valid), else wall;
must match `surface`. Barriers: yaw = look yaw, the box (shrunk and lifted by
`ABILITY_RULES.placement.skinM`) must be `boxFree` (no geometry, barrier or character capsule —
nobody gets trapped) → else `blocked`. Devices: `pos = point + normal × deviceRadiusM`, yaw from
the look (floor) or the normal (wall). Gadgets are placed on level geometry only, never on
gadgets.

### 5. Projectiles and areas

`sim/abilities/projectiles.ts` (P): `spawnProjectile(ctx, owner, ability, aim)` — at the eye,
`vel = dir × speed` (no inherited velocity), `prevPos = pos`, `fuse` from data.
`projectileSystem(ctx, dt)`, per projectile (a fuse runs from the tick after the throw, in
flight and at rest, so it bursts exactly `secondsToTicks(fuse)` ticks after it — as a gadget
timer):
- resting: `fuse -= dt`; time up (`isTimeUp`) → burst in place.
- flying: `vel.y -= SIM.gravity × gravityScale × dt`; sweep `pos → pos + vel × dt` with
  `castBullet` (bullet group: level, barriers, devices, hitboxes; the owner's body excluded
  always). No hit: move; a fuse reaching 0 bursts mid-air. Hit: `pos = point + normal ×
  surfaceOffsetM`; `fuse === null` → burst (`struck` = the character hit, if any); fused → drop
  horizontal velocity; a floor-class surface → `resting`, else keep falling. Fused projectiles
  never burst on contact (Gorse lands, then burns).
- `age > ABILITY_RULES.thrown.maxFlightSeconds` → removed without effect (left the level).
- **Burst** = `applyEffects` (origin = position, via projectile) + `burst` event + removal.
- Pure helpers for bots (and a later arc preview): `launchVelocity(ability, dir)`,
  `ballisticPitch(speed, gravity, horizontalDist, dy): number | null` (low arc).

Areas: §3.3.

### 6. System order in `Sim.step`
```
 1. controls                  (ModeRules.acceptsControl)
 2. mode rules                (round reset → clearWorldObjects + respawnAt)
 3. store prev*               (characters as now; projectiles' prevPos); filterCommand
 4. abilities                 expireEffects for every living character first; then per living
                              character: resources, activations → gadgets spawned, projectiles
                              launched, instant effects; returns the filtered command
 5. gadgets                   (triggers.ts) arming, disabled countdown, aura, proximity, timer
 6. areas                     (areas.ts) damage over time, stat modifiers, expiry
 7. movement                  filtered command; KCC sees barriers indexed by the last physics step
 8. physics step              pending gadget removals, then world.step() — new colliders indexed
 9. weapons                   rays see this tick's hitboxes and gadgets; gadget damage
10. projectiles               sweeps see the same; bursts (may spawn areas, damage, heal …)
11. lastButtons = raw buttons
```
Kills from steps 4–10 are judged by the mode in step 2 of the next tick (as now). An area
applies from the first area step after it exists. This supersedes the order line in
`CLAUDE.md` and ARCHITECTURE §3 (coordinator updates them).

### 7. Events (ADR-0006)

| Event | Fields | Consumers |
| --- | --- | --- |
| `hit` (changed) | `+ cause: DamageCause; absorbed: number` | HUD markers (shield hits), bots: damage contacts only for `cause.kind === 'weapon'` |
| `kill` (changed) | `weaponId` → `cause: DamageCause` | kill feed (weapon or ability name), bots, intel |
| `ability` (changed) | `+ pos: Vec3` (user's feet) | ability signature sound (positional for others), bot hearing |
| `abilityEnd` | `entityId, abilityId, slot, reason: 'released' \| 'maxDuration' \| 'toggledOff' \| 'interrupted' \| 'died'` | HUD, audio (release) |
| `abilityFailed` (changed) | reason `+ 'maxActive' \| 'invalidPlacement'` | HUD/audio feedback |
| `gadgetPlaced` | `gadgetId, ownerId, abilityId, pos` | audio, bot hearing |
| `gadgetHit` | `gadgetId, attackerId, amount, point, cause` | hit marker, impact mark |
| `gadgetDestroyed` | `gadgetId, abilityId, ownerId, pos, attackerId, cause` | audio, debris |
| `burst` | `source: 'gadget' \| 'projectile', sourceId, abilityId, ownerId, pos` | flash, audio, bot hearing |
| `revealed` | `entityId, team, abilityId` (start of being visible to `team`) | "revealed" warning for the target, ping for the revealing team |
| `shieldGained` / `shieldBroken` | `entityId, abilityId (, amount)` | HUD, audio |
| `healed` | `entityId, abilityId, amount, sourcePos` | HUD (+HP), audio |

Not events (state is the source; the client and bots diff it): projectile launch (`ability` +
`state.projectiles`), area start (the `burst` that made it) and end, reveal end, gadget removal
by trigger or round reset, placing started/cancelled (`slot.active`).

### 8. Reveal
- **Player** (SPEC §14): a DOM marker (`client/ui/revealMarkers.ts`, through walls by nature)
  over the head of every living enemy with `isRevealedTo(e, player.team)`, in the enemy colour
  (`--enemy`), fading out with the entry. A revealed player sees a "REVEALED" warning while
  `isRevealedTo(player, otherTeam)` and hears a cue on `revealed`.
- **Bots**: `perception.ts` (the only reader of enemy state, ADR-0011) turns every living enemy
  revealed to the bot's team into a contact each tick: new `ContactSource` `'reveal'`, exact feet
  position and velocity, `visible: false` (aim may pre-aim; the fire gate still needs sight).
  `SOURCE_RANK`: callout 0, sound 1, damage 2, reveal 3, sight 4. No callout delay and no
  `intel.ts` change: the reveal is already team knowledge, the same moment for bots and players.

### 9. Client

| Piece | Where | Rule |
| --- | --- | --- |
| Gadgets | `render/abilities.ts` (`AbilityViews`) | barrier boxes from `gadgetShape` (`ABILITY_VISUALS.barrier`), device balls in the owner's team colour (`TEAM_STYLE`, SPEC §16), greyed while `disabled` |
| Projectiles | same | small spheres, interpolated `prevPos → pos` |
| Areas | same | ground disc + ring at exactly the data radius (`ABILITY_VISUALS.ring`), owner's team colour, everyone sees them |
| Trigger/aura radii | same | rings for proximity/aura gadgets, owner's team only |
| Channel ring | same | `channelProgress(slot) × radius` around the channeller, everyone |
| Bursts | same | short flash at `burst.pos` (`ABILITY_VISUALS.burst`) |
| Placement ghost | same (`setGhost`) | the gadget shape at `placementPose(sim.query, player, ability, input look)` each frame, `ghost.valid`/`invalid` colour, plus every radius of the ability's effects and trigger |
| Shields | `render/actors.ts` | a translucent shell on shielded characters |
| View model | `render/viewmodel.ts` | `ViewModelMotion.lowered` (0…1) lowers the weapon while `weaponBlockedBy(p)` |
| HUD slots | `ui/hud.ts` | `HudAbility` + `state: 'ready' \| 'recharging' \| 'empty' \| 'active' \| 'placing' \| 'passive'`, `progress` (channel/toggle), detail incl. "n/max placed"; a channel bar and the placing hint (`bindingLabel('fire')` place · `bindingLabel('ads')` cancel, failure text) under the crosshair; shield amount on the health bar; "REVEALED" |
| Reveal markers | `ui/revealMarkers.ts`+ | §8; reuses `worldLabels.ts`' projection (exported) |
| Kill feed | `ui/killFeed.ts` | ability kills show the ability name |
| Audio | `audio/sfx.ts` | per-ability signature derived, not listed: `AUDIO.ability.signature.baseTone[activation kind] × 2^(index in ABILITIES × stepSemitones / 12)` — unique for every ability, both teams, positional (`AUDIO.spatial.reach.ability`, reach `AI.hearing.abilityRadiusM`: players and bots hear abilities equally far); cues for `burst`, `gadgetPlaced`, `gadgetDestroyed`, `healed`, `shieldGained`, `shieldBroken`, `revealed`, `abilityEnd` |
| QA | `qa.ts` | `state()` gains gadgets, projectiles, areas and the player's slot activities |

Key bindings: none new (Q/E abilities, left mouse places, right mouse cancels); F rewrites the
two ability descriptions in `BINDINGS` (the README controls block is generated from them).

`AbilityViews` contract (F writes it as a stub, V implements, U wires it in `app.ts`):
```ts
export class AbilityViews {
  constructor(scene: Scene, localTeam: number);
  sync(state: Readonly<SimState>, alpha: number): void;     // diff by id every frame
  setGhost(ghost: { ability: AbilityDef; pose: PlacementPose } | null): void;
  onEvents(events: readonly SimEvent[]): void;             // bursts, destruction
}
```

### 10. Bots
**Schema** (`src/data/schema.ts`; required on every `AbilityDef`):
```ts
export type BotAbilityHint =
  | { use: 'never' }                                                     // passives; abilities bots skip in M2
  | { use: 'engage'; maxRangeM?: number }                                // a visible target in range: self buffs, throws at it
  | { use: 'escape'; healthBelow: number }                               // hit by an unseen enemy, or own health ≤ healthBelow in a fight
  | { use: 'hold' }                                                      // at a hold post: place / toggle towards the watch direction
  | { use: 'scout' }                                                     // no visible target: gather intel (≤ once per AI.abilities.scoutIntervalSeconds)
  | { use: 'support'; healthBelow: number; maxRangeM?: number }          // an ally or self ≤ healthBelow in range
  | { use: 'flush'; maxRangeM?: number };                                // a contact lost from sight in range: throw/plant at its last known position
export type BotAbilityUse = BotAbilityHint['use'];
```
`maxRangeM` defaults to the ability's derived reach (`abilityReach()`, `ai/abilities.ts`: thrown =
a 45° throw's range, placeable = `placeRange` + largest radius, self-centred = largest radius).
Validation: passive ⇒ `never`; `hold` ⇒ placeable or toggle; `support` ⇒ a heal or shield
effect; `scout` ⇒ a reveal effect; `healthBelow` in (0, 1]; ranges > 0.

| Ability | Hint | | Ability | Hint |
| --- | --- | --- | --- | --- |
| Brace | `engage`, 30 m | | Bore Charge | `flush`, reach |
| Breakwater | `hold` | | Slag Lance | `flush`, 20 m |
| Set Piton | `hold` (on at the post, off when leaving) | | Tripline Nodes | `hold` |
| Slipstream | `escape` ≤ 0.6 | | Sonar Pulse | `scout` (full channel) |
| Updraft | `never` (no vertical-boost nav links) | | Mend Dart | `support` ≤ 0.6, 20 m |
| Lightfoot | `never` (passive) | | Scaffold Screen | `hold` |
| Overclock | `escape` ≤ 0.6 | | Overbrace | `support` ≤ 0.7, reach |
| Burr Mines | `hold` | | Firebreak | `flush`, 18 m |

**Brain** (`src/ai/abilities.ts`+, called at the end of `act()` in `brain.ts`):
`abilityStep(bot, self, ctx, cmd, now)` may add ability/fire/ads bits and override the look.
`BotState.abilities: { plan: BotAbilityPlan | null; nextTryTick: number[]; lastScoutTick: number }`
with `BotAbilityPlan = { slot; phase: 'aim' | 'placing' | 'channel'; point: Vec3 | null; untilTick }`.
Ready = `canActivate` (resource.ts) + slot idle + `gadgetCount < maxActive`; a failed situation
check waits `AI.abilities.retrySeconds` (bot RNG jitter). Placement: press the key, look at the
point (`hold`: post + watch direction × `min(AI.abilities.placeAheadM, placeRange)` at feet
height; `flush`: the contact's last position), press fire once `placementPose(...).valid`,
cancel with ADS after `placeTimeoutSeconds`. Throws: `ballisticPitch` to the point, then press.
Holds: keep the key down for `maxDuration`. Never starts a placement or channel while a visible
target is engaged (weapon block); `engage`/`escape` abilities fire mid-fight. Only contacts,
teammates' own state and `SimQuery` feed it — no wall-hacks.
**Perception**: reveal contacts (§8); hears `ability`, `burst`, `gadgetPlaced` within
`AI.hearing.abilityRadiusM` (same occlusion rule as other sounds); ability-caused hits make no
damage contact (the burst point is not the attacker) but set `threat` to `sourcePos`.
**M2 scope**: every hint kind implemented and tested; bots do not perceive or avoid gadgets and
areas (they shoot characters; a barrier on a nav link is handled by stuck recovery).

### 11. Tests
Real `Sim` in Node unless noted; `+` = new file. F extracts `run`/`world`/`SECONDS`/`EAST` from
`sim.test.ts` into `tests/unit/support/world.ts`+ and adds `tests/unit/support/abilityWorld.ts`+
(a `SimContext` over a real `PhysicsWorld` via `createSimState` / `createSimContext` /
`addCharacter`, which `Sim` itself uses — for effect handlers without activations).

| File | Proves |
| --- | --- |
| `abilities-core.test.ts`+ (F) | barrier gadget blocks walking, standing up, bullets (`gadgetHit`, falloff damage), `lineOfSight`; device stops bullets only; destroyed → no longer blocks rays or movement next tick, no Rapier error; shield order (mitigation first, soonest-expiring first, overflow, `shieldBroken`, `absorbed`); `kill.cause` weapon vs ability; death clears shields, reveals, activities; one id sequence; elimination round reset clears gadgets/projectiles/areas and colliders; operator change removes own gadgets; `isAbilitySupported` table (pure) |
| `content.test.ts` (F) | every ability in `ABILITIES` supported; new validation errors (trigger/surface/barrier rules, hints); deferred tests removed |
| `resource.test.ts` (F) | `startCooldown` test removed |
| `effects.test.ts`+ (E, harness) | **one block per effect kind**: damage (hostile only, armour + `damageTaken`, cause, gadgets damaged, friendly fire off spares allies and user, no LOS), heal (cap, targets, `struck`, `healed`), shield (grant, refresh = max, `shieldGained`), reveal (enemies only, `radiusScale`, refresh, one `revealed`), areaDenial (on the ground, dps × dt, slow while inside + lapse after leaving, blocked through the range peek wall, floor above out of reach, expiry), disableGadgets (enemy gadgets in radius, max duration); barrier (no-op apply, shape) |
| `channel.test.ts`+ (H) | Sonar: spend on press, weapon blocked (no shot, ADS 0), `channelProgress` linear, release → `released`, cap → `maxDuration`, cooldown counts from the end, death → `died`; Piton: on/off, `topSpeed` 0 while on and back within `sustainSeconds`, cooldown only after off, never ends by itself; replaces the Heron "unsupported" test in `sim.test.ts` |
| `gadgets.test.ts`+ (G) | placing spends nothing; fire confirms at `placementPose`, `ability` + `gadgetPlaced`, the confirm never fires the weapon (held auto trigger too); ADS / own key / swap cancel; invalid pose → `invalidPlacement`, still placing; `maxActive`; `placementPose` cases (floor, wall, drop, no surface, wrong surface, blocked by a character); arming; aura acts every tick; proximity: enemy yes, teammate no, consumed with `burst`; timer after `delay`, paused while disabled; Keel end to end (blocks, destroyed by bullets, passage free) |
| `projectiles.test.ts`+ (P) | flight matches the closed-form arc; burst on a wall at the offset point; `struck` on a hitbox; owner never hit; fused: lands, rests, bursts at fuse end; mid-air fuse; max flight; crosshair aim incl. recoil; `ballisticPitch` hits its point (pure) |
| `roster.test.ts`+ (R) | every one of the 16 abilities end to end through commands on the range with its data outcome (a table keyed by ability id; a missing id fails); Slag Lance disables a Burr Mine; replay determinism with gadgets, projectiles and areas (`sim.test.ts` replay test extended) |
| `bot-abilities.test.ts`+ (B) | one scenario per hint kind (range, any operator): Brace on engage, Slipstream escape, Keel barrier at a post facing its watch yaw, Piton on/off, Sonar while investigating → reveal contacts, Mend Dart heals a hurt ally, Firebreak/Lance flush; `commands()` leaves state unchanged; determinism; `match.test.ts` logs ability use per operator |
| `perception.test.ts` (B) | reveal contacts (exact, not visible, rank), ability hearing, no damage contact from ability hits |
| `smoke.spec.ts` (U, e2e) | range: select Keel via `__qa`, place a barrier with QA buttons → one gadget in `__qa.state()`, clean console |

### 12. Configuration (F writes every key; starting values)
`src/config/sim.ts`:
```ts
export const ABILITY_RULES = {
  sustainSeconds: 0.1,                  // modifiers from hold/toggle/aura/areas lapse this long after the last re-application
  losLiftM: 0.5,                        // LOS checks start this high above an effect origin
  lineOfSight: { damage: false, heal: false, shield: false, modifier: false, reveal: false, areaDenial: true, disableGadgets: false }, // satisfies Record<RadiusEffectKind, boolean>
  placement: { maxDropM: 2, skinM: 0.03 },
  gadget: { armSeconds: 0.5, deviceRadiusM: 0.15 },
  barrier: { thicknessM: 0.2 },
  thrown: { maxFlightSeconds: 8, surfaceOffsetM: 0.05 },
  area: { maxDropM: 3 },
} as const;
// AI.hearing.abilityRadiusM: 30
// AI.abilities: { retrySeconds: 1, placeAheadM: 2, placeTimeoutSeconds: 1.5, scoutIntervalSeconds: 12 }
// RANGE_MODE.allOperators: true   (Q1)
// GUNPLAY.friendlyFire: doc comment → "all damage between teammates, abilities included"
```
`src/config/client.ts`: `ABILITY_VISUALS` (`ghost` valid/invalid/opacity, `barrier`, `device`,
`ring` width/lift/segments/fillOpacity, `projectile` radius, `burst` seconds/colour, `shield`
grow/opacity/colour); `VIEWMODEL.lowered` (pose and blend time, next to `VIEWMODEL.sprint`);
`HUD.abilities` (channel bar size, texts:
placing hint words, failure texts, "REVEALED", "n/max placed"); `HUD.reveal` (marker size,
fade); `AUDIO.ability` (`signature` base tones per activation kind, `stepSemitones`, cue
impulses); `AUDIO.spatial.reach.ability` (`maxDistance: AI.hearing.abilityRadiusM`); ability
`BINDINGS` descriptions. Shot definitions (`ShotDef`, `SHOTS`, `SHOT_STAGING`) are U's after F.

### 13. Balance
- No new budget formula: the utility term stays the declared, reviewed `budgetCost` (SPEC §9.1);
  new effect kinds need no weight. Trigger values (Burr trigger radius, Bore delay, arm time) do
  not enter the budget; review them in playtest.
- "Heron's budget still counts Sonar" resolves itself when Sonar works; the coordinator drops it
  from PROJECT_STATE's known issues.
- `balance/report.ts`: `describe()` prints nested objects (`trigger proximity (radius 1.2)`), the
  "In sim" column is replaced by "Bots" (`describe(a.bot)`); F runs `npm run docs:gen`.

### 14. Implementation batches (disjoint file ownership)
Waves: **A** = F · **B** = H ∥ G ∥ P ∥ E ∥ V ∥ U · **C** = B ∥ R, then the coordinator's shots
review and docs. Contract files — `data/schema.ts`, `sim/types.ts`, `config/sim.ts`,
`config/client.ts` (except U's shot definitions), `sim/sim.ts`, `sim/context.ts`, `sim/query.ts`,
`physics/*`, `abilities/effects.ts`, `abilities/targeting.ts`, the stub signatures — are frozen
after F; changes go through the coordinator. F creates every file marked *stub* with its final
signature (systems as no-ops, activation stubs emitting `abilityFailed 'unsupported'`, handler
stubs as no-ops, `placementPose` returning `valid: false`), so wave B never waits on a sibling;
the named batch then owns it. F may make compile-only edits anywhere before wave B starts.
Every batch ends with `npm run check`; a batch that changes generated output runs `npm run
docs:gen` (generated files only). Hand-written docs stay with the coordinator. `+` = new file.

| Batch | Owns (paths under `src/` unless noted) | Tests | Needs |
| --- | --- | --- | --- |
| **F Foundation** | `data/schema.ts`, `data/abilities.ts`, `data/content.ts`, `balance/report.ts`, `config/sim.ts`, `config/client.ts`, `sim/types.ts`, `sim/context.ts` (`query`, `createSimContext`), `sim/sim.ts` (order §6, `createSimState`), `sim/entities.ts` (`allocateId`, `addCharacter`, `clearWorldObjects`, resets), `sim/stats.ts` (`weaponBlockedBy`, `canFire`, `isRevealedTo`, `shieldAmount`, `channelProgress`, `gadgetCount`), `sim/hitbox.ts` (`bodyDistance`), `sim/query.ts`, `sim/combat/damage.ts` (`mitigatedDamage`), `sim/physics/groups.ts`, `sim/physics/world.ts`, `sim/systems/health.ts` (cause, shields, death clean-up), `sim/systems/weapons.ts` (`aimOf` look override, gadget hits, block gating), `sim/systems/abilities.ts` (dispatcher, `ACTIVATIONS`), `sim/abilities/effects.ts` (registry, `applyEffects`, support table), `sim/abilities/targeting.ts`+, `sim/abilities/interrupt.ts`+, `sim/abilities/gadgets.ts`+, `sim/abilities/activation/instant.ts`+ (instant + passive, moved), `sim/abilities/resource.ts`, `sim/modes/elimination.ts` (one call), stubs: `sim/abilities/{handlers,areas,triggers,placement,projectiles}.ts`+, `sim/abilities/activation/{hold,toggle,placeable,thrown}.ts`+, `client/render/abilities.ts`+; compile-only: `client/app.ts` (kill cause), `client/render/viewmodel.ts` (`lowered` field) | `tests/unit/support/world.ts`+, `tests/unit/support/abilityWorld.ts`+, `abilities-core.test.ts`+, `content.test.ts`, `resource.test.ts`, `perception.test.ts` (two kill literals), `sim.test.ts` (helper import only) | — |
| **H Channel + toggle** | `sim/abilities/activation/hold.ts`, `sim/abilities/activation/toggle.ts` | `channel.test.ts`+, Heron test removed from `sim.test.ts` | F |
| **G Gadgets** | `sim/abilities/activation/placeable.ts`, `sim/abilities/placement.ts`, `sim/abilities/triggers.ts` | `gadgets.test.ts`+ | F |
| **P Projectiles** | `sim/abilities/activation/thrown.ts`, `sim/abilities/projectiles.ts` | `projectiles.test.ts`+ | F |
| **E Effects + areas** | `sim/abilities/handlers.ts`, `sim/abilities/areas.ts` | `effects.test.ts`+ | F |
| **V World visuals** | `client/render/abilities.ts`, `client/render/actors.ts`, `client/render/viewmodel.ts` | typecheck; shots in wave C | F (visible once H/G/P/E land) |
| **U HUD, audio, wiring** | `client/app.ts`, `client/ui/hud.ts`, `client/ui/revealMarkers.ts`+, `client/ui/worldLabels.ts`, `client/ui/killFeed.ts`, `client/audio/sfx.ts`, `client/qa.ts`, `client/modes/rangeHost.ts` (Q1), the shot definitions in `config/client.ts` (`ShotDef` ability staging; shots: placement ghost, barrier, fire area, Sonar ring + reveal markers, gadget overview), `index.html` (CSS), `tools/screenshot.mjs` (if staging needs it), `tests/e2e/smoke.spec.ts` | e2e (placement green once G lands) | F |
| **B Bots** | `ai/abilities.ts`+, `ai/brain.ts`, `ai/perception.ts`, `ai/controller.ts` (if needed) | `bot-abilities.test.ts`+, `perception.test.ts`, `match.test.ts` | H, G, P, E |
| **R Roster integration** | `tests/unit/roster.test.ts`+, the replay test in `sim.test.ts`; defects go back to the owning batch via the coordinator | itself | H, G, P, E |

Coordinator after wave C: `npm run shots` review (V + U), SPEC §7 status + §10.2 + §14–§16
as-built, ARCHITECTURE (§3 order, §4 state table, §8 physics groups, §10 tests, §1.1 SimQuery
sees barriers), `CLAUDE.md` (system order, "Add an ability" step 3 now "supported
combination"), ROADMAP, PROJECT_STATE, ADR index.

### 15. Open questions (the coordinator builds the default until the user answers)
1. **Operators in M2.** Range: switch through all 14 operators, so every ability can be tried
   and screenshotted? Elimination and bot rosters keep the four M1 operators
   (`PLAYABLE_OPERATORS`) until M4. **Default: yes** (`RANGE_MODE.allOperators: true`).
2. **`maxActive` reached**: refuse a new placement (`abilityFailed 'maxActive'`) or replace the
   oldest gadget? **Default: refuse** — Breakwater's second use then needs the first destroyed.
3. **Enemy gadgets**: everyone sees every gadget body; trigger/aura radius rings only for the
   owner's team; area effects for everyone (SPEC §16). **Default: as stated.**
4. **Throwing**: a press throws at once along the crosshair (no hold-to-aim arc preview in M2).
   **Default: press throws**; an arc preview can reuse `launchVelocity` later.

### 16. F as built (2026-09-30)
The contract for wave B; where it differs from §1–§14, this section wins.

**Module graph (hard rule).** `effects.ts` builds `HANDLERS` and `systems/abilities.ts` builds
`ACTIVATIONS` at module load, so neither table may sit in an import cycle. `handlers.ts`,
`areas.ts`, `gadgets.ts`, `triggers.ts`, `projectiles.ts`, `placement.ts`, `targeting.ts`,
`interrupt.ts` never import `entities.ts`, `modes/*`, `activation/*` or (as a value)
`systems/abilities.ts`; `handlers.ts`/`areas.ts`/`targeting.ts` never import `effects.ts`.
Activation files may import `effects.ts`, `spend.ts`, `gadgets.ts`, `placement.ts`,
`projectiles.ts`, `systems/weapons.ts`. Types from `systems/abilities.ts` via `import type` only.

**Moved / renamed**
- `allocateId(state)` is in `sim/context.ts` (leaf), not `entities.ts` (cycle above).
  `createSimContext(state, level, physics, sink: (e: SimEvent) => void)` stamps the tick.
  `createSimState(seed)` in `sim.ts`; `addCharacter(ctx, o)`, `clearWorldObjects(ctx)` in `entities.ts`.
- `isAbilitySupported(a)` is in `sim/systems/abilities.ts` = `isAbilityCompatible(a)` ∧
  controller `implemented` ∧ every handler `implemented`. `effects.ts` keeps the §3.4 table:
  `SUPPORTED_EFFECTS`, `isCombinationSupported(activation, effect)`, `isAbilityCompatible(a)`,
  `areEffectsImplemented(effects)`. **Each batch sets `implemented: true`** on its controllers /
  handlers when they run end to end; nothing else flips support.
- `EffectContext`, `EffectVia`, `EffectScaling`, `Handler<K>`, `EffectHandler<K>` live in
  `targeting.ts` (`effects.ts` re-exports `EffectContext`). `HANDLERS: { [K]: EffectHandler<K> }`
  with `EffectHandler<K> = { implemented: boolean; apply(ctx, effect, index) }` — `index` = the
  effect's position in `ability.effects` (areaDenial → `spawnArea(ctx, index)`).
- `targeting.ts` also has `effectContext(sim, ability, user, origin, via, scaling?)` (defaults:
  scales 1, not sustained, struck/command null, origin copied), `TargetFilter = EffectTargets |
  'hostile'`, `canHarm(attackerTeam, victimTeam)` (the one friendly-fire rule; weapons use it) and
  `addModifier(target, modifier)` (same-source refresh; for areas).
- `ActivationController<K>` gains `readonly implemented: boolean`. Exports:
  `INSTANT_ACTIVATION`, `PASSIVE_ACTIVATION` (instant.ts), `HOLD_ACTIVATION`, `TOGGLE_ACTIVATION`,
  `PLACEABLE_ACTIVATION`, `THROWN_ACTIVATION`; handlers `DAMAGE_HANDLER`, `HEAL_HANDLER`,
  `SHIELD_HANDLER`, `BARRIER_HANDLER` (final no-op, `implemented: true`), `REVEAL_HANDLER`,
  `AREA_DENIAL_HANDLER`, `DISABLE_GADGETS_HANDLER`. `hasActivation(a, kind): a is AbilityOf<K>`.

**Spend path and ability gate (ADR-0013 §4)** — `sim/abilities/activation/spend.ts` (new, F):
`spendActivation(ctx, e, index, ability): boolean` = `passesAbilityGate` (`abilityFailed
'blocked'`) → `consume` (`'notReady'`) → `ability` event (pos = feet). Call it wherever an
activation spends (instant press, hold/toggle start, placeable confirm, throw); never
`consume()` directly. `refuseActivation(ctx, e, ability, reason)` emits every other
`abilityFailed`. Gate: optional `ModeRules.abilityAllowed?(match, e, ability)`,
`matchAbilityAllowed(match, e, ability)` in `modes/index.ts` (absent = allowed); called only
from `passesAbilityGate`. Passives are never gated; a passive's key is ignored (no interrupt).

**Dispatcher.** No `isAbilitySupported` gate: a stub controller refuses `'unsupported'` itself; an
implemented controller runs even while handlers are stubs (no-ops), so G/P can test through
commands before E lands. Sim.step skips movement (as weapons) for a character killed earlier
in the tick and stores projectiles' `prevPos` in step 3.

**Gadgets** (`gadgets.ts`): `GadgetShape` (`halfExtents: Vec3Tuple`), `GadgetPose {pos, yaw,
normal}` (`PlacementPose extends GadgetPose`), `spawnGadget(ctx, owner, ability, pose):
GadgetEntity` (emits `gadgetPlaced`), `damageGadget(ctx, g, amount, attackerId, cause, point)`,
`destroyGadget(ctx, g, attackerId, cause)`, **`removeGadget(ctx, g)`** (silent: consumed
trigger), `removeGadgetsOf(ctx, ownerId)`. `PhysicsWorld.removeGadget` throws for an unknown id.

**Events / state.** `hit.damage` = the whole mitigated amount (shields + health), `absorbed` =
the shield part. A pellet on a gadget that takes nothing (own team without friendly fire, or
removed this tick) emits `impact`. `abilityEnd` only for `channel`/`on`; placements end
silently. `stats.ts`: `channelProgress(slot)` is channel-only (null otherwise).
`aimOf(e: Readonly<CharacterEntity>, look?)`. `physics/world.ts` exports `SurfaceHit`
(`castSurface`/`surfaceAlong`); `boxFree(center, halfExtents: Vec3, yaw)`.

**Stubs.** No-op stubs declare their final signature as a typed `const` (ESLint forbids unused
parameters): `gadgetSystem`, `areaSystem`, `spawnArea(ctx: EffectContext, effectIndex): void`,
`spawnProjectile(ctx, owner, ability: AbilityOf<'thrown'>, aim: {origin, yaw, pitch}): void`,
`projectileSystem`, `ballisticPitch(...): number | null` (stub null); `launchVelocity` is
implemented (dir × speed). `AbilityViews.sync/setGhost/onEvents` are typed properties
(`PlacementGhost {ability, pose}`). Replace them with functions/methods of the same signature.

**Client/config.** `ViewModelMotion.lowered`: app.ts passes 1 while `weaponBlockedBy(p)`, else 0;
`VIEWMODEL.lowered {offset, rotation, blendSeconds}`. `HUD.abilities.text.placed(count, max)`,
`.failure: Record<AbilityFailReason>`, `.placement: Record<PlacementFailure>`;
`AUDIO.ability.signature {baseTone, stepSemitones, length, gain}`, `.cues`.
`RANGE_MODE.allOperators` exists; the range host does not read it yet (U). ROSTER's "In sim"
column is "Bots" (§13); only the HUD still shows "coming in M2".

**Tests.** `tests/unit/support/world.ts`: `EAST`, `SECONDS`, `Input`, `commandFor`, `run`,
`world`, `EventOf`, `ofType`. `tests/unit/support/abilityWorld.ts`: `abilityWorld(level?,
seed?)` → `{ ctx, events, add(operatorId, team, pos, {controller?, yaw?}), effect(abilityId,
user, opts?), apply(abilityId, user, opts?): SimEvent[], drain(), stepPhysics(),
stepCharacter(e, input?) }` (`opts` = `{origin?, via?}` + `EffectScaling`). `content.ts` exports
`abilityProblems(a)`. Effects reach only characters in `state.entities` (use `add`).

### 17. Waves B/C as built (2026-09-30)
Everything else is built as §1–§16 describe; where this section differs, it wins.

- **H (hold, toggle).** The press only spends and starts the activity; effects apply from the
  next tick on (`sustain`). Hold: `radiusScale = channelProgress(slot)`, `amountScale =
  dt / maxDuration`; toggle: `amountScale = dt`. Both end through `endActivity` (`released` /
  `maxDuration` / `toggledOff`). Another slot's press interrupts a channel or a placement, never
  a toggle.
- **E (effects, areas).** `applyAbilityDamage` (`areas.ts`) is the one ability-damage path to a
  character (damage effect and area ticks): `mitigatedDamage` → `applyDamage` on the torso,
  `hit.distance` = origin → torso centre. `areaEffectOf(area)` reads an area's effect from data
  (the client draws its radius from it). `shieldGained.amount` = the amount gained, emitted only
  when > 0 (a refresh that only extends the time is silent). An area without `stats` adds no
  modifier; with `damagePerSecond` 0 it makes no hit. Overlapping areas of one ability each deal
  their damage; their modifier (source = ability id) does not stack (SPEC §8).
- **P (projectiles).** Flight integrates constant gravity exactly, so positions lie on the
  closed-form arc and `ballisticPitch` hits its point; `projectileGravity(ability)` is the one
  gravity rule (sim, bots). A fused projectile rests only on a floor-angled level surface
  (`FLOOR_MIN_NORMAL_Y`), otherwise it keeps falling. A burst removes the projectile, emits
  `burst`, then applies the effects.
- **G (gadgets).** The mode gate is checked at the press and again at the confirm (the spend).
  Every fire press while placing is suppressed, not only the confirming one (no buffered shot
  after a failed try or a cancel). A `timer` gadget bursts exactly `secondsToTicks(delay)` ticks
  after placement. The `disabled` countdown runs on barriers too (they keep blocking). Placement
  yaw = crosshair yaw; placement rays (`levelQuery`) ignore barriers. `maxActive` refuses (Q2).
- **V (world visuals).** Barrier boxes at the exact `gadgetShape` size and device balls in the
  owner's team colour (`TEAM_STYLE`); trigger/aura rings for the owner's team only; areas as
  disc + ring at the exact data radius for everyone; channel ring; placement ghost in the
  valid/invalid colour; burst and destruction flashes; one shield capsule per shielded
  character; no world visual for heals (HUD and sound only). The view model lowers while
  channelling or placing.
- **U (HUD, audio, wiring).** Slot states `ready`/`recharging`/`empty`/`active`/`placing`/
  `passive`, a progress line, "n/max placed", greyed while `matchAbilityAllowed` refuses; channel
  bar and placement hint under the crosshair; shield "+N" and a shield segment on the health bar,
  heal "+N", the "REVEALED" warning; reveal markers (`ui/revealMarkers.ts`); ability kills in the
  kill feed (`kill.cause`). The range cycles every operator in `src/data/operators.ts`
  (`RANGE_MODE.allOperators`, Q1); matches keep `PLAYABLE_OPERATORS`. Audio: `abilitySignature()`
  derives the tone from the ability's position among the abilities *of its activation kind*, with
  a waveform per kind (replaces §9's index over all `ABILITIES`); positional cues for place,
  destroy, burst, heal, shield and `abilityEnd`, the reveal ping, area loops (`Sfx.areaLoops`,
  diffed per frame, under the voice cap); `abilityFailed` plays the dry-fire click. Six
  `ability_*` shots in `SHOTS`.
- **K (SSOT clean-up).** One duration rule, `isTimeUp()` next to `secondsToTicks` in
  `config/sim.ts`, ends every countdown (durations, cooldowns, charges, channels, areas, gadget
  timers, fuses, reload, swap, trigger buffer). `characterById` / `ownerOf` live in
  `sim/context.ts`, `FLOOR_MIN_NORMAL_Y` in `physics/world.ts` (placement surface class,
  projectile rest), `commandLook` / `clampPitch` in `sim/command.ts` (movement, placement, throws,
  bots). `validateContent()` rejects `fuse ≥ ABILITY_RULES.thrown.maxFlightSeconds`.
- **B (bots).** `ai/abilities.ts` reads each ability's `bot` hint and presses through Commands
  only when the gate (`matchAbilityAllowed`), the resource (`canActivate`) and `maxActive` allow;
  placements aim first and confirm only on a valid `placementPose`; throws aim with
  `ballisticPitch`; reveals become exact `reveal` contacts for the whole team (§8). Bots hear
  `ability` events only (a placement's comes with its `gadgetPlaced`; a `burst` is not heard as
  its owner). Areas are avoided only through their damage (hit → take cover). A barrier taller
  than eye height at the post is not placed, so bots never use Scaffold Screen. Data: Kestrel's
  Updraft hint is `escape` (was `never`). Measured on Saltworks, medium tier, seeds 1–20:
  attacker win 54.9 % (was 58.3 %), median round 56.9 s, controller 0.050 ms/tick average,
  worst 4.9 ms.
- **R (integration).** `roster.test.ts`: every roster ability end to end through Commands (one
  case per id) and an elimination round reset that clears world objects. `replay.test.ts` (new
  file, not the `sim.test.ts` replay test): a scripted ability round recorded in ADR-0014's
  recording shape and replayed to identical state and events (robust digest). `content.test.ts`
  asserts `isAbilitySupported()` for every ability (M2 DoD).
- **Fixes after R (2026-09-30).** (1) Step 4 first runs `expireEffects(e, dt)`
  (`systems/abilities.ts`) for every living character, then the activations; before, an effect
  on a target with a higher id than its user ended one tick early. Every effect now acts on
  exactly `secondsToTicks(duration)` ticks. (2) `withoutNegativeZero` (`sim/math.ts`): the sim
  never stores −0 angles (`anglesTo`, `clampPitch`/`commandLook`, teleport,
  `createCharacter`/`respawnAt`), so recordings round-trip through JSON exactly (ADR-0014).
  (3) Fire cadence: `fireCooldown` counts down only while > 0 and the next shot fires when
  `isTimeUp(fireCooldown)`, remainder carried; the first interval after idle was one tick short
  before (faster than `rpm`). The balance TTK model now matches the sim within half a tick.
  (4) A thrown fuse does not count down on the throw tick: it bursts exactly
  `secondsToTicks(fuse)` ticks after the throw, like gadget timers. Areas: gadget-born areas act
  in their burst tick, projectile-born ones the tick after (both "first area step after it
  exists", §6).

## Consequences
- Every activation and effect kind runs in the Node sim with one targeting rule, one damage
  pipeline (mitigation → shields → health) and one placement rule shared by sim, client and bots.
  Adding an ability stays data plus at most one handler; a new activation × effect combination
  needs its semantics written into §3.4 first.
- `SimState` grows three plain lists; snapshots (M2 net spike, M6) include them unchanged. The
  ability layer uses no RNG, so replays stay deterministic.
- Barriers change the world between steps: `SimQuery.lineOfSight` answers for the colliders of
  the last physics step (bots, area LOS); level-only probes moved to `levelQuery`.
- Relay (next ADR) filters ability presses in its setup phase through `ModeRules.filterCommand`
  ("attackers: recon only" = abilities whose effects are all `reveal`, derived); gadgets placed
  in setup persist into the round; `clearWorldObjects` runs at its round reset.
- Rejected: gadgets and projectiles inside `SimState.entities` (26 call sites narrow); a new
  `Command` field for placement (fire/ads/ability bits suffice); placement as a client-only
  ghost with a sim-side re-cast (two rules); per-ability sound tables keyed by id (unchecked,
  incomplete by construction); line of sight for every effect (breaks Bore Charge's design);
  removing `isAbilitySupported` (the compatibility table is still a real check).
