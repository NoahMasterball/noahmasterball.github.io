import { ABILITY_RULES } from '../../config/sim.ts';
import type { AbilityDef, ActivationKind, EffectDef, EffectKind } from '../../data/schema.ts';
import { forwardFromAngles, normalize, rightFromYaw, type Vec3 } from '../math.ts';
import {
  AREA_DENIAL_HANDLER,
  BARRIER_HANDLER,
  DAMAGE_HANDLER,
  DISABLE_GADGETS_HANDLER,
  HEAL_HANDLER,
  REVEAL_HANDLER,
  SHIELD_HANDLER,
} from './handlers.ts';
import { addModifier, affectedCharacters, type EffectContext, type EffectHandler } from './targeting.ts';

// NEW — effect registry (SPEC §7, ADR-0012 §3). A new ability is data plus at most one new
// handler. HANDLERS is total: a new effect kind does not compile without one. The activation ×
// effect compatibility table (§3.4) lives here too; which activations run is known to the
// dispatcher (isAbilitySupported in src/sim/systems/abilities.ts).

export type { EffectContext } from './targeting.ts';

const MODIFIER_HANDLER: EffectHandler<'modifier'> = {
  implemented: true,
  apply(ctx, effect) {
    // Passives last forever, sustained applications lapse right after the last re-application,
    // everything else runs its duration.
    const remaining =
      ctx.ability.activation.kind === 'passive' ? Infinity : ctx.sustained ? ABILITY_RULES.sustainSeconds : effect.duration;
    for (const target of affectedCharacters(ctx, effect.targets, effect.radius, 'modifier')) {
      addModifier(target, { sourceId: ctx.ability.id, stats: effect.stats, remaining });
    }
  },
};

function dashDirection(ctx: EffectContext, direction: 'move' | 'look' | 'up'): Vec3 {
  const { user, command } = ctx;
  if (direction === 'up') return { x: 0, y: 1, z: 0 };
  if (direction === 'look') return forwardFromAngles(user.yaw, user.pitch);
  const fwd = forwardFromAngles(user.yaw, 0);
  const right = rightFromYaw(user.yaw);
  const moveX = command?.moveX ?? 0;
  const moveZ = command?.moveZ ?? 0;
  const wish = { x: right.x * moveX + fwd.x * moveZ, y: 0, z: right.z * moveX + fwd.z * moveZ };
  // No move input: dash where you look (horizontally).
  return Math.hypot(wish.x, wish.z) > 1e-3 ? normalize(wish) : fwd;
}

const DASH_HANDLER: EffectHandler<'dash'> = {
  implemented: true,
  apply(ctx, effect) {
    const dir = dashDirection(ctx, effect.direction);
    const speed = effect.distance / effect.duration;
    ctx.user.dash = { velocity: { x: dir.x * speed, y: dir.y * speed, z: dir.z * speed }, remaining: effect.duration };
  },
};

const HANDLERS: { readonly [K in EffectKind]: EffectHandler<K> } = {
  damage: DAMAGE_HANDLER,
  heal: HEAL_HANDLER,
  shield: SHIELD_HANDLER,
  barrier: BARRIER_HANDLER,
  modifier: MODIFIER_HANDLER,
  dash: DASH_HANDLER,
  reveal: REVEAL_HANDLER,
  areaDenial: AREA_DENIAL_HANDLER,
  disableGadgets: DISABLE_GADGETS_HANDLER,
};

/** Applies every effect of ctx.ability once, in data order. */
export function applyEffects(ctx: EffectContext): void {
  ctx.ability.effects.forEach((effect, index) => {
    // Safe widening: HANDLERS is keyed by kind, so the handler matches `effect`'s variant.
    const handler = HANDLERS[effect.kind] as EffectHandler<EffectKind>;
    handler.apply(ctx, effect as never, index);
  });
}

// ── Supported combinations (ADR-0012 §3.4) ─────────────────────────────────

/** Every effect kind (HANDLERS is total). */
const EFFECT_KINDS = Object.keys(HANDLERS) as EffectKind[];
const allExcept = (...excluded: EffectKind[]): readonly EffectKind[] => EFFECT_KINDS.filter((k) => !excluded.includes(k));

/** Activation × effect combinations with a written semantics. A new combination needs its
 *  semantics in ADR-0012 §3.4 first. */
export const SUPPORTED_EFFECTS: { readonly [K in ActivationKind]: readonly EffectKind[] } = {
  instant: allExcept('barrier'),
  passive: ['modifier'],
  // Other effects need a written channel semantics first.
  hold: ['reveal', 'modifier'],
  toggle: ['modifier'],
  // `barrier` ⇔ trigger `none` (validateContent).
  placeable: allExcept('dash'),
  thrown: allExcept('dash', 'barrier'),
};

export const isCombinationSupported = (activation: ActivationKind, effect: EffectKind): boolean =>
  SUPPORTED_EFFECTS[activation].includes(effect);

/** True if every effect of the ability is a supported combination with its activation (the
 *  §3.4 table; says nothing about whether the parts are implemented yet). */
export const isAbilityCompatible = (a: AbilityDef): boolean => a.effects.every((e) => isCombinationSupported(a.activation.kind, e.kind));

/** True if the handler of every effect kind in `effects` is implemented. */
export const areEffectsImplemented = (effects: readonly EffectDef[]): boolean => effects.every((e) => HANDLERS[e.kind].implemented);
