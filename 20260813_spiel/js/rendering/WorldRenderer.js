/**
 * WorldRenderer - Zeichnet die Spielwelt: Gras, Strassen, Buergersteige, Zebrastreifen
 * und Strassendetails (Parkplaetze, Baeume, Baenke, Laternen, etc.).
 *
 * Portiert aus overworld.js Zeilen 7124-8511.
 */

import { pseudoRandom2D } from '../core/MathUtils.js';

export class WorldRenderer {

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
                const length = road.endX - road.startX;
                const upperY = road.y - roadHalfWidth - sidewalkWidth;
                const lowerY = road.y + roadHalfWidth;

                this.ctx.fillStyle = surface;
                this.ctx.fillRect(road.startX, upperY, length, sidewalkWidth);
                this.ctx.fillRect(road.startX, lowerY, length, sidewalkWidth);

                this.drawSidewalkPatternRect(road.startX, upperY, length, sidewalkWidth);
                this.drawSidewalkPatternRect(road.startX, lowerY, length, sidewalkWidth);

            } else if (road.type === "vertical") {
                const length = road.endY - road.startY;
                const leftX = road.x - roadHalfWidth - sidewalkWidth;
                const rightX = road.x + roadHalfWidth;

                this.ctx.fillStyle = surface;
                this.ctx.fillRect(leftX, road.startY, sidewalkWidth, length);
                this.ctx.fillRect(rightX, road.startY, sidewalkWidth, length);

                this.drawSidewalkPatternRect(leftX, road.startY, sidewalkWidth, length);
                this.drawSidewalkPatternRect(rightX, road.startY, sidewalkWidth, length);

            } else if (road.type === "diagonal") {
                this._drawDiagonalSidewalks(road, sidewalkWidth, roadWidth);
            }
        }
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