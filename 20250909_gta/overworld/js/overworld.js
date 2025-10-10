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
        this.pendingInteractionBuilding = null;

        this.interactionUI = document.getElementById("buildingInteraction");
        this.isInteractionVisible = false;
        this.interactionRequiresKeyRelease = false;
        this.scene = "overworld";

        this.activeInterior = null;

        this.overworldReturnState = null;

        this.projectiles = [];

        this.bloodDecals = [];

        this.firingState = { active: false, justPressed: false, lastShotAt: 0 };

        this.mouse = { x: 0, y: 0, worldX: 0, worldY: 0 };

        this.weaponsCatalog = this.createWeaponCatalog();

        this.weaponOrder = ["pistol", "smg", "assaultRifle", "shotgun", "sniperRifle", "lmg"];
        this.weaponInventory = this.loadWeaponInventory();
        this.weaponLoadout = this.loadWeaponLoadout();
        this.playerMoney = 1500;
        this.currentWeaponId = this.loadCurrentWeaponId();
        this.updateWeaponLoadout(this.currentWeaponId, { persist: false });
        this.persistWeaponInventory();
        this.persistWeaponLoadout();
        this.persistCurrentWeaponId();

        this.casinoCreditRate = 10;
        this.casinoCredits = this.loadCasinoCredits();
        this.lastCasinoCreditSync = 0;
        this.casinoMessageTimeout = null;



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

        this.sidewalkObstacles = this.createSidewalkObstacles(this.buildings);
        this.buildingColliders = this.createBuildingColliders(this.buildings);
        this.roadAreas = this.createRoadAreas(this.roadLayout);
        this.houseWalkwayCorridors = this.createHouseWalkwayCorridors(this.buildings);
        if (Array.isArray(this.sidewalkCorridors) && Array.isArray(this.houseWalkwayCorridors) && this.houseWalkwayCorridors.length) {
            this.sidewalkCorridors.push(...this.houseWalkwayCorridors);
        }

        this.walkableAreas = this.computeWalkableAreas();

        console.log("Buildings prepared", Array.isArray(this.buildings) ? this.buildings.length : this.buildings);

        this.streetDetails = this.createStreetDetails();

        if (typeof this.initDayNightCycle === "function") {

            this.dayNightCycle = this.initDayNightCycle();

        } else {

            const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();

            const phases = [

                { id: "day", duration: 300000 },

                { id: "dusk", duration: 120000 },

                { id: "night", duration: 300000 },

                { id: "dawn", duration: 120000 }

            ];

            const createFallbackStars = (count = 160) => {

                const total = Math.max(0, Math.floor(count));

                const stars = [];

                for (let i = 0; i < total; i++) {

                    const randomness = Math.random();

                    stars.push({

                        x: Math.random(),

                        y: Math.random() * 0.65,

                        size: 0.6 + Math.random() * 1.4,

                        twinkleOffset: Math.random() * Math.PI * 2,

                        twinkleSpeed: 0.6 + Math.random() * 1.4,

                        baseIntensity: 0.4 + randomness * 0.6

                    });

                }

                return stars;

            };

            const starGenerator = (typeof this.generateNightSkyStars === "function")

                ? (count) => this.generateNightSkyStars(count)

                : createFallbackStars;

            this.dayNightCycle = {

                phases,

                phaseIndex: 0,

                phaseStart: now,

                lastUpdate: now,

                progress: 0,

                currentPhase: phases[0],

                lighting: {

                    overlayAlpha: 0,

                    overlayTop: "rgba(0, 0, 0, 0)",

                    overlayBottom: "rgba(0, 0, 0, 0)",

                    horizon: null,

                    starAlpha: 0

                },

                starPhase: 0,

                stars: starGenerator(160)

            };

        }

        if (typeof this.computeDayNightLighting !== "function") {

            this.computeDayNightLighting = function (phaseId) {

                return {

                    phaseId: phaseId || 'day',

                    overlayAlpha: 0,

                    overlayTop: 'rgba(0, 0, 0, 0)',

                    overlayBottom: 'rgba(0, 0, 0, 0)',

                    horizon: null,

                    starAlpha: 0

                };

            };

        }

        if (typeof this.updateDayNightCycle !== "function") {

            this.updateDayNightCycle = function (now) {

                if (!this.dayNightCycle) {

                    return;

                }

                const cycle = this.dayNightCycle;

                const phases = Array.isArray(cycle.phases) && cycle.phases.length ? cycle.phases : [

                    { id: 'day', duration: 300000 }

                ];

                if (!Number.isFinite(cycle.phaseIndex)) {

                    cycle.phaseIndex = 0;

                }

                if (!Number.isFinite(cycle.phaseStart)) {

                    cycle.phaseStart = now;

                }

                let phase = phases[Math.max(0, Math.min(cycle.phaseIndex, phases.length - 1))];

                let elapsed = now - cycle.phaseStart;

                if (!Number.isFinite(elapsed) || elapsed < 0) {

                    elapsed = 0;

                    cycle.phaseStart = now;

                    cycle.phaseIndex = 0;

                    phase = phases[0];

                }

                let duration = Math.max(1, Number(phase.duration) || 0);

                while (elapsed >= duration) {

                    elapsed -= duration;

                    cycle.phaseIndex = (cycle.phaseIndex + 1) % phases.length;

                    phase = phases[cycle.phaseIndex];

                    duration = Math.max(1, Number(phase.duration) || 0);

                    cycle.phaseStart = now - elapsed;

                }

                const progress = duration > 0 ? Math.min(1, Math.max(0, elapsed / duration)) : 0;

                cycle.progress = progress;

                cycle.currentPhase = phase;

                const delta = now - (cycle.lastUpdate ?? now);

                cycle.lastUpdate = now;

                if (!Number.isFinite(cycle.starPhase)) {

                    cycle.starPhase = 0;

                }

                if (Number.isFinite(delta) && delta > 0) {

                    cycle.starPhase = (cycle.starPhase + delta * 0.0015) % (Math.PI * 2);

                }

                if (typeof this.computeDayNightLighting === 'function') {

                    cycle.lighting = this.computeDayNightLighting(String(phase.id ?? ''), progress, cycle);

                } else if (!cycle.lighting) {

                    cycle.lighting = {

                        phaseId: String(phase.id ?? ''),

                        overlayAlpha: 0,

                        overlayTop: 'rgba(0, 0, 0, 0)',

                        overlayBottom: 'rgba(0, 0, 0, 0)',

                        horizon: null,

                        starAlpha: 0

                    };

                }

            };

        }

        if (typeof this.drawNightSkyStars !== "function") {

            this.drawNightSkyStars = function () {

                return;

            };

        }

        if (typeof this.drawDayNightLighting !== "function") {

            this.drawDayNightLighting = function () {

                return;

            };

        }

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

            const key = e.key.toLowerCase();

            this.keys[key] = true;

            const inWeaponShop = this.scene === "weaponShop" && this.activeInterior;
            const interior = inWeaponShop ? this.activeInterior : null;
            const menuOpen = !!(interior && interior.menuOpen);

            if (!menuOpen && /^[1-9]$/.test(key)) {

                this.selectWeaponByIndex(Number(key));

            }

            if (key === "escape") {

                if (menuOpen) {

                    e.preventDefault();

                    this.closeWeaponMenu();

                    return;

                }

                if (this.scene !== "overworld") {

                    this.exitInterior();

                }

                return;

            }

            if (inWeaponShop) {

                if (menuOpen) {

                    if (key === "arrowup" || key === "w") {

                        e.preventDefault();

                        this.moveWeaponMenuSelection(-1);

                        return;

                    }

                    if (key === "arrowdown" || key === "s") {

                        e.preventDefault();

                        this.moveWeaponMenuSelection(1);

                        return;

                    }

                    if (key === "enter") {

                        e.preventDefault();

                        this.confirmWeaponMenuSelection();

                        return;

                    }

                    if (key === "q") {

                        e.preventDefault();

                        this.closeWeaponMenu();

                        return;

                    }

                }

                if (key === "e") {

                    e.preventDefault();

                    this.handleWeaponShopInteraction();

                }

                return;

            }

            if (key === "e") {

                const hasPending = this.isInteractionVisible && this.pendingInteractionBuilding;

                if (hasPending && !this.interactionRequiresKeyRelease) {

                    e.preventDefault();

                    this.performBuildingEntry(this.pendingInteractionBuilding);

                    return;

                }

                if (this.nearBuilding && this.nearBuilding.interactive) {

                    e.preventDefault();

                    if (!hasPending || this.pendingInteractionBuilding !== this.nearBuilding) {

                        this.showBuildingInteraction(this.nearBuilding);

                    }

                }

            }

        });



        document.addEventListener("keyup", (e) => {



            const key = e.key.toLowerCase();



            this.keys[key] = false;



            if (key === "e") {



                this.interactionRequiresKeyRelease = false;



            }



        });



        this.canvas.addEventListener("mousemove", (e) => {



            const rect = this.canvas.getBoundingClientRect();



            this.mouse.x = e.clientX - rect.left;



            this.mouse.y = e.clientY - rect.top;



            this.updateMouseWorldPosition();



        });



        this.canvas.addEventListener("mousedown", (e) => {



            if (e.button === 0) {



                this.firingState.active = true;



                this.firingState.justPressed = true;



            }



        });



        document.addEventListener("mouseup", (e) => {



            if (e.button === 0) {



                this.firingState.active = false;



                this.firingState.justPressed = false;



            }



        });



    }

    setupUI() {

        this.enterBuildingButton = document.getElementById("enterBuilding");
        this.cancelInteractionButton = document.getElementById("cancelInteraction");
        this.buyCasinoCreditsButton = document.getElementById("buyCasinoCredits");
        this.cashOutCasinoCreditsButton = document.getElementById("cashOutCasinoCredits");
        this.buildingMessageEl = document.getElementById("buildingMessage");
        this.buildingNameEl = document.getElementById("buildingName");

        if (this.enterBuildingButton) {

            this.enterBuildingButton.addEventListener("click", () => {

                const building = this.pendingInteractionBuilding ?? this.nearBuilding;

                this.performBuildingEntry(building);

            });

        }

        if (this.buyCasinoCreditsButton) {

            this.buyCasinoCreditsButton.addEventListener("click", () => {

                this.handleBuyCasinoCredits();

            });

        }

        if (this.cashOutCasinoCreditsButton) {

            this.cashOutCasinoCreditsButton.addEventListener("click", () => {

                this.handleCashOutCasinoCredits();

            });

        }

        if (this.cancelInteractionButton) {

            this.cancelInteractionButton.addEventListener("click", () => {

                this.hideBuildingInteraction();

            });

        }

    }

    handleCasinoEntry(building) {

        this.refreshCasinoCreditsCache();

        window.location.href = "../casinogame/index.html";

    }

    handleBuyCasinoCredits() {

        const result = this.convertDollarsToCredits();

        if (!this.buildingMessageEl) {

            return;

        }

        if (!result.success) {

            if (result.reason === "noMoney") {

                this.buildingMessageEl.textContent = "Keine Dollars zum Umtauschen.";

            } else {

                this.buildingMessageEl.textContent = "Umtausch derzeit nicht moeglich.";

            }

            this.updateCasinoButtonsState();

            return;

        }

        this.buildingMessageEl.textContent = "Eingezahlt: " + this.formatMoney(result.dollarsSpent) + " -> +" + this.formatCredits(result.creditsAdded) + " Credits | neuer Stand: " + this.formatCredits(result.totalCredits) + " Credits";

        this.updateCasinoButtonsState();
        this.resetCasinoMessageWithDelay();

    }

    handleCashOutCasinoCredits() {

        const result = this.convertCreditsToDollars();

        if (!this.buildingMessageEl) {

            return;

        }

        if (!result.success) {

            if (result.reason === "noCredits") {

                this.buildingMessageEl.textContent = "Keine Credits zum Auszahlen.";

            } else {

                this.buildingMessageEl.textContent = "Auszahlung derzeit nicht moeglich.";

            }

            this.updateCasinoButtonsState();

            return;

        }

        this.buildingMessageEl.textContent = "Ausgezahlt: +" + this.formatMoney(result.dollarsGained) + " ( -" + this.formatCredits(result.creditsSpent) + " Credits ) | Rest: " + this.formatCredits(result.totalCredits) + " Credits";

        this.updateCasinoButtonsState();
        this.resetCasinoMessageWithDelay();

    }

    updateCasinoInteractionMessage() {

        if (!this.buildingMessageEl) {

            return;

        }

        const rate = this.casinoCreditRate ?? 10;

        const moneyText = this.formatMoney(this.playerMoney);

        const creditText = this.formatCredits(this.casinoCredits) + " Credits";

        this.buildingMessageEl.textContent = "Kurs 1$ = " + rate + " Credits | Bargeld: " + moneyText + " | Credits: " + creditText;

        this.updateCasinoButtonsState();

    }

    updateCasinoButtonsState() {

        if (!this.buyCasinoCreditsButton && !this.cashOutCasinoCreditsButton) {

            return;

        }

        const isCasino = this.pendingInteractionBuilding && this.pendingInteractionBuilding.type === "casino";
        const rate = this.casinoCreditRate ?? 10;
        const dollarsAvailable = Math.floor(Math.max(0, Number(this.playerMoney ?? 0)));
        const creditsAvailable = Math.floor(Math.max(0, Number(this.casinoCredits ?? 0)));

        const canBuy = isCasino && dollarsAvailable > 0;
        const canCashOut = isCasino && creditsAvailable >= rate;

        if (this.buyCasinoCreditsButton) {

            this.buyCasinoCreditsButton.disabled = !canBuy;

            if (isCasino && canBuy) {

                const creditsGain = dollarsAvailable * rate;
                const dollarsLabel = dollarsAvailable.toLocaleString("de-DE");
                this.buyCasinoCreditsButton.textContent = "Credits kaufen (" + dollarsLabel + "$ = " + this.formatCredits(creditsGain) + " Credits)";

            } else {

                this.buyCasinoCreditsButton.textContent = "Credits kaufen";

            }

        }

        if (this.cashOutCasinoCreditsButton) {

            this.cashOutCasinoCreditsButton.disabled = !canCashOut;

            if (isCasino && canCashOut) {

                const dollarsGain = Math.floor(creditsAvailable / rate);
                const creditsUsed = dollarsGain * rate;
                const creditsLabel = this.formatCredits(creditsUsed);
                this.cashOutCasinoCreditsButton.textContent = "Credits auszahlen (" + creditsLabel + " Credits -> " + this.formatMoney(dollarsGain) + ")";

            } else {

                this.cashOutCasinoCreditsButton.textContent = "Credits auszahlen";

            }

        }

    }

    resetCasinoMessageWithDelay() {

        if (typeof window === "undefined") {

            return;

        }

        if (this.casinoMessageTimeout) {

            clearTimeout(this.casinoMessageTimeout);

        }

        this.casinoMessageTimeout = window.setTimeout(() => {

            if (this.pendingInteractionBuilding && this.pendingInteractionBuilding.type === "casino") {

                this.updateCasinoInteractionMessage();

            }

        }, 2000);

    }

    update() {



        const now = performance.now();

        if (typeof this.updateDayNightCycle === "function") {

            this.updateDayNightCycle(now);

        }

        if (!this.lastCasinoCreditSync || now - this.lastCasinoCreditSync >= 2000) {

            this.refreshCasinoCreditsCache();

        }

        if (this.scene === "weaponShop") {



            this.handleInput();



            this.updateWeaponShopState();



        } else {



            this.handleInput();



            this.updateCamera();



            this.checkBuildingCollisions();



            this.updateAgents();



        }



        this.processPlayerFiring(now);



        this.updateProjectiles();



        this.updatePlayerAnimation();



        this.updateFPS();



    }

    updateDayNightCycle(now) {

        if (!this.dayNightCycle) {

            return;

        }

        const cycle = this.dayNightCycle;

        if (!Array.isArray(cycle.phases) || cycle.phases.length === 0) {

            return;

        }

        if (!Number.isFinite(cycle.phaseIndex)) {

            cycle.phaseIndex = 0;

        }

        if (!Number.isFinite(cycle.phaseStart)) {

            cycle.phaseStart = now;

        }

        let phase = cycle.phases[Math.max(0, Math.min(cycle.phaseIndex, cycle.phases.length - 1))];

        let elapsed = now - cycle.phaseStart;

        if (!Number.isFinite(elapsed) || elapsed < 0) {

            elapsed = 0;

            cycle.phaseStart = now;

            phase = cycle.phases[0];

            cycle.phaseIndex = 0;

        }

        let duration = Math.max(1, Number(phase.duration) || 0);

        while (elapsed >= duration) {

            elapsed -= duration;

            cycle.phaseIndex = (cycle.phaseIndex + 1) % cycle.phases.length;

            phase = cycle.phases[cycle.phaseIndex];

            duration = Math.max(1, Number(phase.duration) || 0);

            cycle.phaseStart = now - elapsed;

        }

        const progress = duration > 0 ? Math.min(1, Math.max(0, elapsed / duration)) : 0;

        const delta = now - (cycle.lastUpdate ?? now);

        cycle.lastUpdate = now;

        if (!Number.isFinite(cycle.starPhase)) {

            cycle.starPhase = 0;

        }

        if (Number.isFinite(delta) && delta > 0) {

            cycle.starPhase = (cycle.starPhase + delta * 0.0015) % (Math.PI * 2);

        }

        cycle.progress = progress;

        cycle.currentPhase = phase;

        if (typeof this.computeDayNightLighting === 'function') {

            cycle.lighting = this.computeDayNightLighting(String(phase.id ?? ''), progress, cycle);

        } else if (!cycle.lighting) {

            cycle.lighting = {

                phaseId: String(phase.id ?? ''),

                overlayAlpha: 0,

                overlayTop: 'rgba(0, 0, 0, 0)',

                overlayBottom: 'rgba(0, 0, 0, 0)',

                horizon: null,

                starAlpha: 0

            };

        }

    }


    handleInput() {



        if (this.scene === "weaponShop") {



            this.handleWeaponShopMovement();



            return;



        }



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



        const newX = this.player.x + dx;



        const newY = this.player.y + dy;



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

                if (!buildingIsNear && building.interactive) {

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

            if (buildingIsNear && building.interactive) {

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



        if (this.scene === "weaponShop") {



            this.renderWeaponShopInterior();



            this.drawProjectiles();



            this.drawWeaponShopOverlay();



            this.drawUI();



            this.drawCrosshair();



            return;



        }



        this.ctx.save();



        this.ctx.translate(-this.camera.x, -this.camera.y);



        this.ctx.fillStyle = "#7da57a";



        this.ctx.fillRect(0, 0, 3600, 3000);



        this.drawImprovedRoadSystem();



        this.drawSidewalks();



        this.drawWalkableAreasOverlay();



        this.drawStreetDetails();



        this.drawBuildings();



        this.drawBloodDecals();



        this.drawDynamicAgents();



        this.drawProjectiles();



        this.drawPlayer();



        if (typeof this.drawDayNightLighting === "function") {

            this.drawDayNightLighting();

        }



        this.ctx.restore();



        this.drawUI();



        this.drawCrosshair();



    }
    renderWeaponShopInterior() {

        const interior = this.activeInterior;

        if (!interior) {

            return;

        }

        if (interior.originX === undefined || interior.originY === undefined) {

            interior.originX = Math.max(0, Math.floor((this.width - interior.width) / 2));

            interior.originY = Math.max(0, Math.floor((this.height - interior.height) / 2));

        }

        this.ctx.save();

        this.ctx.translate(interior.originX, interior.originY);

        this.ctx.fillStyle = "#242831";

        this.ctx.fillRect(0, 0, interior.width, interior.height);

        const floorGradient = this.ctx.createLinearGradient(0, 0, 0, interior.height);

        floorGradient.addColorStop(0, "#2d323e");

        floorGradient.addColorStop(1, "#1d222b");

        this.ctx.fillStyle = floorGradient;

        this.ctx.fillRect(12, 12, interior.width - 24, interior.height - 24);

        this.ctx.strokeStyle = "rgba(10, 12, 16, 0.7)";

        this.ctx.lineWidth = 6;

        this.ctx.strokeRect(12, 12, interior.width - 24, interior.height - 24);

        const exit = interior.exitZone;

        this.ctx.fillStyle = "#0f1217";

        this.ctx.fillRect(exit.x - 2, exit.y - 4, exit.width + 4, exit.height + 8);

        this.ctx.fillStyle = "#c9d1d9";

        this.ctx.fillRect(exit.x, exit.y, exit.width, exit.height);

        this.ctx.fillStyle = "#4cc9f0";

        this.ctx.fillRect(exit.x + exit.width / 2 - 12, exit.y + 4, 24, exit.height - 8);

        const counter = interior.counter;

        this.ctx.fillStyle = "#1d2129";

        this.ctx.fillRect(counter.x - 6, counter.y - 6, counter.width + 12, counter.height + 12);

        this.ctx.fillStyle = "#3f444f";

        this.ctx.fillRect(counter.x, counter.y, counter.width, counter.height);

        this.ctx.fillStyle = "rgba(120, 186, 255, 0.22)";

        this.ctx.fillRect(counter.x + 6, counter.y + 8, counter.width - 12, counter.height - 24);

        this.ctx.fillStyle = "rgba(255, 255, 255, 0.12)";

        this.ctx.fillRect(counter.x + 12, counter.y + 12, counter.width - 24, 6);

        if (interior.serviceMat) {
            this.ctx.fillStyle = "rgba(16, 24, 32, 0.7)";
            this.ctx.fillRect(interior.serviceMat.x, interior.serviceMat.y, interior.serviceMat.width, interior.serviceMat.height);
        }

        if (Array.isArray(interior.cabinets)) {
            for (const cabinet of interior.cabinets) {
                this.ctx.fillStyle = "#141821";
                this.ctx.fillRect(cabinet.x, cabinet.y, cabinet.width, cabinet.height);
                this.ctx.fillStyle = "#222936";
                this.ctx.fillRect(cabinet.x + 2, cabinet.y + 6, cabinet.width - 4, cabinet.height - 12);
                this.ctx.fillStyle = "#0f131b";
                this.ctx.fillRect(cabinet.x + cabinet.width / 2 - 2, cabinet.y + cabinet.height / 2 - 10, 4, 20);
            }
        }

        if (Array.isArray(interior.showcases)) {
            for (const showcase of interior.showcases) {
                this.ctx.save();
                this.ctx.fillStyle = "#141b25";
                this.ctx.fillRect(showcase.x, showcase.y, showcase.width, showcase.height);
                this.ctx.fillStyle = "#1d242f";
                this.ctx.fillRect(showcase.x + 4, showcase.y + 4, showcase.width - 8, showcase.height - 8);
                this.ctx.fillStyle = "rgba(120, 186, 255, 0.24)";
                this.ctx.fillRect(showcase.x + 10, showcase.y + 10, showcase.width - 20, showcase.height - 20);
                this.ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
                this.ctx.strokeRect(showcase.x + 10, showcase.y + 10, showcase.width - 20, showcase.height - 20);
                const labelY = showcase.y + showcase.height - 10;
                this.ctx.font = "13px Arial";
                this.ctx.textAlign = "center";
                this.ctx.fillStyle = "#dce3f0";
                const def = this.getWeaponDefinition(showcase.weaponId);
                if (def) {
                    this.ctx.fillText(def.name, showcase.x + showcase.width / 2, labelY);
                    this.drawWeaponSilhouette(showcase.x + showcase.width / 2, showcase.y + showcase.height / 2 - 10, def, { scale: 0.9, alpha: 0.85 });
                }
                this.ctx.restore();
            }
        }

        const vendor = interior.vendor;

        if (vendor) {
            if (interior.playerNearVendor) {
                this.ctx.save();
                this.ctx.fillStyle = "rgba(76, 201, 240, 0.25)";
                this.ctx.beginPath();
                this.ctx.arc(vendor.x, vendor.y + 10, 42, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.restore();
            }

            const vendorRenderable = {
                x: vendor.x,
                y: vendor.y,
                parts: vendor.parts,
                animationPhase: vendor.animationPhase ?? 0,
                moving: false
            };

            this.drawCharacterParts(vendorRenderable);
        }

        this.ctx.textAlign = "center";

        this.ctx.fillStyle = "#f1f3f5";

        this.ctx.font = "22px Arial";

        this.ctx.fillText("AMMU-NATION", interior.width / 2, 54);

        this.ctx.fillStyle = "#ffad33";

        this.ctx.fillRect(interior.width / 2 - 70, 62, 140, 6);

        const playerRenderable = {

            x: this.player.x,

            y: this.player.y,

            parts: this.player.parts,

            animationPhase: this.player.animationPhase ?? 0,

            moving: this.player.moving

        };

        this.drawCharacterParts(playerRenderable);
        this.drawEquippedWeaponModel(playerRenderable);

        this.ctx.restore();

    }

    drawWeaponSilhouette(cx, cy, weapon, options = {}) {
        if (!weapon) {
            return;
        }

        const scale = typeof options.scale === 'number' ? options.scale : 1;
        const alpha = typeof options.alpha === 'number' ? options.alpha : 1;
        const color = weapon.displayColor ?? '#ffd166';
        const outline = 'rgba(0, 0, 0, 0.34)';
        const dark = 'rgba(12, 18, 26, 0.75)';
        const accent = 'rgba(255, 255, 255, 0.28)';

        this.ctx.save();
        this.ctx.translate(cx, cy);
        this.ctx.scale(scale, scale);
        this.ctx.globalAlpha = Math.max(0.2, Math.min(1, alpha));

        const fillRect = (x, y, w, h, style = color, stroke = true) => {
            this.ctx.fillStyle = style;
            this.ctx.fillRect(x, y, w, h);
            if (stroke) {
                this.ctx.strokeStyle = outline;
                this.ctx.lineWidth = 1.6;
                this.ctx.strokeRect(x, y, w, h);
            }
        };

        const drawCircle = (x, y, r, style = color, stroke = true) => {
            this.ctx.beginPath();
            this.ctx.arc(x, y, r, 0, Math.PI * 2);
            this.ctx.fillStyle = style;
            this.ctx.fill();
            if (stroke) {
                this.ctx.strokeStyle = outline;
                this.ctx.lineWidth = 1.4;
                this.ctx.stroke();
            }
        };

        const drawGrip = (x, y, w, h) => {
            fillRect(x, y, w, h, dark);
            fillRect(x + w * 0.15, y + h * 0.2, w * 0.7, h * 0.6, accent, false);
        };

        switch (weapon.id) {
            case 'pistol':
                fillRect(-30, -6, 46, 12);
                fillRect(-16, -11, 22, 5, accent);
                drawGrip(-10, 6, 18, 26);
                fillRect(-26, -2, 8, 4, dark);
                break;

            case 'smg':
                fillRect(-48, -8, 64, 16);
                fillRect(14, -4, 28, 8, dark);
                fillRect(-14, 8, 12, 22, color);
                fillRect(0, 10, 10, 24, dark);
                fillRect(-42, -4, 12, 12, accent);
                drawGrip(-22, 8, 12, 20);
                break;

            case 'assaultRifle':
                fillRect(-62, -8, 102, 16);
                fillRect(38, -4, 36, 8, dark);
                fillRect(-64, -3, 12, 12, dark);
                fillRect(-34, 8, 18, 24, dark);
                fillRect(-8, 10, 12, 28, color);
                fillRect(10, -12, 24, 8, accent);
                break;

            case 'shotgun':
                fillRect(-78, -5, 116, 10);
                fillRect(-72, 2, 102, 6, dark);
                fillRect(-32, 4, 30, 14, accent);
                drawGrip(-14, 12, 18, 22);
                fillRect(-84, -2, 14, 12, dark);
                break;

            case 'sniperRifle':
                fillRect(-94, -6, 148, 12);
                fillRect(52, -4, 38, 8, dark);
                fillRect(-60, -2, 22, 6, dark);
                fillRect(-32, -16, 44, 8, accent);
                drawCircle(-8, -18, 6, dark);
                drawGrip(-20, 10, 16, 26);
                break;

            case 'lmg':
                fillRect(-82, -10, 132, 20);
                fillRect(42, -6, 38, 10, dark);
                fillRect(-52, 8, 28, 20, dark);
                fillRect(-18, 10, 22, 30, color);
                fillRect(-74, -12, 22, 8, accent);
                drawCircle(-48, -16, 6, accent, false);
                fillRect(-56, 0, 18, 6, dark);
                break;

            default:
                fillRect(-30, -5, 60, 10);
                drawGrip(-10, 6, 18, 24);
                break;
        }

        this.ctx.globalAlpha = 1;
        this.ctx.restore();
    }

    drawWeaponShopOverlay() {
        if (this.scene !== "weaponShop" || !this.activeInterior) {
            return;
        }

        const interior = this.activeInterior;
        const weapon = this.getCurrentWeapon();
        const menuOpen = interior.menuOpen === true;
        const options = Array.isArray(interior.menuOptions) ? interior.menuOptions : [];
        const hasOptions = options.length > 0;
        const selectionIndex = hasOptions ? Math.min(Math.max(0, interior.menuSelection ?? 0), options.length - 1) : -1;

        const overlayMargin = 20;
        const desiredWidth = menuOpen ? 540 : 420;
        const desiredHeight = menuOpen ? 220 + options.length * 36 : 200;

        const availableWidth = Math.max(220, this.width - overlayMargin * 2);
        const availableHeight = Math.max(220, this.height - overlayMargin * 2);

        const overlayWidth = Math.min(
            availableWidth,
            Math.max(320, Math.min(desiredWidth, availableWidth))
        );

        const overlayHeightBase = menuOpen ? Math.max(320, desiredHeight) : desiredHeight;
        const overlayHeight = Math.min(
            availableHeight,
            Math.max(220, Math.min(overlayHeightBase, availableHeight))
        );

        const overlayX = Math.max(overlayMargin, this.width - overlayMargin - overlayWidth);
        const overlayY = overlayMargin;
        const paddingX = 24;
        const paddingY = 24;
        const textX = overlayX + paddingX;

        this.ctx.save();
        this.ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
        this.ctx.fillRect(overlayX, overlayY, overlayWidth, overlayHeight);
        this.ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(overlayX, overlayY, overlayWidth, overlayHeight);

        this.ctx.fillStyle = "#ffffff";
        this.ctx.textAlign = "left";
        this.ctx.font = "18px Arial";
        const titleY = overlayY + paddingY + 8;
        this.ctx.fillText("Ammu-Nation Service", textX, titleY);

        this.ctx.font = "14px Arial";
        let lineY = titleY + 26;
        this.ctx.fillText("Aktuelle Waffe: " + (weapon ? weapon.name : "Keine"), textX, lineY);
        lineY += 22;
        this.ctx.fillText("Kontostand: " + this.formatMoney(this.playerMoney), textX, lineY);

        let listStartY = lineY;

        if (menuOpen) {
            lineY += 26;
            this.ctx.fillText("W/S oder Pfeile: Auswahl  |  E/Enter: Kaufen/Ausruesten", textX, lineY);
            lineY += 22;
            this.ctx.fillText("Ausruesten aktualisiert den Schnellzugriff (1-3)", textX, lineY);
            lineY += 22;
            this.ctx.fillText("Q oder ESC: Menue schliessen", textX, lineY);

            const listX = textX;
            const listWidth = overlayWidth - paddingX * 2;
            const rowHeight = 38;
            listStartY = lineY + 34;

            this.ctx.font = "15px Arial";
            const priceX = overlayX + overlayWidth - paddingX;

            for (let i = 0; i < options.length; i++) {
                const optionId = options[i];
                const def = this.getWeaponDefinition(optionId);
                if (!def) {
                    continue;
                }

                const rowBaseline = listStartY + 20 + i * rowHeight;
                const rowTop = rowBaseline - 22;

                if (i === selectionIndex) {
                    this.ctx.save();
                    this.ctx.fillStyle = "rgba(76, 201, 240, 0.32)";
                    this.ctx.fillRect(listX - 8, rowTop, listWidth + 16, 32);
                    this.ctx.restore();
                }

                const owned = this.weaponInventory.has(optionId);
                const priceValue = Math.max(0, Number(def.price ?? 0));
                const affordable = owned || this.playerMoney >= priceValue;

                this.ctx.textAlign = "left";
                this.ctx.fillStyle = "#ffffff";
                this.ctx.fillText(def.name, listX, rowBaseline);

                this.ctx.textAlign = "right";
                this.ctx.fillStyle = owned ? "#a4fba6" : (affordable ? "#ffd166" : "#ff8787");
                this.ctx.fillText(owned ? "Bereits gekauft" : this.formatMoney(priceValue), priceX, rowBaseline);
            }

            const selectedWeaponId = selectionIndex >= 0 ? options[selectionIndex] : null;
            const selectedWeapon = selectedWeaponId ? this.getWeaponDefinition(selectedWeaponId) : null;

            if (selectedWeapon) {
                const detailY = listStartY + options.length * rowHeight + 24;
                const fireRateValue = Number(selectedWeapon.fireRate ?? 0);
                const fireSeconds = fireRateValue > 0 ? (fireRateValue / 1000).toFixed(2) : "-";
                this.ctx.textAlign = "left";
                this.ctx.fillStyle = "#ced4da";
                this.ctx.fillText(
                    "Schaden: " + selectedWeapon.damage +
                        " | Feuerrate: " + fireSeconds + " s" +
                        " | Reichweite: " + (selectedWeapon.range ?? 0),
                    listX,
                    detailY
                );
                listStartY = detailY;
            }
        } else {
            lineY += 26;
            this.ctx.fillText("WASD: Bewegen  |  Shift: Rennen", textX, lineY);
            lineY += 22;
            this.ctx.fillText("Linke Maustaste: Feuer  |  1-3: Waffen wechseln", textX, lineY);
            lineY += 22;
            this.ctx.fillText("E: Interaktion  |  ESC: Verlassen", textX, lineY);
        }

        let message = null;
        let messageColor = "#ffffff";
        let secondaryMessage = null;
        let secondaryColor = "#ffffff";

        if (interior.messageText) {
            message = interior.messageText;
            messageColor = "#8ce0ff";
        } else if (menuOpen && selectionIndex >= 0) {
            const selectedWeaponId = options[selectionIndex];
            const selected = this.getWeaponDefinition(selectedWeaponId);

            if (selected) {
                const owned = this.weaponInventory.has(selectedWeaponId);
                const priceValue = Math.max(0, Number(selected.price ?? 0));
                const affordable = this.playerMoney >= priceValue;

                if (owned) {
                    message = selected.name + " gehoert dir";
                    secondaryMessage = "E/Enter druecken zum Ausruesten";
                    messageColor = "#a4fba6";
                    secondaryColor = "#a4fba6";
                } else {
                    message = "Preis: " + this.formatMoney(priceValue);
                    messageColor = affordable ? "#ffd166" : "#ff8787";
                    secondaryMessage = affordable ? "E/Enter druecken zum Kauf" : "Nicht genug Geld";
                    secondaryColor = affordable ? "#ffd166" : "#ff8787";
                }
            }
        } else if (interior.playerNearVendor) {
            message = "E druecken um mit dem Verkaeufer zu sprechen";
            messageColor = "#a4fba6";
        } else if (interior.playerNearExit) {
            message = "E druecken um den Laden zu verlassen";
            messageColor = "#ffd166";
        }

        const messageY = overlayY + overlayHeight - 48;
        const secondaryY = messageY + 20;

        this.ctx.textAlign = "left";
        if (message) {
            this.ctx.fillStyle = messageColor;
            this.ctx.fillText(message, textX, messageY);
        }

        if (secondaryMessage) {
            this.ctx.fillStyle = secondaryColor;
            this.ctx.fillText(secondaryMessage, textX, secondaryY);
        }

        this.ctx.restore();
    }

    createWeaponShopInterior() {
        const width = 720;
        const height = 420;
        const margin = 36;
        const counterHeight = 72;

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
            parts: this.buildNPCParts({
                head: '#f0c1a1',
                torso: '#1f2d3d',
                limbs: '#131b24',
                accent: '#3d5a80',
                hair: '#2b2118',
                eyes: '#ffffff',
                pupil: '#0b132b'
            }),
            animationPhase: 0,
            moving: false,
        };

        const showcaseGap = 18;
        const showcaseHeight = 88;
        const showcaseCount = Math.max(1, this.weaponOrder.length);
        const availableWidth = counter.width - 48;
        const showcaseWidth = Math.min(200, (availableWidth - showcaseGap * (showcaseCount - 1)) / showcaseCount);
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
            playerRadius: 14,
            playerNearVendor: false,
            playerNearExit: false,
            menuOpen: false,
            menuSelection: 0,
            menuOptions: this.weaponOrder.slice(),
            messageText: null,
            messageTimer: 0,
        };
    }

    handleWeaponShopMovement() {
        if (!this.activeInterior) {
            return;
        }

        const interior = this.activeInterior;

        if (interior.menuOpen) {

            this.player.moving = false;

            this.player.speed = 0;

            this.updateMouseWorldPosition();

            return;

        }

        let dx = 0;
        let dy = 0;

        const sprinting = this.keys["shift"] || this.keys["shiftleft"] || this.keys["shiftright"];
        const baseSpeed = this.player.baseSpeed * 0.9;
        const speed = sprinting ? baseSpeed * 1.4 : baseSpeed;

        if (this.keys["w"] || this.keys["arrowup"]) dy -= speed;
        if (this.keys["s"] || this.keys["arrowdown"]) dy += speed;
        if (this.keys["a"] || this.keys["arrowleft"]) dx -= speed;
        if (this.keys["d"] || this.keys["arrowright"]) dx += speed;

        this.player.speed = speed;

        const radius = interior.playerRadius ?? 14;
        const margin = interior.margin ?? 36;

        if (dx !== 0) {
            const candidateX = Math.max(radius + margin, Math.min(this.player.x + dx, interior.width - radius - margin));
            if (!this.circleHitsAnyObstacle(candidateX, this.player.y, radius, interior.obstacles)) {
                this.player.x = candidateX;
            }
        }

        if (dy !== 0) {
            const candidateY = Math.max(radius + margin, Math.min(this.player.y + dy, interior.height - radius - margin));
            if (!this.circleHitsAnyObstacle(this.player.x, candidateY, radius, interior.obstacles)) {
                this.player.y = candidateY;
            }
        }

        this.player.moving = dx !== 0 || dy !== 0;
        this.updateMouseWorldPosition();
    }

    circleHitsAnyObstacle(x, y, radius, obstacles) {
        if (!Array.isArray(obstacles)) {
            return false;
        }

        for (const obstacle of obstacles) {
            if (this.circleIntersectsRect(x, y, radius, obstacle)) {
                return true;
            }
        }

        return false;
    }

    circleIntersectsRect(cx, cy, radius, rect) {
        if (!rect) {
            return false;
        }

        const nearestX = Math.max(rect.x, Math.min(cx, rect.x + rect.width));
        const nearestY = Math.max(rect.y, Math.min(cy, rect.y + rect.height));
        const dx = cx - nearestX;
        const dy = cy - nearestY;

        return dx * dx + dy * dy <= radius * radius;
    }

    updateWeaponShopState() {
        if (this.scene !== "weaponShop" || !this.activeInterior) {
            return;
        }

        const interior = this.activeInterior;

        interior.playerNearVendor = false;
        const radius = interior.playerRadius ?? 14;
        const vendor = interior.vendor;

        if (vendor) {
            const vendorRadius = vendor.interactionRadius ?? 100;
            const distance = Math.hypot(this.player.x - vendor.x, this.player.y - vendor.y);
            interior.playerNearVendor = distance <= vendorRadius;

            if (interior.menuOpen && !interior.playerNearVendor) {
                this.closeWeaponMenu();
            }
        } else {
            interior.menuOpen = false;
        }

        interior.playerNearExit = this.circleIntersectsRect(this.player.x, this.player.y, radius, interior.exitZone);

        if (interior.messageTimer > 0) {
            interior.messageTimer -= 1;
            if (interior.messageTimer <= 0) {
                interior.messageText = null;
            }
        }
    }

    handleWeaponShopInteraction() {
        if (this.scene !== "weaponShop" || !this.activeInterior) {
            return;
        }

        const interior = this.activeInterior;

        if (interior.menuOpen) {
            this.confirmWeaponMenuSelection();
            return;
        }

        if (interior.playerNearVendor) {
            this.openWeaponMenu();
            return;
        }

        if (interior.playerNearExit) {
            this.exitInterior();
        }
    }

    openWeaponMenu() {
        if (this.scene !== "weaponShop" || !this.activeInterior) {
            return;
        }

        const interior = this.activeInterior;
        const options = Array.isArray(interior.menuOptions) ? interior.menuOptions : [];
        const currentIndex = options.indexOf(this.currentWeaponId);

        interior.menuOpen = true;
        interior.menuSelection = currentIndex >= 0 ? currentIndex : 0;
        interior.messageText = null;
        interior.messageTimer = 0;
    }

    closeWeaponMenu() {
        if (this.scene !== "weaponShop" || !this.activeInterior) {
            return;
        }

        const interior = this.activeInterior;
        interior.menuOpen = false;
    }

    moveWeaponMenuSelection(direction) {
        if (this.scene !== "weaponShop" || !this.activeInterior) {
            return;
        }

        const interior = this.activeInterior;
        if (!interior.menuOpen) {
            return;
        }

        const options = Array.isArray(interior.menuOptions) ? interior.menuOptions : [];
        if (options.length === 0) {
            return;
        }

        const next = (interior.menuSelection ?? 0) + direction;
        const wrapped = (next % options.length + options.length) % options.length;
        interior.menuSelection = wrapped;
    }

    confirmWeaponMenuSelection() {
        if (this.scene !== "weaponShop" || !this.activeInterior) {
            return;
        }

        const interior = this.activeInterior;
        if (!interior.menuOpen) {
            return;
        }

        const options = Array.isArray(interior.menuOptions) ? interior.menuOptions : [];
        if (options.length === 0) {
            return;
        }

        const index = Math.min(Math.max(0, interior.menuSelection ?? 0), options.length - 1);
        const weaponId = options[index];
        const weapon = this.getWeaponDefinition(weaponId);

        if (!weapon) {
            interior.messageText = null;
            interior.messageTimer = 0;
            return;
        }

        if (this.weaponInventory.has(weaponId)) {
            this.currentWeaponId = weaponId;
            this.updateWeaponLoadout(weaponId);
            this.persistCurrentWeaponId();
            interior.messageText = weapon.name + " ausgeruestet";
            interior.messageTimer = 220;
            return;
        }

        const price = Math.max(0, Number(weapon.price ?? 0));

        if (this.playerMoney >= price) {
            this.playerMoney -= price;
            this.weaponInventory.add(weaponId);
            this.persistWeaponInventory();
            this.currentWeaponId = weaponId;
            this.updateWeaponLoadout(weaponId);
            this.persistCurrentWeaponId();
            interior.messageText = weapon.name + " gekauft";
        } else {
            interior.messageText = "Nicht genug Geld fuer " + weapon.name;
        }

        interior.messageTimer = 220;
    }



    enterWeaponShop(building) {



        if (this.scene === "weaponShop") {

            return;

        }



        const interior = this.createWeaponShopInterior();

        interior.originX = Math.max(0, Math.floor((this.width - interior.width) / 2));

        interior.originY = Math.max(0, Math.floor((this.height - interior.height) / 2));



        this.overworldReturnState = {

            position: { x: this.player.x, y: this.player.y },

            camera: { x: this.camera.x, y: this.camera.y },

        };



        this.scene = "weaponShop";

        this.activeInterior = interior;



        this.player.x = interior.entry.x;

        this.player.y = interior.entry.y;

        this.player.moving = false;

        this.player.animationPhase = 0;



        this.camera.x = 0;

        this.camera.y = 0;



        this.nearBuilding = null;



        this.projectiles = [];

        this.firingState.active = false;

        this.firingState.justPressed = false;



        for (const key of Object.keys(this.keys)) {

            this.keys[key] = false;

        }



        this.updateMouseWorldPosition();

    }



    exitInterior() {



        if (this.scene !== "weaponShop") {

            return;

        }



        const interior = this.activeInterior;

        if (interior) {

            interior.menuOpen = false;

        }



        if (this.overworldReturnState) {

            this.player.x = this.overworldReturnState.position.x;

            this.player.y = this.overworldReturnState.position.y;

            this.camera.x = this.overworldReturnState.camera.x;

            this.camera.y = this.overworldReturnState.camera.y;

        }



        this.scene = "overworld";

        this.activeInterior = null;

        this.overworldReturnState = null;



        this.nearBuilding = null;



        this.projectiles = [];

        this.firingState.active = false;

        this.firingState.justPressed = false;



        this.player.moving = false;

        this.player.animationPhase = 0;



        for (const key of Object.keys(this.keys)) {

            this.keys[key] = false;

        }



        this.updateMouseWorldPosition();

    }



    updateMouseWorldPosition() {

        if (this.scene === "weaponShop" && this.activeInterior) {

            this.mouse.worldX = this.mouse.x - this.activeInterior.originX;

            this.mouse.worldY = this.mouse.y - this.activeInterior.originY;

            return;

        }

        this.mouse.worldX = this.mouse.x + this.camera.x;

        this.mouse.worldY = this.mouse.y + this.camera.y;

    }

    getWeaponDefinition(id) {

        if (!id) {

            return null;

        }

        return this.weaponsCatalog.get(id) ?? null;

    }

    getCurrentWeapon() {

        return this.getWeaponDefinition(this.currentWeaponId);

    }

    createWeaponCatalog() {

        const catalog = new Map();

        catalog.set("pistol", {
            id: "pistol",
            name: "9mm Dienstpistole",
            damage: 24,
            fireRate: 420,
            projectileSpeed: 11,
            spread: 0.02,
            automatic: false,
            range: 660,
            displayColor: "#fca311",
            price: 250,
            shortLabel: "9mm",
        });

        catalog.set("smg", {
            id: "smg",
            name: "MP5 Maschinenpistole",
            damage: 26,
            fireRate: 120,
            projectileSpeed: 12,
            spread: 0.06,
            automatic: true,
            range: 640,
            displayColor: "#00f5d4",
            price: 650,
            shortLabel: "MP5",
        });

        catalog.set("assaultRifle", {
            id: "assaultRifle",
            name: "AR-15 Sturmgewehr",
            damage: 48,
            fireRate: 180,
            projectileSpeed: 14,
            spread: 0.04,
            automatic: true,
            range: 860,
            displayColor: "#ef476f",
            price: 1400,
            shortLabel: "AR-15",
        });

        catalog.set("shotgun", {
            id: "shotgun",
            name: "Pump-Action Schrotflinte",
            damage: 22,
            fireRate: 1900,
            projectileSpeed: 10,
            spread: 0.18,
            automatic: false,
            pellets: 6,
            range: 360,
            displayColor: "#7209b7",
            price: 900,
            shortLabel: "Shotgun",
        });

        catalog.set("sniperRifle", {
            id: "sniperRifle",
            name: "AX-50 Scharfsch�tzengewehr",
            damage: 160,
            fireRate: 1700,
            projectileSpeed: 18,
            spread: 0.004,
            automatic: false,
            range: 1400,
            displayColor: "#3f37c9",
            price: 3200,
            shortLabel: "Sniper",
        });

        catalog.set("lmg", {
            id: "lmg",
            name: "M249 Leichtes MG",
            damage: 44,
            fireRate: 140,
            projectileSpeed: 13,
            spread: 0.07,
            automatic: true,
            range: 900,
            displayColor: "#06d6a0",
            price: 2600,
            shortLabel: "M249",
        });

        return catalog;
    }

    formatMoney(amount) {
        const numeric = Number(amount);
        const safeValue = Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
        return "G$ " + safeValue.toLocaleString("de-DE");
    }

    formatCredits(amount) {
        const numeric = Number(amount);
        const safeValue = Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
        return safeValue.toLocaleString("de-DE");
    }

    loadCasinoCredits() {
        if (typeof window === "undefined" || !window.localStorage) {
            return this.casinoCredits ?? 0;
        }

        try {
            const raw = window.localStorage.getItem("casinoCredits");
            if (raw == null) {
                return this.casinoCredits ?? 0;
            }

            const parsed = parseInt(raw, 10);

            if (!Number.isFinite(parsed) || parsed < 0) {
                return 0;
            }

            return parsed;
        } catch (err) {
            console.warn("Casino credits konnten nicht geladen werden:", err);
            return this.casinoCredits ?? 0;
        }
    }

    storeCasinoCredits(amount) {
        const value = Math.max(0, Math.floor(Number(amount) || 0));

        if (typeof window !== "undefined" && window.localStorage) {
            try {
                window.localStorage.setItem("casinoCredits", String(value));
            } catch (err) {
                console.warn("Casino credits konnten nicht gespeichert werden:", err);
            }
        }

        this.casinoCredits = value;
        return value;
    }

    refreshCasinoCreditsCache() {
        this.casinoCredits = this.loadCasinoCredits();
        const stamp = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
        this.lastCasinoCreditSync = stamp;

        if (this.pendingInteractionBuilding && this.pendingInteractionBuilding.type === "casino") {

            this.updateCasinoInteractionMessage();

        }
    }

    convertDollarsToCredits() {
        const rate = this.casinoCreditRate ?? 10;
        const availableDollars = Math.floor(Math.max(0, Number(this.playerMoney ?? 0)));

        if (!(availableDollars > 0)) {
            return { success: false, reason: "noMoney", dollarsSpent: 0, creditsAdded: 0, totalCredits: this.casinoCredits ?? 0 };
        }

        const creditsAdded = availableDollars * rate;
        const currentCredits = this.loadCasinoCredits();
        const newTotal = currentCredits + creditsAdded;

        this.playerMoney = Math.max(0, (this.playerMoney ?? 0) - availableDollars);

        this.storeCasinoCredits(newTotal);
        this.refreshCasinoCreditsCache();

        return { success: true, dollarsSpent: availableDollars, creditsAdded, totalCredits: newTotal };
    }

    convertCreditsToDollars() {
        const rate = this.casinoCreditRate ?? 10;
        const currentCredits = this.loadCasinoCredits();
        const availableCredits = Math.floor(Math.max(0, Number(currentCredits ?? 0)));

        if (availableCredits < rate) {
            return { success: false, reason: "noCredits", creditsSpent: 0, dollarsGained: 0, totalCredits: availableCredits };
        }

        const dollarsGained = Math.floor(availableCredits / rate);
        const creditsSpent = dollarsGained * rate;
        const newTotal = availableCredits - creditsSpent;

        this.storeCasinoCredits(newTotal);
        this.playerMoney = (this.playerMoney ?? 0) + dollarsGained;
        this.refreshCasinoCreditsCache();

        return { success: true, creditsSpent, dollarsGained, totalCredits: newTotal };
    }

    selectWeaponByIndex(index) {
        if (!Number.isFinite(index)) {
            return;
        }

        const owned = this.weaponOrder.filter((id) => this.weaponInventory.has(id));
        if (!owned.length) {
            return;
        }

        let weaponId = null;
        const loadout = Array.isArray(this.weaponLoadout) ? this.weaponLoadout : [];

        if (index >= 1 && index <= loadout.length) {
            const candidate = loadout[index - 1];
            if (candidate && this.weaponInventory.has(candidate)) {
                weaponId = candidate;
            }
        }

        if (!weaponId) {
            weaponId = owned[index - 1];
        }

        if (!weaponId || !this.weaponInventory.has(weaponId) || weaponId === this.currentWeaponId) {
            return;
        }

        this.currentWeaponId = weaponId;
        this.updateWeaponLoadout(weaponId);
        this.persistCurrentWeaponId();

        if (this.scene === "weaponShop" && this.activeInterior) {
            const weapon = this.getWeaponDefinition(weaponId);
            if (weapon) {
                this.activeInterior.messageText = weapon.name + " ausgeruestet";
                this.activeInterior.messageTimer = 150;
            }
        }
    }

    loadWeaponInventory() {
        const defaults = ["pistol"];
        const validIds = new Set(this.weaponOrder);
        const owned = new Set();

        for (const id of defaults) {
            owned.add(id);
        }

        if (typeof window !== "undefined" && window.localStorage) {
            try {
                const raw = window.localStorage.getItem("overworldWeaponInventory");
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed)) {
                        for (const id of parsed) {
                            if (typeof id === "string" && validIds.has(id)) {
                                owned.add(id);
                            }
                        }
                    }
                }
            } catch (error) {
                console.warn("Waffeninventar konnte nicht geladen werden", error);
            }
        }

        return owned;
    }

    persistWeaponInventory() {
        if (typeof window === "undefined" || !window.localStorage) {
            return;
        }

        try {
            const owned = Array.from(this.weaponInventory).filter((id) => this.weaponOrder.includes(id));
            window.localStorage.setItem("overworldWeaponInventory", JSON.stringify(owned));
        } catch (error) {
            console.warn("Waffeninventar konnte nicht gespeichert werden", error);
        }
    }

    loadWeaponLoadout() {
        const maxSlots = 3;
        const fallback = this.weaponOrder.filter((id) => this.weaponInventory.has(id));
        const slots = [];
        const seen = new Set();

        if (typeof window !== "undefined" && window.localStorage) {
            try {
                const raw = window.localStorage.getItem("overworldWeaponLoadout");
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed)) {
                        for (const id of parsed) {
                            if (typeof id !== "string") {
                                continue;
                            }
                            if (!this.weaponOrder.includes(id)) {
                                continue;
                            }
                            if (!this.weaponInventory.has(id)) {
                                continue;
                            }
                            if (seen.has(id)) {
                                continue;
                            }
                            slots.push(id);
                            seen.add(id);
                            if (slots.length >= maxSlots) {
                                break;
                            }
                        }
                    }
                }
            } catch (error) {
                console.warn("Waffen-Slots konnten nicht geladen werden", error);
            }
        }

        if (!slots.length) {
            for (const id of fallback) {
                if (seen.has(id)) {
                    continue;
                }

                slots.push(id);
                seen.add(id);

                if (slots.length >= maxSlots) {
                    break;
                }
            }
        }

        if (!slots.length) {
            slots.push("pistol");
        }

        return slots;
    }

    persistWeaponLoadout() {
        if (typeof window === "undefined" || !window.localStorage) {
            return;
        }

        try {
            const slots = Array.isArray(this.weaponLoadout)
                ? this.weaponLoadout.filter((id) => this.weaponOrder.includes(id) && this.weaponInventory.has(id))
                : [];
            window.localStorage.setItem("overworldWeaponLoadout", JSON.stringify(slots));
        } catch (error) {
            console.warn("Waffen-Slots konnten nicht gespeichert werden", error);
        }
    }

    loadCurrentWeaponId() {
        const fallback = Array.isArray(this.weaponLoadout) && this.weaponLoadout.length
            ? this.weaponLoadout[0]
            : "pistol";

        if (typeof window !== "undefined" && window.localStorage) {
            try {
                const stored = window.localStorage.getItem("overworldCurrentWeaponId");
                if (stored && this.weaponInventory.has(stored)) {
                    return stored;
                }
            } catch (error) {
                console.warn("Aktuelle Waffe konnte nicht geladen werden", error);
            }
        }

        if (this.weaponInventory.has(fallback)) {
            return fallback;
        }

        const owned = this.weaponOrder.find((id) => this.weaponInventory.has(id));
        return owned ?? "pistol";
    }

    persistCurrentWeaponId() {
        if (typeof window === "undefined" || !window.localStorage) {
            return;
        }

        try {
            if (this.weaponInventory.has(this.currentWeaponId)) {
                window.localStorage.setItem("overworldCurrentWeaponId", this.currentWeaponId);
            } else {
                window.localStorage.removeItem("overworldCurrentWeaponId");
            }
        } catch (error) {
            console.warn("Aktuelle Waffe konnte nicht gespeichert werden", error);
        }
    }

    updateWeaponLoadout(weaponId, options = {}) {
        if (!weaponId || !this.weaponInventory.has(weaponId)) {
            return;
        }

        const maxSlots = 3;
        const existing = Array.isArray(this.weaponLoadout) ? this.weaponLoadout : [];
        const filtered = [];

        for (const id of existing) {
            if (id === weaponId) {
                continue;
            }
            if (!this.weaponInventory.has(id)) {
                continue;
            }
            if (!this.weaponOrder.includes(id)) {
                continue;
            }
            filtered.push(id);
        }

        filtered.unshift(weaponId);

        while (filtered.length > maxSlots) {
            filtered.pop();
        }

        this.weaponLoadout = filtered;

        if (options.persist !== false) {
            this.persistWeaponLoadout();
        }
    }

    getPlayerMuzzlePosition() {
        const center = this.getPlayerCenter();

        return {
            x: center.x,
            y: center.y,
        };
    }

    processPlayerFiring(now) {
        const weapon = this.getCurrentWeapon();

        if (!weapon || !this.weaponInventory.has(weapon.id)) {
            return;
        }

        if (!this.firingState.active && !this.firingState.justPressed) {
            return;
        }

        if (!weapon.automatic && !this.firingState.justPressed) {
            return;
        }

        const interval = weapon.fireRate ?? 250;

        if (now - (this.firingState.lastShotAt ?? 0) < interval) {
            return;
        }

        const muzzle = this.getPlayerMuzzlePosition();
        this.spawnProjectilesForWeapon(weapon, muzzle);

        this.firingState.lastShotAt = now;
        this.firingState.justPressed = false;
    }

    spawnProjectilesForWeapon(weapon, muzzle) {
        const targetX = this.mouse.worldX ?? muzzle.x;
        const targetY = this.mouse.worldY ?? muzzle.y;

        let angle = Math.atan2(targetY - muzzle.y, targetX - muzzle.x);

        if (!Number.isFinite(angle)) {
            angle = 0;
        }

        const spread = weapon.spread ?? 0;
        const pelletCount = weapon.pellets && weapon.pellets > 1 ? weapon.pellets : 1;

        for (let i = 0; i < pelletCount; i++) {
            const offset = spread ? (Math.random() - 0.5) * spread * 2 : 0;
            this.createProjectile(weapon, muzzle.x, muzzle.y, angle + offset);
        }
    }

    createProjectile(weapon, startX, startY, angle) {
        const speed = weapon.projectileSpeed ?? 10;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;

        const muzzleOffset = 18;
        const originX = startX + Math.cos(angle) * muzzleOffset;
        const originY = startY + Math.sin(angle) * muzzleOffset;

        const projectile = {
            x: originX,
            y: originY,
            vx,
            vy,
            speed,
            damage: weapon.damage ?? 10,
            weaponId: weapon.id,
            color: weapon.displayColor ?? "#ffd166",
            maxDistance: weapon.range ?? 600,
            distance: 0,
            scene: this.scene,
            createdAt: performance.now(),
        };

        this.projectiles.push(projectile);
    }

    updateProjectiles() {
        if (!this.projectiles.length) {
            return;
        }

        const survivors = [];
        const interior = this.scene === "weaponShop" ? this.activeInterior : null;

        for (const projectile of this.projectiles) {
            projectile.x += projectile.vx;
            projectile.y += projectile.vy;
            projectile.distance += projectile.speed;

            let expired = projectile.distance >= projectile.maxDistance;

            if (!expired) {
                if (projectile.scene === "weaponShop") {
                    if (!interior || projectile.x < 0 || projectile.y < 0 || projectile.x > interior.width || projectile.y > interior.height) {
                        expired = true;
                    }
                } else if (projectile.x < 0 || projectile.y < 0 || projectile.x > 3600 || projectile.y > 3000) {
                    expired = true;
                }
            }

            if (!expired && projectile.scene !== "weaponShop") {
                if (this.checkProjectileNpcCollision(projectile)) {
                    expired = true;
                }
            }

            if (!expired) {
                survivors.push(projectile);
            }
        }

        this.projectiles = survivors;
    }

    drawProjectiles() {
        if (!this.projectiles.length) {
            return;
        }

        this.ctx.save();

        if (this.scene === "weaponShop") {
            const interior = this.activeInterior;

            if (!interior) {
                this.ctx.restore();
                return;
            }

            this.ctx.translate(interior.originX, interior.originY);

            for (const projectile of this.projectiles) {
                if (projectile.scene !== "weaponShop") {
                    continue;
                }

                this.drawProjectileSprite(projectile);
            }
        } else {
            for (const projectile of this.projectiles) {
                if (projectile.scene === "weaponShop") {
                    continue;
                }

                this.drawProjectileSprite(projectile);
            }
        }

        this.ctx.restore();
    }

    drawProjectileSprite(projectile) {
        this.ctx.save();
        this.ctx.fillStyle = projectile.color;
        this.ctx.globalAlpha = 0.9;

        this.ctx.beginPath();
        this.ctx.arc(projectile.x, projectile.y, 3.5, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.globalAlpha = 0.35;
        this.ctx.beginPath();
        this.ctx.arc(projectile.x, projectile.y, 6, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.restore();
    }

    drawBloodDecals() {
        if (!this.bloodDecals.length) {
            return;
        }

        this.ctx.save();

        for (const decal of this.bloodDecals) {
            const gradient = this.ctx.createRadialGradient(decal.x, decal.y, 4, decal.x, decal.y, decal.radius * 1.4);

            gradient.addColorStop(0, "rgba(200, 24, 34, 0.55)");
            gradient.addColorStop(1, "rgba(110, 0, 0, 0.05)");

            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            this.ctx.ellipse(decal.x, decal.y, decal.radius * 1.3, decal.radius, 0, 0, Math.PI * 2);
            this.ctx.fill();
        }

        this.ctx.restore();
    }

    checkProjectileNpcCollision(projectile) {
        if (!this.dynamicAgents || !Array.isArray(this.dynamicAgents.npcs)) {
            return false;
        }

        for (const npc of this.dynamicAgents.npcs) {
            if (!npc || npc.dead) {
                continue;
            }

            const radius = npc.hitRadius ?? 14;
            const dx = projectile.x - npc.x;
            const dy = projectile.y - npc.y;

            if (dx * dx + dy * dy <= radius * radius) {
                this.onNpcHit(npc, projectile);
                return true;
            }
        }

        return false;
    }

    onNpcHit(npc, projectile) {
        const maxHealth = npc.maxHealth ?? 100;

        npc.health = Math.max(0, (npc.health ?? maxHealth) - projectile.damage);

        const panicDuration = 180 + Math.floor(Math.random() * 120);
        npc.panicTimer = Math.max(npc.panicTimer ?? 0, panicDuration);

        if (npc.health <= 0) {
            this.killNpc(npc);
        }
    }

    killNpc(npc) {
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

        this.spawnBloodDecal(npc);
    }

    spawnBloodDecal(npc) {
        this.bloodDecals.push({
            x: npc.x,
            y: npc.y,
            radius: 18 + Math.random() * 12,
            createdAt: performance.now(),
        });

        if (this.bloodDecals.length > 150) {
            this.bloodDecals.shift();
        }
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

                    interactive: true

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

                    walkwaySpurWidth: blueprint.walkwaySpurWidth ?? 0

                }

            });

            houseCounter++;

        }

        let buildingIdCounter = 1;

        for (const building of buildings) {

            if (!building) {

                continue;

            }

            building.id = `building_${buildingIdCounter++}`;

            if (building.type === "house") {

                const metrics = this.computeHouseMetrics(building);

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

                            const footprint = {

                                x: houseBodyX,

                                y: houseBodyY,

                                width: houseBodyWidth,

                                height: clippedHeight

                            };

                            building.collisionRects = [footprint];

                        }

                    }

                }

            }

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

    createHouseVisitorNPCs() {

        if (!Array.isArray(this.buildings)) {

            return [];

        }

        const houses = this.buildings.filter((building) => building && building.type === "house" && building.entrance && building.approach && building.interiorPoint);

        if (!houses.length) {

            return [];

        }

        const palettes = [

            { head: "#f2d1b3", torso: "#355070", limbs: "#2a3d66", accent: "#b1e5f2", hair: "#2f1b25" },

            { head: "#f8cbbb", torso: "#6d597a", limbs: "#463764", accent: "#ffb4a2", hair: "#2d142c" },

            { head: "#f6d5a5", torso: "#588157", limbs: "#3a5a40", accent: "#a3b18a", hair: "#5b3711" },

            { head: "#f1d3ce", torso: "#0081a7", limbs: "#005f73", accent: "#83c5be", hair: "#0d1b2a" },

            { head: "#f7d6bf", torso: "#bc4749", limbs: "#6a040f", accent: "#fcbf49", hair: "#432818" },

            { head: "#efd3b4", torso: "#2a9d8f", limbs: "#1d6f6a", accent: "#e9c46a", hair: "#264653" },

            { head: "#f2ceb9", torso: "#4361ee", limbs: "#3a0ca3", accent: "#4cc9f0", hair: "#1a1b41" },

            { head: "#f9d5c4", torso: "#f3722c", limbs: "#d8572a", accent: "#f8961e", hair: "#7f5539" },

            { head: "#f5d2bc", torso: "#2b9348", limbs: "#007f5f", accent: "#80ed99", hair: "#2f2f2f" },

            { head: "#f0cfd0", torso: "#9d4edd", limbs: "#7b2cbf", accent: "#c77dff", hair: "#3c096c" }

        ];

        const cycle = this.dayNightCycle ?? null;

        const phaseDurations = Array.isArray(cycle?.phases) && cycle.phases.length ? cycle.phases : [

            { id: "day", duration: 300000 },

            { id: "dusk", duration: 120000 },

            { id: "night", duration: 300000 },

            { id: "dawn", duration: 120000 }

        ];

        const totalCycleMs = phaseDurations.reduce((sum, phase) => sum + Math.max(0, Number(phase.duration) || 0), 0);

        const halfDayMs = Math.max(180000, totalCycleMs > 0 ? totalCycleMs / 2 : 360000);

        const framesFromMs = (ms, minFrames = 60) => {

            const frames = Math.round((Math.max(0, Number(ms) || 0) / 1000) * 60);

            return Math.max(minFrames, frames);

        };

        const distanceSq = (a, b) => {

            if (!a || !b) {

                return Infinity;

            }

            const dx = (a.x ?? 0) - (b.x ?? 0);

            const dy = (a.y ?? 0) - (b.y ?? 0);

            return dx * dx + dy * dy;

        };

        const visitors = [];

        for (let index = 0; index < houses.length; index++) {

            const house = houses[index];

            const metrics = house.metrics ?? this.computeHouseMetrics(house);

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

                y: doorWorld.bottom ?? doorWorld.y

            };

            const seedX = (Number(house.x ?? 0) + index * 37.17) * 0.0031;

            const seedY = (Number(house.y ?? 0) + index * 19.91) * 0.0042;

            const rng = this.pseudoRandom2D(seedX, seedY);

            const baseHalfFrames = framesFromMs(halfDayMs, 1200);

            const insideFrames = Math.max(1200, Math.round(baseHalfFrames * (0.85 + (1 - rng) * 0.3)));

            const outsideFrames = Math.max(900, Math.round(baseHalfFrames * (0.85 + rng * 0.3)));

            const palette = palettes[index % palettes.length];

            const stride = Math.max(140, (walkway.width ?? 32) * 5.5);

            const travelDepth = Math.max(120, (walkway.height ?? 18) * 8);

            const project = (dx, dy) => {

                const projected = this.projectPointToSidewalk(approach.x + dx, approach.y + dy, { ignoreObstacles: true });

                if (projected && Number.isFinite(projected.x) && Number.isFinite(projected.y)) {

                    return { x: projected.x, y: projected.y };

                }

                return null;

            };

            const pickUniqueSidewalkPoint = (attempts, reference, fallback) => {

                for (const [dx, dy] of attempts) {

                    const candidate = project(dx, dy);

                    if (!candidate) {

                        continue;

                    }

                    if (reference && distanceSq(candidate, reference) < 64) {

                        continue;

                    }

                    return candidate;

                }

                return fallback;

            };

            const defaultSidewalk = project(0, 0) ?? { x: approach.x, y: approach.y };

            const sidewalkStart = pickUniqueSidewalkPoint([

                [direction * stride * 0.45, (walkway.height ?? 18) * 0.15],

                [direction * stride * 0.35, 0],

                [direction * stride * 0.55, (walkway.height ?? 18) * 0.35]

            ], null, defaultSidewalk) ?? defaultSidewalk;

            const plazaPoint = pickUniqueSidewalkPoint([

                [direction * stride, travelDepth],

                [direction * stride * 0.95, travelDepth * 1.1],

                [direction * stride * 0.8, travelDepth * 0.9],

                [direction * stride * 0.6, travelDepth]

            ], sidewalkStart, sidewalkStart) ?? sidewalkStart;

            let returnPoint = pickUniqueSidewalkPoint([

                [-direction * stride * 0.3, travelDepth * 0.6],

                [0, travelDepth * 0.75],

                [-direction * stride * 0.45, travelDepth * 0.9],

                [-direction * stride * 0.2, travelDepth * 0.5]

            ], plazaPoint, sidewalkStart) ?? sidewalkStart;

            if (distanceSq(returnPoint, plazaPoint) < 64) {

                const alternate = project(-direction * stride * 0.15, travelDepth * 0.4);

                if (alternate) {

                    returnPoint = alternate;

                }

            }

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

            let totalWait = walkwayOutWait + walkwayBackWait + porchWait + plazaWait;

            if (totalWait > outsideFrames) {

                const over = totalWait - outsideFrames;

                plazaWait = Math.max(minWait * 2, plazaWait - over);

            }

            const entranceOut = {

                x: entrance.x,

                y: entrance.y,

                wait: 18

            };

            const entranceReturn = {

                x: entrance.x,

                y: entrance.y,

                wait: Math.max(minWait, Math.round(outsideFrames * 0.06))

            };

            const lateralOffset = Math.min(18, (walkway.width ?? 32) * 0.35) * direction;

            const porchSpot = {

                x: entrance.x + lateralOffset,

                y: entrance.y + (walkway.height ?? 18) * 0.4,

                wait: porchWait

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

                { x: door.x, y: door.y, wait: 6, action: 'enter', buildingId: house.id, allowOffSidewalk: true }

            ];

            const bounds = house.bounds ?? metrics.bounds;

            const speed = 0.98 + rng * 0.32;

            const npc = this.buildNPC({

                palette,

                speed,

                stayOnSidewalks: true,

                ignoreSidewalkObstacles: true,

                waypoints: path,

                bounds

            });

            npc.home = {

                buildingId: house.id,

                entrance: { x: entrance.x, y: entrance.y },

                approach: { x: approach.x, y: approach.y },

                interior: { x: interior.x, y: interior.y },

                door: { x: door.x, y: door.y }

            };

            npc.homeSchedule = {

                insideFrames,

                outsideFrames

            };

            npc.houseResident = true;

            npc.homeId = house.id;

            npc.homeBounds = bounds ? { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom } : null;

            visitors.push(npc);

        }

        return visitors;

    }

    initDayNightCycle() {

        const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();

        const phases = [

            { id: "day", duration: 300000 },

            { id: "dusk", duration: 120000 },

            { id: "night", duration: 300000 },

            { id: "dawn", duration: 120000 }

        ];

        return {

            phases,

            phaseIndex: 0,

            phaseStart: now,

            lastUpdate: now,

            progress: 0,

            currentPhase: phases[0],

            lighting: {

                overlayAlpha: 0,

                overlayTop: "rgba(0, 0, 0, 0)",

                overlayBottom: "rgba(0, 0, 0, 0)",

                horizon: null,

                starAlpha: 0

            },

            starPhase: 0,

            stars: this.generateNightSkyStars(160)

        };

    }

    generateNightSkyStars(count = 160) {

        const total = Math.max(0, Math.floor(count));

        const stars = [];

        for (let i = 0; i < total; i++) {

            const randomness = Math.random();

            stars.push({

                x: Math.random(),

                y: Math.random() * 0.65,

                size: 0.6 + Math.random() * 1.4,

                twinkleOffset: Math.random() * Math.PI * 2,

                twinkleSpeed: 0.6 + Math.random() * 1.4,

                baseIntensity: 0.4 + randomness * 0.6

            });

        }

        return stars;

    }


    computeDayNightLighting(phaseId, progress, cycle) {

        const t = Math.max(0, Math.min(1, Number(progress) || 0));

        const sampleStops = (stops, value) => this.sampleColorStops(stops, Math.max(0, Math.min(1, value)));

        const duskSkyStops = [

            { at: 0, color: [68, 106, 196, 0.86] },

            { at: 0.33, color: [255, 150, 90, 0.92] },

            { at: 0.66, color: [186, 58, 48, 0.96] },

            { at: 1, color: [8, 8, 20, 1] }

        ];

        const duskHorizonStops = [

            { at: 0, color: [255, 210, 140, 0.85] },

            { at: 0.4, color: [255, 142, 64, 0.9] },

            { at: 0.75, color: [196, 52, 44, 0.92] },

            { at: 1, color: [12, 10, 28, 0.96] }

        ];

        const nightSkyTop = [16, 24, 58, 0.92];

        const nightSkyBottom = [6, 10, 24, 0.96];

        const result = {

            phaseId: phaseId || 'day',

            overlayAlpha: 0,

            overlayTop: 'rgba(0, 0, 0, 0)',

            overlayBottom: 'rgba(0, 0, 0, 0)',

            horizon: null,

            starAlpha: 0

        };

        switch (phaseId) {

            case 'dusk': {

                const skyTop = sampleStops(duskSkyStops, t);

                const skyBottom = sampleStops(duskHorizonStops, Math.min(1, t + 0.15));

                const horizonTop = sampleStops(duskHorizonStops, Math.max(0, t - 0.15));

                const horizonBottom = sampleStops(duskHorizonStops, t);

                result.overlayAlpha = 0.35 + t * 0.35;

                result.overlayTop = this.colorArrayToRgba(skyTop);

                result.overlayBottom = this.colorArrayToRgba(skyBottom);

                result.horizon = {

                    alpha: 0.35 + t * 0.45,

                    top: this.colorArrayToRgba(horizonTop),

                    bottom: this.colorArrayToRgba(horizonBottom),

                    offsetTop: 0.25

                };

                result.starAlpha = Math.max(0, t - 0.4) * 0.9;

                break;

            }

            case 'night': {

                result.overlayAlpha = 0.62;

                result.overlayTop = this.colorArrayToRgba(nightSkyTop);

                result.overlayBottom = this.colorArrayToRgba(nightSkyBottom);

                result.horizon = {

                    alpha: 0.25,

                    top: this.colorArrayToRgba([32, 30, 60, 0.52]),

                    bottom: this.colorArrayToRgba([12, 10, 22, 0.68]),

                    offsetTop: 0.3

                };

                result.starAlpha = 0.75;

                break;

            }

            case 'dawn': {

                const reverse = 1 - t;

                const skyTop = sampleStops(duskSkyStops, reverse);

                const skyBottom = sampleStops(duskHorizonStops, Math.min(1, reverse + 0.1));

                const horizonTop = sampleStops(duskHorizonStops, reverse);

                const horizonBottom = sampleStops(duskHorizonStops, Math.max(0, reverse - 0.1));

                result.overlayAlpha = 0.52 * reverse;

                result.overlayTop = this.colorArrayToRgba(skyTop);

                result.overlayBottom = this.colorArrayToRgba(skyBottom);

                result.horizon = {

                    alpha: 0.28 + reverse * 0.3,

                    top: this.colorArrayToRgba(horizonTop),

                    bottom: this.colorArrayToRgba(horizonBottom),

                    offsetTop: 0.28

                };

                result.starAlpha = Math.max(0, reverse - 0.25) * 0.7;

                break;

            }

            case 'day':

            default: {

                const warmFactor = Math.sin(t * Math.PI);

                const top = this.lerpColor([255, 250, 238, 0.08], [255, 236, 204, 0.18], warmFactor);

                const bottom = this.lerpColor([255, 236, 196, 0.1], [255, 220, 174, 0.18], warmFactor);

                result.overlayAlpha = 0.18 + warmFactor * 0.05;

                result.overlayTop = this.colorArrayToRgba(top);

                result.overlayBottom = this.colorArrayToRgba(bottom);

                result.horizon = {

                    alpha: 0.2 + warmFactor * 0.12,

                    top: this.colorArrayToRgba([255, 232, 188, 0.32 + warmFactor * 0.1]),

                    bottom: this.colorArrayToRgba([255, 214, 162, 0.34 + warmFactor * 0.12]),

                    offsetTop: 0.35

                };

                result.starAlpha = 0;

                break;

            }

        }

        return result;

    }

    sampleColorStops(stops, value) {

        if (!Array.isArray(stops) || stops.length === 0) {

            return [0, 0, 0, 0];

        }

        const t = Math.max(0, Math.min(1, Number(value) || 0));

        let previous = stops[0];

        for (let i = 1; i < stops.length; i++) {

            const current = stops[i];

            const prevAt = Number(previous?.at ?? 0);

            const currAt = Number(current?.at ?? 1);

            if (t <= currAt) {

                const range = Math.max(1e-6, currAt - prevAt);

                const localT = Math.max(0, Math.min(1, (t - prevAt) / range));

                return this.lerpColor(previous?.color, current?.color, localT);

            }

            previous = current;

        }

        const lastColor = stops[stops.length - 1]?.color;

        return Array.isArray(lastColor) ? lastColor.slice() : [0, 0, 0, 0];

    }

    lerpColor(colorA, colorB, t) {

        const clampT = Math.max(0, Math.min(1, Number(t) || 0));

        const getComponent = (arr, index) => {

            if (!Array.isArray(arr) || arr.length === 0) {

                return index === 3 ? 1 : 0;

            }

            if (index < arr.length) {

                return Number(arr[index]);

            }

            if (index === 3) {

                return arr.length > 3 ? Number(arr[3]) : 1;

            }

            return Number(arr[Math.min(index, arr.length - 1)]);

        };

        const result = [];

        for (let i = 0; i < 4; i++) {

            const compA = getComponent(colorA, i);

            const compB = getComponent(colorB, i);

            result[i] = compA + (compB - compA) * clampT;

        }

        return result;

    }

    colorArrayToRgba(color, alphaMultiplier = 1) {

        if (!Array.isArray(color) || color.length === 0) {

            return 'rgba(0, 0, 0, 0)';

        }

        const r = Math.round(Math.max(0, Math.min(255, Number(color[0]) || 0)));

        const g = Math.round(Math.max(0, Math.min(255, Number(color[1] ?? color[0]) || 0)));

        const b = Math.round(Math.max(0, Math.min(255, Number(color[2] ?? color[1] ?? color[0]) || 0)));

        const aBase = color.length > 3 ? Number(color[3]) : 1;

        const a = Math.max(0, Math.min(1, aBase * alphaMultiplier));

        return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;

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

                stayOnSidewalks: true,

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

                stayOnSidewalks: true,

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

                stayOnSidewalks: true,

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

                stayOnSidewalks: true,

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

                stayOnSidewalks: true,

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

                stayOnSidewalks: true,

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

                stayOnSidewalks: true,

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

                stayOnSidewalks: true,

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

                stayOnSidewalks: true,

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

                stayOnSidewalks: true,

                speed: 1.35

            }),

        ];

        if (casinoPodiumPlan) {

            npcs.push(this.buildNPC({

                palette: { head: "#f4d7c8", torso: "#1b3a4b", limbs: "#12263a", accent: "#9ad1d4", hair: '#261d1a' },

                waypoints: casinoPodiumPlan.path,

                bounds: casinoPodiumPlan.bounds,

                speed: 1.08,

                stayOnSidewalks: true

            }));

        }

        const houseVisitors = this.createHouseVisitorNPCs();

        if (houseVisitors.length) {

            npcs.push(...houseVisitors);

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

        const ignoreSidewalkObstacles = config.ignoreSidewalkObstacles !== false;

        const hitboxDisabled = config.hitboxDisabled !== false;

        if (stayOnSidewalks) {

            for (const wp of path) {

                if (!wp || wp.interior === true || wp.allowOffSidewalk === true) {

                    continue;

                }

                const projected = this.projectPointToSidewalk(wp.x ?? 0, wp.y ?? 0, { ignoreObstacles: ignoreSidewalkObstacles });

                wp.x = projected.x;

                wp.y = projected.y;

            }

        }

        const start = path[0];

        const startBuildingId = start?.buildingId ?? null;

        const startInside = Boolean(start?.interior === true || start?.action === 'enter');

        const startHidden = startInside || Boolean(start?.hidden);

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

            ignoreSidewalkObstacles,

            hitboxDisabled,

            insideBuilding: startInside ? (startBuildingId ?? true) : null,

            hidden: startHidden,

            lastBuildingId: startBuildingId,

            parts: this.buildNPCParts(config.palette ?? {}),



            palette: config.palette ?? null,



            maxHealth: config.maxHealth ?? 100,



            health: config.maxHealth ?? 100,



            hitRadius: config.hitRadius ?? 14,



            panicTimer: 0,



            dead: false,



            deathRotation: 0

        };

        if (npc.stayOnSidewalks && !startInside) {

            const projectedStart = this.projectPointToSidewalk(npc.x, npc.y, { ignoreObstacles: npc.ignoreSidewalkObstacles });

            if (projectedStart && Number.isFinite(projectedStart.x) && Number.isFinite(projectedStart.y)) {

                npc.x = projectedStart.x;

                npc.y = projectedStart.y;

                if (path[0]) {

                    path[0].x = projectedStart.x;

                    path[0].y = projectedStart.y;

                }

            }

        }

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

        npc.health = npc.maxHealth;



        const projected = this.projectPointToSidewalk(npc.x, npc.y, { ignoreObstacles: npc.ignoreSidewalkObstacles });

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



        if (npc.dead) {

            npc.moving = false;

            npc.waitTimer = 0;

            npc.animationPhase *= 0.85;

            return;

        }



        if (npc.panicTimer && npc.panicTimer > 0) {

            this.updateNpcPanicMovement(npc);

            return;

        }



        let movingThisFrame = false;

        const originX = npc.x;
        const originY = npc.y;
        npc._lastCollision = null;

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

                if (target.action === 'enter') {

                    if (target.buildingId) {

                        npc.lastBuildingId = target.buildingId;

                    }

                    npc.insideBuilding = target.buildingId ?? npc.insideBuilding ?? npc.lastBuildingId ?? true;

                    npc.hidden = true;

                } else if (target.action === 'exit') {

                    if (target.buildingId) {

                        npc.lastBuildingId = target.buildingId;

                    }

                    npc.insideBuilding = null;

                    npc.hidden = false;

                } else if (target.interior) {

                    if (target.buildingId) {

                        npc.lastBuildingId = target.buildingId;

                    }

                    npc.insideBuilding = target.buildingId ?? npc.insideBuilding ?? npc.lastBuildingId ?? true;

                    npc.hidden = true;

                }

                npc.waypointIndex = (npc.waypointIndex + 1) % npc.path.length;

            } else if (dist > 0) {

                const ratio = npc.speed / dist;

                const nextX = npc.x + dx * ratio;

                const nextY = npc.y + dy * ratio;

                const movement = this.resolveNpcMovement(npc, nextX, nextY, originX, originY);

                npc.x = movement.x;

                npc.y = movement.y;

                movingThisFrame = movement.moved;

                npc._lastCollision = movement.collisionInfo;

                if (npc._lastCollision && npc._lastCollision.buildingId) {

                    npc.lastBuildingId = npc._lastCollision.buildingId;

                }

            }

        }



        this.applySidewalkConstraint(npc);



        if (npc.bounds) {

            npc.x = Math.max(npc.bounds.left, Math.min(npc.x, npc.bounds.right));

            npc.y = Math.max(npc.bounds.top, Math.min(npc.y, npc.bounds.bottom));

        }



        const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();

        const stepDistance = Math.hypot(npc.x - originX, npc.y - originY);

        const tracker = this.updateNpcMovementTracker(npc, stepDistance, now);

        const insideBuildingNow = this.isPointInsideAnyCollider(npc.x, npc.y, this.buildingColliders);

        const wantsTeleportInside = insideBuildingNow && !npc.hidden && !npc.insideBuilding;

        let teleported = false;

        if (wantsTeleportInside && this.teleportNpcToNearestSidewalk(npc, 'building', now)) {

            teleported = true;

        } else if (tracker && npc.waitTimer === 0) {

            const idleThreshold = tracker.idleThreshold ?? 3500;

            const maxStuckSamples = tracker.maxStuckSamples ?? 2;

            const idleTooLong = tracker.idleTime >= idleThreshold;

            const stuckTooOften = (tracker.stuckSamples ?? 0) >= maxStuckSamples;

            if ((idleTooLong || stuckTooOften) && this.teleportNpcToNearestSidewalk(npc, 'idle', now)) {

                teleported = true;

            }

        }

        if (teleported) {

            movingThisFrame = false;

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


    resolveNpcMovement(npc, targetX, targetY, originX, originY) {

        const safeOriginX = Number.isFinite(originX) ? originX : 0;

        const safeOriginY = Number.isFinite(originY) ? originY : 0;

        let x = Number.isFinite(targetX) ? targetX : safeOriginX;

        let y = Number.isFinite(targetY) ? targetY : safeOriginY;

        const radius = Math.max(8, Number(npc?.hitRadius) || 14);

        let collidedWithBuilding = false;

        let collidedBuildingId = null;

        let collidedWithVehicle = false;

        const buildingColliders = Array.isArray(this.buildingColliders) ? this.buildingColliders : [];

        const skipBuildingCollisions = Boolean(npc && npc.hidden && npc.insideBuilding);

        if (!skipBuildingCollisions) {

            for (const collider of buildingColliders) {

                const result = this.resolveCircleRectCollision(x, y, radius, collider);

                if (result.collided) {

                    x = result.x;

                    y = result.y;

                    collidedWithBuilding = true;

                    if (!collidedBuildingId && collider && collider.id) {

                        collidedBuildingId = collider.id;

                    }

                }

            }

        }

        const vehicleColliders = this.collectVehicleColliders();

        for (const collider of vehicleColliders) {

            const result = this.resolveCircleRectCollision(x, y, radius, collider);

            if (result.collided) {

                x = result.x;

                y = result.y;

                collidedWithVehicle = true;

            }

        }

        const moved = Math.hypot(x - safeOriginX, y - safeOriginY) > 0.01;

        if (!moved) {

            x = safeOriginX;

            y = safeOriginY;

        }

        const insideBuilding = this.isPointInsideAnyCollider(x, y, buildingColliders);

        let buildingId = collidedBuildingId;

        if (insideBuilding && !buildingId) {

            for (const collider of buildingColliders) {

                if (!collider) {

                    continue;

                }

                const bounds = resolveRectBounds(collider);

                if (!bounds) {

                    continue;

                }

                if (x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom) {

                    buildingId = collider.id ?? buildingId;

                    break;

                }

            }

        }

        let collisionInfo = null;

        if (collidedWithBuilding || collidedWithVehicle || insideBuilding) {

            collisionInfo = {

                building: collidedWithBuilding,

                vehicle: collidedWithVehicle,

                insideBuilding,

                buildingId: buildingId ?? null,

            };

        }

        return {

            x,

            y,

            moved,

            collisionInfo,

        };

    }
    collectVehicleColliders() {

        const vehicles = (this.dynamicAgents && Array.isArray(this.dynamicAgents.vehicles))
            ? this.dynamicAgents.vehicles
            : [];

        const colliders = [];

        for (const vehicle of vehicles) {

            if (!vehicle) {

                continue;

            }

            const width = Number(vehicle.width ?? 0);

            const height = Number(vehicle.height ?? 0);

            if (!(width > 0 && height > 0)) {

                continue;

            }

            const halfWidth = width / 2;

            const halfHeight = height / 2;

            const centerX = Number(vehicle.x);

            const centerY = Number(vehicle.y);

            if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) {

                continue;

            }

            colliders.push({

                type: 'vehicle',

                left: centerX - halfWidth,

                right: centerX + halfWidth,

                top: centerY - halfHeight,

                bottom: centerY + halfHeight,

            });

        }

        return colliders;

    }

    resolveCircleRectCollision(x, y, radius, rect) {

        if (!rect) {

            return { x, y, collided: false };

        }

        const padding = Number(rect.padding ?? 0) || 0;

        const baseLeft = Number(rect.left ?? rect.x ?? 0);

        const baseRight = Number(rect.right ?? ((rect.width != null) ? baseLeft + Number(rect.width) : baseLeft));

        const baseTop = Number(rect.top ?? rect.y ?? 0);

        const baseBottom = Number(rect.bottom ?? ((rect.height != null) ? baseTop + Number(rect.height) : baseTop));

        if (!Number.isFinite(baseLeft) || !Number.isFinite(baseRight) || !Number.isFinite(baseTop) || !Number.isFinite(baseBottom)) {

            return { x, y, collided: false };

        }

        let left = baseLeft - padding;

        let right = baseRight + padding;

        let top = baseTop - padding;

        let bottom = baseBottom + padding;

        if (left > right) {

            const swap = left;

            left = right;

            right = swap;

        }

        if (top > bottom) {

            const swap = top;

            top = bottom;

            bottom = swap;

        }

        const insideRect = x >= left && x <= right && y >= top && y <= bottom;

        if (insideRect) {

            const distanceLeft = x - left;

            const distanceRight = right - x;

            const distanceTop = y - top;

            const distanceBottom = bottom - y;

            const minDistance = Math.min(distanceLeft, distanceRight, distanceTop, distanceBottom);

            if (minDistance === distanceLeft) {

                x = left - radius;

            } else if (minDistance === distanceRight) {

                x = right + radius;

            } else if (minDistance === distanceTop) {

                y = top - radius;

            } else {

                y = bottom + radius;

            }

            return { x, y, collided: true };

        }

        const nearestX = Math.max(left, Math.min(x, right));

        const nearestY = Math.max(top, Math.min(y, bottom));

        const dx = x - nearestX;

        const dy = y - nearestY;

        const distSq = dx * dx + dy * dy;

        const radiusSq = radius * radius;

        if (distSq === 0) {

            const distanceLeft = Math.abs(x - left);

            const distanceRight = Math.abs(x - right);

            const distanceTop = Math.abs(y - top);

            const distanceBottom = Math.abs(y - bottom);

            const minDistance = Math.min(distanceLeft, distanceRight, distanceTop, distanceBottom);

            if (minDistance === distanceLeft) {

                x = left - radius;

            } else if (minDistance === distanceRight) {

                x = right + radius;

            } else if (minDistance === distanceTop) {

                y = top - radius;

            } else {

                y = bottom + radius;

            }

            return { x, y, collided: true };

        }

        if (distSq >= radiusSq || radius <= 0) {

            return { x, y, collided: false };

        }

        const dist = Math.sqrt(distSq);

        if (!Number.isFinite(dist) || dist === 0) {

            return { x, y, collided: false };

        }

        const overlap = radius - dist;

        if (overlap <= 0) {

            return { x, y, collided: false };

        }

        const nx = dx / dist;

        const ny = dy / dist;

        x += nx * overlap;

        y += ny * overlap;

        if (!Number.isFinite(x) || !Number.isFinite(y)) {

            return { x: nearestX, y: nearestY, collided: true };

        }

        return { x, y, collided: true };

    }

    isPointInsideAnyCollider(x, y, colliders) {

        if (!Array.isArray(colliders) || colliders.length === 0) {

            return false;

        }

        for (const rect of colliders) {

            if (!rect) {

                continue;

            }

            const left = Number(rect.left ?? rect.x ?? 0);

            const right = Number(rect.right ?? ((rect.width != null) ? left + Number(rect.width) : left));

            const top = Number(rect.top ?? rect.y ?? 0);

            const bottom = Number(rect.bottom ?? ((rect.height != null) ? top + Number(rect.height) : top));

            if (!Number.isFinite(left) || !Number.isFinite(right) || !Number.isFinite(top) || !Number.isFinite(bottom)) {

                continue;

            }

            if (left > right || top > bottom) {

                continue;

            }

            if (x >= left && x <= right && y >= top && y <= bottom) {

                return true;

            }

        }

        return false;

    }


    ensureNpcMovementTracker(npc, timestamp) {

        if (!npc) {

            return null;

        }

        const time = Number.isFinite(timestamp) ? timestamp : ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now());

        if (!npc._movementTracker) {

            npc._movementTracker = {

                samplePosition: { x: npc.x, y: npc.y },

                sampleTime: time,

                lastUpdateTime: time,

                idleTime: 0,

                motionThreshold: 0.45,

                idleThreshold: 3500,

                sampleWindow: 4000,

                minDisplacement: 12,

                stuckSamples: 0,

                maxStuckSamples: 2,

                teleportCooldown: 4000,

                lastTeleportAt: -Infinity,

            };

        } else {

            const tracker = npc._movementTracker;

            if (typeof tracker.motionThreshold !== 'number') {

                tracker.motionThreshold = 0.45;

            }

            if (typeof tracker.idleThreshold !== 'number') {

                tracker.idleThreshold = 3500;

            }

            if (typeof tracker.sampleWindow !== 'number') {

                tracker.sampleWindow = 4000;

            }

            if (typeof tracker.minDisplacement !== 'number') {

                tracker.minDisplacement = 12;

            }

            if (typeof tracker.maxStuckSamples !== 'number') {

                tracker.maxStuckSamples = 2;

            }

            if (typeof tracker.teleportCooldown !== 'number') {

                tracker.teleportCooldown = 4000;

            }

            if (typeof tracker.stuckSamples !== 'number') {

                tracker.stuckSamples = 0;

            }

            if (typeof tracker.lastTeleportAt !== 'number') {

                tracker.lastTeleportAt = -Infinity;

            }

        }

        return npc._movementTracker;

    }

    updateNpcMovementTracker(npc, stepDistance, timestamp) {

        const tracker = this.ensureNpcMovementTracker(npc, timestamp);

        if (!tracker) {

            return null;

        }

        const time = Number.isFinite(timestamp) ? timestamp : tracker.lastUpdateTime;

        const delta = Math.max(0, time - tracker.lastUpdateTime);

        tracker.lastUpdateTime = time;

        const motionThreshold = tracker.motionThreshold ?? 0.45;

        if (npc.waitTimer > 0) {

            tracker.idleTime = 0;

        } else if (stepDistance <= motionThreshold) {

            tracker.idleTime += delta;

        } else {

            tracker.idleTime = 0;

        }

        if (!tracker.samplePosition) {

            tracker.samplePosition = { x: npc.x, y: npc.y };

            tracker.sampleTime = time;

        }

        const sampleWindow = tracker.sampleWindow ?? 4000;

        if (time - tracker.sampleTime >= sampleWindow) {

            const displacement = Math.hypot(npc.x - tracker.samplePosition.x, npc.y - tracker.samplePosition.y);

            tracker.samplePosition = { x: npc.x, y: npc.y };

            tracker.sampleTime = time;

            if (npc.waitTimer === 0 && displacement < (tracker.minDisplacement ?? 12)) {

                tracker.stuckSamples = Math.min((tracker.stuckSamples ?? 0) + 1, tracker.maxStuckSamples ?? 2);

            } else {

                tracker.stuckSamples = Math.max(0, (tracker.stuckSamples ?? 0) - 1);

            }

        }

        return tracker;

    }

    findNearestSidewalkSpot(x, y, options = {}) {

        const walkableRects = this.getWalkableRectangles();

        const buildingColliders = this.buildingColliders;

        const vehicleColliders = this.collectVehicleColliders();

        const minDistance = Math.max(0, Number(options.minDistance) || 0);

        const minDistSq = minDistance * minDistance;

        const candidates = [];

        const addCandidate = (px, py) => {

            if (!Number.isFinite(px) || !Number.isFinite(py)) {

                return;

            }

            if (this.isPointInsideAnyCollider(px, py, buildingColliders)) {

                return;

            }

            for (const vehicle of vehicleColliders) {

                if (!vehicle) {

                    continue;

                }

                if (px >= vehicle.left - 6 && px <= vehicle.right + 6 && py >= vehicle.top - 6 && py <= vehicle.bottom + 6) {

                    return;

                }

            }

            candidates.push({ x: px, y: py });

        };

        const projection = this.projectPointToSidewalk(x, y);

        if (projection && projection.inside) {

            addCandidate(projection.x, projection.y);

        }

        if (walkableRects.length) {

            for (const rect of walkableRects) {

                if (!rect) {

                    continue;

                }

                const clamped = this.clampPointToRect(x, y, rect);

                const resolved = this.pushPointOutOfObstacles(clamped, rect);

                addCandidate(resolved.x, resolved.y);

                const bounds = resolveRectBounds(rect);

                if (bounds) {

                    addCandidate(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);

                }

            }

        } else if (projection) {

            addCandidate(projection.x, projection.y);

        }

        let best = null;

        let bestDistSq = Infinity;

        for (const candidate of candidates) {

            const dx = candidate.x - x;

            const dy = candidate.y - y;

            const distSq = dx * dx + dy * dy;

            if (distSq < minDistSq) {

                continue;

            }

            if (distSq < bestDistSq) {

                bestDistSq = distSq;

                best = candidate;

            }

        }

        if (!best && minDistance > 0) {

            return this.findNearestSidewalkSpot(x, y, { ...options, minDistance: 0 });

        }

        return best;

    }

    getBuildingSidewalkExit(buildingId) {

        if (!buildingId) {

            return null;

        }

        const buildings = Array.isArray(this.buildings) ? this.buildings : [];

        const building = buildings.find((entry) => entry && (entry.id === buildingId || entry.name === buildingId));

        if (!building) {

            return null;

        }

        const metrics = building.metrics ?? (typeof this.computeHouseMetrics === 'function' ? this.computeHouseMetrics(building) : null);

        if (metrics && metrics.approach) {

            return { x: metrics.approach.x, y: metrics.approach.y };

        }

        if (metrics && metrics.entrance) {

            return { x: metrics.entrance.x, y: metrics.entrance.y + 6 };

        }

        if (metrics && metrics.bounds) {

            const bounds = metrics.bounds;

            if (bounds && Number.isFinite(bounds.left) && Number.isFinite(bounds.right) && Number.isFinite(bounds.bottom)) {

                return { x: (bounds.left + bounds.right) / 2, y: bounds.bottom + 12 };

            }

        }

        if (building.bounds && Number.isFinite(building.bounds.left) && Number.isFinite(building.bounds.right) && Number.isFinite(building.bounds.bottom)) {

            return { x: (building.bounds.left + building.bounds.right) / 2, y: building.bounds.bottom + 12 };

        }

        const baseX = Number(building.x);

        const baseY = Number(building.y);

        const width = Number(building.width);

        const height = Number(building.height);

        if (Number.isFinite(baseX) && Number.isFinite(baseY) && Number.isFinite(width) && Number.isFinite(height)) {

            return { x: baseX + width / 2, y: baseY + height + 12 };

        }

        return null;

    }

    teleportNpcToNearestSidewalk(npc, reason, timestamp) {

        if (!npc) {

            return false;

        }

        const tracker = this.ensureNpcMovementTracker(npc, timestamp);

        if (!tracker) {

            return false;

        }

        const time = Number.isFinite(timestamp) ? timestamp : tracker.lastUpdateTime ?? ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now());

        const cooldown = Number(tracker.teleportCooldown) || 4000;

        if (time - tracker.lastTeleportAt < cooldown) {

            return false;

        }

        let searchX = npc.x;

        let searchY = npc.y;

        let minDistance = reason === 'idle' ? 26 : 14;

        let buildingIdForTeleport = null;

        if (reason === 'building') {

            buildingIdForTeleport = npc.insideBuilding || npc._lastCollision?.buildingId || npc.lastBuildingId || null;

            const exit = this.getBuildingSidewalkExit(buildingIdForTeleport);

            if (exit) {

                searchX = exit.x;

                searchY = exit.y;

                minDistance = Math.max(minDistance, 22);

            }

        }

        let candidate = this.findNearestSidewalkSpot(searchX, searchY, { minDistance });

        if (!candidate) {

            candidate = this.findNearestSidewalkSpot(npc.x, npc.y, { minDistance: 0 });

        }

        if (!candidate) {

            return false;

        }

        const resolved = this.resolveNpcMovement(npc, candidate.x, candidate.y, candidate.x, candidate.y);

        npc.x = resolved.x;

        npc.y = resolved.y;

        npc.waitTimer = 0;

        npc.hidden = false;

        npc.insideBuilding = null;

        npc._lastCollision = null;

        if (buildingIdForTeleport) {

            npc.lastBuildingId = buildingIdForTeleport;

        }

        tracker.lastTeleportAt = time;

        tracker.idleTime = 0;

        tracker.stuckSamples = 0;

        tracker.samplePosition = { x: npc.x, y: npc.y };

        tracker.sampleTime = time;

        return true;

    }

    updateNpcPanicMovement(npc) {

        if (!npc) {

            return;

        }

        const originX = npc.x;

        const originY = npc.y;

        let awayX = npc.x - this.player.x;

        let awayY = npc.y - this.player.y;

        let length = Math.hypot(awayX, awayY);

        if (length < 1) {

            const angle = Math.random() * Math.PI * 2;

            awayX = Math.cos(angle);

            awayY = Math.sin(angle);

            length = 1;

        }

        const baseSpeed = npc.speed ?? 1.2;

        const panicSpeed = baseSpeed * 2.2;

        const targetX = originX + (awayX / length) * panicSpeed;

        const targetY = originY + (awayY / length) * panicSpeed;

        const movement = this.resolveNpcMovement(npc, targetX, targetY, originX, originY);

        npc.x = movement.x;

        npc.y = movement.y;

        npc._lastCollision = movement.collisionInfo;

        if (npc._lastCollision && npc._lastCollision.buildingId) {

            npc.lastBuildingId = npc._lastCollision.buildingId;

        }

        if (typeof this.applySidewalkConstraint === "function") {

            this.applySidewalkConstraint(npc);

        }

        if (npc.bounds) {

            npc.x = Math.max(npc.bounds.left, Math.min(npc.x, npc.bounds.right));

            npc.y = Math.max(npc.bounds.top, Math.min(npc.y, npc.bounds.bottom));

        }

        let moved = Boolean(movement.moved);

        const collisionInfo = movement.collisionInfo;

        if (!moved || (collisionInfo && collisionInfo.insideBuilding)) {

            const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();

            if (this.teleportNpcToNearestSidewalk(npc, (collisionInfo && collisionInfo.insideBuilding) ? "building" : "idle", now)) {

                moved = true;

            }

        }

        npc.moving = moved;

        npc.waitTimer = 0;

        npc.isCrossing = false;

        npc.waitingForCrosswalk = null;

        npc.animationPhase = (npc.animationPhase + panicSpeed * 0.07) % (Math.PI * 2);

        npc.panicTimer = Math.max(0, (npc.panicTimer ?? 0) - 1);

        if (npc.panicTimer === 0) {

            npc.waitTimer = 45;

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

                if (!npc || npc.dead) {

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

    drawWalkableAreasOverlay() {

        const areas = Array.isArray(this.walkableAreas) ? this.walkableAreas : [];

        if (!areas.length) {

            return;

        }

        this.ctx.save();

        this.ctx.fillStyle = "rgba(255, 120, 120, 0.18)";

        this.ctx.beginPath();

        for (const area of areas) {

            const bounds = resolveRectBounds(area);

            if (!bounds) {

                continue;

            }

            this.ctx.rect(bounds.left, bounds.top, bounds.width, bounds.height);

        }

        this.ctx.fill();

        this.ctx.restore();

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



    getPlayerCenter() {
        const width = this.player.width ?? 30;
        const height = this.player.height ?? 30;

        if (this.scene === "weaponShop") {
            return { x: this.player.x, y: this.player.y };
        }

        return { x: this.player.x + width / 2, y: this.player.y + height / 2 };
    }

    drawEquippedWeaponModel(renderable) {
        const weapon = this.getCurrentWeapon();

        if (!weapon || !this.weaponInventory.has(weapon.id)) {
            return;
        }

        const center = this.getPlayerCenter();
        const animationPhase = renderable?.animationPhase ?? 0;
        const moving = Boolean(renderable?.moving);
        const bob = moving ? Math.abs(Math.cos(animationPhase)) * 1.2 : 0;

        const originX = renderable?.x ?? center.x;
        const originY = (renderable?.y ?? center.y) - bob - 4;

        let aimX = (this.mouse.worldX ?? center.x) - center.x;
        let aimY = (this.mouse.worldY ?? center.y) - center.y;

        if (!Number.isFinite(aimX) || !Number.isFinite(aimY)) {
            aimX = 1;
            aimY = 0;
        }

        let angle = Math.atan2(aimY, aimX);
        if (!Number.isFinite(angle)) {
            angle = 0;
        }

        const baseColor = "#1d1f24";
        const accentColor = weapon.displayColor ?? "#ffd166";

        this.ctx.save();
        this.ctx.translate(originX, originY);
        this.ctx.rotate(angle);

        if (weapon.id === "assaultRifle") {
            const thickness = 8;
            const bodyLength = 48;
            const barrelLength = 14;

            this.ctx.fillStyle = baseColor;
            this.ctx.fillRect(-18, -thickness / 2, bodyLength, thickness);
            this.ctx.fillRect(bodyLength - 18, -thickness * 0.35, barrelLength, thickness * 0.7);
            this.ctx.fillRect(-30, -thickness * 0.45, 12, thickness * 0.9);
            this.ctx.fillRect(-30, -thickness * 0.2, 12, thickness * 0.6);
            this.ctx.fillStyle = accentColor;
            this.ctx.fillRect(6, thickness * 0.2, 6, thickness);
        } else if (weapon.id === "shotgun") {
            const thickness = 9;
            const bodyLength = 44;
            const barrelLength = 18;

            this.ctx.fillStyle = baseColor;
            this.ctx.fillRect(-22, -thickness / 2, bodyLength, thickness);
            this.ctx.fillRect(bodyLength - 22, -thickness * 0.3, barrelLength, thickness * 0.6);
            this.ctx.fillRect(-32, -thickness * 0.2, 12, thickness * 0.4);
            this.ctx.fillStyle = accentColor;
            this.ctx.fillRect(-8, -thickness * 0.4, 14, thickness * 0.8);
        } else {
            const thickness = 6;
            const bodyLength = 26;
            const barrelLength = 10;

            this.ctx.fillStyle = baseColor;
            this.ctx.fillRect(-8, -thickness / 2, bodyLength, thickness);
            this.ctx.fillRect(bodyLength - 8, -thickness * 0.3, barrelLength, thickness * 0.6);
            this.ctx.fillStyle = accentColor;
            this.ctx.fillRect(-6, -thickness / 2, 4, thickness);
        }

        this.ctx.restore();
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

        if (!npc || npc.hidden) {

            return;

        }

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

    computeHouseMetrics(building) {

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

        const palettes = Array.isArray(this.houseStyles) ? this.houseStyles : [];

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

        const boundsBottom = Math.max(boundsTop + minBoundsHeight, approachY + Math.max(16, walkwayHeight * 0.2));

        return {

            houseX,

            houseY,

            houseWidth,

            houseHeight,

            houseBottom,

            roofDepth,

            facadeTop,

            facadeHeight,

            frontDepth,

            walkway: {

                x: walkwayX,

                y: walkwayY,

                width: walkwayWidth,

                height: walkwayHeight

            },

            door: {

                x: doorX,

                y: doorY,

                width: doorWidth,

                height: doorHeight,

                world: {

                    x: doorWorldX,

                    y: doorWorldCenterY,

                    bottom: doorWorldBottom,

                    insideY: doorWorldInsideY

                }

            },

            entrance: {

                x: doorWorldX,

                y: entranceY

            },

            approach: {

                x: doorWorldX,

                y: approachY

            },

            interior: {

                x: interiorX,

                y: interiorY

            },

            bounds: {

                left: boundsLeft,

                right: boundsRight,

                top: boundsTop,

                bottom: boundsBottom

            },

            palette

        };

    }

    drawHouseWindowInterior(building, x, y, width, height, rowIndex, colIndex) {

        if (!this.ctx) {

            return;

        }

        this.ctx.save();

        this.ctx.beginPath();

        this.ctx.rect(x, y, width, height);

        this.ctx.clip();

        const base = this.ctx.createLinearGradient(x, y, x, y + height);

        base.addColorStop(0, "rgba(30, 36, 48, 0.92)");

        base.addColorStop(1, "rgba(16, 18, 28, 0.94)");

        this.ctx.fillStyle = base;

        this.ctx.fillRect(x, y, width, height);

        const floorY = y + height * 0.85;

        this.ctx.fillStyle = "rgba(52, 40, 36, 0.82)";

        this.ctx.fillRect(x - width * 0.1, floorY, width * 1.2, height - (floorY - y));

        const baseX = Number(building?.x ?? 0);

        const baseY = Number(building?.y ?? 0);

        const seedX = baseX * 0.013 + rowIndex * 0.37 + colIndex * 0.19;

        const seedY = baseY * 0.017 + rowIndex * 0.29 + colIndex * 0.41;

        const theme = this.pseudoRandom2D(seedX, seedY);

        const glow = this.pseudoRandom2D(seedX + 4.71, seedY + 8.12);

        if (glow > 0.32) {

            const glowGradient = this.ctx.createRadialGradient(

                x + width / 2,

                y + height * 0.35,

                width * 0.05,

                x + width / 2,

                y + height * 0.35,

                width * 0.65

            );

            glowGradient.addColorStop(0, `rgba(255, 224, 170, ${0.32 + glow * 0.28})`);

            glowGradient.addColorStop(1, "rgba(255, 224, 170, 0)");

            this.ctx.fillStyle = glowGradient;

            this.ctx.fillRect(x, y, width, height);

        }

        if (theme < 0.33) {

            const potWidth = width * 0.32;

            const potHeight = height * 0.18;

            const potX = x + width * 0.5 - potWidth / 2 + (theme - 0.16) * width * 0.2;

            const potY = floorY - potHeight;

            this.ctx.fillStyle = "rgba(120, 72, 44, 0.9)";

            this.ctx.fillRect(potX, potY, potWidth, potHeight);

            const stemHeight = height * 0.42;

            this.ctx.strokeStyle = "rgba(46, 104, 64, 0.9)";

            this.ctx.lineWidth = Math.max(2, width * 0.06);

            this.ctx.beginPath();

            this.ctx.moveTo(potX + potWidth / 2, potY);

            this.ctx.lineTo(potX + potWidth / 2, potY - stemHeight);

            this.ctx.stroke();

            const leafCount = 3;

            for (let i = 0; i < leafCount; i++) {

                const leafAngle = (i - 1) * 0.55;

                const leafLength = width * (0.35 + i * 0.06);

                this.ctx.fillStyle = "rgba(68, 128, 78, 0.85)";

                this.ctx.beginPath();

                const leafBaseY = potY - stemHeight * (0.35 + i * 0.22);

                const leafBaseX = potX + potWidth / 2;

                this.ctx.moveTo(leafBaseX, leafBaseY);

                this.ctx.quadraticCurveTo(leafBaseX + Math.cos(leafAngle) * leafLength, leafBaseY - Math.sin(leafAngle) * height * 0.2, leafBaseX + Math.cos(leafAngle) * leafLength * 0.6, leafBaseY - Math.sin(leafAngle) * height * 0.1);

                this.ctx.quadraticCurveTo(leafBaseX + Math.cos(leafAngle) * leafLength * 0.2, leafBaseY - Math.sin(leafAngle) * height * 0.05, leafBaseX, leafBaseY);

                this.ctx.fill();

            }

        } else if (theme < 0.66) {

            const shelfWidth = width * 0.6;

            const shelfHeight = height * 0.7;

            const shelfX = x + width * 0.2 + (theme - 0.5) * width * 0.1;

            const shelfY = y + height * 0.22;

            this.ctx.fillStyle = "rgba(70, 52, 42, 0.85)";

            this.ctx.fillRect(shelfX, shelfY, shelfWidth, shelfHeight);

            const shelfCount = 3;

            for (let level = 1; level < shelfCount; level++) {

                const shelfLineY = shelfY + (shelfHeight / shelfCount) * level;

                this.ctx.fillStyle = "rgba(45, 32, 26, 0.9)";

                this.ctx.fillRect(shelfX + 4, shelfLineY - 2, shelfWidth - 8, 4);

            }

            const bookSeed = this.pseudoRandom2D(seedX + 9.1, seedY + 3.7);

            const bookCount = 5 + Math.round(bookSeed * 3);

            for (let book = 0; book < bookCount; book++) {

                const lane = book % shelfCount;

                const sectionHeight = shelfHeight / shelfCount;

                const bx = shelfX + 8 + (book / Math.max(1, bookCount - 1)) * (shelfWidth - 16 - width * 0.1);

                const by = shelfY + lane * sectionHeight + 6;

                const bh = sectionHeight - 12;

                const bw = width * 0.1;

                const hueSeed = this.pseudoRandom2D(seedX + book * 3.2, seedY + book * 4.4);

                const color = hueSeed < 0.33 ? "rgba(180, 120, 90, 0.9)" : hueSeed < 0.66 ? "rgba(90, 120, 170, 0.9)" : "rgba(200, 180, 110, 0.9)";

                this.ctx.fillStyle = color;

                this.ctx.fillRect(bx, by, bw, bh);

            }

        } else {

            const sofaWidth = width * 0.75;

            const sofaHeight = height * 0.28;

            const sofaX = x + width * 0.125;

            const sofaY = floorY - sofaHeight;

            this.ctx.fillStyle = "rgba(120, 64, 82, 0.85)";

            this.ctx.fillRect(sofaX, sofaY, sofaWidth, sofaHeight);

            this.ctx.fillStyle = "rgba(90, 42, 60, 0.9)";

            this.ctx.fillRect(sofaX, sofaY - sofaHeight * 0.55, sofaWidth, sofaHeight * 0.55);

            const cushionCount = 3;

            const cushionWidth = sofaWidth / cushionCount - width * 0.04;

            for (let cushion = 0; cushion < cushionCount; cushion++) {

                const cx = sofaX + width * 0.02 + cushion * (cushionWidth + width * 0.02);

                this.ctx.fillStyle = "rgba(220, 200, 200, 0.6)";

                this.ctx.fillRect(cx, sofaY - sofaHeight * 0.4, cushionWidth, sofaHeight * 0.22);

            }

            const lampX = x + width * 0.82;

            const lampBaseY = floorY - sofaHeight * 0.2;

            this.ctx.strokeStyle = "rgba(180, 170, 150, 0.8)";

            this.ctx.lineWidth = Math.max(1.5, width * 0.04);

            this.ctx.beginPath();

            this.ctx.moveTo(lampX, lampBaseY);

            this.ctx.lineTo(lampX, y + height * 0.2);

            this.ctx.stroke();

            const shadeRadiusX = width * 0.18;

            const shadeRadiusY = height * 0.12;

            const shadeCenterY = y + height * 0.22;

            const shadeCenterX = lampX;

            this.ctx.fillStyle = "rgba(255, 220, 170, 0.78)";

            this.ctx.beginPath();

            this.ctx.ellipse(shadeCenterX, shadeCenterY, shadeRadiusX, shadeRadiusY, 0, 0, Math.PI * 2);

            this.ctx.fill();

        }

        const occupantChance = this.pseudoRandom2D(seedX + 5.31, seedY + 12.77);

        if (occupantChance > 0.82) {

            const bodyWidth = width * 0.32;

            const bodyX = x + width * 0.5 - bodyWidth / 2 + (occupantChance - 0.9) * width * 0.25;

            const bodyY = y + height * 0.34;

            const bodyHeight = height * 0.42;

            this.ctx.fillStyle = "rgba(26, 30, 38, 0.75)";

            this.ctx.fillRect(bodyX, bodyY, bodyWidth, bodyHeight);

            this.ctx.beginPath();

            this.ctx.ellipse(bodyX + bodyWidth / 2, bodyY - height * 0.16, bodyWidth * 0.38, height * 0.22, 0, 0, Math.PI * 2);

            this.ctx.fill();

        }

        this.ctx.restore();

    }

    drawHouseWindowFrame(building, x, y, width, height, palette = {}) {

        if (!this.ctx) {

            return;

        }

        const frameThickness = Math.max(2, Math.min(6, width * 0.18));

        const sillHeight = Math.max(3, height * 0.08);

        const frameColor = palette.windowFrame ?? "rgba(28, 32, 40, 0.78)";

        this.ctx.save();

        this.ctx.fillStyle = frameColor;

        this.ctx.fillRect(x - frameThickness, y - frameThickness, width + frameThickness * 2, frameThickness);

        this.ctx.fillRect(x - frameThickness, y + height, width + frameThickness * 2, Math.max(2, frameThickness * 0.7));

        this.ctx.fillRect(x - frameThickness, y, frameThickness, height);

        this.ctx.fillRect(x + width, y, frameThickness, height);

        this.ctx.fillStyle = "rgba(18, 20, 26, 0.65)";

        this.ctx.fillRect(x - frameThickness, y + height - sillHeight, width + frameThickness * 2, sillHeight + Math.max(2, frameThickness * 0.5));

        const highlight = this.ctx.createLinearGradient(x - frameThickness, y - frameThickness, x + width + frameThickness, y - frameThickness + frameThickness);

        highlight.addColorStop(0, "rgba(255, 255, 255, 0.12)");

        highlight.addColorStop(1, "rgba(255, 255, 255, 0)");

        this.ctx.fillStyle = highlight;

        this.ctx.fillRect(x - frameThickness, y - frameThickness, width + frameThickness * 2, frameThickness);

        this.ctx.restore();

    }

    drawHouseWindowDressing(building, x, y, width, height, rowIndex, colIndex, palette = {}) {

        if (!this.ctx) {

            return;

        }

        const baseX = Number(building?.x ?? 0);

        const baseY = Number(building?.y ?? 0);

        const seedA = baseX * 0.021 + rowIndex * 0.37 + colIndex * 0.13;

        const seedB = baseY * 0.023 + rowIndex * 0.21 + colIndex * 0.29;

        const curtainChoice = this.pseudoRandom2D(seedA, seedB);

        const blindChoice = this.pseudoRandom2D(seedA + 2.71, seedB + 3.19);

        const lampChoice = this.pseudoRandom2D(seedA + 1.37, seedB + 5.61);

        this.ctx.save();

        this.ctx.beginPath();

        this.ctx.rect(x, y, width, height);

        this.ctx.clip();

        if (lampChoice > 0.78) {

            const glow = this.ctx.createRadialGradient(x + width * 0.5, y + height * 0.45, width * 0.08, x + width * 0.5, y + height * 0.45, width * 0.9);

            glow.addColorStop(0, "rgba(255, 214, 170, " + (0.2 + lampChoice * 0.25).toFixed(3) + ")");

            glow.addColorStop(1, "rgba(255, 214, 170, 0)");

            this.ctx.fillStyle = glow;

            this.ctx.fillRect(x, y, width, height);

        }

        if (curtainChoice > 0.64) {

            const curtainPalette = [

                "rgba(224, 186, 176, 0.72)",

                "rgba(188, 196, 220, 0.7)",

                "rgba(216, 188, 210, 0.72)",

                "rgba(210, 200, 166, 0.7)"

            ];

            const curtainIndex = Math.floor(curtainChoice * curtainPalette.length) % curtainPalette.length;

            const curtainColor = curtainPalette[curtainIndex];

            const curtainGradient = this.ctx.createLinearGradient(x, y, x, y + height);

            curtainGradient.addColorStop(0, curtainColor);

            curtainGradient.addColorStop(1, "rgba(48, 34, 30, 0.7)");

            const curtainWidth = width * 0.36;

            this.ctx.fillStyle = curtainGradient;

            this.ctx.beginPath();

            this.ctx.moveTo(x - width * 0.02, y);

            this.ctx.lineTo(x + curtainWidth, y + height * 0.18);

            this.ctx.lineTo(x + curtainWidth * 0.92, y + height);

            this.ctx.lineTo(x - width * 0.02, y + height);

            this.ctx.closePath();

            this.ctx.fill();

            this.ctx.beginPath();

            const rightStart = x + width - curtainWidth;

            this.ctx.moveTo(x + width + width * 0.02, y);

            this.ctx.lineTo(rightStart, y + height * 0.18);

            this.ctx.lineTo(rightStart + curtainWidth * 0.08, y + height);

            this.ctx.lineTo(x + width + width * 0.02, y + height);

            this.ctx.closePath();

            this.ctx.fill();

        } else if (blindChoice > 0.38) {

            const slatCount = 5 + Math.round(blindChoice * 6);

            const slatHeight = Math.max(2, height / (slatCount * 1.8));

            for (let slat = 0; slat < slatCount; slat++) {

                const t = slat / Math.max(1, slatCount - 1);

                const tone = 0.28 + t * 0.18;

                this.ctx.fillStyle = "rgba(214, 218, 228, " + tone.toFixed(3) + ")";

                const slatY = y + t * (height - slatHeight);

                this.ctx.fillRect(x, slatY, width, slatHeight);

            }

            this.ctx.strokeStyle = "rgba(120, 126, 138, 0.4)";

            this.ctx.lineWidth = Math.max(1, width * 0.02);

            this.ctx.beginPath();

            this.ctx.moveTo(x + width - width * 0.12, y);

            this.ctx.lineTo(x + width - width * 0.12, y + height);

            this.ctx.stroke();

        } else {

            const sheer = this.ctx.createLinearGradient(x, y, x + width, y + height);

            sheer.addColorStop(0, "rgba(238, 240, 248, 0.26)");

            sheer.addColorStop(1, "rgba(198, 210, 226, 0.18)");

            this.ctx.fillStyle = sheer;

            this.ctx.fillRect(x, y, width, height);

            this.ctx.fillStyle = "rgba(118, 132, 158, 0.15)";

            this.ctx.fillRect(x + width * 0.44, y, width * 0.12, height);

        }

        const pelmetHeight = Math.max(2, height * 0.06);

        this.ctx.fillStyle = "rgba(14, 14, 20, 0.45)";

        this.ctx.fillRect(x, y, width, pelmetHeight);

        this.ctx.restore();

    }

    drawHouseFacadeLighting(building, metrics, palette = {}) {

        if (!this.ctx || !metrics) {

            return;

        }

        const { houseX, houseWidth, facadeTop, facadeHeight, houseBottom } = metrics;

        const baseX = Number(building?.x ?? 0);

        const baseY = Number(building?.y ?? 0);

        const highlightSeed = this.pseudoRandom2D(baseX * 0.0087 + facadeHeight * 0.0001, baseY * 0.0091 + houseWidth * 0.0001);

        const floors = Math.max(2, Math.round(building?.variant?.floors ?? palette.floors ?? 4));

        this.ctx.save();

        const aoWidth = Math.max(16, houseWidth * 0.08);

        const leftShade = this.ctx.createLinearGradient(houseX, facadeTop, houseX + aoWidth, facadeTop);

        leftShade.addColorStop(0, "rgba(0, 0, 0, 0.28)");

        leftShade.addColorStop(1, "rgba(0, 0, 0, 0)");

        this.ctx.fillStyle = leftShade;

        this.ctx.fillRect(houseX, facadeTop, aoWidth, facadeHeight);

        const highlightWidth = Math.max(12, houseWidth * 0.06);

        const rightHighlight = this.ctx.createLinearGradient(houseX + houseWidth - highlightWidth, facadeTop, houseX + houseWidth, facadeTop);

        rightHighlight.addColorStop(0, "rgba(255, 230, 200, 0.24)");

        rightHighlight.addColorStop(1, "rgba(255, 230, 200, 0)");

        this.ctx.fillStyle = rightHighlight;

        this.ctx.fillRect(houseX + houseWidth - highlightWidth, facadeTop, highlightWidth, facadeHeight);

        const baseShadowHeight = Math.max(18, facadeHeight * 0.12);

        const baseShadow = this.ctx.createLinearGradient(houseX, houseBottom - baseShadowHeight, houseX, houseBottom);

        baseShadow.addColorStop(0, "rgba(0, 0, 0, 0)");

        baseShadow.addColorStop(1, "rgba(0, 0, 0, 0.25)");

        this.ctx.fillStyle = baseShadow;

        this.ctx.fillRect(houseX, houseBottom - baseShadowHeight, houseWidth, baseShadowHeight);

        const floorSpacing = facadeHeight / floors;

        this.ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";

        this.ctx.lineWidth = 1;

        for (let level = 1; level < floors; level++) {

            const y = facadeTop + level * floorSpacing;

            this.ctx.beginPath();

            this.ctx.moveTo(houseX + 8, y);

            this.ctx.lineTo(houseX + houseWidth - 8, y);

            this.ctx.stroke();

        }

        const columnCount = Math.max(3, Math.floor(houseWidth / 70));

        for (let column = 1; column < columnCount; column++) {

            const columnX = houseX + column * (houseWidth / columnCount);

            const columnSeed = this.pseudoRandom2D(highlightSeed + column * 1.7, highlightSeed + column * 2.5);

            const intensity = 0.04 + columnSeed * 0.08;

            this.ctx.fillStyle = "rgba(255, 255, 255, " + intensity.toFixed(3) + ")";

            this.ctx.fillRect(columnX - 1, facadeTop + 6, 2, facadeHeight - 12);

        }

        const textureSeed = highlightSeed * 137.31;

        const textureCount = Math.min(90, Math.round(houseWidth * facadeHeight / 550));

        this.ctx.globalAlpha = 0.08;

        this.ctx.fillStyle = "rgba(0, 0, 0, 1)";

        for (let i = 0; i < textureCount; i++) {

            const noiseX = this.pseudoRandom2D(textureSeed + i * 1.13, textureSeed + i * 2.19);

            const noiseY = this.pseudoRandom2D(textureSeed + i * 3.17, textureSeed + i * 4.41);

            const px = houseX + noiseX * houseWidth;

            const py = facadeTop + noiseY * facadeHeight;

            const sizeSeed = this.pseudoRandom2D(textureSeed + i * 5.23, textureSeed + i * 6.37);

            const size = Math.max(1, Math.min(3, sizeSeed * 3));

            this.ctx.fillRect(px, py, size, size * 0.6);

        }

        this.ctx.globalAlpha = 1;

        const highlightCenterX = houseX + highlightSeed * houseWidth * 0.8 + houseWidth * 0.1;

        const highlightCenterY = facadeTop + (0.2 + highlightSeed * 0.5) * facadeHeight;

        const specular = this.ctx.createRadialGradient(highlightCenterX, highlightCenterY, houseWidth * 0.05, highlightCenterX, highlightCenterY, houseWidth * 0.45);

        specular.addColorStop(0, "rgba(255, 235, 210, 0.12)");

        specular.addColorStop(1, "rgba(255, 235, 210, 0)");

        this.ctx.fillStyle = specular;

        this.ctx.fillRect(houseX, facadeTop, houseWidth, facadeHeight);

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

        const walkwayGradient = this.ctx.createLinearGradient(walkwayX, walkwayY, walkwayX, walkwayY + walkwayHeight);

        walkwayGradient.addColorStop(0, "#e3dbd0");

        walkwayGradient.addColorStop(1, "#c2b7a3");

        this.ctx.fillStyle = walkwayGradient;

        this.ctx.fillRect(walkwayX, walkwayY, walkwayWidth, walkwayHeight);

        this.drawSidewalkPatternRect(walkwayX, walkwayY, walkwayWidth, walkwayHeight);

        this.ctx.fillStyle = "rgba(0, 0, 0, 0.16)";

        this.ctx.fillRect(walkwayX, walkwayY, walkwayWidth, 3);

        this.ctx.fillStyle = "rgba(255, 255, 255, 0.18)";

        this.ctx.fillRect(walkwayX + 4, walkwayY, walkwayWidth - 8, 2);

        this.ctx.fillStyle = "rgba(0, 0, 0, 0.12)";

        this.ctx.fillRect(walkwayX, walkwayY + Math.max(2, walkwayHeight - 3), walkwayWidth, 3);

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

        const planterSeed = this.pseudoRandom2D(Number(building.x ?? 0) * 0.0127, Number(building.y ?? 0) * 0.0173);

        if (planterSeed > 0.58 && walkwayWidth > 26) {

            const planterWidth = Math.max(18, walkwayWidth * 0.32);

            const planterHeight = Math.max(14, walkwayHeight * 0.55);

            const planterY = walkwayY + walkwayHeight - planterHeight - Math.max(3, walkwayHeight * 0.1);

            const soilHeight = Math.max(3, planterHeight * 0.28);

            const drawPlanter = (baseX, seedOffset) => {

                this.ctx.fillStyle = "rgba(70, 56, 42, 0.85)";

                this.ctx.fillRect(baseX, planterY, planterWidth, planterHeight);

                this.ctx.fillStyle = "rgba(26, 28, 22, 0.88)";

                this.ctx.fillRect(baseX, planterY + planterHeight - soilHeight, planterWidth, soilHeight);

                const foliageCount = 4 + Math.round(this.pseudoRandom2D(seedOffset + 0.77, seedOffset + 1.91) * 3);

                for (let plant = 0; plant < foliageCount; plant++) {

                    const t = (plant + 0.5) / foliageCount;

                    const plantSeed = this.pseudoRandom2D(seedOffset + plant * 1.33, seedOffset + plant * 2.61);

                    const plantHeight = planterHeight * (0.45 + plantSeed * 0.55);

                    const plantX = baseX + 4 + t * (planterWidth - 8);

                    const plantColor = plantSeed > 0.5 ? "rgba(58, 134, 82, 0.88)" : "rgba(88, 162, 102, 0.82)";

                    this.ctx.fillStyle = plantColor;

                    this.ctx.beginPath();

                    this.ctx.moveTo(plantX, planterY + planterHeight - soilHeight);

                    this.ctx.lineTo(plantX - 4, planterY + planterHeight - soilHeight - plantHeight * 0.5);

                    this.ctx.lineTo(plantX + 4, planterY + planterHeight - soilHeight - plantHeight);

                    this.ctx.closePath();

                    this.ctx.fill();

                }

            };

            drawPlanter(walkwayX - planterWidth - 8, planterSeed);

            drawPlanter(walkwayX + walkwayWidth + 8, planterSeed + 1.37);

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

        const facadeMetrics = { houseX, houseWidth, facadeTop, facadeHeight, houseBottom };

        this.drawHouseFacadeLighting(building, facadeMetrics, palette);

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

                this.drawHouseWindowFrame(building, wx, wy, windowWidth, windowHeight, palette);

                this.drawHouseWindowInterior(building, wx, wy, windowWidth, windowHeight, row, col);

                this.drawHouseWindowDressing(building, wx, wy, windowWidth, windowHeight, row, col, palette);

                const glassGradient = this.ctx.createLinearGradient(wx, wy, wx, wy + windowHeight);

                glassGradient.addColorStop(0, "rgba(220, 236, 255, 0.55)");

                glassGradient.addColorStop(0.45, "rgba(140, 180, 210, 0.32)");

                glassGradient.addColorStop(1, "rgba(40, 80, 120, 0.45)");

                this.ctx.fillStyle = glassGradient;

                this.ctx.fillRect(wx, wy, windowWidth, windowHeight);

                const reflection = this.ctx.createLinearGradient(wx, wy, wx + windowWidth, wy + windowHeight);

                reflection.addColorStop(0, "rgba(255, 255, 255, 0.18)");

                reflection.addColorStop(0.5, "rgba(255, 255, 255, 0.06)");

                reflection.addColorStop(1, "rgba(255, 255, 255, 0.12)");

                this.ctx.fillStyle = reflection;

                this.ctx.fillRect(wx, wy, windowWidth, windowHeight);

                this.ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";

                this.ctx.lineWidth = 1;

                this.ctx.strokeRect(wx, wy, windowWidth, windowHeight);

                this.ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";

                this.ctx.beginPath();

                this.ctx.moveTo(wx + windowWidth / 2, wy + 1);

                this.ctx.lineTo(wx + windowWidth / 2, wy + windowHeight - 1);

                this.ctx.moveTo(wx + 1, wy + windowHeight / 2);

                this.ctx.lineTo(wx + windowWidth - 1, wy + windowHeight / 2);

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

    drawDayNightLighting() {

        const cycle = this.dayNightCycle;

        if (!cycle || !cycle.lighting) {

            return;

        }

        const { overlayAlpha, overlayTop, overlayBottom, horizon, starAlpha } = cycle.lighting;

        if (overlayAlpha > 0.001) {

            const gradient = this.ctx.createLinearGradient(

                this.camera.x,

                this.camera.y,

                this.camera.x,

                this.camera.y + this.height

            );

            gradient.addColorStop(0, overlayTop ?? 'rgba(0, 0, 0, 0)');

            gradient.addColorStop(1, overlayBottom ?? 'rgba(0, 0, 0, 0)');

            this.ctx.save();

            this.ctx.globalAlpha = Math.max(0, Math.min(1, Number(overlayAlpha) || 0));

            this.ctx.fillStyle = gradient;

            this.ctx.fillRect(this.camera.x, this.camera.y, this.width, this.height);

            this.ctx.restore();

        }

        if (horizon && horizon.alpha > 0.001) {

            const offset = Math.max(0, Math.min(0.9, Number(horizon.offsetTop) || 0.2));

            const startY = this.camera.y + this.height * offset;

            const gradient = this.ctx.createLinearGradient(

                this.camera.x,

                startY,

                this.camera.x,

                this.camera.y + this.height

            );

            gradient.addColorStop(0, horizon.top ?? 'rgba(0, 0, 0, 0)');

            gradient.addColorStop(1, horizon.bottom ?? 'rgba(0, 0, 0, 0)');

            this.ctx.save();

            this.ctx.globalAlpha = Math.max(0, Math.min(1, Number(horizon.alpha) || 0));

            this.ctx.fillStyle = gradient;

            this.ctx.fillRect(this.camera.x, this.camera.y, this.width, this.height);

            this.ctx.restore();

        }

        if (starAlpha > 0.001) {

            this.drawNightSkyStars(cycle.stars, starAlpha);

        }

    }

    drawNightSkyStars(stars, alpha) {

        if (!Array.isArray(stars) || stars.length === 0) {

            return;

        }

        const baseAlpha = Math.max(0, Math.min(1, Number(alpha) || 0));

        if (baseAlpha <= 0) {

            return;

        }

        const starPhase = this.dayNightCycle?.starPhase ?? 0;

        this.ctx.save();

        this.ctx.fillStyle = 'rgba(255, 255, 255, 1)';

        for (const star of stars) {

            const twinkleSpeed = Math.max(0.2, Number(star?.twinkleSpeed) || 1);

            const offset = Number(star?.twinkleOffset) || 0;

            const baseIntensity = Math.max(0, Math.min(1, Number(star?.baseIntensity) || 0.7));

            const twinkle = Math.sin(starPhase * twinkleSpeed + offset) * 0.5 + 0.5;

            const intensity = baseIntensity * (0.6 + 0.4 * twinkle);

            const starAlpha = baseAlpha * Math.max(0, Math.min(1, intensity));

            if (starAlpha <= 0.02) {

                continue;

            }

            const x = this.camera.x + (Number(star?.x) || 0) * this.width;

            const y = this.camera.y + (Number(star?.y) || 0) * this.height;

            const size = Math.max(0.4, Number(star?.size) || 1);

            this.ctx.globalAlpha = starAlpha;

            this.ctx.beginPath();

            this.ctx.arc(x, y, size, 0, Math.PI * 2);

            this.ctx.fill();

        }

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
        this.drawEquippedWeaponModel(playerRenderable);

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
        const posEl = document.getElementById("playerPos");
        if (posEl) {
            posEl.textContent = Math.round(this.player.x) + ", " + Math.round(this.player.y);
        }

        const weapon = this.getCurrentWeapon();
        const hudWidth = 420;
        const hudHeight = 200;
        const baseX = 10;
        const baseY = 60;
        let textY = baseY + 30;

        this.ctx.fillStyle = "rgba(12, 16, 24, 0.78)";
        this.ctx.fillRect(baseX, baseY, hudWidth, hudHeight);

        this.ctx.fillStyle = "#ffffff";
        this.ctx.font = "16px Arial";
        this.ctx.fillText("Kontostand: " + this.formatMoney(this.playerMoney), baseX + 10, textY);
        textY += 24;
        this.ctx.fillText("Casino Credits: " + this.formatCredits(this.casinoCredits) + " Credits", baseX + 10, textY);
        textY += 24;
        this.ctx.fillText("Aktive Waffe: " + (weapon ? weapon.name : "Keine"), baseX + 10, textY);
        textY += 24;

        if (weapon) {
            const fireSeconds = (Number(weapon.fireRate ?? 0) / 1000).toFixed(1);
            this.ctx.fillText("Schaden: " + weapon.damage + " | Feuerrate: " + fireSeconds + " s", baseX + 10, textY);
        } else {
            this.ctx.fillText("Schaden: - | Feuerrate: -", baseX + 10, textY);
        }

        textY += 26;

        this.ctx.fillStyle = "#8ce0ff";
        this.ctx.font = "14px Arial";

        const quickSlots = Array.isArray(this.weaponLoadout) ? this.weaponLoadout : [];
        const slotLabels = [];

        for (let i = 0; i < quickSlots.length; i++) {
            const slotId = quickSlots[i];
            const def = this.getWeaponDefinition(slotId);
            const label = def?.shortLabel ?? def?.name ?? slotId;
            slotLabels.push((i + 1) + ": " + label);
        }

        const quickText = slotLabels.length
            ? "Schnellzugriff " + slotLabels.join(" | ") + " | Shift: Sprint"
            : "Shift: Sprint";

        this.ctx.fillText(quickText, baseX + 10, textY);
        textY += 20;

        const ownedCount = this.weaponOrder.filter((id) => this.weaponInventory.has(id)).length;
        if (ownedCount > quickSlots.length) {
            const rangeStart = quickSlots.length + 1;
            const rangeEnd = ownedCount;
            const moreText = "Weitere Waffen: Tasten " + rangeStart + (rangeStart === rangeEnd ? "" : "-" + rangeEnd);
            this.ctx.fillText(moreText, baseX + 10, textY);
            textY += 20;
        }

        this.ctx.fillText("E: Interagieren | Casino: 1$ = " + (this.casinoCreditRate ?? 10) + " Credits", baseX + 10, textY);
    }

    drawCrosshair() {
        const x = Number(this.mouse?.x ?? 0);
        const y = Number(this.mouse?.y ?? 0);

        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return;
        }

        this.ctx.save();
        this.ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
        this.ctx.lineWidth = 1.5;

        this.ctx.beginPath();
        this.ctx.moveTo(x - 14, y);
        this.ctx.lineTo(x - 4, y);
        this.ctx.moveTo(x + 4, y);
        this.ctx.lineTo(x + 14, y);
        this.ctx.moveTo(x, y - 14);
        this.ctx.lineTo(x, y - 4);
        this.ctx.moveTo(x, y + 4);
        this.ctx.lineTo(x, y + 14);
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        this.ctx.stroke();

        this.ctx.restore();
    }

    performBuildingEntry(building) {

        if (!building) {

            this.hideBuildingInteraction();

            return;

        }

        if (building.type === "house") {

            if (building._housePromptShown) {

                this.hideBuildingInteraction();

                return;

            }

            if (this.buildingMessageEl) {

                this.buildingMessageEl.textContent = "Dieses Wohnhaus ist derzeit nicht betretbar.";

            }

            building._housePromptShown = true;

            this.isInteractionVisible = true;

            this.interactionRequiresKeyRelease = true;

            if (this.interactionUI) {

                this.interactionUI.style.display = "block";

            }

            return;

        }

        this.hideBuildingInteraction();

        if (building.type === "casino") {

            this.handleCasinoEntry(building);

            return;

        }

        if (building.type === "weaponShop") {



            this.enterWeaponShop(building);

            return;

        }

        if (building.interactive) {

            alert("Dieses Gebaeude ist noch nicht verfuegbar!");

        }

    }

    showBuildingInteraction(building) {

        if (!building || !this.interactionUI) {

            return;

        }

        this.pendingInteractionBuilding = building;

        if (building.type === "house") {

            delete building._housePromptShown;

        }

        this.isInteractionVisible = true;

        this.interactionRequiresKeyRelease = Boolean(this.keys && this.keys["e"]);

        if (this.buildingNameEl) {

            this.buildingNameEl.textContent = building.name;

        }

        if (this.enterBuildingButton) {

            if (building.type === "weaponShop") {

                this.enterBuildingButton.textContent = "Shop betreten";

            } else if (building.type === "casino") {

                this.enterBuildingButton.textContent = "Casino betreten";

            } else {

                this.enterBuildingButton.textContent = "Betreten";

            }

        }

        if (this.buyCasinoCreditsButton) {

            this.buyCasinoCreditsButton.style.display = building.type === "casino" ? "inline-block" : "none";

        }

        if (this.cashOutCasinoCreditsButton) {

            this.cashOutCasinoCreditsButton.style.display = building.type === "casino" ? "inline-block" : "none";

        }

        if (this.casinoMessageTimeout) {

            clearTimeout(this.casinoMessageTimeout);

            this.casinoMessageTimeout = null;

        }

        if (building.type === "casino") {

            this.refreshCasinoCreditsCache();

            this.updateCasinoInteractionMessage();

        } else if (this.buildingMessageEl) {

            if (building.type === "weaponShop") {

                this.buildingMessageEl.textContent = "Schau dich um und teste neue Waffen.";

            } else if (building.type === "house") {

                this.buildingMessageEl.textContent = "Privates Wohnhaus. Zutritt nur fuer Bewohner.";

            } else {

                this.buildingMessageEl.textContent = "Druecke Betreten um hineinzugehen.";

            }

        }

        this.updateCasinoButtonsState();

        this.interactionUI.style.display = "block";

    }

    hideBuildingInteraction() {

        const previousBuilding = this.pendingInteractionBuilding;

        this.isInteractionVisible = false;

        this.interactionRequiresKeyRelease = false;

        if (this.interactionUI) {

            this.interactionUI.style.display = "none";

        }

        this.pendingInteractionBuilding = null;

        if (previousBuilding && previousBuilding.type === "house") {

            delete previousBuilding._housePromptShown;

        }

        if (this.buyCasinoCreditsButton) {

            this.buyCasinoCreditsButton.style.display = "none";
            this.buyCasinoCreditsButton.disabled = false;
            this.buyCasinoCreditsButton.textContent = "Credits kaufen";

        }

        if (this.cashOutCasinoCreditsButton) {

            this.cashOutCasinoCreditsButton.style.display = "none";
            this.cashOutCasinoCreditsButton.disabled = false;
            this.cashOutCasinoCreditsButton.textContent = "Credits auszahlen";

        }

        if (this.buildingMessageEl) {

            this.buildingMessageEl.textContent = "";

        }

        if (this.buildingNameEl) {

            this.buildingNameEl.textContent = "Unbekanntes Gebaeude";

        }

        if (this.enterBuildingButton) {

            this.enterBuildingButton.textContent = "Betreten";

        }

        if (this.casinoMessageTimeout) {

            clearTimeout(this.casinoMessageTimeout);

            this.casinoMessageTimeout = null;

        }

    }

    gameLoop() {

        this.update();

        this.render();

        requestAnimationFrame(() => this.gameLoop());

    }

}

if (typeof OverworldGame.prototype.computeDayNightLighting !== 'function') {

    OverworldGame.prototype.computeDayNightLighting = function (phaseId, progress, cycle) {

        const phaseName = String(phaseId ?? 'day');

        if (cycle && cycle.lighting) {

            cycle.lighting.phaseId = phaseName;
            cycle.lighting.overlayAlpha = 0;
            cycle.lighting.overlayTop = 'rgba(0, 0, 0, 0)';
            cycle.lighting.overlayBottom = 'rgba(0, 0, 0, 0)';
            cycle.lighting.horizon = null;
            cycle.lighting.starAlpha = 0;
            return cycle.lighting;

        }

        return {

            phaseId: phaseName,
            overlayAlpha: 0,
            overlayTop: 'rgba(0, 0, 0, 0)',
            overlayBottom: 'rgba(0, 0, 0, 0)',
            horizon: null,
            starAlpha: 0

        };

    };

}

if (typeof OverworldGame.prototype.updateDayNightCycle !== 'function') {

    OverworldGame.prototype.updateDayNightCycle = function (now) {

        if (!this.dayNightCycle) {

            return;

        }

        const cycle = this.dayNightCycle;
        const phases = Array.isArray(cycle.phases) && cycle.phases.length ? cycle.phases : [{ id: 'day', duration: 300000 }];

        if (!Number.isFinite(cycle.phaseIndex)) {

            cycle.phaseIndex = 0;

        }

        if (!Number.isFinite(cycle.phaseStart)) {

            cycle.phaseStart = now;

        }

        let phase = phases[Math.max(0, Math.min(cycle.phaseIndex, phases.length - 1))];
        let elapsed = now - cycle.phaseStart;

        if (!Number.isFinite(elapsed) || elapsed < 0) {

            elapsed = 0;
            cycle.phaseStart = now;
            cycle.phaseIndex = 0;
            phase = phases[0];

        }

        let duration = Math.max(1, Number(phase.duration) || 0);

        while (elapsed >= duration) {

            elapsed -= duration;
            cycle.phaseIndex = (cycle.phaseIndex + 1) % phases.length;
            phase = phases[cycle.phaseIndex];
            duration = Math.max(1, Number(phase.duration) || 0);
            cycle.phaseStart = now - elapsed;

        }

        const progress = duration > 0 ? Math.min(1, Math.max(0, elapsed / duration)) : 0;
        const delta = now - (cycle.lastUpdate ?? now);

        cycle.lastUpdate = now;
        cycle.progress = progress;
        cycle.currentPhase = phase;

        if (!Number.isFinite(cycle.starPhase)) {

            cycle.starPhase = 0;

        }

        if (Number.isFinite(delta) && delta > 0) {

            cycle.starPhase = (cycle.starPhase + delta * 0.0015) % (Math.PI * 2);

        }

        if (typeof this.computeDayNightLighting === 'function') {

            cycle.lighting = this.computeDayNightLighting(String(phase.id ?? ''), progress, cycle);

        } else if (!cycle.lighting) {

            cycle.lighting = {

                phaseId: String(phase.id ?? ''),
                overlayAlpha: 0,
                overlayTop: 'rgba(0, 0, 0, 0)',
                overlayBottom: 'rgba(0, 0, 0, 0)',
                horizon: null,
                starAlpha: 0

            };

        }

    };

}

if (typeof OverworldGame.prototype.drawDayNightLighting !== 'function') {

    OverworldGame.prototype.drawDayNightLighting = function () {

        return;

    };

}

if (typeof OverworldGame.prototype.drawNightSkyStars !== 'function') {

    OverworldGame.prototype.drawNightSkyStars = function () {

        return;

    };

}


document.addEventListener("DOMContentLoaded", () => {

    console.log("DOM ist geladen, Spiel wird gestartet!");

    new OverworldGame();

});









































OverworldGame.prototype.createHouseStyles = function () {
    return [
        {
            base: "#c37e61",
            accent: "#f7e3c4",
            roof: "#3a3a3a",
            highlight: "#fcd9a9",
            balcony: "#d97757",
            metallic: "#6f8fa6",
            roofGarden: true,
            floors: 6,
        },
        {
            base: "#d4d0c5",
            accent: "#faf6ec",
            roof: "#494949",
            highlight: "#ffe4ba",
            balcony: "#9fb4c7",
            metallic: "#6d7c8e",
            roofGarden: false,
            floors: 5,
        },
        {
            base: "#8e9faa",
            accent: "#e4eef5",
            roof: "#2d3a4a",
            highlight: "#abd1ff",
            balcony: "#5f7ba6",
            metallic: "#95c4d8",
            roofGarden: true,
            floors: 7,
        },
        {
            base: "#c9a46c",
            accent: "#f0e0c6",
            roof: "#473a2f",
            highlight: "#f6d7b0",
            balcony: "#a7794f",
            metallic: "#8c9aa6",
            roofGarden: false,
            floors: 4,
        },
        {
            base: "#8898aa",
            accent: "#dde7f0",
            roof: "#2f3b4a",
            highlight: "#b7d2f5",
            balcony: "#5b6f87",
            metallic: "#9fb7c9",
            roofGarden: true,
            floors: 8,
        },
        {
            base: "#bda17a",
            accent: "#f3e5c7",
            roof: "#3f3223",
            highlight: "#f9d9a6",
            balcony: "#a87d53",
            metallic: "#7f8c99",
            roofGarden: false,
            floors: 5,
        },
    ];
};
OverworldGame.prototype.createCrosswalks = function () {
    return [
        { orientation: "horizontal", x: 1100, y: 1700, span: 260 },
        { orientation: "horizontal", x: 2050, y: 1700, span: 260 },
        { orientation: "horizontal", x: 1040, y: 1680, span: 180 },
        { orientation: "horizontal", x: 1860, y: 1680, span: 180 },
        { orientation: "vertical", x: 950, y: 900, span: 300 },
        { orientation: "vertical", x: 1700, y: 900, span: 300 },
        { orientation: "vertical", x: 2050, y: 1700, span: 300 },
        { orientation: "vertical", x: 1700, y: 2100, span: 280 },
        { orientation: "horizontal", x: 2950, y: 1100, span: 260 },
        { orientation: "vertical", x: 1330, y: 1700, span: 240 },
        { orientation: "horizontal", x: 3040, y: 1500, span: 280 },
    ];
};
OverworldGame.prototype.createCityRoadLayout = function () {
    const roads = [];

    const verticalCorridors = [200, 950, 1700, 2450, 3350];
    const horizontalCorridors = [200, 900, 1700, 2400, 2800];

    for (const y of horizontalCorridors) {
        roads.push({ type: "horizontal", startX: 200, endX: 3400, y });
    }

    for (const x of verticalCorridors) {
        roads.push({ type: "vertical", x, startY: 200, endY: 2800 });
    }

    roads.push({ type: "horizontal", startX: 950, endX: 1700, y: 1260 });
    roads.push({ type: "horizontal", startX: 950, endX: 1700, y: 2100 });
    roads.push({ type: "vertical", x: 1330, startY: 1700, endY: 2400 });
    roads.push({ type: "vertical", x: 2050, startY: 900, endY: 1700 });

    return roads;
};
OverworldGame.prototype.createSidewalkCorridors = function () {
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
                height: sidewalkWidth,
            });

            corridors.push({
                x: offsetX,
                y: lowerY,
                width: spanWidth,
                height: sidewalkWidth,
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
                height: spanHeight,
            });

            corridors.push({
                x: rightX,
                y: offsetY,
                width: sidewalkWidth,
                height: spanHeight,
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
            height: Math.max(0, (bottom - top) + crosswalkPadding * 2),
        });
    }

    return corridors;
};

OverworldGame.prototype.computeWalkableAreas = function () {

    const source = Array.isArray(this.sidewalkCorridors) ? this.sidewalkCorridors : [];

    if (!source.length) {

        return [];

    }

    const areas = [];

    const seen = new Set();

    for (const rect of source) {

        const bounds = resolveRectBounds(rect);

        if (!bounds || bounds.width <= 0 || bounds.height <= 0) {

            continue;

        }

        const key = `${Math.round(bounds.left)}:${Math.round(bounds.top)}:${Math.round(bounds.right)}:${Math.round(bounds.bottom)}`;

        if (seen.has(key)) {

            continue;

        }

        areas.push({

            x: bounds.left,

            y: bounds.top,

            width: bounds.width,

            height: bounds.height,

        });

        seen.add(key);

    }

    const tolerance = 1.0;

    const mergeIfAligned = (a, b) => {

        if (!a || !b) {

            return null;

        }

        const aLeft = a.x;

        const aRight = a.x + a.width;

        const aTop = a.y;

        const aBottom = a.y + a.height;

        const bLeft = b.x;

        const bRight = b.x + b.width;

        const bTop = b.y;

        const bBottom = b.y + b.height;

        const horizontalAligned = Math.abs(aTop - bTop) <= tolerance && Math.abs(aBottom - bBottom) <= tolerance;

        if (horizontalAligned) {

            const overlapsOrTouches = (aRight + tolerance >= bLeft) && (bRight + tolerance >= aLeft);

            if (overlapsOrTouches) {

                const left = Math.min(aLeft, bLeft);

                const right = Math.max(aRight, bRight);

                const top = Math.min(aTop, bTop);

                const bottom = Math.max(aBottom, bBottom);

                return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };

            }

        }

        const verticalAligned = Math.abs(aLeft - bLeft) <= tolerance && Math.abs(aRight - bRight) <= tolerance;

        if (verticalAligned) {

            const overlapsOrTouches = (aBottom + tolerance >= bTop) && (bBottom + tolerance >= aTop);

            if (overlapsOrTouches) {

                const left = Math.min(aLeft, bLeft);

                const right = Math.max(aRight, bRight);

                const top = Math.min(aTop, bTop);

                const bottom = Math.max(aBottom, bBottom);

                return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };

            }

        }

        return null;

    };

    const mergeRectangles = (input) => {

        const result = Array.isArray(input) ? input.slice() : [];

        let changed = true;

        while (changed) {

            changed = false;

            outer: for (let i = 0; i < result.length; i++) {

                const a = result[i];

                if (!a) {

                    continue;

                }

                for (let j = i + 1; j < result.length; j++) {

                    const b = result[j];

                    if (!b) {

                        continue;

                    }

                    const merged = mergeIfAligned(a, b);

                    if (merged) {

                        result[i] = merged;

                        result.splice(j, 1);

                        changed = true;

                        break outer;

                    }

                }

            }

        }

        return result;

    };

    const mergedAreas = mergeRectangles(areas);

    return mergedAreas;

};

OverworldGame.prototype.getWalkableRectangles = function () {

    if (Array.isArray(this.walkableAreas) && this.walkableAreas.length) {

        return this.walkableAreas;

    }

    if (Array.isArray(this.sidewalkCorridors) && this.sidewalkCorridors.length) {

        return this.sidewalkCorridors;

    }

    return [];

};

OverworldGame.prototype.createBuildingColliders = function (buildings) {

    if (!Array.isArray(buildings)) {

        return [];

    }

    const colliders = [];

    for (const building of buildings) {

        if (!building) {

            continue;

        }

        const rects = [];

        if (Array.isArray(building.collisionRects) && building.collisionRects.length > 0) {

            for (const rect of building.collisionRects) {

                if (!rect) {

                    continue;

                }

                const width = Number(rect.width ?? 0);

                const height = Number(rect.height ?? 0);

                if (!(width > 0 && height > 0)) {

                    continue;

                }

                const left = Number(rect.x ?? building.x ?? 0);

                const top = Number(rect.y ?? building.y ?? 0);

                if (!Number.isFinite(left) || !Number.isFinite(top)) {

                    continue;

                }

                rects.push({

                    left: left,

                    right: left + width,

                    top: top,

                    bottom: top + height,

                });

            }

        }

        if (rects.length === 0) {

            const width = Number(building.width ?? 0);

            const height = Number(building.height ?? 0);

            const left = Number(building.x ?? 0);

            const top = Number(building.y ?? 0);

            if (width > 0 && height > 0 && Number.isFinite(left) && Number.isFinite(top)) {

                rects.push({

                    left,

                    right: left + width,

                    top,

                    bottom: top + height,

                });

            }

        }

        for (const rect of rects) {

            colliders.push({

                type: 'building',

                id: building.id ?? building.name ?? null,

                left: rect.left,

                right: rect.right,

                top: rect.top,

                bottom: rect.bottom,

            });

        }

    }

    return colliders;

};

OverworldGame.prototype.createRoadAreas = function (roadLayout) {

    const roads = Array.isArray(roadLayout) ? roadLayout : [];

    if (!roads.length) {

        return [];

    }

    const halfRoad = this.roadHalfWidth ?? ((this.roadWidth ?? 70) / 2);

    const areas = [];

    for (const road of roads) {

        if (!road) {

            continue;

        }

        if (road.type === "horizontal") {

            const startRaw = Number(road.startX ?? road.x ?? 0);

            const endRaw = Number(road.endX ?? startRaw);

            const y = Number(road.y ?? 0);

            if (!Number.isFinite(startRaw) || !Number.isFinite(endRaw) || !Number.isFinite(y)) {

                continue;

            }

            const left = Math.min(startRaw, endRaw);

            const right = Math.max(startRaw, endRaw);

            areas.push({

                type: 'road',

                orientation: 'horizontal',

                left,

                right,

                top: y - halfRoad,

                bottom: y + halfRoad,

            });

        } else if (road.type === "vertical") {

            const startRaw = Number(road.startY ?? road.y ?? 0);

            const endRaw = Number(road.endY ?? startRaw);

            const x = Number(road.x ?? 0);

            if (!Number.isFinite(startRaw) || !Number.isFinite(endRaw) || !Number.isFinite(x)) {

                continue;

            }

            const top = Math.min(startRaw, endRaw);

            const bottom = Math.max(startRaw, endRaw);

            areas.push({

                type: 'road',

                orientation: 'vertical',

                left: x - halfRoad,

                right: x + halfRoad,

                top,

                bottom,

            });

        }

    }

    return areas;

};

OverworldGame.prototype.createHouseWalkwayCorridors = function (buildings) {

    if (!Array.isArray(buildings)) {

        return [];

    }

    const corridors = [];

    for (const building of buildings) {

        if (!building || building.type !== "house") {

            continue;

        }

        const metrics = building.metrics ?? null;

        if (!metrics || !metrics.entrance || !metrics.approach) {

            continue;

        }

        const entrance = metrics.entrance;

        const approach = metrics.approach;

        const walkway = metrics.walkway ?? null;

        const variant = building.variant ?? {};

        const walkwayWidth = Math.max(20, Number(walkway?.width ?? 30));

        const lateralMargin = Math.max(6, walkwayWidth * 0.35);

        const halfWidth = walkwayWidth / 2 + lateralMargin;

        const startY = Math.min(entrance.y, approach.y);

        const endY = Math.max(entrance.y, approach.y);

        const extension = Math.max(0, Number(variant.walkwayExtension ?? 0));

        const spurLength = Math.max(0, Number(variant.walkwaySpurLength ?? 0));

        const spurWidth = Math.max(0, Number(variant.walkwaySpurWidth ?? 0));

        const paddingY = Math.max(8, (walkway?.height ?? 18) * 0.25);

        const left = entrance.x - halfWidth;

        const right = entrance.x + halfWidth;

        const top = Math.min(startY, endY) - paddingY;

        const bottom = endY + extension + paddingY;

        corridors.push({

            x: left,

            y: top,

            width: Math.max(8, right - left),

            height: Math.max(8, bottom - top),

        });

        if (spurLength > 0 && spurWidth > 0) {

            const spurHalfWidth = Math.max(6, spurWidth / 2 + 6);

            const spurTop = bottom - Math.max(spurWidth, 12) - 2;

            const spurBottom = spurTop + Math.max(spurWidth, 12);

            corridors.push({

                x: entrance.x - spurLength - spurHalfWidth,

                y: spurTop,

                width: spurLength + spurHalfWidth * 2,

                height: Math.max(8, spurBottom - spurTop),

            });

            corridors.push({

                x: entrance.x,

                y: spurTop,

                width: spurLength + spurHalfWidth * 2,

                height: Math.max(8, spurBottom - spurTop),

            });

        }

    }

    return corridors;

};

OverworldGame.prototype.createSidewalkObstacles = function (buildings) {
    if (!Array.isArray(buildings)) {
        return [];
    }

    const clearance = Math.max(4, Math.min(12, (this.sidewalkWidth ?? 36) * 0.35));
    const obstacles = [];

    for (const building of buildings) {
        if (!building) {
            continue;
        }

        const candidates = [];

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

                const resolvedX = Number(rect.x ?? building.x ?? 0);
                const resolvedY = Number(rect.y ?? building.y ?? 0);

                candidates.push({
                    x: resolvedX + rectPadding,
                    y: resolvedY + rectPadding,
                    width: paddedWidth,
                    height: paddedHeight,
                });
            }
        }

        if (candidates.length === 0) {
            const baseWidth = Number(building.width ?? 0);
            const baseHeight = Number(building.height ?? 0);

            if (baseWidth > 0 && baseHeight > 0) {
                const basePadding = Math.max(0, building.collisionPadding ?? 0);
                const paddedWidth = baseWidth - basePadding * 2;
                const paddedHeight = baseHeight - basePadding * 2;

                if (paddedWidth > 0 && paddedHeight > 0) {
                    candidates.push({
                        x: Number(building.x ?? 0) + basePadding,
                        y: Number(building.y ?? 0) + basePadding,
                        width: paddedWidth,
                        height: paddedHeight,
                    });
                }
            }
        }

        for (const rect of candidates) {
            obstacles.push({
                x: rect.x - clearance,
                y: rect.y - clearance,
                width: rect.width + clearance * 2,
                height: rect.height + clearance * 2,
            });
        }
    }

    return obstacles;
};
OverworldGame.prototype.projectPointToSidewalk = function (x, y, options = {}) {
    const walkableRects = this.getWalkableRectangles();

    if (!walkableRects.length) {
        return { x, y, inside: false };
    }

    const ignoreObstacles = options.ignoreObstacles === true;
    const obstacles = (!ignoreObstacles && Array.isArray(this.sidewalkObstacles)) ? this.sidewalkObstacles : [];

    const pointIsClear = (px, py) => {
        if (!obstacles.length) {
            return true;
        }

        for (const rect of obstacles) {
            if (rect && this.isPointInsideRect(px, py, rect)) {
                return false;
            }
        }

        return true;
    };

    for (const rect of walkableRects) {
        if (!rect || !this.isPointInsideRect(x, y, rect)) {
            continue;
        }

        if (pointIsClear(x, y)) {
            return { x, y, inside: true };
        }

        const pushed = this.pushPointOutOfObstacles({ x, y }, rect);
        if (pointIsClear(pushed.x, pushed.y) && this.isPointInsideRect(pushed.x, pushed.y, rect)) {
            return { x: pushed.x, y: pushed.y, inside: true };
        }
    }

    let closest = { x, y, inside: false };
    let closestRect = null;
    let bestDist = Infinity;
    let bestClear = null;
    let bestClearDist = Infinity;

    for (const rect of walkableRects) {
        if (!rect) {
            continue;
        }

        const clamped = this.clampPointToRect(x, y, rect);
        const resolved = this.pushPointOutOfObstacles(clamped, rect);
        const resolvedInside = this.isPointInsideRect(resolved.x, resolved.y, rect);
        const isClear = pointIsClear(resolved.x, resolved.y);
        const dx = x - resolved.x;
        const dy = y - resolved.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < bestDist) {
            bestDist = distSq;
            closest = { x: resolved.x, y: resolved.y, inside: resolvedInside && isClear };
            closestRect = rect;
        }

        if (isClear && distSq < bestClearDist) {
            bestClearDist = distSq;
            bestClear = { x: resolved.x, y: resolved.y, inside: resolvedInside };
        }
    }

    if (bestClear) {
        return { x: bestClear.x, y: bestClear.y, inside: bestClear.inside };
    }

    if (!pointIsClear(closest.x, closest.y) && closestRect) {
        const pushed = this.pushPointOutOfObstacles(closest, closestRect);
        const stillClear = pointIsClear(pushed.x, pushed.y);
        return {
            x: pushed.x,
            y: pushed.y,
            inside: stillClear && this.isPointInsideRect(pushed.x, pushed.y, closestRect),
        };
    }

    return closest;
};

OverworldGame.prototype.applySidewalkConstraint = function (npc) {
    if (!npc || !npc.stayOnSidewalks) {
        return;
    }

    const projection = this.projectPointToSidewalk(npc.x, npc.y, {
        ignoreObstacles: npc.ignoreSidewalkObstacles,
    });

    if (!projection) {
        return;
    }

    npc.x = projection.x;
    npc.y = projection.y;
};

// Geometry helpers for sidewalk projection and collision handling.
function resolveRectBounds(rect) {
    if (!rect) {
        return null;
    }

    const baseX = rect.x ?? rect.left;
    const baseY = rect.y ?? rect.top;

    const originX = Number(baseX);
    const originY = Number(baseY);

    if (!Number.isFinite(originX) || !Number.isFinite(originY)) {
        return null;
    }

    let resolvedRight = rect.right;
    if (resolvedRight == null) {
        const width = Number(rect.width ?? Number.NaN);
        if (Number.isFinite(width)) {
            resolvedRight = originX + width;
        }
    } else {
        resolvedRight = Number(resolvedRight);
    }

    let resolvedBottom = rect.bottom;
    if (resolvedBottom == null) {
        const height = Number(rect.height ?? Number.NaN);
        if (Number.isFinite(height)) {
            resolvedBottom = originY + height;
        }
    } else {
        resolvedBottom = Number(resolvedBottom);
    }

    if (!Number.isFinite(resolvedRight)) {
        resolvedRight = originX;
    }

    if (!Number.isFinite(resolvedBottom)) {
        resolvedBottom = originY;
    }

    const left = Math.min(originX, resolvedRight);
    const right = Math.max(originX, resolvedRight);
    const top = Math.min(originY, resolvedBottom);
    const bottom = Math.max(originY, resolvedBottom);

    return {
        left,
        top,
        right,
        bottom,
        width: right - left,
        height: bottom - top,
    };
}

OverworldGame.prototype.isPointInsideRect = function (px, py, rect) {
    const bounds = resolveRectBounds(rect);

    if (!bounds) {
        return false;
    }

    const x = Number(px);
    const y = Number(py);

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return false;
    }

    return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
};

OverworldGame.prototype.clampPointToRect = function (x, y, rect) {
    const bounds = resolveRectBounds(rect);

    if (!bounds) {
        return { x: Number(x) || 0, y: Number(y) || 0 };
    }

    const px = Number(x);
    const py = Number(y);

    const clampedX = Number.isFinite(px) ? Math.min(bounds.right, Math.max(bounds.left, px)) : bounds.left;
    const clampedY = Number.isFinite(py) ? Math.min(bounds.bottom, Math.max(bounds.top, py)) : bounds.top;

    return { x: clampedX, y: clampedY };
};

OverworldGame.prototype.pushPointOutOfObstacles = function (point, corridor) {
    const obstacles = Array.isArray(this.sidewalkObstacles) ? this.sidewalkObstacles : [];
    const startX = Number(point?.x ?? 0);
    const startY = Number(point?.y ?? 0);

    let resolved = {
        x: Number.isFinite(startX) ? startX : 0,
        y: Number.isFinite(startY) ? startY : 0,
    };

    if (!obstacles.length) {
        return corridor ? this.clampPointToRect(resolved.x, resolved.y, corridor) : resolved;
    }

    const corridorBounds = corridor ? resolveRectBounds(corridor) : null;
    const epsilon = 0.01;
    const maxIterations = obstacles.length * 2 + 4;

    for (let iteration = 0; iteration < maxIterations; iteration++) {
        let moved = false;

        for (const obstacle of obstacles) {
            const bounds = resolveRectBounds(obstacle);

            if (!bounds) {
                continue;
            }

            if (!this.isPointInsideRect(resolved.x, resolved.y, bounds)) {
                continue;
            }

            const distanceLeft = resolved.x - bounds.left;
            const distanceRight = bounds.right - resolved.x;
            const distanceTop = resolved.y - bounds.top;
            const distanceBottom = bounds.bottom - resolved.y;

            const minDistance = Math.min(distanceLeft, distanceRight, distanceTop, distanceBottom);

            if (minDistance === distanceLeft) {
                resolved.x = bounds.left - epsilon;
            } else if (minDistance === distanceRight) {
                resolved.x = bounds.right + epsilon;
            } else if (minDistance === distanceTop) {
                resolved.y = bounds.top - epsilon;
            } else {
                resolved.y = bounds.bottom + epsilon;
            }

            if (corridorBounds) {
                resolved.x = Math.min(corridorBounds.right, Math.max(corridorBounds.left, resolved.x));
                resolved.y = Math.min(corridorBounds.bottom, Math.max(corridorBounds.top, resolved.y));
            }

            moved = true;
        }

        if (!moved) {
            break;
        }
    }

    if (corridor && !this.isPointInsideRect(resolved.x, resolved.y, corridor)) {
        return this.clampPointToRect(resolved.x, resolved.y, corridor);
    }

    return resolved;
};
