# Rotland — Architektur

## 1. Ordner

```
src/
  config/sim.ts      globale Sim-Regeln (Tick, Welt, Physik, Spieler, Wasser, Spawn, Tag/Nacht)
  config/client.ts   Render/Kamera/Tasten/HUD/Audio (nur Client)
  data/schema.ts     ALLE Id-Listen + Def-Typen (SSOT für "was existiert")
  data/*.ts          Inhalte als Record<Id, Def>: tiles, walls, items, recipes, zombies, loot, biomes
  data/content.ts    Id↔Index-Lookups, abgeleitete Arrays, validateContent()
  sim/               deterministische Simulation (Node-fähig)
    state.ts         SimState-Typen (einziger Eigentümer aller Spielwerte)
    sim.ts           createSim(seed), step(state, cmd) — feste Systemreihenfolge (§4)
    commands.ts      PlayerCommand + ControlMessage (einziger Eingang in die Sim)
    grid.ts          Zellzugriff; ALLE Schreibzugriffe auf fg/wall/liquid über setTile/setWall/setLiquid
    physics.ts       AABB-vs-Tile (Spieler, Zombies, Drops)
    rng.ts           seeded RNG + Noise
    time.ts          Tag/Nacht        biome.ts  biomeAt(x,y) inkl. Tiefen-Layer
    worldgen/        Generator (Biome, Terrain, Höhlen, Erze, Wasser, Bäume, Strukturen)
    liquid.ts        Wasser-Automat      falling.ts  Sand/Kies
    player.ts        Bewegung/Survival   interact.ts Abbauen/Bauen/Benutzen
    controls.ts      Inventar/Crafting-Aktionen   inventory.ts  crafting.ts  drops.ts
    zombies.ts       KI                  spawn.ts    Biom-Budget-Spawning
    combat.ts        Schaden/Treffer     loot.ts     Loot-Tabellen würfeln
  client/            Canvas-Renderer, Kamera, Input, HUD/Inventar-UI, Audio
  main.ts            Boot + Fixed-Timestep-Loop
tests/unit/          Vitest gegen die echte Sim in Node
tests/e2e/           Playwright-Smoke gegen den Build im Unterordner
tools/               serve-dist, publish (wie 20260927_FPV)
```

## 2. Sim/Render-Grenze (harte Regel, ESLint erzwingt sie)

- `src/sim/`, `src/data/`, `src/config/sim.ts`: kein Client-Import, keine DOM-/Browser-Globals,
  kein `Date`/`performance`/Timer, kein `Math.random` (→ `src/sim/rng.ts`).
- Der Client **liest** `SimState` nur. Jede Änderung läuft über ein `PlayerCommand` pro Tick.
- Abgeleitete Werte (z. B. aktueller Biom an Position) werden berechnet, nicht im State gecacht.

## 3. Datenmodell

- Grid-Zellen speichern numerische Indizes (`TILE_IDS`-Index); Code spricht sonst in String-Ids.
  Umrechnung nur über `src/data/content.ts`.
- Neue Ids immer **am Ende** von `TILE_IDS` anhängen ('air' bleibt Index 0).
- `chunkRev` (pro 32×32-Chunk) wird bei jeder Zelländerung erhöht → Renderer cached Chunks als
  Offscreen-Canvas und zeichnet nur geänderte neu.
- `liquidActive` / `fallingActive`: nur aktive Zellen werden simuliert; `grid.ts` weckt Nachbarn bei
  jeder Änderung (`wakeAround`).

## 4. Systemreihenfolge pro Tick (`src/sim/sim.ts`)

1. Events leeren, `tick++`, Zeit (`time.ts`)
2. `applyControls` (Inventar/Crafting/Hotbar)
3. `updatePlayer` (Bewegung, Physik, Survival, Tod/Respawn)
4. `useHeldItem` (Abbauen, Bauen, Angriff, Verbrauch, Eimer, Container/Tür)
5. `updateZombies` (KI, Physik, Angriffe, Blöcke brechen)
6. `updateSpawning` (Biom-Budget, Despawn)
7. `updateDrops`
8. `stepLiquid` × (`LIQUID.stepsPerSecond` / s, Akkumulator)
9. `stepFalling` (alle `FALLING.fallInterval`)

## 5. Modul-Eigentum (für parallele Agents)

| Bereich | Dateien |
| --- | --- |
| Fundament (Koordinator) | config/sim.ts, data/schema.ts, data/content.ts, data/biomes.ts, sim/state.ts, sim/sim.ts, sim/grid.ts, sim/physics.ts, sim/rng.ts, sim/time.ts, sim/biome.ts, sim/commands.ts, sim/ids.ts, tests/unit/support/, tooling, docs |
| A Worldgen | sim/worldgen/**, data/tiles.ts, data/walls.ts |
| B Wasser/Fallen | sim/liquid.ts, sim/falling.ts |
| C Spieler/Items | sim/player.ts, sim/interact.ts, sim/controls.ts, sim/inventory.ts, sim/crafting.ts, sim/drops.ts, data/items.ts, data/recipes.ts |
| D Zombies/Kampf/Loot | sim/zombies.ts, sim/spawn.ts, sim/combat.ts, sim/loot.ts, data/zombies.ts, data/loot.ts |
| E Client | src/main.ts, src/client/**, src/config/client.ts, tests/e2e/** |

Änderungen an Fundament-Dateien (neue Ids, neue State-Felder, neue Config-Werte) gehen über den
Koordinator bzw. werden im Agent-Bericht als Wunsch gemeldet.
