/**
 * RealEstateSystem - Immobilienmarkt: Miete und Kauf von Gebaeuden.
 *
 * SSOT: Alle Immobilien-Preise, Mieten und Kauf-Logik hier zentralisiert.
 * - Motel/Apartment: Mietbar (taegliche Miete wird abgezogen)
 * - Bungalow/Haeuser: Kaufbar ueber Immobilienmaklbuero
 * Miet-/Kauf-Abrechnung erfolgt pro Ingame-Tag (1 voller Tag/Nacht-Zyklus).
 */

// ---------------------------------------------------------------------------
// Miet-Katalog (SSOT fuer alle mietbaren Unterkuenfte)
// ---------------------------------------------------------------------------

/**
 * Mietbare Unterkuenfte: Schluessel = Building-Type, Wert = Miet-Details.
 * rent = Miete pro Ingame-Tag.
 */
export const RENTAL_CATALOG = {
    motel: {
        name: 'Sunrise Motel',
        rent: 50,
        description: 'Kleines Motelzimmer mit Bett, Waschbecken und Toilette.',
    },
    apartmentComplex: {
        name: 'Parkview Apartments',
        rent: 150,
        description: 'Gemuetliche Wohnung mit Bad, Doppelbett, Fernseher und mehr.',
    },
};

// ---------------------------------------------------------------------------
// Kauf-Katalog (SSOT fuer alle kaufbaren Immobilien ueber Makler)
// ---------------------------------------------------------------------------

/** Verkaufsrate: Anteil des Kaufpreises bei Verkauf (SSOT) */
export const PROPERTY_SELL_RATE = 0.5;

export const PROPERTY_CATALOG = {
    bungalow: {
        name: 'Bungalow am Stadtrand',
        price: 35000,
        description: 'Ein gemuetlicher Bungalow mit drei Raeumen: Wohnzimmer, Schlafzimmer und Kueche.',
    },
};

// ---------------------------------------------------------------------------
// Kompatibilitaet: isPropertyType prueft beide Kataloge
// ---------------------------------------------------------------------------

/**
 * Prueft ob ein Gebaeudetyp mietbar ist.
 * @param {string} type
 * @returns {boolean}
 */
export function isRentalType(type) {
    return type in RENTAL_CATALOG;
}

/**
 * Prueft ob ein Gebaeudetyp kaufbar ist (ueber Makler).
 * @param {string} type
 * @returns {boolean}
 */
export function isPurchasableType(type) {
    return type in PROPERTY_CATALOG;
}

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

        /** @type {number} Letzter Tag an dem Miete/Einkommen abgerechnet wurde */
        this._lastRentDay = 0;
    }

    // ===================================================================
    //  Miete (Motel / Apartment)
    // ===================================================================

    /**
     * Mietet eine Unterkunft. Spieler zahlt taegliche Miete.
     *
     * @param {object} player
     * @param {object} building
     * @returns {{ success: boolean, reason?: string, rental?: object }}
     */
    rentProperty(player, building) {
        if (!building || !building.id) {
            return { success: false, reason: 'invalidBuilding' };
        }

        const rental = RENTAL_CATALOG[building.type];
        if (!rental) {
            return { success: false, reason: 'notRentable' };
        }

        // Bereits gemietet?
        if (player.rentedPropertyId === building.id) {
            return { success: false, reason: 'alreadyRented' };
        }

        // Erste Miete sofort zahlen
        if (player.money < rental.rent) {
            return { success: false, reason: 'noMoney' };
        }

        player.money -= rental.rent;
        player.rentedPropertyId = building.id;
        player.homePropertyId = building.id;

        this.eventBus.emit('realEstate:rented', {
            buildingId: building.id,
            type: building.type,
            rent: rental.rent,
        });

        return { success: true, rental };
    }

    /**
     * Kuendigt die aktuelle Miete.
     *
     * @param {object} player
     * @param {object} building
     * @returns {{ success: boolean, reason?: string }}
     */
    cancelRental(player, building) {
        if (!building || !building.id) {
            return { success: false, reason: 'invalidBuilding' };
        }

        if (player.rentedPropertyId !== building.id) {
            return { success: false, reason: 'notRented' };
        }

        player.rentedPropertyId = null;

        // Wohnsitz nur entfernen wenn es die gemietete Unterkunft war
        if (player.homePropertyId === building.id) {
            player.homePropertyId = null;
        }

        this.eventBus.emit('realEstate:rentalCancelled', {
            buildingId: building.id,
        });

        return { success: true };
    }

    // ===================================================================
    //  Kauf / Verkauf (Bungalow etc. ueber Makler)
    // ===================================================================

    /**
     * Kauft eine Immobilie (Bungalow etc.).
     *
     * @param {object} player
     * @param {object} building
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

        return { success: true, property: catalog };
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
    //  Einziehen (Wohnsitz setzen - nur bei eigenen Immobilien)
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
    //  Taegliche Miet-Abrechnung (pro Ingame-Tag)
    // ===================================================================

    /**
     * Zieht taegliche Miete ab wenn Spieler eine Unterkunft gemietet hat.
     * Bei fehlendem Geld wird die Miete automatisch gekuendigt.
     *
     * @param {object} player
     * @param {Array} buildings - Alle Gebaeude der Welt
     * @param {number} deltaTime
     * @param {object} dayNightSystem
     */
    update(player, buildings, deltaTime, dayNightSystem) {
        if (!dayNightSystem) return;

        const currentPhaseIndex = dayNightSystem.phaseIndex ?? 0;

        if (this._lastPhaseIndex < 0) {
            this._lastPhaseIndex = currentPhaseIndex;
            return;
        }

        // Tageswechsel: Phase springt von letzter Phase (dawn=3) auf erste (day=0)
        if (currentPhaseIndex === 0 && this._lastPhaseIndex !== 0) {
            this._dayCount++;

            if (this._dayCount > this._lastRentDay) {
                this._lastRentDay = this._dayCount;

                // Miete abziehen
                if (player.rentedPropertyId) {
                    const building = buildings.find((b) => b && b.id === player.rentedPropertyId);
                    if (building) {
                        const rental = RENTAL_CATALOG[building.type];
                        if (rental) {
                            if (player.money >= rental.rent) {
                                player.money -= rental.rent;
                                this.eventBus.emit('realEstate:rentPaid', {
                                    buildingId: building.id,
                                    rent: rental.rent,
                                    day: this._dayCount,
                                });
                            } else {
                                // Kein Geld -> Miete kuendigen
                                player.rentedPropertyId = null;
                                if (player.homePropertyId === building.id) {
                                    player.homePropertyId = null;
                                }
                                this.eventBus.emit('realEstate:evicted', {
                                    buildingId: building.id,
                                    day: this._dayCount,
                                });
                            }
                        }
                    }
                }
            }
        }

        this._lastPhaseIndex = currentPhaseIndex;
    }

    // ===================================================================
    //  Hilfsfunktionen
    // ===================================================================

    /**
     * Gibt die Katalog-Infos fuer einen Gebaeudetyp zurueck (Miet- oder Kauf-Katalog).
     * @param {string} type
     * @returns {object|null}
     */
    static getCatalogEntry(type) {
        return RENTAL_CATALOG[type] ?? PROPERTY_CATALOG[type] ?? null;
    }

    /**
     * Gibt den Miet-Katalog-Eintrag zurueck.
     * @param {string} type
     * @returns {object|null}
     */
    static getRentalEntry(type) {
        return RENTAL_CATALOG[type] ?? null;
    }

    /**
     * Gibt den Kauf-Katalog-Eintrag zurueck.
     * @param {string} type
     * @returns {object|null}
     */
    static getPurchaseEntry(type) {
        return PROPERTY_CATALOG[type] ?? null;
    }

    /**
     * Prueft ob ein Gebaeudetyp mietbar oder kaufbar ist.
     * @param {string} type
     * @returns {boolean}
     */
    static isPropertyType(type) {
        return type in RENTAL_CATALOG || type in PROPERTY_CATALOG;
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
