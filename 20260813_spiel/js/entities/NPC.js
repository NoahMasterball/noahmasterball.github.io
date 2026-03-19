/**
 * NPC - Nicht-Spieler-Charakter-Entity.
 *
 * WICHTIG: Setzt NIEMALS this.x/this.y direkt (ausser Initialisierung im Constructor).
 * Alle Positionsaenderungen gehen durch EntityMover.move().
 *
 * Diese Klasse definiert nur Zustand und Logik-Daten.
 * Bewegung wird von MovementSystem / EntityMover gesteuert.
 */

import { Entity } from './Entity.js';
import { buildHumanoidParts } from './buildHumanoidParts.js';

/** Standard-Werte fuer den Movement-Tracker */
const TRACKER_DEFAULTS = {
    motionThreshold: 0.45,
    idleThreshold: 3500,
    sampleWindow: 4000,
    minDisplacement: 12,
    maxStuckSamples: 2,
    teleportCooldown: 4000,
};

export class NPC extends Entity {
    /**
     * @param {object} config - Konfiguration aus buildNPC-Daten
     * @param {Array<object>} config.waypoints - Pfad-Wegpunkte (mind. 2)
     * @param {object} [config.spawnPoint] - Optionaler fester Spawnpunkt
     * @param {boolean} [config.useBoundsSpawn=false] - Spawn in Bounds-Mitte
     * @param {object} [config.bounds] - Entity-spezifische Bewegungsgrenzen
     * @param {number} [config.speed=1.2]
     * @param {boolean} [config.stayOnSidewalks=true]
     * @param {boolean} [config.ignoreSidewalkObstacles=true]
     * @param {boolean} [config.hitboxDisabled=true]
     * @param {boolean} [config.fixedSpawn]
     * @param {object} [config.palette] - Farbpalette fuer NPC-Teile
     * @param {number} [config.maxHealth=100]
     * @param {number} [config.hitRadius=14]
     */
    constructor(config = {}) {
        const path = NPC._buildPath(config);

        if (path.length < 2) {
            throw new Error('NPC needs at least two waypoints to move.');
        }

        const spawnPoint = NPC._resolveSpawnPoint(config, path);
        const start = path[0];
        const initialX = spawnPoint ? spawnPoint.x : start.x;
        const initialY = spawnPoint ? spawnPoint.y : start.y;

        super({
            x: initialX,
            y: initialY,
            speed: config.speed ?? 1.2,
            health: config.maxHealth ?? 100,
        });

        // Pfad und Navigation
        this.path = path;
        this.waypointIndex = path.length > 1 ? 1 : 0;
        this.waitTimer = start.wait ?? 0;

        // Buergersteig-Verhalten
        this.stayOnSidewalks = config.stayOnSidewalks !== false;
        this.ignoreSidewalkObstacles = config.ignoreSidewalkObstacles !== false;
        this.hitboxDisabled = config.hitboxDisabled !== false;
        this.currentSidewalkSegment = null;

        // Dynamische Navigation (statt fester Wegpunkt-Schleife)
        this.dynamicNavigation = config.dynamicNavigation ?? false;
        this._lastNavDir = null;

        // Crosswalk-Zustand
        this.waitingForCrosswalk = start.crosswalkIndex ?? null;
        this.isCrossing = false;

        // Spawn
        this.fixedSpawn = (config.fixedSpawn != null)
            ? Boolean(config.fixedSpawn)
            : Boolean(spawnPoint);
        this.spawnPoint = spawnPoint
            ? { x: spawnPoint.x, y: spawnPoint.y }
            : null;

        // Gebaeude-Zustand
        const startBuildingId = start?.buildingId ?? null;
        const startInside = Boolean(start?.interior === true || start?.action === 'enter');
        const startHidden = startInside || Boolean(start?.hidden);
        this.insideBuilding = startInside ? (startBuildingId ?? true) : null;
        this.hidden = startHidden;
        this.lastBuildingId = startBuildingId;

        // Taschenlampe (zufaellig ~40% der NPCs)
        this.hasFlashlight = Math.random() < 0.4;

        // Zustand
        this.animationPhase = 0;
        this.panicTimer = 0;
        this.deathRotation = 0;
        this.hitRadius = config.hitRadius ?? 14;

        // Bounds
        this.bounds = config.bounds ?? null;

        // Visuelle Teile
        this.palette = config.palette ?? null;
        this.parts = buildHumanoidParts(config.palette ?? {});

        // Movement-Tracker (lazy-init via ensureMovementTracker)
        this.movementTracker = null;
    }

    // ---- Waypoint-Methoden ----

    /**
     * Gibt den aktuellen Ziel-Wegpunkt zurueck.
     * @returns {object|null}
     */
    getCurrentWaypoint() {
        return this.path[this.waypointIndex] ?? null;
    }

    /**
     * Setzt den Wegpunkt-Index auf den naechsten Punkt (zyklisch).
     */
    advanceWaypoint() {
        this.waypointIndex = (this.waypointIndex + 1) % this.path.length;
    }

    /**
     * Prueft ob der NPC nah genug am aktuellen Wegpunkt ist.
     * @param {number} [threshold=2] - Entfernung in Pixeln
     * @returns {boolean}
     */
    isAtWaypoint(threshold = 2) {
        const wp = this.getCurrentWaypoint();
        if (!wp) return false;
        const dx = this.x - wp.x;
        const dy = this.y - wp.y;
        return (dx * dx + dy * dy) <= threshold * threshold;
    }

    // ---- Zustandsabfragen ----

    /**
     * Gibt true zurueck wenn der NPC in Panik ist.
     * @returns {boolean}
     */
    isPanicking() {
        return this.panicTimer > 0;
    }

    /**
     * Gibt true zurueck wenn der NPC wartet (idle).
     * @returns {boolean}
     */
    isIdle() {
        return this.waitTimer > 0 && !this.moving;
    }

    // ---- Movement-Tracker ----

    /**
     * Stellt sicher, dass der movementTracker initialisiert ist.
     * Portiert von ensureNpcMovementTracker() aus dem alten Code.
     *
     * @param {number} [timestamp] - Aktueller Zeitstempel
     * @returns {object} Der movementTracker
     */
    ensureMovementTracker(timestamp) {
        const time = Number.isFinite(timestamp)
            ? timestamp
            : (typeof performance !== 'undefined' && performance.now
                ? performance.now()
                : Date.now());

        if (!this.movementTracker) {
            this.movementTracker = {
                samplePosition: { x: this.x, y: this.y },
                sampleTime: time,
                lastUpdateTime: time,
                idleTime: 0,
                stuckSamples: 0,
                lastTeleportAt: -Infinity,
                ...TRACKER_DEFAULTS,
            };
        } else {
            // Sicherstellen dass alle Felder vorhanden sind (Migrationssicherheit)
            const t = this.movementTracker;
            for (const [key, val] of Object.entries(TRACKER_DEFAULTS)) {
                if (typeof t[key] !== 'number') {
                    t[key] = val;
                }
            }
            if (typeof t.stuckSamples !== 'number') t.stuckSamples = 0;
            if (typeof t.lastTeleportAt !== 'number') t.lastTeleportAt = -Infinity;
        }

        return this.movementTracker;
    }

    // ---- Statische Hilfsmethoden ----

    /**
     * Baut den Pfad aus der Konfiguration.
     * @param {object} config
     * @returns {Array<object>}
     * @private
     */
    static _buildPath(config) {
        return (config.waypoints ?? []).map((wp) => ({ ...wp }));
    }

    /**
     * Ermittelt den Spawnpunkt aus der Konfiguration.
     * @param {object} config
     * @param {Array<object>} path - bereits aufgebauter Pfad
     * @returns {object|null}
     * @private
     */
    static _resolveSpawnPoint(config, path) {
        const hasFiniteNumber = (value) =>
            value !== null && value !== undefined && Number.isFinite(Number(value));

        let spawnPoint = null;

        if (config.spawnPoint
            && hasFiniteNumber(config.spawnPoint.x)
            && hasFiniteNumber(config.spawnPoint.y)) {
            const spawnX = Number(config.spawnPoint.x);
            const spawnY = Number(config.spawnPoint.y);
            spawnPoint = {
                x: spawnX,
                y: spawnY,
                wait: hasFiniteNumber(config.spawnPoint.wait)
                    ? Number(config.spawnPoint.wait) : null,
                allowOffSidewalk: config.spawnPoint.allowOffSidewalk !== false,
            };
        } else if (config.useBoundsSpawn === true && config.bounds) {
            const left = Number(config.bounds.left);
            const right = Number(config.bounds.right);
            const top = Number(config.bounds.top);
            const bottom = Number(config.bounds.bottom);
            if (hasFiniteNumber(left) && hasFiniteNumber(right)
                && hasFiniteNumber(top) && hasFiniteNumber(bottom)) {
                spawnPoint = {
                    x: (left + right) / 2,
                    y: (top + bottom) / 2,
                    wait: null,
                    allowOffSidewalk: true,
                };
            }
        }

        // Spawnpunkt in Pfad einarbeiten
        if (spawnPoint) {
            if (path.length === 0) {
                path.push({
                    x: spawnPoint.x,
                    y: spawnPoint.y,
                    wait: spawnPoint.wait ?? 0,
                    allowOffSidewalk: spawnPoint.allowOffSidewalk,
                });
            } else {
                path[0].x = spawnPoint.x;
                path[0].y = spawnPoint.y;
                if (spawnPoint.wait != null) {
                    path[0].wait = spawnPoint.wait;
                }
                if (spawnPoint.allowOffSidewalk) {
                    path[0].allowOffSidewalk = true;
                }
            }
        }

        return spawnPoint;
    }

    /**
     * Delegiert an die gemeinsame buildHumanoidParts-Funktion (SSOT).
     * @param {object} palette
     * @returns {Array<object>}
     */
    static buildParts(palette) {
        return buildHumanoidParts(palette);
    }
}

export default NPC;
