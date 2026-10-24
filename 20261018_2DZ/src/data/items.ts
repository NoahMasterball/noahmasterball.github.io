// OWNER: agent "player" (C). Every item definition. Stack sizes, tool tiers, weapon and
// consumable stats live here and nowhere else.
//
// Tool tiers (TileDef.minPower in tiles.ts is compared with ToolStats.power):
//   hand power PLAYER.handMiningPower (1) · wood 2 · stone 3 · iron 4
//   speed (hardness/s): hand PLAYER.handMiningSpeed (1) · wood 2 · stone 3 · iron 4.5 · shovel 3 (dirt-like)
import type { ItemDef, ItemId, ToolStats } from './schema.ts';
import { WALLS } from './walls.ts';

const STACK_BLOCK = 999;
const STACK_BULK = 999;
const STACK_MATERIAL = 99;
const STACK_SINGLE = 1;
const STACK_AMMO = 250;
const STACK_FOOD = 20;
const STACK_MEDICAL = 10;

// NEW — tool tier table shared by every tool item (single source for power/speed per tier).
const TIER = {
  wood: { power: 2, speed: 2 },
  stone: { power: 3, speed: 3 },
  iron: { power: 4, speed: 4.5 },
} as const;

function tool(kind: ToolStats['kind'], tier: keyof typeof TIER): ToolStats {
  return { kind, ...TIER[tier] };
}

export const ITEMS: Record<ItemId, ItemDef> = {
  // ── blocks / placeables ────────────────────────────────────────────────────
  dirt: { name: 'Erde', category: 'block', maxStack: STACK_BLOCK, places: 'dirt', presentation: { color: 0x7a5233, icon: 'Erd' } },
  stone: { name: 'Stein', category: 'block', maxStack: STACK_BLOCK, places: 'stone', presentation: { color: 0x7d7d7d, icon: 'Stn' } },
  sand: { name: 'Sand', category: 'block', maxStack: STACK_BLOCK, places: 'sand', presentation: { color: 0xd9c78a, icon: 'Snd' } },
  gravel: { name: 'Kies', category: 'block', maxStack: STACK_BLOCK, places: 'gravel', presentation: { color: 0x8e8577, icon: 'Kis' } },
  clay: { name: 'Lehm', category: 'block', maxStack: STACK_BLOCK, places: 'clay', presentation: { color: 0xa86f52, icon: 'Lhm' } },
  // Logs are walk-through tree parts (tiles.ts), so raw wood is a material, not a building block.
  wood: { name: 'Holz', category: 'material', maxStack: STACK_BULK, presentation: { color: 0x7b5a36, icon: 'Hlz' } },
  planks: { name: 'Bretter', category: 'block', maxStack: STACK_BLOCK, places: 'planks', presentation: { color: 0xb08850, icon: 'Brt' } },
  brick: { name: 'Ziegel', category: 'block', maxStack: STACK_BLOCK, places: 'brick', presentation: { color: 0xa0473a, icon: 'Zgl' } },
  concrete: { name: 'Beton', category: 'block', maxStack: STACK_BLOCK, places: 'concrete', presentation: { color: 0xa3a39b, icon: 'Btn' } },
  glass: { name: 'Glas', category: 'block', maxStack: STACK_BLOCK, places: 'glass', presentation: { color: 0xbfe3ea, icon: 'Gls' } },
  metal_sheet: { name: 'Blech', category: 'block', maxStack: STACK_BLOCK, places: 'metal', presentation: { color: 0x8a9399, icon: 'Blc' } },
  hay: { name: 'Heuballen', category: 'block', maxStack: STACK_BLOCK, places: 'hay', presentation: { color: 0xd8b94a, icon: 'Heu' } },
  fence: { name: 'Zaun', category: 'block', maxStack: STACK_BLOCK, places: 'fence', presentation: { color: 0x9c7442, icon: 'Zun' } },
  door: { name: 'Tür', category: 'block', maxStack: STACK_MATERIAL, places: 'door', presentation: { color: 0x8a5f34, icon: 'Tür' } },
  workbench: { name: 'Werkbank', category: 'block', maxStack: STACK_MATERIAL, places: 'workbench', presentation: { color: 0x9a6b3a, icon: 'Wbk' } },
  furnace: { name: 'Ofen', category: 'block', maxStack: STACK_MATERIAL, places: 'furnace', presentation: { color: 0x5e5a56, icon: 'Ofn' } },
  torch: { name: 'Fackel', category: 'block', maxStack: STACK_BLOCK, places: 'torch', presentation: { color: 0xffb340, icon: 'Fkl' } },
  chest: { name: 'Truhe', category: 'block', maxStack: STACK_MATERIAL, places: 'chest', presentation: { color: 0x9b6a2f, icon: 'Trh' } },
  // Background walls: the colour is the wall's (data/walls.ts); mining one drops WallDef.drop.
  wood_wall: { name: 'Holzwand', category: 'block', maxStack: STACK_BLOCK, placesWall: 'wood_wall', presentation: { color: WALLS.wood_wall.presentation.color, icon: 'HWd' } },
  brick_wall: { name: 'Ziegelwand', category: 'block', maxStack: STACK_BLOCK, placesWall: 'brick_wall', presentation: { color: WALLS.brick_wall.presentation.color, icon: 'ZWd' } },
  concrete_wall: { name: 'Betonwand', category: 'block', maxStack: STACK_BLOCK, placesWall: 'concrete_wall', presentation: { color: WALLS.concrete_wall.presentation.color, icon: 'BWd' } },

  // ── materials ──────────────────────────────────────────────────────────────
  coal: { name: 'Kohle', category: 'material', maxStack: STACK_BULK, presentation: { color: 0x2b2b2b, icon: 'Khl' } },
  copper_ore: { name: 'Kupfererz', category: 'material', maxStack: STACK_BULK, presentation: { color: 0xc07a45, icon: 'KuE' } },
  iron_ore: { name: 'Eisenerz', category: 'material', maxStack: STACK_BULK, presentation: { color: 0xb59b8a, icon: 'FeE' } },
  copper_bar: { name: 'Kupferbarren', category: 'material', maxStack: STACK_MATERIAL, presentation: { color: 0xd9844a, icon: 'KuB' } },
  iron_bar: { name: 'Eisenbarren', category: 'material', maxStack: STACK_MATERIAL, presentation: { color: 0xc9ccd0, icon: 'FeB' } },
  scrap: { name: 'Schrott', category: 'material', maxStack: STACK_BULK, presentation: { color: 0x6f6a62, icon: 'Sch' } },
  nails: { name: 'Nägel', category: 'material', maxStack: STACK_BULK, presentation: { color: 0x9aa0a6, icon: 'Ngl' } },
  cloth: { name: 'Stoff', category: 'material', maxStack: STACK_MATERIAL, presentation: { color: 0xc9b9a0, icon: 'Stf' } },
  rope: { name: 'Seil', category: 'material', maxStack: STACK_MATERIAL, presentation: { color: 0xb59a6a, icon: 'Sel' } },
  seeds: { name: 'Saatgut', category: 'material', maxStack: STACK_BULK, presentation: { color: 0x9a8a3c, icon: 'Saa' } },
  wheat: { name: 'Weizen', category: 'material', maxStack: STACK_BULK, presentation: { color: 0xe0c060, icon: 'Wzn' } },

  // ── tools ──────────────────────────────────────────────────────────────────
  pickaxe_wood: { name: 'Holzspitzhacke', category: 'tool', maxStack: STACK_SINGLE, tool: tool('pick', 'wood'), presentation: { color: 0xa07a48, icon: 'HSp' } },
  pickaxe_stone: { name: 'Steinspitzhacke', category: 'tool', maxStack: STACK_SINGLE, tool: tool('pick', 'stone'), presentation: { color: 0x8c8c8c, icon: 'SSp' } },
  pickaxe_iron: { name: 'Eisenspitzhacke', category: 'tool', maxStack: STACK_SINGLE, tool: tool('pick', 'iron'), presentation: { color: 0xd0d4d8, icon: 'ESp' } },
  axe_wood: { name: 'Holzaxt', category: 'tool', maxStack: STACK_SINGLE, tool: tool('axe', 'wood'), presentation: { color: 0xa07a48, icon: 'HAx' } },
  axe_iron: { name: 'Eisenaxt', category: 'tool', maxStack: STACK_SINGLE, tool: tool('axe', 'iron'), presentation: { color: 0xd0d4d8, icon: 'EAx' } },
  shovel: { name: 'Schaufel', category: 'tool', maxStack: STACK_SINGLE, tool: { kind: 'shovel', power: TIER.wood.power, speed: TIER.stone.speed }, presentation: { color: 0x9a9a8a, icon: 'Sfl' } },
  bucket: { name: 'Eimer', category: 'tool', maxStack: STACK_SINGLE, bucket: { action: 'take', result: 'bucket_water' }, presentation: { color: 0xa8adb2, icon: 'Eim' } },
  bucket_water: { name: 'Wassereimer', category: 'tool', maxStack: STACK_SINGLE, bucket: { action: 'pour', result: 'bucket' }, presentation: { color: 0x4a86d8, icon: 'WEi' } },

  // ── weapons + ammo ─────────────────────────────────────────────────────────
  kitchen_knife: { name: 'Küchenmesser', category: 'weapon', maxStack: STACK_SINGLE, melee: { damage: 10, range: 1.8, cooldown: 0.35, knockback: 0.5 }, presentation: { color: 0xc8ccd0, icon: 'Msr' } },
  baseball_bat: { name: 'Baseballschläger', category: 'weapon', maxStack: STACK_SINGLE, melee: { damage: 18, range: 2.2, cooldown: 0.6, knockback: 1.6 }, presentation: { color: 0xc49a5c, icon: 'Bsb' } },
  machete: { name: 'Machete', category: 'weapon', maxStack: STACK_SINGLE, melee: { damage: 26, range: 2.2, cooldown: 0.45, knockback: 0.8 }, presentation: { color: 0xb8bec4, icon: 'Mch' } },
  pitchfork: { name: 'Heugabel', category: 'weapon', maxStack: STACK_SINGLE, melee: { damage: 20, range: 2.9, cooldown: 0.7, knockback: 1.2 }, presentation: { color: 0x8f7a58, icon: 'Hgb' } },
  pistol: { name: 'Pistole', category: 'weapon', maxStack: STACK_SINGLE, ranged: { damage: 22, range: 35, cooldown: 0.35, ammo: 'ammo_9mm', pellets: 1, spreadDeg: 2, knockback: 0.5 }, presentation: { color: 0x3a3d42, icon: 'Pst' } },
  shotgun: { name: 'Schrotflinte', category: 'weapon', maxStack: STACK_SINGLE, ranged: { damage: 12, range: 18, cooldown: 0.9, ammo: 'ammo_shell', pellets: 6, spreadDeg: 20, knockback: 1.5 }, presentation: { color: 0x5a4632, icon: 'Sft' } },
  rifle: { name: 'Gewehr', category: 'weapon', maxStack: STACK_SINGLE, ranged: { damage: 60, range: 60, cooldown: 1.0, ammo: 'ammo_rifle', pellets: 1, spreadDeg: 0.5, knockback: 1 }, presentation: { color: 0x4b5a3a, icon: 'Gwr' } },
  ammo_9mm: { name: '9-mm-Munition', category: 'ammo', maxStack: STACK_AMMO, presentation: { color: 0xc9a43a, icon: '9mm' } },
  ammo_shell: { name: 'Schrotpatronen', category: 'ammo', maxStack: STACK_AMMO, presentation: { color: 0xb8402e, icon: 'Pat' } },
  ammo_rifle: { name: 'Gewehrmunition', category: 'ammo', maxStack: STACK_AMMO, presentation: { color: 0xa88a3a, icon: 'GMu' } },

  // ── consumables ────────────────────────────────────────────────────────────
  canned_food: { name: 'Konserve', category: 'food', maxStack: STACK_FOOD, consumable: { hunger: 40, useTime: 1 }, presentation: { color: 0xb0b6bc, icon: 'Kns' } },
  apple: { name: 'Apfel', category: 'food', maxStack: STACK_FOOD, consumable: { hunger: 15, thirst: 5, useTime: 0.5 }, presentation: { color: 0xd8322e, icon: 'Apf' } },
  bread: { name: 'Brot', category: 'food', maxStack: STACK_FOOD, consumable: { hunger: 30, useTime: 0.8 }, presentation: { color: 0xc8904a, icon: 'Brd' } },
  raw_meat: { name: 'Rohes Fleisch', category: 'food', maxStack: STACK_FOOD, consumable: { hunger: 20, health: -5, useTime: 0.8 }, presentation: { color: 0xc0484e, icon: 'Fls' } },
  water_bottle: { name: 'Wasserflasche', category: 'food', maxStack: STACK_FOOD, consumable: { thirst: 40, useTime: 0.8 }, presentation: { color: 0x5aa8e0, icon: 'Wsr' } },
  dirty_water: { name: 'Schmutzwasser', category: 'food', maxStack: STACK_FOOD, consumable: { thirst: 25, health: -8, useTime: 0.8 }, presentation: { color: 0x7a8a5a, icon: 'SWs' } },
  bandage: { name: 'Verband', category: 'medical', maxStack: STACK_MEDICAL, consumable: { health: 20, useTime: 1.5 }, presentation: { color: 0xeee6d6, icon: 'Vbd' } },
  medkit: { name: 'Medkit', category: 'medical', maxStack: STACK_MEDICAL, consumable: { health: 60, useTime: 3 }, presentation: { color: 0xd83a3a, icon: 'Med' } },
  painkillers: { name: 'Schmerzmittel', category: 'medical', maxStack: STACK_MEDICAL, consumable: { health: 15, useTime: 0.5 }, presentation: { color: 0xe8e0f0, icon: 'Smm' } },
};
