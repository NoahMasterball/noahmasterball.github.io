import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Points,
  ShaderMaterial,
} from 'three';

export interface ParticleFieldOptions {
  count: number;
  /** Axis-aligned box the particles drift inside, centred at origin. */
  extent: { x: number; y: number; z: number };
  /** Vertical offset of the box centre. */
  centerY: number;
  color: Color;
  /** Point size at 1 m distance (perspective-scaled). */
  size: number;
  /** Drift speed in m/s. */
  speed: number;
  opacity: number;
}

/**
 * Lightweight drifting particle field (dust motes, fireflies, drifting seeds).
 * One draw call; motion + soft-circle falloff + twinkle in the shader.
 */
export class ParticleField {
  readonly points: Points;
  private readonly material: ShaderMaterial;

  constructor(opts: ParticleFieldOptions) {
    const positions = new Float32Array(opts.count * 3);
    const seeds = new Float32Array(opts.count);
    for (let i = 0; i < opts.count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * opts.extent.x;
      positions[i * 3 + 1] = opts.centerY + (Math.random() - 0.5) * opts.extent.y;
      positions[i * 3 + 2] = (Math.random() - 0.5) * opts.extent.z;
      seeds[i] = Math.random() * Math.PI * 2;
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(positions, 3));
    geo.setAttribute('seed', new BufferAttribute(seeds, 1));

    this.material = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: opts.color },
        uSize: { value: opts.size },
        uSpeed: { value: opts.speed },
        uOpacity: { value: opts.opacity },
        uExtentY: { value: opts.extent.y },
      },
      vertexShader: /* glsl */ `
        attribute float seed;
        uniform float uTime, uSize, uSpeed, uExtentY;
        varying float vTwinkle;
        void main() {
          vec3 p = position;
          float t = uTime * uSpeed;
          p.x += sin(t * 0.35 + seed * 7.0) * 1.2;
          p.y += mod(t * 0.22 + seed * 3.1, uExtentY) - uExtentY * 0.5;
          p.z += cos(t * 0.28 + seed * 5.0) * 1.2;
          vTwinkle = 0.55 + 0.45 * sin(uTime * (1.2 + seed) + seed * 11.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = uSize * (120.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vTwinkle;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float alpha = smoothstep(0.5, 0.05, d) * uOpacity * vTwinkle;
          gl_FragColor = vec4(uColor, alpha);
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
