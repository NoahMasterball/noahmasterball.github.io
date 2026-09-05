// Einstellungs-Overlay im Hauptmenü. Folgt exakt dem Muster des Spielmenüs
// (warmenu.js): dunkles Overlay + Panel, Schließen per Knopf oder Randklick.
// Die Regler selbst kommen aus dem gemeinsamen Baustein settingspanel.js —
// dieselbe Liste zeigt auch der Einstellungs-Reiter im Spielmenü.

import { settingsListHtml, wireSettings } from './settingspanel.js';
import { el } from './uikit.js';

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

// Baut die Reglerliste neu auf (gemeinsamer Baustein).
function renderSettings() {
  refs.content.innerHTML = settingsListHtml();
  wireSettings(refs.content, renderSettings);
}
