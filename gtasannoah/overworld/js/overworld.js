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
    
    getAllBuildings() {
        return [
            // GESCHÄFTE - NEBEN den Straßen
            {x: 300, y: 200, width: 100, height: 200, name: "Diamond Casino", type: "casino", interactive: true},
            {x: 1200, y: 300, width: 120, height: 80, name: "Polizeistation", type: "police", interactive: true},
            {x: 300, y: 1200, width: 100, height: 80, name: "Supermarkt", type: "shop", interactive: true},
            {x: 1200, y: 1200, width: 100, height: 80, name: "Restaurant", type: "restaurant", interactive: true},
            
            // WOHNGEBÄUDE - EINZIGARTIGE KOORDINATEN!
            // Obere Reihe - Y=20
            {x: 100, y: 20, width: 80, height: 60, name: "Wohnhaus 1", type: "house", interactive: false, colorIndex: 0},
            {x: 200, y: 20, width: 80, height: 60, name: "Wohnhaus 2", type: "house", interactive: false, colorIndex: 1},
            {x: 300, y: 20, width: 80, height: 60, name: "Wohnhaus 3", type: "house", interactive: false, colorIndex: 2},
            {x: 400, y: 20, width: 80, height: 60, name: "Wohnhaus 4", type: "house", interactive: false, colorIndex: 3},
            {x: 500, y: 20, width: 80, height: 60, name: "Wohnhaus 5", type: "house", interactive: false, colorIndex: 4},
            {x: 600, y: 20, width: 80, height: 60, name: "Wohnhaus 6", type: "house", interactive: false, colorIndex: 5},
            
            // Zweite Reihe - Y=100
            {x: 100, y: 100, width: 80, height: 60, name: "Wohnhaus 7", type: "house", interactive: false, colorIndex: 6},
            {x: 200, y: 100, width: 80, height: 60, name: "Wohnhaus 8", type: "house", interactive: false, colorIndex: 7},
            {x: 300, y: 100, width: 80, height: 60, name: "Wohnhaus 9", type: "house", interactive: false, colorIndex: 8},
            {x: 400, y: 100, width: 80, height: 60, name: "Wohnhaus 10", type: "house", interactive: false, colorIndex: 9},
            {x: 500, y: 100, width: 80, height: 60, name: "Wohnhaus 11", type: "house", interactive: false, colorIndex: 0},
            {x: 600, y: 100, width: 80, height: 60, name: "Wohnhaus 12", type: "house", interactive: false, colorIndex: 1},
            
            // Linke Reihe - X=20
            {x: 20, y: 200, width: 60, height: 80, name: "Wohnhaus 13", type: "house", interactive: false, colorIndex: 2},
            {x: 20, y: 300, width: 60, height: 80, name: "Wohnhaus 14", type: "house", interactive: false, colorIndex: 3},
            {x: 20, y: 400, width: 60, height: 80, name: "Wohnhaus 15", type: "house", interactive: false, colorIndex: 4},
            {x: 20, y: 600, width: 60, height: 80, name: "Wohnhaus 16", type: "house", interactive: false, colorIndex: 5},
            {x: 20, y: 700, width: 60, height: 80, name: "Wohnhaus 17", type: "house", interactive: false, colorIndex: 6},
            {x: 20, y: 800, width: 60, height: 80, name: "Wohnhaus 18", type: "house", interactive: false, colorIndex: 7},
            
            // Rechte Reihe - X=1100
            {x: 1100, y: 200, width: 60, height: 80, name: "Wohnhaus 19", type: "house", interactive: false, colorIndex: 8},
            {x: 1100, y: 300, width: 60, height: 80, name: "Wohnhaus 20", type: "house", interactive: false, colorIndex: 9},
            {x: 1100, y: 400, width: 60, height: 80, name: "Wohnhaus 21", type: "house", interactive: false, colorIndex: 0},
            {x: 1100, y: 600, width: 60, height: 80, name: "Wohnhaus 22", type: "house", interactive: false, colorIndex: 1},
            {x: 1100, y: 700, width: 60, height: 80, name: "Wohnhaus 23", type: "house", interactive: false, colorIndex: 2},
            {x: 1100, y: 800, width: 60, height: 80, name: "Wohnhaus 24", type: "house", interactive: false, colorIndex: 3},
            
            // Untere Reihe - Y=1700
            {x: 100, y: 1700, width: 80, height: 60, name: "Wohnhaus 25", type: "house", interactive: false, colorIndex: 4},
            {x: 200, y: 1700, width: 80, height: 60, name: "Wohnhaus 26", type: "house", interactive: false, colorIndex: 5},
            {x: 300, y: 1700, width: 80, height: 60, name: "Wohnhaus 27", type: "house", interactive: false, colorIndex: 6},
            {x: 400, y: 1700, width: 80, height: 60, name: "Wohnhaus 28", type: "house", interactive: false, colorIndex: 7},
            {x: 500, y: 1700, width: 80, height: 60, name: "Wohnhaus 29", type: "house", interactive: false, colorIndex: 8},
            {x: 600, y: 1700, width: 80, height: 60, name: "Wohnhaus 30", type: "house", interactive: false, colorIndex: 9},
            
            // Zusätzliche Häuser - Y=1800
            {x: 100, y: 1800, width: 80, height: 60, name: "Wohnhaus 31", type: "house", interactive: false, colorIndex: 0},
            {x: 200, y: 1800, width: 80, height: 60, name: "Wohnhaus 32", type: "house", interactive: false, colorIndex: 1},
            {x: 300, y: 1800, width: 80, height: 60, name: "Wohnhaus 33", type: "house", interactive: false, colorIndex: 2},
            {x: 400, y: 1800, width: 80, height: 60, name: "Wohnhaus 34", type: "house", interactive: false, colorIndex: 3},
            {x: 500, y: 1800, width: 80, height: 60, name: "Wohnhaus 35", type: "house", interactive: false, colorIndex: 4},
            {x: 600, y: 1800, width: 80, height: 60, name: "Wohnhaus 36", type: "house", interactive: false, colorIndex: 5},
            
            // Weitere Häuser - Y=1900
            {x: 100, y: 1900, width: 80, height: 60, name: "Wohnhaus 37", type: "house", interactive: false, colorIndex: 6},
            {x: 200, y: 1900, width: 80, height: 60, name: "Wohnhaus 38", type: "house", interactive: false, colorIndex: 7},
            {x: 300, y: 1900, width: 80, height: 60, name: "Wohnhaus 39", type: "house", interactive: false, colorIndex: 8},
            {x: 400, y: 1900, width: 80, height: 60, name: "Wohnhaus 40", type: "house", interactive: false, colorIndex: 9}
        ];
    }
    
    updateFPS() {
        this.frameCount++;
        const currentTime = performance.now();
        if (currentTime - this.lastTime >= 1000) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.lastTime = currentTime;
            document.getElementById("fps").textContent = this.fps;
        }
    }
    
    render() {
        this.ctx.clearRect(0, 0, this.width, this.height);
        
        // Kamera-Transformation anwenden
        this.ctx.save();
        this.ctx.translate(-this.camera.x, -this.camera.y);
        
        // Himmel - VOLLSTÄNDIGER HINTERGRUND
        this.ctx.fillStyle = "#87CEEB";
        this.ctx.fillRect(0, 0, 3000, 3000);
        
        // Gras - am unteren Rand
        this.ctx.fillStyle = "#90EE90";
        this.ctx.fillRect(0, 2500, 3000, 500);
        
        // VERBESSERTES STRAßENSYSTEM
        this.drawImprovedRoadSystem();
        
        // GEHWEGE - KORREKT MIT STRAßEN VERBUNDEN
        this.drawSidewalks();
        
        // Gebäude
        this.drawBuildings();
        
        // Spieler
        this.drawPlayer();
        
        // Kamera-Transformation zurücksetzen
        this.ctx.restore();
        
        // UI (nicht von Kamera betroffen)
        this.drawUI();
    }
    
    drawImprovedRoadSystem() {
        // ZUFÄLLIGES ABER VERBUNDENES STRAßENSYSTEM MIT SCHRÄGEN
        this.ctx.fillStyle = "#2F2F2F";
        
        // Seed für konsistente Zufallswerte
        const seed = 12345;
        const random = this.seededRandom(seed);
        
        // Hauptstraßen - zufällige aber verbundene Positionen
        const mainRoads = this.generateRandomRoadNetwork(random);
        
        // Straßen zeichnen
        for (let road of mainRoads) {
            if (road.type === 'horizontal') {
                this.ctx.fillRect(road.startX, road.y - 25, road.endX - road.startX, 50);
            } else if (road.type === 'vertical') {
                this.ctx.fillRect(road.x - 25, road.startY, 50, road.endY - road.startY);
            } else if (road.type === 'diagonal') {
                // Schräge Straße zeichnen
                this.drawDiagonalRoad(road);
            }
        }
        
        // Straßenmarkierungen
        this.ctx.strokeStyle = "#FFFF00";
        this.ctx.lineWidth = 3;
        this.ctx.setLineDash([30, 30]);
        
        for (let road of mainRoads) {
            this.ctx.beginPath();
            if (road.type === 'horizontal') {
                this.ctx.moveTo(road.startX, road.y);
                this.ctx.lineTo(road.endX, road.y);
            } else if (road.type === 'vertical') {
                this.ctx.moveTo(road.x, road.startY);
                this.ctx.lineTo(road.x, road.endY);
            } else if (road.type === 'diagonal') {
                this.ctx.moveTo(road.startX, road.startY);
                this.ctx.lineTo(road.endX, road.endY);
            }
            this.ctx.stroke();
        }
        
        this.ctx.setLineDash([]);
    }
    
    drawDiagonalRoad(road) {
        // Schräge Straße als Polygon zeichnen
        const dx = road.endX - road.startX;
        const dy = road.endY - road.startY;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        
        // Straßenbreite
        const width = 50;
        const halfWidth = width / 2;
        
        // Perpendikuläre Vektoren für Straßenbreite
        const perpX = -Math.sin(angle) * halfWidth;
        const perpY = Math.cos(angle) * halfWidth;
        
        // Straßenpolygon erstellen
        this.ctx.beginPath();
        this.ctx.moveTo(road.startX + perpX, road.startY + perpY);
        this.ctx.lineTo(road.startX - perpX, road.startY - perpY);
        this.ctx.lineTo(road.endX - perpX, road.endY - perpY);
        this.ctx.lineTo(road.endX + perpX, road.endY + perpY);
        this.ctx.closePath();
        this.ctx.fill();
    }
    
    seededRandom(seed) {
        let x = Math.sin(seed) * 10000;
        return () => {
            x = Math.sin(x) * 10000;
            return x - Math.floor(x);
        };
    }
    
    generateRandomRoadNetwork(random) {
        const roads = [];
        const worldWidth = 3000;
        const worldHeight = 3000;
        
        // STRUKTURIERTES ABER INTERESSANTES STRAßENSYSTEM
        
        // Hauptstraßen - durchgehend aber nicht zu viele
        const mainHorizontalY = 600 + Math.floor(random() * 200); // 600-800
        const mainVerticalX = 1200 + Math.floor(random() * 200);   // 1200-1400
        
        // Hauptstraße horizontal (durchgehend)
        roads.push({
            type: 'horizontal',
            startX: 0,
            endX: worldWidth,
            y: mainHorizontalY
        });
        
        // Hauptstraße vertikal (durchgehend)
        roads.push({
            type: 'vertical',
            x: mainVerticalX,
            startY: 0,
            endY: worldHeight
        });
        
        // Sekundäre Hauptstraßen - kreuzen die Hauptstraßen
        const secondaryHorizontalY = 1400 + Math.floor(random() * 200); // 1400-1600
        const secondaryVerticalX = 600 + Math.floor(random() * 200);    // 600-800
        
        roads.push({
            type: 'horizontal',
            startX: 0,
            endX: worldWidth,
            y: secondaryHorizontalY
        });
        
        roads.push({
            type: 'vertical',
            x: secondaryVerticalX,
            startY: 0,
            endY: worldHeight
        });
        
        // Begrenzte Anzahl von Nebenstraßen - nicht quer durch die ganze Welt
        const neighborhoodCount = 4;
        const neighborhoodSize = 600;
        
        for (let i = 0; i < neighborhoodCount; i++) {
            const baseX = 200 + i * 700;
            const baseY = 200 + i * 700;
            
            // Horizontale Nebenstraßen nur in bestimmten Bereichen
            if (baseY < worldHeight - 200) {
                roads.push({
                    type: 'horizontal',
                    startX: baseX,
                    endX: Math.min(baseX + neighborhoodSize, worldWidth - 200),
                    y: baseY
                });
            }
            
            // Vertikale Nebenstraßen nur in bestimmten Bereichen
            if (baseX < worldWidth - 200) {
                roads.push({
                    type: 'vertical',
                    x: baseX,
                    startY: baseY,
                    endY: Math.min(baseY + neighborhoodSize, worldHeight - 200)
                });
            }
        }
        
        // WENIGE aber strategische schräge Straßen
        const diagonalCount = 3; // Reduziert von 4+6 auf nur 3
        
        for (let i = 0; i < diagonalCount; i++) {
            // Schräge Straßen nur zwischen Hauptstraßen
            const startX = 400 + Math.floor(random() * 800);
            const startY = 400 + Math.floor(random() * 800);
            const length = 300 + Math.floor(random() * 400); // Kürzer
            const angle = Math.PI / 4 + (random() - 0.5) * Math.PI / 6; // 30-60 Grad, weniger extrem
            
            const endX = startX + Math.cos(angle) * length;
            const endY = startY + Math.sin(angle) * length;
            
            // Nur hinzufügen wenn sie nicht zu weit gehen
            if (endX < worldWidth - 200 && endY < worldHeight - 200 && endX > 200 && endY > 200) {
                roads.push({
                    type: 'diagonal',
                    startX: startX,
                    startY: startY,
                    endX: endX,
                    endY: endY
                });
            }
        }
        
        // Kurze Verbindungsstraßen - nur in lokalen Bereichen
        for (let i = 0; i < 4; i++) { // Reduziert von 6 auf 4
            const connectionType = Math.floor(random() * 2); // Nur horizontal/vertikal, keine schrägen
            
            if (connectionType === 0) {
                // Horizontale Verbindung - begrenzt
                const y = 800 + Math.floor(random() * 800);
                const startX = 300 + Math.floor(random() * 600);
                const endX = 1800 + Math.floor(random() * 600);
                
                roads.push({
                    type: 'horizontal',
                    startX: startX,
                    endX: endX,
                    y: y
                });
            } else {
                // Vertikale Verbindung - begrenzt
                const x = 800 + Math.floor(random() * 800);
                const startY = 300 + Math.floor(random() * 600);
                const endY = 1800 + Math.floor(random() * 600);
                
                roads.push({
                    type: 'vertical',
                    x: x,
                    startY: startY,
                    endY: endY
                });
            }
        }
        
        return roads;
    }
    
    drawSidewalks() {
        // Gehwege - AN DAS NEUE ZUFÄLLIGE STRAßENSYSTEM MIT SCHRÄGEN ANGEPASST
        this.ctx.fillStyle = "#C0C0C0";
        
        // Seed für konsistente Zufallswerte (gleicher wie bei Straßen)
        const seed = 12345;
        const random = this.seededRandom(seed);
        const mainRoads = this.generateRandomRoadNetwork(random);
        
        // Gehwege entlang aller Straßen zeichnen
        for (let road of mainRoads) {
            if (road.type === 'horizontal') {
                // Gehwege oben und unten der horizontalen Straße
                this.ctx.fillRect(road.startX, road.y - 45, road.endX - road.startX, 15);
                this.ctx.fillRect(road.startX, road.y + 35, road.endX - road.startX, 15);
            } else if (road.type === 'vertical') {
                // Gehwege links und rechts der vertikalen Straße
                this.ctx.fillRect(road.x - 45, road.startY, 15, road.endY - road.startY);
                this.ctx.fillRect(road.x + 35, road.startY, 15, road.endY - road.startY);
            } else if (road.type === 'diagonal') {
                // Gehwege für schräge Straßen
                this.drawDiagonalSidewalks(road);
            }
        }
    }
    
    drawDiagonalSidewalks(road) {
        // Schräge Gehwege zeichnen
        const dx = road.endX - road.startX;
        const dy = road.endY - road.startY;
        const angle = Math.atan2(dy, dx);
        
        // Gehwegbreite
        const sidewalkWidth = 15;
        const roadWidth = 50;
        const totalWidth = roadWidth + sidewalkWidth * 2;
        const halfTotalWidth = totalWidth / 2;
        
        // Perpendikuläre Vektoren für Gehwegbreite
        const perpX = -Math.sin(angle) * halfTotalWidth;
        const perpY = Math.cos(angle) * halfTotalWidth;
        
        // Äußere Gehwege (links und rechts)
        this.ctx.beginPath();
        this.ctx.moveTo(road.startX + perpX, road.startY + perpY);
        this.ctx.lineTo(road.startX + perpX - Math.sin(angle) * sidewalkWidth, road.startY + perpY + Math.cos(angle) * sidewalkWidth);
        this.ctx.lineTo(road.endX + perpX - Math.sin(angle) * sidewalkWidth, road.endY + perpY + Math.cos(angle) * sidewalkWidth);
        this.ctx.lineTo(road.endX + perpX, road.endY + perpY);
        this.ctx.closePath();
        this.ctx.fill();
        
        this.ctx.beginPath();
        this.ctx.moveTo(road.startX - perpX, road.startY - perpY);
        this.ctx.lineTo(road.startX - perpX + Math.sin(angle) * sidewalkWidth, road.startY - perpY - Math.cos(angle) * sidewalkWidth);
        this.ctx.lineTo(road.endX - perpX + Math.sin(angle) * sidewalkWidth, road.endY - perpY - Math.cos(angle) * sidewalkWidth);
        this.ctx.lineTo(road.endX - perpX, road.endY - perpY);
        this.ctx.closePath();
        this.ctx.fill();
    }
    
    drawBuildings() {
        const buildings = this.getAllBuildings();
        
        for (let building of buildings) {
            if (building.type === "casino") {
                this.drawCasino(building.x, building.y, building.width, building.height);
            } else if (building.type === "police") {
                this.drawPoliceStation(building.x, building.y, building.width, building.height);
            } else if (building.type === "shop") {
                this.drawShop(building.x, building.y, building.width, building.height);
            } else if (building.type === "restaurant") {
                this.drawRestaurant(building.x, building.y, building.width, building.height);
            } else if (building.type === "house") {
                this.drawHouse(building.x, building.y, building.width, building.height, building.colorIndex);
            }
        }
        
        // Interaktionspunkte nur für Geschäfte
        this.drawInteractionPoints();
    }
    
    drawHouse(x, y, width, height, colorIndex) {
        // FESTE HAUSFARBE - keine zufälligen Farben mehr!
        this.ctx.fillStyle = this.houseColors[colorIndex];
        this.ctx.fillRect(x, y, width, height);
        
        // Haus Textur
        this.ctx.fillStyle = "#D2B48C";
        for (let i = 0; i < height; i += 10) {
            this.ctx.fillRect(x, y + i, width, 1);
        }
        for (let i = 0; i < width; i += 10) {
            this.ctx.fillRect(x + i, y, 1, height);
        }
        
        // Haus Umriss
        this.ctx.strokeStyle = "#8B4513";
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x, y, width, height);
        
        // Fenster
        this.ctx.fillStyle = "#87CEEB";
        this.ctx.fillRect(x + 10, y + 10, 15, 15);
        this.ctx.fillRect(x + width - 25, y + 10, 15, 15);
        
        // Fensterrahmen
        this.ctx.strokeStyle = "#000";
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(x + 10, y + 10, 15, 15);
        this.ctx.strokeRect(x + width - 25, y + 10, 15, 15);
        
        // Tür
        this.ctx.fillStyle = "#8B4513";
        this.ctx.fillRect(x + width/2 - 8, y + height - 20, 16, 15);
        
        // Türgriff
        this.ctx.fillStyle = "#FFD700";
        this.ctx.beginPath();
        this.ctx.arc(x + width/2 + 4, y + height - 12, 2, 0, 2 * Math.PI);
        this.ctx.fill();
        
        // Dach
        this.ctx.fillStyle = "#8B4513";
        this.ctx.beginPath();
        this.ctx.moveTo(x - 5, y);
        this.ctx.lineTo(x + width/2, y - 10);
        this.ctx.lineTo(x + width + 5, y);
        this.ctx.closePath();
        this.ctx.fill();
    }
    
    drawCasino(x, y, width, height) {
        // Casino Basis - Sandstein
        this.ctx.fillStyle = "#F4A460";
        this.ctx.fillRect(x, y, width, height);
        
        // Sandstein Textur
        this.ctx.fillStyle = "#E6B800";
        for (let i = 0; i < height; i += 25) {
            this.ctx.fillRect(x, y + i, width, 2);
        }
        for (let i = 0; i < width; i += 25) {
            this.ctx.fillRect(x + i, y, 2, height);
        }
        
        // Casino Umriss
        this.ctx.strokeStyle = "#8B4513";
        this.ctx.lineWidth = 4;
        this.ctx.strokeRect(x, y, width, height);
        
        // Fenster (Hochhaus)
        this.ctx.fillStyle = "#87CEEB";
        for (let floor = 0; floor < 8; floor++) {
            for (let window = 0; window < 4; window++) {
                this.ctx.fillRect(x + 10 + window * 20, y + 15 + floor * 22, 15, 12);
            }
        }
        
        // Fensterrahmen
        this.ctx.strokeStyle = "#000";
        this.ctx.lineWidth = 1;
        for (let floor = 0; floor < 8; floor++) {
            for (let window = 0; window < 4; window++) {
                this.ctx.strokeRect(x + 10 + window * 20, y + 15 + floor * 22, 15, 12);
            }
        }
        
        // Tür
        this.ctx.fillStyle = "#8B4513";
        this.ctx.fillRect(x + 35, y + height - 25, 30, 20);
        
        // Türgriff
        this.ctx.fillStyle = "#FFD700";
        this.ctx.beginPath();
        this.ctx.arc(x + 60, y + height - 15, 3, 0, 2 * Math.PI);
        this.ctx.fill();
        
        // Casino Schild
        this.ctx.fillStyle = "#FFD700";
        this.ctx.fillRect(x - 5, y - 20, width + 10, 15);
        this.ctx.strokeStyle = "#000";
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x - 5, y - 20, width + 10, 15);
        
        this.ctx.fillStyle = "#000";
        this.ctx.font = "bold 14px Arial";
        this.ctx.textAlign = "center";
        this.ctx.fillText("DIAMOND CASINO", x + width/2, y - 8);
        
        // Casino Dach
        this.ctx.fillStyle = "#8B4513";
        this.ctx.beginPath();
        this.ctx.moveTo(x - 8, y);
        this.ctx.lineTo(x + width/2, y - 15);
        this.ctx.lineTo(x + width + 8, y);
        this.ctx.closePath();
        this.ctx.fill();
    }
    
    drawPoliceStation(x, y, width, height) {
        // Grauer Boden (Garage)
        this.ctx.fillStyle = "#696969";
        this.ctx.fillRect(x, y + height - 20, width, 20);
        
        // Blaue Polizei Basis
        this.ctx.fillStyle = "#4169E1";
        this.ctx.fillRect(x, y, width, height - 20);
        
        // Polizei Textur
        this.ctx.fillStyle = "#1E90FF";
        for (let i = 0; i < width; i += 15) {
            this.ctx.fillRect(x + i, y, 2, height - 20);
        }
        
        // Umriss
        this.ctx.strokeStyle = "#000";
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(x, y, width, height);
        
        // Fenster
        this.ctx.fillStyle = "#87CEEB";
        this.ctx.fillRect(x + 15, y + 15, 20, 15);
        this.ctx.fillRect(x + 45, y + 15, 20, 15);
        this.ctx.fillRect(x + 75, y + 15, 20, 15);
        
        // Fensterrahmen
        this.ctx.strokeStyle = "#000";
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(x + 15, y + 15, 20, 15);
        this.ctx.strokeRect(x + 45, y + 15, 20, 15);
        this.ctx.strokeRect(x + 75, y + 15, 20, 15);
        
        // Tür - auf dem grauen Boden
        this.ctx.fillStyle = "#8B4513";
        this.ctx.fillRect(x + 50, y + height - 15, 20, 12);
        
        // Türgriff
        this.ctx.fillStyle = "#FFD700";
        this.ctx.beginPath();
        this.ctx.arc(x + 65, y + height - 9, 2, 0, 2 * Math.PI);
        this.ctx.fill();
        
        // Garagentore
        this.ctx.fillStyle = "#2F4F4F";
        this.ctx.fillRect(x + 10, y + height - 15, 30, 12);
        this.ctx.fillRect(x + 80, y + height - 15, 30, 12);
        
        // Garagentor Griffe
        this.ctx.fillStyle = "#FFD700";
        this.ctx.beginPath();
        this.ctx.arc(x + 25, y + height - 9, 2, 0, 2 * Math.PI);
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.arc(x + 95, y + height - 9, 2, 0, 2 * Math.PI);
        this.ctx.fill();
        
        // Helipad
        this.ctx.fillStyle = "#2F2F2F";
        this.ctx.beginPath();
        this.ctx.arc(x + width/2, y - 25, 25, 0, 2 * Math.PI);
        this.ctx.fill();
        
        // Helipad H
        this.ctx.strokeStyle = "#FFFFFF";
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(x + width/2 - 8, y - 25 - 8);
        this.ctx.lineTo(x + width/2 - 8, y - 25 + 8);
        this.ctx.moveTo(x + width/2 + 8, y - 25 - 8);
        this.ctx.lineTo(x + width/2 + 8, y - 25 + 8);
        this.ctx.moveTo(x + width/2 - 8, y - 25);
        this.ctx.lineTo(x + width/2 + 8, y - 25);
        this.ctx.stroke();
        
        // Polizei Schild
        this.ctx.fillStyle = "#FFD700";
        this.ctx.fillRect(x - 5, y - 20, width + 10, 12);
        this.ctx.strokeStyle = "#000";
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x - 5, y - 20, width + 10, 12);
        
        this.ctx.fillStyle = "#000";
        this.ctx.font = "bold 12px Arial";
        this.ctx.textAlign = "center";
        this.ctx.fillText("POLIZEI", x + width/2, y - 10);
    }
    
    drawShop(x, y, width, height) {
        // Shop Basis
        this.ctx.fillStyle = "#A9A9A9";
        this.ctx.fillRect(x, y, width, height);
        
        // Shop Textur
        this.ctx.fillStyle = "#808080";
        for (let i = 0; i < height; i += 15) {
            this.ctx.fillRect(x, y + i, width, 2);
        }
        
        // Umriss
        this.ctx.strokeStyle = "#000";
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(x, y, width, height);
        
        // Schaufenster
        this.ctx.fillStyle = "#87CEEB";
        this.ctx.fillRect(x + 15, y + 15, 70, 35);
        
        // Schaufensterrahmen
        this.ctx.strokeStyle = "#000";
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x + 15, y + 15, 70, 35);
        
        // Tür
        this.ctx.fillStyle = "#8B4513";
        this.ctx.fillRect(x + 40, y + height - 20, 20, 15);
        
        // Türgriff
        this.ctx.fillStyle = "#FFD700";
        this.ctx.beginPath();
        this.ctx.arc(x + 55, y + height - 12, 2, 0, 2 * Math.PI);
        this.ctx.fill();
        
        // Shop Schild
        this.ctx.fillStyle = "#FFD700";
        this.ctx.fillRect(x - 5, y - 15, width + 10, 10);
        this.ctx.strokeStyle = "#000";
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x - 5, y - 15, width + 10, 10);
        
        this.ctx.fillStyle = "#000";
        this.ctx.font = "bold 12px Arial";
        this.ctx.textAlign = "center";
        this.ctx.fillText("SUPERMARKT", x + width/2, y - 6);
    }
    
    drawRestaurant(x, y, width, height) {
        // Restaurant Basis
        this.ctx.fillStyle = "#DEB887";
        this.ctx.fillRect(x, y, width, height);
        
        // Restaurant Textur
        this.ctx.fillStyle = "#D2B48C";
        for (let i = 0; i < width; i += 10) {
            this.ctx.fillRect(x + i, y, 2, height);
        }
        
        // Umriss
        this.ctx.strokeStyle = "#000";
        this.ctx.lineWidth = 3;
        this.ctx.strokeRect(x, y, width, height);
        
        // Fenster
        this.ctx.fillStyle = "#87CEEB";
        this.ctx.fillRect(x + 15, y + 15, 25, 20);
        this.ctx.fillRect(x + 60, y + 15, 25, 20);
        
        // Fensterrahmen
        this.ctx.strokeStyle = "#000";
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(x + 15, y + 15, 25, 20);
        this.ctx.strokeRect(x + 60, y + 15, 25, 20);
        
        // Tür
        this.ctx.fillStyle = "#8B4513";
        this.ctx.fillRect(x + 40, y + height - 20, 20, 15);
        
        // Türgriff
        this.ctx.fillStyle = "#FFD700";
        this.ctx.beginPath();
        this.ctx.arc(x + 55, y + height - 12, 2, 0, 2 * Math.PI);
        this.ctx.fill();
        
        // Restaurant Schild
        this.ctx.fillStyle = "#FFD700";
        this.ctx.fillRect(x - 5, y - 15, width + 10, 10);
        this.ctx.strokeStyle = "#000";
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x - 5, y - 15, width + 10, 10);
        
        this.ctx.fillStyle = "#000";
        this.ctx.font = "bold 10px Arial";
        this.ctx.textAlign = "center";
        this.ctx.fillText("RESTAURANT", x + width/2, y - 6);
    }
    
    drawInteractionPoints() {
        // Nur für Geschäfte - an neue Casino-Position angepasst
        this.ctx.fillStyle = "#4CAF50";
        this.ctx.beginPath();
        this.ctx.arc(350, 300, 8, 0, 2 * Math.PI);  // Casino (neue Position)
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.arc(1260, 340, 8, 0, 2 * Math.PI);  // Polizeistation
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.arc(350, 1240, 8, 0, 2 * Math.PI);  // Supermarkt
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.arc(1250, 1240, 8, 0, 2 * Math.PI); // Restaurant
        this.ctx.fill();
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
