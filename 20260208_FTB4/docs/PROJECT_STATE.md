# Project State — screenshot-review log

One entry per screenshot iteration. Format: date, iteration, what changed, the three
largest visible weaknesses, and what will be fixed next.

## Iteration 1 — 2026-08-02 — `iter01_*_scaffold`

Scaffold verification. Basic Three.js scene (box + ground, single directional light),
no post-processing, no HDRI. Purpose: prove the Playwright screenshot pipeline works
end-to-end (dev server → headless Chromium WebGL → `__gameReady` → named shots).

Weaknesses (expected at this phase):

1. Flat untextured primitives, tutorial look — no art direction yet.
2. No image-based lighting; shadows nearly black.
3. Default-looking sky/fog colours.

Next: full rendering stack (composer, N8AO, bloom, ACES, SMAA, vignette, grading).

## Iteration 2 — 2026-08-02 — `iter02_*_postfx`

Rendering stack online: pmndrs EffectComposer with N8AO → bloom → ACES tone mapping →
brightness/contrast + saturation grading → vignette → SMAA. HalfFloat HDR buffers,
PCFSoft 4096 shadows with tuned bias, golden-hour fog colour, materials test trio
(rough clay, plaster, polished metal).

Verified in `iter02_opening_postfx.png`: tone mapping and grading active (warm sky),
vignette visible, bloom picks up the metal specular, shadows soft with no acne.

Weaknesses:

1. No HDRI environment yet — metal renders black, shadowed faces crushed (no IBL).
   Blocked on asset download; will use Poly Haven golden-hour HDRI as `scene.environment`.
2. Still primitive test geometry (acceptable — this scene exists only to verify the stack).
3. Shadow edges slightly hard for the intended soft golden-hour look — revisit radius
   once the HDRI + final sun calibration is in.

Next: assets land → HDRI wired in → art-direction bake-off vignettes.

## Iteration 3 — 2026-08-02 — `iter03_*_hdri`

HDRI environment lighting wired in (`spruit_sunrise_2k.hdr` as environment +
background). IBL verified: metal test sphere reflects the sky, shadowed faces get
sky fill, material differentiation clear. Rendering stack complete.

Weaknesses:

1. Test primitives still (by design).
2. HDRI's photographic ground/treeline visible at horizon — will clash with the
   stylized world; must be hidden by world silhouettes + fog, HDRI kept for sky/light.
3. Sun position in config not yet matched to the HDRI sun azimuth.

## Iterations 4–6 — 2026-08-02 — bake-off (`iter04/05_*_medieval*`, `iter06_*_realistic`)

Built both bake-off vignettes and captured them under the identical stack and
identical cameras. Fixed during iter04→05: composited Quaternius character
(base body + outfit + hair on one skeleton — outfit GLBs are headless by design),
roof piece origin (Z span 0..4.85, not centred), chimney seated on ridge.

Scores and verdict recorded in `docs/VISUAL_SPEC.md`: **medieval wins 31/40 vs 22/40.**
North star: `iter05_opening_medieval2.png`.

Three largest visible weaknesses (medieval, to carry into world build):

1. Door/window holes are open — the kit uses separate `Door_*`/`Window_*` insert
   pieces that must be placed into wall openings; interiors visible through holes
   need floors/back walls or shutters.
2. Photographic HDRI horizon behind stylized world — needs background silhouette
   geometry (tree lines/hills) + fog to close the view.
3. Flat single-colour ground reads empty at distance — needs texture detail
   (ambientCG grass blended stylized), path network, and dense ground dressing.

Next: world blockout (terrain, tavern + watchtower landmarks, house ring, paths).

## Iteration 7 — 2026-08-02 — `iter07_*_world1` (first full world)

Whole village built in code: 2-storey tavern, 3-storey watchtower, three cottages,
path loop + spurs, ~300 scattered nature pieces, two tree rings, pollen + chimney
smoke, player + NPC characters, BVH collision.

Weaknesses: 1) roof gable ends of the RoundTiles roofs are open triangles (visible
from behind); 2) photographic HDRI sky shows power pylons — breaks the fiction;
3) washed-out pale ground; sparse path.

## Iterations 8–9 — `iter08/09_*_kittest*` (kit research)

Empirical kit tests: discovered `Roof_Front_*` pieces are complete gable walls;
"6x4" naming = gable-width × ridge-length; a y-scale of 1.116 matches
`Roof_Front_Brick6` to the RoundTiles pitch exactly. Mini-house verified.

## Iterations 10–15 — `iter10..15_*_world*` (fix + polish loop)

- Gables closed on all buildings; balcony door filled; lattice "WoodGrid" walls
  (open frameworks) replaced with windowed walls.
- Photographic sky replaced by a palette-matched gradient sky dome with sun glow
  (HDRI retained for IBL only, rotated to match the sun azimuth).
- Ground washout root-caused: grazing-angle PBR sheen + bright sunrise env on the
  photo grass albedo — fixed by removing the ground's roughness map, clamping
  `envMapIntensity` 0.35, darker saturated tint. Fog re-tuned (45/135).
- Dirt ground patches seat the buildings; window glass inserts auto-placed;
  wooden fence replaces the modern metal one at the tower; denser path.

## Iteration 16 — `iter16_*_world8` — near-final composition

Player spawn moved onto the tavern spur facing the primary landmark; cottage C's
camera-facing gable dressed (vine, bushes).

## Playtest round — `playtest/pt*.png` + probes

Found and fixed via automated playtest:

1. **Player fell through the world**: huge first-frame `dt` integrated seconds of
   gravity in one step, tunnelling below the ground ray's window. Fixed with a
   0.1 s frame-dt clamp + high-origin ground-ray recovery.
2. **Thin-door pop-through** under sustained push: fixed by excluding animated
   doors from the static collider and sub-stepping the capsule so per-step
   displacement ≤ half the radius. Tavern got an interior wood floor since the
   open door legitimately lets the player in.
3. Verified on real GPU (headed): hint "E — Tür öffnen" appears at the tavern
   door, door swings open, walls block movement, no console errors.

## Iterations 17–18 — `iter17_*_final`, `iter18_*_postprune` + `dist_smoketest.png`

Final captures (shadow map 2048, silhouette-ring shadows off), asset prune
(-210 MB unused pieces/packs/textures moved to `asset_staging/pruned/`),
production build smoke test: no failed requests, no console errors.

## Measured performance v0.3 (production build, headed Chromium, RTX 4080, 1080p)

- 100 fps idle and while sprinting (vsync-region cap; fully smooth)
- 822 draw calls idle view / 596 moving (frustum culling active), ~475k triangles
- 140 geometries, ~215 textures; resize to 900×1200 correct, still 100 fps
- Headless SwiftShader (software) reference: ~30–45 fps

## Iteration 19 — 2026-08-02 — `iter19_*_instanced` (GPU instancing, v0.4)

Spec §3/§7 required "repeated props instanced" — the one unmet acceptance
criterion of v0.3. New `engine/instanced.ts` (`InstancePool`): every repeated
nature piece (scatter dressing, path stones, both silhouette tree rings) now
renders as one `InstancedMesh` per source mesh; buildings and one-off hero
props stay KitLibrary clones (buildings feed the static BVH collider).
Vegetation sway preserved via per-instance matrix re-composition (shared
`swayAngle()`; frequency now in config `AMBIENT`). Scatter layout is bit-
identical to iter17: the main RNG stream is untouched (sway phases moved to a
second stream).

Verified: all four iter19 shots match the iter17 north star (layout, dressing,
palette identical); headless playtest green (door prompt, wall blocking, no
console errors); production build clean.

Measured (production build, headed Chromium, RTX 4080, 1080p):

- 100 fps idle, moving, and after resize to 900×1200 (unchanged, vsync cap)
- Draw calls 684 idle / 534 moving (v0.3: 822/596); scene graph 73 top-level
  objects instead of ~440
- ~861k triangles rendered idle (v0.3: ~475k) — instanced groups cull as a
  whole, so the tree rings always draw; irrelevant on GPU at the vsync cap,
  but headless SwiftShader drops to ~12 fps (software raster, dev-tooling only)

No visible weaknesses introduced; remaining limitations unchanged (README).

## Iterations 20–21 — 2026-08-02 — `iter20/21_*` (tavern interior, map growth, creatures — v0.5)

Three work packages, user-requested:

1. **Tavern interior**: 11 KayKit Dungeon Remastered props (CC0, staged since the
   bake-off) — decorated long table, chairs, stools, tablecloth bar table, keg,
   barrels, shelves, lit candle, mounted torches (2 exterior flanking the door).
   Warm flickering hearth point light + torch fill lights (no shadow casting),
   upper-storey slab as taproom ceiling. Furniture ×0.7 (KayKit is ~1.4x our
   scale, measured in `src/data/measurements_kaykit.json`) and joins the static
   collider. New named shot `tavern_interior`.
2. **Map growth ~20%**: playable diameter 80→96 m; tree rings pushed out
   (42–51 / 56–68 m, counts 66/50), supplemental outer-band scatter APPENDED
   after the original calls so the tuned inner layout keeps its exact RNG
   sequence; pollen field widened. Fog unchanged — horizon still closed.
3. **Creatures** (from the staged CC0 moorfall mirror; verified: own full
   animation sets, no retargeting): 3 deer (Quaternius, ×0.4) graze and wander
   on the new NW meadow via `engine/creature.ts` (graze/walk/flee state machine
   — they gallop away when the player closes within 6 m); dormant skeleton camp
   (KayKit, ×0.7) at the SE forest edge — Mage + Warrior idle, Minion as a bone
   pile (`Skeletons_Inactive_Floor_Pose`), rocks + loot crate dressing. Named
   shots `deer_meadow`, `skeleton_camp`. Manifest rule amended: KayKit enemies
   allowed at the forest edge only, never in frame with villagers.

Fixed during iter20→21: skeleton camp camera angle (Warrior was hidden exactly
behind the Mage from the first camera).

Verified: all 7 shots inspected — village views unchanged vs. iter19 (bonus:
door torches give the tavern a warm dusk glow in opening/primary shots);
interior reads as a cozy taproom; deer correctly sized vs. flora; headless
playtest green (door prompt, wall blocking, furniture in collider, no console
errors); production build clean.

Measured (production build, headed Chromium, RTX 4080, 1080p): 100 fps idle /
moving / after resize; 822/734 draw calls (v0.4: 684/534 — the interior, 2 new
shot areas and 9 skinned creatures added back ~140 calls); ~1.08 M triangles
rendered; 186 geometries, 254 textures.

Largest remaining weaknesses: 1) tavern windows don't glow from inside at
distance (glass not emissive); 2) skeletons are static set-dressing — no
awaken/combat behaviour yet (clips are ready: `Skeletons_Awaken_Floor`);
3) deer ignore scattered rocks/bushes while wandering (can clip through).

Remaining known limitations are listed in the README.
