// Audio — SSOT für die Klangwiedergabe. Synthetisiert kurze UI-Töne per Web
// Audio API (keine Audiodateien). Respektiert die Nutzereinstellungen (an/aus,
// Lautstärke) aus settings.js. Andere Module rufen nur playSound(name).

import { SOUNDS, DEFAULT_SOUND } from '../config/constants.js';
import { getSetting } from './settings.js';

// Der AudioContext wird erst bei der ersten Nutzerinteraktion erzeugt — Browser
// blockieren Audio ohne vorausgehende Geste (Autoplay-Policy).
let ctx = null;

function audioCtx() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null; // Kein Web-Audio-Support: Klänge still überspringen.
  ctx = new AC();
  return ctx;
}

/**
 * Spielt einen benannten Klang aus SOUNDS ab (no-op, wenn Sound aus ist).
 * @param {string} name  Schlüssel in SOUNDS.
 */
export function playSound(name) {
  if (!getSetting('soundEnabled')) return;
  const def = SOUNDS[name] || SOUNDS[DEFAULT_SOUND];
  if (!def) return;
  const ac = audioCtx();
  if (!ac) return;
  // Nach erster Geste evtl. noch „suspended“ — fortsetzen.
  if (ac.state === 'suspended') ac.resume();

  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const gainNode = ac.createGain();
  const peak = Math.max(0.0001, getSetting('volume') * def.gain);

  osc.type = def.type;
  osc.frequency.value = def.freq;
  // Kurze Hüllkurve: sofort auf Spitze, dann exponentiell ausklingen.
  gainNode.gain.setValueAtTime(peak, now);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + def.dur);

  osc.connect(gainNode).connect(ac.destination);
  osc.start(now);
  osc.stop(now + def.dur);
}

/**
 * Verdrahtet einen globalen Klick-Klang für ALLE Buttons (eine Bindung, DRY).
 * Ein Button kann über sein data-sound-Attribut einen abweichenden Klang wählen;
 * ohne Attribut wird DEFAULT_SOUND gespielt. Deaktivierte Buttons feuern kein
 * Click-Event und bleiben daher stumm.
 */
export function initUiSounds() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    playSound(btn.dataset.sound || DEFAULT_SOUND);
  });
}
