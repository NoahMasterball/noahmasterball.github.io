import { BufferGeometry, Line3, Mesh, Object3D, Raycaster, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MeshBVH, acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';

// Register BVH-accelerated raycasting once, globally.
Mesh.prototype.raycast = acceleratedRaycast;
BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;

const DOWN = new Vector3(0, -1, 0);

/**
 * Static world collision: merges collision meshes into one BVH used for
 * ground snapping, camera occlusion, and capsule collide-and-slide.
 */
export class WorldCollider {
  private readonly mesh: Mesh;
  private readonly bvh: MeshBVH;
  private readonly raycaster = new Raycaster();
  /** Diagnostic: number of triangles in the merged collision mesh. */
  readonly triangleCount: number;

  constructor(sources: Object3D[]) {
    const geoms: BufferGeometry[] = [];
    const isExcluded = (obj: Object3D): boolean => {
      for (let o: Object3D | null = obj; o; o = o.parent) {
        if (o.userData['noCollide']) return true;
      }
      return false;
    };
    for (const root of sources) {
      root.updateWorldMatrix(true, true);
      root.traverse((obj) => {
        const m = obj as Mesh;
        if (!m.isMesh || !m.geometry || isExcluded(m)) return;
        const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
        // BVH merge needs identical attribute sets — keep position only.
        for (const name of Object.keys(g.attributes)) {
          if (name !== 'position') g.deleteAttribute(name);
        }
        g.morphAttributes = {};
        geoms.push(g.toNonIndexed());
      });
    }
    const merged = mergeGeometries(geoms, false);
    this.triangleCount = merged.attributes['position']!.count / 3;
    this.bvh = new MeshBVH(merged);
    merged.boundsTree = this.bvh;
    this.mesh = new Mesh(merged);
    this.raycaster.firstHitOnly = true;
  }

  /** Height of the ground under (x, z), cast from `fromY` downwards. Null if none. */
  groundHeight(x: number, fromY: number, z: number, maxDist = 50): number | null {
    this.raycaster.set(new Vector3(x, fromY, z), DOWN);
    this.raycaster.far = maxDist;
    const hit = this.raycaster.intersectObject(this.mesh, false)[0];
    return hit ? hit.point.y : null;
  }

  /** First hit along a ray (for camera occlusion). Returns distance or null. */
  rayDistance(origin: Vector3, dir: Vector3, maxDist: number): number | null {
    this.raycaster.set(origin, dir);
    this.raycaster.far = maxDist;
    const hit = this.raycaster.intersectObject(this.mesh, false)[0];
    return hit ? hit.distance : null;
  }

  /**
   * Capsule collide-and-slide (three-mesh-bvh shapecast pattern).
   * Mutates and returns `position` (capsule foot point).
   */
  collideCapsule(position: Vector3, radius: number, height: number): Vector3 {
    const segment = new Line3(
      new Vector3(position.x, position.y + radius, position.z),
      new Vector3(position.x, position.y + height - radius, position.z),
    );
    const tempVec = new Vector3();
    const tempVec2 = new Vector3();
    const delta = new Vector3();

    this.bvh.shapecast({
      intersectsBounds: (box) => {
        return box.distanceToPoint(segment.start) <= radius + segment.distance() ||
          box.distanceToPoint(segment.end) <= radius;
      },
      intersectsTriangle: (tri) => {
        const distance = tri.closestPointToSegment(segment, tempVec, tempVec2);
        if (distance < radius) {
          const depth = radius - distance;
          delta.copy(tempVec2).sub(tempVec).normalize();
          segment.start.addScaledVector(delta, depth);
          segment.end.addScaledVector(delta, depth);
        }
        return false;
      },
    });

    position.set(segment.start.x, segment.start.y - radius, segment.start.z);
    return position;
  }
}
