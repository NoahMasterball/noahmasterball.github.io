import { describe, expect, it } from 'vitest';
import { abilityReach } from '../../src/ai/abilities.ts';
import { createBotController, stepMatch, type InspectableBotController } from '../../src/ai/controller.ts';
import { findContact } from '../../src/ai/perception.ts';
import type { BrainSpec } from '../../src/ai/types.ts';
import { AI, MATCH, secondsToTicks, TICK_DT, type AiTier } from '../../src/config/sim.ts';
import { ABILITIES, getAbility, getOperator, OPERATORS } from '../../src/data/content.ts';
import { RANGE_LEVEL } from '../../src/data/levels/range.ts';
import { SALTWORKS_LEVEL } from '../../src/data/levels/saltworks.ts';
import type { LevelDef, Side } from '../../src/data/schema.ts';
import { BUTTON, type Command } from '../../src/sim/command.ts';
import { ballisticPitch, projectileGravity } from '../../src/sim/abilities/projectiles.ts';
import { angleDelta, distance, forwardFromAngles, vec3, type Vec3 } from '../../src/sim/math.ts';
import { otherTeam, roundSpawnOptions, type RosterEntry } from '../../src/sim/modes/format.ts';
import { MODES } from '../../src/sim/modes/index.ts';
import { Sim } from '../../src/sim/sim.ts';
import { hasActivation } from '../../src/sim/systems/abilities.ts';
import { aimOf } from '../../src/sim/systems/weapons.ts';
import type { CharacterEntity, EntityId, SimEvent } from '../../src/sim/types.ts';
import { ofType } from './support/world.ts';

// Bots using abilities through ordinary Commands (ADR-0012 §10) on the real Sim in Node: one
// scenario per usage hint — Brace when engaged (engage), Slipstream when hurt in a fight (escape),
// a Breakwater at the post along its watch direction and Set Piton on at the post / off when
// leaving it (hold), Sonar on a lead → reveal contacts for the whole team (scout), Mend Dart on a
// hurt teammate (support), Slag Lance and Firebreak on a lost contact's last position (flush) —
// plus the rules around them: never while the mode's gate or the resource forbids, never a press
// the sim refuses, every operator's hint runs without errors, commands() never writes the state,
// determinism. Range scenarios: the test range's open floor (no nav graph: combat bots hold where
// they stand, the post faces their spawn yaw); Saltworks for leaving a post.

const NORTH = 0; // yaw looking down −Z
const SOUTH = Math.PI;
const MEDIUM: BrainSpec = { kind: 'combat', tier: 'medium' };
const combat = (tier: AiTier): BrainSpec => ({ kind: 'combat', tier });
const LONG_TEST_MS = 120_000;
/** Open floor of the range, north of the back wall and clear of the bench and the peek walls. */
const OPEN = vec3(-16, 0, 25);
/** Relative margin around a throw's reach (inside: reachable, outside: not). */
const REACH_MARGIN = 0.01;
/** The every-operator scenario's fight after the reaction time (short: the enemy survives it). */
const FIGHT_SECONDS = 0.2;

interface Actor {
  operatorId: string;
  team: number;
  pos: Vec3;
  yaw: number;
  /** Null: not driven (stands still, or takes the test's `external` commands). */
  brain: BrainSpec | null;
}

interface Arena {
  sim: Sim;
  bots: InspectableBotController;
  chars: CharacterEntity[];
  /** Every event since the arena was built, in order. */
  events: SimEvent[];
  /** Steps `seconds` (or until `until` returns true) with `external` commands for undriven
   *  characters; returns the events of these steps. */
  run(seconds: number, until?: (events: readonly SimEvent[]) => boolean, external?: () => Map<EntityId, Command>): SimEvent[];
}

async function arena(actors: readonly Actor[], seed = 1, level: LevelDef = RANGE_LEVEL): Promise<Arena> {
  const sim = await Sim.create(level, seed);
  const chars = actors.map((a) => sim.spawnCharacter({ operatorId: a.operatorId, team: a.team, controller: a.brain ? 'bot' : 'player', position: a.pos, yaw: a.yaw }));
  const slots = actors.flatMap((a, i) => {
    const e = chars[i];
    return a.brain && e ? [{ entityId: e.id, brain: a.brain }] : [];
  });
  const bots = createBotController(sim, slots, seed);
  bots.observe(sim.drainEvents());
  const events: SimEvent[] = [];
  const run: Arena['run'] = (seconds, until, external) => {
    const out: SimEvent[] = [];
    for (let i = 0; i < secondsToTicks(seconds); i++) {
      const tickEvents = stepMatch(sim, bots, external?.() ?? new Map());
      out.push(...tickEvents);
      if (until?.(tickEvents)) break;
    }
    events.push(...out);
    return out;
  };
  return { sim, bots, chars, events, run };
}

function must<T>(x: T | undefined | null, what: string): T {
  if (x === undefined || x === null) throw new Error(`missing ${what}`);
  return x;
}

const usesOf = (events: readonly SimEvent[], entityId: EntityId, abilityId?: string): SimEvent[] =>
  ofType(events, 'ability').filter((ev) => ev.entityId === entityId && (abilityId === undefined || ev.abilityId === abilityId));

/** A bot never presses what the sim refuses: no `abilityFailed` of any bot, for any reason. */
function expectNoRefusals(a: Arena): void {
  const bots = new Set(a.chars.filter((e) => e.controller === 'bot').map((e) => e.id));
  expect(ofType(a.events, 'abilityFailed').filter((ev) => bots.has(ev.entityId))).toEqual([]);
}

const horizontal = (p: Vec3, q: Vec3): number => Math.hypot(p.x - q.x, p.z - q.z);

describe('engage: Basalt braces in a fight', () => {
  it('only after the aim model reacted to an enemy in range, once per cooldown, never refused', async () => {
    const a = await arena([
      { operatorId: 'basalt', team: 0, pos: OPEN, yaw: NORTH, brain: MEDIUM },
      // 8 m behind the bot: outside its view cone, beyond its all-round awareness.
      { operatorId: 'basalt', team: 1, pos: vec3(OPEN.x, 0, OPEN.z + 8), yaw: SOUTH, brain: null },
    ]);
    const [bot, enemy] = a.chars;
    if (!bot || !enemy) throw new Error('missing characters');
    expect(usesOf(a.run(2), bot.id)).toEqual([]); // no enemy in sight: no brace

    // The enemy steps into view 25 m ahead (inside Brace's 30 m).
    const ahead = vec3(OPEN.x, 0, OPEN.z - 25);
    a.sim.control({ type: 'teleport', entityId: enemy.id, position: ahead, yaw: SOUTH, pitch: 0 });
    let firstSeen: number | null = null;
    a.run(3, (events) => {
      firstSeen ??= findContact(a.bots.brain(bot.id)?.contacts ?? [], enemy.id)?.firstSeenTick ?? null;
      return usesOf(events, bot.id).length > 0;
    });
    const brace = must(usesOf(a.events, bot.id, 'basalt_brace')[0], 'a brace');
    const seen = must(firstSeen as number | null, 'a sighting');
    // The command for step T is made from the state after T − 1: the reaction time had passed.
    const reaction = secondsToTicks(AI.tiers.medium.reactionTime);
    expect(brace.tick - 1 - seen).toBeGreaterThanOrEqual(reaction);
    expect(brace.tick - 1 - seen).toBeLessThanOrEqual(reaction + AI.perception.scanIntervalTicks);
    expect(bot.modifiers.some((m) => m.sourceId === 'basalt_brace')).toBe(true);

    // Fights keep coming (the enemy respawns behind the bot and is sent ahead again): the next
    // brace waits for the cooldown.
    const cooldown = getAbility('basalt_brace').resource;
    if (cooldown.kind !== 'cooldown') throw new Error('Brace has a cooldown');
    for (let t = 0; t < 1.5 * cooldown.cooldown; t++) {
      if (enemy.alive && enemy.pos.z > OPEN.z) a.sim.control({ type: 'teleport', entityId: enemy.id, position: ahead, yaw: SOUTH, pitch: 0 });
      a.run(1);
    }
    const braces = usesOf(a.events, bot.id, 'basalt_brace');
    expect(braces.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < braces.length; i++) {
      expect(((braces[i]?.tick ?? 0) - (braces[i - 1]?.tick ?? 0)) * TICK_DT).toBeGreaterThanOrEqual(cooldown.cooldown);
    }
    expectNoRefusals(a);
  }, LONG_TEST_MS);

  it("never activates while the mode's ability gate is closed (not even a refused press)", async () => {
    const rules = MODES.range;
    rules.abilityAllowed = () => false;
    try {
      const a = await arena([
        { operatorId: 'basalt', team: 0, pos: OPEN, yaw: NORTH, brain: MEDIUM },
        { operatorId: 'basalt', team: 1, pos: vec3(OPEN.x, 0, OPEN.z - 25), yaw: SOUTH, brain: null },
      ]);
      const [bot] = a.chars;
      if (!bot) throw new Error('missing bot');
      const events = a.run(4);
      expect(ofType(events, 'shot').some((ev) => ev.entityId === bot.id)).toBe(true); // it fights
      expect(usesOf(events, bot.id)).toEqual([]);
      expectNoRefusals(a);
    } finally {
      delete rules.abilityAllowed;
    }
  });
});

describe('escape: Wisp slipstreams when hurt in a fight', () => {
  const duel = async (health: number): Promise<{ a: Arena; bot: CharacterEntity }> => {
    const a = await arena([
      { operatorId: 'wisp', team: 0, pos: OPEN, yaw: NORTH, brain: MEDIUM },
      { operatorId: 'basalt', team: 1, pos: vec3(OPEN.x, 0, OPEN.z - 15), yaw: SOUTH, brain: null },
    ]);
    const bot = must(a.chars[0], 'bot');
    bot.health = health;
    return { a, bot };
  };

  it('not while its health is above healthBelow', async () => {
    const { a, bot } = await duel(getOperator('wisp').maxHealth);
    const events = a.run(4);
    expect(ofType(events, 'hit').some((ev) => ev.attackerId === bot.id)).toBe(true);
    expect(usesOf(events, bot.id)).toEqual([]);
  });

  it('at or below healthBelow: a dash in the move direction (sideways without one)', async () => {
    const hint = getAbility('wisp_slipstream').bot;
    if (hint.use !== 'escape') throw new Error('Slipstream is an escape');
    const { a, bot } = await duel(hint.healthBelow * getOperator('wisp').maxHealth);
    let before: Vec3 | null = null;
    a.run(3, (events) => {
      before ??= usesOf(events, bot.id).length > 0 ? { ...bot.prevPos } : null;
      return before !== null;
    });
    const at = must(before as Vec3 | null, 'a slipstream');
    const dash = getAbility('wisp_slipstream').effects.find((e) => e.kind === 'dash');
    if (dash?.kind !== 'dash') throw new Error('Slipstream dashes');
    a.run(dash.duration + 0.1);
    expect(horizontal(bot.pos, at)).toBeGreaterThan(dash.distance / 2);
    expectNoRefusals(a);
  });
});

describe('hold: at the post', () => {
  it('Keel places one Breakwater ahead along its watch direction, facing it; commands() never writes the state', async () => {
    const a = await arena([{ operatorId: 'keel', team: 0, pos: vec3(0, 0, 20), yaw: NORTH, brain: MEDIUM }]);
    const bot = must(a.chars[0], 'bot');
    for (let i = 0; i < secondsToTicks(3); i++) {
      const before = structuredClone(a.sim.state);
      const commands = a.bots.commands(a.sim.state.tick + 1);
      expect(a.sim.state).toEqual(before);
      const events = a.sim.step(commands);
      a.bots.observe(events);
      a.events.push(...events);
    }
    const gadgets = a.sim.state.gadgets.filter((g) => g.ownerId === bot.id);
    expect(gadgets.map((g) => g.abilityId)).toEqual(['keel_breakwater']);
    const g = must(gadgets[0], 'the barrier');
    const post = must(a.bots.brain(bot.id)?.post, 'the post');
    expect(Math.abs(angleDelta(g.yaw, post.yaw))).toBeLessThan(1e-6);
    const f = forwardFromAngles(post.yaw, 0);
    const ahead = (g.pos.x - bot.pos.x) * f.x + (g.pos.z - bot.pos.z) * f.z;
    const activation = getAbility('keel_breakwater').activation;
    if (activation.kind !== 'placeable') throw new Error('Breakwater is placeable');
    expect(ahead).toBeGreaterThan(AI.abilities.placeAheadM / 2);
    expect(ahead).toBeLessThanOrEqual(activation.placeRange);
    expect(horizontal(g.pos, bot.pos)).toBeCloseTo(ahead, 1); // straight ahead
    expect(ofType(a.events, 'shot')).toEqual([]); // the confirm never fired the weapon

    a.run(5); // maxActive 1: no second barrier, no refused press
    expect(usesOf(a.events, bot.id)).toHaveLength(1);
    expect(a.sim.state.gadgets).toHaveLength(1);
    expectNoRefusals(a);
  });

  it('Cairn switches Set Piton on at its post and off when it leaves (Saltworks attackers)', async () => {
    const sim = await Sim.create(SALTWORKS_LEVEL, 3, 'elimination');
    const match = sim.state.match;
    if (match.mode !== 'elimination') throw new Error('elimination');
    const teams: Record<Side, number> = { attack: match.attackingTeam, defend: otherTeam(match.attackingTeam) };
    const roster: RosterEntry[] = (['attack', 'defend'] as const).flatMap((side) =>
      Array.from({ length: MATCH.teamSize }, (): RosterEntry => ({ team: teams[side], operatorId: side === 'attack' ? 'cairn' : 'basalt', controller: 'bot' })),
    );
    for (const o of roundSpawnOptions(SALTWORKS_LEVEL, match, roster)) sim.spawnCharacter(o);
    const standing: BrainSpec = { kind: 'dummy', behaviour: { kind: 'static' } };
    const bots = createBotController(
      sim,
      sim.state.entities.map((e) => ({ entityId: e.id, brain: e.team === teams.attack ? MEDIUM : standing })),
      3,
    );
    bots.observe(sim.drainEvents());
    stepMatch(sim, bots, new Map()); // the round plan
    const holder = must(
      sim.state.entities.find((e) => e.team === teams.attack && bots.brain(e.id)?.role === 'hold'),
      'an attacker holding a post',
    );
    let onAtPost = false;
    let offAfter = false;
    let movingOn = 0;
    for (let i = 0; i < secondsToTicks(40) && !offAfter && holder.alive; i++) {
      const events = stepMatch(sim, bots, new Map());
      const b = must(bots.brain(holder.id), 'the brain');
      const on = holder.abilities[0]?.active?.kind === 'on';
      if (on && b.state === 'hold' && b.arrivedTick !== null) onAtPost = true;
      // Never walks on with the piton set for more than the one tick the off-press takes.
      const standing = b.state === 'engage' || (b.state === 'hold' && b.arrivedTick !== null) || (b.state === 'reload' && b.dest === null);
      const walking = !standing;
      movingOn = on && walking ? movingOn + 1 : 0;
      expect(movingOn).toBeLessThanOrEqual(2);
      if (onAtPost && ofType(events, 'abilityEnd').some((ev) => ev.entityId === holder.id && ev.reason === 'toggledOff')) offAfter = true;
    }
    expect(onAtPost).toBe(true);
    expect(offAfter).toBe(true);
  }, LONG_TEST_MS);
});

describe('scout: Heron sonars a lead, and the reveal is team knowledge', () => {
  /** Heron and a teammate hear an enemy fire behind the peek wall (12 m, out of sight). */
  const scene = async (seed: number): Promise<{ a: Arena; heron: CharacterEntity; mate: CharacterEntity; enemy: CharacterEntity }> => {
    const a = await arena(
      [
        { operatorId: 'heron', team: 0, pos: vec3(-28, 0, -2), yaw: NORTH, brain: MEDIUM },
        { operatorId: 'basalt', team: 0, pos: vec3(-20, 0, 6), yaw: SOUTH, brain: MEDIUM },
        { operatorId: 'wisp', team: 1, pos: vec3(-28, 0, -14), yaw: SOUTH, brain: null },
      ],
      seed,
    );
    const [heron, mate, enemy] = a.chars;
    if (!heron || !mate || !enemy) throw new Error('missing characters');
    return { a, heron, mate, enemy };
  };
  const fire = (enemy: CharacterEntity, sim: Sim, ticks: number): (() => Map<EntityId, Command>) => {
    let n = 0;
    return () => new Map([[enemy.id, { tick: sim.state.tick + 1, moveX: 0, moveZ: 0, yaw: enemy.yaw, pitch: 0, buttons: n++ < ticks && n % 2 ? BUTTON.fire : 0 }]]);
  };

  it('channels Sonar on the heard enemy; the reveal gives every bot of the team its exact position, not in sight', async () => {
    const { a, heron, mate, enemy } = await scene(4);
    expect(a.sim.query.lineOfSight(aimOf(heron).origin, aimOf(enemy).origin)).toBe(false);
    const hint = getAbility('heron_sonar');
    const channel = hint.activation.kind === 'hold' ? hint.activation.maxDuration : 0;
    const events = a.run(channel + 3, (ev) => ev.some((e) => e.type === 'revealed'), fire(enemy, a.sim, secondsToTicks(0.3)));
    const sonar = must(usesOf(events, heron.id, 'heron_sonar')[0], 'a sonar');
    const firstShot = must(ofType(events, 'shot').find((ev) => ev.entityId === enemy.id), 'a shot');
    expect(sonar.tick).toBeGreaterThan(firstShot.tick);
    const revealed = must(ofType(events, 'revealed')[0], 'a reveal');
    expect(revealed).toMatchObject({ entityId: enemy.id, team: heron.team, abilityId: 'heron_sonar' });
    // The next perception tick: the enemy's exact feet as of that state (read before stepping).
    a.bots.commands(a.sim.state.tick + 1);
    for (const bot of [heron, mate]) {
      const c = must(findContact(a.bots.brain(bot.id)?.contacts ?? [], enemy.id), `bot ${bot.id}'s contact`);
      expect(c.source).toBe('reveal');
      expect(c.visible).toBe(false);
      expect(c.tick).toBe(a.sim.state.tick);
      expect(c.pos).toEqual(enemy.pos);
    }
    expect(ofType(a.events, 'shot').some((ev) => ev.entityId === heron.id)).toBe(false); // no shot while channelling
    expectNoRefusals(a);
  });

  it('is deterministic per seed', async () => {
    const digest = async (): Promise<string> => {
      const { a, enemy } = await scene(8);
      a.run(5, undefined, fire(enemy, a.sim, secondsToTicks(0.3)));
      return `${a.events.filter((ev) => ev.type !== 'footstep').map((ev) => `${ev.tick}:${ev.type}`).join('|')}#${JSON.stringify(a.sim.state)}`;
    };
    expect(await digest()).toBe(await digest());
  });
});

describe('support: Salve darts the most hurt teammate in reach', () => {
  it('heals a hurt teammate in sight', async () => {
    const a = await arena([
      { operatorId: 'salve', team: 0, pos: vec3(0, 0, 20), yaw: NORTH, brain: MEDIUM },
      { operatorId: 'basalt', team: 0, pos: vec3(4, 0, 12), yaw: NORTH, brain: null },
    ]);
    const [salve, hurt] = a.chars;
    if (!salve || !hurt) throw new Error('missing characters');
    hurt.health = 0.4 * getOperator('basalt').maxHealth;
    const events = a.run(4, (ev) => ev.some((e) => e.type === 'healed'));
    expect(usesOf(events, salve.id, 'salve_mend')).toHaveLength(1);
    expect(ofType(events, 'healed').map((ev) => ev.entityId)).toEqual([hurt.id]);
    expectNoRefusals(a);
  });

  it('heals itself with a dart at its feet', async () => {
    const a = await arena([{ operatorId: 'salve', team: 0, pos: vec3(0, 0, 20), yaw: NORTH, brain: MEDIUM }]);
    const salve = must(a.chars[0], 'salve');
    salve.health = 0.4 * getOperator('salve').maxHealth;
    const events = a.run(4, (ev) => ev.some((e) => e.type === 'healed'));
    expect(ofType(events, 'healed').map((ev) => ev.entityId)).toEqual([salve.id]);
    expectNoRefusals(a);
  });
});

describe('flush: a throw at the last known position of a lost contact', () => {
  for (const [operatorId, abilityId, toleranceM] of [
    ['kiln', 'kiln_lance', 0.5],
    ['gorse', 'gorse_firebreak', 1],
  ] as const) {
    it(`${operatorId}: ${abilityId} lands within ${toleranceM} m of where the enemy was last seen`, async () => {
      const lastSeen = vec3(OPEN.x, 0, OPEN.z - 12);
      const a = await arena([
        { operatorId, team: 0, pos: OPEN, yaw: NORTH, brain: MEDIUM },
        { operatorId: 'wisp', team: 1, pos: lastSeen, yaw: SOUTH, brain: null },
      ]);
      const [bot, enemy] = a.chars;
      if (!bot || !enemy) throw new Error('missing characters');
      // Seen, then gone behind the peek wall before the bot reacted (no shot, no fight).
      a.run(1, () => findContact(a.bots.brain(bot.id)?.contacts ?? [], enemy.id)?.visible === true);
      a.sim.control({ type: 'teleport', entityId: enemy.id, position: vec3(-28, 0, -16), yaw: SOUTH, pitch: 0 });
      const events = a.run(6, (ev) => ev.some((e) => e.type === 'burst'));
      expect(usesOf(events, bot.id, abilityId)).toHaveLength(1);
      const burst = must(ofType(events, 'burst')[0], 'a burst');
      expect(horizontal(burst.pos, lastSeen)).toBeLessThan(toleranceM);
      const area = must(a.sim.state.areas.find((x) => x.abilityId === abilityId), 'its area');
      expect(horizontal(area.pos, lastSeen)).toBeLessThan(toleranceM);
      // Once per sighting: no second throw at the same information.
      a.run(3);
      expect(usesOf(a.events, bot.id, abilityId)).toHaveLength(1);
      expectNoRefusals(a);
    });
  }

  it('auger: a Bore Charge planted within its radius of where the enemy was last seen', async () => {
    const bore = getAbility('auger_bore');
    if (!hasActivation(bore, 'placeable')) throw new Error('Bore Charge is placeable');
    // Within the charge's reach (placeRange + radius): seen close ahead, then gone.
    const lastSeen = vec3(OPEN.x, 0, OPEN.z - abilityReach(bore) + 1);
    const a = await arena([
      { operatorId: 'auger', team: 0, pos: OPEN, yaw: NORTH, brain: MEDIUM },
      { operatorId: 'wisp', team: 1, pos: lastSeen, yaw: SOUTH, brain: null },
    ]);
    const [bot, enemy] = a.chars;
    if (!bot || !enemy) throw new Error('missing characters');
    a.run(1, () => findContact(a.bots.brain(bot.id)?.contacts ?? [], enemy.id)?.visible === true);
    a.sim.control({ type: 'teleport', entityId: enemy.id, position: vec3(-28, 0, -16), yaw: SOUTH, pitch: 0 });
    a.run(4, (ev) => ev.some((e) => e.type === 'gadgetPlaced'));
    const g = must(a.sim.state.gadgets.find((x) => x.abilityId === 'auger_bore'), 'a planted charge');
    const radius = Math.max(...bore.effects.map((e) => ('radius' in e ? e.radius : 0)));
    expect(distance(g.pos, lastSeen)).toBeLessThanOrEqual(radius);
    const burst = a.run(bore.activation.trigger.kind === 'timer' ? bore.activation.trigger.delay + 0.5 : 1, (ev) => ev.some((e) => e.type === 'burst'));
    expect(ofType(burst, 'burst').map((ev) => ev.abilityId)).toEqual(['auger_bore']);
    expectNoRefusals(a);
  });
});

describe('escape upwards and passives', () => {
  it('Kestrel presses Updraft when hurt in a fight (hint `escape`); Lightfoot is on by itself', async () => {
    const a = await arena([
      { operatorId: 'kestrel', team: 0, pos: OPEN, yaw: NORTH, brain: MEDIUM },
      { operatorId: 'basalt', team: 1, pos: vec3(OPEN.x, 0, OPEN.z - 15), yaw: SOUTH, brain: null },
    ]);
    const bot = must(a.chars[0], 'bot');
    bot.health = 1;
    let groundY: number | null = null;
    a.run(4, (events) => {
      groundY ??= usesOf(events, bot.id, 'kestrel_updraft').length > 0 ? bot.prevPos.y : null;
      return groundY !== null;
    });
    const from = must(groundY as number | null, 'an updraft');
    a.run(0.2);
    expect(bot.pos.y - from).toBeGreaterThan(1);
    expect(bot.modifiers.some((m) => m.sourceId === 'kestrel_lightfoot')).toBe(true);
    expectNoRefusals(a);
  });
});

describe('every operator', () => {
  it('plays its hints without errors or refused presses; commands() never writes the state', async () => {
    const used: string[] = [];
    for (const op of OPERATORS) {
      const a = await arena(
        [
          { operatorId: op.id, team: 0, pos: vec3(0, 0, 20), yaw: NORTH, brain: combat('hard') },
          { operatorId: 'basalt', team: 0, pos: vec3(3, 0, 14), yaw: NORTH, brain: null },
          { operatorId: 'basalt', team: 1, pos: vec3(0, 0, 8), yaw: SOUTH, brain: null },
        ],
        2,
      );
      const [bot, mate, enemy] = a.chars;
      if (!bot || !mate || !enemy) throw new Error('missing characters');
      bot.health = 0.5 * op.maxHealth;
      mate.health = 0.3 * getOperator('basalt').maxHealth;
      // A short fight (engage, escape), then the enemy is gone (flush, scout); a hurt teammate
      // (support); nothing else to do (hold).
      a.run(1, () => findContact(a.bots.brain(bot.id)?.contacts ?? [], enemy.id)?.visible === true);
      a.run(AI.tiers.hard.reactionTime + FIGHT_SECONDS);
      a.sim.control({ type: 'teleport', entityId: enemy.id, position: vec3(-28, 0, -16), yaw: SOUTH, pitch: 0 });
      for (let i = 0; i < secondsToTicks(8); i++) {
        if (i % 10 !== 0) {
          a.run(TICK_DT);
          continue;
        }
        const before = structuredClone(a.sim.state);
        const commands = a.bots.commands(a.sim.state.tick + 1);
        expect(a.sim.state).toEqual(before);
        const events = a.sim.step(commands);
        a.bots.observe(events);
        a.events.push(...events);
      }
      expectNoRefusals(a);
      used.push(`${op.id}: ${[...new Set(usesOf(a.events, bot.id).map((ev) => (ev.type === 'ability' ? ev.abilityId : '')))].join(', ') || '—'}`);
    }
    console.info(`abilities used in the range scenario: ${used.join('; ')}`);
  }, LONG_TEST_MS);

  it("derives the hints' default range: a throw's reach is the farthest ballisticPitch can land on level ground", () => {
    for (const ability of ABILITIES) expect(abilityReach(ability)).toBeGreaterThanOrEqual(0);
    for (const ability of ABILITIES) {
      if (!hasActivation(ability, 'thrown') || projectileGravity(ability) <= 0) continue;
      const reach = abilityReach(ability);
      const pitch = (d: number): number | null => ballisticPitch(ability.activation.speed, projectileGravity(ability), d, 0);
      expect(pitch(reach * (1 - REACH_MARGIN)), ability.id).not.toBeNull();
      expect(pitch(reach * (1 + REACH_MARGIN)), ability.id).toBeNull();
    }
    const brace = getAbility('keel_breakwater');
    if (brace.activation.kind !== 'placeable') throw new Error('Breakwater is placeable');
    expect(abilityReach(brace)).toBe(brace.activation.placeRange); // a barrier has no effect radius
  });
});
