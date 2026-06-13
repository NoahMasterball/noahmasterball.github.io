// Spielszene — verdrahtet Laden, Rasterung, Eingabe, Rendering und Tick.
// Hält selbst keine Spieldaten (die liegen im state-Modul), nur die Sicht-
// und Eingabe-Hilfsgrößen (Kamera, Canvas, Hover).

import { showScene } from '../core/scenes.js';
import { generateGrid, pixelToAxial, hexKey } from '../core/hexgrid.js';
import { loadGeoJson, loadCities, rasterizeCountries } from '../core/geo.js';
import { applyEconomy } from '../core/economy.js';
import { computeAdjacency, assignCities, indexCountryHexes } from '../core/territory.js';
import { aiTick, seedArmies } from '../core/ai.js';
import {
  createCamera, screenToWorld, panByScreen, zoomAt, fitWorld, centerOn,
} from '../core/camera.js';
import { render, prepareMap, repaintCaptured } from '../core/renderer.js';
import {
  initState, getState, setPlayerCountry, setSelected, placeBuilding, produceTick,
  research, buildUnit, setViewMode, setSelectedCity, cityAt,
  moveTroops, setTroopSource, troopSource, troopsAt,
  isRailMode, setRailMode, toggleRailMode, toggleRailAt, hasRail, buildingsAt,
  createTrain, cancelTrain,
} from '../core/state.js';
import {
  ZOOM_STEP, ZOOM_MAX, TICK_INTERVAL_MS, MENU_KEY, WAVE_MIN_ZOOM, AI_TICK_MS,
} from '../config/constants.js';
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
let aiTimer = null; // Bot-KI-Takt (Wirtschaft + Kriege)
let rafId = null; // laufender Render-Loop (für Wellen-Animation)
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
  assignCities(cities, owners, countries);   // Städte ihren Ländern zuordnen
  indexCountryHexes(owners, countries);       // Hexfeld-Listen je Land (für KI)
  const adjacency = computeAdjacency(hexes, owners); // Länder-Nachbarschaft

  // 2) Zustand initialisieren und statische Karte vorberechnen.
  //    Die Welt wird erst NACH der Länderwahl bewaffnet (seedArmies in
  //    handleClick), damit das gewählte Spielerland ohne Truppen startet.
  initState({ mode, hexes, owners, countries, cities, adjacency });
  prepareMap(getState());

  // 3) UI + Eingabe + Tick.
  initPanel({
    onBuild: handleBuild, onBack: exitToMenu, onOpenMenu: openMenu, onSetView: handleSetView,
    onBuildUnit: handleBuildUnit, onMoveTroops: handleMoveTroops,
    onToggleRail: handleToggleRail, onCreateTrain: handleCreateTrain, onCancelTrain: handleCancelTrain,
  });
  initWarMenu({ onResearch: handleResearch, onBuild: handleBuildUnit });
  phase = 'choose-country';
  hovered = null;
  trainPick = null;
  setSelected(null);
  setSelectedCity(null);
  setPlayerCountry(null);
  attachInput();
  fitWorld(cam, canvas.width, canvas.height);
  startTick();
  startAiLoop();
  startRenderLoop();

  setLoading(null);
  renderPanel(getState(), phase);
  requestRender();
}

// Wechselt die Kartensicht (politisch | terrain) und zeichnet neu.
function handleSetView(viewId) {
  setViewMode(viewId);
  requestRender();
}

// --- Eingabe ----------------------------------------------------------------

let dragging = false;
let movedWhileDown = false;
let lastX = 0, lastY = 0;
let listenersAttached = false;
// Zug-Einrichtung: null = aus; { a:null } = Startfeld wird erwartet;
// { a:{q,r} } = Zielfeld wird erwartet. Reine UI-Hilfsgröße (keine Spieldaten).
let trainPick = null;

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
    // Welt jetzt bewaffnen — seedArmies überspringt das Spielerland, das damit
    // ohne Truppen startet (alle Bots sind hingegen gerüstet).
    seedArmies(state);
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

  // Schiene-Modus: Klicks legen/entfernen Gleis auf eigenen Feldern.
  if (isRailMode()) {
    const res = toggleRailAt(hex.q, hex.r);
    if (!res.ok) toast(res.reason);
    renderPanel(state, phase);
    requestRender();
    return;
  }

  // Zug-Einrichtung läuft? Dann sind die Klicks die Endpunkte A und B.
  if (trainPick) {
    handleTrainPickClick(hex);
    return;
  }

  // Marschbefehl scharf? Dann ist dieser Klick das Zielfeld.
  const src = troopSource();
  if (src) {
    setTroopSource(null);
    if (src.q === hex.q && src.r === hex.r) {
      toast('Marsch abgebrochen.');
    } else {
      const res = moveTroops(src.q, src.r, hex.q, hex.r);
      toast(res.ok ? `Truppen marschieren (${res.legs} Feld${res.legs > 1 ? 'er' : ''} · ${res.legs * 10}s).` : res.reason);
    }
    afterWorldChange();
    return;
  }

  // phase === 'play': Feld auswählen. Liegt auf dem Feld eine EIGENE Stadt,
  // wird sie als Bau-Stadt gewählt (Truppen entstehen nur in Städten).
  setSelected(hex);
  const city = cityAt(hex.q, hex.r);
  setSelectedCity(city && owner === state.playerCountry ? city : null);
  renderPanel(state, phase);
  requestRender();
}

// Macht das gewählte Feld zum Quellfeld eines Marschbefehls; der nächste Karten-
// klick bestimmt das Ziel.
function handleMoveTroops() {
  const sel = getState().selected;
  if (!sel || troopsAt(sel.q, sel.r) <= 0) { toast('Erst ein eigenes Feld mit Truppen wählen.'); return; }
  setTroopSource({ q: sel.q, r: sel.r });
  toast('Zielfeld anklicken — Truppen erobern Feld für Feld.');
  requestRender();
}

// --- Schiene & Züge ---------------------------------------------------------
// Schaltet den Schiene-Lege-Modus um (andere Modi werden dabei verworfen).
function handleToggleRail() {
  const on = toggleRailMode();
  if (on) { trainPick = null; setTroopSource(null); }
  toast(on ? 'Schiene-Modus an — Felder anklicken zum Legen/Entfernen.' : 'Schiene-Modus aus.');
  renderPanel(getState(), phase);
  requestRender();
}

// Startet die Zug-Einrichtung: der nächste Klick wählt das Startfeld, der
// übernächste das Zielfeld (beide brauchen Gleis + Gebäude).
function handleCreateTrain() {
  setRailMode(false);
  setTroopSource(null);
  trainPick = { a: null };
  toast('Startfeld des Zuges anklicken (Gleis + Gebäude).');
  renderPanel(getState(), phase);
  requestRender();
}

// Verarbeitet einen Klick während der Zug-Einrichtung (A, dann B → Zug erstellen).
function handleTrainPickClick(hex) {
  if (!hasRail(hex.q, hex.r) || !buildingsAt(hex.q, hex.r).length) {
    toast('Endpunkt braucht Gleis und ein Gebäude.');
    return;
  }
  if (!trainPick.a) {
    trainPick = { a: { q: hex.q, r: hex.r } };
    toast('Start gewählt — jetzt das Zielfeld anklicken.');
    renderPanel(getState(), phase);
    requestRender();
    return;
  }
  const a = trainPick.a;
  trainPick = null;
  const res = createTrain(a.q, a.r, hex.q, hex.r);
  toast(res.ok ? 'Zug eingerichtet — pendelt jetzt zwischen den Feldern.' : res.reason);
  renderPanel(getState(), phase);
  requestRender();
}

// Bestellt einen Zug ab (Ladung fällt ins aktuelle Feld).
function handleCancelTrain(id) {
  const res = cancelTrain(id);
  if (!res.ok) toast(res.reason);
  renderPanel(getState(), phase);
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
  requestRender();
}


// --- Bot-KI -----------------------------------------------------------------

function startAiLoop() {
  if (aiTimer) clearInterval(aiTimer);
  aiTimer = setInterval(() => {
    // Läuft auch nach einer Niederlage weiter, damit man der Welt zusehen kann.
    if (phase !== 'play' && phase !== 'defeated') return;
    aiTick(getState());
    afterWorldChange();
  }, AI_TICK_MS);
}

// Nach KI-Tick oder Spielerangriff: Karte bei Gebietsänderung neu zeichnen,
// Niederlage prüfen, UI aktualisieren.
function afterWorldChange() {
  const state = getState();
  if (state.mapDirty) {
    repaintCaptured(state);  // nur eroberte Felder umfärben (kein voller Neuaufbau)
    indexCountryHexes(state.owners, state.countries);   // Felder-Index auffrischen
    state.adjacency = computeAdjacency(state.hexes, state.owners); // Nachbarschaft auffrischen
    state.mapDirty = false;
  }
  if (state.playerDefeated && phase === 'play') {
    phase = 'defeated';
    toast('Dein Land wurde erobert! Du kannst zusehen oder zurück ins Menü.');
  }
  renderPanel(state, phase);
  if (isWarMenuOpen()) renderWarMenu();
  requestRender();
}

// --- Tick / Render ----------------------------------------------------------

function startTick() {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = setInterval(() => {
    if (phase !== 'play') return;
    produceTick();
    requestRender(); // Züge bewegen sich pro Tick — auch herausgezoomt neu zeichnen
    renderPanel(getState(), phase);
    if (isWarMenuOpen()) renderWarMenu(); // Kosten-/Verfügbarkeitsstatus live
  }, TICK_INTERVAL_MS);
}

// Fordert ein Neuzeichnen an. Der Dauer-Loop greift das Flag im nächsten Frame
// auf (für diskrete Änderungen wie Pan/Zoom/Auswahl).
function requestRender() {
  needsRender = true;
}

// Dauer-Render-Loop. Animiert die Küstenwellen nur bei genügend Zoom (sonst
// unsichtbar/teuer); ansonsten wird nur bei angefordertem Neuzeichnen gerendert,
// damit der Ruhezustand keine CPU verbraucht.
function startRenderLoop() {
  if (rafId) cancelAnimationFrame(rafId);
  const loop = (t) => {
    rafId = requestAnimationFrame(loop);
    // Dauerhaft animieren, wenn Wellen sichtbar sind ODER Truppen marschieren
    // (deren Position muss flüssig interpolieren).
    const animating = cam.zoom >= WAVE_MIN_ZOOM || getState().movements.length > 0;
    if (animating) {
      render(ctx, canvas, cam, getState(), hovered, t);
      needsRender = false;
    } else if (needsRender) {
      needsRender = false;
      render(ctx, canvas, cam, getState(), hovered, t);
    }
  };
  rafId = requestAnimationFrame(loop);
}

function resizeCanvas() {
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
}

function exitToMenu() {
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  if (aiTimer) { clearInterval(aiTimer); aiTimer = null; }
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; } // Render-Loop stoppen
  if (isWarMenuOpen()) toggleWarMenu(); // Overlay schließen
  if (onExit) onExit();
}

function setLoading(text) {
  const elc = document.getElementById('game-loading');
  if (!elc) return;
  elc.textContent = text || '';
  elc.style.display = text ? 'flex' : 'none';
}
