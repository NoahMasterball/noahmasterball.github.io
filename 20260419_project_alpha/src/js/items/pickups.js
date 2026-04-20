import * as THREE from 'three';
import { HOTBAR, ITEMS, PLAYER } from '../config/constants.js';
import { getPrototype } from './item-registry.js';

// World-Pickups + hold-to-pick-up.
// Ein Pickup ist ein kleiner Würfel mit der Item-Farbe, schwebt + rotiert leicht.
// Während `E` gehalten wird, füllt sich der Pickup-Progress in HOTBAR.PICKUP_HOLD_SEC.
// Erst bei Vollbild wird Inventory.addItem gerufen; Heavy-Reject lässt das Pickup liegen.

const _geo = new THREE.BoxGeometry(ITEMS.PICKUP_MESH_SIZE, ITEMS.PICKUP_MESH_SIZE, ITEMS.PICKUP_MESH_SIZE);

export class PickupManager {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = 'pickups';
    this.scene.add(this.root);

    this.pickups = [];
    this._time = 0;
    this._holdTarget = null;
    this._holdProgress = 0;
  }

  // position: { x, z } — y kommt aus ITEMS.PICKUP_Y_BASE.
  spawn(prototype, position, count = 1) {
    const mat = new THREE.MeshLambertMaterial({ color: prototype.color });
    const mesh = new THREE.Mesh(_geo, mat);
    const basePos = new THREE.Vector3(position.x, ITEMS.PICKUP_Y_BASE, position.z);
    mesh.position.copy(basePos);
    this.root.add(mesh);

    const entry = { prototype, count, mesh, basePos };
    this.pickups.push(entry);
    return entry;
  }

  // Animation (Bobbing + Spin). Unabhängig vom Hold-State — läuft immer.
  update(dt) {
    this._time += dt;
    const bobW = 2 * Math.PI * ITEMS.PICKUP_BOB_FREQ_HZ;
    const spinW = 2 * Math.PI * ITEMS.PICKUP_SPIN_HZ;
    for (const p of this.pickups) {
      p.mesh.position.y = p.basePos.y + Math.sin(this._time * bobW) * ITEMS.PICKUP_BOB_AMPLITUDE;
      p.mesh.rotation.y = this._time * spinW;
    }
  }

  findNearest(position) {
    let best = null;
    let bestD2 = PLAYER.INTERACT_RANGE_M * PLAYER.INTERACT_RANGE_M;
    for (const p of this.pickups) {
      const dx = p.basePos.x - position.x;
      const dz = p.basePos.z - position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 <= bestD2) { best = p; bestD2 = d2; }
    }
    return best;
  }

  // Liefert {target, progress01, justPickedUp}. target ist das Pickup in Reichweite
  // (oder null), progress01 ist der HUD-Ring-Wert.
  tickHold(dt, holding, playerPos, inventory) {
    const near = this.findNearest(playerPos);

    if (!holding || !near) {
      this._holdTarget = null;
      this._holdProgress = 0;
      return { target: near, progress01: 0, justPickedUp: null };
    }

    if (this._holdTarget !== near) {
      this._holdTarget = near;
      this._holdProgress = 0;
    }

    this._holdProgress += dt;
    const progress01 = Math.min(1, this._holdProgress / HOTBAR.PICKUP_HOLD_SEC);

    if (progress01 >= 1) {
      const added = inventory.addItem(near.prototype, near.count);
      this._holdTarget = null;
      this._holdProgress = 0;
      if (added) {
        this._removePickup(near);
        return { target: null, progress01: 0, justPickedUp: near.prototype };
      }
      return { target: near, progress01: 0, justPickedUp: null };
    }

    return { target: near, progress01, justPickedUp: null };
  }

  // Droppt ein Inventory-Item vor dem Player als World-Pickup.
  dropInFrontOf(player, item) {
    if (!item) return null;
    const proto = getPrototype(item.id);
    // Spieler schaut entlang (-sin(yaw), -cos(yaw)) in XZ — dieselbe Konvention,
    // wie sie player.js für Bewegung nutzt (yaw=0 → blickt -Z).
    const fx = -Math.sin(player.yaw);
    const fz = -Math.cos(player.yaw);
    const pos = {
      x: player.position.x + fx * HOTBAR.DROP_FORWARD_M,
      z: player.position.z + fz * HOTBAR.DROP_FORWARD_M,
    };
    return this.spawn(proto, pos, item.count);
  }

  _removePickup(entry) {
    const idx = this.pickups.indexOf(entry);
    if (idx >= 0) this.pickups.splice(idx, 1);
    this.root.remove(entry.mesh);
    entry.mesh.material.dispose?.();
  }

  dispose() {
    for (const p of this.pickups) {
      p.mesh.material.dispose?.();
    }
    this.pickups.length = 0;
    this.scene.remove(this.root);
    this._holdTarget = null;
    this._holdProgress = 0;
  }
}
