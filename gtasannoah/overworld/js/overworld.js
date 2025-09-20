// 2D Overworld Game Engine - FIXED Coordinates - No Overlapping Houses!

console.log("Script wird geladen!");

class OverworldGame {

    constructor() {

        console.log("OverworldGame wird erstellt!");

        this.canvas = document.getElementById("gameCanvas");

        console.log("Canvas gefunden:", this.canvas);

        if (!this.canvas) {

            console.error("Canvas nicht gefunden!");

            return;

        }

        this.ctx = this.canvas.getContext("2d");

        console.log("Context erstellt:", this.ctx);

        this.resizeCanvas();

        window.addEventListener("resize", () => this.resizeCanvas());

        this.keys = {};

        this.setupInput();

        // Kamera

        this.camera = {

            x: 0,

            y: 0

        };

        // Zoom für kleinere Sichtweite

        this.zoom = 1.0;

        this.player = {

            x: 400,

            y: 300,

            width: 30,

            height: 30,

            baseSpeed: 1.5,

            sprintMultiplier: 2,

            speed: 1.5,

            color: "#FF0000",

            animationPhase: 0,

            moving: false

        };

        this.player.parts = this.buildNPCParts({

            head: '#f6d7c4',

            torso: '#1b4965',

            limbs: '#16324f',

            accent: '#5fa8d3',

            hair: '#2b2118',

            eyes: '#ffffff',

            pupil: '#1b1b1b'

        });

        this.lastTime = 0;

        this.fps = 0;

        this.frameCount = 0;

        this.nearBuilding = null;

        this.interactionUI = document.getElementById("buildingInteraction");

        // FESTE HAUSFARBEN - keine zufälligen Farben mehr!

        this.houseColors = [

            "#DEB887", "#F5DEB3", "#D2B48C", "#BC8F8F", "#CD853F",

            "#D2691E", "#A0522D", "#8B7355", "#D2B48C", "#F4A460"

        ];

        this.houseStyles = this.createHouseStyles();

        this.sidewalkWidth = 36;

        this.roadWidth = 70;

        this.roadHalfWidth = this.roadWidth / 2;

        this.crosswalks = this.createCrosswalks();

        this.crosswalkAreas = this.crosswalks.map((cw, index) => this.computeCrosswalkArea(cw, index));

        this.roadLayout = this.createCityRoadLayout();



        this.sidewalkCorridors = this.createSidewalkCorridors();

        this.buildings = this.createCityBuildings();

        console.log("Buildings prepared", Array.isArray(this.buildings) ? this.buildings.length : this.buildings);

        this.streetDetails = this.createStreetDetails();

        this.dynamicAgents = this.createDynamicAgents();

        this.setupUI();

        console.log("Spiel wird gestartet!");

        this.gameLoop();

    }

    resizeCanvas() {

        this.width = window.innerWidth;

        this.height = window.innerHeight;

        this.canvas.width = this.width;

        this.canvas.height = this.height;

        console.log("Canvas resized:", this.width, "x", this.height);

    }

    setupInput() {

        document.addEventListener("keydown", (e) => {

            this.keys[e.key.toLowerCase()] = true;

            if (e.key.toLowerCase() === "e" && this.nearBuilding) {

                this.showBuildingInteraction(this.nearBuilding);

            }

        });

        document.addEventListener("keyup", (e) => {

            this.keys[e.key.toLowerCase()] = false;

        });

    }

    setupUI() {

        document.getElementById("enterBuilding").addEventListener("click", () => {

            if (this.nearBuilding && this.nearBuilding.type === "casino") {

                window.location.href = "../casinogame/index.html";

            } else {

                alert("Dieses Gebäude ist noch nicht verfügbar!");

            }

            this.hideBuildingInteraction();

        });

        document.getElementById("cancelInteraction").addEventListener("click", () => {

            this.hideBuildingInteraction();

        });

    }

    update() {

        this.handleInput();

        this.updateCamera();

        this.checkBuildingCollisions();

        this.updateAgents();

        this.updatePlayerAnimation();

        this.updateFPS();

    }

    handleInput() {

        let dx = 0;

        let dy = 0;

        const sprinting = this.keys["shift"] || this.keys["shiftleft"] || this.keys["shiftright"];

        const speed = this.player.baseSpeed * (sprinting ? this.player.sprintMultiplier : 1);

        this.player.speed = speed;

        if (this.keys["w"] || this.keys["arrowup"]) dy -= speed;

        if (this.keys["s"] || this.keys["arrowdown"]) dy += speed;

        if (this.keys["a"] || this.keys["arrowleft"]) dx -= speed;

        if (this.keys["d"] || this.keys["arrowright"]) dx += speed;

        this.player.moving = dx !== 0 || dy !== 0;

        let newX = this.player.x + dx;

        let newY = this.player.y + dy;

        // Weltgrenzen - größere Welt

        const worldWidth = 3600;

        const worldHeight = 3000;

        if (newX >= 0 && newX <= worldWidth - this.player.width) {

            this.player.x = newX;

        }

        if (newY >= 0 && newY <= worldHeight - this.player.height) {

            this.player.y = newY;

        }

    }

    updateCamera() {

        // Kamera folgt dem Spieler

        this.camera.x = this.player.x - this.width / 2;

        this.camera.y = this.player.y - this.height / 2;

        // Kamera-Grenzen - größere Welt

        const worldWidth = 3600;

        const worldHeight = 3000;

        this.camera.x = Math.max(0, Math.min(this.camera.x, worldWidth - this.width));

        this.camera.y = Math.max(0, Math.min(this.camera.y, worldHeight - this.height));

    }

    checkBuildingCollisions() {

        this.nearBuilding = null;

        const buildings = this.getAllBuildings();

        if (!Array.isArray(buildings)) {

            return;

        }

        const epsilon = 0.1;

        for (const building of buildings) {

            const basePadding = Math.max(0, building.collisionPadding ?? 0);

            const baseX = Number(building.x ?? 0);

            const baseY = Number(building.y ?? 0);

            const baseWidth = Math.max(0, Number(building.width ?? 0));

            const baseHeight = Math.max(0, Number(building.height ?? 0));

            const baseRect = {

                x: baseX + basePadding,

                y: baseY + basePadding,

                width: Math.max(0, baseWidth - basePadding * 2),

                height: Math.max(0, baseHeight - basePadding * 2)

            };

            const collisionRects = [];

            if (Array.isArray(building.collisionRects) && building.collisionRects.length > 0) {

                for (const rect of building.collisionRects) {

                    if (!rect) {

                        continue;

                    }

                    const rawWidth = Number(rect.width ?? 0);

                    const rawHeight = Number(rect.height ?? 0);

                    if (!(rawWidth > 0 && rawHeight > 0)) {

                        continue;

                    }

                    const rectPadding = Math.max(0, rect.padding ?? 0);

                    const paddedWidth = rawWidth - rectPadding * 2;

                    const paddedHeight = rawHeight - rectPadding * 2;

                    if (!(paddedWidth > 0 && paddedHeight > 0)) {

                        continue;

                    }

                    const resolvedX = Number(rect.x ?? baseX);

                    const resolvedY = Number(rect.y ?? baseY);

                    collisionRects.push({

                        x: resolvedX + rectPadding,

                        y: resolvedY + rectPadding,

                        width: paddedWidth,

                        height: paddedHeight

                    });

                }

            }

            if (collisionRects.length === 0 && baseRect.width > 0 && baseRect.height > 0) {

                collisionRects.push(baseRect);

            }

            let hasCollision = false;

            let buildingIsNear = false;

            for (const rect of collisionRects) {

                const bx = rect.x;

                const by = rect.y;

                const bw = rect.width;

                const bh = rect.height;

                const intersects =

                    this.player.x < bx + bw &&

                    this.player.x + this.player.width > bx &&

                    this.player.y < by + bh &&

                    this.player.y + this.player.height > by;

                if (!hasCollision && intersects) {

                    const overlapLeft = this.player.x + this.player.width - bx;

                    const overlapRight = bx + bw - this.player.x;

                    const overlapTop = this.player.y + this.player.height - by;

                    const overlapBottom = by + bh - this.player.y;

                    const minOverlapX = Math.min(overlapLeft, overlapRight);

                    const minOverlapY = Math.min(overlapTop, overlapBottom);

                    if (minOverlapX < minOverlapY) {

                        if (overlapLeft < overlapRight) {

                            this.player.x = bx - this.player.width - epsilon;

                        } else {

                            this.player.x = bx + bw + epsilon;

                        }

                    } else {

                        if (overlapTop < overlapBottom) {

                            this.player.y = by - this.player.height - epsilon;

                        } else {

                            this.player.y = by + bh + epsilon;

                        }

                    }

                    hasCollision = true;

                }

                if (!buildingIsNear) {

                    const interactionRange = 60;

                    const near =

                        this.player.x < bx + bw + interactionRange &&

                        this.player.x + this.player.width > bx - interactionRange &&

                        this.player.y < by + bh + interactionRange &&

                        this.player.y + this.player.height > by - interactionRange;

                    if (near) {

                        buildingIsNear = true;

                    }

                }

            }

            if (buildingIsNear) {

                this.nearBuilding = building;

            }

        }

    }

    updateFPS() {

        const now = performance.now();

        if (!this.lastTime) {

            this.lastTime = now;

            this.frameCount = 0;

            return;

        }

        this.frameCount++;

        const delta = now - this.lastTime;

        if (delta >= 1000) {

            this.fps = Math.round((this.frameCount * 1000) / delta);

            this.frameCount = 0;

            this.lastTime = now;

            const fpsLabel = document.getElementById("fps");

            if (fpsLabel) {

                fpsLabel.textContent = this.fps;

            }

        }

    }

    render() {

        this.ctx.clearRect(0, 0, this.width, this.height);

        this.ctx.save();

        this.ctx.translate(-this.camera.x, -this.camera.y);

        // Grundfläche in warmem Grün, leicht entsättigt für Golden-Hour-Stimmung

        this.ctx.fillStyle = "#7da57a";

        this.ctx.fillRect(0, 0, 3600, 3000);

        this.drawImprovedRoadSystem();

        this.drawSidewalks();

        this.drawStreetDetails();

        this.drawBuildings();

        this.drawDynamicAgents();

        this.drawPlayer();

        this.drawGoldenHourLighting();

        this.ctx.restore();

        this.drawUI();

    }

    createHouseStyles() {

        return [

            {

                base: "#c37e61",

                accent: "#f7e3c4",

                roof: "#3a3a3a",

                highlight: "#fcd9a9",

                balcony: "#d97757",

                metallic: "#6f8fa6",

                roofGarden: true,

                floors: 6

            },

            {

                base: "#d4d0c5",

                accent: "#faf6ec",

                roof: "#494949",

                highlight: "#ffe4ba",

                balcony: "#9fb4c7",

                metallic: "#6d7c8e",

                roofGarden: false,

                floors: 5

            },

            {

                base: "#8e9faa",

                accent: "#e4eef5",

                roof: "#2d3a4a",

                highlight: "#abd1ff",

                balcony: "#5f7ba6",

                metallic: "#95c4d8",

                roofGarden: true,

                floors: 7

            },

            {

                base: "#b8a089",

                accent: "#f1dfc6",

                roof: "#4d4338",

                highlight: "#ffd9ae",

                balcony: "#f17a52",

                metallic: "#a88a6d",

                roofGarden: true,

                floors: 4

            },

            {

                base: "#9d9aa7",

                accent: "#ebe8f2",

                roof: "#2f2b3f",

                highlight: "#d4c1ff",

                balcony: "#7f89c2",

                metallic: "#616f9d",

                roofGarden: false,

                floors: 6

            },

            {

                base: "#c4b087",

                accent: "#f3e5c3",

                roof: "#4a4131",

                highlight: "#ffcc8a",

                balcony: "#dda15e",

                metallic: "#b7c4c8",

                roofGarden: true,

                floors: 5

            }

        ]

    }

    createCrosswalks() {

        return [

            { x: 1100, y: 1700, orientation: "horizontal", span: 240 },

            { x: 1700, y: 1700, orientation: "vertical", span: 240 },

            { x: 1100, y: 900, orientation: "horizontal", span: 240 },

            { x: 1700, y: 900, orientation: "vertical", span: 240 },

            { x: 2050, y: 1700, orientation: "horizontal", span: 260 }

        ];

    }



    createCityRoadLayout() {

        const roads = [];

        const verticalCorridors = [200, 950, 1700, 2450, 3350];

        const horizontalCorridors = [200, 900, 1700, 2400, 2800];

        for (let y of horizontalCorridors) {

            roads.push({ type: "horizontal", startX: 200, endX: 3400, y });

        }

        for (let x of verticalCorridors) {

            roads.push({ type: "vertical", x, startY: 200, endY: 2800 });

        }

        roads.push({ type: "horizontal", startX: 950, endX: 1700, y: 1260 });

        roads.push({ type: "horizontal", startX: 950, endX: 1700, y: 2100 });

        roads.push({ type: "vertical", x: 1330, startY: 1700, endY: 2400 });

        roads.push({ type: "vertical", x: 2050, startY: 900, endY: 1700 });

        return roads;

    }

    createSidewalkCorridors() {

        const corridors = [];

        const roads = Array.isArray(this.roadLayout) ? this.roadLayout : [];

        const sidewalkWidth = this.sidewalkWidth ?? 36;

        const halfRoad = this.roadHalfWidth ?? ((this.roadWidth ?? 70) / 2);

        const extension = sidewalkWidth;

        for (const road of roads) {

            if (!road) {

                continue;

            }

            if (road.type === "horizontal") {

                const startRaw = Number(road.startX ?? road.x ?? 0);

                const endRaw = Number(road.endX ?? startRaw);

                const startX = Math.min(startRaw, endRaw);

                const endX = Math.max(startRaw, endRaw);

                const y = Number(road.y ?? 0);

                const width = Math.max(0, endX - startX);

                const spanWidth = width + extension * 2;

                const offsetX = startX - extension;

                const upperY = y - halfRoad - sidewalkWidth;

                const lowerY = y + halfRoad;

                corridors.push({

                    x: offsetX,

                    y: upperY,

                    width: spanWidth,

                    height: sidewalkWidth

                });

                corridors.push({

                    x: offsetX,

                    y: lowerY,

                    width: spanWidth,

                    height: sidewalkWidth

                });

            } else if (road.type === "vertical") {

                const startRaw = Number(road.startY ?? road.y ?? 0);

                const endRaw = Number(road.endY ?? startRaw);

                const startY = Math.min(startRaw, endRaw);

                const endY = Math.max(startRaw, endRaw);

                const x = Number(road.x ?? 0);

                const height = Math.max(0, endY - startY);

                const spanHeight = height + extension * 2;

                const offsetY = startY - extension;

                const leftX = x - halfRoad - sidewalkWidth;

                const rightX = x + halfRoad;

                corridors.push({

                    x: leftX,

                    y: offsetY,

                    width: sidewalkWidth,

                    height: spanHeight

                });

                corridors.push({

                    x: rightX,

                    y: offsetY,

                    width: sidewalkWidth,

                    height: spanHeight

                });

            }

        }

        const crosswalkAreas = Array.isArray(this.crosswalkAreas) ? this.crosswalkAreas : [];

        const crosswalkPadding = sidewalkWidth * 0.35;

        for (const area of crosswalkAreas) {

            if (!area) {

                continue;

            }

            const left = Number(area.left ?? area.x ?? 0);

            const top = Number(area.top ?? area.y ?? 0);

            const right = Number(area.right ?? left);

            const bottom = Number(area.bottom ?? top);

            corridors.push({

                x: left - crosswalkPadding,

                y: top - crosswalkPadding,

                width: Math.max(0, (right - left) + crosswalkPadding * 2),

                height: Math.max(0, (bottom - top) + crosswalkPadding * 2)

            });

        }

        return corridors;

    }

    projectPointToSidewalk(x, y) {

        const corridors = Array.isArray(this.sidewalkCorridors) ? this.sidewalkCorridors : [];

        if (!corridors.length) {

            return { x, y, inside: false };

        }

        for (const rect of corridors) {

            if (this.isPointInsideRect(x, y, rect)) {

                return { x, y, inside: true };

            }

        }

        let closest = { x, y, inside: false };

        let bestDist = Infinity;

        for (const rect of corridors) {

            if (!rect) {

                continue;

            }

            const clamped = this.clampPointToRect(x, y, rect);

            const dx = x - clamped.x;

            const dy = y - clamped.y;

            const distSq = dx * dx + dy * dy;

            if (distSq < bestDist) {

                bestDist = distSq;

                closest = { x: clamped.x, y: clamped.y, inside: false };

            }

        }

        return closest;

    }

    clampPointToRect(x, y, rect) {

        const maxX = rect.x + Math.max(0, rect.width);

        const maxY = rect.y + Math.max(0, rect.height);

        const clampedX = Math.min(Math.max(x, rect.x), maxX);

        const clampedY = Math.min(Math.max(y, rect.y), maxY);

        return { x: clampedX, y: clampedY };

    }

    isPointInsideRect(x, y, rect) {

        if (!rect) {

            return false;

        }

        const maxX = rect.x + Math.max(0, rect.width);

        const maxY = rect.y + Math.max(0, rect.height);

        return x >= rect.x && x <= maxX && y >= rect.y && y <= maxY;

    }

    applySidewalkConstraint(agent) {

        if (!agent || agent.stayOnSidewalks === false) {

            return;

        }

        const projected = this.projectPointToSidewalk(agent.x, agent.y);

        agent.x = projected.x;

        agent.y = projected.y;

    }

    createCityBuildings() {

        const buildings = [];

        // Landmark: Polizeihauptquartier mit grossem Hof

        buildings.push({

            x: 320,

            y: 340,

            width: 520,

            height: 420,

            name: "Polizeihauptquartier",

            type: "police",

            interactive: true

        });



        // Downtown Skyline mit verlegtem Casino und Hochh�usern

        const casinoTower = {
            x: 3040,
            y: 960,
            width: 238,
            height: 560,
            name: "Starlight Casino Tower",
            type: "casino",
            interactive: true
        };
        const casinoApron = Math.max(60, Math.round(casinoTower.width * 0.3));
        const casinoPodiumHeight = Math.max(72, Math.min(120, Math.round(casinoTower.height * 0.22)));
        const casinoPlinthHeight = 40;
        const casinoPodiumY = casinoTower.y + casinoTower.height - 16;
        casinoTower.collisionRects = [
            {
                x: casinoTower.x,
                y: casinoTower.y,
                width: casinoTower.width,
                height: casinoTower.height
            },
            {
                x: casinoTower.x - casinoApron,
                y: casinoPodiumY,
                width: casinoTower.width + casinoApron * 2,
                height: casinoPodiumHeight + casinoPlinthHeight
            }
        ];
        buildings.push(casinoTower);

        buildings.push({

            x: 2540,

            y: 940,

            width: 160,

            height: 540,

            name: "Aurora Financial Center",

            type: "officeTower",

            interactive: false

        });

        buildings.push({

            x: 2720,

            y: 980,

            width: 150,

            height: 500,

            name: "Skyline Exchange",

            type: "residentialTower",

            interactive: false

        });



        // Mixed-Use Block mit Restaurant, Supermarkt und Polizeiposten

        buildings.push({

            x: 1080,

            y: 1820,

            width: 600,

            height: 420,

            name: "Aurora Quartier",

            type: "mixedUse",

            interactive: true,

            subUnits: [

                { label: "Aurora Restaurant", accent: "#f78f5c" },

                { label: "Stadtmarkt", accent: "#7fd491" },

                { label: "Polizeiposten", accent: "#5da1ff" }

            ]

        });



        let houseCounter = 1;

        const residentialBlueprints = [

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

            { x: 580, y: 2200, width: 260, height: 200, styleIndex: 4, floors: 6, roofGarden: false, balconyRhythm: 2, weaponShop: true }

        ];

        for (const blueprint of residentialBlueprints) {

            if (blueprint.weaponShop) {

                buildings.push({

                    x: blueprint.x,

                    y: blueprint.y,

                    width: blueprint.width,

                    height: blueprint.height,

                    name: "Ammu-Nation",

                    type: "weaponShop",

                    interactive: false

                });

                continue;

            }

            const styleIndex = blueprint.styleIndex % this.houseStyles.length;

            const lotPaddingBase = Math.min(36, Math.min(blueprint.width, blueprint.height) * 0.22);

            const maxInset = Math.max(0, Math.min(blueprint.width, blueprint.height) / 2 - 20);

            const collisionPadding = Math.max(0, Math.min(lotPaddingBase * 0.95, maxInset));

            buildings.push({

                x: blueprint.x,

                y: blueprint.y,

                width: blueprint.width,

                height: blueprint.height,

                lotPadding: lotPaddingBase,

                collisionPadding,

                name: `Wohnhaus ${houseCounter}`,

                type: "house",

                interactive: false,

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

                    walkwaySpurWidth: blueprint.walkwaySpurWidth ?? 0

                }

            });

            houseCounter++;

        }

        return buildings;

    }

    createStreetDetails() {

        const details = {

            parkingLots: [],

            parkingBays: [],

            trees: [],

            benches: [],

            bikeRacks: [],

            lamps: [],

            bins: [],

            busStops: [],

            puddles: [],

            planters: []

        };

        const treePositions = new Set();

        const addTree = (x, y, size = 30, variant = 0) => {

            const key = `${Math.round(x)}_${Math.round(y)}`;

            if (treePositions.has(key)) {

                return;

            }

            treePositions.add(key);

            details.trees.push({ x, y, size, variant });

        };

        const horizontalRows = [900, 1700];

        for (const y of horizontalRows) {

            const upper = y - this.roadHalfWidth - this.sidewalkWidth / 2;

            const lower = y + this.roadHalfWidth + this.sidewalkWidth / 2;

            for (let x = 260; x <= 3240; x += 220) {

                addTree(x, upper, 30, (x / 220) % 3);

                addTree(x, lower, 32, ((x + 110) / 180) % 3);

            }

        }

        details.parkingLots.push({

            x: 2490,

            y: 1500,

            width: 420,

            height: 140,

            rows: 2,

            slots: 6,

            aisle: 26,

            padding: 14,

            surfaceColor: '#2d2f34'

        });

        const verticalColumns = [950, 1700, 2950, 3350];

        for (const x of verticalColumns) {

            const left = x - this.roadHalfWidth - this.sidewalkWidth / 2;

            const right = x + this.roadHalfWidth + this.sidewalkWidth / 2;

            for (let y = 260; y <= 2360; y += 220) {

                addTree(left, y, 28, (y / 210) % 3);

                addTree(right, y, 28, ((y + 90) / 190) % 3);

            }

        }

        details.benches.push({ x: 1130, y: 1780, orientation: "horizontal" });

        details.benches.push({ x: 1280, y: 1780, orientation: "horizontal" });

        details.benches.push({ x: 1430, y: 1780, orientation: "horizontal" });

        details.benches.push({ x: 1560, y: 980, orientation: "vertical" });

        details.benches.push({ x: 560, y: 1720, orientation: "horizontal" });

        details.bikeRacks.push({ x: 1220, y: 1885, orientation: "horizontal" });

        details.bikeRacks.push({ x: 1380, y: 1885, orientation: "horizontal" });

        details.bikeRacks.push({ x: 1520, y: 840, orientation: "vertical" });

        details.busStops.push({ x: 1040, y: 1680, orientation: "horizontal", length: 140 });

        details.busStops.push({ x: 1860, y: 1680, orientation: "horizontal", length: 140 });

        const lampRows = [

            { y: 1860, start: 1100, end: 1620, step: 120 },

            { y: 820, start: 1180, end: 1540, step: 120 },

            { y: 2120, start: 1780, end: 2320, step: 140 },

            { y: 1180, start: 2760, end: 3260, step: 120 }

        ];

        for (const row of lampRows) {

            for (let x = row.start; x <= row.end; x += row.step) {

                details.lamps.push({ x, y: row.y });

            }

        }

        details.lamps.push({ x: 360, y: 860 });

        details.lamps.push({ x: 360, y: 1740 });

        details.bins.push({ x: 1180, y: 1760 });

        details.bins.push({ x: 1340, y: 1760 });

        details.bins.push({ x: 1500, y: 1760 });

        details.bins.push({ x: 560, y: 1700 });

        details.parkingBays.push({ x: 240, y: 870, width: 110, height: 42, orientation: "horizontal" });

        details.parkingBays.push({ x: 360, y: 870, width: 110, height: 42, orientation: "horizontal" });

        details.parkingBays.push({ x: 480, y: 870, width: 110, height: 42, orientation: "horizontal" });

        details.parkingBays.push({ x: 1880, y: 880, width: 120, height: 46, orientation: "horizontal" });

        details.parkingBays.push({ x: 2980, y: 1140, width: 140, height: 46, orientation: "horizontal" });

        details.planters.push({ x: 1160, y: 1840, width: 80, height: 32 });

        details.planters.push({ x: 1320, y: 1840, width: 80, height: 32 });

        details.planters.push({ x: 1480, y: 1840, width: 80, height: 32 });

        details.puddles.push({ x: 960, y: 880, radius: 26 });

        details.puddles.push({ x: 1620, y: 1680, radius: 32 });

        details.puddles.push({ x: 420, y: 1680, radius: 22 });

        return details;

    }

    getAllBuildings() {

        return this.buildings;

    }

    createDynamicAgents() {

        const resolveCrosswalk = (matcher) => this.crosswalks.findIndex(matcher);

        const mainHorizontal = resolveCrosswalk((cw) => cw.orientation === "horizontal" && cw.y === 1700 && cw.x === 1100);

        const downtownVertical = resolveCrosswalk((cw) => cw.orientation === "vertical" && cw.x === 2950 && cw.y === 1100);

        const downtownHorizontal = resolveCrosswalk((cw) => cw.orientation === "horizontal" && cw.y === 1500 && cw.x === 3040);

        const safeIndex = (index) => (index >= 0 ? index : null);

        const crosswalkMain = safeIndex(mainHorizontal);

        const crosswalkDowntownV = safeIndex(downtownVertical);

        const crosswalkDowntownH = safeIndex(downtownHorizontal);

        const casinoTower = Array.isArray(this.buildings) ? this.buildings.find((b) => b && b.type === "casino") : null;

        let casinoPodiumPlan = null;

        if (casinoTower) {

            const apron = Math.max(60, Math.round(casinoTower.width * 0.3));

            const podiumHeight = Math.max(72, Math.min(120, Math.round(casinoTower.height * 0.22)));

            const podiumWidth = casinoTower.width + apron * 2;

            const podiumX = casinoTower.x - apron;

            const podiumY = casinoTower.y + casinoTower.height - 16;

            const margin = Math.max(18, Math.min(32, (this.sidewalkWidth ?? 36)));

            const topY = podiumY + margin;

            const bottomY = podiumY + podiumHeight - margin;

            const leftX = podiumX + margin;

            const rightX = podiumX + podiumWidth - margin;

            casinoPodiumPlan = {

                path: [

                    { x: leftX, y: topY, wait: 6 },

                    { x: rightX, y: topY, wait: 6 },

                    { x: rightX, y: bottomY, wait: 6 },

                    { x: leftX, y: bottomY, wait: 6 }

                ],

                bounds: {

                    left: podiumX + margin / 1.5,

                    right: podiumX + podiumWidth - margin / 1.5,

                    top: podiumY + margin / 1.5,

                    bottom: podiumY + podiumHeight - margin / 1.5

                }

            };

        }

        const npcs = [

            this.buildNPC({

                palette: { head: "#f1d2b6", torso: "#3c6e71", limbs: "#284b52", accent: "#f7ede2", hair: '#3b2c1e' },

                bounds: { left: 960, right: 1320, top: 1640, bottom: 1760 },

                waypoints: [

                    { x: 980, y: 1660, wait: 12 },

                    { x: 1100, y: 1660, wait: 18, crosswalkIndex: crosswalkMain },

                    { x: 1100, y: 1740, wait: 0 },

                    { x: 1280, y: 1740, wait: 10 },

                    { x: 1100, y: 1740, wait: 6 },

                    { x: 1100, y: 1660, wait: 16, crosswalkIndex: crosswalkMain }

                ],

                speed: 1.25

            }),

            this.buildNPC({

                palette: { head: "#f8cfd2", torso: "#6a4c93", limbs: "#413c58", accent: "#ffb5a7", hair: '#2e1f36' },

                bounds: { left: 2920, right: 3200, top: 1180, bottom: 1460 },

                waypoints: [

                    { x: 2960, y: 1220, wait: 12 },

                    { x: 3120, y: 1220, wait: 10 },

                    { x: 3120, y: 1400, wait: 12 },

                    { x: 2960, y: 1400, wait: 10 }

                ],

                speed: 1.05

            }),

            this.buildNPC({

                palette: { head: "#fbe2b4", torso: "#ff914d", limbs: "#583101", accent: "#ffd166", hair: '#3c2a1f' },

                bounds: { left: 540, right: 780, top: 1660, bottom: 1880 },

                waypoints: [

                    { x: 600, y: 1820, wait: 14 },

                    { x: 560, y: 1680, wait: 12 },

                    { x: 720, y: 1680, wait: 10 },

                    { x: 760, y: 1840, wait: 16 },

                    { x: 600, y: 1840, wait: 12 }

                ],

                speed: 1.35

            }),

            this.buildNPC({

                palette: { head: "#f0cfa0", torso: "#264653", limbs: "#1d3557", accent: "#f4a261", hair: '#2a1d13' },

                bounds: { left: 1050, right: 1620, top: 1800, bottom: 2100 },

                waypoints: [

                    { x: 1100, y: 1860, wait: 8 },

                    { x: 1580, y: 1860, wait: 6 },

                    { x: 1580, y: 2040, wait: 8 },

                    { x: 1100, y: 2040, wait: 10 }

                ],

                speed: 1.18

            }),

            this.buildNPC({

                palette: { head: "#f3d7c6", torso: "#274060", limbs: "#1b2845", accent: "#7dbad1", hair: '#0f1c2c' },

                bounds: { left: 2480, right: 3360, top: 940, bottom: 1240 },

                waypoints: [

                    { x: 2520, y: 980, wait: 6 },

                    { x: 3320, y: 980, wait: 8 },

                    { x: 3320, y: 1180, wait: 10 },

                    { x: 2520, y: 1180, wait: 8 }

                ],

                speed: 1.08

            }),

            this.buildNPC({

                palette: { head: "#f2d0b5", torso: "#7a8b99", limbs: "#45525f", accent: "#d9ed92", hair: '#2f1d18' },

                bounds: { left: 320, right: 820, top: 320, bottom: 720 },

                waypoints: [

                    { x: 360, y: 360, wait: 12 },

                    { x: 780, y: 360, wait: 8 },

                    { x: 780, y: 680, wait: 10 },

                    { x: 360, y: 680, wait: 8 }

                ],

                speed: 1.12

            }),

            this.buildNPC({

                palette: { head: "#f9d6c1", torso: "#bc4749", limbs: "#6a040f", accent: "#ffb703", hair: '#311019' },

                bounds: { left: 1680, right: 2140, top: 1280, bottom: 1700 },

                waypoints: [

                    { x: 1720, y: 1320, wait: 10 },

                    { x: 2100, y: 1320, wait: 6 },

                    { x: 2100, y: 1640, wait: 12 },

                    { x: 1720, y: 1640, wait: 6 }

                ],

                speed: 1.22

            }),

            this.buildNPC({

                palette: { head: "#f5ccb2", torso: "#457b9d", limbs: "#1d3557", accent: "#a8dadc", hair: '#16324f' },

                bounds: { left: 2200, right: 2620, top: 1820, bottom: 2280 },

                waypoints: [

                    { x: 2240, y: 1880, wait: 8 },

                    { x: 2580, y: 1880, wait: 6 },

                    { x: 2580, y: 2220, wait: 10 },

                    { x: 2240, y: 2220, wait: 6 }

                ],

                speed: 1.14

            }),

            this.buildNPC({

                palette: { head: "#f4ceb8", torso: "#2a9d8f", limbs: "#1f6f78", accent: "#e9c46a", hair: '#274046' },

                bounds: { left: 260, right: 760, top: 2000, bottom: 2400 },

                waypoints: [

                    { x: 300, y: 2060, wait: 8 },

                    { x: 720, y: 2060, wait: 6 },

                    { x: 720, y: 2340, wait: 10 },

                    { x: 300, y: 2340, wait: 6 }

                ],

                speed: 1.02

            }),

            this.buildNPC({

                palette: { head: "#f7d6bf", torso: "#1b263b", limbs: "#0d1b2a", accent: "#415a77", hair: '#0b132b' },

                bounds: { left: 2980, right: 3330, top: 1500, bottom: 1620 },

                waypoints: [

                    { x: 3000, y: 1520, wait: 4 },

                    { x: 3310, y: 1520, wait: 4 },

                    { x: 3310, y: 1600, wait: 6 },

                    { x: 3000, y: 1600, wait: 6 }

                ],

                speed: 1.35

            }),

        ];

        if (casinoPodiumPlan) {

            npcs.push(this.buildNPC({

                palette: { head: "#f4d7c8", torso: "#1b3a4b", limbs: "#12263a", accent: "#9ad1d4", hair: '#261d1a' },

                waypoints: casinoPodiumPlan.path,

                bounds: casinoPodiumPlan.bounds,

                speed: 1.08,

                stayOnSidewalks: false

            }));

        }

        const vehicles = [

            this.buildVehicle({

                baseColor: "#d35400",

                accentColor: "#f5c16f",

                width: 96,

                height: 44,

                speed: 2.6,

                path: [

                    { x: 240, y: 1700, wait: 0 },

                    { x: 3320, y: 1700, wait: 18 }

                ]

            }),

            this.buildVehicle({

                baseColor: "#2980b9",

                accentColor: "#8fd3fe",

                width: 110,

                height: 48,

                speed: 2.4,

                path: [

                    { x: 1700, y: 2600, wait: 20 },

                    { x: 1700, y: 260, wait: 24 }

                ]

            }),

            this.buildVehicle({

                baseColor: "#6c5ce7",

                accentColor: "#fd79a8",

                width: 102,

                height: 46,

                speed: 2.2,

                path: [

                    { x: 2450, y: 1700, wait: 12 },

                    { x: 3350, y: 1700, wait: 10 },

                    { x: 3350, y: 2400, wait: 12 },

                    { x: 2450, y: 2400, wait: 10 }

                ]

            })

        ];



        return { npcs, vehicles };

    }

        buildNPC(config) {

        const path = (config.waypoints ?? []).map((wp) => ({ ...wp }));

        if (path.length < 2) {

            throw new Error('NPC needs at least two waypoints to move.');

        }

        const stayOnSidewalks = config.stayOnSidewalks !== false;

        if (stayOnSidewalks) {

            for (const wp of path) {

                if (!wp) {

                    continue;

                }

                const projected = this.projectPointToSidewalk(wp.x ?? 0, wp.y ?? 0);

                wp.x = projected.x;

                wp.y = projected.y;

            }

        }

        const start = path[0];

        const npc = {

            x: start.x,

            y: start.y,

            speed: config.speed ?? 1.2,

            path,

            waypointIndex: (path.length > 1 ? 1 : 0),

            waitTimer: start.wait ?? 0,

            waitingForCrosswalk: start.crosswalkIndex ?? null,

            isCrossing: false,

            animationPhase: 0,

            moving: false,

            bounds: config.bounds ?? null,

            stayOnSidewalks,

            parts: this.buildNPCParts(config.palette ?? {})

        };

        if (npc.stayOnSidewalks) {

            const margin = Math.max(18, (this.sidewalkWidth ?? 36) * 0.6);

            const pathBounds = path.reduce((acc, wp) => {

                if (!wp) {

                    return acc;

                }

                return {

                    left: Math.min(acc.left, wp.x),

                    right: Math.max(acc.right, wp.x),

                    top: Math.min(acc.top, wp.y),

                    bottom: Math.max(acc.bottom, wp.y)

                };

            }, { left: path[0].x, right: path[0].x, top: path[0].y, bottom: path[0].y });

            const walkwayBounds = {

                left: pathBounds.left - margin,

                right: pathBounds.right + margin,

                top: pathBounds.top - margin,

                bottom: pathBounds.bottom + margin

            };

            if (npc.bounds) {

                const left = Math.max(npc.bounds.left, walkwayBounds.left);

                const right = Math.min(npc.bounds.right, walkwayBounds.right);

                const top = Math.max(npc.bounds.top, walkwayBounds.top);

                const bottom = Math.min(npc.bounds.bottom, walkwayBounds.bottom);

                if (left <= right && top <= bottom) {

                    npc.bounds = { left, right, top, bottom };

                } else {

                    npc.bounds = walkwayBounds;

                }

            } else {

                npc.bounds = walkwayBounds;

            }

        }

        const projected = this.projectPointToSidewalk(npc.x, npc.y);

        npc.x = projected.x;

        npc.y = projected.y;

        return npc;

    }



        buildVehicle(config) {

        const path = (config.path ?? []).map((wp) => ({ ...wp }));

        if (path.length < 2) {

            throw new Error('Vehicle needs at least two waypoints to move.');

        }

        const start = path[0];

        return {

            x: start.x,

            y: start.y,

            width: config.width ?? 96,

            height: config.height ?? 44,

            speed: config.speed ?? 2.2,

            path,

            waypointIndex: (path.length > 1 ? 1 : 0),

            waitTimer: start.wait ?? 0,

            stopTimer: 0,

            rotation: 0,

            parts: this.buildVehicleParts({

                baseColor: config.baseColor ?? '#555555',

                accentColor: config.accentColor ?? '#888888',

                width: config.width ?? 96,

                height: config.height ?? 44

            })

        };

    }



    buildNPCParts(palette) {

        const headColor = palette.head ?? '#f2d6c1';

        const torsoColor = palette.torso ?? '#2b6777';

        const limbColor = palette.limbs ?? '#1b3a4b';

        const accentColor = palette.accent ?? '#f2f2f2';

        const hairColor = palette.hair ?? '#2b2118';

        const eyeColor = palette.eyes ?? '#ffffff';

        const pupilColor = palette.pupil ?? '#1b1b1b';

        return [

            { id: 'shadow', type: 'circle', radius: 10, offsetX: 0, offsetY: 12, color: 'rgba(0, 0, 0, 0.15)', damaged: false },

            { id: 'torso', type: 'rect', width: 14, height: 18, offsetX: -7, offsetY: -12, color: torsoColor, damaged: false },

            { id: 'leftArm', type: 'rect', width: 4, height: 16, offsetX: -11, offsetY: -10, color: limbColor, damaged: false },

            { id: 'rightArm', type: 'rect', width: 4, height: 16, offsetX: 7, offsetY: -10, color: limbColor, damaged: false },

            { id: 'leftLeg', type: 'rect', width: 4, height: 18, offsetX: -4, offsetY: 6, color: accentColor, damaged: false },

            { id: 'rightLeg', type: 'rect', width: 4, height: 18, offsetX: 0, offsetY: 6, color: accentColor, damaged: false },

            { id: 'hairBack', type: 'circle', radius: 8, offsetX: 0, offsetY: -24, color: hairColor, damaged: false },

            { id: 'head', type: 'circle', radius: 6, offsetX: 0, offsetY: -20, color: headColor, damaged: false },

            { id: 'hairFringe', type: 'rect', width: 16, height: 3, offsetX: -8, offsetY: -22, color: hairColor, damaged: false },

            { id: 'leftEye', type: 'circle', radius: 1.8, offsetX: -3, offsetY: -17, color: eyeColor, damaged: false },

            { id: 'rightEye', type: 'circle', radius: 1.8, offsetX: 3, offsetY: -17, color: eyeColor, damaged: false },

            { id: 'leftPupil', type: 'circle', radius: 0.9, offsetX: -3, offsetY: -17, color: pupilColor, damaged: false },

            { id: 'rightPupil', type: 'circle', radius: 0.9, offsetX: 3, offsetY: -17, color: pupilColor, damaged: false }

        ];

    }



    buildVehicleParts(config) {

        const width = config.width;

        const height = config.height;

        const halfWidth = width / 2;

        const halfHeight = height / 2;

        const wheelRadius = Math.max(5, Math.floor(height * 0.24));

        const windowColor = 'rgba(132, 188, 226, 0.9)';

        const rearWindowColor = 'rgba(96, 140, 180, 0.85)';

        const trimColor = '#1f2a36';

        const lightFront = '#ffe8a3';

        const lightRear = '#ff6464';

        const parts = [];

        const addRect = (id, centerX, centerY, rectWidth, rectHeight, color, extra = {}) => {

            parts.push({

                id,

                type: 'rect',

                width: rectWidth,

                height: rectHeight,

                offsetX: centerX - rectWidth / 2,

                offsetY: centerY - rectHeight / 2,

                color,

                damaged: false,

                ...extra

            });

        };

        const addCircle = (id, centerX, centerY, radius, color, extra = {}) => {

            parts.push({

                id,

                type: 'circle',

                radius,

                offsetX: centerX,

                offsetY: centerY,

                color,

                damaged: false,

                ...extra

            });

        };

        addRect('chassis', 0, 0, width, height, config.baseColor);

        const stripeHeight = height * 0.22;

        addRect('stripe', 0, 0, width * 0.86, stripeHeight, config.accentColor);

        const roofWidth = width * 0.58;

        const roofHeight = height * 0.5;

        addRect('roof', 0, 0, roofWidth, roofHeight, config.accentColor);

        const windshieldWidth = width * 0.32;

        const windshieldHeight = height * 0.46;

        const windshieldCenterX = halfWidth - windshieldWidth * 0.6;

        addRect('windshield', windshieldCenterX, 0, windshieldWidth, windshieldHeight, windowColor);

        const rearGlassWidth = width * 0.3;

        const rearGlassHeight = height * 0.42;

        const rearGlassCenterX = -halfWidth + rearGlassWidth * 0.6;

        addRect('rearGlass', rearGlassCenterX, 0, rearGlassWidth, rearGlassHeight, rearWindowColor);

        const bumperWidth = width * 0.08;

        const bumperHeight = height * 0.74;

        addRect('trimFront', halfWidth - bumperWidth / 2, 0, bumperWidth, bumperHeight, trimColor);

        addRect('trimRear', -halfWidth + bumperWidth / 2, 0, bumperWidth, bumperHeight, trimColor);

        const lightWidth = width * 0.06;

        const lightHeight = height * 0.22;

        const lateralOffset = halfHeight - lightHeight * 0.6;

        const lightInset = width * 0.04 + bumperWidth;

        const frontLightCenterX = halfWidth - lightInset - lightWidth / 2;

        const rearLightCenterX = -frontLightCenterX;

        addRect('frontLightLeft', frontLightCenterX, -lateralOffset, lightWidth, lightHeight, lightFront);

        addRect('frontLightRight', frontLightCenterX, lateralOffset, lightWidth, lightHeight, lightFront);

        addRect('rearLightLeft', rearLightCenterX, -lateralOffset, lightWidth, lightHeight, lightRear);

        addRect('rearLightRight', rearLightCenterX, lateralOffset, lightWidth, lightHeight, lightRear);

        const sidePanelHeight = height * 0.12;

        const sidePanelOffsetY = halfHeight - sidePanelHeight / 2;

        addRect('sidePanelTop', 0, -sidePanelOffsetY, width * 0.78, sidePanelHeight, config.accentColor);

        addRect('sidePanelBottom', 0, sidePanelOffsetY, width * 0.78, sidePanelHeight, config.accentColor);

        addCircle('wheelFrontLeft', halfWidth * 0.45, halfHeight - wheelRadius, wheelRadius, trimColor, { visible: false });

        addCircle('wheelFrontRight', halfWidth * 0.45, -halfHeight + wheelRadius, wheelRadius, trimColor, { visible: false });

        addCircle('wheelRearLeft', -halfWidth * 0.45, halfHeight - wheelRadius, wheelRadius, trimColor, { visible: false });

        addCircle('wheelRearRight', -halfWidth * 0.45, -halfHeight + wheelRadius, wheelRadius, trimColor, { visible: false });

        return parts;

    }

    computeCrosswalkArea(crosswalk, index) {

        const halfRoad = this.roadHalfWidth ?? (this.roadWidth ?? 50) / 2;

        if (crosswalk.orientation === "horizontal") {

            const halfSpan = crosswalk.span / 2;

            return {

                id: index,

                orientation: "horizontal",

                left: crosswalk.x - halfSpan,

                right: crosswalk.x + halfSpan,

                top: crosswalk.y - halfRoad,

                bottom: crosswalk.y + halfRoad

            };

        }

        const halfSpan = crosswalk.span / 2;

        return {

            id: index,

            orientation: "vertical",

            left: crosswalk.x - halfRoad,

            right: crosswalk.x + halfRoad,

            top: crosswalk.y - halfSpan,

            bottom: crosswalk.y + halfSpan

        };

    }



    updateAgents() {

        if (!this.dynamicAgents) {

            return;

        }

        for (const npc of this.dynamicAgents.npcs) {

            this.updateNPC(npc);

        }

        for (const vehicle of this.dynamicAgents.vehicles) {

            this.updateVehicle(vehicle, this.dynamicAgents.npcs);

        }

    }



    updateNPC(npc) {

        if (!npc || !npc.path || npc.path.length < 2) {

            return;

        }

        let movingThisFrame = false;

        if (npc.waitTimer > 0) {

            npc.waitTimer -= 1;

        } else {

            const target = npc.path[npc.waypointIndex];

            const dx = target.x - npc.x;

            const dy = target.y - npc.y;

            const dist = Math.hypot(dx, dy);

            if (dist <= npc.speed) {

                npc.x = target.x;

                npc.y = target.y;

                npc.waitTimer = target.wait ?? 0;

                npc.waitingForCrosswalk = target.crosswalkIndex ?? null;

                npc.waypointIndex = (npc.waypointIndex + 1) % npc.path.length;

            } else if (dist > 0) {

                const ratio = npc.speed / dist;

                npc.x += dx * ratio;

                npc.y += dy * ratio;

                movingThisFrame = true;

            }

        }

        this.applySidewalkConstraint(npc);

        if (npc.bounds) {

            npc.x = Math.max(npc.bounds.left, Math.min(npc.x, npc.bounds.right));

            npc.y = Math.max(npc.bounds.top, Math.min(npc.y, npc.bounds.bottom));

        }

        npc.isCrossing = this.isPointInsideAnyCrosswalk(npc.x, npc.y);

        if (movingThisFrame && npc.waitTimer === 0) {

            npc.animationPhase = (npc.animationPhase + npc.speed * 0.08) % (Math.PI * 2);

        } else {

            npc.animationPhase *= 0.85;

        }

        npc.moving = movingThisFrame && npc.waitTimer === 0;

        if (!npc.isCrossing && npc.waitTimer === 0 && !npc.moving) {

            npc.waitingForCrosswalk = null;

        }

    }



    updateVehicle(vehicle, npcs) {

        if (!vehicle || !vehicle.path || vehicle.path.length < 2) {

            return;

        }

        const target = vehicle.path[vehicle.waypointIndex];

        const dx = target.x - vehicle.x;

        const dy = target.y - vehicle.y;

        const dist = Math.hypot(dx, dy);

        const stepX = dist === 0 ? 0 : (dx / dist) * vehicle.speed;

        const stepY = dist === 0 ? 0 : (dy / dist) * vehicle.speed;

        if (vehicle.waitTimer > 0) {

            vehicle.waitTimer -= 1;

            return;

        }

        if (vehicle.stopTimer > 0) {

            if (this.shouldVehicleYield(vehicle, stepX, stepY, npcs)) {

                vehicle.stopTimer = Math.max(vehicle.stopTimer, 6);

            } else {

                vehicle.stopTimer -= 1;

            }

            return;

        }

        if (dist <= vehicle.speed) {

            vehicle.x = target.x;

            vehicle.y = target.y;

            vehicle.waitTimer = target.wait ?? 0;

            vehicle.waypointIndex = (vehicle.waypointIndex + 1) % vehicle.path.length;

            return;

        }

        if (this.shouldVehicleYield(vehicle, stepX, stepY, npcs)) {

            vehicle.stopTimer = 12;

            return;

        }

        vehicle.rotation = Math.atan2(stepY, stepX);

        vehicle.x += stepX;

        vehicle.y += stepY;

    }



    updatePlayerAnimation() {

        if (!this.player || !this.player.parts) {

            return;

        }

        if (this.player.moving) {

            this.player.animationPhase = (this.player.animationPhase + this.player.speed * 0.12) % (Math.PI * 2);

        } else {

            this.player.animationPhase *= 0.85;

        }

    }



    shouldVehicleYield(vehicle, stepX, stepY, npcs) {

        const orientation = Math.abs(stepX) >= Math.abs(stepY) ? "horizontal" : "vertical";

        const direction = orientation === "horizontal" ? Math.sign(stepX) || 1 : Math.sign(stepY) || 1;

        const halfWidth = vehicle.width / 2;

        const halfHeight = vehicle.height / 2;

        for (const area of this.crosswalkAreas) {

            if (area.orientation !== orientation) {

                continue;

            }

            if (!this.isVehicleAlignedForCrosswalk(vehicle, area, orientation, halfWidth, halfHeight)) {

                continue;

            }

            if (!this.isVehicleApproachingCrosswalk(vehicle, area, orientation, direction, stepX, stepY, halfWidth, halfHeight)) {

                continue;

            }

            const npcBlocking = npcs.some((npc) => {

                if (!npc) {

                    return false;

                }

                if (npc.isCrossing && this.isPointInsideArea(npc.x, npc.y, area)) {

                    return true;

                }

                return npc.waitingForCrosswalk === area.id;

            });

            if (npcBlocking) {

                return true;

            }

        }

        return false;

    }



    isVehicleAlignedForCrosswalk(vehicle, area, orientation, halfWidth, halfHeight) {

        if (orientation === "horizontal") {

            const yTop = vehicle.y - halfHeight;

            const yBottom = vehicle.y + halfHeight;

            return !(yBottom < area.top - 6 || yTop > area.bottom + 6);

        }

        const xLeft = vehicle.x - halfWidth;

        const xRight = vehicle.x + halfWidth;

        return !(xRight < area.left - 6 || xLeft > area.right + 6);

    }



    isVehicleApproachingCrosswalk(vehicle, area, orientation, direction, stepX, stepY, halfWidth, halfHeight) {

        if (orientation === "horizontal") {

            const frontBefore = direction > 0 ? vehicle.x + halfWidth : vehicle.x - halfWidth;

            const frontAfter = frontBefore + stepX;

            if (direction > 0) {

                return frontBefore <= area.left - 4 && frontAfter >= area.left;

            }

            return frontBefore >= area.right + 4 && frontAfter <= area.right;

        }

        const frontBefore = direction > 0 ? vehicle.y + halfHeight : vehicle.y - halfHeight;

        const frontAfter = frontBefore + stepY;

        if (direction > 0) {

            return frontBefore <= area.top - 4 && frontAfter >= area.top;

        }

        return frontBefore >= area.bottom + 4 && frontAfter <= area.bottom;

    }



    isPointInsideArea(x, y, area) {

        return x >= area.left && x <= area.right && y >= area.top && y <= area.bottom;

    }



    isPointInsideAnyCrosswalk(x, y) {

        return this.crosswalkAreas.some((area) => this.isPointInsideArea(x, y, area));

    }







    drawImprovedRoadSystem() {

        const asphalt = "#2c3036";

        const edgeColor = "#42474f";

        const laneColor = "rgba(255, 224, 150, 0.9)";

        const roadHalfWidth = this.roadHalfWidth ?? (this.roadWidth ?? 50) / 2;

        const roadWidth = this.roadWidth ?? roadHalfWidth * 2;

        const borderThickness = 2;

        const borderOffset = roadHalfWidth + borderThickness;

        this.ctx.save();

        for (const road of this.roadLayout) {

            if (road.type === "horizontal") {

                const length = road.endX - road.startX;

                this.ctx.fillStyle = asphalt;

                this.ctx.fillRect(road.startX, road.y - roadHalfWidth, length, roadWidth);

                this.ctx.fillStyle = edgeColor;

                this.ctx.fillRect(road.startX, road.y - borderOffset, length, borderThickness);

                this.ctx.fillRect(road.startX, road.y + roadHalfWidth, length, borderThickness);

            } else if (road.type === "vertical") {

                const length = road.endY - road.startY;

                this.ctx.fillStyle = asphalt;

                this.ctx.fillRect(road.x - roadHalfWidth, road.startY, roadWidth, length);

                this.ctx.fillStyle = edgeColor;

                this.ctx.fillRect(road.x - borderOffset, road.startY, borderThickness, length);

                this.ctx.fillRect(road.x + roadHalfWidth, road.startY, borderThickness, length);

            } else if (road.type === "diagonal") {

                this.ctx.fillStyle = asphalt;

                this.drawDiagonalRoad(road);

            }

        }

        this.ctx.strokeStyle = laneColor;

        this.ctx.lineWidth = 3;

        this.ctx.setLineDash([32, 28]);

        for (const road of this.roadLayout) {

            if (road.type === "horizontal") {

                this.ctx.beginPath();

                this.ctx.moveTo(road.startX, road.y);

                this.ctx.lineTo(road.endX, road.y);

                this.ctx.stroke();

            } else if (road.type === "vertical") {

                this.ctx.beginPath();

                this.ctx.moveTo(road.x, road.startY);

                this.ctx.lineTo(road.x, road.endY);

                this.ctx.stroke();

            }

        }

        this.ctx.setLineDash([]);

        this.ctx.restore();

        for (const crosswalk of this.crosswalks) {

            this.drawCrosswalk(crosswalk);

        }

    }

    drawDiagonalRoad(road) {

        const dx = road.endX - road.startX;

        const dy = road.endY - road.startY;

        const angle = Math.atan2(dy, dx);

        const width = this.roadWidth ?? 50;

        const halfWidth = this.roadHalfWidth ?? width / 2;

        const perpX = -Math.sin(angle) * halfWidth;

        const perpY = Math.cos(angle) * halfWidth;

        this.ctx.beginPath();

        this.ctx.moveTo(road.startX + perpX, road.startY + perpY);

        this.ctx.lineTo(road.startX - perpX, road.startY - perpY);

        this.ctx.lineTo(road.endX - perpX, road.endY - perpY);

        this.ctx.lineTo(road.endX + perpX, road.endY + perpY);

        this.ctx.closePath();

        this.ctx.fill();

    }

    pseudoRandom2D(x, y) {

        const value = Math.sin(x * 127.1 + y * 311.7 + 13.7) * 43758.5453123;

        return value - Math.floor(value);

    }

    drawSidewalkPatternRect(x, y, width, height) {

        if (width <= 0 || height <= 0) {

            return;

        }

        this.ctx.save();

        this.ctx.beginPath();

        this.ctx.rect(x, y, width, height);

        this.ctx.clip();

        this.renderSidewalkGridInBounds(x, y, width, height);

        this.ctx.restore();

    }

    drawSidewalkPatternPolygon(points) {

        if (!points || points.length === 0) {

            return;

        }

        this.ctx.save();

        this.ctx.beginPath();

        this.ctx.moveTo(points[0].x, points[0].y);

        for (let i = 1; i < points.length; i++) {

            this.ctx.lineTo(points[i].x, points[i].y);

        }

        this.ctx.closePath();

        this.ctx.clip();

        let minX = points[0].x;

        let maxX = points[0].x;

        let minY = points[0].y;

        let maxY = points[0].y;

        for (const point of points) {

            if (point.x < minX) minX = point.x;

            if (point.x > maxX) maxX = point.x;

            if (point.y < minY) minY = point.y;

            if (point.y > maxY) maxY = point.y;

        }

        this.renderSidewalkGridInBounds(minX, minY, maxX - minX, maxY - minY);

        this.ctx.restore();

    }

    renderSidewalkGridInBounds(x, y, width, height) {

        const tileSize = 26;

        const endX = x + width;

        const endY = y + height;

        const startX = Math.floor(x / tileSize) * tileSize;

        const startY = Math.floor(y / tileSize) * tileSize;

        this.ctx.lineWidth = 1;

        this.ctx.strokeStyle = "rgba(158, 150, 140, 0.35)";

        for (let gx = startX; gx <= endX; gx += tileSize) {

            this.ctx.beginPath();

            this.ctx.moveTo(gx, y);

            this.ctx.lineTo(gx, endY);

            this.ctx.stroke();

        }

        this.ctx.strokeStyle = "rgba(158, 150, 140, 0.25)";

        for (let gy = startY; gy <= endY; gy += tileSize) {

            this.ctx.beginPath();

            this.ctx.moveTo(x, gy);

            this.ctx.lineTo(endX, gy);

            this.ctx.stroke();

        }

        for (let gy = startY; gy < endY; gy += tileSize) {

            for (let gx = startX; gx < endX; gx += tileSize) {

                const tileX = Math.max(gx, x);

                const tileY = Math.max(gy, y);

                const tileWidth = Math.min(tileSize, endX - tileX);

                const tileHeight = Math.min(tileSize, endY - tileY);

                if (tileWidth <= 0 || tileHeight <= 0) {

                    continue;

                }

                const indexX = Math.floor(gx / tileSize);

                const indexY = Math.floor(gy / tileSize);

                const shade = this.pseudoRandom2D(indexX * 1.17, indexY * 1.33);

                const highlightAlpha = 0.035 + shade * 0.025;

                const shadowAlpha = 0.05 + shade * 0.035;

                this.ctx.fillStyle = `rgba(255, 255, 255, ${highlightAlpha.toFixed(3)})`;

                this.ctx.fillRect(tileX, tileY, tileWidth, 2);

                this.ctx.fillStyle = `rgba(65, 59, 52, ${shadowAlpha.toFixed(3)})`;

                this.ctx.fillRect(tileX, tileY + tileHeight - 2, tileWidth, 2);

                const featureRand = this.pseudoRandom2D(indexX * 1.93 + 7.21, indexY * 2.11 + 4.37);

                if (featureRand > 0.978) {

                    const crackAngle = this.pseudoRandom2D(indexX * 3.17 + 1.94, indexY * 1.59 + 6.28) * Math.PI * 2;

                    const crackLength = 6 + this.pseudoRandom2D(indexX * 2.73 + 9.83, indexY * 2.41 + 3.88) * 12;

                    const centerX = tileX + this.pseudoRandom2D(indexX * 5.13 + 2.7, indexY * 4.77 + 3.1) * tileWidth;

                    const centerY = tileY + this.pseudoRandom2D(indexX * 6.91 + 1.3, indexY * 5.23 + 8.6) * tileHeight;

                    const dx = Math.cos(crackAngle) * crackLength / 2;

                    const dy = Math.sin(crackAngle) * crackLength / 2;

                    this.ctx.strokeStyle = "rgba(62, 54, 46, 0.35)";

                    this.ctx.lineWidth = 0.9;

                    this.ctx.beginPath();

                    this.ctx.moveTo(centerX - dx, centerY - dy);

                    this.ctx.lineTo(centerX + dx, centerY + dy);

                    this.ctx.stroke();

                    if (featureRand > 0.991) {

                        const branchAngle = crackAngle + (this.pseudoRandom2D(indexX * 7.77 + 0.19, indexY * 8.31 + 4.51) - 0.5) * 0.9;

                        const branchLength = crackLength * 0.6;

                        this.ctx.beginPath();

                        this.ctx.moveTo(centerX, centerY);

                        this.ctx.lineTo(centerX + Math.cos(branchAngle) * branchLength, centerY + Math.sin(branchAngle) * branchLength);

                        this.ctx.stroke();

                    }

                    const holeChance = this.pseudoRandom2D(indexX * 9.71 + 5.0, indexY * 10.63 + 7.7);

                    if (holeChance > 0.994) {

                        const radius = 1.5 + holeChance * 2.5;

                        const holeX = centerX + (this.pseudoRandom2D(indexX * 11.3 + 3.2, indexY * 11.9 + 6.4) - 0.5) * tileWidth * 0.3;

                        const holeY = centerY + (this.pseudoRandom2D(indexX * 12.7 + 4.6, indexY * 12.9 + 8.3) - 0.5) * tileHeight * 0.3;

                        this.ctx.fillStyle = "rgba(42, 36, 32, 0.3)";

                        this.ctx.beginPath();

                        this.ctx.arc(holeX, holeY, radius, 0, Math.PI * 2);

                        this.ctx.fill();

                        this.ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";

                        this.ctx.lineWidth = 0.6;

                        this.ctx.beginPath();

                        this.ctx.arc(holeX - 1, holeY - 1, radius * 0.7, 0, Math.PI * 2);

                        this.ctx.stroke();

                    }

                }

            }

        }

    }

    drawSidewalks() {

        const width = this.sidewalkWidth;

        const surface = "#d9d1c4";

        const roadHalfWidth = this.roadHalfWidth ?? (this.roadWidth ?? 50) / 2;

        for (const road of this.roadLayout) {

            if (road.type === "horizontal") {

                const length = road.endX - road.startX;

                const upperY = road.y - roadHalfWidth - width;

                const lowerY = road.y + roadHalfWidth;

                this.ctx.fillStyle = surface;

                this.ctx.fillRect(road.startX, upperY, length, width);

                this.ctx.fillRect(road.startX, lowerY, length, width);

                this.drawSidewalkPatternRect(road.startX, upperY, length, width);

                this.drawSidewalkPatternRect(road.startX, lowerY, length, width);

            } else if (road.type === "vertical") {

                const length = road.endY - road.startY;

                const leftX = road.x - roadHalfWidth - width;

                const rightX = road.x + roadHalfWidth;

                this.ctx.fillStyle = surface;

                this.ctx.fillRect(leftX, road.startY, width, length);

                this.ctx.fillRect(rightX, road.startY, width, length);

                this.drawSidewalkPatternRect(leftX, road.startY, width, length);

                this.drawSidewalkPatternRect(rightX, road.startY, width, length);

            } else if (road.type === "diagonal") {

                this.drawDiagonalSidewalks(road);

            }

        }

    }

    drawDiagonalSidewalks(road) {

        const width = this.sidewalkWidth;

        const surface = "#d9d1c4";

        const roadWidth = this.roadWidth ?? 50;

        const totalWidth = roadWidth + width * 2;

        const halfTotalWidth = totalWidth / 2;

        const dx = road.endX - road.startX;

        const dy = road.endY - road.startY;

        const angle = Math.atan2(dy, dx);

        const perpX = -Math.sin(angle) * halfTotalWidth;

        const perpY = Math.cos(angle) * halfTotalWidth;

        const offsetX = -Math.sin(angle) * width;

        const offsetY = Math.cos(angle) * width;

        const upper = [

            { x: road.startX + perpX, y: road.startY + perpY },

            { x: road.startX + perpX + offsetX, y: road.startY + perpY + offsetY },

            { x: road.endX + perpX + offsetX, y: road.endY + perpY + offsetY },

            { x: road.endX + perpX, y: road.endY + perpY }

        ];

        const lower = [

            { x: road.startX - perpX, y: road.startY - perpY },

            { x: road.startX - perpX - offsetX, y: road.startY - perpY - offsetY },

            { x: road.endX - perpX - offsetX, y: road.endY - perpY - offsetY },

            { x: road.endX - perpX, y: road.endY - perpY }

        ];

        const fillPolygon = (points) => {

            this.ctx.beginPath();

            this.ctx.moveTo(points[0].x, points[0].y);

            for (let i = 1; i < points.length; i++) {

                this.ctx.lineTo(points[i].x, points[i].y);

            }

            this.ctx.closePath();

            this.ctx.fill();

        };

        this.ctx.fillStyle = surface;

        fillPolygon(upper);

        fillPolygon(lower);

        this.drawSidewalkPatternPolygon(upper);

        this.drawSidewalkPatternPolygon(lower);

    }

    drawCrosswalk(config) {

        const { x, y, orientation, span } = config;

        const stripeWidth = 6;

        const gap = 10;

        const roadWidth = this.roadWidth ?? 50;

        const roadHalfWidth = this.roadHalfWidth ?? roadWidth / 2;

        const stripeColor = "rgba(255, 255, 255, 0.85)";

        const shadowColor = "rgba(0, 0, 0, 0.08)";

        this.ctx.save();

        this.ctx.fillStyle = stripeColor;

        if (orientation === "horizontal") {

            const startX = x - span / 2;

            const endX = x + span / 2;

            for (let sx = startX; sx <= endX; sx += stripeWidth + gap) {

                this.ctx.fillStyle = stripeColor;

                this.ctx.fillRect(sx, y - roadHalfWidth, stripeWidth, roadWidth);

                this.ctx.fillStyle = shadowColor;

                this.ctx.fillRect(sx, y - roadHalfWidth, stripeWidth, 4);

            }

        } else {

            const startY = y - span / 2;

            const endY = y + span / 2;

            for (let sy = startY; sy <= endY; sy += stripeWidth + gap) {

                this.ctx.fillStyle = stripeColor;

                this.ctx.fillRect(x - roadHalfWidth, sy, roadWidth, stripeWidth);

                this.ctx.fillStyle = shadowColor;

                this.ctx.fillRect(x - roadHalfWidth, sy, 4, stripeWidth);

            }

        }

        this.ctx.restore();

    }

    drawStreetDetails() {

        if (!this.streetDetails) {

            return;

        }

        for (const lot of this.streetDetails.parkingLots) {

            this.drawParkingLot(lot);

        }

        for (const bay of this.streetDetails.parkingBays) {

            this.drawParkingBay(bay);

        }

        for (const puddle of this.streetDetails.puddles) {

            this.drawPuddle(puddle);

        }

        for (const planter of this.streetDetails.planters) {

            this.drawPlanter(planter);

        }

        for (const tree of this.streetDetails.trees) {

            this.drawTree(tree);

        }

        for (const bench of this.streetDetails.benches) {

            this.drawBench(bench);

        }

        for (const rack of this.streetDetails.bikeRacks) {

            this.drawBikeRack(rack);

        }

        for (const lamp of this.streetDetails.lamps) {

            this.drawStreetLamp(lamp);

        }

        for (const bin of this.streetDetails.bins) {

            this.drawTrashBin(bin);

        }

        for (const stop of this.streetDetails.busStops) {

            this.drawBusStop(stop);

        }

    }

    drawDynamicAgents() {

        if (!this.dynamicAgents) {

            return;

        }

        for (const vehicle of this.dynamicAgents.vehicles) {

            this.drawVehicleParts(vehicle);

        }

        for (const npc of this.dynamicAgents.npcs) {

            this.drawNPC(npc);

        }

    }



    drawCharacterParts(character) {

        if (!character || !character.parts) {

            return;

        }

        const phase = character.animationPhase ?? 0;

        const swing = Math.sin(phase);

        const bob = (character.moving ? Math.abs(Math.cos(phase)) * 1.2 : 0);

        const centerX = character.x;

        const centerY = character.y;

        for (const part of character.parts) {

            if (part.id !== 'shadow' || part.damaged) {

                continue;

            }

            this.ctx.save();

            this.ctx.fillStyle = part.color;

            if (part.type === 'circle') {

                this.ctx.beginPath();

                this.ctx.arc(centerX + part.offsetX, centerY + part.offsetY, part.radius, 0, Math.PI * 2);

                this.ctx.fill();

            } else if (part.type === 'rect') {

                this.ctx.fillRect(centerX + part.offsetX, centerY + part.offsetY, part.width, part.height);

            }

            this.ctx.restore();

        }

        this.ctx.save();

        this.ctx.translate(centerX, centerY - bob);

        for (const part of character.parts) {

            if (part.damaged || part.id === 'shadow') {

                continue;

            }

            let offsetX = part.offsetX;

            let offsetY = part.offsetY;

            if (part.id === 'leftLeg') {

                offsetY += swing * 2.4;

            } else if (part.id === 'rightLeg') {

                offsetY -= swing * 2.4;

            } else if (part.id === 'leftArm') {

                offsetY -= swing * 1.9;

            } else if (part.id === 'rightArm') {

                offsetY += swing * 1.9;

            }

            this.ctx.fillStyle = part.color;

            if (part.type === 'rect') {

                this.ctx.fillRect(offsetX, offsetY, part.width, part.height);

            } else if (part.type === 'circle') {

                this.ctx.beginPath();

                this.ctx.arc(offsetX, offsetY, part.radius, 0, Math.PI * 2);

                this.ctx.fill();

            }

        }

        this.ctx.restore();

    }



    drawNPC(npc) {

        this.drawCharacterParts(npc);

    }



    drawVehicleParts(vehicle) {

        if (!vehicle || !vehicle.parts) {

            return;

        }

        const rotation = vehicle.rotation ?? 0;

        this.ctx.save();

        this.ctx.translate(vehicle.x, vehicle.y);

        this.ctx.rotate(rotation);

        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';

        this.ctx.beginPath();

        this.ctx.ellipse(0, 0, vehicle.width / 2 + 6, vehicle.height / 2 + 4, 0, 0, Math.PI * 2);

        this.ctx.fill();

        for (const part of vehicle.parts) {

            if (part.damaged || part.visible === false) {

                continue;

            }

            this.ctx.fillStyle = part.color;

            if (part.type === 'rect') {

                this.ctx.fillRect(part.offsetX, part.offsetY, part.width, part.height);

            } else if (part.type === 'circle') {

                this.ctx.beginPath();

                this.ctx.arc(part.offsetX, part.offsetY, part.radius, 0, Math.PI * 2);

                this.ctx.fill();

            }

        }

        this.ctx.restore();

    }



    drawParkingLot(lot) {

        if (!lot) {

            return;

        }

        const {

            x,

            y,

            width,

            height,

            rows = 2,

            slots = 6,

            aisle = 32,

            padding = 12,

            surfaceColor = '#2f3034'

        } = lot;

        this.ctx.save();

        this.ctx.fillStyle = surfaceColor;

        this.ctx.fillRect(x, y, width, height);

        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';

        this.ctx.lineWidth = 2;

        this.ctx.strokeRect(x + 1, y + 1, width - 2, height - 2);

        const innerX = x + padding;

        const innerY = y + padding;

        const innerWidth = width - padding * 2;

        const innerHeight = height - padding * 2;

        const effectiveRows = Math.max(1, rows);

        const totalAisle = aisle * Math.max(0, effectiveRows - 1);

        const rowHeight = (innerHeight - totalAisle) / effectiveRows;

        const slotCount = Math.max(1, slots);

        const slotWidth = innerWidth / slotCount;

        if (effectiveRows > 1) {

            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';

            for (let divider = 1; divider < effectiveRows; divider++) {

                const laneTop = innerY + divider * rowHeight + (divider - 1) * aisle;

                this.ctx.fillRect(innerX, laneTop, innerWidth, aisle);

            }

        }

        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';

        this.ctx.lineWidth = 1.6;

        for (let row = 0; row < effectiveRows; row++) {

            const rowTop = innerY + row * (rowHeight + aisle);

            this.ctx.strokeRect(innerX, rowTop, innerWidth, rowHeight);

            const stopDepth = Math.min(8, rowHeight * 0.28);

            const stopMargin = Math.min(10, slotWidth * 0.18);

            const stopY = row === 0 ? rowTop + rowHeight - stopDepth : rowTop;

            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';

            for (let slot = 0; slot < slotCount; slot++) {

                const slotX = innerX + slot * slotWidth;

                if (slot > 0) {

                    this.ctx.beginPath();

                    this.ctx.moveTo(slotX, rowTop);

                    this.ctx.lineTo(slotX, rowTop + rowHeight);

                    this.ctx.stroke();

                }

                const stopX = slotX + stopMargin;

                const stopWidth = slotWidth - stopMargin * 2;

                this.ctx.fillRect(stopX, stopY, stopWidth, stopDepth);

            }

        }

        if (effectiveRows > 1) {

            this.ctx.setLineDash([12, 10]);

            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';

            this.ctx.lineWidth = 1.2;

            for (let divider = 1; divider < effectiveRows; divider++) {

                const laneTop = innerY + divider * rowHeight + (divider - 1) * aisle;

                const laneCenterY = laneTop + aisle / 2;

                this.ctx.beginPath();

                this.ctx.moveTo(innerX + 4, laneCenterY);

                this.ctx.lineTo(innerX + innerWidth - 4, laneCenterY);

                this.ctx.stroke();

            }

            this.ctx.setLineDash([]);

        }

        this.ctx.restore();

    }



    drawParkingBay(bay) {

        const { x, y, width, height } = bay;

        this.ctx.save();

        this.ctx.fillStyle = "rgba(255, 255, 255, 0.08)";

        this.ctx.fillRect(x, y, width, height);

        this.ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";

        this.ctx.lineWidth = 2;

        this.ctx.strokeRect(x, y, width, height);

        this.ctx.restore();

    }

    drawPlanter(planter) {

        const { x, y, width, height } = planter;

        this.ctx.save();

        this.ctx.fillStyle = "#b6a184";

        this.ctx.fillRect(x - width / 2, y - height / 2, width, height);

        this.ctx.fillStyle = "#6ea56f";

        this.ctx.fillRect(x - width / 2 + 4, y - height / 2 + 4, width - 8, height - 8);

        this.ctx.restore();

    }

    drawTree(tree) {

        const { x, y, size, variant = 0 } = tree;

        this.ctx.save();

        const pitSize = size * 0.8;

        this.ctx.fillStyle = "#3a342c";

        this.ctx.fillRect(x - pitSize / 2, y - pitSize / 2, pitSize, pitSize);

        this.ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";

        this.ctx.lineWidth = 1;

        this.ctx.strokeRect(x - pitSize / 2, y - pitSize / 2, pitSize, pitSize);

        const palettes = [

            ["rgba(66, 142, 95, 0.95)", "rgba(32, 82, 55, 0.85)"],

            ["rgba(74, 160, 105, 0.95)", "rgba(38, 96, 65, 0.85)"],

            ["rgba(90, 170, 120, 0.95)", "rgba(44, 88, 60, 0.85)"]

        ];

        const paletteIndex = Math.abs(Math.floor(variant)) % palettes.length;

        const colors = palettes[paletteIndex];

        const canopy = this.ctx.createRadialGradient(x, y, size * 0.2, x, y, size);

        canopy.addColorStop(0, colors[0]);

        canopy.addColorStop(1, colors[1]);

        this.ctx.fillStyle = canopy;

        this.ctx.beginPath();

        this.ctx.arc(x, y, size, 0, Math.PI * 2);

        this.ctx.fill();

        this.ctx.restore();

    }

    drawBench(bench) {

        const { x, y, orientation } = bench;

        this.ctx.save();

        const length = orientation === "vertical" ? 42 : 72;

        const depth = 12;

        if (orientation === "horizontal") {

            this.ctx.fillStyle = "#8c6f47";

            this.ctx.fillRect(x - length / 2, y - depth / 2, length, depth);

            this.ctx.strokeStyle = "#2f2519";

            this.ctx.lineWidth = 2;

            this.ctx.strokeRect(x - length / 2, y - depth / 2, length, depth);

        } else {

            this.ctx.fillStyle = "#8c6f47";

            this.ctx.fillRect(x - depth / 2, y - length / 2, depth, length);

            this.ctx.strokeStyle = "#2f2519";

            this.ctx.lineWidth = 2;

            this.ctx.strokeRect(x - depth / 2, y - length / 2, depth, length);

        }

        this.ctx.restore();

    }

    drawBikeRack(rack) {

        const { x, y, orientation } = rack;

        this.ctx.save();

        this.ctx.strokeStyle = "#6c7c8a";

        this.ctx.lineWidth = 3;

        const loopCount = 3;

        const spacing = 16;

        if (orientation === "horizontal") {

            for (let i = 0; i < loopCount; i++) {

                this.ctx.beginPath();

                this.ctx.arc(x - 20 + i * spacing, y, 7, Math.PI, 0, false);

                this.ctx.stroke();

            }

        } else {

            for (let i = 0; i < loopCount; i++) {

                this.ctx.beginPath();

                this.ctx.arc(x, y - 20 + i * spacing, 7, Math.PI / 2, -Math.PI / 2, false);

                this.ctx.stroke();

            }

        }

        this.ctx.restore();

    }

    drawStreetLamp(lamp) {

        const { x, y } = lamp;

        this.ctx.save();

        this.ctx.strokeStyle = "#404852";

        this.ctx.lineWidth = 3;

        this.ctx.beginPath();

        this.ctx.moveTo(x, y - 36);

        this.ctx.lineTo(x, y);

        this.ctx.stroke();

        this.ctx.fillStyle = "rgba(255, 220, 150, 0.8)";

        this.ctx.beginPath();

        this.ctx.arc(x, y - 36, 6, 0, Math.PI * 2);

        this.ctx.fill();

        this.ctx.restore();

    }

    drawTrashBin(bin) {

        const { x, y } = bin;

        this.ctx.save();

        this.ctx.fillStyle = "#3d4852";

        this.ctx.fillRect(x - 6, y - 10, 12, 16);

        this.ctx.fillStyle = "#6c7a88";

        this.ctx.fillRect(x - 6, y - 12, 12, 4);

        this.ctx.restore();

    }

    drawBusStop(stop) {

        const { x, y, orientation, length } = stop;

        this.ctx.save();

        this.ctx.fillStyle = "rgba(40, 50, 60, 0.85)";

        if (orientation === "horizontal") {

            this.ctx.fillRect(x - length / 2, y - 10, length, 20);

            this.ctx.fillStyle = "rgba(255, 220, 120, 0.4)";

            this.ctx.fillRect(x - length / 2, y - 2, length, 4);

        } else {

            this.ctx.fillRect(x - 10, y - length / 2, 20, length);

            this.ctx.fillStyle = "rgba(255, 220, 120, 0.4)";

            this.ctx.fillRect(x - 2, y - length / 2, 4, length);

        }

        this.ctx.restore();

    }

    drawPuddle(puddle) {

        const { x, y, radius } = puddle;

        this.ctx.save();

        const gradient = this.ctx.createRadialGradient(x, y, radius * 0.2, x, y, radius);

        gradient.addColorStop(0, "rgba(120, 170, 200, 0.5)");

        gradient.addColorStop(1, "rgba(40, 70, 100, 0.2)");

        this.ctx.fillStyle = gradient;

        this.ctx.beginPath();

        this.ctx.ellipse(x, y, radius * 1.4, radius, 0, 0, Math.PI * 2);

        this.ctx.fill();

        this.ctx.restore();

    }

    drawBuildings() {

        if (!Array.isArray(this.buildings)) {

            console.warn('drawBuildings skipped', this.buildings);

            return;

        }

        for (const building of this.buildings) {

            if (building.type === "casino") {

                this.drawCasino(building);

            } else if (building.type === "police") {

                this.drawPoliceStation(building);

            } else if (building.type === "mixedUse") {

                this.drawMixedUseBlock(building);

            } else if (building.type === "officeTower") {

                this.drawOfficeTower(building);

            } else if (building.type === "residentialTower") {

                this.drawResidentialTower(building);

            } else if (building.type === "weaponShop") {

                this.drawWeaponShop(building);

            } else if (building.type === "house") {

                this.drawHouse(building);

            } else if (building.type === "restaurant") {

                this.drawRestaurant(building);

            } else if (building.type === "shop") {

                this.drawShop(building);

            } else {

                this.drawHouse(building);

            }

        }

        this.drawInteractionPoints();

    }

    drawMixedUseBlock(building) {

        const { x, y, width, height, subUnits = [] } = building;

        this.ctx.save();

        const units = subUnits.length ? subUnits : [

            { label: "Aurora Restaurant", accent: "#f78f5c" },

            { label: "Stadtmarkt", accent: "#7fd491" },

            { label: "Polizeiposten", accent: "#5da1ff" }

        ];

        const groundFloorHeight = height * 0.28;

        const upperHeight = height - groundFloorHeight;

        const facadeGradient = this.ctx.createLinearGradient(x, y, x + width, y + upperHeight);

        facadeGradient.addColorStop(0, "#bfc6d1");

        facadeGradient.addColorStop(1, "#9fa7b6");

        this.ctx.fillStyle = facadeGradient;

        this.ctx.fillRect(x, y, width, upperHeight);

        this.ctx.strokeStyle = "rgba(60, 70, 90, 0.25)";

        this.ctx.lineWidth = 1.5;

        for (let i = 0; i <= units.length; i++) {

            const colX = x + (i / units.length) * width;

            this.ctx.beginPath();

            this.ctx.moveTo(colX, y + 8);

            this.ctx.lineTo(colX, y + upperHeight - 8);

            this.ctx.stroke();

        }

        for (let row = 0; row < 4; row++) {

            const rowY = y + 12 + row * ((upperHeight - 24) / 4);

            this.ctx.beginPath();

            this.ctx.moveTo(x + 16, rowY);

            this.ctx.lineTo(x + width - 16, rowY);

            this.ctx.stroke();

        }

        const roofPadding = 14;

        this.ctx.fillStyle = "#6f9f72";

        this.ctx.fillRect(x + roofPadding, y + roofPadding, width - roofPadding * 2, upperHeight - roofPadding * 1.6);

        this.ctx.fillStyle = "rgba(255, 255, 255, 0.3)";

        for (let i = 0; i < 4; i++) {

            const planterX = x + roofPadding + 16 + i * ((width - roofPadding * 2 - 32) / 3);

            this.ctx.fillRect(planterX, y + roofPadding + 6, 12, 30);

        }

        this.ctx.fillStyle = "rgba(40, 50, 60, 0.92)";

        this.ctx.fillRect(x, y + upperHeight, width, groundFloorHeight);

        const unitWidth = width / units.length;

        for (let i = 0; i < units.length; i++) {

            const unit = units[i];

            const unitX = x + i * unitWidth;

            const glassGradient = this.ctx.createLinearGradient(unitX, y + upperHeight, unitX, y + height);

            glassGradient.addColorStop(0, "rgba(110, 150, 190, 0.35)");

            glassGradient.addColorStop(1, "rgba(30, 40, 55, 0.85)");

            this.ctx.fillStyle = glassGradient;

            this.ctx.fillRect(unitX + 6, y + upperHeight + 6, unitWidth - 12, groundFloorHeight - 12);

            this.ctx.fillStyle = unit.accent;

            this.ctx.fillRect(unitX + 8, y + upperHeight + 8, unitWidth - 16, 14);

            this.ctx.fillStyle = "#1a1f26";

            this.ctx.font = "bold 12px Arial";

            this.ctx.textAlign = "center";

            this.ctx.fillText(unit.label.toUpperCase(), unitX + unitWidth / 2, y + upperHeight + 18);

            if (unit.label.toLowerCase().includes("restaurant")) {

                this.ctx.fillStyle = "rgba(247, 143, 92, 0.45)";

                this.ctx.fillRect(unitX + 10, y + height + 6, unitWidth - 20, 14);

                for (let t = 0; t < 3; t++) {

                    const tx = unitX + 18 + t * ((unitWidth - 36) / 2);

                    this.ctx.fillStyle = "#d0d6db";

                    this.ctx.fillRect(tx, y + height + 8, 8, 10);

                    this.ctx.fillStyle = "rgba(255, 180, 80, 0.7)";

                    this.ctx.fillRect(tx - 6, y + height + 18, 20, 4);

                }

                this.ctx.fillStyle = unit.accent;

                this.ctx.beginPath();

                this.ctx.moveTo(unitX + 10, y + upperHeight + 22);

                this.ctx.lineTo(unitX + 30, y + upperHeight + 42);

                this.ctx.lineTo(unitX + 50, y + upperHeight + 22);

                this.ctx.closePath();

                this.ctx.fill();

            } else if (unit.label.toLowerCase().includes("stadtmarkt")) {

                this.ctx.fillStyle = "rgba(200, 230, 210, 0.7)";

                this.ctx.fillRect(unitX + unitWidth / 2 - 18, y + upperHeight + 20, 36, groundFloorHeight - 26);

                this.ctx.fillStyle = "rgba(120, 140, 150, 0.6)";

                this.ctx.fillRect(unitX + unitWidth / 2 - 2, y + upperHeight + 20, 4, groundFloorHeight - 26);

            } else if (unit.label.toLowerCase().includes("polizeiposten")) {

                this.ctx.fillStyle = "rgba(93, 161, 255, 0.6)";

                this.ctx.fillRect(unitX + unitWidth / 2 - 20, y + upperHeight + 24, 40, groundFloorHeight - 30);

                this.ctx.fillStyle = "#ffffff";

                this.ctx.font = "bold 10px Arial";

                this.ctx.fillText("POSTEN", unitX + unitWidth / 2, y + height - 16);

            }

        }

        this.ctx.restore();

    }

    drawHouse(building) {

        const { x: lotOriginX, y: lotOriginY, width: lotWidth, height: lotHeight, variant = {} } = building;

        const styleIndex = variant.styleIndex ?? building.colorIndex ?? 0;

        const palette = this.houseStyles[styleIndex % this.houseStyles.length];

        const floors = Math.max(2, variant.floors ?? palette.floors ?? 4);

        const roofGarden = Boolean(variant.roofGarden ?? palette.roofGarden ?? false);

        const balconyRhythm = Math.max(0, variant.balconyRhythm ?? 0);

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

        this.ctx.save();

        this.ctx.translate(lotOriginX, lotOriginY);

        this.ctx.lineJoin = "round";

        const lawnHeight = Math.max(8, frontDepth * 0.65);

        const walkwayWidth = Math.min(48, houseWidth * 0.28);

        const walkwayX = lotWidth / 2 - walkwayWidth / 2;

        const walkwayY = houseBottom;

        const walkwayHeight = frontDepth;

        this.ctx.fillStyle = "#d9d1c4";

        this.ctx.fillRect(walkwayX, walkwayY, walkwayWidth, walkwayHeight);

        this.drawSidewalkPatternRect(walkwayX, walkwayY, walkwayWidth, walkwayHeight);

        this.ctx.fillStyle = "rgba(0, 0, 0, 0.16)";

        this.ctx.fillRect(walkwayX, walkwayY, walkwayWidth, 3);

        this.ctx.fillStyle = "rgba(255, 255, 255, 0.18)";

        this.ctx.fillRect(walkwayX + 4, walkwayY, walkwayWidth - 8, 2);

        // Optional extra segment to tie the front path into the public sidewalk

        const walkwayExtension = Math.max(0, variant.walkwayExtension ?? 0);

        if (walkwayExtension > 0) {

            const extensionY = walkwayY + walkwayHeight;

            this.ctx.fillStyle = "#d9d1c4";

            this.ctx.fillRect(walkwayX, extensionY, walkwayWidth, walkwayExtension);

            this.drawSidewalkPatternRect(walkwayX, extensionY, walkwayWidth, walkwayExtension);

            this.ctx.fillStyle = "rgba(0, 0, 0, 0.16)";

            this.ctx.fillRect(walkwayX, extensionY, walkwayWidth, 3);

            this.ctx.fillStyle = "rgba(255, 255, 255, 0.18)";

            this.ctx.fillRect(walkwayX + 4, extensionY, walkwayWidth - 8, 2);

            const walkwayBottom = extensionY + walkwayExtension;

            const spurLength = Math.max(0, variant.walkwaySpurLength ?? 0);

            const spurThickness = Math.max(8, variant.walkwaySpurWidth ?? Math.min(16, walkwayExtension * 0.6 + 6));

            if (spurLength > 0 && spurThickness > 0) {

                const spurX = walkwayX + walkwayWidth / 2 - spurLength;

                const spurY = walkwayBottom - spurThickness;

                this.ctx.fillStyle = "#d9d1c4";

                this.ctx.fillRect(spurX, spurY, spurLength * 2, spurThickness);

                this.drawSidewalkPatternRect(spurX, spurY, spurLength * 2, spurThickness);

                this.ctx.fillStyle = "rgba(0, 0, 0, 0.16)";

                this.ctx.fillRect(spurX, spurY, spurLength * 2, 2);

                this.ctx.fillStyle = "rgba(255, 255, 255, 0.18)";

                this.ctx.fillRect(spurX + 4, spurY, spurLength * 2 - 8, 2);

                this.ctx.fillStyle = "rgba(0, 0, 0, 0.14)";

                this.ctx.fillRect(spurX, spurY + spurThickness - 2, spurLength * 2, 2);

            }

        }

        const shadowHeight = Math.min(10, lawnHeight + 6);

        this.ctx.fillStyle = "rgba(0, 0, 0, 0.2)";

        this.ctx.fillRect(houseX - 10, houseBottom - 4, houseWidth + 20, shadowHeight);

        this.ctx.fillStyle = palette.base;

        this.ctx.fillRect(houseX, facadeTop, houseWidth, facadeHeight);

        const warmGradient = this.ctx.createLinearGradient(houseX, facadeTop, houseX + houseWidth * 0.8, facadeTop + facadeHeight * 0.8);

        warmGradient.addColorStop(0, "rgba(255, 196, 128, 0.32)");

        warmGradient.addColorStop(1, "rgba(0, 0, 0, 0)");

        this.ctx.fillStyle = warmGradient;

        this.ctx.fillRect(houseX, facadeTop, houseWidth, facadeHeight);

        const coolGradient = this.ctx.createLinearGradient(houseX + houseWidth, facadeTop + facadeHeight, houseX + houseWidth * 0.4, facadeTop + facadeHeight * 0.4);

        coolGradient.addColorStop(0, "rgba(70, 90, 120, 0.2)");

        coolGradient.addColorStop(1, "rgba(0, 0, 0, 0)");

        this.ctx.fillStyle = coolGradient;

        this.ctx.fillRect(houseX, facadeTop, houseWidth, facadeHeight);

        this.ctx.strokeStyle = palette.roof;

        this.ctx.lineWidth = 2;

        this.ctx.strokeRect(houseX, facadeTop, houseWidth, facadeHeight);

        if (facadeHeight > 20) {

            this.ctx.setLineDash([12, 6]);

            this.ctx.strokeStyle = palette.accent;

            this.ctx.lineWidth = 1.5;

            this.ctx.strokeRect(houseX + 8, facadeTop + 8, houseWidth - 16, Math.max(12, facadeHeight - 16));

            this.ctx.setLineDash([]);

        }

        if (roofGarden) {

            const padding = Math.min(houseWidth * 0.6, roofDepth * 1.05);

            const deckY = facadeTop - Math.max(8, roofDepth * 0.65);

            this.ctx.beginPath();

            this.ctx.moveTo(houseX - 6, facadeTop);

            this.ctx.lineTo(houseX + houseWidth + 6, facadeTop);

            this.ctx.lineTo(houseX + houseWidth - padding * 0.45, deckY);

            this.ctx.lineTo(houseX + padding * 0.45, deckY);

            this.ctx.closePath();

            const roofGradient = this.ctx.createLinearGradient(houseX, deckY, houseX, facadeTop);

            roofGradient.addColorStop(0, palette.roof);

            roofGradient.addColorStop(1, "rgba(30, 30, 30, 0.82)");

            this.ctx.fillStyle = roofGradient;

            this.ctx.fill();

            this.ctx.strokeStyle = "rgba(0, 0, 0, 0.45)";

            this.ctx.lineWidth = 2;

            this.ctx.stroke();

            this.ctx.fillStyle = palette.accent;

            this.ctx.fillRect(houseX - 4, facadeTop - 3, houseWidth + 8, 3);

            const planterCount = Math.max(3, Math.floor(houseWidth / 80));

            for (let i = 0; i < planterCount; i++) {

                const px = houseX + 18 + i * (houseWidth - 36) / Math.max(1, planterCount - 1) - 12;

                const py = deckY + 6;

                this.ctx.fillStyle = palette.highlight ?? palette.accent;

                this.ctx.fillRect(px, py, 24, 10);

                this.ctx.fillStyle = "#4d8b54";

                this.ctx.fillRect(px + 2, py - 6, 20, 8);

            }

        } else {

            const ridgeHeight = Math.max(10, roofDepth * 0.55);

            this.ctx.beginPath();

            this.ctx.moveTo(houseX - 8, facadeTop);

            this.ctx.lineTo(houseX + houseWidth + 8, facadeTop);

            this.ctx.lineTo(houseX + houseWidth / 2, facadeTop - ridgeHeight);

            this.ctx.closePath();

            const roofGradient = this.ctx.createLinearGradient(houseX, facadeTop - ridgeHeight, houseX, facadeTop);

            roofGradient.addColorStop(0, palette.roof);

            roofGradient.addColorStop(1, "rgba(25, 25, 25, 0.78)");

            this.ctx.fillStyle = roofGradient;

            this.ctx.fill();

            this.ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";

            this.ctx.lineWidth = 2;

            this.ctx.stroke();

            this.ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";

            this.ctx.lineWidth = 1;

            for (let band = facadeTop - 6; band > facadeTop - ridgeHeight + 6; band -= 10) {

                this.ctx.beginPath();

                this.ctx.moveTo(houseX + 14, band);

                this.ctx.lineTo(houseX + houseWidth - 14, band);

                this.ctx.stroke();

            }

            const hvacCount = Math.max(2, Math.floor(houseWidth / 90));

            const hvacY = facadeTop - Math.min(18, roofDepth * 0.45);

            const unitWidth = Math.min(36, houseWidth / (hvacCount + 1));

            const unitHeight = Math.min(20, roofDepth * 0.45);

            for (let i = 0; i < hvacCount; i++) {

                const ux = houseX + 18 + i * (unitWidth + 16);

                this.ctx.fillStyle = palette.metallic;

                this.ctx.fillRect(ux, hvacY, unitWidth, unitHeight);

                this.ctx.fillStyle = "rgba(255, 255, 255, 0.24)";

                this.ctx.fillRect(ux + 3, hvacY + 3, unitWidth - 6, unitHeight - 6);

            }

        }

        if (balconyRhythm > 0 && facadeHeight > 30) {

            const beltSpacing = facadeHeight / (balconyRhythm + 1);

            this.ctx.fillStyle = palette.balcony;

            for (let i = 1; i <= balconyRhythm; i++) {

                const beltY = facadeTop + beltSpacing * i;

                this.ctx.fillRect(houseX + 14, beltY - 2, houseWidth - 28, 4);

            }

        } else if (facadeHeight > 40) {

            this.ctx.fillStyle = "rgba(0, 0, 0, 0.08)";

            this.ctx.fillRect(houseX + 14, facadeTop + facadeHeight * 0.46, houseWidth - 28, 3);

        }

        const windowAreaTop = facadeTop + 14;

        const windowAreaBottom = facadeTop + facadeHeight - 14;

        const windowAreaHeight = Math.max(36, windowAreaBottom - windowAreaTop);

        let windowRows = Math.min(4, Math.max(2, Math.round(floors * 0.6)));

        let windowHeight = Math.min(34, (windowAreaHeight - (windowRows - 1) * 14) / windowRows);

        while (windowHeight < 18 && windowRows > 2) {

            windowRows -= 1;

            windowHeight = Math.min(34, (windowAreaHeight - (windowRows - 1) * 14) / windowRows);

        }

        windowHeight = Math.max(18, Math.min(34, windowHeight));

        const verticalSpacing = windowRows > 1 ? (windowAreaHeight - windowRows * windowHeight) / (windowRows - 1) : 0;

        const windowStartY = windowAreaTop + Math.max(0, (windowAreaHeight - (windowRows * windowHeight + verticalSpacing * (windowRows - 1))) / 2);

        const windowAreaWidth = houseWidth - 40;

        let windowCols = Math.min(4, Math.max(2, Math.floor(windowAreaWidth / 80)));

        let windowWidth = Math.min(34, (windowAreaWidth - (windowCols - 1) * 18) / windowCols);

        while (windowWidth < 18 && windowCols > 2) {

            windowCols -= 1;

            windowWidth = Math.min(34, (windowAreaWidth - (windowCols - 1) * 18) / windowCols);

        }

        windowWidth = Math.max(18, Math.min(34, windowWidth));

        const horizontalSpacing = windowCols > 1 ? (windowAreaWidth - windowCols * windowWidth) / (windowCols - 1) : 0;

        const windowStartX = houseX + Math.max(10, (houseWidth - (windowCols * windowWidth + horizontalSpacing * (windowCols - 1))) / 2);

        for (let row = 0; row < windowRows; row++) {

            for (let col = 0; col < windowCols; col++) {

                const wx = windowStartX + col * (windowWidth + horizontalSpacing);

                const wy = windowStartY + row * (windowHeight + verticalSpacing);

                const glassGradient = this.ctx.createLinearGradient(wx, wy, wx, wy + windowHeight);

                glassGradient.addColorStop(0, "rgba(220, 236, 255, 0.92)");

                glassGradient.addColorStop(0.5, "rgba(120, 160, 200, 0.65)");

                glassGradient.addColorStop(1, "rgba(60, 90, 130, 0.72)");

                this.ctx.fillStyle = glassGradient;

                this.ctx.fillRect(wx, wy, windowWidth, windowHeight);

                this.ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";

                this.ctx.lineWidth = 1;

                this.ctx.strokeRect(wx, wy, windowWidth, windowHeight);

                this.ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";

                this.ctx.beginPath();

                this.ctx.moveTo(wx + windowWidth / 2, wy);

                this.ctx.lineTo(wx + windowWidth / 2, wy + windowHeight);

                this.ctx.moveTo(wx, wy + windowHeight / 2);

                this.ctx.lineTo(wx + windowWidth, wy + windowHeight / 2);

                this.ctx.stroke();

            }

        }

        const doorWidth = Math.min(houseWidth * 0.26, 68);

        const doorHeight = Math.max(58, Math.min(facadeHeight * 0.44, 104));

        const doorX = houseX + houseWidth / 2 - doorWidth / 2;

        const doorY = facadeTop + facadeHeight - doorHeight;

        const doorGradient = this.ctx.createLinearGradient(doorX, doorY, doorX, doorY + doorHeight);

        doorGradient.addColorStop(0, palette.accent);

        doorGradient.addColorStop(1, "rgba(40, 40, 40, 0.82)");

        this.ctx.fillStyle = doorGradient;

        this.ctx.fillRect(doorX, doorY, doorWidth, doorHeight);

        this.ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";

        this.ctx.lineWidth = 2;

        this.ctx.strokeRect(doorX, doorY, doorWidth, doorHeight);

        this.ctx.fillStyle = "rgba(255, 215, 120, 0.85)";

        this.ctx.beginPath();

        this.ctx.arc(doorX + doorWidth - 10, doorY + doorHeight / 2, 3, 0, Math.PI * 2);

        this.ctx.fill();

        const transomHeight = Math.min(18, doorHeight * 0.25);

        this.ctx.fillStyle = "rgba(220, 236, 255, 0.85)";

        this.ctx.fillRect(doorX + 6, doorY + 6, doorWidth - 12, transomHeight);

        const stepHeight = Math.max(6, Math.min(12, frontDepth * 0.22));

        this.ctx.fillStyle = "rgba(0, 0, 0, 0.22)";

        this.ctx.fillRect(doorX - 16, doorY + doorHeight, doorWidth + 32, stepHeight);

        this.ctx.fillStyle = "rgba(255, 255, 255, 0.2)";

        this.ctx.fillRect(doorX - 16, doorY + doorHeight, doorWidth + 32, 2);

        this.ctx.restore();

    }

    drawCasino(building) {

        const { x, y, width, height } = building;

        this.ctx.save();

        const towerGradient = this.ctx.createLinearGradient(x, y, x + width, y + height);

        towerGradient.addColorStop(0, "#1b202c");

        towerGradient.addColorStop(0.5, "#242c3f");

        towerGradient.addColorStop(1, "#151820");

        this.ctx.fillStyle = towerGradient;

        this.ctx.fillRect(x, y, width, height);

        for (let stripe = x + 12; stripe <= x + width - 12; stripe += 18) {

            const ledGradient = this.ctx.createLinearGradient(stripe, y, stripe + 6, y + height);

            ledGradient.addColorStop(0, "rgba(94, 176, 255, 0.85)");

            ledGradient.addColorStop(0.5, "rgba(255, 120, 200, 0.6)");

            ledGradient.addColorStop(1, "rgba(120, 220, 255, 0.85)");

            this.ctx.fillStyle = ledGradient;

            this.ctx.fillRect(stripe, y + 8, 6, height - 16);

        }

        this.ctx.strokeStyle = "rgba(255, 255, 255, 0.32)";

        this.ctx.lineWidth = 2;

        this.ctx.strokeRect(x, y, width, height);

        const canopyHeight = 36;

        this.ctx.fillStyle = "#1f2535";

        this.ctx.fillRect(x - 24, y + height - canopyHeight, width + 48, canopyHeight);

        const canopyGlow = this.ctx.createLinearGradient(x - 24, y + height - canopyHeight, x - 24, y + height);

        canopyGlow.addColorStop(0, "rgba(255, 180, 80, 0.65)");

        canopyGlow.addColorStop(1, "rgba(120, 60, 20, 0.0)");

        this.ctx.fillStyle = canopyGlow;

        this.ctx.fillRect(x - 24, y + height - canopyHeight, width + 48, canopyHeight);

        const apronExtension = Math.max(60, Math.round(width * 0.3));

        const podiumWidth = width + apronExtension * 2;

        const podiumHeight = Math.max(72, Math.min(120, Math.round(height * 0.22)));

        const podiumX = x - apronExtension;

        const podiumY = y + height - 16;

        const podiumGradient = this.ctx.createLinearGradient(podiumX, podiumY, podiumX, podiumY + podiumHeight);

        podiumGradient.addColorStop(0, "rgba(150, 210, 255, 0.9)");

        podiumGradient.addColorStop(0.45, "rgba(90, 150, 205, 0.88)");

        podiumGradient.addColorStop(1, "rgba(28, 44, 72, 0.95)");

        this.ctx.fillStyle = podiumGradient;

        this.ctx.fillRect(podiumX, podiumY, podiumWidth, podiumHeight);

        this.ctx.strokeStyle = "rgba(255, 255, 255, 0.38)";

        this.ctx.lineWidth = 2;

        this.ctx.strokeRect(podiumX, podiumY, podiumWidth, podiumHeight);

        const mullionCount = Math.max(4, Math.floor(podiumWidth / 90));

        if (mullionCount > 1) {

            this.ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";

            this.ctx.lineWidth = 1.5;

            const mullionSpacing = podiumWidth / mullionCount;

            for (let column = 1; column < mullionCount; column++) {

                const columnX = podiumX + column * mullionSpacing;

                this.ctx.beginPath();

                this.ctx.moveTo(columnX, podiumY + 6);

                this.ctx.lineTo(columnX, podiumY + podiumHeight - 6);

                this.ctx.stroke();

            }

        }

        const podiumHighlight = this.ctx.createLinearGradient(podiumX, podiumY, podiumX, podiumY + 16);

        podiumHighlight.addColorStop(0, "rgba(255, 255, 255, 0.48)");

        podiumHighlight.addColorStop(1, "rgba(255, 255, 255, 0.02)");

        this.ctx.fillStyle = podiumHighlight;

        this.ctx.fillRect(podiumX, podiumY, podiumWidth, 16);

        const plinthHeight = 40;

        const plinthY = podiumY + podiumHeight;

        this.ctx.fillStyle = "#c9b89f";

        this.ctx.fillRect(podiumX, plinthY, podiumWidth, plinthHeight);

        this.ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";

        this.ctx.lineWidth = 1;

        for (let lineX = podiumX; lineX <= podiumX + podiumWidth; lineX += 36) {

            this.ctx.beginPath();

            this.ctx.moveTo(lineX, plinthY);

            this.ctx.lineTo(lineX, plinthY + plinthHeight);

            this.ctx.stroke();

        }

        const logoRadius = Math.min(width, height) * 0.28;

        const logoX = x + width / 2;

        const logoY = y + height * 0.2;

        this.ctx.fillStyle = "rgba(255, 215, 120, 0.9)";

        this.ctx.beginPath();

        this.ctx.arc(logoX, logoY, logoRadius, 0, Math.PI * 2);

        this.ctx.fill();

        this.ctx.fillStyle = "#1a1d28";

        this.ctx.font = "bold 18px Arial";

        this.ctx.textAlign = "center";

        this.ctx.fillText("STAR", logoX, logoY - 2);

        this.ctx.fillText("LIGHT", logoX, logoY + 14);

        this.ctx.fillStyle = "rgba(120, 180, 255, 0.6)";

        this.ctx.fillRect(x - 6, y - 6, width + 12, 6);

        this.ctx.restore();

    }





    drawOfficeTower(building) {

        const { x, y, width, height } = building;

        this.ctx.save();

        const facade = this.ctx.createLinearGradient(x, y, x + width, y + height);

        facade.addColorStop(0, "#1c2738");

        facade.addColorStop(0.5, "#243750");

        facade.addColorStop(1, "#101722");

        this.ctx.fillStyle = facade;

        this.ctx.fillRect(x, y, width, height);

        const columnCount = Math.max(3, Math.floor(width / 24));

        const columnWidth = width / columnCount;

        for (let i = 0; i < columnCount; i++) {

            const colX = x + i * columnWidth;

            const shine = this.ctx.createLinearGradient(colX, y, colX + columnWidth, y);

            shine.addColorStop(0, "rgba(255, 255, 255, 0.12)");

            shine.addColorStop(0.5, "rgba(255, 255, 255, 0.02)");

            shine.addColorStop(1, "rgba(255, 255, 255, 0.16)");

            this.ctx.fillStyle = shine;

            this.ctx.fillRect(colX + columnWidth * 0.05, y + 12, columnWidth * 0.9, height - 24);

        }

        this.ctx.strokeStyle = "rgba(180, 200, 220, 0.35)";

        this.ctx.lineWidth = 2;

        for (let bandY = y + 30; bandY < y + height - 40; bandY += 26) {

            this.ctx.beginPath();

            this.ctx.moveTo(x + 12, bandY);

            this.ctx.lineTo(x + width - 12, bandY);

            this.ctx.stroke();

        }

        this.ctx.fillStyle = "#3a475f";

        this.ctx.fillRect(x - 8, y - 14, width + 16, 14);

        this.ctx.fillStyle = "rgba(255, 255, 255, 0.08)";

        this.ctx.fillRect(x - 4, y - 10, width + 8, 6);

        const lobbyHeight = Math.min(70, height * 0.18);

        this.ctx.fillStyle = "#121922";

        this.ctx.fillRect(x - 6, y + height - lobbyHeight, width + 12, lobbyHeight);

        const glow = this.ctx.createLinearGradient(x - 6, y + height - lobbyHeight, x - 6, y + height);

        glow.addColorStop(0, "rgba(255, 212, 120, 0.55)");

        glow.addColorStop(1, "rgba(255, 212, 120, 0)");

        this.ctx.fillStyle = glow;

        this.ctx.fillRect(x - 6, y + height - lobbyHeight, width + 12, lobbyHeight);

        this.ctx.restore();

    }



    drawResidentialTower(building) {

        const { x, y, width, height } = building;

        this.ctx.save();

        const facade = this.ctx.createLinearGradient(x, y, x + width, y + height);

        facade.addColorStop(0, "#6d7f91");

        facade.addColorStop(1, "#3b495a");

        this.ctx.fillStyle = facade;

        this.ctx.fillRect(x, y, width, height);

        const floorHeight = 34;

        for (let level = y + 28; level < y + height - 64; level += floorHeight) {

            this.ctx.fillStyle = "rgba(240, 244, 255, 0.55)";

            this.ctx.fillRect(x + 12, level, width - 24, 18);

            this.ctx.fillStyle = "#2f3b4c";

            this.ctx.fillRect(x + 10, level + 18, width - 20, 4);

        }

        this.ctx.fillStyle = "rgba(255, 255, 255, 0.08)";

        this.ctx.fillRect(x + width / 2 - 6, y + 16, 12, height - 32);

        this.ctx.fillStyle = "#38462f";

        this.ctx.fillRect(x - 4, y - 10, width + 8, 10);

        this.ctx.fillStyle = "#6fa16c";

        this.ctx.fillRect(x - 2, y - 8, width + 4, 6);

        const entryHeight = Math.min(60, height * 0.16);

        this.ctx.fillStyle = "#1f242f";

        this.ctx.fillRect(x + width / 2 - 28, y + height - entryHeight, 56, entryHeight);

        this.ctx.fillStyle = "rgba(255, 255, 255, 0.2)";

        this.ctx.fillRect(x + width / 2 - 22, y + height - entryHeight + 10, 44, entryHeight - 20);

        this.ctx.restore();

    }



    drawWeaponShop(building) {

        const { x, y, width, height } = building;

        this.ctx.save();

        const upperHeight = height * 0.62;

        const facadeGradient = this.ctx.createLinearGradient(x, y, x, y + upperHeight);

        facadeGradient.addColorStop(0, "#3a3f4b");

        facadeGradient.addColorStop(1, "#232631");

        this.ctx.fillStyle = facadeGradient;

        this.ctx.fillRect(x, y, width, upperHeight);

        const baseHeight = height - upperHeight;

        this.ctx.fillStyle = "#151920";

        this.ctx.fillRect(x, y + upperHeight, width, baseHeight);

        this.ctx.fillStyle = "#b12a2a";

        this.ctx.fillRect(x + 20, y + 10, width - 40, 32);

        this.ctx.strokeStyle = "#ffe3a3";

        this.ctx.lineWidth = 2;

        this.ctx.strokeRect(x + 20, y + 10, width - 40, 32);

        this.ctx.fillStyle = "#ffe3a3";

        this.ctx.font = "bold 18px Arial";

        this.ctx.textAlign = "center";

        this.ctx.fillText("AMMU-NATION", x + width / 2, y + 33);

        const windowWidth = Math.max(48, (width - 100) / 2);

        const windowHeight = Math.max(50, upperHeight - 80);

        this.ctx.fillStyle = "#8db5d8";

        this.ctx.fillRect(x + 32, y + 60, windowWidth, windowHeight);

        this.ctx.fillRect(x + width - 32 - windowWidth, y + 60, windowWidth, windowHeight);

        this.ctx.fillStyle = "rgba(255, 255, 255, 0.25)";

        this.ctx.fillRect(x + 36, y + 64, windowWidth - 8, windowHeight - 8);

        this.ctx.fillRect(x + width - 36 - windowWidth + 8, y + 64, windowWidth - 8, windowHeight - 8);

        const doorWidth = 56;

        const doorHeight = baseHeight - 12;

        const doorX = x + width / 2 - doorWidth / 2;

        const doorY = y + upperHeight + 6;

        this.ctx.fillStyle = "#11151c";

        this.ctx.fillRect(doorX, doorY, doorWidth, doorHeight);

        this.ctx.fillStyle = "#e0c068";

        this.ctx.fillRect(doorX + doorWidth - 12, doorY + doorHeight / 2 - 3, 6, 6);

        this.ctx.fillStyle = "#5a4b32";

        this.ctx.fillRect(x + width - 72, y + upperHeight - 10, 44, 18);

        this.ctx.fillRect(x + width - 82, y + upperHeight - 30, 44, 18);

        this.ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";

        this.ctx.strokeRect(x + width - 72, y + upperHeight - 10, 44, 18);

        this.ctx.strokeRect(x + width - 82, y + upperHeight - 30, 44, 18);

        this.ctx.restore();

    }



    drawPoliceStation(building) {

        const { x, y, width, height } = building;

        this.ctx.save();

        const mainHeight = height * 0.62;

        const garageHeight = height - mainHeight;

        const yardPadding = 24;

        this.ctx.fillStyle = "#adb4bd";

        this.ctx.fillRect(x - yardPadding, y + mainHeight, width + yardPadding * 2, garageHeight + 40);

        this.ctx.strokeStyle = "rgba(70, 80, 95, 0.7)";

        this.ctx.lineWidth = 2;

        for (let fenceX = x - yardPadding; fenceX <= x + width + yardPadding; fenceX += 18) {

            this.ctx.beginPath();

            this.ctx.moveTo(fenceX, y + mainHeight + garageHeight + 40);

            this.ctx.lineTo(fenceX, y + mainHeight + garageHeight + 20);

            this.ctx.stroke();

        }

        const buildingGradient = this.ctx.createLinearGradient(x, y, x + width, y + mainHeight);

        buildingGradient.addColorStop(0, "#2d4d78");

        buildingGradient.addColorStop(1, "#1f334f");

        this.ctx.fillStyle = buildingGradient;

        this.ctx.fillRect(x, y, width, mainHeight);

        this.ctx.strokeStyle = "#101a2a";

        this.ctx.lineWidth = 2;

        this.ctx.strokeRect(x, y, width, mainHeight);

        const atriumWidth = width * 0.32;

        const atriumHeight = mainHeight * 0.42;

        const atriumX = x + width / 2 - atriumWidth / 2;

        this.ctx.fillStyle = "rgba(120, 185, 235, 0.65)";

        this.ctx.fillRect(atriumX, y + mainHeight - atriumHeight, atriumWidth, atriumHeight);

        this.ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";

        this.ctx.lineWidth = 1.5;

        for (let i = 0; i < 5; i++) {

            const levelY = y + 12 + i * ((mainHeight - 24) / 5);

            this.ctx.beginPath();

            this.ctx.moveTo(x + 12, levelY);

            this.ctx.lineTo(x + width - 12, levelY);

            this.ctx.stroke();

        }

        const helipadRadius = Math.min(width, height) * 0.18;

        const helipadX = x + width * 0.78;

        const helipadY = y + mainHeight * 0.3;

        this.ctx.fillStyle = "#3d4552";

        this.ctx.beginPath();

        this.ctx.arc(helipadX, helipadY, helipadRadius, 0, Math.PI * 2);

        this.ctx.fill();

        this.ctx.strokeStyle = "#ffffff";

        this.ctx.lineWidth = 2;

        this.ctx.beginPath();

        this.ctx.arc(helipadX, helipadY, helipadRadius - 6, 0, Math.PI * 2);

        this.ctx.stroke();

        this.ctx.font = "bold 18px Arial";

        this.ctx.textAlign = "center";

        this.ctx.fillStyle = "#ffffff";

        this.ctx.fillText("H", helipadX, helipadY + 6);

        const garageY = y + mainHeight;

        this.ctx.fillStyle = "#1d2d45";

        this.ctx.fillRect(x, garageY, width, garageHeight);

        const doorWidth = (width - 80) / 4;

        for (let i = 0; i < 4; i++) {

            const doorX = x + 20 + i * (doorWidth + 20);

            this.ctx.fillStyle = "#2f3d52";

            this.ctx.fillRect(doorX, garageY + 8, doorWidth, garageHeight - 16);

            this.ctx.fillStyle = "rgba(180, 200, 220, 0.25)";

            for (let slat = 0; slat < 4; slat++) {

                const slatY = garageY + 12 + slat * ((garageHeight - 28) / 4);

                this.ctx.fillRect(doorX + 4, slatY, doorWidth - 8, 4);

            }

        }

        this.ctx.fillStyle = "rgba(80, 160, 255, 0.9)";

        this.ctx.fillRect(x + 20, garageY + 4, width - 40, 6);

        this.ctx.fillStyle = "#214c83";

        this.ctx.fillRect(atriumX + 20, garageY - 18, atriumWidth - 40, 18);

        this.ctx.fillStyle = "#ffffff";

        this.ctx.font = "bold 14px Arial";

        this.ctx.fillText("POLIZEI", atriumX + atriumWidth / 2, garageY - 5);

        this.ctx.strokeStyle = "#cdd3d8";

        this.ctx.lineWidth = 3;

        this.ctx.beginPath();

        this.ctx.moveTo(x + width / 2 - 140, garageY + garageHeight + 40);

        this.ctx.lineTo(x + width / 2 - 140, garageY - 10);

        this.ctx.stroke();

        this.ctx.fillStyle = "#005eb8";

        this.ctx.fillRect(x + width / 2 - 140, garageY - 10, 16, 10);

        this.ctx.fillStyle = "#ffffff";

        this.ctx.fillRect(x + width / 2 - 124, garageY - 10, 16, 10);

        const cameraPositions = [

            { cx: x + 12, cy: y + 12 },

            { cx: x + width - 12, cy: y + 12 },

            { cx: x + 12, cy: y + mainHeight - 12 },

            { cx: x + width - 12, cy: y + mainHeight - 12 }

        ];

        for (const cam of cameraPositions) {

            this.ctx.fillStyle = "#2c3642";

            this.ctx.beginPath();

            this.ctx.arc(cam.cx, cam.cy, 5, 0, Math.PI * 2);

            this.ctx.fill();

            this.ctx.fillStyle = "rgba(120, 200, 255, 0.5)";

            this.ctx.beginPath();

            this.ctx.arc(cam.cx + 2, cam.cy, 2, 0, Math.PI * 2);

            this.ctx.fill();

        }

        this.ctx.restore();

    }

    drawShop(building) {

        const { x, y, width, height } = building;

        this.ctx.save();

        this.ctx.fillStyle = "#a9a9a9";

        this.ctx.fillRect(x, y, width, height);

        this.ctx.fillStyle = "#808080";

        for (let i = 0; i < height; i += 15) {

            this.ctx.fillRect(x, y + i, width, 2);

        }

        this.ctx.strokeStyle = "#000";

        this.ctx.lineWidth = 3;

        this.ctx.strokeRect(x, y, width, height);

        this.ctx.restore();

    }

    drawRestaurant(building) {

        const { x, y, width, height } = building;

        this.ctx.save();

        this.ctx.fillStyle = "#DEB887";

        this.ctx.fillRect(x, y, width, height);

        this.ctx.fillStyle = "#D2B48C";

        for (let i = 0; i < width; i += 10) {

            this.ctx.fillRect(x + i, y, 2, height);

        }

        this.ctx.strokeStyle = "#000";

        this.ctx.lineWidth = 3;

        this.ctx.strokeRect(x, y, width, height);

        this.ctx.fillStyle = "#87CEEB";

        this.ctx.fillRect(x + 15, y + 15, 25, 20);

        this.ctx.fillRect(x + 60, y + 15, 25, 20);

        this.ctx.strokeStyle = "#000";

        this.ctx.lineWidth = 1;

        this.ctx.strokeRect(x + 15, y + 15, 25, 20);

        this.ctx.strokeRect(x + 60, y + 15, 25, 20);

        this.ctx.fillStyle = "#8B4513";

        this.ctx.fillRect(x + 40, y + height - 20, 20, 15);

        this.ctx.fillStyle = "#FFD700";

        this.ctx.beginPath();

        this.ctx.arc(x + 55, y + height - 12, 2, 0, 2 * Math.PI);

        this.ctx.fill();

        this.ctx.fillStyle = "#FFD700";

        this.ctx.fillRect(x - 5, y - 15, width + 10, 10);

        this.ctx.strokeStyle = "#000";

        this.ctx.lineWidth = 2;

        this.ctx.strokeRect(x - 5, y - 15, width + 10, 10);

        this.ctx.fillStyle = "#000";

        this.ctx.font = "bold 10px Arial";

        this.ctx.textAlign = "center";

        this.ctx.fillText("RESTAURANT", x + width / 2, y - 6);

        this.ctx.restore();

    }

    drawInteractionPoints() {

        this.ctx.fillStyle = "#4CAF50";

        for (const building of this.buildings) {

            if (!building.interactive) {

                continue;

            }

            const markerX = building.x + building.width / 2;

            const markerY = building.y + building.height + 20;

            this.ctx.beginPath();

            this.ctx.arc(markerX, markerY, 8, 0, 2 * Math.PI);

            this.ctx.fill();

        }

    }

    drawGoldenHourLighting() {

        this.ctx.save();

        this.ctx.globalAlpha = 0.22;

        const warm = this.ctx.createLinearGradient(

            this.camera.x - this.width * 0.2,

            this.camera.y,

            this.camera.x + this.width,

            this.camera.y + this.height * 0.6

        );

        warm.addColorStop(0, "rgba(255, 184, 108, 0.6)");

        warm.addColorStop(1, "rgba(255, 184, 108, 0)");

        this.ctx.fillStyle = warm;

        this.ctx.fillRect(this.camera.x, this.camera.y, this.width, this.height);

        this.ctx.globalAlpha = 0.12;

        const cool = this.ctx.createLinearGradient(

            this.camera.x + this.width,

            this.camera.y + this.height,

            this.camera.x,

            this.camera.y

        );

        cool.addColorStop(0, "rgba(60, 80, 110, 0.7)");

        cool.addColorStop(1, "rgba(0, 0, 0, 0)");

        this.ctx.fillStyle = cool;

        this.ctx.fillRect(this.camera.x, this.camera.y, this.width, this.height);

        this.ctx.restore();

    }

    drawPlayer() {

        const playerRenderable = {

            x: this.player.x + this.player.width / 2,

            y: this.player.y + this.player.height / 2,

            parts: this.player.parts,

            animationPhase: this.player.animationPhase ?? 0,

            moving: this.player.moving

        };

        this.drawCharacterParts(playerRenderable);

        if (this.nearBuilding) {

            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';

            this.ctx.fillRect(this.player.x - 5, this.player.y - 36, 40, 26);

            this.ctx.fillStyle = '#FFF';

            this.ctx.font = 'bold 16px Arial';

            this.ctx.textAlign = 'center';

            this.ctx.fillText('E', this.player.x + 15, this.player.y - 18);

        }

    }

    drawUI() {

        document.getElementById("playerPos").textContent = 

            Math.round(this.player.x) + ", " + Math.round(this.player.y);

        this.ctx.fillStyle = "rgba(0, 0, 0, 0.8)";

        this.ctx.fillRect(10, 60, 350, 120);

        this.ctx.fillStyle = "#FFF";

        this.ctx.font = "16px Arial";

        this.ctx.fillText("Canvas: " + this.width + "x" + this.height, 15, 85);

        this.ctx.fillText("Player: " + this.player.x + ", " + this.player.y, 15, 110);

        this.ctx.fillText("Camera: " + Math.round(this.camera.x) + ", " + Math.round(this.camera.y), 15, 135);

        this.ctx.fillText("Zoom: " + this.zoom + "x", 15, 160);

        this.ctx.fillText("Near Building: " + (this.nearBuilding ? this.nearBuilding.name : "None"), 15, 185);

    }

    showBuildingInteraction(building) {

        document.getElementById("buildingName").textContent = building.name;

        this.interactionUI.style.display = "block";

    }

    hideBuildingInteraction() {

        this.interactionUI.style.display = "none";

    }

    gameLoop() {

        this.update();

        this.render();

        requestAnimationFrame(() => this.gameLoop());

    }

}

document.addEventListener("DOMContentLoaded", () => {

    console.log("DOM ist geladen, Spiel wird gestartet!");

    new OverworldGame();

});

