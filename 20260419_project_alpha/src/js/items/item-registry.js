import { ItemType, ItemId } from '../config/enums.js';
import { ITEMS } from '../config/constants.js';
import { defaultMaxStack, defaultStackable } from './item.js';
import { makeConsumeUse } from './food.js';
import { makeWeaponUse, makeWeaponAutoFire } from './weapons.js';

// SSoT für Item-Prototypen. Jede Item-Definition (Snack, Pistole, Tire …) existiert
// GENAU hier. Andere Systeme referenzieren immer nur über ItemId → getPrototype(id).
// [Batch 4] Food/Drink/Medizin bekommen onUse aus makeConsumeUse (liest CONSUMABLES-
// Deltas aus constants.js).
// [Batch 5] Waffen bekommen onUse aus makeWeaponUse (liest WEAPONS-Daten aus
// constants.js). MG zusätzlich onAutoFire aus makeWeaponAutoFire — Full-Auto läuft
// pro Frame über Inventory.tickActiveFire.

const _prototypes = new Map();

function define(id, def) {
  const stackable = def.stackable ?? defaultStackable(def.type);
  const maxStack = def.maxStack ?? defaultMaxStack(def.type);
  const proto = Object.freeze({
    id,
    type: def.type,
    name: def.name,
    color: def.color,
    stackable,
    maxStack,
    heavy: !!def.heavy,
    onUse: def.onUse ?? null,
    onAutoFire: def.onAutoFire ?? null,
    meta: def.meta ?? null,
  });
  _prototypes.set(id, proto);
  return proto;
}

// Consumables. Die Tabelle im Batch-4-Spec ist Intent; IDs aus Batch 3 werden
// weitergeführt (SNACK bleibt SNACK — kein Rename zu snack_bar).
define(ItemId.SNACK,          { type: ItemType.FOOD,          name: 'Snack',            color: ITEMS.COLOR.FOOD,  onUse: makeConsumeUse(ItemId.SNACK) });
define(ItemId.CANNED_SOUP,    { type: ItemType.FOOD,          name: 'Dosensuppe',       color: ITEMS.COLOR.FOOD,  onUse: makeConsumeUse(ItemId.CANNED_SOUP) });
define(ItemId.WATER_BOTTLE,   { type: ItemType.DRINK,         name: 'Wasserflasche',    color: ITEMS.COLOR.DRINK, onUse: makeConsumeUse(ItemId.WATER_BOTTLE) });
define(ItemId.SODA_CAN,       { type: ItemType.DRINK,         name: 'Limodose',         color: ITEMS.COLOR.DRINK, onUse: makeConsumeUse(ItemId.SODA_CAN) });
define(ItemId.PAINKILLERS,    { type: ItemType.FOOD,          name: 'Schmerzmittel',    color: ITEMS.COLOR.FOOD,  onUse: makeConsumeUse(ItemId.PAINKILLERS) });

// Waffen. Heavy-Flag an MACHINE_GUN korrespondiert mit WEAPONS.MACHINE_GUN.heavy=true.
// Full-Auto-MG zusätzlich onAutoFire — makeWeaponAutoFire liefert für nicht-fullAuto
// null zurück (Defensive: registry setzt onAutoFire default auf null).
define(ItemId.MELEE_BAT,      { type: ItemType.WEAPON_MELEE,  name: 'Baseballschläger', color: ITEMS.COLOR.WEAPON, onUse: makeWeaponUse(ItemId.MELEE_BAT) });
define(ItemId.PISTOL,         { type: ItemType.WEAPON_LIGHT,  name: 'Pistole',          color: ITEMS.COLOR.WEAPON, onUse: makeWeaponUse(ItemId.PISTOL) });
define(ItemId.SHOTGUN,        { type: ItemType.WEAPON_LIGHT,  name: 'Schrotflinte',     color: ITEMS.COLOR.WEAPON, onUse: makeWeaponUse(ItemId.SHOTGUN) });
define(ItemId.MACHINE_GUN,    { type: ItemType.WEAPON_HEAVY,  name: 'Maschinengewehr',  color: ITEMS.COLOR.WEAPON, heavy: true, onUse: makeWeaponUse(ItemId.MACHINE_GUN), onAutoFire: makeWeaponAutoFire(ItemId.MACHINE_GUN) });

// Munition. IDs matchen WEAPONS.*.ammoType.
define(ItemId.AMMO_PISTOL,    { type: ItemType.AMMO,          name: 'Pistolenmunition', color: ITEMS.COLOR.AMMO });
define(ItemId.AMMO_SHELL,     { type: ItemType.AMMO,          name: 'Schrotpatronen',   color: ITEMS.COLOR.AMMO });
define(ItemId.AMMO_RIFLE,     { type: ItemType.AMMO,          name: 'Gewehrmunition',   color: ITEMS.COLOR.AMMO });

// Quest / Teile.
define(ItemId.TIRE,           { type: ItemType.PART,          name: 'Autoreifen',       color: ITEMS.COLOR.PART });
define(ItemId.KEYCARD_SUBWAY, { type: ItemType.KEY,           name: 'U-Bahn-Keycard',   color: ITEMS.COLOR.KEY });

export function getPrototype(id) {
  const p = _prototypes.get(id);
  if (!p) throw new Error(`Item-ID nicht registriert: ${id}`);
  return p;
}

export function allPrototypes() {
  return Array.from(_prototypes.values());
}
