# Technik: CS2-Sticker-Format & Tooling (Q5, Q6, Q7, Q9)

**Stand 2026-09-27** · Konfidenz: **sicher** / **wahrscheinlich** / **unklar** · „S“ = Sekundärquelle (Community/Blog)

Methode lokal (read-only): VPK-Verzeichnis `…/game/csgo/pak01_dir.vpk` eingelesen (137.423 Einträge),
Sticker-Texturen (BC7) mit Pillow dekodiert. Skripte nur im Scratchpad, nichts installiert/geändert.
Lokaler Pfad im Folgenden abgekürzt als `VPK:` = `D:/Spiele/steamapps/common/Counter-Strike Global Offensive/game/csgo/pak01_dir.vpk`.

---

## Q5 — Materialformat & Einreichung in CS2

| Aussage | Konfidenz | Quelle |
| --- | --- | --- |
| Valves Sticker-Guide ist **Source-1-Stand**: VMT, `$DecalStyle`, PSD+TGA, „Workshop Item Publisher“ | sicher | https://www.counter-strike.net/workshop/workshopstickers |
| Guide-Screenshot zeigt noch den alten CS:GO Model Viewer; der existiert in den CS2-Tools nicht mehr | wahrscheinlich (S, 2023-11-06) | https://steamcommunity.com/app/730/discussions/0/3939021373343944070 |
| CS2-Weg: DLC **„Counter-Strike 2 Workshop Tools“** → **Workshop Item Editor**. Outliner mit **econitem**-Dateien nach Typ (Paint Kit, **Sticker Kit**, Spray Kit); Felder „Select Finish Style“ + „Parameters for selected Finish Style“; Buttons Inspect/Preview/**Publish** | sicher (offiziell, Finishes-Guide) | https://www.counter-strike.net/workshop/workshopfinishes |
| Sticker Kit anlegen → Feld **„Style“** wählen → Texturpfade setzen (z. B. **Albedo Texture**, **Wear Mask**) → Speichern als `<name>.econitem` | wahrscheinlich (S, 2024-03) | https://steamcommunity.com/sharedfiles/filedetails/?id=3172596415 |
| Eingabeformat der Texturen: **.tga** (alle Guides; im Spiel sind 462 von 465 Sticker-Texturen aus `*.tga` kompiliert, 3 aus `.psd`) | sicher (lokal) + S | lokal geprüft: `VPK:` Namen `items/assets/stickers/**/*_tga_*.vtex_c`; S: 3172596415, https://skinrave.gg/en/blog/how-to-create-stickers-in-cs2-and-publish-them |
| Arbeitsordner: `…/content/csgo_addons/workshop_items/items/assets/stickers/workshop/<projekt>/` (Pfade im Editor: `items/assets/stickers/workshop/…tga`) | wahrscheinlich (S) | https://steamcommunity.com/sharedfiles/filedetails/?id=3172596415 |
| **.vmat wird vom Editor automatisch erzeugt** und nicht hochgeladen; hochgeladen werden econitem + Bilder | wahrscheinlich (S, 2023-12) | https://steamcommunity.com/sharedfiles/filedetails/?id=3114062314 |
| Publish-Dialog Pflichtfelder: Title, Description, Preview Image, Visibility (+ „Call to Arms“-Dropdown, siehe SPEC §2.9) | wahrscheinlich (S) | 3172596415; Skinrave (s. o.) |
| **PSD: kein Feld/keine Pflicht im CS2-Workflow gefunden** → nicht nötig | wahrscheinlich | alle CS2-Quellen oben nennen nur TGA; PSD-Pflicht stammt aus dem alten CS:GO-`workshop_publish`-Dialog („Base Image Source“ = PSD): https://hellcase.com/blog/guides/create-your-own-cs-go-stickers-in-the-workshop/ (S, CS:GO-Stand) |
| Valve-Templates im Spiel: nur **4 Stile**: `sticker_paper`, `sticker_glitter`, `sticker_holographic`, `sticker_foil` (+ `example_*`) — **kein** Lenticular-, Color-Replace- oder Glossy-Template | sicher (lokal) | lokal geprüft: `VPK:` `workshop/stickers/templates/*.vmat_c`, `stickers/workshop/example_*.vmat_c` |
| „Mind. 2 Stile pro Einreichung“ steht nur im Legacy-Guide; ob der CS2-Publish das erzwingt: **nicht verifiziert**. Ein econitem = ein Sticker Kit = ein Stil | unklar | https://www.counter-strike.net/workshop/workshopstickers; Finishes-Guide (s. o.) |

**Folge für die Pipeline:** Keine VMT/PSD erzeugen. Ziel = TGA-Texturen pro Stil; econitem entsteht im Editor
(Skript-Erzeugung von econitem: **nicht verifiziert**, Format unbekannt → erst nach Tool-Installation prüfen).

---

## Q6 — Auflösung, Ränder, Alpha, Dateigröße

| Aussage | Konfidenz | Quelle |
| --- | --- | --- |
| **1024 × 1024** ist Standard: 269 von 276 Albedo-Texturen der Community-Sticker im Spiel sind 1024²; Ausnahmen 4× 1080², 3× 1333² (→ keine harte Zweierpotenz-Pflicht) | sicher (lokal) | lokal geprüft: `VPK:` `items/assets/stickers/community/*/…albedo_texture…vtex_c` (Header gelesen) |
| Holo-Masken, Normal Maps, Glitter-Masken im Spiel ebenfalls 1024² | sicher (lokal) | lokal geprüft: `VPK:` gleiche Ordner |
| Valve-Beispiele: example_paper/holo/foil 1024², example_glitter 512², Templates 256² | sicher (lokal) | lokal geprüft: `VPK:` `items/assets/stickers/workshop/`, `workshop/stickers/templates/` |
| Guides empfehlen 1024² (S), 2000² (S), 1024/2048 (S, CS:GO) | S | Skinrave (s. o.); 3172596415; Hellcase (s. o.) |
| Textur ist **quadratisch**, Motiv darf beliebige Form haben (z. B. breite Sticker: Alpha-Box 1021×536 auf 1024²) | sicher (lokal) | lokal geprüft: dekodierte Albedos, z. B. `…/community_2025/paper_eyes_of_farlow_albedo_texture…` |
| **Rand/Safe Area: keine offizielle Vorgabe gefunden.** Messung 36 zufällige Albedos: kleinster Rand Median **≈1,1 % (~11 px)**, Minimum 0 px, Foil-Motive teils 14–32 % | Messung sicher, Regel nicht verifiziert | lokal geprüft: `VPK:` (Alpha-Bounding-Box) |
| Empfehlung (eigene Ableitung): Motiv mit ≥ 16 px Rand auf 1024² (Mip-Bleeding) | Empfehlung | — |
| Albedo mit **Alpha/Transparenz** (Legacy: „one texture with an alpha channel“; S: „design with a transparency layer“) | wahrscheinlich | Legacy-Guide; Skinrave |
| **Wear Mask** (Graustufen): Schwarz = unsichtbar, dunkles Grau = wird zuerst abgekratzt, Weiß = bleibt am längsten; 10 Kratz-Stufen (Wear 0–1 in 0,1) | wahrscheinlich (S) | 3172596415; Skinrave; 3114062314 |
| Im Spiel gibt es **keine separaten Wear-Texturen**; Albedo-Alpha enthält Stufen (0 / ~20 / 254) passend zur Wear-Semantik → Editor packt Wear Mask vermutlich in Albedo-Alpha | unklar (Indiz) | lokal geprüft: `VPK:` `example_paper`, `lenticular_burnout_albedo_texture` dekodiert |
| Keine Kratzer/Grime in die Textur malen (Abnutzung macht das Spiel) | sicher (offiziell, Legacy) | https://www.counter-strike.net/workshop/workshopstickers |
| TGA-Bittiefe (24/32 bit, RLE ja/nein), die der Editor akzeptiert: **nicht verifiziert** | unklar | — |
| Max. Dateigröße Texturen: **nicht verifiziert**. Zusätzliche Workshop-Vorschaubilder: „must be under 1MB“, JPG/PNG/GIF | sicher (Steamworks) | https://partner.steamgames.com/doc/api/ISteamUGC (AddItemPreviewFile) |

---

## Q7 — Finishes: Paper, Glitter, Holo, Foil, Lenticular

**Texturslots im Spiel (lokal gezählt, `VPK:` `items/assets/stickers/community/{fruits_veggies,jackass}`; Lenticular: alle Community-Ordner):**

| Stil | Texturen im Spiel | Editor-Felder (S) | Konfidenz |
| --- | --- | --- | --- |
| Paper | albedo (30×) | Albedo Texture, Wear Mask | sicher (lokal) / S |
| Glitter | albedo + normal_map + **glitter_mask** (je 9×) | + Glitter Mask (Graustufe: Weiß = viel Glitzer, Schwarz = keiner); Normal Map weglassen → flacher Glitter | sicher (lokal) / S Skinrave |
| Holo | albedo + **holo_mask** + **holo_spectrum** (12×; 1× zusätzlich normal_map) | Holo Mask, Holo Spectrum | sicher (lokal) / S |
| Foil | albedo + **normal_map** (10×) | Normal Map, optional Roughness Mask | sicher (lokal) / S Skinrave |
| **Lenticular** | albedo + holo_mask + holo_spectrum (**alle 21** `lenticular_*`-Materialien) | wie Holo | sicher (lokal) |

**Holo-Maske (Kanäle):**
- R = wo Holo wirkt (Intensität) · G = Warp/horizontaler Versatz im Spectrum · B = vertikaler Versatz (Zeile im Spectrum) — **sicher** (offiziell, Legacy-Shader-Semantik): https://www.counter-strike.net/workshop/workshopstickers ; CS2-Deutung gleich (S): Skinrave (s. o.), https://steamcommunity.com/sharedfiles/filedetails/?id=2980784250
- Spectrum-Größe frei: im Spiel von 128² bis 1024², auch 1024×512, 256×64, 1768×889 — **sicher** (lokal geprüft: `VPK:` `*_holo_spectrum_*`)
- Default-Spectrum existiert (`materials/default/stickers/default_holospectrum`, `holowarp_default` 512×32) — **sicher** (lokal)

**Lenticular:**
- Im Spiel seit **2024-02-07** (Ambush Sticker Capsule: Dystopian Gaze, Econometer, Old School) — nicht erst Juli 2026. **sicher**: lokal `VPK:` `stickers/community/community_2024/lenticular_*.vmat_c`; S: https://swap.gg/blog/what-are-all-the-new-cs2-stickers
- Umsetzung = **Holo-Shader mit Bild-Spectrum**: Spectrum enthält statt Regenbogen **Bilder/Frames** (z. B. `lenticular_burnout`: Streifen mit Lichtern, „COUNTER STRIKE“-Schriftzug, Rauch); Holo-Maske G/B mappen jedes Pixel in dieses Bild-Atlas; Blickwinkel verschiebt horizontal → Frames wechseln. **wahrscheinlich** (lokal dekodiert: `…/auto_racing/lenticular_burnout_{albedo_texture,holo_mask,holo_spectrum}`; S: https://steamcommunity.com/sharedfiles/filedetails/?id=2980784250, https://www.youtube.com/watch?v=z4wzcg5TIB4 „continuation of the Holo sticker video“)
- Zwei Varianten: **linear** (G = Verlauf links→rechts) und **radial/„spin“** (G = Winkel-/Kegelverlauf; bei `lenticular_burnout` sichtbar). **wahrscheinlich** (S: https://www.youtube.com/watch?v=pCf8yIWIYp8 ; lokal: G-Kanal von `lenticular_burnout_holo_mask` = Winkelverlauf, B = Radialverlauf)
- Eigener „Lenticular“-Stil im Editor-Dropdown: **nicht verifiziert** (kein Template im Spiel → vermutlich über „Holographic“ erstellt).
- Genaue Formel (Blickwinkel → U-Versatz, Wrap, wie viele Frames sinnvoll): **nicht verifiziert** → im Workbench testen, sobald Tools installiert.

**Normal Map (Foil/Glitter):** Tangent-Space, im Spiel 1024². Konvention (DirectX/OpenGL-Y): **nicht verifiziert**.

**Nebenbefund Runde 1:** Auto Racing (28 = 13 Paper/6 Holo/5 Foil/4 Lenticular) und Fruits & Veggies (27 = 12/6/5 Foil/2 Glitter/2 Lenticular): **jedes Motiv nur in einem Finish** — bestätigt SPEC §2.9. **sicher** (lokal geprüft: `VPK:` `stickers/community/{auto_racing,fruits_veggies}/*.vmat_c`, keine Motiv-Duplikate).

---

## Q9 — PSD-Export

- **PSD wird für CS2 wahrscheinlich nicht gebraucht** (siehe Q5). Nur als Archiv/Arbeitsdatei sinnvoll.
- **psd-tools 1.20.0** (PyPI, 2026-09-25): Wheel `psd_tools-1.20.0-cp314-cp314-win_amd64.whl` vorhanden; Abhängigkeiten attrs, pillow, typing_extensions, numpy — alle als Wheels (pip `--dry-run --only-binary=:all:`). **sicher** (lokal geprüft, pip dry-run)
  - Kann **mehrlagige PSD neu erzeugen**: `PSDImage.new("RGBA", (1024,1024))` → `create_pixel_layer(pil_img, name=…)` → `save()`; Alpha wird als Ebenentransparenz gespeichert. Laut Doku „experimentally supports“. **sicher**: https://psd-tools.readthedocs.io/en/latest/usage.html, https://github.com/psd-tools/psd-tools/blob/main/src/psd_tools/api/psd_image.py
  - Keine Ebeneneffekte/Text-Layer-Erzeugung dokumentiert → nur Pixel-Ebenen/Gruppen.
- **pytoshop 1.2.1**: **kein** cp314-Wheel (`No matching distribution` mit `--only-binary`) → nur Build aus sdist → nicht empfohlen. **sicher** (lokal geprüft, pip dry-run)
- **GIMP CLI**: GIMP nicht installiert (lokal geprüft: kein `C:/Program Files/GIMP*`) → nur als manueller Fallback.

---

## SVG → PNG (Renderer)

| Option | Stand / Installierbarkeit (Py 3.14, Windows) | Bewertung |
| --- | --- | --- |
| **`resvg-py` 0.5.0** (PyPI, 2026-08-24) | Wheel `resvg_py-0.5.0-cp310-abi3-win_amd64.whl` (dry-run ok), bündelt **resvg 0.48.0**; API `resvg_py.svg_to_bytes(svg_path=…, width=…, height=…, background=None)` → PNG-Bytes, ohne `background` transparent | **Empfehlung**: aktuell, keine System-DLL, deterministisch, Alpha ok |
| `resvg` (PyPI, briceyan) 0.2.0 (2026-04-14) | cp314-Wheel vorhanden | Alternative, kleineres Projekt |
| resvg CLI (GitHub) | v0.48.0/0.48.1 (2026-08-02) **ohne Windows-Binary**; letztes: v0.47.0 `https://github.com/linebender/resvg/releases/download/v0.47.0/resvg-win64.zip` | Fallback |
| `@resvg/resvg-js` 2.6.2 (Node) | letzte Version 2024-03-26, bündelt resvg 0.34 | veraltet → nein |
| `cairosvg` 2.9.1 | Pure-Python-Wheel, braucht aber **Cairo-DLL (GTK)** — nicht vorhanden | nein |
| Chrome/Edge headless | installiert (`C:/Program Files/Google/Chrome/Application/chrome.exe`, `C:/Program Files (x86)/Microsoft/Edge/…/msedge.exe`) | nur Referenz-Rendering (CSS/Fonts); transparente Screenshots: nicht verifiziert |

Quellen: pip dry-run lokal; https://pypi.org/project/resvg-py/ ; Cargo.toml https://github.com/baseplate-admin/resvg-py ;
https://api.github.com/repos/linebender/resvg/releases ; `npm view @resvg/resvg-js`; https://cairosvg.org/documentation/
- Filter: resvg unterstützt SVG-1.1-Filter (nicht in der Unsupported-Liste; dort nur Font-Elemente, `color-profile` u. a.). **sicher**: https://github.com/linebender/resvg/blob/main/docs/unsupported.md
- Gleiche Ausgabe auf allen Plattformen (Regression-Suite ~1600 Tests). **sicher**: https://github.com/linebender/resvg

---

## Lokaler Stand (read-only)

| Punkt | Ergebnis | Quelle |
| --- | --- | --- |
| Steam-Libraries | `C:/Program Files (x86)/Steam`, `D:/Spiele` | lokal geprüft: `C:/Program Files (x86)/Steam/steamapps/libraryfolders.vdf` |
| CS2 | installiert: `D:/Spiele/steamapps/common/Counter-Strike Global Offensive` (buildid 25537370) | lokal geprüft: `D:/Spiele/steamapps/appmanifest_730.acf` |
| **CS2 Workshop Tools** | **nicht installiert**: kein `content/`-Ordner, keine Tool-Binaries (nur `cs2.exe`, `vconsole2.exe` in `game/bin/win64`) | lokal geprüft: `…/Counter-Strike Global Offensive/` |
| Sticker-Templates | im Spiel-VPK: `workshop/stickers/templates/sticker_{paper,glitter,holographic,foil}.vmat_c` + `template_{paper,holo,holomask,spectrum,foil,foil_normal,glitter,glitter_normal,glittermask}` (256²); Beispiele `stickers/workshop/example_*.vmat_c` (1024²) | lokal geprüft: `VPK:` |
| `workbench_materials.zip` (Valve) | nur Waffen-UV-Sheets (TGA), OBJs, Finish-Beispiele (2013–2019) — **keine Sticker-Vorlagen** | https://media.steampowered.com/apps/csgo/workshop/workbench_materials.zip?v=103 (Inhalt gelistet) |
| Python / Pillow / numpy | Python 3.14.3; **Pillow 12.2.0 bereits installiert**; numpy nicht installiert | lokal geprüft: `pip list` |
| Node / Blender | Node v24.14.0; Blender 4.4 vorhanden | lokal geprüft |
| GIMP / Inkscape | nicht installiert | lokal geprüft |

---

## Korrekturen zu SPEC.md (nicht editiert)

- **§3 „Dateien: VMT + PSD + TGA“** → CS2: TGA-Texturen + econitem (Workshop Item Editor); .vmat automatisch; PSD/VMT nicht Teil der Einreichung (wahrscheinlich).
- **§3 „Workshop Item Publisher im CS2 SDK“** → „Publish“-Button im **Workshop Item Editor** der CS2 Workshop Tools (DLC).
- **§3 `$DecalStyle`-Tabelle** → Source-1-Stand. CS2 kennt die Stile **Paper, Glitter, Holographic, Foil** (Templates); Glossy/Color-Replace gibt es nicht als CS2-Template; **Glitter fehlt** in der Tabelle (Albedo + Normal Map + Glitter Mask).
- **§3 Lenticular „existiert im Spiel (Collections Juli 2026)“** → seit **2024-02-07**; Aufbau = Holo-Texturen (Albedo + Holo Mask + Bild-Spectrum).
- **§3 „Auflösung offen“** → de facto **1024 × 1024** (quadratisch).
- **§3 „mind. 2 Stile“** → nur Legacy-Text; für CS2 nicht verifiziert (1 econitem = 1 Stil).
- **§3 Valve-Ressourcen** → `workbench_materials.zip` enthält keine Sticker-Vorlagen; die liegen im Spiel/in den Tools.
- **§6.2 „Pillow, numpy: offen“** → Pillow 12.2.0 schon installiert; numpy fehlt.
- **§6.2 „PSD-Export: Valve verlangt PSD-Quelle“** → für CS2 wahrscheinlich nicht; optional psd-tools 1.20.0.
- **§6.2 „CS2 Workshop Tools: offen“** → CS2 installiert (`D:/Spiele/…`), Workshop Tools **nicht** installiert.
- **§6.2 SVG-Renderer** → `resvg-py` 0.5.0.
- **§4/§6.1 „Material-Dateien (VMT bzw. CS2-Format)“ / `materials.py`** → für CS2 wahrscheinlich überflüssig (Editor erzeugt econitem/vmat).
