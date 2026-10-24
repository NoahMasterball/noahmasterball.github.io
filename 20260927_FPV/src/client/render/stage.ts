import {
  ACESFilmicToneMapping,
  DirectionalLight,
  Fog,
  HemisphereLight,
  MathUtils,
  PCFShadowMap,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { CAMERA, RENDER } from '../../config/client.ts';
import type { Vec3 } from '../../sim/math.ts';

// NEW — renderer, scenes, cameras, sun + sky + image-based ambient light (ARCHITECTURE §9).
// The view model renders in its own pass with cleared depth so it never clips into walls.

export interface Bounds {
  min: Vec3;
  max: Vec3;
}

/** Unit vector towards the sun (SSOT: RENDER.sun drives light, sky and environment). */
export function sunDirection(): Vector3 {
  const az = RENDER.sun.azimuthDeg * MathUtils.DEG2RAD;
  const el = RENDER.sun.elevationDeg * MathUtils.DEG2RAD;
  return new Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
}

export class Stage {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly viewModelScene = new Scene();
  readonly viewModelCamera: PerspectiveCamera;
  private horizontalFovDeg = 90;
  private zoom = 1;

  constructor(container: HTMLElement, bounds: Bounds) {
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, RENDER.maxPixelRatio));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = RENDER.exposure;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.autoClear = false;
    // Two passes per frame (world + view model): reset stats per frame, not per pass.
    this.renderer.info.autoReset = false;
    container.appendChild(this.renderer.domElement);

    this.camera = new PerspectiveCamera(60, 1, RENDER.near, RENDER.far);
    this.camera.rotation.order = 'YXZ';
    this.viewModelCamera = new PerspectiveCamera(CAMERA.viewModelFov, 1, 0.01, 10);

    this.scene.fog = new Fog(RENDER.fog.color, RENDER.fog.near, RENDER.fog.far);
    this.addLights(bounds);
    this.addSky();

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  private addLights(bounds: Bounds): void {
    const dir = sunDirection();
    const center = new Vector3(
      (bounds.min.x + bounds.max.x) / 2,
      (bounds.min.y + bounds.max.y) / 2,
      (bounds.min.z + bounds.max.z) / 2,
    );
    const radius =
      new Vector3(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, bounds.max.z - bounds.min.z).length() / 2 +
      RENDER.shadowMargin;

    const sun = new DirectionalLight(RENDER.sun.color, RENDER.sun.intensity);
    sun.position.copy(center).addScaledVector(dir, radius * 2);
    sun.target.position.copy(center);
    sun.castShadow = true;
    const cam = sun.shadow.camera;
    cam.left = -radius;
    cam.right = radius;
    cam.top = radius;
    cam.bottom = -radius;
    cam.near = radius * 0.5;
    cam.far = radius * 3.5;
    sun.shadow.mapSize.set(RENDER.shadowMapSize, RENDER.shadowMapSize);
    sun.shadow.bias = RENDER.shadowBias;
    sun.shadow.normalBias = RENDER.shadowNormalBias;
    this.scene.add(sun, sun.target);

    const hemi = RENDER.hemisphere;
    this.scene.add(new HemisphereLight(hemi.sky, hemi.ground, hemi.intensity));

    // The view model gets the same light rig (lights cannot be shared between scenes).
    const vmSun = new DirectionalLight(RENDER.sun.color, RENDER.sun.intensity);
    vmSun.position.copy(dir);
    this.viewModelScene.add(vmSun, new HemisphereLight(hemi.sky, hemi.ground, hemi.intensity));
  }

  private addSky(): void {
    const sky = new Sky();
    sky.scale.setScalar(RENDER.sky.scale);
    const u = sky.material.uniforms;
    const set = (name: string, value: number): void => {
      const uniform = u[name];
      if (!uniform) throw new Error(`Sky shader has no uniform '${name}'`);
      uniform.value = value;
    };
    set('turbidity', RENDER.sky.turbidity);
    set('rayleigh', RENDER.sky.rayleigh);
    set('mieCoefficient', RENDER.sky.mieCoefficient);
    set('mieDirectionalG', RENDER.sky.mieDirectionalG);
    u.sunPosition?.value.copy(sunDirection());
    this.scene.add(sky);

    // Image-based ambient light from the same sky, so shading matches the visible sky.
    const envScene = new Scene();
    const envSky = new Sky();
    envSky.scale.setScalar(RENDER.sky.scale);
    envSky.material.uniforms = sky.material.uniforms;
    envScene.add(envSky);
    const pmrem = new PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(envScene).texture;
    this.scene.environmentIntensity = RENDER.environmentIntensity;
    this.viewModelScene.environment = this.scene.environment;
    this.viewModelScene.environmentIntensity = RENDER.environmentIntensity;
    pmrem.dispose();
  }

  /** Horizontal FOV setting (degrees) and ADS zoom multiplier (1 = none). */
  setFov(horizontalDeg: number, zoom: number): void {
    if (horizontalDeg === this.horizontalFovDeg && zoom === this.zoom) return;
    this.horizontalFovDeg = horizontalDeg;
    this.zoom = zoom;
    this.applyFov();
  }

  private applyFov(): void {
    const aspect = this.camera.aspect;
    const h = this.horizontalFovDeg * MathUtils.DEG2RAD;
    const vertical = 2 * Math.atan(Math.tan(h / 2) / aspect);
    this.camera.fov = vertical * this.zoom * MathUtils.RAD2DEG;
    this.camera.updateProjectionMatrix();
  }

  /** Screen pixels from the centre for an angular offset (crosshair gap). */
  angleToPixels(angleRad: number): number {
    const halfV = (this.camera.fov * MathUtils.DEG2RAD) / 2;
    return (Math.tan(angleRad) / Math.tan(halfV)) * (this.renderer.domElement.clientHeight / 2);
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.viewModelCamera.aspect = w / h;
    this.viewModelCamera.updateProjectionMatrix();
    this.applyFov();
  }

  render(showViewModel: boolean): void {
    this.renderer.info.reset();
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    if (!showViewModel) return;
    this.renderer.clearDepth();
    this.renderer.render(this.viewModelScene, this.viewModelCamera);
  }
}
