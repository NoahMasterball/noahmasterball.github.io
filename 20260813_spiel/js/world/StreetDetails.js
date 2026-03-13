/**
 * StreetDetails - Erstellt Strassendetails (Baeume, Baenke, Laternen, etc.).
 *
 * Portiert aus gta_old/overworld/js/overworld.js:
 *   createStreetDetails() Zeilen 3596-3777
 *
 * SSOT: Alle Strassendetail-Positionen hier zentralisiert.
 */

/** Standard-Strassenkonfiguration */
const DEFAULT_ROAD_HALF_WIDTH = 35;
const DEFAULT_SIDEWALK_WIDTH = 36;

/**
 * Erstellt alle Strassendetails (Baeume, Baenke, Laternen, Muelltonnen, etc.).
 *
 * @param {object} [config={}]
 * @param {number} [config.roadHalfWidth=35] - Halbe Strassenbreite
 * @param {number} [config.sidewalkWidth=36] - Buergersteigbreite
 * @returns {object} Detail-Objekt mit parkingLots, parkingBays, trees, benches, etc.
 */
export function createStreetDetails(config = {}) {
    const roadHalfWidth = config.roadHalfWidth ?? DEFAULT_ROAD_HALF_WIDTH;
    const sidewalkWidth = config.sidewalkWidth ?? DEFAULT_SIDEWALK_WIDTH;

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
        planters: [],
    };

    // Deduplizierung fuer Baeume
    const treePositions = new Set();

    const addTree = (x, y, size = 30, variant = 0) => {
        const key = `${Math.round(x)}_${Math.round(y)}`;
        if (treePositions.has(key)) {
            return;
        }
        treePositions.add(key);
        details.trees.push({ x, y, size, variant });
    };

    // Baeume entlang horizontaler Strassen
    const horizontalRows = [900, 1700];
    for (const y of horizontalRows) {
        const upper = y - roadHalfWidth - sidewalkWidth / 2;
        const lower = y + roadHalfWidth + sidewalkWidth / 2;
        for (let x = 260; x <= 3240; x += 220) {
            addTree(x, upper, 30, (x / 220) % 3);
            addTree(x, lower, 32, ((x + 110) / 180) % 3);
        }
    }

    // Parkplatz
    details.parkingLots.push({
        x: 2490,
        y: 1500,
        width: 420,
        height: 140,
        rows: 2,
        slots: 6,
        aisle: 26,
        padding: 14,
        surfaceColor: '#2d2f34',
    });

    // Baeume entlang vertikaler Strassen
    const verticalColumns = [950, 1700, 2950, 3350];
    for (const x of verticalColumns) {
        const left = x - roadHalfWidth - sidewalkWidth / 2;
        const right = x + roadHalfWidth + sidewalkWidth / 2;
        for (let y = 260; y <= 2360; y += 220) {
            addTree(left, y, 28, (y / 210) % 3);
            addTree(right, y, 28, ((y + 90) / 190) % 3);
        }
    }

    // Baenke
    details.benches.push({ x: 1130, y: 1780, orientation: "horizontal" });
    details.benches.push({ x: 1280, y: 1780, orientation: "horizontal" });
    details.benches.push({ x: 1430, y: 1780, orientation: "horizontal" });
    details.benches.push({ x: 1560, y: 980, orientation: "vertical" });
    details.benches.push({ x: 560, y: 1720, orientation: "horizontal" });

    // Fahrradstaender
    details.bikeRacks.push({ x: 1220, y: 1885, orientation: "horizontal" });
    details.bikeRacks.push({ x: 1380, y: 1885, orientation: "horizontal" });
    details.bikeRacks.push({ x: 1520, y: 840, orientation: "vertical" });

    // Bushaltestellen
    details.busStops.push({ x: 1040, y: 1680, orientation: "horizontal", length: 140 });
    details.busStops.push({ x: 1860, y: 1680, orientation: "horizontal", length: 140 });

    // Strassenlampen
    const lampRows = [
        { y: 1860, start: 1100, end: 1620, step: 120 },
        { y: 820, start: 1180, end: 1540, step: 120 },
        { y: 2120, start: 1780, end: 2320, step: 140 },
        { y: 1180, start: 2760, end: 3260, step: 120 },
    ];
    for (const row of lampRows) {
        for (let x = row.start; x <= row.end; x += row.step) {
            details.lamps.push({ x, y: row.y });
        }
    }
    details.lamps.push({ x: 360, y: 860 });
    details.lamps.push({ x: 360, y: 1740 });

    // Muelltonnen
    details.bins.push({ x: 1180, y: 1760 });
    details.bins.push({ x: 1340, y: 1760 });
    details.bins.push({ x: 1500, y: 1760 });
    details.bins.push({ x: 560, y: 1700 });

    // Parkbuchten
    details.parkingBays.push({ x: 240, y: 870, width: 110, height: 42, orientation: "horizontal" });
    details.parkingBays.push({ x: 360, y: 870, width: 110, height: 42, orientation: "horizontal" });
    details.parkingBays.push({ x: 480, y: 870, width: 110, height: 42, orientation: "horizontal" });
    details.parkingBays.push({ x: 1880, y: 880, width: 120, height: 46, orientation: "horizontal" });
    details.parkingBays.push({ x: 2980, y: 1140, width: 140, height: 46, orientation: "horizontal" });

    // Pflanzkaesten
    details.planters.push({ x: 1160, y: 1840, width: 80, height: 32 });
    details.planters.push({ x: 1320, y: 1840, width: 80, height: 32 });
    details.planters.push({ x: 1480, y: 1840, width: 80, height: 32 });

    // Pfuetzen
    details.puddles.push({ x: 960, y: 880, radius: 26 });
    details.puddles.push({ x: 1620, y: 1680, radius: 32 });
    details.puddles.push({ x: 420, y: 1680, radius: 22 });

    return details;
}
