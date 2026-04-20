import { CONSUMABLES } from '../config/constants.js';

// Consume-Logik für Food/Drink. SSoT für Verhalten (onUse-Handler), Numbers kommen
// aus constants.js:CONSUMABLES. Andere Module (item-registry, inventory) importieren
// ausschließlich `makeConsumeUse(itemId)` und bauen sich damit ihre Handler.
//
// Der Handler:
//  - erwartet `ctx.player.stats` (wird von Inventory.useActive/tickActiveHold übergeben)
//  - addiert hunger/thirst/health-Deltas geclampt auf [0, max*]
//  - gibt `{ consumed: true }` zurück → Inventory dekrementiert den Stack.

export function makeConsumeUse(itemId) {
  const delta = CONSUMABLES[itemId];
  if (!delta) throw new Error(`Kein CONSUMABLES-Eintrag für ItemId "${itemId}"`);
  return function onUseConsumable(ctx /* , item */) {
    const stats = ctx?.player?.stats;
    if (!stats) return { consumed: false };
    stats.hunger = clampStat(stats.hunger + delta.hungerDelta, stats.maxHunger);
    stats.thirst = clampStat(stats.thirst + delta.thirstDelta, stats.maxThirst);
    stats.health = clampStat(stats.health + delta.healthDelta, stats.maxHealth);
    return { consumed: true };
  };
}

function clampStat(v, max) {
  if (v < 0) return 0;
  if (v > max) return max;
  return v;
}

export function getConsumable(itemId) {
  return CONSUMABLES[itemId] ?? null;
}

export function isConsumableId(itemId) {
  return Object.prototype.hasOwnProperty.call(CONSUMABLES, itemId);
}
