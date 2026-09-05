import {
  DynamicDrawUsage,
  Euler,
  InstancedMesh,
  Matrix4,
  Mesh,
  Object3D,
  Quaternion,
  Vector3,
} from 'three';
import { AMBIENT } from '../config';
import type { KitLibrary } from './kit';

// NEW — GPU instancing for repeated kit pieces (spec §3/§7: "repeated props
// instanced"). KitLibrary clones stay for one-offs; anything placed many times
// (scatter dressing, path stones, silhouette tree rings) goes through this pool.

/** Sway oscillation angle (SSOT — instanced pool and cloned hero trees). */
export function swayAngle(elapsed: number, phase: number, amp: number): number {
  return Math.sin(elapsed * AMBIENT.swayFrequency + phase) * amp;
}

export interface InstanceAddOptions {
  position: [number, number, number];
  /** Rotation around Y in radians. */
  rotationY?: number;
  /** Uniform scale factor. */
  scale?: number;
  castShadow?: boolean;
  /** Per-instance wind sway — its matrix is re-composed every frame. */
  sway?: { phase: number; amp: number };
}

interface Registration {
  x: number;
  y: number;
  z: number;
  rotationY: number;
  scale: number;
  sway?: { phase: number; amp: number };
}

interface MeshEntry {
  inst: InstancedMesh;
  /** Source mesh transform relative to the kit piece root. */
  rel: Matrix4;
}

interface PieceGroup {
  name: string;
  castShadow: boolean;
  regs: Registration[];
  meshes: MeshEntry[];
}

const _pos = new Vector3();
const _quat = new Quaternion();
const _euler = new Euler();
const _scl = new Vector3();
const _base = new Matrix4();
const _final = new Matrix4();

/** Placement matrix — same transform order as a cloned Object3D (Euler 'XYZ'). */
function baseMatrix(reg: Registration, rotZ: number): Matrix4 {
  _pos.set(reg.x, reg.y, reg.z);
  _quat.setFromEuler(_euler.set(0, reg.rotationY, rotZ, 'XYZ'));
  _scl.setScalar(reg.scale);
  return _base.compose(_pos, _quat, _scl);
}

/**
 * Collects placements of kit pieces and renders each unique piece as one
 * InstancedMesh per source mesh (usually one draw call per piece instead of
 * one per placement). Register synchronously via add(), then build() once.
 */
export class InstancePool {
  private readonly groups = new Map<string, PieceGroup>();
  private readonly swayRefs: { group: PieceGroup; index: number }[] = [];
  private dynamicGroups: PieceGroup[] = [];

  constructor(private readonly kit: KitLibrary) {}

  add(name: string, opts: InstanceAddOptions): void {
    const castShadow = opts.castShadow ?? true;
    const key = `${name}|${castShadow ? 1 : 0}`;
    let group = this.groups.get(key);
    if (!group) {
      group = { name, castShadow, regs: [], meshes: [] };
      this.groups.set(key, group);
    }
    const reg: Registration = {
      x: opts.position[0],
      y: opts.position[1],
      z: opts.position[2],
      rotationY: opts.rotationY ?? 0,
      scale: opts.scale ?? 1,
    };
    if (opts.sway) {
      reg.sway = opts.sway;
      this.swayRefs.push({ group, index: group.regs.length });
    }
    group.regs.push(reg);
  }

  /** Loads each unique piece once and adds the instanced meshes to `parent`. */
  async build(parent: Object3D): Promise<void> {
    await Promise.all(
      [...this.groups.values()].map(async (group) => {
        const gltf = await this.kit.source(group.name);
        const root = gltf.scene;
        root.updateMatrixWorld(true);
        const rootInv = root.matrixWorld.clone().invert();
        const dynamic = group.regs.some((r) => r.sway);
        root.traverse((child) => {
          const src = child as Mesh;
          if (!src.isMesh) return;
          const rel = new Matrix4().multiplyMatrices(rootInv, src.matrixWorld);
          const inst = new InstancedMesh(src.geometry, src.material, group.regs.length);
          if (dynamic) inst.instanceMatrix.setUsage(DynamicDrawUsage);
          inst.castShadow = group.castShadow;
          inst.receiveShadow = true;
          group.regs.forEach((reg, i) => {
            inst.setMatrixAt(i, _final.multiplyMatrices(baseMatrix(reg, 0), rel));
          });
          group.meshes.push({ inst, rel });
          parent.add(inst);
        });
      }),
    );
    this.dynamicGroups = [...this.groups.values()].filter((g) => g.regs.some((r) => r.sway));
  }

  /** Re-composes the matrices of swaying instances. */
  update(elapsed: number): void {
    for (const { group, index } of this.swayRefs) {
      const reg = group.regs[index]!;
      const sway = reg.sway!;
      baseMatrix(reg, swayAngle(elapsed, sway.phase, sway.amp));
      for (const entry of group.meshes) {
        entry.inst.setMatrixAt(index, _final.multiplyMatrices(_base, entry.rel));
      }
    }
    for (const group of this.dynamicGroups) {
      for (const entry of group.meshes) entry.inst.instanceMatrix.needsUpdate = true;
    }
  }
}
