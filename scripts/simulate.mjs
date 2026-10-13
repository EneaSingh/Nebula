#!/usr/bin/env node
// Headless balance harness for KILL SWITCH.
//
//   node scripts/simulate.mjs [--seeds 16] [--threat swarm,ghost] [--diff normal] [--bot idle,greedy]
//                             [--ban a,b] [--verbose] [--trace] [--check [--table]]
//   node scripts/simulate.mjs --gift all|id,id   [--seeds 40]   # value of each upgrade (normal, greedy)
//   node scripts/simulate.mjs --ablate all|id,id [--seeds 40]   # results when the bot never buys it
//   node scripts/simulate.mjs --buys [--bot greedy]             # when does the bot own each upgrade?
//
// Bots: idle (does nothing), greedy (balanced), contain (containment-first), research (research-first),
// ops (economy/operations-first). All non-idle bots collect ~70% of alerts, investigate the frontier,
// quarantine newly detected nations early, use short shutdowns where assimilation accelerates, and
// prioritise the Kill Switch rollout at the end.
// --ban a,b: bots never buy these upgrades. Runs are spread over worker threads.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import GEO from '../src/data/geo.js';
import { Game, STEP } from '../src/sim/game.js';
import { hasStats } from '../src/sim/countryStats.js';
import { templateCount } from '../src/sim/news.js';
import { UPGRADES } from '../src/sim/defs.js';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const flag = (name) => args.includes(`--${name}`);
const list = (v) => (v ? v.split(',').filter(Boolean) : []);
const UPG = new Map(UPGRADES.map((u) => [u.id, u]));
const SDLO = +(process.env.SDLO || 0.05);

// --------------------------------------------------------------------------- bots
const PRIORITY = {
  greedy: [
    'r_field', 'c_monitor', 'o_briefings', 'r_grants', 'o_funding', 'c_firewall', 'c_airgap', 'c_traffic',
    'r_reverse', 'o_intel', 'r_honeypots', 'r_compute', 'o_bonds', 'c_patch', 'c_hardened', 'o_coalition',
    'r_sandbox', 'c_gridkill', 'c_emp', 'o_literacy', 'r_quantum', 'r_firmware', 'c_zerotrust', 'o_rapid',
    'c_counterdrone', 'r_interp', 'o_civdef', 'c_cable', 'r_deadhand', 'o_command', 'r_rollout', 'o_powers',
    'c_jamming', 'o_analog',
  ],
  contain: [
    'r_field', 'c_monitor', 'o_briefings', 'r_grants', 'o_funding', 'c_firewall', 'c_airgap', 'c_traffic', 'c_patch',
    'r_reverse', 'c_hardened', 'c_gridkill', 'c_cable', 'r_compute', 'c_zerotrust', 'c_emp', 'c_counterdrone',
    'c_jamming', 'r_honeypots', 'o_intel', 'r_sandbox', 'o_literacy', 'o_civdef', 'o_bonds', 'o_coalition',
    'r_quantum', 'r_firmware', 'o_powers', 'r_interp', 'o_rapid', 'o_command', 'r_deadhand', 'r_rollout', 'o_analog',
  ],
  research: [
    'r_field', 'c_monitor', 'o_briefings', 'r_grants', 'c_airgap', 'o_funding', 'r_reverse', 'r_honeypots', 'r_compute',
    'c_firewall', 'r_sandbox', 'r_quantum', 'r_deadhand', 'r_firmware', 'r_interp', 'r_rollout', 'o_intel', 'o_coalition',
    'c_traffic', 'o_literacy', 'o_bonds', 'c_patch', 'o_command', 'c_cable', 'c_hardened', 'o_civdef', 'c_zerotrust',
    'c_gridkill', 'o_rapid', 'c_counterdrone', 'o_powers', 'c_jamming', 'c_emp', 'o_analog',
  ],
  ops: [
    'o_briefings', 'r_field', 'o_funding', 'r_grants', 'c_monitor', 'o_bonds', 'o_intel', 'o_rapid',
    'o_literacy', 'o_coalition', 'c_firewall', 'r_reverse', 'o_command', 'o_civdef', 'c_traffic', 'c_airgap',
    'r_honeypots', 'r_compute', 'o_powers', 'c_patch', 'r_sandbox', 'o_analog', 'r_quantum', 'c_cable',
    'c_hardened', 'c_zerotrust', 'r_firmware', 'r_interp', 'c_gridkill', 'c_counterdrone', 'c_jamming', 'c_emp',
    'r_deadhand', 'r_rollout',
  ],
};
// Share of spending a persona puts into labs, and how many nations it builds labs in.
const PERSONA = {
  greedy: { labShare: 0.25, labNations: 9, quarantine: true, shutdown: true },
  contain: { labShare: 0.25, labNations: 9, quarantine: true, shutdown: true },
  research: { labShare: 0.3, labNations: 12, quarantine: true, shutdown: true },
  ops: { labShare: 0.25, labNations: 9, quarantine: true, shutdown: true },
};

function makeBot(kind, seed, ban) {
  if (kind === 'idle') return { daily() {} };
  const P = PERSONA[kind], prio = PRIORITY[kind].filter((id) => !ban.has(id));
  // Bot-side randomness (reaction delays) uses its own PRNG so the sim stays deterministic.
  let s = seed >>> 0 || 1;
  const rand = () => { s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0; return s / 4294967296; };
  const qSince = new Map(), qDone = new Map(), sSince = new Map(), lostHist = new Map();
  let spentLabs = 0, spentUpg = 0;
  const act = (g, i, id) => {
    const before = g.player.ops;
    const ok = g.doAction(i, id);
    if (ok && id === 'fundLab') spentLabs += before - g.player.ops;
    return ok;
  };
  return {
    daily(g) {
      const C = g.countries, p = g.player, day = g.day;
      for (const id of [...g.bubbles.keys()]) if (rand() < 0.7) g.collectBubble(id);

      // ---- time-critical actions first (cheap) ----
      if (g.isOwned('r_field') && !process.env.NOINV && p.ops >= 6) {
        let target = null;
        if (!g.world.detectedCountries) {
          if (day % 7 !== 3) target = undefined; else
          target = C.filter((c) => c.playable && !c.detected && g.canDoAction(c.index, 'investigate').ok)
            .sort((a, b) => b.digital * Math.sqrt(b.population) - a.digital * Math.sqrt(a.population))[rand() < 0.5 ? 0 : 1];
        } else if (target !== undefined && p.ops >= 8 && rand() < 0.15) {
          const front = new Set();
          for (const c of C) if (c.detected) for (const l of g.links[c.index]) if (!C[l.to].detected) front.add(l.to);
          target = [...front].map((i) => C[i]).filter((c) => c.population > 1e6 && g.canDoAction(c.index, 'investigate').ok)
            .sort((a, b) => b.population * b.digital - a.population * a.digital)[0];
        }
        if (target) act(g, target.index, 'investigate');
      }
      // Quarantine: newly detected nations first (before they seed their neighbours), then the biggest
      // still-contestable outbreaks. Released after ~60 days or when trust runs low.
      if (P.quarantine && !process.env.NOQ && g.isOwned('c_airgap')) {
        for (const c of C) {
          if (!c.quarantined) continue;
          const held = day - (qSince.get(c.index) ?? day);
          if (held > 60 || p.trust < 0.3 || c.killSwitchDeployed || c.status === 'fallen') { act(g, c.index, 'quarantine'); qSince.set(c.index, day - 60 + 1e-9); qDone.set(c.index, day); }
        }
        const maxQ = Math.max(0, Math.min(6, Math.round((p.trust - 0.25) * 14)));
        let active = C.filter((c) => c.quarantined).length;
        const cands = C.filter((c) => c.detected && !c.quarantined && c.population > 1e6 && c.status !== 'fallen'
          && !c.killSwitchDeployed && day - (qDone.get(c.index) ?? -1e9) > 30)
          .map((c) => ({ c, score: c.infected * c.digital * (day - c.firstDetectedDay < 15 ? 3 : 1) }))
          .sort((a, b) => b.score - a.score);
        for (const { c } of cands) {
          if (active >= maxQ || p.trust < 0.35) break;
          if (g.canDoAction(c.index, 'quarantine').ok && act(g, c.index, 'quarantine')) { qSince.set(c.index, day); active++; }
        }
      }
      // Shutdown: short blackouts where assimilation is accelerating.
      if (day % 5 === 0) for (const c of C) if (c.playable) lostHist.set(c.index, [...(lostHist.get(c.index) || []).slice(-2), c.lost]);
      if (P.shutdown && !process.env.NOSD && g.isOwned('c_gridkill')) {
        const hold = 18;
        for (const c of C) {
          if (!c.shutdown) continue;
          const held = day - (sSince.get(c.index) ?? day);
          if (held > hold || c.killSwitchDeployed) act(g, c.index, 'shutdown');
        }
        const active = C.filter((c) => c.shutdown).length;
        if (active < 3 && p.ops >= 6 && p.trust > 0.35) {
          const hot = C.filter((c) => {
            if (!c.detected || c.shutdown || c.killSwitchDeployed || c.status === 'fallen' || c.population < 5e6) return false;
            if (day - (sSince.get(c.index) ?? -1e9) < 45) return false;
            const h = lostHist.get(c.index) || [];
            const lf = c.lost / c.population;
            if (h.length < 3 || lf < SDLO || lf > 0.45) return false;
            const recent = c.lost - h[1], prior = h[1] - h[0];
            return recent > prior * 1.15 && recent / c.population > 0.004;
          }).sort((a, b) => (b.lost - (lostHist.get(b.index) || [0, 0])[1]) - (a.lost - (lostHist.get(a.index) || [0, 0])[1]))[0];
          if (hot && g.canDoAction(hot.index, 'shutdown').ok) { act(g, hot.index, 'shutdown'); sSince.set(hot.index, day); }
        }
      }
      if (p.research >= 1 && !p.killSwitchDeployed) {
        const worst = C.filter((c) => c.playable && !c.killSwitchDeployed && c.aiPresent && c.status !== 'fallen')
          .sort((a, b) => b.infected - a.infected)[0];
        if (worst && g.canDoAction(worst.index, 'deployKillSwitch').ok) act(g, worst.index, 'deployKillSwitch');
      }

      // ---- spending: split between labs and upgrades ----
      for (let guard = 0; guard < 6; guard++) {
        // A sensible player prepares the rollout as the Kill Switch nears completion.
        const order = p.research >= 0.85 && !p.killSwitchDeployed
          ? ['r_interp', 'r_rollout', 'r_deadhand'].filter((id) => prio.includes(id)).concat(prio) : prio;
        const nextUpg = order.find((id) => !g.isOwned(id) && !/Requires|Already/.test(g.canBuy(id).reason || ''));
        let labCand = null;
        if (g.isOwned('r_grants') && p.research < 1) {
          labCand = C.filter((c) => c.playable && c.status !== 'fallen' && c.labLevel < 3 && !c.shutdown && c.detected !== undefined)
            .sort((a, b) => b.wealth * Math.sqrt(b.population) * (1 - b.lost / b.population)
              - a.wealth * Math.sqrt(a.population) * (1 - a.lost / a.population))
            .slice(0, P.labNations)
            .sort((a, b) => a.labLevel - b.labLevel)[0] || null;
        }
        const total = spentLabs + spentUpg;
        const wantLab = labCand && (!nextUpg || total === 0 || spentLabs / total < P.labShare);
        if (wantLab) {
          if (g.actionCost(labCand.index, 'fundLab') <= p.ops && act(g, labCand.index, 'fundLab')) continue;
          // can't afford the lab yet: still buy a cheap upgrade if that doesn't delay the lab much
          if (nextUpg && g.canBuy(nextUpg).ok && UPG.get(nextUpg).cost <= 5) { spentUpg += UPG.get(nextUpg).cost; g.buy(nextUpg); continue; }
          break;
        }
        if (nextUpg) {
          const r = g.canBuy(nextUpg);
          if (r.ok) { spentUpg += UPG.get(nextUpg).cost; g.buy(nextUpg); continue; }
          if (/awareness|believes/.test(r.reason || '')) {
            // gated: buy the next affordable one instead
            const alt = prio.find((id) => !g.isOwned(id) && g.canBuy(id).ok);
            if (alt) { spentUpg += UPG.get(alt).cost; g.buy(alt); continue; }
          }
          if (labCand && g.actionCost(labCand.index, 'fundLab') <= p.ops - UPG.get(nextUpg).cost && act(g, labCand.index, 'fundLab')) continue;
        }
        break;
      }
    },
  };
}

// --------------------------------------------------------------------------- run one game
function closure(ids) {
  const out = new Set();
  const add = (id) => { if (out.has(id)) return; out.add(id); for (const r of UPG.get(id).requires) add(r); };
  for (const id of ids) add(id);
  return [...out];
}

function run({ threat, difficulty, seed, bot, ban = [], gift = [], trace = false }) {
  const g = new Game({ geo: GEO, threat, difficulty, aiName: 'NEXUS', seed });
  const ev = {};
  let over = null;
  const issues = [];
  const boughtDay = {};
  let lostAtRes = null;
  for (const t of ['news', 'bubble:add', 'bubble:remove', 'transmission', 'detected', 'evolve', 'upgrade', 'action', 'research:complete', 'gameover']) {
    g.on(t, (e) => {
      ev[t] = (ev[t] || 0) + 1;
      if (t === 'gameover') { if (over) issues.push('gameover twice'); over = e; }
      if (t === 'upgrade') boughtDay[e.upgradeId] = Math.floor(g.day);
      if (t === 'research:complete') lostAtRes = g.world.lost / g.world.population;
      if (trace && flag('log') && t === 'action' && /quarantine|shutdown/.test(e.actionId)) {
        const c = g.countries[e.countryIndex];
        console.log(`    d${Math.floor(g.day)} ${e.actionId} ${e.active ? 'ON ' : 'off'} ${c.name} inf ${(c.infected / c.population).toFixed(3)} lost ${(c.lost / c.population).toFixed(3)} trust ${g.player.trust.toFixed(2)}`);
      }
      if (trace && flag('log') && t === 'evolve') console.log(`    d${Math.floor(g.day)} AI evolves ${e.traitId}`);
      if (t === 'news' && (!e.text || /\{|undefined|NaN/.test(e.text))) issues.push(`bad news: ${e.text}`);
      if (t === 'transmission' && !['cable', 'satellite', 'wireless'].includes(e.route)) issues.push(`bad route ${e.route}`);
    });
  }
  const b = makeBot(bot, seed * 7 + 3, new Set(ban));
  const giftIds = closure(gift);
  let gifted = giftIds.length === 0;
  let lastDay = -1, shutdownDays = 0, quarantineDays = 0;
  while (g.status === 'playing') {
    g.advance(STEP);
    const d = Math.floor(g.day);
    if (d === lastDay) continue;
    lastDay = d;
    if (!gifted && g.stats.firstDetectionDay != null && d >= g.stats.firstDetectionDay + 10) {
      for (const id of giftIds) g._grant(id);
      gifted = true;
    }
    b.daily(g);
    for (const c of g.countries) { if (c.shutdown) shutdownDays++; if (c.quarantined) quarantineDays++; }
    if (trace && d % 20 === 0) {
      const w = g.world;
      console.log(`  d${d} inf ${(w.infected / 1e6).toFixed(0)}M lost ${(w.lost / w.population * 100).toFixed(1)}% ic ${w.infectedCountries} det ${w.detectedCountries} fall ${w.fallenCountries} aw ${g.ai.awareness.toFixed(2)} esc ${g.ai.escalation.toFixed(2)} res ${g.player.research.toFixed(3)} rate ${(g.player.researchRate * 1000).toFixed(2)}e-3 trust ${g.player.trust.toFixed(2)} ops ${g.player.ops.toFixed(0)} traits ${g.ai.traits.length} upg ${g._owned.size} labs ${g.countries.reduce((s, c) => s + c.labLevel, 0)} q ${g.countries.filter((c) => c.quarantined).length} sd ${g.countries.filter((c) => c.shutdown).length} dep ${g.player.deployProgress.toFixed(2)}`);
    }
    if (d % 10 === 0) {
      for (const c of g.countries) {
        if (!(Number.isFinite(c.infected) && Number.isFinite(c.lost))) issues.push(`NaN in ${c.name}`);
        if (c.infected + c.lost > c.population * (1 + 1e-9) + 1) issues.push(`overflow in ${c.name}`);
        if (c.infected < 0 || c.lost < 0) issues.push(`negative in ${c.name}`);
      }
      if (!Number.isFinite(g.player.ops) || !Number.isFinite(g.player.research) || !Number.isFinite(g.player.trust)) issues.push('NaN player');
      for (const bb of g.bubbles.values()) if (bb.expiresDay < g.day - STEP) issues.push('stale bubble');
      if (g.bubbles.size > 6) issues.push('too many bubbles');
    }
  }
  if ((ev['bubble:add'] || 0) !== (ev['bubble:remove'] || 0)) issues.push('bubble add/remove mismatch');
  const firstPop = g._firstDetectedIndex != null ? g.countries[g._firstDetectedIndex].population : null;
  if (firstPop != null && firstPop < 1e5) issues.push(`first detection in a tiny territory (pop ${firstPop})`);
  return {
    won: g.status === 'won', days: g.day, lostPct: g.world.lost / g.world.population, research: g.player.research,
    firstDet: g.stats.firstDetectionDay, resDay: g.stats.researchCompleteDay, deployDay: g.stats.deployCompleteDay,
    opsEarned: g.stats.opsEarned, bubbles: g.stats.bubblesCollected, lostAtRes,
    traits: g.ai.traits.length, owned: g._owned.size, bought: g.stats.upgradesBought, boughtDay,
    labs: g.countries.reduce((s, c) => s + c.labLevel, 0), shutdownDays, quarantineDays,
    reason: over && over.reason, ev, issues, fallen: g.world.fallenCountries,
  };
}

// --------------------------------------------------------------------------- worker pool
if (!isMainThread) {
  parentPort.on('message', (job) => {
    if (job === 'exit') process.exit(0);
    parentPort.postMessage({ id: job.id, res: run(job) });
  });
}

async function runAll(jobs) {
  const n = Math.max(1, Math.min(os.cpus().length, 8, jobs.length));
  if (n === 1 || jobs.length < 8) return jobs.map((j) => run(j));
  const out = new Array(jobs.length);
  let next = 0;
  await Promise.all(Array.from({ length: n }, () => new Promise((resolve, reject) => {
    const w = new Worker(new URL(import.meta.url));
    const feed = () => {
      if (next >= jobs.length) { w.postMessage('exit'); resolve(); return; }
      const id = next++;
      w.postMessage({ ...jobs[id], id });
    };
    w.on('message', (m) => { out[m.id] = m.res; feed(); });
    w.on('error', reject);
    feed();
  })));
  return out;
}

// --------------------------------------------------------------------------- stats helpers
const median = (xs) => { const s = [...xs].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const pct = (x) => `${(x * 100).toFixed(0)}%`;
const pad = (s, n) => String(s).padEnd(n);
const FIRST = +opt('first', 0);
const seedOf = (k) => 1000 + (k + FIRST) * 7919;
const summarize = (res) => ({
  win: mean(res.map((r) => (r.won ? 1 : 0))),
  lostMed: median(res.map((r) => r.lostPct)), lostMean: mean(res.map((r) => r.lostPct)),
  days: median(res.map((r) => r.days)), owned: median(res.map((r) => r.owned)),
});

// --------------------------------------------------------------------------- checks
function checks() {
  let ok = true;
  const missing = GEO.filter((c) => !hasStats(c.id));
  console.log(`country stats: ${GEO.length - missing.length}/${GEO.length} covered${missing.length ? ' MISSING: ' + missing.map((c) => c.id + ' ' + c.name).join(', ') : ''}`);
  if (missing.length) ok = false;
  console.log(`news templates: ${templateCount()}`);
  const a = run({ threat: 'swarm', difficulty: 'normal', seed: 4242, bot: 'greedy' });
  const b = run({ threat: 'swarm', difficulty: 'normal', seed: 4242, bot: 'greedy' });
  const same = a.days === b.days && a.lostPct === b.lostPct && a.research === b.research && JSON.stringify(a.ev) === JSON.stringify(b.ev);
  console.log(`determinism (same seed twice): ${same ? 'OK' : 'FAIL'}`);
  if (!same) ok = false;
  const c = run({ threat: 'swarm', difficulty: 'normal', seed: 4243, bot: 'greedy' });
  console.log(`different seed differs: ${c.days !== a.days || c.lostPct !== a.lostPct ? 'OK' : 'suspicious'}`);
  console.log('events fired (seed 4242, greedy):', JSON.stringify(a.ev));
  if (a.issues.length || c.issues.length) { ok = false; console.log('  issues:', a.issues.concat(c.issues).slice(0, 5)); }
  const g = new Game({ geo: GEO, seed: 9 });
  g.speed = 3; for (let i = 0; i < 600; i++) g.tick(1 / 60);
  console.log(`tick(): 10s at speed 3 -> day ${g.day.toFixed(2)} (expect ~20)`);
  g.speed = 0; const d0 = g.day; g.tick(1); console.log(`paused tick no-op: ${g.day === d0 ? 'OK' : 'FAIL'}`);
  console.log(`date: ${g.date.toISOString().slice(0, 10)}`);
  // Upgrade definitions are well-formed.
  const ICONS = new Set('shield firewall cable satellite wifi lab flask chip brain eye radar megaphone handshake money lock power globe bolt drone factory robot skull mask code server plane users scale target search clock heart'.split(' '));
  const cells = new Set();
  for (const u of UPGRADES) {
    const key = `${u.tab}:${u.row}:${u.col}`;
    if (cells.has(key)) { ok = false; console.log(`  FAIL: grid cell clash ${key}`); }
    cells.add(key);
    if (!ICONS.has(u.icon)) { ok = false; console.log(`  FAIL: bad icon ${u.id}`); }
    for (const r of u.requires) if (!UPG.has(r) || UPG.get(r).row >= u.row) { ok = false; console.log(`  FAIL: ${u.id} requires ${r} (missing or not above)`); }
  }
  console.log(`upgrade defs: ${UPGRADES.length} upgrades, grid/icons/requires ${ok ? 'OK' : 'FAIL'}`);
  // Action / upgrade semantics.
  {
    const h = new Game({ geo: GEO, seed: 77 });
    const expect = (cond, msg) => { if (!cond) { ok = false; console.log('  FAIL: ' + msg); } };
    expect(h.actionState(4, 'investigate') === 'locked', 'investigate locked before Field Agents');
    expect(!h.canBuy('r_grants').ok, 'grants need detection');
    h.buy('r_field');
    expect(h.actionState(4, 'investigate') === 'available', 'investigate available');
    h.advance(150);
    h.player.ops = 999;
    for (const id of ['c_monitor', 'c_firewall', 'c_traffic', 'c_airgap', 'c_patch', 'c_gridkill', 'r_grants']) h.buy(id);
    const big = h.countries.filter((c) => c.aiPresent && c.detected).sort((a, b) => b.infected - a.infected)[0];
    expect(h.doAction(big.index, 'shutdown') && h.actionState(big.index, 'shutdown') === 'active', 'shutdown toggles on');
    expect(h.doAction(big.index, 'shutdown') && !big.shutdown, 'shutdown toggles off');
    expect(h.doAction(big.index, 'quarantine') && big.quarantined, 'quarantine on');
    for (let k = 0; k < 3; k++) h.doAction(5, 'fundLab');
    expect(h.countries[5].labLevel === 3 && h.actionState(5, 'fundLab') === 'active', 'lab maxes at 3');
    expect(h.actionState(big.index, 'deployKillSwitch') === 'locked', 'deploy locked before research');
    h.player.research = 0.9999; h.advance(2);
    expect(h.player.research === 1, 'research completes');
    expect(h.doAction(big.index, 'deployKillSwitch') && big.killSwitchDeployed && big.status !== 'infected', 'manual deploy');
    h.advance(400);
    console.log(`action semantics: ${ok ? 'OK' : 'FAIL'} (forced game ended: ${h.status}, liberated ${h.stats.countriesLiberated})`);
  }
  return ok;
}

// --------------------------------------------------------------------------- modes
async function tableMode() {
  const SEEDS = +opt('seeds', 16);
  const THREATS = list(opt('threat', 'swarm,optimizer,hydra,ghost'));
  const DIFFS = list(opt('diff', 'casual,normal,brutal'));
  const BOTS = list(opt('bot', 'idle,greedy'));
  const ban = list(opt('ban', ''));
  const t0 = Date.now();
  const jobs = [];
  for (const bot of BOTS) for (const difficulty of DIFFS) for (const threat of THREATS)
    for (let k = 0; k < SEEDS; k++) jobs.push({ threat, difficulty, seed: seedOf(k), bot, ban, gift: list(opt('with', '')), trace: flag('trace') && k === 0 });
  const res = flag('trace') ? jobs.map((j) => run(j)) : await runAll(jobs);
  const rows = [];
  let allIssues = [];
  let k = 0;
  for (const bot of BOTS) for (const difficulty of DIFFS) for (const threat of THREATS) {
    const rs = res.slice(k, k + SEEDS); k += SEEDS;
    rs.forEach((r, i) => {
      allIssues = allIssues.concat(r.issues.map((x) => `${bot}/${difficulty}/${threat}/seed${i}: ${x}`));
      if (flag('verbose')) console.log(bot, difficulty, threat, i, r.won ? 'WIN ' : 'LOSE', Math.round(r.days), pct(r.lostPct), r.research.toFixed(2), 'det', r.firstDet, 'res', r.resDay, 'traits', r.traits, 'owned', r.owned, 'labs', r.labs, 'qd', r.quarantineDays, 'sd', r.shutdownDays, 'ops', Math.round(r.opsEarned), 'bub', r.bubbles);
    });
    const reasons = {};
    for (const r of rs) if (!r.won) { const key = /trust/i.test(r.reason) ? 'trust' : /Every nation/.test(r.reason) ? 'allfallen' : /assimilated/.test(r.reason) ? 'assim' : 'other'; reasons[key] = (reasons[key] || 0) + 1; }
    rows.push({
      bot, difficulty, threat, ...summarize(rs),
      research: median(rs.map((r) => r.research)), det: median(rs.map((r) => r.firstDet ?? 999)),
      resDay: median(rs.filter((r) => r.resDay != null).map((r) => r.resDay)),
      reasons: Object.entries(reasons).map(([kk, v]) => `${kk}:${v}`).join(' '),
    });
  }
  console.log(`\n${pad('bot', 9)}${pad('diff', 8)}${pad('threat', 10)}${pad('win', 6)}${pad('medDays', 9)}${pad('medLost', 9)}${pad('medRes', 8)}${pad('det@', 6)}${pad('resDone@', 9)}${pad('owned', 7)}losses`);
  for (const r of rows) {
    console.log(`${pad(r.bot, 9)}${pad(r.difficulty, 8)}${pad(r.threat, 10)}${pad(pct(r.win), 6)}${pad(Math.round(r.days), 9)}${pad(pct(r.lostMed), 9)}${pad(r.research.toFixed(2), 8)}${pad(r.det, 6)}${pad(Number.isNaN(r.resDay) ? '-' : r.resDay, 9)}${pad(r.owned, 7)}${r.reasons}`);
  }
  for (const bot of BOTS) for (const d of DIFFS) {
    const rs = rows.filter((r) => r.bot === bot && r.difficulty === d);
    console.log(`  ${bot}/${d}: overall win ${pct(mean(rs.map((r) => r.win)))}, median days ${Math.round(mean(rs.map((r) => r.days)))}, median lost ${pct(mean(rs.map((r) => r.lostMed)))}, owned ${mean(rs.map((r) => r.owned)).toFixed(1)}`);
  }
  console.log(`\n${jobs.length} games in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (allIssues.length) {
    console.log(`ISSUES (${allIssues.length}):`);
    for (const x of [...new Set(allIssues)].slice(0, 30)) console.log('  ' + x);
    process.exitCode = 1;
  } else console.log('sanity: no NaN / overflow / stale bubbles / duplicate gameovers / tiny first detections');
}

/** Compare configurations on identical seeds (normal difficulty unless --diff). */
async function compareMode(kind) {
  const SEEDS = +opt('seeds', 40);
  const THREATS = list(opt('threat', 'swarm,optimizer,hydra,ghost'));
  const difficulty = opt('diff', 'normal');
  const bot = opt('bot', 'greedy');
  const which = opt(kind, 'all');
  const ids = which === 'all' ? UPGRADES.map((u) => u.id) : list(which);
  const configs = new Map(); // key -> {ban, gift}
  const keyOf = (c) => `ban:${(c.ban || []).join('+')}|gift:${(c.gift || []).slice().sort().join('+')}`;
  const pairs = [];
  for (const id of ids) {
    let base, test;
    if (kind === 'gift') {
      const pre = closure(UPG.get(id).requires);
      base = { gift: pre, ban: [id] }; test = { gift: [...pre, id] };
    } else { base = {}; test = { ban: [id] }; }
    configs.set(keyOf(base), base); configs.set(keyOf(test), test);
    pairs.push({ id, base: keyOf(base), test: keyOf(test) });
  }
  const t0 = Date.now();
  const jobs = [];
  const keys = [...configs.keys()];
  for (const key of keys) for (const threat of THREATS) for (let k = 0; k < SEEDS; k++)
    jobs.push({ key, threat, difficulty, seed: seedOf(k), bot, ...configs.get(key) });
  const res = await runAll(jobs);
  const byKey = new Map(keys.map((k) => [k, []]));
  jobs.forEach((j, i) => byKey.get(j.key).push(res[i]));
  console.log(`\n${kind} comparison — ${difficulty}, bot ${bot}, ${SEEDS} seeds × ${THREATS.length} threats (paired seeds)`);
  console.log(`${pad('upgrade', 16)}${pad('cost', 6)}${pad('win', 14)}${pad('medLost', 14)}${pad('meanLost', 16)}${pad('Δlost±se', 14)}${pad('owned', 10)}verdict`);
  const out = [];
  for (const p of pairs) {
    const A = byKey.get(p.base), B = byKey.get(p.test);
    const a = summarize(A), b = summarize(B);
    const diffs = A.map((r, i) => B[i].lostPct - r.lostPct);
    const dm = mean(diffs), se = Math.sqrt(mean(diffs.map((x) => (x - dm) ** 2)) / diffs.length);
    const dwin = b.win - a.win;
    // For gifts "good" means: lost down or win up. For bans the sign flips (banning a good upgrade hurts).
    const sgn = kind === 'gift' ? 1 : -1;
    const benefit = sgn * (-dm), winBenefit = sgn * dwin;
    const ownedGain = sgn * (b.owned - a.owned);
    const eco = /opsAdd|opsMult|breachBonus/.test(JSON.stringify(UPG.get(p.id).fx || {}));
    const clear = benefit > 2 * se || winBenefit >= 0.04 || (eco && ownedGain >= 1.5 && benefit > -se);
    const verdict = clear ? 'clear +' : benefit > 0 ? 'weak +' : 'NONE/–';
    out.push({ id: p.id, a, b, dm, se, verdict });
    console.log(`${pad(p.id, 16)}${pad(UPG.get(p.id).cost, 6)}${pad(`${pct(a.win)}→${pct(b.win)}`, 14)}${pad(`${pct(a.lostMed)}→${pct(b.lostMed)}`, 14)}${pad(`${(a.lostMean * 100).toFixed(1)}→${(b.lostMean * 100).toFixed(1)}`, 16)}${pad(`${(dm * 100).toFixed(1)}±${(se * 100).toFixed(1)}`, 14)}${pad(`${a.owned}→${b.owned}`, 10)}${verdict}`);
  }
  console.log(`\n${jobs.length} games in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

async function buysMode() {
  const SEEDS = +opt('seeds', 20);
  const THREATS = list(opt('threat', 'swarm,optimizer,hydra,ghost'));
  const bot = opt('bot', 'greedy');
  const jobs = [];
  for (const threat of THREATS) for (let k = 0; k < SEEDS; k++) jobs.push({ threat, difficulty: opt('diff', 'normal'), seed: seedOf(k), bot });
  const res = await runAll(jobs);
  console.log(`\nWhen does the ${bot} bot own each upgrade? (normal; median day among games where bought; research done median ${median(res.filter((r) => r.resDay != null).map((r) => r.resDay))}, deploy done ${median(res.filter((r) => r.deployDay != null).map((r) => r.deployDay))})`);
  const rs2 = res.filter((r) => r.lostAtRes != null);
  console.log(`lost when research completes: mean ${(mean(rs2.map((r) => r.lostAtRes)) * 100).toFixed(1)}% -> at game end ${(mean(rs2.map((r) => r.lostPct)) * 100).toFixed(1)}% (${rs2.length} games)`);
  console.log(`median owned at end ${median(res.map((r) => r.owned))}; labs ${median(res.map((r) => r.labs))}; quarantine-days ${median(res.map((r) => r.quarantineDays))}; shutdown-days ${median(res.map((r) => r.shutdownDays))}`);
  for (const u of UPGRADES) {
    const days = res.map((r) => r.boughtDay[u.id]).filter((d) => d != null);
    const beforeRes = res.filter((r) => r.boughtDay[u.id] != null && (r.resDay == null || r.boughtDay[u.id] < r.resDay)).length;
    console.log(`${pad(u.id, 16)}${pad(u.cost, 5)}bought ${pad(pct(days.length / res.length), 6)}median day ${pad(days.length ? median(days) : '-', 6)} before research done ${pct(beforeRes / res.length)}`);
  }
}

if (isMainThread) {
  if (flag('check')) {
    const ok = checks();
    if (!flag('table')) process.exit(ok ? 0 : 1);
  }
  if (opt('gift')) await compareMode('gift');
  else if (opt('ablate')) await compareMode('ablate');
  else if (flag('buys')) await buysMode();
  else await tableMode();
}
