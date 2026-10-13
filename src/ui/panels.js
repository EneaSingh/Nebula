// Side panels (AI dossier, news log), toasts, milestone banners and hover tooltip.
import { h, setText, setWidth, fmtNum, fmtPct, pad3, STATUS_LABEL, visibleStatus, enableSheetSwipe } from './util.js';
import { icon } from './icons.js';

const CATS = [
  ['vector', 'Vectors', 'How it moves'],
  ['ability', 'Abilities', 'What it can do'],
  ['takeover', 'Takeover', 'What it wants'],
];

function sidePanel(ui, id, title, kicker, ...body) {
  const close = h('button', { class: 'btn btn-icon', type: 'button', 'aria-label': `Close ${title}`, html: icon('close'), onclick: () => ui.closePanel(id) });
  const scroll = h('div', { class: 'side-scroll' }, ...body);
  const el = h('section', { class: `panel side-panel side-${id} glass-strong sheet`, hidden: true, role: 'region', 'aria-labelledby': `ks-${id}-title` },
    h('div', { class: 'sheet-grip', 'aria-hidden': 'true' }),
    h('header', { class: 'side-head' },
      h('div', {}, h('span', { class: 'micro', text: kicker }), h('h2', { id: `ks-${id}-title`, text: title })),
      close),
    scroll);
  enableSheetSwipe(el, [el.querySelector('.sheet-grip'), el.querySelector('.side-head')], () => ui.closePanel(id));
  return { el, scroll };
}

export class Dossier {
  constructor(root, ui) {
    this.ui = ui;
    this.byId = new Map((ui.defs.traits || []).map((t) => [t.id, t]));
    this.$ = {};
    this.$.name = h('b', { class: 'dos-name' });
    this.$.type = h('span', { class: 'dos-type' });
    this.$.tagline = h('p', { class: 'dos-tagline' });
    this.$.bars = {};
    const stats = ['spread', 'stealth', 'control', 'adaptation'].map((k) => {
      const fill = h('i', { class: 'mini-fill' });
      const val = h('b', { class: 'num' });
      this.$.bars[k] = { fill, val };
      return h('div', { class: 'stat-row' }, h('span', { class: 'stat-label', text: k }), h('span', { class: 'mini' }, fill), val);
    });
    this.$.awareFill = h('i', { class: 'mini-fill' });
    this.$.awareVal = h('b', { class: 'num' });
    this.$.cats = h('div', { class: 'dos-cats' });
    const { el, scroll } = sidePanel(ui, 'dossier', 'AI dossier', 'Eyes only',
      h('div', { class: 'dos-id' },
        h('span', { class: 'dos-avatar', html: icon('eye') }),
        h('div', {}, this.$.name, this.$.type)),
      this.$.tagline,
      h('div', { class: 'stat-grid dos-stats' }, stats,
        h('div', { class: 'stat-row stat-aware' }, h('span', { class: 'stat-label', text: 'Public awareness' }), h('span', { class: 'mini mini-aware' }, this.$.awareFill), this.$.awareVal)),
      this.$.cats);
    this.el = el;
    this.scroll = scroll;
    root.append(el);
    this.key = null;
    this.fresh = new Set();
  }

  markNew(id) { this.fresh.add(id); this.key = null; }

  update(game) {
    if (this.el.hidden) return;
    const ai = game.ai || {};
    setText(this.$.name, ai.name || 'UNKNOWN');
    const t = (this.ui.defs.threats || []).find((x) => x.id === ai.threat);
    setText(this.$.type, t ? `${t.name} class` : '');
    setText(this.$.tagline, t?.tagline || '');
    for (const [k, b] of Object.entries(this.$.bars)) {
      const v = Number(ai[k]) || 0;
      setWidth(b.fill, v / 10);
      setText(b.val, v.toFixed(1));
    }
    setWidth(this.$.awareFill, ai.awareness);
    setText(this.$.awareVal, fmtPct(ai.awareness));

    const traits = ai.traits || [];
    const key = traits.join(',') + '|' + [...this.fresh].join(',');
    if (key === this.key) return;
    this.key = key;
    const all = this.ui.defs.traits || [];
    this.$.cats.replaceChildren(...CATS.map(([cat, label, sub]) => {
      const total = all.filter((x) => x.category === cat).length;
      const got = traits.map((id) => this.byId.get(id)).filter((x) => x && x.category === cat);
      const hidden = Math.max(0, total - got.length);
      return h('section', { class: `dos-cat cat-${cat}` },
        h('header', { class: 'dos-cat-head' },
          h('h3', { class: 'micro', text: label }), h('span', { class: 'hint', text: sub }),
          h('span', { class: 'num dos-count', text: `${got.length}/${total}` })),
        h('ul', { class: 'trait-list' },
          got.map((tr) => h('li', { class: `trait${this.fresh.has(tr.id) ? ' is-new' : ''}` },
            h('span', { class: 'trait-ico', html: icon(tr.icon) }),
            h('div', {}, h('b', { text: tr.name }), h('p', { text: tr.desc || '' })))),
          Array.from({ length: Math.min(hidden, 4) }, (_, i) => h('li', { class: 'trait trait-redacted', 'aria-label': 'Unobserved trait' },
            h('span', { class: 'trait-ico', html: icon('lock') }),
            h('div', {}, h('span', { class: 'redact', style: { width: `${52 + ((i * 37) % 40)}%` } }), h('span', { class: 'redact redact-2', style: { width: `${70 + ((i * 23) % 25)}%` } }))))),
      );
    }));
    if (!traits.length) this.$.cats.prepend(h('p', { class: 'hint', text: 'No traits observed yet. It is either very simple or very patient.' }));
    clearTimeout(this.freshT);
    if (this.fresh.size) this.freshT = setTimeout(() => { this.fresh.clear(); this.key = null; }, 6000);
  }
}

export class NewsLog {
  constructor(root, ui) {
    this.ui = ui;
    this.items = [];
    this.list = h('ol', { class: 'news-list', reversed: true });
    this.empty = h('p', { class: 'hint', text: 'Quiet so far. Enjoy it.' });
    const { el } = sidePanel(ui, 'news', 'News log', 'Wire feed', this.empty, this.list);
    this.el = el;
    root.append(el);
  }

  reset() { this.items = []; this.list.replaceChildren(); this.empty.hidden = false; }

  add(n) {
    this.items.push(n);
    if (this.items.length > 250) {
      this.items.shift();
      this.list.lastElementChild?.remove();
    }
    this.empty.hidden = true;
    this.list.prepend(h('li', { class: `news-item sev-${n.severity || 'info'}` },
      h('span', { class: 'news-day num', text: n.day != null ? `D${pad3(n.day)}` : '' }),
      h('span', { class: 'news-mark' }),
      h('span', { class: 'news-text', text: n.text })));
  }
}

const TOAST_MAX = 3;
const TOAST_HOLD_MS = 5000;
const TOAST_GAP_MS = 900;

const SEV_ICON = { info: 'info', warn: 'alert', danger: 'alert', good: 'check' };

export class Toasts {
  constructor(root) {
    this.el = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    this.banner = h('div', { class: 'milestone', 'aria-live': 'assertive', hidden: true });
    root.append(this.el, this.banner);
  }

  // Toasts are paced: at most one new toast every TOAST_GAP_MS, at most
  // TOAST_MAX on screen, each held >= TOAST_HOLD_MS. Backlog drops oldest info first.
  toast(text, severity = 'info', ic) {
    this.pending = this.pending || [];
    this.pending.push({ text, severity, ic });
    while (this.pending.length > 5) {
      let k = this.pending.findIndex((x) => x.severity === 'info');
      if (k < 0) k = this.pending.findIndex((x) => x.severity === 'warn');
      if (k < 0) k = 0;
      this.pending.splice(k, 1);
    }
    this.pump();
  }

  pump() {
    if (this.pumpT || !this.pending?.length) return;
    const wait = Math.max(0, (this.lastShown || 0) + TOAST_GAP_MS - performance.now());
    this.pumpT = setTimeout(() => {
      this.pumpT = null;
      const t = this.pending.shift();
      if (t) this.showToast(t);
      this.pump();
    }, wait);
  }

  showToast({ text, severity, ic }) {
    this.lastShown = performance.now();
    const t = h('div', { class: `toast sev-${severity}` },
      h('span', { class: 'toast-ico', html: icon(ic || SEV_ICON[severity] || 'info') }),
      h('span', { class: 'toast-text', text }));
    this.el.append(t);
    const live = [...this.el.children].filter((x) => !x.classList.contains('is-out'));
    if (live.length > TOAST_MAX) this.dismiss(live[0]);
    requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('is-in')));
    t._timer = setTimeout(() => this.dismiss(t), severity === 'danger' || severity === 'good' ? TOAST_HOLD_MS + 1500 : TOAST_HOLD_MS);
  }

  dismiss(t) {
    if (!t || t.classList.contains('is-out')) return;
    clearTimeout(t._timer);
    t.classList.remove('is-in');
    t.classList.add('is-out');
    setTimeout(() => t.remove(), 550);
  }

  milestone(title, sub, severity = 'info', ic = 'alert') {
    const b = this.banner;
    b.className = `milestone sev-${severity}`;
    b.replaceChildren(
      h('span', { class: 'ms-ico', html: icon(ic) }),
      h('div', {}, h('span', { class: 'micro', text: 'Milestone' }), h('b', { class: 'ms-title', text: title }), sub ? h('span', { class: 'ms-sub', text: sub }) : null));
    b.hidden = false;
    requestAnimationFrame(() => b.classList.add('is-in'));
    clearTimeout(this.msT);
    this.msT = setTimeout(() => {
      b.classList.remove('is-in');
      setTimeout(() => { if (!b.classList.contains('is-in')) b.hidden = true; }, 450);
    }, 4200);
  }

  clear() {
    this.pending = [];
    clearTimeout(this.pumpT);
    this.pumpT = null;
    this.el.replaceChildren();
    this.banner.hidden = true;
  }
}

export class Tooltip {
  constructor(root) {
    this.name = h('b', { class: 'tt-name' });
    this.status = h('span', { class: 'pill pill-sm' });
    this.line = h('span', { class: 'tt-line num' });
    this.el = h('div', { class: 'tooltip glass-strong', hidden: true, 'aria-hidden': 'true' },
      h('div', { class: 'tt-head' }, this.name, this.status), this.line);
    root.append(this.el);
    this.touch = false;
    window.addEventListener('pointerdown', (e) => { this.touch = e.pointerType === 'touch'; if (this.touch) this.hide(); }, { passive: true });
  }

  show(game, index, x, y) {
    const c = game?.countries?.[index];
    if (!c || this.touch) { this.hide(); return; }
    setText(this.name, c.name);
    const vis = visibleStatus(c);
    if (vis === 'none') {
      this.status.hidden = true;
      setText(this.line, 'Uninhabited');
    } else {
      this.status.hidden = false;
      setText(this.status, vis === 'unknown' ? 'No known activity' : STATUS_LABEL[vis]);
      this.status.dataset.status = vis;
      if (c.detected) {
        const pct = c.population ? c.infected / c.population : 0;
        setText(this.line, `${fmtNum(c.population)} pop · ${fmtPct(pct, pct < 0.1 && pct > 0 ? 1 : 0)} infected${c.lost ? ` · ${fmtNum(c.lost)} lost` : ''}`);
      } else {
        setText(this.line, `${fmtNum(c.population)} pop · trust ${fmtPct(c.trust)}`);
      }
    }
    this.el.hidden = false;
    const r = this.el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = x + 16;
    let top = y + 18;
    if (left + r.width > vw - 8) left = x - r.width - 16;
    if (top + r.height > vh - 8) top = y - r.height - 14;
    this.el.style.transform = `translate(${Math.max(8, left)}px, ${Math.max(8, top)}px)`;
  }

  hide() { if (!this.el.hidden) this.el.hidden = true; }
}
