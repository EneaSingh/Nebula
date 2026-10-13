// Tiny synthesized sound effects (Web Audio, no files). Theme-aware:
// paper flicks and soft chimes for classic, blips and sweeps for sci-fi.
let ctx = null;
let master = null;
let enabled = true;
let theme = 'classic';

// Only created from a user gesture (unlock); until then effects are silent.
function ac(create = false) {
  if (!ctx && !create) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export const sound = {
  unlock: () => ac(true),
  setEnabled(on) {
    enabled = on;
  },
  setTheme(t) {
    theme = t;
  },
  get enabled() {
    return enabled;
  },

  card() {
    const a = enabled && ac();
    if (!a) return;
    const t = a.currentTime;
    if (theme === 'scifi') {
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(1400, t);
      o.frequency.exponentialRampToValueAtTime(380, t + 0.09);
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + 0.13);
      return;
    }
    const len = Math.floor(a.sampleRate * 0.07);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const src = a.createBufferSource();
    src.buffer = buf;
    const f = a.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2600 + Math.random() * 800;
    f.Q.value = 0.9;
    const g = a.createGain();
    g.gain.value = 0.55;
    src.connect(f).connect(g).connect(master);
    src.start(t);
  },

  chime(good = true) {
    const a = enabled && ac();
    if (!a) return;
    const t = a.currentTime;
    const notes = good ? [660, 880] : [440, 370];
    notes.forEach((freq, i) => {
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = theme === 'scifi' ? 'sawtooth' : 'sine';
      o.frequency.value = freq * (theme === 'scifi' ? 0.5 : 1);
      const f = a.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = theme === 'scifi' ? 1800 : 5000;
      const s = t + i * 0.11;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.12, s + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.5);
      o.connect(f).connect(g).connect(master);
      o.start(s);
      o.stop(s + 0.55);
    });
  },

  sweep() {
    const a = enabled && ac();
    if (!a) return;
    const t = a.currentTime;
    const o = a.createOscillator();
    const g = a.createGain();
    const f = a.createBiquadFilter();
    o.type = 'sawtooth';
    const up = theme === 'scifi';
    o.frequency.setValueAtTime(up ? 90 : 520, t);
    o.frequency.exponentialRampToValueAtTime(up ? 520 : 90, t + 1.2);
    f.type = 'lowpass';
    f.frequency.setValueAtTime(up ? 400 : 3000, t);
    f.frequency.exponentialRampToValueAtTime(up ? 3000 : 400, t + 1.2);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.08, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    o.connect(f).connect(g).connect(master);
    o.start(t);
    o.stop(t + 1.45);
  },
};
