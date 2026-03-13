/**
 * ColorPalettes - Farbdefinitionen und Farb-Hilfsfunktionen.
 * Portiert aus dem alten OverworldGame-Code.
 */

/**
 * Feste Hausfarben (keine zufaelligen Farben).
 * Quelle: overworld.js Zeile ~140
 */
export const houseColors = [
    "#DEB887", "#F5DEB3", "#D2B48C", "#BC8F8F", "#CD853F",
    "#D2691E", "#A0522D", "#8B7355", "#D2B48C", "#F4A460",
];

/**
 * Interpoliert zwischen Color-Stops anhand eines Wertes (0..1).
 * Jeder Stop hat die Form { at: number, color: [r, g, b, a] }.
 *
 * @param {Array<{at: number, color: number[]}>} stops
 * @param {number} value - Wert zwischen 0 und 1
 * @returns {number[]} [r, g, b, a]
 */
export function sampleColorStops(stops, value) {
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
            return lerpColor(previous?.color, current?.color, localT);
        }

        previous = current;
    }

    const lastColor = stops[stops.length - 1]?.color;
    return Array.isArray(lastColor) ? lastColor.slice() : [0, 0, 0, 0];
}

/**
 * Interpoliert linear zwischen zwei RGBA-Farbarrays.
 *
 * @param {number[]} colorA - [r, g, b, a]
 * @param {number[]} colorB - [r, g, b, a]
 * @param {number} t - Interpolationsfaktor (0..1)
 * @returns {number[]} [r, g, b, a]
 */
export function lerpColor(colorA, colorB, t) {
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

/**
 * Konvertiert ein RGBA-Farbarray in einen CSS rgba()-String.
 *
 * @param {number[]} color - [r, g, b, a]
 * @param {number} [alphaMultiplier=1]
 * @returns {string}
 */
export function colorArrayToRgba(color, alphaMultiplier = 1) {
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