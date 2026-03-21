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
 * Berechnet die Metriken (Abmessungen, Tuer, Eingang, etc.) fuer ein Haus.
 * SSOT: Einzige Quelle fuer Haus-Geometrie-Berechnungen.
 *
 * @param {object} building - Gebaeude-Objekt
 * @param {Array}  [houseStyles] - Hausstile (optional, fuer Palette)
 * @returns {object|null}
 */
export function computeHouseMetrics(building, houseStyles) {
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
export function computeCasinoPodiumGeometry(casinoTower) {
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
