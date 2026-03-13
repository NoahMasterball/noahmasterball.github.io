/**
 * CollisionSystem - Verwaltet alle Kollisionspruefungen und -aufloesungen.
 * Portiert aus OverworldGame: checkBuildingCollisions, resolveCircleRectCollision,
 * isPointInsideAnyCollider, collectVehicleColliders.
 */

import { clamp } from '../core/MathUtils.js';

export class CollisionSystem {

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
        const list = colliders ?? this.buildingColliders;

        if (!Array.isArray(list) || list.length === 0) {
            return false;
        }

        for (const rect of list) {
            if (!rect) {
                continue;
            }

            const left = Number(rect.left ?? rect.x ?? 0);
            const right = Number(rect.right ?? ((rect.width != null) ? left + Number(rect.width) : left));
            const top = Number(rect.top ?? rect.y ?? 0);
            const bottom = Number(rect.bottom ?? ((rect.height != null) ? top + Number(rect.height) : top));

            if (!Number.isFinite(left) || !Number.isFinite(right) ||
                !Number.isFinite(top) || !Number.isFinite(bottom)) {
                continue;
            }

            if (left > right || top > bottom) {
                continue;
            }

            if (x >= left && x <= right && y >= top && y <= bottom) {
                return true;
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

export default CollisionSystem;
