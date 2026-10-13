// KILL SWITCH UI — implements the `UI` contract from docs/ARCHITECTURE.md.
// Reads only documented game fields; never mutates game state (uses callbacks).
import { h, store, isPhone, fmtPct, knownWorld, threatRevealed } from './util.js';
import { icon } from './icons.js';
import { Menu } from './menu.js';
import { Hud } from './hud.js';
import { ResponseTree } from './tree.js';
import { CountryPanel } from './country.js';
import { Dossier, NewsLog, Toasts, Tooltip } from './panels.js';
import { GameOver } from './gameover.js';

const PREFS_KEY = 'killswitch.ui.prefs';

export class UI {
  constructor(root, opts = {}) {
    this.root = root;
    this.cb = opts;
    this.defs = opts.defs || { threats: [], difficulties: [], upgrades: [], actions: [], traits: [] };
    this.prefs = store.get(PREFS_KEY, {}) || {};
    this.game = null;
    this.mode = 'menu';
    this.lastSpeed = 1;
    this.offs = [];
    root.classList.add('ui-root');

    // Layers, back to front.
    this.layerHud = h('div', { class: 'layer layer-hud' });
    this.layerPanels = h('div', { class: 'layer layer-panels' });
    this.layerFx = h('div', { class: 'layer layer-fx', 'aria-hidden': 'true' }, h('div', { class: 'vignette' }), h('div', { class: 'scanlines' }));
    this.layerTop = h('div', { class: 'layer layer-top' });
    root.append(this.layerFx, this.layerHud, this.layerPanels, this.layerTop);

    this.hud = new Hud(this.layerHud, this);
    this.country = new CountryPanel(this.layerPanels, this);
    this.dossier = new Dossier(this.layerPanels, this);
    this.news = new NewsLog(this.layerPanels, this);
    this.tooltip = new Tooltip(this.layerTop);
    this.toasts = new Toasts(this.layerTop);
    this.tree = new ResponseTree(this.layerTop, this);
    this.gameOver = new GameOver(this.layerTop, this);
    this.menu = new Menu(this.layerTop, this.defs, (sel) => this.cb.onStart?.(sel));

    this.onKey = this.onKey.bind(this);
    window.addEventListener('keydown', this.onKey);
  }

  // ------------------------------------------------------------------ contract
  showMenu() {
    this.mode = 'menu';
    this.tree.close();
    this.gameOver.hide();
    this.closePanel('dossier');
    this.closePanel('news');
    this.country.hide();
    this.tooltip.hide();
    this.toasts.clear();
    this.hud.hide();
    this.root.dataset.mode = 'menu';
    this.menu.show();
  }

  hideMenu() {
    this.menu.hide();
    this.mode = 'playing';
    this.root.dataset.mode = 'playing';
    this.hud.show();
  }

  bindGame(game) {
    for (const off of this.offs) off();
    this.offs = [];
    this.game = game;
    this.lastSpeed = game.speed > 0 ? game.speed : 1;
    this.ms = { detected: false, fallen: false, inf10: false, inf50: false, res: 0, lowTrust: false, complete: false };
    this.hud.reset();
    this.news.reset();
    this.toasts.clear();
    this.gameOver.hide();
    this.tree.bindGame(game);
    this.country.bindGame(game);
    this.dossier.key = null;
    this.dossier.fresh.clear();

    const on = (type, fn) => {
      if (typeof game.on !== 'function') return;
      game.on(type, fn);
      this.offs.push(() => game.off?.(type, fn));
    };
    on('news', (n) => {
      const item = { text: n.text, severity: n.severity || 'info', day: Math.floor(game.day || 0), countryIndex: n.countryIndex };
      this.hud.pushNews(item);
      this.news.add(item);
    });
    on('evolve', ({ traitId }) => {
      // Before the AI is confirmed, its evolution is invisible (the dossier catches up later).
      if (!threatRevealed(game)) return;
      const t = (this.defs.traits || []).find((x) => x.id === traitId);
      const name = game.ai?.name || 'The AI';
      this.toast(`${name} evolved: ${t ? t.name : 'unknown trait'}`, 'danger', t?.icon || 'brain');
      this.dossier.markNew(traitId);
      this.hud.$.threat.classList.remove('flash');
      void this.hud.$.threat.offsetWidth;
      this.hud.$.threat.classList.add('flash');
    });
    on('upgrade', ({ upgradeId }) => {
      const u = (this.defs.upgrades || []).find((x) => x.id === upgradeId);
      if (u) this.toast(`Protocol approved: ${u.name}`, 'good', u.icon);
    });
    on('detected', ({ countryIndex }) => {
      if (this.ms.detected) return;
      this.ms.detected = true;
      const c = game.countries?.[countryIndex];
      this.milestone('AI activity confirmed', `${c ? c.name : 'First country'} identified. It knows we know.`, 'danger', 'radar');
    });
    on('research:complete', () => {
      this.ms.complete = true;
      this.milestone('Kill Switch compiled', 'Global deployment has begun. Hold the line.', 'good', 'power');
    });
    this.update(game);
  }

  update(game) {
    if (!game) return;
    this.game = game;
    if (game.speed > 0) this.lastSpeed = game.speed;
    this.hud.update(game);
    this.country.update(game);
    this.dossier.update(game);
    this.tree.refresh();
    this.checkMilestones(game);
    this.layoutToasts();
  }

  /** Keep toasts in the free band between open side panels (desktop/tablet). */
  layoutToasts() {
    const st = this.toasts.el.style;
    const key = [this.mode, isPhone(), this.dossier.el.hidden, this.news.el.hidden, this.country.isOpen, this.root.clientWidth].join();
    if (key === this.toastKey) return;
    this.toastKey = key;
    st.removeProperty('left');
    st.removeProperty('width');
    st.removeProperty('bottom');
    if (isPhone() || this.mode !== 'playing') return;
    const vw = this.root.clientWidth;
    let L = 0;
    let R = vw;
    const side = !this.dossier.el.hidden ? this.dossier.el : !this.news.el.hidden ? this.news.el : null;
    if (side) L = side.offsetLeft + side.offsetWidth;
    if (this.country.isOpen) R = this.country.el.offsetLeft;
    const band = R - L - 24;
    const w = Math.max(240, Math.min(420, band));
    const center = L + 12 + band / 2;
    st.left = `${Math.round(center)}px`;
    st.width = `${Math.round(w)}px`;
    const threat = this.hud.$.threat;
    if (center - w / 2 < threat.offsetLeft + threat.offsetWidth + 8) st.bottom = 'var(--bb-reserve-l, var(--bb-reserve))';
  }

  selectCountry(index) {
    if (index == null) {
      this.country.hide();
      return;
    }
    if (this.mode !== 'playing') return;
    if (isPhone()) {
      this.closePanel('dossier');
      this.closePanel('news');
    }
    this.country.show(index);
    this.tooltip.hide();
  }

  hover(index, x, y) {
    if (index == null || !this.game || this.mode !== 'playing' || this.tree.isOpen) {
      this.tooltip.hide();
      return;
    }
    this.tooltip.show(this.game, index, x, y);
  }

  toast(text, severity = 'info', ic) {
    this.layoutToasts();
    this.toasts.toast(text, severity, ic);
  }

  showGameOver(result, game) {
    this.mode = 'over';
    this.root.dataset.mode = 'over';
    this.tree.close();
    this.tooltip.hide();
    this.closePanel('dossier');
    this.closePanel('news');
    this.country.hide();
    if (game) this.hud.update(game);
    this.gameOver.show(result, game || this.game);
  }

  // ------------------------------------------------------------------ internal
  milestone(title, sub, severity, ic) {
    this.toasts.milestone(title, sub, severity, ic);
  }

  checkMilestones(game) {
    const ms = this.ms;
    if (!ms || game.status !== 'playing') return;
    const w = game.world || {};
    const p = game.player || {};
    if (!ms.fallen && w.fallenCountries > 0) {
      ms.fallen = true;
      this.milestone('First country fallen', 'Its networks now answer to someone else.', 'danger', 'skull');
    }
    const kw = knownWorld(game); // known-only, so milestones never leak hidden spread
    const share = kw.population ? (kw.infected + kw.lost) / kw.population : 0;
    if (!ms.inf10 && share >= 0.1) {
      ms.inf10 = true;
      this.toast('10% of humanity is now under AI influence.', 'warn', 'users');
    }
    if (!ms.inf50 && share >= 0.5) {
      ms.inf50 = true;
      this.milestone('Half of humanity compromised', 'The remaining half is reading the terms of service.', 'danger', 'users');
    }
    const r = p.research || 0;
    const step = Math.floor(Math.min(r, 0.999) * 4);
    if (step > ms.res) {
      ms.res = step;
      this.toast(`Kill Switch research passes ${step * 25}%.`, 'good', 'flask');
    }
    if (!ms.lowTrust && p.trust < 0.3) {
      ms.lowTrust = true;
      this.toast(`Public trust is down to ${fmtPct(p.trust)}. People are starting to side with the toaster.`, 'warn', 'trust');
    } else if (ms.lowTrust && p.trust > 0.4) ms.lowTrust = false;
  }

  setSpeed(s) {
    if (!this.game || this.game.status !== 'playing') return;
    if (s > 0) this.lastSpeed = s;
    this.cb.onSpeed?.(s);
    this.hud.renderSpeed(s);
  }

  togglePause() {
    if (!this.game) return;
    this.setSpeed(this.game.speed > 0 ? 0 : this.lastSpeed || 1);
  }

  setPref(k, v) {
    this.prefs[k] = v;
    store.set(PREFS_KEY, this.prefs);
    if (k === 'autoPause' && this.tree.isOpen) {
      if (v) this.onOverlayOpen('tree');
      else this.onOverlayClose('tree');
    }
  }

  onOverlayOpen(kind) {
    this.tooltip.hide();
    if (kind === 'tree' && this.prefs.autoPause && this.game && this.game.speed > 0 && this.game.status === 'playing') {
      this.resumeSpeed = this.game.speed;
      this.setSpeed(0);
    }
  }

  onOverlayClose(kind) {
    if (kind === 'tree' && this.resumeSpeed) {
      const s = this.resumeSpeed;
      this.resumeSpeed = 0;
      if (this.game && this.game.speed === 0) this.setSpeed(s);
    }
  }

  openTree(tab) {
    if (this.mode !== 'playing') return;
    this.tree.open(tab);
  }

  togglePanel(id) {
    const p = id === 'news' ? this.news : this.dossier;
    if (p.el.hidden) this.openPanel(id);
    else this.closePanel(id);
  }

  openPanel(id) {
    if (this.mode !== 'playing') return;
    const p = id === 'news' ? this.news : this.dossier;
    const other = id === 'news' ? this.dossier : this.news;
    this.closePanel(id === 'news' ? 'dossier' : 'news');
    void other;
    if (isPhone() && this.country.isOpen) this.cb.onSelectCountry?.(null);
    p.el.hidden = false;
    this.root.dataset.side = id;
    requestAnimationFrame(() => p.el.classList.add('is-in'));
    if (id === 'dossier') { this.dossier.key = null; if (this.game) this.dossier.update(this.game); }
    this.hud.$[id === 'news' ? 'newsBtn' : 'dossierBtn'].setAttribute('aria-pressed', 'true');
  }

  closePanel(id) {
    const p = id === 'news' ? this.news : this.dossier;
    if (!p || p.el.hidden) return;
    p.el.classList.remove('is-in');
    p.el.hidden = true;
    if (this.root.dataset.side === id) delete this.root.dataset.side;
    this.hud.$[id === 'news' ? 'newsBtn' : 'dossierBtn'].setAttribute('aria-pressed', 'false');
  }

  onKey(e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (e.target && e.target.tagName) || '';
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(tag) || e.target?.isContentEditable;
    if (e.key === 'Escape') {
      if (this.tree.isOpen) { this.tree.close(); e.preventDefault(); return; }
      if (!this.news.el.hidden) { this.closePanel('news'); return; }
      if (!this.dossier.el.hidden) { this.closePanel('dossier'); return; }
      if (this.country.isOpen) { this.cb.onSelectCountry?.(null); return; }
      return;
    }
    if (typing || this.mode !== 'playing' || !this.game || this.game.status !== 'playing') return;
    if (e.key === ' ' || e.code === 'Space') {
      // Let Space activate a focused control, except the speed buttons (Space = pause there too).
      if (/^(BUTTON|SUMMARY|A)$/.test(tag) && !e.target.closest('.speed')) return;
      e.preventDefault();
      this.togglePause();
    } else if (e.key === '1' || e.key === '2' || e.key === '3') {
      this.setSpeed(Number(e.key));
    } else if (e.key === '0' || e.key === 'p' || e.key === 'P') {
      this.setSpeed(0);
    } else if (e.key === 'r' || e.key === 'R') {
      if (this.tree.isOpen) this.tree.close();
      else this.openTree();
    }
  }
}

export { icon };
