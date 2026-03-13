/**
 * Casino - Logik fuer den Starlight Casino Tower.
 *
 * Portiert aus gta_old/overworld/js/overworld.js:
 *   convertDollarsToCredits()    Zeilen 2708-2726
 *   convertCreditsToDollars()    Zeilen 2728-2746
 *   loadCasinoCredits()          Zeilen 2657-2678
 *   storeCasinoCredits()         Zeilen 2681-2694
 *   refreshCasinoCreditsCache()  Zeilen 2696-2705
 *   handleCasinoEntry()          Zeilen 743-749
 *   Casino-UI-Logik              Zeilen 751-920
 *
 * SSOT: Alle Casino-Konvertierungs- und Credits-Logik hier zentralisiert.
 */

/** Standard-Wechselkurs: 1 Dollar = N Credits */
const DEFAULT_CREDIT_RATE = 10;

/** LocalStorage-Key fuer Credits */
const CREDITS_STORAGE_KEY = "casinoCredits";

export class Casino {

    /**
     * @param {object} [config={}]
     * @param {number} [config.creditRate=10] - Wechselkurs Dollar -> Credits
     */
    constructor(config = {}) {
        this.creditRate = config.creditRate ?? DEFAULT_CREDIT_RATE;
    }

    // -----------------------------------------------------------------------
    // Credits-Persistenz (LocalStorage)
    // -----------------------------------------------------------------------

    /**
     * Laedt Casino-Credits aus dem LocalStorage.
     *
     * @param {number} [fallback=0] - Rueckgabewert wenn nichts gespeichert
     * @returns {number}
     */
    loadCredits(fallback = 0) {
        if (typeof window === "undefined" || !window.localStorage) {
            return Math.max(0, fallback);
        }

        try {
            const raw = window.localStorage.getItem(CREDITS_STORAGE_KEY);
            if (raw == null) {
                return Math.max(0, fallback);
            }

            const parsed = parseInt(raw, 10);
            if (!Number.isFinite(parsed) || parsed < 0) {
                return 0;
            }

            return parsed;
        } catch (err) {
            console.warn("Casino credits konnten nicht geladen werden:", err);
            return Math.max(0, fallback);
        }
    }

    /**
     * Speichert Casino-Credits im LocalStorage.
     *
     * @param {number} amount
     * @returns {number} Gespeicherter Wert
     */
    storeCredits(amount) {
        const value = Math.max(0, Math.floor(Number(amount) || 0));

        if (typeof window !== "undefined" && window.localStorage) {
            try {
                window.localStorage.setItem(CREDITS_STORAGE_KEY, String(value));
            } catch (err) {
                console.warn("Casino credits konnten nicht gespeichert werden:", err);
            }
        }

        return value;
    }

    // -----------------------------------------------------------------------
    // Konvertierung
    // -----------------------------------------------------------------------

    /**
     * Konvertiert Dollars zu Casino-Credits.
     * Portiert aus convertDollarsToCredits() Zeilen 2708-2726.
     *
     * @param {object} player - Spieler-Entity (braucht player.money)
     * @param {number} [amount] - Betrag in Dollar (Standard: alles)
     * @returns {{ success: boolean, reason?: string, dollarsSpent: number, creditsAdded: number, totalCredits: number }}
     */
    convertDollarsToCredits(player, amount) {
        const rate = this.creditRate;
        const availableDollars = amount !== undefined
            ? Math.floor(Math.max(0, Math.min(Number(amount), Number(player.money ?? 0))))
            : Math.floor(Math.max(0, Number(player.money ?? 0)));

        if (!(availableDollars > 0)) {
            return {
                success: false,
                reason: "noMoney",
                dollarsSpent: 0,
                creditsAdded: 0,
                totalCredits: this.loadCredits(player.casinoCredits ?? 0),
            };
        }

        const creditsAdded = availableDollars * rate;
        const currentCredits = this.loadCredits(player.casinoCredits ?? 0);
        const newTotal = currentCredits + creditsAdded;

        player.money = Math.max(0, (player.money ?? 0) - availableDollars);
        this.storeCredits(newTotal);
        player.casinoCredits = newTotal;

        return {
            success: true,
            dollarsSpent: availableDollars,
            creditsAdded,
            totalCredits: newTotal,
        };
    }

    /**
     * Konvertiert Casino-Credits zurueck zu Dollars.
     * Portiert aus convertCreditsToDollars() Zeilen 2728-2746.
     *
     * @param {object} player - Spieler-Entity (braucht player.money, player.casinoCredits)
     * @param {number} [amount] - Credits zum Umtauschen (Standard: alle)
     * @returns {{ success: boolean, reason?: string, creditsSpent: number, dollarsGained: number, totalCredits: number }}
     */
    convertCreditsToDollars(player, amount) {
        const rate = this.creditRate;
        const currentCredits = this.loadCredits(player.casinoCredits ?? 0);

        const maxCredits = amount !== undefined
            ? Math.floor(Math.max(0, Math.min(Number(amount), currentCredits)))
            : currentCredits;

        const availableCredits = Math.floor(Math.max(0, Number(maxCredits)));

        if (availableCredits < rate) {
            return {
                success: false,
                reason: "noCredits",
                creditsSpent: 0,
                dollarsGained: 0,
                totalCredits: availableCredits,
            };
        }

        const dollarsGained = Math.floor(availableCredits / rate);
        const creditsSpent = dollarsGained * rate;
        const newTotal = currentCredits - creditsSpent;

        this.storeCredits(newTotal);
        player.money = (player.money ?? 0) + dollarsGained;
        player.casinoCredits = newTotal;

        return {
            success: true,
            creditsSpent,
            dollarsGained,
            totalCredits: newTotal,
        };
    }

    // -----------------------------------------------------------------------
    // Hilfsfunktionen
    // -----------------------------------------------------------------------

    /**
     * Aktualisiert den Credits-Cache des Spielers aus dem LocalStorage.
     *
     * @param {object} player
     */
    refreshCreditsCache(player) {
        player.casinoCredits = this.loadCredits(player.casinoCredits ?? 0);
    }

    /**
     * Gibt den Casino-Eingangs-URL zurueck (fuer Navigation zum Casino-Spiel).
     *
     * @returns {string}
     */
    getCasinoGameUrl() {
        return "../casinogame/index.html";
    }

    /**
     * Formatiert einen Geldbetrag fuer die Anzeige.
     *
     * @param {number} dollars
     * @returns {string}
     */
    formatMoney(dollars) {
        const value = Math.floor(Math.max(0, Number(dollars) || 0));
        return value.toLocaleString("de-DE") + "$";
    }

    /**
     * Formatiert Credits fuer die Anzeige.
     *
     * @param {number} credits
     * @returns {string}
     */
    formatCredits(credits) {
        const value = Math.floor(Math.max(0, Number(credits) || 0));
        return value.toLocaleString("de-DE");
    }

    /**
     * Berechnet den Info-Text fuer die Casino-Interaktion.
     *
     * @param {object} player
     * @returns {string}
     */
    getInteractionMessage(player) {
        const rate = this.creditRate;
        const moneyText = this.formatMoney(player.money ?? 0);
        const creditText = this.formatCredits(player.casinoCredits ?? 0) + " Credits";
        return `Kurs 1$ = ${rate} Credits | Bargeld: ${moneyText} | Credits: ${creditText}`;
    }

    /**
     * Berechnet ob Kauf/Auszahlung moeglich ist.
     *
     * @param {object} player
     * @returns {{ canBuy: boolean, canCashOut: boolean, dollarsAvailable: number, creditsAvailable: number }}
     */
    getButtonState(player) {
        const rate = this.creditRate;
        const dollarsAvailable = Math.floor(Math.max(0, Number(player.money ?? 0)));
        const creditsAvailable = Math.floor(Math.max(0, Number(player.casinoCredits ?? 0)));

        return {
            canBuy: dollarsAvailable > 0,
            canCashOut: creditsAvailable >= rate,
            dollarsAvailable,
            creditsAvailable,
        };
    }
}

export default Casino;
