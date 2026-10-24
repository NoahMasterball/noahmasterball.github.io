import { ABILITY_RULES, isTimeUp, secondsToTicks } from '../../config/sim.ts';
import { getAbility } from '../../data/content.ts';
import type { GadgetTriggerDef } from '../../data/schema.ts';
import { ownerOf, type SimContext } from '../context.ts';
import { bodyDistance } from '../hitbox.ts';
import { cloneVec3 } from '../math.ts';
import type { GadgetEntity } from '../types.ts';
import { applyEffects } from './effects.ts';
import { removeGadget } from './gadgets.ts';
import { effectContext, type EffectScaling } from './targeting.ts';

// NEW — when placed gadgets act (ADR-0012 §4.4, GadgetTriggerDef). Every trigger applies its
// ability's effects through the registry (applyEffects) from the gadget's pos, credited to its
// owner (also after the owner's death).

/** Ticks after placement before proximity and aura triggers act. */
const ARM_TICKS = secondsToTicks(ABILITY_RULES.gadget.armSeconds);

function triggerOf(g: GadgetEntity): GadgetTriggerDef {
  const activation = getAbility(g.abilityId).activation;
  if (activation.kind !== 'placeable') throw new Error(`Gadget ${g.id}: ability '${g.abilityId}' is not placeable`);
  return activation.trigger;
}

const armed = (ctx: SimContext, g: GadgetEntity): boolean => ctx.state.tick - g.placedTick >= ARM_TICKS;

/** Applies the gadget's ability effects once from its pos (via the gadget). */
function applyFrom(ctx: SimContext, g: GadgetEntity, scaling: EffectScaling = {}): void {
  applyEffects(effectContext(ctx, getAbility(g.abilityId), ownerOf(ctx.state, g), g.pos, { kind: 'gadget', id: g.id }, scaling));
}

/** A consumed trigger: the gadget leaves the world, `burst` at its pos, its effects apply once. */
function burst(ctx: SimContext, g: GadgetEntity): void {
  removeGadget(ctx, g);
  ctx.emit({ type: 'burst', source: 'gadget', sourceId: g.id, abilityId: g.abilityId, ownerId: g.ownerId, pos: cloneVec3(g.pos) });
  applyFrom(ctx, g);
}

/** A living enemy of the gadget's team with its body within `radius` of the gadget (teammates
 *  never trigger, friendly fire or not). */
const enemyWithin = (ctx: SimContext, g: GadgetEntity, radius: number): boolean =>
  ctx.state.entities.some((e) => e.alive && e.team !== g.team && bodyDistance(e, g.pos) <= radius);

/** Step 5 of Sim.step, per gadget in placement order: disabled > 0 → count down (to 0 once its
 *  time is up, isTimeUp), nothing else (a timer pauses; a barrier keeps blocking — it is its
 *  collider) · armed once
 *  ABILITY_RULES.gadget.armSeconds have passed since placedTick (proximity, aura; a timer runs from
 *  placement) · `none`: nothing · `aura`: applyEffects (origin gadget.pos, via gadget, amountScale
 *  dt, sustained) · `proximity`: a living enemy with bodyDistance ≤ radius → `burst`,
 *  applyEffects once, removeGadget · `timer`: timer -= dt, time up (isTimeUp) → `burst`,
 *  applyEffects, removeGadget. Teammates never trigger. */
export function gadgetSystem(ctx: SimContext, dt: number): void {
  // A copy: bursts remove gadgets, and a burst may destroy another gadget (damage effects).
  for (const g of [...ctx.state.gadgets]) {
    if (!ctx.state.gadgets.includes(g)) continue;
    if (g.disabled > 0) {
      g.disabled = isTimeUp(g.disabled - dt) ? 0 : g.disabled - dt;
      continue;
    }
    const trigger = triggerOf(g);
    switch (trigger.kind) {
      case 'none':
        break;
      case 'aura':
        if (armed(ctx, g)) applyFrom(ctx, g, { amountScale: dt, sustained: true });
        break;
      case 'proximity':
        if (armed(ctx, g) && enemyWithin(ctx, g, trigger.radius)) burst(ctx, g);
        break;
      case 'timer':
        // Runs from the tick after the placing one, so it bursts `delay` s after placement, on
        // the tick isTimeUp picks.
        if (ctx.state.tick > g.placedTick) g.timer -= dt;
        if (isTimeUp(g.timer)) burst(ctx, g);
        break;
    }
  }
}
