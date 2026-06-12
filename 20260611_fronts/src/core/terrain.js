// Terrain-Ansicht — leitet aus geografischer Breite (+ etwas Rauschen) ein
// plausibles Biom je Ort ab und rastert daraus eine Terrain-Fläche (Wälder,
// Wüsten, Tundra, Eis …). Es gibt keine echten Biom-Daten; das Klima folgt der
// Breite, Flecken (Wald/Wüste) entstehen aus deterministischem Wert-Rauschen.
// SSOT für die Biom-Logik der Karte.

import {
  MAP_WIDTH, MAP_HEIGHT, BIOME_CELL, BIOME_NOISE_SCALE, TERRAIN_COLORS,
} from '../config/constants.js';

// Biom-Farben einmalig nach [r,g,b] vorparsen (fürs Pixel-Schreiben im Puffer).
function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const TERRAIN_RGB = Object.fromEntries(
  Object.entries(TERRAIN_COLORS).map(([k, v]) => [k, hexToRgb(v)]),
);

// Deterministischer Hash -> [0,1). Gleiche (i,j) liefern immer denselben Wert,
// damit das Terrain bei jedem Vorberechnen identisch aussieht.
function hash01(i, j) {
  let h = (Math.imul(i, 73856093) ^ Math.imul(j, 19349663)) | 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

// Glattes Wert-Rauschen (bilinear interpoliert, Smoothstep) über lon/lat.
function valueNoise(lon, lat) {
  const x = lon / BIOME_NOISE_SCALE;
  const y = lat / BIOME_NOISE_SCALE;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash01(ix, iy);
  const b = hash01(ix + 1, iy);
  const c = hash01(ix, iy + 1);
  const d = hash01(ix + 1, iy + 1);
  const top = a + (b - a) * sx;
  const bot = c + (d - c) * sx;
  return top + (bot - top) * sy;
}

// Biom-Schlüssel für eine Position. Klima nach |Breite|, die Klimagrenzen werden
// per Rauschen um einige Grad verwackelt, damit Wald/Wüste fleckig statt in
// perfekten Streifen liegen.
function biomeKey(lat, lon) {
  const n = valueNoise(lon, lat);
  const a = Math.abs(lat) + (n - 0.5) * 14; // Klimagrenzen ±7° verwackeln
  if (a >= 70) return 'ICE';
  if (a >= 58) return 'TUNDRA';
  if (a >= 46) return 'TAIGA';
  if (a >= 33) return n > 0.5 ? 'FOREST' : 'GRASSLAND';
  if (a >= 22) return n > 0.45 ? 'DESERT' : 'STEPPE'; // subtropischer Trockengürtel
  if (a >= 11) return n > 0.55 ? 'SAVANNA' : 'TROPICAL';
  return n > 0.4 ? 'RAINFOREST' : 'TROPICAL';
}

/**
 * Rastert die Terrain-Fläche in ein Offscreen-Canvas: nur Land ist eingefärbt,
 * das Meer bleibt transparent (damit der Sea-Hintergrund + Wellen durchscheinen).
 * @param {Map<string,object>} countries  countryKey -> Land mit { polygons }
 * @returns {HTMLCanvasElement}
 */
export function buildTerrainCanvas(countries) {
  const tex = document.createElement('canvas');
  tex.width = MAP_WIDTH;
  tex.height = MAP_HEIGHT;
  const tctx = tex.getContext('2d');

  // 1) Biome in einen kleinen Puffer rendern (ein Biom je Pufferpixel, Abstand
  //    BIOME_CELL Welteinheiten) …
  const bw = Math.ceil(MAP_WIDTH / BIOME_CELL);
  const bh = Math.ceil(MAP_HEIGHT / BIOME_CELL);
  const buf = document.createElement('canvas');
  buf.width = bw;
  buf.height = bh;
  const bctx = buf.getContext('2d');
  const img = bctx.createImageData(bw, bh);
  const d = img.data;
  for (let by = 0; by < bh; by++) {
    const lat = 90 - ((by + 0.5) / bh) * 180;
    for (let bx = 0; bx < bw; bx++) {
      const lon = ((bx + 0.5) / bw) * 360 - 180;
      const c = TERRAIN_RGB[biomeKey(lat, lon)];
      const o = (by * bw + bx) * 4;
      d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
    }
  }
  bctx.putImageData(img, 0, 0);

  // … und weich auf die volle Größe hochskalieren: bilineare Interpolation lässt
  // die Biom-Übergänge fließen statt harte Zellkanten zu zeigen (nicht eckig).
  tctx.imageSmoothingEnabled = true;
  tctx.imageSmoothingQuality = 'high';
  tctx.drawImage(buf, 0, 0, bw, bh, 0, 0, MAP_WIDTH, MAP_HEIGHT);

  // 2) Auf Land maskieren: alle Länder-Polygone als ein Pfad, destination-in
  //    behält die Textur nur dort, wo Land liegt. Even-odd subtrahiert Löcher.
  tctx.globalCompositeOperation = 'destination-in';
  tctx.beginPath();
  for (const country of countries.values()) {
    if (!country.polygons) continue;
    for (const polygon of country.polygons) {
      for (const ring of polygon) {
        if (!ring.length) continue;
        tctx.moveTo(ring[0][0], ring[0][1]);
        for (let i = 1; i < ring.length; i++) tctx.lineTo(ring[i][0], ring[i][1]);
        tctx.closePath();
      }
    }
  }
  tctx.fill('evenodd');
  tctx.globalCompositeOperation = 'source-over';
  return tex;
}
