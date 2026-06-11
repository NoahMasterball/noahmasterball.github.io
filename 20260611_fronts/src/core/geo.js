// Geo-Verarbeitung — lädt einen Karten-Datensatz (GeoJSON) und rastert die
// Ländergrenzen einmalig auf das Hexraster. Ergebnis: jedes Hexfeld bekommt
// genau einen Eigentümer (Land-Schlüssel) oder bleibt Ozean (null).
//
// Projektion: äquirektangulär (lon/lat -> Weltkoordinaten). Diese Datei ist die
// SSOT für „welches Land besitzt welches Hexfeld“.

import { MAP_WIDTH, MAP_HEIGHT } from '../config/constants.js';
import { hexKey } from './hexgrid.js';
import { blocOf } from '../data/alignment.js';

// lon/lat -> Weltkoordinaten. Eine Quelle für die Projektion.
export function lonLatToWorld(lon, lat) {
  return {
    x: ((lon + 180) / 360) * MAP_WIDTH,
    y: ((90 - lat) / 180) * MAP_HEIGHT,
  };
}

// Eindeutiger Schlüssel eines Landes. iso ist bei manchen Ländern '-99', daher
// ist der Name die verlässliche Quelle. Eine Quelle für die Schlüsselbildung.
export function countryKey(props) {
  return props.name;
}

// Punkt-in-Polygon (Ray-Casting) gegen einen Ring aus [x,y]-Paaren.
function pointInRing(px, py, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Ein „Polygon“ = [aussenRing, loch1, loch2, ...]. Innerhalb = im Außenring und
// in keinem Loch.
function pointInPolygon(px, py, polygon) {
  if (!pointInRing(px, py, polygon[0])) return false;
  for (let h = 1; h < polygon.length; h++) {
    if (pointInRing(px, py, polygon[h])) return false;
  }
  return true;
}

// Projiziert die Ringe eines GeoJSON-Features nach Weltkoordinaten und sammelt
// alle Polygone (Polygon -> 1, MultiPolygon -> mehrere) plus Bounding-Box.
function projectFeature(feature) {
  const polys = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  const projectRing = (ring) =>
    ring.map(([lon, lat]) => {
      const { x, y } = lonLatToWorld(lon, lat);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      return [x, y];
    });

  const geom = feature.geometry;
  if (geom.type === 'Polygon') {
    polys.push(geom.coordinates.map(projectRing));
  } else if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates) polys.push(poly.map(projectRing));
  }
  return { polys, bbox: { minX, minY, maxX, maxY } };
}

/**
 * Lädt den GeoJSON-Datensatz eines Modus.
 * @param {string} url
 * @returns {Promise<object>} GeoJSON FeatureCollection
 */
export async function loadGeoJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Karten-Daten nicht ladbar: ${url} (${res.status})`);
  return res.json();
}

/**
 * Lädt die Städte eines Modus und projiziert sie in Weltkoordinaten.
 * @param {string} url  JSON mit { cities: [{name, cap, country, pop, lon, lat}] }
 * @returns {Promise<{name,capital,country,pop,x,y}[]>}
 */
export async function loadCities(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Städte-Daten nicht ladbar: ${url} (${res.status})`);
  const data = await res.json();
  return data.cities.map((c) => {
    const { x, y } = lonLatToWorld(c.lon, c.lat);
    return { name: c.name, capital: c.cap === 1, country: c.country, pop: c.pop, x, y };
  });
}

/**
 * Rastert die GeoJSON-Länder auf das Hexraster.
 * @param {{q,r,x,y}[]} hexes  Zuvor erzeugtes Raster.
 * @param {object} geojson     FeatureCollection.
 * @returns {{ owners: Map<string,string>, countries: Map<string,object> }}
 *   owners:    hexKey -> countryKey
 *   countries: countryKey -> { key, name, iso, continent, color, centroid, hexCount }
 */
export function rasterizeCountries(hexes, geojson) {
  // 1) Features projizieren + Länder-Metadaten aufbauen.
  const prepared = [];
  const countries = new Map();
  for (const feature of geojson.features) {
    const key = countryKey(feature.properties);
    const { polys, bbox } = projectFeature(feature);
    if (!polys.length) continue;
    const centroid = bboxCenter(bbox);
    prepared.push({ key, polys, bbox });
    countries.set(key, {
      key,
      name: feature.properties.name,
      iso: feature.properties.iso,
      continent: feature.properties.continent,
      color: feature.properties.color,
      bloc: blocOf(feature.properties.name), // West/Ost -> Fahrzeugpalette
      gdp: feature.properties.gdp || 0,   // BIP in Mio. USD (Wirtschaftskraft)
      pop: feature.properties.pop || 0,
      centroid,
      hexCount: 0,
    });
  }

  // 2) Jedes Hexfeld dem ersten passenden Land zuordnen (Bounding-Box vorfiltern).
  const owners = new Map();
  for (const hex of hexes) {
    for (const f of prepared) {
      const b = f.bbox;
      if (hex.x < b.minX || hex.x > b.maxX || hex.y < b.minY || hex.y > b.maxY) continue;
      let hit = false;
      for (const poly of f.polys) {
        if (pointInPolygon(hex.x, hex.y, poly)) { hit = true; break; }
      }
      if (hit) {
        owners.set(hexKey(hex.q, hex.r), f.key);
        countries.get(f.key).hexCount++;
        break;
      }
    }
  }

  // 3) Spielbarkeit garantieren: Länder ohne Hexfeld bekommen das ihrem
  //    Schwerpunkt nächstgelegene (vorzugsweise freie) Feld.
  ensureEveryCountryPlayable(hexes, owners, countries);

  return { owners, countries };
}

function bboxCenter(b) {
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}

// Sorgt dafür, dass jedes Land mindestens ein Hexfeld besitzt — sonst wäre es
// nicht spielbar (der Wunsch: jedes Land soll existieren und spielbar sein).
function ensureEveryCountryPlayable(hexes, owners, countries) {
  for (const country of countries.values()) {
    if (country.hexCount > 0) continue;
    let best = null;
    let bestFree = null;
    let bestDist = Infinity;
    let bestFreeDist = Infinity;
    for (const hex of hexes) {
      const dx = hex.x - country.centroid.x;
      const dy = hex.y - country.centroid.y;
      const d = dx * dx + dy * dy;
      if (d < bestDist) { bestDist = d; best = hex; }
      if (!owners.has(hexKey(hex.q, hex.r)) && d < bestFreeDist) {
        bestFreeDist = d;
        bestFree = hex;
      }
    }
    const target = bestFree || best;
    if (!target) continue;
    const k = hexKey(target.q, target.r);
    const prev = owners.get(k);
    if (prev && countries.has(prev)) countries.get(prev).hexCount--;
    owners.set(k, country.key);
    country.hexCount++;
  }
}
