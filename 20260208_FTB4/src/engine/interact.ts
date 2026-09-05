import { Vector3 } from 'three';
import { INTERACT } from '../config';

export interface Interactable {
  position: Vector3;
  prompt: string;
  onInteract(): void;
}

/**
 * Proximity interaction: shows the closest in-range interactable's prompt in
 * the #hint element and fires it on the interact key.
 */
export class InteractionSystem {
  private readonly items: Interactable[] = [];
  private readonly hint = document.getElementById('hint') as HTMLDivElement;
  private active: Interactable | null = null;

  add(item: Interactable): void {
    this.items.push(item);
  }

  update(playerPos: Vector3, interactPressed: boolean): void {
    let best: Interactable | null = null;
    let bestDist: number = INTERACT.radius;
    for (const item of this.items) {
      const d = item.position.distanceTo(playerPos);
      if (d < bestDist) {
        best = item;
        bestDist = d;
      }
    }
    if (best !== this.active) {
      this.active = best;
      if (best) {
        this.hint.textContent = best.prompt;
        this.hint.classList.add('visible');
      } else {
        this.hint.classList.remove('visible');
      }
    }
    if (best && interactPressed) best.onInteract();
  }
}
