// Ammo-Reserve-Helpers. Zählt/konsumiert Munition direkt über die Inventory-
// Slots — KEIN eigener Stack, KEINE eigene ID-Logik. Inventory.addItem macht
// das Stacking, ammo.js kann Reserve-Summen lesen und beim Reload Slots
// dekrementieren. Ammo-IDs matchen WEAPONS.*.ammoType (siehe enums.js / constants.js).

// Summe der Ammo-Einheiten des Typs `ammoType` über alle Slots. ammoType ist
// z.B. 'ammo_pistol' und matcht gleichzeitig ItemId.AMMO_PISTOL.
export function getReserve(inventory, ammoType) {
  if (!ammoType) return 0;
  let sum = 0;
  for (const slot of inventory.slots) {
    if (slot && slot.id === ammoType) sum += slot.count;
  }
  return sum;
}

// Verbraucht bis zu `amount` Einheiten des Ammo-Typs aus dem Inventar. Beginnt
// bei niedrig-befüllten Stacks zuerst, räumt leere Slots auf. Gibt die
// tatsächlich konsumierte Menge zurück (kann < amount sein, wenn Reserve leer
// wird).
export function consumeFromReserve(inventory, ammoType, amount) {
  if (!ammoType || amount <= 0) return 0;
  let remaining = amount;
  for (let i = 0; i < inventory.slots.length; i++) {
    const slot = inventory.slots[i];
    if (!slot || slot.id !== ammoType) continue;
    const take = Math.min(slot.count, remaining);
    slot.count -= take;
    remaining -= take;
    if (slot.count <= 0) inventory.slots[i] = null;
    if (remaining <= 0) break;
  }
  return amount - remaining;
}
