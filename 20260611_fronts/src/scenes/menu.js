// Hauptmenü — baut die Modus-Auswahl datengetrieben aus MODES auf.
// Keine Modus-Karte wird im HTML hardcodiert; alles kommt aus den Daten.

import { MODES } from '../config/constants.js';
import { showScene } from '../core/scenes.js';

/**
 * Initialisiert das Hauptmenü.
 * @param {(modeId: string) => void} onSelectMode  Aufruf, wenn ein Modus gewählt wurde.
 */
export function initMenu(onSelectMode) {
  const grid = document.getElementById('mode-grid');
  grid.innerHTML = '';

  for (const mode of MODES) {
    const card = document.createElement('button');
    card.className = 'mode-card';
    card.dataset.mode = mode.id;
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

  showScene('menu');
}
