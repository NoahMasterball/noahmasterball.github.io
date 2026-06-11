// Grenzlinien — extrahiert aus dem gerasterten Eigentums-Raster glatte Linienzüge
// für Ländergrenzen und Küsten. Kennt keine Canvas-API; liefert reine Punktlisten
// in Weltkoordinaten. SSOT für die Grenz-Geometrie der Karte.
//
// Vorgehen:
//   1. Jede Hex-Kante, an der ein anderes Land (oder Meer) anliegt, ist eine
//      Grenzkante. Sie wird nur von der Landseite erzeugt (keine Dopplung).
//   2. Die Kanten werden über gemeinsame Eckpunkte zu Linienzügen verkettet.
//   3. Jeder Linienzug wird per Chaikin-Verfahren geglättet (Treppe -> Kurve).

import { hexKey, hexCorners, EDGE_DIRECTIONS } from './hexgrid.js';
import { HEX_SIZE, BORDER_SMOOTH_ITERATIONS } from '../config/constants.js';

// Eckpunkt-Schlüssel: auf 2 Nachkommastellen gerundet. Benachbarte Hexfelder
// berechnen denselben geometrischen Eckpunkt bis auf Float-Rauschen (<1e-9),
// echte Eckpunkte liegen weit (>> 0.01) auseinander — daher kollisionsfrei.
function pointKey(x, y) {
  return `${Math.round(x * 100)},${Math.round(y * 100)}`;
}

/**
 * Baut je Land seine geglätteten Umriss-Schleifen. Eine Schleife pro
 * zusammenhängender Grenze (Außenküste, Binnengrenzen, Inseln, Enklaven als
 * Löcher). Dient sowohl als Füll-Geometrie (Even-odd) als auch als
 * Grenz-/Küstenlinie — eine Quelle für beides.
 * @param {{q,r,x,y}[]} hexes
 * @param {Map<string,string>} owners  hexKey -> countryKey
 * @returns {Map<string, { loops:{x,y}[][], bbox:{minX,minY,maxX,maxY} }>}
 */
export function buildCountryRegions(hexes, owners) {
  // 1) Grenzkanten je Land sammeln (gegen anderes Land ODER Meer) und einen
  //    eigenen Knoten-Graph pro Land aufbauen.
  const perOwner = new Map(); // owner -> Map(pointKey -> { x, y, edges:[] })
  const getNode = (nodes, x, y) => {
    const k = pointKey(x, y);
    let n = nodes.get(k);
    if (!n) { n = { x, y, edges: [] }; nodes.set(k, n); }
    return n;
  };

  for (const hex of hexes) {
    const owner = owners.get(hexKey(hex.q, hex.r));
    if (!owner) continue; // Meer hat keine eigene Fläche
    let nodes = perOwner.get(owner);
    if (!nodes) { nodes = new Map(); perOwner.set(owner, nodes); }
    const corners = hexCorners(hex.x, hex.y, HEX_SIZE);
    for (let i = 0; i < 6; i++) {
      const dir = EDGE_DIRECTIONS[i];
      const nOwner = owners.get(hexKey(hex.q + dir.q, hex.r + dir.r));
      if (nOwner === owner) continue; // gleiche Nation: keine Grenze
      const a = corners[i];
      const b = corners[(i + 1) % 6];
      const na = getNode(nodes, a.x, a.y);
      const nb = getNode(nodes, b.x, b.y);
      const edge = { na, nb, used: false };
      na.edges.push(edge);
      nb.edges.push(edge);
    }
  }

  // 2) Je Land: Kanten zu Schleifen verketten und glätten.
  const regions = new Map();
  for (const [owner, nodes] of perOwner) {
    const loops = [];
    for (const node of nodes.values()) {
      for (const start of node.edges) {
        if (start.used) continue;
        const pts = walkPath(start, node);
        const closed = pts.length > 2 && samePoint(pts[0], pts[pts.length - 1]);
        loops.push(chaikin(pts, BORDER_SMOOTH_ITERATIONS, closed));
      }
    }
    regions.set(owner, { loops, bbox: bboxOfLoops(loops) });
  }
  return regions;
}

// Läuft von einer Startkante in beide Richtungen, bis kein unbenutzter Anschluss
// mehr existiert (oder die Schleife sich schließt).
function walkPath(startEdge, startNode) {
  startEdge.used = true;
  const fromNode = startNode;
  const toNode = startEdge.na === startNode ? startEdge.nb : startEdge.na;
  const forward = extend(toNode, [fromNode, toNode]);
  // Rückwärts vom Startknoten weiter, Ergebnis vorne anhängen.
  const backward = extend(fromNode, [toNode, fromNode]);
  // backward läuft „verkehrt“; sein Pfad ohne die ersten beiden (=toNode,fromNode)
  // wird umgedreht vorangestellt.
  const prefix = backward.slice(2).reverse();
  return prefix.concat(forward).map((n) => ({ x: n.x, y: n.y }));
}

// Verlängert einen Pfad ab dem letzten Knoten entlang unbenutzter Kanten.
function extend(cur, path) {
  let node = cur;
  let prev = path[path.length - 2];
  // eslint-frei: einfache Schleife
  for (;;) {
    let next = null;
    for (const e of node.edges) {
      if (e.used) continue;
      const other = e.na === node ? e.nb : e.na;
      if (other === prev && node.edges.length > 1) continue; // nicht zurücklaufen
      e.used = true;
      next = other;
      break;
    }
    if (!next) break;
    path.push(next);
    prev = node;
    node = next;
  }
  return path;
}

// Chaikin-Glättung (Corner-Cutting). closed: geschlossene Schleife.
function chaikin(points, iterations, closed) {
  let pts = points;
  for (let it = 0; it < iterations; it++) {
    if (pts.length < 3) break;
    const out = [];
    const n = pts.length;
    if (!closed) out.push(pts[0]);
    const limit = closed ? n : n - 1;
    for (let i = 0; i < limit; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % n];
      out.push({ x: p.x * 0.75 + q.x * 0.25, y: p.y * 0.75 + q.y * 0.25 });
      out.push({ x: p.x * 0.25 + q.x * 0.75, y: p.y * 0.25 + q.y * 0.75 });
    }
    if (!closed) out.push(pts[n - 1]);
    pts = out;
  }
  return pts;
}

function samePoint(a, b) {
  return Math.abs(a.x - b.x) < 0.05 && Math.abs(a.y - b.y) < 0.05;
}

// Umschließende Box über alle Schleifen eines Landes (für Culling).
function bboxOfLoops(loops) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const pts of loops) {
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  return { minX, minY, maxX, maxY };
}
