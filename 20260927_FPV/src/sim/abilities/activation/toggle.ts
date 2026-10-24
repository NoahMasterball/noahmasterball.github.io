import { isTimeUp } from '../../../config/sim.ts';
import { ABILITY_BUTTONS, wasPressed } from '../../command.ts';
import type { ActivationController } from '../../systems/abilities.ts';
import { applyEffects } from '../effects.ts';
import { endActivity } from '../interrupt.ts';
import { effectContext } from '../targeting.ts';
import { spendActivation } from './spend.ts';

// NEW — the `toggle` activation (ADR-0012 §1.3): a press while off spends (spendActivation) and
// switches it on; from the next tick on the effects are re-applied at the user's feet every tick
// (sustained, amounts per second) until the slot's key is pressed again ('toggledOff') or
// maxDuration runs out (if not null). Death ends it through interrupt.ts. The slot's resource holds
// while on, so the cooldown starts when it is switched off (SPEC §7, dispatcher). Toggles never
// block the weapon and another slot's press does not end them (Cairn fires while mounted).

export const TOGGLE_ACTIVATION: ActivationController<'toggle'> = {
  implemented: true,
  press(ctx, e, index, ability) {
    if (!spendActivation(ctx, e, index, ability)) return;
    // spendActivation throws for a missing slot, so the slot exists here.
    const slot = e.abilities[index];
    if (slot) slot.active = { kind: 'on', elapsed: 0 };
  },
  sustain(ctx, e, index, ability, cmd, dt) {
    const on = e.abilities[index]?.active;
    if (on?.kind !== 'on') throw new Error(`Toggle ability '${ability.id}' of character ${e.id} is active but not on`);
    const bit = ABILITY_BUTTONS[index];
    if (bit !== undefined && wasPressed(cmd.buttons, e.lastButtons, bit)) {
      endActivity(ctx, e, index, 'toggledOff');
      return;
    }
    on.elapsed += dt;
    applyEffects(effectContext(ctx, ability, e, e.pos, { kind: 'user' }, { amountScale: dt, sustained: true }));
    const { maxDuration } = ability.activation;
    if (maxDuration !== null && isTimeUp(maxDuration - on.elapsed)) endActivity(ctx, e, index, 'maxDuration');
  },
};
