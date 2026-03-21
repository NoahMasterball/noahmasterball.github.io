# Refactor 01 — Neue Dateien erstellen (5 Agents, ALLE PARALLEL)

**Date**: 2026-03-21
**Status**: Executed 2026-03-21
**Scope**: Nur neue Dateien erstellen + index.html anpassen. Keine bestehende JS-Datei wird geändert.
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

## Execution Plan

**1 Batch, 5 Sub-Agents, ALL PARALLEL.**

```
Batch 1 (5 Agents, Parallel — kein File-Overlap)
  ├─ Agent 1A: index.html         — Dual-Canvas + Import Map
  ├─ Agent 1B: ThreeRenderer.js   — NEU: Three.js Basis-Renderer
  ├─ Agent 1C: ThreeCameraSystem  — NEU: 3D-Kamera
  ├─ Agent 1D: ThreeWorldRenderer — NEU: Welt in 3D
  └─ Agent 1E: ThreeCoords.js     — NEU: SSOT Koordinaten-Mapping
```

---

## Batch 1 — Alles parallel (5 Agents)

### Agent 1A: Dual-Canvas + Import Map in index.html

**File(s)**: `20260813_spiel/index.html`

**What to do**:
- Read `index.html` first
- Three.js Import Map vor dem `bundle.js` Script-Tag einfügen
- Zweiten Canvas (`#hudCanvas`) für 2D-HUD-Overlay hinzufügen
- CSS: beide Canvases absolut positioniert, `#hudCanvas` mit `z-index: 2` und `pointer-events: none`
- `bundle.js` Script-Tag auf `type="module"` umstellen

#### What was working before
- Einzelner Canvas `#gameCanvas` für alles (Welt + HUD)
- Script als classic `<script src="bundle.js">`

#### How it stays working after
- `#gameCanvas` existiert weiterhin — wird WebGL-Canvas
- `#hudCanvas` transparent darüber — für HUD
- Error-Panels, UI-Overlays (`#buildingInteraction`) unverändert (höherer z-index)

#### Risks
- Import Map Browser-Support (Chrome 89+, Firefox 108+, Safari 16.4+)

#### Safeguards
- [ ] Seite lädt ohne Console-Errors
- [ ] Beide Canvases im DOM
- [ ] UI-Overlays klickbar

#### Exact Changes

**CSS anpassen** — ~Zeile 24-36:

- BEFORE:
```css
        #gameContainer {
            position: relative;
            width: 100vw;
            height: 100vh;
            background: #222;
        }

        #gameCanvas {
            display: block;
            width: 100vw;
            height: 100vh;
            background: transparent;
        }
```
- AFTER:
```css
        #gameContainer {
            position: relative;
            width: 100vw;
            height: 100vh;
            background: #000;
        }

        #gameCanvas {
            position: absolute;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            z-index: 1;
        }

        #hudCanvas {
            position: absolute;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            z-index: 2;
            pointer-events: none;
        }
```

**Zweiten Canvas einfügen** — ~Zeile 109-110:

- BEFORE:
```html
    <div id="gameContainer">
        <canvas id="gameCanvas"></canvas>
```
- AFTER:
```html
    <div id="gameContainer">
        <canvas id="gameCanvas"></canvas>
        <canvas id="hudCanvas"></canvas>
```

**Import Map + Module-Script** — ~Zeile 187:

- BEFORE:
```html
    <script src="bundle.js"></script>
```
- AFTER:
```html
    <script type="importmap">
    {
        "imports": {
            "three": "https://cdn.jsdelivr.net/npm/three@0.170/build/three.module.js"
        }
    }
    </script>
    <script type="module" src="bundle.js"></script>
```

#### Verification
- [ ] Seite lädt ohne Fehler
- [ ] Beide Canvases sichtbar (DevTools)
- [ ] `#buildingInteraction` weiterhin klickbar

---

### Agent 1B: ThreeRenderer.js — Neuer Three.js Basis-Renderer

**File(s)**: `20260813_spiel/js/rendering/ThreeRenderer.js` (NEU)

**What to do**:
- Read `js/rendering/Renderer.js` first (Interface verstehen, 66 Zeilen)
- Neue Datei erstellen
- Three.js Scene, WebGLRenderer, Lighting-Setup
- Referenz auf HUD-Canvas halten
- Kompatible API: `clear()`, `resizeCanvas()`, `getScene()`, `render()`

#### What was working before
- `Renderer.js`: Wrapper um Canvas 2D — `constructor(canvas)`, `clear()`, `save()`, `restore()`, `translate()`, `getContext()`, `resizeCanvas()`

#### How it stays working after
- `Renderer.js` bleibt komplett unverändert
- `ThreeRenderer.js` ist eine zusätzliche neue Datei

#### Risks
- WebGL context creation könnte fehlschlagen

#### Safeguards
- [ ] `Renderer.js` unverändert (diff check)
- [ ] ThreeRenderer erstellt Scene + WebGLRenderer ohne Fehler

#### Exact Changes

Neue Datei `js/rendering/ThreeRenderer.js`:

```javascript
import * as THREE from 'three';

export class ThreeRenderer {

    constructor(webglCanvas, hudCanvas) {
        // WebGL-Renderer
        this.webglRenderer = new THREE.WebGLRenderer({
            canvas: webglCanvas,
            antialias: true,
        });
        this.webglRenderer.setPixelRatio(window.devicePixelRatio);
        this.webglRenderer.setClearColor(0x87CEEB); // Himmelblau

        // 3D-Szene
        this.scene = new THREE.Scene();

        // Basis-Beleuchtung
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(this.ambientLight);

        this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        this.directionalLight.position.set(500, 1000, -500);
        this.scene.add(this.directionalLight);

        // Kamera (wird extern gesetzt)
        this.camera = null;

        // HUD-Canvas Referenz
        this.hudCanvas = hudCanvas;
        this.hudCtx = hudCanvas ? hudCanvas.getContext('2d') : null;

        // Dimensionen
        this.canvas = webglCanvas;
        this.width = 0;
        this.height = 0;

        this.resizeCanvas();
    }

    getScene() { return this.scene; }
    getCamera() { return this.camera; }

    setCamera(camera) { this.camera = camera; }

    /** Löscht den HUD-Canvas (WebGL wird automatisch bei render() gelöscht). */
    clear() {
        if (this.hudCtx) {
            this.hudCtx.clearRect(0, 0, this.width, this.height);
        }
    }

    /** Rendert die 3D-Szene. */
    render() {
        if (this.camera) {
            this.webglRenderer.render(this.scene, this.camera);
        }
    }

    resizeCanvas() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.webglRenderer.setSize(this.width, this.height);
        if (this.hudCanvas) {
            this.hudCanvas.width = this.width;
            this.hudCanvas.height = this.height;
        }
    }
}
```

#### Verification
- [ ] Import funktioniert ohne Fehler
- [ ] `new ThreeRenderer(canvas, hudCanvas)` erstellt Scene

---

### Agent 1C: ThreeCameraSystem.js — Neue 3D-Kamera

**File(s)**: `20260813_spiel/js/systems/ThreeCameraSystem.js` (NEU)

**What to do**:
- Read `js/systems/CameraSystem.js` first (67 Zeilen)
- Neue Datei erstellen
- Wraps `THREE.OrthographicCamera` mit **gleicher API** wie CameraSystem
- `update(targetEntity, worldBounds)` — identische Clamping-Logik
- `worldToScreen(wx, wy)` / `screenToWorld(sx, sy)` — identische Berechnung
- Koordinaten-Mapping: Game (x→rechts, y→runter) → Three.js (x→rechts, y→hoch, z→Betrachter)

#### What was working before
- `CameraSystem.js`:
  - `constructor(viewportWidth, viewportHeight, zoom)` — x, y, width, height, zoom
  - `update(targetEntity, worldBounds)` — zentriert + clampt (Zeile 27-40)
  - `worldToScreen(wx, wy)` → `{ sx, sy }` (Zeile 48-53)
  - `screenToWorld(sx, sy)` → `{ wx, wy }` (Zeile 61-66)
  - `oceanOverflow` Property

#### How it stays working after
- `CameraSystem.js` bleibt unverändert
- `ThreeCameraSystem` hat identische public API

#### Risks
- OrthographicCamera frustum muss exakt zum Viewport passen
- Zoom=2 muss konsistent sein

#### Safeguards
- [ ] `worldToScreen()` / `screenToWorld()` gleiche Werte wie CameraSystem
- [ ] Clamping an Weltgrenzen identisch

#### Exact Changes

Neue Datei `js/systems/ThreeCameraSystem.js`:

```javascript
import * as THREE from 'three';
import { gameToThree } from '../rendering/ThreeCoords.js';

export class ThreeCameraSystem {

    constructor(viewportWidth, viewportHeight, zoom = 1) {
        this.width = viewportWidth;
        this.height = viewportHeight;
        this.zoom = zoom;

        // 2D-Position (Spielkoordinaten — identisch mit CameraSystem)
        this.x = 0;
        this.y = 0;
        this.oceanOverflow = 0;

        // Three.js OrthographicCamera
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 5000);
        this.camera.position.set(0, 1000, 0);
        this.camera.lookAt(0, 0, 0);

        this._syncThreeCamera();
    }

    /** Identische Logik wie CameraSystem.update() (Zeile 27-40). */
    update(targetEntity, worldBounds) {
        const vw = this.width / this.zoom;
        const vh = this.height / this.zoom;

        this.x = targetEntity.x - vw / 2;
        this.y = targetEntity.y - vh / 2;

        const westLimit = -(this.oceanOverflow ?? 0);
        this.x = Math.max(westLimit, Math.min(this.x, worldBounds.width - vw));
        this.y = Math.max(0, Math.min(this.y, worldBounds.height - vh));

        this._syncThreeCamera();
    }

    /** Identisch mit CameraSystem.worldToScreen() (Zeile 48-53). */
    worldToScreen(wx, wy) {
        return {
            sx: (wx - this.x) * this.zoom,
            sy: (wy - this.y) * this.zoom
        };
    }

    /** Identisch mit CameraSystem.screenToWorld() (Zeile 61-66). */
    screenToWorld(sx, sy) {
        return {
            wx: sx / this.zoom + this.x,
            wy: sy / this.zoom + this.y
        };
    }

    getThreeCamera() {
        return this.camera;
    }

    _syncThreeCamera() {
        const vw = this.width / this.zoom;
        const vh = this.height / this.zoom;

        // Frustum = sichtbarer Weltbereich
        // Game x → Three x, Game y → Three -z
        this.camera.left = this.x;
        this.camera.right = this.x + vw;
        this.camera.top = -this.y;
        this.camera.bottom = -(this.y + vh);

        this.camera.position.set(this.x + vw / 2, 1000, -(this.y + vh / 2));
        this.camera.lookAt(this.x + vw / 2, 0, -(this.y + vh / 2));
        this.camera.updateProjectionMatrix();
    }
}
```

#### Verification
- [ ] `new ThreeCameraSystem(1920, 1080, 2)` ohne Fehler
- [ ] `update()` + `worldToScreen()` konsistent mit CameraSystem

---

### Agent 1D: ThreeWorldRenderer.js — Welt-Rendering in 3D

**File(s)**: `20260813_spiel/js/rendering/ThreeWorldRenderer.js` (NEU)

**What to do**:
- Read `js/rendering/WorldRenderer.js` first (865 Zeilen — Farben, Dimensionen verstehen)
- Read `js/world/RoadNetwork.js` Zeile 1-50 für Straßen-Layout-Datenstruktur
- Neue Datei erstellen
- Alle Meshes **einmalig** bei `buildWorld()` erstellen (nicht pro Frame)
- Y-Offsets gegen Z-Fighting: Gras=0, Straße=0.1, Gehweg=0.2, Details=0.3

#### What was working before
- `WorldRenderer.js`:
  - `drawGrass()` → grünes Rect, Farbe `#4a7c3f`
  - `drawOcean()` → blaues Rect, Farbe `#1a6b8a`, Klippe, OCEAN_WIDTH=600, CLIFF_WIDTH=12
  - `drawRoads()` → graue Rects, Farbe `#444444`
  - `drawSidewalks()` → hellere Rects, Farbe `#888888`
  - `drawStreetDetails()` → Bäume, Bänke, Laternen

#### How it stays working after
- `WorldRenderer.js` bleibt unverändert
- Neue Datei mit gleichen Farben und Dimensionen

#### Risks
- Straßen-Layout Datenstruktur (road.orientation, road.x/y/start/end) muss korrekt gelesen werden
- Z-Fighting bei übereinanderliegenden Planes

#### Safeguards
- [ ] Grasebene = WORLD_WIDTH x WORLD_HEIGHT, Farbe #4a7c3f
- [ ] Ozean links, OCEAN_WIDTH=600
- [ ] Alle Straßen gerendert
- [ ] Kein Z-Fighting

#### Exact Changes

Neue Datei `js/rendering/ThreeWorldRenderer.js`:

```javascript
import * as THREE from 'three';
import { gameToThree } from './ThreeCoords.js';

export class ThreeWorldRenderer {

    constructor(scene) {
        this.scene = scene;
        this.worldGroup = new THREE.Group();
        this.scene.add(this.worldGroup);
    }

    /** Einmalig aufrufen — erstellt alle statischen Welt-Meshes. */
    buildWorld(worldWidth, worldHeight, roadLayout, crosswalks, sidewalkWidth, roadWidth, roadHalfWidth, streetDetails) {
        this._buildGrass(worldWidth, worldHeight);
        this._buildOcean(worldHeight);
        this._buildRoads(roadLayout, roadWidth, roadHalfWidth);
        this._buildSidewalks(roadLayout, sidewalkWidth, roadHalfWidth);
        this._buildStreetDetails(streetDetails);
    }

    _buildGrass(w, h) {
        const geo = new THREE.PlaneGeometry(w, h);
        const mat = new THREE.MeshLambertMaterial({ color: 0x4a7c3f });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(w / 2, 0, -h / 2);
        this.worldGroup.add(mesh);
    }

    _buildOcean(worldHeight) {
        const OCEAN_W = 600;
        const geo = new THREE.PlaneGeometry(OCEAN_W, worldHeight);
        const mat = new THREE.MeshLambertMaterial({ color: 0x1a6b8a });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(-OCEAN_W / 2, -2, -worldHeight / 2);
        this.worldGroup.add(mesh);

        // Klippe
        const cliffGeo = new THREE.BoxGeometry(12, 4, worldHeight);
        const cliffMat = new THREE.MeshLambertMaterial({ color: 0x5a4a3a });
        const cliff = new THREE.Mesh(cliffGeo, cliffMat);
        cliff.position.set(-6, -1, -worldHeight / 2);
        this.worldGroup.add(cliff);
    }

    _buildRoads(roadLayout, roadWidth, roadHalfWidth) {
        const mat = new THREE.MeshLambertMaterial({ color: 0x444444 });

        for (const road of roadLayout) {
            let w, h, cx, cy;
            if (road.orientation === 'horizontal') {
                w = (road.end ?? 3600) - (road.start ?? 0);
                h = roadWidth;
                cx = (road.start ?? 0) + w / 2;
                cy = road.y ?? road.position ?? 0;
            } else {
                w = roadWidth;
                h = (road.end ?? 2800) - (road.start ?? 0);
                cx = road.x ?? road.position ?? 0;
                cy = (road.start ?? 0) + h / 2;
            }
            const geo = new THREE.PlaneGeometry(w, h);
            const mesh = new THREE.Mesh(geo, mat);
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.set(cx, 0.1, -cy);
            this.worldGroup.add(mesh);
        }
    }

    _buildSidewalks(roadLayout, sidewalkWidth, roadHalfWidth) {
        const mat = new THREE.MeshLambertMaterial({ color: 0x888888 });

        for (const road of roadLayout) {
            if (road.orientation === 'horizontal') {
                const len = (road.end ?? 3600) - (road.start ?? 0);
                const cx = (road.start ?? 0) + len / 2;
                const ry = road.y ?? road.position ?? 0;
                for (const side of [-1, 1]) {
                    const geo = new THREE.PlaneGeometry(len, sidewalkWidth);
                    const mesh = new THREE.Mesh(geo, mat);
                    mesh.rotation.x = -Math.PI / 2;
                    mesh.position.set(cx, 0.2, -(ry + side * (roadHalfWidth + sidewalkWidth / 2)));
                    this.worldGroup.add(mesh);
                }
            } else {
                const len = (road.end ?? 2800) - (road.start ?? 0);
                const cy = (road.start ?? 0) + len / 2;
                const rx = road.x ?? road.position ?? 0;
                for (const side of [-1, 1]) {
                    const geo = new THREE.PlaneGeometry(sidewalkWidth, len);
                    const mesh = new THREE.Mesh(geo, mat);
                    mesh.rotation.x = -Math.PI / 2;
                    mesh.position.set(rx + side * (roadHalfWidth + sidewalkWidth / 2), 0.2, -cy);
                    this.worldGroup.add(mesh);
                }
            }
        }
    }

    _buildStreetDetails(details) {
        if (!details) return;
        for (const d of details) {
            switch (d.type) {
                case 'tree':     this._buildTree(d); break;
                case 'bench':    this._buildBench(d); break;
                case 'lamppost': this._buildLamppost(d); break;
            }
        }
    }

    _buildTree(d) {
        const g = new THREE.Group();
        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(2, 3, 20, 8),
            new THREE.MeshLambertMaterial({ color: 0x5a3a1a })
        );
        trunk.position.y = 10;
        g.add(trunk);

        const crown = new THREE.Mesh(
            new THREE.SphereGeometry(10, 8, 8),
            new THREE.MeshLambertMaterial({ color: 0x2d5a1e })
        );
        crown.position.y = 24;
        g.add(crown);

        const pos = gameToThree(d.x, d.y);
        g.position.copy(pos);
        this.worldGroup.add(g);
    }

    _buildBench(d) {
        const mesh = new THREE.Mesh(
            new THREE.BoxGeometry(12, 4, 5),
            new THREE.MeshLambertMaterial({ color: 0x8B4513 })
        );
        const pos = gameToThree(d.x, d.y);
        mesh.position.set(pos.x, 2, pos.z);
        if (d.rotation) mesh.rotation.y = d.rotation;
        this.worldGroup.add(mesh);
    }

    _buildLamppost(d) {
        const g = new THREE.Group();
        const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(1, 1, 30, 6),
            new THREE.MeshLambertMaterial({ color: 0x666666 })
        );
        pole.position.y = 15;
        g.add(pole);

        const lamp = new THREE.Mesh(
            new THREE.SphereGeometry(3, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xffffaa })
        );
        lamp.position.y = 32;
        g.add(lamp);

        const pos = gameToThree(d.x, d.y);
        g.position.copy(pos);
        this.worldGroup.add(g);
    }
}
```

#### Verification
- [ ] Gras, Ozean, Straßen, Gehwege, Bäume sichtbar
- [ ] Farben stimmen mit WorldRenderer überein
- [ ] Kein Z-Fighting

---

### Agent 1E: ThreeCoords.js — SSOT Koordinaten-Mapping

**File(s)**: `20260813_spiel/js/rendering/ThreeCoords.js` (NEU)

**What to do**:
- Neue, minimale Datei erstellen
- SSOT-Funktion `gameToThree(gameX, gameY)` — einzige Stelle für Koordinaten-Mapping
- Wird von ThreeCameraSystem, ThreeWorldRenderer und allen künftigen Three*-Dateien importiert

#### What was working before
- Kein Koordinaten-Mapping nötig (alles Canvas 2D)

#### How it stays working after
- Kein bestehender Code geändert
- Neue Utility-Funktion für alle Three.js-Renderer

#### Risks
- Keine (neue Datei, kein Impact auf Bestehendes)

#### Safeguards
- [ ] `gameToThree(0, 0)` → `Vector3(0, 0, 0)`
- [ ] `gameToThree(100, 200)` → `Vector3(100, 0, -200)`

#### Exact Changes

Neue Datei `js/rendering/ThreeCoords.js`:

```javascript
import * as THREE from 'three';

/**
 * SSOT: Einzige Stelle für Koordinaten-Mapping Game → Three.js.
 *
 * Game-Koordinaten: x = rechts, y = runter (Canvas-Konvention)
 * Three.js:         x = rechts, y = hoch,  z = zum Betrachter
 *
 * Mapping: gameX → threeX,  gameY → -threeZ,  threeY = 0 (Bodenebene)
 */
export function gameToThree(gameX, gameY) {
    return new THREE.Vector3(gameX, 0, -gameY);
}

/**
 * Umkehrung: Three.js-Position zurück zu Game-Koordinaten.
 */
export function threeToGame(threePos) {
    return { x: threePos.x, y: -threePos.z };
}
```

#### Verification
- [ ] Import funktioniert
- [ ] Hin- und Rücktransformation konsistent

---

## Files Touched — Spec 01

| Agent | File | Typ | Lines (Est.) |
|-------|------|-----|-------------|
| 1A | `index.html` | Änderung | ~30 |
| 1B | `js/rendering/ThreeRenderer.js` | NEU | ~70 |
| 1C | `js/systems/ThreeCameraSystem.js` | NEU | ~85 |
| 1D | `js/rendering/ThreeWorldRenderer.js` | NEU | ~170 |
| 1E | `js/rendering/ThreeCoords.js` | NEU | ~20 |
| **Total** | **5 Dateien** | | **~375** |

---

## Verification Checklist Spec 01

### 1. Module laden
Seite öffnen — keine Console-Errors.

### 2. Visuelle Prüfung
Noch kein 3D sichtbar (Game.js nutzt noch alte Renderer). Aber:
- Beide Canvases im DOM
- Import Map vorhanden
- `import('three')` funktioniert in Console

---
---
