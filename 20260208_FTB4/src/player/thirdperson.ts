import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { CAMERA_RIG, PLAYER } from '../config';
import type { Character } from '../engine/character';
import type { WorldCollider } from '../engine/collision';
import { Input } from './input';

const _dir = new Vector3();
const _camOffset = new Vector3();
const _target = new Vector3();

/**
 * Third-person orbit camera + character locomotion:
 * pointer-lock mouselook with damping, wheel zoom, camera collision,
 * camera-aligned WASD movement with gravity, ground snap, and capsule
 * collide-and-slide against the world.
 */
export class ThirdPerson {
  readonly input: Input;
  private yaw: number;
  private pitch = -0.35;
  private distance: number = CAMERA_RIG.defaultDistance;
  private targetDistance: number = CAMERA_RIG.defaultDistance;
  private readonly velocity = new Vector3();
  private verticalVel = 0;
  private grounded = false;

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly character: Character,
    private readonly collider: WorldCollider,
    canvas: HTMLCanvasElement,
    readonly position: Vector3 = new Vector3(),
    /** Initial camera yaw; W then moves the character toward -forward of it. */
    initialYaw = Math.PI,
  ) {
    this.yaw = initialYaw;
    this.input = new Input(canvas);
    this.character.play('idle');
    this.character.root.rotation.y = Math.atan2(-Math.sin(initialYaw), -Math.cos(initialYaw));
  }

  update(dt: number): void {
    const { dx, dy, wheel } = this.input.consumeDeltas();

    // Orbit — damped toward mouse-driven targets.
    this.yaw -= dx * CAMERA_RIG.mouseSensitivity;
    this.pitch = MathUtils.clamp(
      this.pitch - dy * CAMERA_RIG.mouseSensitivity,
      CAMERA_RIG.minPitch,
      CAMERA_RIG.maxPitch,
    );
    this.targetDistance = MathUtils.clamp(
      this.targetDistance * (1 + wheel * 0.12),
      CAMERA_RIG.minDistance,
      CAMERA_RIG.maxDistance,
    );
    this.distance = MathUtils.damp(this.distance, this.targetDistance, CAMERA_RIG.zoomLerp, dt);

    // Movement — camera-yaw aligned.
    const f = this.input.forward;
    const s = this.input.strafe;
    const moving = f !== 0 || s !== 0;
    const speed = this.input.running ? PLAYER.runSpeed : PLAYER.walkSpeed;
    _dir.set(
      Math.sin(this.yaw) * -f + Math.cos(this.yaw) * s,
      0,
      Math.cos(this.yaw) * -f - Math.sin(this.yaw) * s,
    );
    if (moving) _dir.normalize().multiplyScalar(speed);
    else _dir.set(0, 0, 0);

    this.velocity.x = MathUtils.damp(this.velocity.x, _dir.x, PLAYER.moveLerp, dt);
    this.velocity.z = MathUtils.damp(this.velocity.z, _dir.z, PLAYER.moveLerp, dt);

    // Substep so one frame's displacement can never exceed half the capsule
    // radius — prevents popping through thin walls at low frame rates.
    const stepLen = Math.hypot(this.velocity.x, this.velocity.z) * dt;
    const steps = Math.max(1, Math.ceil(stepLen / (PLAYER.capsuleRadius * 0.5)));
    for (let i = 0; i < steps; i++) {
      this.position.x += (this.velocity.x * dt) / steps;
      this.position.z += (this.velocity.z * dt) / steps;
      this.collider.collideCapsule(this.position, PLAYER.capsuleRadius, PLAYER.capsuleHeight);
    }

    // Gravity + ground snap.
    this.verticalVel -= PLAYER.gravity * dt;
    this.position.y += this.verticalVel * dt;
    let ground = this.collider.groundHeight(
      this.position.x,
      this.position.y + PLAYER.capsuleHeight,
      this.position.z,
    );
    if (ground === null) {
      // Recovery: if the ray origin ever ends up below the terrain (e.g. after
      // an extreme stall), re-scan from high above so the character can never
      // tunnel out of the world.
      ground = this.collider.groundHeight(this.position.x, this.position.y + 150, this.position.z, 500);
      if (ground !== null && this.position.y < ground) {
        this.position.y = ground;
        this.verticalVel = 0;
      }
    }
    if (ground !== null && this.position.y <= ground + 0.02) {
      this.position.y = ground;
      this.verticalVel = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }

    // Character transform + facing.
    this.character.root.position.copy(this.position);
    if (moving) {
      const targetHeading = Math.atan2(this.velocity.x, this.velocity.z);
      const current = this.character.root.rotation.y;
      let diff = targetHeading - current;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.character.root.rotation.y = current + diff * Math.min(1, PLAYER.turnLerp * dt);
    }

    // Locomotion animation.
    const planarSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (planarSpeed > PLAYER.walkSpeed + 0.6) this.character.play('run');
    else if (planarSpeed > 0.25) this.character.play('walk');
    else this.character.play('idle');
    this.character.update(dt);

    // Camera placement with occlusion pull-in.
    _target.copy(this.position);
    _target.y += CAMERA_RIG.targetHeight;
    _camOffset.set(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      -Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    );
    let dist = this.distance;
    const hit = this.collider.rayDistance(_target, _camOffset, dist + CAMERA_RIG.collisionMargin);
    if (hit !== null) dist = Math.max(CAMERA_RIG.minDistance * 0.4, hit - CAMERA_RIG.collisionMargin);
    this.camera.position.copy(_target).addScaledVector(_camOffset, dist);
    this.camera.lookAt(_target);

    void this.grounded; // reserved for jump/step logic if added later
  }
}
