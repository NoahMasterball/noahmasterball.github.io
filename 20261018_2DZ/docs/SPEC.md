# Rotland — Spec

2D-Zombie-Survival-Sandbox im Stil von Terraria. Browser (Vite + TypeScript + Canvas 2D), Seitenansicht,
Tile-Welt. Arbeitstitel „Rotland“.

## 1. Kernschleife

Erkunden → Looten → Abbauen/Bauen → Überleben (Hunger, Durst, Zombies) → tiefer/weiter für besseren Loot.
Tag = relativ sicher, Nacht = deutlich mehr Zombies. Der Spieler baut sich eine Basis (Wände, Türen,
Fackeln), die Zombies teilweise zerstören können.

## 2. Welt

- Tile-Grid `WORLD.width × WORLD.height` (src/config/sim.ts), 1 Tile = 1 Einheit, y wächst nach unten.
- Zwei Ebenen: **Vordergrund** (`fg`, kollidiert) und **Wand/Hintergrund** (`wall`, nur Optik/Innenraum).
- **Alles abbaubar** außer Bedrock. Abbauzeit = `TileDef.hardness / Werkzeug-speed`; Werkzeug-`power`
  muss ≥ `TileDef.minPower` sein. Abgebautes droppt `TileDef.drop` als Item.
- **Platzieren** von Blöcken aus dem Inventar (`ItemDef.places`) in Reichweite `PLAYER.reach`, nur an
  leere Zellen, die an etwas angrenzen (Block oder Wand).
- **Sand/Kies** fallen, wenn darunter nichts ist (`TileDef.gravity`).
- **Wasser** ist dynamisch (zellulärer Automat, 0..255 pro Zelle): fällt nach unten, verteilt sich
  seitlich, füllt Höhlen/Tunnel, läuft Schächte hinunter, gleicht Pegel in verbundenen Becken an.
  Wird ein Block neben Wasser abgebaut, läuft das Wasser nach. Eimer schöpfen/gießen ganze Zellen.
  Wasser bremst, tiefes Wasser = Schwimmen.
- Generierung (seeded): Oberflächen-Zonen nebeneinander (Biome), darunter Erde → Stein, Höhlen
  (Noise-Würmer + Kammern), Erze nach Tiefe, unterirdische Wassertaschen, Seen an der Oberfläche,
  Bäume, Strukturen mit Loot-Containern.

## 3. Biome (src/data/biomes.ts ist die Quelle)

| Biom | Gefahr | Loot-Schwerpunkt |
| --- | --- | --- |
| Ebene (Spawn) | niedrig | Kleinkram, Holz |
| Farm | niedrig–mittel | Essen, Saatgut, Heugabel, Werkzeug, Seil |
| Wald | mittel (Runner) | Holz, Hütten-Loot, Äpfel |
| Kleinstadt | mittel–hoch | Konserven, Medizin, Baseballschläger, Pistole selten |
| Stadt | hoch | Medizin, Munition, Waffen, Metall |
| Militär | sehr hoch | Gewehre, Schrotflinte, viel Munition, Medkits |
| Höhlen (Tiefe ≥ `cavesDepth`) | mittel | Erze, Höhlenkisten |
| Tiefe (≥ `deepDepth`) | hoch (Digger, Brutes) | Eisen, beste Kisten |

- Spawn liegt immer in der Ebene; Stadt und Militär nie direkt neben dem Spawn.
- Zombie-Menge pro Biom: `zombies.density` (pro 100 Spalten), nachts × `nightMultiplier`;
  Typ-Mix über `zombies.weights`.

## 4. Spieler

Bewegung (laufen, springen, 1-Tile-Stufen automatisch, schwimmen), Leben/Hunger/Durst, Inventar
(40 Slots, 10 Hotbar), Crafting (Werkbank/Ofen als Stationen in Reichweite), Container öffnen,
Türen auf/zu, Nahkampf, Fernkampf mit Munition, Verbrauchsgüter (Essen, Wasser, Verband, Medkit).
Tod → Respawn am Spawnpunkt nach `PLAYER.respawnSeconds`, Inventar wird als Drops fallen gelassen.

## 5. Zombies

| Typ | Rolle |
| --- | --- |
| Walker | Standard, langsam |
| Runner | schnell, wenig Leben |
| Crawler | klein, passt durch 1-Tile-Lücken |
| Brute | viel Leben, bricht Blöcke schnell |
| Digger | gräbt durch Erde/Stein zum Spieler (Höhlen/Tiefe) |
| Soldier | Militär, zäh, droppt Munition |

KI: idle/wander → Sicht (Line of Sight) oder Lärm (Schüsse, Abbau) → chase → attack; Hindernis im Weg →
`break` (Blöcke mit `TileDef.zombieHealth` werden kaputt geschlagen, Türen zuerst). Springen über
Kanten, Stufen. Tote Zombies droppen Loot (`ZombieDef.loot`).

## 6. Steuerung (Default, Quelle: src/config/client.ts)

A/D laufen · Leertaste springen · S tauchen · Linksklick halten: abbauen/angreifen/benutzen ·
Rechtsklick: platzieren/öffnen/Tür · 1–0 / Mausrad Hotbar · E/Tab Inventar + Crafting · Q droppen ·
Shift+Klick Quick-Move · Esc Menü.

## 7. Nicht-Ziele (vorerst)

Multiplayer, Speichern/Laden (State ist aber serialisierbar gehalten), Lava, Licht-Raytracing,
Bosse, Sound-Assets (nur WebAudio-Synth-Platzhalter).
