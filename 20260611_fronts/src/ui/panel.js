// Spiel-UI — HUD (oben) und Seitenpanel (rechts). Baut sich datengetrieben aus
// den Ressourcen- und Gebäudelisten auf; keine Liste wird im HTML hardcodiert.
// Liest den Zustand und die Bauregeln (canBuild) und stellt sie dar.

import {
  RESOURCES, BUILDINGS, BUILDING_BY_ID, RESOURCE_BY_ID, LOCAL_RESOURCE_IDS,
} from '../data/buildings.js';
import {
  canBuildHere, ownerOf, buildingsAt, cityMulAt, fieldStockAt,
  countryPower, canBuildUnit, armyCount, isResearched, troopsAt, troopSource,
  currentBuildSite, aircraftAt,
} from '../core/state.js';
import { BLOCS } from '../data/alignment.js';
import { unitsForBloc, UNIT_BY_ID } from '../data/military.js';
import { WEAPONS, PLANE_HARDPOINTS } from '../data/airpower.js';
import { MENU_KEY, TICK_INTERVAL_MS } from '../config/constants.js';
import { el, costStr, outputStr, viewSwitchHtml, warLogHtml } from './uikit.js';
import { logisticsHtml, wireLogistics } from './logistics.js';

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
  // Markup kommt aus dem gemeinsamen Baustein (uikit), der Inhalt wird bei jedem
  // Rendern aus state.viewMode neu gesetzt — dieselbe Sicht-Auswahl steht auch im
  // Spielmenü, ohne dass zwei Stellen den aktiven Knopf mitführen.
  const viewSwitch = el('div', 'view-switch');
  viewSwitch.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-view]');
    if (btn) handlers.onSetView(btn.dataset.view);
  });

  // --- Hinweis-/Statuszeile ---
  const toast = el('div', 'toast');

  root.append(hud, side, viewSwitch, toast);
  refs = { modeLabel, resValues, side, title, body, buildList, buildButtons, viewSwitch, toast };
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
  // Aktive Kartensicht kommt aus dem Zustand (SSOT) — auch wenn sie im Spielmenü
  // umgeschaltet wurde.
  refs.viewSwitch.innerHTML = viewSwitchHtml(state.viewMode);

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
  // Flugzeuge am Flugplatz: Loadout je Hardpoint bestücken.
  if (sel && owner === state.playerCountry) html += aircraftLoadoutHtml(sel);
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
    : site.type === 'airbase'
      ? `🛫 ${site.label} — Flugzeuge bauen <span class="dim">(nur Flugzeuge)</span>`
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

// Loadout-Editor: jede Flugzeug-Instanz am Feld mit ihren Hardpoint-Slots. Pro
// Slot ein Dropdown der Waffen (AA/Anti-Radar/ATGM/GBU). Leer = unbestückt.
function aircraftLoadoutHtml(sel) {
  const planes = aircraftAt(sel.q, sel.r);
  if (!planes.length) return '';
  const rows = planes.map((p) => {
    const u = UNIT_BY_ID.get(p.unitId);
    const slots = p.loadout.map((wid, i) => {
      const opts = ['<option value="">— leer —</option>']
        .concat(WEAPONS.map((w) => `<option value="${w.id}"${wid === w.id ? ' selected' : ''}>${w.icon} ${w.label}</option>`))
        .join('');
      return `<select class="loadout-sel" data-uid="${p.uid}" data-slot="${i}">${opts}</select>`;
    }).join('');
    return `<div class="plane-row">
      <div class="plane-name">${u?.icon ?? '✈️'} ${u?.name ?? p.unitId} <span class="dim">#${p.uid}</span></div>
      <div class="loadout-slots">${slots}</div></div>`;
  }).join('');
  return `<div class="loadout-box"><h3 class="side-sub">✈️ Flugzeuge & Loadout (${planes.length})</h3>
    <p class="dim">${PLANE_HARDPOINTS} Hardpoints je Flugzeug — wähle, womit es schießt.</p>${rows}</div>`;
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
  refs.body.querySelectorAll('select.loadout-sel').forEach((s) => {
    s.addEventListener('change', () => handlers.onSetLoadout(
      Number(s.dataset.uid), Number(s.dataset.slot), s.value || null,
    ));
  });
  wireLogistics(refs.body, handlers);
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

// Aktiviert/deaktiviert die Bauknöpfe anhand der Bauregeln (canBuild ist SSOT)
// und zeigt den erwarteten Ertrag pro Tick (bzw. den Grund bei Sperre).
function setBuildButtonsEnabled(isOwn, sel, country) {
  // Stadtnähe-Bonus des konkret gewählten Feldes in die Vorschau einrechnen.
  const cityMul = sel ? cityMulAt(sel.q, sel.r) : 1;
  for (const id in refs.buildButtons) {
    const btn = refs.buildButtons[id];
    // Pro Gebäude prüfen (Forschungspflicht z. B. bei Flugabwehr ist gebäudespezifisch).
    const check = isOwn && sel ? canBuildHere(sel.q, sel.r, id) : { ok: false, reason: 'Erst eigenes Feld wählen.' };
    btn.disabled = !check.ok;
    const b = BUILDING_BY_ID.get(id);
    btn.querySelector('small').textContent = check.ok ? outputStr(b, country, cityMul) : check.reason;
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
