# SVG-Quellformat für Sticker

Jeder Sticker ist **eine** Datei `stickers/<set>/src/<id>.svg`. Die Pipeline
(`pipeline/sources.py`) prüft dieses Format und bricht bei Verstößen mit Fehlermeldung ab.
Alle Zahlen, Farben und Namen stehen in [`pipeline/config.py`](../pipeline/config.py). Hier
steht nur, **wie** man sie benutzt.

## 1. Datei & ID

- Dateiname = ID: `<set>-<nr>-v<version>.svg` (Muster `ID_PATTERN`), z. B. `cryptids-03-v2.svg`.
- Nie eine Version überschreiben. Neue Version = neue Datei (`-v2`, `-v3`, SPEC §7).

## 2. Wurzel-Element

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024"
     data-title="Jersey Devil – Specimen Plate"
     data-cryptid="Jersey Devil"
     data-direction="A"
     data-finish="paper"
     data-palettes="fieldguide printstream"
     data-mechanic="none"
     data-note="Kurze Idee/Begründung für den Besitzer">
```

| Attribut | Pflicht | Werte |
| --- | --- | --- |
| `viewBox` | ja | `0 0 TEXTURE_SIZE TEXTURE_SIZE` |
| `data-title` | ja | Anzeigename |
| `data-cryptid` | ja | Wesen (Risiko-Liste: research/cryptids.md §3 — nur Kategorie **a**) |
| `data-direction` | ja | Schlüssel aus `DIRECTIONS` |
| `data-finish` | ja | Ziel-Finish aus `FINISHES` |
| `data-palettes` | ja | Leerzeichen-Liste aus `PALETTES`; erste = Hauptpalette; jede wird gerendert |
| `data-mechanic` | nein | aus `MECHANICS` (Standard `none`) |
| `data-frames` | bei Mechanik | Frame-Namen in Reihenfolge, z. B. `links mitte rechts` |
| `data-note` | nein | Notiz für die Vorschau |
| `data-description` | für Export | englischer Text für den Publish-Dialog (`cli.py package` warnt, wenn er fehlt) |

## 3. Farben — nur über Klassen

- **Keine festen Farben** (`#…`, `rgb()`) — die Pipeline lehnt sie ab. Farben setzt der
  Renderer per Stylesheet aus der gewählten Palette.
- Klassen je Rolle aus `PALETTE_ROLES`:
  - `f-<rolle>` → `fill`, `s-<rolle>` → `stroke`, `sc-<rolle>` → `stop-color` (Verläufe).
  - Beispiel: `<path class="f-paper s-ink w-bold" …/>`
- Ohne Klasse ist `fill` schwarz (SVG-Standard). Für „keine Füllung“: `fill="none"`.
- **Ausnahme Masken/Clip-Pfade:** `white` / `black` erlaubt (sind Maskenwerte, keine Farben).
- Transparenz über `opacity` / `fill-opacity` / `stroke-opacity` ist erlaubt.

## 4. Strichstärken & Schrift

- Strichstärken über Klassen `w-<name>` aus `STROKES` (z. B. `w-bold`). Eigene
  `stroke-width`-Werte nur, wenn keine Stufe passt.
- Lesbarkeit: Das Motiv muss bei 32 px noch erkennbar sein (Faktor 32 kleiner als
  `TEXTURE_SIZE`). `fine`-Linien verschwinden dort — nur für Details.
- Schrift über Klassen aus `FONTS` (`t-serif`, `t-sans`, `t-mono`). Text sparsam und groß;
  gerendert wird nur mit den OFL-Fonts aus `FONT_DIR` (keine Systemschriften).

## 5. Form & Rand

- Mindestrand `SAFE_MARGIN` px zwischen Motiv und Texturkante (Pipeline warnt).
- Hintergrund bleibt **transparent** (kein Vollflächen-Rechteck) — der Sticker ist eine
  gestanzte Form.
- Heller Stanzrand in Rolle `outline` (Stufe `w-outline`) um die Gesamtform, damit der
  Sticker auf dunklen Skins lesbar bleibt (SPEC §2.11 Nr. 5).
- Keine Kratzer/Grime/Abnutzung ins Motiv zeichnen (macht das Spiel, SPEC §3).

## 6. Frames (Lenticular / Scrape)

- Nur mit `data-mechanic="lenticular"` oder `"scrape"` und mind. 2 Frames.
- Jeder Frame ist ein Element mit `data-frame="<name>"`; Elemente ohne `data-frame` sind
  in allen Frames sichtbar.
- Der Renderer erzeugt pro Palette × Frame ein PNG. Die Vorschau wechselt die Frames mit der
  Mausposition (links → rechts = Blickwinkel bzw. Abnutzung).

## 7. Gemeinsame Set-Teile (Includes)

- Teile, die mehrere Sticker eines Sets teilen (Rahmen, Scheibe, Band, Wand …), liegen **einmal**
  in `stickers/<set>/parts/<name>.svg` (Ordnername `PARTS_DIRNAME`) — nie in Sticker kopieren.
- Einbinden: `<g data-include="<name>" transform="…"> …eigene Kinder… </g>` — die Kinder des
  Teils werden **vor** den eigenen Kindern eingefügt (eigene liegen also obendrauf).
- Teile dürfen selbst Teile einbinden (max. `MAX_INCLUDE_DEPTH` Ebenen). Für Teile gelten
  dieselben Regeln (nur Paletten-Klassen); sie haben `viewBox="0 0 1024 1024"`, damit man sie
  einzeln ansehen kann. Namen mit Richtungs-Präfix, z. B. `d-disc`, `e-wall`; richtungsübergreifende Kreaturen mit
  `fig-`, z. B. `fig-snallygaster` (nur Pfade, in eine `<g id=…>` in `<defs>`), `fig-jersey-devil` (ids `jd-*`); reine Effekt-Defs mit `fx-`, z. B. `fx-stars` (#d-star, #d-soft).
- Text, der pro Sticker wechselt (z. B. Name im Band), gehört in den Sticker, nicht ins Teil.
- **Slots:** Ein Teil darf per `<use href="#<slot>"/>` auf ein Element verweisen, das erst der
  Sticker definiert (z. B. `#fig` = Figur-Silhouette, `#art` = Motiv). Solche Teile sind allein
  leer; welche Slots ein Teil braucht, steht als Kommentar oben im Teil.
- `id`s in Teilen (Verläufe, Clip-Pfade) mit Teil-Präfix, damit nichts kollidiert.

## 8. Inhalt

- Eigene Formen, nichts abpausen, keine fremden Logos/Marken/Map-Grafiken 1:1 (SPEC §2.7).
- Keine nationalen, politischen oder religiösen Symbole (SPEC §2.10a).
- Jeder Sticker muss allein funktionieren (SPEC §2.11 Nr. 2).

## 9. Prüfen

```
python pipeline/cli.py render <id>     # prüft + rendert nur diesen Sticker nach stickers/<set>/out/<id>/
python pipeline/cli.py build           # alle + preview/manifest.js
python pipeline/cli.py preview         # build + Vorschau öffnen
python pipeline/cli.py install         # package + Sticker Kits ins Addon der Workshop Tools
python pipeline/cli.py package         # build + Workshop-Paket je Sticker (out/<id>/workshop/, out/EINREICHEN.md)
```
