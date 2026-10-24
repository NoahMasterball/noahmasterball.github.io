import { el, setText } from '../dom.ts';

// NEW — Relay's objective HUD (ADR-0013 §8, SPEC §14): nothing showed the sites, the planted
// uplink or the plant/disrupt prompt (R1 squeezed the prompt into the round HUD's clock caption).
// Three parts, all plain DOM (ADR-0007) written only on change: the objective line under the round
// HUD (own side, the task or the setup hint, or the running uplink with its bar and time left),
// the prompt under the crosshair (interact key + what holding it does, or the own channel with its
// progress) and world markers for the sites and the uplink (DOM, so they show through walls, like
// the reveal markers). The mode host (src/client/modes/relayHost.ts) decides what they show.

/** How the local player relates to a marker or the uplink: the own side's objective or the enemy's. */
export type ObjectiveRelation = 'own' | 'enemy' | 'neutral';

/** A world marker (a site or the planted uplink). */
export interface ObjectiveMarker {
  /** Stable identity (a site id, 'uplink'). */
  key: string;
  kind: 'site' | 'uplink';
  /** Big text in the badge (the site letter). */
  label: string;
  /** The line under the badge (name, distance). */
  detail: string;
  relation: ObjectiveRelation;
  /** Faded (a site that is not the planted one). */
  dim: boolean;
  /** Viewport CSS pixels, or null when it is not on screen. */
  at: { x: number; y: number } | null;
}

export interface ObjectiveHudState {
  /** The own side's label (SIDE_LABEL). */
  side: string;
  /** The objective line: the task, the setup hint or a teammate's channel. */
  task: string;
  /** The planted uplink: its title, 0…1 through the uplink phase, the time left. */
  uplink: { title: string; relation: ObjectiveRelation; progress: number; left: string } | null;
  /** Under the crosshair: `key` + what holding it does, or (key null) a running channel of the
   *  player's with its progress 0…1. */
  prompt: { key: string | null; text: string; progress: number | null } | null;
  markers: readonly ObjectiveMarker[];
}

/** A bar's fill width. */
const percent = (fraction: number): string => `${(Math.min(1, Math.max(0, fraction)) * 100).toFixed(1)}%`;

/** Sets a class list only when it changed. */
function setClass(node: HTMLElement, className: string): void {
  if (node.className !== className) node.className = className;
}

class MarkerView {
  readonly root: HTMLElement;
  private readonly label: HTMLElement;
  private readonly detail: HTMLElement;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'world-label objective-marker', parent);
    this.label = el('div', 'om-badge', this.root);
    this.detail = el('div', 'om-detail', this.root);
  }

  update(m: ObjectiveMarker): void {
    setClass(this.root, `world-label objective-marker ${m.kind} ${m.relation}${m.dim ? ' dim' : ''}`);
    this.root.style.display = m.at ? 'block' : 'none';
    if (!m.at) return;
    this.root.style.left = `${m.at.x}px`;
    this.root.style.top = `${m.at.y}px`;
    setText(this.label, m.label);
    setText(this.detail, m.detail);
  }
}

export class ObjectiveHud {
  private readonly root: HTMLElement;
  private readonly strip: HTMLElement;
  private readonly side: HTMLElement;
  private readonly task: HTMLElement;
  private readonly uplink: HTMLElement;
  private readonly uplinkTitle: HTMLElement;
  private readonly uplinkFill: HTMLElement;
  private readonly uplinkLeft: HTMLElement;
  private readonly prompt: HTMLElement;
  private readonly promptKey: HTMLElement;
  private readonly promptText: HTMLElement;
  private readonly promptBar: HTMLElement;
  private readonly promptFill: HTMLElement;
  private readonly markerLayer: HTMLElement;
  private readonly markers = new Map<string, MarkerView>();

  constructor(parent: HTMLElement) {
    this.root = el('div', 'layer objective-layer hidden', parent);
    // World markers go first in the HUD root, under every HUD layer (crosshair, prompt), like the
    // reveal markers and world labels the App creates before its HUD.
    this.markerLayer = el('div', 'layer hidden');
    parent.prepend(this.markerLayer);

    this.strip = el('div', 'objective-strip', this.root);
    this.side = el('div', 'os-side', this.strip);
    this.task = el('div', 'os-task', this.strip);
    this.uplink = el('div', 'os-uplink', this.strip);
    this.uplinkTitle = el('div', 'os-uplink-title', this.uplink);
    this.uplinkFill = el('div', '', el('div', 'bar', this.uplink));
    this.uplinkLeft = el('div', 'os-uplink-left', this.uplink);

    this.prompt = el('div', 'objective-prompt', this.root);
    const line = el('div', 'objective-prompt-line', this.prompt);
    this.promptKey = el('b', '', line);
    this.promptText = el('span', '', line);
    this.promptBar = el('div', 'bar', this.prompt);
    this.promptFill = el('div', '', this.promptBar);
  }

  /** Shows the state, or hides everything (null: not in a running phase, or a free camera). */
  update(s: ObjectiveHudState | null): void {
    this.root.classList.toggle('hidden', s === null);
    this.markerLayer.classList.toggle('hidden', s === null);
    if (!s) return;
    setText(this.side, s.side);
    setText(this.task, s.task);
    this.uplink.classList.toggle('hidden', s.uplink === null);
    if (s.uplink) {
      setClass(this.uplink, `os-uplink ${s.uplink.relation}`);
      setText(this.uplinkTitle, s.uplink.title);
      this.uplinkFill.style.width = percent(s.uplink.progress);
      setText(this.uplinkLeft, s.uplink.left);
    }

    const p = s.prompt;
    this.prompt.classList.toggle('hidden', p === null);
    if (p) {
      setText(this.promptKey, p.key ?? '');
      this.promptKey.classList.toggle('hidden', p.key === null);
      setText(this.promptText, p.progress === null ? p.text : `${p.text} ${Math.round(p.progress * 100)} %`);
      this.promptBar.classList.toggle('hidden', p.progress === null);
      this.promptFill.style.width = percent(p.progress ?? 0);
    }

    const seen = new Set<string>();
    for (const m of s.markers) {
      seen.add(m.key);
      let view = this.markers.get(m.key);
      if (!view) {
        view = new MarkerView(this.markerLayer);
        this.markers.set(m.key, view);
      }
      view.update(m);
    }
    for (const [key, view] of this.markers) if (!seen.has(key)) view.root.style.display = 'none';
  }
}
