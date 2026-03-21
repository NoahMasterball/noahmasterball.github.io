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

import { NPC_WALK_ANIM_SPEED, PANIC_ANIM_SPEED, ANIM_DECAY } from '../core/AnimationConstants.js';

/** Panik-Geschwindigkeitsfaktor relativ zur Basis-Geschwindigkeit */
const PANIC_SPEED_MULTIPLIER = 2.2;

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

export class AISystem {
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

        npc.animationPhase = (npc.animationPhase + panicSpeed * PANIC_ANIM_SPEED) % (Math.PI * 2);

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
            npc.animationPhase = (npc.animationPhase + npc.speed * NPC_WALK_ANIM_SPEED) % (Math.PI * 2);
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

export default AISystem;
