// Lokale Feld-Lager — Single Source of Truth für Metall/Zahnräder pro Feld.
// Diese Materialien liegen NICHT in der globalen Landeskasse, sondern im Lager
// genau des Feldes, auf dem sie produziert/abgeladen werden, und lassen sich nur
// per Zug bewegen (siehe core/trains.js). state.js (Produktion/Truppenbau) und
// core/trains.js (Transport) greifen ausschließlich über diese Funktionen zu —
// keine zweite Stelle fasst state.stocks direkt an.

import { FIELD_STOCK_CAP } from '../config/constants.js';
import { LOCAL_RESOURCE_IDS } from '../data/buildings.js';

// Lager eines Feldes (legt es bei Bedarf mit allen lokalen Ressourcen = 0 an).
export function fieldStock(state, key) {
  let s = state.stocks.get(key);
  if (!s) {
    s = {};
    for (const id of LOCAL_RESOURCE_IDS) s[id] = 0;
    state.stocks.set(key, s);
  }
  return s;
}

// Bestand einer lokalen Ressource auf einem Feld (0, wenn kein Lager existiert).
export function stockGet(state, key, res) {
  return state.stocks.get(key)?.[res] ?? 0;
}

// Lagert bis zur Kapazität (FIELD_STOCK_CAP) ein; gibt die tatsächlich
// eingelagerte Menge zurück (Überschuss geht verloren bzw. bleibt beim Aufrufer).
export function stockAdd(state, key, res, amt) {
  if (amt <= 0) return 0;
  const s = fieldStock(state, key);
  const add = Math.min(FIELD_STOCK_CAP - s[res], amt);
  if (add > 0) s[res] += add;
  return add > 0 ? add : 0;
}

// Entnimmt amt, wenn genug vorhanden ist (sonst false, nichts entnommen).
export function stockTake(state, key, res, amt) {
  const s = fieldStock(state, key);
  if ((s[res] ?? 0) < amt) return false;
  s[res] -= amt;
  return true;
}
