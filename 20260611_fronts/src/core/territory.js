// Territorium — leitet aus dem Eigentums-Raster zwei Dinge ab, die Krieg & KI
// brauchen: (1) welche Länder aneinandergrenzen (Adjazenz) und (2) welche Stadt
// zu welchem Land gehört (inkl. Hauptstadt). Reine Ableitung aus owners/cities;
// kennt keine Canvas-API. SSOT für „wer grenzt an wen“ und „Stadt → Land“.

import { hexKey, pixelToAxial, hexNeighbors } from './hexgrid.js';

/**
 * Landgrenzen-Nachbarschaft: zwei Länder sind benachbart, wenn zwei ihrer
 * Hexfelder direkt aneinanderstoßen.
 * @param {{q,r}[]} hexes
 * @param {Map<string,string>} owners  hexKey -> countryKey
 * @returns {Map<string, Set<string>>}  countryKey -> Menge benachbarter Länder
 */
export function computeAdjacency(hexes, owners) {
  const adj = new Map();
  const link = (a, b) => {
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a).add(b);
  };
  for (const hex of hexes) {
    const owner = owners.get(hexKey(hex.q, hex.r));
    if (!owner) continue;
    for (const n of hexNeighbors(hex.q, hex.r)) {
      const nOwner = owners.get(hexKey(n.q, n.r));
      if (nOwner && nOwner !== owner) { link(owner, nOwner); link(nOwner, owner); }
    }
  }
  return adj;
}

/**
 * Ordnet jede Stadt ihrem Land zu (über das Eigentum ihres Hexfelds, ersatzweise
 * über den Ländernamen) und füllt country.cities / country.capital. Setzt zudem
 * city.id, city.q, city.r und city.countryKey.
 * @param {object[]} cities    aus loadCities (mit x,y in Weltkoordinaten)
 * @param {Map<string,string>} owners
 * @param {Map<string,object>} countries
 */
export function assignCities(cities, owners, countries) {
  // Namensindex für den Ersatzweg (Stadt liegt z. B. auf einem Küsten-Ozeanfeld).
  const byName = new Map();
  for (const c of countries.values()) byName.set(c.name, c.key);

  for (const country of countries.values()) { country.cities = []; country.capital = null; }

  cities.forEach((city, i) => {
    city.id = i;
    const { q, r } = pixelToAxial(city.x, city.y);
    city.q = q;
    city.r = r;
    const owner = owners.get(hexKey(q, r)) || byName.get(city.country) || null;
    city.countryKey = owner;
    if (!owner || !countries.has(owner)) return;
    const country = countries.get(owner);
    country.cities.push(city);
    if (city.capital && !country.capital) country.capital = city;
  });

  // Länder ohne markierte Hauptstadt: erste Stadt als Hauptstadt nehmen.
  for (const country of countries.values()) {
    if (!country.capital && country.cities.length) country.capital = country.cities[0];
  }
}

/**
 * Legt pro Land die Liste seiner Hexfeld-Schlüssel an (country.hexKeys) — von der
 * KI für Fabrikplatzierung gebraucht, damit nicht pro Tick das ganze Raster
 * durchsucht werden muss.
 * @param {Map<string,string>} owners
 * @param {Map<string,object>} countries
 */
export function indexCountryHexes(owners, countries) {
  for (const c of countries.values()) c.hexKeys = [];
  for (const [k, owner] of owners) {
    const c = countries.get(owner);
    if (c) c.hexKeys.push(k);
  }
}
