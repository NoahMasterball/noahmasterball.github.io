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
export class RoadNetwork {
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
            { orientation: "horizontal", x: 1100, y: 1700, span: 260 },
            { orientation: "horizontal", x: 2050, y: 1700, span: 260 },
            { orientation: "horizontal", x: 1040, y: 1680, span: 180 },
            { orientation: "horizontal", x: 1860, y: 1680, span: 180 },
            { orientation: "vertical", x: 950, y: 900, span: 300 },
            { orientation: "vertical", x: 1700, y: 900, span: 300 },
            { orientation: "vertical", x: 2050, y: 1700, span: 300 },
            { orientation: "vertical", x: 1700, y: 2100, span: 280 },
            { orientation: "horizontal", x: 2950, y: 1100, span: 260 },
            { orientation: "vertical", x: 1330, y: 1700, span: 240 },
            { orientation: "horizontal", x: 3040, y: 1500, span: 280 },
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
        roads.push({ type: "horizontal", startX: 950, endX: 1700, y: 2100 });
        roads.push({ type: "vertical", x: 1330, startY: 1700, endY: 2400 });
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
export { resolveRectBounds, isPointInsideRect, clampPointToRect };
