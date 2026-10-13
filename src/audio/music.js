// Generative soundtrack. A lookahead scheduler plays pads, an arpeggio, bass and light
// percussion over chord progressions that darken as the AI takes over. Pure WebAudio.

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

// Progressions: one chord per two bars, triads as MIDI notes around middle C.
const PROGS = {
  menu: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], // Am F C G: wide, curious
  calm: [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]], // Am F Dm E: a question hanging
  dread: [[57, 60, 64], [57, 60, 64], [58, 62, 65], [52, 56, 59]], // Am Am Bb E: phrygian, closing in
  won: [[48, 52, 55], [55, 59, 62], [57, 60, 64], [53, 57, 60]], // C G Am F: daylight
  lost: [[57, 60, 64], [53, 56, 60], [50, 53, 57], [52, 55, 59]], // Am Fm Dm Em: no way back
};
const ARP = [0, 1, 2, 1, 3, 2, 1, 2]; // indexes into chord tones (3 = root an octave up)

export class Music {
  constructor(ctx, out, delaySend, noiseBuf) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    // A master lowpass lets pause muffle the whole score.
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 12000;
    this.out.connect(this.tone).connect(out);
    this.delaySend = delaySend;
    this.noiseBuf = noiseBuf;
    this.mode = null; // set by setMode(), which also fades the score in
    this.intensity = 0;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
  }

  start() {
    if (this.timer) return;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.step = 0; // new section starts on a downbeat
    const level = { menu: 0.5, playing: 0.55, won: 0.6, lost: 0.5 }[mode] ?? 0.5;
    this.out.gain.setTargetAtTime(level, this.ctx.currentTime, 1.5);
  }

  setIntensity(x) {
    this.intensity = Math.max(0, Math.min(1, x));
  }

  setPaused(p) {
    this.tone.frequency.setTargetAtTime(p ? 700 : 12000, this.ctx.currentTime, 0.4);
  }

  get bpm() {
    if (this.mode === 'menu' || this.mode === 'lost') return 72;
    if (this.mode === 'won') return 88;
    return 80 + this.intensity * 18;
  }

  get progression() {
    if (this.mode !== 'playing') return PROGS[this.mode] || PROGS.menu;
    return this.intensity > 0.55 ? PROGS.dread : PROGS.calm;
  }

  schedule() {
    const sixteenth = 60 / this.bpm / 4;
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextTime, sixteenth);
      this.nextTime += sixteenth;
      this.step = (this.step + 1) % (32 * 4); // four chords, two bars each
    }
  }

  playStep(step, t, sixteenth) {
    const prog = this.progression;
    const chord = prog[Math.floor(step / 32) % prog.length];
    const i = this.mode === 'playing' ? this.intensity : 0;
    const inBar = step % 16;

    if (step % 32 === 0) this.pad(chord, t, sixteenth * 32);

    // Arpeggio: sparse in the menu and at the end, steady eighths in play.
    const arpEvery = this.mode === 'playing' ? 2 : 4;
    if (step % arpEvery === 0 && (this.mode === 'playing' || Math.random() < 0.55)) {
      const k = ARP[(step / arpEvery) % ARP.length];
      const note = k === 3 ? chord[0] + 12 : chord[k];
      this.pluck(midi(note + 12), t, this.mode === 'lost' ? 0.05 : 0.07);
    }

    if (this.mode === 'won' && inBar % 4 === 0) this.kick(t, 0.5);
    if (this.mode !== 'playing') return;

    if (i > 0.2 && step % 2 === 0) this.bass(midi(chord[0] - 24), t, sixteenth * 1.6, 0.12 + i * 0.1);
    if (i > 0.4 && inBar % 8 === 0) this.kick(t, 0.6 + i * 0.3);
    if (i > 0.55 && inBar % 8 === 4) this.snare(t, 0.12 + i * 0.08);
    if (i > 0.6) this.hat(t, inBar % 4 === 2 ? 0.05 : 0.02);
    // Late game: the score itself starts to glitch.
    if (i > 0.8 && Math.random() < 0.06) {
      for (let r = 0; r < 4; r++) this.blip(midi(chord[r % 3] + 24 + (Math.random() < 0.5 ? 1 : 0)), t + r * sixteenth / 4);
    }
  }

  // ------------------------------------------------------------ voices
  env(g, t, attack, hold, release, peak) {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
  }

  pad(chord, t, dur) {
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(500 + this.intensity * 900, t);
    f.frequency.linearRampToValueAtTime(900 + this.intensity * 1400, t + dur * 0.5);
    f.frequency.linearRampToValueAtTime(500, t + dur);
    const g = ctx.createGain();
    this.env(g, t, dur * 0.3, dur * 0.4, dur * 0.45, this.mode === 'won' ? 0.07 : 0.055);
    f.connect(g).connect(this.out);
    g.connect(this.delaySend);
    for (const n of chord) {
      for (const det of [-8, 8]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = midi(n);
        o.detune.value = det;
        o.connect(f);
        o.start(t);
        o.stop(t + dur * 1.2);
      }
    }
  }

  pluck(freq, t, gain) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const g = ctx.createGain();
    this.env(g, t, 0.004, 0, 0.35, gain);
    o.connect(g).connect(this.out);
    g.connect(this.delaySend);
    o.start(t);
    o.stop(t + 0.45);
  }

  bass(freq, t, dur, gain) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 260 + this.intensity * 300;
    const g = ctx.createGain();
    this.env(g, t, 0.005, dur * 0.4, dur * 0.6, gain);
    o.connect(f).connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  kick(t, gain) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.25);
    const g = ctx.createGain();
    this.env(g, t, 0.003, 0, 0.32, gain * 0.5);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.4);
  }

  noiseHit(t, gain, freq, type, dur) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    this.env(g, t, 0.002, 0, dur, gain);
    s.connect(f).connect(g).connect(this.out);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }

  snare(t, gain) {
    this.noiseHit(t, gain, 1800, 'bandpass', 0.18);
  }

  hat(t, gain) {
    this.noiseHit(t, gain, 8000, 'highpass', 0.05);
  }

  blip(freq, t) {
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    this.env(g, t, 0.002, 0.02, 0.03, 0.03);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.08);
  }
}
