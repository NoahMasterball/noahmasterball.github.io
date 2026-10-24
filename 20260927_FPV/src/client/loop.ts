import { LOOP } from '../config/client.ts';
import { TICK_DT } from '../config/sim.ts';

// NEW — fixed-step accumulator (ADR-0003): runs 0…N simulation ticks per rendered frame and
// returns the interpolation factor for rendering between the last two ticks.

export class FixedStepper {
  private accumulator = 0;
  private ticksInWindow = 0;
  private windowTime = 0;
  /** Measured simulation ticks per real second (debug overlay). */
  measuredTickRate = 0;

  /** Advances by a frame's duration; returns alpha in [0, 1). */
  advance(frameSeconds: number, tick: () => void): number {
    const dt = Math.min(frameSeconds, LOOP.maxFrameSeconds);
    this.accumulator += dt;
    let ticks = 0;
    while (this.accumulator >= TICK_DT && ticks < LOOP.maxTicksPerFrame) {
      tick();
      this.accumulator -= TICK_DT;
      ticks += 1;
    }
    // Backlog beyond the cap is dropped: the game slows down instead of spiralling.
    if (this.accumulator >= TICK_DT) this.accumulator %= TICK_DT;

    this.ticksInWindow += ticks;
    this.windowTime += dt;
    if (this.windowTime >= 1) {
      this.measuredTickRate = this.ticksInWindow / this.windowTime;
      this.ticksInWindow = 0;
      this.windowTime = 0;
    }
    return this.accumulator / TICK_DT;
  }
}
