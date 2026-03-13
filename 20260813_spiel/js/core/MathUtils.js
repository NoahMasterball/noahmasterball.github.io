/**
 * MathUtils - Mathematische Hilfsfunktionen fuer Physik, Kollision und Zufall.
 */

/**
 * Euklidische Distanz zwischen zwei Punkten.
 */
export function distanceBetween(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Begrenzt einen Wert auf [min, max].
 */
export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

/**
 * Lineare Interpolation zwischen a und b.
 */
export function lerp(a, b, t) {
    return a + (b - a) * t;
}

/**
 * Prueft ob ein Punkt (px, py) in einem Rechteck (rx, ry, rw, rh) liegt.
 */
export function pointInRect(px, py, rx, ry, rw, rh) {
    return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
}

/**
 * Prueft ob ein Kreis ein Rechteck schneidet.
 */
export function circleIntersectsRect(cx, cy, cr, rx, ry, rw, rh) {
    const closestX = clamp(cx, rx, rx + rw);
    const closestY = clamp(cy, ry, ry + rh);
    const dx = cx - closestX;
    const dy = cy - closestY;
    return (dx * dx + dy * dy) <= (cr * cr);
}

/**
 * Berechnet die aufgeloeste Position eines Kreises nach Ueberlappung mit einem Rechteck.
 * Gibt {x, y} zurueck - die korrigierte Kreismitte.
 */
export function resolveCircleRectOverlap(cx, cy, cr, rx, ry, rw, rh) {
    const closestX = clamp(cx, rx, rx + rw);
    const closestY = clamp(cy, ry, ry + rh);
    const dx = cx - closestX;
    const dy = cy - closestY;
    const distSq = dx * dx + dy * dy;

    if (distSq === 0) {
        // Kreismitte liegt im Rechteck - schiebe nach aussen
        const centerRX = rx + rw / 2;
        const centerRY = ry + rh / 2;
        const diffX = cx - centerRX;
        const diffY = cy - centerRY;
        if (Math.abs(diffX) > Math.abs(diffY)) {
            return { x: diffX >= 0 ? rx + rw + cr : rx - cr, y: cy };
        } else {
            return { x: cx, y: diffY >= 0 ? ry + rh + cr : ry - cr };
        }
    }

    const dist = Math.sqrt(distSq);
    if (dist >= cr) {
        return { x: cx, y: cy }; // Keine Ueberlappung
    }

    const overlap = cr - dist;
    const nx = dx / dist;
    const ny = dy / dist;
    return { x: cx + nx * overlap, y: cy + ny * overlap };
}

/**
 * Deterministische Pseudo-Zufallszahl aus 2D-Koordinaten (0..1).
 * Portiert aus dem alten Code (OverworldGame.prototype.pseudoRandom2D).
 */
export function pseudoRandom2D(x, y) {
    const value = Math.sin(x * 127.1 + y * 311.7 + 13.7) * 43758.5453123;
    return value - Math.floor(value);
}

export default {
    distanceBetween,
    clamp,
    lerp,
    pointInRect,
    circleIntersectsRect,
    resolveCircleRectOverlap,
    pseudoRandom2D,
};