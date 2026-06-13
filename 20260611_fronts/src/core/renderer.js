// Renderer — zeichnet die Hexkarte auf das Canvas. Kennt keine Spielregeln;
// liest nur den Zustand und zeichnet ihn.
//
// Architektur: Die statischen Länderflächen werden einmalig in ein Offscreen-
// Canvas gezeichnet (prepareMap) und pro Frame nur noch skaliert geblittet —
// so ist die Bildrate unabhängig von der (hohen) Hexfeld-Anzahl. Dynamische
// Dinge (Grenzlinien, Städte, Auswahl, Gebäude) liegen als Overlay oben.

import { hexCorners, hexKey, hexNeighbors } from './hexgrid.js';
import { buildTerrainCanvas, elevationAt } from './terrain.js';
import { trainHexKey } from './trains.js';
import {
  HEX_SIZE,
  MAP_WIDTH,
  MAP_HEIGHT,
  COL_SEA,
  COL_COUNTRY_BORDER,
  COL_PLAYER_OUTLINE,
  COL_SELECTED,
  COL_HOVER,
  COL_CAPITAL,
  COL_CITY,
  COL_CITY_LABEL,
  COUNTRY_PALETTE,
  COL_WAVE,
  WAVE_MIN_ZOOM,
  WAVE_BANDS,
  WAVE_PERIOD_MS,
  WAVE_MAX_WIDTH,
  WAVE_MAX_ALPHA,
  AMBIENT_WAVE_COUNT,
  AMBIENT_WAVE_LIFE_MIN,
  AMBIENT_WAVE_LIFE_MAX,
  AMBIENT_WAVE_SIZE_MIN,
  AMBIENT_WAVE_SIZE_MAX,
  AMBIENT_WAVE_WIDTH,
  AMBIENT_WAVE_DRIFT,
  AMBIENT_WAVE_MAX_ALPHA,
  SEA_MASK_CELL,
  TROOP_MOVE_MS,
  TROOP_CHIP_MIN_ZOOM,
  COL_TROOP_PLAYER,
  COL_TROOP_ENEMY,
  COL_TROOP_TEXT,
  COL_RAIL,
  COL_RAIL_TIE,
  COL_TRAIN,
  RAIL_LINE_WIDTH,
  MOUNTAIN_MIN_ZOOM,
  MOUNTAIN_SAMPLE_STEP,
  MOUNTAIN_THRESHOLD,
  MOUNTAIN_SNOW_THRESHOLD,
  MOUNTAIN_BASE_SIZE,
  COL_MOUNTAIN,
  COL_MOUNTAIN_SHADE,
  COL_MOUNTAIN_SNOW,
} from '../config/constants.js';
import { BUILDING_BY_ID } from '../data/buildings.js';

// Einmalig vorberechnete, statische Kartenbestandteile (Flächen + Grenzen).
// Zwei Basisflächen (politisch / Terrain) mit transparentem Meer — so scheinen
// Sea-Hintergrund und Küstenwellen unter dem Land hindurch.
let mapCache = null; // { political, terrain, shapes, seaMask }

// Pool der animierten Einzelwellen (lazy, wird bei prepareMap zurückgesetzt).
let ambientWaves = null; // [{ x, y, born, life, size, rot, dead }]

// Füllfarbe eines Landes: Palettenfarbe seines tatsächlichen Herrschers. Wurde
// ein Land erobert (controlledBy), erscheint es in der Farbe des Eroberers — so
// wächst auf der politischen Karte das Reich des Siegers sichtbar.
function fillFor(country, countries) {
  if (!country) return COL_SEA;
  let ruler = country;
  let guard = 0;
  while (ruler.controlledBy && countries && countries.has(ruler.controlledBy) && guard++ < 16) {
    ruler = countries.get(ruler.controlledBy);
  }
  const idx = ((ruler.color || 1) - 1) % COUNTRY_PALETTE.length;
  return COUNTRY_PALETTE[idx];
}

function tracePath(ctx, cx, cy, size) {
  const pts = hexCorners(cx, cy, size);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < 6; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

// Legt alle Ringe der Polygone eines Landes als einen Pfad an. Even-odd-Füllung
// subtrahiert so Löcher (Seen/Enklaven) automatisch. Ring = [x,y]-Paare.
function tracePolygons(ctx, polygons) {
  ctx.beginPath();
  for (const polygon of polygons) {
    for (const ring of polygon) {
      if (!ring.length) continue;
      ctx.moveTo(ring[0][0], ring[0][1]);
      for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i][0], ring[i][1]);
      ctx.closePath();
    }
  }
}

/**
 * Berechnet die statische Karte (zwei Basisflächen + Grenzgeometrie aus den
 * GeoJSON-Polygonen) einmalig nach dem Rastern. Muss vor dem ersten render()
 * aufgerufen werden.
 * @param {object} state  Spielzustand (aus state.js).
 */
export function prepareMap(state) {
  // Politische Fläche: Länder in Palettenfarbe, Meer transparent.
  const political = document.createElement('canvas');
  political.width = MAP_WIDTH;
  political.height = MAP_HEIGHT;
  const pctx = political.getContext('2d');

  // Länderflächen direkt aus den projizierten GeoJSON-Polygonen füllen (echte
  // Geografie) — Küsten und Grenzen folgen exakt der realen Kontur, keine
  // Hexfeld-Treppen. Das Hexraster bleibt rein fürs Gameplay (Besitz/Bauen).
  const shapes = [];
  for (const country of state.countries.values()) {
    if (!country.polygons || !country.polygons.length) continue;
    tracePolygons(pctx, country.polygons);
    pctx.fillStyle = fillFor(country, state.countries);
    pctx.fill('evenodd');
    shapes.push({ polygons: country.polygons, bbox: country.bbox });
  }

  // Terrain-Fläche (Biome) — ebenfalls mit transparentem Meer.
  const terrain = buildTerrainCanvas(state.countries);

  const seaMask = buildSeaMask(political);
  mapCache = {
    political, terrain, shapes, seaMask,
    landField: buildLandField(seaMask),
    mountains: buildMountains(seaMask),
  };
  ambientWaves = null; // Wellen-Pool für die neue Karte neu aufbauen lassen
}

// Erzeugt einmalig die Gebirgs-Gipfel: ein Raster aus Stichproben über Land, an
// denen das Höhenmodell (terrain.elevationAt) über der Schwelle liegt. Leicht
// verwürfelte Positionen vermeiden ein starres Gitter; benachbarte Treffer der
// „ridged“-Höhe bilden zusammenhängende Ketten. Einmalig je Karte.
function buildMountains(seaMask) {
  const pts = [];
  const step = MOUNTAIN_SAMPLE_STEP;
  for (let y = 0; y < MAP_HEIGHT; y += step) {
    const lat = 90 - (y / MAP_HEIGHT) * 180;
    for (let x = 0; x < MAP_WIDTH; x += step) {
      if (isSea(seaMask, x, y)) continue; // nur Land
      const lon = (x / MAP_WIDTH) * 360 - 180;
      const e = elevationAt(lon, lat);
      if (e < MOUNTAIN_THRESHOLD) continue;
      const j = (Math.imul(x | 0, 928371) ^ Math.imul(y | 0, 1234567)) >>> 0;
      const ox = ((j & 255) / 255 - 0.5) * step * 0.7;
      const oy = (((j >> 8) & 255) / 255 - 0.5) * step * 0.7;
      pts.push({ x: x + ox, y: y + oy, e });
    }
  }
  return pts;
}

// Richtungsfeld „zur nächsten Küste“: Multi-Source-BFS von allen Land-Zellen über
// die Meereszellen. Je Meereszelle wird die nächstgelegene Land-Zelle gemerkt, so
// dass eine Welle in Küstenrichtung schieben kann. Einmalig je Karte.
function buildLandField(mask) {
  const { cols, rows, bits } = mask;
  const n = cols * rows;
  const nearGX = new Int16Array(n).fill(-1);
  const nearGY = new Int16Array(n).fill(-1);
  const queue = [];
  for (let i = 0; i < n; i++) {
    if (bits[i] === 0) { nearGX[i] = i % cols; nearGY[i] = (i / cols) | 0; queue.push(i); } // Land = Quelle
  }
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const gx = i % cols;
    const gy = (i / cols) | 0;
    for (const [dx, dy] of dirs) {
      const nx = gx + dx;
      const ny = gy + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const j = ny * cols + nx;
      if (bits[j] === 1 && nearGX[j] === -1) { // unbesuchte Meereszelle
        nearGX[j] = nearGX[i];
        nearGY[j] = nearGY[i];
        queue.push(j);
      }
    }
  }
  return { nearGX, nearGY };
}

// Einheitsvektor von (x,y) zur nächsten Küste (oder null, wenn unerreichbar).
function landDirAt(mask, field, x, y) {
  const gx = (x / mask.cell) | 0;
  const gy = (y / mask.cell) | 0;
  const i = gy * mask.cols + gx;
  const lx = field.nearGX[i];
  if (lx < 0) return null;
  const ly = field.nearGY[i];
  const dx = (lx + 0.5) * mask.cell - x;
  const dy = (ly + 0.5) * mask.cell - y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-3) return null;
  return { ux: dx / len, uy: dy / len };
}

// Grobe Meer-Maske: skaliert die (auf Land transparente) politische Fläche auf
// ein kleines Raster herunter und merkt je Zelle „überwiegend Meer?“. Damit ist
// das Platzieren von Einzelwellen ins Wasser ein O(1)-Test, ohne Pixel-Readback
// der riesigen Karte pro Frame.
function buildSeaMask(political) {
  const cell = SEA_MASK_CELL;
  const cols = Math.ceil(MAP_WIDTH / cell);
  const rows = Math.ceil(MAP_HEIGHT / cell);
  const m = document.createElement('canvas');
  m.width = cols;
  m.height = rows;
  const mctx = m.getContext('2d');
  mctx.drawImage(political, 0, 0, cols, rows);
  const data = mctx.getImageData(0, 0, cols, rows).data;
  const bits = new Uint8Array(cols * rows);
  for (let i = 0; i < bits.length; i++) bits[i] = data[i * 4 + 3] < 128 ? 1 : 0; // transparent ≈ Meer
  return { cell, cols, rows, bits };
}

// Liegt der Weltpunkt (x,y) im Meer? (gegen die grobe See-Maske)
function isSea(mask, x, y) {
  if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return false;
  const gx = (x / mask.cell) | 0;
  const gy = (y / mask.cell) | 0;
  return mask.bits[gy * mask.cols + gx] === 1;
}

// Wählt die Basisfläche zur aktuellen Sicht (Default: politisch).
function baseFor(viewMode) {
  return viewMode === 'terrain' ? mapCache.terrain : mapCache.political;
}

/**
 * Malt einzeln eroberte Felder (state.dirtyHexes) in der Farbe ihres neuen
 * Besitzers fest auf die politische Basisfläche — die Geografie wird per Polygon
 * gefüllt, Feld-für-Feld-Eroberungen wechseln aber pro Hexfeld den Besitzer.
 * Günstig: nur die geänderten Felder, nicht die ganze Karte. Danach geleert.
 */
export function repaintCaptured(state) {
  if (!mapCache || !state.dirtyHexes.size) return;
  const pctx = mapCache.political.getContext('2d');
  for (const key of state.dirtyHexes) {
    const hex = state.hexIndex.get(key);
    if (!hex) continue;
    tracePath(pctx, hex.x, hex.y, HEX_SIZE + 0.5); // +0.5: Lücken vermeiden
    pctx.fillStyle = fillFor(state.countries.get(state.owners.get(key)), state.countries);
    pctx.fill();
  }
  state.dirtyHexes.clear();
}

// Zeichnet animierte Schaumbänder entlang aller Land-Umrisse. Die Bänder sind
// auf der Küstenlinie zentriert; ihre landseitige Hälfte wird vom Land-Blit
// überdeckt, sodass nur der Teil im Wasser sichtbar bleibt. Mehrere Bänder
// laufen phasenversetzt nach außen und verblassen (Wellen-Eindruck). Ein
// gemeinsamer Pfad wird einmal aufgebaut und je Band neu bestrichen.
function drawWaves(ctx, time, bounds) {
  const { minX, minY, maxX, maxY } = bounds;
  ctx.beginPath();
  let any = false;
  for (const shape of mapCache.shapes) {
    const b = shape.bbox;
    if (b.maxX < minX || b.minX > maxX || b.maxY < minY || b.minY > maxY) continue;
    for (const polygon of shape.polygons) {
      for (const ring of polygon) {
        if (!ring.length) continue;
        ctx.moveTo(ring[0][0], ring[0][1]);
        for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i][0], ring[i][1]);
        ctx.closePath();
        any = true;
      }
    }
  }
  if (!any) return;

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const cycle = (time % WAVE_PERIOD_MS) / WAVE_PERIOD_MS; // 0..1
  for (let k = 0; k < WAVE_BANDS; k++) {
    const p = (cycle + k / WAVE_BANDS) % 1; // Phase dieses Bands (0=frisch, 1=verlaufen)
    ctx.lineWidth = (0.15 + 0.85 * p) * WAVE_MAX_WIDTH; // läuft nach außen
    ctx.strokeStyle = `rgba(${COL_WAVE},${WAVE_MAX_ALPHA * (1 - p)})`; // verblasst
    ctx.stroke();
  }
}

// Setzt eine Einzelwelle an eine neue Zufallsstelle im sichtbaren Meer (Rejection-
// Sampling gegen die See-Maske) und würfelt Lebensdauer/Größe/Neigung neu. Findet
// sich kein Meer im Ausschnitt (alles Land), bleibt die Welle ruhend (dead).
function respawnWave(w, time, bounds, mask, field) {
  const { minX, minY, maxX, maxY } = bounds;
  for (let i = 0; i < 24; i++) {
    const x = minX + Math.random() * (maxX - minX);
    const y = minY + Math.random() * (maxY - minY);
    if (isSea(mask, x, y)) {
      w.x = x;
      w.y = y;
      w.born = time;
      w.life = AMBIENT_WAVE_LIFE_MIN + Math.random() * (AMBIENT_WAVE_LIFE_MAX - AMBIENT_WAVE_LIFE_MIN);
      w.size = AMBIENT_WAVE_SIZE_MIN + Math.random() * (AMBIENT_WAVE_SIZE_MAX - AMBIENT_WAVE_SIZE_MIN);
      // Schub Richtung Küste: rot so wählen, dass die Drift (lokale +y nach Rotation,
      // Weltvektor (−sinθ, cosθ)) zur nächsten Küste zeigt. Offenes Meer: zufällig.
      const dir = landDirAt(mask, field, x, y);
      w.rot = dir ? Math.atan2(-dir.ux, dir.uy) : Math.random() * Math.PI * 2;
      w.dead = false;
      return;
    }
  }
  w.dead = true;
}

// Kurzer, gerader Wellenstrich als Pfad (entlang lokaler x-Achse) um (0,0). Der
// Aufrufer setzt Transform, Breite und Farbe.
function traceWaveCrest(ctx, size) {
  ctx.beginPath();
  ctx.moveTo(-size / 2, 0);
  ctx.lineTo(size / 2, 0);
}

// Hüllkurve der Deckkraft über die Lebenszeit p (0..1): kurz einblenden, halten,
// dann verblassen — passt zu „schiebt los und verblasst dann“.
function waveEnvelope(p) {
  if (p < 0.15) return p / 0.15;       // einblenden
  if (p > 0.5) return (1 - p) / 0.5;   // verblassen
  return 1;                             // halten
}

// Verstreute Einzelwellen im offenen Meer: eckige Striche (kantige Enden), die
// in ihre Richtung schieben und dann verblassen. Jede lebt unabhängig und taucht
// nach ihrer Lebenszeit an einer neuen Zufallsstelle wieder auf — dadurch kein
// gleichförmiger Loop, sondern ständig „eine woanders“. Vor dem Land-Blit
// gezeichnet, damit nichts über Land liegt.
function drawAmbientWaves(ctx, time, bounds) {
  const mask = mapCache.seaMask;
  const field = mapCache.landField;
  if (!mask || !field) return;

  if (!ambientWaves) {
    // Pool aufbauen und Phasen entkoppeln (Geburt zufällig in die Vergangenheit
    // verschieben), damit nicht alle gleichzeitig aufpoppen.
    ambientWaves = [];
    for (let i = 0; i < AMBIENT_WAVE_COUNT; i++) {
      const w = {};
      respawnWave(w, time, bounds, mask, field);
      if (!w.dead) w.born = time - Math.random() * w.life;
      ambientWaves.push(w);
    }
  }

  const { minX, minY, maxX, maxY } = bounds;
  ctx.lineCap = 'butt'; // eckige Strichenden
  ctx.lineWidth = AMBIENT_WAVE_WIDTH;
  for (const w of ambientWaves) {
    if (w.dead || time - w.born >= w.life) respawnWave(w, time, bounds, mask, field);
    if (w.dead) continue;
    if (w.x < minX || w.x > maxX || w.y < minY || w.y > maxY) continue; // außerhalb Sicht
    const p = (time - w.born) / w.life; // 0..1
    const alpha = AMBIENT_WAVE_MAX_ALPHA * waveEnvelope(p);
    if (alpha <= 0.01) continue;
    ctx.strokeStyle = `rgba(${COL_WAVE},${alpha})`;
    ctx.save();
    ctx.translate(w.x, w.y);
    ctx.rotate(w.rot);
    ctx.translate(0, p * AMBIENT_WAVE_DRIFT); // schiebt senkrecht zum Strich in eine Richtung
    traceWaveCrest(ctx, w.size);
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Zeichnet die gesamte Szene.
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLCanvasElement} canvas
 * @param {object} cam
 * @param {object} state
 * @param {object|null} hovered  Hexfeld {q,r} unter dem Cursor (oder null).
 * @param {number} [time]  Zeitstempel (ms) für die Wellen-Animation.
 */
export function render(ctx, canvas, cam, state, hovered, time = 0) {
  const { width, height } = canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = COL_SEA;
  ctx.fillRect(0, 0, width, height);

  // Kamera als Canvas-Transform: ab hier in Welt-Koordinaten zeichnen.
  ctx.setTransform(cam.zoom, 0, 0, cam.zoom, -cam.offsetX * cam.zoom, -cam.offsetY * cam.zoom);

  const minX = cam.offsetX;
  const minY = cam.offsetY;
  const maxX = cam.offsetX + width / cam.zoom;
  const maxY = cam.offsetY + height / cam.zoom;
  const bounds = { minX, minY, maxX, maxY };

  // 0) Küstenwellen ins (noch leere) Meer zeichnen — der anschließende Land-Blit
  //    überdeckt die landseitige Hälfte, sodass nur die Wellen im Wasser bleiben.
  //    Dadurch erscheinen Wellen automatisch nur an echten Küsten, nicht an
  //    Land-Land-Grenzen. Erst ab WAVE_MIN_ZOOM (von weit weg unsichtbar/teuer).
  if (mapCache && cam.zoom >= WAVE_MIN_ZOOM) {
    drawWaves(ctx, time, bounds);
    drawAmbientWaves(ctx, time, bounds);
  }

  // 1) Statische Basisfläche der aktiven Sicht (Offscreen-Blit, weich skaliert).
  if (mapCache) {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(baseFor(state.viewMode), 0, 0);
  }

  // 2) Grenz- und Küstenlinien direkt aus den GeoJSON-Polygonen (echte Kontur,
  //    mit Bounding-Box-Culling pro Land).
  if (mapCache) {
    ctx.strokeStyle = COL_COUNTRY_BORDER;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(0.4, 1.1 / cam.zoom);
    ctx.beginPath();
    for (const shape of mapCache.shapes) {
      const b = shape.bbox;
      if (b.maxX < minX || b.minX > maxX || b.maxY < minY || b.minY > maxY) continue;
      for (const polygon of shape.polygons) {
        for (const ring of polygon) {
          if (!ring.length) continue;
          ctx.moveTo(ring[0][0], ring[0][1]);
          for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i][0], ring[i][1]);
          ctx.closePath();
        }
      }
    }
    ctx.stroke();
  }

  // 2b) Gebirge als Relief — erst beim Reinzoomen sichtbar (sonst Überfüllung).
  if (mapCache && cam.zoom >= MOUNTAIN_MIN_ZOOM) {
    drawMountains(ctx, cam.zoom, bounds);
  }

  // 3) Land des Spielers hervorheben.
  if (state.playerCountry) {
    ctx.strokeStyle = COL_PLAYER_OUTLINE;
    ctx.lineWidth = 2 / cam.zoom;
    for (const hex of state.hexes) {
      if (hex.x < minX || hex.x > maxX || hex.y < minY || hex.y > maxY) continue;
      if (state.owners.get(hexKey(hex.q, hex.r)) !== state.playerCountry) continue;
      tracePath(ctx, hex.x, hex.y, HEX_SIZE * 0.9);
      ctx.stroke();
    }
  }

  // 3b) Schienennetz des Spielers (unter Gebäuden und Zügen).
  drawRails(ctx, state, cam.zoom, bounds);

  // 4) Gebäude (Stadtfelder tragen mehrere; im Bau gedimmt mit ⏳).
  for (const [key, entries] of state.buildings) {
    const hex = state.hexIndex.get(key);
    if (!hex) continue;
    if (hex.x < minX || hex.x > maxX || hex.y < minY || hex.y > maxY) continue;
    drawFieldBuildings(ctx, hex, entries, cam.zoom);
  }

  // 5) Städte (Hauptstädte hervorgehoben).
  drawCities(ctx, state, cam, minX, minY, maxX, maxY);

  // 5b) Truppen: Garnisonen je Feld + marschierende Trupps + Quellfeld.
  drawTroops(ctx, state, cam, bounds, time);

  // 5c) Züge auf der Schiene.
  drawTrains(ctx, state, cam.zoom, bounds);

  // 6) Hover- und Auswahlfeld.
  if (hovered) outlineHex(ctx, state, hovered, COL_HOVER, 2 / cam.zoom);
  if (state.selected) outlineHex(ctx, state, state.selected, COL_SELECTED, 2.5 / cam.zoom);

  // 7) Ausgewählte Stadt (Bau-Stadt) hervorheben.
  if (state.selectedCity) {
    const c = state.selectedCity;
    ctx.beginPath();
    ctx.arc(c.x, c.y, (c.capital ? 6 : 5) / cam.zoom, 0, Math.PI * 2);
    ctx.strokeStyle = COL_SELECTED;
    ctx.lineWidth = 2.5 / cam.zoom;
    ctx.stroke();
  }
}

// Summe der Einheiten eines Stacks/einer Garnison (Map unitId -> Anzahl).
function sumUnits(units) {
  let n = 0;
  if (units) for (const c of units.values()) n += c;
  return n;
}

// Truppen-Chip: gefüllter Kreis mit Anzahl, in Welt-Koordinaten. Größe bleibt am
// Hexfeld; Text erst ab lesbarem Zoom.
function drawTroopChip(ctx, x, y, count, color, zoom) {
  const r = HEX_SIZE * 0.62;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 1.2 / zoom;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.stroke();
  if (zoom >= TROOP_CHIP_MIN_ZOOM) {
    ctx.fillStyle = COL_TROOP_TEXT;
    ctx.font = `bold ${HEX_SIZE * 0.95}px ${'Segoe UI, system-ui, sans-serif'}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(count), x, y + 0.5);
  }
}

// Zeichnet Garnisonen (Truppen je Feld), marschierende Trupps (interpoliert auf
// ihrem aktuellen Wegabschnitt) und hebt das Quellfeld eines Marschbefehls hervor.
function drawTroops(ctx, state, cam, bounds, time) {
  const { minX, minY, maxX, maxY } = bounds;
  const zoom = cam.zoom;
  if (zoom < TROOP_CHIP_MIN_ZOOM) return; // von weit weg unlesbar

  // Stehende Garnisonen.
  for (const [key, units] of state.garrisons) {
    const count = sumUnits(units);
    if (count <= 0) continue;
    const hex = state.hexIndex.get(key);
    if (!hex) continue;
    if (hex.x < minX || hex.x > maxX || hex.y < minY || hex.y > maxY) continue;
    const own = state.owners.get(key) === state.playerCountry;
    drawTroopChip(ctx, hex.x, hex.y, count, own ? COL_TROOP_PLAYER : COL_TROOP_ENEMY, zoom);
  }

  // Marschierende Trupps: Position auf dem aktuellen Wegabschnitt interpolieren.
  for (const m of state.movements) {
    const a = state.hexIndex.get(m.path[m.legIndex]);
    const b = state.hexIndex.get(m.path[m.legIndex + 1]);
    if (!a || !b) continue;
    const frac = Math.min(1, Math.max(0, (time - m.legStart) / TROOP_MOVE_MS));
    const x = a.x + (b.x - a.x) * frac;
    const y = a.y + (b.y - a.y) * frac;
    if (x < minX || x > maxX || y < minY || y > maxY) continue;
    const own = m.owner === state.playerCountry;
    drawTroopChip(ctx, x, y, sumUnits(m.units), own ? COL_TROOP_PLAYER : COL_TROOP_ENEMY, zoom);
  }

  // Quellfeld eines scharfen Marschbefehls hervorheben.
  if (state.troopSource) outlineHex(ctx, state, state.troopSource, COL_TROOP_PLAYER, 3 / zoom);
}

function outlineHex(ctx, state, cell, color, lineWidth) {
  const h = state.hexIndex.get(hexKey(cell.q, cell.r));
  if (!h) return;
  tracePath(ctx, h.x, h.y, HEX_SIZE);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

// Zeichnet alle Gebäude eines Feldes. Mehrere (Stadtfeld) werden versetzt um den
// Mittelpunkt angeordnet; noch im Bau befindliche werden gedimmt mit ⏳ gezeigt.
function drawFieldBuildings(ctx, hex, entries, zoom) {
  const n = entries.length;
  for (let i = 0; i < n; i++) {
    const off = slotOffset(i, n);
    drawBuilding(ctx, hex.x + off.dx, hex.y + off.dy, entries[i], n, zoom);
  }
}

// Versatz des i-ten Gebäude-Slots eines Feldes (ein Gebäude: zentriert; mehrere:
// gleichmäßig im kleinen Kreis verteilt).
function slotOffset(i, n) {
  if (n <= 1) return { dx: 0, dy: 0 };
  const r = HEX_SIZE * 0.34;
  const ang = -Math.PI / 2 + i * ((2 * Math.PI) / n);
  return { dx: Math.cos(ang) * r, dy: Math.sin(ang) * r };
}

function drawBuilding(ctx, x, y, entry, count, zoom) {
  const b = BUILDING_BY_ID.get(entry.id);
  if (!b) return;
  const built = entry.ticks <= 0;
  const rad = HEX_SIZE * (count > 1 ? 0.34 : 0.55);
  ctx.save();
  if (!built) ctx.globalAlpha = 0.45; // im Bau: gedimmt
  ctx.beginPath();
  ctx.arc(x, y, rad, 0, Math.PI * 2);
  ctx.fillStyle = b.color;
  ctx.fill();
  ctx.lineWidth = 1 / zoom;
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.stroke();
  if (zoom > 2.5) {
    ctx.fillStyle = '#000';
    ctx.font = `${HEX_SIZE * (count > 1 ? 0.7 : 1)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(built ? b.icon : '⏳', x, y);
  }
  ctx.restore();
}

// Zeichnet das Schienennetz: kurze Segmente zwischen benachbarten Gleis-Feldern
// plus je einen Knotenpunkt (so sind auch noch unverbundene Gleise sichtbar).
function drawRails(ctx, state, zoom, bounds) {
  if (!state.rails || !state.rails.size) return;
  const { minX, minY, maxX, maxY } = bounds;
  ctx.strokeStyle = COL_RAIL;
  ctx.lineWidth = Math.max(0.6, RAIL_LINE_WIDTH / zoom);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const key of state.rails) {
    const hex = state.hexIndex.get(key);
    if (!hex) continue;
    if (hex.x < minX || hex.x > maxX || hex.y < minY || hex.y > maxY) continue;
    const [q, r] = key.split(',').map(Number);
    for (const nb of hexNeighbors(q, r)) {
      const nk = hexKey(nb.q, nb.r);
      if (!state.rails.has(nk)) continue;
      const nh = state.hexIndex.get(nk);
      if (!nh) continue;
      ctx.moveTo(hex.x, hex.y);
      ctx.lineTo((hex.x + nh.x) / 2, (hex.y + nh.y) / 2);
    }
  }
  ctx.stroke();
  ctx.fillStyle = COL_RAIL_TIE;
  const nodeR = Math.max(0.8, (RAIL_LINE_WIDTH * 0.9) / zoom);
  for (const key of state.rails) {
    const hex = state.hexIndex.get(key);
    if (!hex) continue;
    if (hex.x < minX || hex.x > maxX || hex.y < minY || hex.y > maxY) continue;
    ctx.beginPath();
    ctx.arc(hex.x, hex.y, nodeR, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Zeichnet die Züge als Wagen auf ihrem aktuellen Gleis-Feld.
function drawTrains(ctx, state, zoom, bounds) {
  if (!state.trains || !state.trains.length) return;
  const { minX, minY, maxX, maxY } = bounds;
  for (const t of state.trains) {
    const hex = state.hexIndex.get(trainHexKey(t));
    if (!hex) continue;
    if (hex.x < minX || hex.x > maxX || hex.y < minY || hex.y > maxY) continue;
    ctx.beginPath();
    ctx.arc(hex.x, hex.y, HEX_SIZE * 0.32, 0, Math.PI * 2);
    ctx.fillStyle = COL_TRAIN;
    ctx.fill();
    ctx.lineWidth = 1.2 / zoom;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.stroke();
  }
}

// Städte: Marker in bildschirm-konstanter Größe; Hauptstädte größer und früher
// beschriftet als Großstädte. Sichtbarkeits-Schwellen vermeiden Überfüllung.
// Zeichnet die sichtbaren Gebirgsgipfel als kleine Relief-Symbole (Felsdreieck
// mit Schattseite, hohe Gipfel mit Schneekappe). Größe bildschirm-konstant und
// nach Höhe skaliert; mit Viewport-Culling.
function drawMountains(ctx, zoom, bounds) {
  const { minX, minY, maxX, maxY } = bounds;
  const denom = 1 - MOUNTAIN_THRESHOLD || 1;
  for (const m of mapCache.mountains) {
    if (m.x < minX || m.x > maxX || m.y < minY || m.y > maxY) continue;
    const s = (MOUNTAIN_BASE_SIZE / zoom) * (0.7 + 0.6 * ((m.e - MOUNTAIN_THRESHOLD) / denom));
    drawPeak(ctx, m.x, m.y, s, m.e);
  }
}

function drawPeak(ctx, px, py, s, e) {
  const half = s;
  const apexX = px;
  const apexY = py - s * 0.9;
  const baseY = py + s * 0.6;
  // Felskörper.
  ctx.beginPath();
  ctx.moveTo(px - half, baseY);
  ctx.lineTo(apexX, apexY);
  ctx.lineTo(px + half, baseY);
  ctx.closePath();
  ctx.fillStyle = COL_MOUNTAIN;
  ctx.fill();
  // Schattseite (rechte Hälfte).
  ctx.beginPath();
  ctx.moveTo(apexX, apexY);
  ctx.lineTo(px + half, baseY);
  ctx.lineTo(apexX, baseY);
  ctx.closePath();
  ctx.fillStyle = COL_MOUNTAIN_SHADE;
  ctx.fill();
  // Schneekappe (oberer Teil) bei hohen Gipfeln.
  if (e >= MOUNTAIN_SNOW_THRESHOLD) {
    const t = 0.42; // Anteil von der Spitze nach unten
    ctx.beginPath();
    ctx.moveTo(apexX, apexY);
    ctx.lineTo(apexX + (-half) * t, apexY + (baseY - apexY) * t);
    ctx.lineTo(apexX + half * t, apexY + (baseY - apexY) * t);
    ctx.closePath();
    ctx.fillStyle = COL_MOUNTAIN_SNOW;
    ctx.fill();
  }
}

function drawCities(ctx, state, cam, minX, minY, maxX, maxY) {
  if (!state.cities || !state.cities.length) return;
  const z = cam.zoom;
  const capR = 4 / z;     // Marker-Radius Hauptstadt (Bildschirm-px)
  const cityR = 2.4 / z;  // Marker-Radius Großstadt
  const font = 11 / z;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineWidth = 1.4 / z;

  for (const city of state.cities) {
    if (city.x < minX || city.x > maxX || city.y < minY || city.y > maxY) continue;
    // Großstädte erst ab mittlerem Zoom zeigen, Hauptstädte fast immer.
    if (!city.capital && z < 1.6) continue;

    if (city.capital) {
      // Stern-artiger Punkt: gefüllter Kreis mit Ring.
      ctx.beginPath();
      ctx.arc(city.x, city.y, capR, 0, Math.PI * 2);
      ctx.fillStyle = COL_CAPITAL;
      ctx.fill();
      ctx.strokeStyle = '#1a1206';
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(city.x, city.y, cityR, 0, Math.PI * 2);
      ctx.fillStyle = COL_CITY;
      ctx.fill();
    }

    const showLabel = city.capital ? z > 1.1 : z > 3.2;
    if (showLabel) {
      ctx.font = `${city.capital ? 'bold ' : ''}${font}px ${'Segoe UI, system-ui, sans-serif'}`;
      ctx.fillStyle = COL_CITY_LABEL;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.lineWidth = 3 / z;
      ctx.lineJoin = 'round';
      ctx.strokeText(city.name, city.x, city.y - (city.capital ? capR : cityR) - 1 / z);
      ctx.fillText(city.name, city.x, city.y - (city.capital ? capR : cityR) - 1 / z);
    }
  }
}
