/**
 * BuildingRenderer — Zeichnet alle Gebäudetypen.
 * Portiert aus overworld.js Zeilen 8512-10894.
 */

import { pseudoRandom2D } from '../core/MathUtils.js';

export class BuildingRenderer {

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
                case 'restaurant':    this.drawRestaurant(building); break;
                case 'shop':          this.drawShop(building); break;
                case 'house':
                default:              this.drawHouse(building); break;
            }
        }

        this.drawInteractionPoints(buildings);
    }

    // --- computeHouseMetrics ---

    computeHouseMetrics(building) {
        if (!building || building.type !== 'house') return null;

        const lotWidth = Number(building.width ?? 0);
        const lotHeight = Number(building.height ?? 0);
        if (!(lotWidth > 0 && lotHeight > 0)) return null;

        const variant = building.variant ?? {};
        const styleIndex = variant.styleIndex ?? building.colorIndex ?? 0;
        const palettes = Array.isArray(this.houseStyles) ? this.houseStyles : [];
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
        const boundsBottom = Math.max(boundsTop + minBoundsHeight, approachY + Math.max(16, walkwayHeight * 0.2));

        return {
            houseX, houseY, houseWidth, houseHeight, houseBottom,
            roofDepth, facadeTop, facadeHeight, frontDepth,
            walkway: { x: walkwayX, y: walkwayY, width: walkwayWidth, height: walkwayHeight },
            door: {
                x: doorX, y: doorY, width: doorWidth, height: doorHeight,
                world: { x: doorWorldX, y: doorWorldCenterY, bottom: doorWorldBottom, insideY: doorWorldInsideY }
            },
            entrance: { x: doorWorldX, y: entranceY },
            approach: { x: doorWorldX, y: approachY },
            interior: { x: interiorX, y: interiorY },
            bounds: { left: boundsLeft, right: boundsRight, top: boundsTop, bottom: boundsBottom },
            palette
        };
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
        const { x: lotOriginX, y: lotOriginY, width: lotWidth, height: lotHeight, variant = {} } = building;
        const styleIndex = variant.styleIndex ?? building.colorIndex ?? 0;
        const palettes = Array.isArray(this.houseStyles) ? this.houseStyles : [];
        const palette = palettes.length > 0 ? palettes[styleIndex % palettes.length] : {
            base: '#b0a090', roof: '#444', accent: '#887766', highlight: '#ccbbaa',
            metallic: '#8899aa', balcony: '#776655', windowFrame: 'rgba(28,32,40,0.78)'
        };
        const floors = Math.max(2, variant.floors ?? palette.floors ?? 4);
        const roofGarden = Boolean(variant.roofGarden ?? palette.roofGarden ?? false);
        const balconyRhythm = Math.max(0, variant.balconyRhythm ?? 0);

        const lotPaddingBase = building.lotPadding ?? Math.min(36, Math.min(lotWidth, lotHeight) * 0.22);
        const sideMax = Math.max(12, (lotWidth - 140) / 2);
        const sidePadding = Math.min(Math.max(14, lotPaddingBase), sideMax);
        let rearPadding = Math.min(lotHeight * 0.22, Math.max(12, lotPaddingBase * 0.65));
        const minHouseHeight = 120;
        const maxFrontSpace = Math.max(20, lotHeight - rearPadding - minHouseHeight);
        let desiredFront = Math.min(maxFrontSpace, Math.max(48, lotPaddingBase * 1.45, lotHeight * 0.26));
        if (desiredFront < 32) desiredFront = Math.min(maxFrontSpace, Math.max(32, lotPaddingBase * 1.15));

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
        if (houseHeight - roofDepth < 96) roofDepth = Math.max(24, houseHeight - 96);
        const facadeHeight = houseHeight - roofDepth;
        const facadeTop = houseY + roofDepth;

        this.ctx.save();
        this.ctx.translate(lotOriginX, lotOriginY);
        this.ctx.lineJoin = 'round';

        // Walkway
        const lawnHeight = Math.max(8, frontDepth * 0.65);
        const walkwayWidth = Math.min(48, houseWidth * 0.28);
        const walkwayX = lotWidth / 2 - walkwayWidth / 2;
        const walkwayY = houseBottom;
        const walkwayHeight = frontDepth;

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
        const doorWidth = Math.min(houseWidth * 0.26, 68);
        const doorHeight = Math.max(58, Math.min(facadeHeight * 0.44, 104));
        const doorX = houseX + houseWidth / 2 - doorWidth / 2;
        const doorY = facadeTop + facadeHeight - doorHeight;

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
        const apronExtension = Math.max(60, Math.round(width * 0.3));
        const podiumWidth = width + apronExtension * 2;
        const podiumHeight = Math.max(72, Math.min(120, Math.round(height * 0.22)));
        const podiumX = x - apronExtension;
        const podiumY = y + height - 16;

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
        const plinthHeight = 40;
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

    // --- Interaction Points ---

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
