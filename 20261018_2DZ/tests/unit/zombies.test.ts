import { describe, expect, it } from 'vitest';
import { COMBAT, DT, PLAYER, TICK_RATE } from '../../src/config/sim.ts';
import { TILE_INDEX } from '../../src/data/content.ts';
import type { ZombieId } from '../../src/data/schema.ts';
import { TILES } from '../../src/data/tiles.ts';
import { ZOMBIES } from '../../src/data/zombies.ts';
import { emitNoise } from '../../src/sim/combat.ts';
import { setTile, tileAt } from '../../src/sim/grid.ts';
import type { SimState, Zombie } from '../../src/sim/state.ts';
import { createZombie, updateZombies } from '../../src/sim/zombies.ts';
import { makeState } from './support/makeState.ts';

const W = 40;
const air = '.'.repeat(W);
const floor = '#'.repeat(W);
/** Flat world: 6 rows of air over stone; ground row 6. */
const FLAT = [air, air, air, air, air, air, floor, floor];
const GROUND = 6;

function withColumn(rows: readonly string[], x: number, ch: string, fromRow: number, toRow: number): string[] {
  return rows.map((r, y) => (y >= fromRow && y <= toRow ? r.slice(0, x) + ch + r.slice(x + 1) : r));
}

function standingPlayer(rows: readonly string[], x: number, ground = GROUND): SimState {
  return makeState(rows, { player: { x, y: ground - PLAYER.height } });
}

function addZombie(state: SimState, kind: ZombieId, x: number, ground = GROUND): Zombie {
  const z = createZombie(state, kind, x, ground - ZOMBIES[kind].height, 'plains');
  z.body.onGround = true;
  state.zombies.push(z);
  return z;
}

/** Runs only the zombie system; `noise` is re-emitted at the player every tick when set. */
function run(state: SimState, seconds: number, noise = false): void {
  for (let i = 0; i < seconds * TICK_RATE; i++) {
    state.events.length = 0;
    const p = state.player.body;
    if (noise) emitNoise(state, p.x + p.w / 2, p.y + p.h / 2, COMBAT.gunshotNoise);
    state.player.invuln = Math.max(0, state.player.invuln - DT);
    updateZombies(state);
  }
}

describe('zombie AI', () => {
  it('sees the player and walks towards it', () => {
    const s = standingPlayer(FLAT, 2);
    const z = addZombie(s, 'walker', 15);
    run(s, 1);
    expect(z.targetX).not.toBeNull();
    expect(z.body.x).toBeLessThan(15 - ZOMBIES.walker.speed * 0.5);
  });

  it('does not see through stone', () => {
    const s = standingPlayer(withColumn(FLAT, 10, '#', 0, GROUND - 1), 2);
    const z = addZombie(s, 'walker', 15);
    run(s, 1);
    expect(z.targetX).toBeNull();
    expect(z.mode === 'idle' || z.mode === 'wander').toBe(true);
  });

  it('hears a gunshot behind a wall', () => {
    const s = standingPlayer(withColumn(FLAT, 10, '#', 0, GROUND - 1), 2);
    const z = addZombie(s, 'walker', 15);
    emitNoise(s, 3, 4, COMBAT.gunshotNoise);
    updateZombies(s);
    expect(z.mode).toBe('chase');
    expect(z.targetX).toBe(3);
  });

  it('attacks the player in reach and respects invulnerability', () => {
    const s = standingPlayer(FLAT, 2);
    const z = addZombie(s, 'walker', 2 + PLAYER.width + 0.2);
    updateZombies(s);
    expect(z.mode).toBe('attack');
    expect(s.player.health).toBe(PLAYER.maxHealth - ZOMBIES.walker.damage);
    expect(s.events.some((e) => e.type === 'hit' && e.target === 'player')).toBe(true);
    // Invulnerable: a ready attack does nothing.
    z.attackCooldown = 0;
    s.player.invuln = 1;
    const before = s.player.health;
    updateZombies(s);
    expect(s.player.health).toBe(before);
  });

  it('breaks a door in its way', () => {
    // Door column (3 tall) with stone above so it cannot be jumped.
    const rows = withColumn(withColumn(FLAT, 10, '#', 0, GROUND - 4), 10, 'D', GROUND - 3, GROUND - 1);
    const s = standingPlayer(rows, 2);
    const z = addZombie(s, 'walker', 13);
    expect(Number.isFinite(TILES.door.zombieHealth)).toBe(true);
    const seconds = (3 * TILES.door.zombieHealth) / ZOMBIES.walker.breakPower;
    run(s, seconds + 5, true);
    for (let y = GROUND - 3; y < GROUND; y++) expect(tileAt(s.world, 10, y)).toBe(TILE_INDEX.air);
    expect(z.body.x).toBeLessThan(10);
  });

  it('cannot break bedrock', () => {
    const rows = withColumn(FLAT, 10, 'B', 0, GROUND - 1);
    const s = standingPlayer(rows, 2);
    addZombie(s, 'brute', 13);
    run(s, 10, true);
    for (let y = 0; y < GROUND; y++) expect(tileAt(s.world, 10, y)).toBe(TILE_INDEX.bedrock);
  });

  it('runner never breaks blocks', () => {
    const rows = withColumn(withColumn(FLAT, 10, '#', 0, GROUND - 4), 10, 'D', GROUND - 3, GROUND - 1);
    const s = standingPlayer(rows, 2);
    addZombie(s, 'runner', 13);
    run(s, 20, true);
    for (let y = GROUND - 3; y < GROUND; y++) expect(tileAt(s.world, 10, y)).toBe(TILE_INDEX.door);
    expect(s.world.zombieDamage.size).toBe(0);
  });

  it('walker does not dig through terrain', () => {
    const rows = withColumn(FLAT, 10, '#', 0, GROUND - 1);
    const s = standingPlayer(rows, 2);
    addZombie(s, 'walker', 13);
    run(s, 20, true);
    for (let y = 0; y < GROUND; y++) expect(tileAt(s.world, 10, y)).toBe(TILE_INDEX.stone);
  });

  describe('break rule underground (TileDef.natural / world.placed)', () => {
    // Stone ceiling: every column's surface is row 0, so the corridor counts as underground.
    const TUNNEL_GROUND = 4;
    const tunnel = (wall: string): string[] =>
      withColumn([floor, air, air, air, floor, floor], 10, wall, 1, TUNNEL_GROUND - 1);
    const wallSeconds = (health: number): number => (3 * health) / ZOMBIES.walker.breakPower + 5;

    it('walker leaves a natural dirt wall alone', () => {
      const s = standingPlayer(tunnel('d'), 2, TUNNEL_GROUND);
      addZombie(s, 'walker', 13, TUNNEL_GROUND);
      run(s, wallSeconds(TILES.dirt.zombieHealth), true);
      for (let y = 1; y < TUNNEL_GROUND; y++) expect(tileAt(s.world, 10, y)).toBe(TILE_INDEX.dirt);
      expect(s.world.zombieDamage.size).toBe(0);
    });

    it('walker breaks a player-placed dirt wall', () => {
      const s = standingPlayer(tunnel('.'), 2, TUNNEL_GROUND);
      for (let y = 1; y < TUNNEL_GROUND; y++) setTile(s.world, 10, y, TILE_INDEX.dirt, true);
      const z = addZombie(s, 'walker', 13, TUNNEL_GROUND);
      run(s, wallSeconds(TILES.dirt.zombieHealth), true);
      for (let y = 1; y < TUNNEL_GROUND; y++) expect(tileAt(s.world, 10, y)).toBe(TILE_INDEX.air);
      expect(z.body.x).toBeLessThan(10);
    });

    it('walker breaks a generated plank wall', () => {
      expect(TILES.planks.natural).toBe(false);
      const s = standingPlayer(tunnel('p'), 2, TUNNEL_GROUND);
      addZombie(s, 'walker', 13, TUNNEL_GROUND);
      run(s, wallSeconds(TILES.planks.zombieHealth), true);
      for (let y = 1; y < TUNNEL_GROUND; y++) expect(tileAt(s.world, 10, y)).toBe(TILE_INDEX.air);
    });
  });

  it('jumps over a 2-tile wall', () => {
    const s = standingPlayer(withColumn(FLAT, 10, '#', GROUND - 2, GROUND - 1), 2);
    const z = addZombie(s, 'walker', 13);
    run(s, 6, true);
    expect(z.body.x).toBeLessThan(10);
    expect(s.world.zombieDamage.size).toBe(0);
  });

  it('digger digs down through dirt towards a target below', () => {
    const d = 'd'.repeat(W);
    // Zombie stands on 3 rows of dirt; the player is in a cavity underneath.
    const rows = [air, air, air, d, d, d, air, air, air, air, floor];
    const s = makeState(rows, { player: { x: 10, y: 10 - PLAYER.height } });
    const z = addZombie(s, 'digger', 10, 3);
    const y0 = z.body.y;
    run(s, 40, true);
    expect(z.body.y).toBeGreaterThan(y0 + 3);
    expect(tileAt(s.world, 10, 3)).toBe(TILE_INDEX.air);
  });

  it('wanders without a target and stays on the map', () => {
    const s = standingPlayer(withColumn(FLAT, 20, '#', 0, GROUND - 1), 2);
    const z = addZombie(s, 'walker', 30);
    run(s, 20);
    expect(z.targetX).toBeNull();
    expect(z.body.x).toBeGreaterThan(20);
    expect(z.body.x + z.body.w).toBeLessThanOrEqual(W);
  });

  it('separates stacked zombies', () => {
    const s = standingPlayer(withColumn(FLAT, 20, '#', 0, GROUND - 1), 2);
    const a = addZombie(s, 'walker', 30);
    const b = addZombie(s, 'walker', 30);
    a.mode = b.mode = 'idle';
    a.timer = b.timer = 100;
    run(s, 1);
    expect(Math.abs(a.body.x - b.body.x)).toBeGreaterThan(0.5);
  });
});
