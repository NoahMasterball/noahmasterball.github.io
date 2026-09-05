import { Mesh, MeshStandardMaterial, PlaneGeometry } from 'three';
import { VIGNETTE_SHOTS, type ShotDef } from '../config';
import type { Assets } from '../engine/assets';
import { Character, compositeCharacter } from '../engine/character';
import { KitLibrary } from '../engine/kit';
import type { Stage } from '../engine/stage';
import type { SceneHandle } from '../main';

export const shots: Record<string, ShotDef> = VIGNETTE_SHOTS;

/**
 * Bake-off candidate A — Quaternius medieval village family:
 * house fragment (MegaKit), nature cluster (Stylized Nature), peasant
 * character (Universal Base Characters + UAL idle).
 */
export async function build(stage: Stage, assets: Assets): Promise<SceneHandle> {
  const medieval = new KitLibrary(assets, 'assets/models/medieval');
  const nature = new KitLibrary(assets, 'assets/models/nature');

  // Stylized ground plane — flat colour, the kit's painterly texture look
  // carries the materials.
  const ground = new Mesh(
    new PlaneGeometry(60, 60),
    new MeshStandardMaterial({ color: 0x66753f, roughness: 1.0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  stage.scene.add(ground);

  // --- House fragment: 6m wide x 4m deep, walls face +Z / outward ---
  const WALL_H = 3.123;
  const placements: Promise<unknown>[] = [];
  // Front row (facing camera, +Z)
  placements.push(
    medieval.place(stage.scene, 'Wall_Plaster_Door_Round', { position: [0, 0, 2] }),
    medieval.place(stage.scene, 'Wall_Plaster_Window_Wide_Round', { position: [-2, 0, 2] }),
    medieval.place(stage.scene, 'Wall_Plaster_WoodGrid', { position: [2, 0, 2] }),
    // Side walls
    medieval.place(stage.scene, 'Wall_UnevenBrick_Straight', {
      position: [-3, 0, 1],
      rotationY: Math.PI / 2,
    }),
    medieval.place(stage.scene, 'Wall_UnevenBrick_Window_Wide_Round', {
      position: [-3, 0, -1],
      rotationY: Math.PI / 2,
    }),
    medieval.place(stage.scene, 'Wall_Plaster_Straight', {
      position: [3, 0, 1],
      rotationY: -Math.PI / 2,
    }),
    medieval.place(stage.scene, 'Wall_Plaster_Straight_Base', {
      position: [3, 0, -1],
      rotationY: -Math.PI / 2,
    }),
    // Back row
    medieval.place(stage.scene, 'Wall_Plaster_Straight', {
      position: [0, 0, -2],
      rotationY: Math.PI,
    }),
    medieval.place(stage.scene, 'Wall_Plaster_Straight', {
      position: [-2, 0, -2],
      rotationY: Math.PI,
    }),
    medieval.place(stage.scene, 'Wall_Plaster_Straight', {
      position: [2, 0, -2],
      rotationY: Math.PI,
    }),
    // Roof — 6x4 footprint, ridge along X. The piece's Z span is 0..4.85
    // (origin at one eave), so shift by -2.36 to centre it on the house.
    medieval.place(stage.scene, 'Roof_RoundTiles_6x4', { position: [0, WALL_H, -2.36] }),
    medieval.place(stage.scene, 'Prop_Chimney', { position: [1.8, WALL_H + 3.3, 0] }),
    // Dressing — kept clear of the door axis.
    medieval.place(stage.scene, 'Prop_Wagon', { position: [5.4, 0, 2.6], rotationY: 0.9 }),
    medieval.place(stage.scene, 'Prop_Crate', { position: [-3.9, 0, 2.6], rotationY: 0.2 }),
    medieval.place(stage.scene, 'Prop_WoodenFence_Single', {
      position: [-4.5, 0, 4.5],
      rotationY: 0.15,
    }),
    // Path to the door
    nature.place(stage.scene, 'RockPath_Round_Wide', { position: [0, 0.02, 3.4] }),
    nature.place(stage.scene, 'RockPath_Round_Small_1', { position: [0.3, 0.02, 5.2] }),
    nature.place(stage.scene, 'RockPath_Round_Small_2', { position: [-0.2, 0.02, 6.8] }),
    // Nature cluster
    nature.place(stage.scene, 'CommonTree_1', { position: [-6.5, 0, -3] }),
    nature.place(stage.scene, 'CommonTree_3', { position: [6.8, 0, -4.5] }),
    nature.place(stage.scene, 'Bush_Common', { position: [-4.2, 0, 0.5] }),
    nature.place(stage.scene, 'Bush_Common_Flowers', { position: [4.4, 0, 1.6] }),
    nature.place(stage.scene, 'Grass_Common_Tall', { position: [-3.6, 0, 3.2] }),
    nature.place(stage.scene, 'Grass_Common_Short', { position: [2.2, 0, 4.6] }),
    nature.place(stage.scene, 'Grass_Wispy_Tall', { position: [-1.8, 0, 4.4] }),
    nature.place(stage.scene, 'Flower_3_Group', { position: [-2.8, 0, 2.8] }),
    nature.place(stage.scene, 'Rock_Medium_2', { position: [7, 0, 0.5], scale: 0.7 }),
  );
  await Promise.all(placements);

  // Character at rest by the path — base body (head/skin) + peasant outfit + hair
  // composited onto one universal-rig skeleton.
  const [base, outfit, hair, ual] = await Promise.all([
    assets.gltf('assets/models/characters/Superhero_Male.glb'),
    assets.gltf('assets/models/characters/Male_Peasant.glb'),
    assets.gltf('assets/models/characters/Hair_SimpleParted.glb'),
    assets.gltf('assets/models/characters/UAL1.glb'),
  ]);
  compositeCharacter(base, [outfit, hair]);
  const character = new Character(base, ual.animations);
  character.root.position.set(1.2, 0, 4.6);
  character.root.rotation.y = 2.6;
  stage.scene.add(character.root);
  character.play('idle');

  return {
    update(dt) {
      character.update(dt);
    },
  };
}
