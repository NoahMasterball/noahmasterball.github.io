// NEW — fixed-step accumulator (pattern of 20260927_FPV/src/client/loop.ts): runs 0…N sim ticks
// per rendered frame and returns the interpolation factor between the last two ticks.
import { LOOP } from '../config/client.ts';
import { DT } from '../config/sim.ts';

export class FixedStepper {
  private accumulator = 0;

  /** Advances by a frame's duration; calls `tick` 0..maxTicksPerFrame times; returns alpha in [0, 1). */
  advance(frameSeconds: number, tick: () => void): number {
    const dt = Math.min(Math.max(0, frameSeconds), LOOP.maxFrameSeconds);
    this.accumulator += dt;
    let ticks = 0;
    while (this.accumulator >= DT && ticks < LOOP.maxTicksPerFrame) {
      tick();
      this.accumulator -= DT;
      ticks += 1;
    }
    // Backlog beyond the cap is dropped: the game slows down instead of spiralling.
    if (this.accumulator >= DT) this.accumulator %= DT;
    return this.accumulator / DT;
  }

  reset(): void {
    this.accumulator = 0;
  }
}
