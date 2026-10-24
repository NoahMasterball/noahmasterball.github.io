// Which biome a cell belongs to: the column's surface biome, replaced by the depth layers
// 'caves' / 'deep' below the generated surface. Shared by spawning, loot and the HUD.
import { WORLD } from '../config/sim.ts';
import { BIOME_INDEX } from '../data/content.ts';
import { BIOME_IDS, type BiomeId } from '../data/schema.ts';
import type { WorldGrid } from './state.ts';

export function biomeAt(world: WorldGrid, x: number, y: number): BiomeId {
  const cx = Math.max(0, Math.min(world.width - 1, Math.floor(x)));
  const depth = Math.floor(y) - (world.surfaceY[cx] ?? 0);
  if (depth >= WORLD.deepDepth) return 'deep';
  if (depth >= WORLD.cavesDepth) return 'caves';
  return BIOME_IDS[world.biome[cx] ?? BIOME_INDEX.plains] ?? 'plains';
}
