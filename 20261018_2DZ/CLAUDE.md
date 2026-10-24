# CLAUDE.md — Rotland (Projektregeln)

Nur projektspezifische Regeln. Die Root-`CLAUDE.md` (SSOT, Konstanten an einem Ort, keine
Warnungs-Unterdrückung, kein stilles `catch`) gilt vollständig.

## Wo was liegt

| Was | Wo |
| --- | --- |
| Was existiert (Ids) + alle Def-Typen | `src/data/schema.ts` |
| Inhaltswerte (Tiles, Items, Rezepte, Zombies, Loot, Biome) | `src/data/*.ts` |
| Globale Sim-Regeln (Tick, Welt, Physik, Spieler, Wasser, Spawn, Tag/Nacht) | `src/config/sim.ts` |
| Render, Kamera, Tastenbelegung, HUD, Audio | `src/config/client.ts` |
| UI-Farben/Fonts | CSS-Variablen in `index.html` `:root` |
| Architektur, Systemreihenfolge, Modul-Eigentum | `docs/ARCHITECTURE.md` |
| Spieldesign | `docs/SPEC.md` |
| Stand / offene Punkte | `docs/PROJECT_STATE.md` |

Einheiten: Tiles, Sekunden, Tiles/s; y wächst nach unten; Body-(x,y) = linke obere Ecke.
Farben: `0xRRGGBB`.

## Harte Regeln

- Sim/Render-Grenze (ARCHITECTURE.md §2) — ESLint erzwingt sie, nicht aufweichen.
- Schreibzugriffe auf `fg`/`wall`/`liquid` nur über `src/sim/grid.ts` (`setTile`/`setWall`/`setLiquid`).
- Zufall in der Sim nur über `state.rng` bzw. einen aus dem Seed abgeleiteten RNG (`src/sim/rng.ts`).
- Relative Imports mit `.ts`-Endung, nur erasable TypeScript (kein `enum`/`namespace`),
  `import type` für Typen.
- Neues Sim-Verhalten bekommt einen Vitest-Test, der die echte Sim in Node laufen lässt.
- Keine Python-Edits (CRLF). Edit-Tool oder Node.

## Befehle

```bash
npm run dev        # http://127.0.0.1:5174/
npm test           # Vitest
npm run lint
npm run typecheck
npm run check      # lint + typecheck + unit + e2e — vor "fertig" ausführen
npm run deploy     # check, dann Build nach play/ kopieren
```

## Veröffentlichen

Sobald spielbar und `check` grün: `npm run deploy`, dann **nur** `20261018_2DZ/play/` committen
und nach `main` pushen → https://noahmasterball.github.io/20261018_2DZ/play/. Sonst nichts
committen, außer der User verlangt es.

## Checklisten

### Neues Tile
1. Id ans Ende von `TILE_IDS` (`schema.ts`).
2. `TileDef` in `src/data/tiles.ts` (TypeScript erzwingt es).
3. Abbaubar? `drop` auf ein Item; platzierbar? Item mit `places`.
4. `npm test` (validateContent).

### Neues Item / Rezept
1. Id in `ITEM_IDS` / `RECIPE_IDS`, Def in `items.ts` / `recipes.ts`.
2. Fundort: in eine Loot-Tabelle (`loot.ts`) oder als Rezept-Output.

### Neues Biom
1. Id in `BIOME_IDS`, Def in `biomes.ts` (Zonenbreite, Terrain, Strukturen, Loot, Zombies).
2. Strukturtyp neu? `STRUCTURE_KINDS` + Bauplan in `src/sim/worldgen/structures.ts`.
