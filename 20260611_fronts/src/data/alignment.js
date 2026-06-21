// Bündnis-Zuordnung — Single Source of Truth dafür, welcher Block (Ost/West) ein
// Land militärisch ausrüstet. Bestimmt, welche Fahrzeugpalette ein Land bekommt
// (siehe military.js): westliche (NATO-Doktrin) oder östliche (Sowjet-/China-
// Doktrin) Technik.
//
// Modell: Jedes Land gehört genau einem Block an. Standard ist WEST; nur die
// hier gelisteten Länder sind OST. So muss nur die kürzere Liste gepflegt werden.

export const BLOCS = {
  west: { id: 'west', label: 'West', short: 'NATO-Doktrin', color: '#4a8cff' },
  east: { id: 'east', label: 'Ost', short: 'Sowjet-/China-Doktrin', color: '#d05a4a' },
};

export const DEFAULT_BLOC = 'west';

// Länder mit östlicher Militärtechnik. Namen müssen exakt der GeoJSON-Eigenschaft
// `name` entsprechen (siehe src/data/maps/modern_2020.geojson).
export const EAST_COUNTRIES = new Set([
  'Russia', 'China', 'North Korea',
  'Belarus', 'Kazakhstan', 'Kyrgyzstan', 'Tajikistan', 'Turkmenistan', 'Uzbekistan',
  'Armenia', 'Azerbaijan', 'Mongolia',
  'Vietnam', 'Laos', 'Myanmar', 'Cambodia',
  'Iran', 'Syria', 'Iraq', 'Yemen', 'Afghanistan',
  'Algeria', 'Libya', 'Sudan', 'South Sudan', 'Angola', 'Ethiopia', 'Eritrea', 'Egypt',
  'Cuba', 'Venezuela', 'Nicaragua', 'Bolivia',
  'Republic of Serbia',
  'India', 'Pakistan', 'Bangladesh',
]);

/**
 * Liefert die Block-id ('west' | 'east') für einen Ländernamen.
 * @param {string} countryName  exakter GeoJSON-Name
 */
export function blocOf(countryName) {
  return EAST_COUNTRIES.has(countryName) ? 'east' : DEFAULT_BLOC;
}

// Panzer-Doktrin — bestimmt NUR das Karten-Icon der Truppen-Chips (welches
// Panzerbild ein Land zeigt), unabhängig vom Tech-Baum in military.js.
// Ableitung nach Kontinent: Ost-Block → T-80, westliche Europa-Länder →
// Leopard 2, alle übrigen West-Länder (Amerika, Asien, Thailand, …) → M1 Abrams.
// Bildpfade relativ zur index.html (SSOT für die Panzerbilder).
export const TANK_DOCTRINE = {
  east: { id: 'east', image: 'pictures/T80.png', label: 'T-80' },
  euro: { id: 'euro', image: 'pictures/Leopard2.png', label: 'Leopard 2' },
  american: { id: 'american', image: 'pictures/M1Abrams.png', label: 'M1 Abrams' },
};

/**
 * Liefert die Panzer-Doktrin ('east' | 'euro' | 'american') eines Landes fürs
 * Icon. Ost-Zugehörigkeit kommt aus derselben Quelle wie blocOf (EAST_COUNTRIES).
 * @param {string} countryName  exakter GeoJSON-Name
 * @param {string} continent    GeoJSON-Kontinent (z. B. 'Europe', 'Asia')
 */
export function tankDoctrineOf(countryName, continent) {
  if (blocOf(countryName) === 'east') return 'east';
  return continent === 'Europe' ? 'euro' : 'american';
}
