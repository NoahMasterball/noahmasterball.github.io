import { describe, expect, it } from 'vitest';
import { budgetStatus, exposure, operatorBudget } from '../../src/balance/budget.ts';
import { ABILITY_RULES, MATCH, operatorPickLimit, PLAYABLE_OPERATORS } from '../../src/config/sim.ts';
import { BUDGET } from '../../src/data/budget.ts';
import { ABILITIES, OPERATORS, abilityProblems, getAbility, levelProblems, validateContent } from '../../src/data/content.ts';
import { SALTWORKS_LEVEL } from '../../src/data/levels/saltworks.ts';
import { ARCHETYPES, type AbilityDef, type ActivationDef, type BotAbilityHint, type EffectDef } from '../../src/data/schema.ts';
import { isAbilityCompatible } from '../../src/sim/abilities/effects.ts';
import { isAbilitySupported } from '../../src/sim/systems/abilities.ts';

describe('content validation', () => {
  it('finds no problems in src/data', () => {
    expect(validateContent()).toEqual([]);
  });

  it('covers every archetype with at least two operators (SPEC §10)', () => {
    for (const archetype of ARCHETYPES) {
      expect(OPERATORS.filter((o) => o.archetype === archetype).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('gives every ability of the roster a supported activation × effect combination (ADR-0012 §3.4)', () => {
    for (const a of ABILITIES) expect(isAbilityCompatible(a), a.id).toBe(true);
  });

  it('supports every ability in the roster end to end, not only the playable operators’ (M2 DoD, ADR-0012 §3.4)', () => {
    // Every combination is compatible and every activation controller and effect handler is
    // implemented; tests/unit/roster.test.ts runs each ability through commands.
    for (const a of ABILITIES) expect(isAbilitySupported(a), a.id).toBe(true);
  });

  it('lets every team be filled with the playable operators within the Relay pick limit (ADR-0013 §3)', () => {
    for (const id of PLAYABLE_OPERATORS) expect(OPERATORS.map((o) => o.id)).toContain(id);
    expect(operatorPickLimit() * PLAYABLE_OPERATORS.length).toBeGreaterThanOrEqual(MATCH.teamSize);
  });

  it('reports setup walls outside the level or without volume (ADR-0013 §4)', () => {
    const problems = levelProblems({
      ...SALTWORKS_LEVEL,
      setupWalls: [
        { center: [0, 1, 500], size: [1, 1, 1] },
        { center: [0, 1, 0], size: [0, 1, 1] },
      ],
    }).join('\n');
    expect(problems).toMatch(/setup wall 0 lies outside the level geometry/);
    expect(problems).toMatch(/setup wall 1 size must be > 0/);
  });

  it('uses every activation type and resource model somewhere in the roster', () => {
    const activations = new Set(ABILITIES.map((a) => a.activation.kind));
    expect([...activations].sort()).toEqual(['hold', 'instant', 'passive', 'placeable', 'thrown', 'toggle']);
    const resources = new Set(ABILITIES.map((a) => a.resource.kind));
    expect([...resources].sort()).toEqual(['charges', 'cooldown', 'none', 'uses']);
  });
});

describe('ability validation (ADR-0012 §3.5, §10)', () => {
  /** A copy of a registered ability with some fields replaced. */
  const variant = (id: string, patch: Partial<AbilityDef>): AbilityDef => ({ ...getAbility(id), ...patch });
  const problemsOf = (a: AbilityDef): string => abilityProblems(a).join('\n');
  const placeable = (patch: Partial<Extract<ActivationDef, { kind: 'placeable' }>>): ActivationDef => {
    const base = getAbility('keel_breakwater').activation;
    if (base.kind !== 'placeable') throw new Error('Breakwater must be placeable');
    return { ...base, ...patch };
  };

  it('finds no problems in the roster', () => {
    for (const a of ABILITIES) expect(abilityProblems(a), a.id).toEqual([]);
  });

  it('needs a barrier on a floor placeable without a trigger, and no trigger only for a barrier', () => {
    expect(problemsOf(variant('keel_breakwater', { activation: placeable({ surface: 'wall' }) }))).toMatch(/a barrier needs a placeable/);
    expect(problemsOf(variant('keel_breakwater', { activation: placeable({ trigger: { kind: 'aura' } }) }))).toMatch(/a barrier needs/);
    expect(problemsOf(variant('keel_breakwater', { activation: { kind: 'instant' }, bot: { use: 'never' } }))).toMatch(/a barrier needs/);
    const sensor = variant('lattice_nodes', { activation: placeable({ trigger: { kind: 'none' } }) });
    expect(problemsOf(sensor)).toMatch(/trigger 'none' only with a barrier/);
  });

  it('checks activation, trigger and effect ranges', () => {
    const cases: [Partial<AbilityDef>, RegExp][] = [
      [{ activation: placeable({ maxActive: 1.5 }) }, /maxActive an integer ≥ 1/],
      [{ activation: placeable({ placeRange: 0 }) }, /placeRange and gadgetHealth > 0/],
      [{ activation: placeable({ trigger: { kind: 'proximity', radius: 0 } }) }, /proximity trigger radius > 0/],
      [{ activation: placeable({ trigger: { kind: 'timer', delay: -1 } }) }, /timer trigger delay > 0/],
      [{ activation: { kind: 'hold', maxDuration: 0 } }, /hold maxDuration > 0/],
      [{ activation: { kind: 'toggle', maxDuration: 0 } }, /toggle maxDuration null or > 0/],
      [{ activation: { kind: 'thrown', speed: 0, gravityScale: -1, fuse: 0 } }, /speed > 0, gravityScale ≥ 0[\s\S]*fuse null or > 0/],
      [
        { activation: { kind: 'thrown', speed: 20, gravityScale: 1, fuse: ABILITY_RULES.thrown.maxFlightSeconds } },
        /fuse < ABILITY_RULES\.thrown\.maxFlightSeconds/,
      ],
    ];
    for (const [patch, message] of cases) expect(problemsOf(variant('keel_breakwater', patch))).toMatch(message);
    const effects: [EffectDef, RegExp][] = [
      [{ kind: 'reveal', radius: 0, duration: 3 }, /reveal radius and duration > 0/],
      [{ kind: 'heal', amount: 0, radius: 1, targets: 'allies' }, /heal amount and radius > 0/],
      [{ kind: 'areaDenial', radius: 2, duration: 4, damagePerSecond: -1, stats: {} }, /damagePerSecond ≥ 0/],
      [{ kind: 'modifier', stats: {}, duration: 1, radius: -1, targets: 'self' }, /modifier radius ≥ 0/],
    ];
    for (const [effect, message] of effects) expect(problemsOf(variant('basalt_brace', { effects: [effect] }))).toMatch(message);
  });

  it('checks that bot hints fit their ability', () => {
    const hinted = (id: string, bot: BotAbilityHint): string => problemsOf(variant(id, { bot }));
    expect(hinted('kestrel_lightfoot', { use: 'engage' })).toMatch(/passive ability's bot hint must be 'never'/);
    expect(hinted('basalt_brace', { use: 'hold' })).toMatch(/'hold' needs a placeable or toggle/);
    expect(hinted('basalt_brace', { use: 'support', healthBelow: 0.5 })).toMatch(/'support' needs a heal or shield/);
    expect(hinted('basalt_brace', { use: 'scout' })).toMatch(/'scout' needs a reveal/);
    expect(hinted('wisp_slipstream', { use: 'escape', healthBelow: 0 })).toMatch(/healthBelow in \(0, 1\]/);
    expect(hinted('wisp_slipstream', { use: 'escape', healthBelow: 1.2 })).toMatch(/healthBelow in \(0, 1\]/);
    expect(hinted('basalt_brace', { use: 'engage', maxRangeM: 0 })).toMatch(/maxRangeM > 0/);
    expect(hinted('salve_mend', { use: 'support', healthBelow: 1 })).toBe('');
  });
});

describe('power budget (pillar 1: every strength costs something)', () => {
  it('keeps every operator inside the target band', () => {
    for (const op of OPERATORS) {
      const b = operatorBudget(op);
      expect(budgetStatus(b.total), `${op.id}: ${b.total.toFixed(2)} vs ${BUDGET.target} ± ${BUDGET.tolerance}`).toBe('ok');
    }
  });

  it('computes hitbox exposure from geometry', () => {
    expect(exposure('standard')).toBeCloseTo(1);
    expect(exposure('heavy')).toBeGreaterThan(1);
    expect(exposure('slim')).toBeLessThan(1);
  });

  it('makes anchors pay with mobility and speedsters pay with survivability and firepower', () => {
    for (const op of OPERATORS) {
      const b = operatorBudget(op);
      if (op.archetype === 'anchor') {
        expect(b.mobility, op.id).toBeLessThan(0);
        expect(b.survivability, op.id).toBeGreaterThan(0);
      }
      if (op.archetype === 'speedster') {
        expect(b.mobility, op.id).toBeGreaterThan(0);
        expect(b.survivability, op.id).toBeLessThan(0);
        expect(b.firepower, op.id).toBeLessThan(0);
      }
    }
  });
});
