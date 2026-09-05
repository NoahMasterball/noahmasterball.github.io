import { Mesh, PlaneGeometry } from 'three';
import { VIGNETTE_SHOTS, type ShotDef } from '../config';
import type { Assets } from '../engine/assets';
import { Character } from '../engine/character';
import { KitLibrary } from '../engine/kit';
import type { Stage } from '../engine/stage';
import type { SceneHandle } from '../main';

export const shots: Record<string, ShotDef> = VIGNETTE_SHOTS;

/**
 * Bake-off candidate B (control) — semi-realistic: Poly Haven photoscanned
 * props on an ambientCG PBR grass ground, KayKit knight as the visually
 * quiet character.
 */
export async function build(stage: Stage, assets: Assets): Promise<SceneHandle> {
  const ph = new KitLibrary(assets, 'assets/models/polyhaven');

  const grassMat = await assets.pbrMaterial('Grass001', 14);
  const ground = new Mesh(new PlaneGeometry(60, 60), grassMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  stage.scene.add(ground);

  await Promise.all([
    ph.place(stage.scene, 'boulder_01/boulder_01', { position: [-3.5, 0, -2] }),
    ph.place(stage.scene, 'rock_moss_set_01/rock_moss_set_01', { position: [3, 0, 1.5] }),
    ph.place(stage.scene, 'tree_stump_01/tree_stump_01', { position: [-2, 0, 2.5] }),
    ph.place(stage.scene, 'dead_tree_trunk_02/dead_tree_trunk_02', {
      position: [4.5, 0, -3.5],
      rotationY: 1.1,
    }),
    ph.place(stage.scene, 'wooden_barrels_01/wooden_barrels_01', { position: [1.5, 0, -1.5] }),
    ph.place(stage.scene, 'wooden_table_02/wooden_table_02', {
      position: [-0.5, 0, -3.2],
      rotationY: 0.4,
    }),
  ]);

  // Character at rest (KayKit Adventurers — clips embedded in the GLB).
  const knight = await assets.gltf('assets/models/kaykit/Knight.glb');
  const character = new Character(knight);
  character.root.position.set(0.8, 0, 3.2);
  character.root.rotation.y = 2.8;
  stage.scene.add(character.root);
  character.play('idle');

  return {
    update(dt) {
      character.update(dt);
    },
  };
}
