import { bindingLabel, HUD } from '../../config/client.ts';
import { MATCH_FORMAT } from '../../config/sim.ts';
import type { EliminationMatch } from '../../sim/types.ts';
import { countdownText, formatClock } from '../ui/roundHud.ts';
import type { ModeHost } from './host.ts';
import { createSideHost, roundTitle, SIDE_NOUN, type PhaseView, type SidePhaseContext } from './sideHost.ts';

// NEW — hosting elimination (SPEC §4.3, ADR-0011 §6/§7) on the shared side host (sideHost.ts,
// ADR-0013 §8): the texts of its running phases — the pre-round countdown with the round task
// and the operator key, then the live round clock.

function running(c: SidePhaseContext<EliminationMatch>): PhaseView {
  const { m, ownSide, enemySide, left } = c;
  if (m.phase === 'live') return { clock: { caption: '', text: formatClock(left), urgent: left <= HUD.roundHud.urgentSeconds }, banner: null };
  const clockRule = MATCH_FORMAT.timeoutWinner === ownSide ? 'or hold until time runs out' : 'before time runs out';
  const task = `You ${ownSide}: eliminate every ${SIDE_NOUN[enemySide].one} ${clockRule}`;
  return {
    clock: { caption: 'Round starts in', text: countdownText(left), urgent: false },
    banner: {
      tone: 'neutral',
      title: roundTitle(m),
      detail: c.sidesSwapped ? `Sides swapped. ${task}` : task,
      note: `${bindingLabel('switchOperator')}: change operator before the round starts`,
      final: false,
    },
  };
}

export const createEliminationHost = (): ModeHost =>
  createSideHost<EliminationMatch>({ matchOf: (m) => (m.mode === 'elimination' ? m : null), running });
