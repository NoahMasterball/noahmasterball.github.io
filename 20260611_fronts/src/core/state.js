// Spielzustand — Single Source of Truth für alle Laufzeitdaten.
// Andere Module lesen diesen Zustand und ändern ihn nur über die hier
// bereitgestellten Funktionen; sie halten keine eigenen Dauerkopien.

import { hexKey, hexDistance } from './hexgrid.js';
import {
  BUILDING_BY_ID, MILITARY_BUILDING_IDS,
  RESOURCE_SCOPE, GLOBAL_RESOURCE_IDS,
} from '../data/buildings.js';
import { UNIT_BY_ID, OUTPOST_CATEGORIES } from '../data/military.js';
import { cityProximityMul } from './economy.js';
import {
  addUnits, countryPower as cPower, countryUnitCount, stackSize,
  startMovement, advanceMovements,
} from './combat.js';
import { fieldStock, stockGet, stockAdd, stockTake } from './stocks.js';
import { createTrain as createTrainImpl, cancelTrain as cancelTrainImpl, tickTrains } from './trains.js';
import {
  BUILD_DISTANCE_TIERS, START_RESOURCES, DEFAULT_VIEW_MODE,
  BUILD_TIME_TICKS, NORMAL_FIELD_BUILDING_CAP, CITY_FIELD_BUILDING_CAP, FIELD_STOCK_CAP,
} from '../config/constants.js';

const state = {
  mode: null,            // gewählter Spielmodus (aus MODES)
  hexes: [],             // alle Hexfelder [{q,r,x,y}]
  hexIndex: new Map(),   // hexKey -> Hexfeld (schneller Zugriff)
  owners: new Map(),     // hexKey -> countryKey
  countries: new Map(),  // countryKey -> Land-Metadaten
  adjacency: new Map(),  // countryKey -> Set benachbarter Länder (territory.js)
  playerCountry: null,   // countryKey des gespielten Landes
  buildings: new Map(),  // hexKey -> Array<{id, ticks}>  (ticks>0 = noch im Bau)
  stocks: new Map(),     // hexKey -> { metal, gears }  (lokales Material-Lager, nur per Zug bewegbar)
  rails: new Set(),      // hexKeys mit Gleis (eigenes Gebiet)
  trains: [],            // Züge (Dauer-Pendel, transportieren Material A→B)
  nextTrainId: 1,        // fortlaufende Zug-Nummer (eindeutige id)
  railMode: false,       // UI-Eingabemodus: Schiene legen statt Feld wählen?
  selected: null,        // aktuell gewähltes Hexfeld {q,r} oder null
  selectedCity: null,    // aktuell gewählte Stadt (für Truppenbau) oder null
  resources: {},         // resourceId -> Menge
  cities: [],            // Städte [{name,capital,country,pop,x,y,q,r,id,countryKey}]
  research: new Set(),   // erforschte Einheiten-ids (siehe military.js)
  garrisons: new Map(),  // hexKey -> Map(unitId -> Anzahl)  (Truppen je Feld)
  movements: [],         // laufende Marschbefehle (combat.js)
  troopSource: null,     // Feld {q,r}, von dem aus als Nächstes Truppen ziehen
  dirtyHexes: new Set(), // eroberte Felder, die auf der politischen Karte neu zu malen sind
  warLog: [],            // jüngste Kriegsereignisse (combat.js schreibt hierher)
  mapDirty: false,       // true = Kartenbild nach Gebietswechsel neu zeichnen
  playerDefeated: false, // true = Spielerland wurde annektiert
  viewMode: DEFAULT_VIEW_MODE, // aktive Kartensicht (politisch | terrain)
};

export function getState() {
  return state;
}

// Initialisiert den Zustand für einen frisch gerasterten Modus.
// adjacency (Länder-Nachbarschaft) wird vom Aufrufer mitgegeben (territory.js).
export function initState({ mode, hexes, owners, countries, cities, adjacency }) {
  state.mode = mode;
  state.hexes = hexes;
  state.hexIndex = new Map(hexes.map((h) => [hexKey(h.q, h.r), h]));
  state.owners = owners;
  state.countries = countries;
  state.adjacency = adjacency || new Map();
  state.cities = cities || [];
  state.playerCountry = null;
  state.buildings = new Map();
  state.stocks = new Map();
  state.rails = new Set();
  state.trains = [];
  state.nextTrainId = 1;
  state.railMode = false;
  state.selected = null;
  state.selectedCity = null;
  state.research = new Set();
  state.garrisons = new Map();
  state.movements = [];
  state.troopSource = null;
  state.dirtyHexes = new Set();
  state.warLog = [];
  state.mapDirty = false;
  state.playerDefeated = false;
  state.viewMode = DEFAULT_VIEW_MODE;
  state.resources = {};
  // Nur GLOBALE Ressourcen liegen in der Landeskasse; Metall/Zahnräder sind
  // lokale Feld-Lager (state.stocks) und werden dort lazy angelegt.
  for (const id of GLOBAL_RESOURCE_IDS) state.resources[id] = START_RESOURCES[id] ?? 0;
}

// Setzt die aktive Kartensicht (politisch | terrain). Eine Quelle dafür.
export function setViewMode(mode) {
  state.viewMode = mode;
}

export function ownerOf(q, r) {
  return state.owners.get(hexKey(q, r)) || null;
}

// Alle Gebäude-Einträge eines Feldes (Array von {id, ticks}; ticks>0 = im Bau).
// Eine Quelle für „was steht auf diesem Feld“. Nie das Ergebnis mutieren.
export function buildingsAt(q, r) {
  return state.buildings.get(hexKey(q, r)) || [];
}

// Anzahl belegter Gebäude-Slots eines Feldes (inkl. im Bau befindlicher).
export function fieldBuildingCount(q, r) {
  return buildingsAt(q, r).length;
}

// Ist ein Gebäude-Eintrag fertiggestellt (Bau-Timer abgelaufen)?
export function isBuilt(entry) {
  return entry.ticks <= 0;
}

// Erster Gebäudetyp eines Feldes (oder null). Kompatibilitäts-Helfer für Leser,
// die nur „irgendein Gebäude hier“ brauchen.
export function buildingAt(q, r) {
  return buildingsAt(q, r)[0]?.id || null;
}

// Trägt das Feld einen FERTIGEN Militäraußenposten? (Truppen-Freischaltung.)
export function hasBuiltMilitaryAt(q, r) {
  return buildingsAt(q, r).some((e) => isBuilt(e) && MILITARY_BUILDING_IDS.has(e.id));
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

// Trennt ein gemischtes Kostenobjekt in globalen (Landeskasse) und lokalen
// (Feld-Lager) Anteil — Single Source für die Zerlegung anhand des Scopes.
function splitCost(cost) {
  const global = {};
  const local = {};
  for (const id in cost) {
    (RESOURCE_SCOPE.get(id) === 'local' ? local : global)[id] = cost[id];
  }
  return { global, local };
}

// Reicht das LOKALE Lager des Feldes (q,r) für den lokalen Kostenanteil?
function canAffordLocal(localCost, q, r) {
  const key = hexKey(q, r);
  for (const id in localCost) {
    if (stockGet(state, key, id) < localCost[id]) return false;
  }
  return true;
}

// Bucht den lokalen Kostenanteil vom Feld-Lager ab (vorher canAffordLocal prüfen).
function spendLocal(localCost, q, r) {
  const key = hexKey(q, r);
  for (const id in localCost) stockTake(state, key, id, localCost[id]);
}

// Lokaler Materialbestand eines Feldes als Objekt { metal, gears } (für die UI).
// Hält keine Kopie — liefert die Lagerwerte des Feldes (0, wenn leer).
export function fieldStockAt(q, r) {
  return fieldStock(state, hexKey(q, r));
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
  // Feld-Kapazität: Stadtfelder sind Produktionsknoten (mehrere Gebäude, alle
  // über dasselbe lokale Lager versorgt), normale Felder fassen eines.
  const cap = cityAt(q, r) ? CITY_FIELD_BUILDING_CAP : NORMAL_FIELD_BUILDING_CAP;
  if (fieldBuildingCount(q, r) >= cap)
    return { ok: false, reason: cap > 1 ? `Stadtfeld voll (max ${cap} Gebäude).` : 'Feld ist schon bebaut.' };
  // Mindestabstand zu bestehenden Gebäuden ANDERER Felder (in Hexschritten) —
  // skaliert nach Landesgröße, Kleinländer (Abstand 0) ausgenommen. Das eigene
  // Feld (Abstand 0) ist ausgenommen, sonst blockierte die Regel das Stapeln auf
  // einem Stadtfeld.
  const minDist = requiredBuildDistance();
  if (minDist > 0) {
    for (const key of state.buildings.keys()) {
      const [bq, br] = key.split(',').map(Number);
      if (bq === q && br === r) continue;
      if (hexDistance(q, r, bq, br) <= minDist)
        return { ok: false, reason: `Zu nah an einem Gebäude (Abstand ≥ ${minDist + 1}).` };
    }
  }
  return { ok: true };
}

// Setzt ein Gebäude, falls erlaubt. Es startet im Bau (BUILD_TIME_TICKS Ticks)
// und produziert/wirkt erst nach Fertigstellung. Gibt das canBuild-Ergebnis zurück.
export function placeBuilding(q, r, buildingId) {
  const check = canBuild(q, r);
  if (!check.ok) return check;
  if (!BUILDING_BY_ID.has(buildingId))
    return { ok: false, reason: 'Unbekannter Gebäudetyp.' };
  const key = hexKey(q, r);
  const arr = state.buildings.get(key) || [];
  arr.push({ id: buildingId, ticks: BUILD_TIME_TICKS });
  state.buildings.set(key, arr);
  return { ok: true };
}

// Besitzt der Spieler mindestens einen (fertigen) Militäraußenposten? Eine Quelle dafür.
export function hasMilitaryOutpost() {
  for (const [key, arr] of state.buildings) {
    if (state.owners.get(key) !== state.playerCountry) continue;
    for (const e of arr) if (isBuilt(e) && MILITARY_BUILDING_IDS.has(e.id)) return true;
  }
  return false;
}

// --- Produktion -------------------------------------------------------------
// Stadtnähe-Multiplikator für ein Hexfeld (Fabrik-Geld-Bonus). Eine Quelle für
// „wie nah liegt dieses Feld an einer Stadt“; nutzt die Formel aus economy.js.
export function cityMulAt(q, r) {
  const hex = state.hexIndex.get(hexKey(q, r));
  return hex ? cityProximityMul(hex, state.cities) : 1;
}

// Skalierte Produktion eines Gebäudes für das gegebene Land, inkl. Balancing:
// Kleinland-Bonus (outputMul) für alle, Wirtschaftskraft (factoryMul) zusätzlich
// für wirtschaftsskalierte Gebäude (Fabriken). Der Stadtnähe-Bonus (cityMul)
// gilt nur für das GELD von Fabriken (näher an Städten = mehr Absatz). Liefert
// eine Liste pro Ressource. Eine Quelle für die Ertragsformel.
export function buildingOutput(building, country, cityMul = 1) {
  const outputMul = country?.outputMul ?? 1;
  const factoryMul = building.economyScaled ? (country?.factoryMul ?? 1) : 1;
  return building.produces.map((p) => {
    const global = RESOURCE_SCOPE.get(p.resource) === 'global';
    let amount = p.amount * outputMul;
    if (global) {
      amount *= factoryMul;                         // Wirtschaftskraft nur auf globale Erträge
      if (p.resource === 'money') amount *= cityMul; // Stadtnähe nur auf Geld
    }
    return { resource: p.resource, amount };
  });
}

// Produktion eines fertigen Gebäudes auf Feld `key`: globale Erträge (Geld/
// Nahrung) fließen in die Landeskasse, lokale (Metall/Zahnräder) ins Feld-Lager.
// Verbraucht ein Gebäude Material (Fabrik: Metall→Zahnräder), läuft die lokale
// Produktion nur, wenn der Input vorliegt UND Platz im Lager ist; das Geld der
// Fabrik fällt davon unabhängig an (Absatzmarkt). Eine Quelle für die Tick-Produktion.
function produceBuilding(b, country, key, cityMul) {
  const outs = buildingOutput(b, country, cityMul);
  let convert = true;
  if (b.consumes) {
    const hasInput = b.consumes.every((c) => stockGet(state, key, c.resource) >= c.amount);
    const hasRoom = outs.some((o) => RESOURCE_SCOPE.get(o.resource) === 'local'
      && stockGet(state, key, o.resource) < FIELD_STOCK_CAP);
    convert = hasInput && hasRoom;
  }
  for (const out of outs) {
    if (RESOURCE_SCOPE.get(out.resource) === 'global') {
      state.resources[out.resource] += out.amount;
    } else {
      if (b.consumes && !convert) continue;                 // Zahnräder brauchen Metall + Platz
      stockAdd(state, key, out.resource, out.amount);
    }
  }
  if (b.consumes && convert) {
    for (const c of b.consumes) stockTake(state, key, c.resource, c.amount);
  }
}

// Ein Produktions-Tick: Bau-Timer herunterzählen, fertige Gebäude auf SPIELER-
// eigenen Feldern produzieren lassen (Bots setzen Fabriken in dieselbe Karte;
// erobert der Spieler ihr Gebiet, produzieren sie künftig für ihn), Züge und
// Truppenbewegungen vorrücken.
export function produceTick() {
  const country = playerCountryData();
  // 1) Bau-Timer aller Gebäude herunterzählen (fertig bei ticks <= 0).
  for (const arr of state.buildings.values()) {
    for (const e of arr) if (e.ticks > 0) e.ticks--;
  }
  // 2) Produktion fertiger, spielereigener Gebäude.
  for (const [key, arr] of state.buildings) {
    if (state.owners.get(key) !== state.playerCountry) continue;
    const hex = state.hexIndex.get(key);
    const cityMul = hex ? cityProximityMul(hex, state.cities) : 1;
    for (const e of arr) {
      if (e.ticks > 0) continue;            // noch im Bau
      const b = BUILDING_BY_ID.get(e.id);
      if (b) produceBuilding(b, country, key, cityMul);
    }
  }
  // 3) Züge vorrücken (Material per Schiene transportieren).
  tickTrains(state);
  // 4) Laufende Truppenbewegungen vorrücken (Feld-für-Feld-Eroberung).
  advanceMovements(state, performance.now());
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

// --- Städteauswahl ----------------------------------------------------------
export function setSelectedCity(city) {
  state.selectedCity = city;
}
export function selectedCityData() {
  return state.selectedCity;
}
// Liefert die Stadt auf einem Hexfeld (oder null). Eine Quelle für Stadt-Picking.
export function cityAt(q, r) {
  for (const c of state.cities) {
    if (c.q === q && c.r === r) return c;
  }
  return null;
}

// --- Einheitenbau (in Städten / am Außenposten) -----------------------------
// Anzahl einer Einheit über alle Felder des Spielerlandes.
export function armyCount(unitId) {
  return countryUnitCount(state, state.playerCountry, unitId);
}

// Aktueller Bau-Standort des Spielers aus der Auswahl: eine eigene Stadt (baut
// alles) oder ein eigener Militäraußenposten (baut nur Infanterie). Eine Quelle
// dafür, „wo gerade Truppen gebaut werden können“.
export function currentBuildSite() {
  const city = state.selectedCity;
  if (city && city.countryKey === state.playerCountry) {
    return { type: 'city', label: city.name, q: city.q, r: city.r };
  }
  const sel = state.selected;
  if (sel && ownerOf(sel.q, sel.r) === state.playerCountry) {
    if (hasBuiltMilitaryAt(sel.q, sel.r))
      return { type: 'outpost', label: 'Militäraußenposten', q: sel.q, r: sel.r };
  }
  return { type: null };
}

/**
 * Prüft, ob der Spieler eine Einheit bauen darf. Truppen entstehen nur an einem
 * Bau-Standort: Städte bauen alles, Außenposten nur Infanterie.
 * @returns {{ ok:boolean, reason?:string }}
 */
export function canBuildUnit(unitId) {
  const unit = UNIT_BY_ID.get(unitId);
  if (!unit) return { ok: false, reason: 'Unbekannte Einheit.' };
  if (!state.research.has(unitId)) return { ok: false, reason: 'Erst erforschen.' };
  const site = currentBuildSite();
  if (site.type === 'city') {
    // Städte bauen alle Kategorien.
  } else if (site.type === 'outpost') {
    if (!OUTPOST_CATEGORIES.has(unit.category))
      return { ok: false, reason: 'Nur in Städten baubar.' };
  } else {
    return { ok: false, reason: 'Eigene Stadt oder Außenposten wählen.' };
  }
  // Geld kommt aus der globalen Kasse; Metall/Zahnräder müssen LOKAL am Bau-Feld
  // liegen (per Zug angeliefert oder von einer Fabrik im selben Feld erzeugt).
  const { global, local } = splitCost(unit.buildCost);
  if (!canAfford(global)) return { ok: false, reason: 'Nicht genug Geld.' };
  if (!canAffordLocal(local, site.q, site.r))
    return { ok: false, reason: 'Material fehlt im Feld — per Bahn anliefern.' };
  return { ok: true };
}

// Baut eine Einheit am aktuellen Bau-Standort; sie tritt der Garnison dieses
// Feldes bei (Truppen liegen auf Feldern, nicht abstrakt pro Land). Geld global,
// Material aus dem Feld-Lager.
export function buildUnit(unitId) {
  const check = canBuildUnit(unitId);
  if (!check.ok) return check;
  const site = currentBuildSite();
  const { global, local } = splitCost(UNIT_BY_ID.get(unitId).buildCost);
  spend(global);
  spendLocal(local, site.q, site.r);
  addUnits(state, hexKey(site.q, site.r), unitId, 1);
  return { ok: true };
}

// --- Truppen & Bewegung (Spieler) -------------------------------------------
// Angriffs-/Verteidigungsstärke eines Landes (Summe seiner Garnisonen).
export function countryPower(countryKey, kind) {
  return cPower(state, countryKey, kind);
}

// Anzahl eigener Truppen auf einem Feld (oder 0).
export function troopsAt(q, r) {
  if (ownerOf(q, r) !== state.playerCountry) return 0;
  return stackSize(state.garrisons.get(hexKey(q, r)));
}

// Setzt/merkt das Quellfeld für den nächsten Marschbefehl (oder null).
export function setTroopSource(hex) {
  state.troopSource = hex;
}
export function troopSource() {
  return state.troopSource;
}

/**
 * Schickt die gesamte Garnison von (fromQ,fromR) zum Zielfeld (toQ,toR). Die
 * Truppen marschieren den Weg entlang (Reisezeit je Feld) und erobern unterwegs
 * Feld für Feld. Gibt {ok, legs} oder den Sperrgrund zurück.
 */
export function moveTroops(fromQ, fromR, toQ, toR) {
  return startMovement(
    state, state.playerCountry, hexKey(fromQ, fromR), hexKey(toQ, toR), performance.now(),
  );
}

// --- Schiene (Spieler) ------------------------------------------------------
// Liegt auf (q,r) Gleis?
export function hasRail(q, r) {
  return state.rails.has(hexKey(q, r));
}

// Darf auf (q,r) Gleis gelegt werden? (eigenes Feld, noch kein Gleis)
export function canLayRail(q, r) {
  if (ownerOf(q, r) !== state.playerCountry) return { ok: false, reason: 'Nur auf eigenem Gebiet.' };
  if (hasRail(q, r)) return { ok: false, reason: 'Hier liegt schon Gleis.' };
  return { ok: true };
}

// Schaltet Gleis auf einem eigenen Feld um (legen, falls frei; sonst entfernen).
// Eine Quelle für den Klick im Schiene-Modus. Gibt {ok, reason?} zurück.
export function toggleRailAt(q, r) {
  if (hasRail(q, r)) { state.rails.delete(hexKey(q, r)); return { ok: true }; }
  const check = canLayRail(q, r);
  if (!check.ok) return check;
  state.rails.add(hexKey(q, r));
  return { ok: true };
}

// Schiene-Lege-Modus (UI-Eingabemodus). Eine Quelle dafür.
export function isRailMode() { return state.railMode; }
export function setRailMode(v) { state.railMode = !!v; }
export function toggleRailMode() { state.railMode = !state.railMode; return state.railMode; }

// --- Züge (Spieler) ---------------------------------------------------------
// Ein Feld taugt als Zug-Station, wenn es ein Gebäude trägt (lädt/entlädt Material).
function hasStationKey(key) {
  return (state.buildings.get(key)?.length || 0) > 0;
}

// Richtet einen Zug von Feld a nach Feld b ein (Dauer-Pendel). Beide müssen Gleis
// und ein Gebäude tragen und per Schiene verbunden sein. Gibt {ok, reason?} zurück.
export function createTrain(aq, ar, bq, br) {
  return createTrainImpl(state, hexKey(aq, ar), hexKey(bq, br), hasStationKey);
}

// Bestellt einen Zug ab (Ladung fällt ins aktuelle Feld). Gibt {ok, reason?} zurück.
export function cancelTrain(id) {
  return cancelTrainImpl(state, id);
}
