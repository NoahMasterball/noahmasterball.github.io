// Content schema: every id list and every definition type. The id arrays are the single source
// of truth for what exists; data files are `Record<Id, Def>` so TypeScript forces completeness.
// Adding an id here makes every data file that maps it fail to compile until it is filled in.
// Colours are 0xRRGGBB numbers. Units: tiles, seconds (see src/config/sim.ts).

// ── Tiles (foreground layer) ────────────────────────────────────────────────
// Index in this array = numeric tile id stored in the world grid. 'air' MUST stay index 0.
// Append new ids at the end so saved worlds keep their meaning.
export const TILE_IDS = [
  'air',
  'dirt',
  'grass',
  'stone',
  'sand',
  'gravel',
  'clay',
  'bedrock',
  'log',
  'leaves',
  'planks',
  'brick',
  'concrete',
  'asphalt',
  'glass',
  'metal',
  'hay',
  'wheat',
  'fence',
  'door',
  'workbench',
  'furnace',
  'torch',
  'chest',
  'crate',
  'fridge',
  'cabinet',
  'locker',
  'ore_coal',
  'ore_copper',
  'ore_iron',
  'scrap_pile',
  'door_open',
] as const;
export type TileId = (typeof TILE_IDS)[number];

// ── Walls (background layer, not solid, block nothing but light/visual) ──────
export const WALL_IDS = ['none', 'dirt_wall', 'stone_wall', 'wood_wall', 'brick_wall', 'concrete_wall'] as const;
export type WallId = (typeof WALL_IDS)[number];

// ── Items ────────────────────────────────────────────────────────────────────
export const ITEM_IDS = [
  // blocks / placeables
  'dirt',
  'stone',
  'sand',
  'gravel',
  'clay',
  'wood',
  'planks',
  'brick',
  'concrete',
  'glass',
  'metal_sheet',
  'hay',
  'fence',
  'door',
  'workbench',
  'furnace',
  'torch',
  'chest',
  // materials
  'coal',
  'copper_ore',
  'iron_ore',
  'copper_bar',
  'iron_bar',
  'scrap',
  'nails',
  'cloth',
  'rope',
  'seeds',
  'wheat',
  // tools
  'pickaxe_wood',
  'pickaxe_stone',
  'pickaxe_iron',
  'axe_wood',
  'axe_iron',
  'shovel',
  'bucket',
  'bucket_water',
  // weapons + ammo
  'kitchen_knife',
  'baseball_bat',
  'machete',
  'pitchfork',
  'pistol',
  'shotgun',
  'rifle',
  'ammo_9mm',
  'ammo_shell',
  'ammo_rifle',
  // consumables
  'canned_food',
  'apple',
  'bread',
  'raw_meat',
  'water_bottle',
  'dirty_water',
  'bandage',
  'medkit',
  'painkillers',
  // background walls (placesWall)
  'wood_wall',
  'brick_wall',
  'concrete_wall',
] as const;
export type ItemId = (typeof ITEM_IDS)[number];

// ── Biomes ───────────────────────────────────────────────────────────────────
// Surface biomes are laid out left→right along the world; 'caves' and 'deep' are depth layers
// that replace the column biome below WORLD.cavesDepth / WORLD.deepDepth.
export const BIOME_IDS = ['plains', 'farm', 'forest', 'town', 'city', 'military', 'caves', 'deep'] as const;
export type BiomeId = (typeof BIOME_IDS)[number];
/** Parallax background tree layers (far pines, near forest) — densities live in BiomeDef.presentation.backdrop. */
export const BACKDROP_LAYERS = ['far', 'near'] as const;
export type BackdropLayerId = (typeof BACKDROP_LAYERS)[number];

// ── Zombies ──────────────────────────────────────────────────────────────────
export const ZOMBIE_IDS = ['walker', 'runner', 'crawler', 'brute', 'digger', 'soldier'] as const;
export type ZombieId = (typeof ZOMBIE_IDS)[number];

// ── Loot tables ──────────────────────────────────────────────────────────────
export const LOOT_TABLE_IDS = [
  'farm_house',
  'farm_barn',
  'town_house',
  'town_shop',
  'city_apartment',
  'city_store',
  'military_crate',
  'forest_cabin',
  'cave_chest',
  'deep_chest',
  'surface_scrap',
  'zombie_common',
  'zombie_brute',
  'zombie_soldier',
] as const;
export type LootTableId = (typeof LOOT_TABLE_IDS)[number];

// ── Recipes ──────────────────────────────────────────────────────────────────
export const RECIPE_IDS = [
  'planks',
  'workbench',
  'torch',
  'chest',
  'door',
  'fence',
  'furnace',
  'pickaxe_wood',
  'pickaxe_stone',
  'pickaxe_iron',
  'axe_wood',
  'axe_iron',
  'shovel',
  'bucket',
  'copper_bar',
  'iron_bar',
  'nails',
  'bandage',
  'machete',
  'brick',
  'glass',
  'bread',
  'purify_water',
  'wood_wall',
  'brick_wall',
  'concrete_wall',
  'ammo_9mm',
] as const;
export type RecipeId = (typeof RECIPE_IDS)[number];

// ── Structures placed by world generation ───────────────────────────────────
export const STRUCTURE_KINDS = [
  'farmhouse',
  'barn',
  'field',
  'cabin',
  'house',
  'shop',
  'apartment',
  'store',
  'bunker',
  'watchtower',
  'cave_room',
] as const;
export type StructureKind = (typeof STRUCTURE_KINDS)[number];

export type ToolKind = 'pick' | 'axe' | 'shovel';
export type Range = readonly [min: number, max: number];

// ── Definitions ──────────────────────────────────────────────────────────────

export interface TileDef {
  /** Display name (German, shown in UI). */
  name: string;
  /** Blocks bodies (players, zombies, drops). */
  solid: boolean;
  /** Blocks liquid flow. Usually === solid; doors/fences differ. */
  blocksLiquid: boolean;
  /** Lets light/sky through (air, glass, leaves). Used by lighting + 'is surface' checks. */
  transparent: boolean;
  /** Mining work needed (hardness units; effective tool speed divides it). 0 = instant. */
  hardness: number;
  /** Tool that mines it at full speed; other tools/hands mine at hand speed. */
  tool: ToolKind | 'any';
  /** Minimum tool power to break it at all (bedrock: Infinity). */
  minPower: number;
  /** Item dropped when broken (null = nothing). */
  drop: ItemId | null;
  /** Falls down when unsupported (sand, gravel). */
  gravity: boolean;
  /** Light emitted (0..1); torches, furnaces. */
  light: number;
  /** Zombie damage needed to break it (Infinity = zombies cannot). */
  zombieHealth: number;
  /**
   * Generated ground (terrain, ores, trees). Non-digger zombies only break tiles that are not
   * natural or were placed by the player (WorldGrid.placed); diggers break any finite tile.
   */
  natural: boolean;
  /** Opens an inventory when used. Slot count of that inventory. */
  containerSlots?: number;
  /** Crafting station recipes can require. */
  station?: boolean;
  presentation: { color: number; /** Optional second colour for simple patterns. */ accent?: number };
}

export interface WallDef {
  name: string;
  drop: ItemId | null;
  presentation: { color: number };
}

export interface ToolStats {
  kind: ToolKind;
  /** Compared with TileDef.minPower. */
  power: number;
  /** Hardness units per second. */
  speed: number;
}

export interface MeleeStats {
  damage: number;
  /** Reach from body centre in tiles. */
  range: number;
  cooldown: number;
  knockback: number;
}

export interface RangedStats {
  damage: number;
  range: number;
  cooldown: number;
  ammo: ItemId;
  pellets: number;
  /** Total cone in degrees. */
  spreadDeg: number;
  knockback: number;
}

export interface ConsumableStats {
  health?: number;
  hunger?: number;
  thirst?: number;
  /** Seconds the use takes (channel). */
  useTime: number;
}

export type ItemCategory = 'block' | 'material' | 'tool' | 'weapon' | 'ammo' | 'food' | 'medical';

export interface ItemDef {
  name: string;
  category: ItemCategory;
  maxStack: number;
  /** Placing the item puts this tile into the world. */
  places?: TileId;
  placesWall?: WallId;
  tool?: ToolStats;
  melee?: MeleeStats;
  ranged?: RangedStats;
  consumable?: ConsumableStats;
  /** Bucket behaviour: 'take' scoops a full liquid cell, 'pour' places one. */
  bucket?: { action: 'take' | 'pour'; result: ItemId };
  presentation: { color: number; /** Short glyph/emoji-free text for the slot (≤3 chars). */ icon: string };
}

export interface LootEntry {
  item: ItemId;
  weight: number;
  count: Range;
}

export interface LootTableDef {
  /** Number of entries drawn (with replacement). */
  rolls: Range;
  /** Chance (0..1) that the table yields nothing at all (empty container). */
  emptyChance: number;
  entries: readonly LootEntry[];
}

export interface ZombieDef {
  name: string;
  health: number;
  /** Walk speed while chasing (tiles/s); wandering uses wanderSpeedFactor × this. */
  speed: number;
  jumpSpeed: number;
  width: number;
  height: number;
  /** Contact damage per hit and seconds between hits. */
  damage: number;
  attackCooldown: number;
  attackRange: number;
  /** Line-of-sight detection radius (tiles). */
  sight: number;
  /** Noise detection radius (tiles), multiplied by noise sources. */
  hearing: number;
  /** Damage per second dealt to blocks in the way (TileDef.zombieHealth). 0 = never breaks. */
  breakPower: number;
  /** Can dig through natural dirt/stone towards the player (digger). */
  digs: boolean;
  loot: LootTableId;
  presentation: { color: number; accent: number };
}

export interface RecipeDef {
  output: { item: ItemId; count: number };
  inputs: readonly { item: ItemId; count: number }[];
  /** Tile that must be within PLAYER.reach × 2 of the player (null = craft anywhere). */
  station: TileId | null;
}

export interface StructureSpawn {
  kind: StructureKind;
  /** Expected structures per 100 columns of this biome. */
  per100Columns: number;
}

export interface BiomeDef {
  name: string;
  /** Surface biomes are placed as horizontal zones; depth layers are not. */
  surface: boolean;
  /** Zone width in columns (surface biomes only). */
  width: Range;
  terrain: {
    /** Height amplitude (tiles) of the surface noise. */
    amplitude: number;
    /** Noise wavelength (columns). */
    wavelength: number;
    /** Shift of the mean surface (negative = higher). */
    offset: number;
  };
  topTile: TileId;
  fillTile: TileId;
  /** Trees per 100 columns. */
  trees: number;
  structures: readonly StructureSpawn[];
  /** Loot table per container tile placed in this biome's structures. */
  containerLoot: Partial<Record<TileId, LootTableId>>;
  /** Loose loot (scrap piles) per 100 columns, and the table they roll. */
  groundLoot: { per100Columns: number; table: LootTableId };
  /** Surface lakes per 100 columns (0 = none). */
  lakes: number;
  zombies: {
    /** Target live zombies per 100 columns of this biome during the day. */
    density: number;
    /** Density multiplier at night. */
    nightMultiplier: number;
    weights: Partial<Record<ZombieId, number>>;
  };
  presentation: {
    /** Zenith colour of the day sky. */
    sky: number;
    /** Horizon colour and fog/tint for the parallax background. */
    haze: number;
    /** Background tree density per parallax layer (0 = none, 1 = closed forest). */
    backdrop: Record<BackdropLayerId, number>;
  };
}
