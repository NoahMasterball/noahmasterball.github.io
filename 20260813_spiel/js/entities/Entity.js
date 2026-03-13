/**
 * Entity - Basisklasse fuer alle Spielobjekte (Spieler, NPCs, Objekte).
 *
 * WICHTIG: Entity setzt x/y nicht direkt.
 * Bewegung und Positionsaenderungen werden ausschliesslich ueber EntityMover gesteuert.
 */

let _nextEntityId = 1;

export class Entity {
    /**
     * @param {object} [options]
     * @param {number} [options.x=0]
     * @param {number} [options.y=0]
     * @param {number} [options.width=32]
     * @param {number} [options.height=32]
     * @param {number} [options.speed=2]
     * @param {number} [options.health=100]
     */
    constructor(options = {}) {
        this.id = _nextEntityId++;
        this.x = options.x ?? 0;
        this.y = options.y ?? 0;
        this.width = options.width ?? 32;
        this.height = options.height ?? 32;
        this.speed = options.speed ?? 2;
        this.moving = false;

        /** @type {{minX: number, minY: number, maxX: number, maxY: number} | null} */
        this.bounds = options.bounds ?? null;

        this.maxHealth = options.health ?? 100;
        this.health = this.maxHealth;
        this.dead = false;
        this.hidden = false;
    }

    /**
     * Gibt true zurueck wenn die Entity lebt (health > 0, nicht dead).
     */
    isAlive() {
        return !this.dead && this.health > 0;
    }

    /**
     * Gibt die Bounding-Box als {x, y, width, height} zurueck.
     */
    getBounds() {
        return {
            x: this.x - this.width / 2,
            y: this.y - this.height / 2,
            width: this.width,
            height: this.height,
        };
    }

    /**
     * Gibt das Zentrum als {x, y} zurueck.
     */
    getCenter() {
        return { x: this.x, y: this.y };
    }

    /**
     * Berechnet die Distanz zu einer anderen Entity.
     * @param {Entity} other
     * @returns {number}
     */
    distanceTo(other) {
        const dx = this.x - other.x;
        const dy = this.y - other.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
}

export default Entity;