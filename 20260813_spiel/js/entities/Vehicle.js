/**
 * Vehicle - Fahrzeug-Entity.
 *
 * WICHTIG: Setzt NIEMALS this.x/this.y direkt (ausser Initialisierung im Constructor).
 * Alle Positionsaenderungen gehen durch EntityMover.move().
 */

import { Entity } from './Entity.js';

export class Vehicle extends Entity {
    /**
     * @param {object} config
     * @param {Array<object>} config.path - Pfad-Wegpunkte (mind. 2)
     * @param {number} [config.width=96]
     * @param {number} [config.height=44]
     * @param {number} [config.speed=2.2]
     * @param {string} [config.baseColor='#555555']
     * @param {string} [config.accentColor='#888888']
     */
    constructor(config = {}) {
        const path = (config.path ?? []).map((wp) => ({ ...wp }));

        if (path.length < 2) {
            throw new Error('Vehicle needs at least two waypoints to move.');
        }

        const start = path[0];
        const width = config.width ?? 96;
        const height = config.height ?? 44;

        super({
            x: start.x,
            y: start.y,
            width,
            height,
            speed: config.speed ?? 2.2,
        });

        // Pfad und Navigation
        this.path = path;
        this.waypointIndex = path.length > 1 ? 1 : 0;
        this.waitTimer = start.wait ?? 0;
        this.stopTimer = 0;
        this.rotation = 0;

        // Farben
        this.baseColor = config.baseColor ?? '#555555';
        this.accentColor = config.accentColor ?? '#888888';

        // Yield-Verhalten (Vorfahrt gewaehren)
        this.yielding = false;
        this.yieldTimer = 0;

        // Visuelle Teile
        this.parts = Vehicle.buildParts({
            baseColor: this.baseColor,
            accentColor: this.accentColor,
            width: this.width,
            height: this.height,
        });
    }

    // ---- Waypoint-Methoden ----

    /**
     * Gibt den aktuellen Ziel-Wegpunkt zurueck.
     * @returns {object|null}
     */
    getCurrentWaypoint() {
        return this.path[this.waypointIndex] ?? null;
    }

    /**
     * Setzt den Wegpunkt-Index auf den naechsten Punkt (zyklisch).
     */
    advanceWaypoint() {
        this.waypointIndex = (this.waypointIndex + 1) % this.path.length;
    }

    /**
     * Prueft ob das Fahrzeug nah genug am aktuellen Wegpunkt ist.
     * @param {number} [threshold=2] - Entfernung in Pixeln
     * @returns {boolean}
     */
    isAtWaypoint(threshold = 2) {
        const wp = this.getCurrentWaypoint();
        if (!wp) return false;
        const dx = this.x - wp.x;
        const dy = this.y - wp.y;
        return (dx * dx + dy * dy) <= threshold * threshold;
    }

    // ---- Statische Factory-Methoden ----

    /**
     * Baut die visuellen Fahrzeug-Teile.
     * Portiert von buildVehicleParts() aus dem alten Code.
     *
     * @param {object} config
     * @param {string} config.baseColor
     * @param {string} config.accentColor
     * @param {number} config.width
     * @param {number} config.height
     * @returns {Array<object>}
     */
    static buildParts(config) {
        const width = config.width;
        const height = config.height;
        const halfWidth = width / 2;
        const halfHeight = height / 2;
        const wheelRadius = Math.max(5, Math.floor(height * 0.24));

        const windowColor = 'rgba(132, 188, 226, 0.9)';
        const rearWindowColor = 'rgba(96, 140, 180, 0.85)';
        const trimColor = '#1f2a36';
        const lightFront = '#ffe8a3';
        const lightRear = '#ff6464';

        const parts = [];

        const addRect = (id, centerX, centerY, rectWidth, rectHeight, color, extra = {}) => {
            parts.push({
                id,
                type: 'rect',
                width: rectWidth,
                height: rectHeight,
                offsetX: centerX - rectWidth / 2,
                offsetY: centerY - rectHeight / 2,
                color,
                damaged: false,
                ...extra,
            });
        };

        const addCircle = (id, centerX, centerY, radius, color, extra = {}) => {
            parts.push({
                id,
                type: 'circle',
                radius,
                offsetX: centerX,
                offsetY: centerY,
                color,
                damaged: false,
                ...extra,
            });
        };

        // Chassis
        addRect('chassis', 0, 0, width, height, config.baseColor);

        // Streifen
        const stripeHeight = height * 0.22;
        addRect('stripe', 0, 0, width * 0.86, stripeHeight, config.accentColor);

        // Dach
        const roofWidth = width * 0.58;
        const roofHeight = height * 0.5;
        addRect('roof', 0, 0, roofWidth, roofHeight, config.accentColor);

        // Windschutzscheibe
        const windshieldWidth = width * 0.32;
        const windshieldHeight = height * 0.46;
        const windshieldCenterX = halfWidth - windshieldWidth * 0.6;
        addRect('windshield', windshieldCenterX, 0, windshieldWidth, windshieldHeight, windowColor);

        // Heckscheibe
        const rearGlassWidth = width * 0.3;
        const rearGlassHeight = height * 0.42;
        const rearGlassCenterX = -halfWidth + rearGlassWidth * 0.6;
        addRect('rearGlass', rearGlassCenterX, 0, rearGlassWidth, rearGlassHeight, rearWindowColor);

        // Stossstangen
        const bumperWidth = width * 0.08;
        const bumperHeight = height * 0.74;
        addRect('trimFront', halfWidth - bumperWidth / 2, 0, bumperWidth, bumperHeight, trimColor);
        addRect('trimRear', -halfWidth + bumperWidth / 2, 0, bumperWidth, bumperHeight, trimColor);

        // Lichter
        const lightWidth = width * 0.06;
        const lightHeight = height * 0.22;
        const lateralOffset = halfHeight - lightHeight * 0.6;
        const lightInset = width * 0.04 + bumperWidth;
        const frontLightCenterX = halfWidth - lightInset - lightWidth / 2;
        const rearLightCenterX = -frontLightCenterX;

        addRect('frontLightLeft', frontLightCenterX, -lateralOffset, lightWidth, lightHeight, lightFront);
        addRect('frontLightRight', frontLightCenterX, lateralOffset, lightWidth, lightHeight, lightFront);
        addRect('rearLightLeft', rearLightCenterX, -lateralOffset, lightWidth, lightHeight, lightRear);
        addRect('rearLightRight', rearLightCenterX, lateralOffset, lightWidth, lightHeight, lightRear);

        // Seitenpanele
        const sidePanelHeight = height * 0.12;
        const sidePanelOffsetY = halfHeight - sidePanelHeight / 2;
        addRect('sidePanelTop', 0, -sidePanelOffsetY, width * 0.78, sidePanelHeight, config.accentColor);
        addRect('sidePanelBottom', 0, sidePanelOffsetY, width * 0.78, sidePanelHeight, config.accentColor);

        // Raeder
        addCircle('wheelFrontLeft', halfWidth * 0.45, halfHeight - wheelRadius, wheelRadius, trimColor, { visible: false });
        addCircle('wheelFrontRight', halfWidth * 0.45, -halfHeight + wheelRadius, wheelRadius, trimColor, { visible: false });
        addCircle('wheelRearLeft', -halfWidth * 0.45, halfHeight - wheelRadius, wheelRadius, trimColor, { visible: false });
        addCircle('wheelRearRight', -halfWidth * 0.45, -halfHeight + wheelRadius, wheelRadius, trimColor, { visible: false });

        return parts;
    }
}

export default Vehicle;
