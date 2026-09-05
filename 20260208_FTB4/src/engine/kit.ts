import { Mesh, Object3D, Scene, Vector3 } from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Assets } from './assets';

export interface PlaceOptions {
  position?: Vector3 | [number, number, number];
  /** Rotation around Y in radians. */
  rotationY?: number;
  /** Uniform factor or per-axis [x, y, z]. */
  scale?: number | [number, number, number];
  castShadow?: boolean;
  receiveShadow?: boolean;
}

/**
 * Loads modular kit pieces by name (cached — each piece's GLTF is fetched once
 * and cloned per placement) and places them in a scene.
 */
export class KitLibrary {
  private readonly cache = new Map<string, Promise<GLTF>>();

  constructor(
    private readonly assets: Assets,
    /** e.g. 'assets/models/medieval' */
    private readonly basePath: string,
    private readonly extension: string = '.gltf',
  ) {}

  /** Cached source GLTF of a piece (shared by clone placement and InstancePool). */
  source(name: string): Promise<GLTF> {
    let p = this.cache.get(name);
    if (!p) {
      p = this.assets.gltf(`${this.basePath}/${name}${this.extension}`);
      this.cache.set(name, p);
    }
    return p;
  }

  async place(scene: Scene | Object3D, name: string, opts: PlaceOptions = {}): Promise<Object3D> {
    const gltf = await this.source(name);
    const obj = gltf.scene.clone(true);
    if (opts.position) {
      if (Array.isArray(opts.position)) obj.position.set(...opts.position);
      else obj.position.copy(opts.position);
    }
    if (opts.rotationY !== undefined) obj.rotation.y = opts.rotationY;
    if (opts.scale !== undefined) {
      if (Array.isArray(opts.scale)) obj.scale.set(...opts.scale);
      else obj.scale.setScalar(opts.scale);
    }
    obj.traverse((child) => {
      const m = child as Mesh;
      if (m.isMesh) {
        m.castShadow = opts.castShadow ?? true;
        m.receiveShadow = opts.receiveShadow ?? true;
      }
    });
    scene.add(obj);
    return obj;
  }
}
