// OWNER: agent "worldgen" (A). Background wall definitions (visual / "indoors", never solid).
// Natural walls drop nothing (otherwise every cave would be an endless dirt/stone mine).
import type { WallDef, WallId } from './schema.ts';

export const WALLS: Record<WallId, WallDef> = {
  none: { name: 'Keine', drop: null, presentation: { color: 0x000000 } },
  dirt_wall: { name: 'Erdwand', drop: null, presentation: { color: 0x7e5a40 } },
  stone_wall: { name: 'Steinwand', drop: null, presentation: { color: 0x6a6a70 } },
  wood_wall: { name: 'Holzwand', drop: 'planks', presentation: { color: 0x6b4e30 } },
  brick_wall: { name: 'Ziegelwand', drop: 'brick', presentation: { color: 0x6a3428 } },
  concrete_wall: { name: 'Betonwand', drop: 'concrete', presentation: { color: 0x66665f } },
};
