// Züge — transportieren lokales Material (Metall/Zahnräder) über das Schienennetz.
// Ein Zug pendelt dauerhaft eine feste Strecke A↔B: er lädt in A so viel Material
// wie möglich, fährt nach B, lädt dort ab und fährt LEER zurück nach A, um erneut
// zu laden. Manuell eingerichtet/abbestellt (siehe ui/panel.js, scenes/game.js).
// Operiert auf dem übergebenen Zustand. SSOT für die Transportregeln.

import { railPath, railEndpointsValid } from './rail.js';
import { fieldStock, stockAdd } from './stocks.js';
import { LOCAL_RESOURCE_IDS } from '../data/buildings.js';
import { TRAIN_SPEED_HEXES_PER_TICK, TRAIN_CARGO_CAPACITY } from '../config/constants.js';

// Gesamtmenge auf einem Zug (über alle Materialien).
export function loadTotal(load) {
  let n = 0;
  for (const id of LOCAL_RESOURCE_IDS) n += load[id] || 0;
  return n;
}

// Lädt in A so viel Material wie möglich auf den Zug (bis TRAIN_CARGO_CAPACITY).
function pickup(state, key, load) {
  let room = TRAIN_CARGO_CAPACITY - loadTotal(load);
  if (room <= 0) return;
  const s = fieldStock(state, key);
  for (const res of LOCAL_RESOURCE_IDS) {
    if (room <= 0) break;
    const take = Math.min(s[res], room);
    if (take > 0) { s[res] -= take; load[res] = (load[res] || 0) + take; room -= take; }
  }
}

// Lädt in B das Material ab (bis zur Lager-Kapazität); Überschuss bleibt geladen.
function dropoff(state, key, load) {
  for (const res of LOCAL_RESOURCE_IDS) {
    const carried = load[res] || 0;
    if (carried <= 0) continue;
    const placed = stockAdd(state, key, res, carried);
    load[res] = carried - placed;
  }
}

function emptyLoad() {
  const load = {};
  for (const id of LOCAL_RESOURCE_IDS) load[id] = 0;
  return load;
}

/**
 * Richtet einen Zug auf der Strecke A→B ein (lädt sofort in A). hasStation wird
 * von state.js hereingereicht (prüft, ob ein Feld ein Gebäude trägt).
 * @returns {{ ok:boolean, reason?:string }}
 */
export function createTrain(state, aKey, bKey, hasStation) {
  const check = railEndpointsValid(state, aKey, bKey, hasStation);
  if (!check.ok) return check;
  const load = emptyLoad();
  pickup(state, aKey, load);
  state.trains.push({
    id: state.nextTrainId++,
    aKey, bKey, path: check.path, pos: 0, dir: 1, load,
  });
  return { ok: true };
}

// Bestellt einen Zug ab; die geladene Ware fällt ins Lager des aktuellen Feldes
// (kein Material-Verlust).
export function cancelTrain(state, id) {
  const i = state.trains.findIndex((t) => t.id === id);
  if (i < 0) return { ok: false, reason: 'Zug nicht gefunden.' };
  const t = state.trains[i];
  dropoff(state, t.path[t.pos] ?? t.aKey, t.load);
  state.trains.splice(i, 1);
  return { ok: true };
}

// hexKey des Feldes, auf dem ein Zug gerade steht (für Rendering/Anzeige).
export function trainHexKey(t) {
  return t.path[Math.max(0, Math.min(t.pos, t.path.length - 1))];
}

/**
 * Rückt alle Züge um TRAIN_SPEED_HEXES_PER_TICK vor. Wird einmal pro Produktions-
 * Tick aus state.produceTick aufgerufen. Pfad wird bei Bedarf neu berechnet
 * (z. B. nachdem Gleis entfernt oder ein Feld erobert wurde); bleibt er ungültig,
 * pausiert der Zug.
 */
export function tickTrains(state) {
  for (const t of state.trains) {
    // Pfad noch komplett befahrbar? Sonst neu berechnen, sonst pausieren.
    if (!pathValid(state, t.path)) {
      const np = railPath(state, t.aKey, t.bKey);
      if (!np) { t.idle = true; continue; }
      t.path = np;
      t.pos = Math.min(t.pos, np.length - 1);
    }
    t.idle = false;
    const last = t.path.length - 1;
    t.pos += t.dir * TRAIN_SPEED_HEXES_PER_TICK;
    if (t.pos >= last) {           // in B angekommen: abladen, umkehren
      t.pos = last;
      dropoff(state, t.bKey, t.load);
      t.dir = -1;
    } else if (t.pos <= 0) {       // in A angekommen: aufladen, umkehren
      t.pos = 0;
      pickup(state, t.aKey, t.load);
      t.dir = 1;
    }
  }
}

function pathValid(state, path) {
  for (const k of path) if (!state.rails.has(k)) return false;
  return true;
}
