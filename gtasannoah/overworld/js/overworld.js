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
            speed: 3,
            color: "#FF0000"
        };
        
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
        
        this.roadLayout = this.createCityRoadLayout();
        this.buildings = this.createCityBuildings();
        console.log("Buildings prepared", Array.isArray(this.buildings) ? this.buildings.length : this.buildings);
        this.streetDetails = this.createStreetDetails();
        this.ambientActors = this.createAmbientActors();

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
        this.updateFPS();
    }
    
    handleInput() {
        let dx = 0;
        let dy = 0;
        
        if (this.keys["w"] || this.keys["arrowup"]) dy -= this.player.speed;
        if (this.keys["s"] || this.keys["arrowdown"]) dy += this.player.speed;
        if (this.keys["a"] || this.keys["arrowleft"]) dx -= this.player.speed;
        if (this.keys["d"] || this.keys["arrowright"]) dx += this.player.speed;
        
        let newX = this.player.x + dx;
        let newY = this.player.y + dy;
        
        // Weltgrenzen - größere Welt
        const worldWidth = 3000;
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
        const worldWidth = 3000;
        const worldHeight = 3000;
        
        this.camera.x = Math.max(0, Math.min(this.camera.x, worldWidth - this.width));
        this.camera.y = Math.max(0, Math.min(this.camera.y, worldHeight - this.height));
    }
    
    checkBuildingCollisions() {
        this.nearBuilding = null;
        
        // Alle Gebäude (Geschäfte + Wohngebäude)
        const buildings = this.getAllBuildings();
        if (!Array.isArray(buildings)) {
            return;
        }
        
        for (let building of buildings) {
            if (this.player.x < building.x + building.width &&
                this.player.x + this.player.width > building.x &&
                this.player.y < building.y + building.height &&
                this.player.y + this.player.height > building.y) {
                
                if (this.player.x < building.x) {
                    this.player.x = building.x - this.player.width;
                } else if (this.player.x > building.x) {
                    this.player.x = building.x + building.width;
                }
                
                if (this.player.y < building.y) {
                    this.player.y = building.y - this.player.height;
                } else if (this.player.y > building.y) {
                    this.player.y = building.y + building.height;
                }
            }
            
            const interactionRange = 60;
            if (this.player.x < building.x + building.width + interactionRange &&
                this.player.x + this.player.width > building.x - interactionRange &&
                this.player.y < building.y + building.height + interactionRange &&
                this.player.y + this.player.height > building.y - interactionRange) {
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
        this.ctx.fillRect(0, 0, 3000, 3000);

        this.drawImprovedRoadSystem();
        this.drawSidewalks();
        this.drawStreetDetails();
        this.drawBuildings();
        this.drawAmbientActors();
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
    createCityRoadLayout() {
        const roads = [];

        const verticalCorridors = [200, 950, 1700, 2450, 2800];
        const horizontalCorridors = [200, 900, 1700, 2400, 2800];

        for (let y of horizontalCorridors) {
            roads.push({ type: "horizontal", startX: 200, endX: 2800, y });
        }

        for (let x of verticalCorridors) {
            roads.push({ type: "vertical", x, startY: 200, endY: 2800 });
        }

        // Verbindungsstraßen, die Plätze und Innenhöfe erschließen
        roads.push({ type: "horizontal", startX: 950, endX: 1700, y: 1260 });
        roads.push({ type: "horizontal", startX: 950, endX: 1700, y: 2100 });
        roads.push({ type: "vertical", x: 1330, startY: 1700, endY: 2400 });
        roads.push({ type: "vertical", x: 2050, startY: 900, endY: 1700 });

        // Diagonale Blickachsen zum zentralen Platz
        roads.push({ type: "diagonal", startX: 950, startY: 900, endX: 1700, endY: 1700 });
        roads.push({ type: "diagonal", startX: 1700, startY: 900, endX: 950, endY: 1700 });

        return roads;
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

        // Landmark: Casino-Hotel-Tower mit vorgelagertem Platz
        buildings.push({
            x: 1180,
            y: 280,
            width: 360,
            height: 540,
            name: "Starlight Casino Tower",
            type: "casino",
            interactive: true
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
            { x: 280, y: 980, width: 250, height: 300, styleIndex: 0, floors: 6, roofGarden: true, balconyRhythm: 2, erker: true },
            { x: 560, y: 960, width: 300, height: 280, styleIndex: 1, floors: 5, roofGarden: false, balconyRhythm: 3 },
            { x: 280, y: 1300, width: 240, height: 320, styleIndex: 3, floors: 4, roofGarden: true, balconyRhythm: 2 },
            { x: 560, y: 1310, width: 300, height: 300, styleIndex: 4, floors: 7, roofGarden: false, balconyRhythm: 4 },
            { x: 980, y: 960, width: 260, height: 260, styleIndex: 2, floors: 7, roofGarden: true, balconyRhythm: 3 },
            { x: 1260, y: 960, width: 280, height: 240, styleIndex: 5, floors: 5, roofGarden: false, balconyRhythm: 2, stepped: true },
            { x: 980, y: 1300, width: 260, height: 260, styleIndex: 0, floors: 5, roofGarden: true, balconyRhythm: 3 },
            { x: 1270, y: 1280, width: 340, height: 280, styleIndex: 1, floors: 6, roofGarden: true, balconyRhythm: 3, erker: true },
            { x: 1760, y: 320, width: 300, height: 320, styleIndex: 2, floors: 6, roofGarden: true, balconyRhythm: 2 },
            { x: 2080, y: 320, width: 300, height: 280, styleIndex: 4, floors: 5, roofGarden: false, balconyRhythm: 3 },
            { x: 1760, y: 700, width: 520, height: 180, styleIndex: 5, floors: 4, roofGarden: true, balconyRhythm: 2 },
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
            { x: 580, y: 2200, width: 260, height: 200, styleIndex: 4, floors: 6, roofGarden: false, balconyRhythm: 2 }
        ];

        for (const blueprint of residentialBlueprints) {
            const styleIndex = blueprint.styleIndex % this.houseStyles.length;
            buildings.push({
                x: blueprint.x,
                y: blueprint.y,
                width: blueprint.width,
                height: blueprint.height,
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
                    stepped: Boolean(blueprint.stepped)
                }
            });
            houseCounter++;
        }

        return buildings;
    }

    createStreetDetails() {
        const details = {
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
            const upper = y - 25 - this.sidewalkWidth / 2;
            const lower = y + 25 + this.sidewalkWidth / 2;
            for (let x = 260; x <= 2440; x += 220) {
                addTree(x, upper, 30, (x / 220) % 3);
                addTree(x, lower, 32, ((x + 110) / 180) % 3);
            }
        }

        const verticalColumns = [950, 1700];
        for (const x of verticalColumns) {
            const left = x - 25 - this.sidewalkWidth / 2;
            const right = x + 25 + this.sidewalkWidth / 2;
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
            { y: 2120, start: 1780, end: 2320, step: 140 }
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

    createAmbientActors() {
        return {
            vehicles: [
                { x: 980, y: 872, width: 92, height: 44, color: "#d35400", direction: "east", lights: true },
                { x: 1880, y: 1688, width: 118, height: 46, color: "#2980b9", direction: "west", lights: true },
                { x: 520, y: 1688, width: 96, height: 44, color: "#9b59b6", direction: "east", lights: false }
            ],
            people: [
                { x: 1160, y: 1960, color: "#f4c27a" },
                { x: 1350, y: 1980, color: "#bfe0ff" },
                { x: 1500, y: 1920, color: "#f7a1a1" },
                { x: 2060, y: 1860, color: "#fee29d" }
            ]
        };
    }

        drawImprovedRoadSystem() {
        const asphalt = "#2c3036";
        const edgeColor = "#42474f";
        const laneColor = "rgba(255, 224, 150, 0.9)";

        this.ctx.save();

        for (const road of this.roadLayout) {
            if (road.type === "horizontal") {
                const length = road.endX - road.startX;
                this.ctx.fillStyle = asphalt;
                this.ctx.fillRect(road.startX, road.y - 25, length, 50);

                this.ctx.fillStyle = edgeColor;
                this.ctx.fillRect(road.startX, road.y - 27, length, 2);
                this.ctx.fillRect(road.startX, road.y + 25, length, 2);
            } else if (road.type === "vertical") {
                const length = road.endY - road.startY;
                this.ctx.fillStyle = asphalt;
                this.ctx.fillRect(road.x - 25, road.startY, 50, length);

                this.ctx.fillStyle = edgeColor;
                this.ctx.fillRect(road.x - 27, road.startY, 2, length);
                this.ctx.fillRect(road.x + 25, road.startY, 2, length);
            } else if (road.type === "diagonal") {
                this.ctx.fillStyle = asphalt;
                this.drawDiagonalRoad(road);
            }
        }

        this.ctx.strokeStyle = laneColor;
        this.ctx.lineWidth = 3;
        this.ctx.setLineDash([32, 28]);

        for (const road of this.roadLayout) {
            this.ctx.beginPath();
            if (road.type === "horizontal") {
                this.ctx.moveTo(road.startX, road.y);
                this.ctx.lineTo(road.endX, road.y);
            } else if (road.type === "vertical") {
                this.ctx.moveTo(road.x, road.startY);
                this.ctx.lineTo(road.x, road.endY);
            }
            if (road.type !== "diagonal") {
                this.ctx.stroke();
            }
        }

        this.ctx.setLineDash([]);
        this.ctx.restore();

        const crosswalks = [
            { x: 1100, y: 1700, orientation: "horizontal", span: 240 },
            { x: 1700, y: 1700, orientation: "vertical", span: 240 },
            { x: 1100, y: 900, orientation: "horizontal", span: 240 },
            { x: 1700, y: 900, orientation: "vertical", span: 240 },
            { x: 2050, y: 1700, orientation: "horizontal", span: 260 }
        ];

        for (const crosswalk of crosswalks) {
            this.drawCrosswalk(crosswalk);
        }
    }

    drawDiagonalRoad(road) {
        const dx = road.endX - road.startX;
        const dy = road.endY - road.startY;
        const angle = Math.atan2(dy, dx);
        const width = 50;
        const halfWidth = width / 2;
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

    drawSidewalks() {
        const width = this.sidewalkWidth;
        const surface = "#d9d1c4";
        const grout = "rgba(255, 255, 255, 0.18)";

        for (const road of this.roadLayout) {
            if (road.type === "horizontal") {
                const length = road.endX - road.startX;

                this.ctx.fillStyle = surface;
                this.ctx.fillRect(road.startX, road.y - 25 - width, length, width);
                this.ctx.fillRect(road.startX, road.y + 25, length, width);

                this.ctx.save();
                this.ctx.strokeStyle = grout;
                this.ctx.lineWidth = 1;
                for (let x = road.startX; x <= road.endX; x += 50) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(x, road.y - 25 - width);
                    this.ctx.lineTo(x, road.y - 25);
                    this.ctx.stroke();

                    this.ctx.beginPath();
                    this.ctx.moveTo(x, road.y + 25);
                    this.ctx.lineTo(x, road.y + 25 + width);
                    this.ctx.stroke();
                }
                this.ctx.restore();
            } else if (road.type === "vertical") {
                const length = road.endY - road.startY;

                this.ctx.fillStyle = surface;
                this.ctx.fillRect(road.x - 25 - width, road.startY, width, length);
                this.ctx.fillRect(road.x + 25, road.startY, width, length);

                this.ctx.save();
                this.ctx.strokeStyle = grout;
                this.ctx.lineWidth = 1;
                for (let y = road.startY; y <= road.endY; y += 50) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(road.x - 25 - width, y);
                    this.ctx.lineTo(road.x - 25, y);
                    this.ctx.stroke();

                    this.ctx.beginPath();
                    this.ctx.moveTo(road.x + 25, y);
                    this.ctx.lineTo(road.x + 25 + width, y);
                    this.ctx.stroke();
                }
                this.ctx.restore();
            } else if (road.type === "diagonal") {
                this.drawDiagonalSidewalks(road);
            }
        }
    }

    drawDiagonalSidewalks(road) {
        const width = this.sidewalkWidth;
        const surface = "#d9d1c4";
        const roadWidth = 50;
        const totalWidth = roadWidth + width * 2;
        const halfTotalWidth = totalWidth / 2;

        const dx = road.endX - road.startX;
        const dy = road.endY - road.startY;
        const angle = Math.atan2(dy, dx);
        const perpX = -Math.sin(angle) * halfTotalWidth;
        const perpY = Math.cos(angle) * halfTotalWidth;
        const offsetX = -Math.sin(angle) * width;
        const offsetY = Math.cos(angle) * width;

        this.ctx.save();
        this.ctx.fillStyle = surface;

        this.ctx.beginPath();
        this.ctx.moveTo(road.startX + perpX, road.startY + perpY);
        this.ctx.lineTo(road.startX + perpX + offsetX, road.startY + perpY + offsetY);
        this.ctx.lineTo(road.endX + perpX + offsetX, road.endY + perpY + offsetY);
        this.ctx.lineTo(road.endX + perpX, road.endY + perpY);
        this.ctx.closePath();
        this.ctx.fill();

        this.ctx.beginPath();
        this.ctx.moveTo(road.startX - perpX, road.startY - perpY);
        this.ctx.lineTo(road.startX - perpX - offsetX, road.startY - perpY - offsetY);
        this.ctx.lineTo(road.endX - perpX - offsetX, road.endY - perpY - offsetY);
        this.ctx.lineTo(road.endX - perpX, road.endY - perpY);
        this.ctx.closePath();
        this.ctx.fill();

        const length = Math.hypot(dx, dy);
        const segments = Math.max(1, Math.floor(length / 50));
        this.ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
        this.ctx.lineWidth = 1;
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const px = road.startX + dx * t;
            const py = road.startY + dy * t;

            this.ctx.beginPath();
            this.ctx.moveTo(px + perpX, py + perpY);
            this.ctx.lineTo(px + perpX + offsetX * 0.6, py + perpY + offsetY * 0.6);
            this.ctx.stroke();

            this.ctx.beginPath();
            this.ctx.moveTo(px - perpX, py - perpY);
            this.ctx.lineTo(px - perpX - offsetX * 0.6, py - perpY - offsetY * 0.6);
            this.ctx.stroke();
        }

        this.ctx.restore();
    }

    drawCrosswalk(config) {
        const { x, y, orientation, span } = config;
        const stripeWidth = 6;
        const gap = 10;
        const roadWidth = 50;
        const stripeColor = "rgba(255, 255, 255, 0.85)";
        const shadowColor = "rgba(0, 0, 0, 0.08)";

        this.ctx.save();
        this.ctx.fillStyle = stripeColor;

        if (orientation === "horizontal") {
            const startX = x - span / 2;
            const endX = x + span / 2;
            for (let sx = startX; sx <= endX; sx += stripeWidth + gap) {
                this.ctx.fillStyle = stripeColor;
                this.ctx.fillRect(sx, y - 25, stripeWidth, roadWidth);
                this.ctx.fillStyle = shadowColor;
                this.ctx.fillRect(sx, y - 25, stripeWidth, 4);
            }
        } else {
            const startY = y - span / 2;
            const endY = y + span / 2;
            for (let sy = startY; sy <= endY; sy += stripeWidth + gap) {
                this.ctx.fillStyle = stripeColor;
                this.ctx.fillRect(x - 25, sy, roadWidth, stripeWidth);
                this.ctx.fillStyle = shadowColor;
                this.ctx.fillRect(x - 25, sy, 4, stripeWidth);
            }
        }

        this.ctx.restore();
    }

    drawStreetDetails() {
        if (!this.streetDetails) {
            return;
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

    drawAmbientActors() {
        if (!this.ambientActors) {
            return;
        }

        for (const vehicle of this.ambientActors.vehicles) {
            this.drawVehicle(vehicle);
        }

        for (const person of this.ambientActors.people) {
            this.drawPerson(person);
        }
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

    drawVehicle(vehicle) {
        const { x, y, width, height, color, direction, lights } = vehicle;
        this.ctx.save();

        this.ctx.fillStyle = color;
        this.ctx.fillRect(x, y, width, height);

        this.ctx.fillStyle = "#1f2a36";
        this.ctx.fillRect(x + 6, y + 6, width - 12, height / 2);

        if (direction === "east") {
            this.ctx.fillStyle = "rgba(255, 240, 180, 0.9)";
            if (lights) {
                this.ctx.fillRect(x + width - 4, y + 4, 4, height - 8);
            }
            this.ctx.fillStyle = "rgba(255, 80, 60, 0.7)";
            this.ctx.fillRect(x, y + height - 6, 8, 4);
        } else if (direction === "west") {
            this.ctx.fillStyle = "rgba(255, 240, 180, 0.9)";
            if (lights) {
                this.ctx.fillRect(x, y + 4, 4, height - 8);
            }
            this.ctx.fillStyle = "rgba(255, 80, 60, 0.7)";
            this.ctx.fillRect(x + width - 8, y + height - 6, 8, 4);
        }

        this.ctx.restore();
    }

    drawPerson(person) {
        const { x, y, color } = person;
        this.ctx.save();
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.arc(x, y - 6, 6, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.fillStyle = "#2f2f2f";
        this.ctx.fillRect(x - 4, y - 6, 8, 16);
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
        const { x, y, width, height, variant = {} } = building;
        const styleIndex = variant.styleIndex ?? building.colorIndex ?? 0;
        const palette = this.houseStyles[styleIndex % this.houseStyles.length];

        const floors = Math.max(3, variant.floors ?? palette.floors ?? 5);
        const roofGarden = variant.roofGarden ?? palette.roofGarden ?? false;
        const balconyRhythm = Math.max(2, variant.balconyRhythm ?? 3);
        const erker = Boolean(variant.erker);
        const stepped = Boolean(variant.stepped);

        this.ctx.save();

        // Basis und warme Highlight-Simulation
        this.ctx.fillStyle = palette.base;
        this.ctx.fillRect(x, y, width, height);

        const warmGradient = this.ctx.createLinearGradient(x, y, x + width * 0.8, y + height * 0.6);
        warmGradient.addColorStop(0, "rgba(255, 196, 128, 0.28)");
        warmGradient.addColorStop(1, "rgba(0, 0, 0, 0)");
        this.ctx.fillStyle = warmGradient;
        this.ctx.fillRect(x, y, width, height);

        const coolGradient = this.ctx.createLinearGradient(x + width, y + height, x + width * 0.4, y + height * 0.4);
        coolGradient.addColorStop(0, "rgba(70, 90, 120, 0.18)");
        coolGradient.addColorStop(1, "rgba(0, 0, 0, 0)");
        this.ctx.fillStyle = coolGradient;
        this.ctx.fillRect(x, y, width, height);

        // Umrandung
        this.ctx.strokeStyle = palette.roof;
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x, y, width, height);

        this.ctx.setLineDash([12, 6]);
        this.ctx.strokeStyle = palette.accent;
        this.ctx.lineWidth = 1.5;
        this.ctx.strokeRect(x + 8, y + 8, width - 16, height - 16);
        this.ctx.setLineDash([]);

        // Dachgestaltung: Garten oder Technikaufsätze
        if (roofGarden) {
            const padding = Math.min(width, height) * 0.18;
            this.ctx.fillStyle = "#6ea56f";
            this.ctx.fillRect(x + padding, y + padding, width - padding * 2, height - padding * 2);

            this.ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
            this.ctx.lineWidth = 1;
            for (let i = x + padding; i <= x + width - padding; i += 26) {
                this.ctx.beginPath();
                this.ctx.moveTo(i, y + padding);
                this.ctx.lineTo(i, y + height - padding);
                this.ctx.stroke();
            }
        } else {
            const hvacCount = Math.max(2, Math.floor(width / 90));
            const unitWidth = Math.min(36, width / (hvacCount + 1));
            const unitHeight = Math.min(24, height / 4);
            for (let i = 0; i < hvacCount; i++) {
                const ux = x + 20 + i * (unitWidth + 16);
                const uy = y + height / 2 - unitHeight / 2;
                this.ctx.fillStyle = palette.metallic;
                this.ctx.fillRect(ux, uy, unitWidth, unitHeight);
                this.ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
                this.ctx.fillRect(ux + 4, uy + 4, unitWidth - 8, unitHeight - 8);
            }
        }

        // Balkone als rhythmische Auskragungen
        const moduleWidth = width / (balconyRhythm + 1);
        this.ctx.fillStyle = palette.balcony;
        for (let i = 1; i <= balconyRhythm; i++) {
            const bx = x + i * moduleWidth - 8;
            this.ctx.fillRect(bx, y - 6, 16, 6);
            this.ctx.fillRect(bx, y + height, 16, 6);
        }

        // Erker/Erweiterungen
        if (erker) {
            const erkerWidth = width * 0.32;
            const erkerDepth = 10;
            const center = x + width / 2 - erkerWidth / 2;
            this.ctx.fillStyle = palette.accent;
            this.ctx.fillRect(center, y - erkerDepth, erkerWidth, erkerDepth);
            this.ctx.fillRect(center, y + height, erkerWidth, erkerDepth);
        }

        // Staffelung der oberen Geschosse
        if (stepped) {
            const stepWidth = width * 0.45;
            const stepHeight = height * 0.45;
            this.ctx.fillStyle = palette.accent;
            this.ctx.fillRect(x + width - stepWidth - 12, y + 12, stepWidth, stepHeight);
            this.ctx.strokeStyle = "rgba(0, 0, 0, 0.2)";
            this.ctx.strokeRect(x + width - stepWidth - 12, y + 12, stepWidth, stepHeight);
        }

        // Dachbegrünung mit Punktbeleuchtung
        if (roofGarden) {
            this.ctx.fillStyle = "rgba(255, 245, 200, 0.4)";
            for (let i = 0; i < floors; i++) {
                const angle = (Math.PI * 2 * i) / floors;
                const radius = Math.min(width, height) * 0.3;
                const px = x + width / 2 + Math.cos(angle) * radius * 0.6;
                const py = y + height / 2 + Math.sin(angle) * radius * 0.4;
                this.ctx.beginPath();
                this.ctx.arc(px, py, 4, 0, Math.PI * 2);
                this.ctx.fill();
            }
        }

        // Skylights als Fensterbänder
        const skylightCount = Math.max(2, Math.floor(width / 70));
        this.ctx.fillStyle = "rgba(220, 236, 255, 0.8)";
        for (let i = 0; i < skylightCount; i++) {
            const sx = x + 18 + i * (width - 36) / Math.max(1, skylightCount - 1) - 12;
            const sy = y + height / 2 - 6;
            this.ctx.fillRect(sx, sy, 24, 12);
            this.ctx.fillStyle = "rgba(80, 110, 160, 0.35)";
            this.ctx.fillRect(sx, sy, 24, 4);
            this.ctx.fillStyle = "rgba(220, 236, 255, 0.8)";
        }

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

        this.ctx.fillStyle = "rgba(120, 180, 220, 0.42)";
        this.ctx.fillRect(x + 20, y + height - 60, width - 40, 24);

        const plazaY = y + height + 10;
        const fountainWidth = width + 140;
        const fountainX = x - 70;
        const fountainHeight = 68;
        const waterGradient = this.ctx.createLinearGradient(fountainX, plazaY, fountainX, plazaY + fountainHeight);
        waterGradient.addColorStop(0, "rgba(90, 180, 230, 0.85)");
        waterGradient.addColorStop(1, "rgba(20, 60, 100, 0.85)");
        this.ctx.fillStyle = waterGradient;
        this.ctx.fillRect(fountainX, plazaY, fountainWidth, fountainHeight);
        this.ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(fountainX, plazaY, fountainWidth, fountainHeight);

        for (let i = 0; i <= 5; i++) {
            const fx = fountainX + 20 + i * (fountainWidth - 40) / 5;
            const fy = plazaY + fountainHeight / 2;
            this.ctx.beginPath();
            this.ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
            this.ctx.arc(fx, fy, 6, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.beginPath();
            this.ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
            this.ctx.arc(fx, fy - 12, 4, 0, Math.PI * 2);
            this.ctx.fill();
        }

        this.ctx.fillStyle = "#c9b89f";
        this.ctx.fillRect(fountainX, plazaY + fountainHeight, fountainWidth, 40);
        this.ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
        this.ctx.lineWidth = 1;
        for (let lineX = fountainX; lineX <= fountainX + fountainWidth; lineX += 36) {
            this.ctx.beginPath();
            this.ctx.moveTo(lineX, plazaY + fountainHeight);
            this.ctx.lineTo(lineX, plazaY + fountainHeight + 40);
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
        this.ctx.fillStyle = this.player.color;
        this.ctx.fillRect(this.player.x, this.player.y, this.player.width, this.player.height);
        
        this.ctx.strokeStyle = "#000";
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(this.player.x, this.player.y, this.player.width, this.player.height);
        
        this.ctx.fillStyle = "#FFF";
        this.ctx.fillRect(this.player.x + 8, this.player.y + 8, 6, 6);
        this.ctx.fillRect(this.player.x + 16, this.player.y + 8, 6, 6);
        
        this.ctx.fillStyle = "#000";
        this.ctx.fillRect(this.player.x + 10, this.player.y + 10, 2, 2);
        this.ctx.fillRect(this.player.x + 18, this.player.y + 10, 2, 2);
        
        if (this.nearBuilding) {
            this.ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
            this.ctx.fillRect(this.player.x - 15, this.player.y - 40, 60, 30);
            
            this.ctx.fillStyle = "#FFF";
            this.ctx.font = "16px Arial";
            this.ctx.textAlign = "center";
            this.ctx.fillText("E", this.player.x + 15, this.player.y - 20);
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






