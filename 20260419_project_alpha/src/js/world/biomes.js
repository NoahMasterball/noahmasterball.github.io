import * as THREE from 'three';
import { WORLD, COLORS } from '../config/constants.js';
import { mulberry32 } from './map-generator.js';

// Meadow-Base (eine große Plane über die gesamte Map, grün) +
// Scatter-Objekte (Sträucher als Ikosaeder, Steine als Boxen) pro Meadow-Zelle,
// beide via InstancedMesh für Performance.
//
// Scatter-Positionen sind pro Meadow deterministisch über scatterSeed.

const bushGeo = new THREE.IcosahedronGeometry(WORLD.SCATTER_BUSH_RADIUS, 0);
const stoneGeo = new THREE.BoxGeometry(WORLD.SCATTER_STONE_SIZE, WORLD.SCATTER_STONE_SIZE, WORLD.SCATTER_STONE_SIZE);

export function createMeadowBase() {
  const geo = new THREE.PlaneGeometry(WORLD.MAP_SIZE, WORLD.MAP_SIZE);
  const mat = new THREE.MeshLambertMaterial({ color: COLORS.MEADOW });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = WORLD.MEADOW_Y;
  mesh.name = 'meadow-base';
  return mesh;
}

export function createMeadowScatter(meadows) {
  const group = new THREE.Group();
  group.name = 'meadow-scatter';
  if (meadows.length === 0) return group;

  const scatterPerCell = WORLD.MEADOW_SCATTER_COUNT;
  const totalScatter = meadows.length * scatterPerCell;
  const bushCount = Math.round(totalScatter * WORLD.SCATTER_BUSH_RATIO);
  const stoneCount = totalScatter - bushCount;

  const bushMat = new THREE.MeshLambertMaterial({ color: COLORS.BUSH });
  const stoneMat = new THREE.MeshLambertMaterial({ color: COLORS.STONE });

  const bushes = new THREE.InstancedMesh(bushGeo, bushMat, bushCount);
  const stones = new THREE.InstancedMesh(stoneGeo, stoneMat, stoneCount);

  const tmp = new THREE.Object3D();
  let bushIdx = 0, stoneIdx = 0;

  for (const m of meadows) {
    const rand = mulberry32(m.scatterSeed || 1);
    const half = m.size / 2;
    for (let k = 0; k < scatterPerCell; k++) {
      const x = m.centerX + (rand() * 2 - 1) * half;
      const z = m.centerZ + (rand() * 2 - 1) * half;
      const scale = WORLD.SCATTER_MIN_SCALE + rand() * (WORLD.SCATTER_MAX_SCALE - WORLD.SCATTER_MIN_SCALE);
      const yaw = rand() * Math.PI * 2;

      const isBush = rand() < WORLD.SCATTER_BUSH_RATIO;
      tmp.position.set(x, scale * (isBush ? WORLD.SCATTER_BUSH_RADIUS : WORLD.SCATTER_STONE_SIZE / 2), z);
      tmp.rotation.set(0, yaw, 0);
      tmp.scale.setScalar(scale);
      tmp.updateMatrix();

      if (isBush && bushIdx < bushCount) {
        bushes.setMatrixAt(bushIdx++, tmp.matrix);
      } else if (!isBush && stoneIdx < stoneCount) {
        stones.setMatrixAt(stoneIdx++, tmp.matrix);
      } else if (bushIdx < bushCount) {
        bushes.setMatrixAt(bushIdx++, tmp.matrix);
      } else if (stoneIdx < stoneCount) {
        stones.setMatrixAt(stoneIdx++, tmp.matrix);
      }
    }
  }

  bushes.count = bushIdx;
  stones.count = stoneIdx;
  bushes.instanceMatrix.needsUpdate = true;
  stones.instanceMatrix.needsUpdate = true;
  group.add(bushes);
  group.add(stones);
  return group;
}

