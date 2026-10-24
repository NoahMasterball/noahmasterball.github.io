import type { SimContext } from '../context.ts';
import type { AbilityEndReason, CharacterEntity } from '../types.ts';

// NEW — ending a running activation (ADR-0012 §1.3). A leaf module (types only), so the damage
// path (systems/health.ts) can end activities on death without a module cycle through the
// activation controllers. Sustained modifiers lapse on their own (ABILITY_RULES.sustainSeconds),
// so ending needs nothing beyond `active = null`; the resource already ran while idle.

/** Ends slot `index`'s activity. A channel or toggle emits `abilityEnd`; a placement ends
 *  silently (its start and cancel are state, not events). No-op for an idle slot. */
export function endActivity(ctx: SimContext, e: CharacterEntity, index: number, reason: AbilityEndReason): void {
  const slot = e.abilities[index];
  const active = slot?.active;
  if (!slot || !active) return;
  slot.active = null;
  if (active.kind !== 'placing') {
    ctx.emit({ type: 'abilityEnd', entityId: e.id, abilityId: slot.abilityId, slot: index, reason });
  }
}

/** Ends every running activity of `e` (death, in slot order). */
export function endAllActivities(ctx: SimContext, e: CharacterEntity, reason: AbilityEndReason): void {
  e.abilities.forEach((_slot, index) => endActivity(ctx, e, index, reason));
}
