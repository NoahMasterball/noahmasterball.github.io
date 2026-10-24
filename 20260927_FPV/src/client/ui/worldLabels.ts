import { Vector3, type Camera } from 'three';
import { HUD } from '../../config/client.ts';
import { getHitboxProfile } from '../../data/content.ts';
import { partWorldCenter } from '../../sim/hitbox.ts';
import { lerp, lerpVec3, type Vec3 } from '../../sim/math.ts';
import { operatorOf } from '../../sim/stats.ts';
import type { CharacterEntity, EntityId } from '../../sim/types.ts';
import { el } from '../dom.ts';

// NEW — world-anchored DOM labels (range mode, SPEC §14): health bars over dummies and
// floating damage numbers at hit points. The projection and the head anchor are shared with the
// reveal markers (ui/revealMarkers.ts).

export interface LabelTarget {
  id: EntityId;
  alive: boolean;
  health: number;
  maxHealth: number;
  anchor: Vec3;
}

interface DamageNumber {
  node: HTMLElement;
  point: Vector3;
  age: number;
}

/** A screen position in CSS pixels; `visible` is false behind the camera or beyond its range. */
export interface ScreenPoint {
  x: number;
  y: number;
  visible: boolean;
}

const scratch = new Vector3();

/** Projects a world point to CSS pixels of a `width` × `height` viewport. */
export function projectToScreen(camera: Camera, p: Vec3, width: number, height: number): ScreenPoint {
  const v = scratch.set(p.x, p.y, p.z).project(camera);
  return { x: (v.x * 0.5 + 0.5) * width, y: (-v.y * 0.5 + 0.5) * height, visible: v.z < 1 && v.z > -1 };
}

/** Centre of a character's head at render time (`alpha` between the last two ticks). */
export function headPosition(e: CharacterEntity, alpha: number): Vec3 {
  const profile = getHitboxProfile(operatorOf(e).hitboxProfile);
  return partWorldCenter(profile, lerp(e.prevStance, e.stance, alpha), lerpVec3(e.prevPos, e.pos, alpha), e.yaw, 'head');
}

export class WorldLabels {
  private readonly root: HTMLElement;
  private readonly bars = new Map<EntityId, { wrap: HTMLElement; fill: HTMLElement }>();
  private numbers: DamageNumber[] = [];

  constructor(parent: HTMLElement) {
    this.root = el('div', 'layer', parent);
  }

  spawnDamage(point: Vec3, amount: number, head: boolean): void {
    const node = el('div', `world-label damage-number${head ? ' head' : ''}`, this.root);
    node.textContent = String(Math.round(amount));
    this.numbers.push({ node, point: new Vector3(point.x, point.y, point.z), age: 0 });
  }

  update(dt: number, camera: Camera, targets: readonly LabelTarget[]): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (const t of targets) {
      let bar = this.bars.get(t.id);
      if (!bar) {
        const wrap = el('div', 'world-label healthbar', this.root);
        wrap.style.width = `${HUD.healthBarWidthPx}px`;
        bar = { wrap, fill: el('div', '', wrap) };
        this.bars.set(t.id, bar);
      }
      const s = projectToScreen(camera, t.anchor, w, h);
      const show = t.alive && s.visible;
      bar.wrap.style.display = show ? 'block' : 'none';
      if (!show) continue;
      bar.wrap.style.left = `${s.x}px`;
      bar.wrap.style.top = `${s.y}px`;
      bar.fill.style.width = `${(100 * t.health) / t.maxHealth}%`;
    }

    this.numbers = this.numbers.filter((n) => {
      n.age += dt;
      const life = n.age / HUD.damageNumberSeconds;
      if (life >= 1) {
        n.node.remove();
        return false;
      }
      const s = projectToScreen(camera, n.point, w, h);
      n.node.style.display = s.visible ? 'block' : 'none';
      n.node.style.left = `${s.x}px`;
      n.node.style.top = `${s.y - life * HUD.damageNumberRisePx}px`;
      n.node.style.opacity = String(1 - life * life);
      return true;
    });
  }
}
