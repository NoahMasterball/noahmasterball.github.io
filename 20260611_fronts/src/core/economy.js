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

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
