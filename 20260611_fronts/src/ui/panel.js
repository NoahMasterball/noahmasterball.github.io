// Spiel-UI — HUD (oben) und Seitenpanel (rechts). Baut sich datengetrieben aus
// den Ressourcen- und Gebäudelisten auf; keine Liste wird im HTML hardcodiert.
// Liest den Zustand und die Bauregeln (canBuild) und stellt sie dar.

import {
  RESOURCES, BUILDINGS, BUILDING_BY_ID, RESOURCE_BY_ID, LOCAL_RESOURCE_IDS,
} from '../data/buildings.js';
import {
  canBuild, ownerOf, buildingsAt, buildingOutput, cityMulAt, fieldStockAt, isRailMode,
  countryPower, canBuildUnit, armyCount, isResearched, troopsAt, troopSource,
  currentBuildSite,
} from '../core/state.js';
import { BLOCS } from '../data/alignment.js';
import { unitsForBloc, UNIT_BY_ID } from '../data/military.js';
import { MENU_KEY, VIEW_MODES, DEFAULT_VIEW_MODE, TICK_INTERVAL_MS } from '../config/constants.js';

let refs = null;
let handlers = null;

/**
 * Baut die UI einmalig auf und verdrahtet die Knöpfe.
 * @param {{ onBuild:(id:string)=>void, onBack:()=>void, onOpenMenu:()=>void,
 *          onSetView:(id:string)=>void }} handlers
 */
export function initPanel(h) {
  handlers = h;
  const root = document.getElementById('game-ui');
  root.innerHTML = '';

  // --- HUD (oben) ---
  const hud = el('div', 'hud');
  const modeLabel = el('div', 'hud-mode');
  const resBar = el('div', 'hud-resources');
  const resValues = {};
  // Nur GLOBALE Ressourcen (Geld/Nahrung) gehören ins HUD — Metall/Zahnräder sind
  // lokale Feld-Lager und werden im Feld-Detail gezeigt.
  for (const r of RESOURCES.filter((x) => x.scope === 'global')) {
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

  // --- Sicht-Umschalter (unten rechts) ---
  // Datengetrieben aus VIEW_MODES; der aktive Knopf wird hervorgehoben.
  const viewSwitch = el('div', 'view-switch');
  const viewButtons = {};
  for (const v of VIEW_MODES) {
    const btn = el('button', 'view-btn');
    btn.innerHTML = `<span class="view-icon">${v.icon}</span><span>${v.label}</span>`;
    btn.classList.toggle('active', v.id === DEFAULT_VIEW_MODE);
    btn.addEventListener('click', () => {
      for (const id in viewButtons) viewButtons[id].classList.toggle('active', id === v.id);
      handlers.onSetView(v.id);
    });
    viewButtons[v.id] = btn;
    viewSwitch.appendChild(btn);
  }

  // --- Hinweis-/Statuszeile ---
  const toast = el('div', 'toast');

  root.append(hud, side, viewSwitch, toast);
  refs = { modeLabel, resValues, side, title, body, buildList, buildButtons, viewButtons, toast };
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

  // phase === 'play' (oder 'defeated' — Spielerland erobert, nur Zuschauen)
  const country = state.countries.get(state.playerCountry);
  refs.title.textContent = country ? country.name : 'Dein Land';
  const defeated = phase === 'defeated' || !!country?.eliminated;
  refs.buildList.style.display = defeated ? 'none' : 'flex';

  const sel = state.selected;
  const owner = sel ? ownerOf(sel.q, sel.r) : null;

  let html = '';
  if (defeated) {
    html += '<p class="war-warn">Dein Land wurde erobert. Du kannst der Welt zusehen oder zurück ins Hauptmenü.</p>';
  }
  html += armySummary(state, country);

  if (!sel) {
    html += `<p class="dim">Hexfelder: <b>${country?.hexCount ?? 0}</b> · Kontinent: ${country?.continent ?? '–'}</p>
       ${blocLine(country)}
       ${econLine(country)}
       <p>Wähle ein eigenes Feld zum Bauen — oder eine deiner Städte (Stern/Punkt) für Truppen.</p>`;
  } else {
    const ownerName = owner ? state.countries.get(owner)?.name : 'Ozean';
    const isOwnField = owner === state.playerCountry;
    html += `<p class="dim">Feld (${sel.q}, ${sel.r})</p>
       <p>Gebiet: <b>${ownerName}</b></p>
       ${buildingsLine(sel)}
       ${isOwnField ? stockLine(sel) : ''}
       ${econLine(country)}
       ${cityLine(sel)}`;
  }

  // Truppenbau am aktuellen Bau-Standort (eigene Stadt oder Außenposten).
  const site = currentBuildSite();
  if (site.type) {
    html += troopBuildHtml(state, country, site);
  }
  // Truppen-/Feldaktionen am gewählten Feld (bewegen bzw. Eroberungshinweis).
  if (sel) html += fieldActionHtml(state, sel, owner);
  // Logistik: Schiene legen + Züge einrichten/verwalten.
  if (!defeated) html += logisticsHtml(state);
  html += warLogHtml(state);

  refs.body.innerHTML = html;
  wireDynamic();

  const isOwn = !defeated && owner === state.playerCountry;
  setBuildButtonsEnabled(isOwn, sel, country);
}

// Armee-Übersicht des Spielerlandes (Gesamt-Angriff/Verteidigung + Einheiten).
function armySummary(state, country) {
  if (!country) return '';
  const atk = Math.round(countryPower(state.playerCountry, 'atk'));
  const def = Math.round(countryPower(state.playerCountry, 'def'));
  let n = 0;
  for (const u of unitsForBloc(country.bloc)) n += armyCount(u.id);
  return `<p class="army-sum">Armee: ⚔ <b>${atk}</b> · 🛡 <b>${def}</b> <span class="dim">(${n} Einh.)</span></p>`;
}

// Truppenbau-Liste für den Bau-Standort (Stadt = alles, Außenposten = nur
// Infanterie). Zeigt erforschte Einheiten des Landesblocks.
function troopBuildHtml(state, country, site) {
  const researched = unitsForBloc(country.bloc).filter((u) => isResearched(u.id));
  let rows;
  if (!researched.length) {
    rows = `<p class="dim">Noch keine Einheit erforscht — Menü (${MENU_KEY}) → Forschung.</p>`;
  } else {
    rows = researched.map((u) => {
      const check = canBuildUnit(u.id);
      const cnt = armyCount(u.id);
      const badge = cnt > 0 ? `<span class="war-count">×${cnt}</span>` : '';
      const reason = check.ok ? '' : `<small class="war-reason">${check.reason}</small>`;
      return `<div class="troop-row">
        <span class="troop-name">${u.icon} ${u.name} ${badge}</span>
        <button class="unit-build" data-id="${u.id}" ${check.ok ? '' : 'disabled'}>${costStr(u.buildCost)}</button>
        ${reason}</div>`;
    }).join('');
  }
  const head = site.type === 'outpost'
    ? `🪖 ${site.label} — Truppen bauen <span class="dim">(nur Infanterie)</span>`
    : `🏙 ${site.label} — Truppen bauen`;
  return `<div class="troop-build"><h3 class="side-sub">${head}</h3>${rows}</div>`;
}

// Feldaktionen: eigenes Feld mit Truppen -> Marschbefehl scharf machen; fremdes
// Feld -> Hinweis, dass man es mit Truppen Feld für Feld erobert. Eroberung läuft
// ausschließlich über produzierte Truppen, die hinmarschieren.
function fieldActionHtml(state, sel, owner) {
  if (troopSource()) {
    return `<div class="attack-box"><h3 class="side-sub">⚔ Marsch</h3>
      <p class="dim">Zielfeld auf der Karte anklicken (10 s pro Feld). Erneut das Quellfeld klicken bricht ab.</p></div>`;
  }
  if (owner === state.playerCountry) {
    const n = troopsAt(sel.q, sel.r);
    if (n <= 0) return '';
    return `<div class="attack-box"><h3 class="side-sub">⚔ Truppen (${n})</h3>
      <p class="dim">Schicke sie auf ein Nachbar-/Feindfeld; sie erobern Feld für Feld (10 s/Feld).</p>
      <button class="move-btn">Truppen bewegen ➤</button></div>`;
  }
  if (owner && owner !== state.playerCountry) {
    const def = Math.round(countryPower(owner, 'def'));
    return `<div class="attack-box"><h3 class="side-sub">⚔ Feindgebiet</h3>
      <p class="dim">${state.countries.get(owner)?.name ?? '—'} · Gesamtverteidigung 🛡 ${def}.
      Erobere es mit eigenen Truppen — Feld anklicken, das du angreifen willst.</p></div>`;
  }
  return '';
}

// Gebäudeliste eines Feldes (Stadtfelder tragen mehrere); im Bau mit Restzeit.
function buildingsLine(sel) {
  const entries = buildingsAt(sel.q, sel.r);
  if (!entries.length) return '<p>Gebäude: <b>—</b></p>';
  const items = entries.map((e) => {
    const b = BUILDING_BY_ID.get(e.id);
    const name = `${b?.icon ?? ''} ${b?.label ?? e.id}`;
    if (e.ticks > 0) {
      const secs = Math.ceil((e.ticks * TICK_INTERVAL_MS) / 1000);
      return `${name} <span class="dim">(im Bau, ${secs}s)</span>`;
    }
    return name;
  }).join('<br>');
  return `<p>Gebäude:<br><b>${items}</b></p>`;
}

// Lokales Material-Lager eines eigenen Feldes (Metall/Zahnräder, nur per Zug bewegbar).
function stockLine(sel) {
  const s = fieldStockAt(sel.q, sel.r);
  const parts = [...LOCAL_RESOURCE_IDS]
    .map((id) => `${RESOURCE_BY_ID.get(id)?.icon ?? id} ${Math.floor(s[id] ?? 0)}`);
  return `<p class="dim">Feld-Lager: ${parts.join(' · ')}</p>`;
}

// Logistik-Box: Schiene-Lege-Modus umschalten + Züge einrichten/verwalten.
function logisticsHtml(state) {
  const railActive = isRailMode();
  let html = `<div class="logi-box"><h3 class="side-sub">🚂 Logistik</h3>
    <button class="rail-btn${railActive ? ' active' : ''}">${railActive
    ? '🛤 Schiene legen: AN — Felder anklicken'
    : '🛤 Schiene legen'}</button>
    <button class="train-btn">🚂 Zug einrichten ➤</button>`;
  if (state.trains.length) {
    const rows = state.trains.map((t) => `<li class="train-row">
      <span>Zug ${t.id}: ${stationLabel(t.aKey)} → ${stationLabel(t.bKey)}
        <span class="dim">${loadSummary(t.load)}${t.idle ? ' · ⏸ wartet' : ''}</span></span>
      <button class="train-cancel" data-id="${t.id}">✕</button></li>`).join('');
    html += `<ul class="train-list">${rows}</ul>`;
  } else {
    html += '<p class="dim">Kein Zug. Lege Schiene zwischen zwei Gebäuden und richte dann einen Zug ein — Metall/Zahnräder fahren nur per Bahn.</p>';
  }
  return `${html}</div>`;
}

// Kurzbeschriftung eines Stationsfeldes (erstes Gebäude-Icon + Koordinaten).
function stationLabel(key) {
  const [q, r] = key.split(',').map(Number);
  const first = buildingsAt(q, r)[0];
  const icon = first ? (BUILDING_BY_ID.get(first.id)?.icon ?? '') : '';
  return `${icon}(${q},${r})`;
}

// Geladenes Material eines Zuges (nur Materialien > 0; sonst „leer“).
function loadSummary(load) {
  const parts = [...LOCAL_RESOURCE_IDS]
    .filter((id) => (load[id] || 0) > 0)
    .map((id) => `${RESOURCE_BY_ID.get(id)?.icon ?? id} ${load[id]}`);
  return parts.length ? parts.join(' ') : 'leer';
}

// Jüngste Kriegsereignisse (aus state.warLog).
function warLogHtml(state) {
  if (!state.warLog || !state.warLog.length) return '';
  const items = state.warLog.slice(0, 6)
    .map((e) => `<li class="${e.kind === 'annex' ? 'log-annex' : ''}">${e.message}</li>`).join('');
  return `<div class="war-log"><h3 class="side-sub">Weltgeschehen</h3><ul>${items}</ul></div>`;
}

// Kostenobjekt -> "💰120 ⚙️40". Eine Quelle für die Kostendarstellung im Panel.
function costStr(cost) {
  return Object.keys(cost)
    .map((id) => `${RESOURCE_BY_ID.get(id)?.icon ?? id} ${cost[id]}`).join(' ');
}

// Verdrahtet die dynamisch erzeugten Knöpfe (Truppenbau, Angriff) nach jedem
// innerHTML-Neuaufbau des Body.
function wireDynamic() {
  refs.body.querySelectorAll('button.unit-build').forEach((b) => {
    if (b.disabled) return;
    b.addEventListener('click', () => handlers.onBuildUnit(b.dataset.id));
  });
  refs.body.querySelectorAll('button.move-btn').forEach((b) => {
    b.addEventListener('click', () => handlers.onMoveTroops());
  });
  refs.body.querySelectorAll('button.rail-btn').forEach((b) => {
    b.addEventListener('click', () => handlers.onToggleRail());
  });
  refs.body.querySelectorAll('button.train-btn').forEach((b) => {
    b.addEventListener('click', () => handlers.onCreateTrain());
  });
  refs.body.querySelectorAll('button.train-cancel').forEach((b) => {
    b.addEventListener('click', () => handlers.onCancelTrain(Number(b.dataset.id)));
  });
}

// Zeigt die beiden Balancing-Multiplikatoren des Landes an.
function econLine(country) {
  if (!country) return '';
  return `<p class="dim">Wirtschaftskraft ×${(country.factoryMul ?? 1).toFixed(1)} ·
          Kleinland-Bonus ×${(country.outputMul ?? 1).toFixed(1)}</p>`;
}

// Zeigt den Stadtnähe-Bonus des gewählten Feldes (wirkt auf Fabrik-Geld).
// Nur anzeigen, wenn es tatsächlich einen Bonus gibt (Feld nahe an einer Stadt).
function cityLine(sel) {
  const mul = cityMulAt(sel.q, sel.r);
  if (mul <= 1.001) return '';
  return `<p class="dim">Stadtnähe (Fabrik-Geld) ×${mul.toFixed(1)}</p>`;
}

// Zeigt den Militärblock des Landes (bestimmt die Fahrzeugpalette).
function blocLine(country) {
  const bloc = country && BLOCS[country.bloc];
  if (!bloc) return '';
  return `<p class="dim">Bündnis: <b style="color:${bloc.color}">${bloc.label}</b> (${bloc.short})</p>`;
}

// Formatiert den Ertrag eines Gebäudes (mehrere Ressourcen) bzw. dessen Hinweis.
// cityMul = Stadtnähe-Bonus des gewählten Feldes (wirkt auf Fabrik-Geld).
function formatOutput(b, country, cityMul) {
  const outs = buildingOutput(b, country, cityMul);
  const consume = (b.consumes || [])
    .map((c) => `−${c.amount} ${RESOURCE_BY_ID.get(c.resource)?.icon ?? ''}`).join(' ');
  const produce = outs
    .map((o) => `+${Math.round(o.amount)} ${RESOURCE_BY_ID.get(o.resource)?.icon ?? ''}`).join(' ');
  const parts = [consume, produce].filter(Boolean);
  if (!parts.length) return b.note || '';
  return parts.join('  ');
}

// Aktiviert/deaktiviert die Bauknöpfe anhand der Bauregeln (canBuild ist SSOT)
// und zeigt den erwarteten Ertrag pro Tick (bzw. den Grund bei Sperre).
function setBuildButtonsEnabled(isOwn, sel, country) {
  const check = isOwn && sel ? canBuild(sel.q, sel.r) : { ok: false, reason: 'Erst eigenes Feld wählen.' };
  // Stadtnähe-Bonus des konkret gewählten Feldes in die Vorschau einrechnen.
  const cityMul = sel ? cityMulAt(sel.q, sel.r) : 1;
  for (const id in refs.buildButtons) {
    const btn = refs.buildButtons[id];
    btn.disabled = !check.ok;
    const b = BUILDING_BY_ID.get(id);
    btn.querySelector('small').textContent = check.ok ? formatOutput(b, country, cityMul) : check.reason;
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
