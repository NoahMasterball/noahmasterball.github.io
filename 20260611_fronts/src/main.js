// Bootstrap — Einstiegspunkt. Verdrahtet Menü und Spielszene miteinander.

import { MODES } from './config/constants.js';
import { initMenu } from './scenes/menu.js';
import { startGameScene } from './scenes/game.js';
import { showScene } from './core/scenes.js';
import { initUiSounds } from './core/audio.js';
import { initSettingsMenu } from './ui/settingsmenu.js';

function backToMenu() {
  showScene('menu');
}

function startGame(modeId) {
  const mode = MODES.find((m) => m.id === modeId);
  if (!mode || !mode.available) return; // Nicht verfügbare Modi ignorieren.
  startGameScene(mode, backToMenu);
}

function main() {
  initUiSounds();      // Globaler Klick-Klang für alle Buttons (eine Bindung)
  initMenu(startGame);
  initSettingsMenu();  // Zahnrad-Knopf + Einstellungs-Overlay im Hauptmenü
}

main();
