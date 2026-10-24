import type { Side } from '../../data/schema.ts';
import { el, setText } from '../dom.ts';

// NEW — round HUD (SPEC §14 "Top", §4.3): score, round, own side, phase clock and alive counts
// per team, plus the round banners (round start, eliminated, round result, match result). Plain
// DOM (ADR-0007), written only on change; the mode host (src/client/modes/) decides what it shows.

export interface RoundBanner {
  tone: 'win' | 'loss' | 'neutral';
  title: string;
  detail: string;
  /** Dim last line (key hint, what happens next); empty = none. */
  note: string;
  /** The match result: a larger banner. */
  final: boolean;
}

export interface RoundHudState {
  round: number;
  roundsToWin: number;
  overtime: boolean;
  /** This round's side of the local player's team and of the other team. */
  sides: { own: Side; enemy: Side };
  score: { own: number; enemy: number };
  /** One entry per member of the team in slot order, true = alive. */
  alive: { own: readonly boolean[]; enemy: readonly boolean[] };
  /** Phase clock: a caption above ('' = none) and the time text. */
  clock: { caption: string; text: string; urgent: boolean };
  banner: RoundBanner | null;
}

/** m:ss of a remaining time (whole seconds, rounded up: 0:00 only once it has run out). */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Whole seconds left of a countdown (rounded up). */
export const countdownText = (seconds: number): string => String(Math.max(0, Math.ceil(seconds)));

/** A side's short label (the team blocks here, Relay's objective line). */
export const SIDE_LABEL: Record<Side, string> = { attack: 'ATTACK', defend: 'DEFEND' };

class TeamBlock {
  private readonly score: HTMLElement;
  private readonly side: HTMLElement;
  private readonly pips: HTMLElement;
  private pipEls: HTMLElement[] = [];

  constructor(parent: HTMLElement, relation: 'own' | 'enemy') {
    const root = el('div', `rh-team ${relation}`, parent);
    this.score = el('div', 'rh-score', root);
    this.side = el('div', 'rh-side', root);
    this.pips = el('div', 'rh-pips', root);
  }

  update(score: number, side: string, alive: readonly boolean[]): void {
    setText(this.score, String(score));
    setText(this.side, side);
    if (this.pipEls.length !== alive.length) {
      this.pips.replaceChildren();
      this.pipEls = alive.map(() => el('i', '', this.pips));
    }
    alive.forEach((a, i) => this.pipEls[i]?.classList.toggle('dead', !a));
  }
}

export class RoundHud {
  private readonly root: HTMLElement;
  private readonly own: TeamBlock;
  private readonly enemy: TeamBlock;
  private readonly caption: HTMLElement;
  private readonly clock: HTMLElement;
  private readonly round: HTMLElement;
  private readonly banner: HTMLElement;
  private readonly bannerTitle: HTMLElement;
  private readonly bannerDetail: HTMLElement;
  private readonly bannerNote: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'layer round-layer hidden', parent);
    const bar = el('div', 'round-hud', this.root);
    this.own = new TeamBlock(bar, 'own');
    const center = el('div', 'rh-center', bar);
    this.caption = el('div', 'rh-caption', center);
    this.clock = el('div', 'rh-clock', center);
    this.round = el('div', 'rh-round', center);
    this.enemy = new TeamBlock(bar, 'enemy');

    this.banner = el('div', 'round-banner hidden', this.root);
    this.bannerTitle = el('div', 'rb-title', this.banner);
    this.bannerDetail = el('div', 'rb-detail', this.banner);
    this.bannerNote = el('div', 'rb-note', this.banner);
  }

  /** Shows the state, or hides everything (null: no rounds in this mode, or a free camera). */
  update(s: RoundHudState | null): void {
    this.root.classList.toggle('hidden', s === null);
    if (!s) return;
    this.own.update(s.score.own, SIDE_LABEL[s.sides.own], s.alive.own);
    this.enemy.update(s.score.enemy, SIDE_LABEL[s.sides.enemy], s.alive.enemy);
    setText(this.caption, s.clock.caption);
    setText(this.clock, s.clock.text);
    this.clock.classList.toggle('urgent', s.clock.urgent);
    setText(this.round, `${s.overtime ? 'OVERTIME' : `ROUND ${s.round}`} · FIRST TO ${s.roundsToWin}`);

    const b = s.banner;
    this.banner.classList.toggle('hidden', b === null);
    if (!b) return;
    const className = `round-banner ${b.tone}${b.final ? ' final' : ''}`;
    if (this.banner.className !== className) this.banner.className = className;
    setText(this.bannerTitle, b.title);
    setText(this.bannerDetail, b.detail);
    setText(this.bannerNote, b.note);
    this.bannerNote.classList.toggle('hidden', b.note === '');
  }
}
