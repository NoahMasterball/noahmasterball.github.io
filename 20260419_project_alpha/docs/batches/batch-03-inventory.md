# Batch 3 — Inventory + Hotbar

**Status:** ERLEDIGT. Abhängig von Batch 1 (HUD-Slots bestehen bereits als DOM).

## Scope

Funktionales Inventar-System mit Hotbar, Pickup / Drop / Use / Slot-Switch.

## Regeln des Auftraggebers

> "So eine Hotbar praktisch mit 8 Slots. Mit Q droppen oder mit Links-Click verwenden. Bei Essen oder Trinken muss man gedrückt halten kurz, um es aufzunehmen."

## Deliverables

- `src/js/items/inventory.js` — Inventory-Klasse. Besitzt `slots: Array(HOTBAR.SLOT_COUNT)`, `activeIndex`. Methoden: `addItem(item)`, `removeActive()`, `useActive(ctx)`, `dropActive(world, player)`, `setActive(i)`, `cycle(delta)`.
- `src/js/items/item.js` — Basis-Item-Definition: `{ id, type, name, iconUrl?, stackable, maxStack, heavy, onUse(ctx) }`.
- `src/js/items/pickups.js` — World-Pickup-Entities. Methoden: `spawn(world, item, position)`, `tryPickup(player)`. Unterstützt hold-to-consume via `HOTBAR.PICKUP_HOLD_SEC`.
- `src/js/items/item-registry.js` — Zentrale Registrierung aller Item-Prototypen (Snack, Water, Pistol, Tire …). Factory-Pattern. KEINE Duplikate über Dateien.
- `src/js/ui/hud.js` — Erweitern: Hotbar-Highlight des aktiven Slots, Item-Icon + Stack-Count, Pickup-Progress-Ring um Crosshair.

## Enums-Ergänzung

```js
export const ItemType = Object.freeze({
  FOOD: 'food', DRINK: 'drink',
  WEAPON_MELEE: 'weapon_melee', WEAPON_LIGHT: 'weapon_light', WEAPON_HEAVY: 'weapon_heavy',
  AMMO: 'ammo', KEY: 'key', PART: 'part', MISC: 'misc',
});
```

## Konstanten-Ergänzung

- `HOTBAR.SLOT_COUNT` bleibt 8 (schon in Batch 1).
- `HOTBAR.PICKUP_HOLD_SEC` = 0.6.
- `HOTBAR.DROP_FORWARD_M` = 1.5 (Meter vor Spieler).
- `HOTBAR.SWITCH_COOLDOWN_SEC` = 0.08.

## Controls

- `1`-`8`: aktiven Slot setzen.
- Mausrad: `cycle(±1)`.
- `Q`: aktives Item droppen.
- `E` (oder hold-Use): nächstes Pickup in Reichweite aufnehmen.
- Left-Click: `useActive()`. Für Consumables: siehe Batch 4.

## Abnahme-Kriterien

- [x] Beim Start liegen 2-3 Test-Pickups in der Welt (bis Batch 2 Loot-Tables existieren: statische Spawns in `game.js`). → 8 deterministische Test-Pickups rund um den Spawn (`Game._spawnInitialPickups`).
- [x] Aufnehmen funktioniert nur nach `HOTBAR.PICKUP_HOLD_SEC` gehalten — Progress sichtbar. → `PickupManager.tickHold` + Conic-Gradient-Ring in `#pickup-ring`.
- [x] Hotbar aktualisiert sich live: Icon, Stack, Highlight. → `HUD._updateHotbar` liest `Inventory.slots` + `activeIndex` pro Frame.
- [x] Drop legt Item vor dem Player ab, Pickup-Mesh erscheint. → `Inventory.dropActive` → `PickupManager.dropInFrontOf` entlang `-sin/-cos(yaw)` × `HOTBAR.DROP_FORWARD_M`.
- [x] Heavy-Weapon-Flag: zweites Heavy-Item wird beim Pickup abgelehnt (HUD-Warn-Flash). → `Inventory.addItem` + `HEAVY_WARN_FLASH_SEC` + `#hotbar.warn`-Keyframe.

## Umsetzung (Ist-Stand)

Neue Files:
- `src/js/items/item.js` — `createItem(prototype, overrides)`, `defaultMaxStack`, `defaultStackable`.
- `src/js/items/item-registry.js` — SSoT aller Item-Prototypen, `define(id, def)` + `getPrototype(id)`.
- `src/js/items/inventory.js` — 8-Slot-Inventory: `addItem`, `removeActive`, `useActive`, `dropActive`, `setActive`, `cycle`, `tick`.
- `src/js/items/pickups.js` — `PickupManager` mit `spawn/update/tickHold/dropInFrontOf/dispose`.

Geänderte Files:
- `src/js/config/constants.js` — neuer `ITEMS`-Block (Stacks, Pickup-Mesh + Animation, Heavy-Warn, Farbpalette).
- `src/js/config/enums.js` — neuer `ItemId`-Enum; alle Prototype-Schlüssel.
- `src/js/core/input.js` — Wheel-Support (`consumeWheel`), Mouse-Just-Pressed (`consumeMouseButton`).
- `src/js/core/game.js` — `Inventory` + `PickupManager` instanziiert, `_handleInventoryInput(dt)` Hook.
- `src/js/ui/hud.js` — Slot-Icon + -Name, Pickup-Ring + -Label, Heavy-Warn-Flash mit reflow-basiertem Re-Trigger.
- `src/css/hud.css` — Styles für Slot-Icon/Name, Pickup-Ring (Conic-Gradient, Radial-Mask), Pickup-Label, Hotbar-Warn-Keyframe.
- `index.html` — `#pickup-ring` + `#pickup-label` ergänzt, Pointer-Lock-Hint-Text aktualisiert.

SSoT-Checks:
- Keine neuen Magic-Numbers außerhalb `constants.js`.
- Pickup-Farben referenzieren `ITEMS.COLOR.*`; Item-Stackgrößen via `ITEMS.DEFAULT_MAX_STACK_*`.
- Drop-Richtung nutzt dieselbe yaw-Konvention wie `player._applyMovement`.
- Ammo-IDs (`ammo_pistol`/`ammo_shell`/`ammo_rifle`) matchen bewusst `WEAPONS.*.ammoType` für Batch 5.
- Heavy-Flag im Prototype korrespondiert 1:1 mit `WEAPONS.MACHINE_GUN.heavy`.

## Post-Update

- [x] README + Spec-Tabelle aktualisieren.
- [x] `docs/batches/batch-03-inventory.md` Status auf ERLEDIGT.
