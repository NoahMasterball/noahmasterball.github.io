// Militär — Single Source of Truth für Fahrzeugkategorien und den Technologiebaum.
// Jede Kategorie (Infanterie, Panzer, Artillerie, Helikopter, Flugzeug) hat je
// Block (West/Ost) eine eigene Reihe von Einheiten in Stufen (tiers). Stufe 2
// setzt die Erforschung von Stufe 1 voraus.
//
// Forschungs- und Baumenü lesen ausschließlich aus dieser Datei; keine Einheit
// wird anderswo hardcodiert.

import { BLOCS } from './alignment.js';

// Anzeigereihenfolge der Kategorien (mit Icon fürs Menü).
export const UNIT_CATEGORIES = [
  { id: 'infantry', label: 'Infanterie', icon: '🪖' },
  { id: 'tank', label: 'Panzer', icon: '🛡️' },
  { id: 'artillery', label: 'Artillerie', icon: '💥' },
  { id: 'helicopter', label: 'Helikopter', icon: '🚁' },
  { id: 'plane', label: 'Flugzeug', icon: '✈️' },
];

// Bauplan je Kategorie: Kosten/Werte je Stufe (Index 0 = Stufe 1, 1 = Stufe 2)
// und die Einheitennamen je Block. researchCost in Geld, buildCost in Geld+Gütern.
// Eine Tabelle statt 20 einzeln gepflegter Objekte — die Einheiten werden daraus
// generiert (DRY/SSOT).
const TECH_TABLE = {
  infantry: {
    research: [50, 150],
    money: [20, 45],
    goods: [4, 9],
    atk: [3, 5],
    def: [3, 6],
    names: {
      west: ['Schützenzug (M16)', 'Mech. Infanterie (M2 Bradley)'],
      east: ['Schützenzug (AK-74)', 'Mech. Infanterie (BMP-2)'],
    },
  },
  tank: {
    research: [200, 500],
    money: [80, 160],
    goods: [30, 55],
    atk: [10, 16],
    def: [9, 15],
    names: {
      west: ['Leopard 1', 'M1 Abrams'],
      east: ['T-72', 'T-80'],
    },
  },
  artillery: {
    research: [180, 450],
    money: [70, 150],
    goods: [25, 50],
    atk: [12, 18],
    def: [3, 5],
    names: {
      west: ['M109 Paladin', 'M142 HIMARS'],
      east: ['2S1 Gvozdika', '2S19 Msta-S'],
    },
  },
  helicopter: {
    research: [300, 700],
    money: [120, 240],
    goods: [40, 75],
    atk: [11, 17],
    def: [6, 9],
    names: {
      west: ['UH-60 Black Hawk', 'AH-64 Apache'],
      east: ['Mi-8', 'Mi-24 Hind'],
    },
  },
  plane: {
    research: [400, 900],
    money: [160, 320],
    goods: [60, 110],
    atk: [15, 22],
    def: [7, 11],
    names: {
      west: ['F-16 Fighting Falcon', 'F-35 Lightning II'],
      east: ['MiG-29', 'Su-57'],
    },
  },
};

// Eindeutiger Tech-Schlüssel. Eine Quelle für die Schlüsselbildung.
export function unitId(bloc, category, tier) {
  return `${bloc}_${category}_${tier}`;
}

// Einheitenliste aus der Tabelle erzeugen (alle Blöcke × Kategorien × Stufen).
function buildUnits() {
  const units = [];
  for (const blocId of Object.keys(BLOCS)) {
    for (const cat of UNIT_CATEGORIES) {
      const t = TECH_TABLE[cat.id];
      const tiers = t.names[blocId].length;
      for (let i = 0; i < tiers; i++) {
        const tier = i + 1;
        units.push({
          id: unitId(blocId, cat.id, tier),
          bloc: blocId,
          category: cat.id,
          tier,
          name: t.names[blocId][i],
          icon: cat.icon,
          researchCost: { money: t.research[i] },
          buildCost: { money: t.money[i], goods: t.goods[i] },
          atk: t.atk[i],
          def: t.def[i],
          // Stufe 2 setzt Stufe 1 derselben Kategorie/Block voraus.
          requires: i > 0 ? unitId(blocId, cat.id, i) : null,
        });
      }
    }
  }
  return units;
}

export const UNITS = buildUnits();
export const UNIT_BY_ID = new Map(UNITS.map((u) => [u.id, u]));

// Alle Einheiten eines Blocks (für die Palette des Spielerlandes).
export function unitsForBloc(blocId) {
  return UNITS.filter((u) => u.bloc === blocId);
}
