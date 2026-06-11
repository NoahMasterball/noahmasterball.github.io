// Kamera — verwaltet Pan/Zoom und rechnet zwischen Welt- und Bildschirmkoordinaten
// um. SSOT für den aktuellen Bildausschnitt. Kennt keine Spielregeln.

import { ZOOM_MIN, ZOOM_MAX, ZOOM_DEFAULT, MAP_WIDTH, MAP_HEIGHT } from '../config/constants.js';

export function createCamera() {
  return { zoom: ZOOM_DEFAULT, offsetX: 0, offsetY: 0 };
}

// Welt -> Bildschirm.
export function worldToScreen(cam, wx, wy) {
  return { x: (wx - cam.offsetX) * cam.zoom, y: (wy - cam.offsetY) * cam.zoom };
}

// Bildschirm -> Welt.
export function screenToWorld(cam, sx, sy) {
  return { x: sx / cam.zoom + cam.offsetX, y: sy / cam.zoom + cam.offsetY };
}

// Verschiebt die Kamera um einen Bildschirm-Delta (z. B. beim Ziehen).
export function panByScreen(cam, dxScreen, dyScreen) {
  cam.offsetX -= dxScreen / cam.zoom;
  cam.offsetY -= dyScreen / cam.zoom;
}

// Zoomt um den Faktor, sodass der Weltpunkt unter (sx,sy) fix bleibt.
export function zoomAt(cam, factor, sx, sy) {
  const before = screenToWorld(cam, sx, sy);
  cam.zoom = clamp(cam.zoom * factor, ZOOM_MIN, ZOOM_MAX);
  const after = screenToWorld(cam, sx, sy);
  cam.offsetX += before.x - after.x;
  cam.offsetY += before.y - after.y;
}

// Setzt die Kamera so, dass die ganze Welt in das Ansichtsfenster passt.
export function fitWorld(cam, viewW, viewH) {
  cam.zoom = clamp(Math.min(viewW / MAP_WIDTH, viewH / MAP_HEIGHT), ZOOM_MIN, ZOOM_MAX);
  cam.offsetX = (MAP_WIDTH - viewW / cam.zoom) / 2;
  cam.offsetY = (MAP_HEIGHT - viewH / cam.zoom) / 2;
}

// Zentriert die Kamera bei gegebenem Zoom auf einen Weltpunkt.
export function centerOn(cam, wx, wy, viewW, viewH) {
  cam.offsetX = wx - viewW / cam.zoom / 2;
  cam.offsetY = wy - viewH / cam.zoom / 2;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
