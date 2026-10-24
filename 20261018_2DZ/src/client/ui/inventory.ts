// NEW — inventory screen (E/Tab): player slots, the open container, the crafting list generated
// from RECIPES. Drag & drop → moveStack (right-drag moves half), Shift+click → quickMove,
// drop outside the panels / Q over a slot → dropStack, closing with a container open →
// closeContainer. Every change is a ControlMessage; the screen only reads SimState.
import { HUD, MOUSE_BUTTONS, TEXT } from '../../config/client.ts';
import { PLAYER } from '../../config/sim.ts';
import { TILE_DEFS } from '../../data/content.ts';
import { ITEMS } from '../../data/items.ts';
import { RECIPES } from '../../data/recipes.ts';
import { RECIPE_IDS, type RecipeId } from '../../data/schema.ts';
import { TILES } from '../../data/tiles.ts';
import type { ControlMessage, SlotRef } from '../../sim/commands.ts';
import { canCraft } from '../../sim/crafting.ts';
import type { Inventory, SimState } from '../../sim/state.ts';
import { css } from '../color.ts';
import { el, setText, setVisible } from '../dom.ts';
import { createSlot, itemTooltip, renderSlot, type SlotView } from './items.ts';

interface Drag {
  from: SlotRef;
  count?: number;
  ghost: HTMLDivElement;
}

/** Pure: the stack part a drag moves — right button drags half (rounded up), left the whole stack. */
export function dragCount(button: number, stackCount: number): number | undefined {
  return button === MOUSE_BUTTONS.secondary ? Math.ceil(stackCount / 2) : undefined;
}

export class InventoryScreen {
  readonly root: HTMLDivElement;
  private playerSlots: SlotView[] = [];
  private containerPanel: HTMLDivElement;
  private containerTitle: HTMLDivElement;
  private containerGrid: HTMLDivElement;
  private containerSlots: SlotView[] = [];
  private containerKey = -2;
  private recipes: { id: RecipeId; row: HTMLDivElement }[] = [];
  private drag: Drag | null = null;
  private hovered: SlotRef | null = null;
  private stateRef: SimState | null = null;
  open = false;

  private readonly send: (c: ControlMessage) => void;

  constructor(ui: HTMLElement, send: (c: ControlMessage) => void) {
    this.send = send;
    this.root = el('div', 'inventory-screen', ui);
    this.root.hidden = true;
    const left = el('div', 'inv-column', this.root);
    const invPanel = el('div', 'panel interactive', left);
    el('div', 'panel-title', invPanel).textContent = TEXT.inventory;
    const grid = el('div', 'slot-grid', invPanel);
    grid.style.gridTemplateColumns = `repeat(${HUD.inventoryColumns}, var(--slot))`;
    for (let i = 0; i < PLAYER.inventorySlots; i++) {
      const s = createSlot(grid, i < PLAYER.hotbarSlots ? 'hotbar-row' : '');
      this.wireSlot(s, { where: 'player', slot: i });
      this.playerSlots.push(s);
    }
    this.containerPanel = el('div', 'panel interactive', left);
    this.containerTitle = el('div', 'panel-title', this.containerPanel);
    this.containerGrid = el('div', 'slot-grid', this.containerPanel);
    this.containerGrid.style.gridTemplateColumns = `repeat(${HUD.inventoryColumns}, var(--slot))`;
    this.containerPanel.hidden = true;

    const craftPanel = el('div', 'panel craft-panel interactive', this.root);
    el('div', 'panel-title', craftPanel).textContent = TEXT.crafting;
    const list = el('div', 'craft-list', craftPanel);
    for (const id of RECIPE_IDS) {
      const r = RECIPES[id];
      const row = el('div', 'craft-row', list);
      const out = createSlot(row, 'small');
      renderSlot(out, r.output);
      const text = el('div', 'craft-text', row);
      el('div', 'craft-name', text).textContent = `${ITEMS[r.output.item].name}${r.output.count > 1 ? ` ×${r.output.count}` : ''}`;
      el('div', 'craft-inputs', text).textContent = r.inputs.map((i) => `${i.count}× ${ITEMS[i.item].name}`).join(', ');
      el('div', 'craft-station', text).textContent = `${TEXT.station}: ${r.station ? TILES[r.station].name : TEXT.craftAnywhere}`;
      row.title = itemTooltip(r.output.item);
      row.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        if (e.button !== MOUSE_BUTTONS.primary) return;
        this.send({ type: 'craft', recipe: id, times: e.shiftKey ? HUD.craftShiftTimes : 1 });
      });
      this.recipes.push({ id, row });
    }

    window.addEventListener('mousemove', (e) => {
      if (!this.drag) return;
      this.drag.ghost.style.left = `${e.clientX}px`;
      this.drag.ghost.style.top = `${e.clientY}px`;
    });
    window.addEventListener('mouseup', (e) => this.endDrag(e));
  }

  private wireSlot(s: SlotView, ref: SlotRef): void {
    s.root.dataset.where = ref.where;
    s.root.dataset.slot = String(ref.slot);
    s.root.addEventListener('contextmenu', (e) => e.preventDefault());
    s.root.addEventListener('mouseenter', () => (this.hovered = ref));
    s.root.addEventListener('mouseleave', () => {
      if (this.hovered === ref) this.hovered = null;
    });
    s.root.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const stack = this.stackAt(ref);
      if (!stack) return;
      if (e.shiftKey) {
        this.send({ type: 'quickMove', from: ref });
        return;
      }
      if (e.button !== MOUSE_BUTTONS.primary && e.button !== MOUSE_BUTTONS.secondary) return;
      const count = dragCount(e.button, stack.count);
      const ghost = el('div', 'drag-ghost', document.body);
      ghost.style.background = css(ITEMS[stack.item].presentation.color);
      ghost.textContent = `${ITEMS[stack.item].presentation.icon}${(count ?? stack.count) > 1 ? ` ${count ?? stack.count}` : ''}`;
      ghost.style.left = `${e.clientX}px`;
      ghost.style.top = `${e.clientY}px`;
      this.drag = { from: ref, count, ghost };
    });
  }

  private endDrag(e: MouseEvent): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    d.ghost.remove();
    const target = e.target instanceof HTMLElement ? e.target.closest<HTMLElement>('.slot[data-where]') : null;
    if (target) {
      const to: SlotRef = { where: target.dataset.where === 'container' ? 'container' : 'player', slot: Number(target.dataset.slot) };
      if (to.where !== d.from.where || to.slot !== d.from.slot) this.send({ type: 'moveStack', from: d.from, to, count: d.count });
      return;
    }
    // Released outside every panel (over the world): drop it.
    const overPanel = e.target instanceof HTMLElement && e.target.closest('.panel') !== null;
    if (!overPanel) this.send({ type: 'dropStack', from: d.from, count: d.count });
  }

  private inventoryOf(where: SlotRef['where']): Inventory | null {
    const s = this.stateRef;
    if (!s) return null;
    if (where === 'player') return s.player.inventory;
    return s.containers.get(s.player.openContainer) ?? null;
  }

  private stackAt(ref: SlotRef): Inventory['slots'][number] {
    return this.inventoryOf(ref.where)?.slots[ref.slot] ?? null;
  }

  /** Q over a hovered slot drops one item from it; returns false if nothing is hovered. */
  dropHovered(): boolean {
    if (!this.open || !this.hovered || !this.stackAt(this.hovered)) return false;
    this.send({ type: 'dropStack', from: this.hovered, count: 1 });
    return true;
  }

  setOpen(open: boolean): void {
    if (this.open === open) return;
    this.open = open;
    setVisible(this.root, open);
    if (!open) {
      this.drag?.ghost.remove();
      this.drag = null;
      this.hovered = null;
      if (this.stateRef && this.stateRef.player.openContainer >= 0) this.send({ type: 'closeContainer' });
    }
  }

  update(state: SimState): void {
    this.stateRef = state;
    if (!this.open) return;
    const p = state.player;
    this.playerSlots.forEach((s, i) => {
      renderSlot(s, p.inventory.slots[i] ?? null);
      s.root.classList.toggle('selected', i === p.hotbar);
    });
    const cont = p.openContainer >= 0 ? state.containers.get(p.openContainer) : undefined;
    setVisible(this.containerPanel, cont !== undefined);
    if (cont) {
      if (this.containerKey !== p.openContainer || this.containerSlots.length !== cont.slots.length) {
        this.containerKey = p.openContainer;
        this.containerGrid.replaceChildren();
        this.containerSlots = cont.slots.map((_, i) => {
          const s = createSlot(this.containerGrid);
          this.wireSlot(s, { where: 'container', slot: i });
          return s;
        });
        const tile = state.world.fg[p.openContainer] ?? 0;
        const def = TILE_DEFS[tile];
        setText(this.containerTitle, def?.containerSlots ? def.name : TEXT.container);
      }
      this.containerSlots.forEach((s, i) => renderSlot(s, cont.slots[i] ?? null));
    } else this.containerKey = -2;
    for (const r of this.recipes) r.row.classList.toggle('craftable', canCraft(state, r.id));
  }
}
