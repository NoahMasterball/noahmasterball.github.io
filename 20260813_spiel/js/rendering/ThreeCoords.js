import * as THREE from 'three';

/**
 * SSOT: Einzige Stelle für Koordinaten-Mapping Game → Three.js.
 *
 * Game-Koordinaten: x = rechts, y = runter (Canvas-Konvention)
 * Three.js:         x = rechts, y = hoch,  z = zum Betrachter
 *
 * Mapping: gameX → threeX,  gameY → -threeZ,  threeY = 0 (Bodenebene)
 */
export function gameToThree(gameX, gameY) {
    return new THREE.Vector3(gameX, 0, -gameY);
}

/**
 * Umkehrung: Three.js-Position zurück zu Game-Koordinaten.
 */
export function threeToGame(threePos) {
    return { x: threePos.x, y: -threePos.z };
}
