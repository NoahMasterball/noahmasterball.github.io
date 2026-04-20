import { ItemType } from '../config/enums.js';
import { ITEMS } from '../config/constants.js';

// Runtime-Item. Besitzt nur Felder, die sich zwischen Instanzen unterscheiden können
// (aktuell `count`). Statik-Felder (type, name, color, heavy, onUse …) werden aus dem
// Prototype geerbt — Prototypen leben im item-registry.

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
    meta:      prototype.meta ?? null,
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
