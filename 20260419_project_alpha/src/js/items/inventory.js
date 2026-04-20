import { HOTBAR, ITEMS } from '../config/constants.js';
import { ItemType } from '../config/enums.js';
import { createItem } from './item.js';

// Inventory. Owner: Player (instanziiert in core/game.js und dort gehalten).
// HUD liest `slots` + `activeIndex`; nur diese Klasse darf sie schreiben.
// Stacking: gleiche ID wird zuerst in bestehende Stacks gefüllt, dann neuer Slot.
// Heavy-Regel: `occupiesHeavySlot` → maximal EIN Heavy-Item gleichzeitig.
// [Batch 4] `tickActiveHold(dt, holding, ctx)` kümmert sich um Hold-to-Consume
// für FOOD/DRINK — parallel zu pickups.tickHold.

function isConsumableType(t) {
  return t === ItemType.FOOD || t === ItemType.DRINK;
}

export class Inventory {
  constructor() {
    this.slots = new Array(HOTBAR.SLOT_COUNT).fill(null);
    this.activeIndex = 0;
    this._switchCooldown = 0;
    this._heavyWarnTimer = 0;
    this._consumeTarget = null;
    this._consumeProgress = 0;
  }

  tick(dt) {
    if (this._switchCooldown > 0) this._switchCooldown = Math.max(0, this._switchCooldown - dt);
    if (this._heavyWarnTimer > 0)  this._heavyWarnTimer  = Math.max(0, this._heavyWarnTimer  - dt);
  }

  get activeItem() { return this.slots[this.activeIndex]; }
  get heavyWarnActive() { return this._heavyWarnTimer > 0; }

  hasHeavy() {
    return this.slots.some((s) => s && s.heavy);
  }

  // Fügt `count` Einheiten eines Prototyps hinzu. Liefert true wenn alles
  // untergebracht wurde; false wenn nichts bzw. nicht komplett passte.
  // Heavy-Pickup bei belegtem Heavy-Slot → Warn-Flash + Abbruch.
  addItem(prototype, count = 1) {
    if (count <= 0) return true;

    if (prototype.heavy && this.hasHeavy()) {
      this._heavyWarnTimer = ITEMS.HEAVY_WARN_FLASH_SEC;
      return false;
    }

    let remaining = count;

    if (prototype.stackable) {
      for (const slot of this.slots) {
        if (!slot || slot.id !== prototype.id) continue;
        const space = slot.maxStack - slot.count;
        if (space <= 0) continue;
        const take = Math.min(space, remaining);
        slot.count += take;
        remaining -= take;
        if (remaining <= 0) return true;
      }
    }

    for (let i = 0; i < this.slots.length; i++) {
      if (this.slots[i]) continue;
      const take = prototype.stackable ? Math.min(prototype.maxStack, remaining) : 1;
      this.slots[i] = createItem(prototype, { count: take });
      remaining -= take;
      if (remaining <= 0) return true;
    }

    return false;
  }

  removeActive() {
    const item = this.slots[this.activeIndex];
    if (!item) return null;
    this.slots[this.activeIndex] = null;
    return item;
  }

  // Benutzt das aktive Item (Rising-Edge / Click-Pfad). Consumables werden
  // bewusst übersprungen — sie laufen in Batch 4 ausschließlich über
  // tickActiveHold (Hold-to-Consume), damit ein einzelner Klick nicht
  // sofort Essen verbraucht. Batch 5 füllt den Waffen-Pfad auf.
  useActive(ctx) {
    const item = this.slots[this.activeIndex];
    if (!item || typeof item.onUse !== 'function') return false;
    if (isConsumableType(item.type)) return false;
    this._applyOnUse(item, ctx);
    return true;
  }

  // [Batch 4] Hold-to-consume für aktive FOOD/DRINK. Pattern parallel zu
  // pickups.tickHold: pro Frame aufgerufen, füllt Progress, feuert onUse bei
  // HOTBAR.CONSUME_HOLD_SEC, bricht bei Loslassen oder Slot-Wechsel ab.
  // Gibt {target, progress01, justConsumed} zurück — HUD rendert daraus den
  // zweiten Progress-Ring.
  tickActiveHold(dt, holding, ctx) {
    const item = this.activeItem;
    const consumable = !!item && isConsumableType(item.type);

    if (!holding || !consumable) {
      this._consumeTarget = null;
      this._consumeProgress = 0;
      return { target: consumable ? item : null, progress01: 0, justConsumed: null };
    }

    if (this._consumeTarget !== item) {
      this._consumeTarget = item;
      this._consumeProgress = 0;
    }

    this._consumeProgress += dt;
    const progress01 = Math.min(1, this._consumeProgress / HOTBAR.CONSUME_HOLD_SEC);

    if (progress01 >= 1) {
      const consumedSnapshot = item;
      const consumed = this._applyOnUse(item, ctx);
      this._consumeTarget = null;
      this._consumeProgress = 0;
      return {
        target: this.activeItem && isConsumableType(this.activeItem.type) ? this.activeItem : null,
        progress01: 0,
        justConsumed: consumed ? consumedSnapshot : null,
      };
    }

    return { target: item, progress01, justConsumed: null };
  }

  // Interner onUse-Durchlauf. Dekrementiert den Stack bei {consumed: true}.
  _applyOnUse(item, ctx) {
    const result = item.onUse(ctx, item);
    const consumed = !!(result && result.consumed);
    if (consumed) {
      item.count -= 1;
      if (item.count <= 0 && this.slots[this.activeIndex] === item) {
        this.slots[this.activeIndex] = null;
      }
    }
    return consumed;
  }

  // Entfernt das aktive Item komplett und liefert es zurück — der Aufrufer
  // (PickupManager) erzeugt daraus ein World-Pickup.
  dropActive() {
    return this.removeActive();
  }

  setActive(i) {
    if (i < 0 || i >= this.slots.length) return;
    if (this._switchCooldown > 0) return;
    if (i === this.activeIndex) return;
    this.activeIndex = i;
    this._switchCooldown = HOTBAR.SWITCH_COOLDOWN_SEC;
  }

  cycle(delta) {
    if (!Number.isFinite(delta) || delta === 0) return;
    const n = this.slots.length;
    const step = delta > 0 ? 1 : -1;
    const next = ((this.activeIndex + step) % n + n) % n;
    this.setActive(next);
  }
}
