import type { ActivationController } from '../../systems/abilities.ts';
import { applyEffects } from '../effects.ts';
import { effectContext } from '../targeting.ts';
import { spendActivation } from './spend.ts';

// NEW — the `instant` and `passive` activations (ADR-0012 §1.3), moved out of the dispatcher.
// Instant: a press spends and applies every effect once at the user. Passive: nothing on press;
// loadOperator applies passives when the kit is (re)loaded.

export const INSTANT_ACTIVATION: ActivationController<'instant'> = {
  implemented: true,
  press(ctx, e, index, ability, cmd) {
    if (!spendActivation(ctx, e, index, ability)) return;
    applyEffects(effectContext(ctx, ability, e, e.pos, { kind: 'user' }, { command: cmd }));
  },
  // Never active: an instant ability does not occupy its slot.
  sustain: () => {},
};

export const PASSIVE_ACTIVATION: ActivationController<'passive'> = {
  implemented: true,
  press: () => {},
  sustain: () => {},
};
