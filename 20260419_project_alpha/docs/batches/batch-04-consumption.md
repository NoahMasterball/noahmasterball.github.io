# Batch 4 — Food / Drink / Stats

**Status:** ERLEDIGT. Abhängig von Batch 3 (Inventory).

## Scope

Essen- und Trinksystem mit Stat-Bars, passivem Verbrauch, und Health-Regen-Logik.

## Regeln des Auftraggebers

> "Bei Essen oder Trinken muss man gedrückt halten kurz, um es aufzunehmen und dann wird links zum Beispiel so eine Bar mit Essen oder Trinken halt ein bisschen aufgefüllt."

Hinweis: "aufnehmen" ist hier als "konsumieren" zu verstehen — das Item wird beim Use benutzt, Bar füllt sich, Item verschwindet.

## Deliverables

- `src/js/items/food.js` — Food-/Drink-Item-Factories. Nutzt `item-registry.js`. Jedes Food/Drink hat `{ hungerDelta, thirstDelta, healthDelta }`.
- `src/js/entities/player.js` erweitern: `stats.tick(dt)` zieht pro Sekunde `STATS.HUNGER_DECAY` und `STATS.THIRST_DECAY` ab. Bei `hunger == 0 || thirst == 0` → `health` sinkt mit `STATS.STARVE_DAMAGE`.
- `src/js/items/inventory.js` erweitern: `useActive()` für Consumables führt hold-to-use aus. `HOTBAR.CONSUME_HOLD_SEC` lang halten → Item konsumiert, Stat-Delta angewendet. Abbrechen bei Loslassen.
- `src/js/ui/hud.js` erweitern: Stat-Bars füllen sich live, Warn-Tint bei <25%. Consume-Progress-Ring (wie Pickup, andere Farbe).

## Konstanten-Ergänzung

- `STATS.MAX_HEALTH` = 100.
- `STATS.MAX_HUNGER` = 100.
- `STATS.MAX_THIRST` = 100.
- `STATS.HUNGER_DECAY` = 0.35 /sec.
- `STATS.THIRST_DECAY` = 0.55 /sec.
- `STATS.STARVE_DAMAGE` = 1.5 /sec.
- `STATS.HEALTH_REGEN` = 0.8 /sec, nur wenn hunger > 50 && thirst > 50.
- `HOTBAR.CONSUME_HOLD_SEC` = 0.8.

## Beispiel-Items (im item-registry registrieren)

| id          | type   | hunger | thirst | health |
|-------------|--------|--------|--------|--------|
| `snack_bar` | FOOD   | +25    | 0      | 0      |
| `canned_soup`| FOOD  | +45    | +5     | 0      |
| `water_bottle`| DRINK| 0      | +50    | 0      |
| `soda_can`  | DRINK  | +5     | +30    | 0      |
| `painkillers`| FOOD  | 0      | 0      | +30    |

## Abnahme-Kriterien

- [x] Stats tickeln sichtbar runter. → `Player.tickStats(dt)` zieht `STATS.HUNGER_DECAY` / `STATS.THIRST_DECAY` pro Sekunde ab; HUD-Bars reagieren live.
- [x] Left-Click-hold auf Food-Item im aktiven Slot → Progress → Item weg, Bar steigt. → `Inventory.tickActiveHold` füllt Progress über `HOTBAR.CONSUME_HOLD_SEC`, ruft `_applyOnUse` → `makeConsumeUse(itemId)` wendet Deltas aus `CONSUMABLES` an, dekrementiert Stack.
- [x] Loslassen vor Ende → Abbruch, Item bleibt. → `tickActiveHold` setzt `_consumeTarget = null` und Progress = 0 bei `!holding`; `_applyOnUse` läuft nur bei Vollbild.
- [x] Warn-Tint bei <25% auf der betroffenen Bar. → `HUD._setBar` togglet `.warn` bei `clamped < STATS.LOW_STAT_WARN_PCT`; CSS `.stat-fill.warn` setzt `--bar-warn`.
- [x] Game-Over-Hook (TODO-Komment) bei health == 0 — echter Death-Screen ist Batch 9. → TODO-Zeile in `Player.tickStats`.

## Umsetzung (Ist-Stand)

Neue Files:
- `src/js/items/food.js` — `makeConsumeUse(itemId)`-Factory. Liest Deltas aus `CONSUMABLES` (constants.js) und baut einen onUse-Handler, der `{ consumed: true }` zurückgibt; Inventory dekrementiert daraufhin den Stack. Zusätzlich Hilfs-Exports `getConsumable`, `isConsumableId`.

Geänderte Files:
- `src/js/config/constants.js` — neuer `CONSUMABLES`-Block pro ItemId (SSoT analog zu `WEAPONS`). Neue Farbe `COLORS.CONSUME_RING`. Import von `ItemId` aus `enums.js` (kein Zirkular — enums.js importiert nichts).
- `src/js/config/enums.js` — `ItemId` ergänzt um `CANNED_SOUP`, `SODA_CAN`, `PAINKILLERS`. `SNACK` / `WATER_BOTTLE` bleiben unverändert — kein Rename.
- `src/js/items/item-registry.js` — Consumable-Prototypen bekommen `onUse: makeConsumeUse(ItemId)`; neue Prototypen für Dosensuppe, Limodose, Schmerzmittel registriert.
- `src/js/items/inventory.js` — `tickActiveHold(dt, holding, ctx)` (Hold-to-Consume parallel zu `pickups.tickHold`). `useActive` skippt Consumables, damit ein einzelner Klick nicht Essen verbraucht. Interner Helper `_applyOnUse` (einmalige Quelle für onUse + Stack-Dekrement).
- `src/js/entities/player.js` — `tickStats(dt)`: Hunger/Thirst-Decay, Starve-Damage wenn einer auf 0, Health-Regen bei Hunger > 50 und Thirst > 50. TODO-Komment für Death-Screen.
- `src/js/core/game.js` — `player.tickStats(dt)` im Pointer-Lock-Block (gleiche Pausenregel wie Clock/World). `_handleInventoryInput` ruft `inventory.tickActiveHold(dt, leftDown, ctx)`; Consume-HUD-State wird an `hud.update` durchgereicht. Drei zusätzliche Test-Pickups (Dosensuppe, Limodose, Schmerzmittel) am Spawn.
- `src/js/ui/hud.js` — `_updateConsume(state)` (DOM-Knoten `#consume-ring` + `#consume-label`). Pickup-Ring nutzt jetzt gemeinsames CSS-Var `--progress-angle` statt `--pickup-progress`.
- `src/css/hud.css` — Shared Base-Klasse `.progress-ring` mit `--ring-color` / `--progress-angle`. `#pickup-ring` bleibt gelb, `#consume-ring` ist grün + etwas größer (damit beide Ringe im unwahrscheinlichen Doppelfall nicht übereinander liegen).
- `src/css/main.css` — CSS-Variable `--consume-ring` (Farb-Pendant zu `COLORS.CONSUME_RING`).
- `index.html` — `#consume-ring` + `#consume-label` ergänzt (beide mit Shared-Class `progress-ring`).

SSoT-Checks:
- Alle Consumable-Delta-Zahlen (25/45/5/50/30) existieren GENAU in `constants.js:CONSUMABLES`. `items/food.js` liest sie, keine Duplikate.
- Keine Magic-Numbers in player/stats-Code — alles via `STATS.*`.
- Progress-Ring ist via shared Class `.progress-ring` + `--ring-color` parametrisiert, keine CSS-Kopie.
- SNACK und WATER_BOTTLE behalten ihre Batch-3-IDs; neue Items sind reine Ergänzungen.
- Hold-to-Consume nutzt das Pattern von `pickups.tickHold` (Target-Guard + Progress-Timer + Rising-Edge-Finalize).

## Post-Update

- [x] README "Features (implementiert)" / "Controls" / "Zentrale Konstanten" ergänzt.
- [x] Spec-Tabelle aktualisiert.
- [x] `docs/batches/batch-04-consumption.md` Status auf ERLEDIGT.
