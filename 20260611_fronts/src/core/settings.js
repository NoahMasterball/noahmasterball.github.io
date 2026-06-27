// Nutzereinstellungen — SSOT für persistierte Optionen (Sound, Lautstärke …).
// Genau ein Eigentümer der Werte: andere Module lesen über getSetting() und
// schreiben über setSetting(); sie halten keine eigenen Kopien.

import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY } from '../config/constants.js';

// Im Speicher gehaltene Einstellungen (lazy aus localStorage geladen).
let cache = null;

// Lädt die Einstellungen einmalig aus localStorage und füllt fehlende Felder
// aus den Defaults auf (Single Source of Truth für die Default-Werte).
function load() {
  if (cache) return cache;
  let stored = {};
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw) stored = JSON.parse(raw);
  } catch (err) {
    // Storage blockiert/defekt (z. B. privater Modus): mit Defaults weiterarbeiten.
    console.warn('Einstellungen konnten nicht gelesen werden:', err);
  }
  cache = { ...DEFAULT_SETTINGS, ...stored };
  return cache;
}

// Liefert eine einzelne Einstellung.
export function getSetting(key) {
  return load()[key];
}

// Setzt eine Einstellung und schreibt sie zurück nach localStorage.
export function setSetting(key, value) {
  const s = load();
  s[key] = value;
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(s));
  } catch (err) {
    // Schreiben fehlgeschlagen (Quota/blockiert): Wert bleibt für die Sitzung im
    // Cache, geht aber nicht verloren — bewusst nur geloggt.
    console.warn('Einstellungen konnten nicht gespeichert werden:', err);
  }
}
