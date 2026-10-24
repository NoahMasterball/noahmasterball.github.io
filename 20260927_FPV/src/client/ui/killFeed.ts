import { HUD } from '../../config/client.ts';
import { el } from '../dom.ts';

// NEW — kill feed (SPEC §14 transient, top right): the latest kills from the simulation's `kill`
// events, newest at the bottom; names are coloured by team as the local player sees them. An
// ability kill (kill.cause, ADR-0012 §7) names the ability instead of a weapon.

/** How the local player relates to a character in the feed. */
export type Relation = 'self' | 'ally' | 'enemy';

export interface KillFeedName {
  text: string;
  relation: Relation;
}

export interface KillFeedEntry {
  killer: KillFeedName;
  victim: KillFeedName;
  /** Name of the weapon, or of the ability (`ability`), that made the kill. */
  weapon: string;
  ability: boolean;
  headshot: boolean;
}

interface Row {
  node: HTMLElement;
  age: number;
}

export class KillFeed {
  private readonly root: HTMLElement;
  private rows: Row[] = [];

  constructor(parent: HTMLElement) {
    this.root = el('div', 'kill-feed', parent);
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle('hidden', !visible);
  }

  add(entry: KillFeedEntry): void {
    const node = el('div', 'kill', this.root);
    el('span', entry.killer.relation, node).textContent = entry.killer.text;
    el('span', entry.ability ? 'weapon ability' : 'weapon', node).textContent = entry.weapon;
    if (entry.headshot) el('span', 'headshot', node).textContent = 'HEADSHOT';
    el('span', entry.victim.relation, node).textContent = entry.victim.text;
    this.rows.push({ node, age: 0 });
    while (this.rows.length > HUD.killFeed.maxEntries) this.rows.shift()?.node.remove();
  }

  clear(): void {
    for (const r of this.rows) r.node.remove();
    this.rows = [];
  }

  /** Ages the rows by `dt` s: full opacity, then a fade over the last fadeSeconds, then gone. */
  update(dt: number): void {
    const { seconds, fadeSeconds } = HUD.killFeed;
    this.rows = this.rows.filter((r) => {
      r.age += dt;
      if (r.age >= seconds) {
        r.node.remove();
        return false;
      }
      r.node.style.opacity = Math.min(1, (seconds - r.age) / fadeSeconds).toFixed(3);
      return true;
    });
  }
}
