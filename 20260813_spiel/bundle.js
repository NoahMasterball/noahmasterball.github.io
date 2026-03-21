// Auto-generated bundle — 2026-03-21T11:58:56.000Z
(function() {
'use strict';




// ═══════════════════════════════════════════════════════
// js/core/MathUtils.js
// ═══════════════════════════════════════════════════════
/**
 * MathUtils - Mathematische Hilfsfunktionen fuer Physik, Kollision und Zufall.
 */

/**
 * Euklidische Distanz zwischen zwei Punkten.
 */
function distanceBetween(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Begrenzt einen Wert auf [min, max].
 */
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

/**
 * Lineare Interpolation zwischen a und b.
 */
function lerp(a, b, t) {
    return a + (b - a) * t;
}

/**
 * Prueft ob ein Punkt (px, py) in einem Rechteck (rx, ry, rw, rh) liegt.
 */
function pointInRect(px, py, rx, ry, rw, rh) {
    return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
}

/**
 * Prueft ob ein Kreis ein Rechteck schneidet.
 */
function circleIntersectsRect(cx, cy, cr, rx, ry, rw, rh) {
    const closestX = clamp(cx, rx, rx + rw);
    const closestY = clamp(cy, ry, ry + rh);
    const dx = cx - closestX;
    const dy = cy - closestY;
    return (dx * dx + dy * dy) <= (cr * cr);
}

/**
 * Berechnet die aufgeloeste Position eines Kreises nach Ueberlappung mit einem Rechteck.
 * Gibt {x, y} zurueck - die korrigierte Kreismitte.
 */
function resolveCircleRectOverlap(cx, cy, cr, rx, ry, rw, rh) {
    const closestX = clamp(cx, rx, rx + rw);
    const closestY = clamp(cy, ry, ry + rh);
    const dx = cx - closestX;
    const dy = cy - closestY;
    const distSq = dx * dx + dy * dy;

    if (distSq === 0) {
        // Kreismitte liegt im Rechteck - schiebe nach aussen
        const centerRX = rx + rw / 2;
        const centerRY = ry + rh / 2;
        const diffX = cx - centerRX;
        const diffY = cy - centerRY;
        if (Math.abs(diffX) > Math.abs(diffY)) {
            return { x: diffX >= 0 ? rx + rw + cr : rx - cr, y: cy };
        } else {
            return { x: cx, y: diffY >= 0 ? ry + rh + cr : ry - cr };
        }
    }

    const dist = Math.sqrt(distSq);
    if (dist >= cr) {
        return { x: cx, y: cy }; // Keine Ueberlappung
    }

    const overlap = cr - dist;
    const nx = dx / dist;
    const ny = dy / dist;
    return { x: cx + nx * overlap, y: cy + ny * overlap };
}

/**
 * Deterministische Pseudo-Zufallszahl aus 2D-Koordinaten (0..1).
 * Portiert aus dem alten Code (OverworldGame.prototype.pseudoRandom2D).
 */
function pseudoRandom2D(x, y) {
    const value = Math.sin(x * 127.1 + y * 311.7 + 13.7) * 43758.5453123;
    return value - Math.floor(value);
}




// ═══════════════════════════════════════════════════════
// js/core/EventBus.js
// ═══════════════════════════════════════════════════════
/**
 * EventBus - Zentraler Event-Mechanismus fuer lose Kopplung zwischen Modulen.
 */
class EventBus {
    constructor() {
        /** @type {Map<string, Set<Function>>} */
        this._listeners = new Map();
    }

    /**
     * Registriert einen Callback fuer ein Event.
     * @param {string} event
     * @param {Function} callback
     * @returns {this}
     */
    on(event, callback) {
        if (typeof callback !== 'function') return this;
        if (!this._listeners.has(event)) {
            this._listeners.set(event, new Set());
        }
        this._listeners.get(event).add(callback);
        return this;
    }

    /**
     * Entfernt einen Callback fuer ein Event.
     * @param {string} event
     * @param {Function} callback
     * @returns {this}
     */
    off(event, callback) {
        const set = this._listeners.get(event);
        if (set) {
            set.delete(callback);
            if (set.size === 0) {
                this._listeners.delete(event);
            }
        }
        return this;
    }

    /**
     * Feuert ein Event und ruft alle registrierten Callbacks auf.
     * @param {string} event
     * @param {*} data
     * @returns {this}
     */
    emit(event, data) {
        const set = this._listeners.get(event);
        if (set) {
            for (const cb of set) {
                try {
                    cb(data);
                } catch (err) {
                    console.error(`[EventBus] Error in listener for "${event}":`, err);
                }
            }
        }
        return this;
    }
}

/** Singleton-Instanz */
const eventBus = new EventBus();



// ═══════════════════════════════════════════════════════
// js/core/EntityMover.js
// ═══════════════════════════════════════════════════════
/**
 * EntityMover - SSOT (Single Source of Truth) fuer alle Entity-Bewegungen.
 *
 * KRITISCH: Dies ist die EINZIGE Stelle im gesamten Code, die entity.x/y setzen darf.
 * Alle Bewegungen muessen durch move() oder teleport() laufen.
 *
 * Pipeline: Kollision -> Sidewalk-Constraint -> Entity-Bounds -> World-Bounds -> entity.x/y setzen
 */

class EntityMover {
    /**
     * @param {Object|null} collisionSystem - System fuer Gebaeude-Kollision (muss .resolve(entity, x, y) haben)
     * @param {import('../world/RoadNetwork.js').RoadNetwork|null} roadNetwork - Strassennetz fuer Buergersteig-Constraints
     */
    constructor(collisionSystem, roadNetwork) {
        this.collisionSystem = collisionSystem || null;
        this.roadNetwork = roadNetwork || null;
        this.worldWidth = Infinity;
        this.worldHeight = Infinity;
    }

    /**
     * Bewegt eine Entity zur Zielposition durch die komplette Pipeline.
     * EINZIGE oeffentliche Methode fuer regulaere Bewegung.
     *
     * @param {Object} entity - Entity mit x, y und optionalen Properties:
     *   - stayOnSidewalks {boolean}       - ob Buergersteig-Constraint aktiv ist
     *   - currentSidewalkSegment {Object}  - letztes Segment (fuer Tracking)
     *   - bounds {{ left, right, top, bottom }} - optionale Entity-spezifische Bounds
     * @param {number} targetX - gewuenschte X-Position
     * @param {number} targetY - gewuenschte Y-Position
     * @param {Object} [options]
     * @param {boolean} [options.ignoreSidewalk=false] - Buergersteig-Constraint ignorieren
     * @param {boolean} [options.ignoreCollision=false] - Kollision ignorieren
     * @param {boolean} [options.ignoreWorldBounds=false] - World-Bounds ignorieren
     * @returns {{ x: number, y: number, moved: boolean }}
     */
    move(entity, targetX, targetY, options = {}) {
        let newX = targetX;
        let newY = targetY;

        // 1. Kollision mit Gebaeuden aufloesen
        if (this.collisionSystem && !options.ignoreCollision) {
            const resolved = this.collisionSystem.resolve(entity, newX, newY);
            newX = resolved.x;
            newY = resolved.y;
        }

        // 2. Buergersteig-Constraint (nur wenn entity.stayOnSidewalks)
        if (entity.stayOnSidewalks && !options.ignoreSidewalk && this.roadNetwork) {
            const sidewalk = this.roadNetwork.constrainToSidewalk(
                newX, newY, entity.currentSidewalkSegment
            );
            newX = sidewalk.x;
            newY = sidewalk.y;
            entity.currentSidewalkSegment = sidewalk.segment;
        }

        // 3. Entity-spezifische Bounds
        if (entity.bounds) {
            newX = Math.max(entity.bounds.left, Math.min(newX, entity.bounds.right));
            newY = Math.max(entity.bounds.top, Math.min(newY, entity.bounds.bottom));
        }

        // 4. World-Bounds
        if (!options.ignoreWorldBounds) {
            newX = Math.max(0, Math.min(newX, this.worldWidth));
            newY = Math.max(0, Math.min(newY, this.worldHeight));
        }

        // 5. Position setzen (EINZIGE STELLE!)
        const moved = newX !== entity.x || newY !== entity.y;
        entity.x = newX;
        entity.y = newY;

        return { x: newX, y: newY, moved };
    }

    /**
     * Teleportiert eine Entity direkt an eine Position.
     * Umgeht alle Constraints - nur fuer stuck-NPCs oder Spawn verwenden.
     *
     * @param {Object} entity
     * @param {number} x
     * @param {number} y
     */
    teleport(entity, x, y) {
        entity.x = x;
        entity.y = y;
    }

    /**
     * Setzt die Weltgrenzen.
     *
     * @param {number} width
     * @param {number} height
     */
    setWorldBounds(width, height) {
        this.worldWidth = width;
        this.worldHeight = height;
    }
}



// ═══════════════════════════════════════════════════════
// js/entities/Entity.js
// ═══════════════════════════════════════════════════════
/**
 * Entity - Basisklasse fuer alle Spielobjekte (Spieler, NPCs, Objekte).
 *
 * WICHTIG: Entity setzt x/y nicht direkt.
 * Bewegung und Positionsaenderungen werden ausschliesslich ueber EntityMover gesteuert.
 */

let _nextEntityId = 1;

class Entity {
    /**
     * @param {object} [options]
     * @param {number} [options.x=0]
     * @param {number} [options.y=0]
     * @param {number} [options.width=32]
     * @param {number} [options.height=32]
     * @param {number} [options.speed=2]
     * @param {number} [options.health=100]
     */
    constructor(options = {}) {
        this.id = _nextEntityId++;
        this.x = options.x ?? 0;
        this.y = options.y ?? 0;
        this.width = options.width ?? 32;
        this.height = options.height ?? 32;
        this.speed = options.speed ?? 2;
        this.moving = false;

        /** @type {{minX: number, minY: number, maxX: number, maxY: number} | null} */
        this.bounds = options.bounds ?? null;

        this.maxHealth = options.health ?? 100;
        this.health = this.maxHealth;
        this.dead = false;
        this.hidden = false;
    }

    /**
     * Gibt true zurueck wenn die Entity lebt (health > 0, nicht dead).
     */
    isAlive() {
        return !this.dead && this.health > 0;
    }

    /**
     * Setzt die Entity in den lebendigen Zustand zurueck.
     */
    revive() {
        this.dead = false;
        this.health = this.maxHealth;
        this.moving = false;
    }

    /**
     * Gibt die Bounding-Box als {x, y, width, height} zurueck.
     */
    getBounds() {
        return {
            x: this.x - this.width / 2,
            y: this.y - this.height / 2,
            width: this.width,
            height: this.height,
        };
    }

    /**
     * Gibt das Zentrum als {x, y} zurueck.
     */
    getCenter() {
        return { x: this.x, y: this.y };
    }

    /**
     * Berechnet die Distanz zu einer anderen Entity.
     * @param {Entity} other
     * @returns {number}
     */
    distanceTo(other) {
        const dx = this.x - other.x;
        const dy = this.y - other.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
}




// ═══════════════════════════════════════════════════════
// js/entities/buildHumanoidParts.js
// ═══════════════════════════════════════════════════════
/**
 * buildHumanoidParts - SSOT fuer die visuellen Koerperteile
 * aller humanoiden Entities (Spieler, NPCs).
 *
 * Wird von Player und NPC gemeinsam genutzt.
 *
 * @param {object} [palette={}]
 * @param {string} [palette.head]
 * @param {string} [palette.torso]
 * @param {string} [palette.limbs]
 * @param {string} [palette.accent]
 * @param {string} [palette.hair]
 * @param {string} [palette.eyes]
 * @param {string} [palette.pupil]
 * @returns {Array<object>}
 */
function buildHumanoidParts(palette = {}) {
    const headColor = palette.head ?? '#f2d6c1';
    const torsoColor = palette.torso ?? '#2b6777';
    const limbColor = palette.limbs ?? '#1b3a4b';
    const accentColor = palette.accent ?? '#f2f2f2';
    const hairColor = palette.hair ?? '#2b2118';
    const eyeColor = palette.eyes ?? '#ffffff';
    const pupilColor = palette.pupil ?? '#1b1b1b';

    return [
        { id: 'shadow', type: 'circle', radius: 10, offsetX: 0, offsetY: 12, color: 'rgba(0, 0, 0, 0.15)', damaged: false },
        { id: 'torso', type: 'rect', width: 14, height: 18, offsetX: -7, offsetY: -12, color: torsoColor, damaged: false },
        { id: 'leftArm', type: 'rect', width: 4, height: 16, offsetX: -11, offsetY: -10, color: limbColor, damaged: false },
        { id: 'rightArm', type: 'rect', width: 4, height: 16, offsetX: 7, offsetY: -10, color: limbColor, damaged: false },
        { id: 'leftLeg', type: 'rect', width: 4, height: 18, offsetX: -4, offsetY: 6, color: accentColor, damaged: false },
        { id: 'rightLeg', type: 'rect', width: 4, height: 18, offsetX: 0, offsetY: 6, color: accentColor, damaged: false },
        { id: 'hairBack', type: 'circle', radius: 8, offsetX: 0, offsetY: -24, color: hairColor, damaged: false },
        { id: 'head', type: 'circle', radius: 6, offsetX: 0, offsetY: -20, color: headColor, damaged: false },
        { id: 'hairFringe', type: 'rect', width: 16, height: 3, offsetX: -8, offsetY: -22, color: hairColor, damaged: false },
        { id: 'leftEye', type: 'circle', radius: 1.8, offsetX: -3, offsetY: -17, color: eyeColor, damaged: false },
        { id: 'rightEye', type: 'circle', radius: 1.8, offsetX: 3, offsetY: -17, color: eyeColor, damaged: false },
        { id: 'leftPupil', type: 'circle', radius: 0.9, offsetX: -3, offsetY: -17, color: pupilColor, damaged: false },
        { id: 'rightPupil', type: 'circle', radius: 0.9, offsetX: 3, offsetY: -17, color: pupilColor, damaged: false },
    ];
}



// ═══════════════════════════════════════════════════════
// js/entities/Player.js
// ═══════════════════════════════════════════════════════
/**
 * Player - Spieler-Entity.
 *
 * WICHTIG: Setzt NIEMALS this.x/this.y direkt (ausser Initialisierung im Constructor).
 * Alle Positionsaenderungen gehen durch EntityMover.move().
 */

/** Standard-Palette fuer den Spieler */
const DEFAULT_PLAYER_PALETTE = {
    head: '#f6d7c4',
    torso: '#1b4965',
    limbs: '#16324f',
    accent: '#5fa8d3',
    hair: '#2b2118',
    eyes: '#ffffff',
    pupil: '#1b1b1b',
};

class Player extends Entity {
    /**
     * @param {object} [options]
     * @param {number} [options.x=400]
     * @param {number} [options.y=300]
     * @param {number} [options.width=30]
     * @param {number} [options.height=30]
     * @param {number} [options.speed=1.5]
     * @param {number} [options.sprintMultiplier=2]
     * @param {object} [options.palette] - Farbpalette fuer Spieler-Teile
     * @param {number} [options.money=1500]
     * @param {number} [options.casinoCredits=0]
     * @param {string|null} [options.currentWeaponId=null]
     * @param {Set|null} [options.weaponInventory=null]
     * @param {Array|null} [options.weaponLoadout=null]
     * @param {Set|null} [options.ownedProperties=null]
     * @param {string|null} [options.homePropertyId=null]
     * @param {string|null} [options.rentedPropertyId=null]
     */
    constructor(options = {}) {
        super({
            x: options.x ?? 400,
            y: options.y ?? 300,
            width: options.width ?? 30,
            height: options.height ?? 30,
            speed: options.speed ?? 1.5,
            health: options.health ?? 100,
        });

        this.baseSpeed = this.speed;
        this.sprintMultiplier = options.sprintMultiplier ?? 2;

        this.animationPhase = 0;
        this.color = options.color ?? '#FF0000';

        // Waffen-Zustand
        this.currentWeaponId = options.currentWeaponId ?? null;
        this.weaponInventory = options.weaponInventory ?? new Set();
        this.weaponLoadout = options.weaponLoadout ?? [];

        // Taschenlampe
        this.flashlightOn = false;

        // Geld
        this.money = options.money ?? 1500;
        this.casinoCredits = options.casinoCredits ?? 0;

        // Immobilien-Besitz und Miete
        this.ownedProperties = options.ownedProperties ?? new Set();
        this.homePropertyId = options.homePropertyId ?? null;
        this.rentedPropertyId = options.rentedPropertyId ?? null;

        // Stamina (Sprint-Ausdauer)
        this.stamina = 1;          // 0-1, startet voll
        this.maxStaminaDuration = 5; // Sekunden Sprint
        this.staminaRegenDelay = 1;  // Sekunden bis Regen startet
        this.staminaRegenRate = 0.25; // pro Sekunde (4s fuer volle Regen)
        this._staminaCooldown = 0;   // Sekunden seit Sprint-Ende

        // Polizei-Effekte (Stun/Slow)
        this.stunTimer = 0;
        this.slowTimer = 0;

        // Visuelle Teile
        const palette = options.palette ?? DEFAULT_PLAYER_PALETTE;
        this.parts = buildHumanoidParts(palette);
    }

    /**
     * Prueft ob Sprint moeglich ist und aktualisiert Stamina.
     * SSOT fuer Sprint-Bedingung und Stamina-Verbrauch/-Regeneration.
     *
     * @param {boolean} wantsSprint - Shift gedrueckt?
     * @param {boolean} isMoving - Bewegt sich der Spieler?
     * @param {number} deltaTime - Vergangene Zeit in Sekunden
     * @returns {boolean} Ob tatsaechlich gesprintet wird
     */
    trySprintAndUpdateStamina(wantsSprint, isMoving, deltaTime) {
        const sprinting = wantsSprint && isMoving && this.stamina > 0;
        if (sprinting) {
            this.stamina = Math.max(0, this.stamina - deltaTime / this.maxStaminaDuration);
            this._staminaCooldown = 0;
        } else {
            this._staminaCooldown += deltaTime;
            if (this._staminaCooldown >= this.staminaRegenDelay) {
                this.stamina = Math.min(1, this.stamina + deltaTime * this.staminaRegenRate);
            }
        }
        return sprinting;
    }

    /**
     * Gibt das Zentrum des Spielers zurueck.
     * Beruecksichtigt die halbe Breite/Hoehe (Top-Down-Ansicht).
     * @returns {{ x: number, y: number }}
     */
    getCenter() {
        return {
            x: this.x + this.width / 2,
            y: this.y + this.height / 2,
        };
    }

    /**
     * Gibt die Muendungsposition fuer die aktuelle Waffe zurueck.
     * @returns {{ x: number, y: number }}
     */
    getMuzzlePosition() {
        const center = this.getCenter();
        return { x: center.x, y: center.y };
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




// ═══════════════════════════════════════════════════════
// js/entities/NPC.js
// ═══════════════════════════════════════════════════════
/**
 * NPC - Nicht-Spieler-Charakter-Entity.
 *
 * WICHTIG: Setzt NIEMALS this.x/this.y direkt (ausser Initialisierung im Constructor).
 * Alle Positionsaenderungen gehen durch EntityMover.move().
 *
 * Diese Klasse definiert nur Zustand und Logik-Daten.
 * Bewegung wird von MovementSystem / EntityMover gesteuert.
 */

/** Standard-Werte fuer den Movement-Tracker */
const TRACKER_DEFAULTS = {
    motionThreshold: 0.45,
    idleThreshold: 3500,
    sampleWindow: 4000,
    minDisplacement: 12,
    maxStuckSamples: 2,
    teleportCooldown: 4000,
};

class NPC extends Entity {
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




// ═══════════════════════════════════════════════════════
// js/entities/Vehicle.js
// ═══════════════════════════════════════════════════════
/**
 * Vehicle - Fahrzeug-Entity.
 *
 * WICHTIG: Setzt NIEMALS this.x/this.y direkt (ausser Initialisierung im Constructor).
 * Alle Positionsaenderungen gehen durch EntityMover.move().
 */

class Vehicle extends Entity {
    /**
     * @param {object} config
     * @param {Array<object>} config.path - Pfad-Wegpunkte (mind. 2)
     * @param {number} [config.width=96]
     * @param {number} [config.height=44]
     * @param {number} [config.speed=2.2]
     * @param {string} [config.baseColor='#555555']
     * @param {string} [config.accentColor='#888888']
     */
    constructor(config = {}) {
        const path = (config.path ?? []).map((wp) => ({ ...wp }));

        if (path.length < 2) {
            throw new Error('Vehicle needs at least two waypoints to move.');
        }

        const start = path[0];
        const width = config.width ?? 96;
        const height = config.height ?? 44;

        super({
            x: start.x,
            y: start.y,
            width,
            height,
            speed: config.speed ?? 2.2,
        });

        // Pfad und Navigation
        this.path = path;
        this.waypointIndex = path.length > 1 ? 1 : 0;
        this.waitTimer = start.wait ?? 0;
        this.stopTimer = 0;
        this.rotation = 0;

        // Farben
        this.baseColor = config.baseColor ?? '#555555';
        this.accentColor = config.accentColor ?? '#888888';

        // Yield-Verhalten (Vorfahrt gewaehren)
        this.yielding = false;
        this.yieldTimer = 0;

        // Visuelle Teile
        this.parts = Vehicle.buildParts({
            baseColor: this.baseColor,
            accentColor: this.accentColor,
            width: this.width,
            height: this.height,
        });
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
     * Prueft ob das Fahrzeug nah genug am aktuellen Wegpunkt ist.
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

    // ---- Statische Factory-Methoden ----

    /**
     * Baut die visuellen Fahrzeug-Teile.
     * Portiert von buildVehicleParts() aus dem alten Code.
     *
     * @param {object} config
     * @param {string} config.baseColor
     * @param {string} config.accentColor
     * @param {number} config.width
     * @param {number} config.height
     * @returns {Array<object>}
     */
    static buildParts(config) {
        const width = config.width;
        const height = config.height;
        const halfWidth = width / 2;
        const halfHeight = height / 2;
        const wheelRadius = Math.max(5, Math.floor(height * 0.24));

        const windowColor = 'rgba(132, 188, 226, 0.9)';
        const rearWindowColor = 'rgba(96, 140, 180, 0.85)';
        const trimColor = '#1f2a36';
        const lightFront = '#ffe8a3';
        const lightRear = '#ff6464';

        const parts = [];

        const addRect = (id, centerX, centerY, rectWidth, rectHeight, color, extra = {}) => {
            parts.push({
                id,
                type: 'rect',
                width: rectWidth,
                height: rectHeight,
                offsetX: centerX - rectWidth / 2,
                offsetY: centerY - rectHeight / 2,
                color,
                damaged: false,
                ...extra,
            });
        };

        const addCircle = (id, centerX, centerY, radius, color, extra = {}) => {
            parts.push({
                id,
                type: 'circle',
                radius,
                offsetX: centerX,
                offsetY: centerY,
                color,
                damaged: false,
                ...extra,
            });
        };

        // Chassis
        addRect('chassis', 0, 0, width, height, config.baseColor);

        // Streifen
        const stripeHeight = height * 0.22;
        addRect('stripe', 0, 0, width * 0.86, stripeHeight, config.accentColor);

        // Dach
        const roofWidth = width * 0.58;
        const roofHeight = height * 0.5;
        addRect('roof', 0, 0, roofWidth, roofHeight, config.accentColor);

        // Windschutzscheibe
        const windshieldWidth = width * 0.32;
        const windshieldHeight = height * 0.46;
        const windshieldCenterX = halfWidth - windshieldWidth * 0.6;
        addRect('windshield', windshieldCenterX, 0, windshieldWidth, windshieldHeight, windowColor);

        // Heckscheibe
        const rearGlassWidth = width * 0.3;
        const rearGlassHeight = height * 0.42;
        const rearGlassCenterX = -halfWidth + rearGlassWidth * 0.6;
        addRect('rearGlass', rearGlassCenterX, 0, rearGlassWidth, rearGlassHeight, rearWindowColor);

        // Stossstangen
        const bumperWidth = width * 0.08;
        const bumperHeight = height * 0.74;
        addRect('trimFront', halfWidth - bumperWidth / 2, 0, bumperWidth, bumperHeight, trimColor);
        addRect('trimRear', -halfWidth + bumperWidth / 2, 0, bumperWidth, bumperHeight, trimColor);

        // Lichter
        const lightWidth = width * 0.06;
        const lightHeight = height * 0.22;
        const lateralOffset = halfHeight - lightHeight * 0.6;
        const lightInset = width * 0.04 + bumperWidth;
        const frontLightCenterX = halfWidth - lightInset - lightWidth / 2;
        const rearLightCenterX = -frontLightCenterX;

        addRect('frontLightLeft', frontLightCenterX, -lateralOffset, lightWidth, lightHeight, lightFront);
        addRect('frontLightRight', frontLightCenterX, lateralOffset, lightWidth, lightHeight, lightFront);
        addRect('rearLightLeft', rearLightCenterX, -lateralOffset, lightWidth, lightHeight, lightRear);
        addRect('rearLightRight', rearLightCenterX, lateralOffset, lightWidth, lightHeight, lightRear);

        // Seitenpanele
        const sidePanelHeight = height * 0.12;
        const sidePanelOffsetY = halfHeight - sidePanelHeight / 2;
        addRect('sidePanelTop', 0, -sidePanelOffsetY, width * 0.78, sidePanelHeight, config.accentColor);
        addRect('sidePanelBottom', 0, sidePanelOffsetY, width * 0.78, sidePanelHeight, config.accentColor);

        // Raeder
        addCircle('wheelFrontLeft', halfWidth * 0.45, halfHeight - wheelRadius, wheelRadius, trimColor, { visible: false });
        addCircle('wheelFrontRight', halfWidth * 0.45, -halfHeight + wheelRadius, wheelRadius, trimColor, { visible: false });
        addCircle('wheelRearLeft', -halfWidth * 0.45, halfHeight - wheelRadius, wheelRadius, trimColor, { visible: false });
        addCircle('wheelRearRight', -halfWidth * 0.45, -halfHeight + wheelRadius, wheelRadius, trimColor, { visible: false });

        return parts;
    }
}




// ═══════════════════════════════════════════════════════
// js/data/WeaponCatalog.js
// ═══════════════════════════════════════════════════════
/**
 * WeaponCatalog - Zentrale Waffendefinitionen (reine Daten, keine Logik).
 * Portiert aus gta_old/overworld/js/overworld.js createWeaponCatalog() (Z.2553-2655)
 * und getWeaponDefinition() (Z.2535-2546).
 */

/**
 * Kanonische Waffenreihenfolge - SSOT fuer alle Module die Waffen sortieren.
 * @type {ReadonlyArray<string>}
 */
const WEAPON_ORDER = Object.freeze([
    'pistol',
    'smg',
    'assaultRifle',
    'shotgun',
    'sniperRifle',
    'lmg',
]);

/**
 * Erstellt den Waffenkatalog als Map.
 * @returns {Map<string, object>}
 */
function createWeaponCatalog() {
    const catalog = new Map();

    catalog.set('pistol', {
        id: 'pistol',
        name: '9mm Dienstpistole',
        damage: 24,
        fireRate: 420,
        projectileSpeed: 11,
        spread: 0.02,
        automatic: false,
        range: 660,
        displayColor: '#fca311',
        price: 250,
        shortLabel: '9mm',
    });

    catalog.set('smg', {
        id: 'smg',
        name: 'MP5 Maschinenpistole',
        damage: 26,
        fireRate: 120,
        projectileSpeed: 12,
        spread: 0.06,
        automatic: true,
        range: 640,
        displayColor: '#00f5d4',
        price: 650,
        shortLabel: 'MP5',
    });

    catalog.set('assaultRifle', {
        id: 'assaultRifle',
        name: 'AR-15 Sturmgewehr',
        damage: 48,
        fireRate: 180,
        projectileSpeed: 14,
        spread: 0.04,
        automatic: true,
        range: 860,
        displayColor: '#ef476f',
        price: 1400,
        shortLabel: 'AR-15',
    });

    catalog.set('shotgun', {
        id: 'shotgun',
        name: 'Pump-Action Schrotflinte',
        damage: 22,
        fireRate: 1900,
        projectileSpeed: 10,
        spread: 0.18,
        automatic: false,
        pellets: 6,
        range: 360,
        displayColor: '#7209b7',
        price: 900,
        shortLabel: 'Shotgun',
    });

    catalog.set('sniperRifle', {
        id: 'sniperRifle',
        name: 'AX-50 Scharfschuetzengewehr',
        damage: 160,
        fireRate: 1700,
        projectileSpeed: 18,
        spread: 0.004,
        automatic: false,
        range: 1400,
        displayColor: '#3f37c9',
        price: 3200,
        shortLabel: 'Sniper',
    });

    catalog.set('lmg', {
        id: 'lmg',
        name: 'M249 Leichtes MG',
        damage: 44,
        fireRate: 140,
        projectileSpeed: 13,
        spread: 0.07,
        automatic: true,
        range: 900,
        displayColor: '#06d6a0',
        price: 2600,
        shortLabel: 'M249',
    });

    return catalog;
}

/**
 * Gibt die Waffendefinition fuer eine ID zurueck.
 * @param {Map<string, object>} catalog - Der Waffenkatalog
 * @param {string} id - Waffen-ID
 * @returns {object|null}
 */
function getWeaponDefinition(catalog, id) {
    if (!id) {
        return null;
    }
    return catalog.get(id) ?? null;
}



// ═══════════════════════════════════════════════════════
// js/data/ColorPalettes.js
// ═══════════════════════════════════════════════════════
/**
 * ColorPalettes - Farbdefinitionen und Farb-Hilfsfunktionen.
 * Portiert aus dem alten OverworldGame-Code.
 */

/**
 * Feste Hausfarben (keine zufaelligen Farben).
 * Quelle: overworld.js Zeile ~140
 */
const houseColors = [
    "#DEB887", "#F5DEB3", "#D2B48C", "#BC8F8F", "#CD853F",
    "#D2691E", "#A0522D", "#8B7355", "#D2B48C", "#F4A460",
];

/**
 * Interpoliert zwischen Color-Stops anhand eines Wertes (0..1).
 * Jeder Stop hat die Form { at: number, color: [r, g, b, a] }.
 *
 * @param {Array<{at: number, color: number[]}>} stops
 * @param {number} value - Wert zwischen 0 und 1
 * @returns {number[]} [r, g, b, a]
 */
function sampleColorStops(stops, value) {
    if (!Array.isArray(stops) || stops.length === 0) {
        return [0, 0, 0, 0];
    }

    const t = Math.max(0, Math.min(1, Number(value) || 0));

    let previous = stops[0];

    for (let i = 1; i < stops.length; i++) {
        const current = stops[i];
        const prevAt = Number(previous?.at ?? 0);
        const currAt = Number(current?.at ?? 1);

        if (t <= currAt) {
            const range = Math.max(1e-6, currAt - prevAt);
            const localT = Math.max(0, Math.min(1, (t - prevAt) / range));
            return lerpColor(previous?.color, current?.color, localT);
        }

        previous = current;
    }

    const lastColor = stops[stops.length - 1]?.color;
    return Array.isArray(lastColor) ? lastColor.slice() : [0, 0, 0, 0];
}

/**
 * Interpoliert linear zwischen zwei RGBA-Farbarrays.
 *
 * @param {number[]} colorA - [r, g, b, a]
 * @param {number[]} colorB - [r, g, b, a]
 * @param {number} t - Interpolationsfaktor (0..1)
 * @returns {number[]} [r, g, b, a]
 */
function lerpColor(colorA, colorB, t) {
    const clampT = Math.max(0, Math.min(1, Number(t) || 0));

    const getComponent = (arr, index) => {
        if (!Array.isArray(arr) || arr.length === 0) {
            return index === 3 ? 1 : 0;
        }
        if (index < arr.length) {
            return Number(arr[index]);
        }
        if (index === 3) {
            return arr.length > 3 ? Number(arr[3]) : 1;
        }
        return Number(arr[Math.min(index, arr.length - 1)]);
    };

    const result = [];
    for (let i = 0; i < 4; i++) {
        const compA = getComponent(colorA, i);
        const compB = getComponent(colorB, i);
        result[i] = compA + (compB - compA) * clampT;
    }

    return result;
}

/**
 * Konvertiert ein RGBA-Farbarray in einen CSS rgba()-String.
 *
 * @param {number[]} color - [r, g, b, a]
 * @param {number} [alphaMultiplier=1]
 * @returns {string}
 */
function colorArrayToRgba(color, alphaMultiplier = 1) {
    if (!Array.isArray(color) || color.length === 0) {
        return 'rgba(0, 0, 0, 0)';
    }

    const r = Math.round(Math.max(0, Math.min(255, Number(color[0]) || 0)));
    const g = Math.round(Math.max(0, Math.min(255, Number(color[1] ?? color[0]) || 0)));
    const b = Math.round(Math.max(0, Math.min(255, Number(color[2] ?? color[1] ?? color[0]) || 0)));
    const aBase = color.length > 3 ? Number(color[3]) : 1;
    const a = Math.max(0, Math.min(1, aBase * alphaMultiplier));

    return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
}


// ═══════════════════════════════════════════════════════
// js/data/HouseStyles.js
// ═══════════════════════════════════════════════════════
/**
 * HouseStyles - Vordefinierte Hausstile fuer die Stadtgebaeude.
 * Portiert aus OverworldGame.prototype.createHouseStyles (overworld.js Zeile ~11636).
 */

/**
 * Gibt ein Array vordefinierter Hausstile zurueck.
 * Jeder Stil enthaelt Farben, Dachtyp und Stockwerke.
 *
 * @returns {Array<{base: string, accent: string, roof: string, highlight: string, balcony: string, metallic: string, roofGarden: boolean, floors: number}>}
 */
function createHouseStyles() {
    return [
        {
            base: "#c37e61",
            accent: "#f7e3c4",
            roof: "#3a3a3a",
            highlight: "#fcd9a9",
            balcony: "#d97757",
            metallic: "#6f8fa6",
            roofGarden: true,
            floors: 6,
        },
        {
            base: "#d4d0c5",
            accent: "#faf6ec",
            roof: "#494949",
            highlight: "#ffe4ba",
            balcony: "#9fb4c7",
            metallic: "#6d7c8e",
            roofGarden: false,
            floors: 5,
        },
        {
            base: "#8e9faa",
            accent: "#e4eef5",
            roof: "#2d3a4a",
            highlight: "#abd1ff",
            balcony: "#5f7ba6",
            metallic: "#95c4d8",
            roofGarden: true,
            floors: 7,
        },
        {
            base: "#c9a46c",
            accent: "#f0e0c6",
            roof: "#473a2f",
            highlight: "#f6d7b0",
            balcony: "#a7794f",
            metallic: "#8c9aa6",
            roofGarden: false,
            floors: 4,
        },
        {
            base: "#8898aa",
            accent: "#dde7f0",
            roof: "#2f3b4a",
            highlight: "#b7d2f5",
            balcony: "#5b6f87",
            metallic: "#9fb7c9",
            roofGarden: true,
            floors: 8,
        },
        {
            base: "#bda17a",
            accent: "#f3e5c7",
            roof: "#3f3223",
            highlight: "#f9d9a6",
            balcony: "#a87d53",
            metallic: "#7f8c99",
            roofGarden: false,
            floors: 5,
        },
    ];
}


// ═══════════════════════════════════════════════════════
// js/data/Persistence.js
// ═══════════════════════════════════════════════════════
/**
 * Persistence - Alle localStorage-Operationen als reine Funktionen.
 * SSOT fuer Speichern/Laden von Spielstand-Daten.
 *
 * Portiert aus gta_old/overworld/js/overworld.js:
 *   loadWeaponInventory()      (Z.2789-2817)
 *   persistWeaponInventory()   (Z.2819-2830)
 *   loadWeaponLoadout()        (Z.2832-2890)
 *   persistWeaponLoadout()     (Z.2892-2905)
 *   loadCurrentWeaponId()      (Z.2907-2929)
 *   persistCurrentWeaponId()   (Z.2931-2945)
 *   loadCasinoCredits()        (Z.2657-2679)
 *   storeCasinoCredits()       (Z.2681-2694)
 *   loadPlayerMoney()          (neu, war im Originalcode nicht persistiert)
 *   persistPlayerMoney()       (neu)
 */

// ───────────────────── Hilfsfunktionen ─────────────────────

/** @returns {boolean} true wenn localStorage verfuegbar */
function hasStorage() {
    return typeof window !== 'undefined' && !!window.localStorage;
}

/**
 * Sicheres Lesen aus localStorage.
 * @param {string} key
 * @returns {string|null}
 */
function readItem(key) {
    if (!hasStorage()) return null;
    try {
        return window.localStorage.getItem(key);
    } catch (err) {
        console.warn(`[Persistence] Lesen von "${key}" fehlgeschlagen:`, err);
        return null;
    }
}

/**
 * Sicheres Schreiben in localStorage.
 * @param {string} key
 * @param {string} value
 */
function writeItem(key, value) {
    if (!hasStorage()) return;
    try {
        window.localStorage.setItem(key, value);
    } catch (err) {
        console.warn(`[Persistence] Schreiben von "${key}" fehlgeschlagen:`, err);
    }
}

/**
 * Sicheres Entfernen aus localStorage.
 * @param {string} key
 */
function removeItem(key) {
    if (!hasStorage()) return;
    try {
        window.localStorage.removeItem(key);
    } catch (err) {
        console.warn(`[Persistence] Loeschen von "${key}" fehlgeschlagen:`, err);
    }
}

// ───────────────────── Spieler-Position (Rueckkehr aus Gebaeude) ────

const KEY_RETURN_POSITION = 'overworldReturnPosition';

/**
 * Speichert die Spielerposition und Kamera fuer die Rueckkehr aus einem Gebaeude.
 * @param {number} px - Spieler X
 * @param {number} py - Spieler Y
 * @param {number} cx - Kamera X
 * @param {number} cy - Kamera Y
 */
function saveReturnPosition(px, py, cx, cy) {
    writeItem(KEY_RETURN_POSITION, JSON.stringify({ px, py, cx, cy }));
}

/**
 * Laedt und entfernt die gespeicherte Rueckkehr-Position.
 * @returns {{ px: number, py: number, cx: number, cy: number }|null}
 */
function loadReturnPosition() {
    const raw = readItem(KEY_RETURN_POSITION);
    if (!raw) return null;
    removeItem(KEY_RETURN_POSITION);
    try {
        const data = JSON.parse(raw);
        if (Number.isFinite(data.px) && Number.isFinite(data.py)) {
            return data;
        }
    } catch (err) { /* ignorieren */ }
    return null;
}

// ───────────────────── Waffen-Inventar ─────────────────────

const KEY_WEAPON_INVENTORY = 'overworldWeaponInventory';

/**
 * Laedt das Waffeninventar aus localStorage.
 * Spieler startet ohne Waffen - Waffen muessen im Shop gekauft werden.
 *
 * @returns {Set<string>} Besessene Waffen-IDs
 */
function loadWeaponInventory() {
    const validIds = new Set(WEAPON_ORDER);
    const owned = new Set();

    const raw = readItem(KEY_WEAPON_INVENTORY);
    if (raw) {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                for (const id of parsed) {
                    if (typeof id === 'string' && validIds.has(id)) {
                        owned.add(id);
                    }
                }
            }
        } catch (error) {
            console.warn('Waffeninventar konnte nicht geladen werden', error);
        }
    }

    return owned;
}

/**
 * Speichert das Waffeninventar in localStorage.
 * @param {Set<string>} weaponInventory
 */
function persistWeaponInventory(weaponInventory) {
    const owned = Array.from(weaponInventory).filter((id) => WEAPON_ORDER.includes(id));
    writeItem(KEY_WEAPON_INVENTORY, JSON.stringify(owned));
}

// ───────────────────── Waffen-Loadout ─────────────────────

const KEY_WEAPON_LOADOUT = 'overworldWeaponLoadout';
const MAX_LOADOUT_SLOTS = 3;

/**
 * Laedt das Waffen-Loadout (bis zu 3 Slots) aus localStorage.
 * Gibt leeres Array zurueck wenn keine Waffen im Besitz.
 *
 * @param {Set<string>} weaponInventory - Aktuelle besessene Waffen
 * @returns {Array<string>} Loadout-Slot-IDs
 */
function loadWeaponLoadout(weaponInventory) {
    const fallback = WEAPON_ORDER.filter((id) => weaponInventory.has(id));
    const slots = [];
    const seen = new Set();

    const raw = readItem(KEY_WEAPON_LOADOUT);
    if (raw) {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                for (const id of parsed) {
                    if (typeof id !== 'string') continue;
                    if (!WEAPON_ORDER.includes(id)) continue;
                    if (!weaponInventory.has(id)) continue;
                    if (seen.has(id)) continue;
                    slots.push(id);
                    seen.add(id);
                    if (slots.length >= MAX_LOADOUT_SLOTS) break;
                }
            }
        } catch (error) {
            console.warn('Waffen-Slots konnten nicht geladen werden', error);
        }
    }

    if (!slots.length) {
        for (const id of fallback) {
            if (seen.has(id)) continue;
            slots.push(id);
            seen.add(id);
            if (slots.length >= MAX_LOADOUT_SLOTS) break;
        }
    }

    return slots;
}

/**
 * Speichert das Waffen-Loadout in localStorage.
 * @param {Array<string>} weaponLoadout
 * @param {Set<string>} weaponInventory
 */
function persistWeaponLoadout(weaponLoadout, weaponInventory) {
    const slots = Array.isArray(weaponLoadout)
        ? weaponLoadout.filter((id) => WEAPON_ORDER.includes(id) && weaponInventory.has(id))
        : [];
    writeItem(KEY_WEAPON_LOADOUT, JSON.stringify(slots));
}

// ───────────────────── Aktuelle Waffe ─────────────────────

const KEY_CURRENT_WEAPON = 'overworldCurrentWeaponId';

/**
 * Laedt die aktuell ausgeruestete Waffen-ID aus localStorage.
 * Gibt null zurueck wenn keine Waffen im Besitz.
 *
 * @param {Set<string>} weaponInventory
 * @param {Array<string>} weaponLoadout
 * @returns {string|null} Waffen-ID oder null wenn unbewaffnet
 */
function loadCurrentWeaponId(weaponInventory, weaponLoadout) {
    if (!weaponInventory || weaponInventory.size === 0) {
        return null;
    }

    const fallback = Array.isArray(weaponLoadout) && weaponLoadout.length
        ? weaponLoadout[0]
        : null;

    const stored = readItem(KEY_CURRENT_WEAPON);
    if (stored && weaponInventory.has(stored)) {
        return stored;
    }

    if (fallback && weaponInventory.has(fallback)) {
        return fallback;
    }

    const owned = WEAPON_ORDER.find((id) => weaponInventory.has(id));
    return owned ?? null;
}

/**
 * Speichert die aktuell ausgeruestete Waffen-ID in localStorage.
 * @param {string} currentWeaponId
 * @param {Set<string>} weaponInventory
 */
function persistCurrentWeaponId(currentWeaponId, weaponInventory) {
    if (currentWeaponId && weaponInventory.has(currentWeaponId)) {
        writeItem(KEY_CURRENT_WEAPON, currentWeaponId);
    } else {
        removeItem(KEY_CURRENT_WEAPON);
    }
}

// ───────────────────── Casino-Credits ─────────────────────

const KEY_CASINO_CREDITS = 'casinoCredits';

/**
 * Laedt Casino-Credits aus localStorage.
 * @param {number} [fallback=0] - Rueckgabewert wenn nichts gespeichert
 * @returns {number}
 */
function loadCasinoCredits(fallback = 0) {
    const raw = readItem(KEY_CASINO_CREDITS);
    if (raw == null) {
        return fallback;
    }

    const parsed = parseInt(raw, 10);

    if (!Number.isFinite(parsed) || parsed < 0) {
        return 0;
    }

    return parsed;
}

/**
 * Speichert Casino-Credits in localStorage.
 * @param {number} amount
 * @returns {number} Der tatsaechlich gespeicherte Wert
 */
function storeCasinoCredits(amount) {
    const value = Math.max(0, Math.floor(Number(amount) || 0));
    writeItem(KEY_CASINO_CREDITS, String(value));
    return value;
}

// ───────────────────── Spieler-Geld ─────────────────────

const KEY_PLAYER_MONEY = 'overworldPlayerMoney';
const DEFAULT_PLAYER_MONEY = 1500;

/**
 * Laedt das Spielergeld aus localStorage.
 * @param {number} [fallback=1500] - Standardwert
 * @returns {number}
 */
function loadPlayerMoney(fallback = DEFAULT_PLAYER_MONEY) {
    const raw = readItem(KEY_PLAYER_MONEY);
    if (raw == null) {
        return fallback;
    }

    const parsed = parseInt(raw, 10);

    if (!Number.isFinite(parsed) || parsed < 0) {
        return fallback;
    }

    return parsed;
}

/**
 * Speichert das Spielergeld in localStorage.
 * @param {number} amount
 * @returns {number} Der tatsaechlich gespeicherte Wert
 */
function persistPlayerMoney(amount) {
    const value = Math.max(0, Math.floor(Number(amount) || 0));
    writeItem(KEY_PLAYER_MONEY, String(value));
    return value;
}

// ───────────────────── Immobilien-Besitz ─────────────────────

const KEY_OWNED_PROPERTIES = 'overworldOwnedProperties';

/**
 * Laedt die besessenen Immobilien aus localStorage.
 * @returns {Set<string>} Set von Building-IDs
 */
function loadOwnedProperties() {
    const owned = new Set();
    const raw = readItem(KEY_OWNED_PROPERTIES);
    if (raw) {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                for (const id of parsed) {
                    if (typeof id === 'string') {
                        owned.add(id);
                    }
                }
            }
        } catch (error) {
            console.warn('Immobilien konnten nicht geladen werden', error);
        }
    }
    return owned;
}

/**
 * Speichert die besessenen Immobilien in localStorage.
 * @param {Set<string>} ownedProperties
 */
function persistOwnedProperties(ownedProperties) {
    const ids = Array.from(ownedProperties).filter((id) => typeof id === 'string');
    writeItem(KEY_OWNED_PROPERTIES, JSON.stringify(ids));
}

// ───────────────────── Wohnsitz (Home Property) ─────────────────────

const KEY_HOME_PROPERTY = 'overworldHomeProperty';

/**
 * Laedt die Wohnsitz-Building-ID aus localStorage.
 * @returns {string|null}
 */
function loadHomeProperty() {
    const raw = readItem(KEY_HOME_PROPERTY);
    if (raw && typeof raw === 'string' && raw.length > 0) {
        return raw;
    }
    return null;
}

/**
 * Speichert die Wohnsitz-Building-ID in localStorage.
 * @param {string|null} buildingId
 */
function persistHomeProperty(buildingId) {
    if (buildingId && typeof buildingId === 'string') {
        writeItem(KEY_HOME_PROPERTY, buildingId);
    } else {
        removeItem(KEY_HOME_PROPERTY);
    }
}

// ───────────────────── Gemietete Unterkunft ─────────────────────

const KEY_RENTED_PROPERTY = 'overworldRentedProperty';

/**
 * Laedt die gemietete Unterkunft-Building-ID aus localStorage.
 * @returns {string|null}
 */
function loadRentedProperty() {
    const raw = readItem(KEY_RENTED_PROPERTY);
    if (raw && typeof raw === 'string' && raw.length > 0) {
        return raw;
    }
    return null;
}

/**
 * Speichert die gemietete Unterkunft-Building-ID in localStorage.
 * @param {string|null} buildingId
 */
function persistRentedProperty(buildingId) {
    if (buildingId && typeof buildingId === 'string') {
        writeItem(KEY_RENTED_PROPERTY, buildingId);
    } else {
        removeItem(KEY_RENTED_PROPERTY);
    }
}



// ═══════════════════════════════════════════════════════
// js/systems/RealEstateSystem.js
// ═══════════════════════════════════════════════════════
/**
 * RealEstateSystem - Immobilienmarkt: Miete und Kauf von Gebaeuden.
 *
 * SSOT: Alle Immobilien-Preise, Mieten und Kauf-Logik hier zentralisiert.
 * - Motel/Apartment: Mietbar (taegliche Miete wird abgezogen)
 * - Bungalow/Haeuser: Kaufbar ueber Immobilienmaklbuero
 * Miet-/Kauf-Abrechnung erfolgt pro Ingame-Tag (1 voller Tag/Nacht-Zyklus).
 */

// ---------------------------------------------------------------------------
// Miet-Katalog (SSOT fuer alle mietbaren Unterkuenfte)
// ---------------------------------------------------------------------------

/**
 * Mietbare Unterkuenfte: Schluessel = Building-Type, Wert = Miet-Details.
 * rent = Miete pro Ingame-Tag.
 */
const RENTAL_CATALOG = {
    motel: {
        name: 'Sunrise Motel',
        rent: 50,
        description: 'Kleines Motelzimmer mit Bett, Waschbecken und Toilette.',
    },
    apartmentComplex: {
        name: 'Parkview Apartments',
        rent: 150,
        description: 'Gemuetliche Wohnung mit Bad, Doppelbett, Fernseher und mehr.',
    },
};

// ---------------------------------------------------------------------------
// Kauf-Katalog (SSOT fuer alle kaufbaren Immobilien ueber Makler)
// ---------------------------------------------------------------------------

/** Verkaufsrate: Anteil des Kaufpreises bei Verkauf (SSOT) */
const PROPERTY_SELL_RATE = 0.5;

const PROPERTY_CATALOG = {
    bungalow: {
        name: 'Bungalow am Stadtrand',
        price: 35000,
        description: 'Ein gemuetlicher Bungalow mit drei Raeumen: Wohnzimmer, Schlafzimmer und Kueche.',
    },
};

// ---------------------------------------------------------------------------
// Kompatibilitaet: isPropertyType prueft beide Kataloge
// ---------------------------------------------------------------------------

/**
 * Prueft ob ein Gebaeudetyp mietbar ist.
 * @param {string} type
 * @returns {boolean}
 */
function isRentalType(type) {
    return type in RENTAL_CATALOG;
}

/**
 * Prueft ob ein Gebaeudetyp kaufbar ist (ueber Makler).
 * @param {string} type
 * @returns {boolean}
 */
function isPurchasableType(type) {
    return type in PROPERTY_CATALOG;
}

class RealEstateSystem {

    /**
     * @param {import('../core/EventBus.js').EventBus} eventBus
     */
    constructor(eventBus) {
        this.eventBus = eventBus;

        /** @type {number} Letzter bekannter phaseIndex des DayNightSystem */
        this._lastPhaseIndex = -1;

        /** @type {number} Zaehlt wie oft phaseIndex auf 0 zurueckspringt (= neuer Tag) */
        this._dayCount = 0;

        /** @type {number} Letzter Tag an dem Miete/Einkommen abgerechnet wurde */
        this._lastRentDay = 0;
    }

    // ===================================================================
    //  Miete (Motel / Apartment)
    // ===================================================================

    /**
     * Mietet eine Unterkunft. Spieler zahlt taegliche Miete.
     *
     * @param {object} player
     * @param {object} building
     * @returns {{ success: boolean, reason?: string, rental?: object }}
     */
    rentProperty(player, building) {
        if (!building || !building.id) {
            return { success: false, reason: 'invalidBuilding' };
        }

        const rental = RENTAL_CATALOG[building.type];
        if (!rental) {
            return { success: false, reason: 'notRentable' };
        }

        // Bereits gemietet?
        if (player.rentedPropertyId === building.id) {
            return { success: false, reason: 'alreadyRented' };
        }

        // Erste Miete sofort zahlen
        if (player.money < rental.rent) {
            return { success: false, reason: 'noMoney' };
        }

        player.money -= rental.rent;
        player.rentedPropertyId = building.id;
        player.homePropertyId = building.id;

        this.eventBus.emit('realEstate:rented', {
            buildingId: building.id,
            type: building.type,
            rent: rental.rent,
        });

        return { success: true, rental };
    }

    /**
     * Kuendigt die aktuelle Miete.
     *
     * @param {object} player
     * @param {object} building
     * @returns {{ success: boolean, reason?: string }}
     */
    cancelRental(player, building) {
        if (!building || !building.id) {
            return { success: false, reason: 'invalidBuilding' };
        }

        if (player.rentedPropertyId !== building.id) {
            return { success: false, reason: 'notRented' };
        }

        player.rentedPropertyId = null;

        // Wohnsitz nur entfernen wenn es die gemietete Unterkunft war
        if (player.homePropertyId === building.id) {
            player.homePropertyId = null;
        }

        this.eventBus.emit('realEstate:rentalCancelled', {
            buildingId: building.id,
        });

        return { success: true };
    }

    // ===================================================================
    //  Kauf / Verkauf (Bungalow etc. ueber Makler)
    // ===================================================================

    /**
     * Kauft eine Immobilie (Bungalow etc.).
     *
     * @param {object} player
     * @param {object} building
     * @returns {{ success: boolean, reason?: string, property?: object }}
     */
    buyProperty(player, building) {
        if (!building || !building.id) {
            return { success: false, reason: 'invalidBuilding' };
        }

        const catalog = PROPERTY_CATALOG[building.type];
        if (!catalog) {
            return { success: false, reason: 'notForSale' };
        }

        if (player.ownedProperties.has(building.id)) {
            return { success: false, reason: 'alreadyOwned' };
        }

        if (player.money < catalog.price) {
            return { success: false, reason: 'noMoney' };
        }

        player.money -= catalog.price;
        player.ownedProperties.add(building.id);

        this.eventBus.emit('realEstate:purchased', {
            buildingId: building.id,
            type: building.type,
            price: catalog.price,
        });

        return { success: true, property: catalog };
    }

    /**
     * Verkauft eine Immobilie (50% des Kaufpreises).
     *
     * @param {object} player
     * @param {object} building
     * @returns {{ success: boolean, reason?: string, refund?: number }}
     */
    sellProperty(player, building) {
        if (!building || !building.id) {
            return { success: false, reason: 'invalidBuilding' };
        }

        if (!player.ownedProperties.has(building.id)) {
            return { success: false, reason: 'notOwned' };
        }

        const catalog = PROPERTY_CATALOG[building.type];
        if (!catalog) {
            return { success: false, reason: 'notForSale' };
        }

        const refund = RealEstateSystem.getSellRefund(catalog.price);
        player.money += refund;
        player.ownedProperties.delete(building.id);

        if (player.homePropertyId === building.id) {
            player.homePropertyId = null;
        }

        this.eventBus.emit('realEstate:sold', {
            buildingId: building.id,
            type: building.type,
            refund,
        });

        return { success: true, refund };
    }

    // ===================================================================
    //  Einziehen (Wohnsitz setzen - nur bei eigenen Immobilien)
    // ===================================================================

    /**
     * Setzt eine eigene Immobilie als Wohnsitz (Respawn-Punkt).
     *
     * @param {object} player
     * @param {object} building
     * @returns {{ success: boolean, reason?: string }}
     */
    moveIn(player, building) {
        if (!building || !building.id) {
            return { success: false, reason: 'invalidBuilding' };
        }

        if (!player.ownedProperties.has(building.id)) {
            return { success: false, reason: 'notOwned' };
        }

        player.homePropertyId = building.id;

        this.eventBus.emit('realEstate:movedIn', {
            buildingId: building.id,
        });

        return { success: true };
    }

    // ===================================================================
    //  Taegliche Miet-Abrechnung (pro Ingame-Tag)
    // ===================================================================

    /**
     * Zieht taegliche Miete ab wenn Spieler eine Unterkunft gemietet hat.
     * Bei fehlendem Geld wird die Miete automatisch gekuendigt.
     *
     * @param {object} player
     * @param {Array} buildings - Alle Gebaeude der Welt
     * @param {number} deltaTime
     * @param {object} dayNightSystem
     */
    update(player, buildings, deltaTime, dayNightSystem) {
        if (!dayNightSystem) return;

        const currentPhaseIndex = dayNightSystem.phaseIndex ?? 0;

        if (this._lastPhaseIndex < 0) {
            this._lastPhaseIndex = currentPhaseIndex;
            return;
        }

        // Tageswechsel: Phase springt von letzter Phase (dawn=3) auf erste (day=0)
        if (currentPhaseIndex === 0 && this._lastPhaseIndex !== 0) {
            this._dayCount++;

            if (this._dayCount > this._lastRentDay) {
                this._lastRentDay = this._dayCount;

                // Miete abziehen
                if (player.rentedPropertyId) {
                    const building = buildings.find((b) => b && b.id === player.rentedPropertyId);
                    if (building) {
                        const rental = RENTAL_CATALOG[building.type];
                        if (rental) {
                            if (player.money >= rental.rent) {
                                player.money -= rental.rent;
                                this.eventBus.emit('realEstate:rentPaid', {
                                    buildingId: building.id,
                                    rent: rental.rent,
                                    day: this._dayCount,
                                });
                            } else {
                                // Kein Geld -> Miete kuendigen
                                player.rentedPropertyId = null;
                                if (player.homePropertyId === building.id) {
                                    player.homePropertyId = null;
                                }
                                this.eventBus.emit('realEstate:evicted', {
                                    buildingId: building.id,
                                    day: this._dayCount,
                                });
                            }
                        }
                    }
                }
            }
        }

        this._lastPhaseIndex = currentPhaseIndex;
    }

    // ===================================================================
    //  Hilfsfunktionen
    // ===================================================================

    /**
     * Gibt die Katalog-Infos fuer einen Gebaeudetyp zurueck (Miet- oder Kauf-Katalog).
     * @param {string} type
     * @returns {object|null}
     */
    static getCatalogEntry(type) {
        return RENTAL_CATALOG[type] ?? PROPERTY_CATALOG[type] ?? null;
    }

    /**
     * Gibt den Miet-Katalog-Eintrag zurueck.
     * @param {string} type
     * @returns {object|null}
     */
    static getRentalEntry(type) {
        return RENTAL_CATALOG[type] ?? null;
    }

    /**
     * Gibt den Kauf-Katalog-Eintrag zurueck.
     * @param {string} type
     * @returns {object|null}
     */
    static getPurchaseEntry(type) {
        return PROPERTY_CATALOG[type] ?? null;
    }

    /**
     * Prueft ob ein Gebaeudetyp mietbar oder kaufbar ist.
     * @param {string} type
     * @returns {boolean}
     */
    static isPropertyType(type) {
        return type in RENTAL_CATALOG || type in PROPERTY_CATALOG;
    }

    /**
     * Berechnet den Verkaufserloes einer Immobilie (SSOT).
     * @param {number} price - Kaufpreis
     * @returns {number}
     */
    static getSellRefund(price) {
        return Math.floor(price * PROPERTY_SELL_RATE);
    }

    /**
     * Formatiert einen Geldbetrag.
     * @param {number} amount
     * @returns {string}
     */
    static formatMoney(amount) {
        return Math.floor(amount).toLocaleString('de-DE') + '$';
    }
}




// ═══════════════════════════════════════════════════════
// js/world/BuildingFactory.js
// ═══════════════════════════════════════════════════════
/**
 * BuildingFactory - Erstellt Gebaeude-Objekte und Collider.
 *
 * Portiert aus gta_old/overworld/js/overworld.js:
 *   createBuildingColliders() Zeilen 12025-12142
 *
 * SSOT: Alle Gebaeude-Erstellung und Collider-Logik hier zentralisiert.
 */

/**
 * Erstellt ein Gebaeude-Objekt mit den gegebenen Parametern.
 *
 * @param {string} type - Gebaeudetyp (z.B. 'house', 'police', 'casino', 'weaponShop')
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @param {object} [options={}]
 * @param {string} [options.name]
 * @param {boolean} [options.interactive=false]
 * @param {object} [options.variant]
 * @param {number} [options.colorIndex]
 * @param {number} [options.lotPadding]
 * @param {number} [options.collisionPadding]
 * @param {Array}  [options.subUnits]
 * @param {Array}  [options.collisionRects]
 * @returns {object} Gebaeude-Objekt
 */
function createBuilding(type, x, y, width, height, options = {}) {
    const building = {
        x,
        y,
        width,
        height,
        type,
        name: options.name ?? type,
        interactive: options.interactive ?? false,
    };

    if (options.variant !== undefined) {
        building.variant = options.variant;
    }
    if (options.colorIndex !== undefined) {
        building.colorIndex = options.colorIndex;
    }
    if (options.lotPadding !== undefined) {
        building.lotPadding = options.lotPadding;
    }
    if (options.collisionPadding !== undefined) {
        building.collisionPadding = options.collisionPadding;
    }
    if (options.subUnits !== undefined) {
        building.subUnits = options.subUnits;
    }
    if (options.collisionRects !== undefined) {
        building.collisionRects = options.collisionRects;
    }

    return building;
}

/**
 * Berechnet die Metriken (Abmessungen, Tuer, Eingang, etc.) fuer ein Haus.
 * SSOT: Einzige Quelle fuer Haus-Geometrie-Berechnungen.
 *
 * @param {object} building - Gebaeude-Objekt
 * @param {Array}  [houseStyles] - Hausstile (optional, fuer Palette)
 * @returns {object|null}
 */
function computeHouseMetrics(building, houseStyles) {
    if (!building || building.type !== "house") {
        return null;
    }

    const lotWidth = Number(building.width ?? 0);
    const lotHeight = Number(building.height ?? 0);

    if (!(lotWidth > 0 && lotHeight > 0)) {
        return null;
    }

    const variant = building.variant ?? {};
    const styleIndex = variant.styleIndex ?? building.colorIndex ?? 0;
    const palettes = Array.isArray(houseStyles) ? houseStyles : [];
    const palette = palettes.length > 0 ? palettes[styleIndex % palettes.length] : {};

    const lotPaddingBase = building.lotPadding ?? Math.min(36, Math.min(lotWidth, lotHeight) * 0.22);
    const sideMax = Math.max(12, (lotWidth - 140) / 2);
    const sidePadding = Math.min(Math.max(14, lotPaddingBase), sideMax);

    let rearPadding = Math.min(lotHeight * 0.22, Math.max(12, lotPaddingBase * 0.65));
    const minHouseHeight = 120;
    const maxFrontSpace = Math.max(20, lotHeight - rearPadding - minHouseHeight);

    let desiredFront = Math.min(maxFrontSpace, Math.max(48, lotPaddingBase * 1.45, lotHeight * 0.26));
    if (desiredFront < 32) {
        desiredFront = Math.min(maxFrontSpace, Math.max(32, lotPaddingBase * 1.15));
    }

    let houseHeight = lotHeight - rearPadding - desiredFront;
    if (houseHeight < minHouseHeight) {
        houseHeight = minHouseHeight;
        desiredFront = lotHeight - rearPadding - houseHeight;
    }

    const houseWidth = Math.max(120, lotWidth - sidePadding * 2);
    const houseX = (lotWidth - houseWidth) / 2;
    const houseY = Math.max(10, rearPadding);
    const houseBottom = houseY + houseHeight;
    const frontDepth = Math.max(10, desiredFront);

    let roofDepth = Math.max(32, Math.min(houseHeight * 0.32, 88));
    if (houseHeight - roofDepth < 96) {
        roofDepth = Math.max(24, houseHeight - 96);
    }

    const facadeHeight = houseHeight - roofDepth;
    const facadeTop = houseY + roofDepth;
    const walkwayWidth = Math.min(48, houseWidth * 0.28);
    const walkwayX = lotWidth / 2 - walkwayWidth / 2;
    const walkwayY = houseBottom;
    const walkwayHeight = frontDepth;

    const doorWidth = Math.min(houseWidth * 0.26, 68);
    const doorHeight = Math.max(58, Math.min(facadeHeight * 0.44, 104));
    const doorX = houseX + houseWidth / 2 - doorWidth / 2;
    const doorY = facadeTop + facadeHeight - doorHeight;

    const houseWorldX = Number(building.x ?? 0);
    const houseWorldY = Number(building.y ?? 0);

    const doorWorldX = houseWorldX + doorX + doorWidth / 2;
    const doorWorldBottom = houseWorldY + doorY + doorHeight;
    const doorWorldCenterY = houseWorldY + doorY + doorHeight / 2;
    const doorWorldInsideY = houseWorldY + doorY + doorHeight * 0.35;
    const walkwayWorldBottom = doorWorldBottom + walkwayHeight;

    const entranceY = doorWorldBottom + Math.max(6, walkwayHeight * 0.35);
    const approachY = walkwayWorldBottom + Math.max(12, walkwayHeight * 0.4);

    const interiorX = houseWorldX + houseX + houseWidth / 2;
    const interiorY = houseWorldY + houseY + Math.max(40, facadeHeight * 0.45);

    const boundsLeft = houseWorldX + houseX - Math.max(20, walkwayWidth * 0.6);
    const boundsRight = houseWorldX + houseX + houseWidth + Math.max(20, walkwayWidth * 0.6);
    const boundsTop = houseWorldY + houseY - Math.max(20, roofDepth * 0.4);
    const minBoundsHeight = Math.max(60, facadeHeight * 0.5);
    const boundsBottom = Math.max(
        boundsTop + minBoundsHeight,
        approachY + Math.max(16, walkwayHeight * 0.2)
    );

    return {
        houseX, houseY, houseWidth, houseHeight, houseBottom,
        roofDepth, facadeTop, facadeHeight, frontDepth,
        walkway: { x: walkwayX, y: walkwayY, width: walkwayWidth, height: walkwayHeight },
        door: {
            x: doorX, y: doorY, width: doorWidth, height: doorHeight,
            world: {
                x: doorWorldX, y: doorWorldCenterY,
                bottom: doorWorldBottom, insideY: doorWorldInsideY,
            },
        },
        entrance: { x: doorWorldX, y: entranceY },
        approach: { x: doorWorldX, y: approachY },
        interior: { x: interiorX, y: interiorY },
        bounds: { left: boundsLeft, right: boundsRight, top: boundsTop, bottom: boundsBottom },
        palette,
    };
}

/**
 * Berechnet die Casino-Podium-Geometrie.
 * SSOT: Einzige Quelle fuer Casino-Podium-Abmessungen.
 *
 * @param {object} casinoTower - Casino-Gebaeude mit x, y, width, height
 * @returns {{ apron: number, podiumWidth: number, podiumHeight: number, plinthHeight: number, podiumX: number, podiumY: number }}
 */
function computeCasinoPodiumGeometry(casinoTower) {
    const apron = Math.max(60, Math.round(casinoTower.width * 0.3));
    const podiumHeight = Math.max(72, Math.min(120, Math.round(casinoTower.height * 0.22)));
    const plinthHeight = 40;
    const podiumWidth = casinoTower.width + apron * 2;
    const podiumX = casinoTower.x - apron;
    const podiumY = casinoTower.y + casinoTower.height - 16;

    return { apron, podiumWidth, podiumHeight, plinthHeight, podiumX, podiumY };
}

/**
 * Erstellt Collider-Objekte aus einer Liste von Gebaeuden.
 * Jedes Gebaeude kann eigene collisionRects haben, andernfalls
 * wird die Basisgeometrie als Collider verwendet.
 *
 * Portiert aus createBuildingColliders() Zeilen 12025-12142.
 *
 * @param {Array} buildings
 * @returns {Array<{type: string, id: string|null, left: number, right: number, top: number, bottom: number}>}
 */
function createBuildingColliders(buildings) {
    if (!Array.isArray(buildings)) {
        return [];
    }

    const colliders = [];

    for (const building of buildings) {
        if (!building) {
            continue;
        }

        const rects = [];

        if (Array.isArray(building.collisionRects) && building.collisionRects.length > 0) {
            for (const rect of building.collisionRects) {
                if (!rect) {
                    continue;
                }

                const width = Number(rect.width ?? 0);
                const height = Number(rect.height ?? 0);

                if (!(width > 0 && height > 0)) {
                    continue;
                }

                const left = Number(rect.x ?? building.x ?? 0);
                const top = Number(rect.y ?? building.y ?? 0);

                if (!Number.isFinite(left) || !Number.isFinite(top)) {
                    continue;
                }

                rects.push({
                    left,
                    right: left + width,
                    top,
                    bottom: top + height,
                });
            }
        }

        if (rects.length === 0) {
            const width = Number(building.width ?? 0);
            const height = Number(building.height ?? 0);
            const left = Number(building.x ?? 0);
            const top = Number(building.y ?? 0);

            if (width > 0 && height > 0 && Number.isFinite(left) && Number.isFinite(top)) {
                rects.push({
                    left,
                    right: left + width,
                    top,
                    bottom: top + height,
                });
            }
        }

        for (const rect of rects) {
            colliders.push({
                type: 'building',
                id: building.id ?? building.name ?? null,
                left: rect.left,
                right: rect.right,
                top: rect.top,
                bottom: rect.bottom,
            });
        }
    }

    return colliders;
}



// ═══════════════════════════════════════════════════════
// js/world/RoadNetwork.js
// ═══════════════════════════════════════════════════════
/**
 * RoadNetwork - Verwaltet Strassen, Buergersteige und begehbare Bereiche.
 *
 * Portiert aus gta_old/overworld/js/overworld.js:
 *   createCrosswalks, createCityRoadLayout, createSidewalkCorridors,
 *   computeWalkableAreas, createRoadAreas, createHouseWalkwayCorridors,
 *   createSidewalkObstacles, projectPointToSidewalk, pushPointOutOfObstacles
 */

// ---------------------------------------------------------------------------
// Geometry helper - resolves various rect formats to { left, top, right, bottom, width, height }
// ---------------------------------------------------------------------------
function resolveRectBounds(rect) {
    if (!rect) {
        return null;
    }

    const baseX = rect.x ?? rect.left;
    const baseY = rect.y ?? rect.top;

    const originX = Number(baseX);
    const originY = Number(baseY);

    if (!Number.isFinite(originX) || !Number.isFinite(originY)) {
        return null;
    }

    let resolvedRight = rect.right;
    if (resolvedRight == null) {
        const width = Number(rect.width ?? Number.NaN);
        if (Number.isFinite(width)) {
            resolvedRight = originX + width;
        }
    } else {
        resolvedRight = Number(resolvedRight);
    }

    let resolvedBottom = rect.bottom;
    if (resolvedBottom == null) {
        const height = Number(rect.height ?? Number.NaN);
        if (Number.isFinite(height)) {
            resolvedBottom = originY + height;
        }
    } else {
        resolvedBottom = Number(resolvedBottom);
    }

    if (!Number.isFinite(resolvedRight)) {
        resolvedRight = originX;
    }

    if (!Number.isFinite(resolvedBottom)) {
        resolvedBottom = originY;
    }

    const left = Math.min(originX, resolvedRight);
    const right = Math.max(originX, resolvedRight);
    const top = Math.min(originY, resolvedBottom);
    const bottom = Math.max(originY, resolvedBottom);

    return {
        left,
        top,
        right,
        bottom,
        width: right - left,
        height: bottom - top,
    };
}

function isPointInsideRect(px, py, rect) {
    const bounds = (rect && rect.left !== undefined && rect.right !== undefined)
        ? rect
        : resolveRectBounds(rect);

    if (!bounds) {
        return false;
    }

    const x = Number(px);
    const y = Number(py);

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return false;
    }

    return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
}

function clampPointToRect(x, y, rect) {
    const bounds = resolveRectBounds(rect);

    if (!bounds) {
        return { x: Number(x) || 0, y: Number(y) || 0 };
    }

    const px = Number(x);
    const py = Number(y);

    const clampedX = Number.isFinite(px) ? Math.min(bounds.right, Math.max(bounds.left, px)) : bounds.left;
    const clampedY = Number.isFinite(py) ? Math.min(bounds.bottom, Math.max(bounds.top, py)) : bounds.top;

    return { x: clampedX, y: clampedY };
}

// ---------------------------------------------------------------------------
// RoadNetwork
// ---------------------------------------------------------------------------
class RoadNetwork {
    /**
     * @param {Object} config
     * @param {Array}  config.sidewalkCorridors  - vorab berechnete Buergersteig-Korridore
     * @param {Array}  config.crosswalks         - Zebrastreifen-Definitionen
     * @param {Array}  config.walkableAreas      - zusammengefuehrte begehbare Bereiche
     * @param {Array}  [config.sidewalkObstacles] - Hindernisse auf Buergersteigen
     * @param {Array}  [config.roadAreas]         - Strassenflaechen
     */
    constructor(config = {}) {
        this.sidewalkCorridors = config.sidewalkCorridors || [];
        this.crosswalks = config.crosswalks || [];
        this.walkableAreas = config.walkableAreas || [];
        this.sidewalkObstacles = config.sidewalkObstacles || [];
        this.roadAreas = config.roadAreas || [];
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /**
     * Schraenkt eine Position auf den naechsten Buergersteig ein.
     * Bevorzugt das currentSegment wenn die Position noch darin liegt.
     *
     * @param {number} x
     * @param {number} y
     * @param {Object|null} currentSegment - das Segment in dem die Entity zuletzt war
     * @returns {{ x: number, y: number, segment: Object|null }}
     */
    constrainToSidewalk(x, y, currentSegment) {
        const walkableRects = this._getWalkableRectangles();

        if (!walkableRects.length) {
            return { x, y, segment: currentSegment };
        }

        // Wenn das aktuelle Segment noch passt, dort bleiben
        if (currentSegment && isPointInsideRect(x, y, currentSegment)) {
            if (this._pointIsClear(x, y)) {
                return { x, y, segment: currentSegment };
            }
            // Im aktuellen Segment, aber blockiert - rausschieben
            const pushed = this._pushPointOutOfObstacles({ x, y }, currentSegment);
            if (this._pointIsClear(pushed.x, pushed.y) && isPointInsideRect(pushed.x, pushed.y, currentSegment)) {
                return { x: pushed.x, y: pushed.y, segment: currentSegment };
            }
        }

        // Projiziere auf irgendeinen Buergersteig (wie projectPointToSidewalk)
        const projected = this._projectPointToSidewalk(x, y);
        // Finde das Segment in dem der projizierte Punkt liegt
        const segment = this._findContainingRect(projected.x, projected.y, walkableRects);

        return { x: projected.x, y: projected.y, segment: segment };
    }

    /**
     * Findet den naechsten Punkt auf einem Buergersteig.
     */
    findNearestSidewalkSpot(x, y) {
        const projected = this._projectPointToSidewalk(x, y);
        const walkableRects = this._getWalkableRectangles();
        const segment = this._findContainingRect(projected.x, projected.y, walkableRects);
        return { x: projected.x, y: projected.y, segment };
    }

    /**
     * Prueft ob ein Punkt auf einem Buergersteig liegt.
     */
    isOnSidewalk(x, y) {
        const walkableRects = this._getWalkableRectangles();
        for (const rect of walkableRects) {
            if (rect && isPointInsideRect(x, y, rect)) {
                return true;
            }
        }
        return false;
    }

    // -----------------------------------------------------------------------
    // Static factory methods - portiert aus dem alten Code
    // -----------------------------------------------------------------------

    /**
     * Erstellt Zebrastreifen-Definitionen.
     * Portiert aus createCrosswalks() (Zeilen 11700-11714).
     */
    static createCrosswalks() {
        return [
            { orientation: "horizontal", x: 1100, y: 1700, span: 80 },
            { orientation: "horizontal", x: 2050, y: 1700, span: 80 },
            { orientation: "horizontal", x: 1040, y: 1680, span: 80 },
            { orientation: "horizontal", x: 1860, y: 1680, span: 80 },
            { orientation: "vertical", x: 950, y: 900, span: 80 },
            { orientation: "vertical", x: 1700, y: 900, span: 80 },
            { orientation: "vertical", x: 2050, y: 1700, span: 80 },
            { orientation: "horizontal", x: 2950, y: 1100, span: 80 },
            { orientation: "horizontal", x: 3040, y: 1500, span: 80 },
        ];
    }

    /**
     * Erstellt das Stadt-Strassenlayout.
     * Portiert aus createCityRoadLayout() (Zeilen 11715-11735).
     */
    static createCityRoadLayout() {
        const roads = [];

        const verticalCorridors = [200, 950, 1700, 2450, 3350];
        const horizontalCorridors = [200, 900, 1700, 2400, 2800];

        for (const y of horizontalCorridors) {
            roads.push({ type: "horizontal", startX: 200, endX: 3400, y });
        }

        for (const x of verticalCorridors) {
            roads.push({ type: "vertical", x, startY: 200, endY: 2800 });
        }

        roads.push({ type: "horizontal", startX: 950, endX: 1700, y: 1260 });
        roads.push({ type: "vertical", x: 2050, startY: 900, endY: 1700 });

        return roads;
    }

    /**
     * Erstellt Buergersteig-Korridore entlang der Strassen und um Zebrastreifen.
     * Portiert aus createSidewalkCorridors() (Zeilen 11736-11823).
     *
     * @param {Array} roadLayout       - Strassenlayout von createCityRoadLayout()
     * @param {Array} crosswalkAreas   - Zebrastreifen-Flaechen
     * @param {Object} [config]
     * @param {number} [config.sidewalkWidth=36]
     * @param {number} [config.roadWidth=70]
     * @param {number} [config.roadHalfWidth]
     */
    static createSidewalkCorridors(roadLayout, crosswalkAreas, config = {}) {
        const corridors = [];
        const roads = Array.isArray(roadLayout) ? roadLayout : [];
        const sidewalkWidth = config.sidewalkWidth ?? 36;
        const halfRoad = config.roadHalfWidth ?? ((config.roadWidth ?? 70) / 2);
        const extension = sidewalkWidth;

        for (const road of roads) {
            if (!road) {
                continue;
            }

            if (road.type === "horizontal") {
                const startRaw = Number(road.startX ?? road.x ?? 0);
                const endRaw = Number(road.endX ?? startRaw);
                const startX = Math.min(startRaw, endRaw);
                const endX = Math.max(startRaw, endRaw);
                const y = Number(road.y ?? 0);
                const width = Math.max(0, endX - startX);
                const spanWidth = width + extension * 2;
                const offsetX = startX - extension;
                const upperY = y - halfRoad - sidewalkWidth;
                const lowerY = y + halfRoad;

                corridors.push({
                    x: offsetX,
                    y: upperY,
                    width: spanWidth,
                    height: sidewalkWidth,
                });

                corridors.push({
                    x: offsetX,
                    y: lowerY,
                    width: spanWidth,
                    height: sidewalkWidth,
                });
            } else if (road.type === "vertical") {
                const startRaw = Number(road.startY ?? road.y ?? 0);
                const endRaw = Number(road.endY ?? startRaw);
                const startY = Math.min(startRaw, endRaw);
                const endY = Math.max(startRaw, endRaw);
                const x = Number(road.x ?? 0);
                const height = Math.max(0, endY - startY);
                const spanHeight = height + extension * 2;
                const offsetY = startY - extension;
                const leftX = x - halfRoad - sidewalkWidth;
                const rightX = x + halfRoad;

                corridors.push({
                    x: leftX,
                    y: offsetY,
                    width: sidewalkWidth,
                    height: spanHeight,
                });

                corridors.push({
                    x: rightX,
                    y: offsetY,
                    width: sidewalkWidth,
                    height: spanHeight,
                });
            }
        }

        const areas = Array.isArray(crosswalkAreas) ? crosswalkAreas : [];
        const crosswalkPadding = sidewalkWidth * 0.35;

        for (const area of areas) {
            if (!area) {
                continue;
            }

            const left = Number(area.left ?? area.x ?? 0);
            const top = Number(area.top ?? area.y ?? 0);
            const right = Number(area.right ?? left);
            const bottom = Number(area.bottom ?? top);

            corridors.push({
                x: left - crosswalkPadding,
                y: top - crosswalkPadding,
                width: Math.max(0, (right - left) + crosswalkPadding * 2),
                height: Math.max(0, (bottom - top) + crosswalkPadding * 2),
            });
        }

        return corridors;
    }

    /**
     * Berechnet zusammengefuehrte begehbare Bereiche aus Buergersteig-Korridoren.
     * Portiert aus computeWalkableAreas() (Zeilen 11825-12005).
     *
     * @param {Array} sidewalkCorridors
     * @returns {Array}
     */
    static computeWalkableAreas(sidewalkCorridors) {
        const source = Array.isArray(sidewalkCorridors) ? sidewalkCorridors : [];

        if (!source.length) {
            return [];
        }

        const areas = [];
        const seen = new Set();

        for (const rect of source) {
            const bounds = resolveRectBounds(rect);

            if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
                continue;
            }

            const key = `${Math.round(bounds.left)}:${Math.round(bounds.top)}:${Math.round(bounds.right)}:${Math.round(bounds.bottom)}`;

            if (seen.has(key)) {
                continue;
            }

            areas.push({
                x: bounds.left,
                y: bounds.top,
                width: bounds.width,
                height: bounds.height,
            });

            seen.add(key);
        }

        const tolerance = 1.0;

        const mergeIfAligned = (a, b) => {
            if (!a || !b) {
                return null;
            }

            const aLeft = a.x;
            const aRight = a.x + a.width;
            const aTop = a.y;
            const aBottom = a.y + a.height;

            const bLeft = b.x;
            const bRight = b.x + b.width;
            const bTop = b.y;
            const bBottom = b.y + b.height;

            const horizontalAligned = Math.abs(aTop - bTop) <= tolerance && Math.abs(aBottom - bBottom) <= tolerance;

            if (horizontalAligned) {
                const overlapsOrTouches = (aRight + tolerance >= bLeft) && (bRight + tolerance >= aLeft);

                if (overlapsOrTouches) {
                    const left = Math.min(aLeft, bLeft);
                    const right = Math.max(aRight, bRight);
                    const top = Math.min(aTop, bTop);
                    const bottom = Math.max(aBottom, bBottom);

                    return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
                }
            }

            const verticalAligned = Math.abs(aLeft - bLeft) <= tolerance && Math.abs(aRight - bRight) <= tolerance;

            if (verticalAligned) {
                const overlapsOrTouches = (aBottom + tolerance >= bTop) && (bBottom + tolerance >= aTop);

                if (overlapsOrTouches) {
                    const left = Math.min(aLeft, bLeft);
                    const right = Math.max(aRight, bRight);
                    const top = Math.min(aTop, bTop);
                    const bottom = Math.max(aBottom, bBottom);

                    return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
                }
            }

            return null;
        };

        const mergeRectangles = (input) => {
            const result = Array.isArray(input) ? input.slice() : [];

            let changed = true;

            while (changed) {
                changed = false;

                outer: for (let i = 0; i < result.length; i++) {
                    const a = result[i];

                    if (!a) {
                        continue;
                    }

                    for (let j = i + 1; j < result.length; j++) {
                        const b = result[j];

                        if (!b) {
                            continue;
                        }

                        const merged = mergeIfAligned(a, b);

                        if (merged) {
                            result[i] = merged;
                            result.splice(j, 1);
                            changed = true;
                            break outer;
                        }
                    }
                }
            }

            return result;
        };

        const mergedAreas = mergeRectangles(areas);
        return mergedAreas;
    }

    /**
     * Erstellt Strassenflaechen aus dem Strassenlayout.
     * Portiert aus createRoadAreas() (Zeilen 12145-12241).
     *
     * @param {Array} roadLayout
     * @param {Object} [config]
     * @param {number} [config.roadWidth=70]
     * @param {number} [config.roadHalfWidth]
     * @returns {Array}
     */
    static createRoadAreas(roadLayout, config = {}) {
        const roads = Array.isArray(roadLayout) ? roadLayout : [];

        if (!roads.length) {
            return [];
        }

        const halfRoad = config.roadHalfWidth ?? ((config.roadWidth ?? 70) / 2);
        const areas = [];

        for (const road of roads) {
            if (!road) {
                continue;
            }

            if (road.type === "horizontal") {
                const startRaw = Number(road.startX ?? road.x ?? 0);
                const endRaw = Number(road.endX ?? startRaw);
                const y = Number(road.y ?? 0);

                if (!Number.isFinite(startRaw) || !Number.isFinite(endRaw) || !Number.isFinite(y)) {
                    continue;
                }

                const left = Math.min(startRaw, endRaw);
                const right = Math.max(startRaw, endRaw);

                areas.push({
                    type: 'road',
                    orientation: 'horizontal',
                    left,
                    right,
                    top: y - halfRoad,
                    bottom: y + halfRoad,
                });
            } else if (road.type === "vertical") {
                const startRaw = Number(road.startY ?? road.y ?? 0);
                const endRaw = Number(road.endY ?? startRaw);
                const x = Number(road.x ?? 0);

                if (!Number.isFinite(startRaw) || !Number.isFinite(endRaw) || !Number.isFinite(x)) {
                    continue;
                }

                const top = Math.min(startRaw, endRaw);
                const bottom = Math.max(startRaw, endRaw);

                areas.push({
                    type: 'road',
                    orientation: 'vertical',
                    left: x - halfRoad,
                    right: x + halfRoad,
                    top,
                    bottom,
                });
            }
        }

        return areas;
    }

    /**
     * Erstellt Gehweg-Korridore fuer Haeuser.
     * Portiert aus createHouseWalkwayCorridors() (Zeilen 12243-12353).
     *
     * @param {Array} buildings
     * @returns {Array}
     */
    static createHouseWalkwayCorridors(buildings) {
        if (!Array.isArray(buildings)) {
            return [];
        }

        const corridors = [];

        for (const building of buildings) {
            if (!building || building.type !== "house") {
                continue;
            }

            const metrics = building.metrics ?? null;

            if (!metrics || !metrics.entrance || !metrics.approach) {
                continue;
            }

            const entrance = metrics.entrance;
            const approach = metrics.approach;
            const walkway = metrics.walkway ?? null;
            const variant = building.variant ?? {};

            const walkwayWidth = Math.max(20, Number(walkway?.width ?? 30));
            const lateralMargin = Math.max(6, walkwayWidth * 0.35);
            const halfWidth = walkwayWidth / 2 + lateralMargin;

            const startY = Math.min(entrance.y, approach.y);
            const endY = Math.max(entrance.y, approach.y);

            const extension = Math.max(0, Number(variant.walkwayExtension ?? 0));
            const spurLength = Math.max(0, Number(variant.walkwaySpurLength ?? 0));
            const spurWidth = Math.max(0, Number(variant.walkwaySpurWidth ?? 0));

            const paddingY = Math.max(8, (walkway?.height ?? 18) * 0.25);

            const left = entrance.x - halfWidth;
            const right = entrance.x + halfWidth;
            const top = Math.min(startY, endY) - paddingY;
            const bottom = endY + extension + paddingY;

            corridors.push({
                x: left,
                y: top,
                width: Math.max(8, right - left),
                height: Math.max(8, bottom - top),
            });

            if (spurLength > 0 && spurWidth > 0) {
                const spurHalfWidth = Math.max(6, spurWidth / 2 + 6);
                const spurTop = bottom - Math.max(spurWidth, 12) - 2;
                const spurBottom = spurTop + Math.max(spurWidth, 12);

                corridors.push({
                    x: entrance.x - spurLength - spurHalfWidth,
                    y: spurTop,
                    width: spurLength + spurHalfWidth * 2,
                    height: Math.max(8, spurBottom - spurTop),
                });

                corridors.push({
                    x: entrance.x,
                    y: spurTop,
                    width: spurLength + spurHalfWidth * 2,
                    height: Math.max(8, spurBottom - spurTop),
                });
            }
        }

        return corridors;
    }

    /**
     * Erstellt Hindernisse auf Buergersteigen (aus Gebaeude-Kollisionsrechtecken).
     * Portiert aus createSidewalkObstacles() (Zeilen 12355-12434).
     *
     * @param {Array} buildings
     * @param {Object} [config]
     * @param {number} [config.sidewalkWidth=36]
     * @returns {Array}
     */
    static createSidewalkObstacles(buildings, config = {}) {
        if (!Array.isArray(buildings)) {
            return [];
        }

        const clearance = Math.max(4, Math.min(12, (config.sidewalkWidth ?? 36) * 0.35));
        const obstacles = [];

        for (const building of buildings) {
            if (!building) {
                continue;
            }

            const candidates = [];

            if (Array.isArray(building.collisionRects) && building.collisionRects.length > 0) {
                for (const rect of building.collisionRects) {
                    if (!rect) {
                        continue;
                    }

                    const rawWidth = Number(rect.width ?? 0);
                    const rawHeight = Number(rect.height ?? 0);

                    if (!(rawWidth > 0 && rawHeight > 0)) {
                        continue;
                    }

                    const rectPadding = Math.max(0, rect.padding ?? 0);
                    const paddedWidth = rawWidth - rectPadding * 2;
                    const paddedHeight = rawHeight - rectPadding * 2;

                    if (!(paddedWidth > 0 && paddedHeight > 0)) {
                        continue;
                    }

                    const resolvedX = Number(rect.x ?? building.x ?? 0);
                    const resolvedY = Number(rect.y ?? building.y ?? 0);

                    candidates.push({
                        x: resolvedX + rectPadding,
                        y: resolvedY + rectPadding,
                        width: paddedWidth,
                        height: paddedHeight,
                    });
                }
            }

            if (candidates.length === 0) {
                const baseWidth = Number(building.width ?? 0);
                const baseHeight = Number(building.height ?? 0);

                if (baseWidth > 0 && baseHeight > 0) {
                    const basePadding = Math.max(0, building.collisionPadding ?? 0);
                    const paddedWidth = baseWidth - basePadding * 2;
                    const paddedHeight = baseHeight - basePadding * 2;

                    if (paddedWidth > 0 && paddedHeight > 0) {
                        candidates.push({
                            x: Number(building.x ?? 0) + basePadding,
                            y: Number(building.y ?? 0) + basePadding,
                            width: paddedWidth,
                            height: paddedHeight,
                        });
                    }
                }
            }

            for (const rect of candidates) {
                obstacles.push({
                    x: rect.x - clearance,
                    y: rect.y - clearance,
                    width: rect.width + clearance * 2,
                    height: rect.height + clearance * 2,
                });
            }
        }

        return obstacles;
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    _getWalkableRectangles() {
        if (Array.isArray(this.walkableAreas) && this.walkableAreas.length) {
            return this.walkableAreas;
        }

        if (Array.isArray(this.sidewalkCorridors) && this.sidewalkCorridors.length) {
            return this.sidewalkCorridors;
        }

        return [];
    }

    _pointIsClear(px, py) {
        const obstacles = this.sidewalkObstacles;
        if (!obstacles.length) {
            return true;
        }

        for (const rect of obstacles) {
            if (rect && isPointInsideRect(px, py, rect)) {
                return false;
            }
        }

        return true;
    }

    _findContainingRect(x, y, rects) {
        for (const rect of rects) {
            if (rect && isPointInsideRect(x, y, rect)) {
                return rect;
            }
        }
        return null;
    }

    /**
     * Projiziert einen Punkt auf den naechsten Buergersteig.
     * Portiert aus projectPointToSidewalk() (Zeilen 12435-12520).
     */
    _projectPointToSidewalk(x, y, options = {}) {
        const walkableRects = this._getWalkableRectangles();

        if (!walkableRects.length) {
            return { x, y, inside: false };
        }

        const ignoreObstacles = options.ignoreObstacles === true;
        const obstacles = (!ignoreObstacles && Array.isArray(this.sidewalkObstacles)) ? this.sidewalkObstacles : [];

        const pointIsClear = (px, py) => {
            if (!obstacles.length) {
                return true;
            }

            for (const rect of obstacles) {
                if (rect && isPointInsideRect(px, py, rect)) {
                    return false;
                }
            }

            return true;
        };

        for (const rect of walkableRects) {
            if (!rect || !isPointInsideRect(x, y, rect)) {
                continue;
            }

            if (pointIsClear(x, y)) {
                return { x, y, inside: true };
            }

            const pushed = this._pushPointOutOfObstacles({ x, y }, rect);
            if (pointIsClear(pushed.x, pushed.y) && isPointInsideRect(pushed.x, pushed.y, rect)) {
                return { x: pushed.x, y: pushed.y, inside: true };
            }
        }

        let closest = { x, y, inside: false };
        let closestRect = null;
        let bestDist = Infinity;
        let bestClear = null;
        let bestClearDist = Infinity;

        for (const rect of walkableRects) {
            if (!rect) {
                continue;
            }

            const clamped = clampPointToRect(x, y, rect);
            const resolved = this._pushPointOutOfObstacles(clamped, rect);
            const resolvedInside = isPointInsideRect(resolved.x, resolved.y, rect);
            const isClear = pointIsClear(resolved.x, resolved.y);
            const dx = x - resolved.x;
            const dy = y - resolved.y;
            const distSq = dx * dx + dy * dy;

            if (distSq < bestDist) {
                bestDist = distSq;
                closest = { x: resolved.x, y: resolved.y, inside: resolvedInside && isClear };
                closestRect = rect;
            }

            if (isClear && distSq < bestClearDist) {
                bestClearDist = distSq;
                bestClear = { x: resolved.x, y: resolved.y, inside: resolvedInside };
            }
        }

        if (bestClear) {
            return { x: bestClear.x, y: bestClear.y, inside: bestClear.inside };
        }

        if (!pointIsClear(closest.x, closest.y) && closestRect) {
            const pushed = this._pushPointOutOfObstacles(closest, closestRect);
            const stillClear = pointIsClear(pushed.x, pushed.y);
            return {
                x: pushed.x,
                y: pushed.y,
                inside: stillClear && isPointInsideRect(pushed.x, pushed.y, closestRect),
            };
        }

        return closest;
    }

    /**
     * Schiebt einen Punkt aus Hindernissen heraus innerhalb eines Korridors.
     * Portiert aus pushPointOutOfObstacles() (Zeilen 12631-12697).
     */
    _pushPointOutOfObstacles(point, corridor) {
        const obstacles = Array.isArray(this.sidewalkObstacles) ? this.sidewalkObstacles : [];
        const startX = Number(point?.x ?? 0);
        const startY = Number(point?.y ?? 0);

        let resolved = {
            x: Number.isFinite(startX) ? startX : 0,
            y: Number.isFinite(startY) ? startY : 0,
        };

        if (!obstacles.length) {
            return corridor ? clampPointToRect(resolved.x, resolved.y, corridor) : resolved;
        }

        const corridorBounds = corridor ? resolveRectBounds(corridor) : null;
        const epsilon = 0.01;
        const maxIterations = obstacles.length * 2 + 4;

        for (let iteration = 0; iteration < maxIterations; iteration++) {
            let moved = false;

            for (const obstacle of obstacles) {
                const bounds = resolveRectBounds(obstacle);

                if (!bounds) {
                    continue;
                }

                if (!isPointInsideRect(resolved.x, resolved.y, bounds)) {
                    continue;
                }

                const distanceLeft = resolved.x - bounds.left;
                const distanceRight = bounds.right - resolved.x;
                const distanceTop = resolved.y - bounds.top;
                const distanceBottom = bounds.bottom - resolved.y;

                const minDistance = Math.min(distanceLeft, distanceRight, distanceTop, distanceBottom);

                if (minDistance === distanceLeft) {
                    resolved.x = bounds.left - epsilon;
                } else if (minDistance === distanceRight) {
                    resolved.x = bounds.right + epsilon;
                } else if (minDistance === distanceTop) {
                    resolved.y = bounds.top - epsilon;
                } else {
                    resolved.y = bounds.bottom + epsilon;
                }

                if (corridorBounds) {
                    resolved.x = Math.min(corridorBounds.right, Math.max(corridorBounds.left, resolved.x));
                    resolved.y = Math.min(corridorBounds.bottom, Math.max(corridorBounds.top, resolved.y));
                }

                moved = true;
            }

            if (!moved) {
                break;
            }
        }

        if (corridor && !isPointInsideRect(resolved.x, resolved.y, corridor)) {
            return clampPointToRect(resolved.x, resolved.y, corridor);
        }

        return resolved;
    }
}

// Export helpers for testing



// ═══════════════════════════════════════════════════════
// js/world/StreetDetails.js
// ═══════════════════════════════════════════════════════
/**
 * StreetDetails - Erstellt Strassendetails (Baeume, Baenke, Laternen, etc.).
 *
 * Portiert aus gta_old/overworld/js/overworld.js:
 *   createStreetDetails() Zeilen 3596-3777
 *
 * SSOT: Alle Strassendetail-Positionen hier zentralisiert.
 */

/** Standard-Strassenkonfiguration */
const DEFAULT_ROAD_HALF_WIDTH = 35;
const DEFAULT_SIDEWALK_WIDTH = 36;

/**
 * Erstellt alle Strassendetails (Baeume, Baenke, Laternen, Muelltonnen, etc.).
 *
 * @param {object} [config={}]
 * @param {number} [config.roadHalfWidth=35] - Halbe Strassenbreite
 * @param {number} [config.sidewalkWidth=36] - Buergersteigbreite
 * @returns {object} Detail-Objekt mit parkingLots, parkingBays, trees, benches, etc.
 */
function createStreetDetails(config = {}) {
    const roadHalfWidth = config.roadHalfWidth ?? DEFAULT_ROAD_HALF_WIDTH;
    const sidewalkWidth = config.sidewalkWidth ?? DEFAULT_SIDEWALK_WIDTH;

    const details = {
        parkingLots: [],
        parkingBays: [],
        trees: [],
        benches: [],
        bikeRacks: [],
        lamps: [],
        bins: [],
        busStops: [],
        puddles: [],
        planters: [],
    };

    // Deduplizierung fuer Baeume
    const treePositions = new Set();

    const addTree = (x, y, size = 30, variant = 0) => {
        const key = `${Math.round(x)}_${Math.round(y)}`;
        if (treePositions.has(key)) {
            return;
        }
        treePositions.add(key);
        details.trees.push({ x, y, size, variant });
    };

    // Baeume entlang horizontaler Strassen
    const horizontalRows = [900, 1700];
    for (const y of horizontalRows) {
        const upper = y - roadHalfWidth - sidewalkWidth / 2;
        const lower = y + roadHalfWidth + sidewalkWidth / 2;
        for (let x = 260; x <= 3240; x += 220) {
            addTree(x, upper, 30, (x / 220) % 3);
            addTree(x, lower, 32, ((x + 110) / 180) % 3);
        }
    }

    // Parkplatz
    details.parkingLots.push({
        x: 2490,
        y: 1500,
        width: 420,
        height: 140,
        rows: 2,
        slots: 6,
        aisle: 26,
        padding: 14,
        surfaceColor: '#2d2f34',
    });

    // Baeume entlang vertikaler Strassen
    const verticalColumns = [950, 1700, 2950, 3350];
    for (const x of verticalColumns) {
        const left = x - roadHalfWidth - sidewalkWidth / 2;
        const right = x + roadHalfWidth + sidewalkWidth / 2;
        for (let y = 260; y <= 2360; y += 220) {
            addTree(left, y, 28, (y / 210) % 3);
            addTree(right, y, 28, ((y + 90) / 190) % 3);
        }
    }

    // Baenke
    details.benches.push({ x: 1130, y: 1780, orientation: "horizontal" });
    details.benches.push({ x: 1280, y: 1780, orientation: "horizontal" });
    details.benches.push({ x: 1430, y: 1780, orientation: "horizontal" });
    details.benches.push({ x: 1560, y: 980, orientation: "vertical" });
    details.benches.push({ x: 560, y: 1720, orientation: "horizontal" });

    // Fahrradstaender
    details.bikeRacks.push({ x: 1220, y: 1885, orientation: "horizontal" });
    details.bikeRacks.push({ x: 1380, y: 1885, orientation: "horizontal" });
    details.bikeRacks.push({ x: 1520, y: 840, orientation: "vertical" });

    // Bushaltestellen
    details.busStops.push({ x: 1040, y: 1680, orientation: "horizontal", length: 140 });
    details.busStops.push({ x: 1860, y: 1680, orientation: "horizontal", length: 140 });

    // Strassenlampen
    const lampRows = [
        { y: 1860, start: 1100, end: 1620, step: 120 },
        { y: 820, start: 1180, end: 1540, step: 120 },
        { y: 2120, start: 1780, end: 2320, step: 140 },
        { y: 1180, start: 2760, end: 3260, step: 120 },
    ];
    for (const row of lampRows) {
        for (let x = row.start; x <= row.end; x += row.step) {
            details.lamps.push({ x, y: row.y });
        }
    }
    details.lamps.push({ x: 360, y: 860 });
    details.lamps.push({ x: 360, y: 1740 });

    // Muelltonnen
    details.bins.push({ x: 1180, y: 1760 });
    details.bins.push({ x: 1340, y: 1760 });
    details.bins.push({ x: 1500, y: 1760 });
    details.bins.push({ x: 560, y: 1700 });

    // Parkbuchten
    details.parkingBays.push({ x: 240, y: 870, width: 110, height: 42, orientation: "horizontal" });
    details.parkingBays.push({ x: 360, y: 870, width: 110, height: 42, orientation: "horizontal" });
    details.parkingBays.push({ x: 480, y: 870, width: 110, height: 42, orientation: "horizontal" });
    details.parkingBays.push({ x: 1880, y: 880, width: 120, height: 46, orientation: "horizontal" });
    details.parkingBays.push({ x: 2980, y: 1140, width: 140, height: 46, orientation: "horizontal" });

    // Pflanzkaesten
    details.planters.push({ x: 1160, y: 1840, width: 80, height: 32 });
    details.planters.push({ x: 1320, y: 1840, width: 80, height: 32 });
    details.planters.push({ x: 1480, y: 1840, width: 80, height: 32 });

    // Pfuetzen
    details.puddles.push({ x: 960, y: 880, radius: 26 });
    details.puddles.push({ x: 1620, y: 1680, radius: 32 });
    details.puddles.push({ x: 420, y: 1680, radius: 22 });

    return details;
}



// ═══════════════════════════════════════════════════════
// js/world/WorldGenerator.js
// ═══════════════════════════════════════════════════════
/**
 * WorldGenerator - Erstellt die gesamte Spielwelt (Gebaeude, NPCs, Fahrzeuge).
 *
 * Portiert aus gta_old/overworld/js/overworld.js:
 *   createCityBuildings()      Zeilen 3247-3595
 *   createDynamicAgents()      Zeilen 4550-4999
 *   createHouseVisitorNPCs()   Zeilen 3784-4169
 *
 * SSOT: Alle Welterzeugungs-Daten hier zentralisiert.
 * Gebaeude-Objekte werden ueber BuildingFactory erstellt,
 * NPC/Vehicle-Instanzen ueber NPC.js/Vehicle.js.
 */

// ---------------------------------------------------------------------------
// Residential-Blueprints (SSOT fuer alle Wohnhaus-Positionen)
// ---------------------------------------------------------------------------
const RESIDENTIAL_BLUEPRINTS = [
    { x: 280, y: 980, width: 250, height: 300, styleIndex: 0, floors: 6, roofGarden: true, balconyRhythm: 2, erker: true, walkwayExtension: 48, walkwaySpurLength: 220, walkwaySpurWidth: 22 },
    { x: 560, y: 960, width: 300, height: 280, styleIndex: 1, floors: 5, roofGarden: false, balconyRhythm: 3, walkwayExtension: 48, walkwaySpurLength: 220, walkwaySpurWidth: 22 },
    { x: 280, y: 1300, width: 240, height: 320, styleIndex: 3, floors: 4, roofGarden: true, balconyRhythm: 2 },
    { x: 560, y: 1310, width: 300, height: 300, styleIndex: 4, floors: 7, roofGarden: false, balconyRhythm: 4 },
    { x: 980, y: 960, width: 260, height: 260, styleIndex: 2, floors: 7, roofGarden: true, balconyRhythm: 3 },
    { x: 1260, y: 960, width: 280, height: 240, styleIndex: 5, floors: 5, roofGarden: false, balconyRhythm: 2, stepped: true },
    { x: 980, y: 1300, width: 260, height: 260, styleIndex: 0, floors: 5, roofGarden: true, balconyRhythm: 3 },
    { x: 1270, y: 1280, width: 340, height: 280, styleIndex: 1, floors: 6, roofGarden: true, balconyRhythm: 3, erker: true },
    { x: 1760, y: 320, width: 300, height: 320, styleIndex: 2, floors: 6, roofGarden: true, balconyRhythm: 2 },
    { x: 2080, y: 320, width: 300, height: 280, styleIndex: 4, floors: 5, roofGarden: false, balconyRhythm: 3 },
    { x: 1760, y: 660, width: 520, height: 180, styleIndex: 5, floors: 4, roofGarden: true, balconyRhythm: 2 },
    { x: 1760, y: 980, width: 300, height: 260, styleIndex: 1, floors: 6, roofGarden: true, balconyRhythm: 3 },
    { x: 2080, y: 980, width: 300, height: 260, styleIndex: 3, floors: 5, roofGarden: false, balconyRhythm: 2 },
    { x: 1760, y: 1320, width: 300, height: 300, styleIndex: 2, floors: 7, roofGarden: true, balconyRhythm: 3, erker: true },
    { x: 2080, y: 1320, width: 300, height: 300, styleIndex: 0, floors: 5, roofGarden: true, balconyRhythm: 2 },
    { x: 1760, y: 1790, width: 300, height: 320, styleIndex: 4, floors: 5, roofGarden: true, balconyRhythm: 2 },
    { x: 2080, y: 1790, width: 300, height: 320, styleIndex: 5, floors: 4, roofGarden: true, balconyRhythm: 3 },
    { x: 1760, y: 2120, width: 300, height: 200, styleIndex: 3, floors: 5, roofGarden: true, balconyRhythm: 2 },
    { x: 2080, y: 2120, width: 300, height: 200, styleIndex: 1, floors: 6, roofGarden: false, balconyRhythm: 3 },
    { x: 280, y: 1790, width: 260, height: 320, styleIndex: 2, floors: 5, roofGarden: true, balconyRhythm: 2 },
    { x: 580, y: 1790, width: 260, height: 320, styleIndex: 5, floors: 4, roofGarden: true, balconyRhythm: 3 },
    { x: 280, y: 2120, width: 260, height: 200, styleIndex: 0, floors: 5, roofGarden: true, balconyRhythm: 3 },
    { x: 580, y: 2120, width: 260, height: 200, styleIndex: 4, floors: 6, roofGarden: false, balconyRhythm: 2, weaponShop: true },
];

// ---------------------------------------------------------------------------
// NPC-Paletten fuer Haus-Besucher (SSOT)
// ---------------------------------------------------------------------------
const VISITOR_PALETTES = [
    { head: "#f2d1b3", torso: "#355070", limbs: "#2a3d66", accent: "#b1e5f2", hair: "#2f1b25" },
    { head: "#f8cbbb", torso: "#6d597a", limbs: "#463764", accent: "#ffb4a2", hair: "#2d142c" },
    { head: "#f6d5a5", torso: "#588157", limbs: "#3a5a40", accent: "#a3b18a", hair: "#5b3711" },
    { head: "#f1d3ce", torso: "#0081a7", limbs: "#005f73", accent: "#83c5be", hair: "#0d1b2a" },
    { head: "#f7d6bf", torso: "#bc4749", limbs: "#6a040f", accent: "#fcbf49", hair: "#432818" },
    { head: "#efd3b4", torso: "#2a9d8f", limbs: "#1d6f6a", accent: "#e9c46a", hair: "#264653" },
    { head: "#f2ceb9", torso: "#4361ee", limbs: "#3a0ca3", accent: "#4cc9f0", hair: "#1a1b41" },
    { head: "#f9d5c4", torso: "#f3722c", limbs: "#d8572a", accent: "#f8961e", hair: "#7f5539" },
    { head: "#f5d2bc", torso: "#2b9348", limbs: "#007f5f", accent: "#80ed99", hair: "#2f2f2f" },
    { head: "#f0cfd0", torso: "#9d4edd", limbs: "#7b2cbf", accent: "#c77dff", hair: "#3c096c" },
];

// ---------------------------------------------------------------------------
// Standard Tag/Nacht Phasen-Dauern
// ---------------------------------------------------------------------------
const DEFAULT_PHASE_DURATIONS = [
    { id: "day", duration: 300000 },
    { id: "dusk", duration: 120000 },
    { id: "night", duration: 300000 },
    { id: "dawn", duration: 120000 },
];

// ---------------------------------------------------------------------------
// WorldGenerator
// ---------------------------------------------------------------------------
class WorldGenerator {

    /**
     * @param {object} [config={}]
     * @param {Array}  [config.houseStyles] - Hausstile (aus HouseStyles.js)
     * @param {boolean} [config.enableHouseResidents=true]
     * @param {object} [config.dayNightCycle] - Tag/Nacht-Zyklus-Konfiguration
     * @param {object} [config.roadNetwork] - RoadNetwork-Instanz (fuer Sidewalk-Projektion)
     * @param {number} [config.sidewalkWidth=36]
     */
    constructor(config = {}) {
        this.houseStyles = config.houseStyles ?? createHouseStyles();
        this.enableHouseResidents = config.enableHouseResidents !== false;
        this.dayNightCycle = config.dayNightCycle ?? null;
        this.roadNetwork = config.roadNetwork ?? null;
        this.sidewalkWidth = config.sidewalkWidth ?? 36;
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /**
     * Generiert die komplette Spielwelt.
     *
     * @returns {{ buildings: Array, streetDetails: object, dynamicAgents: { npcs: Array<NPC>, vehicles: Array<Vehicle> } }}
     */
    generateWorld() {
        const buildings = this._createCityBuildings();
        const streetDetails = createStreetDetails({
            roadHalfWidth: 35,
            sidewalkWidth: this.sidewalkWidth,
        });
        const dynamicAgents = this._createDynamicAgents(buildings);

        return { buildings, streetDetails, dynamicAgents };
    }

    // -----------------------------------------------------------------------
    // createCityBuildings - Portiert aus Zeilen 3247-3595
    // -----------------------------------------------------------------------

    _createCityBuildings() {
        const buildings = [];

        // Polizeihauptquartier
        buildings.push({
            x: 320, y: 340, width: 520, height: 420,
            name: "Polizeihauptquartier", type: "police", interactive: true,
        });

        // Casino Tower mit Podium-Collision
        const casinoTower = {
            x: 3040, y: 860, width: 238, height: 560,
            name: "Starlight Casino Tower", type: "casino", interactive: true,
        };
        const casinoPodium = computeCasinoPodiumGeometry(casinoTower);
        casinoTower.collisionRects = [
            { x: casinoPodium.podiumX, y: casinoPodium.podiumY, width: casinoPodium.podiumWidth, height: casinoPodium.podiumHeight + casinoPodium.plinthHeight },
        ];
        buildings.push(casinoTower);

        // Motel
        buildings.push({
            x: 2540, y: 320, width: 340, height: 220,
            name: RENTAL_CATALOG.motel.name, type: "motel", interactive: true,
        });

        // Apartment-Komplex
        buildings.push({
            x: 1080, y: 320, width: 300, height: 400,
            name: RENTAL_CATALOG.apartmentComplex.name, type: "apartmentComplex", interactive: true,
        });

        // Downtown Hochhaeuser
        buildings.push({
            x: 2540, y: 940, width: 160, height: 540,
            name: "Aurora Financial Center", type: "officeTower", interactive: false,
            collisionRects: [{ x: 2540, y: 1360, width: 160, height: 120 }],
        });
        buildings.push({
            x: 2720, y: 980, width: 150, height: 500,
            name: "Skyline Exchange", type: "residentialTower", interactive: false,
            collisionRects: [{ x: 2720, y: 1360, width: 150, height: 120 }],
        });

        // Mixed-Use Block
        buildings.push({
            x: 1000, y: 1820, width: 600, height: 420,
            name: "Aurora Quartier", type: "mixedUse", interactive: true,
            subUnits: [
                { label: "Aurora Restaurant", accent: "#f78f5c" },
                { label: "Stadtmarkt", accent: "#7fd491" },
                { label: "Polizeiposten", accent: "#5da1ff" },
            ],
        });

        // Immobilienmakler
        buildings.push({
            x: 2920, y: 1820, width: 200, height: 160,
            name: "Immobilienmakler Schmidt", type: "realEstateAgent", interactive: true,
        });

        // Bungalow (kaufbar ueber Makler)
        buildings.push({
            x: 2920, y: 2100, width: 280, height: 200,
            name: PROPERTY_CATALOG.bungalow.name, type: "bungalow", interactive: true,
        });

        // Wohnhaeuser aus Blueprints
        let houseCounter = 1;
        for (const blueprint of RESIDENTIAL_BLUEPRINTS) {
            if (blueprint.weaponShop) {
                buildings.push({
                    x: blueprint.x, y: blueprint.y,
                    width: blueprint.width, height: blueprint.height,
                    name: "Ammu-Nation", type: "weaponShop", interactive: true,
                });
                continue;
            }

            const styleIndex = blueprint.styleIndex % this.houseStyles.length;
            const lotPaddingBase = Math.min(36, Math.min(blueprint.width, blueprint.height) * 0.22);
            const maxInset = Math.max(0, Math.min(blueprint.width, blueprint.height) / 2 - 20);
            const collisionPadding = Math.max(0, Math.min(lotPaddingBase * 0.95, maxInset));

            buildings.push({
                x: blueprint.x, y: blueprint.y,
                width: blueprint.width, height: blueprint.height,
                lotPadding: lotPaddingBase,
                collisionPadding,
                name: `Wohnhaus ${houseCounter}`,
                type: "house",
                interactive: true,
                colorIndex: styleIndex,
                variant: {
                    styleIndex,
                    floors: blueprint.floors,
                    roofGarden: blueprint.roofGarden,
                    balconyRhythm: blueprint.balconyRhythm,
                    erker: Boolean(blueprint.erker),
                    stepped: Boolean(blueprint.stepped),
                    walkwayExtension: blueprint.walkwayExtension ?? 0,
                    walkwaySpurLength: blueprint.walkwaySpurLength ?? 0,
                    walkwaySpurWidth: blueprint.walkwaySpurWidth ?? 0,
                },
            });
            houseCounter++;
        }

        // IDs und Metriken zuweisen
        let buildingIdCounter = 1;
        for (const building of buildings) {
            if (!building) {
                continue;
            }

            building.id = `building_${buildingIdCounter++}`;

            if (building.type === "house") {
                const metrics = computeHouseMetrics(building, this.houseStyles);
                if (metrics) {
                    building.metrics = metrics;
                    building.entrance = metrics.entrance;
                    building.approach = metrics.approach;
                    building.interiorPoint = metrics.interior;

                    if (!building.bounds) {
                        building.bounds = metrics.bounds;
                    }

                    const houseBodyWidth = Math.max(0, Number(metrics.houseWidth ?? 0));
                    const houseBodyHeight = Math.max(0, Number(metrics.houseHeight ?? 0));

                    if (houseBodyWidth > 0 && houseBodyHeight > 0) {
                        const houseBodyX = Number(building.x ?? 0) + Number(metrics.houseX ?? 0);
                        const houseBodyY = Number(building.y ?? 0) + Number(metrics.houseY ?? 0);
                        const variantDetails = building.variant ?? {};
                        const walkway = metrics.walkway ?? {};
                        const walkwayHeight = Math.max(0, Number(walkway.height ?? 0));
                        const walkwayExtension = Math.max(0, Number(variantDetails.walkwayExtension ?? 0));
                        const frontDepth = Math.max(0, Number(metrics.frontDepth ?? walkwayHeight));
                        const frontBuffer = Math.max(14, Math.min(houseBodyHeight - 4, frontDepth + walkwayExtension));
                        const clippedHeight = Math.max(0, houseBodyHeight - frontBuffer);

                        if (clippedHeight > 0) {
                            building.collisionRects = [{
                                x: houseBodyX,
                                y: houseBodyY,
                                width: houseBodyWidth,
                                height: clippedHeight,
                            }];
                        }
                    }
                }
            }
        }

        return buildings;
    }

    // -----------------------------------------------------------------------
    // createDynamicAgents - Portiert aus Zeilen 4550-4999
    // -----------------------------------------------------------------------

    /**
     * @param {Array} buildings
     * @returns {{ npcs: Array<NPC>, vehicles: Array<Vehicle> }}
     */
    _createDynamicAgents(buildings) {
        // Casino-Podium Pfad berechnen
        const casinoTower = Array.isArray(buildings) ? buildings.find((b) => b && b.type === "casino") : null;
        let casinoPodiumPlan = null;

        if (casinoTower) {
            const { podiumWidth, podiumHeight, podiumX, podiumY } = computeCasinoPodiumGeometry(casinoTower);
            const margin = Math.max(18, Math.min(32, this.sidewalkWidth));
            const topY = podiumY + margin;
            const bottomY = podiumY + podiumHeight - margin;
            const leftX = podiumX + margin;
            const rightX = podiumX + podiumWidth - margin;

            casinoPodiumPlan = {
                path: [
                    { x: leftX, y: topY, wait: 6 },
                    { x: rightX, y: topY, wait: 6 },
                    { x: rightX, y: bottomY, wait: 6 },
                    { x: leftX, y: bottomY, wait: 6 },
                ],
                bounds: {
                    left: podiumX + margin / 1.5,
                    right: podiumX + podiumWidth - margin / 1.5,
                    top: podiumY + margin / 1.5,
                    bottom: podiumY + podiumHeight - margin / 1.5,
                },
            };
        }

        // Statische NPCs
        const npcConfigs = [
            {
                palette: { head: "#f1d2b6", torso: "#3c6e71", limbs: "#284b52", accent: "#f7ede2", hair: '#3b2c1e' },
                spawnPoint: { x: 1140, y: 1647 },
                waypoints: [
                    { x: 1140, y: 1647, wait: 0 },
                    { x: 1300, y: 1647, wait: 6 },
                ],
                dynamicNavigation: true, stayOnSidewalks: true, speed: 1.25,
            },
            {
                palette: { head: "#f8cfd2", torso: "#6a4c93", limbs: "#413c58", accent: "#ffb5a7", hair: '#2e1f36' },
                spawnPoint: { x: 3060, y: 1647 },
                waypoints: [
                    { x: 3060, y: 1647, wait: 0 },
                    { x: 3200, y: 1647, wait: 6 },
                ],
                dynamicNavigation: true, stayOnSidewalks: true, speed: 1.05,
            },
            {
                palette: { head: "#fbe2b4", torso: "#ff914d", limbs: "#583101", accent: "#ffd166", hair: '#3c2a1f' },
                spawnPoint: { x: 660, y: 1753 },
                waypoints: [
                    { x: 660, y: 1753, wait: 0 },
                    { x: 500, y: 1753, wait: 6 },
                ],
                dynamicNavigation: true, stayOnSidewalks: true, speed: 1.35,
            },
            {
                palette: { head: "#f0cfa0", torso: "#264653", limbs: "#1d3557", accent: "#f4a261", hair: '#2a1d13' },
                spawnPoint: { x: 1335, y: 1753 },
                waypoints: [
                    { x: 1335, y: 1753, wait: 0 },
                    { x: 1500, y: 1753, wait: 6 },
                ],
                dynamicNavigation: true, stayOnSidewalks: true, speed: 1.18,
            },
            {
                palette: { head: "#f3d7c6", torso: "#274060", limbs: "#1b2845", accent: "#7dbad1", hair: '#0f1c2c' },
                spawnPoint: { x: 2920, y: 847 },
                waypoints: [
                    { x: 2920, y: 847, wait: 0 },
                    { x: 2700, y: 847, wait: 6 },
                ],
                dynamicNavigation: true, stayOnSidewalks: true, speed: 1.08,
            },
            {
                palette: { head: "#f2d0b5", torso: "#7a8b99", limbs: "#45525f", accent: "#d9ed92", hair: '#2f1d18' },
                spawnPoint: { x: 570, y: 847 },
                waypoints: [
                    { x: 570, y: 847, wait: 0 },
                    { x: 400, y: 847, wait: 6 },
                ],
                dynamicNavigation: true, stayOnSidewalks: true, speed: 1.12,
            },
            {
                palette: { head: "#f9d6c1", torso: "#bc4749", limbs: "#6a040f", accent: "#ffb703", hair: '#311019' },
                spawnPoint: { x: 1910, y: 1647 },
                waypoints: [
                    { x: 1910, y: 1647, wait: 0 },
                    { x: 2100, y: 1647, wait: 6 },
                ],
                dynamicNavigation: true, stayOnSidewalks: true, speed: 1.22,
            },
            {
                palette: { head: "#f5ccb2", torso: "#457b9d", limbs: "#1d3557", accent: "#a8dadc", hair: '#16324f' },
                spawnPoint: { x: 2410, y: 2347 },
                waypoints: [
                    { x: 2410, y: 2347, wait: 0 },
                    { x: 2600, y: 2347, wait: 6 },
                ],
                dynamicNavigation: true, stayOnSidewalks: true, speed: 1.14,
            },
            {
                palette: { head: "#f4ceb8", torso: "#2a9d8f", limbs: "#1f6f78", accent: "#e9c46a", hair: '#274046' },
                spawnPoint: { x: 510, y: 2453 },
                waypoints: [
                    { x: 510, y: 2453, wait: 0 },
                    { x: 700, y: 2453, wait: 6 },
                ],
                dynamicNavigation: true, stayOnSidewalks: true, speed: 1.02,
            },
            {
                palette: { head: "#f7d6bf", torso: "#1b263b", limbs: "#0d1b2a", accent: "#415a77", hair: '#0b132b' },
                spawnPoint: { x: 3155, y: 1753 },
                waypoints: [
                    { x: 3155, y: 1753, wait: 0 },
                    { x: 3300, y: 1753, wait: 6 },
                ],
                dynamicNavigation: true, stayOnSidewalks: true, speed: 1.35,
            },
        ];

        const npcs = npcConfigs.map((cfg) => new NPC(cfg));

        // Casino-Podium NPC
        if (casinoPodiumPlan) {
            npcs.push(new NPC({
                palette: { head: "#f4d7c8", torso: "#1b3a4b", limbs: "#12263a", accent: "#9ad1d4", hair: '#261d1a' },
                waypoints: casinoPodiumPlan.path,
                bounds: casinoPodiumPlan.bounds,
                speed: 1.08,
                stayOnSidewalks: true,
            }));
        }

        // Haus-Besucher NPCs
        const houseVisitors = this._createHouseVisitorNPCs(buildings);
        if (houseVisitors.length) {
            npcs.push(...houseVisitors);
        }

        // Fahrzeuge
        const vehicles = [
            new Vehicle({
                baseColor: "#d35400", accentColor: "#f5c16f",
                width: 96, height: 44, speed: 2.6,
                path: [
                    { x: 240, y: 1700, wait: 0 },
                    { x: 3320, y: 1700, wait: 18 },
                ],
            }),
            new Vehicle({
                baseColor: "#2980b9", accentColor: "#8fd3fe",
                width: 110, height: 48, speed: 2.4,
                path: [
                    { x: 1700, y: 2600, wait: 20 },
                    { x: 1700, y: 260, wait: 24 },
                ],
            }),
            new Vehicle({
                baseColor: "#6c5ce7", accentColor: "#fd79a8",
                width: 102, height: 46, speed: 2.2,
                path: [
                    { x: 2450, y: 1700, wait: 12 },
                    { x: 3350, y: 1700, wait: 10 },
                    { x: 3350, y: 2400, wait: 12 },
                    { x: 2450, y: 2400, wait: 10 },
                ],
            }),
        ];

        return { npcs, vehicles };
    }

    // -----------------------------------------------------------------------
    // createHouseVisitorNPCs - Portiert aus Zeilen 3784-4169
    // -----------------------------------------------------------------------

    /**
     * @param {Array} buildings
     * @returns {Array<NPC>}
     */
    _createHouseVisitorNPCs(buildings) {
        if (!this.enableHouseResidents) {
            return [];
        }

        if (!Array.isArray(buildings)) {
            return [];
        }

        const houses = buildings.filter(
            (b) => b && b.type === "house" && b.entrance && b.approach && b.interiorPoint
        );

        if (!houses.length) {
            return [];
        }

        // Tag/Nacht-Zyklus Timing
        const cycle = this.dayNightCycle ?? null;
        const phaseDurations = (Array.isArray(cycle?.phases) && cycle.phases.length)
            ? cycle.phases
            : DEFAULT_PHASE_DURATIONS;

        const totalCycleMs = phaseDurations.reduce(
            (sum, phase) => sum + Math.max(0, Number(phase.duration) || 0), 0
        );
        const halfDayMs = Math.max(180000, totalCycleMs > 0 ? totalCycleMs / 2 : 360000);

        const framesFromMs = (ms, minFrames = 60) => {
            const frames = Math.round((Math.max(0, Number(ms) || 0) / 1000) * 60);
            return Math.max(minFrames, frames);
        };

        const distanceSq = (a, b) => {
            if (!a || !b) return Infinity;
            const dx = (a.x ?? 0) - (b.x ?? 0);
            const dy = (a.y ?? 0) - (b.y ?? 0);
            return dx * dx + dy * dy;
        };

        const visitors = [];

        for (let index = 0; index < houses.length; index++) {
            const house = houses[index];
            const metrics = house.metrics ?? computeHouseMetrics(house, this.houseStyles);

            if (!metrics) {
                continue;
            }

            const approach = metrics.approach ?? house.approach;
            const entrance = metrics.entrance ?? house.entrance;
            const interior = metrics.interior ?? house.interiorPoint;
            const doorWorld = metrics.door?.world ?? null;

            if (!approach || !entrance || !interior || !doorWorld) {
                continue;
            }

            const walkway = metrics.walkway ?? { width: 32, height: 18 };
            const direction = index % 2 === 0 ? 1 : -1;

            const door = {
                x: doorWorld.x,
                y: doorWorld.bottom ?? doorWorld.y,
            };

            const seedX = (Number(house.x ?? 0) + index * 37.17) * 0.0031;
            const seedY = (Number(house.y ?? 0) + index * 19.91) * 0.0042;
            const rng = pseudoRandom2D(seedX, seedY);

            const baseHalfFrames = framesFromMs(halfDayMs, 1200);
            const insideFrames = Math.max(1200, Math.round(baseHalfFrames * (0.85 + (1 - rng) * 0.3)));
            const outsideFrames = Math.max(900, Math.round(baseHalfFrames * (0.85 + rng * 0.3)));

            const palette = VISITOR_PALETTES[index % VISITOR_PALETTES.length];
            const stride = Math.max(140, (walkway.width ?? 32) * 5.5);
            const travelDepth = Math.max(120, (walkway.height ?? 18) * 8);

            // Sidewalk-Projektion (wenn RoadNetwork verfuegbar)
            const project = (dx, dy) => {
                if (this.roadNetwork) {
                    const projected = this.roadNetwork.findNearestSidewalkSpot(
                        approach.x + dx, approach.y + dy
                    );
                    if (projected && Number.isFinite(projected.x) && Number.isFinite(projected.y)) {
                        return { x: projected.x, y: projected.y };
                    }
                }
                // Fallback: direkte Position
                return { x: approach.x + dx, y: approach.y + dy };
            };

            const pickUniqueSidewalkPoint = (attempts, reference, fallback) => {
                for (const [dx, dy] of attempts) {
                    const candidate = project(dx, dy);
                    if (!candidate) continue;
                    if (reference && distanceSq(candidate, reference) < 64) continue;
                    return candidate;
                }
                return fallback;
            };

            const defaultSidewalk = project(0, 0) ?? { x: approach.x, y: approach.y };

            const sidewalkStart = pickUniqueSidewalkPoint([
                [direction * stride * 0.45, (walkway.height ?? 18) * 0.15],
                [direction * stride * 0.35, 0],
                [direction * stride * 0.55, (walkway.height ?? 18) * 0.35],
            ], null, defaultSidewalk) ?? defaultSidewalk;

            const plazaPoint = pickUniqueSidewalkPoint([
                [direction * stride, travelDepth],
                [direction * stride * 0.95, travelDepth * 1.1],
                [direction * stride * 0.8, travelDepth * 0.9],
                [direction * stride * 0.6, travelDepth],
            ], sidewalkStart, sidewalkStart) ?? sidewalkStart;

            let returnPoint = pickUniqueSidewalkPoint([
                [-direction * stride * 0.3, travelDepth * 0.6],
                [0, travelDepth * 0.75],
                [-direction * stride * 0.45, travelDepth * 0.9],
                [-direction * stride * 0.2, travelDepth * 0.5],
            ], plazaPoint, sidewalkStart) ?? sidewalkStart;

            if (distanceSq(returnPoint, plazaPoint) < 64) {
                const alternate = project(-direction * stride * 0.15, travelDepth * 0.4);
                if (alternate) {
                    returnPoint = alternate;
                }
            }

            // Wait-Zeiten berechnen
            const minWait = 90;
            let walkwayOutWait = Math.max(minWait, Math.round(outsideFrames * 0.12));
            let walkwayBackWait = Math.max(minWait, Math.round(outsideFrames * 0.1));
            let porchWait = Math.max(minWait, Math.round(outsideFrames * 0.08));
            let plazaWait = outsideFrames - walkwayOutWait - walkwayBackWait - porchWait;

            if (plazaWait < minWait * 2) {
                const deficit = (minWait * 2) - plazaWait;
                plazaWait = minWait * 2;
                const adjustable = walkwayOutWait + walkwayBackWait + porchWait;
                if (adjustable > deficit && adjustable > 0) {
                    const ratio = deficit / adjustable;
                    walkwayOutWait = Math.max(minWait, Math.round(walkwayOutWait - walkwayOutWait * ratio));
                    walkwayBackWait = Math.max(minWait, Math.round(walkwayBackWait - walkwayBackWait * ratio));
                    porchWait = Math.max(minWait, Math.round(porchWait - porchWait * ratio));
                }
            }

            const totalWait = walkwayOutWait + walkwayBackWait + porchWait + plazaWait;
            if (totalWait > outsideFrames) {
                const over = totalWait - outsideFrames;
                plazaWait = Math.max(minWait * 2, plazaWait - over);
            }

            const entranceOut = { x: entrance.x, y: entrance.y, wait: 18 };
            const entranceReturn = {
                x: entrance.x, y: entrance.y,
                wait: Math.max(minWait, Math.round(outsideFrames * 0.06)),
            };

            const lateralOffset = Math.min(18, (walkway.width ?? 32) * 0.35) * direction;
            const porchSpot = {
                x: entrance.x + lateralOffset,
                y: entrance.y + (walkway.height ?? 18) * 0.4,
                wait: porchWait,
            };

            const path = [
                { x: interior.x, y: interior.y, wait: insideFrames, interior: true, buildingId: house.id, allowOffSidewalk: true },
                { x: door.x, y: door.y, wait: 6, action: 'exit', buildingId: house.id, allowOffSidewalk: true },
                entranceOut,
                { x: sidewalkStart.x, y: sidewalkStart.y, wait: walkwayOutWait },
                { x: plazaPoint.x, y: plazaPoint.y, wait: plazaWait },
                { x: returnPoint.x, y: returnPoint.y, wait: walkwayBackWait },
                entranceReturn,
                porchSpot,
                { x: door.x, y: door.y, wait: 6, action: 'enter', buildingId: house.id, allowOffSidewalk: true },
            ];

            const bounds = house.bounds ?? metrics.bounds;
            const speed = 0.98 + rng * 0.32;

            const npc = new NPC({
                palette,
                speed,
                stayOnSidewalks: true,
                ignoreSidewalkObstacles: true,
                waypoints: path,
                bounds,
            });

            npc.home = {
                buildingId: house.id,
                entrance: { x: entrance.x, y: entrance.y },
                approach: { x: approach.x, y: approach.y },
                interior: { x: interior.x, y: interior.y },
                door: { x: door.x, y: door.y },
            };

            npc.homeSchedule = { insideFrames, outsideFrames };
            npc.houseResident = true;
            npc.homeId = house.id;
            npc.homeBounds = bounds
                ? { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom }
                : null;

            visitors.push(npc);
        }

        return visitors;
    }

    // -----------------------------------------------------------------------
}




// ═══════════════════════════════════════════════════════
// js/systems/InputSystem.js
// ═══════════════════════════════════════════════════════
/**
 * InputSystem — Keyboard- und Maus-Eingaben
 * Portiert aus gta_old/overworld/js/overworld.js setupInput() (Z.456-687)
 * und updateMouseWorldPosition() (Z.2517-2532)
 */
class InputSystem {

    /**
     * @param {HTMLCanvasElement} canvas
     */
    constructor(canvas) {
        this.canvas = canvas;

        // Keyboard-State
        this.keys = {};           // aktuelle Taste gedrückt
        this._justPressed = {};   // einmalig pro Frame true
        this._justPressedConsumed = {}; // schon abgefragt in diesem Frame

        // Maus-State
        this.mouse = { x: 0, y: 0, worldX: 0, worldY: 0, down: false };
        this._fireJustPressed = false;
        this._fireJustPressedConsumed = false;

        this._bindEvents();
    }

    // ───────────────────── Event-Bindings ─────────────────────

    _bindEvents() {
        document.addEventListener("keydown", (e) => {
            const key = e.key.toLowerCase();
            if (!this.keys[key]) {
                // Taste war vorher nicht gedrückt → justPressed setzen
                this._justPressed[key] = true;
                this._justPressedConsumed[key] = false;
            }
            this.keys[key] = true;
        });

        document.addEventListener("keyup", (e) => {
            const key = e.key.toLowerCase();
            this.keys[key] = false;
            this._justPressed[key] = false;
        });

        this.canvas.addEventListener("mousemove", (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mouse.x = e.clientX - rect.left;
            this.mouse.y = e.clientY - rect.top;
        });

        this.canvas.addEventListener("mousedown", (e) => {
            if (e.button === 0) {
                this.mouse.down = true;
                this._fireJustPressed = true;
                this._fireJustPressedConsumed = false;
            }
        });

        document.addEventListener("mouseup", (e) => {
            if (e.button === 0) {
                this.mouse.down = false;
                this._fireJustPressed = false;
            }
        });
    }

    // ───────────────────── Abfragen ─────────────────────

    /** Taste momentan gehalten? */
    isKeyDown(key) {
        return !!this.keys[key.toLowerCase()];
    }

    /** Taste in diesem Frame erstmals gedrückt? (nur einmal true pro Tastendruck) */
    isKeyPressed(key) {
        const k = key.toLowerCase();
        if (this._justPressed[k] && !this._justPressedConsumed[k]) {
            this._justPressedConsumed[k] = true;
            return true;
        }
        return false;
    }

    /**
     * Bewegungsvektor aus WASD / Pfeiltasten, normalisiert.
     * @returns {{dx: number, dy: number}}
     */
    getMovementVector() {
        let dx = 0;
        let dy = 0;

        if (this.keys["w"] || this.keys["arrowup"])    dy -= 1;
        if (this.keys["s"] || this.keys["arrowdown"])  dy += 1;
        if (this.keys["a"] || this.keys["arrowleft"])  dx -= 1;
        if (this.keys["d"] || this.keys["arrowright"]) dx += 1;

        // Normalisieren bei Diagonalbewegung
        if (dx !== 0 && dy !== 0) {
            const len = Math.sqrt(dx * dx + dy * dy);
            dx /= len;
            dy /= len;
        }

        return { dx, dy };
    }

    /** Shift gedrückt → Sprint */
    isSprinting() {
        return !!this.keys["shift"];
    }

    /**
     * Maus-Weltposition (erfordert vorheriges updateMouseWorldPosition).
     * @returns {{x: number, y: number}}
     */
    getMouseWorldPosition() {
        return { x: this.mouse.worldX, y: this.mouse.worldY };
    }

    /** Linke Maustaste in diesem Frame erstmals gedrückt? */
    isFirePressed() {
        if (this._fireJustPressed && !this._fireJustPressedConsumed) {
            this._fireJustPressedConsumed = true;
            return true;
        }
        return false;
    }

    /** Linke Maustaste gehalten? */
    isFireDown() {
        return this.mouse.down;
    }

    // ───────────────────── Frame-Update ─────────────────────

    /**
     * Maus-Weltkoordinaten aktualisieren.
     * Portiert aus updateMouseWorldPosition() (Z.2517-2532).
     *
     * @param {object} camera  - CameraSystem-Instanz (braucht x, y)
     * @param {object} [interiorOffset] - optional {originX, originY} für Interior-Szenen
     */
    updateMouseWorldPosition(camera, interiorOffset) {
        if (interiorOffset) {
            this.mouse.worldX = this.mouse.x - interiorOffset.originX;
            this.mouse.worldY = this.mouse.y - interiorOffset.originY;
            return;
        }
        const zoom = camera.zoom || 1;
        this.mouse.worldX = this.mouse.x / zoom + camera.x;
        this.mouse.worldY = this.mouse.y / zoom + camera.y;
    }

    /**
     * Am Ende jedes Frames aufrufen — setzt justPressed-Flags zurück.
     */
    update() {
        // Alle justPressed-Flags löschen
        for (const key in this._justPressed) {
            this._justPressed[key] = false;
            this._justPressedConsumed[key] = false;
        }
        this._fireJustPressed = false;
        this._fireJustPressedConsumed = false;
    }
}



// ═══════════════════════════════════════════════════════
// js/systems/MovementSystem.js
// ═══════════════════════════════════════════════════════
/**
 * MovementSystem - Verarbeitet Entity-Bewegung pro Frame.
 *
 * Berechnet Zielpositionen basierend auf Velocity/Target und delegiert
 * die tatsaechliche Positionsaenderung an EntityMover.
 *
 * WICHTIG: Dieses System setzt NIEMALS entity.x/y direkt.
 * Alle Positionsaenderungen laufen ueber EntityMover.move().
 */

class MovementSystem {
    /**
     * @param {import('../core/EntityMover.js').EntityMover} entityMover
     */
    constructor(entityMover) {
        this.entityMover = entityMover;
    }

    /**
     * Aktualisiert alle Entities fuer diesen Frame.
     *
     * @param {Array} entities - Liste aller beweglichen Entities
     * @param {number} deltaTime - Zeit seit letztem Frame in Sekunden
     */
    update(entities, deltaTime) {
        if (!Array.isArray(entities) || !entities.length || !deltaTime) {
            return;
        }

        for (const entity of entities) {
            if (!entity) {
                continue;
            }

            // Entities die eingefroren/inaktiv sind ueberspringen
            if (entity.frozen || entity.inactive) {
                continue;
            }

            this._updateEntity(entity, deltaTime);
        }
    }

    /**
     * Berechnet die Zielposition einer Entity und bewegt sie ueber EntityMover.
     *
     * Unterstuetzt zwei Bewegungsmodi:
     * 1. Velocity-basiert: entity hat vx/vy (Pixel pro Sekunde)
     * 2. Target-basiert:   entity hat targetX/targetY und speed
     *
     * @param {Object} entity
     * @param {number} deltaTime
     */
    _updateEntity(entity, deltaTime) {
        let targetX = entity.x;
        let targetY = entity.y;

        // Modus 1: Direkte Velocity (vx/vy in Pixel/Sekunde)
        if (entity.vx !== undefined || entity.vy !== undefined) {
            const vx = Number(entity.vx) || 0;
            const vy = Number(entity.vy) || 0;

            if (vx === 0 && vy === 0) {
                return; // Keine Bewegung noetig
            }

            targetX = entity.x + vx * deltaTime;
            targetY = entity.y + vy * deltaTime;
        }
        // Modus 2: Target-basiert (bewege dich Richtung targetX/targetY)
        else if (entity.targetX !== undefined && entity.targetY !== undefined) {
            const speed = Number(entity.speed) || 0;

            if (speed <= 0) {
                return;
            }

            const dist = distanceBetween(entity.x, entity.y, entity.targetX, entity.targetY);

            if (dist < 1) {
                // Ziel erreicht
                entity.targetX = undefined;
                entity.targetY = undefined;
                return;
            }

            const step = Math.min(speed * deltaTime, dist);
            const ratio = step / dist;

            targetX = entity.x + (entity.targetX - entity.x) * ratio;
            targetY = entity.y + (entity.targetY - entity.y) * ratio;
        } else {
            // Keine Bewegungsdaten - nichts tun
            return;
        }

        // Delegiere an EntityMover (SSOT fuer Positionsaenderungen)
        this.entityMover.move(entity, targetX, targetY, {
            ignoreSidewalk: entity.ignoreSidewalkConstraint || false,
        });
    }
}



// ═══════════════════════════════════════════════════════
// js/systems/CollisionSystem.js
// ═══════════════════════════════════════════════════════
/**
 * CollisionSystem - Verwaltet alle Kollisionspruefungen und -aufloesungen.
 * Portiert aus OverworldGame: checkBuildingCollisions, resolveCircleRectCollision,
 * isPointInsideAnyCollider, collectVehicleColliders.
 */

class CollisionSystem {

    /**
     * @param {Array} buildingColliders - Liste der Gebaeude-Collider
     * @param {Array} vehicleColliders  - Liste der Fahrzeug-Collider
     */
    constructor(buildingColliders = [], vehicleColliders = []) {
        this.buildingColliders = buildingColliders;
        this.vehicleColliders = vehicleColliders;
    }

    // ---------------------------------------------------------------
    //  resolve  -  Entity an Position (newX, newY) gegen alle
    //              Gebaeude-Collider pruefen und ggf. herausschieben.
    //              Gibt { x, y } zurueck.
    //              Portiert aus checkBuildingCollisions() Zeilen 1225-1424.
    // ---------------------------------------------------------------

    resolve(entity, newX, newY) {
        const buildings = this.buildingColliders;

        if (!Array.isArray(buildings) || buildings.length === 0) {
            return { x: newX, y: newY };
        }

        const epsilon = 0.1;

        const eWidth = Number(entity.width ?? 0);
        const eHeight = Number(entity.height ?? 0);

        let ex = newX;
        let ey = newY;

        for (const building of buildings) {
            const collisionRects = this._getCollisionRects(building);

            for (const rect of collisionRects) {
                const bx = rect.x;
                const by = rect.y;
                const bw = rect.width;
                const bh = rect.height;

                const intersects =
                    ex < bx + bw &&
                    ex + eWidth > bx &&
                    ey < by + bh &&
                    ey + eHeight > by;

                if (intersects) {
                    const overlapLeft = ex + eWidth - bx;
                    const overlapRight = bx + bw - ex;
                    const overlapTop = ey + eHeight - by;
                    const overlapBottom = by + bh - ey;

                    const minOverlapX = Math.min(overlapLeft, overlapRight);
                    const minOverlapY = Math.min(overlapTop, overlapBottom);

                    if (minOverlapX < minOverlapY) {
                        if (overlapLeft < overlapRight) {
                            ex = bx - eWidth - epsilon;
                        } else {
                            ex = bx + bw + epsilon;
                        }
                    } else {
                        if (overlapTop < overlapBottom) {
                            ey = by - eHeight - epsilon;
                        } else {
                            ey = by + bh + epsilon;
                        }
                    }
                }
            }
        }

        return { x: ex, y: ey };
    }

    // ---------------------------------------------------------------
    //  isPointInsideAnyCollider  -  Prueft ob (x, y) in irgendeinem
    //                               Collider liegt.
    //  Portiert aus Zeilen 6196-6244.
    // ---------------------------------------------------------------

    isPointInsideAnyCollider(x, y, colliders) {
        if (colliders) {
            // Legacy-Pfad: explizite Collider-Liste (Rects mit left/right/top/bottom oder x/y/width/height)
            if (!Array.isArray(colliders) || colliders.length === 0) {
                return false;
            }
            for (const rect of colliders) {
                if (!rect) continue;
                const left = Number(rect.left ?? rect.x ?? 0);
                const right = Number(rect.right ?? ((rect.width != null) ? left + Number(rect.width) : left));
                const top = Number(rect.top ?? rect.y ?? 0);
                const bottom = Number(rect.bottom ?? ((rect.height != null) ? top + Number(rect.height) : top));
                if (!Number.isFinite(left) || !Number.isFinite(right) ||
                    !Number.isFinite(top) || !Number.isFinite(bottom)) continue;
                if (left > right || top > bottom) continue;
                if (x >= left && x <= right && y >= top && y <= bottom) return true;
            }
            return false;
        }

        // Standard-Pfad: echte Gebaeude-Collider via _getCollisionRects nutzen
        const buildings = this.buildingColliders;
        if (!Array.isArray(buildings) || buildings.length === 0) {
            return false;
        }
        for (const building of buildings) {
            const rects = this._getCollisionRects(building);
            for (const rect of rects) {
                if (x >= rect.x && x <= rect.x + rect.width &&
                    y >= rect.y && y <= rect.y + rect.height) {
                    return true;
                }
            }
        }
        return false;
    }

    // ---------------------------------------------------------------
    //  circleHitsBuilding  -  Prueft ob ein Kreis (cx, cy, radius)
    //                         ein Gebaeude trifft. Gibt das Gebaeude
    //                         oder null zurueck.
    // ---------------------------------------------------------------

    circleHitsBuilding(cx, cy, radius) {
        const buildings = this.buildingColliders;

        if (!Array.isArray(buildings) || buildings.length === 0) {
            return null;
        }

        for (const building of buildings) {
            const rects = this._getCollisionRects(building);

            for (const rect of rects) {
                const nearestX = clamp(cx, rect.x, rect.x + rect.width);
                const nearestY = clamp(cy, rect.y, rect.y + rect.height);
                const dx = cx - nearestX;
                const dy = cy - nearestY;

                if (dx * dx + dy * dy <= radius * radius) {
                    return building;
                }
            }
        }

        return null;
    }

    // ---------------------------------------------------------------
    //  getEntityCollisions  -  Gibt alle Collider zurueck, mit denen
    //                          die Entity gerade kollidiert.
    // ---------------------------------------------------------------

    getEntityCollisions(entity) {
        const result = [];

        const eWidth = Number(entity.width ?? 0);
        const eHeight = Number(entity.height ?? 0);
        const ex = Number(entity.x ?? 0);
        const ey = Number(entity.y ?? 0);

        const allColliders = this._getAllColliderRects();

        for (const rect of allColliders) {
            const intersects =
                ex < rect.x + rect.width &&
                ex + eWidth > rect.x &&
                ey < rect.y + rect.height &&
                ey + eHeight > rect.y;

            if (intersects) {
                result.push(rect);
            }
        }

        return result;
    }

    // ---------------------------------------------------------------
    //  updateVehicleColliders  -  Fahrzeug-Collider pro Frame
    //                             aktualisieren.
    //  Portiert aus collectVehicleColliders() Zeilen 5962-6021.
    // ---------------------------------------------------------------

    updateVehicleColliders(vehicles) {
        if (!Array.isArray(vehicles)) {
            this.vehicleColliders = [];
            return;
        }

        const colliders = [];

        for (const vehicle of vehicles) {
            if (!vehicle) {
                continue;
            }

            const width = Number(vehicle.width ?? 0);
            const height = Number(vehicle.height ?? 0);

            if (!(width > 0 && height > 0)) {
                continue;
            }

            const halfWidth = width / 2;
            const halfHeight = height / 2;

            const centerX = Number(vehicle.x);
            const centerY = Number(vehicle.y);

            if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) {
                continue;
            }

            colliders.push({
                type: 'vehicle',
                source: vehicle,
                left: centerX - halfWidth,
                right: centerX + halfWidth,
                top: centerY - halfHeight,
                bottom: centerY + halfHeight,
                // Auch als x/y/width/height fuer einheitlichen Zugriff
                x: centerX - halfWidth,
                y: centerY - halfHeight,
                width: width,
                height: height,
            });
        }

        this.vehicleColliders = colliders;
    }

    // ---------------------------------------------------------------
    //  resolveCircleRectCollision  -  Kreis-Rechteck-Kollision
    //                                 aufloesen.
    //  Portiert aus Zeilen 6022-6195.
    // ---------------------------------------------------------------

    resolveCircleRectCollision(x, y, radius, rect) {
        if (!rect) {
            return { x, y, collided: false };
        }

        const padding = Number(rect.padding ?? 0) || 0;

        const baseLeft = Number(rect.left ?? rect.x ?? 0);
        const baseRight = Number(rect.right ?? ((rect.width != null) ? baseLeft + Number(rect.width) : baseLeft));
        const baseTop = Number(rect.top ?? rect.y ?? 0);
        const baseBottom = Number(rect.bottom ?? ((rect.height != null) ? baseTop + Number(rect.height) : baseTop));

        if (!Number.isFinite(baseLeft) || !Number.isFinite(baseRight) ||
            !Number.isFinite(baseTop) || !Number.isFinite(baseBottom)) {
            return { x, y, collided: false };
        }

        let left = baseLeft - padding;
        let right = baseRight + padding;
        let top = baseTop - padding;
        let bottom = baseBottom + padding;

        if (left > right) {
            const swap = left;
            left = right;
            right = swap;
        }

        if (top > bottom) {
            const swap = top;
            top = bottom;
            bottom = swap;
        }

        // Fall 1: Kreismitte liegt innerhalb des Rechtecks
        const insideRect = x >= left && x <= right && y >= top && y <= bottom;

        if (insideRect) {
            const distanceLeft = x - left;
            const distanceRight = right - x;
            const distanceTop = y - top;
            const distanceBottom = bottom - y;

            const minDistance = Math.min(distanceLeft, distanceRight, distanceTop, distanceBottom);

            if (minDistance === distanceLeft) {
                x = left - radius;
            } else if (minDistance === distanceRight) {
                x = right + radius;
            } else if (minDistance === distanceTop) {
                y = top - radius;
            } else {
                y = bottom + radius;
            }

            return { x, y, collided: true };
        }

        // Fall 2: Kreismitte ausserhalb - naechsten Punkt auf Rechteck finden
        const nearestX = Math.max(left, Math.min(x, right));
        const nearestY = Math.max(top, Math.min(y, bottom));

        const dx = x - nearestX;
        const dy = y - nearestY;
        const distSq = dx * dx + dy * dy;
        const radiusSq = radius * radius;

        // Sonderfall: Punkt liegt genau auf der Kante
        if (distSq === 0) {
            const distanceLeft = Math.abs(x - left);
            const distanceRight = Math.abs(x - right);
            const distanceTop = Math.abs(y - top);
            const distanceBottom = Math.abs(y - bottom);

            const minDistance = Math.min(distanceLeft, distanceRight, distanceTop, distanceBottom);

            if (minDistance === distanceLeft) {
                x = left - radius;
            } else if (minDistance === distanceRight) {
                x = right + radius;
            } else if (minDistance === distanceTop) {
                y = top - radius;
            } else {
                y = bottom + radius;
            }

            return { x, y, collided: true };
        }

        // Keine Kollision wenn Abstand >= Radius
        if (distSq >= radiusSq || radius <= 0) {
            return { x, y, collided: false };
        }

        const dist = Math.sqrt(distSq);

        if (!Number.isFinite(dist) || dist === 0) {
            return { x, y, collided: false };
        }

        const overlap = radius - dist;

        if (overlap <= 0) {
            return { x, y, collided: false };
        }

        const nx = dx / dist;
        const ny = dy / dist;

        x += nx * overlap;
        y += ny * overlap;

        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return { x: nearestX, y: nearestY, collided: true };
        }

        return { x, y, collided: true };
    }

    // ---------------------------------------------------------------
    //  Private Hilfsmethoden
    // ---------------------------------------------------------------

    /**
     * Extrahiert die effektiven Kollisions-Rechtecke aus einem
     * Gebaeude-Objekt (collisionRects oder Fallback auf Basis-Rect).
     */
    _getCollisionRects(building) {
        if (!building) {
            return [];
        }

        const basePadding = Math.max(0, building.collisionPadding ?? 0);

        const baseX = Number(building.x ?? 0);
        const baseY = Number(building.y ?? 0);
        const baseWidth = Math.max(0, Number(building.width ?? 0));
        const baseHeight = Math.max(0, Number(building.height ?? 0));

        const baseRect = {
            x: baseX + basePadding,
            y: baseY + basePadding,
            width: Math.max(0, baseWidth - basePadding * 2),
            height: Math.max(0, baseHeight - basePadding * 2),
        };

        const rects = [];

        if (Array.isArray(building.collisionRects) && building.collisionRects.length > 0) {
            for (const rect of building.collisionRects) {
                if (!rect) {
                    continue;
                }

                const rawWidth = Number(rect.width ?? 0);
                const rawHeight = Number(rect.height ?? 0);

                if (!(rawWidth > 0 && rawHeight > 0)) {
                    continue;
                }

                const rectPadding = Math.max(0, rect.padding ?? 0);
                const paddedWidth = rawWidth - rectPadding * 2;
                const paddedHeight = rawHeight - rectPadding * 2;

                if (!(paddedWidth > 0 && paddedHeight > 0)) {
                    continue;
                }

                const resolvedX = Number(rect.x ?? baseX);
                const resolvedY = Number(rect.y ?? baseY);

                rects.push({
                    x: resolvedX + rectPadding,
                    y: resolvedY + rectPadding,
                    width: paddedWidth,
                    height: paddedHeight,
                    source: building,
                });
            }
        }

        if (rects.length === 0 && baseRect.width > 0 && baseRect.height > 0) {
            baseRect.source = building;
            rects.push(baseRect);
        }

        return rects;
    }

    /**
     * Sammelt alle Collider-Rects (Gebaeude + Fahrzeuge) als
     * einheitliche {x, y, width, height} Objekte.
     */
    _getAllColliderRects() {
        const rects = [];

        // Gebaeude
        if (Array.isArray(this.buildingColliders)) {
            for (const building of this.buildingColliders) {
                const bRects = this._getCollisionRects(building);
                for (const r of bRects) {
                    rects.push(r);
                }
            }
        }

        // Fahrzeuge
        if (Array.isArray(this.vehicleColliders)) {
            for (const vc of this.vehicleColliders) {
                if (!vc) {
                    continue;
                }
                rects.push({
                    x: Number(vc.x ?? vc.left ?? 0),
                    y: Number(vc.y ?? vc.top ?? 0),
                    width: Number(vc.width ?? (Number(vc.right ?? 0) - Number(vc.left ?? 0))),
                    height: Number(vc.height ?? (Number(vc.bottom ?? 0) - Number(vc.top ?? 0))),
                    type: 'vehicle',
                    source: vc.source ?? vc,
                });
            }
        }

        return rects;
    }
}




// ═══════════════════════════════════════════════════════
// js/systems/CombatSystem.js
// ═══════════════════════════════════════════════════════
/**
 * CombatSystem - Verwaltet Projektile, Treffer und Kampf-Logik.
 * Portiert aus gta_old/overworld/js/overworld.js:
 *   processPlayerFiring()            (Z.2991-3017)
 *   spawnProjectilesForWeapon()      (Z.3019-3036)
 *   createProjectile()               (Z.3038-3064)
 *   updateProjectiles()              (Z.3065-3103)
 *   checkProjectileNpcCollision()    (Z.3180-3201)
 *   onNpcHit()                       (Z.3203-3214)
 *   killNpc()                        (Z.3216-3232)
 *   spawnBloodDecal()                (Z.3234-3243)
 */

/** Maximale Anzahl an Blood-Decals bevor aelteste entfernt werden */
const MAX_BLOOD_DECALS = 150;

/** Offset vom Spielerzentrum zur Muendung in Pixeln */
const MUZZLE_OFFSET = 18;

class CombatSystem {

    /**
     * @param {import('../core/EventBus.js').EventBus} eventBus
     * @param {Map<string, object>} weaponCatalog - Ergebnis von createWeaponCatalog()
     */
    constructor(eventBus, weaponCatalog) {
        this.eventBus = eventBus;
        this.weaponCatalog = weaponCatalog;

        /** @type {Array<object>} Aktive Projektile */
        this.projectiles = [];

        /** @type {Array<object>} Blut-Decals auf dem Boden */
        this.bloodDecals = [];

        /** Feuer-Zustand (Timing fuer Fire-Rate) */
        this._lastShotAt = 0;
    }

    // ───────────────────── Public API ─────────────────────

    /**
     * Setzt die Polizei-Referenz fuer Projektil-Kollision.
     * @param {Array<object>} policeOfficers
     */
    setPoliceOfficers(policeOfficers) {
        this._policeOfficers = policeOfficers;
    }

    /**
     * Haupt-Update pro Frame.
     * @param {import('../entities/Player.js').Player} player
     * @param {Array<import('../entities/NPC.js').NPC>} npcs
     * @param {number} _deltaTime - (reserviert, aktuell nicht genutzt)
     */
    update(player, npcs, _deltaTime) {
        this._updateProjectiles(npcs);
    }

    /**
     * Versucht mit der aktuellen Waffe zu feuern.
     * Portiert aus processPlayerFiring() (Z.2991-3017).
     *
     * @param {import('../entities/Player.js').Player} player
     * @param {{x: number, y: number}} mouseWorldPos - Maus-Weltkoordinaten
     * @param {object} fireInput - { justPressed: boolean, active: boolean }
     * @param {number} now - performance.now()
     */
    fireWeapon(player, mouseWorldPos, fireInput, now) {
        const weapon = getWeaponDefinition(this.weaponCatalog, player.currentWeaponId);

        if (!weapon || !player.weaponInventory.has(weapon.id)) {
            return;
        }

        if (!fireInput.active && !fireInput.justPressed) {
            return;
        }

        if (!weapon.automatic && !fireInput.justPressed) {
            return;
        }

        const interval = weapon.fireRate ?? 250;

        if (now - this._lastShotAt < interval) {
            return;
        }

        const muzzle = player.getMuzzlePosition();
        this._spawnProjectilesForWeapon(weapon, muzzle, mouseWorldPos);

        this._lastShotAt = now;
    }

    // ───────────────────── Projektil-Erzeugung ─────────────────────

    /**
     * Erzeugt Projektil(e) fuer eine Waffe (inkl. Pellets bei Shotgun).
     * Portiert aus spawnProjectilesForWeapon() (Z.3019-3036).
     *
     * @param {object} weapon - Waffendefinition aus dem Katalog
     * @param {{x: number, y: number}} muzzle - Muendungsposition
     * @param {{x: number, y: number}} target - Zielposition (Maus-Welt)
     * @private
     */
    _spawnProjectilesForWeapon(weapon, muzzle, target) {
        const targetX = target.x ?? muzzle.x;
        const targetY = target.y ?? muzzle.y;

        let angle = Math.atan2(targetY - muzzle.y, targetX - muzzle.x);

        if (!Number.isFinite(angle)) {
            angle = 0;
        }

        const spread = weapon.spread ?? 0;
        const pelletCount = weapon.pellets && weapon.pellets > 1 ? weapon.pellets : 1;

        for (let i = 0; i < pelletCount; i++) {
            const offset = spread ? (Math.random() - 0.5) * spread * 2 : 0;
            this._createProjectile(weapon, muzzle.x, muzzle.y, angle + offset);
        }
    }

    /**
     * Erstellt ein einzelnes Projektil.
     * Portiert aus createProjectile() (Z.3038-3064).
     *
     * @param {object} weapon
     * @param {number} startX
     * @param {number} startY
     * @param {number} angle
     * @private
     */
    _createProjectile(weapon, startX, startY, angle) {
        const speed = weapon.projectileSpeed ?? 10;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;

        const originX = startX + Math.cos(angle) * MUZZLE_OFFSET;
        const originY = startY + Math.sin(angle) * MUZZLE_OFFSET;

        const projectile = {
            x: originX,
            y: originY,
            vx,
            vy,
            speed,
            damage: weapon.damage ?? 10,
            weaponId: weapon.id,
            color: weapon.displayColor ?? '#ffd166',
            maxDistance: weapon.range ?? 600,
            distance: 0,
            createdAt: performance.now(),
        };

        this.projectiles.push(projectile);
    }

    // ───────────────────── Projektil-Update ─────────────────────

    /**
     * Bewegt alle Projektile und entfernt abgelaufene.
     * Portiert aus updateProjectiles() (Z.3065-3103).
     *
     * @param {Array<import('../entities/NPC.js').NPC>} npcs
     * @private
     */
    _updateProjectiles(npcs) {
        if (!this.projectiles.length) {
            return;
        }

        const survivors = [];

        for (const projectile of this.projectiles) {
            projectile.x += projectile.vx;
            projectile.y += projectile.vy;
            projectile.distance += projectile.speed;

            let expired = projectile.distance >= projectile.maxDistance;

            if (!expired) {
                if (this._checkProjectileNpcCollision(projectile, npcs)) {
                    expired = true;
                }
            }

            // Polizei-Treffer pruefen
            if (!expired && Array.isArray(this._policeOfficers)) {
                if (this._checkProjectilePoliceCollision(projectile, this._policeOfficers)) {
                    expired = true;
                }
            }

            if (!expired) {
                survivors.push(projectile);
            }
        }

        this.projectiles = survivors;
    }

    // ───────────────────── Kollisionserkennung ─────────────────────

    /**
     * Prueft ob ein Projektil einen NPC trifft.
     * Portiert aus checkProjectileNpcCollision() (Z.3180-3201).
     *
     * @param {object} projectile
     * @param {Array<import('../entities/NPC.js').NPC>} npcs
     * @returns {boolean} true wenn Treffer
     * @private
     */
    _checkProjectileNpcCollision(projectile, npcs) {
        if (!npcs || !Array.isArray(npcs)) {
            return false;
        }

        for (const npc of npcs) {
            if (!npc || npc.dead) {
                continue;
            }

            const radius = npc.hitRadius ?? 14;
            const dx = projectile.x - npc.x;
            const dy = projectile.y - npc.y;

            if (dx * dx + dy * dy <= radius * radius) {
                this._onNpcHit(npc, projectile);
                return true;
            }
        }

        return false;
    }

    // ───────────────────── Polizei-Kollision ─────────────────────

    /**
     * Prueft ob ein Projektil einen Polizisten trifft.
     * @param {object} projectile
     * @param {Array<object>} officers
     * @returns {boolean}
     * @private
     */
    _checkProjectilePoliceCollision(projectile, officers) {
        for (const cop of officers) {
            if (!cop || cop.dead) continue;

            const radius = cop.hitRadius ?? 14;
            const dx = projectile.x - cop.x;
            const dy = projectile.y - cop.y;

            if (dx * dx + dy * dy <= radius * radius) {
                this._onPoliceHit(cop, projectile);
                return true;
            }
        }
        return false;
    }

    /**
     * Verarbeitet einen Treffer auf einen Polizisten.
     * @param {object} cop
     * @param {object} projectile
     * @private
     */
    _onPoliceHit(cop, projectile) {
        cop.health = Math.max(0, cop.health - projectile.damage);

        this.eventBus.emit('police:hit', { cop, damage: projectile.damage });

        if (cop.health <= 0) {
            cop.dead = true;
            cop.health = 0;
            cop.moving = false;
            cop.animationPhase = 0;
            cop.deathRotation = (Math.random() * Math.PI) - Math.PI / 2;
            this.spawnBloodDecal(cop.x, cop.y);
            this.eventBus.emit('police:killed', { cop });
        }
    }

    // ───────────────────── Treffer-Verarbeitung ─────────────────────

    /**
     * Verarbeitet einen Treffer auf einen NPC.
     * Portiert aus onNpcHit() (Z.3203-3214).
     *
     * @param {import('../entities/NPC.js').NPC} npc
     * @param {object} projectile
     * @private
     */
    _onNpcHit(npc, projectile) {
        const maxHealth = npc.maxHealth ?? 100;

        npc.health = Math.max(0, (npc.health ?? maxHealth) - projectile.damage);

        const panicDuration = 180 + Math.floor(Math.random() * 120);
        npc.panicTimer = Math.max(npc.panicTimer ?? 0, panicDuration);

        this.eventBus.emit('npc:hit', { npc, damage: projectile.damage, weaponId: projectile.weaponId });

        if (npc.health <= 0) {
            this._killNpc(npc);
        }
    }

    /**
     * Toetet einen NPC.
     * Portiert aus killNpc() (Z.3216-3232).
     *
     * @param {import('../entities/NPC.js').NPC} npc
     * @private
     */
    _killNpc(npc) {
        if (npc.dead) {
            return;
        }

        npc.dead = true;
        npc.health = 0;
        npc.moving = false;
        npc.panicTimer = 0;
        npc.waitTimer = 0;
        npc.animationPhase = 0;
        npc.isCrossing = false;
        npc.waitingForCrosswalk = null;
        npc.deathRotation = (Math.random() * Math.PI) - Math.PI / 2;

        this.spawnBloodDecal(npc.x, npc.y);

        this.eventBus.emit('npc:killed', { npc });
    }

    // ───────────────────── Blood-Decals ─────────────────────

    /**
     * Erzeugt einen Blut-Decal an der Position.
     * Portiert aus spawnBloodDecal() (Z.3234-3243).
     *
     * @param {number} x
     * @param {number} y
     */
    spawnBloodDecal(x, y) {
        this.bloodDecals.push({
            x,
            y,
            radius: 18 + Math.random() * 12,
            createdAt: performance.now(),
        });

        if (this.bloodDecals.length > MAX_BLOOD_DECALS) {
            this.bloodDecals.shift();
        }
    }

    /**
     * Entfernt alle Blut-Decals (z.B. nach Respawn).
     */
    clearBloodDecals() {
        this.bloodDecals.length = 0;
    }
}




// ═══════════════════════════════════════════════════════
// js/systems/PoliceSystem.js
// ═══════════════════════════════════════════════════════
/**
 * PoliceSystem - Verwaltet Polizei-Spawning, Verfolgung, Taser, Verhaftung,
 * Eskalation und SWAT-Einsatz.
 *
 * SSOT fuer alle Polizei-Konstanten und -Logik.
 */

// ── Polizeistation (Respawn-Punkt) ──────────────────────────────────────
const POLICE_STATION_POS = { x: 1800, y: 400 };

// ── Paletten ────────────────────────────────────────────────────────────
const POLICE_PALETTE = {
    head: '#f2d6c1',
    torso: '#1a3a6b',
    limbs: '#152d54',
    accent: '#2563eb',
    hair: '#1a1a1a',
    eyes: '#ffffff',
    pupil: '#1b1b1b',
};

const SWAT_PALETTE = {
    head: '#2a2a2a',
    torso: '#1a1a1a',
    limbs: '#0d0d0d',
    accent: '#333333',
    hair: '#1a1a1a',
    eyes: '#c0c0c0',
    pupil: '#222222',
};

// ── Geschwindigkeiten ───────────────────────────────────────────────────
const POLICE_CHASE_SPEED = 1.8;
const SWAT_CHASE_SPEED = 2.2;
const POLICE_WALK_ANIM_SPEED = 0.1;

// ── Taser ───────────────────────────────────────────────────────────────
const TASER_RANGE = 180;
const TASER_COOLDOWN = 4000;
const TASER_PROJECTILE_SPEED = 8;
const TASER_HIT_RADIUS = 18;

// ── Stun / Slow ─────────────────────────────────────────────────────────
const STUN_DURATION = 2000;
const SLOW_DURATION = 2000;
const SLOW_FACTOR = 0.4;

// ── Verhaftung ──────────────────────────────────────────────────────────
const ARREST_RADIUS = 45;
const ARREST_TIME = 5000;

// ── Spawning ────────────────────────────────────────────────────────────
const POLICE_SPAWN_DISTANCE_MIN = 280;
const POLICE_SPAWN_DISTANCE_MAX = 400;
const SPAWN_DELAY_INITIAL = 2000;
const SPAWN_INTERVAL = 4000;
const MAX_POLICE_TOTAL = 8;

// ── Gesundheit ──────────────────────────────────────────────────────────
const POLICE_HEALTH = 150;
const SWAT_HEALTH = 300;

// ── Eskalation ──────────────────────────────────────────────────────────
const ESCALATION_STAGES = [
    { time: 0,     weaponId: 'pistol',       maxPolice: 2, fireRate: 900,  spawnSwat: false },
    { time: 20000, weaponId: 'smg',          maxPolice: 3, fireRate: 350,  spawnSwat: false },
    { time: 45000, weaponId: 'assaultRifle', maxPolice: 5, fireRate: 280,  spawnSwat: true  },
];

// ── Polizei-Schussverhalten ─────────────────────────────────────────────
const POLICE_GUN_RANGE = 350;
const POLICE_BULLET_SPREAD = 0.08;

let _nextPoliceId = 1;

class PoliceSystem {
    /**
     * @param {import('../core/EventBus.js').EventBus} eventBus
     * @param {import('../core/EntityMover.js').EntityMover} entityMover
     * @param {Map<string, object>} weaponCatalog
     */
    constructor(eventBus, entityMover, weaponCatalog) {
        this.eventBus = eventBus;
        this.entityMover = entityMover;
        this.weaponCatalog = weaponCatalog;

        /** @type {Array<object>} Aktive Polizisten */
        this.officers = [];

        /** @type {Array<object>} Polizei-Projektile (Taser + Kugeln) */
        this.projectiles = [];

        /** Wanted-Status */
        this.wanted = false;
        this.wantedSince = 0;
        this.policeShootBack = false;
        this.shootBackSince = 0;

        /** Spawn-Timing */
        this._spawnDelayRemaining = 0;
        this._lastSpawnAt = 0;

        /** Verhaftungs-Fortschritt (ms) */
        this.arrestProgress = 0;

        /** Aktueller Eskalations-Index */
        this._escalationIndex = 0;
    }

    // =====================================================================
    //  Public API
    // =====================================================================

    /**
     * Aktiviert den Wanted-Status (z.B. nach NPC-Kill).
     * @param {number} now - performance.now()
     */
    setWanted(now) {
        if (this.wanted) return;
        this.wanted = true;
        this.wantedSince = now;
        this._spawnDelayRemaining = SPAWN_DELAY_INITIAL;
        this._escalationIndex = 0;
        this.policeShootBack = false;
        this.arrestProgress = 0;
    }

    /**
     * Wird aufgerufen wenn ein Polizist vom Spieler getroffen wird.
     * @param {number} now
     */
    onPoliceShot(now) {
        if (!this.policeShootBack) {
            this.policeShootBack = true;
            this.shootBackSince = now;
        }
    }

    /**
     * Setzt den gesamten Polizei-Zustand zurueck (z.B. nach Respawn).
     */
    reset() {
        this.officers = [];
        this.projectiles = [];
        this.wanted = false;
        this.wantedSince = 0;
        this.policeShootBack = false;
        this.shootBackSince = 0;
        this._spawnDelayRemaining = 0;
        this._lastSpawnAt = 0;
        this.arrestProgress = 0;
        this._escalationIndex = 0;
    }

    /**
     * Haupt-Update pro Frame.
     * @param {import('../entities/Player.js').Player} player
     * @param {number} deltaTime - Sekunden seit letztem Frame
     * @param {number} now - performance.now()
     * @returns {{ wasted: boolean }} Ob der Spieler verhaftet/getoetet wurde
     */
    update(player, deltaTime, now) {
        if (!this.wanted) {
            return { wasted: false };
        }

        const deltaMs = deltaTime * 1000;

        // Spawn-Delay
        if (this._spawnDelayRemaining > 0) {
            this._spawnDelayRemaining -= deltaMs;
            if (this._spawnDelayRemaining > 0) {
                return { wasted: false };
            }
        }

        // Eskalation aktualisieren
        this._updateEscalation(now);

        // Polizisten spawnen
        this._spawnIfNeeded(player, now);

        // Polizisten-KI
        let anyNearby = false;
        for (const cop of this.officers) {
            if (cop.dead) continue;
            this._updateOfficerAI(cop, player, now);
            if (this._distanceTo(cop, player) <= ARREST_RADIUS) {
                anyNearby = true;
            }
        }

        // Verhaftungs-Timer
        if (anyNearby && player.stunTimer > 0) {
            this.arrestProgress += deltaMs;
        } else if (anyNearby) {
            this.arrestProgress += deltaMs * 0.3;
        } else {
            this.arrestProgress = Math.max(0, this.arrestProgress - deltaMs * 0.5);
        }

        if (this.arrestProgress >= ARREST_TIME) {
            return { wasted: true, reason: 'arrested' };
        }

        // Projektile aktualisieren
        const playerHit = this._updateProjectiles(player);
        if (playerHit.taser) {
            player.stunTimer = STUN_DURATION;
            player.slowTimer = SLOW_DURATION;
        }
        if (playerHit.damage > 0) {
            player.health = Math.max(0, player.health - playerHit.damage);
            if (player.health <= 0) {
                return { wasted: true, reason: 'killed' };
            }
        }

        // Tote Polizisten aufraeuemen
        this.officers = this.officers.filter(c => !c.dead || c._deathAge < 10000);
        for (const cop of this.officers) {
            if (cop.dead) {
                cop._deathAge = (cop._deathAge ?? 0) + deltaMs;
            }
        }

        return { wasted: false };
    }

    // =====================================================================
    //  Eskalation
    // =====================================================================

    /** @param {number} now */
    _updateEscalation(now) {
        const elapsed = now - this.wantedSince;
        for (let i = ESCALATION_STAGES.length - 1; i >= 0; i--) {
            if (elapsed >= ESCALATION_STAGES[i].time) {
                this._escalationIndex = i;
                break;
            }
        }
    }

    /** @returns {object} Aktuelle Eskalationsstufe */
    _getCurrentStage() {
        return ESCALATION_STAGES[this._escalationIndex] ?? ESCALATION_STAGES[0];
    }

    // =====================================================================
    //  Spawning
    // =====================================================================

    /**
     * @param {object} player
     * @param {number} now
     */
    _spawnIfNeeded(player, now) {
        const stage = this._getCurrentStage();
        const aliveCount = this.officers.filter(c => !c.dead).length;

        if (aliveCount >= stage.maxPolice || aliveCount >= MAX_POLICE_TOTAL) return;
        if (now - this._lastSpawnAt < SPAWN_INTERVAL) return;

        const shouldSpawnSwat = stage.spawnSwat && !this.officers.some(c => c.type === 'swat' && !c.dead);
        const type = shouldSpawnSwat ? 'swat' : 'police';

        const cop = this._createOfficer(player, type, stage.weaponId);
        if (cop) {
            this.officers.push(cop);
            this._lastSpawnAt = now;
        }
    }

    /**
     * Erstellt einen Polizisten an einer zufaelligen Position um den Spieler.
     * @param {object} player
     * @param {'police'|'swat'} type
     * @param {string} weaponId
     * @returns {object|null}
     */
    _createOfficer(player, type, weaponId) {
        const angle = Math.random() * Math.PI * 2;
        const dist = POLICE_SPAWN_DISTANCE_MIN + Math.random() * (POLICE_SPAWN_DISTANCE_MAX - POLICE_SPAWN_DISTANCE_MIN);
        const x = player.x + Math.cos(angle) * dist;
        const y = player.y + Math.sin(angle) * dist;

        const isSwat = type === 'swat';
        const palette = isSwat ? SWAT_PALETTE : POLICE_PALETTE;

        return {
            id: _nextPoliceId++,
            x, y,
            width: 30,
            height: 30,
            speed: isSwat ? SWAT_CHASE_SPEED : POLICE_CHASE_SPEED,
            health: isSwat ? SWAT_HEALTH : POLICE_HEALTH,
            maxHealth: isSwat ? SWAT_HEALTH : POLICE_HEALTH,
            dead: false,
            moving: false,
            hidden: false,
            type,
            isPolice: true,
            parts: buildHumanoidParts(palette),
            palette,
            animationPhase: 0,
            hitRadius: 14,
            weaponId,
            taserCooldownUntil: 0,
            gunCooldownUntil: 0,
            nearPlayerTimer: 0,
            deathRotation: 0,
            stayOnSidewalks: false,
        };
    }

    // =====================================================================
    //  KI-Update pro Polizist
    // =====================================================================

    /**
     * @param {object} cop
     * @param {object} player
     * @param {number} now
     */
    _updateOfficerAI(cop, player, now) {
        const dx = player.x - cop.x;
        const dy = player.y - cop.y;
        const dist = Math.hypot(dx, dy);

        // Bewegung zum Spieler
        if (dist > 20) {
            const ratio = cop.speed / dist;
            const targetX = cop.x + dx * ratio;
            const targetY = cop.y + dy * ratio;
            this.entityMover.move(cop, targetX, targetY, { ignoreSidewalk: true });
            cop.moving = true;
        } else {
            cop.moving = false;
        }

        // Animation
        if (cop.moving) {
            cop.animationPhase = (cop.animationPhase + cop.speed * POLICE_WALK_ANIM_SPEED) % (Math.PI * 2);
        } else {
            cop.animationPhase *= 0.85;
        }

        // Taser (immer verfuegbar)
        if (dist <= TASER_RANGE && now >= cop.taserCooldownUntil) {
            this._fireTaser(cop, player, now);
            cop.taserCooldownUntil = now + TASER_COOLDOWN;
        }

        // Schusswaffen (nur wenn provoziert)
        if (this.policeShootBack && dist <= POLICE_GUN_RANGE) {
            const stage = this._getCurrentStage();
            const weapon = getWeaponDefinition(this.weaponCatalog, cop.weaponId);
            if (weapon && now >= cop.gunCooldownUntil) {
                this._fireGun(cop, player, weapon, now);
                cop.gunCooldownUntil = now + (stage.fireRate ?? weapon.fireRate ?? 500);
            }
        }
    }

    // =====================================================================
    //  Taser
    // =====================================================================

    /**
     * @param {object} cop
     * @param {object} player
     * @param {number} now
     */
    _fireTaser(cop, player, now) {
        const dx = player.x - cop.x;
        const dy = player.y - cop.y;
        const angle = Math.atan2(dy, dx);

        this.projectiles.push({
            x: cop.x + Math.cos(angle) * 16,
            y: cop.y + Math.sin(angle) * 16,
            vx: Math.cos(angle) * TASER_PROJECTILE_SPEED,
            vy: Math.sin(angle) * TASER_PROJECTILE_SPEED,
            speed: TASER_PROJECTILE_SPEED,
            type: 'taser',
            damage: 0,
            color: '#ffee00',
            maxDistance: TASER_RANGE + 40,
            distance: 0,
            createdAt: now,
        });
    }

    // =====================================================================
    //  Schusswaffen
    // =====================================================================

    /**
     * @param {object} cop
     * @param {object} player
     * @param {object} weapon
     * @param {number} now
     */
    _fireGun(cop, player, weapon, now) {
        const dx = player.x - cop.x;
        const dy = player.y - cop.y;
        const baseAngle = Math.atan2(dy, dx);
        const spread = POLICE_BULLET_SPREAD;
        const angle = baseAngle + (Math.random() - 0.5) * spread * 2;
        const projSpeed = weapon.projectileSpeed ?? 10;

        this.projectiles.push({
            x: cop.x + Math.cos(angle) * 16,
            y: cop.y + Math.sin(angle) * 16,
            vx: Math.cos(angle) * projSpeed,
            vy: Math.sin(angle) * projSpeed,
            speed: projSpeed,
            type: 'bullet',
            damage: weapon.damage ?? 15,
            color: weapon.displayColor ?? '#fca311',
            maxDistance: weapon.range ?? 600,
            distance: 0,
            createdAt: now,
        });
    }

    // =====================================================================
    //  Projektil-Update
    // =====================================================================

    /**
     * @param {object} player
     * @returns {{ taser: boolean, damage: number }}
     */
    _updateProjectiles(player) {
        const result = { taser: false, damage: 0 };
        if (!this.projectiles.length) return result;

        const survivors = [];
        const playerHitRadius = 16;

        for (const proj of this.projectiles) {
            proj.x += proj.vx;
            proj.y += proj.vy;
            proj.distance += proj.speed;

            if (proj.distance >= proj.maxDistance) continue;

            // Treffer auf Spieler pruefen
            const dx = proj.x - (player.x + player.width / 2);
            const dy = proj.y - (player.y + player.height / 2);
            if (dx * dx + dy * dy <= playerHitRadius * playerHitRadius) {
                if (proj.type === 'taser') {
                    result.taser = true;
                } else {
                    result.damage += proj.damage;
                }
                continue;
            }

            survivors.push(proj);
        }

        this.projectiles = survivors;
        return result;
    }

    // =====================================================================
    //  Hilfsfunktionen
    // =====================================================================

    /**
     * @param {object} a
     * @param {object} b
     * @returns {number}
     */
    _distanceTo(a, b) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        return Math.hypot(dx, dy);
    }

    /**
     * Gibt die Anzahl lebender Polizisten zurueck.
     * @returns {number}
     */
    getAliveCount() {
        return this.officers.filter(c => !c.dead).length;
    }

    /**
     * Gibt den Verhaftungs-Fortschritt als 0-1 zurueck.
     * @returns {number}
     */
    getArrestProgress() {
        return Math.min(1, this.arrestProgress / ARREST_TIME);
    }
}



// ═══════════════════════════════════════════════════════
// js/systems/AISystem.js
// ═══════════════════════════════════════════════════════
/**
 * AISystem - NPC-KI: Wegpunkt-Navigation, Panik-Flucht, Stuck-Detection.
 *
 * KRITISCH: Alle Positionsaenderungen NUR ueber this.entityMover.move() oder .teleport()!
 * Niemals npc.x = ... direkt setzen!
 *
 * Portiert aus gta_old/overworld/js/overworld.js:
 *   updateNPC()                    (Zeilen 5598-5820)
 *   updateNpcPanicMovement()       (Zeilen 6787-6886)
 *   updateNpcMovementTracker()     (Zeilen 6343-6408)
 *   redirectNpcOnWalkwayEdge()     (Zeilen 6603-6668)
 *   teleportNpcToNearestSidewalk() (Zeilen 6669-6786)
 *   findNearestSidewalkSpot()      (Zeilen 6409-6534)
 *   getBuildingSidewalkExit()      (Zeilen 6535-6602)
 */

/** Panik-Geschwindigkeitsfaktor relativ zur Basis-Geschwindigkeit */
const PANIC_SPEED_MULTIPLIER = 2.2;

/** Animations-Geschwindigkeitsfaktor beim normalen Gehen */
const WALK_ANIM_FACTOR = 0.08;

/** Animations-Geschwindigkeitsfaktor bei Panik */
const PANIC_ANIM_FACTOR = 0.07;

/** Abkling-Faktor fuer die Animation im Stehen */
const ANIM_DECAY = 0.85;

/** Mindest-Wartezeit nach Panik-Ende */
const POST_PANIC_WAIT = 45;

/** Mindest-Wartezeit bei Richtungswechsel */
const REDIRECT_MIN_WAIT = 8;

/** Maximale zufaellige Wartezeit bei Richtungswechsel */
const REDIRECT_RANDOM_WAIT = 24;

/** Abstand-Padding um Fahrzeug-Collider */
const VEHICLE_CLEAR_PADDING = 6;

/** Mindest-Teleport-Abstand bei 'idle' */
const IDLE_MIN_TELEPORT_DISTANCE = 26;

/** Mindest-Teleport-Abstand bei 'building' */
const BUILDING_MIN_TELEPORT_DISTANCE = 14;

/** Mindest-Teleport-Abstand bei Building-Exit */
const BUILDING_EXIT_MIN_DISTANCE = 22;

class AISystem {
    /**
     * @param {import('../core/EntityMover.js').EntityMover} entityMover
     * @param {import('../world/RoadNetwork.js').RoadNetwork} roadNetwork
     * @param {import('../core/EventBus.js').EventBus} eventBus
     * @param {Object} [deps] - Optionale Abhaengigkeiten
     * @param {import('./CollisionSystem.js').CollisionSystem} [deps.collisionSystem]
     * @param {Array} [deps.buildings] - Gebaeude-Liste fuer getBuildingSidewalkExit
     */
    constructor(entityMover, roadNetwork, eventBus, deps = {}) {
        this.entityMover = entityMover;
        this.roadNetwork = roadNetwork;
        this.eventBus = eventBus;
        this.collisionSystem = deps.collisionSystem ?? null;
        this.buildings = deps.buildings ?? [];
    }

    // -------------------------------------------------------------------
    //  Haupt-Update
    // -------------------------------------------------------------------

    /**
     * Aktualisiert alle NPCs fuer diesen Frame.
     *
     * @param {Array<import('../entities/NPC.js').NPC>} npcs
     * @param {import('../entities/Player.js').default} player
     * @param {number} deltaTime - Zeit seit letztem Frame (wird fuer Timestamps genutzt)
     */
    update(npcs, player, deltaTime) {
        if (!Array.isArray(npcs) || !npcs.length) {
            return;
        }

        for (const npc of npcs) {
            if (!npc || !npc.path || npc.path.length < 2) {
                continue;
            }

            // a) Skip wenn dead/hidden/insideBuilding
            if (npc.dead) {
                npc.moving = false;
                npc.waitTimer = 0;
                npc.animationPhase *= ANIM_DECAY;
                continue;
            }

            if (npc.hidden || npc.insideBuilding) {
                continue;
            }

            // a2) Sofort-Check: NPC steckt in Gebaeude-Collider (z.B. nach Spawn)
            if (!npc._spawnChecked) {
                npc._spawnChecked = true;
                if (this._isInsideAnyBuilding(npc.x, npc.y)) {
                    const now = this._getTimestamp();
                    if (this._teleportToNearestSidewalk(npc, 'building', now)) {
                        npc.moving = false;
                    }
                    continue;
                }
            }

            // b) Panik-Modus
            if (npc.panicTimer > 0) {
                this._handlePanic(npc, player);
                continue;
            }

            // c) Normale Wegpunkt-Navigation
            this._handleWaypointNavigation(npc);

            // d) Stuck-Detection
            this._updateStuckDetection(npc);

            // e) Animation
            this._updateAnimation(npc);
        }
    }

    // -------------------------------------------------------------------
    //  Wegpunkt-Navigation  (portiert aus updateNPC Zeilen 5634-5818)
    // -------------------------------------------------------------------

    /**
     * @param {import('../entities/NPC.js').NPC} npc
     */
    _handleWaypointNavigation(npc) {
        let movingThisFrame = false;

        if (npc.waitTimer > 0) {
            npc.waitTimer -= 1;
        } else {
            const target = npc.getCurrentWaypoint();

            if (!target) {
                return;
            }

            const dx = target.x - npc.x;
            const dy = target.y - npc.y;
            const dist = Math.hypot(dx, dy);

            if (dist <= npc.speed) {
                // Wegpunkt erreicht - per entityMover an exakte Position setzen
                this.entityMover.teleport(npc, target.x, target.y);

                npc.waitTimer = target.wait ?? 0;
                npc.waitingForCrosswalk = target.crosswalkIndex ?? null;

                // Dynamische Navigation: neuen Wegpunkt generieren
                if (npc.dynamicNavigation) {
                    this._generateDynamicWaypoint(npc);
                } else {
                    // Gebaeude-Aktionen
                    this._handleWaypointAction(npc, target);
                    npc.advanceWaypoint();
                }
            } else if (dist > 0) {
                const ratio = npc.speed / dist;
                const nextX = npc.x + dx * ratio;
                const nextY = npc.y + dy * ratio;

                const result = this.entityMover.move(npc, nextX, nextY);
                movingThisFrame = result.moved;
            }
        }

        // Crossing-Status (vereinfacht - wird vom RoadNetwork gehandelt)
        npc.isCrossing = this._isOnCrosswalk(npc.x, npc.y);

        npc.moving = movingThisFrame && npc.waitTimer === 0;

        if (!npc.isCrossing && npc.waitTimer === 0 && !npc.moving) {
            npc.waitingForCrosswalk = null;
        }
    }

    /**
     * Verarbeitet Gebaeude-bezogene Aktionen bei Wegpunkt-Ankunft.
     *
     * @param {import('../entities/NPC.js').NPC} npc
     * @param {Object} target - Der erreichte Wegpunkt
     */
    _handleWaypointAction(npc, target) {
        if (target.action === 'enter') {
            if (target.buildingId) {
                npc.lastBuildingId = target.buildingId;
            }
            npc.insideBuilding = target.buildingId ?? npc.insideBuilding ?? npc.lastBuildingId ?? true;
            npc.hidden = true;
        } else if (target.action === 'exit') {
            if (target.buildingId) {
                npc.lastBuildingId = target.buildingId;
            }
            npc.insideBuilding = null;
            npc.hidden = false;
        } else if (target.interior) {
            if (target.buildingId) {
                npc.lastBuildingId = target.buildingId;
            }
            npc.insideBuilding = target.buildingId ?? npc.insideBuilding ?? npc.lastBuildingId ?? true;
            npc.hidden = true;
        }
    }

    // -------------------------------------------------------------------
    //  Panik-Bewegung  (portiert aus updateNpcPanicMovement Zeilen 6787-6886)
    // -------------------------------------------------------------------

    /**
     * @param {import('../entities/NPC.js').NPC} npc
     * @param {Object} player - Spieler-Entity mit x/y
     */
    _handlePanic(npc, player) {
        if (!player) {
            return;
        }

        let awayX = npc.x - player.x;
        let awayY = npc.y - player.y;
        let length = Math.hypot(awayX, awayY);

        if (length < 1) {
            const angle = Math.random() * Math.PI * 2;
            awayX = Math.cos(angle);
            awayY = Math.sin(angle);
            length = 1;
        }

        const baseSpeed = npc.speed ?? 1.2;
        const panicSpeed = baseSpeed * PANIC_SPEED_MULTIPLIER;

        const targetX = npc.x + (awayX / length) * panicSpeed;
        const targetY = npc.y + (awayY / length) * panicSpeed;

        const result = this.entityMover.move(npc, targetX, targetY);

        let moved = result.moved;

        // Wenn nicht bewegt oder im Gebaeude: teleportieren
        if (!moved) {
            const insideBuilding = this._isInsideAnyBuilding(npc.x, npc.y);
            const now = this._getTimestamp();
            if (this._teleportToNearestSidewalk(npc, insideBuilding ? 'building' : 'idle', now)) {
                moved = true;
            }
        }

        npc.moving = moved;
        npc.waitTimer = 0;
        npc.isCrossing = false;
        npc.waitingForCrosswalk = null;

        npc.animationPhase = (npc.animationPhase + panicSpeed * PANIC_ANIM_FACTOR) % (Math.PI * 2);

        npc.panicTimer = Math.max(0, (npc.panicTimer ?? 0) - 1);

        if (npc.panicTimer === 0) {
            npc.waitTimer = POST_PANIC_WAIT;
        }
    }

    // -------------------------------------------------------------------
    //  Stuck-Detection  (portiert aus updateNPC Zeilen 5750-5788 +
    //                     updateNpcMovementTracker Zeilen 6343-6408)
    // -------------------------------------------------------------------

    /**
     * @param {import('../entities/NPC.js').NPC} npc
     */
    _updateStuckDetection(npc) {
        const now = this._getTimestamp();
        const stepDistance = Math.hypot(npc.x - (npc._prevX ?? npc.x), npc.y - (npc._prevY ?? npc.y));

        // Position fuer naechsten Frame merken (kein direktes Setzen von x/y!)
        npc._prevX = npc.x;
        npc._prevY = npc.y;

        const tracker = this._updateMovementTracker(npc, stepDistance, now);

        // Pruefe ob NPC im Gebaeude steckt
        const insideBuilding = this._isInsideAnyBuilding(npc.x, npc.y);
        const wantsTeleportInside = insideBuilding && !npc.hidden && !npc.insideBuilding;

        if (wantsTeleportInside) {
            if (this._teleportToNearestSidewalk(npc, 'building', now)) {
                npc.moving = false;
            }
            return;
        }

        // Stuck/Idle-Teleport
        if (tracker && npc.waitTimer === 0) {
            const idleThreshold = tracker.idleThreshold ?? 3500;
            const maxStuckSamples = tracker.maxStuckSamples ?? 2;
            const idleTooLong = tracker.idleTime >= idleThreshold;
            const stuckTooOften = (tracker.stuckSamples ?? 0) >= maxStuckSamples;

            if (idleTooLong || stuckTooOften) {
                if (this._teleportToNearestSidewalk(npc, 'idle', now)) {
                    npc.moving = false;
                }
            }
        }
    }

    /**
     * Aktualisiert den Movement-Tracker eines NPC.
     * Portiert aus updateNpcMovementTracker() (Zeilen 6343-6408).
     *
     * @param {import('../entities/NPC.js').NPC} npc
     * @param {number} stepDistance - Bewegungsdistanz in diesem Frame
     * @param {number} timestamp
     * @returns {Object|null} Der Tracker
     */
    _updateMovementTracker(npc, stepDistance, timestamp) {
        const tracker = npc.ensureMovementTracker(timestamp);

        if (!tracker) {
            return null;
        }

        const time = Number.isFinite(timestamp) ? timestamp : tracker.lastUpdateTime;
        const delta = Math.max(0, time - tracker.lastUpdateTime);
        tracker.lastUpdateTime = time;

        const motionThreshold = tracker.motionThreshold ?? 0.45;

        if (npc.waitTimer > 0) {
            tracker.idleTime = 0;
        } else if (stepDistance <= motionThreshold) {
            tracker.idleTime += delta;
        } else {
            tracker.idleTime = 0;
        }

        if (!tracker.samplePosition) {
            tracker.samplePosition = { x: npc.x, y: npc.y };
            tracker.sampleTime = time;
        }

        const sampleWindow = tracker.sampleWindow ?? 4000;

        if (time - tracker.sampleTime >= sampleWindow) {
            const displacement = Math.hypot(
                npc.x - tracker.samplePosition.x,
                npc.y - tracker.samplePosition.y
            );

            tracker.samplePosition = { x: npc.x, y: npc.y };
            tracker.sampleTime = time;

            if (npc.waitTimer === 0 && displacement < (tracker.minDisplacement ?? 12)) {
                tracker.stuckSamples = Math.min(
                    (tracker.stuckSamples ?? 0) + 1,
                    tracker.maxStuckSamples ?? 2
                );
            } else {
                tracker.stuckSamples = Math.max(0, (tracker.stuckSamples ?? 0) - 1);
            }
        }

        return tracker;
    }

    // -------------------------------------------------------------------
    //  Animation  (portiert aus updateNPC Zeilen 5796-5808)
    // -------------------------------------------------------------------

    /**
     * @param {import('../entities/NPC.js').NPC} npc
     */
    _updateAnimation(npc) {
        if (npc.moving && npc.waitTimer === 0) {
            npc.animationPhase = (npc.animationPhase + npc.speed * WALK_ANIM_FACTOR) % (Math.PI * 2);
        } else {
            npc.animationPhase *= ANIM_DECAY;
        }
    }

    // -------------------------------------------------------------------
    //  Teleport zum naechsten Buergersteig
    //  (portiert aus teleportNpcToNearestSidewalk Zeilen 6669-6786)
    // -------------------------------------------------------------------

    /**
     * @param {import('../entities/NPC.js').NPC} npc
     * @param {string} reason - 'building' oder 'idle'
     * @param {number} timestamp
     * @returns {boolean} Ob teleportiert wurde
     */
    _teleportToNearestSidewalk(npc, reason, timestamp) {
        if (!npc || npc.fixedSpawn) {
            return false;
        }

        const tracker = npc.ensureMovementTracker(timestamp);

        if (!tracker) {
            return false;
        }

        const time = Number.isFinite(timestamp) ? timestamp : tracker.lastUpdateTime;

        // Bei Idle zuerst Richtungswechsel versuchen
        if (reason === 'idle') {
            if (this._redirectOnWalkwayEdge(npc, time)) {
                return false;
            }
        }

        // Cooldown pruefen
        const cooldown = Number(tracker.teleportCooldown) || 4000;
        if (time - tracker.lastTeleportAt < cooldown) {
            return false;
        }

        let searchX = npc.x;
        let searchY = npc.y;
        let minDistance = reason === 'idle' ? IDLE_MIN_TELEPORT_DISTANCE : BUILDING_MIN_TELEPORT_DISTANCE;

        // Bei Gebaeude: Exit-Punkt als Startpunkt
        let buildingIdForTeleport = null;
        if (reason === 'building') {
            buildingIdForTeleport = npc.insideBuilding || npc.lastBuildingId || null;
            const exit = this._getBuildingSidewalkExit(buildingIdForTeleport);
            if (exit) {
                searchX = exit.x;
                searchY = exit.y;
                minDistance = Math.max(minDistance, BUILDING_EXIT_MIN_DISTANCE);
            }
        }

        let candidate = this._findNearestSidewalkSpot(searchX, searchY, { minDistance });

        if (!candidate) {
            candidate = this._findNearestSidewalkSpot(npc.x, npc.y, { minDistance: 0 });
        }

        if (!candidate) {
            return false;
        }

        // Teleportiere via EntityMover
        this.entityMover.teleport(npc, candidate.x, candidate.y);

        npc.waitTimer = 0;
        npc.hidden = false;
        npc.insideBuilding = null;

        if (buildingIdForTeleport) {
            npc.lastBuildingId = buildingIdForTeleport;
        }

        // Tracker zuruecksetzen
        tracker.lastTeleportAt = time;
        tracker.idleTime = 0;
        tracker.stuckSamples = 0;
        tracker.samplePosition = { x: npc.x, y: npc.y };
        tracker.sampleTime = time;

        return true;
    }

    // -------------------------------------------------------------------
    //  Richtungswechsel am Gehweg-Rand
    //  (portiert aus redirectNpcOnWalkwayEdge Zeilen 6603-6668)
    // -------------------------------------------------------------------

    /**
     * @param {import('../entities/NPC.js').NPC} npc
     * @param {number} timestamp
     * @returns {boolean} Ob umgeleitet wurde
     */
    _redirectOnWalkwayEdge(npc, timestamp) {
        if (!npc || !Array.isArray(npc.path) || npc.path.length < 2) {
            return false;
        }

        const turnOptions = [1, 2, -1];
        const choice = turnOptions[Math.floor(Math.random() * turnOptions.length)];

        let nextIndex = npc.waypointIndex;

        if (!Number.isFinite(nextIndex)) {
            nextIndex = 0;
        }

        if (choice === -1) {
            nextIndex = (nextIndex - 1 + npc.path.length) % npc.path.length;
        } else {
            nextIndex = (nextIndex + choice + npc.path.length) % npc.path.length;
        }

        npc.waypointIndex = nextIndex;
        npc.waitTimer = Math.max(REDIRECT_MIN_WAIT, Math.round(REDIRECT_MIN_WAIT + Math.random() * REDIRECT_RANDOM_WAIT));

        // Auf naechsten Buergersteig projizieren via entityMover
        if (this.roadNetwork) {
            const spot = this.roadNetwork.findNearestSidewalkSpot(npc.x, npc.y);
            if (spot && Number.isFinite(spot.x) && Number.isFinite(spot.y)) {
                this.entityMover.teleport(npc, spot.x, spot.y);
            }
        }

        // Tracker zuruecksetzen
        const tracker = npc.ensureMovementTracker(timestamp);
        if (tracker) {
            const time = Number.isFinite(timestamp) ? timestamp : tracker.lastUpdateTime;
            tracker.lastTeleportAt = time;
            tracker.idleTime = 0;
            tracker.stuckSamples = 0;
            tracker.samplePosition = { x: npc.x, y: npc.y };
            tracker.sampleTime = time;
        }

        return true;
    }

    // -------------------------------------------------------------------
    //  Dynamische Wegpunkt-Generierung
    // -------------------------------------------------------------------

    /**
     * Generiert dynamisch den naechsten Wegpunkt basierend auf verfuegbaren
     * Buergersteig-Korridoren. NPC waehlt an Kreuzungen zufaellig eine
     * neue Richtung und vermeidet Umkehr.
     *
     * @param {import('../entities/NPC.js').NPC} npc
     */
    _generateDynamicWaypoint(npc) {
        if (!this.roadNetwork) {
            return;
        }

        const corridors = this.roadNetwork.sidewalkCorridors;
        if (!Array.isArray(corridors) || !corridors.length) {
            return;
        }

        // Korridore finden die den NPC enthalten
        const margin = 10;
        const nearby = [];
        for (const c of corridors) {
            if (!c || !(c.width > 0) || !(c.height > 0)) {
                continue;
            }
            if (npc.x >= c.x - margin && npc.x <= c.x + c.width + margin &&
                npc.y >= c.y - margin && npc.y <= c.y + c.height + margin) {
                nearby.push(c);
            }
        }

        if (!nearby.length) {
            return;
        }

        // Endpunkte der Korridore als Kandidaten sammeln
        const candidates = [];
        const edgePad = 12;

        for (const c of nearby) {
            const isHorizontal = c.width > c.height * 1.5;
            const isVertical = c.height > c.width * 1.5;
            const centerX = c.x + c.width / 2;
            const centerY = c.y + c.height / 2;

            if (isHorizontal || (!isHorizontal && !isVertical)) {
                candidates.push({ x: c.x + edgePad, y: centerY, dir: 'left' });
                candidates.push({ x: c.x + c.width - edgePad, y: centerY, dir: 'right' });
            }
            if (isVertical || (!isHorizontal && !isVertical)) {
                candidates.push({ x: centerX, y: c.y + edgePad, dir: 'up' });
                candidates.push({ x: centerX, y: c.y + c.height - edgePad, dir: 'down' });
            }
        }

        // Nur Kandidaten die weit genug entfernt sind
        const minDist = 40;
        let valid = candidates.filter(
            (c) => Math.hypot(c.x - npc.x, c.y - npc.y) > minDist
        );

        // Umkehr vermeiden (nicht zurueck woher wir kamen)
        if (valid.length > 1 && npc._lastNavDir) {
            const opposite = { left: 'right', right: 'left', up: 'down', down: 'up' };
            const notBack = valid.filter((c) => c.dir !== opposite[npc._lastNavDir]);
            if (notBack.length > 0) {
                valid = notBack;
            }
        }

        // Kandidaten die in Gebaeude-Collidern liegen herausfiltern
        if (this.collisionSystem) {
            valid = valid.filter(c => !this.collisionSystem.isPointInsideAnyCollider(c.x, c.y));
        }

        if (!valid.length) {
            // Fallback auf ungefilterte Kandidaten (ohne Gebaeude-Check)
            valid = candidates.filter(c =>
                !this.collisionSystem || !this.collisionSystem.isPointInsideAnyCollider(c.x, c.y)
            );
        }
        if (!valid.length) {
            valid = candidates;
        }
        if (!valid.length) {
            return;
        }

        const target = valid[Math.floor(Math.random() * valid.length)];
        npc._lastNavDir = target.dir;

        // Pfad auf 2 Punkte setzen: aktuelle Position + Ziel
        npc.path[0] = { x: npc.x, y: npc.y, wait: 0 };
        npc.path[1] = { x: target.x, y: target.y, wait: 4 + Math.floor(Math.random() * 20) };
        npc.path.length = 2;
        npc.waypointIndex = 1;
    }

    // -------------------------------------------------------------------
    //  Naechsten Buergersteig-Spot finden
    //  (portiert aus findNearestSidewalkSpot Zeilen 6409-6534)
    // -------------------------------------------------------------------

    /**
     * @param {number} x
     * @param {number} y
     * @param {Object} [options]
     * @param {number} [options.minDistance=0]
     * @returns {{ x: number, y: number }|null}
     */
    _findNearestSidewalkSpot(x, y, options = {}) {
        if (!this.roadNetwork) {
            return null;
        }

        const minDistance = Math.max(0, Number(options.minDistance) || 0);
        const minDistSq = minDistance * minDistance;

        const candidates = [];

        const collisionSystem = this.collisionSystem;

        const addCandidate = (px, py) => {
            if (!Number.isFinite(px) || !Number.isFinite(py)) {
                return;
            }

            // Nicht in Gebaeude
            if (collisionSystem && collisionSystem.isPointInsideAnyCollider(px, py)) {
                return;
            }

            // Nicht in Fahrzeug
            if (collisionSystem && Array.isArray(collisionSystem.vehicleColliders)) {
                for (const vehicle of collisionSystem.vehicleColliders) {
                    if (!vehicle) {
                        continue;
                    }
                    if (
                        px >= vehicle.left - VEHICLE_CLEAR_PADDING &&
                        px <= vehicle.right + VEHICLE_CLEAR_PADDING &&
                        py >= vehicle.top - VEHICLE_CLEAR_PADDING &&
                        py <= vehicle.bottom + VEHICLE_CLEAR_PADDING
                    ) {
                        return;
                    }
                }
            }

            candidates.push({ x: px, y: py });
        };

        // Projektion auf naechsten Buergersteig
        const spot = this.roadNetwork.findNearestSidewalkSpot(x, y);
        if (spot) {
            addCandidate(spot.x, spot.y);
        }

        // Walkable-Areas Zentren als Kandidaten
        const walkableAreas = this.roadNetwork.walkableAreas;
        if (Array.isArray(walkableAreas) && walkableAreas.length) {
            for (const rect of walkableAreas) {
                if (!rect) {
                    continue;
                }
                const rw = Number(rect.width ?? 0);
                const rh = Number(rect.height ?? 0);
                const rx = Number(rect.x ?? 0);
                const ry = Number(rect.y ?? 0);

                if (rw > 0 && rh > 0) {
                    addCandidate(rx + rw / 2, ry + rh / 2);
                }
            }
        }

        // Besten Kandidaten waehlen (naechster mit Mindestabstand)
        let best = null;
        let bestDistSq = Infinity;

        for (const candidate of candidates) {
            const dx = candidate.x - x;
            const dy = candidate.y - y;
            const distSq = dx * dx + dy * dy;

            if (distSq < minDistSq) {
                continue;
            }

            if (distSq < bestDistSq) {
                bestDistSq = distSq;
                best = candidate;
            }
        }

        // Fallback: Ohne Mindestabstand wiederholen
        if (!best && minDistance > 0) {
            return this._findNearestSidewalkSpot(x, y, { ...options, minDistance: 0 });
        }

        return best;
    }

    // -------------------------------------------------------------------
    //  Gebaeude-Buergersteig-Exit finden
    //  (portiert aus getBuildingSidewalkExit Zeilen 6535-6602)
    // -------------------------------------------------------------------

    /**
     * @param {*} buildingId
     * @returns {{ x: number, y: number }|null}
     */
    _getBuildingSidewalkExit(buildingId) {
        if (!buildingId) {
            return null;
        }

        const buildings = Array.isArray(this.buildings) ? this.buildings : [];
        const building = buildings.find(
            (entry) => entry && (entry.id === buildingId || entry.name === buildingId)
        );

        if (!building) {
            return null;
        }

        const metrics = building.metrics ?? null;

        if (metrics && metrics.approach) {
            return { x: metrics.approach.x, y: metrics.approach.y };
        }

        if (metrics && metrics.entrance) {
            return { x: metrics.entrance.x, y: metrics.entrance.y + 6 };
        }

        if (metrics && metrics.bounds) {
            const bounds = metrics.bounds;
            if (bounds && Number.isFinite(bounds.left) && Number.isFinite(bounds.right) && Number.isFinite(bounds.bottom)) {
                return { x: (bounds.left + bounds.right) / 2, y: bounds.bottom + 12 };
            }
        }

        if (building.bounds && Number.isFinite(building.bounds.left) && Number.isFinite(building.bounds.right) && Number.isFinite(building.bounds.bottom)) {
            return { x: (building.bounds.left + building.bounds.right) / 2, y: building.bounds.bottom + 12 };
        }

        const baseX = Number(building.x);
        const baseY = Number(building.y);
        const width = Number(building.width);
        const height = Number(building.height);

        if (Number.isFinite(baseX) && Number.isFinite(baseY) && Number.isFinite(width) && Number.isFinite(height)) {
            return { x: baseX + width / 2, y: baseY + height + 12 };
        }

        return null;
    }

    // -------------------------------------------------------------------
    //  Hilfsfunktionen
    // -------------------------------------------------------------------

    /**
     * Prueft ob ein Punkt in einem Zebrastreifen liegt.
     * Delegiert an RoadNetwork falls vorhanden.
     *
     * @param {number} x
     * @param {number} y
     * @returns {boolean}
     */
    _isOnCrosswalk(x, y) {
        if (!this.roadNetwork || !Array.isArray(this.roadNetwork.crosswalks)) {
            return false;
        }

        for (const cw of this.roadNetwork.crosswalks) {
            if (!cw) {
                continue;
            }

            // Zebrastreifen koennen als Flaeche { left, top, right, bottom }
            // oder als { x, y, span, orientation } definiert sein
            if (cw.left !== undefined && cw.right !== undefined && cw.top !== undefined && cw.bottom !== undefined) {
                if (x >= cw.left && x <= cw.right && y >= cw.top && y <= cw.bottom) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Prueft ob ein Punkt in irgendeinem Gebaeude-Collider liegt.
     *
     * @param {number} x
     * @param {number} y
     * @returns {boolean}
     */
    _isInsideAnyBuilding(x, y) {
        if (!this.collisionSystem) {
            return false;
        }
        return this.collisionSystem.isPointInsideAnyCollider(x, y);
    }

    /**
     * Gibt den aktuellen Zeitstempel zurueck.
     *
     * @returns {number}
     */
    _getTimestamp() {
        return (typeof performance !== 'undefined' && performance.now)
            ? performance.now()
            : Date.now();
    }
}




// ═══════════════════════════════════════════════════════
// js/systems/VehicleSystem.js
// ═══════════════════════════════════════════════════════
/**
 * VehicleSystem - Steuert Fahrzeug-Bewegung entlang ihrer Pfade.
 *
 * Portiert aus gta_old/overworld/js/overworld.js:
 *   updateVehicle()                  (Zeilen 6888-6960)
 *   shouldVehicleYield()             (Zeilen 6986-7044)
 *   isVehicleAlignedForCrosswalk()   (Zeilen 7048-7066)
 *   isVehicleApproachingCrosswalk()  (Zeilen 7070-7100)
 *
 * KRITISCH: Positionsaenderungen NUR ueber entityMover.move()!
 */

class VehicleSystem {
    /**
     * @param {import('../core/EntityMover.js').EntityMover} entityMover
     * @param {import('./CollisionSystem.js').CollisionSystem} collisionSystem
     * @param {import('../world/RoadNetwork.js').RoadNetwork} roadNetwork
     */
    constructor(entityMover, collisionSystem, roadNetwork) {
        this.entityMover = entityMover;
        this.collisionSystem = collisionSystem;
        this.roadNetwork = roadNetwork;
    }

    // ------------------------------------------------------------------
    //  update  -  Alle Fahrzeuge pro Frame aktualisieren.
    // ------------------------------------------------------------------

    /**
     * @param {Array<import('../entities/Vehicle.js').Vehicle>} vehicles
     * @param {Array<import('../entities/NPC.js').NPC>} npcs
     * @param {number} deltaTime - (aktuell ungenutzt, reserviert fuer spaetere Frame-Skalierung)
     */
    update(vehicles, npcs, deltaTime) {
        if (!Array.isArray(vehicles)) {
            return;
        }

        for (const vehicle of vehicles) {
            this._updateVehicle(vehicle, npcs);
        }
    }

    // ------------------------------------------------------------------
    //  _updateVehicle  -  Einzelnes Fahrzeug bewegen.
    //  Portiert aus updateVehicle() Zeilen 6888-6960.
    // ------------------------------------------------------------------

    /** @private */
    _updateVehicle(vehicle, npcs) {
        if (!vehicle || !vehicle.path || vehicle.path.length < 2) {
            return;
        }

        const target = vehicle.getCurrentWaypoint();
        if (!target) {
            return;
        }

        const dx = target.x - vehicle.x;
        const dy = target.y - vehicle.y;
        const dist = Math.hypot(dx, dy);

        const stepX = dist === 0 ? 0 : (dx / dist) * vehicle.speed;
        const stepY = dist === 0 ? 0 : (dy / dist) * vehicle.speed;

        // Warte-Timer (z.B. an Haltestellen)
        if (vehicle.waitTimer > 0) {
            vehicle.waitTimer -= 1;
            return;
        }

        // Stop-Timer (Yield-Nachlaeufer)
        if (vehicle.stopTimer > 0) {
            if (this.shouldYield(vehicle, stepX, stepY, npcs)) {
                vehicle.stopTimer = Math.max(vehicle.stopTimer, 6);
            } else {
                vehicle.stopTimer -= 1;
            }
            return;
        }

        // Waypoint erreicht?
        if (dist <= vehicle.speed) {
            // Teleport exakt auf den Waypoint
            this.entityMover.move(vehicle, target.x, target.y, {
                ignoreSidewalk: true,
                ignoreCollision: true,
            });
            vehicle.waitTimer = target.wait ?? 0;
            vehicle.advanceWaypoint();
            return;
        }

        // Yield-Check (Fussgaenger auf Zebrastreifen)
        if (this.shouldYield(vehicle, stepX, stepY, npcs)) {
            vehicle.stopTimer = 12;
            return;
        }

        // Rotation setzen
        vehicle.rotation = Math.atan2(stepY, stepX);

        // Bewegung ueber EntityMover (EINZIGE Stelle fuer x/y!)
        const targetX = vehicle.x + stepX;
        const targetY = vehicle.y + stepY;

        this.entityMover.move(vehicle, targetX, targetY, {
            ignoreSidewalk: true,
        });
    }

    // ------------------------------------------------------------------
    //  shouldYield  -  Prueft ob das Fahrzeug einem Fussgaenger
    //                   auf einem Zebrastreifen Vorfahrt gewaehren muss.
    //  Portiert aus shouldVehicleYield() Zeilen 6986-7044.
    // ------------------------------------------------------------------

    /**
     * @param {import('../entities/Vehicle.js').Vehicle} vehicle
     * @param {number} stepX
     * @param {number} stepY
     * @param {Array<import('../entities/NPC.js').NPC>} npcs
     * @returns {boolean}
     */
    shouldYield(vehicle, stepX, stepY, npcs) {
        const crosswalkAreas = this.roadNetwork.crosswalkAreas ?? [];

        if (!crosswalkAreas.length || !Array.isArray(npcs)) {
            return false;
        }

        const orientation = Math.abs(stepX) >= Math.abs(stepY) ? 'horizontal' : 'vertical';
        const direction = orientation === 'horizontal'
            ? (Math.sign(stepX) || 1)
            : (Math.sign(stepY) || 1);

        const halfWidth = vehicle.width / 2;
        const halfHeight = vehicle.height / 2;

        for (const area of crosswalkAreas) {
            if (area.orientation !== orientation) {
                continue;
            }

            if (!this._isAlignedForCrosswalk(vehicle, area, orientation, halfWidth, halfHeight)) {
                continue;
            }

            if (!this._isApproachingCrosswalk(vehicle, area, orientation, direction, stepX, stepY, halfWidth, halfHeight)) {
                continue;
            }

            const npcBlocking = npcs.some((npc) => {
                if (!npc || npc.dead) {
                    return false;
                }

                if (npc.isCrossing && _isPointInsideArea(npc.x, npc.y, area)) {
                    return true;
                }

                return npc.waitingForCrosswalk === area.id;
            });

            if (npcBlocking) {
                return true;
            }
        }

        return false;
    }

    // ------------------------------------------------------------------
    //  _isAlignedForCrosswalk  -  Prueft ob das Fahrzeug auf einer
    //                              Spur liegt die den Zebrastreifen kreuzt.
    //  Portiert aus isVehicleAlignedForCrosswalk() Zeilen 7048-7066.
    // ------------------------------------------------------------------

    /** @private */
    _isAlignedForCrosswalk(vehicle, area, orientation, halfWidth, halfHeight) {
        if (orientation === 'horizontal') {
            const yTop = vehicle.y - halfHeight;
            const yBottom = vehicle.y + halfHeight;
            return !(yBottom < area.top - 6 || yTop > area.bottom + 6);
        }

        const xLeft = vehicle.x - halfWidth;
        const xRight = vehicle.x + halfWidth;
        return !(xRight < area.left - 6 || xLeft > area.right + 6);
    }

    // ------------------------------------------------------------------
    //  _isApproachingCrosswalk  -  Prueft ob das Fahrzeug sich gerade
    //                               auf den Zebrastreifen zubewegt.
    //  Portiert aus isVehicleApproachingCrosswalk() Zeilen 7070-7100.
    // ------------------------------------------------------------------

    /** @private */
    _isApproachingCrosswalk(vehicle, area, orientation, direction, stepX, stepY, halfWidth, halfHeight) {
        if (orientation === 'horizontal') {
            const frontBefore = direction > 0
                ? vehicle.x + halfWidth
                : vehicle.x - halfWidth;
            const frontAfter = frontBefore + stepX;

            if (direction > 0) {
                return frontBefore <= area.left - 4 && frontAfter >= area.left;
            }

            return frontBefore >= area.right + 4 && frontAfter <= area.right;
        }

        const frontBefore = direction > 0
            ? vehicle.y + halfHeight
            : vehicle.y - halfHeight;
        const frontAfter = frontBefore + stepY;

        if (direction > 0) {
            return frontBefore <= area.top - 4 && frontAfter >= area.top;
        }

        return frontBefore >= area.bottom + 4 && frontAfter <= area.bottom;
    }
}

// ------------------------------------------------------------------
//  Modul-private Hilfsfunktion
// ------------------------------------------------------------------

/**
 * Prueft ob ein Punkt innerhalb einer Area (left/right/top/bottom) liegt.
 * Portiert aus isPointInsideArea() Zeilen 7104-7107.
 *
 * @param {number} x
 * @param {number} y
 * @param {{ left: number, right: number, top: number, bottom: number }} area
 * @returns {boolean}
 */
function _isPointInsideArea(x, y, area) {
    return x >= area.left && x <= area.right && y >= area.top && y <= area.bottom;
}




// ═══════════════════════════════════════════════════════
// js/systems/CameraSystem.js
// ═══════════════════════════════════════════════════════
/**
 * CameraSystem — Kamera folgt dem Spieler, clampt an Weltgrenzen.
 * Portiert aus gta_old/overworld/js/overworld.js updateCamera() (Z.1205-1223)
 */
class CameraSystem {

    /**
     * @param {number} viewportWidth  - Canvas-Breite
     * @param {number} viewportHeight - Canvas-Höhe
     * @param {number} [zoom=1]       - Zoom-Faktor (1 = kein Zoom)
     */
    constructor(viewportWidth, viewportHeight, zoom = 1) {
        this.x = 0;
        this.y = 0;
        this.width = viewportWidth;
        this.height = viewportHeight;
        this.zoom = zoom;
    }

    /**
     * Kamera auf Ziel-Entity zentrieren und an Weltgrenzen clampen.
     * Portiert aus updateCamera() (Z.1205-1223).
     *
     * @param {object} targetEntity - Objekt mit {x, y}
     * @param {object} worldBounds  - {width, height} der Welt
     */
    update(targetEntity, worldBounds) {
        // Effektive Viewport-Größe (berücksichtigt Zoom)
        const vw = this.width / this.zoom;
        const vh = this.height / this.zoom;

        // Kamera zentriert auf Entity
        this.x = targetEntity.x - vw / 2;
        this.y = targetEntity.y - vh / 2;

        // An Weltgrenzen clampen (westliche Grenze erlaubt Blick aufs Meer)
        const westLimit = -(this.oceanOverflow ?? 0);
        this.x = Math.max(westLimit, Math.min(this.x, worldBounds.width - vw));
        this.y = Math.max(0, Math.min(this.y, worldBounds.height - vh));
    }

    /**
     * Weltkoordinaten → Bildschirmkoordinaten.
     * @param {number} wx
     * @param {number} wy
     * @returns {{sx: number, sy: number}}
     */
    worldToScreen(wx, wy) {
        return {
            sx: (wx - this.x) * this.zoom,
            sy: (wy - this.y) * this.zoom
        };
    }

    /**
     * Bildschirmkoordinaten → Weltkoordinaten.
     * @param {number} sx
     * @param {number} sy
     * @returns {{wx: number, wy: number}}
     */
    screenToWorld(sx, sy) {
        return {
            wx: sx / this.zoom + this.x,
            wy: sy / this.zoom + this.y
        };
    }
}



// ═══════════════════════════════════════════════════════
// js/systems/DayNightSystem.js
// ═══════════════════════════════════════════════════════
/**
 * DayNightSystem - Verwaltet den Tag/Nacht-Zyklus mit Phasen, Beleuchtung und Sternen.
 */

class DayNightSystem {

    constructor() {
        const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();

        this.phases = [
            { id: "day", duration: 300000 },
            { id: "dusk", duration: 120000 },
            { id: "night", duration: 300000 },
            { id: "dawn", duration: 120000 }
        ];

        this.phaseIndex = 0;
        this.phaseStart = now;
        this.lastUpdate = now;
        this.progress = 0;
        this.currentPhase = this.phases[0];
        this.starPhase = 0;
        this.stars = DayNightSystem.generateNightSkyStars(160);

        this.lighting = {
            overlayAlpha: 0,
            overlayTop: "rgba(0, 0, 0, 0)",
            overlayBottom: "rgba(0, 0, 0, 0)",
            horizon: null,
            starAlpha: 0
        };
    }

    /**
     * Erzeugt zufaellige Sterne fuer den Nachthimmel.
     * @param {number} count
     * @returns {Array<{x:number,y:number,size:number,twinkleOffset:number,twinkleSpeed:number,baseIntensity:number}>}
     */
    static generateNightSkyStars(count = 160) {
        const total = Math.max(0, Math.floor(count));
        const stars = [];

        for (let i = 0; i < total; i++) {
            const randomness = Math.random();
            stars.push({
                x: Math.random(),
                y: Math.random() * 0.65,
                size: 0.6 + Math.random() * 1.4,
                twinkleOffset: Math.random() * Math.PI * 2,
                twinkleSpeed: 0.6 + Math.random() * 1.4,
                baseIntensity: 0.4 + randomness * 0.6
            });
        }

        return stars;
    }

    /**
     * Aktualisiert den Zyklus anhand des aktuellen Zeitstempels.
     * @param {number} now - Zeitstempel in Millisekunden (performance.now)
     */
    update(now) {
        if (!Array.isArray(this.phases) || this.phases.length === 0) {
            return;
        }

        if (!Number.isFinite(this.phaseIndex)) {
            this.phaseIndex = 0;
        }

        if (!Number.isFinite(this.phaseStart)) {
            this.phaseStart = now;
        }

        let phase = this.phases[Math.max(0, Math.min(this.phaseIndex, this.phases.length - 1))];
        let elapsed = now - this.phaseStart;

        if (!Number.isFinite(elapsed) || elapsed < 0) {
            elapsed = 0;
            this.phaseStart = now;
            phase = this.phases[0];
            this.phaseIndex = 0;
        }

        let duration = Math.max(1, Number(phase.duration) || 0);

        while (elapsed >= duration) {
            elapsed -= duration;
            this.phaseIndex = (this.phaseIndex + 1) % this.phases.length;
            phase = this.phases[this.phaseIndex];
            duration = Math.max(1, Number(phase.duration) || 0);
            this.phaseStart = now - elapsed;
        }

        const progress = duration > 0 ? Math.min(1, Math.max(0, elapsed / duration)) : 0;

        const delta = now - (this.lastUpdate ?? now);
        this.lastUpdate = now;

        if (!Number.isFinite(this.starPhase)) {
            this.starPhase = 0;
        }

        if (Number.isFinite(delta) && delta > 0) {
            this.starPhase = (this.starPhase + delta * 0.0015) % (Math.PI * 2);
        }

        this.progress = progress;
        this.currentPhase = phase;
        this.lighting = this.computeLighting(String(phase.id ?? ''), progress);
    }

    /**
     * Gibt das aktuelle Lighting-Objekt zurueck.
     * @returns {{phaseId:string, overlayAlpha:number, overlayTop:string, overlayBottom:string, horizon:object|null, starAlpha:number}}
     */
    getCurrentLighting() {
        return this.lighting;
    }

    // ── Beleuchtungsberechnung ──────────────────────────────────────────

    /**
     * Berechnet die Beleuchtungswerte fuer eine Phase und deren Fortschritt.
     * @param {string} phaseId
     * @param {number} progress - 0..1
     * @returns {{phaseId:string, overlayAlpha:number, overlayTop:string, overlayBottom:string, horizon:object|null, starAlpha:number}}
     */
    computeLighting(phaseId, progress) {
        const t = Math.max(0, Math.min(1, Number(progress) || 0));
        const sampleStops = (stops, value) => DayNightSystem.sampleColorStops(stops, Math.max(0, Math.min(1, value)));

        const duskSkyStops = [
            { at: 0, color: [80, 110, 180, 0.82] },
            { at: 0.33, color: [180, 140, 120, 0.85] },
            { at: 0.66, color: [100, 60, 80, 0.90] },
            { at: 1, color: [10, 10, 24, 0.98] }
        ];

        const duskHorizonStops = [
            { at: 0, color: [200, 180, 140, 0.78] },
            { at: 0.4, color: [180, 130, 100, 0.82] },
            { at: 0.75, color: [110, 60, 70, 0.88] },
            { at: 1, color: [14, 12, 30, 0.94] }
        ];

        const nightSkyTop = [16, 24, 58, 0.92];
        const nightSkyBottom = [6, 10, 24, 0.96];

        const result = {
            phaseId: phaseId || 'day',
            overlayAlpha: 0,
            overlayTop: 'rgba(0, 0, 0, 0)',
            overlayBottom: 'rgba(0, 0, 0, 0)',
            horizon: null,
            starAlpha: 0
        };

        switch (phaseId) {

            case 'dusk': {
                const skyTop = sampleStops(duskSkyStops, t);
                const skyBottom = sampleStops(duskHorizonStops, Math.min(1, t + 0.15));
                const horizonTop = sampleStops(duskHorizonStops, Math.max(0, t - 0.15));
                const horizonBottom = sampleStops(duskHorizonStops, t);

                result.overlayAlpha = 0.35 + t * 0.57;
                result.overlayTop = DayNightSystem.colorArrayToRgba(skyTop);
                result.overlayBottom = DayNightSystem.colorArrayToRgba(skyBottom);
                result.horizon = {
                    alpha: 0.35 + t * 0.45,
                    top: DayNightSystem.colorArrayToRgba(horizonTop),
                    bottom: DayNightSystem.colorArrayToRgba(horizonBottom),
                    offsetTop: 0.25
                };
                result.starAlpha = 0;
                break;
            }

            case 'night': {
                result.overlayAlpha = 0.92;
                result.overlayTop = DayNightSystem.colorArrayToRgba([2, 2, 6, 0.98]);
                result.overlayBottom = DayNightSystem.colorArrayToRgba([0, 0, 0, 0.99]);
                result.horizon = null;
                result.starAlpha = 0;
                break;
            }

            case 'dawn': {
                const reverse = 1 - t;
                const skyTop = sampleStops(duskSkyStops, reverse);
                const skyBottom = sampleStops(duskHorizonStops, Math.min(1, reverse + 0.1));
                const horizonTop = sampleStops(duskHorizonStops, reverse);
                const horizonBottom = sampleStops(duskHorizonStops, Math.max(0, reverse - 0.1));

                result.overlayAlpha = 0.52 * reverse;
                result.overlayTop = DayNightSystem.colorArrayToRgba(skyTop);
                result.overlayBottom = DayNightSystem.colorArrayToRgba(skyBottom);
                result.horizon = {
                    alpha: 0.28 + reverse * 0.3,
                    top: DayNightSystem.colorArrayToRgba(horizonTop),
                    bottom: DayNightSystem.colorArrayToRgba(horizonBottom),
                    offsetTop: 0.28
                };
                result.starAlpha = 0;
                break;
            }

            case 'day':
            default: {
                const warmFactor = Math.sin(t * Math.PI);
                const top = DayNightSystem.lerpColor([255, 250, 238, 0.08], [255, 236, 204, 0.18], warmFactor);
                const bottom = DayNightSystem.lerpColor([255, 236, 196, 0.1], [255, 220, 174, 0.18], warmFactor);

                result.overlayAlpha = 0.18 + warmFactor * 0.05;
                result.overlayTop = DayNightSystem.colorArrayToRgba(top);
                result.overlayBottom = DayNightSystem.colorArrayToRgba(bottom);
                result.horizon = {
                    alpha: 0.2 + warmFactor * 0.12,
                    top: DayNightSystem.colorArrayToRgba([255, 232, 188, 0.32 + warmFactor * 0.1]),
                    bottom: DayNightSystem.colorArrayToRgba([255, 214, 162, 0.34 + warmFactor * 0.12]),
                    offsetTop: 0.35
                };
                result.starAlpha = 0;
                break;
            }

        }

        return result;
    }

    // ── Statische Farb-Hilfsfunktionen ──────────────────────────────────

    /**
     * Interpoliert zwischen Farbstops anhand eines Werts (0..1).
     * @param {Array<{at:number, color:number[]}>} stops
     * @param {number} value
     * @returns {number[]}
     */
    static sampleColorStops(stops, value) {
        if (!Array.isArray(stops) || stops.length === 0) {
            return [0, 0, 0, 0];
        }

        const t = Math.max(0, Math.min(1, Number(value) || 0));
        let previous = stops[0];

        for (let i = 1; i < stops.length; i++) {
            const current = stops[i];
            const prevAt = Number(previous?.at ?? 0);
            const currAt = Number(current?.at ?? 1);

            if (t <= currAt) {
                const range = Math.max(1e-6, currAt - prevAt);
                const localT = Math.max(0, Math.min(1, (t - prevAt) / range));
                return DayNightSystem.lerpColor(previous?.color, current?.color, localT);
            }

            previous = current;
        }

        const lastColor = stops[stops.length - 1]?.color;
        return Array.isArray(lastColor) ? lastColor.slice() : [0, 0, 0, 0];
    }

    /**
     * Lineare Interpolation zwischen zwei Farbarrays [r, g, b, a].
     * @param {number[]} colorA
     * @param {number[]} colorB
     * @param {number} t - 0..1
     * @returns {number[]}
     */
    static lerpColor(colorA, colorB, t) {
        const clampT = Math.max(0, Math.min(1, Number(t) || 0));

        const getComponent = (arr, index) => {
            if (!Array.isArray(arr) || arr.length === 0) {
                return index === 3 ? 1 : 0;
            }
            if (index < arr.length) {
                return Number(arr[index]);
            }
            if (index === 3) {
                return arr.length > 3 ? Number(arr[3]) : 1;
            }
            return Number(arr[Math.min(index, arr.length - 1)]);
        };

        const result = [];
        for (let i = 0; i < 4; i++) {
            const compA = getComponent(colorA, i);
            const compB = getComponent(colorB, i);
            result[i] = compA + (compB - compA) * clampT;
        }

        return result;
    }

    /**
     * Wandelt ein Farbarray [r, g, b, a] in einen rgba()-String um.
     * @param {number[]} color
     * @param {number} alphaMultiplier
     * @returns {string}
     */
    static colorArrayToRgba(color, alphaMultiplier = 1) {
        if (!Array.isArray(color) || color.length === 0) {
            return 'rgba(0, 0, 0, 0)';
        }

        const r = Math.round(Math.max(0, Math.min(255, Number(color[0]) || 0)));
        const g = Math.round(Math.max(0, Math.min(255, Number(color[1] ?? color[0]) || 0)));
        const b = Math.round(Math.max(0, Math.min(255, Number(color[2] ?? color[1] ?? color[0]) || 0)));
        const aBase = color.length > 3 ? Number(color[3]) : 1;
        const a = Math.max(0, Math.min(1, aBase * alphaMultiplier));

        return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
    }
}



// ═══════════════════════════════════════════════════════
// js/systems/InteractionSystem.js
// ═══════════════════════════════════════════════════════
/**
 * InteractionSystem - Gebaeude-Interaktion und UI-Steuerung.
 *
 * SSOT: Alle Proximity-Erkennung und Interaktions-UI hier zentralisiert.
 * Dieses System veraendert KEINE Positionen. Es erkennt Proximity und
 * delegiert an InteriorManager fuer Szenen-Wechsel.
 */

/** Reichweite in Pixeln, in der ein Gebaeude als "nah" gilt */
const INTERACTION_RANGE = 60;

class InteractionSystem {

    /**
     * @param {import('../core/EventBus.js').EventBus} bus - EventBus-Instanz
     * @param {import('../interiors/InteriorManager.js').InteriorManager} interiorManager
     * @param {Array} buildings - Liste der Gebaeude-Objekte (aus WorldGenerator)
     */
    constructor(bus, interiorManager, buildings) {
        /** @type {import('../core/EventBus.js').EventBus} */
        this.eventBus = bus;

        /** @type {import('../interiors/InteriorManager.js').InteriorManager} */
        this.interiorManager = interiorManager;

        /** @type {Array} */
        this.buildings = buildings;

        // --- Interaktions-Zustand ---

        /** @type {object|null} Gebaeude in Reichweite */
        this.nearBuilding = null;

        /** @type {object|null} Gebaeude dessen UI gerade angezeigt wird */
        this.pendingInteractionBuilding = null;

        /** @type {boolean} Interaktions-UI sichtbar */
        this.isInteractionVisible = false;

        /**
         * Wenn true, muss die E-Taste losgelassen werden bevor ein neuer
         * Eintritt moeglich ist (verhindert sofortiges Doppel-Betreten).
         */
        this.interactionRequiresKeyRelease = false;

        // --- Immobilien ---

        /** @type {RealEstateSystem|null} */
        this.realEstateSystem = null;

        // --- Casino ---

        /** @type {import('../interiors/Casino.js').Casino|null} */
        this.casino = null;

        /** @type {number|null} */
        this.casinoMessageTimeout = null;

        // --- DOM-Referenzen (werden spaeter via initUI() gesetzt) ---

        /** @type {HTMLElement|null} */
        this.interactionUI = null;

        /** @type {HTMLElement|null} */
        this.buildingNameEl = null;

        /** @type {HTMLElement|null} */
        this.buildingMessageEl = null;

        /** @type {HTMLButtonElement|null} */
        this.enterBuildingButton = null;

        /** @type {HTMLButtonElement|null} */
        this.buyCasinoCreditsButton = null;

        /** @type {HTMLButtonElement|null} */
        this.cashOutCasinoCreditsButton = null;

        /** @type {HTMLButtonElement|null} */
        this.rentPropertyButton = null;

        /** @type {HTMLButtonElement|null} */
        this.cancelRentalButton = null;

        /** @type {HTMLButtonElement|null} */
        this.buyPropertyButton = null;

        /** @type {HTMLButtonElement|null} */
        this.sellPropertyButton = null;

        /** @type {HTMLButtonElement|null} */
        this.moveInButton = null;
    }

    // ===================================================================
    //  Initialisierung
    // ===================================================================

    /**
     * Verbindet die DOM-Elemente fuer die Interaktions-UI.
     */
    initUI(elements) {
        this.interactionUI = elements.container ?? null;
        this.buildingNameEl = elements.nameEl ?? null;
        this.buildingMessageEl = elements.messageEl ?? null;
        this.enterBuildingButton = elements.enterButton ?? null;
        this.buyCasinoCreditsButton = elements.buyCredits ?? null;
        this.cashOutCasinoCreditsButton = elements.cashOut ?? null;
        this.rentPropertyButton = elements.rentProperty ?? null;
        this.cancelRentalButton = elements.cancelRental ?? null;
        this.buyPropertyButton = elements.buyProperty ?? null;
        this.sellPropertyButton = elements.sellProperty ?? null;
        this.moveInButton = elements.moveInButton ?? null;

        this._bindButtonEvents();
    }

    /**
     * Setzt die Casino-Instanz fuer Credits-Konvertierung.
     */
    setCasino(casino) {
        this.casino = casino;
    }

    /**
     * Setzt das RealEstateSystem fuer Immobilien-Kauf/Verkauf/Miete.
     */
    setRealEstateSystem(realEstateSystem) {
        this.realEstateSystem = realEstateSystem;
    }

    // ===================================================================
    //  Update (pro Frame)
    // ===================================================================

    /**
     * Prueft Proximity zu interaktiven Gebaeuden und steuert die UI.
     */
    update(player, inputSystem) {
        // Im Interior keine Overworld-Interaktionen pruefen
        if (this.interiorManager.isInInterior()) {
            if (this.isInteractionVisible) {
                this.hideInteractionUI();
            }
            this.nearBuilding = null;
            return;
        }

        // Gebaeude am Eingang (Suedseite) suchen
        const nearest = this._findBuildingAtEntrance(player);
        this.nearBuilding = nearest;

        if (nearest) {
            // Key-Release-Tracking: E muss erst losgelassen werden
            if (this.interactionRequiresKeyRelease) {
                if (!inputSystem.isKeyDown('e')) {
                    this.interactionRequiresKeyRelease = false;
                }
            }

            if (!this.interactionRequiresKeyRelease && inputSystem.isKeyPressed('e')) {
                if (!this.isInteractionVisible) {
                    this.showInteractionUI(nearest, player);
                } else {
                    this.performEntry(nearest, player);
                }
            }
        } else {
            if (this.isInteractionVisible) {
                this.hideInteractionUI();
            }
        }
    }

    // ===================================================================
    //  Proximity-Erkennung (nur Suedseite / Eingang)
    // ===================================================================

    _findBuildingAtEntrance(player) {
        const buildings = this.buildings;
        if (!Array.isArray(buildings) || buildings.length === 0) {
            return null;
        }

        const range = INTERACTION_RANGE;
        const px = player.x;
        const py = player.y;
        const pw = player.width ?? 0;
        const ph = player.height ?? 0;

        for (let i = 0; i < buildings.length; i++) {
            const building = buildings[i];
            if (!building.interactive) {
                continue;
            }

            const rects = this._getBuildingRects(building);

            for (let j = 0; j < rects.length; j++) {
                const rect = rects[j];
                const bx = rect.x;
                const by = rect.y;
                const bw = rect.width;
                const bh = rect.height;
                const bottomEdge = by + bh;

                const xOverlap = px + pw > bx && px < bx + bw;
                const atSouth = py > bottomEdge - 4 && py < bottomEdge + range;

                if (xOverlap && atSouth) {
                    return building;
                }
            }
        }

        return null;
    }

    _getBuildingRects(building) {
        if (Array.isArray(building.collisionRects) && building.collisionRects.length > 0) {
            return building.collisionRects;
        }

        const width = Number(building.width ?? 0);
        const height = Number(building.height ?? 0);
        if (width > 0 && height > 0) {
            return [{ x: building.x, y: building.y, width, height }];
        }

        return [];
    }

    // ===================================================================
    //  UI anzeigen / verstecken
    // ===================================================================

    showInteractionUI(building, player) {
        if (!building || !this.interactionUI) {
            return;
        }

        this.pendingInteractionBuilding = building;

        if (building.type === 'house') {
            delete building._housePromptShown;
        }

        this.isInteractionVisible = true;
        this.interactionRequiresKeyRelease = true;

        // Gebaeudenamen setzen
        if (this.buildingNameEl) {
            this.buildingNameEl.textContent = building.name ?? 'Unbekanntes Gebaeude';
        }

        // Typ bestimmen
        const isRental = isRentalType(building.type);
        const isPurchasable = isPurchasableType(building.type);
        const isRented = isRental && player && player.rentedPropertyId === building.id;
        const isOwned = isPurchasable && player && player.ownedProperties.has(building.id);

        // Enter-Button anpassen
        if (this.enterBuildingButton) {
            if (building.type === 'weaponShop') {
                this.enterBuildingButton.textContent = 'Shop betreten';
                this.enterBuildingButton.style.display = 'inline-block';
            } else if (building.type === 'casino') {
                this.enterBuildingButton.textContent = 'Casino betreten';
                this.enterBuildingButton.style.display = 'inline-block';
            } else if (building.type === 'realEstateAgent') {
                this.enterBuildingButton.style.display = 'none';
            } else if (isRental || isPurchasable) {
                this.enterBuildingButton.style.display = 'none';
            } else {
                this.enterBuildingButton.textContent = 'Betreten';
                this.enterBuildingButton.style.display = 'inline-block';
            }
        }

        // Casino-Buttons
        if (this.buyCasinoCreditsButton) {
            this.buyCasinoCreditsButton.style.display =
                building.type === 'casino' ? 'inline-block' : 'none';
        }
        if (this.cashOutCasinoCreditsButton) {
            this.cashOutCasinoCreditsButton.style.display =
                building.type === 'casino' ? 'inline-block' : 'none';
        }

        // Miet-Buttons (Motel/Apartment)
        if (this.rentPropertyButton) {
            this.rentPropertyButton.style.display =
                isRental && !isRented ? 'inline-block' : 'none';
            if (isRental && !isRented) {
                const rental = RealEstateSystem.getRentalEntry(building.type);
                if (rental) {
                    this.rentPropertyButton.textContent =
                        'Mieten (' + RealEstateSystem.formatMoney(rental.rent) + ' / Tag)';
                }
            }
        }
        if (this.cancelRentalButton) {
            this.cancelRentalButton.style.display =
                isRental && isRented ? 'inline-block' : 'none';
            if (isRental && isRented) {
                this.cancelRentalButton.textContent = 'Miete kuendigen';
            }
        }

        // Kauf-Buttons (Bungalow etc. via Makler)
        if (this.buyPropertyButton) {
            // Kaufen: nur bei Makler-Gebaeude fuer kaufbare Immobilien in der Naehe,
            // oder direkt am Bungalow
            const showBuy = isPurchasable && !isOwned;
            this.buyPropertyButton.style.display = showBuy ? 'inline-block' : 'none';
            if (showBuy) {
                const catalog = RealEstateSystem.getPurchaseEntry(building.type);
                if (catalog) {
                    this.buyPropertyButton.textContent =
                        'Kaufen (' + RealEstateSystem.formatMoney(catalog.price) + ')';
                }
            }
        }
        if (this.sellPropertyButton) {
            const showSell = isPurchasable && isOwned;
            this.sellPropertyButton.style.display = showSell ? 'inline-block' : 'none';
            if (showSell) {
                const catalog = RealEstateSystem.getPurchaseEntry(building.type);
                if (catalog) {
                    const refund = RealEstateSystem.getSellRefund(catalog.price);
                    this.sellPropertyButton.textContent =
                        'Verkaufen (' + RealEstateSystem.formatMoney(refund) + ')';
                }
            }
        }

        // Einziehen-Button: nur bei eigenen Kaufimmobilien
        if (this.moveInButton) {
            const isHome = isOwned && player && player.homePropertyId === building.id;
            this.moveInButton.style.display =
                isPurchasable && isOwned && !isHome ? 'inline-block' : 'none';
            if (isPurchasable && isOwned && !isHome) {
                this.moveInButton.textContent = 'Einziehen';
            }
        }

        // Casino-Message-Timeout raeumen
        if (this.casinoMessageTimeout) {
            clearTimeout(this.casinoMessageTimeout);
            this.casinoMessageTimeout = null;
        }

        // Nachrichtentext setzen
        if (building.type === 'casino') {
            if (this.casino && player) {
                this.casino.refreshCreditsCache(player);
                this._updateCasinoInteractionMessage(player);
            }
        } else if (this.buildingMessageEl) {
            if (building.type === 'weaponShop') {
                this.buildingMessageEl.textContent = 'Schau dich um und teste neue Waffen.';
            } else if (building.type === 'house') {
                this.buildingMessageEl.textContent = 'Privates Wohnhaus. Zutritt nur fuer Bewohner.';
            } else if (building.type === 'realEstateAgent') {
                this.buildingMessageEl.textContent = 'Immobilienmakler - Hier kannst du Haeuser kaufen und verkaufen.';
            } else if (isRental) {
                const rental = RealEstateSystem.getRentalEntry(building.type);
                if (rental) {
                    if (isRented) {
                        this.buildingMessageEl.textContent =
                            'Deine gemietete Unterkunft! Miete: ' +
                            RealEstateSystem.formatMoney(rental.rent) + ' / Tag';
                    } else {
                        this.buildingMessageEl.textContent =
                            rental.description + ' | Miete: ' +
                            RealEstateSystem.formatMoney(rental.rent) + ' / Tag';
                    }
                }
            } else if (isPurchasable) {
                const catalog = RealEstateSystem.getPurchaseEntry(building.type);
                if (catalog) {
                    if (isOwned) {
                        const isHome = player && player.homePropertyId === building.id;
                        const homeLabel = isHome ? ' (Dein Wohnsitz!)' : '';
                        this.buildingMessageEl.textContent =
                            'Dein Eigentum!' + homeLabel;
                    } else {
                        this.buildingMessageEl.textContent =
                            catalog.description + ' | Preis: ' +
                            RealEstateSystem.formatMoney(catalog.price);
                    }
                }
            } else {
                this.buildingMessageEl.textContent = 'Druecke Betreten um hineinzugehen.';
            }
        }

        this._updateCasinoButtonsState(player);
        this.interactionUI.style.display = 'block';
    }

    hideInteractionUI() {
        const previousBuilding = this.pendingInteractionBuilding;

        this.isInteractionVisible = false;
        this.interactionRequiresKeyRelease = false;

        if (this.interactionUI) {
            this.interactionUI.style.display = 'none';
        }

        this.pendingInteractionBuilding = null;

        if (previousBuilding && previousBuilding.type === 'house') {
            delete previousBuilding._housePromptShown;
        }

        // Casino-Buttons zuruecksetzen
        if (this.buyCasinoCreditsButton) {
            this.buyCasinoCreditsButton.style.display = 'none';
            this.buyCasinoCreditsButton.disabled = false;
            this.buyCasinoCreditsButton.textContent = 'Credits kaufen';
        }
        if (this.cashOutCasinoCreditsButton) {
            this.cashOutCasinoCreditsButton.style.display = 'none';
            this.cashOutCasinoCreditsButton.disabled = false;
            this.cashOutCasinoCreditsButton.textContent = 'Credits auszahlen';
        }

        if (this.buildingMessageEl) {
            this.buildingMessageEl.textContent = '';
        }
        if (this.buildingNameEl) {
            this.buildingNameEl.textContent = 'Unbekanntes Gebaeude';
        }
        if (this.enterBuildingButton) {
            this.enterBuildingButton.textContent = 'Betreten';
            this.enterBuildingButton.style.display = 'inline-block';
        }

        // Miet-Buttons
        if (this.rentPropertyButton) {
            this.rentPropertyButton.style.display = 'none';
        }
        if (this.cancelRentalButton) {
            this.cancelRentalButton.style.display = 'none';
        }

        // Kauf-Buttons
        if (this.buyPropertyButton) {
            this.buyPropertyButton.style.display = 'none';
        }
        if (this.sellPropertyButton) {
            this.sellPropertyButton.style.display = 'none';
        }
        if (this.moveInButton) {
            this.moveInButton.style.display = 'none';
        }

        if (this.casinoMessageTimeout) {
            clearTimeout(this.casinoMessageTimeout);
            this.casinoMessageTimeout = null;
        }
    }

    // ===================================================================
    //  Eintritt
    // ===================================================================

    performEntry(building, player) {
        if (!building) {
            this.hideInteractionUI();
            return;
        }

        // Wohnhaus: nur Hinweis
        if (building.type === 'house') {
            if (building._housePromptShown) {
                this.hideInteractionUI();
                return;
            }
            if (this.buildingMessageEl) {
                this.buildingMessageEl.textContent = 'Dieses Wohnhaus ist derzeit nicht betretbar.';
            }
            building._housePromptShown = true;
            this.isInteractionVisible = true;
            this.interactionRequiresKeyRelease = true;
            if (this.interactionUI) {
                this.interactionUI.style.display = 'block';
            }
            return;
        }

        this.hideInteractionUI();

        if (building.type === 'casino') {
            this._handleCasinoEntry(building, player);
            return;
        }

        if (building.type === 'weaponShop') {
            this.eventBus.emit('interaction:enterWeaponShop', { building, player });
            return;
        }

        if (building.interactive) {
            this.eventBus.emit('interaction:enterGeneric', { building, player });
        }
    }

    // ===================================================================
    //  Casino-UI-Logik
    // ===================================================================

    _handleCasinoEntry(building, player) {
        if (this.casino) {
            this.casino.refreshCreditsCache(player);
        }
        this.eventBus.emit('interaction:enterCasino', { building, player });
    }

    _updateCasinoInteractionMessage(player) {
        if (!this.buildingMessageEl || !this.casino) return;
        this.buildingMessageEl.textContent = this.casino.getInteractionMessage(player);
        this._updateCasinoButtonsState(player);
    }

    _updateCasinoButtonsState(player) {
        if (!this.buyCasinoCreditsButton && !this.cashOutCasinoCreditsButton) return;
        if (!this.casino || !player) return;

        const isCasino = this.pendingInteractionBuilding &&
            this.pendingInteractionBuilding.type === 'casino';

        const state = this.casino.getButtonState(player);
        const rate = this.casino.creditRate;

        const canBuy = isCasino && state.canBuy;
        const canCashOut = isCasino && state.canCashOut;

        if (this.buyCasinoCreditsButton) {
            this.buyCasinoCreditsButton.disabled = !canBuy;
            if (isCasino && canBuy) {
                const creditsGain = state.dollarsAvailable * rate;
                const dollarsLabel = state.dollarsAvailable.toLocaleString('de-DE');
                this.buyCasinoCreditsButton.textContent =
                    'Credits kaufen (' + dollarsLabel + '$ = ' +
                    this.casino.formatCredits(creditsGain) + ' Credits)';
            } else {
                this.buyCasinoCreditsButton.textContent = 'Credits kaufen';
            }
        }

        if (this.cashOutCasinoCreditsButton) {
            this.cashOutCasinoCreditsButton.disabled = !canCashOut;
            if (isCasino && canCashOut) {
                const dollarsGain = Math.floor(state.creditsAvailable / rate);
                const creditsUsed = dollarsGain * rate;
                const creditsLabel = this.casino.formatCredits(creditsUsed);
                this.cashOutCasinoCreditsButton.textContent =
                    'Credits auszahlen (' + creditsLabel + ' Credits -> ' +
                    this.casino.formatMoney(dollarsGain) + ')';
            } else {
                this.cashOutCasinoCreditsButton.textContent = 'Credits auszahlen';
            }
        }
    }

    handleBuyCasinoCredits(player) {
        if (!this.casino) return;
        const result = this.casino.convertDollarsToCredits(player);
        if (!this.buildingMessageEl) return;

        if (!result.success) {
            this.buildingMessageEl.textContent =
                result.reason === 'noMoney' ? 'Keine Dollars zum Umtauschen.' : 'Umtausch derzeit nicht moeglich.';
            this._updateCasinoButtonsState(player);
            return;
        }

        this.buildingMessageEl.textContent =
            'Eingezahlt: ' + this.casino.formatMoney(result.dollarsSpent) +
            ' -> +' + this.casino.formatCredits(result.creditsAdded) +
            ' Credits | neuer Stand: ' + this.casino.formatCredits(result.totalCredits) +
            ' Credits';

        this._updateCasinoButtonsState(player);
        this._resetCasinoMessageWithDelay(player);
    }

    handleCashOutCasinoCredits(player) {
        if (!this.casino) return;
        const result = this.casino.convertCreditsToDollars(player);
        if (!this.buildingMessageEl) return;

        if (!result.success) {
            this.buildingMessageEl.textContent =
                result.reason === 'noCredits' ? 'Keine Credits zum Auszahlen.' : 'Auszahlung derzeit nicht moeglich.';
            this._updateCasinoButtonsState(player);
            return;
        }

        this.buildingMessageEl.textContent =
            'Ausgezahlt: +' + this.casino.formatMoney(result.dollarsGained) +
            ' ( -' + this.casino.formatCredits(result.creditsSpent) +
            ' Credits ) | Rest: ' + this.casino.formatCredits(result.totalCredits) +
            ' Credits';

        this._updateCasinoButtonsState(player);
        this._resetCasinoMessageWithDelay(player);
    }

    _resetCasinoMessageWithDelay(player) {
        if (typeof window === 'undefined') return;
        if (this.casinoMessageTimeout) {
            clearTimeout(this.casinoMessageTimeout);
        }
        this.casinoMessageTimeout = window.setTimeout(() => {
            if (this.pendingInteractionBuilding &&
                this.pendingInteractionBuilding.type === 'casino') {
                this._updateCasinoInteractionMessage(player);
            }
        }, 2000);
    }

    // ===================================================================
    //  Miet-Handler (Motel/Apartment)
    // ===================================================================

    handleRentProperty(player) {
        if (!this.realEstateSystem || !this.pendingInteractionBuilding) return;

        const result = this.realEstateSystem.rentProperty(player, this.pendingInteractionBuilding);
        if (!this.buildingMessageEl) return;

        if (!result.success) {
            if (result.reason === 'noMoney') {
                this.buildingMessageEl.textContent = 'Nicht genug Geld fuer die Miete!';
            } else if (result.reason === 'alreadyRented') {
                this.buildingMessageEl.textContent = 'Du mietest hier bereits!';
            } else {
                this.buildingMessageEl.textContent = 'Mieten nicht moeglich.';
            }
            return;
        }

        this.buildingMessageEl.textContent =
            'Eingezogen! Miete: ' + RealEstateSystem.formatMoney(result.rental.rent) + ' / Tag. Respawn hier gesetzt.';

        // Buttons aktualisieren
        if (this.rentPropertyButton) {
            this.rentPropertyButton.style.display = 'none';
        }
        if (this.cancelRentalButton) {
            this.cancelRentalButton.textContent = 'Miete kuendigen';
            this.cancelRentalButton.style.display = 'inline-block';
        }
    }

    handleCancelRental(player) {
        if (!this.realEstateSystem || !this.pendingInteractionBuilding) return;

        const result = this.realEstateSystem.cancelRental(player, this.pendingInteractionBuilding);
        if (!this.buildingMessageEl) return;

        if (!result.success) {
            this.buildingMessageEl.textContent = 'Kuendigung nicht moeglich.';
            return;
        }

        this.buildingMessageEl.textContent = 'Miete gekuendigt. Du wohnst hier nicht mehr.';

        // Buttons aktualisieren
        if (this.cancelRentalButton) {
            this.cancelRentalButton.style.display = 'none';
        }
        if (this.rentPropertyButton) {
            const rental = RealEstateSystem.getRentalEntry(this.pendingInteractionBuilding.type);
            if (rental) {
                this.rentPropertyButton.textContent =
                    'Mieten (' + RealEstateSystem.formatMoney(rental.rent) + ' / Tag)';
            }
            this.rentPropertyButton.style.display = 'inline-block';
        }
    }

    // ===================================================================
    //  Kauf/Verkauf Handler (Bungalow etc.)
    // ===================================================================

    handleBuyProperty(player) {
        if (!this.realEstateSystem || !this.pendingInteractionBuilding) return;

        const result = this.realEstateSystem.buyProperty(player, this.pendingInteractionBuilding);
        if (!this.buildingMessageEl) return;

        if (!result.success) {
            if (result.reason === 'noMoney') {
                this.buildingMessageEl.textContent = 'Nicht genug Geld!';
            } else if (result.reason === 'alreadyOwned') {
                this.buildingMessageEl.textContent = 'Diese Immobilie gehoert dir bereits!';
            } else {
                this.buildingMessageEl.textContent = 'Kauf nicht moeglich.';
            }
            return;
        }

        this.buildingMessageEl.textContent = 'Gekauft! Du bist jetzt Eigentuemer.';

        if (this.buyPropertyButton) {
            this.buyPropertyButton.style.display = 'none';
        }
        if (this.sellPropertyButton) {
            const catalog = RealEstateSystem.getPurchaseEntry(this.pendingInteractionBuilding.type);
            if (catalog) {
                const refund = RealEstateSystem.getSellRefund(catalog.price);
                this.sellPropertyButton.textContent =
                    'Verkaufen (' + RealEstateSystem.formatMoney(refund) + ')';
            }
            this.sellPropertyButton.style.display = 'inline-block';
        }
        if (this.moveInButton) {
            this.moveInButton.textContent = 'Einziehen';
            this.moveInButton.style.display = 'inline-block';
        }
    }

    handleSellProperty(player) {
        if (!this.realEstateSystem || !this.pendingInteractionBuilding) return;

        const result = this.realEstateSystem.sellProperty(player, this.pendingInteractionBuilding);
        if (!this.buildingMessageEl) return;

        if (!result.success) {
            this.buildingMessageEl.textContent = 'Verkauf nicht moeglich.';
            return;
        }

        this.buildingMessageEl.textContent =
            'Verkauft! ' + RealEstateSystem.formatMoney(result.refund) + ' erhalten.';

        if (this.sellPropertyButton) {
            this.sellPropertyButton.style.display = 'none';
        }
        if (this.moveInButton) {
            this.moveInButton.style.display = 'none';
        }
        if (this.buyPropertyButton) {
            const catalog = RealEstateSystem.getPurchaseEntry(this.pendingInteractionBuilding.type);
            if (catalog) {
                this.buyPropertyButton.textContent =
                    'Kaufen (' + RealEstateSystem.formatMoney(catalog.price) + ')';
            }
            this.buyPropertyButton.style.display = 'inline-block';
        }
    }

    handleMoveIn(player) {
        if (!this.realEstateSystem || !this.pendingInteractionBuilding) return;

        const result = this.realEstateSystem.moveIn(player, this.pendingInteractionBuilding);
        if (!this.buildingMessageEl) return;

        if (!result.success) {
            this.buildingMessageEl.textContent = 'Einziehen nicht moeglich.';
            return;
        }

        this.buildingMessageEl.textContent = 'Du wohnst jetzt hier! Respawn-Punkt gesetzt.';

        if (this.moveInButton) {
            this.moveInButton.style.display = 'none';
        }
    }

    // ===================================================================
    //  Button-Event-Bindings
    // ===================================================================

    _bindButtonEvents() {
        if (this.enterBuildingButton) {
            this.enterBuildingButton.addEventListener('click', () => {
                if (this.pendingInteractionBuilding) {
                    this.eventBus.emit('interaction:enterButtonClicked', {
                        building: this.pendingInteractionBuilding,
                    });
                }
            });
        }

        if (this.buyCasinoCreditsButton) {
            this.buyCasinoCreditsButton.addEventListener('click', () => {
                this.eventBus.emit('interaction:buyCasinoCredits');
            });
        }

        if (this.cashOutCasinoCreditsButton) {
            this.cashOutCasinoCreditsButton.addEventListener('click', () => {
                this.eventBus.emit('interaction:cashOutCasinoCredits');
            });
        }

        if (this.rentPropertyButton) {
            this.rentPropertyButton.addEventListener('click', () => {
                this.eventBus.emit('interaction:rentProperty');
            });
        }

        if (this.cancelRentalButton) {
            this.cancelRentalButton.addEventListener('click', () => {
                this.eventBus.emit('interaction:cancelRental');
            });
        }

        if (this.buyPropertyButton) {
            this.buyPropertyButton.addEventListener('click', () => {
                this.eventBus.emit('interaction:buyProperty');
            });
        }

        if (this.sellPropertyButton) {
            this.sellPropertyButton.addEventListener('click', () => {
                this.eventBus.emit('interaction:sellProperty');
            });
        }

        if (this.moveInButton) {
            this.moveInButton.addEventListener('click', () => {
                this.eventBus.emit('interaction:moveIn');
            });
        }
    }
}




// ═══════════════════════════════════════════════════════
// js/rendering/Renderer.js
// ═══════════════════════════════════════════════════════
/**
 * Renderer - Basis-Wrapper fuer das Canvas-2D-Rendering.
 * Kapselt den Canvas-Kontext und bietet grundlegende Operationen.
 */

class Renderer {

    /**
     * @param {HTMLCanvasElement} canvas
     */
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.width = canvas.width;
        this.height = canvas.height;
    }

    /**
     * Loescht die gesamte Zeichenflaeche.
     */
    clear() {
        this.ctx.clearRect(0, 0, this.width, this.height);
    }

    /**
     * Speichert den aktuellen Zeichenzustand.
     */
    save() {
        this.ctx.save();
    }

    /**
     * Stellt den letzten gespeicherten Zeichenzustand wieder her.
     */
    restore() {
        this.ctx.restore();
    }

    /**
     * Verschiebt den Koordinatenursprung.
     * @param {number} x
     * @param {number} y
     */
    translate(x, y) {
        this.ctx.translate(x, y);
    }

    /**
     * Gibt den 2D-Rendering-Kontext zurueck.
     * @returns {CanvasRenderingContext2D}
     */
    getContext() {
        return this.ctx;
    }

    /**
     * Passt die Canvas-Groesse an die Fenstergroesse an.
     * Portiert aus overworld.js Zeilen 442-454.
     */
    resizeCanvas() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        console.log("Canvas resized:", this.width, "x", this.height);
    }
}


// ═══════════════════════════════════════════════════════
// js/rendering/WorldRenderer.js
// ═══════════════════════════════════════════════════════
/**
 * WorldRenderer - Zeichnet die Spielwelt: Gras, Strassen, Buergersteige, Zebrastreifen
 * und Strassendetails (Parkplaetze, Baeume, Baenke, Laternen, etc.).
 *
 * Portiert aus overworld.js Zeilen 7124-8511.
 */

class WorldRenderer {

    /**
     * @param {import('./Renderer.js').Renderer} renderer
     */
    constructor(renderer) {
        this.renderer = renderer;
        this.ctx = renderer.getContext();
    }

    // ------------------------------------------------------------------
    //  Gras
    // ------------------------------------------------------------------

    /**
     * Zeichnet die Grasflaeche der gesamten Welt.
     * @param {number} worldWidth
     * @param {number} worldHeight
     */
    drawGrass(worldWidth, worldHeight) {
        this.ctx.fillStyle = "#4a7c3f";
        this.ctx.fillRect(0, 0, worldWidth, worldHeight);
    }

    // ------------------------------------------------------------------
    //  Meer (westliche Seite - ohne Strand, direkte Klippe)
    // ------------------------------------------------------------------

    /** Breite der sichtbaren Meerflaeche links der Welt */
    static OCEAN_WIDTH = 600;

    /** Breite der Klippenkante */
    static CLIFF_WIDTH = 12;

    /**
     * Zeichnet das Meer an der westlichen Seite der Welt.
     * Kein Strand - das Land endet abrupt an einer Klippe.
     * @param {number} worldHeight
     */
    drawOcean(worldHeight) {
        const oceanW = WorldRenderer.OCEAN_WIDTH;
        const cliffW = WorldRenderer.CLIFF_WIDTH;

        this.ctx.save();

        // Tiefes Meer
        const oceanGrad = this.ctx.createLinearGradient(-oceanW, 0, 0, 0);
        oceanGrad.addColorStop(0, '#0a3d6b');
        oceanGrad.addColorStop(0.6, '#1a5f8a');
        oceanGrad.addColorStop(1, '#2478a8');
        this.ctx.fillStyle = oceanGrad;
        this.ctx.fillRect(-oceanW, -oceanW, oceanW, worldHeight + oceanW * 2);

        // Wellen-Effekt (statisch, einfache Linien)
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        this.ctx.lineWidth = 2;
        for (let wy = -50; wy < worldHeight + 50; wy += 40) {
            this.ctx.beginPath();
            for (let wx = -oceanW + 20; wx < -cliffW; wx += 4) {
                const waveY = wy + Math.sin(wx * 0.04 + wy * 0.01) * 6;
                if (wx === -oceanW + 20) {
                    this.ctx.moveTo(wx, waveY);
                } else {
                    this.ctx.lineTo(wx, waveY);
                }
            }
            this.ctx.stroke();
        }

        // Klippe / Felskante (kein Strand!)
        const cliffGrad = this.ctx.createLinearGradient(-cliffW, 0, 4, 0);
        cliffGrad.addColorStop(0, '#4a4a42');
        cliffGrad.addColorStop(0.5, '#5c5c52');
        cliffGrad.addColorStop(1, '#3a3a32');
        this.ctx.fillStyle = cliffGrad;
        this.ctx.fillRect(-cliffW, -50, cliffW + 4, worldHeight + 100);

        // Felstextur auf Klippe
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
        for (let ry = 0; ry < worldHeight; ry += 18) {
            const rw = 3 + pseudoRandom2D(-5, ry) * 6;
            const rx = -cliffW + pseudoRandom2D(-3, ry + 7) * (cliffW - 2);
            this.ctx.fillRect(rx, ry, rw, 4);
        }

        // Gischt / Wellenbrecher an Klippe
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        this.ctx.lineWidth = 2.5;
        this.ctx.beginPath();
        for (let gy = -20; gy < worldHeight + 20; gy += 3) {
            const gx = -cliffW - 2 + Math.sin(gy * 0.08) * 3;
            if (gy === -20) {
                this.ctx.moveTo(gx, gy);
            } else {
                this.ctx.lineTo(gx, gy);
            }
        }
        this.ctx.stroke();

        this.ctx.restore();
    }

    // ------------------------------------------------------------------
    //  Strassen  (portiert aus drawImprovedRoadSystem, Zeilen 7124-7225)
    // ------------------------------------------------------------------

    /**
     * Zeichnet das gesamte Strassennetz inkl. Zebrastreifen.
     * @param {Array} roadLayout
     * @param {Array} crosswalks
     * @param {number} roadWidth
     * @param {number} roadHalfWidth
     */
    drawRoads(roadLayout, crosswalks = [], roadWidth = 70, roadHalfWidth = 35) {
        const asphalt = "#2c3036";
        const edgeColor = "#42474f";
        const laneColor = "rgba(255, 224, 150, 0.9)";
        const borderThickness = 2;
        const borderOffset = roadHalfWidth + borderThickness;

        this.ctx.save();

        for (const road of roadLayout) {
            if (road.type === "horizontal") {
                const length = road.endX - road.startX;
                this.ctx.fillStyle = asphalt;
                this.ctx.fillRect(road.startX, road.y - roadHalfWidth, length, roadWidth);
                this.ctx.fillStyle = edgeColor;
                this.ctx.fillRect(road.startX, road.y - borderOffset, length, borderThickness);
                this.ctx.fillRect(road.startX, road.y + roadHalfWidth, length, borderThickness);
            } else if (road.type === "vertical") {
                const length = road.endY - road.startY;
                this.ctx.fillStyle = asphalt;
                this.ctx.fillRect(road.x - roadHalfWidth, road.startY, roadWidth, length);
                this.ctx.fillStyle = edgeColor;
                this.ctx.fillRect(road.x - borderOffset, road.startY, borderThickness, length);
                this.ctx.fillRect(road.x + roadHalfWidth, road.startY, borderThickness, length);
            } else if (road.type === "diagonal") {
                this.ctx.fillStyle = asphalt;
                this._drawDiagonalRoad(road, roadWidth, roadHalfWidth);
            }
        }

        // Fahrbahnmarkierungen
        this.ctx.strokeStyle = laneColor;
        this.ctx.lineWidth = 3;
        this.ctx.setLineDash([32, 28]);

        for (const road of roadLayout) {
            if (road.type === "horizontal") {
                this.ctx.beginPath();
                this.ctx.moveTo(road.startX, road.y);
                this.ctx.lineTo(road.endX, road.y);
                this.ctx.stroke();
            } else if (road.type === "vertical") {
                this.ctx.beginPath();
                this.ctx.moveTo(road.x, road.startY);
                this.ctx.lineTo(road.x, road.endY);
                this.ctx.stroke();
            }
        }

        this.ctx.setLineDash([]);
        this.ctx.restore();

        // Zebrastreifen
        for (const crosswalk of crosswalks) {
            this.drawCrosswalk(crosswalk, roadWidth, roadHalfWidth);
        }
    }

    // ------------------------------------------------------------------
    //  Diagonale Strasse  (portiert aus drawDiagonalRoad, Zeilen 7226-7257)
    // ------------------------------------------------------------------

    /**
     * @private
     */
    _drawDiagonalRoad(road, roadWidth, roadHalfWidth) {
        const dx = road.endX - road.startX;
        const dy = road.endY - road.startY;
        const angle = Math.atan2(dy, dx);
        const halfWidth = roadHalfWidth;
        const perpX = -Math.sin(angle) * halfWidth;
        const perpY = Math.cos(angle) * halfWidth;

        this.ctx.beginPath();
        this.ctx.moveTo(road.startX + perpX, road.startY + perpY);
        this.ctx.lineTo(road.startX - perpX, road.startY - perpY);
        this.ctx.lineTo(road.endX - perpX, road.endY - perpY);
        this.ctx.lineTo(road.endX + perpX, road.endY + perpY);
        this.ctx.closePath();
        this.ctx.fill();
    }

    // ------------------------------------------------------------------
    //  Buergersteige  (portiert aus drawSidewalks, Zeilen 7498-7553)
    // ------------------------------------------------------------------

    /**
     * Zeichnet die Buergersteige entlang aller Strassen.
     * @param {Array} roadLayout
     * @param {number} sidewalkWidth
     * @param {number} roadWidth
     * @param {number} roadHalfWidth
     */
    drawSidewalks(roadLayout, sidewalkWidth = 36, roadWidth = 70, roadHalfWidth = 35) {
        const surface = "#d9d1c4";

        for (const road of roadLayout) {
            if (road.type === "horizontal") {
                const upperY = road.y - roadHalfWidth - sidewalkWidth;
                const lowerY = road.y + roadHalfWidth;

                // Gaps where vertical roads cross this horizontal road
                const gaps = [];
                for (const other of roadLayout) {
                    if (other.type === "vertical") {
                        const oStart = Math.min(other.startY ?? other.y, other.endY ?? other.y);
                        const oEnd = Math.max(other.startY ?? other.y, other.endY ?? other.y);
                        if (oStart <= road.y && oEnd >= road.y) {
                            gaps.push({ start: other.x - roadHalfWidth, end: other.x + roadHalfWidth });
                        }
                    }
                }
                gaps.sort((a, b) => a.start - b.start);

                const segments = this._splitSegment(road.startX, road.endX, gaps);
                for (const seg of segments) {
                    const segLen = seg.end - seg.start;
                    this.ctx.fillStyle = surface;
                    this.ctx.fillRect(seg.start, upperY, segLen, sidewalkWidth);
                    this.ctx.fillRect(seg.start, lowerY, segLen, sidewalkWidth);
                    this.drawSidewalkPatternRect(seg.start, upperY, segLen, sidewalkWidth);
                    this.drawSidewalkPatternRect(seg.start, lowerY, segLen, sidewalkWidth);
                }

            } else if (road.type === "vertical") {
                const leftX = road.x - roadHalfWidth - sidewalkWidth;
                const rightX = road.x + roadHalfWidth;

                // Gaps where horizontal roads cross this vertical road
                const gaps = [];
                for (const other of roadLayout) {
                    if (other.type === "horizontal") {
                        const oStart = Math.min(other.startX ?? other.x, other.endX ?? other.x);
                        const oEnd = Math.max(other.startX ?? other.x, other.endX ?? other.x);
                        if (oStart <= road.x && oEnd >= road.x) {
                            gaps.push({ start: other.y - roadHalfWidth, end: other.y + roadHalfWidth });
                        }
                    }
                }
                gaps.sort((a, b) => a.start - b.start);

                const segments = this._splitSegment(road.startY, road.endY, gaps);
                for (const seg of segments) {
                    const segLen = seg.end - seg.start;
                    this.ctx.fillStyle = surface;
                    this.ctx.fillRect(leftX, seg.start, sidewalkWidth, segLen);
                    this.ctx.fillRect(rightX, seg.start, sidewalkWidth, segLen);
                    this.drawSidewalkPatternRect(leftX, seg.start, sidewalkWidth, segLen);
                    this.drawSidewalkPatternRect(rightX, seg.start, sidewalkWidth, segLen);
                }

            } else if (road.type === "diagonal") {
                this._drawDiagonalSidewalks(road, sidewalkWidth, roadWidth);
            }
        }
    }

    /**
     * Splits a range [start, end] into sub-segments by removing gaps.
     * @param {number} start
     * @param {number} end
     * @param {Array<{start:number, end:number}>} gaps - sorted by start
     * @returns {Array<{start:number, end:number}>}
     */
    _splitSegment(start, end, gaps) {
        const segments = [];
        let current = start;
        for (const gap of gaps) {
            if (gap.start > current) {
                segments.push({ start: current, end: Math.min(gap.start, end) });
            }
            current = Math.max(current, gap.end);
        }
        if (current < end) {
            segments.push({ start: current, end });
        }
        return segments;
    }

    // ------------------------------------------------------------------
    //  Diagonale Buergersteige  (portiert, Zeilen 7590-7669)
    // ------------------------------------------------------------------

    /**
     * @private
     */
    _drawDiagonalSidewalks(road, sidewalkWidth, roadWidth) {
        const surface = "#d9d1c4";
        const totalWidth = roadWidth + sidewalkWidth * 2;
        const halfTotalWidth = totalWidth / 2;
        const dx = road.endX - road.startX;
        const dy = road.endY - road.startY;
        const angle = Math.atan2(dy, dx);
        const perpX = -Math.sin(angle) * halfTotalWidth;
        const perpY = Math.cos(angle) * halfTotalWidth;
        const offsetX = -Math.sin(angle) * sidewalkWidth;
        const offsetY = Math.cos(angle) * sidewalkWidth;

        const upper = [
            { x: road.startX + perpX, y: road.startY + perpY },
            { x: road.startX + perpX + offsetX, y: road.startY + perpY + offsetY },
            { x: road.endX + perpX + offsetX, y: road.endY + perpY + offsetY },
            { x: road.endX + perpX, y: road.endY + perpY }
        ];

        const lower = [
            { x: road.startX - perpX, y: road.startY - perpY },
            { x: road.startX - perpX - offsetX, y: road.startY - perpY - offsetY },
            { x: road.endX - perpX - offsetX, y: road.endY - perpY - offsetY },
            { x: road.endX - perpX, y: road.endY - perpY }
        ];

        const fillPolygon = (points) => {
            this.ctx.beginPath();
            this.ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                this.ctx.lineTo(points[i].x, points[i].y);
            }
            this.ctx.closePath();
            this.ctx.fill();
        };

        this.ctx.fillStyle = surface;
        fillPolygon(upper);
        fillPolygon(lower);

        this.drawSidewalkPatternPolygon(upper);
        this.drawSidewalkPatternPolygon(lower);
    }

    // ------------------------------------------------------------------
    //  Sidewalk Pattern Helpers  (portiert, Zeilen 7266-7336)
    // ------------------------------------------------------------------

    /**
     * Zeichnet das Buergersteig-Raster innerhalb eines Rechtecks.
     * @param {number} x
     * @param {number} y
     * @param {number} width
     * @param {number} height
     */
    drawSidewalkPatternRect(x, y, width, height) {
        if (width <= 0 || height <= 0) {
            return;
        }
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(x, y, width, height);
        this.ctx.clip();
        this._renderSidewalkGridInBounds(x, y, width, height);
        this.ctx.restore();
    }

    /**
     * Zeichnet das Buergersteig-Raster innerhalb eines Polygons.
     * @param {Array<{x: number, y: number}>} points
     */
    drawSidewalkPatternPolygon(points) {
        if (!points || points.length === 0) {
            return;
        }
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            this.ctx.lineTo(points[i].x, points[i].y);
        }
        this.ctx.closePath();
        this.ctx.clip();

        let minX = points[0].x;
        let maxX = points[0].x;
        let minY = points[0].y;
        let maxY = points[0].y;
        for (const point of points) {
            if (point.x < minX) minX = point.x;
            if (point.x > maxX) maxX = point.x;
            if (point.y < minY) minY = point.y;
            if (point.y > maxY) maxY = point.y;
        }

        this._renderSidewalkGridInBounds(minX, minY, maxX - minX, maxY - minY);
        this.ctx.restore();
    }

    // ------------------------------------------------------------------
    //  Sidewalk Grid  (portiert aus renderSidewalkGridInBounds, Zeilen 7338-7497)
    // ------------------------------------------------------------------

    /**
     * @private
     */
    _renderSidewalkGridInBounds(x, y, width, height) {
        const tileSize = 26;
        const endX = x + width;
        const endY = y + height;
        const startX = Math.floor(x / tileSize) * tileSize;
        const startY = Math.floor(y / tileSize) * tileSize;

        // Vertikale Linien
        this.ctx.lineWidth = 1;
        this.ctx.strokeStyle = "rgba(158, 150, 140, 0.35)";
        for (let gx = startX; gx <= endX; gx += tileSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(gx, y);
            this.ctx.lineTo(gx, endY);
            this.ctx.stroke();
        }

        // Horizontale Linien
        this.ctx.strokeStyle = "rgba(158, 150, 140, 0.25)";
        for (let gy = startY; gy <= endY; gy += tileSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, gy);
            this.ctx.lineTo(endX, gy);
            this.ctx.stroke();
        }

        // Kachel-Details: Highlights, Schatten, Risse, Loecher
        for (let gy = startY; gy < endY; gy += tileSize) {
            for (let gx = startX; gx < endX; gx += tileSize) {
                const tileX = Math.max(gx, x);
                const tileY = Math.max(gy, y);
                const tileWidth = Math.min(tileSize, endX - tileX);
                const tileHeight = Math.min(tileSize, endY - tileY);

                if (tileWidth <= 0 || tileHeight <= 0) {
                    continue;
                }

                const indexX = Math.floor(gx / tileSize);
                const indexY = Math.floor(gy / tileSize);
                const shade = pseudoRandom2D(indexX * 1.17, indexY * 1.33);
                const highlightAlpha = 0.035 + shade * 0.025;
                const shadowAlpha = 0.05 + shade * 0.035;

                this.ctx.fillStyle = `rgba(255, 255, 255, ${highlightAlpha.toFixed(3)})`;
                this.ctx.fillRect(tileX, tileY, tileWidth, 2);

                this.ctx.fillStyle = `rgba(65, 59, 52, ${shadowAlpha.toFixed(3)})`;
                this.ctx.fillRect(tileX, tileY + tileHeight - 2, tileWidth, 2);

                const featureRand = pseudoRandom2D(indexX * 1.93 + 7.21, indexY * 2.11 + 4.37);

                if (featureRand > 0.978) {
                    const crackAngle = pseudoRandom2D(indexX * 3.17 + 1.94, indexY * 1.59 + 6.28) * Math.PI * 2;
                    const crackLength = 6 + pseudoRandom2D(indexX * 2.73 + 9.83, indexY * 2.41 + 3.88) * 12;
                    const centerX = tileX + pseudoRandom2D(indexX * 5.13 + 2.7, indexY * 4.77 + 3.1) * tileWidth;
                    const centerY = tileY + pseudoRandom2D(indexX * 6.91 + 1.3, indexY * 5.23 + 8.6) * tileHeight;
                    const cdx = Math.cos(crackAngle) * crackLength / 2;
                    const cdy = Math.sin(crackAngle) * crackLength / 2;

                    this.ctx.strokeStyle = "rgba(62, 54, 46, 0.35)";
                    this.ctx.lineWidth = 0.9;
                    this.ctx.beginPath();
                    this.ctx.moveTo(centerX - cdx, centerY - cdy);
                    this.ctx.lineTo(centerX + cdx, centerY + cdy);
                    this.ctx.stroke();

                    if (featureRand > 0.991) {
                        const branchAngle = crackAngle + (pseudoRandom2D(indexX * 7.77 + 0.19, indexY * 8.31 + 4.51) - 0.5) * 0.9;
                        const branchLength = crackLength * 0.6;
                        this.ctx.beginPath();
                        this.ctx.moveTo(centerX, centerY);
                        this.ctx.lineTo(centerX + Math.cos(branchAngle) * branchLength, centerY + Math.sin(branchAngle) * branchLength);
                        this.ctx.stroke();
                    }

                    const holeChance = pseudoRandom2D(indexX * 9.71 + 5.0, indexY * 10.63 + 7.7);
                    if (holeChance > 0.994) {
                        const radius = 1.5 + holeChance * 2.5;
                        const holeX = centerX + (pseudoRandom2D(indexX * 11.3 + 3.2, indexY * 11.9 + 6.4) - 0.5) * tileWidth * 0.3;
                        const holeY = centerY + (pseudoRandom2D(indexX * 12.7 + 4.6, indexY * 12.9 + 8.3) - 0.5) * tileHeight * 0.3;

                        this.ctx.fillStyle = "rgba(42, 36, 32, 0.3)";
                        this.ctx.beginPath();
                        this.ctx.arc(holeX, holeY, radius, 0, Math.PI * 2);
                        this.ctx.fill();

                        this.ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
                        this.ctx.lineWidth = 0.6;
                        this.ctx.beginPath();
                        this.ctx.arc(holeX - 1, holeY - 1, radius * 0.7, 0, Math.PI * 2);
                        this.ctx.stroke();
                    }
                }
            }
        }
    }

    // ------------------------------------------------------------------
    //  Zebrastreifen  (portiert aus drawCrosswalk, Zeilen 7670-7731)
    // ------------------------------------------------------------------

    /**
     * Zeichnet einen einzelnen Zebrastreifen.
     * @param {object} config - { x, y, orientation, span }
     * @param {number} roadWidth
     * @param {number} roadHalfWidth
     */
    drawCrosswalk(config, roadWidth = 70, roadHalfWidth = 35) {
        const { x, y, orientation, span } = config;
        const stripeWidth = 6;
        const gap = 10;
        const stripeColor = "rgba(255, 255, 255, 0.85)";
        const shadowColor = "rgba(0, 0, 0, 0.08)";

        this.ctx.save();
        this.ctx.fillStyle = stripeColor;

        if (orientation === "horizontal") {
            const startX = x - span / 2;
            const endX = x + span / 2;
            for (let sx = startX; sx <= endX; sx += stripeWidth + gap) {
                this.ctx.fillStyle = stripeColor;
                this.ctx.fillRect(sx, y - roadHalfWidth, stripeWidth, roadWidth);
                this.ctx.fillStyle = shadowColor;
                this.ctx.fillRect(sx, y - roadHalfWidth, stripeWidth, 4);
            }
        } else {
            const startY = y - span / 2;
            const endY = y + span / 2;
            for (let sy = startY; sy <= endY; sy += stripeWidth + gap) {
                this.ctx.fillStyle = stripeColor;
                this.ctx.fillRect(x - roadHalfWidth, sy, roadWidth, stripeWidth);
                this.ctx.fillStyle = shadowColor;
                this.ctx.fillRect(x - roadHalfWidth, sy, 4, stripeWidth);
            }
        }

        this.ctx.restore();
    }

    // ------------------------------------------------------------------
    //  Strassendetails  (portiert aus drawStreetDetails, Zeilen 7732-7801
    //  und Einzelmethoden Zeilen 8086-8511)
    // ------------------------------------------------------------------

    /**
     * Zeichnet alle Strassendetails (Parkplaetze, Baeume, Baenke, etc.).
     * @param {object} streetDetails
     */
    drawStreetDetails(streetDetails) {
        if (!streetDetails) {
            return;
        }

        for (const lot of streetDetails.parkingLots) {
            this.drawParkingLot(lot);
        }
        for (const bay of streetDetails.parkingBays) {
            this.drawParkingBay(bay);
        }
        for (const puddle of streetDetails.puddles) {
            this.drawPuddle(puddle);
        }
        for (const planter of streetDetails.planters) {
            this.drawPlanter(planter);
        }
        for (const tree of streetDetails.trees) {
            this.drawTree(tree);
        }
        for (const bench of streetDetails.benches) {
            this.drawBench(bench);
        }
        for (const rack of streetDetails.bikeRacks) {
            this.drawBikeRack(rack);
        }
        for (const lamp of streetDetails.lamps) {
            this.drawStreetLamp(lamp);
        }
        for (const bin of streetDetails.bins) {
            this.drawTrashBin(bin);
        }
        for (const stop of streetDetails.busStops) {
            this.drawBusStop(stop);
        }
    }

    // --- Parkplatz (Zeilen 8086-8234) ---

    drawParkingLot(lot) {
        if (!lot) {
            return;
        }
        const {
            x, y, width, height,
            rows = 2, slots = 6, aisle = 32,
            padding = 12, surfaceColor = '#2f3034'
        } = lot;

        this.ctx.save();
        this.ctx.fillStyle = surfaceColor;
        this.ctx.fillRect(x, y, width, height);

        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x + 1, y + 1, width - 2, height - 2);

        const innerX = x + padding;
        const innerY = y + padding;
        const innerWidth = width - padding * 2;
        const innerHeight = height - padding * 2;
        const effectiveRows = Math.max(1, rows);
        const totalAisle = aisle * Math.max(0, effectiveRows - 1);
        const rowHeight = (innerHeight - totalAisle) / effectiveRows;
        const slotCount = Math.max(1, slots);
        const slotWidth = innerWidth / slotCount;

        if (effectiveRows > 1) {
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
            for (let divider = 1; divider < effectiveRows; divider++) {
                const laneTop = innerY + divider * rowHeight + (divider - 1) * aisle;
                this.ctx.fillRect(innerX, laneTop, innerWidth, aisle);
            }
        }

        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
        this.ctx.lineWidth = 1.6;

        for (let row = 0; row < effectiveRows; row++) {
            const rowTop = innerY + row * (rowHeight + aisle);
            this.ctx.strokeRect(innerX, rowTop, innerWidth, rowHeight);

            const stopDepth = Math.min(8, rowHeight * 0.28);
            const stopMargin = Math.min(10, slotWidth * 0.18);
            const stopY = row === 0 ? rowTop + rowHeight - stopDepth : rowTop;

            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
            for (let slot = 0; slot < slotCount; slot++) {
                const slotX = innerX + slot * slotWidth;

                if (slot > 0) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(slotX, rowTop);
                    this.ctx.lineTo(slotX, rowTop + rowHeight);
                    this.ctx.stroke();
                }

                const stopX = slotX + stopMargin;
                const stopWidth = slotWidth - stopMargin * 2;
                this.ctx.fillRect(stopX, stopY, stopWidth, stopDepth);
            }
        }

        if (effectiveRows > 1) {
            this.ctx.setLineDash([12, 10]);
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
            this.ctx.lineWidth = 1.2;
            for (let divider = 1; divider < effectiveRows; divider++) {
                const laneTop = innerY + divider * rowHeight + (divider - 1) * aisle;
                const laneCenterY = laneTop + aisle / 2;
                this.ctx.beginPath();
                this.ctx.moveTo(innerX + 4, laneCenterY);
                this.ctx.lineTo(innerX + innerWidth - 4, laneCenterY);
                this.ctx.stroke();
            }
            this.ctx.setLineDash([]);
        }

        this.ctx.restore();
    }

    // --- Parkbucht (Zeilen 8238-8256) ---

    drawParkingBay(bay) {
        const { x, y, width, height } = bay;
        this.ctx.save();
        this.ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
        this.ctx.fillRect(x, y, width, height);
        this.ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x, y, width, height);
        this.ctx.restore();
    }

    // --- Blumenkuebel (Zeilen 8258-8274) ---

    drawPlanter(planter) {
        const { x, y, width, height } = planter;
        this.ctx.save();
        this.ctx.fillStyle = "#b6a184";
        this.ctx.fillRect(x - width / 2, y - height / 2, width, height);
        this.ctx.fillStyle = "#6ea56f";
        this.ctx.fillRect(x - width / 2 + 4, y - height / 2 + 4, width - 8, height - 8);
        this.ctx.restore();
    }

    // --- Baum (Zeilen 8276-8324) ---

    drawTree(tree) {
        const { x, y, size, variant = 0 } = tree;
        this.ctx.save();

        const pitSize = size * 0.8;
        this.ctx.fillStyle = "#3a342c";
        this.ctx.fillRect(x - pitSize / 2, y - pitSize / 2, pitSize, pitSize);
        this.ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(x - pitSize / 2, y - pitSize / 2, pitSize, pitSize);

        const palettes = [
            ["rgba(66, 142, 95, 0.95)", "rgba(32, 82, 55, 0.85)"],
            ["rgba(74, 160, 105, 0.95)", "rgba(38, 96, 65, 0.85)"],
            ["rgba(90, 170, 120, 0.95)", "rgba(44, 88, 60, 0.85)"]
        ];
        const paletteIndex = Math.abs(Math.floor(variant)) % palettes.length;
        const colors = palettes[paletteIndex];

        const canopy = this.ctx.createRadialGradient(x, y, size * 0.2, x, y, size);
        canopy.addColorStop(0, colors[0]);
        canopy.addColorStop(1, colors[1]);

        this.ctx.fillStyle = canopy;
        this.ctx.beginPath();
        this.ctx.arc(x, y, size, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.restore();
    }

    // --- Bank (Zeilen 8326-8364) ---

    drawBench(bench) {
        const { x, y, orientation } = bench;
        this.ctx.save();

        const length = orientation === "vertical" ? 42 : 72;
        const depth = 12;

        if (orientation === "horizontal") {
            this.ctx.fillStyle = "#8c6f47";
            this.ctx.fillRect(x - length / 2, y - depth / 2, length, depth);
            this.ctx.strokeStyle = "#2f2519";
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(x - length / 2, y - depth / 2, length, depth);
        } else {
            this.ctx.fillStyle = "#8c6f47";
            this.ctx.fillRect(x - depth / 2, y - length / 2, depth, length);
            this.ctx.strokeStyle = "#2f2519";
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(x - depth / 2, y - length / 2, depth, length);
        }

        this.ctx.restore();
    }

    // --- Fahrradstaender (Zeilen 8366-8408) ---

    drawBikeRack(rack) {
        const { x, y, orientation } = rack;
        this.ctx.save();
        this.ctx.strokeStyle = "#6c7c8a";
        this.ctx.lineWidth = 3;

        const loopCount = 3;
        const spacing = 16;

        if (orientation === "horizontal") {
            for (let i = 0; i < loopCount; i++) {
                this.ctx.beginPath();
                this.ctx.arc(x - 20 + i * spacing, y, 7, Math.PI, 0, false);
                this.ctx.stroke();
            }
        } else {
            for (let i = 0; i < loopCount; i++) {
                this.ctx.beginPath();
                this.ctx.arc(x, y - 20 + i * spacing, 7, Math.PI / 2, -Math.PI / 2, false);
                this.ctx.stroke();
            }
        }

        this.ctx.restore();
    }

    // --- Strassenlaterne (Zeilen 8410-8438) ---

    drawStreetLamp(lamp) {
        const { x, y } = lamp;
        this.ctx.save();
        this.ctx.strokeStyle = "#404852";
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(x, y - 36);
        this.ctx.lineTo(x, y);
        this.ctx.stroke();

        this.ctx.fillStyle = "rgba(255, 220, 150, 0.8)";
        this.ctx.beginPath();
        this.ctx.arc(x, y - 36, 6, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.restore();
    }

    // --- Muelleimer (Zeilen 8440-8456) ---

    drawTrashBin(bin) {
        const { x, y } = bin;
        this.ctx.save();
        this.ctx.fillStyle = "#3d4852";
        this.ctx.fillRect(x - 6, y - 10, 12, 16);
        this.ctx.fillStyle = "#6c7a88";
        this.ctx.fillRect(x - 6, y - 12, 12, 4);
        this.ctx.restore();
    }

    // --- Bushaltestelle (Zeilen 8458-8486) ---

    drawBusStop(stop) {
        const { x, y, orientation, length } = stop;
        this.ctx.save();
        this.ctx.fillStyle = "rgba(40, 50, 60, 0.85)";

        if (orientation === "horizontal") {
            this.ctx.fillRect(x - length / 2, y - 10, length, 20);
            this.ctx.fillStyle = "rgba(255, 220, 120, 0.4)";
            this.ctx.fillRect(x - length / 2, y - 2, length, 4);
        } else {
            this.ctx.fillRect(x - 10, y - length / 2, 20, length);
            this.ctx.fillStyle = "rgba(255, 220, 120, 0.4)";
            this.ctx.fillRect(x - 2, y - length / 2, 4, length);
        }

        this.ctx.restore();
    }

    // --- Pfuetze (Zeilen 8488-8510) ---

    drawPuddle(puddle) {
        const { x, y, radius } = puddle;
        this.ctx.save();

        const gradient = this.ctx.createRadialGradient(x, y, radius * 0.2, x, y, radius);
        gradient.addColorStop(0, "rgba(120, 170, 200, 0.5)");
        gradient.addColorStop(1, "rgba(40, 70, 100, 0.2)");

        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.ellipse(x, y, radius * 1.4, radius, 0, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.restore();
    }
}


// ═══════════════════════════════════════════════════════
// js/rendering/BuildingRenderer.js
// ═══════════════════════════════════════════════════════
/**
 * BuildingRenderer — Zeichnet alle Gebäudetypen.
 * Portiert aus overworld.js Zeilen 8512-10894.
 */

class BuildingRenderer {

    /**
     * @param {import('./Renderer.js').Renderer} renderer
     * @param {import('./WorldRenderer.js').WorldRenderer} worldRenderer
     */
    constructor(renderer, worldRenderer) {
        this.renderer = renderer;
        this.ctx = renderer.getContext();
        this.worldRenderer = worldRenderer;
        this.houseStyles = [];
    }

    setHouseStyles(styles) {
        this.houseStyles = styles;
    }

    // --- Main entry ---

    drawBuildings(buildings) {
        if (!Array.isArray(buildings)) return;

        for (const building of buildings) {
            switch (building.type) {
                case 'casino':        this.drawCasino(building); break;
                case 'police':        this.drawPoliceStation(building); break;
                case 'mixedUse':      this.drawMixedUseBlock(building); break;
                case 'officeTower':   this.drawOfficeTower(building); break;
                case 'residentialTower': this.drawResidentialTower(building); break;
                case 'weaponShop':    this.drawWeaponShop(building); break;
                case 'motel':         this.drawMotel(building); break;
                case 'apartmentComplex': this.drawApartmentComplex(building); break;
                case 'realEstateAgent': this.drawRealEstateAgent(building); break;
                case 'bungalow':      this.drawBungalow(building); break;
                case 'restaurant':    this.drawRestaurant(building); break;
                case 'shop':          this.drawShop(building); break;
                case 'house':
                default:              this.drawHouse(building); break;
            }
        }

        // Interaktions-Punkte nicht mehr visuell zeichnen (Funktion bleibt erhalten)
        // this.drawInteractionPoints(buildings);
    }

    // --- House Window Interior ---

    drawHouseWindowInterior(building, x, y, width, height, rowIndex, colIndex) {
        if (!this.ctx) return;

        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(x, y, width, height);
        this.ctx.clip();

        const base = this.ctx.createLinearGradient(x, y, x, y + height);
        base.addColorStop(0, 'rgba(30, 36, 48, 0.92)');
        base.addColorStop(1, 'rgba(16, 18, 28, 0.94)');
        this.ctx.fillStyle = base;
        this.ctx.fillRect(x, y, width, height);

        const floorY = y + height * 0.85;
        this.ctx.fillStyle = 'rgba(52, 40, 36, 0.82)';
        this.ctx.fillRect(x - width * 0.1, floorY, width * 1.2, height - (floorY - y));

        const baseX = Number(building?.x ?? 0);
        const baseY = Number(building?.y ?? 0);
        const seedX = baseX * 0.013 + rowIndex * 0.37 + colIndex * 0.19;
        const seedY = baseY * 0.017 + rowIndex * 0.29 + colIndex * 0.41;
        const theme = pseudoRandom2D(seedX, seedY);
        const glow = pseudoRandom2D(seedX + 4.71, seedY + 8.12);

        if (glow > 0.32) {
            const glowGradient = this.ctx.createRadialGradient(
                x + width / 2, y + height * 0.35, width * 0.05,
                x + width / 2, y + height * 0.35, width * 0.65
            );
            glowGradient.addColorStop(0, `rgba(255, 224, 170, ${0.32 + glow * 0.28})`);
            glowGradient.addColorStop(1, 'rgba(255, 224, 170, 0)');
            this.ctx.fillStyle = glowGradient;
            this.ctx.fillRect(x, y, width, height);
        }

        if (theme < 0.33) {
            // Plant
            const potWidth = width * 0.32;
            const potHeight = height * 0.18;
            const potX = x + width * 0.5 - potWidth / 2 + (theme - 0.16) * width * 0.2;
            const potY = floorY - potHeight;
            this.ctx.fillStyle = 'rgba(120, 72, 44, 0.9)';
            this.ctx.fillRect(potX, potY, potWidth, potHeight);

            const stemHeight = height * 0.42;
            this.ctx.strokeStyle = 'rgba(46, 104, 64, 0.9)';
            this.ctx.lineWidth = Math.max(2, width * 0.06);
            this.ctx.beginPath();
            this.ctx.moveTo(potX + potWidth / 2, potY);
            this.ctx.lineTo(potX + potWidth / 2, potY - stemHeight);
            this.ctx.stroke();

            for (let i = 0; i < 3; i++) {
                const leafAngle = (i - 1) * 0.55;
                const leafLength = width * (0.35 + i * 0.06);
                this.ctx.fillStyle = 'rgba(68, 128, 78, 0.85)';
                this.ctx.beginPath();
                const leafBaseY2 = potY - stemHeight * (0.35 + i * 0.22);
                const leafBaseX = potX + potWidth / 2;
                this.ctx.moveTo(leafBaseX, leafBaseY2);
                this.ctx.quadraticCurveTo(leafBaseX + Math.cos(leafAngle) * leafLength, leafBaseY2 - Math.sin(leafAngle) * height * 0.2, leafBaseX + Math.cos(leafAngle) * leafLength * 0.6, leafBaseY2 - Math.sin(leafAngle) * height * 0.1);
                this.ctx.quadraticCurveTo(leafBaseX + Math.cos(leafAngle) * leafLength * 0.2, leafBaseY2 - Math.sin(leafAngle) * height * 0.05, leafBaseX, leafBaseY2);
                this.ctx.fill();
            }
        } else if (theme < 0.66) {
            // Bookshelf
            const shelfWidth = width * 0.6;
            const shelfHeight2 = height * 0.7;
            const shelfX = x + width * 0.2 + (theme - 0.5) * width * 0.1;
            const shelfY = y + height * 0.22;
            this.ctx.fillStyle = 'rgba(70, 52, 42, 0.85)';
            this.ctx.fillRect(shelfX, shelfY, shelfWidth, shelfHeight2);

            const shelfCount = 3;
            for (let level = 1; level < shelfCount; level++) {
                const shelfLineY = shelfY + (shelfHeight2 / shelfCount) * level;
                this.ctx.fillStyle = 'rgba(45, 32, 26, 0.9)';
                this.ctx.fillRect(shelfX + 4, shelfLineY - 2, shelfWidth - 8, 4);
            }

            const bookSeed = pseudoRandom2D(seedX + 9.1, seedY + 3.7);
            const bookCount = 5 + Math.round(bookSeed * 3);
            for (let book = 0; book < bookCount; book++) {
                const lane = book % shelfCount;
                const sectionHeight = shelfHeight2 / shelfCount;
                const bx = shelfX + 8 + (book / Math.max(1, bookCount - 1)) * (shelfWidth - 16 - width * 0.1);
                const by = shelfY + lane * sectionHeight + 6;
                const bh = sectionHeight - 12;
                const bw = width * 0.1;
                const hueSeed = pseudoRandom2D(seedX + book * 3.2, seedY + book * 4.4);
                const color = hueSeed < 0.33 ? 'rgba(180, 120, 90, 0.9)' : hueSeed < 0.66 ? 'rgba(90, 120, 170, 0.9)' : 'rgba(200, 180, 110, 0.9)';
                this.ctx.fillStyle = color;
                this.ctx.fillRect(bx, by, bw, bh);
            }
        } else {
            // Sofa + lamp
            const sofaWidth = width * 0.75;
            const sofaHeight2 = height * 0.28;
            const sofaX = x + width * 0.125;
            const sofaY = floorY - sofaHeight2;
            this.ctx.fillStyle = 'rgba(120, 64, 82, 0.85)';
            this.ctx.fillRect(sofaX, sofaY, sofaWidth, sofaHeight2);
            this.ctx.fillStyle = 'rgba(90, 42, 60, 0.9)';
            this.ctx.fillRect(sofaX, sofaY - sofaHeight2 * 0.55, sofaWidth, sofaHeight2 * 0.55);

            for (let cushion = 0; cushion < 3; cushion++) {
                const cushionWidth = sofaWidth / 3 - width * 0.04;
                const cx2 = sofaX + width * 0.02 + cushion * (cushionWidth + width * 0.02);
                this.ctx.fillStyle = 'rgba(220, 200, 200, 0.6)';
                this.ctx.fillRect(cx2, sofaY - sofaHeight2 * 0.4, cushionWidth, sofaHeight2 * 0.22);
            }

            const lampX = x + width * 0.82;
            const lampBaseY2 = floorY - sofaHeight2 * 0.2;
            this.ctx.strokeStyle = 'rgba(180, 170, 150, 0.8)';
            this.ctx.lineWidth = Math.max(1.5, width * 0.04);
            this.ctx.beginPath();
            this.ctx.moveTo(lampX, lampBaseY2);
            this.ctx.lineTo(lampX, y + height * 0.2);
            this.ctx.stroke();

            this.ctx.fillStyle = 'rgba(255, 220, 170, 0.78)';
            this.ctx.beginPath();
            this.ctx.ellipse(lampX, y + height * 0.22, width * 0.18, height * 0.12, 0, 0, Math.PI * 2);
            this.ctx.fill();
        }

        // Occupant
        const occupantChance = pseudoRandom2D(seedX + 5.31, seedY + 12.77);
        if (occupantChance > 0.82) {
            const bodyWidth = width * 0.32;
            const bodyX2 = x + width * 0.5 - bodyWidth / 2 + (occupantChance - 0.9) * width * 0.25;
            const bodyY2 = y + height * 0.34;
            const bodyHeight = height * 0.42;
            this.ctx.fillStyle = 'rgba(26, 30, 38, 0.75)';
            this.ctx.fillRect(bodyX2, bodyY2, bodyWidth, bodyHeight);
            this.ctx.beginPath();
            this.ctx.ellipse(bodyX2 + bodyWidth / 2, bodyY2 - height * 0.16, bodyWidth * 0.38, height * 0.22, 0, 0, Math.PI * 2);
            this.ctx.fill();
        }

        this.ctx.restore();
    }

    // --- House Window Frame ---

    drawHouseWindowFrame(building, x, y, width, height, palette = {}) {
        if (!this.ctx) return;

        const frameThickness = Math.max(2, Math.min(6, width * 0.18));
        const sillHeight = Math.max(3, height * 0.08);
        const frameColor = palette.windowFrame ?? 'rgba(28, 32, 40, 0.78)';

        this.ctx.save();
        this.ctx.fillStyle = frameColor;
        this.ctx.fillRect(x - frameThickness, y - frameThickness, width + frameThickness * 2, frameThickness);
        this.ctx.fillRect(x - frameThickness, y + height, width + frameThickness * 2, Math.max(2, frameThickness * 0.7));
        this.ctx.fillRect(x - frameThickness, y, frameThickness, height);
        this.ctx.fillRect(x + width, y, frameThickness, height);

        this.ctx.fillStyle = 'rgba(18, 20, 26, 0.65)';
        this.ctx.fillRect(x - frameThickness, y + height - sillHeight, width + frameThickness * 2, sillHeight + Math.max(2, frameThickness * 0.5));

        const highlight = this.ctx.createLinearGradient(x - frameThickness, y - frameThickness, x + width + frameThickness, y - frameThickness + frameThickness);
        highlight.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
        highlight.addColorStop(1, 'rgba(255, 255, 255, 0)');
        this.ctx.fillStyle = highlight;
        this.ctx.fillRect(x - frameThickness, y - frameThickness, width + frameThickness * 2, frameThickness);

        this.ctx.restore();
    }

    // --- House Window Dressing ---

    drawHouseWindowDressing(building, x, y, width, height, rowIndex, colIndex, palette = {}) {
        if (!this.ctx) return;

        const baseX = Number(building?.x ?? 0);
        const baseY2 = Number(building?.y ?? 0);
        const seedA = baseX * 0.021 + rowIndex * 0.37 + colIndex * 0.13;
        const seedB = baseY2 * 0.023 + rowIndex * 0.21 + colIndex * 0.29;
        const curtainChoice = pseudoRandom2D(seedA, seedB);
        const blindChoice = pseudoRandom2D(seedA + 2.71, seedB + 3.19);
        const lampChoice = pseudoRandom2D(seedA + 1.37, seedB + 5.61);

        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(x, y, width, height);
        this.ctx.clip();

        if (lampChoice > 0.78) {
            const glw = this.ctx.createRadialGradient(x + width * 0.5, y + height * 0.45, width * 0.08, x + width * 0.5, y + height * 0.45, width * 0.9);
            glw.addColorStop(0, 'rgba(255, 214, 170, ' + (0.2 + lampChoice * 0.25).toFixed(3) + ')');
            glw.addColorStop(1, 'rgba(255, 214, 170, 0)');
            this.ctx.fillStyle = glw;
            this.ctx.fillRect(x, y, width, height);
        }

        if (curtainChoice > 0.64) {
            const curtainPalette = [
                'rgba(224, 186, 176, 0.72)', 'rgba(188, 196, 220, 0.7)',
                'rgba(216, 188, 210, 0.72)', 'rgba(210, 200, 166, 0.7)'
            ];
            const curtainIndex = Math.floor(curtainChoice * curtainPalette.length) % curtainPalette.length;
            const curtainGradient = this.ctx.createLinearGradient(x, y, x, y + height);
            curtainGradient.addColorStop(0, curtainPalette[curtainIndex]);
            curtainGradient.addColorStop(1, 'rgba(48, 34, 30, 0.7)');
            const curtainWidth = width * 0.36;
            this.ctx.fillStyle = curtainGradient;

            this.ctx.beginPath();
            this.ctx.moveTo(x - width * 0.02, y);
            this.ctx.lineTo(x + curtainWidth, y + height * 0.18);
            this.ctx.lineTo(x + curtainWidth * 0.92, y + height);
            this.ctx.lineTo(x - width * 0.02, y + height);
            this.ctx.closePath();
            this.ctx.fill();

            this.ctx.beginPath();
            const rightStart = x + width - curtainWidth;
            this.ctx.moveTo(x + width + width * 0.02, y);
            this.ctx.lineTo(rightStart, y + height * 0.18);
            this.ctx.lineTo(rightStart + curtainWidth * 0.08, y + height);
            this.ctx.lineTo(x + width + width * 0.02, y + height);
            this.ctx.closePath();
            this.ctx.fill();
        } else if (blindChoice > 0.38) {
            const slatCount = 5 + Math.round(blindChoice * 6);
            const slatHeight = Math.max(2, height / (slatCount * 1.8));
            for (let slat = 0; slat < slatCount; slat++) {
                const t = slat / Math.max(1, slatCount - 1);
                const tone = 0.28 + t * 0.18;
                this.ctx.fillStyle = 'rgba(214, 218, 228, ' + tone.toFixed(3) + ')';
                const slatY = y + t * (height - slatHeight);
                this.ctx.fillRect(x, slatY, width, slatHeight);
            }
            this.ctx.strokeStyle = 'rgba(120, 126, 138, 0.4)';
            this.ctx.lineWidth = Math.max(1, width * 0.02);
            this.ctx.beginPath();
            this.ctx.moveTo(x + width - width * 0.12, y);
            this.ctx.lineTo(x + width - width * 0.12, y + height);
            this.ctx.stroke();
        } else {
            const sheer = this.ctx.createLinearGradient(x, y, x + width, y + height);
            sheer.addColorStop(0, 'rgba(238, 240, 248, 0.26)');
            sheer.addColorStop(1, 'rgba(198, 210, 226, 0.18)');
            this.ctx.fillStyle = sheer;
            this.ctx.fillRect(x, y, width, height);
            this.ctx.fillStyle = 'rgba(118, 132, 158, 0.15)';
            this.ctx.fillRect(x + width * 0.44, y, width * 0.12, height);
        }

        const pelmetHeight = Math.max(2, height * 0.06);
        this.ctx.fillStyle = 'rgba(14, 14, 20, 0.45)';
        this.ctx.fillRect(x, y, width, pelmetHeight);

        this.ctx.restore();
    }

    // --- House Facade Lighting ---

    drawHouseFacadeLighting(building, metrics, palette = {}) {
        if (!this.ctx || !metrics) return;

        const { houseX, houseWidth, facadeTop, facadeHeight, houseBottom } = metrics;
        const baseX = Number(building?.x ?? 0);
        const baseY2 = Number(building?.y ?? 0);
        const highlightSeed = pseudoRandom2D(baseX * 0.0087 + facadeHeight * 0.0001, baseY2 * 0.0091 + houseWidth * 0.0001);
        const floors = Math.max(2, Math.round(building?.variant?.floors ?? palette.floors ?? 4));

        this.ctx.save();

        // Left AO
        const aoWidth = Math.max(16, houseWidth * 0.08);
        const leftShade = this.ctx.createLinearGradient(houseX, facadeTop, houseX + aoWidth, facadeTop);
        leftShade.addColorStop(0, 'rgba(0, 0, 0, 0.28)');
        leftShade.addColorStop(1, 'rgba(0, 0, 0, 0)');
        this.ctx.fillStyle = leftShade;
        this.ctx.fillRect(houseX, facadeTop, aoWidth, facadeHeight);

        // Right highlight
        const highlightWidth = Math.max(12, houseWidth * 0.06);
        const rightHighlight = this.ctx.createLinearGradient(houseX + houseWidth - highlightWidth, facadeTop, houseX + houseWidth, facadeTop);
        rightHighlight.addColorStop(0, 'rgba(255, 230, 200, 0.24)');
        rightHighlight.addColorStop(1, 'rgba(255, 230, 200, 0)');
        this.ctx.fillStyle = rightHighlight;
        this.ctx.fillRect(houseX + houseWidth - highlightWidth, facadeTop, highlightWidth, facadeHeight);

        // Base shadow
        const baseShadowHeight = Math.max(18, facadeHeight * 0.12);
        const baseShadow = this.ctx.createLinearGradient(houseX, houseBottom - baseShadowHeight, houseX, houseBottom);
        baseShadow.addColorStop(0, 'rgba(0, 0, 0, 0)');
        baseShadow.addColorStop(1, 'rgba(0, 0, 0, 0.25)');
        this.ctx.fillStyle = baseShadow;
        this.ctx.fillRect(houseX, houseBottom - baseShadowHeight, houseWidth, baseShadowHeight);

        // Floor lines
        const floorSpacing = facadeHeight / floors;
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        this.ctx.lineWidth = 1;
        for (let level = 1; level < floors; level++) {
            const ly = facadeTop + level * floorSpacing;
            this.ctx.beginPath();
            this.ctx.moveTo(houseX + 8, ly);
            this.ctx.lineTo(houseX + houseWidth - 8, ly);
            this.ctx.stroke();
        }

        // Column lines
        const columnCount = Math.max(3, Math.floor(houseWidth / 70));
        for (let column = 1; column < columnCount; column++) {
            const columnX = houseX + column * (houseWidth / columnCount);
            const columnSeed = pseudoRandom2D(highlightSeed + column * 1.7, highlightSeed + column * 2.5);
            const intensity = 0.04 + columnSeed * 0.08;
            this.ctx.fillStyle = 'rgba(255, 255, 255, ' + intensity.toFixed(3) + ')';
            this.ctx.fillRect(columnX - 1, facadeTop + 6, 2, facadeHeight - 12);
        }

        // Noise texture
        const textureSeed = highlightSeed * 137.31;
        const textureCount = Math.min(90, Math.round(houseWidth * facadeHeight / 550));
        this.ctx.globalAlpha = 0.08;
        this.ctx.fillStyle = 'rgba(0, 0, 0, 1)';
        for (let i = 0; i < textureCount; i++) {
            const noiseX = pseudoRandom2D(textureSeed + i * 1.13, textureSeed + i * 2.19);
            const noiseY = pseudoRandom2D(textureSeed + i * 3.17, textureSeed + i * 4.41);
            const px = houseX + noiseX * houseWidth;
            const py = facadeTop + noiseY * facadeHeight;
            const sizeSeed = pseudoRandom2D(textureSeed + i * 5.23, textureSeed + i * 6.37);
            const size = Math.max(1, Math.min(3, sizeSeed * 3));
            this.ctx.fillRect(px, py, size, size * 0.6);
        }
        this.ctx.globalAlpha = 1;

        // Specular highlight
        const highlightCenterX = houseX + highlightSeed * houseWidth * 0.8 + houseWidth * 0.1;
        const highlightCenterY = facadeTop + (0.2 + highlightSeed * 0.5) * facadeHeight;
        const specular = this.ctx.createRadialGradient(highlightCenterX, highlightCenterY, houseWidth * 0.05, highlightCenterX, highlightCenterY, houseWidth * 0.45);
        specular.addColorStop(0, 'rgba(255, 235, 210, 0.12)');
        specular.addColorStop(1, 'rgba(255, 235, 210, 0)');
        this.ctx.fillStyle = specular;
        this.ctx.fillRect(houseX, facadeTop, houseWidth, facadeHeight);

        this.ctx.restore();
    }

    // --- drawHouse ---

    drawHouse(building) {
        const metrics = computeHouseMetrics(building, this.houseStyles);
        if (!metrics) return;

        const { x: lotOriginX, y: lotOriginY, width: lotWidth, height: lotHeight, variant = {} } = building;
        const { houseX, houseY, houseWidth, houseHeight, houseBottom, roofDepth, facadeTop, facadeHeight, frontDepth, walkway, door, palette } = metrics;

        const floors = Math.max(2, variant.floors ?? palette.floors ?? 4);
        const roofGarden = Boolean(variant.roofGarden ?? palette.roofGarden ?? false);
        const balconyRhythm = Math.max(0, variant.balconyRhythm ?? 0);

        this.ctx.save();
        this.ctx.translate(lotOriginX, lotOriginY);
        this.ctx.lineJoin = 'round';

        // Walkway
        const lawnHeight = Math.max(8, frontDepth * 0.65);
        const walkwayX = walkway.x;
        const walkwayY = walkway.y;
        const walkwayWidth = walkway.width;
        const walkwayHeight = walkway.height;

        const walkwayGradient = this.ctx.createLinearGradient(walkwayX, walkwayY, walkwayX, walkwayY + walkwayHeight);
        walkwayGradient.addColorStop(0, '#e3dbd0');
        walkwayGradient.addColorStop(1, '#c2b7a3');
        this.ctx.fillStyle = walkwayGradient;
        this.ctx.fillRect(walkwayX, walkwayY, walkwayWidth, walkwayHeight);
        this.worldRenderer.drawSidewalkPatternRect(walkwayX, walkwayY, walkwayWidth, walkwayHeight);

        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
        this.ctx.fillRect(walkwayX, walkwayY, walkwayWidth, 3);
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
        this.ctx.fillRect(walkwayX + 4, walkwayY, walkwayWidth - 8, 2);
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
        this.ctx.fillRect(walkwayX, walkwayY + Math.max(2, walkwayHeight - 3), walkwayWidth, 3);

        // Walkway extension
        const walkwayExtension = Math.max(0, variant.walkwayExtension ?? 0);
        if (walkwayExtension > 0) {
            const extensionY = walkwayY + walkwayHeight;
            this.ctx.fillStyle = '#d9d1c4';
            this.ctx.fillRect(walkwayX, extensionY, walkwayWidth, walkwayExtension);
            this.worldRenderer.drawSidewalkPatternRect(walkwayX, extensionY, walkwayWidth, walkwayExtension);
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
            this.ctx.fillRect(walkwayX, extensionY, walkwayWidth, 3);
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
            this.ctx.fillRect(walkwayX + 4, extensionY, walkwayWidth - 8, 2);

            const walkwayBottom = extensionY + walkwayExtension;
            const spurLength = Math.max(0, variant.walkwaySpurLength ?? 0);
            const spurThickness = Math.max(8, variant.walkwaySpurWidth ?? Math.min(16, walkwayExtension * 0.6 + 6));
            if (spurLength > 0 && spurThickness > 0) {
                const spurX = walkwayX + walkwayWidth / 2 - spurLength;
                const spurY = walkwayBottom - spurThickness;
                this.ctx.fillStyle = '#d9d1c4';
                this.ctx.fillRect(spurX, spurY, spurLength * 2, spurThickness);
                this.worldRenderer.drawSidewalkPatternRect(spurX, spurY, spurLength * 2, spurThickness);
                this.ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
                this.ctx.fillRect(spurX, spurY, spurLength * 2, 2);
                this.ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
                this.ctx.fillRect(spurX + 4, spurY, spurLength * 2 - 8, 2);
                this.ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
                this.ctx.fillRect(spurX, spurY + spurThickness - 2, spurLength * 2, 2);
            }
        }

        // Planters
        const planterSeed = pseudoRandom2D(Number(building.x ?? 0) * 0.0127, Number(building.y ?? 0) * 0.0173);
        if (planterSeed > 0.58 && walkwayWidth > 26) {
            const planterWidth = Math.max(18, walkwayWidth * 0.32);
            const planterHeight = Math.max(14, walkwayHeight * 0.55);
            const planterY = walkwayY + walkwayHeight - planterHeight - Math.max(3, walkwayHeight * 0.1);
            const soilHeight = Math.max(3, planterHeight * 0.28);

            const drawPlanter = (baseX, seedOffset) => {
                this.ctx.fillStyle = 'rgba(70, 56, 42, 0.85)';
                this.ctx.fillRect(baseX, planterY, planterWidth, planterHeight);
                this.ctx.fillStyle = 'rgba(26, 28, 22, 0.88)';
                this.ctx.fillRect(baseX, planterY + planterHeight - soilHeight, planterWidth, soilHeight);

                const foliageCount = 4 + Math.round(pseudoRandom2D(seedOffset + 0.77, seedOffset + 1.91) * 3);
                for (let plant = 0; plant < foliageCount; plant++) {
                    const t = (plant + 0.5) / foliageCount;
                    const plantSeed = pseudoRandom2D(seedOffset + plant * 1.33, seedOffset + plant * 2.61);
                    const plantHeight = planterHeight * (0.45 + plantSeed * 0.55);
                    const plantX = baseX + 4 + t * (planterWidth - 8);
                    const plantColor = plantSeed > 0.5 ? 'rgba(58, 134, 82, 0.88)' : 'rgba(88, 162, 102, 0.82)';
                    this.ctx.fillStyle = plantColor;
                    this.ctx.beginPath();
                    this.ctx.moveTo(plantX, planterY + planterHeight - soilHeight);
                    this.ctx.lineTo(plantX - 4, planterY + planterHeight - soilHeight - plantHeight * 0.5);
                    this.ctx.lineTo(plantX + 4, planterY + planterHeight - soilHeight - plantHeight);
                    this.ctx.closePath();
                    this.ctx.fill();
                }
            };

            drawPlanter(walkwayX - planterWidth - 8, planterSeed);
            drawPlanter(walkwayX + walkwayWidth + 8, planterSeed + 1.37);
        }

        // Shadow
        const shadowHeight = Math.min(10, lawnHeight + 6);
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        this.ctx.fillRect(houseX - 10, houseBottom - 4, houseWidth + 20, shadowHeight);

        // Facade
        this.ctx.fillStyle = palette.base;
        this.ctx.fillRect(houseX, facadeTop, houseWidth, facadeHeight);

        const warmGradient = this.ctx.createLinearGradient(houseX, facadeTop, houseX + houseWidth * 0.8, facadeTop + facadeHeight * 0.8);
        warmGradient.addColorStop(0, 'rgba(255, 196, 128, 0.32)');
        warmGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        this.ctx.fillStyle = warmGradient;
        this.ctx.fillRect(houseX, facadeTop, houseWidth, facadeHeight);

        const coolGradient = this.ctx.createLinearGradient(houseX + houseWidth, facadeTop + facadeHeight, houseX + houseWidth * 0.4, facadeTop + facadeHeight * 0.4);
        coolGradient.addColorStop(0, 'rgba(70, 90, 120, 0.2)');
        coolGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        this.ctx.fillStyle = coolGradient;
        this.ctx.fillRect(houseX, facadeTop, houseWidth, facadeHeight);

        this.drawHouseFacadeLighting(building, { houseX, houseWidth, facadeTop, facadeHeight, houseBottom }, palette);

        // Facade border
        this.ctx.strokeStyle = palette.roof;
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(houseX, facadeTop, houseWidth, facadeHeight);

        if (facadeHeight > 20) {
            this.ctx.setLineDash([12, 6]);
            this.ctx.strokeStyle = palette.accent;
            this.ctx.lineWidth = 1.5;
            this.ctx.strokeRect(houseX + 8, facadeTop + 8, houseWidth - 16, Math.max(12, facadeHeight - 16));
            this.ctx.setLineDash([]);
        }

        // Roof
        if (roofGarden) {
            const padding = Math.min(houseWidth * 0.6, roofDepth * 1.05);
            const deckY = facadeTop - Math.max(8, roofDepth * 0.65);
            this.ctx.beginPath();
            this.ctx.moveTo(houseX - 6, facadeTop);
            this.ctx.lineTo(houseX + houseWidth + 6, facadeTop);
            this.ctx.lineTo(houseX + houseWidth - padding * 0.45, deckY);
            this.ctx.lineTo(houseX + padding * 0.45, deckY);
            this.ctx.closePath();
            const roofGradient = this.ctx.createLinearGradient(houseX, deckY, houseX, facadeTop);
            roofGradient.addColorStop(0, palette.roof);
            roofGradient.addColorStop(1, 'rgba(30, 30, 30, 0.82)');
            this.ctx.fillStyle = roofGradient;
            this.ctx.fill();
            this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            this.ctx.fillStyle = palette.accent;
            this.ctx.fillRect(houseX - 4, facadeTop - 3, houseWidth + 8, 3);

            const planterCount = Math.max(3, Math.floor(houseWidth / 80));
            for (let i = 0; i < planterCount; i++) {
                const px = houseX + 18 + i * (houseWidth - 36) / Math.max(1, planterCount - 1) - 12;
                const py = deckY + 6;
                this.ctx.fillStyle = palette.highlight ?? palette.accent;
                this.ctx.fillRect(px, py, 24, 10);
                this.ctx.fillStyle = '#4d8b54';
                this.ctx.fillRect(px + 2, py - 6, 20, 8);
            }
        } else {
            const ridgeHeight = Math.max(10, roofDepth * 0.55);
            this.ctx.beginPath();
            this.ctx.moveTo(houseX - 8, facadeTop);
            this.ctx.lineTo(houseX + houseWidth + 8, facadeTop);
            this.ctx.lineTo(houseX + houseWidth / 2, facadeTop - ridgeHeight);
            this.ctx.closePath();
            const roofGradient = this.ctx.createLinearGradient(houseX, facadeTop - ridgeHeight, houseX, facadeTop);
            roofGradient.addColorStop(0, palette.roof);
            roofGradient.addColorStop(1, 'rgba(25, 25, 25, 0.78)');
            this.ctx.fillStyle = roofGradient;
            this.ctx.fill();
            this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();

            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
            this.ctx.lineWidth = 1;
            for (let band = facadeTop - 6; band > facadeTop - ridgeHeight + 6; band -= 10) {
                this.ctx.beginPath();
                this.ctx.moveTo(houseX + 14, band);
                this.ctx.lineTo(houseX + houseWidth - 14, band);
                this.ctx.stroke();
            }

            // HVAC
            const hvacCount = Math.max(2, Math.floor(houseWidth / 90));
            const hvacY = facadeTop - Math.min(18, roofDepth * 0.45);
            const unitWidth = Math.min(36, houseWidth / (hvacCount + 1));
            const unitHeight = Math.min(20, roofDepth * 0.45);
            for (let i = 0; i < hvacCount; i++) {
                const ux = houseX + 18 + i * (unitWidth + 16);
                this.ctx.fillStyle = palette.metallic;
                this.ctx.fillRect(ux, hvacY, unitWidth, unitHeight);
                this.ctx.fillStyle = 'rgba(255, 255, 255, 0.24)';
                this.ctx.fillRect(ux + 3, hvacY + 3, unitWidth - 6, unitHeight - 6);
            }
        }

        // Balcony rhythm
        if (balconyRhythm > 0 && facadeHeight > 30) {
            const beltSpacing = facadeHeight / (balconyRhythm + 1);
            this.ctx.fillStyle = palette.balcony;
            for (let i = 1; i <= balconyRhythm; i++) {
                const beltY = facadeTop + beltSpacing * i;
                this.ctx.fillRect(houseX + 14, beltY - 2, houseWidth - 28, 4);
            }
        } else if (facadeHeight > 40) {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
            this.ctx.fillRect(houseX + 14, facadeTop + facadeHeight * 0.46, houseWidth - 28, 3);
        }

        // Windows
        const windowAreaTop = facadeTop + 14;
        const windowAreaBottom = facadeTop + facadeHeight - 14;
        const windowAreaHeight = Math.max(36, windowAreaBottom - windowAreaTop);
        let windowRows = Math.min(4, Math.max(2, Math.round(floors * 0.6)));
        let windowHeight = Math.min(34, (windowAreaHeight - (windowRows - 1) * 14) / windowRows);
        while (windowHeight < 18 && windowRows > 2) {
            windowRows -= 1;
            windowHeight = Math.min(34, (windowAreaHeight - (windowRows - 1) * 14) / windowRows);
        }
        windowHeight = Math.max(18, Math.min(34, windowHeight));
        const verticalSpacing = windowRows > 1 ? (windowAreaHeight - windowRows * windowHeight) / (windowRows - 1) : 0;
        const windowStartY = windowAreaTop + Math.max(0, (windowAreaHeight - (windowRows * windowHeight + verticalSpacing * (windowRows - 1))) / 2);
        const windowAreaWidth = houseWidth - 40;
        let windowCols = Math.min(4, Math.max(2, Math.floor(windowAreaWidth / 80)));
        let windowWidth = Math.min(34, (windowAreaWidth - (windowCols - 1) * 18) / windowCols);
        while (windowWidth < 18 && windowCols > 2) {
            windowCols -= 1;
            windowWidth = Math.min(34, (windowAreaWidth - (windowCols - 1) * 18) / windowCols);
        }
        windowWidth = Math.max(18, Math.min(34, windowWidth));
        const horizontalSpacing = windowCols > 1 ? (windowAreaWidth - windowCols * windowWidth) / (windowCols - 1) : 0;
        const windowStartX = houseX + Math.max(10, (houseWidth - (windowCols * windowWidth + horizontalSpacing * (windowCols - 1))) / 2);

        for (let row = 0; row < windowRows; row++) {
            for (let col = 0; col < windowCols; col++) {
                const wx = windowStartX + col * (windowWidth + horizontalSpacing);
                const wy = windowStartY + row * (windowHeight + verticalSpacing);

                this.drawHouseWindowFrame(building, wx, wy, windowWidth, windowHeight, palette);
                this.drawHouseWindowInterior(building, wx, wy, windowWidth, windowHeight, row, col);
                this.drawHouseWindowDressing(building, wx, wy, windowWidth, windowHeight, row, col, palette);

                // Glass overlay
                const glassGradient = this.ctx.createLinearGradient(wx, wy, wx, wy + windowHeight);
                glassGradient.addColorStop(0, 'rgba(220, 236, 255, 0.55)');
                glassGradient.addColorStop(0.45, 'rgba(140, 180, 210, 0.32)');
                glassGradient.addColorStop(1, 'rgba(40, 80, 120, 0.45)');
                this.ctx.fillStyle = glassGradient;
                this.ctx.fillRect(wx, wy, windowWidth, windowHeight);

                const reflection = this.ctx.createLinearGradient(wx, wy, wx + windowWidth, wy + windowHeight);
                reflection.addColorStop(0, 'rgba(255, 255, 255, 0.18)');
                reflection.addColorStop(0.5, 'rgba(255, 255, 255, 0.06)');
                reflection.addColorStop(1, 'rgba(255, 255, 255, 0.12)');
                this.ctx.fillStyle = reflection;
                this.ctx.fillRect(wx, wy, windowWidth, windowHeight);

                this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
                this.ctx.lineWidth = 1;
                this.ctx.strokeRect(wx, wy, windowWidth, windowHeight);

                this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
                this.ctx.beginPath();
                this.ctx.moveTo(wx + windowWidth / 2, wy + 1);
                this.ctx.lineTo(wx + windowWidth / 2, wy + windowHeight - 1);
                this.ctx.moveTo(wx + 1, wy + windowHeight / 2);
                this.ctx.lineTo(wx + windowWidth - 1, wy + windowHeight / 2);
                this.ctx.stroke();
            }
        }

        // Door
        const doorWidth = door.width;
        const doorHeight = door.height;
        const doorX = door.x;
        const doorY = door.y;

        const doorGradient = this.ctx.createLinearGradient(doorX, doorY, doorX, doorY + doorHeight);
        doorGradient.addColorStop(0, palette.accent);
        doorGradient.addColorStop(1, 'rgba(40, 40, 40, 0.82)');
        this.ctx.fillStyle = doorGradient;
        this.ctx.fillRect(doorX, doorY, doorWidth, doorHeight);
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(doorX, doorY, doorWidth, doorHeight);

        // Knob
        this.ctx.fillStyle = 'rgba(255, 215, 120, 0.85)';
        this.ctx.beginPath();
        this.ctx.arc(doorX + doorWidth - 10, doorY + doorHeight / 2, 3, 0, Math.PI * 2);
        this.ctx.fill();

        // Transom
        const transomHeight = Math.min(18, doorHeight * 0.25);
        this.ctx.fillStyle = 'rgba(220, 236, 255, 0.85)';
        this.ctx.fillRect(doorX + 6, doorY + 6, doorWidth - 12, transomHeight);

        // Step
        const stepHeight = Math.max(6, Math.min(12, frontDepth * 0.22));
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
        this.ctx.fillRect(doorX - 16, doorY + doorHeight, doorWidth + 32, stepHeight);
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        this.ctx.fillRect(doorX - 16, doorY + doorHeight, doorWidth + 32, 2);

        this.ctx.restore();
    }

    // --- drawMixedUseBlock ---

    drawMixedUseBlock(building) {
        const { x, y, width, height, subUnits = [] } = building;
        this.ctx.save();

        const units = subUnits.length ? subUnits : [
            { label: 'Aurora Restaurant', accent: '#f78f5c' },
            { label: 'Stadtmarkt', accent: '#7fd491' },
            { label: 'Polizeiposten', accent: '#5da1ff' }
        ];

        const groundFloorHeight = height * 0.28;
        const upperHeight = height - groundFloorHeight;

        const facadeGradient = this.ctx.createLinearGradient(x, y, x + width, y + upperHeight);
        facadeGradient.addColorStop(0, '#bfc6d1');
        facadeGradient.addColorStop(1, '#9fa7b6');
        this.ctx.fillStyle = facadeGradient;
        this.ctx.fillRect(x, y, width, upperHeight);

        this.ctx.strokeStyle = 'rgba(60, 70, 90, 0.25)';
        this.ctx.lineWidth = 1.5;
        for (let i = 0; i <= units.length; i++) {
            const colX = x + (i / units.length) * width;
            this.ctx.beginPath();
            this.ctx.moveTo(colX, y + 8);
            this.ctx.lineTo(colX, y + upperHeight - 8);
            this.ctx.stroke();
        }

        for (let row = 0; row < 4; row++) {
            const rowY = y + 12 + row * ((upperHeight - 24) / 4);
            this.ctx.beginPath();
            this.ctx.moveTo(x + 16, rowY);
            this.ctx.lineTo(x + width - 16, rowY);
            this.ctx.stroke();
        }

        // Roof garden
        const roofPadding = 14;
        this.ctx.fillStyle = '#6f9f72';
        this.ctx.fillRect(x + roofPadding, y + roofPadding, width - roofPadding * 2, upperHeight - roofPadding * 1.6);
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        for (let i = 0; i < 4; i++) {
            const planterX = x + roofPadding + 16 + i * ((width - roofPadding * 2 - 32) / 3);
            this.ctx.fillRect(planterX, y + roofPadding + 6, 12, 30);
        }

        // Ground floor
        this.ctx.fillStyle = 'rgba(40, 50, 60, 0.92)';
        this.ctx.fillRect(x, y + upperHeight, width, groundFloorHeight);

        const unitWidth = width / units.length;
        for (let i = 0; i < units.length; i++) {
            const unit = units[i];
            const unitX = x + i * unitWidth;

            const glassGradient = this.ctx.createLinearGradient(unitX, y + upperHeight, unitX, y + height);
            glassGradient.addColorStop(0, 'rgba(110, 150, 190, 0.35)');
            glassGradient.addColorStop(1, 'rgba(30, 40, 55, 0.85)');
            this.ctx.fillStyle = glassGradient;
            this.ctx.fillRect(unitX + 6, y + upperHeight + 6, unitWidth - 12, groundFloorHeight - 12);

            this.ctx.fillStyle = unit.accent;
            this.ctx.fillRect(unitX + 8, y + upperHeight + 8, unitWidth - 16, 14);
            this.ctx.fillStyle = '#1a1f26';
            this.ctx.font = 'bold 12px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(unit.label.toUpperCase(), unitX + unitWidth / 2, y + upperHeight + 18);

            if (unit.label.toLowerCase().includes('restaurant')) {
                this.ctx.fillStyle = 'rgba(247, 143, 92, 0.45)';
                this.ctx.fillRect(unitX + 10, y + height + 6, unitWidth - 20, 14);
                for (let t = 0; t < 3; t++) {
                    const tx = unitX + 18 + t * ((unitWidth - 36) / 2);
                    this.ctx.fillStyle = '#d0d6db';
                    this.ctx.fillRect(tx, y + height + 8, 8, 10);
                    this.ctx.fillStyle = 'rgba(255, 180, 80, 0.7)';
                    this.ctx.fillRect(tx - 6, y + height + 18, 20, 4);
                }
                this.ctx.fillStyle = unit.accent;
                this.ctx.beginPath();
                this.ctx.moveTo(unitX + 10, y + upperHeight + 22);
                this.ctx.lineTo(unitX + 30, y + upperHeight + 42);
                this.ctx.lineTo(unitX + 50, y + upperHeight + 22);
                this.ctx.closePath();
                this.ctx.fill();
            } else if (unit.label.toLowerCase().includes('stadtmarkt')) {
                this.ctx.fillStyle = 'rgba(200, 230, 210, 0.7)';
                this.ctx.fillRect(unitX + unitWidth / 2 - 18, y + upperHeight + 20, 36, groundFloorHeight - 26);
                this.ctx.fillStyle = 'rgba(120, 140, 150, 0.6)';
                this.ctx.fillRect(unitX + unitWidth / 2 - 2, y + upperHeight + 20, 4, groundFloorHeight - 26);
            } else if (unit.label.toLowerCase().includes('polizeiposten')) {
                this.ctx.fillStyle = 'rgba(93, 161, 255, 0.6)';
                this.ctx.fillRect(unitX + unitWidth / 2 - 20, y + upperHeight + 24, 40, groundFloorHeight - 30);
                this.ctx.fillStyle = '#ffffff';
                this.ctx.font = 'bold 10px Arial';
                this.ctx.fillText('POSTEN', unitX + unitWidth / 2, y + height - 16);
            }
        }

        this.ctx.restore();
    }

    // --- drawCasino ---

    drawCasino(building) {
        const { x, y, width, height } = building;
        this.ctx.save();

        const towerGradient = this.ctx.createLinearGradient(x, y, x + width, y + height);
        towerGradient.addColorStop(0, '#1b202c');
        towerGradient.addColorStop(0.5, '#242c3f');
        towerGradient.addColorStop(1, '#151820');
        this.ctx.fillStyle = towerGradient;
        this.ctx.fillRect(x, y, width, height);

        for (let stripe = x + 12; stripe <= x + width - 12; stripe += 18) {
            const ledGradient = this.ctx.createLinearGradient(stripe, y, stripe + 6, y + height);
            ledGradient.addColorStop(0, 'rgba(94, 176, 255, 0.85)');
            ledGradient.addColorStop(0.5, 'rgba(255, 120, 200, 0.6)');
            ledGradient.addColorStop(1, 'rgba(120, 220, 255, 0.85)');
            this.ctx.fillStyle = ledGradient;
            this.ctx.fillRect(stripe, y + 8, 6, height - 16);
        }

        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.32)';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x, y, width, height);

        // Canopy
        const canopyHeight = 36;
        this.ctx.fillStyle = '#1f2535';
        this.ctx.fillRect(x - 24, y + height - canopyHeight, width + 48, canopyHeight);
        const canopyGlow = this.ctx.createLinearGradient(x - 24, y + height - canopyHeight, x - 24, y + height);
        canopyGlow.addColorStop(0, 'rgba(255, 180, 80, 0.65)');
        canopyGlow.addColorStop(1, 'rgba(120, 60, 20, 0.0)');
        this.ctx.fillStyle = canopyGlow;
        this.ctx.fillRect(x - 24, y + height - canopyHeight, width + 48, canopyHeight);

        // Podium
        const { podiumWidth, podiumHeight, plinthHeight, podiumX, podiumY } = computeCasinoPodiumGeometry(building);

        const podiumGradient = this.ctx.createLinearGradient(podiumX, podiumY, podiumX, podiumY + podiumHeight);
        podiumGradient.addColorStop(0, 'rgba(150, 210, 255, 0.9)');
        podiumGradient.addColorStop(0.45, 'rgba(90, 150, 205, 0.88)');
        podiumGradient.addColorStop(1, 'rgba(28, 44, 72, 0.95)');
        this.ctx.fillStyle = podiumGradient;
        this.ctx.fillRect(podiumX, podiumY, podiumWidth, podiumHeight);
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.38)';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(podiumX, podiumY, podiumWidth, podiumHeight);

        const mullionCount = Math.max(4, Math.floor(podiumWidth / 90));
        if (mullionCount > 1) {
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
            this.ctx.lineWidth = 1.5;
            const mullionSpacing = podiumWidth / mullionCount;
            for (let column = 1; column < mullionCount; column++) {
                const columnX = podiumX + column * mullionSpacing;
                this.ctx.beginPath();
                this.ctx.moveTo(columnX, podiumY + 6);
                this.ctx.lineTo(columnX, podiumY + podiumHeight - 6);
                this.ctx.stroke();
            }
        }

        const podiumHighlight = this.ctx.createLinearGradient(podiumX, podiumY, podiumX, podiumY + 16);
        podiumHighlight.addColorStop(0, 'rgba(255, 255, 255, 0.48)');
        podiumHighlight.addColorStop(1, 'rgba(255, 255, 255, 0.02)');
        this.ctx.fillStyle = podiumHighlight;
        this.ctx.fillRect(podiumX, podiumY, podiumWidth, 16);

        // Plinth
        const plinthY = podiumY + podiumHeight;
        this.ctx.fillStyle = '#c9b89f';
        this.ctx.fillRect(podiumX, plinthY, podiumWidth, plinthHeight);
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        this.ctx.lineWidth = 1;
        for (let lineX = podiumX; lineX <= podiumX + podiumWidth; lineX += 36) {
            this.ctx.beginPath();
            this.ctx.moveTo(lineX, plinthY);
            this.ctx.lineTo(lineX, plinthY + plinthHeight);
            this.ctx.stroke();
        }

        // Logo
        const logoRadius = Math.min(width, height) * 0.28;
        const logoX = x + width / 2;
        const logoY = y + height * 0.2;
        this.ctx.fillStyle = 'rgba(255, 215, 120, 0.9)';
        this.ctx.beginPath();
        this.ctx.arc(logoX, logoY, logoRadius, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.fillStyle = '#1a1d28';
        this.ctx.font = 'bold 18px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('STAR', logoX, logoY - 2);
        this.ctx.fillText('LIGHT', logoX, logoY + 14);

        this.ctx.fillStyle = 'rgba(120, 180, 255, 0.6)';
        this.ctx.fillRect(x - 6, y - 6, width + 12, 6);

        this.ctx.restore();
    }

    // --- drawOfficeTower ---

    drawOfficeTower(building) {
        const { x, y, width, height } = building;
        this.ctx.save();

        const facade = this.ctx.createLinearGradient(x, y, x + width, y + height);
        facade.addColorStop(0, '#1c2738');
        facade.addColorStop(0.5, '#243750');
        facade.addColorStop(1, '#101722');
        this.ctx.fillStyle = facade;
        this.ctx.fillRect(x, y, width, height);

        const columnCount = Math.max(3, Math.floor(width / 24));
        const columnWidth = width / columnCount;
        for (let i = 0; i < columnCount; i++) {
            const colX = x + i * columnWidth;
            const shine = this.ctx.createLinearGradient(colX, y, colX + columnWidth, y);
            shine.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
            shine.addColorStop(0.5, 'rgba(255, 255, 255, 0.02)');
            shine.addColorStop(1, 'rgba(255, 255, 255, 0.16)');
            this.ctx.fillStyle = shine;
            this.ctx.fillRect(colX + columnWidth * 0.05, y + 12, columnWidth * 0.9, height - 24);
        }

        this.ctx.strokeStyle = 'rgba(180, 200, 220, 0.35)';
        this.ctx.lineWidth = 2;
        for (let bandY = y + 30; bandY < y + height - 40; bandY += 26) {
            this.ctx.beginPath();
            this.ctx.moveTo(x + 12, bandY);
            this.ctx.lineTo(x + width - 12, bandY);
            this.ctx.stroke();
        }

        this.ctx.fillStyle = '#3a475f';
        this.ctx.fillRect(x - 8, y - 14, width + 16, 14);
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        this.ctx.fillRect(x - 4, y - 10, width + 8, 6);

        const lobbyHeight = Math.min(70, height * 0.18);
        this.ctx.fillStyle = '#121922';
        this.ctx.fillRect(x - 6, y + height - lobbyHeight, width + 12, lobbyHeight);
        const glow = this.ctx.createLinearGradient(x - 6, y + height - lobbyHeight, x - 6, y + height);
        glow.addColorStop(0, 'rgba(255, 212, 120, 0.55)');
        glow.addColorStop(1, 'rgba(255, 212, 120, 0)');
        this.ctx.fillStyle = glow;
        this.ctx.fillRect(x - 6, y + height - lobbyHeight, width + 12, lobbyHeight);

        this.ctx.restore();
    }

    // --- drawResidentialTower ---

    drawResidentialTower(building) {
        const { x, y, width, height } = building;
        this.ctx.save();

        const facade = this.ctx.createLinearGradient(x, y, x + width, y + height);
        facade.addColorStop(0, '#6d7f91');
        facade.addColorStop(1, '#3b495a');
        this.ctx.fillStyle = facade;
        this.ctx.fillRect(x, y, width, height);

        const floorHeight = 34;
        for (let level = y + 28; level < y + height - 64; level += floorHeight) {
            this.ctx.fillStyle = 'rgba(240, 244, 255, 0.55)';
            this.ctx.fillRect(x + 12, level, width - 24, 18);
            this.ctx.fillStyle = '#2f3b4c';
            this.ctx.fillRect(x + 10, level + 18, width - 20, 4);
        }

        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        this.ctx.fillRect(x + width / 2 - 6, y + 16, 12, height - 32);

        this.ctx.fillStyle = '#38462f';
        this.ctx.fillRect(x - 4, y - 10, width + 8, 10);
        this.ctx.fillStyle = '#6fa16c';
        this.ctx.fillRect(x - 2, y - 8, width + 4, 6);

        const entryHeight = Math.min(60, height * 0.16);
        this.ctx.fillStyle = '#1f242f';
        this.ctx.fillRect(x + width / 2 - 28, y + height - entryHeight, 56, entryHeight);
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        this.ctx.fillRect(x + width / 2 - 22, y + height - entryHeight + 10, 44, entryHeight - 20);

        this.ctx.restore();
    }

    // --- drawWeaponShop ---

    drawWeaponShop(building) {
        const { x, y, width, height } = building;
        this.ctx.save();

        const upperHeight = height * 0.62;
        const facadeGradient = this.ctx.createLinearGradient(x, y, x, y + upperHeight);
        facadeGradient.addColorStop(0, '#3a3f4b');
        facadeGradient.addColorStop(1, '#232631');
        this.ctx.fillStyle = facadeGradient;
        this.ctx.fillRect(x, y, width, upperHeight);

        const baseHeight = height - upperHeight;
        this.ctx.fillStyle = '#151920';
        this.ctx.fillRect(x, y + upperHeight, width, baseHeight);

        // Sign
        this.ctx.fillStyle = '#b12a2a';
        this.ctx.fillRect(x + 20, y + 10, width - 40, 32);
        this.ctx.strokeStyle = '#ffe3a3';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x + 20, y + 10, width - 40, 32);
        this.ctx.fillStyle = '#ffe3a3';
        this.ctx.font = 'bold 18px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('AMMU-NATION', x + width / 2, y + 33);

        // Windows
        const windowWidth = Math.max(48, (width - 100) / 2);
        const windowHeight = Math.max(50, upperHeight - 80);
        this.ctx.fillStyle = '#8db5d8';
        this.ctx.fillRect(x + 32, y + 60, windowWidth, windowHeight);
        this.ctx.fillRect(x + width - 32 - windowWidth, y + 60, windowWidth, windowHeight);
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        this.ctx.fillRect(x + 36, y + 64, windowWidth - 8, windowHeight - 8);
        this.ctx.fillRect(x + width - 36 - windowWidth + 8, y + 64, windowWidth - 8, windowHeight - 8);

        // Door
        const doorWidth = 56;
        const doorHeight = baseHeight - 12;
        const doorX = x + width / 2 - doorWidth / 2;
        const doorY = y + upperHeight + 6;
        this.ctx.fillStyle = '#11151c';
        this.ctx.fillRect(doorX, doorY, doorWidth, doorHeight);
        this.ctx.fillStyle = '#e0c068';
        this.ctx.fillRect(doorX + doorWidth - 12, doorY + doorHeight / 2 - 3, 6, 6);

        // Crates
        this.ctx.fillStyle = '#5a4b32';
        this.ctx.fillRect(x + width - 72, y + upperHeight - 10, 44, 18);
        this.ctx.fillRect(x + width - 82, y + upperHeight - 30, 44, 18);
        this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
        this.ctx.strokeRect(x + width - 72, y + upperHeight - 10, 44, 18);
        this.ctx.strokeRect(x + width - 82, y + upperHeight - 30, 44, 18);

        this.ctx.restore();
    }

    // --- drawPoliceStation ---

    drawPoliceStation(building) {
        const { x, y, width, height } = building;
        this.ctx.save();

        const mainHeight = height * 0.62;
        const garageHeight = height - mainHeight;
        const yardPadding = 24;

        // Yard
        this.ctx.fillStyle = '#adb4bd';
        this.ctx.fillRect(x - yardPadding, y + mainHeight, width + yardPadding * 2, garageHeight + 40);
        this.ctx.strokeStyle = 'rgba(70, 80, 95, 0.7)';
        this.ctx.lineWidth = 2;
        for (let fenceX = x - yardPadding; fenceX <= x + width + yardPadding; fenceX += 18) {
            this.ctx.beginPath();
            this.ctx.moveTo(fenceX, y + mainHeight + garageHeight + 40);
            this.ctx.lineTo(fenceX, y + mainHeight + garageHeight + 20);
            this.ctx.stroke();
        }

        // Main building
        const buildingGradient = this.ctx.createLinearGradient(x, y, x + width, y + mainHeight);
        buildingGradient.addColorStop(0, '#2d4d78');
        buildingGradient.addColorStop(1, '#1f334f');
        this.ctx.fillStyle = buildingGradient;
        this.ctx.fillRect(x, y, width, mainHeight);
        this.ctx.strokeStyle = '#101a2a';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x, y, width, mainHeight);

        // Atrium
        const atriumWidth = width * 0.32;
        const atriumHeight = mainHeight * 0.42;
        const atriumX = x + width / 2 - atriumWidth / 2;
        this.ctx.fillStyle = 'rgba(120, 185, 235, 0.65)';
        this.ctx.fillRect(atriumX, y + mainHeight - atriumHeight, atriumWidth, atriumHeight);

        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        this.ctx.lineWidth = 1.5;
        for (let i = 0; i < 5; i++) {
            const levelY = y + 12 + i * ((mainHeight - 24) / 5);
            this.ctx.beginPath();
            this.ctx.moveTo(x + 12, levelY);
            this.ctx.lineTo(x + width - 12, levelY);
            this.ctx.stroke();
        }

        // Helipad
        const helipadRadius = Math.min(width, height) * 0.18;
        const helipadX = x + width * 0.78;
        const helipadY = y + mainHeight * 0.3;
        this.ctx.fillStyle = '#3d4552';
        this.ctx.beginPath();
        this.ctx.arc(helipadX, helipadY, helipadRadius, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.arc(helipadX, helipadY, helipadRadius - 6, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.font = 'bold 18px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillText('H', helipadX, helipadY + 6);

        // Garage
        const garageY = y + mainHeight;
        this.ctx.fillStyle = '#1d2d45';
        this.ctx.fillRect(x, garageY, width, garageHeight);

        const doorWidth = (width - 80) / 4;
        for (let i = 0; i < 4; i++) {
            const doorX = x + 20 + i * (doorWidth + 20);
            this.ctx.fillStyle = '#2f3d52';
            this.ctx.fillRect(doorX, garageY + 8, doorWidth, garageHeight - 16);
            this.ctx.fillStyle = 'rgba(180, 200, 220, 0.25)';
            for (let slat = 0; slat < 4; slat++) {
                const slatY = garageY + 12 + slat * ((garageHeight - 28) / 4);
                this.ctx.fillRect(doorX + 4, slatY, doorWidth - 8, 4);
            }
        }

        this.ctx.fillStyle = 'rgba(80, 160, 255, 0.9)';
        this.ctx.fillRect(x + 20, garageY + 4, width - 40, 6);

        // POLIZEI sign
        this.ctx.fillStyle = '#214c83';
        this.ctx.fillRect(atriumX + 20, garageY - 18, atriumWidth - 40, 18);
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 14px Arial';
        this.ctx.fillText('POLIZEI', atriumX + atriumWidth / 2, garageY - 5);

        // Flag pole
        this.ctx.strokeStyle = '#cdd3d8';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(x + width / 2 - 140, garageY + garageHeight + 40);
        this.ctx.lineTo(x + width / 2 - 140, garageY - 10);
        this.ctx.stroke();
        this.ctx.fillStyle = '#005eb8';
        this.ctx.fillRect(x + width / 2 - 140, garageY - 10, 16, 10);
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(x + width / 2 - 124, garageY - 10, 16, 10);

        // Cameras
        const cameraPositions = [
            { cx: x + 12, cy: y + 12 }, { cx: x + width - 12, cy: y + 12 },
            { cx: x + 12, cy: y + mainHeight - 12 }, { cx: x + width - 12, cy: y + mainHeight - 12 }
        ];
        for (const cam of cameraPositions) {
            this.ctx.fillStyle = '#2c3642';
            this.ctx.beginPath();
            this.ctx.arc(cam.cx, cam.cy, 5, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.fillStyle = 'rgba(120, 200, 255, 0.5)';
            this.ctx.beginPath();
            this.ctx.arc(cam.cx + 2, cam.cy, 2, 0, Math.PI * 2);
            this.ctx.fill();
        }

        this.ctx.restore();
    }

    // --- drawShop ---

    drawShop(building) {
        const { x, y, width, height } = building;
        this.ctx.save();
        this.ctx.fillStyle = '#a9a9a9';
        this.ctx.fillRect(x, y, width, height);
        this.ctx.fillStyle = '#808080';
        for (let i = 0; i < height; i += 15) {
            this.ctx.fillRect(x, y + i, width, 2);
        }
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(x, y, width, height);
        this.ctx.restore();
    }

    // --- drawRestaurant ---

    drawRestaurant(building) {
        const { x, y, width, height } = building;
        this.ctx.save();

        this.ctx.fillStyle = '#DEB887';
        this.ctx.fillRect(x, y, width, height);
        this.ctx.fillStyle = '#D2B48C';
        for (let i = 0; i < width; i += 10) {
            this.ctx.fillRect(x + i, y, 2, height);
        }
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(x, y, width, height);

        this.ctx.fillStyle = '#87CEEB';
        this.ctx.fillRect(x + 15, y + 15, 25, 20);
        this.ctx.fillRect(x + 60, y + 15, 25, 20);
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(x + 15, y + 15, 25, 20);
        this.ctx.strokeRect(x + 60, y + 15, 25, 20);

        this.ctx.fillStyle = '#8B4513';
        this.ctx.fillRect(x + 40, y + height - 20, 20, 15);
        this.ctx.fillStyle = '#FFD700';
        this.ctx.beginPath();
        this.ctx.arc(x + 55, y + height - 12, 2, 0, 2 * Math.PI);
        this.ctx.fill();

        this.ctx.fillStyle = '#FFD700';
        this.ctx.fillRect(x - 5, y - 15, width + 10, 10);
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x - 5, y - 15, width + 10, 10);
        this.ctx.fillStyle = '#000';
        this.ctx.font = 'bold 10px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('RESTAURANT', x + width / 2, y - 6);

        this.ctx.restore();
    }

    // --- drawMotel ---

    drawMotel(building) {
        const { x, y, width, height } = building;
        this.ctx.save();

        // Hauptgebaeude
        const facade = this.ctx.createLinearGradient(x, y, x, y + height);
        facade.addColorStop(0, '#8b6f52');
        facade.addColorStop(1, '#6b5240');
        this.ctx.fillStyle = facade;
        this.ctx.fillRect(x, y, width, height);

        // Dach
        this.ctx.fillStyle = '#4a3728';
        this.ctx.fillRect(x - 6, y - 12, width + 12, 16);

        // Tueren und Fenster (Zimmerreihe)
        const roomWidth = 52;
        const roomSpacing = 8;
        const roomCount = Math.floor((width - 20) / (roomWidth + roomSpacing));
        const startX = x + (width - roomCount * (roomWidth + roomSpacing) + roomSpacing) / 2;
        const doorY = y + height - 60;

        for (let i = 0; i < roomCount; i++) {
            const rx = startX + i * (roomWidth + roomSpacing);

            // Fenster
            this.ctx.fillStyle = 'rgba(160, 200, 230, 0.6)';
            this.ctx.fillRect(rx + 4, y + 20, roomWidth - 8, 30);
            this.ctx.strokeStyle = '#5a4535';
            this.ctx.lineWidth = 1.5;
            this.ctx.strokeRect(rx + 4, y + 20, roomWidth - 8, 30);

            // Kreuzstreben
            this.ctx.beginPath();
            this.ctx.moveTo(rx + roomWidth / 2, y + 20);
            this.ctx.lineTo(rx + roomWidth / 2, y + 50);
            this.ctx.moveTo(rx + 4, y + 35);
            this.ctx.lineTo(rx + roomWidth - 4, y + 35);
            this.ctx.stroke();

            // Tuer
            this.ctx.fillStyle = '#3d2e22';
            this.ctx.fillRect(rx + 12, doorY, 28, 48);
            this.ctx.fillStyle = '#c9a84c';
            this.ctx.beginPath();
            this.ctx.arc(rx + 36, doorY + 26, 3, 0, Math.PI * 2);
            this.ctx.fill();

            // Zimmernummer
            this.ctx.fillStyle = '#ddd';
            this.ctx.font = '10px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(String(i + 1), rx + roomWidth / 2, doorY - 4);
        }

        // Neon-Schild
        this.ctx.fillStyle = '#1a0f08';
        this.ctx.fillRect(x + width / 2 - 72, y + height + 4, 144, 28);
        this.ctx.fillStyle = '#ff6b4a';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText((building.name ?? 'MOTEL').toUpperCase(), x + width / 2, y + height + 23);
        this.ctx.strokeStyle = '#ff8866';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(x + width / 2 - 72, y + height + 4, 144, 28);

        // Parkplatz-Markierungen
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        this.ctx.lineWidth = 1;
        for (let i = 0; i < roomCount; i++) {
            const px = startX + i * (roomWidth + roomSpacing);
            this.ctx.strokeRect(px, y + height + 36, roomWidth, 30);
        }

        this.ctx.restore();
    }

    // --- drawApartmentComplex ---

    drawApartmentComplex(building) {
        const { x, y, width, height } = building;
        this.ctx.save();

        // Hauptgebaeude
        const facade = this.ctx.createLinearGradient(x, y, x + width, y + height);
        facade.addColorStop(0, '#7a8999');
        facade.addColorStop(0.5, '#5c6b7a');
        facade.addColorStop(1, '#4a5768');
        this.ctx.fillStyle = facade;
        this.ctx.fillRect(x, y, width, height);

        // Stockwerk-Linien und Fenster
        const floorHeight = 38;
        const floorCount = Math.floor((height - 60) / floorHeight);
        const windowWidth = 24;
        const windowHeight = 20;
        const windowSpacing = 12;
        const windowsPerFloor = Math.floor((width - 40) / (windowWidth + windowSpacing));
        const windowStartX = x + (width - windowsPerFloor * (windowWidth + windowSpacing) + windowSpacing) / 2;

        for (let floor = 0; floor < floorCount; floor++) {
            const floorY = y + 24 + floor * floorHeight;

            // Stockwerk-Trennlinie
            this.ctx.fillStyle = '#3d4a58';
            this.ctx.fillRect(x + 8, floorY + floorHeight - 4, width - 16, 4);

            for (let w = 0; w < windowsPerFloor; w++) {
                const wx = windowStartX + w * (windowWidth + windowSpacing);
                const wy = floorY + 6;

                // Fenster
                this.ctx.fillStyle = 'rgba(200, 220, 240, 0.55)';
                this.ctx.fillRect(wx, wy, windowWidth, windowHeight);

                // Balkon (jedes zweite Fenster)
                if ((floor + w) % 3 === 0) {
                    this.ctx.fillStyle = 'rgba(100, 110, 125, 0.8)';
                    this.ctx.fillRect(wx - 3, wy + windowHeight, windowWidth + 6, 6);
                    this.ctx.strokeStyle = 'rgba(180, 190, 200, 0.5)';
                    this.ctx.lineWidth = 1;
                    this.ctx.strokeRect(wx - 3, wy + windowHeight, windowWidth + 6, 6);
                }

                // Fensterrahmen
                this.ctx.strokeStyle = '#3a4555';
                this.ctx.lineWidth = 1;
                this.ctx.strokeRect(wx, wy, windowWidth, windowHeight);
            }
        }

        // Dach
        this.ctx.fillStyle = '#3a4555';
        this.ctx.fillRect(x - 4, y - 10, width + 8, 14);
        // Dachaufbauten
        this.ctx.fillStyle = '#4a5565';
        this.ctx.fillRect(x + 20, y - 24, 30, 14);
        this.ctx.fillRect(x + width - 50, y - 24, 30, 14);

        // Eingangsbereich
        const entryWidth = 60;
        const entryHeight = Math.min(50, height * 0.14);
        const entryX = x + width / 2 - entryWidth / 2;
        const entryY = y + height - entryHeight;

        this.ctx.fillStyle = '#1e2832';
        this.ctx.fillRect(entryX, entryY, entryWidth, entryHeight);

        // Glastuer
        this.ctx.fillStyle = 'rgba(180, 210, 240, 0.4)';
        this.ctx.fillRect(entryX + 8, entryY + 6, entryWidth - 16, entryHeight - 10);
        this.ctx.strokeStyle = '#8a9aab';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(entryX + 8, entryY + 6, entryWidth - 16, entryHeight - 10);

        // Schild
        this.ctx.fillStyle = '#2a3545';
        this.ctx.fillRect(x + width / 2 - 80, entryY - 22, 160, 20);
        this.ctx.fillStyle = '#c0d0e0';
        this.ctx.font = 'bold 13px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText((building.name ?? 'APARTMENTS').toUpperCase(), x + width / 2, entryY - 7);

        // Seitliche Saeulen
        this.ctx.fillStyle = '#4a5565';
        this.ctx.fillRect(x - 2, y, 8, height);
        this.ctx.fillRect(x + width - 6, y, 8, height);

        this.ctx.restore();
    }

    // --- Interaction Points ---

    // --- drawRealEstateAgent ---

    drawRealEstateAgent(building) {
        const { x, y, width, height } = building;
        this.ctx.save();

        // Hauptgebaeude - elegantes Buero
        const facade = this.ctx.createLinearGradient(x, y, x, y + height);
        facade.addColorStop(0, '#e8e0d4');
        facade.addColorStop(1, '#c9bfb0');
        this.ctx.fillStyle = facade;
        this.ctx.fillRect(x, y, width, height);

        // Dach
        this.ctx.fillStyle = '#6b4e3d';
        this.ctx.fillRect(x - 4, y - 8, width + 8, 12);

        // Grosses Schaufenster
        this.ctx.fillStyle = 'rgba(140, 180, 220, 0.7)';
        this.ctx.fillRect(x + 20, y + 20, width - 40, height * 0.4);
        this.ctx.strokeStyle = '#5a4535';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x + 20, y + 20, width - 40, height * 0.4);

        // "Haus"-Symbol im Fenster
        const cx = x + width / 2;
        const wy = y + 20 + (height * 0.4) / 2;
        this.ctx.fillStyle = '#3a6b4e';
        this.ctx.beginPath();
        this.ctx.moveTo(cx - 20, wy + 5);
        this.ctx.lineTo(cx, wy - 15);
        this.ctx.lineTo(cx + 20, wy + 5);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.fillRect(cx - 14, wy + 5, 28, 18);

        // Tuer
        this.ctx.fillStyle = '#3d2e22';
        this.ctx.fillRect(x + width / 2 - 16, y + height - 50, 32, 50);
        this.ctx.fillStyle = '#c9a84c';
        this.ctx.beginPath();
        this.ctx.arc(x + width / 2 + 10, y + height - 24, 3, 0, Math.PI * 2);
        this.ctx.fill();

        // Schild
        this.ctx.fillStyle = '#2c5f3e';
        this.ctx.fillRect(x + width / 2 - 80, y + height + 4, 160, 24);
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('IMMOBILIEN SCHMIDT', x + width / 2, y + height + 20);

        this.ctx.restore();
    }

    // --- drawBungalow ---

    drawBungalow(building) {
        const { x, y, width, height } = building;
        this.ctx.save();

        // Grundstueck / Rasen
        this.ctx.fillStyle = '#5a8f4a';
        this.ctx.fillRect(x - 10, y - 10, width + 20, height + 20);

        // Hauptgebaeude
        const facade = this.ctx.createLinearGradient(x, y, x, y + height);
        facade.addColorStop(0, '#f5e6d3');
        facade.addColorStop(1, '#e0cdb8');
        this.ctx.fillStyle = facade;
        this.ctx.fillRect(x + 20, y + 30, width - 40, height - 50);

        // Dach (flaches Satteldach)
        this.ctx.fillStyle = '#8b4513';
        this.ctx.beginPath();
        this.ctx.moveTo(x + 10, y + 34);
        this.ctx.lineTo(x + width / 2, y);
        this.ctx.lineTo(x + width - 10, y + 34);
        this.ctx.closePath();
        this.ctx.fill();

        // Drei Fenster (drei Raeume)
        const roomWidth = (width - 80) / 3;
        for (let i = 0; i < 3; i++) {
            const wx = x + 30 + i * (roomWidth + 5);
            this.ctx.fillStyle = 'rgba(160, 200, 230, 0.6)';
            this.ctx.fillRect(wx, y + 50, roomWidth - 10, 35);
            this.ctx.strokeStyle = '#8b7355';
            this.ctx.lineWidth = 1.5;
            this.ctx.strokeRect(wx, y + 50, roomWidth - 10, 35);

            // Kreuzstreben
            this.ctx.beginPath();
            this.ctx.moveTo(wx + (roomWidth - 10) / 2, y + 50);
            this.ctx.lineTo(wx + (roomWidth - 10) / 2, y + 85);
            this.ctx.stroke();
        }

        // Eingangstuer (Mitte)
        this.ctx.fillStyle = '#5a3a1a';
        this.ctx.fillRect(x + width / 2 - 14, y + height - 44, 28, 44);
        this.ctx.fillStyle = '#c9a84c';
        this.ctx.beginPath();
        this.ctx.arc(x + width / 2 + 8, y + height - 22, 3, 0, Math.PI * 2);
        this.ctx.fill();

        // Vorgarten-Weg
        this.ctx.fillStyle = '#c4b89a';
        this.ctx.fillRect(x + width / 2 - 10, y + height - 20, 20, 30);

        // Schild
        this.ctx.fillStyle = 'rgba(0,0,0,0.7)';
        this.ctx.fillRect(x + width / 2 - 60, y + height + 14, 120, 20);
        this.ctx.fillStyle = '#fff';
        this.ctx.font = 'bold 11px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(building.name ?? 'BUNGALOW', x + width / 2, y + height + 28);

        this.ctx.restore();
    }

    drawInteractionPoints(buildings) {
        this.ctx.fillStyle = '#4CAF50';
        for (const building of buildings) {
            if (!building.interactive) continue;
            const markerX = building.x + building.width / 2;
            const markerY = building.y + building.height + 20;
            this.ctx.beginPath();
            this.ctx.arc(markerX, markerY, 8, 0, 2 * Math.PI);
            this.ctx.fill();
        }
    }
}



// ═══════════════════════════════════════════════════════
// js/rendering/EntityRenderer.js
// ═══════════════════════════════════════════════════════
/**
 * EntityRenderer — Zeichnet Spieler, NPCs und Fahrzeuge.
 * Portiert aus overworld.js Zeilen 7802-8085, 11068-11104, 1746-1852.
 */

class EntityRenderer {
    /**
     * @param {import('./Renderer.js').Renderer} renderer
     */
    constructor(renderer) {
        this.renderer = renderer;
        this.ctx = renderer.getContext();
    }

    // --- Public API ---

    drawNPCs(npcs) {
        if (!npcs) return;
        for (const npc of npcs) {
            this.drawNPC(npc);
        }
    }

    drawVehicles(vehicles) {
        if (!vehicles) return;
        for (const vehicle of vehicles) {
            this.drawVehicleParts(vehicle);
        }
    }

    drawPlayer(player, weapon, mouse, nearBuilding) {
        const playerRenderable = {
            x: player.x + player.width / 2,
            y: player.y + player.height / 2,
            parts: player.parts,
            animationPhase: player.animationPhase ?? 0,
            moving: player.moving
        };

        this.drawCharacterParts(playerRenderable);
        this.drawEquippedWeaponModel(playerRenderable, weapon, mouse);

        if (nearBuilding) {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            this.ctx.fillRect(player.x - 5, player.y - 36, 40, 26);
            this.ctx.fillStyle = '#FFF';
            this.ctx.font = 'bold 16px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('E', player.x + 15, player.y - 18);
        }
    }

    // --- Character Parts ---

    drawCharacterParts(character) {
        if (!character || !character.parts) return;

        const phase = character.animationPhase ?? 0;
        const swing = Math.sin(phase);
        const bob = character.moving ? Math.abs(Math.cos(phase)) * 1.2 : 0;
        const centerX = character.x;
        const centerY = character.y;

        // Shadow pass
        for (const part of character.parts) {
            if (part.id !== 'shadow' || part.damaged) continue;
            this.ctx.save();
            this.ctx.fillStyle = part.color;
            if (part.type === 'circle') {
                this.ctx.beginPath();
                this.ctx.arc(centerX + part.offsetX, centerY + part.offsetY, part.radius, 0, Math.PI * 2);
                this.ctx.fill();
            } else if (part.type === 'rect') {
                this.ctx.fillRect(centerX + part.offsetX, centerY + part.offsetY, part.width, part.height);
            }
            this.ctx.restore();
        }

        // Body pass with animation
        this.ctx.save();
        this.ctx.translate(centerX, centerY - bob);

        for (const part of character.parts) {
            if (part.damaged || part.id === 'shadow') continue;

            let offsetX = part.offsetX;
            let offsetY = part.offsetY;

            if (part.id === 'leftLeg') offsetY += swing * 2.4;
            else if (part.id === 'rightLeg') offsetY -= swing * 2.4;
            else if (part.id === 'leftArm') offsetY -= swing * 1.9;
            else if (part.id === 'rightArm') offsetY += swing * 1.9;

            this.ctx.fillStyle = part.color;
            if (part.type === 'rect') {
                this.ctx.fillRect(offsetX, offsetY, part.width, part.height);
            } else if (part.type === 'circle') {
                this.ctx.beginPath();
                this.ctx.arc(offsetX, offsetY, part.radius, 0, Math.PI * 2);
                this.ctx.fill();
            }
        }

        this.ctx.restore();
    }

    // --- NPC ---

    drawNPC(npc) {
        if (!npc || npc.hidden) return;
        this.drawCharacterParts(npc);
    }

    // --- Polizei ---

    /**
     * Zeichnet alle Polizisten mit Waffen.
     * @param {Array<object>} officers
     * @param {object} player - Spieler-Position fuer Waffenrichtung
     * @param {Map<string, object>} weaponCatalog
     */
    drawPoliceOfficers(officers, player, weaponCatalog) {
        if (!officers) return;
        for (const cop of officers) {
            if (!cop || cop.hidden) continue;
            this.drawPoliceOfficer(cop, player, weaponCatalog);
        }
    }

    /**
     * Zeichnet einen einzelnen Polizisten.
     * @param {object} cop
     * @param {object} player
     * @param {Map<string, object>} weaponCatalog
     */
    drawPoliceOfficer(cop, player, weaponCatalog) {
        if (cop.dead) {
            // Toten Polizisten mit Rotation zeichnen
            this.ctx.save();
            this.ctx.translate(cop.x, cop.y);
            this.ctx.rotate(cop.deathRotation ?? 0);
            this.ctx.globalAlpha = 0.6;
            const deadRenderable = { x: 0, y: 0, parts: cop.parts, animationPhase: 0, moving: false };
            this.drawCharacterParts(deadRenderable);
            this.ctx.restore();
            return;
        }

        const renderable = {
            x: cop.x,
            y: cop.y,
            parts: cop.parts,
            animationPhase: cop.animationPhase ?? 0,
            moving: cop.moving,
        };

        this.drawCharacterParts(renderable);

        // SWAT Helm-Visier zeichnen
        if (cop.type === 'swat') {
            const bob = cop.moving ? Math.abs(Math.cos(cop.animationPhase ?? 0)) * 1.2 : 0;
            this.ctx.save();
            this.ctx.fillStyle = 'rgba(50, 50, 70, 0.7)';
            this.ctx.fillRect(cop.x - 5, cop.y - 20 - bob, 10, 4);
            this.ctx.restore();
        }

        // Waffe zeichnen (zeigt zum Spieler)
        const weapon = weaponCatalog?.get?.(cop.weaponId) ?? null;
        if (weapon) {
            const fakeMouse = {
                worldX: player.x + player.width / 2,
                worldY: player.y + player.height / 2,
            };
            this.drawEquippedWeaponModel(renderable, weapon, fakeMouse);
        }
    }

    // --- Vehicle ---

    drawVehicleParts(vehicle) {
        if (!vehicle || !vehicle.parts) return;

        const rotation = vehicle.rotation ?? 0;
        this.ctx.save();
        this.ctx.translate(vehicle.x, vehicle.y);
        this.ctx.rotate(rotation);

        // Shadow
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
        this.ctx.beginPath();
        this.ctx.ellipse(0, 0, vehicle.width / 2 + 6, vehicle.height / 2 + 4, 0, 0, Math.PI * 2);
        this.ctx.fill();

        for (const part of vehicle.parts) {
            if (part.damaged || part.visible === false) continue;
            this.ctx.fillStyle = part.color;
            if (part.type === 'rect') {
                this.ctx.fillRect(part.offsetX, part.offsetY, part.width, part.height);
            } else if (part.type === 'circle') {
                this.ctx.beginPath();
                this.ctx.arc(part.offsetX, part.offsetY, part.radius, 0, Math.PI * 2);
                this.ctx.fill();
            }
        }

        this.ctx.restore();
    }

    // --- Equipped Weapon on Character ---

    drawEquippedWeaponModel(renderable, weapon, mouse) {
        if (!weapon) return;

        const animationPhase = renderable?.animationPhase ?? 0;
        const moving = Boolean(renderable?.moving);
        const bob = moving ? Math.abs(Math.cos(animationPhase)) * 1.2 : 0;

        const originX = renderable?.x ?? 0;
        const originY = (renderable?.y ?? 0) - bob - 4;

        let aimX = (mouse?.worldX ?? originX) - (renderable?.x ?? 0);
        let aimY = (mouse?.worldY ?? originY) - (renderable?.y ?? 0);
        if (!Number.isFinite(aimX) || !Number.isFinite(aimY)) { aimX = 1; aimY = 0; }

        let angle = Math.atan2(aimY, aimX);
        if (!Number.isFinite(angle)) angle = 0;

        const baseColor = '#1d1f24';
        const accentColor = weapon.displayColor ?? '#ffd166';

        this.ctx.save();
        this.ctx.translate(originX, originY);
        this.ctx.rotate(angle);

        if (weapon.id === 'assaultRifle') {
            const thickness = 8, bodyLength = 48, barrelLength = 14;
            this.ctx.fillStyle = baseColor;
            this.ctx.fillRect(-18, -thickness / 2, bodyLength, thickness);
            this.ctx.fillRect(bodyLength - 18, -thickness * 0.35, barrelLength, thickness * 0.7);
            this.ctx.fillRect(-30, -thickness * 0.45, 12, thickness * 0.9);
            this.ctx.fillRect(-30, -thickness * 0.2, 12, thickness * 0.6);
            this.ctx.fillStyle = accentColor;
            this.ctx.fillRect(6, thickness * 0.2, 6, thickness);
        } else if (weapon.id === 'shotgun') {
            const thickness = 9, bodyLength = 44, barrelLength = 18;
            this.ctx.fillStyle = baseColor;
            this.ctx.fillRect(-22, -thickness / 2, bodyLength, thickness);
            this.ctx.fillRect(bodyLength - 22, -thickness * 0.3, barrelLength, thickness * 0.6);
            this.ctx.fillRect(-32, -thickness * 0.2, 12, thickness * 0.4);
            this.ctx.fillStyle = accentColor;
            this.ctx.fillRect(-8, -thickness * 0.4, 14, thickness * 0.8);
        } else {
            const thickness = 6, bodyLength = 26, barrelLength = 10;
            this.ctx.fillStyle = baseColor;
            this.ctx.fillRect(-8, -thickness / 2, bodyLength, thickness);
            this.ctx.fillRect(bodyLength - 8, -thickness * 0.3, barrelLength, thickness * 0.6);
            this.ctx.fillStyle = accentColor;
            this.ctx.fillRect(-6, -thickness / 2, 4, thickness);
        }

        this.ctx.restore();
    }

    // --- Weapon Silhouette (for weapon shop interior) ---

    drawWeaponSilhouette(cx, cy, weapon, options = {}) {
        if (!weapon) return;

        const scale = typeof options.scale === 'number' ? options.scale : 1;
        const alpha = typeof options.alpha === 'number' ? options.alpha : 1;
        const color = weapon.displayColor ?? '#ffd166';
        const outline = 'rgba(0, 0, 0, 0.34)';
        const dark = 'rgba(12, 18, 26, 0.75)';
        const accent = 'rgba(255, 255, 255, 0.28)';

        this.ctx.save();
        this.ctx.translate(cx, cy);
        this.ctx.scale(scale, scale);
        this.ctx.globalAlpha = Math.max(0.2, Math.min(1, alpha));

        const fillRect = (x, y, w, h, style = color, stroke = true) => {
            this.ctx.fillStyle = style;
            this.ctx.fillRect(x, y, w, h);
            if (stroke) {
                this.ctx.strokeStyle = outline;
                this.ctx.lineWidth = 1.6;
                this.ctx.strokeRect(x, y, w, h);
            }
        };

        const drawCircle = (x, y, r, style = color, stroke = true) => {
            this.ctx.beginPath();
            this.ctx.arc(x, y, r, 0, Math.PI * 2);
            this.ctx.fillStyle = style;
            this.ctx.fill();
            if (stroke) {
                this.ctx.strokeStyle = outline;
                this.ctx.lineWidth = 1.4;
                this.ctx.stroke();
            }
        };

        const drawGrip = (x, y, w, h) => {
            fillRect(x, y, w, h, dark);
            fillRect(x + w * 0.15, y + h * 0.2, w * 0.7, h * 0.6, accent, false);
        };

        switch (weapon.id) {
            case 'pistol':
                fillRect(-30, -6, 46, 12);
                fillRect(-16, -11, 22, 5, accent);
                drawGrip(-10, 6, 18, 26);
                fillRect(-26, -2, 8, 4, dark);
                break;
            case 'smg':
                fillRect(-48, -8, 64, 16);
                fillRect(14, -4, 28, 8, dark);
                fillRect(-14, 8, 12, 22, color);
                fillRect(0, 10, 10, 24, dark);
                fillRect(-42, -4, 12, 12, accent);
                drawGrip(-22, 8, 12, 20);
                break;
            case 'assaultRifle':
                fillRect(-62, -8, 102, 16);
                fillRect(38, -4, 36, 8, dark);
                fillRect(-64, -3, 12, 12, dark);
                fillRect(-34, 8, 18, 24, dark);
                fillRect(-8, 10, 12, 28, color);
                fillRect(10, -12, 24, 8, accent);
                break;
            case 'shotgun':
                fillRect(-78, -5, 116, 10);
                fillRect(-72, 2, 102, 6, dark);
                fillRect(-32, 4, 30, 14, accent);
                drawGrip(-14, 12, 18, 22);
                fillRect(-84, -2, 14, 12, dark);
                break;
            case 'sniperRifle':
                fillRect(-94, -6, 148, 12);
                fillRect(52, -4, 38, 8, dark);
                fillRect(-60, -2, 22, 6, dark);
                fillRect(-32, -16, 44, 8, accent);
                drawCircle(-8, -18, 6, dark);
                drawGrip(-20, 10, 16, 26);
                break;
            case 'lmg':
                fillRect(-82, -10, 132, 20);
                fillRect(42, -6, 38, 10, dark);
                fillRect(-52, 8, 28, 20, dark);
                fillRect(-18, 10, 22, 30, color);
                fillRect(-74, -12, 22, 8, accent);
                drawCircle(-48, -16, 6, accent, false);
                fillRect(-56, 0, 18, 6, dark);
                break;
            default:
                fillRect(-30, -5, 60, 10);
                drawGrip(-10, 6, 18, 24);
                break;
        }

        this.ctx.globalAlpha = 1;
        this.ctx.restore();
    }
}



// ═══════════════════════════════════════════════════════
// js/rendering/EffectsRenderer.js
// ═══════════════════════════════════════════════════════
/**
 * EffectsRenderer — Zeichnet Projektile und Blut-Decals.
 * Portiert aus overworld.js Zeilen 3104-3244.
 */

class EffectsRenderer {
    /**
     * @param {import('./Renderer.js').Renderer} renderer
     */
    constructor(renderer) {
        this.renderer = renderer;
        this.ctx = renderer.getContext();
    }

    /**
     * Zeichnet alle Projektile.
     * @param {Array} projectiles
     * @param {string} scene - Aktuelle Szene ('overworld' oder 'weaponShop')
     * @param {object} [activeInterior] - Interior-Daten (originX, originY) für weaponShop
     */
    drawProjectiles(projectiles, scene = 'overworld', activeInterior = null) {
        if (!projectiles || !projectiles.length) return;

        this.ctx.save();

        if (scene === 'weaponShop') {
            if (!activeInterior) {
                this.ctx.restore();
                return;
            }
            this.ctx.translate(activeInterior.originX, activeInterior.originY);
            for (const projectile of projectiles) {
                if (projectile.scene !== 'weaponShop') continue;
                this.drawProjectileSprite(projectile);
            }
        } else {
            for (const projectile of projectiles) {
                if (projectile.scene === 'weaponShop') continue;
                this.drawProjectileSprite(projectile);
            }
        }

        this.ctx.restore();
    }

    /**
     * Zeichnet ein einzelnes Projektil.
     */
    drawProjectileSprite(projectile) {
        this.ctx.save();
        this.ctx.fillStyle = projectile.color;
        this.ctx.globalAlpha = 0.9;

        this.ctx.beginPath();
        this.ctx.arc(projectile.x, projectile.y, 3.5, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.globalAlpha = 0.35;
        this.ctx.beginPath();
        this.ctx.arc(projectile.x, projectile.y, 6, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.restore();
    }

    /**
     * Zeichnet alle Blut-Decals.
     * @param {Array} bloodDecals
     */
    drawBloodDecals(bloodDecals) {
        if (!bloodDecals || !bloodDecals.length) return;

        this.ctx.save();

        for (const decal of bloodDecals) {
            const gradient = this.ctx.createRadialGradient(
                decal.x, decal.y, 4,
                decal.x, decal.y, decal.radius * 1.4
            );
            gradient.addColorStop(0, 'rgba(200, 24, 34, 0.55)');
            gradient.addColorStop(1, 'rgba(110, 0, 0, 0.05)');

            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            this.ctx.ellipse(decal.x, decal.y, decal.radius * 1.3, decal.radius, 0, 0, Math.PI * 2);
            this.ctx.fill();
        }

        this.ctx.restore();
    }
}



// ═══════════════════════════════════════════════════════
// js/rendering/UIRenderer.js
// ═══════════════════════════════════════════════════════
/**
 * UIRenderer - Zeichnet HUD, Crosshair, Tag/Nacht-Overlay und Sterne.
 */

class UIRenderer {

    /**
     * @param {import('./Renderer.js').Renderer} renderer
     * @param {{playerPosEl?: HTMLElement|null, fpsEl?: HTMLElement|null}} domElements
     */
    constructor(renderer, domElements = {}) {
        this.renderer = renderer;
        this.ctx = renderer.ctx;
        this.playerPosEl = domElements.playerPosEl ?? null;
        this.fpsEl = domElements.fpsEl ?? null;

        // Offscreen-Canvas fuer Nacht-Overlay mit Taschenlampen-Ausschnitten
        this._darkCanvas = document.createElement('canvas');
        this._darkCtx = this._darkCanvas.getContext('2d');
    }

    // ── Formatierungs-Hilfsfunktionen ───────────────────────────────────

    /**
     * Formatiert einen Geldbetrag als "G$ 1.234".
     * @param {number} amount
     * @returns {string}
     */
    static formatMoney(amount) {
        const numeric = Number(amount);
        const safeValue = Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
        return "G$ " + safeValue.toLocaleString("de-DE");
    }

    /**
     * Formatiert Credits als "1.234".
     * @param {number} amount
     * @returns {string}
     */
    static formatCredits(amount) {
        const numeric = Number(amount);
        const safeValue = Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
        return safeValue.toLocaleString("de-DE");
    }

    // ── HUD ─────────────────────────────────────────────────────────────

    /**
     * Zeichnet das Heads-Up-Display.
     * @param {object} player - Spielerobjekt mit x, y
     * @param {number} fps
     * @param {object} weaponCatalog - Waffenkatalog-Map (id -> Definition)
     * @param {Set} weaponInventory - Besessene Waffen-IDs
     * @param {Array<string>} weaponLoadout - Schnellzugriff-Slots
     * @param {Array<string>} weaponOrder - Reihenfolge aller Waffen
     * @param {number} playerMoney
     * @param {number} casinoCredits
     * @param {number} casinoCreditRate
     */
    drawHUD(player, fps, weaponCatalog, weaponInventory, weaponLoadout, weaponOrder, playerMoney, casinoCredits, casinoCreditRate, ownedPropertyCount) {
        if (this.playerPosEl) {
            this.playerPosEl.textContent = Math.round(player.x) + ", " + Math.round(player.y);
        }

        const weapon = this._getCurrentWeaponFromCatalog(player, weaponCatalog);
        const hudWidth = 520;
        const hudHeight = 290;
        const baseX = 10;
        const baseY = 60;
        let textY = baseY + 36;

        this.ctx.fillStyle = "rgba(12, 16, 24, 0.78)";
        this.ctx.fillRect(baseX, baseY, hudWidth, hudHeight);

        this.ctx.fillStyle = "#ffffff";
        this.ctx.font = "20px Arial";
        this.ctx.textAlign = "left";
        this.ctx.fillText("Kontostand: " + UIRenderer.formatMoney(playerMoney), baseX + 14, textY);
        textY += 30;
        this.ctx.fillText("Casino Credits: " + UIRenderer.formatCredits(casinoCredits) + " Credits", baseX + 14, textY);
        textY += 30;

        // Immobilien-Anzeige
        const propCount = ownedPropertyCount ?? 0;
        this.ctx.fillStyle = propCount > 0 ? '#4CAF50' : '#888';
        this.ctx.fillText("Immobilien: " + propCount, baseX + 14, textY);
        this.ctx.fillStyle = "#ffffff";
        textY += 30;
        this.ctx.fillText("Aktive Waffe: " + (weapon ? weapon.name : "Keine"), baseX + 14, textY);
        textY += 30;

        if (weapon) {
            const fireSeconds = (Number(weapon.fireRate ?? 0) / 1000).toFixed(1);
            this.ctx.fillText("Schaden: " + weapon.damage + " | Feuerrate: " + fireSeconds + " s", baseX + 14, textY);
        } else {
            this.ctx.fillText("Schaden: - | Feuerrate: -", baseX + 14, textY);
        }

        textY += 32;

        this.ctx.fillStyle = "#8ce0ff";
        this.ctx.font = "18px Arial";

        const quickSlots = Array.isArray(weaponLoadout) ? weaponLoadout : [];
        const slotLabels = [];

        for (let i = 0; i < quickSlots.length; i++) {
            const slotId = quickSlots[i];
            const def = weaponCatalog?.get?.(slotId) ?? weaponCatalog?.[slotId] ?? null;
            const label = def?.shortLabel ?? def?.name ?? slotId;
            slotLabels.push((i + 1) + ": " + label);
        }

        const quickText = slotLabels.length
            ? "Schnellzugriff " + slotLabels.join(" | ") + " | Shift: Sprint"
            : "Shift: Sprint";

        this.ctx.fillText(quickText, baseX + 14, textY);
        textY += 26;

        const ownedCount = weaponOrder.filter((id) => weaponInventory.has(id)).length;
        if (ownedCount > quickSlots.length) {
            const rangeStart = quickSlots.length + 1;
            const rangeEnd = ownedCount;
            const moreText = "Weitere Waffen: Tasten " + rangeStart + (rangeStart === rangeEnd ? "" : "-" + rangeEnd);
            this.ctx.fillText(moreText, baseX + 14, textY);
            textY += 26;
        }

        this.ctx.fillText("E: Interagieren | Casino: 1$ = " + (casinoCreditRate ?? 10) + " Credits", baseX + 14, textY);
    }

    // ── Crosshair ───────────────────────────────────────────────────────

    /**
     * Zeichnet das Fadenkreuz an der Mausposition.
     * @param {{x:number, y:number}} mouse
     */
    drawCrosshair(mouse) {
        const x = Number(mouse?.x ?? 0);
        const y = Number(mouse?.y ?? 0);

        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return;
        }

        this.ctx.save();
        this.ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
        this.ctx.lineWidth = 1.5;

        this.ctx.beginPath();
        this.ctx.moveTo(x - 14, y);
        this.ctx.lineTo(x - 4, y);
        this.ctx.moveTo(x + 4, y);
        this.ctx.lineTo(x + 14, y);
        this.ctx.moveTo(x, y - 14);
        this.ctx.lineTo(x, y - 4);
        this.ctx.moveTo(x, y + 4);
        this.ctx.lineTo(x, y + 14);
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        this.ctx.stroke();

        this.ctx.restore();
    }

    // ── Tag/Nacht-Overlay ───────────────────────────────────────────────

    /**
     * Zeichnet das Tag/Nacht-Beleuchtungsoverlay.
     * @param {{overlayAlpha:number, overlayTop:string, overlayBottom:string, horizon:object|null, starAlpha:number}} lighting
     * @param {number} cameraX
     * @param {number} cameraY
     * @param {number} canvasWidth
     * @param {number} canvasHeight
     * @param {Array} stars - Sternen-Array aus DayNightSystem
     * @param {number} starPhase - Aktuelle Sternenphase
     */
    drawDayNightOverlay(lighting, cameraX, cameraY, canvasWidth, canvasHeight, stars, starPhase) {
        if (!lighting) {
            return;
        }

        const { overlayAlpha, overlayTop, overlayBottom, horizon, starAlpha } = lighting;

        if (overlayAlpha > 0.001) {
            const gradient = this.ctx.createLinearGradient(
                cameraX,
                cameraY,
                cameraX,
                cameraY + canvasHeight
            );

            gradient.addColorStop(0, overlayTop ?? 'rgba(0, 0, 0, 0)');
            gradient.addColorStop(1, overlayBottom ?? 'rgba(0, 0, 0, 0)');

            this.ctx.save();
            this.ctx.globalAlpha = Math.max(0, Math.min(1, Number(overlayAlpha) || 0));
            this.ctx.fillStyle = gradient;
            this.ctx.fillRect(cameraX, cameraY, canvasWidth, canvasHeight);
            this.ctx.restore();
        }

        if (horizon && horizon.alpha > 0.001) {
            const offset = Math.max(0, Math.min(0.9, Number(horizon.offsetTop) || 0.2));
            const startY = cameraY + canvasHeight * offset;

            const gradient = this.ctx.createLinearGradient(
                cameraX,
                startY,
                cameraX,
                cameraY + canvasHeight
            );

            gradient.addColorStop(0, horizon.top ?? 'rgba(0, 0, 0, 0)');
            gradient.addColorStop(1, horizon.bottom ?? 'rgba(0, 0, 0, 0)');

            this.ctx.save();
            this.ctx.globalAlpha = Math.max(0, Math.min(1, Number(horizon.alpha) || 0));
            this.ctx.fillStyle = gradient;
            this.ctx.fillRect(cameraX, cameraY, canvasWidth, canvasHeight);
            this.ctx.restore();
        }

        if (starAlpha > 0.001) {
            this.drawNightSkyStars(stars, starAlpha, starPhase, cameraX, cameraY, canvasWidth, canvasHeight);
        }
    }

    // ── Sterne ──────────────────────────────────────────────────────────

    /**
     * Zeichnet die Sterne am Nachthimmel.
     * @param {Array} stars
     * @param {number} alpha
     * @param {number} starPhase
     * @param {number} cameraX
     * @param {number} cameraY
     * @param {number} canvasWidth
     * @param {number} canvasHeight
     */
    drawNightSkyStars(stars, alpha, starPhase, cameraX, cameraY, canvasWidth, canvasHeight) {
        if (!Array.isArray(stars) || stars.length === 0) {
            return;
        }

        const baseAlpha = Math.max(0, Math.min(1, Number(alpha) || 0));

        if (baseAlpha <= 0) {
            return;
        }

        const phase = starPhase ?? 0;

        this.ctx.save();
        this.ctx.fillStyle = 'rgba(255, 255, 255, 1)';

        for (const star of stars) {
            const twinkleSpeed = Math.max(0.2, Number(star?.twinkleSpeed) || 1);
            const offset = Number(star?.twinkleOffset) || 0;
            const baseIntensity = Math.max(0, Math.min(1, Number(star?.baseIntensity) || 0.7));

            const twinkle = Math.sin(phase * twinkleSpeed + offset) * 0.5 + 0.5;
            const intensity = baseIntensity * (0.6 + 0.4 * twinkle);
            const starAlpha = baseAlpha * Math.max(0, Math.min(1, intensity));

            if (starAlpha <= 0.02) {
                continue;
            }

            const x = cameraX + (Number(star?.x) || 0) * canvasWidth;
            const y = cameraY + (Number(star?.y) || 0) * canvasHeight;
            const size = Math.max(0.4, Number(star?.size) || 1);

            this.ctx.globalAlpha = starAlpha;
            this.ctx.beginPath();
            this.ctx.arc(x, y, size, 0, Math.PI * 2);
            this.ctx.fill();
        }

        this.ctx.restore();
    }

    // ── FPS ─────────────────────────────────────────────────────────────

    /**
     * Aktualisiert die FPS-Anzeige im DOM.
     * @param {number} fps
     */
    updateFPSDisplay(fps) {
        if (this.fpsEl) {
            this.fpsEl.textContent = fps;
        }
    }

    // ── Intern ──────────────────────────────────────────────────────────

    /**
     * Ermittelt die aktive Waffe aus dem Katalog anhand der Spielerdaten.
     * @param {object} player
     * @param {object} weaponCatalog
     * @returns {object|null}
     */
    // ── Taschenlampen + Nacht-Overlay ──────────────────────────────────

    /**
     * Zeichnet das Nacht-Overlay mit Taschenlampen-Ausschnitten.
     * Nutzt einen Offscreen-Canvas: Dunkelheit malen, Kegel ausstanzen,
     * dann auf den Haupt-Canvas compositen.
     *
     * @param {number} overlayAlpha - aktuelle Dunkelheit (0-1)
     * @param {number} cameraX
     * @param {number} cameraY
     * @param {number} viewWidth  - sichtbare Viewport-Breite (Welt-Einheiten)
     * @param {number} viewHeight - sichtbare Viewport-Hoehe (Welt-Einheiten)
     * @param {Array<{x:number, y:number, angle:number, spread?:number, range?:number}>} flashlights
     */
    drawNightWithFlashlights(overlayAlpha, cameraX, cameraY, viewWidth, viewHeight, flashlights) {
        if (overlayAlpha < 0.05) return;

        const dc = this._darkCanvas;
        const dctx = this._darkCtx;

        // Offscreen-Canvas auf sichtbare Groesse anpassen
        const w = Math.ceil(viewWidth);
        const h = Math.ceil(viewHeight);
        if (dc.width !== w || dc.height !== h) {
            dc.width = w;
            dc.height = h;
        }

        // Dunkelheit fuellen
        dctx.clearRect(0, 0, w, h);
        dctx.fillStyle = `rgba(0, 0, 0, ${Math.min(1, overlayAlpha)})`;
        dctx.fillRect(0, 0, w, h);

        // Taschenlampen-Kegel ausstanzen
        if (flashlights && flashlights.length > 0) {
            dctx.globalCompositeOperation = 'destination-out';

            for (const fl of flashlights) {
                const spread = fl.spread ?? 0.45;
                const range = fl.range ?? 220;
                const angle = fl.angle;
                // Lokale Koordinaten relativ zum Offscreen-Canvas
                const cx = fl.x - cameraX;
                const cy = fl.y - cameraY;

                const leftAngle = angle - spread;
                const rightAngle = angle + spread;
                const tipX1 = cx + Math.cos(leftAngle) * range;
                const tipY1 = cy + Math.sin(leftAngle) * range;
                const tipX2 = cx + Math.cos(rightAngle) * range;
                const tipY2 = cy + Math.sin(rightAngle) * range;
                const midX = cx + Math.cos(angle) * range;
                const midY = cy + Math.sin(angle) * range;

                // Radialer Gradient fuer sanften Rand
                const grad = dctx.createRadialGradient(cx, cy, 6, cx, cy, range);
                grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
                grad.addColorStop(0.65, 'rgba(0, 0, 0, 0.8)');
                grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

                dctx.beginPath();
                dctx.moveTo(cx, cy);
                dctx.lineTo(tipX1, tipY1);
                dctx.quadraticCurveTo(midX, midY, tipX2, tipY2);
                dctx.closePath();
                dctx.fillStyle = grad;
                dctx.fill();
            }

            dctx.globalCompositeOperation = 'source-over';
        }

        // Offscreen-Dunkelheit auf Haupt-Canvas zeichnen
        this.ctx.drawImage(dc, cameraX, cameraY, w, h);

        // Warmer Lichtschein der Taschenlampen (auf Haupt-Canvas)
        if (flashlights && flashlights.length > 0) {
            this.ctx.save();
            this.ctx.globalCompositeOperation = 'lighter';
            for (const fl of flashlights) {
                const spread = fl.spread ?? 0.45;
                const range = fl.range ?? 220;
                const angle = fl.angle;
                const cx = fl.x;
                const cy = fl.y;

                const leftAngle = angle - spread;
                const rightAngle = angle + spread;
                const tipX1 = cx + Math.cos(leftAngle) * range;
                const tipY1 = cy + Math.sin(leftAngle) * range;
                const tipX2 = cx + Math.cos(rightAngle) * range;
                const tipY2 = cy + Math.sin(rightAngle) * range;
                const midX = cx + Math.cos(angle) * range;
                const midY = cy + Math.sin(angle) * range;

                const warmGrad = this.ctx.createRadialGradient(cx, cy, 4, cx, cy, range);
                warmGrad.addColorStop(0, 'rgba(255, 245, 200, 0.10)');
                warmGrad.addColorStop(0.5, 'rgba(255, 235, 180, 0.04)');
                warmGrad.addColorStop(1, 'rgba(255, 230, 160, 0)');

                this.ctx.beginPath();
                this.ctx.moveTo(cx, cy);
                this.ctx.lineTo(tipX1, tipY1);
                this.ctx.quadraticCurveTo(midX, midY, tipX2, tipY2);
                this.ctx.closePath();
                this.ctx.fillStyle = warmGrad;
                this.ctx.fill();
            }
            this.ctx.restore();
        }
    }

    // ── Polizei-UI ─────────────────────────────────────────────────────

    /**
     * Zeichnet den Wanted-Indikator (Polizei-Sirene).
     * @param {boolean} wanted
     * @param {boolean} shootBack - Ob Polizei zurueckschiesst
     * @param {number} now - performance.now() fuer Blink-Animation
     */
    drawWantedIndicator(wanted, shootBack, now) {
        if (!wanted) return;

        const x = this.renderer.width - 280;
        const y = 20;

        // Hintergrund
        this.ctx.fillStyle = 'rgba(12, 16, 24, 0.85)';
        this.ctx.fillRect(x, y, 260, 60);

        // Blinkendes Polizei-Icon
        const blink = Math.sin(now * 0.008) > 0;
        this.ctx.fillStyle = blink ? '#3b82f6' : '#ef4444';
        this.ctx.beginPath();
        this.ctx.arc(x + 30, y + 30, 14, 0, Math.PI * 2);
        this.ctx.fill();

        // Text
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 24px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(shootBack ? 'GESUCHT!' : 'POLIZEI', x + 54, y + 38);
    }

    /**
     * Zeichnet die Verhaftungs-Fortschrittsanzeige.
     * @param {number} progress - 0 bis 1
     */
    drawArrestProgress(progress) {
        if (progress <= 0.01) return;

        const barW = 320;
        const barH = 20;
        const x = (this.renderer.width - barW) / 2;
        const y = this.renderer.height - 100;

        // Hintergrund
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(x - 6, y - 30, barW + 12, barH + 44);

        // Label
        this.ctx.fillStyle = '#ff4444';
        this.ctx.font = 'bold 18px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('VERHAFTUNG', x + barW / 2, y - 6);

        // Bar Hintergrund
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        this.ctx.fillRect(x, y, barW, barH);

        // Bar Fortschritt
        this.ctx.fillStyle = '#ff4444';
        this.ctx.fillRect(x, y, barW * Math.min(1, progress), barH);
    }

    /**
     * Zeichnet den Stun-Effekt (blaue Blitze um den Bildschirm).
     * @param {number} stunTimer - Verbleibende Stun-Zeit in ms
     * @param {number} now
     */
    drawStunEffect(stunTimer, now) {
        if (stunTimer <= 0) return;

        const alpha = Math.min(0.4, stunTimer / 2000 * 0.4);
        const flash = Math.sin(now * 0.02) * 0.15;

        this.ctx.save();
        this.ctx.fillStyle = `rgba(50, 130, 255, ${alpha + flash})`;
        this.ctx.fillRect(0, 0, this.renderer.width, this.renderer.height);

        // BETAEUBT Text
        this.ctx.fillStyle = `rgba(255, 255, 100, ${0.6 + flash})`;
        this.ctx.font = 'bold 42px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('BETAEUBT', this.renderer.width / 2, this.renderer.height / 2 - 40);

        this.ctx.restore();
    }

    /**
     * Zeichnet den Slow-Effekt (dezenter blauer Rand).
     * @param {number} slowTimer
     */
    drawSlowEffect(slowTimer) {
        if (slowTimer <= 0) return;

        const alpha = Math.min(0.2, slowTimer / 2000 * 0.2);
        this.ctx.save();

        // Vignette-Effekt
        const grad = this.ctx.createRadialGradient(
            this.renderer.width / 2, this.renderer.height / 2, this.renderer.height * 0.3,
            this.renderer.width / 2, this.renderer.height / 2, this.renderer.height * 0.7
        );
        grad.addColorStop(0, 'rgba(50, 130, 255, 0)');
        grad.addColorStop(1, `rgba(50, 130, 255, ${alpha})`);
        this.ctx.fillStyle = grad;
        this.ctx.fillRect(0, 0, this.renderer.width, this.renderer.height);

        this.ctx.restore();
    }

    /**
     * Zeichnet den WASTED-Bildschirm.
     * @param {string} reason - 'arrested' oder 'killed'
     * @returns {{ buttonRect: {x:number, y:number, w:number, h:number} }}
     */
    drawWastedScreen(reason) {
        const w = this.renderer.width;
        const h = this.renderer.height;

        // Dunkler Overlay
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        this.ctx.fillRect(0, 0, w, h);

        // Roter Streifen
        const stripeH = 160;
        const stripeY = h / 2 - stripeH / 2 - 40;
        this.ctx.fillStyle = 'rgba(180, 20, 20, 0.6)';
        this.ctx.fillRect(0, stripeY, w, stripeH);

        // WASTED Text
        this.ctx.fillStyle = '#cc1111';
        this.ctx.font = 'bold 96px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText('WASTED', w / 2, stripeY + stripeH / 2);

        // Untertitel
        this.ctx.fillStyle = '#cccccc';
        this.ctx.font = '24px Arial';
        const fine = reason === 'killed' ? 500 : 250;
        const subtitle = reason === 'arrested'
            ? 'Du wurdest verhaftet. Strafe: ' + fine + '$'
            : 'Du wurdest ausgeschaltet. Strafe: ' + fine + '$';
        this.ctx.fillText(subtitle, w / 2, stripeY + stripeH + 40);

        // Respawn-Button
        const btnW = 300;
        const btnH = 60;
        const btnX = w / 2 - btnW / 2;
        const btnY = stripeY + stripeH + 70;

        this.ctx.fillStyle = '#2563eb';
        this.ctx.fillRect(btnX, btnY, btnW, btnH);
        this.ctx.strokeStyle = '#60a5fa';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(btnX, btnY, btnW, btnH);

        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 26px Arial';
        this.ctx.fillText('RESPAWN', w / 2, btnY + btnH / 2);

        this.ctx.textBaseline = 'alphabetic';

        return { buttonRect: { x: btnX, y: btnY, w: btnW, h: btnH } };
    }

    /**
     * Zeichnet die Spieler-Gesundheitsanzeige.
     * @param {number} health
     * @param {number} maxHealth
     */
    drawPlayerHealth(health, maxHealth) {
        if (health >= maxHealth) return;

        const barW = 200;
        const barH = 14;
        const x = (this.renderer.width - barW) / 2;
        const y = this.renderer.height - 55;

        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        this.ctx.fillRect(x - 3, y - 3, barW + 6, barH + 6);

        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        this.ctx.fillRect(x, y, barW, barH);

        const ratio = Math.max(0, health / maxHealth);
        const color = ratio > 0.5 ? '#22c55e' : ratio > 0.25 ? '#eab308' : '#ef4444';
        this.ctx.fillStyle = color;
        this.ctx.fillRect(x, y, barW * ratio, barH);
    }

    /**
     * Zeichnet die Stamina-Bar (Sprint-Ausdauer).
     * @param {number} stamina - 0 bis 1
     */
    drawStaminaBar(stamina) {
        if (stamina >= 1) return;

        const barW = 200;
        const barH = 8;
        const x = (this.renderer.width - barW) / 2;
        const y = this.renderer.height - 38;

        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        this.ctx.fillRect(x - 2, y - 2, barW + 4, barH + 4);

        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        this.ctx.fillRect(x, y, barW, barH);

        const ratio = Math.max(0, Math.min(1, stamina));
        const color = ratio > 0.4 ? '#38bdf8' : ratio > 0.15 ? '#f59e0b' : '#ef4444';
        this.ctx.fillStyle = color;
        this.ctx.fillRect(x, y, barW * ratio, barH);
    }

    _getCurrentWeaponFromCatalog(player, weaponCatalog) {
        const weaponId = player?.currentWeaponId ?? player?.equippedWeapon ?? null;
        if (!weaponId || !weaponCatalog) {
            return null;
        }
        return weaponCatalog?.get?.(weaponId) ?? weaponCatalog?.[weaponId] ?? null;
    }
}



// ═══════════════════════════════════════════════════════
// js/rendering/PhoneUI.js
// ═══════════════════════════════════════════════════════
/**
 * PhoneUI - Handy-Overlay mit Homescreen und oeffenbaren Apps (Karte, Chats).
 */

// ── Spielzeit-Mapping ────────────────────────────────────────────────────
const PHASE_TIME_MAP = {
    day:   { startHour: 8,  spanHours: 10 },
    dusk:  { startHour: 18, spanHours: 3  },
    night: { startHour: 21, spanHours: 8  },
    dawn:  { startHour: 5,  spanHours: 3  },
};

const DAY_NAMES = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

// ── Apps ─────────────────────────────────────────────────────────────────
const PHONE_APPS = [
    { id: 'map',      label: 'Karte',       icon: 'map',   color: '#2ea043' },
    { id: 'chats',    label: 'Nachrichten',  icon: 'chat',  color: '#58a6ff' },
    { id: 'contacts', label: 'Kontakte',     icon: 'user',  color: '#d29922' },
    { id: 'settings', label: 'Einstellungen',icon: 'gear',  color: '#8b949e' },
];

// ── Chat-Daten ───────────────────────────────────────────────────────────
const CHAT_CONTACTS = [
    {
        name: 'Mama',
        messages: [
            { text: 'Vergiss nicht einzukaufen!', time: '09:14', incoming: true },
            { text: 'Ja mach ich spaeter',        time: '09:15', incoming: false },
            { text: 'Komm nicht zu spaet!',        time: '14:07', incoming: true },
        ],
    },
    {
        name: 'Luca',
        messages: [
            { text: 'Bist du heute online?',       time: '11:32', incoming: true },
            { text: 'Bin unterwegs gerade',         time: '11:33', incoming: false },
            { text: 'Ok sag bescheid wenn du da bist', time: '11:34', incoming: true },
        ],
    },
    {
        name: 'Tim',
        messages: [
            { text: 'Hast du das Spiel gesehen?',  time: '20:11', incoming: true },
            { text: 'Ja war krass!',                time: '20:12', incoming: false },
        ],
    },
];

// ── Handy-Konstanten ─────────────────────────────────────────────────────
const PHONE_W = 260;
const PHONE_H = 480;
const SCREEN_PAD = 12;
const SCREEN_TOP = 40;
const SCREEN_BOTTOM = 30;
const STATUS_BAR_H = 28;
const NAV_BAR_H = 36;

class PhoneUI {

    constructor() {
        this.open = false;
        /** 'home' | 'map' | 'chats' | 'chat-detail' | 'contacts' | 'settings' */
        this.currentScreen = 'home';
        this.selectedChat = null;       // Index in CHAT_CONTACTS

        this._dayCount = 0;
        this._lastPhaseIndex = 0;
        this._slideProgress = 0;

        // Klick-State
        this._clickConsumed = false;

        // Gecachte Handy-Position (wird in draw() gesetzt, in handleClick gelesen)
        this._phoneX = 0;
        this._phoneY = 0;
        this._canvasW = 0;
        this._canvasH = 0;
    }

    // ── Toggle ───────────────────────────────────────────────────────────

    toggle() {
        if (this.open) {
            this.open = false;
            this.currentScreen = 'home';
            this.selectedChat = null;
        } else {
            this.open = true;
        }
    }

    // ── Update ───────────────────────────────────────────────────────────

    /**
     * @param {number} deltaTime
     * @param {import('../systems/DayNightSystem.js').DayNightSystem} dayNight
     * @param {{x:number, y:number, down:boolean}} mouse
     * @param {boolean} mouseJustPressed
     */
    update(deltaTime, dayNight, mouse, mouseJustPressed) {
        // Slide-Animation
        const target = this.open ? 1 : 0;
        const speed = 8;
        this._slideProgress += (target - this._slideProgress) * Math.min(1, speed * deltaTime);
        if (Math.abs(this._slideProgress - target) < 0.005) {
            this._slideProgress = target;
        }

        // Tag-Zaehler
        if (dayNight) {
            const idx = dayNight.phaseIndex;
            if (this._lastPhaseIndex === 3 && idx === 0) {
                this._dayCount++;
            }
            this._lastPhaseIndex = idx;
        }

        // Klick-Verarbeitung
        if (mouseJustPressed && this.open && this._slideProgress > 0.9) {
            this._handleClick(mouse.x, mouse.y);
        }
    }

    get visible() {
        return this._slideProgress > 0.01;
    }

    // ── Klick-Verarbeitung ───────────────────────────────────────────────

    _handleClick(mx, my) {
        const phoneX = this._phoneX;
        const phoneY = this._phoneY;
        const screenX = phoneX + SCREEN_PAD;
        const screenY = phoneY + SCREEN_TOP;
        const screenW = PHONE_W - SCREEN_PAD * 2;
        const screenH = PHONE_H - SCREEN_TOP - SCREEN_BOTTOM;
        const contentY = screenY + STATUS_BAR_H;
        const contentH = screenH - STATUS_BAR_H - NAV_BAR_H;

        // Ausserhalb Handy?
        if (mx < phoneX || mx > phoneX + PHONE_W || my < phoneY || my > phoneY + PHONE_H) {
            return;
        }

        // Nav-Bar: Zurueck-Button (immer sichtbar wenn nicht auf Home)
        const navY = screenY + screenH - NAV_BAR_H;
        if (this.currentScreen !== 'home' && my >= navY && my <= navY + NAV_BAR_H) {
            if (this.currentScreen === 'chat-detail') {
                this.currentScreen = 'chats';
                this.selectedChat = null;
            } else {
                this.currentScreen = 'home';
            }
            return;
        }

        // Homescreen: App-Icons
        if (this.currentScreen === 'home') {
            const cols = 2;
            const iconSize = 52;
            const gapX = (screenW - cols * iconSize) / (cols + 1);
            const gapY = 24;
            const startY = contentY + 30;

            for (let i = 0; i < PHONE_APPS.length; i++) {
                const col = i % cols;
                const row = Math.floor(i / cols);
                const ix = screenX + gapX + col * (iconSize + gapX);
                const iy = startY + row * (iconSize + gapY + 16);

                if (mx >= ix && mx <= ix + iconSize && my >= iy && my <= iy + iconSize) {
                    this.currentScreen = PHONE_APPS[i].id;
                    return;
                }
            }
            return;
        }

        // Chats-Liste: Kontakt anklicken
        if (this.currentScreen === 'chats') {
            const listStartY = contentY + 8;
            const itemH = 52;

            for (let i = 0; i < CHAT_CONTACTS.length; i++) {
                const iy = listStartY + i * itemH;
                if (mx >= screenX && mx <= screenX + screenW && my >= iy && my <= iy + itemH) {
                    this.selectedChat = i;
                    this.currentScreen = 'chat-detail';
                    return;
                }
            }
        }
    }

    /** Prueft ob ein Klick innerhalb des Handys liegt (um Spielaktionen zu blockieren) */
    isClickOnPhone(mx, my) {
        if (!this.open || this._slideProgress < 0.5) return false;
        return mx >= this._phoneX && mx <= this._phoneX + PHONE_W &&
               my >= this._phoneY && my <= this._phoneY + PHONE_H;
    }

    // ── Spielzeit ────────────────────────────────────────────────────────

    getGameTime(dayNight) {
        const phaseId = dayNight.currentPhase?.id ?? 'day';
        const progress = dayNight.progress ?? 0;
        const mapping = PHASE_TIME_MAP[phaseId] ?? PHASE_TIME_MAP.day;

        const totalHours = mapping.startHour + mapping.spanHours * progress;
        const hours24 = ((totalHours % 24) + 24) % 24;
        const hours = Math.floor(hours24);
        const minutes = Math.floor((hours24 - hours) * 60);
        const dayName = DAY_NAMES[this._dayCount % DAY_NAMES.length];

        return { hours, minutes, dayName };
    }

    // ── Haupt-Render ─────────────────────────────────────────────────────

    draw(ctx, canvasWidth, canvasHeight, { dayNight, player, buildings, roadLayout, worldBounds }) {
        if (!this.visible) return;

        const slide = this._slideProgress;
        this._canvasW = canvasWidth;
        this._canvasH = canvasHeight;

        const phoneX = canvasWidth / 2 - PHONE_W / 2;
        const phoneBaseY = canvasHeight / 2 - PHONE_H / 2;
        const phoneY = phoneBaseY + (1 - slide) * (canvasHeight - phoneBaseY + 40);

        this._phoneX = phoneX;
        this._phoneY = phoneY;

        ctx.save();
        ctx.globalAlpha = Math.min(1, slide * 1.5);

        // Schatten
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 30;
        ctx.shadowOffsetY = 8;

        // Gehaeuse
        this._roundRect(ctx, phoneX, phoneY, PHONE_W, PHONE_H, 24);
        ctx.fillStyle = '#1a1a2e';
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;

        this._roundRect(ctx, phoneX, phoneY, PHONE_W, PHONE_H, 24);
        ctx.strokeStyle = '#3a3a5e';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Bildschirm
        const screenX = phoneX + SCREEN_PAD;
        const screenY = phoneY + SCREEN_TOP;
        const screenW = PHONE_W - SCREEN_PAD * 2;
        const screenH = PHONE_H - SCREEN_TOP - SCREEN_BOTTOM;

        this._roundRect(ctx, screenX, screenY, screenW, screenH, 12);
        ctx.fillStyle = '#0d1117';
        ctx.fill();

        ctx.save();
        ctx.beginPath();
        this._roundRect(ctx, screenX, screenY, screenW, screenH, 12);
        ctx.clip();

        // Statusleiste
        this._drawStatusBar(ctx, screenX, screenY, screenW, dayNight);

        // Content-Bereich
        const contentY = screenY + STATUS_BAR_H;
        const contentH = screenH - STATUS_BAR_H - NAV_BAR_H;

        switch (this.currentScreen) {
            case 'home':
                this._drawHomeScreen(ctx, screenX, contentY, screenW, contentH, dayNight);
                break;
            case 'map':
                this._drawMapApp(ctx, screenX, contentY, screenW, contentH, player, buildings, roadLayout, worldBounds);
                break;
            case 'chats':
                this._drawChatsApp(ctx, screenX, contentY, screenW, contentH);
                break;
            case 'chat-detail':
                this._drawChatDetail(ctx, screenX, contentY, screenW, contentH);
                break;
            case 'contacts':
                this._drawContactsApp(ctx, screenX, contentY, screenW, contentH);
                break;
            case 'settings':
                this._drawSettingsApp(ctx, screenX, contentY, screenW, contentH);
                break;
        }

        // Nav-Bar
        this._drawNavBar(ctx, screenX, screenY + screenH - NAV_BAR_H, screenW);

        ctx.restore(); // clip

        // Notch
        ctx.fillStyle = '#0d1117';
        this._roundRect(ctx, phoneX + PHONE_W / 2 - 40, phoneY + 8, 80, 20, 10);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(phoneX + PHONE_W / 2 + 20, phoneY + 18, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#1a3a5e';
        ctx.fill();

        // Home-Strich
        ctx.strokeStyle = '#3a3a5e';
        ctx.lineWidth = 2;
        this._roundRect(ctx, phoneX + PHONE_W / 2 - 30, phoneY + PHONE_H - 22, 60, 4, 2);
        ctx.stroke();

        ctx.restore();
    }

    // ── Statusleiste ─────────────────────────────────────────────────────

    _drawStatusBar(ctx, x, y, w, dayNight) {
        ctx.fillStyle = '#161b22';
        ctx.fillRect(x, y, w, STATUS_BAR_H);

        const time = this.getGameTime(dayNight);
        const timeStr = String(time.hours).padStart(2, '0') + ':' + String(time.minutes).padStart(2, '0');

        ctx.fillStyle = '#e6edf3';
        ctx.font = 'bold 13px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(timeStr, x + 10, y + 19);

        ctx.textAlign = 'right';
        ctx.font = '12px Arial';
        ctx.fillStyle = '#8b949e';
        ctx.fillText(time.dayName, x + w - 10, y + 19);

        // Batterie-Icon
        const batX = x + w - 70;
        const batY = y + 9;
        ctx.strokeStyle = '#8b949e';
        ctx.lineWidth = 1;
        ctx.strokeRect(batX, batY, 16, 9);
        ctx.fillStyle = '#3fb950';
        ctx.fillRect(batX + 2, batY + 2, 10, 5);
        ctx.fillStyle = '#8b949e';
        ctx.fillRect(batX + 16, batY + 2, 2, 5);

        ctx.strokeStyle = '#30363d';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y + STATUS_BAR_H);
        ctx.lineTo(x + w, y + STATUS_BAR_H);
        ctx.stroke();
    }

    // ── Homescreen ───────────────────────────────────────────────────────

    _drawHomeScreen(ctx, x, y, w, h, dayNight) {
        // Uhrzeit gross
        const time = this.getGameTime(dayNight);
        const timeStr = String(time.hours).padStart(2, '0') + ':' + String(time.minutes).padStart(2, '0');

        ctx.fillStyle = '#e6edf3';
        ctx.font = 'bold 36px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(timeStr, x + w / 2, y + 38);

        ctx.font = '13px Arial';
        ctx.fillStyle = '#8b949e';
        ctx.fillText(time.dayName, x + w / 2, y + 56);

        // App-Grid
        const cols = 2;
        const iconSize = 52;
        const gapX = (w - cols * iconSize) / (cols + 1);
        const gapY = 24;
        const startY = y + 78;

        for (let i = 0; i < PHONE_APPS.length; i++) {
            const app = PHONE_APPS[i];
            const col = i % cols;
            const row = Math.floor(i / cols);
            const ix = x + gapX + col * (iconSize + gapX);
            const iy = startY + row * (iconSize + gapY + 16);

            // Icon-Hintergrund
            this._roundRect(ctx, ix, iy, iconSize, iconSize, 14);
            ctx.fillStyle = app.color;
            ctx.fill();

            // Icon-Symbol
            ctx.fillStyle = '#ffffff';
            this._drawAppIcon(ctx, ix + iconSize / 2, iy + iconSize / 2, app.icon);

            // Label
            ctx.fillStyle = '#c9d1d9';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(app.label, ix + iconSize / 2, iy + iconSize + 14);
        }

        // Ungelesene-Nachrichten Badge auf Chats
        const chatIdx = PHONE_APPS.findIndex(a => a.id === 'chats');
        if (chatIdx >= 0) {
            const col = chatIdx % cols;
            const row = Math.floor(chatIdx / cols);
            const ix = x + gapX + col * (iconSize + gapX);
            const iy = startY + row * (iconSize + gapY + 16);

            const unread = CHAT_CONTACTS.reduce((sum, c) => sum + c.messages.filter(m => m.incoming).length, 0);
            if (unread > 0) {
                ctx.beginPath();
                ctx.arc(ix + iconSize - 4, iy + 4, 10, 0, Math.PI * 2);
                ctx.fillStyle = '#f85149';
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 10px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(String(unread), ix + iconSize - 4, iy + 8);
            }
        }
    }

    // ── App-Icons zeichnen ───────────────────────────────────────────────

    _drawAppIcon(ctx, cx, cy, icon) {
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        switch (icon) {
            case 'map': {
                // Standort-Pin
                ctx.beginPath();
                ctx.arc(cx, cy - 4, 7, Math.PI, 0);
                ctx.lineTo(cx, cy + 10);
                ctx.closePath();
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(cx, cy - 4, 3, 0, Math.PI * 2);
                ctx.fill();
                break;
            }
            case 'chat': {
                // Sprechblase
                this._roundRect(ctx, cx - 10, cy - 9, 20, 14, 4);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(cx - 3, cy + 5);
                ctx.lineTo(cx - 7, cy + 11);
                ctx.lineTo(cx + 2, cy + 5);
                ctx.stroke();
                // Punkte
                ctx.beginPath();
                ctx.arc(cx - 5, cy - 2, 1.5, 0, Math.PI * 2);
                ctx.arc(cx, cy - 2, 1.5, 0, Math.PI * 2);
                ctx.arc(cx + 5, cy - 2, 1.5, 0, Math.PI * 2);
                ctx.fill();
                break;
            }
            case 'user': {
                // Kopf
                ctx.beginPath();
                ctx.arc(cx, cy - 5, 6, 0, Math.PI * 2);
                ctx.stroke();
                // Koerper
                ctx.beginPath();
                ctx.arc(cx, cy + 14, 11, Math.PI + 0.4, -0.4);
                ctx.stroke();
                break;
            }
            case 'gear': {
                // Zahnrad
                const r = 9;
                const teeth = 6;
                ctx.beginPath();
                for (let i = 0; i < teeth; i++) {
                    const a1 = (i / teeth) * Math.PI * 2 - Math.PI / 2;
                    const a2 = ((i + 0.35) / teeth) * Math.PI * 2 - Math.PI / 2;
                    const a3 = ((i + 0.65) / teeth) * Math.PI * 2 - Math.PI / 2;
                    const a4 = ((i + 1) / teeth) * Math.PI * 2 - Math.PI / 2;
                    ctx.lineTo(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r);
                    ctx.lineTo(cx + Math.cos(a2) * (r - 3), cy + Math.sin(a2) * (r - 3));
                    ctx.lineTo(cx + Math.cos(a3) * (r - 3), cy + Math.sin(a3) * (r - 3));
                    ctx.lineTo(cx + Math.cos(a4) * r, cy + Math.sin(a4) * r);
                }
                ctx.closePath();
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(cx, cy, 3, 0, Math.PI * 2);
                ctx.fill();
                break;
            }
        }
        ctx.restore();
    }

    // ── Map App ──────────────────────────────────────────────────────────

    _drawMapApp(ctx, x, y, w, h, player, buildings, roadLayout, worldBounds) {
        // Titel
        ctx.fillStyle = '#161b22';
        ctx.fillRect(x, y, w, 30);
        ctx.fillStyle = '#e6edf3';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Karte', x + w / 2, y + 20);

        // Karte (so gross wie moeglich)
        const mapY = y + 34;
        const mapH = h - 38;

        ctx.fillStyle = '#1c2a1c';
        ctx.fillRect(x, mapY, w, mapH);

        this._drawMinimap(ctx, x, mapY, w, mapH, player, buildings, roadLayout, worldBounds);
    }

    // ── Chats App (Kontaktliste) ─────────────────────────────────────────

    _drawChatsApp(ctx, x, y, w, h) {
        // Titel
        ctx.fillStyle = '#161b22';
        ctx.fillRect(x, y, w, 30);
        ctx.fillStyle = '#e6edf3';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Nachrichten', x + w / 2, y + 20);

        const listY = y + 34;
        const itemH = 52;

        for (let i = 0; i < CHAT_CONTACTS.length; i++) {
            const contact = CHAT_CONTACTS[i];
            const iy = listY + i * itemH;
            const lastMsg = contact.messages[contact.messages.length - 1];

            // Hover-Hintergrund
            ctx.fillStyle = i % 2 === 0 ? '#161b22' : '#0d1117';
            ctx.fillRect(x, iy, w, itemH);

            // Avatar-Kreis
            ctx.beginPath();
            ctx.arc(x + 26, iy + itemH / 2, 16, 0, Math.PI * 2);
            ctx.fillStyle = ['#2ea043', '#58a6ff', '#d29922'][i % 3];
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(contact.name[0], x + 26, iy + itemH / 2 + 5);

            // Name
            ctx.fillStyle = '#e6edf3';
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(contact.name, x + 50, iy + 20);

            // Letzte Nachricht
            ctx.fillStyle = '#8b949e';
            ctx.font = '11px Arial';
            const preview = lastMsg ? (lastMsg.incoming ? '' : 'Du: ') + lastMsg.text : '';
            const maxChars = 22;
            ctx.fillText(
                preview.length > maxChars ? preview.slice(0, maxChars) + '...' : preview,
                x + 50, iy + 38
            );

            // Zeit
            if (lastMsg) {
                ctx.fillStyle = '#484f58';
                ctx.font = '10px Arial';
                ctx.textAlign = 'right';
                ctx.fillText(lastMsg.time, x + w - 10, iy + 20);
            }

            // Trennlinie
            ctx.strokeStyle = '#21262d';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x + 50, iy + itemH);
            ctx.lineTo(x + w, iy + itemH);
            ctx.stroke();
        }
    }

    // ── Chat-Detail ──────────────────────────────────────────────────────

    _drawChatDetail(ctx, x, y, w, h) {
        const contact = CHAT_CONTACTS[this.selectedChat];
        if (!contact) return;

        // Titel
        ctx.fillStyle = '#161b22';
        ctx.fillRect(x, y, w, 30);
        ctx.fillStyle = '#e6edf3';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(contact.name, x + w / 2, y + 20);

        // Nachrichten
        let msgY = y + 40;
        for (const msg of contact.messages) {
            if (msgY + 48 > y + h) break;
            this._drawChatBubble(ctx, x, w, msgY, msg, contact.name);
            msgY += 48;
        }
    }

    // ── Kontakte App ─────────────────────────────────────────────────────

    _drawContactsApp(ctx, x, y, w, h) {
        ctx.fillStyle = '#161b22';
        ctx.fillRect(x, y, w, 30);
        ctx.fillStyle = '#e6edf3';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Kontakte', x + w / 2, y + 20);

        const contacts = ['Mama', 'Luca', 'Tim', 'Papa', 'Sarah'];
        const listY = y + 38;

        for (let i = 0; i < contacts.length; i++) {
            const iy = listY + i * 44;

            // Avatar
            ctx.beginPath();
            ctx.arc(x + 26, iy + 22, 14, 0, Math.PI * 2);
            ctx.fillStyle = ['#2ea043', '#58a6ff', '#d29922', '#f85149', '#a371f7'][i % 5];
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 13px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(contacts[i][0], x + 26, iy + 27);

            // Name
            ctx.fillStyle = '#e6edf3';
            ctx.font = '13px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(contacts[i], x + 50, iy + 26);

            // Trennlinie
            ctx.strokeStyle = '#21262d';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x + 50, iy + 44);
            ctx.lineTo(x + w, iy + 44);
            ctx.stroke();
        }
    }

    // ── Einstellungen App ────────────────────────────────────────────────

    _drawSettingsApp(ctx, x, y, w, h) {
        ctx.fillStyle = '#161b22';
        ctx.fillRect(x, y, w, 30);
        ctx.fillStyle = '#e6edf3';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Einstellungen', x + w / 2, y + 20);

        const items = [
            { label: 'WLAN',       value: 'Verbunden' },
            { label: 'Bluetooth',  value: 'Aus' },
            { label: 'Helligkeit', value: 'Auto' },
            { label: 'Ton',        value: 'An' },
            { label: 'Info',       value: 'v1.0' },
        ];

        const listY = y + 40;
        for (let i = 0; i < items.length; i++) {
            const iy = listY + i * 38;

            ctx.fillStyle = '#e6edf3';
            ctx.font = '13px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(items[i].label, x + 14, iy + 22);

            ctx.fillStyle = '#8b949e';
            ctx.textAlign = 'right';
            ctx.fillText(items[i].value, x + w - 14, iy + 22);

            ctx.strokeStyle = '#21262d';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x + 14, iy + 38);
            ctx.lineTo(x + w - 14, iy + 38);
            ctx.stroke();
        }
    }

    // ── Nav-Bar ──────────────────────────────────────────────────────────

    _drawNavBar(ctx, x, y, w) {
        ctx.fillStyle = '#0d1117';
        ctx.fillRect(x, y, w, NAV_BAR_H);

        ctx.strokeStyle = '#30363d';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + w, y);
        ctx.stroke();

        if (this.currentScreen !== 'home') {
            // Zurueck-Pfeil
            ctx.strokeStyle = '#e6edf3';
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            const cx = x + w / 2;
            const cy = y + NAV_BAR_H / 2;

            ctx.beginPath();
            ctx.moveTo(cx - 8, cy);
            ctx.lineTo(cx + 8, cy);
            ctx.moveTo(cx - 8, cy);
            ctx.lineTo(cx - 2, cy - 6);
            ctx.moveTo(cx - 8, cy);
            ctx.lineTo(cx - 2, cy + 6);
            ctx.stroke();

            ctx.fillStyle = '#8b949e';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Zurueck', cx, cy + 15);
        } else {
            // Home-Indicator
            ctx.fillStyle = '#30363d';
            this._roundRect(ctx, x + w / 2 - 20, y + NAV_BAR_H / 2 - 2, 40, 4, 2);
            ctx.fill();
        }
    }

    // ── Minimap ──────────────────────────────────────────────────────────

    _drawMinimap(ctx, x, y, w, h, player, buildings, roadLayout, worldBounds) {
        const worldW = worldBounds.width;
        const worldH = worldBounds.height;
        const scaleX = w / worldW;
        const scaleY = h / worldH;

        if (roadLayout) {
            ctx.strokeStyle = 'rgba(80, 80, 80, 0.7)';
            ctx.lineWidth = 2;
            const roads = [
                ...(roadLayout.horizontal ?? []),
                ...(roadLayout.vertical ?? []),
                ...(roadLayout.diagonal ?? []),
            ];
            for (const road of roads) {
                if (road.y1 !== undefined) {
                    ctx.beginPath();
                    ctx.moveTo(x + (road.x1 ?? road.x) * scaleX, y + (road.y1 ?? road.y) * scaleY);
                    ctx.lineTo(x + (road.x2 ?? road.x) * scaleX, y + (road.y2 ?? road.y) * scaleY);
                    ctx.stroke();
                } else if (road.y !== undefined) {
                    const startX = road.x1 ?? road.startX ?? 0;
                    const endX = road.x2 ?? road.endX ?? worldW;
                    ctx.beginPath();
                    ctx.moveTo(x + startX * scaleX, y + road.y * scaleY);
                    ctx.lineTo(x + endX * scaleX, y + road.y * scaleY);
                    ctx.stroke();
                } else if (road.x !== undefined) {
                    const startY = road.y1 ?? road.startY ?? 0;
                    const endY = road.y2 ?? road.endY ?? worldH;
                    ctx.beginPath();
                    ctx.moveTo(x + road.x * scaleX, y + startY * scaleY);
                    ctx.lineTo(x + road.x * scaleX, y + endY * scaleY);
                    ctx.stroke();
                }
            }
        }

        if (buildings) {
            ctx.fillStyle = 'rgba(100, 120, 150, 0.6)';
            for (const b of buildings) {
                const bx = (b.x ?? 0) * scaleX;
                const by = (b.y ?? 0) * scaleY;
                const bw = Math.max(2, (b.width ?? 0) * scaleX);
                const bh = Math.max(2, (b.height ?? 0) * scaleY);
                ctx.fillRect(x + bx, y + by, bw, bh);
            }
        }

        if (player) {
            const px = x + player.x * scaleX;
            const py = y + player.y * scaleY;
            ctx.beginPath();
            ctx.arc(px, py, 6, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(0, 200, 255, 0.25)';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(px, py, 3, 0, Math.PI * 2);
            ctx.fillStyle = '#00c8ff';
            ctx.fill();
        }
    }

    // ── Chat-Bubble ──────────────────────────────────────────────────────

    _drawChatBubble(ctx, screenX, screenW, y, msg, senderName) {
        const maxBubbleW = screenW - 36;
        const bubbleH = 38;
        const isIncoming = msg.incoming;
        const bubbleW = Math.min(maxBubbleW, ctx.measureText(msg.text).width + 24);
        const bubbleX = isIncoming ? screenX + 8 : screenX + screenW - bubbleW - 8;

        ctx.fillStyle = isIncoming ? '#21262d' : '#1a3a2a';
        this._roundRect(ctx, bubbleX, y, bubbleW, bubbleH, 10);
        ctx.fill();

        // Absender + Zeit
        ctx.fillStyle = isIncoming ? '#58a6ff' : '#3fb950';
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(isIncoming ? senderName : 'Du', bubbleX + 10, y + 13);

        ctx.fillStyle = '#484f58';
        ctx.font = '9px Arial';
        ctx.textAlign = 'right';
        ctx.fillText(msg.time, bubbleX + bubbleW - 10, y + 13);

        // Text
        ctx.fillStyle = '#c9d1d9';
        ctx.font = '11px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(msg.text, bubbleX + 10, y + 29);
    }

    // ── Hilfsfunktion ────────────────────────────────────────────────────

    _roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }
}



// ═══════════════════════════════════════════════════════
// js/interiors/InteriorManager.js
// ═══════════════════════════════════════════════════════
/**
 * InteriorManager - Verwaltet den Wechsel zwischen Overworld und Interior-Szenen.
 *
 * Portiert aus gta_old/overworld/js/overworld.js:
 *   enterWeaponShop()  Zeilen 2363-2440
 *   exitInterior()     Zeilen 2441-2515
 *
 * SSOT: Alle Interior-Wechsellogik hier zentralisiert.
 */

/**
 * @typedef {object} OverworldReturnState
 * @property {{ x: number, y: number }} position
 * @property {{ x: number, y: number }} camera
 */

class InteriorManager {

    constructor() {
        /** @type {string} Aktuelle Szene ('overworld' oder Interior-Typ) */
        this.scene = 'overworld';

        /** @type {object|null} Aktives Interior-Objekt */
        this.activeInterior = null;

        /** @type {OverworldReturnState|null} Gespeicherter Overworld-Zustand */
        this.overworldReturnState = null;
    }

    /**
     * Prueft ob die aktuelle Szene ein Interior ist.
     * @returns {boolean}
     */
    isInInterior() {
        return this.scene !== 'overworld' && this.activeInterior !== null;
    }

    /**
     * Gibt den Typ des aktiven Interiors zurueck (oder null).
     * @returns {string|null}
     */
    getInteriorType() {
        return this.isInInterior() ? this.scene : null;
    }

    /**
     * Betritt ein Interior.
     *
     * @param {string} type - Interior-Typ (z.B. 'weaponShop', 'casino')
     * @param {object} interiorData - Interior-Daten (von WeaponShop.createLayout() etc.)
     * @param {object} player - Spieler-Entity
     * @param {object} camera - Kamera-Objekt mit x, y
     * @param {object} [inputSystem] - InputSystem zum Zuruecksetzen der Tasten
     * @param {number} [canvasWidth=800] - Canvas-Breite (fuer Zentrierung)
     * @param {number} [canvasHeight=600] - Canvas-Hoehe
     */
    enterInterior(type, interiorData, player, camera, inputSystem, canvasWidth = 800, canvasHeight = 600) {
        if (this.scene === type) {
            return;
        }

        // Interior zentrieren
        interiorData.originX = Math.max(0, Math.floor((canvasWidth - interiorData.width) / 2));
        interiorData.originY = Math.max(0, Math.floor((canvasHeight - interiorData.height) / 2));

        // Overworld-Zustand sichern
        this.overworldReturnState = {
            position: { x: player.x, y: player.y },
            camera: { x: camera.x, y: camera.y },
        };

        // Szene wechseln
        this.scene = type;
        this.activeInterior = interiorData;

        // Spieler in Interior positionieren
        player.x = interiorData.entry.x;
        player.y = interiorData.entry.y;
        player.moving = false;
        player.animationPhase = 0;

        // Kamera zuruecksetzen
        camera.x = 0;
        camera.y = 0;

        // Input zuruecksetzen
        if (inputSystem) {
            this._resetInput(inputSystem);
        }

        eventBus.emit('interior:enter', { type, building: interiorData });
    }

    /**
     * Verlaesst das aktuelle Interior und stellt den Overworld-Zustand wieder her.
     *
     * @param {object} player - Spieler-Entity
     * @param {object} camera - Kamera-Objekt mit x, y
     * @param {object} [inputSystem] - InputSystem zum Zuruecksetzen der Tasten
     */
    exitInterior(player, camera, inputSystem) {
        if (this.scene === 'overworld') {
            return;
        }

        const exitedType = this.scene;

        // Menu im Interior schliessen
        const interior = this.activeInterior;
        if (interior) {
            interior.menuOpen = false;
        }

        // Overworld-Zustand wiederherstellen
        if (this.overworldReturnState) {
            player.x = this.overworldReturnState.position.x;
            player.y = this.overworldReturnState.position.y;
            camera.x = this.overworldReturnState.camera.x;
            camera.y = this.overworldReturnState.camera.y;
        }

        // Szene zuruecksetzen
        this.scene = 'overworld';
        this.activeInterior = null;
        this.overworldReturnState = null;

        // Spieler-Zustand zuruecksetzen
        player.moving = false;
        player.animationPhase = 0;

        // Input zuruecksetzen
        if (inputSystem) {
            this._resetInput(inputSystem);
        }

        eventBus.emit('interior:exit', { type: exitedType });
    }

    /**
     * Setzt alle Input-Keys zurueck.
     * @param {object} inputSystem
     * @private
     */
    _resetInput(inputSystem) {
        if (inputSystem.keys) {
            for (const key of Object.keys(inputSystem.keys)) {
                inputSystem.keys[key] = false;
            }
        }
    }
}




// ═══════════════════════════════════════════════════════
// js/interiors/WeaponShop.js
// ═══════════════════════════════════════════════════════
/**
 * WeaponShop - Interior fuer den Waffenladen (Ammu-Nation).
 *
 * Portiert aus gta_old/overworld/js/overworld.js:
 *   createWeaponShopInterior()    Zeilen 2037-2129
 *   handleWeaponShopMovement()    Zeilen 2130-2183
 *   updateWeaponShopState()       Zeilen 2211-2243
 *
 * SSOT: Alle Waffenladen-Logik hier zentralisiert.
 */

/** Standard-Waffenreihenfolge */
const DEFAULT_WEAPON_ORDER = ["pistol", "smg", "assaultRifle", "shotgun", "sniperRifle", "lmg"];

/** Interior-Abmessungen */
const INTERIOR_WIDTH = 720;
const INTERIOR_HEIGHT = 420;
const INTERIOR_MARGIN = 36;
const COUNTER_HEIGHT = 72;
const PLAYER_RADIUS = 14;

class WeaponShop {

    /**
     * @param {object} [config={}]
     * @param {Array<string>} [config.weaponOrder] - Waffenreihenfolge
     */
    constructor(config = {}) {
        this.weaponOrder = config.weaponOrder ?? DEFAULT_WEAPON_ORDER;
    }

    /**
     * Erstellt das Interior-Layout fuer den Waffenladen.
     *
     * @returns {object} Interior-Datenobjekt
     */
    createLayout() {
        const width = INTERIOR_WIDTH;
        const height = INTERIOR_HEIGHT;
        const margin = INTERIOR_MARGIN;
        const counterHeight = COUNTER_HEIGHT;

        const counter = {
            x: margin,
            y: 174,
            width: width - margin * 2,
            height: counterHeight,
        };

        const vendor = {
            x: counter.x + counter.width / 2,
            y: counter.y - 26,
            interactionRadius: 140,
            parts: buildHumanoidParts({
                head: '#f0c1a1',
                torso: '#1f2d3d',
                limbs: '#131b24',
                accent: '#3d5a80',
                hair: '#2b2118',
                eyes: '#ffffff',
                pupil: '#0b132b',
            }),
            animationPhase: 0,
            moving: false,
        };

        const showcaseGap = 18;
        const showcaseHeight = 88;
        const showcaseCount = Math.max(1, this.weaponOrder.length);
        const availableWidth = counter.width - 48;
        const showcaseWidth = Math.min(
            200,
            (availableWidth - showcaseGap * (showcaseCount - 1)) / showcaseCount
        );
        const showcaseY = Math.max(margin + 24, counter.y - showcaseHeight - 32);

        const showcases = [];
        let showcaseX = counter.x + 24;
        for (const weaponId of this.weaponOrder) {
            showcases.push({
                id: `showcase_${weaponId}`,
                weaponId,
                x: showcaseX,
                y: showcaseY,
                width: showcaseWidth,
                height: showcaseHeight,
            });
            showcaseX += showcaseWidth + showcaseGap;
        }

        const cabinets = [
            { id: 'cabinet_left', x: counter.x - 18, y: counter.y - 20, width: 18, height: counterHeight + 56 },
            { id: 'cabinet_right', x: counter.x + counter.width, y: counter.y - 20, width: 18, height: counterHeight + 56 },
        ];

        const serviceMat = {
            x: counter.x + counter.width / 2 - 120,
            y: counter.y + counter.height - 12,
            width: 240,
            height: 16,
        };

        const obstacles = [counter, ...cabinets];

        return {
            width,
            height,
            margin,
            entry: { x: width / 2, y: height - margin - 60 },
            exitZone: {
                x: width / 2 - 80,
                y: height - margin - 24,
                width: 160,
                height: 36,
            },
            counter,
            vendor,
            showcases,
            cabinets,
            serviceMat,
            obstacles,
            playerRadius: PLAYER_RADIUS,
            playerNearVendor: false,
            playerNearExit: false,
            menuOpen: false,
            menuSelection: 0,
            menuOptions: this.weaponOrder.slice(),
            messageText: null,
            messageTimer: 0,
        };
    }

    /**
     * Aktualisiert die Spieler-Bewegung im Waffenladen.
     * Portiert aus handleWeaponShopMovement() Zeilen 2130-2183.
     *
     * @param {object} interior - Interior-Datenobjekt (von createLayout())
     * @param {object} player - Spieler-Entity
     * @param {object} inputSystem - InputSystem
     * @param {number} deltaTime - Zeit seit letztem Frame in Sekunden
     */
    handleMovement(interior, player, inputSystem, deltaTime) {
        if (!interior) {
            return;
        }

        if (interior.menuOpen) {
            player.moving = false;
            player.speed = 0;
            player.trySprintAndUpdateStamina(false, false, deltaTime);
            return;
        }

        const { dx, dy } = inputSystem.getMovementVector();
        const isMoving = dx !== 0 || dy !== 0;
        const sprinting = player.trySprintAndUpdateStamina(inputSystem.isSprinting(), isMoving, deltaTime);
        const baseSpeed = player.baseSpeed * 0.9;
        const speed = sprinting ? baseSpeed * 1.4 : baseSpeed;

        player.speed = speed;

        const scaledDx = dx * speed;
        const scaledDy = dy * speed;

        const radius = interior.playerRadius ?? PLAYER_RADIUS;
        const margin = interior.margin ?? INTERIOR_MARGIN;

        if (scaledDx !== 0) {
            const candidateX = Math.max(
                radius + margin,
                Math.min(player.x + scaledDx, interior.width - radius - margin)
            );
            if (!WeaponShop._circleHitsAnyObstacle(candidateX, player.y, radius, interior.obstacles)) {
                player.x = candidateX;
            }
        }

        if (scaledDy !== 0) {
            const candidateY = Math.max(
                radius + margin,
                Math.min(player.y + scaledDy, interior.height - radius - margin)
            );
            if (!WeaponShop._circleHitsAnyObstacle(player.x, candidateY, radius, interior.obstacles)) {
                player.y = candidateY;
            }
        }

        player.moving = dx !== 0 || dy !== 0;
    }

    /**
     * Aktualisiert den Waffenladen-Zustand (Naehe zum Verkaeufer, Ausgang, etc.).
     * Portiert aus updateWeaponShopState() Zeilen 2211-2243.
     *
     * @param {object} interior - Interior-Datenobjekt
     * @param {object} player - Spieler-Entity
     */
    updateState(interior, player) {
        if (!interior) {
            return;
        }

        interior.playerNearVendor = false;
        const radius = interior.playerRadius ?? PLAYER_RADIUS;
        const vendor = interior.vendor;

        if (vendor) {
            const vendorRadius = vendor.interactionRadius ?? 100;
            const distance = Math.hypot(player.x - vendor.x, player.y - vendor.y);
            interior.playerNearVendor = distance <= vendorRadius;

            if (interior.menuOpen && !interior.playerNearVendor) {
                interior.menuOpen = false;
            }
        } else {
            interior.menuOpen = false;
        }

        interior.playerNearExit = circleIntersectsRect(
            player.x, player.y, radius,
            interior.exitZone.x, interior.exitZone.y,
            interior.exitZone.width, interior.exitZone.height
        );

        if (interior.messageTimer > 0) {
            interior.messageTimer -= 1;
            if (interior.messageTimer <= 0) {
                interior.messageText = null;
            }
        }
    }

    /**
     * Verarbeitet Interaktionen im Waffenladen (Menu oeffnen/schliessen).
     *
     * @param {object} interior - Interior-Datenobjekt
     * @param {object} inputSystem - InputSystem
     * @returns {{ action: string, data?: any }|null} Aktion oder null
     */
    handleInteraction(interior, inputSystem) {
        if (!interior) {
            return null;
        }

        // E-Taste fuer Interaktion
        if (inputSystem.isKeyPressed('e')) {
            if (interior.playerNearExit) {
                return { action: 'exit' };
            }

            if (interior.playerNearVendor && !interior.menuOpen) {
                interior.menuOpen = true;
                interior.menuSelection = 0;
                return { action: 'menuOpen' };
            }
        }

        // Menu-Navigation
        if (interior.menuOpen) {
            if (inputSystem.isKeyPressed('escape') || inputSystem.isKeyPressed('q')) {
                interior.menuOpen = false;
                return { action: 'menuClose' };
            }

            if (inputSystem.isKeyPressed('arrowup') || inputSystem.isKeyPressed('w')) {
                interior.menuSelection = Math.max(0, interior.menuSelection - 1);
                return { action: 'menuNavigate', data: interior.menuSelection };
            }

            if (inputSystem.isKeyPressed('arrowdown') || inputSystem.isKeyPressed('s')) {
                interior.menuSelection = Math.min(
                    interior.menuOptions.length - 1,
                    interior.menuSelection + 1
                );
                return { action: 'menuNavigate', data: interior.menuSelection };
            }

            if (inputSystem.isKeyPressed('enter') || inputSystem.isKeyPressed(' ')) {
                const selectedWeapon = interior.menuOptions[interior.menuSelection];
                return { action: 'purchase', data: selectedWeapon };
            }
        }

        return null;
    }

    // -----------------------------------------------------------------------
    // Private Hilfsmethoden
    // -----------------------------------------------------------------------

    /**
     * Prueft ob ein Kreis ein Hindernis trifft.
     * @private
     */
    static _circleHitsAnyObstacle(x, y, radius, obstacles) {
        if (!Array.isArray(obstacles)) {
            return false;
        }

        for (const obstacle of obstacles) {
            if (circleIntersectsRect(x, y, radius, obstacle.x, obstacle.y, obstacle.width, obstacle.height)) {
                return true;
            }
        }

        return false;
    }
}




// ═══════════════════════════════════════════════════════
// js/interiors/Casino.js
// ═══════════════════════════════════════════════════════
/**
 * Casino - Logik fuer den Starlight Casino Tower.
 *
 * Portiert aus gta_old/overworld/js/overworld.js:
 *   convertDollarsToCredits()    Zeilen 2708-2726
 *   convertCreditsToDollars()    Zeilen 2728-2746
 *   loadCasinoCredits()          Zeilen 2657-2678
 *   storeCasinoCredits()         Zeilen 2681-2694
 *   refreshCasinoCreditsCache()  Zeilen 2696-2705
 *   handleCasinoEntry()          Zeilen 743-749
 *   Casino-UI-Logik              Zeilen 751-920
 *
 * SSOT: Alle Casino-Konvertierungs- und Credits-Logik hier zentralisiert.
 */

/** Standard-Wechselkurs: 1 Dollar = N Credits */
const DEFAULT_CREDIT_RATE = 10;

/** LocalStorage-Key fuer Credits */
const CREDITS_STORAGE_KEY = "casinoCredits";

class Casino {

    /**
     * @param {object} [config={}]
     * @param {number} [config.creditRate=10] - Wechselkurs Dollar -> Credits
     */
    constructor(config = {}) {
        this.creditRate = config.creditRate ?? DEFAULT_CREDIT_RATE;
    }

    // -----------------------------------------------------------------------
    // Credits-Persistenz (LocalStorage)
    // -----------------------------------------------------------------------

    /**
     * Laedt Casino-Credits aus dem LocalStorage.
     *
     * @param {number} [fallback=0] - Rueckgabewert wenn nichts gespeichert
     * @returns {number}
     */
    loadCredits(fallback = 0) {
        if (typeof window === "undefined" || !window.localStorage) {
            return Math.max(0, fallback);
        }

        try {
            const raw = window.localStorage.getItem(CREDITS_STORAGE_KEY);
            if (raw == null) {
                return Math.max(0, fallback);
            }

            const parsed = parseInt(raw, 10);
            if (!Number.isFinite(parsed) || parsed < 0) {
                return 0;
            }

            return parsed;
        } catch (err) {
            console.warn("Casino credits konnten nicht geladen werden:", err);
            return Math.max(0, fallback);
        }
    }

    /**
     * Speichert Casino-Credits im LocalStorage.
     *
     * @param {number} amount
     * @returns {number} Gespeicherter Wert
     */
    storeCredits(amount) {
        const value = Math.max(0, Math.floor(Number(amount) || 0));

        if (typeof window !== "undefined" && window.localStorage) {
            try {
                window.localStorage.setItem(CREDITS_STORAGE_KEY, String(value));
            } catch (err) {
                console.warn("Casino credits konnten nicht gespeichert werden:", err);
            }
        }

        return value;
    }

    // -----------------------------------------------------------------------
    // Konvertierung
    // -----------------------------------------------------------------------

    /**
     * Konvertiert Dollars zu Casino-Credits.
     * Portiert aus convertDollarsToCredits() Zeilen 2708-2726.
     *
     * @param {object} player - Spieler-Entity (braucht player.money)
     * @param {number} [amount] - Betrag in Dollar (Standard: alles)
     * @returns {{ success: boolean, reason?: string, dollarsSpent: number, creditsAdded: number, totalCredits: number }}
     */
    convertDollarsToCredits(player, amount) {
        const rate = this.creditRate;
        const availableDollars = amount !== undefined
            ? Math.floor(Math.max(0, Math.min(Number(amount), Number(player.money ?? 0))))
            : Math.floor(Math.max(0, Number(player.money ?? 0)));

        if (!(availableDollars > 0)) {
            return {
                success: false,
                reason: "noMoney",
                dollarsSpent: 0,
                creditsAdded: 0,
                totalCredits: this.loadCredits(player.casinoCredits ?? 0),
            };
        }

        const creditsAdded = availableDollars * rate;
        const currentCredits = this.loadCredits(player.casinoCredits ?? 0);
        const newTotal = currentCredits + creditsAdded;

        player.money = Math.max(0, (player.money ?? 0) - availableDollars);
        this.storeCredits(newTotal);
        player.casinoCredits = newTotal;

        return {
            success: true,
            dollarsSpent: availableDollars,
            creditsAdded,
            totalCredits: newTotal,
        };
    }

    /**
     * Konvertiert Casino-Credits zurueck zu Dollars.
     * Portiert aus convertCreditsToDollars() Zeilen 2728-2746.
     *
     * @param {object} player - Spieler-Entity (braucht player.money, player.casinoCredits)
     * @param {number} [amount] - Credits zum Umtauschen (Standard: alle)
     * @returns {{ success: boolean, reason?: string, creditsSpent: number, dollarsGained: number, totalCredits: number }}
     */
    convertCreditsToDollars(player, amount) {
        const rate = this.creditRate;
        const currentCredits = this.loadCredits(player.casinoCredits ?? 0);

        const maxCredits = amount !== undefined
            ? Math.floor(Math.max(0, Math.min(Number(amount), currentCredits)))
            : currentCredits;

        const availableCredits = Math.floor(Math.max(0, Number(maxCredits)));

        if (availableCredits < rate) {
            return {
                success: false,
                reason: "noCredits",
                creditsSpent: 0,
                dollarsGained: 0,
                totalCredits: availableCredits,
            };
        }

        const dollarsGained = Math.floor(availableCredits / rate);
        const creditsSpent = dollarsGained * rate;
        const newTotal = currentCredits - creditsSpent;

        this.storeCredits(newTotal);
        player.money = (player.money ?? 0) + dollarsGained;
        player.casinoCredits = newTotal;

        return {
            success: true,
            creditsSpent,
            dollarsGained,
            totalCredits: newTotal,
        };
    }

    // -----------------------------------------------------------------------
    // Hilfsfunktionen
    // -----------------------------------------------------------------------

    /**
     * Aktualisiert den Credits-Cache des Spielers aus dem LocalStorage.
     *
     * @param {object} player
     */
    refreshCreditsCache(player) {
        player.casinoCredits = this.loadCredits(player.casinoCredits ?? 0);
    }

    /**
     * Gibt den Casino-Eingangs-URL zurueck (fuer Navigation zum Casino-Spiel).
     *
     * @returns {string}
     */
    getCasinoGameUrl() {
        return "../casinogame/index.html";
    }

    /**
     * Formatiert einen Geldbetrag fuer die Anzeige.
     *
     * @param {number} dollars
     * @returns {string}
     */
    formatMoney(dollars) {
        const value = Math.floor(Math.max(0, Number(dollars) || 0));
        return value.toLocaleString("de-DE") + "$";
    }

    /**
     * Formatiert Credits fuer die Anzeige.
     *
     * @param {number} credits
     * @returns {string}
     */
    formatCredits(credits) {
        const value = Math.floor(Math.max(0, Number(credits) || 0));
        return value.toLocaleString("de-DE");
    }

    /**
     * Berechnet den Info-Text fuer die Casino-Interaktion.
     *
     * @param {object} player
     * @returns {string}
     */
    getInteractionMessage(player) {
        const rate = this.creditRate;
        const moneyText = this.formatMoney(player.money ?? 0);
        const creditText = this.formatCredits(player.casinoCredits ?? 0) + " Credits";
        return `Kurs 1$ = ${rate} Credits | Bargeld: ${moneyText} | Credits: ${creditText}`;
    }

    /**
     * Berechnet ob Kauf/Auszahlung moeglich ist.
     *
     * @param {object} player
     * @returns {{ canBuy: boolean, canCashOut: boolean, dollarsAvailable: number, creditsAvailable: number }}
     */
    getButtonState(player) {
        const rate = this.creditRate;
        const dollarsAvailable = Math.floor(Math.max(0, Number(player.money ?? 0)));
        const creditsAvailable = Math.floor(Math.max(0, Number(player.casinoCredits ?? 0)));

        return {
            canBuy: dollarsAvailable > 0,
            canCashOut: creditsAvailable >= rate,
            dollarsAvailable,
            creditsAvailable,
        };
    }
}




// ═══════════════════════════════════════════════════════
// js/core/Game.js
// ═══════════════════════════════════════════════════════
/**
 * Game - Hauptklasse die alle Module zusammensteckt und die Game-Loop steuert.
 *
 * SSOT: Game.js ist der einzige Ort der Module instanziiert und verbindet.
 * Keine Logik wird hier dupliziert - alles wird an die spezialisierten
 * Systeme und Renderer delegiert.
 */

// ---------------------------------------------------------------------------
// Welt-Konstanten (SSOT)
// ---------------------------------------------------------------------------
const WORLD_WIDTH = 3600;
const WORLD_HEIGHT = 2800;
const ROAD_WIDTH = 70;
const ROAD_HALF_WIDTH = 35;
const SIDEWALK_WIDTH = 36;
const CAMERA_ZOOM = 2;

// ---------------------------------------------------------------------------
// Animations-Konstanten
// ---------------------------------------------------------------------------
const WALK_ANIM_SPEED = 0.1;
const SPRINT_ANIM_SPEED = 0.14;

class Game {
    /**
     * @param {HTMLCanvasElement} canvas
     */
    constructor(canvas) {
        // ── Basis ────────────────────────────────────────────────────────
        this.canvas = canvas;
        this.eventBus = eventBus;

        // ── Renderer ─────────────────────────────────────────────────────
        this.renderer = new Renderer(canvas);
        this.renderer.resizeCanvas();

        // ── Waffen-Katalog ───────────────────────────────────────────────
        this.weaponCatalog = createWeaponCatalog();

        // ── Haus-Stile ───────────────────────────────────────────────────
        this.houseStyles = createHouseStyles();

        // ── Strassen-Infrastruktur ───────────────────────────────────────
        const roadLayout = RoadNetwork.createCityRoadLayout();
        const crosswalks = RoadNetwork.createCrosswalks();

        // Crosswalk-Areas fuer Vehicle-Yield berechnen
        const crosswalkAreas = crosswalks.map((cw, index) => {
            const half = (cw.span ?? 0) / 2;
            if (cw.orientation === 'horizontal') {
                return {
                    id: index,
                    orientation: 'horizontal',
                    left: cw.x - half,
                    right: cw.x + half,
                    top: cw.y - ROAD_HALF_WIDTH,
                    bottom: cw.y + ROAD_HALF_WIDTH,
                };
            }
            return {
                id: index,
                orientation: 'vertical',
                left: cw.x - ROAD_HALF_WIDTH,
                right: cw.x + ROAD_HALF_WIDTH,
                top: cw.y - half,
                bottom: cw.y + half,
            };
        });

        // ── Welt generieren ──────────────────────────────────────────────
        const worldGenerator = new WorldGenerator({
            houseStyles: this.houseStyles,
            sidewalkWidth: SIDEWALK_WIDTH,
        });

        const worldData = worldGenerator.generateWorld({ crosswalks });
        this.buildings = worldData.buildings;
        this.streetDetails = worldData.streetDetails;

        // ── Road-Network aufbauen ────────────────────────────────────────
        const sidewalkCorridors = RoadNetwork.createSidewalkCorridors(
            roadLayout, crosswalkAreas,
            { sidewalkWidth: SIDEWALK_WIDTH, roadHalfWidth: ROAD_HALF_WIDTH }
        );

        // Haus-Walkway-Korridore hinzufuegen
        const houseWalkwayCorridors = RoadNetwork.createHouseWalkwayCorridors(this.buildings);
        const allCorridors = [...sidewalkCorridors, ...houseWalkwayCorridors];

        const walkableAreas = RoadNetwork.computeWalkableAreas(allCorridors);
        const roadAreas = RoadNetwork.createRoadAreas(roadLayout, { roadHalfWidth: ROAD_HALF_WIDTH });
        const sidewalkObstacles = RoadNetwork.createSidewalkObstacles(this.buildings, { sidewalkWidth: SIDEWALK_WIDTH });

        this.roadNetwork = new RoadNetwork({
            sidewalkCorridors: allCorridors,
            crosswalks,
            walkableAreas,
            sidewalkObstacles,
            roadAreas,
        });

        // crosswalkAreas am RoadNetwork verfuegbar machen (fuer VehicleSystem)
        this.roadNetwork.crosswalkAreas = crosswalkAreas;

        // Strassenlayout fuer Rendering speichern
        this.roadLayout = roadLayout;
        this.crosswalks = crosswalks;

        // ── Collision-System ─────────────────────────────────────────────
        const buildingColliders = createBuildingColliders(this.buildings);
        // CollisionSystem erwartet Gebaeude-Objekte (nicht Collider-Rects),
        // da es intern _getCollisionRects() nutzt
        this.collisionSystem = new CollisionSystem(this.buildings, []);

        // ── Entity-Mover (SSOT fuer alle Positionsaenderungen) ───────────
        this.entityMover = new EntityMover(this.collisionSystem, this.roadNetwork);
        this.entityMover.setWorldBounds(WORLD_WIDTH, WORLD_HEIGHT);

        // ── Persistence laden ────────────────────────────────────────────
        const weaponInventory = loadWeaponInventory();
        const weaponLoadout = loadWeaponLoadout(weaponInventory);
        const currentWeaponId = loadCurrentWeaponId(weaponInventory, weaponLoadout);
        const playerMoney = loadPlayerMoney();
        const casinoCredits = loadCasinoCredits();
        const ownedProperties = loadOwnedProperties();
        const homePropertyId = loadHomeProperty();
        const rentedPropertyId = loadRentedProperty();

        // ── Spieler ──────────────────────────────────────────────────────
        const returnPos = loadReturnPosition();
        this.player = new Player({
            x: returnPos ? returnPos.px : 400,
            y: returnPos ? returnPos.py : 300,
            money: playerMoney,
            casinoCredits,
            currentWeaponId,
            weaponInventory,
            weaponLoadout,
            ownedProperties,
            homePropertyId,
            rentedPropertyId,
        });

        // ── NPCs und Fahrzeuge ───────────────────────────────────────────
        this.npcs = worldData.dynamicAgents.npcs;
        this.vehicles = worldData.dynamicAgents.vehicles;

        // ── Systeme ──────────────────────────────────────────────────────
        this.inputSystem = new InputSystem(canvas);
        this.movementSystem = new MovementSystem(this.entityMover);
        this.aiSystem = new AISystem(this.entityMover, this.roadNetwork, eventBus, {
            collisionSystem: this.collisionSystem,
            buildings: this.buildings,
        });
        this.vehicleSystem = new VehicleSystem(this.entityMover, this.collisionSystem, this.roadNetwork);
        this.combatSystem = new CombatSystem(eventBus, this.weaponCatalog);
        this.policeSystem = new PoliceSystem(eventBus, this.entityMover, this.weaponCatalog);
        this.combatSystem.setPoliceOfficers(this.policeSystem.officers);
        this.cameraSystem = new CameraSystem(this.renderer.width, this.renderer.height, CAMERA_ZOOM);
        this.cameraSystem.oceanOverflow = WorldRenderer.OCEAN_WIDTH;
        if (returnPos) {
            this.cameraSystem.x = returnPos.cx || 0;
            this.cameraSystem.y = returnPos.cy || 0;
        }
        this.dayNightSystem = new DayNightSystem();

        // ── Interiors ────────────────────────────────────────────────────
        this.interiorManager = new InteriorManager();
        this.weaponShop = new WeaponShop({ weaponOrder: [...WEAPON_ORDER] });
        this.casino = new Casino();

        // ── Immobilien-System ──────────────────────────────────────────────
        this.realEstateSystem = new RealEstateSystem(eventBus);

        // ── Interaction-System ───────────────────────────────────────────
        this.interactionSystem = new InteractionSystem(eventBus, this.interiorManager, this.buildings);
        this.interactionSystem.setCasino(this.casino);
        this.interactionSystem.setRealEstateSystem(this.realEstateSystem);

        // ── Renderer ─────────────────────────────────────────────────────
        this.worldRenderer = new WorldRenderer(this.renderer);
        this.buildingRenderer = new BuildingRenderer(this.renderer, this.worldRenderer);
        this.buildingRenderer.setHouseStyles(this.houseStyles);
        this.entityRenderer = new EntityRenderer(this.renderer);
        this.effectsRenderer = new EffectsRenderer(this.renderer);
        this.uiRenderer = new UIRenderer(this.renderer, {
            playerPosEl: document.getElementById('playerPos'),
            fpsEl: document.getElementById('fps'),
        });

        // ── Handy-UI ───────────────────────────────────────────────────────
        this.phoneUI = new PhoneUI();

        // ── Welt-Bounds ──────────────────────────────────────────────────
        this.worldBounds = { width: WORLD_WIDTH, height: WORLD_HEIGHT };

        // ── Wasted-Zustand ─────────────────────────────────────────────────
        this.wastedState = null; // null oder { reason: 'arrested'|'killed' }
        this._wastedButtonRect = null;

        // ── Game-Loop Timing ─────────────────────────────────────────────
        this._lastTimestamp = 0;
        this._frameCount = 0;
        this._fpsTime = 0;
        this._fps = 60;

        // ── Events verbinden ─────────────────────────────────────────────
        this._bindEvents();
        this._bindInteractionUI();
    }

    // =====================================================================
    //  Event-Bindings
    // =====================================================================

    _bindEvents() {
        // Canvas-Resize
        window.addEventListener('resize', () => {
            this.renderer.resizeCanvas();
            this.cameraSystem.width = this.renderer.width;
            this.cameraSystem.height = this.renderer.height;
        });

        // Weapon-Shop Eintritt
        this.eventBus.on('interaction:enterWeaponShop', (data) => {
            const layout = this.weaponShop.createLayout();
            this.interiorManager.enterInterior(
                'weaponShop', layout, this.player, this.cameraSystem,
                this.inputSystem, this.renderer.width, this.renderer.height
            );
        });

        // Casino Eintritt (navigiert zur Casino-Seite)
        this.eventBus.on('interaction:enterCasino', (data) => {
            persistPlayerMoney(this.player.money);
            saveReturnPosition(
                this.player.x, this.player.y,
                this.cameraSystem.x, this.cameraSystem.y
            );
            const url = this.casino.getCasinoGameUrl();
            window.location.href = url;
        });

        // Enter-Button Click (delegiert an InteractionSystem.performEntry)
        this.eventBus.on('interaction:enterButtonClicked', (data) => {
            this.interactionSystem.performEntry(data.building, this.player);
        });

        // Casino Credits kaufen/auszahlen
        this.eventBus.on('interaction:buyCasinoCredits', () => {
            this.interactionSystem.handleBuyCasinoCredits(this.player);
            this._persistState();
        });

        this.eventBus.on('interaction:cashOutCasinoCredits', () => {
            this.interactionSystem.handleCashOutCasinoCredits(this.player);
            this._persistState();
        });

        // Unterkunft mieten/kuendigen
        this.eventBus.on('interaction:rentProperty', () => {
            this.interactionSystem.handleRentProperty(this.player);
            this._persistState();
        });

        this.eventBus.on('interaction:cancelRental', () => {
            this.interactionSystem.handleCancelRental(this.player);
            this._persistState();
        });

        // Immobilie kaufen/verkaufen (Makler)
        this.eventBus.on('interaction:buyProperty', () => {
            this.interactionSystem.handleBuyProperty(this.player);
            this._persistState();
        });

        this.eventBus.on('interaction:sellProperty', () => {
            this.interactionSystem.handleSellProperty(this.player);
            this._persistState();
        });

        this.eventBus.on('interaction:moveIn', () => {
            this.interactionSystem.handleMoveIn(this.player);
            this._persistState();
        });

        // Interior verlassen
        this.eventBus.on('interior:exit', () => {
            this._persistState();
        });

        // NPC getoetet -> Geld droppen + Polizei rufen
        this.eventBus.on('npc:killed', (data) => {
            const drop = 10 + Math.floor(Math.random() * 40);
            this.player.money += drop;
            this.policeSystem.setWanted(performance.now());
        });

        // Polizist getroffen -> Polizei schiesst zurueck
        this.eventBus.on('police:hit', () => {
            this.policeSystem.onPoliceShot(performance.now());
        });

        // Wasted-Respawn per Mausklick
        this.canvas.addEventListener('click', (e) => {
            if (!this.wastedState || !this._wastedButtonRect) return;
            const rect = this.canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            const btn = this._wastedButtonRect;
            if (mx >= btn.x && mx <= btn.x + btn.w && my >= btn.y && my <= btn.y + btn.h) {
                this._respawnPlayer();
            }
        });
    }

    /**
     * Verbindet die Interaktions-UI mit dem InteractionSystem.
     */
    _bindInteractionUI() {
        const container = document.getElementById('buildingInteraction');
        const nameEl = document.getElementById('buildingName');
        const messageEl = document.getElementById('buildingMessage');
        const enterButton = document.getElementById('enterBuilding');
        const cancelButton = document.getElementById('cancelInteraction');
        const buyCredits = document.getElementById('buyCasinoCredits');
        const cashOut = document.getElementById('cashOutCasinoCredits');
        const rentProperty = document.getElementById('rentProperty');
        const cancelRental = document.getElementById('cancelRental');
        const buyProperty = document.getElementById('buyProperty');
        const sellProperty = document.getElementById('sellProperty');
        const moveInButton = document.getElementById('moveInProperty');

        if (container) {
            this.interactionSystem.initUI({
                container,
                nameEl,
                messageEl,
                enterButton,
                buyCredits,
                cashOut,
                rentProperty,
                cancelRental,
                buyProperty,
                sellProperty,
                moveInButton,
            });

            // Cancel-Button
            if (cancelButton) {
                cancelButton.addEventListener('click', () => {
                    this.interactionSystem.hideInteractionUI();
                });
            }
        }
    }

    // =====================================================================
    //  Respawn
    // =====================================================================

    _respawnPlayer() {
        // Strafe abziehen: 250$ bei Verhaftung, 500$ bei Tod
        const fine = this.wastedState?.reason === 'killed' ? 500 : 250;
        this.player.money = Math.max(0, this.player.money - fine);

        this.wastedState = null;
        this._wastedButtonRect = null;

        // Respawn-Position: Wohnsitz oder Polizeistation
        let respawnX = POLICE_STATION_POS.x;
        let respawnY = POLICE_STATION_POS.y;

        if (this.player.homePropertyId) {
            const homeBuilding = this.buildings.find(
                (b) => b && b.id === this.player.homePropertyId
            );
            if (homeBuilding) {
                respawnX = homeBuilding.x + homeBuilding.width / 2;
                respawnY = homeBuilding.y + homeBuilding.height + 30;
            }
        }

        this.entityMover.teleport(this.player, respawnX, respawnY);
        this.player.health = this.player.maxHealth;
        this.player.stunTimer = 0;
        this.player.slowTimer = 0;

        this.cameraSystem.x = respawnX - this.renderer.width / (2 * CAMERA_ZOOM);
        this.cameraSystem.y = respawnY - this.renderer.height / (2 * CAMERA_ZOOM);

        this.policeSystem.reset();
        this.combatSystem.setPoliceOfficers(this.policeSystem.officers);
        this.combatSystem.clearBloodDecals();

        // Tote NPCs wiederbeleben
        for (const npc of this.npcs) {
            if (npc && npc.dead) {
                npc.revive();
                npc.panicTimer = 0;
            }
        }
    }

    // =====================================================================
    //  Persistence
    // =====================================================================

    _persistState() {
        persistWeaponInventory(this.player.weaponInventory);
        persistWeaponLoadout(this.player.weaponLoadout, this.player.weaponInventory);
        persistCurrentWeaponId(this.player.currentWeaponId, this.player.weaponInventory);
        persistPlayerMoney(this.player.money);
        persistOwnedProperties(this.player.ownedProperties);
        persistHomeProperty(this.player.homePropertyId);
        persistRentedProperty(this.player.rentedPropertyId);
    }

    // =====================================================================
    //  Update
    // =====================================================================

    /**
     * @param {number} deltaTime - Zeit seit letztem Frame in Sekunden
     * @param {number} now - performance.now() Zeitstempel
     */
    update(deltaTime, now) {
        // Wasted-Zustand: kein Gameplay-Update
        if (this.wastedState) return;

        const scene = this.interiorManager.scene;

        if (scene === 'overworld') {
            this._updateOverworld(deltaTime, now);
        } else if (scene === 'weaponShop') {
            this._updateWeaponShop(deltaTime, now);
        }

        // Input-Flags am Frame-Ende zuruecksetzen
        this.inputSystem.update();
    }

    /**
     * Overworld-Update
     * @param {number} deltaTime
     * @param {number} now
     */
    _updateOverworld(deltaTime, now) {
        const player = this.player;
        const deltaMs = deltaTime * 1000;

        // Maus-Weltposition aktualisieren
        this.inputSystem.updateMouseWorldPosition(this.cameraSystem);

        // Stun/Slow-Timer aktualisieren
        if (player.stunTimer > 0) {
            player.stunTimer = Math.max(0, player.stunTimer - deltaMs);
            if (player.stunTimer === 0 && player.slowTimer > 0) {
                // Slow startet erst nach Stun
            }
        } else if (player.slowTimer > 0) {
            player.slowTimer = Math.max(0, player.slowTimer - deltaMs);
        }

        // Spieler-Bewegung (blockiert bei Stun)
        const isStunned = player.stunTimer > 0;
        const isSlowed = player.slowTimer > 0;

        const { dx, dy } = this.inputSystem.getMovementVector();
        const isMoving = dx !== 0 || dy !== 0;
        const sprinting = player.trySprintAndUpdateStamina(this.inputSystem.isSprinting(), isMoving, deltaTime);

        let speed = sprinting ? player.baseSpeed * player.sprintMultiplier : player.baseSpeed;

        if (isSlowed) {
            speed *= SLOW_FACTOR;
        }

        if (!isStunned && (dx !== 0 || dy !== 0)) {
            const targetX = player.x + dx * speed;
            const targetY = player.y + dy * speed;
            this.entityMover.move(player, targetX, targetY);
            player.moving = true;
        } else {
            player.moving = false;
        }

        // KI-System (NPC-Bewegung, Panik, Stuck-Detection)
        this.aiSystem.update(this.npcs, player, deltaTime);

        // Fahrzeug-System
        this.vehicleSystem.update(this.vehicles, this.npcs, deltaTime);

        // Fahrzeug-Collider aktualisieren
        this.collisionSystem.updateVehicleColliders(this.vehicles);

        // Handy togglen (Q-Taste) — vor Combat, damit Klicks abgefangen werden
        if (this.inputSystem.isKeyPressed('q')) {
            this.phoneUI.toggle();
        }

        // Handy-Klick pruefen (konsumiert isFirePressed wenn auf Handy)
        const phoneConsumedClick = this.phoneUI.open && this.phoneUI._slideProgress > 0.9
            && this.phoneUI.isClickOnPhone(this.inputSystem.mouse.x, this.inputSystem.mouse.y);

        if (phoneConsumedClick) {
            // Klick ans Handy weiterleiten
            this.phoneUI.update(deltaTime, this.dayNightSystem, this.inputSystem.mouse, this.inputSystem.isFirePressed());
        } else {
            this.phoneUI.update(deltaTime, this.dayNightSystem, this.inputSystem.mouse, false);
        }

        // Kampf-System
        this.combatSystem.setPoliceOfficers(this.policeSystem.officers);
        this.combatSystem.update(player, this.npcs, deltaTime);

        // Schuss verarbeiten (blockiert bei Stun oder wenn Handy den Klick hat)
        if (!isStunned && !phoneConsumedClick) {
            const mouseWorld = this.inputSystem.getMouseWorldPosition();
            this.combatSystem.fireWeapon(
                player,
                mouseWorld,
                { justPressed: this.inputSystem.isFirePressed(), active: this.inputSystem.isFireDown() },
                now
            );
        }

        // Polizei-System
        const policeResult = this.policeSystem.update(player, deltaTime, now);
        if (policeResult.wasted) {
            this.wastedState = { reason: policeResult.reason ?? 'arrested' };
            return;
        }

        // Immobilien-System (passives Einkommen pro Ingame-Tag)
        this.realEstateSystem.update(player, this.buildings, deltaTime, this.dayNightSystem);

        // Interaktions-System (Gebaeude-Proximity)
        this.interactionSystem.update(player, this.inputSystem);

        // Waffenwechsel per Zahlentasten
        this._handleWeaponSwitch();

        // Taschenlampe togglen (F-Taste)
        if (this.inputSystem.isKeyPressed('f')) {
            player.flashlightOn = !player.flashlightOn;
        }

        // Kamera
        this.cameraSystem.update(player, this.worldBounds);

        // Tag/Nacht-Zyklus
        this.dayNightSystem.update(now);

        // Spieler-Animation
        if (player.moving) {
            const animSpeed = sprinting ? SPRINT_ANIM_SPEED : WALK_ANIM_SPEED;
            player.animationPhase = (player.animationPhase + speed * animSpeed) % (Math.PI * 2);
        } else {
            player.animationPhase *= 0.85;
        }
    }

    /**
     * Weapon-Shop-Update
     * @param {number} deltaTime
     * @param {number} now
     */
    _updateWeaponShop(deltaTime, now) {
        const interior = this.interiorManager.activeInterior;
        if (!interior) return;

        // Maus-Position aktualisieren (mit Interior-Offset)
        this.inputSystem.updateMouseWorldPosition(this.cameraSystem, {
            originX: interior.originX,
            originY: interior.originY,
        });

        // Bewegung (Stamina wird in handleMovement via Player.trySprintAndUpdateStamina aktualisiert)
        this.weaponShop.handleMovement(interior, this.player, this.inputSystem, deltaTime);

        // Zustand aktualisieren
        this.weaponShop.updateState(interior, this.player);

        // Interaktion
        const action = this.weaponShop.handleInteraction(interior, this.inputSystem);
        if (action) {
            this._handleWeaponShopAction(action, interior);
        }

        // Schuss im Weapon-Shop (zum Testen)
        const mouseWorld = this.inputSystem.getMouseWorldPosition();
        this.combatSystem.fireWeapon(
            this.player,
            mouseWorld,
            { justPressed: this.inputSystem.isFirePressed(), active: this.inputSystem.isFireDown() },
            now
        );

        // Projektile aktualisieren
        this.combatSystem.update(this.player, [], deltaTime);

        // Spieler-Animation
        if (this.player.moving) {
            this.player.animationPhase = (this.player.animationPhase + this.player.speed * WALK_ANIM_SPEED) % (Math.PI * 2);
        } else {
            this.player.animationPhase *= 0.85;
        }
    }

    /**
     * Verarbeitet Aktionen aus dem WeaponShop-Interaction-Handler.
     * @param {{ action: string, data?: any }} action
     * @param {object} interior
     */
    _handleWeaponShopAction(action, interior) {
        switch (action.action) {
            case 'exit':
                this.interiorManager.exitInterior(this.player, this.cameraSystem, this.inputSystem);
                break;

            case 'purchase': {
                const weaponId = action.data;
                const weapon = getWeaponDefinition(this.weaponCatalog, weaponId);
                if (!weapon) break;

                if (this.player.weaponInventory.has(weaponId)) {
                    interior.messageText = weapon.name + ' - bereits im Besitz!';
                    interior.messageTimer = 120;
                    break;
                }

                const price = weapon.price ?? 0;
                if (this.player.money < price) {
                    interior.messageText = 'Nicht genug Geld! (' + price + '$ benoetigt)';
                    interior.messageTimer = 120;
                    break;
                }

                this.player.money -= price;
                this.player.weaponInventory.add(weaponId);
                this.player.currentWeaponId = weaponId;

                // Loadout aktualisieren (in freien Slot oder ersetzen)
                if (this.player.weaponLoadout.length < 3 && !this.player.weaponLoadout.includes(weaponId)) {
                    this.player.weaponLoadout.push(weaponId);
                }

                interior.messageText = weapon.name + ' gekauft!';
                interior.messageTimer = 120;

                this._persistState();
                break;
            }
        }
    }

    /**
     * Verarbeitet Waffenwechsel per Zahlentasten.
     */
    _handleWeaponSwitch() {
        const ownedWeapons = WEAPON_ORDER.filter((id) => this.player.weaponInventory.has(id));

        for (let i = 0; i < ownedWeapons.length; i++) {
            const key = String(i + 1);
            if (this.inputSystem.isKeyPressed(key)) {
                this.player.currentWeaponId = ownedWeapons[i];
                persistCurrentWeaponId(this.player.currentWeaponId, this.player.weaponInventory);
                break;
            }
        }
    }

    // =====================================================================
    //  Render
    // =====================================================================

    render() {
        this.renderer.clear();

        const scene = this.interiorManager.scene;

        if (scene === 'overworld') {
            this._renderOverworld();
        } else if (scene === 'weaponShop') {
            this._renderWeaponShop();
        }
    }

    _renderOverworld() {
        const camera = this.cameraSystem;
        const ctx = this.renderer.getContext();

        this.renderer.save();
        ctx.scale(camera.zoom, camera.zoom);
        this.renderer.translate(-camera.x, -camera.y);

        // Welt
        this.worldRenderer.drawOcean(WORLD_HEIGHT);
        this.worldRenderer.drawGrass(WORLD_WIDTH, WORLD_HEIGHT);
        this.worldRenderer.drawRoads(this.roadLayout, this.crosswalks, ROAD_WIDTH, ROAD_HALF_WIDTH);
        this.worldRenderer.drawSidewalks(this.roadLayout, SIDEWALK_WIDTH, ROAD_WIDTH, ROAD_HALF_WIDTH);
        this.worldRenderer.drawStreetDetails(this.streetDetails);

        // Gebaeude
        this.buildingRenderer.drawBuildings(this.buildings);

        // Effekte (Blut)
        this.effectsRenderer.drawBloodDecals(this.combatSystem.bloodDecals);

        // Entities
        this.entityRenderer.drawVehicles(this.vehicles);
        this.entityRenderer.drawNPCs(this.npcs);

        // Polizisten
        this.entityRenderer.drawPoliceOfficers(
            this.policeSystem.officers,
            this.player,
            this.weaponCatalog
        );

        // Spieler
        const currentWeapon = getWeaponDefinition(this.weaponCatalog, this.player.currentWeaponId);
        this.entityRenderer.drawPlayer(
            this.player,
            currentWeapon,
            this.inputSystem.mouse,
            this.interactionSystem.nearBuilding
        );

        // Projektile (Overworld) - Spieler + Polizei
        this.effectsRenderer.drawProjectiles(this.combatSystem.projectiles, 'overworld');
        this.effectsRenderer.drawProjectiles(this.policeSystem.projectiles, 'overworld');

        // Tag/Nacht-Overlay
        const lighting = this.dayNightSystem.getCurrentLighting();
        const viewW = this.renderer.width / camera.zoom;
        const viewH = this.renderer.height / camera.zoom;

        // Taschenlampen sammeln
        const flashlights = [];
        const overlayAlpha = lighting ? lighting.overlayAlpha : 0;

        if (overlayAlpha > 0.3) {
            // Spieler-Taschenlampe
            if (this.player.flashlightOn) {
                const pc = this.player.getCenter();
                const mouse = this.inputSystem.getMouseWorldPosition();
                const angle = Math.atan2(mouse.y - pc.y, mouse.x - pc.x);
                flashlights.push({ x: pc.x, y: pc.y, angle, spread: 0.4, range: 250 });
            }

            // NPC-Taschenlampen (Richtung = Laufrichtung zum Waypoint)
            for (const npc of this.npcs) {
                if (npc.dead || npc.hidden || !npc.hasFlashlight || !npc.moving) continue;
                const wp = npc.getCurrentWaypoint();
                if (!wp) continue;
                const angle = Math.atan2(wp.y - npc.y, wp.x - npc.x);
                flashlights.push({
                    x: npc.x + (npc.width || 32) / 2,
                    y: npc.y + (npc.height || 32) / 2,
                    angle, spread: 0.35, range: 180
                });
            }
        }

        if (flashlights.length > 0 && overlayAlpha > 0.3) {
            // Nacht-Overlay mit Taschenlampen-Ausschnitten
            this.uiRenderer.drawDayNightOverlay(
                { ...lighting, overlayAlpha: 0, starAlpha: 0 },
                camera.x, camera.y, viewW, viewH,
                [], 0
            );
            this.uiRenderer.drawNightWithFlashlights(
                overlayAlpha, camera.x, camera.y, viewW, viewH, flashlights
            );
        } else {
            this.uiRenderer.drawDayNightOverlay(
                lighting,
                camera.x, camera.y, viewW, viewH,
                this.dayNightSystem.stars,
                this.dayNightSystem.starPhase
            );
        }

        this.renderer.restore();

        // HUD (Bildschirm-Koordinaten)
        this.uiRenderer.drawHUD(
            this.player,
            this._fps,
            this.weaponCatalog,
            this.player.weaponInventory,
            this.player.weaponLoadout,
            WEAPON_ORDER,
            this.player.money,
            this.player.casinoCredits,
            this.casino.creditRate,
            this.player.ownedProperties.size
        );

        // Handy-Overlay
        this.phoneUI.draw(
            this.renderer.getContext(),
            this.renderer.width,
            this.renderer.height,
            {
                dayNight: this.dayNightSystem,
                player: this.player,
                buildings: this.buildings,
                roadLayout: this.roadLayout,
                worldBounds: this.worldBounds,
            }
        );

        // Polizei-UI
        const now = performance.now();
        if (this.policeSystem.wanted) {
            this.uiRenderer.drawWantedIndicator(true, this.policeSystem.policeShootBack, now);
            this.uiRenderer.drawArrestProgress(this.policeSystem.getArrestProgress());
        }

        // Spieler-Gesundheit
        this.uiRenderer.drawPlayerHealth(this.player.health, this.player.maxHealth);

        // Stamina-Bar
        this.uiRenderer.drawStaminaBar(this.player.stamina);

        // Stun/Slow-Effekte
        this.uiRenderer.drawStunEffect(this.player.stunTimer, now);
        this.uiRenderer.drawSlowEffect(this.player.slowTimer);

        // Wasted-Screen
        if (this.wastedState) {
            const result = this.uiRenderer.drawWastedScreen(this.wastedState.reason);
            this._wastedButtonRect = result.buttonRect;
        }

        // Crosshair
        if (!this.wastedState) {
            this.uiRenderer.drawCrosshair(this.inputSystem.mouse);
        }
    }

    _renderWeaponShop() {
        const interior = this.interiorManager.activeInterior;
        if (!interior) return;

        const ctx = this.renderer.getContext();

        // Hintergrund
        ctx.fillStyle = '#1a1d23';
        ctx.fillRect(0, 0, this.renderer.width, this.renderer.height);

        ctx.save();
        ctx.translate(interior.originX, interior.originY);

        // Boden
        ctx.fillStyle = '#2a2d33';
        ctx.fillRect(0, 0, interior.width, interior.height);

        // Rand
        ctx.strokeStyle = '#4a4d53';
        ctx.lineWidth = 3;
        ctx.strokeRect(1, 1, interior.width - 2, interior.height - 2);

        // Theke
        const counter = interior.counter;
        ctx.fillStyle = '#3d3225';
        ctx.fillRect(counter.x, counter.y, counter.width, counter.height);
        ctx.strokeStyle = '#5a4b3a';
        ctx.lineWidth = 2;
        ctx.strokeRect(counter.x, counter.y, counter.width, counter.height);

        // Showcases
        for (const showcase of interior.showcases) {
            ctx.fillStyle = 'rgba(40, 50, 65, 0.85)';
            ctx.fillRect(showcase.x, showcase.y, showcase.width, showcase.height);
            ctx.strokeStyle = 'rgba(100, 130, 170, 0.5)';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(showcase.x, showcase.y, showcase.width, showcase.height);

            // Waffen-Silhouette
            const weapon = getWeaponDefinition(this.weaponCatalog, showcase.weaponId);
            if (weapon) {
                const owned = this.player.weaponInventory.has(showcase.weaponId);
                this.entityRenderer.drawWeaponSilhouette(
                    showcase.x + showcase.width / 2,
                    showcase.y + showcase.height / 2,
                    weapon,
                    { scale: 0.8, alpha: owned ? 1 : 0.5 }
                );

                // Preis / Besessen
                ctx.fillStyle = owned ? '#4CAF50' : '#ffd166';
                ctx.font = '12px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(
                    owned ? 'Besessen' : weapon.price + '$',
                    showcase.x + showcase.width / 2,
                    showcase.y + showcase.height - 6
                );
            }
        }

        // Cabinets
        for (const cabinet of interior.cabinets) {
            ctx.fillStyle = '#2a2318';
            ctx.fillRect(cabinet.x, cabinet.y, cabinet.width, cabinet.height);
        }

        // Service-Matte
        const mat = interior.serviceMat;
        ctx.fillStyle = 'rgba(80, 70, 55, 0.4)';
        ctx.fillRect(mat.x, mat.y, mat.width, mat.height);

        // Verkaeufer
        if (interior.vendor) {
            this.entityRenderer.drawCharacterParts({
                x: interior.vendor.x,
                y: interior.vendor.y,
                parts: interior.vendor.parts,
                animationPhase: interior.vendor.animationPhase,
                moving: interior.vendor.moving,
            });
        }

        // Spieler
        const currentWeapon = getWeaponDefinition(this.weaponCatalog, this.player.currentWeaponId);
        this.entityRenderer.drawPlayer(this.player, currentWeapon, this.inputSystem.mouse, false);

        // Projektile
        this.effectsRenderer.drawProjectiles(this.combatSystem.projectiles, 'weaponShop', interior);

        // Exit-Zone
        const exit = interior.exitZone;
        ctx.fillStyle = 'rgba(76, 175, 80, 0.3)';
        ctx.fillRect(exit.x, exit.y, exit.width, exit.height);
        ctx.fillStyle = '#4CAF50';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Ausgang (E)', exit.x + exit.width / 2, exit.y + exit.height / 2 + 5);

        // Vendor-Hinweis
        if (interior.playerNearVendor && !interior.menuOpen) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(interior.vendor.x - 60, interior.vendor.y - 50, 120, 24);
            ctx.fillStyle = '#FFF';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('E: Shop oeffnen', interior.vendor.x, interior.vendor.y - 33);
        }

        // Kauf-Menu
        if (interior.menuOpen) {
            this._drawWeaponShopMenu(ctx, interior);
        }

        // Nachricht
        if (interior.messageText) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
            ctx.fillRect(interior.width / 2 - 160, interior.height - 60, 320, 32);
            ctx.fillStyle = '#ffd166';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(interior.messageText, interior.width / 2, interior.height - 40);
        }

        ctx.restore();

        // Crosshair
        this.uiRenderer.drawCrosshair(this.inputSystem.mouse);
    }

    /**
     * Zeichnet das Waffen-Kauf-Menu.
     * @param {CanvasRenderingContext2D} ctx
     * @param {object} interior
     */
    _drawWeaponShopMenu(ctx, interior) {
        const menuX = interior.width / 2 - 180;
        const menuY = interior.height / 2 - 120;
        const menuW = 360;
        const itemH = 36;
        const options = interior.menuOptions ?? [];

        const menuH = 40 + options.length * itemH + 20;

        ctx.fillStyle = 'rgba(12, 16, 24, 0.92)';
        ctx.fillRect(menuX, menuY, menuW, menuH);
        ctx.strokeStyle = '#4CAF50';
        ctx.lineWidth = 2;
        ctx.strokeRect(menuX, menuY, menuW, menuH);

        ctx.fillStyle = '#4CAF50';
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Waffen kaufen', menuX + menuW / 2, menuY + 28);

        for (let i = 0; i < options.length; i++) {
            const weaponId = options[i];
            const weapon = getWeaponDefinition(this.weaponCatalog, weaponId);
            if (!weapon) continue;

            const itemY = menuY + 44 + i * itemH;
            const selected = i === interior.menuSelection;
            const owned = this.player.weaponInventory.has(weaponId);

            if (selected) {
                ctx.fillStyle = 'rgba(76, 175, 80, 0.3)';
                ctx.fillRect(menuX + 8, itemY, menuW - 16, itemH - 4);
            }

            ctx.fillStyle = owned ? '#4CAF50' : '#ffffff';
            ctx.font = '14px Arial';
            ctx.textAlign = 'left';

            const label = weapon.name + (owned ? ' [Besessen]' : ' - ' + weapon.price + '$');
            ctx.fillText(label, menuX + 20, itemY + 22);
        }

        ctx.fillStyle = '#888';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('W/S: Navigieren | Enter: Kaufen | Q/Esc: Schliessen', menuX + menuW / 2, menuY + menuH - 8);
    }

    // =====================================================================
    //  Game Loop
    // =====================================================================

    /**
     * @param {number} timestamp - performance.now()
     */
    gameLoop(timestamp) {
        // DeltaTime berechnen (in Sekunden, gecapped bei 100ms)
        const rawDelta = timestamp - this._lastTimestamp;
        const deltaTime = Math.min(rawDelta / 1000, 0.1);
        this._lastTimestamp = timestamp;

        // FPS berechnen
        this._frameCount++;
        this._fpsTime += rawDelta;
        if (this._fpsTime >= 1000) {
            this._fps = this._frameCount;
            this._frameCount = 0;
            this._fpsTime = 0;
            this.uiRenderer.updateFPSDisplay(this._fps);
        }

        this.update(deltaTime, timestamp);
        this.render();

        requestAnimationFrame((ts) => this.gameLoop(ts));
    }

    /**
     * Startet die Game-Loop.
     */
    start() {
        this._lastTimestamp = performance.now();
        requestAnimationFrame((ts) => this.gameLoop(ts));
    }
}




// ═══════════════════════════════════════════════════════
// js/main.js
// ═══════════════════════════════════════════════════════
/**
 * main.js - Entry Point fuer das Spiel.
 * Erstellt die Game-Instanz und startet die Game-Loop.
 */

const canvas = document.getElementById('gameCanvas');
const game = new Game(canvas);
game.start();


})();
