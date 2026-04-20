# Batch 2 — World Generation

**Status:** ERLEDIGT.

## Scope

Prozedurale Karte mit Buildings, Biomes (Meadow, Street) und Transition-Zonen. Flache Ground-Plane aus Batch 1 ersetzen.

## Regeln des Auftraggebers

> "Die Map komplett random generiert, es soll verschiedene Gebäudearten geben, es soll auch so kleine Flächen geben, wo halt einfach nur eine Wiese ist zum Beispiel, aber die Übergänge sollen jetzt nicht Haus und direkt daneben eine Wiese, also es soll ein kleiner Übergang vielleicht sein, so eine Straße."

→ Kein hartes `Haus│Wiese`. Zwischen Gebäuden und Wiesen liegt immer eine Street-/Sidewalk-Zone.

## Deliverables

- `src/js/world/map-generator.js` — Haupt-Generator. Nimmt seed, liefert `WorldChunkData { buildings, streets, meadows, spawnPoint }`.
- `src/js/world/buildings.js` — Building-Templates (House, GasStation, Shop, Garage, Ruin, SecurityOffice). Jedes Template erzeugt Mesh + Metadaten (type, footprint, entries, lootTable-Key, hasAlarm).
- `src/js/world/biomes.js` — Meadow-Tile-Generator (Grass-Textur + Scatter von Sträuchern/Steinen via Three.js-Instanced-Mesh).
- `src/js/world/transitions.js` — erzeugt Street-/Sidewalk-Polygone zwischen Buildings und Meadows. Garantiert Min-Abstand.
- `src/js/world/world.js` — orchestriert Build: kombiniert map-generator-Output zu Meshes in der Scene, stellt Queries bereit (`getBuildingsInRadius`, `raycastGround`).

## Enums-Ergänzung (`src/js/config/enums.js`)

```js
export const BuildingType = Object.freeze({
  HOUSE: 'house', GAS_STATION: 'gas_station', SHOP: 'shop',
  GARAGE: 'garage', RUIN: 'ruin', SECURITY_OFFICE: 'security_office',
});
export const BiomeType = Object.freeze({ MEADOW: 'meadow', STREET: 'street', SIDEWALK: 'sidewalk' });
```

## Konstanten-Ergänzung (`constants.js` → `WORLD` erweitern)

- `WORLD.MAP_SIZE` — Default 400 (Meter, Quadrat).
- `WORLD.CHUNK_GRID` — z.B. 10×10 Zellen.
- `WORLD.BUILDING_DENSITY` — 0..1, Anteil der Zellen mit Gebäude.
- `WORLD.MIN_BUILDING_SPACING` — Meter.
- `WORLD.STREET_WIDTH` — Meter.
- `WORLD.MEADOW_SCATTER_COUNT` — Sträucher/Steine pro Meadow-Tile.

## Algorithmus (empfohlen)

1. Zellen-Grid über MAP_SIZE legen.
2. Per Poisson-Disk oder Noise jede Zelle als `BUILDING | MEADOW | EMPTY` labeln (mit MIN_SPACING).
3. Nachbarschaftsregel: für jede BUILDING-Zelle, prüfe 8-Nachbarn. Wenn direkter Nachbar MEADOW → zwischen beide eine SIDEWALK-Zone einziehen (1 Tile breit).
4. STREET-Netz entlang der Haupt-Achsen des Grids, das alle BUILDING-Zellen verbindet (simple Minimum-Spanning-Tree oder Grid-Grid-Pfade).
5. Buildings platzieren: Template zufällig wählen, Rotation 0/90/180/270°, Footprint prüfen.
6. Scene füllen (merged / instanced wo möglich).

## Abnahme-Kriterien

- [x] Beim Start wird eine andere Map erzeugt (Seed = `Date.now()`, Reload → neue Map).
- [x] Mindestens 3 verschiedene Building-Typen sichtbar (Smoke-Test auf Seed 42: alle 6 Typen auftretend), keine Überlappung (Min-Spacing-Enforcement).
- [x] Keine direkte Haus↔Meadow-Kante: jede Zelle von Street umrandet, jedes Gebäude von Sidewalk.
- [x] Meadow-Zonen haben Scatter-Objekte (InstancedMesh Sträucher + Steine).
- [x] Player-Spawn ist die Zentrums-Kreuzung (0, 0) — garantiert auf einer Street.
- [x] Keine hardcoded Zahlen in den Batch-2-Dateien — alles aus `WORLD`, `COLORS`, `BUILDINGS` in `constants.js`.

## Post-Update

- README "Projektstruktur" um neue Files erweitern.
- README "Features (implementiert)" Batch 2 eintragen.
- `docs/spec.md` Tabelle: Batch 2 → ERLEDIGT.
