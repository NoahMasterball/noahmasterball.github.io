import { describe, expect, it } from 'vitest';
import { addRadialLight, propagateLight } from '../../src/client/render/lightgrid.ts';

const W = 21;
const H = 21;

function grid(): { light: Float32Array; opaque: Uint8Array } {
  return { light: new Float32Array(W * H), opaque: new Uint8Array(W * H) };
}

describe('client light propagation', () => {
  it('falls off by Manhattan distance in open space', () => {
    const { light, opaque } = grid();
    light[10 * W + 10] = 1;
    propagateLight(light, opaque, W, H, 0.1, 0.3, 2);
    expect(light[10 * W + 10]).toBeCloseTo(1);
    expect(light[10 * W + 13]).toBeCloseTo(0.7);
    expect(light[12 * W + 12]).toBeCloseTo(0.6);
    expect(light[0]).toBe(0);
  });

  it('solid cells attenuate more than open ones', () => {
    const { light, opaque } = grid();
    for (let y = 0; y < H; y++) opaque[y * W + 12] = 1; // a solid wall column at x = 12
    light[10 * W + 10] = 1;
    propagateLight(light, opaque, W, H, 0.1, 0.3, 2);
    expect(light[10 * W + 11]).toBeCloseTo(0.9);
    expect(light[10 * W + 12]).toBeCloseTo(0.6); // entered the wall
    expect(light[10 * W + 13]).toBeCloseTo(0.5); // behind it: open again
  });

  it('radial light only raises values', () => {
    const { light } = grid();
    light[5 * W + 5] = 0.9;
    addRadialLight(light, W, H, 5.5, 5.5, 4, 0.5);
    expect(light[5 * W + 5]).toBeCloseTo(0.9);
    expect(light[5 * W + 7]).toBeCloseTo(0.25);
    expect(light[5 * W + 10]).toBe(0);
  });
});
