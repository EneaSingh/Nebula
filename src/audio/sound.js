// KILL SWITCH audio: every sound is synthesized with WebAudio, no asset files.
// Browsers only allow audio after a user gesture, so nothing plays until unlock().
import { store } from '../ui/util.js';

const PREFS_KEY = 'killswitch.sound';

// Note frequencies used by the stingers (A minor-ish palette: tense but not shrill).
const N = { A2: 110, E3: 164.81, A3: 220, C4: 261.63, D4: 293.66, E4: 329.63, G4: 392, A4: 440, B4: 493.88, C5: 523.25, E5: 659.25, G5: 783.99, A5: 880 };

export class Sound {
  constructor() {
    const prefs = store.get(PREFS_KEY, {}) || {};
    this.enabled = prefs.enabled !== false;
    this.ctx = null;
    this.last = new Map(); // per-sound throttle timestamps
    this.tension = 0;
  }

  get supported() {
    return typeof window !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext);
  }

  /** Call from a user gesture (click / key). Safe to call repeatedly. */
  unlock() {
    if (!this.supported) return;
    if (!this.ctx) this.build();
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  build() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = (this.ctx = new Ctx());
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 1 : 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);

    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.55;
    this.sfx.connect(this.master);

    // Shared feedback delay gives the UI sounds a "big room" command-center tail.
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = 0.23;
    const fb = ctx.createGain();
    fb.gain.value = 0.28;
    const wet = ctx.createGain();
    wet.gain.value = 0.22;
    this.delay.connect(fb).connect(this.delay);
    this.delay.connect(wet).connect(this.master);

    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    this.buildAmbience();
  }

  // Low drone under the whole game. Its filter opens and a dissonant voice fades in as tension rises.
  buildAmbience() {
    const ctx = this.ctx;
    this.music = ctx.createGain();
    this.music.gain.value = 0;
    this.music.connect(this.master);
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 260;
    this.droneFilter.Q.value = 4;
    this.droneFilter.connect(this.music);
    const voice = (freq, type, gain, detune = 0) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = gain;
      o.connect(g).connect(this.droneFilter);
      o.start();
      return g;
    };
    voice(N.A2 / 2, 'sawtooth', 0.32, -6);
    voice(N.A2 / 2, 'sawtooth', 0.32, 7);
    voice(N.E3 / 2, 'triangle', 0.25);
    this.dissonance = voice(N.A2 / 2 * 1.0595, 'sawtooth', 0, 3); // a semitone rub, faded in by tension
    // Slow filter sweep so the drone breathes.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 90;
    lfo.connect(lfoGain).connect(this.droneFilter.frequency);
    lfo.start();
  }

  setEnabled(on) {
    this.enabled = on;
    store.set(PREFS_KEY, { enabled: on });
    if (on) this.unlock();
    if (this.master) this.master.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05);
    if (on) this.play('click');
  }

  toggle() {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  /** 'menu' | 'playing' | 'over' — fades the ambience. */
  setMode(mode) {
    if (!this.ctx) return;
    const level = mode === 'playing' ? 0.16 : mode === 'menu' ? 0.09 : 0.05;
    this.music.gain.setTargetAtTime(level, this.ctx.currentTime, 1.2);
  }

  /** 0..1, driven by how much of humanity is known lost/infected. */
  setTension(t) {
    if (!this.ctx || Math.abs(t - this.tension) < 0.01) return;
    this.tension = t;
    const now = this.ctx.currentTime;
    this.droneFilter.frequency.setTargetAtTime(260 + t * 900, now, 2);
    this.dissonance.gain.setTargetAtTime(t * 0.3, now, 2);
  }

  // ------------------------------------------------------------ primitives
  tone(freq, { at = 0, dur = 0.18, type = 'sine', gain = 0.3, attack = 0.005, slide = 0, wet = false, bus } = {}) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(bus || this.sfx);
    if (wet) g.connect(this.delay);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  noise({ at = 0, dur = 0.2, gain = 0.2, freq = 1200, q = 1, type = 'bandpass', sweep = 1, wet = false } = {}) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    if (sweep !== 1) f.frequency.exponentialRampToValueAtTime(freq * sweep, t0 + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.sfx);
    if (wet) g.connect(this.delay);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.05);
  }

  // ------------------------------------------------------------ sound bank
  play(name, opts = {}) {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    const gap = THROTTLE[name] ?? 0.05;
    const now = this.ctx.currentTime;
    if (now - (this.last.get(name) ?? -1) < gap) return;
    this.last.set(name, now);
    const fn = BANK[name];
    if (fn) fn(this, opts);
  }
}

// Minimum seconds between repeats of the same sound, so busy moments don't turn to noise.
const THROTTLE = { transmission: 0.6, detected: 1.2, click: 0.04, hover: 0.08, fallen: 2, liberated: 1.2, news: 3 };

const BANK = {
  click: (s) => s.tone(1800, { dur: 0.04, type: 'square', gain: 0.05 }),
  open: (s) => { s.tone(520, { dur: 0.09, type: 'triangle', gain: 0.12, slide: 1.5 }); s.noise({ dur: 0.08, gain: 0.04, freq: 3000 }); },
  close: (s) => s.tone(700, { dur: 0.08, type: 'triangle', gain: 0.1, slide: 0.6 }),
  deny: (s) => { s.tone(140, { dur: 0.14, type: 'square', gain: 0.1 }); s.tone(132, { at: 0.11, dur: 0.16, type: 'square', gain: 0.1 }); },

  // Bubbles: breach is an urgent chirp, intel a soft coin, research a rising sparkle.
  collect: (s, { kind }) => {
    if (kind === 'breach') {
      s.tone(N.E5, { dur: 0.1, type: 'square', gain: 0.09 });
      s.tone(N.A5, { at: 0.07, dur: 0.22, type: 'triangle', gain: 0.18, wet: true });
    } else if (kind === 'research') {
      [N.C5, N.E5, N.G5].forEach((f, i) => s.tone(f, { at: i * 0.06, dur: 0.3, type: 'sine', gain: 0.16, wet: true }));
    } else {
      s.tone(N.B4, { dur: 0.08, type: 'triangle', gain: 0.16 });
      s.tone(N.E5, { at: 0.06, dur: 0.28, type: 'triangle', gain: 0.18, wet: true });
    }
  },
  bubble: (s) => s.tone(N.A5 * 1.5, { dur: 0.12, type: 'sine', gain: 0.05, wet: true }),
  expire: (s) => s.tone(N.E4, { dur: 0.25, type: 'sine', gain: 0.04, slide: 0.7 }),

  upgrade: (s) => {
    [N.A3, N.C4 * 1.0, N.E4, N.A4].forEach((f, i) => s.tone(f, { at: i * 0.045, dur: 0.5, type: 'triangle', gain: 0.12, wet: true }));
    s.noise({ dur: 0.35, gain: 0.05, freq: 6000, type: 'highpass' });
  },
  action: (s, { actionId, active }) => {
    if (actionId === 'investigate') { s.tone(1200, { dur: 0.5, gain: 0.12, wet: true }); s.tone(1200, { at: 0.5, dur: 0.4, gain: 0.05 }); }
    else if (actionId === 'quarantine' || actionId === 'shutdown') {
      // Heavy relay clunk going on, a softer release going off.
      s.noise({ dur: active ? 0.25 : 0.15, gain: active ? 0.22 : 0.1, freq: 300, type: 'lowpass' });
      s.tone(active ? 90 : 160, { dur: 0.3, type: 'square', gain: 0.08, slide: active ? 0.5 : 1.5 });
    } else if (actionId === 'fundLab') { [N.E4, N.A4].forEach((f, i) => s.tone(f, { at: i * 0.08, dur: 0.35, type: 'sine', gain: 0.14, wet: true })); }
    else if (actionId === 'deployKillSwitch') { s.play('researchDone'); }
    else s.play('click');
  },

  // Sonar ping whenever a country's AI presence is confirmed.
  detected: (s) => { s.tone(N.E5, { dur: 0.6, type: 'sine', gain: 0.12, wet: true }); s.tone(N.E5 * 0.5, { dur: 0.5, type: 'sine', gain: 0.05 }); },
  // The first confirmation is the big moment: a two-tone klaxon.
  firstDetection: (s) => {
    for (let i = 0; i < 3; i++) {
      s.tone(N.A4, { at: i * 0.5, dur: 0.24, type: 'sawtooth', gain: 0.1 });
      s.tone(N.E4, { at: i * 0.5 + 0.25, dur: 0.24, type: 'sawtooth', gain: 0.1 });
    }
    s.noise({ dur: 1.5, gain: 0.05, freq: 120, type: 'lowpass' });
  },
  transmission: (s) => s.tone(2400 + Math.random() * 800, { dur: 0.05, type: 'sine', gain: 0.025, wet: true }),

  // AI evolution: a glitchy bitcrushed descent.
  evolve: (s) => {
    for (let i = 0; i < 6; i++) s.tone(900 - i * 110 + Math.random() * 60, { at: i * 0.045, dur: 0.05, type: 'square', gain: 0.07 });
    s.noise({ at: 0.05, dur: 0.3, gain: 0.08, freq: 2000, q: 8, sweep: 0.2 });
    s.tone(N.A2, { at: 0.28, dur: 0.6, type: 'sawtooth', gain: 0.08, slide: 0.7 });
  },
  fallen: (s) => { s.tone(55, { dur: 1.4, type: 'sine', gain: 0.35, slide: 0.6 }); s.noise({ dur: 1, gain: 0.12, freq: 200, type: 'lowpass', sweep: 0.3 }); },
  liberated: (s) => [N.E4, N.A4].forEach((f, i) => s.tone(f, { at: i * 0.07, dur: 0.4, type: 'triangle', gain: 0.08, wet: true })),
  milestone: (s) => [N.A4, N.C5, N.E5].forEach((f, i) => s.tone(f, { at: i * 0.1, dur: 0.6, type: 'sine', gain: 0.12, wet: true })),
  researchDone: (s) => {
    [N.A3, N.E4, N.A4, N.C5, N.E5, N.A5].forEach((f, i) => s.tone(f, { at: i * 0.09, dur: 1.2, type: 'triangle', gain: 0.12, wet: true }));
    s.noise({ dur: 1.2, gain: 0.05, freq: 4000, type: 'highpass', sweep: 2 });
  },
  newsDanger: (s) => s.tone(N.A4, { dur: 0.3, type: 'sine', gain: 0.06, wet: true }),

  win: (s) => {
    const chord = [[N.A3, N.C4 * 1.26, N.E4], [N.D4, N.G4 * 1.0, N.B4], [N.A3 * 2, N.E5, N.A5]];
    chord.forEach((c, k) => c.forEach((f) => s.tone(f, { at: k * 0.45, dur: 1.6, type: 'triangle', gain: 0.1, wet: true })));
  },
  lose: (s) => {
    [N.E4, N.C4, N.A3, N.E3].forEach((f, i) => s.tone(f, { at: i * 0.4, dur: 1.2, type: 'sawtooth', gain: 0.08, slide: 0.97 }));
    s.tone(41, { at: 1.4, dur: 3, type: 'sine', gain: 0.4, slide: 0.7 });
  },
};
