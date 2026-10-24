import { bindingLabel, HUD, systemKeyLabel } from '../../config/client.ts';
import { getAbility, getOperator, loadoutWeapon } from '../../data/content.ts';
import { isReconAbility } from '../../sim/modes/relay.ts';
import { el, hexColor, setText } from '../dom.ts';

// NEW — Relay's operator select screen (ADR-0013 §3/§8, SPEC §4.1): O cycled operators blindly.
// One card per operator of the list the host passes (PLAYABLE_OPERATORS), generated from the
// operator data (name, archetype, accent colour, stats, both weapons, abilities — recon ones
// marked, as the setup gate lets them through — and bio). Live per frame: how many of the team play
// each operator against the pick limit, whether the simulation would accept a pick now (the host
// asks Sim.accepts; a refused card is disabled), the player's team and the countdown. With a free
// pointer it is a screen (click or number key picks, the ready key keeps the operator; both
// return to the game); with a locked pointer a compact strip names the keys. Plain DOM (ADR-0007).

const TEXT = HUD.relay.text.select;
const KEYS = HUD.relay.select;
/** Number keys exist for the first nine cards. */
const MAX_PICK_KEYS = 9;

/** A card's live state. */
export interface OperatorChoice {
  operatorId: string;
  /** Members of the player's team, the player included, who play it now. */
  taken: number;
  /** The simulation would accept the player's pick of it now (Sim.accepts). */
  allowed: boolean;
}

/** A member of the player's team. */
export interface TeamPick {
  operatorId: string;
  you: boolean;
}

export interface OperatorSelectState {
  /** 'screen': the interactive select screen (free pointer); 'strip': the compact line (locked). */
  view: 'screen' | 'strip';
  /** Header: the round, the side's task, where the attackers enter. */
  title: string;
  detail: string;
  note: string;
  countdown: string;
  /** The player's operator. */
  current: string;
  /** How many members of a team may play the same operator (operatorPickLimit). */
  limit: number;
  /** One entry per card (in card order). */
  choices: readonly OperatorChoice[];
  /** The player's team in slot order. */
  team: readonly TeamPick[];
}

export interface OperatorSelectHandlers {
  /** A card was chosen (it may be the current operator). */
  onPick(operatorId: string): void;
  /** Keep the current operator and play. */
  onReady(): void;
  onMenu(): void;
}

/** A card's DOM: its static content is built once from the data; these parts change. */
interface Card {
  operatorId: string;
  root: HTMLButtonElement;
  pips: HTMLElement;
  picks: HTMLElement;
  badge: HTMLElement;
}

/** The pick key's code and label of card `index`, or null past the number keys. */
function pickKey(index: number): { code: string; label: string } | null {
  if (index >= MAX_PICK_KEYS) return null;
  const n = String(index + 1);
  return { code: `${KEYS.pickKeyPrefix}${n}`, label: n };
}

function buildCard(parent: HTMLElement, operatorId: string, index: number, onPick: (id: string) => void): Card {
  const op = getOperator(operatorId);
  const root = el('button', 'opsel-card', parent);
  root.type = 'button';
  root.dataset.operator = operatorId;
  root.style.setProperty('--op-color', hexColor(op.presentation.color));
  root.addEventListener('click', () => onPick(operatorId));

  const head = el('div', 'opsel-card-head', root);
  const key = pickKey(index);
  if (key) el('span', 'opsel-key', head).textContent = key.label;
  el('span', 'opsel-name', head).textContent = op.name;
  el('span', 'opsel-arch', head).textContent = op.archetype;
  el('div', 'opsel-stats', root).textContent = TEXT.stats(op.maxHealth, op.armour, op.moveSpeed);

  const weapons = el('div', 'opsel-section', root);
  el('div', 'opsel-caption', weapons).textContent = TEXT.weapons;
  for (const slot of ['primary', 'secondary'] as const) {
    const w = loadoutWeapon(op, slot);
    const line = el('div', '', weapons);
    line.textContent = w.name;
    el('span', 'opsel-dim', line).textContent = ` · ${w.class.toUpperCase()}`;
  }
  const abilities = el('div', 'opsel-section', root);
  el('div', 'opsel-caption', abilities).textContent = TEXT.abilities;
  for (const id of op.abilities) {
    const a = getAbility(id);
    const line = el('div', '', abilities);
    line.textContent = a.name;
    if (isReconAbility(a)) el('div', 'opsel-tag', line).textContent = TEXT.recon;
  }
  el('div', 'opsel-bio', root).textContent = op.presentation.bio;

  const foot = el('div', 'opsel-card-foot', root);
  const pips = el('div', 'opsel-pips', foot);
  const picks = el('span', 'opsel-picks', foot);
  const badge = el('span', 'opsel-badge', foot);
  return { operatorId, root, pips, picks, badge };
}

export class OperatorSelect {
  private readonly screen: HTMLElement;
  private readonly title: HTMLElement;
  private readonly detail: HTMLElement;
  private readonly note: HTMLElement;
  private readonly countdown: HTMLElement;
  private readonly cards: Card[];
  private readonly team: HTMLElement;
  private teamChips: HTMLElement[] = [];
  private readonly strip: HTMLElement;
  private readonly stripText: HTMLElement;
  private readonly stripCountdown: HTMLElement;
  private readonly handlers: OperatorSelectHandlers;
  /** The screen takes keys (it is shown with a free pointer). */
  private interactive = false;

  constructor(parent: HTMLElement, operatorIds: readonly string[], handlers: OperatorSelectHandlers) {
    this.handlers = handlers;
    this.screen = el('div', 'opsel hidden', parent);
    const panel = el('div', 'opsel-panel', this.screen);

    const header = el('div', 'opsel-header', panel);
    const heading = el('div', '', header);
    el('div', 'opsel-overline', heading).textContent = TEXT.title;
    this.title = el('div', 'opsel-title', heading);
    this.detail = el('div', 'opsel-detail', heading);
    this.note = el('div', 'opsel-note', heading);
    this.countdown = el('div', 'opsel-countdown', header);

    const grid = el('div', 'opsel-cards', panel);
    grid.style.setProperty('--cards', String(operatorIds.length));
    this.cards = operatorIds.map((id, i) => buildCard(grid, id, i, (picked) => handlers.onPick(picked)));

    const teamRow = el('div', 'opsel-team', panel);
    el('span', 'opsel-caption', teamRow).textContent = TEXT.team;
    this.team = el('div', 'opsel-chips', teamRow);

    const foot = el('div', 'opsel-foot', panel);
    const first = pickKey(0);
    const last = pickKey(Math.min(operatorIds.length, MAX_PICK_KEYS) - 1);
    const pickLabel = first && last ? (first.label === last.label ? first.label : `${first.label}–${last.label}`) : '';
    el('div', 'opsel-keys', foot).textContent = TEXT.keys(pickLabel, KEYS.readyKey.label);
    const ready = el('button', 'opsel-ready', foot);
    ready.type = 'button';
    ready.textContent = TEXT.ready;
    ready.addEventListener('click', () => handlers.onReady());
    const menu = el('button', 'opsel-menu', foot);
    menu.type = 'button';
    menu.textContent = TEXT.menu;
    menu.addEventListener('click', () => handlers.onMenu());

    this.strip = el('div', 'opsel-strip hidden', parent);
    this.stripText = el('span', '', this.strip);
    this.stripCountdown = el('b', '', this.strip);

    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.interactive || e.repeat) return;
    if (e.code === KEYS.readyKey.code) {
      e.preventDefault();
      this.handlers.onReady();
      return;
    }
    const card = this.cards.find((_, i) => pickKey(i)?.code === e.code);
    if (!card) return;
    e.preventDefault();
    if (!card.root.disabled) this.handlers.onPick(card.operatorId);
  }

  /** Shows the screen or the strip, or hides both (null). */
  update(s: OperatorSelectState | null): void {
    this.interactive = s?.view === 'screen';
    this.screen.classList.toggle('hidden', !this.interactive);
    this.strip.classList.toggle('hidden', s?.view !== 'strip');
    if (!s) return;
    if (s.view === 'strip') {
      setText(this.stripText, TEXT.strip(getOperator(s.current).name, bindingLabel('switchOperator'), systemKeyLabel('release')));
      setText(this.stripCountdown, s.countdown);
      return;
    }
    setText(this.title, s.title);
    setText(this.detail, s.detail);
    setText(this.note, s.note);
    setText(this.countdown, s.countdown);
    this.cards.forEach((card, i) => this.updateCard(card, s.choices[i], s.current, s.limit));
    this.updateTeam(s.team);
  }

  private updateCard(card: Card, choice: OperatorChoice | undefined, current: string, limit: number): void {
    const selected = card.operatorId === current;
    const allowed = choice?.allowed ?? false;
    const taken = choice?.taken ?? 0;
    card.root.disabled = !selected && !allowed;
    card.root.classList.toggle('selected', selected);
    if (card.pips.childElementCount !== limit) {
      card.pips.replaceChildren();
      for (let i = 0; i < limit; i++) el('i', '', card.pips);
    }
    Array.from(card.pips.children).forEach((pip, i) => pip.classList.toggle('taken', i < taken));
    setText(card.picks, TEXT.picks(taken, limit));
    setText(card.badge, selected ? TEXT.selected : allowed ? '' : TEXT.full);
  }

  private updateTeam(team: readonly TeamPick[]): void {
    if (this.teamChips.length !== team.length) {
      this.team.replaceChildren();
      this.teamChips = team.map(() => el('span', 'opsel-chip', this.team));
    }
    team.forEach((m, i) => {
      const chip = this.teamChips[i];
      if (!chip) return;
      const op = getOperator(m.operatorId);
      setText(chip, m.you ? `${TEXT.you} · ${op.name}` : op.name);
      chip.classList.toggle('you', m.you);
      chip.style.setProperty('--op-color', hexColor(op.presentation.color));
    });
  }
}
