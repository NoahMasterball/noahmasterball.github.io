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

export class VehicleSystem {
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

export default VehicleSystem;
