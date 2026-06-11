// Spiel-UI — HUD (oben) und Seitenpanel (rechts). Baut sich datengetrieben aus
// den Ressourcen- und Gebäudelisten auf; keine Liste wird im HTML hardcodiert.
// Liest den Zustand und die Bauregeln (canBuild) und stellt sie dar.

import { RESOURCES, BUILDINGS, BUILDING_BY_ID, RESOURCE_BY_ID } from '../data/buildings.js';
import { canBuild, ownerOf, buildingAt, buildingOutput } from '../core/state.js';
import { BLOCS } from '../data/alignment.js';
import { MENU_KEY } from '../config/constants.js';

let refs = null;

/**
 * Baut die UI einmalig auf und verdrahtet die Knöpfe.
 * @param {{ onBuild:(id:string)=>void, onBack:()=>void, onOpenMenu:()=>void }} handlers
 */
export function initPanel(handlers) {
  const root = document.getElementById('game-ui');
  root.innerHTML = '';

  // --- HUD (oben) ---
  const hud = el('div', 'hud');
  const modeLabel = el('div', 'hud-mode');
  const resBar = el('div', 'hud-resources');
  const resValues = {};
  for (const r of RESOURCES) {
    const item = el('div', 'res-item');
    item.innerHTML = `<span class="res-icon">${r.icon}</span><span class="res-label">${r.label}</span>`;
    const val = el('span', 'res-value');
    val.textContent = '0';
    item.appendChild(val);
    resValues[r.id] = val;
    resBar.appendChild(item);
  }
  const menuBtn = el('button', 'btn-back');
  menuBtn.textContent = `☰ Menü (${MENU_KEY})`;
  menuBtn.addEventListener('click', handlers.onOpenMenu);
  const backBtn = el('button', 'btn-back');
  backBtn.textContent = '← Hauptmenü';
  backBtn.addEventListener('click', handlers.onBack);
  hud.append(modeLabel, resBar, menuBtn, backBtn);

  // --- Seitenpanel (rechts) ---
  const side = el('aside', 'side-panel');
  const title = el('h2', 'side-title');
  const body = el('div', 'side-body');
  const buildList = el('div', 'build-list');
  const buildButtons = {};
  for (const b of BUILDINGS) {
    const btn = el('button', 'build-btn');
    btn.innerHTML = `<span class="build-icon">${b.icon}</span><span>${b.label}</span><small></small>`;
    btn.addEventListener('click', () => handlers.onBuild(b.id));
    buildButtons[b.id] = btn;
    buildList.appendChild(btn);
  }
  side.append(title, body, buildList);

  // --- Hinweis-/Statuszeile ---
  const toast = el('div', 'toast');

  root.append(hud, side, toast);
  refs = { modeLabel, resValues, side, title, body, buildList, buildButtons, toast };
}

/**
 * Aktualisiert die gesamte UI aus dem Zustand.
 * @param {object} state
 * @param {'choose-country'|'play'} phase
 */
export function renderPanel(state, phase) {
  if (!refs) return;
  refs.modeLabel.textContent = `${state.mode.label} · ${state.mode.year}`;
  // Ressourcen können durch Multiplikatoren fraktional werden -> abgerundet zeigen.
  for (const id in refs.resValues) refs.resValues[id].textContent = Math.floor(state.resources[id] ?? 0);

  if (phase === 'choose-country') {
    refs.title.textContent = 'Land wählen';
    refs.body.innerHTML =
      '<p>Klicke auf ein Land, um es zu übernehmen. Danach kannst du seine Hexfelder bebauen.</p>';
    refs.buildList.style.display = 'none';
    return;
  }

  // phase === 'play'
  const country = state.countries.get(state.playerCountry);
  refs.title.textContent = country ? country.name : 'Dein Land';
  refs.buildList.style.display = 'flex';

  const sel = state.selected;
  if (!sel) {
    refs.body.innerHTML =
      `<p class="dim">Hexfelder: <b>${country?.hexCount ?? 0}</b> · Kontinent: ${country?.continent ?? '–'}</p>
       ${blocLine(country)}
       ${econLine(country)}
       <p>Wähle ein Hexfeld deines Landes aus, um zu bauen.</p>`;
    setBuildButtonsEnabled(false, null, country);
    return;
  }

  const owner = ownerOf(sel.q, sel.r);
  const existing = buildingAt(sel.q, sel.r);
  const ownerName = owner ? state.countries.get(owner)?.name : 'Ozean';
  const existingLabel = existing ? BUILDING_BY_ID.get(existing)?.label : '—';
  refs.body.innerHTML =
    `<p class="dim">Feld (${sel.q}, ${sel.r})</p>
     <p>Gebiet: <b>${ownerName}</b></p>
     <p>Gebäude: <b>${existingLabel}</b></p>
     ${econLine(country)}`;

  const isOwn = owner === state.playerCountry;
  setBuildButtonsEnabled(isOwn, sel, country);
}

// Zeigt die beiden Balancing-Multiplikatoren des Landes an.
function econLine(country) {
  if (!country) return '';
  return `<p class="dim">Wirtschaftskraft ×${(country.factoryMul ?? 1).toFixed(1)} ·
          Kleinland-Bonus ×${(country.outputMul ?? 1).toFixed(1)}</p>`;
}

// Zeigt den Militärblock des Landes (bestimmt die Fahrzeugpalette).
function blocLine(country) {
  const bloc = country && BLOCS[country.bloc];
  if (!bloc) return '';
  return `<p class="dim">Bündnis: <b style="color:${bloc.color}">${bloc.label}</b> (${bloc.short})</p>`;
}

// Formatiert den Ertrag eines Gebäudes (mehrere Ressourcen) bzw. dessen Hinweis.
function formatOutput(b, country) {
  const outs = buildingOutput(b, country);
  if (!outs.length) return b.note || '';
  return outs
    .map((o) => `+${Math.round(o.amount)} ${RESOURCE_BY_ID.get(o.resource)?.icon ?? ''}`)
    .join('  ');
}

// Aktiviert/deaktiviert die Bauknöpfe anhand der Bauregeln (canBuild ist SSOT)
// und zeigt den erwarteten Ertrag pro Tick (bzw. den Grund bei Sperre).
function setBuildButtonsEnabled(isOwn, sel, country) {
  const check = isOwn && sel ? canBuild(sel.q, sel.r) : { ok: false, reason: 'Erst eigenes Feld wählen.' };
  for (const id in refs.buildButtons) {
    const btn = refs.buildButtons[id];
    btn.disabled = !check.ok;
    const b = BUILDING_BY_ID.get(id);
    btn.querySelector('small').textContent = check.ok ? formatOutput(b, country) : check.reason;
  }
}

let toastTimer = null;
export function toast(message) {
  if (!refs) return;
  refs.toast.textContent = message;
  refs.toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  // Kein Date.now nötig; reine UI-Verzögerung.
  toastTimer = setTimeout(() => refs.toast.classList.remove('show'), 2200);
}

function el(tag, className) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}
