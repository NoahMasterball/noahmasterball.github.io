/**
 * Player - Spieler-Entity.
 *
 * WICHTIG: Setzt NIEMALS this.x/this.y direkt (ausser Initialisierung im Constructor).
 * Alle Positionsaenderungen gehen durch EntityMover.move().
 */

import { Entity } from './Entity.js';
import { buildHumanoidParts } from './buildHumanoidParts.js';

/** Standard-Palette fuer den Spieler */
const DEFAULT_PLAYER_PALETTE = {
    head: '#f6d7c4',
    torso: '#1b4965',
    limbs: '#16324f',
    accent: '#5fa8d3',
    hair: '#2b2118',
    eyes: '#ffffff',
    pupil: '#1b1b1b',
};

export class Player extends Entity {
    /**
     * @param {object} [options]
     * @param {number} [options.x=400]
     * @param {number} [options.y=300]
     * @param {number} [options.width=30]
     * @param {number} [options.height=30]
     * @param {number} [options.speed=1.5]
     * @param {number} [options.sprintMultiplier=2]
     * @param {object} [options.palette] - Farbpalette fuer Spieler-Teile
     * @param {number} [options.money=1500]
     * @param {number} [options.casinoCredits=0]
     * @param {string|null} [options.currentWeaponId=null]
     * @param {Set|null} [options.weaponInventory=null]
     * @param {Array|null} [options.weaponLoadout=null]
     */
    constructor(options = {}) {
        super({
            x: options.x ?? 400,
            y: options.y ?? 300,
            width: options.width ?? 30,
            height: options.height ?? 30,
            speed: options.speed ?? 1.5,
            health: options.health ?? 100,
        });

        this.baseSpeed = this.speed;
        this.sprintMultiplier = options.sprintMultiplier ?? 2;

        this.animationPhase = 0;
        this.color = options.color ?? '#FF0000';

        // Waffen-Zustand
        this.currentWeaponId = options.currentWeaponId ?? null;
        this.weaponInventory = options.weaponInventory ?? new Set();
        this.weaponLoadout = options.weaponLoadout ?? [];

        // Geld
        this.money = options.money ?? 1500;
        this.casinoCredits = options.casinoCredits ?? 0;

        // Visuelle Teile
        const palette = options.palette ?? DEFAULT_PLAYER_PALETTE;
        this.parts = buildHumanoidParts(palette);
    }

    /**
     * Gibt das Zentrum des Spielers zurueck.
     * Beruecksichtigt die halbe Breite/Hoehe (Top-Down-Ansicht).
     * @returns {{ x: number, y: number }}
     */
    getCenter() {
        return {
            x: this.x + this.width / 2,
            y: this.y + this.height / 2,
        };
    }

    /**
     * Gibt die Muendungsposition fuer die aktuelle Waffe zurueck.
     * @returns {{ x: number, y: number }}
     */
    getMuzzlePosition() {
        const center = this.getCenter();
        return { x: center.x, y: center.y };
    }

    /**
     * Delegiert an die gemeinsame buildHumanoidParts-Funktion (SSOT).
     * @param {object} palette
     * @returns {Array<object>}
     */
    static buildParts(palette) {
        return buildHumanoidParts(palette);
    }
}

export default Player;
