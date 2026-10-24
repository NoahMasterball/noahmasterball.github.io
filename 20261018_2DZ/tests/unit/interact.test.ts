import { describe, expect, it } from 'vitest';
import { LIQUID, PLAYER, TICK_RATE, WORLD } from '../../src/config/sim.ts';
import { BIOMES } from '../../src/data/biomes.ts';
import { NO_WALL, TILE_INDEX, WALL_DEFS, WALL_INDEX } from '../../src/data/content.ts';
import { ITEMS } from '../../src/data/items.ts';
import { RECIPES } from '../../src/data/recipes.ts';
import { TILES } from '../../src/data/tiles.ts';
import { RECIPE_IDS, type RecipeId, type TileId } from '../../src/data/schema.ts';
import { idx, liquidAt, setTile, tileAt } from '../../src/sim/grid.ts';
import { breakTile } from '../../src/sim/interact.ts';
import { countItem } from '../../src/sim/inventory.ts';
import { rollLoot } from '../../src/sim/loot.ts';
import type { ItemStack, SimState } from '../../src/sim/state.ts';
import { makeState } from './support/makeState.ts';
import { FLAT, aimAt, give, run, settle, ticksFor } from './playerHelpers.ts';

const EMPTY_SLOT = 9;

/** Holds primary on (x, y) until the tile is gone; returns the tick count (or Infinity). */
function mineTicks(s: SimState, x: number, y: number, limit: number): number {
  const before = tileAt(s.world, x, y);
  for (let t = 1; t <= limit; t++) {
    run(s, { primary: true, ...aimAt(x, y) }, 1);
    if (tileAt(s.world, x, y) !== before) return t;
  }
  return Infinity;
}

function expectedTicks(tile: TileId, speed: number): number {
  return ticksFor(TILES[tile].hardness / speed);
}

function toolSpeedOn(item: keyof typeof ITEMS, tile: TileId): number {
  const t = ITEMS[item].tool;
  const def = TILES[tile];
  return t && (def.tool === 'any' || def.tool === t.kind) ? t.speed : PLAYER.handMiningSpeed;
}

function floorWith(ch: string, x: number): string[] {
  const rows = [...FLAT];
  rows[6] = '.'.repeat(x) + ch + '.'.repeat(19 - x);
  return rows;
}

describe('interact: mining', () => {
  it('mines dirt by hand in about hardness / hand speed seconds', () => {
    expect(TILES.dirt.minPower).toBeLessThanOrEqual(PLAYER.handMiningPower);
    const s = makeState(floorWith('d', 4));
    settle(s);
    s.player.hotbar = EMPTY_SLOT;
    const n = mineTicks(s, 4, 6, TICK_RATE * 30);
    expect(tileAt(s.world, 4, 6)).toBe(TILE_INDEX.air);
    expect(Math.abs(n - expectedTicks('dirt', PLAYER.handMiningSpeed))).toBeLessThanOrEqual(1);
    expect(s.world.mining.size).toBe(0);
  });

  it('stone needs enough tool power; a pickaxe mines it at its speed', () => {
    const hand = makeState(floorWith('#', 4));
    settle(hand);
    hand.player.hotbar = EMPTY_SLOT;
    const byHand = mineTicks(hand, 4, 6, TICK_RATE * 10);
    if (TILES.stone.minPower > PLAYER.handMiningPower) expect(byHand).toBe(Infinity);
    else expect(byHand).toBeLessThan(Infinity);

    const s = makeState(floorWith('#', 4));
    settle(s);
    give(s, EMPTY_SLOT, 'pickaxe_iron', 1);
    s.player.hotbar = EMPTY_SLOT;
    const n = mineTicks(s, 4, 6, TICK_RATE * 30);
    expect(Math.abs(n - expectedTicks('stone', toolSpeedOn('pickaxe_iron', 'stone')))).toBeLessThanOrEqual(1);
  });

  it('mining progress resets after a pause', () => {
    const s = makeState(floorWith('d', 4));
    settle(s);
    s.player.hotbar = EMPTY_SLOT;
    run(s, { primary: true, ...aimAt(4, 6) }, 3);
    expect(s.world.mining.get(idx(s.world, 4, 6))?.progress ?? 0).toBeGreaterThan(0);
    run(s, {}, ticksFor(3));
    expect(s.world.mining.size).toBe(0);
  });

  it.runIf(TILES.dirt.drop !== null)('a mined tile drops its item and the player picks it up', () => {
    const s = makeState(floorWith('d', 4));
    settle(s);
    s.player.hotbar = EMPTY_SLOT;
    const drop = TILES.dirt.drop;
    if (!drop) return;
    const before = countItem(s.player.inventory, drop);
    mineTicks(s, 4, 6, TICK_RATE * 30);
    run(s, {}, TICK_RATE * 2);
    expect(countItem(s.player.inventory, drop)).toBe(before + 1);
  });

  it('out of reach does nothing', () => {
    const s = makeState(floorWith('d', 15));
    settle(s);
    s.player.hotbar = EMPTY_SLOT;
    expect(mineTicks(s, 15, 6, TICK_RATE * 3)).toBe(Infinity);
  });

  it('breaking a container drops its contents and removes the inventory', () => {
    const s = makeState(floorWith('c', 15));
    const i = idx(s.world, 15, 6);
    s.containers.set(i, { slots: [{ item: 'bandage', count: 3 }, null] });
    breakTile(s, 15, 6);
    expect(s.containers.has(i)).toBe(false);
    expect(s.drops.some((d) => d.stack.item === 'bandage' && d.stack.count === 3)).toBe(true);
    expect(s.events.some((e) => e.type === 'tileBroken')).toBe(true);
  });
});

/** Item → total count. */
function totals(stacks: readonly ItemStack[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const st of stacks) m.set(st.item, (m.get(st.item) ?? 0) + st.count);
  return m;
}

describe('interact: pickaxe vs punch', () => {
  it('mining with a pickaxe never swings (no melee events), also the ticks after the block broke', () => {
    const s = makeState(floorWith('d', 4));
    settle(s);
    give(s, EMPTY_SLOT, 'pickaxe_iron', 1);
    s.player.hotbar = EMPTY_SLOT;
    let melee = 0;
    let hits = 0;
    for (let t = 0; t < TICK_RATE * 2; t++) {
      run(s, { primary: true, ...aimAt(4, 6) }, 1);
      melee += s.events.filter((e) => e.type === 'melee').length;
      hits += s.events.filter((e) => e.type === 'tileHit').length;
    }
    expect(tileAt(s.world, 4, 6)).toBe(TILE_INDEX.air);
    expect(hits).toBeGreaterThan(0);
    expect(melee).toBe(0);
  });

  it('bare hands punch only when nothing minable is at the cursor', () => {
    const s = makeState(floorWith('d', 4));
    settle(s);
    s.player.hotbar = EMPTY_SLOT;
    run(s, { primary: true, ...aimAt(4, 6) }, 1);
    expect(s.events.some((e) => e.type === 'melee')).toBe(false);
    expect(s.events.some((e) => e.type === 'tileHit')).toBe(true);
    run(s, {}, 1);
    run(s, { primary: true, ...aimAt(4, 3) }, 1); // empty air, no wall
    expect(s.events.some((e) => e.type === 'melee')).toBe(true);
  });
});

describe('interact: scrap piles and walls', () => {
  it('a scrap pile rolls the ground-loot table of the biome it lies in', () => {
    // cavesDepth below the generated surface the cell is in the 'caves' layer, whose table
    // differs from the surface one, so this also proves the roll is biome-local.
    const cave = BIOMES.caves.groundLoot.table;
    expect(cave).not.toBe(BIOMES.plains.groundLoot.table);
    let checked = 0;
    for (let seed = 1; seed <= 40 && checked < 5; seed++) {
      const s = makeState(FLAT, { seed });
      setTile(s.world, 10, 6, TILE_INDEX.scrap_pile);
      s.world.surfaceY[10] = 6 - WORLD.cavesDepth;
      const expected = rollLoot({ ...s.rng }, cave);
      if (expected.length === 0) continue;
      breakTile(s, 10, 6);
      expect(totals(s.drops.map((d) => d.stack))).toEqual(totals(expected));
      checked++;
    }
    expect(checked).toBe(5);
  });

  it('places a wall item on the background; mining it emits wallBroken and drops WallDef.drop', () => {
    const s = makeState(FLAT);
    settle(s);
    give(s, EMPTY_SLOT, 'wood_wall', 3);
    s.player.hotbar = EMPTY_SLOT;
    run(s, { secondary: true, ...aimAt(4, 6) }, 1);
    expect(s.world.wall[idx(s.world, 4, 6)]).toBe(WALL_INDEX.wood_wall);
    expect(countItem(s.player.inventory, 'wood_wall')).toBe(2);
    run(s, {}, ticksFor(0.5));
    let broken = false;
    for (let t = 0; t < TICK_RATE * 10 && !broken; t++) {
      run(s, { primary: true, ...aimAt(4, 6) }, 1);
      broken = s.events.some((e) => e.type === 'wallBroken' && e.x === 4 && e.y === 6 && e.wall === WALL_INDEX.wood_wall);
    }
    expect(broken).toBe(true);
    expect(s.world.wall[idx(s.world, 4, 6)]).toBe(NO_WALL);
    const drop = WALL_DEFS[WALL_INDEX.wood_wall]?.drop;
    expect(drop && s.drops.some((d) => d.stack.item === drop)).toBe(true);
  });

  it('every wall item is crafted 1:1 from the block its wall drops (no duplication loop)', () => {
    for (const id of RECIPE_IDS) {
      const recipe = RECIPES[id as RecipeId];
      const wall = ITEMS[recipe.output.item].placesWall;
      if (!wall) continue;
      const drop = WALL_DEFS[WALL_INDEX[wall]]?.drop;
      expect(recipe.output.count, id).toBe(1);
      expect(recipe.inputs, id).toEqual([{ item: drop, count: 1 }]);
    }
  });
});

describe('interact: placing', () => {
  it('player-placed tiles set the placed bit; generated ones do not', () => {
    const s = makeState(FLAT);
    settle(s);
    give(s, EMPTY_SLOT, 'dirt', 10);
    s.player.hotbar = EMPTY_SLOT;
    run(s, { secondary: true, ...aimAt(4, 6) }, 1);
    expect(s.world.placed[idx(s.world, 4, 6)]).toBe(1);
    expect(s.world.placed[idx(s.world, 5, 7)]).toBe(0);
  });

  it('needs a neighbour and must not overlap the player', () => {
    const s = makeState(FLAT);
    settle(s);
    give(s, EMPTY_SLOT, 'dirt', 10);
    s.player.hotbar = EMPTY_SLOT;
    run(s, { secondary: true, ...aimAt(5, 2) }, 1); // floating
    expect(tileAt(s.world, 5, 2)).toBe(TILE_INDEX.air);
    run(s, { secondary: true, ...aimAt(1, 6) }, 1); // inside the player
    expect(tileAt(s.world, 1, 6)).toBe(TILE_INDEX.air);
    run(s, { secondary: true, ...aimAt(4, 6) }, 1); // on the floor
    expect(tileAt(s.world, 4, 6)).toBe(TILE_INDEX.dirt);
    expect(countItem(s.player.inventory, 'dirt')).toBe(9);
    // held: the place cooldown limits the rate
    run(s, { secondary: true, ...aimAt(5, 6) }, 1);
    expect(tileAt(s.world, 5, 6)).toBe(TILE_INDEX.air);
    run(s, { secondary: true, ...aimAt(5, 6) }, ticksFor(0.2));
    expect(tileAt(s.world, 5, 6)).toBe(TILE_INDEX.dirt);
  });

  it('placing a chest creates its container', () => {
    const s = makeState(FLAT);
    settle(s);
    give(s, EMPTY_SLOT, 'chest', 1);
    s.player.hotbar = EMPTY_SLOT;
    run(s, { secondary: true, ...aimAt(4, 6) }, 1);
    expect(tileAt(s.world, 4, 6)).toBe(TILE_INDEX.chest);
    expect(s.containers.get(idx(s.world, 4, 6))?.slots.length).toBe(TILES.chest.containerSlots);
  });
});

/** FLAT with a 3-cell door at column x standing on the floor (rows 4..6). */
function tallDoor(x: number): string[] {
  const rows = [...FLAT];
  for (const r of [4, 5, 6]) rows[r] = '.'.repeat(x) + 'D' + '.'.repeat(19 - x);
  return rows;
}

function doorCells(s: SimState, x: number): number[] {
  return [4, 5, 6].map((y) => tileAt(s.world, x, y));
}

const OPEN3 = [TILE_INDEX.door_open, TILE_INDEX.door_open, TILE_INDEX.door_open];
const CLOSED3 = [TILE_INDEX.door, TILE_INDEX.door, TILE_INDEX.door];

describe('interact: tall doors', () => {
  it('toggling any cell opens/closes the whole 3-cell run', () => {
    const s = makeState(tallDoor(4));
    settle(s);
    run(s, { secondary: true, ...aimAt(4, 4) }, 1);
    expect(doorCells(s, 4)).toEqual(OPEN3);
    run(s, {}, 1);
    run(s, { secondary: true, ...aimAt(4, 6) }, 1);
    expect(doorCells(s, 4)).toEqual(CLOSED3);
  });

  it('closing is refused while a body overlaps any cell of the run', () => {
    const s = makeState(tallDoor(4));
    settle(s);
    run(s, { secondary: true, ...aimAt(4, 5) }, 1);
    run(s, {}, 1);
    // A drop in the bottom cell only blocks closing from the top cell.
    s.drops.push({
      id: 99,
      body: { x: 4.3, y: 6.5, w: 0.4, h: 0.4, vx: 0, vy: 0, onGround: true, inLiquid: false, fallSpeed: 0 },
      stack: { item: 'dirt', count: 1 },
      age: 0,
    });
    run(s, { secondary: true, ...aimAt(4, 4) }, 1);
    expect(doorCells(s, 4)).toEqual(OPEN3);
    s.drops.length = 0;
    run(s, {}, 1);
    run(s, { secondary: true, ...aimAt(4, 4) }, 1);
    expect(doorCells(s, 4)).toEqual(CLOSED3);
  });

  it('toggling keeps the placed bit of player-built door cells', () => {
    const s = makeState(tallDoor(4));
    settle(s);
    for (const y of [4, 5, 6]) setTile(s.world, 4, y, TILE_INDEX.door, true);
    run(s, { secondary: true, ...aimAt(4, 5) }, 1);
    expect(doorCells(s, 4)).toEqual(OPEN3);
    expect([4, 5, 6].map((y) => s.world.placed[idx(s.world, 4, y)])).toEqual([1, 1, 1]);
  });
});

describe('interact: doors, containers, buckets', () => {
  it('toggles a door on press (edge) and cannot close it on a body', () => {
    const s = makeState(floorWith('D', 4));
    settle(s);
    run(s, { secondary: true, ...aimAt(4, 6) }, 1);
    expect(tileAt(s.world, 4, 6)).toBe(TILE_INDEX.door_open);
    run(s, { secondary: true, ...aimAt(4, 6) }, 30);
    expect(tileAt(s.world, 4, 6)).toBe(TILE_INDEX.door_open);
    run(s, {}, 1);
    s.player.body.x = 3.8;
    run(s, { secondary: true, ...aimAt(4, 6) }, 1);
    expect(tileAt(s.world, 4, 6)).toBe(TILE_INDEX.door_open);
    run(s, {}, 1);
    s.player.body.x = 1;
    run(s, { secondary: true, ...aimAt(4, 6) }, 1);
    expect(tileAt(s.world, 4, 6)).toBe(TILE_INDEX.door);
  });

  it('opens a container, quick-moves into it and closes when walking away', () => {
    const s = makeState(floorWith('c', 4));
    settle(s);
    run(s, { secondary: true, ...aimAt(4, 6) }, 1);
    const i = idx(s.world, 4, 6);
    expect(s.player.openContainer).toBe(i);
    const torches = countItem(s.player.inventory, 'torch');
    run(s, { controls: [{ type: 'quickMove', from: { where: 'player', slot: 2 } }] }, 1);
    const inv = s.containers.get(i);
    if (!inv) throw new Error('container missing');
    expect(countItem(inv, 'torch')).toBe(torches);
    expect(countItem(s.player.inventory, 'torch')).toBe(0);
    run(s, { controls: [{ type: 'quickMove', from: { where: 'container', slot: 0 } }] }, 1);
    expect(countItem(s.player.inventory, 'torch')).toBe(torches);
    s.player.body.x = 17;
    run(s, {}, 1);
    expect(s.player.openContainer).toBe(-1);
  });

  it('bucket scoops a full cell and pours it back', () => {
    const rows = [...FLAT];
    rows[7] = '#####~##############';
    rows.push('####################');
    const s = makeState(rows);
    settle(s);
    give(s, EMPTY_SLOT, 'bucket', 1);
    s.player.hotbar = EMPTY_SLOT;
    run(s, { secondary: true, ...aimAt(5, 7) }, 1);
    expect(liquidAt(s.world, 5, 7)).toBe(0);
    expect(s.player.inventory.slots[EMPTY_SLOT]?.item).toBe('bucket_water');
    run(s, {}, 1);
    run(s, { secondary: true, ...aimAt(5, 7) }, 1);
    expect(liquidAt(s.world, 5, 7)).toBe(LIQUID.max);
    expect(s.player.inventory.slots[EMPTY_SLOT]?.item).toBe('bucket');
  });
});

describe('interact: using items', () => {
  it('eating restores hunger after the use time; releasing early cancels', () => {
    const s = makeState(FLAT);
    settle(s);
    s.player.hotbar = 3;
    expect(s.player.inventory.slots[3]?.item).toBe('canned_food');
    const food = ITEMS.canned_food.consumable;
    if (!food) throw new Error('canned_food is not consumable');
    s.player.hunger = 50;
    run(s, { primary: true }, ticksFor(food.useTime / 2));
    run(s, {}, 1);
    expect(countItem(s.player.inventory, 'canned_food')).toBe(2);
    run(s, { primary: true }, ticksFor(food.useTime) + 1);
    expect(countItem(s.player.inventory, 'canned_food')).toBe(1);
    expect(s.player.hunger).toBeGreaterThan(50 + (food.hunger ?? 0) - 1);
  });

  it('a gun needs ammo and consumes one round per shot', () => {
    const s = makeState(FLAT);
    settle(s);
    give(s, EMPTY_SLOT, 'pistol', 1);
    s.player.hotbar = EMPTY_SLOT;
    run(s, { primary: true, aimX: 15, aimY: 5 }, 1);
    expect(s.player.useCooldown).toBe(0);
    give(s, 8, 'ammo_9mm', 5);
    run(s, { primary: true, aimX: 15, aimY: 5 }, 2);
    expect(countItem(s.player.inventory, 'ammo_9mm')).toBe(4);
    expect(s.player.useCooldown).toBeGreaterThan(0);
  });

  it('a melee weapon swings with its cooldown', () => {
    const s = makeState(FLAT);
    settle(s);
    s.player.hotbar = 0;
    const knife = ITEMS.kitchen_knife.melee;
    if (!knife) throw new Error('knife has no melee stats');
    run(s, { primary: true, aimX: 15, aimY: 5 }, 1);
    expect(s.player.useCooldown).toBeCloseTo(knife.cooldown, 5);
  });
});
