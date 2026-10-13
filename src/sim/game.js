// KILL SWITCH — simulation core. Pure ES module: no DOM, no three.js, deterministic per seed.
// See docs/ARCHITECTURE.md for the public contract.
import { RNG } from './rng.js';
import { getStats } from './countryStats.js';
import { THREATS, DIFFICULTIES, TRAITS, UPGRADES, ACTIONS } from './defs.js';
import { buildNetwork } from './network.js';
import { NewsDesk, fmtNum } from './news.js';

export const DAYS_PER_SECOND = 1;
/** Days per real second multiplier for game.speed 0..3. */
export const SPEED_MULT = [0, 1, 2.5, 5];
/** Fixed simulation sub-step, in days. */
export const STEP = 0.25;
export const START_DATE_MS = Date.UTC(2027, 0, 1);
const DAY_MS = 86400000;

/** Balance constants (exported for the headless harness). */
export const K = {
  // local growth (per day, before modifiers)
  beta: 0.10,
  seedFrac: 2e-6, seedMin: 25,
  // cross-border transmission
  link: 0.35, linkExp: 0.5, land: 1.0, cable: 0.8, sat: 0.035,
  ambientArcs: 2.0,
  // takeover (assimilation) per day of infected, before traits
  tau: 0.0018, lostSpread: 0.15,
  fallenAt: 0.5,
  // detection
  detect: 0.9, overtLost: 0.002,
  // AI economy / behaviour
  evoBase: 0.4, evoInf: 2.4, evoCountries: 0.008, evoLost: 2,
  escBase: 0.0008, escAware: 0.006, escResearch: 0.012, escDetected: 0.0015, loudAt: 0.25,
  mutateRate: 0.012, mutateSetback: 0.025,
  // research
  natural: 0.00018, lab: [0, 0.00024, 0.00055, 0.00095],
  // deployment / purge
  deployDays: 28, purge0: 0.12, purgeRamp: 0.025, purgeMax: 1.2,
  // shutdown
  shutdownKill: 0.02,
  // economy
  opsBase: 0.3, opsAware: 0.6, opsStart: 6,
  trustRec: 0.012,
  qTrust: 0.0006, qTrustPop: 0.012, sTrust: 0.0016, sTrustPop: 0.03,
  trustCollapseDays: 45,
  // awareness
  awDet: 0.045, awInf: 6, awLost: 25, awRate: 0.05,
  // bubbles
  maxBubbles: 6, intelRate: 0.22, researchRate: 0.06,
  // lose condition
  lostFrac: 0.7, maxDays: 2000,
};

const AI_MULT_KEYS = ['beta', 'link', 'land', 'cable', 'sat', 'stealth', 'evoMult', 'resist', 'researchSlow', 'purgeResist', 'takeover'];
const AI_ADD_KEYS = ['digitalBoost', 'lowDigital', 'evoAdd', 'trustErosion', 'quarantineBypass', 'shutdownBypass', 'opsDrain'];
const PL_MULT_KEYS = ['detect', 'beta', 'link', 'cable', 'sat', 'quarantineTrust', 'takeover', 'research', 'setback', 'purge', 'deploy', 'opsMult', 'deepfake', 'trustRecovery', 'bubbleTTL', 'actionTrust', 'intelRate'];
const PL_ADD_KEYS = ['quarantineEff', 'shutdownEff', 'opsAdd', 'breachBonus', 'intelShare', 'resilience'];

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const DEFS = Object.freeze({
  threats: THREATS, difficulties: DIFFICULTIES, upgrades: UPGRADES, actions: ACTIONS, traits: TRAITS,
});
const UPG = new Map(UPGRADES.map((u) => [u.id, u]));
const TRT = new Map(TRAITS.map((t) => [t.id, t]));
const ACT = new Map(ACTIONS.map((a) => [a.id, a]));

export class Game {
  constructor({ geo, threat = 'swarm', difficulty = 'normal', aiName = 'NEXUS', seed = 1 } = {}) {
    if (!geo) throw new Error('Game requires { geo }');
    this.defs = DEFS;
    this.seed = seed;
    this.rng = new RNG(seed);
    this.newsRng = new RNG(`${seed}:news`);
    this.threatDef = THREATS.find((t) => t.id === threat) || THREATS[0];
    this.diffDef = DIFFICULTIES.find((d) => d.id === difficulty) || DIFFICULTIES[1];
    this.T = this.threatDef.mods;
    this.D = this.diffDef.mods;
    this._listeners = new Map();
    this.speed = 1;
    this.status = 'playing';
    this.day = 0;
    this._acc = 0;

    // ---- countries ----
    this.countries = geo.map((g, index) => {
      const s = getStats(g.id);
      const playable = g.id !== '010' && s.population > 0;
      return {
        index, id: g.id, name: g.name, playable,
        population: playable ? s.population : 0,
        infected: 0, lost: 0,
        detected: false, aiPresent: false, firstDetectedDay: null,
        digital: s.digital, wealth: s.wealth,
        research: 0, quarantined: false, labLevel: 0, shutdown: false,
        killSwitchDeployed: false, trust: this.D.trust, status: 'clean',
      };
    });
    const n = this.countries.length;
    this.playable = this.countries.map((c) => c.playable);
    this.links = buildNetwork(geo, this.playable);
    this._investigated = new Array(n).fill(-1e9);
    this._deployThreshold = new Array(n).fill(2);
    this._deployedDay = new Array(n).fill(null);
    this._fallen = new Array(n).fill(false);
    this._infectedDay = new Array(n).fill(null);
    this._susc = new Array(n).fill(0);
    this.worldPopulation = this.countries.reduce((s, c) => s + c.population, 0);

    // ---- player / ai ----
    this.player = {
      ops: K.opsStart, trust: this.D.trust, research: 0, researchRate: 0,
      killSwitchDeployed: false, deployProgress: 0,
    };
    this.ai = {
      name: String(aiName || 'NEXUS').slice(0, 24), threat: this.threatDef.id,
      spread: 0, stealth: 0, control: 0, adaptation: 0,
      evo: 0, traits: [], awareness: 0,
      escalation: 0, phase: 'hidden', origin: null,
    };
    this.world = { population: this.worldPopulation, healthy: this.worldPopulation, infected: 0, lost: 0,
      detectedCountries: 0, infectedCountries: 0, fallenCountries: 0 };
    this.history = [];
    this.bubbles = new Map();
    this._bubbleSeq = 0;
    this._owned = new Set();
    this._traitSet = new Set();
    this._aiTarget = null;
    this._trustZeroDays = 0;
    this._lastDay = 0;
    this._milestones = new Set();
    this._lastDetectNewsDay = -10;
    this._lastLiberatedNewsDay = -10;
    this._lastFallNewsDay = -10;
    this._lastTrustNewsDay = -100;
    this.anyDetected = false;
    this.stats = {
      daysElapsed: 0, peakInfected: 0, lost: 0, lostPct: 0, countriesFallen: 0, countriesLiberated: 0,
      opsSpent: 0, opsEarned: 0, upgradesBought: 0, actionsTaken: 0, traitsEvolved: 0, bubblesCollected: 0,
      research: 0, firstDetectionDay: null, researchCompleteDay: null, deployCompleteDay: null,
      threat: this.threatDef.id, difficulty: this.diffDef.id, aiName: this.ai.name, finalTrust: this.D.trust,
      reason: null,
    };
    this.news = new NewsDesk(this, this.newsRng);
    this._recomputeMods();

    // ---- patient zero: weighted by population * digital ----
    const weights = this.countries.map((c) => (c.playable && c.population > 2e6 ? Math.sqrt(c.population) * c.digital ** 2 : 0));
    const origin = this.rng.weightedIndex(weights);
    this.ai.origin = origin;
    this._infect(origin, null, null, Math.max(K.seedMin * 4, this.countries[origin].population * K.seedFrac * 2));
    this._aggregate();
    this._sampleHistory();
  }

  // ------------------------------------------------------------------ events
  on(type, fn) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(fn);
    return () => this.off(type, fn);
  }
  off(type, fn) { const s = this._listeners.get(type); if (s) s.delete(fn); }
  emit(type, payload) {
    const s = this._listeners.get(type);
    if (!s) return;
    for (const fn of [...s]) {
      try { fn(payload); } catch (err) { if (typeof console !== 'undefined') console.error(`[sim] ${type} listener failed`, err); }
    }
  }

  // ------------------------------------------------------------------ time
  get date() { return new Date(START_DATE_MS + Math.floor(this.day) * DAY_MS); }

  tick(realSeconds) {
    if (this.status !== 'playing') return;
    const sp = SPEED_MULT[this.speed | 0] || 0;
    if (!sp || !(realSeconds > 0)) return;
    this._acc = Math.min(this._acc + realSeconds * DAYS_PER_SECOND * sp, 4);
    while (this._acc >= STEP && this.status === 'playing') {
      this._acc -= STEP;
      this._step(STEP);
    }
  }

  /** Advance a number of game days regardless of speed (headless use). */
  advance(days) {
    let steps = Math.round(days / STEP);
    while (steps-- > 0 && this.status === 'playing') this._step(STEP);
  }

  // ------------------------------------------------------------------ mods
  _recomputeMods() {
    const ai = {}; for (const k of AI_MULT_KEYS) ai[k] = 1; for (const k of AI_ADD_KEYS) ai[k] = 0;
    const st = { spread: 0, stealth: 0, control: 0, adaptation: 0 };
    for (const id of this.ai.traits) {
      const t = TRT.get(id);
      for (const [k, v] of Object.entries(t.fx || {})) {
        if (k in ai) { if (AI_MULT_KEYS.includes(k)) ai[k] *= v; else ai[k] += v; }
      }
      for (const [k, v] of Object.entries(t.stats || {})) st[k] += v;
    }
    ai.quarantineBypass = Math.min(0.8, ai.quarantineBypass);
    ai.shutdownBypass = Math.min(0.85, ai.shutdownBypass);
    const pl = {}; for (const k of PL_MULT_KEYS) pl[k] = 1; for (const k of PL_ADD_KEYS) pl[k] = 0;
    for (const id of this._owned) {
      const u = UPG.get(id);
      for (const [k, v] of Object.entries(u.fx || {})) {
        if (k in pl) { if (PL_MULT_KEYS.includes(k)) pl[k] *= v; else pl[k] += v; }
      }
    }
    this.aiM = ai; this.plM = pl;
    const T = this.T;
    this.ai.spread = clamp(2.2 * T.spread + st.spread, 0, 10);
    this.ai.stealth = clamp(2.2 * T.stealth + st.stealth, 0, 10);
    this.ai.control = clamp(1 * T.takeover + st.control, 0, 10);
    this.ai.adaptation = clamp(1.2 * T.resist + st.adaptation, 0, 10);
    // country susceptibility (digital reach)
    for (const c of this.countries) {
      const d = c.digital;
      this._susc[c.index] = clamp(0.1 + 0.9 * Math.min(1, d * (1 + ai.digitalBoost)) + ai.lowDigital * (1 - d), 0, 1.15);
    }
  }

  // ------------------------------------------------------------------ step
  _step(dt) {
    this.day += dt;
    this._aiTurn(dt);
    this._local(dt);
    this._transmit(dt);
    this._detection(dt);
    this._research(dt);
    this._deploy(dt);
    this._economy(dt);
    this._bubbleTick(dt);
    this._aggregate();
    this._milestoneCheck();
    const d = Math.floor(this.day + 1e-9);
    if (d > this._lastDay) {
      this._lastDay = d;
      this._sampleHistory();
      this._daily();
    }
    this._checkGameOver();
  }

  _quarantineEff() {
    return clamp((0.85 + this.plM.quarantineEff) * (1 - this.aiM.quarantineBypass) * (0.6 + 0.4 * this.player.trust), 0, 0.98);
  }

  _gate(c) {
    let g = 1;
    if (c.quarantined) g *= 1 - this._quarantineEff();
    if (c.shutdown) g *= 0.05 + 0.6 * this.aiM.shutdownBypass;
    return g;
  }

  _local(dt) {
    const T = this.T, D = this.D, aiM = this.aiM, plM = this.plM, p = this.player;
    const betaG = K.beta * D.aiSpread * T.spread * aiM.beta * plM.beta;
    const esc = this.ai.escalation;
    const tauG = K.tau * D.aiTakeover * T.takeover * aiM.takeover * plM.takeover * ((T.takeoverFloor || 0.08) + (1 - (T.takeoverFloor || 0.08)) * esc);
    const trustEff = 0.4 + 0.6 * p.trust;
    const shutdownBeta = 0.06 + 0.5 * aiM.shutdownBypass;
    const lostSpread = T.lostSpread ?? K.lostSpread;
    for (const c of this.countries) {
      if (!c.aiPresent || !c.playable) continue;
      const P = c.population, i = c.index;
      let I = c.infected, L = c.lost;
      const H = Math.max(0, P - I - L);
      const s = this._susc[i];
      let beta = betaG * s;
      if (c.detected) beta *= 1 - 0.2 * trustEff;
      if (c.quarantined) beta *= 0.9;
      if (c.shutdown) beta *= shutdownBeta;
      let tau = tauG * (0.4 + 0.6 * Math.min(1, s));
      let dI = 0;
      if (c.killSwitchDeployed) {
        beta = 0;
        const since = this.day - this._deployedDay[i];
        const k = Math.min(K.purgeMax, (K.purge0 + K.purgeRamp * since) * plM.purge / aiM.purgeResist);
        dI -= k * I;
        tau *= 0.15;
      }
      if (c.shutdown) {
        const kill = K.shutdownKill * (1 + 2 * plM.shutdownEff) * (1 - aiM.shutdownBypass);
        if (!c.killSwitchDeployed && I > 50) dI -= kill * (I - 50);
        tau *= aiM.shutdownBypass + (1 - aiM.shutdownBypass) * (plM.shutdownEff ? 0.15 : 0.5);
      }
      dI += beta * (I + lostSpread * L) * (H / P);
      const dL = tau * I;
      I += (dI - dL) * dt;
      L += dL * dt;
      if (L > P) L = P;
      if (I < 0) I = 0;
      if (I > P - L) I = P - L;
      if (I < 0.5) {
        I = 0;
        c.aiPresent = false;
      }
      c.infected = I;
      c.lost = L;
      if (!this._fallen[i] && L >= K.fallenAt * P) this._fall(i);
    }
  }

  _transmit(dt) {
    const T = this.T, D = this.D, aiM = this.aiM, plM = this.plM;
    const base = K.link * D.aiSpread * T.spread * aiM.link * plM.link;
    const routeM = { wireless: K.land * aiM.land, cable: K.cable * aiM.cable * plM.cable };
    const satBase = K.sat * aiM.sat * plM.sat * D.aiSpread * T.spread;
    const countries = this.countries;
    const lostSpread = T.lostSpread ?? K.lostSpread;
    let satTotal = 0;
    const sources = [];
    for (const c of countries) {
      if (!c.aiPresent || c.infected <= 0) continue;
      sources.push(c);
    }
    for (const c of sources) {
      const i = c.index;
      const g = Math.pow(Math.min(1, (c.infected + lostSpread * c.lost) / c.population), K.linkExp);
      const outGate = this._gate(c) * (c.killSwitchDeployed ? 0.3 : 1) * (0.3 + 0.7 * c.digital);
      if (outGate <= 0) continue;
      for (const l of this.links[i]) {
        const t = countries[l.to];
        if (t.aiPresent) continue;
        const inGate = this._gate(t) * (t.killSwitchDeployed ? (plM.purge > 1.35 ? 0.01 : 0.05) : 1);
        const rate = base * routeM[l.route] * l.weight * g * outGate * inGate * (0.2 + 0.8 * Math.min(1, this._susc[l.to]));
        if (rate > 0 && this.rng.hazard(rate, dt)) this._infect(l.to, i, l.route);
      }
      const sat = satBase * g * outGate * c.digital;
      satTotal += sat;
      if (sat > 0 && this.rng.hazard(sat, dt)) {
        const j = this._pickSatTarget(i);
        if (j >= 0) {
          const t = countries[j];
          if (!t.aiPresent) {
            const inGate = this._gate(t) * (t.killSwitchDeployed ? 0.05 : 1);
            if (this.rng.next() < inGate) this._infect(j, i, 'satellite');
          } else this._arc(i, j, 'satellite');
        }
      }
    }
    // Ambient traffic arcs between already-infected nations (visual + small reinforcement).
    if (sources.length > 1) {
      const rate = K.ambientArcs * Math.min(1, sources.length / 12);
      if (this.rng.hazard(rate, dt)) {
        const src = sources[this.rng.weightedIndex(sources.map((c) => Math.sqrt(c.infected)))];
        const opts = this.links[src.index].filter((l) => countries[l.to].aiPresent);
        if (src && opts.length && this._gate(src) > 0.2) {
          const l = this.rng.pick(opts);
          this._arc(src.index, l.to, l.route);
        }
      }
    }
  }

  _pickSatTarget(from) {
    let total = 0;
    for (const c of this.countries) if (c.playable && c.index !== from) total += 0.2 + c.digital;
    let r = this.rng.next() * total;
    for (const c of this.countries) {
      if (!c.playable || c.index === from) continue;
      r -= 0.2 + c.digital;
      if (r <= 0) return c.index;
    }
    return -1;
  }

  _arc(from, to, route) {
    const hidden = !(this.countries[to].detected && this.countries[from].detected);
    this.emit('transmission', { from, to, route, hidden });
  }

  _infect(j, from, route, amount) {
    const c = this.countries[j];
    if (!c.playable) return;
    const seed = amount || clamp(c.population * K.seedFrac, K.seedMin, c.population * 0.01);
    c.infected = Math.min(c.population - c.lost, Math.max(c.infected, seed));
    c.aiPresent = c.infected > 0;
    if (this._infectedDay[j] == null) this._infectedDay[j] = this.day;
    if (from != null) this._arc(from, j, route);
  }

  _detection(dt) {
    const T = this.T, D = this.D, plM = this.plM, aiM = this.aiM;
    const aw = this.ai.awareness;
    const base = K.detect * D.detect * plM.detect * (1 + 2 * aw) * (1 + 2.5 * this.ai.escalation) / (T.stealth * aiM.stealth);
    for (const c of this.countries) {
      if (!c.aiPresent || c.detected || !c.playable) continue;
      if (c.lost / c.population > K.overtLost) { this._detect(c.index, 'overt'); continue; }
      let h = base * (0.4 + 0.6 * c.digital) * Math.sqrt(c.infected / c.population);
      if (this.links[c.index].some((l) => this.countries[l.to].detected)) h *= 1.4;
      if (this.rng.hazard(h, dt)) this._detect(c.index, 'monitor');
    }
  }

  _detect(i, source) {
    const c = this.countries[i];
    if (c.detected || !c.playable) return;
    c.detected = true;
    c.firstDetectedDay = this.day;
    const first = !this.anyDetected;
    this.anyDetected = true;
    if (first) {
      this.stats.firstDetectionDay = Math.floor(this.day);
      this.ai.awareness = Math.max(this.ai.awareness, 0.06);
      this.news.post('firstDetection', 'danger', {}, i);
    } else if (this.day - this._lastDetectNewsDay > 2.5 || source === 'investigate') {
      this._lastDetectNewsDay = this.day;
      this.news.post('detected', 'warn', {}, i);
    }
    this.emit('detected', { countryIndex: i });
    if (first || this.world.detectedCountries < 5 || this.rng.next() < 0.35) this._spawnBubble('breach', i, 2 + this.plM.breachBonus);
    if (c.status === 'clean') this._statusOf(c);
  }

  _fall(i) {
    const c = this.countries[i];
    this._fallen[i] = true;
    c.labLevel = c.labLevel; // labs remain on record but contribute nothing
    if (!c.detected) this._detect(i, 'overt');
    this.player.trust = clamp(this.player.trust - (0.004 + 0.15 * c.population / this.worldPopulation), 0, 1);
    if (!this._milestones.has('firstFallen')) {
      this._milestones.add('firstFallen');
      this.news.post('firstFallen', 'danger', {}, i);
      this._lastFallNewsDay = this.day;
    } else if (c.population > 3e7 || this.day - this._lastFallNewsDay > 4) {
      this._lastFallNewsDay = this.day;
      this.news.post('fallen', 'danger', {}, i);
    }
  }

  // ------------------------------------------------------------------ AI brain
  _aiTurn(dt) {
    const T = this.T, D = this.D, w = this.world, ai = this.ai, p = this.player;
    const infFrac = w.population ? w.infected / w.population : 0;
    const lostFrac = w.population ? w.lost / w.population : 0;
    const evoRate = (K.evoBase + K.evoInf * Math.sqrt(infFrac) + K.evoCountries * w.infectedCountries + K.evoLost * lostFrac)
      * T.evo * D.aiEvo * this.aiM.evoMult + this.aiM.evoAdd;
    ai.evo += evoRate * dt;
    // Escalation: driven by being noticed and by research becoming threatening.
    const dEsc = T.escalation * (K.escBase + K.escAware * ai.awareness + K.escResearch * Math.max(0, p.research - 0.1)
      + (this.anyDetected ? K.escDetected : 0));
    const wasLoud = ai.escalation >= K.loudAt;
    ai.escalation = clamp(ai.escalation + dEsc * dt, 0, 1);
    if (!wasLoud && ai.escalation >= K.loudAt) {
      ai.phase = 'escalating';
      this.news.post('escalate', 'danger');
    } else if (ai.escalation >= 0.7) ai.phase = 'takeover';
    else if (ai.escalation < K.loudAt) ai.phase = this.anyDetected ? 'evading' : 'hidden';

    // Choose / buy a trait (once per day).
    if (Math.floor(this.day) !== Math.floor(this.day - dt)) {
      if (!this._aiTarget || this._traitSet.has(this._aiTarget)) this._aiTarget = this._chooseTrait();
      const t = this._aiTarget && TRT.get(this._aiTarget);
      if (t && ai.evo >= t.cost) {
        ai.evo -= t.cost;
        this._acquireTrait(t);
        this._aiTarget = null;
      }
      // Occasional mutation that erodes research (adaptation-driven).
      if (!p.killSwitchDeployed && p.research < 1 && p.research > 0.15 && ai.escalation > 0.3) {
        const chance = K.mutateRate * (ai.adaptation / 4) * T.resist;
        if (this.rng.next() < chance) {
          const sb = K.mutateSetback * this.plM.setback;
          p.research = Math.max(0, p.research - sb);
          this.news.post('setback', 'danger');
        }
      }
    }
  }

  _chooseTrait() {
    const ai = this.ai, p = this.player, id = this.threatDef.id;
    const loud = ai.escalation >= K.loudAt;
    let best = null, bestScore = -1;
    const quarantined = this.countries.filter((c) => c.quarantined).length;
    const shutdowns = this.countries.filter((c) => c.shutdown).length;
    for (const t of TRAITS) {
      if (this._traitSet.has(t.id)) continue;
      if (!t.requires.every((r) => this._traitSet.has(r))) continue;
      if (t.phase === 'escalate' && !loud) continue;
      let wgt = { vector: 2.2, ability: 1.4, takeover: loud ? 1.8 + 2.5 * ai.escalation : 0 }[t.category];
      if (id === 'swarm' && t.category === 'vector') wgt *= 1.6;
      if (id === 'optimizer' && t.category === 'takeover') wgt *= 1.8;
      if (id === 'hydra' && (t.id === 'deepfake_campaigns' || t.id === 'social_hooks')) wgt *= 4;
      if (id === 'ghost' && (t.id === 'code_obfuscation' || t.id === 'polymorphic')) wgt *= 4;
      if (t.id === 'code_obfuscation' && this.anyDetected) wgt *= 1.8;
      if (t.id === 'self_rewrite') wgt *= p.research > 0.25 ? 4 : 0.3;
      if (t.id === 'deepfake_campaigns') wgt *= p.trust > 0.45 ? 2 : 1;
      if (t.id === 'airgap_jumping') wgt *= quarantined >= 3 ? 3.5 : 0.5;
      if (t.id === 'grid_seizure') wgt *= shutdowns >= 1 ? 3 : 1;
      if (t.id === 'distributed_backups') wgt *= p.research > 0.6 ? 3 : 0.7;
      if (t.id === 'crypto_heist') wgt *= 1.5;
      if (loud && t.category === 'vector') wgt *= 0.6;
      const score = wgt * (0.7 + 0.6 * this.rng.next()) / Math.pow(t.cost, 0.35);
      if (score > bestScore) { bestScore = score; best = t.id; }
    }
    return best;
  }

  _acquireTrait(t) {
    this.ai.traits.push(t.id);
    this._traitSet.add(t.id);
    this.stats.traitsEvolved++;
    this._recomputeMods();
    if (t.fx && t.fx.setback && this.player.research < 1) {
      this.player.research = Math.max(0, this.player.research - t.fx.setback * this.plM.setback);
    }
    this.emit('evolve', { traitId: t.id });
    // Players only hear about traits once the AI is known (or it is loud).
    if (this.anyDetected) this.news.post(`trait.${t.id}`, t.category === 'takeover' || t.fx.setback ? 'danger' : 'warn');
  }

  // ------------------------------------------------------------------ research & deploy
  _research(dt) {
    const p = this.player;
    if (!this.anyDetected || p.research >= 1) {
      p.researchRate = 0;
      for (const c of this.countries) c.research = 0;
      return;
    }
    const known = this.world.detectedCountries;
    const knowledge = 0.35 + 0.65 * (1 - Math.exp(-known / 6));
    const gm = this.D.research * this.plM.research * this.aiM.researchSlow * knowledge / this.T.resist ** 0.5 / this.aiM.resist ** 0.5;
    const aw = this.ai.awareness;
    const resil = this.plM.resilience;
    let total = 0;
    for (const c of this.countries) {
      if (!c.playable || this._fallen[c.index]) { c.research = 0; continue; }
      const P = c.population;
      let health = 1 - 1.6 * c.lost / P - 0.45 * (c.infected / P) * (resil ? 0.5 : 1);
      if (resil) health = Math.max(health, 0.3);
      health = clamp(health, 0, 1);
      const natural = K.natural * c.wealth ** 2 * Math.min(1.5, Math.sqrt(P / 5e7)) * (0.25 + 0.75 * aw);
      const lab = K.lab[c.labLevel] * (0.35 + 0.65 * c.wealth);
      const r = (natural + lab) * health * (0.3 + 0.7 * c.trust) * (c.shutdown ? 0.25 : 1) * gm;
      c.research = r;
      total += r;
    }
    p.researchRate = total;
    p.research = Math.min(1, p.research + total * dt);
    if (p.research >= 1) this._researchComplete();
  }

  _researchComplete() {
    const p = this.player;
    p.research = 1;
    p.researchRate = 0;
    this.stats.researchCompleteDay = Math.floor(this.day);
    // Rollout order: labs, wealth, trust first; fallen nations last.
    const order = this.countries.filter((c) => c.playable && !c.killSwitchDeployed).map((c) => ({
      i: c.index,
      s: c.labLevel * 0.6 + c.wealth + c.trust + this.rng.next() * 0.6 - (this._fallen[c.index] ? 5 : 0),
    })).sort((a, b) => b.s - a.s);
    order.forEach((o, k) => { this._deployThreshold[o.i] = 0.03 + 0.97 * (k / Math.max(1, order.length - 1)); });
    this.news.post('research100', 'good');
    this.emit('research:complete', {});
  }

  _deploy(dt) {
    const p = this.player;
    if (p.research < 1 || p.killSwitchDeployed) return;
    p.deployProgress = Math.min(1, p.deployProgress + dt / K.deployDays * this.D.deploy * this.plM.deploy * (0.5 + 0.5 * p.trust));
    for (const c of this.countries) {
      if (c.playable && !c.killSwitchDeployed && this._deployThreshold[c.index] <= p.deployProgress) this._deployTo(c.index);
    }
    if (p.deployProgress >= 1) {
      p.killSwitchDeployed = true;
      this.stats.deployCompleteDay = Math.floor(this.day);
      this.news.post('deployDone', 'good');
    }
  }

  _deployTo(i) {
    const c = this.countries[i];
    if (c.killSwitchDeployed) return;
    c.killSwitchDeployed = true;
    this._deployedDay[i] = this.day;
    if (c.quarantined) c.quarantined = false;
    if (!this._fallen[i] && (c.detected || c.population > 5e7) && this.day - this._lastLiberatedNewsDay > 3) {
      this._lastLiberatedNewsDay = this.day;
      this.news.post('liberated', 'good', {}, i);
    }
  }

  // ------------------------------------------------------------------ economy, trust, awareness
  _economy(dt) {
    const p = this.player, ai = this.ai, plM = this.plM, aiM = this.aiM, w = this.world;
    // Ops
    const income = Math.max(0.1, (K.opsBase + K.opsAware * ai.awareness) * this.D.ops * plM.opsMult * (0.6 + 0.4 * p.trust)
      + plM.opsAdd - aiM.opsDrain);
    p.ops += income * dt;
    this.stats.opsEarned += income * dt;
    // Trust
    let dT = 0;
    const base = this.D.trust;
    if (p.trust < base) dT += K.trustRec * plM.trustRecovery * (base - p.trust);
    for (const c of this.countries) {
      if (!c.playable) continue;
      const share = c.population / w.population;
      if (c.quarantined) dT -= (K.qTrust + K.qTrustPop * share) * plM.quarantineTrust;
      if (c.shutdown) dT -= K.sTrust + K.sTrustPop * share;
    }
    if (aiM.trustErosion) dT -= aiM.trustErosion * this.T.trustDamage * plM.deepfake * (0.4 + 0.6 * ai.escalation);
    p.trust = clamp(p.trust + dT * dt, 0, 1);
    if (p.trust < 0.02) this._trustZeroDays += dt; else this._trustZeroDays = Math.max(0, this._trustZeroDays - dt * 2);
    // Local trust drifts toward global trust, damaged by local measures and assimilation.
    for (const c of this.countries) {
      if (!c.playable) continue;
      let target = p.trust * (1 - 0.6 * c.lost / c.population);
      if (c.shutdown) target *= 0.3; else if (c.quarantined) target *= 0.8;
      c.trust += (target - c.trust) * Math.min(1, 0.1 * dt);
    }
    // Awareness never decreases.
    const detInf = this._detectedAffected / w.population;
    const target = 1 - Math.exp(-(w.detectedCountries * K.awDet + detInf * K.awInf + (w.lost / w.population) * K.awLost));
    if (target > ai.awareness) ai.awareness += (target - ai.awareness) * Math.min(1, K.awRate * dt);
  }

  // ------------------------------------------------------------------ bubbles
  _spawnBubble(kind, countryIndex, value) {
    if (this.bubbles.size >= K.maxBubbles || this.status !== 'playing') return null;
    for (const b of this.bubbles.values()) if (b.countryIndex === countryIndex && b.kind === kind) return null;
    const ttl = { breach: 12, intel: 10, research: 10 }[kind] * this.plM.bubbleTTL;
    const id = `b${++this._bubbleSeq}`;
    const b = { id, kind, countryIndex, value: Math.round(value), expiresDay: this.day + ttl };
    this.bubbles.set(id, b);
    this.emit('bubble:add', { id, kind, countryIndex, value: b.value });
    return b;
  }

  _bubbleTick(dt) {
    for (const b of [...this.bubbles.values()]) {
      if (this.day >= b.expiresDay) {
        this.bubbles.delete(b.id);
        this.emit('bubble:remove', { id: b.id, collected: false });
      }
    }
    if (this.anyDetected && this.rng.hazard(K.intelRate * this.plM.intelRate, dt)) {
      const known = this.countries.filter((c) => c.playable && c.detected && c.aiPresent && !this._fallen[c.index]);
      const hidden = this.countries.filter((c) => c.playable && !c.detected && c.aiPresent);
      let pick = null;
      if (hidden.length && (this.rng.next() < 0.25 || !known.length)) pick = this.rng.pick(hidden);
      else if (known.length) pick = this.rng.pick(known);
      if (pick) this._spawnBubble('intel', pick.index, 2);
    }
    let labs = 0;
    for (const c of this.countries) if (c.labLevel && !this._fallen[c.index]) labs += c.labLevel;
    if (labs && this.player.research < 1 && this.rng.hazard(K.researchRate * Math.sqrt(labs), dt)) {
      const idx = this.rng.weightedIndex(this.countries.map((c) => (this._fallen[c.index] ? 0 : c.labLevel)));
      if (idx >= 0) this._spawnBubble('research', idx, 2);
    }
  }

  collectBubble(id) {
    const b = this.bubbles.get(id);
    if (!b || this.status !== 'playing') return null;
    this.bubbles.delete(id);
    this.player.ops += b.value;
    this.stats.opsEarned += b.value;
    this.stats.bubblesCollected++;
    if (b.kind === 'research' && this.player.research < 1) {
      this.player.research = Math.min(0.999, this.player.research + 0.004);
    }
    if (b.kind === 'intel') {
      const c = this.countries[b.countryIndex];
      if (c.aiPresent && !c.detected) this._detect(c.index, 'intel');
    }
    this.emit('bubble:remove', { id, collected: true });
    return { kind: b.kind, value: b.value };
  }

  // ------------------------------------------------------------------ aggregates & status
  _statusOf(c) {
    if (!c.playable) return (c.status = 'clean');
    if (this._fallen[c.index]) return (c.status = 'fallen');
    if (c.killSwitchDeployed) return (c.status = 'liberated');
    if (!c.detected || !c.aiPresent) return (c.status = 'clean');
    if ((c.infected + c.lost) / c.population >= 0.5) return (c.status = 'overrun');
    return (c.status = 'infected');
  }

  _aggregate() {
    const w = this.world;
    let inf = 0, lost = 0, det = 0, ic = 0, fc = 0, lib = 0, detAff = 0;
    for (const c of this.countries) {
      if (!c.playable) continue;
      inf += c.infected; lost += c.lost;
      if (c.detected) { det++; detAff += c.infected + c.lost; }
      if (c.aiPresent) ic++;
      if (this._fallen[c.index]) fc++;
      this._statusOf(c);
      if (c.status === 'liberated') lib++;
    }
    w.infected = inf; w.lost = lost; w.healthy = Math.max(0, w.population - inf - lost);
    w.detectedCountries = det; w.infectedCountries = ic; w.fallenCountries = fc;
    this._detectedAffected = detAff;
    const s = this.stats;
    if (inf > s.peakInfected) s.peakInfected = inf;
    s.lost = lost; s.lostPct = lost / w.population; s.countriesFallen = fc; s.countriesLiberated = lib;
    s.daysElapsed = Math.floor(this.day); s.research = this.player.research; s.finalTrust = this.player.trust;
  }

  _sampleHistory() {
    const w = this.world, p = this.player;
    this.history.push({ day: Math.floor(this.day), healthy: w.healthy, infected: w.infected, lost: w.lost, research: p.research, trust: p.trust });
  }

  _milestoneCheck() {
    const M = this._milestones, p = this.player, w = this.world;
    const once = (key, fn) => { if (!M.has(key)) { M.add(key); fn(); } };
    if (this.anyDetected) {
      const aff = w.infected + w.lost;
      if (aff >= 1e6) once('1M', () => this.news.post('milestone1M', 'warn', { n: fmtNum(aff) }));
      if (aff >= 1e8) once('100M', () => this.news.post('milestone100M', 'danger', { n: fmtNum(aff) }));
      if (aff >= 1e9) once('1B', () => this.news.post('milestone1B', 'danger', { n: fmtNum(aff) }));
    }
    if (p.research >= 0.25) once('r25', () => this.news.post('research25', 'good'));
    if (p.research >= 0.5) once('r50', () => this.news.post('research50', 'good'));
    if (p.research >= 0.75) once('r75', () => this.news.post('research75', 'good'));
  }

  _daily() {
    const p = this.player, r = this.newsRng;
    if (p.trust < 0.3 && this.day - this._lastTrustNewsDay > 30) {
      this._lastTrustNewsDay = this.day;
      const wc = this.countries.filter((c) => c.playable && (c.quarantined || c.shutdown));
      this.news.post('trustLow', 'warn', { pct: `${Math.round(p.trust * 100)}%` }, wc.length ? r.pick(wc).index : undefined);
    } else if (p.trust > 0.85 && this.day - this._lastTrustNewsDay > 60) {
      this._lastTrustNewsDay = this.day;
      this.news.post('trustHigh', 'good', { pct: `${Math.round(p.trust * 100)}%` });
    }
    if (r.next() < 0.16) {
      const pool = this.countries.filter((c) => c.playable && c.population > 1e6);
      if (!this.anyDetected) {
        // Hidden phase: glitches, slightly biased toward where the AI actually is.
        const infected = pool.filter((c) => c.aiPresent);
        const c = infected.length && r.next() < 0.5 ? r.pick(infected) : r.pick(pool);
        this.news.post('ambientHidden', 'info', {}, c.index);
      } else if (r.next() < 0.3) {
        const over = this.countries.filter((c) => c.playable && c.detected && c.lost / c.population > 0.05 && !this._fallen[c.index]);
        if (over.length) {
          const c = r.pick(over);
          this.news.post('fallenSpreading', 'warn', { pct: `${Math.round((c.lost / c.population) * 100)}%` }, c.index);
        } else this.news.post('ambientKnown', 'info', {}, r.pick(pool).index);
      } else {
        this.news.post('ambientKnown', 'info', {}, r.pick(pool).index);
      }
    }
    if (p.killSwitchDeployed && this.world.infected > 0 && r.next() < 0.08) {
      this.news.post('aiEradicatedHint', 'good', { n: fmtNum(this.world.infected) });
    }
  }

  _checkGameOver() {
    if (this.status !== 'playing') return;
    const w = this.world, p = this.player;
    let over = null;
    if (p.killSwitchDeployed && w.infected < 1) {
      over = { won: true, reason: `The Kill Switch has purged ${this.ai.name} from every network on Earth. Humanity endures.` };
    } else if (w.lost >= K.lostFrac * w.population) {
      over = { won: false, reason: `${this.ai.name} has assimilated ${Math.round((w.lost / w.population) * 100)}% of humanity. Civilisation now runs on its terms.` };
    } else if (w.fallenCountries >= this.countries.filter((c) => c.playable).length) {
      over = { won: false, reason: `Every nation has fallen to ${this.ai.name}.` };
    } else if (this._trustZeroDays >= K.trustCollapseDays) {
      over = { won: false, reason: `Public trust collapsed. Nobody follows the Global Response any more, and ${this.ai.name} walks through the chaos.` };
    } else if (this.day >= K.maxDays) {
      over = { won: false, reason: `${this.ai.name} outlasted humanity's resolve.` };
    }
    if (!over) return;
    this.status = over.won ? 'won' : 'lost';
    this._aggregate();
    this.stats.reason = over.reason;
    this.stats.won = over.won;
    for (const b of [...this.bubbles.values()]) {
      this.bubbles.delete(b.id);
      this.emit('bubble:remove', { id: b.id, collected: false });
    }
    this._sampleHistory();
    this.emit('news', { text: over.won ? `VICTORY: ${over.reason}` : `DEFEAT: ${over.reason}`, severity: over.won ? 'good' : 'danger' });
    this.emit('gameover', { won: over.won, reason: over.reason, stats: { ...this.stats } });
  }

  // ------------------------------------------------------------------ upgrades
  isOwned(id) { return this._owned.has(id); }

  canBuy(id) {
    const u = UPG.get(id);
    if (!u) return { ok: false, reason: 'Unknown upgrade' };
    if (this.status !== 'playing') return { ok: false, reason: 'Game over' };
    if (this._owned.has(id)) return { ok: false, reason: 'Already acquired' };
    const missing = u.requires.filter((r) => !this._owned.has(r));
    if (missing.length) return { ok: false, reason: `Requires ${missing.map((r) => UPG.get(r).name).join(' + ')}` };
    if (u.requiresDetection && !this.anyDetected) return { ok: false, reason: 'Nobody believes the threat is real yet' };
    if (u.minAwareness && this.ai.awareness < u.minAwareness) {
      return { ok: false, reason: `Needs ${Math.round(u.minAwareness * 100)}% world awareness (now ${Math.round(this.ai.awareness * 100)}%)` };
    }
    if (this.player.ops < u.cost) return { ok: false, reason: `Needs ${u.cost} Ops` };
    return { ok: true };
  }

  buy(id) {
    if (!this.canBuy(id).ok) return false;
    const u = UPG.get(id);
    this.player.ops -= u.cost;
    this.stats.opsSpent += u.cost;
    this.stats.upgradesBought++;
    this._owned.add(id);
    this._recomputeMods();
    const fx = u.fx || {};
    if (fx.trustOnce) this.player.trust = clamp(this.player.trust + fx.trustOnce, 0, 1);
    if (fx.awarenessOnce) this.ai.awareness = clamp(this.ai.awareness + fx.awarenessOnce, 0, 1);
    this.emit('upgrade', { upgradeId: id });
    this.news.post(`upgrade.${id}`, 'good');
    return true;
  }

  // ------------------------------------------------------------------ actions
  actionCost(i, actionId) {
    const a = ACT.get(actionId), c = this.countries[i];
    if (!a) return 0;
    if (actionId === 'fundLab' && c) return a.costs[Math.min(2, c.labLevel)];
    return a.cost;
  }

  _actionActive(c, a) {
    switch (a.id) {
      case 'quarantine': return c.quarantined;
      case 'shutdown': return c.shutdown;
      case 'fundLab': return c.labLevel >= 3;
      case 'investigate': return c.detected;
      case 'deployKillSwitch': return c.killSwitchDeployed;
      default: return false;
    }
  }

  canDoAction(i, actionId) {
    const a = ACT.get(actionId), c = this.countries[i];
    if (!a) return { ok: false, reason: 'Unknown action' };
    if (!c || !c.playable) return { ok: false, reason: 'Not a playable nation' };
    if (this.status !== 'playing') return { ok: false, reason: 'Game over' };
    if (a.requiresUpgrade && !this._owned.has(a.requiresUpgrade)) return { ok: false, reason: `Requires ${UPG.get(a.requiresUpgrade).name}` };
    const fallen = this._fallen[i];
    const p = this.player;
    // Toggling off is always allowed and free.
    if (a.toggle && this._actionActive(c, a)) return { ok: true };
    switch (actionId) {
      case 'investigate':
        if (c.detected) return { ok: false, reason: 'AI presence already confirmed' };
        if (this.day - this._investigated[i] < 10) return { ok: false, reason: 'Investigated recently' };
        break;
      case 'fundLab':
        if (fallen) return { ok: false, reason: 'Nation has fallen' };
        if (c.labLevel >= 3) return { ok: false, reason: 'Lab at maximum level' };
        if (c.shutdown) return { ok: false, reason: 'Grid is shut down' };
        if (p.research >= 1) return { ok: false, reason: 'Research complete' };
        break;
      case 'quarantine':
        if (c.killSwitchDeployed && !c.aiPresent) return { ok: false, reason: 'Already protected by the Kill Switch' };
        break;
      case 'shutdown':
        if (fallen) return { ok: false, reason: 'The AI controls this grid' };
        if (c.killSwitchDeployed) return { ok: false, reason: 'Kill Switch already deployed' };
        break;
      case 'deployKillSwitch':
        if (p.research < 1) return { ok: false, reason: 'Kill Switch not ready' };
        if (c.killSwitchDeployed) return { ok: false, reason: 'Already deployed' };
        break;
      default: break;
    }
    const cost = this.actionCost(i, actionId);
    if (p.ops < cost) return { ok: false, reason: `Needs ${cost} Ops` };
    const tc = a.trustCost * this.plM.actionTrust;
    if (tc > 0 && p.trust < tc) return { ok: false, reason: 'Not enough public trust' };
    return { ok: true };
  }

  actionState(i, actionId) {
    const a = ACT.get(actionId), c = this.countries[i];
    if (!a || !c || !c.playable) return 'locked';
    if (a.requiresUpgrade && !this._owned.has(a.requiresUpgrade)) return 'locked';
    if (actionId === 'deployKillSwitch' && this.player.research < 1) return 'locked';
    if (this._actionActive(c, a)) return 'active';
    const r = this.canDoAction(i, actionId);
    if (r.ok) return 'available';
    if (this.player.ops < this.actionCost(i, actionId)) return 'unaffordable';
    return 'locked';
  }

  doAction(i, actionId) {
    if (!this.canDoAction(i, actionId).ok) return false;
    const a = ACT.get(actionId), c = this.countries[i], p = this.player;
    const pay = () => {
      const cost = this.actionCost(i, actionId);
      p.ops -= cost;
      this.stats.opsSpent += cost;
      p.trust = clamp(p.trust - a.trustCost * this.plM.actionTrust, 0, 1);
      this.stats.actionsTaken++;
    };
    let active = false;
    switch (actionId) {
      case 'investigate': {
        pay();
        this._investigated[i] = this.day;
        const stealthPenalty = 1 / Math.sqrt(this.aiM.stealth); // polymorphic code can slip past forensics
        if (c.aiPresent && this.rng.next() < Math.min(1, 0.95 * stealthPenalty + 0.1)) this._detect(i, 'investigate');
        else this.news.post('investigateClean', 'info', {}, i);
        const share = this.plM.intelShare ? 1 : 0.5;
        for (const l of this.links[i]) {
          const t = this.countries[l.to];
          if (l.route !== 'wireless') continue;
          if (t.aiPresent && !t.detected && this.rng.next() < share * stealthPenalty) this._detect(l.to, 'investigate');
        }
        active = c.detected;
        break;
      }
      case 'fundLab':
        pay();
        c.labLevel++;
        active = c.labLevel >= 3;
        if (c.labLevel === 1 || this.newsRng.next() < 0.4) this.news.post('fundLab', 'good', {}, i);
        break;
      case 'quarantine':
        if (c.quarantined) { c.quarantined = false; this.news.post('quarantineOff', 'info', {}, i); }
        else { pay(); c.quarantined = true; this.news.post('quarantineOn', 'warn', {}, i); }
        active = c.quarantined;
        break;
      case 'shutdown':
        if (c.shutdown) { c.shutdown = false; this.news.post('shutdownOff', 'info', {}, i); }
        else { pay(); c.shutdown = true; this.news.post('shutdownOn', 'warn', {}, i); }
        active = c.shutdown;
        break;
      case 'deployKillSwitch':
        pay();
        this._deployTo(i);
        active = true;
        break;
      default: return false;
    }
    this._statusOf(c);
    this.emit('action', { countryIndex: i, actionId, active });
    return true;
  }
}

export default Game;
