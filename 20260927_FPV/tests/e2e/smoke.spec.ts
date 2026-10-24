import { expect, test, type Page } from '@playwright/test';
import { LAUNCH, MODE_TEXT } from '../../src/config/client.ts';
import { MATCH, PLAYABLE_OPERATORS } from '../../src/config/sim.ts';
import { getAbility, getOperator } from '../../src/data/content.ts';
import type { ModeId } from '../../src/sim/modes/mode.ts';
import type { SimEvent } from '../../src/sim/types.ts';
import { openGame, watchPage } from './support/page.ts';

// Smoke tests of the production build served from the GitHub-Pages-style sub-directory.
// Range (`?mode=range`): it loads, reports ready, logs no console errors, requests nothing that
// fails, an aimed shot registers on a dummy's head hitbox and on its torso hitbox (separate
// colliders), and a weapon swap through the Command path fires the next shot with the secondary.
// Range abilities (ADR-0012 §11): Keel places a Breakwater barrier through the Command path (the
// ability key opens the placement, fire confirms it without firing the weapon).
// Default page (Relay, ADR-0013 Q3): the full roster waits in round 1's operator select, the page
// opens on the select screen instead of the menu, the round HUD shows, no console errors.
// Elimination (`?mode=elimination`, ADR-0011 §8): the same round start behind the menu, with the
// pre-round banner. window.__qa is typed in src/client/qa.ts.

type HitEvent = Extract<SimEvent, { type: 'hit' }>;
type ShotEvent = Extract<SimEvent, { type: 'shot' }>;

/** The URL query that names only a mode (its default level, a fresh seed). */
const modeSearch = (mode: ModeId): string => `?${new URLSearchParams({ [LAUNCH.params.mode]: mode }).toString()}`;
const RANGE: ModeId = 'range';
const RANGE_SEARCH = modeSearch(RANGE);
const ELIMINATION: ModeId = 'elimination';
/** The operator of the ability smoke test: its first ability places a barrier. */
const BARRIER_OPERATOR = 'keel';
const BARRIER_ABILITY = ((): string => {
  const id = getOperator(BARRIER_OPERATOR).abilities[0];
  if (!id) throw new Error(`${BARRIER_OPERATOR} has no ability`);
  return id;
})();


/** Runs in the page: aim at a hitbox part, settle fully aimed, fire one shot; returns its events. */
async function aimedShot({ id, part }: { id: number; part: string }): Promise<SimEvent[]> {
  const api = window.__qa;
  if (!api) throw new Error('window.__qa missing');
  api.clearEvents();
  if (!api.aimAt(id, part)) throw new Error('aimAt failed');
  api.setButtons(['ads']);
  await api.waitTicks(60); // fully aimed, recoil settled
  // Exactly one tick of trigger, stepped synchronously: at headless frame rates one waited
  // frame can span several ticks, and a trigger held that long fires an auto weapon twice.
  api.setButtons(['ads', 'fire']);
  api.advanceTicks(1);
  api.setButtons([]);
  await api.waitTicks(2);
  return api.events();
}

test('production build (range): loads from a sub-directory, runs clean, shots hit head and torso, weapon swap', async ({ page }) => {
  const { errors, failed } = watchPage(page);
  await openGame(page, RANGE_SEARCH);

  // The dummy nearest to the player spawn (a static one on the 10 m lane).
  const setup = await page.evaluate(() => {
    const s = window.__qa?.state();
    const player = s?.characters.find((c) => c.id === s.playerId);
    if (!s || !player) throw new Error('QA state unavailable');
    const dist = (c: { pos: { x: number; z: number } }): number => Math.hypot(c.pos.x - player.pos.x, c.pos.z - player.pos.z);
    const target = s.characters.filter((c) => c.controller === 'bot').sort((a, b) => dist(a) - dist(b))[0];
    return { playerId: s.playerId, mode: s.match.mode, target };
  });
  expect(setup.mode).toBe(RANGE);
  const target = setup.target;
  if (!target) throw new Error('no dummy found');
  const hitsOnTarget = (events: SimEvent[]): HitEvent[] =>
    events.filter((e): e is HitEvent => e.type === 'hit' && e.attackerId === setup.playerId && e.victimId === target.id);

  // Stand 6 m in front of it, facing it.
  await page.evaluate((t) => window.__qa?.teleport(t.pos.x, 0, t.pos.z + 6, 0, 0), target);

  for (const [part, zone] of [
    ['head', 'head'],
    ['chest', 'torso'],
  ] as const) {
    const mine = hitsOnTarget(await page.evaluate(aimedShot, { id: target.id, part }));
    expect(mine, `hits on ${part}`).toHaveLength(1);
    expect(mine[0]?.zone).toBe(zone);
    expect(mine[0]?.damage).toBeGreaterThan(0);
  }

  // Weapon swap: tap "select secondary" for one tick, wait until the swap has finished (and the
  // dummy has respawned, in case the two shots above killed it).
  const swap = await page.evaluate(async (targetId) => {
    const api = window.__qa;
    if (!api) throw new Error('window.__qa missing');
    const find = (id: number) => api.state().characters.find((c) => c.id === id);
    const me = () => find(api.state().playerId);
    const before = me();
    api.clearEvents();
    api.setButtons(['selectSecondary']);
    await api.waitTicks(1);
    api.setButtons([]);
    for (let i = 0; i < 600 && me()?.swapping; i++) await api.waitTicks(1);
    const swaps = api.events('weaponSwap').length;
    for (let i = 0; i < 600 && !find(targetId)?.alive; i++) await api.waitTicks(1);
    return { before, after: me(), swaps };
  }, target.id);
  expect(swap.swaps).toBe(1);
  expect(swap.after?.activeSlot).toBe(1);
  expect(swap.after?.swapping).toBe(false);
  expect(swap.after?.weaponId).not.toBe(swap.before?.weaponId);

  const secondaryShot = await page.evaluate(aimedShot, { id: target.id, part: 'chest' });
  const myShots = secondaryShot.filter((e): e is ShotEvent => e.type === 'shot' && e.entityId === setup.playerId);
  expect(myShots.map((s) => s.weaponId)).toEqual([swap.after?.weaponId]);
  expect(hitsOnTarget(secondaryShot)).toHaveLength(1);

  const stats = await page.evaluate(() => window.__stats?.());
  expect(stats?.tick).toBeGreaterThan(0);
  expect(failed, 'failed requests').toEqual([]);
  expect(errors, 'console errors').toEqual([]);
});

test('production build (range): an operator places a gadget through the Command path', async ({ page }) => {
  expect(getAbility(BARRIER_ABILITY).activation.kind).toBe('placeable');
  const { errors, failed } = watchPage(page);
  await openGame(page, RANGE_SEARCH);

  const result = await page.evaluate(
    async ({ operatorId, abilityId }) => {
      const api = window.__qa;
      if (!api) throw new Error('window.__qa missing');
      /** Holds `buttons` for one tick (a press), then releases them. */
      const tap = async (buttons: Parameters<typeof api.setButtons>[0]): Promise<void> => {
        api.setButtons(buttons);
        await api.waitTicks(1);
        api.setButtons([]);
        await api.waitTicks(1);
      };
      await api.selectOperator(operatorId);
      // Past the firing-line bench, looking at the open floor ahead (the ghost stands there).
      await api.teleport(-7, 0, 3, 0, -20);
      const me = () => api.state().characters.find((c) => c.id === api.state().playerId);
      api.clearEvents();
      await tap(['ability1']);
      const placing = me()?.abilities[0]?.active?.kind ?? null;
      await tap(['fire']);
      await api.waitTicks(2);
      const state = api.state();
      return {
        operatorId: me()?.operatorId,
        placing,
        after: me()?.abilities[0]?.active ?? null,
        gadgets: state.gadgets.map((g) => ({ abilityId: g.abilityId, ownerId: g.ownerId })),
        playerId: state.playerId,
        placed: api.events('gadgetPlaced').length,
        shots: api.events('shot').filter((e) => e.type === 'shot' && e.entityId === state.playerId).length,
        abilityId,
      };
    },
    { operatorId: BARRIER_OPERATOR, abilityId: BARRIER_ABILITY },
  );
  expect(result.operatorId).toBe(BARRIER_OPERATOR);
  expect(result.placing, 'the ability key opens the placement').toBe('placing');
  expect(result.after, 'fire confirms it').toBeNull();
  expect(result.gadgets).toEqual([{ abilityId: result.abilityId, ownerId: result.playerId }]);
  expect(result.placed).toBe(1);
  expect(result.shots, 'the confirming fire press never fires the weapon').toBe(0);
  expect(failed, 'failed requests').toEqual([]);
  expect(errors, 'console errors').toEqual([]);
});

/** Opens a round mode's page (`search`) and checks round 1 before the player starts it: the mode,
 *  round 1's `preRound` (the match waits for the player — the menu's play click, in Relay a pick
 *  or Ready), the full roster with one player, the round HUD with a pip per character. */
async function openRoundStart(page: Page, search: string, mode: ModeId): Promise<void> {
  await openGame(page, search);
  const state = await page.evaluate(() => window.__qa?.state());
  if (!state) throw new Error('QA state unavailable');
  expect(state.match.mode).toBe(mode);
  expect(state.match.mode === 'range' ? null : [state.match.round, state.match.phase]).toEqual([1, 'preRound']);
  const alivePerTeam = [0, 1].map((team) => state.characters.filter((c) => c.team === team && c.alive).length);
  expect(alivePerTeam).toEqual([MATCH.teamSize, MATCH.teamSize]);
  expect(state.characters.filter((c) => c.controller === 'player')).toHaveLength(1);

  await expect(page.locator('.round-hud')).toBeVisible();
  await expect(page.locator('.rh-pips i')).toHaveCount(2 * MATCH.teamSize);
}

test(`production build (default page = ${MODE_TEXT[LAUNCH.defaultMode].name}): operator select screen, full roster, round HUD, runs clean`, async ({ page }) => {
  const { errors, failed } = watchPage(page);
  await openRoundStart(page, '', LAUNCH.defaultMode);

  // Relay's page load opens on the operator select screen instead of the menu (ADR-0013 §14);
  // tests/e2e/relay.spec.ts covers the picks and the phases.
  await expect(page.locator('.opsel')).toBeVisible();
  await expect(page.locator('.opsel-card')).toHaveCount(PLAYABLE_OPERATORS.length);
  await expect(page.locator('.menu')).toBeHidden();
  expect(failed, 'failed requests').toEqual([]);
  expect(errors, 'console errors').toEqual([]);
});

test('production build (elimination): full roster, menu and pre-round banner, runs clean', async ({ page }) => {
  const { errors, failed } = watchPage(page);
  await openRoundStart(page, modeSearch(ELIMINATION), ELIMINATION);

  await expect(page.locator('.menu')).toBeVisible();
  await expect(page.locator('.round-banner')).toBeVisible(); // the pre-round banner
  expect(failed, 'failed requests').toEqual([]);
  expect(errors, 'console errors').toEqual([]);
});
