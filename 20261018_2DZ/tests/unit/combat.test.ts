import { describe, expect, it } from 'vitest';
import { COMBAT, PLAYER } from '../../src/config/sim.ts';
import { ITEMS } from '../../src/data/items.ts';
import type { MeleeStats, RangedStats, ZombieId } from '../../src/data/schema.ts';
import { ZOMBIES } from '../../src/data/zombies.ts';
import { castRay, damagePlayer, damageZombie, fireRanged, meleeAttack } from '../../src/sim/combat.ts';
import type { SimState, Zombie } from '../../src/sim/state.ts';
import { createZombie } from '../../src/sim/zombies.ts';
import { makeState } from './support/makeState.ts';

const W = 40;
const air = '.'.repeat(W);
const FLAT = [air, air, air, air, air, air, '#'.repeat(W), '#'.repeat(W)];
const GROUND = 6;
const WALLED = FLAT.map((r, y) => (y < GROUND ? r.slice(0, 10) + '#' + r.slice(11) : r));

function setup(rows: readonly string[] = FLAT): SimState {
  return makeState(rows, { player: { x: 2, y: GROUND - PLAYER.height } });
}

function addZombie(state: SimState, kind: ZombieId, x: number): Zombie {
  const z = createZombie(state, kind, x, GROUND - ZOMBIES[kind].height, 'plains');
  state.zombies.push(z);
  return z;
}

function pistol(): RangedStats {
  const r = ITEMS.pistol.ranged;
  if (!r) throw new Error('pistol has no ranged stats');
  return { ...r, spreadDeg: 0 };
}

function bat(): MeleeStats {
  const m = ITEMS.baseball_bat.melee;
  if (!m) throw new Error('baseball_bat has no melee stats');
  return m;
}

describe('combat', () => {
  it('damagePlayer applies damage, invuln, knockback and skips while invulnerable', () => {
    const s = setup();
    damagePlayer(s, 10, 0);
    expect(s.player.health).toBe(PLAYER.maxHealth - 10);
    expect(s.player.invuln).toBe(PLAYER.hitInvuln);
    expect(s.player.body.vx).toBe(COMBAT.knockbackBase);
    damagePlayer(s, 10, 0);
    expect(s.player.health).toBe(PLAYER.maxHealth - 10);
    s.player.invuln = 0;
    s.player.dead = true;
    damagePlayer(s, 10, 0);
    expect(s.player.health).toBe(PLAYER.maxHealth - 10);
  });

  it('killing a zombie emits zombieDied, drops loot and removes it', () => {
    const s = setup();
    const z = addZombie(s, 'brute', 20); // zombie_brute never rolls empty
    damageZombie(s, z, 10, 1, 1);
    expect(z.health).toBe(ZOMBIES.brute.health - 10);
    expect(z.body.vx).toBeGreaterThan(0);
    expect(z.mode).toBe('chase');
    damageZombie(s, z, 1000, 1, 1);
    expect(s.events.some((e) => e.type === 'zombieDied' && e.id === z.id)).toBe(true);
    expect(s.zombies).not.toContain(z);
    expect(s.drops.length).toBeGreaterThan(0);
  });

  it('melee hits zombies in front only', () => {
    const s = setup();
    const front = addZombie(s, 'walker', 4);
    const behind = addZombie(s, 'walker', 0.2);
    const hit = meleeAttack(s, 3.5, GROUND - 1.5, 1, bat());
    expect(hit).toBe(true);
    expect(front.health).toBe(ZOMBIES.walker.health - bat().damage);
    expect(behind.health).toBe(ZOMBIES.walker.health);
    expect(meleeAttack(s, 3.5, GROUND - 1.5, 1, { ...bat(), range: 0.1 })).toBe(false);
  });

  it('a shot hits the first zombie and makes noise', () => {
    const s = setup();
    const near = addZombie(s, 'soldier', 15);
    const far = addZombie(s, 'soldier', 20);
    fireRanged(s, 3, GROUND - 1.5, 30, GROUND - 1.5, pistol());
    expect(near.health).toBe(ZOMBIES.soldier.health - pistol().damage);
    expect(far.health).toBe(ZOMBIES.soldier.health);
    const shot = s.events.find((e) => e.type === 'shot');
    expect(shot?.type === 'shot' && Math.abs(shot.x1 - 15)).toBeLessThan(0.01);
    expect(s.events.some((e) => e.type === 'noise' && e.loudness === COMBAT.gunshotNoise)).toBe(true);
  });

  it('a wall stops the shot', () => {
    const s = setup(WALLED);
    const z = addZombie(s, 'soldier', 15);
    fireRanged(s, 3, GROUND - 1.5, 30, GROUND - 1.5, pistol());
    expect(z.health).toBe(ZOMBIES.soldier.health);
    const shot = s.events.find((e) => e.type === 'shot');
    expect(shot?.type === 'shot' && shot.x1).toBeCloseTo(10, 5);
  });

  it('castRay respects the range limit', () => {
    const s = setup();
    const r = castRay(s.world, 3, 2, 1, 0, 5);
    expect(r.blocked).toBe(false);
    expect(r.dist).toBe(5);
    const down = castRay(s.world, 3, 2.5, 0, 1, 50);
    expect(down.blocked).toBe(true);
    expect(down.dist).toBeCloseTo(GROUND - 2.5, 5);
  });
});
