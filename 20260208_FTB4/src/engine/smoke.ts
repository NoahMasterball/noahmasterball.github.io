import {
  BufferAttribute,
  BufferGeometry,
  Color,
  NormalBlending,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three';

/**
 * Chimney smoke: a small column of soft particles that rise, drift with the
 * wind, expand and fade. One draw call per emitter.
 */
export class SmokeColumn {
  readonly points: Points;
  private readonly material: ShaderMaterial;

  constructor(origin: Vector3, count = 40) {
    const seeds = new Float32Array(count);
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      seeds[i] = i / count;
      positions[i * 3] = origin.x;
      positions[i * 3 + 1] = origin.y;
      positions[i * 3 + 2] = origin.z;
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(positions, 3));
    geo.setAttribute('seed', new BufferAttribute(seeds, 1));

    this.material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new Color(0xd8d3c8) },
      },
      vertexShader: /* glsl */ `
        attribute float seed;
        uniform float uTime;
        varying float vAlpha;
        void main() {
          // Each particle loops a 6s rise, staggered by seed.
          float t = fract(uTime / 6.0 + seed);
          vec3 p = position;
          p.y += t * 5.5;
          // wind drift grows with height + slight spiral
          p.x += t * t * 2.2 + sin(t * 12.0 + seed * 40.0) * 0.15 * t;
          p.z += t * 0.6 + cos(t * 10.0 + seed * 30.0) * 0.15 * t;
          vAlpha = smoothstep(0.0, 0.15, t) * (1.0 - smoothstep(0.55, 1.0, t));
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = (30.0 + t * 160.0) * (18.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.12, d) * vAlpha * 0.35;
          gl_FragColor = vec4(uColor, a);
        }
      `,
    });

    this.points = new Points(geo, this.material);
    this.points.frustumCulled = false;
  }

  update(elapsed: number): void {
    this.material.uniforms['uTime']!.value = elapsed;
  }
}
