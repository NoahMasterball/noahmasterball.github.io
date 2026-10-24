import { ABILITY_RULES, AI, CHARACTER, MATCH, PLAYABLE_OPERATORS } from '../config/sim.ts';
import { ABILITIES } from './abilities.ts';
import { BUDGET } from './budget.ts';
import { HITBOX_PROFILES } from './hitboxes.ts';
import { insideExtent, levelExtent, type Extent } from './levels/geometry.ts';
import { RANGE_LEVEL } from './levels/range.ts';
import { SALTWORKS_LEVEL } from './levels/saltworks.ts';
import { OPERATORS } from './operators.ts';
import type {
  AbilityDef,
  ActivationDef,
  BotAbilityHint,
  EffectDef,
  HitboxProfileDef,
  LevelDef,
  NavGraphDef,
  OperatorDef,
  SiteDef,
  Vec3Tuple,
  VolumeDef,
  WeaponDef,
} from './schema.ts';
import { MODIFIABLE_STATS, SIDES } from './schema.ts';
import { WEAPONS } from './weapons.ts';

// NEW — content registry: the only lookup path from ids to definitions, plus validation of
// references and value ranges (ADR-0008). Game, tests and tools all go through here.

function indexById<T extends { id: string }>(items: readonly T[], kind: string): ReadonlyMap<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    if (map.has(item.id)) throw new Error(`Duplicate ${kind} id '${item.id}'`);
    map.set(item.id, item);
  }
  return map;
}

const weaponsById = indexById(WEAPONS, 'weapon');
const abilitiesById = indexById(ABILITIES, 'ability');
const operatorsById = indexById(OPERATORS, 'operator');
const profilesById = indexById(HITBOX_PROFILES, 'hitbox profile');
/** Every registered level (the range is also the automated test scene). */
const LEVELS: readonly LevelDef[] = [RANGE_LEVEL, SALTWORKS_LEVEL];
const levelsById = indexById(LEVELS, 'level');

function lookup<T>(map: ReadonlyMap<string, T>, id: string, kind: string): T {
  const item = map.get(id);
  if (!item) throw new Error(`Unknown ${kind} id '${id}'`);
  return item;
}

export const getWeapon = (id: string): WeaponDef => lookup(weaponsById, id, 'weapon');
export const getAbility = (id: string): AbilityDef => lookup(abilitiesById, id, 'ability');
export const getOperator = (id: string): OperatorDef => lookup(operatorsById, id, 'operator');
export const getHitboxProfile = (id: string): HitboxProfileDef => lookup(profilesById, id, 'hitbox profile');
export const getLevel = (id: string): LevelDef => lookup(levelsById, id, 'level');

// NEW — site membership by position (ADR-0011 §5: site nodes are derived from the site areas,
// never tagged); no site-area helper existed. Nav validation and the bots' graph use it. One rule
// for every axis-aligned volume since ADR-0013 §4 (sites, setup walls).
/** The extent of an axis-aligned volume. */
export const volumeExtent = (v: VolumeDef): Extent => ({
  min: [v.center[0] - v.size[0] / 2, v.center[1] - v.size[1] / 2, v.center[2] - v.size[2] / 2],
  max: [v.center[0] + v.size[0] / 2, v.center[1] + v.size[1] / 2, v.center[2] + v.size[2] / 2],
});

/** True if `p` lies in the site's area (bounds inclusive). Feet resting on the site floor sit a
 *  hair above or below it (controller skin), so `p` is tested CHARACTER.groundProbe higher. */
export const insideSite = (s: SiteDef, p: Vec3Tuple): boolean =>
  insideExtent(volumeExtent(s), [p[0], p[1] + CHARACTER.groundProbe, p[2]]);

/** The site whose area contains the point or the feet at `p`, if any. */
export const siteAt = (level: LevelDef, p: Vec3Tuple): SiteDef | undefined => (level.sites ?? []).find((s) => insideSite(s, p));

/** A loadout slot of an operator definition. */
export type LoadoutSlot = keyof OperatorDef['loadout'];

/** The weapon an operator spawns with in a loadout slot: the first option of that slot. */
export function loadoutWeapon(op: OperatorDef, slot: LoadoutSlot): WeaponDef {
  const id = op.loadout[slot][0];
  if (id === undefined) throw new Error(`Operator '${op.id}' has no ${slot} weapon`);
  return getWeapon(id);
}

// ── Validation ──────────────────────────────────────────────────────────────

type Check = (ok: boolean, message: string) => void;

function validateWeapon(w: WeaponDef, check: Check): void {
  const p = `weapon '${w.id}'`;
  check(w.damage > 0 && w.pellets >= 1 && Number.isInteger(w.pellets), `${p}: damage > 0 and integer pellets ≥ 1`);
  check(w.falloff.start >= 0 && w.falloff.start <= w.falloff.end, `${p}: falloff start ≤ end`);
  check(w.falloff.minDamage > 0 && w.falloff.minDamage <= w.damage, `${p}: 0 < minDamage ≤ damage`);
  check(w.rpm > 0 && w.magazine >= 1 && w.reserveMagazines >= 0 && w.reloadTime > 0, `${p}: rpm, magazine, reload`);
  check(w.adsSpread >= 0 && w.hipSpread >= 0 && w.maxSpread >= Math.max(w.hipSpread, w.adsSpread), `${p}: spreads ≤ maxSpread`);
  check(w.spreadPerShot >= 0 && w.spreadMoving >= 0 && w.spreadRecovery > 0, `${p}: spread growth/recovery`);
  check(w.recoil.pattern.length > 0, `${p}: recoil pattern not empty`);
  check(w.recoil.loopFrom >= 0 && w.recoil.loopFrom < w.recoil.pattern.length, `${p}: recoil loopFrom inside pattern`);
  check(w.recoil.recovery > 0 && w.recoil.adsMultiplier > 0 && w.recoil.resetTime > 0, `${p}: recoil recovery/ads/reset`);
  check(w.adsTime > 0 && w.adsFovMultiplier > 0 && w.adsFovMultiplier <= 1, `${p}: adsTime > 0, 0 < adsFov ≤ 1`);
  check(w.headshotMultiplier >= 1 && w.limbMultiplier > 0 && w.limbMultiplier <= 1, `${p}: zone multipliers`);
  check(w.moveSpeedModifier > 0 && w.moveSpeedModifier <= 1.1, `${p}: moveSpeedModifier in (0, 1.1]`);
  check(w.maxRange > w.falloff.end, `${p}: maxRange beyond falloff end`);
}

function validateEffect(e: EffectDef, passive: boolean, p: string, check: Check): void {
  const q = `${p}: ${e.kind}`;
  if (e.kind === 'modifier' || e.kind === 'areaDenial') {
    for (const [stat, value] of Object.entries(e.stats)) {
      check((MODIFIABLE_STATS as readonly string[]).includes(stat), `${p}: unknown modifiable stat '${stat}'`);
      check(typeof value === 'number' && value >= 0, `${p}: modifier '${stat}' must be ≥ 0`);
    }
  }
  // ADR-0012 §3.5: every radius, amount and duration positive (a modifier's radius 0 = the user
  // only; its duration is ignored for passive, hold and toggle abilities).
  switch (e.kind) {
    case 'damage':
      check(e.amount > 0 && e.radius > 0, `${q} amount and radius > 0`);
      break;
    case 'heal':
      check(e.amount > 0 && e.radius > 0, `${q} amount and radius > 0`);
      break;
    case 'shield':
      check(e.amount > 0 && e.duration > 0 && e.radius > 0, `${q} amount, duration and radius > 0`);
      break;
    case 'barrier':
      check(e.width > 0 && e.height > 0, `${q} width and height > 0`);
      break;
    case 'modifier':
      check(e.radius >= 0, `${q} radius ≥ 0`);
      if (!passive) check(e.duration >= 0, `${q} duration ≥ 0`);
      break;
    case 'dash':
      check(e.distance > 0 && e.duration > 0, `${q} distance and duration > 0`);
      break;
    case 'reveal':
      check(e.radius > 0 && e.duration > 0, `${q} radius and duration > 0`);
      break;
    case 'areaDenial':
      check(e.radius > 0 && e.duration > 0 && e.damagePerSecond >= 0, `${q} radius and duration > 0, damagePerSecond ≥ 0`);
      break;
    case 'disableGadgets':
      check(e.radius > 0 && e.duration > 0, `${q} radius and duration > 0`);
      break;
  }
}

// NEW — ADR-0012 §3.5: activation parameters had no range checks.
function validateActivation(a: ActivationDef, p: string, check: Check): void {
  switch (a.kind) {
    case 'hold':
      check(a.maxDuration > 0, `${p}: hold maxDuration > 0`);
      break;
    case 'toggle':
      check(a.maxDuration === null || a.maxDuration > 0, `${p}: toggle maxDuration null or > 0`);
      break;
    case 'placeable':
      check(Number.isInteger(a.maxActive) && a.maxActive >= 1, `${p}: placeable maxActive an integer ≥ 1`);
      check(a.placeRange > 0 && a.gadgetHealth > 0, `${p}: placeable placeRange and gadgetHealth > 0`);
      if (a.trigger.kind === 'proximity') check(a.trigger.radius > 0, `${p}: proximity trigger radius > 0`);
      if (a.trigger.kind === 'timer') check(a.trigger.delay > 0, `${p}: timer trigger delay > 0`);
      break;
    case 'thrown':
      check(a.speed > 0 && a.gravityScale >= 0, `${p}: thrown speed > 0, gravityScale ≥ 0`);
      check(a.fuse === null || a.fuse > 0, `${p}: thrown fuse null or > 0`);
      // A fuse the flight limit outlasts would never burst in the air (removed without effect).
      check(
        a.fuse === null || a.fuse < ABILITY_RULES.thrown.maxFlightSeconds,
        `${p}: thrown fuse < ABILITY_RULES.thrown.maxFlightSeconds (${ABILITY_RULES.thrown.maxFlightSeconds} s)`,
      );
      break;
    case 'instant':
    case 'passive':
      break;
  }
}

// NEW — ADR-0012 §10: a usage hint must fit the ability it steers.
function validateBotHint(a: AbilityDef, hint: BotAbilityHint, p: string, check: Check): void {
  const kinds = new Set(a.effects.map((e) => e.kind));
  const activation = a.activation.kind;
  if (activation === 'passive') check(hint.use === 'never', `${p}: a passive ability's bot hint must be 'never'`);
  if (hint.use === 'hold') check(activation === 'placeable' || activation === 'toggle', `${p}: bot hint 'hold' needs a placeable or toggle`);
  if (hint.use === 'support') check(kinds.has('heal') || kinds.has('shield'), `${p}: bot hint 'support' needs a heal or shield effect`);
  if (hint.use === 'scout') check(kinds.has('reveal'), `${p}: bot hint 'scout' needs a reveal effect`);
  if ('healthBelow' in hint) check(hint.healthBelow > 0 && hint.healthBelow <= 1, `${p}: bot hint healthBelow in (0, 1]`);
  if ('maxRangeM' in hint && hint.maxRangeM !== undefined) check(hint.maxRangeM > 0, `${p}: bot hint maxRangeM > 0`);
}

function validateAbility(a: AbilityDef, check: Check): void {
  const p = `ability '${a.id}'`;
  const passive = a.activation.kind === 'passive';
  check(a.effects.length > 0, `${p}: at least one effect`);
  check(passive === (a.resource.kind === 'none'), `${p}: resource 'none' exactly for passive abilities`);
  check(a.budgetCost >= 0, `${p}: budgetCost ≥ 0`);
  const r = a.resource;
  if (r.kind === 'cooldown') check(r.cooldown >= 0, `${p}: cooldown ≥ 0`);
  if (r.kind === 'charges') check(r.maxCharges >= 1 && r.rechargeTime > 0, `${p}: charges ≥ 1, recharge > 0`);
  if (r.kind === 'uses') check(r.usesPerRound >= 1, `${p}: usesPerRound ≥ 1`);
  validateActivation(a.activation, p, check);
  for (const e of a.effects) validateEffect(e, passive, p, check);
  // ADR-0012 §3.5: the gadget *is* a barrier, so a barrier needs a floor placeable without a
  // trigger — and a gadget without a trigger does nothing unless it is a barrier.
  const barrier = a.effects.some((e) => e.kind === 'barrier');
  const act = a.activation;
  if (barrier) {
    check(act.kind === 'placeable' && act.surface === 'floor' && act.trigger.kind === 'none', `${p}: a barrier needs a placeable activation with surface 'floor' and trigger 'none'`);
  }
  if (act.kind === 'placeable' && act.trigger.kind === 'none') check(barrier, `${p}: trigger 'none' only with a barrier effect`);
  validateBotHint(a, a.bot, p, check);
}

function validateOperator(o: OperatorDef, check: Check): void {
  const p = `operator '${o.id}'`;
  check(o.maxHealth > 0, `${p}: maxHealth > 0`);
  check(o.armour >= 0 && o.armour <= 0.5, `${p}: armour in [0, 0.5]`);
  check(o.moveSpeed > 0 && o.sprintMultiplier >= 1 && o.acceleration > 0, `${p}: speed, sprint ≥ 1, acceleration`);
  check(o.crouchSpeed > 0 && o.crouchSpeed <= o.moveSpeed, `${p}: 0 < crouchSpeed ≤ moveSpeed`);
  check(o.jumpHeight > 0 && o.adsMovePenalty > 0 && o.adsMovePenalty <= 1, `${p}: jumpHeight, adsMovePenalty`);
  check(o.abilitySlots === o.abilities.length, `${p}: abilitySlots matches ability count`);
  check(o.loadout.primary.length > 0 && o.loadout.secondary.length > 0, `${p}: primary and secondary weapons`);
  check(profilesById.has(o.hitboxProfile), `${p}: unknown hitbox profile '${o.hitboxProfile}'`);
  for (const id of o.abilities) check(abilitiesById.has(id), `${p}: unknown ability '${id}'`);
  for (const id of [...o.loadout.primary, ...o.loadout.secondary]) check(weaponsById.has(id), `${p}: unknown weapon '${id}'`);
}

// NEW — straight-line distance between two data points (nav link lengths, spawn snapping); the
// sim's distance() works on Vec3 objects and src/data does not import src/sim.
const tupleDistance = (a: Vec3Tuple, b: Vec3Tuple): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Level-scoped check helpers shared by the level validators. */
interface LevelChecks {
  p: string;
  check: Check;
  inside: (position: Vec3Tuple, what: string) => void;
  unique: (ids: readonly string[], what: string) => void;
}

/** Node ids reachable from `start` along directed edges. */
function reachable(edges: ReadonlyMap<string, readonly string[]>, start: string): Set<string> {
  const seen = new Set([start]);
  const queue = [start];
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    for (const next of edges.get(id) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

// NEW — waypoint-graph rules (ADR-0011 §5). The physical checks (ground under every node, every
// link clear) need Rapier and live in tests/unit/nav.test.ts.
function validateNav(l: LevelDef, nav: NavGraphDef, { p, check, inside, unique }: LevelChecks): void {
  const ids = nav.nodes.map((n) => n.id);
  unique(ids, 'nav node');
  const byId = new Map(nav.nodes.map((n) => [n.id, n] as const));
  for (const n of nav.nodes) {
    inside(n.pos, `nav node '${n.id}'`);
    if (n.tags?.includes('hold')) check(n.watchYawDeg !== undefined, `${p}: hold node '${n.id}' needs watchYawDeg`);
  }

  // Directed edges: a two-way link counts in both directions, a oneWay link only from → to.
  const forward = new Map<string, string[]>();
  const backward = new Map<string, string[]>();
  const addEdge = (from: string, to: string): void => {
    forward.set(from, [...(forward.get(from) ?? []), to]);
    backward.set(to, [...(backward.get(to) ?? []), from]);
  };
  const pairs = new Set<string>();
  for (const k of nav.links) {
    const name = `nav link '${k.from}' → '${k.to}'`;
    const a = byId.get(k.from);
    const b = byId.get(k.to);
    check(a !== undefined && b !== undefined, `${p}: ${name} references an unknown node`);
    check(k.from !== k.to, `${p}: ${name} links a node to itself`);
    const pair = JSON.stringify([k.from, k.to].sort());
    check(!pairs.has(pair), `${p}: ${name} duplicates another link between the same nodes`);
    pairs.add(pair);
    if (!a || !b) continue;
    check(tupleDistance(a.pos, b.pos) <= AI.nav.maxLinkM, `${p}: ${name} is longer than ${AI.nav.maxLinkM} m`);
    addEdge(k.from, k.to);
    if (!k.oneWay) addEdge(k.to, k.from);
  }

  // Strongly connected: every node reachable from the first one and able to get back to it, so
  // every node (spawns, sites) reaches every other one while honouring one-way links.
  const first = ids[0];
  if (first !== undefined) {
    const from = reachable(forward, first);
    const to = reachable(backward, first);
    const unreached = ids.filter((id) => !from.has(id));
    const stranded = ids.filter((id) => !to.has(id));
    check(unreached.length === 0, `${p}: nav nodes unreachable from '${first}': ${unreached.join(', ')}`);
    check(stranded.length === 0, `${p}: nav nodes without a way back to '${first}': ${stranded.join(', ')}`);
  }

  const snap = AI.nav.maxSpawnSnapM;
  for (const z of l.spawnZones ?? []) {
    z.points.forEach((pt, i) => {
      const nearest = Math.min(...nav.nodes.map((n) => tupleDistance(n.pos, pt.position)));
      check(nearest <= snap, `${p}: spawn point ${z.id}[${i}] is farther than ${snap} m from every nav node`);
    });
  }
  for (const s of l.sites ?? []) {
    check(nav.nodes.some((n) => insideSite(s, n.pos)), `${p}: site '${s.id}' contains no nav node`);
  }
}

function validateLevel(l: LevelDef, check: Check): void {
  const p = `level '${l.id}'`;
  for (const b of l.boxes) check(b.size.every((s) => s > 0), `${p}: box sizes must be > 0`);
  const extent = levelExtent(l);
  const inside = (position: Vec3Tuple, what: string): void =>
    check(insideExtent(extent, position), `${p}: ${what} lies outside the level geometry`);
  const unique = (ids: readonly string[], what: string): void => check(new Set(ids).size === ids.length, `${p}: ${what} ids must be unique`);

  inside(l.playerSpawn.position, 'player spawn');

  const zones = l.spawnZones ?? [];
  unique(zones.map((z) => z.id), 'spawn zone');
  if (zones.length) {
    for (const side of SIDES) check(zones.some((z) => z.side === side), `${p}: no spawn zone for side '${side}'`);
  }
  for (const z of zones) {
    check(z.points.length === MATCH.teamSize, `${p}: spawn zone '${z.id}' needs ${MATCH.teamSize} points`);
    for (const pt of z.points) inside(pt.position, `a spawn point of zone '${z.id}'`);
  }

  const sites = l.sites ?? [];
  unique(sites.map((s) => s.id), 'site');
  for (const s of sites) {
    check(s.size.every((v) => v > 0), `${p}: site '${s.id}' size must be > 0`);
    inside(s.center, `site '${s.id}'`);
  }

  (l.setupWalls ?? []).forEach((w, i) => {
    check(w.size.every((v) => v > 0), `${p}: setup wall ${i} size must be > 0`);
    inside(w.center, `setup wall ${i}`);
  });

  for (const d of l.range?.dummies ?? []) {
    check(operatorsById.has(d.operatorId), `${p}: dummy uses unknown operator '${d.operatorId}'`);
    inside(d.position, 'a dummy');
  }

  if (l.nav) validateNav(l, l.nav, { p, check, inside, unique });
}

function collectProblems(run: (check: Check) => void): string[] {
  const problems: string[] = [];
  run((ok, message) => {
    if (!ok) problems.push(message);
  });
  return problems;
}

/** Problems of a single level definition, registered or not (tests feed it broken copies). */
export const levelProblems = (l: LevelDef): string[] => collectProblems((check) => validateLevel(l, check));

/** Problems of a single ability definition, registered or not (tests feed it broken copies). */
export const abilityProblems = (a: AbilityDef): string[] => collectProblems((check) => validateAbility(a, check));

/** Returns every problem found; empty = valid. */
export function validateContent(): string[] {
  return collectProblems((check) => {
    WEAPONS.forEach((w) => validateWeapon(w, check));
    ABILITIES.forEach((a) => validateAbility(a, check));
    OPERATORS.forEach((o) => validateOperator(o, check));
    levelsById.forEach((l) => validateLevel(l, check));
    check(PLAYABLE_OPERATORS.length > 0, 'config: PLAYABLE_OPERATORS is empty');
    for (const id of PLAYABLE_OPERATORS) check(operatorsById.has(id), `config: unknown playable operator '${id}'`);
    check(weaponsById.has(BUDGET.reference.weaponId), `budget: unknown reference weapon '${BUDGET.reference.weaponId}'`);
    check(profilesById.has(BUDGET.reference.hitboxProfile), `budget: unknown reference hitbox profile`);
  });
}

export function assertValidContent(): void {
  const problems = validateContent();
  if (problems.length) throw new Error(`Invalid content:\n- ${problems.join('\n- ')}`);
}

export { ABILITIES, HITBOX_PROFILES, LEVELS, OPERATORS, WEAPONS };
