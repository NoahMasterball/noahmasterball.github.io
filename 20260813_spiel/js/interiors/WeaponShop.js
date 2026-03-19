/**
 * WeaponShop - Interior fuer den Waffenladen (Ammu-Nation).
 *
 * Portiert aus gta_old/overworld/js/overworld.js:
 *   createWeaponShopInterior()    Zeilen 2037-2129
 *   handleWeaponShopMovement()    Zeilen 2130-2183
 *   updateWeaponShopState()       Zeilen 2211-2243
 *
 * SSOT: Alle Waffenladen-Logik hier zentralisiert.
 */

import { buildHumanoidParts } from '../entities/buildHumanoidParts.js';
import { circleIntersectsRect } from '../core/MathUtils.js';

/** Standard-Waffenreihenfolge */
const DEFAULT_WEAPON_ORDER = ["pistol", "smg", "assaultRifle", "shotgun", "sniperRifle", "lmg"];

/** Interior-Abmessungen */
const INTERIOR_WIDTH = 720;
const INTERIOR_HEIGHT = 420;
const INTERIOR_MARGIN = 36;
const COUNTER_HEIGHT = 72;
const PLAYER_RADIUS = 14;

export class WeaponShop {

    /**
     * @param {object} [config={}]
     * @param {Array<string>} [config.weaponOrder] - Waffenreihenfolge
     */
    constructor(config = {}) {
        this.weaponOrder = config.weaponOrder ?? DEFAULT_WEAPON_ORDER;
    }

    /**
     * Erstellt das Interior-Layout fuer den Waffenladen.
     *
     * @returns {object} Interior-Datenobjekt
     */
    createLayout() {
        const width = INTERIOR_WIDTH;
        const height = INTERIOR_HEIGHT;
        const margin = INTERIOR_MARGIN;
        const counterHeight = COUNTER_HEIGHT;

        const counter = {
            x: margin,
            y: 174,
            width: width - margin * 2,
            height: counterHeight,
        };

        const vendor = {
            x: counter.x + counter.width / 2,
            y: counter.y - 26,
            interactionRadius: 140,
            parts: buildHumanoidParts({
                head: '#f0c1a1',
                torso: '#1f2d3d',
                limbs: '#131b24',
                accent: '#3d5a80',
                hair: '#2b2118',
                eyes: '#ffffff',
                pupil: '#0b132b',
            }),
            animationPhase: 0,
            moving: false,
        };

        const showcaseGap = 18;
        const showcaseHeight = 88;
        const showcaseCount = Math.max(1, this.weaponOrder.length);
        const availableWidth = counter.width - 48;
        const showcaseWidth = Math.min(
            200,
            (availableWidth - showcaseGap * (showcaseCount - 1)) / showcaseCount
        );
        const showcaseY = Math.max(margin + 24, counter.y - showcaseHeight - 32);

        const showcases = [];
        let showcaseX = counter.x + 24;
        for (const weaponId of this.weaponOrder) {
            showcases.push({
                id: `showcase_${weaponId}`,
                weaponId,
                x: showcaseX,
                y: showcaseY,
                width: showcaseWidth,
                height: showcaseHeight,
            });
            showcaseX += showcaseWidth + showcaseGap;
        }

        const cabinets = [
            { id: 'cabinet_left', x: counter.x - 18, y: counter.y - 20, width: 18, height: counterHeight + 56 },
            { id: 'cabinet_right', x: counter.x + counter.width, y: counter.y - 20, width: 18, height: counterHeight + 56 },
        ];

        const serviceMat = {
            x: counter.x + counter.width / 2 - 120,
            y: counter.y + counter.height - 12,
            width: 240,
            height: 16,
        };

        const obstacles = [counter, ...cabinets];

        return {
            width,
            height,
            margin,
            entry: { x: width / 2, y: height - margin - 60 },
            exitZone: {
                x: width / 2 - 80,
                y: height - margin - 24,
                width: 160,
                height: 36,
            },
            counter,
            vendor,
            showcases,
            cabinets,
            serviceMat,
            obstacles,
            playerRadius: PLAYER_RADIUS,
            playerNearVendor: false,
            playerNearExit: false,
            menuOpen: false,
            menuSelection: 0,
            menuOptions: this.weaponOrder.slice(),
            messageText: null,
            messageTimer: 0,
        };
    }

    /**
     * Aktualisiert die Spieler-Bewegung im Waffenladen.
     * Portiert aus handleWeaponShopMovement() Zeilen 2130-2183.
     *
     * @param {object} interior - Interior-Datenobjekt (von createLayout())
     * @param {object} player - Spieler-Entity
     * @param {object} inputSystem - InputSystem
     * @param {number} deltaTime - Zeit seit letztem Frame in Sekunden
     */
    handleMovement(interior, player, inputSystem, deltaTime) {
        if (!interior) {
            return;
        }

        if (interior.menuOpen) {
            player.moving = false;
            player.speed = 0;
            player.trySprintAndUpdateStamina(false, false, deltaTime);
            return;
        }

        const { dx, dy } = inputSystem.getMovementVector();
        const isMoving = dx !== 0 || dy !== 0;
        const sprinting = player.trySprintAndUpdateStamina(inputSystem.isSprinting(), isMoving, deltaTime);
        const baseSpeed = player.baseSpeed * 0.9;
        const speed = sprinting ? baseSpeed * 1.4 : baseSpeed;

        player.speed = speed;

        const scaledDx = dx * speed;
        const scaledDy = dy * speed;

        const radius = interior.playerRadius ?? PLAYER_RADIUS;
        const margin = interior.margin ?? INTERIOR_MARGIN;

        if (scaledDx !== 0) {
            const candidateX = Math.max(
                radius + margin,
                Math.min(player.x + scaledDx, interior.width - radius - margin)
            );
            if (!WeaponShop._circleHitsAnyObstacle(candidateX, player.y, radius, interior.obstacles)) {
                player.x = candidateX;
            }
        }

        if (scaledDy !== 0) {
            const candidateY = Math.max(
                radius + margin,
                Math.min(player.y + scaledDy, interior.height - radius - margin)
            );
            if (!WeaponShop._circleHitsAnyObstacle(player.x, candidateY, radius, interior.obstacles)) {
                player.y = candidateY;
            }
        }

        player.moving = dx !== 0 || dy !== 0;
    }

    /**
     * Aktualisiert den Waffenladen-Zustand (Naehe zum Verkaeufer, Ausgang, etc.).
     * Portiert aus updateWeaponShopState() Zeilen 2211-2243.
     *
     * @param {object} interior - Interior-Datenobjekt
     * @param {object} player - Spieler-Entity
     */
    updateState(interior, player) {
        if (!interior) {
            return;
        }

        interior.playerNearVendor = false;
        const radius = interior.playerRadius ?? PLAYER_RADIUS;
        const vendor = interior.vendor;

        if (vendor) {
            const vendorRadius = vendor.interactionRadius ?? 100;
            const distance = Math.hypot(player.x - vendor.x, player.y - vendor.y);
            interior.playerNearVendor = distance <= vendorRadius;

            if (interior.menuOpen && !interior.playerNearVendor) {
                interior.menuOpen = false;
            }
        } else {
            interior.menuOpen = false;
        }

        interior.playerNearExit = circleIntersectsRect(
            player.x, player.y, radius,
            interior.exitZone.x, interior.exitZone.y,
            interior.exitZone.width, interior.exitZone.height
        );

        if (interior.messageTimer > 0) {
            interior.messageTimer -= 1;
            if (interior.messageTimer <= 0) {
                interior.messageText = null;
            }
        }
    }

    /**
     * Verarbeitet Interaktionen im Waffenladen (Menu oeffnen/schliessen).
     *
     * @param {object} interior - Interior-Datenobjekt
     * @param {object} inputSystem - InputSystem
     * @returns {{ action: string, data?: any }|null} Aktion oder null
     */
    handleInteraction(interior, inputSystem) {
        if (!interior) {
            return null;
        }

        // E-Taste fuer Interaktion
        if (inputSystem.isKeyPressed('e')) {
            if (interior.playerNearExit) {
                return { action: 'exit' };
            }

            if (interior.playerNearVendor && !interior.menuOpen) {
                interior.menuOpen = true;
                interior.menuSelection = 0;
                return { action: 'menuOpen' };
            }
        }

        // Menu-Navigation
        if (interior.menuOpen) {
            if (inputSystem.isKeyPressed('escape') || inputSystem.isKeyPressed('q')) {
                interior.menuOpen = false;
                return { action: 'menuClose' };
            }

            if (inputSystem.isKeyPressed('arrowup') || inputSystem.isKeyPressed('w')) {
                interior.menuSelection = Math.max(0, interior.menuSelection - 1);
                return { action: 'menuNavigate', data: interior.menuSelection };
            }

            if (inputSystem.isKeyPressed('arrowdown') || inputSystem.isKeyPressed('s')) {
                interior.menuSelection = Math.min(
                    interior.menuOptions.length - 1,
                    interior.menuSelection + 1
                );
                return { action: 'menuNavigate', data: interior.menuSelection };
            }

            if (inputSystem.isKeyPressed('enter') || inputSystem.isKeyPressed(' ')) {
                const selectedWeapon = interior.menuOptions[interior.menuSelection];
                return { action: 'purchase', data: selectedWeapon };
            }
        }

        return null;
    }

    // -----------------------------------------------------------------------
    // Private Hilfsmethoden
    // -----------------------------------------------------------------------

    /**
     * Prueft ob ein Kreis ein Hindernis trifft.
     * @private
     */
    static _circleHitsAnyObstacle(x, y, radius, obstacles) {
        if (!Array.isArray(obstacles)) {
            return false;
        }

        for (const obstacle of obstacles) {
            if (circleIntersectsRect(x, y, radius, obstacle.x, obstacle.y, obstacle.width, obstacle.height)) {
                return true;
            }
        }

        return false;
    }
}

export default WeaponShop;
