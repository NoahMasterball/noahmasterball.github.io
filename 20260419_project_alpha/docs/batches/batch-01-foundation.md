# Batch 1 — Foundation

**Status:** ERLEDIGT (im Setup-Kontext).

## Scope

Projekt-Skelett + lauffähige Three.js-Szene mit First-Person-Player, Tag/Nacht-Zyklus und leerem HUD.

## Deliverables

- `index.html` — Canvas + HUD-Markup, lädt CSS + `src/js/main.js` als ES-Module.
- `src/css/reset.css`, `main.css`, `hud.css`.
- `src/js/config/constants.js` — SSoT aller Tunables.
- `src/js/config/enums.js` — leere Enums-Datei mit Struktur (wird von Folge-Batches befüllt).
- `src/js/core/renderer.js` — Three.js Scene/Camera/Renderer/Lights.
- `src/js/core/input.js` — Keyboard + Mouse + Pointer-Lock.
- `src/js/core/clock.js` — Game-Clock mit Phasen + Night-Counter.
- `src/js/entities/player.js` — First-Person-Controller (WASD, Look, Jump, Gravity, Ground-Collision).
- `src/js/ui/hud.js` — Bars + Hotbar-Slots (Platzhalter-State).
- `src/js/core/game.js` — Hauptschleife.
- `src/js/main.js` — Entry-Point.

## Erledigt (Abnahme-Kriterien)

- [x] `index.html` lädt im Browser ohne Konsolen-Fehler.
- [x] Flache Ground-Plane sichtbar (wird in Batch 2 ersetzt).
- [x] Klick ins Canvas aktiviert Pointer-Lock; WASD + Maus funktionieren; Space springt.
- [x] Himmel + Licht interpolieren Tag → Nacht über `CLOCK.DAY_LENGTH_SEC`.
- [x] HUD zeigt: Hotbar unten (8 Slots leer), Stats-Bars links, Uhrzeit + Night-Counter oben rechts.
- [x] Alle Zahlen kommen aus `constants.js`.

## Hinweise für Folge-Batches

- Player-Objekt exponiert: `position`, `velocity`, `camera`, `stats { health, hunger, thirst }` (Bars bereits an HUD gebunden, initial max).
- Clock exponiert: `phase` ("dawn"|"day"|"dusk"|"night"), `nightCount`, `timeOfDay01` (0..1), `timeString` (HH:MM).
- Renderer exponiert: `scene`, `camera` (wird vom Player gesetzt).
- Input exponiert: `isDown(keyCode)`, `mouseDelta`, `consumeMouseDelta()`.
- Game-State in `game.js` als einfaches Objekt — Level-Manager / Monster-Spawner hängen sich später ein.
