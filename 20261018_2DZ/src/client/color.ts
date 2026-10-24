// NEW — colour math shared by every canvas drawer (0xRRGGBB numbers, as in the data files).
// Pure functions, unit-tested in tests/unit/client-color.test.ts.

export function red(c: number): number {
  return (c >> 16) & 0xff;
}
export function green(c: number): number {
  return (c >> 8) & 0xff;
}
export function blue(c: number): number {
  return c & 0xff;
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

export function rgb(r: number, g: number, b: number): number {
  return (clampByte(r) << 16) | (clampByte(g) << 8) | clampByte(b);
}

/** Multiplies brightness (1 = unchanged, 0 = black, >1 brighter). */
export function shade(c: number, f: number): number {
  return rgb(red(c) * f, green(c) * f, blue(c) * f);
}

/** Linear mix a → b by t (0..1). */
export function mix(a: number, b: number, t: number): number {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return rgb(red(a) + (red(b) - red(a)) * k, green(a) + (green(b) - green(a)) * k, blue(a) + (blue(b) - blue(a)) * k);
}

/** Moves brightness toward white (f > 0) or black (f < 0) by |f|. */
export function tint(c: number, f: number): number {
  return f >= 0 ? mix(c, 0xffffff, f) : mix(c, 0x000000, -f);
}

/** Scales saturation around the colour's grey (Rec. 601 luma): 0 = grey, 1 = unchanged, >1 = more vivid. */
export function saturate(c: number, f: number): number {
  const r = red(c);
  const g = green(c);
  const b = blue(c);
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  return rgb(y + (r - y) * f, y + (g - y) * f, y + (b - y) * f);
}

export function css(c: number, alpha = 1): string {
  return alpha >= 1 ? `#${c.toString(16).padStart(6, '0')}` : `rgba(${red(c)},${green(c)},${blue(c)},${alpha})`;
}

/** 0xRRGGBB → little-endian ABGR Uint32 for ImageData buffers. */
export function abgr(c: number, alpha = 255): number {
  return ((alpha & 0xff) << 24) | (blue(c) << 16) | (green(c) << 8) | red(c);
}

/** Parses '#rgb', '#rrggbb' or 'rgb(a)(…)' CSS colours (the index.html tokens) to 0xRRGGBB. */
export function parseCssColor(value: string): number {
  const v = value.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
  if (hex?.[1]) {
    const h = hex[1].length === 3 ? [...hex[1]].map((ch) => ch + ch).join('') : hex[1];
    return parseInt(h, 16);
  }
  const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(v);
  if (fn) return rgb(Number(fn[1]), Number(fn[2]), Number(fn[3]));
  throw new Error(`unsupported CSS colour '${value}'`);
}
