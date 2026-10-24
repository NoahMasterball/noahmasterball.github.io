# COUNTERWEIGHT — Game Design Spec

*Working title (kept as working identity; trademark check before any public release). Status:
M1 built (2026-09-30) — awaiting playtest sign-off; M2 ability framework and Relay built
(2026-09-30), the net-readiness spike pending — see [`PROJECT_STATE.md`](PROJECT_STATE.md).
Owner: lead design.*

> **Numbers policy.** This spec describes *what* the game is and *how* its systems work.
> Every balance number (health, speeds, damage, fire rates, cooldowns, budget weights) lives
> only in `src/data/`. The generated tables in [`generated/ROSTER.md`](generated/ROSTER.md)
> and [`generated/BALANCE.md`](generated/BALANCE.md) (`npm run docs:gen`) are the readable
> view of that data. Where this spec quotes a value that is *not yet implemented* (for
> example the round length in §3), it is marked **proposal** and moves into `src/config/` or
> `src/data/` when it is built — the spec then links instead of repeating it (Relay's phase
> timings did: §4.1).

---

## 1. Vision

Counterweight is an original, round-based, tactical first-person shooter for the browser.
Two teams of five **operators** fight over a small, dense facility. Every operator has a
distinct kit — weapons plus one or two abilities — and a distinct place on the
**speed ↔ power spectrum**:

```
  Anchor          Breacher / Support / Intel / Trapper          Speedster
  slow, armoured,  ─────────────── middle of the spectrum ───────  very fast, fragile,
  hits hard                                                        low damage or wide spread
```

The name is the thesis: every strength has a counterweight. An anchor wins the fight it is
standing in; a speedster wins by choosing which fight happens at all.

**Setting (original).** Near future. Decommissioned industrial sites — desalination plants,
freight depots, data vaults — are leased to licensed contractor crews who settle disputes in
sanctioned, refereed live-fire trials. This frames rounds, referees, sides and respawn rules
without glorifying war, and gives every map a plausible, readable layout. Operators are
contractors with civilian backgrounds (foremen, couriers, rangers, medics), not soldiers.

**Tone.** Grounded and tactile; bright, readable industrial colour-coding (safety yellow,
signal orange, teal team accents) rather than grimdark.

## 2. Design pillars

Use these to settle every design question, in this order when they conflict.

1. **Every strength costs something.** No operator is strictly better than another. Every
   advantage is paid for with a disadvantage the player can see and feel (slower, bigger
   hitbox, louder, less damage, longer reload). Enforced by the power budget (§9) and its
   unit test.
2. **Gunplay first.** Moving, aiming and shooting must feel good with abilities switched off.
   Abilities build on solid gunplay; they never compensate for bad gunplay. Feel
   requirements are in §11. Milestone M1 ships gunplay before the ability framework (M2).
3. **Readable at a glance.** Silhouette, sound and effect alone tell a player which operator
   they face and what an ability just did (§16). Anchors *look* and *sound* heavy.
4. **Data-driven by design.** A new operator, weapon or ability is mostly data. Adding content
   never requires changes to the core simulation. At most one new *effect type* per new
   ability (§7).

## 3. Core loop

- **Moment to moment (seconds):** move → gather information (sound, reveal effects, peeks) →
  take a fight on your terms → trade or disengage → reposition.
- **Round** (**proposal** ≈ 3 min): setup → engagement → objective pressure → resolution.
  No respawn.
- **Match (≈ 20–30 min):** pick an operator each round (counter-picking is part of the
  game), alternate attack/defence, first team to the win threshold.
- **Long term (out of scope now):** more operators and maps; no unlock progression is
  planned for the first playable version (§17).

## 4. Game modes and round structure

### 4.1 Relay (primary mode — built in M2, the default on page load; design in [ADR-0013](decisions/0013-relay-mode.md))

Attack/defence on a map with **two relay sites**.

| Phase | What happens | Duration |
| --- | --- | --- |
| Operator select | Both teams pick; an operator can be picked once per team. | `RELAY.preRoundSeconds` |
| Setup | Defenders place gadgets and fortify; attackers are held at their spawn edge and may use recon abilities only. | `RELAY.setupSeconds` |
| Engagement | Attackers must plant an *uplink* at one relay and keep it running. | `RELAY.engagementSeconds` |
| Uplink running | Once planted, the uplink needs uninterrupted time to finish; defenders win by disrupting it (interact). | `RELAY.uplinkSeconds` |

- **Attackers win** by eliminating all defenders or completing an uplink.
- **Defenders win** by eliminating all attackers, disrupting a planted uplink, or when the
  engagement timer expires without a plant.
- **Match:** first team to the round-win threshold; sides swap after a fixed number of rounds;
  one short of the threshold each, one overtime round with a coin-flip side. Built with the
  elimination mode in M1 (§4.3): the values live in `MATCH_FORMAT` (`src/config/sim.ts`).
- Every Relay timing and distance lives in `RELAY` (`src/config/sim.ts`); the phase timings
  are the starting values the user accepted on 2026-09-27.
- No economy and no buy phase: loadouts are fixed per operator. Balance happens through the
  roster, not through money.
- Spawn protection: see §13.

**As built in M2** (`src/sim/modes/relay.ts`; every rule and measurement in ADR-0013 §6 and
§12–§14):

- **Default mode.** A page load starts Relay on Saltworks (§13.1), the player and bots against
  bots as in elimination (§4.3) — user decision, 2026-09-30, once Relay's definition of done
  was met (`LAUNCH.defaultMode`, `src/config/client.ts`). Elimination and the range stay in the
  menu and at `?mode=elimination` / `?mode=range`. Mode, map, bot difficulty and seed can also
  be set in the URL (`?mode=&level=&tier=&seed=`).
- **Operator select.** The pickable operators are `PLAYABLE_OPERATORS`; a team may field the same
  operator at most `operatorPickLimit()` times — team size ÷ playable operators, rounded up — so
  "once per team" holds as soon as enough operators are playable (user decision, 2026-09-30).
  The player picks on the select screen (§14) or with the operator key; bots pick legal,
  seeded choices a moment after the phase starts (`AI.relay.pickDelaySeconds`), spread so that
  every operator stays open to the player. Nobody has to pick: everyone keeps their operator
  (round 1: the default roster), and a roster that breaks the limit is corrected when the
  phase ends.
- **Setup.** Attackers are frozen at their spawn edge: they look around and may use only recon
  abilities (every effect of the ability is of a kind in `RELAY.setupAttackerEffects`; derived,
  no data tag). Defenders move freely, but **setup walls** — level data, one per exterior
  opening of the building — keep every character inside or outside while setup runs; they
  block movement only (bullets, projectiles and sight pass) and drop when the engagement starts.
- **Uplink.** No carrier item: any living attacker standing on the ground inside a site plants
  by holding **interact** for `RELAY.plantSeconds`. A defender within `RELAY.disruptRadiusM` of a
  planted uplink disrupts it by holding interact for `RELAY.disruptSeconds`. While channelling
  a character only looks and crouches; releasing the key, dying or leaving the site (for a
  disrupt: the radius) cancels the channel and its progress; damage does not. One channel runs
  at a time.
- **Round results beyond the table above.** A plant still channelling when the engagement
  clock runs out does not count (defenders). After a plant, a wiped attacking side does not
  end the round — the defenders must still disrupt (user decision, 2026-09-30); a defender wipe
  or the uplink clock running out gives the round to the attackers.
- **Spawn edge.** The attackers' edge is drawn every round (`RELAY.attackZone`) and named on
  the select screen; choosing an edge (§13) is not built in M2 (ADR-0013 Q4).

### 4.2 Range (implemented in the prototype)

A practice mode on the greybox test range: switch operators freely, shoot dummies that respawn,
inspect stats in the debug overlay. It is also the automated test scene.

### 4.3 Elimination (M1 — built; design in [ADR-0011](decisions/0011-bots-and-elimination.md))

5v5 rounds without an objective — the player plus four bots against five bots — on Saltworks
(§13.1). The last side standing wins the round. It plays with **sides**; Relay (§4.1) shares
its round flow and adds phases and the uplink:

- **Sides.** One team attacks, the other defends; spawns belong to a side, not to a team
  (attackers at one of their spawn edges, defenders in their spawn inside the building).
- **Format = Relay's** (§4.1): same round-win target, side swap and overtime rule. A short
  pre-round freeze (look only, operator choice) opens every round; no respawn inside a round,
  everyone starts the next round at their side's spawn with a full kit.
- **Time runs out → the defending side wins** (user decision, 2026-09-27), as in Relay: the
  attackers have to force the result. Both sides wiped out in the same tick also goes to the
  defenders, so there are no draws.
- **After death (M1):** the camera stays at the death position (free look) and a round banner
  shows the state until the next round (Relay reuses both); spectating teammates is not built
  yet.
- It was the default mode on page load in M1 (user decision, 2026-09-27); since M2 Relay is
  (§4.1), and elimination is played from the menu or at `?mode=elimination`.
- Timings live in `ELIMINATION`, the format in `MATCH_FORMAT` and the team size in
  `MATCH.teamSize` (`src/config/sim.ts`).

## 5. Operator model

An operator is **data** (`OperatorDef` in `src/data/schema.ts`, instances in
`src/data/operators.ts`). Stats and their meaning:

| Stat | Unit | Meaning |
| --- | --- | --- |
| `maxHealth` | HP | Health at spawn. No regeneration by default. |
| `armour` | fraction 0–0.5 | Flat damage reduction applied to every hit after zone multipliers. |
| `hitboxProfile` | id | Which hitbox set the operator uses (§5.1). Bulkier = easier to hit. |
| `moveSpeed` | m/s | Top speed while running (not sprinting), standing, hip-fire. |
| `sprintMultiplier` | × | Top-speed multiplier while sprinting (forward only, cannot fire or ADS). |
| `acceleration` | m/s² | How quickly the operator reaches top speed and stops. Low = heavy, committed movement. |
| `crouchSpeed` | m/s | Top speed while fully crouched. |
| `jumpHeight` | m | Apex height of a standing jump. |
| `adsMovePenalty` | × | Speed multiplier while fully aimed down sights. |
| `abilitySlots` | count | Number of ability slots (1–2). Must match the ability list. |
| `abilities` | ids | Ability definitions, in slot order. |
| `loadout` | ids | `primary` options and `secondary` options (weapon ids). |
| `presentation` | — | Accent colour, silhouette note, footstep weight class, one-line bio. Never read by the simulation. |

Effective values at runtime are **operator stat × weapon modifier × active modifiers**
(§8). The simulation computes them in one place (`src/sim/stats.ts`).

### 5.1 Hitbox profiles

Hitboxes are separate colliders from the movement capsule: **head**, **torso** (chest +
pelvis) and **limbs** (arms, legs). Profiles (`src/data/hitboxes.ts`) are built from one
standard body scaled in width, so `slim`, `standard` and `heavy` share proportions. The
**exposure** of a profile (frontal area relative to `standard`) is *computed*, not typed in,
and feeds the survivability term of the power budget. Crouching compresses the layout
vertically by the stance ratio. In greybox builds the character visual *is* the hitbox set,
so what you see is exactly what you can hit.

## 6. Weapon model

A weapon is data (`WeaponDef`). All weapons in scope are **hitscan**; shotguns fire several
hitscan pellets.

| Stat | Unit | Meaning |
| --- | --- | --- |
| `class` | enum | `lmg`, `ar`, `br`, `carbine`, `smg`, `pdw`, `mp`, `shotgun`, `dmr`, `pistol`, `revolver`. Drives view model and sound family. |
| `fireMode` | enum | `auto` (hold) or `semi` (one shot per press). |
| `damage` | HP | Per-pellet body damage inside the falloff start range. |
| `falloff` | m, m, HP | `start`, `end`, `minDamage`: linear drop from `damage` at `start` to `minDamage` at `end`, flat after. |
| `pellets` | count | Rays per shot (1 for everything except shotguns). |
| `rpm` | rounds/min | Cyclic fire rate. Shot interval = 60 / rpm. |
| `magazine`, `reserveMagazines` | rounds, count | Magazine size; spare magazines at spawn. |
| `reloadTime` | s | Time from reload start until the magazine is refilled. |
| `hipSpread`, `adsSpread` | degrees | Cone half-angle of the first shot, standing still, hip / fully aimed. |
| `spreadPerShot` | degrees | Bloom added per shot. |
| `spreadMoving` | degrees | Extra spread at full move speed (scales linearly with speed). |
| `spreadRecovery` | degrees/s | How fast bloom decays when not firing. |
| `maxSpread` | degrees | Upper clamp for the total cone. |
| `recoil.pattern` | [pitch°, yaw°] per shot | Deterministic view kick per shot index; loops from `recoil.loopFrom`. |
| `recoil.recovery` | degrees/s | How fast the accumulated kick returns to zero when not firing. |
| `recoil.adsMultiplier` | × | Kick multiplier while fully aimed. |
| `recoil.resetTime` | s | Pause after which the pattern restarts at shot 0. |
| `adsTime` | s | Time from hip to fully aimed. |
| `adsFovMultiplier` | × | Camera FOV multiplier when fully aimed (zoom). |
| `headshotMultiplier`, `limbMultiplier` | × | Zone multipliers (torso is always 1). |
| `moveSpeedModifier` | × | Carry-weight speed multiplier while this weapon is in hand. |
| `maxRange` | m | Ray length. |

**Damage pipeline** (single implementation in `src/sim/combat/damage.ts`, shared by the
simulation and the balance tool):

```
per-pellet damage = falloff(distance) × zoneMultiplier(zone) × (1 − armour) × damageTaken modifiers
```

**Spread model** (`src/sim/combat/spread.ts`): cone = lerp(hip, ADS, adsProgress) + bloom +
spreadMoving × speedFraction + air penalty (global rule); crouching scales it (global rule);
modifiers scale it; clamped to `maxSpread`. Rays are sampled uniformly inside the cone with
the simulation's seeded RNG (deterministic, replayable, server-verifiable).

**Recoil model** (`src/sim/combat/recoil.ts`, ADR-0009): each shot adds the pattern entry to
a simulation-owned *aim offset* (pitch/yaw). The shot direction and the camera both use
`look angles + aim offset`. Players compensate by pulling against the pattern; after they stop
firing the offset recovers towards zero. The pattern is learnable because it is deterministic;
the random part of accuracy is the spread cone, which is visible in the dynamic crosshair.

**When a weapon can fire.** Only when it is *up*: not switching, not sprinting, past the
sprint-out time after a sprint (`GUNPLAY.sprintOutTime`) and not reloading — one rule,
`canFire` in `src/sim/stats.ts`, which the crosshair also shows. Ammo and the fire cadence
(`rpm`) are separate checks. **Trigger buffer:** a trigger press the weapon cannot answer yet
is not lost. It stays pending while the trigger is held and for `GUNPLAY.triggerBufferSeconds`
after release; the first tick the weapon is up answers it exactly once — a shot, or a dry fire
on an empty magazine. The buffer never beats the cadence (no shot comes earlier than `rpm`
allows, and one press never fires twice), so a click out of a sprint or at the end of a switch
fires as soon as it can, while a click early in a switch does not fire a surprise shot.

**Carried weapons and switching.** Every operator carries a primary and a secondary weapon
(the first option of each `loadout` list). Each keeps its own magazine and reserve while
holstered. A switch takes one global time for every weapon (`GUNPLAY.weaponSwapSeconds` in
`src/config/sim.ts`); while it runs:

- no firing, no ADS and no reload; a running reload is cancelled (the magazine stays as it
  was);
- the drawn weapon starts fresh: no bloom, recoil pattern at shot 0, ready to fire once the
  switch ends; the recoil aim offset eases back to rest over the switch, ADS eases out;
- sprinting is allowed;
- asking for the other weapon mid-switch reverses it from where it is (no full restart).

Controls: `1` primary, `2` secondary, mouse wheel the other weapon (bindings in
`src/config/client.ts`; the README controls table is generated from them).

## 7. Ability model

An ability = **one activation type + one resource model + one or more effects + tuning
values**. All of it is data (`AbilityDef` in `src/data/abilities.ts`).

**Activation types**

| Type | Behaviour |
| --- | --- |
| `instant` | Fires on button press. |
| `hold` | Channels while the button is held, up to `maxDuration`; effects repeat every tick while channelling, radii growing to full at `maxDuration`, amounts spread over it; weapon use blocked. The cooldown counts from the end. |
| `toggle` | Press to switch on, press again to switch off; optional `maxDuration` (`null` = no limit). A cooldown starts when the toggle is switched off. Weapons stay usable. |
| `placeable` | Press to show a placement ghost where the crosshair meets a level surface within `placeRange` (`surface`: floor, wall or any); fire confirms and spends, ADS, the key again or a weapon switch cancels; weapon use blocked while placing. Deploys a gadget entity with `gadgetHealth` and a `trigger` (below); with `maxActive` gadgets in the world a new placement is refused. |
| `thrown` | Throws at once along the crosshair: a ballistic projectile (`speed`, `gravityScale`, `fuse` in seconds or `null`). Without a fuse it bursts on impact; with one it lands, rests on a floor and bursts when the fuse ends (mid-air too). The burst applies the effects there. |
| `passive` | Always on from spawn; effects have unlimited duration. |

**Resource models**

| Model | Rules |
| --- | --- |
| `cooldown` | One use, then unusable for `cooldown` seconds. |
| `charges` | Up to `maxCharges`; one charge recharges every `rechargeTime` seconds, one at a time, while below max. |
| `uses` | `usesPerRound` total, restored only at round start. |
| `none` | Nothing to spend. Only for `passive` abilities — and every passive uses it (checked by the content validator). |

The resource model is a pure state machine (`src/sim/abilities/resource.ts`) with unit tests.

**Effects** (the extensible part — a new ability adds at most one of these):

| Effect | Tuning | Examples |
| --- | --- | --- |
| `damage` | amount, radius | breaching charge |
| `heal` | amount, radius, targets | heal dart |
| `shield` | amount (temporary HP), duration, radius, targets | overshield |
| `barrier` | width, height (its health is the `gadgetHealth` of the placeable activation) | deployable cover |
| `modifier` | stat multipliers, duration, radius, targets | speed buff/debuff, brace, recoil control |
| `dash` | distance, duration, direction (`move`, `look`, `up`) | dash, vault boost |
| `reveal` | radius, duration | scan pulse, sensor node |
| `areaDenial` | radius, duration, damage per second, stat multipliers | fire zone, slow field |
| `disableGadgets` | radius, duration | gadget-frying lance |

Targets are expressed relative to the user: `self`, `allies`, `enemies`, `all`, with an
optional radius around the effect origin (the user's feet, the gadget, the projectile's burst
point or the area). A radius reaches a character's body (feet to head), not only its centre.
`damage` and `areaDenial` always hit enemies — teammates and the user too only with
`GUNPLAY.friendlyFire`, the one friendly-fire rule for bullets and abilities; `reveal` reveals
enemies to the user's team; `disableGadgets` hits enemy gadgets. Only `areaDenial` needs a line
of sight from its origin (fire does not burn through walls; the table is
`ABILITY_RULES.lineOfSight` in `src/config/sim.ts`).

**Gadgets, projectiles and areas** are simulation entities. A gadget acts by its `trigger`
(`GadgetTriggerDef`, `src/data/schema.ts`): `none` — a barrier, the gadget itself is the
effect (it blocks movement, bullets, projectiles and sight); `aura` — its effects every tick
once armed; `proximity` — once, when an enemy's body comes within the trigger radius; `timer` —
once, a delay after placement. Teammates never trigger. Other gadgets (devices) stop bullets but not
movement or sight. Bullets damage enemy gadgets (falloff damage only); at 0 health a gadget is
destroyed. `disableGadgets` pauses enemy gadgets (a barrier keeps blocking). An `areaDenial`
effect leaves an area on the ground below its origin that damages and modifies hostile
characters inside for its duration. Gadgets outlive their owner; a round reset removes every
gadget, projectile and area, an operator change the changer's gadgets. Global rules (arming,
sizes, flight limit, drops) live in `ABILITY_RULES` (`src/config/sim.ts`); the design record is
[ADR-0012](decisions/0012-ability-framework.md).

**Implementation status (M2, 2026-09-30).** Every activation type, resource model and effect
above runs in the simulation. `isAbilitySupported()` (`src/sim/systems/abilities.ts`) is true for
every ability in `src/data/abilities.ts` (`tests/unit/content.test.ts`), and
`tests/unit/roster.test.ts` runs each one end to end through commands. The function stays as
the activation × effect compatibility check (ADR-0012 §3.4): a new combination needs its
semantics written there first; until then the content test fails and bots skip the ability.

**Playable operators.** Matches and bot rosters keep the M1 operators (`PLAYABLE_OPERATORS` in
`src/config/sim.ts`) until M4; the range lets the player switch through every operator in
`src/data/operators.ts` (`RANGE_MODE.allOperators`), so every ability can be tried. No
activation or effect kind is deferred any more — Heron's Sonar Pulse, held back in M1 (user
decision, 2026-09-27), works.

## 8. Modifiable stats and stacking

Modifiers multiply a small, closed set of stats: `moveSpeed`, `damageTaken`, `spread`,
`recoil`, `footstepVolume`. Rules: every modifier is multiplicative; multiple modifiers from
**different** sources stack by multiplication; a re-applied modifier from the **same** ability
refreshes its duration instead of stacking. The closed set is intentional: a new stat is a
core change and needs an ADR.

- **Sustained sources** (hold, toggle, aura gadgets, areas) re-apply their modifier every tick
  they act; it lapses `ABILITY_RULES.sustainSeconds` after the last application (so a slow ends
  right after leaving an area).
- **Overlapping areas of one ability** each deal their damage, but their modifier counts once
  (same source).
- **Shields** are temporary HP, not modifiers: one source refreshes (the larger amount, the
  longer time), different sources add up. They absorb damage after armour and `damageTaken`,
  the soonest-expiring first; the rest hits health.

## 9. Balance model

### 9.1 Power budget

Every operator spends the same **power budget** across four categories. Each category is
measured relative to a reference operator/weapon defined in `src/data/budget.ts`, so a value
of 0 means "exactly average".

| Category | Measured from | Idea |
| --- | --- | --- |
| Survivability | effective HP = maxHealth / (1 − armour) / hitbox exposure | how much punishment it takes to kill |
| Mobility | moveSpeed × the primary weapon's `moveSpeedModifier`, sprintMultiplier, acceleration, jumpHeight, adsMovePenalty | how fast it takes and leaves fights |
| Firepower | *expected* TTK of the primary weapon against the reference target at the reference ranges, including a hit-probability term from spread | how fast it wins a fair duel |
| Utility | the sum of the `budgetCost` declared on each ability | what the kit adds beyond stats |

Survivability, mobility and firepower are converted into budget points with weights from
`src/data/budget.ts`; utility has no weight — it is the sum of the abilities' `budgetCost`.
The **total must land inside the target band** declared there; `tests/unit/content.test.ts`
fails the build if any operator leaves it. Speedsters and anchors pay for their extremes in
opposite currencies: an anchor buys survivability and firepower with mobility; a speedster
buys mobility with survivability and firepower.

The budget is a *guard rail*, not the whole truth: utility costs are human judgements and the
hit-probability term is a heuristic. Playtests override the model; when they do, the model's
weights are corrected so that it predicts the playtest result next time.

### 9.2 Time-to-kill matrix

`npm run balance` prints, for **every weapon × every operator**, the time-to-kill for body
shots and head shots at the reference ranges, plus each operator's budget breakdown. The same
output is written to [`generated/BALANCE.md`](generated/BALANCE.md) by `npm run docs:gen`.
Balance discussions quote that output, never hand-copied numbers.

Target lethality (user decision, 2026-09-27): keep the current fast, tactical TTK band —
positioning and information decide fights; revisit only with M1 playtest evidence.

TTK assumptions: every shot hits the stated zone; the attacker starts with a full magazine and
reloads when empty (reload time is added); no regeneration; shotguns land all pellets.

### 9.3 Balance workflow

1. Change numbers only in `src/data/`.
2. `npm run balance` → read the budget table and TTK matrix.
3. `npm test` → the budget band, data validation and generated-docs checks must pass.
4. `npm run docs:gen` to refresh the generated tables.
5. Playtest; write the finding into `docs/PROJECT_STATE.md`.

## 10. Archetypes and example roster

Full stats for every operator, weapon and ability are generated from data into
[`generated/ROSTER.md`](generated/ROSTER.md). This section defines identity and intent.

### 10.1 Archetypes

| Archetype | Role | Pays with | Countered by |
| --- | --- | --- | --- |
| **Anchor** | Holds a space; wins frontal duels; slow, tanky, high damage. | Mobility, larger hitbox, loud footsteps. | Flanks, area denial, utility that forces movement. |
| **Speedster / Flanker** | Chooses fights, takes off-angles, punishes rotations. | Health, damage or accuracy at range. | Trappers, intel reveals, holding tight angles. |
| **Breacher** | Opens paths and removes defensive gadgets. | Average stats, limited uses; noisy tools. | Intel (sees the breach coming), anchors holding the new opening. |
| **Intel** | Reveals enemy positions; enables team decisions. | Low direct firepower or low mobility. | Gadget disable, speedsters who kill sensors. |
| **Support** | Heals, shields, builds cover. | Lower firepower; value depends on teammates. | Burst damage, flanks on the support position. |
| **Trapper** | Controls space with slows, damage zones and alarms. | Setup time; weak when caught in the open. | Breachers, gadget disable, intel. |

### 10.2 Roster

Callsigns and themes are original. Playable in matches: Basalt, Wisp, Kestrel and Heron — the
list is `PLAYABLE_OPERATORS` (`src/config/sim.ts`); the range offers every operator below (§7).

**Anchors**

- **Basalt** — *former demolition-site foreman; composite plating over a work harness.*
  Heavy LMG; ability **Brace** (instant, cooldown): plants his feet — takes less damage and
  kicks less, but moves much slower while braced. Silhouette: broad plated pauldrons.
- **Keel** — *ex-harbour boarding inspector.* Pump shotgun or battle rifle; **Breakwater**
  (placeable, uses per round): deploys a waist-high barrier with its own health. Anchors a
  doorway rather than a sightline.
- **Cairn** — *mountain-rescue rigger.* Battle rifle; **Set Piton** (toggle): locks into a
  mounted stance — cannot move, much less recoil and damage taken while mounted. The
  strongest angle-holder, the easiest to flank.

**Speedsters / Flankers**

- **Wisp** — *parkour courier.* SMG; **Slipstream** (instant, charges): a short, fast
  horizontal dash in the move direction. Fragile; wins by angle and timing.
- **Kestrel** — *drone-racing pilot.* PDW; **Updraft** (instant, cooldown): vertical boost
  onto ledges; **Lightfoot** (passive): quieter footsteps. Owns verticality.
- **Mayfly** — *track sprinter turned courier-runner.* Machine pistol; **Overclock**
  (instant, uses per round): a burst of extra speed with a wider spread. The fastest and most
  fragile operator — a glass cannon at knife range, useless at range.

**Breachers**

- **Auger** — *tunnel-boring engineer.* Assault rifle; **Bore Charge** (placeable, uses):
  a drilling charge that damages anything behind the surface it is planted on (opens
  surfaces once destruction lands in M5).
- **Kiln** — *foundry pour-master.* Carbine; **Slag Lance** (thrown, charges): a molten
  canister that disables gadgets in a small radius and leaves a short burning patch.

**Intel**

- **Lattice** — *network field technician.* Carbine; **Tripline Nodes** (placeable,
  uses): sensors that reveal enemies passing within their radius.
- **Heron** — *wetland ranger and marksman.* DMR; **Sonar Pulse** (hold, cooldown): channel
  to emit a growing reveal ring; cannot shoot while channelling.

**Support**

- **Salve** — *paramedic.* Assault rifle; **Mend Dart** (thrown, charges): heals an ally or
  self on impact.
- **Bracket** — *scaffolding engineer.* Battle rifle; **Scaffold Screen** (placeable, uses):
  deployable barrier; **Overbrace** (instant, cooldown): temporary shield for allies nearby.

**Trappers**

- **Thistle** — *invasive-species botanist.* Pump shotgun; **Burr Mines** (placeable,
  uses): slow field plus reveal when an enemy walks in.
- **Gorse** — *wildfire crew chief.* Assault rifle; **Firebreak** (thrown, cooldown): a
  canister that creates a burning area-denial zone.

## 11. Movement and gunplay feel requirements

These are acceptance criteria for M1 (see ROADMAP).

- **Input.** Pointer lock with raw input (`unadjustedMovement`) where the browser supports it;
  automatic fallback to standard pointer lock otherwise. Mouse look is applied every rendered
  frame (never quantised to the tick). Keys use physical key codes (layout-independent).
- **Settings.** Horizontal FOV, mouse sensitivity, ADS sensitivity multiplier, volume (plus
  raw input, damage numbers and the bot difficulty); persisted locally; ranges and defaults
  defined once in `SETTINGS_SCHEMA` (`src/config/client.ts`).
- **Movement.** Acceleration-based ground movement with operator-specific acceleration;
  reduced air control; jump; crouch with a smooth stance transition and head-room check;
  sprint forward only; ADS and firing cancel sprint, and a pending trigger press keeps it from
  starting. A sprint only *starts* on the ground; one started there carries on through a jump
  or a fall.
- **Collision.** Walking into a wall stops you or slides you along it; no speed builds up
  against it. Small steps are climbed automatically and slopes up to a limit are walkable —
  climbing costs distance, not speed. Standing or walking on walkable ground, stairs included,
  never drifts, hops or stalls, and the feet rest exactly on the floor. A dash covers exactly
  its distance and ends without upward speed, so an upward dash peaks where it ends.
- **Trigger.** A press is never lost and never beats the cadence: a click the weapon cannot
  answer yet (switch, sprint-out, reload) fires on the first tick it can, if the trigger is
  still held or was released within `GUNPLAY.triggerBufferSeconds`. Rules in §6.
- **Recoil.** Deterministic, learnable pattern per weapon; visible camera kick; recovery after
  release; ADS reduces kick.
- **Spread.** First-shot accuracy when standing still and aimed; bloom while spraying; moving
  and jumping widen the cone. The crosshair gap shows the current cone exactly.
- **Weapon switching.** Primary ↔ secondary with keys or the wheel; the view model lowers the
  old weapon and raises the new one within the one global switch time
  (`GUNPLAY.weaponSwapSeconds`); nothing of the old weapon's state (reload, bloom, pattern,
  cadence) carries over, the camera never jumps, and switching back mid-way reverses smoothly.
  Rules in §6.
- **Hit feedback.** Hit marker on every confirmed hit (distinct head and kill variants),
  damage numbers, target health bars (range mode), impact marks on surfaces, distinct audio
  confirmation for body, head and kill.
- **View model.** Weapon model with look-lag sway, movement bob, recoil kick-back, ADS moves it
  to the sight line; rendered in its own pass so it never clips into walls. Bob (one dip per
  footstep), sway return and landing dip follow the operator's weight class, so heavy
  operators feel heavy in hand; the sprint pose is back up exactly when the weapon may fire
  again. Tuning in `VIEWMODEL` (`src/config/client.ts`).
- **Timing.** Simulation at a fixed tick (`SIM.tickRate`) with render interpolation; no
  visible stutter at render rates above or below the tick rate.
- **Operator identity in hand.** Switching from anchor to speedster must be obvious within
  one second of movement and one magazine of shooting.

## 12. Bot behaviour (built in M1; ability use in M2)

Bots are ordinary operators whose commands come from a brain instead of the keyboard
(`src/ai/`). They use exactly the same weapons, spread, recoil and movement rules — no aim
assistance inside the simulation, no wall-hacks.

- **Perception:** vision cone with line-of-sight raycasts; hearing gunfire and footsteps within
  a radius scaled by the source's footstep volume; information shared with teammates after a
  short delay (callouts).
- **Decisions:** a small state machine per bot — *hold angle*, *patrol*, *investigate sound*,
  *engage*, *reposition after a kill or after taking damage*, *retreat when low*, *use
  ability* (each ability declares a simple bot-usage hint in data).
- **Aim model:** reaction time before the first shot; aim error that shrinks while tracking
  a visible target and grows when the target changes direction; recoil compensation as a
  skill parameter. Difficulty tiers change these parameters only.
- **Navigation:** a waypoint graph authored in the level data for M1 (a navmesh is a later
  option); cover points tagged in level data.
- **Prototype dummies:** static and strafing dummies driven by the same command pipeline.

**As built in M1.** Everything above except *use ability* (M2) is built in `src/ai/`: bots
decide on the same state a player sees, one tick late like the player's own input, and send
ordinary commands. One difficulty tier plays for every bot (the menu's bot-difficulty setting,
or `?tier=`); tier values live in `AI.tiers`, all other bot tuning in `AI`
(`src/config/sim.ts`). Walls muffle what bots hear (`AI.hearing.occludedRangeFactor`), and
characters never block sight. Where the
build deviates from the design, the real APIs and the measured tier results are recorded in
[ADR-0011](decisions/0011-bots-and-elimination.md) §10.

**As built in M2 (abilities).** Every ability declares when bots use it (`AbilityDef.bot`:
`engage`, `escape`, `hold`, `scout`, `support`, `flush` or `never`; the generated
[`ROSTER.md`](generated/ROSTER.md) lists them). `src/ai/abilities.ts` recognises the situation
and presses the same keys a player does, and only when the sim would accept it (the mode allows
the ability, the resource is ready, `maxActive` is not reached): placements aim at a valid
placement before confirming, throws aim with the sim's ballistic arc, channels hold the key.
A reveal gives every bot of the revealing team an exact contact; bots hear enemy abilities as
far as players do (`AI.hearing.abilityRadiusM`). Bots react to areas only through their
damage (they take cover) and do not place a barrier that would block their own sight at a
post. Tuning in `AI.abilities`; details and measurements in
[ADR-0012](decisions/0012-ability-framework.md) §10 and §17.

**As built in M2 (Relay).** Bots pick operators in operator select (§4.1) and play the objective
(`src/ai/objective.ts`): attackers stand frozen through setup (no recon abilities yet), then
push a seeded target site, the first bot on it without an enemy in sight plants and the others
guard the site's nodes; after the plant they guard the uplink. Defenders hold posts at both
sites through setup and the engagement, rotate to a site once the team has evidence — a heard
plant start or an enemy seen inside a site — and after a plant converge on the uplink, where
the nearest free defender disrupts while the rest guard. A visible enemy still means a fight,
except for a bot about to finish its own channel. Tuning in `AI.relay`; duties, deviations and
bot-only measurements in [ADR-0013](decisions/0013-relay-mode.md) §13.

## 13. Map design principles

- **Size and density:** compact (roughly 60 × 80 m footprint), two floors plus exterior
  approaches. Any site reachable from the attacker edge in about 20 s by an average operator.
- **Sightlines:** no sightline longer than ~40 m inside the building; long exterior lanes
  exist only on approaches. Every long sightline has a flank that breaks it.
- **Flanks:** every relay site has at least three entrances, one of them vertical or
  unexpected. Flank routes are longer but covered.
- **Verticality:** ladders/stairs, catwalks, holes from above; vertical play favours
  speedsters (Kestrel) and trappers who cover it.
- **Readable surfaces:** material classes (hard cover, soft cover, walkable, breachable later)
  have distinct colours and sounds; greybox uses dev textures with a 1 m grid.
- **Spawn protection:** attackers choose between 2–3 spawn edges; no spawn has direct line of
  sight to a defender-held window or door; defenders cannot leave the building during setup;
  hard boundaries stop defenders from reaching attacker spawns ("spawn peeking" is designed
  out, not punished). As built (M2): the edge is drawn per round, not chosen (§4.1); the
  building boundary in setup is the level's setup walls (`LevelDef.setupWalls`), which Relay
  requires of every map it runs on.
- **Fairness:** both sides' routes are symmetric in time-to-contact, not in shape.

### 13.1 Map #1: Saltworks (`saltworks`, greybox)

A decommissioned salt works. Geometry, spawns and sites are data in
`src/data/levels/saltworks.ts` — the only source of coordinates (its header has a plan sketch);
the bots' waypoint graph sits next to it in `saltworks.nav.ts` and derives its stair, ramp and
drop ends from the same layout anchors.

- **Layout.** A two-storey building fills the north edge of the map; attackers approach it
  from the south across an open courtyard broken up by a pump house, containers, low walls and
  crates, or along a west and an east alley beside the building. Inside: the tank hall and an
  office in the west, the lobby with a two-storey atrium and gallery in the middle, storage
  with the control room above it in the east, and a service corridor along the north wall
  (east of the hall) on both floors.
- **Sites.** **A — Tank Hall** on the ground floor: a double-height hall, entered from
  the west alley, the office, the lobby and the service corridor, and from above by the
  catwalk. **B — Control Room** on the upper floor: entered from the gallery, the upper service
  corridor and an outside landing in the east alley; a window overlooks the courtyard.
- **Spawns.** Attackers use one of two edges on the south side, **West Gate** and **East
  Lot**, each behind a shield wall that blocks sight from the building. Defenders spawn in the
  **Service Corridor** inside the building. Every zone has one point per player of a team.
- **Vertical routes.** Three staircases — lobby stairs (atrium → gallery), service stairs
  (corridor → upper corridor) and hall stairs (tank hall → catwalk) — plus the east ramp from
  the alley to the control-room landing, and a one-way drop from the catwalk into site A.
- **Setup walls (Relay).** Every exterior opening of the building — the office door, the main
  door and site B's courtyard window in the south facade, the hall door in the west, the
  storage door and the landing door in the east — has a setup wall, derived from the same
  facade data that leaves the opening in the wall. They stand only during Relay's setup, drawn
  translucent (`SETUP_WALL_STYLE`, `src/config/client.ts`).

## 14. HUD

Minimal and readable; every element earns its place.

- Centre: dynamic crosshair (gap = current spread; it fades while the weapon cannot fire),
  hit markers, ADS sight dot.
- Bottom left: operator name and accent colour, health bar, armour value, active modifiers;
  shields as "+N" next to the health and an extra segment on the bar; a short "+N" after a heal.
- Bottom right: ammo (magazine / reserve), fire mode, reload or switch progress, and a compact
  line for the holstered weapon (its key, name and magazine / reserve).
- Bottom centre: ability slots with key hint, state (ready, recharging, empty, active, placing,
  passive), charges / cooldown / uses left with a readiness sweep, the progress of a channel or
  timed toggle and "n/max placed" for gadgets; greyed while the mode does not allow the
  ability. A refused press shows why (not ready, all placed, cannot place here).
- Under the crosshair (abilities): a channel bar while channelling; while placing, the hint
  (fire key = place, ADS key = cancel) and why the current spot is invalid. A "REVEALED" warning
  while the player is revealed to the enemy.
- **Top centre — round HUD** (elimination §4.3, Relay §4.1): score of both teams, round number
  (and overtime), each team's side this round, the phase clock (pre-round countdown, round clock
  that turns urgent near the end, countdown to the next round or the match end) and one alive
  marker per team member. Round banners: round start (the team's task, a side-swap notice,
  the operator-change key), eliminated (who got you, how many teammates are still fighting),
  round won or lost with the reason (elimination, time, both sides wiped; Relay: uplink
  completed, uplink disrupted), and the match result. Relay captions the clock per phase
  (operator select, setup, engagement, "Uplink" with the site) and shows short banners when
  setup starts and when the uplink is planted.
- **Relay — operator select screen** (M2): a select phase frees the mouse and shows, instead of
  the menu, one card per pickable operator generated from its data (name, archetype, accent
  colour, core stats, both weapons, abilities with the ones usable in setup marked, bio), how
  many teammates play each against the pick limit, and whether a pick is allowed now (a
  refused card is disabled); the round, the side's task, the attackers' spawn edge and the
  countdown in its header; the team's operators below. A click or number key picks, a ready
  key keeps the operator; both return to the game. With the mouse captured, a compact strip
  names the operator-change key and how to reopen the screen. A page load in Relay opens on it.
- **Relay — objective HUD** (M2): under the round HUD a line with the own side and its task
  (an attacker's setup line names which of the player's abilities setup allows; a teammate's
  running plant or disrupt replaces the task), and once planted the uplink's site, a bar and the time left in the own or enemy
  colour. Under the crosshair the prompt "[interact key] Hold to plant / disrupt the uplink"
  where the rules allow it, or the player's own channel with its progress. Site markers (letter,
  name, distance) through walls during setup, engagement and uplink, hidden while the player
  stands in that site; after the plant a marker over the uplink replaces its site's.
- **Top right — kill feed:** the latest kills (killer, weapon or ability, victim, headshot
  mark), newest at the bottom, fading after a few seconds; names in team colours — you, allies,
  enemies.
- **Around the crosshair — damage-direction indicator:** an arc on a ring that points to where
  a hit came from (the shooter's position when firing, not where they stand now), held
  briefly and then fading; a few arcs at most.
- **After death** (elimination, M1): the **death camera** stays at the eye of the death
  position with free look; crosshair, weapon and the bottom panels are hidden, the round HUD
  shows the "eliminated" banner and the kill feed keeps running until the next round.
- Team colours (ally / enemy, as the local player sees them) have one source and are shared by
  the round HUD, the kill feed and the characters' torso bands (§16).
- Reveal markers over enemies revealed to your team, visible through walls, in the enemy colour,
  fading out with the reveal.
- Debug overlay (toggle): FPS, tick rate, simulation tick, the launch (mode, map, seed, bot
  difficulty) and match state, player kinematics, raw operator and weapon data plus effective
  top speed and current spread; with it, the bot waypoint graph is drawn in the world.
- Range mode: floating health bars and damage numbers over dummies.
- Layout values, texts and timings: `HUD` in `src/config/client.ts` (abilities: `HUD.abilities`,
  `HUD.reveal`; Relay: `HUD.relay`).

## 15. Audio

- Gunshots per weapon class, positional, with distance-based tail; your own weapon louder and
  drier.
- Footsteps per weight class (light/medium/heavy) — anchors are audibly heavy; footstep
  volume is a modifiable stat.
- Hit confirmation sounds: body, head, kill (distinct and short).
- Ability signatures: every ability has a unique activation sound audible to both teams.
- UI: reload, dry-fire, ability ready, round start/end stingers.
- The prototype synthesises simple placeholder sounds with Web Audio; recorded or CC0 sounds
  arrive with the art pass (M3).

**As built in M1.**

- **Positional audio.** Every world sound — other characters' gunshots and footsteps, bullet
  impacts — is placed at its source and heard from the camera (HRTF panning: left/right plus
  front/back and above/below cues on headphones). Loudness falls off with distance and fades
  to silence at the sound's reach; far sounds also get duller and ring longer (the distance
  tail). Your own shots and steps play centred and dry. A cap on simultaneous world sounds
  keeps the mix clear: a new sound replaces the quietest one playing, or is skipped if every
  playing sound is louder. Walls do not muffle sound in M1.
- **One hearing rule for players and bots.** A gunshot carries as far as bots hear gunfire; a
  footstep as far as bots hear footsteps, scaled by that step's loudness. Reach values in
  `AUDIO.spatial` (`src/config/client.ts`) point at the bots' `AI.hearing` radii.
- **Footsteps.** The simulation owns them: one step per stride of grounded travel, so the
  cadence follows the speed (sprinting is faster, crouch-walking slower); loudness grows when
  sprinting, drops when crouch-walking (quiet, not silent) and follows `footstepVolume`
  modifiers (Kestrel's Lightfoot). The walker's weight class picks the sound; your own steps
  are quieter. No steps in the air. Values: `MOVEMENT.footsteps` (`src/config/sim.ts`),
  `AUDIO.footstep` (`src/config/client.ts`).
- Round stingers mark the end of the pre-round freeze and a round won or lost.

**As built in M2 (abilities).**

- **Signatures.** Every activation plays the ability's own signature: a waveform per activation
  kind at a tone derived from the ability's place among the abilities of that kind
  (`AUDIO.ability.signature`), so every ability sounds different without a per-ability sound
  list. Your own plays dry; everyone else's is positional and carries as far as bots hear
  abilities (`AUDIO.spatial.reach.ability` = `AI.hearing.abilityRadiusM`).
- **Cues.** Positional cues for a gadget placed or destroyed, a burst, a heal, a shield gained
  or broken and an ability ending; a ping when a reveal starts on you or for your team; a
  positional loop for every area while it lasts (a world voice under the cap). A refused
  ability press plays the dry-fire click. Values in `AUDIO.ability`.

**As built in M2 (Relay).** A plant or disrupt that starts or is cancelled plays a cue at the
channeller — your own dry, everyone else's positional and as far as bots hear a plant start
(`AUDIO.spatial.reach.uplink` = `AI.hearing.uplinkRadiusM`). Everyone hears a stinger when setup
starts, when the uplink is planted and when it is disrupted. Values in `AUDIO.uplink` and
`AUDIO.ui`.

## 16. Readability rules

- **Silhouette:** width follows the hitbox profile (slim/standard/heavy); every operator has
  one unique silhouette feature (backpack, pauldron, antenna).
- **Colour:** team colour on the torso band; operator accent colour on gear; ability effects
  use the owning team's colour.
- **Sound:** see §15. Every ability is identifiable with eyes closed.
- **Effects:** area effects show their exact radius on the ground.
- **Gadgets and areas** (as built in M2, ADR-0012 Q3): everyone sees every gadget body
  (barriers at their exact size, devices), every projectile and every area (disc and ring at the
  exact data radius), in the owning team's colour as the viewer sees it (`TEAM_STYLE`); a
  disabled gadget is greyed. Trigger and aura radius rings are shown only to the owner's team
  (an enemy trap is visible, its reach is not). A channel ring grows around the channeller for
  everyone; shielded characters wear a translucent shell; the placement ghost shows the gadget
  and its radii in a valid or invalid colour. Heals have no world visual (HUD and sound). Looks
  in `ABILITY_VISUALS` (`src/config/client.ts`).

## 17. Out of scope

Not in the first playable version and not implemented until their roadmap milestone:

- online multiplayer (M6), matchmaking, lobbies, accounts, cloud saves;
- progression, unlocks, cosmetics, monetisation;
- anti-cheat;
- destructible environments (M5);
- more than one map before M4;
- the full ability roster before M2;
- art pass, final audio, animation (M3);
- gamepad support, mobile/touch support;
- spectator mode, replays (the deterministic simulation keeps replays possible later).
