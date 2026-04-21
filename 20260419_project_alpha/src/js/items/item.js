import { ItemType } from '../config/enums.js';
import { ITEMS } from '../config/constants.js';

// Runtime-Item. Besitzt Felder, die sich zwischen Instanzen unterscheiden können
// (count, runtime). Statik-Felder (type, name, color, heavy, onUse, onAutoFire …)
// werden aus dem Prototype geerbt — Prototypen leben im item-registry.
// [Batch 5] `runtime` ist ein frisches Objekt PRO Instanz für Zustandsfelder
// (Waffen: magAmmo, reloadTimer, fireCooldown). Muss explizit außerhalb gefüllt
// werden — Standardfall bleibt null, damit Non-Weapon-Items keinen Overhead haben.

export function createItem(prototype, overrides = {}) {
  return {
    id:        prototype.id,
    type:      prototype.type,
    name:      prototype.name,
    color:     prototype.color,
    stackable: prototype.stackable,
    maxStack:  prototype.maxStack,
    heavy:     prototype.heavy,
    onUse:     prototype.onUse,
    onAutoFire: prototype.onAutoFire ?? null,
    meta:      prototype.meta ?? null,
    runtime:   overrides.runtime ?? null,
    count:     overrides.count ?? 1,
  };
}

export function defaultMaxStack(type) {
  switch (type) {
    case ItemType.FOOD:
    case ItemType.DRINK:
      return ITEMS.DEFAULT_MAX_STACK_CONSUMABLE;
    case ItemType.AMMO:
      return ITEMS.DEFAULT_MAX_STACK_AMMO;
    default:
      return ITEMS.DEFAULT_MAX_STACK_MISC;
  }
}

export function defaultStackable(type) {
  return type === ItemType.FOOD || type === ItemType.DRINK || type === ItemType.AMMO;
}
