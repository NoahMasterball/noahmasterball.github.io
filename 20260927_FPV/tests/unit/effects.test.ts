import { describe, expect, it } from 'vitest';
import { ABILITY_RULES, GUNPLAY, secondsToTicks, TICK_DT } from '../../src/config/sim.ts';
import { ABILITIES } from '../../src/data/abilities.ts';
import { getAbility, getOperator } from '../../src/data/content.ts';
import { SALTWORKS_LEVEL } from '../../src/data/levels/saltworks.ts';
import type { EffectDef } from '../../src/data/schema.ts';
import { areaEffectOf, areaSystem } from '../../src/sim/abilities/areas.ts';
import { areEffectsImplemented } from '../../src/sim/abilities/effects.ts';
import { gadgetShape, spawnGadget } from '../../src/sim/abilities/gadgets.ts';
import { gadgetSystem } from '../../src/sim/abilities/triggers.ts';
import { mitigatedDamage } from '../../src/sim/combat/damage.ts';
import { bodyDistance, zoneWorldCenter } from '../../src/sim/hitbox.ts';
import { vec3, type Vec3 } from '../../src/sim/math.ts';
import { ELIMINATION_RULES } from '../../src/sim/modes/elimination.ts';
import { damageTakenMultiplier, isRevealedTo, modifierProduct, shieldAmount } from '../../src/sim/stats.ts';
import { abilitySystem, expireEffects, hasActivation, type AbilityOf } from '../../src/sim/systems/abilities.ts';
import { applyDamage } from '../../src/sim/systems/health.ts';
import type { CharacterEntity, GadgetEntity } from '../../src/sim/types.ts';
import { abilityWorld, type AbilityWorld } from './support/abilityWorld.ts';
import { commandFor, ofType, SECONDS } from './support/world.ts';

// ADR-0012 batch E: one block per effect kind, applied directly through the effect registry
// (applyEffects via the abilityWorld harness) on a real PhysicsWorld in Node, independent of the
// activation controllers. Timed state (shields, reveals, area modifiers) expires in step 4
// (expireEffects, before the ability dispatcher), gadget triggers run in gadgetSystem and areas
// tick in areaSystem, so `tick` runs exactly those three steps of Sim.step.

const UP = vec3(0, 1, 0);

function placeable(id: string): AbilityOf<'placeable'> {
  const a = getAbility(id);
  if (!hasActivation(a, 'placeable')) throw new Error(`${id} must be placeable`);
  return a;
}

/** The first effect of `kind` in an ability's data. */
function effectOf<K extends EffectDef['kind']>(abilityId: string, kind: K): Extract<EffectDef, { kind: K }> {
  const effect = getAbility(abilityId).effects.find((e): e is Extract<EffectDef, { kind: K }> => e.kind === kind);
  if (!effect) throw new Error(`${abilityId} has no ${kind} effect`);
  return effect;
}

const BORE = effectOf('auger_bore', 'damage');
const MEND = effectOf('salve_mend', 'heal');
const OVERBRACE = effectOf('bracket_overbrace', 'shield');
const SONAR = effectOf('heron_sonar', 'reveal');
const FIREBREAK = effectOf('gorse_firebreak', 'areaDenial');
const BURRS = effectOf('thistle_burrs', 'areaDenial');
const LANCE = effectOf('kiln_lance', 'disableGadgets');

/** A gadget of `owner` at `pos` (no activation), indexed by a physics step. */
function place(w: AbilityWorld, owner: CharacterEntity, abilityId: string, pos: Vec3): GadgetEntity {
  const g = spawnGadget(w.ctx, owner, placeable(abilityId), { pos, yaw: 0, normal: UP });
  w.stepPhysics();
  return g;
}

/** `ticks` ticks of Sim.step's step 4 (expiry of modifiers, shields, reveals for every living
 *  character, then the ability dispatcher with an idle command), gadget triggers (5) and areas (6). */
function tick(w: AbilityWorld, ticks: number): void {
  const state = w.ctx.state;
  for (let i = 0; i < ticks; i++) {
    state.tick += 1;
    state.time = state.tick * TICK_DT;
    for (const e of state.entities) if (e.alive) expireEffects(e, TICK_DT);
    for (const e of state.entities) {
      if (!e.alive) continue;
      const cmd = commandFor(state.tick, e);
      abilitySystem(w.ctx, e, cmd, TICK_DT);
      e.lastButtons = cmd.buttons;
    }
    gadgetSystem(w.ctx, TICK_DT);
    areaSystem(w.ctx, TICK_DT);
  }
}

/** Kills `victim` outright (a lethal ability hit). */
function kill(w: AbilityWorld, attacker: CharacterEntity, victim: CharacterEntity): void {
  applyDamage(w.ctx, attacker, victim, {
    amount: 10_000,
    zone: 'torso',
    point: victim.pos,
    distance: 1,
    cause: { kind: 'ability', abilityId: 'auger_bore' },
    sourcePos: victim.pos,
  });
}

const maxHealth = (e: CharacterEntity): number => getOperator(e.operatorId).maxHealth;

describe('effect handlers are all implemented', () => {
  it('every effect kind of the roster has a working handler', () => {
    expect(areEffectsImplemented(ABILITIES.flatMap((a) => a.effects))).toBe(true);
  });

  it('these tests assume friendly fire is off', () => {
    expect(GUNPLAY.friendlyFire).toBe(false);
  });
});

describe('damage (Bore Charge)', () => {
  it('hits hostile characters in radius, mitigated (armour, damageTaken), cause ability, through walls', async () => {
    const w = await abilityWorld();
    w.stepPhysics();
    // Planted on the south face of the range's peek wall (z −9.8 … −10.2).
    const origin = vec3(-28, 1, -9.65);
    const auger = w.add('auger', 0, vec3(-29, 0, -8.5));
    const ally = w.add('wisp', 0, vec3(-27, 0, -8.5));
    const enemy = w.add('basalt', 1, vec3(-28, 0, -11)); // behind the wall
    const far = w.add('wisp', 1, vec3(-28, 0, -13));
    enemy.modifiers.push({ sourceId: 'basalt_brace', stats: { damageTaken: 0.6 }, remaining: 5 });
    expect(w.ctx.query.lineOfSight(origin, zoneWorldCenter(enemy, 'torso'))).toBe(false);
    expect(bodyDistance(far, origin)).toBeGreaterThan(BORE.radius);
    w.drain();

    const events = w.apply('auger_bore', auger, { origin });
    const expected = mitigatedDamage(BORE.amount, getOperator('basalt').armour, damageTakenMultiplier(enemy));
    expect(expected).toBeCloseTo(BORE.amount * (1 - getOperator('basalt').armour) * 0.6, 9);
    expect(ofType(events, 'hit')).toEqual([
      expect.objectContaining({
        attackerId: auger.id,
        victimId: enemy.id,
        zone: 'torso',
        damage: expected,
        point: zoneWorldCenter(enemy, 'torso'),
        sourcePos: origin,
        killed: false,
        absorbed: 0,
        cause: { kind: 'ability', abilityId: 'auger_bore' },
      }),
    ]);
    expect(enemy.health).toBeCloseTo(maxHealth(enemy) - expected, 9);
    // Friendly fire off: the user and its teammates are spared; out of radius nothing.
    expect([auger.health, ally.health, far.health]).toEqual([maxHealth(auger), maxHealth(ally), maxHealth(far)]);
  });

  it('scales with amountScale, reaches the struck character and kills with cause ability', async () => {
    const w = await abilityWorld();
    const auger = w.add('auger', 0, vec3(0, 0, 26));
    const near = w.add('wisp', 1, vec3(0, 0, 20));
    const struck = w.add('wisp', 1, vec3(10, 0, 20));
    w.drain();
    w.apply('auger_bore', auger, { origin: vec3(0, 0.5, 20), amountScale: 0.25, struck: struck.id });
    const quarter = mitigatedDamage(BORE.amount * 0.25, 0);
    expect(near.health).toBeCloseTo(maxHealth(near) - quarter, 9);
    expect(struck.health).toBeCloseTo(maxHealth(struck) - quarter, 9);

    const events = w.apply('auger_bore', auger, { origin: vec3(0, 0.5, 20) });
    expect(near.alive).toBe(false);
    expect(ofType(events, 'kill')).toEqual([
      expect.objectContaining({ attackerId: auger.id, victimId: near.id, cause: { kind: 'ability', abilityId: 'auger_bore' } }),
    ]);
  });

  it('damages hostile gadgets in radius (point distance), not own-team or distant ones', async () => {
    const w = await abilityWorld();
    const auger = w.add('auger', 0, vec3(0, 0, 26));
    const enemyKeel = w.add('keel', 1, vec3(5, 0, 26));
    const enemyLattice = w.add('lattice', 1, vec3(-5, 0, 26));
    const ownLattice = w.add('lattice', 0, vec3(-8, 0, 26));
    const barrier = place(w, enemyKeel, 'keel_breakwater', vec3(2, 0, 20));
    const node = place(w, enemyLattice, 'lattice_nodes', vec3(0, 0.15, 19));
    const distant = place(w, enemyLattice, 'lattice_nodes', vec3(0, 0.15, 16));
    const own = place(w, ownLattice, 'lattice_nodes', vec3(-1, 0.15, 20));
    w.drain();

    const events = w.apply('auger_bore', auger, { origin: vec3(0, 0.5, 20) });
    const cause = { kind: 'ability', abilityId: 'auger_bore' };
    expect(ofType(events, 'gadgetHit')).toEqual([
      expect.objectContaining({ gadgetId: barrier.id, attackerId: auger.id, amount: BORE.amount, cause }),
      expect.objectContaining({ gadgetId: node.id, attackerId: auger.id, amount: BORE.amount, cause }),
    ]);
    // No zones, armour or modifiers on gadgets; the node (30 health) is destroyed.
    expect(barrier.health).toBe(placeable('keel_breakwater').activation.gadgetHealth - BORE.amount);
    expect(ofType(events, 'gadgetDestroyed')).toEqual([expect.objectContaining({ gadgetId: node.id, attackerId: auger.id, cause })]);
    expect(w.ctx.state.gadgets).toEqual([barrier, distant, own]);
    expect([distant.health, own.health]).toEqual([30, 30]);
  });
});

describe('heal (Mend Dart)', () => {
  it('heals living allies in radius (the user included) up to max health, emits healed with the amount gained', async () => {
    const w = await abilityWorld();
    const origin = vec3(0, 0.5, 20);
    const salve = w.add('salve', 0, vec3(0, 0, 20));
    const hurt = w.add('basalt', 0, vec3(1, 0, 20));
    const full = w.add('wisp', 0, vec3(-1, 0, 20));
    const enemy = w.add('wisp', 1, vec3(0, 0, 21));
    const outside = w.add('wisp', 0, vec3(3, 0, 20));
    const dead = w.add('wisp', 0, vec3(0.5, 0, 19.5));
    salve.health = maxHealth(salve) - 30;
    hurt.health = 50;
    enemy.health = 50;
    outside.health = 50;
    kill(w, enemy, dead);
    w.drain();

    const events = w.apply('salve_mend', salve, { origin });
    expect(salve.health).toBe(maxHealth(salve)); // capped
    expect(hurt.health).toBe(50 + MEND.amount);
    expect([full.health, enemy.health, outside.health]).toEqual([maxHealth(full), 50, 50]);
    expect([dead.alive, dead.health]).toEqual([false, 0]); // never revives
    expect(ofType(events, 'healed')).toEqual([
      expect.objectContaining({ entityId: salve.id, abilityId: 'salve_mend', amount: 30, sourcePos: origin }),
      expect.objectContaining({ entityId: hurt.id, abilityId: 'salve_mend', amount: MEND.amount, sourcePos: origin }),
    ]);
  });

  it('reaches the struck ally outside the radius and scales with amountScale', async () => {
    const w = await abilityWorld();
    const salve = w.add('salve', 0, vec3(0, 0, 26));
    const struck = w.add('wisp', 0, vec3(10, 0, 20));
    struck.health = 10;
    w.drain();
    const events = w.apply('salve_mend', salve, { origin: vec3(0, 0.5, 20), struck: struck.id, amountScale: 0.5 });
    expect(struck.health).toBe(10 + MEND.amount * 0.5);
    expect(ofType(events, 'healed')).toEqual([expect.objectContaining({ entityId: struck.id, amount: MEND.amount * 0.5 })]);
  });
});

describe('shield (Overbrace)', () => {
  it('grants allies in radius a shield (shieldGained), refreshes to the max, absorbs before health and expires silently', async () => {
    const w = await abilityWorld();
    const bracket = w.add('bracket', 0, vec3(0, 0, 20));
    const ally = w.add('wisp', 0, vec3(3, 0, 20));
    const enemy = w.add('auger', 1, vec3(-3, 0, 20));
    const outside = w.add('wisp', 0, vec3(OVERBRACE.radius + 1, 0, 20));
    w.drain();

    const granted = w.apply('bracket_overbrace', bracket);
    const shield = { sourceId: 'bracket_overbrace', amount: OVERBRACE.amount, remaining: OVERBRACE.duration };
    expect([bracket.shields, ally.shields, enemy.shields, outside.shields]).toEqual([[shield], [shield], [], []]);
    expect(ofType(granted, 'shieldGained')).toEqual([
      expect.objectContaining({ entityId: bracket.id, abilityId: 'bracket_overbrace', amount: OVERBRACE.amount }),
      expect.objectContaining({ entityId: ally.id, abilityId: 'bracket_overbrace', amount: OVERBRACE.amount }),
    ]);

    // An enemy Bore Charge: the shield takes the mitigated damage first, the rest hits health.
    const bore = w.apply('auger_bore', enemy, { origin: vec3(3, 0.5, 21) });
    const damage = mitigatedDamage(BORE.amount, getOperator('wisp').armour);
    expect(ofType(bore, 'hit')).toEqual([expect.objectContaining({ victimId: ally.id, damage, absorbed: OVERBRACE.amount })]);
    expect(ofType(bore, 'shieldBroken')).toEqual([expect.objectContaining({ entityId: ally.id, abilityId: 'bracket_overbrace' })]);
    expect(ally.health).toBeCloseTo(maxHealth(ally) - (damage - OVERBRACE.amount), 9);
    expect(ally.shields).toEqual([]);

    // Refresh = max: a worn shield is topped up (gained = the difference), a full one only
    // gets its time back (silently).
    tick(w, SECONDS(3));
    const bracketShield = bracket.shields[0];
    if (!bracketShield) throw new Error('expected the user’s shield');
    bracketShield.amount = 12;
    const refreshed = w.apply('bracket_overbrace', bracket);
    expect(bracket.shields).toEqual([shield]);
    expect(ally.shields).toEqual([shield]);
    expect(ofType(refreshed, 'shieldGained')).toEqual([
      expect.objectContaining({ entityId: bracket.id, amount: OVERBRACE.amount - 12 }),
      expect.objectContaining({ entityId: ally.id, amount: OVERBRACE.amount }),
    ]);
    tick(w, SECONDS(1));
    expect(ofType(w.apply('bracket_overbrace', bracket), 'shieldGained')).toEqual([]);
    expect(bracket.shields[0]?.remaining).toBe(OVERBRACE.duration);

    // Expiry: the shield holds for its duration, then goes without shieldBroken or health loss.
    const health = bracket.health;
    w.drain();
    tick(w, SECONDS(OVERBRACE.duration) - 2);
    expect(shieldAmount(bracket)).toBe(OVERBRACE.amount);
    tick(w, 3);
    expect([bracket.shields, ally.shields]).toEqual([[], []]);
    expect(bracket.health).toBe(health);
    expect(ofType(w.drain(), 'shieldBroken')).toEqual([]);
  });
});

describe('reveal (Sonar Pulse)', () => {
  it('reveals enemies in the scaled radius to the user’s team only, once, through walls, until it expires', async () => {
    const w = await abilityWorld();
    w.stepPhysics();
    const heron = w.add('heron', 0, vec3(-28, 0, -3));
    const ally = w.add('wisp', 0, vec3(-26, 0, -3));
    const enemy = w.add('wisp', 1, vec3(-28, 0, -13)); // 10 m away, behind the peek wall
    const distant = w.add('basalt', 1, vec3(-28, 0, -3 - SONAR.radius - 1));
    expect(w.ctx.query.lineOfSight(vec3(-28, 1.5, -3), zoneWorldCenter(enemy, 'torso'))).toBe(false);
    w.drain();

    // A channel half way: the radius is scaled by it.
    w.apply('heron_sonar', heron, { radiusScale: 0.5, sustained: true });
    expect(enemy.reveals).toEqual([]);

    const first = w.apply('heron_sonar', heron, { radiusScale: 1, sustained: true });
    expect(enemy.reveals).toEqual([{ team: 0, sourceId: 'heron_sonar', remaining: SONAR.duration }]);
    expect([isRevealedTo(enemy, 0), isRevealedTo(enemy, 1)]).toEqual([true, false]);
    expect([ally.reveals, heron.reveals, distant.reveals]).toEqual([[], [], []]);
    expect(ofType(first, 'revealed')).toEqual([expect.objectContaining({ entityId: enemy.id, team: 0, abilityId: 'heron_sonar' })]);

    // Re-applied (every channel tick; another source): refreshed to the max, no second event.
    tick(w, SECONDS(1));
    expect(ofType(w.apply('heron_sonar', heron), 'revealed')).toEqual([]);
    expect(enemy.reveals[0]?.remaining).toBe(SONAR.duration);
    expect(ofType(w.apply('lattice_nodes', heron, { origin: vec3(-28, 0.15, -12) }), 'revealed')).toEqual([]);
    expect(enemy.reveals.map((r) => r.sourceId)).toEqual(['heron_sonar', 'lattice_nodes']);

    // The other team's reveal is its own: heron becomes visible to team 1 only.
    const counter = w.apply('heron_sonar', enemy);
    expect(ofType(counter, 'revealed').map((e) => [e.entityId, e.team])).toEqual([
      [heron.id, 1],
      [ally.id, 1],
    ]);
    expect([isRevealedTo(heron, 1), isRevealedTo(heron, 0)]).toEqual([true, false]);

    // Expiry: gone after the longest entry's duration; a new reveal is announced again.
    tick(w, SECONDS(3) + 1);
    expect([enemy.reveals, heron.reveals, isRevealedTo(enemy, 0)]).toEqual([[], [], false]);
    expect(ofType(w.apply('heron_sonar', heron), 'revealed')).toHaveLength(1);
  });
});

describe('areaDenial (Firebreak, Burr Mines, Slag Lance)', () => {
  it('spawns the area on the ground below the origin, or at the origin with no ground in reach', async () => {
    const w = await abilityWorld();
    const gorse = w.add('gorse', 0, vec3(0, 0, 26));
    const kiln = w.add('kiln', 0, vec3(4, 0, 26));
    w.drain();
    const nextId = w.ctx.state.nextId;
    expect(w.apply('gorse_firebreak', gorse, { origin: vec3(0, 1.5, 20) })).toEqual([]); // not an event
    const [area] = w.ctx.state.areas;
    if (!area) throw new Error('expected an area');
    expect(area).toMatchObject({ id: nextId, kind: 'area', abilityId: 'gorse_firebreak', effectIndex: 0, ownerId: gorse.id, team: 0 });
    expect(area.remaining).toBe(FIREBREAK.duration);
    expect(area.pos.x).toBe(0);
    expect(area.pos.y).toBeCloseTo(0, 5);
    expect(area.pos.z).toBe(20);

    w.apply('gorse_firebreak', gorse, { origin: vec3(0, ABILITY_RULES.area.maxDropM + 2, 10) });
    expect(w.ctx.state.areas[1]?.pos).toEqual(vec3(0, ABILITY_RULES.area.maxDropM + 2, 10));

    // Slag Lance's area is its second effect: the area names it (radius from data).
    w.apply('kiln_lance', kiln, { origin: vec3(10, 0.05, 20) });
    const lance = w.ctx.state.areas[2];
    if (!lance) throw new Error('expected the lance area');
    expect(lance.effectIndex).toBe(1);
    expect(areaEffectOf(lance)).toBe(getAbility('kiln_lance').effects[1]);
  });

  it('deals exactly damagePerSecond per second to hostile characters inside for its duration, then is gone', async () => {
    const w = await abilityWorld();
    const gorse = w.add('gorse', 0, vec3(0, 0, 21)); // inside its own fire
    const ally = w.add('wisp', 0, vec3(-1, 0, 20));
    const enemy = w.add('basalt', 1, vec3(1, 0, 20));
    const outside = w.add('wisp', 1, vec3(FIREBREAK.radius + 1, 0, 20));
    w.apply('gorse_firebreak', gorse, { origin: vec3(0, 0.05, 20) });
    const [area] = w.ctx.state.areas;
    if (!area) throw new Error('expected an area');
    w.drain();

    tick(w, SECONDS(1));
    const perSecond = mitigatedDamage(FIREBREAK.damagePerSecond, getOperator('basalt').armour);
    expect(enemy.health).toBeCloseTo(maxHealth(enemy) - perSecond, 9);
    const hits = ofType(w.drain(), 'hit');
    expect(hits).toHaveLength(SECONDS(1));
    expect(hits[0]).toMatchObject({ attackerId: gorse.id, victimId: enemy.id, sourcePos: area.pos, cause: { kind: 'ability', abilityId: 'gorse_firebreak' } });
    expect([gorse.health, ally.health, outside.health]).toEqual([maxHealth(gorse), maxHealth(ally), maxHealth(outside)]);
    expect(enemy.modifiers).toEqual([]); // no stats: no modifier

    // It acts on exactly secondsToTicks(duration) ticks.
    let steps = SECONDS(1);
    while (w.ctx.state.areas.length > 0 && steps < SECONDS(60)) {
      tick(w, 1);
      steps += 1;
    }
    expect(steps).toBe(secondsToTicks(FIREBREAK.duration));
    expect(enemy.health).toBeCloseTo(maxHealth(enemy) - perSecond * FIREBREAK.duration, 6);
    tick(w, SECONDS(1));
    expect(enemy.health).toBeCloseTo(maxHealth(enemy) - perSecond * FIREBREAK.duration, 6);
  });

  it('slows hostile characters while inside (not stacked across areas of one ability) and lets go right after leaving', async () => {
    const w = await abilityWorld();
    const thistle = w.add('thistle', 0, vec3(0, 0, 26));
    const enemy = w.add('wisp', 1, vec3(1, 0, 20));
    w.apply('thistle_burrs', thistle, { origin: vec3(0, 0.15, 20) });
    w.apply('thistle_burrs', thistle, { origin: vec3(0.5, 0.15, 20) }); // a second, overlapping mine
    expect(w.ctx.state.areas).toHaveLength(2);
    w.drain();

    tick(w, 1);
    expect(enemy.modifiers).toEqual([{ sourceId: 'thistle_burrs', stats: BURRS.stats, remaining: ABILITY_RULES.sustainSeconds }]);
    expect(modifierProduct(enemy, 'moveSpeed')).toBe(BURRS.stats.moveSpeed);
    tick(w, SECONDS(1));
    expect(modifierProduct(enemy, 'moveSpeed')).toBe(BURRS.stats.moveSpeed);
    expect(ofType(w.drain(), 'hit')).toEqual([]); // no damage per second: no hits

    enemy.pos = vec3(BURRS.radius + 2, 0, 20);
    tick(w, 1);
    expect(modifierProduct(enemy, 'moveSpeed')).toBe(BURRS.stats.moveSpeed); // lapses, not cut
    tick(w, secondsToTicks(ABILITY_RULES.sustainSeconds) + 1);
    expect(enemy.modifiers).toEqual([]);
    expect(modifierProduct(enemy, 'moveSpeed')).toBe(1);
  });

  it('needs a line of sight: no fire through the range peek wall', async () => {
    const w = await abilityWorld();
    w.stepPhysics();
    const gorse = w.add('gorse', 0, vec3(-24, 0, -4));
    const hidden = w.add('wisp', 1, vec3(-28, 0, -11)); // behind the wall
    const open = w.add('wisp', 1, vec3(-28, 0, -7));
    w.apply('gorse_firebreak', gorse, { origin: vec3(-28, 0.05, -9) });
    const [area] = w.ctx.state.areas;
    if (!area) throw new Error('expected an area');
    expect(bodyDistance(hidden, area.pos)).toBeLessThanOrEqual(FIREBREAK.radius);
    tick(w, SECONDS(1));
    expect(hidden.health).toBe(maxHealth(hidden));
    expect(open.health).toBeLessThan(maxHealth(open));
  });

  it('does not reach a floor 4 m above, even straight over the ring', async () => {
    const w = await abilityWorld();
    w.stepPhysics();
    const gorse = w.add('gorse', 0, vec3(6, 0, -55));
    // On top of the range's backstop berm (4 m high, face at z −60.5).
    const above = w.add('wisp', 1, vec3(0, 4, -61));
    w.apply('gorse_firebreak', gorse, { origin: vec3(0, 0.05, -59) });
    const [area] = w.ctx.state.areas;
    if (!area) throw new Error('expected an area');
    expect(Math.hypot(above.pos.x - area.pos.x, above.pos.z - area.pos.z)).toBeLessThan(FIREBREAK.radius);
    expect(bodyDistance(above, area.pos)).toBeGreaterThan(FIREBREAK.radius);
    tick(w, SECONDS(1));
    expect(above.health).toBe(maxHealth(above));
  });
});

describe('disableGadgets (Slag Lance)', () => {
  it('disables hostile gadgets in radius for its duration (max with a running one), not own-team or distant ones', async () => {
    const w = await abilityWorld();
    const kiln = w.add('kiln', 0, vec3(0, 0, 26));
    const enemy = w.add('lattice', 1, vec3(6, 0, 26));
    const enemyKeel = w.add('keel', 1, vec3(-6, 0, 26));
    const friend = w.add('lattice', 0, vec3(8, 0, 26));
    const near = place(w, enemy, 'lattice_nodes', vec3(1, 0.15, 20));
    const barrier = place(w, enemyKeel, 'keel_breakwater', vec3(0, 0, 18));
    const distant = place(w, enemy, 'lattice_nodes', vec3(0, 0.15, 20 + LANCE.radius + 1));
    const own = place(w, friend, 'lattice_nodes', vec3(-1, 0.15, 20));
    const origin = vec3(0, 0.05, 20);

    w.apply('kiln_lance', kiln, { origin });
    expect([near.disabled, barrier.disabled, distant.disabled, own.disabled]).toEqual([LANCE.duration, LANCE.duration, 0, 0]);

    near.disabled = 2;
    barrier.disabled = LANCE.duration + 3;
    w.apply('kiln_lance', kiln, { origin });
    expect([near.disabled, barrier.disabled]).toEqual([LANCE.duration, LANCE.duration + 3]);
  });

  it('stops a gadget’s trigger for the duration: a Burr Mine with an enemy on it stays quiet until then', async () => {
    const w = await abilityWorld();
    const thistle = w.add('thistle', 1, vec3(6, 0, 26));
    const kiln = w.add('kiln', 0, vec3(0.5, 0, 20)); // inside the mine's trigger radius
    const mine = place(w, thistle, 'thistle_burrs', vec3(0, 0.15, 20));
    w.apply('kiln_lance', kiln, { origin: vec3(0, 0.05, 20.5) });
    expect(mine.disabled).toBe(LANCE.duration);
    w.drain();

    tick(w, SECONDS(LANCE.duration) - 1);
    expect(w.ctx.state.gadgets).toEqual([mine]);
    expect(ofType(w.drain(), 'burst')).toEqual([]);
    tick(w, 3);
    expect(ofType(w.drain(), 'burst')).toEqual([expect.objectContaining({ source: 'gadget', sourceId: mine.id, abilityId: 'thistle_burrs' })]);
    expect(w.ctx.state.gadgets).toEqual([]);
  });
});

describe('barrier (Breakwater)', () => {
  it('applies nothing: the barrier is its gadget’s collider, shaped from the effect data', async () => {
    const w = await abilityWorld();
    const keel = w.add('keel', 0, vec3(0, 0, 20));
    const enemy = w.add('wisp', 1, vec3(1, 0, 20));
    w.drain();
    expect(w.apply('keel_breakwater', keel)).toEqual([]);
    expect([w.ctx.state.gadgets, w.ctx.state.areas, enemy.modifiers, enemy.health]).toEqual([[], [], [], maxHealth(enemy)]);
    const barrier = effectOf('keel_breakwater', 'barrier');
    expect(gadgetShape(getAbility('keel_breakwater'))).toEqual({
      kind: 'barrier',
      halfExtents: [barrier.width / 2, barrier.height / 2, ABILITY_RULES.barrier.thicknessM / 2],
    });
  });
});

describe('round reset', () => {
  it('clears areas, reveals, shields and area modifiers', async () => {
    const w = await abilityWorld(SALTWORKS_LEVEL);
    const m = ELIMINATION_RULES.initialMatch(w.ctx);
    if (m.mode !== 'elimination') throw new Error('expected an elimination match');
    w.ctx.state.match = m;
    const bracket = w.add('bracket', 0, vec3(0, 0, 27));
    const enemy = w.add('basalt', 1, vec3(0, 0, 23));
    w.apply('bracket_overbrace', bracket);
    w.apply('heron_sonar', bracket);
    w.apply('thistle_burrs', bracket, { origin: vec3(0, 0.15, 23) });
    tick(w, 1);
    expect([shieldAmount(bracket), isRevealedTo(enemy, 0), modifierProduct(enemy, 'moveSpeed'), w.ctx.state.areas.length]).toEqual([
      OVERBRACE.amount,
      true,
      BURRS.stats.moveSpeed,
      1,
    ]);

    m.phase = 'roundEnd';
    m.phaseEndTick = w.ctx.state.tick;
    ELIMINATION_RULES.tick(w.ctx, TICK_DT);
    expect(m.round).toBe(2);
    expect(w.ctx.state.areas).toEqual([]);
    for (const e of [bracket, enemy]) expect([e.shields, e.reveals, e.modifiers]).toEqual([[], [], []]);
  });
});
