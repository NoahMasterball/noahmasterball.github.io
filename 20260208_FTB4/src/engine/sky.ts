import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry } from 'three';
import { ATMOSPHERE } from '../config';

/**
 * Stylized gradient sky dome matched to the palette (VISUAL_SPEC), with a soft
 * sun glow at the directional light's azimuth. Replaces the photographic HDRI
 * as *background* — the HDRI stays as scene.environment for IBL only.
 */
export function createSkyDome(): Mesh {
  const sunDir = ATMOSPHERE.sun.position.clone().normalize();
  const material = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uZenith: { value: new Color(ATMOSPHERE.sky.zenith) },
      uHorizon: { value: new Color(ATMOSPHERE.sky.horizon) },
      uGround: { value: new Color(ATMOSPHERE.sky.ground) },
      uSunDir: { value: sunDir },
      uSunColor: { value: new Color(ATMOSPHERE.sun.color) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith, uHorizon, uGround, uSunDir, uSunColor;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 sky = mix(uHorizon, uZenith, smoothstep(0.015, 0.42, h));
        sky = mix(uGround, sky, smoothstep(-0.06, 0.015, h));
        float s = max(dot(d, uSunDir), 0.0);
        // wide warm haze + tight sun disc glow
        sky += uSunColor * (pow(s, 6.0) * 0.18 + pow(s, 48.0) * 0.65 + pow(s, 300.0) * 2.2);
        gl_FragColor = vec4(sky, 1.0);
      }
    `,
  });
  const dome = new Mesh(new SphereGeometry(420, 48, 24), material);
  dome.frustumCulled = false;
  dome.renderOrder = -1;
  return dome;
}
