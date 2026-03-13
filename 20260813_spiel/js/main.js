/**
 * main.js - Entry Point fuer das Spiel.
 * Erstellt die Game-Instanz und startet die Game-Loop.
 */

import { Game } from './core/Game.js';

const canvas = document.getElementById('gameCanvas');
const game = new Game(canvas);
game.start();
