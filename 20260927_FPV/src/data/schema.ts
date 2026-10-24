// NEW — content schema (types only). Every operator, weapon, ability, hitbox profile, budget
// weight and level is an instance of these types in src/data/ — the single source of truth
// for balance numbers (SPEC "Numbers policy"). Units are in the field docs; angles in data are
// degrees (suffix Deg where ambiguous), distances metres, times seconds.

export type Vec3Tuple = readonly [number, number, number];

// ── Weapons ─────────────────────────────────────────────────────────────────

export const WEAPON_CLASSES = ['lmg', 'ar', 'br', 'carbine', 'smg', 'pdw', 'mp', 'shotgun', 'dmr', 'pistol', 'revolver'] as const;
export type WeaponClass = (typeof WEAPON_CLASSES)[number];
export type FireMode = 'auto' | 'semi';

export const HIT_ZONES = ['head', 'torso', 'limb'] as const;
export type HitZone = (typeof HIT_ZONES)[number];

export interface RecoilDef {
  /** Per-shot view kick [pitch up°, yaw right°], indexed by shot number in the burst. */
  pattern: readonly (readonly [number, number])[];
  /** Index the pattern loops back to after its last entry. */
  loopFrom: number;
  /** Degrees per second the accumulated kick returns towards zero while not firing. */
  recovery: number;
  /** Kick multiplier when fully aimed down sights. */
  adsMultiplier: number;
  /** Seconds without firing after which the pattern restarts at shot 0. */
  resetTime: number;
}

export interface WeaponDef {
  id: string;
  name: string;
  class: WeaponClass;
  fireMode: FireMode;
  /** Per-pellet torso damage inside the falloff start range. */
  damage: number;
  /** Linear falloff from `damage` at `start` m to `minDamage` at `end` m, flat after. */
  falloff: { start: number; end: number; minDamage: number };
  pellets: number;
  rpm: number;
  magazine: number;
  reserveMagazines: number;
  reloadTime: number;
  /** Cone half-angles in degrees. */
  hipSpread: number;
  adsSpread: number;
  spreadPerShot: number;
  spreadMoving: number;
  /** Degrees per second of bloom decay while not firing. */
  spreadRecovery: number;
  maxSpread: number;
  recoil: RecoilDef;
  adsTime: number;
  adsFovMultiplier: number;
  headshotMultiplier: number;
  limbMultiplier: number;
  moveSpeedModifier: number;
  maxRange: number;
}

// ── Abilities ───────────────────────────────────────────────────────────────

// NEW — where a placeable gadget may be attached (ADR-0012 §4.6); the data had no such field.
/** Surfaces a placeable gadget may be attached to: floor (normal within
 *  CHARACTER.maxSlopeClimbDeg of up), wall (anything steeper except a ceiling) or either. */
export const PLACEMENT_SURFACES = ['floor', 'wall', 'any'] as const;
export type PlacementSurface = (typeof PLACEMENT_SURFACES)[number];

// NEW — when a placed gadget applies its effects (ADR-0012 §4.4); `{ kind: 'placeable' }` alone
// could not tell a planted charge from a sensor, a mine or a barrier.
/** When a placed gadget applies its effects (src/sim/abilities/triggers.ts). */
export type GadgetTriggerDef =
  /** The gadget itself is the effect (barrier). */
  | { kind: 'none' }
  /** Every tick while armed and not disabled. */
  | { kind: 'aura' }
  /** Once, when an enemy body comes within `radius` m; the gadget is consumed. */
  | { kind: 'proximity'; radius: number }
  /** Once, `delay` s after placement (paused while disabled); the gadget is consumed. */
  | { kind: 'timer'; delay: number };
export type GadgetTriggerKind = GadgetTriggerDef['kind'];

export type ActivationDef =
  | { kind: 'instant' }
  | { kind: 'hold'; maxDuration: number }
  | { kind: 'toggle'; maxDuration: number | null }
  | {
      kind: 'placeable';
      maxActive: number;
      placeRange: number;
      gadgetHealth: number;
      surface: PlacementSurface;
      trigger: GadgetTriggerDef;
    }
  | { kind: 'thrown'; speed: number; gravityScale: number; fuse: number | null }
  | { kind: 'passive' };
export type ActivationKind = ActivationDef['kind'];

/** `none` is only valid for passive abilities (always on, nothing to spend). Every activation
 *  spends on use; a slot's resource does not recover while it is channelling (hold) or switched
 *  on (toggle), so a cooldown or recharge runs from the end (ADR-0012 §1.3). */
export type ResourceDef =
  | { kind: 'cooldown'; cooldown: number }
  | { kind: 'charges'; maxCharges: number; rechargeTime: number }
  | { kind: 'uses'; usesPerRound: number }
  | { kind: 'none' };

/** The closed set of stats that modifiers may scale (SPEC §8). Adding one needs an ADR. */
export const MODIFIABLE_STATS = ['moveSpeed', 'damageTaken', 'spread', 'recoil', 'footstepVolume'] as const;
export type ModifiableStat = (typeof MODIFIABLE_STATS)[number];
export type StatMultipliers = Partial<Record<ModifiableStat, number>>;

/** Who an effect applies to, relative to the ability user. `allies` includes the user. */
export type EffectTargets = 'self' | 'allies' | 'enemies' | 'all';

export type EffectDef =
  | { kind: 'damage'; amount: number; radius: number }
  | { kind: 'heal'; amount: number; radius: number; targets: EffectTargets }
  | { kind: 'shield'; amount: number; duration: number; radius: number; targets: EffectTargets }
  /** The barrier's health is the gadget health of its placeable activation. */
  | { kind: 'barrier'; width: number; height: number }
  /** `duration` is ignored for passive (permanent) and hold/toggle abilities (active while
   *  held/on). `radius` 0 = only the user. */
  | { kind: 'modifier'; stats: StatMultipliers; duration: number; radius: number; targets: EffectTargets }
  | { kind: 'dash'; distance: number; duration: number; direction: 'move' | 'look' | 'up' }
  | { kind: 'reveal'; radius: number; duration: number }
  | { kind: 'areaDenial'; radius: number; duration: number; damagePerSecond: number; stats: StatMultipliers }
  | { kind: 'disableGadgets'; radius: number; duration: number };
export type EffectKind = EffectDef['kind'];

// NEW — ADR-0012 §3.2: the effect kinds that act within a radius (keys of
// ABILITY_RULES.lineOfSight in src/config/sim.ts), derived so a new one cannot be forgotten.
/** Effect kinds that act within a radius. */
export type RadiusEffectKind = Extract<EffectDef, { radius: number }>['kind'];

// NEW — bot usage hints (ADR-0012 §10): the data says when a bot uses an ability; the brain
// (src/ai/abilities.ts) only acts it out.
/** When a bot uses an ability. `maxRangeM` defaults to the ability's derived reach. */
export type BotAbilityHint =
  /** Passives, and abilities bots skip in M2. */
  | { use: 'never' }
  /** A visible target in range: self buffs, throws at it. */
  | { use: 'engage'; maxRangeM?: number }
  /** Hit by an unseen enemy, or own health fraction ≤ `healthBelow` in a fight. */
  | { use: 'escape'; healthBelow: number }
  /** At a hold post: place / toggle towards the watch direction. */
  | { use: 'hold' }
  /** No visible target: gather intel (at most once per AI.abilities.scoutIntervalSeconds). */
  | { use: 'scout' }
  /** An ally or self at a health fraction ≤ `healthBelow` in range. */
  | { use: 'support'; healthBelow: number; maxRangeM?: number }
  /** A contact lost from sight in range: throw / plant at its last known position. */
  | { use: 'flush'; maxRangeM?: number };
export type BotAbilityUse = BotAbilityHint['use'];

export interface AbilityDef {
  id: string;
  name: string;
  description: string;
  activation: ActivationDef;
  resource: ResourceDef;
  effects: readonly EffectDef[];
  /** Utility term of the power budget (SPEC §9.1) — a reviewed human judgement. */
  budgetCost: number;
  /** When bots use it (ADR-0012 §10). */
  bot: BotAbilityHint;
}

// ── Operators ───────────────────────────────────────────────────────────────

export const ARCHETYPES = ['anchor', 'speedster', 'breacher', 'intel', 'support', 'trapper'] as const;
export type Archetype = (typeof ARCHETYPES)[number];
export type WeightClass = 'light' | 'medium' | 'heavy';

export interface OperatorDef {
  id: string;
  name: string;
  archetype: Archetype;
  maxHealth: number;
  /** Damage reduction fraction applied to every hit. */
  armour: number;
  hitboxProfile: string;
  /** m/s */
  moveSpeed: number;
  sprintMultiplier: number;
  /** m/s² */
  acceleration: number;
  /** m/s when fully crouched */
  crouchSpeed: number;
  /** m, apex of a standing jump */
  jumpHeight: number;
  /** Speed multiplier when fully aimed down sights. */
  adsMovePenalty: number;
  abilitySlots: number;
  abilities: readonly string[];
  loadout: { primary: readonly string[]; secondary: readonly string[] };
  /** Presentation only — never read by the simulation. */
  presentation: { color: number; weightClass: WeightClass; silhouette: string; bio: string };
}

// ── Hitboxes ────────────────────────────────────────────────────────────────

export type HitboxShape =
  | { kind: 'ball'; radius: number }
  | { kind: 'cuboid'; halfExtents: Vec3Tuple }
  | { kind: 'capsule'; halfHeight: number; radius: number };

export interface HitboxPartDef {
  name: string;
  zone: HitZone;
  shape: HitboxShape;
  /** Centre relative to the feet, standing, character facing −Z. */
  center: Vec3Tuple;
}

export interface HitboxProfileDef {
  id: string;
  parts: readonly HitboxPartDef[];
}

// ── Levels ──────────────────────────────────────────────────────────────────

export const SURFACES = ['floor', 'wall', 'cover', 'ramp', 'platform', 'trim'] as const;
export type Surface = (typeof SURFACES)[number];

export interface BoxDef {
  center: Vec3Tuple;
  size: Vec3Tuple;
  /** Euler rotation in degrees, order YXZ. */
  rotationDeg?: Vec3Tuple;
  surface: Surface;
}

/** A place a character enters the level: feet position and facing. */
export interface SpawnPointDef {
  position: Vec3Tuple;
  yawDeg: number;
}

export type DummyBehaviour = { kind: 'static' } | { kind: 'strafe'; width: number };

export interface DummySpawnDef extends SpawnPointDef {
  operatorId: string;
  behaviour: DummyBehaviour;
}

// NEW — the two roles of an attack/defence round (SPEC §4.1). Spawns belong to a side, not to a
// team, because teams swap sides during a match; the mode maps team → side per round.
export const SIDES = ['attack', 'defend'] as const;
export type Side = (typeof SIDES)[number];

/** A group of spawn points one team uses together, one point per player (`MATCH.teamSize` in
 *  src/config/sim.ts). Attackers may get several zones to choose from (spawn edges, SPEC §13);
 *  defenders usually have one. */
export interface SpawnZoneDef {
  id: string;
  name: string;
  side: Side;
  points: readonly SpawnPointDef[];
}

// NEW — ADR-0013 §4: sites and setup walls are both axis-aligned volumes; one shape for both.
/** An axis-aligned box: centre and full size. */
export interface VolumeDef {
  center: Vec3Tuple;
  size: Vec3Tuple;
}

/** An objective area (Relay site, SPEC §4.1): an axis-aligned volume. */
export interface SiteDef extends VolumeDef {
  id: string;
  name: string;
}

/** Practice-range furniture; only the test range has it. */
export interface RangeLayoutDef {
  /** Z of the firing line; range distance labels are measured from here. */
  firingLineZ: number;
  dummies: readonly DummySpawnDef[];
}

// NEW — bot waypoint graph (SPEC §12 "waypoint graph authored in the level data", ADR-0011 §5).
// Hand-authored per map; validated in src/data/content.ts, used by src/ai/nav/.
/** Roles a nav node offers bots: take cover, hold an angle, patrol through. Site membership is
 *  derived from `LevelDef.sites`, never tagged. */
export const NAV_TAGS = ['cover', 'hold', 'patrol'] as const;
export type NavTag = (typeof NAV_TAGS)[number];

/** How a link is traversed (A* cost per kind: AI.nav.linkCost in src/config/sim.ts). */
export const NAV_LINK_KINDS = ['walk', 'jump', 'crouch'] as const;
export type NavLinkKind = (typeof NAV_LINK_KINDS)[number];

export interface NavNodeDef {
  id: string;
  /** Feet position on the walkable surface. */
  pos: Vec3Tuple;
  tags?: readonly NavTag[];
  /** Direction to watch from a `hold` node (required there), degrees like SpawnPointDef.yawDeg. */
  watchYawDeg?: number;
}

export interface NavLinkDef {
  from: string;
  to: string;
  /** Default `walk`. */
  kind?: NavLinkKind;
  /** Only traversable from `from` to `to` (drops). */
  oneWay?: boolean;
}

export interface NavGraphDef {
  nodes: readonly NavNodeDef[];
  links: readonly NavLinkDef[];
}

export interface LevelDef {
  id: string;
  name: string;
  boxes: readonly BoxDef[];
  /** Free-play spawn (range, QA, a single player without a mode). */
  playerSpawn: SpawnPointDef;
  /** Team spawn zones for attack/defence modes. */
  spawnZones?: readonly SpawnZoneDef[];
  /** Objective areas for attack/defence modes. */
  sites?: readonly SiteDef[];
  /** Relay setup walls (SPEC §13 hard boundaries, ADR-0013 §4): movement-only volumes that close
   *  the defenders' building while the mode says so (ModeRules.setupWallsUp); bullets and sight
   *  pass. A level without them cannot host Relay. */
  setupWalls?: readonly VolumeDef[];
  range?: RangeLayoutDef;
  /** Bot waypoint graph; levels that host combat bots need one. */
  nav?: NavGraphDef;
}
