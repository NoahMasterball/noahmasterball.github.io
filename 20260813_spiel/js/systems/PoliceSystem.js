/**
 * PoliceSystem - Verwaltet Polizei-Spawning, Verfolgung, Taser, Verhaftung,
 * Eskalation und SWAT-Einsatz.
 *
 * SSOT fuer alle Polizei-Konstanten und -Logik.
 */

import { buildHumanoidParts } from '../entities/buildHumanoidParts.js';
import { getWeaponDefinition } from '../data/WeaponCatalog.js';

// ── Polizeistation (Respawn-Punkt) ──────────────────────────────────────
export const POLICE_STATION_POS = { x: 1800, y: 400 };

// ── Paletten ────────────────────────────────────────────────────────────
const POLICE_PALETTE = {
    head: '#f2d6c1',
    torso: '#1a3a6b',
    limbs: '#152d54',
    accent: '#2563eb',
    hair: '#1a1a1a',
    eyes: '#ffffff',
    pupil: '#1b1b1b',
};

const SWAT_PALETTE = {
    head: '#2a2a2a',
    torso: '#1a1a1a',
    limbs: '#0d0d0d',
    accent: '#333333',
    hair: '#1a1a1a',
    eyes: '#c0c0c0',
    pupil: '#222222',
};

// ── Geschwindigkeiten ───────────────────────────────────────────────────
const POLICE_CHASE_SPEED = 1.8;
const SWAT_CHASE_SPEED = 2.2;
const POLICE_WALK_ANIM_SPEED = 0.1;

// ── Taser ───────────────────────────────────────────────────────────────
const TASER_RANGE = 180;
const TASER_COOLDOWN = 4000;
const TASER_PROJECTILE_SPEED = 8;
const TASER_HIT_RADIUS = 18;

// ── Stun / Slow ─────────────────────────────────────────────────────────
export const STUN_DURATION = 2000;
export const SLOW_DURATION = 2000;
export const SLOW_FACTOR = 0.4;

// ── Verhaftung ──────────────────────────────────────────────────────────
const ARREST_RADIUS = 45;
const ARREST_TIME = 5000;

// ── Spawning ────────────────────────────────────────────────────────────
const POLICE_SPAWN_DISTANCE_MIN = 280;
const POLICE_SPAWN_DISTANCE_MAX = 400;
const SPAWN_DELAY_INITIAL = 2000;
const SPAWN_INTERVAL = 4000;
const MAX_POLICE_TOTAL = 8;

// ── Gesundheit ──────────────────────────────────────────────────────────
const POLICE_HEALTH = 150;
const SWAT_HEALTH = 300;

// ── Eskalation ──────────────────────────────────────────────────────────
const ESCALATION_STAGES = [
    { time: 0,     weaponId: 'pistol',       maxPolice: 2, fireRate: 900,  spawnSwat: false },
    { time: 20000, weaponId: 'smg',          maxPolice: 3, fireRate: 350,  spawnSwat: false },
    { time: 45000, weaponId: 'assaultRifle', maxPolice: 5, fireRate: 280,  spawnSwat: true  },
];

// ── Polizei-Schussverhalten ─────────────────────────────────────────────
const POLICE_GUN_RANGE = 350;
const POLICE_BULLET_SPREAD = 0.08;

let _nextPoliceId = 1;

export class PoliceSystem {
    /**
     * @param {import('../core/EventBus.js').EventBus} eventBus
     * @param {import('../core/EntityMover.js').EntityMover} entityMover
     * @param {Map<string, object>} weaponCatalog
     */
    constructor(eventBus, entityMover, weaponCatalog) {
        this.eventBus = eventBus;
        this.entityMover = entityMover;
        this.weaponCatalog = weaponCatalog;

        /** @type {Array<object>} Aktive Polizisten */
        this.officers = [];

        /** @type {Array<object>} Polizei-Projektile (Taser + Kugeln) */
        this.projectiles = [];

        /** Wanted-Status */
        this.wanted = false;
        this.wantedSince = 0;
        this.policeShootBack = false;
        this.shootBackSince = 0;

        /** Spawn-Timing */
        this._spawnDelayRemaining = 0;
        this._lastSpawnAt = 0;

        /** Verhaftungs-Fortschritt (ms) */
        this.arrestProgress = 0;

        /** Aktueller Eskalations-Index */
        this._escalationIndex = 0;
    }

    // =====================================================================
    //  Public API
    // =====================================================================

    /**
     * Aktiviert den Wanted-Status (z.B. nach NPC-Kill).
     * @param {number} now - performance.now()
     */
    setWanted(now) {
        if (this.wanted) return;
        this.wanted = true;
        this.wantedSince = now;
        this._spawnDelayRemaining = SPAWN_DELAY_INITIAL;
        this._escalationIndex = 0;
        this.policeShootBack = false;
        this.arrestProgress = 0;
    }

    /**
     * Wird aufgerufen wenn ein Polizist vom Spieler getroffen wird.
     * @param {number} now
     */
    onPoliceShot(now) {
        if (!this.policeShootBack) {
            this.policeShootBack = true;
            this.shootBackSince = now;
        }
    }

    /**
     * Setzt den gesamten Polizei-Zustand zurueck (z.B. nach Respawn).
     */
    reset() {
        this.officers = [];
        this.projectiles = [];
        this.wanted = false;
        this.wantedSince = 0;
        this.policeShootBack = false;
        this.shootBackSince = 0;
        this._spawnDelayRemaining = 0;
        this._lastSpawnAt = 0;
        this.arrestProgress = 0;
        this._escalationIndex = 0;
    }

    /**
     * Haupt-Update pro Frame.
     * @param {import('../entities/Player.js').Player} player
     * @param {number} deltaTime - Sekunden seit letztem Frame
     * @param {number} now - performance.now()
     * @returns {{ wasted: boolean }} Ob der Spieler verhaftet/getoetet wurde
     */
    update(player, deltaTime, now) {
        if (!this.wanted) {
            return { wasted: false };
        }

        const deltaMs = deltaTime * 1000;

        // Spawn-Delay
        if (this._spawnDelayRemaining > 0) {
            this._spawnDelayRemaining -= deltaMs;
            if (this._spawnDelayRemaining > 0) {
                return { wasted: false };
            }
        }

        // Eskalation aktualisieren
        this._updateEscalation(now);

        // Polizisten spawnen
        this._spawnIfNeeded(player, now);

        // Polizisten-KI
        let anyNearby = false;
        for (const cop of this.officers) {
            if (cop.dead) continue;
            this._updateOfficerAI(cop, player, now);
            if (this._distanceTo(cop, player) <= ARREST_RADIUS) {
                anyNearby = true;
            }
        }

        // Verhaftungs-Timer
        if (anyNearby && player.stunTimer > 0) {
            this.arrestProgress += deltaMs;
        } else if (anyNearby) {
            this.arrestProgress += deltaMs * 0.3;
        } else {
            this.arrestProgress = Math.max(0, this.arrestProgress - deltaMs * 0.5);
        }

        if (this.arrestProgress >= ARREST_TIME) {
            return { wasted: true, reason: 'arrested' };
        }

        // Projektile aktualisieren
        const playerHit = this._updateProjectiles(player);
        if (playerHit.taser) {
            player.stunTimer = STUN_DURATION;
            player.slowTimer = SLOW_DURATION;
        }
        if (playerHit.damage > 0) {
            player.health = Math.max(0, player.health - playerHit.damage);
            if (player.health <= 0) {
                return { wasted: true, reason: 'killed' };
            }
        }

        // Tote Polizisten aufraeuemen
        this.officers = this.officers.filter(c => !c.dead || c._deathAge < 10000);
        for (const cop of this.officers) {
            if (cop.dead) {
                cop._deathAge = (cop._deathAge ?? 0) + deltaMs;
            }
        }

        return { wasted: false };
    }

    // =====================================================================
    //  Eskalation
    // =====================================================================

    /** @param {number} now */
    _updateEscalation(now) {
        const elapsed = now - this.wantedSince;
        for (let i = ESCALATION_STAGES.length - 1; i >= 0; i--) {
            if (elapsed >= ESCALATION_STAGES[i].time) {
                this._escalationIndex = i;
                break;
            }
        }
    }

    /** @returns {object} Aktuelle Eskalationsstufe */
    _getCurrentStage() {
        return ESCALATION_STAGES[this._escalationIndex] ?? ESCALATION_STAGES[0];
    }

    // =====================================================================
    //  Spawning
    // =====================================================================

    /**
     * @param {object} player
     * @param {number} now
     */
    _spawnIfNeeded(player, now) {
        const stage = this._getCurrentStage();
        const aliveCount = this.officers.filter(c => !c.dead).length;

        if (aliveCount >= stage.maxPolice || aliveCount >= MAX_POLICE_TOTAL) return;
        if (now - this._lastSpawnAt < SPAWN_INTERVAL) return;

        const shouldSpawnSwat = stage.spawnSwat && !this.officers.some(c => c.type === 'swat' && !c.dead);
        const type = shouldSpawnSwat ? 'swat' : 'police';

        const cop = this._createOfficer(player, type, stage.weaponId);
        if (cop) {
            this.officers.push(cop);
            this._lastSpawnAt = now;
        }
    }

    /**
     * Erstellt einen Polizisten an einer zufaelligen Position um den Spieler.
     * @param {object} player
     * @param {'police'|'swat'} type
     * @param {string} weaponId
     * @returns {object|null}
     */
    _createOfficer(player, type, weaponId) {
        const angle = Math.random() * Math.PI * 2;
        const dist = POLICE_SPAWN_DISTANCE_MIN + Math.random() * (POLICE_SPAWN_DISTANCE_MAX - POLICE_SPAWN_DISTANCE_MIN);
        const x = player.x + Math.cos(angle) * dist;
        const y = player.y + Math.sin(angle) * dist;

        const isSwat = type === 'swat';
        const palette = isSwat ? SWAT_PALETTE : POLICE_PALETTE;

        return {
            id: _nextPoliceId++,
            x, y,
            width: 30,
            height: 30,
            speed: isSwat ? SWAT_CHASE_SPEED : POLICE_CHASE_SPEED,
            health: isSwat ? SWAT_HEALTH : POLICE_HEALTH,
            maxHealth: isSwat ? SWAT_HEALTH : POLICE_HEALTH,
            dead: false,
            moving: false,
            hidden: false,
            type,
            isPolice: true,
            parts: buildHumanoidParts(palette),
            palette,
            animationPhase: 0,
            hitRadius: 14,
            weaponId,
            taserCooldownUntil: 0,
            gunCooldownUntil: 0,
            nearPlayerTimer: 0,
            deathRotation: 0,
            stayOnSidewalks: false,
        };
    }

    // =====================================================================
    //  KI-Update pro Polizist
    // =====================================================================

    /**
     * @param {object} cop
     * @param {object} player
     * @param {number} now
     */
    _updateOfficerAI(cop, player, now) {
        const dx = player.x - cop.x;
        const dy = player.y - cop.y;
        const dist = Math.hypot(dx, dy);

        // Bewegung zum Spieler
        if (dist > 20) {
            const ratio = cop.speed / dist;
            const targetX = cop.x + dx * ratio;
            const targetY = cop.y + dy * ratio;
            this.entityMover.move(cop, targetX, targetY, { ignoreSidewalk: true });
            cop.moving = true;
        } else {
            cop.moving = false;
        }

        // Animation
        if (cop.moving) {
            cop.animationPhase = (cop.animationPhase + cop.speed * POLICE_WALK_ANIM_SPEED) % (Math.PI * 2);
        } else {
            cop.animationPhase *= 0.85;
        }

        // Taser (immer verfuegbar)
        if (dist <= TASER_RANGE && now >= cop.taserCooldownUntil) {
            this._fireTaser(cop, player, now);
            cop.taserCooldownUntil = now + TASER_COOLDOWN;
        }

        // Schusswaffen (nur wenn provoziert)
        if (this.policeShootBack && dist <= POLICE_GUN_RANGE) {
            const stage = this._getCurrentStage();
            const weapon = getWeaponDefinition(this.weaponCatalog, cop.weaponId);
            if (weapon && now >= cop.gunCooldownUntil) {
                this._fireGun(cop, player, weapon, now);
                cop.gunCooldownUntil = now + (stage.fireRate ?? weapon.fireRate ?? 500);
            }
        }
    }

    // =====================================================================
    //  Taser
    // =====================================================================

    /**
     * @param {object} cop
     * @param {object} player
     * @param {number} now
     */
    _fireTaser(cop, player, now) {
        const dx = player.x - cop.x;
        const dy = player.y - cop.y;
        const angle = Math.atan2(dy, dx);

        this.projectiles.push({
            x: cop.x + Math.cos(angle) * 16,
            y: cop.y + Math.sin(angle) * 16,
            vx: Math.cos(angle) * TASER_PROJECTILE_SPEED,
            vy: Math.sin(angle) * TASER_PROJECTILE_SPEED,
            speed: TASER_PROJECTILE_SPEED,
            type: 'taser',
            damage: 0,
            color: '#ffee00',
            maxDistance: TASER_RANGE + 40,
            distance: 0,
            createdAt: now,
        });
    }

    // =====================================================================
    //  Schusswaffen
    // =====================================================================

    /**
     * @param {object} cop
     * @param {object} player
     * @param {object} weapon
     * @param {number} now
     */
    _fireGun(cop, player, weapon, now) {
        const dx = player.x - cop.x;
        const dy = player.y - cop.y;
        const baseAngle = Math.atan2(dy, dx);
        const spread = POLICE_BULLET_SPREAD;
        const angle = baseAngle + (Math.random() - 0.5) * spread * 2;
        const projSpeed = weapon.projectileSpeed ?? 10;

        this.projectiles.push({
            x: cop.x + Math.cos(angle) * 16,
            y: cop.y + Math.sin(angle) * 16,
            vx: Math.cos(angle) * projSpeed,
            vy: Math.sin(angle) * projSpeed,
            speed: projSpeed,
            type: 'bullet',
            damage: weapon.damage ?? 15,
            color: weapon.displayColor ?? '#fca311',
            maxDistance: weapon.range ?? 600,
            distance: 0,
            createdAt: now,
        });
    }

    // =====================================================================
    //  Projektil-Update
    // =====================================================================

    /**
     * @param {object} player
     * @returns {{ taser: boolean, damage: number }}
     */
    _updateProjectiles(player) {
        const result = { taser: false, damage: 0 };
        if (!this.projectiles.length) return result;

        const survivors = [];
        const playerHitRadius = 16;

        for (const proj of this.projectiles) {
            proj.x += proj.vx;
            proj.y += proj.vy;
            proj.distance += proj.speed;

            if (proj.distance >= proj.maxDistance) continue;

            // Treffer auf Spieler pruefen
            const dx = proj.x - (player.x + player.width / 2);
            const dy = proj.y - (player.y + player.height / 2);
            if (dx * dx + dy * dy <= playerHitRadius * playerHitRadius) {
                if (proj.type === 'taser') {
                    result.taser = true;
                } else {
                    result.damage += proj.damage;
                }
                continue;
            }

            survivors.push(proj);
        }

        this.projectiles = survivors;
        return result;
    }

    // =====================================================================
    //  Hilfsfunktionen
    // =====================================================================

    /**
     * @param {object} a
     * @param {object} b
     * @returns {number}
     */
    _distanceTo(a, b) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        return Math.hypot(dx, dy);
    }

    /**
     * Gibt die Anzahl lebender Polizisten zurueck.
     * @returns {number}
     */
    getAliveCount() {
        return this.officers.filter(c => !c.dead).length;
    }

    /**
     * Gibt den Verhaftungs-Fortschritt als 0-1 zurueck.
     * @returns {number}
     */
    getArrestProgress() {
        return Math.min(1, this.arrestProgress / ARREST_TIME);
    }
}
