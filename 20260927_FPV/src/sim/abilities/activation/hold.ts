import { isTimeUp } from '../../../config/sim.ts';
import { ABILITY_BUTTONS, isHeld } from '../../command.ts';
import { channelProgress } from '../../stats.ts';
import type { ActivationController } from '../../systems/abilities.ts';
import { applyEffects } from '../effects.ts';
import { endActivity } from '../interrupt.ts';
import { effectContext } from '../targeting.ts';
import { spendActivation } from './spend.ts';

// NEW — the `hold` activation (ADR-0012 §1.3): a channel that runs while the slot's key is held.
// The press spends (spendActivation) and starts the channel; from the next tick on, while the key
// stays down, the effects are re-applied at the user's feet every tick (sustained) with the radius
// growing linearly to full at maxDuration (channelProgress) and amounts spread over maxDuration.
// Release or maxDuration end it here; another slot's press (dispatcher) and death (health.ts) end it
// through interrupt.ts. While it runs the weapon is blocked (weaponBlockedBy) and the slot's
// resource holds, so the cooldown counts from the end (dispatcher).

export const HOLD_ACTIVATION: ActivationController<'hold'> = {
  implemented: true,
  press(ctx, e, index, ability) {
    if (!spendActivation(ctx, e, index, ability)) return;
    // spendActivation throws for a missing slot, so the slot exists here.
    const slot = e.abilities[index];
    if (slot) slot.active = { kind: 'channel', elapsed: 0 };
  },
  sustain(ctx, e, index, ability, cmd, dt) {
    const slot = e.abilities[index];
    const channel = slot?.active;
    if (!slot || channel?.kind !== 'channel') {
      throw new Error(`Hold ability '${ability.id}' of character ${e.id} is active but not channelling`);
    }
    const bit = ABILITY_BUTTONS[index];
    if (bit === undefined || !isHeld(cmd.buttons, bit)) {
      endActivity(ctx, e, index, 'released');
      return;
    }
    channel.elapsed += dt;
    const { maxDuration } = ability.activation;
    applyEffects(
      effectContext(ctx, ability, e, e.pos, { kind: 'user' }, {
        // Never null here (the slot channels); channelProgress is the one progress rule (HUD, ring).
        radiusScale: channelProgress(slot) ?? 1,
        amountScale: dt / maxDuration,
        sustained: true,
      }),
    );
    if (isTimeUp(maxDuration - channel.elapsed)) endActivity(ctx, e, index, 'maxDuration');
  },
};
