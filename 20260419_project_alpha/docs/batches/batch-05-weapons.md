# Batch 5 — Weapons

**Status:** offen. Abhängig von Batch 3 (Inventory) + 6 (für Monster-Hits — optional, kann mit Dummy-Target starten).

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

- [ ] Pistole mit Left-Click schießt (Raycast + Tracer-Visual-Flash).
- [ ] Mag/Reserve sichtbar; Reload mit `R`.
- [ ] MG im Inventar gleichzeitig mit Pistole → Pickup-Reject bei zweitem Heavy.
- [ ] Nahkampf-Swing mit Cooldown + Arc-Raycast (mehrere Rays im fan).
- [ ] Dummy-Target im Spawn (statisches Mesh mit HP) nimmt Schaden.

## Hinweise

- Für Muzzle-Flash + Tracer: einfache Three.js-Line-Segmente mit kurzer TTL, keine Partikel-Engine.
- Sound-Effekte: TODO-Placeholder, kommen in Batch 9.

## Post-Update

- README.
- Spec-Tabelle.
