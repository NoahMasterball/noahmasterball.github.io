import { describe, expect, it } from 'vitest';
import { createBotController, stepMatch } from '../../src/ai/controller.ts';
import type { BotSlot } from '../../src/ai/types.ts';
import { AI_TIERS, PLAYABLE_OPERATORS, RANGE_MODE, secondsToTicks, type AiTier } from '../../src/config/sim.ts';
import { RANGE_LEVEL } from '../../src/data/levels/range.ts';
import { DEG2RAD, fromTuple, rightFromYaw, vec3 } from '../../src/sim/math.ts';
import { Sim } from '../../src/sim/sim.ts';
import type { EntityId } from '../../src/sim/types.ts';

// Combat bots and range dummies driven by the bot controller (ADR-0011 §3/§4) through the real
// Sim on the test range's open floor (no nav graph: combat bots hold where they stand, aim,
// strafe and fire): deterministic duels, the tier ordering in bot-vs-bot duels and against a
// standing target at short, mid and long range, and the range dummies. Saltworks behaviour
// (navigation, sides, full matches) is in match.test.ts.

const NORTH = 0; // yaw looking down −Z
const SOUTH = Math.PI;
/** Duel distances (m): short, mid, long. */
const RANGES = { short: 10, mid: 20, long: 35 } as const;
/** The standing target: the toughest playable operator (the longest time to kill). */
const TARGET_OPERATOR = 'basalt';
/** A duel or a target that lasts longer than this counts as undecided. */
const FIGHT_SECONDS = 40;
/** Seeded fights per operator (the playable operators, mirror match-ups) per pair and range. */
const DUELS_PER_OPERATOR = 6;
const TARGETS_PER_OPERATOR = 4;
/** Tier ordering margins: the better tier wins at least this share of the duels. */
const ADJACENT_TIER_WIN = 0.65;
const EASY_VS_HARD_WIN = 0.8;

interface Fight {
  /** Winner (entity id) or null; the tick of the kill; a state digest. */
  winner: EntityId | null;
  tick: number;
  digest: string;
}

/** Two characters `distanceM` apart facing each other on the open range: A (team 0) with tier
 *  `a`, B (team 1) with tier `b` — or a standing TARGET_OPERATOR that is never driven (b null). */
async function fight(a: AiTier, b: AiTier | null, distanceM: number, seed: number, operatorId: string): Promise<Fight & { ids: [EntityId, EntityId] }> {
  const sim = await Sim.create(RANGE_LEVEL, seed);
  const x = sim.spawnCharacter({ operatorId, team: 0, controller: 'bot', position: vec3(-16, 0, 25), yaw: NORTH });
  const y = sim.spawnCharacter({ operatorId: b ? operatorId : TARGET_OPERATOR, team: 1, controller: 'bot', position: vec3(-16, 0, 25 - distanceM), yaw: SOUTH });
  const slots: BotSlot[] = [{ entityId: x.id, brain: { kind: 'combat', tier: a } }];
  if (b) slots.push({ entityId: y.id, brain: { kind: 'combat', tier: b } });
  const bots = createBotController(sim, slots, seed);
  bots.observe(sim.drainEvents());
  for (let i = 0; i < secondsToTicks(FIGHT_SECONDS); i++) {
    const kill = stepMatch(sim, bots, new Map()).find((ev) => ev.type === 'kill');
    if (kill?.type === 'kill') return { winner: kill.attackerId, tick: sim.state.tick, digest: JSON.stringify(sim.state), ids: [x.id, y.id] };
  }
  return { winner: null, tick: sim.state.tick, digest: JSON.stringify(sim.state), ids: [x.id, y.id] };
}

describe('bot duels (range, real Sim)', () => {
  it('two hard bots duel deterministically: one seed, one result and state; another seed differs', async () => {
    const run = async (seed: number): Promise<Fight> => {
      const { winner, tick, digest } = await fight('hard', 'hard', RANGES.mid, seed, 'wisp');
      return { winner, tick, digest };
    };
    const first = await run(7);
    expect(first.winner).not.toBeNull();
    expect(await run(7)).toEqual(first);
    expect((await run(8)).digest).not.toBe(first.digest);
  });

  it('orders the tiers in bot-vs-bot duels at every range: hard > medium > easy', async () => {
    const pairs: [AiTier, AiTier][] = [['easy', 'medium'], ['medium', 'hard'], ['easy', 'hard']];
    const report: string[] = [];
    for (const [band, d] of Object.entries(RANGES)) {
      for (const [worse, better] of pairs) {
        let wins = 0;
        const n = DUELS_PER_OPERATOR * PLAYABLE_OPERATORS.length;
        for (let s = 0; s < n; s++) {
          const operatorId = PLAYABLE_OPERATORS[s % PLAYABLE_OPERATORS.length] ?? 'wisp';
          // Alternate the spots so neither tier always stands on the same side.
          const swap = s % 2 === 1;
          const r = await fight(swap ? better : worse, swap ? worse : better, d, 1000 + s, operatorId);
          const betterId = swap ? r.ids[0] : r.ids[1];
          wins += r.winner === null ? 0.5 : r.winner === betterId ? 1 : 0;
        }
        const share = wins / n;
        report.push(`${band} ${d} m: ${better} beats ${worse} ${(share * 100).toFixed(0)} % of ${n}`);
        expect(share, `${better} vs ${worse} at ${d} m`).toBeGreaterThanOrEqual(worse === 'easy' && better === 'hard' ? EASY_VS_HARD_WIN : ADJACENT_TIER_WIN);
      }
    }
    console.info(`tier duels:\n  ${report.join('\n  ')}`);
  });

  it('kills a standing target faster the higher the tier, at every range (no run-and-gun at range)', async () => {
    const report: string[] = [];
    for (const [band, d] of Object.entries(RANGES)) {
      const mean = {} as Record<AiTier, number>;
      for (const tier of AI_TIERS) {
        let total = 0;
        let n = 0;
        for (const operatorId of PLAYABLE_OPERATORS) {
          for (let i = 0; i < TARGETS_PER_OPERATOR; i++) {
            const r = await fight(tier, null, d, 500 + i, operatorId);
            total += r.tick / secondsToTicks(1);
            n += 1;
          }
        }
        mean[tier] = total / n;
      }
      report.push(`${band} ${d} m: ${AI_TIERS.map((t) => `${t} ${mean[t].toFixed(2)} s`).join(', ')}`);
      expect(mean.medium, `${d} m`).toBeLessThan(mean.easy);
      expect(mean.hard, `${d} m`).toBeLessThan(mean.medium);
    }
    console.info(`time to kill a standing ${TARGET_OPERATOR}:\n  ${report.join('\n  ')}`);
  });
});

describe('range dummies through the controller', () => {
  it('keeps static dummies in place and strafing ones in their lane', async () => {
    const sim = await Sim.create(RANGE_LEVEL, 3);
    const spawn = RANGE_LEVEL.playerSpawn;
    sim.spawnCharacter({ operatorId: 'wisp', team: RANGE_MODE.playerTeam, controller: 'player', position: fromTuple(spawn.position), yaw: spawn.yawDeg * DEG2RAD });
    const dummies = (RANGE_LEVEL.range?.dummies ?? []).map((d) => ({
      def: d,
      e: sim.spawnCharacter({ operatorId: d.operatorId, team: RANGE_MODE.dummyTeam, controller: 'bot', position: fromTuple(d.position), yaw: d.yawDeg * DEG2RAD }),
    }));
    expect(dummies.some((d) => d.def.behaviour.kind === 'strafe')).toBe(true);
    const bots = createBotController(sim, dummies.map(({ def, e }) => ({ entityId: e.id, brain: { kind: 'dummy', behaviour: def.behaviour } })), 3);
    bots.observe(sim.drainEvents());
    const travel = new Map<EntityId, number>();
    for (let i = 0; i < secondsToTicks(6); i++) {
      stepMatch(sim, bots, new Map());
      for (const { def, e } of dummies) {
        const right = rightFromYaw(e.spawnYaw);
        const lateral = (e.pos.x - e.spawnPos.x) * right.x + (e.pos.z - e.spawnPos.z) * right.z;
        travel.set(e.id, Math.max(travel.get(e.id) ?? 0, Math.abs(lateral)));
        if (def.behaviour.kind === 'strafe') expect(Math.abs(lateral)).toBeLessThan(def.behaviour.width / 2 + 1);
        expect(e.yaw).toBeCloseTo(e.spawnYaw, 6);
      }
    }
    for (const { def, e } of dummies) {
      if (def.behaviour.kind === 'static') expect(travel.get(e.id)).toBeLessThan(0.05);
      else expect(travel.get(e.id)).toBeGreaterThan(def.behaviour.width / 4);
    }
  });
});
