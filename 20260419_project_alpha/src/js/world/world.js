import * as THREE from 'three';
import { generateMap } from './map-generator.js';
import { createBuildings } from './buildings.js';
import { createMeadowBase, createMeadowScatter } from './biomes.js';
import { createStreets, createSidewalks } from './transitions.js';

// World-Orchestrator. Owner der generierten Map-Daten und aller daraus erzeugten Meshes.
// Wird einmal pro Map konstruiert, hängt seine Root-Group an die Scene.
// Queries für andere Systeme (Player-Collision, MonsterSpawner, LevelManager):
//   - getBuildingsInRadius(pos, r)   → Buildings in Umkreis
//   - raycastGround(x, z)            → Y-Höhe des Bodens (aktuell flach = 0)
//   - spawnPoint                     → sicherer Player-Start (Street-Kreuzung)
//
// Update-Hook `update(dt)` steht für Folge-Batches bereit (z.B. Alarm-Blinken),
// ist aktuell ein No-Op.

export class World {
  constructor(scene, seed) {
    this.scene = scene;
    this.data = generateMap(seed);
    this.root = new THREE.Group();
    this.root.name = 'world-root';

    this.root.add(createMeadowBase());
    this.root.add(createStreets());
    this.root.add(createSidewalks(this.data.buildings));
    this.root.add(createMeadowScatter(this.data.meadows));

    this.buildingsGroup = createBuildings(this.data.buildings);
    this.root.add(this.buildingsGroup);

    this.scene.add(this.root);
  }

  get seed() { return this.data.seed; }
  get spawnPoint() { return this.data.spawnPoint; }
  get buildings() { return this.data.buildings; }
  get meadows() { return this.data.meadows; }

  getBuildingsInRadius(pos, radius) {
    const r2 = radius * radius;
    const result = [];
    for (const b of this.data.buildings) {
      const dx = b.x - pos.x;
      const dz = b.z - pos.z;
      if (dx * dx + dz * dz <= r2) result.push(b);
    }
    return result;
  }

  // Bodenhöhe an (x,z). Aktuell flach bei y=0. Signatur bleibt für
  // Terrain-Erweiterungen (z.B. Hügel) stabil.
  // eslint rationale: Parameter werden absichtlich akzeptiert, da Erweiterungen sie nutzen.
  raycastGround(_x, _z) {
    return 0;
  }

  update(_dt) {
    // Aktuell nichts zu tun. Alarme (Batch 7) könnten hier Blink-Lichter tickten.
  }

  dispose() {
    this.scene.remove(this.root);
    this.root.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose?.();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose?.());
        else obj.material.dispose?.();
      }
    });
  }
}
