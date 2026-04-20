// Enums. Wird über Batches hinweg befüllt. NIEMALS String-Literals im Spielcode — immer über diese Enums.

// [Batch 2]
export const BuildingType = Object.freeze({
  HOUSE: 'house',
  GAS_STATION: 'gas_station',
  SHOP: 'shop',
  GARAGE: 'garage',
  RUIN: 'ruin',
  SECURITY_OFFICE: 'security_office',
});

export const BiomeType = Object.freeze({
  MEADOW: 'meadow',
  STREET: 'street',
  SIDEWALK: 'sidewalk',
});

// [Batch 3]
export const ItemType = Object.freeze({
  FOOD: 'food',
  DRINK: 'drink',
  WEAPON_MELEE: 'weapon_melee',
  WEAPON_LIGHT: 'weapon_light',
  WEAPON_HEAVY: 'weapon_heavy',
  AMMO: 'ammo',
  KEY: 'key',
  PART: 'part',
  MISC: 'misc',
});

// [Batch 3] Stabile IDs aller registrierten Item-Prototypen.
// Die AMMO_*-Strings matchen bewusst WEAPONS.*.ammoType in constants.js.
// [Batch 4] CANNED_SOUP, SODA_CAN, PAINKILLERS ergänzt.
export const ItemId = Object.freeze({
  SNACK: 'snack',
  CANNED_SOUP: 'canned_soup',
  WATER_BOTTLE: 'water_bottle',
  SODA_CAN: 'soda_can',
  PAINKILLERS: 'painkillers',
  MELEE_BAT: 'melee_bat',
  PISTOL: 'pistol',
  SHOTGUN: 'shotgun',
  MACHINE_GUN: 'machine_gun',
  AMMO_PISTOL: 'ammo_pistol',
  AMMO_SHELL: 'ammo_shell',
  AMMO_RIFLE: 'ammo_rifle',
  TIRE: 'tire',
  KEYCARD_SUBWAY: 'keycard_subway',
});

// [Batch 6]
export const MonsterType = Object.freeze({
  STALKER: 'stalker',
  SPRINTER: 'sprinter',
  BRUTE: 'brute',
});

// [Batch 1] — für Clock-Phasen-Vergleich
export const Phase = Object.freeze({
  DAWN: 'dawn',
  DAY: 'day',
  DUSK: 'dusk',
  NIGHT: 'night',
});

// [Batch 8]
export const ObjectiveType = Object.freeze({
  FIND_TIRES_AND_DRIVE: 'find_tires_and_drive',
  FIND_SUBWAY_KEYCARD: 'find_subway_keycard',
});
