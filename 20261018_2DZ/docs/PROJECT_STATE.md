# Rotland — Projektstand

Neueste Einträge oben.

## 2026-10-18 (3) — Integrationsrunde fertig, veröffentlicht

- `npm run check` grün: 142 Unit-Tests, 2 E2E (inkl. Nacht + Höhle über QA-Controls).
- Veröffentlicht (Commit `f94e329`, nur `play/`): https://noahmasterball.github.io/20261018_2DZ/play/
- I1: Türsäulen (3 hoch) schalten komplett, Spitzhacke schlägt nicht mehr zu, Wand-Items
  (wood/brick/concrete_wall), `wallBroken`-Event, Kupfer → 9mm-Munition, Schrotthaufen würfeln Biom-
  `groundLoot`, `__rotland.send(control)`, softere Licht-Abnahme unter der Oberfläche,
  Screenshots via `ROTLAND_SHOTS=1 npx playwright test screenshots`.
- I2: `TileDef.natural` + `placed`-Bit (Nicht-Digger brechen nur Gebautes/Gesetztes), Seen aus
  `BiomeDef.lakes`, Höhlen-Spawns geprüft, `tests/unit/integration.test.ts` (echte Welt, 3 Seeds).
  Zombies (Tag/Nacht): Ebene-Spawn gesamt 13–18 / 20–29, Stadt 24–31 / 41–50, Höhle ~8, Tiefe ~14.
  ~0,02 ms pro Tick.

### Offene Punkte
- Generierter Beton/Asphalt unter der Stadt gilt als gebaut → Walker knabbern Keller an (langsam).
- Untergrund-Zombies zählen ins globale Limit (70), auch wenn der Spieler oben ist.
- Zombie bricht nur 1 Zelle einer 3-hohen Tür; Abbau einer Generator-Tür droppt 3 Türen.
- Fallender Sand prüft keine Körper.
- Vitest scheitert, wenn die Shell im Pfad mit kleinem `d:` steht → immer aus `D:...` starten.

## 2026-10-18 (2) — M1 gebaut, check grün; Integrationsrunde läuft

- Alle 5 M1-Agents fertig; `npm run check` grün (115 Unit-Tests, E2E-Smoke). Screenshots in
  `docs/screenshots/` (Tag, Nacht, Dämmerung, Höhle, Inventar, Abbau).
- Wichtige Entscheidungen der Agents:
  - Wasser: Schicht-Ausgleich (`LIQUID.layerLevelRate/layerSnapSpread`) statt reinem Nachbar-Ausgleich
    (sonst Treppen/kein Settle). ~1–2 ms/Schritt bei 4000 aktiven Zellen. `liquidFill()` für Renderer.
  - Möbel/Container/Fackeln/Baumstämme sind begehbar (nicht solid). Türen sind 3 Zellen hoch.
  - Holz ist Material (nicht platzierbar); Planken sind der Basis-Baustoff.
  - Spawn-Budget: Fenster = Spalten im `despawnDistance`-Radius; Startzombies = min(density, cap).
  - Fallende Tiles prüfen keine Körper (Sand fällt durch Spieler) — offen.
- Fundament ergänzt: `Player.secondaryHeld`, `WorldGrid.placed` + `setTile(..., byPlayer)`,
  `BiomeDef.lakes`, QA-Controls `qaTeleport`/`qaSetTime`.
- Integrationsrunde (2 Agents parallel): I1 Spieler-Seite (Türen 3-hoch, Pickaxe-Melee-Bug,
  Wand-Items, Kupfer-Nutzung, Schrotthaufen-Loot, QA-Controls, E2E Nacht/Höhle, Screenshots);
  I2 Zombie/Worldgen-Seite (`TileDef.natural` + placed-Bit statt surfaceY-Workaround,
  Seen aus `BiomeDef.lakes`, Höhlen-Spawns, Integrationstest echte Welt, Zombie-Zählung je Biom).

## 2026-10-18 — M0 Fundament fertig, M1 läuft (5 parallele Agents)

- Fundament steht und ist grün (tsc, eslint, vitest): Schema/Ids, Config, State, Grid-Setter mit
  Chunk-Revisionen + Active-Sets, AABB-Physik mit Stufen, seeded RNG/Noise, Tag/Nacht, biomeAt,
  Biome-Daten (Ebene, Farm, Wald, Kleinstadt, Stadt, Militär, Höhlen, Tiefe), Sim-Loop mit fester
  Reihenfolge, Test-Helper `tests/unit/support/makeState.ts` (ASCII-Welten).
- Daten-Stubs (tiles/walls/items/recipes/zombies/loot) sind generiert und werden von den Agents
  ersetzt (Kopfzeile `STUB` verschwindet dann).
- Agents: A Worldgen, B Wasser/Fallen, C Spieler/Items, D Zombies/Loot, E Client (Modul-Eigentum
  in ARCHITECTURE.md §5).

### Offene Entscheidungen (Defaults aktiv)
- Name „Rotland“ (Arbeitstitel).
- Tod: ganzes Inventar fällt als Drops, Respawn am Weltspawn mit Startkit.
- Wasser ohne Druck (Terraria-Stil, kein Steigen in U-Rohren).
- Zombies brechen nur Blöcke mit endlichem `zombieHealth`; Digger graben auch natürliches Terrain.
- Spawn immer in der Ebene, Stadt/Militär nie direkt daneben.
