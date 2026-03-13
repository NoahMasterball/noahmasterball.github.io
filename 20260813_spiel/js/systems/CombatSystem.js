/**
 * CombatSystem - Verwaltet Projektile, Treffer und Kampf-Logik.
 * Portiert aus gta_old/overworld/js/overworld.js:
 *   processPlayerFiring()            (Z.2991-3017)
 *   spawnProjectilesForWeapon()      (Z.3019-3036)
 *   createProjectile()               (Z.3038-3064)
 *   updateProjectiles()              (Z.3065-3103)
 *   checkProjectileNpcCollision()    (Z.3180-3201)
 *   onNpcHit()                       (Z.3203-3214)
 *   killNpc()                        (Z.3216-3232)
 *   spawnBloodDecal()                (Z.3234-3243)
 */

import { getWeaponDefinition } from '../data/WeaponCatalog.js';

/** Maximale Anzahl an Blood-Decals bevor aelteste entfernt werden */
const MAX_BLOOD_DECALS = 150;

/** Offset vom Spielerzentrum zur Muendung in Pixeln */
const MUZZLE_OFFSET = 18;

export class CombatSystem {

    /**
     * @param {import('../core/EventBus.js').EventBus} eventBus
     * @param {Map<string, object>} weaponCatalog - Ergebnis von createWeaponCatalog()
     */
    constructor(eventBus, weaponCatalog) {
        this.eventBus = eventBus;
        this.weaponCatalog = weaponCatalog;

        /** @type {Array<object>} Aktive Projektile */
        this.projectiles = [];

        /** @type {Array<object>} Blut-Decals auf dem Boden */
        this.bloodDecals = [];

        /** Feuer-Zustand (Timing fuer Fire-Rate) */
        this._lastShotAt = 0;
    }

    // ───────────────────── Public API ─────────────────────

    /**
     * Haupt-Update pro Frame.
     * @param {import('../entities/Player.js').Player} player
     * @param {Array<import('../entities/NPC.js').NPC>} npcs
     * @param {number} _deltaTime - (reserviert, aktuell nicht genutzt)
     */
    update(player, npcs, _deltaTime) {
        this._updateProjectiles(npcs);
    }

    /**
     * Versucht mit der aktuellen Waffe zu feuern.
     * Portiert aus processPlayerFiring() (Z.2991-3017).
     *
     * @param {import('../entities/Player.js').Player} player
     * @param {{x: number, y: number}} mouseWorldPos - Maus-Weltkoordinaten
     * @param {object} fireInput - { justPressed: boolean, active: boolean }
     * @param {number} now - performance.now()
     */
    fireWeapon(player, mouseWorldPos, fireInput, now) {
        const weapon = getWeaponDefinition(this.weaponCatalog, player.currentWeaponId);

        if (!weapon || !player.weaponInventory.has(weapon.id)) {
            return;
        }

        if (!fireInput.active && !fireInput.justPressed) {
            return;
        }

        if (!weapon.automatic && !fireInput.justPressed) {
            return;
        }

        const interval = weapon.fireRate ?? 250;

        if (now - this._lastShotAt < interval) {
            return;
        }

        const muzzle = player.getMuzzlePosition();
        this._spawnProjectilesForWeapon(weapon, muzzle, mouseWorldPos);

        this._lastShotAt = now;
    }

    // ───────────────────── Projektil-Erzeugung ─────────────────────

    /**
     * Erzeugt Projektil(e) fuer eine Waffe (inkl. Pellets bei Shotgun).
     * Portiert aus spawnProjectilesForWeapon() (Z.3019-3036).
     *
     * @param {object} weapon - Waffendefinition aus dem Katalog
     * @param {{x: number, y: number}} muzzle - Muendungsposition
     * @param {{x: number, y: number}} target - Zielposition (Maus-Welt)
     * @private
     */
    _spawnProjectilesForWeapon(weapon, muzzle, target) {
        const targetX = target.x ?? muzzle.x;
        const targetY = target.y ?? muzzle.y;

        let angle = Math.atan2(targetY - muzzle.y, targetX - muzzle.x);

        if (!Number.isFinite(angle)) {
            angle = 0;
        }

        const spread = weapon.spread ?? 0;
        const pelletCount = weapon.pellets && weapon.pellets > 1 ? weapon.pellets : 1;

        for (let i = 0; i < pelletCount; i++) {
            const offset = spread ? (Math.random() - 0.5) * spread * 2 : 0;
            this._createProjectile(weapon, muzzle.x, muzzle.y, angle + offset);
        }
    }

    /**
     * Erstellt ein einzelnes Projektil.
     * Portiert aus createProjectile() (Z.3038-3064).
     *
     * @param {object} weapon
     * @param {number} startX
     * @param {number} startY
     * @param {number} angle
     * @private
     */
    _createProjectile(weapon, startX, startY, angle) {
        const speed = weapon.projectileSpeed ?? 10;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;

        const originX = startX + Math.cos(angle) * MUZZLE_OFFSET;
        const originY = startY + Math.sin(angle) * MUZZLE_OFFSET;

        const projectile = {
            x: originX,
            y: originY,
            vx,
            vy,
            speed,
            damage: weapon.damage ?? 10,
            weaponId: weapon.id,
            color: weapon.displayColor ?? '#ffd166',
            maxDistance: weapon.range ?? 600,
            distance: 0,
            createdAt: performance.now(),
        };

        this.projectiles.push(projectile);
    }

    // ───────────────────── Projektil-Update ─────────────────────

    /**
     * Bewegt alle Projektile und entfernt abgelaufene.
     * Portiert aus updateProjectiles() (Z.3065-3103).
     *
     * @param {Array<import('../entities/NPC.js').NPC>} npcs
     * @private
     */
    _updateProjectiles(npcs) {
        if (!this.projectiles.length) {
            return;
        }

        const survivors = [];

        for (const projectile of this.projectiles) {
            projectile.x += projectile.vx;
            projectile.y += projectile.vy;
            projectile.distance += projectile.speed;

            let expired = projectile.distance >= projectile.maxDistance;

            if (!expired) {
                if (this._checkProjectileNpcCollision(projectile, npcs)) {
                    expired = true;
                }
            }

            if (!expired) {
                survivors.push(projectile);
            }
        }

        this.projectiles = survivors;
    }

    // ───────────────────── Kollisionserkennung ─────────────────────

    /**
     * Prueft ob ein Projektil einen NPC trifft.
     * Portiert aus checkProjectileNpcCollision() (Z.3180-3201).
     *
     * @param {object} projectile
     * @param {Array<import('../entities/NPC.js').NPC>} npcs
     * @returns {boolean} true wenn Treffer
     * @private
     */
    _checkProjectileNpcCollision(projectile, npcs) {
        if (!npcs || !Array.isArray(npcs)) {
            return false;
        }

        for (const npc of npcs) {
            if (!npc || npc.dead) {
                continue;
            }

            const radius = npc.hitRadius ?? 14;
            const dx = projectile.x - npc.x;
            const dy = projectile.y - npc.y;

            if (dx * dx + dy * dy <= radius * radius) {
                this._onNpcHit(npc, projectile);
                return true;
            }
        }

        return false;
    }

    // ───────────────────── Treffer-Verarbeitung ─────────────────────

    /**
     * Verarbeitet einen Treffer auf einen NPC.
     * Portiert aus onNpcHit() (Z.3203-3214).
     *
     * @param {import('../entities/NPC.js').NPC} npc
     * @param {object} projectile
     * @private
     */
    _onNpcHit(npc, projectile) {
        const maxHealth = npc.maxHealth ?? 100;

        npc.health = Math.max(0, (npc.health ?? maxHealth) - projectile.damage);

        const panicDuration = 180 + Math.floor(Math.random() * 120);
        npc.panicTimer = Math.max(npc.panicTimer ?? 0, panicDuration);

        this.eventBus.emit('npc:hit', { npc, damage: projectile.damage, weaponId: projectile.weaponId });

        if (npc.health <= 0) {
            this._killNpc(npc);
        }
    }

    /**
     * Toetet einen NPC.
     * Portiert aus killNpc() (Z.3216-3232).
     *
     * @param {import('../entities/NPC.js').NPC} npc
     * @private
     */
    _killNpc(npc) {
        if (npc.dead) {
            return;
        }

        npc.dead = true;
        npc.health = 0;
        npc.moving = false;
        npc.panicTimer = 0;
        npc.waitTimer = 0;
        npc.animationPhase = 0;
        npc.isCrossing = false;
        npc.waitingForCrosswalk = null;
        npc.deathRotation = (Math.random() * Math.PI) - Math.PI / 2;

        this.spawnBloodDecal(npc.x, npc.y);

        this.eventBus.emit('npc:killed', { npc });
    }

    // ───────────────────── Blood-Decals ─────────────────────

    /**
     * Erzeugt einen Blut-Decal an der Position.
     * Portiert aus spawnBloodDecal() (Z.3234-3243).
     *
     * @param {number} x
     * @param {number} y
     */
    spawnBloodDecal(x, y) {
        this.bloodDecals.push({
            x,
            y,
            radius: 18 + Math.random() * 12,
            createdAt: performance.now(),
        });

        if (this.bloodDecals.length > MAX_BLOOD_DECALS) {
            this.bloodDecals.shift();
        }
    }
}

export default CombatSystem;
