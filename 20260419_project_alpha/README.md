# Project Alpha — Post-Apocalyptic 3D Survival

Ein 3D-Survivalspiel im Browser. Tag/Nacht-Zyklus, prozedural generierte Karte, Monster-Wellen in der Nacht, Inventar + Hotbar, Waffen, Essen/Trinken, und ein Level-System mit Objectives (Auto-Reifen finden → Subway-Keycard → ...).

Stack: Three.js (ES-Modules via CDN-Importmap), Vanilla JS/CSS. Keine Build-Tools — läuft direkt über `index.html` auf GitHub Pages.

---

## PFLICHT: README-Update bei jeder Änderung

**Jede Änderung am Projekt muss in dieser README dokumentiert werden, bevor der Task als erledigt markiert wird.** Dazu gehören:

- Neue Dateien → in "Projektstruktur" eintragen mit Einzeiler-Zweck.
- Neue Konstanten in `src/js/config/constants.js` → in "Zentrale Konstanten" erwähnen (Kategorie reicht, nicht jeden Wert).
- Neue Features / Systeme → in "Features (implementiert)" eintragen; offene in "Features (geplant)" streichen oder verschieben.
- Neue Controls / Keybinds → in "Controls" eintragen.
- Neue externe Dependency (CDN) → in "Dependencies" eintragen.

**Wer das überspringt, bricht SSoT** — die README ist die Single Source of Truth für das, was es gibt. Code ohne README-Eintrag gilt als nicht existent.

Beim Start einer neuen Claude-Session: **Immer zuerst README lesen**, dann Spec-Files unter `docs/batches/` für den aktiven Batch.

---

## Projektstruktur

```
20260419_project_alpha/
├── README.md                      ← Dieses Dokument. Bei jeder Änderung pflegen.
├── index.html                     ← Einstiegspunkt, lädt CSS + JS-Module, Canvas + HUD-Markup.
├── src/
│   ├── css/
│   │   ├── reset.css              ← Baseline-Reset (margin/padding/box-sizing).
│   │   ├── main.css               ← Root-Variablen (Farbpalette, Spacings), Body-Layout.
│   │   └── hud.css                ← Hotbar, Stat-Bars (Essen/Trinken/Health), Crosshair.
│   ├── js/
│   │   ├── main.js                ← Bootstraps Game, startet Loop.
│   │   ├── config/
│   │   │   ├── constants.js       ← ZENTRALE SSoT: alle Tunables (Speed, Hotbar-Size, Timings, Farben …).
│   │   │   └── enums.js           ← Enums: BuildingType, BiomeType, ItemType, ItemId, MonsterType, Phase, ObjectiveType.
│   │   ├── core/
│   │   │   ├── game.js            ← Hauptschleife, Orchestrator, State-Management.
│   │   │   ├── renderer.js        ← Three.js-Wrapper: Scene, Camera, Renderer, Lights.
│   │   │   ├── input.js           ← Keyboard + Maus, Pointer-Lock, Hotkeys.
│   │   │   ├── clock.js           ← Tag/Nacht-Zyklus, Uhrzeit, Tageszeit-Phasen.
│   │   │   └── hit-scan.js        ← [Batch 5] THREE.Raycaster-Wrapper + TracerManager (Tracer- & Muzzle-Flash-Lifetime).
│   │   ├── world/                 ← Map-Gen, Buildings, Biomes, Transitions, World-Orchestrator.
│   │   │   ├── map-generator.js   ← Seeded Data-Gen: Zellen-Grid, Buildings, Meadows, SpawnPoint. Exportiert auch Mulberry32-RNG.
│   │   │   ├── buildings.js       ← Baut Building-Meshes (Wände + Dach) aus Map-Gen-Daten.
│   │   │   ├── biomes.js          ← Meadow-Base-Plane + Scatter (Sträucher/Steine) via InstancedMesh.
│   │   │   ├── transitions.js     ← Straßen-Grid + Sidewalk-Ringe um Gebäude.
│   │   │   └── world.js           ← Orchestrator: kombiniert alles zu Meshes, liefert Queries (getBuildingsInRadius, raycastGround).
│   │   ├── entities/              ← [Batch 6] Monster + Spawner. Player liegt hier (aktiv).
│   │   │   ├── player.js          ← Player-Controller (Movement, Look, Jump, Gravity).
│   │   │   └── dummy-target.js    ← [Batch 5] Test-Dummy am Spawn (Mesh + HP + Hit-Tint). Wird von Batch 6 durch echte Monster ersetzt.
│   │   ├── items/                 ← [Batch 3+] Inventar, Items, World-Pickups.
│   │   │   ├── item.js            ← createItem + Default-MaxStack/Stackable-Regeln. [Batch 5] `runtime`/`onAutoFire` für Waffen.
│   │   │   ├── item-registry.js   ← SSoT aller Item-Prototypen (Snack, Pistol, Tire, …).
│   │   │   ├── inventory.js       ← 8-Slot-Inventory: addItem, dropActive, useActive, tickActiveHold, tickActiveFire, startActiveReload, tickWeaponState, setActive, cycle.
│   │   │   ├── pickups.js         ← World-Pickup-Meshes + hold-to-pick-up Progress, Drop-vor-Player.
│   │   │   ├── food.js            ← [Batch 4] makeConsumeUse-Factory — liest CONSUMABLES-Deltas aus constants.js.
│   │   │   ├── weapons.js         ← [Batch 5] makeWeaponUse/makeWeaponAutoFire-Factory + Reload-Logik — liest WEAPONS aus constants.js.
│   │   │   └── ammo.js            ← [Batch 5] Reserve-Zähler (getReserve / consumeFromReserve) über Inventory-Slots. Kein eigenes Stacking.
│   │   ├── ui/                    ← HUD, Menüs, Overlays.
│   │   │   └── hud.js             ← Rendert Hotbar (Icons/Names/Counts) + Stat-Bars + Pickup-Ring.
│   │   └── levels/                ← [Batch 8] Level-Manager + Objectives.
│   └── assets/                    ← Texturen, Modelle, Sounds (derzeit leer).
└── docs/
    ├── spec.md                    ← Master-Spec: Vision, Systeme, Batches-Übersicht.
    └── batches/
        ├── batch-01-foundation.md  ← [ERLEDIGT]
        ├── batch-02-world-gen.md   ← [ERLEDIGT] Procedural Map, Buildings, Biomes, Transitions.
        ├── batch-03-inventory.md   ← [ERLEDIGT] Hotbar, 8 Slots, Pickup/Drop/Use, Q/Click.
        ├── batch-04-consumption.md ← [ERLEDIGT] Food/Drink (hold-to-consume), Hunger/Thirst/Health-Decay + Regen.
        ├── batch-05-weapons.md     ← [ERLEDIGT] Nahkampf, Schusswaffen, Heavy-Weapon-MG, Reload, Tracer/Muzzle-Flash, Dummy-Target.
        ├── batch-06-monsters.md    ← Monster-AI, Nacht-Wellen, Night-Counter, Monster-Typen.
        ├── batch-07-alarms.md      ← Alarmanlagen in Shops, Monster-Aggro-Stacking.
        ├── batch-08-levels.md      ← Level-Progression, Objectives (Reifen, Keycard …), Map-Change.
        └── batch-09-polish.md      ← Menüs, Death-Screen, Sounds, Save/Load.
```

---

## Features (implementiert)

### Batch 1 — Foundation
- Three.js Scene mit Renderer, Perspektive-Kamera, Ambient + Directional Light.
- First-Person-Player-Controller: WASD-Movement, Mouse-Look (Pointer-Lock), Sprung, Gravitation, Ground-Collision gegen Plane.
- Tag/Nacht-Zyklus: Sonne bewegt sich über den Himmel, Himmel-Farbe + Licht-Intensität interpolieren zwischen Tag/Dawn/Dusk/Nacht. Night-Counter zählt mit.
- HUD-Skelett: Hotbar (8 Slots, leer) unten mittig, Health/Hunger/Thirst-Bars links, Uhrzeit + Night-Counter oben rechts.
- Central SSoT (`constants.js`): alle Tunables an einem Ort.

### Batch 2 — World Generation
- Prozedurale Map (`WORLD.MAP_SIZE` × `WORLD.MAP_SIZE` m), seed-basiert — Reload = neue Map. Seed aus `Date.now()`, optional über `new Game(canvas, { seed }).` überschreibbar.
- Zellen-Grid (`WORLD.CHUNK_GRID` × `WORLD.CHUNK_GRID`), jede Zelle ist entweder Building oder Meadow (Anteil über `WORLD.BUILDING_DENSITY`).
- 6 Building-Typen via gewichteter Auswahl: House, Gas-Station, Shop, Garage, Ruin, Security-Office. Maße/Farben/Alarm-Flags pro Typ in `BUILDINGS`-Konstantenblock.
- Straßen-Grid an allen Zellgrenzen + Sidewalk-Ringe um jedes Gebäude → garantiert kein direkter Haus↔Meadow-Kontakt.
- Meadow-Scatter: Sträucher (Icosahedron) und Steine (Box) via InstancedMesh, deterministisch pro Meadow-Zelle.
- Min-Spacing-Enforcement zwischen Gebäuden.
- Player spawnt auf der Zentrums-Kreuzung — garantiert auf einer Street.
- `World` liefert Queries: `getBuildingsInRadius(pos, r)`, `raycastGround(x, z)`, `spawnPoint`.

### Batch 3 — Inventory + Hotbar
- 8-Slot-Inventar im Player-Ownership. HUD liest, schreibt nie zurück.
- Item-Prototypen zentral im `item-registry`: Snack, Wasserflasche, Baseballschläger, Pistole, Schrotflinte, MG, 3 Ammo-Typen, Autoreifen, U-Bahn-Keycard.
- Stackable-Regeln: Food/Drink stacken bis `ITEMS.DEFAULT_MAX_STACK_CONSUMABLE`, Ammo bis `…_AMMO`, Rest 1.
- World-Pickups: kleine farbige Würfel mit Bob/Spin-Animation, deterministische Test-Spawns rund um den Player-Spawn.
- Pickup-Flow: `E` halten für `HOTBAR.PICKUP_HOLD_SEC`; Fortschrittsring ums Crosshair zeigt Progress + Item-Label.
- Drop (`Q`): aktives Item wird vor dem Spieler (`HOTBAR.DROP_FORWARD_M`) neu als Pickup gespawnt.
- Heavy-Regel: nur ein `heavy`-Item gleichzeitig (z.B. MG). Zweites Heavy-Pickup wird abgelehnt → Hotbar-Warn-Flash.
- Slot-Wechsel: `1`-`8` oder Mausrad; kurze `HOTBAR.SWITCH_COOLDOWN_SEC` verhindert Spam.
- Left-Click ruft `inventory.useActive()` — in Batch 3 No-Op-Durchreiche, Batch 4/5 füllen `onUse`.

### Batch 5 — Weapons
- 4 Waffen-Prototypen: Baseballschläger (Nahkampf-Fan, `MELEE.ARC_RAYS` Rays im `MELEE.ARC_DEG`-Winkel), Pistole (Single-Shot, 12-Mag), Schrotflinte (Single-Shot, 8-Pellet-Fan, 6-Mag), Maschinengewehr (Full-Auto, 60-Mag, `heavy: true` → nur 1× tragbar).
- Fire-Pipeline: `items/weapons.js:makeWeaponUse(itemId)` baut aus `WEAPONS`-Daten pro ID einen onUse-Handler (Single-Shot) und — nur für `fullAuto`-Waffen — aus `makeWeaponAutoFire(itemId)` einen onAutoFire-Handler. Rising-Edge-Klick läuft über `Inventory.useActive`; Full-Auto läuft pro Frame über `Inventory.tickActiveFire` mit Rate-Limiter (`WEAPONS.*.fireRate` Shots/Sek).
- Hit-Scan in `core/hit-scan.js`: dünner Wrapper um `THREE.Raycaster`. Targets = Dummy-Meshes (tragen `userData.hpOwner`) + `world.root` (stoppt Tracer an Wänden). Liefert `{ mesh, hpOwner, point, distance }` oder `null`.
- Reload mit `R`: startet, wenn aktive Waffe nachladbar und Reserve > 0 ist. Reload-Timer in `item.runtime.reloadTimer`. Beim Abschluss wird die Reserve über `items/ammo.js:consumeFromReserve` dekrementiert (Summe über alle Inventory-Slots gleicher Ammo-ID — kein eigenes Stacking, Inventory.addItem macht weiterhin das Stacking).
- Shared Visuals via `core/hit-scan.js:TracerManager`: Tracer sind kurze `THREE.Line`-Segmente, Mündungsfeuer ein kleines additiv gezeichnetes Quad. Beide mit TTL aus `WEAPON_VFX`.
- Dummy-Target (`entities/dummy-target.js`): gelber Würfel am Spawn (`DUMMY_TARGET.SPAWN_DX/DZ`) mit HP, Hit-Tint beim Treffer, färbt sich bei 0 HP dunkel. Pure Test-Aid — Batch 6 liefert echte Monster.
- HUD-Erweiterung: Ammo-Counter unten rechts (mag/reserve; nur bei aktiver Schusswaffe sichtbar; blau während Reload, rot bei leerem Magazin). Dritter Progress-Ring (Reload) ums Crosshair — shared `.progress-ring` Basis-Klasse, eigene Farbvariable `--reload-ring`.

### Batch 4 — Consumption + Stats
- 5 Consumable-Prototypen: Snack, Dosensuppe, Wasserflasche, Limodose, Schmerzmittel (ItemIds aus Batch 3 weiter genutzt, nur neue ergänzt — kein Rename).
- Hold-to-Consume: Left-Click halten auf aktivem FOOD/DRINK-Slot → `HOTBAR.CONSUME_HOLD_SEC`-Ring ums Crosshair (grün, parallel zum gelben Pickup-Ring). Loslassen vor Ende bricht ab, Item bleibt.
- Pro Item `{ hungerDelta, thirstDelta, healthDelta }` in `CONSUMABLES`-Block (constants.js). `items/food.js:makeConsumeUse(itemId)` baut daraus den onUse-Handler; item-registry bindet ihn pro Prototyp ein.
- Passiver Stat-Tick in `Player.tickStats(dt)`: Hunger/Thirst sinken mit `STATS.HUNGER_DECAY` / `STATS.THIRST_DECAY` pro Sekunde. Bei Hunger oder Thirst == 0 → Health sinkt mit `STATS.STARVE_DAMAGE`. Bei Hunger > 50 und Thirst > 50 → Health regeneriert mit `STATS.HEALTH_REGEN`. Nur wenn Pointer-Lock aktiv (gleiche Pausenregel wie Clock/World).
- HUD: Stat-Bars leben live, Warn-Tint (gelb) bei < `STATS.LOW_STAT_WARN_PCT`. Zweiter Consume-Progress-Ring via gemeinsamer CSS-Klasse `.progress-ring` mit farbvariable `--ring-color`.
- Death-Screen-Hook als TODO in `Player.tickStats` — echter Screen kommt mit Batch 9.

## Features (geplant)

Siehe `docs/spec.md` für die vollständige Vision. Kurzfassung:

- **[Batch 6]** Monster: Nacht-Spawning, pro überlebter Nacht neuer Monster-Typ (gruselig-langsam → schnell → groß-tanky → ...).
- **[Batch 7]** Alarmanlagen in Shops: getriggerter Alarm zieht Monster heran, häuft Aggro an.
- **[Batch 8]** Level-System: jedes Level hat ein Objective (Reifen fürs Auto, U-Bahn-Keycard, …). Bei Objective + Nacht überlebt → Map-Change.
- **[Batch 9]** Polish: Main-Menu, Death-Screen, Sounds, Save/Load.

---

## Controls

| Input           | Action                                                |
|-----------------|-------------------------------------------------------|
| `W` `A` `S` `D` | Bewegung                                              |
| Maus            | Umschauen (Pointer-Lock, Klick ins Canvas aktiviert)  |
| `Space`         | Springen                                              |
| `Shift`         | Sprint *(geplant Batch 1.1 / mit Stamina in Batch 4)* |
| `1` - `8`       | Hotbar-Slot wählen                                    |
| Mausrad         | Hotbar-Slot durchcyclen                               |
| `Q`             | Aktives Item droppen (vor den Spieler legen)          |
| `E` (hold)      | Nähestes World-Pickup aufnehmen (0.6 s halten)        |
| Left-Click (hold) | Aktives Consumable verbrauchen (`HOTBAR.CONSUME_HOLD_SEC` halten, grüner Ring ums Crosshair) *(Batch 4)* |
| Left-Click      | Aktive Single-Shot-Waffe feuern (Pistole, Shotgun, Melee). Rate-limitiert über `WEAPONS.*.fireRate`. *(Batch 5)* |
| Left-Click (hold) | Aktives Full-Auto-MG dauerhaft feuern (10 Shots/Sek). Reload nötig, wenn Magazin leer. *(Batch 5)* |
| `R`             | Aktive Schusswaffe nachladen (blauer Reload-Ring ums Crosshair, zieht aus Inventory-Reserve). *(Batch 5)* |
| `ESC`           | Pointer-Lock verlassen / Menü *(Batch 9)*             |

---

## Zentrale Konstanten (`src/js/config/constants.js`)

**SSoT-Regel:** Alle Zahlen, Timings, Größen, Farben kommen HIER her. Niemals hardcoden. Grep vor jedem neuen Konstantenvorschlag.

Kategorien (siehe Datei für konkrete Werte):
- `WORLD` — Gravity, Spawn-Height, Map-Größe + Grid, Building-Dichte/Spacing, Street-/Sidewalk-Breite, Scatter-Parameter.
- `PLAYER` — Move-Speed, Jump-Velocity, Eye-Height, Look-Sensitivity.
- `HOTBAR` — Slot-Count (8), Slot-Size-px.
- `STATS` — Max-Health / Hunger / Thirst, Tick-Rates.
- `CLOCK` — Day-Length-Seconds, Phase-Schwellen (Dawn/Day/Dusk/Night), Sky-Colors pro Phase.
- `COLORS` — UI-Palette (HUD-Background, Bar-Fills, Warn-Tint) + Welt-Farben (Meadow, Street, Sidewalk, Bush, Stone).
- `BUILDINGS` — Pro BuildingType: Min/Max-Größe, Min/Max-Höhe, Wand-/Dach-Farbe, Alarm-Flag, Spawn-Gewicht.
- `ITEMS` — Default-Stackgrößen, Pickup-Mesh-Maße + Bob/Spin-Animation, Heavy-Warn-Dauer, Item-Farbpalette (FOOD/DRINK/WEAPON/AMMO/KEY/PART/MISC).
- `CONSUMABLES` — [Batch 4] Per-ItemId `{ hungerDelta, thirstDelta, healthDelta }` für alle Food/Drink-Prototypen. Single Source für `items/food.js:makeConsumeUse`.
- `STATS` (erweitert in Batch 4 genutzt) — Decay-Raten (HUNGER_DECAY, THIRST_DECAY), Starve-Damage, Health-Regen + Schwellen, `LOW_STAT_WARN_PCT` für HUD-Tint.
- `HOTBAR.CONSUME_HOLD_SEC` — Hold-Dauer für Left-Click-Consume.
- `COLORS.CONSUME_RING` / CSS `--consume-ring` — Farbe des zweiten Progress-Rings.
- `WEAPONS` — [Batch 5] Pro Waffe `{ damage, fireRate, magSize, reloadSec, range, spread, heavy, ammoType, fullAuto?, pellets? }`. Single Source für `items/weapons.js:makeWeaponUse` / `makeWeaponAutoFire`.
- `WEAPON_VFX` — [Batch 5] Tracer- und Muzzle-Flash-TTLs, Farben, Origin-Offsets. Geteilt von `core/hit-scan.js:TracerManager`.
- `MELEE` — [Batch 5] Fan-Ray-Anzahl und -Winkel für Nahkampf-Swings.
- `DUMMY_TARGET` — [Batch 5] HP, Mesh-Größe, Hit-Tint-Parameter und Spawn-Offset für `entities/dummy-target.js`. Test-Aid bis Batch 6.
- `COLORS.RELOAD_RING` / CSS `--reload-ring` — Farbe des dritten Progress-Rings.

---

## Dependencies (via CDN Import-Map)

| Package      | Version | Quelle                                           |
|--------------|---------|--------------------------------------------------|
| `three`      | 0.160.0 | unpkg.com (ES-Module)                            |

Keine Build-Pipeline. Im Browser öffnen = Spiel läuft (lokal am besten über einen lokalen Static-Server wegen ES-Module-CORS).

## Lokales Starten

```bash
# Variante 1 — Python
python -m http.server 8000
# dann http://localhost:8000/20260419_project_alpha/

# Variante 2 — Node (falls installiert)
npx serve .
```

GitHub Pages serviert das Ganze unter `https://noahmasterball.github.io/20260419_project_alpha/` direkt.

---

## Für zukünftige Claude-Sessions

1. **README lesen** (dieses Dokument).
2. **`docs/spec.md` lesen** für Projekt-Vision + Batch-Liste.
3. **Spec-File des aktuellen Batches** unter `docs/batches/batch-XX-*.md` lesen.
4. **`src/js/config/constants.js` lesen** — alle Tunables. Nicht duplizieren.
5. Arbeiten. Dann: README + Spec-File aktualisieren.
