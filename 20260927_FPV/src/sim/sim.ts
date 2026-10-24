import { SIM, TICK_DT } from '../config/sim.ts';
import { assertValidContent, getAbility } from '../data/content.ts';
import type { LevelDef } from '../data/schema.ts';
import { areaSystem } from './abilities/areas.ts';
import { gadgetShape } from './abilities/gadgets.ts';
import { projectileSystem } from './abilities/projectiles.ts';
import { gadgetSystem } from './abilities/triggers.ts';
import { idleCommand, type Command } from './command.ts';
import { characterById, createSimContext, type SimContext } from './context.ts';
import { addCharacter, changeOperator, hitboxProfileOf, type SpawnOptions } from './entities.ts';
import { cloneVec3, copyVec3, withoutNegativeZero } from './math.ts';
import { matchSetupWallsUp, MODES } from './modes/index.ts';
import type { ModeId, ModeRules } from './modes/mode.ts';
import { initPhysics, PhysicsWorld } from './physics/world.ts';
import { storePrevPose } from './pose.ts';
import type { SimQuery } from './query.ts';
import { checkpointOf, createRecording, recordCommands, type MatchRecording } from './recording.ts';
import { createRng } from './rng.ts';
import { assignState } from './snapshot.ts';
import { abilitySystem, expireEffects } from './systems/abilities.ts';
import { movementSystem } from './systems/movement.ts';
import { weaponSystem } from './systems/weapons.ts';
import type { CharacterEntity, ControlMessage, EntityId, SimEvent, SimState } from './types.ts';

// NEW — the simulation entry point (ARCHITECTURE §3). Owns all gameplay state and advances it
// one fixed tick per step(). No Three.js, no DOM, no wall clock (ADR-0003).

// NEW — the Sim built its state inline; the ability test harness needs the same (ADR-0012 §11).
/** A fresh simulation state: tick 0, no characters or world objects, the range match (a mode's
 *  initialMatch replaces it). */
export function createSimState(seed: number): SimState {
  return { tick: 0, time: 0, seed, rng: createRng(seed), entities: [], gadgets: [], projectiles: [], areas: [], nextId: 1, match: { mode: 'range' } };
}

/** A living character's command this tick: `raw` after the mode's filter (lastButtons keeps its
 *  buttons), `cmd` after the abilities' (what movement and weapons see). */
interface TickInput {
  e: CharacterEntity;
  raw: Command;
  cmd: Command;
}

// NEW — ADR-0014 §3: Sim.create had no options.
/** Options of Sim.create. */
export interface SimOptions {
  /** Log every input into `recording` from creation on (ADR-0014 §3). Opt-in: ≈ 20 MB per 10 min
   *  of 10 characters. */
  record?: boolean;
}

export class Sim {
  readonly state: SimState;
  readonly level: LevelDef;
  /** Read-only world queries (line of sight, ground) for bots and tools (ADR-0011 §1). */
  readonly query: SimQuery;
  private readonly physics: PhysicsWorld;
  private readonly rules: ModeRules;
  private readonly controls: ControlMessage[] = [];
  private events: SimEvent[] = [];
  private readonly ctx: SimContext;
  /** The command log when created with `record` (the recording getter). */
  private readonly log: MatchRecording | null;

  /** Validates content and the level for the mode, loads Rapier and builds the level. The mode's
   *  initial match events (elimination: round 1's preRound) wait in drainEvents(). */
  static async create(level: LevelDef, seed: number = SIM.defaultSeed, mode: ModeId = 'range', options: SimOptions = {}): Promise<Sim> {
    assertValidContent();
    await initPhysics();
    return new Sim(level, seed, mode, options.record ?? false);
  }

  private constructor(level: LevelDef, seed: number, mode: ModeId, record: boolean) {
    const rules = MODES[mode];
    const problems = rules.validateLevel(level);
    if (problems.length) throw new Error(`Level '${level.id}' cannot host mode '${mode}':\n- ${problems.join('\n- ')}`);
    this.rules = rules;
    this.level = level;
    this.log = record ? createRecording(level.id, mode, seed) : null;
    // `match` is replaced right below: initialMatch may already draw from this state's RNG.
    this.state = createSimState(seed);
    this.physics = new PhysicsWorld(level);
    this.ctx = createSimContext(this.state, level, this.physics, (event) => this.events.push(event));
    this.query = this.ctx.query;
    this.state.match = rules.initialMatch(this.ctx);
    this.physics.setSetupWalls(matchSetupWallsUp(this.state.match));
  }

  /** The live input log since creation (ADR-0014 §3; replayRecording plays it back), or null
   *  without the `record` option. It grows with every call: structuredClone it to keep it. */
  get recording(): Readonly<MatchRecording> | null {
    return this.log;
  }

  /** Immediate spawn (match setup). In-match spawns go through mode rules. */
  spawnCharacter(o: SpawnOptions): CharacterEntity {
    this.log?.ops.push({ op: 'spawn', options: structuredClone(o) });
    return addCharacter(this.ctx, o);
  }

  /** Queues a control message for the start of the next tick. Dropped then if the mode does not
   *  accept it (accepts(); elimination: operator select only in the pre-round freeze). */
  control(msg: ControlMessage): void {
    this.log?.ops.push({ op: 'control', msg: structuredClone(msg) });
    this.controls.push(msg);
  }

  // NEW — ADR-0014 §4: the state as plain data (net snapshots, prediction rewinds, tests).
  /** A deep copy of the state (plain data; JSON keeps it except −0 and Infinity). Taken between
   *  steps, it holds everything restore() needs. */
  snapshot(): SimState {
    return structuredClone(this.state);
  }

  /** Continues from `snapshot` (ADR-0014 §4): the state becomes a copy of it (the state object and
   *  the characters present in both keep their identity), queued controls and undrained events
   *  are dropped, and the physics is rebuilt from the state (bodies, hitbox sets, stances, gadget
   *  colliders, setup walls). The snapshot must come from this level and mode (only the mode can
   *  be checked: SimState carries no level). Throws on a recording Sim (recordings start at
   *  creation). */
  restore(snapshot: Readonly<SimState>): void {
    if (this.log) throw new Error('Sim.restore: a recording Sim cannot restore (recordings start at creation, ADR-0014 §3)');
    if (snapshot.match.mode !== this.state.match.mode) {
      throw new Error(`Sim.restore: a '${snapshot.match.mode}' snapshot cannot continue a '${this.state.match.mode}' Sim`);
    }
    assignState(this.state, snapshot);
    this.controls.length = 0;
    this.events = [];
    const s = this.state;
    this.physics.syncCharacters(
      s.entities.map((e) => ({ id: e.id, profile: hitboxProfileOf(e.operatorId), pos: e.pos, yaw: e.yaw, stance: e.stance, alive: e.alive })),
    );
    this.physics.resetGadgets(s.gadgets.map((g) => ({ id: g.id, shape: gadgetShape(getAbility(g.abilityId)), pos: g.pos, yaw: g.yaw })));
    this.physics.setSetupWalls(matchSetupWallsUp(s.match));
    this.physics.settle();
  }

  // NEW — ADR-0013 §2: the select screen greys out picks the rules would refuse.
  /** Whether `msg` would be applied if the next tick started now (its character exists and the
   *  mode accepts it, ModeRules.acceptsControl). Read-only; queued messages ahead of it in the same
   *  tick may still change the answer (a teammate's pick). */
  accepts(msg: ControlMessage): boolean {
    return this.getCharacter(msg.entityId) !== undefined && this.rules.acceptsControl(this.ctx, msg);
  }

  getCharacter(id: EntityId): CharacterEntity | undefined {
    return characterById(this.state, id);
  }

  /** Events emitted outside step() (e.g. spawnCharacter during setup). */
  drainEvents(): SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  /** Advances one tick (system order: ADR-0012 §6). Missing commands mean "no input". Returns
   *  this tick's events. Kills in steps 4–10 are judged by the mode in step 2 of the next tick. */
  step(commands: ReadonlyMap<EntityId, Command>): SimEvent[] {
    this.log?.ops.push({ op: 'step', commands: recordCommands(commands) });
    const s = this.state;
    const ctx = this.ctx;
    s.tick += 1;
    s.time = s.tick * TICK_DT;
    const dt = TICK_DT;

    // 1–2. Controls, then the mode's rules (phases, respawns, round resets, the uplink); the
    //      setup walls follow the match state.
    this.applyControls();
    this.rules.tick(ctx, dt);
    this.physics.setSetupWalls(matchSetupWallsUp(s.match));

    // 3. Previous poses for interpolation; the commands of the living, filtered by the mode.
    const inputs: TickInput[] = [];
    for (const e of s.entities) {
      storePrevPose(e);
      if (!e.alive) continue;
      const raw = this.rules.filterCommand(ctx, e, commands.get(e.id) ?? idleCommand(s.tick, e.yaw, e.pitch));
      inputs.push({ e, raw, cmd: raw });
    }
    for (const p of s.projectiles) copyVec3(p.prevPos, p.pos);

    // 4. Abilities: expiry for every character first (an effect applied this tick is not counted
    //    down in it, whatever the entity ids), then per character resources and activations
    //    (gadgets placed, projectiles launched, instant effects); the command later systems see.
    for (const { e } of inputs) if (e.alive) expireEffects(e, dt);
    for (const input of inputs) if (input.e.alive) input.cmd = abilitySystem(ctx, input.e, input.raw, dt);
    // 5–6. Gadget triggers, then areas.
    gadgetSystem(ctx, dt);
    areaSystem(ctx, dt);
    // 7. Movement: the KCC sees barriers indexed by the last physics step.
    for (const { e, cmd } of inputs) if (e.alive) movementSystem(ctx, e, cmd, dt);
    // 8. Physics: pending gadget removals, then the step that indexes this tick's colliders.
    this.physics.step();
    // 9–10. Rays and projectile sweeps see this tick's hitboxes and gadgets.
    for (const { e, cmd } of inputs) if (e.alive) weaponSystem(ctx, e, cmd, dt);
    projectileSystem(ctx, dt);
    // 11. Press edges compare with the raw buttons.
    for (const { e, raw } of inputs) e.lastButtons = raw.buttons;

    if (this.log) {
      const checkpoint = checkpointOf(s);
      if (checkpoint) this.log.checkpoints.push(checkpoint);
    }
    return this.drainEvents();
  }

  private applyControls(): void {
    for (const msg of this.controls.splice(0)) {
      const e = this.getCharacter(msg.entityId);
      if (!e || !this.accepts(msg)) continue;
      switch (msg.type) {
        case 'selectOperator':
          changeOperator(this.ctx, e, msg.operatorId);
          break;
        case 'teleport':
          e.pos = cloneVec3(msg.position);
          e.prevPos = cloneVec3(msg.position);
          e.vel = { x: 0, y: 0, z: 0 };
          e.yaw = withoutNegativeZero(msg.yaw);
          e.pitch = withoutNegativeZero(msg.pitch);
          e.prevYaw = e.yaw;
          e.prevPitch = e.pitch;
          this.physics.teleport(e.id, e.pos, e.yaw);
          break;
      }
    }
  }
}
