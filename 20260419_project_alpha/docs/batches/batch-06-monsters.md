# Batch 6 — Monsters + Nights

**Status:** offen. Abhängig von Batch 2 (World, für Spawn-Positionen), Batch 4 (Player-Damage), Batch 5 (Weapons-Schaden).

## Scope

Monster-System: AI, Spawn-Management, Nacht-Wellen, Night-Counter-getriebene Progression.

## Regeln des Auftraggebers

> "Mach so einen Counter, wo man mit jeder Nacht überlebt, und in jeder Nacht soll ein neues Monster beziehungsweise ein schwereres Monster hinzukommen. In der ersten Nacht sind's erstmal gruselige Monster, und in der nächsten Nacht sind vielleicht schnellere Monster, und danach sind's große, langsame."

## Deliverables

- `src/js/entities/monsters.js` — Basis-Monster-Klasse + konkrete Typen: `Stalker`, `Sprinter`, `Brute`. Jede erbt von `Monster` und überschreibt `update(dt, player, world)` + Visuals.
- `src/js/entities/monster-spawner.js` — Spawn-Manager. Reagiert auf `clock.phase === 'night'` und `clock.nightCount`. Hält `spawnBudget`, wählt Typen-Pool + Spawn-Positionen.
- `src/js/entities/nav.js` — Einfache Navigation. Kein A* nötig — Monster gehen per geraden Vektoren Richtung Player, mit Obstacle-Avoidance per Short-Range-Raycast an World-Buildings.
- `src/js/items/weapons.js` Integration: Hit-Scan trifft Monster → `monster.takeDamage(n)`.
- `src/js/entities/player.js` erweitern: Kontaktschaden-Check (jeder Frame Monster in `<MONSTER.ATTACK_RANGE_M>` → Damage gemäß Monster-Typ).

## Enums-Ergänzung

```js
export const MonsterType = Object.freeze({
  STALKER: 'stalker', SPRINTER: 'sprinter', BRUTE: 'brute',
});
```

## Konstanten-Ergänzung (`constants.js` → `MONSTERS`)

```js
MONSTERS: {
  STALKER:  { hp: 60,  speed: 2.5, damage: 20, attackIntervalSec: 1.2, attackRangeM: 1.8, color: 0x555555, scale: 1.0 },
  SPRINTER: { hp: 35,  speed: 6.0, damage: 12, attackIntervalSec: 0.7, attackRangeM: 1.6, color: 0x883333, scale: 0.85 },
  BRUTE:    { hp: 180, speed: 1.8, damage: 45, attackIntervalSec: 2.0, attackRangeM: 2.4, color: 0x224422, scale: 1.6 },
  SPAWN_RADIUS_MIN_M: 18,
  SPAWN_RADIUS_MAX_M: 45,
  DESPAWN_ON_DAWN: true,
},
SPAWN_WAVE: {
  BASE_COUNT: 5,
  COUNT_PER_NIGHT: 2,    // +2 Monster pro Night-Count
  INTERVAL_SEC: 8,        // Abstand zwischen Einzel-Spawns innerhalb einer Nacht
},
```

## Progression-Regel

- **Nacht 1:** Pool = `[STALKER]`.
- **Nacht 2:** Pool = `[STALKER, SPRINTER]`.
- **Nacht 3+:** Pool = `[STALKER, SPRINTER, BRUTE]`.
- Spawn-Count = `BASE_COUNT + nightCount * COUNT_PER_NIGHT`.

## AI-Loop

```
wenn !sieht_player innerhalb sightRadius: wander langsam
sonst:
  richtung = normalize(player.pos - self.pos)
  // Obstacle-Check: short-Raycast, wenn blockiert, seitlich ausweichen
  self.pos += richtung * speed * dt
  wenn dist(player) <= attackRangeM && attackCooldown <= 0:
    player.stats.health -= damage
    attackCooldown = attackIntervalSec
```

## Abnahme-Kriterien

- [ ] Bei Nacht-Übergang spawnen Monster in `SPAWN_RADIUS_[MIN|MAX]_M` um den Player.
- [ ] Monster verfolgen den Player, weichen Gebäuden aus (rudimentär).
- [ ] Kontaktschaden landet bei Player (Bar sinkt).
- [ ] Waffen-Treffer töten Monster, Mesh verschwindet.
- [ ] Bei Dawn despawnen überlebende Monster (sofern `DESPAWN_ON_DAWN`).
- [ ] HUD zeigt `Night #N` korrekt (aus `clock.nightCount`).
- [ ] Nacht 2 enthält Sprinter, Nacht 3 auch Brutes.

## Post-Update

- README.
- Spec-Tabelle.
