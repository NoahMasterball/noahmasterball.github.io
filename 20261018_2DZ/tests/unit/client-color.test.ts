import { describe, expect, it } from 'vitest';
import { abgr, css, mix, parseCssColor, rgb, saturate, shade, tint } from '../../src/client/color.ts';

describe('client colour math', () => {
  it('packs, shades, mixes and clamps', () => {
    expect(rgb(255, 128, 0)).toBe(0xff8000);
    expect(rgb(300, -5, 10.4)).toBe(0xff000a);
    expect(shade(0x804020, 0.5)).toBe(0x402010);
    expect(shade(0x808080, 4)).toBe(0xffffff);
    expect(mix(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(mix(0x123456, 0xabcdef, 0)).toBe(0x123456);
    expect(mix(0x123456, 0xabcdef, 2)).toBe(0xabcdef);
    expect(tint(0x000000, 1)).toBe(0xffffff);
    expect(tint(0xffffff, -1)).toBe(0x000000);
    expect(saturate(0x336699, 1)).toBe(0x336699);
    expect(saturate(0xff0000, 0)).toBe(0x4c4c4c);
    expect(saturate(0x808080, 3)).toBe(0x808080);
  });

  it('formats CSS and ImageData colours', () => {
    expect(css(0x0a0b0c)).toBe('#0a0b0c');
    expect(css(0xff0000, 0.5)).toBe('rgba(255,0,0,0.5)');
    expect(abgr(0x112233) >>> 0).toBe(0xff332211);
    expect(abgr(0x112233, 0) >>> 0).toBe(0x00332211);
  });

  it('parses the index.html token formats', () => {
    expect(parseCssColor('#f1ece2')).toBe(0xf1ece2);
    expect(parseCssColor(' #abc ')).toBe(0xaabbcc);
    expect(parseCssColor('rgba(16, 14, 12, 0.7)')).toBe(0x100e0c);
    expect(() => parseCssColor('teal')).toThrow();
  });
});
