// NEW — central constants for the simulation side (SSOT). Global rules only: anything that is
// per operator / weapon / ability belongs in src/data/. Must stay free of Three.js and DOM
// (ADR-0003); imported by sim, ai, client and tests.

import type { EffectKind, NavLinkKind, RadiusEffectKind, Side } from '../data/schema.ts';

export const SIM = {
  /** Fixed simulation rate. Everything gameplay-related advances in these steps. */
  tickRate: 60,
  /** Default seed for the gameplay RNG (spread samples). */
  defaultSeed: 0x5eed_c0de,
  /** Gravity in m/s² (higher than 9.81 for snappier, game-like jump arcs). */
  gravity: 20,
  maxFallSpeed: 40,
} as const;

/** Seconds per simulation tick — derived, never hardcoded elsewhere. */
export const TICK_DT = 1 / SIM.tickRate;

// NEW — sim-side seconds → ticks (phase timers, bot cadences); only local test/client copies existed.
/** Whole ticks for a duration in seconds (rounded to the nearest tick). */
export const secondsToTicks = (seconds: number): number => Math.round(seconds * SIM.tickRate);

// NEW — ADR-0012 batch K: the countdowns disagreed on when they end (`> 0`, `<= 0`, half a tick,
// rounded ticks), so float residue of repeated `-= dt` gave some an extra tick.
/** The one "time is up" rule of the simulation: true once a countdown's `remainingSeconds` round
 *  to no whole tick (secondsToTicks ≤ 0). Counted down by `dt` per tick, a duration of D s thus
 *  ends after exactly secondsToTicks(D) ticks whatever float drift the subtraction leaves. Elapsed
 *  time is checked as `isTimeUp(duration - elapsed)`. */
export const isTimeUp = (remainingSeconds: number): boolean => secondsToTicks(remainingSeconds) <= 0;

// NEW — ADR-0014 §3: match recordings (Sim.create's `record` option, src/sim/recording.ts).
export const REPLAY = {
  /** A recording stores the state digest after every step whose tick is a multiple of this, so a
   *  replay names the first diverged window (replayRecording). 600 = every 10 s at 60 Hz. */
  checkpointEveryTicks: 600,
} as const;

/** Movement capsule, eye height and character-controller tuning (shared by all operators, so
 *  movement collision is fair; per-operator size differences live in hitbox profiles). */
export const CHARACTER = {
  radius: 0.35,
  standHeight: 1.8,
  crouchHeight: 1.2,
  /** Standing eye height above the feet; the crouched eye height scales with the stance ratio. */
  eyeHeight: 1.62,
  /** Stance change rate: fraction of a full stand↔crouch transition per second. */
  stanceRate: 6,
  /** Rapier KCC skin offset (m): the gap the controller keeps to every surface. */
  controllerOffset: 0.02,
  /** Surfaces up to this slope are ground (walkable, climbable); steeper ones are walls. */
  maxSlopeClimbDeg: 46,
  minSlopeSlideDeg: 50,
  autostepMaxHeight: 0.42,
  autostepMinWidth: 0.2,
  /** How far down a standing character follows the ground per tick (steps down, slopes). */
  snapToGround: 0.35,
  /** Ground within this distance below a resting capsule counts as under the feet (the same
   *  margin Rapier's own ground detection uses). */
  groundProbe: 0.05,
  /** A standing capsule rests this much further above the ground than the controller offset,
   *  so moves along the floor never graze it: Rapier reads noisy normals for sweeps that start
   *  exactly at the offset (centimetre hops, lost speed). See PhysicsWorld.move. */
  groundClearance: 0.005,
  /** Headroom test when standing up: shrink and lift the test capsule to ignore the floor. */
  headroomSkin: 0.03,
  maxPitchDeg: 89,
} as const;

/** Global movement rules (operator-specific speeds/acceleration are data). */
export const MOVEMENT = {
  /** Fraction of ground acceleration available in the air. */
  airControl: 0.3,
  /** Deceleration multiplier when there is no move input on the ground (stopping feels crisp). */
  groundBrakeMultiplier: 1.4,
  /** Forward input needed to keep sprinting (sprint is forward-only). */
  sprintForwardThreshold: 0.5,
  /** Footstep events (ADR-0011 §2: bot hearing, footstep audio): one per `strideM` of grounded
   *  travel, so the cadence follows the speed (operator, sprint, crouch, ADS). Loudness 1 = a
   *  standing walk; × the footstepVolume modifiers × `sprintLoudness` while sprinting ×
   *  lerp(1, `crouchLoudness`, stance). Crouch-walking is quiet, not silent (the SPEC only makes
   *  footstep volume a modifiable stat, §8/§15). */
  footsteps: { strideM: 1.8, sprintLoudness: 1.5, crouchLoudness: 0.3 },
} as const;

// NEW — rules shared by every team mode (range excluded). Team size was a level-schema constant
// (spawn points per zone); it is a match rule. ADR-0011's elimination block reads it from here.
export const MATCH = {
  /** Players per team (SPEC §4.1: 5v5); every spawn zone has one point per player. */
  teamSize: 5,
  /** The player's team in the side modes; the player is its slot 0 (defaultRoster, format.ts).
   *  Moved from ELIMINATION: the roster serves elimination and Relay (ADR-0013 §1). */
  playerTeam: 0,
} as const;

/** Who attacks: a coin flip from SimState.rng, or a fixed team index. */
export type TeamPick = 'coinFlip' | number;

// NEW — the attack/defence match format (SPEC §4.1 "Match", accepted 2026-09-27). Shared by
// elimination (M1) and Relay (M2); the helpers live in src/sim/modes/format.ts.
export const MATCH_FORMAT = {
  /** Round wins that take the match (first to 4). */
  roundsToWin: 4,
  /** Sides swap every this many rounds; at roundsToWin − 1 wins each, one overtime round decides. */
  sideSwapAfterRounds: 3,
  /** Attackers of round 1 and of the overtime round (coordinator default: coin flips). */
  firstAttackingTeam: 'coinFlip' as TeamPick,
  overtimeAttackingTeam: 'coinFlip' as TeamPick,
  /** Round clock expired → this side wins (user decision 2026-09-27: defenders, as in Relay). */
  timeoutWinner: 'defend' as Side,
  /** Both sides wiped out in the same tick → this side wins (coordinator default; no draws). */
  mutualWipeWinner: 'defend' as Side,
} as const;

/** How the attackers' spawn zone is chosen every round: drawn from SimState.rng among the level's
 *  attack zones (coordinator default), or always the first one. A player's choice of edge (SPEC
 *  §13) is not in M2 (ADR-0013 Q4). */
export type AttackZonePick = 'random' | 'first';

// NEW — elimination rounds (SPEC §4.3, ADR-0011 §6): preRound → live → roundEnd → next round or
// matchEnd. Team size: MATCH.teamSize; format and result rules: MATCH_FORMAT.
export const ELIMINATION = {
  /** Freeze at round start: look and operator choice only. */
  preRoundSeconds: 5,
  /** Round clock; when it runs out MATCH_FORMAT.timeoutWinner takes the round. */
  roundSeconds: 120,
  /** The result is shown (and locked) this long before the next round or the match end. */
  roundEndSeconds: 4,
  attackZone: 'random' as AttackZonePick,
} as const;

// NEW — Relay (SPEC §4.1, ADR-0013 §1): operator select → setup → engagement → uplink running →
// round end, first to MATCH_FORMAT.roundsToWin. Phase timings are the SPEC §4.1 proposals
// accepted 2026-09-27 (the SPEC links here); plant/disrupt times and the disrupt radius are
// coordinator defaults (the SPEC names none, ADR-0013 Q5). Team size: MATCH.teamSize; format and
// the wipe/timeout rules: MATCH_FORMAT.
export const RELAY = {
  /** Operator select: frozen, look only; picks (selectOperator) accepted. */
  preRoundSeconds: 20,
  /** Setup: attackers frozen (look and recon abilities); defenders inside the setup walls. */
  setupSeconds: 30,
  /** Engagement: the round clock; a plant starts the uplink, running out → MATCH_FORMAT.timeoutWinner. */
  engagementSeconds: 150,
  /** Uplink running: the defenders must disrupt it before it completes (attackers win). */
  uplinkSeconds: 40,
  /** The result is shown (and locked) this long before the next round or the match end. */
  roundEndSeconds: 5,
  /** Attackers' spawn edge: drawn every round (coordinator default, ADR-0013 Q4: no edge choice in M2). */
  attackZone: 'random' as AttackZonePick,
  /** Hold interact this long to plant (inside a site) or to disrupt (near the uplink). */
  plantSeconds: 4,
  disruptSeconds: 6,
  /** A disrupt needs the defender's feet within this distance of the uplink. */
  disruptRadiusM: 2,
  /** "Recon abilities only" in setup: an attacker's ability qualifies if every effect is of these
   *  kinds (isReconAbility in src/sim/modes/relay.ts; derived, no data tag). */
  setupAttackerEffects: ['reveal'] as readonly EffectKind[],
} as const;

/** Global gunplay rules (weapon-specific numbers are data). */
export const GUNPLAY = {
  /** Extra spread in degrees while airborne. */
  airSpreadDeg: 4,
  /** Spread multiplier when fully crouched. */
  crouchSpreadMultiplier: 0.8,
  /** Fire is blocked for this long after sprint ends (sprint-out time), seconds. */
  sprintOutTime: 0.12,
  /** Weapon swap time in seconds, the same for every weapon: no fire, ADS or reload until it has
   *  passed; a running reload is cancelled. A swap requested mid-swap reverses the elapsed part. */
  weaponSwapSeconds: 0.5,
  /** Trigger buffer, seconds: a trigger press the weapon cannot answer yet (swap, sprint-out,
   *  reload — see canFire in src/sim/stats.ts) stays pending while the trigger is held and this
   *  long after it is released; the first tick the weapon can fire answers it (a shot, subject
   *  to the fire cadence, or a dry fire). Longer than sprintOutTime, so even a one-tick click out
   *  of a sprint fires; short enough that a click early in a swap does not fire a surprise shot
   *  when the swap ends (hold the trigger for that). */
  triggerBufferSeconds: 0.15,
  /** All damage between teammates, abilities included (ADR-0012 §3.2): with it off, bullets,
   *  bursts and areas spare the own team and the user; with it on they hit them too. */
  friendlyFire: false,
} as const;

// NEW — hoisted out of RANGE_MODE (ADR-0011 §6): the elimination roster cycles the same list.
/** Operators the player can pick and bots play in matches (ids from src/data/operators). The one
 *  list of every mode-side rule, the select screen and the bots (ADR-0013 §3). */
export const PLAYABLE_OPERATORS = ['basalt', 'wisp', 'kestrel', 'heron'] as const;

// NEW — ADR-0013 §3 / Q1: SPEC §4.1's "an operator can be picked once per team" cannot hold
// while a team has more players than there are playable operators.
/** How many members of one team may play the same operator (Relay picks): derived, so it
 *  becomes SPEC's "once" as soon as PLAYABLE_OPERATORS can fill a team (coordinator default,
 *  ADR-0013 Q1; 2 with 4 operators and 5 players). */
export const operatorPickLimit = (): number => Math.ceil(MATCH.teamSize / PLAYABLE_OPERATORS.length);

/** Range mode (prototype/practice) rules. */
export const RANGE_MODE = {
  /** The range lets the player switch through every operator in src/data/operators (ADR-0012
   *  Q1: every ability can be tried and screenshotted); matches keep PLAYABLE_OPERATORS. */
  allOperators: true,
  dummyRespawnSeconds: 2.5,
  /** Reserve ammo is refilled on every reload in the range. */
  infiniteReserve: true,
  playerTeam: 0,
  dummyTeam: 1,
} as const;

// NEW — global rules of the ability framework (ADR-0012 §3–§5). Per-ability numbers (radii,
// amounts, durations, gadget health) are data in src/data/abilities.ts.
/** Ability rules shared by every ability. */
export const ABILITY_RULES = {
  /** Modifiers re-applied every tick (hold, toggle, aura gadgets, areas) lapse this long after
   *  the last re-application. */
  sustainSeconds: 0.1,
  /** Line-of-sight checks of an effect start this high above its origin. */
  losLiftM: 0.5,
  /** Per radius effect kind: does it need a line of sight (level geometry and barriers) from the
   *  origin to the target's torso? Only areas need one (fire does not burn through walls);
   *  damage (Bore Charge) works through the surface it is planted on; buffs and reveals ignore
   *  walls. The first effect that needs the other rule adds a per-effect override to the schema. */
  lineOfSight: {
    damage: false,
    heal: false,
    shield: false,
    modifier: false,
    reveal: false,
    areaDenial: true,
    disableGadgets: false,
  } satisfies Record<RadiusEffectKind, boolean>,
  /** Placement (src/sim/abilities/placement.ts): a ray that misses drops at most `maxDropM` from
   *  its end; a barrier's overlap test box is shrunk and lifted by `skinM`. */
  placement: { maxDropM: 2, skinM: 0.03 },
  /** Placed gadgets: proximity and aura triggers arm this long after placement; devices (every
   *  gadget that is not a barrier) are balls of `deviceRadiusM`. */
  gadget: { armSeconds: 0.5, deviceRadiusM: 0.15 },
  /** Barrier thickness; width and height are data (the barrier effect). */
  barrier: { thicknessM: 0.2 },
  /** Thrown projectiles: removed without effect after `maxFlightSeconds` (left the level); a
   *  burst on a surface happens `surfaceOffsetM` out of it. */
  thrown: { maxFlightSeconds: 8, surfaceOffsetM: 0.05 },
  /** An area (areaDenial) lands on the first level surface within `maxDropM` below its origin. */
  area: { maxDropM: 3 },
} as const;

// NEW — bot difficulty tiers (SPEC §12, ADR-0011 §4). Tiers change parameters only; the list
// also feeds the difficulty menu.
export const AI_TIERS = ['easy', 'medium', 'hard'] as const;
export type AiTier = (typeof AI_TIERS)[number];

/** Aim and combat skill of one tier (ADR-0011 §4). Angles in degrees, times in seconds. */
export interface AiTierDef {
  /** Seconds after a contact's firstSeenTick before turning towards it or firing. */
  reactionTime: number;
  /** Aim error sampled on acquisition, its floor, and its decay per second while visible. */
  aimErrorDeg: number;
  aimErrorMinDeg: number;
  aimErrorDecay: number;
  /** Error added when the target's velocity turns by more than AI.combat.directionChangeDeg. */
  directionChangeErrorDeg: number;
  /** Maximum look speed, degrees per second. */
  turnRateDeg: number;
  /** 0…1 of the own recoil aim offset subtracted from the look. */
  recoilCompensation: number;
  /** Chance per acquisition to aim at the head zone (else the torso). */
  headChance: number;
  /** Fire while the look is within this lateral offset (m) of the aim point. */
  fireToleranceM: number;
  /** Beyond AI.combat.burstBeyondM: shots per burst and the pause between bursts (s). */
  burstShots: number;
  burstPause: number;
  /** Strafe (ADAD) while engaging; zero movement on fire ticks. */
  strafe: boolean;
  stopToShoot: boolean;
  /** Retreat below this health fraction (0 = never). */
  retreatHealthFraction: number;
}

/** Bot tuning: range dummies (src/ai/dummy.ts) and the M1 combat bots (ADR-0011 §2–§5). */
export const AI = {
  dummy: {
    /** Strafe direction changes after a random duration in this range (seconds). */
    strafeSwitchMin: 0.5,
    strafeSwitchMax: 1.4,
    /** Chance per direction change to crouch for the next leg (strafing dummies). */
    crouchChance: 0.2,
  },
  /** Starting values (ADR-0011 §4 table); the M1 DoD tunes medium to 30–70 % duel wins. */
  tiers: {
    easy: {
      reactionTime: 0.45,
      aimErrorDeg: 6,
      aimErrorMinDeg: 1.2,
      aimErrorDecay: 1.5,
      directionChangeErrorDeg: 3,
      turnRateDeg: 180,
      recoilCompensation: 0.2,
      headChance: 0.1,
      fireToleranceM: 0.45,
      burstShots: 4,
      burstPause: 0.35,
      strafe: false,
      stopToShoot: false,
      retreatHealthFraction: 0,
    },
    medium: {
      reactionTime: 0.28,
      aimErrorDeg: 4,
      aimErrorMinDeg: 0.6,
      aimErrorDecay: 2.5,
      directionChangeErrorDeg: 2,
      turnRateDeg: 300,
      recoilCompensation: 0.55,
      headChance: 0.25,
      fireToleranceM: 0.3,
      burstShots: 6,
      burstPause: 0.25,
      strafe: true,
      stopToShoot: false,
      retreatHealthFraction: 0.3,
    },
    hard: {
      reactionTime: 0.18,
      aimErrorDeg: 2.5,
      aimErrorMinDeg: 0.25,
      aimErrorDecay: 4,
      directionChangeErrorDeg: 1.2,
      turnRateDeg: 480,
      recoilCompensation: 0.85,
      headChance: 0.45,
      fireToleranceM: 0.2,
      burstShots: 8,
      burstPause: 0.2,
      strafe: true,
      stopToShoot: true,
      retreatHealthFraction: 0.35,
    },
  } satisfies Record<AiTier, AiTierDef>,
  /** Sight (src/ai/perception.ts). */
  perception: {
    /** Bot k scans for enemies when (tick + k) % scanIntervalTicks === 0 (staggered). */
    scanIntervalTicks: 3,
    maxSightM: 80,
    /** Full horizontal field of view; within nearAwarenessM a bot notices all round. */
    fovDeg: 110,
    nearAwarenessM: 2.5,
    /** Occlusions shorter than this keep firstSeenTick (a re-peek does not reset reaction). */
    reacquireGraceSeconds: 0.6,
    /** Contacts are forgotten this long after their last update. */
    memorySeconds: 8,
    /** Callouts become readable by teammates this many ticks after they are made. */
    calloutDelayTicks: secondsToTicks(0.8),
  },
  /** Hearing (src/ai/perception.ts). The radii hold for a clear line from the source to the ear
   *  (both at eye height, static geometry only); they also set the reach of positional audio. */
  hearing: {
    gunshotRadiusM: 60,
    /** × the footstep event's loudness. */
    footstepRadiusM: 18,
    /** Through static geometry every radius shrinks to this fraction. 0.5: with inverse-distance
     *  falloff (−6 dB per doubling) that is the loss of a sound reaching the ear around a corner
     *  or through a doorway instead of straight; a shot through walls then carries 30 m — about
     *  the depth of the Saltworks building — so its rooms still react, the far side of the map
     *  no longer does. One ray cannot tell one thin wall from a whole building: a middle value. */
    occludedRangeFactor: 0.5,
    /** Ability sounds (`ability`, `burst`, `gadgetPlaced` events; ADR-0012 §9–§10): players and
     *  bots hear them equally far. */
    abilityRadiusM: 30,
    /** Relay: an enemy starting to plant or disrupt the uplink (`uplink` event, stage `start`,
     *  ADR-0013 §5); players hear it as far (AUDIO.spatial.reach.uplink). */
    uplinkRadiusM: 30,
    /** ± noise on heard positions, drawn from the bot RNG … */
    positionErrorM: 2,
    /** … and on sounds heard through geometry: they arrive around it, their origin is vaguer. */
    occludedPositionErrorM: 4,
  },
  /** Decisions (src/ai/brain.ts). */
  brain: {
    /** Bots re-decide every this many ticks (staggered); aim and steering run every tick. */
    thinkIntervalTicks: 6,
    /** Share of a team that holds at round start, per side; the rest push. */
    holdFraction: { attack: 0.2, defend: 0.6 } satisfies Record<Side, number>,
    /** Attackers leave a hold after this long. */
    holdMaxSeconds: 12,
    /** Time spent looking around at an investigated position. */
    investigateSeconds: 3,
    /** No sprinting within this distance of an investigated contact. */
    cautionM: 8,
    /** Engage → investigate once the target has been unseen this long. */
    loseTargetSeconds: 2.5,
    /** Retreat only to cover within this distance. */
    retreatMaxM: 15,
    /** Reposition (after a kill, or hit by someone unseen) to cover within this distance. */
    repositionMaxM: 10,
    /** Cover candidates line-of-sight-checked against the threat per reposition/retreat pick
     *  (the nearest / farthest first; one ray each). */
    coverCandidates: 4,
    /** Defenders holding an angle investigate only leads this close (they keep their angle
     *  otherwise); everyone else follows any lead. Relay: a bot walking to or standing on a site
     *  for its objective (not planting or disrupting) follows a lead this close first (ADR-0013 §13). */
    holdInvestigateM: 10,
    /** The defended ground: nav nodes the defenders reach at least this much path before the
     *  attackers (from the spawn zones). Defenders patrol and investigate only there; attackers
     *  hunt its posts, cover, patrol and site nodes. */
    defendedMarginM: 15,
    /** An investigated contact that moved further than this gets a new destination. */
    leadUpdateM: 3,
    /** Patrol: the next node is drawn among this many nearest unvisited pool nodes … */
    patrolChoices: 4,
    /** … skipping the last this-many visited ones. */
    patrolMemory: 6,
  },
  /** Engagement rules shared by all tiers. */
  combat: {
    /** Switch target only if another contact is this factor × the current distance or closer. */
    switchTargetRatio: 0.6,
    adsBeyondM: 12,
    /** A target velocity turn larger than this adds the tier's directionChangeErrorDeg. */
    directionChangeDeg: 60,
    /** Below this horizontal speed (m/s) a target has no direction that could change. */
    directionChangeMinSpeed: 1,
    /** While tracking, the aim error's direction is redrawn inside its circle this often (s);
     *  the turn-rate limit smooths the jump. */
    errorResampleSeconds: 0.35,
    /** Fire in bursts (tier burstShots / burstPause) beyond this distance. */
    burstBeyondM: 20,
    /** ADAD while engaging (tiers with `strafe`): each leg lasts a random time in this range (s). */
    strafeSwitchMin: 0.3,
    strafeSwitchMax: 0.7,
    /** Out of a fight, reload at or below this fraction of the magazine. */
    reloadBelowFraction: 0.5,
  },
  /** Ability use (src/ai/abilities.ts, ADR-0012 §10; the data's AbilityDef.bot says when). */
  abilities: {
    /** A failed situation check waits this long (± bot RNG jitter) before the next try. */
    retrySeconds: 1,
    /** A `hold` placement goes this far ahead of the post along its watch direction (at most
     *  the ability's placeRange). */
    placeAheadM: 2,
    /** A placement not confirmed within this long is cancelled (ADS). */
    placeTimeoutSeconds: 1.5,
    /** `scout` abilities are used at most once per this long. */
    scoutIntervalSeconds: 12,
  },
  /** Relay (ADR-0013 §3, §7; R2 measured these values, §13). Operator picks: the bots pick
   *  `pickDelaySeconds` into the operator select (the player picks first). Objective duties
   *  (src/ai/objective.ts): below `rushSeconds` of engagement clock every attacker heads for the
   *  target site; a bot whose own plant/disrupt ends within `finishChannelSeconds` keeps holding
   *  instead of engaging; a disrupter walks to `approachFraction` × RELAY.disruptRadiusM of the
   *  uplink. */
  relay: { pickDelaySeconds: 3, rushSeconds: 45, finishChannelSeconds: 1, approachFraction: 0.5 },
  /** Waypoint navigation (src/ai/nav/, LevelDef.nav). */
  nav: {
    /** Longest allowed link (validation). */
    maxLinkM: 12,
    /** Every spawn point must lie within this distance of a nav node (validation). */
    maxSpawnSnapM: 3,
    /** nearest(pos): the closest this-many nodes (vertical distance × verticalWeight) are
     *  LOS-checked, the first visible one wins. */
    snapCandidates: 4,
    verticalWeight: 3,
    /** Height above the feet/nodes of nav line-of-sight checks (snapping, path shortcuts, link
     *  validation): above a stair step (CHARACTER.autostepMaxHeight), below low cover. */
    kneeHeightM: 0.5,
    /** A* cost multiplier per link kind. */
    linkCost: { walk: 1, jump: 1.5, crouch: 2 } satisfies Record<NavLinkKind, number>,
    /** A node counts as reached within this horizontal / vertical distance. */
    arriveRadiusM: 0.6,
    arriveHeightM: 1.2,
    /** Jump links press jump once within this distance of their start node. */
    jumpTriggerM: 0.8,
    /** Sprint only with at least this much straight path ahead (and no contacts). */
    sprintMinSegmentM: 6,
    /** Teammates closer than this push each other sideways. */
    separationM: 1.2,
    /** Stuck: less progress than stuckMinProgressM over stuckWindowSeconds → (1) jump, (2) block
     *  the link for blockLinkSeconds and replan, (3) after maxStuckRetries a new goal. */
    stuckMinProgressM: 0.5,
    stuckWindowSeconds: 1.5,
    blockLinkSeconds: 10,
    maxStuckRetries: 3,
  },
} as const;
