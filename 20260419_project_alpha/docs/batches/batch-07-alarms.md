# Batch 7 — Alarms

**Status:** offen. Abhängig von Batch 2 (Buildings mit `hasAlarm`), Batch 6 (Monster-Spawner).

## Scope

Alarmanlagen in Shops / Tankstellen. Beim Auslösen wird die Monster-Aggro auf die Alarm-Position verstärkt.

## Regeln des Auftraggebers

> "Dass man in manchen Orten, wo man durch Wellen kommen soll, so zum Beispiel so kleine Läden oder so, mach's auch so, dass die eine Alarmanlage haben und da die Monster dann später definitiv vorbeilaufen. Das heißt, wenn so eine Alarmanlage losgeht, dass Monster dann da verhäuft sich aufhalten."

## Deliverables

- `src/js/world/alarms.js` — Alarm-Manager. Registriert je Alarm: Position, Trigger-Zone (Door-AABB), State (`idle|active`), Timer. Beim Betreten der Zone: `trigger()`.
- `src/js/entities/monster-spawner.js` erweitern: `alarmHotspots[]` — Monster-AI zieht bevorzugt hierhin statt Player, solange Alarm aktiv und Player nicht in Sichtlinie des Monsters.
- `src/js/world/buildings.js` — Templates mit `hasAlarm: true` bekommen ein blinkendes Alarm-Licht (rotes Point-Light + Wand-Blinker-Mesh) und ein Alarm-Sound-Placeholder.
- `src/js/ui/hud.js` — Alarm-Icon oben mittig, wenn mindestens ein Alarm aktiv (mit Countdown).

## Konstanten-Ergänzung

```js
ALARM: {
  DURATION_SEC: 120,
  MONSTER_AGGRO_RADIUS_M: 60,
  MONSTER_EXTRA_SPAWN_COUNT: 4,   // zusätzliche Spawns in der Nähe des Alarms
  BLINK_HZ: 1.8,
  SOUND_ID: 'alarm_siren',         // wird in Batch 9 verknüpft
},
```

## Logik

- Trigger: Player betritt Alarm-Zone (z.B. Shop-Tür) → Alarm wird `active`, Timer = `DURATION_SEC`.
- Während aktiv: Spawner pickt mit hoher Wahrscheinlichkeit Positionen innerhalb `MONSTER_AGGRO_RADIUS_M` um Alarm. Zusätzliche Burst-Spawns `MONSTER_EXTRA_SPAWN_COUNT` einmalig beim Trigger.
- Monster-AI: während aktiv und Player nicht direkt sichtbar → Target-Override auf Alarm-Position.
- Nach Timer → `idle`, Blinklicht aus.

## Abnahme-Kriterien

- [ ] Betreten eines Shops triggert sichtbar blinkendes Alarm-Licht.
- [ ] HUD zeigt Alarm-Icon + Countdown.
- [ ] Monster laufen sichtbar zum Alarm-Ort, wenn Player weit weg.
- [ ] Nach `DURATION_SEC` endet alles sauber.
- [ ] Mehrere Alarme gleichzeitig möglich (Liste, nicht Singleton).

## Post-Update

- README.
- Spec-Tabelle.
