/**
 * Procedural audio system (P17).
 * All sounds are synthesized via Web Audio API — no external files needed
 * for v1. Howler.js is left for later (imported music tracks, spatial audio).
 *
 * Respects browser autoplay policy: AudioContext resumes on the first
 * user gesture (handled by the title screen's BEGIN button).
 *
 * Volume/mute state comes from the Zustand store and auto-saves.
 */
import { gameStore } from '../state/store';

export type AudioState = 'explore' | 'race';

export class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain!: GainNode;
  private musicGain!: GainNode;
  private sfxGain!: GainNode;

  // Wind loop (filtered white noise).
  private windNode: AudioBufferSourceNode | null = null;
  private windGain!: GainNode;
  private windFilter!: BiquadFilterNode;
  private windStarted = false;

  // Music: simple chord pad for exploration.
  private musicOscs: OscillatorNode[] = [];
  private musicPlaying = false;

  private state: AudioState = 'explore';

  /** Call once after a user gesture (title screen BEGIN). */
  init(): void {
    if (this.ctx) return;
    this.ctx = new AudioContext();

    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.12;
    this.musicGain.connect(this.masterGain);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.connect(this.masterGain);

    // Wind chain: white noise → bandpass → gain → master.
    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 600;
    this.windFilter.Q.value = 0.6;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0;
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.masterGain);

    this.applyVolumes();
    gameStore.subscribe(() => this.applyVolumes());

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => { /* browser policy */ });
    }
  }

  private applyVolumes(): void {
    const s = gameStore.getState();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.setTargetAtTime(s.muted ? 0 : 1, now, 0.05);
    this.sfxGain.gain.setTargetAtTime(s.sfxVolume, now, 0.05);
    this.musicGain.gain.setTargetAtTime(s.musicVolume * 0.12, now, 0.05);
  }

  /** Call every frame with current speed ratio 0..1. */
  updateWind(speedRatio: number): void {
    if (!this.ctx) return;
    if (!this.windStarted) {
      this.startWind();
      this.windStarted = true;
    }
    const now = this.ctx.currentTime;
    // Wind intensity and pitch scale with speed.
    const vol = Math.pow(speedRatio, 1.5) * 0.25;
    this.windGain.gain.setTargetAtTime(vol, now, 0.12);
    this.windFilter.frequency.setTargetAtTime(400 + speedRatio * 1200, now, 0.12);
  }

  private startWind(): void {
    if (!this.ctx) return;
    // 2-second loop of white noise.
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    this.windNode = this.ctx.createBufferSource();
    this.windNode.buffer = buf;
    this.windNode.loop = true;
    this.windNode.connect(this.windFilter);
    this.windNode.start();
  }

  /** Play the boost whoosh SFX. */
  playBoost(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.4);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.5);
  }

  /** Musette collect chime: two-note arpeggio. */
  playCollect(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const [freq, delay] of [[880, 0], [1320, 0.08]] as const) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + delay);
      gain.gain.linearRampToValueAtTime(0.2, now + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.25);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now + delay);
      osc.stop(now + delay + 0.25);
    }
  }

  /** Checkpoint gate passed. */
  playCheckpoint(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 1046; // C6
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  /** Countdown: 3,2,1 = low beep, 0 (GO!) = high blip. */
  playCountdown(n: number): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const freq = n > 0 ? 440 : 880;
    const dur = n > 0 ? 0.12 : 0.3;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + dur + 0.01);
  }

  /** Victory: ascending major triad. */
  playVictory(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = [523, 659, 784, 1046]; // C5 E5 G5 C6
    for (let i = 0; i < notes.length; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = notes[i];
      const t = now + i * 0.12;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.5);
    }
  }

  /** Defeat: descending minor. */
  playDefeat(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = [392, 349, 311]; // G4 F4 Eb4
    for (let i = 0; i < notes.length; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = notes[i];
      const t = now + i * 0.22;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.14, t + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.55);
    }
  }

  /** Gate missed (soft reset). */
  playMiss(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(150, now + 0.2);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  /** Start ambient exploration music (drone chord pad). */
  startMusic(): void {
    if (!this.ctx || this.musicPlaying) return;
    this.musicPlaying = true;
    // C3 + E3 + G3 pad with slow LFO on gain for breathing feel.
    const freqs = [130.8, 164.8, 196.0];
    for (const freq of freqs) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const lfo = this.ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.15 + Math.random() * 0.1;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 0.04;
      lfo.connect(lfoGain);
      const oscGain = this.ctx.createGain();
      oscGain.gain.value = 0.06;
      lfoGain.connect(oscGain.gain);
      osc.connect(oscGain);
      oscGain.connect(this.musicGain);
      osc.start();
      lfo.start();
      this.musicOscs.push(osc, lfo);
    }
  }

  /** Crossfade to race music (higher energy chord). */
  setState(state: AudioState): void {
    if (state === this.state || !this.ctx) return;
    this.state = state;
    const now = this.ctx.currentTime;
    // For v1: just duck the music during races.
    this.musicGain.gain.setTargetAtTime(
      state === 'race' ? 0.03 : gameStore.getState().musicVolume * 0.12,
      now,
      0.6,
    );
  }

  dispose(): void {
    this.windNode?.stop();
    for (const osc of this.musicOscs) {
      try { osc.stop(); } catch { /* already stopped */ }
    }
    this.ctx?.close();
  }
}
