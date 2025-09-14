// 2D Overworld Game Engine - Detailed Buildings
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
        
        this.player = {
            x: 100,
            y: 100,
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
        
        if (newX >= 0 && newX <= this.width - this.player.width) {
            this.player.x = newX;
        }
        if (newY >= 0 && newY <= this.height - this.player.height) {
            this.player.y = newY;
        }
    }
    
    checkBuildingCollisions() {
        this.nearBuilding = null;
        
        const buildings = [
            {x: 200, y: 150, width: 100, height: 200, name: "Diamond Casino", type: "casino", interactive: true},
            {x: 400, y: 200, width: 120, height: 80, name: "Polizeistation", type: "police", interactive: true},
            {x: 200, y: 400, width: 100, height: 80, name: "Supermarkt", type: "shop", interactive: true},
            {x: 400, y: 400, width: 100, height: 80, name: "Restaurant", type: "restaurant", interactive: true}
        ];
        
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
            
            const interactionRange = 50;
            if (this.player.x < building.x + building.width + interactionRange &&
                this.player.x + this.player.width > building.x - interactionRange &&
                this.player.y < building.y + building.height + interactionRange &&
                this.player.y + this.player.height > building.y - interactionRange) {
                this.nearBuilding = building;
            }
        }
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
        
        // Himmel
        this.ctx.fillStyle = "#87CEEB";
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        // Gras
        this.ctx.fillStyle = "#90EE90";
        this.ctx.fillRect(0, this.height - 100, this.width, 100);
        
        // Straßen
        this.ctx.fillStyle = "#2F2F2F";
        this.ctx.fillRect(0, this.height / 2 - 30, this.width, 60);
        this.ctx.fillRect(this.width / 2 - 30, 0, 60, this.height);
        
        // Straßenmarkierungen
        this.ctx.strokeStyle = "#FFFF00";
        this.ctx.lineWidth = 4;
        this.ctx.setLineDash([20, 20]);
        this.ctx.beginPath();
        this.ctx.moveTo(0, this.height / 2);
        this.ctx.lineTo(this.width, this.height / 2);
        this.ctx.stroke();
        this.ctx.beginPath();
        this.ctx.moveTo(this.width / 2, 0);
        this.ctx.lineTo(this.width / 2, this.height);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
        
        // Gebäude
        this.drawBuildings();
        
        // Spieler
        this.drawPlayer();
        
        // UI
        this.drawUI();
    }
    
    drawBuildings() {
        // CASINO - Hochhaus
        this.drawCasino(200, 150, 100, 200);
        
        // POLIZEISTATION - Mit Garage und Helipad
        this.drawPoliceStation(400, 200, 120, 80);
        
        // SUPERMARKT
        this.drawShop(200, 400, 100, 80);
        
        // RESTAURANT
        this.drawRestaurant(400, 400, 100, 80);
        
        // Interaktionspunkte
        this.drawInteractionPoints();
    }
    
    drawCasino(x, y, width, height) {
        // Casino Basis - Sandstein
        this.ctx.fillStyle = "#F4A460";
        this.ctx.fillRect(x, y, width, height);
        
        // Sandstein Textur
        this.ctx.fillStyle = "#E6B800";
        for (let i = 0; i < height; i += 20) {
            this.ctx.fillRect(x, y + i, width, 2);
        }
        for (let i = 0; i < width; i += 20) {
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
                this.ctx.fillRect(x + 10 + window * 20, y + 20 + floor * 20, 15, 12);
            }
        }
        
        // Fensterrahmen
        this.ctx.strokeStyle = "#000";
        this.ctx.lineWidth = 1;
        for (let floor = 0; floor < 8; floor++) {
            for (let window = 0; window < 4; window++) {
                this.ctx.strokeRect(x + 10 + window * 20, y + 20 + floor * 20, 15, 12);
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
        this.ctx.moveTo(x - 10, y);
        this.ctx.lineTo(x + width/2, y - 15);
        this.ctx.lineTo(x + width + 10, y);
        this.ctx.closePath();
        this.ctx.fill();
    }
    
    drawPoliceStation(x, y, width, height) {
        // Grauer Boden (Garage)
        this.ctx.fillStyle = "#696969";
        this.ctx.fillRect(x, y + height - 25, width, 25);
        
        // Blaue Polizei Basis
        this.ctx.fillStyle = "#4169E1";
        this.ctx.fillRect(x, y, width, height - 25);
        
        // Polizei Textur
        this.ctx.fillStyle = "#1E90FF";
        for (let i = 0; i < width; i += 15) {
            this.ctx.fillRect(x + i, y, 2, height - 25);
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
        
        // Tür
        this.ctx.fillStyle = "#8B4513";
        this.ctx.fillRect(x + 50, y + height - 40, 20, 15);
        
        // Türgriff
        this.ctx.fillStyle = "#FFD700";
        this.ctx.beginPath();
        this.ctx.arc(x + 65, y + height - 32, 2, 0, 2 * Math.PI);
        this.ctx.fill();
        
        // Garagentor
        this.ctx.fillStyle = "#2F4F4F";
        this.ctx.fillRect(x + 10, y + height - 20, 30, 15);
        this.ctx.fillRect(x + 80, y + height - 20, 30, 15);
        
        // Garagentor Griffe
        this.ctx.fillStyle = "#FFD700";
        this.ctx.beginPath();
        this.ctx.arc(x + 25, y + height - 12, 2, 0, 2 * Math.PI);
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.arc(x + 95, y + height - 12, 2, 0, 2 * Math.PI);
        this.ctx.fill();
        
        // Helipad
        this.ctx.fillStyle = "#2F2F2F";
        this.ctx.beginPath();
        this.ctx.arc(x + width/2, y - 30, 25, 0, 2 * Math.PI);
        this.ctx.fill();
        
        // Helipad H
        this.ctx.strokeStyle = "#FFFFFF";
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(x + width/2 - 8, y - 30 - 8);
        this.ctx.lineTo(x + width/2 - 8, y - 30 + 8);
        this.ctx.moveTo(x + width/2 + 8, y - 30 - 8);
        this.ctx.lineTo(x + width/2 + 8, y - 30 + 8);
        this.ctx.moveTo(x + width/2 - 8, y - 30);
        this.ctx.lineTo(x + width/2 + 8, y - 30);
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
        this.ctx.fillRect(x + 10, y + 10, 80, 40);
        
        // Schaufensterrahmen
        this.ctx.strokeStyle = "#000";
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x + 10, y + 10, 80, 40);
        
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
        this.ctx.fillStyle = "#4CAF50";
        this.ctx.beginPath();
        this.ctx.arc(290, 250, 8, 0, 2 * Math.PI);
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.arc(520, 240, 8, 0, 2 * Math.PI);
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.arc(290, 440, 8, 0, 2 * Math.PI);
        this.ctx.fill();
        this.ctx.beginPath();
        this.ctx.arc(490, 440, 8, 0, 2 * Math.PI);
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
        this.ctx.fillRect(10, 60, 300, 100);
        this.ctx.fillStyle = "#FFF";
        this.ctx.font = "14px Arial";
        this.ctx.fillText("Canvas: " + this.width + "x" + this.height, 15, 80);
        this.ctx.fillText("Player: " + this.player.x + ", " + this.player.y, 15, 100);
        this.ctx.fillText("Buildings: 4", 15, 120);
        this.ctx.fillText("Near Building: " + (this.nearBuilding ? this.nearBuilding.name : "None"), 15, 140);
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
