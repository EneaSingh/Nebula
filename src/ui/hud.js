// In-game HUD: top bar (clock, speed, ops, trust), news ticker, bottom bar
// (AI threat readout, population split, Kill Switch progress, Response button).
import { h, setText, setWidth, toggleClass, fmtNum, fmtPct, fmtDate, pad3, clamp01, reducedMotion } from './util.js';
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
    this.running = false;
    this.offset = 0;
    this.lastT = 0;
    this.idleSince = 0;
  }

  show() { this.el.hidden = false; this.startTicker(); }
  hide() { this.el.hidden = true; this.running = false; }

  reset() {
    this.queue = [];
    this.$.track.replaceChildren();
    this.offset = 0;
    this.lastSpeed = null;
  }

  update(game) {
    const $ = this.$;
    const p = game.player || {};
    const w = game.world || {};
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

    // population
    const pop = w.population || 1;
    setText($.popTotal, fmtNum(w.population));
    setWidth($.segH, w.healthy / pop);
    setWidth($.segI, w.infected / pop);
    setWidth($.segL, w.lost / pop);
    setText($.numH, fmtNum(w.healthy));
    setText($.numI, fmtNum(w.infected));
    setText($.numL, fmtNum(w.lost));

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
      setText($.resRate, `+${rate < 1 ? rate.toFixed(2) : rate.toFixed(1)}%/day`);
      setWidth($.resFill, p.research);
      setWidth($.resDeploy, 0);
    }
    $.resBlock.lastChild.setAttribute('aria-valuenow', String(Math.round(clamp01(deploying ? p.deployProgress : p.research) * 100)));

    // AI readout
    setText($.aiName, ai.name || 'UNKNOWN');
    const t = (this.ui.defs.threats || []).find((x) => x.id === ai.threat);
    setText($.aiType, t ? t.name : '');
    for (const [k] of STATS) {
      const v = Number(ai[k]) || 0;
      setWidth($.aiBars[k].fill, v / 10);
      setText($.aiBars[k].val, v.toFixed(1));
    }
    setWidth($.awareFill, ai.awareness);
    setText($.awareVal, fmtPct(ai.awareness));
    const n = (ai.traits || []).length;
    setText($.traitCount, `${n} trait${n === 1 ? '' : 's'}`);

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
  pushNews(n) {
    this.queue.push(n);
    if (this.queue.length > 12) this.queue.splice(0, this.queue.length - 12);
    this.$.tickerLive.textContent = '';
    if (n.severity === 'danger' || n.severity === 'good') this.$.tickerLive.textContent = n.text;
    if (reducedMotion()) this.showStatic();
  }

  makeItem(n) {
    return h('span', { class: `tick-item sev-${n.severity || 'info'}` },
      h('i', { class: 'tick-mark' }),
      n.day != null ? h('span', { class: 'tick-day num', text: `D${pad3(n.day)}` }) : null,
      h('span', { text: n.text }));
  }

  showStatic() {
    const n = this.queue.shift();
    if (!n) return;
    this.$.track.replaceChildren(this.makeItem(n));
    this.$.track.style.transform = 'none';
  }

  startTicker() {
    if (this.running) return;
    this.running = true;
    this.lastT = performance.now();
    const step = (t) => {
      if (!this.running) return;
      const dt = Math.min(0.1, (t - this.lastT) / 1000);
      this.lastT = t;
      if (!reducedMotion()) this.tickMarquee(dt);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  tickMarquee(dt) {
    const track = this.$.track;
    const vpW = this.$.tickerVp.clientWidth;
    if (!vpW) return;
    // Faster when there's a backlog so headlines don't go stale.
    const speed = 70 + Math.min(6, this.queue.length) * 22;
    if (track.childElementCount) this.offset -= speed * dt;
    // Remove items that scrolled out on the left.
    let first = track.firstElementChild;
    while (first && this.offset + first.offsetWidth < 0) {
      this.offset += first.offsetWidth;
      first.remove();
      first = track.firstElementChild;
    }
    // Append the next headline when there's room on the right.
    const contentRight = this.offset + track.scrollWidth;
    if (this.queue.length && contentRight < vpW - 8) {
      if (!track.childElementCount) this.offset = vpW;
      track.append(this.makeItem(this.queue.shift()));
    }
    track.style.transform = `translate3d(${this.offset.toFixed(1)}px,0,0)`;
  }
}
