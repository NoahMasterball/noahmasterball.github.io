// OWNER: agent "player" (C). Recipe checks + execution (station proximity, input counts).
import { PLAYER } from '../config/sim.ts';
import { TILE_INDEX } from '../data/content.ts';
import { RECIPES } from '../data/recipes.ts';
import type { RecipeDef, RecipeId, TileId } from '../data/schema.ts';
import { bodyCentreX, bodyCentreY, spawnDrop } from './drops.ts';
import { tileAt } from './grid.ts';
import { addItem, countItem, removeItem } from './inventory.ts';
import type { SimState } from './state.ts';

/** True if a `station` tile's centre lies within PLAYER.reach × stationReachFactor of the player centre. */
export function stationInRange(state: SimState, station: TileId): boolean {
  const want = TILE_INDEX[station];
  const b = state.player.body;
  const cx = bodyCentreX(b);
  const cy = bodyCentreY(b);
  const r = PLAYER.reach * PLAYER.stationReachFactor;
  const x0 = Math.floor(cx - r);
  const x1 = Math.floor(cx + r);
  const y0 = Math.floor(cy - r);
  const y1 = Math.floor(cy + r);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (tileAt(state.world, x, y) !== want) continue;
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) return true;
    }
  }
  return false;
}

function hasInputs(state: SimState, def: RecipeDef): boolean {
  return def.inputs.every((i) => countItem(state.player.inventory, i.item) >= i.count);
}

/** True if the player has the inputs and (if required) a station tile within range. Used by UI. */
export function canCraft(state: SimState, recipe: RecipeId): boolean {
  const def = RECIPES[recipe];
  if (state.player.dead) return false;
  if (def.station && !stationInRange(state, def.station)) return false;
  return hasInputs(state, def);
}

/** Crafts up to `times` times; returns how many succeeded. Output that does not fit is dropped. Emits 'crafted'. */
export function craft(state: SimState, recipe: RecipeId, times: number): number {
  if (!canCraft(state, recipe)) return 0;
  const def = RECIPES[recipe];
  const p = state.player;
  let done = 0;
  let overflow = 0;
  while (done < times && hasInputs(state, def)) {
    for (const i of def.inputs) removeItem(p.inventory, i.item, i.count);
    overflow += addItem(p.inventory, def.output.item, def.output.count);
    done++;
  }
  if (overflow > 0) spawnDrop(state, bodyCentreX(p.body), bodyCentreY(p.body), { item: def.output.item, count: overflow });
  if (done > 0) state.events.push({ type: 'crafted', item: def.output.item, count: done * def.output.count });
  return done;
}
