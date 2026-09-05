// Gemeinsame UI-Bausteine — Single Source of Truth für Bausteine, die MEHRERE
// Oberflächen brauchen (Seitenpanel und Spielmenü). Hier steht kein Zustand;
// alle Funktionen sind reine Leser/Formatierer.
//
// Enthält:
//   el()             DOM-Helfer (ein Element erzeugen)
//   costStr()        Kostenobjekt -> "💰120 ⚙️40"
//   outputStr()      Ertrag/Verbrauch eines Gebäudes pro Tick
//   viewSwitchHtml() Knöpfe der Kartensichten (aus VIEW_MODES)
//   warLogHtml()     jüngste Kriegsereignisse

import { RESOURCE_BY_ID } from '../data/buildings.js';
import { buildingOutput } from '../core/state.js';
import { VIEW_MODES } from '../config/constants.js';

// Jüngste Ereignisse, die in einer Liste gezeigt werden (eine Quelle für beide
// Oberflächen).
export const WAR_LOG_LIMIT = 6;

export function el(tag, className) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

// Kostenobjekt -> "💰120 ⚙️40". Eine Quelle für die Kostendarstellung.
export function costStr(cost) {
  return Object.keys(cost)
    .map((id) => `${RESOURCE_BY_ID.get(id)?.icon ?? id} ${cost[id]}`)
    .join(' ');
}

// Ertrag eines Gebäudes pro Tick (Verbrauch −, Erzeugung +) bzw. dessen Hinweis.
// cityMul = Stadtnähe-Bonus des betrachteten Feldes (wirkt auf Fabrik-Geld).
export function outputStr(building, country, cityMul = 1) {
  const outs = buildingOutput(building, country, cityMul);
  const consume = (building.consumes || [])
    .map((c) => `−${c.amount} ${RESOURCE_BY_ID.get(c.resource)?.icon ?? ''}`).join(' ');
  const produce = outs
    .map((o) => `+${Math.round(o.amount)} ${RESOURCE_BY_ID.get(o.resource)?.icon ?? ''}`).join(' ');
  const parts = [consume, produce].filter(Boolean);
  return parts.length ? parts.join('  ') : (building.note || '');
}

// Kartensicht-Umschalter als Markup (datengetrieben aus VIEW_MODES). Der aktive
// Knopf kommt aus dem Zustand — keine zweite Quelle für „welche Sicht ist an“.
// Klicks werden vom Aufrufer über [data-view] verdrahtet.
export function viewSwitchHtml(activeId) {
  return VIEW_MODES.map((v) => `<button class="view-btn${v.id === activeId ? ' active' : ''}"
      data-view="${v.id}"><span class="view-icon">${v.icon}</span><span>${v.label}</span></button>`).join('');
}

// Jüngste Kriegsereignisse (aus state.warLog).
export function warLogHtml(state) {
  if (!state.warLog || !state.warLog.length) return '';
  const items = state.warLog.slice(0, WAR_LOG_LIMIT)
    .map((e) => `<li class="${e.kind === 'annex' ? 'log-annex' : ''}">${e.message}</li>`).join('');
  return `<div class="war-log"><h3 class="side-sub">Weltgeschehen</h3><ul>${items}</ul></div>`;
}
