import * as THREE from 'three';
import { DUMMY_TARGET } from '../config/constants.js';

// Test-Dummy für Batch 5. Pure Test-Aid: statisches Mesh mit HP, Hit-Tint
// beim Treffer, nach 0 HP bleibt es stehen. Batch 6 ersetzt das durch echte
// Monster. Hängt `this` als userData.hpOwner am Mesh, damit hit-scan.js den
// Besitzer über die Mesh-Hierarchie findet und takeDamage() rufen kann.

export class DummyTarget {
  constructor(position) {
    this.hp = DUMMY_TARGET.HP;
    this.maxHp = DUMMY_TARGET.HP;

    const geo = new THREE.BoxGeometry(DUMMY_TARGET.SIZE, DUMMY_TARGET.SIZE, DUMMY_TARGET.SIZE);
    const mat = new THREE.MeshLambertMaterial({ color: DUMMY_TARGET.COLOR });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.set(position.x, DUMMY_TARGET.Y_OFFSET, position.z);
    this.mesh.userData.hpOwner = this;
    this._tintTimer = 0;
    this._baseColor = new THREE.Color(DUMMY_TARGET.COLOR);
    this._tintColor = new THREE.Color(DUMMY_TARGET.HIT_TINT_COLOR);
    this._deadColor = new THREE.Color(DUMMY_TARGET.DEAD_COLOR);
  }

  takeDamage(dmg) {
    if (this.hp <= 0) return;
    this.hp = Math.max(0, this.hp - dmg);
    this._tintTimer = DUMMY_TARGET.HIT_TINT_SEC;
    if (this.hp <= 0) {
      this.mesh.material.color.copy(this._deadColor);
    }
  }

  update(dt) {
    if (this._tintTimer > 0) {
      this._tintTimer = Math.max(0, this._tintTimer - dt);
      const blend = this._tintTimer / DUMMY_TARGET.HIT_TINT_SEC;
      if (this.hp > 0) {
        this.mesh.material.color.copy(this._baseColor).lerp(this._tintColor, blend);
      }
    }
  }

  dispose() {
    this.mesh.geometry.dispose?.();
    this.mesh.material.dispose?.();
  }
}
