import type { PlacementFailure } from '../sim/abilities/placement.ts';
import type { ButtonName } from '../sim/command.ts';
import type { ModeId } from '../sim/modes/mode.ts';
import type { AbilityFailReason, MatchPhase, UplinkAction } from '../sim/types.ts';
import type { ActivationKind, HitZone, NavLinkKind, NavTag, Side, Surface, Vec3Tuple, WeaponClass, WeightClass } from '../data/schema.ts';
import { AI, AI_TIERS, MATCH, MOVEMENT, RELAY, SIM } from './sim.ts';

// NEW — central constants for the client (SSOT): rendering, camera, input bindings, settings
// schema, HUD, audio, loop limits and screenshot shots. Plain data only (no Three.js imports)
// so Node tools can read it too (README controls are generated from BINDINGS).

export const APP = {
  title: 'Counterweight',
  version: 'v0.1 — Phase 1 prototype',
  /** Loading watchdog: show an error instead of an endless loading screen. */
  bootTimeoutMs: 60_000,
} as const;

// NEW — no launch options existed; the range was hardcoded in startApp.
/** Launch options read from the page URL at boot (src/client/launch.ts, ADR-0011 §7). A value
 *  that names nothing fails the boot visibly; the menu relaunches with `mode` and `level`. */
export const LAUNCH = {
  /** URL parameter names: `?mode=elimination&level=saltworks&tier=hard&seed=42`. */
  params: { mode: 'mode', level: 'level', tier: 'tier', seed: 'seed' },
  /** Mode when the URL names none: Relay, the primary mode, since its M2 DoD was met (ADR-0013
   *  Q3, user default 2026-09-30; elimination before). Elimination and the range stay in the
   *  menu and at `?mode=elimination` / `?mode=range`. */
  defaultMode: 'relay' as ModeId,
  /** Level per mode when the URL names none (ids from src/data/levels). */
  defaultLevel: { range: 'range', elimination: 'saltworks', relay: 'saltworks' } satisfies Record<ModeId, string>,
  /** Gameplay seed when the URL names none: 'perLoad' draws a fresh one per page load (the debug
   *  overlay shows it, `?seed=` replays it), or a fixed seed. Without `?tier=` the bots play the
   *  persisted 'difficulty' setting. */
  seed: 'perLoad' as 'perLoad' | number,
} as const;

// NEW — mode ids had no display text (MODES in src/sim/modes/ holds rules only).
/** Menu text per mode. */
export const MODE_TEXT = {
  range: { name: 'Range', description: 'Practice against dummies; switch operators freely.' },
  elimination: {
    name: 'Elimination',
    description: `${MATCH.teamSize}v${MATCH.teamSize} rounds: you and ${MATCH.teamSize - 1} bots against ${MATCH.teamSize} bots.`,
  },
  relay: {
    name: 'Relay',
    description: `${MATCH.teamSize}v${MATCH.teamSize}: attackers plant the uplink at a site, defenders stop or disrupt it. You and ${MATCH.teamSize - 1} bots against ${MATCH.teamSize} bots.`,
  },
} satisfies Record<ModeId, { name: string; description: string }>;

// NEW — characters carried no team marking (SPEC §16 asks for a team-coloured torso band);
// elimination needs friend and foe apart at a glance.
/** Team colours as the local player sees them: the torso band of every character
 *  (render/actors.ts) and the round HUD / kill feed, which read them as the CSS custom
 *  properties --ally / --enemy (set from here at boot, so both use one source). */
export const TEAM_STYLE = {
  colors: { ally: 0x4fa8ff, enemy: 0xff4d5e },
  /** Torso band (unlit): the torso's main part (the chest), `grow` × as wide and deep and
   *  `height` × as tall. */
  band: { grow: 1.1, height: 0.28 },
} as const;

/** Fixed-step loop limits (ADR-0003). */
export const LOOP = {
  /** Longer frames are clamped (tab switches, breakpoints). */
  maxFrameSeconds: 0.25,
  /** Tick cap per frame: at very low frame rates the game slows down instead of spiralling. */
  maxTicksPerFrame: 8,
} as const;

export const RENDER = {
  maxPixelRatio: 2,
  exposure: 0.6,
  shadowMapSize: 4096,
  shadowBias: -0.0003,
  shadowNormalBias: 0.03,
  /** Extra margin (m) around the level bounds for the sun's shadow camera. */
  shadowMargin: 4,
  near: 0.05,
  far: 500,
  fog: { color: 0xc7d6e4, near: 90, far: 320 },
  /** Sun direction drives the directional light, the sky and the environment lighting.
   *  Azimuth from +Z towards +X: 125° lights targets downrange from the right and throws
   *  readable side shadows towards the firing line. */
  sun: { azimuthDeg: 125, elevationDeg: 38, color: 0xfff0dc, intensity: 3.4 },
  hemisphere: { sky: 0xd6e6ff, ground: 0x6b6258, intensity: 0.3 },
  environmentIntensity: 0.4,
  sky: { turbidity: 5, rayleigh: 1.4, mieCoefficient: 0.004, mieDirectionalG: 0.82, scale: 450 },
} as const;

/** Greybox dev-texture palette per surface class (SPEC §13 "readable surfaces"). */
export const SURFACE_STYLE: Record<Surface, { base: number; line: number; accent: number; roughness: number }> = {
  floor: { base: 0x8d9299, line: 0x767b83, accent: 0x5f646b, roughness: 0.9 },
  wall: { base: 0xc9c2b6, line: 0xb1a999, accent: 0x958c7c, roughness: 0.85 },
  cover: { base: 0xc98a3c, line: 0xae7431, accent: 0x8a5a22, roughness: 0.8 },
  ramp: { base: 0x5b8fc7, line: 0x4a78a9, accent: 0x3a5f88, roughness: 0.8 },
  platform: { base: 0x7fae6b, line: 0x6a945a, accent: 0x537746, roughness: 0.85 },
  trim: { base: 0xe2c14a, line: 0x2b2b2b, accent: 0x2b2b2b, roughness: 0.6 },
};

export const DEV_TEXTURE = {
  pixels: 512,
  /** One texture tile covers this many metres; it shows a line every metre. */
  tileMeters: 4,
  lineWidthPx: 3,
  majorLineWidthPx: 8,
} as const;

/** Range distance labels on the floor. */
export const RANGE_LABELS = { color: '#1d1f22', sizeMeters: 1.6, offsetZ: 1.4 } as const;

// NEW — nothing drew the bot waypoint graph (ADR-0011 §5: a debug overlay reviews it).
/** Bot waypoint graph overlay (src/client/render/navDebug.ts; shown with the debug overlay):
 *  drawn through walls, `lift` m above the node feet positions. Nodes are coloured by their
 *  first tag (untagged: `node`), links by kind; one-way links get `oneWay`. */
export const NAV_DEBUG = {
  lift: 0.15,
  nodePx: 9,
  node: 0xffffff,
  tags: { cover: 0x5fe0a0, hold: 0xffb547, patrol: 0x4fa8ff },
  links: { walk: 0xe8e8e8, jump: 0xff7ad9, crouch: 0x9d7aff },
  oneWay: 0xff4d5e,
} satisfies { lift: number; nodePx: number; node: number; tags: Record<NavTag, number>; links: Record<NavLinkKind, number>; oneWay: number };

// NEW — nothing drew abilities (ADR-0012 §9): gadgets, projectiles, areas, radius rings, bursts,
// the placement ghost and shields (src/client/render/abilities.ts, render/actors.ts). Radii and
// shapes come from the sim (data, gadgetShape); only looks live here.
/** Ability world visuals. Team colours: TEAM_STYLE. */
export const ABILITY_VISUALS = {
  /** Placement ghost: the gadget shape at placementPose, tinted by validity. */
  ghost: { valid: 0x5fe0a0, invalid: 0xff4d5e, opacity: 0.35 },
  /** Barrier boxes in the owner's team colour (TEAM_STYLE; SPEC §16: ability effects use the
   *  owning team's colour); `disabledColor` while disabled (disableGadgets). */
  barrier: { opacity: 0.9, roughness: 0.7, disabledColor: 0x55595e },
  /** Device balls in the owner's team colour, drawn `scale` × their collider radius so they
   *  read at range; `disabledColor` while disabled. */
  device: { scale: 1.4, emissive: 0.5, disabledColor: 0x55595e },
  /** Radius rings (areas, trigger and aura radii, channel ring) at exactly the data radius:
   *  line width (m), lift above the ground (m), segments, fill opacity of an area's disc. */
  ring: { widthM: 0.06, liftM: 0.03, segments: 64, fillOpacity: 0.18 },
  /** Projectiles in flight: sphere radius (m). */
  projectile: { radiusM: 0.08 },
  /** Tessellation of the shared unit sphere (device balls, projectiles, burst flashes). */
  sphereSegments: { width: 20, height: 14 },
  /** Burst flash at a burst's pos: lifetime (s) and colour. */
  burst: { seconds: 0.25, color: 0xffd28a },
  /** Shield shell around shielded characters: `grow` × the body, opacity, colour. */
  shield: { grow: 1.15, opacity: 0.22, color: 0x7fd4ff },
} as const;

// NEW — ADR-0013 §4: Relay's setup walls stand only in setup and had no look.
/** Relay setup walls (src/client/render/level.ts), drawn while the mode raises them
 *  (matchSetupWallsUp): a translucent fill and an opaque outline. The fill is tone-mapped like
 *  the scene, so it needs this much opacity to read as amber at range (0.22 and 0.4 read as
 *  faint beige in the relay_setup_walls shot, R3 review). */
export const SETUP_WALL_STYLE = { color: 0xffb547, opacity: 0.55, edgeOpacity: 0.95 } as const;

export const CAMERA = {
  /** Horizontal FOV range/default are in SETTINGS_SCHEMA; this is the view-model camera. */
  viewModelFov: 58,
} as const;

export const VIEWMODEL = {
  /** Offset (m) right and down of the eye of the weapon root at the hip. */
  hip: [0.2, -0.19],
  /** At the hip the rear of the weapon (the stock at the shoulder) sits this far in front of the
   *  eye; the depth is derived per weapon from its length. Short enough that the rear sight
   *  stays below the bottom screen edge for every class (it used to float in the lower-right
   *  corner behind the ammo panel for the SMG and the pistol). */
  hipRearDepth: 0.17,
  /** Fully aimed: the rear sight sits this far in front of the eye, centred; depth and height
   *  are derived per weapon so the sight line is exactly the screen centre. */
  adsEyeRelief: 0.16,
  sightHeight: 0.018,
  /** Fraction of look-lag sway and recoil muzzle rise left when fully aimed. */
  adsSteadiness: 0.3,
  /** Look-lag sway: the weapon trails the camera by `amount` rad of rotation and `shift` m of
   *  offset per rad of camera rotation, clamped at `max` rad, and returns at the weight class's
   *  `swayReturn` rate. */
  sway: { amount: 0.35, shift: 0.08, max: 0.08 },
  /** Movement bob: one dip per footstep — `strideM` is the sim's footstep stride (ADR-0011 §2),
   *  so the cadence follows the speed (fast operators bob faster) and matches the step sounds.
   *  The amplitude is the weight class's `bobAmplitude` at the operator's walk speed and grows
   *  with speed up to `maxSpeedFactor` × walk speed (sprint); it is scaled by `adsScale` when
   *  aimed and blends in and out (stop, jump) at `blendRate`/s. */
  bob: { strideM: MOVEMENT.footsteps.strideM, maxSpeedFactor: 1.6, adsScale: 0.15, blendRate: 8 },
  /** Landing dip: m of drop per m/s of fall speed above `minFallSpeed` (step-downs do not dip),
   *  × the weight class's `landingDip`, capped at `maxDrop`, recovering at `recover`/s. */
  landing: { minFallSpeed: 2, dropPerMps: 0.008, maxDrop: 0.05, recover: 9 },
  /** Operator identity in hand (SPEC §11), by OperatorDef.presentation.weightClass: heavy =
   *  deep bob with a rolling gait, lazy sway return and a hard landing; light = shallow, snappy. */
  weightClasses: {
    light: { bobAmplitude: 0.007, bobRoll: 0.012, swayReturn: 14, landingDip: 0.6 },
    medium: { bobAmplitude: 0.011, bobRoll: 0.022, swayReturn: 10, landingDip: 1 },
    heavy: { bobAmplitude: 0.017, bobRoll: 0.04, swayReturn: 7, landingDip: 1.5 },
  } satisfies Record<WeightClass, { bobAmplitude: number; bobRoll: number; swayReturn: number; landingDip: number }>,
  /** Recoil kick per degree of camera kick the shot applied (the sim's pattern × ADS × recoil
   *  modifier), so hard-kicking weapons shove harder: m back and rad muzzle-up; the accumulated
   *  kick is capped at `maxDeg` and recovers at `recover`/s. */
  kick: { backPerDeg: 0.03, pitchPerDeg: 0.03, maxDeg: 3.5, recover: 14 },
  muzzleFlashSeconds: 0.05,
  /** Sprint pose: offset (m) and rotation (rad, XYZ) at full sprint, reached in `inSeconds`. The
   *  weapon comes back up within GUNPLAY.sprintOutTime — exactly when it may fire again. */
  sprint: { offset: [-0.02, -0.09, 0], rotation: [-0.35, 0.3, 0.2], inSeconds: 0.2 },
  /** Lowered pose while an ability blocks the weapon (weaponBlockedBy: channel, placement):
   *  offset (m) and rotation (rad, XYZ) when fully lowered, blended in and out over
   *  `blendSeconds`. */
  lowered: { offset: [0, -0.2, 0.04], rotation: [-0.55, 0, 0], blendSeconds: 0.15 },
  /** Weapon swap (timing from the sim, GUNPLAY.weaponSwapSeconds): the old weapon is lowered
   *  for this fraction of the swap, then the new one is raised. At the bottom the weapon sits
   *  `swapDrop` m lower and pitched `swapTilt` rad muzzle-down. */
  swapLowerFraction: 0.5,
  swapDrop: 0.28,
  swapTilt: 0.7,
  /** Per class: body length/height/width (m) and body colour. */
  classes: {
    lmg: { length: 0.62, height: 0.13, width: 0.075, color: 0x3a3f45 },
    ar: { length: 0.52, height: 0.1, width: 0.06, color: 0x3d4247 },
    br: { length: 0.56, height: 0.11, width: 0.065, color: 0x4a4038 },
    carbine: { length: 0.46, height: 0.095, width: 0.058, color: 0x404a44 },
    smg: { length: 0.34, height: 0.1, width: 0.055, color: 0x2f3a45 },
    pdw: { length: 0.38, height: 0.09, width: 0.06, color: 0x394536 },
    mp: { length: 0.26, height: 0.085, width: 0.05, color: 0x45323a },
    shotgun: { length: 0.58, height: 0.1, width: 0.065, color: 0x4a3a2c },
    dmr: { length: 0.66, height: 0.1, width: 0.06, color: 0x363c34 },
    pistol: { length: 0.19, height: 0.12, width: 0.04, color: 0x2b2d30 },
    revolver: { length: 0.24, height: 0.12, width: 0.045, color: 0x3b3b3b },
  } satisfies Record<WeaponClass, { length: number; height: number; width: number; color: number }>,
} as const;

// ── Input ───────────────────────────────────────────────────────────────────

export type ClientAction = 'moveForward' | 'moveBack' | 'moveLeft' | 'moveRight' | 'switchOperator' | 'toggleDebug';

export interface Binding {
  action: ButtonName | ClientAction;
  /** KeyboardEvent.code (physical key, layout-independent), a mouse button index, or the mouse
   *  wheel (either direction; each notch is one press). */
  code?: string;
  mouseButton?: number;
  wheel?: boolean;
  label: string;
  description: string;
}

export const BINDINGS: readonly Binding[] = [
  { action: 'moveForward', code: 'KeyW', label: 'W', description: 'Move forward' },
  { action: 'moveBack', code: 'KeyS', label: 'S', description: 'Move back' },
  { action: 'moveLeft', code: 'KeyA', label: 'A', description: 'Strafe left' },
  { action: 'moveRight', code: 'KeyD', label: 'D', description: 'Strafe right' },
  { action: 'sprint', code: 'ShiftLeft', label: 'Shift', description: 'Sprint (forward only)' },
  { action: 'crouch', code: 'KeyC', label: 'C', description: 'Crouch (hold)' },
  { action: 'jump', code: 'Space', label: 'Space', description: 'Jump' },
  { action: 'fire', mouseButton: 0, label: 'Left mouse', description: 'Fire' },
  { action: 'ads', mouseButton: 2, label: 'Right mouse', description: 'Aim down sights (hold)' },
  { action: 'reload', code: 'KeyR', label: 'R', description: 'Reload' },
  { action: 'selectPrimary', code: 'Digit1', label: '1', description: 'Primary weapon' },
  { action: 'selectSecondary', code: 'Digit2', label: '2', description: 'Secondary weapon' },
  { action: 'swapWeapon', wheel: true, label: 'Mouse wheel', description: 'Swap to the other weapon' },
  { action: 'ability1', code: 'KeyQ', label: 'Q', description: 'Ability 1 (hold to channel; while placing: fire places, aim or the key again cancels)' },
  { action: 'ability2', code: 'KeyE', label: 'E', description: 'Ability 2 (hold to channel; while placing: fire places, aim or the key again cancels)' },
  { action: 'interact', code: 'KeyF', label: 'F', description: 'Interact (hold): plant or disrupt the uplink (Relay)' },
  { action: 'switchOperator', code: 'KeyO', label: 'O', description: 'Switch operator (range; elimination and Relay: before the round starts)' },
  { action: 'toggleDebug', code: 'Backquote', label: '` (DE: ^)', description: 'Toggle debug overlay' },
];

/** The key label bound to an action, for hints (e.g. 'O'). */
export const bindingLabel = (action: string): string => BINDINGS.find((b) => b.action === action)?.label ?? '?';

/** Keys handled by the browser itself (listed in help texts, not rebindable). */
export const SYSTEM_KEYS: readonly { id: 'release'; label: string; description: string }[] = [
  { id: 'release', label: 'Esc', description: 'Release the mouse / open the menu' },
];

/** The label of a system key, for hints (e.g. 'Esc'). */
export const systemKeyLabel = (id: (typeof SYSTEM_KEYS)[number]['id']): string => SYSTEM_KEYS.find((k) => k.id === id)?.label ?? '?';

export const INPUT = {
  /** Degrees of rotation per mouse count at sensitivity 1 (industry-standard yaw factor). */
  degreesPerCount: 0.022,
  /** Wheel events closer together than this (ms) count as one notch (free-spinning wheels and
   *  touchpads send bursts). */
  wheelRepeatMs: 150,
} as const;

// ── Settings (defaults live only here, ADR-0007) ─────────────────────────────

/** `group: 'match'` settings are listed with the match choices in the menu; they take effect when a
 *  match starts (changing one starts a new match where it matters). */
export type SettingDef = { key: string; label: string; group?: 'match' } & (
  | { kind: 'range'; min: number; max: number; step: number; default: number; unit?: string }
  | { kind: 'toggle'; default: boolean }
  | { kind: 'select'; options: readonly string[]; default: string }
);

export const SETTINGS_SCHEMA = [
  // One tier for every bot (ADR-0011 §7); `?tier=` overrides it for a single launch.
  { key: 'difficulty', kind: 'select', label: 'Bot difficulty', options: AI_TIERS, default: 'medium', group: 'match' },
  { key: 'fov', kind: 'range', label: 'Field of view (horizontal)', min: 70, max: 110, step: 1, default: 95, unit: '°' },
  { key: 'sensitivity', kind: 'range', label: 'Mouse sensitivity', min: 0.2, max: 8, step: 0.05, default: 2 },
  { key: 'adsSensitivity', kind: 'range', label: 'ADS sensitivity multiplier', min: 0.2, max: 1.5, step: 0.05, default: 0.85 },
  { key: 'volume', kind: 'range', label: 'Volume', min: 0, max: 1, step: 0.05, default: 0.5 },
  { key: 'rawInput', kind: 'toggle', label: 'Raw mouse input (if supported)', default: true },
  { key: 'damageNumbers', kind: 'toggle', label: 'Damage numbers', default: true },
] as const satisfies readonly SettingDef[];

export const SETTINGS_STORAGE_KEY = 'counterweight.settings.v1';

// ── HUD ─────────────────────────────────────────────────────────────────────

export const HUD = {
  hitMarkerSeconds: 0.2,
  killMarkerSeconds: 0.45,
  damageNumberSeconds: 0.9,
  /** Screen pixels a damage number rises over its lifetime. */
  damageNumberRisePx: 46,
  healthBarWidthPx: 64,
  /** Metres above the head where the dummy health bar floats. */
  healthBarOffset: 0.35,
  /** Crosshair line length and minimum gap in px. */
  crosshairLength: 9,
  crosshairMinGap: 3,
  /** Crosshair opacity while the weapon cannot fire (canFire in src/sim/stats.ts: sprint and
   *  sprint-out, swap, reload — SPEC §11) and in the full sprint pose: the faded crosshair says
   *  so; it is back at full opacity the moment the weapon may fire again. */
  crosshairBlockedOpacity: 0.25,
  /** Damage-direction indicator (SPEC §14): an arc on a ring around the crosshair pointing at
   *  the attacker's position at hit time, re-aimed as you turn. Fully visible for `holdSeconds`,
   *  then fades out over `fadeSeconds`. Hits from the same attacker refresh one arc; at most
   *  `maxArcs` stack (the oldest is dropped). */
  damageIndicator: { radiusPx: 96, thicknessPx: 7, arcDeg: 40, holdSeconds: 0.6, fadeSeconds: 0.9, maxArcs: 4 },
  /** Kill feed (SPEC §14, top right): the newest `maxEntries` kills, each shown `seconds` and
   *  faded out over the last `fadeSeconds`. */
  killFeed: { maxEntries: 5, seconds: 6, fadeSeconds: 0.8 },
  /** Round HUD (SPEC §14, top centre): the live round clock turns urgent in its last seconds. */
  roundHud: { urgentSeconds: 10 },
  /** Relay HUD (ADR-0013 §8): the round HUD's phase captions and banners
   *  (src/client/modes/relayHost.ts), the operator select screen (ui/operatorSelect.ts) and the
   *  objective HUD (ui/objectiveHud.ts). The setup and uplink banners show for the first
   *  `bannerSeconds` of their phase. */
  relay: {
    bannerSeconds: 4,
    /** World markers (through walls): every site at its SiteDef.center — hidden while the player
     *  stands in it — and the planted uplink `uplinkLiftM` above the planter's feet. */
    markers: { uplinkLiftM: 1 },
    /** Operator select keys while the pointer is free: `pickKeyPrefix` + n (KeyboardEvent.code)
     *  picks card n (from 1; its label is n), `readyKey` keeps the current operator. Both return
     *  to the game (pointer lock), like a click on a card or on the ready button. */
    select: { pickKeyPrefix: 'Digit', readyKey: { code: 'Enter', label: 'Enter' } },
    text: {
      /** Round HUD clock caption per running phase (the uplink's names its site). */
      caption: { preRound: 'Operator select', setup: 'Setup', live: 'Engagement' },
      uplink: (site: string): string => `Uplink · ${site}`,
      /** The round's task per side: the round-start banner and the select screen's header. */
      task: {
        attack: 'You attack: plant the uplink at a site and hold it, or eliminate every defender',
        defend: 'You defend: stop the plant, disrupt a planted uplink, or hold until time runs out',
      } satisfies Record<Side, string>,
      sidesSwapped: 'Sides swapped.',
      attackersEnter: (zone: string): string => `The attackers enter at ${zone}`,
      /** Setup per side: the banner and the objective line. An attacker's line adds which of the
       *  player's abilities the setup gate lets through (`usable`: their names). */
      setup: {
        attack: 'Hold at the spawn: recon abilities only',
        defend: 'Fortify the sites: the building stays closed until the round starts',
      } satisfies Record<Side, string>,
      reconUsable: (usable: readonly string[]): string => (usable.length ? `usable now: ${usable.join(', ')}` : 'yours unlock when the round starts'),
      /** The objective line under the round HUD in the engagement (`sites`: the site letters)
       *  and while the uplink runs. */
      objective: {
        live: {
          attack: (sites: readonly string[]): string => `Plant the uplink at ${sites.join(' or ')}`,
          defend: (sites: readonly string[]): string => `Hold ${sites.join(' and ')} · stop the plant`,
        },
        uplink: { attack: 'Hold the uplink', defend: 'Disrupt the uplink' } satisfies Record<Side, string>,
      },
      /** A teammate's running channel replaces the objective line. */
      teamChannel: {
        plant: (operator: string, site: string): string => `${operator} is planting at ${site}`,
        disrupt: (operator: string, site: string): string => `${operator} is disrupting the uplink at ${site}`,
      } satisfies Record<UplinkAction, (operator: string, site: string) => string>,
      /** The prompt under the crosshair (after the interact key) and the player's running channel. */
      prompt: { plant: 'Hold to plant the uplink', disrupt: 'Hold to disrupt the uplink' } satisfies Record<UplinkAction, string>,
      channel: { plant: 'Planting', disrupt: 'Disrupting' } satisfies Record<UplinkAction, string>,
      /** A world marker's line: its name and the distance from the player. */
      marker: (name: string, metres: number): string => `${name} · ${Math.round(metres)} m`,
      uplinkMarker: 'Uplink',
      /** The operator select screen and its compact strip (pointer locked). */
      select: {
        title: 'Operator select',
        weapons: 'Weapons',
        abilities: 'Abilities',
        recon: 'recon · usable in setup',
        team: 'Your team',
        you: 'You',
        selected: 'Selected',
        full: 'Team limit',
        picks: (taken: number, limit: number): string => `${taken}/${limit} on your team`,
        stats: (health: number, armour: number, speed: number): string => `${health} HP · armour ${Math.round(armour * 100)} % · ${speed} m/s`,
        keys: (pickKeys: string, readyKey: string): string => `${pickKeys}: pick and play · ${readyKey}: keep and play`,
        ready: 'Ready',
        menu: 'Menu',
        strip: (current: string, nextKey: string, releaseKey: string): string =>
          `${current} · ${nextKey}: next operator · ${releaseKey}: choose with the mouse`,
      },
    },
  },
  /** Ability slots and feedback (ADR-0012 §9): the channel bar under the crosshair (px) and the
   *  texts. The placing hint names the fire and ADS bindings (bindingLabel) with these words. */
  abilities: {
    channelBar: { widthPx: 140, heightPx: 5 },
    text: {
      place: 'place',
      cancel: 'cancel',
      /** Slot detail of a placeable: gadgets in the world / maxActive. */
      placed: (count: number, max: number): string => `${count}/${max} placed`,
      revealed: 'REVEALED',
      failure: {
        unsupported: 'Coming in M2',
        notReady: 'Not ready',
        maxActive: 'All placed',
        invalidPlacement: 'Cannot place here',
        blocked: 'Not now',
      } satisfies Record<AbilityFailReason, string>,
      placement: { noSurface: 'Out of reach', surface: 'Wrong surface', blocked: 'Blocked' } satisfies Record<PlacementFailure, string>,
    },
  },
  /** Reveal markers over revealed enemies (src/client/ui/revealMarkers.ts): size (px), the
   *  fade-out over the entry's last seconds, and the metres above the head centre where the
   *  marker's tip sits — just clear of the head ball (src/data/hitboxes.ts), below a range
   *  health bar (`healthBarOffset`), so the marker never covers the head it points at. */
  reveal: { markerPx: 14, fadeSeconds: 0.5, liftM: 0.16 },
  debugRefreshHz: 4,
  /** Impact marks kept in the world before the oldest is recycled. */
  maxImpactMarks: 96,
  impactMarkSize: 0.07,
} as const;

// ── Audio (synthesised placeholders, SPEC §15) ──────────────────────────────

/** One synthesised impulse (gunshots, footsteps, impacts): a low-passed noise burst of `length`
 *  s (cutoff Hz) plus a decaying body tone (Hz) shaped by AUDIO.impulse; `gain` is its peak. */
export interface Impulse {
  length: number;
  cutoff: number;
  tone: number;
  gain: number;
}

// NEW — no world-sound attenuation existed (sounds were all the local player's own).
/** How far one kind of world sound carries (src/client/audio/spatial.ts): `gain` × the timbre's
 *  gain within `refDistance` m, inverse-distance falloff beyond it (`rolloff` 1 = −6 dB per
 *  doubling), faded to silence at `maxDistance` m. A sound's loudness scales the distances. */
export interface SoundReach {
  gain: number;
  refDistance: number;
  rolloff: number;
  maxDistance: number;
}

export const AUDIO = {
  /** Per weapon class (an Impulse): noise burst length (s), low-pass cutoff (Hz), body tone
   *  (Hz), gain. The local player's own shots play exactly like this: loud, dry, centred. */
  shot: {
    lmg: { length: 0.16, cutoff: 1800, tone: 70, gain: 0.9 },
    ar: { length: 0.12, cutoff: 2600, tone: 90, gain: 0.75 },
    br: { length: 0.15, cutoff: 2000, tone: 80, gain: 0.85 },
    carbine: { length: 0.11, cutoff: 2900, tone: 95, gain: 0.7 },
    smg: { length: 0.08, cutoff: 3600, tone: 120, gain: 0.6 },
    pdw: { length: 0.09, cutoff: 3400, tone: 115, gain: 0.6 },
    mp: { length: 0.06, cutoff: 4200, tone: 140, gain: 0.5 },
    shotgun: { length: 0.22, cutoff: 1400, tone: 60, gain: 1.0 },
    dmr: { length: 0.2, cutoff: 1900, tone: 75, gain: 0.95 },
    pistol: { length: 0.08, cutoff: 3200, tone: 130, gain: 0.55 },
    revolver: { length: 0.16, cutoff: 2100, tone: 85, gain: 0.9 },
  } satisfies Record<WeaponClass, Impulse>,
  /** Body tone of every Impulse: lasts `toneLength` × the burst, peaks at `toneGain` × its gain
   *  and glides down to `toneEnd` × its pitch. */
  impulse: { toneLength: 1.5, toneGain: 0.8, toneEnd: 0.4 },
  /** Footsteps per weight class (SPEC §15: anchors are audibly heavy): an Impulse plus `jitter`,
   *  the ± random pitch fraction per step (cutoff and tone). Cadence and loudness come from the
   *  sim's footstep event (ADR-0011 §2), never from the client. */
  footstep: {
    light: { length: 0.045, cutoff: 2600, tone: 170, gain: 0.2, jitter: 0.12 },
    medium: { length: 0.06, cutoff: 1700, tone: 120, gain: 0.3, jitter: 0.1 },
    heavy: { length: 0.085, cutoff: 900, tone: 75, gain: 0.45, jitter: 0.08 },
  } satisfies Record<WeightClass, Impulse & { jitter: number }>,
  /** The local player's own steps play non-positional and dry at this × the timbre's gain × the
   *  step's loudness — quieter than anyone else's step next to you. */
  ownFootstepGain: 0.35,
  /** A bullet hitting level geometry (positional; one per attacker per tick, shotgun pellets
   *  do not stack). */
  impact: { length: 0.035, cutoff: 5200, tone: 1100, gain: 0.3 } satisfies Impulse,
  hit: { body: 1400, head: 2300, kill: 900, length: 0.07, gain: 0.35 },
  /** Taking damage: a short low-passed noise thump (length s, cutoff Hz, gain). */
  hurt: { length: 0.12, cutoff: 600, gain: 0.5 },
  /** UI tones (Hz) and their shared envelope; the round stingers (SPEC §15) mark the end of the
   *  pre-round freeze (Relay: of the setup), a round won or lost, and Relay's setup start, a
   *  completed plant and a disrupt (heard by everyone). */
  ui: {
    reload: 520,
    dry: 260,
    ability: 660,
    swap: 390,
    roundStart: 880,
    roundWon: 1040,
    roundLost: 220,
    setupStart: 740,
    uplinkPlanted: 1320,
    uplinkDisrupted: 330,
    length: 0.06,
    gain: 0.25,
  },
  /** Relay uplink channels (ADR-0013 §8): a start and a cancel cue per action, positional at the
   *  channeller, as far as bots hear a start (AUDIO.spatial.reach.uplink). Completions play the
   *  ui stingers. */
  uplink: {
    plant: {
      start: { length: 0.3, cutoff: 2400, tone: 180, gain: 0.6 },
      cancel: { length: 0.08, cutoff: 1800, tone: 140, gain: 0.35 },
    },
    disrupt: {
      start: { length: 0.3, cutoff: 3000, tone: 260, gain: 0.6 },
      cancel: { length: 0.08, cutoff: 2200, tone: 200, gain: 0.35 },
    },
  } satisfies Record<UplinkAction, Record<'start' | 'cancel', Impulse>>,
  /** Abilities (ADR-0012 §9, src/client/audio/sfx.ts). Every ability's signature is derived, not
   *  listed: the `wave` of its activation kind (the kind is heard in the timbre) at `baseTone` of
   *  its kind × 2^(its index among the abilities of that kind in ABILITIES × stepSemitones / 12),
   *  so each one sounds different for both teams; `length` (s) and `gain` shape it. Two abilities
   *  with the same wave are at least stepSemitones / 2 apart (unit test). Cues are Impulses for
   *  the world events of abilities. */
  ability: {
    signature: {
      baseTone: { instant: 520, hold: 311, toggle: 415, placeable: 370, thrown: 587, passive: 262 } satisfies Record<ActivationKind, number>,
      wave: {
        instant: 'triangle',
        hold: 'sine',
        toggle: 'sine',
        placeable: 'square',
        thrown: 'sawtooth',
        passive: 'sine',
      } satisfies Record<ActivationKind, Exclude<OscillatorType, 'custom'>>,
      stepSemitones: 2,
      length: 0.16,
      gain: 0.3,
    },
    /** A lasting area (areaDenial) sounds while it exists: looped noise at its pos, low-passed at
     *  `cutoff` Hz (duller with distance), at `gain` × the ability reach's distance gain; it fades
     *  in and out, and follows the listener's distance, with the time constant `fadeSeconds`. A
     *  world voice like any other (AUDIO.voices). */
    areaLoop: { cutoff: 800, gain: 0.3, fadeSeconds: 0.2 },
    cues: {
      burst: { length: 0.24, cutoff: 1300, tone: 65, gain: 0.8 },
      gadgetPlaced: { length: 0.05, cutoff: 3200, tone: 520, gain: 0.3 },
      gadgetDestroyed: { length: 0.2, cutoff: 1700, tone: 95, gain: 0.6 },
      healed: { length: 0.12, cutoff: 5200, tone: 880, gain: 0.3 },
      shieldGained: { length: 0.1, cutoff: 4600, tone: 740, gain: 0.3 },
      shieldBroken: { length: 0.12, cutoff: 3400, tone: 300, gain: 0.4 },
      revealed: { length: 0.15, cutoff: 6000, tone: 1180, gain: 0.35 },
      abilityEnd: { length: 0.06, cutoff: 3000, tone: 440, gain: 0.2 },
    } satisfies Record<string, Impulse>,
  },
  /** Envelopes decay exponentially to this fraction of their peak (−60 dB) at a sound's end. */
  decayFloor: 0.001,
  /** Length (s) of the shared white-noise buffer every burst plays a random stretch of; the
   *  longest burst (× AUDIO.spatial.air.lengthScale) must fit. */
  noiseSeconds: 1,
  /** Positional world sounds. The Web Audio listener follows the render camera every frame;
   *  every world sound gets its own PannerNode at the source. */
  spatial: {
    /** 'HRTF' gives front/back and above/below cues on headphones ("which side is that shooter
     *  on"), which 'equalpower' (left/right only) cannot; its extra cost per voice is bounded by
     *  AUDIO.voices.maxWorld. */
    panningModel: 'HRTF',
    /** Per kind of world sound. Gunshots and footsteps carry exactly as far as bots hear them
     *  (AI.hearing; footsteps × the event's loudness) along a clear line. Bots hear less through
     *  walls (AI.hearing.occludedRangeFactor); player audio has no occlusion yet. */
    reach: {
      gunshot: { gain: 0.7, refDistance: 3, rolloff: 0.6, maxDistance: AI.hearing.gunshotRadiusM },
      footstep: { gain: 1, refDistance: 1.5, rolloff: 1, maxDistance: AI.hearing.footstepRadiusM },
      impact: { gain: 1, refDistance: 1.5, rolloff: 1.2, maxDistance: 30 },
      /** Ability sounds carry exactly as far as bots hear them (AI.hearing.abilityRadiusM). */
      ability: { gain: 0.8, refDistance: 2, rolloff: 1, maxDistance: AI.hearing.abilityRadiusM },
      /** Relay plant/disrupt cues: as far as bots hear a start (AI.hearing.uplinkRadiusM). */
      uplink: { gain: 0.9, refDistance: 2, rolloff: 1, maxDistance: AI.hearing.uplinkRadiusM },
    } satisfies Record<string, SoundReach>,
    /** Fraction of every reach (its far end) over which a sound fades out to silence. */
    edgeFade: 0.3,
    /** Distance tail (SPEC §15): towards `fullAtM` m a world sound gets duller (cutoff ×
     *  `cutoffScale`) and rings longer (length × `lengthScale`). The local player's are dry. */
    air: { fullAtM: 50, cutoffScale: 0.35, lengthScale: 2 },
  },
  /** At most `maxWorld` positional voices play at once; when full, a new sound louder than the
   *  quietest playing one replaces it (faded out over `stealFadeSeconds`), otherwise it is
   *  skipped. World sounds quieter than `inaudibleGain` at the listener are never started. The
   *  local player's own sounds are not capped. */
  voices: { maxWorld: 24, stealFadeSeconds: 0.015, inaudibleGain: 0.002 },
} as const;

// ── Screenshot shots (npm run shots; SSOT for window.__shotNames) ────────────

// NEW — headless captures run at ~5 fps, so transient feedback (hit markers, damage arcs) and
// short poses (sprint) are gone before a frame is taken; nothing existed to show them statically.
/** Presentation-only sample shown and frozen for a capture (never touches the simulation). */
export interface ShotSample {
  /** Damage arcs from attackers at these bearings (degrees from the view direction, positive =
   *  clockwise / to the right). */
  damageFromDeg?: readonly number[];
  /** A hit marker of this variant. */
  hit?: { zone: HitZone; killed: boolean };
  /** Sprint pose blend 0…1. */
  sprintPose?: number;
}

// NEW — no way existed to stage match situations (kills, round phases) for a capture.
/** A kill staged for a capture through the normal input path: killer and victim are teleported
 *  (ControlMessages) to the shot's killSpot, facing each other, and the killer aims at the
 *  victim's torso and fires (Commands) until the victim is dead. 'enemy' and 'ally' are relative to
 *  the local player; of those the living one with the lowest entity id is picked. */
export interface StagedKill {
  killer: 'player' | 'enemy';
  victim: 'player' | 'enemy' | 'ally';
  /** Repeat with the next living victim; default 1. */
  count?: number;
}

/** Staged kills fire bursts of `fireTicks` with the trigger down and `pauseTicks` up (recoil
 *  recovers, the aim is refreshed) and give up after `timeoutSeconds` (sim time) per kill; a shot
 *  fast-forwards (QA advanceTicks) at most `phaseTimeoutSeconds` (sim time) to its phase — long
 *  enough for Relay's operator select and setup. A staged plant holds interact at most
 *  RELAY.plantSeconds + `plantSlackSeconds`. */
export const SHOT_STAGING = {
  fireTicks: 2,
  pauseTicks: 8,
  timeoutSeconds: 20,
  phaseTimeoutSeconds: RELAY.preRoundSeconds + RELAY.setupSeconds + 10,
  plantSlackSeconds: 1,
} as const;

// NEW — nothing staged an ability for a capture (ADR-0012 §9: ghost, gadgets, areas, channel).
/** A look (degrees) a staged placement aims along. */
export interface ShotLook {
  yawDeg: number;
  pitchDeg: number;
}

/** An ability staged in a player shot through Commands only (the slot's key, fire), after the
 *  shot's pose is set. The simulation then pauses, so the capture shows exactly the staged moment
 *  (a channel mid-way, a burning area); the next shot resumes it. The shot is rejected if the
 *  simulation does not do what the staging asks (e.g. an invalid placement). `slot` indexes the
 *  operator's abilities (0 = ability1). */
export type ShotAbility =
  /** Press the key of a placeable: the placement ghost at the shot's look. */
  | { kind: 'placing'; slot: number }
  /** Place one gadget along each look (default: the shot's look), confirming with fire; the view
   *  then returns to the shot's look. */
  | { kind: 'place'; slot: number; looks?: readonly ShotLook[] }
  /** Hold the key for `seconds` (a hold ability's channel). */
  | { kind: 'hold'; slot: number; seconds: number }
  /** Press the key once (instant, toggle, throw along the crosshair), then wait `seconds`. */
  | { kind: 'press'; slot: number; seconds: number };

export type ShotDef = {
  /** Launch of the page the shot is taken in (see shotLaunch): mode, level and seed.
   *  tools/screenshot.mjs loads each launch once and takes its shots there in SHOTS order. */
  mode?: ModeId;
  levelId?: string;
  seed?: number;
} & (
  | {
      kind: 'free';
      position: Vec3Tuple;
      lookAt: Vec3Tuple;
      /** Show the bot waypoint graph (src/client/render/navDebug.ts). */
      navDebug?: boolean;
      /** A match mode: fast-forward to this phase first (Relay's setup walls). */
      phase?: MatchPhase;
    }
  | {
      kind: 'player';
      operatorId: string;
      position: Vec3Tuple;
      yawDeg: number;
      pitchDeg: number;
      ads?: boolean;
      debug?: boolean;
      /** Weapon slot in hand (index into WEAPON_SLOTS, src/sim/entities.ts); default primary. */
      weaponSlot?: number;
      sample?: ShotSample;
      /** An ability staged last (the simulation pauses for the capture). */
      ability?: ShotAbility;
    }
  | {
      /** The local player's own view of a running match: first person, or the death camera once
       *  dead. Bots send neutral commands meanwhile, so the staging is reproducible. */
      kind: 'match';
      /** Kills staged first, in order; they wait for the live phase. */
      kills?: readonly StagedKill[];
      /** Where staged kills happen (feet positions with a clear line between them). */
      killSpot?: { killer: Vec3Tuple; victim: Vec3Tuple };
      /** Relay: after the kills, the player plants the uplink at the nearest site (teleported onto
       *  its floor in the live phase, interact held); the shot is rejected if the player's team
       *  does not attack (pick a seed) or the plant does not complete. */
      plant?: boolean;
      /** The match phase the capture shows; the shot fast-forwards to it and is rejected if it
       *  does not come within SHOT_STAGING.phaseTimeoutSeconds. */
      phase: MatchPhase;
    }
);

/** The launch a shot is taken in (the app's QA hooks and tools/screenshot.mjs). */
export interface ShotLaunch {
  mode: ModeId;
  levelId: string;
  seed: number;
}

/** Shots without a mode run in the range mode, the automated test scene. */
const SHOT_DEFAULT_MODE: ModeId = 'range';

/** A shot's launch: its mode (default the range), level (default the mode's LAUNCH.defaultLevel)
 *  and seed (default SIM.defaultSeed, so every capture is reproducible). */
export function shotLaunch(shot: ShotDef): ShotLaunch {
  const mode = shot.mode ?? SHOT_DEFAULT_MODE;
  return { mode, levelId: shot.levelId ?? LAUNCH.defaultLevel[mode], seed: shot.seed ?? SIM.defaultSeed };
}

/** Level id of the Saltworks shots. */
const SALTWORKS = 'saltworks';

/** Relay shots and the Relay e2e test (tests/e2e/relay.spec.ts): round 1 has the player's team
 *  (MATCH.playerTeam) attacking from West Gate. */
export const RELAY_SHOT_SEED = 7;

/** Staged kills on Saltworks: the open lane between the spawn shields and the pump house. */
const SALTWORKS_KILL_SPOT = { killer: [0, 0, 27], victim: [0, 0, 19] } as const satisfies { killer: Vec3Tuple; victim: Vec3Tuple };

export const SHOTS: Record<string, ShotDef> = {
  overview: { kind: 'free', position: [-30, 34, 38], lookAt: [2, 0, -18] },
  course: { kind: 'free', position: [12, 8, 22], lookAt: [29, 1, -6] },
  player_basalt: { kind: 'player', operatorId: 'basalt', position: [0, 0, 12], yawDeg: 12, pitchDeg: -4 },
  player_wisp: { kind: 'player', operatorId: 'wisp', position: [0, 0, 12], yawDeg: 12, pitchDeg: -4 },
  player_kestrel: { kind: 'player', operatorId: 'kestrel', position: [0, 0, 12], yawDeg: 12, pitchDeg: -4 },
  player_heron: { kind: 'player', operatorId: 'heron', position: [0, 0, 12], yawDeg: 12, pitchDeg: -4 },
  secondary_basalt: { kind: 'player', operatorId: 'basalt', position: [0, 0, 12], yawDeg: 12, pitchDeg: -4, weaponSlot: 1 },
  ads_heron: { kind: 'player', operatorId: 'heron', position: [-2, 0, 8], yawDeg: 6.5, pitchDeg: -2.5, ads: true },
  ads_basalt: { kind: 'player', operatorId: 'basalt', position: [-2, 0, 8], yawDeg: 6.5, pitchDeg: -2.5, ads: true },
  debug_overlay: { kind: 'player', operatorId: 'wisp', position: [0, 0, 12], yawDeg: 12, pitchDeg: -4, debug: true },
  feedback_wisp: {
    kind: 'player',
    operatorId: 'wisp',
    position: [0, 0, 12],
    yawDeg: 12,
    pitchDeg: -4,
    sample: { damageFromDeg: [-70, 160], hit: { zone: 'head', killed: false } },
  },
  sprint_basalt: { kind: 'player', operatorId: 'basalt', position: [0, 0, 12], yawDeg: 12, pitchDeg: -4, sample: { sprintPose: 1 } },
  peek_walls: { kind: 'player', operatorId: 'wisp', position: [-20, 0, 2], yawDeg: 25, pitchDeg: -3 },
  // Abilities (ADR-0012 §9), taken in this order in one range page: a gadget stays until its
  // owner changes operator, so the overview follows the Lattice shot.
  ability_placing_keel: {
    kind: 'player',
    operatorId: 'keel',
    position: [-7, 0, 3],
    yawDeg: 0,
    pitchDeg: -20,
    ability: { kind: 'placing', slot: 0 },
  },
  ability_barrier_keel: {
    kind: 'player',
    operatorId: 'keel',
    position: [-7, 0, 3],
    yawDeg: 0,
    pitchDeg: -20,
    ability: { kind: 'place', slot: 0 },
  },
  ability_nodes_lattice: {
    kind: 'player',
    operatorId: 'lattice',
    position: [-25, 0, -7.5],
    yawDeg: 0,
    pitchDeg: -10,
    // Two nodes on the doorway wall either side of the door, one on the floor in front of it.
    ability: {
      kind: 'place',
      slot: 0,
      looks: [
        { yawDeg: 30, pitchDeg: 0 },
        { yawDeg: -30, pitchDeg: 0 },
        { yawDeg: 0, pitchDeg: -40 },
      ],
    },
  },
  ability_gadget_overview: { kind: 'free', position: [-18.5, 6, -1.5], lookAt: [-25, 0.8, -9.5] },
  ability_fire_gorse: {
    kind: 'player',
    operatorId: 'gorse',
    position: [2, 0, 1],
    yawDeg: 0,
    pitchDeg: -8,
    // Past the fuse (it runs from the throw): the area burns.
    ability: { kind: 'press', slot: 0, seconds: 1.8 },
  },
  ability_sonar_heron: {
    kind: 'player',
    operatorId: 'heron',
    position: [-5, 0, 0],
    yawDeg: 25,
    pitchDeg: -12,
    // About half the channel: the ring has reached the 10 m lane dummies, not the 20 m lane.
    ability: { kind: 'hold', slot: 0, seconds: 1.2 },
  },
  // Saltworks (greybox map #1).
  saltworks_overview: { levelId: SALTWORKS, kind: 'free', position: [-23, 55, 60], lookAt: [2, 0, 19] },
  saltworks_site_b: { levelId: SALTWORKS, kind: 'free', position: [30, 13, 0], lookAt: [14, 4, -16] },
  saltworks_site_a: { levelId: SALTWORKS, kind: 'free', position: [-9.5, 7, -14.5], lookAt: [-15, 0, -25] },
  saltworks_lobby: { levelId: SALTWORKS, kind: 'free', position: [-4.5, 1.7, -5.5], lookAt: [4, 3, -20] },
  saltworks_attack_spawn: { levelId: SALTWORKS, kind: 'free', position: [-19, 1.62, 35], lookAt: [-10, 2, 0] },
  nav_overview: { levelId: SALTWORKS, kind: 'free', position: [0, 60, 34], lookAt: [0, 0, 1], navDebug: true },
  // Elimination on Saltworks (ADR-0011 §7): one page load, taken in this order — each shot
  // continues the match where the previous one left it.
  elimination_preround: { mode: 'elimination', kind: 'match', phase: 'preRound' },
  elimination_live: {
    mode: 'elimination',
    kind: 'match',
    phase: 'live',
    kills: [{ killer: 'player', victim: 'enemy' }],
    killSpot: SALTWORKS_KILL_SPOT,
  },
  elimination_death: {
    mode: 'elimination',
    kind: 'match',
    phase: 'live',
    kills: [{ killer: 'enemy', victim: 'player' }],
    killSpot: SALTWORKS_KILL_SPOT,
  },
  elimination_round_end: {
    mode: 'elimination',
    kind: 'match',
    phase: 'roundEnd',
    kills: [{ killer: 'enemy', victim: 'ally', count: MATCH.teamSize - 1 }],
    killSpot: SALTWORKS_KILL_SPOT,
  },
  // Relay on Saltworks (ADR-0013 §8): one page load, taken in this order — the operator select
  // screen, the setup walls, the attacker's setup HUD (recon hint, site markers), the engagement
  // HUD from the spawn (both site markers through the walls), the uplink running.
  relay_select: { mode: 'relay', seed: RELAY_SHOT_SEED, kind: 'match', phase: 'preRound' },
  relay_setup_walls: { mode: 'relay', seed: RELAY_SHOT_SEED, kind: 'free', phase: 'setup', position: [0, 7, 10], lookAt: [0, 2.5, -4] },
  relay_setup: { mode: 'relay', seed: RELAY_SHOT_SEED, kind: 'match', phase: 'setup' },
  relay_live: { mode: 'relay', seed: RELAY_SHOT_SEED, kind: 'match', phase: 'live' },
  relay_uplink: { mode: 'relay', seed: RELAY_SHOT_SEED, kind: 'match', phase: 'uplink', plant: true },
};
