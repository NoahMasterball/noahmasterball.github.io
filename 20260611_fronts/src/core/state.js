// Spielzustand — Single Source of Truth für alle Laufzeitdaten.
// Andere Module lesen diesen Zustand und ändern ihn nur über die hier
// bereitgestellten Funktionen; sie halten keine eigenen Dauerkopien.

import { hexKey, hexDistance } from './hexgrid.js';
import {
  BUILDING_BY_ID, RESOURCE_BY_ID, MILITARY_BUILDING_IDS,
} from '../data/buildings.js';
import { UNIT_BY_ID } from '../data/military.js';
import {
  BUILD_DISTANCE_TIERS, START_RESOURCES,
} from '../config/constants.js';

const state = {
  mode: null,            // gewählter Spielmodus (aus MODES)
  hexes: [],             // alle Hexfelder [{q,r,x,y}]
  hexIndex: new Map(),   // hexKey -> Hexfeld (schneller Zugriff)
  owners: new Map(),     // hexKey -> countryKey
  countries: new Map(),  // countryKey -> Land-Metadaten
  playerCountry: null,   // countryKey des gespielten Landes
  buildings: new Map(),  // hexKey -> buildingId
  selected: null,        // aktuell gewähltes Hexfeld {q,r} oder null
  resources: {},         // resourceId -> Menge
  cities: [],            // Städte [{name,capital,country,pop,x,y}]
  research: new Set(),   // erforschte Einheiten-ids (siehe military.js)
  army: new Map(),       // unitId -> gebaute Anzahl
};

export function getState() {
  return state;
}

// Initialisiert den Zustand für einen frisch gerasterten Modus.
export function initState({ mode, hexes, owners, countries, cities }) {
  state.mode = mode;
  state.hexes = hexes;
  state.hexIndex = new Map(hexes.map((h) => [hexKey(h.q, h.r), h]));
  state.owners = owners;
  state.countries = countries;
  state.cities = cities || [];
  state.playerCountry = null;
  state.buildings = new Map();
  state.selected = null;
  state.research = new Set();
  state.army = new Map();
  state.resources = {};
  for (const r of RESOURCE_BY_ID.keys()) state.resources[r] = START_RESOURCES[r] ?? 0;
}

export function ownerOf(q, r) {
  return state.owners.get(hexKey(q, r)) || null;
}

export function buildingAt(q, r) {
  return state.buildings.get(hexKey(q, r)) || null;
}

export function setPlayerCountry(countryKey) {
  state.playerCountry = countryKey;
}

export function setSelected(hex) {
  state.selected = hex;
}

// Land-Metadaten des Spielers (oder null). Eine Quelle für diesen Zugriff.
export function playerCountryData() {
  return state.countries.get(state.playerCountry) || null;
}

// --- Ressourcen-Konten ------------------------------------------------------
// Kostenobjekt = { resourceId: Menge }. Eine Quelle für „kann ich zahlen?“.
export function canAfford(cost) {
  for (const id in cost) {
    if ((state.resources[id] ?? 0) < cost[id]) return false;
  }
  return true;
}

// Bucht ein Kostenobjekt ab. Setzt canAfford voraus (vorher prüfen).
function spend(cost) {
  for (const id in cost) state.resources[id] -= cost[id];
}

// --- Bauen (Gebäude) --------------------------------------------------------
// Erforderlicher Mindestabstand (Hexschritte) zwischen Gebäuden für das
// Spielerland. Skaliert nach Landesgröße (siehe BUILD_DISTANCE_TIERS); 0 = keine
// Abstandsregel. Erster Tier mit hexCount ≤ maxHexes gewinnt.
function requiredBuildDistance() {
  const hexCount = playerCountryData()?.hexCount ?? 0;
  const tier = BUILD_DISTANCE_TIERS.find((t) => hexCount <= t.maxHexes);
  return tier?.minDistance ?? 0;
}

/**
 * Prüft, ob auf (q,r) gebaut werden darf, und nennt im Fehlerfall den Grund.
 * Bündelt alle Bauregeln an einer Stelle (Eigentum + Mindestabstand).
 * @returns {{ ok: boolean, reason?: string }}
 */
export function canBuild(q, r) {
  if (!state.playerCountry) return { ok: false, reason: 'Kein Land gewählt.' };
  if (ownerOf(q, r) !== state.playerCountry)
    return { ok: false, reason: 'Gehört nicht deinem Land.' };
  if (buildingAt(q, r)) return { ok: false, reason: 'Feld ist schon bebaut.' };
  // Mindestabstand zu bestehenden Gebäuden (in Hexschritten) — skaliert nach
  // Landesgröße, Kleinländer (Abstand 0) sind ausgenommen.
  const minDist = requiredBuildDistance();
  if (minDist > 0) {
    for (const key of state.buildings.keys()) {
      const [bq, br] = key.split(',').map(Number);
      if (hexDistance(q, r, bq, br) <= minDist)
        return { ok: false, reason: `Zu nah an einem Gebäude (Abstand ≥ ${minDist + 1}).` };
    }
  }
  return { ok: true };
}

// Setzt ein Gebäude, falls erlaubt. Gibt dasselbe Ergebnis wie canBuild zurück.
export function placeBuilding(q, r, buildingId) {
  const check = canBuild(q, r);
  if (!check.ok) return check;
  if (!BUILDING_BY_ID.has(buildingId))
    return { ok: false, reason: 'Unbekannter Gebäudetyp.' };
  state.buildings.set(hexKey(q, r), buildingId);
  return { ok: true };
}

// Besitzt der Spieler mindestens einen Militäraußenposten? Eine Quelle dafür.
export function hasMilitaryOutpost() {
  for (const id of state.buildings.values()) {
    if (MILITARY_BUILDING_IDS.has(id)) return true;
  }
  return false;
}

// --- Produktion -------------------------------------------------------------
// Skalierte Produktion eines Gebäudes für das gegebene Land, inkl. Balancing:
// Kleinland-Bonus (outputMul) für alle, Wirtschaftskraft (factoryMul) zusätzlich
// für wirtschaftsskalierte Gebäude (Fabriken). Liefert eine Liste pro Ressource.
// Eine Quelle für die Ertragsformel.
export function buildingOutput(building, country) {
  const outputMul = country?.outputMul ?? 1;
  const factoryMul = building.economyScaled ? (country?.factoryMul ?? 1) : 1;
  return building.produces.map((p) => ({
    resource: p.resource,
    amount: p.amount * outputMul * factoryMul,
  }));
}

// Ein Produktions-Tick: jedes Gebäude trägt seine (balancierte) Produktion bei.
export function produceTick() {
  const country = playerCountryData();
  for (const buildingId of state.buildings.values()) {
    const b = BUILDING_BY_ID.get(buildingId);
    if (!b) continue;
    for (const out of buildingOutput(b, country)) {
      state.resources[out.resource] += out.amount;
    }
  }
}

// --- Forschung --------------------------------------------------------------
export function isResearched(unitId) {
  return state.research.has(unitId);
}

/**
 * Prüft, ob eine Einheit erforscht werden darf.
 * @returns {{ ok:boolean, reason?:string }}
 */
export function canResearch(unitId) {
  const unit = UNIT_BY_ID.get(unitId);
  if (!unit) return { ok: false, reason: 'Unbekannte Einheit.' };
  if (state.research.has(unitId)) return { ok: false, reason: 'Bereits erforscht.' };
  if (unit.requires && !state.research.has(unit.requires))
    return { ok: false, reason: 'Vorgänger erst erforschen.' };
  if (!canAfford(unit.researchCost)) return { ok: false, reason: 'Nicht genug Geld.' };
  return { ok: true };
}

// Erforscht eine Einheit, falls erlaubt. Bucht die Forschungskosten ab.
export function research(unitId) {
  const check = canResearch(unitId);
  if (!check.ok) return check;
  spend(UNIT_BY_ID.get(unitId).researchCost);
  state.research.add(unitId);
  return { ok: true };
}

// --- Einheitenbau -----------------------------------------------------------
export function armyCount(unitId) {
  return state.army.get(unitId) || 0;
}

/**
 * Prüft, ob eine Einheit gebaut werden darf (erforscht + Außenposten + Kosten).
 * @returns {{ ok:boolean, reason?:string }}
 */
export function canBuildUnit(unitId) {
  const unit = UNIT_BY_ID.get(unitId);
  if (!unit) return { ok: false, reason: 'Unbekannte Einheit.' };
  if (!state.research.has(unitId)) return { ok: false, reason: 'Erst erforschen.' };
  if (!hasMilitaryOutpost()) return { ok: false, reason: 'Militäraußenposten nötig.' };
  if (!canAfford(unit.buildCost)) return { ok: false, reason: 'Nicht genug Ressourcen.' };
  return { ok: true };
}

// Baut eine Einheit, falls erlaubt. Bucht die Baukosten ab, erhöht die Anzahl.
export function buildUnit(unitId) {
  const check = canBuildUnit(unitId);
  if (!check.ok) return check;
  spend(UNIT_BY_ID.get(unitId).buildCost);
  state.army.set(unitId, armyCount(unitId) + 1);
  return { ok: true };
}
