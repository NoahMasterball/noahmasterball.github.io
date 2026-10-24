// NEW — the one item-slot look (hotbar, inventory, container, crafting) and item tooltips.
import { TEXT } from '../../config/client.ts';
import { ITEMS } from '../../data/items.ts';
import type { ItemId } from '../../data/schema.ts';
import { TILES } from '../../data/tiles.ts';
import type { ItemStack } from '../../sim/state.ts';
import { css, shade } from '../color.ts';
import { el, setText } from '../dom.ts';

export interface SlotView {
  root: HTMLDivElement;
  icon: HTMLDivElement;
  count: HTMLSpanElement;
  key: string;
}

export function createSlot(parent: HTMLElement, className = ''): SlotView {
  const root = el('div', `slot interactive ${className}`.trim(), parent);
  const icon = el('div', 'slot-icon', root);
  icon.hidden = true;
  const count = el('span', 'slot-count', root);
  return { root, icon, count, key: '' };
}

/** Updates a slot only when its stack changed. */
export function renderSlot(view: SlotView, stack: ItemStack | null): void {
  const key = stack ? `${stack.item}:${stack.count}` : '';
  if (key === view.key) return;
  view.key = key;
  if (!stack) {
    view.icon.hidden = true;
    setText(view.count, '');
    view.root.title = '';
    return;
  }
  const def = ITEMS[stack.item];
  view.icon.hidden = false;
  view.icon.style.background = css(def.presentation.color);
  view.icon.style.borderColor = css(shade(def.presentation.color, 0.6));
  setText(view.icon, def.presentation.icon);
  setText(view.count, stack.count > 1 ? String(stack.count) : '');
  view.root.title = itemTooltip(stack.item);
}

/** Tooltip text: name, category and the stats the item has. */
export function itemTooltip(id: ItemId): string {
  const d = ITEMS[id];
  const s = TEXT.stats;
  const lines = [d.name, TEXT.categories[d.category]];
  if (d.tool) lines.push(`${s.power} ${d.tool.power} · ${s.speed} ${d.tool.speed}`);
  if (d.melee) lines.push(`${s.damage} ${d.melee.damage} · ${s.range} ${d.melee.range} · ${s.cooldown} ${d.melee.cooldown}s`);
  if (d.ranged) {
    lines.push(`${s.damage} ${d.ranged.damage}${d.ranged.pellets > 1 ? ` ×${d.ranged.pellets} ${s.pellets}` : ''} · ${s.range} ${d.ranged.range}`);
    lines.push(`${s.ammo}: ${ITEMS[d.ranged.ammo].name}`);
  }
  if (d.consumable) {
    const c = d.consumable;
    const parts = [
      c.health ? `${s.health} +${c.health}` : '',
      c.hunger ? `${s.hunger} +${c.hunger}` : '',
      c.thirst ? `${s.thirst} +${c.thirst}` : '',
      `${s.useTime} ${c.useTime}s`,
    ].filter(Boolean);
    lines.push(parts.join(' · '));
  }
  if (d.places) lines.push(`${s.places}: ${TILES[d.places].name}`);
  return lines.join('\n');
}
