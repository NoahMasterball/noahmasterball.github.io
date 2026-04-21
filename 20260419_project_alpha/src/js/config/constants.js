// SSoT — Alle Tunables des Spiels. Duplikate = Bug.
// Gliederung: WORLD, PLAYER, HOTBAR, STATS, CLOCK, COLORS, BUILDINGS, ITEMS, CONSUMABLES, WEAPONS, WEAPON_VFX, MELEE, DUMMY_TARGET, MONSTERS, SPAWN_WAVE, ALARM, LEVELS, AUDIO, SAVE.
// Batch 1 nutzt: WORLD, PLAYER, HOTBAR, STATS, CLOCK, COLORS. Batch 2 zusätzlich: WORLD (erweitert), BUILDINGS, COLORS (erweitert).
// Batch 3 zusätzlich: ITEMS (Pickup-Mesh + Stacking + HUD-Warn).
// Batch 4 zusätzlich: CONSUMABLES (Food/Drink-Effekte pro ItemId), COLORS.CONSUME_RING.
// Batch 5 zusätzlich: WEAPONS (Damage/FireRate/Mag/Spread pro Waffe), WEAPON_VFX (Tracer/Muzzle-Flash-TTLs + Farben), MELEE (Fan-Rays + Winkel), DUMMY_TARGET (HP + Mesh-Params), COLORS.RELOAD_RING.

import { ItemId } from './enums.js';

export const WORLD = Object.freeze({
  GRAVITY: 22.0,
  SPAWN_HEIGHT: 1.8,
  // [Batch 2]
  MAP_SIZE: 400,
  CHUNK_GRID: 10,
  BUILDING_DENSITY: 0.35,
  MIN_BUILDING_SPACING: 6,
  STREET_WIDTH: 6,
  SIDEWALK_WIDTH: 2.5,
  MEADOW_SCATTER_COUNT: 18,
  // Kleine y-Offsets verhindern Z-Fighting zwischen gestapelten flachen Flächen.
  MEADOW_Y: 0.00,
  STREET_Y: 0.01,
  SIDEWALK_Y: 0.02,
  BUILDING_PAD: 0.6,              // Puffer zwischen Gebäude und Sidewalk-Rand
  SCATTER_MIN_SCALE: 0.55,
  SCATTER_MAX_SCALE: 1.35,
  SCATTER_BUSH_RADIUS: 0.5,
  SCATTER_STONE_SIZE: 0.55,
  SCATTER_BUSH_RATIO: 0.65,       // Anteil Büsche (Rest = Steine) pro Meadow
});

export const PLAYER = Object.freeze({
  MOVE_SPEED: 5.2,
  SPRINT_MULT: 1.6,
  JUMP_VELOCITY: 7.5,
  EYE_HEIGHT: 1.75,
  LOOK_SENSITIVITY: 0.0022,
  MAX_PITCH: Math.PI / 2 - 0.05,
  AIR_CONTROL: 0.35,
  INTERACT_RANGE_M: 3.0,
});

export const HOTBAR = Object.freeze({
  SLOT_COUNT: 8,
  PICKUP_HOLD_SEC: 0.6,
  CONSUME_HOLD_SEC: 0.8,
  DROP_FORWARD_M: 1.5,
  SWITCH_COOLDOWN_SEC: 0.08,
});

// NEW — Frontend-UI-Tunables (Intro/Menü). Getrennt von Gameplay-Konstanten.
export const UI = Object.freeze({
  LOADING_DURATION_SEC: 3,
});

export const STATS = Object.freeze({
  MAX_HEALTH: 100,
  MAX_HUNGER: 100,
  MAX_THIRST: 100,
  HUNGER_DECAY: 0.35,
  THIRST_DECAY: 0.55,
  STARVE_DAMAGE: 1.5,
  HEALTH_REGEN: 0.8,
  REGEN_HUNGER_THRESHOLD: 50,
  REGEN_THIRST_THRESHOLD: 50,
  LOW_STAT_WARN_PCT: 0.25,
});

// Tag/Nacht-Zyklus. Ein Tag = DAY_LENGTH_SEC Realsekunden.
// Phasen: dawn | day | dusk | night. Schwellen sind Anteile des Tages (0..1).
export const CLOCK = Object.freeze({
  DAY_LENGTH_SEC: 480, // 8 min pro Tag
  PHASES: [
    { name: 'dawn',  start: 0.00, end: 0.05 },
    { name: 'day',   start: 0.05, end: 0.45 },
    { name: 'dusk',  start: 0.45, end: 0.50 },
    { name: 'night', start: 0.50, end: 1.00 },
  ],
  START_OFFSET_01: 0.08,  // Spiel startet morgens
  SKY: {
    dawn:  { top: 0xff9966, horizon: 0xffcc99, ambient: 0xffd1a8, sun: 0xffbb88, intensity: 0.55 },
    day:   { top: 0x4a8ac9, horizon: 0xbfe0ff, ambient: 0xffffff, sun: 0xfff2d6, intensity: 1.00 },
    dusk:  { top: 0x5a3a78, horizon: 0xff7744, ambient: 0xc1a6d0, sun: 0xff6644, intensity: 0.50 },
    night: { top: 0x060914, horizon: 0x0b1728, ambient: 0x1a2236, sun: 0x99aaff, intensity: 0.15 },
  },
});

export const COLORS = Object.freeze({
  HUD_BG:      'rgba(0, 0, 0, 0.55)',
  HUD_BORDER:  'rgba(255, 255, 255, 0.18)',
  HUD_TEXT:    '#ececec',
  SLOT_BG:     'rgba(20, 20, 24, 0.75)',
  SLOT_ACTIVE: 'rgba(255, 210, 90, 0.9)',
  BAR_HEALTH:  '#d1453a',
  BAR_HUNGER:  '#d98b2a',
  BAR_THIRST:  '#2a8cd9',
  BAR_WARN:    '#ffd56b',
  CROSSHAIR:   'rgba(255, 255, 255, 0.85)',
  // [Batch 4] Zweiter Progress-Ring (Consume) — bewusst abgesetzt vom Pickup-Ring (SLOT_ACTIVE gelb).
  CONSUME_RING:'rgba(112, 204, 116, 0.95)',
  // [Batch 5] Dritter Progress-Ring (Reload) — abgesetzt von Pickup (gelb) und Consume (grün).
  RELOAD_RING: 'rgba(90, 170, 255, 0.95)',
  // [Batch 2] Weltfarben — von world/biomes, world/transitions, world/buildings konsumiert.
  MEADOW:      0x4a7c3a,
  STREET:      0x2a2a2e,
  SIDEWALK:    0x6f6f74,
  BUSH:        0x355d26,
  STONE:       0x8a8880,
});

// [Batch 2] Building-Templates: pro BuildingType Maße, Farben, Alarm-Flag, Spawn-Gewicht.
// Der map-generator wählt Typen gewichtet aus; buildings.js liest Größe/Farbe/Höhe für das Mesh.
export const BUILDINGS = Object.freeze({
  HOUSE:           { minSize: 8,  maxSize: 14, minHeight: 5, maxHeight: 8, color: 0x7d6a58, roofColor: 0x4a2f22, hasAlarm: false, weight: 3 },
  GAS_STATION:     { minSize: 12, maxSize: 18, minHeight: 4, maxHeight: 5, color: 0xa8a0a0, roofColor: 0xbb3322, hasAlarm: true,  weight: 1 },
  SHOP:            { minSize: 10, maxSize: 16, minHeight: 4, maxHeight: 6, color: 0x8a9a7a, roofColor: 0x333333, hasAlarm: true,  weight: 2 },
  GARAGE:          { minSize: 8,  maxSize: 12, minHeight: 3, maxHeight: 4, color: 0x555c64, roofColor: 0x3a3f44, hasAlarm: false, weight: 2 },
  RUIN:            { minSize: 6,  maxSize: 16, minHeight: 1, maxHeight: 3, color: 0x4a4842, roofColor: 0x3a3832, hasAlarm: false, weight: 2 },
  SECURITY_OFFICE: { minSize: 10, maxSize: 14, minHeight: 4, maxHeight: 6, color: 0x3a4a5a, roofColor: 0x1a2a3a, hasAlarm: true,  weight: 1 },
});

// -------- Folge-Batches (vorregistriert) --------

// [Batch 3] Inventory + Item-Runtime. Farben hier als Three.js-Hex-Zahlen
// (Pickup-Meshes + HUD-Slot-Icons); sie sind bewusst unabhängig von den CSS-Stat-Bars.
export const ITEMS = Object.freeze({
  DEFAULT_MAX_STACK_CONSUMABLE: 5,
  DEFAULT_MAX_STACK_AMMO: 60,
  DEFAULT_MAX_STACK_MISC: 1,
  HEAVY_WARN_FLASH_SEC: 0.8,
  PICKUP_MESH_SIZE: 0.5,
  PICKUP_Y_BASE: 0.35,
  PICKUP_BOB_AMPLITUDE: 0.08,
  PICKUP_BOB_FREQ_HZ: 0.8,
  PICKUP_SPIN_HZ: 0.4,
  COLOR: {
    FOOD:   0xd98b2a,
    DRINK:  0x2a8cd9,
    WEAPON: 0xb0b0b0,
    AMMO:   0xffd56b,
    KEY:    0xffcc33,
    PART:   0x8a8880,
    MISC:   0xaaaaaa,
  },
});

// [Batch 4] Essen/Trinken-Effekte pro ItemId. SSoT analog zu WEAPONS/MONSTERS.
// items/food.js liest diesen Block und baut daraus onUse-Handler für das item-registry.
// Positive Werte heilen, negative Werte schaden (zukünftige Gift-Items können das nutzen).
export const CONSUMABLES = Object.freeze({
  [ItemId.SNACK]:        { hungerDelta: 25, thirstDelta:  0, healthDelta:  0 },
  [ItemId.CANNED_SOUP]:  { hungerDelta: 45, thirstDelta:  5, healthDelta:  0 },
  [ItemId.WATER_BOTTLE]: { hungerDelta:  0, thirstDelta: 50, healthDelta:  0 },
  [ItemId.SODA_CAN]:     { hungerDelta:  5, thirstDelta: 30, healthDelta:  0 },
  [ItemId.PAINKILLERS]:  { hungerDelta:  0, thirstDelta:  0, healthDelta: 30 },
});

// [Batch 5] Waffen-Tunables. `fullAuto` markiert Dauerfeuer-Waffen (MG) —
// sie feuern nicht auf Rising-Edge in useActive(), sondern pro Frame über
// Inventory.tickActiveFire mit fireRate-Limiter. `ammoType`-Strings matchen
// die ItemIds der Munitionsitems (siehe enums.js). Melee hat kein ammoType.
export const WEAPONS = Object.freeze({
  MELEE_BAT:   { damage: 35, fireRate: 1.2, range: 2.0, heavy: false },
  PISTOL:      { damage: 18, fireRate: 4.0, magSize: 12, reloadSec: 1.4, range: 40, spread: 0.02, heavy: false, ammoType: 'ammo_pistol' },
  SHOTGUN:     { damage: 12, pellets: 8, fireRate: 1.0, magSize: 6, reloadSec: 2.2, range: 20, spread: 0.12, heavy: false, ammoType: 'ammo_shell' },
  MACHINE_GUN: { damage: 14, fireRate: 10.0, magSize: 60, reloadSec: 3.5, range: 60, spread: 0.04, heavy: true, ammoType: 'ammo_rifle', fullAuto: true },
});

// [Batch 5] Shared Visuals für Schussspur + Mündungsfeuer. Kein Partikelsystem —
// nur kurze THREE.Line-Segmente + ein kleines additiv gezeichnetes Quad pro Schuss.
// TTLs in Sekunden; SPAWN_DROP hebt den Tracer-Ursprung leicht unter die Kamera,
// damit die Linie nicht exakt aus dem Augenpunkt kommt und sichtbar bleibt.
export const WEAPON_VFX = Object.freeze({
  TRACER_TTL_SEC: 0.08,
  TRACER_COLOR: 0xffe7a8,
  MUZZLE_FLASH_TTL_SEC: 0.06,
  MUZZLE_FLASH_COLOR: 0xffd56b,
  MUZZLE_FLASH_SIZE: 0.18,
  TRACER_ORIGIN_DROP: 0.25,  // Y-Offset unter der Kamera für Tracer-Start
  TRACER_ORIGIN_FORWARD: 0.6, // leicht vor die Kamera, damit es nicht ins Auge blitzt
});

// [Batch 5] Nahkampf-Fan: mehrere Raycasts in gleichmäßigem Winkel um den
// Blickvektor. Gleicher Schaden pro getroffenem Ziel — bei nur einem Ziel
// trifft also maximal ein Ray, mehrere Ziele können sich die Fans teilen.
export const MELEE = Object.freeze({
  ARC_RAYS: 5,
  ARC_DEG: 45,
});

// [Batch 5] Test-Dummy am Spawn (bis Batch 6 echte Monster liefert). Pure Test-Aid:
// statisches Mesh mit HP, Hit-Tint beim Treffer, nach 0 HP bleibt es stehen.
export const DUMMY_TARGET = Object.freeze({
  HP: 200,
  SIZE: 1.6,
  COLOR: 0xd0c040,
  DEAD_COLOR: 0x443322,
  HIT_TINT_COLOR: 0xffffff,
  HIT_TINT_SEC: 0.12,
  Y_OFFSET: 0.8,            // mesh center height above ground (half of SIZE)
  SPAWN_DX: 6,              // relativ zum Player-Spawn
  SPAWN_DZ: -10,
});

// [Batch 6]
export const MONSTERS = Object.freeze({
  STALKER:  { hp: 60,  speed: 2.5, damage: 20, attackIntervalSec: 1.2, attackRangeM: 1.8, color: 0x555555, scale: 1.0 },
  SPRINTER: { hp: 35,  speed: 6.0, damage: 12, attackIntervalSec: 0.7, attackRangeM: 1.6, color: 0x883333, scale: 0.85 },
  BRUTE:    { hp: 180, speed: 1.8, damage: 45, attackIntervalSec: 2.0, attackRangeM: 2.4, color: 0x224422, scale: 1.6 },
  SPAWN_RADIUS_MIN_M: 18,
  SPAWN_RADIUS_MAX_M: 45,
  DESPAWN_ON_DAWN: true,
});

export const SPAWN_WAVE = Object.freeze({
  BASE_COUNT: 5,
  COUNT_PER_NIGHT: 2,
  INTERVAL_SEC: 8,
});

// [Batch 7]
export const ALARM = Object.freeze({
  DURATION_SEC: 120,
  MONSTER_AGGRO_RADIUS_M: 60,
  MONSTER_EXTRA_SPAWN_COUNT: 4,
  BLINK_HZ: 1.8,
  SOUND_ID: 'alarm_siren',
});

// [Batch 8]
export const LEVELS = Object.freeze({
  TRANSITION_FADE_SEC: 1.2,
});

// [Batch 9]
export const AUDIO = Object.freeze({
  MASTER_VOLUME: 0.8,
  SFX_VOLUME: 1.0,
  MUSIC_VOLUME: 0.5,
});

export const SAVE = Object.freeze({
  KEY: 'project_alpha_save_v1',
  AUTOSAVE_INTERVAL_SEC: 30,
});
