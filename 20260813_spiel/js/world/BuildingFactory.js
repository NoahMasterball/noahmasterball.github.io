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
export function createBuilding(type, x, y, width, height, options = {}) {
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
 * Erstellt Collider-Objekte aus einer Liste von Gebaeuden.
 * Jedes Gebaeude kann eigene collisionRects haben, andernfalls
 * wird die Basisgeometrie als Collider verwendet.
 *
 * Portiert aus createBuildingColliders() Zeilen 12025-12142.
 *
 * @param {Array} buildings
 * @returns {Array<{type: string, id: string|null, left: number, right: number, top: number, bottom: number}>}
 */
export function createBuildingColliders(buildings) {
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
