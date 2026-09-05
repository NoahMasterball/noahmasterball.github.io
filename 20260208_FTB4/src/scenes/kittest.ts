import { Mesh, MeshStandardMaterial, PlaneGeometry, Vector3 } from 'three';
import type { ShotDef } from '../config';
import type { Assets } from '../engine/assets';
import { KitLibrary } from '../engine/kit';
import type { Stage } from '../engine/stage';

/** Scratch scene for empirically testing kit piece fit (gables, roofs). */
export const shots: Record<string, ShotDef> = {
  opening: { position: new Vector3(0, 4, 18), target: new Vector3(0, 3, 0) },
  closeup: { position: new Vector3(-14, 4, 10), target: new Vector3(-8, 3, 0) },
  side: { position: new Vector3(14, 4, -12), target: new Vector3(0, 3, 0) },
  low_hero: { position: new Vector3(8, 2, 12), target: new Vector3(8, 3, 0) },
};

export async function build(stage: Stage, assets: Assets): Promise<void> {
  const medieval = new KitLibrary(assets, 'assets/models/medieval');
  const ground = new Mesh(
    new PlaneGeometry(80, 80),
    new MeshStandardMaterial({ color: 0x66753f, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  stage.scene.add(ground);

  const WALL_H = 3.123;
  // Mini-house: 6(X) x 4(Z), gable walls (Roof_Front_Brick6, y-scaled to the
  // RoundTiles pitch) closing both ridge ends at the wall lines z = ±2.
  await Promise.all([
    medieval.place(stage.scene, 'Wall_Plaster_Straight', { position: [-2, 0, 2] }),
    medieval.place(stage.scene, 'Wall_Plaster_Door_Round', { position: [0, 0, 2] }),
    medieval.place(stage.scene, 'Wall_Plaster_Straight', { position: [2, 0, 2] }),
    medieval.place(stage.scene, 'Wall_Plaster_Straight', { position: [-2, 0, -2], rotationY: Math.PI }),
    medieval.place(stage.scene, 'Wall_Plaster_Straight', { position: [0, 0, -2], rotationY: Math.PI }),
    medieval.place(stage.scene, 'Wall_Plaster_Straight', { position: [2, 0, -2], rotationY: Math.PI }),
    medieval.place(stage.scene, 'Wall_UnevenBrick_Straight', { position: [-3, 0, 1], rotationY: Math.PI / 2 }),
    medieval.place(stage.scene, 'Wall_UnevenBrick_Straight', { position: [-3, 0, -1], rotationY: Math.PI / 2 }),
    medieval.place(stage.scene, 'Wall_UnevenBrick_Straight', { position: [3, 0, 1], rotationY: -Math.PI / 2 }),
    medieval.place(stage.scene, 'Wall_UnevenBrick_Straight', { position: [3, 0, -1], rotationY: -Math.PI / 2 }),
    medieval.place(stage.scene, 'Roof_RoundTiles_6x4', { position: [0, WALL_H, -2.36] }),
    medieval.place(stage.scene, 'Roof_Front_Brick6', {
      position: [0, WALL_H, 1.9],
      scale: [0.985, 1.116, 1],
    }),
    medieval.place(stage.scene, 'Roof_Front_Brick6', {
      position: [0, WALL_H, -1.9],
      rotationY: Math.PI,
      scale: [0.985, 1.116, 1],
    }),
  ]);
}
