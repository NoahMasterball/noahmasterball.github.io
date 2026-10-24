// OWNER: agent "worldgen" (A). Foreground tile definitions.
// Tier table (shared with tool items in items.ts): hand power 1, wood 2, stone 3, iron 4.
//   minPower 1: soft natural ground, wood, furniture · 2: stone, brick, coal/copper, furnace
//   3: iron ore, concrete, asphalt · 4: metal · bedrock: Infinity.
// Furniture (containers, stations, torch, scrap pile) is non-solid: bodies walk through it, liquid
// flows around it, zombies never need to break it (they only break what blocks them).
import type { TileDef, TileId } from './schema.ts';

// NEW — stone body colour reused by the ore tiles so ores read as "stone with specks".
const STONE_COLOR = 0x828288;

const SOLID = { solid: true, blocksLiquid: true, transparent: false, gravity: false, light: 0 } as const;
/** Generated ground (terrain, ores): zombies other than diggers never break it. */
const NATURAL = { ...SOLID, natural: true } as const;
/** Built material: zombies with breakPower break it when it blocks them. */
const BUILT = { ...SOLID, natural: false } as const;
const FURNITURE = { solid: false, blocksLiquid: false, transparent: true, gravity: false, light: 0, natural: false } as const;

export const TILES: Record<TileId, TileDef> = {
  air: {
    name: 'Luft', solid: false, blocksLiquid: false, transparent: true, gravity: false, light: 0, natural: true,
    hardness: 0, tool: 'any', minPower: 0, drop: null, zombieHealth: Infinity,
    presentation: { color: 0x000000 },
  },
  dirt: {
    name: 'Erde', ...NATURAL, hardness: 0.6, tool: 'shovel', minPower: 1, drop: 'dirt', zombieHealth: 60,
    presentation: { color: 0x976b4b, accent: 0x6e4a32 },
  },
  grass: {
    name: 'Gras', ...NATURAL, hardness: 0.7, tool: 'shovel', minPower: 1, drop: 'dirt', zombieHealth: 60,
    presentation: { color: 0x2fb53a, accent: 0x15641e },
  },
  stone: {
    name: 'Stein', ...NATURAL, hardness: 2.5, tool: 'pick', minPower: 2, drop: 'stone', zombieHealth: 250,
    presentation: { color: STONE_COLOR, accent: 0x5e5e66 },
  },
  sand: {
    name: 'Sand', ...NATURAL, gravity: true, hardness: 0.5, tool: 'shovel', minPower: 1, drop: 'sand', zombieHealth: 60,
    presentation: { color: 0xdcc878, accent: 0xc2a95c },
  },
  gravel: {
    name: 'Kies', ...NATURAL, gravity: true, hardness: 0.7, tool: 'shovel', minPower: 1, drop: 'gravel', zombieHealth: 70,
    presentation: { color: 0x8a8580, accent: 0x6e6a66 },
  },
  clay: {
    name: 'Lehm', ...NATURAL, hardness: 0.9, tool: 'shovel', minPower: 1, drop: 'clay', zombieHealth: 80,
    presentation: { color: 0xa85a48, accent: 0x84443a },
  },
  bedrock: {
    name: 'Grundgestein', ...NATURAL, hardness: Infinity, tool: 'pick', minPower: Infinity, drop: null,
    zombieHealth: Infinity, presentation: { color: 0x34343c, accent: 0x1c1c22 },
  },
  // Tree parts are background-like: walk through trunks and crowns (Terraria style).
  log: {
    name: 'Baumstamm', solid: false, blocksLiquid: false, transparent: false, gravity: false, light: 0, natural: true,
    hardness: 1.5, tool: 'axe', minPower: 1, drop: 'wood', zombieHealth: 200,
    presentation: { color: 0x8c5e3a, accent: 0x5a3a22 },
  },
  leaves: {
    name: 'Laub', solid: false, blocksLiquid: false, transparent: true, gravity: false, light: 0, natural: true,
    hardness: 0.2, tool: 'axe', minPower: 1, drop: null, zombieHealth: 20,
    presentation: { color: 0x2f9e34, accent: 0x15561c },
  },
  planks: {
    name: 'Holzbretter', ...BUILT, hardness: 1.2, tool: 'axe', minPower: 1, drop: 'planks', zombieHealth: 150,
    presentation: { color: 0xa87a48, accent: 0x8a6238 },
  },
  brick: {
    name: 'Ziegel', ...BUILT, hardness: 3, tool: 'pick', minPower: 2, drop: 'brick', zombieHealth: 400,
    presentation: { color: 0x9c4a36, accent: 0xb9a68e },
  },
  concrete: {
    name: 'Beton', ...BUILT, hardness: 5, tool: 'pick', minPower: 3, drop: 'concrete', zombieHealth: 900,
    presentation: { color: 0x9a9a94, accent: 0x85857f },
  },
  asphalt: {
    name: 'Asphalt', ...BUILT, hardness: 4, tool: 'pick', minPower: 3, drop: 'stone', zombieHealth: 700,
    presentation: { color: 0x3d3d40, accent: 0x55555a },
  },
  glass: {
    name: 'Glas', ...BUILT, transparent: true, hardness: 0.5, tool: 'pick', minPower: 1, drop: null, zombieHealth: 15,
    presentation: { color: 0xa8d8e8, accent: 0xe0f4fa },
  },
  metal: {
    name: 'Metall', ...BUILT, hardness: 6, tool: 'pick', minPower: 4, drop: 'metal_sheet', zombieHealth: 1500,
    presentation: { color: 0x6e7a82, accent: 0x9aa6ae },
  },
  hay: {
    name: 'Heuballen', ...BUILT, hardness: 0.4, tool: 'any', minPower: 1, drop: 'hay', zombieHealth: 60,
    presentation: { color: 0xd8b850, accent: 0xb89a3a },
  },
  wheat: {
    name: 'Weizen', ...FURNITURE, hardness: 0.1, tool: 'any', minPower: 1, drop: 'wheat', zombieHealth: 5,
    presentation: { color: 0xd4b04a, accent: 0x8a9a3a },
  },
  // Blocks bodies, lets water through (the one allowed exception in validateContent).
  fence: {
    name: 'Zaun', solid: true, blocksLiquid: false, transparent: true, gravity: false, light: 0, natural: false,
    hardness: 1, tool: 'axe', minPower: 1, drop: 'fence', zombieHealth: 80,
    presentation: { color: 0x8a6238, accent: 0x6b4a2b },
  },
  door: {
    name: 'Tür', ...BUILT, hardness: 1.2, tool: 'axe', minPower: 1, drop: 'door', zombieHealth: 60,
    presentation: { color: 0x7a5230, accent: 0xc8a050 },
  },
  workbench: {
    name: 'Werkbank', ...FURNITURE, hardness: 1.2, tool: 'axe', minPower: 1, drop: 'workbench', zombieHealth: 120,
    station: true, presentation: { color: 0x9a6e40, accent: 0x5e4228 },
  },
  furnace: {
    name: 'Ofen', ...FURNITURE, light: 0.6, hardness: 2.5, tool: 'pick', minPower: 2, drop: 'furnace', zombieHealth: 300,
    station: true, presentation: { color: 0x5a5652, accent: 0xe08030 },
  },
  torch: {
    name: 'Fackel', ...FURNITURE, light: 1, hardness: 0.1, tool: 'any', minPower: 1, drop: 'torch', zombieHealth: 10,
    presentation: { color: 0xf0c040, accent: 0x6b4a2b },
  },
  chest: {
    name: 'Truhe', ...FURNITURE, hardness: 1.2, tool: 'axe', minPower: 1, drop: 'chest', zombieHealth: 100,
    containerSlots: 20, presentation: { color: 0x9a6a30, accent: 0xd8b048 },
  },
  crate: {
    name: 'Kiste', ...FURNITURE, hardness: 1, tool: 'axe', minPower: 1, drop: 'planks', zombieHealth: 80,
    containerSlots: 10, presentation: { color: 0xb08a50, accent: 0x7a5a30 },
  },
  fridge: {
    name: 'Kühlschrank', ...FURNITURE, hardness: 2, tool: 'pick', minPower: 1, drop: 'scrap', zombieHealth: 200,
    containerSlots: 8, presentation: { color: 0xd8dcd8, accent: 0x9aa0a0 },
  },
  cabinet: {
    name: 'Schrank', ...FURNITURE, hardness: 1.2, tool: 'axe', minPower: 1, drop: 'planks', zombieHealth: 100,
    containerSlots: 8, presentation: { color: 0x8a5e3a, accent: 0xc8a070 },
  },
  locker: {
    name: 'Spind', ...FURNITURE, hardness: 2, tool: 'pick', minPower: 1, drop: 'scrap', zombieHealth: 250,
    containerSlots: 10, presentation: { color: 0x5e7a6a, accent: 0x3e5248 },
  },
  ore_coal: {
    name: 'Kohleerz', ...NATURAL, hardness: 3, tool: 'pick', minPower: 2, drop: 'coal', zombieHealth: 300,
    presentation: { color: STONE_COLOR, accent: 0x1e1e1e },
  },
  ore_copper: {
    name: 'Kupfererz', ...NATURAL, hardness: 3.5, tool: 'pick', minPower: 2, drop: 'copper_ore', zombieHealth: 320,
    presentation: { color: STONE_COLOR, accent: 0xc87a3a },
  },
  ore_iron: {
    name: 'Eisenerz', ...NATURAL, hardness: 4, tool: 'pick', minPower: 3, drop: 'iron_ore', zombieHealth: 350,
    presentation: { color: STONE_COLOR, accent: 0xd8b8a0 },
  },
  scrap_pile: {
    name: 'Schrotthaufen', ...FURNITURE, hardness: 0.6, tool: 'any', minPower: 1, drop: 'scrap', zombieHealth: 60,
    presentation: { color: 0x7a6a5a, accent: 0xa07040 },
  },
  door_open: {
    name: 'Tür (offen)', ...FURNITURE, hardness: 1.2, tool: 'axe', minPower: 1, drop: 'door', zombieHealth: 60,
    presentation: { color: 0x5e3e22, accent: 0xc8a050 },
  },
};
