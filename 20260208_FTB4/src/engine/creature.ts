import { MathUtils, Vector3 } from 'three';
import type { Character } from './character';

// NEW — ambient creature behaviour (deer herd): graze and wander inside a home
// circle on the flat meadow, flee when the player gets close. No collider —
// the herd's home area is open grass.

export interface WandererOptions {
  home: Vector3;
  radius: number;
  walkSpeed: number;
  fleeSpeed: number;
  /** Yaw damping toward the move direction (rad/s equivalent, like PLAYER.turnLerp). */
  turnLerp: number;
  /** Player distance that startles the creature / lets it calm down again. */
  fleeStart: number;
  fleeStop: number;
  /** Exact clip name for grazing (mixed with plain idle). */
  grazeClip: string;
  rng: () => number;
}

type State = 'graze' | 'walk' | 'flee';

export class Wanderer {
  private state: State = 'graze';
  private timer: number;
  private readonly target = new Vector3();

  constructor(
    readonly char: Character,
    private readonly opts: WandererOptions,
  ) {
    this.timer = 1 + opts.rng() * 5;
    this.setGrazeAnim();
  }

  private setGrazeAnim(): void {
    if (this.opts.rng() < 0.65) this.char.playClip(this.opts.grazeClip);
    else this.char.play('idle');
  }

  private pickTarget(): void {
    const { home, radius, rng } = this.opts;
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * radius;
    this.target.set(home.x + Math.cos(a) * r, 0, home.z + Math.sin(a) * r);
  }

  /** Turn toward the target and advance at `speed`; true when arrived. */
  private step(dt: number, speed: number): boolean {
    const pos = this.char.root.position;
    const dx = this.target.x - pos.x;
    const dz = this.target.z - pos.z;
    if (Math.hypot(dx, dz) < 0.35) return true;
    const heading = Math.atan2(dx, dz);
    let diff = heading - this.char.root.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.char.root.rotation.y += diff * Math.min(1, this.opts.turnLerp * dt);
    // Advance along the facing direction so turns read naturally.
    pos.x += Math.sin(this.char.root.rotation.y) * speed * dt;
    pos.z += Math.cos(this.char.root.rotation.y) * speed * dt;
    return false;
  }

  update(dt: number, playerPos: Vector3): void {
    const pos = this.char.root.position;
    const dPlayer = Math.hypot(pos.x - playerPos.x, pos.z - playerPos.z);

    if (this.state !== 'flee' && dPlayer < this.opts.fleeStart) {
      // Startled: run away from the player, biased back toward home ground.
      this.target
        .set(pos.x - playerPos.x, 0, pos.z - playerPos.z)
        .normalize()
        .multiplyScalar(this.opts.fleeStop)
        .add(pos);
      this.target.x = MathUtils.lerp(this.target.x, this.opts.home.x, 0.25);
      this.target.z = MathUtils.lerp(this.target.z, this.opts.home.z, 0.25);
      this.state = 'flee';
      this.char.play('run');
    }

    switch (this.state) {
      case 'graze':
        this.timer -= dt;
        if (this.timer <= 0) {
          this.pickTarget();
          this.state = 'walk';
          this.char.play('walk');
        }
        break;
      case 'walk':
        if (this.step(dt, this.opts.walkSpeed)) {
          this.state = 'graze';
          this.timer = 3 + this.opts.rng() * 6;
          this.setGrazeAnim();
        }
        break;
      case 'flee':
        if (this.step(dt, this.opts.fleeSpeed)) {
          if (dPlayer > this.opts.fleeStop) {
            this.state = 'graze';
            this.timer = 2 + this.opts.rng() * 3;
            this.setGrazeAnim();
          } else {
            // Still crowded — keep moving away.
            this.state = 'graze';
            this.timer = 0.1;
          }
        }
        break;
    }
    this.char.update(dt);
  }
}
