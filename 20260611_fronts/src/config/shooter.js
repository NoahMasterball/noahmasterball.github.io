// NEW — Konstanten des Multiplayer-Shooters (MCF). Single Source of Truth für
// ALLE festen Werte des 2D-Top-View-Shooters. Waffen, Recoil-/Spray-Verhalten,
// Ökonomie, Runden, Bots, Map-Erzeugung — nichts davon wird anderswo hardcodiert.

// --- Spieltyp-Ebene (Menü) --------------------------------------------------
// Ganz am Anfang wählt man den Spieltyp. Datengetrieben — das Menü baut die
// Karten aus dieser Liste.
export const GAME_TYPES = [
  {
    id: 'strategy',
    label: 'Strategie',
    tag: '2D-Weltstrategie',
    sub: 'Länder führen, Gebiete erobern',
    icon: '🗺️',
  },
  {
    id: 'shooter',
    label: 'MCF',
    tag: 'Multiplayer-Shooter',
    sub: '2D-Top-View — Counter-Strike-Stil',
    icon: '🎯',
  },
];

// --- Match-Konfiguration (im MCF-Setup wählbar) -----------------------------
// Teamgrößen: 1v1 (Duell) oder 5v5.
export const TEAM_SIZES = [
  { id: '1v1', label: '1 vs 1', perTeam: 1 },
  { id: '5v5', label: '5 vs 5', perTeam: 5 },
];
export const DEFAULT_TEAM_SIZE = '5v5';

// Spielmodi: Deathmatch (jeder gegen jeden) oder Team-Deathmatch.
export const SHOOTER_MODES = [
  { id: 'tdm', label: 'Team-Deathmatch', team: true, sub: 'Team gegen Team, wer stirbt ist raus' },
  { id: 'dm', label: 'Deathmatch', team: false, sub: 'Jeder gegen jeden' },
];
export const DEFAULT_SHOOTER_MODE = 'tdm';

// Vorgeschlagener Spielername (Platzhalter). Der Spieler darf ihn ändern.
export const DEFAULT_PLAYER_NAME = 'MCF';

// Runden, die ein Team/Spieler fürs Match-Ende gewinnen muss.
export const MATCH_WINS = 8;
// Länge der Kauf-/Freeze-Phase am Rundenanfang (ms).
export const BUY_TIME_MS = 8000;
// Kurze Pause nach Rundenende, bevor die nächste Runde startet (ms).
export const ROUND_END_MS = 3000;

// --- Spielfeld / Kamera -----------------------------------------------------
// Kantenlänge der (quadratischen) Zufalls-Arena in Weltpixeln.
export const ARENA_SIZE = 1600;
// Rasterweite für die Map-Erzeugung (Zellenkante in Pixeln).
export const MAP_CELL = 64;
// Wandstärke der äußeren Begrenzung (Pixel).
export const WALL_THICKNESS = 24;
// Wieviel Deckungs-/Wandblöcke der Generator im Innenraum streut (Anteil der
// inneren Zellen, 0..1).
export const COVER_DENSITY = 0.10;
// Spieler-Blickfeld: Kamera-Zoom (1 = Weltpixel == Bildschirmpixel).
export const SHOOTER_ZOOM = 1;

// --- Spieler / Bewegung -----------------------------------------------------
// Radius einer Spieler-/Botfigur (Pixel) — auch der Trefferkreis.
export const PLAYER_RADIUS = 14;
// Volle Lebenspunkte. Eine 3er-Salve der M16 (siehe unten) summiert bewusst
// knapp über diesen Wert → alle drei Treffer töten sofort.
export const PLAYER_MAX_HP = 100;
// Laufgeschwindigkeit (Pixel pro Sekunde).
export const MOVE_SPEED = 200;
// Ab dieser Bewegungsgeschwindigkeit (Pixel/s) gilt man als „laufend“ und die
// Waffen streuen deutlich stärker (CS-Mechanik: stehen = genau).
export const MOVING_THRESHOLD = 24;

// --- Genauigkeit / Streuung (CS-Mechanik) -----------------------------------
// Streuung ist ein Kegel-Halbwinkel (Radiant), der auf die Zielrichtung addiert
// wird. Stehen = kleine Basis; Laufen addiert einen großen Anteil.
export const SPREAD_STAND = 0.012;   // fast punktgenau im Stand
export const SPREAD_MOVE_ADD = 0.14; // Laufaufschlag (≈ 8°) — deutlich ungenau

// --- Recoil / Spray-Muster --------------------------------------------------
// Erste Schüsse eines gehaltenen Sprays wackeln nur leicht und IMMER GLEICH
// (deterministisch), damit man das Muster lernen kann. Danach zieht die Waffe
// stark nach links/rechts.
export const SPRAY_LEARN_SHOTS = 10;   // die ersten 10 Schüsse: leichtes Wackeln
// Über wie viele weitere Schüsse der starke Zug auf sein Maximum anwächst.
export const SPRAY_GROW_SHOTS = 12;
// Amplituden (Radiant) des horizontalen Zugs — leicht vs. stark. Werden mit dem
// waffeneigenen recoil-Faktor multipliziert.
export const SPRAY_MILD_AMP = 0.02;
export const SPRAY_STRONG_AMP = 0.11;
// Frequenzen des Zickzacks (wie schnell links/rechts gewechselt wird).
export const SPRAY_MILD_FREQ = 1.7;
export const SPRAY_STRONG_FREQ = 1.15;
// Feuerpause (ms), nach der ein Spray als beendet gilt und der Zähler (und damit
// das Muster) zurückgesetzt wird.
export const SPRAY_RESET_MS = 350;

// --- Crit -------------------------------------------------------------------
// Der letzte Schuss eines gehaltenen Feuerstoßes ist ein Crit und macht das
// Folgende an Schaden (2 = doppelter Schaden). Belohnt kontrolliertes Tap-Feuern.
export const CRIT_MULTIPLIER = 2;
// Zeitfenster (ms) nach dem letzten Schuss, in dem das Loslassen der Maustaste
// diesen Schuss noch zum Crit aufwertet.
export const CRIT_WINDOW_MS = 180;

// --- Granaten ---------------------------------------------------------------
export const GRENADE_FUSE_MS = 1400;     // Zeit bis zur Explosion
export const GRENADE_SPEED = 460;        // Anfangs-Wurfgeschwindigkeit (Pixel/s)
export const GRENADE_FRICTION = 1.8;     // Reibungsverzögerung (1/s), bremst den Wurf
export const GRENADE_RADIUS = 130;       // Explosions-Wirkradius (Pixel)
export const GRENADE_MAX_DAMAGE = 90;    // Schaden im Zentrum (fällt linear nach außen)
export const GRENADE_THROW_COOLDOWN_MS = 700;
export const GRENADE_MAX_CARRY = 2;      // wie viele man gleichzeitig tragen kann
export const GRENADE_PRICE = 300;

// --- Ökonomie ---------------------------------------------------------------
export const START_MONEY = 800;    // Startkapital (reicht in Runde 1 nur für Pistolenkram)
export const MONEY_MAX = 16000;
export const REWARD_KILL = 500;    // Geld pro Kill
export const REWARD_WIN_ROUND = 300;   // Bonus fürs Rundengewinnen
export const REWARD_LOSE_ROUND = 150;  // Trostgeld fürs Verlieren

// --- Waffen (SSOT) ----------------------------------------------------------
// Felder:
//  id, name, class ('pistol'|'smg'|'rifle'), price,
//  damage        — Schaden pro Treffer
//  rpm           — Schuss pro Minute (Feuerrate)
//  mag           — Magazingröße
//  reserve       — Reservemunition
//  fire          — 'auto' | 'semi' | 'burst'
//  burst         — Schüsse pro Salve (nur fire==='burst')
//  recoil        — Multiplikator aufs Spray-Muster (0 = kein Zug)
//  spread        — Multiplikator auf die Basis-Streuung
//  range         — max. Reichweite des Hitscans (Pixel)
//  reloadMs      — Nachladedauer
//  color         — Mündungs-/Kugelfarbe (Canvas)
// Preise skalieren bewusst mit der Stärke (Schaden × Feuerrate).
export const WEAPONS = [
  // Pistolen (Klasse: pistol) — die Runde-1-Pistolenrunde spielt sich hiermit.
  {
    id: 'glock', name: 'Glock-18', class: 'pistol', price: 200,
    damage: 24, rpm: 400, mag: 20, reserve: 80, fire: 'semi',
    recoil: 0.5, spread: 1.0, range: 620, reloadMs: 1500, color: '#ffd36b',
  },
  {
    id: 'p250', name: 'P250', class: 'pistol', price: 300,
    damage: 34, rpm: 300, mag: 13, reserve: 52, fire: 'semi',
    recoil: 0.6, spread: 1.0, range: 660, reloadMs: 1600, color: '#ffd36b',
  },
  {
    id: 'deagle', name: 'Deagle', class: 'pistol', price: 700,
    damage: 63, rpm: 220, mag: 7, reserve: 35, fire: 'semi',
    recoil: 1.1, spread: 1.3, range: 760, reloadMs: 2100, color: '#ffb03a',
  },

  // SMGs (Klasse: smg) — wenig Recoil, wenig Schaden, viel Munition.
  {
    id: 'mp5', name: 'MP5', class: 'smg', price: 1500,
    damage: 26, rpm: 800, mag: 30, reserve: 120, fire: 'auto',
    recoil: 0.55, spread: 1.0, range: 720, reloadMs: 2200, color: '#8fe0ff',
  },
  {
    id: 'p90', name: 'P90', class: 'smg', price: 2350,
    damage: 22, rpm: 900, mag: 50, reserve: 100, fire: 'auto',
    recoil: 0.7, spread: 1.15, range: 700, reloadMs: 3200, color: '#8fe0ff',
  },
  {
    id: 'ump', name: 'UMP-45', class: 'smg', price: 1200,
    damage: 32, rpm: 640, mag: 25, reserve: 100, fire: 'auto',
    recoil: 0.6, spread: 1.05, range: 700, reloadMs: 2400, color: '#8fe0ff',
  },

  // Gewehre (Klasse: rifle) — hoher Schaden, mehr Recoil.
  {
    id: 'ak47', name: 'AK-47', class: 'rifle', price: 2700,
    damage: 38, rpm: 600, mag: 30, reserve: 90, fire: 'auto',
    recoil: 1.25, spread: 1.1, range: 900, reloadMs: 2500, color: '#ff8f5a',
  },
  {
    id: 'm4', name: 'M4', class: 'rifle', price: 3100,
    damage: 33, rpm: 666, mag: 30, reserve: 90, fire: 'auto',
    recoil: 1.0, spread: 1.0, range: 900, reloadMs: 3100, color: '#ff8f5a',
  },
  {
    id: 'm16', name: 'M16 (Salve)', class: 'rifle', price: 3000,
    // Salvenmodus: 3 Schüsse pro Salve. 3×34 = 102 > 100 HP → alle drei Treffer
    // töten sofort. Einzeltreffer bleiben aber nicht-tödlich.
    damage: 34, rpm: 900, mag: 30, reserve: 90, fire: 'burst', burst: 3,
    recoil: 0.9, spread: 0.95, range: 950, reloadMs: 3000, color: '#ff8f5a',
  },
];

// Schnellzugriff-Index und die Standard-Pistole (Runde-1-/Respawn-Ausrüstung).
export const WEAPON_BY_ID = new Map(WEAPONS.map((w) => [w.id, w]));
export const DEFAULT_PISTOL_ID = 'glock';

// Reihenfolge der Klassen im Buy-Menü (datengetrieben gruppiert).
export const WEAPON_CLASS_ORDER = [
  { id: 'pistol', label: 'Pistolen' },
  { id: 'smg', label: 'SMGs' },
  { id: 'rifle', label: 'Gewehre' },
];

// Waffen-Slots des Spielers: primär (SMG/Gewehr) und sekundär (Pistole).
export const SLOT_PRIMARY = 'primary';
export const SLOT_SECONDARY = 'secondary';

// --- Bot-KI -----------------------------------------------------------------
// Reaktions-/Zielverhalten der Bots. Bewusst nicht perfekt (Trägheit + Fehler),
// damit sie schlagbar bleiben.
export const BOT_AIM_ERROR = 0.06;      // Ziel-Ungenauigkeit (Radiant)
export const BOT_REACT_MS = 260;        // Reaktionszeit, bis ein Bot zu feuern beginnt
export const BOT_BURST_MIN = 3;         // min. Schüsse pro Bot-Feuerstoß
export const BOT_BURST_MAX = 8;         // max. Schüsse pro Bot-Feuerstoß
export const BOT_REPATH_MS = 900;       // wie oft ein Bot sein Ziel/Richtung neu wählt
export const BOT_PREFERRED_RANGE = 340; // Wunschabstand zum Gegner

// --- Farben (Canvas — hier, weil Canvas keine CSS-Variablen liest) ----------
export const COL_FLOOR = '#20242e';
export const COL_FLOOR_ALT = '#242935';
export const COL_WALL = '#3a4152';
export const COL_WALL_EDGE = '#4c556b';
export const COL_TEAM_A = '#4a8cff';   // Spieler-Team
export const COL_TEAM_B = '#e2554b';   // Gegner-Team
export const COL_FFA = '#c9a227';      // Deathmatch (jeder eigene Färbung via Index)
export const COL_BULLET = '#fff2b0';
export const COL_GRENADE = '#8fd46b';
export const COL_BLOOD = '#b5322a';
export const COL_CROSSHAIR = 'rgba(255,255,255,0.85)';
export const COL_HP_GOOD = '#5fbf6a';
export const COL_HP_LOW = '#d0553a';
// Menschliche Figuren (Top-View): Hauttöne (pro Figur variiert), Waffe, Beine.
export const SKIN_TONES = ['#e6b98c', '#d29a6e', '#b87b4e', '#8d5a34', '#f0c9a0'];
export const COL_GUN = '#15181f';
export const COL_LEGS = '#2a2f3a';

// --- Figuren-/Waffen-Rendering (Canvas) --------------------------------------
// Licht kommt von oben links → Schlagschatten fallen nach unten rechts.
export const SHADOW_OFFSET_X = 4;
export const SHADOW_OFFSET_Y = 5;
export const SHADOW_ALPHA = 0.35;
// Dauer des Mündungsfeuers nach einem Schuss (ms).
export const MUZZLE_FLASH_MS = 70;
// Schrittfrequenz der Lauf-Animation (Zyklen/s bei voller Geschwindigkeit).
export const WALK_CYCLE_HZ = 3.2;
// Haarfarben (pro Figur variiert, analog zu SKIN_TONES).
export const HAIR_COLORS = ['#241a12', '#4a3320', '#151312', '#6b4a2a', '#3d2d22', '#8a7a5a'];
export const COL_PLAYER = '#7fb4ff';       // Shirt der eigenen Figur (hebt sie vom Team ab)
export const COL_CORPSE = '#5a6472';       // Shirt gefallener Figuren (entsättigt)
export const COL_GUN_DARK = '#0b0d12';     // dunkle Waffenteile (Schaft, Handschutz)
export const COL_GUN_LIGHT = '#454c5c';    // helle Akzente (Rails, Schlittenschiene)
export const COL_STEEL = '#9aa2b1';        // blanker Stahl (z.B. Deagle-Schlitten)
export const COL_WOOD = '#7a4f2a';         // Holzteile (AK-47-Handschutz)
export const COL_WOOD_DARK = '#553517';    // dunkles Holz (AK-47-Schaft)
export const COL_GRENADE_BODY = '#4a5d3a'; // oliver Granatenkörper (COL_GRENADE = HUD-Grün)

// --- Steuerung (Tastenbelegung, SSOT) ---------------------------------------
export const KEYS = {
  up: ['w', 'W', 'ArrowUp'],
  down: ['s', 'S', 'ArrowDown'],
  left: ['a', 'A', 'ArrowLeft'],
  right: ['d', 'D', 'ArrowRight'],
  reload: ['r', 'R'],
  grenade: ['g', 'G'],
  buy: ['b', 'B'],
  primary: ['1'],
  secondary: ['2'],
};
