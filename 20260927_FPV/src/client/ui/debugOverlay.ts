import { HUD } from '../../config/client.ts';
import { el } from '../dom.ts';

// NEW — debug overlay (toggle key in BINDINGS): FPS, tick rate, simulation and operator stats.
// Refreshes at HUD.debugRefreshHz so reading it does not cost frame time.

export class DebugOverlay {
  private readonly node: HTMLElement;
  private sinceRefresh = Infinity;
  visible = false;

  constructor(parent: HTMLElement) {
    this.node = el('pre', 'debug hidden', parent);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.node.classList.toggle('hidden', !visible);
    this.sinceRefresh = Infinity;
  }

  toggle(): void {
    this.setVisible(!this.visible);
  }

  update(dt: number, text: () => string): void {
    if (!this.visible) return;
    this.sinceRefresh += dt;
    if (this.sinceRefresh < 1 / HUD.debugRefreshHz) return;
    this.sinceRefresh = 0;
    this.node.textContent = text();
  }
}
