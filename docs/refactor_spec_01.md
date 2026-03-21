# Refactor 01 — Babylon Demo: SSOT-Zentralisierung aller Entitäts-Blueprints

**Date**: 2026-03-21
**Status**: Ready for execution
**Scope**: Functionally neutral refactoring — no behavioral, UI, or data-flow changes
**Prerequisite**: None

---

## Hard Rules (NON-NEGOTIABLE)

1. Jede existierende Funktion muss nachher weiterhin existieren und funktionieren.
2. Keine unbeabsichtigte Änderung von UI, Optik, UX, Verhalten oder Datenfluss.
3. Nur interne Vereinheitlichung, keine fachliche Verhaltensänderung.
4. Payload-/Architektur-Umstellung darf keine sichtbare Regression erzeugen.
5. Wenn Unsicherheit besteht, bestehendes Verhalten 1:1 beibehalten.
6. Do NOT add comments like `// removed`, `// deprecated`, `_unused` vars, or lint suppressions.
7. Do NOT change any function's public API signature unless explicitly specified.
8. Do NOT touch files not listed in the agent's scope.

---

## Findings from Conversation

### Finding 1: Hardcoded Colors & Dimensions in `createBuilding()`
- **~Line 62–134**: `createBuilding()` nimmt `wallColor`/`roofColor` als Parameter, aber Window-Farben (~L110–112: `0.6, 0.85, 1.0`), Door-Farben (~L130: `0.35, 0.2, 0.1`), Window-Dimensionen (~L101: `1.0 x 1.4`), Door-Dimensionen (~L125: `1.6 x 2.4`), Roof-Overhang (~L82: `0.4`), Floor-Height (~L63: `3`) und Window-Spacing (~L95: `1.2`, ~L105: `2.4`) sind alle inline hardcoded.
- **SSOT-Verletzung**: Um das Fenster-Aussehen aller Gebäude zu ändern, müsste man 5+ Stellen im Code anfassen.

### Finding 2: Hardcoded Colors & Dimensions in `createTree()`
- **~Line 136–169**: Trunk-Farbe (~L145: `0.4, 0.25, 0.1`), Leaf-Farbe (~L157: `0.15, 0.5, 0.15`), Trunk-Höhe (~L140: `2`), Leaf-Diameter (~L152: `3.5`, ~L163: `2.8`), Leaf-Offsets (~L166: `0.5, 0.3`) — alles hardcoded.
- **SSOT-Verletzung**: Um Bäume grösser/kleiner/anders zu machen, muss man in die Funktion rein.

### Finding 3: Hardcoded Colors & Dimensions in `createStreetLamp()`
- **~Line 171–205**: Pole-Höhe (~L175: `5`), Pole-Diameter (~L175: `0.15`), Lamp-Diameter (~L187: `0.6`), Light-Intensity (~L202: `0.3`), Light-Range (~L204: `15`), alle Farben — hardcoded.

### Finding 4: Hardcoded Character Blueprint in `createCharacter()`
- **~Line 357–397**: Body-Höhe (~L361: `1.2`), Head-Diameter (~L373: `0.5`), Leg-Höhe (~L386: `0.8`), Skin-Farbe (~L378: `0.85, 0.7, 0.55`), Jeans-Farbe (~L391: `0.2, 0.2, 0.5`), alle Proportionen — hardcoded.
- **SSOT-Verletzung**: Wenn der Character-Style geändert werden soll (z.B. grösserer Kopf, andere Hautfarbe), muss man in die Factory-Funktion. Alle 5 Characters teilen denselben Blueprint, aber der Blueprint ist nicht zentral konfigurierbar.

### Finding 5: Hardcoded Material-Farben für Infrastruktur
- **~Line 218–220**: Road-Farbe, ~L232–233: Marking-Farbe, ~L245: Sidewalk-Farbe, ~L348–350: Water-Farbe — alles inline.
- **SSOT-Verletzung**: Kein zentrales Farbschema. Straßen-, Gehweg-, Wasser-Farben an verschiedenen Stellen.

### Finding 6: Keine Material-Wiederverwendung
- Jeder `createBuilding()`-Aufruf erzeugt eigene Window-, Door-Materialien (~L109, ~L129). Bei 7 Gebäuden = 7× identische Window-Materialien, 7× identische Door-Materialien. Babylon.js kann Materialien teilen.

### Finding 7: Building-Katalog fehlt
- **~Line 257–307**: 7 Gebäude mit je 6–8 hardcodierten Parametern. Kein zentraler Katalog. Um alle Gebäude-Typen zu überblicken oder einen Stil global zu ändern, muss man 7 Aufrufstellen lesen.

---

## Execution Plan

**2 Batches, 3 Sub-Agents total.**

```
Batch 1 (Sequential — Agent 1A schreibt Config, die 1B+1C brauchen):
  └─ Agent 1A: Zentrale Blueprints & Shared Materials extrahieren

Batch 2 (Parallel — keine File-Überlappung mit Batch 1, aber logisch abhängig):
  ├─ Agent 2A: Building-Katalog + Factory refactoren
  └─ Agent 2B: Character-, Tree-, Lamp-, Infrastruktur-Factories refactoren
```

> Hinweis: Da alles in einer einzigen Datei (`babylon_demo.js`) liegt, müssen alle Agents sequentiell arbeiten. Die Batch-2-Agents beschreiben separate logische Bereiche derselben Datei und werden daher ebenfalls sequentiell ausgeführt.

---

## Batch 1 — Zentrale Blueprints & Shared Materials (1 Agent, Sequential)

### Agent 1A: Blueprint-Config-Block + Shared Materials einführen

**File(s)**: `20260813_spiel/babylon_demo.js`

**What to do**:
- Read `babylon_demo.js` first
- Direkt nach Scene-Setup (~L56, nach `ground.receiveShadows = true;`) einen zentralen `CONFIG`-Block einfügen
- Shared Materials für Window, Door, Skin, Jeans erstellen (einmalig, wiederverwendbar)

#### What was working before
- Scene rendert mit hardcodierten Werten
- Jede Factory-Funktion erstellt eigene Materialien

#### How it stays working after
- Alle Werte bleiben numerisch identisch — sie werden nur aus `CONFIG` gelesen statt inline
- Shared Materials haben exakt dieselben Farben/Alpha-Werte wie vorher

#### Risks
- Typo in CONFIG-Referenz → Runtime-Error
- Material-Sharing könnte theoretisch Seiteneffekte haben (wenn jemand ein Material pro Instanz ändert) — hier nicht der Fall, da alle identisch sind

#### Safeguards
- [ ] Before/after comparison: Visueller Vergleich der Szene im Playground
- [ ] Alle 7 Gebäude, 10 Bäume, 8 Laternen, 5 Characters müssen identisch aussehen

#### Exact Changes

**Einfügen nach ~Line 56** (`ground.receiveShadows = true;`):

- BEFORE:
```javascript
    // ============================================================
    // HELPER FUNCTIONS
    // ============================================================
```

- AFTER:
```javascript
    // ============================================================
    // CENTRAL BLUEPRINTS (SSOT)
    // ============================================================

    var CONFIG = {
        building: {
            floorHeight: 3,
            roofOverhang: 0.4,
            roofThickness: 0.4,
            window: { width: 1.0, height: 1.4, spacing: 2.4, perUnitWidth: 2.5, halfSpacing: 1.2 },
            door: { width: 1.6, height: 2.4 }
        },
        tree: {
            trunk: { height: 2, diameterTop: 0.3, diameterBottom: 0.5 },
            crown: { diameter: 3.5, segments: 8 },
            crownSecondary: { diameter: 2.8, offsetX: 0.5, offsetY: 0.6, offsetZ: 0.3 },
            trunkY: 1,
            crownY: 3.2
        },
        streetLamp: {
            pole: { height: 5, diameter: 0.15 },
            head: { diameter: 0.6 },
            light: { intensity: 0.3, range: 15 },
            poleY: 2.5,
            headY: 5.2,
            lightY: 5
        },
        character: {
            body: { height: 1.2, diameterTop: 0.5, diameterBottom: 0.4 },
            head: { diameter: 0.5 },
            leg: { height: 0.8, diameter: 0.2, offsetX: 0.12 },
            bodyY: 1.1,
            headY: 2.0,
            legY: 0.4
        },
        colors: {
            trunk: new BABYLON.Color3(0.4, 0.25, 0.1),
            leaves: new BABYLON.Color3(0.15, 0.5, 0.15),
            lampPole: new BABYLON.Color3(0.3, 0.3, 0.3),
            lampGlow: new BABYLON.Color3(1, 0.95, 0.7),
            lampEmissive: new BABYLON.Color3(1, 0.9, 0.5),
            lampLight: new BABYLON.Color3(1, 0.9, 0.6),
            skin: new BABYLON.Color3(0.85, 0.7, 0.55),
            jeans: new BABYLON.Color3(0.2, 0.2, 0.5),
            windowDiffuse: new BABYLON.Color3(0.6, 0.85, 1.0),
            windowEmissive: new BABYLON.Color3(0.15, 0.2, 0.3),
            door: new BABYLON.Color3(0.35, 0.2, 0.1),
            road: new BABYLON.Color3(0.25, 0.25, 0.28),
            roadMarking: new BABYLON.Color3(0.9, 0.9, 0.2),
            roadMarkingEmissive: new BABYLON.Color3(0.15, 0.15, 0.03),
            sidewalk: new BABYLON.Color3(0.65, 0.63, 0.6),
            water: new BABYLON.Color3(0.1, 0.35, 0.6)
        }
    };

    var sharedMaterials = {
        window: (function () {
            var m = new BABYLON.StandardMaterial("sharedWindowMat", scene);
            m.diffuseColor = CONFIG.colors.windowDiffuse;
            m.emissiveColor = CONFIG.colors.windowEmissive;
            m.alpha = 0.7;
            return m;
        })(),
        door: (function () {
            var m = new BABYLON.StandardMaterial("sharedDoorMat", scene);
            m.diffuseColor = CONFIG.colors.door;
            return m;
        })(),
        skin: (function () {
            var m = new BABYLON.StandardMaterial("sharedSkinMat", scene);
            m.diffuseColor = CONFIG.colors.skin;
            return m;
        })(),
        jeans: (function () {
            var m = new BABYLON.StandardMaterial("sharedJeansMat", scene);
            m.diffuseColor = CONFIG.colors.jeans;
            return m;
        })(),
        trunk: (function () {
            var m = new BABYLON.StandardMaterial("sharedTrunkMat", scene);
            m.diffuseColor = CONFIG.colors.trunk;
            return m;
        })(),
        leaves: (function () {
            var m = new BABYLON.StandardMaterial("sharedLeavesMat", scene);
            m.diffuseColor = CONFIG.colors.leaves;
            return m;
        })(),
        lampPole: (function () {
            var m = new BABYLON.StandardMaterial("sharedLampPoleMat", scene);
            m.diffuseColor = CONFIG.colors.lampPole;
            return m;
        })(),
        lampHead: (function () {
            var m = new BABYLON.StandardMaterial("sharedLampHeadMat", scene);
            m.diffuseColor = CONFIG.colors.lampGlow;
            m.emissiveColor = CONFIG.colors.lampEmissive;
            return m;
        })()
    };

    // ============================================================
    // HELPER FUNCTIONS
    // ============================================================
```

---

## Batch 2A — Building-Katalog + Factory (Sequential after Batch 1)

### Agent 2A: Building-Katalog einführen, createBuilding() auf CONFIG umstellen

**File(s)**: `20260813_spiel/babylon_demo.js`

**What to do**:
- Read `babylon_demo.js` first (nach Agent 1A-Änderungen)
- `createBuilding()` (~L62–134 original) refactoren: alle hardcodierten Werte durch CONFIG-Referenzen ersetzen, Shared Materials nutzen
- Building-Katalog als Daten-Array einführen, einzelne `createBuilding()`-Aufrufe (~L257–307) durch Loop ersetzen

#### What was working before
- 7 individuelle `createBuilding()`-Aufrufe mit je eigenen Farben/Dimensionen
- Jedes Gebäude erzeugt eigene Window/Door-Materialien
- `createBuilding()` nutzt hardcodierte Werte für Floor-Height, Window-Spacing etc.

#### How it stays working after
- Identische 7 Gebäude an identischen Positionen mit identischen Farben
- Shared Window/Door-Materialien → visuell identisch (gleiche Farben)
- Alle ehemals hardcodierten Werte aus CONFIG gelesen

#### Risks
- Loop-Index-Fehler → Gebäude fehlt oder doppelt
- CONFIG-Key-Typo → undefined-Werte

#### Safeguards
- [ ] Before/after comparison: 7 Gebäude zählen, Position/Farbe visuell vergleichen
- [ ] UI parity: Windows, Doors an allen Gebäuden prüfen

#### Exact Changes

**Ersetze `createBuilding()` Funktion (~L62–134 original):**

- BEFORE:
```javascript
    function createBuilding(name, x, z, width, depth, floors, wallColor, roofColor) {
        var height = floors * 3;
        // ... (entire function with hardcoded values)
    }
```

- AFTER:
```javascript
    function createBuilding(name, x, z, width, depth, floors, wallColor, roofColor) {
        var bc = CONFIG.building;
        var height = floors * bc.floorHeight;

        var body = BABYLON.MeshBuilder.CreateBox(
            name, { width: width, height: height, depth: depth }, scene
        );
        body.position = new BABYLON.Vector3(x, height / 2, z);
        var bodyMat = new BABYLON.StandardMaterial(name + "Mat", scene);
        bodyMat.diffuseColor = wallColor;
        body.material = bodyMat;
        shadowGen.addShadowCaster(body);
        body.receiveShadows = true;

        var roof = BABYLON.MeshBuilder.CreateBox(
            name + "Roof",
            { width: width + bc.roofOverhang, height: bc.roofThickness, depth: depth + bc.roofOverhang },
            scene
        );
        roof.position = new BABYLON.Vector3(x, height + bc.roofThickness / 2, z);
        var roofMat = new BABYLON.StandardMaterial(name + "RoofMat", scene);
        roofMat.diffuseColor = roofColor;
        roof.material = roofMat;
        shadowGen.addShadowCaster(roof);

        for (var floor = 0; floor < floors; floor++) {
            var windowY = floor * bc.floorHeight + 1.8;
            var windowCount = Math.floor(width / bc.window.perUnitWidth);
            var startX = -(windowCount - 1) * bc.window.halfSpacing;

            for (var w = 0; w < windowCount; w++) {
                var win = BABYLON.MeshBuilder.CreatePlane(
                    name + "Win_" + floor + "_" + w,
                    { width: bc.window.width, height: bc.window.height },
                    scene
                );
                win.position = new BABYLON.Vector3(
                    x + startX + w * bc.window.spacing, windowY, z - depth / 2 - 0.01
                );
                win.material = sharedMaterials.window;

                var winBack = win.clone(name + "WinBack_" + floor + "_" + w);
                winBack.position.z = z + depth / 2 + 0.01;
                winBack.rotation.y = Math.PI;
            }
        }

        var door = BABYLON.MeshBuilder.CreatePlane(
            name + "Door", { width: bc.door.width, height: bc.door.height }, scene
        );
        door.position = new BABYLON.Vector3(x, bc.door.height / 2, z - depth / 2 - 0.01);
        door.material = sharedMaterials.door;

        return body;
    }
```

**Ersetze die 7 individuellen createBuilding-Aufrufe (~L257–307 original) durch Katalog + Loop:**

- BEFORE:
```javascript
    // Wohnhaus (2 Stockwerke, warm)
    createBuilding(
        "house1", -20, -14, 8, 7, 2,
        new BABYLON.Color3(0.85, 0.75, 0.6),
        new BABYLON.Color3(0.6, 0.25, 0.2)
    );
    // ... 6 weitere einzelne Aufrufe ...
    createBuilding(
        "police", 18, 15, 10, 8, 2,
        new BABYLON.Color3(0.6, 0.62, 0.68),
        new BABYLON.Color3(0.2, 0.25, 0.4)
    );
```

- AFTER:
```javascript
    var BUILDING_CATALOG = [
        { name: "house1",     x: -20, z: -14, w:  8, d:  7, floors: 2, wall: [0.85, 0.75, 0.6],  roof: [0.6, 0.25, 0.2]  },
        { name: "apartment1", x:  -5, z: -16, w: 12, d: 10, floors: 4, wall: [0.7,  0.7,  0.72], roof: [0.4, 0.4,  0.42] },
        { name: "shop1",      x:  10, z: -13, w:  6, d:  5, floors: 1, wall: [0.9,  0.85, 0.7],  roof: [0.3, 0.5,  0.3]  },
        { name: "office1",    x:  22, z: -16, w: 10, d:  9, floors: 3, wall: [0.55, 0.6,  0.7],  roof: [0.3, 0.35, 0.4]  },
        { name: "casino",     x: -18, z:  15, w: 14, d: 10, floors: 2, wall: [0.8,  0.2,  0.25], roof: [0.9, 0.8,  0.2]  },
        { name: "motel",      x:   0, z:  14, w: 16, d:  7, floors: 2, wall: [0.75, 0.65, 0.5],  roof: [0.5, 0.3,  0.2]  },
        { name: "police",     x:  18, z:  15, w: 10, d:  8, floors: 2, wall: [0.6,  0.62, 0.68], roof: [0.2, 0.25, 0.4]  }
    ];

    BUILDING_CATALOG.forEach(function (b) {
        createBuilding(
            b.name, b.x, b.z, b.w, b.d, b.floors,
            new BABYLON.Color3(b.wall[0], b.wall[1], b.wall[2]),
            new BABYLON.Color3(b.roof[0], b.roof[1], b.roof[2])
        );
    });
```

#### Verification
- [ ] Typecheck / lint
- [ ] 7 Gebäude visuell identisch
- [ ] Windows und Doors an allen Gebäuden vorhanden
- [ ] Schatten von allen Gebäuden geworfen

---

## Batch 2B — Character, Tree, Lamp, Infrastruktur (Sequential after 2A)

### Agent 2B: Alle übrigen Factories auf CONFIG + Shared Materials + Kataloge umstellen

**File(s)**: `20260813_spiel/babylon_demo.js`

**What to do**:
- Read `babylon_demo.js` first (nach Agent 2A-Änderungen)
- `createTree()`, `createStreetLamp()`, `createCharacter()` auf CONFIG + sharedMaterials umstellen
- Positionen aus Daten-Arrays statt Einzelaufrufen
- Infrastruktur-Materialien (Road, Sidewalk, Water) über CONFIG.colors

#### What was working before
- 10 Bäume, 8 Laternen, 5 Characters an festen Positionen
- Road/Sidewalk/Water mit hardcodierten Farben

#### How it stays working after
- Identische Objekte an identischen Positionen
- Farben numerisch identisch (aus CONFIG)

#### Risks
- Shared Material auf Character-Body funktioniert nicht für shirtColor (jeder NPC hat eigene Farbe) — shirtColor-Material muss weiterhin pro Character erstellt werden
- Skin/Jeans können shared sein (alle gleich)

#### Safeguards
- [ ] Before/after comparison: 10 Bäume, 8 Laternen, 5 Characters zählen
- [ ] UI parity: Laternen leuchten, Bäume haben Kronen, Characters haben Köpfe/Beine

#### Exact Changes

**Ersetze `createTree()` (~L136–169 original):**

- BEFORE:
```javascript
    function createTree(x, z) {
        var trunk = BABYLON.MeshBuilder.CreateCylinder(
            "trunk_" + x + "_" + z,
            { height: 2, diameterTop: 0.3, diameterBottom: 0.5 },
            scene
        );
        // ... hardcoded values throughout ...
    }
```

- AFTER:
```javascript
    function createTree(x, z) {
        var tc = CONFIG.tree;

        var trunk = BABYLON.MeshBuilder.CreateCylinder(
            "trunk_" + x + "_" + z,
            { height: tc.trunk.height, diameterTop: tc.trunk.diameterTop, diameterBottom: tc.trunk.diameterBottom },
            scene
        );
        trunk.position = new BABYLON.Vector3(x, tc.trunkY, z);
        trunk.material = sharedMaterials.trunk;
        shadowGen.addShadowCaster(trunk);

        var leaves = BABYLON.MeshBuilder.CreateSphere(
            "leaves_" + x + "_" + z,
            { diameter: tc.crown.diameter, segments: tc.crown.segments },
            scene
        );
        leaves.position = new BABYLON.Vector3(x, tc.crownY, z);
        leaves.material = sharedMaterials.leaves;
        shadowGen.addShadowCaster(leaves);

        var leaves2 = BABYLON.MeshBuilder.CreateSphere(
            "leaves2_" + x + "_" + z,
            { diameter: tc.crownSecondary.diameter, segments: tc.crown.segments },
            scene
        );
        leaves2.position = new BABYLON.Vector3(
            x + tc.crownSecondary.offsetX,
            tc.crownY + tc.crownSecondary.offsetY,
            z + tc.crownSecondary.offsetZ
        );
        leaves2.material = sharedMaterials.leaves;
        shadowGen.addShadowCaster(leaves2);
    }
```

**Ersetze `createStreetLamp()` (~L171–205 original):**

- BEFORE:
```javascript
    function createStreetLamp(x, z) {
        // ... hardcoded values ...
    }
```

- AFTER:
```javascript
    function createStreetLamp(x, z) {
        var lc = CONFIG.streetLamp;

        var pole = BABYLON.MeshBuilder.CreateCylinder(
            "pole_" + x + "_" + z,
            { height: lc.pole.height, diameter: lc.pole.diameter },
            scene
        );
        pole.position = new BABYLON.Vector3(x, lc.poleY, z);
        pole.material = sharedMaterials.lampPole;
        shadowGen.addShadowCaster(pole);

        var lamp = BABYLON.MeshBuilder.CreateSphere(
            "lamp_" + x + "_" + z,
            { diameter: lc.head.diameter },
            scene
        );
        lamp.position = new BABYLON.Vector3(x, lc.headY, z);
        lamp.material = sharedMaterials.lampHead;

        var light = new BABYLON.PointLight(
            "lampLight_" + x + "_" + z,
            new BABYLON.Vector3(x, lc.lightY, z),
            scene
        );
        light.intensity = lc.light.intensity;
        light.diffuse = CONFIG.colors.lampLight;
        light.range = lc.light.range;
    }
```

**Ersetze `createCharacter()` (~L357–397 original):**

- BEFORE:
```javascript
    function createCharacter(x, z, shirtColor) {
        // ... hardcoded dimensions and materials per instance ...
    }
```

- AFTER:
```javascript
    function createCharacter(x, z, shirtColor) {
        var cc = CONFIG.character;

        var body = BABYLON.MeshBuilder.CreateCylinder(
            "body_" + x + "_" + z,
            { height: cc.body.height, diameterTop: cc.body.diameterTop, diameterBottom: cc.body.diameterBottom },
            scene
        );
        body.position = new BABYLON.Vector3(x, cc.bodyY, z);
        var bodyMat = new BABYLON.StandardMaterial("bodyMat_" + x + "_" + z, scene);
        bodyMat.diffuseColor = shirtColor;
        body.material = bodyMat;
        shadowGen.addShadowCaster(body);

        var head = BABYLON.MeshBuilder.CreateSphere(
            "head_" + x + "_" + z,
            { diameter: cc.head.diameter },
            scene
        );
        head.position = new BABYLON.Vector3(x, cc.headY, z);
        head.material = sharedMaterials.skin;
        shadowGen.addShadowCaster(head);

        for (var side = -1; side <= 1; side += 2) {
            var leg = BABYLON.MeshBuilder.CreateCylinder(
                "leg_" + x + "_" + z + "_" + side,
                { height: cc.leg.height, diameter: cc.leg.diameter },
                scene
            );
            leg.position = new BABYLON.Vector3(x + side * cc.leg.offsetX, cc.legY, z);
            leg.material = sharedMaterials.jeans;
            shadowGen.addShadowCaster(leg);
        }

        return body;
    }
```

**Ersetze Einzel-Aufrufe für Bäume (~L314–324), Laternen (~L327–335), Characters (~L400–406) durch Daten-Arrays:**

- BEFORE:
```javascript
    createTree(-30, -9);
    createTree(-15, -9);
    // ... 8 weitere ...

    createStreetLamp(-25, -6);
    // ... 7 weitere ...

    createCharacter(-12, -6.5, new BABYLON.Color3(0.8, 0.2, 0.2));
    // ... 4 weitere ...
```

- AFTER:
```javascript
    var TREE_POSITIONS = [
        [-30, -9], [-15, -9], [5, -9], [15, -9], [28, -9],
        [-25, 9], [-8, 9], [8, 9], [22, 9], [32, 9]
    ];
    TREE_POSITIONS.forEach(function (p) { createTree(p[0], p[1]); });

    var LAMP_POSITIONS = [
        [-25, -6], [-10, -6], [5, -6], [20, -6],
        [-17, 6], [0, 6], [15, 6], [30, 6]
    ];
    LAMP_POSITIONS.forEach(function (p) { createStreetLamp(p[0], p[1]); });

    var CHARACTER_CATALOG = [
        { x: -12, z: -6.5, shirt: [0.8, 0.2, 0.2] },
        { x:   3, z:  6.5, shirt: [0.2, 0.2, 0.8] },
        { x:  14, z: -6.5, shirt: [0.2, 0.7, 0.2] },
        { x:  -5, z:  6.5, shirt: [0.9, 0.9, 0.2] },
        { x:   0, z: -2,   shirt: [0.1, 0.1, 0.1] }
    ];
    CHARACTER_CATALOG.forEach(function (c) {
        createCharacter(c.x, c.z, new BABYLON.Color3(c.shirt[0], c.shirt[1], c.shirt[2]));
    });
```

**Ersetze Infrastruktur-Farben (~L218–220, ~L232–233, ~L245, ~L348–350) durch CONFIG.colors:**

- Road: `roadMat.diffuseColor = CONFIG.colors.road;`
- Marking: `markMat.diffuseColor = CONFIG.colors.roadMarking;` + `markMat.emissiveColor = CONFIG.colors.roadMarkingEmissive;`
- Sidewalk: `sidewalkMat.diffuseColor = CONFIG.colors.sidewalk;`
- Water: `waterMat.diffuseColor = CONFIG.colors.water;`

#### Verification
- [ ] Typecheck / lint
- [ ] 10 Bäume an korrekten Positionen
- [ ] 8 Laternen leuchten
- [ ] 5 Characters mit korrekten Shirt-Farben
- [ ] Road/Sidewalk/Water-Farben identisch
- [ ] Schatten von allen Objekten

---

## Verification Checklist (Post-Execution)

### 1. Compilation
Playground "Run" button muss fehlerfrei durchlaufen (keine Console-Errors).

### 2. Behavioral Parity

| Check | How to verify |
|---|---|
| 7 Gebäude sichtbar | Visuell zählen in Playground |
| 10 Bäume sichtbar | Visuell zählen |
| 8 Laternen leuchten | Kamera nah ran — Lichtquellen prüfen |
| 5 Characters auf Straße/Gehweg | Visuell zählen, Shirt-Farben prüfen |
| Schatten aller Objekte | Kamera-Winkel variieren |
| Post-Processing aktiv | Bloom auf Laternen sichtbar |
| Wasser transparent | Alpha-Effekt prüfen |

### 3. Smoke Test (Manual)
1. Code in Playground pasten, Run drücken — keine Errors
2. Kamera drehen — alle 4 Seiten der Gebäude haben Fenster
3. Reinzoomen auf Characters — Kopf, Body, Beine vorhanden
4. Rauszoomen — Gesamtszene mit Straße, Gebäuden beidseits, Wasser-Ecke
5. **SSOT-Test**: Einen Wert in CONFIG ändern (z.B. `character.head.diameter: 1.0`), Run — alle 5 Characters haben grösseren Kopf
6. **SSOT-Test**: `CONFIG.colors.leaves` ändern — alle 10 Bäume ändern Farbe
7. **SSOT-Test**: Ein Gebäude zu BUILDING_CATALOG hinzufügen — erscheint ohne Code-Änderung in Factories

---

## Files Touched (Complete List)

| Agent | Files | Lines Changed (Est.) |
|---|---|---|
| 1A | `20260813_spiel/babylon_demo.js` | +90 (CONFIG + sharedMaterials block) |
| 2A | `20260813_spiel/babylon_demo.js` | ~80 modified (createBuilding + catalog) |
| 2B | `20260813_spiel/babylon_demo.js` | ~100 modified (tree/lamp/char factories + catalogs + infra colors) |
| **Total** | 1 file | ~270 lines changed |

---

## What This Spec Does NOT Cover (Intentionally)

- **Texturen**: Keine Texturen hinzugefügt — das wäre eine Feature-Erweiterung, kein Refactoring
- **Neue Gebäudetypen**: Nur bestehende 7 Gebäude migriert
- **Animation-Refactoring**: Camera-Rotation (~L436–440) bleibt unverändert
- **Post-Processing-Config**: Pipeline-Einstellungen (~L412–430) bleiben hardcoded — könnten in Folge-Spec zentralisiert werden
- **Scene-Setup** (Kamera, Licht, Ground): Bereits sauber strukturiert, kein Refactoring nötig
- **Hauptspiel-Codebase** (`js/rendering/*.js`): Diese Spec betrifft nur die Babylon-Demo, nicht das bestehende Spiel
