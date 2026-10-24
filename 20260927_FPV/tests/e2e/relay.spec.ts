import { expect, test, type Page } from '@playwright/test';
import { launchSearch } from '../../src/client/launch.ts';
import type { QaState } from '../../src/client/qa.ts';
import { bindingLabel, HUD, LAUNCH, RELAY_SHOT_SEED } from '../../src/config/client.ts';
import { MATCH, PLAYABLE_OPERATORS, RELAY, secondsToTicks } from '../../src/config/sim.ts';
import { getLevel, getOperator } from '../../src/data/content.ts';
import { matchSetupWallsUp } from '../../src/sim/modes/index.ts';
import type { ModeId } from '../../src/sim/modes/mode.ts';
import type { MatchPhase } from '../../src/sim/types.ts';
import { openGame, watchPage } from './support/page.ts';

// Relay (ADR-0013 §9, R3) on the production build: `?mode=relay` loads into the operator select
// screen (one card per playable operator, the team's picks); a number key and a click on a card
// pick through the ControlMessage path, a freed pointer shows the screen again; setup raises the walls and shows the objective line with site markers; in
// the engagement the player, teleported onto site A's floor, sees the plant prompt with the
// interact key, holds interact (Commands) and sees the own plant progress; the completed plant
// starts the uplink (HUD bar, uplink marker, round HUD caption); the uplink runs out and the round
// banner says the round is won. No console errors, no failed requests. Long phases are skipped
// with __qa.advanceTicks (software WebGL runs far below real time); bots are idle, so the round
// plays out exactly as scripted.

const RELAY_MODE: ModeId = 'relay';
const LEVEL = getLevel(LAUNCH.defaultLevel[RELAY_MODE]);
const SEARCH = launchSearch({ mode: RELAY_MODE, levelId: LEVEL.id, seed: RELAY_SHOT_SEED });
const TEXT = HUD.relay.text;
const PLANT_TICKS = secondsToTicks(RELAY.plantSeconds);

/** Fast-forwards phase by phase (each step to the current phase's end) until the match is in
 *  `phase`; returns the state then. */
async function advanceToPhase(page: Page, phase: MatchPhase): Promise<QaState> {
  return page.evaluate((target) => {
    const api = window.__qa;
    if (!api) throw new Error('window.__qa missing');
    for (let step = 0; step < 10; step++) {
      const s = api.state();
      if (s.match.mode === 'range') throw new Error('not a round mode');
      if (s.match.phase === target) return s;
      api.advanceTicks(Math.max(1, (s.match.phaseEndTick ?? s.tick + 1) - s.tick));
    }
    throw new Error(`phase ${target} not reached`);
  }, phase);
}

/** The QA state (after `ticks` real, rendered ticks, so the HUD shows it). */
async function stateAfter(page: Page, ticks: number): Promise<QaState> {
  return page.evaluate(async (n) => {
    const api = window.__qa;
    if (!api) throw new Error('window.__qa missing');
    await api.waitTicks(n);
    return api.state();
  }, ticks);
}

const me = (s: QaState): QaState['characters'][number] => {
  const p = s.characters.find((c) => c.id === s.playerId);
  if (!p) throw new Error('no player in the QA state');
  return p;
};

test('production build (relay): operator select, setup walls, plant → uplink in the HUD, round end', async ({ page }) => {
  const { errors, failed } = watchPage(page);
  await openGame(page, SEARCH);

  const start = await page.evaluate(() => {
    window.__qa?.setBotsIdle(true);
    return window.__qa?.state();
  });
  if (!start || start.match.mode !== RELAY_MODE) throw new Error('not a Relay match');
  expect(start.match.phase).toBe('preRound');
  expect(start.match.attackingTeam, 'the seed has the player attack in round 1').toBe(me(start).team);

  // Operator select: one card per playable operator, the whole team in the chips.
  await expect(page.locator('.opsel')).toBeVisible();
  await expect(page.locator('.opsel-card')).toHaveCount(PLAYABLE_OPERATORS.length);
  await expect(page.locator('.opsel-chip')).toHaveCount(MATCH.teamSize);
  await expect(page.locator(`.opsel-card[data-operator="${me(start).operatorId}"]`)).toHaveClass(/selected/);
  const others = PLAYABLE_OPERATORS.filter((id) => id !== me(start).operatorId);
  const [clickPick, keyPick] = others;
  if (!clickPick || !keyPick) throw new Error('fewer than three playable operators');

  // A number key picks its card and returns to the game (the pointer is captured, or the browser
  // refuses the lock); freeing the pointer (Esc) shows the screen again.
  await page.keyboard.press(`${HUD.relay.select.pickKeyPrefix}${PLAYABLE_OPERATORS.indexOf(keyPick) + 1}`);
  expect(me(await stateAfter(page, 2)).operatorId).toBe(keyPick);
  await page.evaluate(() => document.exitPointerLock());
  await expect(page.locator('.opsel')).toBeVisible();
  await expect(page.locator(`.opsel-card[data-operator="${keyPick}"]`)).toHaveClass(/selected/);

  // A click on a card picks it the same way.
  await page.locator(`.opsel-card[data-operator="${clickPick}"]`).click();
  const picked = await stateAfter(page, 2);
  expect(me(picked).operatorId).toBe(clickPick);
  const locked = await page.evaluate(() => document.pointerLockElement !== null);
  if (locked) await expect(page.locator('.opsel-strip')).toContainText(getOperator(clickPick).name);
  else await expect(page.locator(`.opsel-card[data-operator="${clickPick}"]`)).toHaveClass(/selected/);

  // Setup: the walls stand, the attacker's objective line names the gate, both sites are marked.
  const setup = await advanceToPhase(page, 'setup');
  expect(matchSetupWallsUp(setup.match)).toBe(true);
  await expect(page.locator('.opsel')).toBeHidden();
  await expect(page.locator('.objective-strip')).toContainText(TEXT.setup.attack);
  await expect(page.locator('.rh-caption')).toHaveText(TEXT.caption.setup);
  await expect(page.locator('.objective-marker.site')).toHaveCount(LEVEL.sites?.length ?? 0);

  // Engagement: onto site A's floor → the plant prompt with the interact key.
  const live = await advanceToPhase(page, 'live');
  expect(matchSetupWallsUp(live.match)).toBe(false);
  const site = LEVEL.sites?.[0];
  if (!site) throw new Error(`${LEVEL.id} has no site`);
  await page.evaluate(([x, y, z]) => window.__qa?.teleport(x, y, z, 0, 0), [site.center[0], site.center[1] - site.size[1] / 2, site.center[2]] as const);
  const prompt = page.locator('.objective-prompt');
  await expect(prompt).toContainText(bindingLabel('interact'));
  await expect(prompt).toContainText(TEXT.prompt.plant);

  // Hold interact: the own channel's progress, then the uplink.
  const channelling = await page.evaluate(async (ticks) => {
    const api = window.__qa;
    if (!api) throw new Error('window.__qa missing');
    api.setButtons(['interact']);
    api.advanceTicks(ticks);
    await api.waitTicks(1);
    return api.state();
  }, Math.round(PLANT_TICKS / 2));
  if (channelling.match.mode !== RELAY_MODE) throw new Error('not a Relay match');
  expect(channelling.match.channel?.action).toBe('plant');
  await expect(prompt).toContainText(TEXT.channel.plant);
  await expect(prompt.locator('.bar')).toBeVisible();

  const planted = await page.evaluate((ticks) => {
    const api = window.__qa;
    if (!api) throw new Error('window.__qa missing');
    api.advanceTicks(ticks);
    api.setButtons([]);
    return api.state();
  }, PLANT_TICKS);
  if (planted.match.mode !== RELAY_MODE) throw new Error('not a Relay match');
  expect(planted.match.phase).toBe('uplink');
  expect(planted.match.uplink?.siteId).toBe(site.id);
  await expect(page.locator('.os-uplink')).toContainText(site.name);
  await expect(page.locator('.objective-marker.uplink')).toHaveCount(1);
  await expect(page.locator('.rh-caption')).toContainText(TEXT.uplink(''));

  // The uplink runs out: the attackers take the round.
  const ended = await advanceToPhase(page, 'roundEnd');
  if (ended.match.mode !== RELAY_MODE) throw new Error('not a Relay match');
  expect(ended.match.score[me(ended).team]).toBe(1);
  await expect(page.locator('.round-banner')).toContainText('ROUND WON');
  await expect(page.locator('.objective-strip')).toBeHidden();

  expect(failed, 'failed requests').toEqual([]);
  expect(errors, 'console errors').toEqual([]);
});
