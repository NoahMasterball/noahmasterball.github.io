// Gebäudetypen — Single Source of Truth. UI-Bauknöpfe und die Ressourcen-Logik
// lesen ausschließlich aus dieser Liste; keine Gebäudeart wird anderswo hardcodiert.
//
// Jeder Eintrag:
//   id        eindeutiger Schlüssel
//   label     Anzeigename
//   icon      kurzes Symbol fürs Hexfeld
//   color     Füllfarbe des Gebäudes auf der Karte
//   produces  Liste { resource, amount } pro Tick (leer = kein Ressourcenertrag)
//   note      optionaler Hinweis (z. B. für Gebäude ohne Ertrag)
//   military  true = ermöglicht den Bau von Militärfahrzeugen (siehe military.js)

export const RESOURCES = [
  { id: 'food', label: 'Nahrung', icon: '🌾' },
  { id: 'goods', label: 'Güter', icon: '⚙️' },
  { id: 'money', label: 'Geld', icon: '💰' },
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
    id: 'factory',
    label: 'Fabrik',
    icon: '🏭',
    color: '#8a8f99',
    // Fabriken liefern Güter und Geld; profitieren von der Wirtschaftskraft.
    produces: [
      { resource: 'goods', amount: 1 },
      { resource: 'money', amount: 3 },
    ],
    economyScaled: true,
  },
  {
    id: 'outpost',
    label: 'Militäraußenposten',
    icon: '🪖',
    color: '#5a6b4a',
    produces: [],
    military: true,
    note: 'Ermöglicht den Bau erforschter Militärfahrzeuge.',
  },
];

// Schneller Zugriff per id — abgeleitet aus der einen Liste, keine Kopie der Werte.
export const BUILDING_BY_ID = new Map(BUILDINGS.map((b) => [b.id, b]));
export const RESOURCE_BY_ID = new Map(RESOURCES.map((r) => [r.id, r]));

// Ein Gebäude ist ein Militäraußenposten? Eine Quelle für diese Prüfung.
export const MILITARY_BUILDING_IDS = new Set(
  BUILDINGS.filter((b) => b.military).map((b) => b.id),
);
