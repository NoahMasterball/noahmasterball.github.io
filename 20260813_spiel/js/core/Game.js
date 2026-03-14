/**
 * Game - Hauptklasse die alle Module zusammensteckt und die Game-Loop steuert.
 *
 * SSOT: Game.js ist der einzige Ort der Module instanziiert und verbindet.
 * Keine Logik wird hier dupliziert - alles wird an die spezialisierten
 * Systeme und Renderer delegiert.
 */

import { eventBus } from './EventBus.js';
import { EntityMover } from './EntityMover.js';

import { Player } from '../entities/Player.js';

import { InputSystem } from '../systems/InputSystem.js';
import { MovementSystem } from '../systems/MovementSystem.js';
import { CollisionSystem } from '../systems/CollisionSystem.js';
import { CombatSystem } from '../systems/CombatSystem.js';
import { AISystem } from '../systems/AISystem.js';
import { VehicleSystem } from '../systems/VehicleSystem.js';
import { CameraSystem } from '../systems/CameraSystem.js';
import { DayNightSystem } from '../systems/DayNightSystem.js';
import { InteractionSystem } from '../systems/InteractionSystem.js';

import { WorldGenerator } from '../world/WorldGenerator.js';
import { createBuildingColliders } from '../world/BuildingFactory.js';
import { RoadNetwork } from '../world/RoadNetwork.js';

import { Renderer } from '../rendering/Renderer.js';
import { WorldRenderer } from '../rendering/WorldRenderer.js';
import { BuildingRenderer } from '../rendering/BuildingRenderer.js';
import { EntityRenderer } from '../rendering/EntityRenderer.js';
import { EffectsRenderer } from '../rendering/EffectsRenderer.js';
import { UIRenderer } from '../rendering/UIRenderer.js';

import { InteriorManager } from '../interiors/InteriorManager.js';
import { WeaponShop } from '../interiors/WeaponShop.js';
import { Casino } from '../interiors/Casino.js';

import { createWeaponCatalog, WEAPON_ORDER, getWeaponDefinition } from '../data/WeaponCatalog.js';
import { createHouseStyles } from '../data/HouseStyles.js';
import {
    loadWeaponInventory,
    persistWeaponInventory,
    loadWeaponLoadout,
    persistWeaponLoadout,
    loadCurrentWeaponId,
    persistCurrentWeaponId,
    loadCasinoCredits,
    loadPlayerMoney,
    persistPlayerMoney,
    saveReturnPosition,
    loadReturnPosition,
} from '../data/Persistence.js';

// ---------------------------------------------------------------------------
// Welt-Konstanten (SSOT)
// ---------------------------------------------------------------------------
const WORLD_WIDTH = 3600;
const WORLD_HEIGHT = 2800;
const ROAD_WIDTH = 70;
const ROAD_HALF_WIDTH = 35;
const SIDEWALK_WIDTH = 36;

// ---------------------------------------------------------------------------
// Animations-Konstanten
// ---------------------------------------------------------------------------
const WALK_ANIM_SPEED = 0.1;
const SPRINT_ANIM_SPEED = 0.14;

export class Game {
    /**
     * @param {HTMLCanvasElement} canvas
     */
    constructor(canvas) {
        // ── Basis ────────────────────────────────────────────────────────
        this.canvas = canvas;
        this.eventBus = eventBus;

        // ── Renderer ─────────────────────────────────────────────────────
        this.renderer = new Renderer(canvas);
        this.renderer.resizeCanvas();

        // ── Waffen-Katalog ───────────────────────────────────────────────
        this.weaponCatalog = createWeaponCatalog();

        // ── Haus-Stile ───────────────────────────────────────────────────
        this.houseStyles = createHouseStyles();

        // ── Strassen-Infrastruktur ───────────────────────────────────────
        const roadLayout = RoadNetwork.createCityRoadLayout();
        const crosswalks = RoadNetwork.createCrosswalks();

        // Crosswalk-Areas fuer Vehicle-Yield berechnen
        const crosswalkAreas = crosswalks.map((cw, index) => {
            const half = (cw.span ?? 0) / 2;
            if (cw.orientation === 'horizontal') {
                return {
                    id: index,
                    orientation: 'horizontal',
                    left: cw.x - half,
                    right: cw.x + half,
                    top: cw.y - ROAD_HALF_WIDTH,
                    bottom: cw.y + ROAD_HALF_WIDTH,
                };
            }
            return {
                id: index,
                orientation: 'vertical',
                left: cw.x - ROAD_HALF_WIDTH,
                right: cw.x + ROAD_HALF_WIDTH,
                top: cw.y - half,
                bottom: cw.y + half,
            };
        });

        // ── Welt generieren ──────────────────────────────────────────────
        const worldGenerator = new WorldGenerator({
            houseStyles: this.houseStyles,
            sidewalkWidth: SIDEWALK_WIDTH,
        });

        const worldData = worldGenerator.generateWorld({ crosswalks });
        this.buildings = worldData.buildings;
        this.streetDetails = worldData.streetDetails;

        // ── Road-Network aufbauen ────────────────────────────────────────
        const sidewalkCorridors = RoadNetwork.createSidewalkCorridors(
            roadLayout, crosswalkAreas,
            { sidewalkWidth: SIDEWALK_WIDTH, roadHalfWidth: ROAD_HALF_WIDTH }
        );

        // Haus-Walkway-Korridore hinzufuegen
        const houseWalkwayCorridors = RoadNetwork.createHouseWalkwayCorridors(this.buildings);
        const allCorridors = [...sidewalkCorridors, ...houseWalkwayCorridors];

        const walkableAreas = RoadNetwork.computeWalkableAreas(allCorridors);
        const roadAreas = RoadNetwork.createRoadAreas(roadLayout, { roadHalfWidth: ROAD_HALF_WIDTH });
        const sidewalkObstacles = RoadNetwork.createSidewalkObstacles(this.buildings, { sidewalkWidth: SIDEWALK_WIDTH });

        this.roadNetwork = new RoadNetwork({
            sidewalkCorridors: allCorridors,
            crosswalks,
            walkableAreas,
            sidewalkObstacles,
            roadAreas,
        });

        // crosswalkAreas am RoadNetwork verfuegbar machen (fuer VehicleSystem)
        this.roadNetwork.crosswalkAreas = crosswalkAreas;

        // Strassenlayout fuer Rendering speichern
        this.roadLayout = roadLayout;
        this.crosswalks = crosswalks;

        // ── Collision-System ─────────────────────────────────────────────
        const buildingColliders = createBuildingColliders(this.buildings);
        // CollisionSystem erwartet Gebaeude-Objekte (nicht Collider-Rects),
        // da es intern _getCollisionRects() nutzt
        this.collisionSystem = new CollisionSystem(this.buildings, []);

        // ── Entity-Mover (SSOT fuer alle Positionsaenderungen) ───────────
        this.entityMover = new EntityMover(this.collisionSystem, this.roadNetwork);
        this.entityMover.setWorldBounds(WORLD_WIDTH, WORLD_HEIGHT);

        // ── Persistence laden ────────────────────────────────────────────
        const weaponInventory = loadWeaponInventory();
        const weaponLoadout = loadWeaponLoadout(weaponInventory);
        const currentWeaponId = loadCurrentWeaponId(weaponInventory, weaponLoadout);
        const playerMoney = loadPlayerMoney();
        const casinoCredits = loadCasinoCredits();

        // ── Spieler ──────────────────────────────────────────────────────
        const returnPos = loadReturnPosition();
        this.player = new Player({
            x: returnPos ? returnPos.px : 400,
            y: returnPos ? returnPos.py : 300,
            money: playerMoney,
            casinoCredits,
            currentWeaponId,
            weaponInventory,
            weaponLoadout,
        });

        // ── NPCs und Fahrzeuge ───────────────────────────────────────────
        this.npcs = worldData.dynamicAgents.npcs;
        this.vehicles = worldData.dynamicAgents.vehicles;

        // ── Systeme ──────────────────────────────────────────────────────
        this.inputSystem = new InputSystem(canvas);
        this.movementSystem = new MovementSystem(this.entityMover);
        this.aiSystem = new AISystem(this.entityMover, this.roadNetwork, eventBus, {
            collisionSystem: this.collisionSystem,
            buildings: this.buildings,
        });
        this.vehicleSystem = new VehicleSystem(this.entityMover, this.collisionSystem, this.roadNetwork);
        this.combatSystem = new CombatSystem(eventBus, this.weaponCatalog);
        this.cameraSystem = new CameraSystem(this.renderer.width, this.renderer.height);
        if (returnPos) {
            this.cameraSystem.x = returnPos.cx || 0;
            this.cameraSystem.y = returnPos.cy || 0;
        }
        this.dayNightSystem = new DayNightSystem();

        // ── Interiors ────────────────────────────────────────────────────
        this.interiorManager = new InteriorManager();
        this.weaponShop = new WeaponShop({ weaponOrder: [...WEAPON_ORDER] });
        this.casino = new Casino();

        // ── Interaction-System ───────────────────────────────────────────
        this.interactionSystem = new InteractionSystem(eventBus, this.interiorManager, this.buildings);
        this.interactionSystem.setCasino(this.casino);

        // ── Renderer ─────────────────────────────────────────────────────
        this.worldRenderer = new WorldRenderer(this.renderer);
        this.buildingRenderer = new BuildingRenderer(this.renderer, this.worldRenderer);
        this.buildingRenderer.setHouseStyles(this.houseStyles);
        this.entityRenderer = new EntityRenderer(this.renderer);
        this.effectsRenderer = new EffectsRenderer(this.renderer);
        this.uiRenderer = new UIRenderer(this.renderer, {
            playerPosEl: document.getElementById('playerPos'),
            fpsEl: document.getElementById('fps'),
        });

        // ── Welt-Bounds ──────────────────────────────────────────────────
        this.worldBounds = { width: WORLD_WIDTH, height: WORLD_HEIGHT };

        // ── Game-Loop Timing ─────────────────────────────────────────────
        this._lastTimestamp = 0;
        this._frameCount = 0;
        this._fpsTime = 0;
        this._fps = 60;

        // ── Events verbinden ─────────────────────────────────────────────
        this._bindEvents();
        this._bindInteractionUI();
    }

    // =====================================================================
    //  Event-Bindings
    // =====================================================================

    _bindEvents() {
        // Canvas-Resize
        window.addEventListener('resize', () => {
            this.renderer.resizeCanvas();
            this.cameraSystem.width = this.renderer.width;
            this.cameraSystem.height = this.renderer.height;
        });

        // Weapon-Shop Eintritt
        this.eventBus.on('interaction:enterWeaponShop', (data) => {
            const layout = this.weaponShop.createLayout();
            this.interiorManager.enterInterior(
                'weaponShop', layout, this.player, this.cameraSystem,
                this.inputSystem, this.renderer.width, this.renderer.height
            );
        });

        // Casino Eintritt (navigiert zur Casino-Seite)
        this.eventBus.on('interaction:enterCasino', (data) => {
            persistPlayerMoney(this.player.money);
            saveReturnPosition(
                this.player.x, this.player.y,
                this.cameraSystem.x, this.cameraSystem.y
            );
            const url = this.casino.getCasinoGameUrl();
            window.location.href = url;
        });

        // Enter-Button Click (delegiert an InteractionSystem.performEntry)
        this.eventBus.on('interaction:enterButtonClicked', (data) => {
            this.interactionSystem.performEntry(data.building, this.player);
        });

        // Casino Credits kaufen/auszahlen
        this.eventBus.on('interaction:buyCasinoCredits', () => {
            this.interactionSystem.handleBuyCasinoCredits(this.player);
            this._persistState();
        });

        this.eventBus.on('interaction:cashOutCasinoCredits', () => {
            this.interactionSystem.handleCashOutCasinoCredits(this.player);
            this._persistState();
        });

        // Interior verlassen
        this.eventBus.on('interior:exit', () => {
            this._persistState();
        });

        // NPC getoetet -> Geld droppen
        this.eventBus.on('npc:killed', (data) => {
            const drop = 10 + Math.floor(Math.random() * 40);
            this.player.money += drop;
        });
    }

    /**
     * Verbindet die Interaktions-UI mit dem InteractionSystem.
     */
    _bindInteractionUI() {
        const container = document.getElementById('buildingInteraction');
        const nameEl = document.getElementById('buildingName');
        const messageEl = document.getElementById('buildingMessage');
        const enterButton = document.getElementById('enterBuilding');
        const cancelButton = document.getElementById('cancelInteraction');
        const buyCredits = document.getElementById('buyCasinoCredits');
        const cashOut = document.getElementById('cashOutCasinoCredits');

        if (container) {
            this.interactionSystem.initUI({
                container,
                nameEl,
                messageEl,
                enterButton,
                buyCredits,
                cashOut,
            });

            // Cancel-Button
            if (cancelButton) {
                cancelButton.addEventListener('click', () => {
                    this.interactionSystem.hideInteractionUI();
                });
            }
        }
    }

    // =====================================================================
    //  Persistence
    // =====================================================================

    _persistState() {
        persistWeaponInventory(this.player.weaponInventory);
        persistWeaponLoadout(this.player.weaponLoadout, this.player.weaponInventory);
        persistCurrentWeaponId(this.player.currentWeaponId, this.player.weaponInventory);
        persistPlayerMoney(this.player.money);
    }

    // =====================================================================
    //  Update
    // =====================================================================

    /**
     * @param {number} deltaTime - Zeit seit letztem Frame in Sekunden
     * @param {number} now - performance.now() Zeitstempel
     */
    update(deltaTime, now) {
        const scene = this.interiorManager.scene;

        if (scene === 'overworld') {
            this._updateOverworld(deltaTime, now);
        } else if (scene === 'weaponShop') {
            this._updateWeaponShop(deltaTime, now);
        }

        // Input-Flags am Frame-Ende zuruecksetzen
        this.inputSystem.update();
    }

    /**
     * Overworld-Update
     * @param {number} deltaTime
     * @param {number} now
     */
    _updateOverworld(deltaTime, now) {
        const player = this.player;

        // Maus-Weltposition aktualisieren
        this.inputSystem.updateMouseWorldPosition(this.cameraSystem);

        // Spieler-Bewegung
        const { dx, dy } = this.inputSystem.getMovementVector();
        const sprinting = this.inputSystem.isSprinting();
        const speed = sprinting ? player.baseSpeed * player.sprintMultiplier : player.baseSpeed;

        if (dx !== 0 || dy !== 0) {
            const targetX = player.x + dx * speed;
            const targetY = player.y + dy * speed;
            this.entityMover.move(player, targetX, targetY);
            player.moving = true;
        } else {
            player.moving = false;
        }

        // KI-System (NPC-Bewegung, Panik, Stuck-Detection)
        this.aiSystem.update(this.npcs, player, deltaTime);

        // Fahrzeug-System
        this.vehicleSystem.update(this.vehicles, this.npcs, deltaTime);

        // Fahrzeug-Collider aktualisieren
        this.collisionSystem.updateVehicleColliders(this.vehicles);

        // Kampf-System
        this.combatSystem.update(player, this.npcs, deltaTime);

        // Schuss verarbeiten
        const mouseWorld = this.inputSystem.getMouseWorldPosition();
        this.combatSystem.fireWeapon(
            player,
            mouseWorld,
            { justPressed: this.inputSystem.isFirePressed(), active: this.inputSystem.isFireDown() },
            now
        );

        // Interaktions-System (Gebaeude-Proximity)
        this.interactionSystem.update(player, this.inputSystem);

        // Waffenwechsel per Zahlentasten
        this._handleWeaponSwitch();

        // Kamera
        this.cameraSystem.update(player, this.worldBounds);

        // Tag/Nacht-Zyklus
        this.dayNightSystem.update(now);

        // Spieler-Animation
        if (player.moving) {
            const animSpeed = sprinting ? SPRINT_ANIM_SPEED : WALK_ANIM_SPEED;
            player.animationPhase = (player.animationPhase + speed * animSpeed) % (Math.PI * 2);
        } else {
            player.animationPhase *= 0.85;
        }
    }

    /**
     * Weapon-Shop-Update
     * @param {number} deltaTime
     * @param {number} now
     */
    _updateWeaponShop(deltaTime, now) {
        const interior = this.interiorManager.activeInterior;
        if (!interior) return;

        // Maus-Position aktualisieren (mit Interior-Offset)
        this.inputSystem.updateMouseWorldPosition(this.cameraSystem, {
            originX: interior.originX,
            originY: interior.originY,
        });

        // Bewegung
        this.weaponShop.handleMovement(interior, this.player, this.inputSystem);

        // Zustand aktualisieren
        this.weaponShop.updateState(interior, this.player);

        // Interaktion
        const action = this.weaponShop.handleInteraction(interior, this.inputSystem);
        if (action) {
            this._handleWeaponShopAction(action, interior);
        }

        // Schuss im Weapon-Shop (zum Testen)
        const mouseWorld = this.inputSystem.getMouseWorldPosition();
        this.combatSystem.fireWeapon(
            this.player,
            mouseWorld,
            { justPressed: this.inputSystem.isFirePressed(), active: this.inputSystem.isFireDown() },
            now
        );

        // Projektile aktualisieren
        this.combatSystem.update(this.player, [], deltaTime);

        // Spieler-Animation
        if (this.player.moving) {
            this.player.animationPhase = (this.player.animationPhase + this.player.speed * WALK_ANIM_SPEED) % (Math.PI * 2);
        } else {
            this.player.animationPhase *= 0.85;
        }
    }

    /**
     * Verarbeitet Aktionen aus dem WeaponShop-Interaction-Handler.
     * @param {{ action: string, data?: any }} action
     * @param {object} interior
     */
    _handleWeaponShopAction(action, interior) {
        switch (action.action) {
            case 'exit':
                this.interiorManager.exitInterior(this.player, this.cameraSystem, this.inputSystem);
                break;

            case 'purchase': {
                const weaponId = action.data;
                const weapon = getWeaponDefinition(this.weaponCatalog, weaponId);
                if (!weapon) break;

                if (this.player.weaponInventory.has(weaponId)) {
                    interior.messageText = weapon.name + ' - bereits im Besitz!';
                    interior.messageTimer = 120;
                    break;
                }

                const price = weapon.price ?? 0;
                if (this.player.money < price) {
                    interior.messageText = 'Nicht genug Geld! (' + price + '$ benoetigt)';
                    interior.messageTimer = 120;
                    break;
                }

                this.player.money -= price;
                this.player.weaponInventory.add(weaponId);
                this.player.currentWeaponId = weaponId;

                // Loadout aktualisieren (in freien Slot oder ersetzen)
                if (this.player.weaponLoadout.length < 3 && !this.player.weaponLoadout.includes(weaponId)) {
                    this.player.weaponLoadout.push(weaponId);
                }

                interior.messageText = weapon.name + ' gekauft!';
                interior.messageTimer = 120;

                this._persistState();
                break;
            }
        }
    }

    /**
     * Verarbeitet Waffenwechsel per Zahlentasten.
     */
    _handleWeaponSwitch() {
        const ownedWeapons = WEAPON_ORDER.filter((id) => this.player.weaponInventory.has(id));

        for (let i = 0; i < ownedWeapons.length; i++) {
            const key = String(i + 1);
            if (this.inputSystem.isKeyPressed(key)) {
                this.player.currentWeaponId = ownedWeapons[i];
                persistCurrentWeaponId(this.player.currentWeaponId, this.player.weaponInventory);
                break;
            }
        }
    }

    // =====================================================================
    //  Render
    // =====================================================================

    render() {
        this.renderer.clear();

        const scene = this.interiorManager.scene;

        if (scene === 'overworld') {
            this._renderOverworld();
        } else if (scene === 'weaponShop') {
            this._renderWeaponShop();
        }
    }

    _renderOverworld() {
        const camera = this.cameraSystem;
        const ctx = this.renderer.getContext();

        this.renderer.save();
        this.renderer.translate(-camera.x, -camera.y);

        // Welt
        this.worldRenderer.drawGrass(WORLD_WIDTH, WORLD_HEIGHT);
        this.worldRenderer.drawRoads(this.roadLayout, this.crosswalks, ROAD_WIDTH, ROAD_HALF_WIDTH);
        this.worldRenderer.drawSidewalks(this.roadLayout, SIDEWALK_WIDTH, ROAD_WIDTH, ROAD_HALF_WIDTH);
        this.worldRenderer.drawStreetDetails(this.streetDetails);

        // Gebaeude
        this.buildingRenderer.drawBuildings(this.buildings);

        // Effekte (Blut)
        this.effectsRenderer.drawBloodDecals(this.combatSystem.bloodDecals);

        // Entities
        this.entityRenderer.drawVehicles(this.vehicles);
        this.entityRenderer.drawNPCs(this.npcs);

        // Spieler
        const currentWeapon = getWeaponDefinition(this.weaponCatalog, this.player.currentWeaponId);
        this.entityRenderer.drawPlayer(
            this.player,
            currentWeapon,
            this.inputSystem.mouse,
            this.interactionSystem.nearBuilding
        );

        // Projektile (Overworld)
        this.effectsRenderer.drawProjectiles(this.combatSystem.projectiles, 'overworld');

        // Tag/Nacht-Overlay
        const lighting = this.dayNightSystem.getCurrentLighting();
        this.uiRenderer.drawDayNightOverlay(
            lighting,
            camera.x, camera.y,
            this.renderer.width, this.renderer.height,
            this.dayNightSystem.stars,
            this.dayNightSystem.starPhase
        );

        this.renderer.restore();

        // HUD (Bildschirm-Koordinaten)
        this.uiRenderer.drawHUD(
            this.player,
            this._fps,
            this.weaponCatalog,
            this.player.weaponInventory,
            this.player.weaponLoadout,
            WEAPON_ORDER,
            this.player.money,
            this.player.casinoCredits,
            this.casino.creditRate
        );

        // Crosshair
        this.uiRenderer.drawCrosshair(this.inputSystem.mouse);
    }

    _renderWeaponShop() {
        const interior = this.interiorManager.activeInterior;
        if (!interior) return;

        const ctx = this.renderer.getContext();

        // Hintergrund
        ctx.fillStyle = '#1a1d23';
        ctx.fillRect(0, 0, this.renderer.width, this.renderer.height);

        ctx.save();
        ctx.translate(interior.originX, interior.originY);

        // Boden
        ctx.fillStyle = '#2a2d33';
        ctx.fillRect(0, 0, interior.width, interior.height);

        // Rand
        ctx.strokeStyle = '#4a4d53';
        ctx.lineWidth = 3;
        ctx.strokeRect(1, 1, interior.width - 2, interior.height - 2);

        // Theke
        const counter = interior.counter;
        ctx.fillStyle = '#3d3225';
        ctx.fillRect(counter.x, counter.y, counter.width, counter.height);
        ctx.strokeStyle = '#5a4b3a';
        ctx.lineWidth = 2;
        ctx.strokeRect(counter.x, counter.y, counter.width, counter.height);

        // Showcases
        for (const showcase of interior.showcases) {
            ctx.fillStyle = 'rgba(40, 50, 65, 0.85)';
            ctx.fillRect(showcase.x, showcase.y, showcase.width, showcase.height);
            ctx.strokeStyle = 'rgba(100, 130, 170, 0.5)';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(showcase.x, showcase.y, showcase.width, showcase.height);

            // Waffen-Silhouette
            const weapon = getWeaponDefinition(this.weaponCatalog, showcase.weaponId);
            if (weapon) {
                const owned = this.player.weaponInventory.has(showcase.weaponId);
                this.entityRenderer.drawWeaponSilhouette(
                    showcase.x + showcase.width / 2,
                    showcase.y + showcase.height / 2,
                    weapon,
                    { scale: 0.8, alpha: owned ? 1 : 0.5 }
                );

                // Preis / Besessen
                ctx.fillStyle = owned ? '#4CAF50' : '#ffd166';
                ctx.font = '12px Arial';
                ctx.textAlign = 'center';
                ctx.fillText(
                    owned ? 'Besessen' : weapon.price + '$',
                    showcase.x + showcase.width / 2,
                    showcase.y + showcase.height - 6
                );
            }
        }

        // Cabinets
        for (const cabinet of interior.cabinets) {
            ctx.fillStyle = '#2a2318';
            ctx.fillRect(cabinet.x, cabinet.y, cabinet.width, cabinet.height);
        }

        // Service-Matte
        const mat = interior.serviceMat;
        ctx.fillStyle = 'rgba(80, 70, 55, 0.4)';
        ctx.fillRect(mat.x, mat.y, mat.width, mat.height);

        // Verkaeufer
        if (interior.vendor) {
            this.entityRenderer.drawCharacterParts({
                x: interior.vendor.x,
                y: interior.vendor.y,
                parts: interior.vendor.parts,
                animationPhase: interior.vendor.animationPhase,
                moving: interior.vendor.moving,
            });
        }

        // Spieler
        const currentWeapon = getWeaponDefinition(this.weaponCatalog, this.player.currentWeaponId);
        this.entityRenderer.drawPlayer(this.player, currentWeapon, this.inputSystem.mouse, false);

        // Projektile
        this.effectsRenderer.drawProjectiles(this.combatSystem.projectiles, 'weaponShop', interior);

        // Exit-Zone
        const exit = interior.exitZone;
        ctx.fillStyle = 'rgba(76, 175, 80, 0.3)';
        ctx.fillRect(exit.x, exit.y, exit.width, exit.height);
        ctx.fillStyle = '#4CAF50';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Ausgang (E)', exit.x + exit.width / 2, exit.y + exit.height / 2 + 5);

        // Vendor-Hinweis
        if (interior.playerNearVendor && !interior.menuOpen) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(interior.vendor.x - 60, interior.vendor.y - 50, 120, 24);
            ctx.fillStyle = '#FFF';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('E: Shop oeffnen', interior.vendor.x, interior.vendor.y - 33);
        }

        // Kauf-Menu
        if (interior.menuOpen) {
            this._drawWeaponShopMenu(ctx, interior);
        }

        // Nachricht
        if (interior.messageText) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
            ctx.fillRect(interior.width / 2 - 160, interior.height - 60, 320, 32);
            ctx.fillStyle = '#ffd166';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(interior.messageText, interior.width / 2, interior.height - 40);
        }

        ctx.restore();

        // Crosshair
        this.uiRenderer.drawCrosshair(this.inputSystem.mouse);
    }

    /**
     * Zeichnet das Waffen-Kauf-Menu.
     * @param {CanvasRenderingContext2D} ctx
     * @param {object} interior
     */
    _drawWeaponShopMenu(ctx, interior) {
        const menuX = interior.width / 2 - 180;
        const menuY = interior.height / 2 - 120;
        const menuW = 360;
        const itemH = 36;
        const options = interior.menuOptions ?? [];

        const menuH = 40 + options.length * itemH + 20;

        ctx.fillStyle = 'rgba(12, 16, 24, 0.92)';
        ctx.fillRect(menuX, menuY, menuW, menuH);
        ctx.strokeStyle = '#4CAF50';
        ctx.lineWidth = 2;
        ctx.strokeRect(menuX, menuY, menuW, menuH);

        ctx.fillStyle = '#4CAF50';
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Waffen kaufen', menuX + menuW / 2, menuY + 28);

        for (let i = 0; i < options.length; i++) {
            const weaponId = options[i];
            const weapon = getWeaponDefinition(this.weaponCatalog, weaponId);
            if (!weapon) continue;

            const itemY = menuY + 44 + i * itemH;
            const selected = i === interior.menuSelection;
            const owned = this.player.weaponInventory.has(weaponId);

            if (selected) {
                ctx.fillStyle = 'rgba(76, 175, 80, 0.3)';
                ctx.fillRect(menuX + 8, itemY, menuW - 16, itemH - 4);
            }

            ctx.fillStyle = owned ? '#4CAF50' : '#ffffff';
            ctx.font = '14px Arial';
            ctx.textAlign = 'left';

            const label = weapon.name + (owned ? ' [Besessen]' : ' - ' + weapon.price + '$');
            ctx.fillText(label, menuX + 20, itemY + 22);
        }

        ctx.fillStyle = '#888';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('W/S: Navigieren | Enter: Kaufen | Q/Esc: Schliessen', menuX + menuW / 2, menuY + menuH - 8);
    }

    // =====================================================================
    //  Game Loop
    // =====================================================================

    /**
     * @param {number} timestamp - performance.now()
     */
    gameLoop(timestamp) {
        // DeltaTime berechnen (in Sekunden, gecapped bei 100ms)
        const rawDelta = timestamp - this._lastTimestamp;
        const deltaTime = Math.min(rawDelta / 1000, 0.1);
        this._lastTimestamp = timestamp;

        // FPS berechnen
        this._frameCount++;
        this._fpsTime += rawDelta;
        if (this._fpsTime >= 1000) {
            this._fps = this._frameCount;
            this._frameCount = 0;
            this._fpsTime = 0;
            this.uiRenderer.updateFPSDisplay(this._fps);
        }

        this.update(deltaTime, timestamp);
        this.render();

        requestAnimationFrame((ts) => this.gameLoop(ts));
    }

    /**
     * Startet die Game-Loop.
     */
    start() {
        this._lastTimestamp = performance.now();
        requestAnimationFrame((ts) => this.gameLoop(ts));
    }
}

export default Game;
