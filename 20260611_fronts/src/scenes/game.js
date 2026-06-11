// Spielszene — verdrahtet Laden, Rasterung, Eingabe, Rendering und Tick.
// Hält selbst keine Spieldaten (die liegen im state-Modul), nur die Sicht-
// und Eingabe-Hilfsgrößen (Kamera, Canvas, Hover).

import { showScene } from '../core/scenes.js';
import { generateGrid, pixelToAxial, hexKey } from '../core/hexgrid.js';
import { loadGeoJson, loadCities, rasterizeCountries } from '../core/geo.js';
import { applyEconomy } from '../core/economy.js';
import {
  createCamera, screenToWorld, panByScreen, zoomAt, fitWorld, centerOn,
} from '../core/camera.js';
import { render, prepareMap } from '../core/renderer.js';
import {
  initState, getState, setPlayerCountry, setSelected, placeBuilding, produceTick,
  research, buildUnit,
} from '../core/state.js';
import { ZOOM_STEP, ZOOM_MAX, TICK_INTERVAL_MS, MENU_KEY } from '../config/constants.js';
import { initPanel, renderPanel, toast } from '../ui/panel.js';
import {
  initWarMenu, toggleWarMenu, isWarMenuOpen, renderWarMenu,
} from '../ui/warmenu.js';
import { UNIT_BY_ID } from '../data/military.js';

// Sicht-/Eingabezustand dieser Szene (keine Spieldaten — die sind im state).
let canvas, ctx, cam;
let phase = 'choose-country';
let hovered = null;
let needsRender = false;
let tickTimer = null;
let onExit = null; // Rückkehr zum Menü

/**
 * Startet die Spielszene für einen Modus.
 * @param {object} mode  Eintrag aus MODES.
 * @param {() => void} backToMenu  Aufruf, um zum Menü zurückzukehren.
 */
export async function startGameScene(mode, backToMenu) {
  onExit = backToMenu;
  showScene('game');
  setLoading(`Welt „${mode.label} ${mode.year}“ wird gerastert …`);

  canvas = document.getElementById('game-canvas');
  ctx = canvas.getContext('2d');
  cam = createCamera();
  resizeCanvas();

  // 1) Raster erzeugen, Geo- und Städtedaten parallel laden, Länder rastern.
  const hexes = generateGrid();
  let geojson, cities;
  try {
    [geojson, cities] = await Promise.all([
      loadGeoJson(mode.dataUrl),
      mode.citiesUrl ? loadCities(mode.citiesUrl) : Promise.resolve([]),
    ]);
  } catch (err) {
    setLoading(`Karte konnte nicht geladen werden: ${err.message}`);
    return;
  }
  const { owners, countries } = rasterizeCountries(hexes, geojson);
  applyEconomy(countries); // Kleinland-Bonus + Wirtschaftskraft pro Land berechnen

  // 2) Zustand initialisieren und statische Karte (Flächen + Grenzen) vorberechnen.
  initState({ mode, hexes, owners, countries, cities });
  prepareMap(getState());

  // 3) UI + Eingabe + Tick.
  initPanel({ onBuild: handleBuild, onBack: exitToMenu, onOpenMenu: openMenu });
  initWarMenu({ onResearch: handleResearch, onBuild: handleBuildUnit });
  phase = 'choose-country';
  hovered = null;
  setSelected(null);
  setPlayerCountry(null);
  attachInput();
  fitWorld(cam, canvas.width, canvas.height);
  startTick();

  setLoading(null);
  renderPanel(getState(), phase);
  requestRender();
}

// --- Eingabe ----------------------------------------------------------------

let dragging = false;
let movedWhileDown = false;
let lastX = 0, lastY = 0;
let listenersAttached = false;

function attachInput() {
  if (listenersAttached) return; // Listener nur einmal binden (SSOT der Bindung).
  listenersAttached = true;

  canvas.addEventListener('mousedown', (e) => {
    dragging = true;
    movedWhileDown = false;
    lastX = e.clientX;
    lastY = e.clientY;
  });

  window.addEventListener('mouseup', (e) => {
    if (dragging && !movedWhileDown) handleClick(e);
    dragging = false;
  });

  canvas.addEventListener('mousemove', (e) => {
    if (dragging) {
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 3) movedWhileDown = true;
      panByScreen(cam, dx, dy);
      lastX = e.clientX;
      lastY = e.clientY;
      requestRender();
    }
    const hex = pickHex(e);
    const changed = (hex?.q !== hovered?.q) || (hex?.r !== hovered?.r);
    hovered = hex;
    if (changed) requestRender();
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    zoomAt(cam, factor, e.clientX - rect.left, e.clientY - rect.top);
    requestRender();
  }, { passive: false });

  window.addEventListener('resize', () => {
    resizeCanvas();
    requestRender();
  });

  // Spielmenü (Forschung & Streitkräfte) per Taste öffnen/schließen.
  window.addEventListener('keydown', (e) => {
    if (e.key !== MENU_KEY) return;
    if (phase !== 'play') return;
    e.preventDefault(); // sonst springt der Fokus (z. B. bei Tab)
    toggleWarMenu();
  });
}

// Liefert das existierende Hexfeld unter dem Mauszeiger (oder null).
function pickHex(e) {
  const rect = canvas.getBoundingClientRect();
  const w = screenToWorld(cam, e.clientX - rect.left, e.clientY - rect.top);
  const { q, r } = pixelToAxial(w.x, w.y);
  return getState().hexIndex.has(hexKey(q, r)) ? { q, r } : null;
}

function handleClick(e) {
  const hex = pickHex(e);
  if (!hex) return;
  const state = getState();
  const owner = state.owners.get(hexKey(hex.q, hex.r)) || null;

  if (phase === 'choose-country') {
    if (!owner) {
      toast('Das ist Ozean — wähle ein Land.');
      return;
    }
    setPlayerCountry(owner);
    phase = 'play';
    setSelected(null);
    const country = state.countries.get(owner);
    toast(`Du spielst jetzt: ${country.name}`);
    // Auf das gewählte Land zoomen.
    cam.zoom = Math.min(ZOOM_MAX, 4);
    centerOn(cam, country.centroid.x, country.centroid.y, canvas.width, canvas.height);
    renderPanel(state, phase);
    requestRender();
    return;
  }

  // phase === 'play': Feld auswählen.
  setSelected(hex);
  renderPanel(state, phase);
  requestRender();
}

function handleBuild(buildingId) {
  const state = getState();
  if (!state.selected) return;
  const { q, r } = state.selected;
  const result = placeBuilding(q, r, buildingId);
  if (!result.ok) {
    toast(result.reason);
    return;
  }
  renderPanel(state, phase);
  requestRender();
}

// --- Spielmenü: Forschung & Einheitenbau ------------------------------------

function openMenu() {
  if (phase !== 'play') { toast('Erst ein Land wählen.'); return; }
  toggleWarMenu();
}

function handleResearch(unitId) {
  const result = research(unitId);
  const u = UNIT_BY_ID.get(unitId);
  toast(result.ok ? `Erforscht: ${u?.name}` : result.reason);
  renderWarMenu();
  renderPanel(getState(), phase); // HUD-Ressourcen aktualisieren
}

function handleBuildUnit(unitId) {
  const result = buildUnit(unitId);
  const u = UNIT_BY_ID.get(unitId);
  toast(result.ok ? `Gebaut: ${u?.name}` : result.reason);
  renderWarMenu();
  renderPanel(getState(), phase);
}

// --- Tick / Render ----------------------------------------------------------

function startTick() {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(() => {
    if (phase !== 'play') return;
    produceTick();
    renderPanel(getState(), phase);
    if (isWarMenuOpen()) renderWarMenu(); // Kosten-/Verfügbarkeitsstatus live
  }, TICK_INTERVAL_MS);
}

// Rendering bei Bedarf, auf einen Frame gebündelt (kein Dauer-Loop).
function requestRender() {
  if (needsRender) return;
  needsRender = true;
  requestAnimationFrame(() => {
    needsRender = false;
    render(ctx, canvas, cam, getState(), hovered);
  });
}

function resizeCanvas() {
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
}

function exitToMenu() {
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  if (isWarMenuOpen()) toggleWarMenu(); // Overlay schließen
  if (onExit) onExit();
}

function setLoading(text) {
  const elc = document.getElementById('game-loading');
  if (!elc) return;
  elc.textContent = text || '';
  elc.style.display = text ? 'flex' : 'none';
}
