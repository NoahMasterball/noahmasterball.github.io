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

// Dauer eines Gebäudebaus in Produktions-Ticks (TICK_INTERVAL_MS pro Tick).
// 10 Ticks × 1000 ms = 10 s. Eine Quelle für die Bauzeit.
export const BUILD_TIME_TICKS = 10;
// Wie viele Gebäude ein Feld fasst: Stadtfelder sind Produktionsknoten (3),
// normale Felder fassen eines. Eine Quelle für die Feld-Kapazität.
export const NORMAL_FIELD_BUILDING_CAP = 1;
export const CITY_FIELD_BUILDING_CAP = 3;
// Obergrenze des lokalen Material-Lagers (Metall/Zahnräder) pro Feld. Macht den
// Bahntransport nötig (Felder können nicht beliebig horten) und verhindert
// unbegrenztes Anwachsen. Eine Quelle für die Lagergröße.
export const FIELD_STOCK_CAP = 50;

// --- Schiene & Züge ---------------------------------------------------------
// Metall und Zahnräder lassen sich NUR per Zug zwischen Feldern bewegen. Schiene
// wird Feld-für-Feld auf eigenem Gebiet gelegt; ein Zug pendelt eine feste
// Strecke A↔B und transportiert das Material von A nach B (leer zurück).
// Felder, die ein Zug pro Tick auf seiner Strecke zurücklegt.
export const TRAIN_SPEED_HEXES_PER_TICK = 1;
// Maximale Materialmenge (Metall + Zahnräder zusammen), die ein Zug je Fahrt lädt.
export const TRAIN_CARGO_CAPACITY = 12;
// Schienen- und Zugfarben (Canvas; siehe core/renderer.js).
export const COL_RAIL = '#7a6a4a';
export const COL_RAIL_TIE = '#9c8a63';
export const COL_TRAIN = '#d8552f';
export const RAIL_LINE_WIDTH = 2;

// --- Forschung / Militär ----------------------------------------------------
// Taste, die das Spielmenü (Forschung & Streitkräfte) öffnet/schließt.
export const MENU_KEY = 'Tab';
// Startressourcen des Spielerlandes (nur globale Ressourcen — Metall/Zahnräder
// sind lokale Feld-Lager und starten leer). Damit früh geforscht werden kann.
export const START_RESOURCES = { food: 0, money: 150 };

// --- Kampf & KI -------------------------------------------------------------
// Takt der Bot-KI (ms). Langsamer als der Wirtschaftstakt, damit Kriege nicht
// im Sekundentakt explodieren.
export const AI_TICK_MS = 2500;
// Heimvorteil des Verteidigers: seine Verteidigungsstärke wird multipliziert.
export const HOME_DEFENSE_BONUS = 1.4;
// Wie hart Verluste ausfallen (Anteil der unterlegenen Seite, max). 1 = total.
export const BATTLE_LOSS_SCALE = 0.7;
// Zufallsspanne pro Schlacht (±25 %), damit Kämpfe nicht deterministisch sind.
export const BATTLE_RANDOMNESS = 0.25;
// Ein Bot greift einen Nachbarn nur an, wenn seine Angriffsstärke mindestens
// das Folgende der gegnerischen Verteidigung beträgt.
export const AI_ATTACK_POWER_RATIO = 1.25;
// Wahrscheinlichkeit, dass ein angriffsfähiger Bot pro KI-Tick wirklich angreift.
export const AI_ATTACK_CHANCE = 0.3;
// Bot-Rüstung: Zielstärke ≈ Basis + BIP-Anteil·Gewicht + Hexfelder·Gewicht.
// Wirtschaft (BIP) dominiert bewusst die Fläche — starke Volkswirtschaften wie
// USA/China/Deutschland sollen militärisch führen, nicht bloß flächengroße Länder.
export const AI_ARMY_BASE = 30;
export const AI_ARMY_GDP_WEIGHT = 950; // ×(gdp/maxGdp)
export const AI_ARMY_HEX_WEIGHT = 0.22; // ×hexCount
// Anteil der Ziel-Lücke, den ein Bot pro Tick aufbaut.
export const AI_ARMY_BUILD_RATE = 0.18;
// Wie oft ein Bot pro Tick eine Fabrik auf eigenem Gebiet errichtet (sichtbar).
export const AI_FACTORY_CHANCE = 0.15;
// Anteil der Zielstärke, mit dem alle Länder zu Spielbeginn bewaffnet sind
// (Welt startet gerüstet; Spieler hat eine Anfangsverteidigung).
export const ARMY_SEED_FRACTION = 0.6;
// Länder ohne echte Streitkräfte (keine souveränen Staaten) — von der KI und vom
// Militärsystem ausgenommen.
export const NON_COMBATANT_COUNTRIES = new Set(['Antarctica']);

// --- Truppenbewegung (Feld-für-Feld-Eroberung) ------------------------------
// Reisezeit (ms), die Truppen pro Hexfeld brauchen. 3 Felder ⇒ 3× = 30 s.
export const TROOP_MOVE_MS = 10000;
// Ab diesem Zoom werden Truppenzahlen (Garnisons-Chips) eingeblendet.
export const TROOP_CHIP_MIN_ZOOM = 1.0;
// Obergrenze der Felder, die ein einzelner Marschbefehl-Pfad durchsuchen darf
// (Schutz vor Mega-Pfaden über den ganzen Kontinent).
export const TROOP_PATH_MAX_NODES = 8000;
// Truppen-/Marker-Farben: eigene vs. fremde Truppen.
export const COL_TROOP_PLAYER = '#ffe08a';
export const COL_TROOP_ENEMY = '#e2554b';
export const COL_TROOP_TEXT = '#10141c';

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

// --- Kartensichten ----------------------------------------------------------
// Umschaltbare Ansichten der Karte (Knöpfe unten rechts). Datengetrieben — die
// UI baut die Knöpfe aus dieser Liste, der Renderer wählt die Basisfläche danach.
export const VIEW_MODES = [
  { id: 'political', label: 'Politisch', icon: '🗺️' }, // farbige Länder
  { id: 'terrain', label: 'Terrain', icon: '🌲' },     // Wälder/Wüsten/Eis …
];
export const DEFAULT_VIEW_MODE = 'political';

// --- Terrain-Ansicht (Biome) ------------------------------------------------
// Kantenlänge (Welteinheiten) einer Biom-Zelle beim Rastern der Terrain-Fläche.
// Kleiner = feiner, aber teurer (einmalig beim Vorberechnen).
export const BIOME_CELL = 12;
// Gradgröße einer Rausch-Gitterzelle; bestimmt, wie großflächig Wälder/Wüsten
// fleckenweise variieren (größer = größere zusammenhängende Flecken).
export const BIOME_NOISE_SCALE = 7;
// Biom-Farben, indiziert über den Biom-Schlüssel (siehe core/terrain.js).
export const TERRAIN_COLORS = {
  ICE: '#dde6ec',        // Polkappen / Eis
  TUNDRA: '#a6b0a4',     // Tundra
  TAIGA: '#3c6b4f',      // borealer Nadelwald
  FOREST: '#5b8a4e',     // gemäßigter Wald
  GRASSLAND: '#9cab5e',  // Grasland / Steppe (feucht)
  STEPPE: '#c2b173',     // Halbwüste / Steppe (trocken)
  DESERT: '#d9c187',     // Wüste
  SAVANNA: '#bfa95f',    // Savanne
  TROPICAL: '#7fae5a',   // tropisch (saisonal)
  RAINFOREST: '#2f7d4a', // Regenwald
};

// --- Gebirge (beim Reinzoomen sichtbares Relief) ----------------------------
// Gebirge erscheinen erst ab diesem Zoom (von weit weg unsichtbar/Überfüllung).
export const MOUNTAIN_MIN_ZOOM = 2.2;
// Abstand (Welteinheiten) zwischen geprüften Gipfel-Stichproben (Dichte).
export const MOUNTAIN_SAMPLE_STEP = 15;
// Höhen-Schwelle (siehe terrain.js elevationAt), ab der ein Punkt Gebirge ist.
export const MOUNTAIN_THRESHOLD = 0.82;
// Ab dieser Höhe bekommt ein Gipfel eine Schneekappe.
export const MOUNTAIN_SNOW_THRESHOLD = 0.9;
// Basisgröße eines Gipfel-Symbols in Bildschirm-Pixeln (skaliert mit Höhe).
export const MOUNTAIN_BASE_SIZE = 7;
export const COL_MOUNTAIN = '#6f675b';      // Fels
export const COL_MOUNTAIN_SHADE = '#4f483e'; // Schattseite
export const COL_MOUNTAIN_SNOW = '#eef2f6';  // Schnee

// --- Küstenwellen (animiert) ------------------------------------------------
// Erst ab diesem Zoom werden Wellen gezeichnet (von weit weg unsichtbar/teuer).
export const WAVE_MIN_ZOOM = 1.4;
// Anzahl gleichzeitig laufender Wellenbänder pro Küste.
export const WAVE_BANDS = 3;
// Dauer (ms) eines vollständigen Wellen-Zyklus (auslaufen + verblassen).
export const WAVE_PERIOD_MS = 2800;
// Maximale Breite (Welteinheiten), bis zu der ein Wellenband ins Meer ausläuft.
export const WAVE_MAX_WIDTH = 14;
// Maximale Deckkraft eines frischen Wellenbands (verblasst beim Auslaufen auf 0).
export const WAVE_MAX_ALPHA = 0.45;
// Schaum-Grundfarbe als RGB-Tripel (Deckkraft wird animiert ergänzt).
export const COL_WAVE = '224,240,255';

// --- Einzelwellen im offenen Meer (animiert, nicht geloopt) -----------------
// Verstreute kleine Wellen, die unabhängig voneinander ein-/ausblenden und nach
// ihrer Lebenszeit an einer neuen Zufallsstelle im Meer wieder auftauchen — so
// entsteht kein gleichförmiger Loop, sondern ständig „eine woanders“.
// Anzahl gleichzeitig lebender Einzelwellen im sichtbaren Ausschnitt.
export const AMBIENT_WAVE_COUNT = 16;
// Lebensdauer-Spanne (ms) je Welle (zufällig dazwischen) — entkoppelt die Phasen.
export const AMBIENT_WAVE_LIFE_MIN = 1400;
export const AMBIENT_WAVE_LIFE_MAX = 3200;
// Längenspanne (Welteinheiten) eines Wellenstrichs.
export const AMBIENT_WAVE_SIZE_MIN = 6;
export const AMBIENT_WAVE_SIZE_MAX = 14;
// Strichbreite (Welteinheiten), konstant. Eckige Enden (kein runder Cap), damit
// die Striche kantig wirken.
export const AMBIENT_WAVE_WIDTH = 3;
// Wegstrecke (Welteinheiten), die ein Strich über seine Lebenszeit in seine
// Richtung schiebt, bevor er verblasst.
export const AMBIENT_WAVE_DRIFT = 16;
// Spitzen-Deckkraft eines Strichs (Hüllkurve blendet kurz ein, hält, verblasst).
export const AMBIENT_WAVE_MAX_ALPHA = 0.5;
// Kantenlänge (Welteinheiten) einer Zelle der groben See-Maske; bestimmt, wie
// genau „liegt dieser Punkt im Meer?“ für das Platzieren der Einzelwellen ist.
export const SEA_MASK_CELL = 16;

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
//
// NEW — 3) Stadtnähe (nur Fabrik-Geld): Fabriken nahe an einer Stadt werfen mehr
//    Geld ab (Absatzmarkt). Faktor fällt linear vom Maximum direkt an der Stadt
//    auf 1 ab CITY_PROXIMITY_RANGE Welteinheiten Abstand. Faktor =
//    1 + (CITY_PROXIMITY_MAX - 1) * (1 - clamp(dist / CITY_PROXIMITY_RANGE, 0, 1)).
//    RANGE in Welteinheiten (HEX_SIZE = Hex-Radius), ca. 9 Hexfelder Reichweite.
export const CITY_PROXIMITY_MAX = 3;
export const CITY_PROXIMITY_RANGE = 180;
