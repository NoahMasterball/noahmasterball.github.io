# Batch 9 — Polish (Menus, Death-Screen, Sounds, Save/Load)

**Status:** offen. Abhängig von allen vorherigen.

## Scope

Spielflow-Polish: Main-Menu, Pause, Death-Screen, Sounds, Save/Load.

## Deliverables

- `src/js/ui/menu.js` — Main-Menu (Start / Continue / Settings / Quit), Pause-Menu (ESC), Death-Screen (Restart / Main Menu).
- `src/js/ui/settings.js` — Volume, Mouse-Sensitivity, FOV. Liest/Schreibt `localStorage`.
- `src/js/core/audio.js` — Minimaler Audio-Wrapper (Web-Audio-API). Lädt Sounds aus `src/assets/audio/`. Registry.
- `src/js/core/save.js` — Snapshot von `{ level, nightCount, player.stats, inventory, objective-progress }` in `localStorage`. Load beim Continue-Click.
- `src/css/menu.css` — Menu-Styling (war in Batch 1 schon referenziert, jetzt real befüllen).

## Konstanten-Ergänzung

```js
AUDIO: {
  MASTER_VOLUME: 0.8,
  SFX_VOLUME: 1.0,
  MUSIC_VOLUME: 0.5,
},
SAVE: {
  KEY: 'project_alpha_save_v1',
  AUTOSAVE_INTERVAL_SEC: 30,
},
```

## Sound-Events (minimal)

- `footstep` (random pitch ±10%).
- `gunshot_pistol`, `gunshot_shotgun`, `gunshot_mg`.
- `pickup_item`, `consume_food`, `consume_drink`.
- `monster_growl` (loop, räumlich).
- `alarm_siren` (loop).
- `player_hurt`.
- `ambience_day`, `ambience_night` (cross-fade bei Phasen-Wechsel).

Für den Batch reicht es, Placeholder-Files anzulegen und die Integrationspunkte zu schaffen — echte Audio-Files können später ersetzt werden.

## Abnahme-Kriterien

- [ ] Start-Screen beim Laden sichtbar, `Start` startet Spiel.
- [ ] `ESC` pausiert + zeigt Pause-Menu.
- [ ] Bei `health == 0` → Death-Screen, Restart funktioniert sauber.
- [ ] Mindestens 3 Sound-Events hörbar (Schuss, Pickup, Monster).
- [ ] Save on Level-Change + alle 30s. Continue lädt korrekt zurück.
- [ ] Settings-Änderungen persistieren über Reload.

## Post-Update

- README finalisieren.
- Spec-Tabelle alle ERLEDIGT.
- Demo-Screenshot in README einfügen (optional).
