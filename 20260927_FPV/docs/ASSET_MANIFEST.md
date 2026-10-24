# Asset Manifest

Rule: only CC0 assets from **Kenney, Poly Haven or ambientCG** (project decision 2026-09-27,
see below). Every shipped asset is listed here with creator, source URL, licence, local path and
modifications, and is checked in-engine before it is relied on.

## Shipped assets

**None.** The Phase 1 prototype uses no external assets: geometry is primitives built from
level/hitbox data, textures are generated on a canvas at runtime (`src/client/render/textures.ts`),
the sky is Three.js' procedural `Sky` shader, and sounds are synthesised with Web Audio
(`src/client/audio/sfx.ts`).

| Asset | Creator | Source URL | Licence | Local path | Modifications |
| --- | --- | --- | --- | --- | --- |
| — | — | — | — | — | — |

Runtime libraries (npm, bundled): Three.js (MIT), `@dimforge/rapier3d-compat` (Apache-2.0).

## Candidates for M1 bots and the M3 art pass (not downloaded, not shipped)

Researched 2026-09-27 (licence pages checked online; nothing verified in-engine yet).

| Need | Candidate | Creator | Licence | Notes |
| --- | --- | --- | --- | --- |
| Bot/operator bodies | *to be researched* (Kenney character packs) | Kenney | CC0 | Until then: greybox bodies built from the hitbox layout |
| Weapon view models | *to be researched* | Kenney | CC0 | Blaster Kit is toy-style (wrong tone); until then: procedural view models |
| Facility kit | Space Station Kit, Modular Space Kit, Factory Kit | Kenney | CC0 ("Creative Commons CC0") | Walls, doors, windows, stairs, containers; flat-colour low-poly |
| Surface textures | Concrete, painted metal, diamond plate sets | ambientCG / Poly Haven | CC0 | For custom geometry; avoid photoreal textures next to flat-colour kit pieces |
| IBL | kloofendal_48d_partly_cloudy_puresky, empty_warehouse_01 | Poly Haven | CC0 | Lighting only |
| Sounds | Impact Sounds, Interface Sounds, Sci-Fi Sounds | Kenney | CC0 | No realistic gunshots in these packs |

## Decision: Quaternius excluded (2026-09-27)

The brief lists Quaternius as a CC0 source, but `https://quaternius.com/license.html` now shows
the **"Quaternius Asset License (QAL) v1.0"** (last updated 8/28/2026, verified 2026-09-27),
which is not CC0 and restricts redistribution. Because a public GitHub Pages build exposes the
raw files, the project uses no Quaternius assets (user decision 2026-09-27). This also applies
to the older copies in the sibling project FTB4.
