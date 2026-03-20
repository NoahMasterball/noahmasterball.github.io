/**
 * Persistence - Alle localStorage-Operationen als reine Funktionen.
 * SSOT fuer Speichern/Laden von Spielstand-Daten.
 *
 * Portiert aus gta_old/overworld/js/overworld.js:
 *   loadWeaponInventory()      (Z.2789-2817)
 *   persistWeaponInventory()   (Z.2819-2830)
 *   loadWeaponLoadout()        (Z.2832-2890)
 *   persistWeaponLoadout()     (Z.2892-2905)
 *   loadCurrentWeaponId()      (Z.2907-2929)
 *   persistCurrentWeaponId()   (Z.2931-2945)
 *   loadCasinoCredits()        (Z.2657-2679)
 *   storeCasinoCredits()       (Z.2681-2694)
 *   loadPlayerMoney()          (neu, war im Originalcode nicht persistiert)
 *   persistPlayerMoney()       (neu)
 */

import { WEAPON_ORDER } from './WeaponCatalog.js';

// ───────────────────── Hilfsfunktionen ─────────────────────

/** @returns {boolean} true wenn localStorage verfuegbar */
function hasStorage() {
    return typeof window !== 'undefined' && !!window.localStorage;
}

/**
 * Sicheres Lesen aus localStorage.
 * @param {string} key
 * @returns {string|null}
 */
function readItem(key) {
    if (!hasStorage()) return null;
    try {
        return window.localStorage.getItem(key);
    } catch (err) {
        console.warn(`[Persistence] Lesen von "${key}" fehlgeschlagen:`, err);
        return null;
    }
}

/**
 * Sicheres Schreiben in localStorage.
 * @param {string} key
 * @param {string} value
 */
function writeItem(key, value) {
    if (!hasStorage()) return;
    try {
        window.localStorage.setItem(key, value);
    } catch (err) {
        console.warn(`[Persistence] Schreiben von "${key}" fehlgeschlagen:`, err);
    }
}

/**
 * Sicheres Entfernen aus localStorage.
 * @param {string} key
 */
function removeItem(key) {
    if (!hasStorage()) return;
    try {
        window.localStorage.removeItem(key);
    } catch (err) {
        console.warn(`[Persistence] Loeschen von "${key}" fehlgeschlagen:`, err);
    }
}

// ───────────────────── Spieler-Position (Rueckkehr aus Gebaeude) ────

const KEY_RETURN_POSITION = 'overworldReturnPosition';

/**
 * Speichert die Spielerposition und Kamera fuer die Rueckkehr aus einem Gebaeude.
 * @param {number} px - Spieler X
 * @param {number} py - Spieler Y
 * @param {number} cx - Kamera X
 * @param {number} cy - Kamera Y
 */
export function saveReturnPosition(px, py, cx, cy) {
    writeItem(KEY_RETURN_POSITION, JSON.stringify({ px, py, cx, cy }));
}

/**
 * Laedt und entfernt die gespeicherte Rueckkehr-Position.
 * @returns {{ px: number, py: number, cx: number, cy: number }|null}
 */
export function loadReturnPosition() {
    const raw = readItem(KEY_RETURN_POSITION);
    if (!raw) return null;
    removeItem(KEY_RETURN_POSITION);
    try {
        const data = JSON.parse(raw);
        if (Number.isFinite(data.px) && Number.isFinite(data.py)) {
            return data;
        }
    } catch (err) { /* ignorieren */ }
    return null;
}

// ───────────────────── Waffen-Inventar ─────────────────────

const KEY_WEAPON_INVENTORY = 'overworldWeaponInventory';

/**
 * Laedt das Waffeninventar aus localStorage.
 * Spieler startet ohne Waffen - Waffen muessen im Shop gekauft werden.
 *
 * @returns {Set<string>} Besessene Waffen-IDs
 */
export function loadWeaponInventory() {
    const validIds = new Set(WEAPON_ORDER);
    const owned = new Set();

    const raw = readItem(KEY_WEAPON_INVENTORY);
    if (raw) {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                for (const id of parsed) {
                    if (typeof id === 'string' && validIds.has(id)) {
                        owned.add(id);
                    }
                }
            }
        } catch (error) {
            console.warn('Waffeninventar konnte nicht geladen werden', error);
        }
    }

    return owned;
}

/**
 * Speichert das Waffeninventar in localStorage.
 * @param {Set<string>} weaponInventory
 */
export function persistWeaponInventory(weaponInventory) {
    const owned = Array.from(weaponInventory).filter((id) => WEAPON_ORDER.includes(id));
    writeItem(KEY_WEAPON_INVENTORY, JSON.stringify(owned));
}

// ───────────────────── Waffen-Loadout ─────────────────────

const KEY_WEAPON_LOADOUT = 'overworldWeaponLoadout';
const MAX_LOADOUT_SLOTS = 3;

/**
 * Laedt das Waffen-Loadout (bis zu 3 Slots) aus localStorage.
 * Gibt leeres Array zurueck wenn keine Waffen im Besitz.
 *
 * @param {Set<string>} weaponInventory - Aktuelle besessene Waffen
 * @returns {Array<string>} Loadout-Slot-IDs
 */
export function loadWeaponLoadout(weaponInventory) {
    const fallback = WEAPON_ORDER.filter((id) => weaponInventory.has(id));
    const slots = [];
    const seen = new Set();

    const raw = readItem(KEY_WEAPON_LOADOUT);
    if (raw) {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                for (const id of parsed) {
                    if (typeof id !== 'string') continue;
                    if (!WEAPON_ORDER.includes(id)) continue;
                    if (!weaponInventory.has(id)) continue;
                    if (seen.has(id)) continue;
                    slots.push(id);
                    seen.add(id);
                    if (slots.length >= MAX_LOADOUT_SLOTS) break;
                }
            }
        } catch (error) {
            console.warn('Waffen-Slots konnten nicht geladen werden', error);
        }
    }

    if (!slots.length) {
        for (const id of fallback) {
            if (seen.has(id)) continue;
            slots.push(id);
            seen.add(id);
            if (slots.length >= MAX_LOADOUT_SLOTS) break;
        }
    }

    return slots;
}

/**
 * Speichert das Waffen-Loadout in localStorage.
 * @param {Array<string>} weaponLoadout
 * @param {Set<string>} weaponInventory
 */
export function persistWeaponLoadout(weaponLoadout, weaponInventory) {
    const slots = Array.isArray(weaponLoadout)
        ? weaponLoadout.filter((id) => WEAPON_ORDER.includes(id) && weaponInventory.has(id))
        : [];
    writeItem(KEY_WEAPON_LOADOUT, JSON.stringify(slots));
}

// ───────────────────── Aktuelle Waffe ─────────────────────

const KEY_CURRENT_WEAPON = 'overworldCurrentWeaponId';

/**
 * Laedt die aktuell ausgeruestete Waffen-ID aus localStorage.
 * Gibt null zurueck wenn keine Waffen im Besitz.
 *
 * @param {Set<string>} weaponInventory
 * @param {Array<string>} weaponLoadout
 * @returns {string|null} Waffen-ID oder null wenn unbewaffnet
 */
export function loadCurrentWeaponId(weaponInventory, weaponLoadout) {
    if (!weaponInventory || weaponInventory.size === 0) {
        return null;
    }

    const fallback = Array.isArray(weaponLoadout) && weaponLoadout.length
        ? weaponLoadout[0]
        : null;

    const stored = readItem(KEY_CURRENT_WEAPON);
    if (stored && weaponInventory.has(stored)) {
        return stored;
    }

    if (fallback && weaponInventory.has(fallback)) {
        return fallback;
    }

    const owned = WEAPON_ORDER.find((id) => weaponInventory.has(id));
    return owned ?? null;
}

/**
 * Speichert die aktuell ausgeruestete Waffen-ID in localStorage.
 * @param {string} currentWeaponId
 * @param {Set<string>} weaponInventory
 */
export function persistCurrentWeaponId(currentWeaponId, weaponInventory) {
    if (currentWeaponId && weaponInventory.has(currentWeaponId)) {
        writeItem(KEY_CURRENT_WEAPON, currentWeaponId);
    } else {
        removeItem(KEY_CURRENT_WEAPON);
    }
}

// ───────────────────── Casino-Credits ─────────────────────

const KEY_CASINO_CREDITS = 'casinoCredits';

/**
 * Laedt Casino-Credits aus localStorage.
 * @param {number} [fallback=0] - Rueckgabewert wenn nichts gespeichert
 * @returns {number}
 */
export function loadCasinoCredits(fallback = 0) {
    const raw = readItem(KEY_CASINO_CREDITS);
    if (raw == null) {
        return fallback;
    }

    const parsed = parseInt(raw, 10);

    if (!Number.isFinite(parsed) || parsed < 0) {
        return 0;
    }

    return parsed;
}

/**
 * Speichert Casino-Credits in localStorage.
 * @param {number} amount
 * @returns {number} Der tatsaechlich gespeicherte Wert
 */
export function storeCasinoCredits(amount) {
    const value = Math.max(0, Math.floor(Number(amount) || 0));
    writeItem(KEY_CASINO_CREDITS, String(value));
    return value;
}

// ───────────────────── Spieler-Geld ─────────────────────

const KEY_PLAYER_MONEY = 'overworldPlayerMoney';
const DEFAULT_PLAYER_MONEY = 1500;

/**
 * Laedt das Spielergeld aus localStorage.
 * @param {number} [fallback=1500] - Standardwert
 * @returns {number}
 */
export function loadPlayerMoney(fallback = DEFAULT_PLAYER_MONEY) {
    const raw = readItem(KEY_PLAYER_MONEY);
    if (raw == null) {
        return fallback;
    }

    const parsed = parseInt(raw, 10);

    if (!Number.isFinite(parsed) || parsed < 0) {
        return fallback;
    }

    return parsed;
}

/**
 * Speichert das Spielergeld in localStorage.
 * @param {number} amount
 * @returns {number} Der tatsaechlich gespeicherte Wert
 */
export function persistPlayerMoney(amount) {
    const value = Math.max(0, Math.floor(Number(amount) || 0));
    writeItem(KEY_PLAYER_MONEY, String(value));
    return value;
}

// ───────────────────── Immobilien-Besitz ─────────────────────

const KEY_OWNED_PROPERTIES = 'overworldOwnedProperties';

/**
 * Laedt die besessenen Immobilien aus localStorage.
 * @returns {Set<string>} Set von Building-IDs
 */
export function loadOwnedProperties() {
    const owned = new Set();
    const raw = readItem(KEY_OWNED_PROPERTIES);
    if (raw) {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                for (const id of parsed) {
                    if (typeof id === 'string') {
                        owned.add(id);
                    }
                }
            }
        } catch (error) {
            console.warn('Immobilien konnten nicht geladen werden', error);
        }
    }
    return owned;
}

/**
 * Speichert die besessenen Immobilien in localStorage.
 * @param {Set<string>} ownedProperties
 */
export function persistOwnedProperties(ownedProperties) {
    const ids = Array.from(ownedProperties).filter((id) => typeof id === 'string');
    writeItem(KEY_OWNED_PROPERTIES, JSON.stringify(ids));
}

// ───────────────────── Wohnsitz (Home Property) ─────────────────────

const KEY_HOME_PROPERTY = 'overworldHomeProperty';

/**
 * Laedt die Wohnsitz-Building-ID aus localStorage.
 * @returns {string|null}
 */
export function loadHomeProperty() {
    const raw = readItem(KEY_HOME_PROPERTY);
    if (raw && typeof raw === 'string' && raw.length > 0) {
        return raw;
    }
    return null;
}

/**
 * Speichert die Wohnsitz-Building-ID in localStorage.
 * @param {string|null} buildingId
 */
export function persistHomeProperty(buildingId) {
    if (buildingId && typeof buildingId === 'string') {
        writeItem(KEY_HOME_PROPERTY, buildingId);
    } else {
        removeItem(KEY_HOME_PROPERTY);
    }
}

// ───────────────────── Gemietete Unterkunft ─────────────────────

const KEY_RENTED_PROPERTY = 'overworldRentedProperty';

/**
 * Laedt die gemietete Unterkunft-Building-ID aus localStorage.
 * @returns {string|null}
 */
export function loadRentedProperty() {
    const raw = readItem(KEY_RENTED_PROPERTY);
    if (raw && typeof raw === 'string' && raw.length > 0) {
        return raw;
    }
    return null;
}

/**
 * Speichert die gemietete Unterkunft-Building-ID in localStorage.
 * @param {string|null} buildingId
 */
export function persistRentedProperty(buildingId) {
    if (buildingId && typeof buildingId === 'string') {
        writeItem(KEY_RENTED_PROPERTY, buildingId);
    } else {
        removeItem(KEY_RENTED_PROPERTY);
    }
}
