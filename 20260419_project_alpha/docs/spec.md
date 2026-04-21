# Project Alpha — Master Spec

Post-apokalyptisches 3D-Survival-Spiel im Browser.

## Vision (vom Besitzer formuliert)

Du spielst in einer verlassenen, post-apokalyptischen Welt. Tagsüber erkundest du, sammelst Essen/Trinken/Waffen aus Gebäuden, erledigst ein Level-Objective. Nachts kommen Monster raus und jagen dich — pro überlebter Nacht wird es schwerer (neuer Monster-Typ). Hast du das Level-Objective erfüllt und eine Nacht überlebt → Map-Change ins nächste Level mit neuem Objective und neuem Monster-Pool.

## Harte Design-Prinzipien

1. **SSoT.** Alle Konstanten in `src/js/config/constants.js`. Alle Enums in `src/js/config/enums.js`. Kein Wert wird zweimal hardcoded.
2. **Ein Eigentümer pro Datum.** Player-Stats liegen im Player. Inventar im Player. Monster-Liste im Spawner. HUD liest, schreibt aber nicht.
3. **README ist SSoT für "Was existiert".** Code ohne README-Eintrag gilt als nicht existent.
4. **Pattern-Konsistenz.** Erst bestehende Module grep-en, dann schreiben. Keine neuen Patterns für bereits gelöste Probleme.
5. **Vanilla ES-Modules.** Keine Build-Tools. Imports via relative Pfade + Three.js-Importmap.

## Systeme (High-Level)

| System       | Owner-Modul                         | Abhängigkeiten            |
|--------------|-------------------------------------|---------------------------|
| Renderer     | `core/renderer.js`                  | Three.js                  |
| Input        | `core/input.js`                     | -                         |
| Clock        | `core/clock.js`                     | constants                 |
| Player       | `entities/player.js`                | input, renderer, clock    |
| World/Map    | `world/map-generator.js`            | constants, enums          |
| Buildings    | `world/buildings.js`                | map-generator, enums      |
| Alarms       | `world/alarms.js`                   | buildings, monster-spawner|
| Monsters     | `entities/monsters.js` + spawner    | player, clock, world      |
| Inventory    | `items/inventory.js`                | player, enums             |
| Food/Drink   | `items/food.js`                     | inventory, player         |
| Weapons      | `items/weapons.js`                  | inventory, monsters       |
| Pickups      | `items/pickups.js`                  | world, inventory          |
| Level-Mgr    | `levels/level-manager.js`           | objectives, world         |
| Objectives   | `levels/objectives.js`              | world, inventory          |
| HUD          | `ui/hud.js`                         | player, inventory, clock  |
| Menu/Overlay | `ui/menu.js` / `ui/overlay.js`      | game                      |

## Game-Loop (Hauptschleife in `core/game.js`)

```
jeden Frame:
  dt = clock.tickReal()
  input.sample()
  player.update(dt, input, world)
  monsterSpawner.update(dt, clock, player)
  monsters.forEach(m => m.update(dt, player, world))
  clock.tickGame(dt)                 // Tag/Nacht-Phase, Night-Counter
  levelManager.checkObjective(player, world)
  renderer.render(scene, player.camera)
  hud.update(player, clock, levelManager)
```

## Batch-Plan

Alle Batches sind so geschnitten, dass sie in einem frischen Kontextfenster von ~200k Tokens mit SSoT-Disziplin erledigbar sind. Reihenfolge ist verbindlich — spätere Batches bauen auf früheren auf.

| # | Batch                | File                                 | Kontext | Status     |
|---|----------------------|--------------------------------------|---------|------------|
| 1 | Foundation           | `docs/batches/batch-01-foundation.md`| dieser  | ERLEDIGT   |
| 2 | World-Gen            | `docs/batches/batch-02-world-gen.md` | neu     | ERLEDIGT   |
| 3 | Inventory + Hotbar   | `docs/batches/batch-03-inventory.md` | neu     | ERLEDIGT   |
| 4 | Food/Drink + Stats   | `docs/batches/batch-04-consumption.md`| neu    | ERLEDIGT   |
| 5 | Weapons              | `docs/batches/batch-05-weapons.md`   | neu     | ERLEDIGT   |
| 6 | Monsters + Nights    | `docs/batches/batch-06-monsters.md`  | neu     | offen      |
| 7 | Alarms               | `docs/batches/batch-07-alarms.md`    | neu     | offen      |
| 8 | Level-System         | `docs/batches/batch-08-levels.md`    | neu     | offen      |
| 9 | Polish + Save        | `docs/batches/batch-09-polish.md`    | neu     | offen      |

### Empfohlener Arbeitsmodus für Folge-Batches

1. Neues Claude-Kontextfenster öffnen.
2. Prompt: *"Lies `README.md`, dann `docs/spec.md`, dann `docs/batches/batch-XX-*.md`. Implementiere diesen Batch vollständig gemäß SSoT. Aktualisiere README am Ende."*
3. Beim Abschluss: README + Batch-Status in dieser Tabelle auf `ERLEDIGT` setzen.

## Gameplay-Details (für Referenz über Batches hinweg)

### Tag/Nacht
- Ein voller Tag = `CLOCK.DAY_LENGTH_SEC` (Default 480s = 8 min).
- Phasen: Dawn (5%) → Day (40%) → Dusk (5%) → Night (50%).
- Monster spawnen nur in Night.
- Night-Counter erhöht sich bei Übergang Dusk→Night.

### Monster-Progression
- Nacht 1: "Stalker" — langsam, leise, aber gruselig; hoher Schaden aus Nähe.
- Nacht 2: "Sprinter" — schnell, niedrig-HP, jagen in Gruppen.
- Nacht 3: "Brute" — groß, langsam, viel HP, hoher Schaden.
- Nacht 4+: Mischungen + neue Exoten (Kreativität der Zukunft überlassen — in `entities/monsters.js` als Enum dazu).
- Pro Nacht steigt auch die Spawn-Anzahl (Basis-Formel in constants).

### Inventar + Hotbar
- 8 Slots, nummeriert 1-8.
- Select via Zifferntaste oder Mausrad.
- `E` oder hold-Use-Taste zum Aufnehmen; für Consumables hold-to-consume (Progress-Bar am Cursor).
- `Q` dropt das aktive Item als World-Pickup vor dem Player.
- Left-Click = aktives Item benutzen (Waffe schießt / Consumable trinkt/isst / Keycard nutzt).
- Heavy-Weapons (z.B. MG) belegen Flag `occupiesHeavySlot` — nur eines davon gleichzeitig tragbar.

### Level-Objectives (Beispiele)
- Level 1: Finde 4 Reifen in Garagen/Tankstellen → am Auto montieren → einsteigen → Map-Change.
- Level 2: Finde U-Bahn-Keycard in Security-Office → Subway-Entrance freischalten → Map-Change.
- Level 3+: Kreativer Ermessensspielraum (Funkturm, Helikopter, Boot …). In `levels/objectives.js` als registrierte Objectives eintragen.

### Alarmanlagen
- Bestimmte Gebäude (Shops, Tankstellen-Office) haben Alarme an Türen/Fenstern.
- Betreten löst Alarm aus → sichtbares Blinklicht + Sound.
- Während der nächsten `ALARM.MONSTER_AGGRO_SEC` spawnen Monster bevorzugt an dieser Position.

## Nicht-Ziele (explizit out of scope)

- Multiplayer.
- Online-Highscore / Backend.
- Fortgeschrittene Physik (Rigid-Body-Sim). Kollision bleibt simpel (AABB / Ground-Plane).
- Realistische 3D-Assets. Erstmal Low-Poly-Platzhalter aus Three.js-Primitives.
