// Einstellungs-Overlay im Hauptmenü. Folgt exakt dem Muster des Spielmenüs
// (warmenu.js): dunkles Overlay + Panel, Schließen per Knopf oder Randklick.
// Die Regler werden datengetrieben aus SETTINGS_SCHEMA gebaut — keine
// Steuerelemente im Markup hardcodiert. Werte kommen aus settings.js (SSOT).

import { SETTINGS_SCHEMA } from '../config/constants.js';
import { getSetting, setSetting } from '../core/settings.js';
import { playSound } from '../core/audio.js';

let refs = null;

/** Baut den Zahnrad-Knopf und das Overlay im Hauptmenü einmalig auf. */
export function initSettingsMenu() {
  const host = document.getElementById('scene-menu');

  // Öffner: Zahnrad-Knopf oben rechts im Menü.
  const openBtn = el('button', 'menu-settings-btn');
  openBtn.innerHTML = '⚙️ Einstellungen';
  openBtn.addEventListener('click', () => setOpen(true));

  // Overlay + Panel (gleiche Klassen wie das Spielmenü-Overlay → ein Stil).
  const overlay = el('div', 'war-overlay');
  const panel = el('div', 'war-panel');

  const header = el('div', 'war-header');
  const titleWrap = el('div', 'war-title-wrap');
  const title = el('h2', 'war-title');
  title.textContent = 'Einstellungen';
  titleWrap.append(title);
  const closeBtn = el('button', 'war-close');
  closeBtn.innerHTML = 'Schließen ✕';
  closeBtn.addEventListener('click', () => setOpen(false));
  header.append(titleWrap, closeBtn);

  const content = el('div', 'war-content');
  panel.append(header, content);
  overlay.appendChild(panel);
  // Klick auf den dunklen Rand schließt; Klick im Panel nicht.
  overlay.addEventListener('click', (e) => { if (e.target === overlay) setOpen(false); });

  host.append(openBtn, overlay);
  refs = { overlay, content };
  renderSettings();
}

function setOpen(value) {
  if (!refs) return;
  refs.overlay.classList.toggle('open', value);
  if (value) renderSettings();
}

// Baut die Reglerliste aus SETTINGS_SCHEMA neu auf.
function renderSettings() {
  refs.content.innerHTML = `<div class="settings-list">${SETTINGS_SCHEMA.map(rowHtml).join('')}</div>`;
  wire();
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

// Verdrahtet die dynamisch erzeugten Regler nach jedem Neuaufbau.
function wire() {
  // Umschalter: Wert kippen. Der globale UI-Klang (initUiSounds) erzeugt das
  // Klick-Feedback — hier daher KEIN zusätzlicher playSound (sonst doppelt).
  // Beim Ausschalten bleibt es korrekt still, weil der Wert vor dem globalen
  // Listener bereits auf „aus“ steht.
  refs.content.querySelectorAll('.settings-toggle').forEach((b) => {
    b.addEventListener('click', () => {
      setSetting(b.dataset.key, !getSetting(b.dataset.key));
      renderSettings();
    });
  });
  // Schieberegler: live übernehmen und Prozentanzeige aktualisieren.
  refs.content.querySelectorAll('.settings-range').forEach((r) => {
    r.addEventListener('input', () => {
      const v = Number(r.value);
      setSetting(r.dataset.key, v);
      const label = refs.content.querySelector(`.settings-val[data-for="${r.dataset.key}"]`);
      if (label) label.textContent = pct(v);
    });
    // Beim Loslassen einen Ton zur Vorschau der neuen Lautstärke abspielen.
    r.addEventListener('change', () => playSound('click'));
  });
}

// Anteil 0..1 als Prozenttext.
function pct(v) {
  return `${Math.round(v * 100)}%`;
}

function el(tag, className) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}
