import { describe, expect, it } from 'vitest';
import { CHARACTER, MATCH } from '../../src/config/sim.ts';
import { getLevel, levelProblems, LEVELS, OPERATORS } from '../../src/data/content.ts';
import { alongDirection, directionYawDeg, levelExtent, rampSlopeDeg, stairsRun, type Direction } from '../../src/data/levels/geometry.ts';
import { RANGE_LAYOUT, RANGE_LEVEL } from '../../src/data/levels/range.ts';
import { SALTWORKS_LAYOUT, SALTWORKS_LEVEL } from '../../src/data/levels/saltworks.ts';
import { SIDES, type LevelDef, type SpawnPointDef, type Vec3Tuple } from '../../src/data/schema.ts';
import { BUTTON, type Command } from '../../src/sim/command.ts';
import { DEG2RAD, fromTuple } from '../../src/sim/math.ts';
import { Sim } from '../../src/sim/sim.ts';
import type { CharacterEntity } from '../../src/sim/types.ts';
import { SECONDS } from './support/world.ts';

// Levels are data; these tests check the data rules and then drive real characters through the
// real Sim (Rapier KCC) in Node: spawns settle, every floor connection is climbable.

/** Feet within this of a floor height count as standing on it. */
const ON_FLOOR = 0.05;
/** Settling may not move a character sideways by more than this (it would mean overlap). */
const MAX_SETTLE_DRIFT = 0.05;
/** SPEC §13: compact map, roughly 60 × 80 m. */
const SPEC_FOOTPRINT = { x: 60, z: 80, tolerance: 0.1 } as const;
const FLOORS = SALTWORKS_LAYOUT.floors;
/** Climb tests start this far before the bottom of a flight or ramp. */
const APPROACH = 2;

const bySpeed = [...OPERATORS].sort((a, b) => a.moveSpeed - b.moveSpeed);
const SLOWEST = bySpeed[0]?.id ?? '';
const FASTEST = bySpeed[bySpeed.length - 1]?.id ?? '';

type Input = Partial<Pick<Command, 'moveX' | 'moveZ' | 'yaw' | 'buttons'>>;

function step(sim: Sim, inputs: ReadonlyMap<CharacterEntity, Input>): void {
  const commands = new Map<number, Command>();
  for (const [e, input] of inputs) {
    commands.set(e.id, { tick: sim.state.tick + 1, moveX: 0, moveZ: 0, yaw: e.yaw, pitch: 0, buttons: 0, ...input });
  }
  sim.step(commands);
}

function run(sim: Sim, characters: readonly CharacterEntity[], seconds: number, input: Input = {}): void {
  const inputs = new Map(characters.map((e) => [e, input] as const));
  for (let i = 0; i < SECONDS(seconds); i++) step(sim, inputs);
}

/** Walks forward along `yaw` until `done()` or the time limit; returns whether it got there. */
function walkUntil(sim: Sim, e: CharacterEntity, yaw: number, done: () => boolean, maxSeconds: number, buttons = 0): boolean {
  for (let i = 0; i < SECONDS(maxSeconds) && !done(); i++) step(sim, new Map([[e, { moveZ: 1, yaw, buttons }]]));
  return done();
}

const spawn = (sim: Sim, operatorId: string, p: SpawnPointDef): CharacterEntity =>
  sim.spawnCharacter({ operatorId, team: 0, controller: 'bot', position: fromTuple(p.position), yaw: p.yawDeg * DEG2RAD });

/** Every spawn point a level defines, with a label for failure messages. */
function spawnPointsOf(level: LevelDef): { label: string; point: SpawnPointDef }[] {
  return [
    { label: 'player spawn', point: level.playerSpawn },
    ...(level.spawnZones ?? []).flatMap((z) => z.points.map((point, i) => ({ label: `${z.id}[${i}]`, point }))),
    ...(level.range?.dummies ?? []).map((point, i) => ({ label: `dummy[${i}]`, point })),
  ];
}

describe('level data', () => {
  it('registers the range and Saltworks and finds no problems in either', () => {
    expect(getLevel('range')).toBe(RANGE_LEVEL);
    expect(getLevel('saltworks')).toBe(SALTWORKS_LEVEL);
    for (const level of LEVELS) expect(levelProblems(level), level.id).toEqual([]);
  });

  it('keeps range-only furniture on the range and team data on the map', () => {
    expect(RANGE_LEVEL.range?.dummies.length).toBeGreaterThan(0);
    expect(RANGE_LEVEL.spawnZones).toBeUndefined();
    expect(SALTWORKS_LEVEL.range).toBeUndefined();
  });

  it('gives Saltworks two sites and full spawn zones for both sides (attackers choose between edges)', () => {
    expect(SALTWORKS_LEVEL.sites?.map((s) => s.id)).toEqual(['A', 'B']);
    const zones = SALTWORKS_LEVEL.spawnZones ?? [];
    for (const side of SIDES) expect(zones.some((z) => z.side === side), side).toBe(true);
    expect(zones.filter((z) => z.side === 'attack').length).toBeGreaterThanOrEqual(2);
    for (const z of zones) expect(z.points).toHaveLength(MATCH.teamSize);
  });

  it('puts site A on the ground floor and site B on the upper floor', () => {
    const [a, b] = SALTWORKS_LEVEL.sites ?? [];
    const floorOf = (center: Vec3Tuple, size: Vec3Tuple): number => center[1] - size[1] / 2;
    expect(a && floorOf(a.center, a.size)).toBeCloseTo(FLOORS.ground);
    expect(b && floorOf(b.center, b.size)).toBeCloseTo(FLOORS.upper);
  });

  it('stays compact (SPEC §13 footprint)', () => {
    const e = levelExtent(SALTWORKS_LEVEL);
    expect(e.max[0] - e.min[0]).toBeLessThanOrEqual(SPEC_FOOTPRINT.x * (1 + SPEC_FOOTPRINT.tolerance));
    expect(e.max[2] - e.min[2]).toBeLessThanOrEqual(SPEC_FOOTPRINT.z * (1 + SPEC_FOOTPRINT.tolerance));
  });

  it('spaces spawn points so the movement capsules never overlap', () => {
    for (const z of SALTWORKS_LEVEL.spawnZones ?? []) {
      z.points.forEach((p, i) =>
        z.points.slice(i + 1).forEach((q) => {
          const d = Math.hypot(p.position[0] - q.position[0], p.position[2] - q.position[2]);
          expect(d, z.id).toBeGreaterThan(2 * CHARACTER.radius);
        }),
      );
    }
  });

  it('only uses steps and slopes the character controller can climb', () => {
    const { step: s, vertical } = SALTWORKS_LAYOUT;
    expect(s.rise).toBeLessThan(CHARACTER.autostepMaxHeight);
    expect(s.depth).toBeGreaterThanOrEqual(CHARACTER.autostepMinWidth);
    expect(rampSlopeDeg(vertical.eastRamp)).toBeLessThan(CHARACTER.maxSlopeClimbDeg);
    for (const level of LEVELS) {
      for (const b of level.boxes.filter((box) => box.surface === 'ramp')) {
        const [pitch = 0, , roll = 0] = b.rotationDeg ?? [];
        expect(Math.max(Math.abs(pitch), Math.abs(roll)), level.id).toBeLessThan(CHARACTER.maxSlopeClimbDeg);
      }
    }
  });

  it('reports broken level data', () => {
    const [zone] = SALTWORKS_LEVEL.spawnZones ?? [];
    const [site] = SALTWORKS_LEVEL.sites ?? [];
    if (!zone || !site) throw new Error('expected spawn zones and sites');
    const broken: LevelDef = {
      ...SALTWORKS_LEVEL,
      playerSpawn: { position: [0, 0, 500], yawDeg: 0 },
      spawnZones: [{ ...zone, points: zone.points.slice(1) }, zone],
      sites: [site, site],
    };
    const problems = levelProblems(broken).join('\n');
    expect(problems).toMatch(/player spawn lies outside/);
    expect(problems).toMatch(`needs ${MATCH.teamSize} points`);
    expect(problems).toMatch(/spawn zone ids must be unique/);
    expect(problems).toMatch(/no spawn zone for side 'defend'/);
    expect(problems).toMatch(/site ids must be unique/);
  });
});

describe('spawns (real Sim)', () => {
  it.each(LEVELS.map((l) => [l.id, l] as const))('%s: every spawn point settles on the ground and can walk away', async (_, level) => {
    const sim = await Sim.create(level);
    const points = spawnPointsOf(level);
    const characters = points.map(({ point }) => spawn(sim, SLOWEST, point));
    run(sim, characters, 0.5);
    points.forEach(({ label, point }, i) => {
      const e = characters[i];
      if (!e) throw new Error('missing character');
      expect(e.grounded, label).toBe(true);
      expect(Math.abs(e.pos.y - point.position[1]), label).toBeLessThan(ON_FLOOR);
      expect(Math.hypot(e.pos.x - point.position[0], e.pos.z - point.position[2]), label).toBeLessThan(MAX_SETTLE_DRIFT);
    });

    // Not wedged in geometry: everyone walks forward at once (facing is part of the spawn).
    const before = characters.map((e) => ({ x: e.pos.x, z: e.pos.z }));
    run(sim, characters, 1, { moveZ: 1 });
    characters.forEach((e, i) => {
      const b = before[i] ?? { x: NaN, z: NaN };
      expect(Math.hypot(e.pos.x - b.x, e.pos.z - b.z), points[i]?.label).toBeGreaterThan(1);
      expect(e.pos.y, points[i]?.label).toBeGreaterThan(-ON_FLOOR);
    });
  });
});

describe('Saltworks floor connections (real Sim)', () => {
  const { lobbyStairs, serviceStairs, hallStairs, eastRamp } = SALTWORKS_LAYOUT.vertical;
  const CONNECTIONS: { name: string; start: Vec3Tuple; direction: Direction; run: number }[] = [
    { name: 'lobby stairs', start: lobbyStairs.start, direction: lobbyStairs.direction, run: stairsRun(lobbyStairs) },
    { name: 'service stairs', start: serviceStairs.start, direction: serviceStairs.direction, run: stairsRun(serviceStairs) },
    { name: 'hall stairs', start: hallStairs.start, direction: hallStairs.direction, run: stairsRun(hallStairs) },
    { name: 'east ramp', start: eastRamp.bottom, direction: eastRamp.direction, run: eastRamp.run },
  ];
  /** Finish this far past the top (on the upper floor). */
  const PAST_TOP = 1.2;

  /** Distance travelled along a direction from a start point. */
  const progress = (e: CharacterEntity, start: Vec3Tuple, d: Direction): number => {
    const u = alongDirection([0, 0, 0], d, 1);
    return (e.pos.x - start[0]) * u[0] + (e.pos.z - start[2]) * u[2];
  };

  async function climb(c: (typeof CONNECTIONS)[number], operatorId: string, buttons: number): Promise<void> {
    const sim = await Sim.create(SALTWORKS_LEVEL);
    const yawDeg = directionYawDeg(c.direction);
    const e = spawn(sim, operatorId, { position: alongDirection(c.start, c.direction, -APPROACH), yawDeg });
    run(sim, [e], 0.2);
    const arrived = walkUntil(sim, e, yawDeg * DEG2RAD, () => progress(e, c.start, c.direction) >= c.run + PAST_TOP, 8, buttons);
    expect(arrived).toBe(true);
    run(sim, [e], 0.3);
    expect(e.grounded).toBe(true);
    expect(e.pos.y).toBeCloseTo(FLOORS.upper, 1);
  }

  it.each(CONNECTIONS)('$name leads to the upper floor (fastest operator, sprinting)', (c) => climb(c, FASTEST, BUTTON.sprint));

  // Regression: climbing a step or slope used to cut the velocity to the distance achieved, so
  // low-acceleration operators stalled at the first step or the foot of a ramp.
  it.each(CONNECTIONS)('$name leads to the upper floor (slowest operator, walking)', (c) => climb(c, SLOWEST, 0));

  it('takes attackers from the east ramp through the landing door into site B', async () => {
    const siteB = SALTWORKS_LEVEL.sites?.find((s) => s.id === 'B');
    if (!siteB) throw new Error('expected site B');
    const inSiteB = (e: CharacterEntity): boolean => {
      const p: Vec3Tuple = [e.pos.x, e.pos.y, e.pos.z];
      return ([0, 1, 2] as const).every((i) => Math.abs(p[i] - siteB.center[i]) <= siteB.size[i] / 2);
    };

    const sim = await Sim.create(SALTWORKS_LEVEL);
    const yawDeg = directionYawDeg(eastRamp.direction);
    const e = spawn(sim, SLOWEST, { position: alongDirection(eastRamp.bottom, eastRamp.direction, -APPROACH), yawDeg });
    run(sim, [e], 0.2);
    expect(walkUntil(sim, e, yawDeg * DEG2RAD, () => e.pos.z <= SALTWORKS_LAYOUT.landingDoorZ, 8)).toBe(true);
    expect(walkUntil(sim, e, directionYawDeg('-x') * DEG2RAD, () => inSiteB(e), 6)).toBe(true);
    expect(e.pos.y).toBeCloseTo(FLOORS.upper, 1);
  });
});

describe('range movement course (real Sim)', () => {
  const CLIMBS = Object.entries(RANGE_LAYOUT.climbs).map(([name, c]) => ({ name, ...c }));

  it.each(CLIMBS)('$name leads onto its platform and back down, on the ground all the way (slowest operator)', async (c) => {
    const sim = await Sim.create(RANGE_LEVEL);
    const yawDeg = directionYawDeg(c.direction);
    const e = spawn(sim, SLOWEST, { position: alongDirection(c.foot, c.direction, -APPROACH), yawDeg });
    run(sim, [e], 0.2);
    const top = c.platform.center[1] + c.platform.size[1] / 2;
    let airborneTicks = 0;
    const until = (done: () => boolean) => (): boolean => {
      if (!e.grounded) airborneTicks += 1;
      return done();
    };
    const onTop = (): boolean => e.grounded && Math.abs(e.pos.y - top) < ON_FLOOR;
    expect(walkUntil(sim, e, yawDeg * DEG2RAD, until(onTop), 6)).toBe(true);
    // Walking down follows the steps or the slope instead of falling from edge to edge.
    const onGround = (): boolean => e.grounded && Math.abs(e.pos.y - c.foot[1]) < ON_FLOOR;
    expect(walkUntil(sim, e, (yawDeg + 180) * DEG2RAD, until(onGround), 6)).toBe(true);
    expect(airborneTicks).toBe(0);
  });
});
