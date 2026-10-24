import { commandLook } from '../../command.ts';
import type { ActivationController } from '../../systems/abilities.ts';
import { aimOf } from '../../systems/weapons.ts';
import { spawnProjectile } from '../projectiles.ts';
import { spendActivation } from './spend.ts';

// NEW — the `thrown` activation (ADR-0012 §1.3, §5; open question 4: a press throws at once, no
// aiming phase). A press spends (spendActivation: gate, resource, `ability` event) and launches the
// projectile from the eye along the crosshair: this tick's look (commandLook) plus the recoil
// offset (aimOf with the look override — movement adopts this tick's look only after abilities).
// Never active: the projectile is a world object (projectiles.ts), not a slot activity.

export const THROWN_ACTIVATION: ActivationController<'thrown'> = {
  implemented: true,
  press(ctx, e, index, ability, cmd) {
    if (!spendActivation(ctx, e, index, ability)) return;
    spawnProjectile(ctx, e, ability, aimOf(e, commandLook(e, cmd, ctx.state.tick)));
  },
  // Never active: a thrown ability does not occupy its slot.
  sustain: () => {},
};
