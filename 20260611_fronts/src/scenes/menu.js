// Hauptmenü — Auswahl der Strategie-Ära (Modern / WW2). Datengetrieben aus den
// Konstanten; keine Karte wird im HTML hardcodiert.

import { MODES } from '../config/constants.js';
import { showScene } from '../core/scenes.js';

/**
 * Initialisiert das Hauptmenü.
 * @param {{onStartStrategy:(modeId:string)=>void}} handlers
 */
export function initMenu({ onStartStrategy }) {
  buildStrategyModes(onStartStrategy);
  showScene('menu');
}

// --- Strategie: Modus-Karten (Modern / WW2) ---------------------------------
function buildStrategyModes(onSelectMode) {
  const grid = document.getElementById('mode-grid');
  grid.innerHTML = '';
  for (const mode of MODES) {
    const card = document.createElement('button');
    card.className = 'mode-card';
    card.dataset.mode = mode.id;
    card.dataset.sound = 'start';
    card.disabled = !mode.available;
    const badge = mode.available ? '' : '<div class="mode-badge">bald</div>';
    card.innerHTML = `
      ${badge}
      <div class="mode-year">${mode.year}</div>
      <div class="mode-label">${mode.label}</div>
      <div class="mode-sub">${mode.subtitle}</div>
    `;
    if (mode.available) card.addEventListener('click', () => onSelectMode(mode.id));
    grid.appendChild(card);
  }
}
