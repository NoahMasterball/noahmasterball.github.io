/**
 * CameraSystem — Kamera folgt dem Spieler, clampt an Weltgrenzen.
 * Portiert aus gta_old/overworld/js/overworld.js updateCamera() (Z.1205-1223)
 */
export class CameraSystem {

    /**
     * @param {number} viewportWidth  - Canvas-Breite
     * @param {number} viewportHeight - Canvas-Höhe
     * @param {number} [zoom=1]       - Zoom-Faktor (1 = kein Zoom)
     */
    constructor(viewportWidth, viewportHeight, zoom = 1) {
        this.x = 0;
        this.y = 0;
        this.width = viewportWidth;
        this.height = viewportHeight;
        this.zoom = zoom;
    }

    /**
     * Kamera auf Ziel-Entity zentrieren und an Weltgrenzen clampen.
     * Portiert aus updateCamera() (Z.1205-1223).
     *
     * @param {object} targetEntity - Objekt mit {x, y}
     * @param {object} worldBounds  - {width, height} der Welt
     */
    update(targetEntity, worldBounds) {
        // Effektive Viewport-Größe (berücksichtigt Zoom)
        const vw = this.width / this.zoom;
        const vh = this.height / this.zoom;

        // Kamera zentriert auf Entity
        this.x = targetEntity.x - vw / 2;
        this.y = targetEntity.y - vh / 2;

        // An Weltgrenzen clampen (westliche Grenze erlaubt Blick aufs Meer)
        const westLimit = -(this.oceanOverflow ?? 0);
        this.x = Math.max(westLimit, Math.min(this.x, worldBounds.width - vw));
        this.y = Math.max(0, Math.min(this.y, worldBounds.height - vh));
    }

    /**
     * Weltkoordinaten → Bildschirmkoordinaten.
     * @param {number} wx
     * @param {number} wy
     * @returns {{sx: number, sy: number}}
     */
    worldToScreen(wx, wy) {
        return {
            sx: (wx - this.x) * this.zoom,
            sy: (wy - this.y) * this.zoom
        };
    }

    /**
     * Bildschirmkoordinaten → Weltkoordinaten.
     * @param {number} sx
     * @param {number} sy
     * @returns {{wx: number, wy: number}}
     */
    screenToWorld(sx, sy) {
        return {
            wx: sx / this.zoom + this.x,
            wy: sy / this.zoom + this.y
        };
    }
}
