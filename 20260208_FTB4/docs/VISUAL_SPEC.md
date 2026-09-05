# Visual Spec — Emberwick Vale

## Art-direction bake-off (2026-08-02)

Both candidates were built as the same vignette (ground, structure fragment, props,
nature cluster, character at rest) under the identical final rendering stack
(ACES, spruit_sunrise HDRI IBL, N8AO, bloom, SMAA, vignette, grading) and captured
from identical camera positions (`VIGNETTE_SHOTS`).

### Candidate A — Quaternius medieval village (iter05_*_medieval2)

Quaternius Medieval Village MegaKit + Stylized Nature MegaKit + Universal Base
Character (peasant outfit, UAL idle).

| Criterion | Score | Notes |
| --- | --- | --- |
| Material richness | 8 | Hand-painted plaster/stone/wood read beautifully at all distances |
| Depth & atmosphere | 7 | Golden IBL + warm fog; photographic HDRI horizon slightly clashes |
| Coherence | 8 | Every element one family; character belongs to the world |
| Commercial screenshot? | 8 | Close-ups pass as a stylized indie title |
| **Total** | **31/40** | |

### Candidate B — semi-realistic control (iter06_*_realistic)

Poly Haven photoscans + ambientCG PBR grass + KayKit knight.

| Criterion | Score | Notes |
| --- | --- | --- |
| Material richness | 7 | Photoscanned rocks superb; tiled grass flat by comparison |
| Depth & atmosphere | 6 | Same lighting, but nothing anchors the mid-ground |
| Coherence | 4 | Chibi knight vs. photoreal rocks = two universes; no realistic architecture available for a village |
| Commercial screenshot? | 5 | Reads as an asset test |
| **Total** | **22/40** | |

### Verdict

**Winner: Candidate A — Quaternius medieval village** (matches the user-preferred
direction). North-star reference: `docs/screenshots/iter05_opening_medieval2.png`
(and `iter05_closeup_medieval2.png` for material quality).

Poly Haven/ambientCG remain in use for what they won at: HDRI lighting and ground
detail textures — not for hero geometry. KayKit/Kenney packs are benched.

## Setting

**Emberwick Vale** — a small farming hamlet on a green vale at golden hour, an hour
before sunset. Quiet end-of-day mood: long shadows, hearth smoke, drifting pollen.

## Palette

| Role | Hex |
| --- | --- |
| Sun / highlights | `#ffdcb0` |
| Golden accent (bloom, UI) | `#d9a45b` |
| Plaster walls | `#e8dcc2` |
| Terracotta roofs | `#c96f3b` |
| Foliage | `#6f8f4e` |
| Meadow ground | `#66753f` |
| Sky zenith | `#7fa0c8` |
| Fog / horizon | `#c9a878` |
| Shadow tint | `#4a4661` |

## Lighting scenario

Low golden-hour sun (elevation ~15°) from the west-south-west; warm directional
key (`#ffdcb0`, PCFSoft 4096) + `spruit_sunrise` HDRI for image-based fill.
Warm cream fog (`#c9a878`) veils the middle distance; background silhouettes
(tree lines, hills) close the horizon so the photographic HDRI ground is never
directly visible — the HDRI contributes sky + light only.

## Landmarks & composition

* **Primary landmark:** the village **tavern "The Gilded Sheaf"** — two-storey
  plaster-and-brick MegaKit build with balcony, dormer and chimney smoke, on a
  low rise NE of the green. Immediately readable from the opening camera.
* **Secondary landmark:** a square **stone watchtower** (brick walls + tower roof)
  SW across the green, breaking the skyline the other way.
* Village green with a rock-path loop connecting door yards; houses ring the green
  facing inward; layered depth: foreground grass/flowers → green + characters →
  buildings → treeline silhouettes → fog → sky.
* Opening camera: from SE at eye height, tavern right-of-centre, path leading in,
  tree canopy framing the top-right, low sun raking from the left.

## Post-processing intent

N8AO (grounding), subtle mipmap bloom picking up sun/plaster highlights, ACES,
+contrast +saturation grade (warm), vignette. No LUT — tonal grade suffices.

## Ambient motion (min. two)

1. Drifting golden pollen/dust particles over the green.
2. Chimney smoke from the tavern.
3. Gentle sway on grass clumps and flowers (transform oscillation).
