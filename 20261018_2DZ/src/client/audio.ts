// NEW — tiny WebAudio synth: one blip per event kind (AUDIO.voices), no asset files. The context
// is created lazily on the first user gesture (browser autoplay policy).
import { AUDIO, type VoiceId } from '../config/client.ts';
import type { SimEvent, SimState } from '../sim/state.ts';

const EVENT_VOICE: Partial<Record<SimEvent['type'], VoiceId>> = {
  tileHit: 'mineHit',
  tileBroken: 'tileBreak',
  wallBroken: 'tileBreak',
  tilePlaced: 'tilePlace',
  shot: 'shot',
  melee: 'melee',
  hit: 'hit',
  pickup: 'pickup',
  splash: 'splash',
  crafted: 'craft',
  playerDied: 'death',
};

export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private playedThisFrame = new Map<VoiceId, number>();
  muted: boolean = AUDIO.startMuted;

  constructor() {
    const unlock = (): void => {
      this.init();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  private init(): void {
    if (this.ctx) return;
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : AUDIO.masterVolume;
    master.connect(ctx.destination);
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.ctx = ctx;
    this.master = master;
    this.noise = buf;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : AUDIO.masterVolume;
    return this.muted;
  }

  /** Call once per rendered frame before the frame's events. */
  beginFrame(): void {
    this.playedThisFrame.clear();
  }

  play(id: VoiceId, volume = 1): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || this.muted) return;
    const n = this.playedThisFrame.get(id) ?? 0;
    if (n >= AUDIO.maxPerKindPerFrame) return;
    this.playedThisFrame.set(id, n + 1);
    const v = AUDIO.voices[id];
    const t = ctx.currentTime;
    const env = ctx.createGain();
    env.gain.setValueAtTime(v.gain * volume, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + v.dur);
    env.connect(master);
    const osc = ctx.createOscillator();
    osc.type = v.wave;
    osc.frequency.setValueAtTime(v.f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, v.f1), t + v.dur);
    const tone = ctx.createGain();
    tone.gain.value = 1 - v.noise;
    osc.connect(tone).connect(env);
    osc.start(t);
    osc.stop(t + v.dur);
    if (v.noise > 0 && this.noise) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const ng = ctx.createGain();
      ng.gain.value = v.noise;
      src.connect(ng).connect(env);
      src.start(t);
      src.stop(t + v.dur);
    }
  }

  handle(e: SimEvent): void {
    const voice = EVENT_VOICE[e.type];
    if (voice) this.play(voice);
  }

  /** Random groans from zombies near the player (dt = frame seconds). */
  ambient(state: SimState, dt: number): void {
    if (!this.ctx || this.muted) return;
    const p = state.player.body;
    for (const z of state.zombies) {
      const d = Math.hypot(z.body.x - p.x, z.body.y - p.y);
      if (d > AUDIO.groanDistance) continue;
      if (Math.random() < AUDIO.groanChancePerSecond * dt) this.play('groan', 1 - d / AUDIO.groanDistance);
    }
  }
}
