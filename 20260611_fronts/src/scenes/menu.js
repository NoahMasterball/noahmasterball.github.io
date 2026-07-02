// Hauptmenü — zuerst Spieltyp-Auswahl (Strategie / MCF-Shooter), dann der
// jeweilige Unterbereich. Alles datengetrieben aus den Konstanten; keine Karte
// wird im HTML hardcodiert.

import { MODES } from '../config/constants.js';
import {
  GAME_TYPES, TEAM_SIZES, SHOOTER_MODES, DEFAULT_TEAM_SIZE, DEFAULT_SHOOTER_MODE,
  DEFAULT_PLAYER_NAME,
} from '../config/shooter.js';
import { showScene } from '../core/scenes.js';

/**
 * Initialisiert das Hauptmenü.
 * @param {{onStartStrategy:(modeId:string)=>void, onStartShooter:(cfg:object)=>void}} handlers
 */
export function initMenu({ onStartStrategy, onStartShooter }) {
  buildGameTypes();
  buildStrategyModes(onStartStrategy);
  buildShooterSetup(onStartShooter);

  const back = document.getElementById('menu-back');
  back.addEventListener('click', () => showStage('type'));

  showStage('type');
  showScene('menu');
}

// Welche Menü-Stufe sichtbar ist (Spieltyp | Strategie | Shooter).
function showStage(stage) {
  document.getElementById('gametype-grid').style.display = stage === 'type' ? 'flex' : 'none';
  document.getElementById('strategy-panel').style.display = stage === 'strategy' ? 'block' : 'none';
  document.getElementById('shooter-panel').style.display = stage === 'shooter' ? 'block' : 'none';
  document.getElementById('menu-back').style.display = stage === 'type' ? 'none' : 'inline-block';
  const sub = document.getElementById('menu-subtitle');
  sub.textContent = stage === 'type' ? 'Wähle deinen Spielmodus'
    : stage === 'strategy' ? '2D-Weltstrategie — wähle deine Ära'
    : 'MCF — richte dein Match ein';
}

// --- Spieltyp-Auswahl (oberste Ebene) ---------------------------------------
function buildGameTypes() {
  const grid = document.getElementById('gametype-grid');
  grid.innerHTML = '';
  for (const gt of GAME_TYPES) {
    const card = document.createElement('button');
    card.className = 'mode-card';
    card.dataset.mode = gt.id;
    card.dataset.sound = 'start';
    card.innerHTML = `
      <div class="mode-year">${gt.icon}</div>
      <div class="mode-label">${gt.label}</div>
      <div class="mode-sub">${gt.tag}<br>${gt.sub}</div>
    `;
    card.addEventListener('click', () => showStage(gt.id === 'shooter' ? 'shooter' : 'strategy'));
    grid.appendChild(card);
  }
}

// --- Strategie: bestehende Modus-Karten (Modern / WW2) ----------------------
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

// --- MCF-Shooter: Setup (Name, Teamgröße, Modus) ----------------------------
function buildShooterSetup(onStart) {
  const panel = document.getElementById('shooter-panel');
  panel.innerHTML = '';

  // Namensfeld.
  const nameRow = document.createElement('div');
  nameRow.className = 'sh-setup-row';
  nameRow.innerHTML = `<label class="sh-setup-label">Dein Name</label>`;
  const nameInput = document.createElement('input');
  nameInput.className = 'sh-setup-name';
  nameInput.type = 'text';
  nameInput.maxLength = 16;
  nameInput.value = DEFAULT_PLAYER_NAME;
  nameInput.placeholder = 'z. B. MCF';
  nameRow.appendChild(nameInput);
  panel.appendChild(nameRow);

  // Teamgröße + Modus als segmentierte Auswahl.
  const teamSel = segmented(TEAM_SIZES, DEFAULT_TEAM_SIZE, (o) => o.label);
  const modeSel = segmented(SHOOTER_MODES, DEFAULT_SHOOTER_MODE, (o) => o.label);
  panel.appendChild(labeledRow('Teamgröße', teamSel.el));
  panel.appendChild(labeledRow('Modus', modeSel.el));

  // Modus-Beschreibung (aktualisiert sich mit der Auswahl).
  const desc = document.createElement('p');
  desc.className = 'sh-setup-desc';
  const updateDesc = () => {
    const m = SHOOTER_MODES.find((x) => x.id === modeSel.get());
    desc.textContent = m ? m.sub : '';
  };
  updateDesc();
  modeSel.onChange = updateDesc;
  panel.appendChild(desc);

  // Start-Knopf.
  const start = document.createElement('button');
  start.className = 'sh-setup-start';
  start.dataset.sound = 'start';
  start.textContent = 'Match starten';
  start.addEventListener('click', () => {
    const teamSize = teamSel.get();
    const modeId = modeSel.get();
    const size = TEAM_SIZES.find((t) => t.id === teamSize);
    const mode = SHOOTER_MODES.find((m) => m.id === modeId);
    const name = (nameInput.value || '').trim() || DEFAULT_PLAYER_NAME;
    onStart({
      teamSize, perTeam: size.perTeam, modeId, isTeam: mode.team, playerName: name,
    });
  });
  panel.appendChild(start);
}

// Baut eine segmentierte Auswahl aus einer Optionsliste (datengetrieben).
function segmented(options, defaultId, labelOf) {
  const el = document.createElement('div');
  el.className = 'sh-seg';
  let selected = defaultId;
  const api = { el, get: () => selected, onChange: null };
  for (const opt of options) {
    const b = document.createElement('button');
    b.className = 'sh-seg-btn';
    b.textContent = labelOf(opt);
    b.classList.toggle('active', opt.id === selected);
    b.addEventListener('click', () => {
      selected = opt.id;
      [...el.children].forEach((c, i) => c.classList.toggle('active', options[i].id === selected));
      if (api.onChange) api.onChange();
    });
    el.appendChild(b);
  }
  return api;
}

function labeledRow(label, controlEl) {
  const row = document.createElement('div');
  row.className = 'sh-setup-row';
  const l = document.createElement('label');
  l.className = 'sh-setup-label';
  l.textContent = label;
  row.appendChild(l);
  row.appendChild(controlEl);
  return row;
}
