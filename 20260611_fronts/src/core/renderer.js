// Renderer — zeichnet die Hexkarte auf das Canvas. Kennt keine Spielregeln;
// liest nur den Zustand und zeichnet ihn.
//
// Architektur: Die statischen Länderflächen werden einmalig in ein Offscreen-
// Canvas gezeichnet (prepareMap) und pro Frame nur noch skaliert geblittet —
// so ist die Bildrate unabhängig von der (hohen) Hexfeld-Anzahl. Dynamische
// Dinge (geglättete Grenzen, Städte, Auswahl, Gebäude) liegen als Overlay oben.

import { hexCorners, hexKey } from './hexgrid.js';
import { buildCountryRegions } from './borders.js';
import {
  HEX_SIZE,
  MAP_WIDTH,
  MAP_HEIGHT,
  REGION_FILL_SEAL_WIDTH,
  COL_SEA,
  COL_COUNTRY_BORDER,
  COL_PLAYER_OUTLINE,
  COL_SELECTED,
  COL_HOVER,
  COL_CAPITAL,
  COL_CITY,
  COL_CITY_LABEL,
  COUNTRY_PALETTE,
} from '../config/constants.js';
import { BUILDING_BY_ID } from '../data/buildings.js';

// Einmalig vorberechnete, statische Kartenbestandteile (Flächen + Grenzen).
let mapCache = null; // { baseCanvas, regions: Map<owner,{loops,bbox}> }

// Füllfarbe eines Hexfelds: Ozean oder Länderfarbe aus der Palette (color 1..9).
function fillFor(country) {
  if (!country) return COL_SEA;
  const idx = ((country.color || 1) - 1) % COUNTRY_PALETTE.length;
  return COUNTRY_PALETTE[idx];
}

function tracePath(ctx, cx, cy, size) {
  const pts = hexCorners(cx, cy, size);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < 6; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

// Legt alle (geglätteten) Umriss-Schleifen eines Landes als einen Pfad an.
// Even-odd-Füllung subtrahiert so eingeschlossene Enklaven/Löcher automatisch.
function traceRegion(ctx, loops) {
  ctx.beginPath();
  for (const pts of loops) {
    if (!pts.length) continue;
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
  }
}

/**
 * Berechnet die statische Karte (Flächen-Offscreen + geglättete Grenzlinien)
 * einmalig nach dem Rastern. Muss vor dem ersten render() aufgerufen werden.
 * @param {object} state  Spielzustand (aus state.js).
 */
export function prepareMap(state) {
  // Flächen in ein Offscreen-Canvas in Weltkoordinaten (1 Welteinheit = 1 px).
  const base = document.createElement('canvas');
  base.width = MAP_WIDTH;
  base.height = MAP_HEIGHT;
  const bctx = base.getContext('2d');
  bctx.fillStyle = COL_SEA;
  bctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

  // Länderflächen aus geglätteten Umriss-Schleifen füllen (statt Hexfelder) —
  // so sind Küsten und Grenzen rund statt treppig. Der dünne Konturstrich in der
  // Füllfarbe schließt die Chaikin-Schlitze zwischen Nachbarländern.
  const regions = buildCountryRegions(state.hexes, state.owners);
  bctx.lineJoin = 'round';
  bctx.lineWidth = REGION_FILL_SEAL_WIDTH;
  for (const [owner, region] of regions) {
    const country = state.countries.get(owner);
    if (!country) continue;
    const color = fillFor(country);
    traceRegion(bctx, region.loops);
    bctx.fillStyle = color;
    bctx.fill('evenodd');
    bctx.strokeStyle = color;
    bctx.stroke();
  }

  mapCache = { baseCanvas: base, regions };
}

/**
 * Zeichnet die gesamte Szene.
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLCanvasElement} canvas
 * @param {object} cam
 * @param {object} state
 * @param {object|null} hovered  Hexfeld {q,r} unter dem Cursor (oder null).
 */
export function render(ctx, canvas, cam, state, hovered) {
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

  // 1) Statische Länderflächen (Offscreen-Blit, weich skaliert).
  if (mapCache) {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(mapCache.baseCanvas, 0, 0);
  }

  // 2) Geglättete Grenz- und Küstenlinien aus denselben Länder-Schleifen
  //    (mit Bounding-Box-Culling pro Land).
  if (mapCache) {
    ctx.strokeStyle = COL_COUNTRY_BORDER;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(0.4, 1.1 / cam.zoom);
    ctx.beginPath();
    for (const region of mapCache.regions.values()) {
      const b = region.bbox;
      if (b.maxX < minX || b.minX > maxX || b.maxY < minY || b.minY > maxY) continue;
      for (const pts of region.loops) {
        if (!pts.length) continue;
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      }
    }
    ctx.stroke();
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

  // 4) Gebäude.
  for (const [key, buildingId] of state.buildings) {
    const hex = state.hexIndex.get(key);
    if (!hex) continue;
    if (hex.x < minX || hex.x > maxX || hex.y < minY || hex.y > maxY) continue;
    drawBuilding(ctx, hex, buildingId, cam.zoom);
  }

  // 5) Städte (Hauptstädte hervorgehoben).
  drawCities(ctx, state, cam, minX, minY, maxX, maxY);

  // 6) Hover- und Auswahlfeld.
  if (hovered) outlineHex(ctx, state, hovered, COL_HOVER, 2 / cam.zoom);
  if (state.selected) outlineHex(ctx, state, state.selected, COL_SELECTED, 2.5 / cam.zoom);
}

function outlineHex(ctx, state, cell, color, lineWidth) {
  const h = state.hexIndex.get(hexKey(cell.q, cell.r));
  if (!h) return;
  tracePath(ctx, h.x, h.y, HEX_SIZE);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function drawBuilding(ctx, hex, buildingId, zoom) {
  const b = BUILDING_BY_ID.get(buildingId);
  if (!b) return;
  ctx.beginPath();
  ctx.arc(hex.x, hex.y, HEX_SIZE * 0.55, 0, Math.PI * 2);
  ctx.fillStyle = b.color;
  ctx.fill();
  ctx.lineWidth = 1 / zoom;
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.stroke();
  if (zoom > 2.5) {
    ctx.fillStyle = '#000';
    ctx.font = `${HEX_SIZE}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(b.icon, hex.x, hex.y);
  }
}

// Städte: Marker in bildschirm-konstanter Größe; Hauptstädte größer und früher
// beschriftet als Großstädte. Sichtbarkeits-Schwellen vermeiden Überfüllung.
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
