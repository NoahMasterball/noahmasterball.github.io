// NEW — pause menu (resume + controls list generated from KEY_BINDINGS / MOUSE_HELP) and the
// F3 debug overlay.
import { KEY_BINDINGS, MOUSE_HELP, TEXT, type ActionId } from '../../config/client.ts';
import { BIOMES } from '../../data/biomes.ts';
import { biomeAt } from '../../sim/biome.ts';
import type { SimState } from '../../sim/state.ts';
import { el, setText, setVisible } from '../dom.ts';

export class PauseMenu {
  readonly root: HTMLDivElement;
  private muteLabel: HTMLButtonElement;

  constructor(ui: HTMLElement, onResume: () => void, onMute: () => void) {
    this.root = el('div', 'pause-menu', ui);
    const panel = el('div', 'panel menu-panel interactive', this.root);
    el('div', 'menu-title', panel).textContent = TEXT.paused;
    const buttons = el('div', 'menu-buttons', panel);
    const resume = el('button', 'btn btn-primary', buttons);
    resume.textContent = TEXT.resume;
    resume.addEventListener('click', onResume);
    this.muteLabel = el('button', 'btn', buttons);
    this.muteLabel.addEventListener('click', onMute);
    el('div', 'panel-title', panel).textContent = TEXT.controls;
    const table = el('div', 'controls-list', panel);
    const row = (key: string, label: string): void => {
      el('span', 'controls-key', table).textContent = key;
      el('span', 'controls-label', table).textContent = label;
    };
    for (const id of Object.keys(KEY_BINDINGS) as ActionId[]) row(KEY_BINDINGS[id].keyLabel, KEY_BINDINGS[id].label);
    for (const m of MOUSE_HELP) row(m.keyLabel, m.label);
    this.root.hidden = true;
  }

  show(visible: boolean, muted: boolean): void {
    setVisible(this.root, visible);
    setText(this.muteLabel, muted ? TEXT.muted : TEXT.unmuted);
  }
}

export interface DebugInfo {
  fps: number;
  chunksCached: number;
  chunksBuilt: number;
}

export class DebugOverlay {
  readonly root: HTMLPreElement;
  visible = false;

  constructor(ui: HTMLElement) {
    this.root = el('pre', 'debug-overlay', ui);
    this.root.hidden = true;
  }

  toggle(): void {
    this.visible = !this.visible;
    setVisible(this.root, this.visible);
  }

  update(state: SimState, info: DebugInfo): void {
    if (!this.visible) return;
    const b = state.player.body;
    const tx = Math.floor(b.x + b.w / 2);
    const ty = Math.floor(b.y + b.h);
    const lines = [
      `fps      ${info.fps.toFixed(0)}`,
      `tick     ${state.tick}`,
      `seed     ${state.seed}`,
      `tile     ${tx}, ${ty}`,
      `biome    ${BIOMES[biomeAt(state.world, tx, ty)].name}`,
      `zombies  ${state.zombies.length}`,
      `drops    ${state.drops.length}`,
      `liquid   ${state.world.liquidActive.size} active`,
      `falling  ${state.world.fallingActive.size} active`,
      `chunks   ${info.chunksCached} cached, ${info.chunksBuilt} built`,
    ];
    setText(this.root, lines.join('\n'));
  }
}
