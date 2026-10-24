import { Mesh, MeshBasicMaterial, PlaneGeometry, Vector3, type Scene } from 'three';
import { HUD } from '../../config/client.ts';
import type { Vec3 } from '../../sim/math.ts';

// NEW — bullet impact marks on level geometry (SPEC §11 hit feedback), recycled ring buffer.

const MARK_COLOR = 0x1a1a1a;
const SURFACE_OFFSET = 0.004;

export class ImpactMarks {
  private readonly marks: Mesh[] = [];
  private next = 0;

  constructor(scene: Scene) {
    const geometry = new PlaneGeometry(HUD.impactMarkSize, HUD.impactMarkSize);
    const material = new MeshBasicMaterial({ color: MARK_COLOR, polygonOffset: true, polygonOffsetFactor: -4 });
    for (let i = 0; i < HUD.maxImpactMarks; i++) {
      const mark = new Mesh(geometry, material);
      mark.visible = false;
      scene.add(mark);
      this.marks.push(mark);
    }
  }

  add(point: Vec3, normal: Vec3): void {
    const mark = this.marks[this.next];
    if (!mark) return;
    this.next = (this.next + 1) % this.marks.length;
    const n = new Vector3(normal.x, normal.y, normal.z);
    mark.position.set(point.x, point.y, point.z).addScaledVector(n, SURFACE_OFFSET);
    mark.lookAt(mark.position.clone().add(n));
    mark.visible = true;
  }
}
