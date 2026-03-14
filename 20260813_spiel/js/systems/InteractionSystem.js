/**
 * InteractionSystem - Gebaeude-Interaktion und UI-Steuerung.
 *
 * Portiert aus gta_old/overworld/js/overworld.js:
 *   checkBuildingCollisions() Interaktions-Teil  Zeilen 1391-1419
 *   showBuildingInteraction()                    Zeilen 11271-11363
 *   hideBuildingInteraction()                    Zeilen 11365-11429
 *   performBuildingEntry()                       Zeilen 11201-11270
 *   Casino-UI (updateCasinoInteractionMessage, updateCasinoButtonsState,
 *              handleBuyCasinoCredits, handleCashOutCasinoCredits,
 *              resetCasinoMessageWithDelay)      Zeilen 751-920
 *
 * SSOT: Alle Proximity-Erkennung und Interaktions-UI hier zentralisiert.
 * Dieses System veraendert KEINE Positionen. Es erkennt Proximity und
 * delegiert an InteriorManager fuer Szenen-Wechsel.
 */

import { eventBus } from '../core/EventBus.js';

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
    }

    // ===================================================================
    //  Initialisierung
    // ===================================================================

    /**
     * Verbindet die DOM-Elemente fuer die Interaktions-UI.
     *
     * @param {object} elements
     * @param {HTMLElement}       elements.container     - Wrapper (display: none/block)
     * @param {HTMLElement}       elements.nameEl        - Gebaeudename
     * @param {HTMLElement}       elements.messageEl     - Nachrichtentext
     * @param {HTMLButtonElement} elements.enterButton   - "Betreten"-Button
     * @param {HTMLButtonElement} [elements.buyCredits]  - "Credits kaufen"-Button
     * @param {HTMLButtonElement} [elements.cashOut]     - "Credits auszahlen"-Button
     */
    initUI(elements) {
        this.interactionUI = elements.container ?? null;
        this.buildingNameEl = elements.nameEl ?? null;
        this.buildingMessageEl = elements.messageEl ?? null;
        this.enterBuildingButton = elements.enterButton ?? null;
        this.buyCasinoCreditsButton = elements.buyCredits ?? null;
        this.cashOutCasinoCreditsButton = elements.cashOut ?? null;

        this._bindButtonEvents();
    }

    /**
     * Setzt die Casino-Instanz fuer Credits-Konvertierung.
     *
     * @param {import('../interiors/Casino.js').Casino} casino
     */
    setCasino(casino) {
        this.casino = casino;
    }

    // ===================================================================
    //  Update (pro Frame)
    // ===================================================================

    /**
     * Prueft Proximity zu interaktiven Gebaeuden und steuert die UI.
     * Wird jeden Frame aufgerufen.
     *
     * Die UI erscheint NICHT automatisch bei Annaeherung, sondern erst
     * wenn der Spieler E drueckt und vor dem Eingang (Suedseite) steht.
     *
     * WICHTIG: Veraendert KEINE Positionen.
     *
     * @param {object} player - Spieler-Entity
     * @param {import('./InputSystem.js').InputSystem} inputSystem
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
                    // Erstes E: Menue oeffnen
                    this.showInteractionUI(nearest, player);
                } else {
                    // Zweites E: Gebaeude betreten
                    this.performEntry(nearest, player);
                }
            }
        } else {
            // Nicht am Eingang -> UI verstecken
            if (this.isInteractionVisible) {
                this.hideInteractionUI();
            }
        }
    }

    // ===================================================================
    //  Proximity-Erkennung (nur Suedseite / Eingang)
    // ===================================================================

    /**
     * Findet ein interaktives Gebaeude, vor dessen Eingang (Suedseite)
     * der Spieler steht. Nur die Unterkante des Gebaeudes wird geprueft.
     *
     * @param {object} player
     * @returns {object|null}
     * @private
     */
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

                // Spieler muss horizontal im Bereich des Gebaeudes sein
                const xOverlap = px + pw > bx && px < bx + bw;

                // Spieler muss an der Suedseite stehen (unterhalb der Unterkante)
                const atSouth = py > bottomEdge - 4 && py < bottomEdge + range;

                if (xOverlap && atSouth) {
                    return building;
                }
            }
        }

        return null;
    }

    /**
     * Ermittelt die Collision-Rects eines Gebaeudes fuer Proximity-Erkennung.
     * Nutzt collisionRects falls vorhanden, sonst Fallback auf Basis-Geometrie.
     *
     * @param {object} building
     * @returns {Array<{x: number, y: number, width: number, height: number}>}
     * @private
     */
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
    //  Portiert aus showBuildingInteraction() Zeilen 11271-11363
    //  und hideBuildingInteraction() Zeilen 11365-11429
    // ===================================================================

    /**
     * Zeigt die Interaktions-UI fuer ein Gebaeude an.
     *
     * @param {object} building
     * @param {object} [player] - Spieler-Entity (fuer Casino-Anzeige)
     */
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

        // Button-Text anpassen
        if (this.enterBuildingButton) {
            if (building.type === 'weaponShop') {
                this.enterBuildingButton.textContent = 'Shop betreten';
            } else if (building.type === 'casino') {
                this.enterBuildingButton.textContent = 'Casino betreten';
            } else {
                this.enterBuildingButton.textContent = 'Betreten';
            }
        }

        // Casino-Buttons sichtbar/unsichtbar
        if (this.buyCasinoCreditsButton) {
            this.buyCasinoCreditsButton.style.display =
                building.type === 'casino' ? 'inline-block' : 'none';
        }

        if (this.cashOutCasinoCreditsButton) {
            this.cashOutCasinoCreditsButton.style.display =
                building.type === 'casino' ? 'inline-block' : 'none';
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
            } else {
                this.buildingMessageEl.textContent = 'Druecke Betreten um hineinzugehen.';
            }
        }

        this._updateCasinoButtonsState(player);
        this.interactionUI.style.display = 'block';
    }

    /**
     * Versteckt die Interaktions-UI.
     */
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
        }

        if (this.casinoMessageTimeout) {
            clearTimeout(this.casinoMessageTimeout);
            this.casinoMessageTimeout = null;
        }
    }

    // ===================================================================
    //  Eintritt
    //  Portiert aus performBuildingEntry() Zeilen 11201-11270
    // ===================================================================

    /**
     * Fuehrt den Eintritt in ein Gebaeude aus.
     * Delegiert an InteriorManager fuer den eigentlichen Szenen-Wechsel.
     *
     * @param {object} building
     * @param {object} player
     */
    performEntry(building, player) {
        if (!building) {
            this.hideInteractionUI();
            return;
        }

        // Wohnhaus: nur Hinweis anzeigen, nicht betretbar
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

        // Casino: an Casino-Handler delegieren
        if (building.type === 'casino') {
            this._handleCasinoEntry(building, player);
            return;
        }

        // Waffenladen: an InteriorManager delegieren
        if (building.type === 'weaponShop') {
            this.eventBus.emit('interaction:enterWeaponShop', { building, player });
            return;
        }

        // Sonstiges interaktives Gebaeude
        if (building.interactive) {
            this.eventBus.emit('interaction:enterGeneric', { building, player });
        }
    }

    // ===================================================================
    //  Casino-UI-Logik
    //  Portiert aus Zeilen 751-920
    // ===================================================================

    /**
     * Behandelt den Casino-Eintritt.
     * Portiert aus handleCasinoEntry() Zeilen 743-749.
     *
     * @param {object} building
     * @param {object} player
     * @private
     */
    _handleCasinoEntry(building, player) {
        if (this.casino) {
            this.casino.refreshCreditsCache(player);
        }
        this.eventBus.emit('interaction:enterCasino', { building, player });
    }

    /**
     * Aktualisiert die Casino-Nachricht in der Interaktions-UI.
     * Portiert aus updateCasinoInteractionMessage() Zeilen 821-838.
     *
     * @param {object} player
     * @private
     */
    _updateCasinoInteractionMessage(player) {
        if (!this.buildingMessageEl || !this.casino) {
            return;
        }

        this.buildingMessageEl.textContent = this.casino.getInteractionMessage(player);
        this._updateCasinoButtonsState(player);
    }

    /**
     * Aktualisiert den Zustand der Casino-Buttons (enabled/disabled, Labels).
     * Portiert aus updateCasinoButtonsState() Zeilen 841-893.
     *
     * @param {object} [player]
     * @private
     */
    _updateCasinoButtonsState(player) {
        if (!this.buyCasinoCreditsButton && !this.cashOutCasinoCreditsButton) {
            return;
        }

        if (!this.casino || !player) {
            return;
        }

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

    /**
     * Behandelt den Kauf von Casino-Credits.
     * Portiert aus handleBuyCasinoCredits() Zeilen 751-783.
     *
     * @param {object} player
     */
    handleBuyCasinoCredits(player) {
        if (!this.casino) {
            return;
        }

        const result = this.casino.convertDollarsToCredits(player);

        if (!this.buildingMessageEl) {
            return;
        }

        if (!result.success) {
            if (result.reason === 'noMoney') {
                this.buildingMessageEl.textContent = 'Keine Dollars zum Umtauschen.';
            } else {
                this.buildingMessageEl.textContent = 'Umtausch derzeit nicht moeglich.';
            }
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

    /**
     * Behandelt die Auszahlung von Casino-Credits.
     * Portiert aus handleCashOutCasinoCredits() Zeilen 786-818.
     *
     * @param {object} player
     */
    handleCashOutCasinoCredits(player) {
        if (!this.casino) {
            return;
        }

        const result = this.casino.convertCreditsToDollars(player);

        if (!this.buildingMessageEl) {
            return;
        }

        if (!result.success) {
            if (result.reason === 'noCredits') {
                this.buildingMessageEl.textContent = 'Keine Credits zum Auszahlen.';
            } else {
                this.buildingMessageEl.textContent = 'Auszahlung derzeit nicht moeglich.';
            }
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

    /**
     * Setzt die Casino-Nachricht nach einer Verzoegerung zurueck auf den Standard.
     * Portiert aus resetCasinoMessageWithDelay() Zeilen 896-920.
     *
     * @param {object} player
     * @private
     */
    _resetCasinoMessageWithDelay(player) {
        if (typeof window === 'undefined') {
            return;
        }

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
    //  Button-Event-Bindings
    // ===================================================================

    /**
     * Bindet Click-Handler an die UI-Buttons.
     * @private
     */
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
    }
}

export default InteractionSystem;
