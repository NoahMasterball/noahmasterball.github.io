# MASTER TASK: Build a visually stunning original 3D game vertical slice (browser, Three.js)

You are the lead game engineer, technical artist, art director, rendering engineer, asset integrator, world designer, and QA owner for this project.

Work autonomously until the complete vertical slice described below is implemented, running, visually inspected against screenshots, and documented.

## 0. Ground truth about this repository

This project folder is **empty**. There is no existing renderer, no shaders, no asset pipeline, nothing to preserve. You are building from scratch.

Scaffold the project yourself:

* Vite + TypeScript (strict mode) + Three.js (latest stable release). Set Vite `base: './'` and use relative asset paths so the production build also works when served from a subdirectory (this repo deploys as a subfolder of a GitHub Pages site).
* `postprocessing` (pmndrs) for the effect pipeline, plus the separate `n8ao` npm package for ambient occlusion (N8AO is not part of `postprocessing`; it provides a pass that plugs into the same EffectComposer).
* Playwright as a dev dependency for automated screenshot capture.
* No other engine or framework. No Unity, Unreal, Godot, Babylon.js, React Three Fiber. Helper libraries are allowed and encouraged where they prevent jank: use `three-mesh-bvh` (or Rapier) for character/camera collision instead of hand-rolling mesh collision.

## 1. Primary objective

Build an original, polished, browser-based, third-person 3D game vertical slice whose **single dominant priority is visual quality**.

The quality bar:

> "If someone sees a screenshot of this game without seeing the source code, it should look like a deliberately designed commercial indie 3D game rather than an AI-generated prototype."

The result must NOT look like:

* Roblox or Minecraft;
* a Three.js tutorial or engine demo;
* an unfinished blockout or game-jam prototype;
* a collection of unrelated asset packs;
* a scene built from visible untextured primitives;
* generic AI-generated 3D content.

Visual quality takes priority over feature quantity, world size, and code volume. A small, dense, beautiful scene beats a large, sparse, mediocre one — always.

## 2. The one rule that decides success: assets first, art direction second

The single most common failure mode for this kind of project is choosing an ambitious art direction and then discovering that no compatible assets exist. You will therefore work **asset-first**:

### Phase A — Acquire and verify assets BEFORE designing the world

1. Download candidate asset packs at the very start of the project. Known-good, legally redistributable, scriptably downloadable sources:
   * **Quaternius** (quaternius.com — CC0; large stylized packs incl. the **Medieval Village MegaKit** (quaternius.com/packs/medievalvillagemegakit.html — 300+ modular grid-snapping village pieces, glTF included), "Ultimate" nature/buildings/characters packs, and the Universal Animation Library with rigged, animated characters);
   * **KayKit** (Kay Lousberg, kaylousberg.itch.io / GitHub `KayKit-*` repos — CC0; character packs with idle/walk/run animations, dungeon/adventure packs);
   * **Kenney** (kenney.nl — CC0; nature kits, city kits, character kits, all downloadable as direct zip);
   * **Poly Haven** (polyhaven.com — CC0; HDRIs and PBR textures, has a JSON API for scripted download);
   * **Poly Haven models** (polyhaven.com/models — CC0 photoscanned/PBR props: rocks, cliffs, stumps, furniture; near-photoreal quality, the strongest free source for realistic environment dressing);
   * **ambientCG** (ambientcg.com — CC0; PBR texture sets, has a download API).

   Login-gated sources (Mixamo, Sketchfab) are deliberately excluded: they cannot be downloaded scriptably without credentials, and the sources above already cover characters, animations, props, textures, and HDRIs. Do not add them back.
2. Configure loaders up front: `GLTFLoader` with `DRACOLoader`, `KTX2Loader`, and the meshopt decoder — several CC0 sources (notably Poly Haven models) ship compressed glTFs that fail to load without them. Then load the downloaded models in the actual application and take screenshots to verify: meshes render, textures resolve, animations play, scale is sane. **Do not build a world around an asset you have not seen render.**
3. Record every asset in `docs/ASSET_MANIFEST.md`: name, creator, source URL, licence, local path, modifications. Only CC0 or explicitly redistributable assets. Do not assume an asset is free because it appears in an open-source repository.
4. **Only after** you know which packs render correctly do you choose the art direction — and that choice is made by the bake-off below, never by browsing thumbnails.

### Phase B — Art-direction bake-off (this is how the look is chosen)

Never judge an asset pack by its store page or an unlit viewport: raw previews look cheap because they have no lighting, no post-processing, and no composition. Perceived quality is created mostly by the rendering stack. The art direction is therefore chosen by **controlled comparison under final lighting, not by taste on thumbnails**:

1. Implement the full rendering stack from section 3 first, on a test scene.
2. Build the SAME small test vignette (ground, two or three large props, one vegetation cluster, one structure fragment, one character at rest) once per candidate direction — at least two, at most three candidates:
   * **medieval village — the user-preferred favourite**: Quaternius Medieval Village MegaKit for structures, Quaternius nature packs for vegetation and terrain dressing, Quaternius characters animated via the Universal Animation Library. Treat this as the default winner unless it clearly loses in the screenshot comparison;
   * **one control candidate** of a genuinely different flavour, e.g. semi-realistic (Poly Haven photoscan models + ambientCG PBR terrain + HDRI, with a visually quiet character) or a flat-shaded moody night scene carried by strong artificial lights;
   * optionally a third candidate if the first two score close together.
3. Light each vignette fully (chosen lighting scenario, fog, grading) and capture identical 1920×1080 shots from the same camera positions.
4. Compare the screenshots side by side and score each candidate 1–10 on: material richness, depth/atmosphere, coherence, and "would this pass as a commercial game screenshot".
5. The winner becomes the art direction. Record scores, reasoning, and the winning screenshot in `docs/VISUAL_SPEC.md`; that screenshot is the north-star reference every later phase is compared against.

The final world is then built around ONE primary asset family (the winner's), with other sources used only for textures, HDRIs, skyboxes, and individually integrated hero props that blend in. Never mix stylized character sets from different families in one scene.

### Style guidance

The setting is decided by the user: a **medieval village** built from the Quaternius Medieval Village MegaKit, assuming it passes the bake-off above. You retain full creative freedom over palette, mood, lighting scenario, time of day, landmark concept, and composition — do not ask the user about those. Respect this constraint: full photorealism (especially realistic human characters) is out of reach with free assets and always looks broken when attempted; a **coherent stylized look** is achievable and looks intentional. Whichever direction wins the bake-off, cohesion beats fidelity: make the chosen look expensive through lighting, atmosphere, and composition.

Before building the environment, write `docs/VISUAL_SPEC.md`: setting, mood, colour palette (with hex values), primary/secondary landmark concept, lighting scenario (e.g. low golden-hour sun, blue-hour with warm artificial lights, overcast-moody — pick one strong scenario, not neutral midday), fog colour/density, post-processing intent, composition of the opening camera view. The result must feel art-directed, not generated.

## 3. Rendering stack (mandatory, non-negotiable)

Perceived quality comes mostly from lighting, atmosphere, and post-processing — not from asset polycount. Implement ALL of the following before detailed world-building, and verify each via screenshot:

* `renderer.outputColorSpace = SRGBColorSpace`, ACES filmic tone mapping, calibrated exposure;
* one strong directional sun/moon light with high-quality shadows (PCFSoft, tuned shadow camera frustum tightly fitted to the play area, bias tuned — no acne, no peter-panning);
* HDRI environment lighting (Poly Haven HDRI as `scene.environment`) so ALL materials receive image-based lighting — this alone separates "demo" from "game";
* sky treatment consistent with the HDRI/lighting scenario (visible skybox or gradient sky + optional HDRI-lit clouds);
* atmospheric fog tuned to the palette (fog colour must harmonise with sky colour, never default grey);
* post-processing chain: N8AO ambient occlusion, subtle bloom, SMAA or TAA, vignette, and colour grading (LUT or tonal adjustments) matched to the palette;
* anisotropic filtering on ground/large textures;
* shadow-receiving ground everywhere; objects must be visually grounded (AO + contact darkening), never floating;
* instancing for repeated props (vegetation, rocks) and frustum culling left intact.

Forbidden looks — treat each as a bug to fix, verified by screenshot:

* untextured flat-colour meshes lit by default lights (unless the art direction is deliberately flat-shaded stylized AND the lighting/post stack makes it look intentional);
* uniform ambient lighting with no directionality;
* washed-out or crushed image, extreme saturation, excessive bloom;
* shimmering or unstable shadows;
* fog used to hide an empty world;
* visible raw BoxGeometry/CapsuleGeometry/CylinderGeometry scenery. Primitives are acceptable ONLY for invisible collision and debug helpers.

## 4. Scope of the vertical slice

Playable area approximately **60–100 metres across** — small enough to make genuinely dense and detailed. Density beats size.

The world must contain:

* one strong primary landmark, immediately readable;
* one secondary landmark;
* readable traversal paths with foreground / middle-ground / background layering;
* grouped, intentional prop placement (vegetation clusters, rocks, debris, small storytelling details) with variation in density and areas of visual rest;
* background silhouettes so the world does not end at a visible edge (hills, walls, treeline, or sea + fog);
* one controllable player character — a rigged, animated character asset with idle/walk/run animations;
* at least one animated NPC or ambient creature;
* one simple interactive object (proximity prompt + response is enough);
* subtle ambient motion (wind on vegetation, particles like dust/fireflies/leaves, flickering light — at least two of these) so screenshots and gameplay feel alive;
* ambient audio if practical (skip rather than delay visual work).

Player controls:

* third-person orbit camera: damped rotation, sensible zoom range, camera collision (no clipping through terrain/buildings);
* movement aligned with camera direction, walk + run, smooth animation blending, minimal foot sliding;
* collision with the environment; walkable slopes and steps;
* stable framing at different window sizes.

Explicitly OUT of scope: multiplayer, accounts, quest systems, crafting, combat, inventory, monetisation, additional regions, procedural infinite worlds, backend services. Do not add features at the cost of visual quality.

## 5. Automated screenshot loop (the core workflow)

Never judge visual quality from source code alone, and never declare visual success based on successful compilation.

Set up FIRST, before world-building:

* an npm script that starts the dev server, opens the game in headless Chromium via Playwright, waits for readiness, and captures 1920×1080 screenshots from **fixed, named camera positions** (at minimum: opening view, primary landmark, secondary landmark, exploration view) into `docs/screenshots/`, with sequential naming per iteration;
* readiness must be an explicit signal, not a timeout: the app sets a `window.__gameReady` flag only after the `LoadingManager` reports all assets loaded, shaders are compiled (`renderer.compileAsync`), and a few frames have rendered — Playwright waits for that flag; hide loading screens and debug overlays before capture;
* treat a black or blank screenshot as a pipeline failure, not a result — if headless Chromium has no working WebGL on this machine, retry with GPU/ANGLE flags (e.g. `--use-angle`) or fall back to headed mode.

Then run this loop after every visual phase, and at least **six times** across the whole project:

1. Capture the full screenshot set.
2. Inspect the images directly.
3. Write down the three largest visible weaknesses (in `docs/PROJECT_STATE.md`, dated per iteration).
4. Fix exactly those weaknesses.
5. Re-capture and compare.

Keep every iteration's screenshots — the progression is part of the deliverable. The opening camera view must end up looking like a deliberate promotional screenshot.

## 6. Workflow phases

1. **Scaffold** — Vite + TS strict + Three.js + postprocessing + Playwright; blank scene renders; screenshot pipeline works end-to-end.
2. **Asset acquisition & verification** — Phase A above. Manifest written. Render-verified.
3. **Rendering stack** — full pipeline from section 3 on a test scene; screenshot-verified.
4. **Art-direction bake-off** — Phase B above; scored candidate vignettes, winner and north-star screenshot recorded in `docs/VISUAL_SPEC.md`.
5. **World blockout** — terrain, landmark masses, paths, lighting scenario; screenshots.
6. **Asset & material pass** — replace all placeholders; fix scale, orientation, colours, roughness; screenshots.
7. **Lighting & atmosphere** — refine sun, shadows, fog, sky, grading, particles; screenshots.
8. **Composition & detail** — density, grouping, framing, storytelling, background silhouettes; screenshots.
9. **Character & camera** — player, animations, NPC, interaction, camera collision; screenshots.
10. **QA & optimisation** — only after visual quality is reached: draw calls, texture memory, instancing, LOD where needed, load time, console errors, resize behaviour. Record measured numbers, do not guess.

Use parallel subagents where genuinely useful (asset research, licence checks, screenshot review), but one orchestrator owns visual consistency and integration. Subagents must not introduce conflicting styles or duplicate systems.

## 7. Acceptance criteria

Visual:

* no visible placeholders or primitive scenery; coherent art style; characters and environment belong to the same world;
* lighting has direction and depth; shadows stable; objects grounded; materials differentiated;
* convincing density; recognisable primary landmark; intentional composition; atmosphere supports the setting;
* opening view looks like a promotional screenshot; at least six documented screenshot-review iterations exist.

Technical:

* production build succeeds; scene loads with no missing files; no unresolved console errors;
* idle/walk/run animations, camera collision, player collision, and interaction all work;
* repeated props instanced; performance measured and documented (target: smooth on a mid-range desktop at 1080p).

Legal:

* every external asset in the manifest with licence recorded; unclear assets removed; no third-party IP or branding copied; the world and identity are original.

## 8. Autonomy rules

Reversible, in-scope decisions: decide yourself and continue. Do not ask the user about style, setting, palette, assets, or naming. Pause only for credentials, payment, irreversible destructive actions, or genuine scope changes.

Before reporting progress, verify every claim against files, commands, screenshots, or measurements. If something failed or was skipped, say so plainly.

## 9. Final report

When done, deliver concisely: chosen direction; what was built; asset/licence status; build/test/browser results; measured performance; screenshot locations; exact commands to run the project; remaining limitations; recommended next phase (gameplay comes only after visual quality is proven).

Begin now: scaffold the project, get the screenshot pipeline working, then acquire and verify assets.
