import { CLOCK } from '../config/constants.js';
import { Phase } from '../config/enums.js';

// Game-Clock. `tick(dtReal)` bewegt `timeOfDay01` vorwärts.
// Phasen-Übergänge triggern Night-Counter-Increment und Sky-Lerp.

export class Clock {
  constructor() {
    this.timeOfDay01 = CLOCK.START_OFFSET_01;
    this.phase = this._computePhase(this.timeOfDay01);
    this.nightCount = 0;
    this._prevPhase = this.phase;
    this._skyCache = { top: 0, horizon: 0, ambient: 0, sun: 0, intensity: 1 };
  }

  tick(dtReal) {
    const dayFraction = dtReal / CLOCK.DAY_LENGTH_SEC;
    this.timeOfDay01 = (this.timeOfDay01 + dayFraction) % 1;
    this.phase = this._computePhase(this.timeOfDay01);
    if (this._prevPhase !== this.phase) {
      if (this.phase === Phase.NIGHT) this.nightCount += 1;
      this._prevPhase = this.phase;
    }
  }

  _computePhase(t) {
    for (const p of CLOCK.PHASES) {
      if (t >= p.start && t < p.end) return p.name;
    }
    return CLOCK.PHASES[CLOCK.PHASES.length - 1].name;
  }

  // Liefert interpolierte Sky-Parameter zwischen aktueller und nächster Phase,
  // basierend auf Fortschritt innerhalb des aktuellen Phase-Segments.
  getSkyParams() {
    const phase = this._currentPhaseDef();
    const nextPhase = this._nextPhaseDef(phase);
    const segLen = phase.end - phase.start;
    const segProgress = segLen > 0 ? (this.timeOfDay01 - phase.start) / segLen : 0;

    const a = CLOCK.SKY[phase.name];
    const b = CLOCK.SKY[nextPhase.name];

    const sky = this._skyCache;
    sky.top = lerpHex(a.top, b.top, segProgress);
    sky.horizon = lerpHex(a.horizon, b.horizon, segProgress);
    sky.ambient = lerpHex(a.ambient, b.ambient, segProgress);
    sky.sun = lerpHex(a.sun, b.sun, segProgress);
    sky.intensity = a.intensity + (b.intensity - a.intensity) * segProgress;
    return sky;
  }

  _currentPhaseDef() {
    return CLOCK.PHASES.find((p) => p.name === this.phase) ?? CLOCK.PHASES[0];
  }

  _nextPhaseDef(phase) {
    const idx = CLOCK.PHASES.indexOf(phase);
    return CLOCK.PHASES[(idx + 1) % CLOCK.PHASES.length];
  }

  // 0..1 Sonnenbogen — 0 morgens, 0.5 mittags, 1 abends. Nachts "unter Horizont".
  getSunAngle01() {
    // Tagesbogen: Sonne ist zwischen dawn-start (0.0) und dusk-end (0.5) sichtbar → linear 0..1.
    if (this.timeOfDay01 < 0.5) return this.timeOfDay01 / 0.5;
    return -1;
  }

  // HH:MM-Darstellung. 0.0 = 00:00, 0.5 = 12:00.
  getTimeString() {
    const totalMinutes = Math.floor(this.timeOfDay01 * 24 * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  getPhaseLabel() {
    switch (this.phase) {
      case Phase.DAWN: return 'Dämmerung';
      case Phase.DAY: return 'Tag';
      case Phase.DUSK: return 'Abend';
      case Phase.NIGHT: return 'Nacht';
      default: return this.phase;
    }
  }
}

function lerpHex(a, b, t) {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}
