import { PLAYABLE_OPERATORS, RELAY, secondsToTicks } from '../../config/sim.ts';
import { siteAt } from '../../data/content.ts';
import type { AbilityDef, LevelDef, SiteDef } from '../../data/schema.ts';
import { ABILITY_BUTTONS, BUTTON, idleCommand, isHeld, type Command } from '../command.ts';
import { characterById, type SimContext } from '../context.ts';
import { changeOperator } from '../entities.ts';
import { clamp, cloneVec3, distance } from '../math.ts';
import { randomIndex } from '../rng.ts';
import type { CharacterEntity, ControlMessage, MatchState, RelayMatch, RelayPhase, UplinkAction, UplinkChannel, UplinkStage } from '../types.ts';
import { decideRound, isPlayableOperator, pickAllowed, sideOf, sideResult, TEAMS, type RoundResult } from './format.ts';
import type { ModeRules } from './mode.ts';
import { ageDead, aliveBySide, beginPhase, bookRound, closeRound, openingFields, phaseOver, sideLevelProblems } from './rounds.ts';

// NEW — Relay (SPEC §4.1, ADR-0013): the primary mode. preRound (operator select: frozen, picks)
// → setup (attackers frozen with recon abilities only; defenders fortify inside the setup walls)
// → live (engagement: a plant — interact held in a site — starts the uplink) → uplink (defenders
// must disrupt it) → roundEnd → next round or matchEnd, on elimination's round flow (rounds.ts)
// and MATCH_FORMAT. The channel reads `lastButtons` (the command of the previous tick) in the mode
// step: one tick of input latency, as for every input. Timers are ticks.

/** Length of each timed phase in ticks (matchEnd is terminal). */
const PHASE_TICKS: Record<Exclude<RelayPhase, 'matchEnd'>, number> = {
  preRound: secondsToTicks(RELAY.preRoundSeconds),
  setup: secondsToTicks(RELAY.setupSeconds),
  live: secondsToTicks(RELAY.engagementSeconds),
  uplink: secondsToTicks(RELAY.uplinkSeconds),
  roundEnd: secondsToTicks(RELAY.roundEndSeconds),
};

/** Ticks interact must be held per channel. */
const CHANNEL_TICKS: Record<UplinkAction, number> = {
  plant: secondsToTicks(RELAY.plantSeconds),
  disrupt: secondsToTicks(RELAY.disruptSeconds),
};

/** Phases in which every living character may only look around. */
const LOOK_ONLY: ReadonlySet<RelayPhase> = new Set<RelayPhase>(['preRound', 'matchEnd']);
/** What the frozen attackers keep in setup besides the look: their ability keys (the gate lets
 *  recon abilities through only). */
const ABILITY_KEYS = ABILITY_BUTTONS.reduce<number>((bits, b) => bits | b, 0);
/** What a channeller holding interact keeps besides the look. */
const CHANNEL_KEYS = BUTTON.interact | BUTTON.crouch;

/** The Relay match state, or null in another mode. */
export const relayOf = (match: MatchState): RelayMatch | null => (match.mode === 'relay' ? match : null);

function matchOf(ctx: SimContext): RelayMatch {
  const m = relayOf(ctx.state.match);
  if (!m) throw new Error(`Relay rules running a '${ctx.state.match.mode}' match`);
  return m;
}

function frozen(match: MatchState, team: number): boolean {
  const m = relayOf(match);
  return m !== null && (LOOK_ONLY.has(m.phase) || (m.phase === 'setup' && team === m.attackingTeam));
}

/** "Recon abilities only" (SPEC §4.1 setup): every effect of `ability` is of a kind in
 *  RELAY.setupAttackerEffects — derived from the effects, no data tag. */
export const isReconAbility = (ability: AbilityDef): boolean => ability.effects.every((effect) => RELAY.setupAttackerEffects.includes(effect.kind));

/** The ability gate (ModeRules.abilityAllowed): attackers use recon abilities only in setup. */
function abilityAllowed(match: MatchState, e: Readonly<CharacterEntity>, ability: AbilityDef): boolean {
  const m = relayOf(match);
  return m === null || m.phase !== 'setup' || e.team !== m.attackingTeam || isReconAbility(ability);
}

// ── Uplink ──────────────────────────────────────────────────────────────────

/** The site `e` could plant in now (phase live, a living attacker standing on the ground inside
 *  a site), or null. The one plant rule of the sim, the HUD prompt and the bots. */
export function plantSiteFor(level: LevelDef, match: MatchState, e: Readonly<CharacterEntity>): SiteDef | null {
  const m = relayOf(match);
  if (!m || m.phase !== 'live' || !e.alive || !e.grounded || sideOf(m, e.team) !== 'attack') return null;
  return siteAt(level, [e.pos.x, e.pos.y, e.pos.z]) ?? null;
}

/** Whether `e` could disrupt the uplink now (phase uplink, a living defender on the ground within
 *  RELAY.disruptRadiusM of it). */
export function canDisrupt(match: MatchState, e: Readonly<CharacterEntity>): boolean {
  const m = relayOf(match);
  return (
    m !== null &&
    m.phase === 'uplink' &&
    m.uplink !== null &&
    e.alive &&
    e.grounded &&
    sideOf(m, e.team) === 'defend' &&
    distance(e.pos, m.uplink.pos) <= RELAY.disruptRadiusM
  );
}

/** How far the running channel is at `tick` (0…1), or null without one (HUD bars, bots). Named
 *  apart from stats.ts' channelProgress (ability channels). */
export function uplinkProgress(match: MatchState, tick: number): number | null {
  const c = relayOf(match)?.channel;
  return c ? clamp((tick - c.startTick) / (c.endTick - c.startTick), 0, 1) : null;
}

/** The channel `e` qualifies for now, or null. */
function channelFor(level: LevelDef, m: RelayMatch, e: Readonly<CharacterEntity>): { action: UplinkAction; siteId: string } | null {
  const site = plantSiteFor(level, m, e);
  if (site) return { action: 'plant', siteId: site.id };
  if (m.uplink && canDisrupt(m, e)) return { action: 'disrupt', siteId: m.uplink.siteId };
  return null;
}

function channeller(ctx: SimContext, c: UplinkChannel): CharacterEntity {
  const e = characterById(ctx.state, c.entityId);
  if (!e) throw new Error(`Uplink channel of unknown character ${c.entityId}`);
  return e;
}

function emitUplink(ctx: SimContext, c: UplinkChannel, stage: UplinkStage): void {
  const e = channeller(ctx, c);
  ctx.emit({ type: 'uplink', action: c.action, stage, entityId: e.id, siteId: c.siteId, pos: cloneVec3(e.pos) });
}

/** Stops the running channel, if any (its progress is lost). */
function cancelChannel(ctx: SimContext, m: RelayMatch): void {
  if (!m.channel) return;
  emitUplink(ctx, m.channel, 'cancel');
  m.channel = null;
}

/** The channel of this tick (ADR-0013 §5): a running one is cancelled once its channeller is
 *  dead, no longer holds interact or no longer qualifies (the same site, the same action), and
 *  completes at its endTick; with none running, the living character with the lowest entity id
 *  that holds interact and qualifies starts one. A completed plant plants the uplink (phase
 *  uplink); returns the action that completed, or null. */
function stepChannel(ctx: SimContext, m: RelayMatch): UplinkAction | null {
  const tick = ctx.state.tick;
  const running = m.channel;
  if (running) {
    const e = channeller(ctx, running);
    const now = e.alive && isHeld(e.lastButtons, BUTTON.interact) ? channelFor(ctx.level, m, e) : null;
    if (now?.action !== running.action || now.siteId !== running.siteId) {
      cancelChannel(ctx, m);
    } else if (tick >= running.endTick) {
      emitUplink(ctx, running, 'complete');
      m.channel = null;
      if (running.action === 'plant') {
        m.uplink = { siteId: running.siteId, pos: cloneVec3(e.pos) };
        enterPhase(ctx, m, 'uplink');
      }
      return running.action;
    } else {
      return null;
    }
  }
  // Entities are in id order (allocateId).
  for (const e of ctx.state.entities) {
    if (!e.alive || !isHeld(e.lastButtons, BUTTON.interact)) continue;
    const q = channelFor(ctx.level, m, e);
    if (!q) continue;
    m.channel = { action: q.action, entityId: e.id, siteId: q.siteId, startTick: tick, endTick: tick + CHANNEL_TICKS[q.action] };
    emitUplink(ctx, m.channel, 'start');
    break;
  }
  return null;
}

// ── Round flow ──────────────────────────────────────────────────────────────

function enterPhase(ctx: SimContext, m: RelayMatch, phase: RelayPhase): void {
  beginPhase(ctx, m, phase, phase === 'matchEnd' ? null : PHASE_TICKS[phase]);
}

function endRound(ctx: SimContext, m: RelayMatch, result: RoundResult): void {
  cancelChannel(ctx, m);
  bookRound(ctx, m, result);
  enterPhase(ctx, m, 'roundEnd');
}

/** The end of operator select: every team within the pick rules. A character whose operator is
 *  not playable, or is over operatorPickLimit beside its lower-id teammates, gets a legal one
 *  drawn from SimState.rng (`operatorChanged`) — never with the default roster and accepted
 *  picks; it covers rosters spawned otherwise (QA, tests, a changed PLAYABLE_OPERATORS). */
function settlePicks(ctx: SimContext): void {
  for (const team of TEAMS) {
    const settled: CharacterEntity[] = [];
    for (const e of ctx.state.entities) {
      if (e.team !== team) continue;
      if (!isPlayableOperator(e.operatorId) || !pickAllowed(settled, e.id, e.operatorId)) {
        const options = PLAYABLE_OPERATORS.filter((id) => pickAllowed(settled, e.id, id));
        const pick = options[randomIndex(ctx.state.rng, options.length)];
        if (pick !== undefined) changeOperator(ctx, e, pick);
      }
      settled.push(e);
    }
  }
}

/** The round result of the engagement and the uplink phase (ADR-0013 §6), channel first: live →
 *  elimination's rule (wipes, mutual wipe, the clock); uplink → a disrupt wins for the defenders,
 *  a defender wipe or the clock for the attackers; an attacker wipe does not end it. */
function judge(ctx: SimContext, m: RelayMatch): RoundResult | null {
  if (stepChannel(ctx, m) === 'disrupt') return sideResult(m, 'defend', 'disrupted');
  const alive = aliveBySide(ctx, m);
  if (m.phase === 'live') return decideRound(m, alive, phaseOver(ctx, m));
  if (alive.defend === 0) return sideResult(m, 'attack', 'elimination');
  return phaseOver(ctx, m) ? sideResult(m, 'attack', 'uplink') : null;
}

function tick(ctx: SimContext, dt: number): void {
  const m = matchOf(ctx);
  ageDead(ctx, dt);
  switch (m.phase) {
    case 'preRound':
      if (phaseOver(ctx, m)) {
        settlePicks(ctx);
        enterPhase(ctx, m, 'setup');
      }
      break;
    case 'setup': {
      // Only gadgets can wipe a side here; the clock ends nothing.
      const alive = aliveBySide(ctx, m);
      const result = alive.attack === 0 || alive.defend === 0 ? decideRound(m, alive, false) : null;
      if (result) endRound(ctx, m, result);
      else if (phaseOver(ctx, m)) enterPhase(ctx, m, 'live');
      break;
    }
    case 'live':
    case 'uplink': {
      const result = judge(ctx, m);
      if (result) endRound(ctx, m, result);
      break;
    }
    case 'roundEnd':
      if (!phaseOver(ctx, m)) break;
      if (closeRound(ctx, m, RELAY.attackZone) === 'matchEnd') {
        enterPhase(ctx, m, 'matchEnd');
      } else {
        m.channel = null;
        m.uplink = null;
        enterPhase(ctx, m, 'preRound');
      }
      break;
    case 'matchEnd':
      break;
  }
}

function filterCommand(ctx: SimContext, e: CharacterEntity, cmd: Command): Command {
  const m = matchOf(ctx);
  const look = (): Command => idleCommand(cmd.tick, cmd.yaw, cmd.pitch);
  if (frozen(m, e.team)) return m.phase === 'setup' ? { ...look(), buttons: cmd.buttons & ABILITY_KEYS } : look();
  // A channeller holding interact stands still with the look free (releasing frees it at once).
  if (m.channel?.entityId === e.id && isHeld(cmd.buttons, BUTTON.interact)) return { ...look(), buttons: cmd.buttons & CHANNEL_KEYS };
  return cmd;
}

/** Operator picks: in operator select, a playable operator within the pick limit of the picker's
 *  team (pickAllowed); teleport (QA) always. */
function acceptsControl(ctx: SimContext, msg: ControlMessage): boolean {
  if (msg.type !== 'selectOperator') return true;
  const e = characterById(ctx.state, msg.entityId);
  if (!e || matchOf(ctx).phase !== 'preRound' || !isPlayableOperator(msg.operatorId)) return false;
  return pickAllowed(
    ctx.state.entities.filter((m) => m.team === e.team),
    e.id,
    msg.operatorId,
  );
}

function validateLevel(level: LevelDef): string[] {
  const problems = sideLevelProblems(level, 'relay');
  if (!level.sites?.length) problems.push(`level '${level.id}': relay needs at least one site`);
  if (!level.setupWalls?.length) problems.push(`level '${level.id}': relay needs setup walls (the defenders' boundary in setup)`);
  return problems;
}

export const RELAY_RULES: ModeRules = {
  validateLevel,
  initialMatch(ctx) {
    const m: RelayMatch = { mode: 'relay', phase: 'preRound', ...openingFields(ctx, RELAY.attackZone), channel: null, uplink: null };
    enterPhase(ctx, m, 'preRound');
    return m;
  },
  tick,
  frozen,
  filterCommand,
  acceptsControl,
  abilityAllowed,
  setupWallsUp: (match) => relayOf(match)?.phase === 'setup',
};
