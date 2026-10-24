import { describe, expect, it } from 'vitest';
import type { SimView } from '../../src/ai/types.ts';
import { CHARACTER, MOVEMENT, secondsToTicks } from '../../src/config/sim.ts';
import { getOperator } from '../../src/data/content.ts';
import { RANGE_LEVEL } from '../../src/data/levels/range.ts';
import { SALTWORKS_LAYOUT, SALTWORKS_LEVEL } from '../../src/data/levels/saltworks.ts';
import { BUTTON, type Command } from '../../src/sim/command.ts';
import { eyeHeight, zoneWorldCenter } from '../../src/sim/hitbox.ts';
import { angleDelta, vec3, wrapAngle, type Vec3 } from '../../src/sim/math.ts';
import { createRng, deriveSeed, nextRandom } from '../../src/sim/rng.ts';
import { Sim } from '../../src/sim/sim.ts';
import { modifierProduct } from '../../src/sim/stats.ts';
import type { CharacterEntity, SimEvent } from '../../src/sim/types.ts';
import { EAST } from './support/world.ts';

// The read-only query surface (ADR-0011 §1) and the footstep events bots hear (§2), on the real
// Sim with Rapier in Node.

const FLOORS = SALTWORKS_LAYOUT.floors;
const EYE = CHARACTER.eyeHeight;

describe('SimQuery: line of sight', () => {
  it('is blocked by a wall and clear in the open (Saltworks)', async () => {
    const sim = await Sim.create(SALTWORKS_LEVEL);
    // Courtyard → office through the solid south facade (the office door is at x = −14).
    expect(sim.query.lineOfSight(vec3(-18, EYE, 0), vec3(-18, EYE, -8))).toBe(false);
    // … and through the office door it is clear.
    expect(sim.query.lineOfSight(vec3(-14, EYE, 0), vec3(-14, EYE, -8))).toBe(true);
    // Across the open courtyard between the containers and the spawn shields.
    expect(sim.query.lineOfSight(vec3(-10, EYE, 26), vec3(10, EYE, 26))).toBe(true);
    // Symmetric, and a zero-length segment is clear.
    expect(sim.query.lineOfSight(vec3(-18, EYE, -8), vec3(-18, EYE, 0))).toBe(false);
    expect(sim.query.lineOfSight(vec3(0, EYE, 26), vec3(0, EYE, 26))).toBe(true);
  });

  it('is never blocked by characters (movement capsules or hitbox sensors)', async () => {
    const sim = await Sim.create(SALTWORKS_LEVEL);
    const blocker = sim.spawnCharacter({ operatorId: 'basalt', team: 0, controller: 'bot', position: vec3(0, 0, 26), yaw: 0 });
    sim.step(new Map());
    const head = zoneWorldCenter(blocker, 'head');
    const chest = zoneWorldCenter(blocker, 'torso');
    // Straight through the head and the chest of the character standing in between.
    expect(sim.query.lineOfSight(vec3(-10, head.y, 26), vec3(10, head.y, 26))).toBe(true);
    expect(sim.query.lineOfSight(vec3(-10, chest.y, 26), vec3(10, chest.y, 26))).toBe(true);
    // Eye to the character's own zones (what perception casts) is clear too.
    expect(sim.query.lineOfSight(vec3(0, EYE, 36), head)).toBe(true);
  });

  it('puts zone centres inside the body at the right height, following the stance', async () => {
    const sim = await Sim.create(RANGE_LEVEL);
    const e = sim.spawnCharacter({ operatorId: 'wisp', team: 0, controller: 'bot', position: vec3(-30, 0, 25), yaw: 0 });
    const head = zoneWorldCenter(e, 'head');
    const torso = zoneWorldCenter(e, 'torso');
    expect(head.y).toBeCloseTo(eyeHeight(0), 1);
    expect(torso.y).toBeLessThan(head.y);
    expect(torso.y).toBeGreaterThan(1);
    e.stance = 1; // pose only: zoneWorldCenter reads the entity, no step needed
    expect(zoneWorldCenter(e, 'head').y).toBeCloseTo(eyeHeight(1), 1);
  });
});

describe('SimQuery: ground below', () => {
  it('finds both Saltworks floors and nothing beyond maxDrop', async () => {
    const sim = await Sim.create(SALTWORKS_LEVEL);
    // Site B (control room, upper floor) above the storage room (ground floor).
    expect(sim.query.groundBelow(vec3(14, FLOORS.upper + 1, -10), 3)).toBeCloseTo(FLOORS.upper, 5);
    expect(sim.query.groundBelow(vec3(14, FLOORS.upper - 1, -10), 4)).toBeCloseTo(FLOORS.ground, 5);
    expect(sim.query.groundBelow(vec3(14, FLOORS.upper - 1, -10), 1)).toBeNull();
    // The courtyard.
    expect(sim.query.groundBelow(vec3(0, 0.5, 26), 1)).toBeCloseTo(FLOORS.ground, 5);
  });

  it('is part of the view bots get: Sim satisfies SimView', async () => {
    const sim = await Sim.create(RANGE_LEVEL);
    const view: SimView = sim;
    expect(view.query.groundBelow(vec3(-30, 1, 25), 2)).toBeCloseTo(0, 5);
    expect(view.state.match).toEqual({ mode: 'range' });
  });
});

describe('angle and seed helpers', () => {
  it('wraps angles to (−π, π] and measures the short way round', () => {
    expect(wrapAngle(Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(wrapAngle(-Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(wrapAngle(1.5 * Math.PI)).toBeCloseTo(-0.5 * Math.PI, 12);
    expect(angleDelta(0.9 * Math.PI, -0.9 * Math.PI)).toBeCloseTo(0.2 * Math.PI, 12);
    expect(angleDelta(-0.9 * Math.PI, 0.9 * Math.PI)).toBeCloseTo(-0.2 * Math.PI, 12);
  });

  it('derives distinct, reproducible RNG streams per stream id', () => {
    const first = (seed: number, stream: number): number => nextRandom(createRng(deriveSeed(seed, stream)));
    expect(first(7, 3)).toBe(first(7, 3));
    const streams = new Set([1, 2, 3, 4, 5].map((id) => first(7, id)));
    expect(streams.size).toBe(5);
    expect(first(7, 1)).not.toBe(first(8, 1));
  });
});

// ── Footsteps ───────────────────────────────────────────────────────────────

type Footstep = Extract<SimEvent, { type: 'footstep' }>;

interface Walk {
  e: CharacterEntity;
  steps: Footstep[];
  /** Horizontal distance covered while grounded after the character got up to speed. */
  travel: number;
  seconds: number;
}

/** Spawns an operator on the open range floor, settles it (and its stance), then walks east. */
async function walk(operatorId: string, buttons: number, seconds: number, input: Partial<Command> = {}): Promise<Walk> {
  const sim = await Sim.create(RANGE_LEVEL);
  const e = sim.spawnCharacter({ operatorId, team: 0, controller: 'player', position: vec3(-35, 0, 25), yaw: EAST });
  const step = (cmd: Partial<Command>): SimEvent[] =>
    sim.step(new Map([[e.id, { tick: sim.state.tick + 1, moveX: 0, moveZ: 0, yaw: EAST, pitch: 0, buttons, ...cmd }]]));
  for (let i = 0; i < secondsToTicks(0.5); i++) step({}); // settle, crouch fully
  for (let i = 0; i < secondsToTicks(1); i++) step({ moveZ: 1, ...input }); // up to speed
  e.strideProgress = 0; // count whole strides from here
  const start: Vec3 = { ...e.pos };
  const steps: Footstep[] = [];
  for (let i = 0; i < secondsToTicks(seconds); i++) {
    for (const ev of step({ moveZ: 1, ...input })) if (ev.type === 'footstep' && ev.entityId === e.id) steps.push(ev);
  }
  return { e, steps, travel: Math.hypot(e.pos.x - start.x, e.pos.z - start.z), seconds };
}

const cadence = (w: Walk): number => w.steps.length / w.seconds;

/** The cadence rule itself: one footstep per whole stride travelled. */
const expectOnePerStride = (w: Walk): void => {
  expect(w.steps.length).toBe(Math.floor(w.travel / MOVEMENT.footsteps.strideM));
};

describe('footstep events', () => {
  it('come once per stride of grounded travel, at a standing walk loudness of 1', async () => {
    const w = await walk('basalt', 0, 2);
    expectOnePerStride(w);
    expect(w.steps.length).toBeGreaterThan(1);
    for (const s of w.steps) expect(s.loudness).toBeCloseTo(1, 9);
  });

  it('stay silent when standing still or turning on the spot', async () => {
    const sim = await Sim.create(RANGE_LEVEL);
    const e = sim.spawnCharacter({ operatorId: 'wisp', team: 0, controller: 'player', position: vec3(-35, 0, 25), yaw: EAST });
    const events: SimEvent[] = [];
    for (let i = 0; i < secondsToTicks(2); i++) {
      events.push(...sim.step(new Map([[e.id, { tick: sim.state.tick + 1, moveX: 0, moveZ: 0, yaw: EAST + i * 0.05, pitch: 0, buttons: 0 }]])));
    }
    expect(events.filter((ev) => ev.type === 'footstep')).toHaveLength(0);
  });

  it('follow the operator: the speedster steps faster than the anchor; Lightfoot halves loudness', async () => {
    const anchor = await walk('basalt', 0, 2);
    const speedster = await walk('wisp', 0, 2);
    expect(getOperator('wisp').moveSpeed).toBeGreaterThan(getOperator('basalt').moveSpeed);
    for (const w of [anchor, speedster]) expectOnePerStride(w);
    expect(cadence(speedster)).toBeGreaterThan(cadence(anchor) * 1.3);
    // Weight class is presentation only (timbre, chosen by the client); loudness per operator
    // comes from footstepVolume modifiers such as Kestrel's Lightfoot.
    const kestrel = await walk('kestrel', 0, 2);
    expectOnePerStride(kestrel);
    expect(kestrel.steps.length).toBeGreaterThan(0);
    expect(modifierProduct(kestrel.e, 'footstepVolume')).toBeLessThan(1);
    for (const s of kestrel.steps) expect(s.loudness).toBeCloseTo(modifierProduct(kestrel.e, 'footstepVolume'), 9);
  });

  it('follow the move state: sprinting is faster and louder, crouch-walking slower and quiet', async () => {
    const f = MOVEMENT.footsteps;
    const walking = await walk('wisp', 0, 2);
    const sprinting = await walk('wisp', BUTTON.sprint, 2);
    const crouching = await walk('wisp', BUTTON.crouch, 2);
    for (const w of [walking, sprinting, crouching]) expectOnePerStride(w);
    expect(cadence(sprinting)).toBeGreaterThan(cadence(walking) * 1.3);
    expect(cadence(crouching)).toBeLessThan(cadence(walking) * 0.7);
    for (const s of sprinting.steps) expect(s.loudness).toBeCloseTo(f.sprintLoudness, 9);
    for (const s of crouching.steps) expect(s.loudness).toBeCloseTo(f.crouchLoudness, 9);
    expect(f.crouchLoudness).toBeGreaterThan(0); // quiet, not silent (SPEC defines no silent walk)
    expect(f.crouchLoudness).toBeLessThan(1);
    expect(f.sprintLoudness).toBeGreaterThan(1);
  });

  it('never come while airborne', async () => {
    const sim = await Sim.create(RANGE_LEVEL);
    const e: CharacterEntity = sim.spawnCharacter({ operatorId: 'wisp', team: 0, controller: 'player', position: vec3(-35, 0, 25), yaw: EAST });
    let steps = 0;
    let airborneTicks = 0;
    for (let i = 0; i < secondsToTicks(3); i++) {
      const jump = i % 40 < 2 ? BUTTON.jump : 0; // hop repeatedly while running
      const events = sim.step(new Map([[e.id, { tick: sim.state.tick + 1, moveX: 0, moveZ: 1, yaw: EAST, pitch: 0, buttons: jump }]]));
      const stepped = events.some((ev) => ev.type === 'footstep');
      if (!e.grounded) airborneTicks += 1;
      if (stepped) {
        steps += 1;
        expect(e.grounded).toBe(true);
      }
    }
    expect(airborneTicks).toBeGreaterThan(secondsToTicks(0.5));
    expect(steps).toBeGreaterThan(0);
  });
});
