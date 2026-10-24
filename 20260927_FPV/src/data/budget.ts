// NEW — power-budget model parameters (SPEC §9). The formulas live in src/balance/budget.ts;
// every number that shapes the result lives here. A category score of 0 = the reference.

export const BUDGET = {
  /** The "exactly average" operator + weapon that every category is measured against. */
  reference: {
    maxHealth: 100,
    armour: 0,
    hitboxProfile: 'standard',
    moveSpeed: 4.6,
    sprintMultiplier: 1.45,
    acceleration: 40,
    jumpHeight: 1.1,
    adsMovePenalty: 0.65,
    weaponId: 'vesper_ar',
  },
  /** Budget points per +100 % relative change of each measure. */
  weights: {
    survivability: 10,
    moveSpeed: 12,
    sprintMultiplier: 4,
    acceleration: 1.5,
    jumpHeight: 1,
    adsMovePenalty: 2,
    firepower: 5,
  },
  /** Ranges (m) at which firepower is averaged. */
  firepowerRanges: [5, 15, 30],
  /** Seconds added to every TTK before comparing (target acquisition), so one-shot kills
   *  (TTK 0) get a large but finite firepower value. */
  acquisitionTime: 0.25,
  /** Radius (m) of the reference target disc used for the spread hit-probability heuristic. */
  hitProbabilityTargetRadius: 0.25,
  /** Every operator's total must land in target ± tolerance (tests/unit/content.test.ts). */
  target: 4,
  tolerance: 1.5,
} as const;

/** Parameters of the printed/generated time-to-kill matrix. */
export const BALANCE_REPORT = {
  ttkRanges: [5, 15, 30, 50],
} as const;
