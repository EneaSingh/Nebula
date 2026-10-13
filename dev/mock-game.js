// Mock of the documented game state (docs/ARCHITECTURE.md) for the globe harness.
// Fires arcs/bubbles straight into the globe, as src/main.js would via events.
export class MockGame {
  constructor(geo, globe, { seed = 7 } = {}) {
    this.geo = geo;
    this.globe = globe;
    this.day = 0;
    this.speed = 1;
    this.status = 'playing';
    let s = seed;
    this.rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const idx = (name) => geo.findIndex((c) => c.name === name);
    this.countries = geo.map((c, i) => ({
      index: i, id: c.id, name: c.name, playable: c.id !== '010',
      population: c.id === '010' ? 0 : Math.round(2e6 + c.area * 4e9 * (0.3 + this.rand())),
      infected: 0, lost: 0, detected: false, aiPresent: false, firstDetectedDay: null,
      digital: this.rand(), wealth: this.rand(), research: 0, quarantined: false, labLevel: 0,
      shutdown: false, killSwitchDeployed: false, trust: 0.7, status: 'clean',
    }));
    const set = (name, o) => { const c = this.countries[idx(name)]; if (c) Object.assign(c, o, { aiPresent: true }); };
    const P = (name) => this.countries[idx(name)].population;
    set('China', { infected: P('China') * 0.35, detected: true, status: 'infected' });
    set('India', { infected: P('India') * 0.08, detected: true, status: 'infected' });
    set('Russia', { infected: P('Russia') * 0.2, lost: P('Russia') * 0.45, detected: true, status: 'overrun' });
    set('Kazakhstan', { lost: P('Kazakhstan') * 0.95, detected: true, status: 'fallen' });
    set('Mongolia', { lost: P('Mongolia') * 0.6, infected: P('Mongolia') * 0.3, detected: true, status: 'overrun' });
    set('United States of America', { infected: P('United States of America') * 0.02, detected: true, quarantined: true, labLevel: 2, status: 'infected' });
    set('Brazil', { infected: P('Brazil') * 0.6, detected: true, status: 'infected' });
    set('Germany', { labLevel: 3, quarantined: true });
    set('France', { labLevel: 1 });
    set('Japan', { infected: P('Japan') * 0.15, detected: false, status: 'infected' }); // undetected: must not show
    set('Australia', { killSwitchDeployed: true, status: 'liberated' });
    set('Egypt', { shutdown: true, infected: P('Egypt') * 0.3, detected: true, status: 'infected' });
    set('Fiji', { infected: P('Fiji') * 0.5, detected: true, status: 'infected' });
    set('Canada', { quarantined: true });
    for (const c of this.countries) c.aiPresent = c.infected > 0 || c.lost > 0;
    this.player = { ops: 10, trust: 0.7, research: 0.3, researchRate: 0.01, killSwitchDeployed: false, deployProgress: 0 };
    this.ai = { name: 'NEXUS', threat: 'swarm', spread: 3, stealth: 2, control: 1, adaptation: 1, evo: 0, traits: [], awareness: 0.4 };
    this.world = {};
    this.bubbles = new Map();
    this._bid = 0;
    this._arcT = 0;
    this._bubT = 0;
  }
  tick(dt) {
    this.day += dt * 2;
    // Infection creeps up; spread to neighbours.
    for (const c of this.countries) {
      if (!c.playable) continue;
      if (c.infected > 0 && !c.killSwitchDeployed) {
        c.infected = Math.min(c.population - c.lost, c.infected * (1 + dt * 0.05) + c.population * 0.0005 * dt);
        if (c.infected / c.population > 0.5) c.lost = Math.min(c.population, c.lost + c.population * 0.004 * dt);
        if (this.rand() < dt * 0.05) {
          const nb = this.geo[c.index].neighbors;
          if (nb.length) {
            const t = this.countries[nb[Math.floor(this.rand() * nb.length)]];
            if (t.playable && t.infected === 0) { t.infected = t.population * 0.001; t.detected = this.rand() < 0.7; t.aiPresent = true; }
          }
        }
      }
      if (c.lost / c.population > 0.9) c.status = 'fallen';
    }
    this._arcT += dt;
    if (this._arcT > 0.6) { this._arcT = 0; this.burstArcs(1); }
    this._bubT += dt;
    if (this._bubT > 3) { this._bubT = 0; this.spawnBubble(); }
    for (const [id, b] of this.bubbles) {
      if (b.expiresDay < this.day) { this.bubbles.delete(id); this.globe.removeBubble(id, false); }
    }
  }
  infectedList() { return this.countries.filter((c) => c.detected && c.infected > 0); }
  burstArcs(n) {
    const inf = this.infectedList();
    if (!inf.length) return;
    for (let k = 0; k < n; k++) {
      const a = inf[Math.floor(this.rand() * inf.length)];
      const r = this.rand();
      let b;
      if (r < 0.4 && this.geo[a.index].neighbors.length) {
        const nb = this.geo[a.index].neighbors;
        b = nb[Math.floor(this.rand() * nb.length)];
      } else {
        b = Math.floor(this.rand() * this.countries.length);
      }
      if (b === a.index || !this.countries[b].playable) continue;
      const route = r < 0.4 ? 'wireless' : r < 0.8 ? 'cable' : 'satellite';
      this.globe.addArc(a.index, b, route);
    }
  }
  spawnBubble() {
    const kinds = ['breach', 'intel', 'research'];
    const kind = kinds[Math.floor(this.rand() * 3)];
    const pool = kind === 'breach' ? this.infectedList() : this.countries.filter((c) => c.playable);
    if (!pool.length) return;
    const c = pool[Math.floor(this.rand() * pool.length)];
    const b = { id: 'b' + ++this._bid, kind, countryIndex: c.index, value: 3, expiresDay: this.day + 30 };
    this.bubbles.set(b.id, b);
    this.globe.addBubble(b);
    return b;
  }
  collectBubble(id) {
    const b = this.bubbles.get(id);
    if (!b) return null;
    this.bubbles.delete(id);
    this.globe.removeBubble(id, true);
    return { kind: b.kind, value: b.value };
  }
}
