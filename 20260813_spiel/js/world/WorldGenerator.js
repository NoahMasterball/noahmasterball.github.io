/**
 * WorldGenerator - Erstellt die gesamte Spielwelt (Gebaeude, NPCs, Fahrzeuge).
 *
 * Portiert aus gta_old/overworld/js/overworld.js:
 *   createCityBuildings()      Zeilen 3247-3595
 *   createDynamicAgents()      Zeilen 4550-4999
 *   createHouseVisitorNPCs()   Zeilen 3784-4169
 *
 * SSOT: Alle Welterzeugungs-Daten hier zentralisiert.
 * Gebaeude-Objekte werden ueber BuildingFactory erstellt,
 * NPC/Vehicle-Instanzen ueber NPC.js/Vehicle.js.
 */

import { NPC } from '../entities/NPC.js';
import { Vehicle } from '../entities/Vehicle.js';
import { createHouseStyles } from '../data/HouseStyles.js';
import { pseudoRandom2D } from '../core/MathUtils.js';
import { createStreetDetails } from './StreetDetails.js';

// ---------------------------------------------------------------------------
// Residential-Blueprints (SSOT fuer alle Wohnhaus-Positionen)
// ---------------------------------------------------------------------------
const RESIDENTIAL_BLUEPRINTS = [
    { x: 280, y: 980, width: 250, height: 300, styleIndex: 0, floors: 6, roofGarden: true, balconyRhythm: 2, erker: true, walkwayExtension: 48, walkwaySpurLength: 220, walkwaySpurWidth: 22 },
    { x: 560, y: 960, width: 300, height: 280, styleIndex: 1, floors: 5, roofGarden: false, balconyRhythm: 3, walkwayExtension: 48, walkwaySpurLength: 220, walkwaySpurWidth: 22 },
    { x: 280, y: 1300, width: 240, height: 320, styleIndex: 3, floors: 4, roofGarden: true, balconyRhythm: 2 },
    { x: 560, y: 1310, width: 300, height: 300, styleIndex: 4, floors: 7, roofGarden: false, balconyRhythm: 4 },
    { x: 980, y: 960, width: 260, height: 260, styleIndex: 2, floors: 7, roofGarden: true, balconyRhythm: 3 },
    { x: 1260, y: 960, width: 280, height: 240, styleIndex: 5, floors: 5, roofGarden: false, balconyRhythm: 2, stepped: true },
    { x: 980, y: 1300, width: 260, height: 260, styleIndex: 0, floors: 5, roofGarden: true, balconyRhythm: 3 },
    { x: 1270, y: 1280, width: 340, height: 280, styleIndex: 1, floors: 6, roofGarden: true, balconyRhythm: 3, erker: true },
    { x: 1760, y: 320, width: 300, height: 320, styleIndex: 2, floors: 6, roofGarden: true, balconyRhythm: 2 },
    { x: 2080, y: 320, width: 300, height: 280, styleIndex: 4, floors: 5, roofGarden: false, balconyRhythm: 3 },
    { x: 1760, y: 660, width: 520, height: 180, styleIndex: 5, floors: 4, roofGarden: true, balconyRhythm: 2 },
    { x: 1760, y: 980, width: 300, height: 260, styleIndex: 1, floors: 6, roofGarden: true, balconyRhythm: 3 },
    { x: 2080, y: 980, width: 300, height: 260, styleIndex: 3, floors: 5, roofGarden: false, balconyRhythm: 2 },
    { x: 1760, y: 1320, width: 300, height: 300, styleIndex: 2, floors: 7, roofGarden: true, balconyRhythm: 3, erker: true },
    { x: 2080, y: 1320, width: 300, height: 300, styleIndex: 0, floors: 5, roofGarden: true, balconyRhythm: 2 },
    { x: 1760, y: 1840, width: 300, height: 320, styleIndex: 4, floors: 5, roofGarden: true, balconyRhythm: 2 },
    { x: 2080, y: 1840, width: 300, height: 320, styleIndex: 5, floors: 4, roofGarden: true, balconyRhythm: 3 },
    { x: 1760, y: 2200, width: 300, height: 200, styleIndex: 3, floors: 5, roofGarden: true, balconyRhythm: 2 },
    { x: 2080, y: 2200, width: 300, height: 200, styleIndex: 1, floors: 6, roofGarden: false, balconyRhythm: 3 },
    { x: 280, y: 1840, width: 260, height: 320, styleIndex: 2, floors: 5, roofGarden: true, balconyRhythm: 2 },
    { x: 580, y: 1840, width: 260, height: 320, styleIndex: 5, floors: 4, roofGarden: true, balconyRhythm: 3 },
    { x: 280, y: 2200, width: 260, height: 200, styleIndex: 0, floors: 5, roofGarden: true, balconyRhythm: 3 },
    { x: 580, y: 2200, width: 260, height: 200, styleIndex: 4, floors: 6, roofGarden: false, balconyRhythm: 2, weaponShop: true },
];

// ---------------------------------------------------------------------------
// NPC-Paletten fuer Haus-Besucher (SSOT)
// ---------------------------------------------------------------------------
const VISITOR_PALETTES = [
    { head: "#f2d1b3", torso: "#355070", limbs: "#2a3d66", accent: "#b1e5f2", hair: "#2f1b25" },
    { head: "#f8cbbb", torso: "#6d597a", limbs: "#463764", accent: "#ffb4a2", hair: "#2d142c" },
    { head: "#f6d5a5", torso: "#588157", limbs: "#3a5a40", accent: "#a3b18a", hair: "#5b3711" },
    { head: "#f1d3ce", torso: "#0081a7", limbs: "#005f73", accent: "#83c5be", hair: "#0d1b2a" },
    { head: "#f7d6bf", torso: "#bc4749", limbs: "#6a040f", accent: "#fcbf49", hair: "#432818" },
    { head: "#efd3b4", torso: "#2a9d8f", limbs: "#1d6f6a", accent: "#e9c46a", hair: "#264653" },
    { head: "#f2ceb9", torso: "#4361ee", limbs: "#3a0ca3", accent: "#4cc9f0", hair: "#1a1b41" },
    { head: "#f9d5c4", torso: "#f3722c", limbs: "#d8572a", accent: "#f8961e", hair: "#7f5539" },
    { head: "#f5d2bc", torso: "#2b9348", limbs: "#007f5f", accent: "#80ed99", hair: "#2f2f2f" },
    { head: "#f0cfd0", torso: "#9d4edd", limbs: "#7b2cbf", accent: "#c77dff", hair: "#3c096c" },
];

// ---------------------------------------------------------------------------
// Standard Tag/Nacht Phasen-Dauern
// ---------------------------------------------------------------------------
const DEFAULT_PHASE_DURATIONS = [
    { id: "day", duration: 300000 },
    { id: "dusk", duration: 120000 },
    { id: "night", duration: 300000 },
    { id: "dawn", duration: 120000 },
];

// ---------------------------------------------------------------------------
// WorldGenerator
// ---------------------------------------------------------------------------
export class WorldGenerator {

    /**
     * @param {object} [config={}]
     * @param {Array}  [config.houseStyles] - Hausstile (aus HouseStyles.js)
     * @param {boolean} [config.enableHouseResidents=true]
     * @param {object} [config.dayNightCycle] - Tag/Nacht-Zyklus-Konfiguration
     * @param {object} [config.roadNetwork] - RoadNetwork-Instanz (fuer Sidewalk-Projektion)
     * @param {number} [config.sidewalkWidth=36]
     */
    constructor(config = {}) {
        this.houseStyles = config.houseStyles ?? createHouseStyles();
        this.enableHouseResidents = config.enableHouseResidents !== false;
        this.dayNightCycle = config.dayNightCycle ?? null;
        this.roadNetwork = config.roadNetwork ?? null;
        this.sidewalkWidth = config.sidewalkWidth ?? 36;
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /**
     * Generiert die komplette Spielwelt.
     *
     * @param {object} [options={}]
     * @param {Array}  [options.crosswalks] - Zebrastreifen (fuer NPC-Crosswalk-Referenzen)
     * @returns {{ buildings: Array, streetDetails: object, dynamicAgents: { npcs: Array<NPC>, vehicles: Array<Vehicle> } }}
     */
    generateWorld(options = {}) {
        const buildings = this._createCityBuildings();
        const streetDetails = createStreetDetails({
            roadHalfWidth: 35,
            sidewalkWidth: this.sidewalkWidth,
        });
        const dynamicAgents = this._createDynamicAgents(buildings, options.crosswalks ?? []);

        return { buildings, streetDetails, dynamicAgents };
    }

    // -----------------------------------------------------------------------
    // createCityBuildings - Portiert aus Zeilen 3247-3595
    // -----------------------------------------------------------------------

    _createCityBuildings() {
        const buildings = [];

        // Polizeihauptquartier
        buildings.push({
            x: 320, y: 340, width: 520, height: 420,
            name: "Polizeihauptquartier", type: "police", interactive: true,
        });

        // Casino Tower mit Podium-Collision
        const casinoTower = {
            x: 3040, y: 960, width: 238, height: 560,
            name: "Starlight Casino Tower", type: "casino", interactive: true,
        };
        const casinoApron = Math.max(60, Math.round(casinoTower.width * 0.3));
        const casinoPodiumHeight = Math.max(72, Math.min(120, Math.round(casinoTower.height * 0.22)));
        const casinoPlinthHeight = 40;
        const casinoPodiumY = casinoTower.y + casinoTower.height - 16;
        casinoTower.collisionRects = [
            { x: casinoTower.x, y: casinoTower.y, width: casinoTower.width, height: casinoTower.height },
            { x: casinoTower.x - casinoApron, y: casinoPodiumY, width: casinoTower.width + casinoApron * 2, height: casinoPodiumHeight + casinoPlinthHeight },
        ];
        buildings.push(casinoTower);

        // Downtown Hochhaeuser
        buildings.push({
            x: 2540, y: 940, width: 160, height: 540,
            name: "Aurora Financial Center", type: "officeTower", interactive: false,
        });
        buildings.push({
            x: 2720, y: 980, width: 150, height: 500,
            name: "Skyline Exchange", type: "residentialTower", interactive: false,
        });

        // Mixed-Use Block
        buildings.push({
            x: 1080, y: 1820, width: 600, height: 420,
            name: "Aurora Quartier", type: "mixedUse", interactive: true,
            subUnits: [
                { label: "Aurora Restaurant", accent: "#f78f5c" },
                { label: "Stadtmarkt", accent: "#7fd491" },
                { label: "Polizeiposten", accent: "#5da1ff" },
            ],
        });

        // Wohnhaeuser aus Blueprints
        let houseCounter = 1;
        for (const blueprint of RESIDENTIAL_BLUEPRINTS) {
            if (blueprint.weaponShop) {
                buildings.push({
                    x: blueprint.x, y: blueprint.y,
                    width: blueprint.width, height: blueprint.height,
                    name: "Ammu-Nation", type: "weaponShop", interactive: true,
                });
                continue;
            }

            const styleIndex = blueprint.styleIndex % this.houseStyles.length;
            const lotPaddingBase = Math.min(36, Math.min(blueprint.width, blueprint.height) * 0.22);
            const maxInset = Math.max(0, Math.min(blueprint.width, blueprint.height) / 2 - 20);
            const collisionPadding = Math.max(0, Math.min(lotPaddingBase * 0.95, maxInset));

            buildings.push({
                x: blueprint.x, y: blueprint.y,
                width: blueprint.width, height: blueprint.height,
                lotPadding: lotPaddingBase,
                collisionPadding,
                name: `Wohnhaus ${houseCounter}`,
                type: "house",
                interactive: true,
                colorIndex: styleIndex,
                variant: {
                    styleIndex,
                    floors: blueprint.floors,
                    roofGarden: blueprint.roofGarden,
                    balconyRhythm: blueprint.balconyRhythm,
                    erker: Boolean(blueprint.erker),
                    stepped: Boolean(blueprint.stepped),
                    walkwayExtension: blueprint.walkwayExtension ?? 0,
                    walkwaySpurLength: blueprint.walkwaySpurLength ?? 0,
                    walkwaySpurWidth: blueprint.walkwaySpurWidth ?? 0,
                },
            });
            houseCounter++;
        }

        // IDs und Metriken zuweisen
        let buildingIdCounter = 1;
        for (const building of buildings) {
            if (!building) {
                continue;
            }

            building.id = `building_${buildingIdCounter++}`;

            if (building.type === "house") {
                const metrics = WorldGenerator.computeHouseMetrics(building, this.houseStyles);
                if (metrics) {
                    building.metrics = metrics;
                    building.entrance = metrics.entrance;
                    building.approach = metrics.approach;
                    building.interiorPoint = metrics.interior;

                    if (!building.bounds) {
                        building.bounds = metrics.bounds;
                    }

                    const houseBodyWidth = Math.max(0, Number(metrics.houseWidth ?? 0));
                    const houseBodyHeight = Math.max(0, Number(metrics.houseHeight ?? 0));

                    if (houseBodyWidth > 0 && houseBodyHeight > 0) {
                        const houseBodyX = Number(building.x ?? 0) + Number(metrics.houseX ?? 0);
                        const houseBodyY = Number(building.y ?? 0) + Number(metrics.houseY ?? 0);
                        const variantDetails = building.variant ?? {};
                        const walkway = metrics.walkway ?? {};
                        const walkwayHeight = Math.max(0, Number(walkway.height ?? 0));
                        const walkwayExtension = Math.max(0, Number(variantDetails.walkwayExtension ?? 0));
                        const frontDepth = Math.max(0, Number(metrics.frontDepth ?? walkwayHeight));
                        const frontBuffer = Math.max(14, Math.min(houseBodyHeight - 4, frontDepth + walkwayExtension));
                        const clippedHeight = Math.max(0, houseBodyHeight - frontBuffer);

                        if (clippedHeight > 0) {
                            building.collisionRects = [{
                                x: houseBodyX,
                                y: houseBodyY,
                                width: houseBodyWidth,
                                height: clippedHeight,
                            }];
                        }
                    }
                }
            }
        }

        return buildings;
    }

    // -----------------------------------------------------------------------
    // createDynamicAgents - Portiert aus Zeilen 4550-4999
    // -----------------------------------------------------------------------

    /**
     * @param {Array} buildings
     * @param {Array} crosswalks
     * @returns {{ npcs: Array<NPC>, vehicles: Array<Vehicle> }}
     */
    _createDynamicAgents(buildings, crosswalks) {
        // Crosswalk-Index-Helfer
        const resolveCrosswalk = (matcher) => {
            if (!Array.isArray(crosswalks)) return -1;
            return crosswalks.findIndex(matcher);
        };

        const mainHorizontal = resolveCrosswalk(
            (cw) => cw.orientation === "horizontal" && cw.y === 1700 && cw.x === 1100
        );
        const safeIndex = (index) => (index >= 0 ? index : null);
        const crosswalkMain = safeIndex(mainHorizontal);

        // Casino-Podium Pfad berechnen
        const casinoTower = Array.isArray(buildings) ? buildings.find((b) => b && b.type === "casino") : null;
        let casinoPodiumPlan = null;

        if (casinoTower) {
            const apron = Math.max(60, Math.round(casinoTower.width * 0.3));
            const podiumHeight = Math.max(72, Math.min(120, Math.round(casinoTower.height * 0.22)));
            const podiumWidth = casinoTower.width + apron * 2;
            const podiumX = casinoTower.x - apron;
            const podiumY = casinoTower.y + casinoTower.height - 16;
            const margin = Math.max(18, Math.min(32, this.sidewalkWidth));
            const topY = podiumY + margin;
            const bottomY = podiumY + podiumHeight - margin;
            const leftX = podiumX + margin;
            const rightX = podiumX + podiumWidth - margin;

            casinoPodiumPlan = {
                path: [
                    { x: leftX, y: topY, wait: 6 },
                    { x: rightX, y: topY, wait: 6 },
                    { x: rightX, y: bottomY, wait: 6 },
                    { x: leftX, y: bottomY, wait: 6 },
                ],
                bounds: {
                    left: podiumX + margin / 1.5,
                    right: podiumX + podiumWidth - margin / 1.5,
                    top: podiumY + margin / 1.5,
                    bottom: podiumY + podiumHeight - margin / 1.5,
                },
            };
        }

        // Statische NPCs
        const npcConfigs = [
            {
                palette: { head: "#f1d2b6", torso: "#3c6e71", limbs: "#284b52", accent: "#f7ede2", hair: '#3b2c1e' },
                bounds: { left: 960, right: 1320, top: 1640, bottom: 1760 },
                spawnPoint: { x: 1140, y: 1700 },
                waypoints: [
                    { x: 980, y: 1660, wait: 12 },
                    { x: 1100, y: 1660, wait: 18, crosswalkIndex: crosswalkMain },
                    { x: 1100, y: 1740, wait: 0 },
                    { x: 1280, y: 1740, wait: 10 },
                    { x: 1100, y: 1740, wait: 6 },
                    { x: 1100, y: 1660, wait: 16, crosswalkIndex: crosswalkMain },
                ],
                stayOnSidewalks: true, speed: 1.25,
            },
            {
                palette: { head: "#f8cfd2", torso: "#6a4c93", limbs: "#413c58", accent: "#ffb5a7", hair: '#2e1f36' },
                bounds: { left: 2920, right: 3200, top: 1180, bottom: 1460 },
                spawnPoint: { x: 3060, y: 1320 },
                waypoints: [
                    { x: 2960, y: 1220, wait: 12 },
                    { x: 3120, y: 1220, wait: 10 },
                    { x: 3120, y: 1400, wait: 12 },
                    { x: 2960, y: 1400, wait: 10 },
                ],
                stayOnSidewalks: true, speed: 1.05,
            },
            {
                palette: { head: "#fbe2b4", torso: "#ff914d", limbs: "#583101", accent: "#ffd166", hair: '#3c2a1f' },
                bounds: { left: 540, right: 780, top: 1660, bottom: 1880 },
                spawnPoint: { x: 660, y: 1770 },
                waypoints: [
                    { x: 600, y: 1820, wait: 14 },
                    { x: 560, y: 1680, wait: 12 },
                    { x: 720, y: 1680, wait: 10 },
                    { x: 760, y: 1840, wait: 16 },
                    { x: 600, y: 1840, wait: 12 },
                ],
                stayOnSidewalks: true, speed: 1.35,
            },
            {
                palette: { head: "#f0cfa0", torso: "#264653", limbs: "#1d3557", accent: "#f4a261", hair: '#2a1d13' },
                bounds: { left: 1050, right: 1620, top: 1800, bottom: 2100 },
                spawnPoint: { x: 1335, y: 1950 },
                waypoints: [
                    { x: 1100, y: 1860, wait: 8 },
                    { x: 1580, y: 1860, wait: 6 },
                    { x: 1580, y: 2040, wait: 8 },
                    { x: 1100, y: 2040, wait: 10 },
                ],
                stayOnSidewalks: true, speed: 1.18,
            },
            {
                palette: { head: "#f3d7c6", torso: "#274060", limbs: "#1b2845", accent: "#7dbad1", hair: '#0f1c2c' },
                bounds: { left: 2480, right: 3360, top: 940, bottom: 1240 },
                spawnPoint: { x: 2920, y: 1090 },
                waypoints: [
                    { x: 2520, y: 980, wait: 6 },
                    { x: 3320, y: 980, wait: 8 },
                    { x: 3320, y: 1180, wait: 10 },
                    { x: 2520, y: 1180, wait: 8 },
                ],
                stayOnSidewalks: true, speed: 1.08,
            },
            {
                palette: { head: "#f2d0b5", torso: "#7a8b99", limbs: "#45525f", accent: "#d9ed92", hair: '#2f1d18' },
                bounds: { left: 320, right: 820, top: 320, bottom: 720 },
                spawnPoint: { x: 570, y: 520 },
                waypoints: [
                    { x: 360, y: 360, wait: 12 },
                    { x: 780, y: 360, wait: 8 },
                    { x: 780, y: 680, wait: 10 },
                    { x: 360, y: 680, wait: 8 },
                ],
                stayOnSidewalks: true, speed: 1.12,
            },
            {
                palette: { head: "#f9d6c1", torso: "#bc4749", limbs: "#6a040f", accent: "#ffb703", hair: '#311019' },
                bounds: { left: 1680, right: 2140, top: 1280, bottom: 1700 },
                spawnPoint: { x: 1910, y: 1490 },
                waypoints: [
                    { x: 1720, y: 1320, wait: 10 },
                    { x: 2100, y: 1320, wait: 6 },
                    { x: 2100, y: 1640, wait: 12 },
                    { x: 1720, y: 1640, wait: 6 },
                ],
                stayOnSidewalks: true, speed: 1.22,
            },
            {
                palette: { head: "#f5ccb2", torso: "#457b9d", limbs: "#1d3557", accent: "#a8dadc", hair: '#16324f' },
                bounds: { left: 2200, right: 2620, top: 1820, bottom: 2280 },
                spawnPoint: { x: 2410, y: 2050 },
                waypoints: [
                    { x: 2240, y: 1880, wait: 8 },
                    { x: 2580, y: 1880, wait: 6 },
                    { x: 2580, y: 2220, wait: 10 },
                    { x: 2240, y: 2220, wait: 6 },
                ],
                stayOnSidewalks: true, speed: 1.14,
            },
            {
                palette: { head: "#f4ceb8", torso: "#2a9d8f", limbs: "#1f6f78", accent: "#e9c46a", hair: '#274046' },
                bounds: { left: 260, right: 760, top: 2000, bottom: 2400 },
                spawnPoint: { x: 510, y: 2200 },
                waypoints: [
                    { x: 300, y: 2060, wait: 8 },
                    { x: 720, y: 2060, wait: 6 },
                    { x: 720, y: 2340, wait: 10 },
                    { x: 300, y: 2340, wait: 6 },
                ],
                stayOnSidewalks: true, speed: 1.02,
            },
            {
                palette: { head: "#f7d6bf", torso: "#1b263b", limbs: "#0d1b2a", accent: "#415a77", hair: '#0b132b' },
                bounds: { left: 2980, right: 3330, top: 1500, bottom: 1620 },
                spawnPoint: { x: 3155, y: 1560 },
                waypoints: [
                    { x: 3000, y: 1520, wait: 4 },
                    { x: 3310, y: 1520, wait: 4 },
                    { x: 3310, y: 1600, wait: 6 },
                    { x: 3000, y: 1600, wait: 6 },
                ],
                stayOnSidewalks: true, speed: 1.35,
            },
        ];

        const npcs = npcConfigs.map((cfg) => new NPC(cfg));

        // Casino-Podium NPC
        if (casinoPodiumPlan) {
            npcs.push(new NPC({
                palette: { head: "#f4d7c8", torso: "#1b3a4b", limbs: "#12263a", accent: "#9ad1d4", hair: '#261d1a' },
                waypoints: casinoPodiumPlan.path,
                bounds: casinoPodiumPlan.bounds,
                speed: 1.08,
                stayOnSidewalks: true,
            }));
        }

        // Haus-Besucher NPCs
        const houseVisitors = this._createHouseVisitorNPCs(buildings);
        if (houseVisitors.length) {
            npcs.push(...houseVisitors);
        }

        // Fahrzeuge
        const vehicles = [
            new Vehicle({
                baseColor: "#d35400", accentColor: "#f5c16f",
                width: 96, height: 44, speed: 2.6,
                path: [
                    { x: 240, y: 1700, wait: 0 },
                    { x: 3320, y: 1700, wait: 18 },
                ],
            }),
            new Vehicle({
                baseColor: "#2980b9", accentColor: "#8fd3fe",
                width: 110, height: 48, speed: 2.4,
                path: [
                    { x: 1700, y: 2600, wait: 20 },
                    { x: 1700, y: 260, wait: 24 },
                ],
            }),
            new Vehicle({
                baseColor: "#6c5ce7", accentColor: "#fd79a8",
                width: 102, height: 46, speed: 2.2,
                path: [
                    { x: 2450, y: 1700, wait: 12 },
                    { x: 3350, y: 1700, wait: 10 },
                    { x: 3350, y: 2400, wait: 12 },
                    { x: 2450, y: 2400, wait: 10 },
                ],
            }),
        ];

        return { npcs, vehicles };
    }

    // -----------------------------------------------------------------------
    // createHouseVisitorNPCs - Portiert aus Zeilen 3784-4169
    // -----------------------------------------------------------------------

    /**
     * @param {Array} buildings
     * @returns {Array<NPC>}
     */
    _createHouseVisitorNPCs(buildings) {
        if (!this.enableHouseResidents) {
            return [];
        }

        if (!Array.isArray(buildings)) {
            return [];
        }

        const houses = buildings.filter(
            (b) => b && b.type === "house" && b.entrance && b.approach && b.interiorPoint
        );

        if (!houses.length) {
            return [];
        }

        // Tag/Nacht-Zyklus Timing
        const cycle = this.dayNightCycle ?? null;
        const phaseDurations = (Array.isArray(cycle?.phases) && cycle.phases.length)
            ? cycle.phases
            : DEFAULT_PHASE_DURATIONS;

        const totalCycleMs = phaseDurations.reduce(
            (sum, phase) => sum + Math.max(0, Number(phase.duration) || 0), 0
        );
        const halfDayMs = Math.max(180000, totalCycleMs > 0 ? totalCycleMs / 2 : 360000);

        const framesFromMs = (ms, minFrames = 60) => {
            const frames = Math.round((Math.max(0, Number(ms) || 0) / 1000) * 60);
            return Math.max(minFrames, frames);
        };

        const distanceSq = (a, b) => {
            if (!a || !b) return Infinity;
            const dx = (a.x ?? 0) - (b.x ?? 0);
            const dy = (a.y ?? 0) - (b.y ?? 0);
            return dx * dx + dy * dy;
        };

        const visitors = [];

        for (let index = 0; index < houses.length; index++) {
            const house = houses[index];
            const metrics = house.metrics ?? WorldGenerator.computeHouseMetrics(house, this.houseStyles);

            if (!metrics) {
                continue;
            }

            const approach = metrics.approach ?? house.approach;
            const entrance = metrics.entrance ?? house.entrance;
            const interior = metrics.interior ?? house.interiorPoint;
            const doorWorld = metrics.door?.world ?? null;

            if (!approach || !entrance || !interior || !doorWorld) {
                continue;
            }

            const walkway = metrics.walkway ?? { width: 32, height: 18 };
            const direction = index % 2 === 0 ? 1 : -1;

            const door = {
                x: doorWorld.x,
                y: doorWorld.bottom ?? doorWorld.y,
            };

            const seedX = (Number(house.x ?? 0) + index * 37.17) * 0.0031;
            const seedY = (Number(house.y ?? 0) + index * 19.91) * 0.0042;
            const rng = pseudoRandom2D(seedX, seedY);

            const baseHalfFrames = framesFromMs(halfDayMs, 1200);
            const insideFrames = Math.max(1200, Math.round(baseHalfFrames * (0.85 + (1 - rng) * 0.3)));
            const outsideFrames = Math.max(900, Math.round(baseHalfFrames * (0.85 + rng * 0.3)));

            const palette = VISITOR_PALETTES[index % VISITOR_PALETTES.length];
            const stride = Math.max(140, (walkway.width ?? 32) * 5.5);
            const travelDepth = Math.max(120, (walkway.height ?? 18) * 8);

            // Sidewalk-Projektion (wenn RoadNetwork verfuegbar)
            const project = (dx, dy) => {
                if (this.roadNetwork) {
                    const projected = this.roadNetwork.findNearestSidewalkSpot(
                        approach.x + dx, approach.y + dy
                    );
                    if (projected && Number.isFinite(projected.x) && Number.isFinite(projected.y)) {
                        return { x: projected.x, y: projected.y };
                    }
                }
                // Fallback: direkte Position
                return { x: approach.x + dx, y: approach.y + dy };
            };

            const pickUniqueSidewalkPoint = (attempts, reference, fallback) => {
                for (const [dx, dy] of attempts) {
                    const candidate = project(dx, dy);
                    if (!candidate) continue;
                    if (reference && distanceSq(candidate, reference) < 64) continue;
                    return candidate;
                }
                return fallback;
            };

            const defaultSidewalk = project(0, 0) ?? { x: approach.x, y: approach.y };

            const sidewalkStart = pickUniqueSidewalkPoint([
                [direction * stride * 0.45, (walkway.height ?? 18) * 0.15],
                [direction * stride * 0.35, 0],
                [direction * stride * 0.55, (walkway.height ?? 18) * 0.35],
            ], null, defaultSidewalk) ?? defaultSidewalk;

            const plazaPoint = pickUniqueSidewalkPoint([
                [direction * stride, travelDepth],
                [direction * stride * 0.95, travelDepth * 1.1],
                [direction * stride * 0.8, travelDepth * 0.9],
                [direction * stride * 0.6, travelDepth],
            ], sidewalkStart, sidewalkStart) ?? sidewalkStart;

            let returnPoint = pickUniqueSidewalkPoint([
                [-direction * stride * 0.3, travelDepth * 0.6],
                [0, travelDepth * 0.75],
                [-direction * stride * 0.45, travelDepth * 0.9],
                [-direction * stride * 0.2, travelDepth * 0.5],
            ], plazaPoint, sidewalkStart) ?? sidewalkStart;

            if (distanceSq(returnPoint, plazaPoint) < 64) {
                const alternate = project(-direction * stride * 0.15, travelDepth * 0.4);
                if (alternate) {
                    returnPoint = alternate;
                }
            }

            // Wait-Zeiten berechnen
            const minWait = 90;
            let walkwayOutWait = Math.max(minWait, Math.round(outsideFrames * 0.12));
            let walkwayBackWait = Math.max(minWait, Math.round(outsideFrames * 0.1));
            let porchWait = Math.max(minWait, Math.round(outsideFrames * 0.08));
            let plazaWait = outsideFrames - walkwayOutWait - walkwayBackWait - porchWait;

            if (plazaWait < minWait * 2) {
                const deficit = (minWait * 2) - plazaWait;
                plazaWait = minWait * 2;
                const adjustable = walkwayOutWait + walkwayBackWait + porchWait;
                if (adjustable > deficit && adjustable > 0) {
                    const ratio = deficit / adjustable;
                    walkwayOutWait = Math.max(minWait, Math.round(walkwayOutWait - walkwayOutWait * ratio));
                    walkwayBackWait = Math.max(minWait, Math.round(walkwayBackWait - walkwayBackWait * ratio));
                    porchWait = Math.max(minWait, Math.round(porchWait - porchWait * ratio));
                }
            }

            const totalWait = walkwayOutWait + walkwayBackWait + porchWait + plazaWait;
            if (totalWait > outsideFrames) {
                const over = totalWait - outsideFrames;
                plazaWait = Math.max(minWait * 2, plazaWait - over);
            }

            const entranceOut = { x: entrance.x, y: entrance.y, wait: 18 };
            const entranceReturn = {
                x: entrance.x, y: entrance.y,
                wait: Math.max(minWait, Math.round(outsideFrames * 0.06)),
            };

            const lateralOffset = Math.min(18, (walkway.width ?? 32) * 0.35) * direction;
            const porchSpot = {
                x: entrance.x + lateralOffset,
                y: entrance.y + (walkway.height ?? 18) * 0.4,
                wait: porchWait,
            };

            const path = [
                { x: interior.x, y: interior.y, wait: insideFrames, interior: true, buildingId: house.id, allowOffSidewalk: true },
                { x: door.x, y: door.y, wait: 6, action: 'exit', buildingId: house.id, allowOffSidewalk: true },
                entranceOut,
                { x: sidewalkStart.x, y: sidewalkStart.y, wait: walkwayOutWait },
                { x: plazaPoint.x, y: plazaPoint.y, wait: plazaWait },
                { x: returnPoint.x, y: returnPoint.y, wait: walkwayBackWait },
                entranceReturn,
                porchSpot,
                { x: door.x, y: door.y, wait: 6, action: 'enter', buildingId: house.id, allowOffSidewalk: true },
            ];

            const bounds = house.bounds ?? metrics.bounds;
            const speed = 0.98 + rng * 0.32;

            const npc = new NPC({
                palette,
                speed,
                stayOnSidewalks: true,
                ignoreSidewalkObstacles: true,
                waypoints: path,
                bounds,
            });

            npc.home = {
                buildingId: house.id,
                entrance: { x: entrance.x, y: entrance.y },
                approach: { x: approach.x, y: approach.y },
                interior: { x: interior.x, y: interior.y },
                door: { x: door.x, y: door.y },
            };

            npc.homeSchedule = { insideFrames, outsideFrames };
            npc.houseResident = true;
            npc.homeId = house.id;
            npc.homeBounds = bounds
                ? { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom }
                : null;

            visitors.push(npc);
        }

        return visitors;
    }

    // -----------------------------------------------------------------------
    // computeHouseMetrics - Statische Methode (SSOT fuer Haus-Geometrie)
    // Portiert aus Zeilen 8748-8970
    // -----------------------------------------------------------------------

    /**
     * Berechnet die Metriken (Abmessungen, Tuer, Eingang, etc.) fuer ein Haus.
     *
     * @param {object} building - Gebaeude-Objekt
     * @param {Array}  [houseStyles] - Hausstile (optional, fuer Palette)
     * @returns {object|null}
     */
    static computeHouseMetrics(building, houseStyles) {
        if (!building || building.type !== "house") {
            return null;
        }

        const lotWidth = Number(building.width ?? 0);
        const lotHeight = Number(building.height ?? 0);

        if (!(lotWidth > 0 && lotHeight > 0)) {
            return null;
        }

        const variant = building.variant ?? {};
        const styleIndex = variant.styleIndex ?? building.colorIndex ?? 0;
        const palettes = Array.isArray(houseStyles) ? houseStyles : [];
        const palette = palettes.length > 0 ? palettes[styleIndex % palettes.length] : {};

        const lotPaddingBase = building.lotPadding ?? Math.min(36, Math.min(lotWidth, lotHeight) * 0.22);
        const sideMax = Math.max(12, (lotWidth - 140) / 2);
        const sidePadding = Math.min(Math.max(14, lotPaddingBase), sideMax);

        let rearPadding = Math.min(lotHeight * 0.22, Math.max(12, lotPaddingBase * 0.65));
        const minHouseHeight = 120;
        const maxFrontSpace = Math.max(20, lotHeight - rearPadding - minHouseHeight);

        let desiredFront = Math.min(maxFrontSpace, Math.max(48, lotPaddingBase * 1.45, lotHeight * 0.26));
        if (desiredFront < 32) {
            desiredFront = Math.min(maxFrontSpace, Math.max(32, lotPaddingBase * 1.15));
        }

        let houseHeight = lotHeight - rearPadding - desiredFront;
        if (houseHeight < minHouseHeight) {
            houseHeight = minHouseHeight;
            desiredFront = lotHeight - rearPadding - houseHeight;
        }

        const houseWidth = Math.max(120, lotWidth - sidePadding * 2);
        const houseX = (lotWidth - houseWidth) / 2;
        const houseY = Math.max(10, rearPadding);
        const houseBottom = houseY + houseHeight;
        const frontDepth = Math.max(10, desiredFront);

        let roofDepth = Math.max(32, Math.min(houseHeight * 0.32, 88));
        if (houseHeight - roofDepth < 96) {
            roofDepth = Math.max(24, houseHeight - 96);
        }

        const facadeHeight = houseHeight - roofDepth;
        const facadeTop = houseY + roofDepth;
        const walkwayWidth = Math.min(48, houseWidth * 0.28);
        const walkwayX = lotWidth / 2 - walkwayWidth / 2;
        const walkwayY = houseBottom;
        const walkwayHeight = frontDepth;

        const doorWidth = Math.min(houseWidth * 0.26, 68);
        const doorHeight = Math.max(58, Math.min(facadeHeight * 0.44, 104));
        const doorX = houseX + houseWidth / 2 - doorWidth / 2;
        const doorY = facadeTop + facadeHeight - doorHeight;

        const houseWorldX = Number(building.x ?? 0);
        const houseWorldY = Number(building.y ?? 0);

        const doorWorldX = houseWorldX + doorX + doorWidth / 2;
        const doorWorldBottom = houseWorldY + doorY + doorHeight;
        const doorWorldCenterY = houseWorldY + doorY + doorHeight / 2;
        const doorWorldInsideY = houseWorldY + doorY + doorHeight * 0.35;
        const walkwayWorldBottom = doorWorldBottom + walkwayHeight;

        const entranceY = doorWorldBottom + Math.max(6, walkwayHeight * 0.35);
        const approachY = walkwayWorldBottom + Math.max(12, walkwayHeight * 0.4);

        const interiorX = houseWorldX + houseX + houseWidth / 2;
        const interiorY = houseWorldY + houseY + Math.max(40, facadeHeight * 0.45);

        const boundsLeft = houseWorldX + houseX - Math.max(20, walkwayWidth * 0.6);
        const boundsRight = houseWorldX + houseX + houseWidth + Math.max(20, walkwayWidth * 0.6);
        const boundsTop = houseWorldY + houseY - Math.max(20, roofDepth * 0.4);
        const minBoundsHeight = Math.max(60, facadeHeight * 0.5);
        const boundsBottom = Math.max(
            boundsTop + minBoundsHeight,
            approachY + Math.max(16, walkwayHeight * 0.2)
        );

        return {
            houseX, houseY, houseWidth, houseHeight, houseBottom,
            roofDepth, facadeTop, facadeHeight, frontDepth,
            walkway: { x: walkwayX, y: walkwayY, width: walkwayWidth, height: walkwayHeight },
            door: {
                x: doorX, y: doorY, width: doorWidth, height: doorHeight,
                world: {
                    x: doorWorldX, y: doorWorldCenterY,
                    bottom: doorWorldBottom, insideY: doorWorldInsideY,
                },
            },
            entrance: { x: doorWorldX, y: entranceY },
            approach: { x: doorWorldX, y: approachY },
            interior: { x: interiorX, y: interiorY },
            bounds: { left: boundsLeft, right: boundsRight, top: boundsTop, bottom: boundsBottom },
            palette,
        };
    }
}

export default WorldGenerator;
