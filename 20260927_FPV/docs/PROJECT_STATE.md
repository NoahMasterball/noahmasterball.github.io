# Project state and handover log

Newest entry first. Each entry: what changed, how it was verified, what is next.

---

## 2026-09-30 (later) — M2: ability framework + Relay (R1–R3) built; web publishing set up

**Status:** the M1 playtest (human DoD items) is still open — the user asked to continue building,
so M2 started. The ability framework (ADR-0012, accepted) is complete: all 16 abilities run end
to end, bots use them. **Relay (ADR-0013) R1–R3 is built**: phases, operator select, setup
walls, uplink plant/disrupt, bots on the objective, objective HUD (as-built notes ADR-0013
§12–§14). R4 (make Relay the default, SPEC/ARCHITECTURE for Relay) and the net-readiness spike
(ADR-0014, proposed) are next.

### Relay (R1–R3) and publishing — added after the checkpoint below

- **R1:** `modes/relay.ts` + shared `modes/rounds.ts` (elimination bit-identical: same seeds →
  same end tick and score), `RELAY` timings in `src/config/sim.ts`, `BUTTON.interact`, setup
  walls (level data, movement-only layer, 6 on Saltworks), pick limit
  `operatorPickLimit()` = ceil(team size ÷ playable operators), seeded bot picks
  (`ai/picks.ts`, `BotController.controls`), `?mode=relay`, `__qa.advanceTicks(n)`.
  `RANGE_MODE.playableOperators` removed (SSOT `PLAYABLE_OPERATORS`).
- **R2:** `ai/objective.ts` — attackers push a seeded site, plant, guard; defenders hold both
  sites, rotate on alarm, disrupt. Relay bot-only (medium, seeds 1–20, 116 rounds): plants in
  69.8 % of rounds, attackers win 53.4 % (51 by elimination after a plant, 2 by uplink, 9 by
  elimination without plant), defenders win 26 by elimination + 28 by disrupt, 0 timeouts,
  median round 41.5 s, controller 0.053 ms/tick avg. Elimination (seeds 1–10) unchanged:
  attackers 64.1 %, median 66.0 s.
- **R3:** operator select screen (cards from data, pick pips, countdown), objective HUD (phase +
  timer, side badge + task, site markers through walls, uplink bar, plant/disrupt prompt with the
  bound key), setup-wall opacity 0.55; e2e `relay.spec.ts`; shots iter17 reviewed (coordinator
  looked at `relay_select` and `relay_live` too).
- **Publishing (user request 2026-09-30):** `npm run deploy` = `check` + `tools/publish.ts`
  (copies `dist/` → `play/`). Deploy facts (`DIST_DIR`, `PUBLISH_DIR`, `SUB_PATH`, `PAGES_URL`)
  in `tools/lib/deploy.ts`, used by Vite (`outDir`, `optimizeDeps.entries`), ESLint ignores,
  `serve-dist`, Playwright, e2e (`support/page.ts` checks `SUB_PATH`). Public URL:
  https://noahmasterball.github.io/20260927_FPV/play/ — only `play/` gets committed + pushed.
- **E2E flake fixed:** the range smoke test held the trigger for one *waited frame*; at headless
  ~5 fps that is several ticks, so the auto LMG fired twice and "hits on head" expected 1.
  `aimedShot` now presses for exactly one tick via `api.advanceTicks(1)` (3/3 reruns green).
- **Published:** `npm run deploy` fully green (lint, typecheck, Vitest 424/424, e2e 4/4), commit
  `f5da71b` on `main` contains only `20260927_FPV/play/` (5 files, 5.0 MB). Note: for a few
  minutes the machine could not start any process (Bash/PowerShell/ripgrep exit 107/66 without
  output, even `echo`); it recovered by itself.

### What changed

- **Bot hearing occlusion** (known M1 issue): a sound whose straight line to the listener is
  blocked by static geometry carries `AI.hearing.occludedRangeFactor` × its range, with
  `occludedPositionErrorM` noise. Attacker win % was already ≈ 56 % on current code (the 72 %
  was an old figure); unchanged within noise.
- **ADR-0012 ability framework**, built in waves (F → H/G/P/E/V/U → B/R, plus cleanup K and a
  fix batch; as-built notes in ADR-0012 §16–§17): activations `hold`, `toggle`, `placeable`,
  `thrown`; effects `damage`, `heal`, `shield`, `barrier`, `reveal`, `areaDenial`,
  `disableGadgets`; gadgets/projectiles/areas as plain state with one id counter; barriers
  block movement, bullets and sight; mode ability gate (`matchAbilityAllowed`) ready for Relay;
  placement ghost, world visuals at exact radii, HUD slot states, reveal markers, ability audio;
  range offers all 14 operators (`RANGE_MODE.allOperators`), matches keep `PLAYABLE_OPERATORS`.
- **Bots use abilities** via per-ability `bot` usage hints (`src/ai/abilities.ts`); reveals
  become team intel. Kestrel's Updraft hint changed `never` → `escape` (coordinator).
- **SSOT cleanup:** one duration rule `isTimeUp()`; `characterById`/`ownerOf`;
  `FLOOR_MIN_NORMAL_Y`; `commandLook`/`clampPitch`; test helpers consolidated; ability audio
  signatures distinct per activation kind.
- **Defects fixed:** effect durations depended on entity id (expiry now runs for everyone
  first); −0 angles in state (broke JSON round-trip of recordings); **fire cadence — the first
  shot interval after idle was one tick short (faster than `rpm`)**, now matches the balance TTK
  within half a tick; thrown fuse one tick short.
- Docs: ADR-0012 accepted (+§16–§17), ADR-0013/0014 proposed, ADR index, SPEC §7/§8/§10.2/§12/
  §14–§16, ARCHITECTURE, ROADMAP (M2 DoD status), CLAUDE.md (system order, ability/operator
  checklists).

### Verification

- `npm run check` green after the fix batch: lint, typecheck, Vitest 387/387 (25 files), build,
  e2e 3/3 (incl. a gadget placed through the Command path). `npm run balance` exit 0.
- All 16 abilities `isAbilitySupported()` (asserted in `content.test.ts`); `roster.test.ts` runs
  each end to end; `replay.test.ts` replays a scripted ability round to an identical state and
  event stream (also via JSON).
- Bots (Saltworks, medium, seeds 1–20): attacker win 54.9 % (58.3 % before abilities), median
  round 56.9 s, controller 0.050 ms/tick avg, worst 4.9 ms. Brace/Slipstream/Sonar used
  hundreds of times, 0 refused presses.
- Screenshots iter14 reviewed (29 shots, 6 new ability shots): ghost, barrier, nodes, fire area,
  Sonar + reveal markers OK; fixes: reveal-marker lift (`HUD.reveal.liftM`), wider ability slot.

### Known issues / follow-ups

- Visual: Sonar ring thin at distance; wall-node rings flat at node height (invisible edge-on);
  fire area only team-coloured (nothing says "fire"); no shot covers the shield shell or the
  invalid ghost; range dummy health bars show through walls.
- Bots: Slipstream used very often; bots don't step out of slow-only areas; Scaffold Screen is
  never placed by bots (taller than eye height rule).
- Player audio has no occlusion (bots have); two same-tick placements can overlap.
- Sprint-out, recoil reset and bloom recovery still use "at least" float gates (not `isTimeUp`).

### Open questions for the user (defaults in use)

1. Range with all 14 operators, matches with the 4 M1 operators — **yes**.
2. `maxActive` reached → refuse (not replace oldest) — **refuse**.
3. Gadget bodies + areas visible to all; radius rings only to the owner's team — **yes**.
4. Throw on press, no arc preview — **yes**.
5. Relay pick limit: ceil(team size ÷ playable operators) = 2 per team — **yes**.
6. All attackers dead after a plant → defenders must still disrupt — **yes**.
7. Relay becomes the default mode once its DoD is met — **yes**.
8. Plant 4 s / disrupt 6 s — **yes**.
9. Net spike: "feel unchanged" at 100 ms = instant local feedback + hits on stationary targets
   (moving-target hits need M6 lag compensation) — **yes**.
10. Net spike: hit markers wait for server confirmation — **yes**.
11. Net spike only via `?net=loopback` — **yes**.
12. Still from M1: mutual wipe → defenders; sprint starts only grounded; players hear as far as
    bots.

### Next

1. After every further playable, green state: `npm run deploy`, commit + push only `play/`.
2. R4: Relay as default mode (user default: yes once DoD met), `smoke.spec.ts`, SPEC §4.1 links
   to `RELAY`, ARCHITECTURE/ROADMAP for Relay, ADR-0013 → accepted.
3. Net-readiness spike N1 (determinism + snapshots; per-character spread RNG changes seeded
   outcomes) → N2 → N3 → N4 → N5 (ADR-0014).
4. Follow-ups: nav `graph.nearest` can snap a bot to a node behind a wall (upper corridor west
   end); uplink clock rarely decides a round (2 of 81 plants).
5. M1 playtest whenever the user is available.

---

## 2026-09-30 — M1 built: weapon switching, Saltworks, movement fix, bots, elimination — awaiting playtest

**Status:** every M1 feature is implemented and verified in code, tests and screenshots. The
DoD items that need a human (headed fps measurement, blind test, 20 duels vs medium bots) are
still open. Work ran 2026-09-27 → 2026-09-30 in parallel subagent batches (ADR-0011 plan).

### User decisions (2026-09-27)

- **Heron** plays M1 with weapons only; Sonar (`hold` + `reveal`) stays M2. The deferred kinds
  are defined once (`DEFERRED_ACTIVATIONS` / `DEFERRED_EFFECTS` in `src/sim/abilities/effects.ts`).
- **Elimination:** timeout → the **defending side** wins (not the recommended "more alive
  wins"); format = Relay's (`MATCH_FORMAT`); default mode on page load = elimination
  (`?mode=range` for the range); after death a fixed camera + round banner (spectating = M2).

### Coordinator defaults — not yet confirmed by the user (all one config value each)

- Mutual wipe → defenders (`MATCH_FORMAT.mutualWipeWinner`); first attackers and overtime sides
  by coin flip; attacker spawn zone drawn per round (`ELIMINATION.attackZone`).
- Sprint can only *start* on the ground; trigger buffer `GUNPLAY.triggerBufferSeconds` (0.15 s).
- Players hear exactly as far as bots (`AUDIO.spatial.reach` references `AI.hearing`).

### What changed

- **Weapon switching:** primary + secondary with separate ammo, `GUNPLAY.weaponSwapSeconds`,
  keys 1/2 + wheel, HUD holstered line, view-model lower/raise. Kestrel + Heron playable.
- **Saltworks** (`src/data/levels/saltworks.ts`, SPEC §13.1): two floors, sites A (Tank Hall)
  and B (Control Room), side-based spawn zones; `LevelDef` generalised (`spawnZones`, `sites`,
  `range`, `nav`); shared builders in `geometry.ts`. Client loads levels via `?level=`.
- **Movement rewrite** (pre-existing bug): nobody could climb the range stairs, slow operators
  stalled on ramps, flat-floor dead stops. Now all 14 operators climb stairs/ramps, 0 dead-stop
  ticks, feet rest exactly on the floor. Updraft peaks at its 3.2 m (was ~6.4 m).
- **Sim fixes:** trigger buffer, `canFire(e)`, `hit.sourcePos`, sprint starts only grounded,
  spawn facing authoritative on the spawn tick (`spawn` event carries yaw/pitch).
- **ADR-0011 (accepted)** — bots + elimination, built in five batches (§10 has the as-built
  notes): `SimQuery` + sight-ray group, `footstep` events, mode interface + registry
  (`ModeRules.frozen` shared by sim and bots), elimination mode, nav graph (100 nodes / 131
  links, validated), A* + steering + stuck recovery, perception/hearing/intel, three aim
  tiers, brain state machine, `createBotController` / `stepMatch`.
- **Client:** launch params `mode`/`level`/`tier`/`seed`, `session.ts`, mode hosts, menu match
  section, round HUD, kill feed, death camera, team colour bands, nav debug overlay.
- **Feel pass (SPEC §11):** damage-direction indicator, view-model sway/bob by weight class,
  landing dip, sprint pose, recoil kick from real recoil, hip depth derived per weapon (fixed
  the "loose blocks" next to the ammo panel — they were rear sight posts).
- **Audio:** positional audio (HRTF panners, own reach curve, voice cap 24), remote gunshots,
  impacts and footsteps audible.
- **SSOT cleanups:** `MATCH.teamSize`, `loadoutWeapon()`, `startingReserve()` in balance,
  `levelExtent` for shadow bounds, `shapeFrontalArea` in `hitbox.ts`, bob stride from
  `MOVEMENT.footsteps.strideM`.
- Docs: SPEC (§4.3, §6, §7, §11–§15, §13.1), ARCHITECTURE (rewritten, §12–§15 new), ROADMAP
  note, ADR index, CLAUDE.md config table + view-model note.

### Verification

- `npm run check` green: lint, typecheck, Vitest 242/242 (17 files), build, e2e 2/2 (range +
  elimination default page). `npm run balance` exit 0. No CRLF in text files.
- Bot numbers (Node, fixed seeds): tier duels medium>easy 79–92 %, hard>medium 79–92 %;
  6 bot-only matches = 36 rounds, 35 by elimination, median round 53 s, attackers won 72 %,
  no stuck bots; controller 0.035 ms/tick avg (worst ≈3 ms on the first live tick, all bots
  plan paths), sim step 0.13 ms avg.
- Screenshots iter05–iter13 reviewed (latest = iter13): Saltworks overview/sites/lobby/spawn
  shield OK; Kestrel/Heron/secondary view models OK; ADS Heron sight aligned; elimination
  pre-round, live, death camera, round end, nav overview OK; defender spawn no longer faces
  a wall. Coordinator note: the southern courtyard is very open — judge in playtest.

### Known issues / limits

- Hearing ignores walls (no occlusion) → attackers converge on every gunshot.
- Bot-only rounds favour attackers (72 %); knobs `AI.brain.holdFraction`, `defendedMarginM`.
- A bot pinned by a teammate between nodes stops sliding (KCC); existing recovery frees it.
- Stairs: one tick of ~1 cm backward motion per step, ~70 % of flat speed. Jumps peak
  ~0.05 m below `jumpHeight` (pre-existing).
- Other characters' ability/reload/swap sounds are not audible yet (SPEC §15).
- Bob is not phase-locked to footstep events. `roundEnd` has no mutual-wipe flag (host infers).
- Heron's budget still counts Sonar (weapons-only in M1 → effectively under the band).
- Observed once by an agent, not reproduced: Vitest failing from a lowercase `d:\` cwd.

### Next

1. **Playtest with the user (DoD):** headed fps on the RTX-4080-class machine (10-min session vs
   medium bots, ≥ 60 fps @1080p); blind test anchor vs speedster; 20 duels vs medium bots
   (target 30–70 %); TTK matrix review. Record results here.
2. Confirm the coordinator defaults above; tune from playtest findings.
3. Then M2 per ROADMAP (ability framework incl. `hold`/`reveal`, Relay).

---

## 2026-09-27 (later) — Open questions answered — M1 may start

**Status:** the user answered all open design questions, each with the recommendation. The
user has not yet read SPEC in full; any SPEC remarks they bring later take priority over M1
work. Next session starts M1 (handover: [`../HANDOVER.md`](../HANDOVER.md)).

### Decisions (user, 2026-09-27)

1. **Lethality:** keep the current fast, tactical TTK band; revisit only with M1 playtest
   evidence (SPEC §9.2).
2. **M1 operators:** Basalt, Wisp, **Kestrel, Heron** (ROADMAP M1).
3. **Recoil:** keep the learnable pattern that recovers after release (ADR-0009 unchanged).
4. **Identity:** "Counterweight" / contractor trials / "Relay" stay the working identity;
   trademark check before any public release (SPEC header).
5. **Relay timings and match format** (SPEC §4.1): accepted as starting values; they move into
   `src/config/` when M2 builds the mode.

### Consequences to resolve in M1 (flagged, not yet decided)

- Kestrel is a *speedster* like Wisp, so M1 covers anchor, speedster ×2 and intel — the old
  ROADMAP wording ("one Breacher/Support/Intel/Trapper pair") no longer applies.
- Heron's `heron_sonar` is not supported yet (`isAbilitySupported()` → false; the ROADMAP puts
  it in M2). But `tests/unit/content.test.ts` requires every ability of
  `RANGE_MODE.playableOperators` to be supported, so adding Heron there fails the test. It
  needs the `hold` activation *and* the `reveal` effect (both M2 scope). Choose in M1: pull
  both forward, or let Heron play M1 with weapons only and narrow the test to abilities not
  scheduled for M2 — ask the user.

### Verification

Docs only (SPEC header, §4.1, §9.2; ROADMAP M1; this entry). No code changed.

---

## 2026-09-27 — Phase 0 (spec) + Phase 1 (foundation) complete — waiting for spec review

**Status:** stop point of the brief reached. Milestone M1 must not start before the user has
reviewed [`SPEC.md`](SPEC.md) and answered the open questions below.

### What exists

- **Docs:** SPEC, ARCHITECTURE, ROADMAP (M1–M6 with DoD; net-readiness spike added to M2),
  NETWORKING, ADR-0001…0010, ASSET_MANIFEST (no shipped assets; CC0 candidate list;
  Quaternius excluded), generated ROSTER/BALANCE, README, project CLAUDE.md.
- **Content (`src/data/`):** 14 operators (6 archetypes), 11 weapons, 16 abilities covering
  every activation type and resource model, 3 hitbox profiles, power-budget model, greybox test
  range. All operators sit inside the budget band.
- **Simulation (`src/sim/`):** fixed tick (`SIM.tickRate`), Commands/ControlMessages/events, Rapier KCC
  movement (accel, air control, jump, crouch with head-room check, sprint rules), hitscan with
  pellets, falloff, zone multipliers, armour, spread cone, deterministic recoil aim offset,
  reload, ADS; ability resource model (cooldown/charges/uses/none); effects `modifier` + `dash`,
  activations `instant` + `passive`; range mode (dummy respawn, infinite reserve).
- **Bots (`src/ai/`):** range dummies (static/strafe) producing ordinary Commands.
- **Client:** sun + shadows, procedural sky + matching IBL, dev textures with world-space UVs,
  greybox actors = hitboxes, view model (sway, bob, kick, ADS sight alignment, muzzle flash),
  HUD (dynamic crosshair, hit/head/kill markers, health, ammo, abilities), damage numbers,
  dummy health bars, impact marks, debug overlay, menu with generated controls/settings,
  synthesised audio, QA hooks.
- **Tooling:** `npm run balance`, `npm run docs:gen`, `npm run shots`, Playwright smoke test
  against `dist/` served under `/20260927_FPV/`.
- **Final clean-up (after the first green check):**
  - `currentSpread()` moved from `sim/systems/weapons.ts` to `sim/stats.ts`;
    `WeaponState.spread` removed (derived values stay out of state).
  - Doc-vs-code review fixed in ARCHITECTURE, SPEC, CLAUDE.md, README, ADR-0002/0003,
    NETWORKING and ROADMAP (boundary paths, system order, schema fields, group names, no
    hard-coded tick rate/port/chunk sizes); Basalt's silhouette text now "broad plated
    pauldrons".
  - SSOT: dev/E2E host and ports only in `tools/lib/deploy.ts` (used by `vite.config.ts`,
    `serve-dist.ts`, `screenshot.mjs`, Playwright).

### Verification (this session; re-run after the final clean-up)

| Check | Result |
| --- | --- |
| `npm run lint` (incl. boundary rule; probe file with `three`/`Math.random`/`document` in `src/sim` → 3 errors, then deleted) | pass |
| `npm run typecheck` | pass |
| `npm test` (Vitest, 6 files) | 51/51 pass |
| `npm run test:e2e` (build + Playwright, served from sub-directory) | 1/1 pass: ready flag, no console errors, no failed requests, head and torso hits on separate hitboxes |
| `npm run balance` | exit 0, all 14 operators inside 4 ± 1.5 |
| `npm run build` | pass, no warnings; chunks: rapier 4.33 MB (1.67 MB gz), three 543 kB, game 74 kB |
| Headed Chromium, RTX 4080, 1920×1080, vsync off | ~1,870 fps player view (194 draw calls, 33 k tris), ~1,720 fps overview; no console errors |
| Headless screenshots (SwiftShader) | ~5 fps — tooling only, not a performance figure |

### Screenshot review log

- **iter01:** scene washed out (exposure/env too strong); a huge dark quad in first person —
  the local player's own visor, because the actor view created during free-camera shots was
  skipped instead of hidden; view model black (no environment light in its scene); ADS rear
  sight filled the screen (fixed ADS depth ignored weapon length). All fixed.
- **iter02:** readable colours, visible shadows; sight posts still chunky → shrunk, grip added.
- **iter03:** overview, course, Basalt/Wisp hip views, Basalt ADS, debug overlay, peek walls —
  reviewed, no defects found. Hit feedback checked separately: headshot damage number (head
  colour), health-bar drop, hit/kill marker variants.
- **iter04 (current, `docs/screenshots/latest_*.png`):** after the spread refactor and doc
  fixes; Basalt hip/ADS and the debug overlay reviewed — same as iter03 (file sizes within
  0.1 %), crosshair and overlay spread line intact. Cosmetic note for the M1 feel pass: in the
  Wisp hip view the SMG's magazine and grip read as detached dark blocks next to the ammo panel.

### Handover notes (do not rediscover)

See the "Critical knowledge" section in [`../CLAUDE.md`](../CLAUDE.md). In addition:

- Headless Chromium does not request `/favicon.ico`; headed Chrome does. `index.html` carries
  an empty data-URL icon so there is no 404 outside the sub-directory.
- `renderer.info.autoReset` is off and reset once per frame (two render passes).
- Hit markers last 0.2 s; at headless frame rates they may never be captured on screen.
- The research subagent's asset shortlist is summarised in `ASSET_MANIFEST.md`.
- **Decision (user, 2026-09-27): no Quaternius assets** — its site now shows a non-CC0 licence
  (QAL, 8/28/2026, verified first-hand). Assets only from Kenney, Poly Haven, ambientCG (CC0).
  Bot bodies and weapon models from Kenney still need research (M1/M3).

### Known limitations

- Feel is unverified by a human: pointer lock, raw input, sensitivity, recoil values and audio
  were exercised only by automated tests and headless/headed scripted runs.
- Only `instant`/`passive` activations and `dash`/`modifier` effects run; other roster
  abilities are data only (shown as "M2").
- No weapon switching yet (secondaries exist in data only); dummies do not shoot back.
- Budget model is a heuristic (utility costs are judgement calls, hit probability is a cone
  approximation); recoil patterns and all numbers are a first pass.
- Crouching squashes greybox capsules vertically (visual only; hitboxes are exact).
- Synthesised placeholder audio; no footsteps yet.

### Open design questions (for the user)

1. **Target lethality.** Current data gives fast, tactical TTKs (reference rifle ≈ ¼ s to kill an
   average operator up close; see `generated/BALANCE.md`). *Recommendation:* keep this
   lethal band — it rewards positioning and information, the core of the genre — and revisit
   after the M1 playtest.
2. **The other two M1 operators.** *Recommendation:* Kestrel (its kit already runs in the sim;
   adds verticality) and Heron (DMR marksman; tests the long-range end; ability arrives in M2).
3. **Recoil model.** Current: learnable pattern that recovers after release (ADR-0009).
   Alternative: recoil permanently moves the view. *Recommendation:* keep the current model.
4. **Identity.** Working title "Counterweight", contractor-trials setting, "Relay" mode.
   *Recommendation:* keep as working identity; trademark check before any public release.

### Next step

User reviews SPEC + open questions → M1 (see [`ROADMAP.md`](ROADMAP.md)): weapon switching,
bot brains that fight, greybox map #1, elimination rounds, footsteps, feel checklist.
