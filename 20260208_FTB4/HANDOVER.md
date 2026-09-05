# Handover-Prompt — Emberwick Vale (3D Vertical Slice)

Kopiere den folgenden Text als ersten Prompt in eine neue Session:

---

Du übernimmst ein **fertiges, lauffähiges** Projekt: „Emberwick Vale", ein browserbasierter Third-Person-3D-Vertical-Slice (stilisiertes mittelalterliches Dorf zur goldenen Stunde), gebaut nach dem Brief in `GAME_PROMPT.md`.

**Projektordner:** `d:\OneDrive\Documents\GitHub\noahmasterball.github.io\20260208_FTB4`

## Stand (v0.5 — abgeschlossen)

- **Stack:** Vite + TypeScript strict + Three.js 0.185, `postprocessing` (pmndrs) + `n8ao`, `three-mesh-bvh`, Playwright als Dev-Tooling. `vite.config.ts` hat `base: './'` (GitHub-Pages-Unterordner-tauglich).
- **Fertig:** Renderstack (ACES, HDRI-IBL, PCFSoft-Schatten, N8AO, Bloom, SMAA, Vignette, Grading, Fog), komplettes Dorf (Taverne = Primär-Landmark, Wachturm = Sekundär-Landmark, 3 Cottages, Wegenetz, ~300 Natur-Props, 2 Silhouetten-Baumringe), spielbarer Charakter (Idle/Walk/Run, Kamera-Kollision, Capsule-Kollision), NPC, interaktive Tavernentür („E — Tür öffnen"), Pollen/Rauch/Pflanzen-Sway, GPU-Instancing für alle wiederholten Props (`engine/instanced.ts`, seit v0.4), Startscreen mit SPIELEN-Button (Version-Tag unten rechts: „Emberwick Vale v0.5"). **Seit v0.5:** möbliertes Taverneninterieur (KayKit-Dungeon-Props ×0.7, flackerndes Kaminlicht, Türfackeln, Decke), Map auf ~96 m (Baumringe 42–51/56–68 m, Zusatz-Scatter NUR angehängt — innere RNG-Sequenz unangetastet!), 3 äsende Rehe mit Graze/Wander/Flee-Verhalten (`engine/creature.ts`) auf der NW-Wiese, schlafendes Skelett-Lager (KayKit Mage/Warrior + Knochenhaufen) am SO-Waldrand. Weitere Gegner (Wolf, Fox, Yeti, Orc, Skeleton_Rogue) liegen fertig animiert in `asset_staging/quaternius/ual_characters_moorfall/.../enemies/`.
- **Qualität verifiziert:** 21 dokumentierte Screenshot-Iterationen (`docs/PROJECT_STATE.md`), Bake-off-Entscheidung mit Scores (`docs/VISUAL_SPEC.md`), automatisierter Playtest, Production-Build ohne Konsolenfehler, **100 fps auf RTX 4080 @1080p** (822 Draw Calls idle; ~1,08M Tris gerendert, da Instanzgruppen als Ganzes cullen). 7 benannte Shots (neu: `tavern_interior`, `deer_meadow`, `skeleton_camp`).
- **Assets:** alles CC0, dokumentiert in `docs/ASSET_MANIFEST.md`. `public/assets` ist auf 121 MB gepruned; alles Entfernte liegt wiederherstellbar in `asset_staging/pruned/` (gitignored). Vollständige Original-Packs in `asset_staging/`.

## Architektur (SSOT beachten — siehe CLAUDE.md im Repo-Root)

- `src/config.ts` — ALLE Tunables (Atmosphäre, Post, Player, Kamera, Shots, Version)
- `src/engine/` — `stage.ts` (Renderer+Composer+Sonne+Sky), `assets.ts` (Loader inkl. DRACO/KTX2/Meshopt, `pbrMaterial()`), `sky.ts` (Gradient-Dome-Shader), `collision.ts` (BVH-Collider), `character.ts` (`compositeCharacter()` + Clip-Matching + `playClip()` für exakte Clip-Namen), `creature.ts` (`Wanderer` — Graze/Walk/Flee), `kit.ts` (Kit-Piece-Loader mit Cache), `instanced.ts` (`InstancePool` — wiederholte Props als InstancedMesh, Sway via Matrix-Update; Layout-RNG-Stream bleibt getrennt vom Phasen-RNG!), `particles.ts`, `smoke.ts`, `patch.ts` (Dirt-Patches), `interact.ts`
- `src/scenes/world.ts` — das Dorf (parametrische Gebäude via `row()`/`sides()`/`hangDoor()`); `vignette_medieval.ts`, `kittest.ts`, `test.ts` (Dev-Szenen via `?scene=`)
- `src/player/` — `input.ts`, `thirdperson.ts` (Orbit-Rig + Locomotion)
- `src/data/measurements_*.json` — vermessene Bounding-Boxes aller Kit-Pieces (von `tools/measure.mjs`, kann jetzt auch GLB). ACHTUNG: KayKit-Möbel ~1,4× zu groß (`TAVERN.furnitureScale` 0.7), Deer-Rohexport 4,3 m hoch (Scale 0.4), Skelette 2,6 m (Scale 0.7)
- `tools/` — `screenshot.mjs` (Screenshot-Loop), `playtest.mjs [--headed]`, `perftest.mjs` (headed GPU-Messung), `smoketest_dist.mjs`, `prune.mjs`, `measure.mjs`, `probe.mjs`

## Kritisches Wissen (teuer erarbeitet — nicht neu entdecken)

1. **Dach-Naming:** `Roof_RoundTiles_6x4` = Giebelbreite(X)×Firstlänge(Z); Ursprung am Giebelende → Z-Shift −2.36 zum Zentrieren; Giebel sind OFFEN → `Roof_Front_Brick6` mit Scale `[0.985, 1.116, 1]` als Giebelwand (Konstante `GABLE` in world.ts).
2. **Quaternius-Outfits sind kopflos.** Charakter = Basis (`Superhero_Male/Female.glb`, hat Kopf) + Outfit + Haar via `compositeCharacter()` auf EIN Skelett gebunden; `UAL1.glb`-Clips (`Idle_Loop`, `Walk_Loop`, `Jog_Fwd_Loop`) treiben alle Universal-Rigs ohne Retargeting.
3. **`Wall_Plaster_WoodGrid` ist ein offenes Gitter** — nie als Außenwand verwenden.
4. **Boden-Washout:** Photo-Grass + PBR-Sheen bei flachem Winkel → beim Ground `roughnessMap = null`, `envMapIntensity 0.35`, Tint `0x76914f`. Nicht rückgängig machen.
5. **HDRI (`spruit_sunrise`) NUR als `scene.environment`** — sie enthält Strommasten; sichtbarer Himmel ist der Sky-Dome-Shader (`engine/sky.ts`), Farben in `ATMOSPHERE.sky`.
6. **Physik-Robustheit:** Frame-dt geclampt auf 0.1 s (main.ts), Ground-Ray mit High-Origin-Recovery, Capsule-Substepping (≤ radius/2 pro Schritt), Türen via `userData.noCollide` aus dem statischen Collider ausgeschlossen. Grund: Spieler fiel sonst durch die Welt / durch dünne Türen.
7. **Screenshot-Loop:** App setzt `window.__gameReady`, Kameras via `window.__setShot(name)` (Liste SSOT in config/Szene). Headless Chromium rendert hier mit **SwiftShader (seit Instancing ~12 fps, Software!)** — echte Performance nur headed messen (`node tools/perftest.mjs`). `window.__stats()` liefert fps/calls/tris.
8. **OneDrive-Pfad:** Das Read-Tool kann veraltete Snapshots liefern — vor Edits im Zweifel mit `cat`/`grep` verifizieren.
9. **Niemals visuelle Qualität aus Code ableiten** — nach jeder sichtbaren Änderung `npm run shots` (oder `--scene`-Variante) und die PNGs ansehen; Erkenntnisse in `docs/PROJECT_STATE.md` datiert nachtragen.

## Befehle

```bash
npm run dev        # http://127.0.0.1:5173  (NICHT index.html doppelklicken — file:// zeigt Fehlermeldung)
npm run build      # tsc --noEmit + vite build -> dist/
npm run preview    # dist/ servieren
npm run shots      # Screenshot-Loop -> docs/screenshots/
```

## Offen / bekannte Grenzen

- **Nicht committed/gepusht.** Das Repo ist die GitHub-Pages-Site des Users (`noahmasterball.github.io`); `dist/` ist gitignored. Für ein Online-Deploy: Build-Output committen (z. B. als Unterordner) oder GitHub Action — nur auf ausdrücklichen Wunsch des Users pushen.
- Nur die Taverne hat ein Interieur; kein Audio; flaches Terrain; Skelette sind schlafendes Set-Dressing (Kampf-Clips inkl. `Skeletons_Awaken_Floor` liegen bereit); Rehe ignorieren gescatterte Props beim Wandern. Stilregel (Manifest): KayKit-Gegner nur am nebelverhangenen Waldrand, nie im Frame mit Quaternius-Dorfbewohnern.
- Empfohlene nächste Phase (README): NPC-Dialog, Taverneninterieur, Tag/Nacht-Zyklus über den Sky-Dome, Ambient-Audio.

Lies vor der ersten Änderung: `README.md`, `docs/VISUAL_SPEC.md` (Nordstern: `docs/screenshots/iter17_opening_final.png`), `docs/PROJECT_STATE.md` (letzte Einträge) und `CLAUDE.md` (SSOT-Regeln). Arbeite asset-first, halte den Quaternius-Stil rein (keine fremden Charakter-Familien) und dokumentiere jede visuelle Iteration.

**Aufgabe:** [HIER DEIN AUFTRAG]

---
