// OWNER: agent "player" (C). Using the held item: mine, place, attack, consume, buckets,
// open containers, toggle doors.
import { DT, LIQUID, MINING, PLAYER, TICK_RATE } from '../config/sim.ts';
import { AIR, NO_WALL, TILE_INDEX, WALL_DEFS, WALL_INDEX, tileDef } from '../data/content.ts';
import { BIOMES } from '../data/biomes.ts';
import { ITEMS } from '../data/items.ts';
import type { ItemDef, MeleeStats } from '../data/schema.ts';
import { biomeAt } from './biome.ts';
import { emitNoise, fireRanged, meleeAttack } from './combat.ts';
import type { PlayerCommand } from './commands.ts';
import { bodyCentreX, bodyCentreY, spawnDrop } from './drops.ts';
import { idx, inBounds, liquidAt, setLiquid, setTile, setWall, tileAt, xOf, yOf } from './grid.ts';
import { addItem, countItem, createInventory, removeItem, takeAll, takeFromSlot } from './inventory.ts';
import { rollLoot } from './loot.ts';
import type { Body, ItemStack, Player, SimState, WorldGrid } from './state.ts';

const DOOR = TILE_INDEX.door;
const DOOR_OPEN = TILE_INDEX.door_open;
/** Loose loot: breaking one rolls the local biome's BiomeDef.groundLoot table (not TileDef.drop). */
const SCRAP_PILE = TILE_INDEX.scrap_pile;
const HIT_TICKS = Math.max(1, Math.round(MINING.hitInterval * TICK_RATE));
const HAND_MELEE: MeleeStats = {
  damage: PLAYER.handDamage,
  range: PLAYER.handRange,
  cooldown: PLAYER.handCooldown,
  knockback: PLAYER.handKnockback,
};


// ── geometry ─────────────────────────────────────────────────────────────────

/** True if the centre of cell (x, y) is within `range` of the player's body centre. */
export function cellInRange(p: Player, x: number, y: number, range: number): boolean {
  return Math.hypot(x + 0.5 - bodyCentreX(p.body), y + 0.5 - bodyCentreY(p.body)) <= range;
}

function bodyOverlapsCell(b: Body, x: number, y: number): boolean {
  return b.x < x + 1 && b.x + b.w > x && b.y < y + 1 && b.y + b.h > y;
}

/** True if the player, a zombie or a drop overlaps cell (x, y). */
export function anyBodyInCell(state: SimState, x: number, y: number): boolean {
  if (!state.player.dead && bodyOverlapsCell(state.player.body, x, y)) return true;
  if (state.zombies.some((z) => bodyOverlapsCell(z.body, x, y))) return true;
  return state.drops.some((d) => bodyOverlapsCell(d.body, x, y));
}

// ── mining ───────────────────────────────────────────────────────────────────

function decayMining(world: WorldGrid): void {
  for (const [i, m] of world.mining) {
    m.idle += DT;
    if (m.idle >= MINING.progressResetSeconds) world.mining.delete(i);
  }
}

/** Adds mining work to cell (x, y); emits periodic tileHit + noise. Returns true when finished. */
function addMiningWork(state: SimState, x: number, y: number, tile: number, hardness: number, rate: number): boolean {
  const w = state.world;
  const i = idx(w, x, y);
  let m = w.mining.get(i);
  const fresh = !m;
  if (!m) {
    m = { progress: 0, idle: 0 };
    w.mining.set(i, m);
  }
  m.idle = 0;
  m.progress = hardness > 0 ? m.progress + (rate * DT) / hardness : 1;
  if (fresh || state.tick % HIT_TICKS === 0) {
    state.events.push({ type: 'tileHit', x, y, tile });
    emitNoise(state, x + 0.5, y + 0.5, MINING.noiseLoudness);
  }
  if (m.progress < 1) return false;
  w.mining.delete(i);
  return true;
}

/** What breaking `tile` at (x, y) yields: the biome's ground loot for scrap piles, else TileDef.drop. */
function tileYield(state: SimState, x: number, y: number, tile: number): ItemStack[] {
  if (tile === SCRAP_PILE) return rollLoot(state.rng, BIOMES[biomeAt(state.world, x, y)].groundLoot.table);
  const drop = tileDef(tile).drop;
  return drop ? [{ item: drop, count: 1 }] : [];
}

/**
 * Removes the foreground tile at (x, y): drops its yield (tileYield) and any container contents,
 * deletes the container, emits 'tileBroken'. Shared by player mining (zombies may reuse it).
 */
export function breakTile(state: SimState, x: number, y: number): void {
  const w = state.world;
  const tile = tileAt(w, x, y);
  if (tile === AIR || !inBounds(w, x, y)) return;
  const i = idx(w, x, y);
  const yields = tileYield(state, x, y, tile);
  setTile(w, x, y, AIR);
  for (const stack of yields) spawnDrop(state, x + 0.5, y + 0.5, stack);
  const inv = state.containers.get(i);
  if (inv) {
    for (const stack of takeAll(inv)) spawnDrop(state, x + 0.5, y + 0.5, stack);
    state.containers.delete(i);
  }
  if (state.player.openContainer === i) state.player.openContainer = -1;
  state.events.push({ type: 'tileBroken', x, y, tile });
}

/** Mines (x, y) with the held item. Returns false when there is nothing to mine there. */
function mine(state: SimState, x: number, y: number, held: ItemDef | null): boolean {
  const w = state.world;
  const tile = tileAt(w, x, y);
  if (tile !== AIR) {
    const def = tileDef(tile);
    const tool = held?.tool;
    const power = tool ? tool.power : PLAYER.handMiningPower;
    if (power < def.minPower) return true;
    const rate = tool && (def.tool === 'any' || def.tool === tool.kind) ? tool.speed : PLAYER.handMiningSpeed;
    if (addMiningWork(state, x, y, tile, def.hardness, rate)) breakTile(state, x, y);
    return true;
  }
  const wall = w.wall[idx(w, x, y)] ?? NO_WALL;
  if (wall === NO_WALL) return false;
  if (addMiningWork(state, x, y, AIR, MINING.wallHardness, PLAYER.handMiningSpeed)) {
    setWall(w, x, y, NO_WALL);
    const drop = WALL_DEFS[wall]?.drop;
    if (drop) spawnDrop(state, x + 0.5, y + 0.5, { item: drop, count: 1 });
    state.events.push({ type: 'wallBroken', x, y, wall });
  }
  return true;
}

// ── primary: attack / consume / mine ─────────────────────────────────────────

function consume(state: SimState, held: ItemDef): void {
  const p = state.player;
  const c = held.consumable;
  if (!c) return;
  if (!p.using) {
    if (p.useCooldown > 0) return;
    p.using = { slot: p.hotbar, remaining: c.useTime };
  }
  p.using.remaining -= DT;
  if (p.using.remaining > 0) return;
  const stack = takeFromSlot(p.inventory, p.using.slot, 1);
  p.using = null;
  p.useCooldown = PLAYER.consumeCooldown;
  if (!stack) return;
  p.health = Math.max(0, Math.min(PLAYER.maxHealth, p.health + (c.health ?? 0)));
  p.hunger = Math.max(0, Math.min(PLAYER.maxHunger, p.hunger + (c.hunger ?? 0)));
  p.thirst = Math.max(0, Math.min(PLAYER.maxThirst, p.thirst + (c.thirst ?? 0)));
  state.events.push({ type: 'consumed', item: stack.item });
}

function usePrimary(state: SimState, cmd: PlayerCommand, held: ItemDef | null): void {
  const p = state.player;
  const cx = bodyCentreX(p.body);
  const cy = bodyCentreY(p.body);
  if (held?.melee) {
    if (p.useCooldown > 0) return;
    meleeAttack(state, cx, cy, p.facing, held.melee);
    p.useCooldown = held.melee.cooldown;
    return;
  }
  if (held?.ranged) {
    const r = held.ranged;
    if (p.useCooldown > 0 || countItem(p.inventory, r.ammo) < 1) return;
    removeItem(p.inventory, r.ammo, 1);
    fireRanged(state, cx, cy, cmd.aimX, cmd.aimY, r);
    p.useCooldown = r.cooldown;
    return;
  }
  if (held?.consumable) {
    consume(state, held);
    return;
  }
  const x = Math.floor(cmd.aimX);
  const y = Math.floor(cmd.aimY);
  const mined = inBounds(state.world, x, y) && cellInRange(p, x, y, PLAYER.reach) && mine(state, x, y, held);
  // A tool only mines: it never punches (not on empty cells, out of reach, or the tick after a
  // block broke while the button is still held). Anything else punches when nothing was minable.
  if (mined || held?.tool || p.useCooldown > 0) return;
  meleeAttack(state, cx, cy, p.facing, HAND_MELEE);
  p.useCooldown = HAND_MELEE.cooldown;
}

// ── secondary: open / toggle / bucket / place ────────────────────────────────

function hasNeighbour(w: WorldGrid, x: number, y: number): boolean {
  if ((w.wall[idx(w, x, y)] ?? NO_WALL) !== NO_WALL) return true;
  return tileAt(w, x - 1, y) !== AIR || tileAt(w, x + 1, y) !== AIR || tileAt(w, x, y - 1) !== AIR || tileAt(w, x, y + 1) !== AIR;
}

/** Replaces one of the held stack with `result` (buckets). */
function swapHeld(state: SimState, result: ItemDef['bucket']): void {
  if (!result) return;
  const p = state.player;
  const stack = p.inventory.slots[p.hotbar];
  if (!stack) return;
  if (stack.count === 1) {
    p.inventory.slots[p.hotbar] = { item: result.result, count: 1 };
    return;
  }
  takeFromSlot(p.inventory, p.hotbar, 1);
  const left = addItem(p.inventory, result.result, 1);
  if (left > 0) spawnDrop(state, bodyCentreX(p.body), bodyCentreY(p.body), { item: result.result, count: left });
}

function useBucket(state: SimState, x: number, y: number, held: ItemDef): void {
  const w = state.world;
  const b = held.bucket;
  if (!b) return;
  if (b.action === 'take') {
    if (liquidAt(w, x, y) < PLAYER.bucketMinFill * LIQUID.max) return;
    setLiquid(w, x, y, 0);
  } else {
    if (tileAt(w, x, y) !== AIR || liquidAt(w, x, y) >= LIQUID.max) return;
    setLiquid(w, x, y, LIQUID.max);
  }
  swapHeld(state, b);
  state.events.push({ type: 'splash', x: x + 0.5, y: y + 0.5 });
}

function place(state: SimState, x: number, y: number, held: ItemDef): void {
  const w = state.world;
  const p = state.player;
  const i = idx(w, x, y);
  if (held.places) {
    if (tileAt(w, x, y) !== AIR || !hasNeighbour(w, x, y)) return;
    const tile = TILE_INDEX[held.places];
    const def = tileDef(tile);
    if (def.solid && anyBodyInCell(state, x, y)) return;
    setTile(w, x, y, tile, true);
    if (def.containerSlots) state.containers.set(i, createInventory(def.containerSlots));
    state.events.push({ type: 'tilePlaced', x, y, tile });
  } else if (held.placesWall) {
    if ((w.wall[i] ?? NO_WALL) !== NO_WALL) return;
    const hasSupport = tileAt(w, x, y) !== AIR || hasNeighbour(w, x, y);
    if (!hasSupport) return;
    setWall(w, x, y, WALL_INDEX[held.placesWall]);
  } else {
    return;
  }
  takeFromSlot(p.inventory, p.hotbar, 1);
  p.useCooldown = MINING.placeCooldown;
}

function isDoor(tile: number): boolean {
  return tile === DOOR || tile === DOOR_OPEN;
}

/** Rows [top, bottom] of the contiguous vertical run of door cells (open or closed) through (x, y). */
function doorRun(w: WorldGrid, x: number, y: number): [top: number, bottom: number] {
  let top = y;
  let bottom = y;
  while (isDoor(tileAt(w, x, top - 1))) top--;
  while (isDoor(tileAt(w, x, bottom + 1))) bottom++;
  return [top, bottom];
}

/**
 * Opens or closes the whole door run through (x, y) (generated doors are several cells tall).
 * The clicked cell decides the direction; closing is refused while a body overlaps any cell.
 * Each cell keeps its `placed` bit (a player door stays player-placed).
 */
function toggleDoor(state: SimState, x: number, y: number): void {
  const w = state.world;
  const [top, bottom] = doorRun(w, x, y);
  const target = tileAt(w, x, y) === DOOR ? DOOR_OPEN : DOOR;
  if (target === DOOR) {
    for (let r = top; r <= bottom; r++) if (anyBodyInCell(state, x, r)) return;
  }
  for (let r = top; r <= bottom; r++) setTile(w, x, r, target, w.placed[idx(w, x, r)] === 1);
}

function useSecondary(state: SimState, cmd: PlayerCommand, pressed: boolean, held: ItemDef | null): void {
  const p = state.player;
  const w = state.world;
  const x = Math.floor(cmd.aimX);
  const y = Math.floor(cmd.aimY);
  if (!inBounds(w, x, y) || !cellInRange(p, x, y, PLAYER.reach)) return;
  const tile = tileAt(w, x, y);
  const def = tileDef(tile);
  if (def.containerSlots) {
    if (!pressed) return;
    const i = idx(w, x, y);
    if (!state.containers.has(i)) state.containers.set(i, createInventory(def.containerSlots));
    p.openContainer = i;
    return;
  }
  if (isDoor(tile)) {
    if (pressed) toggleDoor(state, x, y);
    return;
  }
  if (!held) return;
  if (held.bucket) {
    if (pressed) useBucket(state, x, y, held);
    return;
  }
  if (p.useCooldown > 0) return;
  place(state, x, y, held);
}

function closeContainerIfGone(state: SimState): void {
  const p = state.player;
  const c = p.openContainer;
  if (c < 0) return;
  const w = state.world;
  const x = xOf(w, c);
  const y = yOf(w, c);
  const isContainer = tileDef(tileAt(w, x, y)).containerSlots !== undefined;
  if (!isContainer || !cellInRange(p, x, y, PLAYER.reach * PLAYER.containerCloseFactor)) p.openContainer = -1;
}

export function useHeldItem(state: SimState, cmd: PlayerCommand): void {
  const p = state.player;
  decayMining(state.world);
  const pressedSecondary = cmd.secondary && !p.secondaryHeld;
  p.secondaryHeld = cmd.secondary;
  if (p.dead) {
    p.using = null;
    return;
  }
  closeContainerIfGone(state);
  const stack = p.inventory.slots[p.hotbar];
  const held = stack ? ITEMS[stack.item] : null;
  if (p.using && (!cmd.primary || p.using.slot !== p.hotbar || !held?.consumable)) p.using = null;
  if (cmd.primary) usePrimary(state, cmd, held);
  else if (cmd.secondary) useSecondary(state, cmd, pressedSecondary, held);
}
