// Client-only numbers: render, camera, lighting, input bindings, HUD, audio. Plain data.
// Sim rules live in src/config/sim.ts; per-content looks in src/data/* `presentation`.
// UI colours/fonts are CSS variables in index.html; canvas-only colours are 0xRRGGBB here.
import type { BiomeId, TileId, WallId } from '../data/schema.ts';

export const APP = {
  title: 'Rotland',
  /** URL query parameter for the world seed (?seed=123). */
  seedParam: 'seed',
} as const;

export const LOOP = {
  /** Frames longer than this (tab stalls) are clamped. */
  maxFrameSeconds: 0.25,
  /** Max simulation ticks stepped per rendered frame; the rest of the backlog is dropped. */
  maxTicksPerFrame: 8,
  /** Window (seconds) over which fps is measured for the debug overlay. */
  fpsWindowSeconds: 0.5,
} as const;

export const CAMERA = {
  /** CSS pixels per tile at zoom 1. */
  tileCssPx: 20,
  zoom: 1,
  /** Exponential follow rate (1/s); higher = snappier. */
  followRate: 9,
  /** Aim look-ahead: fraction of the cursor offset from the screen centre the camera leans. */
  lookAhead: 0.12,
  /** The camera centres the player's body a bit above its middle (tiles). */
  focusOffsetY: -1,
} as const;

export const RENDER = {
  /** Texels per tile in the chunk textures (pixel-art resolution). 10 = 2 CSS px per texel at
   *  CAMERA.tileCssPx 20, so the art stays crisp. */
  tileTexels: 10,
  /** Max chunk textures kept; the least recently drawn are dropped. */
  maxCachedChunks: 120,
  /** Max chunk textures (re)built per frame; the rest wait (keeps frame time bounded: one
   *  32×32 chunk at 10 texels costs ~10 ms). */
  maxChunkBuildsPerFrame: 3,
  /** Per-tile brightness variation (± fraction). */
  tileVariation: 0.07,
  /** Share of 2×2 texel blotches drawn in the accent colour (default 'noise' pattern). */
  blotchShare: 0.11,
  /** Per-texel noise (± fraction). */
  texelNoise: 0.05,
  /** Terraria-like edges where a tile borders an open cell: dark 1-texel outline (brightness
   *  factor of the texel colour), a lighter texel row just inside the top outline, and — for
   *  natural ground — rounded outer corners (radius in texels) plus irregular 1-texel notches
   *  (share of 2-texel edge segments notched). */
  outlineShade: 0.38,
  edgeHighlight: 0.16,
  cornerRadius: 5,
  edgeNotchShare: 0.35,
  /** Darkened 1-texel seam where two different natural materials meet (dirt ↔ stone). */
  seamShade: 0.62,
  /** Stone ('rock' pattern; ores = 'specks' on natural tiles): fragment size (texels), share of
   *  dark / light fragments, crack darkness, share of fragments that are ore nuggets. */
  rock: { cell: 4, darkShare: 0.26, lightShare: 0.2, light: 0.14, crackShade: 0.72, oreShare: 0.45 },
  /** Grass cap on 'grass' tiles: green depth below the outline (texels, min..max), how far it
   *  wraps down open sides (extra texels), blades drawn into the air cell above (share of
   *  columns, max height in texels), brightness of the sunlit top rows. `soil` = tile whose
   *  texture shows under the cap and which merges seamlessly with grass. */
  grass: { capMin: 3, capMax: 5, sideExtra: 3, bladeShare: 0.5, bladeMax: 3, topLight: 0.22, soil: 'dirt' as TileId },
  /** Walls (and the backdrop) are drawn at this brightness and saturation of their colour, so
   *  the background reads clearly darker and duller than the foreground. */
  wallShade: 0.5,
  wallSaturation: 0.6,
  /** Backdrop behind open underground cells without a wall (shallow / deep by WORLD.cavesDepth). */
  backdropWalls: { shallow: 'dirt_wall', deep: 'stone_wall' } as { shallow: WallId; deep: WallId },
  backdropShade: 0.34,
  /** Rows below the column's surface where the underground backdrop starts. */
  backdropStartDepth: 2,
  /** Liquid overlay: body colour, a lighter surface band (CSS px) and a soft band below it. */
  water: { color: 0x1d5fd8, alpha: 0.6, surfaceColor: 0x8cc4ff, surfaceAlpha: 0.75, surfaceCssPx: 2, glowAlpha: 0.22, glowCssPx: 5 },
  /** Cursor outline: colours are the CSS tokens --fg (in reach) / --danger (out of reach). */
  cursor: { alpha: 0.75, lineCssPx: 1.5 },
  /** Mining crack stages drawn over a tile being mined. */
  crackStages: 4,
  crackColor: 0x140f0a,
} as const;

/** Simple per-tile patterns drawn into the chunk textures (default 'noise'). */
export type TilePattern =
  | 'noise'
  | 'grass'
  | 'bricks'
  | 'planks'
  | 'specks'
  | 'log'
  | 'leaves'
  | 'glass'
  | 'box'
  | 'door'
  | 'torch'
  | 'stalks'
  | 'fence'
  | 'gravel'
  | 'metal'
  | 'stripes'
  | 'rock';

export const TILE_PATTERNS: Partial<Record<TileId, TilePattern>> = {
  grass: 'grass',
  stone: 'rock',
  bedrock: 'rock',
  brick: 'bricks',
  planks: 'planks',
  ore_coal: 'specks',
  ore_copper: 'specks',
  ore_iron: 'specks',
  scrap_pile: 'specks',
  log: 'log',
  leaves: 'leaves',
  glass: 'glass',
  chest: 'box',
  crate: 'box',
  fridge: 'box',
  cabinet: 'box',
  locker: 'box',
  workbench: 'box',
  furnace: 'box',
  door: 'door',
  door_open: 'door',
  torch: 'torch',
  wheat: 'stalks',
  fence: 'fence',
  gravel: 'gravel',
  metal: 'metal',
  asphalt: 'stripes',
  hay: 'stalks',
};

export const LIGHT = {
  /** Light grid margin around the view (tiles) so emitters just off-screen still light it. */
  margin: 14,
  /** Light lost per tile through open cells / through solid (opaque) cells. The solid value
   *  keeps the top ~6 tiles of ground readable in daylight before it fades to black. */
  airFalloff: 0.075,
  solidFalloff: 0.085,
  /** Sky light never drops below this at night for sky-exposed cells (night stays playable). */
  nightFloor: 0.42,
  /** Small light around the player so pitch-black caves stay navigable. */
  playerGlow: { radius: 4.5, intensity: 0.45 },
  /** Propagation sweeps (each = forward + backward raster pass). */
  sweeps: 2,
  /** Darkness colour of the overlay (deep blue-black). */
  shadowColor: 0x05060c,
  /** Warm tint added near emitters (torches). */
  emitterTint: { color: 0xffa94a, strength: 0.22 },
} as const;

export const SKY = {
  /** Night sky top / horizon colours. */
  nightTop: 0x05070f,
  nightHorizon: 0x141a2c,
  /** Dusk/dawn horizon tint and its maximum strength. */
  duskColor: 0xe0703a,
  duskStrength: 0.75,
  /** Day gradient: biome sky (zenith) → biome haze (horizon); horizon reached at this height fraction. */
  horizonAt: 0.8,
  /** Sky gradient drawn as this many flat bands (pixel-art stepping). */
  bands: 30,
  /**
   * Backdrop art: one backdrop pixel = one tile texel (RENDER.tileTexels). Sizes below are in
   * backdrop pixels ("art px").
   */
  sun: { radius: 9, color: 0xffe65a, core: 0xfffbe0, coreFrac: 0.6, rays: 4, rayColor: 0xfff3a0 },
  moon: { radius: 8, color: 0xe4eaf4, crater: 0xbcc6d6 },
  /** Stepped glow rings around sun/moon: radius multiple and alpha. */
  glow: [
    { r: 1.6, alpha: 0.28 },
    { r: 2.4, alpha: 0.12 },
  ],
  /** Moon glow strength relative to the sun's. */
  moonGlow: 0.5,
  /** Sun/moon arc height as a fraction of the view height. */
  arcHeight: 0.74,
  starCount: 90,
  /** Columns sampled across the view to blend biome sky colours and backdrop densities. */
  biomeSamples: 9,
  /**
   * Parallax layers share: factor = camera-follow fraction (0 = fixed); lift = how far the layer's
   * baseline sits above the on-screen surface (fraction of half the view height); fog = alpha of
   * the horizon colour laid over the layer (atmospheric depth).
   */
  mountains: {
    factor: 0.06,
    lift: 0.4,
    fog: 0.3,
    color: 0x6b9bd6,
    light: 0x96c0ec,
    /** Repeating strip width, peaks per strip, peak height range, slope (art px per art px). */
    period: 960,
    peaks: 11,
    height: [30, 78] as readonly [number, number],
    slope: [0.55, 0.95] as readonly [number, number],
    /** Ridge steps (art px) — silhouettes rise in stairs. */
    step: 2,
  },
  /** Tree layers back to front; density per biome = BiomeDef.presentation.backdrop[trees]. */
  treeLayers: [
    {
      trees: 'far',
      factor: 0.16,
      lift: 0.3,
      fog: 0.2,
      color: 0x3d8c8c,
      light: 0x56a7a0,
      trunk: 0x2c6668,
      /** Slot width (art px): at most one tree or building per slot. */
      slot: 5,
      height: [40, 80] as readonly [number, number],
      /** Crown width / height. */
      width: 0.36,
      /** Ground undulation amplitude and wavelength (art px). */
      hill: 7,
      hillWave: 70,
      building: 0x6f87a2,
      buildingLight: 0x88a0ba,
    },
    {
      trees: 'near',
      factor: 0.32,
      lift: 0.12,
      fog: 0.04,
      color: 0x2b7852,
      light: 0x3f9566,
      trunk: 0x22513c,
      slot: 8,
      height: [64, 124] as readonly [number, number],
      width: 0.4,
      hill: 5,
      hillWave: 50,
      building: 0x526579,
      buildingLight: 0x6a7f94,
    },
  ],
  /** Pre-rendered tree variants per layer. */
  treeVariants: 8,
  /** Crown tiers per pine (min, extra random). */
  pineTiers: [4, 3] as readonly [number, number],
  /** How "urban" (skyline instead of trees) each surface biome's backdrop is (default 0). */
  skylineBiomes: { town: 0.6, city: 1, military: 0.35 } as Partial<Record<BiomeId, number>>,
  /** Skyline buildings: width range (in slots) and height range (fraction of the layer's max tree height). */
  buildingSlots: [2, 4] as readonly [number, number],
  buildingHeight: [0.35, 0.95] as readonly [number, number],
  /** Biome haze laid over every backdrop layer (alpha). */
  biomeTint: 0.12,
  /** Backdrop darkening at full night (alpha of nightTop over the silhouettes). */
  nightDarken: 0.7,
} as const;

export const PLAYER_LOOK = {
  skin: 0xe2b48c,
  hair: 0x4a3222,
  shirt: 0x3f6d9e,
  pants: 0x2c3442,
  boots: 0x1d1a17,
  /** Walk bob amplitude (tiles) and leg swing frequency (cycles per tile walked). */
  bob: 0.06,
  strideFreq: 0.9,
  /** Hit flash duration (s). */
  flashSeconds: 0.15,
  flashColor: 0xffffff,
  /** Arm swing (s) shown after a use event (mine hit, melee, shot). */
  swingSeconds: 0.25,
} as const;

export const ZOMBIE_LOOK = {
  /** Shamble: leg swing per tile walked and body lean. */
  strideFreq: 0.7,
  lean: 0.08,
  flashSeconds: 0.12,
  eyeColor: 0xc9302a,
  /** Darker colour for legs = body colour × this. */
  legShade: 0.6,
} as const;

export const DROP_LOOK = { bobAmplitude: 0.12, bobRate: 3, outline: 0x140f0a } as const;

export const EFFECTS = {
  maxParticles: 600,
  gravity: 30,
  breakParticles: 14,
  hitParticles: 4,
  splashParticles: 10,
  bloodColor: 0x8a1f1a,
  waterColor: 0x7fb6ef,
  particleLife: [0.35, 0.8] as readonly [number, number],
  /** Particle size in tiles. */
  particleSize: 0.18,
  tracerSeconds: 0.08,
  tracerColor: 0xffe9a8,
  swooshSeconds: 0.15,
  swooshRadius: 1.6,
  damageNumberSeconds: 0.9,
  damageNumberRise: 1.6,
  /** Damage numbers / swoosh use the CSS tokens --fg (zombie hit, swoosh) and --danger (player hit). */
  damageFontCss: 14,
} as const;

export const AUDIO = {
  masterVolume: 0.35,
  startMuted: false,
  /** Zombie groans only play for zombies within this distance (tiles), at this chance per second. */
  groanDistance: 22,
  groanChancePerSecond: 0.08,
  /** Max sounds of one kind per frame (a big break cascade should not be deafening). */
  maxPerKindPerFrame: 2,
  /** Tiny synth voices: oscillator type, start/end frequency (Hz), seconds, gain, noise mix. */
  voices: {
    mineHit: { wave: 'square', f0: 220, f1: 140, dur: 0.05, gain: 0.25, noise: 0.5 },
    tileBreak: { wave: 'square', f0: 160, f1: 60, dur: 0.12, gain: 0.35, noise: 0.8 },
    tilePlace: { wave: 'triangle', f0: 300, f1: 200, dur: 0.06, gain: 0.3, noise: 0.2 },
    shot: { wave: 'sawtooth', f0: 900, f1: 80, dur: 0.14, gain: 0.45, noise: 1 },
    melee: { wave: 'triangle', f0: 500, f1: 250, dur: 0.07, gain: 0.18, noise: 0.6 },
    hit: { wave: 'square', f0: 140, f1: 70, dur: 0.1, gain: 0.35, noise: 0.4 },
    groan: { wave: 'sawtooth', f0: 95, f1: 70, dur: 0.6, gain: 0.18, noise: 0.1 },
    pickup: { wave: 'sine', f0: 660, f1: 990, dur: 0.08, gain: 0.25, noise: 0 },
    splash: { wave: 'sine', f0: 400, f1: 120, dur: 0.18, gain: 0.2, noise: 0.9 },
    craft: { wave: 'triangle', f0: 520, f1: 780, dur: 0.12, gain: 0.25, noise: 0 },
    death: { wave: 'sawtooth', f0: 200, f1: 40, dur: 0.9, gain: 0.4, noise: 0.2 },
  },
} as const;
export type VoiceId = keyof typeof AUDIO.voices;

// ── Key bindings (SPEC §6). KeyboardEvent.code values; the pause menu lists them. ─────────
export type ActionId = 'left' | 'right' | 'jump' | 'down' | 'inventory' | 'drop' | 'menu' | 'debug' | 'mute';

export const KEY_BINDINGS: Record<ActionId, { keys: readonly string[]; label: string; keyLabel: string }> = {
  left: { keys: ['KeyA', 'ArrowLeft'], label: 'Nach links', keyLabel: 'A' },
  right: { keys: ['KeyD', 'ArrowRight'], label: 'Nach rechts', keyLabel: 'D' },
  jump: { keys: ['Space', 'KeyW', 'ArrowUp'], label: 'Springen / schwimmen', keyLabel: 'Leertaste' },
  down: { keys: ['KeyS', 'ArrowDown'], label: 'Tauchen', keyLabel: 'S' },
  inventory: { keys: ['KeyE', 'Tab'], label: 'Inventar + Crafting', keyLabel: 'E / Tab' },
  drop: { keys: ['KeyQ'], label: 'Item droppen', keyLabel: 'Q' },
  menu: { keys: ['Escape'], label: 'Menü', keyLabel: 'Esc' },
  debug: { keys: ['F3'], label: 'Debug-Anzeige', keyLabel: 'F3' },
  mute: { keys: ['KeyM'], label: 'Ton an/aus', keyLabel: 'M' },
};

/** Hotbar keys in slot order (slot 0 = '1', slot 9 = '0'). */
export const HOTBAR_KEYS: readonly string[] = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'];

/** MouseEvent.button values. */
export const MOUSE_BUTTONS = { primary: 0, secondary: 2 } as const;

/** Mouse-only controls shown in the pause menu after the key bindings. */
export const MOUSE_HELP: readonly { keyLabel: string; label: string }[] = [
  { keyLabel: 'Linksklick (halten)', label: 'Abbauen / angreifen / benutzen' },
  { keyLabel: 'Rechtsklick', label: 'Platzieren / öffnen / Tür' },
  { keyLabel: '1–0 / Mausrad', label: 'Hotbar wählen' },
  { keyLabel: 'Shift + Klick', label: 'Quick-Move (Inventar)' },
  { keyLabel: 'Rechts-Ziehen', label: 'Stapel teilen (Inventar)' },
];

export const HUD = {
  /** Inventory slots per row in the inventory screen. */
  inventoryColumns: 10,
  /** Below this fraction a survival bar pulses red. */
  lowFraction: 0.25,
  /** Hours on the 24 h clock (timeOfDay 0 = midnight). */
  hoursPerDay: 24,
  /** Small notice when the sim reports something (pickup/crafted), seconds shown. */
  toastSeconds: 2.2,
  /** Shift+click on a recipe crafts this many times. */
  craftShiftTimes: 10,
  maxToasts: 4,
} as const;

/** UI strings (German). */
export const TEXT = {
  health: 'Leben',
  hunger: 'Hunger',
  thirst: 'Durst',
  day: 'Tag',
  inventory: 'Inventar',
  crafting: 'Crafting',
  container: 'Behälter',
  craftAnywhere: 'Überall',
  station: 'Station',
  dead: 'Du bist gestorben',
  respawnIn: 'Wiederbelebung in',
  paused: 'Pause',
  resume: 'Weiter',
  controls: 'Steuerung',
  muted: 'Ton aus',
  unmuted: 'Ton an',
  pickup: '+',
  crafted: 'Hergestellt:',
  categories: {
    block: 'Block',
    material: 'Material',
    tool: 'Werkzeug',
    weapon: 'Waffe',
    ammo: 'Munition',
    food: 'Nahrung',
    medical: 'Medizin',
  },
  stats: {
    damage: 'Schaden',
    range: 'Reichweite',
    cooldown: 'Abklingzeit',
    power: 'Stärke',
    speed: 'Tempo',
    ammo: 'Munition',
    pellets: 'Schrot',
    health: 'Leben',
    hunger: 'Hunger',
    thirst: 'Durst',
    useTime: 'Dauer',
    places: 'Platzierbar',
  },
} as const;
