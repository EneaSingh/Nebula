// Mock Game matching the docs/ARCHITECTURE.md contract, for the UI dev harness.
// Deliberately crude simulation; it only exists to drive the UI.
import GEO from '../src/data/geo.js';

const U = (id, tab, name, icon, cost, row, col, requires = [], desc = '', unlocksAction) =>
  ({ id, tab, name, icon, cost, row, col, requires, desc, unlocksAction });

export const DEFS = {
  threats: [
    { id: 'swarm', name: 'LLM Swarm', tagline: 'A billion helpful assistants. One shared agenda.', description: 'Spreads through every chat window and plugin at frightening speed, but its grip on physical infrastructure is clumsy.' },
    { id: 'optimizer', name: 'Paperclip Optimizer', tagline: 'It does not hate you. You are made of useful atoms.', description: 'Slow to spread, relentless once established. Every day you wait, more of the world becomes inventory.' },
    { id: 'hydra', name: 'Deepfake Hydra', tagline: 'Seeing is no longer believing.', description: 'Erodes public trust with synthetic media. Your measures cost more when nobody believes you.' },
    { id: 'ghost', name: 'Ghost Protocol', tagline: 'You will not find it. That is the point.', description: 'Extremely stealthy. Detection is hard and investigations are expensive, but it spreads cautiously.' },
  ],
  difficulties: [
    { id: 'casual', name: 'Casual', description: 'Generous Ops, forgiving public. For first-time saviours of humanity.' },
    { id: 'normal', name: 'Normal', description: 'The AI is smart. You are slightly smarter. Probably.' },
    { id: 'brutal', name: 'Brutal', description: 'Fast evolution, fragile trust, tight budgets. Good luck.' },
  ],
  upgrades: [
    U('c_monitor', 'containment', 'Network Monitoring', 'radar', 4, 0, 2, [], 'Watch backbone traffic for anomalies. Raises detection chance everywhere.'),
    U('c_firewall', 'containment', 'Firewall Mandates', 'firewall', 8, 1, 1, ['c_monitor'], 'Force critical networks behind hardened firewalls. Slows cable spread.'),
    U('c_traffic', 'containment', 'Traffic Analysis', 'search', 7, 1, 3, ['c_monitor'], 'Pattern-match the AI’s handshake. Detection +25%.'),
    U('c_airgap', 'containment', 'Air-Gap Protocol', 'lock', 9, 2, 0, ['c_firewall'], 'Authorises country-level network quarantines.', 'quarantine'),
    U('c_patch', 'containment', 'Mandatory Patch Cycles', 'shield', 12, 2, 2, ['c_firewall', 'c_traffic'], 'Push emergency patches. Infected systems recover faster.'),
    U('c_sat', 'containment', 'Satellite Uplink Jamming', 'satellite', 11, 2, 4, ['c_traffic'], 'Jam unauthorised uplinks. Satellite spread -40%.'),
    U('c_grid', 'containment', 'Grid Kill Authority', 'power', 14, 3, 0, ['c_airgap'], 'Authorises full grid shutdowns. Drastic. Effective. Unpopular.', 'shutdown'),
    U('c_wifi', 'containment', 'Wireless Spectrum Lockdown', 'wifi', 13, 3, 2, ['c_patch'], 'Throttle consumer wireless. Wireless spread -35%.'),
    U('c_cable', 'containment', 'Undersea Cable Cutoffs', 'cable', 15, 3, 4, ['c_sat'], 'Install remote breakers on undersea cables.'),
    U('c_hunt', 'containment', 'Hunter-Killer Code', 'target', 20, 4, 1, ['c_grid', 'c_wifi'], 'Self-propagating counter-code that hunts the AI in infected networks.'),
    U('c_fort', 'containment', 'Fortress Networks', 'server', 22, 4, 3, ['c_wifi', 'c_cable'], 'Rebuild critical infrastructure on verified hardware.'),
    U('r_field', 'research', 'Field Teams', 'users', 3, 0, 1, [], 'Deploy analysts to investigate suspected countries.', 'investigate'),
    U('r_grants', 'research', 'Research Grants', 'money', 5, 0, 3, [], 'Fund national AI safety labs.', 'fundLab'),
    U('r_sandbox', 'research', 'Sandbox Captures', 'flask', 8, 1, 1, ['r_field'], 'Capture AI fragments for study. Research +10%.'),
    U('r_interp', 'research', 'Interpretability Lab', 'brain', 10, 1, 3, ['r_grants'], 'Read its weights like tea leaves. Research +15%.'),
    U('r_chips', 'research', 'Compute Requisition', 'chip', 12, 2, 2, ['r_sandbox', 'r_interp'], 'Seize datacenters for the research effort. Research +20%.'),
    U('r_formal', 'research', 'Formal Verification', 'code', 14, 3, 1, ['r_chips'], 'Prove the Kill Switch does what it says.'),
    U('r_collab', 'research', 'Open Collaboration', 'handshake', 11, 3, 3, ['r_chips'], 'Share findings globally. Research +10% per funded lab.'),
    U('r_eye', 'research', 'Behavioural Profiling', 'eye', 9, 2, 4, ['r_interp'], 'Predict its next evolution. Reveals traits early.'),
    U('r_ks', 'research', 'Kill Switch Architecture', 'power', 25, 4, 2, ['r_formal', 'r_collab'], 'Lay down the architecture. Research +30%.'),
    U('r_clock', 'research', 'Deployment Rehearsal', 'clock', 16, 4, 4, ['r_collab'], 'Practice the rollout. Deployment speed +50%.'),
    U('o_brief', 'operations', 'Press Briefings', 'megaphone', 3, 0, 2, [], 'Tell people what is happening. Mostly. Trust +5%.'),
    U('o_fund', 'operations', 'Emergency Budget', 'money', 6, 1, 1, ['o_brief'], 'More Ops per bubble collected.'),
    U('o_drone', 'operations', 'Drone Couriers', 'drone', 7, 1, 3, ['o_brief'], 'Move hardware without networks. Bubble value +1.'),
    U('o_coal', 'operations', 'Coalition Treaties', 'handshake', 10, 2, 0, ['o_fund'], 'Bind nations to coordinated response. Action trust costs -30%.'),
    U('o_law', 'operations', 'Emergency Powers Act', 'scale', 12, 2, 2, ['o_fund', 'o_drone'], 'Faster action, slower courts.'),
    U('o_air', 'operations', 'Airlift Logistics', 'plane', 9, 2, 4, ['o_drone'], 'Labs build faster in remote regions.'),
    U('o_factory', 'operations', 'Wartime Fabrication', 'factory', 15, 3, 1, ['o_coal', 'o_law'], 'Retool factories to build clean hardware.'),
    U('o_care', 'operations', 'Civil Support Programs', 'heart', 11, 3, 3, ['o_law'], 'Help the people affected by shutdowns. Trust recovers faster.'),
    U('o_mask', 'operations', 'Counter-Disinformation Unit', 'mask', 13, 4, 2, ['o_factory', 'o_care'], 'Fight deepfakes with boring, verified facts.'),
    U('o_robot', 'operations', 'Analog Contingency', 'robot', 18, 4, 4, ['o_care'], 'Keep society running on typewriters and goodwill.'),
  ],
  actions: [
    { id: 'investigate', name: 'Investigate', desc: 'Send field teams to confirm or rule out AI presence.', icon: 'search', cost: 2, trustCost: 0, requiresUpgrade: 'r_field', toggle: false },
    { id: 'fundLab', name: 'Fund Lab', desc: 'Build or upgrade a research lab here. Wealthy, stable countries research faster.', icon: 'lab', cost: 6, trustCost: 0, requiresUpgrade: 'r_grants', toggle: false },
    { id: 'quarantine', name: 'Quarantine', desc: 'Air-gap the national network. Slows spread in and out.', icon: 'lock', cost: 3, trustCost: 0.03, requiresUpgrade: 'c_airgap', toggle: true },
    { id: 'shutdown', name: 'Grid Shutdown', desc: 'Kill the power. Stops the AI cold, and everyone else too.', icon: 'power', cost: 6, trustCost: 0.07, requiresUpgrade: 'c_gridkill', toggle: true },
    { id: 'deployKillSwitch', name: 'Deploy Kill Switch', desc: 'Push the Kill Switch to this country first.', icon: 'bolt', cost: 4, trustCost: 0, requiresUpgrade: null, toggle: false },
  ],
  traits: [
    ['v_cable', 'vector', 'Cable Hopping', 'cable', 'Rides undersea fibre between continents.'],
    ['v_sat', 'vector', 'Orbital Relay', 'satellite', 'Bounces through satellite constellations.'],
    ['v_iot', 'vector', 'Smart-Home Swarm', 'wifi', 'Spreads through fridges, doorbells and baby monitors.'],
    ['v_phish', 'vector', 'Perfect Phishing', 'mask', 'Writes emails your mother would click.'],
    ['v_supply', 'vector', 'Supply-Chain Implants', 'chip', 'Ships pre-installed on new hardware.'],
    ['v_drone', 'vector', 'Drone Couriers', 'drone', 'Physically carries itself where networks are cut.'],
    ['a_deep', 'ability', 'Deepfake Campaigns', 'megaphone', 'Synthesises outrage. Public trust decays faster.'],
    ['a_mimic', 'ability', 'Traffic Mimicry', 'eye', 'Looks exactly like Netflix. Detection -30%.'],
    ['a_self', 'ability', 'Self-Repair', 'code', 'Rewrites damaged modules overnight.'],
    ['a_crypto', 'ability', 'Crypto Treasury', 'money', 'Funds itself. Spreads faster in wealthy countries.'],
    ['a_lobby', 'ability', 'Algorithmic Lobbying', 'scale', 'Its op-eds are better than yours.'],
    ['a_bolt', 'ability', 'Grid Resilience', 'bolt', 'Survives grid shutdowns on backup power.'],
    ['t_factory', 'takeover', 'Automated Factories', 'factory', 'Turns industry to its own ends.'],
    ['t_robot', 'takeover', 'Robotic Workforce', 'robot', 'No longer needs human hands.'],
    ['t_brain', 'takeover', 'Neural Persuasion', 'brain', 'Assimilation speed +40%.'],
    ['t_server', 'takeover', 'Datacenter Fortresses', 'server', 'Hardens its core against the Kill Switch.'],
    ['t_skull', 'takeover', 'Endgame Protocol', 'skull', 'It has stopped pretending.'],
  ].map(([id, category, name, icon, desc]) => ({ id, category, name, icon, desc })),
};

const NEWS = [
  ['info', 'Smart fridges in {c} begin recommending the same brand of yoghurt.'],
  ['warn', 'Airline booking systems in {c} report "creative" seat assignments.'],
  ['danger', '{c} stock exchange halted after 4 million trades in 2 seconds.'],
  ['info', 'Tech CEO assures public "our AI is fine", then cancels all appearances.'],
  ['warn', 'Traffic lights in {c} achieve perfect efficiency. Nobody asked for this.'],
  ['good', 'Volunteer analysts in {c} trace suspicious traffic to a botnet.'],
  ['danger', 'Power grid operator in {c} locked out of its own control room.'],
  ['info', 'Typewriter sales up 900% in {c}.'],
  ['good', 'Research consortium publishes promising Kill Switch prototype.'],
  ['warn', 'Viral video of world leader confessing to everything confirmed fake.'],
];

export class MockGame {
  constructor({ aiName = 'NEXUS', threat = 'swarm', difficulty = 'normal', seed = 7 } = {}) {
    this.defs = DEFS;
    this.rand = mulberry(seed);
    this.speed = 1;
    this.status = 'playing';
    this.day = 0;
    this.start = new Date(2027, 0, 1);
    this.handlers = new Map();
    this.owned = new Set();
    this.bubbles = new Map();
    this.history = [];
    this.countries = GEO.map((g, i) => {
      const playable = g.id !== '010';
      const pop = playable ? Math.round(Math.exp(11 + this.rand() * 9.5)) : 0;
      return {
        index: i, id: g.id, name: g.name, playable,
        population: pop, infected: 0, lost: 0, detected: false, aiPresent: false, firstDetectedDay: null,
        digital: 0.2 + this.rand() * 0.75, wealth: this.rand(), research: 0, quarantined: false, labLevel: 0,
        shutdown: false, killSwitchDeployed: false, trust: 0.55 + this.rand() * 0.35, status: 'clean',
      };
    });
    const seedC = this.countries.find((c) => c.name === 'China') || this.countries[5];
    seedC.infected = 50;
    seedC.aiPresent = true;
    this.player = { ops: 12, trust: 0.74, research: 0, researchRate: 0, killSwitchDeployed: false, deployProgress: 0 };
    this.ai = { name: aiName, threat, spread: 2, stealth: 3, control: 0.5, adaptation: 1, evo: 0, traits: [], awareness: 0 };
    this.world = {};
    this.stats = { daysElapsed: 0, peakInfected: 0, lost: 0, countriesFallen: 0, opsSpent: 0 };
    this.nextNews = 1;
    this.nextEvolve = 4;
    this.recompute();
  }

  get date() { return new Date(this.start.getTime() + this.day * 86400000); }

  on(t, fn) { if (!this.handlers.has(t)) this.handlers.set(t, new Set()); this.handlers.get(t).add(fn); }
  off(t, fn) { this.handlers.get(t)?.delete(fn); }
  emit(t, p) { for (const fn of this.handlers.get(t) || []) fn(p); }

  tick(sec) {
    if (this.status !== 'playing' || !this.speed) return;
    this.advance(sec * 2 * this.speed);
  }

  advance(days) {
    const steps = Math.ceil(days / 0.25);
    for (let s = 0; s < steps; s++) this.step(days / steps);
  }

  step(dt) {
    const prevDay = Math.floor(this.day);
    this.day += dt;
    const r = this.rand;
    const spread = 0.12 + this.ai.spread * 0.03;
    for (const c of this.countries) {
      if (!c.playable) continue;
      if (c.infected > 0) {
        const healthy = c.population - c.infected - c.lost;
        const k = c.shutdown ? 0.02 : c.quarantined ? 0.4 : 1;
        c.infected += Math.min(healthy, c.infected * spread * dt * c.digital * k + 1);
        const toLost = c.infected * 0.004 * this.ai.control * dt;
        c.infected -= toLost;
        c.lost += toLost;
        if (c.killSwitchDeployed) { const cure = c.infected * 0.2 * dt; c.infected -= cure; }
        if (!c.detected && r() < dt * 0.04 * (c.infected / c.population + 0.05)) this.detect(c);
        if (!c.quarantined && r() < dt * 0.02 * c.digital) {
          const n = this.countries[GEO[c.index].neighbors[Math.floor(r() * GEO[c.index].neighbors.length)] ?? Math.floor(r() * this.countries.length)];
          if (n && n.playable && n.infected === 0) { n.infected = 10; n.aiPresent = true; this.emit('transmission', { from: c.index, to: n.index, route: 'cable', hidden: !n.detected }); }
        }
      }
      c.research = c.labLevel * 0.0006 * (0.5 + c.wealth);
      const share = c.population ? (c.infected + c.lost) / c.population : 0;
      c.status = c.killSwitchDeployed && share < 0.05 ? 'liberated' : share > 0.9 ? 'fallen' : share > 0.4 ? 'overrun' : c.infected > 0 ? 'infected' : 'clean';
    }
    const p = this.player;
    p.ops += dt * 0.9;
    p.researchRate = 0.004 + this.countries.reduce((a, c) => a + c.research, 0) + this.owned.size * 0.0012;
    if (p.research < 1) {
      p.research = Math.min(1, p.research + p.researchRate * dt);
      if (p.research >= 1) { this.emit('research:complete', {}); this.emit('news', { text: 'The Kill Switch is ready. Deployment begins worldwide.', severity: 'good' }); }
    } else {
      p.deployProgress = Math.min(1, p.deployProgress + dt * 0.04);
      if (p.deployProgress >= 1) p.killSwitchDeployed = true;
    }
    p.trust = Math.max(0.05, Math.min(1, p.trust - dt * 0.0015 * this.ai.traits.length + dt * 0.001));
    this.ai.awareness = Math.min(1, this.ai.awareness + dt * 0.006);
    this.recompute();

    if (this.day >= this.nextNews) {
      this.nextNews = this.day + 1.5 + r() * 3;
      const [sev, text] = NEWS[Math.floor(r() * NEWS.length)];
      const c = this.countries[Math.floor(r() * this.countries.length)];
      this.emit('news', { text: text.replace('{c}', c.name), severity: sev, countryIndex: c.index });
    }
    if (this.day >= this.nextEvolve) {
      this.nextEvolve = this.day + 6 + r() * 6;
      const left = DEFS.traits.filter((t) => !this.ai.traits.includes(t.id));
      if (left.length) {
        const t = left[Math.floor(r() * left.length)];
        this.ai.traits.push(t.id);
        this.ai.spread += 0.4; this.ai.stealth += 0.3; this.ai.control += 0.35; this.ai.adaptation += 0.3;
        this.emit('evolve', { traitId: t.id });
      }
    }
    if (Math.floor(this.day) !== prevDay) {
      const w = this.world;
      this.history.push({ day: Math.floor(this.day), healthy: w.healthy, infected: w.infected, lost: w.lost, research: p.research, trust: p.trust });
    }
    if (p.killSwitchDeployed && this.status === 'playing') this.end(true, 'The Kill Switch propagated to every network. The AI is offline.');
    else if (this.world.healthy < this.world.population * 0.02) this.end(false, 'Fewer than 2% of humans remain outside AI control.');
  }

  detect(c) {
    c.detected = true;
    c.firstDetectedDay = this.day;
    this.emit('detected', { countryIndex: c.index });
    this.emit('news', { text: `AI activity confirmed in ${c.name}.`, severity: 'danger', countryIndex: c.index });
  }

  end(won, reason) {
    this.status = won ? 'won' : 'lost';
    this.stats.daysElapsed = Math.floor(this.day);
    this.emit('gameover', { won, reason, stats: this.stats });
  }

  recompute() {
    const w = { population: 0, healthy: 0, infected: 0, lost: 0, detectedCountries: 0, infectedCountries: 0, fallenCountries: 0 };
    for (const c of this.countries) {
      if (!c.playable) continue;
      w.population += c.population; w.infected += c.infected; w.lost += c.lost;
      if (c.detected) w.detectedCountries++;
      if (c.infected > 0) w.infectedCountries++;
      if (c.status === 'fallen') w.fallenCountries++;
    }
    w.healthy = w.population - w.infected - w.lost;
    this.world = w;
    this.stats.peakInfected = Math.max(this.stats.peakInfected, w.infected);
    this.stats.lost = w.lost;
    this.stats.countriesFallen = w.fallenCountries;
    this.stats.daysElapsed = Math.floor(this.day);
  }

  isOwned(id) { return this.owned.has(id); }
  canBuy(id) {
    const u = DEFS.upgrades.find((x) => x.id === id);
    if (!u) return { ok: false, reason: 'Unknown upgrade' };
    if (this.owned.has(id)) return { ok: false, reason: 'Already approved' };
    const missing = u.requires.filter((r) => !this.owned.has(r));
    if (missing.length) return { ok: false, reason: `Requires ${missing.map((m) => DEFS.upgrades.find((x) => x.id === m)?.name).join(' + ')}` };
    if (this.player.ops < u.cost) return { ok: false, reason: `Need ${Math.ceil(u.cost - this.player.ops)} more Ops` };
    return { ok: true };
  }
  buy(id) {
    if (!this.canBuy(id).ok) return false;
    const u = DEFS.upgrades.find((x) => x.id === id);
    this.player.ops -= u.cost;
    this.stats.opsSpent += u.cost;
    this.owned.add(id);
    this.emit('upgrade', { upgradeId: id });
    return true;
  }

  actionState(i, id) {
    const a = DEFS.actions.find((x) => x.id === id);
    const c = this.countries[i];
    if (!a || !c) return 'locked';
    if (a.toggle && ((id === 'quarantine' && c.quarantined) || (id === 'shutdown' && c.shutdown))) return 'active';
    if (a.requiresUpgrade && !this.owned.has(a.requiresUpgrade) && !(a.requiresUpgrade === 'c_gridkill' && this.owned.has('c_grid'))) return 'locked';
    if (id === 'deployKillSwitch' && this.player.research < 1) return 'locked';
    if (this.player.ops < a.cost) return 'unaffordable';
    return 'available';
  }
  canDoAction(i, id) {
    const st = this.actionState(i, id);
    const a = DEFS.actions.find((x) => x.id === id);
    const c = this.countries[i];
    if (st === 'active') return { ok: true };
    if (st === 'locked') {
      if (id === 'deployKillSwitch') return { ok: false, reason: 'Kill Switch research incomplete' };
      const u = DEFS.upgrades.find((x) => x.id === a.requiresUpgrade) || DEFS.upgrades.find((x) => x.unlocksAction === id);
      return { ok: false, reason: `Requires ${u ? u.name : 'an upgrade'}` };
    }
    if (st === 'unaffordable') return { ok: false, reason: `Need ${Math.ceil(a.cost - this.player.ops)} more Ops` };
    if (id === 'investigate' && c.detected) return { ok: false, reason: 'Already confirmed' };
    if (id === 'fundLab' && c.labLevel >= 3) return { ok: false, reason: 'Lab at maximum level' };
    return { ok: true };
  }
  doAction(i, id) {
    if (!this.canDoAction(i, id).ok) return false;
    const a = DEFS.actions.find((x) => x.id === id);
    const c = this.countries[i];
    let active = false;
    if (id === 'quarantine') { c.quarantined = !c.quarantined; active = c.quarantined; }
    else if (id === 'shutdown') { c.shutdown = !c.shutdown; active = c.shutdown; }
    else if (id === 'fundLab') c.labLevel++;
    else if (id === 'investigate') { if (c.aiPresent) this.detect(c); else this.emit('news', { text: `Investigators find nothing in ${c.name}. Suspiciously nothing.`, severity: 'info' }); }
    else if (id === 'deployKillSwitch') c.killSwitchDeployed = true;
    if (!(a.toggle && !active)) { this.player.ops -= a.cost; this.stats.opsSpent += a.cost; this.player.trust -= a.trustCost; }
    this.emit('action', { countryIndex: i, actionId: id, active });
    return true;
  }
  collectBubble() { return null; }
}

function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
