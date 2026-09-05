import {
  BlendFunction,
  BloomEffect,
  BrightnessContrastEffect,
  EffectComposer,
  EffectPass,
  HueSaturationEffect,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';
import {
  DirectionalLight,
  Fog,
  HalfFloatType,
  NoToneMapping,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
// @ts-expect-error — n8ao ships no TypeScript declarations
import { N8AOPostPass } from 'n8ao';
import { ATMOSPHERE, POST, RENDER } from '../config';
import { createSkyDome } from './sky';

/**
 * Owns renderer, scene, camera, sun light, and the full post-processing chain
 * (N8AO -> bloom -> tone mapping -> grading -> vignette -> SMAA).
 * Tone mapping happens in the composer (ACES via ToneMappingEffect), so the
 * renderer itself runs untonemapped in HDR (HalfFloat buffers).
 */
export class Stage {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly sun: DirectionalLight;
  private readonly composer: EffectComposer;

  constructor(container: HTMLElement) {
    this.renderer = new WebGLRenderer({
      antialias: false, // SMAA in the composer handles AA
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = NoToneMapping;
    this.renderer.toneMappingExposure = RENDER.exposure;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, RENDER.maxPixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(this.renderer.domElement);

    this.scene = new Scene();
    this.scene.fog = new Fog(ATMOSPHERE.fogColor, ATMOSPHERE.fogNear, ATMOSPHERE.fogFar);
    this.scene.add(createSkyDome());
    this.scene.environmentRotation.set(0, ATMOSPHERE.envYaw, 0);

    this.camera = new PerspectiveCamera(
      RENDER.camera.fov,
      window.innerWidth / window.innerHeight,
      RENDER.camera.near,
      RENDER.camera.far,
    );

    this.sun = new DirectionalLight(ATMOSPHERE.sun.color, ATMOSPHERE.sun.intensity);
    this.sun.position.copy(ATMOSPHERE.sun.position);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(RENDER.shadowMapSize, RENDER.shadowMapSize);
    this.sun.shadow.bias = -0.0002;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.composer = new EffectComposer(this.renderer, { frameBufferType: HalfFloatType });
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    const n8ao = new N8AOPostPass(this.scene, this.camera, window.innerWidth, window.innerHeight);
    n8ao.configuration.aoRadius = POST.n8ao.aoRadius;
    n8ao.configuration.distanceFalloff = POST.n8ao.distanceFalloff;
    n8ao.configuration.intensity = POST.n8ao.intensity;
    n8ao.configuration.halfRes = true;
    n8ao.setQualityMode(POST.n8ao.quality);
    this.composer.addPass(n8ao);

    const bloom = new BloomEffect({
      intensity: POST.bloom.intensity,
      luminanceThreshold: POST.bloom.luminanceThreshold,
      luminanceSmoothing: POST.bloom.luminanceSmoothing,
      mipmapBlur: true,
      radius: POST.bloom.radius,
    });
    const toneMapping = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
    const grading = new BrightnessContrastEffect({
      brightness: POST.grading.brightness,
      contrast: POST.grading.contrast,
    });
    const saturation = new HueSaturationEffect({
      blendFunction: BlendFunction.NORMAL,
      saturation: POST.grading.saturation,
    });
    const vignette = new VignetteEffect({
      offset: POST.vignette.offset,
      darkness: POST.vignette.darkness,
    });
    const smaa = new SMAAEffect({ preset: SMAAPreset.HIGH });

    // Order matters: bloom operates on HDR, then tone map, then grade, then AA.
    this.composer.addPass(new EffectPass(this.camera, bloom, toneMapping, grading, saturation, vignette, smaa));

    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  }

  /** Fit the sun's shadow camera tightly around the play area. */
  fitShadowsTo(radius: number): void {
    const cam = this.sun.shadow.camera;
    cam.left = -radius;
    cam.right = radius;
    cam.top = radius;
    cam.bottom = -radius;
    cam.near = 1;
    cam.far = ATMOSPHERE.sun.position.length() + radius * 2;
    cam.updateProjectionMatrix();
  }

  render(dt: number): void {
    this.composer.render(dt);
  }
}
