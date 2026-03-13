/**
 * MovementSystem - Verarbeitet Entity-Bewegung pro Frame.
 *
 * Berechnet Zielpositionen basierend auf Velocity/Target und delegiert
 * die tatsaechliche Positionsaenderung an EntityMover.
 *
 * WICHTIG: Dieses System setzt NIEMALS entity.x/y direkt.
 * Alle Positionsaenderungen laufen ueber EntityMover.move().
 */

import { distanceBetween } from '../core/MathUtils.js';

export class MovementSystem {
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
