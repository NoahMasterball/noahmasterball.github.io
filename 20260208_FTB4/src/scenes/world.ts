import {
  Color,
  CylinderGeometry,
  Group,
  MathUtils,
  Mesh,
  Object3D,
  PlaneGeometry,
  PointLight,
  RepeatWrapping,
  Vector3,
} from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CREATURES, TAVERN } from '../config';
import type { Assets } from '../engine/assets';
import { Character, compositeCharacter } from '../engine/character';
import { WorldCollider } from '../engine/collision';
import { Wanderer } from '../engine/creature';
import { InstancePool, swayAngle } from '../engine/instanced';
import { InteractionSystem } from '../engine/interact';
import { KitLibrary } from '../engine/kit';
import { ParticleField } from '../engine/particles';
import { createGroundPatch } from '../engine/patch';
import { SmokeColumn } from '../engine/smoke';
import type { Stage } from '../engine/stage';
import { ThirdPerson } from '../player/thirdperson';
import type { SceneHandle } from '../main';

const WALL_H = 3.123; // MegaKit wall height (measured)
/** Gable infill: Roof_Front_Brick6 y-scaled to the RoundTiles 6-wide pitch. */
const GABLE = { name: 'Roof_Front_Brick6', scale: [0.985, 1.116, 1] as [number, number, number], z: 1.9 };

/** Deterministic RNG so the scatter layout is stable across runs. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Sway {
  obj: Object3D;
  phase: number;
  amp: number;
}

export async function build(stage: Stage, assets: Assets): Promise<SceneHandle> {
  const medieval = new KitLibrary(assets, 'assets/models/medieval');
  const nature = new KitLibrary(assets, 'assets/models/nature');
  const rng = mulberry32(20260802);
  // Separate stream for sway phases: keeps the layout stream (rng) call-for-call
  // identical to the tuned iterations — phases only affect wind offsets.
  const phaseRng = mulberry32(9145721);
  // Repeated nature pieces (scatter, path stones, tree rings) render instanced;
  // one-off hero props and buildings stay KitLibrary clones.
  const instanced = new InstancePool(nature);
  const sways: Sway[] = [];
  const collisionExtras = new Group(); // invisible collision proxies (tree trunks)

  // ---------------------------------------------------------------- ground
  const groundMat = await assets.pbrMaterial('Grass001', 26);
  groundMat.color = new Color(0x76914f); // warm tint pulls the photo texture toward the stylized palette
  groundMat.normalScale.set(0.45, 0.45); // calm the photo normal under the low sun
  // Grass must stay fully diffuse: at grazing angles the PBR sheen + bright
  // sunrise env otherwise wash the whole mid-distance lawn to cream.
  groundMat.roughnessMap = null;
  groundMat.roughness = 1;
  groundMat.envMapIntensity = 0.35;
  const ground = new Mesh(new PlaneGeometry(160, 160), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  stage.scene.add(ground);

  // ---------------------------------------------------------------- helpers
  const placements: Promise<unknown>[] = [];

  /** Window-hole walls get their matching glass/frame insert automatically. */
  const wallInsert = (name: string): string | null => {
    if (/Window_Wide/.test(name)) return 'Window_Wide_Round1';
    if (/Window_Thin/.test(name)) return 'Window_Thin_Round1';
    return null;
  };
  const placeWall = (parent: Object3D, name: string, pos: [number, number, number], rotY: number): void => {
    placements.push(medieval.place(parent, name, { position: pos, rotationY: rotY }));
    const insert = wallInsert(name);
    if (insert) placements.push(medieval.place(parent, insert, { position: pos, rotationY: rotY }));
  };
  /** Row of 2m wall pieces along local X at depth z, facing rotY. */
  const row = (parent: Object3D, names: string[], z: number, rotY: number, y = 0): void => {
    const startX = -(names.length - 1);
    names.forEach((name, i) => {
      if (name) placeWall(parent, name, [startX + i * 2, y, z], rotY);
    });
  };
  /** Side walls (local Z axis), north-to-south, at side x = ±halfW. */
  const sides = (parent: Object3D, left: string[], right: string[], halfW: number, y = 0): void => {
    left.forEach((name, i) => {
      if (name) placeWall(parent, name, [-halfW, y, (left.length - 1) - i * 2], Math.PI / 2);
    });
    right.forEach((name, i) => {
      if (name) placeWall(parent, name, [halfW, y, (right.length - 1) - i * 2], -Math.PI / 2);
    });
  };

  interface DoorRef {
    pivot: Group;
    open: boolean;
  }
  const doors: DoorRef[] = [];

  /** Hinged door insert for a door-hole wall at local (x, z) facing +Z. */
  const hangDoor = (parent: Object3D, x: number, z: number, name = 'Door_1_Round'): DoorRef => {
    const pivot = new Group();
    pivot.position.set(x - 0.55, 0, z - 0.11); // hinge at the hole's left edge
    pivot.userData['noCollide'] = true; // doors animate — keep them out of the static collider
    parent.add(pivot);
    placements.push(medieval.place(pivot, name, { position: [0, 0, 0] }));
    const ref: DoorRef = { pivot, open: false };
    doors.push(ref);
    return ref;
  };

  // ---------------------------------------------------------------- buildings
  const buildings: { group: Group; cx: number; cz: number; halfW: number; halfD: number }[] = [];

  const newBuilding = (cx: number, cz: number, rotY: number, halfW: number, halfD: number): Group => {
    const g = new Group();
    g.position.set(cx, 0, cz);
    g.rotation.y = rotY;
    stage.scene.add(g);
    buildings.push({ group: g, cx, cz, halfW, halfD });
    return g;
  };

  // --- Primary landmark: tavern "The Gilded Sheaf" (6x4, two storeys) at NE ---
  const tavern = newBuilding(13, -9, Math.atan2(-13, 9), 3, 2);
  row(tavern, ['Wall_Plaster_Window_Wide_Round', 'Wall_Plaster_Door_Round', 'Wall_Plaster_Window_Thin_Round'], 2, 0);
  placements.push(medieval.place(tavern, 'WindowShutters_Wide_Round_Open', { position: [-2, 0, 2] }));
  const tavernDoor = hangDoor(tavern, 0, 2);
  row(tavern, ['Wall_UnevenBrick_Straight', 'Wall_UnevenBrick_Straight', 'Wall_UnevenBrick_Straight'], -2, Math.PI);
  sides(
    tavern,
    ['Wall_UnevenBrick_Window_Wide_Round', 'Wall_UnevenBrick_Straight'],
    ['Wall_UnevenBrick_Straight', 'Wall_UnevenBrick_Window_Wide_Round'],
    3,
  );
  // upper storey
  row(tavern, ['Wall_Plaster_Window_Wide_Round', 'Wall_Plaster_Door_Round', 'Wall_Plaster_Window_Wide_Round'], 2, 0, WALL_H);
  placements.push(
    medieval.place(tavern, 'WindowShutters_Wide_Round_Open', { position: [2, WALL_H, 2] }),
    medieval.place(tavern, 'Balcony_Simple_Straight', { position: [0, WALL_H, 2] }),
  );
  row(tavern, ['Wall_Plaster_Straight', 'Wall_Plaster_Straight', 'Wall_Plaster_Straight'], -2, Math.PI, WALL_H);
  sides(
    tavern,
    ['Wall_Plaster_Window_Thin_Round', 'Wall_Plaster_Straight'],
    ['Wall_Plaster_Straight', 'Wall_Plaster_Window_Thin_Round'],
    3,
    WALL_H,
  );
  hangDoor(tavern, 0, 2, 'Door_1_Round').pivot.position.y = WALL_H; // balcony door
  // Interior floor — the door opens and the player can walk in.
  for (const fx of [-2, 0, 2]) {
    for (const fz of [-1, 1]) {
      placements.push(
        medieval.place(tavern, 'Floor_WoodDark', { position: [fx, 0.02, fz], castShadow: false }),
      );
    }
  }
  placements.push(
    medieval.place(tavern, 'Roof_RoundTiles_6x4', { position: [0, WALL_H * 2, -2.36] }),
    medieval.place(tavern, GABLE.name, { position: [0, WALL_H * 2, GABLE.z], scale: GABLE.scale }),
    medieval.place(tavern, GABLE.name, { position: [0, WALL_H * 2, -GABLE.z], rotationY: Math.PI, scale: GABLE.scale }),
    medieval.place(tavern, 'Prop_Chimney', { position: [2, WALL_H * 2 + 3.35, 0] }),
    medieval.place(tavern, 'Prop_Vine1', { position: [-2.6, 2.7, 2.15] }),
    // yard dressing
    medieval.place(tavern, 'Prop_Crate', { position: [2.6, 0, 3.2], rotationY: 0.4 }),
    medieval.place(tavern, 'Prop_WoodenFence_Extension1', { position: [-4.6, 0, 3.4], rotationY: 0.1 }),
  );

  // --- Tavern interior: KayKit dungeon props (CC0, hand-painted; ~1.4x our
  // scale, hence TAVERN.furnitureScale). Furniture joins the tavern group and
  // therefore the static collider. The door-swing zone (x -1.3..0.1, z > 0.8)
  // stays clear. ---
  const kaykit = new KitLibrary(assets, 'assets/models/kaykit', '.gltf.glb');
  const furnish = (name: string, pos: [number, number, number], rotY = 0, scale: number = TAVERN.furnitureScale): void => {
    placements.push(kaykit.place(tavern, name, { position: pos, rotationY: rotY, scale }));
  };
  furnish('table_long_tablecloth_decorated_A', [-1.4, 0.02, -0.35], Math.PI / 2);
  furnish('chair', [-0.9, 0.02, 0.55], Math.PI);
  furnish('chair', [-2.1, 0.02, 0.55], Math.PI * 0.92);
  furnish('stool', [-0.8, 0.02, -1.3]);
  furnish('stool', [-1.9, 0.02, -1.35]);
  furnish('table_medium_tablecloth', [1.9, 0.02, -1.05]);
  furnish('candle_lit', [1.75, 0.72, -1.0]);
  furnish('keg_decorated', [2.25, 0.02, 0.45], Math.PI / 2, 0.55);
  furnish('barrel_large', [-2.35, 0.02, 1.2]);
  furnish('barrel_small_stack', [2.2, 0.02, 1.35], Math.PI);
  furnish('shelf_large', [0.8, 1.5, -1.86]);
  furnish('shelf_small_candles', [2.82, 1.35, -0.3], -Math.PI / 2);
  furnish('torch_mounted', [-0.45, 1.9, -1.86]);
  // mounted torches flanking the door outside — dusk glow at the landmark
  furnish('torch_mounted', [-1.2, 1.85, 2.12], Math.PI);
  furnish('torch_mounted', [1.2, 1.85, 2.12], Math.PI);
  // the upper-storey slab doubles as the taproom ceiling
  for (const fx of [-2, 0, 2]) {
    for (const fz of [-1, 1]) {
      placements.push(
        medieval.place(tavern, 'Floor_WoodDark', { position: [fx, WALL_H, fz], castShadow: false }),
      );
    }
  }
  // warm hearth key light + torch fill lights (no shadow casters — cheap)
  const hearth = new PointLight(TAVERN.light.color, TAVERN.light.intensity, TAVERN.light.distance, 2);
  hearth.position.set(...TAVERN.light.position);
  tavern.add(hearth);
  const torchLights: PointLight[] = [];
  for (const tx of [-1.2, 1.2]) {
    const tl = new PointLight(TAVERN.torchLight.color, TAVERN.torchLight.intensity, TAVERN.torchLight.distance, 2);
    tl.position.set(tx, 2.1, 2.4);
    tavern.add(tl);
    torchLights.push(tl);
  }

  // --- Secondary landmark: watchtower (4x4, three storeys) at SW ---
  const tower = newBuilding(-14, 9, Math.atan2(14, -9), 2, 2);
  row(tower, ['Wall_UnevenBrick_Door_Round', 'Wall_UnevenBrick_Straight'], 2, 0);
  hangDoor(tower, -1, 2, 'Door_2_Round');
  row(tower, ['Wall_UnevenBrick_Straight', 'Wall_UnevenBrick_Straight'], -2, Math.PI);
  sides(tower, ['Wall_UnevenBrick_Straight', 'Wall_UnevenBrick_Straight'], ['Wall_UnevenBrick_Straight', 'Wall_UnevenBrick_Straight'], 2);
  for (const lvl of [1, 2]) {
    row(tower, lvl === 1
      ? ['Wall_UnevenBrick_Window_Thin_Round', 'Wall_UnevenBrick_Straight']
      : ['Wall_UnevenBrick_Straight', 'Wall_UnevenBrick_Window_Thin_Round'], 2, 0, WALL_H * lvl);
    row(tower, ['Wall_UnevenBrick_Straight', 'Wall_UnevenBrick_Straight'], -2, Math.PI, WALL_H * lvl);
    sides(tower, ['Wall_UnevenBrick_Straight', 'Wall_UnevenBrick_Straight'], ['Wall_UnevenBrick_Straight', 'Wall_UnevenBrick_Straight'], 2, WALL_H * lvl);
  }
  placements.push(
    medieval.place(tower, 'Roof_Tower_RoundTiles', { position: [0, WALL_H * 3, 0] }),
    medieval.place(tower, 'Prop_WoodenFence_Extension2', { position: [3.4, 0, 2.2], rotationY: 0.3 }),
    medieval.place(tower, 'Prop_Vine4', { position: [1.1, 3.0, 2.05] }),
  );

  // --- Cottages ---
  const cottage = (cx: number, cz: number, rotY: number, mirror = false): Group => {
    const g = newBuilding(cx, cz, rotY, 3, 2);
    const front = mirror
      ? ['Wall_Plaster_Window_Thin_Round', 'Wall_Plaster_Door_Round', 'Wall_Plaster_Window_Wide_Round']
      : ['Wall_Plaster_Window_Wide_Round', 'Wall_Plaster_Door_Round', 'Wall_Plaster_Window_Thin_Round'];
    row(g, front, 2, 0);
    const winX = mirror ? 2 : -2;
    placements.push(medieval.place(g, 'WindowShutters_Wide_Round_Open', { position: [winX, 0, 2] }));
    hangDoor(g, 0, 2);
    row(g, ['Wall_Plaster_Straight', 'Wall_Plaster_Straight', 'Wall_Plaster_Straight'], -2, Math.PI);
    sides(
      g,
      ['Wall_UnevenBrick_Straight', 'Wall_UnevenBrick_Window_Thin_Round'],
      ['Wall_UnevenBrick_Window_Thin_Round', 'Wall_UnevenBrick_Straight'],
      3,
    );
    placements.push(
      medieval.place(g, 'Roof_RoundTiles_6x4', { position: [0, WALL_H, -2.36] }),
      medieval.place(g, GABLE.name, { position: [0, WALL_H, GABLE.z], scale: GABLE.scale }),
      medieval.place(g, GABLE.name, { position: [0, WALL_H, -GABLE.z], rotationY: Math.PI, scale: GABLE.scale }),
      medieval.place(g, 'Prop_Chimney', { position: [mirror ? -1.8 : 1.8, WALL_H + 3.3, 0] }),
    );
    return g;
  };
  const cottageA = cottage(-11, -8, Math.atan2(11, 8));
  cottage(3, -16, Math.atan2(-3, 16), true);
  const cottageC = cottage(11, 12, Math.atan2(-11, -12), true);
  placements.push(
    // the opening camera sees cottage C's back/gable — dress it
    medieval.place(cottageC, 'Prop_Vine5', { position: [-1.2, 2.6, -2.15], rotationY: Math.PI }),
    nature.place(cottageC, 'Bush_Common', { position: [-2.2, 0, -3.1], scale: 0.9 }),
    nature.place(cottageC, 'Grass_Common_Tall', { position: [1.8, 0, -2.9] }),
  );
  placements.push(
    medieval.place(cottageA, 'Prop_Wagon', { position: [4.8, 0, 2.2], rotationY: 0.7 }),
    medieval.place(cottageA, 'Prop_Vine2', { position: [2.4, 2.7, 2.15] }),
  );

  // ---------------------------------------------------------------- paths
  const pathPieces = ['RockPath_Round_Wide', 'RockPath_Round_Wide', 'RockPath_Round_Small_1', 'RockPath_Round_Small_2'];
  // loop around the green
  const loopN = 30;
  for (let i = 0; i < loopN; i++) {
    const a = (i / loopN) * Math.PI * 2;
    const r = 8.2 + Math.sin(a * 3) * 0.25;
    instanced.add(pathPieces[i % pathPieces.length]!, {
      position: [Math.cos(a) * r, 0.02, Math.sin(a) * r],
      rotationY: rng() * Math.PI * 2,
      castShadow: false,
    });
  }
  // spurs from loop to each building door (approximate straight runs)
  const spurTargets: [number, number][] = [
    [13, -9],
    [-14, 9],
    [-11, -8],
    [3, -16],
    [11, 12],
  ];
  for (const [bx, bz] of spurTargets) {
    const dir = Math.atan2(bz, bx);
    const startR = 8.6;
    const endR = Math.hypot(bx, bz) - 3.4;
    for (let r = startR; r < endR; r += 1.5) {
      instanced.add(pathPieces[Math.floor(rng() * pathPieces.length)]!, {
        position: [Math.cos(dir) * r, 0.02, Math.sin(dir) * r],
        rotationY: rng() * Math.PI * 2,
        castShadow: false,
      });
    }
  }

  // ---------------------------------------------------------------- village green centre
  placements.push(
    nature.place(stage.scene, 'CommonTree_2', { position: [-5, 0, -1] }).then((t) => {
      sways.push({ obj: t, phase: phaseRng() * 6, amp: 0.006 });
    }),
    nature.place(stage.scene, 'Flower_4_Group', { position: [-3.6, 0, 1.4], scale: 1.1 }),
    nature.place(stage.scene, 'Flower_3_Group', { position: [-4.6, 0, 2.2] }),
    medieval.place(stage.scene, 'Prop_WoodenFence_Single', { position: [-3, 0, 3.4], rotationY: -0.4 }),
  );
  const trunk = (x: number, z: number, r = 0.45): void => {
    const m = new Mesh(new CylinderGeometry(r, r * 1.3, 4, 8));
    m.position.set(x, 2, z);
    collisionExtras.add(m);
  };
  trunk(-5, -1);

  // ---------------------------------------------------------------- scatter dressing
  const inBuilding = (x: number, z: number): boolean =>
    buildings.some((b) => Math.hypot(x - b.cx, z - b.cz) < 6.2);
  const onPath = (x: number, z: number): boolean => {
    const r = Math.hypot(x, z);
    if (Math.abs(r - 8.2) < 1.4) return true;
    for (const [bx, bz] of spurTargets) {
      const dir = Math.atan2(bz, bx);
      const proj = x * Math.cos(dir) + z * Math.sin(dir);
      const perp = Math.abs(-x * Math.sin(dir) + z * Math.cos(dir));
      if (proj > 8 && proj < Math.hypot(bx, bz) && perp < 1.2) return true;
    }
    return false;
  };
  const scatter = (
    pool: string[],
    count: number,
    rMin: number,
    rMax: number,
    opts: { sway?: number; scale?: [number, number]; shadow?: boolean } = {},
  ): void => {
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2;
      const r = rMin + Math.sqrt(rng()) * (rMax - rMin);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (inBuilding(x, z) || onPath(x, z)) continue;
      const name = pool[Math.floor(rng() * pool.length)]!;
      const scale = opts.scale ? MathUtils.lerp(opts.scale[0], opts.scale[1], rng()) : 1;
      const add: Parameters<InstancePool['add']>[1] = {
        position: [x, 0, z],
        rotationY: rng() * Math.PI * 2,
        scale,
        castShadow: opts.shadow ?? true,
      };
      if (opts.sway) add.sway = { phase: phaseRng() * 6, amp: opts.sway };
      instanced.add(name, add);
    }
  };

  scatter(['Grass_Common_Short', 'Grass_Common_Tall', 'Grass_Wispy_Short', 'Grass_Wispy_Tall', 'Clover_1', 'Clover_2'], 100, 3, 30, { sway: 0.05, scale: [0.7, 1.2], shadow: false });
  scatter(['Flower_3_Group', 'Flower_4_Group', 'Flower_3_Single'], 32, 3, 26, { sway: 0.06, scale: [0.7, 1.1], shadow: false });
  scatter(['Bush_Common', 'Bush_Common_Flowers', 'Fern_1', 'Plant_1', 'Plant_7'], 24, 6, 30, { sway: 0.02, scale: [0.7, 1.3] });
  scatter(['Pebble_Round_1', 'Pebble_Round_2', 'Pebble_Round_3', 'Pebble_Square_2', 'Pebble_Square_4'], 30, 4, 32, { scale: [0.5, 1.0] });
  scatter(['Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3'], 10, 16, 34, { scale: [0.4, 0.9] });
  scatter(['Mushroom_Common', 'Mushroom_Laetiporus'], 8, 10, 30, { scale: [0.6, 1.0] });
  // outer meadow band (map growth v0.5) — appended AFTER the original calls so
  // the tuned inner layout keeps its exact RNG sequence
  scatter(['Grass_Common_Short', 'Grass_Common_Tall', 'Grass_Wispy_Short', 'Grass_Wispy_Tall', 'Clover_1', 'Clover_2'], 50, 28, 38, { sway: 0.05, scale: [0.7, 1.2], shadow: false });
  scatter(['Flower_3_Group', 'Flower_4_Group', 'Flower_3_Single'], 12, 24, 32, { sway: 0.06, scale: [0.7, 1.1], shadow: false });
  scatter(['Bush_Common', 'Bush_Common_Flowers', 'Fern_1', 'Plant_1', 'Plant_7'], 10, 28, 38, { sway: 0.02, scale: [0.7, 1.3] });
  scatter(['Pebble_Round_1', 'Pebble_Round_2', 'Pebble_Round_3', 'Pebble_Square_2', 'Pebble_Square_4'], 10, 30, 40, { scale: [0.5, 1.0] });
  scatter(['Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3'], 4, 32, 42, { scale: [0.4, 0.9] });
  scatter(['Mushroom_Common', 'Mushroom_Laetiporus'], 4, 28, 38, { scale: [0.6, 1.0] });

  // inner hero trees
  const innerTrees: [number, number, string][] = [
    [16.5, 7, 'CommonTree_4'],
    [-6, -13, 'CommonTree_1'],
    [19, -2, 'CommonTree_3'],
    [-4, 16, 'CommonTree_5'],
  ];
  for (const [x, z, name] of innerTrees) {
    placements.push(
      nature.place(stage.scene, name, { position: [x, 0, z] }).then((t) => {
        sways.push({ obj: t, phase: phaseRng() * 6, amp: 0.005 });
      }),
    );
    trunk(x, z);
  }

  // ---------------------------------------------------------------- background treeline
  const treePool = ['CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'CommonTree_5', 'Pine_1', 'Pine_2', 'Pine_3', 'Pine_4'];
  for (let i = 0; i < 66; i++) {
    const a = (i / 66) * Math.PI * 2 + rng() * 0.1;
    const r = 42 + rng() * 9;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const scale = 1.1 + rng() * 0.9;
    instanced.add(treePool[Math.floor(rng() * treePool.length)]!, {
      position: [x, 0, z],
      rotationY: rng() * Math.PI * 2,
      scale,
      // outside the play area — their shadows fall outside the frustum anyway
      castShadow: false,
    });
  }
  // second, farther silhouette ring — larger, fog-veiled, closes the horizon
  for (let i = 0; i < 50; i++) {
    const a = (i / 50) * Math.PI * 2 + rng() * 0.15;
    const r = 56 + rng() * 12;
    instanced.add(treePool[Math.floor(rng() * treePool.length)]!, {
      position: [Math.cos(a) * r, 0, Math.sin(a) * r],
      rotationY: rng() * Math.PI * 2,
      scale: 1.6 + rng() * 0.9,
      castShadow: false,
    });
  }

  // ---------------------------------------------------------------- ambient particles
  const pollen = new ParticleField({
    count: 300,
    extent: { x: 52, y: 7, z: 52 },
    centerY: 3.2,
    color: new Color(0xffd9a0),
    size: 0.32,
    speed: 1,
    opacity: 0.35,
  });
  stage.scene.add(pollen.points);
  const tavernChimneyWorld = new Vector3(2, WALL_H * 2 + 6.3, 0)
    .applyAxisAngle(new Vector3(0, 1, 0), tavern.rotation.y)
    .add(tavern.position);
  const smoke = new SmokeColumn(tavernChimneyWorld);
  stage.scene.add(smoke.points);

  // Dirt patches seat each building (and the tavern yard) into the lawn.
  const dirtTex = await assets.texture('assets/textures/Ground030/Ground030_2K-JPG_Color.jpg');
  dirtTex.wrapS = dirtTex.wrapT = RepeatWrapping;
  dirtTex.repeat.set(2, 2);
  for (const b of buildings) {
    const patch = createGroundPatch(dirtTex, b.halfW + 3.2, b.halfD + 3.4);
    patch.position.x = b.cx;
    patch.position.z = b.cz;
    patch.rotation.z = b.group.rotation.y;
    stage.scene.add(patch);
  }

  // ---------------------------------------------------------------- skeleton camp
  // Dormant skeletons at the SE forest edge — storytelling for the coming
  // combat phase. Layout: [dx, dz, rotY, clip] relative to CREATURES.skeleton.camp.
  const [campX, campZ] = CREATURES.skeleton.camp;
  const SKELETON_POSTS: [number, number, number, string][] = [
    [0, 0.5, -2.3, 'Idle'],
    [-1.5, -0.9, -1.6, 'Idle'],
    [-0.4, -1.6, 1.2, 'Skeletons_Inactive_Floor_Pose'],
  ];
  placements.push(
    nature.place(stage.scene, 'Rock_Medium_2', { position: [campX + 1.6, 0, campZ - 0.4], scale: 0.8 }),
    nature.place(stage.scene, 'Rock_Medium_1', { position: [campX - 2.4, 0, campZ + 1.3], scale: 0.6, rotationY: 1.1 }),
    medieval.place(stage.scene, 'Prop_Crate', { position: [campX + 0.9, 0, campZ + 1.8], rotationY: 0.7 }),
  );
  for (const [dx, dz, , clip] of SKELETON_POSTS) {
    if (clip !== 'Skeletons_Inactive_Floor_Pose') trunk(campX + dx, campZ + dz, 0.3);
  }

  await Promise.all(placements);
  await instanced.build(stage.scene);

  // ---------------------------------------------------------------- collision
  const collider = new WorldCollider([
    ground,
    ...buildings.map((b) => b.group),
    collisionExtras,
  ]);

  // ---------------------------------------------------------------- characters
  const [pBase, pOutfit, pHair, ual, nBase, nOutfit, nHair] = await Promise.all([
    assets.gltf('assets/models/characters/Superhero_Male.glb'),
    assets.gltf('assets/models/characters/Male_Peasant.glb'),
    assets.gltf('assets/models/characters/Hair_SimpleParted.glb'),
    assets.gltf('assets/models/characters/UAL1.glb'),
    assets.gltf('assets/models/characters/Superhero_Female.glb'),
    assets.gltf('assets/models/characters/Female_Peasant.glb'),
    assets.gltf('assets/models/characters/Hair_Buns.glb'),
  ]);
  compositeCharacter(pBase, [pOutfit, pHair]);
  const player = new Character(pBase, ual.animations);
  stage.scene.add(player.root);

  compositeCharacter(nBase, [nOutfit, nHair]);
  const npc = new Character(nBase, ual.animations);
  npc.root.position.set(9.0, 0, -4.2);
  npc.root.rotation.y = 2.4;
  stage.scene.add(npc.root);
  npc.play('idle');

  // ---------------------------------------------------------------- creatures
  const [deerGltf, skWarrior, skMage, skMinion] = await Promise.all([
    assets.gltf('assets/models/creatures/Deer.glb'),
    assets.gltf('assets/models/creatures/Skeleton_Warrior.glb'),
    assets.gltf('assets/models/creatures/Skeleton_Mage.glb'),
    assets.gltf('assets/models/creatures/Skeleton_Minion.glb'),
  ]);
  const creatureRng = mulberry32(477291);
  const deerHome = new Vector3(CREATURES.deer.home[0], 0, CREATURES.deer.home[1]);
  const wanderers: Wanderer[] = [];
  for (let i = 0; i < CREATURES.deer.count; i++) {
    // Each herd member needs its own bone hierarchy — SkeletonUtils clone.
    const scene = cloneSkeleton(deerGltf.scene) as Group;
    const deer = new Character({ scene, animations: deerGltf.animations });
    deer.root.scale.setScalar(CREATURES.deer.scale);
    const a = creatureRng() * Math.PI * 2;
    const r = Math.sqrt(creatureRng()) * CREATURES.deer.radius * 0.7;
    deer.root.position.set(deerHome.x + Math.cos(a) * r, 0, deerHome.z + Math.sin(a) * r);
    deer.root.rotation.y = creatureRng() * Math.PI * 2;
    stage.scene.add(deer.root);
    wanderers.push(
      new Wanderer(deer, {
        home: deerHome,
        radius: CREATURES.deer.radius,
        walkSpeed: CREATURES.deer.walkSpeed,
        fleeSpeed: CREATURES.deer.fleeSpeed,
        turnLerp: CREATURES.deer.turnLerp,
        fleeStart: CREATURES.deer.fleeStart,
        fleeStop: CREATURES.deer.fleeStop,
        grazeClip: 'Idle_2',
        rng: creatureRng,
      }),
    );
  }
  const skeletonGltfs = [skWarrior, skMage, skMinion];
  const skeletons: Character[] = SKELETON_POSTS.map(([dx, dz, rotY, clip], i) => {
    const c = new Character(skeletonGltfs[i]!);
    c.root.scale.setScalar(CREATURES.skeleton.scale);
    c.root.position.set(campX + dx, 0, campZ + dz);
    c.root.rotation.y = rotY;
    c.playClip(clip);
    stage.scene.add(c.root);
    return c;
  });

  const rig = new ThirdPerson(
    stage.camera,
    player,
    collider,
    stage.renderer.domElement,
    new Vector3(5.5, 0, 5.5), // on the tavern spur, visible in the opening shot
    -0.42, // camera yaw: spawn facing the tavern (primary landmark)
  );

  // ---------------------------------------------------------------- interaction
  const interactions = new InteractionSystem();
  const tavernDoorWorld = new Vector3(0, 0, 2.4)
    .applyAxisAngle(new Vector3(0, 1, 0), tavern.rotation.y)
    .add(tavern.position);
  interactions.add({
    position: tavernDoorWorld,
    prompt: 'E — Tür öffnen',
    onInteract: () => {
      tavernDoor.open = !tavernDoor.open;
    },
  });

  // ---------------------------------------------------------------- frame update
  let shotMode = false;
  (window as unknown as { __debug?: () => unknown }).__debug = () => ({
    player: player.root.position.toArray(),
    rig: rig.position.toArray(),
    camera: stage.camera.position.toArray(),
    children: stage.scene.children.length,
    groundHit: collider.groundHeight(5.5, 50, 5.5, 200),
    tris: collider.triangleCount,
  });
  return {
    onShot() {
      shotMode = true;
    },
    update(dt, elapsed) {
      if (!shotMode) rig.update(dt);
      npc.update(dt);
      for (const w of wanderers) w.update(dt, rig.position);
      for (const s of skeletons) s.update(dt);
      // hearth/torch flicker — two incommensurate sines so it never loops visibly
      const flick =
        1 +
        Math.sin(elapsed * TAVERN.flicker.speed) *
          Math.sin(elapsed * TAVERN.flicker.speed * 0.37 + 1.7) *
          TAVERN.flicker.amount;
      hearth.intensity = TAVERN.light.intensity * flick;
      for (const tl of torchLights) tl.intensity = TAVERN.torchLight.intensity * (2 - flick);
      pollen.update(elapsed);
      smoke.update(elapsed);
      instanced.update(elapsed);
      for (const s of sways) {
        s.obj.rotation.z = swayAngle(elapsed, s.phase, s.amp);
      }
      for (const d of doors) {
        const target = d.open ? -1.9 : 0;
        d.pivot.rotation.y = MathUtils.damp(d.pivot.rotation.y, target, 6, dt);
      }
      interactions.update(rig.position, rig.input.consumeInteract());
    },
  };
}
