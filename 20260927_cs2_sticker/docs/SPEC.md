# CS2-Sticker-Workflow — Master Spec

*Status: v0.3 (2026-09-27) — v0.2 vom Besitzer freigegeben. Erstes Ziel: **Cryptids**.
M1-Recherche liegt vor ([`research/cryptids.md`](../research/cryptids.md)), Technik-Fragen
Q5–Q9 geklärt ([`research/tech-sticker-format.md`](../research/tech-sticker-format.md)).
Pipeline SVG → PNG + Vorschau steht; Konzepte `cryptids-01…18-v1` (2 je Richtung A–E, dazu 11–14 = D, 15–18 = E; teils ohne Schrift).
**2026-10-15:** Besitzer: alle 18 einreichen → Workshop-Paket (`cli.py package`: TGA + Masken +
Vorschau + englische Texte, OFL-Fonts). Wartet auf: Workshop-Tools-Installation + Upload (Q13).
**2026-10-15:** + Richtung F „Skin-Craft“: `cryptids-19` (Snallygaster-Bestiarium, Palette `lore` ≈ Dragon Lore,
Foil), `cryptids-20` (Jersey Devil „Subject 1735“, Palette `asiimov`, Holo) — nur Farbe/Stil, eigene Motive (§2.7).
**2026-10-15:** + Richtung G „Smooth“ (Besitzer-Wunsch: weicher, mehr Masse, **keine Schrift**): `cryptids-21…24`
Nessie, Mothman, Kraken, Death Worm — dicke Verlaufslinien + Flächen im Kreis-Badge (`parts/g-badge`), Palette `candy`.
**2026-10-15:** + Richtung H „Dreamcore“: `cryptids-25…27` (Mothman-Wolke, Nessie Liminal Pool, Bigfoot-Treppe
zur Tür) — Bogenfenster mit Pastellhimmel (`parts/h-window`), Palette `dream`, Holo, keine Schrift.
**2026-10-15:** Erster Waffen-Skin des Besitzers (`newhot`, HydroGraphic): Berg-Pattern per `cli.py pattern`
(`pipeline/patterns.py`, Werte `config.MOUNTAINS`) — Besitzer: „so lassen“. HydroGraphic = Pattern auf UV-Inseln →
nur flächige Muster tragen; gezielte Komposition nur per Custom Paint Job (UV-Vorlage nötig).*

> **Lesehinweis für Claude.** Dieses Dokument ist die **einzige Aufzeichnung** des Chats, aus
> dem das Projekt entstanden ist (der Chat selbst existiert nicht mehr). Vor jeder Arbeit an
> diesem Projekt komplett lesen. Abschnitt 2 ist Recherche mit Stand **2026-09-27** — Zahlen,
> Themen und Deadlines können veraltet sein; vor Entscheidungen neu prüfen und hier
> aktualisieren. Antwortstil gegenüber dem Besitzer: **kurz, klar, Bullets, kein Blabla.**

---

## 1. Ziel

Ein KI-gestützter, möglichst automatisierter Workflow, der **CS2-Sticker** für den
**Steam Workshop** erstellt, verfeinert und einreichfertig macht — mit dem Ziel, von Valve
angenommen zu werden (Bezahlung siehe §2.4).

- Der Besitzer gibt Idee, Richtung und Geschmack vor und segnet ab.
- Claude übernimmt Recherche, Entwürfe, technische Pipeline und Vorschau.
- Pro Briefing entsteht automatisch ein Paket: Entwürfe → Varianten → Dateien → Vorschau.
- Warum Sticker (statt Waffen-Skin)? Niedrigere Einstiegshürde, KI-freundlicher
  (klarer Vektor-Stil), Valve fragt aktiv nach Stickern (§2.9).

**Realistische Erwartung:** Lotterie mit beeinflussbaren Quoten. Als Hobby/Portfolio
betreiben, nicht als geplantes Einkommen.

---

## 2. Hintergrund & Recherche (Stand 2026-09-27)

### 2.1 CSFloat & Float

- **CSFloat** ist ein Drittanbieter-Marktplatz für **bereits existierende** CS2-Items aus
  Steam-Inventaren. Man kann dort **keine eigenen Skins/Sticker hochladen**.
- Die CSFloat-API dient nur zum Listen/Kaufen/Verkaufen bestehender Items.
- Creator bekommen von CSFloat (oder anderen Drittmarktplätzen) **keine Provision**, auch
  wenn ihr Item dort gehandelt wird.
- **Float** (Abnutzungswert) wird von Valve **zufällig** beim Entstehen eines Items
  gewürfelt (Case, Drop, Trade-up). Designer bestimmen ihn nicht. Man designt nur die
  Textur; der Float bestimmt, wie abgenutzt sie aussieht.
- Nebenverdienst-Option unabhängig vom Workshop: Trading/Flipping auf CSFloat.

### 2.2 Einziger offizieller Weg: Steam Workshop

- Item mit den CS2-Workshop-Tools bauen → im **Steam Workshop** hochladen.
- **Valve** wählt aus, was ins Spiel kommt (Cases, Collections, Operations, Armory).
- **Hohe Workshop-Bewertung ≠ Annahme.** Upvotes zeigen nur Community-Interesse.

### 2.3 Was man einreichen kann

| Typ | Was genau | Blender relevant? |
| --- | --- | --- |
| Waffen-Finish (Skin) | Textur auf Valves bestehenden Waffenmodellen (UV-Vorlagen von Valve) | für Mockups/Texturarbeit |
| **Sticker** | 2D-Grafik mit Varianten (Paper/Holo/Foil/…) | für Mockup-Renders |
| Charm | kleiner 3D-Anhänger | ja, direkt (Modell) |
| Map | Level (Hammer/Source 2) | teilweise |

- **Nicht möglich:** eigene Messer- oder Waffenmodelle — die macht nur Valve.
- Im Workbench gibt es aktuell **keine Messer**; Messer-Skins werden als Renders mit
  anderer Waffenkategorie hochgeladen.

### 2.4 Bezahlung

- **Früher / weiterhin wählbar:** Umsatzbeteiligung. Laut Sekundärquellen: 25 % bei
  Direktverkauf; bei Cases (Keys) Schätzungen von 10–25 % des Case-Umsatzes, **aufgeteilt
  auf alle Creator des Cases**. Genaue Konditionen stehen unter NDA.
- **Seit 2025-12-06 (CS2 Workshop Update):** optionale *Supplemental Terms* mit
  **Einmalzahlung** (permanente Lizenz an Valve):
  - Waffen-Finish: **35.000 $**
  - **Sticker: 6.000 $**
  - Charm: 6.000 $
- Wer die Supplemental Terms akzeptiert, kann Items auch in der **Armory** haben.
- Creator wählen zwischen Umsatzbeteiligung (Chance auf mehr, unsicher) und Festbetrag
  (planbar, kein Jackpot).
- Viele Items haben **mehrere Autoren** → Geld wird geteilt. Beim Publish werden
  Co-Autoren + Prozent-Split festgelegt; alle müssen zustimmen, bevor jemand bezahlt wird.
- **Für Call-Collections Pflicht:** Supplemental Terms akzeptieren (Call-II-Post:
  „you must agree to Counter-Strike 2's Supplemental terms“) → dort gilt der **Festbetrag**.
  Zustimmung ist optional fürs Veröffentlichen und gilt **accountweit** für alle Items.
- Auszahlung (Basis-Revenue-Share-Terms): ca. 30 Tage nach Monatsende, frühestens 90 Tage
  nach erster Distribution; **Steuerformulare** nötig, Valve kann Steuern einbehalten.
- Supplemental Terms Stand „last updated: 5 December, 2025“ (Workshop Legal Agreement).

### 2.5 Bekannte Verdienste (öffentlich geworden)

| Wer / Was | Betrag | Kontext |
| --- | --- | --- |
| **React** — Desert Eagle, Dead Hand Collection | **35.000 $ einmalig** | März 2026; bestätigt. Vorher **6 Jahre** Einreichungen, fast alle abgelehnt. |
| **TR3x3r** (Danger-Zone-Mapper) | Ø **414.288 $** pro Skin | Aug. 2022, Schätzung aus Case-Ära (Umsatzbeteiligung). Clutch Case = Ausreißer nach oben, Hydra Case = nach unten. |
| Maps **Anubis** & **Tuscan** | je **150.000 $** einmalig | Leak März 2023 (Item-Schema). Anubis hatte 3 Macher. |
| Valve offiziell (2015) | 57 Mio. $ an 1.500 Creator | TF2 + Dota 2 + CS:GO zusammen seit 2011 → Ø ca. 38.000 $/Person |
| Sekundärschätzungen | 5.000–100.000+ $ pro Skin | Lebenszeit, stark abhängig vom Case |

### 2.6 Eigene Nutzung — was geht, was nicht

- **Workbench** (in CS2): eigenen Skin/Sticker **lokal** als Vorschau auf der Waffe ansehen.
- **Matchmaking/Premier:** nur echte Inventar-Items. Eigene Designs dort nicht nutzbar.
- **Community-Server mit „Fake-Skin“-Plugins** verstoßen gegen Valves Regeln.
- Eigene Designs außerhalb des Workshops verkaufen/handeln: **nicht möglich/erlaubt**.

### 2.7 Urheberrecht — der Printstream-Fall

- Idee des Besitzers: „das X vom Printstream als Sticker“. **Abgelehnt**, weil:
  - Printstream gehört den Creatorn (Lizenz an Valve). Einreichen darf man nur Eigenes.
  - Risiko: Meldung/Entfernung, im schlimmsten Fall Account-Ärger.
  - Valve nimmt keine Kopien bestehender Elemente; Community bewertet sowas schlecht.
  - Ein simples „X“ ist nicht geschützt — das **konkrete, erkennbare** Printstream-X schon.
- **Warum die AK-47 | PRINTSTREAM im Workshop okay ist:** Sie ist von **JTPNZ**, dem
  Erfinder der Serie (Deagle 2020-08-06, M4A1-S 2020-12-03, USP-S). Zum 5-jährigen
  Jubiläum hat er eine überarbeitete Serie inkl. **AK-47** und **AWP** veröffentlicht
  („AK-47 | PRINTSTREAM //END+“, Workshop 2025-06-23, laut ihm die letzte
  Printstream-Iteration). Eigenes Design → darf er beliebig fortsetzen.
  **AWP | Printstream ist seit 2025-03-31 im Spiel** (Fever Case); die AK-47 //END+ ist
  Stand 2026-09-25 **nicht** im Spiel (research/cryptids.md §6).
- Fan-Remakes anderer Leute (z. B. „AK-47 Printstream (1440p)“) bekommen Klicks, werden
  aber praktisch nie angenommen.
- Serien vom selben Creator sind normal (Asiimov, Hyper Beast, Neo-Noir …).
- **Faustregel für dieses Projekt: Stil & Farben übernehmen = okay. Konkrete Grafiken
  kopieren = nein.** Strategie: „passt zu Printstream“ statt „kopiert Printstream“
  (Perlweiß/Schwarz/leichter Schimmer, grafische Linien, eigenes Motiv, Craft-Sets).

### 2.8 Chancen realistisch

- Einzelner, zufälliger Sticker ohne Thema: **sehr geringe Chance**. Valve veröffentlicht
  keine Quoten.
- Einwand des Besitzers (berechtigt): Es gibt extrem viele Einreichungen, es wird immer
  bessere geben.
- Was die Lage verbessert: Valve fragt jetzt **gezielt nach Themen** und nimmt ganze
  Collections mit vielen Stickern auf (§2.9).

### 2.9 „Call to Arms-ory“ (Valves Themen-Aufrufe)

| Runde | Aufruf | Themen Waffen | Themen Sticker | Ergebnis |
| --- | --- | --- | --- | --- |
| 1 | 2025-12-06 | Arabeske/arabische Mythologie; Spy/Tech | Auto Racing; Fruits & Vegetables | Deadline erst **2026-02-12 nur auf X** angekündigt (30 Tage Frist), Reminder 03-06, Schluss **2026-03-13**. **2026-07-08** im Spiel: Collections „Spytech“, „Arabesque“ + Sticker **Fruits & Veggies (27)** und **Auto Racing (28)** → ~4 Monate von Schluss bis Release |
| **2 („Call II Arms-ory“)** | **2026-07-16** | Fairy Tales | **Cryptids**; **Pop Art** | **läuft. Keine Deadline angekündigt** (geprüft 2026-09-27: Steam-News-API + @CounterStrike, letzter Post 2026-09-25). Kein Hinweis auf Runde 3. SIH.APP („closing in“) = Spekulation. |

- **Deadline-Muster:** In Runde 1 kam die Deadline ~68 Tage nach Start, **nur auf X**, mit
  30 Tagen Frist. Runde 2 läuft seit 73 Tagen (Stand 2026-09-27) → Ankündigung jederzeit
  möglich, Schluss dann frühestens ca. Ende Oktober 2026 (Ableitung, nicht offiziell).
  → **@CounterStrike auf X beobachten.**
- **Einreichung:** Im Publish-Dialog des **CS2 Workshop Tools** gibt es ein Dropdown
  „Call to Arms“ → **„Enlist for Cryptids“**. Supplemental Terms müssen akzeptiert sein.
  „Bereits veröffentlichte Items **neu einreichen**“ steht nur im Runde-1-Post; der
  Call-II-Post sagt nichts dazu, 296 alte Items tragen den Tag nachträglich → sicherheitshalber
  neu einreichen. Workshop-Tag-Gruppe heißt „Call to Arms“.
- Keine offizielle Regel zu Einzelsticker vs. Set und kein Limit pro Creator gefunden.
  Das Publish-Tool nimmt vermutlich **ein Sticker Kit pro Workshop-Item** → jeder Sticker
  ist ein eigenes Item (Sekundärquelle).
- Laut SIH.APP stellt Valve die Collections **von Hand aus Werken verschiedener Künstler**
  zusammen. In Runde 1 kam **jedes Design nur in einem Finish** ins Spiel (Paper, Glitter,
  Holo, Foil oder Lenticular; csdelta.com, in den Spieldateien bestätigt, §3).
- Valve weicht laut Style Guide **häufig von Workshop-Votes ab** und schaut auf Künstler mit
  breitem Portfolio.
- Konkurrenz Runde 2 (eigene Zählung 2026-09-27): Cryptids **1.087 neue Items / 128 Creator**,
  Pop Art 1.314 / 146 → Cryptids nur **relativ** dünner (SIH nannte es „dünn“). Cryptids
  bleibt erstes Ziel (Besitzer-Entscheidung 2026-09-27). Lücken und Zahlen:
  [`research/cryptids.md`](../research/cryptids.md).
- Rund 55 angenommene Sticker in Runde 1 → deutlich mehr Plätze als in der alten Case-Ära.

### 2.10 Was Top-Einreichungen auszeichnet (Analyse Runde 2, SIH.APP-Blog)

- **Mechanische Innovation:** Lenticular-Effekte, die animieren/interagieren (Kassette spult,
  Pixel-Figur läuft).
- **Thematische Geschlossenheit:** „POP ART * FRAGMENTS“ — mehr als ein Dutzend Teile in
  **einer** Bildsprache statt Einzelmotiven.
- **Craft-Nutzen:** „The Observer“ passt auf viele Finishes, flexibel platzierbar.
- **Nostalgie/Kultur:** 1999-Mixtape-Kassette.
- **Cryptids:** „Flash-Files“ (X-Files-Anspielung + Ingame-Mechanik + **Scrape-Reveal**:
  versteckte Ebene erscheint beim Abkratzen), **Filmstreifen als Lenticular-Format**
  („schärfste, originellste Umsetzung“ — aber **doppelt belegt**, also nicht nutzen),
  „Blindspot“ (Cryptid im Rückspiegel; nutzt Pop-Wendigo-Bildsprache → kein Vorbild).
- **Lenticular = Lücke:** nur 1,4 % der Cryptids-Items, aber 5 der Top-7 nach Favoriten
  (eigene Auswertung, research/cryptids.md §2).

### 2.10a Inhaltsregeln & KI (Stand 2026-09-27)

- **Keine CS2-/Workshop-spezifische KI-Regel** gefunden (FAQ, Style Guide, Supplemental
  Terms, Call-Posts). Steams KI-Offenlegungspflicht gilt für Spiele, nicht für Workshop-Items.
- **Bindend:** Steam Subscriber Agreement §6.B — der Beitrag muss „**originally created by
  you**“ sein, mit ausreichenden Rechten.
- **CS2 Workshop FAQ:** Bilder aus dem Internet (auch abgepaust) = Urheberrechtsverletzung →
  Entfernung, evtl. **Workshop-Community-Bann**. „Please make your own art from scratch.“
- **Automatische Ablehnung** bei: bestehendem IP, Werbe-Designs, **nationalen, politischen
  oder religiösen Symbolen**.
  → Für Cryptids relevant: Wesen aus lebenden indigenen/religiösen Traditionen (z. B.
  Skinwalker, Wendigo) meiden oder sehr vorsichtig behandeln. Moderne Schöpfungen (Slender
  Man, SCP, Backrooms, Siren Head, Creepypastas) sind verboten. Risiko-Liste pro Kryptide
  (ok / meiden / verboten): [`research/cryptids.md`](../research/cryptids.md) §3.
- Kein bestätigter Fall, dass Valve eine Call-Einreichung wegen KI abgelehnt hat. Es gab
  aber Community-Kritik an vermuteter KI-Art (Music-Kit-Cover 2024).
- **Folgerung für dieses Projekt:** Claude erzeugt Vektorgrafik per Code (keine Bild-KI mit
  fremden Trainingsbildern). Der Besitzer führt die Art Direction und überarbeitet die
  Motive. Restrisiko bleibt, weil „originally created by you“ bei KI-Unterstützung
  rechtlich nicht geklärt ist.

### 2.11 Erfolgsfaktoren (verbindlich für den Workflow)

1. **Aktuelles Call-Thema** treffen (bevorzugt Cryptids).
2. **Set statt Einzelsticker:** möglichst viele Sticker in **einer** Bildsprache — keine
   Obergrenze (Besitzer-Entscheidung 2026-09-27). Qualität und Geschlossenheit vor Masse.
   Da Valve Collections aus Einzelwerken zusammenstellt, muss **jeder Sticker auch allein
   funktionieren**.
3. **Effekte ausreizen:** Lenticular, Holo, Foil — technisch sauber. Aber: Runde 1 war
   ~45 % Paper, ~11 % Lenticular → **das Set muss als Paper tragen**, Lenticular ist die Kür.
4. **Clevere Idee/Story** schlägt reine Politur.
5. **Craft-tauglich:** passt auf viele (beliebte) Skins, flexibel platzierbar. In CS2 sind
   Sticker frei platzier- und drehbar → Sticker-Crafts sind ein großer Trend; farblich
   passende Sticker zu Top-Skins (Printstream, Asiimov, Neo-Noir) sind gefragt. 2026 laufen
   viele Crafts auf **dunklen Budget-Skins** mit **angekratzten Stacks** → auf Schwarz/Grau
   lesbar (helle Kontur), flache Farbflächen, sieht auch angekratzt gut aus.
6. **Präsentation:** starke Vorschaubilder auf beliebten Skins; aktiv teilen (X, Reddit);
   Skin-Accounts reposten gute Einreichungen.
7. **Dranbleiben:** jede Runde ist eine neue Chance.
8. **Nicht spammen:** intern viel iterieren, nur die besten veröffentlichen.

---

## 3. Technische Anforderungen (CS2 Workshop Tools)

*Details, Belege, Konfidenz: [`research/tech-sticker-format.md`](../research/tech-sticker-format.md)
(Stand 2026-09-27, u. a. aus den Spieldateien gemessen). Valves Sticker-Guide
(counter-strike.net/workshop/workshopstickers) ist **Source-1-Stand** (VMT, `$DecalStyle`,
PSD) → für CS2 veraltet.*

- **Einreichung:** DLC „Counter-Strike 2 Workshop Tools“ → **Workshop Item Editor** →
  Sticker Kit (`.econitem`) anlegen → Style wählen → TGA-Texturen verknüpfen → **Publish**.
  Die `.vmat` erzeugt der Editor. **Kein VMT, kein PSD nötig** (wahrscheinlich).
- **1 econitem = 1 Sticker = 1 Finish.** „Mind. 2 Stile pro Einreichung“ steht nur im alten
  Guide → für CS2 unklar (Q13).
- **Auflösung: 1024 × 1024**, quadratisch (sicher: 269 von 276 Community-Stickern im Spiel).
  Motivform frei über Alpha. Rand: keine offizielle Vorgabe (im Spiel meist ~1 %).
- **Wear Mask** (Graustufe): Schwarz = unsichtbar, dunkel = wird zuerst abgekratzt,
  Weiß = hält am längsten. **Keine Kratzer/Grime** ins Motiv malen — Abnutzung macht das Spiel.
- Finishes (Valve-Templates im Spiel: paper, glitter, holographic, foil):

| Finish | Texturen (TGA, 1024²) | Hinweis |
| --- | --- | --- |
| Paper | Albedo (+ Wear Mask) | Basis |
| Glitter | Albedo + Normal Map + **Glitter Mask** | Maske: Weiß = viel Glitzer; ohne Normal Map = flach |
| Holo | Albedo + **Holo Mask** + **Holo Spectrum** | Maske: R = Holo-Stärke, G/B = Versatz im Spectrum; Spectrum-Größe frei |
| Foil | Albedo + **Normal Map** (opt. Roughness Mask) | Normal-Map-Konvention (DirectX/OpenGL) offen |
| **Lenticular** | wie Holo; Spectrum = **Bild-Atlas mit Frames** statt Regenbogen | im Spiel seit **2024-02-07**; linear oder radial (über G-Kanal); kein eigenes Template → vermutlich Style „Holographic“; Formel offen (Q7) |

- Runde 1: jedes Motiv kam nur in **einem** Finish ins Spiel (in Spieldateien bestätigt).
- Valve-Ressourcen (counter-strike.net/workshop/workshopresources): Waffen-UV-Sheets,
  `cs2_weapon_model_geometry.zip` — **keine Sticker-Vorlagen**; die liegen im Spiel bzw. in
  den Workshop Tools.

---

## 4. KI — Können & Grenzen

**Claude kann:**
- Markt-/Trend-Recherche (Web; ggf. CSFloat-API für Farbpaletten beliebter Skins).
- Sticker als **SVG** (Vektor) erzeugen — viele Varianten in kurzer Zeit.
- Per Python: TGA-Export mit Alpha, Wear-/Holo-/Glitter-Masken, Holo- und
  Lenticular-Spectren, Normal Maps (§3).
- Blender steuern: per Python-Skript (`blender --background --python …`) oder interaktiv
  über ein Blender-MCP-Addon. Sticker auf Waffenmodelle legen, Mockups rendern.
- Titel, Beschreibung, Social-Posts formulieren.

**Claude kann nicht / Grenzen:**
- **Keine Rasterbilder „malen“.** Stärke = cleaner Vektor-/Grafikstil.
- Gemalter Look → Besitzer selbst oder Bild-KI. **Rechte an Bild-KI-Output unklar** →
  eigenes Design ist sicherer (Valve-Policy zu KI-Inhalten: §2.10a).
- Idee und Geschmack kommen vom Besitzer.
- **Kein Upload auf Steam** — das macht der Besitzer selbst mit seinem Account.

---

## 5. Workflow (Vorschlag — zur Freigabe)

### 5.1 Rollen

| Rolle | Aufgaben |
| --- | --- |
| **Besitzer** | Thema/Idee/Stimmung vorgeben, Entwürfe auswählen, Feedback, Endfreigabe, Upload, Promotion |
| **Claude** | Recherche, Entwürfe, Varianten, Export, Mockups, Vorschau, Texte |

### 5.2 Phasen & Freigabe-Gates

| # | Phase | Output | Gate (Besitzer) |
| --- | --- | --- | --- |
| 0 | **Setup & Klärung** | Offene Fragen (§8) beantwortet, Tools installiert | — |
| 1 | **Recherche** | `research/<call>.md`: Thema, Top-Einreichungen, Lücken, Farbpaletten | Richtung wählen |
| 2 | **Briefing** | `stickers/<set>/brief.md` (Thema, Motiv-Ideen, Stimmung, Ziel-Skins) | Briefing okay |
| 3 | **Konzepte** | 10–20 SVG-Entwürfe + HTML-Vorschau | **Auswahl** |
| 4 | **Verfeinern** | Iterationen per Anweisung („dicker Rand“, „mehr Kontrast“ …) | **Motiv final** |
| 5 | **Produktion** | Finishes (Paper/Glitter/Holo/Foil/Lenticular) als TGA-Texturen je Finish (§3) | — |
| 6 | **Mockups** | Blender-Renders auf Waffenmodellen/beliebten Skins, Workshop-Vorschaubilder | **Endfreigabe** |
| 7 | **Einreichung** | Titel, Beschreibung, Checkliste; Besitzer lädt hoch | Upload |
| 8 | **Promotion** | Post-Texte für X/Reddit | Posten |

„Vollautomatisch“ heißt: Phasen 3 und 5–6 laufen auf einen Befehl ohne Zwischenfragen.
Menschliche Gates bleiben bei Auswahl, Motiv-Final und Endfreigabe.

### 5.3 Interaktion (Befehle an Claude)

| Befehl (sinngemäß) | Claude macht |
| --- | --- |
| `Recherche <Thema/Call>` | Phase 1, schreibt `research/…md` |
| `Neues Set: <Briefing>` | Phase 2 + 3: Brief anlegen, Konzepte erzeugen, Vorschau aktualisieren |
| `Verfeinere <ID>: <Anweisung>` | neue Version des Stickers (alte bleibt erhalten), Vorschau aktualisieren |
| `Mehr wie <ID>` | Varianten im Stil eines Entwurfs |
| `Produziere <ID>` | Phase 5 + 6 komplett |
| `Einreichpaket <Set>` | Phase 7: Checkliste + Texte + Dateiliste |

- IDs: `<set>-<nr>-v<version>`, z. B. `cryptids-03-v2`.
- Feedback gibt der Besitzer im Chat unter Nennung der ID.

### 5.4 HTML-Vorschau

Lokale Seite `preview/index.html`, generiert aus einem Manifest (keine handgepflegten Listen):

- Alle Sticker eines Sets als Galerie, mit ID und Version.
- **Lesbarkeitstest:** jeder Sticker in 32/64/128/512 px.
- Heller und dunkler Hintergrund.
- **Varianten nebeneinander:** Paper, Glitter, Holo (CSS-Schimmer-Simulation über die
  Holomaske), Foil, Lenticular (Frames per Hover/Scroll).
- **Auf Waffe:** 2D-Overlay auf Skin-Screenshots bzw. die Blender-Renders aus Phase 6.
- Option später: als privates Artifact veröffentlichen, um sie auf dem Handy/mit anderen
  anzuschauen.

---

## 6. Technische Architektur (Vorschlag)

### 6.1 Ordnerstruktur

```
20260927_cs2_sticker/
├── README.md                 # Kurzüberblick + Link hierher
├── docs/SPEC.md              # dieses Dokument (SSoT für Plan & Recherche)
├── docs/svg-format.md        # SVG-Quellformat (Klassen statt Farben, data-Attribute, Frames)
├── research/                 # Recherche-Notizen pro Call/Thema
├── pipeline/
│   ├── config.py             # SSoT: Pfade, Auflösung, Paletten, Strichstärken, Schriften, Richtungen  ✔
│   ├── sources.py            # SVG-Quellen finden + gegen Format prüfen                              ✔
│   ├── svg_render.py         # SVG → PNG mit Alpha; Palette/Frame per Stylesheet                      ✔
│   ├── export.py             # Workshop-Paket: TGA, Wear-/Holo-/Glitter-Masken, Spectren, Normal Maps  ✔
│   ├── manifest.py           # baut preview/manifest.js                                               ✔
│   ├── blender_mockup.py     # läuft in Blender: Waffenmodell laden, Decal setzen, rendern
│   └── cli.py                # build / render / preview (✔), später package
├── stickers/<set>/
│   ├── brief.md
│   ├── src/<id>.svg          # Quell-Entwürfe (versioniert)
│   ├── parts/<name>.svg      # gemeinsame Set-Teile, per data-include eingebunden (Q16)         ✔
│   └── out/<id>/             # generiert: <palette>[-<frame>].png, später tga, masks, renders
├── preview/index.html        # liest manifest.js (JS statt JSON → läuft auch per Doppelklick)  ✔
└── assets/                   # Valve-Ressourcen (UV-Sheets, Waffenmodelle) — nicht committen
```

- **Farben:** SVGs enthalten nur Klassen (`f-/s-/sc-<rolle>`); der Renderer setzt die Palette
  aus `config.py`. Eine Quelle → beliebig viele Craft-Farbvarianten.
- **Frames** (Lenticular/Scrape): `data-frame`-Gruppen im SVG, ein PNG pro Frame; die Vorschau
  wechselt sie mit der Mausposition.

### 6.2 Werkzeuge & Ist-Zustand (2026-09-27)

| Werkzeug | Status | Zweck |
| --- | --- | --- |
| Python 3.14.3 | installiert | Pipeline |
| Blender 4.4 | installiert (`C:\Program Files\Blender Foundation\Blender 4.4`), **nicht im PATH** | Mockups |
| Node 24 | installiert | optional für Vorschau-Tooling |
| SVG-Renderer | **`resvg-py` 0.5.0** installiert (Wheel, keine System-DLL, Alpha, Filter, externes Stylesheet) | SVG → PNG |
| Pillow 12.2.0 | installiert | TGA, Masken |
| numpy 2.5.4 | installiert (2026-10-15) | Masken, Normal Maps |
| psd-tools 1.20.0 | optional, nicht installiert | nur PSD-Archiv (CS2 braucht kein PSD) |
| CS2 | installiert (`D:\Spiele\steamapps\common\Counter-Strike Global Offensive`) | Workbench-Test |
| CS2 Workshop Tools (DLC) | **nicht installiert** → Q13 | Editor, Workbench, Publish |
| Valve-Ressourcen (UV, Modelle) | offen | Mockups |

### 6.3 Regeln (aus CLAUDE.md, projektspezifisch)

- **SSoT:** Alle Zahlen (Auflösungen, Größen, Farben, Stile) nur in `pipeline/config.py`.
- Vorschau-Listen, Varianten, Größen **aus Daten generieren**, nicht in HTML hardcoden.
- Generierte Dateien (`out/`, Renders) sind reproduzierbar → nicht von Hand bearbeiten.
- **Secrets** (z. B. CSFloat-API-Key) nur in Umgebungsvariablen/sicherem Storage, nie im Repo.
- Valve-Ressourcen und große Binärdateien nicht committen (`.gitignore`).

---

## 7. Arbeitsanweisungen für Claude (Playbook)

1. Bei Projektstart in neuer Session: diese Spec lesen, dann `README.md`, dann den
   aktuellen Stand in `stickers/` und `research/`.
2. Vor Recherche-Aussagen zu Deadlines/Themen/Bezahlung: **neu prüfen** (Web), §2 aktualisieren.
3. Neue Entwürfe immer gegen §2.7 (kein Kopieren) und §2.11 (Erfolgsfaktoren) prüfen.
4. Nie eine Version überschreiben — neue Version anlegen (`-v2`, `-v3`).
5. Nach jeder Änderung: Vorschau neu generieren und dem Besitzer die IDs nennen.
6. Kein Upload, kein Posten im Namen des Besitzers.
7. Antworten an den Besitzer: kurz, klar, Bullets.

---

## 8. Offene Fragen & Entscheidungen

| # | Frage | Wer | Status |
| --- | --- | --- | --- |
| Q1 | Deadline „Call II Arms-ory“? | Claude | **geklärt 2026-09-27: keine Deadline angekündigt, Runde läuft** (§2.9). Laufend @CounterStrike auf X prüfen. |
| Q2 | Erstes Ziel: Cryptids, Pop Art oder frei? | Besitzer | **entschieden 2026-09-27: Cryptids** |
| Q3 | Set-Größe | Besitzer | **entschieden 2026-09-27: keine Obergrenze** |
| Q4 | Festbetrag (6.000 $/Sticker) oder Umsatzbeteiligung? | — | **durch Regeln entschieden:** für Call-Collections Supplemental Terms Pflicht → Festbetrag (§2.4) |
| Q5 | Aktuelles CS2-Materialformat: Guide nennt VMT (Source 1) — gilt das für CS2/Source 2 noch? | Claude | **geklärt 2026-09-27 (wahrscheinlich):** nein — Workshop Item Editor, Sticker Kit (`.econitem`) + TGA; kein VMT/PSD (§3). Gegenprobe mit Tools: Q13 |
| Q6 | Zielauflösung & Randvorgaben für Sticker | Claude | **geklärt 2026-09-27:** 1024² quadratisch; keine offizielle Randvorgabe (§3) |
| Q7 | Technische Spezifikation **Lenticular** | Claude | **teilweise geklärt 2026-09-27:** Holo-Shader mit Bild-Spectrum (§3). Formel/Frame-Anzahl im Workbench testen: Q13 |
| Q8 | Valve-/Steam-Regeln zu KI-generierten Inhalten im Workshop | Claude | **geklärt 2026-09-27:** keine spezifische Regel; „originally created by you“ gilt (§2.10a) |
| Q9 | PSD-Export: Python-Bibliothek vs. manuell (GIMP/Photoshop)? | Claude | **geklärt 2026-09-27:** für CS2 nicht nötig; optional `psd-tools` 1.20.0 (§6.2) |
| Q10 | Blender-Steuerung: nur Skripte oder zusätzlich Blender-MCP-Addon? | Besitzer | offen |
| Q11 | Solo oder mit Partner (Autoren/Geld teilen)? | Besitzer | offen |
| Q12 | Auszahlung: Steuerformulare bei Valve und Voraussetzungen fürs Steam-Konto klären | Besitzer | offen (erst bei Annahme nötig) |
| Q13 | **2026-10-15: installiert; econitem-Format aus Valves Beispielen übernommen, `cli.py install` legt Kits per Skript an.** Rest offen: CS2 Workshop Tools installieren (Steam → CS2 → DLC „Counter-Strike 2 Workshop Tools“), dann prüfen: TGA-Bittiefe, Lenticular-Style + Formel, Pflicht „2 Stile“, econitem per Skript erzeugbar? | Besitzer (Installation), Claude (Prüfung) | offen — blockiert M5, nicht M2–M4 |
| Q14 | Set-Richtung: A „Field Guide“, B „Now You See It“, C „Glyphen“, D „Sternbilder“, E „de_-Wildlife“ (Layer) — Details [`research/cryptids.md`](../research/cryptids.md) §5 | Besitzer | **entschieden 2026-10-15: alle 18 Konzepte einreichen** (je Hauptpalette, eigenes Finish) |
| Q15 | Scrape-Reveal (versteckte Ebene erscheint beim Abkratzen): wie technisch umsetzbar (Wear Mask/Albedo-Alpha?) | Claude | offen — mit Q13 prüfen. Arbeitsannahme in cryptids-04: Motivform wird zuerst transparent → Waffe scheint als Silhouette durch |
| Q16 | Gemeinsame Set-Teile (Rahmen, Band, Tafel) nur einmal definieren (Include/Generator) — heute pro SVG kopiert | Claude | **Mechanismus fertig 2026-09-27:** `parts/` + `data-include` (docs/svg-format.md §7); D und E nutzen ihn |

---

## 9. Roadmap

| Meilenstein | Inhalt | Fertig wenn |
| --- | --- | --- |
| **M0** | Spec freigeben, Q1–Q3 beantworten | Besitzer sagt „passt“ |
| **M1** | Recherche zum Ziel-Call | `research/<call>.md` liegt vor, Richtung gewählt |
| **M2** | Minimal-Pipeline: SVG → PNG/TGA + HTML-Vorschau | ein Test-Sticker in der Vorschau sichtbar — **SVG → PNG + Vorschau fertig (2026-09-27)**; TGA folgt mit `export.py` in Phase 5 |
| **M3** | Finishes: Glitter, Holo, Foil, Lenticular (Formel per Workbench verifizieren, Q13) | Finishes in der Vorschau vergleichbar |
| **M4** | Blender-Mockups auf Waffenmodellen | Renders pro Sticker automatisch |
| **M5** | Erstes Cryptids-Set fertig + im Workbench getestet | Endfreigabe |
| **M6** | Einreichung + Promotion | im Workshop online |

---

## 10. Quellen

**Valve (offiziell)**
- CS2 Workshop — Sticker Guide (Source-1-Stand, §3): https://www.counter-strike.net/workshop/workshopstickers
- CS2 Workshop — Finishes Guide (Workshop Item Editor): https://www.counter-strike.net/workshop/workshopfinishes
- Technik-Details mit allen Belegen: [`research/tech-sticker-format.md`](../research/tech-sticker-format.md)
- Cryptids-Recherche (Konkurrenz, Risiko-Liste, Paletten, Richtungen) mit allen Belegen:
  [`research/cryptids.md`](../research/cryptids.md)
- CS2 Workshop Resources: https://www.counter-strike.net/workshop/workshopresources
- CS2 Workshop: https://www.counter-strike.net/workshop/workshop
- CS2 Workshop Update (2025-12-06): https://steamcommunity.com/games/CSGO/announcements/detail/500591777095353664
- Call II Arms-ory: https://steamcommunity.com/games/CSGO/announcements/detail/698770449667981488
- CS2 auf X (Call II): https://x.com/CounterStrike/status/2077901099961647290
- Call II (Steam News, 2026-07-16): https://store.steampowered.com/news/app/730/view/698770449667981487
- Runde-1-Deadline auf X (2026-02-12): https://x.com/CounterStrike/status/2022080585767039436
- Runde-1-Reminder auf X (2026-03-06): https://x.com/CounterStrike/status/2030046591013487001
- Screenshot Call-to-Arms-Dropdown: https://clan.fastly.steamstatic.com/images/3381077/a81bfcc2c8c1dccad0505d7aced8c7091a808283.png
- Workshop Legal Agreement / Supplemental Terms: https://steamcommunity.com/workshop/workshoplegalagreement/?appid=730
- CS2 Workshop About (Tags, Revenue Share): https://steamcommunity.com/workshop/about/?appid=730
- CS2 Workshop FAQ: https://www.counter-strike.net/workshop/workshopfaq
- Steam Subscriber Agreement: https://store.steampowered.com/subscriber_agreement/
- Community-Guide Sticker Kit/Publish: https://steamcommunity.com/sharedfiles/filedetails/?id=3172596415

**Bezahlung & Verdienste**
- Dexerto — Anubis/Tuscan-Leak, Ø-Verdienst: https://www.dexerto.com/csgo/csgo-skins-map-makers-pay-revealed-after-anubis-tuscan-payments-leaked-2081672/
- GAMES.GG — React zu 35K: https://games.gg/news/cs2-skin-artist-react-valve-35k/
- Dexerto — React: https://www.dexerto.com/counter-strike-2/cs2-skin-artist-speaks-out-over-rumored-35k-payment-from-valve-for-weapon-skin-3334726/
- PCGamesN — Festbetrag & Call to Arms: https://www.pcgamesn.com/counter-strike-2/workshop-update-flat-fee-arabian-mythology
- BitSkins — Umstellung auf Festbeträge: https://bitskins.com/blog/cs2-switches-to-fixed-payments-for-workshop-skins/
- CSDB.gg — Reality Check Creator-Verdienst: https://csdb.gg/how-much-do-cs2-skin-creators-earn-reality-check/
- Engadget — 57 Mio. $: https://www.engadget.com/2015-01-29-valve-steam-workshop-creators-have-earned-over-57-million.html

**Printstream**
- AK-47 | PRINTSTREAM //END+: https://steamcommunity.com/sharedfiles/filedetails/?id=3506691954
- CS.MONEY — Interview JTPNZ: https://cs.money/blog/cs-go-skins/jtpnz-interview-with-the-printstream-series-creator/
- BitSkins — neue Printstream-Skins: https://bitskins.com/blog/new-cs2-printstream-skins-hit-the-community-workshop-exclusive-interview/

**Calls & Sticker-Markt**
- Dust2.us — zweite Call to Arms-ory: https://www.dust2.us/news/76081/valve-announces-second-call-to-arms-ory
- SIH.APP — Top 10 Pop Art & Cryptids: https://blog.sih.app/en/news/call-to-arms-ory-top-10-pop-art-and-cryptids-stickers-on-the-steam-workshop-from-a-1999-mixtape-to-a-cryptid-in-the-mirror
- CSGOSkins.gg — Update 2026-07-08: https://csgoskins.gg/updates/arabesque-tech-fruits-and-racing
- Skinrave — Sticker erstellen & angenommen werden: https://skinrave.gg/en/blog/how-to-create-stickers-in-cs2-and-publish-them
- CSDB.gg — Sticker-Grades: https://csdb.gg/cs2-sticker-grades/
- Yaninagames — CS2-Skins erstellen: https://yaninagames.com/blog/how-to-create-cs2-skins-for-the-steam-workshop/
- Steam Guide — Messer im Workbench: https://steamcommunity.com/sharedfiles/filedetails/?id=3609763228
