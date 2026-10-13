// Response (upgrade) tree: modal with three tabs; Plague-style hex node grid with
// connector lines for `requires`; detail pane with Buy.
import { h, setText, toggleClass } from './util.js';
import { icon } from './icons.js';

const TABS = [
  ['containment', 'Containment', 'shield', 'Slow it down. Cut it off.'],
  ['research', 'Research', 'flask', 'Understand it. Then end it.'],
  ['operations', 'Operations', 'globe', 'Money, people and public patience.'],
];
const SVGNS = 'http://www.w3.org/2000/svg';
const LABEL_H = 44; // node name (2 lines) + cost under each hex

export class ResponseTree {
  constructor(root, ui) {
    this.ui = ui;
    this.tab = 'containment';
    this.selected = null;
    this.game = null;
    const ups = ui.defs.upgrades || [];
    this.byId = new Map(ups.map((u) => [u.id, u]));
    this.actionName = new Map((ui.defs.actions || []).map((a) => [a.id, a.name]));

    this.tabBtns = TABS.map(([id, name, ic]) => {
      const badge = h('span', { class: 'tab-badge num', hidden: true });
      const owned = h('span', { class: 'tab-owned num' });
      const b = h('button', {
        class: `tab tab-${id}`, type: 'button', role: 'tab', id: `ks-tab-${id}`, 'aria-controls': 'ks-tree-body',
        'aria-selected': 'false', dataset: { tab: id }, onclick: () => this.setTab(id),
      }, h('span', { class: 'tab-ico', html: icon(ic) }), h('span', { class: 'tab-name', text: name }), owned, badge);
      b._badge = badge;
      b._owned = owned;
      return b;
    });
    this.tabBtns.forEach((b, i) => b.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const n = this.tabBtns[(i + d + this.tabBtns.length) % this.tabBtns.length];
      n.focus();
      n.click();
    }));

    this.opsVal = h('b', { class: 'num' });
    this.tagline = h('p', { class: 'tree-tagline' });
    this.svg = document.createElementNS(SVGNS, 'svg');
    this.svg.setAttribute('class', 'tree-lines');
    this.svg.setAttribute('aria-hidden', 'true');
    this.grid = h('div', { class: 'tree-grid' }, this.svg);
    this.scroller = h('div', { class: 'tree-scroll', id: 'ks-tree-body', role: 'tabpanel' }, this.grid);
    this.detail = h('aside', { class: 'tree-detail', 'aria-live': 'polite' });
    this.closeBtn = h('button', { class: 'btn btn-icon', type: 'button', 'aria-label': 'Close Response tree', html: icon('close'), onclick: () => this.close() });
    this.autoPause = h('input', { type: 'checkbox', id: 'ks-autopause' });
    this.autoPause.checked = !!ui.prefs.autoPause;
    this.autoPause.addEventListener('change', () => ui.setPref('autoPause', this.autoPause.checked));

    this.panel = h('div', { class: 'modal tree-modal glass-strong', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ks-tree-title', tabindex: '-1' },
      h('header', { class: 'modal-head' },
        h('div', { class: 'modal-title' },
          h('span', { class: 'micro', text: 'Global Response' }),
          h('h2', { id: 'ks-tree-title' }, 'Response', h('span', { class: 'hide-phone', text: ' protocols' }))),
        h('div', { class: 'modal-head-right' },
          h('label', { class: 'check', for: 'ks-autopause', title: 'Pause the simulation while this screen is open' }, this.autoPause, h('span', { class: 'check-long', text: 'Pause while open' }), h('span', { class: 'check-short', text: 'Pause' })),
          h('div', { class: 'ops-chip' }, h('span', { class: 'ops-ico', html: icon('ops') }), this.opsVal, h('span', { class: 'micro', text: 'Ops' })),
          this.closeBtn)),
      h('nav', { class: 'tabs', role: 'tablist', 'aria-label': 'Response branches' }, this.tabBtns),
      h('div', { class: 'tree-body' },
        h('div', { class: 'tree-main' }, this.tagline, this.scroller),
        this.detail));

    this.el = h('div', { class: 'overlay tree-overlay', hidden: true },
      h('div', { class: 'backdrop', onclick: () => this.close() }), this.panel);
    root.append(this.el);

    this.nodes = new Map();
    this.ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this.layout()) : null;
    if (this.ro) this.ro.observe(this.scroller);
    else window.addEventListener('resize', () => this.layout());
  }

  get isOpen() { return !this.el.hidden; }

  open(tab) {
    if (tab) this.tab = tab;
    this.returnFocus = document.activeElement;
    this.el.hidden = false;
    this.ui.onOverlayOpen('tree');
    this.build();
    requestAnimationFrame(() => {
      this.el.classList.add('is-in');
      this.panel.focus({ preventScroll: true });
    });
  }

  close() {
    if (this.el.hidden) return;
    this.el.classList.remove('is-in');
    this.el.hidden = true;
    this.ui.onOverlayClose('tree');
    if (this.returnFocus && document.contains(this.returnFocus)) this.returnFocus.focus({ preventScroll: true });
  }

  setTab(id) {
    if (this.tab === id) return;
    this.tab = id;
    this.selected = null;
    this.build();
  }

  bindGame(game) {
    this.game = game;
    this.selected = null;
    if (this.isOpen) this.build();
  }

  build() {
    for (const b of this.tabBtns) b.setAttribute('aria-selected', String(b.dataset.tab === this.tab));
    this.panel.dataset.tab = this.tab;
    this.scroller.setAttribute('aria-labelledby', `ks-tab-${this.tab}`);
    setText(this.tagline, TABS.find((t) => t[0] === this.tab)?.[3] || '');
    const ups = (this.ui.defs.upgrades || []).filter((u) => u.tab === this.tab);
    for (const n of this.nodes.values()) n.el.remove();
    this.nodes.clear();
    this.ups = ups;
    this.maxRow = Math.max(0, ...ups.map((u) => u.row || 0));
    this.maxCol = Math.max(0, ...ups.map((u) => u.col || 0));
    for (const u of ups) {
      const cost = h('span', { class: 'node-cost num' });
      const el = h('button', {
        class: 'node', type: 'button', dataset: { id: u.id }, 'aria-describedby': 'ks-tree-detail',
        onclick: () => this.select(u.id),
      },
        h('span', { class: 'node-hex', html: `<svg viewBox="0 0 100 100" aria-hidden="true"><polygon class="hex-bg" points="50,3 91,26.5 91,73.5 50,97 9,73.5 9,26.5"/><polygon class="hex-ring" points="50,9 85.5,29.5 85.5,70.5 50,91 14.5,70.5 14.5,29.5"/></svg>` },
          h('span', { class: 'node-ico', html: icon(u.icon) }),
          h('span', { class: 'node-lock', html: icon('lock') })),
        h('span', { class: 'node-name', text: u.name }),
        cost);
      this.grid.append(el);
      this.nodes.set(u.id, { el, cost, u });
    }
    if (!this.selected || !this.nodes.has(this.selected)) {
      // Default selection: first buyable, else first not owned, else first.
      const g = this.game;
      const pick = g && (ups.find((u) => !g.isOwned(u.id) && g.canBuy(u.id)?.ok) || ups.find((u) => !g.isOwned(u.id)));
      this.selected = (pick || ups[0])?.id || null;
    }
    this.layout();
    this.refresh();
    this.renderDetail();
    this.scroller.scrollTop = 0;
  }

  layout() {
    if (!this.isOpen || !this.ups) return;
    const cols = this.maxCol + 1;
    const rows = this.maxRow + 1;
    const avail = this.scroller.clientWidth - 8;
    const cellW = Math.max(66, Math.min(132, avail / cols));
    const hex = Math.round(Math.max(46, Math.min(64, cellW * 0.62)));
    const availH = this.scroller.clientHeight - 30;
    const cellH = Math.round(Math.max(hex + LABEL_H + 14, Math.min(hex + LABEL_H + 36, availH / rows)));
    const W = Math.max(avail, cellW * cols);
    const H = rows * cellH + 8;
    this.grid.style.width = `${W}px`;
    this.grid.style.height = `${H}px`;
    this.grid.style.setProperty('--hex', `${hex}px`);
    this.grid.style.setProperty('--cell-w', `${cellW}px`);
    const x0 = (W - cellW * cols) / 2;
    const center = (u) => [x0 + (u.col || 0) * cellW + cellW / 2, 6 + (u.row || 0) * cellH + hex / 2];
    for (const { el, u } of this.nodes.values()) {
      const [cx, cy] = center(u);
      el.style.left = `${cx - cellW / 2}px`;
      el.style.top = `${cy - hex / 2}px`;
      el.style.width = `${cellW}px`;
    }
    // connectors
    this.svg.setAttribute('width', W);
    this.svg.setAttribute('height', H);
    this.svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    this.svg.replaceChildren();
    this.lines = [];
    for (const u of this.ups) {
      for (const rid of u.requires || []) {
        const r = this.byId.get(rid);
        if (!r || r.tab !== u.tab) continue;
        const [x1, y1] = center(r);
        const [x2, y2] = center(u);
        const path = document.createElementNS(SVGNS, 'path');
        const r0 = hex / 2;
        const below = r0 + LABEL_H; // leave the parent's label + cost clear
        let d;
        if (Math.abs(y1 - y2) < 1) d = `M${x1 + Math.sign(x2 - x1) * r0},${y1}H${x2 - Math.sign(x2 - x1) * r0}`;
        else if (Math.abs(x1 - x2) < 1) d = `M${x1},${y1 + below}V${y2 - r0}`;
        else {
          const my = y2 - r0 - Math.max(8, Math.min(14, (y2 - y1 - r0 - below) / 2));
          d = `M${x1},${y1 + below}V${my}H${x2}V${y2 - r0}`;
        }
        path.setAttribute('d', d);
        this.svg.append(path);
        this.lines.push({ path, from: rid, to: u.id });
      }
    }
    this.refreshLines();
  }

  stateOf(id) {
    const g = this.game;
    if (!g) return { state: 'locked', reason: 'No active game' };
    if (g.isOwned(id)) return { state: 'owned' };
    const u = this.byId.get(id);
    const res = g.canBuy(id) || { ok: false };
    if (res.ok) return { state: 'buyable' };
    const reqMet = (u.requires || []).every((r) => g.isOwned(r));
    const ops = g.player?.ops ?? 0;
    if (reqMet && ops < u.cost) return { state: 'unaffordable', reason: res.reason || `Need ${Math.ceil(u.cost - ops)} more Ops` };
    return { state: reqMet ? 'unaffordable' : 'locked', reason: res.reason || 'Requires earlier protocols' };
  }

  refresh() {
    if (!this.isOpen || !this.game) return;
    const g = this.game;
    setText(this.opsVal, Math.floor(g.player?.ops || 0));
    for (const { el, cost, u } of this.nodes.values()) {
      const { state } = this.stateOf(u.id);
      if (el.dataset.state !== state) el.dataset.state = state;
      toggleClass(el, 'is-selected', u.id === this.selected);
      setText(cost, state === 'owned' ? 'Active' : String(u.cost));
      const label = `${u.name}, ${state === 'owned' ? 'owned' : state === 'buyable' ? `buyable, ${u.cost} ops` : state === 'unaffordable' ? `${u.cost} ops, not affordable` : 'locked'}`;
      if (el.getAttribute('aria-label') !== label) el.setAttribute('aria-label', label);
    }
    // tab badges
    for (const b of this.tabBtns) {
      const ups = (this.ui.defs.upgrades || []).filter((u) => u.tab === b.dataset.tab);
      const n = ups.filter((u) => !g.isOwned(u.id) && g.canBuy(u.id)?.ok).length;
      const owned = ups.filter((u) => g.isOwned(u.id)).length;
      b._badge.hidden = n === 0;
      setText(b._badge, n);
      setText(b._owned, `${owned}/${ups.length}`);
    }
    this.refreshLines();
    this.renderDetail();
  }

  refreshLines() {
    const g = this.game;
    if (!this.lines || !g) return;
    for (const l of this.lines) {
      const a = g.isOwned(l.from);
      const b = g.isOwned(l.to);
      const cls = a && b ? 'ln-owned' : a ? 'ln-open' : 'ln-locked';
      if (l.path.getAttribute('class') !== cls) l.path.setAttribute('class', cls);
    }
  }

  select(id) {
    this.selected = id;
    this.refresh();
    if (window.matchMedia?.('(max-width: 760px)').matches) {
      this.detail.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    }
  }

  renderDetail() {
    const u = this.byId.get(this.selected);
    if (!u) {
      this.detail.replaceChildren(h('p', { class: 'hint', text: 'Select a protocol.' }));
      this.detailKey = null;
      return;
    }
    const { state, reason } = this.stateOf(u.id);
    const ops = Math.floor(this.game?.player?.ops || 0);
    const key = `${u.id}|${state}|${reason || ''}|${state === 'unaffordable' ? ops : ''}`;
    if (key === this.detailKey) return;
    this.detailKey = key;
    const stateLabel = { owned: 'Active', buyable: 'Available', unaffordable: 'Insufficient Ops', locked: 'Locked' }[state];
    const reqs = (u.requires || []).map((r) => this.byId.get(r)).filter(Boolean);
    const buy = h('button', {
      class: 'btn btn-primary btn-buy', type: 'button', disabled: state !== 'buyable',
      onclick: () => {
        this.ui.cb.onBuy?.(u.id);
        this.detailKey = null;
        this.refresh();
        this.ui.hud?.update?.(this.game);
      },
    }, state === 'owned' ? h('span', { html: icon('check') }) : h('span', { class: 'ops-ico', html: icon('ops') }),
      h('span', { text: state === 'owned' ? 'Approved' : `Approve · ${u.cost} Ops` }));

    this.detail.replaceChildren(...[
      h('div', { class: 'detail-head' },
        h('span', { class: `detail-ico st-${state}`, html: icon(u.icon) }),
        h('div', {},
          h('span', { class: `state-tag st-${state}`, text: stateLabel }),
          h('h3', { class: 'detail-name', text: u.name }))),
      h('p', { class: 'detail-desc', text: u.desc || '' }),
      h('dl', { class: 'detail-meta' },
        h('div', {}, h('dt', { class: 'micro', text: 'Cost' }), h('dd', { class: 'num' }, h('span', { class: 'ops-ico', html: icon('ops') }), `${u.cost} Ops`)),
        reqs.length ? h('div', {}, h('dt', { class: 'micro', text: 'Requires' }),
          h('dd', {}, reqs.map((r) => h('span', { class: `req ${this.game?.isOwned(r.id) ? 'req-ok' : ''}` },
            h('span', { html: icon(this.game?.isOwned(r.id) ? 'check' : 'lock') }), r.name)))) : null,
        u.unlocksAction ? h('div', {}, h('dt', { class: 'micro', text: 'Unlocks action' }),
          h('dd', { class: 'unlock' }, h('span', { html: icon('bolt') }), this.actionName.get(u.unlocksAction) || u.unlocksAction)) : null),
      state !== 'owned' && state !== 'buyable' && reason ? h('p', { class: 'reason' }, h('span', { html: icon('info') }), reason) : null,
      buy,
    ].filter(Boolean));
    this.detail.id = 'ks-tree-detail';
  }
}
