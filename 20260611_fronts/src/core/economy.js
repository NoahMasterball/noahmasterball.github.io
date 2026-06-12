// Wirtschafts-Balancing — berechnet pro Land zwei Produktions-Multiplikatoren
// und schreibt sie in die Länder-Metadaten. SSOT für die Balancing-Logik.
//
//   outputMul   gilt für JEDES Gebäude (Kleinland-Bonus, fairness-basiert auf
//               der Hexfeld-Anzahl).
//   factoryMul  gilt zusätzlich für Fabriken (Wirtschaftskraft, BIP-basiert).
//
// Wird einmal nach dem Rastern aufgerufen, sobald hexCount und gdp feststehen.

import {
  BALANCE_REF_HEXES, FAIRNESS_MAX, ECONOMY_MAX, GDP_EXP,
  CITY_PROXIMITY_MAX, CITY_PROXIMITY_RANGE,
} from '../config/constants.js';

/**
 * Setzt country.outputMul und country.factoryMul für alle Länder.
 * @param {Map<string,object>} countries  countryKey -> Land-Metadaten
 */
export function applyEconomy(countries) {
  let maxGdp = 0;
  for (const c of countries.values()) if (c.gdp > maxGdp) maxGdp = c.gdp;

  for (const c of countries.values()) {
    // 1) Kleinland-Bonus: wenige Felder -> höherer Ertrag pro Gebäude.
    const hexes = Math.max(1, c.hexCount);
    c.outputMul = clamp(BALANCE_REF_HEXES / hexes, 1, FAIRNESS_MAX);

    // 2) Wirtschaftskraft: hohes BIP -> mehr pro Fabrik (gedämpft via Exponent).
    const ratio = maxGdp > 0 ? c.gdp / maxGdp : 0;
    c.factoryMul = 1 + (ECONOMY_MAX - 1) * Math.pow(ratio, GDP_EXP);
  }
}

// NEW — Stadtnähe-Multiplikator einer Weltposition: je näher an der nächsten
// Stadt, desto höher (linear von CITY_PROXIMITY_MAX direkt an der Stadt auf 1 ab
// CITY_PROXIMITY_RANGE Welteinheiten). SSOT für die Stadtnähe-Formel; wird auf
// das Geld von Fabriken angewandt (siehe core/state.js buildingOutput).
/**
 * @param {{x:number,y:number}} pos        Weltposition (z. B. eines Hexfelds)
 * @param {{x:number,y:number}[]} cities    Städte in Weltkoordinaten
 * @returns {number} Faktor ≥ 1
 */
export function cityProximityMul(pos, cities) {
  if (!cities || !cities.length) return 1;
  let minDistSq = Infinity;
  for (const c of cities) {
    const dx = c.x - pos.x;
    const dy = c.y - pos.y;
    const d = dx * dx + dy * dy;
    if (d < minDistSq) minDistSq = d;
  }
  const t = clamp(Math.sqrt(minDistSq) / CITY_PROXIMITY_RANGE, 0, 1);
  return 1 + (CITY_PROXIMITY_MAX - 1) * (1 - t);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
