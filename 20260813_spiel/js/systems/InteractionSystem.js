/**
 * InteractionSystem - Gebaeude-Interaktion und UI-Steuerung.
 *
 * SSOT: Alle Proximity-Erkennung und Interaktions-UI hier zentralisiert.
 * Dieses System veraendert KEINE Positionen. Es erkennt Proximity und
 * delegiert an InteriorManager fuer Szenen-Wechsel.
 */

import { eventBus } from '../core/EventBus.js';
import { RealEstateSystem, RENTAL_CATALOG, PROPERTY_CATALOG, isRentalType, isPurchasableType } from './RealEstateSystem.js';

/** Reichweite in Pixeln, in der ein Gebaeude als "nah" gilt */
const INTERACTION_RANGE = 60;

export class InteractionSystem {

    /**
     * @param {import('../core/EventBus.js').EventBus} bus - EventBus-Instanz
     * @param {import('../interiors/InteriorManager.js').InteriorManager} interiorManager
     * @param {Array} buildings - Liste der Gebaeude-Objekte (aus WorldGenerator)
     */
    constructor(bus, interiorManager, buildings) {
        /** @type {import('../core/EventBus.js').EventBus} */
        this.eventBus = bus;

        /** @type {import('../interiors/InteriorManager.js').InteriorManager} */
        this.interiorManager = interiorManager;

        /** @type {Array} */
        this.buildings = buildings;

        // --- Interaktions-Zustand ---

        /** @type {object|null} Gebaeude in Reichweite */
        this.nearBuilding = null;

        /** @type {object|null} Gebaeude dessen UI gerade angezeigt wird */
        this.pendingInteractionBuilding = null;

        /** @type {boolean} Interaktions-UI sichtbar */
        this.isInteractionVisible = false;

        /**
         * Wenn true, muss die E-Taste losgelassen werden bevor ein neuer
         * Eintritt moeglich ist (verhindert sofortiges Doppel-Betreten).
         */
        this.interactionRequiresKeyRelease = false;

        // --- Immobilien ---

        /** @type {RealEstateSystem|null} */
        this.realEstateSystem = null;

        // --- Casino ---

        /** @type {import('../interiors/Casino.js').Casino|null} */
        this.casino = null;

        /** @type {number|null} */
        this.casinoMessageTimeout = null;

        // --- DOM-Referenzen (werden spaeter via initUI() gesetzt) ---

        /** @type {HTMLElement|null} */
        this.interactionUI = null;

        /** @type {HTMLElement|null} */
        this.buildingNameEl = null;

        /** @type {HTMLElement|null} */
        this.buildingMessageEl = null;

        /** @type {HTMLButtonElement|null} */
        this.enterBuildingButton = null;

        /** @type {HTMLButtonElement|null} */
        this.buyCasinoCreditsButton = null;

        /** @type {HTMLButtonElement|null} */
        this.cashOutCasinoCreditsButton = null;

        /** @type {HTMLButtonElement|null} */
        this.rentPropertyButton = null;

        /** @type {HTMLButtonElement|null} */
        this.cancelRentalButton = null;

        /** @type {HTMLButtonElement|null} */
        this.buyPropertyButton = null;

        /** @type {HTMLButtonElement|null} */
        this.sellPropertyButton = null;

        /** @type {HTMLButtonElement|null} */
        this.moveInButton = null;
    }

    // ===================================================================
    //  Initialisierung
    // ===================================================================

    /**
     * Verbindet die DOM-Elemente fuer die Interaktions-UI.
     */
    initUI(elements) {
        this.interactionUI = elements.container ?? null;
        this.buildingNameEl = elements.nameEl ?? null;
        this.buildingMessageEl = elements.messageEl ?? null;
        this.enterBuildingButton = elements.enterButton ?? null;
        this.buyCasinoCreditsButton = elements.buyCredits ?? null;
        this.cashOutCasinoCreditsButton = elements.cashOut ?? null;
        this.rentPropertyButton = elements.rentProperty ?? null;
        this.cancelRentalButton = elements.cancelRental ?? null;
        this.buyPropertyButton = elements.buyProperty ?? null;
        this.sellPropertyButton = elements.sellProperty ?? null;
        this.moveInButton = elements.moveInButton ?? null;

        this._bindButtonEvents();
    }

    /**
     * Setzt die Casino-Instanz fuer Credits-Konvertierung.
     */
    setCasino(casino) {
        this.casino = casino;
    }

    /**
     * Setzt das RealEstateSystem fuer Immobilien-Kauf/Verkauf/Miete.
     */
    setRealEstateSystem(realEstateSystem) {
        this.realEstateSystem = realEstateSystem;
    }

    // ===================================================================
    //  Update (pro Frame)
    // ===================================================================

    /**
     * Prueft Proximity zu interaktiven Gebaeuden und steuert die UI.
     */
    update(player, inputSystem) {
        // Im Interior keine Overworld-Interaktionen pruefen
        if (this.interiorManager.isInInterior()) {
            if (this.isInteractionVisible) {
                this.hideInteractionUI();
            }
            this.nearBuilding = null;
            return;
        }

        // Gebaeude am Eingang (Suedseite) suchen
        const nearest = this._findBuildingAtEntrance(player);
        this.nearBuilding = nearest;

        if (nearest) {
            // Key-Release-Tracking: E muss erst losgelassen werden
            if (this.interactionRequiresKeyRelease) {
                if (!inputSystem.isKeyDown('e')) {
                    this.interactionRequiresKeyRelease = false;
                }
            }

            if (!this.interactionRequiresKeyRelease && inputSystem.isKeyPressed('e')) {
                if (!this.isInteractionVisible) {
                    this.showInteractionUI(nearest, player);
                } else {
                    this.performEntry(nearest, player);
                }
            }
        } else {
            if (this.isInteractionVisible) {
                this.hideInteractionUI();
            }
        }
    }

    // ===================================================================
    //  Proximity-Erkennung (nur Suedseite / Eingang)
    // ===================================================================

    _findBuildingAtEntrance(player) {
        const buildings = this.buildings;
        if (!Array.isArray(buildings) || buildings.length === 0) {
            return null;
        }

        const range = INTERACTION_RANGE;
        const px = player.x;
        const py = player.y;
        const pw = player.width ?? 0;
        const ph = player.height ?? 0;

        for (let i = 0; i < buildings.length; i++) {
            const building = buildings[i];
            if (!building.interactive) {
                continue;
            }

            const rects = this._getBuildingRects(building);

            for (let j = 0; j < rects.length; j++) {
                const rect = rects[j];
                const bx = rect.x;
                const by = rect.y;
                const bw = rect.width;
                const bh = rect.height;
                const bottomEdge = by + bh;

                const xOverlap = px + pw > bx && px < bx + bw;
                const atSouth = py > bottomEdge - 4 && py < bottomEdge + range;

                if (xOverlap && atSouth) {
                    return building;
                }
            }
        }

        return null;
    }

    _getBuildingRects(building) {
        if (Array.isArray(building.collisionRects) && building.collisionRects.length > 0) {
            return building.collisionRects;
        }

        const width = Number(building.width ?? 0);
        const height = Number(building.height ?? 0);
        if (width > 0 && height > 0) {
            return [{ x: building.x, y: building.y, width, height }];
        }

        return [];
    }

    // ===================================================================
    //  UI anzeigen / verstecken
    // ===================================================================

    showInteractionUI(building, player) {
        if (!building || !this.interactionUI) {
            return;
        }

        this.pendingInteractionBuilding = building;

        if (building.type === 'house') {
            delete building._housePromptShown;
        }

        this.isInteractionVisible = true;
        this.interactionRequiresKeyRelease = true;

        // Gebaeudenamen setzen
        if (this.buildingNameEl) {
            this.buildingNameEl.textContent = building.name ?? 'Unbekanntes Gebaeude';
        }

        // Typ bestimmen
        const isRental = isRentalType(building.type);
        const isPurchasable = isPurchasableType(building.type);
        const isRented = isRental && player && player.rentedPropertyId === building.id;
        const isOwned = isPurchasable && player && player.ownedProperties.has(building.id);

        // Enter-Button anpassen
        if (this.enterBuildingButton) {
            if (building.type === 'weaponShop') {
                this.enterBuildingButton.textContent = 'Shop betreten';
                this.enterBuildingButton.style.display = 'inline-block';
            } else if (building.type === 'casino') {
                this.enterBuildingButton.textContent = 'Casino betreten';
                this.enterBuildingButton.style.display = 'inline-block';
            } else if (building.type === 'realEstateAgent') {
                this.enterBuildingButton.style.display = 'none';
            } else if (isRental || isPurchasable) {
                this.enterBuildingButton.style.display = 'none';
            } else {
                this.enterBuildingButton.textContent = 'Betreten';
                this.enterBuildingButton.style.display = 'inline-block';
            }
        }

        // Casino-Buttons
        if (this.buyCasinoCreditsButton) {
            this.buyCasinoCreditsButton.style.display =
                building.type === 'casino' ? 'inline-block' : 'none';
        }
        if (this.cashOutCasinoCreditsButton) {
            this.cashOutCasinoCreditsButton.style.display =
                building.type === 'casino' ? 'inline-block' : 'none';
        }

        // Miet-Buttons (Motel/Apartment)
        if (this.rentPropertyButton) {
            this.rentPropertyButton.style.display =
                isRental && !isRented ? 'inline-block' : 'none';
            if (isRental && !isRented) {
                const rental = RealEstateSystem.getRentalEntry(building.type);
                if (rental) {
                    this.rentPropertyButton.textContent =
                        'Mieten (' + RealEstateSystem.formatMoney(rental.rent) + ' / Tag)';
                }
            }
        }
        if (this.cancelRentalButton) {
            this.cancelRentalButton.style.display =
                isRental && isRented ? 'inline-block' : 'none';
            if (isRental && isRented) {
                this.cancelRentalButton.textContent = 'Miete kuendigen';
            }
        }

        // Kauf-Buttons (Bungalow etc. via Makler)
        if (this.buyPropertyButton) {
            // Kaufen: nur bei Makler-Gebaeude fuer kaufbare Immobilien in der Naehe,
            // oder direkt am Bungalow
            const showBuy = isPurchasable && !isOwned;
            this.buyPropertyButton.style.display = showBuy ? 'inline-block' : 'none';
            if (showBuy) {
                const catalog = RealEstateSystem.getPurchaseEntry(building.type);
                if (catalog) {
                    this.buyPropertyButton.textContent =
                        'Kaufen (' + RealEstateSystem.formatMoney(catalog.price) + ')';
                }
            }
        }
        if (this.sellPropertyButton) {
            const showSell = isPurchasable && isOwned;
            this.sellPropertyButton.style.display = showSell ? 'inline-block' : 'none';
            if (showSell) {
                const catalog = RealEstateSystem.getPurchaseEntry(building.type);
                if (catalog) {
                    const refund = RealEstateSystem.getSellRefund(catalog.price);
                    this.sellPropertyButton.textContent =
                        'Verkaufen (' + RealEstateSystem.formatMoney(refund) + ')';
                }
            }
        }

        // Einziehen-Button: nur bei eigenen Kaufimmobilien
        if (this.moveInButton) {
            const isHome = isOwned && player && player.homePropertyId === building.id;
            this.moveInButton.style.display =
                isPurchasable && isOwned && !isHome ? 'inline-block' : 'none';
            if (isPurchasable && isOwned && !isHome) {
                this.moveInButton.textContent = 'Einziehen';
            }
        }

        // Casino-Message-Timeout raeumen
        if (this.casinoMessageTimeout) {
            clearTimeout(this.casinoMessageTimeout);
            this.casinoMessageTimeout = null;
        }

        // Nachrichtentext setzen
        if (building.type === 'casino') {
            if (this.casino && player) {
                this.casino.refreshCreditsCache(player);
                this._updateCasinoInteractionMessage(player);
            }
        } else if (this.buildingMessageEl) {
            if (building.type === 'weaponShop') {
                this.buildingMessageEl.textContent = 'Schau dich um und teste neue Waffen.';
            } else if (building.type === 'house') {
                this.buildingMessageEl.textContent = 'Privates Wohnhaus. Zutritt nur fuer Bewohner.';
            } else if (building.type === 'realEstateAgent') {
                this.buildingMessageEl.textContent = 'Immobilienmakler - Hier kannst du Haeuser kaufen und verkaufen.';
            } else if (isRental) {
                const rental = RealEstateSystem.getRentalEntry(building.type);
                if (rental) {
                    if (isRented) {
                        this.buildingMessageEl.textContent =
                            'Deine gemietete Unterkunft! Miete: ' +
                            RealEstateSystem.formatMoney(rental.rent) + ' / Tag';
                    } else {
                        this.buildingMessageEl.textContent =
                            rental.description + ' | Miete: ' +
                            RealEstateSystem.formatMoney(rental.rent) + ' / Tag';
                    }
                }
            } else if (isPurchasable) {
                const catalog = RealEstateSystem.getPurchaseEntry(building.type);
                if (catalog) {
                    if (isOwned) {
                        const isHome = player && player.homePropertyId === building.id;
                        const homeLabel = isHome ? ' (Dein Wohnsitz!)' : '';
                        this.buildingMessageEl.textContent =
                            'Dein Eigentum!' + homeLabel;
                    } else {
                        this.buildingMessageEl.textContent =
                            catalog.description + ' | Preis: ' +
                            RealEstateSystem.formatMoney(catalog.price);
                    }
                }
            } else {
                this.buildingMessageEl.textContent = 'Druecke Betreten um hineinzugehen.';
            }
        }

        this._updateCasinoButtonsState(player);
        this.interactionUI.style.display = 'block';
    }

    hideInteractionUI() {
        const previousBuilding = this.pendingInteractionBuilding;

        this.isInteractionVisible = false;
        this.interactionRequiresKeyRelease = false;

        if (this.interactionUI) {
            this.interactionUI.style.display = 'none';
        }

        this.pendingInteractionBuilding = null;

        if (previousBuilding && previousBuilding.type === 'house') {
            delete previousBuilding._housePromptShown;
        }

        // Casino-Buttons zuruecksetzen
        if (this.buyCasinoCreditsButton) {
            this.buyCasinoCreditsButton.style.display = 'none';
            this.buyCasinoCreditsButton.disabled = false;
            this.buyCasinoCreditsButton.textContent = 'Credits kaufen';
        }
        if (this.cashOutCasinoCreditsButton) {
            this.cashOutCasinoCreditsButton.style.display = 'none';
            this.cashOutCasinoCreditsButton.disabled = false;
            this.cashOutCasinoCreditsButton.textContent = 'Credits auszahlen';
        }

        if (this.buildingMessageEl) {
            this.buildingMessageEl.textContent = '';
        }
        if (this.buildingNameEl) {
            this.buildingNameEl.textContent = 'Unbekanntes Gebaeude';
        }
        if (this.enterBuildingButton) {
            this.enterBuildingButton.textContent = 'Betreten';
            this.enterBuildingButton.style.display = 'inline-block';
        }

        // Miet-Buttons
        if (this.rentPropertyButton) {
            this.rentPropertyButton.style.display = 'none';
        }
        if (this.cancelRentalButton) {
            this.cancelRentalButton.style.display = 'none';
        }

        // Kauf-Buttons
        if (this.buyPropertyButton) {
            this.buyPropertyButton.style.display = 'none';
        }
        if (this.sellPropertyButton) {
            this.sellPropertyButton.style.display = 'none';
        }
        if (this.moveInButton) {
            this.moveInButton.style.display = 'none';
        }

        if (this.casinoMessageTimeout) {
            clearTimeout(this.casinoMessageTimeout);
            this.casinoMessageTimeout = null;
        }
    }

    // ===================================================================
    //  Eintritt
    // ===================================================================

    performEntry(building, player) {
        if (!building) {
            this.hideInteractionUI();
            return;
        }

        // Wohnhaus: nur Hinweis
        if (building.type === 'house') {
            if (building._housePromptShown) {
                this.hideInteractionUI();
                return;
            }
            if (this.buildingMessageEl) {
                this.buildingMessageEl.textContent = 'Dieses Wohnhaus ist derzeit nicht betretbar.';
            }
            building._housePromptShown = true;
            this.isInteractionVisible = true;
            this.interactionRequiresKeyRelease = true;
            if (this.interactionUI) {
                this.interactionUI.style.display = 'block';
            }
            return;
        }

        this.hideInteractionUI();

        if (building.type === 'casino') {
            this._handleCasinoEntry(building, player);
            return;
        }

        if (building.type === 'weaponShop') {
            this.eventBus.emit('interaction:enterWeaponShop', { building, player });
            return;
        }

        if (building.interactive) {
            this.eventBus.emit('interaction:enterGeneric', { building, player });
        }
    }

    // ===================================================================
    //  Casino-UI-Logik
    // ===================================================================

    _handleCasinoEntry(building, player) {
        if (this.casino) {
            this.casino.refreshCreditsCache(player);
        }
        this.eventBus.emit('interaction:enterCasino', { building, player });
    }

    _updateCasinoInteractionMessage(player) {
        if (!this.buildingMessageEl || !this.casino) return;
        this.buildingMessageEl.textContent = this.casino.getInteractionMessage(player);
        this._updateCasinoButtonsState(player);
    }

    _updateCasinoButtonsState(player) {
        if (!this.buyCasinoCreditsButton && !this.cashOutCasinoCreditsButton) return;
        if (!this.casino || !player) return;

        const isCasino = this.pendingInteractionBuilding &&
            this.pendingInteractionBuilding.type === 'casino';

        const state = this.casino.getButtonState(player);
        const rate = this.casino.creditRate;

        const canBuy = isCasino && state.canBuy;
        const canCashOut = isCasino && state.canCashOut;

        if (this.buyCasinoCreditsButton) {
            this.buyCasinoCreditsButton.disabled = !canBuy;
            if (isCasino && canBuy) {
                const creditsGain = state.dollarsAvailable * rate;
                const dollarsLabel = state.dollarsAvailable.toLocaleString('de-DE');
                this.buyCasinoCreditsButton.textContent =
                    'Credits kaufen (' + dollarsLabel + '$ = ' +
                    this.casino.formatCredits(creditsGain) + ' Credits)';
            } else {
                this.buyCasinoCreditsButton.textContent = 'Credits kaufen';
            }
        }

        if (this.cashOutCasinoCreditsButton) {
            this.cashOutCasinoCreditsButton.disabled = !canCashOut;
            if (isCasino && canCashOut) {
                const dollarsGain = Math.floor(state.creditsAvailable / rate);
                const creditsUsed = dollarsGain * rate;
                const creditsLabel = this.casino.formatCredits(creditsUsed);
                this.cashOutCasinoCreditsButton.textContent =
                    'Credits auszahlen (' + creditsLabel + ' Credits -> ' +
                    this.casino.formatMoney(dollarsGain) + ')';
            } else {
                this.cashOutCasinoCreditsButton.textContent = 'Credits auszahlen';
            }
        }
    }

    handleBuyCasinoCredits(player) {
        if (!this.casino) return;
        const result = this.casino.convertDollarsToCredits(player);
        if (!this.buildingMessageEl) return;

        if (!result.success) {
            this.buildingMessageEl.textContent =
                result.reason === 'noMoney' ? 'Keine Dollars zum Umtauschen.' : 'Umtausch derzeit nicht moeglich.';
            this._updateCasinoButtonsState(player);
            return;
        }

        this.buildingMessageEl.textContent =
            'Eingezahlt: ' + this.casino.formatMoney(result.dollarsSpent) +
            ' -> +' + this.casino.formatCredits(result.creditsAdded) +
            ' Credits | neuer Stand: ' + this.casino.formatCredits(result.totalCredits) +
            ' Credits';

        this._updateCasinoButtonsState(player);
        this._resetCasinoMessageWithDelay(player);
    }

    handleCashOutCasinoCredits(player) {
        if (!this.casino) return;
        const result = this.casino.convertCreditsToDollars(player);
        if (!this.buildingMessageEl) return;

        if (!result.success) {
            this.buildingMessageEl.textContent =
                result.reason === 'noCredits' ? 'Keine Credits zum Auszahlen.' : 'Auszahlung derzeit nicht moeglich.';
            this._updateCasinoButtonsState(player);
            return;
        }

        this.buildingMessageEl.textContent =
            'Ausgezahlt: +' + this.casino.formatMoney(result.dollarsGained) +
            ' ( -' + this.casino.formatCredits(result.creditsSpent) +
            ' Credits ) | Rest: ' + this.casino.formatCredits(result.totalCredits) +
            ' Credits';

        this._updateCasinoButtonsState(player);
        this._resetCasinoMessageWithDelay(player);
    }

    _resetCasinoMessageWithDelay(player) {
        if (typeof window === 'undefined') return;
        if (this.casinoMessageTimeout) {
            clearTimeout(this.casinoMessageTimeout);
        }
        this.casinoMessageTimeout = window.setTimeout(() => {
            if (this.pendingInteractionBuilding &&
                this.pendingInteractionBuilding.type === 'casino') {
                this._updateCasinoInteractionMessage(player);
            }
        }, 2000);
    }

    // ===================================================================
    //  Miet-Handler (Motel/Apartment)
    // ===================================================================

    handleRentProperty(player) {
        if (!this.realEstateSystem || !this.pendingInteractionBuilding) return;

        const result = this.realEstateSystem.rentProperty(player, this.pendingInteractionBuilding);
        if (!this.buildingMessageEl) return;

        if (!result.success) {
            if (result.reason === 'noMoney') {
                this.buildingMessageEl.textContent = 'Nicht genug Geld fuer die Miete!';
            } else if (result.reason === 'alreadyRented') {
                this.buildingMessageEl.textContent = 'Du mietest hier bereits!';
            } else {
                this.buildingMessageEl.textContent = 'Mieten nicht moeglich.';
            }
            return;
        }

        this.buildingMessageEl.textContent =
            'Eingezogen! Miete: ' + RealEstateSystem.formatMoney(result.rental.rent) + ' / Tag. Respawn hier gesetzt.';

        // Buttons aktualisieren
        if (this.rentPropertyButton) {
            this.rentPropertyButton.style.display = 'none';
        }
        if (this.cancelRentalButton) {
            this.cancelRentalButton.textContent = 'Miete kuendigen';
            this.cancelRentalButton.style.display = 'inline-block';
        }
    }

    handleCancelRental(player) {
        if (!this.realEstateSystem || !this.pendingInteractionBuilding) return;

        const result = this.realEstateSystem.cancelRental(player, this.pendingInteractionBuilding);
        if (!this.buildingMessageEl) return;

        if (!result.success) {
            this.buildingMessageEl.textContent = 'Kuendigung nicht moeglich.';
            return;
        }

        this.buildingMessageEl.textContent = 'Miete gekuendigt. Du wohnst hier nicht mehr.';

        // Buttons aktualisieren
        if (this.cancelRentalButton) {
            this.cancelRentalButton.style.display = 'none';
        }
        if (this.rentPropertyButton) {
            const rental = RealEstateSystem.getRentalEntry(this.pendingInteractionBuilding.type);
            if (rental) {
                this.rentPropertyButton.textContent =
                    'Mieten (' + RealEstateSystem.formatMoney(rental.rent) + ' / Tag)';
            }
            this.rentPropertyButton.style.display = 'inline-block';
        }
    }

    // ===================================================================
    //  Kauf/Verkauf Handler (Bungalow etc.)
    // ===================================================================

    handleBuyProperty(player) {
        if (!this.realEstateSystem || !this.pendingInteractionBuilding) return;

        const result = this.realEstateSystem.buyProperty(player, this.pendingInteractionBuilding);
        if (!this.buildingMessageEl) return;

        if (!result.success) {
            if (result.reason === 'noMoney') {
                this.buildingMessageEl.textContent = 'Nicht genug Geld!';
            } else if (result.reason === 'alreadyOwned') {
                this.buildingMessageEl.textContent = 'Diese Immobilie gehoert dir bereits!';
            } else {
                this.buildingMessageEl.textContent = 'Kauf nicht moeglich.';
            }
            return;
        }

        this.buildingMessageEl.textContent = 'Gekauft! Du bist jetzt Eigentuemer.';

        if (this.buyPropertyButton) {
            this.buyPropertyButton.style.display = 'none';
        }
        if (this.sellPropertyButton) {
            const catalog = RealEstateSystem.getPurchaseEntry(this.pendingInteractionBuilding.type);
            if (catalog) {
                const refund = RealEstateSystem.getSellRefund(catalog.price);
                this.sellPropertyButton.textContent =
                    'Verkaufen (' + RealEstateSystem.formatMoney(refund) + ')';
            }
            this.sellPropertyButton.style.display = 'inline-block';
        }
        if (this.moveInButton) {
            this.moveInButton.textContent = 'Einziehen';
            this.moveInButton.style.display = 'inline-block';
        }
    }

    handleSellProperty(player) {
        if (!this.realEstateSystem || !this.pendingInteractionBuilding) return;

        const result = this.realEstateSystem.sellProperty(player, this.pendingInteractionBuilding);
        if (!this.buildingMessageEl) return;

        if (!result.success) {
            this.buildingMessageEl.textContent = 'Verkauf nicht moeglich.';
            return;
        }

        this.buildingMessageEl.textContent =
            'Verkauft! ' + RealEstateSystem.formatMoney(result.refund) + ' erhalten.';

        if (this.sellPropertyButton) {
            this.sellPropertyButton.style.display = 'none';
        }
        if (this.moveInButton) {
            this.moveInButton.style.display = 'none';
        }
        if (this.buyPropertyButton) {
            const catalog = RealEstateSystem.getPurchaseEntry(this.pendingInteractionBuilding.type);
            if (catalog) {
                this.buyPropertyButton.textContent =
                    'Kaufen (' + RealEstateSystem.formatMoney(catalog.price) + ')';
            }
            this.buyPropertyButton.style.display = 'inline-block';
        }
    }

    handleMoveIn(player) {
        if (!this.realEstateSystem || !this.pendingInteractionBuilding) return;

        const result = this.realEstateSystem.moveIn(player, this.pendingInteractionBuilding);
        if (!this.buildingMessageEl) return;

        if (!result.success) {
            this.buildingMessageEl.textContent = 'Einziehen nicht moeglich.';
            return;
        }

        this.buildingMessageEl.textContent = 'Du wohnst jetzt hier! Respawn-Punkt gesetzt.';

        if (this.moveInButton) {
            this.moveInButton.style.display = 'none';
        }
    }

    // ===================================================================
    //  Button-Event-Bindings
    // ===================================================================

    _bindButtonEvents() {
        if (this.enterBuildingButton) {
            this.enterBuildingButton.addEventListener('click', () => {
                if (this.pendingInteractionBuilding) {
                    this.eventBus.emit('interaction:enterButtonClicked', {
                        building: this.pendingInteractionBuilding,
                    });
                }
            });
        }

        if (this.buyCasinoCreditsButton) {
            this.buyCasinoCreditsButton.addEventListener('click', () => {
                this.eventBus.emit('interaction:buyCasinoCredits');
            });
        }

        if (this.cashOutCasinoCreditsButton) {
            this.cashOutCasinoCreditsButton.addEventListener('click', () => {
                this.eventBus.emit('interaction:cashOutCasinoCredits');
            });
        }

        if (this.rentPropertyButton) {
            this.rentPropertyButton.addEventListener('click', () => {
                this.eventBus.emit('interaction:rentProperty');
            });
        }

        if (this.cancelRentalButton) {
            this.cancelRentalButton.addEventListener('click', () => {
                this.eventBus.emit('interaction:cancelRental');
            });
        }

        if (this.buyPropertyButton) {
            this.buyPropertyButton.addEventListener('click', () => {
                this.eventBus.emit('interaction:buyProperty');
            });
        }

        if (this.sellPropertyButton) {
            this.sellPropertyButton.addEventListener('click', () => {
                this.eventBus.emit('interaction:sellProperty');
            });
        }

        if (this.moveInButton) {
            this.moveInButton.addEventListener('click', () => {
                this.eventBus.emit('interaction:moveIn');
            });
        }
    }
}

export default InteractionSystem;
