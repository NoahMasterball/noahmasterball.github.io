import {
  BoxGeometry,
  CapsuleGeometry,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  type BufferGeometry,
  type Scene,
} from 'three';
import { ABILITY_VISUALS, TEAM_STYLE } from '../../config/client.ts';
import { getHitboxProfile, getOperator } from '../../data/content.ts';
import type { HitboxProfileDef, HitboxShape, Vec3Tuple } from '../../data/schema.ts';
import { layoutHitboxes, mainZonePart, stanceHeightRatio } from '../../sim/hitbox.ts';
import { lerp } from '../../sim/math.ts';
import { shieldAmount } from '../../sim/stats.ts';
import type { CharacterEntity, EntityId } from '../../sim/types.ts';

// NEW — greybox character visuals built from the operator's hitbox profile (SPEC §5.1): what
// you see is exactly what you can hit. Interpolated between simulation ticks. A band around the
// torso in the team colour (as the local player sees it, TEAM_STYLE) tells friend from foe
// (SPEC §16): a flat slice of the torso's main part, marginally wider than the hitbox. A shielded
// character wears a translucent shell (ADR-0012 §9, ABILITY_VISUALS.shield).

const HEAD_COLOR = 0xe6dccd;
const VISOR_COLOR = 0x1b1d22;
const LIMB_SHADE = 0.55;

interface ActorView {
  group: Group;
  operatorId: string;
  parts: Mesh[];
  /** Shield shell (shown while shieldAmount > 0); its centre height at standing, from the feet. */
  shell: Mesh;
  shellCenterY: number;
}

/** A shield shell: its geometry (shared per hitbox profile) and centre height from the feet. */
interface ShellShape {
  geometry: BufferGeometry;
  centerY: number;
}

function geometryFor(shape: HitboxShape): BufferGeometry {
  switch (shape.kind) {
    case 'ball':
      return new SphereGeometry(shape.radius, 20, 14);
    case 'cuboid':
      return new BoxGeometry(shape.halfExtents[0] * 2, shape.halfExtents[1] * 2, shape.halfExtents[2] * 2);
    case 'capsule':
      return new CapsuleGeometry(shape.radius, shape.halfHeight * 2, 6, 12);
  }
}

// NEW — the shield shell needs a body's bounds; hitbox shapes had no extent helper.
/** Half extents of a hitbox shape in its part's frame (capsules stand along Y). */
function shapeHalfExtents(shape: HitboxShape): Vec3Tuple {
  switch (shape.kind) {
    case 'ball':
      return [shape.radius, shape.radius, shape.radius];
    case 'cuboid':
      return shape.halfExtents;
    case 'capsule':
      return [shape.radius, shape.halfHeight + shape.radius, shape.radius];
  }
}

/** The shield shell of a profile: a capsule `ABILITY_VISUALS.shield.grow` × the standing body's
 *  bounds around the body axis (widest part incl. the arms, feet to head top), centred on them. */
function shellShape(profile: HitboxProfileDef): ShellShape {
  let radius = 0;
  let bottom = Infinity;
  let top = -Infinity;
  for (const pose of layoutHitboxes(profile, 0)) {
    const [hx, hy, hz] = shapeHalfExtents(pose.shape);
    radius = Math.max(radius, Math.hypot(Math.abs(pose.center.x) + hx, Math.abs(pose.center.z) + hz));
    bottom = Math.min(bottom, pose.center.y - hy);
    top = Math.max(top, pose.center.y + hy);
  }
  const grow = ABILITY_VISUALS.shield.grow;
  const r = radius * grow;
  const halfHeight = Math.max(0, ((top - bottom) * grow) / 2 - r);
  return { geometry: geometryFor({ kind: 'capsule', halfHeight, radius: r }), centerY: (top + bottom) / 2 };
}

/** A team band is an unlit marker: exactly the HUD's team colour, in sun and shade alike (lit and
 *  tone-mapped, the enemy red washed out to pink in the sun). */
const bandMaterial = (color: number): MeshBasicMaterial => new MeshBasicMaterial({ color, toneMapped: false });

export class ActorViews {
  private readonly views = new Map<EntityId, ActorView>();
  private readonly scene: Scene;
  private readonly localTeam: number;
  private readonly bands = {
    ally: bandMaterial(TEAM_STYLE.colors.ally),
    enemy: bandMaterial(TEAM_STYLE.colors.enemy),
  };
  /** Unlit and see-through, drawn after the body without hiding it. */
  private readonly shieldMaterial = new MeshBasicMaterial({
    color: ABILITY_VISUALS.shield.color,
    transparent: true,
    opacity: ABILITY_VISUALS.shield.opacity,
    depthWrite: false,
    toneMapped: false,
  });
  /** Shell per hitbox profile id (geometry shared by every actor of that profile). */
  private readonly shells = new Map<string, ShellShape>();

  /** `localTeam`: the local player's team; everyone on it wears the ally band. */
  constructor(scene: Scene, localTeam: number) {
    this.scene = scene;
    this.localTeam = localTeam;
  }

  private build(e: CharacterEntity): ActorView {
    const op = getOperator(e.operatorId);
    const body = new MeshStandardMaterial({ color: op.presentation.color, roughness: 0.7 });
    const limbs = new MeshStandardMaterial({ color: new Color(op.presentation.color).multiplyScalar(LIMB_SHADE), roughness: 0.8 });
    const head = new MeshStandardMaterial({ color: HEAD_COLOR, roughness: 0.6 });
    const group = new Group();
    const profile = getHitboxProfile(op.hitboxProfile);
    const bandPart = mainZonePart(profile, 'torso');
    const band = e.team === this.localTeam ? this.bands.ally : this.bands.enemy;
    const parts = layoutHitboxes(profile, 0).map((pose) => {
      const material = pose.part.zone === 'head' ? head : pose.part.zone === 'torso' ? body : limbs;
      const mesh = new Mesh(geometryFor(pose.shape), material);
      mesh.castShadow = true;
      group.add(mesh);
      if (pose.part.zone === 'head' && pose.shape.kind === 'ball') {
        // Visor shows which way the dummy faces (decoration inside the head hitbox).
        const r = pose.shape.radius;
        const visor = new Mesh(new BoxGeometry(r * 1.4, r * 0.45, r * 0.5), new MeshStandardMaterial({ color: VISOR_COLOR, roughness: 0.3 }));
        visor.position.set(0, r * 0.1, -r * 0.72);
        mesh.add(visor);
      }
      if (pose.part === bandPart) {
        const { grow, height } = TEAM_STYLE.band;
        const ring = new Mesh(geometryFor(pose.shape), band);
        ring.scale.set(grow, height, grow);
        mesh.add(ring);
      }
      return mesh;
    });
    const shape = this.shellFor(profile);
    const shell = new Mesh(shape.geometry, this.shieldMaterial);
    shell.visible = false;
    group.add(shell);
    this.scene.add(group);
    return { group, operatorId: e.operatorId, parts, shell, shellCenterY: shape.centerY };
  }

  private shellFor(profile: HitboxProfileDef): ShellShape {
    let shape = this.shells.get(profile.id);
    if (!shape) {
      shape = shellShape(profile);
      this.shells.set(profile.id, shape);
    }
    return shape;
  }

  private viewFor(e: CharacterEntity): ActorView {
    let view = this.views.get(e.id);
    if (view && view.operatorId !== e.operatorId) {
      this.scene.remove(view.group);
      view = undefined;
    }
    if (!view) {
      view = this.build(e);
      this.views.set(e.id, view);
    }
    return view;
  }

  /** Positions every visible character for the render alpha; `hiddenId` is the local player. */
  sync(entities: readonly CharacterEntity[], alpha: number, hiddenId: EntityId | null): void {
    for (const e of entities) {
      const view = this.viewFor(e);
      view.group.visible = e.alive && e.id !== hiddenId;
      if (!view.group.visible) continue;
      view.group.position.set(lerp(e.prevPos.x, e.pos.x, alpha), lerp(e.prevPos.y, e.pos.y, alpha), lerp(e.prevPos.z, e.pos.z, alpha));
      view.group.rotation.y = lerp(e.prevYaw, e.yaw, alpha);
      const stance = lerp(e.prevStance, e.stance, alpha);
      const ratio = stanceHeightRatio(stance);
      layoutHitboxes(getHitboxProfile(getOperator(e.operatorId).hitboxProfile), stance).forEach((pose, i) => {
        const mesh = view.parts[i];
        if (!mesh) return;
        mesh.position.set(pose.center.x, pose.center.y, pose.center.z);
        mesh.scale.y = pose.shape.kind === 'ball' ? 1 : ratio;
      });
      view.shell.visible = shieldAmount(e) > 0;
      if (view.shell.visible) {
        view.shell.position.y = view.shellCenterY * ratio;
        view.shell.scale.y = ratio;
      }
    }
  }
}
