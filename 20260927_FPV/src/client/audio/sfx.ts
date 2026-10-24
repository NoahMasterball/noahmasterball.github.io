import { Vector3, type Object3D } from 'three';
import { AUDIO, type Impulse, type SoundReach } from '../../config/client.ts';
import { ABILITIES, getAbility } from '../../data/content.ts';
import type { HitZone, WeaponClass, WeightClass } from '../../data/schema.ts';
import { distance, type Vec3 } from '../../sim/math.ts';
import type { AreaEntity, EntityId, UplinkAction, UplinkStage } from '../../sim/types.ts';
import { distanceColour, listenerAxes, reachGain, voiceToSteal, type VoiceLevel } from './spatial.ts';

// NEW — synthesised placeholder sounds (SPEC §15): no audio assets until the art pass (M3).
// The AudioContext is created on the first user gesture (browser autoplay policy). World sounds
// (other characters' shots and steps, impacts) are positional: the listener follows the render
// camera, every world voice has its own PannerNode and its distance gain comes from spatial.ts.
// The local player's own sounds go straight into the mix: dry, centred and never capped.
// Abilities (ADR-0012 §9): a derived signature tone per ability, impulse cues for their world
// events and a loop per lasting area, heard as far as bots hear abilities
// (AUDIO.spatial.reach.ability). Relay's uplink (ADR-0013 §8): positional start/cancel cues, a
// stinger for everyone when a plant or disrupt completes.

/** UI sound names: every AUDIO.ui entry except the shared envelope values. */
type UiSound = Exclude<keyof typeof AUDIO.ui, 'length' | 'gain'>;

/** Where a sound comes from: the local player (non-positional, dry) or a point in the world. */
export type SoundSource = 'local' | Vec3;

/** Ability event cues (AUDIO.ability.cues). */
export type AbilityCue = keyof typeof AUDIO.ability.cues;

/** Signature of an ability: its activation kind's wave at the kind's base tone, raised
 *  AUDIO.ability.signature.stepSemitones per position among the abilities of that kind in
 *  ABILITIES — derived, not listed, so every ability sounds different (SPEC §15) and a new one
 *  needs no audio entry. */
export function abilitySignature(abilityId: string): { wave: OscillatorType; tone: number } {
  const s = AUDIO.ability.signature;
  const kind = getAbility(abilityId).activation.kind;
  const index = ABILITIES.filter((a) => a.activation.kind === kind).findIndex((a) => a.id === abilityId);
  return { wave: s.wave[kind], tone: s.baseTone[kind] * 2 ** ((index * s.stepSemitones) / 12) };
}

/** One playing sound. Web Audio sources are one-shot, so voices are built per sound and their
 *  nodes disconnected when the last source ends; only the number of world voices is pooled. */
interface Voice extends VoiceLevel {
  /** All sources of the voice mix into this gain (faded out when the voice is stolen). */
  out: GainNode;
  nodes: AudioNode[];
  sources: AudioScheduledSourceNode[];
  /** Sources that have not ended yet. */
  playing: number;
}

// NEW — ADR-0012 batch K: lasting areas were silent; every other sound is a one-shot voice.
/** A playing loop (an area's): its voice and the nodes retuned every frame as the listener moves. */
interface LoopVoice {
  voice: Voice;
  level: GainNode;
  filter: BiquadFilterNode;
}

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private volume = 1;
  /** Positional voices playing now (at most AUDIO.voices.maxWorld). */
  private readonly world: Voice[] = [];
  /** Area loops playing now, by area id (areaLoops). */
  private readonly loops = new Map<EntityId, LoopVoice>();
  /** Listener pose: the render camera's, refreshed every frame by setListener(). */
  private readonly listenerPos = new Vector3();
  private readonly listenerForward = new Vector3();
  private readonly listenerUp = new Vector3();

  /** Call from a user gesture (the "play" click). */
  unlock(): void {
    if (!this.ctx) {
      const ctx = new AudioContext();
      this.ctx = ctx;
      this.master = new GainNode(ctx);
      this.master.connect(ctx.destination);
      this.noise = new AudioBuffer({ numberOfChannels: 1, length: Math.round(ctx.sampleRate * AUDIO.noiseSeconds), sampleRate: ctx.sampleRate });
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      // Chrome loads its HRTF data asynchronously when the first panner is created and keeps HRTF
      // panners silent until then: create one now so the first world sound is not lost.
      new PannerNode(ctx, { panningModel: AUDIO.spatial.panningModel });
    }
    void this.ctx.resume();
    this.setVolume(this.volume);
  }

  setVolume(volume: number): void {
    this.volume = volume;
    if (this.master) this.master.gain.value = volume;
  }

  /** Moves the listener to the render camera; call once per frame after the camera is posed. */
  setListener(camera: Pick<Object3D, 'position' | 'quaternion'>): void {
    const p = this.listenerPos.copy(camera.position);
    const listener = this.ctx?.listener;
    if (!listener) return;
    const { forward: f, up: u } = listenerAxes(camera.quaternion, this.listenerForward, this.listenerUp);
    if (listener.positionX) {
      listener.positionX.value = p.x;
      listener.positionY.value = p.y;
      listener.positionZ.value = p.z;
      listener.forwardX.value = f.x;
      listener.forwardY.value = f.y;
      listener.forwardZ.value = f.z;
      listener.upX.value = u.x;
      listener.upY.value = u.y;
      listener.upZ.value = u.z;
    } else {
      // Firefox has no AudioParam listener attributes; its (deprecated) setters do the same.
      listener.setPosition(p.x, p.y, p.z);
      listener.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z);
    }
  }

  /** A gunshot: the local player's own as it always was; anyone else's from their muzzle. */
  shot(weaponClass: WeaponClass, source: SoundSource): void {
    this.impulse(AUDIO.shot[weaponClass], source, AUDIO.spatial.reach.gunshot, 1);
  }

  /** One step of the sim's footstep event, which owns cadence and `loudness`; the walker's
   *  weight class picks the timbre. The local player's own steps are quieter and dry. */
  footstep(weightClass: WeightClass, loudness: number, source: SoundSource): void {
    const f = AUDIO.footstep[weightClass];
    const pitch = 1 + (Math.random() * 2 - 1) * f.jitter;
    const gain = source === 'local' ? f.gain * AUDIO.ownFootstepGain : f.gain;
    this.impulse({ length: f.length, cutoff: f.cutoff * pitch, tone: f.tone * pitch, gain }, source, AUDIO.spatial.reach.footstep, loudness);
  }

  /** A bullet hitting level geometry at `point`. */
  impact(point: Vec3): void {
    this.impulse(AUDIO.impact, point, AUDIO.spatial.reach.impact, 1);
  }

  /** Hit confirmation of the local player's shot; `zone` null = a gadget (body tone; `killed` =
   *  destroyed). */
  hit(zone: HitZone | null, killed: boolean): void {
    const h = AUDIO.hit;
    const freq = killed ? h.kill : zone === 'head' ? h.head : h.body;
    const voice = this.openVoice(null, h.gain);
    if (!voice) return;
    this.tone(voice, freq, h.length, h.gain, freq);
    if (killed) this.tone(voice, freq * 1.5, h.length * 2, h.gain * 0.8, freq * 1.5);
  }

  /** The local player took damage. */
  hurt(): void {
    const h = AUDIO.hurt;
    const voice = this.openVoice(null, h.gain);
    if (voice) this.burst(voice, h.length, h.cutoff, h.gain);
  }

  /** An ability's signature (activation): the local player's own dry, anyone else's from where
   *  they stand — both teams hear it. */
  abilitySignature(abilityId: string, source: SoundSource): void {
    const s = AUDIO.ability.signature;
    const { wave, tone } = abilitySignature(abilityId);
    const at = source === 'local' ? null : source;
    const d = at ? distance(this.listenerPos, at) : 0;
    const gain = at ? s.gain * reachGain(d, 1, AUDIO.spatial.reach.ability) : s.gain;
    const voice = this.openVoice(at, gain);
    if (voice) this.tone(voice, tone, s.length * distanceColour(d).lengthScale, gain, tone, wave);
  }

  /** Area loops (AUDIO.ability.areaLoop): one positional loop per area in `areas` (the sim state's
   *  list), started when the area appears or comes within earshot, faded out when it is gone or
   *  out of earshot. Loops are world voices under the cap: a louder sound may steal one, and it
   *  starts again once it wins a voice. Call once per frame after setListener(). */
  areaLoops(areas: readonly Readonly<Pick<AreaEntity, 'id' | 'pos'>>[]): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const loop = AUDIO.ability.areaLoop;
    const live = new Set<EntityId>();
    for (const area of areas) {
      live.add(area.id);
      const d = distance(this.listenerPos, area.pos);
      const gain = loop.gain * reachGain(d, 1, AUDIO.spatial.reach.ability);
      const cutoff = loop.cutoff * distanceColour(d).cutoffScale;
      let playing = this.loops.get(area.id);
      if (playing && !this.world.includes(playing.voice)) playing = undefined; // stolen
      if (playing && gain < AUDIO.voices.inaudibleGain) {
        this.fadeOut(playing.voice, now, loop.fadeSeconds);
        playing = undefined;
      }
      if (playing) {
        // Voice stealing compares the loop's level now.
        playing.voice.peak = gain;
        playing.level.gain.setTargetAtTime(gain, now, loop.fadeSeconds);
        playing.filter.frequency.setTargetAtTime(cutoff, now, loop.fadeSeconds);
      } else {
        playing = this.startLoop(area.pos, gain, cutoff) ?? undefined;
      }
      if (playing) this.loops.set(area.id, playing);
      else this.loops.delete(area.id);
    }
    for (const [id, playing] of this.loops) {
      if (live.has(id)) continue;
      if (this.world.includes(playing.voice)) this.fadeOut(playing.voice, now, loop.fadeSeconds);
      this.loops.delete(id);
    }
  }

  /** A looping low-passed noise voice at `at`, faded in to `gain`; null when openVoice refuses. */
  private startLoop(at: Vec3, gain: number, cutoff: number): LoopVoice | null {
    const { ctx, noise } = this;
    if (!ctx || !noise) return null;
    const voice = this.openVoice(at, gain);
    if (!voice) return null;
    const t = ctx.currentTime;
    const src = new AudioBufferSourceNode(ctx, { buffer: noise, loop: true });
    const filter = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: cutoff });
    const level = new GainNode(ctx, { gain: 0 });
    level.gain.setTargetAtTime(gain, t, AUDIO.ability.areaLoop.fadeSeconds);
    src.connect(filter).connect(level).connect(voice.out);
    // A random point of the noise buffer, so neighbouring loops do not play in unison.
    src.start(t, Math.random() * noise.duration);
    // Never ends by itself: a level that does not decay (voiceLevel) until fadeOut stops it.
    this.track(voice, src, Infinity, filter, level);
    return { voice, level, filter };
  }

  /** A world event of an ability (placed, destroyed, burst, heal, shield, reveal, end). */
  abilityCue(cue: AbilityCue, source: SoundSource): void {
    this.impulse(AUDIO.ability.cues[cue], source, AUDIO.spatial.reach.ability, 1);
  }

  /** A Relay plant or disrupt: a start or cancel cue at the channeller (the local player's own
   *  dry), heard as far as bots hear a start; a completion is a stinger for everyone. */
  uplink(action: UplinkAction, stage: UplinkStage, source: SoundSource): void {
    if (stage === 'complete') this.ui(action === 'plant' ? 'uplinkPlanted' : 'uplinkDisrupted');
    else this.impulse(AUDIO.uplink[action][stage], source, AUDIO.spatial.reach.uplink, 1);
  }

  ui(kind: UiSound): void {
    const u = AUDIO.ui;
    const voice = this.openVoice(null, u.gain);
    if (voice) this.tone(voice, u[kind], u.length, u.gain, u[kind] * 0.8);
  }

  /** Noise burst + body tone. A world source is placed, attenuated by `reach` (`loudness` scales
   *  its distances) and coloured by distance; the local source plays dry at gain × loudness. */
  private impulse(p: Impulse, source: SoundSource, reach: SoundReach, loudness: number): void {
    const at = source === 'local' ? null : source;
    const d = at ? distance(this.listenerPos, at) : 0;
    const gain = at ? p.gain * reachGain(d, loudness, reach) : p.gain * loudness;
    const voice = this.openVoice(at, gain);
    if (!voice) return;
    const colour = distanceColour(d);
    const length = p.length * colour.lengthScale;
    const shape = AUDIO.impulse;
    this.burst(voice, length, p.cutoff * colour.cutoffScale, gain);
    this.tone(voice, p.tone, length * shape.toneLength, gain * shape.toneGain, p.tone * shape.toneEnd);
  }

  /** A new voice peaking at `peak`: positional at `at`, or straight into the mix (null). Null
   *  when audio is still locked, the sound is inaudible, or the world-voice cap is full of
   *  louder voices. */
  private openVoice(at: Vec3 | null, peak: number): Voice | null {
    const { ctx, master } = this;
    if (!ctx || !master || peak < AUDIO.voices.inaudibleGain) return null;
    const now = ctx.currentTime;
    if (at && this.world.length >= AUDIO.voices.maxWorld) {
      const victim = voiceToSteal(this.world, peak, now);
      if (!victim) return null;
      this.fadeOut(victim, now, AUDIO.voices.stealFadeSeconds);
    }
    const out = new GainNode(ctx);
    const voice: Voice = { out, nodes: [out], sources: [], playing: 0, peak, start: now, end: now };
    if (at) {
      // The panner only places the sound (rolloff 0): reachGain() is the one distance curve.
      const panner = new PannerNode(ctx, {
        panningModel: AUDIO.spatial.panningModel,
        rolloffFactor: 0,
        positionX: at.x,
        positionY: at.y,
        positionZ: at.z,
      });
      out.connect(panner).connect(master);
      voice.nodes.push(panner);
      this.world.push(voice);
    } else {
      out.connect(master);
    }
    return voice;
  }

  /** Registers a started source (and the nodes behind it); the voice is released when its last
   *  source has ended. */
  private track(voice: Voice, src: AudioScheduledSourceNode, stopAt: number, ...nodes: AudioNode[]): void {
    voice.sources.push(src);
    voice.nodes.push(src, ...nodes);
    voice.playing += 1;
    voice.end = Math.max(voice.end, stopAt);
    src.onended = () => {
      voice.playing -= 1;
      if (voice.playing === 0) this.release(voice);
    };
  }

  private release(voice: Voice): void {
    for (const node of voice.nodes) node.disconnect();
    this.forget(voice);
  }

  /** Fades a world voice out over `seconds` and frees its slot at once; its nodes are released on
   *  'ended'. */
  private fadeOut(voice: Voice, now: number, seconds: number): void {
    const end = now + seconds;
    voice.out.gain.setValueAtTime(voice.out.gain.value, now);
    voice.out.gain.linearRampToValueAtTime(0, end);
    for (const src of voice.sources) src.stop(end);
    this.forget(voice);
  }

  private forget(voice: Voice): void {
    const i = this.world.indexOf(voice);
    if (i >= 0) this.world.splice(i, 1);
  }

  private burst(voice: Voice, length: number, cutoff: number, gain: number): void {
    const { ctx, noise } = this;
    if (!ctx || !noise) return;
    const t = ctx.currentTime;
    const src = new AudioBufferSourceNode(ctx, { buffer: noise });
    const filter = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: cutoff });
    const env = this.envelope(ctx, gain, t, length);
    src.connect(filter).connect(env).connect(voice.out);
    // A random stretch of the noise buffer, so repeated bursts do not sound identical.
    src.start(t, Math.random() * Math.max(0, noise.duration - length), length);
    this.track(voice, src, t + length, filter, env);
  }

  private tone(voice: Voice, freq: number, length: number, gain: number, endFreq: number, wave?: OscillatorType): void {
    const { ctx } = this;
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = new OscillatorNode(ctx, { type: wave });
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t + length);
    const env = this.envelope(ctx, gain, t, length);
    osc.connect(env).connect(voice.out);
    osc.start(t);
    osc.stop(t + length);
    this.track(voice, osc, t + length, env);
  }

  /** `gain` at `t`, decaying exponentially to AUDIO.decayFloor × gain over `length` s (relative,
   *  so faint distant sounds fade out instead of being cut off). */
  private envelope(ctx: AudioContext, gain: number, t: number, length: number): GainNode {
    const env = new GainNode(ctx);
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(gain * AUDIO.decayFloor, t + length);
    return env;
  }
}
