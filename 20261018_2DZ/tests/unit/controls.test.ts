import { describe, expect, it } from 'vitest';
import { DAY_NIGHT, DT } from '../../src/config/sim.ts';
import { makeState } from './support/makeState.ts';
import { FLAT, run, settle } from './playerHelpers.ts';

describe('controls: QA messages', () => {
  it('qaTeleport moves the body and zeroes velocity and fall speed', () => {
    const s = makeState(FLAT);
    settle(s);
    s.player.body.vx = 5;
    s.player.body.vy = 12;
    s.player.body.fallSpeed = 30;
    const health = s.player.health;
    run(s, { controls: [{ type: 'qaTeleport', x: 12, y: 4.2 }] }, 1);
    const b = s.player.body;
    expect(b.x).toBeCloseTo(12, 5);
    expect(b.vx).toBe(0);
    expect(b.fallSpeed).toBeLessThan(1);
    run(s, {}, 60);
    expect(b.x).toBeCloseTo(12, 5);
    expect(s.player.health).toBe(health); // no fall damage from the old fall speed
  });

  it('qaSetTime sets the clock, wrapped into [0, 1); non-finite values are ignored', () => {
    const s = makeState(FLAT);
    const tickAdvance = DT / DAY_NIGHT.cycleSeconds;
    run(s, { controls: [{ type: 'qaSetTime', timeOfDay: 0.25 }] }, 1);
    // Time advances before controls apply (sim.ts order), so the set value is exact.
    expect(s.timeOfDay).toBe(0.25);
    run(s, { controls: [{ type: 'qaSetTime', timeOfDay: 1 }] }, 1);
    expect(s.timeOfDay).toBeGreaterThanOrEqual(0);
    expect(s.timeOfDay).toBeLessThan(1);
    run(s, { controls: [{ type: 'qaSetTime', timeOfDay: -0.25 }] }, 1);
    expect(s.timeOfDay).toBe(0.75);
    const before = s.timeOfDay;
    run(s, { controls: [{ type: 'qaSetTime', timeOfDay: Number.NaN }] }, 1);
    expect(s.timeOfDay).toBeCloseTo(before + tickAdvance, 9);
  });
});
