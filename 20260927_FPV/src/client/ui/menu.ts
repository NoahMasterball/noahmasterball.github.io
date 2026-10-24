import { APP, BINDINGS, LAUNCH, MODE_TEXT, SETTINGS_SCHEMA, SYSTEM_KEYS, type SettingDef } from '../../config/client.ts';
import { MODE_IDS } from '../../sim/modes/index.ts';
import type { ModeId } from '../../sim/modes/mode.ts';
import { el } from '../dom.ts';
import { levelsForMode } from '../launch.ts';
import { saveSettings, settingValues, type SettingKey, type Settings } from './settings.ts';

// NEW — start/pause menu: controls, match choices and settings are generated from config and
// data (never hand-written markup, ADR-0007). Shown whenever the pointer is not locked. A mode or
// level choice starts a new match by reloading the page (ADR-0011 §7: no teardown code).

export interface MenuHandlers {
  onPlay: () => void;
  /** A setting changed (already saved). */
  onSettingChange: (key: SettingKey) => void;
  /** Start a new match of this mode on this level. */
  onLaunch: (mode: ModeId, levelId: string) => void;
}

/** The running match, preselected in the match choices. */
export interface MenuMatch {
  mode: ModeId;
  levelId: string;
}

/** A labelled `<select>` row; `options` are [value, text] pairs. */
function selectRow(parent: HTMLElement, label: string, options: readonly (readonly [string, string])[], value: string, onChange: (value: string) => void): void {
  const row = el('label', 'setting', parent);
  el('span', '', row).textContent = label;
  const select = el('select', '', row);
  for (const [optionValue, text] of options) {
    const option = el('option', '', select);
    option.value = optionValue;
    option.textContent = text;
  }
  select.value = value;
  el('span', 'value', row);
  select.addEventListener('change', () => onChange(select.value));
}

export class Menu {
  private readonly root: HTMLElement;
  private readonly message: HTMLElement;

  constructor(parent: HTMLElement, settings: Settings, match: MenuMatch, handlers: MenuHandlers) {
    this.root = el('div', 'menu', parent);
    const panel = el('div', 'menu-panel', this.root);

    const left = el('div', '', panel);
    el('h1', '', left).textContent = APP.title.toUpperCase();
    el('div', 'version', left).textContent = APP.version;
    const play = el('button', 'play', left);
    play.textContent = 'CLICK TO PLAY';
    play.addEventListener('click', handlers.onPlay);
    this.message = el('div', 'message', left);
    el('h2', '', left).textContent = 'Controls';
    const table = el('table', '', left);
    for (const b of [...BINDINGS, ...SYSTEM_KEYS]) {
      const row = el('tr', '', table);
      el('td', '', row).textContent = b.label;
      el('td', '', row).textContent = b.description;
    }

    const right = el('div', '', panel);
    el('h2', '', right).textContent = 'Match';
    const modes = MODE_IDS.map((id) => [id, MODE_TEXT[id].name] as const);
    selectRow(right, 'Mode', modes, match.mode, (mode) => {
      const next = MODE_IDS.find((id) => id === mode);
      if (next) handlers.onLaunch(next, LAUNCH.defaultLevel[next]);
    });
    const levels = levelsForMode(match.mode).map((l) => [l.id, l.name] as const);
    selectRow(right, 'Map', levels, match.levelId, (levelId) => handlers.onLaunch(match.mode, levelId));
    const matchSettings = SETTINGS_SCHEMA.filter((def) => 'group' in def && def.group === 'match');
    for (const def of matchSettings) this.settingRow(right, def, settings, handlers);
    el('div', 'note', right).textContent = MODE_TEXT[match.mode].description;
    const restart = el('button', 'secondary', right);
    restart.textContent = 'NEW MATCH';
    restart.addEventListener('click', () => handlers.onLaunch(match.mode, match.levelId));

    el('h2', '', right).textContent = 'Settings';
    for (const def of SETTINGS_SCHEMA) if (!matchSettings.includes(def)) this.settingRow(right, def, settings, handlers);
  }

  private settingRow(parent: HTMLElement, def: SettingDef, settings: Settings, handlers: MenuHandlers): void {
    const values = settingValues(settings);
    const key = def.key as SettingKey;
    const changed = (value: number | boolean | string): void => {
      values[def.key] = value;
      saveSettings(settings);
      handlers.onSettingChange(key);
    };
    if (def.kind === 'select') {
      const options = def.options.map((o) => [o, `${o.charAt(0).toUpperCase()}${o.slice(1)}`] as const);
      selectRow(parent, def.label, options, String(values[def.key]), changed);
      return;
    }
    const row = el('label', 'setting', parent);
    el('span', '', row).textContent = def.label;
    const input = el('input', '', row);
    const value = el('span', 'value', row);
    if (def.kind === 'range') {
      Object.assign(input, { type: 'range', min: String(def.min), max: String(def.max), step: String(def.step) });
      input.value = String(values[def.key]);
      const show = (): void => {
        value.textContent = `${Number(input.value)}${def.unit ?? ''}`;
      };
      show();
      input.addEventListener('input', () => {
        show();
        changed(Number(input.value));
      });
    } else {
      input.type = 'checkbox';
      input.checked = Boolean(values[def.key]);
      input.addEventListener('change', () => changed(input.checked));
    }
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle('hidden', !visible);
  }

  setMessage(text: string): void {
    this.message.textContent = text;
  }
}
