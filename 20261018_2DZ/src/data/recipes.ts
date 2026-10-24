// OWNER: agent "player" (C). Crafting recipes. `station` must be a tile with TileDef.station.
import type { ItemId, RecipeDef, RecipeId, TileId } from './schema.ts';

function r(item: ItemId, count: number, inputs: Partial<Record<ItemId, number>>, station: TileId | null): RecipeDef {
  return {
    output: { item, count },
    inputs: (Object.entries(inputs) as [ItemId, number][]).map(([i, c]) => ({ item: i, count: c })),
    station,
  };
}

export const RECIPES: Record<RecipeId, RecipeDef> = {
  // basics (anywhere)
  planks: r('planks', 4, { wood: 1 }, null),
  workbench: r('workbench', 1, { planks: 10 }, null),
  torch: r('torch', 4, { wood: 1, coal: 1 }, null),
  bandage: r('bandage', 1, { cloth: 2 }, null),
  // workbench
  chest: r('chest', 1, { planks: 8 }, 'workbench'),
  door: r('door', 1, { planks: 6 }, 'workbench'),
  fence: r('fence', 2, { planks: 2 }, 'workbench'),
  furnace: r('furnace', 1, { stone: 20 }, 'workbench'),
  pickaxe_wood: r('pickaxe_wood', 1, { planks: 8 }, 'workbench'),
  pickaxe_stone: r('pickaxe_stone', 1, { stone: 6, wood: 3 }, 'workbench'),
  pickaxe_iron: r('pickaxe_iron', 1, { iron_bar: 5, wood: 3 }, 'workbench'),
  axe_wood: r('axe_wood', 1, { planks: 6 }, 'workbench'),
  axe_iron: r('axe_iron', 1, { iron_bar: 4, wood: 3 }, 'workbench'),
  shovel: r('shovel', 1, { stone: 3, wood: 2 }, 'workbench'),
  bucket: r('bucket', 1, { iron_bar: 3 }, 'workbench'),
  nails: r('nails', 10, { iron_bar: 1 }, 'workbench'),
  machete: r('machete', 1, { iron_bar: 3, wood: 1, cloth: 1 }, 'workbench'),
  // Walls: one block → one wall, and mining the wall gives the block back (WallDef.drop), so
  // walls are never a duplication loop.
  wood_wall: r('wood_wall', 1, { planks: 1 }, 'workbench'),
  brick_wall: r('brick_wall', 1, { brick: 1 }, 'workbench'),
  concrete_wall: r('concrete_wall', 1, { concrete: 1 }, 'workbench'),
  // Copper casings + coal (powder) → pistol rounds.
  ammo_9mm: r('ammo_9mm', 10, { copper_bar: 1, coal: 1 }, 'workbench'),
  // furnace
  copper_bar: r('copper_bar', 1, { copper_ore: 2, coal: 1 }, 'furnace'),
  iron_bar: r('iron_bar', 1, { iron_ore: 2, coal: 1 }, 'furnace'),
  brick: r('brick', 1, { clay: 1 }, 'furnace'),
  glass: r('glass', 1, { sand: 2 }, 'furnace'),
  bread: r('bread', 1, { wheat: 3 }, 'furnace'),
  purify_water: r('water_bottle', 1, { dirty_water: 1, coal: 1 }, 'furnace'),
};
