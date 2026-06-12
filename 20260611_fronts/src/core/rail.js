// Schienennetz — Wegfindung über gelegte Gleise. Reine Ableitung aus state.rails
// (Set von hexKeys mit Gleis); kennt keine Canvas-API. SSOT für „welche Felder
// sind per Schiene verbunden" und „wie kann ich diesen Zug einrichten".

import { hexKey, hexNeighbors } from './hexgrid.js';

/**
 * Kürzester Weg von fromKey nach toKey ausschließlich über Gleis-Felder (BFS über
 * state.rails). Liefert die Schlüsselliste inkl. Start und Ziel oder null, wenn
 * keine durchgehende Schiene existiert. Beide Endpunkte müssen Gleis tragen.
 * @returns {string[]|null}
 */
export function railPath(state, fromKey, toKey) {
  const rails = state.rails;
  if (!rails.has(fromKey) || !rails.has(toKey)) return null;
  if (fromKey === toKey) return [fromKey];
  const prev = new Map([[fromKey, null]]);
  const queue = [fromKey];
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    const [q, r] = cur.split(',').map(Number);
    for (const nb of hexNeighbors(q, r)) {
      const nk = hexKey(nb.q, nb.r);
      if (!rails.has(nk) || prev.has(nk)) continue;
      prev.set(nk, cur);
      if (nk === toKey) return reconstruct(prev, toKey);
      queue.push(nk);
    }
  }
  return null;
}

function reconstruct(prev, toKey) {
  const path = [];
  let k = toKey;
  while (k != null) { path.push(k); k = prev.get(k); }
  path.reverse();
  return path;
}

/**
 * Prüft, ob zwischen zwei Feldern eine gültige Zugstrecke einrichtbar ist: beide
 * tragen Gleis, beide tragen ein Gebäude (Be-/Entladestation) und sind per
 * Schiene verbunden. Eine Quelle für „kann ich diesen Zug einrichten".
 * @param {(key:string)=>boolean} hasStation  liefert true, wenn das Feld ein
 *        Gebäude trägt (Station) — von state.js hereingereicht.
 * @returns {{ ok:boolean, reason?:string, path?:string[] }}
 */
export function railEndpointsValid(state, fromKey, toKey, hasStation) {
  if (fromKey === toKey) return { ok: false, reason: 'Start und Ziel sind dasselbe Feld.' };
  if (!state.rails.has(fromKey) || !state.rails.has(toKey))
    return { ok: false, reason: 'Beide Endpunkte brauchen Gleis.' };
  if (!hasStation(fromKey) || !hasStation(toKey))
    return { ok: false, reason: 'Beide Endpunkte brauchen ein Gebäude (Station).' };
  const path = railPath(state, fromKey, toKey);
  if (!path) return { ok: false, reason: 'Keine durchgehende Schiene zwischen den Feldern.' };
  return { ok: true, path };
}
