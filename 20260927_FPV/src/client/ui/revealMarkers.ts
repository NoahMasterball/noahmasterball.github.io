import type { Camera } from 'three';
import { HUD } from '../../config/client.ts';
import { isRevealedTo } from '../../sim/stats.ts';
import type { CharacterEntity, EntityId } from '../../sim/types.ts';
import { el } from '../dom.ts';
import { headPosition, projectToScreen } from './worldLabels.ts';

// NEW — reveal markers (ADR-0012 §8, SPEC §14): nothing showed revealed enemies. A DOM marker
// over the head of every living enemy revealed to the local player's team (isRevealedTo) — DOM,
// so it shows through walls by nature — in the enemy colour, fading out with the reveal.

/** Seconds the longest of `e`'s reveals to `team` still runs. */
const revealRemaining = (e: CharacterEntity, team: number): number =>
  e.reveals.reduce((most, r) => (r.team === team ? Math.max(most, r.remaining) : most), 0);

export class RevealMarkers {
  private readonly root: HTMLElement;
  private readonly markers = new Map<EntityId, HTMLElement>();

  constructor(parent: HTMLElement) {
    this.root = el('div', 'layer', parent);
  }

  /** Places one marker per revealed enemy of `team` (render time `alpha`); hides the others. */
  update(camera: Camera, characters: readonly CharacterEntity[], team: number, alpha: number): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (const e of characters) {
      const revealed = e.alive && e.team !== team && isRevealedTo(e, team);
      let marker = this.markers.get(e.id);
      if (!revealed) {
        if (marker) marker.style.display = 'none';
        continue;
      }
      if (!marker) {
        marker = el('div', 'world-label reveal-marker', this.root);
        marker.style.width = marker.style.height = `${HUD.reveal.markerPx}px`;
        el('i', '', marker); // the triangle (the marker itself carries the outline)
        this.markers.set(e.id, marker);
      }
      const head = headPosition(e, alpha);
      const s = projectToScreen(camera, { x: head.x, y: head.y + HUD.reveal.liftM, z: head.z }, w, h);
      marker.style.display = s.visible ? 'block' : 'none';
      if (!s.visible) continue;
      marker.style.left = `${s.x}px`;
      marker.style.top = `${s.y}px`;
      marker.style.opacity = Math.min(1, revealRemaining(e, team) / HUD.reveal.fadeSeconds).toFixed(3);
    }
  }
}
