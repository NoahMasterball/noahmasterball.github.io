import type { HitboxPartDef, HitboxProfileDef, HitboxShape } from './schema.ts';

// NEW — hitbox profiles (SSOT). One standard body (standing, 1.8 m, feet at y=0, facing −Z);
// slim/heavy are the same body scaled in width, so proportions stay identical and only the
// target size changes. Exposure (frontal area vs standard) is computed in src/balance/budget.ts.

const STANDARD_BODY: readonly HitboxPartDef[] = [
  { name: 'head', zone: 'head', shape: { kind: 'ball', radius: 0.12 }, center: [0, 1.62, 0] },
  { name: 'chest', zone: 'torso', shape: { kind: 'cuboid', halfExtents: [0.21, 0.2, 0.12] }, center: [0, 1.3, 0] },
  { name: 'pelvis', zone: 'torso', shape: { kind: 'cuboid', halfExtents: [0.18, 0.13, 0.11] }, center: [0, 0.97, 0] },
  { name: 'armL', zone: 'limb', shape: { kind: 'capsule', halfHeight: 0.2, radius: 0.06 }, center: [-0.29, 1.24, 0] },
  { name: 'armR', zone: 'limb', shape: { kind: 'capsule', halfHeight: 0.2, radius: 0.06 }, center: [0.29, 1.24, 0] },
  { name: 'legL', zone: 'limb', shape: { kind: 'capsule', halfHeight: 0.3, radius: 0.08 }, center: [-0.1, 0.46, 0] },
  { name: 'legR', zone: 'limb', shape: { kind: 'capsule', halfHeight: 0.3, radius: 0.08 }, center: [0.1, 0.46, 0] },
];

/** Scale the body's width/depth (not its height); the head keeps its size. */
function widenShape(shape: HitboxShape, factor: number): HitboxShape {
  switch (shape.kind) {
    case 'ball':
      return shape;
    case 'cuboid':
      return { kind: 'cuboid', halfExtents: [shape.halfExtents[0] * factor, shape.halfExtents[1], shape.halfExtents[2] * factor] };
    case 'capsule':
      return { kind: 'capsule', halfHeight: shape.halfHeight, radius: shape.radius * factor };
  }
}

function widened(id: string, factor: number): HitboxProfileDef {
  return {
    id,
    parts: STANDARD_BODY.map((p) => ({
      ...p,
      shape: widenShape(p.shape, factor),
      center: [p.center[0] * factor, p.center[1], p.center[2]] as const,
    })),
  };
}

export const HITBOX_PROFILES: readonly HitboxProfileDef[] = [
  widened('slim', 0.88),
  widened('standard', 1),
  widened('heavy', 1.18),
];
