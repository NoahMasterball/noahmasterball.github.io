import { SETTINGS_SCHEMA, SETTINGS_STORAGE_KEY } from '../../config/client.ts';

// NEW — player settings: shape and defaults come only from SETTINGS_SCHEMA (config/client.ts);
// values persist in localStorage.

type Schema = (typeof SETTINGS_SCHEMA)[number];
type SettingValue<S extends Schema> = S extends { kind: 'range' }
  ? number
  : S extends { kind: 'toggle' }
    ? boolean
    : S extends { kind: 'select'; options: readonly (infer O)[] }
      ? O
      : never;
export type Settings = { [S in Schema as S['key']]: SettingValue<S> };
export type SettingKey = keyof Settings;

/** Settings as a plain record, for code generated from the schema (menu, storage). */
export const settingValues = (settings: Settings): Record<string, number | boolean | string> =>
  settings as Record<string, number | boolean | string>;

export function defaultSettings(): Settings {
  return Object.fromEntries(SETTINGS_SCHEMA.map((s) => [s.key, s.default])) as Settings;
}

export function loadSettings(): Settings {
  const settings = defaultSettings();
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
  } catch (err) {
    console.warn('Settings storage unavailable; using defaults.', err);
  }
  if (!raw) return settings;
  try {
    const stored = JSON.parse(raw) as Record<string, unknown>;
    const values = settingValues(settings);
    for (const def of SETTINGS_SCHEMA) {
      const value = stored[def.key];
      if (def.kind === 'range' && typeof value === 'number' && Number.isFinite(value)) {
        values[def.key] = Math.min(def.max, Math.max(def.min, value));
      } else if (def.kind === 'toggle' && typeof value === 'boolean') {
        values[def.key] = value;
      } else if (def.kind === 'select' && typeof value === 'string' && (def.options as readonly string[]).includes(value)) {
        values[def.key] = value;
      }
    }
  } catch (err) {
    console.warn('Stored settings are corrupt; using defaults.', err);
  }
  return settings;
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (err) {
    console.warn('Could not persist settings.', err);
  }
}
