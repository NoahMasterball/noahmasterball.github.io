/**
 * WeaponCatalog - Zentrale Waffendefinitionen (reine Daten, keine Logik).
 * Portiert aus gta_old/overworld/js/overworld.js createWeaponCatalog() (Z.2553-2655)
 * und getWeaponDefinition() (Z.2535-2546).
 */

/**
 * Kanonische Waffenreihenfolge - SSOT fuer alle Module die Waffen sortieren.
 * @type {ReadonlyArray<string>}
 */
export const WEAPON_ORDER = Object.freeze([
    'pistol',
    'smg',
    'assaultRifle',
    'shotgun',
    'sniperRifle',
    'lmg',
]);

/**
 * Erstellt den Waffenkatalog als Map.
 * @returns {Map<string, object>}
 */
export function createWeaponCatalog() {
    const catalog = new Map();

    catalog.set('pistol', {
        id: 'pistol',
        name: '9mm Dienstpistole',
        damage: 24,
        fireRate: 420,
        projectileSpeed: 11,
        spread: 0.02,
        automatic: false,
        range: 660,
        displayColor: '#fca311',
        price: 250,
        shortLabel: '9mm',
    });

    catalog.set('smg', {
        id: 'smg',
        name: 'MP5 Maschinenpistole',
        damage: 26,
        fireRate: 120,
        projectileSpeed: 12,
        spread: 0.06,
        automatic: true,
        range: 640,
        displayColor: '#00f5d4',
        price: 650,
        shortLabel: 'MP5',
    });

    catalog.set('assaultRifle', {
        id: 'assaultRifle',
        name: 'AR-15 Sturmgewehr',
        damage: 48,
        fireRate: 180,
        projectileSpeed: 14,
        spread: 0.04,
        automatic: true,
        range: 860,
        displayColor: '#ef476f',
        price: 1400,
        shortLabel: 'AR-15',
    });

    catalog.set('shotgun', {
        id: 'shotgun',
        name: 'Pump-Action Schrotflinte',
        damage: 22,
        fireRate: 1900,
        projectileSpeed: 10,
        spread: 0.18,
        automatic: false,
        pellets: 6,
        range: 360,
        displayColor: '#7209b7',
        price: 900,
        shortLabel: 'Shotgun',
    });

    catalog.set('sniperRifle', {
        id: 'sniperRifle',
        name: 'AX-50 Scharfschuetzengewehr',
        damage: 160,
        fireRate: 1700,
        projectileSpeed: 18,
        spread: 0.004,
        automatic: false,
        range: 1400,
        displayColor: '#3f37c9',
        price: 3200,
        shortLabel: 'Sniper',
    });

    catalog.set('lmg', {
        id: 'lmg',
        name: 'M249 Leichtes MG',
        damage: 44,
        fireRate: 140,
        projectileSpeed: 13,
        spread: 0.07,
        automatic: true,
        range: 900,
        displayColor: '#06d6a0',
        price: 2600,
        shortLabel: 'M249',
    });

    return catalog;
}

/**
 * Gibt die Waffendefinition fuer eine ID zurueck.
 * @param {Map<string, object>} catalog - Der Waffenkatalog
 * @param {string} id - Waffen-ID
 * @returns {object|null}
 */
export function getWeaponDefinition(catalog, id) {
    if (!id) {
        return null;
    }
    return catalog.get(id) ?? null;
}
