import { ABILITY_BUTTONS, BUTTON, commandLook, wasPressed } from '../../command.ts';
import { WEAPON_SLOTS } from '../../entities.ts';
import { gadgetCount } from '../../stats.ts';
import type { ActivationController } from '../../systems/abilities.ts';
import { spawnGadget } from '../gadgets.ts';
import { endActivity } from '../interrupt.ts';
import { placementPose } from '../placement.ts';
import { canActivate } from '../resource.ts';
import { passesAbilityGate, refuseActivation, spendActivation } from './spend.ts';

// NEW — the `placeable` activation (ADR-0012 §1.3, §4.6). A press opens the placement (the ghost;
// nothing spent), a fire press confirms it at placementPose — the one placement rule the client
// ghost and bots use too — and spends; ADS, the slot's own key or a weapon select/swap press
// cancel it. Placements start and end silently: the slot's `active` is the state.

export const PLACEABLE_ACTIVATION: ActivationController<'placeable'> = {
  implemented: true,
  /** Opens the placement if an activation could be spent now and fewer than maxActive of the
   *  user's gadgets of this ability are in the world. */
  press(ctx, e, index, ability) {
    const slot = e.abilities[index];
    if (!slot) throw new Error(`Character ${e.id} has no ability slot ${index}`);
    if (!passesAbilityGate(ctx, e, ability)) return;
    if (!canActivate(ability.resource, slot.resource)) {
      refuseActivation(ctx, e, ability, 'notReady');
      return;
    }
    if (gadgetCount(ctx.state, e.id, ability.id) >= ability.activation.maxActive) {
      refuseActivation(ctx, e, ability, 'maxActive');
      return;
    }
    slot.active = { kind: 'placing' };
  },
  sustain(ctx, e, index, ability, cmd) {
    const pressed = (bit: number): boolean => wasPressed(cmd.buttons, e.lastButtons, bit);
    const fire = pressed(BUTTON.fire);
    // Every fire press while placing belongs to the placement (a confirm or a failed try): masked
    // from the weapon until released, so it never shoots — not as a held auto trigger, and not
    // from the trigger buffer after a cancel.
    if (fire) e.suppressedButtons |= BUTTON.fire;
    if (pressed(BUTTON.ads)) {
      e.suppressedButtons |= BUTTON.ads; // ADS does not come up while the cancelling press is held
      endActivity(ctx, e, index, 'interrupted');
      return;
    }
    const ownKey = ABILITY_BUTTONS[index];
    const weaponSelect = pressed(BUTTON.swapWeapon) || WEAPON_SLOTS.some((s) => pressed(BUTTON[s.button]));
    if ((ownKey !== undefined && pressed(ownKey)) || weaponSelect) {
      // A weapon select/swap press is not consumed: the swap then happens (weapon step).
      endActivity(ctx, e, index, 'interrupted');
      return;
    }
    if (!fire) return;
    const pose = placementPose(ctx.query, e, ability, commandLook(e, cmd, ctx.state.tick));
    if (!pose.valid) {
      refuseActivation(ctx, e, ability, 'invalidPlacement');
      return;
    }
    // Placed or refused by the spend (the mode's gate may have closed since the press): either
    // way the placement is over.
    endActivity(ctx, e, index, 'interrupted');
    if (spendActivation(ctx, e, index, ability)) spawnGadget(ctx, e, ability, pose);
  },
};
