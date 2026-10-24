// Simulation state: the one owner of every gameplay value. The client only READS it.
// Everything here is plain data (typed arrays, arrays, Maps of plain objects) so a world can be
// saved/loaded later. Never cache derived values here (compute them in the owning system).
import type { BiomeId, ItemId, ZombieId } from '../data/schema.ts';
import type { RngState } from './rng.ts';

/** Axis-aligned body. (x, y) = TOP-LEFT corner in tiles; y grows downward. */
export interface Body {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  onGround: boolean;
  /** Overlaps liquid deeper than LIQUID.deepAmount. */
  inLiquid: boolean;
  /** Highest downward speed since last landing (fall damage). */
  fallSpeed: number;
}

export interface ItemStack {
  item: ItemId;
  count: number;
}

/** Fixed-size slot array; null = empty slot. */
export interface Inventory {
  slots: (ItemStack | null)[];
}

export interface Player {
  body: Body;
  facing: -1 | 1;
  health: number;
  hunger: number;
  thirst: number;
  /** slots[0 .. PLAYER.hotbarSlots-1] are the hotbar. */
  inventory: Inventory;
  hotbar: number;
  /** Seconds until the held item can be used again. */
  useCooldown: number;
  /** Seconds of remaining invulnerability. */
  invuln: number;
  /** Consumable being used (channel), or null. */
  using: { slot: number; remaining: number } | null;
  /** Tile index of an open container (UI shows it), or -1. */
  openContainer: number;
  /** Secondary button state of the previous tick (edge detection for open/toggle/bucket). */
  secondaryHeld: boolean;
  dead: boolean;
  respawnTimer: number;
  spawnX: number;
  spawnY: number;
}

export type ZombieMode = 'idle' | 'wander' | 'chase' | 'attack' | 'break' | 'dig';

export interface Zombie {
  id: number;
  kind: ZombieId;
  body: Body;
  facing: -1 | 1;
  health: number;
  mode: ZombieMode;
  /** Generic AI timer (wander turn, lose-target, …). */
  timer: number;
  attackCooldown: number;
  /** Last known target position (tiles), or null. */
  targetX: number | null;
  targetY: number | null;
  /** Tile index being broken/dug, or -1. */
  breakTile: number;
  /** Biome the zombie belongs to (spawn budget accounting). */
  home: BiomeId;
}

export interface Drop {
  id: number;
  body: Body;
  stack: ItemStack;
  age: number;
}

/** Things that happened this tick, for audio/particles/HUD. Cleared at the start of each step. */
export type SimEvent =
  | { type: 'tileBroken'; x: number; y: number; tile: number }
  | { type: 'tilePlaced'; x: number; y: number; tile: number }
  | { type: 'tileHit'; x: number; y: number; tile: number }
  | { type: 'wallBroken'; x: number; y: number; wall: number }
  | { type: 'melee'; x: number; y: number; dir: -1 | 1 }
  | { type: 'shot'; x0: number; y0: number; x1: number; y1: number }
  | { type: 'hit'; target: 'player' | 'zombie'; id: number; x: number; y: number; damage: number }
  | { type: 'zombieDied'; id: number; x: number; y: number }
  | { type: 'playerDied' }
  | { type: 'pickup'; item: ItemId; count: number }
  | { type: 'crafted'; item: ItemId; count: number }
  | { type: 'consumed'; item: ItemId }
  | { type: 'splash'; x: number; y: number }
  | { type: 'noise'; x: number; y: number; loudness: number };

export interface WorldGrid {
  width: number;
  height: number;
  /** Foreground tile per cell: index into TILE_IDS. */
  fg: Uint16Array;
  /** Background wall per cell: index into WALL_IDS. */
  wall: Uint8Array;
  /** Liquid (water) amount per cell, 0..LIQUID.max. */
  liquid: Uint8Array;
  /** Surface biome per column: index into BIOME_IDS. Depth layers derive from surfaceY. */
  biome: Uint8Array;
  /** Original generated surface row per column (biome depth layers, spawning, sky light). */
  surfaceY: Int16Array;
  /** Mining progress (0..1) per tile index, plus seconds since the last hit. */
  mining: Map<number, { progress: number; idle: number }>;
  /** Accumulated zombie damage per tile index. */
  zombieDamage: Map<number, number>;
  /** Cells whose liquid may move next liquid step (owned by src/sim/liquid.ts). */
  liquidActive: Set<number>;
  /** Cells holding a gravity tile that may fall (owned by src/sim/falling.ts). */
  fallingActive: Set<number>;
  /** Incremented whenever any cell of a chunk changes (fg/wall/liquid). Renderer compares. */
  chunkRev: Uint32Array;
  /** 1 = foreground tile was placed by the player (zombie breaking rules, future saves). */
  placed: Uint8Array;
  chunksX: number;
  chunksY: number;
}

export interface SimState {
  seed: number;
  tick: number;
  /** 0..1, 0 = midnight, 0.5 = noon (DAY_NIGHT). */
  timeOfDay: number;
  day: number;
  rng: RngState;
  nextId: number;
  world: WorldGrid;
  player: Player;
  zombies: Zombie[];
  drops: Drop[];
  /** Container inventories keyed by tile index of the container tile. */
  containers: Map<number, Inventory>;
  events: SimEvent[];
  /** Accumulators for systems that run slower than TICK_RATE. */
  accum: { liquid: number; falling: number; spawn: number };
}
