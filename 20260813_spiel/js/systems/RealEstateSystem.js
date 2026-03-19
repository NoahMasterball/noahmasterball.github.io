/**
 * RealEstateSystem - Immobilienmarkt: Kauf und Verwaltung von Gebaeuden.
 *
 * SSOT: Alle Immobilien-Preise, Einkuenfte und Kauf-Logik hier zentralisiert.
 * Einkommen wird pro Ingame-Tag ausgezahlt (1 voller Tag/Nacht-Zyklus).
 */

// ---------------------------------------------------------------------------
// Immobilien-Katalog (SSOT fuer alle kaufbaren Immobilien)
// ---------------------------------------------------------------------------

/**
 * Gibt den Immobilien-Katalog zurueck.
 * Schluessel = Building-Type, Wert = Kauf-Details.
 * income = Einkommen pro Ingame-Tag.
 */
/** Verkaufsrate: Anteil des Kaufpreises bei Verkauf (SSOT) */
export const PROPERTY_SELL_RATE = 0.5;

export const PROPERTY_CATALOG = {
    motel: {
        name: 'Sunrise Motel',
        price: 8000,
        income: 200,
        description: 'Ein kleines Motel am Stadtrand. Generiert taegliches Einkommen.',
    },
    apartmentComplex: {
        name: 'Parkview Apartments',
        price: 25000,
        income: 750,
        description: 'Ein Apartmentkomplex mit mehreren Einheiten. Hohe Mieteinnahmen.',
    },
};

export class RealEstateSystem {

    /**
     * @param {import('../core/EventBus.js').EventBus} eventBus
     */
    constructor(eventBus) {
        this.eventBus = eventBus;

        /** @type {number} Letzter bekannter phaseIndex des DayNightSystem */
        this._lastPhaseIndex = -1;

        /** @type {number} Zaehlt wie oft phaseIndex auf 0 zurueckspringt (= neuer Tag) */
        this._dayCount = 0;

        /** @type {number} Letzter Tag an dem Einkommen gezahlt wurde */
        this._lastIncomeDay = 0;
    }

    // ===================================================================
    //  Kauf / Verkauf
    // ===================================================================

    /**
     * Versucht eine Immobilie zu kaufen.
     *
     * @param {object} player - Spieler-Entity
     * @param {object} building - Gebaeude-Objekt
     * @returns {{ success: boolean, reason?: string, property?: object }}
     */
    buyProperty(player, building) {
        if (!building || !building.id) {
            return { success: false, reason: 'invalidBuilding' };
        }

        const catalog = PROPERTY_CATALOG[building.type];
        if (!catalog) {
            return { success: false, reason: 'notForSale' };
        }

        if (player.ownedProperties.has(building.id)) {
            return { success: false, reason: 'alreadyOwned' };
        }

        if (player.money < catalog.price) {
            return { success: false, reason: 'noMoney' };
        }

        player.money -= catalog.price;
        player.ownedProperties.add(building.id);

        this.eventBus.emit('realEstate:purchased', {
            buildingId: building.id,
            type: building.type,
            price: catalog.price,
        });

        return {
            success: true,
            property: catalog,
        };
    }

    /**
     * Verkauft eine Immobilie (50% des Kaufpreises).
     *
     * @param {object} player
     * @param {object} building
     * @returns {{ success: boolean, reason?: string, refund?: number }}
     */
    sellProperty(player, building) {
        if (!building || !building.id) {
            return { success: false, reason: 'invalidBuilding' };
        }

        if (!player.ownedProperties.has(building.id)) {
            return { success: false, reason: 'notOwned' };
        }

        const catalog = PROPERTY_CATALOG[building.type];
        if (!catalog) {
            return { success: false, reason: 'notForSale' };
        }

        const refund = RealEstateSystem.getSellRefund(catalog.price);
        player.money += refund;
        player.ownedProperties.delete(building.id);

        // Falls der Spieler dort wohnt, Wohnsitz entfernen
        if (player.homePropertyId === building.id) {
            player.homePropertyId = null;
        }

        this.eventBus.emit('realEstate:sold', {
            buildingId: building.id,
            type: building.type,
            refund,
        });

        return { success: true, refund };
    }

    // ===================================================================
    //  Einziehen (Wohnsitz setzen)
    // ===================================================================

    /**
     * Setzt eine eigene Immobilie als Wohnsitz (Respawn-Punkt).
     *
     * @param {object} player
     * @param {object} building
     * @returns {{ success: boolean, reason?: string }}
     */
    moveIn(player, building) {
        if (!building || !building.id) {
            return { success: false, reason: 'invalidBuilding' };
        }

        if (!player.ownedProperties.has(building.id)) {
            return { success: false, reason: 'notOwned' };
        }

        player.homePropertyId = building.id;

        this.eventBus.emit('realEstate:movedIn', {
            buildingId: building.id,
        });

        return { success: true };
    }

    // ===================================================================
    //  Passives Einkommen (pro Ingame-Tag)
    // ===================================================================

    /**
     * Aktualisiert das passive Einkommen aus besessenen Immobilien.
     * Einkommen wird einmal pro Ingame-Tag ausgezahlt.
     *
     * @param {object} player
     * @param {Array} buildings - Alle Gebaeude der Welt
     * @param {number} deltaTime - Sekunden seit letztem Frame (unused, Tageswechsel-basiert)
     * @param {object} dayNightSystem - DayNightSystem-Instanz
     */
    update(player, buildings, deltaTime, dayNightSystem) {
        if (!player.ownedProperties || player.ownedProperties.size === 0) {
            return;
        }

        if (!dayNightSystem) {
            return;
        }

        // Tag-Wechsel erkennen: phaseIndex springt auf 0 (Tag beginnt)
        const currentPhaseIndex = dayNightSystem.phaseIndex ?? 0;

        if (this._lastPhaseIndex < 0) {
            // Erster Frame: initialisieren
            this._lastPhaseIndex = currentPhaseIndex;
            return;
        }

        // Tageswechsel: Phase springt von letzter Phase (dawn=3) auf erste (day=0)
        if (currentPhaseIndex === 0 && this._lastPhaseIndex !== 0) {
            this._dayCount++;

            // Einkommen auszahlen
            if (this._dayCount > this._lastIncomeDay) {
                let totalIncome = 0;
                for (const buildingId of player.ownedProperties) {
                    const building = buildings.find((b) => b && b.id === buildingId);
                    if (!building) continue;
                    const catalog = PROPERTY_CATALOG[building.type];
                    if (!catalog) continue;
                    totalIncome += catalog.income;
                }

                if (totalIncome > 0) {
                    player.money += totalIncome;
                    this._lastIncomeDay = this._dayCount;

                    this.eventBus.emit('realEstate:income', {
                        amount: totalIncome,
                        day: this._dayCount,
                    });
                }
            }
        }

        this._lastPhaseIndex = currentPhaseIndex;
    }

    // ===================================================================
    //  Hilfsfunktionen
    // ===================================================================

    /**
     * Gibt die Katalog-Infos fuer einen Gebaeudetyp zurueck.
     * @param {string} type
     * @returns {object|null}
     */
    static getCatalogEntry(type) {
        return PROPERTY_CATALOG[type] ?? null;
    }

    /**
     * Prueft ob ein Gebaeudetyp kaufbar ist.
     * @param {string} type
     * @returns {boolean}
     */
    static isPropertyType(type) {
        return type in PROPERTY_CATALOG;
    }

    /**
     * Berechnet den Verkaufserloes einer Immobilie (SSOT).
     * @param {number} price - Kaufpreis
     * @returns {number}
     */
    static getSellRefund(price) {
        return Math.floor(price * PROPERTY_SELL_RATE);
    }

    /**
     * Formatiert einen Geldbetrag.
     * @param {number} amount
     * @returns {string}
     */
    static formatMoney(amount) {
        return Math.floor(amount).toLocaleString('de-DE') + '$';
    }
}

export default RealEstateSystem;
