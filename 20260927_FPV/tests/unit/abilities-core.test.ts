import { describe, expect, it } from 'vitest';
import { ABILITY_RULES, CHARACTER, TICK_DT } from '../../src/config/sim.ts';
import { getAbility, getOperator } from '../../src/data/content.ts';
import { SALTWORKS_LEVEL } from '../../src/data/levels/saltworks.ts';
import type { AbilityDef, ActivationKind, EffectKind } from '../../src/data/schema.ts';
import { isCombinationSupported } from '../../src/sim/abilities/effects.ts';
import { damageGadget, gadgetShape, removeGadget, spawnGadget } from '../../src/sim/abilities/gadgets.ts';
import { BUTTON } from '../../src/sim/command.ts';
import { falloffDamage, mitigatedDamage } from '../../src/sim/combat/damage.ts';
import { allocateId } from '../../src/sim/context.ts';
import { loadOperator } from '../../src/sim/entities.ts';
import { bodyDistance, zoneWorldCenter } from '../../src/sim/hitbox.ts';
import { anglesTo, distance, normalize, vec3, type Vec3 } from '../../src/sim/math.ts';
import { ELIMINATION_RULES } from '../../src/sim/modes/elimination.ts';
import { MODES } from '../../src/sim/modes/index.ts';
import type { BulletHit } from '../../src/sim/physics/world.ts';
import {
  activeWeapon,
  canFire,
  channelProgress,
  damageTakenMultiplier,
  gadgetCount,
  modifierProduct,
  shieldAmount,
  weaponBlockedBy,
  weaponOf,
} from '../../src/sim/stats.ts';
import { hasActivation, isAbilitySupported, type AbilityOf } from '../../src/sim/systems/abilities.ts';
import { applyDamage, type DamageInfo } from '../../src/sim/systems/health.ts';
import { aimOf } from '../../src/sim/systems/weapons.ts';
import type { CharacterEntity, DamageCause, GadgetEntity } from '../../src/sim/types.ts';
import { abilityWorld, type AbilityWorld } from './support/abilityWorld.ts';
import { EAST, ofType, run, SECONDS, world } from './support/world.ts';

// ADR-0012 batch F: the foundation every activation and effect builds on — gadget colliders and
// what they block, the damage pipeline (mitigation → shields → health, causes), death clean-up,
// one id space, world-object clean-up, the dispatcher's contract (gate, weapon block, consumed
// buttons, interrupts, resources) and the support table. Real physics in Node throughout.

const UP = vec3(0, 1, 0);

function placeable(id: string): AbilityOf<'placeable'> {
  const a = getAbility(id);
  if (!hasActivation(a, 'placeable')) throw new Error(`${id} must be placeable`);
  return a;
}

/** Breakwater: a waist-high barrier. */
const KEEL = placeable('keel_breakwater');
/** Scaffold Screen: a full-height barrier. */
const SCREEN = placeable('bracket_screen');
/** Tripline Nodes: a device. */
const NODES = placeable('lattice_nodes');

/** Places `owner`'s gadget (no activation) and lets a physics step index its collider. */
function place(w: AbilityWorld, owner: CharacterEntity, ability: AbilityOf<'placeable'>, pos: Vec3, yaw = 0): GadgetEntity {
  const g = spawnGadget(w.ctx, owner, ability, { pos, yaw, normal: UP });
  w.stepPhysics();
  return g;
}

function settle(w: AbilityWorld, ...characters: CharacterEntity[]): void {
  for (const e of characters) for (let i = 0; i < 10; i++) w.stepCharacter(e);
}

/** A bullet ray from `from` towards `to` (a little beyond it), as `shooterId` would cast it. */
function ray(w: AbilityWorld, from: Vec3, to: Vec3, shooterId: number): BulletHit | null {
  const dir = normalize({ x: to.x - from.x, y: to.y - from.y, z: to.z - from.z });
  return w.ctx.physics.castBullet(from, dir, distance(from, to), shooterId);
}

const lethal = (cause: DamageCause, victim: CharacterEntity): DamageInfo => ({
  amount: 10_000,
  zone: 'torso',
  point: victim.pos,
  distance: 1,
  cause,
  sourcePos: victim.pos,
});

const BORE: DamageCause = { kind: 'ability', abilityId: 'auger_bore' };

describe('gadget colliders (ADR-0012 §4.1–§4.5)', () => {
  it('a barrier blocks walking', async () => {
    const w = await abilityWorld();
    const keel = w.add('keel', 0, vec3(-34, 0, 20));
    const walker = w.add('wisp', 1, vec3(-30, 0, 26)); // facing −Z
    settle(w, walker);
    place(w, keel, KEEL, vec3(-30, 0, 22));
    for (let i = 0; i < SECONDS(1.5); i++) w.stepCharacter(walker, { moveZ: 1 });
    const face = 22 + ABILITY_RULES.barrier.thicknessM / 2 + CHARACTER.radius;
    expect(walker.pos.z).toBeGreaterThan(face);
    expect(walker.pos.z).toBeLessThan(face + 0.1);
  });

  it('a barrier over a crouched character keeps it from standing up until it is gone', async () => {
    const w = await abilityWorld();
    const bracket = w.add('bracket', 0, vec3(-34, 0, 20));
    const e = w.add('wisp', 1, vec3(-30, 0, 26));
    settle(w, e);
    for (let i = 0; i < SECONDS(0.5); i++) w.stepCharacter(e, { buttons: BUTTON.crouch });
    expect(e.stance).toBe(1);
    // Floating just above the crouched capsule (spawnGadget does not check the pose).
    const g = place(w, bracket, SCREEN, vec3(e.pos.x, 1.3, e.pos.z));
    for (let i = 0; i < SECONDS(0.5); i++) w.stepCharacter(e);
    expect(e.stance).toBe(1);
    removeGadget(w.ctx, g);
    for (let i = 0; i < SECONDS(0.5); i++) w.stepCharacter(e);
    expect(e.stance).toBe(0);
  });

  it('a barrier stops bullets: an enemy one takes the falloff damage (gadgetHit), an own-team one only marks', async () => {
    const w = await abilityWorld();
    const keel = w.add('keel', 0, vec3(-34, 0, 20));
    const behind = w.add('wisp', 0, vec3(-30, 0, 22));
    const shooter = w.add('basalt', 1, vec3(-30, 0, 30));
    const ally = w.add('basalt', 0, vec3(-28, 0, 30));
    settle(w, shooter, ally);
    const g = place(w, keel, KEEL, vec3(-30, 0, 26));
    const centre = vec3(-30, 0.55, 26);
    const aim = anglesTo(aimOf(shooter).origin, centre);
    for (let i = 0; i < SECONDS(1.5); i++) w.stepCharacter(shooter, { ...aim, buttons: BUTTON.ads });
    const events = w.stepCharacter(shooter, { ...aim, buttons: BUTTON.ads | BUTTON.fire });
    const [gadgetHit] = ofType(events, 'gadgetHit');
    if (!gadgetHit) throw new Error('expected a gadgetHit');
    expect(ofType(events, 'hit')).toHaveLength(0);
    expect(behind.health).toBe(getOperator('wisp').maxHealth);
    expect(gadgetHit).toMatchObject({ gadgetId: g.id, attackerId: shooter.id, cause: { kind: 'weapon', weaponId: weaponOf(shooter).id } });
    expect(gadgetHit.amount).toBeCloseTo(falloffDamage(weaponOf(shooter), distance(aimOf(shooter).origin, gadgetHit.point)), 5);
    expect(g.health).toBeCloseTo(KEEL.activation.gadgetHealth - gadgetHit.amount, 5);

    // Friendly fire is off: the ally's pellet stops at the barrier but deals nothing.
    const allyAim = anglesTo(aimOf(ally).origin, centre);
    for (let i = 0; i < SECONDS(1.5); i++) w.stepCharacter(ally, { ...allyAim, buttons: BUTTON.ads });
    const own = w.stepCharacter(ally, { ...allyAim, buttons: BUTTON.ads | BUTTON.fire });
    expect(ofType(own, 'gadgetHit')).toHaveLength(0);
    expect(ofType(own, 'impact')).toHaveLength(1);
    expect(g.health).toBeCloseTo(KEEL.activation.gadgetHealth - gadgetHit.amount, 5);
  });

  it('a barrier blocks line of sight; a device blocks only bullets', async () => {
    const w = await abilityWorld();
    const keel = w.add('keel', 0, vec3(-34, 0, 20));
    const lattice = w.add('lattice', 0, vec3(-26, 0, 20));
    const walker = w.add('wisp', 1, vec3(-24, 0, 29));
    settle(w, walker);
    place(w, keel, KEEL, vec3(-30, 0, 26));
    const d = place(w, lattice, NODES, vec3(-24, 0.5, 26));
    expect(gadgetShape(NODES)).toEqual({ kind: 'device', radius: ABILITY_RULES.gadget.deviceRadiusM });

    expect(w.ctx.query.lineOfSight(vec3(-30, 1, 30), vec3(-30, 1, 22))).toBe(false);
    expect(w.ctx.query.lineOfSight(vec3(-30, 1.5, 30), vec3(-30, 1.5, 22))).toBe(true); // over it
    // The device: bullets register it, sight passes, characters walk through.
    expect(ray(w, vec3(-24, 0.5, 30), vec3(-24, 0.5, 22), walker.id)?.target).toEqual({ kind: 'gadget', entityId: d.id });
    expect(w.ctx.query.lineOfSight(vec3(-24, 0.5, 30), vec3(-24, 0.5, 22))).toBe(true);
    for (let i = 0; i < SECONDS(1.5); i++) w.stepCharacter(walker, { moveZ: 1 });
    expect(walker.pos.z).toBeLessThan(24);
    // Gadgets are not level: ground and surface probes pass them.
    expect(w.ctx.query.groundBelow(vec3(-30, 2, 26), 3)).toBeCloseTo(0, 5);
    expect(w.ctx.query.surfaceAlong(vec3(-30, 0.5, 30), vec3(0, 0, -1), 6)).toBeNull();
  });

  it('a destroyed barrier stops blocking rays at once and movement from the next physics step', async () => {
    const w = await abilityWorld();
    const keel = w.add('keel', 0, vec3(-34, 0, 20));
    const walker = w.add('wisp', 1, vec3(-30, 0, 29));
    settle(w, walker);
    const g = place(w, keel, KEEL, vec3(-30, 0, 26));
    const from = vec3(-30, 0.5, 29);
    const to = vec3(-30, 0.5, 22);
    expect(ray(w, from, to, walker.id)?.target).toEqual({ kind: 'gadget', entityId: g.id });

    w.drain();
    damageGadget(w.ctx, g, KEEL.activation.gadgetHealth, walker.id, { kind: 'weapon', weaponId: 'vesper_ar' }, g.pos);
    const events = w.drain();
    expect(events.map((e) => e.type)).toEqual(['gadgetHit', 'gadgetDestroyed']);
    expect(ofType(events, 'gadgetDestroyed')[0]).toMatchObject({ gadgetId: g.id, abilityId: KEEL.id, ownerId: keel.id, attackerId: walker.id });
    expect(w.ctx.state.gadgets).toHaveLength(0);
    // Before the next step the collider may still be indexed: it counts as level geometry.
    expect(ray(w, from, to, walker.id)?.target ?? null).toBeNull();
    damageGadget(w.ctx, g, 10, walker.id, BORE, g.pos); // gone: nothing happens
    removeGadget(w.ctx, g);
    expect(w.drain()).toEqual([]);

    w.stepPhysics(); // the pending removal, without a Rapier error
    expect(ray(w, from, to, walker.id)).toBeNull();
    expect(w.ctx.query.lineOfSight(from, to)).toBe(true);
    for (let i = 0; i < SECONDS(1.5); i++) w.stepCharacter(walker, { moveZ: 1 });
    expect(walker.pos.z).toBeLessThan(24);
  });
});

describe('damage pipeline (ADR-0012 §3.3)', () => {
  it('mitigates first, then shields absorb (soonest-expiring first, broken ones removed), then health', async () => {
    const w = await abilityWorld();
    const attacker = w.add('wisp', 0, vec3(-30, 0, 20));
    const victim = w.add('basalt', 1, vec3(-30, 0, 25));
    victim.modifiers.push({ sourceId: 'basalt_brace', stats: { damageTaken: 0.5 }, remaining: 5 });
    victim.shields = [
      { sourceId: 'bracket_overbrace', amount: 10, remaining: 5 },
      { sourceId: 'other_shield', amount: 20, remaining: 2 },
    ];
    expect(shieldAmount(victim)).toBe(30);
    const amount = mitigatedDamage(100, getOperator('basalt').armour, damageTakenMultiplier(victim));
    expect(amount).toBeCloseTo(100 * (1 - getOperator('basalt').armour) * 0.5, 9);
    w.drain();
    applyDamage(w.ctx, attacker, victim, { ...lethal(BORE, victim), amount });
    const events = w.drain();
    expect(ofType(events, 'shieldBroken').map((e) => e.abilityId)).toEqual(['other_shield', 'bracket_overbrace']);
    expect(ofType(events, 'hit')[0]).toMatchObject({ damage: amount, absorbed: 30, killed: false, cause: BORE });
    expect(victim.shields).toEqual([]);
    expect(victim.health).toBeCloseTo(getOperator('basalt').maxHealth - (amount - 30), 9);

    // A hit smaller than the shield: all absorbed, the shield stays.
    victim.shields = [{ sourceId: 'bracket_overbrace', amount: 30, remaining: 3 }];
    const health = victim.health;
    applyDamage(w.ctx, attacker, victim, { ...lethal(BORE, victim), amount: 12 });
    expect(ofType(w.drain(), 'hit')[0]).toMatchObject({ damage: 12, absorbed: 12 });
    expect(victim.health).toBe(health);
    expect(shieldAmount(victim)).toBe(18);
  });

  it('names the cause of a kill: the weapon, or the ability', async () => {
    const { sim, player } = await world('basalt', vec3(-15, 0, 26), 0);
    const dummy = sim.spawnCharacter({ operatorId: 'wisp', team: 1, controller: 'bot', position: vec3(-15, 0, 20), yaw: Math.PI });
    run(sim, player, 10);
    const aim = anglesTo(aimOf(player).origin, zoneWorldCenter(dummy, 'torso'));
    run(sim, player, SECONDS(1.5), { ...aim, buttons: BUTTON.ads });
    const events = run(sim, player, SECONDS(2), { ...aim, buttons: BUTTON.ads | BUTTON.fire });
    const weapon = { kind: 'weapon', weaponId: weaponOf(player).id };
    expect(ofType(events, 'kill')[0]).toMatchObject({ attackerId: player.id, victimId: dummy.id, cause: weapon });
    for (const hit of ofType(events, 'hit')) expect(hit).toMatchObject({ cause: weapon, absorbed: 0 });

    const w = await abilityWorld();
    const auger = w.add('auger', 0, vec3(-30, 0, 20));
    const victim = w.add('wisp', 1, vec3(-30, 0, 25));
    applyDamage(w.ctx, auger, victim, lethal(BORE, victim));
    expect(ofType(w.drain(), 'kill')[0]).toMatchObject({ attackerId: auger.id, victimId: victim.id, cause: BORE, headshot: false });
  });

  it('death clears shields, reveals and running activities (a channel ends with abilityEnd, a placement silently)', async () => {
    const w = await abilityWorld();
    const killer = w.add('wisp', 0, vec3(-30, 0, 20));
    const heron = w.add('heron', 1, vec3(-30, 0, 25));
    const keel = w.add('keel', 1, vec3(-27, 0, 25));
    const [sonar] = heron.abilities;
    const [breakwater] = keel.abilities;
    if (!sonar || !breakwater) throw new Error('expected ability slots');
    sonar.active = { kind: 'channel', elapsed: 0.5 };
    breakwater.active = { kind: 'placing' };
    heron.shields = [{ sourceId: 'bracket_overbrace', amount: 5, remaining: 4 }];
    heron.reveals = [{ team: 0, sourceId: 'lattice_nodes', remaining: 2 }];
    expect(channelProgress(sonar)).toBeCloseTo(0.5 / 2.5, 9);
    expect([weaponBlockedBy(heron), weaponBlockedBy(keel)]).toEqual(['channel', 'placing']);
    w.drain();
    applyDamage(w.ctx, killer, heron, lethal(BORE, heron));
    applyDamage(w.ctx, killer, keel, lethal(BORE, keel));
    const events = w.drain();
    expect([heron.alive, heron.shields, heron.reveals, sonar.active, breakwater.active]).toEqual([false, [], [], null, null]);
    expect(ofType(events, 'abilityEnd')).toEqual([
      expect.objectContaining({ entityId: heron.id, abilityId: 'heron_sonar', slot: 0, reason: 'died' }),
    ]);
    expect(channelProgress(sonar)).toBeNull();
  });
});

describe('world objects (ADR-0012 §2)', () => {
  it('draws characters, gadgets, projectiles and areas from one id sequence', async () => {
    const w = await abilityWorld();
    const a = w.add('keel', 0, vec3(-30, 0, 20));
    const g = spawnGadget(w.ctx, a, KEEL, { pos: vec3(-30, 0, 23), yaw: 0, normal: UP });
    const b = w.add('wisp', 1, vec3(-30, 0, 26));
    expect([a.id, g.id, b.id, allocateId(w.ctx.state)]).toEqual([1, 2, 3, 4]);
    expect(ofType(w.drain(), 'gadgetPlaced')[0]).toMatchObject({ gadgetId: g.id, ownerId: a.id, abilityId: KEEL.id, pos: vec3(-30, 0, 23) });

    const { sim } = await world('basalt', vec3(-30, 0, 25), EAST);
    const second = sim.spawnCharacter({ operatorId: 'wisp', team: 1, controller: 'bot', position: vec3(-25, 0, 25), yaw: 0 });
    expect(second.id).toBe(sim.state.nextId - 1);
  });

  it('elimination round reset clears gadgets (and their colliders), projectiles and areas', async () => {
    const w = await abilityWorld(SALTWORKS_LEVEL);
    const m = ELIMINATION_RULES.initialMatch(w.ctx);
    if (m.mode !== 'elimination') throw new Error('expected an elimination match');
    w.ctx.state.match = m;
    const keel = w.add('keel', 0, vec3(0, 0, 27));
    const enemy = w.add('wisp', 1, vec3(0, 0, 19));
    const g = place(w, keel, KEEL, vec3(0, 0, 23));
    const state = w.ctx.state;
    state.projectiles.push({
      id: allocateId(state),
      kind: 'projectile',
      abilityId: 'kiln_lance',
      ownerId: keel.id,
      team: 0,
      pos: vec3(0, 1, 23),
      prevPos: vec3(0, 1, 23),
      vel: vec3(0, 0, -10),
      fuse: null,
      resting: false,
      age: 0.2,
    });
    state.areas.push({ id: allocateId(state), kind: 'area', abilityId: 'gorse_firebreak', effectIndex: 0, ownerId: keel.id, team: 0, pos: vec3(0, 0, 23), remaining: 5 });
    const from = vec3(0, 0.5, 26);
    const to = vec3(0, 0.5, 20);
    expect(ray(w, from, to, enemy.id)?.target).toEqual({ kind: 'gadget', entityId: g.id });

    m.phase = 'roundEnd';
    m.phaseEndTick = state.tick;
    ELIMINATION_RULES.tick(w.ctx, TICK_DT);
    expect(m.round).toBe(2);
    expect([state.gadgets, state.projectiles, state.areas]).toEqual([[], [], []]);
    w.stepPhysics();
    expect(ray(w, from, to, enemy.id)?.target ?? null).toBeNull();
  });

  it('an operator change removes the old kit’s gadgets; a respawn and death do not', async () => {
    const w = await abilityWorld();
    const a = w.add('keel', 0, vec3(-33, 0, 20));
    const b = w.add('keel', 1, vec3(-27, 0, 20));
    const ga = place(w, a, KEEL, vec3(-33, 0, 24));
    const gb = place(w, b, KEEL, vec3(-27, 0, 24));
    loadOperator(w.ctx, b, 'keel'); // same kit (a respawn reloads it)
    applyDamage(w.ctx, a, b, lethal(BORE, b)); // gadgets outlive their owner
    expect(gadgetCount(w.ctx.state, b.id, KEEL.id)).toBe(1);

    loadOperator(w.ctx, a, 'wisp');
    expect(w.ctx.state.gadgets).toEqual([gb]);
    expect(w.ctx.state.gadgets).not.toContain(ga);
    expect(ofType(w.drain(), 'gadgetDestroyed')).toHaveLength(0); // silent
    w.stepPhysics();
    expect(ray(w, vec3(-33, 0.5, 27), vec3(-33, 0.5, 21), b.id)?.target ?? null).toBeNull();
    expect(ray(w, vec3(-27, 0.5, 27), vec3(-27, 0.5, 21), a.id)?.target).toEqual({ kind: 'gadget', entityId: gb.id });
  });
});

describe('ability dispatcher contract (ADR-0012 §1, ADR-0013 §4)', () => {
  it('a closed mode gate refuses with blocked and spends nothing; passives are never gated', async () => {
    const { sim, player } = await world('basalt', vec3(-30, 0, 25), EAST);
    const rules = MODES.range;
    rules.abilityAllowed = () => false;
    try {
      const events = run(sim, player, 1, { buttons: BUTTON.ability1 });
      expect(ofType(events, 'abilityFailed')).toEqual([expect.objectContaining({ abilityId: 'basalt_brace', reason: 'blocked' })]);
      expect(ofType(events, 'ability')).toHaveLength(0);
      expect(player.abilities[0]?.resource.timer).toBe(0);
      expect(player.modifiers).toHaveLength(0);
      sim.control({ type: 'selectOperator', entityId: player.id, operatorId: 'kestrel' });
      run(sim, player, 1);
      expect(modifierProduct(player, 'footstepVolume')).toBeLessThan(1); // Lightfoot
    } finally {
      delete rules.abilityAllowed;
    }
    // Open again: the press spends and announces the use at the user's feet.
    const used = run(sim, player, 1, { buttons: BUTTON.ability1 });
    const [ability] = ofType(used, 'ability');
    expect(ability).toMatchObject({ abilityId: 'kestrel_updraft', slot: 0 });
    expect(ability?.pos.y).toBeCloseTo(0, 2);
  });

  it('a placement or a channel blocks the weapon (no shot, ADS, reload or swap); a toggle does not', async () => {
    const { sim, player } = await world('basalt', vec3(-30, 0, 25), EAST);
    const slot = player.abilities[0];
    if (!slot) throw new Error('expected an ability slot');
    activeWeapon(player).ammo -= 5;
    slot.active = { kind: 'placing' };
    expect([weaponBlockedBy(player), canFire(player)]).toEqual(['placing', false]);
    const held = run(sim, player, SECONDS(0.5), { buttons: BUTTON.fire | BUTTON.ads });
    expect(ofType(held, 'shot')).toHaveLength(0);
    expect(player.weapon.ads).toBe(0);
    run(sim, player, 1);
    const others = [
      ...run(sim, player, 1, { buttons: BUTTON.reload }),
      ...run(sim, player, 1),
      ...run(sim, player, 1, { buttons: BUTTON.selectSecondary }),
    ];
    expect(ofType(others, 'reloadStart')).toHaveLength(0);
    expect(ofType(others, 'weaponSwap')).toHaveLength(0);
    expect(player.activeSlot).toBe(0);

    // A running reload is cancelled by a block (no ammo moves).
    slot.active = null;
    run(sim, player, 1);
    expect(ofType(run(sim, player, 1, { buttons: BUTTON.reload }), 'reloadStart')).toHaveLength(1);
    const ammo = activeWeapon(player).ammo;
    slot.active = { kind: 'channel', elapsed: 0 };
    run(sim, player, SECONDS(0.2));
    expect(player.weapon.reloadRemaining).toBe(0);
    expect(activeWeapon(player).ammo).toBe(ammo);

    // A trigger press while blocked waits in the trigger buffer, as during a swap.
    run(sim, player, 1, { buttons: BUTTON.fire });
    slot.active = null;
    expect(ofType(run(sim, player, 1), 'shot')).toHaveLength(1);

    slot.active = { kind: 'on', elapsed: 0 };
    expect(weaponBlockedBy(player)).toBeNull();
    run(sim, player, SECONDS(0.5));
    expect(ofType(run(sim, player, 1, { buttons: BUTTON.fire }), 'shot')).toHaveLength(1);
  });

  it('masks consumed buttons from movement and weapons until they are released', async () => {
    const { sim, player } = await world('basalt', vec3(-30, 0, 25), EAST);
    player.suppressedButtons = BUTTON.fire | BUTTON.crouch; // as a confirming click would leave them
    const held = run(sim, player, SECONDS(0.3), { buttons: BUTTON.fire | BUTTON.crouch });
    expect(ofType(held, 'shot')).toHaveLength(0);
    expect(player.stance).toBe(0);
    expect(player.suppressedButtons).toBe(BUTTON.fire | BUTTON.crouch);
    expect(player.lastButtons).toBe(BUTTON.fire | BUTTON.crouch); // raw buttons
    run(sim, player, 1);
    expect(player.suppressedButtons).toBe(0);
    expect(ofType(run(sim, player, 1, { buttons: BUTTON.fire }), 'shot')).toHaveLength(1);
  });

  it('another slot’s press ends a channel (abilityEnd interrupted) or a placement (silently)', async () => {
    const { sim, player } = await world('bracket', vec3(-30, 0, 25), EAST);
    const [screen] = player.abilities;
    if (!screen) throw new Error('expected an ability slot');
    screen.active = { kind: 'placing' };
    const first = run(sim, player, 1, { buttons: BUTTON.ability2 });
    expect(screen.active).toBeNull();
    expect(ofType(first, 'abilityEnd')).toHaveLength(0);
    expect(ofType(first, 'ability').map((e) => e.abilityId)).toEqual(['bracket_overbrace']);
    run(sim, player, 1);
    screen.active = { kind: 'channel', elapsed: 0 };
    const second = run(sim, player, 1, { buttons: BUTTON.ability2 }); // Overbrace is cooling down
    expect(ofType(second, 'abilityEnd')).toEqual([
      expect.objectContaining({ abilityId: 'bracket_screen', slot: 0, reason: 'interrupted' }),
    ]);
    expect(ofType(second, 'abilityFailed')).toEqual([expect.objectContaining({ abilityId: 'bracket_overbrace', reason: 'notReady' })]);
  });

  it('holds a slot’s resource while it channels or is switched on; it runs while idle or placing', async () => {
    const { sim, player } = await world('basalt', vec3(-30, 0, 25), EAST);
    run(sim, player, 1, { buttons: BUTTON.ability1 });
    const slot = player.abilities[0];
    if (!slot) throw new Error('expected an ability slot');
    const start = slot.resource.timer;
    expect(start).toBeGreaterThan(0);
    for (const active of [{ kind: 'channel', elapsed: 0 }, { kind: 'on', elapsed: 0 }] as const) {
      slot.active = { ...active };
      run(sim, player, SECONDS(1));
      expect(slot.resource.timer).toBe(start);
    }
    slot.active = { kind: 'placing' };
    run(sim, player, SECONDS(1));
    expect(slot.resource.timer).toBeCloseTo(start - 1, 5);
  });
});

describe('supported combinations (ADR-0012 §3.4, pure)', () => {
  it('matches the activation × effect table', () => {
    const table: [ActivationKind, EffectKind, boolean][] = [
      ['instant', 'modifier', true],
      ['instant', 'dash', true],
      ['instant', 'shield', true],
      ['instant', 'barrier', false],
      ['passive', 'modifier', true],
      ['passive', 'dash', false],
      ['hold', 'reveal', true],
      ['hold', 'modifier', true],
      ['hold', 'damage', false],
      ['toggle', 'modifier', true],
      ['toggle', 'heal', false],
      ['placeable', 'barrier', true],
      ['placeable', 'damage', true],
      ['placeable', 'dash', false],
      ['thrown', 'heal', true],
      ['thrown', 'areaDenial', true],
      ['thrown', 'barrier', false],
      ['thrown', 'dash', false],
    ];
    for (const [activation, effect, supported] of table) expect(isCombinationSupported(activation, effect), `${activation} × ${effect}`).toBe(supported);
  });

  it('never reports an ability outside the table as supported', () => {
    const synthetic = (patch: Partial<AbilityDef>): AbilityDef => ({ ...getAbility('basalt_brace'), ...patch });
    expect(isAbilitySupported(synthetic({ effects: [{ kind: 'barrier', width: 1, height: 1 }] }))).toBe(false);
    const dash = getAbility('wisp_slipstream').effects;
    expect(isAbilitySupported(synthetic({ activation: { kind: 'passive' }, resource: { kind: 'none' }, effects: dash }))).toBe(false);
    expect(isAbilitySupported(getAbility('basalt_brace'))).toBe(true);
  });

  it('measures radii to the body axis, feet to the top of the stance', () => {
    const standing = { pos: vec3(0, 0, 0), stance: 0 };
    expect(bodyDistance(standing, vec3(3, 0, 0))).toBeCloseTo(3, 9); // a disc on the floor
    expect(bodyDistance(standing, vec3(0, 1.2, 2))).toBeCloseTo(2, 9); // a chest-height burst
    expect(bodyDistance({ pos: vec3(0, 4, 0), stance: 0 }, vec3(0, 0, 0))).toBeCloseTo(4, 9); // a floor 4 m above
    expect(bodyDistance({ pos: vec3(0, 0, 0), stance: 1 }, vec3(0, 1.5, 0))).toBeCloseTo(1.5 - CHARACTER.crouchHeight, 9);
  });
});
