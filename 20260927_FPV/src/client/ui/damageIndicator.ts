import { HUD } from '../../config/client.ts';
import { anglesTo, DEG2RAD, type Vec3 } from '../../sim/math.ts';
import type { EntityId } from '../../sim/types.ts';

// NEW — damage-direction indicator (SPEC §14 transient HUD): an arc on a ring around the
// crosshair that points at where the damage came from. Fed from the simulation's `hit` events
// (`hit.sourcePos`: the shooter's eye when the shot was fired); plain DOM/SVG like the rest of
// the HUD (ADR-0007).

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Screen rotation (radians, clockwise from straight up) of an indicator for damage from
 *  `source`, seen from `eye` looking along `viewYaw`: 0 = ahead, π/2 = right, ±π = behind. */
export function indicatorAngle(eye: Vec3, viewYaw: number, source: Vec3): number {
  return viewYaw - anglesTo(eye, source).yaw;
}

/** Opacity of an arc `age` seconds after its last hit: full while held, then a linear fade. */
export function indicatorOpacity(age: number): number {
  const { holdSeconds, fadeSeconds } = HUD.damageIndicator;
  if (age <= holdSeconds) return 1;
  return Math.max(0, 1 - (age - holdSeconds) / fadeSeconds);
}

interface Arc {
  attackerId: EntityId;
  source: Vec3;
  age: number;
  node: SVGPathElement;
}

/** SVG path of one arc centred on "up", in a viewBox centred on the crosshair. */
function arcPath(): string {
  const { radiusPx: r, arcDeg } = HUD.damageIndicator;
  const half = (arcDeg / 2) * DEG2RAD;
  const x = r * Math.sin(half);
  const y = -r * Math.cos(half);
  return `M ${-x} ${y} A ${r} ${r} 0 0 1 ${x} ${y}`;
}

export class DamageIndicator {
  private readonly svg: SVGSVGElement;
  private readonly path = arcPath();
  private arcs: Arc[] = [];

  constructor(parent: HTMLElement) {
    const { radiusPx, thicknessPx } = HUD.damageIndicator;
    const size = 2 * (radiusPx + thicknessPx);
    this.svg = document.createElementNS(SVG_NS, 'svg');
    this.svg.classList.add('damage-indicator');
    this.svg.setAttribute('width', String(size));
    this.svg.setAttribute('height', String(size));
    this.svg.setAttribute('viewBox', `${-size / 2} ${-size / 2} ${size} ${size}`);
    this.svg.style.margin = `${-size / 2}px 0 0 ${-size / 2}px`;
    this.svg.style.strokeWidth = `${thicknessPx}px`;
    parent.appendChild(this.svg);
  }

  /** Damage from `attackerId`, standing at `source`. A later hit from the same attacker moves and
   *  refreshes its arc instead of adding one. */
  add(attackerId: EntityId, source: Vec3): void {
    const existing = this.arcs.find((a) => a.attackerId === attackerId);
    if (existing) {
      existing.source = { ...source };
      existing.age = 0;
      return;
    }
    if (this.arcs.length >= HUD.damageIndicator.maxArcs) {
      this.arcs.sort((a, b) => b.age - a.age);
      this.arcs.shift()?.node.remove();
    }
    const node = document.createElementNS(SVG_NS, 'path');
    node.setAttribute('d', this.path);
    this.svg.appendChild(node);
    this.arcs.push({ attackerId, source: { ...source }, age: 0, node });
  }

  clear(): void {
    for (const a of this.arcs) a.node.remove();
    this.arcs = [];
  }

  /** Ages the arcs by `dt` and aims them for the current view. */
  update(dt: number, eye: Vec3, viewYaw: number): void {
    this.arcs = this.arcs.filter((a) => {
      a.age += dt;
      const opacity = indicatorOpacity(a.age);
      if (opacity <= 0) {
        a.node.remove();
        return false;
      }
      a.node.setAttribute('transform', `rotate(${(indicatorAngle(eye, viewYaw, a.source) / DEG2RAD).toFixed(1)})`);
      a.node.style.opacity = opacity.toFixed(3);
      return true;
    });
  }
}
