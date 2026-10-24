import type { HitZone, Side, StatMultipliers } from '../data/schema.ts';
import type { ResourceState } from './abilities/resource.ts';
import type { Vec3 } from './math.ts';
import type { RngState } from './rng.ts';

// NEW — simulation state, events and control messages. All plain, serialisable data
// (ADR-0004). Rapier handles are NOT here; they live in src/sim/physics side tables.

export type EntityId = number;

// NEW — split of the old single WeaponState for weapon swapping (M1): what a weapon keeps while
// holstered (CarriedWeapon, one per slot) vs. how the weapon in hand is handled (WeaponState).
/** A carried weapon: what survives holstering (ammo). One per weapon slot. */
export interface CarriedWeapon {
  weaponId: string;
  ammo: number;
  reserve: number;
}

/** Handling state of the weapon in hand (one per character). A swap resets it, so bloom, the
 *  recoil pattern index, fire cadence and reloads never carry over to the next weapon. */
export interface WeaponState {
  /** Seconds until the next shot may fire (ready once isTimeUp; weaponSystem's fire cadence). */
  fireCooldown: number;
  /** Trigger press not yet answered by the weapon (> 0 = pending): a press sets it to
   *  GUNPLAY.triggerBufferSeconds, it counts down only while the trigger is up, and the first
   *  tick the weapon can fire clears it (weaponSystem). */
  triggerBuffer: number;
  /** Seconds left in the current reload (0 = not reloading). */
  reloadRemaining: number;
  /** Accumulated bloom in degrees. */
  bloom: number;
  /** Index into the recoil pattern for the next shot. */
  shotIndex: number;
  sinceLastShot: number;
  /** Aim offset from recoil, radians (ADR-0009). */
  recoilPitch: number;
  recoilYaw: number;
  prevRecoilPitch: number;
  prevRecoilYaw: number;
  /** 0 = hip, 1 = fully aimed. */
  ads: number;
  prevAds: number;
  /** Seconds left in the current weapon swap (0 = not swapping). */
  swapRemaining: number;
  prevSwapRemaining: number;
}

// NEW — what an ability slot is doing (ADR-0012 §1.2); instant abilities never occupy a slot.
/** A running activation of an ability slot. */
export type AbilityActivity =
  /** hold: seconds channelled so far. */
  | { kind: 'channel'; elapsed: number }
  /** toggle: seconds switched on so far. */
  | { kind: 'on'; elapsed: number }
  /** placeable: the ghost is shown; fire places, ADS / the own key / a swap cancel. */
  | { kind: 'placing' };

export interface AbilityState {
  abilityId: string;
  resource: ResourceState;
  /** The running activation, null when idle. The resource does not recover while it is
   *  `channel` or `on`. */
  active: AbilityActivity | null;
}

// NEW — ADR-0012 §2: damage that is not a bullet (bursts, areas) needs its source named.
/** What dealt damage: a weapon, or an ability (burst, area, planted charge). */
export type DamageCause = { kind: 'weapon'; weaponId: string } | { kind: 'ability'; abilityId: string };

// NEW — temporary HP and team visibility (ADR-0012 §3.3).
/** Temporary HP after mitigation (`shield` effect); absorbs damage before health. */
export interface ActiveShield {
  /** Ability id; a re-application from the same source refreshes (max) instead of stacking. */
  sourceId: string;
  amount: number;
  /** Seconds left. */
  remaining: number;
}

/** The character is visible to `team` through walls (`reveal` effect). */
export interface ActiveReveal {
  team: number;
  /** Ability id. */
  sourceId: string;
  /** Seconds left. */
  remaining: number;
}

export interface ActiveModifier {
  /** Ability id; a re-application from the same source refreshes instead of stacking. */
  sourceId: string;
  stats: StatMultipliers;
  /** Seconds left; Infinity for passives. */
  remaining: number;
}

export interface DashState {
  velocity: Vec3;
  remaining: number;
}

export interface CharacterEntity {
  id: EntityId;
  kind: 'character';
  team: number;
  controller: 'player' | 'bot';
  operatorId: string;
  pos: Vec3;
  prevPos: Vec3;
  vel: Vec3;
  yaw: number;
  pitch: number;
  prevYaw: number;
  prevPitch: number;
  /** 0 = standing, 1 = fully crouched. */
  stance: number;
  prevStance: number;
  grounded: boolean;
  /** Metres of grounded travel since the last footstep event (MOVEMENT.footsteps). */
  strideProgress: number;
  sprinting: boolean;
  /** Seconds since sprint ended (sprint-out delay before firing). */
  sinceSprint: number;
  health: number;
  alive: boolean;
  /** Seconds since death (mode rules decide when to respawn). */
  deadTime: number;
  spawnPos: Vec3;
  spawnYaw: number;
  /** Tick of the last spawn or respawn. That tick's command look is ignored (movementSystem):
   *  commands carry absolute look angles chosen before a respawn in the mode rules, so the spawn
   *  facing holds until the controller adopts it from the `spawn` event. */
  spawnTick: number;
  /** Carried weapons by slot (order: WEAPON_SLOTS in entities.ts). */
  weapons: CarriedWeapon[];
  /** Slot of the weapon in hand; during a swap, the weapon being drawn. */
  activeSlot: number;
  /** Handling state of the weapon in hand. */
  weapon: WeaponState;
  abilities: AbilityState[];
  modifiers: ActiveModifier[];
  shields: ActiveShield[];
  reveals: ActiveReveal[];
  dash: DashState | null;
  /** Raw buttons of the last command (after the mode's filter); press edges compare with it. */
  lastButtons: number;
  /** Buttons an ability consumed (the fire that confirmed a placement, the ADS that cancelled
   *  it): masked from movement and weapons until released (ADR-0012 §1.1). */
  suppressedButtons: number;
  /** The character's own gameplay stream (spread samples), seeded characterSeed(SimState.seed,
   *  id): no other character's shots move it (ADR-0014 §2). Kept through respawns and operator
   *  changes. */
  rng: RngState;
}

// NEW — world objects of the ability framework (ADR-0012 §2). Each lives in its own SimState
// list; shape, radius and stats come from data via `abilityId` (never copied).

/** A placed gadget (barrier or device) with health. Its collider is a physics side-table entry. */
export interface GadgetEntity {
  id: EntityId;
  kind: 'gadget';
  abilityId: string;
  ownerId: EntityId;
  team: number;
  /** Barrier: base centre on the floor. Device: centre (surface + normal × deviceRadiusM). */
  pos: Vec3;
  /** Floor gadgets face the placer's look; wall gadgets face out of the wall. */
  yaw: number;
  /** Normal of the surface it is attached to. */
  normal: Vec3;
  /** Starts at the activation's gadgetHealth. */
  health: number;
  placedTick: number;
  /** `timer` trigger: seconds left (paused while disabled); 0 otherwise. */
  timer: number;
  /** Seconds left disabled (disableGadgets); 0 = working. */
  disabled: number;
}

/** A thrown ability in flight (or resting, fused). */
export interface ProjectileEntity {
  id: EntityId;
  kind: 'projectile';
  abilityId: string;
  ownerId: EntityId;
  team: number;
  pos: Vec3;
  prevPos: Vec3;
  vel: Vec3;
  /** Seconds left; null = bursts on impact. */
  fuse: number | null;
  /** A fused projectile that landed. */
  resting: boolean;
  /** Seconds in flight. */
  age: number;
}

/** A lasting area on the ground (areaDenial). */
export interface AreaEntity {
  id: EntityId;
  kind: 'area';
  abilityId: string;
  /** Index of the areaDenial effect in the ability's data. */
  effectIndex: number;
  ownerId: EntityId;
  team: number;
  /** On the ground. */
  pos: Vec3;
  /** Seconds left. */
  remaining: number;
}

export type Entity = CharacterEntity | GadgetEntity | ProjectileEntity | AreaEntity;

// NEW — match state of the side-based round modes (ADR-0011 §6, ADR-0013 §1). Owned by the mode
// rules in src/sim/modes/; the client reads it for the round HUD. Phases that mean the same in
// both modes share their id (preRound: the frozen opening; live: the round clock).
export type EliminationPhase = 'preRound' | 'live' | 'roundEnd' | 'matchEnd';
/** preRound = operator select, setup, live = engagement, uplink = uplink running (SPEC §4.1). */
export type RelayPhase = 'preRound' | 'setup' | 'live' | 'uplink' | 'roundEnd' | 'matchEnd';
/** Every phase of a round mode (`phase` events, screenshot shots). */
export type MatchPhase = EliminationPhase | RelayPhase;
/** `uplink`: the planted uplink completed; `disrupted`: the defenders disrupted it (Relay). */
export type RoundEndReason = 'elimination' | 'timeout' | 'uplink' | 'disrupted';
/** Round wins, index = team. */
export type Score = [number, number];

/** What every side-based round mode keeps (round flow: src/sim/modes/rounds.ts). */
export interface RoundMatchBase {
  /** 1-based. */
  round: number;
  /** Tick at which the current phase ends; null once the match has ended. */
  phaseEndTick: number | null;
  score: Score;
  /** Team on the attacking side this round (sideOf in src/sim/modes/format.ts). */
  attackingTeam: number;
  /** The attackers' spawn zone this round (LevelDef.spawnZones id). */
  attackZoneId: string;
  /** Winner of the last finished round, null before the first result. */
  lastWinner: number | null;
}

export interface EliminationMatch extends RoundMatchBase {
  mode: 'elimination';
  phase: EliminationPhase;
}

/** What an uplink channel does: an attacker plants it, a defender disrupts the planted one. */
export type UplinkAction = 'plant' | 'disrupt';
/** The `uplink` event's moment of a channel. */
export type UplinkStage = 'start' | 'cancel' | 'complete';

/** A plant or disrupt being channelled (held interact, ADR-0013 §5). */
export interface UplinkChannel {
  action: UplinkAction;
  entityId: EntityId;
  /** The site planted at (disrupt: the uplink's site). */
  siteId: string;
  startTick: number;
  /** Completes at the mode step of this tick if still held and qualified. */
  endTick: number;
}

/** The planted uplink (phase `uplink`). */
export interface PlantedUplink {
  siteId: string;
  /** The planter's feet when the plant completed. */
  pos: Vec3;
}

export interface RelayMatch extends RoundMatchBase {
  mode: 'relay';
  phase: RelayPhase;
  /** The running plant or disrupt; at most one at a time. */
  channel: UplinkChannel | null;
  /** Set when a plant completes (phase `uplink`), cleared by the next round. */
  uplink: PlantedUplink | null;
}

/** The match state of a side-based round mode (roundMatchOf in src/sim/modes/format.ts). */
export type RoundMatch = EliminationMatch | RelayMatch;

/** The running mode and its match state; the mode id doubles as ModeId (src/sim/modes/mode.ts). */
export type MatchState = { mode: 'range' } | RoundMatch;

export interface SimState {
  tick: number;
  /** Simulation time in seconds (tick × TICK_DT). */
  time: number;
  /** The seed the simulation was created with (never changes); per-character streams derive
   *  from it (characterSeed in rng.ts). */
  seed: number;
  /** Match-level draws (coin flips, spawn zones, auto-picks); spread uses CharacterEntity.rng. */
  rng: RngState;
  /** Characters only (the name is kept from M1); world objects have their own lists. */
  entities: CharacterEntity[];
  gadgets: GadgetEntity[];
  projectiles: ProjectileEntity[];
  areas: AreaEntity[];
  /** Next id of the one id space of characters and world objects (allocateId). */
  nextId: number;
  match: MatchState;
}

export type SimEvent =
  /** A (re)spawn, with the facing it set (radians); controllers take their look over from it. */
  | { type: 'spawn'; tick: number; entityId: EntityId; yaw: number; pitch: number }
  | { type: 'operatorChanged'; tick: number; entityId: EntityId; operatorId: string }
  | { type: 'shot'; tick: number; entityId: EntityId; weaponId: string; origin: Vec3; dir: Vec3 }
  | {
      type: 'hit';
      tick: number;
      attackerId: EntityId;
      victimId: EntityId;
      zone: HitZone;
      damage: number;
      distance: number;
      point: Vec3;
      /** Where the damage came from: a shooter's ray origin at fire time (eye, aimOf), or an
       *  ability effect's origin (burst point, area centre). */
      sourcePos: Vec3;
      killed: boolean;
      cause: DamageCause;
      /** The part of `damage` shields took; health lost = damage − absorbed (at most the health). */
      absorbed: number;
    }
  | { type: 'impact'; tick: number; attackerId: EntityId; point: Vec3; normal: Vec3 }
  | { type: 'kill'; tick: number; attackerId: EntityId; victimId: EntityId; cause: DamageCause; headshot: boolean }
  | { type: 'reloadStart'; tick: number; entityId: EntityId; duration: number }
  | { type: 'reloadEnd'; tick: number; entityId: EntityId }
  | { type: 'dryFire'; tick: number; entityId: EntityId }
  | { type: 'weaponSwap'; tick: number; entityId: EntityId; slot: number; weaponId: string }
  /** An activation spent its resource; `pos` = the user's feet. */
  | { type: 'ability'; tick: number; entityId: EntityId; abilityId: string; slot: number; pos: Vec3 }
  | { type: 'abilityEnd'; tick: number; entityId: EntityId; abilityId: string; slot: number; reason: AbilityEndReason }
  /** Nothing was spent. */
  | { type: 'abilityFailed'; tick: number; entityId: EntityId; abilityId: string; reason: AbilityFailReason }
  | { type: 'gadgetPlaced'; tick: number; gadgetId: EntityId; ownerId: EntityId; abilityId: string; pos: Vec3 }
  | { type: 'gadgetHit'; tick: number; gadgetId: EntityId; attackerId: EntityId; amount: number; point: Vec3; cause: DamageCause }
  | {
      type: 'gadgetDestroyed';
      tick: number;
      gadgetId: EntityId;
      abilityId: string;
      ownerId: EntityId;
      pos: Vec3;
      attackerId: EntityId;
      cause: DamageCause;
    }
  /** A gadget trigger or a projectile applied its ability's effects at `pos`. */
  | { type: 'burst'; tick: number; source: 'gadget' | 'projectile'; sourceId: EntityId; abilityId: string; ownerId: EntityId; pos: Vec3 }
  /** `entityId` became visible to `team` (it was not revealed to that team before). */
  | { type: 'revealed'; tick: number; entityId: EntityId; team: number; abilityId: string }
  | { type: 'shieldGained'; tick: number; entityId: EntityId; abilityId: string; amount: number }
  | { type: 'shieldBroken'; tick: number; entityId: EntityId; abilityId: string }
  | { type: 'healed'; tick: number; entityId: EntityId; abilityId: string; amount: number; sourcePos: Vec3 }
  /** One per MOVEMENT.footsteps.strideM of grounded travel; loudness 1 = a standing walk. */
  | { type: 'footstep'; tick: number; entityId: EntityId; pos: Vec3; loudness: number }
  /** A match phase began (also round 1's preRound, emitted when the Sim is created). */
  | { type: 'phase'; tick: number; phase: MatchPhase; round: number; attackingTeam: number; endsAtTick: number | null }
  /** Relay (ADR-0013 §5): a plant or disrupt started, was cancelled (released, died, no longer
   *  qualified, the round ended) or completed; `pos` = the channeller's feet. */
  | { type: 'uplink'; tick: number; action: UplinkAction; stage: UplinkStage; entityId: EntityId; siteId: string; pos: Vec3 }
  | { type: 'roundEnd'; tick: number; round: number; winner: number; winnerSide: Side; reason: RoundEndReason; score: Score }
  | { type: 'matchEnd'; tick: number; winner: number; score: Score };

export type SimEventType = SimEvent['type'];

// NEW — ADR-0012 §7 / ADR-0013 §4: why an activation ended or was refused.
/** Why a channel, toggle or placement ended. */
export type AbilityEndReason = 'released' | 'maxDuration' | 'toggledOff' | 'interrupted' | 'died';
/** Why an activation was refused (nothing spent). `blocked`: the mode's ability gate
 *  (ModeRules.abilityAllowed, e.g. Relay setup). */
export type AbilityFailReason = 'unsupported' | 'notReady' | 'maxActive' | 'invalidPlacement' | 'blocked';

/** Rare, reliable requests applied at the start of the next tick (online: reliable RPCs). */
export type ControlMessage =
  | { type: 'selectOperator'; entityId: EntityId; operatorId: string }
  | { type: 'teleport'; entityId: EntityId; position: Vec3; yaw: number; pitch: number };
