import { cloneVec3 } from '../math.ts';
import { isRevealedTo, operatorOf } from '../stats.ts';
import { applyAbilityDamage, spawnArea } from './areas.ts';
import { damageGadget } from './gadgets.ts';
import { affectedCharacters, affectedGadgets, type EffectHandler } from './targeting.ts';

// NEW — the effect handlers beyond modifier and dash (ADR-0012 §3.3), registered in HANDLERS
// (effects.ts). Targets come only from affectedCharacters / affectedGadgets (targeting.ts: radius
// via bodyDistance, the line-of-sight table, friendly fire via canHarm). Amounts of damage and
// heal scale with ctx.amountScale; radii with ctx.radiusScale (in targeting).

/** Hostile characters: mitigatedDamage(amount × amountScale) via applyDamage (cause ability);
 *  hostile gadgets in radius: damageGadget. No line of sight. */
export const DAMAGE_HANDLER: EffectHandler<'damage'> = {
  implemented: true,
  apply(ctx, effect) {
    const amount = effect.amount * ctx.amountScale;
    const abilityId = ctx.ability.id;
    for (const target of affectedCharacters(ctx, 'hostile', effect.radius, 'damage')) {
      applyAbilityDamage(ctx.sim, ctx.user, target, amount, abilityId, ctx.origin);
    }
    for (const g of affectedGadgets(ctx, effect.radius)) {
      damageGadget(ctx.sim, g, amount, ctx.user.id, { kind: 'ability', abilityId }, g.pos);
    }
  },
};

/** health = min(maxHealth, health + amount × amountScale); `healed` when > 0; never revives. */
export const HEAL_HANDLER: EffectHandler<'heal'> = {
  implemented: true,
  apply(ctx, effect) {
    const amount = effect.amount * ctx.amountScale;
    // affectedCharacters returns the living only: a heal never revives.
    for (const target of affectedCharacters(ctx, effect.targets, effect.radius, 'heal')) {
      const health = Math.min(operatorOf(target).maxHealth, target.health + amount);
      const healed = health - target.health;
      if (healed <= 0) continue;
      target.health = health;
      ctx.sim.emit({ type: 'healed', entityId: target.id, abilityId: ctx.ability.id, amount: healed, sourcePos: cloneVec3(ctx.origin) });
    }
  },
};

/** Per target and source: amount = max(old, amount), remaining = max(old, duration);
 *  `shieldGained` with the amount gained, when > 0 (a refresh that only extends the time is
 *  silent, like a heal at full health). */
export const SHIELD_HANDLER: EffectHandler<'shield'> = {
  implemented: true,
  apply(ctx, effect) {
    const sourceId = ctx.ability.id;
    for (const target of affectedCharacters(ctx, effect.targets, effect.radius, 'shield')) {
      const existing = target.shields.find((s) => s.sourceId === sourceId);
      const before = existing?.amount ?? 0;
      if (existing) {
        existing.amount = Math.max(existing.amount, effect.amount);
        existing.remaining = Math.max(existing.remaining, effect.duration);
      } else {
        target.shields.push({ sourceId, amount: effect.amount, remaining: effect.duration });
      }
      const gained = Math.max(before, effect.amount) - before;
      if (gained > 0) ctx.sim.emit({ type: 'shieldGained', entityId: target.id, abilityId: sourceId, amount: gained });
    }
  },
};

/** Nothing at apply time: the barrier is its gadget's collider (gadgetShape). Final as is. */
export const BARRIER_HANDLER: EffectHandler<'barrier'> = { implemented: true, apply: () => {} };

/** Enemies in radius: an ActiveReveal (team = user.team) refreshed to max(old, duration);
 *  `revealed` when the target was not yet revealed to that team. */
export const REVEAL_HANDLER: EffectHandler<'reveal'> = {
  implemented: true,
  apply(ctx, effect) {
    const team = ctx.user.team;
    const sourceId = ctx.ability.id;
    for (const target of affectedCharacters(ctx, 'enemies', effect.radius, 'reveal')) {
      const wasRevealed = isRevealedTo(target, team);
      const existing = target.reveals.find((r) => r.team === team && r.sourceId === sourceId);
      if (existing) existing.remaining = Math.max(existing.remaining, effect.duration);
      else target.reveals.push({ team, sourceId, remaining: effect.duration });
      if (!wasRevealed) ctx.sim.emit({ type: 'revealed', entityId: target.id, team, abilityId: sourceId });
    }
  },
};

/** spawnArea(ctx, index) on the ground below the origin (areas.ts). */
export const AREA_DENIAL_HANDLER: EffectHandler<'areaDenial'> = {
  implemented: true,
  apply: (ctx, _effect, index) => spawnArea(ctx, index),
};

/** Hostile gadgets in radius: disabled = max(disabled, duration). */
export const DISABLE_GADGETS_HANDLER: EffectHandler<'disableGadgets'> = {
  implemented: true,
  apply(ctx, effect) {
    for (const g of affectedGadgets(ctx, effect.radius)) g.disabled = Math.max(g.disabled, effect.duration);
  },
};
