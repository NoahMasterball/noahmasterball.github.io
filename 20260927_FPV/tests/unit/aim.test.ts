import { describe, expect, it } from 'vitest';
import { aimStep, createAimState, type AimOutput, type AimState } from '../../src/ai/aim.ts';
import { findContact, hear, perceive, targetView, type Contact, type TargetView } from '../../src/ai/perception.ts';
import { AI, AI_TIERS, secondsToTicks, SIM, TICK_DT, type AiTier, type AiTierDef } from '../../src/config/sim.ts';
import { getHitboxProfile, getOperator } from '../../src/data/content.ts';
import { RANGE_LEVEL } from '../../src/data/levels/range.ts';
import { BUTTON, type Command } from '../../src/sim/command.ts';
import { createCharacter } from '../../src/sim/entities.ts';
import { mainZonePart, shapeFrontalArea } from '../../src/sim/hitbox.ts';
import { anglesTo, DEG2RAD, forwardFromAngles, vec3, type Vec3 } from '../../src/sim/math.ts';
import { createRng, deriveSeed, type RngState } from '../../src/sim/rng.ts';
import { Sim } from '../../src/sim/sim.ts';
import { activeWeapon } from '../../src/sim/stats.ts';
import { aimOf } from '../../src/sim/systems/weapons.ts';
import type { CharacterEntity, EntityId, SimEvent } from '../../src/sim/types.ts';

// The bot aim model (ADR-0011 §4). Pure tests drive aimStep with plain data; the accuracy and
// spray tests put a bot on the test range's open floor and let the real Sim fire — the same
// weapons, spread and recoil as for the player.

const NORTH = 0; // yaw looking down −Z
const SOUTH = Math.PI;
const TIERS = AI.tiers;

// ── Pure ────────────────────────────────────────────────────────────────────

/** A bot at the origin looking north, holding `operatorId`'s primary. */
const shooter = (operatorId = 'wisp'): CharacterEntity =>
  createCharacter(1, { operatorId, team: 0, controller: 'bot', position: vec3(0, 0, 0), yaw: NORTH }, { tick: 0, seed: SIM.defaultSeed });

/** Zone sizes of a Basalt, as targetView reports them. */
const BASALT = getHitboxProfile(getOperator('basalt').hitboxProfile);
const RADIUS = {
  head: Math.sqrt(shapeFrontalArea(mainZonePart(BASALT, 'head').shape) / Math.PI),
  torso: Math.sqrt(shapeFrontalArea(mainZonePart(BASALT, 'torso').shape) / Math.PI),
};

/** A standing target `d` m north of the origin. */
function ghost(d: number, over: Partial<TargetView> = {}): TargetView {
  const head = vec3(0, 1.6, -d);
  const torso = vec3(0, 1.2, -d);
  return { entityId: 2, points: { head, torso }, radius: RADIUS, vel: vec3(), visible: true, firstSeenTick: 0, ...over };
}

/** Runs aimStep for `ticks`, feeding the look back into the character (as the sim would). */
function drive(aim: AimState, tier: AiTierDef, self: CharacterEntity, target: (tick: number) => TargetView | null, from: number, ticks: number, rng: RngState, onTick?: (out: AimOutput, tick: number) => void): AimOutput[] {
  const outs: AimOutput[] = [];
  for (let tick = from; tick < from + ticks; tick++) {
    const out = aimStep(aim, tier, self, target(tick), tick, rng);
    self.yaw = out.yaw;
    self.pitch = out.pitch;
    onTick?.(out, tick);
    outs.push(out);
  }
  return outs;
}

/** Angle (deg) between the crosshair (look + recoil) and a world point. */
function crosshairGap(self: CharacterEntity, p: Vec3): number {
  const a = aimOf(self);
  const to = anglesTo(a.origin, p);
  return Math.hypot((a.yaw - to.yaw) * Math.cos(to.pitch), a.pitch - to.pitch) / DEG2RAD;
}

describe('aim model (pure)', () => {
  it('neither turns nor fires before the reaction time, then turns at most turnRateDeg per second', () => {
    for (const tierId of AI_TIERS) {
      const tier = TIERS[tierId];
      const self = shooter();
      self.yaw = NORTH + Math.PI / 2; // facing west, the target is 90° to the right
      const aim = createAimState();
      const reaction = secondsToTicks(tier.reactionTime);
      const outs = drive(aim, tier, self, () => ghost(15), 0, reaction + 30, createRng(1));
      for (const out of outs.slice(0, reaction)) {
        expect(out.ready).toBe(false);
        expect(out.fire).toBe(false);
        expect(out.yaw).toBe(NORTH + Math.PI / 2);
      }
      expect(outs[reaction]?.ready).toBe(true);
      const maxStep = tier.turnRateDeg * DEG2RAD * TICK_DT;
      for (let i = reaction; i < outs.length; i++) {
        const prev = outs[i - 1];
        const out = outs[i];
        if (!prev || !out) continue;
        expect(Math.hypot(out.yaw - prev.yaw, out.pitch - prev.pitch)).toBeLessThanOrEqual(maxStep + 1e-12);
      }
    }
  });

  it('decays the aim error to the tier floor while the target is visible, not while hidden', () => {
    for (const tierId of AI_TIERS) {
      const tier = TIERS[tierId];
      const aim = createAimState();
      const rng = createRng(2);
      const reaction = secondsToTicks(tier.reactionTime);
      drive(aim, tier, shooter(), () => ghost(15), 0, reaction + 1, rng);
      expect(aim.errorDeg).toBeCloseTo(tier.aimErrorDeg * Math.exp(-tier.aimErrorDecay * TICK_DT), 9);
      const hidden = aim.errorDeg;
      drive(aim, tier, shooter(), () => ghost(15, { visible: false }), reaction + 1, 60, rng);
      expect(aim.errorDeg).toBe(hidden);
      drive(aim, tier, shooter(), () => ghost(15), reaction + 61, secondsToTicks(5), rng);
      expect(aim.errorDeg).toBe(tier.aimErrorMinDeg);
    }
  });

  it('grows the error when the target reverses direction (not on a slow drift or standing)', () => {
    const tier = TIERS.medium;
    const aim = createAimState();
    const rng = createRng(3);
    const self = shooter();
    const speed = 4;
    const moving = (vx: number) => (): TargetView => ghost(15, { vel: vec3(vx, 0, 0) });
    drive(aim, tier, self, moving(speed), 0, secondsToTicks(4), rng);
    expect(aim.errorDeg).toBe(tier.aimErrorMinDeg);
    // Decelerate through a standstill (below directionChangeMinSpeed) and come back the other way.
    drive(aim, tier, self, moving(0.2), 1000, 5, rng);
    expect(aim.errorDeg).toBe(tier.aimErrorMinDeg);
    drive(aim, tier, self, moving(-speed), 1005, 1, rng);
    expect(aim.errorDeg).toBeCloseTo(tier.aimErrorMinDeg + tier.directionChangeErrorDeg, 9);
    // Keeps going the same way: no further growth, the error decays again.
    drive(aim, tier, self, moving(-speed), 1006, 10, rng);
    expect(aim.errorDeg).toBeLessThan(tier.aimErrorMinDeg + tier.directionChangeErrorDeg);
    // A turn smaller than directionChangeDeg adds nothing.
    const before = aim.errorDeg;
    const small = (AI.combat.directionChangeDeg / 2) * DEG2RAD;
    drive(aim, tier, self, () => ghost(15, { vel: vec3(-speed * Math.cos(small), 0, speed * Math.sin(small)) }), 1016, 1, rng);
    expect(aim.errorDeg).toBeLessThan(before);
  });

  it('re-acquires on a new target or a new sighting: full error, fresh zone draw', () => {
    const tier = TIERS.hard;
    const aim = createAimState();
    const rng = createRng(4);
    drive(aim, tier, shooter(), () => ghost(15), 0, secondsToTicks(3), rng);
    expect(aim.errorDeg).toBe(tier.aimErrorMinDeg);
    drive(aim, tier, shooter(), () => ghost(15, { firstSeenTick: 500 }), 500, 1, rng);
    expect(aim.errorDeg).toBe(tier.aimErrorDeg);
    expect(aim.sightingTick).toBe(500);
    drive(aim, tier, shooter(), () => ghost(15, { firstSeenTick: 500 }), 501, secondsToTicks(3), rng);
    // A switch to a contact seen long enough ago: acquired and tracked in the same tick.
    drive(aim, tier, shooter(), () => ghost(15, { entityId: 3, firstSeenTick: 500 }), 700, 1, rng);
    expect(aim.targetId).toBe(3);
    expect(aim.errorDeg).toBeCloseTo(tier.aimErrorDeg * Math.exp(-tier.aimErrorDecay * TICK_DT), 9);
  });

  it('picks the head with the tier headChance per acquisition', () => {
    for (const tierId of AI_TIERS) {
      const rng = createRng(5);
      let heads = 0;
      const n = 2000;
      for (let i = 0; i < n; i++) {
        const aim = createAimState();
        aimStep(aim, TIERS[tierId], shooter(), ghost(15, { entityId: 10 + i }), 0, rng);
        if (aim.zone === 'head') heads += 1;
      }
      expect(heads / n).toBeGreaterThan(TIERS[tierId].headChance - 0.04);
      expect(heads / n).toBeLessThan(TIERS[tierId].headChance + 0.04);
    }
  });

  it('never fires at a target out of sight, and aims at its last known position', () => {
    const tier = { ...TIERS.hard, aimErrorDeg: 0, aimErrorMinDeg: 0 };
    const self = shooter();
    const outs = drive(createAimState(), tier, self, () => ghost(15, { visible: false }), 0, secondsToTicks(2), createRng(6));
    expect(outs.some((o) => o.fire)).toBe(false);
    expect(crosshairGap(self, ghost(15).points.torso) + crosshairGap(self, ghost(15).points.head)).toBeLessThan(
      Math.abs(ghost(15).points.head.y - ghost(15).points.torso.y) / 15 / DEG2RAD + 0.01,
    );
  });

  it('presses a semi-automatic trigger on alternate ticks and holds an automatic one', () => {
    const tier = { ...TIERS.hard, aimErrorDeg: 0, aimErrorMinDeg: 0 };
    const reaction = secondsToTicks(tier.reactionTime);
    const semi = drive(createAimState(), tier, shooter('heron'), () => ghost(15), 0, reaction + 40, createRng(7)).slice(reaction + 20);
    expect(semi.every((o, i) => o.fire === (semi[0]?.fire === true ? i % 2 === 0 : i % 2 === 1))).toBe(true);
    expect(semi.filter((o) => o.fire).length).toBe(10);
    const auto = drive(createAimState(), tier, shooter('wisp'), () => ghost(15), 0, reaction + 40, createRng(7)).slice(reaction + 20);
    expect(auto.every((o) => o.fire)).toBe(true);
  });

  it(`fires bursts beyond burstBeyondM (tier burstShots, then burstPause) and continuously within`, () => {
    const tier = { ...TIERS.medium, aimErrorDeg: 0, aimErrorMinDeg: 0 };
    const self = shooter('wisp');
    const every = 4; // one shot per 4 fire ticks (the sim's cadence is irrelevant here)
    let held = 0;
    const onTick = (out: AimOutput): void => {
      if (out.fire && ++held % every === 0) activeWeapon(self).ammo -= 1;
    };
    const far = AI.combat.burstBeyondM + 10;
    const outs = drive(createAimState(), tier, self, () => ghost(far), 0, secondsToTicks(4), createRng(8), onTick);
    const fire = outs.map((o) => o.fire);
    // Longest pause after the first shot: at least burstPause.
    const firstFire = fire.indexOf(true);
    let gap = 0;
    let longest = 0;
    for (const f of fire.slice(firstFire)) {
      gap = f ? 0 : gap + 1;
      longest = Math.max(longest, gap);
    }
    expect(longest).toBeGreaterThanOrEqual(secondsToTicks(tier.burstPause));
    const near = drive(createAimState(), tier, shooter('wisp'), () => ghost(AI.combat.burstBeyondM - 5), 0, secondsToTicks(4), createRng(8));
    const nearFire = near.map((o) => o.fire);
    expect(nearFire.slice(nearFire.indexOf(true)).every(Boolean)).toBe(true);
  });

  it('strafes (ADAD) per tier, stops on fire ticks for stop-to-shoot tiers; ADS beyond adsBeyondM', () => {
    for (const tierId of AI_TIERS) {
      const tier = TIERS[tierId];
      // Beyond burstBeyondM, so there are pauses between bursts to strafe in.
      const d = AI.combat.burstBeyondM + 5;
      const self = shooter();
      let held = 0;
      const shoot = (out: AimOutput): void => {
        if (out.fire && ++held % 4 === 0) activeWeapon(self).ammo -= 1;
      };
      const outs = drive(createAimState(), tier, self, () => ghost(d), 0, secondsToTicks(6), createRng(9), shoot).filter((o) => o.ready);
      const legs = new Set(outs.filter((o) => !o.stop).map((o) => o.strafe));
      expect(legs).toEqual(tier.strafe ? new Set([-1, 1]) : new Set([0]));
      const firing = outs.filter((o) => o.fire);
      expect(firing.length).toBeGreaterThan(0);
      for (const o of firing) {
        expect(o.stop).toBe(tier.stopToShoot);
        if (tier.stopToShoot) expect(o.strafe).toBe(0);
      }
      expect(outs.every((o) => o.ads === d > AI.combat.adsBeyondM)).toBe(true);
    }
  });

  it('is deterministic per seed', () => {
    const run = (seed: number): AimOutput[] => {
      const self = shooter();
      let vx = 3;
      return drive(createAimState(), TIERS.medium, self, (t) => {
        if (t % 40 === 0) vx = -vx;
        return ghost(20, { vel: vec3(vx, 0, 0) });
      }, 0, 600, createRng(seed));
    };
    expect(run(11)).toEqual(run(11));
    expect(run(11)).not.toEqual(run(12));
  });
});

// ── Real Sim: accuracy and sprays ───────────────────────────────────────────

interface Tally {
  shots: number;
  hits: number;
  kills: number;
  damage: number;
}

/** A tier-driven bot (Wisp) shoots at a static Basalt on the open range until it has fired
 *  `shots` times or `seconds` passed. The range respawns the target after each kill; the bot
 *  re-acquires it. */
async function marksmanship(tier: AiTierDef, seed: number, distanceM: number, shots: number, seconds = 120): Promise<Tally> {
  const sim = await Sim.create(RANGE_LEVEL, seed);
  const bot = sim.spawnCharacter({ operatorId: 'wisp', team: 0, controller: 'bot', position: vec3(-16, 0, 25), yaw: NORTH });
  const target = sim.spawnCharacter({ operatorId: 'basalt', team: 1, controller: 'bot', position: vec3(-15, 0, 25 - distanceM), yaw: SOUTH });
  const contacts: Contact[] = [];
  const aim = createAimState();
  const rng = createRng(deriveSeed(seed, bot.id));
  const tally: Tally = { shots: 0, hits: 0, kills: 0, damage: 0 };
  for (let i = 0; i < secondsToTicks(seconds) && tally.shots < shots; i++) {
    perceive(sim, bot, contacts, bot.id, target.id);
    const c = findContact(contacts, target.id);
    const out = aimStep(aim, tier, bot, c ? targetView(sim, c) : null, sim.state.tick, rng);
    const buttons = (out.fire ? BUTTON.fire : 0) | (out.ads ? BUTTON.ads : 0);
    const events = sim.step(new Map([[bot.id, { tick: sim.state.tick + 1, moveX: 0, moveZ: 0, yaw: out.yaw, pitch: out.pitch, buttons }]]));
    hear(sim, bot, contacts, events, rng);
    for (const ev of events) {
      if (ev.type === 'shot' && ev.entityId === bot.id) tally.shots += 1;
      if (ev.type === 'hit' && ev.attackerId === bot.id) {
        tally.hits += 1;
        tally.damage += ev.damage;
      }
      if (ev.type === 'kill' && ev.attackerId === bot.id) tally.kills += 1;
    }
  }
  return tally;
}

/** Full-auto spray at a fixed point 15 m away with the trigger held from the first ready tick:
 *  the angle (deg) of every bullet from the point, measured on the sim's own shot events. */
async function spray(tier: AiTierDef, shots: number): Promise<number[]> {
  const sim = await Sim.create(RANGE_LEVEL, 21);
  const bot = sim.spawnCharacter({ operatorId: 'wisp', team: 0, controller: 'bot', position: vec3(-16, 0, 25), yaw: NORTH });
  const point = vec3(-16, 1.3, 10);
  const view: TargetView = { entityId: 99, points: { head: point, torso: point }, radius: RADIUS, vel: vec3(), visible: true, firstSeenTick: 0 };
  const aim = createAimState();
  const rng = createRng(21);
  const errors: number[] = [];
  for (let i = 0; i < secondsToTicks(10) && errors.length < shots; i++) {
    const out = aimStep(aim, tier, bot, view, sim.state.tick, rng);
    const buttons = out.ready ? BUTTON.fire | BUTTON.ads : 0;
    const events: SimEvent[] = sim.step(new Map<EntityId, Command>([[bot.id, { tick: sim.state.tick + 1, moveX: 0, moveZ: 0, yaw: out.yaw, pitch: out.pitch, buttons }]]));
    for (const ev of events) {
      if (ev.type !== 'shot') continue;
      const to = anglesTo(ev.origin, point);
      const want = forwardFromAngles(to.yaw, to.pitch);
      const dot = want.x * ev.dir.x + want.y * ev.dir.y + want.z * ev.dir.z;
      errors.push(Math.acos(Math.min(1, dot)) / DEG2RAD);
    }
  }
  return errors;
}

const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('aim model on the real Sim', () => {
  // Damage in the same time, not hits per shot: hard trades hit ratio for head aim (headChance)
  // and longer bursts, so its hit ratio at 15 m is within noise of medium's (three 12-seed
  // samples: +1.7, −2.6, −0.4 points; the old 3-seed ratio flipped when spread moved to
  // per-character streams, ADR-0014 §2), while reaction, turn rate and bursts put its damage ahead
  // in every sample measured.
  it('damages a static target with the tier ordering hard > medium > easy', async () => {
    const damage = {} as Record<AiTier, number>;
    for (const tierId of AI_TIERS) {
      const total: Tally = { shots: 0, hits: 0, kills: 0, damage: 0 };
      for (const seed of [31, 32, 33, 34, 35, 36]) {
        const t = await marksmanship(TIERS[tierId], seed, 15, Infinity, 20);
        total.shots += t.shots;
        total.hits += t.hits;
        total.kills += t.kills;
        total.damage += t.damage;
      }
      damage[tierId] = total.damage;
      const ratio = (100 * total.hits) / Math.max(1, total.shots);
      console.info(`${tierId} @15 m, 6 × 20 s: damage ${total.damage.toFixed(0)}, hits ${total.hits}/${total.shots} = ${ratio.toFixed(1)} %, kills ${total.kills}`);
    }
    expect(damage.hard).toBeGreaterThan(damage.medium);
    expect(damage.medium).toBeGreaterThan(damage.easy);
  });

  it('keeps a spray closer to the point the higher the recoil compensation', async () => {
    const drift: number[] = [];
    for (const tierId of AI_TIERS) {
      // Only recoil compensation differs: no aim error, the medium turn rate.
      const tier = { ...TIERS.medium, aimErrorDeg: 0, aimErrorMinDeg: 0, recoilCompensation: TIERS[tierId].recoilCompensation };
      const errors = await spray(tier, 24);
      drift.push(mean(errors));
      console.info(`spray ${tierId} (comp ${tier.recoilCompensation}): mean ${mean(errors).toFixed(2)}°, last ${errors.at(-1)?.toFixed(2)}°`);
    }
    const [easy, medium, hard] = drift;
    expect(hard).toBeLessThan(medium ?? 0);
    expect(medium).toBeLessThan(easy ?? 0);
  });

  it('is deterministic across runs with one seed', async () => {
    const a = await marksmanship(TIERS.medium, 41, 25, 60);
    const b = await marksmanship(TIERS.medium, 41, 25, 60);
    expect(a).toEqual(b);
  });
});
