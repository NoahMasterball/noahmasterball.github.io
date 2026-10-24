import { describe, expect, it } from 'vitest';
import { WORLD } from '../../src/config/sim.ts';
import { emptyCommand } from '../../src/sim/commands.ts';
import { createSim, step } from '../../src/sim/sim.ts';

describe('sim', () => {
  it('creates a world and runs 10 s of ticks without throwing', () => {
    const state = createSim(WORLD.defaultSeed);
    for (let i = 0; i < 600; i++) step(state, emptyCommand());
    expect(state.tick).toBe(600);
    expect(state.player.body.onGround).toBe(true);
  });

  it('is deterministic for the same seed and commands', () => {
    const a = createSim(1234);
    const b = createSim(1234);
    for (let i = 0; i < 300; i++) {
      const cmd = { ...emptyCommand(), moveX: i % 120 < 60 ? 1 : -1, jump: i % 50 === 0 };
      step(a, cmd);
      step(b, { ...cmd, controls: [] });
    }
    expect(a.player.body).toEqual(b.player.body);
    expect(a.zombies.length).toBe(b.zombies.length);
    expect(Buffer.from(a.world.fg).equals(Buffer.from(b.world.fg))).toBe(true);
  });
});
