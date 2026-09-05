// Logistik-Baustein (Schiene & Züge) — eine Quelle für Markup UND Verdrahtung.
// Wird sowohl vom Seitenpanel als auch vom Spielmenü verwendet; beide zeigen
// denselben Stand, weil beide aus dieser einen Stelle rendern.

import { BUILDING_BY_ID, RESOURCE_BY_ID, LOCAL_RESOURCE_IDS } from '../data/buildings.js';
import { buildingsAt, isRailMode } from '../core/state.js';

/**
 * Logistik-Box: Schiene-Lege-Modus umschalten + Züge einrichten/verwalten.
 * @param {object} state
 * @param {{ heading?: boolean }} opts  heading=false lässt die Überschrift weg
 *   (im Menü steht sie schon als Reiter-Titel).
 */
export function logisticsHtml(state, { heading = true } = {}) {
  const railActive = isRailMode();
  let html = `<div class="logi-box">
    ${heading ? '<h3 class="side-sub">🚂 Logistik</h3>' : ''}
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

/**
 * Verdrahtet die Logistik-Knöpfe innerhalb eines Containers (nach jedem
 * innerHTML-Neuaufbau erneut aufrufen).
 * @param {HTMLElement} root
 * @param {{ onToggleRail:()=>void, onCreateTrain:()=>void, onCancelTrain:(id:number)=>void }} handlers
 */
export function wireLogistics(root, handlers) {
  root.querySelectorAll('button.rail-btn').forEach((b) => {
    b.addEventListener('click', () => handlers.onToggleRail());
  });
  root.querySelectorAll('button.train-btn').forEach((b) => {
    b.addEventListener('click', () => handlers.onCreateTrain());
  });
  root.querySelectorAll('button.train-cancel').forEach((b) => {
    b.addEventListener('click', () => handlers.onCancelTrain(Number(b.dataset.id)));
  });
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
