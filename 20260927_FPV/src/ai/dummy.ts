import { AI, TICK_DT } from '../config/sim.ts';
import type { DummyBehaviour } from '../data/schema.ts';
import { BUTTON, idleCommand, type Command } from '../sim/command.ts';
import { rightFromYaw } from '../sim/math.ts';
import { createRng, nextRandom, randomRange, type RngState } from '../sim/rng.ts';
import type { CharacterEntity } from '../sim/types.ts';

// NEW — range-dummy brain. Produces the same Command type as the keyboard (ADR-0003), so the
// dummies run through exactly the same movement and collision code as the player. Owns its
// own RNG stream so bot decisions never perturb the simulation's gameplay RNG.

export class DummyBrain {
  readonly entityId: number;
  private readonly behaviour: DummyBehaviour;
  private readonly rng: RngState;
  private direction = 1;
  private legRemaining = 0;
  private crouching = false;

  constructor(entityId: number, behaviour: DummyBehaviour, seed: number) {
    this.entityId = entityId;
    this.behaviour = behaviour;
    this.rng = createRng(seed);
  }

  command(e: CharacterEntity, tick: number): Command {
    const cmd = idleCommand(tick, e.spawnYaw, 0);
    if (this.behaviour.kind !== 'strafe' || !e.alive) return cmd;

    const right = rightFromYaw(e.spawnYaw);
    const offset = (e.pos.x - e.spawnPos.x) * right.x + (e.pos.z - e.spawnPos.z) * right.z;
    const outside = Math.abs(offset) > this.behaviour.width / 2 && Math.sign(offset) === this.direction;
    this.legRemaining -= TICK_DT;
    if (this.legRemaining <= 0 || outside) {
      this.direction = outside ? -Math.sign(offset) : -this.direction;
      this.legRemaining = randomRange(this.rng, AI.dummy.strafeSwitchMin, AI.dummy.strafeSwitchMax);
      this.crouching = nextRandom(this.rng) < AI.dummy.crouchChance;
    }
    cmd.moveX = this.direction;
    if (this.crouching) cmd.buttons |= BUTTON.crouch;
    return cmd;
  }
}
