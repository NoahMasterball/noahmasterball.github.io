/**
 * EntityMover - SSOT (Single Source of Truth) fuer alle Entity-Bewegungen.
 *
 * KRITISCH: Dies ist die EINZIGE Stelle im gesamten Code, die entity.x/y setzen darf.
 * Alle Bewegungen muessen durch move() oder teleport() laufen.
 *
 * Pipeline: Kollision -> Sidewalk-Constraint -> Entity-Bounds -> World-Bounds -> entity.x/y setzen
 */

export class EntityMover {
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
