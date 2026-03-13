/**
 * InteriorManager - Verwaltet den Wechsel zwischen Overworld und Interior-Szenen.
 *
 * Portiert aus gta_old/overworld/js/overworld.js:
 *   enterWeaponShop()  Zeilen 2363-2440
 *   exitInterior()     Zeilen 2441-2515
 *
 * SSOT: Alle Interior-Wechsellogik hier zentralisiert.
 */

import { eventBus } from '../core/EventBus.js';

/**
 * @typedef {object} OverworldReturnState
 * @property {{ x: number, y: number }} position
 * @property {{ x: number, y: number }} camera
 */

export class InteriorManager {

    constructor() {
        /** @type {string} Aktuelle Szene ('overworld' oder Interior-Typ) */
        this.scene = 'overworld';

        /** @type {object|null} Aktives Interior-Objekt */
        this.activeInterior = null;

        /** @type {OverworldReturnState|null} Gespeicherter Overworld-Zustand */
        this.overworldReturnState = null;
    }

    /**
     * Prueft ob die aktuelle Szene ein Interior ist.
     * @returns {boolean}
     */
    isInInterior() {
        return this.scene !== 'overworld' && this.activeInterior !== null;
    }

    /**
     * Gibt den Typ des aktiven Interiors zurueck (oder null).
     * @returns {string|null}
     */
    getInteriorType() {
        return this.isInInterior() ? this.scene : null;
    }

    /**
     * Betritt ein Interior.
     *
     * @param {string} type - Interior-Typ (z.B. 'weaponShop', 'casino')
     * @param {object} interiorData - Interior-Daten (von WeaponShop.createLayout() etc.)
     * @param {object} player - Spieler-Entity
     * @param {object} camera - Kamera-Objekt mit x, y
     * @param {object} [inputSystem] - InputSystem zum Zuruecksetzen der Tasten
     * @param {number} [canvasWidth=800] - Canvas-Breite (fuer Zentrierung)
     * @param {number} [canvasHeight=600] - Canvas-Hoehe
     */
    enterInterior(type, interiorData, player, camera, inputSystem, canvasWidth = 800, canvasHeight = 600) {
        if (this.scene === type) {
            return;
        }

        // Interior zentrieren
        interiorData.originX = Math.max(0, Math.floor((canvasWidth - interiorData.width) / 2));
        interiorData.originY = Math.max(0, Math.floor((canvasHeight - interiorData.height) / 2));

        // Overworld-Zustand sichern
        this.overworldReturnState = {
            position: { x: player.x, y: player.y },
            camera: { x: camera.x, y: camera.y },
        };

        // Szene wechseln
        this.scene = type;
        this.activeInterior = interiorData;

        // Spieler in Interior positionieren
        player.x = interiorData.entry.x;
        player.y = interiorData.entry.y;
        player.moving = false;
        player.animationPhase = 0;

        // Kamera zuruecksetzen
        camera.x = 0;
        camera.y = 0;

        // Input zuruecksetzen
        if (inputSystem) {
            this._resetInput(inputSystem);
        }

        eventBus.emit('interior:enter', { type, building: interiorData });
    }

    /**
     * Verlaesst das aktuelle Interior und stellt den Overworld-Zustand wieder her.
     *
     * @param {object} player - Spieler-Entity
     * @param {object} camera - Kamera-Objekt mit x, y
     * @param {object} [inputSystem] - InputSystem zum Zuruecksetzen der Tasten
     */
    exitInterior(player, camera, inputSystem) {
        if (this.scene === 'overworld') {
            return;
        }

        const exitedType = this.scene;

        // Menu im Interior schliessen
        const interior = this.activeInterior;
        if (interior) {
            interior.menuOpen = false;
        }

        // Overworld-Zustand wiederherstellen
        if (this.overworldReturnState) {
            player.x = this.overworldReturnState.position.x;
            player.y = this.overworldReturnState.position.y;
            camera.x = this.overworldReturnState.camera.x;
            camera.y = this.overworldReturnState.camera.y;
        }

        // Szene zuruecksetzen
        this.scene = 'overworld';
        this.activeInterior = null;
        this.overworldReturnState = null;

        // Spieler-Zustand zuruecksetzen
        player.moving = false;
        player.animationPhase = 0;

        // Input zuruecksetzen
        if (inputSystem) {
            this._resetInput(inputSystem);
        }

        eventBus.emit('interior:exit', { type: exitedType });
    }

    /**
     * Setzt alle Input-Keys zurueck.
     * @param {object} inputSystem
     * @private
     */
    _resetInput(inputSystem) {
        if (inputSystem.keys) {
            for (const key of Object.keys(inputSystem.keys)) {
                inputSystem.keys[key] = false;
            }
        }
    }
}

export default InteriorManager;
