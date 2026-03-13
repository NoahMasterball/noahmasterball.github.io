/**
 * Renderer - Basis-Wrapper fuer das Canvas-2D-Rendering.
 * Kapselt den Canvas-Kontext und bietet grundlegende Operationen.
 */

export class Renderer {

    /**
     * @param {HTMLCanvasElement} canvas
     */
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.width = canvas.width;
        this.height = canvas.height;
    }

    /**
     * Loescht die gesamte Zeichenflaeche.
     */
    clear() {
        this.ctx.clearRect(0, 0, this.width, this.height);
    }

    /**
     * Speichert den aktuellen Zeichenzustand.
     */
    save() {
        this.ctx.save();
    }

    /**
     * Stellt den letzten gespeicherten Zeichenzustand wieder her.
     */
    restore() {
        this.ctx.restore();
    }

    /**
     * Verschiebt den Koordinatenursprung.
     * @param {number} x
     * @param {number} y
     */
    translate(x, y) {
        this.ctx.translate(x, y);
    }

    /**
     * Gibt den 2D-Rendering-Kontext zurueck.
     * @returns {CanvasRenderingContext2D}
     */
    getContext() {
        return this.ctx;
    }

    /**
     * Passt die Canvas-Groesse an die Fenstergroesse an.
     * Portiert aus overworld.js Zeilen 442-454.
     */
    resizeCanvas() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        console.log("Canvas resized:", this.width, "x", this.height);
    }
}