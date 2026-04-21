import * as THREE from 'three';
import { WEAPON_VFX } from '../config/constants.js';

// Hit-Scan + Schuss-Visuals. Ein Ort für Raycast und Tracer/Muzzle-Flash-Lifetime,
// damit weapons.js sich nur um Waffenlogik kümmert. Kein Partikelsystem — Tracer
// sind THREE.Line, Muzzle-Flash ist ein additiv gezeichnetes Quad, beides mit TTL.
//
// Input-Kontrakt:
//   hitScan({ origin, direction, range, targets })
//     - targets: Array<THREE.Object3D> — rekursiv getestet (World-Root + Dummy-Meshes)
//     - returns { mesh, hpOwner, point, distance } oder null
//     - hpOwner ist der Träger der HP-Logik (Dummy-Target / später Monster). Er
//       hängt als userData.hpOwner am getroffenen Mesh oder an einem seiner Vorfahren.
//
// TracerManager-Lifecycle:
//   tm.addTracer(from, to)   — zeichnet eine kurze Linie, läuft automatisch aus
//   tm.addMuzzleFlash(pos)   — kleines Glühen, läuft automatisch aus
//   tm.update(dt)            — fade + cleanup (pro Frame aufrufen)
//   tm.dispose()             — gesamte Scene-Gruppe abbauen

const _raycaster = new THREE.Raycaster();

export function hitScan({ origin, direction, range, targets }) {
  _raycaster.set(origin, direction);
  _raycaster.far = range;
  const hits = _raycaster.intersectObjects(targets, true);
  if (hits.length === 0) return null;
  const hit = hits[0];
  return {
    mesh: hit.object,
    hpOwner: findHpOwner(hit.object),
    point: hit.point,
    distance: hit.distance,
  };
}

function findHpOwner(obj) {
  let cur = obj;
  while (cur) {
    if (cur.userData && cur.userData.hpOwner) return cur.userData.hpOwner;
    cur = cur.parent;
  }
  return null;
}

export class TracerManager {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'weapon-vfx';
    this.scene.add(this.root);
    this._entries = [];
  }

  addTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const mat = new THREE.LineBasicMaterial({
      color: WEAPON_VFX.TRACER_COLOR,
      transparent: true,
      opacity: 1,
    });
    const line = new THREE.Line(geo, mat);
    this.root.add(line);
    this._entries.push({ obj: line, mat, geo, ttl: WEAPON_VFX.TRACER_TTL_SEC, maxTtl: WEAPON_VFX.TRACER_TTL_SEC });
  }

  addMuzzleFlash(pos) {
    const geo = new THREE.PlaneGeometry(WEAPON_VFX.MUZZLE_FLASH_SIZE, WEAPON_VFX.MUZZLE_FLASH_SIZE);
    const mat = new THREE.MeshBasicMaterial({
      color: WEAPON_VFX.MUZZLE_FLASH_COLOR,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    this.root.add(mesh);
    this._entries.push({ obj: mesh, mat, geo, ttl: WEAPON_VFX.MUZZLE_FLASH_TTL_SEC, maxTtl: WEAPON_VFX.MUZZLE_FLASH_TTL_SEC });
  }

  update(dt) {
    for (let i = this._entries.length - 1; i >= 0; i--) {
      const e = this._entries[i];
      e.ttl -= dt;
      if (e.ttl <= 0) {
        this.root.remove(e.obj);
        e.mat.dispose?.();
        e.geo.dispose?.();
        this._entries.splice(i, 1);
      } else {
        e.mat.opacity = Math.max(0, e.ttl / e.maxTtl);
      }
    }
  }

  dispose() {
    for (const e of this._entries) {
      this.root.remove(e.obj);
      e.mat.dispose?.();
      e.geo.dispose?.();
    }
    this._entries.length = 0;
    this.scene.remove(this.root);
  }
}
