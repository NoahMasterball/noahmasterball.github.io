import { describe, expect, it } from 'vitest';
import { createAimState, aimStep } from '../../src/ai/aim.ts';
import { createTeamIntel, observeIntel, receiveCallouts, shareContacts } from '../../src/ai/intel.ts';
import { findContact, hear, learnContact, MEMORY_TICKS, perceive, targetView, type Contact } from '../../src/ai/perception.ts';
import type { SimView } from '../../src/ai/types.ts';
import { AI, AI_TIERS, MOVEMENT, secondsToTicks } from '../../src/config/sim.ts';
import { RANGE_LEVEL } from '../../src/data/levels/range.ts';
import { BUTTON, type Command } from '../../src/sim/command.ts';
import { eyeHeight, zoneWorldCenter } from '../../src/sim/hitbox.ts';
import { anglesTo, distance, vec3, type Vec3 } from '../../src/sim/math.ts';
import { createRng, deriveSeed } from '../../src/sim/rng.ts';
import { Sim } from '../../src/sim/sim.ts';
import { aimOf } from '../../src/sim/systems/weapons.ts';
import type { CharacterEntity, EntityId, SimEvent } from '../../src/sim/types.ts';

// Bot perception (ADR-0011 §2, ADR-0012 §8/§10) on the real Sim with Rapier in Node: sight (cone
// → range → line of sight), hearing (shots, footsteps, abilities), reveals, memory and team
// callouts. Geometry: the test range's peek wall at z = −10 (x −30 … −25.6 solid) and its open
// floor.

const NORTH = 0; // yaw looking down −Z
const SOUTH = Math.PI; // yaw looking down +Z
const EAST = -Math.PI / 2; // yaw looking down +X

type Inputs = ReadonlyMap<EntityId, Partial<Command>>;

function step(sim: Sim, inputs: Inputs = new Map()): SimEvent[] {
  const commands = new Map<EntityId, Command>();
  for (const [id, input] of inputs) {
    const e = sim.getCharacter(id);
    if (e) commands.set(id, { tick: sim.state.tick + 1, moveX: 0, moveZ: 0, yaw: e.yaw, pitch: e.pitch, buttons: 0, ...input });
  }
  return sim.step(commands);
}

function spawn(sim: Sim, team: number, pos: Vec3, yaw: number, operatorId = 'wisp'): CharacterEntity {
  return sim.spawnCharacter({ operatorId, team, controller: 'bot', position: pos, yaw });
}

/** A SimView over `sim` that counts line-of-sight rays. */
function countingView(sim: Sim): { view: SimView; rays: { n: number } } {
  const rays = { n: 0 };
  const view: SimView = {
    state: sim.state,
    level: sim.level,
    query: {
      lineOfSight: (a, b) => {
        rays.n += 1;
        return sim.query.lineOfSight(a, b);
      },
      groundBelow: (p, maxDrop) => sim.query.groundBelow(p, maxDrop),
      surfaceAlong: (origin, dir, maxDist) => sim.query.surfaceAlong(origin, dir, maxDist),
      boxFree: (center, halfExtents, yaw) => sim.query.boxFree(center, halfExtents, yaw),
    },
  };
  return { view, rays };
}

const horizontal = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.z - b.z);

describe('sight', () => {
  it('never sees an enemy behind a wall, however long it looks', async () => {
    const sim = await Sim.create(RANGE_LEVEL);
    const bot = spawn(sim, 0, vec3(-28, 0, -4), NORTH);
    const hidden = spawn(sim, 1, vec3(-28, 0, -16), SOUTH);
    const { view, rays } = countingView(sim);
    const contacts: Contact[] = [];
    for (let i = 0; i < secondsToTicks(2); i++) {
      step(sim);
      perceive(view, bot, contacts, 0, hidden.id); // even as the "target" it is re-checked every tick
      expect(findContact(contacts, hidden.id)).toBeUndefined();
    }
    // In range and inside the cone, so every check reached the rays: head, then torso.
    expect(rays.n).toBe(2 * secondsToTicks(2));
  });

  it('sees an enemy in the open inside the cone at its next scan; not outside the cone', async () => {
    const sim = await Sim.create(RANGE_LEVEL);
    const bot = spawn(sim, 0, vec3(-16, 0, 25), NORTH);
    const ahead = spawn(sim, 1, vec3(-16, 0, 10), SOUTH);
    const behind = spawn(sim, 1, vec3(-16, 0, 32), SOUTH);
    const { view, rays } = countingView(sim);
    const contacts: Contact[] = [];
    const k = 1;
    let seenAt: number | null = null;
    for (let i = 0; i < AI.perception.scanIntervalTicks * 3; i++) {
      step(sim);
      perceive(view, bot, contacts, k, null);
      if (seenAt === null && findContact(contacts, ahead.id)) seenAt = sim.state.tick;
    }
    expect(seenAt).not.toBeNull();
    expect(((seenAt ?? 0) + k) % AI.perception.scanIntervalTicks).toBe(0); // the first scan tick
    const c = findContact(contacts, ahead.id);
    expect(c?.visible).toBe(true);
    expect(c?.source).toBe('sight');
    expect(c?.firstSeenTick).toBe(seenAt);
    // Behind the bot: filtered by the cone before any ray is cast (one ray per scan: the head).
    expect(findContact(contacts, behind.id)).toBeUndefined();
    expect(rays.n).toBe(3);
  });

  it('notices all round within nearAwarenessM', async () => {
    const sim = await Sim.create(RANGE_LEVEL);
    const bot = spawn(sim, 0, vec3(-16, 0, 25), NORTH);
    const close = spawn(sim, 1, vec3(-16, 0, 25 + AI.perception.nearAwarenessM - 0.5), NORTH);
    const contacts: Contact[] = [];
    for (let i = 0; i < AI.perception.scanIntervalTicks; i++) {
      step(sim);
      perceive(sim, bot, contacts, 0, null);
    }
    expect(findContact(contacts, close.id)?.visible).toBe(true);
  });

  it('starts aiming after exactly the tier reaction time since the sighting (hard < medium < easy)', async () => {
    const readyAfter: number[] = [];
    for (const tier of AI_TIERS) {
      const sim = await Sim.create(RANGE_LEVEL);
      const bot = spawn(sim, 0, vec3(-16, 0, 25), NORTH);
      const target = spawn(sim, 1, vec3(-14, 0, 10), SOUTH);
      const contacts: Contact[] = [];
      const aim = createAimState();
      const rng = createRng(deriveSeed(7, bot.id));
      let ready: number | null = null;
      let firstFire: number | null = null;
      for (let i = 0; i < secondsToTicks(2) && firstFire === null; i++) {
        perceive(sim, bot, contacts, 0, target.id);
        const c = findContact(contacts, target.id);
        const out = c ? aimStep(aim, AI.tiers[tier], bot, targetView(sim, c), sim.state.tick, rng) : null;
        if (c && out && !out.ready) {
          expect(out.fire).toBe(false);
          expect(out.yaw).toBe(bot.yaw); // no turn while reacting
        } else if (c && out) {
          ready ??= sim.state.tick - c.firstSeenTick;
        }
        if (out?.fire) firstFire = sim.state.tick;
        step(sim, new Map([[bot.id, out ? { yaw: out.yaw, pitch: out.pitch } : {}]]));
      }
      expect(ready).toBe(secondsToTicks(AI.tiers[tier].reactionTime));
      expect(firstFire).not.toBeNull();
      readyAfter.push(ready ?? 0);
    }
    const [easy, medium, hard] = readyAfter;
    expect(hard).toBeLessThan(medium ?? 0);
    expect(medium).toBeLessThan(easy ?? 0);
  });

  it('keeps the reaction timer through a short occlusion, restarts it after a long one', async () => {
    const sim = await Sim.create(RANGE_LEVEL);
    const bot = spawn(sim, 0, vec3(-28, 0, -2), NORTH);
    const target = spawn(sim, 1, vec3(-28, 0, -7), SOUTH); // in front of the peek wall
    const contacts: Contact[] = [];
    const run = (ticks: number): void => {
      for (let i = 0; i < ticks; i++) {
        step(sim);
        perceive(sim, bot, contacts, 0, target.id);
      }
    };
    const moveTo = (z: number): void => sim.control({ type: 'teleport', entityId: target.id, position: vec3(-28, 0, z), yaw: SOUTH, pitch: 0 });
    run(5);
    const first = findContact(contacts, target.id)?.firstSeenTick;
    expect(first).toBeDefined();

    const grace = secondsToTicks(AI.perception.reacquireGraceSeconds);
    moveTo(-14); // behind the wall
    run(Math.floor(grace / 2));
    expect(findContact(contacts, target.id)?.visible).toBe(false);
    moveTo(-7);
    run(2);
    expect(findContact(contacts, target.id)?.visible).toBe(true);
    expect(findContact(contacts, target.id)?.firstSeenTick).toBe(first); // re-peek: same sighting

    moveTo(-14);
    run(grace + 10);
    moveTo(-7);
    run(2);
    const c = findContact(contacts, target.id);
    expect(c?.visible).toBe(true);
    expect(c?.firstSeenTick).toBeGreaterThan(first ?? Infinity); // a new sighting: react again
  });

  it('never gives the aim model a true position without line of sight', async () => {
    const sim = await Sim.create(RANGE_LEVEL);
    const bot = spawn(sim, 0, vec3(-28, 0, -2), NORTH);
    const target = spawn(sim, 1, vec3(-28, 0, -7), SOUTH);
    const contacts: Contact[] = [];
    step(sim);
    perceive(sim, bot, contacts, 0, target.id);
    const c = findContact(contacts, target.id);
    if (!c) throw new Error('expected a sighting');
    expect(targetView(sim, c).points.head).toEqual(zoneWorldCenter(target, 'head'));
    // It walks behind the wall: the view stays at the last seen position, not the true one.
    sim.control({ type: 'teleport', entityId: target.id, position: vec3(-27, 0, -14), yaw: SOUTH, pitch: 0 });
    step(sim);
    perceive(sim, bot, contacts, 0, target.id);
    const tv = targetView(sim, c);
    expect(tv.visible).toBe(false);
    expect(horizontal(tv.points.torso, vec3(-28, 0, -7))).toBeLessThan(0.3);
    expect(horizontal(tv.points.torso, target.pos)).toBeGreaterThan(5);
  });
});

// ── Hearing ─────────────────────────────────────────────────────────────────

interface Listener {
  sim: Sim;
  bot: CharacterEntity;
  enemy: CharacterEntity;
  contacts: Contact[];
  /** Line-of-sight rays hear() cast since the settle. */
  rays: { n: number };
  /** Steps with the enemy's input; the bot perceives and hears every tick. Returns the events. */
  run(ticks: number, input: Partial<Command>): SimEvent[];
}

/** A bot looking north at `at` and an enemy at `enemyPos` (+Z of the bot is behind it). */
async function listener(enemyPos: Vec3, enemyYaw: number, enemyTeam = 1, at = vec3(0, 0, -20)): Promise<Listener> {
  const sim = await Sim.create(RANGE_LEVEL);
  const bot = spawn(sim, 0, at, NORTH);
  const enemy = spawn(sim, enemyTeam, enemyPos, enemyYaw);
  const contacts: Contact[] = [];
  const rng = createRng(deriveSeed(3, bot.id));
  const { view, rays } = countingView(sim);
  const run = (ticks: number, input: Partial<Command>): SimEvent[] => {
    const all: SimEvent[] = [];
    for (let i = 0; i < ticks; i++) {
      const events = step(sim, new Map([[enemy.id, input]]));
      perceive(sim, bot, contacts, 0, null);
      hear(view, bot, contacts, events, rng);
      all.push(...events);
    }
    return all;
  };
  run(secondsToTicks(0.5), {}); // settle
  rays.n = 0;
  return { sim, bot, enemy, contacts, rays, run };
}

/** Settles the stance, then moves towards `yaw` for `seconds` with `buttons` held. Returns the
 *  events of the move. */
function walk(l: Listener, yaw: number, buttons: number, seconds: number): SimEvent[] {
  l.run(secondsToTicks(0.5), { yaw, buttons });
  return l.run(secondsToTicks(seconds), { yaw, moveZ: 1, buttons });
}

const countOf = (events: readonly SimEvent[], type: SimEvent['type'], entityId: EntityId): number =>
  events.filter((ev) => ev.type === type && 'entityId' in ev && ev.entityId === entityId).length;

/** Line of sight between the two characters' eyes (what hear() casts for a gunshot). */
const eyeToEye = (l: Listener): boolean => l.sim.query.lineOfSight(aimOf(l.enemy).origin, aimOf(l.bot).origin);

describe('hearing', () => {
  it('hears a gunshot behind it (not seen) within gunshotRadiusM, placed within positionErrorM', async () => {
    const l = await listener(vec3(0, 0, -8), SOUTH); // 12 m behind, facing away
    l.run(3, { buttons: BUTTON.fire });
    const c = findContact(l.contacts, l.enemy.id);
    expect(c?.source).toBe('sound');
    expect(c?.visible).toBe(false);
    expect(horizontal(c?.pos ?? vec3(), l.enemy.pos)).toBeLessThanOrEqual(Math.SQRT2 * AI.hearing.positionErrorM);
    expect(c?.pos.y).toBeCloseTo(l.enemy.pos.y, 3);
    expect(12).toBeLessThan(AI.hearing.gunshotRadiusM);
  });

  it('hears sprinting beyond the walking radius; walking at that distance stays unheard', async () => {
    const f = MOVEMENT.footsteps;
    const at = 22; // m behind: walking radius < 22 < sprinting radius
    expect(AI.hearing.footstepRadiusM).toBeLessThan(at - 1);
    expect(AI.hearing.footstepRadiusM * f.sprintLoudness).toBeGreaterThan(at + 1);
    const walking = await listener(vec3(-3, 0, -20 + at), EAST);
    walk(walking, EAST, 0, 1);
    expect(findContact(walking.contacts, walking.enemy.id)).toBeUndefined();
    const sprinting = await listener(vec3(-3, 0, -20 + at), EAST);
    walk(sprinting, EAST, BUTTON.sprint, 1);
    const c = findContact(sprinting.contacts, sprinting.enemy.id);
    expect(c?.source).toBe('sound');
    expect(distance(sprinting.bot.pos, sprinting.enemy.pos)).toBeLessThan(AI.hearing.footstepRadiusM * f.sprintLoudness);
  });

  it('does not hear crouch-walking beyond its radius, but walking there and crouch-walking inside it', async () => {
    const quietRadius = AI.hearing.footstepRadiusM * MOVEMENT.footsteps.crouchLoudness;
    const far = await listener(vec3(-2, 0, -12), EAST); // 8 m behind
    expect(8).toBeGreaterThan(quietRadius + 1);
    walk(far, EAST, BUTTON.crouch, 3);
    expect(far.enemy.pos.x).toBeGreaterThan(1); // it did travel (several strides)
    expect(findContact(far.contacts, far.enemy.id)).toBeUndefined();

    const walking = await listener(vec3(-2, 0, -12), EAST);
    walk(walking, EAST, 0, 1);
    expect(findContact(walking.contacts, walking.enemy.id)?.source).toBe('sound');

    const near = await listener(vec3(-3, 0, -16), EAST); // 4 m behind, 5 m away at the start
    walk(near, EAST, BUTTON.crouch, 1.5);
    expect(distance(near.bot.pos, near.enemy.pos)).toBeLessThan(quietRadius);
    expect(findContact(near.contacts, near.enemy.id)?.source).toBe('sound');
  });

  it('ignores teammates', async () => {
    const l = await listener(vec3(-2, 0, -12), EAST, 0);
    walk(l, EAST, BUTTON.sprint, 1);
    l.run(3, { buttons: BUTTON.fire });
    expect(l.contacts).toHaveLength(0);
  });

  it('turns an incoming hit into a damage contact at the shooter', async () => {
    const l = await listener(vec3(0, 0, -10), SOUTH); // 10 m behind, not in the cone
    const eye: Vec3 = { x: l.enemy.pos.x, y: l.enemy.pos.y + eyeHeight(0), z: l.enemy.pos.z };
    const aim = anglesTo(eye, zoneWorldCenter(l.bot, 'torso'));
    let hit = false;
    for (let i = 0; i < 20 && !hit; i++) {
      const events = step(l.sim, new Map([[l.enemy.id, { yaw: aim.yaw, pitch: aim.pitch, buttons: i % 2 ? 0 : BUTTON.fire }]]));
      hit = events.some((ev) => ev.type === 'hit' && ev.victimId === l.bot.id);
      perceive(l.sim, l.bot, l.contacts, 0, null);
      hear(l.sim, l.bot, l.contacts, events, createRng(1));
    }
    expect(hit).toBe(true);
    const c = findContact(l.contacts, l.enemy.id);
    expect(c?.source).toBe('damage'); // beats the same tick's (blurred) gunshot
    expect(c?.visible).toBe(false);
    expect(distance(c?.pos ?? vec3(), l.enemy.pos)).toBeLessThan(1e-6);
  });

  it('forgets a kill and everything at a new round', async () => {
    const view = await Sim.create(RANGE_LEVEL);
    const self = spawn(view, 0, vec3(0, 0, 0), NORTH);
    const contacts: Contact[] = [];
    const c = (entityId: number): Contact => ({ entityId, pos: vec3(), vel: vec3(), tick: 1, firstSeenTick: 1, seenTick: 1, visible: false, source: 'sight' });
    contacts.push(c(2), c(3));
    hear(view, self, contacts, [{ type: 'kill', tick: 2, attackerId: 1, victimId: 2, cause: { kind: 'weapon', weaponId: 'wren_pistol' }, headshot: false }], createRng(1));
    expect(contacts.map((x) => x.entityId)).toEqual([3]);
    hear(view, self, contacts, [{ type: 'phase', tick: 3, phase: 'preRound', round: 2, attackingTeam: 0, endsAtTick: 100 }], createRng(1));
    expect(contacts).toHaveLength(0);
  });
});

// The peek wall at z = −10 (3 m high): x = WALL_X is behind its solid west half, x = DOOR_X in
// line with its doorway (open to 2.2 m, above every eye; the low cover at z = −20 is below them).
const WALL_X = -28;
const DOOR_X = -25;
const FIRE: Partial<Command> = { buttons: BUTTON.fire };

describe('hearing through walls', () => {
  it('a gunshot behind a wall carries only occludedRangeFactor × gunshotRadiusM; through a doorway the full range', async () => {
    const at = 36; // m: occluded range < 36 < full range
    expect(AI.hearing.gunshotRadiusM * AI.hearing.occludedRangeFactor).toBeLessThan(at - 1);
    expect(AI.hearing.gunshotRadiusM).toBeGreaterThan(at + 1);

    const walled = await listener(vec3(WALL_X, 0, -26 + at), SOUTH, 1, vec3(WALL_X, 0, -26));
    expect(eyeToEye(walled)).toBe(false);
    const shots = countOf(walled.run(3, FIRE), 'shot', walled.enemy.id);
    expect(shots).toBeGreaterThan(0);
    expect(findContact(walled.contacts, walled.enemy.id)).toBeUndefined();
    expect(walled.rays.n).toBe(shots); // one ray per sound within the full range

    const open = await listener(vec3(DOOR_X, 0, -26 + at), SOUTH, 1, vec3(DOOR_X, 0, -26));
    expect(eyeToEye(open)).toBe(true);
    open.run(3, FIRE);
    const c = findContact(open.contacts, open.enemy.id);
    expect(c?.source).toBe('sound');
    expect(c?.visible).toBe(false);
    expect(horizontal(c?.pos ?? vec3(), open.enemy.pos)).toBeLessThanOrEqual(Math.SQRT2 * AI.hearing.positionErrorM);
  });

  it('hears a gunshot behind a wall within the occluded range, placed within the coarser occludedPositionErrorM', async () => {
    const sim = await Sim.create(RANGE_LEVEL);
    const bot = spawn(sim, 0, vec3(WALL_X, 0, -26), NORTH);
    const enemy = spawn(sim, 1, vec3(WALL_X, 0, -6), SOUTH); // 20 m, the wall 16 m away
    step(sim);
    const origin = aimOf(enemy).origin;
    expect(distance(aimOf(bot).origin, origin)).toBeLessThan(AI.hearing.gunshotRadiusM * AI.hearing.occludedRangeFactor);
    expect(sim.query.lineOfSight(origin, aimOf(bot).origin)).toBe(false);
    const rng = createRng(5);
    let worst = 0;
    for (let tick = 1; tick <= 40; tick++) {
      const contacts: Contact[] = [];
      hear(sim, bot, contacts, [{ type: 'shot', tick, entityId: enemy.id, weaponId: 'wren_pistol', origin, dir: vec3(0, 0, 1) }], rng);
      const c = findContact(contacts, enemy.id);
      expect(c?.source).toBe('sound');
      const p = c?.pos ?? vec3();
      worst = Math.max(worst, Math.abs(p.x - enemy.pos.x), Math.abs(p.z - enemy.pos.z));
    }
    // Per axis within ± occludedPositionErrorM, and beyond the clear-line ± positionErrorM.
    expect(worst).toBeLessThanOrEqual(AI.hearing.occludedPositionErrorM);
    expect(worst).toBeGreaterThan(AI.hearing.positionErrorM);
  });

  it('hears walking behind a wall only within occludedRangeFactor × footstepRadiusM; in line with the doorway beyond it', async () => {
    // The enemy walks away (south) from 11 m: occluded walking radius < 11 … end < walking radius.
    const occluded = AI.hearing.footstepRadiusM * AI.hearing.occludedRangeFactor;
    expect(occluded).toBeLessThan(11 - 1);

    const walled = await listener(vec3(WALL_X, 0, -3), SOUTH, 1, vec3(WALL_X, 0, -14));
    const steps = countOf(walk(walled, SOUTH, 0, 1), 'footstep', walled.enemy.id);
    expect(steps).toBeGreaterThan(1);
    expect(distance(walled.bot.pos, walled.enemy.pos)).toBeLessThan(AI.hearing.footstepRadiusM);
    expect(findContact(walled.contacts, walled.enemy.id)).toBeUndefined();
    expect(walled.rays.n).toBe(steps);

    const open = await listener(vec3(DOOR_X, 0, -3), SOUTH, 1, vec3(DOOR_X, 0, -14));
    walk(open, SOUTH, 0, 1);
    expect(distance(open.bot.pos, open.enemy.pos)).toBeLessThan(AI.hearing.footstepRadiusM);
    expect(findContact(open.contacts, open.enemy.id)?.source).toBe('sound');
  });

  it('casts no hearing ray beyond the full range or for an enemy in sight', async () => {
    const far = await listener(vec3(-35, 0, 20), SOUTH, 1, vec3(-35, 0, -50)); // 70 m, open
    expect(AI.hearing.gunshotRadiusM).toBeLessThan(70 - 1);
    expect(countOf(far.run(3, FIRE), 'shot', far.enemy.id)).toBeGreaterThan(0);
    expect(findContact(far.contacts, far.enemy.id)).toBeUndefined();
    expect(far.rays.n).toBe(0);

    const seen = await listener(vec3(0, 0, -30), NORTH); // 10 m in front, shooting away
    expect(findContact(seen.contacts, seen.enemy.id)?.visible).toBe(true);
    expect(countOf(seen.run(3, FIRE), 'shot', seen.enemy.id)).toBeGreaterThan(0);
    expect(findContact(seen.contacts, seen.enemy.id)?.source).toBe('sight');
    expect(seen.rays.n).toBe(0);
  });
});

// ── Abilities (ADR-0012 §8, §10) ────────────────────────────────────────────

describe('reveals', () => {
  it('turn a revealed enemy behind a wall into an exact, unseen reveal contact for every bot of the team, each tick', async () => {
    const sim = await Sim.create(RANGE_LEVEL);
    const bot = spawn(sim, 0, vec3(WALL_X, 0, -2), NORTH);
    const mate = spawn(sim, 0, vec3(0, 0, 20), SOUTH); // far away, looking elsewhere
    const enemy = spawn(sim, 1, vec3(WALL_X, 0, -16), SOUTH); // behind the peek wall
    const { view, rays } = countingView(sim);
    step(sim);
    const memories = [bot, mate].map((): Contact[] => []);
    const perceiveAll = (): void => [bot, mate].forEach((b, k) => perceive(view, b, memories[k] ?? [], k, null));
    perceiveAll();
    expect(memories.flat()).toEqual([]); // not seen, not revealed

    enemy.reveals.push({ team: bot.team, sourceId: 'heron_sonar', remaining: 0.5 });
    const walk: Partial<Command> = { moveZ: 1, yaw: SOUTH }; // it keeps moving behind the wall
    for (let i = 0; i < 5; i++) {
      step(sim, new Map([[enemy.id, walk]]));
      rays.n = 0;
      perceiveAll();
      for (const contacts of memories) {
        const c = findContact(contacts, enemy.id);
        expect(c).toMatchObject({ source: 'reveal', visible: false, seenTick: null, tick: sim.state.tick });
        expect(c?.pos).toEqual(enemy.pos);
        expect(c?.vel).toEqual(enemy.vel);
      }
      expect(rays.n).toBeLessThanOrEqual(4); // a reveal casts no ray (only the scans: head + torso)
    }
    // The reveal runs out: the contact stays where the enemy was last revealed.
    for (let i = 0; i < secondsToTicks(0.5); i++) step(sim, new Map([[enemy.id, walk]]));
    const last = findContact(memories[0] ?? [], enemy.id)?.pos;
    perceiveAll();
    expect(findContact(memories[0] ?? [], enemy.id)?.pos).toEqual(last);
    expect(distance(last ?? vec3(), enemy.pos)).toBeGreaterThan(1);
  });

  it('rank between sight and damage: sight beats a reveal, a reveal beats the same tick’s sound or hit', async () => {
    const sim = await Sim.create(RANGE_LEVEL);
    const bot = spawn(sim, 0, vec3(-16, 0, 25), NORTH);
    const open = spawn(sim, 1, vec3(-16, 0, 10), SOUTH); // in sight
    const hidden = spawn(sim, 1, vec3(WALL_X, 0, -16), SOUTH);
    for (const e of [open, hidden]) e.reveals.push({ team: bot.team, sourceId: 'lattice_nodes', remaining: 1 });
    step(sim);
    const contacts: Contact[] = [];
    perceive(sim, bot, contacts, 0, open.id); // the target is sight-checked every tick
    expect(findContact(contacts, open.id)).toMatchObject({ source: 'sight', visible: true });
    const tick = sim.state.tick;
    const c = findContact(contacts, hidden.id);
    expect(c?.source).toBe('reveal');
    // The same tick's sound and hit do not replace it (a later tick's would).
    learnContact(contacts, hidden.id, vec3(), tick, tick, 'sound');
    learnContact(contacts, hidden.id, vec3(), tick, tick, 'damage');
    expect(c?.source).toBe('reveal');
    expect(c?.pos).toEqual(hidden.pos);
  });
});

describe('ability sounds and hits', () => {
  const ability = (entityId: EntityId, tick: number, pos: Vec3): SimEvent => ({ type: 'ability', tick, entityId, abilityId: 'basalt_brace', slot: 0, pos });

  it('hears an enemy ability within abilityRadiusM (muffled by walls like every sound); not beyond; not a teammate', async () => {
    const sim = await Sim.create(RANGE_LEVEL);
    const bot = spawn(sim, 0, vec3(-16, 0, 25), NORTH);
    const mate = spawn(sim, 0, vec3(-10, 0, 25), NORTH);
    const enemy = spawn(sim, 1, vec3(-16, 0, 30), SOUTH);
    const rng = createRng(2);
    // Down the open floor (clear of the bench and the peek walls), just inside / outside the radius.
    const near = vec3(-16, 0, 25 - (AI.hearing.abilityRadiusM - 1));
    const far = vec3(-16, 0, 25 - (AI.hearing.abilityRadiusM + 1));
    const contacts: Contact[] = [];
    hear(sim, bot, contacts, [ability(enemy.id, 1, far), ability(mate.id, 1, near)], rng);
    expect(contacts).toEqual([]);
    hear(sim, bot, contacts, [ability(enemy.id, 2, near)], rng);
    const c = findContact(contacts, enemy.id);
    expect(c).toMatchObject({ source: 'sound', visible: false, tick: 2 });
    expect(horizontal(c?.pos ?? vec3(), near)).toBeLessThanOrEqual(Math.SQRT2 * AI.hearing.positionErrorM);

    // Behind the peek wall: only within occludedRangeFactor × the radius.
    const walled = spawn(sim, 0, vec3(WALL_X, 0, -2), NORTH);
    const behind = (d: number): Vec3 => vec3(WALL_X, 0, -2 - d);
    const muffled: Contact[] = [];
    const occluded = AI.hearing.abilityRadiusM * AI.hearing.occludedRangeFactor;
    hear(sim, walled, muffled, [ability(enemy.id, 3, behind(occluded + 1))], rng);
    expect(muffled).toEqual([]);
    hear(sim, walled, muffled, [ability(enemy.id, 4, behind(occluded - 1))], rng);
    expect(findContact(muffled, enemy.id)?.source).toBe('sound');
  });

  it('an ability hit (burst, area) makes no contact: its source is not the attacker; a weapon hit does', async () => {
    const sim = await Sim.create(RANGE_LEVEL);
    const bot = spawn(sim, 0, vec3(0, 0, 0), NORTH);
    const enemy = spawn(sim, 1, vec3(0, 0, -20), SOUTH);
    const hit = (tick: number, cause: Extract<SimEvent, { type: 'hit' }>['cause'], sourcePos: Vec3): SimEvent => ({
      type: 'hit',
      tick,
      attackerId: enemy.id,
      victimId: bot.id,
      zone: 'torso',
      damage: 10,
      distance: 5,
      point: vec3(0, 1, 0),
      sourcePos,
      killed: false,
      cause,
      absorbed: 0,
    });
    const contacts: Contact[] = [];
    hear(sim, bot, contacts, [hit(1, { kind: 'ability', abilityId: 'gorse_firebreak' }, vec3(0, 0, 2))], createRng(1));
    expect(contacts).toEqual([]);
    const eye = aimOf(enemy).origin;
    hear(sim, bot, contacts, [hit(2, { kind: 'weapon', weaponId: 'wren_pistol' }, eye)], createRng(1));
    expect(findContact(contacts, enemy.id)).toMatchObject({ source: 'damage', tick: 2 });
  });
});

describe('memory', () => {
  it('keeps a heard contact for memorySeconds, then forgets it', async () => {
    const l = await listener(vec3(0, 0, -8), SOUTH);
    l.run(1, { buttons: BUTTON.fire });
    const heardAt = findContact(l.contacts, l.enemy.id)?.tick;
    expect(heardAt).toBe(l.sim.state.tick);
    l.run(MEMORY_TICKS, {}); // silent from here on
    expect(findContact(l.contacts, l.enemy.id)?.tick).toBe(heardAt);
    l.run(1, {});
    expect(findContact(l.contacts, l.enemy.id)).toBeUndefined();
    expect(MEMORY_TICKS).toBe(secondsToTicks(AI.perception.memorySeconds));
  });
});

// ── Callouts ────────────────────────────────────────────────────────────────

describe('team intel', () => {
  it('reaches a teammate who cannot see the enemy exactly calloutDelayTicks after the sighting', async () => {
    const sim = await Sim.create(RANGE_LEVEL);
    const spotter = spawn(sim, 0, vec3(0, 0, 20), NORTH);
    const mate = spawn(sim, 0, vec3(4, 0, 20), SOUTH); // looking away
    const enemy = spawn(sim, 1, vec3(0, 0, 0), SOUTH);
    const intel = createTeamIntel();
    const memory = new Map<EntityId, Contact[]>([
      [spotter.id, []],
      [mate.id, []],
    ]);
    let spottedAt: number | null = null;
    let learntAt: number | null = null;
    for (let i = 0; i < AI.perception.calloutDelayTicks + 10; i++) {
      const events = step(sim);
      observeIntel(intel, events);
      for (const [k, bot] of [spotter, mate].entries()) {
        const contacts = memory.get(bot.id) ?? [];
        perceive(sim, bot, contacts, k, null);
        receiveCallouts(intel, bot.id, contacts, sim.state.tick);
        shareContacts(intel, bot.id, contacts, sim.state.tick);
      }
      if (spottedAt === null && findContact(memory.get(spotter.id) ?? [], enemy.id)?.visible) spottedAt = sim.state.tick;
      if (learntAt === null && findContact(memory.get(mate.id) ?? [], enemy.id)) learntAt = sim.state.tick;
    }
    expect(spottedAt).not.toBeNull();
    expect(learntAt).toBe((spottedAt ?? 0) + AI.perception.calloutDelayTicks);
    const c = findContact(memory.get(mate.id) ?? [], enemy.id);
    expect(c?.source).toBe('callout');
    expect(c?.visible).toBe(false);
    expect(c?.tick).toBe(spottedAt); // the information is as old as the sighting
    expect(distance(c?.pos ?? vec3(), enemy.pos)).toBeLessThan(1e-6);
    // Bounded: one readable plus at most one pending callout per enemy.
    expect(intel.callouts.length).toBeLessThanOrEqual(2);
    // A kill retracts it.
    observeIntel(intel, [{ type: 'kill', tick: sim.state.tick, attackerId: spotter.id, victimId: enemy.id, cause: { kind: 'weapon', weaponId: 'hornet_smg' }, headshot: false }]);
    expect(intel.callouts).toHaveLength(0);
  });
});

// ── Cost ────────────────────────────────────────────────────────────────────

describe('ray budget', () => {
  it('stays within the ADR budget for 9 bots in a 5v5 standoff in the open', async () => {
    const sim = await Sim.create(RANGE_LEVEL);
    const chars: CharacterEntity[] = [];
    for (let i = 0; i < 5; i++) chars.push(spawn(sim, 0, vec3(-8 + 4 * i, 0, 10), NORTH));
    for (let i = 0; i < 5; i++) chars.push(spawn(sim, 1, vec3(-8 + 4 * i, 0, -10), SOUTH));
    const bots = chars.slice(1); // chars[0] stands in for the player
    const { view, rays } = countingView(sim);
    const memory = bots.map((): Contact[] => []);
    let worst = 0;
    let total = 0;
    const ticks = secondsToTicks(2);
    for (let t = 0; t < ticks; t++) {
      step(sim);
      rays.n = 0;
      bots.forEach((bot, k) => {
        const contacts = memory[k] ?? [];
        const target = contacts.find((c) => c.visible)?.entityId ?? null;
        perceive(view, bot, contacts, k, target);
      });
      worst = Math.max(worst, rays.n);
      total += rays.n;
    }
    // ADR-0011 §2: ≤ 3 scanners × 5 enemies × 2 rays + 6 target re-checks × 2 rays.
    const scanners = Math.ceil(bots.length / AI.perception.scanIntervalTicks);
    const bound = scanners * 5 * 2 + (bots.length - scanners) * 2;
    expect(bound).toBe(42);
    expect(worst).toBeLessThanOrEqual(bound);
    expect(worst).toBeGreaterThan(0);
    expect(total / ticks).toBeLessThan(bound);
    for (const contacts of memory) expect(contacts.filter((c) => c.visible)).toHaveLength(5);
  });
});
