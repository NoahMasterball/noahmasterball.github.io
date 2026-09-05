import {
  EquirectangularReflectionMapping,
  LoadingManager,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  WebGLRenderer,
} from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { TextureLoader } from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/**
 * Central asset loading (SSOT for loader configuration). All model/texture/HDRI
 * loads go through one LoadingManager so readiness is a single explicit signal.
 */
export class Assets {
  readonly manager: LoadingManager;
  readonly maxAnisotropy: number;
  private readonly gltfLoader: GLTFLoader;
  private readonly rgbeLoader: RGBELoader;
  private readonly textureLoader: TextureLoader;

  constructor(renderer: WebGLRenderer, onProgress?: (ratio: number) => void) {
    this.maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    this.manager = new LoadingManager();
    if (onProgress) {
      this.manager.onProgress = (_url, loaded, total) => onProgress(total ? loaded / total : 0);
    }

    const draco = new DRACOLoader(this.manager).setDecoderPath('draco/');
    const ktx2 = new KTX2Loader(this.manager)
      .setTranscoderPath('basis/')
      .detectSupport(renderer);

    this.gltfLoader = new GLTFLoader(this.manager)
      .setDRACOLoader(draco)
      .setKTX2Loader(ktx2)
      .setMeshoptDecoder(MeshoptDecoder);

    this.rgbeLoader = new RGBELoader(this.manager);
    this.textureLoader = new TextureLoader(this.manager);
  }

  gltf(url: string): Promise<GLTF> {
    return this.gltfLoader.loadAsync(url);
  }

  async hdri(url: string): Promise<Texture> {
    const tex = await this.rgbeLoader.loadAsync(url);
    tex.mapping = EquirectangularReflectionMapping;
    return tex;
  }

  texture(url: string): Promise<Texture> {
    return this.textureLoader.loadAsync(url);
  }

  /**
   * Standard material from an ambientCG 2K-JPG set in assets/textures/<id>/
   * (Color, NormalGL, Roughness, AmbientOcclusion), tiled `repeat` times,
   * with max anisotropy on the colour map.
   */
  async pbrMaterial(id: string, repeat: number): Promise<MeshStandardMaterial> {
    const base = `assets/textures/${id}/${id}_2K-JPG_`;
    const [map, normalMap, roughnessMap, aoMap] = await Promise.all([
      this.texture(`${base}Color.jpg`),
      this.texture(`${base}NormalGL.jpg`),
      this.texture(`${base}Roughness.jpg`),
      this.texture(`${base}AmbientOcclusion.jpg`),
    ]);
    map.colorSpace = SRGBColorSpace;
    map.anisotropy = this.maxAnisotropy;
    for (const t of [map, normalMap, roughnessMap, aoMap]) {
      t.wrapS = RepeatWrapping;
      t.wrapT = RepeatWrapping;
      t.repeat.set(repeat, repeat);
    }
    return new MeshStandardMaterial({ map, normalMap, roughnessMap, aoMap });
  }
}
