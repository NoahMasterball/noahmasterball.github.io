// Hex-Mathematik — Single Source of Truth für Koordinaten und Pixel-Umrechnung.
// Modell: Axial-Koordinaten (q, r) mit Pointy-Top-Ausrichtung. Distanzen über
// Cube-Koordinaten. Diese Datei kennt keine Spielregeln und keine Canvas-API —
// nur reine Geometrie in „Welteinheiten“ (siehe MAP_WIDTH/HEX_SIZE in constants).

import { HEX_SIZE, MAP_WIDTH, MAP_HEIGHT } from '../config/constants.js';

const SQRT3 = Math.sqrt(3);

// Eindeutiger Schlüssel eines Hexfelds für Maps/Sets. Eine Quelle für das Format.
export function hexKey(q, r) {
  return `${q},${r}`;
}

// Axial -> Pixel (Pointy-Top). size = Radius Mittelpunkt->Ecke.
export function axialToPixel(q, r, size = HEX_SIZE) {
  return {
    x: size * SQRT3 * (q + r / 2),
    y: size * 1.5 * r,
  };
}

// Pixel -> nächstgelegenes Axial-Feld (mit Cube-Rundung).
export function pixelToAxial(x, y, size = HEX_SIZE) {
  const qf = ((SQRT3 / 3) * x - (1 / 3) * y) / size;
  const rf = ((2 / 3) * y) / size;
  return cubeRound(qf, rf);
}

// Rundet fraktionale Axial-Koordinaten korrekt auf das nächste Hexfeld.
function cubeRound(qf, rf) {
  let xc = qf;
  let zc = rf;
  let yc = -xc - zc;
  let rx = Math.round(xc);
  let ry = Math.round(yc);
  let rz = Math.round(zc);
  const dx = Math.abs(rx - xc);
  const dy = Math.abs(ry - yc);
  const dz = Math.abs(rz - zc);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return { q: rx, r: rz };
}

// Die 6 Nachbarrichtungen in Axial-Koordinaten. Eine Quelle für „benachbart“.
export const HEX_DIRECTIONS = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function hexNeighbors(q, r) {
  return HEX_DIRECTIONS.map((d) => ({ q: q + d.q, r: r + d.r }));
}

// Kante i eines Hexfelds (zwischen Ecke i und Ecke i+1, siehe hexCorners) grenzt
// an genau diesen Nachbarn. Reihenfolge passend zu den Ecken (Pointy-Top):
// E, SE, SW, W, NW, NE. Eine Quelle für „welche Kante liegt an welchem Nachbarn“.
export const EDGE_DIRECTIONS = [
  { q: 1, r: 0 },   // 0: Ostkante
  { q: 0, r: 1 },   // 1: Südost
  { q: -1, r: 1 },  // 2: Südwest
  { q: -1, r: 0 },  // 3: West
  { q: 0, r: -1 },  // 4: Nordwest
  { q: 1, r: -1 },  // 5: Nordost
];

// Distanz zweier Axial-Felder in Hexschritten (über Cube-Distanz).
export function hexDistance(aq, ar, bq, br) {
  const dq = aq - bq;
  const dr = ar - br;
  return (Math.abs(dq) + Math.abs(dq + dr) + Math.abs(dr)) / 2;
}

// Die 6 Eckpunkte eines Hexfelds um (cx, cy) — für das Zeichnen.
export function hexCorners(cx, cy, size = HEX_SIZE) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30); // Pointy-Top: erste Ecke oben
    pts.push({ x: cx + size * Math.cos(angle), y: cy + size * Math.sin(angle) });
  }
  return pts;
}

/**
 * Erzeugt das Hexraster, das den Weltraum [0..MAP_WIDTH] x [0..MAP_HEIGHT] füllt.
 * @returns {{q:number,r:number,x:number,y:number}[]}
 */
export function generateGrid(size = HEX_SIZE) {
  const rows = Math.ceil(MAP_HEIGHT / (size * 1.5)) + 1;
  const cols = Math.ceil(MAP_WIDTH / (size * SQRT3)) + 1;
  const hexes = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const q = col - Math.floor(row / 2);
      const r = row;
      const { x, y } = axialToPixel(q, r, size);
      hexes.push({ q, r, x, y });
    }
  }
  return hexes;
}
