// NEW — MCF-Shooter-Szene. Verdrahtet Match-Erzeugung, Eingabe, Render-Loop und
// HUD. Hält selbst keine Spielregeln (die liegen in shooter/engine.js), nur die
// Sicht-/Eingabe-Hilfsgrößen.

import { showScene } from '../core/scenes.js';
import {
  createMatch, updateMatch, reloadWeapon, switchSlot, throwGrenade,
  buyWeapon, buyGrenade,
} from '../shooter/engine.js';
import { renderShooter } from '../shooter/render.js';
import { initShooterHud, renderShooterHud } from '../shooter/hud.js';
import { KEYS, SLOT_PRIMARY, SLOT_SECONDARY } from '../config/shooter.js';

let canvas, ctx;
let state = null;
let onExit = null;
let rafId = null;
let lastT = 0;
let matchConfig = null;

const keysDown = new Set();
let mouseX = 0, mouseY = 0, firing = false;
let listenersAttached = false;

/**
 * Startet die Shooter-Szene.
 * @param {object} config  { teamSize, perTeam, modeId, isTeam, playerName }
 * @param {() => void} backToMenu
 */
export function startShooterScene(config, backToMenu) {
  onExit = backToMenu;
  matchConfig = config;
  showScene('shooter');

  canvas = document.getElementById('shooter-canvas');
  ctx = canvas.getContext('2d');
  resizeCanvas();

  initShooterHud(document.getElementById('shooter-ui'), {
    onBack: exitToMenu,
    onBuy: (id) => buyWeapon(state, id),
    onBuyGrenade: () => buyGrenade(state),
    onRematch: () => { state = createMatch(matchConfig); },
  });

  state = createMatch(config);
  attachInput();
  keysDown.clear();
  firing = false;
  startLoop();
}

// --- Eingabe ----------------------------------------------------------------

function attachInput() {
  if (listenersAttached) return;
  listenersAttached = true;

  window.addEventListener('keydown', (e) => {
    if (!isActive()) return;
    if (e.repeat) { return; }
    keysDown.add(e.key);
    handleActionKey(e);
  });
  window.addEventListener('keyup', (e) => {
    keysDown.delete(e.key);
  });
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) firing = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) firing = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('resize', () => { if (isActive()) resizeCanvas(); });
}

function isActive() {
  return state && document.getElementById('scene-shooter').classList.contains('active');
}

// Diskrete Tastenaktionen (Kanten, kein Halten).
function handleActionKey(e) {
  if (!state) return;
  const k = e.key;
  if (KEYS.reload.includes(k)) { reloadWeapon(state); e.preventDefault(); }
  else if (KEYS.grenade.includes(k)) { throwGrenade(state); e.preventDefault(); }
  else if (KEYS.primary.includes(k)) switchSlot(state, SLOT_PRIMARY);
  else if (KEYS.secondary.includes(k)) switchSlot(state, SLOT_SECONDARY);
}

// Bewegungsrichtung aus den gedrückten Tasten.
function readInput() {
  const anyDown = (list) => list.some((k) => keysDown.has(k));
  const moveX = (anyDown(KEYS.right) ? 1 : 0) - (anyDown(KEYS.left) ? 1 : 0);
  const moveY = (anyDown(KEYS.down) ? 1 : 0) - (anyDown(KEYS.up) ? 1 : 0);
  // Zielwinkel: Maus relativ zur Bildschirmmitte (Spieler ist zentriert).
  const aimAngle = Math.atan2(mouseY - canvas.height / 2, mouseX - canvas.width / 2);
  return { moveX, moveY, aimAngle, firing };
}

// --- Loop -------------------------------------------------------------------

function startLoop() {
  if (rafId) cancelAnimationFrame(rafId);
  lastT = performance.now();
  const loop = (t) => {
    rafId = requestAnimationFrame(loop);
    const dtMs = Math.min(50, t - lastT); // großen Sprung (Tab-Wechsel) begrenzen
    lastT = t;
    updateMatch(state, dtMs, t, readInput());
    renderShooter(ctx, canvas, state, t);
    renderShooterHud(state);
  };
  rafId = requestAnimationFrame(loop);
}

function resizeCanvas() {
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
}

function exitToMenu() {
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  state = null;
  firing = false;
  keysDown.clear();
  if (onExit) onExit();
}
