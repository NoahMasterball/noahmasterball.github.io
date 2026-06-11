# Fronts — 2D-Weltstrategiespiel

Ein browserbasiertes 2D-Strategiespiel auf einer Hexfeld-Weltkarte. Man wählt ein
Land, baut auf einzelnen Hexfeldern Ressourcen-Gebäude (Farm, Fabrik, …) und
verwaltet so sein Reich. Zwei Spielmodi mit unterschiedlichen Weltkarten:

- **Modern (2020)** — heutige Grenzen *(erster Fokus der Entwicklung)*
- **Zweiter Weltkrieg (1939)** — Grenzen zu Kriegsbeginn

---

## Kernkonzept

| Element        | Beschreibung                                                                 |
| -------------- | --------------------------------------------------------------------------- |
| **Weltkarte**  | Die gesamte Welt, dargestellt als Raster aus **Hexfeldern**.                |
| **Land**       | Jedes real existierende Land ist spielbar und besteht aus vielen Hexfeldern.|
| **Hexfeld**    | Kleinste Einheit. Anwählbar; darauf lassen sich Gebäude errichten.          |
| **Gebäude**    | Farm, Fabrik, … erzeugen Ressourcen auf dem jeweiligen Hexfeld.             |
| **Modi**       | Zwei wählbare Karten: Modern (2020) und 2. Weltkrieg (1939).                |

### Festgelegte Regeln

- **Realistische Grenzen** — die Ländergrenzen entstehen aus echten Geo-Daten
  (GeoJSON-Weltkarte), die einmalig auf das Hexraster gerastert werden. Jedes
  Hexfeld bekommt per Punkt-in-Polygon-Test genau ein Eigentümer-Land.
- **Bau-Abstandsregel** — Gebäude dürfen nicht beliebig dicht stehen. Zwischen
  zwei Gebäuden muss ein Mindestabstand (in Hexfeldern) liegen; direkt
  benachbarte Felder dürfen nicht gleichzeitig bebaut sein. Der Abstand ist eine
  zentrale Konstante (`BUILD_MIN_DISTANCE`).

---

## Spielablauf (Zielbild)

1. **Hauptmenü** → Modus wählen (Modern / WW2).
2. **Land wählen** → ein beliebiges existierendes Land übernehmen.
3. **Spielen** → Hexfelder anklicken, Gebäude bauen, Ressourcen sammeln.

---

## Projektstruktur

```
20260611_fronts/
├── README.md              # Dieses Dokument — Single Source of Truth fürs Konzept
├── index.html             # Einstiegspunkt (Canvas + Menü-Container)
├── src/
│   ├── main.js            # Bootstrap: Initialisierung, Game-Loop
│   ├── config/
│   │   └── constants.js   # ZENTRALE Konstanten (Hex-Größe, Farben, Modi …)
│   ├── core/
│   │   ├── hexgrid.js     # Hex-Mathematik (Axial/Cube, Pixel <-> Hex, Raster)
│   │   ├── geo.js         # Projektion + Rasterung GeoJSON -> Hexfeld→Land, Städte
│   │   ├── borders.js     # Grenz-/Küstenlinien aus dem Raster, Chaikin-geglättet
│   │   ├── camera.js      # Pan/Zoom, Welt <-> Bildschirm
│   │   ├── state.js       # Spielzustand (SSOT für Laufzeitdaten) + Bauregeln
│   │   ├── renderer.js    # Offscreen-Flächen + Grenz-/Städte-Overlay
│   │   └── scenes.js      # Szenen-Umschaltung (welche Szene ist aktiv)
│   ├── data/
│   │   ├── maps/          # Datensätze: *_2020.geojson (Grenzen) + cities_*.json
│   │   ├── buildings.js   # Gebäudetypen + Ressourcen (SSOT)
│   │   ├── alignment.js   # Ost/West-Block je Land -> Fahrzeugpalette (SSOT)
│   │   └── military.js    # Fahrzeugkategorien + Technologiebaum (SSOT)
│   ├── scenes/
│   │   ├── menu.js        # Hauptmenü
│   │   └── game.js        # Spielszene (verdrahtet Laden, Eingabe, Tick)
│   └── ui/
│       ├── panel.js       # HUD + Seitenpanel (Auswahl, Bau-Optionen)
│       └── warmenu.js     # Spielmenü-Overlay: Forschung & Streitkräfte
└── assets/
    └── styles/
        └── main.css       # Zentrale Styles (Farben/Abstände als CSS-Variablen)
```

> Hinweis: Die Länderdaten liegen nicht als statische `countries.js` vor, sondern
> werden zur Laufzeit aus dem GeoJSON gerastert (`geo.js`) — eine Quelle für die
> Geometrie statt doppelter Pflege.

---

## Architekturprinzipien (siehe auch `../CLAUDE.md`)

- **SSOT** — jede Konstante, jeder Wert, jede Logik existiert genau einmal.
  - Konstanten → `src/config/constants.js`
  - Laufzeit-Spielzustand → `src/core/state.js`
  - Farben/Abstände → CSS-Variablen in `main.css`
- **Daten statt Hardcoding** — Länder, Gebäude und Menüpunkte werden aus
  Datenstrukturen generiert, niemals als Markup dupliziert.
- **Trennung von Daten / Logik / Darstellung** — `data/` kennt keine Pixel,
  `renderer.js` kennt keine Spielregeln.

---

## Technischer Ansatz

- **Reines HTML5 + Canvas + JavaScript (ES-Module)** — kein Build-Schritt nötig,
  läuft direkt im Browser (passend zur bestehenden GitHub-Pages-Umgebung).
- Hexfeld-Raster nach dem etablierten **Axial-/Cube-Koordinaten**-Modell.
- Länder-Geometrie wird als Zuordnung *Hexfeld → Land* gehalten (ein Eigentümer
  pro Feld).

---

## Roadmap

### Phase 1 — Grundgerüst
- [x] README & Projektstruktur
- [x] `index.html` + Hauptmenü (Modus-Auswahl Modern / WW2)
- [x] Hex-Grid-Mathematik + Renderer (Weltkarte)

### Phase 2 — Moderne Karte
- [x] Weltkarte als Hexraster mit Ländergrenzen (Modern 2020, Natural-Earth-GeoJSON)
- [x] Länderauswahl (alle 177 Länder spielbar — jedem ist ≥1 Hexfeld garantiert)
- [x] Hexfeld anklicken & auswählen, Kamera mit Pan/Zoom

### Phase 3 — Aufbau
- [x] Gebäude bauen (Farm, Fabrik) inkl. Bau-Abstandsregel (kleine Länder ausgenommen)
- [x] Ressourcen-System (Nahrung, Güter, Geld; Produktion pro Tick)

### Phase 3.5 — Militär & Forschung
- [x] Militäraußenposten als Gebäude (Voraussetzung für Fahrzeugbau)
- [x] Ost/West-Block je Land bestimmt die Fahrzeugpalette (z. B. China → T-80)
- [x] Spielmenü (Taste `Tab` oder HUD-Knopf): Forschung & Streitkräfte
- [x] Fahrzeuge erforschen (Geld) und danach bauen (Geld + Güter):
      Infanterie, Panzer, Artillerie, Helikopter, Flugzeuge — je zwei Stufen

### Phase 4 — Zweiter Weltkrieg *(aktuell)*
- [ ] Karte 1939 als zweiter Datensatz (`ww2_1939.geojson`) — im Menü als „bald“ markiert

---

## Entwicklung

Lokal öffnen: `index.html` im Browser starten (bei ES-Modulen ggf. über einen
lokalen Server, z. B. `python -m http.server`, wegen CORS).
