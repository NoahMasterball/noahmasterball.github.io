# Batch 8 — Level-System (Objectives + Map-Change)

**Status:** offen. Abhängig von Batch 2 (World), Batch 3 (Inventory für Parts/Keys), Batch 6 (Nacht muss überlebt werden).

## Scope

Level-Progression mit Objectives. Jedes Level hat ein anderes Ziel. Objective erfüllt + Nacht überlebt → nächstes Level (neue Map, neuer Objective-Typ, Monster-Pool reset).

## Regeln des Auftraggebers

> "Und es soll auch einen Map-Change geben, also ist immer so, jedes Level wird ja immer bei Nacht schwerer, und man muss in jedem Level eine Sache schaffen, wie zum Beispiel im ersten Level neue Reifen für dein Auto finden, damit du dann ins Auto steigen kannst und das Level changen kannst, also hast du das erste Level praktisch überlebt, dann kommst du ins zweite Level, und da musst du was komplett Neues machen, zum Beispiel die Keycard zu einer U-Bahn finden."

## Deliverables

- `src/js/levels/level-manager.js` — Owns `currentLevelIndex`, `currentObjective`. Methoden: `startLevel(i)`, `checkObjective(player, world)`, `advance()` (Map-Change).
- `src/js/levels/objectives.js` — Pro Level-Index ein Objective-Modul mit `setup(world)`, `update(player, world) -> done?`, `hints` für HUD.
- `src/js/world/world.js` Integration: `loadLevel(config)` resetted Scene-Inhalt, Map-Gen mit neuem Seed + Level-Pack.
- `src/js/entities/monster-spawner.js`: `reset()` bei Map-Change. Night-Counter bleibt global bestehen (oder wird pro Level zurückgesetzt — siehe Design-Entscheidung unten).
- `src/js/ui/hud.js` erweitern: Objective-Panel oben links mit aktuellem Ziel + Progress.

## Level-Pack-Struktur

```js
// in levels/level-manager.js oder levels/levels-config.js
const LEVELS = [
  {
    id: 'wasteland_suburbs',
    label: 'Level 1 — Die Vorstadt',
    objective: 'find_tires_and_drive',    // key in objectives.js
    monsterPool: [MonsterType.STALKER],
    extraMonsterByNight: [MonsterType.SPRINTER, MonsterType.BRUTE],
    mapSeed: null, // random
    startInventory: [],
  },
  {
    id: 'downtown',
    label: 'Level 2 — Innenstadt',
    objective: 'find_subway_keycard',
    monsterPool: [MonsterType.SPRINTER],
    extraMonsterByNight: [MonsterType.STALKER, MonsterType.BRUTE /* + neuer Typ */],
    mapSeed: null,
    startInventory: [],
  },
  // Level 3+ — Kreativraum. Beispiele:
  // - 'find_helicopter_fuel'
  // - 'activate_radio_tower'
  // - 'find_boat_keys'
];
```

## Objective-Beispiele

- **find_tires_and_drive**: Spawne 4 Tire-Pickups in Garagen. Spawne 1 kaputtes Auto. Interaction mit Auto nur wenn Inventar 4× Tire enthält → Tires werden konsumiert → Auto startbar → `E` beim Auto löst Level-Change aus.
- **find_subway_keycard**: Spawne 1 Keycard-Pickup in einem Security-Office. Interaction mit Subway-Gate mit Keycard im Inventar → Level-Change.

## Design-Entscheidung: Night-Counter

Empfehlung: **Night-Counter bleibt global** (alle überlebten Nächte zählen). Monster-Pool kommt aus Level-Config + ggf. Extras ab bestimmten Nächten. So wird das Spiel über Levels hinweg kontinuierlich härter.

## Konstanten-Ergänzung

```js
LEVELS: {
  TRANSITION_FADE_SEC: 1.2,
},
```

## Abnahme-Kriterien

- [ ] Spielstart in Level 1 mit Objective "Finde 4 Reifen und fahr weg".
- [ ] HUD zeigt Objective-Text + Progress (z.B. "Reifen 2/4").
- [ ] Interaktion mit Auto funktioniert, wenn Bedingung erfüllt.
- [ ] Map wird beim Advance geflusht, neue Map generiert, Monster reset, Player spawnt neu.
- [ ] Night-Counter bleibt zwischen Levels.
- [ ] Level 2 hat anderes Objective + anderen Monster-Pool.

## Post-Update

- README.
- Spec-Tabelle.
