import { Game } from './core/game.js';

// Entry-Point. Holt Canvas, startet Game.
// Folge-Batches: hier weitere Module instanziieren und an game hängen.

const canvas = document.getElementById('game-canvas');
if (!canvas) throw new Error('Canvas #game-canvas nicht gefunden.');

const game = new Game(canvas);
game.start();

// Für Debugging in der DevTools-Konsole:
window.__game = game;
