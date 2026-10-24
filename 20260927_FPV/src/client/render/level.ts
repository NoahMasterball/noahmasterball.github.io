import {
  BoxGeometry,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  type Scene,
} from 'three';
import { RANGE_LABELS, SETUP_WALL_STYLE, SURFACE_STYLE } from '../../config/client.ts';
import { levelExtent } from '../../data/levels/geometry.ts';
import type { LevelDef, RangeLayoutDef, Surface, VolumeDef } from '../../data/schema.ts';
import { fromTuple, quatFromDegrees } from '../../sim/math.ts';
import type { Bounds } from './stage.ts';
import { devTexture, textTexture, worldUvBox } from './textures.ts';

// NEW — level visuals from the same LevelDef the simulation builds its colliders from
// (ARCHITECTURE §6), so collision and visuals cannot drift apart. Relay's setup walls
// (ADR-0013 §4) are built hidden; the App shows them while the mode raises them.

/** What of the level changes while a match runs. */
export interface LevelView {
  /** Shows or hides the setup walls (the App passes matchSetupWallsUp every frame). */
  setSetupWalls(up: boolean): void;
}

/** Bounds of the level geometry for the sun's shadow camera (SSOT: levelExtent — exact for
 *  axis-aligned boxes, so the shadow map is not spread over empty space). */
export function levelBounds(level: LevelDef): Bounds {
  const { min, max } = levelExtent(level);
  return { min: fromTuple(min), max: fromTuple(max) };
}

export function buildLevel(level: LevelDef, scene: Scene, anisotropy: number): LevelView {
  const materials = new Map<Surface, MeshStandardMaterial>();
  const materialFor = (surface: Surface): MeshStandardMaterial => {
    let m = materials.get(surface);
    if (!m) {
      m = new MeshStandardMaterial({ map: devTexture(surface, anisotropy), roughness: SURFACE_STYLE[surface].roughness, metalness: 0 });
      materials.set(surface, m);
    }
    return m;
  };

  for (const box of level.boxes) {
    const mesh = new Mesh(worldUvBox(box.size[0], box.size[1], box.size[2]), materialFor(box.surface));
    mesh.position.set(box.center[0], box.center[1], box.center[2]);
    const q = quatFromDegrees(box.rotationDeg);
    mesh.quaternion.set(q.x, q.y, q.z, q.w);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  if (level.range) addRangeLabels(level.range, scene);
  const walls = setupWalls(level.setupWalls ?? []);
  scene.add(walls);
  return {
    setSetupWalls(up) {
      walls.visible = up;
    },
  };
}

/** The setup walls at their exact collider volumes (SETUP_WALL_STYLE): a translucent fill that
 *  casts no shadow and an outline; hidden until raised. */
function setupWalls(volumes: readonly VolumeDef[]): Group {
  const group = new Group();
  group.visible = false;
  const fill = new MeshBasicMaterial({ color: SETUP_WALL_STYLE.color, transparent: true, opacity: SETUP_WALL_STYLE.opacity, depthWrite: false });
  const edge = new LineBasicMaterial({ color: SETUP_WALL_STYLE.color, transparent: true, opacity: SETUP_WALL_STYLE.edgeOpacity });
  for (const v of volumes) {
    const box = new BoxGeometry(v.size[0], v.size[1], v.size[2]);
    const mesh = new Mesh(box, fill);
    const outline = new LineSegments(new EdgesGeometry(box), edge);
    for (const o of [mesh, outline]) {
      o.position.set(v.center[0], v.center[1], v.center[2]);
      group.add(o);
    }
  }
  return group;
}

/** Range distance labels: one per distinct dummy row, measured from the firing line. */
function addRangeLabels(range: RangeLayoutDef, scene: Scene): void {
  const rows = new Map<number, number[]>();
  for (const d of range.dummies) {
    const z = d.position[2];
    rows.set(z, [...(rows.get(z) ?? []), d.position[0]]);
  }
  const size = RANGE_LABELS.sizeMeters;
  for (const [z, xs] of rows) {
    const distance = Math.round(Math.abs(range.firingLineZ - z));
    const label = new Mesh(
      new PlaneGeometry(size, size / 2),
      new MeshBasicMaterial({ map: textTexture(`${distance} m`, RANGE_LABELS.color), transparent: true, depthWrite: false }),
    );
    label.rotation.x = -Math.PI / 2;
    label.position.set(xs.reduce((a, b) => a + b, 0) / xs.length, 0.01, z + RANGE_LABELS.offsetZ);
    scene.add(label);
  }
}
