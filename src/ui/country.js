// Country panel (right column on desktop, bottom sheet on phones).
// Never reveals ground truth: infection numbers only when `detected`.
import { h, setText, setWidth, toggleClass, fmtNum, fmtPct, STATUS_LABEL, visibleStatus } from './util.js';
import { icon } from './icons.js';

export class CountryPanel {
  constructor(root, ui) {
    this.ui = ui;
    this.index = null;
    const $ = (this.$ = {});
    $.name = h('h2', { class: 'cp-name', id: 'ks-cp-name' });
    $.pill = h('span', { class: 'pill' });
    $.idx = h('span', { class: 'micro cp-idx' });
    $.pop = h('b', { class: 'num' });
    $.split = h('div', { class: 'cp-split' });
    $.segH = h('i', { class: 'split-seg seg-h' });
    $.segI = h('i', { class: 'split-seg seg-i' });
    $.segL = h('i', { class: 'split-seg seg-l' });
    $.numH = h('b', { class: 'num' });
    $.numI = h('b', { class: 'num' });
    $.numL = h('b', { class: 'num' });
    $.unknown = h('p', { class: 'cp-unknown' }, h('span', { html: icon('search') }),
      h('span', { text: 'No confirmed AI activity. That is either good news or very good hiding. Investigate to be sure.' }));
    $.split.append(
      h('div', { class: 'split' }, $.segH, $.segI, $.segL),
      h('div', { class: 'split-legend' },
        h('span', { class: 'lg lg-h' }, h('i'), h('span', { class: 'lg-l', text: 'Healthy' }), $.numH),
        h('span', { class: 'lg lg-i' }, h('i'), h('span', { class: 'lg-l', text: 'Infected' }), $.numI),
        h('span', { class: 'lg lg-l' }, h('i'), h('span', { class: 'lg-l', text: 'Lost' }), $.numL)));

    const metric = (label, cls) => {
      const fill = h('i', { class: 'mini-fill' });
      const val = h('b', { class: 'num' });
      const el = h('div', { class: `metric ${cls || ''}` }, h('span', { class: 'micro', text: label }), val, h('span', { class: 'mini' }, fill));
      return { el, fill, val };
    };
    $.digital = metric('Digital level', 'm-digital');
    $.trust = metric('Local trust', 'm-trust');
    $.labVal = h('b', { class: 'num' });
    $.labPips = [0, 1, 2].map(() => h('i', { class: 'pip' }));
    $.resVal = h('b', { class: 'num' });
    $.metrics = h('div', { class: 'metrics' },
      $.digital.el, $.trust.el,
      h('div', { class: 'metric m-lab' }, h('span', { class: 'micro', text: 'Research lab' }), $.labVal, h('span', { class: 'pips' }, $.labPips)),
      h('div', { class: 'metric m-res' }, h('span', { class: 'micro', text: 'Research / day' }), $.resVal));
    $.measures = h('div', { class: 'measures' });
    $.actions = h('div', { class: 'actions' });
    $.body = h('div', { class: 'cp-body' },
      h('div', { class: 'cp-pop' }, h('span', { class: 'micro', text: 'Population' }), $.pop),
      $.unknown, $.split, $.metrics,
      h('h3', { class: 'micro section-label', text: 'Active measures' }), $.measures,
      h('h3', { class: 'micro section-label', text: 'Actions' }), $.actions);
    $.empty = h('p', { class: 'cp-empty', text: 'Uninhabited. The penguins are holding firm.' });

    this.el = h('section', { class: 'panel country-panel glass-strong sheet', hidden: true, 'aria-labelledby': 'ks-cp-name', role: 'region' },
      h('div', { class: 'sheet-grip', 'aria-hidden': 'true' }),
      h('header', { class: 'cp-head' },
        h('div', { class: 'cp-titles' }, $.idx, $.name, $.pill),
        h('button', { class: 'btn btn-icon', type: 'button', 'aria-label': 'Close country panel', html: icon('close'), onclick: () => this.ui.cb.onSelectCountry?.(null) })),
      h('div', { class: 'cp-scroll' }, $.body, $.empty));
    root.append(this.el);
    this.actionRows = new Map();
    this.buildActions();
  }

  buildActions() {
    this.$.actions.replaceChildren();
    this.actionRows.clear();
    for (const a of this.ui.defs.actions || []) {
      const state = h('span', { class: 'act-state' });
      const meta = h('span', { class: 'act-meta num' });
      const reason = h('span', { class: 'act-reason' });
      const btn = h('button', {
        class: 'act', type: 'button', dataset: { id: a.id },
        onclick: () => {
          if (this.index == null) return;
          this.ui.cb.onCountryAction?.(this.index, a.id);
          this.lastKey = null;
          if (this.game) this.update(this.game);
        },
      },
        h('span', { class: 'act-ico', html: icon(a.icon) }),
        h('span', { class: 'act-main' },
          h('span', { class: 'act-name' }, h('span', { text: a.name }), state),
          h('span', { class: 'act-desc', text: a.desc || '' }),
          reason),
        meta);
      btn.title = a.desc || a.name;
      this.$.actions.append(btn);
      this.actionRows.set(a.id, { btn, state, meta, reason, a });
    }
  }

  bindGame(game) { this.game = game; }

  get isOpen() { return !this.el.hidden; }

  show(index) {
    this.index = index;
    if (index == null) { this.hide(); return; }
    this.el.hidden = false;
    this.el.scrollTop = 0;
    this.el.querySelector('.cp-scroll').scrollTop = 0;
    requestAnimationFrame(() => this.el.classList.add('is-in'));
    if (this.game) this.update(this.game);
  }

  hide() {
    this.index = null;
    this.el.classList.remove('is-in');
    this.el.hidden = true;
  }

  update(game) {
    this.game = game;
    if (this.index == null || this.el.hidden) return;
    const c = game.countries?.[this.index];
    if (!c) return;
    const $ = this.$;
    const vis = visibleStatus(c);
    setText($.name, c.name);
    setText($.idx, `Country file ${String(this.index).padStart(3, '0')}`);
    const playable = c.playable !== false && c.population > 0;
    $.body.hidden = !playable;
    $.empty.hidden = playable;
    $.pill.hidden = !playable;
    if (!playable) return;
    setText($.pill, STATUS_LABEL[vis] || vis);
    if ($.pill.dataset.status !== vis) $.pill.dataset.status = vis;
    setText($.pop, fmtNum(c.population));

    const detected = !!c.detected;
    $.split.hidden = !detected;
    $.unknown.hidden = detected;
    if (detected) {
      const pop = c.population || 1;
      const healthy = Math.max(0, c.population - c.infected - c.lost);
      setWidth($.segH, healthy / pop);
      setWidth($.segI, c.infected / pop);
      setWidth($.segL, c.lost / pop);
      setText($.numH, fmtNum(healthy));
      setText($.numI, fmtNum(c.infected));
      setText($.numL, fmtNum(c.lost));
    }
    setWidth($.digital.fill, c.digital);
    setText($.digital.val, fmtPct(c.digital));
    setWidth($.trust.fill, c.trust);
    setText($.trust.val, fmtPct(c.trust));
    toggleClass($.trust.el, 'is-low', c.trust < 0.35);
    const lab = c.labLevel || 0;
    setText($.labVal, lab ? `Level ${lab}` : 'None');
    $.labPips.forEach((p, i) => toggleClass(p, 'on', i < lab));
    const r = (c.research || 0) * 100;
    setText($.resVal, r > 0 ? `+${r < 0.01 ? r.toFixed(4) : r.toFixed(3)}%` : '0');

    // measures (chips)
    const m = [];
    if (c.quarantined) m.push(['lock', 'Network quarantine', 'm-quar']);
    if (c.shutdown) m.push(['power', 'Grid shutdown', 'm-shut']);
    if (lab) m.push(['lab', `Research lab L${lab}`, 'm-lab']);
    if (c.killSwitchDeployed) m.push(['check', 'Kill Switch deployed', 'm-ks']);
    const mKey = m.map((x) => x[1]).join('|');
    if (mKey !== this.mKey) {
      this.mKey = mKey;
      $.measures.replaceChildren(...(m.length
        ? m.map(([ic, t, cls]) => h('span', { class: `chip ${cls}` }, h('span', { html: icon(ic) }), t))
        : [h('span', { class: 'hint', text: 'None. Business as usual, for now.' })]));
    }

    // actions
    for (const { btn, state, meta, reason, a } of this.actionRows.values()) {
      const st = game.actionState?.(this.index, a.id) || 'locked';
      const can = game.canDoAction?.(this.index, a.id) || { ok: false };
      if (btn.dataset.state !== st) btn.dataset.state = st;
      const enabled = !!can.ok;
      if (btn.disabled === enabled) btn.disabled = !enabled;
      setText(state, st === 'active' ? 'Active' : a.toggle ? 'Toggle' : '');
      toggleClass(state, 'is-active', st === 'active');
      const parts = [];
      if (st === 'active' && a.toggle) parts.push('Lift');
      else {
        if (a.cost) parts.push(`${a.cost} ops`);
        if (a.trustCost) parts.push(`−${Math.round(a.trustCost * 100)}% trust`);
        if (!parts.length) parts.push('Free');
      }
      setText(meta, parts.join('\n'));
      setText(reason, !enabled && can.reason ? can.reason : '');
      reason.hidden = !(!enabled && can.reason);
      const label = `${a.name}${st === 'active' ? ' (active, click to lift)' : ''}${!enabled && can.reason ? `: ${can.reason}` : ''}`;
      if (btn.getAttribute('aria-label') !== label) btn.setAttribute('aria-label', label);
    }
  }
}
