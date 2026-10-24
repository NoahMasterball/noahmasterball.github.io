import { describe, expect, it } from 'vitest';
import { createBotController, stepMatch } from '../../src/ai/controller.ts';
import type { BrainSpec } from '../../src/ai/types.ts';
import { MATCH_FORMAT, PLAYABLE_OPERATORS, RELAY, REPLAY, secondsToTicks } from '../../src/config/sim.ts';
import { getAbility } from '../../src/data/content.ts';
import { RANGE_LEVEL } from '../../src/data/levels/range.ts';
import { SALTWORKS_LEVEL } from '../../src/data/levels/saltworks.ts';
import type { LevelDef } from '../../src/data/schema.ts';
import { ABILITY_BUTTONS, BUTTON } from '../../src/sim/command.ts';
import { zoneWorldCenter } from '../../src/sim/hitbox.ts';
import { vec3, type Vec3 } from '../../src/sim/math.ts';
import type { ModeId } from '../../src/sim/modes/mode.ts';
import { relayOf } from '../../src/sim/modes/relay.ts';
import { defaultRoster, roundSpawnOptions, type RosterEntry } from '../../src/sim/modes/format.ts';
import type { MatchRecording, RecordedCommand } from '../../src/sim/recording.ts';
import { replayRecording } from '../../src/sim/replay.ts';
import { characterSeed, createRng, deriveSeed, nextRandom } from '../../src/sim/rng.ts';
import { Sim } from '../../src/sim/sim.ts';
import { digest } from '../../src/sim/snapshot.ts';
import { hasActivation, type AbilityOf } from '../../src/sim/systems/abilities.ts';
import type { CharacterEntity, EntityId, SimEvent } from '../../src/sim/types.ts';
import { lookAt, placementInputs, throwLook } from './support/abilityInput.ts';
import { commandFor, ofType, SECONDS, type Input } from './support/world.ts';

// Determinism (ADR-0014 §2–§3, ADR-0012 §11 batch R). The DoD: a full bot-driven Relay match is
// recorded by the Sim itself (bot commands and bot picks), round-tripped through JSON and replayed
// by replayRecording without bots to an identical final state and event stream. Also: a scripted
// elimination round that places, throws, channels and kills; the canonical digest; spread from
// per-character RNG streams.

const LONG_TEST_MS = 120_000;
const MEDIUM: BrainSpec = { kind: 'combat', tier: 'medium' };

/** A recording's replay with every event it emitted (setup events arrive with the first step). */
async function replay(rec: Readonly<MatchRecording>): Promise<{ sim: Sim; events: SimEvent[] }> {
  const events: SimEvent[] = [];
  const sim = await replayRecording(rec, (_, stepEvents) => events.push(...stepEvents));
  events.push(...sim.drainEvents());
  return { sim, events };
}

/** The live recording of `sim` (created with `record`). */
function recordingOf(sim: Sim): Readonly<MatchRecording> {
  const rec = sim.recording;
  if (!rec) throw new Error('expected a recording Sim');
  return rec;
}

/** The tick of the step op at `index` (steps are numbered from tick 1). */
const tickOfStep = (rec: Readonly<MatchRecording>, index: number): number => rec.ops.slice(0, index + 1).filter((op) => op.op === 'step').length;

/** The index of the step op of `tick`. */
function stepIndex(rec: Readonly<MatchRecording>, tick: number): number {
  let steps = 0;
  const index = rec.ops.findIndex((op) => op.op === 'step' && ++steps === tick);
  if (index < 0) throw new Error(`no step for tick ${tick}`);
  return index;
}

/** `rec` with `bit` cleared from `entityId`'s command in the step op at `index`. */
function withoutButton(rec: Readonly<MatchRecording>, index: number, entityId: EntityId, bit: number): MatchRecording {
  const copy = structuredClone(rec);
  const op = copy.ops[index];
  if (op?.op !== 'step') throw new Error(`op ${index} is not a step`);
  expect(op.commands.some(([id, , , , , buttons]) => id === entityId && (buttons & bit) !== 0)).toBe(true);
  op.commands = op.commands.map(([id, moveX, moveZ, yaw, pitch, buttons]): RecordedCommand => [
    id,
    moveX,
    moveZ,
    yaw,
    pitch,
    id === entityId ? buttons & ~bit : buttons,
  ]);
  return copy;
}

/** The first checkpoint at or after `tick` (where a replay diverging in `tick` is caught). */
function checkpointAfter(rec: Readonly<MatchRecording>, tick: number): number {
  const checkpoint = rec.checkpoints.find((c) => c.tick >= tick);
  if (!checkpoint) throw new Error(`no checkpoint after tick ${tick}`);
  return checkpoint.tick;
}

// ── The scripted round ──────────────────────────────────────────────────────

/** A recording Sim driven by a script; `events` collects everything it emitted. */
interface Recorder {
  sim: Sim;
  events: SimEvent[];
  /** One step with `inputs` held (characters without one send no command). */
  step(inputs: ReadonlyMap<CharacterEntity, Input>): void;
}

async function record(level: LevelDef, seed: number, mode: ModeId): Promise<Recorder> {
  const sim = await Sim.create(level, seed, mode, { record: true });
  const events = sim.drainEvents();
  return {
    sim,
    events,
    step(inputs) {
      const tick = sim.state.tick + 1;
      events.push(...sim.step(new Map([...inputs].map(([e, input]) => [e.id, commandFor(tick, e, input)] as const))));
    },
  };
}

const SEED = 0x7e51_2026;
/** Look yaws (radians; 0 looks down −Z). */
const NORTH = 0;
const SOUTH = Math.PI;
const WEST = Math.PI / 2;

function thrown(id: string): AbilityOf<'thrown'> {
  const a = getAbility(id);
  if (!hasActivation(a, 'thrown')) throw new Error(`${id} must be thrown`);
  return a;
}

function holdDuration(id: string): number {
  const a = getAbility(id);
  if (!hasActivation(a, 'hold')) throw new Error(`${id} must be a hold ability`);
  return a.activation.maxDuration;
}

/** The key of `e`'s slot holding `abilityId`. */
function keyOf(e: CharacterEntity, abilityId: string): number {
  const key = ABILITY_BUTTONS[e.abilities.findIndex((s) => s.abilityId === abilityId)];
  if (key === undefined) throw new Error(`${e.operatorId} has no keyed slot with ${abilityId}`);
  return key;
}

const torso = (e: CharacterEntity): Vec3 => zoneWorldCenter(e, 'torso');
const one = (e: CharacterEntity, input: Input): Map<CharacterEntity, Input> => new Map([[e, input]]);
const nobody = (): Map<CharacterEntity, Input> => new Map();

/** Steps `ticks` ticks with the inputs `inputs()` returns before each (everyone else idle). */
function play(r: Recorder, ticks: number, inputs: () => ReadonlyMap<CharacterEntity, Input> = nobody): void {
  for (let i = 0; i < ticks; i++) r.step(inputs());
}

/** Steps with `inputs()` until `done()` holds after a tick; throws after `maxTicks`. */
function playUntil(r: Recorder, done: () => boolean, maxTicks: number, inputs: () => ReadonlyMap<CharacterEntity, Input> = nobody): void {
  for (let i = 0; i < maxTicks && !done(); i++) r.step(inputs());
  if (!done()) throw new Error(`scripted condition not met within ${maxTicks} ticks`);
}

interface ScriptedRound {
  rec: Recorder;
  /** Index in the recording's ops of the step in which Gorse throws Firebreak. */
  firebreakStep: number;
  gorse: CharacterEntity;
}

/** Heron, Keel, Gorse and Salve (picked in the freeze) against Thistle and Wisp on Saltworks: a
 *  barrier and a Burr Mine are placed, Sonar is channelled while Wisp walks, Wisp fires at Keel,
 *  Salve's dart heals him, Firebreak lands on Thistle, Gorse walks into the mine, Heron shoots Wisp
 *  dead, the fire kills Thistle, and the round resets. */
async function scriptedRound(): Promise<ScriptedRound> {
  const rec = await record(SALTWORKS_LEVEL, SEED, 'elimination');
  const m = rec.sim.state.match;
  if (m.mode !== 'elimination') throw new Error('expected an elimination match');
  const roster: RosterEntry[] = [
    { team: 0, operatorId: 'heron', controller: 'player' },
    { team: 0, operatorId: 'keel', controller: 'bot' },
    { team: 0, operatorId: 'gorse', controller: 'bot' },
    { team: 0, operatorId: 'basalt', controller: 'bot' },
    { team: 1, operatorId: 'thistle', controller: 'bot' },
    { team: 1, operatorId: 'wisp', controller: 'bot' },
  ];
  const cast = roundSpawnOptions(rec.sim.level, m, roster).map((o) => rec.sim.spawnCharacter(o));
  const [heron, keel, gorse, salve, thistle, wisp] = cast;
  if (!heron || !keel || !gorse || !salve || !thistle || !wisp) throw new Error('expected six characters');
  rec.sim.control({ type: 'selectOperator', entityId: salve.id, operatorId: 'salve' });
  playUntil(rec, () => m.phase === 'live', SECONDS(10));

  // Into the courtyard between the spawn shields and the pump house.
  const spots: [CharacterEntity, Vec3, number][] = [
    [heron, vec3(0, 0, 28), NORTH],
    [keel, vec3(2.5, 0, 28), NORTH],
    [gorse, vec3(-2.5, 0, 28), NORTH],
    [salve, vec3(1, 0, 30), NORTH],
    [thistle, vec3(-2, 0, 19), SOUTH],
    [wisp, vec3(2, 0, 18), SOUTH],
  ];
  for (const [e, position, yaw] of spots) rec.sim.control({ type: 'teleport', entityId: e.id, position, yaw, pitch: 0 });
  play(rec, 10);

  // Placements: Keel's barrier, Thistle's mine.
  for (const input of placementInputs(lookAt(keel, vec3(2.5, 0, 26)), keyOf(keel, 'keel_breakwater'))) rec.step(one(keel, input));
  for (const input of placementInputs(lookAt(thistle, vec3(-2, 0, 21)), keyOf(thistle, 'thistle_burrs'))) rec.step(one(thistle, input));

  // A full Sonar channel while Wisp walks west for a second.
  const sonar = SECONDS(holdDuration('heron_sonar')) + 2;
  for (let i = 0; i < sonar; i++) {
    const inputs = one(heron, { buttons: keyOf(heron, 'heron_sonar') });
    if (i < SECONDS(1)) inputs.set(wisp, { yaw: WEST, pitch: 0, moveZ: 1 });
    rec.step(inputs);
  }

  // Wisp sprays Keel (spread from her own RNG stream), Salve's dart heals him.
  play(rec, SECONDS(0.5), () => one(wisp, { ...lookAt(wisp, torso(keel)), buttons: BUTTON.fire }));
  rec.step(one(salve, { ...throwLook(salve, thrown('salve_mend'), torso(keel)), buttons: keyOf(salve, 'salve_mend') }));
  play(rec, SECONDS(0.5));

  // Firebreak at Thistle's feet; Gorse walks into the mine while Heron shoots Wisp dead.
  const firebreakStep = recordingOf(rec.sim).ops.length;
  const target = vec3(thistle.pos.x, 0, thistle.pos.z + 0.8);
  rec.step(one(gorse, { ...throwLook(gorse, thrown('gorse_firebreak'), target), buttons: keyOf(gorse, 'gorse_firebreak') }));
  let t = 0;
  const pushOn = (): Map<CharacterEntity, Input> => {
    t += 1;
    const inputs = new Map<CharacterEntity, Input>();
    if (gorse.alive && gorse.pos.z > 21.5) inputs.set(gorse, { yaw: NORTH, pitch: 0, moveZ: 1 });
    // Semi-automatic DMR: a trigger press every third of a second, aimed down sights.
    if (wisp.alive) inputs.set(heron, { ...lookAt(heron, torso(wisp)), buttons: BUTTON.ads | (t % 20 === 0 ? BUTTON.fire : 0) });
    return inputs;
  };
  playUntil(rec, () => !wisp.alive, SECONDS(10), pushOn);

  // The fire finishes Thistle: the round ends by elimination and the next one starts.
  playUntil(rec, () => m.round === 2, SECONDS(20), pushOn);
  play(rec, SECONDS(1));
  rec.events.push(...rec.sim.drainEvents());
  return { rec, firebreakStep, gorse };
}

let scripted: Promise<ScriptedRound> | null = null;
/** The scripted round, recorded once for this file. */
const recorded = (): Promise<ScriptedRound> => (scripted ??= scriptedRound());

// ── The bot-driven Relay match ──────────────────────────────────────────────

/** Longest possible Relay match: every round to both clocks, one overtime round. */
const MAX_MATCH_TICKS =
  (2 * (MATCH_FORMAT.roundsToWin - 1) + 1) * secondsToTicks(RELAY.preRoundSeconds + RELAY.setupSeconds + RELAY.engagementSeconds + RELAY.uplinkSeconds + RELAY.roundEndSeconds);

interface BotMatch {
  sim: Sim;
  events: SimEvent[];
  recording: MatchRecording;
}

/** The default 5v5 Relay roster, every slot a medium bot, on a recording Sim until matchEnd. */
async function recordBotMatch(seed: number): Promise<BotMatch> {
  const sim = await Sim.create(SALTWORKS_LEVEL, seed, 'relay', { record: true });
  const roster = defaultRoster(PLAYABLE_OPERATORS[0]).map((x): RosterEntry => ({ ...x, controller: 'bot' }));
  const m = relayOf(sim.state.match);
  if (!m) throw new Error('expected a Relay match');
  for (const o of roundSpawnOptions(SALTWORKS_LEVEL, m, roster)) sim.spawnCharacter(o);
  const bots = createBotController(sim, sim.state.entities.map((e) => ({ entityId: e.id, brain: MEDIUM })), seed);
  const events = sim.drainEvents();
  bots.observe(events);
  while (!events.some((e) => e.type === 'matchEnd') && sim.state.tick < MAX_MATCH_TICKS) events.push(...stepMatch(sim, bots, new Map()));
  events.push(...sim.drainEvents());
  return { sim, events, recording: structuredClone(recordingOf(sim)) };
}

let botMatch: Promise<BotMatch> | null = null;
/** Seed 4's match, recorded once for this file. */
const recordedMatch = (): Promise<BotMatch> => (botMatch ??= recordBotMatch(4));

// ── Tests ───────────────────────────────────────────────────────────────────

describe('digest (ADR-0014 §2)', () => {
  it('separates −0 from 0 and Infinity/NaN from null (JSON does not), ignores key order', () => {
    expect(JSON.stringify({ a: -0, b: Infinity, c: NaN })).toBe(JSON.stringify({ a: 0, b: null, c: null }));
    expect(digest(-0)).not.toBe(digest(0));
    expect(digest(Infinity)).not.toBe(digest(null));
    expect(digest(-Infinity)).not.toBe(digest(Infinity));
    expect(digest(NaN)).not.toBe(digest(null));
    expect(digest(NaN)).toBe(digest(NaN));
    expect(digest({ a: 1, b: [2, 3] })).toBe(digest({ b: [2, 3], a: 1 }));
    expect(digest([1, 2])).not.toBe(digest([2, 1]));
    expect(digest([[1], 2])).not.toBe(digest([1, [2]]));
    expect(digest({ a: undefined })).not.toBe(digest({}));
    expect(digest('1')).not.toBe(digest(1));
    expect(digest('ab')).toMatch(/^[0-9a-f]{16}$/);
    expect(() => digest(new Map())).toThrow(/plain objects/);
  });
});

describe('per-character spread streams (ADR-0014 §2)', () => {
  it("a character's spread samples are the same whether or not another character fires", async () => {
    /** Wisp's shot directions over two seconds of held fire; `crowd`: a teammate with a lower id
     *  (it fires first in every tick) sprays alongside. */
    const shots = async (crowd: boolean): Promise<Vec3[]> => {
      const sim = await Sim.create(RANGE_LEVEL, SEED);
      const other = sim.spawnCharacter({ operatorId: 'wisp', team: 0, controller: 'bot', position: vec3(-20, 0, 25), yaw: NORTH });
      const shooter = sim.spawnCharacter({ operatorId: 'wisp', team: 0, controller: 'player', position: vec3(-16, 0, 25), yaw: NORTH });
      const dirs: Vec3[] = [];
      for (let i = 0; i < SECONDS(2); i++) {
        const tick = sim.state.tick + 1;
        const commands = new Map([[shooter.id, commandFor(tick, shooter, { buttons: BUTTON.fire })]]);
        if (crowd) commands.set(other.id, commandFor(tick, other, { buttons: BUTTON.fire }));
        for (const ev of sim.step(commands)) if (ev.type === 'shot' && ev.entityId === shooter.id) dirs.push(ev.dir);
      }
      return dirs;
    };
    const alone = await shots(false);
    const crowded = await shots(true);
    expect(alone.length).toBeGreaterThan(10);
    expect(new Set(alone.map((d) => `${d.x},${d.y},${d.z}`)).size).toBeGreaterThan(1); // spread, not a laser
    expect(crowded).toEqual(alone);
  });

  it("character streams differ from each other and from the bots' streams of the same id", () => {
    const ids = [1, 2, 3, 7, 10, 11];
    expect(new Set(ids.map((id) => characterSeed(SEED, id))).size).toBe(ids.length);
    for (const id of ids) {
      expect(characterSeed(SEED, id)).not.toBe(deriveSeed(SEED, id));
      const character = createRng(characterSeed(SEED, id));
      const bot = createRng(deriveSeed(SEED, id));
      const draws = (rng: ReturnType<typeof createRng>): number[] => [nextRandom(rng), nextRandom(rng), nextRandom(rng)];
      expect(draws(character)).not.toEqual(draws(bot));
    }
  });
});

describe('replay with abilities (ADR-0012 §11 R, ADR-0014 §3)', () => {
  it('the scripted round places, throws, channels, heals, reveals, kills and resets', async () => {
    const { rec } = await recorded();
    const events = rec.events;
    const abilitiesOf = <T extends { abilityId: string }>(list: readonly T[]): string[] => [...new Set(list.map((e) => e.abilityId))].sort();
    expect(ofType(events, 'operatorChanged')).toHaveLength(1);
    expect(abilitiesOf(ofType(events, 'gadgetPlaced'))).toEqual(['keel_breakwater', 'thistle_burrs']);
    expect(ofType(events, 'burst').map((b) => `${b.source}:${b.abilityId}`).sort()).toEqual([
      'gadget:thistle_burrs',
      'projectile:gorse_firebreak',
      'projectile:salve_mend',
    ]);
    expect(ofType(events, 'abilityEnd')).toEqual([expect.objectContaining({ abilityId: 'heron_sonar', reason: 'maxDuration' })]);
    expect(abilitiesOf(ofType(events, 'revealed'))).toEqual(['heron_sonar', 'thistle_burrs']);
    expect(abilitiesOf(ofType(events, 'healed'))).toEqual(['salve_mend']);
    expect(ofType(events, 'shot').length).toBeGreaterThan(3);
    expect(ofType(events, 'kill').map((k) => k.cause)).toEqual([
      { kind: 'weapon', weaponId: 'longreed_dmr' },
      { kind: 'ability', abilityId: 'gorse_firebreak' },
    ]);
    expect(ofType(events, 'roundEnd')).toEqual([expect.objectContaining({ round: 1, winner: 0, reason: 'elimination' })]);
    expect(rec.sim.state.match).toMatchObject({ mode: 'elimination', round: 2, phase: 'preRound' });
    expect([rec.sim.state.gadgets, rec.sim.state.projectiles, rec.sim.state.areas]).toEqual([[], [], []]);
  });

  // Regression (ADR-0014 §3, a recording "JSON round-trips exactly"): anglesTo returned
  // atan2(−0, …) = −0 for a target straight down −Z (here Keel placing his barrier straight ahead)
  // and the Sim kept it as the character's yaw; JSON writes −0 as 0. Look angles are now never −0
  // (withoutNegativeZero in anglesTo, commandLook/clampPitch, spawn and teleport).
  it('is plain data: a JSON round trip gives the same recording', async () => {
    const { rec } = await recorded();
    const recording = recordingOf(rec.sim);
    expect(JSON.parse(JSON.stringify(recording))).toStrictEqual(recording);
    expect(recording.checkpoints.map((c) => c.tick)).toEqual(
      Array.from({ length: Math.floor(rec.sim.state.tick / REPLAY.checkpointEveryTicks) }, (_, i) => (i + 1) * REPLAY.checkpointEveryTicks),
    );
  });

  it('replays from seed and inputs to an identical final state and event stream (in memory and via JSON)', async () => {
    const { rec } = await recorded();
    const recording = recordingOf(rec.sim);
    for (const copy of [structuredClone(recording), JSON.parse(JSON.stringify(recording)) as MatchRecording]) {
      const again = await replay(copy);
      expect(again.sim.state.tick).toBe(rec.sim.state.tick);
      expect(digest(again.sim.state)).toBe(digest(rec.sim.state));
      expect(again.sim.state).toStrictEqual(rec.sim.state);
      expect(again.events).toHaveLength(rec.events.length);
      expect(digest(again.events)).toBe(digest(rec.events));
    }
  });

  it('a single flipped button (the Firebreak throw) changes the outcome and the digest', async () => {
    const { rec, firebreakStep, gorse } = await recorded();
    const recording = recordingOf(rec.sim);
    const flipped = withoutButton(recording, firebreakStep, gorse.id, keyOf(gorse, 'gorse_firebreak'));
    const diverged = await replay({ ...flipped, checkpoints: [] });
    expect(digest(diverged.sim.state)).not.toBe(digest(rec.sim.state));
    expect(ofType(diverged.events, 'burst').some((b) => b.abilityId === 'gorse_firebreak')).toBe(false);
    // With its checkpoints, the replay names the first window that diverged.
    const tick = checkpointAfter(recording, tickOfStep(recording, firebreakStep));
    await expect(replayRecording(flipped)).rejects.toThrow(`replay diverged at tick ${tick}`);
  });
});

describe('a recorded bot-driven Relay match (ADR-0014 DoD)', () => {
  it('records every input: 10 medium bots play a full match, the bot picks are controls', async () => {
    const { sim, events, recording } = await recordedMatch();
    const end = ofType(events, 'matchEnd')[0];
    expect(end, 'no matchEnd').toBeDefined();
    expect(Math.max(...(end?.score ?? [0]))).toBe(MATCH_FORMAT.roundsToWin);
    expect(recording).toMatchObject({ levelId: SALTWORKS_LEVEL.id, mode: 'relay', seed: 4 });
    const count = (op: MatchRecording['ops'][number]['op']): number => recording.ops.filter((o) => o.op === op).length;
    expect(count('spawn')).toBe(sim.state.entities.length);
    expect(count('step')).toBe(sim.state.tick);
    // Bot picks go through Sim.control like a player's (ADR-0013 §3).
    const picks = recording.ops.flatMap((o) => (o.op === 'control' && o.msg.type === 'selectOperator' ? [o.msg] : []));
    expect(picks.length).toBeGreaterThan(0);
    expect(recording.checkpoints).toHaveLength(Math.floor(sim.state.tick / REPLAY.checkpointEveryTicks));
    const json = JSON.stringify(recording);
    console.info(
      `relay bot match (seed 4): score ${end?.score.join(':')} in ${sim.state.tick} ticks; recording ${recording.ops.length} ops, ` +
        `${picks.length} picks, ${recording.checkpoints.length} checkpoints, ${(json.length / 1e6).toFixed(1)} MB as JSON`,
    );
  }, LONG_TEST_MS);

  it('replays from its JSON round trip without bots to an identical final state and event stream', async () => {
    const { sim, events, recording } = await recordedMatch();
    const json = JSON.parse(JSON.stringify(recording)) as MatchRecording;
    expect(json).toStrictEqual(recording);
    const again = await replay(json);
    expect(again.sim.state.tick).toBe(sim.state.tick);
    expect(digest(again.sim.state)).toBe(digest(sim.state));
    expect(again.sim.state).toStrictEqual(sim.state);
    expect(again.events).toHaveLength(events.length);
    expect(digest(again.events)).toBe(digest(events));
  }, LONG_TEST_MS);

  it('a single flipped button (the first shot) diverges at the next checkpoint', async () => {
    const { events, recording } = await recordedMatch();
    const shot = ofType(events, 'shot')[0];
    if (!shot) throw new Error('nobody fired');
    const flipped = withoutButton(recording, stepIndex(recording, shot.tick), shot.entityId, BUTTON.fire);
    await expect(replayRecording(flipped)).rejects.toThrow(`replay diverged at tick ${checkpointAfter(recording, shot.tick)}`);
  }, LONG_TEST_MS);
});
