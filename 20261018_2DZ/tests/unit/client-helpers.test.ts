import { describe, expect, it } from 'vitest';
import { seedFromQuery } from '../../src/client/app.ts';
import { makeView, screenToWorld, visibleTiles, worldToCss } from '../../src/client/camera.ts';
import { actionForCode, wheelSlot } from '../../src/client/input.ts';
import { liquidFill } from '../../src/client/render/overlay.ts';
import { clockText } from '../../src/client/ui/hud.ts';
import { dragCount } from '../../src/client/ui/inventory.ts';
import { CAMERA, KEY_BINDINGS, MOUSE_BUTTONS } from '../../src/config/client.ts';
import { LIQUID, PLAYER, WORLD } from '../../src/config/sim.ts';

describe('client camera', () => {
  it('maps the screen centre to the camera centre and back', () => {
    const view = makeView(100, 80, 1280, 720, 1, 1000, 500);
    const c = screenToWorld(view, 640, 360);
    expect(c.x).toBeCloseTo(100, 1);
    expect(c.y).toBeCloseTo(80, 1);
    expect(view.scale).toBe(CAMERA.tileCssPx * CAMERA.zoom);
    expect(Number.isInteger(view.originX)).toBe(true);
  });

  it('is devicePixelRatio aware (CSS px in, same world point out)', () => {
    const a = screenToWorld(makeView(100, 80, 1280, 720, 1, 1000, 500), 100, 50);
    const b = screenToWorld(makeView(100, 80, 2560, 1440, 2, 1000, 500), 100, 50);
    expect(b.x).toBeCloseTo(a.x, 1);
    expect(b.y).toBeCloseTo(a.y, 1);
  });

  it('worldToCss inverts screenToWorld (any dpr)', () => {
    for (const dpr of [1, 2]) {
      const view = makeView(100, 80, 1280 * dpr, 720 * dpr, dpr, 1000, 500);
      const w = screenToWorld(view, 333, 222);
      const c = worldToCss(view, w.x, w.y);
      expect(c.x).toBeCloseTo(333, 6);
      expect(c.y).toBeCloseTo(222, 6);
    }
  });

  it('clamps to the world', () => {
    const view = makeView(-50, -50, 1280, 720, 1, 1000, 500);
    expect(view.originX).toBe(0);
    expect(view.originY).toBe(0);
    const v = visibleTiles(view);
    expect(v.x0).toBe(0);
    expect(v.x1).toBe(Math.ceil(1280 / view.scale));
  });
});

describe('client input helpers', () => {
  it('resolves bound keys', () => {
    for (const [action, b] of Object.entries(KEY_BINDINGS)) for (const k of b.keys) expect(actionForCode(k)).toBe(action);
    expect(actionForCode('KeyZ')).toBeNull();
  });

  it('wraps the hotbar on wheel steps', () => {
    expect(wheelSlot(0, -1)).toBe(PLAYER.hotbarSlots - 1);
    expect(wheelSlot(PLAYER.hotbarSlots - 1, 1)).toBe(0);
    expect(wheelSlot(3, 2)).toBe(5);
  });

  it('right-drag moves half a stack', () => {
    expect(dragCount(MOUSE_BUTTONS.primary, 7)).toBeUndefined();
    expect(dragCount(MOUSE_BUTTONS.secondary, 7)).toBe(4);
  });

  it('reads the seed from the query', () => {
    expect(seedFromQuery('?seed=123')).toBe(123);
    expect(seedFromQuery('')).toBe(WORLD.defaultSeed);
    expect(seedFromQuery('?seed=abc')).toBe(WORLD.defaultSeed);
  });
});

describe('client display helpers', () => {
  it('fills liquid cells from the bottom, full under liquid', () => {
    expect(liquidFill(0, 50)).toBe(0);
    expect(liquidFill(LIQUID.max / 2, 0)).toBeCloseTo(0.5);
    expect(liquidFill(10, 1)).toBe(1);
  });

  it('formats the clock', () => {
    expect(clockText(0)).toBe('00:00');
    expect(clockText(0.5)).toBe('12:00');
    expect(clockText(0.75)).toBe('18:00');
  });
});
