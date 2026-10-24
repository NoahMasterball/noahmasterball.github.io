// NEW — always-on HUD: survival bars, hotbar, day/clock, biome name, toasts, death screen.
import { HOTBAR_KEYS, HUD, TEXT } from '../../config/client.ts';
import { PLAYER } from '../../config/sim.ts';
import { BIOMES } from '../../data/biomes.ts';
import { ITEMS } from '../../data/items.ts';
import { biomeAt } from '../../sim/biome.ts';
import type { ControlMessage } from '../../sim/commands.ts';
import type { SimEvent, SimState } from '../../sim/state.ts';
import { isNight } from '../../sim/time.ts';
import { el, setText, setVisible } from '../dom.ts';
import { createSlot, renderSlot, type SlotView } from './items.ts';

interface Bar {
  fill: HTMLDivElement;
  value: HTMLSpanElement;
  root: HTMLDivElement;
}

/** Pure: "HH:MM" for a timeOfDay (0 = midnight). */
export function clockText(timeOfDay: number): string {
  const minutes = Math.floor(timeOfDay * HUD.hoursPerDay * 60) % (HUD.hoursPerDay * 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export class Hud {
  private bars: { health: Bar; hunger: Bar; thirst: Bar };
  private slots: SlotView[] = [];
  private hotbarRoot: HTMLDivElement;
  private clock: HTMLSpanElement;
  private biome: HTMLSpanElement;
  private toasts: HTMLDivElement;
  private death: HTMLDivElement;
  private deathTimer: HTMLDivElement;
  private selectedName: HTMLDivElement;

  constructor(ui: HTMLElement, send: (c: ControlMessage) => void) {
    const top = el('div', 'hud-top', ui);
    const bars = el('div', 'hud-bars', top);
    const bar = (label: string, cls: string): Bar => {
      const root = el('div', `bar ${cls}`, bars);
      el('span', 'bar-label', root).textContent = label;
      const track = el('div', 'bar-track', root);
      const fill = el('div', 'bar-fill', track);
      const value = el('span', 'bar-value', root);
      return { fill, value, root };
    };
    this.bars = { health: bar(TEXT.health, 'bar-health'), hunger: bar(TEXT.hunger, 'bar-hunger'), thirst: bar(TEXT.thirst, 'bar-thirst') };
    const info = el('div', 'hud-info', top);
    this.clock = el('span', 'hud-clock', info);
    this.biome = el('span', 'hud-biome', info);

    this.hotbarRoot = el('div', 'hotbar', ui);
    for (let i = 0; i < PLAYER.hotbarSlots; i++) {
      const s = createSlot(this.hotbarRoot);
      el('span', 'slot-key', s.root).textContent = (HOTBAR_KEYS[i] ?? '').replace('Digit', '');
      s.root.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        send({ type: 'selectHotbar', slot: i });
      });
      this.slots.push(s);
    }
    this.selectedName = el('div', 'hotbar-name', ui);
    this.toasts = el('div', 'toasts', ui);
    this.death = el('div', 'death-screen', ui);
    el('div', 'death-title', this.death).textContent = TEXT.dead;
    this.deathTimer = el('div', 'death-timer', this.death);
    this.death.hidden = true;
  }

  setHotbarVisible(v: boolean): void {
    setVisible(this.hotbarRoot, v);
    setVisible(this.selectedName, v);
  }

  private setBar(b: Bar, value: number, max: number): void {
    const f = Math.max(0, Math.min(1, value / max));
    const pct = `${(f * 100).toFixed(1)}%`;
    if (b.fill.style.width !== pct) b.fill.style.width = pct;
    setText(b.value, String(Math.ceil(value)));
    b.root.classList.toggle('low', f < HUD.lowFraction);
  }

  update(state: SimState): void {
    const p = state.player;
    this.setBar(this.bars.health, p.health, PLAYER.maxHealth);
    this.setBar(this.bars.hunger, p.hunger, PLAYER.maxHunger);
    this.setBar(this.bars.thirst, p.thirst, PLAYER.maxThirst);
    this.slots.forEach((s, i) => {
      renderSlot(s, p.inventory.slots[i] ?? null);
      s.root.classList.toggle('selected', i === p.hotbar);
    });
    const held = p.inventory.slots[p.hotbar];
    setText(this.selectedName, held ? ITEMS[held.item].name : '');
    setText(this.clock, `${TEXT.day} ${state.day} · ${clockText(state.timeOfDay)}`);
    this.clock.classList.toggle('night', isNight(state.timeOfDay));
    const b = p.body;
    setText(this.biome, BIOMES[biomeAt(state.world, b.x + b.w / 2, b.y + b.h)].name);
    setVisible(this.death, p.dead);
    if (p.dead) setText(this.deathTimer, `${TEXT.respawnIn} ${Math.ceil(p.respawnTimer)} s`);
  }

  /** Toasts for pickups / crafting. */
  handle(e: SimEvent): void {
    if (e.type !== 'pickup' && e.type !== 'crafted') return;
    const text = e.type === 'pickup' ? `${TEXT.pickup}${e.count} ${ITEMS[e.item].name}` : `${TEXT.crafted} ${e.count}× ${ITEMS[e.item].name}`;
    const t = el('div', 'toast', this.toasts);
    t.textContent = text;
    while (this.toasts.childElementCount > HUD.maxToasts) this.toasts.firstElementChild?.remove();
    window.setTimeout(() => t.remove(), HUD.toastSeconds * 1000);
  }
}
