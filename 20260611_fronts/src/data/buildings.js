// Gebäudetypen — Single Source of Truth. UI-Bauknöpfe und die Ressourcen-Logik
// lesen ausschließlich aus dieser Liste; keine Gebäudeart wird anderswo hardcodiert.
//
// Jeder Eintrag:
//   id        eindeutiger Schlüssel
//   label     Anzeigename
//   icon      kurzes Symbol fürs Hexfeld
//   color     Füllfarbe des Gebäudes auf der Karte
//   produces  Liste { resource, amount } pro Tick (leer = kein Ressourcenertrag)
//   consumes  Liste { resource, amount } pro Tick, die das Gebäude verbraucht
//             (z. B. Fabrik verbraucht Metall, um Zahnräder zu erzeugen)
//   note      optionaler Hinweis (z. B. für Gebäude ohne Ertrag)
//   military  true = ermöglicht den Bau von Militärfahrzeugen (siehe military.js)

// scope bestimmt, WO eine Ressource gelagert wird (SSOT der Material-Logistik):
//   'global'  zentrale Landeskasse (state.resources) — überall verfügbar.
//   'local'   Lager des einzelnen Feldes (state.stocks) — nur per ZUG bewegbar.
// Metall und Zahnräder sind lokal: Truppen brauchen sie am Bau-Standort, also
// muss man eine Schiene legen und sie per Zug heranschaffen (oder eine Fabrik
// steht im selben Stadtfeld und liefert direkt).
export const RESOURCES = [
  { id: 'food', label: 'Nahrung', icon: '🌾', scope: 'global' },
  { id: 'metal', label: 'Metall', icon: '🪨', scope: 'local' },
  { id: 'gears', label: 'Zahnräder', icon: '⚙️', scope: 'local' },
  { id: 'money', label: 'Geld', icon: '💰', scope: 'global' },
];

export const BUILDINGS = [
  {
    id: 'farm',
    label: 'Farm',
    icon: '🌾',
    color: '#e6c34d',
    produces: [{ resource: 'food', amount: 2 }],
  },
  {
    id: 'mine',
    label: 'Bergwerk',
    icon: '⛏️',
    color: '#9a7b53',
    // Bergwerke fördern Metall in das lokale Feld-Lager (nur per Zug bewegbar).
    produces: [{ resource: 'metal', amount: 2 }],
  },
  {
    id: 'factory',
    label: 'Fabrik',
    icon: '🏭',
    color: '#8a8f99',
    // Fabriken verarbeiten Metall zu Zahnrädern (lokal) und werfen Geld ab
    // (global). Nur die Zahnräder brauchen Metall als Vorprodukt; das Geld
    // (Absatzmarkt) fällt unabhängig an. Profitieren von der Wirtschaftskraft.
    produces: [
      { resource: 'gears', amount: 1 },
      { resource: 'money', amount: 3 },
    ],
    consumes: [{ resource: 'metal', amount: 1 }],
    economyScaled: true,
  },
  {
    id: 'outpost',
    label: 'Militäraußenposten',
    icon: '🪖',
    color: '#5a6b4a',
    produces: [],
    military: true,
    note: 'Vorgeschobener Stützpunkt: baut Infanterie (schwere Technik nur in Städten).',
  },
];

// Schneller Zugriff per id — abgeleitet aus der einen Liste, keine Kopie der Werte.
export const BUILDING_BY_ID = new Map(BUILDINGS.map((b) => [b.id, b]));
export const RESOURCE_BY_ID = new Map(RESOURCES.map((r) => [r.id, r]));

// Ressourcen-Geltungsbereich (id -> 'global'|'local') und die zwei Mengen davon
// — aus der einen RESOURCES-Liste abgeleitet (SSOT, keine zweite Pflegeliste).
export const RESOURCE_SCOPE = new Map(RESOURCES.map((r) => [r.id, r.scope]));
export const GLOBAL_RESOURCE_IDS = new Set(
  RESOURCES.filter((r) => r.scope === 'global').map((r) => r.id),
);
export const LOCAL_RESOURCE_IDS = new Set(
  RESOURCES.filter((r) => r.scope === 'local').map((r) => r.id),
);

// Ein Gebäude ist ein Militäraußenposten? Eine Quelle für diese Prüfung.
export const MILITARY_BUILDING_IDS = new Set(
  BUILDINGS.filter((b) => b.military).map((b) => b.id),
);
