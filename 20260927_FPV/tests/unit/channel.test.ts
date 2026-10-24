import { describe, expect, it } from 'vitest';
import { ABILITY_RULES, TICK_DT } from '../../src/config/sim.ts';
import { getAbility } from '../../src/data/content.ts';
import type { AbilityDef, ActivationKind } from '../../src/data/schema.ts';
import { HOLD_ACTIVATION } from '../../src/sim/abilities/activation/hold.ts';
import { TOGGLE_ACTIVATION } from '../../src/sim/abilities/activation/toggle.ts';
import { BUTTON, type Command } from '../../src/sim/command.ts';
import { bodyDistance, eyeHeight, zoneWorldCenter } from '../../src/sim/hitbox.ts';
import { anglesTo, vec3 } from '../../src/sim/math.ts';
import type { Sim } from '../../src/sim/sim.ts';
import { canFire, channelProgress, modifierProduct, topSpeed, weaponBlockedBy } from '../../src/sim/stats.ts';
import { hasActivation, isAbilitySupported, type AbilityOf } from '../../src/sim/systems/abilities.ts';
import type { AbilityState, CharacterEntity, SimEvent } from '../../src/sim/types.ts';
import { abilityWorld } from './support/abilityWorld.ts';
import { commandFor, EAST, ofType, run, SECONDS, world, type Input } from './support/world.ts';

// ADR-0012 batch H: the `hold` (channel) and `toggle` activations — Heron's Sonar Pulse and Cairn's
// Set Piton through commands on the real Sim, plus the effect scaling with probe abilities on the
// harness. What a reveal does is the reveal handler's test (effects.test.ts); here only the
// activation's lifecycle, events, resource, weapon block and effect context are checked.

function ability<K extends ActivationKind>(id: string, kind: K): AbilityOf<K> {
  const a = getAbility(id);
  if (!hasActivation(a, kind)) throw new Error(`${id} must be a ${kind} ability`);
  return a;
}

function cooldownOf(a: AbilityDef): number {
  if (a.resource.kind !== 'cooldown') throw new Error(`${a.id} must have a cooldown`);
  return a.resource.cooldown;
}

function revealRadius(a: AbilityDef): number {
  const reveal = a.effects.find((effect) => effect.kind === 'reveal');
  if (reveal?.kind !== 'reveal') throw new Error(`${a.id} must reveal`);
  return reveal.radius;
}

const SONAR = ability('heron_sonar', 'hold');
const SONAR_MAX = SONAR.activation.maxDuration;
const SONAR_COOLDOWN = cooldownOf(SONAR);
const SONAR_RADIUS = revealRadius(SONAR);
const PITON = ability('cairn_piton', 'toggle');
const PITON_COOLDOWN = cooldownOf(PITON);

/** Sonar's channel with a modifier in place of the reveal, so the effect scaling is visible
 *  without the reveal handler: same id and activation (channelProgress reads them from content),
 *  same radius. */
const SONAR_PROBE: AbilityOf<'hold'> = {
  ...SONAR,
  effects: [{ kind: 'modifier', stats: { moveSpeed: 0.5 }, duration: 0, radius: SONAR_RADIUS, targets: 'all' }],
};

/** Set Piton with a time limit (no toggle in the data has one). */
const TIMED_PITON: AbilityOf<'toggle'> = { ...PITON, activation: { kind: 'toggle', maxDuration: 1 } };

function slot0(e: CharacterEntity): AbilityState {
  const slot = e.abilities[0];
  if (!slot) throw new Error(`character ${e.id} has no ability slot`);
  return slot;
}

const hasModifierFrom = (e: CharacterEntity, sourceId: string): boolean => e.modifiers.some((m) => m.sourceId === sourceId);

/** Steps once with an input per character (others idle); returns the events. */
function stepAll(sim: Sim, inputs: readonly (readonly [CharacterEntity, Input])[]): SimEvent[] {
  return sim.step(new Map(inputs.map(([e, input]) => [e.id, commandFor(sim.state.tick + 1, e, input)])));
}

describe('hold and toggle controllers (ADR-0012 §16)', () => {
  it('are implemented; Set Piton runs end to end (Sonar also needs the reveal handler)', () => {
    expect([HOLD_ACTIVATION.implemented, TOGGLE_ACTIVATION.implemented, isAbilitySupported(PITON)]).toEqual([true, true, true]);
  });
});

describe('hold: Heron’s Sonar Pulse (ADR-0012 §1.3)', () => {
  it('a press spends the cooldown and starts a channel that blocks the weapon (no shot, no ADS)', async () => {
    const { sim, player } = await world('heron', vec3(-30, 0, 25), EAST);
    const slot = slot0(player);
    const pressed = run(sim, player, 1, { buttons: BUTTON.ability1 });
    expect(ofType(pressed, 'ability')).toEqual([expect.objectContaining({ entityId: player.id, abilityId: SONAR.id, slot: 0 })]);
    expect(ofType(pressed, 'abilityFailed')).toHaveLength(0);
    expect(slot.active).toEqual({ kind: 'channel', elapsed: 0 });
    expect(slot.resource.timer).toBe(SONAR_COOLDOWN);

    const held = run(sim, player, SECONDS(0.5), { buttons: BUTTON.ability1 | BUTTON.fire | BUTTON.ads });
    expect(ofType(held, 'shot')).toHaveLength(0);
    expect(player.weapon.ads).toBe(0);
    expect([weaponBlockedBy(player), canFire(player)]).toEqual(['channel', false]);
    expect(slot.active?.kind).toBe('channel');
  });

  it('channel progress rises linearly with the time held', async () => {
    const { sim, player } = await world('heron', vec3(-30, 0, 25), EAST);
    const slot = slot0(player);
    run(sim, player, 1, { buttons: BUTTON.ability1 });
    let ticks = 0;
    for (const target of [1, 30, 75, 120]) {
      run(sim, player, target - ticks, { buttons: BUTTON.ability1 });
      ticks = target;
      expect(channelProgress(slot)).toBeCloseTo((ticks * TICK_DT) / SONAR_MAX, 9);
    }
  });

  it('release ends it (released); the cooldown counts from the end and the weapon is free again', async () => {
    const { sim, player } = await world('heron', vec3(-30, 0, 25), EAST);
    const slot = slot0(player);
    run(sim, player, 1, { buttons: BUTTON.ability1 });
    run(sim, player, SECONDS(1), { buttons: BUTTON.ability1 });
    expect(slot.resource.timer).toBe(SONAR_COOLDOWN); // held while channelling

    const released = run(sim, player, 1);
    expect(ofType(released, 'abilityEnd')).toEqual([
      expect.objectContaining({ entityId: player.id, abilityId: SONAR.id, slot: 0, reason: 'released' }),
    ]);
    expect([slot.active, channelProgress(slot), weaponBlockedBy(player)]).toEqual([null, null, null]);
    run(sim, player, SECONDS(1));
    expect(slot.resource.timer).toBeCloseTo(SONAR_COOLDOWN - 1, 6);
    expect(ofType(run(sim, player, 1, { buttons: BUTTON.fire }), 'shot')).toHaveLength(1);

    const again = run(sim, player, 1, { buttons: BUTTON.ability1 });
    expect(ofType(again, 'abilityFailed')).toEqual([expect.objectContaining({ abilityId: SONAR.id, reason: 'notReady' })]);
    expect(ofType(again, 'ability')).toHaveLength(0);
    expect(slot.active).toBeNull();
  });

  it('ends at maxDuration while the key stays down, and does not restart without a new press', async () => {
    const { sim, player } = await world('heron', vec3(-30, 0, 25), EAST);
    const slot = slot0(player);
    run(sim, player, 1, { buttons: BUTTON.ability1 });
    const events: SimEvent[] = [];
    let ticks = 0;
    while (slot.active && ticks < SECONDS(SONAR_MAX) + 10) {
      events.push(...run(sim, player, 1, { buttons: BUTTON.ability1 }));
      ticks += 1;
    }
    // Exactly secondsToTicks(maxDuration) ticks (isTimeUp), whatever the summed tick lengths drift.
    expect(ticks).toBe(SECONDS(SONAR_MAX));
    expect(ofType(events, 'abilityEnd')).toEqual([expect.objectContaining({ abilityId: SONAR.id, slot: 0, reason: 'maxDuration' })]);

    const after = run(sim, player, SECONDS(1), { buttons: BUTTON.ability1 });
    expect(after.filter((e) => e.type === 'ability' || e.type === 'abilityFailed' || e.type === 'abilityEnd')).toEqual([]);
    expect(slot.active).toBeNull();
    expect(slot.resource.timer).toBeCloseTo(SONAR_COOLDOWN - 1, 6);
  });

  it('death ends the channel (died)', async () => {
    const { sim, player } = await world('heron', vec3(-30, 0, 25), EAST);
    const position = vec3(-26, 0, 25);
    const shooter = sim.spawnCharacter({ operatorId: 'heron', team: 1, controller: 'bot', position, yaw: anglesTo(position, player.pos).yaw });
    const idle = [[shooter, {}]] as const;
    for (let i = 0; i < 10; i++) stepAll(sim, [[player, {}], ...idle]); // settle the shooter
    stepAll(sim, [[player, { buttons: BUTTON.ability1 }], ...idle]);
    expect(slot0(player).active?.kind).toBe('channel');

    const eye = vec3(shooter.pos.x, shooter.pos.y + eyeHeight(shooter.stance), shooter.pos.z);
    const aim = anglesTo(eye, zoneWorldCenter(player, 'head'));
    const events: SimEvent[] = [];
    for (let i = 0; player.alive && i < SECONDS(SONAR_MAX) - 2; i++) {
      // Alternate the trigger: every other tick is a fresh press (semi-automatic weapons).
      const fire = i % 2 === 0 ? BUTTON.fire : 0;
      events.push(...stepAll(sim, [[player, { buttons: BUTTON.ability1 }], [shooter, { ...aim, buttons: fire }]]));
    }
    expect(player.alive).toBe(false);
    expect(ofType(events, 'kill')).toEqual([expect.objectContaining({ victimId: player.id, attackerId: shooter.id })]);
    expect(ofType(events, 'abilityEnd')).toEqual([
      expect.objectContaining({ entityId: player.id, abilityId: SONAR.id, slot: 0, reason: 'died' }),
    ]);
    expect(slot0(player).active).toBeNull();
  });

  it('re-applies its effects every tick at the user’s feet with the radius growing to full at maxDuration', async () => {
    const w = await abilityWorld();
    const heron = w.add('heron', 0, vec3(-30, 0, 25));
    const others = [0.25, 0.75, 1.1].map((fraction) => w.add('wisp', 1, vec3(-30 + fraction * SONAR_RADIUS, 0, 25)));
    const slot = slot0(heron);
    const held = (tick: number) => commandFor(tick, heron, { buttons: BUTTON.ability1 });
    HOLD_ACTIVATION.press(w.ctx, heron, 0, SONAR_PROBE, held(1));
    expect(ofType(w.drain(), 'ability')).toHaveLength(1);
    expect(slot.active).toEqual({ kind: 'channel', elapsed: 0 });
    expect([heron, ...others].some((e) => hasModifierFrom(e, SONAR.id))).toBe(false); // nothing on the press tick

    let elapsed = 0;
    const firstReached = new Map<CharacterEntity, number>();
    for (let tick = 1; slot.active && tick <= SECONDS(SONAR_MAX) + 10; tick++) {
      HOLD_ACTIVATION.sustain(w.ctx, heron, 0, SONAR_PROBE, held(tick), TICK_DT);
      elapsed += TICK_DT;
      const reach = Math.min(1, elapsed / SONAR_MAX) * SONAR_RADIUS;
      for (const e of [heron, ...others]) {
        expect(hasModifierFrom(e, SONAR.id)).toBe(bodyDistance(e, heron.pos) <= reach);
        if (hasModifierFrom(e, SONAR.id) && !firstReached.has(e)) firstReached.set(e, elapsed);
      }
      // Sustained: lapses right after the last re-application.
      expect(heron.modifiers.find((m) => m.sourceId === SONAR.id)?.remaining).toBe(ABILITY_RULES.sustainSeconds);
    }
    const [quarter, threeQuarters, outside] = others;
    expect(firstReached.get(heron)).toBeCloseTo(TICK_DT, 9);
    expect(firstReached.get(quarter as CharacterEntity)).toBeCloseTo(0.25 * SONAR_MAX, 1);
    expect(firstReached.get(threeQuarters as CharacterEntity)).toBeCloseTo(0.75 * SONAR_MAX, 1);
    expect(firstReached.has(outside as CharacterEntity)).toBe(false);
    expect(ofType(w.drain(), 'abilityEnd')).toEqual([expect.objectContaining({ abilityId: SONAR.id, reason: 'maxDuration' })]);
  });
});

describe('toggle: Cairn’s Set Piton (ADR-0012 §1.3)', () => {
  it('switches on and off with presses, never ends by itself, and cools down only after off', async () => {
    const { sim, player } = await world('cairn', vec3(-30, 0, 25), EAST);
    const slot = slot0(player);
    const on = run(sim, player, 1, { buttons: BUTTON.ability1 });
    expect(ofType(on, 'ability')).toEqual([expect.objectContaining({ entityId: player.id, abilityId: PITON.id, slot: 0 })]);
    expect(slot.active).toEqual({ kind: 'on', elapsed: 0 });
    expect(slot.resource.timer).toBe(PITON_COOLDOWN);

    const kept = [...run(sim, player, SECONDS(1), { buttons: BUTTON.ability1 }), ...run(sim, player, SECONDS(10))];
    expect(ofType(kept, 'abilityEnd')).toHaveLength(0);
    expect(slot.active?.kind).toBe('on');
    expect(slot.active?.kind === 'on' ? slot.active.elapsed : 0).toBeCloseTo(11, 6);
    expect(slot.resource.timer).toBe(PITON_COOLDOWN);

    const off = run(sim, player, 1, { buttons: BUTTON.ability1 });
    expect(ofType(off, 'abilityEnd')).toEqual([
      expect.objectContaining({ entityId: player.id, abilityId: PITON.id, slot: 0, reason: 'toggledOff' }),
    ]);
    expect(ofType(off, 'ability')).toHaveLength(0); // the off press does not switch it on again
    expect(slot.active).toBeNull();
    run(sim, player, SECONDS(1));
    expect(slot.resource.timer).toBeCloseTo(PITON_COOLDOWN - 1, 6);
    const early = run(sim, player, 1, { buttons: BUTTON.ability1 });
    expect(ofType(early, 'abilityFailed')).toEqual([expect.objectContaining({ abilityId: PITON.id, reason: 'notReady' })]);
    expect(slot.active).toBeNull();
  });

  it('holds topSpeed at 0 while on, keeps the weapon free, and lets go within sustainSeconds after off', async () => {
    const { sim, player } = await world('cairn', vec3(-30, 0, 25), EAST);
    const normal = topSpeed(player);
    expect(normal).toBeGreaterThan(0);
    run(sim, player, 1, { buttons: BUTTON.ability1 });
    run(sim, player, 1); // the first sustained application
    expect(topSpeed(player)).toBe(0);
    expect(player.modifiers).toEqual([expect.objectContaining({ sourceId: PITON.id, remaining: ABILITY_RULES.sustainSeconds })]);

    const start = { ...player.pos };
    run(sim, player, SECONDS(1), { moveZ: 1 });
    expect(Math.hypot(player.pos.x - start.x, player.pos.z - start.z)).toBeLessThan(1e-3);
    expect([weaponBlockedBy(player), canFire(player)]).toEqual([null, true]);
    expect(ofType(run(sim, player, 1, { buttons: BUTTON.fire }), 'shot').length).toBeGreaterThan(0);
    run(sim, player, SECONDS(0.5));

    run(sim, player, 1, { buttons: BUTTON.ability1 }); // off
    expect(modifierProduct(player, 'moveSpeed')).toBe(0); // still lapsing
    run(sim, player, SECONDS(ABILITY_RULES.sustainSeconds));
    expect(player.modifiers).toHaveLength(0);
    expect(topSpeed(player)).toBe(normal);
  });

  it('ends at maxDuration when the data sets one, re-applying its effects every tick until then', async () => {
    const w = await abilityWorld();
    const cairn = w.add('cairn', 0, vec3(-30, 0, 25));
    const slot = slot0(cairn);
    const tickWith = (tick: number, buttons: number, act: (cmd: Command) => void): void => {
      const cmd = commandFor(tick, cairn, { buttons });
      act(cmd);
      cairn.lastButtons = cmd.buttons; // as Sim.step's last step
    };
    tickWith(1, BUTTON.ability1, (cmd) => TOGGLE_ACTIVATION.press(w.ctx, cairn, 0, TIMED_PITON, cmd));
    expect(slot.active).toEqual({ kind: 'on', elapsed: 0 });
    let ticks = 0;
    while (slot.active && ticks < SECONDS(1) + 10) {
      ticks += 1;
      tickWith(ticks + 1, 0, (cmd) => TOGGLE_ACTIVATION.sustain(w.ctx, cairn, 0, TIMED_PITON, cmd, TICK_DT));
      expect(cairn.modifiers.find((m) => m.sourceId === PITON.id)?.remaining).toBe(ABILITY_RULES.sustainSeconds);
    }
    expect(ticks).toBe(SECONDS(1));
    expect(ofType(w.drain(), 'abilityEnd')).toEqual([expect.objectContaining({ abilityId: PITON.id, reason: 'maxDuration' })]);
  });
});
