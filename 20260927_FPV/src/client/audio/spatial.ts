import { Vector3, type Quaternion } from 'three';
import { AUDIO, type SoundReach } from '../../config/client.ts';
import { clamp, lerp, smoothstep } from '../../sim/math.ts';

// NEW — positional-audio maths (SPEC §15): listener axes, distance gain, distance colouring and
// voice priority. Nothing computed these before (every sound was the local player's own). Kept
// free of Web Audio and the DOM so it runs and can be checked in Node.

/** Web Audio listener axes for a camera orientation: a Three.js camera looks down its local −Z
 *  with +Y up. Writes into `forward`/`up` (no allocation per frame) and returns them. */
export function listenerAxes(q: Quaternion, forward = new Vector3(), up = new Vector3()): { forward: Vector3; up: Vector3 } {
  forward.set(0, 0, -1).applyQuaternion(q);
  up.set(0, 1, 0).applyQuaternion(q);
  return { forward, up };
}

/**
 * Gain multiplier (0 … reach.gain) for a world sound `distance` m from the listener. `loudness`
 * scales every distance of the reach (audible radius = maxDistance × loudness — the rule bots
 * hear footsteps by, ADR-0011 §2). Inverse-distance falloff beyond refDistance, faded out with a
 * smoothstep over the last AUDIO.spatial.edgeFade of the reach, so nothing pops at the edge.
 * The PannerNode only places the sound (its own rolloff is 0): this is the one distance curve.
 */
export function reachGain(distance: number, loudness: number, reach: SoundReach): number {
  if (loudness <= 0) return 0;
  const d = distance / loudness;
  if (d >= reach.maxDistance) return 0;
  const inverse = reach.refDistance / (reach.refDistance + reach.rolloff * Math.max(0, d - reach.refDistance));
  const fadeStart = reach.maxDistance * (1 - AUDIO.spatial.edgeFade);
  const fade = 1 - smoothstep((d - fadeStart) / (reach.maxDistance - fadeStart));
  return reach.gain * inverse * fade;
}

/** Distance tail (SPEC §15): scales for a world sound's cutoff and length at `distance` m. */
export function distanceColour(distance: number): { cutoffScale: number; lengthScale: number } {
  const air = AUDIO.spatial.air;
  const t = clamp(distance / air.fullAtM, 0, 1);
  return { cutoffScale: lerp(1, air.cutoffScale, t), lengthScale: lerp(1, air.lengthScale, t) };
}

/** What voice stealing needs to know about a playing voice (AudioContext times in s). */
export interface VoiceLevel {
  peak: number;
  start: number;
  end: number;
}

/** Current level of a voice: its envelopes decay exponentially from `peak` at `start` to
 *  AUDIO.decayFloor × peak at `end`. */
export function voiceLevel(v: VoiceLevel, now: number): number {
  const t = v.end > v.start ? clamp((now - v.start) / (v.end - v.start), 0, 1) : 1;
  return v.peak * AUDIO.decayFloor ** t;
}

/** The voice a new sound of level `level` replaces when the cap is full: the quietest playing
 *  voice, if it is quieter than the new sound; otherwise null (skip the new sound). */
export function voiceToSteal<V extends VoiceLevel>(voices: readonly V[], level: number, now: number): V | null {
  let quietest: V | null = null;
  let quietestLevel = level;
  for (const v of voices) {
    const l = voiceLevel(v, now);
    if (l < quietestLevel) {
      quietest = v;
      quietestLevel = l;
    }
  }
  return quietest;
}
