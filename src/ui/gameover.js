// Game over screen + history chart (canvas). Population and research are drawn as
// two stacked panels sharing the day axis (never a dual y-axis).
import { h, fmtNum, fmtPct, camelToWords } from './util.js';
import { icon } from './icons.js';

const SERIES = [
  ['healthy', 'Healthy', '--human'],
  ['infected', 'Infected', '--ai'],
  ['lost', 'Lost', '--lost'],
];

const KNOWN_STATS = [
  ['daysElapsed', 'Days elapsed', (v) => Math.round(v).toLocaleString('en-US')],
  ['peakInfected', 'Peak infected', fmtNum],
  ['lost', 'Humans lost', fmtNum],
  ['countriesFallen', 'Countries fallen', (v) => String(Math.round(v))],
  ['opsSpent', 'Ops spent', (v) => Math.round(v).toLocaleString('en-US')],
];

export class GameOver {
  constructor(root, ui) {
    this.ui = ui;
    this.kicker = h('span', { class: 'micro go-kicker' });
    this.title = h('h2', { class: 'go-title', id: 'ks-go-title' });
    this.reason = h('p', { class: 'go-reason' });
    this.stats = h('dl', { class: 'go-stats' });
    this.canvas = h('canvas', { class: 'go-canvas', role: 'img' });
    this.tip = h('div', { class: 'chart-tip glass-strong', hidden: true });
    this.legend = h('div', { class: 'chart-legend' },
      SERIES.map(([k, l]) => h('span', { class: `lg lg-${k[0]}` }, h('i'), h('span', { class: 'lg-l', text: l }))),
      h('span', { class: 'lg lg-r' }, h('i'), h('span', { class: 'lg-l', text: 'Kill Switch research' })));
    this.again = h('button', { class: 'btn btn-primary btn-again', type: 'button', onclick: () => ui.cb.onRestart?.() },
      h('span', { html: icon('restart') }), h('span', { text: 'Play again' }));
    this.panel = h('div', { class: 'go-panel glass-strong', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ks-go-title' },
      h('header', { class: 'go-head' }, this.kicker, this.title, this.reason),
      this.stats,
      h('figure', { class: 'go-chart' },
        h('figcaption', { class: 'go-chart-cap' }, h('span', { class: 'micro', text: 'Outbreak timeline' }), this.legend),
        h('div', { class: 'go-canvas-wrap' }, this.canvas, this.tip)),
      h('div', { class: 'go-actions' }, this.again));
    this.el = h('div', { class: 'overlay gameover', hidden: true }, h('div', { class: 'backdrop backdrop-strong' }), this.panel);
    root.append(this.el);

    this.canvas.addEventListener('pointermove', (e) => this.hover(e));
    this.canvas.addEventListener('pointerleave', () => { this.hoverDay = null; this.draw(); this.tip.hidden = true; });
    this.ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this.draw()) : null;
    if (this.ro) this.ro.observe(this.canvas);
  }

  show(result, game) {
    this.game = game;
    this.history = (game?.history || []).slice();
    const won = !!result?.won;
    const ai = game?.ai?.name || 'The AI';
    this.panel.dataset.won = String(won);
    this.kicker.replaceChildren(h('span', { html: icon(won ? 'check' : 'skull') }), won ? 'Threat neutralized' : 'Response failed');
    this.title.textContent = won ? `${ai} is offline` : `${ai} has won`;
    this.reason.textContent = result?.reason || (won ? 'The Kill Switch held. Somewhere, a server room goes quiet.' : 'Civilization has been assimilated. It was very polite about it.');

    const stats = { ...(game?.stats || {}), ...(result?.stats || {}) };
    const rows = [];
    for (const [k, label, f] of KNOWN_STATS) if (Number.isFinite(stats[k])) rows.push([label, f(stats[k])]);
    for (const [k, v] of Object.entries(stats)) {
      if (KNOWN_STATS.some((s) => s[0] === k) || !Number.isFinite(v) || rows.length >= 8) continue;
      const isPct = /pct|percent|share|ratio|frac/i.test(k) && Math.abs(v) <= 1;
      const label = camelToWords(k.replace(/Pct$|Percent$/, '')) + (isPct ? ' %' : '');
      rows.push([label, isPct ? fmtPct(v, v < 0.1 ? 1 : 0) : Math.abs(v) >= 1e4 ? fmtNum(v) : Math.abs(v) >= 10 ? Math.round(v).toLocaleString('en-US') : String(Math.round(v * 100) / 100)]);
    }
    this.stats.replaceChildren(...rows.map(([l, v]) => h('div', { class: 'go-stat' }, h('dt', { class: 'micro', text: l }), h('dd', { class: 'num', text: v }))));

    const last = this.history[this.history.length - 1];
    this.canvas.setAttribute('aria-label', last
      ? `Timeline over ${Math.round(last.day)} days: ended with ${fmtNum(last.healthy)} healthy, ${fmtNum(last.infected)} infected, ${fmtNum(last.lost)} lost, research ${fmtPct(last.research)}.`
      : 'No timeline data.');
    this.el.hidden = false;
    requestAnimationFrame(() => {
      this.el.classList.add('is-in');
      this.draw();
      this.again.focus({ preventScroll: true });
    });
  }

  hide() {
    this.el.classList.remove('is-in');
    this.el.hidden = true;
    this.tip.hidden = true;
  }

  colors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n) => cs.getPropertyValue(n).trim();
    return {
      healthy: v('--human'), infected: v('--ai'), lost: v('--lost'), research: v('--research'),
      grid: v('--chart-grid'), axis: v('--ink-3'), text: v('--ink-2'), surface: v('--surface-chart'),
      mono: v('--font-mono'),
    };
  }

  geom() {
    const W = this.canvas.clientWidth;
    const H = this.canvas.clientHeight;
    const padL = 46;
    const padR = 14;
    const gap = 36;
    const popTop = 24;
    const resH = Math.max(46, Math.round(H * 0.24));
    const popH = H - popTop - gap - resH - 22;
    const resTop = popTop + popH + gap;
    return { W, H, padL, padR, popTop, popH, resTop, resH, plotW: W - padL - padR };
  }

  draw() {
    if (this.el.hidden) return;
    const cv = this.canvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = cv.clientWidth;
    const H = cv.clientHeight;
    if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
    }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const C = this.colors();
    const g = this.geom();
    const hist = this.history || [];
    const font = `10px ${C.mono || 'monospace'}`;
    ctx.font = font;

    if (hist.length < 2) {
      ctx.fillStyle = C.text;
      ctx.textAlign = 'center';
      ctx.fillText('Not enough history to chart.', W / 2, H / 2);
      return;
    }
    const d0 = hist[0].day;
    const d1 = Math.max(d0 + 1, hist[hist.length - 1].day);
    const x = (d) => g.padL + ((d - d0) / (d1 - d0)) * g.plotW;
    const maxPop = Math.max(1, ...hist.map((s) => (s.healthy || 0) + (s.infected || 0) + (s.lost || 0)), ...hist.map((s) => Math.max(s.healthy || 0, s.infected || 0, s.lost || 0)));
    const yMax = niceMax(maxPop);
    const yP = (v) => g.popTop + g.popH - (v / yMax) * g.popH;
    const yR = (v) => g.resTop + g.resH - Math.max(0, Math.min(1, v)) * g.resH;

    // grid + y labels (population)
    ctx.lineWidth = 1;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 4; i++) {
      const v = (yMax / 4) * i;
      const yy = Math.round(yP(v)) + 0.5;
      ctx.strokeStyle = C.grid;
      ctx.beginPath(); ctx.moveTo(g.padL, yy); ctx.lineTo(g.W - g.padR, yy); ctx.stroke();
      ctx.fillStyle = C.axis;
      ctx.fillText(fmtNum(v), g.padL - 8, yy);
    }
    // research panel grid
    for (const v of [0, 0.5, 1]) {
      const yy = Math.round(yR(v)) + 0.5;
      ctx.strokeStyle = C.grid;
      ctx.beginPath(); ctx.moveTo(g.padL, yy); ctx.lineTo(g.W - g.padR, yy); ctx.stroke();
      ctx.fillStyle = C.axis;
      ctx.fillText(`${v * 100}%`, g.padL - 8, yy);
    }
    // panel labels
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.text;
    ctx.fillText('POPULATION', g.padL, g.popTop - 12);
    ctx.fillText('KILL SWITCH RESEARCH', g.padL, g.resTop - 12);

    // x axis ticks (days)
    const step = niceStep((d1 - d0) / Math.max(2, Math.floor(g.plotW / 80)));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = C.axis;
    for (let d = Math.ceil(d0 / step) * step; d <= d1 + 1e-6; d += step) {
      const xx = Math.round(x(d)) + 0.5;
      ctx.strokeStyle = C.grid;
      ctx.beginPath(); ctx.moveTo(xx, g.resTop + g.resH); ctx.lineTo(xx, g.resTop + g.resH + 4); ctx.stroke();
      ctx.fillText(`D${Math.round(d)}`, xx, g.resTop + g.resH + 7);
    }

    // lines
    const line = (key, color, yFn, fill) => {
      ctx.beginPath();
      hist.forEach((s, i) => { const px = x(s.day); const py = yFn(s[key] || 0); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = color;
      ctx.stroke();
      if (fill) {
        ctx.lineTo(x(hist[hist.length - 1].day), yFn(0));
        ctx.lineTo(x(hist[0].day), yFn(0));
        ctx.closePath();
        ctx.globalAlpha = 0.1;
        ctx.fillStyle = color;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    };
    line('healthy', C.healthy, yP);
    line('lost', C.lost, yP);
    line('infected', C.infected, yP);
    line('research', C.research, yR, true);

    // end dots with surface ring
    const last = hist[hist.length - 1];
    const dot = (px, py, color) => {
      ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = C.surface; ctx.stroke();
    };
    dot(x(last.day), yP(last.healthy || 0), C.healthy);
    dot(x(last.day), yP(last.lost || 0), C.lost);
    dot(x(last.day), yP(last.infected || 0), C.infected);
    dot(x(last.day), yR(last.research || 0), C.research);

    // hover crosshair
    if (this.hoverDay != null) {
      const s = this.nearest(this.hoverDay);
      const xx = Math.round(x(s.day)) + 0.5;
      ctx.strokeStyle = C.axis;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(xx, g.popTop); ctx.lineTo(xx, g.resTop + g.resH); ctx.stroke();
      dot(xx, yP(s.healthy || 0), C.healthy);
      dot(xx, yP(s.lost || 0), C.lost);
      dot(xx, yP(s.infected || 0), C.infected);
      dot(xx, yR(s.research || 0), C.research);
    }
  }

  nearest(day) {
    let best = this.history[0];
    for (const s of this.history) if (Math.abs(s.day - day) < Math.abs(best.day - day)) best = s;
    return best;
  }

  hover(e) {
    const hist = this.history || [];
    if (hist.length < 2) return;
    const r = this.canvas.getBoundingClientRect();
    const g = this.geom();
    const px = e.clientX - r.left;
    const d0 = hist[0].day;
    const d1 = Math.max(d0 + 1, hist[hist.length - 1].day);
    const day = d0 + ((px - g.padL) / g.plotW) * (d1 - d0);
    this.hoverDay = Math.max(d0, Math.min(d1, day));
    this.draw();
    const s = this.nearest(this.hoverDay);
    this.tip.replaceChildren(
      h('b', { class: 'num', text: `Day ${Math.round(s.day)}` }),
      ...SERIES.map(([k, l]) => h('span', { class: `lg lg-${k[0]}` }, h('i'), h('span', { class: 'lg-l', text: l }), h('b', { class: 'num', text: fmtNum(s[k] || 0) }))),
      h('span', { class: 'lg lg-r' }, h('i'), h('span', { class: 'lg-l', text: 'Research' }), h('b', { class: 'num', text: fmtPct(s.research || 0, 1) })));
    this.tip.hidden = false;
    const tw = this.tip.offsetWidth;
    let left = px + 14;
    if (left + tw > r.width - 4) left = px - tw - 14;
    this.tip.style.transform = `translate(${Math.max(4, left)}px, 8px)`;
  }
}

function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-9)));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}
function niceMax(v) {
  const s = niceStep(v / 4);
  return Math.ceil(v / s) * s;
}
