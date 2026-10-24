import type { RecoilDef } from '../../data/schema.ts';

// NEW — recoil pattern lookup (ADR-0009). Deterministic per shot index, looping from `loopFrom`.

/** [pitch°, yaw°] kick for the given shot index. */
export function recoilKick(r: RecoilDef, shotIndex: number): readonly [number, number] {
  const n = r.pattern.length;
  const i = shotIndex < n ? shotIndex : r.loopFrom + ((shotIndex - n) % (n - r.loopFrom));
  const kick = r.pattern[i];
  if (!kick) throw new Error(`Recoil pattern index ${i} out of range`);
  return kick;
}
