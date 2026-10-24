// NEW — pure light propagation over a small grid (the visible area + margin). Sources are written
// into `light` first (sky, emitters); propagation spreads them with a per-cell falloff (cheap
// two-direction raster sweeps ≈ Manhattan distance falloff). Unit-tested in client-light.test.ts.

/**
 * Spreads light in place. `opaque[i]` = 1 for cells that block light (solid, non-transparent):
 * light entering them loses `solidFalloff` per cell, open cells lose `airFalloff`.
 */
export function propagateLight(
  light: Float32Array,
  opaque: Uint8Array,
  w: number,
  h: number,
  airFalloff: number,
  solidFalloff: number,
  sweeps: number,
): void {
  for (let s = 0; s < sweeps; s++) {
    // Forward: from left and from above.
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const i = row + x;
        const f = opaque[i] ? solidFalloff : airFalloff;
        let v = light[i] ?? 0;
        if (x > 0) v = Math.max(v, (light[i - 1] ?? 0) - f);
        if (y > 0) v = Math.max(v, (light[i - w] ?? 0) - f);
        light[i] = v;
      }
    }
    // Backward: from right and from below.
    for (let y = h - 1; y >= 0; y--) {
      const row = y * w;
      for (let x = w - 1; x >= 0; x--) {
        const i = row + x;
        const f = opaque[i] ? solidFalloff : airFalloff;
        let v = light[i] ?? 0;
        if (x < w - 1) v = Math.max(v, (light[i + 1] ?? 0) - f);
        if (y < h - 1) v = Math.max(v, (light[i + w] ?? 0) - f);
        light[i] = v;
      }
    }
  }
}

/** Raises light to at least `intensity × (1 − d / radius)` around (cx, cy) (grid cells). */
export function addRadialLight(light: Float32Array, w: number, h: number, cx: number, cy: number, radius: number, intensity: number): void {
  const r = Math.ceil(radius);
  const x0 = Math.max(0, Math.floor(cx) - r);
  const x1 = Math.min(w - 1, Math.floor(cx) + r);
  const y0 = Math.max(0, Math.floor(cy) - r);
  const y1 = Math.min(h - 1, Math.floor(cy) + r);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d >= radius) continue;
      const v = intensity * (1 - d / radius);
      const i = y * w + x;
      if ((light[i] ?? 0) < v) light[i] = v;
    }
  }
}
