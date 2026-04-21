# Batch 5 — Weapons

**Status:** ERLEDIGT. Mit Dummy-Target gestartet; echte Monster-Hits kommen in Batch 6 über die gleiche `userData.hpOwner`-Konvention.

## Scope

Nahkampf, Schusswaffen, Heavy-Weapons mit Ammo-Management.

## Regeln des Auftraggebers

> "Es soll auch Waffen geben, mit denen man Monstern Schaden machen kann und es soll mehrere wechselbare Waffen geben, aber man soll, mach's auch so, dass man in ganz schweren Orten, wo man hinkommen soll, soll es auch etwas größere Waffen wie ein Maschinengewehr geben, aber diese kann man nur einmal tragen und man kriegt relativ wenig Munition dazu."

## Deliverables

- `src/js/items/weapons.js` — Weapon-Factory. Jede Waffe hat `{ type, damage, fireRate, ammoType, ammoPerShot, magSize, reloadSec, range, spread, heavy }`.
- `src/js/items/ammo.js` — Ammo-Item + Kapazitäts-Handling im Inventar.
- `src/js/core/hit-scan.js` — Raycast-Schuss-System. Input: Origin, Direction, Range. Output: nächstes getroffenes Entity oder World-Hit-Point.
- `src/js/items/inventory.js` erweitern: Heavy-Slot-Enforcement (`item.heavy === true` → nur eines gleichzeitig).
- `src/js/ui/hud.js` erweitern: Ammo-Counter (aktuelle Mag / Reserve), Reload-Progress-Ring.

## Konstanten-Ergänzung (`constants.js` → `WEAPONS`)

Jede Waffe als Konstante im `WEAPONS`-Block, referenziert von der Factory. Beispiel:

```js
WEAPONS: {
  MELEE_BAT:    { damage: 35, fireRate: 1.2, range: 2.0, heavy: false },
  PISTOL:       { damage: 18, fireRate: 4.0, magSize: 12, reloadSec: 1.4, range: 40, spread: 0.02, heavy: false, ammoType: 'ammo_pistol' },
  SHOTGUN:      { damage: 12, pellets: 8, fireRate: 1.0, magSize: 6, reloadSec: 2.2, range: 20, spread: 0.12, heavy: false, ammoType: 'ammo_shell' },
  MACHINE_GUN:  { damage: 14, fireRate: 10.0, magSize: 60, reloadSec: 3.5, range: 60, spread: 0.04, heavy: true, ammoType: 'ammo_rifle' },
}
```

## Ammo-Management

- Ammo ist ein stackbares Item im Inventar (`stackable: true, maxStack: 200` per ammoType).
- Reload zieht aus Inventar-Stack.
- Ammo für Heavy-Weapons soll knapp sein → Spawn-Rate in Loot-Tables niedrig (Batch 8).

## Abnahme-Kriterien

- [x] Pistole mit Left-Click schießt (Raycast + Tracer-Visual-Flash).
- [x] Mag/Reserve sichtbar; Reload mit `R`.
- [x] MG im Inventar gleichzeitig mit Pistole → Pickup-Reject bei zweitem Heavy (bereits von Batch 3 `Inventory.addItem.hasHeavy()` erzwungen, ohne Änderung in Batch 5 übernommen).
- [x] Nahkampf-Swing mit Cooldown + Arc-Raycast (5 Rays im 45°-Fan, Cooldown `1 / WEAPONS.MELEE_BAT.fireRate`).
- [x] Dummy-Target im Spawn (statisches Mesh mit HP) nimmt Schaden (gelber Würfel `DUMMY_TARGET.SPAWN_DX/DZ` vor dem Spieler, Hit-Tint beim Treffer, färbt sich bei 0 HP dunkel).

## Hinweise

- Für Muzzle-Flash + Tracer: einfache Three.js-Line-Segmente mit kurzer TTL, keine Partikel-Engine.
- Sound-Effekte: TODO-Placeholder, kommen in Batch 9.

## Umsetzungs-Stand

- `src/js/config/constants.js` erweitert um `WEAPONS.MACHINE_GUN.fullAuto = true`, `WEAPON_VFX` (Tracer-/Muzzle-Flash-TTL, Farben, Origin-Offsets), `MELEE` (Fan-Rays + -Winkel), `DUMMY_TARGET` (HP/Größe/Farben/Spawn-Offset), `COLORS.RELOAD_RING`.
- `src/css/main.css` bekommt CSS-Variable `--reload-ring` (spiegelt `COLORS.RELOAD_RING`). `src/css/hud.css` ergänzt den dritten `.progress-ring`-Variant (`#reload-ring` 54 px, blau) plus `#ammo-counter`-Styles (unten rechts, reload-tinted, low-state rot).
- `index.html` bekommt `#reload-ring`, `#reload-label` und `#ammo-counter` Nodes.
- `src/js/core/hit-scan.js` (NEW) — `hitScan({ origin, direction, range, targets })` als `THREE.Raycaster`-Wrapper; `TracerManager` hält Tracer-Lines + Muzzle-Flash-Quads mit TTL-Fade.
- `src/js/items/weapons.js` (NEW) — Factory analog zu `food.js`:
  - `makeWeaponUse(itemId)` baut onUse für Single-Shot (Pistole/Shotgun/Melee). MG-onUse ist No-Op (läuft über onAutoFire).
  - `makeWeaponAutoFire(itemId)` baut onAutoFire nur für `fullAuto`-Waffen (aktuell nur MG).
  - `startReload(item, inventory)` und `tickWeapon(dt, item, inventory)` treiben Reload-Timer + `fireCooldown`. Ammo-Befüllung beim Reload-Ende über `ammo.js`.
  - `ensureWeaponRuntime(item)` initialisiert `item.runtime = { magAmmo, reloadTimer, fireCooldown }` lazy beim ersten Zugriff — volles Magazin beim Spawn.
  - Hit-Scan: Shotgun feuert `cfg.pellets` Rays mit `cfg.spread`; Melee feuert `MELEE.ARC_RAYS` Rays im Fan.
- `src/js/items/ammo.js` (NEW) — `getReserve(inventory, ammoType)` + `consumeFromReserve(inventory, ammoType, amount)` zählen bzw. konsumieren direkt über Inventory-Slots; kein eigenes Stacking (Inventory.addItem macht das weiterhin).
- `src/js/items/item.js` — `createItem` trägt jetzt `runtime` (per-Instanz) und `onAutoFire` (Prototype-Pass-Through). Non-Weapon-Items behalten `runtime: null`.
- `src/js/items/item-registry.js` — alle vier Waffen-Prototypen bekommen `onUse` aus `makeWeaponUse`; MG zusätzlich `onAutoFire` aus `makeWeaponAutoFire`.
- `src/js/items/inventory.js` — neue Methoden:
  - `useActive` greift unverändert, fällt auf `_applyOnUse` durch; Single-Shot-Waffen feuern hier bei Rising-Edge.
  - `tickActiveFire(dt, holding, ctx)` delegiert an `item.onAutoFire` (Full-Auto-MG).
  - `startActiveReload()` ruft `weapons.startReload`.
  - `tickWeaponState(dt)` tickt Reload/Cooldown und liefert HUD-State (mag, reserve, reloadProgress01, reloading, ammoType).
  - Heavy-Slot-Enforcement in `addItem` bleibt unverändert (Batch 3 regelt das bereits, Spec-Zeile in Deliverables ist Altlast).
- `src/js/entities/dummy-target.js` (NEW) — Test-Dummy mit `takeDamage(dmg)` + `update(dt)` für Hit-Tint. Hängt sich als `userData.hpOwner` an sein Mesh, damit `hit-scan` den Owner über die Mesh-Hierarchie findet.
- `src/js/core/game.js` — instanziiert `TracerManager` + Dummy-Target; `ctx` trägt jetzt `{ targets, tracers }` für den Weapon-Fire-Pfad; neue Keys: `R` (Reload), erweiterte Left-Click-Semantik (Rising-Edge = Use, Hold = Auto-Fire für MG). HUD-Update nimmt zusätzlich `_weaponHudState`.
- `src/js/ui/hud.js` — `_updateWeapon(state)` verdrahtet Ammo-Counter + dritten Reload-Ring.

## Post-Update

- README: Projektstruktur + "Features (implementiert)" Batch 5 + Controls + Zentrale Konstanten gepflegt.
- Spec-Tabelle: Batch 5 → ERLEDIGT.
