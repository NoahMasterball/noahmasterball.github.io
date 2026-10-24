import type { BotSlot } from '../../ai/types.ts';
import { MATCH_FORMAT, PLAYABLE_OPERATORS, TICK_DT, type AiTier } from '../../config/sim.ts';
import type { Side } from '../../data/schema.ts';
import { defaultRoster, isOvertime, matchWinner, otherTeam, roundMatchOf, roundSpawnOptions, sideOf } from '../../sim/modes/format.ts';
import type { Sim } from '../../sim/sim.ts';
import { operatorOf } from '../../sim/stats.ts';
import type { CharacterEntity, RoundEndReason, RoundMatch, SimEvent } from '../../sim/types.ts';
import { countdownText, type RoundBanner, type RoundHudState } from '../ui/roundHud.ts';
import type { HostSpawn, ModeHost } from './host.ts';

// NEW — the mode-neutral part of hosting a side-based round mode (ADR-0013 §8), moved out of
// eliminationHost.ts so elimination and Relay share it: the default 5v5 roster at the round's
// side spawns with combat bots of one tier, no health bars over anyone, the event bookkeeping
// (round result, who eliminated the player, a side swap), score, sides and alive counts, and the
// eliminated, round-result and match banners. A mode adds the clock and banner of its running
// phases (SideModeView). Dead players keep a fixed camera at their death position (App.render)
// until the next round's spawn.

/** A member of a side, and the side's members. */
export const SIDE_NOUN: Record<Side, { one: string; many: string }> = {
  attack: { one: 'attacker', many: 'attackers' },
  defend: { one: 'defender', many: 'defenders' },
};

/** Why the last round ended, from its roundEnd event (the match state keeps only the winner). */
interface RoundResultInfo {
  winner: number;
  winnerSide: Side;
  reason: RoundEndReason;
  /** Both sides were wiped out in the same tick (MATCH_FORMAT.mutualWipeWinner took it). */
  bothWiped: boolean;
}

/** One result text per reason (a Record, so a new reason cannot be forgotten). */
const RESULT_TEXT: Record<RoundEndReason, (r: RoundResultInfo, m: RoundMatch) => string> = {
  elimination: (r, m) =>
    r.bothWiped ? `Both sides eliminated — the ${SIDE_NOUN[r.winnerSide].many} take the round` : `Every ${SIDE_NOUN[sideOf(m, otherTeam(r.winner))].one} eliminated`,
  timeout: (r) => `Time ran out — the ${SIDE_NOUN[r.winnerSide].many} take the round`,
  uplink: (r) => `The uplink completed — the ${SIDE_NOUN[r.winnerSide].many} take the round`,
  disrupted: (r) => `The uplink was disrupted — the ${SIDE_NOUN[r.winnerSide].many} take the round`,
};

/** What a mode's view of a running phase reads. */
export interface SidePhaseContext<M extends RoundMatch> {
  sim: Sim;
  player: CharacterEntity;
  m: M;
  ownSide: Side;
  enemySide: Side;
  /** Seconds left on the phase clock. */
  left: number;
  /** The sides swapped at the start of this round. */
  sidesSwapped: boolean;
}

/** The round HUD's clock and banner of one moment. */
export interface PhaseView {
  clock: RoundHudState['clock'];
  banner: RoundBanner | null;
}

/** What a side mode's host adds: its match state and the view of its running phases (every
 *  phase but roundEnd and matchEnd; the eliminated banner replaces its banner while the player
 *  is dead). */
export interface SideModeView<M extends RoundMatch> {
  matchOf(match: RoundMatch): M | null;
  running(c: SidePhaseContext<M>): PhaseView;
}

/** The pre-round banner's title: the round, or the overtime round. */
export const roundTitle = (m: RoundMatch): string => `ROUND ${m.round}${isOvertime(m.score) ? ' · OVERTIME' : ''}`;

/** Alive flags of a team's members in slot (entity id) order. */
const aliveFlags = (sim: Sim, team: number): boolean[] => sim.state.entities.filter((e) => e.team === team).map((e) => e.alive);

class SideHost<M extends RoundMatch> implements ModeHost {
  readonly usesTier = true;
  readonly waitsForPlayer = true;
  private readonly view: SideModeView<M>;
  private lastResult: RoundResultInfo | null = null;
  private attackersBefore: number | null = null;
  private sidesSwapped = false;
  /** Operator name of whoever eliminated the player this round. */
  private killer: string | null = null;

  constructor(view: SideModeView<M>) {
    this.view = view;
  }

  private matchOf(sim: Sim): M {
    const round = roundMatchOf(sim.state.match);
    const m = round && this.view.matchOf(round);
    if (!m) throw new Error(`A side host is running a '${sim.state.match.mode}' match it does not host`);
    return m;
  }

  spawn(sim: Sim, tier: AiTier): HostSpawn {
    const first = PLAYABLE_OPERATORS[0];
    if (first === undefined) throw new Error('PLAYABLE_OPERATORS is empty');
    let player: CharacterEntity | null = null;
    const slots: BotSlot[] = [];
    // In roster order, so each team's entity ids follow its spawn slots (roundSpawnOptions).
    for (const options of roundSpawnOptions(sim.level, this.matchOf(sim), defaultRoster(first))) {
      const e = sim.spawnCharacter(options);
      if (options.controller === 'player') player = e;
      else slots.push({ entityId: e.id, brain: { kind: 'combat', tier } });
    }
    if (!player) throw new Error('The default roster has no player');
    return { player, slots };
  }

  attach(): void {
    // The shared host has no screens of its own; the round HUD is the App's.
  }

  hint(): null {
    // The pre-round banner carries the operator key; the debug key is in the menu.
    return null;
  }

  labelled(): boolean {
    // Floating health bars would show enemies through walls.
    return false;
  }

  onEvents(events: readonly SimEvent[], sim: Sim, player: CharacterEntity): void {
    for (const ev of events) {
      switch (ev.type) {
        case 'phase':
          if (ev.phase === 'preRound') {
            this.sidesSwapped = this.attackersBefore !== null && ev.attackingTeam !== this.attackersBefore;
            this.attackersBefore = ev.attackingTeam;
            this.lastResult = null;
          }
          break;
        case 'roundEnd':
          this.lastResult = {
            winner: ev.winner,
            winnerSide: ev.winnerSide,
            reason: ev.reason,
            bothWiped: !sim.state.entities.some((e) => e.alive),
          };
          break;
        case 'kill':
          if (ev.victimId === player.id) {
            const attacker = sim.getCharacter(ev.attackerId);
            this.killer = attacker ? operatorOf(attacker).name : null;
          }
          break;
        case 'spawn':
          if (ev.entityId === player.id) this.killer = null;
          break;
        default:
          break;
      }
    }
  }

  frame(): void {
    // Nothing per frame: the round HUD is polled through roundHud().
  }

  roundHud(sim: Sim, player: CharacterEntity): RoundHudState {
    const m = this.matchOf(sim);
    const own = player.team;
    const enemy = otherTeam(own);
    const ownSide = sideOf(m, own);
    const enemySide = sideOf(m, enemy);
    const left = m.phaseEndTick === null ? 0 : (m.phaseEndTick - sim.state.tick) * TICK_DT;
    const score = { own: m.score[own] ?? 0, enemy: m.score[enemy] ?? 0 };
    const alive = { own: aliveFlags(sim, own), enemy: aliveFlags(sim, enemy) };
    const running = m.phase !== 'roundEnd' && m.phase !== 'matchEnd';
    const scoreText = `${score.own} – ${score.enemy}`;

    let view: PhaseView;
    if (m.phase === 'roundEnd') {
      const decided = matchWinner(m.score) !== null;
      const r = this.lastResult;
      view = {
        clock: { caption: decided ? 'Match ends in' : 'Next round in', text: countdownText(left), urgent: false },
        banner: r && {
          tone: r.winner === own ? 'win' : 'loss',
          title: r.winner === own ? 'ROUND WON' : 'ROUND LOST',
          detail: `${RESULT_TEXT[r.reason](r, m)} · ${scoreText}`,
          note: '',
          final: false,
        },
      };
    } else if (m.phase === 'matchEnd') {
      const won = matchWinner(m.score) === own;
      view = {
        clock: { caption: 'Match over', text: scoreText, urgent: false },
        banner: { tone: won ? 'win' : 'loss', title: won ? 'VICTORY' : 'DEFEAT', detail: `Final score ${scoreText}`, note: 'Esc opens the menu: NEW MATCH plays again', final: true },
      };
    } else {
      view = this.view.running({ sim, player, m, ownSide, enemySide, left, sidesSwapped: this.sidesSwapped });
      if (!player.alive) {
        const allies = alive.own.filter(Boolean).length;
        view.banner = {
          tone: 'loss',
          title: 'ELIMINATED',
          detail: `${this.killer ? `By ${this.killer} · ` : ''}${allies} ${allies === 1 ? 'teammate' : 'teammates'} still fighting`,
          note: 'The camera stays here until the next round',
          final: false,
        };
      }
    }
    return {
      round: m.round,
      roundsToWin: MATCH_FORMAT.roundsToWin,
      overtime: running && isOvertime(m.score),
      sides: { own: ownSide, enemy: enemySide },
      score,
      alive,
      clock: view.clock,
      banner: view.banner,
    };
  }
}

/** A host for a side-based round mode: the shared part plus the mode's view. */
export const createSideHost = <M extends RoundMatch>(view: SideModeView<M>): ModeHost => new SideHost(view);
