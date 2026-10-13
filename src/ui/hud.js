// In-game HUD: top bar (clock, speed, ops, trust), news ticker, bottom bar
// (AI threat readout, population split, Kill Switch progress, Response button).
import { h, setText, setWidth, toggleClass, fmtNum, fmtPct, fmtDate, pad3, clamp01, reducedMotion, knownWorld, threatRevealed } from './util.js';
import { icon } from './icons.js';

const STATS = [
  ['spread', 'Spread'],
  ['stealth', 'Stealth'],
  ['control', 'Control'],
  ['adaptation', 'Adapt'],
];

export class Hud {
  constructor(root, ui) {
    this.ui = ui;
    const $ = (this.$ = {});

    // ---------- top bar ----------
    $.day = h('b', { class: 'clock-day num' });
    $.date = h('span', { class: 'clock-date num' });
    $.speedBtns = [0, 1, 2, 3].map((s) =>
      h('button', {
        class: 'seg-btn speed-btn', type: 'button', 'aria-pressed': 'false', dataset: { speed: s },
        'aria-label': s === 0 ? 'Pause (Space)' : `Speed ${s} (${s})`, title: s === 0 ? 'Pause (Space)' : `Speed ${s}x (${s})`,
        html: icon(['pause', 'play', 'play2', 'play3'][s]),
        onclick: () => ui.setSpeed(s),
      }));
    $.ops = h('b', { class: 'ops-val num' });
    $.trustFill = h('i', { class: 'meter-fill' });
    $.trustVal = h('b', { class: 'trust-val num' });
    $.trust = h('div', { class: 'trust', title: 'Global public trust' },
      h('span', { class: 'micro', text: 'Trust' }),
      h('span', { class: 'meter meter-trust', role: 'presentation' }, $.trustFill),
      $.trustVal);

    $.top = h('header', { class: 'topbar glass' },
      h('div', { class: 'tb-left' },
        h('div', { class: 'brand', 'aria-hidden': 'true' }, h('span', { html: icon('power') }), h('span', { class: 'brand-word', text: 'KILL SWITCH' })),
        h('div', { class: 'clock' }, h('span', { class: 'micro', text: 'Day' }), $.day, $.date)),
      h('div', { class: 'seg speed', role: 'group', 'aria-label': 'Simulation speed' }, $.speedBtns),
      h('div', { class: 'tb-right' },
        h('div', { class: 'ops-chip', title: 'Ops: spend on the Response tree and country actions' },
          h('span', { class: 'ops-ico', html: icon('ops') }), $.ops, h('span', { class: 'micro', text: 'Ops' })),
        $.trust));

    // ---------- ticker ----------
    $.track = h('div', { class: 'ticker-track' });
    $.tickerVp = h('div', { class: 'ticker-viewport', 'aria-hidden': 'true' }, $.track);
    $.tickerLive = h('div', { class: 'sr-only', 'aria-live': 'polite' });
    $.ticker = h('div', { class: 'ticker glass' },
      h('span', { class: 'ticker-label' }, h('i', { class: 'live-dot' }), 'Live'),
      $.tickerVp, $.tickerLive,
      h('button', { class: 'ticker-log', type: 'button', 'aria-label': 'Open news log', title: 'News log', html: icon('news'), onclick: () => ui.togglePanel('news') }));

    // ---------- bottom: threat readout ----------
    $.aiName = h('b', { class: 'ai-name' });
    $.aiType = h('span', { class: 'ai-type' });
    $.aiBars = {};
    const statRows = STATS.map(([k, label]) => {
      const fill = h('i', { class: 'mini-fill' });
      const val = h('b', { class: 'num' });
      $.aiBars[k] = { fill, val };
      return h('div', { class: 'stat-row' }, h('span', { class: 'stat-label', text: label }), h('span', { class: 'mini' }, fill), val);
    });
    $.awareFill = h('i', { class: 'mini-fill' });
    $.awareVal = h('b', { class: 'num' });
    $.traitCount = h('span', { class: 'ai-traits num' });
    $.threat = h('button', { class: 'threat glass', type: 'button', 'aria-label': 'Open AI dossier', onclick: () => ui.togglePanel('dossier') },
      h('span', { class: 'threat-head' },
        h('span', { class: 'micro micro-ai', text: 'Rogue AI' }),
        $.traitCount),
      h('span', { class: 'threat-name' }, h('span', { class: 'threat-pulse' }), $.aiName),
      $.aiType,
      h('span', { class: 'stat-grid' }, statRows,
        h('span', { class: 'stat-row stat-aware' }, h('span', { class: 'stat-label', text: 'Aware' }), h('span', { class: 'mini mini-aware' }, $.awareFill), $.awareVal)));

    // ---------- bottom: vitals ----------
    $.popTotal = h('b', { class: 'num' });
    $.segH = h('i', { class: 'split-seg seg-h' });
    $.segI = h('i', { class: 'split-seg seg-i' });
    $.segL = h('i', { class: 'split-seg seg-l' });
    $.numH = h('b', { class: 'num' });
    $.numI = h('b', { class: 'num' });
    $.numL = h('b', { class: 'num' });
    $.resFill = h('i', { class: 'res-fill' });
    $.resDeploy = h('i', { class: 'res-deploy' });
    $.resPct = h('b', { class: 'num res-pct' });
    $.resRate = h('span', { class: 'num res-rate' });
    $.resLabel = h('span', { class: 'micro', text: 'Kill Switch research' });
    $.resBlock = h('div', { class: 'vital vital-res' },
      h('div', { class: 'vital-head' }, h('span', { class: 'res-ico', html: icon('power') }), $.resLabel, $.resRate, $.resPct),
      h('div', { class: 'res-bar', role: 'progressbar', 'aria-label': 'Kill Switch research', 'aria-valuemin': '0', 'aria-valuemax': '100' }, $.resFill, $.resDeploy, h('span', { class: 'res-ticks' })));
    $.vitals = h('div', { class: 'vitals glass' },
      h('div', { class: 'vital vital-pop' },
        h('div', { class: 'vital-head' }, h('span', { class: 'micro', text: 'World population' }), $.popTotal),
        h('div', { class: 'split', role: 'img', 'aria-label': 'Population split' }, $.segH, $.segI, $.segL),
        h('div', { class: 'split-legend' },
          h('span', { class: 'lg lg-h' }, h('i'), h('span', { class: 'lg-l', text: 'Healthy' }), $.numH),
          h('span', { class: 'lg lg-i' }, h('i'), h('span', { class: 'lg-l', text: 'Infected' }), $.numI),
          h('span', { class: 'lg lg-l' }, h('i'), h('span', { class: 'lg-l', text: 'Lost' }), $.numL))),
      $.resBlock);

    // ---------- bottom: buttons ----------
    $.respOps = h('b', { class: 'num' });
    $.respBadge = h('span', { class: 'resp-badge num', hidden: true });
    $.dossierBtn = h('button', { class: 'btn btn-ghost bb-btn', type: 'button', onclick: () => ui.togglePanel('dossier'), 'aria-label': 'AI dossier' },
      h('span', { html: icon('dossier') }), h('span', { class: 'bb-label', text: 'Dossier' }));
    $.newsBtn = h('button', { class: 'btn btn-ghost bb-btn', type: 'button', onclick: () => ui.togglePanel('news'), 'aria-label': 'News log' },
      h('span', { html: icon('news') }), h('span', { class: 'bb-label', text: 'News' }));
    $.respBtn = h('button', { class: 'response-btn', type: 'button', onclick: () => ui.openTree(), 'aria-label': 'Open Response tree (R)' },
      h('span', { class: 'resp-ico', html: icon('tree') }),
      h('span', { class: 'resp-text' }, h('span', { class: 'resp-title', text: 'Response' }),
        h('span', { class: 'resp-sub' }, h('span', { class: 'ops-ico', html: icon('ops') }), $.respOps, ' ops')),
      $.respBadge);
    $.actions = h('div', { class: 'bb-actions' }, $.dossierBtn, $.newsBtn, $.respBtn);

    $.bottom = h('footer', { class: 'bottombar' }, $.threat, $.vitals, $.actions);

    this.el = h('div', { class: 'hud', hidden: true }, $.top, $.ticker, $.bottom);
    root.append(this.el);

    // ticker state
    this.queue = [];
    this.current = null;
    this.running = false;
  }

  show() {
    this.el.hidden = false;
    this.startTicker();
    this.measure();
    if (!this.ro && typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.measure());
      this.ro.observe(this.$.top);
      this.ro.observe(this.$.ticker);
      this.ro.observe(this.$.bottom);
    }
    if (!this.onResize) {
      this.onResize = () => this.measure();
      window.addEventListener('resize', this.onResize);
    }
  }

  /** Publish the real HUD extents so panels/toasts never overlap the bars. */
  measure() {
    if (this.el.hidden) return;
    const root = this.ui.root;
    const tk = this.$.ticker.getBoundingClientRect();
    const bb = this.$.bottom.getBoundingClientRect();
    const rootR = root.getBoundingClientRect();
    if (!tk.height || !bb.height) return;
    const vars = {
      '--panel-top': tk.bottom - rootR.top + 10,
      '--bb-reserve': rootR.bottom - bb.top + 10,
      // left column sits above the threat card; right column above vitals/buttons
      '--bb-reserve-l': rootR.bottom - this.$.threat.getBoundingClientRect().top + 10,
      '--bb-reserve-r': rootR.bottom - Math.min(this.$.vitals.getBoundingClientRect().top, this.$.actions.getBoundingClientRect().top) + 10,
    };
    for (const [k, v] of Object.entries(vars)) {
      const px = `${Math.round(v)}px`;
      if (root.style.getPropertyValue(k) !== px) root.style.setProperty(k, px);
    }
  }
  hide() { this.el.hidden = true; this.running = false; }

  reset() {
    this.queue = [];
    this.current = null;
    this.$.track.replaceChildren();
    this.lastSpeed = null;
  }

  update(game) {
    const $ = this.$;
    const p = game.player || {};
        const ai = game.ai || {};

    setText($.day, pad3(game.day));
    setText($.date, fmtDate(game.date));
    this.renderSpeed(game.speed);

    setText($.ops, Math.floor(p.ops || 0));
    setText($.respOps, Math.floor(p.ops || 0));
    setWidth($.trustFill, p.trust);
    setText($.trustVal, fmtPct(p.trust));
    toggleClass($.trust, 'is-low', p.trust < 0.35);
    toggleClass($.trust, 'is-crit', p.trust < 0.2);

    // population: only what the player knows (never game.world.infected/lost)
    const kw = knownWorld(game);
    const pop = kw.population || 1;
    setText($.popTotal, fmtNum(kw.population));
    setWidth($.segH, kw.healthy / pop);
    setWidth($.segI, kw.infected / pop);
    setWidth($.segL, kw.lost / pop);
    setText($.numH, fmtNum(kw.healthy));
    setText($.numI, kw.confirmed ? fmtNum(kw.infected) : 'Unknown');
    setText($.numL, kw.confirmed ? fmtNum(kw.lost) : 'Unknown');
    toggleClass($.vitals, 'is-unconfirmed', !kw.confirmed);

    // research
    const deploying = (p.research || 0) >= 1 || p.killSwitchDeployed || (p.deployProgress || 0) > 0;
    toggleClass($.resBlock, 'is-deploying', deploying);
    if (deploying) {
      setText($.resLabel, 'Kill Switch');
      setText($.resPct, `Deploying ${fmtPct(p.deployProgress)}`);
      setText($.resRate, '');
      setWidth($.resFill, 1);
      setWidth($.resDeploy, p.deployProgress);
    } else {
      setText($.resLabel, 'Kill Switch research');
      setText($.resPct, fmtPct(p.research, 1));
      const rate = (p.researchRate || 0) * 100;
      setText($.resRate, `+${rate === 0 ? '0' : rate < 0.1 ? rate.toFixed(3) : rate < 1 ? rate.toFixed(2) : rate.toFixed(1)}%/day`);
      setWidth($.resFill, p.research);
      setWidth($.resDeploy, 0);
    }
    $.resBlock.lastChild.setAttribute('aria-valuenow', String(Math.round(clamp01(deploying ? p.deployProgress : p.research) * 100)));

    // AI readout
    setText($.aiName, ai.name || 'UNKNOWN');
    const t = (this.ui.defs.threats || []).find((x) => x.id === ai.threat);
    setText($.aiType, t ? t.name : '');
    const revealed = threatRevealed(game);
    toggleClass($.threat, 'is-unknown', !revealed);
    for (const [k] of STATS) {
      const v = Number(ai[k]) || 0;
      setWidth($.aiBars[k].fill, revealed ? v / 10 : 0);
      setText($.aiBars[k].val, revealed ? v.toFixed(1) : '??');
    }
    setWidth($.awareFill, ai.awareness);
    setText($.awareVal, fmtPct(ai.awareness));
    const n = (ai.traits || []).length;
    setText($.traitCount, revealed ? `${n} trait${n === 1 ? '' : 's'}` : 'Unconfirmed');

    // Response button badge: how many upgrades are buyable now
    let buyable = 0;
    for (const u of this.ui.defs.upgrades || []) {
      if (!game.isOwned(u.id) && game.canBuy(u.id)?.ok) buyable++;
    }
    $.respBadge.hidden = buyable === 0;
    setText($.respBadge, buyable);
    toggleClass($.respBtn, 'has-buyable', buyable > 0);
  }

  renderSpeed(speed) {
    if (speed === this.lastSpeed) return;
    this.lastSpeed = speed;
    for (const b of this.$.speedBtns) b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === speed));
    toggleClass(this.el, 'is-paused', speed === 0);
  }

  // ---------------- news ticker ----------------
  // Calm, one-headline-at-a-time ticker: each headline fades in and holds for at
  // least HOLD_MS. Long headlines pan slowly (PAN_PX_S) after a short pause.
  // Backlog drops the oldest info items first; danger/good are never dropped.
  pushNews(n) {
    this.queue.push(n);
    while (this.queue.length > QUEUE_MAX) {
      let k = this.queue.findIndex((x) => (x.severity || 'info') === 'info');
      if (k < 0) k = this.queue.findIndex((x) => x.severity === 'warn');
      if (k < 0) break; // only danger/good left: keep them all
      this.queue.splice(k, 1);
    }
    if (n.severity === 'danger' || n.severity === 'good') this.$.tickerLive.textContent = n.text;
    if (!this.current) this.showNext();
  }

  makeItem(n) {
    return h('span', { class: `tick-item sev-${n.severity || 'info'}` },
      h('i', { class: 'tick-mark' }),
      n.day != null ? h('span', { class: 'tick-day num', text: `D${pad3(n.day)}` }) : null,
      h('span', { class: 'tick-text', text: n.text }));
  }

  showNext() {
    const n = this.queue.shift();
    if (!n) return;
    const track = this.$.track;
    const old = track.querySelector('.tick-item:not(.is-leaving)');
    if (old) {
      old.classList.add('is-leaving');
      setTimeout(() => old.remove(), 600);
    }
    const item = this.makeItem(n);
    item.classList.add('is-entering');
    track.append(item);
    const calm = reducedMotion();
    // Measure overflow of the headline inside the viewport.
    const vpW = this.$.tickerVp.clientWidth;
    const over = Math.max(0, item.scrollWidth - (vpW - 28));
    let hold = HOLD_MS;
    if (over > 0 && !calm) {
      const panMs = (over / PAN_PX_S) * 1000;
      item.style.setProperty('--pan', `${-over}px`);
      item.style.setProperty('--pan-ms', `${Math.round(panMs)}ms`);
      item.classList.add('is-long');
      hold = Math.max(HOLD_MS, PAN_DELAY_MS + panMs + 2500);
    } else if (over > 0) {
      item.classList.add('is-clipped');
    }
    requestAnimationFrame(() => requestAnimationFrame(() => item.classList.remove('is-entering')));
    // A backlog shortens holds a little, never below the floor.
    if (this.queue.length >= 3) hold = Math.max(MIN_HOLD_MS, hold * 0.8);
    this.current = { item, until: performance.now() + hold };
  }

  startTicker() {
    if (this.running) return;
    this.running = true;
    const gen = (this.gen = (this.gen || 0) + 1);
    const step = () => {
      if (!this.running || gen !== this.gen) return;
      if (this.current && performance.now() >= this.current.until && this.queue.length) this.showNext();
      else if (!this.current && this.queue.length) this.showNext();
      setTimeout(step, 250);
    };
    step();
  }
}

const HOLD_MS = 7000;
const MIN_HOLD_MS = 6000;
const PAN_DELAY_MS = 1800;
const PAN_PX_S = 45;
const QUEUE_MAX = 6;
