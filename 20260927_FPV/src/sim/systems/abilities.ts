import { isTimeUp } from '../../config/sim.ts';
import { getAbility } from '../../data/content.ts';
import type { AbilityDef, ActivationDef, ActivationKind } from '../../data/schema.ts';
import { HOLD_ACTIVATION } from '../abilities/activation/hold.ts';
import { INSTANT_ACTIVATION, PASSIVE_ACTIVATION } from '../abilities/activation/instant.ts';
import { PLACEABLE_ACTIVATION } from '../abilities/activation/placeable.ts';
import { THROWN_ACTIVATION } from '../abilities/activation/thrown.ts';
import { TOGGLE_ACTIVATION } from '../abilities/activation/toggle.ts';
import { areEffectsImplemented, isAbilityCompatible } from '../abilities/effects.ts';
import { endActivity } from '../abilities/interrupt.ts';
import { tick as tickResource } from '../abilities/resource.ts';
import { ABILITY_BUTTONS, wasPressed, type Command } from '../command.ts';
import type { SimContext } from '../context.ts';
import type { CharacterEntity } from '../types.ts';

// NEW — ability dispatcher (ADR-0012 §1.4), step 4 of Sim.step: expiry of timed ability state,
// resources, and one activation controller per kind. Returns the command later systems see.

/** An ability whose activation is of kind K. */
export type AbilityOf<K extends ActivationKind> = AbilityDef & { activation: Extract<ActivationDef, { kind: K }> };

/** Narrows an ability to AbilityOf<K> (placement ghost, bots, tests). */
export const hasActivation = <K extends ActivationKind>(a: AbilityDef, kind: K): a is AbilityOf<K> => a.activation.kind === kind;

/** One state machine per activation kind (src/sim/abilities/activation/). `press` runs when the
 *  slot's key is pressed while it is idle, `sustain` every tick while it is active (its own key
 *  presses and releases included). */
export interface ActivationController<K extends ActivationKind> {
  /** False while the kind is only a stub (it refuses with 'unsupported'); isAbilitySupported
   *  reports it. */
  readonly implemented: boolean;
  press(ctx: SimContext, e: CharacterEntity, index: number, ability: AbilityOf<K>, cmd: Command): void;
  sustain(ctx: SimContext, e: CharacterEntity, index: number, ability: AbilityOf<K>, cmd: Command, dt: number): void;
}

const ACTIVATIONS: { readonly [K in ActivationKind]: ActivationController<K> } = {
  instant: INSTANT_ACTIVATION,
  hold: HOLD_ACTIVATION,
  toggle: TOGGLE_ACTIVATION,
  placeable: PLACEABLE_ACTIVATION,
  thrown: THROWN_ACTIVATION,
  passive: PASSIVE_ACTIVATION,
};

// Safe widening: ACTIVATIONS is keyed by kind, so the controller matches the ability's activation.
const controllerOf = (ability: AbilityDef): ActivationController<ActivationKind> =>
  ACTIVATIONS[ability.activation.kind] as ActivationController<ActivationKind>;

/** True if the simulation runs this ability end to end now: its activation × effect combination
 *  is supported (ADR-0012 §3.4) and its activation controller and every effect handler are
 *  implemented (the HUD shows "M2" otherwise). */
export const isAbilitySupported = (a: AbilityDef): boolean =>
  isAbilityCompatible(a) && controllerOf(a).implemented && areEffectsImplemented(a.effects);

/** Counts timed entries down and drops those whose time is up (isTimeUp). */
function expire<T extends { remaining: number }>(entries: T[], dt: number): T[] {
  for (const entry of entries) entry.remaining -= dt;
  return entries.filter((entry) => !isTimeUp(entry.remaining));
}

/** Step 4 of Sim.step, first part, for every living character before any activation: counts its
 *  modifiers, shields and reveals down and drops those whose time is up. Run for everyone first,
 *  an effect an activation applies in this tick is never counted down in it, so it acts on exactly
 *  secondsToTicks(duration) ticks whatever the entity ids of its user and target. */
export function expireEffects(e: CharacterEntity, dt: number): void {
  e.modifiers = expire(e.modifiers, dt);
  e.shields = expire(e.shields, dt);
  e.reveals = expire(e.reveals, dt);
}

/** A channel or a placement: what another slot's press interrupts. */
const interruptible = (e: CharacterEntity, index: number): boolean => {
  const kind = e.abilities[index]?.active?.kind;
  return kind === 'channel' || kind === 'placing';
};

/** Runs `e`'s abilities for one tick (living characters, in entity-id order, after every
 *  character's expireEffects): release of suppressed buttons → resources of idle and placing
 *  slots → per slot in index order: active ? sustain : pressed (not a passive) ? (end any other
 *  channel or placement 'interrupted', then press). Returns `cmd` without the buttons abilities consumed
 *  (CharacterEntity.suppressedButtons); lastButtons keeps the raw buttons. */
export function abilitySystem(ctx: SimContext, e: CharacterEntity, cmd: Command, dt: number): Command {
  e.suppressedButtons &= cmd.buttons;

  // A channel or a switched-on toggle holds its resource: a cooldown or recharge runs from the end.
  for (const slot of e.abilities) {
    if (slot.active?.kind === 'channel' || slot.active?.kind === 'on') continue;
    tickResource(getAbility(slot.abilityId).resource, slot.resource, dt);
  }

  e.abilities.forEach((slot, index) => {
    const ability = getAbility(slot.abilityId);
    const controller = controllerOf(ability);
    if (slot.active) {
      controller.sustain(ctx, e, index, ability, cmd, dt);
      return;
    }
    const bit = ABILITY_BUTTONS[index];
    // A passive's key does nothing (loadOperator applies passives), not even interrupt.
    if (bit === undefined || ability.activation.kind === 'passive' || !wasPressed(cmd.buttons, e.lastButtons, bit)) return;
    e.abilities.forEach((_other, j) => {
      if (j !== index && interruptible(e, j)) endActivity(ctx, e, j, 'interrupted');
    });
    controller.press(ctx, e, index, ability, cmd);
  });

  return { ...cmd, buttons: cmd.buttons & ~e.suppressedButtons };
}
