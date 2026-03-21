/**
 * AnimationConstants — SSOT fuer alle Animations-Geschwindigkeiten und -Faktoren.
 *
 * Wird von Game.js, AISystem.js und PoliceSystem.js importiert.
 */

/** Animations-Geschwindigkeitsfaktor beim normalen Gehen (Spieler + Polizei) */
export const WALK_ANIM_SPEED = 0.1;

/** Animations-Geschwindigkeitsfaktor beim Sprinten (nur Spieler) */
export const SPRINT_ANIM_SPEED = 0.14;

/** Animations-Geschwindigkeitsfaktor beim normalen NPC-Gehen */
export const NPC_WALK_ANIM_SPEED = 0.08;

/** Animations-Geschwindigkeitsfaktor bei NPC-Panik */
export const PANIC_ANIM_SPEED = 0.07;

/** Abkling-Faktor fuer die Animation im Stehen */
export const ANIM_DECAY = 0.85;
