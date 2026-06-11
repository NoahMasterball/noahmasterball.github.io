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
