// Spielmenü-Overlay — Hub mit zwei Untermenüs: „Forschung“ (Einheiten gegen Geld
// erforschen) und „Streitkräfte“ (erforschte Einheiten an einem Militäraußen-
// posten bauen). Wird mit einer Taste oder dem HUD-Knopf geöffnet.
//
// Liest den Zustand und die Militärdaten und stellt sie dar; Mutationen laufen
// über die übergebenen Handler (wie beim Gebäudebau). Keine Einheit oder Kosten
// werden hier hardcodiert — alles kommt aus military.js.

import { UNIT_CATEGORIES, unitsForBloc } from '../data/military.js';
import { BLOCS } from '../data/alignment.js';
import { RESOURCE_BY_ID } from '../data/buildings.js';
import {
  isResearched, canResearch, armyCount, countryPower,
  playerCountryData, getState,
} from '../core/state.js';
import { MENU_KEY } from '../config/constants.js';

let refs = null;
let handlers = null;
let open = false;
let activeTab = 'research'; // 'research' | 'forces'

const TABS = [
  { id: 'research', label: '🔬 Forschung' },
  { id: 'forces', label: '🪖 Streitkräfte' },
];

/**
 * Baut das Overlay einmalig auf.
 * @param {{ onResearch:(id:string)=>void, onBuild:(id:string)=>void }} h
 */
export function initWarMenu(h) {
  handlers = h;
  const host = document.getElementById('game-ui');

  const overlay = el('div', 'war-overlay');
  const panel = el('div', 'war-panel');

  const header = el('div', 'war-header');
  const titleWrap = el('div', 'war-title-wrap');
  const title = el('h2', 'war-title');
  title.textContent = 'Kommandozentrale';
  const sub = el('div', 'war-sub');
  titleWrap.append(title, sub);

  const res = el('div', 'war-res');
  const closeBtn = el('button', 'war-close');
  closeBtn.innerHTML = `Schließen (${MENU_KEY}) ✕`;
  closeBtn.addEventListener('click', () => setOpen(false));
  header.append(titleWrap, res, closeBtn);

  const tabBar = el('div', 'war-tabs');
  const tabButtons = {};
  for (const t of TABS) {
    const b = el('button', 'war-tab');
    b.textContent = t.label;
    b.addEventListener('click', () => { activeTab = t.id; renderWarMenu(); });
    tabButtons[t.id] = b;
    tabBar.appendChild(b);
  }

  const content = el('div', 'war-content');

  panel.append(header, tabBar, content);
  overlay.appendChild(panel);
  // Klick auf den dunklen Rand schließt; Klick im Panel nicht.
  overlay.addEventListener('click', (e) => { if (e.target === overlay) setOpen(false); });
  host.appendChild(overlay);

  refs = { overlay, sub, res, tabButtons, content };
}

export function isWarMenuOpen() {
  return open;
}

export function toggleWarMenu() {
  setOpen(!open);
}

function setOpen(value) {
  open = value;
  if (!refs) return;
  refs.overlay.classList.toggle('open', open);
  if (open) renderWarMenu();
}

/** Zeichnet den Menüinhalt aus dem aktuellen Zustand neu (nur wenn offen). */
export function renderWarMenu() {
  if (!refs || !open) return;
  const country = playerCountryData();
  const bloc = country && BLOCS[country.bloc];

  refs.sub.innerHTML = country
    ? `${country.name} · Bündnis <b style="color:${bloc.color}">${bloc.label}</b>`
    : '';
  refs.res.innerHTML = resourceSummary();

  for (const id in refs.tabButtons) refs.tabButtons[id].classList.toggle('active', id === activeTab);

  if (!country) { refs.content.innerHTML = '<p class="dim">Kein Land gewählt.</p>'; return; }
  refs.content.innerHTML = activeTab === 'research'
    ? researchTab(country.bloc)
    : forcesTab(country.bloc);

  wireRows();
}

// --- Inhalte ----------------------------------------------------------------

// Forschung: Einheiten nach Kategorie gruppiert, je mit Kosten und Status.
function researchTab(blocId) {
  const units = unitsForBloc(blocId);
  let html = '<p class="dim">Erforsche Fahrzeuge gegen Geld. Höhere Stufen setzen die vorige voraus.</p>';
  for (const cat of UNIT_CATEGORIES) {
    const list = units.filter((u) => u.category === cat.id);
    html += categorySection(cat, list.map((u) => researchRow(u)).join(''));
  }
  return html;
}

function researchRow(u) {
  const done = isResearched(u.id);
  const check = canResearch(u.id);
  const status = done
    ? '<span class="war-done">✓ Erforscht</span>'
    : `<button class="war-act" data-act="research" data-id="${u.id}" ${check.ok ? '' : 'disabled'}>Erforschen</button>`;
  const reason = !done && !check.ok ? `<small class="war-reason">${check.reason}</small>` : '';
  return unitRow(u, costStr(u.researchCost), status, reason);
}

// Streitkräfte: Übersicht der eigenen Armee. Gebaut werden Truppen NUR in den
// Städten (Stadt auf der Karte anklicken → Seitenpanel), nicht hier.
function forcesTab(blocId) {
  const units = unitsForBloc(blocId);
  const state = getState();
  const atk = Math.round(countryPower(state.playerCountry, 'atk'));
  const def = Math.round(countryPower(state.playerCountry, 'def'));
  let html = `<p class="dim">Truppen baust du in deinen <b>Städten</b> (alle Einheiten) oder an
    einem <b>Militäraußenposten</b> (nur Infanterie) — auf der Karte anklicken.
    Hier siehst du deine gesamten Streitkräfte.</p>
    <p class="army-sum">Gesamt: ⚔ <b>${atk}</b> · 🛡 <b>${def}</b></p>`;
  for (const cat of UNIT_CATEGORIES) {
    const list = units.filter((u) => u.category === cat.id);
    html += categorySection(cat, list.map((u) => forcesRow(u)).join(''));
  }
  return html;
}

function forcesRow(u) {
  const count = armyCount(u.id);
  const status = !isResearched(u.id)
    ? '<span class="war-reason">nicht erforscht</span>'
    : (count > 0 ? `<span class="war-count">×${count}</span>` : '<span class="dim">—</span>');
  return unitRow(u, costStr(u.buildCost), status, '');
}

// --- gemeinsame Bausteine ---------------------------------------------------

function categorySection(cat, rowsHtml) {
  return `<section class="war-cat">
    <h3 class="war-cat-title">${cat.icon} ${cat.label}</h3>
    <div class="war-rows">${rowsHtml}</div>
  </section>`;
}

function unitRow(u, cost, statusHtml, reasonHtml) {
  return `<div class="war-row">
    <div class="war-row-main">
      <span class="war-tier">T${u.tier}</span>
      <span class="war-name">${u.name}</span>
      <span class="war-stats">⚔ ${u.atk} · 🛡 ${u.def}</span>
    </div>
    <div class="war-row-side">
      <span class="war-cost">${cost}</span>
      ${statusHtml}
    </div>
    ${reasonHtml}
  </div>`;
}

// Knöpfe nach jedem Neuaufbau neu verdrahten (innerHTML ersetzt die alten).
function wireRows() {
  refs.content.querySelectorAll('button.war-act').forEach((btn) => {
    if (btn.disabled) return;
    const id = btn.dataset.id;
    const act = btn.dataset.act;
    btn.addEventListener('click', () => {
      if (act === 'research') handlers.onResearch(id);
      else handlers.onBuild(id);
    });
  });
}

// Kostenobjekt -> "💰120  ⚙️40". Eine Quelle für die Kostendarstellung.
function costStr(cost) {
  return Object.keys(cost)
    .map((id) => `${RESOURCE_BY_ID.get(id)?.icon ?? id} ${cost[id]}`)
    .join('  ');
}

function resourceSummary() {
  // Liest dieselben Werte wie das HUD; nur kompakt im Menükopf gespiegelt.
  const s = playerResources();
  return Object.keys(s)
    .map((id) => `<span class="war-res-item">${RESOURCE_BY_ID.get(id)?.icon ?? ''} ${Math.floor(s[id])}</span>`)
    .join('');
}

// Kleiner Lese-Helfer auf den Zustand (Ressourcen). Hält keine Kopie.
function playerResources() {
  return getState().resources;
}

function el(tag, className) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}
