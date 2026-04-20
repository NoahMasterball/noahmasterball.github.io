import * as THREE from 'three';
import { PLAYER, WORLD, STATS } from '../config/constants.js';

// First-Person-Player. Owner von:
//   - position (THREE.Vector3)
//   - velocity (THREE.Vector3)
//   - yaw, pitch (Radians)
//   - stats { health, hunger, thirst, max* }
// Bindet sich an die übergebene camera (treibt deren transform).
//
// Batch 1: Kollision nur gegen flache Ground-Plane (y=0). Batch 2 wird `world.getGroundHeight()`
// und AABB-Checks gegen Buildings hinzufügen.

export class Player {
  constructor(camera) {
    this.camera = camera;
    this.position = new THREE.Vector3(0, WORLD.SPAWN_HEIGHT, 0);
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.grounded = true;

    this.stats = {
      health: STATS.MAX_HEALTH,
      hunger: STATS.MAX_HUNGER,
      thirst: STATS.MAX_THIRST,
      maxHealth: STATS.MAX_HEALTH,
      maxHunger: STATS.MAX_HUNGER,
      maxThirst: STATS.MAX_THIRST,
    };

    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
  }

  update(dt, input /*, world */) {
    if (input.locked) this._applyLook(input);
    this._applyMovement(dt, input);
    this._applyPhysics(dt);
    this._syncCamera();
  }

  // [Batch 4] Passiver Stat-Tick. Wird nur gerufen, wenn der Game-Loop den Tick
  // freigegeben hat (Pointer-Lock aktiv) — gleiche Pausenregel wie Clock/World.
  // Decay-Raten + Schwellen liegen in STATS (constants.js).
  tickStats(dt) {
    const s = this.stats;
    s.hunger = Math.max(0, s.hunger - STATS.HUNGER_DECAY * dt);
    s.thirst = Math.max(0, s.thirst - STATS.THIRST_DECAY * dt);

    if (s.hunger <= 0 || s.thirst <= 0) {
      s.health = Math.max(0, s.health - STATS.STARVE_DAMAGE * dt);
    } else if (s.hunger > STATS.REGEN_HUNGER_THRESHOLD && s.thirst > STATS.REGEN_THIRST_THRESHOLD) {
      s.health = Math.min(s.maxHealth, s.health + STATS.HEALTH_REGEN * dt);
    }

    // TODO [Batch 9]: Bei s.health <= 0 → Death-Screen / Game-Over-Hook auslösen.
  }

  _applyLook(input) {
    const { dx, dy } = input.consumeMouseDelta();
    this.yaw -= dx * PLAYER.LOOK_SENSITIVITY;
    this.pitch -= dy * PLAYER.LOOK_SENSITIVITY;
    if (this.pitch > PLAYER.MAX_PITCH) this.pitch = PLAYER.MAX_PITCH;
    if (this.pitch < -PLAYER.MAX_PITCH) this.pitch = -PLAYER.MAX_PITCH;
  }

  _applyMovement(dt, input) {
    // Input-Vektor in Spielerkoordinaten
    let ix = 0, iz = 0;
    if (input.isDown('KeyW')) iz -= 1;
    if (input.isDown('KeyS')) iz += 1;
    if (input.isDown('KeyA')) ix -= 1;
    if (input.isDown('KeyD')) ix += 1;

    const len = Math.hypot(ix, iz);
    if (len > 0) { ix /= len; iz /= len; }

    // Sprint (Shift) — volle Implementation mit Stamina kommt mit Batch 4.
    const sprinting = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const speed = PLAYER.MOVE_SPEED * (sprinting ? PLAYER.SPRINT_MULT : 1);

    // Bewegung in Weltkoordinaten (nur yaw, kein pitch)
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    const worldX = ix * cosY + iz * sinY;
    const worldZ = -ix * sinY + iz * cosY;

    const targetVX = worldX * speed;
    const targetVZ = worldZ * speed;

    const control = this.grounded ? 1.0 : PLAYER.AIR_CONTROL;
    this.velocity.x += (targetVX - this.velocity.x) * control;
    this.velocity.z += (targetVZ - this.velocity.z) * control;

    if (this.grounded && input.isDown('Space')) {
      this.velocity.y = PLAYER.JUMP_VELOCITY;
      this.grounded = false;
    }
  }

  _applyPhysics(dt) {
    this.velocity.y -= WORLD.GRAVITY * dt;
    this.position.addScaledVector(this.velocity, dt);

    // Ground-Collision gegen flache Plane bei y=0. Player-Origin = Augen.
    if (this.position.y <= PLAYER.EYE_HEIGHT) {
      this.position.y = PLAYER.EYE_HEIGHT;
      if (this.velocity.y < 0) this.velocity.y = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
    }
  }

  _syncCamera() {
    this._euler.set(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(this._euler);
    this.camera.position.copy(this.position);
  }
}
