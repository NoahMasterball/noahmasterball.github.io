import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ABILITY_RULES, CHARACTER, GUNPLAY, secondsToTicks, TICK_DT } from '../../src/config/sim.ts';
import { getAbility } from '../../src/data/content.ts';
import { SALTWORKS_LEVEL } from '../../src/data/levels/saltworks.ts';
import type * as Effects from '../../src/sim/abilities/effects.ts';
import { applyEffects, type EffectContext } from '../../src/sim/abilities/effects.ts';
import { spawnGadget } from '../../src/sim/abilities/gadgets.ts';
import { placementPose } from '../../src/sim/abilities/placement.ts';
import { gadgetSystem } from '../../src/sim/abilities/triggers.ts';
import { BUTTON } from '../../src/sim/command.ts';
import { anglesTo, forwardFromAngles, vec3, type Vec3 } from '../../src/sim/math.ts';
import { roundSpawnOptions, type RosterEntry } from '../../src/sim/modes/format.ts';
import { Sim } from '../../src/sim/sim.ts';
import { hasActivation, type AbilityOf } from '../../src/sim/systems/abilities.ts';
import { aimOf } from '../../src/sim/systems/weapons.ts';
import type { AbilityState, CharacterEntity, GadgetEntity, SimEvent } from '../../src/sim/types.ts';
import { abilityWorld, type AbilityWorld } from './support/abilityWorld.ts';
import { commandFor, EAST, ofType, run, SECONDS, world, type Input } from './support/world.ts';

// ADR-0012 batch G: the placeable activation (open, confirm, cancel, refuse), the placement rule
// (placementPose over SimQuery) and gadget triggers (none, aura, proximity, timer) on the real Sim
// and physics in Node. The effect handlers are batch E's: trigger tests watch the registry path
// (applyEffects, wrapped in a spy below) for the moment, origin and source of every application,
// not the handlers' results.

vi.mock('../../src/sim/abilities/effects.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof Effects>();
  return { ...actual, applyEffects: vi.fn(actual.applyEffects) };
});

const applied = vi.mocked(applyEffects);
// A block body: a function returned from beforeEach would run as its teardown.
beforeEach(() => {
  applied.mockClear();
});

/** Effect applications by gadgets since the last clear. */
const gadgetApplications = (): EffectContext[] => applied.mock.calls.map(([c]) => c).filter((c) => c.via.kind === 'gadget');

function placeable(id: string): AbilityOf<'placeable'> {
  const a = getAbility(id);
  if (!hasActivation(a, 'placeable')) throw new Error(`${id} must be placeable`);
  return a;
}

/** Breakwater: a waist-high barrier, maxActive 1, two uses. */
const KEEL = placeable('keel_breakwater');
/** Scaffold Screen: a full-height barrier (Bracket carries an auto rifle). */
const SCREEN = placeable('bracket_screen');
/** Bore Charge: a timer device on any surface. */
const BORE = placeable('auger_bore');
/** Burr Mines: proximity devices on floors. */
const BURRS = placeable('thistle_burrs');
/** Tripline Nodes: aura devices on any surface. */
const NODES = placeable('lattice_nodes');

const UP = vec3(0, 1, 0);
const WEST = Math.PI / 2; // yaw looking down −X
const ARM_TICKS = secondsToTicks(ABILITY_RULES.gadget.armSeconds);
const DEVICE_R = ABILITY_RULES.gadget.deviceRadiusM;

/** Burr Mines' trigger radius (data). */
function burrRadius(): number {
  const t = BURRS.activation.trigger;
  if (t.kind !== 'proximity') throw new Error('Burr Mines must have a proximity trigger');
  return t.radius;
}

/** Bore Charge's delay (data). */
function boreDelay(): number {
  const t = BORE.activation.trigger;
  if (t.kind !== 'timer') throw new Error('Bore Charge must have a timer trigger');
  return t.delay;
}

function first<T>(items: readonly T[]): T {
  const [item] = items;
  if (item === undefined) throw new Error('expected at least one item');
  return item;
}

function expectNear(actual: Vec3, expected: Vec3, digits = 4): void {
  expect(actual.x).toBeCloseTo(expected.x, digits);
  expect(actual.y).toBeCloseTo(expected.y, digits);
  expect(actual.z).toBeCloseTo(expected.z, digits);
}

/** The look that puts `e`'s crosshair on `point`. */
const lookAt = (e: Readonly<CharacterEntity>, point: Vec3): { yaw: number; pitch: number } => anglesTo(aimOf(e).origin, point);

function slotOf(e: CharacterEntity, index = 0): AbilityState {
  const slot = e.abilities[index];
  if (!slot) throw new Error(`expected ability slot ${index}`);
  return slot;
}

/** Steps `ticks` ticks with every listed character's input held (everyone else idle). */
function runAll(sim: Sim, inputs: ReadonlyMap<CharacterEntity, Input>, ticks: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    const commands = new Map([...inputs].map(([e, input]) => [e.id, commandFor(sim.state.tick + 1, e, input)] as const));
    events.push(...sim.step(commands));
  }
  return events;
}

/** Opens slot 0's placement and confirms it with a fire press, looking along `look`. */
function placeByCommand(sim: Sim, e: CharacterEntity, look: Input): SimEvent[] {
  return [
    ...run(sim, e, 1, look),
    ...run(sim, e, 1, { ...look, buttons: BUTTON.ability1 }),
    ...run(sim, e, 1, { ...look, buttons: BUTTON.fire }),
    ...run(sim, e, 1, look),
  ];
}

/** One tick of Sim.step's gadget step (5) alone, after `beforeGadgets` (what step 4 would do in
 *  that tick); returns the tick's events. */
function stepGadgets(w: AbilityWorld, beforeGadgets: () => void = () => {}): SimEvent[] {
  const state = w.ctx.state;
  state.tick += 1;
  state.time = state.tick * TICK_DT;
  const before = w.events.length;
  beforeGadgets();
  gadgetSystem(w.ctx, TICK_DT);
  return w.events.slice(before);
}

/** Places `owner`'s gadget (no activation) on the floor at `pos` in a new tick, as the placeable
 *  activation does in step 4, and runs that tick's gadget step. */
function device(w: AbilityWorld, owner: CharacterEntity, ability: AbilityOf<'placeable'>, pos: Vec3): GadgetEntity {
  const placed: GadgetEntity[] = [];
  stepGadgets(w, () => placed.push(spawnGadget(w.ctx, owner, ability, { pos, yaw: 0, normal: UP })));
  return first(placed);
}

describe('placementPose (ADR-0012 §4.6)', () => {
  it('floor: a barrier stands on the crosshair point facing its yaw; a device sits deviceRadius above it', async () => {
    const w = await abilityWorld();
    const e = w.add('keel', 0, vec3(-30, 0, 25));
    w.stepPhysics();
    const target = vec3(-29.5, 0, 23.5);
    const look = lookAt(e, target);
    const barrier = placementPose(w.ctx.query, e, KEEL, look);
    expect(barrier).toMatchObject({ valid: true, failure: null });
    expect(barrier.yaw).toBeCloseTo(look.yaw, 9);
    expectNear(barrier.pos, target);
    expectNear(barrier.normal, UP);
    const mine = placementPose(w.ctx.query, e, BURRS, look);
    expect(mine).toMatchObject({ valid: true, failure: null });
    expect(mine.yaw).toBeCloseTo(look.yaw, 9);
    expectNear(mine.pos, vec3(target.x, DEVICE_R, target.z));
  });

  it('wall: a device sits out of the wall facing away from it; floor-only gadgets refuse the wall', async () => {
    const w = await abilityWorld();
    const e = w.add('lattice', 0, vec3(-38.5, 0, 25)); // the perimeter wall's face is x = −40
    const look = { yaw: WEST, pitch: 0 };
    const node = placementPose(w.ctx.query, e, NODES, look);
    expect(node).toMatchObject({ valid: true, failure: null });
    expectNear(node.pos, vec3(-40 + DEVICE_R, e.pos.y + CHARACTER.eyeHeight, 25));
    expectNear(node.normal, vec3(1, 0, 0));
    expect(node.yaw).toBeCloseTo(EAST, 9);
    expect(placementPose(w.ctx.query, e, BURRS, look)).toMatchObject({ valid: false, failure: 'surface' });
    expect(placementPose(w.ctx.query, e, KEEL, look)).toMatchObject({ valid: false, failure: 'surface' });
  });

  it('a ray that misses drops from its end onto the floor; nothing within the drop → noSurface at the ray end', async () => {
    const w = await abilityWorld();
    const e = w.add('lattice', 0, vec3(-30, 0, 25));
    const level = { yaw: 0, pitch: 0 };
    const node = placementPose(w.ctx.query, e, NODES, level);
    expect(node).toMatchObject({ valid: true, failure: null });
    expectNear(node.pos, vec3(-30, DEVICE_R, 25 - NODES.activation.placeRange));
    const barrier = placementPose(w.ctx.query, e, KEEL, level);
    expect(barrier.valid).toBe(true);
    expectNear(barrier.pos, vec3(-30, 0, 25 - KEEL.activation.placeRange));

    const up = { yaw: 0, pitch: Math.PI / 4 };
    const eye = aimOf(e).origin;
    const dir = forwardFromAngles(up.yaw, up.pitch);
    const range = NODES.activation.placeRange;
    expect(eye.y + dir.y * range - ABILITY_RULES.placement.maxDropM).toBeGreaterThan(0); // the drop ends in the air
    const none = placementPose(w.ctx.query, e, NODES, up);
    expect(none).toMatchObject({ valid: false, failure: 'noSurface' });
    expectNear(none.pos, vec3(eye.x + dir.x * range, eye.y + dir.y * range, eye.z + dir.z * range));
  });

  it('a ceiling never takes a gadget, not even an any-surface one', async () => {
    const w = await abilityWorld();
    const e = w.add('lattice', 0, vec3(21.5, 0, -18)); // inside the crouch tunnel (roof underside at 1.4 m)
    e.stance = 1;
    const pose = placementPose(w.ctx.query, e, NODES, { yaw: 0, pitch: Math.PI / 2 });
    expect(pose).toMatchObject({ valid: false, failure: 'surface' });
    expect(pose.normal.y).toBeCloseTo(-1, 5);
  });

  it('a barrier needs a free box: a character or level geometry in it → blocked; devices do not check', async () => {
    const w = await abilityWorld();
    const keel = w.add('keel', 0, vec3(-30, 0, 25));
    const target = vec3(-30, 0, 23);
    const look = lookAt(keel, target);
    expect(placementPose(w.ctx.query, keel, KEEL, look).valid).toBe(true);
    w.add('wisp', 1, target);
    w.stepPhysics(); // boxFree sees capsules as of the last physics step
    expect(placementPose(w.ctx.query, keel, KEEL, look)).toMatchObject({ valid: false, failure: 'blocked' });
    expect(placementPose(w.ctx.query, keel, BURRS, look)).toMatchObject({ valid: true, failure: null });

    // Facing the perimeter wall, the barrier's back would stand in it.
    const wall = w.add('keel', 0, vec3(-38.3, 0, 20));
    w.stepPhysics();
    const intoWall = placementPose(w.ctx.query, wall, KEEL, lookAt(wall, vec3(-39.95, 0, 20)));
    expect(intoWall).toMatchObject({ valid: false, failure: 'blocked' });
    expect(placementPose(w.ctx.query, wall, KEEL, lookAt(wall, vec3(-39.5, 0, 20))).valid).toBe(true);
  });
});

describe('placeable activation (ADR-0012 §1)', () => {
  it('a press opens the placement and spends nothing; fire confirms at placementPose; the confirm never shoots', async () => {
    const { sim, player } = await world('bracket', vec3(-30, 0, 25), 0);
    const slot = slotOf(player);
    const look = lookAt(player, vec3(-30, 0, 23));
    const opened = run(sim, player, 1, { ...look, buttons: BUTTON.ability1 });
    expect(slot.active).toEqual({ kind: 'placing' });
    expect(ofType(opened, 'ability')).toHaveLength(0);
    run(sim, player, SECONDS(0.5), look);
    expect(slot.resource.usesLeft).toBe(2);
    expect(slot.active).toEqual({ kind: 'placing' });

    const expected = placementPose(sim.query, player, SCREEN, look);
    expect(expected.valid).toBe(true);
    // A held auto trigger (Pike): the press places, the hold never fires.
    const confirmed = run(sim, player, SECONDS(0.5), { ...look, buttons: BUTTON.fire });
    expect(confirmed.filter((e) => e.type === 'ability' || e.type === 'gadgetPlaced').map((e) => e.type)).toEqual(['ability', 'gadgetPlaced']);
    expect(ofType(confirmed, 'shot')).toHaveLength(0);
    expect(slot.active).toBeNull();
    expect(slot.resource.usesLeft).toBe(1);
    const [g] = sim.state.gadgets;
    if (!g) throw new Error('expected a gadget');
    expect(g).toMatchObject({ abilityId: SCREEN.id, ownerId: player.id, team: player.team, health: SCREEN.activation.gadgetHealth });
    expect(g.yaw).toBeCloseTo(expected.yaw, 9);
    expectNear(g.pos, expected.pos);
    expect(ofType(confirmed, 'ability')[0]).toMatchObject({ entityId: player.id, abilityId: SCREEN.id, slot: 0 });
    expect(ofType(confirmed, 'gadgetPlaced')[0]).toMatchObject({ gadgetId: g.id, ownerId: player.id, abilityId: SCREEN.id });

    // Released, the trigger belongs to the weapon again.
    run(sim, player, 1, look);
    expect(player.suppressedButtons).toBe(0);
    expect(ofType(run(sim, player, 1, { ...look, buttons: BUTTON.fire }), 'shot')).toHaveLength(1);
  });

  it('ADS, the slot’s own key and a weapon select/swap press cancel silently; nothing is spent', async () => {
    const { sim, player } = await world('bracket', vec3(-30, 0, 25), 0);
    const slot = slotOf(player);
    const events: SimEvent[] = [];
    const open = (): void => {
      events.push(...run(sim, player, 1), ...run(sim, player, 1, { buttons: BUTTON.ability1 }));
      expect(slot.active).toEqual({ kind: 'placing' });
    };

    open();
    events.push(...run(sim, player, SECONDS(0.5), { buttons: BUTTON.ads }));
    expect(slot.active).toBeNull();
    expect(player.weapon.ads).toBe(0); // the cancelling press stays consumed while held

    open();
    events.push(...run(sim, player, 1), ...run(sim, player, 1, { buttons: BUTTON.ability1 }));
    expect(slot.active).toBeNull();

    open();
    const swap = run(sim, player, 1, { buttons: BUTTON.swapWeapon });
    expect(slot.active).toBeNull();
    expect(ofType(swap, 'weaponSwap')).toEqual([expect.objectContaining({ slot: 1 })]); // the swap still happens
    events.push(...swap);

    open();
    events.push(...run(sim, player, 1, { buttons: BUTTON.selectPrimary }));
    expect(slot.active).toBeNull();

    expect(events.filter((e) => ['ability', 'abilityEnd', 'abilityFailed', 'gadgetPlaced', 'shot'].includes(e.type))).toEqual([]);
    expect(slot.resource.usesLeft).toBe(2);
    expect(sim.state.gadgets).toEqual([]);
  });

  it('an invalid pose refuses with invalidPlacement and keeps placing; the try never fires later', async () => {
    const { sim, player } = await world('bracket', vec3(-30, 0, 25), 0);
    const slot = slotOf(player);
    const up = { yaw: 0, pitch: Math.PI / 4 };
    run(sim, player, 1, { ...up, buttons: BUTTON.ability1 });
    expect(placementPose(sim.query, player, SCREEN, up).failure).toBe('noSurface');
    const tried = run(sim, player, 1, { ...up, buttons: BUTTON.fire });
    expect(ofType(tried, 'abilityFailed')).toEqual([expect.objectContaining({ abilityId: SCREEN.id, reason: 'invalidPlacement' })]);
    expect(ofType(tried, 'ability')).toHaveLength(0);
    expect(slot.active).toEqual({ kind: 'placing' });
    expect(slot.resource.usesLeft).toBe(2);
    expect(sim.state.gadgets).toEqual([]);

    // Released and cancelled within the trigger buffer: the failed try is no pending shot.
    const after = [
      ...run(sim, player, 1, up),
      ...run(sim, player, 1, { ...up, buttons: BUTTON.ads }),
      ...run(sim, player, SECONDS(GUNPLAY.triggerBufferSeconds * 2), up),
    ];
    expect(slot.active).toBeNull();
    expect(ofType(after, 'shot')).toHaveLength(0);
  });

  it('refuses a new placement at maxActive (abilityFailed maxActive) with the resource left', async () => {
    const { sim, player } = await world('keel', vec3(-30, 0, 25), 0);
    const slot = slotOf(player);
    placeByCommand(sim, player, lookAt(player, vec3(-30, 0, 23)));
    expect(sim.state.gadgets).toHaveLength(1);
    expect(slot.resource.usesLeft).toBe(1);
    const again = run(sim, player, 1, { buttons: BUTTON.ability1 });
    expect(ofType(again, 'abilityFailed')).toEqual([expect.objectContaining({ abilityId: KEEL.id, reason: 'maxActive' })]);
    expect(slot.active).toBeNull();
    expect(slot.resource.usesLeft).toBe(1);
  });

  it('Keel end to end: the barrier blocks an enemy, its bullets destroy it, then the passage is free', async () => {
    const { sim, player: keel } = await world('keel', vec3(-30, 0, 27), 0);
    const enemy = sim.spawnCharacter({ operatorId: 'basalt', team: 1, controller: 'bot', position: vec3(-30, 0, 20), yaw: Math.PI });
    run(sim, keel, 10);
    placeByCommand(sim, keel, lookAt(keel, vec3(-30, 0, 25)));
    const [g] = sim.state.gadgets;
    if (!g) throw new Error('expected a barrier');

    // Walking +Z into it: stopped at its face.
    runAll(sim, new Map([[enemy, { moveZ: 1 }]]), SECONDS(1.5));
    const face = g.pos.z - ABILITY_RULES.barrier.thicknessM / 2 - CHARACTER.radius;
    expect(enemy.pos.z).toBeLessThan(face + 0.01);
    expect(enemy.pos.z).toBeGreaterThan(face - 0.1);

    // Shooting its centre (recoil compensated) until it breaks.
    const centre = vec3(g.pos.x, g.pos.y + 0.5, g.pos.z);
    const events: SimEvent[] = [];
    for (let i = 0; i < SECONDS(8) && !ofType(events, 'gadgetDestroyed').length; i++) {
      const aim = lookAt(enemy, centre);
      const input = { yaw: aim.yaw - enemy.weapon.recoilYaw, pitch: aim.pitch - enemy.weapon.recoilPitch, buttons: BUTTON.fire };
      events.push(...runAll(sim, new Map([[enemy, input]]), 1));
    }
    const hits = ofType(events, 'gadgetHit');
    expect(hits.length).toBeGreaterThan(1);
    expect(hits.reduce((sum, h) => sum + h.amount, 0)).toBeGreaterThanOrEqual(KEEL.activation.gadgetHealth);
    expect(ofType(events, 'gadgetDestroyed')).toEqual([
      expect.objectContaining({ gadgetId: g.id, abilityId: KEEL.id, ownerId: keel.id, attackerId: enemy.id, cause: { kind: 'weapon', weaponId: 'anvil_lmg' } }),
    ]);
    expect(sim.state.gadgets).toEqual([]);

    // The passage is free, and Keel may place its second one.
    runAll(sim, new Map([[enemy, { yaw: Math.PI, pitch: 0, moveZ: 1 }]]), SECONDS(1));
    expect(enemy.pos.z).toBeGreaterThan(g.pos.z + CHARACTER.radius);
    run(sim, keel, 1, { buttons: BUTTON.ability1 });
    expect(slotOf(keel).active).toEqual({ kind: 'placing' });
  });

  it('an elimination round reset clears placed gadgets and their colliders and restores the uses', async () => {
    const sim = await Sim.create(SALTWORKS_LEVEL, 1, 'elimination');
    const m = sim.state.match;
    if (m.mode !== 'elimination') throw new Error('expected an elimination match');
    const roster: RosterEntry[] = [
      { team: 0, operatorId: 'keel', controller: 'player' },
      { team: 1, operatorId: 'wisp', controller: 'bot' },
    ];
    const [keel] = roundSpawnOptions(sim.level, m, roster).map((o) => sim.spawnCharacter(o));
    if (!keel) throw new Error('expected Keel');
    while (m.phase !== 'live') sim.step(new Map());

    // A valid barrier pose 2 m ahead of Keel, with nothing else between the two probe points.
    const probe = [0, 1, 2, 3]
      .map((k) => {
        const ahead = forwardFromAngles(keel.yaw + (k * Math.PI) / 2, 0);
        const look = lookAt(keel, vec3(keel.pos.x + ahead.x * 2, keel.pos.y, keel.pos.z + ahead.z * 2));
        const pose = placementPose(sim.query, keel, KEEL, look);
        const fwd = forwardFromAngles(pose.yaw, 0);
        const across = (d: number): Vec3 => vec3(pose.pos.x + fwd.x * d, pose.pos.y + 0.5, pose.pos.z + fwd.z * d);
        return { look, pose, a: across(-0.3), b: across(0.3) };
      })
      .find((p) => p.pose.valid && sim.query.lineOfSight(p.a, p.b));
    if (!probe) throw new Error('no free spot next to Keel');
    placeByCommand(sim, keel, probe.look);
    expect(sim.state.gadgets).toHaveLength(1);
    expect(sim.query.lineOfSight(probe.a, probe.b)).toBe(false);
    expect(slotOf(keel).resource.usesLeft).toBe(1);

    m.phase = 'roundEnd';
    m.phaseEndTick = sim.state.tick + 1;
    sim.step(new Map());
    expect(m.round).toBe(2);
    expect(sim.state.gadgets).toEqual([]);
    expect(sim.query.lineOfSight(probe.a, probe.b)).toBe(true);
    expect(slotOf(keel).resource.usesLeft).toBe(2);
    expect(slotOf(keel).active).toBeNull();
  });
});

describe('gadget triggers (ADR-0012 §4.4)', () => {
  it('a barrier applies nothing and keeps standing while disabled (the countdown still runs)', async () => {
    const w = await abilityWorld();
    const keel = w.add('keel', 0, vec3(-30, 0, 20));
    w.add('wisp', 1, vec3(-30, 0, 23.2));
    const g = device(w, keel, KEEL, vec3(-30, 0, 23));
    g.disabled = 0.5;
    for (let i = 0; i < SECONDS(1); i++) stepGadgets(w);
    expect(w.ctx.state.gadgets).toEqual([g]);
    expect(g.disabled).toBe(0);
    expect(gadgetApplications()).toEqual([]);
  });

  it('aura: armed after armSeconds, then applies every tick from the gadget (dt, sustained) unless disabled', async () => {
    const w = await abilityWorld();
    const lattice = w.add('lattice', 0, vec3(-30, 0, 20));
    w.add('wisp', 1, vec3(-30, 0, 24));
    const g = device(w, lattice, NODES, vec3(-30, DEVICE_R, 23));
    for (let i = 1; i < ARM_TICKS; i++) stepGadgets(w);
    expect(gadgetApplications()).toEqual([]);
    stepGadgets(w);
    const armedAt = first(gadgetApplications());
    expect(armedAt).toMatchObject({ ability: NODES, user: lattice, via: { kind: 'gadget', id: g.id }, amountScale: TICK_DT, sustained: true, radiusScale: 1, struck: null });
    expectNear(armedAt.origin, g.pos);
    for (let i = 0; i < 10; i++) stepGadgets(w);
    expect(gadgetApplications()).toHaveLength(11);
    expect(w.ctx.state.gadgets).toEqual([g]); // an aura is never consumed

    applied.mockClear();
    g.disabled = 0.5;
    for (let i = 1; i < SECONDS(0.5); i++) stepGadgets(w);
    expect(gadgetApplications()).toEqual([]);
    for (let i = 0; i < 3; i++) stepGadgets(w);
    expect(g.disabled).toBe(0);
    expect(gadgetApplications().length).toBeGreaterThan(0);
  });

  it('proximity: an armed mine bursts once for a living enemy body within its radius, never for a teammate', async () => {
    const w = await abilityWorld();
    const thistle = w.add('thistle', 0, vec3(-30, 0, 20));
    const mate = w.add('wisp', 0, vec3(-30, 0, 23.3));
    const enemy = w.add('wisp', 1, vec3(-25, 0, 23));
    const g = device(w, thistle, BURRS, vec3(-30, DEVICE_R, 23));
    const events: SimEvent[] = [];
    for (let i = 0; i < SECONDS(1); i++) events.push(...stepGadgets(w));
    expect(ofType(events, 'burst')).toEqual([]);

    enemy.pos = vec3(-30 + burrRadius() + 0.05, 0, 23); // just outside
    events.push(...stepGadgets(w));
    enemy.alive = false;
    enemy.pos = vec3(-30 + burrRadius() - 0.05, 0, 23); // inside, but dead
    events.push(...stepGadgets(w));
    expect(ofType(events, 'burst')).toEqual([]);
    expect(gadgetApplications()).toEqual([]);

    enemy.alive = true;
    const burst = stepGadgets(w);
    expect(ofType(burst, 'burst')).toEqual([
      expect.objectContaining({ source: 'gadget', sourceId: g.id, abilityId: BURRS.id, ownerId: thistle.id, pos: g.pos }),
    ]);
    expect(gadgetApplications()).toHaveLength(1);
    const once = first(gadgetApplications());
    expect(once).toMatchObject({ ability: BURRS, user: thistle, via: { kind: 'gadget', id: g.id }, amountScale: 1, sustained: false });
    expectNear(once.origin, g.pos);
    expect(w.ctx.state.gadgets).toEqual([]);
    for (let i = 0; i < 10; i++) stepGadgets(w);
    expect(gadgetApplications()).toHaveLength(1);
    expect(mate.alive).toBe(true);

    // Not before it is armed, even with an enemy standing on it.
    applied.mockClear();
    const second = device(w, thistle, BURRS, vec3(enemy.pos.x, DEVICE_R, enemy.pos.z));
    for (let i = 1; i < ARM_TICKS; i++) expect(ofType(stepGadgets(w), 'burst')).toEqual([]);
    expect(ofType(stepGadgets(w), 'burst')).toEqual([expect.objectContaining({ sourceId: second.id })]);
  });

  it('timer: bursts delay s after placement (armed or not, enemies or not); paused while disabled', async () => {
    const w = await abilityWorld();
    const auger = w.add('auger', 0, vec3(-30, 0, 20));
    const g = device(w, auger, BORE, vec3(-30, DEVICE_R, 23));
    const placed = w.ctx.state.tick;
    const delay = secondsToTicks(boreDelay());
    for (let i = 1; i < delay; i++) expect(ofType(stepGadgets(w), 'burst')).toEqual([]);
    expect(g.timer).toBeGreaterThan(0);
    const burst = stepGadgets(w);
    expect(w.ctx.state.tick - placed).toBe(delay);
    expect(ofType(burst, 'burst')).toEqual([expect.objectContaining({ source: 'gadget', sourceId: g.id, abilityId: BORE.id, ownerId: auger.id })]);
    expect(gadgetApplications()).toEqual([expect.objectContaining({ ability: BORE, user: auger, via: { kind: 'gadget', id: g.id }, amountScale: 1 })]);
    expectNear(first(gadgetApplications()).origin, g.pos);
    expect(w.ctx.state.gadgets).toEqual([]);

    const paused = device(w, auger, BORE, vec3(-30, DEVICE_R, 23));
    const start = w.ctx.state.tick;
    for (let i = 0; i < 30; i++) stepGadgets(w);
    const left = paused.timer;
    paused.disabled = 1;
    for (let i = 1; i < SECONDS(1); i++) stepGadgets(w);
    expect(paused.timer).toBe(left);
    let burstTick = -1;
    for (let i = 0; i < SECONDS(boreDelay() + 2) && burstTick < 0; i++) {
      if (ofType(stepGadgets(w), 'burst').length) burstTick = w.ctx.state.tick;
    }
    const expected = start + delay + SECONDS(1);
    expect(burstTick - expected).toBeGreaterThanOrEqual(0);
    expect(burstTick - expected).toBeLessThanOrEqual(1);
  });

  it('Bore Charge end to end: planted on a wall, it bursts delay s after the placing tick, from the charge', async () => {
    const { sim, player: auger } = await world('auger', vec3(-38.8, 0, 25), WEST);
    const placing = placeByCommand(sim, auger, { yaw: WEST, pitch: 0 });
    const placed = first(ofType(placing, 'gadgetPlaced'));
    const g = first(sim.state.gadgets);
    expect(g.pos.x).toBeCloseTo(-40 + DEVICE_R, 4);
    expectNear(g.normal, vec3(1, 0, 0));
    const events = [...placing, ...run(sim, auger, SECONDS(boreDelay() + 0.5))];
    const burst = first(ofType(events, 'burst'));
    expect(burst.tick - placed.tick).toBe(secondsToTicks(boreDelay()));
    expect(burst).toMatchObject({ source: 'gadget', sourceId: g.id, abilityId: BORE.id, ownerId: auger.id, pos: g.pos });
    expect(gadgetApplications()).toEqual([expect.objectContaining({ ability: BORE, user: auger, via: { kind: 'gadget', id: g.id } })]);
    expectNear(first(gadgetApplications()).origin, g.pos);
    expect(sim.state.gadgets).toEqual([]);
  });
});
