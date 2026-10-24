import { describe, expect, it } from 'vitest';
import { isTimeUp, secondsToTicks, TICK_DT } from '../../src/config/sim.ts';
import type { ResourceDef } from '../../src/data/schema.ts';
import {
  canActivate,
  consume,
  createResourceState,
  readiness,
  resetForRound,
  tick,
} from '../../src/sim/abilities/resource.ts';

describe('isTimeUp (the one end-of-duration rule)', () => {
  // Durations in data and config, tick-aligned or not. Summing TICK_DT drifts: 150 × (1/60)
  // leaves 2.5 s a hair short, so `elapsed >= 2.5` held on tick 151.
  const DURATIONS = [0.005, 0.1, 0.15, 0.18, 0.28, 1, 2.5, 3, 8];

  it('ends a countdown of D s after exactly secondsToTicks(D) ticks of `remaining -= TICK_DT`', () => {
    for (const d of DURATIONS) {
      let remaining = d;
      let ticks = 0;
      while (!isTimeUp(remaining)) {
        remaining -= TICK_DT;
        ticks += 1;
      }
      expect(ticks, `${d} s`).toBe(secondsToTicks(d));
    }
  });

  it('ends elapsed time of D s after exactly secondsToTicks(D) ticks of `elapsed += TICK_DT`', () => {
    for (const d of DURATIONS) {
      let elapsed = 0;
      let ticks = 0;
      while (!isTimeUp(d - elapsed)) {
        elapsed += TICK_DT;
        ticks += 1;
      }
      expect(ticks, `${d} s`).toBe(secondsToTicks(d));
    }
  });

  it('makes a cooldown ticked at TICK_DT ready after exactly its ticks', () => {
    const def: ResourceDef = { kind: 'cooldown', cooldown: 2.5 };
    const s = createResourceState(def);
    consume(def, s);
    for (let i = 1; i < secondsToTicks(def.cooldown); i++) tick(def, s, TICK_DT);
    expect(canActivate(def, s)).toBe(false);
    tick(def, s, TICK_DT);
    expect([canActivate(def, s), s.timer, readiness(def, s)]).toEqual([true, 0, 1]);
  });
});

describe('cooldown resource', () => {
  const def: ResourceDef = { kind: 'cooldown', cooldown: 10 };

  it('is ready at spawn, then blocked for exactly the cooldown', () => {
    const s = createResourceState(def);
    expect(canActivate(def, s)).toBe(true);
    expect(consume(def, s)).toBe(true);
    expect(canActivate(def, s)).toBe(false);
    expect(consume(def, s)).toBe(false);
    tick(def, s, 9.9);
    expect(canActivate(def, s)).toBe(false);
    expect(readiness(def, s)).toBeCloseTo(0.99);
    tick(def, s, 0.1);
    expect(canActivate(def, s)).toBe(true);
    expect(readiness(def, s)).toBe(1);
  });
});

describe('charges resource', () => {
  const def: ResourceDef = { kind: 'charges', maxCharges: 2, rechargeTime: 5 };

  it('spends charges and recharges one at a time', () => {
    const s = createResourceState(def);
    expect(s.charges).toBe(2);
    consume(def, s);
    consume(def, s);
    expect(s.charges).toBe(0);
    expect(canActivate(def, s)).toBe(false);
    tick(def, s, 5);
    expect(s.charges).toBe(1);
    tick(def, s, 4.9);
    expect(s.charges).toBe(1);
    tick(def, s, 0.1);
    expect(s.charges).toBe(2);
    expect(s.timer).toBe(0);
  });

  it('does not restart the timer when spending while already recharging', () => {
    const s = createResourceState(def);
    consume(def, s); // 1 left, recharge started (5 s)
    tick(def, s, 3);
    consume(def, s); // 0 left, timer keeps running (2 s left)
    tick(def, s, 2);
    expect(s.charges).toBe(1);
  });

  it('carries leftover time over a long step and never exceeds max', () => {
    const s = createResourceState(def);
    consume(def, s);
    consume(def, s);
    tick(def, s, 12);
    expect(s.charges).toBe(2);
    expect(s.timer).toBe(0);
  });

  it('does not recharge while full', () => {
    const s = createResourceState(def);
    tick(def, s, 100);
    expect(s.charges).toBe(2);
  });
});

describe('uses-per-round resource', () => {
  const def: ResourceDef = { kind: 'uses', usesPerRound: 2 };

  it('only comes back at round start', () => {
    const s = createResourceState(def);
    expect(consume(def, s)).toBe(true);
    expect(consume(def, s)).toBe(true);
    expect(consume(def, s)).toBe(false);
    tick(def, s, 1000);
    expect(canActivate(def, s)).toBe(false);
    expect(readiness(def, s)).toBe(0);
    resetForRound(def, s);
    expect(s.usesLeft).toBe(2);
  });
});

describe('none resource (passives)', () => {
  it('is always available', () => {
    const def: ResourceDef = { kind: 'none' };
    const s = createResourceState(def);
    expect(consume(def, s)).toBe(true);
    expect(consume(def, s)).toBe(true);
    expect(readiness(def, s)).toBe(1);
  });
});
