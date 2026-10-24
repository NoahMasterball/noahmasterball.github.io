# Rotland — Roadmap

## M0 Fundament ✅ (2026-10-18)
Tooling (Vite/TS/ESLint/Vitest/Playwright, Deploy nach `play/`), Schema + Ids, Config, State,
Grid, Physik, RNG/Noise, Tag/Nacht, Biome-Daten, Sim-Loop, Stubs, Doku.

## M1 Spielbarer Kern ✅ (2026-10-18, veröffentlicht)
- A Worldgen: Biome-Zonen, Terrain, Höhlen, Erze, Wasser, Bäume, Strukturen + Loot-Container
- B Wasser-Automat + fallender Sand/Kies
- C Spieler: Bewegung, Survival, Abbauen/Bauen, Inventar, Crafting, Drops, Items/Rezepte
- D Zombies: KI, Blöcke brechen, Digger, Biom-Spawning Tag/Nacht, Kampf, Loot-Tabellen
- E Client: Renderer (Chunk-Cache, Licht, Wasser), HUD, Inventar/Crafting-UI, Audio, E2E
- DoD: `npm run check` grün, Playtest-Runde, `npm run deploy` + `play/` gepusht

## M2 Integration & Feinschliff
- Balancing-Pass (Loot-Mengen, Zombie-Dichte je Biom, Hunger/Durst)
- Zombie-Pathing über mehrere Stufen / Leitern, Horden-Events (Blutmond)
- Basisbau: Plattformen, Fallen, Stacheldraht, Fenster, Leitern
- Licht: Fackeln platzieren/Lagerfeuer, Taschenlampe
- Speichern/Laden (localStorage, State ist serialisierbar)

## M3 Inhalt
- Weitere Biome (Krankenhaus, Tankstelle, Gefängnis, Sumpf), Wetter (Regen füllt Wasser)
- Farming (Saat → Weizen wächst), Tiere, Kochen
- Fahrzeuge? Bosse? (offen)
