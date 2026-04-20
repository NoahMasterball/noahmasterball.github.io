import * as THREE from 'three';
import { WORLD, COLORS } from '../config/constants.js';

// Street-Netz + Sidewalks. Beides sind flache Quads, leicht über dem Meadow-Base
// positioniert (WORLD.STREET_Y / WORLD.SIDEWALK_Y), um Z-Fighting zu vermeiden.
//
// Streets = volles Grid-Netz entlang aller Zellgrenzen (garantiert, dass jedes
// Haus↔Wiese-Paar mindestens eine Street dazwischen hat).
// Sidewalks = Rechteck-Ring direkt um jedes Gebäude (noch innerhalb seiner Zelle,
// also zwischen Gebäude und Street).

export function createStreets() {
  const group = new THREE.Group();
  group.name = 'streets';
  const mat = new THREE.MeshLambertMaterial({ color: COLORS.STREET });

  const mapSize = WORLD.MAP_SIZE;
  const grid = WORLD.CHUNK_GRID;
  const cellSize = mapSize / grid;
  const width = WORLD.STREET_WIDTH;
  const half = mapSize / 2;

  // Horizontale Straßen (entlang X-Achse, an jeder Zellgrenze entlang Z).
  for (let i = 0; i <= grid; i++) {
    const z = i * cellSize - half;
    group.add(makeQuad(mapSize, width, 0, z, mat));
  }
  // Vertikale Straßen (entlang Z-Achse, an jeder Zellgrenze entlang X).
  for (let j = 0; j <= grid; j++) {
    const x = j * cellSize - half;
    group.add(makeQuad(width, mapSize, x, 0, mat));
  }
  return group;
}

export function createSidewalks(buildingDatas) {
  const group = new THREE.Group();
  group.name = 'sidewalks';
  const mat = new THREE.MeshLambertMaterial({ color: COLORS.SIDEWALK });
  const sw = WORLD.SIDEWALK_WIDTH;

  for (const b of buildingDatas) {
    const outerX = b.sizeX + 2 * sw;
    const outerZ = b.sizeZ + 2 * sw;
    const plate = makeQuad(outerX, outerZ, b.x, b.z, mat);
    plate.position.y = WORLD.SIDEWALK_Y;
    group.add(plate);
  }
  return group;
}

function makeQuad(sizeX, sizeZ, x, z, mat) {
  const geo = new THREE.PlaneGeometry(sizeX, sizeZ);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, WORLD.STREET_Y, z);
  return mesh;
}
