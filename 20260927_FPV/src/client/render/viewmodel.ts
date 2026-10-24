import {
  AdditiveBlending,
  BoxGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  type Scene,
} from 'three';
import { VIEWMODEL } from '../../config/client.ts';
import type { WeaponDef, WeightClass } from '../../data/schema.ts';
import { clamp, lerp, moveTowards, smoothstep } from '../../sim/math.ts';

// NEW — floating weapon view model (no arms; SPEC §11): look-lag sway, movement bob and landing
// dip by operator weight class, recoil kick scaled by the shot's camera kick, sprint pose, ADS
// moves the sight onto the screen centre, muzzle flash, weapon-swap lower/raise, lowered while
// an ability blocks the weapon (ADR-0012 §9).

const FLASH_COLOR = 0xffc36b;
const SIGHT_COLOR = 0x121417;

/** Exponential approach of `value` to `target` at `rate` per second. */
const damp = (value: number, target: number, rate: number, dt: number): number => lerp(value, target, 1 - Math.exp(-rate * dt));

/** What the view model reacts to each frame (interpolated simulation state and look input). */
export interface ViewModelMotion {
  /** 0 = hip, 1 = fully aimed. */
  ads: number;
  /** Sprint pose blend, 0 = ready, 1 = full sprint pose. */
  sprint: number;
  /** Horizontal speed, m/s. */
  speed: number;
  /** The operator's walk speed (OperatorDef.moveSpeed): the bob has its weight-class amplitude here. */
  walkSpeed: number;
  grounded: boolean;
  /** Vertical velocity, m/s (landing dip). */
  verticalSpeed: number;
  weightClass: WeightClass;
  /** Camera rotation since the last frame, radians. */
  lookDelta: { yaw: number; pitch: number };
  /** 1 while an ability blocks the weapon (weaponBlockedBy in src/sim/stats.ts: channel,
   *  placement), else 0; the view model blends towards VIEWMODEL.lowered over its
   *  `blendSeconds`. */
  lowered: number;
}

export class ViewModel {
  private readonly root = new Group();
  private weapon = new Group();
  private flash: Mesh | null = null;
  private weaponId = '';
  private hipDepth = 0;
  private adsHeight = 0;
  private adsDepth = 0;
  private swayYaw = 0;
  private swayPitch = 0;
  /** Accumulated recoil kick in degrees of camera kick. */
  private kick = 0;
  /** Steps walked (bob phase: π per step). */
  private bobSteps = 0;
  /** Smoothed bob strength, 0…VIEWMODEL.bob.maxSpeedFactor. */
  private bobWeight = 0;
  private landing = 0;
  private fallSpeed = 0;
  private wasGrounded = true;
  private flashTime = 0;
  /** 0 = in hand, 1 = fully lowered (weapon swap). */
  private swapDrop = 0;
  /** 0 = in hand, 1 = fully lowered (an ability blocks the weapon), linear; eased when applied. */
  private lowerBlend = 0;

  constructor(scene: Scene) {
    scene.add(this.root);
  }

  /** Shows the weapon in hand. During a swap (`swapProgress` 0…1, from the simulation) the model
   *  on screen is lowered first and only then replaced by `w`, which is raised. */
  setWeapon(w: WeaponDef, swapProgress: number | null): void {
    const f = VIEWMODEL.swapLowerFraction;
    const lowering = swapProgress !== null && swapProgress < f;
    this.swapDrop = swapProgress === null ? 0 : smoothstep(lowering ? swapProgress / f : (1 - swapProgress) / (1 - f));
    if (lowering && this.weaponId) return; // the outgoing model stays until it is out of view
    this.build(w);
  }

  private build(w: WeaponDef): void {
    if (w.id === this.weaponId) return;
    this.weaponId = w.id;
    this.root.remove(this.weapon);
    const dims = VIEWMODEL.classes[w.class];
    const body = new MeshStandardMaterial({ color: dims.color, roughness: 0.55, metalness: 0.3 });
    const dark = new MeshStandardMaterial({ color: SIGHT_COLOR, roughness: 0.4, metalness: 0.4 });
    const g = new Group();

    const receiver = new Mesh(new BoxGeometry(dims.width, dims.height, dims.length), body);
    g.add(receiver);
    const barrelLength = dims.length * 0.45;
    const barrel = new Mesh(new CylinderGeometry(dims.width * 0.22, dims.width * 0.22, barrelLength, 10), dark);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, dims.height * 0.15, -dims.length / 2 - barrelLength / 2);
    g.add(barrel);
    const mag = new Mesh(new BoxGeometry(dims.width * 0.8, dims.height * 1.1, dims.length * 0.14), dark);
    mag.position.set(0, -dims.height * 0.9, -dims.length * 0.12);
    g.add(mag);
    const grip = new Mesh(new BoxGeometry(dims.width * 0.75, dims.height * 1.1, dims.height * 0.45), dark);
    grip.rotation.x = 0.25;
    grip.position.set(0, -dims.height * 0.85, dims.length * 0.3);
    g.add(grip);
    // Sights: a rear notch (two posts with a gap) and a thin front post; their tops define the
    // sight line used for ADS alignment, and the notch keeps the screen centre clear.
    const sh = VIEWMODEL.sightHeight;
    const rearZ = dims.length / 2 - 0.02;
    for (const side of [-1, 1]) {
      const post = new Mesh(new BoxGeometry(0.006, sh, 0.008), dark);
      post.position.set(side * 0.009, dims.height / 2 + sh / 2, rearZ);
      g.add(post);
    }
    const front = new Mesh(new BoxGeometry(0.003, sh, 0.006), dark);
    front.position.set(0, dims.height / 2 + sh / 2, -dims.length / 2 + 0.02);
    g.add(front);

    const flashMaterial = new MeshBasicMaterial({ color: FLASH_COLOR, transparent: true, blending: AdditiveBlending, side: DoubleSide, depthWrite: false });
    const flash = new Mesh(new PlaneGeometry(0.16, 0.16), flashMaterial);
    const flash2 = flash.clone();
    flash2.rotation.y = Math.PI / 2;
    flash.add(flash2);
    flash.position.set(0, dims.height * 0.15, -dims.length / 2 - barrelLength - 0.05);
    flash.visible = false;
    g.add(flash);

    this.flash = flash;
    this.hipDepth = -(dims.length / 2 + VIEWMODEL.hipRearDepth);
    this.adsHeight = -(dims.height / 2 + sh);
    this.adsDepth = -(dims.length / 2 + VIEWMODEL.adsEyeRelief);
    this.weapon = g;
    this.root.add(g);
  }

  /** A shot of the local player; `kickDeg` is the camera kick it applied in the simulation. */
  onShot(kickDeg: number): void {
    this.kick = Math.min(VIEWMODEL.kick.maxDeg, this.kick + kickDeg);
    this.flashTime = VIEWMODEL.muzzleFlashSeconds;
    if (this.flash) this.flash.rotation.z = Math.random() * Math.PI;
  }

  update(dt: number, m: ViewModelMotion): void {
    const feel = VIEWMODEL.weightClasses[m.weightClass];

    // Look-lag sway: the weapon trails the camera, so it turns against the look change.
    const { amount, shift, max } = VIEWMODEL.sway;
    this.swayYaw = damp(clamp(this.swayYaw - m.lookDelta.yaw * amount, -max, max), 0, feel.swayReturn, dt);
    this.swayPitch = damp(clamp(this.swayPitch - m.lookDelta.pitch * amount, -max, max), 0, feel.swayReturn, dt);
    this.kick = damp(this.kick, 0, VIEWMODEL.kick.recover, dt);

    // Landing dip from the fastest fall speed of the airborne phase.
    const land = VIEWMODEL.landing;
    if (!m.grounded) {
      this.fallSpeed = Math.max(this.fallSpeed, -m.verticalSpeed);
    } else if (!this.wasGrounded) {
      const drop = Math.max(0, this.fallSpeed - land.minFallSpeed) * land.dropPerMps * feel.landingDip;
      this.landing = Math.min(land.maxDrop, this.landing + drop);
      this.fallSpeed = 0;
    }
    this.wasGrounded = m.grounded;
    this.landing = damp(this.landing, 0, land.recover, dt);

    // Bob: a U-shaped arc, lowest at each footfall; π of phase per step of grounded travel.
    const b = VIEWMODEL.bob;
    const speedFactor = m.walkSpeed > 0 ? Math.min(b.maxSpeedFactor, m.speed / m.walkSpeed) : 0;
    this.bobWeight = damp(this.bobWeight, m.grounded ? speedFactor : 0, b.blendRate, dt);
    if (m.grounded) this.bobSteps += (m.speed * dt) / b.strideM;
    const phase = this.bobSteps * Math.PI;
    const bobScale = this.bobWeight * lerp(1, b.adsScale, m.ads);
    const bob = feel.bobAmplitude * bobScale;

    const steady = lerp(1, VIEWMODEL.adsSteadiness, m.ads);
    const sprint = smoothstep(m.sprint);
    const [sx, sy, sz] = VIEWMODEL.sprint.offset;
    const [srx, sry, srz] = VIEWMODEL.sprint.rotation;
    const [hx, hy] = VIEWMODEL.hip;
    const low = VIEWMODEL.lowered;
    this.lowerBlend = moveTowards(this.lowerBlend, clamp(m.lowered, 0, 1), dt / low.blendSeconds);
    const lowered = smoothstep(this.lowerBlend);
    const [lx, ly, lz] = low.offset;
    const [lrx, lry, lrz] = low.rotation;
    this.root.position.set(
      lerp(hx, 0, m.ads) + Math.sin(phase) * bob - this.swayYaw * shift * steady + sx * sprint + lx * lowered,
      lerp(hy, this.adsHeight, m.ads) -
        Math.abs(Math.cos(phase)) * bob +
        this.swayPitch * shift * steady -
        this.landing +
        sy * sprint +
        ly * lowered -
        this.swapDrop * VIEWMODEL.swapDrop,
      lerp(this.hipDepth, this.adsDepth, m.ads) + this.kick * VIEWMODEL.kick.backPerDeg + sz * sprint + lz * lowered,
    );
    this.root.rotation.set(
      (this.swayPitch + this.kick * VIEWMODEL.kick.pitchPerDeg) * steady +
        srx * sprint +
        lrx * lowered -
        this.swapDrop * VIEWMODEL.swapTilt,
      this.swayYaw * steady + sry * sprint + lry * lowered,
      Math.sin(phase) * feel.bobRoll * bobScale + srz * sprint + lrz * lowered,
    );

    this.flashTime -= dt;
    if (this.flash) this.flash.visible = this.flashTime > 0;
  }
}
