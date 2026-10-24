// Global simulation rules. Per-content numbers (tiles, items, zombies, biomes, loot) live in
// src/data/. Units: tiles (1 tile = 1 unit, y grows DOWN), seconds, tiles/second.
// Node-safe: imported by sim, data, client and tests (ARCHITECTURE.md §2).

export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

export const WORLD = {
  width: 1600,
  height: 480,
  /** Mean surface row; terrain noise moves it per biome (BiomeDef.terrain). */
  surfaceBase: 150,
  /** Rows of dirt under the surface before stone starts (± noise). */
  dirtDepth: 14,
  /** Depth below the local surface where the 'caves' biome begins. */
  cavesDepth: 40,
  /** Depth below the local surface where the 'deep' biome begins. */
  deepDepth: 200,
  bedrockRows: 4,
  /** Columns kept free of structures at both world edges. */
  edgeMargin: 40,
  /** Render/dirty-tracking chunk edge length in tiles (power of two). */
  chunkSize: 32,
  defaultSeed: 20261018,
} as const;

export const PHYSICS = {
  gravity: 80,
  maxFallSpeed: 50,
  /** Max ledge height (tiles) a walking body steps up without jumping. */
  stepHeight: 1,
  /** Fall speed above which landing hurts; damage per extra tile/s. */
  fallDamageSpeed: 38,
  fallDamagePerSpeed: 2,
  /** Horizontal speed factor while the body overlaps water. */
  waterDrag: 0.5,
} as const;

export const PLAYER = {
  width: 1.5,
  height: 2.8,
  walkSpeed: 10,
  jumpSpeed: 26,
  /** Ground acceleration (tiles/s²); air uses airControl × this. */
  accel: 120,
  airControl: 0.5,
  /** Max distance (tiles) from body centre to the tile being mined/placed/used. */
  reach: 5.5,
  maxHealth: 100,
  maxHunger: 100,
  maxThirst: 100,
  /** Points lost per second. */
  hungerRate: 0.08,
  thirstRate: 0.12,
  /** Health lost per second while hunger or thirst is 0. */
  starveDamage: 1,
  /** Health regained per second while hunger and thirst are above regenThreshold. */
  regenRate: 0.5,
  regenThreshold: 60,
  inventorySlots: 40,
  hotbarSlots: 10,
  respawnSeconds: 5,
  /** Seconds of invulnerability after taking a hit. */
  hitInvuln: 0.4,
  /** Base mining speed with bare hands (hardness units per second). */
  handMiningSpeed: 1,
  handMiningPower: 1,
  handDamage: 4,
  handRange: 1.6,
  handCooldown: 0.4,
  handKnockback: 0.3,
  /** Distance at which item drops are pulled in / picked up. */
  pickupMagnet: 3,
  pickupRadius: 1,
  /** Starting inventory: item id → count. */
  startKit: { kitchen_knife: 1, pickaxe_wood: 1, torch: 5, canned_food: 2, water_bottle: 2 },
  /** Upward speed (tiles/s) while jump is held in deep liquid; high enough to climb out onto a bank. */
  swimSpeed: 16,
  /** Downward speed (tiles/s) while down is held in deep liquid. */
  sinkSpeed: 8,
  /** Seconds before the next item use after finishing a consumable. */
  consumeCooldown: 0.3,
  /** A bucket scoops a cell holding at least this fraction of LIQUID.max. */
  bucketMinFill: 0.9,
  /** An open container closes when farther than reach × this. */
  containerCloseFactor: 1.5,
  /** Crafting stations count within reach × this (RecipeDef.station). */
  stationReachFactor: 2,
  /** Seconds of invulnerability after respawning. */
  respawnInvuln: 2,
} as const;

export const LIQUID = {
  /** A full cell. Liquid amount per cell is 0..max (Uint8). */
  max: 255,
  /** Cells holding less than this after flowing evaporate (prevents endless thin films). */
  minAmount: 4,
  /** Liquid steps per second (decoupled from TICK_RATE for cost control). */
  stepsPerSecond: 30,
  /** Hard cap of active cells processed per liquid step; the rest wait for the next step. */
  maxActivePerStep: 25000,
  /** Fraction of the level difference moved sideways per step (0..0.5]. */
  sideFlowRate: 0.45,
  /** Amount above which a liquid counts as 'deep' (body swims, breath drains). */
  deepAmount: 128,
  /** Fraction of the way each cell of a connected resting layer moves to the layer mean per step. */
  layerLevelRate: 0.5,
  /** Layer spread (max − min) at or below which a resting layer snaps to an even level. */
  layerSnapSpread: 4,
} as const;

export const FALLING = {
  /** Gravity-affected tiles (TileDef.gravity) fall one row per this many seconds. */
  fallInterval: 0.05,
} as const;

export const MINING = {
  /** Mining progress on a tile decays back to 0 after this long without hits. */
  progressResetSeconds: 2,
  /** Seconds between two block placements while the place button is held. */
  placeCooldown: 0.15,
  /** Work (hardness units) needed to remove a background wall (mined at hand speed). */
  wallHardness: 1.5,
  /** Seconds between two tileHit events/noises while mining the same tile. */
  hitInterval: 0.25,
  /** Noise loudness of one mining hit (× ZombieDef.hearing). */
  noiseLoudness: 0.3,
} as const;

export const DAY_NIGHT = {
  /** Real seconds for one full day/night cycle. */
  cycleSeconds: 720,
  /** timeOfDay (0..1) where night starts and ends; 0 = midnight, 0.5 = noon. */
  nightStart: 0.8,
  nightEnd: 0.22,
  /** timeOfDay at world start (morning). */
  startTime: 0.3,
} as const;

export const SPAWN = {
  /** Global hard cap of live zombies. */
  maxZombies: 70,
  /** Spawn ring around the player (tiles): never closer than min, never further than max. */
  minDistance: 40,
  maxDistance: 80,
  /** Zombies further than this from the player are removed. */
  despawnDistance: 130,
  /** Spawn attempts per second; each attempt checks the local biome budget. */
  attemptsPerSecond: 2,
  /** Cap on zombies per 100 columns placed at world start: min(biome density, this) (spawn.ts). */
  initialPer100Columns: 4,
  /** Rows scanned downward from a candidate cell to find a floor to stand on. */
  floorSearchRows: 24,
  /** Chance that a spawn attempt looks underground (when the player is on the surface). */
  undergroundChance: 0.4,
  /** World start: candidate cells tried per zombie of the initial budget (most fail validation). */
  initialTriesPerZombie: 20,
} as const;

export const COMBAT = {
  /** Knockback speed applied to the hit body (tiles/s), scaled by weapon knockback. */
  knockbackBase: 12,
  /** Max hitscan distance for any ranged weapon (also capped by its own range). */
  maxRayDistance: 60,
  /** Zombie hearing radius multiplier for gunshots (× ZombieDef.hearing). */
  gunshotNoise: 3,
  /** Upward speed of a knockback hop = knockback speed × this (lifts the body off the ground). */
  knockbackLift: 0.4,
  /** Vertical extent (tiles) of the melee hit box, centred on the swing origin. */
  meleeHeight: 2.2,
} as const;

export const DROPS = {
  /** Item entities vanish after this many seconds. */
  lifetimeSeconds: 300,
  size: 0.6,
  /** Random sideways speed (±) and upward speed (tiles/s) of a freshly spawned drop. */
  popSpeed: 3,
  popUpSpeed: 6,
  /** A new drop joins an identical drop whose centre is within this distance. */
  mergeRadius: 1,
  /** Speed (tiles/s) at which the magnet pulls a drop towards the player. */
  magnetSpeed: 14,
  /** Seconds after spawning before a drop can be pulled in / picked up. */
  pickupDelay: 0.4,
  /** Drops thrown by the player (Q): throw speed (tiles/s) and pickup delay (s). */
  throwSpeed: 8,
  throwPickupDelay: 2,
  /** Horizontal deceleration (tiles/s²) of a drop lying on the ground. */
  groundFriction: 20,
} as const;

export const ZOMBIE_AI = {
  /** Wander walk speed = ZombieDef.speed × this. */
  wanderSpeedFactor: 0.35,
  /** Seconds between wander direction changes (random in range). */
  wanderTurnMin: 2,
  wanderTurnMax: 6,
  /** Chance that a new wander leg is spent standing still (idle). */
  idleChance: 0.3,
  /** Wandering zombies never walk off ledges deeper than this (tiles). */
  wanderMaxDrop: 4,
  /** Seconds a zombie keeps chasing the last known position after losing sight/sound. */
  loseTargetSeconds: 6,
  /** Upper bound (tiles) of any obstacle a zombie tries to jump; also capped by its jumpSpeed. */
  maxJumpTiles: 3,
  /** Horizontal acceleration (tiles/s²) towards the walk intent while airborne (knockback decay). */
  airAccel: 30,
  /** Eye height as a fraction of body height from the top (line-of-sight origin). */
  eyeFraction: 0.25,
  /** Overlapping zombies push each other apart at this speed (tiles/s). */
  separationSpeed: 1.5,
  /** …when their centres are closer than this fraction of their mean width. */
  separationOverlap: 0.8,
  /** Digger digs vertically when the target is within this horizontal distance (tiles). */
  digVerticalRange: 1.5,
  /** …and at least this many tiles above/below its feet/head. */
  digVerticalMin: 2,
} as const;
