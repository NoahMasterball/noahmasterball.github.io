import { describe, expect, it } from 'vitest';
import { ABILITY_RULES, CHARACTER, RANGE_MODE, secondsToTicks, TICK_DT } from '../../src/config/sim.ts';
import { ABILITIES, getAbility, getHitboxProfile, getOperator, OPERATORS } from '../../src/data/content.ts';
import { RANGE_LEVEL } from '../../src/data/levels/range.ts';
import { SALTWORKS_LEVEL } from '../../src/data/levels/saltworks.ts';
import { MODIFIABLE_STATS, type AbilityDef, type ActivationKind, type EffectDef, type EffectKind } from '../../src/data/schema.ts';
import { ABILITY_BUTTONS, BUTTON } from '../../src/sim/command.ts';
import { mitigatedDamage } from '../../src/sim/combat/damage.ts';
import { bodyDistance, partWorldCenter, zoneWorldCenter } from '../../src/sim/hitbox.ts';
import { distance, rightFromYaw, vec3, type Vec3 } from '../../src/sim/math.ts';
import { roundSpawnOptions, type RosterEntry } from '../../src/sim/modes/format.ts';
import { Sim } from '../../src/sim/sim.ts';
import { activeWeapon, currentSpread, isRevealedTo, modifierProduct, shieldAmount, topSpeed, weaponBlockedBy } from '../../src/sim/stats.ts';
import { hasActivation, type AbilityOf } from '../../src/sim/systems/abilities.ts';
import { aimOf } from '../../src/sim/systems/weapons.ts';
import type { AbilityState, CharacterEntity, GadgetEntity, SimEvent } from '../../src/sim/types.ts';
import { lookAt, placementInputs, throwLook } from './support/abilityInput.ts';
import { EAST, ofType, run, SECONDS, world, type EventOf, type Input } from './support/world.ts';

// ADR-0012 batch R: every ability of the roster end to end on the real Sim in Node — pressed,
// placed, thrown or channelled through Commands like a player or bot does it, with its data
// outcome observed in state and events (not in the handlers' inputs, which the per-batch tests
// cover). One case per ability id: an ability without a case fails. Plus the round-reset
// clean-up of world objects in a real elimination round.

// ── Geometry and helpers ────────────────────────────────────────────────────

const ALLY = RANGE_MODE.playerTeam;
const ENEMY = RANGE_MODE.dummyTeam;
/** Look yaws (radians; 0 looks down −Z, EAST down +X). */
const NORTH = 0;
const SOUTH = Math.PI;
const WEST = Math.PI / 2;

function ability<K extends ActivationKind>(id: string, kind: K): AbilityOf<K> {
  const a = getAbility(id);
  if (!hasActivation(a, kind)) throw new Error(`${id} must be a ${kind} ability`);
  return a;
}

/** The first effect of `kind` in `abilityId`'s data. */
function effectOf<K extends EffectKind>(abilityId: string, kind: K): Extract<EffectDef, { kind: K }> {
  const effect = getAbility(abilityId).effects.find((e): e is Extract<EffectDef, { kind: K }> => e.kind === kind);
  if (!effect) throw new Error(`${abilityId} has no ${kind} effect`);
  return effect;
}

function cooldownOf(a: AbilityDef): number {
  if (a.resource.kind !== 'cooldown') throw new Error(`${a.id} must have a cooldown`);
  return a.resource.cooldown;
}

function usesOf(a: AbilityDef): number {
  if (a.resource.kind !== 'uses') throw new Error(`${a.id} must have uses per round`);
  return a.resource.usesPerRound;
}

function maxChargesOf(a: AbilityDef): number {
  if (a.resource.kind !== 'charges') throw new Error(`${a.id} must have charges`);
  return a.resource.maxCharges;
}

/** The operator that carries `abilityId`, the slot it sits in and that slot's key. */
function carrier(abilityId: string): { operatorId: string; slot: number; key: number } {
  for (const op of OPERATORS) {
    const slot = op.abilities.indexOf(abilityId);
    const key = ABILITY_BUTTONS[slot];
    if (slot >= 0 && key !== undefined) return { operatorId: op.id, slot, key };
  }
  throw new Error(`No operator carries ${abilityId} in a keyed slot`);
}

function slotOf(e: CharacterEntity, index: number): AbilityState {
  const slot = e.abilities[index];
  if (!slot) throw new Error(`${e.operatorId} has no ability slot ${index}`);
  return slot;
}

function only<T>(items: readonly T[]): T {
  expect(items).toHaveLength(1);
  const [item] = items;
  if (item === undefined) throw new Error('expected exactly one item');
  return item;
}

/** A range with `abilityId`'s carrier as the player (team ALLY) at `position`, settled. */
async function rangeWith(
  abilityId: string,
  position: Vec3,
  yaw: number,
): Promise<{ sim: Sim; user: CharacterEntity; slot: AbilityState; key: number }> {
  const c = carrier(abilityId);
  const { sim, player } = await world(c.operatorId, position, yaw);
  return { sim, user: player, slot: slotOf(player, c.slot), key: c.key };
}

/** Another character (a bot nobody drives) at `position`, settled onto the floor. */
function add(sim: Sim, operatorId: string, team: number, position: Vec3, yaw: number): CharacterEntity {
  const e = sim.spawnCharacter({ operatorId, team, controller: 'bot', position, yaw });
  run(sim, e, 10);
  return e;
}

const torso = (e: CharacterEntity): Vec3 => zoneWorldCenter(e, 'torso');
const speedOf = (e: CharacterEntity): number => Math.hypot(e.vel.x, e.vel.z);
const maxHealthOf = (e: CharacterEntity): number => getOperator(e.operatorId).maxHealth;

/** Aims down sights at `point` until recoil and bloom have settled, then fires once; returns the
 *  firing tick's events. */
function shootAt(sim: Sim, shooter: CharacterEntity, point: Vec3): SimEvent[] {
  run(sim, shooter, SECONDS(1.5), { ...lookAt(shooter, point), buttons: BUTTON.ads });
  return run(sim, shooter, 1, { ...lookAt(shooter, point), buttons: BUTTON.ads | BUTTON.fire });
}

/** Places the gadget of `key`'s slot with the crosshair on `point`: open, confirm with fire,
 *  release. Returns the events and the placed gadget. */
function place(sim: Sim, e: CharacterEntity, key: number, point: Vec3): { events: SimEvent[]; gadget: GadgetEntity } {
  const events = placementInputs(lookAt(e, point), key).flatMap((input) => run(sim, e, 1, input));
  const placed = only(ofType(events, 'gadgetPlaced'));
  const gadget = sim.state.gadgets.find((g) => g.id === placed.gadgetId);
  if (!gadget) throw new Error(`${e.operatorId}'s gadget is not in the world`);
  return { events, gadget };
}

/** Throws `abilityId` (the slot of `key`) along the low arc that lands on `point` (ballisticPitch
 *  from the eye, the crosshair on it); returns the press tick's events. */
function throwAt(sim: Sim, e: CharacterEntity, abilityId: string, key: number, point: Vec3): SimEvent[] {
  return run(sim, e, 1, { ...throwLook(e, ability(abilityId, 'thrown'), point), buttons: key });
}

/** Steps with `input` held for `e` (everyone else idle) until a tick's events satisfy `done`;
 *  returns every event. Throws after `maxTicks`. */
function runUntil(sim: Sim, e: CharacterEntity, input: Input, done: (tick: SimEvent[]) => boolean, maxTicks: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < maxTicks; i++) {
    const tick = run(sim, e, 1, input);
    events.push(...tick);
    if (done(tick)) return events;
  }
  throw new Error(`condition not met within ${maxTicks} ticks`);
}

/** Walks `e` forward along `yaw` until `arrived()` (checked after every tick); returns the events. */
function walkUntil(sim: Sim, e: CharacterEntity, yaw: number, arrived: () => boolean, maxTicks: number): SimEvent[] {
  const events: SimEvent[] = [];
  for (let i = 0; i < maxTicks && !arrived(); i++) events.push(...run(sim, e, 1, { yaw, pitch: 0, moveZ: 1 }));
  if (!arrived()) throw new Error(`${e.operatorId} did not arrive within ${maxTicks} ticks`);
  return events;
}

const burstsOf = (events: readonly SimEvent[], sourceId: number): EventOf<'burst'>[] =>
  ofType(events, 'burst').filter((b) => b.sourceId === sourceId);

// ── Barriers (Breakwater, Scaffold Screen) ──────────────────────────────────

/** A barrier placed through commands blocks sight and a shot at the placer behind it and stops an
 *  enemy walking into it; bullets destroy it, after which sight, the shot and the passage are free. */
async function barrierCase(id: string): Promise<void> {
  const barrier = effectOf(id, 'barrier');
  const kit = ability(id, 'placeable');
  const { sim, user: placer, slot, key } = await rangeWith(id, vec3(-30, 0, 27), NORTH);
  const enemy = add(sim, 'basalt', ENEMY, vec3(-30, 0, 20), SOUTH);

  const { events: placing, gadget: g } = place(sim, placer, key, vec3(-30, 0, 25));
  expect(only(ofType(placing, 'ability'))).toMatchObject({ entityId: placer.id, abilityId: id });
  expect(g).toMatchObject({ abilityId: id, ownerId: placer.id, team: placer.team, health: kit.activation.gadgetHealth });
  expect(slot.resource.usesLeft).toBe(usesOf(kit) - 1);

  // Sight across it at half its height is blocked.
  const half = barrier.height / 2;
  const front = vec3(g.pos.x, g.pos.y + half, g.pos.z - 1);
  const back = vec3(g.pos.x, g.pos.y + half, g.pos.z + 1);
  expect(sim.query.lineOfSight(front, back)).toBe(false);

  // A shot at the placer's leg behind it ends in the barrier.
  const profile = getHitboxProfile(getOperator(placer.operatorId).hitboxProfile);
  const behind = partWorldCenter(profile, placer.stance, placer.pos, placer.yaw, 'legL');
  expect(behind.y).toBeLessThan(barrier.height);
  const blocked = shootAt(sim, enemy, behind);
  expect(ofType(blocked, 'hit')).toEqual([]);
  expect(only(ofType(blocked, 'gadgetHit'))).toMatchObject({ gadgetId: g.id, attackerId: enemy.id });

  // Walking into it stops at its face.
  run(sim, enemy, SECONDS(1.5), { yaw: SOUTH, pitch: 0, moveZ: 1 });
  const face = g.pos.z - ABILITY_RULES.barrier.thicknessM / 2 - CHARACTER.radius;
  expect(enemy.pos.z).toBeLessThan(face + 0.01);
  expect(enemy.pos.z).toBeGreaterThan(face - 0.1);

  // Bullets destroy it (recoil compensated, point blank).
  const centre = vec3(g.pos.x, g.pos.y + half, g.pos.z);
  const firing: SimEvent[] = [];
  for (let i = 0; i < SECONDS(10) && ofType(firing, 'gadgetDestroyed').length === 0; i++) {
    firing.push(...run(sim, enemy, 1, { ...lookAt(enemy, centre), buttons: BUTTON.fire }));
  }
  const taken = ofType([...blocked, ...firing], 'gadgetHit').reduce((sum, h) => sum + h.amount, 0);
  expect(taken).toBeGreaterThanOrEqual(kit.activation.gadgetHealth);
  expect(only(ofType(firing, 'gadgetDestroyed'))).toMatchObject({
    gadgetId: g.id,
    abilityId: id,
    ownerId: placer.id,
    attackerId: enemy.id,
    cause: { kind: 'weapon', weaponId: activeWeapon(enemy).weaponId },
  });
  expect(ofType(firing, 'hit')).toEqual([]);
  expect(sim.state.gadgets).toEqual([]);
  // Sight answers for the colliders of the last physics step (ADR-0012 §4.3): clear after the next.
  run(sim, enemy, 1);
  expect(sim.query.lineOfSight(front, back)).toBe(true);

  // Gone: the same shot reaches the placer, and the enemy walks through.
  expect(only(ofType(shootAt(sim, enemy, behind), 'hit'))).toMatchObject({ attackerId: enemy.id, victimId: placer.id });
  run(sim, enemy, SECONDS(0.5), { yaw: SOUTH, pitch: 0, moveZ: 1 });
  expect(enemy.pos.z).toBeGreaterThan(g.pos.z + ABILITY_RULES.barrier.thicknessM / 2 + CHARACTER.radius);
}

// ── One case per ability ────────────────────────────────────────────────────

type RosterCase = () => Promise<void>;

const CASES: Readonly<Record<string, RosterCase>> = {
  /** Instant self modifier: damage taken drops by the data factor for its duration. */
  basalt_brace: async () => {
    const id = 'basalt_brace';
    const brace = effectOf(id, 'modifier');
    const { sim, user: basalt, key } = await rangeWith(id, vec3(-30, 0, 20), SOUTH);
    const heron = add(sim, 'heron', ENEMY, vec3(-30, 0, 26), NORTH);
    const torsoShot = (): EventOf<'hit'> => {
      const hit = only(ofType(shootAt(sim, heron, torso(basalt)), 'hit'));
      expect(hit).toMatchObject({ attackerId: heron.id, victimId: basalt.id, zone: 'torso', killed: false });
      return hit;
    };

    const plain = torsoShot();
    expect(only(ofType(run(sim, basalt, 1, { buttons: key }), 'ability'))).toMatchObject({ entityId: basalt.id, abilityId: id, slot: 0 });
    const braced = torsoShot();
    expect(braced.damage).toBeCloseTo(plain.damage * (brace.stats.damageTaken ?? 1), 9);
    expect(braced.damage).toBeLessThan(plain.damage);

    run(sim, basalt, SECONDS(brace.duration));
    expect(basalt.modifiers.some((m) => m.sourceId === id)).toBe(false);
    expect(torsoShot().damage).toBeCloseTo(plain.damage, 9);
  },

  keel_breakwater: () => barrierCase('keel_breakwater'),
  bracket_screen: () => barrierCase('bracket_screen'),

  /** Toggle: on → rooted with the data's stats and still shooting; off → abilityEnd, cooldown, moves. */
  cairn_piton: async () => {
    const id = 'cairn_piton';
    const mount = effectOf(id, 'modifier');
    const { sim, user: cairn, slot, key } = await rangeWith(id, vec3(-35, 0, 25), EAST);

    expect(only(ofType(run(sim, cairn, 1, { buttons: key }), 'ability'))).toMatchObject({ entityId: cairn.id, abilityId: id });
    expect(slot.active?.kind).toBe('on');
    const start = { ...cairn.pos };
    const mounted = run(sim, cairn, SECONDS(1), { moveZ: 1 });
    expect(Math.hypot(cairn.pos.x - start.x, cairn.pos.z - start.z)).toBeLessThan(1e-4);
    for (const stat of MODIFIABLE_STATS) expect(modifierProduct(cairn, stat), stat).toBe(mount.stats[stat] ?? 1);
    expect(ofType(mounted, 'abilityEnd')).toEqual([]); // never ends by itself
    // Mounted Cairn still shoots: toggles never block the weapon.
    expect(weaponBlockedBy(cairn)).toBeNull();
    expect(ofType(run(sim, cairn, 1, { buttons: BUTTON.fire }), 'shot')).toHaveLength(1);

    const off = run(sim, cairn, 1, { buttons: key });
    expect(only(ofType(off, 'abilityEnd'))).toMatchObject({ entityId: cairn.id, abilityId: id, slot: 0, reason: 'toggledOff' });
    expect(slot.active).toBeNull();
    expect(slot.resource.timer).toBe(cooldownOf(getAbility(id))); // the cooldown starts when switched off
    const from = { ...cairn.pos };
    run(sim, cairn, SECONDS(1), { moveZ: 1 });
    expect(Math.hypot(cairn.pos.x - from.x, cairn.pos.z - from.z)).toBeGreaterThan(topSpeed(cairn) * 0.5);
  },

  /** Instant dash along the move input: exactly its distance, one charge spent. */
  wisp_slipstream: async () => {
    const id = 'wisp_slipstream';
    const dash = effectOf(id, 'dash');
    const { sim, user: wisp, slot, key } = await rangeWith(id, vec3(-30, 0, 25), NORTH);
    const charges = slot.resource.charges;
    const start = { ...wisp.pos };
    expect(ofType(run(sim, wisp, 1, { moveX: 1, buttons: key }), 'ability')).toHaveLength(1); // strafing right
    expect(slot.resource.charges).toBe(charges - 1);
    for (let i = 0; i < SECONDS(dash.duration) + 2 && wisp.dash; i++) run(sim, wisp, 1);
    expect(wisp.dash).toBeNull();
    const right = rightFromYaw(NORTH);
    const dx = wisp.pos.x - start.x;
    const dz = wisp.pos.z - start.z;
    expect(dx * right.x + dz * right.z).toBeCloseTo(dash.distance, 1);
    expect(Math.abs(dx * right.z - dz * right.x)).toBeLessThan(1e-3);
  },

  /** Instant upward dash: rises exactly its distance, lands again. */
  kestrel_updraft: async () => {
    const id = 'kestrel_updraft';
    const dash = effectOf(id, 'dash');
    const { sim, user: kestrel, key } = await rangeWith(id, vec3(-30, 0, 25), EAST);
    const startY = kestrel.pos.y;
    expect(ofType(run(sim, kestrel, 1, { buttons: key }), 'ability')).toHaveLength(1);
    let apex = kestrel.pos.y;
    for (let i = 0; i < SECONDS(dash.duration + 1); i++) {
      run(sim, kestrel, 1);
      apex = Math.max(apex, kestrel.pos.y);
    }
    expect(apex - startY).toBeCloseTo(dash.distance, 2);
    expect(kestrel.grounded).toBe(true);
  },

  /** Passive: every footstep is quieter by the data factor; the key does nothing; never expires. */
  kestrel_lightfoot: async () => {
    const id = 'kestrel_lightfoot';
    const quiet = effectOf(id, 'modifier').stats.footstepVolume;
    const { sim, user: kestrel, key } = await rangeWith(id, vec3(-35, 0, 25), EAST);
    const wisp = add(sim, 'wisp', ALLY, vec3(-35, 0, 29), EAST); // a speedster without the passive
    const loudness = (e: CharacterEntity): number[] => {
      const steps = ofType(run(sim, e, SECONDS(2), { moveZ: 1 }), 'footstep').filter((f) => f.entityId === e.id);
      expect(steps.length).toBeGreaterThan(2);
      return [...new Set(steps.map((f) => f.loudness))];
    };
    expect(loudness(wisp)).toEqual([1]);
    expect(loudness(kestrel)).toEqual([quiet]);

    const pressed = run(sim, kestrel, 1, { buttons: key });
    expect(pressed.filter((e) => e.type === 'ability' || e.type === 'abilityFailed' || e.type === 'abilityEnd')).toEqual([]);
    expect(kestrel.modifiers.find((m) => m.sourceId === id)?.remaining).toBe(Infinity);
  },

  /** Instant self modifier: faster by the data factor, wider spread, both only for its duration. */
  mayfly_overclock: async () => {
    const id = 'mayfly_overclock';
    const clock = effectOf(id, 'modifier');
    const { sim, user: mayfly, key } = await rangeWith(id, vec3(-38, 0, 25), EAST);
    const spread = currentSpread(mayfly);
    run(sim, mayfly, SECONDS(1), { moveZ: 1 });
    const normal = speedOf(mayfly);
    expect(normal).toBeCloseTo(topSpeed(mayfly), 6);

    expect(ofType(run(sim, mayfly, 1, { moveZ: 1, buttons: key }), 'ability')).toHaveLength(1);
    run(sim, mayfly, SECONDS(1), { moveZ: 1 });
    expect(speedOf(mayfly)).toBeCloseTo(normal * (clock.stats.moveSpeed ?? 1), 6);
    run(sim, mayfly, SECONDS(0.5)); // standing still: no movement spread
    expect(speedOf(mayfly)).toBe(0);
    expect(currentSpread(mayfly)).toBeCloseTo(spread * (clock.stats.spread ?? 1), 9);

    run(sim, mayfly, SECONDS(clock.duration));
    expect(currentSpread(mayfly)).toBeCloseTo(spread, 9);
    run(sim, mayfly, SECONDS(1), { moveZ: 1 });
    expect(speedOf(mayfly)).toBeCloseTo(normal, 6);
  },

  /** Timer charge on a wall: after its delay it damages the enemy behind the wall in radius (and
   *  kills it with cause ability), nobody farther away, no teammate. */
  auger_bore: async () => {
    const id = 'auger_bore';
    const kit = ability(id, 'placeable');
    const blast = effectOf(id, 'damage');
    const trigger = kit.activation.trigger;
    if (trigger.kind !== 'timer') throw new Error(`${id} must have a timer trigger`);
    // South of the range's doorway wall (its south face at z = −9.8), the charge on that face.
    const { sim, user: auger, key } = await rangeWith(id, vec3(-28, 0, -8.6), NORTH);
    const behind = add(sim, 'wisp', ENEMY, vec3(-28, 0, -11.2), SOUTH);
    const far = add(sim, 'wisp', ENEMY, vec3(-28, 0, -13), SOUTH);
    const mate = add(sim, 'wisp', ALLY, vec3(-26.4, 0, -8.6), NORTH);

    const { events: placing, gadget: charge } = place(sim, auger, key, vec3(-28, aimOf(auger).origin.y, -9.8));
    expect(charge.normal.z).toBeCloseTo(1, 5); // on the wall
    expect(sim.query.lineOfSight(charge.pos, torso(behind))).toBe(false);
    expect(bodyDistance(behind, charge.pos)).toBeLessThanOrEqual(blast.radius);
    expect(bodyDistance(mate, charge.pos)).toBeLessThanOrEqual(blast.radius);
    expect(bodyDistance(far, charge.pos)).toBeGreaterThan(blast.radius);

    const events = run(sim, auger, SECONDS(trigger.delay + 0.5));
    const burst = only(ofType(events, 'burst'));
    expect(burst).toMatchObject({ source: 'gadget', sourceId: charge.id, abilityId: id, ownerId: auger.id });
    expect(burst.tick - only(ofType(placing, 'gadgetPlaced')).tick).toBe(secondsToTicks(trigger.delay));
    expect(sim.state.gadgets).toEqual([]);

    const damage = mitigatedDamage(blast.amount, getOperator(behind.operatorId).armour);
    const cause = { kind: 'ability', abilityId: id };
    expect(only(ofType(events, 'hit'))).toMatchObject({ attackerId: auger.id, victimId: behind.id, damage, cause, sourcePos: charge.pos });
    expect(behind.health).toBe(Math.max(0, maxHealthOf(behind) - damage));
    expect(ofType(events, 'kill')).toEqual(behind.alive ? [] : [expect.objectContaining({ attackerId: auger.id, victimId: behind.id, cause })]);
    for (const spared of [far, mate, auger]) expect(spared.health, spared.operatorId).toBe(maxHealthOf(spared));
  },

  /** Impact throw: disables an enemy Burr Mine (it stays quiet under Kiln for the duration, then
   *  fires) and leaves a burning area that hurts only enemies for exactly its duration. */
  kiln_lance: async () => {
    const id = 'kiln_lance';
    const disable = effectOf(id, 'disableGadgets');
    const fire = effectOf(id, 'areaDenial');
    const { sim, user: kiln, slot, key } = await rangeWith(id, vec3(-30, 0, 14), SOUTH);
    const thistle = add(sim, 'thistle', ENEMY, vec3(-30, 0, 25), NORTH);
    const burning = add(sim, 'wisp', ENEMY, vec3(-29, 0, 22.8), NORTH);
    const { gadget: mine } = place(sim, thistle, carrier('thistle_burrs').key, vec3(-30, 0, 22.8));

    const charges = slot.resource.charges;
    const events = throwAt(sim, kiln, id, key, mine.pos);
    expect(only(ofType(events, 'ability'))).toMatchObject({ entityId: kiln.id, abilityId: id });
    expect(slot.resource.charges).toBe(charges - 1);
    events.push(...runUntil(sim, kiln, {}, (tick) => ofType(tick, 'burst').length > 0, SECONDS(2)));
    const burst = only(ofType(events, 'burst'));
    expect(burst).toMatchObject({ source: 'projectile', abilityId: id, ownerId: kiln.id });
    expect(distance(burst.pos, mine.pos)).toBeLessThanOrEqual(disable.radius);
    expect(mine.disabled).toBe(disable.duration);
    const area = only(sim.state.areas);
    expect(area).toMatchObject({ abilityId: id, ownerId: kiln.id, team: kiln.team, remaining: fire.duration });
    expect(area.pos.y).toBeCloseTo(0, 3); // dropped onto the floor below the burst

    // Kiln walks through the fire onto the disabled mine: nothing, until the disable runs out.
    events.push(...walkUntil(sim, kiln, SOUTH, () => kiln.pos.z >= 22, SECONDS(4)));
    expect(bodyDistance(kiln, mine.pos)).toBeLessThan(1);
    events.push(...runUntil(sim, kiln, {}, (tick) => burstsOf(tick, mine.id).length > 0, SECONDS(disable.duration + 1)));
    const mineBurst = only(burstsOf(events, mine.id));
    expect(mineBurst.tick - burst.tick).toBeGreaterThanOrEqual(secondsToTicks(disable.duration));
    expect(mineBurst.tick - burst.tick).toBeLessThanOrEqual(secondsToTicks(disable.duration) + 2);
    expect(ofType(events, 'revealed')).toEqual([expect.objectContaining({ entityId: kiln.id, team: thistle.team, tick: mineBurst.tick })]);

    // The fire burned only the enemy standing in it, for exactly its duration.
    const hits = ofType(events, 'hit');
    expect(hits.length).toBe(secondsToTicks(fire.duration));
    for (const h of hits) expect(h).toMatchObject({ attackerId: kiln.id, victimId: burning.id, cause: { kind: 'ability', abilityId: id } });
    const dealt = hits.reduce((sum, h) => sum + h.damage, 0);
    expect(dealt).toBeCloseTo(mitigatedDamage(fire.damagePerSecond * fire.duration, getOperator(burning.operatorId).armour), 6);
    expect(sim.state.areas.some((a) => a.abilityId === id)).toBe(false);
    for (const spared of [kiln, thistle]) expect(spared.health, spared.operatorId).toBe(maxHealthOf(spared));
  },

  /** Aura sensor: an enemy walking by is revealed to the placer's team as it enters the radius,
   *  stays revealed while inside and for the reveal's duration after; a teammate never is. */
  lattice_nodes: async () => {
    const id = 'lattice_nodes';
    const sense = effectOf(id, 'reveal');
    const { sim, user: lattice, key } = await rangeWith(id, vec3(-30, 0, 25), NORTH);
    const { gadget: node } = place(sim, lattice, key, vec3(-30, 0, 22.8));
    const mate = add(sim, 'wisp', ALLY, vec3(-36, 0, 21.5), EAST);
    const enemy = add(sim, 'wisp', ENEMY, vec3(-38, 0, 20.3), EAST);
    const inside = (feet: Vec3): boolean => bodyDistance({ pos: feet, stance: 0 }, node.pos) <= sense.radius;

    const matePass = walkUntil(sim, mate, EAST, () => mate.pos.x >= -24, SECONDS(4));
    expect(ofType(matePass, 'revealed')).toEqual([]);

    // The aura (step 5) sees each tick the position the enemy had before that tick's move.
    const events: SimEvent[] = [];
    let firstInside = -1;
    let lastInside = -1;
    for (let i = 0; i < SECONDS(5) && enemy.pos.x < -22; i++) {
      const feet = { ...enemy.pos };
      events.push(...run(sim, enemy, 1, { yaw: EAST, pitch: 0, moveZ: 1 }));
      if (!inside(feet)) continue;
      if (firstInside < 0) firstInside = sim.state.tick;
      lastInside = sim.state.tick;
      expect(isRevealedTo(enemy, lattice.team)).toBe(true);
    }
    expect(enemy.pos.x).toBeGreaterThanOrEqual(-22);
    expect(firstInside).toBeGreaterThan(0);
    expect(inside(enemy.pos)).toBe(false);
    expect(only(ofType(events, 'revealed'))).toMatchObject({ entityId: enemy.id, team: lattice.team, abilityId: id, tick: firstInside });

    const lingering = runUntil(sim, enemy, {}, () => !isRevealedTo(enemy, lattice.team), SECONDS(sense.duration + 1));
    expect(sim.state.tick - lastInside).toBe(secondsToTicks(sense.duration));
    expect(ofType(lingering, 'revealed')).toEqual([]);
    expect(isRevealedTo(mate, lattice.team)).toBe(false);
    expect(sim.state.gadgets).toEqual([node]); // an aura is never consumed
  },

  /** Channel: the weapon is blocked; the reveal ring grows to its radius over maxDuration and
   *  reveals the enemy inside it (on the tick the ring reaches it), never the one beyond. */
  heron_sonar: async () => {
    const id = 'heron_sonar';
    const { maxDuration } = ability(id, 'hold').activation;
    const ring = effectOf(id, 'reveal');
    const { sim, user: heron, key } = await rangeWith(id, vec3(10, 0, 25), WEST);
    const near = add(sim, 'wisp', ENEMY, vec3(0, 0, 25), EAST);
    const beyond = add(sim, 'wisp', ENEMY, vec3(8 - ring.radius, 0, 25), EAST);
    add(sim, 'wisp', ALLY, vec3(5, 0, 25), WEST);
    expect(bodyDistance(beyond, heron.pos)).toBeGreaterThan(ring.radius);

    const events = run(sim, heron, 1, { buttons: key });
    const pressTick = sim.state.tick;
    expect(only(ofType(events, 'ability'))).toMatchObject({ entityId: heron.id, abilityId: id });
    const blocked = run(sim, heron, SECONDS(1), { buttons: key | BUTTON.fire | BUTTON.ads });
    expect(ofType(blocked, 'shot')).toEqual([]);
    expect(heron.weapon.ads).toBe(0);
    expect(weaponBlockedBy(heron)).toBe('channel');
    events.push(...blocked, ...runUntil(sim, heron, { buttons: key }, (tick) => ofType(tick, 'abilityEnd').length > 0, SECONDS(maxDuration)));
    const end = only(ofType(events, 'abilityEnd'));
    expect(end).toMatchObject({ entityId: heron.id, abilityId: id, reason: 'maxDuration' });
    expect(end.tick - pressTick).toBe(secondsToTicks(maxDuration));

    // Revealed on the first tick the ring (radius × elapsed / maxDuration) reaches its body.
    const revealed = only(ofType(events, 'revealed'));
    expect(revealed).toMatchObject({ entityId: near.id, team: heron.team, abilityId: id });
    const reachTicks = Math.ceil(((bodyDistance(near, heron.pos) / ring.radius) * maxDuration) / TICK_DT);
    expect(Math.abs(revealed.tick - pressTick - reachTicks)).toBeLessThanOrEqual(1);
    expect(isRevealedTo(beyond, heron.team)).toBe(false);

    // The reveal outlasts the channel by exactly its duration; the weapon is free again.
    runUntil(sim, heron, {}, () => !isRevealedTo(near, heron.team), SECONDS(ring.duration + 1));
    expect(sim.state.tick - end.tick).toBe(secondsToTicks(ring.duration));
    expect(ofType(run(sim, heron, 1, { buttons: BUTTON.fire }), 'shot')).toHaveLength(1);
  },

  /** Impact throw at a hurt ally: heals it by the data amount (capped); an enemy inside the
   *  radius is not healed. */
  salve_mend: async () => {
    const id = 'salve_mend';
    const mend = effectOf(id, 'heal');
    const { sim, user: salve, slot, key } = await rangeWith(id, vec3(-30, 0, 30), NORTH);
    const mate = add(sim, 'basalt', ALLY, vec3(-30, 0, 22), EAST);
    const enemy = add(sim, 'heron', ENEMY, vec3(-28.8, 0, 22), WEST);
    // Both hurt: they trade a shot at point blank.
    expect(ofType(shootAt(sim, enemy, torso(mate)), 'hit')).toHaveLength(1);
    expect(ofType(shootAt(sim, mate, torso(enemy)), 'hit')).toHaveLength(1);
    const mateHealth = mate.health;
    const enemyHealth = enemy.health;
    const expected = Math.min(mend.amount, maxHealthOf(mate) - mateHealth);
    expect(expected).toBeGreaterThan(0);
    expect(enemyHealth).toBeLessThan(maxHealthOf(enemy));

    const charges = slot.resource.charges;
    const events = throwAt(sim, salve, id, key, torso(mate));
    expect(slot.resource.charges).toBe(charges - 1);
    events.push(...runUntil(sim, salve, {}, (tick) => ofType(tick, 'burst').length > 0, SECONDS(2)));
    const burst = only(ofType(events, 'burst'));
    expect(burst).toMatchObject({ source: 'projectile', abilityId: id, ownerId: salve.id });
    expect(bodyDistance(enemy, burst.pos)).toBeLessThanOrEqual(mend.radius);
    expect(ofType(events, 'healed')).toEqual([
      { type: 'healed', tick: burst.tick, entityId: mate.id, abilityId: id, amount: expect.closeTo(expected, 9), sourcePos: burst.pos },
    ]);
    expect(mate.health).toBeCloseTo(mateHealth + expected, 9);
    expect(enemy.health).toBe(enemyHealth);
  },

  /** Instant ally shield in radius: absorbs damage before health, breaks, and runs out silently. */
  bracket_overbrace: async () => {
    const id = 'bracket_overbrace';
    const cover = effectOf(id, 'shield');
    const { sim, user: bracket, key } = await rangeWith(id, vec3(-30, 0, 25), NORTH);
    const near = add(sim, 'wisp', ALLY, vec3(-32 + cover.radius, 0, 25), NORTH);
    const far = add(sim, 'wisp', ALLY, vec3(-28 + cover.radius, 0, 25), NORTH);
    const enemy = add(sim, 'heron', ENEMY, vec3(-30, 0, 27 - cover.radius), SOUTH);

    const used = run(sim, bracket, 1, { buttons: key });
    const useTick = sim.state.tick;
    expect(only(ofType(used, 'ability'))).toMatchObject({ entityId: bracket.id, abilityId: id, slot: carrier(id).slot });
    expect(ofType(used, 'shieldGained')).toEqual(
      [bracket, near].map((e) => expect.objectContaining({ entityId: e.id, abilityId: id, amount: cover.amount })),
    );
    expect([far, enemy].map(shieldAmount)).toEqual([0, 0]);

    const health = near.health;
    const events = shootAt(sim, enemy, torso(near));
    const hit = only(ofType(events, 'hit'));
    expect(hit).toMatchObject({ attackerId: enemy.id, victimId: near.id, absorbed: Math.min(cover.amount, hit.damage) });
    expect(near.health).toBeCloseTo(health - (hit.damage - hit.absorbed), 9);
    expect(ofType(events, 'shieldBroken')).toEqual(hit.damage >= cover.amount ? [expect.objectContaining({ entityId: near.id, abilityId: id })] : []);

    // Bracket's own shield lasts exactly its duration and ends silently.
    const expiry = run(sim, bracket, useTick + secondsToTicks(cover.duration) - 1 - sim.state.tick);
    expect(shieldAmount(bracket)).toBe(cover.amount);
    expiry.push(...run(sim, bracket, 1));
    expect(shieldAmount(bracket)).toBe(0);
    expect(ofType(expiry, 'shieldBroken')).toEqual([]);
  },

  /** Proximity mine: a teammate walks over it; an enemy sets it off — reveal plus a slowing area
   *  (the enemy's speed halves inside, recovers after leaving); the mine is consumed. */
  thistle_burrs: async () => {
    const id = 'thistle_burrs';
    const trap = effectOf(id, 'areaDenial');
    const mark = effectOf(id, 'reveal');
    const { sim, user: thistle, key } = await rangeWith(id, vec3(-30, 0, 25), NORTH);
    const { gadget: mine } = place(sim, thistle, key, vec3(-30, 0, 22.8));
    const mate = add(sim, 'wisp', ALLY, vec3(-36, 0, 23.8), EAST);
    const enemy = add(sim, 'wisp', ENEMY, vec3(-38, 0, 22.8), EAST);

    const matePass = walkUntil(sim, mate, EAST, () => mate.pos.x >= -26, SECONDS(3));
    expect(ofType(matePass, 'burst')).toEqual([]);
    expect(sim.state.gadgets).toEqual([mine]);

    const normal = topSpeed(enemy);
    const slowed: number[] = [];
    const events = walkUntil(
      sim,
      enemy,
      EAST,
      () => {
        if (modifierProduct(enemy, 'moveSpeed') !== 1) slowed.push(speedOf(enemy));
        return enemy.pos.x >= -22;
      },
      SECONDS(6),
    );
    const burst = only(ofType(events, 'burst'));
    expect(burst).toMatchObject({ source: 'gadget', sourceId: mine.id, abilityId: id, ownerId: thistle.id });
    expect(sim.state.gadgets).toEqual([]);
    expect(only(ofType(events, 'revealed'))).toMatchObject({ entityId: enemy.id, team: thistle.team, abilityId: id, tick: burst.tick });
    expect(ofType(events, 'hit')).toEqual([]); // it slows, it does not burn
    const area = only(sim.state.areas);
    expect(area).toMatchObject({ abilityId: id, ownerId: thistle.id, team: thistle.team });
    expect(area.pos.y).toBeCloseTo(0, 3);

    // Inside the area the enemy walks at the data's fraction of its speed; out of it at full speed.
    expect(slowed.length).toBeGreaterThan(5);
    expect(Math.min(...slowed)).toBeCloseTo(normal * (trap.stats.moveSpeed ?? 1), 6);
    expect(bodyDistance(enemy, area.pos)).toBeGreaterThan(trap.radius);
    expect(modifierProduct(enemy, 'moveSpeed')).toBe(1);
    expect(speedOf(enemy)).toBeCloseTo(normal, 6);

    // The reveal and the area run their data durations from the burst. The area acts from the
    // burst tick on (the area step 6 follows the trigger step 5), so its last tick is one earlier
    // than a projectile's area (Firebreak), which starts in the tick after its burst.
    expect(isRevealedTo(enemy, thistle.team)).toBe(true);
    run(sim, thistle, burst.tick + secondsToTicks(mark.duration) - 1 - sim.state.tick);
    expect(isRevealedTo(enemy, thistle.team)).toBe(true);
    run(sim, thistle, 1);
    expect(isRevealedTo(enemy, thistle.team)).toBe(false);
    run(sim, thistle, burst.tick + secondsToTicks(trap.duration) - 2 - sim.state.tick);
    expect(sim.state.areas).toEqual([area]);
    run(sim, thistle, 1);
    expect(sim.state.areas).toEqual([]);
  },

  /** Fused throw: lands, bursts at the end of its fuse into a burning area that deals exactly its
   *  damage per second to the enemy inside for its duration; teammates are spared. */
  gorse_firebreak: async () => {
    const id = 'gorse_firebreak';
    const { fuse } = ability(id, 'thrown').activation;
    if (fuse === null) throw new Error(`${id} must be fused`);
    const fire = effectOf(id, 'areaDenial');
    const { sim, user: gorse, slot, key } = await rangeWith(id, vec3(-30, 0, 30), NORTH);
    const enemy = add(sim, 'basalt', ENEMY, vec3(-30, 0, 22), SOUTH);
    const mate = add(sim, 'wisp', ALLY, vec3(-32, 0, 23), NORTH);
    const total = mitigatedDamage(fire.damagePerSecond * fire.duration, getOperator(enemy.operatorId).armour);
    expect(total).toBeLessThan(maxHealthOf(enemy)); // it survives, so every tick of the area counts

    const target = vec3(-30, 0, 23.2);
    const thrown = throwAt(sim, gorse, id, key, target);
    const throwTick = sim.state.tick;
    expect(only(ofType(thrown, 'ability'))).toMatchObject({ entityId: gorse.id, abilityId: id });
    expect(slot.resource.timer).toBe(cooldownOf(getAbility(id)));
    const flight = runUntil(sim, gorse, {}, (tick) => ofType(tick, 'burst').length > 0, SECONDS(fuse + 1));
    const burst = only(ofType(flight, 'burst'));
    expect(burst).toMatchObject({ source: 'projectile', abilityId: id, ownerId: gorse.id });
    expect(burst.tick - throwTick).toBe(secondsToTicks(fuse)); // the fuse runs from the tick after the throw
    expect(distance(burst.pos, target)).toBeLessThan(0.2); // it landed where it was thrown
    expect(ofType(flight, 'hit')).toEqual([]);
    const area = only(sim.state.areas);
    expect(area).toMatchObject({ abilityId: id, ownerId: gorse.id, remaining: fire.duration });

    const burning = run(sim, gorse, secondsToTicks(fire.duration));
    expect(sim.state.areas).toEqual([]);
    const hits = ofType(burning, 'hit');
    expect(hits).toHaveLength(secondsToTicks(fire.duration));
    for (const h of hits) expect(h).toMatchObject({ attackerId: gorse.id, victimId: enemy.id, cause: { kind: 'ability', abilityId: id } });
    expect(hits.reduce((sum, h) => sum + h.damage, 0)).toBeCloseTo(total, 6);
    expect(enemy.health).toBeCloseTo(maxHealthOf(enemy) - total, 6);
    for (const spared of [gorse, mate]) expect(spared.health, spared.operatorId).toBe(maxHealthOf(spared));
    expect(ofType(run(sim, gorse, SECONDS(1)), 'hit')).toEqual([]);
  },
};

describe('roster: every ability end to end through commands (ADR-0012 §11, batch R)', () => {
  it('has exactly one case per ability in the roster', () => {
    expect(Object.keys(CASES).sort()).toEqual(ABILITIES.map((a) => a.id).sort());
  });

  it.each(ABILITIES.map((a) => [a.id, a.name] as const))('%s (%s)', async (id) => {
    const roster = CASES[id];
    if (!roster) throw new Error(`No roster case for ability '${id}'`);
    await roster();
  });
});

describe('effect durations (ADR-0012 §1.4, isTimeUp)', () => {
  // Regression: step 4 of Sim.step ran "expiry → activations" per character in entity-id order, so
  // an effect an instant, hold or toggle activation applied to a character with a *higher* id than
  // its user was counted down once more in the same tick and ended one tick early. Step 4 now runs
  // every character's expiry (expireEffects) before any activation.
  it('an instant effect lasts its full duration on every target, whatever the entity ids', async () => {
    const id = 'bracket_overbrace';
    const cover = effectOf(id, 'shield');
    const sim = await Sim.create(RANGE_LEVEL);
    const spawn = (operatorId: string, x: number): CharacterEntity =>
      sim.spawnCharacter({ operatorId, team: ALLY, controller: 'bot', position: vec3(x, 0, 25), yaw: NORTH });
    const earlier = spawn('wisp', -32);
    const bracket = spawn('bracket', -30);
    const later = spawn('wisp', -28);
    run(sim, bracket, 10);
    run(sim, bracket, 1, { buttons: carrier(id).key });
    const applied = sim.state.tick;
    const ends = new Map<CharacterEntity, number>();
    for (let i = 0; i < SECONDS(cover.duration + 1); i++) {
      run(sim, bracket, 1);
      for (const e of [earlier, bracket, later]) if (!ends.has(e) && shieldAmount(e) === 0) ends.set(e, sim.state.tick - applied);
    }
    expect([earlier, bracket, later].map((e) => ends.get(e))).toEqual([0, 0, 0].map(() => secondsToTicks(cover.duration)));
  });
});

describe('elimination round reset (ADR-0012 §2)', () => {
  it('clears the gadgets (and colliders), projectiles and areas left after an elimination and restores every kit', async () => {
    const sim = await Sim.create(SALTWORKS_LEVEL, 1, 'elimination');
    const m = sim.state.match;
    if (m.mode !== 'elimination') throw new Error('expected an elimination match');
    const roster: RosterEntry[] = [
      { team: 0, operatorId: 'keel', controller: 'player' },
      { team: 0, operatorId: 'lattice', controller: 'bot' },
      { team: 0, operatorId: 'gorse', controller: 'bot' },
      { team: 0, operatorId: 'kiln', controller: 'bot' },
      { team: 1, operatorId: 'wisp', controller: 'bot' },
    ];
    const cast = roundSpawnOptions(sim.level, m, roster).map((o) => sim.spawnCharacter(o));
    const [keel, lattice, gorse, kiln, wisp] = cast;
    if (!keel || !lattice || !gorse || !kiln || !wisp) throw new Error('expected five characters');
    while (m.phase !== 'live') sim.step(new Map());

    // Into the open courtyard between the spawn shields and the pump house (teleport controls
    // are accepted in every phase).
    const spots: [CharacterEntity, Vec3, number][] = [
      [keel, vec3(0, 0, 28), NORTH],
      [lattice, vec3(2.5, 0, 28), NORTH],
      [gorse, vec3(-2.5, 0, 28), NORTH],
      [kiln, vec3(1.5, 0, 17), SOUTH],
      [wisp, vec3(-2, 0, 19), SOUTH],
    ];
    for (const [e, position, yaw] of spots) sim.control({ type: 'teleport', entityId: e.id, position, yaw, pitch: 0 });
    run(sim, keel, 10);

    const { gadget: barrier } = place(sim, keel, carrier('keel_breakwater').key, vec3(0, 0, 26));
    place(sim, lattice, carrier('lattice_nodes').key, vec3(2.5, 0, 25.8));
    const half = effectOf('keel_breakwater', 'barrier').height / 2;
    const across: [Vec3, Vec3] = [vec3(0, half, barrier.pos.z + 1), vec3(0, half, barrier.pos.z - 1)];
    expect(sim.query.lineOfSight(...across)).toBe(false);

    // Firebreak burns the last enemy: an ability kill ends the round by elimination.
    const firebreak = carrier('gorse_firebreak');
    const live = throwAt(sim, gorse, 'gorse_firebreak', firebreak.key, vec3(-2, 0, 20));
    live.push(...runUntil(sim, gorse, {}, (tick) => ofType(tick, 'kill').length > 0, SECONDS(10)));
    expect(only(ofType(live, 'kill'))).toMatchObject({ attackerId: gorse.id, victimId: wisp.id, cause: { kind: 'ability', abilityId: 'gorse_firebreak' } });
    const ended = run(sim, keel, 1);
    expect(only(ofType(ended, 'roundEnd'))).toMatchObject({ round: 1, winner: 0, reason: 'elimination' });
    const resetTick = m.phaseEndTick;
    if (resetTick === null) throw new Error('roundEnd must end');

    // In the result phase Kiln still throws: a lance that burns on the ground at the reset, and
    // one straight up that is still in flight then.
    const lance = carrier('kiln_lance');
    run(sim, keel, resetTick - SECONDS(1.5) - sim.state.tick);
    throwAt(sim, kiln, 'kiln_lance', lance.key, vec3(1.5, 0, 20));
    run(sim, keel, resetTick - SECONDS(0.5) - sim.state.tick);
    run(sim, kiln, 1, { yaw: SOUTH, pitch: 1.5, buttons: lance.key });
    run(sim, keel, resetTick - 1 - sim.state.tick);
    expect(sim.state.gadgets.map((g) => g.abilityId)).toEqual(['keel_breakwater', 'lattice_nodes']);
    expect(sim.state.projectiles.map((p) => p.abilityId)).toEqual(['kiln_lance']);
    expect(sim.state.areas.map((a) => a.abilityId)).toContain('kiln_lance');

    const reset = run(sim, keel, 1);
    expect(m).toMatchObject({ phase: 'preRound', round: 2 });
    expect([sim.state.gadgets, sim.state.projectiles, sim.state.areas]).toEqual([[], [], []]);
    expect(sim.query.lineOfSight(...across)).toBe(true);
    expect(reset.filter((e) => e.type === 'gadgetDestroyed' || e.type === 'burst')).toEqual([]);
    expect(wisp.alive).toBe(true);
    expect(slotOf(keel, 0).resource.usesLeft).toBe(usesOf(getAbility('keel_breakwater')));
    expect(slotOf(lattice, 0).resource.usesLeft).toBe(usesOf(getAbility('lattice_nodes')));
    expect(slotOf(gorse, firebreak.slot).resource.timer).toBe(0);
    expect(slotOf(kiln, lance.slot).resource.charges).toBe(maxChargesOf(getAbility('kiln_lance')));
    for (const e of cast) expect([e.shields, e.reveals, e.modifiers], e.operatorId).toEqual([[], [], []]);

    // Nothing of the last round acts any more.
    const after = run(sim, keel, SECONDS(2));
    expect(after.filter((e) => e.type === 'hit' || e.type === 'burst' || e.type === 'revealed')).toEqual([]);
  });
});
