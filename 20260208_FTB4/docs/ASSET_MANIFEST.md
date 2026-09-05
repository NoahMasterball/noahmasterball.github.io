# Asset Manifest

All assets CC0 (Creative Commons Zero) — no attribution required, redistribution
permitted. Full acquisition reports with download URLs and license evidence:
`asset_staging/reports/*.md` (staging dir is not committed; evidence quoted below).

## In use (shipped in `public/assets/`)

| Asset | Creator | Source | License | Local path | Modifications |
| --- | --- | --- | --- | --- | --- |
| Medieval Village MegaKit (Standard) | Quaternius | quaternius.com/packs/medievalvillagemegakit.html (mirror: OpenGameArt upload by Quaternius) | CC0 ("Free to use in personal, educational and commercial projects. (CC0 License)") | `assets/models/medieval/` (176 glTF) | none |
| Stylized Nature MegaKit (Standard) | Quaternius | quaternius.com/packs/stylizednaturemegakit.html (mirror: OpenGameArt) | CC0 | `assets/models/nature/` (68 glTF) | none |
| Universal Animation Library 1 (Standard) | Quaternius | quaternius.com (mirror: OpenGameArt / Dallolz/moorfall-assets) | CC0 | `assets/models/characters/UAL1.glb` (43 clips) | none |
| Universal Animation Library 2 (Standard) | Quaternius | quaternius.com (mirror: Dallolz/moorfall-assets) | CC0 | `assets/models/characters/UAL2.glb` | none |
| Universal Base Characters + Modular Outfits + Hair | Quaternius | mirror: github.com/Dallolz/moorfall-assets (LICENSE.md: CC0 1.0, attributes Quaternius) | CC0 | `assets/models/characters/*.glb` | none |
| spruit_sunrise HDRI (2K) | Poly Haven | polyhaven.com/a/spruit_sunrise | CC0 (polyhaven.com/license) | `assets/hdri/spruit_sunrise_2k.hdr` | none |
| kiara_9_dusk / overcast_soil_puresky / kloofendal_43d_clear_puresky HDRIs (2K) | Poly Haven | polyhaven.com | CC0 | `assets/hdri/*.hdr` | none |
| boulder_01, rock_moss_set_01, tree_stump_01, dead_tree_trunk_02, wooden_barrels_01, wooden_table_02 (glTF, 2K) | Poly Haven | polyhaven.com/models | CC0 | `assets/models/polyhaven/<id>/` | none |
| Grass001, Ground030, PavingStones046, Rock030, Planks037A (2K JPG PBR sets) | ambientCG | ambientcg.com | CC0 (docs.ambientcg.com/license) | `assets/textures/<id>/` | only Color/NormalGL/Roughness/AO maps shipped |
| KayKit Dungeon Remastered props (tables, chairs, barrels, keg, shelves, candle, torches) | Kay Lousberg | github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0 (pack license: CC0) | CC0 | `assets/models/kaykit/*.gltf.glb` (11 pieces) | scaled ×0.7 in code (`TAVERN.furnitureScale`) |
| Deer (animated, Quaternius animal family) | Quaternius | mirror: github.com/Dallolz/moorfall-assets `enemies/Deer.glb` (repo LICENSE.md: CC0 1.0 for all models) | CC0 | `assets/models/creatures/Deer.glb` | scaled ×0.4 in code |
| Skeleton Warrior / Mage / Minion (animated) | Kay Lousberg (KayKit Skeletons, bundled in moorfall mirror) | mirror: github.com/Dallolz/moorfall-assets `enemies/Skeleton_*.glb` (repo LICENSE.md: CC0 1.0; original pack kaylousberg.itch.io, CC0) | CC0 | `assets/models/creatures/Skeleton_*.glb` | scaled ×0.7 in code |

## Acquired but benched (staging only, not shipped)

| Asset | Creator | License | Status |
| --- | --- | --- | --- |
| KayKit Dungeon Remastered 1.0 | Kay Lousberg | CC0 | 11 furniture pieces shipped for the tavern interior (v0.5); rest staged |
| Kenney Nature Kit 2.1, Castle Kit 2.0 | Kenney | CC0 | fallback; unused after bake-off |
| moorfall enemies/weapons GLBs | Quaternius / KayKit (mirror) | CC0 | Deer + 3 skeletons shipped (v0.5); Wolf, Fox, Yeti, Orc etc. staged for the combat phase |

Decoder/runtime libraries in `public/draco/`, `public/basis/` are from the Three.js
distribution (MIT).

Rule: hero geometry and characters come from ONE family (Quaternius). Poly Haven /
ambientCG are used only for lighting (HDRI) and detail textures. KayKit characters
must not share the frame with Quaternius villagers. Documented exception (v0.5,
screenshot-verified `iter21_skeleton_camp`): KayKit skeletons as ENEMIES, placed
only at the fog-veiled forest edge away from the village; KayKit dungeon PROPS
(furniture) blend fine and are unrestricted.

## Modifications / pruning note

The shipped `public/assets/` contains only the subset of files the game
references (unused kit pieces, benched packs — KayKit, Poly Haven models, three
spare HDRIs, three spare texture sets — and glTF-unreferenced textures were moved
to the gitignored `asset_staging/pruned/`). No file contents were modified; the
only runtime modification is a non-uniform y-scale (×1.116) applied in code to
`Roof_Front_Brick6` gable pieces to match the RoundTiles roof pitch.
