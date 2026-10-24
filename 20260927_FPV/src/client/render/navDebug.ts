import { BufferGeometry, Color, Float32BufferAttribute, Group, LineBasicMaterial, LineSegments, Points, PointsMaterial, type Scene } from 'three';
import { NAV_DEBUG } from '../../config/client.ts';
import type { NavGraphDef, Vec3Tuple } from '../../data/schema.ts';

// NEW — bot waypoint graph overlay (ADR-0011 §5: authored nav is reviewed visually): nodes as
// points coloured by tag, links as lines coloured by kind (one-way links stand out), drawn
// through walls. Shown with the debug overlay; a level without `nav` draws nothing.

/** Draw on top of the world (debug geometry is never hidden by walls). */
const OVERLAY_ORDER = 1000;

export class NavDebug {
  private readonly group = new Group();

  constructor(scene: Scene, nav: NavGraphDef | undefined) {
    this.group.visible = false;
    if (!nav) return;
    const lift = (p: Vec3Tuple): number[] => [p[0], p[1] + NAV_DEBUG.lift, p[2]];
    const byId = new Map(nav.nodes.map((n) => [n.id, n]));

    const nodePos: number[] = [];
    const nodeColor: number[] = [];
    for (const n of nav.nodes) {
      const tag = n.tags?.[0];
      nodePos.push(...lift(n.pos));
      nodeColor.push(...new Color(tag ? NAV_DEBUG.tags[tag] : NAV_DEBUG.node).toArray());
    }

    const linkPos: number[] = [];
    const linkColor: number[] = [];
    for (const l of nav.links) {
      const from = byId.get(l.from);
      const to = byId.get(l.to);
      // Content validation (src/data/content.ts) rejects dangling links before a level loads.
      if (!from || !to) throw new Error(`Nav link ${l.from} → ${l.to} names a missing node`);
      const color = new Color(l.oneWay ? NAV_DEBUG.oneWay : NAV_DEBUG.links[l.kind ?? 'walk']).toArray();
      linkPos.push(...lift(from.pos), ...lift(to.pos));
      linkColor.push(...color, ...color);
    }

    // Exact debug colours: no tone mapping, no fog.
    const overlay = { depthTest: false, depthWrite: false, transparent: true, vertexColors: true, toneMapped: false, fog: false } as const;
    const links = new LineSegments(geometry(linkPos, linkColor), new LineBasicMaterial(overlay));
    const nodes = new Points(geometry(nodePos, nodeColor), new PointsMaterial({ ...overlay, size: NAV_DEBUG.nodePx, sizeAttenuation: false }));
    links.renderOrder = OVERLAY_ORDER;
    nodes.renderOrder = OVERLAY_ORDER + 1;
    this.group.add(links, nodes);
    scene.add(this.group);
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }
}

function geometry(positions: number[], colors: number[]): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return g;
}
