import { Color, Vector3 } from 'three';

// NEW — central constants file for the whole project (SSOT). All tunables live here.

/** Shown on the title screen so stale caches/old builds are immediately visible. */
export const APP_VERSION = 'v0.5';

export const RENDER = {
  /** Renderer exposure — calibrated against the HDRI + sun setup. */
  exposure: 1.0,
  maxPixelRatio: 2,
  shadowMapSize: 2048,
  camera: { fov: 55, near: 0.1, far: 600 },
} as const;

/**
 * Atmosphere & grading for the current lighting scenario (golden hour).
 * Fog colour must harmonise with the sky/HDRI — never default grey.
 */
export const ATMOSPHERE = {
  fogColor: new Color(0xc9a878),
  fogNear: 45,
  fogFar: 135,
  hdri: 'assets/hdri/spruit_sunrise_2k.hdr',
  /** Yaw applied to the HDRI environment so its warm side matches the sun azimuth. */
  envYaw: 2.0,
  /** Sun direction/colour — low golden-hour sun from the WSW, long raking shadows. */
  sun: {
    color: new Color(0xffdcb0),
    intensity: 3.2,
    position: new Vector3(-48, 15, 16),
  },
  envIntensity: 0.75,
  /** Stylized sky dome gradient (palette in VISUAL_SPEC.md). */
  sky: {
    zenith: 0x6b8cc4,
    horizon: 0xd9b083,
    ground: 0xc9a878,
  },
} as const;

export const POST = {
  n8ao: {
    aoRadius: 2.0,
    distanceFalloff: 1.0,
    intensity: 3.0,
    quality: 'Medium' as 'Performance' | 'Low' | 'Medium' | 'High' | 'Ultra',
  },
  bloom: { intensity: 0.35, luminanceThreshold: 0.75, luminanceSmoothing: 0.2, radius: 0.7 },
  vignette: { offset: 0.28, darkness: 0.62 },
  grading: { brightness: 0.0, contrast: 0.08, saturation: 0.12 },
} as const;

export const WORLD = {
  /** Playable area diameter in metres (spec: 60–100 m). */
  playableDiameter: 96,
} as const;

/** Tavern interior dressing. KayKit dungeon props are ~1.4x our scale — see
 *  src/data/measurements_kaykit.json — hence the global furniture scale. */
export const TAVERN = {
  furnitureScale: 0.7,
  /** Warm hearth/candle key light (position tavern-local). */
  light: { color: 0xffa14f, intensity: 14, distance: 9, position: [0, 2.3, -0.6] as [number, number, number] },
  /** Fill lights for the mounted torches flanking the door (tavern-local X). */
  torchLight: { color: 0xffa14f, intensity: 3, distance: 5 },
  flicker: { amount: 0.14, speed: 9 },
} as const;

/** Ambient creatures (models in assets/models/creatures/, sizes measured in
 *  src/data/measurements_creatures.json — raw exports are oversized). */
export const CREATURES = {
  deer: {
    scale: 0.4,
    /** Herd home centre (world XZ) and wander radius — NW meadow. */
    home: [-25, -21] as [number, number],
    radius: 6,
    count: 3,
    walkSpeed: 1.0,
    fleeSpeed: 4.6,
    turnLerp: 8,
    /** Player distance that startles the herd / lets it calm down again. */
    fleeStart: 6,
    fleeStop: 15,
  },
  /** Dormant skeleton camp at the SE forest edge (combat comes later). */
  skeleton: { scale: 0.7, camp: [30, 24] as [number, number] },
} as const;

/** Ambient motion tunables (vegetation sway — angle formula in engine/instanced.ts). */
export const AMBIENT = {
  swayFrequency: 1.4,
} as const;

export const PLAYER = {
  walkSpeed: 2.2,
  runSpeed: 5.4,
  /** How fast the character turns toward the move direction (rad/s equivalent damping). */
  turnLerp: 12,
  /** Movement acceleration damping. */
  moveLerp: 10,
  capsuleRadius: 0.32,
  capsuleHeight: 1.7,
  gravity: 22,
  animationFade: 0.22,
} as const;

export const CAMERA_RIG = {
  minDistance: 2.2,
  maxDistance: 9,
  defaultDistance: 5,
  /** Pitch limits in radians (up, down). */
  minPitch: -1.15,
  maxPitch: 0.5,
  /** Damping factors (higher = snappier). */
  rotationLerp: 14,
  zoomLerp: 8,
  /** Height of the orbit target above the character's feet. */
  targetHeight: 1.45,
  mouseSensitivity: 0.0026,
  /** Camera keeps this margin away from the surface it collides with. */
  collisionMargin: 0.25,
} as const;

export const INTERACT = {
  radius: 2.2,
  key: 'KeyE',
} as const;

export interface ShotDef {
  position: Vector3;
  target: Vector3;
}

/** Fixed, named camera positions for the automated screenshot loop (world scene). */
export const SHOTS: Record<string, ShotDef> = {
  opening: { position: new Vector3(-1.5, 2.9, 22), target: new Vector3(11, 3.8, -8) },
  primary_landmark: { position: new Vector3(2, 2.2, 2), target: new Vector3(13, 4.5, -9) },
  secondary_landmark: { position: new Vector3(0, 2.6, -3), target: new Vector3(-14, 6, 9) },
  exploration: { position: new Vector3(-18, 2.2, -14), target: new Vector3(2, 1.5, 4) },
  tavern_interior: { position: new Vector3(11.99, 1.5, -7.82), target: new Vector3(13.47, 0.95, -10.42) },
  deer_meadow: { position: new Vector3(-16, 2.2, -13), target: new Vector3(-25, 1, -21) },
  skeleton_camp: { position: new Vector3(25, 1.7, 26), target: new Vector3(29.8, 1.1, 23.6) },
};

/**
 * Bake-off vignette shots — identical across all candidates so screenshots are
 * directly comparable (spec Phase B).
 */
export const VIGNETTE_SHOTS: Record<string, ShotDef> = {
  opening: { position: new Vector3(7, 2.4, 9), target: new Vector3(0, 1.4, 0) },
  closeup: { position: new Vector3(2.8, 1.5, 4.2), target: new Vector3(0, 1.1, 0) },
  side: { position: new Vector3(-7.5, 2, 5), target: new Vector3(0.5, 1.2, 0) },
  low_hero: { position: new Vector3(3.5, 0.9, -6.5), target: new Vector3(0, 1.8, 0) },
};

export const SHOT_SIZE = { width: 1920, height: 1080 } as const;
