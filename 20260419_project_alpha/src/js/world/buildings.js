import * as THREE from 'three';
import { WORLD, BUILDINGS } from '../config/constants.js';

// Erzeugt Building-Meshes aus den Daten, die map-generator.js liefert.
// Ein Gebäude = Group aus Wänden (Box) + Dach (dünne Box). Low-Poly-Platzhalter.
// Für Ruin-Typ reduziert sich die Höhe (aus BUILDINGS-Config) automatisch,
// optional schneiden wir das Dach ab.

const wallGeo = new THREE.BoxGeometry(1, 1, 1); // unit-Box, per-Instance-scale.
const roofGeo = new THREE.BoxGeometry(1, 1, 1);

export function createBuildings(buildingDatas) {
  const group = new THREE.Group();
  group.name = 'buildings';

  for (const b of buildingDatas) {
    group.add(createBuilding(b));
  }
  return group;
}

function createBuilding(b) {
  const g = new THREE.Group();
  g.position.set(b.x, 0, b.z);
  g.rotation.y = b.rotation;
  g.userData = {
    type: b.type,
    typeKey: b.typeKey,
    hasAlarm: b.hasAlarm,
    sizeX: b.sizeX,
    sizeZ: b.sizeZ,
    height: b.height,
  };

  const wallMat = new THREE.MeshLambertMaterial({ color: b.color });
  const walls = new THREE.Mesh(wallGeo, wallMat);
  walls.scale.set(b.sizeX, b.height, b.sizeZ);
  walls.position.y = b.height / 2;
  g.add(walls);

  // Ruinen bekommen kein geschlossenes Dach — hier über Höhe/Konfig gelöst:
  // wenn Höhe unter einer Schwelle, Dach weglassen.
  const isRuinLike = b.height < BUILDINGS.RUIN.maxHeight + 0.01 && b.typeKey === 'RUIN';
  if (!isRuinLike) {
    const roofMat = new THREE.MeshLambertMaterial({ color: b.roofColor });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    const roofThickness = WORLD.BUILDING_PAD; // Konstante wiederverwenden statt neuer Magic-Number.
    const overhang = WORLD.BUILDING_PAD;
    roof.scale.set(b.sizeX + overhang, roofThickness, b.sizeZ + overhang);
    roof.position.y = b.height + roofThickness / 2;
    g.add(roof);
  }
  return g;
}
