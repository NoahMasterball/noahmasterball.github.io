import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { abilitySignature } from '../../src/client/audio/sfx.ts';
import { distanceColour, listenerAxes, reachGain, voiceLevel, voiceToSteal } from '../../src/client/audio/spatial.ts';
import { AUDIO } from '../../src/config/client.ts';
import { ABILITIES } from '../../src/data/content.ts';
import { DEG2RAD, forwardFromAngles } from '../../src/sim/math.ts';

// Positional-audio maths of src/client/audio/spatial.ts (SPEC §15): listener orientation against
// the sim's aiming convention and the browser's panner algorithm, the distance curve, the
// distance tail and voice stealing. spatial.ts has no Web Audio or DOM, so it runs in Node; so
// does the ability signature derivation of sfx.ts (Web Audio only inside the Sfx class).

/** Decimal places for toBeCloseTo on exact maths (|a − b| < 5e-10). */
const EXACT = 9;

/** A camera posed like the player view: Stage sets rotation order 'YXZ', App.render() sets
 *  (pitch, yaw, 0). */
function playerCamera(pos: readonly [number, number, number], yawDeg: number, pitchDeg: number): PerspectiveCamera {
  const cam = new PerspectiveCamera();
  cam.rotation.order = 'YXZ';
  cam.position.set(...pos);
  cam.rotation.set(pitchDeg * DEG2RAD, yawDeg * DEG2RAD, 0);
  return cam;
}

const clampUnit = (v: number): number => Math.min(1, Math.max(-1, v));

/** Web Audio spec, PannerNode "Azimuth and Elevation": what the browser computes (degrees) from
 *  the listener pose we set and the panner position. Reference algorithm, not production code. */
function azimuthElevation(listener: Vector3, forward: Vector3, up: Vector3, source: Vector3): { az: number; el: number } {
  const sl = source.clone().sub(listener);
  if (sl.length() === 0) return { az: 0, el: 0 };
  sl.normalize();
  const right = forward.clone().cross(up).normalize();
  const f = forward.clone().normalize();
  const u = right.clone().cross(f);
  const proj = sl.clone().sub(u.clone().multiplyScalar(sl.dot(u))).normalize();
  let az = (180 * Math.acos(clampUnit(proj.dot(right)))) / Math.PI;
  if (proj.dot(f) < 0) az = 360 - az;
  az = az >= 0 && az <= 270 ? 90 - az : 450 - az;
  let el = 90 - (180 * Math.acos(clampUnit(sl.dot(u)))) / Math.PI;
  if (el > 90) el = 180 - el;
  else if (el < -90) el = -180 - el;
  return { az, el };
}

function heard(cam: PerspectiveCamera, source: readonly [number, number, number]): { az: number; el: number } {
  const { forward, up } = listenerAxes(cam.quaternion);
  return azimuthElevation(cam.position, forward, up, new Vector3(...source));
}

/** Signed difference of two angles in degrees, wrapped to [−180, 180). */
const angleDiff = (a: number, b: number): number => ((((a - b + 180) % 360) + 360) % 360) - 180;

describe('listener axes', () => {
  it('face exactly where the sim aims (forwardFromAngles) for any yaw and pitch', () => {
    for (let yawDeg = -180; yawDeg < 180; yawDeg += 15) {
      for (let pitchDeg = -88; pitchDeg <= 88; pitchDeg += 8) {
        const { forward, up } = listenerAxes(playerCamera([0, 0, 0], yawDeg, pitchDeg).quaternion);
        const aim = forwardFromAngles(yawDeg * DEG2RAD, pitchDeg * DEG2RAD);
        expect(forward.x).toBeCloseTo(aim.x, EXACT);
        expect(forward.y).toBeCloseTo(aim.y, EXACT);
        expect(forward.z).toBeCloseTo(aim.z, EXACT);
        expect(forward.dot(up)).toBeCloseTo(0, EXACT);
        expect(up.length()).toBeCloseTo(1, EXACT);
      }
    }
  });

  const eye = [0, 1.6, 0] as const;
  const facingNorth = playerCamera(eye, 0, 0); // yaw 0 looks down −Z
  const turnedLeft = playerCamera(eye, 90, 0); // looks down −X
  const aimDir = forwardFromAngles(-35 * DEG2RAD, 12 * DEG2RAD);
  const freeCamera = new PerspectiveCamera();
  freeCamera.position.set(-30, 34, 38);
  freeCamera.lookAt(new Vector3(2, 0, -18));

  const cases: { label: string; cam: PerspectiveCamera; source: readonly [number, number, number]; az: number; el: number }[] = [
    { label: 'yaw 0: source at +X is right', cam: facingNorth, source: [10, 1.6, 0], az: 90, el: 0 },
    { label: 'yaw 0: source at −X is left', cam: facingNorth, source: [-10, 1.6, 0], az: -90, el: 0 },
    { label: 'yaw 0: source at −Z is ahead', cam: facingNorth, source: [0, 1.6, -10], az: 0, el: 0 },
    { label: 'yaw 0: source at +Z is behind', cam: facingNorth, source: [0, 1.6, 10], az: 180, el: 0 },
    { label: 'yaw +90: source at −X is ahead', cam: turnedLeft, source: [-10, 1.6, 0], az: 0, el: 0 },
    { label: 'yaw +90: source at −Z is right', cam: turnedLeft, source: [0, 1.6, -10], az: 90, el: 0 },
    { label: 'yaw +90: source at +Z is left', cam: turnedLeft, source: [0, 1.6, 10], az: -90, el: 0 },
    { label: 'pitch +30: a level source ahead is below', cam: playerCamera(eye, 0, 30), source: [0, 1.6, -10], az: 0, el: -30 },
    { label: 'a footstep 5 m ahead at the feet', cam: facingNorth, source: [0, 0, -5], az: 0, el: -Math.atan2(eye[1], 5) / DEG2RAD },
    {
      label: 'yaw −35 pitch 12: a source on the aim line is dead ahead',
      cam: playerCamera(eye, -35, 12),
      source: [aimDir.x * 20, eye[1] + aimDir.y * 20, aimDir.z * 20],
      az: 0,
      el: 0,
    },
    { label: 'free camera (lookAt): the look target is dead ahead', cam: freeCamera, source: [2, 0, -18], az: 0, el: 0 },
  ];

  it.each(cases)('place sources where the browser pans them: $label', ({ cam, source, az, el }) => {
    const h = heard(cam, source);
    expect(angleDiff(h.az, az)).toBeCloseTo(0, 6);
    expect(h.el).toBeCloseTo(el, 6);
  });
});

describe('reachGain (distance curve)', () => {
  const reaches = Object.entries(AUDIO.spatial.reach);

  it.each(reaches)('%s: full gain within refDistance, silent from maxDistance on', (_kind, r) => {
    expect(reachGain(0, 1, r)).toBeCloseTo(r.gain, EXACT);
    expect(reachGain(r.refDistance, 1, r)).toBeCloseTo(r.gain, EXACT);
    expect(reachGain(r.maxDistance, 1, r)).toBe(0);
    expect(reachGain(r.maxDistance + 50, 1, r)).toBe(0);
  });

  it.each(reaches)('%s: falls monotonically, stays in [0, gain] and never jumps', (_kind, r) => {
    const step = 0.01;
    let prev = reachGain(0, 1, r);
    let maxDrop = 0;
    for (let d = step; d <= r.maxDistance + 5; d += step) {
      const g = reachGain(d, 1, r);
      expect(g).toBeLessThanOrEqual(prev + 1e-12);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(r.gain);
      maxDrop = Math.max(maxDrop, prev - g);
      prev = g;
    }
    expect(maxDrop).toBeLessThan(0.01);
  });

  it.each(reaches)('%s: loudness scales every distance, gain(d, L) = gain(d / L, 1)', (_kind, r) => {
    for (const loudness of [0.3, 0.5, 1.5]) {
      for (const d of [1, 4, 9, 17]) expect(reachGain(d, loudness, r)).toBeCloseTo(reachGain(d / loudness, 1, r), EXACT);
    }
  });

  it('footsteps are audible exactly within maxDistance × loudness (the bots’ hearing rule)', () => {
    const fs = AUDIO.spatial.reach.footstep;
    for (const loudness of [0.3, 1, 1.5]) {
      expect(reachGain(fs.maxDistance * loudness - 0.05, loudness, fs)).toBeGreaterThan(0);
      expect(reachGain(fs.maxDistance * loudness, loudness, fs)).toBe(0);
    }
  });

  it('loudness 0 is silent', () => {
    expect(reachGain(3, 0, AUDIO.spatial.reach.footstep)).toBe(0);
  });
});

describe('distanceColour (distance tail)', () => {
  const air = AUDIO.spatial.air;

  it('is dry at the listener, fully coloured from fullAtM on and linear in between', () => {
    expect(distanceColour(0)).toEqual({ cutoffScale: 1, lengthScale: 1 });
    expect(distanceColour(air.fullAtM * 3)).toEqual({ cutoffScale: air.cutoffScale, lengthScale: air.lengthScale });
    expect(distanceColour(air.fullAtM / 2).cutoffScale).toBeCloseTo((1 + air.cutoffScale) / 2, EXACT);
    expect(distanceColour(air.fullAtM / 2).lengthScale).toBeCloseTo((1 + air.lengthScale) / 2, EXACT);
  });

  it('keeps the longest stretched burst inside the noise buffer', () => {
    const lengths = [...Object.values(AUDIO.shot), ...Object.values(AUDIO.footstep), AUDIO.impact].map((s) => s.length);
    expect(Math.max(...lengths) * air.lengthScale).toBeLessThan(AUDIO.noiseSeconds);
  });
});

describe('voice stealing', () => {
  const voice = (peak: number, start: number, end: number) => ({ peak, start, end });

  it('a voice decays from its peak to decayFloor × peak at its end', () => {
    expect(voiceLevel(voice(0.5, 0, 1), 0)).toBeCloseTo(0.5, EXACT);
    expect(voiceLevel(voice(0.5, 0, 1), 1)).toBeCloseTo(0.5 * AUDIO.decayFloor, EXACT);
    expect(voiceLevel(voice(0.5, 0, 1), 5)).toBeCloseTo(0.5 * AUDIO.decayFloor, EXACT);
  });

  it('steals the voice that is quietest now, not the one with the lowest peak', () => {
    const now = 0.18;
    const loudButOld = voice(0.6, 0, 0.2); // ≈ 0.0011 at `now`
    const quietButFresh = voice(0.05, 0.17, 0.3); // ≈ 0.029 at `now`
    const mid = voice(0.2, 0.1, 0.4);
    const voices = [mid, loudButOld, quietButFresh];
    expect(voiceToSteal(voices, 0.1, now)).toBe(loudButOld);
    expect(voiceToSteal(voices, 0.0005, now)).toBeNull();
  });

  it('has nothing to steal from an empty pool', () => {
    expect(voiceToSteal([], 1, 0)).toBeNull();
  });

  it('keeps a loop (a voice without an end) at its peak, so only louder sounds steal it', () => {
    const loop = voice(0.2, 0, Infinity);
    expect(voiceLevel(loop, 100)).toBe(0.2);
    expect(voiceToSteal([loop], 0.1, 100)).toBeNull();
    expect(voiceToSteal([loop], 0.3, 100)).toBe(loop);
  });
});

describe('ability signatures (SPEC §15)', () => {
  it('never gives two abilities the same wave within half a signature step of each other', () => {
    const minApart = AUDIO.ability.signature.stepSemitones / 2;
    const signatures = ABILITIES.map((a) => ({ id: a.id, ...abilitySignature(a.id) }));
    signatures.forEach((a, i) => {
      for (const b of signatures.slice(i + 1)) {
        if (a.wave !== b.wave) continue;
        expect(Math.abs(12 * Math.log2(a.tone / b.tone)), `${a.id} vs ${b.id}`).toBeGreaterThanOrEqual(minApart);
      }
    });
  });
});
