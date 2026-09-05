// Einstellungs-Baustein — eine Quelle für Markup UND Verdrahtung der Regler.
// Wird vom Einstellungs-Overlay des Hauptmenüs (settingsmenu.js) und vom
// Einstellungs-Reiter des Spielmenüs (warmenu.js) genutzt; die Werte selbst
// liegen in settings.js, die Regler-Beschreibung in SETTINGS_SCHEMA.

import { SETTINGS_SCHEMA } from '../config/constants.js';
import { getSetting, setSetting } from '../core/settings.js';
import { playSound } from '../core/audio.js';

/** Reglerliste als Markup (datengetrieben aus SETTINGS_SCHEMA). */
export function settingsListHtml() {
  return `<div class="settings-list">${SETTINGS_SCHEMA.map(rowHtml).join('')}</div>`;
}

/**
 * Verdrahtet die Regler innerhalb eines Containers.
 * @param {HTMLElement} root
 * @param {() => void} rerender  baut die Liste nach einem Umschalten neu auf
 */
export function wireSettings(root, rerender) {
  // Umschalter: Wert kippen. Der globale UI-Klang (initUiSounds) erzeugt das
  // Klick-Feedback — hier daher KEIN zusätzlicher playSound (sonst doppelt).
  // Beim Ausschalten bleibt es korrekt still, weil der Wert vor dem globalen
  // Listener bereits auf „aus“ steht.
  root.querySelectorAll('.settings-toggle').forEach((b) => {
    b.addEventListener('click', () => {
      setSetting(b.dataset.key, !getSetting(b.dataset.key));
      rerender();
    });
  });
  // Schieberegler: live übernehmen und Prozentanzeige aktualisieren.
  root.querySelectorAll('.settings-range').forEach((r) => {
    r.addEventListener('input', () => {
      const v = Number(r.value);
      setSetting(r.dataset.key, v);
      const label = root.querySelector(`.settings-val[data-for="${r.dataset.key}"]`);
      if (label) label.textContent = pct(v);
    });
    // Beim Loslassen einen Ton zur Vorschau der neuen Lautstärke abspielen.
    r.addEventListener('change', () => playSound('click'));
  });
}

function rowHtml(item) {
  const val = getSetting(item.key);
  let control = '';
  if (item.type === 'toggle') {
    control = `<button class="settings-toggle${val ? ' on' : ''}" data-key="${item.key}"
      role="switch" aria-checked="${val}">${val ? 'An' : 'Aus'}</button>`;
  } else if (item.type === 'range') {
    control = `<input class="settings-range" type="range" data-key="${item.key}"
        min="${item.min}" max="${item.max}" step="${item.step}" value="${val}">
      <span class="settings-val" data-for="${item.key}">${pct(val)}</span>`;
  }
  return `<div class="settings-row">
    <span class="settings-label">${item.label}</span>
    <div class="settings-control">${control}</div>
  </div>`;
}

// Anteil 0..1 als Prozenttext.
function pct(v) {
  return `${Math.round(v * 100)}%`;
}
