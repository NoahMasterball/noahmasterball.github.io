import type { AbilityDef } from '../../../data/schema.ts';
import type { SimContext } from '../../context.ts';
import { cloneVec3 } from '../../math.ts';
import { matchAbilityAllowed } from '../../modes/index.ts';
import type { AbilityFailReason, CharacterEntity } from '../../types.ts';
import { consume } from '../resource.ts';

// NEW — the one spend path of every activation (ADR-0012 §1.3, ADR-0013 §4): instant press,
// hold/toggle start, placeable confirm and throw all call spendActivation where they spend, so
// the mode's ability gate, the resource and the `ability` event have one implementation.

/** Refuses an activation: `abilityFailed` with `reason`; nothing is spent. */
export function refuseActivation(ctx: SimContext, e: CharacterEntity, ability: AbilityDef, reason: AbilityFailReason): void {
  ctx.emit({ type: 'abilityFailed', entityId: e.id, abilityId: ability.id, reason });
}

/** The mode's ability gate for `e` now (ModeRules.abilityAllowed, e.g. Relay setup); refuses with
 *  `blocked` when closed. Passives are never gated. */
export function passesAbilityGate(ctx: SimContext, e: CharacterEntity, ability: AbilityDef): boolean {
  if (matchAbilityAllowed(ctx.state.match, e, ability)) return true;
  refuseActivation(ctx, e, ability, 'blocked');
  return false;
}

/** Spends one activation of slot `index`: the ability gate (`blocked`), then the resource
 *  (`notReady`); on success emits `ability` (pos = the user's feet) and returns true. */
export function spendActivation(ctx: SimContext, e: CharacterEntity, index: number, ability: AbilityDef): boolean {
  const slot = e.abilities[index];
  if (!slot) throw new Error(`Character ${e.id} has no ability slot ${index}`);
  if (!passesAbilityGate(ctx, e, ability)) return false;
  if (!consume(ability.resource, slot.resource)) {
    refuseActivation(ctx, e, ability, 'notReady');
    return false;
  }
  ctx.emit({ type: 'ability', entityId: e.id, abilityId: ability.id, slot: index, pos: cloneVec3(e.pos) });
  return true;
}
