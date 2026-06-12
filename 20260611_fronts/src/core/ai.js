// Bot-KI — steuert alle nicht vom Spieler kontrollierten Länder. Jeder KI-Tick:
//   1. Laufende Truppenbewegungen vorrücken.
//   2. Wirtschaft: gelegentlich eine Fabrik aufs eigene Gebiet setzen und die
//      Front-Garnison Richtung einer von BIP/Größe abhängigen Zielstärke ausbauen.
//   3. Aggression: von einem Grenzfeld aus ein angrenzendes Feindfeld erobern —
//      Truppen marschieren (Reisezeit) und nehmen das Feld Feld für Feld.
// Operiert auf dem übergebenen Zustand; Kampf/Bewegung laufen über core/combat.js.

import { hexKey, hexNeighbors } from './hexgrid.js';
import { indexCountryHexes } from './territory.js';
import { unitId, UNIT_BY_ID } from '../data/military.js';
import {
  addUnits, garrisonAt, stackPower, startMovement, advanceMovements,
} from './combat.js';
import {
  AI_ARMY_BASE, AI_ARMY_GDP_WEIGHT, AI_ARMY_HEX_WEIGHT, AI_ARMY_BUILD_RATE,
  AI_ATTACK_CHANCE, AI_ATTACK_POWER_RATIO, AI_FACTORY_CHANCE, HOME_DEFENSE_BONUS,
  ARMY_SEED_FRACTION, NON_COMBATANT_COUNTRIES,
} from '../config/constants.js';

// Ist dieses Land ein eigenständiger Bot (kein Spieler, nicht eliminiert,
// souveräner Staat mit echten Streitkräften)?
function isActiveBot(state, c) {
  return c.key !== state.playerCountry && !c.eliminated && c.hexCount > 0
    && !NON_COMBATANT_COUNTRIES.has(c.key);
}

function maxGdpOf(countries) {
  let m = 0;
  for (const c of countries.values()) if (c.gdp > m) m = c.gdp;
  return m || 1;
}

// Zielstärke (Angriffspunkte), die ein Bot anstrebt.
function targetPower(c, maxGdp) {
  return AI_ARMY_BASE + AI_ARMY_GDP_WEIGHT * (c.gdp / maxGdp) + AI_ARMY_HEX_WEIGHT * c.hexCount;
}

// Repräsentative Bau-Einheiten eines Blocks/Tiers: Panzer (Angriff) + Infanterie
// (Verteidigung). Tier richtet sich nach der Wirtschaftskraft.
function repUnits(blocId, tier) {
  return {
    tank: UNIT_BY_ID.get(unitId(blocId, 'tank', tier)),
    inf: UNIT_BY_ID.get(unitId(blocId, 'infantry', tier)),
  };
}

// Tier eines Landes nach Wirtschaftskraft (Stufe 2 ab 35 % des Spitzen-BIP).
function techTier(c, maxGdp) {
  return c.gdp / maxGdp > 0.35 ? 2 : 1;
}

// Setzt so viele Panzer (Angriff) + Infanterie (Verteidigung) auf ein Feld, dass
// die Angriffsstärke dort um deltaAtk wächst. 60/40-Mischung Offensive/Defensive.
function addArmyToHex(state, c, key, deltaAtk, tier) {
  if (deltaAtk <= 0 || !key) return;
  const { tank, inf } = repUnits(c.bloc || 'west', tier);
  if (tank) {
    const n = Math.round((deltaAtk * 0.6) / tank.atk);
    if (n > 0) addUnits(state, key, tank.id, n);
  }
  if (inf) {
    const n = Math.round((deltaAtk * 0.4) / inf.def);
    if (n > 0) addUnits(state, key, inf.id, n);
  }
}

// Hexfeld-Schlüssel der Hauptstadt eines Landes (Rückzugsort fürs Aufrüsten,
// falls es gerade keine Front gibt). Ersatzweise das erste eigene Feld.
function homeHex(c) {
  if (c.capital) return hexKey(c.capital.q, c.capital.r);
  return c.hexKeys && c.hexKeys.length ? c.hexKeys[0] : null;
}

// Gesamtstärke der Garnisonen eines Landes (über seine indexierten Felder).
function countryAtk(state, c) {
  let sum = 0;
  for (const k of c.hexKeys || []) sum += stackPower(state.garrisons.get(k), 'atk');
  return sum;
}

// Findet ein Grenzfeld des Bots, das an ein Feindfeld stößt: liefert das eigene
// Feld (fromKey) und das angrenzende Feindfeld (toKey) oder null.
function botFront(state, c) {
  for (const k of c.hexKeys || []) {
    const [q, r] = k.split(',').map(Number);
    for (const nb of hexNeighbors(q, r)) {
      const nk = hexKey(nb.q, nb.r);
      const no = state.owners.get(nk);
      if (no && no !== c.key) return { fromKey: k, toKey: nk, enemyKey: no };
    }
  }
  return null;
}

/**
 * Bewaffnet zu Spielbeginn alle Bots (NICHT den Spieler — der muss seine Truppen
 * selbst produzieren) auf einen Bruchteil ihrer Zielstärke. Die Truppen stehen
 * in der Hauptstadt.
 * @param {object} state
 */
export function seedArmies(state) {
  const maxGdp = maxGdpOf(state.countries);
  for (const c of state.countries.values()) {
    if (c.key === state.playerCountry) continue; // Spieler startet ohne Armee
    if (c.eliminated || c.hexCount <= 0 || NON_COMBATANT_COUNTRIES.has(c.key)) continue;
    addArmyToHex(state, c, homeHex(c), targetPower(c, maxGdp) * ARMY_SEED_FRACTION, techTier(c, maxGdp));
  }
}

// Bots setzen Fabriken nur zur Sichtbarkeit aufs eigene Gebiet (ein Gebäude je
// Feld). Sie umgehen bewusst Bau-Timer und Materialkette — direkt als fertig
// (ticks:0) eingetragen — und produzieren nichts (produceTick verarbeitet nur
// Spielerfelder). Bot-Armeen folgen weiter dem abstrakten BIP-Modell.
function maybeBuildFactory(state, c, rng) {
  if (rng() > AI_FACTORY_CHANCE) return;
  const keys = c.hexKeys;
  if (!keys || !keys.length) return;
  for (let t = 0; t < 5; t++) {
    const k = keys[Math.floor(rng() * keys.length)];
    if (!state.buildings.has(k)) { state.buildings.set(k, [{ id: 'factory', ticks: 0 }]); return; }
  }
}

/**
 * Ein KI-Tick über alle Bots.
 * @param {object} state
 * @param {() => number} [rng]
 */
export function aiTick(state, rng = Math.random) {
  advanceMovements(state, performance.now());  // Bewegungen vorrücken
  indexCountryHexes(state.owners, state.countries); // Felder-Index nach Eroberungen auffrischen
  const maxGdp = maxGdpOf(state.countries);

  for (const c of state.countries.values()) {
    if (!isActiveBot(state, c)) continue;
    maybeBuildFactory(state, c, rng);

    // Aufrüsten an der Front (sonst in der Hauptstadt), damit Truppen dort
    // entstehen, wo sie gebraucht werden.
    const front = botFront(state, c);
    const buildHex = front ? front.fromKey : homeHex(c);
    const gap = targetPower(c, maxGdp) - countryAtk(state, c);
    addArmyToHex(state, c, buildHex, gap * AI_ARMY_BUILD_RATE, techTier(c, maxGdp));

    // Angriff: vom Grenzfeld aufs angrenzende Feindfeld, wenn stark genug.
    if (front && rng() < AI_ATTACK_CHANCE) {
      const atk = stackPower(state.garrisons.get(front.fromKey), 'atk');
      const def = stackPower(state.garrisons.get(front.toKey), 'def') * HOME_DEFENSE_BONUS;
      if (atk > 0 && atk >= Math.max(def * AI_ATTACK_POWER_RATIO, 1)) {
        startMovement(state, c.key, front.fromKey, front.toKey, performance.now());
      }
    }
  }
}
