import {
  BoxGeometry,
  CylinderGeometry,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
} from 'three';
import { WORLD } from '../config';
import type { Assets } from '../engine/assets';
import type { Stage } from '../engine/stage';

/** Rendering-stack verification scene: ground + three material test shapes. */
export async function build(stage: Stage, _assets: Assets): Promise<void> {
  const ground = new Mesh(
    new PlaneGeometry(WORLD.playableDiameter, WORLD.playableDiameter),
    new MeshStandardMaterial({ color: 0x6a7a52, roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  stage.scene.add(ground);

  const mats = [
    new MeshStandardMaterial({ color: 0xb0623a, roughness: 0.4, metalness: 0.0 }),
    new MeshStandardMaterial({ color: 0xd8cfc0, roughness: 0.9 }),
    new MeshStandardMaterial({ color: 0x8899aa, roughness: 0.15, metalness: 0.8 }),
  ];
  const shapes = [
    new Mesh(new BoxGeometry(2, 2, 2), mats[0]),
    new Mesh(new CylinderGeometry(1, 1, 3, 24), mats[1]),
    new Mesh(new IcosahedronGeometry(1.2, 1), mats[2]),
  ];
  shapes[0]!.position.set(0, 1, 0);
  shapes[1]!.position.set(-4, 1.5, -2);
  shapes[2]!.position.set(3.5, 1.2, -3);
  for (const s of shapes) {
    s.castShadow = true;
    s.receiveShadow = true;
    stage.scene.add(s);
  }
}
