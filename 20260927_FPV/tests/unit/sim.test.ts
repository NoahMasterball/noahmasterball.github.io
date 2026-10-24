import { describe, expect, it } from 'vitest';
import { ELIMINATION, GUNPLAY, RANGE_MODE, secondsToTicks, TICK_DT } from '../../src/config/sim.ts';
import { getAbility, getHitboxProfile, getOperator, getWeapon, OPERATORS } from '../../src/data/content.ts';
import { RANGE_LEVEL } from '../../src/data/levels/range.ts';
import { SALTWORKS_LEVEL } from '../../src/data/levels/saltworks.ts';
import type { HitZone } from '../../src/data/schema.ts';
import { BUTTON, type Command } from '../../src/sim/command.ts';
import { pelletDamage, shotInterval } from '../../src/sim/combat/damage.ts';
import { WEAPON_SLOTS, weaponForSlot } from '../../src/sim/entities.ts';
import { eyeHeight, partWorldCenter } from '../../src/sim/hitbox.ts';
import { anglesTo, distance, vec3 } from '../../src/sim/math.ts';
import { roundSpawnOptions, type RosterEntry } from '../../src/sim/modes/format.ts';
import { Sim } from '../../src/sim/sim.ts';
import { activeWeapon, canFire, modifierProduct, topSpeed, weaponOf } from '../../src/sim/stats.ts';
import type { CharacterEntity, EntityId, SimEvent } from '../../src/sim/types.ts';
import { EAST, ofType, run, SECONDS, world, type EventOf, type Input } from './support/world.ts';

// The real simulation with Rapier, headless in Node — the situation of a future server.

const horizontalSpeed = (e: CharacterEntity): number => Math.hypot(e.vel.x, e.vel.z);

describe('movement', () => {
  it('lands on the floor and reports grounded', async () => {
    const { sim, player } = await world('basalt', vec3(-30, 0.6, 25), EAST);
    run(sim, player, SECONDS(1));
    expect(player.grounded).toBe(true);
    expect(player.pos.y).toBeGreaterThanOrEqual(-0.01);
    expect(player.pos.y).toBeLessThan(0.1);
  });

  it('rests with the feet exactly on the floor it spawned on', async () => {
    const { player } = await world('basalt', vec3(-30, 0, 25), EAST);
    expect(player.grounded).toBe(true);
    expect(Math.abs(player.pos.y)).toBeLessThan(1e-3);
  });

  /** Walks forward for a while; returns the slowest per-tick speed and the largest height change. */
  function walkAndMeasure(sim: Sim, player: CharacterEntity, seconds: number, input: Input): { slowest: number; hop: number } {
    const startY = player.pos.y;
    let slowest = Infinity;
    let hop = 0;
    for (let i = 0; i < SECONDS(seconds); i++) {
      run(sim, player, 1, input);
      slowest = Math.min(slowest, distance(player.prevPos, player.pos) / TICK_DT);
      hop = Math.max(hop, Math.abs(player.pos.y - startY));
    }
    return { slowest, hop };
  }

  // Regression: the controller used to stop operators dead for several ticks on flat floor and
  // make them hop by centimetres.
  it.each(OPERATORS.map((o) => o.id))('%s: walks flat floor at its move speed, level and without stops', async (id) => {
    const { sim, player } = await world(id, vec3(-35, 0, 25), EAST);
    run(sim, player, SECONDS(1), { moveZ: 1 }); // up to speed
    const top = topSpeed(player);
    const { slowest, hop } = walkAndMeasure(sim, player, 2, { moveZ: 1 });
    expect(slowest).toBeGreaterThan(top * 0.999);
    expect(hop).toBeLessThan(1e-3);
    expect(horizontalSpeed(player)).toBeCloseTo(top, 2);
  });

  it('stops at a wall without building up speed into it, and slides along it', async () => {
    const { sim, player } = await world('wisp', vec3(37, 0, 20), EAST); // east perimeter wall ahead
    run(sim, player, SECONDS(1.5), { moveZ: 1 });
    const blockedX = player.pos.x;
    run(sim, player, SECONDS(0.5), { moveZ: 1 });
    expect(player.pos.x).toBeCloseTo(blockedX, 3);
    expect(horizontalSpeed(player)).toBeLessThan(0.1);
    // Nothing stored against the wall: backing off works at once, like from standing still.
    run(sim, player, SECONDS(0.1), { moveZ: -1 });
    expect(player.pos.x).toBeLessThan(blockedX - 0.05);
    // Walking into the wall at 45° slides along it, level, with the parallel part of the speed.
    run(sim, player, SECONDS(0.5), { moveZ: 1, yaw: EAST + Math.PI / 4 });
    const { hop } = walkAndMeasure(sim, player, 1, { moveZ: 1, yaw: EAST + Math.PI / 4 });
    expect(hop).toBeLessThan(1e-3);
    expect(Math.abs(player.vel.x)).toBeLessThan(0.1);
    expect(horizontalSpeed(player)).toBeCloseTo(topSpeed(player) * Math.SQRT1_2, 1);
  });

  it('gives each operator its data-driven top speed (speedster clearly faster than anchor)', async () => {
    const speeds: Record<string, number> = {};
    for (const id of ['basalt', 'wisp']) {
      const { sim, player } = await world(id, vec3(-30, 0, 25), EAST);
      run(sim, player, SECONDS(1), { moveZ: 1 });
      speeds[id] = horizontalSpeed(player);
      const op = getOperator(id);
      const weapon = getWeapon(op.loadout.primary[0] ?? '');
      expect(speeds[id]).toBeCloseTo(op.moveSpeed * weapon.moveSpeedModifier, 2);
    }
    expect((speeds.wisp ?? 0) / (speeds.basalt ?? 1)).toBeGreaterThan(1.5);
  });

  it('sprints faster, forward only', async () => {
    const { sim, player } = await world('wisp', vec3(-30, 0, 25), EAST);
    run(sim, player, SECONDS(1), { moveZ: 1, buttons: BUTTON.sprint });
    expect(player.sprinting).toBe(true);
    expect(horizontalSpeed(player)).toBeCloseTo(topSpeed(player), 2);
    run(sim, player, SECONDS(1), { moveX: 1, buttons: BUTTON.sprint });
    expect(player.sprinting).toBe(false);
  });

  /** Steps with `input` until the player lands; returns the airborne ticks and how many of them
   *  were sprinting. */
  function throughTheAir(sim: Sim, player: CharacterEntity, input: Input): { airborne: number; sprinting: number } {
    let airborne = 0;
    let sprinting = 0;
    while (!player.grounded && airborne < SECONDS(3)) {
      run(sim, player, 1, input);
      airborne += 1;
      if (player.sprinting) sprinting += 1;
    }
    return { airborne, sprinting };
  }

  it('starts a sprint only on the ground; one started there carries on through a jump', async () => {
    const { sim, player } = await world('wisp', vec3(-35, 0, 25), EAST);
    const sprintKeys: Input = { moveZ: 1, buttons: BUTTON.sprint };
    // Jump first, then press sprint in the air: no sprint until the feet are down.
    run(sim, player, 1, { moveZ: 1, buttons: BUTTON.jump });
    const late = throughTheAir(sim, player, sprintKeys);
    expect(late.airborne).toBeGreaterThan(SECONDS(0.3));
    expect(late.sprinting).toBe(0);
    run(sim, player, 1, sprintKeys);
    expect(player.sprinting).toBe(true);
    // Sprinting on the ground, then jumping with the key held: the sprint continues in the air.
    run(sim, player, 1, { moveZ: 1, buttons: BUTTON.sprint | BUTTON.jump });
    const carried = throughTheAir(sim, player, sprintKeys);
    expect(carried.airborne).toBeGreaterThan(SECONDS(0.3));
    expect(carried.sprinting).toBe(carried.airborne);
  });

  it('cannot stand up under the crouch-tunnel roof', async () => {
    const { sim, player } = await world('wisp', vec3(21.5, 0, -11), 0);
    run(sim, player, SECONDS(0.5), { buttons: BUTTON.crouch });
    expect(player.stance).toBe(1);
    run(sim, player, SECONDS(2.3), { moveZ: 1, buttons: BUTTON.crouch });
    expect(player.pos.z).toBeLessThan(-16);
    expect(player.pos.z).toBeGreaterThan(-20);
    run(sim, player, SECONDS(0.5)); // crouch released inside the tunnel
    expect(player.stance).toBe(1);
    run(sim, player, SECONDS(3), { moveZ: 1 }); // walk out, then stand up
    expect(player.pos.z).toBeLessThan(-21.5);
    expect(player.stance).toBe(0);
  });
});

async function shootingRange(): Promise<{ sim: Sim; player: CharacterEntity; dummy: CharacterEntity }> {
  const sim = await Sim.create(RANGE_LEVEL);
  const dummy = sim.spawnCharacter({ operatorId: 'basalt', team: RANGE_MODE.dummyTeam, controller: 'bot', position: vec3(-15, 0, 20), yaw: Math.PI });
  const player = sim.spawnCharacter({ operatorId: 'basalt', team: RANGE_MODE.playerTeam, controller: 'player', position: vec3(-15, 0, 26), yaw: 0 });
  run(sim, player, 10);
  return { sim, player, dummy };
}

/** Aims at `part` of the dummy and fires one tick; `held` buttons (e.g. crouch) stay down throughout. */
function shootAt(sim: Sim, player: CharacterEntity, dummy: CharacterEntity, part: string, held = 0): SimEvent[] {
  const profile = getHitboxProfile(getOperator(dummy.operatorId).hitboxProfile);
  const eye = { x: player.pos.x, y: player.pos.y + eyeHeight(player.stance), z: player.pos.z };
  const aim = anglesTo(eye, partWorldCenter(profile, dummy.stance, dummy.pos, dummy.yaw, part));
  run(sim, player, SECONDS(1.5), { ...aim, buttons: held | BUTTON.ads }); // fully aimed, recoil recovered
  return run(sim, player, 1, { ...aim, buttons: held | BUTTON.ads | BUTTON.fire });
}

type ShotEvent = EventOf<'shot'>;
const hitsOf = (events: SimEvent[]): EventOf<'hit'>[] => ofType(events, 'hit');
const countOf = (events: SimEvent[], type: SimEvent['type']): number => ofType(events, type).length;
/** A one-tick press, like a key tap. */
const tap = (sim: Sim, e: CharacterEntity, bit: number): SimEvent[] => run(sim, e, 1, { buttons: bit });

describe('hitscan and hitboxes', () => {
  it.each<[string, HitZone]>([
    ['head', 'head'],
    ['chest', 'torso'],
    ['legL', 'limb'],
  ])('aiming at the %s registers a %s hit with pipeline damage', async (part, zone) => {
    const { sim, player, dummy } = await shootingRange();
    const [hit, ...others] = hitsOf(shootAt(sim, player, dummy, part));
    expect(others).toHaveLength(0);
    if (!hit) throw new Error('expected a hit');
    expect(hit.victimId).toBe(dummy.id);
    expect(hit.zone).toBe(zone);
    const expected = pelletDamage(getWeapon('anvil_lmg'), zone, hit.distance, getOperator('basalt').armour);
    expect(hit.damage).toBeCloseTo(expected, 5);
    expect(dummy.health).toBeCloseTo(getOperator('basalt').maxHealth - expected, 5);
  });

  it('kills, then respawns the dummy under range rules', async () => {
    const { sim, player, dummy } = await shootingRange();
    const events: SimEvent[] = [];
    for (let i = 0; i < 6 && dummy.alive; i++) events.push(...shootAt(sim, player, dummy, 'head'));
    expect(events.some((e) => e.type === 'kill' && e.victimId === dummy.id)).toBe(true);
    expect(dummy.alive).toBe(false);
    const later = run(sim, player, SECONDS(RANGE_MODE.dummyRespawnSeconds + 0.1));
    expect(later.some((e) => e.type === 'spawn' && e.entityId === dummy.id)).toBe(true);
    expect(dummy.health).toBe(getOperator('basalt').maxHealth);
  });

  it('reports the shooter’s ray origin (the eye at fire time) as the hit’s source', async () => {
    const { sim, player, dummy } = await shootingRange();
    run(sim, player, SECONDS(0.5), { buttons: BUTTON.crouch }); // not the standing eye height
    const events = shootAt(sim, player, dummy, 'chest', BUTTON.crouch);
    const [shot] = ofType(events, 'shot');
    const [hit] = hitsOf(events);
    if (!shot || !hit) throw new Error('expected a shot and a hit');
    expect(hit.sourcePos).toEqual(shot.origin); // the origin the ray was cast from
    expect(hit.sourcePos).not.toBe(shot.origin); // a copy: consumers may change theirs
    expect(hit.sourcePos).toEqual({ x: player.pos.x, y: player.pos.y + eyeHeight(player.stance), z: player.pos.z });
    expect(player.stance).toBeGreaterThan(0);
  });

  it('never hits a teammate (friendly fire off)', async () => {
    const { sim, player, dummy } = await shootingRange();
    dummy.team = player.team;
    expect(hitsOf(shootAt(sim, player, dummy, 'chest'))).toHaveLength(0);
  });
});

describe('weapons', () => {
  it('fires at the data-driven rate and reloads when empty', async () => {
    const { sim, player } = await world('wisp', vec3(-30, 0, 25), EAST);
    const hornet = getWeapon('hornet_smg');
    const firstSecond = run(sim, player, SECONDS(1), { buttons: BUTTON.fire });
    expect(countOf(firstSecond, 'shot')).toBe(Math.round(hornet.rpm / 60)); // 900 rpm → 15 in 1 s
    // Keep holding: the magazine empties, the reload starts at once and blocks firing.
    const rest = run(sim, player, SECONDS(hornet.reloadTime), { buttons: BUTTON.fire });
    expect(countOf(firstSecond, 'shot') + countOf(rest, 'shot')).toBe(hornet.magazine);
    expect(countOf(rest, 'reloadStart')).toBe(1);
    expect(activeWeapon(player).ammo).toBe(0);
  });

  // Regression: the cadence compared a float accumulator with 0 and counted the idle weapon down in
  // the tick of its first shot, so float residue or that tick could shift a shot by a tick (the
  // Tern's first interval after an idle period took 4 ticks, not 5).
  it.each([
    ['auger', 'vesper_ar'], // 720 rpm: 5 whole ticks
    ['kiln', 'tern_carbine'], // 780 rpm: ≈ 4.62 ticks
    ['basalt', 'anvil_lmg'], // 560 rpm: ≈ 6.43 ticks
  ])('%s: %s keeps its cadence in ticks — first interval secondsToTicks(interval), a spray the exact rpm', async (operatorId, weaponId) => {
    const { sim, player } = await world(operatorId, vec3(-30, 0, 25), EAST);
    const w = getWeapon(weaponId);
    expect(weaponOf(player).id).toBe(weaponId);
    const interval = shotInterval(w);
    /** The ticks of the shots while fire is held for `ticks` ticks. */
    const spray = (ticks: number): number[] => {
      const at: number[] = [];
      for (let i = 0; i < ticks; i++) if (countOf(run(sim, player, 1, { buttons: BUTTON.fire }), 'shot') > 0) at.push(sim.state.tick);
      return at;
    };
    const gaps = (at: number[]): number[] => at.slice(1).map((tick, i) => tick - (at[i] ?? tick));

    // A short burst from idle, a pause, then a spray that empties the magazine.
    const burst = spray(SECONDS(2.5 * interval));
    run(sim, player, SECONDS(1));
    const long = spray(SECONDS(w.magazine * interval + 1));
    expect(burst).toHaveLength(3);
    expect(long).toHaveLength(w.magazine - 3);
    for (const shots of [burst, long]) {
      expect(gaps(shots)[0]).toBe(secondsToTicks(interval));
      for (const gap of gaps(shots)) expect([Math.floor(interval / TICK_DT), Math.ceil(interval / TICK_DT)]).toContain(gap);
    }
    const last = long[long.length - 1] ?? 0;
    const first = long[0] ?? 0;
    expect(Math.abs(last - first - ((long.length - 1) * interval) / TICK_DT)).toBeLessThan(1);
  });

  it('recoil climbs while spraying and recovers afterwards', async () => {
    const { sim, player } = await world('basalt', vec3(-30, 0, 25), EAST);
    run(sim, player, SECONDS(0.5), { buttons: BUTTON.fire });
    const climbed = player.weapon.recoilPitch;
    expect(climbed).toBeGreaterThan(0);
    run(sim, player, SECONDS(2));
    expect(player.weapon.recoilPitch).toBe(0);
  });
});

describe('weapon swap', () => {
  const SWAP_TICKS = SECONDS(GUNPLAY.weaponSwapSeconds);
  const [PRIMARY, SECONDARY] = WEAPON_SLOTS;

  it('blocks firing for the swap time, then fires the new weapon', async () => {
    const { sim, player } = await world('wisp', vec3(-30, 0, 25), EAST);
    const pistol = weaponForSlot(getOperator('wisp'), SECONDARY);
    const swap = tap(sim, player, BUTTON.selectSecondary);
    expect(swap.some((e) => e.type === 'weaponSwap' && e.slot === 1 && e.weaponId === pistol.id)).toBe(true);
    expect(activeWeapon(player).weaponId).toBe(pistol.id);
    // Mash the (semi-auto) trigger through the swap: a fresh press every other tick.
    let blockedTicks = 1; // the press tick itself
    const shots: ShotEvent[] = [];
    for (let i = 0; i < SWAP_TICKS + 4 && shots.length === 0; i++) {
      const fired = run(sim, player, 1, { buttons: i % 2 === 0 ? BUTTON.fire : 0 }).filter((e): e is ShotEvent => e.type === 'shot');
      if (player.weapon.swapRemaining > 0) {
        blockedTicks += 1;
        expect(fired).toHaveLength(0);
      }
      shots.push(...fired);
    }
    expect(blockedTicks).toBeGreaterThanOrEqual(SWAP_TICKS - 1);
    expect(blockedTicks).toBeLessThanOrEqual(SWAP_TICKS);
    expect(shots[0]?.weaponId).toBe(pistol.id);
  });

  it('keeps each weapon’s magazine across swaps', async () => {
    const { sim, player } = await world('wisp', vec3(-30, 0, 25), EAST);
    const pistol = weaponForSlot(getOperator('wisp'), SECONDARY);
    run(sim, player, SECONDS(0.3), { buttons: BUTTON.fire });
    const primaryAmmo = activeWeapon(player).ammo;
    expect(primaryAmmo).toBeLessThan(weaponForSlot(getOperator('wisp'), PRIMARY).magazine);
    tap(sim, player, BUTTON.selectSecondary);
    run(sim, player, SWAP_TICKS);
    tap(sim, player, BUTTON.fire);
    run(sim, player, SECONDS(0.5));
    tap(sim, player, BUTTON.fire);
    expect(activeWeapon(player).ammo).toBe(pistol.magazine - 2);
    tap(sim, player, BUTTON.selectPrimary);
    run(sim, player, SWAP_TICKS);
    expect(player.activeSlot).toBe(0);
    expect(activeWeapon(player).ammo).toBe(primaryAmmo);
    expect(player.weapons[1]?.ammo).toBe(pistol.magazine - 2);
  });

  it('cancels a running reload and ignores reload presses while swapping', async () => {
    const { sim, player } = await world('wisp', vec3(-30, 0, 25), EAST);
    const primary = weaponForSlot(getOperator('wisp'), PRIMARY);
    run(sim, player, SECONDS(0.3), { buttons: BUTTON.fire });
    const ammo = activeWeapon(player).ammo;
    expect(countOf(tap(sim, player, BUTTON.reload), 'reloadStart')).toBe(1);
    tap(sim, player, BUTTON.selectSecondary);
    expect(player.weapon.reloadRemaining).toBe(0);
    expect(countOf(run(sim, player, SECONDS(primary.reloadTime)), 'reloadEnd')).toBe(0);
    expect(player.weapons[0]?.ammo).toBe(ammo);
    // Back to the half-empty primary: a reload pressed mid-swap is dropped, not queued.
    tap(sim, player, BUTTON.selectPrimary);
    expect(countOf(tap(sim, player, BUTTON.reload), 'reloadStart')).toBe(0);
    run(sim, player, SWAP_TICKS);
    expect(player.weapon.reloadRemaining).toBe(0);
    expect(countOf(tap(sim, player, BUTTON.reload), 'reloadStart')).toBe(1);
  });

  it('hits with the secondary’s own damage after switching', async () => {
    const { sim, player, dummy } = await shootingRange();
    const op = getOperator(player.operatorId);
    const [primary, secondary] = [weaponForSlot(op, PRIMARY), weaponForSlot(op, SECONDARY)];
    tap(sim, player, BUTTON.selectSecondary);
    const events = shootAt(sim, player, dummy, 'chest'); // aims for longer than the swap takes
    const [hit, ...others] = hitsOf(events);
    if (!hit) throw new Error('expected a hit');
    expect(others).toHaveLength(0);
    expect(events.find((e): e is ShotEvent => e.type === 'shot')?.weaponId).toBe(secondary.id);
    const armour = getOperator(dummy.operatorId).armour;
    expect(hit.damage).toBeCloseTo(pelletDamage(secondary, 'torso', hit.distance, armour), 5);
    expect(hit.damage).not.toBeCloseTo(pelletDamage(primary, 'torso', hit.distance, armour), 5);
  });

  it('carries no recoil, bloom or ADS over: they ease to rest during the swap', async () => {
    const { sim, player } = await world('basalt', vec3(-30, 0, 25), EAST);
    run(sim, player, SECONDS(0.6), { buttons: BUTTON.ads });
    run(sim, player, SECONDS(0.4), { buttons: BUTTON.ads | BUTTON.fire });
    expect(player.weapon.ads).toBe(1);
    expect(player.weapon.recoilPitch).toBeGreaterThan(0);
    expect(player.weapon.bloom).toBeGreaterThan(0);
    run(sim, player, 1, { buttons: BUTTON.ads | BUTTON.selectSecondary }); // ADS stays held
    expect(player.weapon.bloom).toBe(0);
    expect(player.weapon.shotIndex).toBe(0);
    let lastRecoil = player.weapon.recoilPitch;
    let minAds = player.weapon.ads;
    for (let i = 0; i < SWAP_TICKS + 2 && player.weapon.swapRemaining > 0; i++) {
      run(sim, player, 1, { buttons: BUTTON.ads });
      expect(player.weapon.recoilPitch).toBeLessThanOrEqual(lastRecoil); // eases back, never jumps
      lastRecoil = player.weapon.recoilPitch;
      minAds = Math.min(minAds, player.weapon.ads);
    }
    expect(player.weapon.swapRemaining).toBe(0);
    expect(minAds).toBe(0);
    expect(player.weapon.recoilPitch).toBe(0);
    expect(player.weapon.recoilYaw).toBe(0);
  });

  it('quick-swap toggles slots; a swap requested mid-swap reverses the elapsed part', async () => {
    const { sim, player } = await world('wisp', vec3(-30, 0, 25), EAST);
    expect(countOf(tap(sim, player, BUTTON.selectPrimary), 'weaponSwap')).toBe(0); // already in hand
    tap(sim, player, BUTTON.swapWeapon);
    expect(player.activeSlot).toBe(1);
    run(sim, player, SWAP_TICKS);
    expect(player.weapon.swapRemaining).toBe(0);
    tap(sim, player, BUTTON.swapWeapon);
    expect(player.activeSlot).toBe(0);
    run(sim, player, 5);
    const remaining = player.weapon.swapRemaining;
    tap(sim, player, BUTTON.swapWeapon);
    expect(player.activeSlot).toBe(1);
    expect(player.weapon.swapRemaining).toBeCloseTo(GUNPLAY.weaponSwapSeconds - remaining - TICK_DT, 9);
  });
});

describe('trigger buffer (a press the weapon cannot answer yet)', () => {
  const sprintKeys: Input = { moveZ: 1, buttons: BUTTON.sprint };

  it('a one-tick click out of a sprint fires once, on the first tick the weapon is up', async () => {
    const { sim, player } = await world('heron', vec3(-35, 0, 25), EAST);
    expect(weaponOf(player).fireMode).toBe('semi');
    run(sim, player, SECONDS(0.3), sprintKeys);
    expect(player.sprinting).toBe(true);
    // The sprint key stays down all along: the pending press holds the sprint off.
    expect(countOf(run(sim, player, 1, { moveZ: 1, buttons: BUTTON.sprint | BUTTON.fire }), 'shot')).toBe(0);
    let ticks = 0;
    let shots = 0;
    while (shots === 0 && ticks < SECONDS(0.5)) {
      shots = countOf(run(sim, player, 1, sprintKeys), 'shot');
      ticks += 1;
      if (shots === 0) {
        expect(canFire(player)).toBe(false);
        expect(player.sprinting).toBe(false);
      }
    }
    expect(shots).toBe(1);
    expect(ticks * TICK_DT).toBeGreaterThanOrEqual(GUNPLAY.sprintOutTime);
    expect((ticks - 1) * TICK_DT).toBeLessThan(GUNPLAY.sprintOutTime);
    // One click, one shot; then the held sprint key takes over again.
    expect(countOf(run(sim, player, SECONDS(0.5), sprintKeys), 'shot')).toBe(0);
    expect(player.sprinting).toBe(true);
  });

  it('a press during a swap fires when it ends if held or released within the buffer; an earlier click does not', async () => {
    const { sim, player } = await world('wisp', vec3(-30, 0, 25), EAST);
    /** Steps with `input` until the swap has ended; returns the shots (only its last tick can fire). */
    const untilSwapped = (input: Input): number => {
      let shots = 0;
      while (player.weapon.swapRemaining > 0) shots += countOf(run(sim, player, 1, input), 'shot');
      return shots;
    };
    // An early click is dropped: released longer than the buffer before the pistol is up.
    tap(sim, player, BUTTON.selectSecondary);
    expect(weaponOf(player).fireMode).toBe('semi');
    tap(sim, player, BUTTON.fire);
    expect(player.weapon.swapRemaining).toBeGreaterThan(GUNPLAY.triggerBufferSeconds);
    expect(untilSwapped({}) + countOf(run(sim, player, SECONDS(0.5)), 'shot')).toBe(0);
    // A late click fires as the weapon comes up — the auto primary too (one shot for a tap).
    tap(sim, player, BUTTON.selectPrimary);
    expect(weaponOf(player).fireMode).toBe('auto');
    while (player.weapon.swapRemaining > GUNPLAY.triggerBufferSeconds / 2) run(sim, player, 1);
    tap(sim, player, BUTTON.fire);
    expect(untilSwapped({})).toBe(1);
    expect(countOf(run(sim, player, SECONDS(0.5)), 'shot')).toBe(0);
    // Held through the swap: one semi-auto shot when it ends, no more while still held.
    tap(sim, player, BUTTON.selectSecondary);
    run(sim, player, 5);
    expect(untilSwapped({ buttons: BUTTON.fire })).toBe(1);
    expect(countOf(run(sim, player, SECONDS(0.5), { buttons: BUTTON.fire }), 'shot')).toBe(0);
  });

  it('never fires twice per press or faster than the cadence', async () => {
    const { sim, player } = await world('heron', vec3(-35, 0, 25), EAST);
    const dmr = weaponOf(player);
    // Held out of a sprint: one shot.
    run(sim, player, SECONDS(0.3), sprintKeys);
    expect(countOf(run(sim, player, SECONDS(1), { moveZ: 1, buttons: BUTTON.sprint | BUTTON.fire }), 'shot')).toBe(1);
    // A press during the fire cooldown is dropped, not queued for later.
    run(sim, player, SECONDS(1));
    expect(countOf(tap(sim, player, BUTTON.fire), 'shot')).toBe(1);
    run(sim, player, 1);
    expect(countOf(run(sim, player, SECONDS(1), { buttons: BUTTON.fire }), 'shot')).toBe(0);
    // Mashing (a fresh press every other tick) reaches the cadence, never more.
    run(sim, player, SECONDS(1));
    let shots = 0;
    let lastShotTick = -Infinity;
    for (let i = 0; i < SECONDS(1); i++) {
      if (countOf(run(sim, player, 1, { buttons: i % 2 === 0 ? BUTTON.fire : 0 }), 'shot') === 0) continue;
      expect((i - lastShotTick) * TICK_DT).toBeGreaterThanOrEqual(shotInterval(dmr) - 1e-9);
      lastShotTick = i;
      shots += 1;
    }
    expect(shots).toBe(Math.round(dmr.rpm / 60)); // 300 rpm → 5 in 1 s
  });
});

describe('respawn facing', () => {
  /** Steps `e` with `input` until it (re)spawns; returns that tick's spawn event. */
  function untilSpawn(sim: Sim, e: CharacterEntity, input: Input, maxTicks: number): EventOf<'spawn'> {
    for (let i = 0; i < maxTicks; i++) {
      const spawn = ofType(run(sim, e, 1, input), 'spawn').find((ev) => ev.entityId === e.id);
      if (spawn) return spawn;
    }
    throw new Error(`no spawn within ${maxTicks} ticks`);
  }

  it('range: the respawn tick keeps the spawn facing whatever look the command carries', async () => {
    const { sim, player, dummy } = await shootingRange();
    for (let i = 0; i < 6 && dummy.alive; i++) shootAt(sim, player, dummy, 'head');
    expect(dummy.alive).toBe(false);
    // The controller keeps sending the absolute look it had before (made before the respawn).
    const stale = { yaw: dummy.spawnYaw + 1, pitch: 0.3 };
    const spawn = untilSpawn(sim, dummy, stale, SECONDS(RANGE_MODE.dummyRespawnSeconds + 0.5));
    expect([dummy.yaw, dummy.pitch, dummy.prevYaw, dummy.prevPitch]).toEqual([dummy.spawnYaw, 0, dummy.spawnYaw, 0]);
    expect([spawn.yaw, spawn.pitch]).toEqual([dummy.spawnYaw, 0]);
    run(sim, dummy, 1, stale); // from the next tick on the command look applies again
    expect([dummy.yaw, dummy.pitch]).toEqual([stale.yaw, stale.pitch]);
  });

  it('elimination: the round reset turns everyone to their spawn facing on the reset tick', async () => {
    const sim = await Sim.create(SALTWORKS_LEVEL, 1, 'elimination');
    const match = sim.state.match;
    if (match.mode !== 'elimination') throw new Error('expected an elimination match');
    const roster: RosterEntry[] = [
      { team: 0, operatorId: 'wisp', controller: 'player' },
      { team: 1, operatorId: 'basalt', controller: 'bot' },
    ];
    const chars = roundSpawnOptions(sim.level, match, roster).map((o) => sim.spawnCharacter(o));
    const initial = ofType(sim.drainEvents(), 'spawn');
    expect(initial.map((ev) => [ev.yaw, ev.pitch])).toEqual(chars.map((c) => [c.spawnYaw, 0]));
    // Both controllers look elsewhere with fixed absolute angles until the timed-out round resets.
    const stale = new Map(chars.map((c) => [c.id, c.spawnYaw + 1.5]));
    const lookAway = (): Map<EntityId, Command> =>
      new Map(chars.map((c) => [c.id, { tick: sim.state.tick + 1, moveX: 0, moveZ: 0, yaw: stale.get(c.id) ?? 0, pitch: -0.2, buttons: 0 }]));
    const maxTicks = SECONDS(ELIMINATION.preRoundSeconds + ELIMINATION.roundSeconds + ELIMINATION.roundEndSeconds + 1);
    let spawns: EventOf<'spawn'>[] = [];
    for (let i = 0; i < maxTicks && spawns.length === 0; i++) spawns = ofType(sim.step(lookAway()), 'spawn');
    expect(match.round).toBe(2);
    expect(spawns.map((ev) => ev.entityId)).toEqual(chars.map((c) => c.id));
    for (const c of chars) {
      expect([c.yaw, c.pitch]).toEqual([c.spawnYaw, 0]);
      expect(c.yaw).not.toBe(stale.get(c.id));
    }
    expect(spawns.map((ev) => [ev.yaw, ev.pitch])).toEqual(chars.map((c) => [c.spawnYaw, 0]));
  });
});

describe('abilities', () => {
  it('Slipstream dashes ~its distance and spends charges', async () => {
    const { sim, player } = await world('wisp', vec3(-30, 0, 25), EAST);
    const start = { ...player.pos };
    const events = run(sim, player, SECONDS(0.2), { moveZ: 1, buttons: BUTTON.ability1 });
    expect(events.some((e) => e.type === 'ability')).toBe(true);
    expect(distance(start, player.pos)).toBeGreaterThan(5.5);
    expect(player.abilities[0]?.resource.charges).toBe(1);
    run(sim, player, 1);
    run(sim, player, 1, { buttons: BUTTON.ability1 });
    expect(player.abilities[0]?.resource.charges).toBe(0);
    run(sim, player, 1);
    const failed = run(sim, player, 1, { buttons: BUTTON.ability1 });
    expect(failed.some((e) => e.type === 'abilityFailed' && e.reason === 'notReady')).toBe(true);
  });

  it('Brace slows the anchor and expires after its duration', async () => {
    const { sim, player } = await world('basalt', vec3(-30, 0, 25), EAST);
    const normal = topSpeed(player);
    run(sim, player, 1, { buttons: BUTTON.ability1 });
    expect(player.modifiers).toHaveLength(1);
    expect(topSpeed(player)).toBeLessThan(normal);
    run(sim, player, SECONDS(5.1));
    expect(player.modifiers).toHaveLength(0);
  });

  it('Kestrel: Updraft rises exactly its dash distance, then falls back; Lightfoot is always on', async () => {
    const { sim, player } = await world('kestrel', vec3(-30, 0, 25), EAST);
    expect(modifierProduct(player, 'footstepVolume')).toBeLessThan(1);
    const dash = getAbility('kestrel_updraft').effects.find((e) => e.kind === 'dash');
    if (dash?.kind !== 'dash') throw new Error('Updraft must be a dash');
    const startY = player.pos.y;
    const events = run(sim, player, 1, { buttons: BUTTON.ability1 });
    expect(events.some((e) => e.type === 'ability' && e.abilityId === 'kestrel_updraft')).toBe(true);
    let apex = player.pos.y;
    for (let i = 0; i < SECONDS(dash.duration + 1); i++) {
      run(sim, player, 1);
      apex = Math.max(apex, player.pos.y);
    }
    // The dash data is the whole lift: no ballistic coast on top of it.
    expect(apex - startY).toBeCloseTo(dash.distance, 2);
    expect(player.grounded).toBe(true);
    expect(player.pos.y).toBeCloseTo(startY, 2);
  });
});

describe('control messages and determinism', () => {
  it('switches operator: stats, weapons and health follow the data', async () => {
    const { sim, player } = await world('basalt', vec3(-30, 0, 25), EAST);
    run(sim, player, 1, { buttons: BUTTON.selectSecondary }); // mid-swap when the switch lands
    sim.control({ type: 'selectOperator', entityId: player.id, operatorId: 'wisp' });
    const events = run(sim, player, 1);
    expect(events.some((e) => e.type === 'operatorChanged')).toBe(true);
    expect(player.weapons.map((w) => w.weaponId)).toEqual(WEAPON_SLOTS.map((slot) => weaponForSlot(getOperator('wisp'), slot).id));
    expect(player.activeSlot).toBe(0);
    expect(player.weapon.swapRemaining).toBe(0);
    expect(activeWeapon(player).weaponId).toBe('hornet_smg');
    expect(player.health).toBe(getOperator('wisp').maxHealth);
  });

  it('replays identically from the same seed and commands', async () => {
    const snapshot = async (): Promise<string> => {
      const sim = await Sim.create(RANGE_LEVEL, 1234);
      const dummy = sim.spawnCharacter({ operatorId: 'wisp', team: 1, controller: 'bot', position: vec3(-15, 0, 18), yaw: Math.PI });
      const player = sim.spawnCharacter({ operatorId: 'basalt', team: 0, controller: 'player', position: vec3(-15, 0, 26), yaw: 0 });
      run(sim, player, SECONDS(0.5), { moveX: 0.5, buttons: BUTTON.fire, pitch: 0.02 });
      return JSON.stringify({ player, dummy, rng: sim.state.rng });
    };
    expect(await snapshot()).toBe(await snapshot());
  });
});
