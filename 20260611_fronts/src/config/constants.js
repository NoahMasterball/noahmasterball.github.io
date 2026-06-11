// Zentrale Konstanten — Single Source of Truth für alle festen Werte.
// Niemals einen dieser Werte anderswo hardcoden; immer von hier importieren.

// NEW — Spielmodi als Daten. Menü, Karten-Loader und Titelanzeige lesen alle
// aus dieser einen Liste, statt Modi an mehreren Stellen zu kennen.
export const MODES = [
  {
    id: 'modern',
    label: 'Modern',
    year: 2020,
    subtitle: 'Die Welt von heute',
    // Pfad zum Geo-Datensatz dieses Modus.
    dataUrl: 'src/data/maps/modern_2020.geojson',
    // Städte (Hauptstädte + Großstädte) dieses Modus.
    citiesUrl: 'src/data/maps/cities_modern_2020.json',
    available: true,
  },
  {
    id: 'ww2',
    label: 'Zweiter Weltkrieg',
    year: 1939,
    subtitle: 'Die Welt zu Kriegsbeginn',
    dataUrl: 'src/data/maps/ww2_1939.geojson',
    // Datensatz folgt in Phase 4; bis dahin im Menü als „bald“ markiert.
    available: false,
  },
];

// Standardmodus, der im Menü vorausgewählt ist.
export const DEFAULT_MODE_ID = 'modern';

// --- Hexraster --------------------------------------------------------------
// Größe (Radius vom Mittelpunkt zur Ecke) eines Hexfelds in Pixeln.
export const HEX_SIZE = 12;
// Ausrichtung: 'pointy' (Spitze oben) oder 'flat' (Kante oben).
export const HEX_ORIENTATION = 'pointy';

// --- Bauen ------------------------------------------------------------------
// Kleine Länder (≤ so viele Hexfelder) sind von der Abstandsregel ausgenommen —
// sonst könnten sie kaum bauen. Eine Quelle für die Kleinland-Schwelle.
export const BUILD_DISTANCE_EXEMPT_MAX_HEXES = 12;
// Mindestabstand zwischen zwei Gebäuden (in Hexfeld-Schritten), skaliert nach
// Landesgröße: Große Länder müssen mehr Abstand halten und können so relativ
// zu ihrer Fläche weniger dicht bauen (Nerf großer Länder). Erster Eintrag mit
// hexCount ≤ maxHexes gewinnt; minDistance 0 bedeutet „keine Abstandsregel“.
export const BUILD_DISTANCE_TIERS = [
  { maxHexes: BUILD_DISTANCE_EXEMPT_MAX_HEXES, minDistance: 0 }, // Kleinländer: frei
  { maxHexes: 60, minDistance: 1 },
  { maxHexes: 150, minDistance: 2 },
  { maxHexes: Infinity, minDistance: 3 }, // Großmächte: weite Streuung erzwungen
];

// --- Forschung / Militär ----------------------------------------------------
// Taste, die das Spielmenü (Forschung & Streitkräfte) öffnet/schließt.
export const MENU_KEY = 'Tab';
// Startressourcen des Spielerlandes, damit früh geforscht werden kann.
export const START_RESOURCES = { food: 0, goods: 0, money: 150 };

// --- Spielfeld / Kamera -----------------------------------------------------
// ZOOM_MIN muss kleiner als der Welt-Fit-Zoom (Bildschirmbreite / MAP_WIDTH)
// sein, sonst passt die ganze Welt nicht ins Bild.
export const ZOOM_MIN = 0.15;
export const ZOOM_MAX = 10;
export const ZOOM_DEFAULT = 1;
// Faktor pro Mausrad-Schritt beim Zoomen.
export const ZOOM_STEP = 1.15;

// --- Weltprojektion ---------------------------------------------------------
// Die Welt wird äquirektangulär in einen Rechteck-„Weltraum“ projiziert.
// lon [-180..180] -> x [0..MAP_WIDTH], lat [90..-90] -> y [0..MAP_HEIGHT].
// Die Kamera skaliert diesen Weltraum auf den Bildschirm. HEX_SIZE ist der
// Hex-Radius in genau diesen Welteinheiten.
export const MAP_WIDTH = 5760;
export const MAP_HEIGHT = MAP_WIDTH / 2;

// Wie oft die Grenzlinien per Chaikin-Verfahren geglättet werden (Treppenkanten
// der Hexfelder runden). Mehr Durchläufe = glatter, aber mehr Punkte.
export const BORDER_SMOOTH_ITERATIONS = 3;
// Breite (Welteinheiten) des Konturstrichs, mit dem jede geglättete Länderfläche
// in ihrer eigenen Farbe nachgezogen wird. Schließt die schmalen Schlitze, die
// das Chaikin-Glätten an Ecken zwischen Nachbarländern hinterlässt. Klein halten,
// sonst franst die Küste ins Meer aus.
export const REGION_FILL_SEAL_WIDTH = 2;

// --- Karten-Farben (Canvas) -------------------------------------------------
// Canvas kann keine CSS-Variablen lesen; Zeichenfarben gehören daher hierher.
export const COL_SEA = '#0c1a2b';
// Grenzlinie zwischen zwei Ländern bzw. Land und Meer (Küste).
export const COL_COUNTRY_BORDER = 'rgba(8,12,18,0.85)';

// Städte-Marker und -Beschriftung.
export const COL_CAPITAL = '#ffd34d';      // Hauptstadt (gold)
export const COL_CITY = '#f0f3f8';         // Großstadt (hell)
export const COL_CITY_LABEL = '#ffffff';
export const COL_PLAYER_OUTLINE = '#ffd34d';
export const COL_SELECTED = '#ffffff';
export const COL_HOVER = 'rgba(255,255,255,0.35)';

// 9-Farben-Palette, indiziert über die GeoJSON-Eigenschaft „color“ (1..9).
// Natural Earth garantiert: keine zwei benachbarten Länder teilen dieselbe Nummer.
export const COUNTRY_PALETTE = [
  '#7fae6e', // 1
  '#d7a05a', // 2
  '#c97d6e', // 3
  '#6e9bc9', // 4
  '#b08fc7', // 5
  '#ccb35a', // 6
  '#6ec2b8', // 7
  '#c96e9e', // 8
  '#8d9bb0', // 9
];

// --- Ressourcen / Wirtschaft ------------------------------------------------
// Intervall (ms), in dem Gebäude Ressourcen produzieren.
export const TICK_INTERVAL_MS = 1000;

// Balancing — zwei pro-Land-Multiplikatoren (siehe core/economy.js):
//
// 1) Kleinland-Bonus (Fairness): Länder mit wenigen Hexfeldern können kaum
//    Gebäude bauen; sie verdienen dafür mehr pro Gebäude. Faktor =
//    clamp(BALANCE_REF_HEXES / hexCount, 1, FAIRNESS_MAX). Ab REF Feldern: 1.
export const BALANCE_REF_HEXES = 60;
export const FAIRNESS_MAX = 6;
//
// 2) Wirtschaftskraft (nur Fabriken): starke Volkswirtschaften (hohes BIP)
//    produzieren mehr pro Fabrik. Faktor =
//    1 + (ECONOMY_MAX - 1) * (gdp / maxGdp)^GDP_EXP.
export const ECONOMY_MAX = 3;
export const GDP_EXP = 0.45;
