import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ABILITY_RULES, CHARACTER, RANGE_MODE, TICK_DT } from '../../src/config/sim.ts';
import { getAbility } from '../../src/data/content.ts';
import { RANGE_LEVEL } from '../../src/data/levels/range.ts';
import { OPERATORS } from '../../src/data/operators.ts';
import { THROWN_ACTIVATION } from '../../src/sim/abilities/activation/thrown.ts';
import { applyEffects } from '../../src/sim/abilities/effects.ts';
import type * as EffectsModule from '../../src/sim/abilities/effects.ts';
import {
  ballisticPitch,
  launchVelocity,
  projectileGravity,
  projectileSystem,
  spawnProjectile,
} from '../../src/sim/abilities/projectiles.ts';
import type { EffectContext } from '../../src/sim/abilities/targeting.ts';
import { BUTTON } from '../../src/sim/command.ts';
import { zoneWorldCenter } from '../../src/sim/hitbox.ts';
import { anglesTo, DEG2RAD, forwardFromAngles, vec3, type Vec3 } from '../../src/sim/math.ts';
import type { Sim } from '../../src/sim/sim.ts';
import { hasActivation, type AbilityOf } from '../../src/sim/systems/abilities.ts';
import { aimOf } from '../../src/sim/systems/weapons.ts';
import type { CharacterEntity, ProjectileEntity, SimEvent } from '../../src/sim/types.ts';
import { abilityWorld, type AbilityWorld } from './support/abilityWorld.ts';
import { ofType, run, SECONDS, world, type Input } from './support/world.ts';

// ADR-0012 batch P: thrown abilities — the press (spend, crosshair aim), ballistic flight, sweeps
// against level geometry and hitboxes, impact bursts, fused landing and resting, clean-up after
// the maximum flight time, and the aiming helper. The effect handlers are batch E's: these tests
// check what the registry is handed (origin, via, user, struck), not what the handlers do with it.

// The registry keeps working (the real applyEffects runs); the spy records every dispatch.
vi.mock('../../src/sim/abilities/effects.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof EffectsModule>();
  return { ...actual, applyEffects: vi.fn(actual.applyEffects) };
});

beforeEach(() => {
  vi.mocked(applyEffects).mockClear();
});

/** Every effect dispatch of a projectile burst since the test started. */
const projectileDispatches = (): EffectContext[] =>
  vi
    .mocked(applyEffects)
    .mock.calls.map(([ctx]) => ctx)
    .filter((ctx) => ctx.via.kind === 'projectile');

function thrown(id: string): AbilityOf<'thrown'> {
  const a = getAbility(id);
  if (!hasActivation(a, 'thrown')) throw new Error(`${id} must be thrown`);
  return a;
}

/** Slag Lance: bursts on impact. */
const LANCE = thrown('kiln_lance');
/** Mend Dart: bursts on impact, half gravity. */
const DART = thrown('salve_mend');
/** Firebreak: fused (lands, rests, bursts at the fuse end). */
const FIREBREAK = thrown('gorse_firebreak');

/** The operator whose first ability is `ability` (thrown with ability1). */
function operatorWith(ability: AbilityOf<'thrown'>): string {
  const op = OPERATORS.find((o) => o.abilities[0] === ability.id);
  if (!op) throw new Error(`No operator has ${ability.id} in slot 0`);
  return op.id;
}

/** Position on the closed-form arc `t` seconds after a launch from `origin` with `v0`. */
const arcAt = (origin: Vec3, v0: Vec3, gravity: number, t: number): Vec3 => ({
  x: origin.x + v0.x * t,
  y: origin.y + v0.y * t - 0.5 * gravity * t * t,
  z: origin.z + v0.z * t,
});

/** Rapier works in single precision: positions from physics hits agree to about 1e-6 m. */
const PHYSICS_DIGITS = 5;

function expectVecClose(actual: Vec3, expected: Vec3, digits = 6): void {
  expect(actual.x).toBeCloseTo(expected.x, digits);
  expect(actual.y).toBeCloseTo(expected.y, digits);
  expect(actual.z).toBeCloseTo(expected.z, digits);
}

/** One tick that presses ability1 with `look`; the key is released on the next run. */
const press = (sim: Sim, e: CharacterEntity, look: Input = {}): SimEvent[] => run(sim, e, 1, { ...look, buttons: BUTTON.ability1 });

function only(sim: Sim): ProjectileEntity {
  expect(sim.state.projectiles).toHaveLength(1);
  const p = sim.state.projectiles[0];
  if (!p) throw new Error('no projectile');
  return p;
}

/** The range's west perimeter wall: its face (range.ts) and the look towards it. */
const WEST_WALL_X = -40;
const WEST = Math.PI / 2;
/** Open floor behind the firing line (floor top y = 0), looking downrange (−Z). */
const OPEN = vec3(0, 0, 20);
const FLOOR_Y = 0;

/** A thrower hugging the west wall, looking at it. */
async function atWall(ability: AbilityOf<'thrown'>): Promise<{ sim: Sim; player: CharacterEntity }> {
  const w = await world(operatorWith(ability), vec3(-39, 0, 25), WEST);
  run(w.sim, w.player, SECONDS(0.6), { moveZ: 1 });
  run(w.sim, w.player, SECONDS(0.2));
  return w;
}

describe('thrown activation (press throws at once)', () => {
  it('spends through spendActivation and launches from the eye along the crosshair (look + recoil)', async () => {
    expect(THROWN_ACTIVATION.implemented).toBe(true);
    const { sim, player } = await world(operatorWith(LANCE), OPEN, 0);
    run(sim, player, 3, { buttons: BUTTON.fire });
    const recoil = { yaw: player.weapon.recoilYaw, pitch: player.weapon.recoilPitch };
    expect(recoil.pitch).not.toBe(0);
    const eye = aimOf(player).origin;
    const charges = player.abilities[0]?.resource.charges ?? 0;
    const feet = { ...player.pos };
    const look = { yaw: 0.2, pitch: 0.1 };

    const events = press(sim, player, look);

    const [ability] = ofType(events, 'ability');
    expect(ability).toMatchObject({ entityId: player.id, abilityId: LANCE.id, slot: 0, pos: feet });
    expect(player.abilities[0]?.resource.charges).toBe(charges - 1);
    expect(player.abilities[0]?.active).toBeNull();
    const p = only(sim);
    expect(p).toMatchObject({ kind: 'projectile', abilityId: LANCE.id, ownerId: player.id, team: player.team, fuse: null, resting: false });
    // One tick of flight from the eye along look + recoil.
    const v0 = launchVelocity(LANCE, forwardFromAngles(look.yaw + recoil.yaw, look.pitch + recoil.pitch));
    const g = projectileGravity(LANCE);
    expectVecClose(p.prevPos, eye);
    expectVecClose(p.pos, arcAt(eye, v0, g, TICK_DT));
    expectVecClose(p.vel, { ...v0, y: v0.y - g * TICK_DT });
    expect(p.age).toBeCloseTo(TICK_DT, 9);

    // The Sim stores prevPos before the next flight step (interpolation).
    const before = { ...p.pos };
    run(sim, player, 1);
    expectVecClose(p.prevPos, before, 12);
  });

  it('refuses without a resource (notReady): nothing launched, nothing spent', async () => {
    const { sim, player } = await world(operatorWith(FIREBREAK), OPEN, 0);
    press(sim, player, { pitch: 0.3 });
    run(sim, player, 1);
    const cooldown = player.abilities[0]?.resource.timer ?? 0;
    const events = press(sim, player, { pitch: 0.3 });
    // The cooldown keeps running (not restarted by the refused press).
    expect(player.abilities[0]?.resource.timer).toBeLessThan(cooldown);
    expect(ofType(events, 'abilityFailed')).toMatchObject([{ entityId: player.id, abilityId: FIREBREAK.id, reason: 'notReady' }]);
    expect(ofType(events, 'ability')).toEqual([]);
    expect(sim.state.projectiles).toHaveLength(1);
  });
});

describe('projectile flight (no geometry)', () => {
  /** A world without level geometry; the owner stands far from the throws. */
  async function openSky(): Promise<{ w: AbilityWorld; owner: CharacterEntity }> {
    const w = await abilityWorld({ ...RANGE_LEVEL, boxes: [] });
    const owner = w.add('basalt', RANGE_MODE.playerTeam, vec3(200, 0, 200));
    w.stepPhysics();
    return { w, owner };
  }
  const ORIGIN = vec3(0, 20, 0);
  const AIM = { origin: ORIGIN, yaw: 0.3, pitch: 0.4 };

  it.each([LANCE, DART, FIREBREAK])('$id follows the closed-form arc (gravity × gravityScale)', async (ability) => {
    const { w, owner } = await openSky();
    spawnProjectile(w.ctx, owner, ability, AIM);
    const p = w.ctx.state.projectiles[0];
    if (!p) throw new Error('no projectile');
    const v0 = launchVelocity(ability, forwardFromAngles(AIM.yaw, AIM.pitch));
    const steps = SECONDS(0.9); // shorter than Firebreak's fuse
    for (let k = 1; k <= steps; k++) {
      projectileSystem(w.ctx, TICK_DT);
      expectVecClose(p.pos, arcAt(ORIGIN, v0, projectileGravity(ability), k * TICK_DT), 9);
    }
    expect(w.ctx.state.projectiles).toEqual([p]);
  });

  it('a fuse running out mid-air bursts at the arc point, credited to the owner', async () => {
    const { w, owner } = await openSky();
    spawnProjectile(w.ctx, owner, FIREBREAK, AIM);
    const id = w.ctx.state.projectiles[0]?.id;
    let steps = 0;
    while (w.ctx.state.projectiles.length > 0 && steps < SECONDS(ABILITY_RULES.thrown.maxFlightSeconds)) {
      projectileSystem(w.ctx, TICK_DT);
      steps++;
    }
    // The first step is the throw tick's (its fuse runs from the next): secondsToTicks(fuse) after it.
    expect(steps - 1).toBe(SECONDS(FIREBREAK.activation.fuse ?? 0));
    const v0 = launchVelocity(FIREBREAK, forwardFromAngles(AIM.yaw, AIM.pitch));
    const [burst] = ofType(w.drain(), 'burst');
    expect(burst).toMatchObject({ source: 'projectile', sourceId: id, abilityId: FIREBREAK.id, ownerId: owner.id });
    expectVecClose(burst?.pos ?? vec3(), arcAt(ORIGIN, v0, projectileGravity(FIREBREAK), steps * TICK_DT), 9);
    const [dispatch] = projectileDispatches();
    expect(dispatch).toMatchObject({ ability: FIREBREAK, user: owner, via: { kind: 'projectile', id }, struck: null, radiusScale: 1, amountScale: 1, sustained: false });
    expect(dispatch?.origin).toEqual(burst?.pos);
  });

  it('an impact projectile that hits nothing is removed without effect after maxFlightSeconds', async () => {
    const { w, owner } = await openSky();
    spawnProjectile(w.ctx, owner, LANCE, AIM);
    const max = SECONDS(ABILITY_RULES.thrown.maxFlightSeconds);
    for (let k = 1; k < max; k++) projectileSystem(w.ctx, TICK_DT);
    expect(w.ctx.state.projectiles).toHaveLength(1);
    projectileSystem(w.ctx, TICK_DT);
    projectileSystem(w.ctx, TICK_DT);
    expect(w.ctx.state.projectiles).toEqual([]);
    expect(ofType(w.drain(), 'burst')).toEqual([]);
    expect(projectileDispatches()).toEqual([]);
  });
});

describe('impacts and landing (range)', () => {
  it.each([LANCE, DART])('$id against a wall at close range bursts surfaceOffsetM in front of it', async (ability) => {
    const { sim, player } = await atWall(ability);
    // Hugging the wall: the eye is only the capsule radius (plus the controller's skin) away.
    expect(player.pos.x).toBeLessThan(WEST_WALL_X + CHARACTER.radius + 0.05);
    const launch = press(sim, player, { yaw: WEST, pitch: 0 });
    const events = [...launch, ...run(sim, player, SECONDS(0.2))];

    const bursts = ofType(events, 'burst');
    expect(bursts).toHaveLength(1);
    const pos = bursts[0]?.pos ?? vec3();
    expect(pos.x).toBeCloseTo(WEST_WALL_X + ABILITY_RULES.thrown.surfaceOffsetM, PHYSICS_DIGITS);
    expect(pos.y).toBeGreaterThan(player.pos.y + 1);
    expect(sim.state.projectiles).toEqual([]);
    const [dispatch] = projectileDispatches();
    expect(dispatch).toMatchObject({ ability, user: player, via: { kind: 'projectile', id: bursts[0]?.sourceId }, struck: null });
    expect(dispatch?.origin).toEqual(pos);
  });

  it('a fused projectile thrown at a wall drops its horizontal speed, falls down the wall and rests in front of it', async () => {
    const { sim, player } = await atWall(FIREBREAK);
    const launch = press(sim, player, { yaw: WEST, pitch: 0 });
    const flight = run(sim, player, SECONDS(0.6));
    const p = only(sim);
    expect(ofType([...launch, ...flight], 'burst')).toEqual([]);
    expect(p.resting).toBe(true);
    expect(p.vel).toEqual({ x: 0, y: 0, z: 0 });
    expect(p.pos.x).toBeCloseTo(WEST_WALL_X + ABILITY_RULES.thrown.surfaceOffsetM, PHYSICS_DIGITS);
    expect(p.pos.y).toBeCloseTo(FLOOR_Y + ABILITY_RULES.thrown.surfaceOffsetM, PHYSICS_DIGITS);
  });

  it('a fused projectile lands on the floor, rests (never bursts on contact) and bursts in place at the fuse end', async () => {
    const { sim, player } = await world(operatorWith(FIREBREAK), OPEN, 0);
    const launch = press(sim, player, { yaw: 0, pitch: -0.5 });
    const launchTick = ofType(launch, 'ability')[0]?.tick ?? 0;
    const landed = run(sim, player, SECONDS(0.5));
    const p = only(sim);
    expect(ofType([...launch, ...landed], 'burst')).toEqual([]);
    expect(p.resting).toBe(true);
    expect(p.pos.y).toBeCloseTo(FLOOR_Y + ABILITY_RULES.thrown.surfaceOffsetM, PHYSICS_DIGITS);
    expect(p.pos.z).toBeLessThan(OPEN.z - 1);
    const rest = { ...p.pos };

    const later = run(sim, player, SECONDS(1));
    const bursts = ofType(later, 'burst');
    expect(bursts).toHaveLength(1);
    // Exactly the fuse after the throw tick, as a gadget timer after its placement tick.
    expect((bursts[0]?.tick ?? 0) - launchTick).toBe(SECONDS(FIREBREAK.activation.fuse ?? 0));
    expect(bursts[0]?.pos).toEqual(rest);
    expect(sim.state.projectiles).toEqual([]);
    const [dispatch] = projectileDispatches();
    expect(dispatch).toMatchObject({ user: player, via: { kind: 'projectile', id: p.id }, struck: null });
    expect(dispatch?.origin).toEqual(rest);
  });

  it.each([
    { ability: DART, team: RANGE_MODE.playerTeam },
    { ability: LANCE, team: RANGE_MODE.dummyTeam },
  ])('$ability.id on a character: bursts at its hitbox with struck = that character', async ({ ability, team }) => {
    const { sim, player } = await world(operatorWith(ability), OPEN, 0);
    const target = sim.spawnCharacter({ operatorId: 'basalt', team, controller: 'bot', position: vec3(0, 0, OPEN.z - 6), yaw: Math.PI });
    run(sim, player, 5);
    const eye = aimOf(player).origin;
    const torso = zoneWorldCenter(target, 'torso');
    const pitch = ballisticPitch(ability.activation.speed, projectileGravity(ability), Math.hypot(torso.x - eye.x, torso.z - eye.z), torso.y - eye.y);
    if (pitch === null) throw new Error('torso out of reach');

    const events = [...press(sim, player, { yaw: anglesTo(eye, torso).yaw, pitch }), ...run(sim, player, SECONDS(0.5))];

    const bursts = ofType(events, 'burst');
    expect(bursts).toHaveLength(1);
    const pos = bursts[0]?.pos ?? vec3();
    // In front of the target's body (between it and the thrower), at torso height.
    expect(pos.z).toBeGreaterThan(target.pos.z);
    expect(pos.z).toBeLessThan(target.pos.z + 1);
    expect(Math.abs(pos.y - torso.y)).toBeLessThan(0.5);
    const [dispatch] = projectileDispatches();
    expect(dispatch).toMatchObject({ user: player, struck: target.id });
    expect(dispatch?.origin).toEqual(pos);
  });

  it('never hits its thrower: a throw straight down passes the own body on the launch tick and bursts on the floor', async () => {
    const { sim, player } = await world(operatorWith(DART), OPEN, 0);
    const events = [...press(sim, player, { pitch: -CHARACTER.maxPitchDeg * DEG2RAD }), ...run(sim, player, SECONDS(0.3))];
    const bursts = ofType(events, 'burst');
    expect(bursts).toHaveLength(1);
    const pos = bursts[0]?.pos ?? vec3();
    expect(pos.y).toBeCloseTo(FLOOR_Y + ABILITY_RULES.thrown.surfaceOffsetM, PHYSICS_DIGITS);
    expect(Math.hypot(pos.x - player.pos.x, pos.z - player.pos.z)).toBeLessThan(0.1);
    expect(projectileDispatches().map((d) => d.struck)).toEqual([null]);
  });

  it('a throw aimed with ballisticPitch lands on its point', async () => {
    const { sim, player } = await world(operatorWith(FIREBREAK), OPEN, 0);
    // A point on the floor surface; the projectile then rests surfaceOffsetM above it.
    const target = vec3(1, FLOOR_Y, OPEN.z - 8);
    const eye = aimOf(player).origin;
    const pitch = ballisticPitch(
      FIREBREAK.activation.speed,
      projectileGravity(FIREBREAK),
      Math.hypot(target.x - eye.x, target.z - eye.z),
      target.y - eye.y,
    );
    if (pitch === null) throw new Error('target out of reach');
    press(sim, player, { yaw: anglesTo(eye, target).yaw, pitch });
    run(sim, player, SECONDS(0.8));
    const p = only(sim);
    expect(p.resting).toBe(true);
    expect(Math.hypot(p.pos.x - target.x, p.pos.z - target.z)).toBeLessThan(0.05);
  });

  it('the same inputs give the same trajectory and bursts (deterministic)', async () => {
    const replay = async (): Promise<{ frames: ProjectileEntity[][]; bursts: SimEvent[] }> => {
      const { sim, player } = await world(operatorWith(FIREBREAK), OPEN, 0);
      const frames: ProjectileEntity[][] = [];
      const events = press(sim, player, { yaw: 0.4, pitch: 0.35 });
      for (let k = 0; k < SECONDS(1.5); k++) {
        events.push(...run(sim, player, 1));
        frames.push(structuredClone(sim.state.projectiles));
      }
      return { frames, bursts: ofType(events, 'burst') };
    };
    const a = await replay();
    const b = await replay();
    expect(a.bursts).toHaveLength(1);
    expect(b).toEqual(a);
  });
});

describe('ballisticPitch (pure)', () => {
  const G = 20;
  /** Height of the closed-form arc `x` m out, launched at `speed` and `pitch`. */
  const heightAt = (speed: number, pitch: number, x: number): number => {
    const t = x / (speed * Math.cos(pitch));
    return speed * Math.sin(pitch) * t - 0.5 * G * t * t;
  };

  it.each([
    { speed: 18, x: 10, dy: -1.6 },
    { speed: 22, x: 15, dy: 2 },
    { speed: 30, x: 6, dy: 0 },
  ])('hits its point on the low arc (speed $speed, $x m out, $dy m up)', ({ speed, x, dy }) => {
    const pitch = ballisticPitch(speed, G, x, dy);
    if (pitch === null) throw new Error('unexpectedly out of reach');
    expect(heightAt(speed, pitch, x)).toBeCloseTo(dy, 9);
    if (dy <= 0) expect(pitch).toBeLessThan(Math.PI / 4);
  });

  it('is null out of reach, straight without gravity and vertical right above or below', () => {
    // Flat reach is v²/g = 5 m.
    expect(ballisticPitch(10, G, 6, 0)).toBeNull();
    expect(ballisticPitch(10, G, 4.9, 0)).not.toBeNull();
    expect(ballisticPitch(10, 0, 4, 3)).toBeCloseTo(Math.atan2(3, 4), 12);
    expect(ballisticPitch(18, G, 0, 3)).toBeCloseTo(Math.PI / 2, 12);
    expect(ballisticPitch(18, G, 0, 10)).toBeNull();
    expect(ballisticPitch(18, G, 0, -2)).toBeCloseTo(-Math.PI / 2, 12);
  });
});
