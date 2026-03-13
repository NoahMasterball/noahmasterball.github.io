# SSOT Game Refactoring — Orchestrator Prompt

## Ziel
Refactoring des monolithischen `gta_old/overworld/js/overworld.js` (12.698 Zeilen) in eine modulare, SSOT-basierte Architektur. Jedes System bekommt **eine einzige Quelle der Wahrheit** für seinen Zustand und seine Logik.

## Wichtigste Regel: SSOT (Single Source of Truth)
- **Jede Entity-Position** wird NUR durch `EntityMover.move()` verändert
- **Jeder Zustand** hat genau EINE Methode die ihn mutiert
- **Keine doppelten Constraints** — Sidewalk, Bounds, Collision werden in EINER Pipeline abgearbeitet
- **Kein verstreuter State** — Entity-Daten leben in genau einem Objekt

## Architektur-Übersicht (Zielstruktur)

```
20260813_spiel/
├── index.html
├── js/
│   ├── main.js                    # Entry Point — erstellt Game, startet Loop
│   ├── core/
│   │   ├── Game.js                # Game Loop, Scene Management
│   │   ├── EventBus.js            # Pub/Sub für lose Kopplung
│   │   ├── EntityMover.js         # ⭐ SSOT für ALLE Positionsänderungen
│   │   └── MathUtils.js           # Geometrie-Helfer
│   ├── entities/
│   │   ├── Entity.js              # Basis-Klasse (x, y, width, height, health)
│   │   ├── Player.js              # Spieler-Entity + Input-Verarbeitung
│   │   ├── NPC.js                 # NPC-Entity + Waypoint-KI
│   │   └── Vehicle.js             # Fahrzeug-Entity + Straßen-KI
│   ├── systems/
│   │   ├── InputSystem.js         # Tastatur/Maus → Befehle
│   │   ├── MovementSystem.js      # Bewegt alle Entities via EntityMover
│   │   ├── CollisionSystem.js     # Kollisionserkennung + Auflösung
│   │   ├── CombatSystem.js        # Waffen, Projektile, Schaden
│   │   ├── AISystem.js            # NPC-Verhalten, Panik, Stuck-Detection
│   │   ├── VehicleSystem.js       # Fahrzeug-Updates, Yielding
│   │   ├── CameraSystem.js        # Kamera folgt Spieler
│   │   ├── DayNightSystem.js      # Tag/Nacht-Zyklus
│   │   └── InteractionSystem.js   # Gebäude-Interaktion, Szenen-Wechsel
│   ├── world/
│   │   ├── WorldGenerator.js      # Erzeugt Gebäude, Straßen, Bürgersteige
│   │   ├── BuildingFactory.js     # Gebäude-Erstellung + Collider
│   │   ├── RoadNetwork.js         # Straßen, Bürgersteige, Gehwege
│   │   └── StreetDetails.js       # Bäume, Bänke, Parkplätze etc.
│   ├── rendering/
│   │   ├── Renderer.js            # Canvas-Management, Render-Loop
│   │   ├── WorldRenderer.js       # Straßen, Bürgersteige, Details
│   │   ├── BuildingRenderer.js    # Alle Gebäude-Typen zeichnen
│   │   ├── EntityRenderer.js      # NPCs, Fahrzeuge, Spieler zeichnen
│   │   ├── EffectsRenderer.js     # Projektile, Blut, Tag/Nacht-Overlay
│   │   └── UIRenderer.js          # HUD, Crosshair, Interaktions-UI
│   ├── interiors/
│   │   ├── InteriorManager.js     # Szenen-Wechsel Overworld↔Interior
│   │   ├── WeaponShop.js          # Waffenladen-Interior + Menü
│   │   └── Casino.js              # Casino-Interior + Credits
│   └── data/
│       ├── WeaponCatalog.js       # Waffen-Definitionen (reine Daten)
│       ├── HouseStyles.js         # Haus-Stile (reine Daten)
│       ├── ColorPalettes.js       # Farben (reine Daten)
│       └── Persistence.js         # LocalStorage Load/Save
```

---

## ⭐ KERN-DESIGN: EntityMover (SSOT für Bewegung)

Dies ist das wichtigste neue Modul. ALLE Positionsänderungen laufen durch diese eine Klasse:

```javascript
// EntityMover.js — Einzige Stelle die entity.x/y verändern darf
class EntityMover {
    constructor(collisionSystem, roadNetwork) {
        this.collisionSystem = collisionSystem;
        this.roadNetwork = roadNetwork;
    }

    // EINZIGE öffentliche Methode für Bewegung
    move(entity, targetX, targetY, options = {}) {
        // 1. Berechne gewünschte Position
        let newX = targetX;
        let newY = targetY;

        // 2. Kollision mit Gebäuden auflösen
        const resolved = this.collisionSystem.resolve(entity, newX, newY);
        newX = resolved.x;
        newY = resolved.y;

        // 3. Bürgersteig-Constraint (nur wenn entity.stayOnSidewalks)
        if (entity.stayOnSidewalks && !options.ignoreSidewalk) {
            const sidewalk = this.roadNetwork.constrainToSidewalk(
                newX, newY, entity.currentSidewalkSegment
            );
            newX = sidewalk.x;
            newY = sidewalk.y;
            entity.currentSidewalkSegment = sidewalk.segment; // Track welches Segment
        }

        // 4. Bounds-Clamping
        if (entity.bounds) {
            newX = Math.max(entity.bounds.left, Math.min(newX, entity.bounds.right));
            newY = Math.max(entity.bounds.top, Math.min(newY, entity.bounds.bottom));
        }

        // 5. World-Bounds
        newX = Math.max(0, Math.min(newX, this.worldWidth));
        newY = Math.max(0, Math.min(newY, this.worldHeight));

        // 6. Position setzen (EINZIGE STELLE!)
        entity.x = newX;
        entity.y = newY;

        return { x: newX, y: newY, moved: newX !== entity.x || newY !== entity.y };
    }

    // Teleport — für Notfälle (stuck NPCs), ebenfalls durch SSOT
    teleport(entity, x, y) {
        entity.x = x;
        entity.y = y;
    }
}
```

**Kritische Verbesserung:** `constrainToSidewalk()` bekommt das **aktuelle Segment** als Parameter, sodass der NPC nicht auf ein falsches Nachbar-Segment springt. Das war der Hauptfehler im alten Code.

---

## Batch-Aufteilung für Orchestrator-Agents

### Gesamtübersicht: 3 Orchestrator-Fenster

| Orchestrator | Batches | Beschreibung |
|---|---|---|
| **Orchestrator 1** | Batch 1–4 | Foundation + Core Systems |
| **Orchestrator 2** | Batch 5–8 | Game Systems + World |
| **Orchestrator 3** | Batch 9–11 | Rendering + Integration + Cleanup |

---

## ORCHESTRATOR 1: Foundation & Core Systems

### Checkliste (abhaken wenn erledigt)
- [x] Batch 1: Foundation
- [x] Batch 2: Core Movement SSOT
- [x] Batch 3: Input + Camera
- [x] Batch 4: Collision System

**Wenn alle 4 Batches erledigt sind:** In dieser Datei die 4 Checkboxen abhaken und dem User sagen: "Orchestrator 1 fertig. Bitte neues Context-Fenster öffnen und diese Datei mit 'Orchestrator 2 starten' übergeben."

---

### Batch 1: Foundation (MUSS ZUERST — kein Parallel)

**Subagent-Prompt:**
```
Erstelle die Foundation-Module für das Spiel-Refactoring.
Arbeitsverzeichnis: d:\OneDrive\Documents\GitHub\noahmasterball.github.io\20260813_spiel\

1. Erstelle js/core/EventBus.js:
   - Klasse EventBus mit on(event, callback), off(event, callback), emit(event, data)
   - Singleton-Export

2. Erstelle js/core/MathUtils.js:
   - distanceBetween(x1, y1, x2, y2)
   - clamp(value, min, max)
   - lerp(a, b, t)
   - pointInRect(px, py, rx, ry, rw, rh)
   - circleIntersectsRect(cx, cy, cr, rx, ry, rw, rh)
   - resolveCircleRectOverlap(cx, cy, cr, rx, ry, rw, rh) → {x, y}
   - pseudoRandom2D(x, y) — deterministische Zufallszahl aus Koordinaten
   Export als Objekt mit allen Funktionen.

3. Erstelle js/entities/Entity.js:
   - Klasse Entity mit: id, x, y, width, height, speed, moving, bounds, health, maxHealth, dead, hidden
   - Methode: isAlive(), getBounds(), getCenter(), distanceTo(other)
   - Keine Methoden die x/y direkt setzen! (Das macht nur EntityMover)

4. Erstelle js/data/ColorPalettes.js:
   - Exportiere houseColors Array aus altem Code (Zeile ~215-260 in overworld.js)
   - Exportiere sampleColorStops(), lerpColor(), colorArrayToRgba() aus Zeilen 4443-4546

5. Erstelle js/data/HouseStyles.js:
   - Exportiere createHouseStyles() aus Zeilen 11636-11699

6. Erstelle js/main.js als leeren Entry-Point:
   - Import-Platzhalter für alle Module
   - Kommentar: "Wird in Batch 11 (Integration) vervollständigt"

Lies den alten Code in gta_old/overworld/js/overworld.js für die exakten Implementierungen.
Alle Module als ES-Module (export/import) schreiben.
```

---

### Batch 2: Core Movement SSOT (NACH Batch 1 — kein Parallel)

**Subagent-Prompt:**
```
Erstelle das SSOT Movement System. Dies ist das WICHTIGSTE Modul des gesamten Refactorings.
Arbeitsverzeichnis: d:\OneDrive\Documents\GitHub\noahmasterball.github.io\20260813_spiel\

KONTEXT: Im alten Code (gta_old/overworld/js/overworld.js) wird entity.x/y an 10+ verschiedenen
Stellen pro Frame verändert (Zeilen 5716, 5736, 5742, 6641, 6755, 6827, 12535 etc.).
Das verursacht Zickzack-Bewegung und NPCs die nicht auf Wegen laufen.

1. Erstelle js/core/EntityMover.js:
   - Klasse EntityMover
   - Constructor: nimmt collisionSystem und roadNetwork
   - EINZIGE öffentliche Methode: move(entity, targetX, targetY, options)
     Pipeline: Kollision → Sidewalk-Constraint → Bounds → World-Bounds → entity.x/y setzen
   - teleport(entity, x, y) — für stuck-NPCs, setzt x/y direkt
   - KRITISCH: constrainToSidewalk bekommt entity.currentSidewalkSegment als Kontext,
     damit der NPC nicht auf ein falsches Nachbar-Segment springt
   - Siehe EntityMover-Design weiter oben in dieser Datei für die vollständige Implementierung

2. Erstelle js/systems/MovementSystem.js:
   - Klasse MovementSystem
   - Constructor: nimmt entityMover
   - update(entities, deltaTime):
     Für jede Entity: berechne Zielposition basierend auf entity.velocity/target,
     dann rufe entityMover.move() auf
   - Keine direkte Manipulation von entity.x/y!

3. Erstelle js/world/RoadNetwork.js:
   - Klasse RoadNetwork
   - Constructor: nimmt sidewalkCorridors, crosswalks, walkableAreas
   - constrainToSidewalk(x, y, currentSegment) → {x, y, segment}
     WICHTIG: Bevorzugt das currentSegment wenn möglich, wechselt nur bei echtem Übergang
   - findNearestSidewalkSpot(x, y) → {x, y, segment}
   - isOnSidewalk(x, y) → boolean
   - Portiere projectPointToSidewalk() (Zeilen 12435-12520) mit der Segment-Tracking-Verbesserung
   - Portiere pushPointOutOfObstacles() (Zeilen 12631-12697)
   - Portiere computeWalkableAreas() (Zeilen 11825-12005)
   - Portiere createSidewalkCorridors() (Zeilen 11736-11823)
   - Portiere createCrosswalks() (Zeilen 11700-11714)
   - Portiere createCityRoadLayout() (Zeilen 11715-11735)
   - Portiere createRoadAreas() (Zeilen 12145-12241)
   - Portiere createHouseWalkwayCorridors() (Zeilen 12243-12353)
   - Portiere createSidewalkObstacles() (Zeilen 12355-12434)

Lies den alten Code genau für alle Algorithmen. Die Logik muss identisch bleiben,
nur die Architektur ändert sich. ES-Module verwenden.
```

---

### Batch 3 + 4: Input/Camera + Collision (PARALLEL nach Batch 2)

**Subagent 3a — Input + Camera:**
```
Erstelle Input- und Camera-Systeme.
Arbeitsverzeichnis: d:\OneDrive\Documents\GitHub\noahmasterball.github.io\20260813_spiel\

1. Erstelle js/systems/InputSystem.js:
   - Klasse InputSystem
   - Constructor: bindet Keyboard/Mouse-Events auf canvas
   - State: keys = {}, mouse = {x, y, worldX, worldY, down: false}
   - Methoden:
     isKeyDown(key), isKeyPressed(key) (einmalig pro Frame)
     getMovementVector() → {dx, dy} (aus WASD/Arrows, normalisiert)
     isSprinting() → boolean (Shift)
     getMouseWorldPosition() → {x, y}
     isFirePressed() → boolean
     update() — setzt justPressed-Flags zurück am Frame-Ende
   - Portiere setupInput() aus Zeilen 456-687
   - Portiere updateMouseWorldPosition() aus Zeilen 2517-2532

2. Erstelle js/systems/CameraSystem.js:
   - Klasse CameraSystem
   - State: x, y, width, height, zoom
   - update(targetEntity, worldBounds):
     Zentriert auf targetEntity, clampt an worldBounds
   - worldToScreen(wx, wy) → {sx, sy}
   - screenToWorld(sx, sy) → {wx, wy}
   - Portiere updateCamera() aus Zeilen 1205-1223

Lies den alten Code für die exakten Implementierungen. ES-Module verwenden.
```

**Subagent 3b — Collision:**
```
Erstelle das Collision-System.
Arbeitsverzeichnis: d:\OneDrive\Documents\GitHub\noahmasterball.github.io\20260813_spiel\

1. Erstelle js/systems/CollisionSystem.js:
   - Klasse CollisionSystem
   - Constructor: nimmt buildingColliders[], vehicleColliders[]
   - resolve(entity, newX, newY) → {x, y}
     Prüft Kollision mit allen Gebäude-Collidern und schiebt Entity raus
   - isPointInsideAnyCollider(x, y) → boolean
   - circleHitsBuilding(cx, cy, radius) → building|null
   - getEntityCollisions(entity) → Collider[]
   - updateVehicleColliders(vehicles) — aktualisiert Fahrzeug-Collider pro Frame
   - Portiere: checkBuildingCollisions() (Zeilen 1225-1424, NUR Kollisionslogik, nicht Interaktion)
   - Portiere: resolveCircleRectCollision() (Zeilen 6022-6195)
   - Portiere: isPointInsideAnyCollider() (Zeilen 6196-6244)
   - Portiere: collectVehicleColliders() (Zeilen 5962-6021)
   - Nutze MathUtils für Geometrie-Berechnungen

Lies den alten Code für die exakten Implementierungen. ES-Module verwenden.
Importiere MathUtils aus js/core/MathUtils.js.
```

---

## ORCHESTRATOR 2: Game Systems & World

### Checkliste (abhaken wenn erledigt)
- [x] Batch 5: Entities (Player, NPC, Vehicle)
- [x] Batch 6: AI + Vehicle System
- [x] Batch 7: Combat System
- [x] Batch 8: World Generation + Interiors

**Wenn alle 4 Batches erledigt sind:** In dieser Datei die 4 Checkboxen abhaken und dem User sagen: "Orchestrator 2 fertig. Bitte neues Context-Fenster öffnen und diese Datei mit 'Orchestrator 3 starten' übergeben."

---

### Batch 5: Entity-Klassen (ZUERST in Orch. 2)

**Subagent-Prompt:**
```
Erstelle die konkreten Entity-Klassen.
Arbeitsverzeichnis: d:\OneDrive\Documents\GitHub\noahmasterball.github.io\20260813_spiel\

WICHTIG: Diese Klassen dürfen NIEMALS this.x oder this.y direkt setzen!
Alle Positionsänderungen gehen durch EntityMover.move().
Die Entities definieren nur ihren Zustand und ihre Logik-Daten.

1. Erstelle js/entities/Player.js (extends Entity):
   - Zusätzliche Properties: animationPhase, currentWeaponId, weaponInventory,
     weaponLoadout, money, casinoCredits, parts[]
   - Methoden: getCenter(), getMuzzlePosition(weapon)
   - Portiere Spieler-Initialisierung aus Constructor Zeilen 50-120
   - Portiere buildNPCParts() für Spieler-Teile aus Zeilen 5326-5525
   - Portiere getPlayerMuzzlePosition() aus Zeilen 2982-3017

2. Erstelle js/entities/NPC.js (extends Entity):
   - Zusätzliche Properties: path[], waypointIndex, waitTimer, stayOnSidewalks,
     currentSidewalkSegment, panicTimer, insideBuilding, fixedSpawn,
     animationPhase, palette, parts[], movementTracker
   - Methoden: getCurrentWaypoint(), advanceWaypoint(), isAtWaypoint(threshold),
     isPanicking(), isIdle()
   - KEINE move/position-Methoden!
   - Portiere buildNPC() DATEN aus Zeilen 5000-5273 (nur Properties, nicht Bewegung)
   - Portiere buildNPCParts() aus Zeilen 5326-5525
   - Portiere ensureNpcMovementTracker() aus Zeilen 6245-6342

3. Erstelle js/entities/Vehicle.js (extends Entity):
   - Zusätzliche Properties: path[], waypointIndex, baseColor, accentColor,
     parts[], yielding, yieldTimer
   - Methoden: getCurrentWaypoint(), advanceWaypoint(), isAtWaypoint(threshold)
   - Portiere buildVehicle() DATEN aus Zeilen 5274-5325
   - Portiere buildVehicleParts() aus Zeilen 5376-5525

Lies den alten Code in gta_old/overworld/js/overworld.js.
Importiere Entity aus js/entities/Entity.js. ES-Module verwenden.
```

---

### Batch 6a + 6b: AI + Vehicle System (PARALLEL nach Batch 5)

**Subagent 6a — AI System:**
```
Erstelle das NPC-KI-System.
Arbeitsverzeichnis: d:\OneDrive\Documents\GitHub\noahmasterball.github.io\20260813_spiel\

1. Erstelle js/systems/AISystem.js:
   - Klasse AISystem
   - Constructor: nimmt entityMover, roadNetwork, eventBus
   - update(npcs, player, deltaTime):
     Für jeden NPC:
       a) Skip wenn dead/hidden/insideBuilding
       b) Wenn panicTimer > 0: handlePanic(npc, player)
       c) Sonst: handleWaypointNavigation(npc)
       d) updateStuckDetection(npc)
       e) updateAnimation(npc)
   - handleWaypointNavigation(npc):
     Berechne Richtung zum aktuellen Waypoint, berechne targetX/targetY,
     rufe this.entityMover.move(npc, targetX, targetY) auf
     Wenn Waypoint erreicht: npc.advanceWaypoint(), ggf. waitTimer setzen
   - handlePanic(npc, player):
     Berechne Fluchtrichtung weg vom Spieler,
     rufe this.entityMover.move() auf
   - handleStuck(npc):
     Wenn zu lange nicht bewegt: this.entityMover.teleport() zum nächsten Sidewalk
   - Portiere: updateNPC() Logik aus Zeilen 5598-5820
   - Portiere: updateNpcPanicMovement() aus Zeilen 6787-6886
   - Portiere: updateNpcMovementTracker() aus Zeilen 6343-6408
   - Portiere: redirectNpcOnWalkwayEdge() aus Zeilen 6603-6668
   - Portiere: teleportNpcToNearestSidewalk() aus Zeilen 6669-6786
   - Portiere: findNearestSidewalkSpot() aus Zeilen 6409-6534
   - Portiere: getBuildingSidewalkExit() aus Zeilen 6535-6602

KRITISCH: Alle Positionsänderungen NUR über this.entityMover.move() oder .teleport()!
Niemals npc.x = ... direkt setzen!
Lies den alten Code für alle Algorithmen. ES-Module verwenden.
```

**Subagent 6b — Vehicle System:**
```
Erstelle das Vehicle-System.
Arbeitsverzeichnis: d:\OneDrive\Documents\GitHub\noahmasterball.github.io\20260813_spiel\

1. Erstelle js/systems/VehicleSystem.js:
   - Klasse VehicleSystem
   - Constructor: nimmt entityMover, collisionSystem, roadNetwork
   - update(vehicles, npcs, deltaTime):
     Für jedes Vehicle:
       a) Berechne Richtung zum aktuellen Waypoint
       b) Prüfe shouldYield(vehicle, npcs) — Fußgänger auf Zebrastreifen
       c) Wenn nicht yielding: berechne targetX/targetY, rufe entityMover.move() auf
       d) Wenn Waypoint erreicht: vehicle.advanceWaypoint()
   - shouldYield(vehicle, npcs) → boolean
   - Portiere: updateVehicle() aus Zeilen 6888-7103
   - Portiere: shouldVehicleYield() aus Zeilen 6986-7047
   - Portiere: isVehicleAlignedForCrosswalk() aus Zeilen 7048-7069
   - Portiere: isVehicleApproachingCrosswalk() aus Zeilen 7070-7103

KRITISCH: Positionsänderungen NUR über entityMover.move()!
Lies den alten Code. ES-Module verwenden.
```

---

### Batch 7: Combat System (PARALLEL nach Batch 5)

**Subagent-Prompt:**
```
Erstelle das Combat-System.
Arbeitsverzeichnis: d:\OneDrive\Documents\GitHub\noahmasterball.github.io\20260813_spiel\

1. Erstelle js/data/WeaponCatalog.js:
   - Exportiere createWeaponCatalog() aus Zeilen 2553-2655
   - Exportiere getWeaponDefinition(catalog, id) aus Zeilen 2535-2546
   - Reine Daten, keine Logik

2. Erstelle js/systems/CombatSystem.js:
   - Klasse CombatSystem
   - Constructor: nimmt eventBus, weaponCatalog
   - State: projectiles[], bloodDecals[]
   - update(player, npcs, deltaTime):
     a) updateProjectiles(deltaTime) — Positionen updaten, Lebenszeit prüfen
     b) checkProjectileCollisions(npcs) — Treffer prüfen
   - fireWeapon(player, mouseWorldPos):
     Erstelle Projektil(e) basierend auf aktueller Waffe
   - onNpcHit(npc, damage):
     npc.health -= damage, emit('npc:hit'), wenn tot: emit('npc:killed')
   - spawnBloodDecal(x, y)
   - Portiere: processPlayerFiring() aus Zeilen 2991-3017
   - Portiere: spawnProjectilesForWeapon() aus Zeilen 3019-3036
   - Portiere: createProjectile() aus Zeilen 3038-3064
   - Portiere: updateProjectiles() aus Zeilen 3065-3103
   - Portiere: checkProjectileNpcCollision() aus Zeilen 3180-3201
   - Portiere: onNpcHit() aus Zeilen 3203-3214
   - Portiere: killNpc() aus Zeilen 3216-3232
   - Portiere: spawnBloodDecal() aus Zeilen 3234-3243

3. Erstelle js/data/Persistence.js:
   - loadWeaponInventory(), persistWeaponInventory()
   - loadWeaponLoadout(), persistWeaponLoadout()
   - loadCurrentWeaponId(), persistCurrentWeaponId()
   - loadCasinoCredits(), storeCasinoCredits()
   - loadPlayerMoney(), persistPlayerMoney()
   - Portiere alle localStorage-Methoden aus Zeilen 2789-2945, 2657-2707

Lies den alten Code. ES-Module verwenden.
```

---

### Batch 8: World Generation + Interiors (PARALLEL nach Batch 5)

**Subagent-Prompt:**
```
Erstelle World Generation und Interior-Module.
Arbeitsverzeichnis: d:\OneDrive\Documents\GitHub\noahmasterball.github.io\20260813_spiel\

1. Erstelle js/world/WorldGenerator.js:
   - Klasse WorldGenerator
   - generateWorld() → { buildings, streetDetails, dynamicAgents }
   - Portiere: createCityBuildings() aus Zeilen 3247-3595
   - Portiere: createDynamicAgents() aus Zeilen 4550-4999
     (nur die Konfigurations-Daten, NPC/Vehicle-Objekte über NPC.js/Vehicle.js erstellen)
   - Portiere: createHouseVisitorNPCs() aus Zeilen 3784-4169

2. Erstelle js/world/BuildingFactory.js:
   - createBuilding(type, x, y, width, height, options) → Building-Objekt
   - createBuildingColliders(buildings) → Collider[]
   - Portiere: createBuildingColliders() aus Zeilen 12025-12142

3. Erstelle js/world/StreetDetails.js:
   - createStreetDetails(buildings, roadLayout) → Detail[]
   - Portiere: createStreetDetails() aus Zeilen 3596-3777

4. Erstelle js/interiors/InteriorManager.js:
   - Klasse InteriorManager
   - enterInterior(type, building, player) — speichert Overworld-State, wechselt Szene
   - exitInterior() — stellt Overworld-State wieder her
   - Portiere: enterWeaponShop() aus Zeilen 2363-2440
   - Portiere: exitInterior() aus Zeilen 2441-2515

5. Erstelle js/interiors/WeaponShop.js:
   - Klasse WeaponShop
   - State: menuOpen, selectedIndex, counters, collisionAreas
   - update(player, inputSystem) — Bewegung + Interaktion im Interior
   - handleInteraction() — Waffen-Menü
   - Portiere: createWeaponShopInterior() aus Zeilen 2037-2129
   - Portiere: handleWeaponShopMovement() aus Zeilen 2130-2183
   - Portiere: updateWeaponShopState() aus Zeilen 2211-2243

6. Erstelle js/interiors/Casino.js:
   - Klasse Casino
   - convertDollarsToCredits(player, amount)
   - convertCreditsToDollars(player, amount)
   - Portiere: Casino-Logik aus Zeilen 743-920, 2708-2747

Lies den alten Code. ES-Module verwenden.
```

---

## ORCHESTRATOR 3: Rendering & Integration

### Checkliste (abhaken wenn erledigt)
- [ ] Batch 9: Rendering System
- [ ] Batch 10: Day/Night + UI + Interaction
- [ ] Batch 11: Game.js Integration + index.html

**Wenn alle 3 Batches erledigt sind:** In dieser Datei alle Checkboxen abhaken. Refactoring abgeschlossen.

---

### Batch 9: Rendering (ZUERST in Orch. 3)

**Subagent 9a — World + Building Renderer:**
```
Erstelle World- und Building-Renderer.
Arbeitsverzeichnis: d:\OneDrive\Documents\GitHub\noahmasterball.github.io\20260813_spiel\

1. Erstelle js/rendering/Renderer.js:
   - Klasse Renderer
   - Constructor: nimmt canvas
   - clear(), save(), restore(), translate(x, y)
   - getContext() → ctx
   - resizeCanvas()
   - Portiere: resizeCanvas() aus Zeilen 442-454

2. Erstelle js/rendering/WorldRenderer.js:
   - Klasse WorldRenderer
   - Constructor: nimmt renderer (Renderer-Instanz)
   - drawGrass(worldWidth, worldHeight)
   - drawRoads(roadLayout)
   - drawSidewalks(sidewalkCorridors)
   - drawStreetDetails(streetDetails)
   - drawCrosswalks(crosswalks)
   - Portiere: drawImprovedRoadSystem() aus Zeilen 7124-7225
   - Portiere: drawSidewalks() aus Zeilen 7498-7553
   - Portiere: drawStreetDetails() aus Zeilen 7732-7801
   - Portiere: drawCrosswalk() aus Zeilen 7670-7731
   - Portiere: drawDiagonalRoad() aus Zeilen 7226-7257
   - Portiere: drawDiagonalSidewalks() aus Zeilen 7590-7669
   - Portiere: renderSidewalkGridInBounds() aus Zeilen 7338-7497
   - Portiere: Alle Street-Detail-Draw-Methoden aus Zeilen 8086-8511
     (drawParkingLot, drawTree, drawBench, drawStreetLamp, etc.)

3. Erstelle js/rendering/BuildingRenderer.js:
   - Klasse BuildingRenderer
   - Constructor: nimmt renderer
   - drawBuildings(buildings, houseStyles)
   - Routing basierend auf building.type → spezifische Methode
   - Portiere: drawBuildings() aus Zeilen 8512-8571
   - Portiere: drawHouse() aus Zeilen 9590-10172
   - Portiere: drawCasino() aus Zeilen 10173-10352
   - Portiere: drawOfficeTower() aus Zeilen 10353-10438
   - Portiere: drawResidentialTower() aus Zeilen 10439-10496
   - Portiere: drawWeaponShop() aus Zeilen 10497-10588
   - Portiere: drawPoliceStation() aus Zeilen 10589-10794
   - Portiere: drawShop() aus Zeilen 10795-10822
   - Portiere: drawRestaurant() aus Zeilen 10823-10894
   - Portiere: drawMixedUseBlock() aus Zeilen 8572-8747
   - Portiere: computeHouseMetrics() aus Zeilen 8748-8971

Lies den alten Code. ES-Module verwenden.
```

**Subagent 9b — Entity + Effects Renderer:**
```
Erstelle Entity- und Effects-Renderer.
Arbeitsverzeichnis: d:\OneDrive\Documents\GitHub\noahmasterball.github.io\20260813_spiel\

1. Erstelle js/rendering/EntityRenderer.js:
   - Klasse EntityRenderer
   - Constructor: nimmt renderer
   - drawNPCs(npcs, camera)
   - drawVehicles(vehicles, camera)
   - drawPlayer(player, camera)
   - drawCharacterParts(entity, parts, animationPhase)
   - drawEquippedWeapon(entity, weapon)
   - Portiere: drawDynamicAgents() aus Zeilen 7802-7822
   - Portiere: drawNPC() aus Zeilen 8016-8029
   - Portiere: drawVehicleParts() aus Zeilen 8030-8085
   - Portiere: drawCharacterParts() aus Zeilen 7910-8015
   - Portiere: drawEquippedWeaponModel() aus Zeilen 7837-7909
   - Portiere: drawPlayer() aus Zeilen 11068-11104
   - Portiere: drawWeaponSilhouette() aus Zeilen 1746-1852

2. Erstelle js/rendering/EffectsRenderer.js:
   - Klasse EffectsRenderer
   - Constructor: nimmt renderer
   - drawProjectiles(projectiles)
   - drawBloodDecals(bloodDecals)
   - Portiere: drawProjectiles() aus Zeilen 3104-3140
   - Portiere: drawProjectileSprite() aus Zeilen 3141-3157
   - Portiere: drawBloodDecals() aus Zeilen 3158-3244

Lies den alten Code. ES-Module verwenden.
```

---

### Batch 10a + 10b: Day/Night + UI + Interaction (PARALLEL nach Batch 9)

**Subagent 10a — Day/Night + UI:**
```
Erstelle Day/Night und UI-Systeme.
Arbeitsverzeichnis: d:\OneDrive\Documents\GitHub\noahmasterball.github.io\20260813_spiel\

1. Erstelle js/systems/DayNightSystem.js:
   - Klasse DayNightSystem
   - State: phaseIndex, progress, phases[], stars[], lighting
   - update(deltaTime) — Phase fortschreiten, Lighting berechnen
   - getCurrentLighting() → {overlayColor, opacity, ...}
   - Portiere: initDayNightCycle() aus Zeilen 4170-4221
   - Portiere: generateNightSkyStars() aus Zeilen 4222-4254
   - Portiere: computeDayNightLighting() aus Zeilen 4255-4442
   - Portiere: updateDayNightCycle() aus Zeilen 994-1101

2. Erstelle js/rendering/UIRenderer.js:
   - Klasse UIRenderer
   - Constructor: nimmt renderer, DOM-Elemente
   - drawHUD(player, fps, weaponCatalog)
   - drawCrosshair(mouse, weapon)
   - drawDayNightOverlay(lighting)
   - drawNightSkyStars(stars, starPhase)
   - updateFPSDisplay(fps)
   - Portiere: drawUI() aus Zeilen 11105-11170
   - Portiere: drawCrosshair() aus Zeilen 11171-11200
   - Portiere: drawDayNightLighting() aus Zeilen 10921-11004
   - Portiere: drawNightSkyStars() aus Zeilen 11005-11067

Lies den alten Code. ES-Module verwenden.
```

**Subagent 10b — Interaction System:**
```
Erstelle das Interaction-System.
Arbeitsverzeichnis: d:\OneDrive\Documents\GitHub\noahmasterball.github.io\20260813_spiel\

1. Erstelle js/systems/InteractionSystem.js:
   - Klasse InteractionSystem
   - Constructor: nimmt eventBus, interiorManager, buildings
   - update(player, inputSystem):
     a) Finde nächstes interaktives Gebäude
     b) Wenn in Reichweite: showInteractionUI()
     c) Wenn E gedrückt: performEntry()
   - showInteractionUI(building) — zeigt DOM-Buttons
   - hideInteractionUI()
   - performEntry(building, player)
   - Portiere: Interaktions-Teile von checkBuildingCollisions() (Zeilen 1330-1424)
   - Portiere: showBuildingInteraction() aus Zeilen 11271-11363
   - Portiere: hideBuildingInteraction() aus Zeilen 11365-11429
   - Portiere: performBuildingEntry() aus Zeilen 11201-11270
   - Portiere: Casino-UI aus Zeilen 821-920

WICHTIG: Dieses System verändert KEINE Positionen. Es erkennt nur Proximity
und delegiert an InteriorManager für Szenen-Wechsel.
Lies den alten Code. ES-Module verwenden.
```

---

### Batch 11: Integration — Game.js + index.html (ZULETZT, nach ALLEM)

**Subagent-Prompt:**
```
Erstelle die finale Integration: Game.js und aktualisiere index.html.
Arbeitsverzeichnis: d:\OneDrive\Documents\GitHub\noahmasterball.github.io\20260813_spiel\

KONTEXT: Alle Module sind bereits erstellt. Jetzt müssen sie zusammengesteckt werden.

1. Erstelle js/core/Game.js:
   - Klasse Game
   - Constructor:
     a) Erstelle EventBus
     b) Erstelle Renderer (canvas)
     c) Erstelle RoadNetwork (generiere Straßen)
     d) Erstelle WorldGenerator → buildings, streetDetails, agents
     e) Erstelle CollisionSystem (buildingColliders)
     f) Erstelle EntityMover (collisionSystem, roadNetwork)
     g) Erstelle Player
     h) Erstelle NPCs und Vehicles aus WorldGenerator-Daten
     i) Erstelle alle Systems: Input, Movement, AI, Vehicle, Combat, Camera, DayNight, Interaction
     j) Erstelle alle Renderer: World, Building, Entity, Effects, UI
     k) Erstelle InteriorManager, WeaponShop, Casino
     l) Lade Persistence-Daten

   - update(deltaTime):
     if (scene === 'overworld'):
       inputSystem.update()
       const moveVec = inputSystem.getMovementVector()
       entityMover.move(player, player.x + moveVec.dx * speed, player.y + moveVec.dy * speed)
       aiSystem.update(npcs, player, deltaTime)
       vehicleSystem.update(vehicles, npcs, deltaTime)
       collisionSystem.updateVehicleColliders(vehicles)
       combatSystem.update(player, npcs, deltaTime)
       if (inputSystem.isFirePressed()) combatSystem.fireWeapon(player, inputSystem.getMouseWorldPosition())
       interactionSystem.update(player, inputSystem)
       cameraSystem.update(player, worldBounds)
       dayNightSystem.update(deltaTime)
     else if (scene === 'weaponShop'):
       weaponShop.update(player, inputSystem)

   - render():
     renderer.clear()
     if (scene === 'overworld'):
       renderer.save()
       renderer.translate(-camera.x, -camera.y)
       worldRenderer.drawGrass()
       worldRenderer.drawRoads()
       worldRenderer.drawSidewalks()
       worldRenderer.drawStreetDetails()
       buildingRenderer.drawBuildings()
       effectsRenderer.drawBloodDecals()
       entityRenderer.drawVehicles()
       entityRenderer.drawNPCs()
       entityRenderer.drawPlayer()
       effectsRenderer.drawProjectiles()
       uiRenderer.drawDayNightOverlay()
       renderer.restore()
       uiRenderer.drawHUD()
       uiRenderer.drawCrosshair()
     else:
       weaponShop.render() oder casino.render()

   - gameLoop():
     berechne deltaTime
     this.update(deltaTime)
     this.render()
     requestAnimationFrame(() => this.gameLoop())

   - start():
     this.gameLoop()

2. Aktualisiere js/main.js:
   import { Game } from './core/Game.js';
   const game = new Game(document.getElementById('gameCanvas'));
   game.start();

3. Erstelle/aktualisiere index.html:
   - Kopiere die HTML-Struktur aus gta_old/overworld/index.html
   - Ändere den Script-Tag zu: <script type="module" src="js/main.js"></script>
   - Alle DOM-Elemente (Canvas, Buttons, UI) bleiben gleich

4. VERIFIKATION:
   - Prüfe dass KEIN Modul entity.x/y direkt setzt außer EntityMover
   - Prüfe dass alle Imports/Exports korrekt sind
   - Prüfe dass alle Methoden aus dem alten Code portiert wurden
   - Liste fehlende Methoden auf falls vorhanden

Lies die bereits erstellten Module um die korrekten Import-Pfade zu verwenden.
```

---

## Ablauf-Diagramm

```
ORCHESTRATOR 1:
  Batch 1 (Foundation)
       ↓
  Batch 2 (EntityMover SSOT)
       ↓
  Batch 3a (Input+Camera)  ║  Batch 3b (Collision)    ← PARALLEL
       ↓
  ✅ Abhaken → User: "Neues Fenster für Orchestrator 2"

ORCHESTRATOR 2:
  Batch 5 (Player, NPC, Vehicle Entities)
       ↓
  Batch 6a (AI System)  ║  Batch 6b (Vehicle System)  ║  Batch 7 (Combat)  ║  Batch 8 (World+Interiors)    ← PARALLEL
       ↓
  ✅ Abhaken → User: "Neues Fenster für Orchestrator 3"

ORCHESTRATOR 3:
  Batch 9a (World+Building Renderer)  ║  Batch 9b (Entity+Effects Renderer)    ← PARALLEL
       ↓
  Batch 10a (DayNight+UI)  ║  Batch 10b (Interaction)    ← PARALLEL
       ↓
  Batch 11 (Game.js Integration + index.html)
       ↓
  ✅ FERTIG — Alle Checkboxen abhaken
```

---

## Regeln für jeden Orchestrator

1. **Lies diese Datei ZUERST** um zu wissen welcher Orchestrator du bist
2. **Starte Subagents für parallele Batches** in einem einzigen Message-Block
3. **Sequenzielle Batches** müssen warten bis der vorherige fertig ist
4. **Jeder Subagent** muss den alten Code in `gta_old/overworld/js/overworld.js` lesen für die exakte Logik
5. **SSOT-Regel:** Nur EntityMover.move() darf entity.x/y setzen. Wenn ein Subagent dagegen verstößt, korrigiere es
6. **ES-Module:** Alle Dateien nutzen `export class` / `export function` und `import { ... } from`
7. **Hake Batches ab** sobald sie erledigt sind (bearbeite die Checkboxen in dieser Datei)
8. **Wenn dein Orchestrator fertig ist:** Hake alle deine Batches ab und sag dem User er soll ein neues Fenster öffnen

---

## Feature-Vollständigkeit — NICHTS darf fehlen!

Jeder Subagent MUSS sicherstellen, dass alle bestehenden Features erhalten bleiben.
Das Spiel darf grafisch moderner und besser aussehen, aber KEIN Feature darf wegfallen.

### Komplette Feature-Liste (alle müssen nach Refactoring funktionieren):

**Spieler:**
- [ ] WASD/Arrow-Bewegung mit Collision
- [ ] Sprint (Shift-Taste, 2x Geschwindigkeit)
- [ ] Lauf-Animation (Beine/Arme schwingen)
- [ ] Spieler-Teile-Rendering (13 Körperteile: Schatten, Kopf, Torso, Arme, Beine, Haare, Augen)
- [ ] Waffe sichtbar am Spieler wenn ausgerüstet

**Waffen & Kampf:**
- [ ] 6 Waffentypen: Pistole, SMG, Sturmgewehr, Shotgun, Sniper, LMG
- [ ] Waffen-Auswahl per Nummerntasten (1-9)
- [ ] Schießen per Mausklick
- [ ] Projektile mit Flugbahn und Geschwindigkeit
- [ ] Projektil-Sprites (visuelle Darstellung)
- [ ] NPC-Treffererkennung (Kreis-Kollision)
- [ ] Schadenssystem (verschiedener Schaden pro Waffe)
- [ ] NPC-Tod (fällt um, Rotation)
- [ ] Blut-Decals am Boden (mit Fade-Out)
- [ ] Feuerrate pro Waffe (Cooldown)
- [ ] Mündungsposition je nach Waffe

**NPCs:**
- [ ] Waypoint-basierte Pfadverfolgung
- [ ] Wartezeiten an Waypoints
- [ ] Bürgersteig-Constraint (NPC bleibt auf Gehweg)
- [ ] Individuelle Farb-Paletten (Kleidung, Haut, Haare)
- [ ] Verschiedene Geschwindigkeiten (1.0-1.35)
- [ ] Panik-Verhalten (Flucht vor Spieler nach Schüssen)
- [ ] Stuck-Detection mit Teleport zum nächsten Gehweg
- [ ] Gebäude betreten/verlassen (hidden-Flag)
- [ ] Bounds-System (NPC bleibt in zugewiesenem Bereich)
- [ ] Lauf-Animation identisch zum Spieler
- [ ] 10+ verschiedene NPCs mit eigenen Routen
- [ ] Haus-Besucher NPCs (besuchen Häuser, gehen wieder)

**Fahrzeuge:**
- [ ] Waypoint-basierte Routenverfolgung
- [ ] Basis- und Akzentfarben
- [ ] Fahrzeug-Teile-Rendering
- [ ] Yielding: Fahrzeuge halten an Zebrastreifen für Fußgänger
- [ ] Zebrastreifen-Erkennung
- [ ] 3+ Fahrzeuge mit eigenen Routen

**Welt & Gebäude:**
- [ ] 3600x3000 Spielwelt
- [ ] Gras-Hintergrund
- [ ] Straßensystem (horizontal + vertikal + diagonal)
- [ ] Bürgersteige mit Textur-Pattern
- [ ] Zebrastreifen (11 Stück)
- [ ] 50+ Gebäude in verschiedenen Typen:
  - [ ] Häuser (mit verschiedenen Stilen, 6 Haus-Stile)
  - [ ] Casino
  - [ ] Büroturm
  - [ ] Wohnturm
  - [ ] Waffenladen
  - [ ] Polizeistation
  - [ ] Shop
  - [ ] Restaurant
  - [ ] Mixed-Use Block
- [ ] Gebäude-Kollision (Spieler und NPCs prallen ab)
- [ ] Straßen-Details:
  - [ ] Parkplätze
  - [ ] Bäume
  - [ ] Bänke
  - [ ] Fahrradständer
  - [ ] Straßenlaternen
  - [ ] Mülleimer
  - [ ] Bushaltestellen
  - [ ] Pfützen
  - [ ] Pflanzenkästen

**Interaktion & Interiors:**
- [ ] "E zum Interagieren" bei Gebäuden in Reichweite (60px)
- [ ] Gebäude-Interaktions-Dialog (DOM-Buttons)
- [ ] Waffenladen-Interior:
  - [ ] Eigene Szene mit eigenem Rendering
  - [ ] Bewegung im Interior
  - [ ] Waffen-Theken mit Silhouetten
  - [ ] Waffen-Kauf-Menü (Pfeiltasten + Enter)
  - [ ] Ausgang zum Overworld
- [ ] Casino-System:
  - [ ] Dollar → Credits umtauschen
  - [ ] Credits → Dollar zurücktauschen
  - [ ] Wechselkurs-Anzeige
  - [ ] Buy/Cashout Buttons mit Zustandsverwaltung

**Kamera:**
- [ ] Smooth Follow auf Spieler
- [ ] World-Bounds Clamping (kein schwarzer Rand)
- [ ] Korrekte Welt-zu-Screen Transformation

**Tag/Nacht-Zyklus:**
- [ ] 4 Phasen: Tag (300s), Dämmerung (120s), Nacht (300s), Morgenröte (120s)
- [ ] Farbiges Lighting-Overlay
- [ ] Sterne am Nachthimmel (mit Twinkle-Animation)
- [ ] Smooth Übergänge zwischen Phasen

**UI/HUD:**
- [ ] Geld-Anzeige
- [ ] Gesundheitsanzeige
- [ ] Munitions-Anzeige
- [ ] FPS-Counter
- [ ] Spieler-Position Anzeige
- [ ] Fadenkreuz (Crosshair) — passt sich an Waffe an
- [ ] Interaktions-Hinweis-Text
- [ ] Fehler-Panel

**Persistenz (LocalStorage):**
- [ ] Waffen-Inventar speichern/laden
- [ ] Waffen-Loadout speichern/laden
- [ ] Aktuelle Waffe speichern/laden
- [ ] Casino-Credits speichern/laden
- [ ] Spieler-Geld speichern/laden

**Sonstige:**
- [ ] ESC-Taste: Menüs schließen / Interior verlassen
- [ ] Canvas-Resize bei Fenstergrößenänderung
- [ ] Deterministische Pseudo-Zufallszahlen für Texturen (pseudoRandom2D)

### Grafik-Upgrades (optional, wo sinnvoll):

Subagents dürfen gerne folgende Verbesserungen einbauen, solange die Funktionalität erhalten bleibt:
- Weichere Schatten (z.B. mit Blur-Filter statt harter Kreise)
- Bessere Gebäude-Darstellung (mehr Details, Tiefeneffekte)
- Smooth-ere Animationen (ease-in/out statt linear)
- Anti-Aliasing für Formen
- Bessere Farbpaletten und Kontraste
- Partikel-Effekte für Schüsse/Einschläge
- Ambient Lighting statt hartem Overlay
- Schatten die sich mit Tag/Nacht ändern

---

## Verifikation (nach Orchestrator 3)

Nach Abschluss aller Batches:

1. **SSOT-Check:** `grep -r "\.x\s*=" js/ --include="*.js"` — nur EntityMover.js sollte entity.x/y setzen
2. **Import-Check:** Alle Module starten mit imports, keine zirkulären Abhängigkeiten
3. **Vollständigkeit:** Vergleiche Methoden-Liste aus altem Code mit neuen Modulen
4. **Browser-Test:** index.html im Browser öffnen, Console auf Fehler prüfen
5. **Funktionstest:** Spieler bewegen, NPCs beobachten (laufen sie auf Wegen?), Waffe abfeuern
