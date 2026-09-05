// Spielmenü-Overlay („Kommandozentrale“) — der zentrale Hub, in dem ALLES
// Spielbezogene erreichbar ist. Wird mit MENU_KEY oder dem HUD-Knopf geöffnet.
//
// Reiter (datengetrieben aus TABS — kein Reiter ist im Markup hardcodiert):
//   📊 Übersicht      Land, Wirtschaft, Streitkräfte, Weltgeschehen auf einen Blick
//   🏗️ Bau            Gebäudekatalog + Bauen auf dem gewählten Feld
//   🔬 Forschung      Einheiten & Strukturen erforschen
//   🪖 Streitkräfte   eigener Bestand je Einheit
//   🚂 Logistik       Schiene legen, Züge einrichten/verwalten
//   🏙 Städte         eigene Städte anspringen (Bau-Standorte für Truppen)
//   ⚙️ Einstellungen  Kartensicht + Sound
//
// Das Menü LIEST nur; jede Mutation läuft über die übergebenen Handler. Keine
// Einheit, kein Gebäude, kein Regler wird hier hardcodiert — alles kommt aus
// den Datenmodulen (military.js, buildings.js, constants.js).

import { UNIT_CATEGORIES, unitsForBloc } from '../data/military.js';
import { BLOCS } from '../data/alignment.js';
import {
  BUILDINGS, RESOURCE_BY_ID, STRUCTURE_TECH, AA_BUILDINGS,
} from '../data/buildings.js';
import {
  isResearched, canResearch, armyCount, countryPower, canBuildHere, ownerOf,
  playerCountryData, getState, globalIncomePerTick, playerBuildingStats,
  playerAircraftCount, buildingsAt, troopsAt, cityMulAt,
} from '../core/state.js';
import { MENU_KEY, TICK_INTERVAL_MS } from '../config/constants.js';
import { el, costStr, outputStr, viewSwitchHtml, warLogHtml } from './uikit.js';
import { logisticsHtml, wireLogistics } from './logistics.js';
import { settingsListHtml, wireSettings } from './settingspanel.js';

let refs = null;
let handlers = null;
let open = false;
let activeTab = 'overview';

// Reiter des Hubs: id, Beschriftung und die Funktion, die den Inhalt baut.
// Eine Quelle für Reihenfolge, Namen und Inhalt der Reiter.
const TABS = [
  { id: 'overview', label: '📊 Übersicht', render: overviewTab },
  { id: 'build', label: '🏗️ Bau', render: buildTab },
  { id: 'research', label: '🔬 Forschung', render: researchTab },
  { id: 'forces', label: '🪖 Streitkräfte', render: forcesTab },
  { id: 'logistics', label: '🚂 Logistik', render: logisticsTab },
  { id: 'cities', label: '🏙 Städte', render: citiesTab },
  { id: 'settings', label: '⚙️ Einstellungen', render: settingsTab },
];

/**
 * Baut das Overlay einmalig auf.
 * @param {{ onResearch:(id:string)=>void, onBuildBuilding:(id:string)=>void,
 *          onToggleRail:()=>void, onCreateTrain:()=>void, onCancelTrain:(id:number)=>void,
 *          onSetView:(id:string)=>void, onFocusHex:(q:number,r:number)=>void }} h
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

/** Schließt das Menü (z. B. wenn eine Aktion Klicks auf der Karte braucht). */
export function closeWarMenu() {
  setOpen(false);
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
  const tab = TABS.find((t) => t.id === activeTab) || TABS[0];
  refs.content.innerHTML = tab.render(country);

  wireContent();
}

// --- Reiter: Übersicht ------------------------------------------------------
// Alles Wissenswerte über das eigene Land auf einen Blick: Land, Wirtschaft,
// Streitkräfte, Forschungsfortschritt, Logistik und die letzten Weltereignisse.
function overviewTab(country) {
  const state = getState();
  const income = globalIncomePerTick();
  const build = playerBuildingStats();
  const units = unitsForBloc(country.bloc);
  const troops = units.reduce((sum, u) => sum + armyCount(u.id), 0);
  const techTotal = units.length + STRUCTURE_TECH.length;
  const techDone = [...units, ...STRUCTURE_TECH].filter((t) => isResearched(t.id)).length;
  const secs = Math.round(TICK_INTERVAL_MS / 1000);

  const incomeStr = Object.keys(income)
    .map((id) => `${RESOURCE_BY_ID.get(id)?.icon ?? id} +${income[id].toFixed(1)}`)
    .join('  ');

  const cards = [
    stat('🗺️', 'Hexfelder', country.hexCount, country.continent),
    stat('🏙', 'Städte', country.cities?.length ?? 0,
      country.capital ? `Hauptstadt ${country.capital.name}` : 'keine Hauptstadt'),
    stat('🏗️', 'Gebäude', build.done, build.building ? `${build.building} im Bau` : 'nichts im Bau'),
    stat('📈', `Einnahmen / ${secs}s`, incomeStr || '—', `Wirtschaftskraft ×${(country.factoryMul ?? 1).toFixed(1)}`),
    stat('⚔', 'Angriff', Math.round(countryPower(state.playerCountry, 'atk')), `${troops} Einheiten`),
    stat('🛡', 'Verteidigung', Math.round(countryPower(state.playerCountry, 'def')),
      `✈️ ${playerAircraftCount()} Flugzeuge`),
    stat('🔬', 'Forschung', `${techDone}/${techTotal}`, 'Technologien erforscht'),
    stat('🚂', 'Logistik', state.trains.length, `${state.rails.size} Felder Gleis`),
  ].join('');

  return `<p class="dim">Überblick über dein Land. Details und Aktionen findest du in den anderen Reitern.</p>
    <div class="stat-grid">${cards}</div>
    ${countrySection(country)}
    ${warLogHtml(state)}`;
}

// Kennzahlen-Kachel der Übersicht.
function stat(icon, label, value, hint) {
  return `<div class="stat-card">
    <div class="stat-label">${icon} ${label}</div>
    <div class="stat-value">${value}</div>
    <div class="stat-hint">${hint ?? ''}</div>
  </div>`;
}

// Ergänzende Landesdaten, die keine eigene Kachel brauchen.
function countrySection(country) {
  const bloc = BLOCS[country.bloc];
  const gdp = country.gdp ? `${Math.round(country.gdp / 1000).toLocaleString('de-DE')} Mrd. USD` : 'unbekannt';
  return `<section class="war-cat">
    <h3 class="war-cat-title">🌍 Land</h3>
    <div class="war-rows">
      ${infoRow('Bündnis', `<b style="color:${bloc.color}">${bloc.label}</b> (${bloc.short})`)}
      ${infoRow('Kontinent', country.continent ?? '—')}
      ${infoRow('Wirtschaftsleistung', gdp)}
      ${infoRow('Kleinland-Bonus', `×${(country.outputMul ?? 1).toFixed(1)} auf jedes Gebäude`)}
      ${infoRow('Wirtschaftskraft', `×${(country.factoryMul ?? 1).toFixed(1)} auf Fabriken`)}
    </div>
  </section>`;
}

function infoRow(label, value) {
  return `<div class="war-row"><div class="war-row-main"><span class="war-name">${label}</span></div>
    <div class="war-row-side"><span class="war-stats">${value}</span></div></div>`;
}

// --- Reiter: Bau ------------------------------------------------------------
// Gebäudekatalog mit Ertrag pro Tick. Gebaut wird auf dem aktuell GEWÄHLTEN Feld
// (Karte anklicken) — die Bauregeln kommen aus canBuildHere (SSOT).
function buildTab(country) {
  const sel = getState().selected;
  const built = playerBuildingStats().byId;
  const cityMul = sel ? cityMulAt(sel.q, sel.r) : 1;
  const head = sel
    ? `<p class="dim">Bauplatz: Feld <b>(${sel.q}, ${sel.r})</b> — Ertrag unten gilt für dieses Feld.</p>`
    : '<p class="dim">Kein Feld gewählt. Schließe das Menü, klicke ein eigenes Hexfeld an und öffne den Reiter erneut.</p>';

  const rows = BUILDINGS.map((b) => {
    const check = sel ? canBuildHere(sel.q, sel.r, b.id) : { ok: false, reason: 'Erst ein eigenes Feld wählen.' };
    const have = built.get(b.id) || 0;
    const haveBadge = have > 0 ? `<span class="war-count">×${have}</span>` : '';
    const range = AA_BUILDINGS.get(b.id)?.range;
    const extra = range ? ` · Reichweite ${range} Felder` : '';
    const reason = check.ok ? '' : `<small class="war-reason">${check.reason}</small>`;
    return `<div class="war-row">
      <div class="war-row-main">
        <span class="war-name">${b.icon} ${b.label} ${haveBadge}</span>
        <span class="war-stats">${outputStr(b, country, cityMul)}${extra}</span>
      </div>
      <div class="war-row-side">
        <button class="war-act" data-act="build" data-id="${b.id}" ${check.ok ? '' : 'disabled'}>Bauen</button>
      </div>
      ${reason}</div>`;
  }).join('');

  return `${head}<section class="war-cat">
    <h3 class="war-cat-title">🏗️ Gebäude</h3>
    <div class="war-rows">${rows}</div>
  </section>`;
}

// --- Reiter: Forschung ------------------------------------------------------
// Einheiten nach Kategorie gruppiert, je mit Kosten und Status.
function researchTab(country) {
  const units = unitsForBloc(country.bloc);
  let html = '<p class="dim">Erforsche Fahrzeuge gegen Geld. Höhere Stufen setzen die vorige voraus.</p>';
  for (const cat of UNIT_CATEGORIES) {
    const list = units.filter((u) => u.category === cat.id);
    html += categorySection(cat, list.map((u) => researchRow(u)).join(''));
  }
  // Strukturen (Flugabwehr) — erforschbar wie Einheiten, danach auf jedem Feld baubar.
  html += categorySection(
    { icon: '🛡️', label: 'Flugabwehr (Strukturen)' },
    STRUCTURE_TECH.map((t) => structureRow(t)).join(''),
  );
  return html;
}

// Forschungszeile für eine Struktur (Flugabwehr). Kein ⚔/🛡, aber Reichweite.
function structureRow(t) {
  const done = isResearched(t.id);
  const check = canResearch(t.id);
  const status = done
    ? '<span class="war-done">✓ Erforscht</span>'
    : `<button class="war-act" data-act="research" data-id="${t.id}" ${check.ok ? '' : 'disabled'}>Erforschen</button>`;
  const reason = !done && !check.ok ? `<small class="war-reason">${check.reason}</small>` : '';
  const range = AA_BUILDINGS.get(t.id)?.range;
  return `<div class="war-row">
    <div class="war-row-main">
      <span class="war-name">${t.icon} ${t.label}</span>
      <span class="war-stats">${range ? `Reichweite ${range} Felder` : ''}</span>
    </div>
    <div class="war-row-side">
      <span class="war-cost">${costStr(t.researchCost)}</span>
      ${status}
    </div>
    ${reason}</div>`;
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

// --- Reiter: Streitkräfte ---------------------------------------------------
// Übersicht der eigenen Armee. Gebaut werden Truppen NUR in den Städten (Stadt
// auf der Karte anklicken → Seitenpanel), nicht hier.
function forcesTab(country) {
  const units = unitsForBloc(country.bloc);
  const state = getState();
  const atk = Math.round(countryPower(state.playerCountry, 'atk'));
  const def = Math.round(countryPower(state.playerCountry, 'def'));
  let html = `<p class="dim">Truppen baust du in deinen <b>Städten</b> (alle Einheiten), an einem
    <b>Militäraußenposten</b> (nur Infanterie) oder am <b>Flugfeld</b> (nur Flugzeuge) — im Reiter
    „Städte“ hinspringen oder auf der Karte anklicken. Hier siehst du deine gesamten Streitkräfte.</p>
    <p class="army-sum">Gesamt: ⚔ <b>${atk}</b> · 🛡 <b>${def}</b> · ✈️ <b>${playerAircraftCount()}</b></p>`;
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

// --- Reiter: Logistik -------------------------------------------------------
// Gemeinsamer Baustein mit dem Seitenpanel (logistics.js) — ein Stand, zwei Orte.
function logisticsTab() {
  return `<p class="dim">Metall und Zahnräder liegen im Lager des jeweiligen Feldes und lassen sich
    nur per Bahn bewegen: Gleis auf eigenem Gebiet legen, dann einen Zug zwischen zwei bebauten
    Feldern einrichten. Beide Aktionen brauchen Klicks auf der Karte — das Menü schließt dafür.</p>
    ${logisticsHtml(getState(), { heading: false })}`;
}

// --- Reiter: Städte ---------------------------------------------------------
// Eigene Städte als Sprungziele: Truppenbau läuft über Städte, daher gehören sie
// in den Hub. Der Knopf zentriert die Karte auf die Stadt und wählt sie aus.
function citiesTab(country) {
  const cities = country.cities || [];
  if (!cities.length) {
    return '<p class="dim">Dein Land hat keine erfasste Stadt. Truppen baust du dann an einem Militäraußenposten (nur Infanterie).</p>';
  }
  const playerKey = getState().playerCountry;
  const rows = cities.map((c) => {
    const troops = troopsAt(c.q, c.r);
    const builds = buildingsAt(c.q, c.r).length;
    const pop = c.pop ? `${Math.round(c.pop / 1000).toLocaleString('de-DE')} Tsd. Ew.` : '';
    // Küstenstädte können auf einem Feld liegen, das beim Rastern Ozean wurde —
    // dort lässt sich nicht bauen. Ehrlich anzeigen statt still ins Leere führen.
    const onOwnField = ownerOf(c.q, c.r) === playerKey;
    const hint = onOwnField ? '' : '<small class="war-reason">Stadtfeld liegt nicht auf deinem Gebiet (Küstenraster) — hier lassen sich keine Truppen bauen.</small>';
    return `<div class="war-row">
      <div class="war-row-main">
        <span class="war-name">${c.capital ? '★' : '•'} ${c.name}</span>
        <span class="war-stats">${pop} · 🏗️ ${builds} · 🪖 ${troops}</span>
      </div>
      <div class="war-row-side">
        <button class="war-act" data-act="focus" data-q="${c.q}" data-r="${c.r}">Hinspringen</button>
      </div>
      ${hint}
    </div>`;
  }).join('');
  return `<p class="dim">Städte sind deine Bau-Standorte für Truppen (★ = Hauptstadt). „Hinspringen“
    zentriert die Karte auf die Stadt und wählt ihr Feld aus — liegt es auf deinem Gebiet, erscheint
    der Truppenbau im Seitenpanel.</p>
    <section class="war-cat"><h3 class="war-cat-title">🏙 Deine Städte (${cities.length})</h3>
      <div class="war-rows">${rows}</div></section>`;
}

// --- Reiter: Einstellungen --------------------------------------------------
// Kartensicht (aus VIEW_MODES) + Sound-Regler (gemeinsamer Baustein mit dem
// Einstellungs-Overlay des Hauptmenüs).
function settingsTab() {
  return `<section class="war-cat">
      <h3 class="war-cat-title">🗺️ Kartensicht</h3>
      <div class="view-switch view-switch-inline">${viewSwitchHtml(getState().viewMode)}</div>
    </section>
    <section class="war-cat">
      <h3 class="war-cat-title">🔊 Ton</h3>
      ${settingsListHtml()}
    </section>`;
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

// Verdrahtet alle Bedienelemente des aktuellen Reiters neu (innerHTML ersetzt
// bei jedem Rendern die alten). Es wird nur verdrahtet, was der Reiter erzeugt
// hat — die Abfragen laufen ins Leere, wenn ein Element nicht vorkommt.
function wireContent() {
  // Forschen / Gebäude bauen.
  refs.content.querySelectorAll('button.war-act').forEach((btn) => {
    if (btn.disabled) return;
    const { act, id, q, r } = btn.dataset;
    btn.addEventListener('click', () => {
      if (act === 'research') handlers.onResearch(id);
      else if (act === 'build') handlers.onBuildBuilding(id);
      else if (act === 'focus') { setOpen(false); handlers.onFocusHex(Number(q), Number(r)); }
    });
  });
  // Logistik: beide Aktionen brauchen anschließend Klicks auf der Karte.
  wireLogistics(refs.content, {
    onToggleRail: () => { setOpen(false); handlers.onToggleRail(); },
    onCreateTrain: () => { setOpen(false); handlers.onCreateTrain(); },
    onCancelTrain: (id) => handlers.onCancelTrain(id),
  });
  // Kartensicht umschalten (aktiver Knopf kommt beim Neuzeichnen aus dem Zustand).
  refs.content.querySelectorAll('button[data-view]').forEach((b) => {
    b.addEventListener('click', () => { handlers.onSetView(b.dataset.view); renderWarMenu(); });
  });
  // Sound-Regler.
  wireSettings(refs.content, renderWarMenu);
}

function resourceSummary() {
  // Liest dieselben Werte wie das HUD; nur kompakt im Menükopf gespiegelt.
  const s = getState().resources;
  return Object.keys(s)
    .map((id) => `<span class="war-res-item">${RESOURCE_BY_ID.get(id)?.icon ?? ''} ${Math.floor(s[id])}</span>`)
    .join('');
}
