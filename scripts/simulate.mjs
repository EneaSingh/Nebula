#!/usr/bin/env node
// Headless balance harness for KILL SWITCH.
//   node scripts/simulate.mjs [--seeds 20] [--threat swarm,ghost] [--diff normal] [--bot idle,greedy] [--check] [--verbose]
// Runs N seeds per threat × difficulty × bot and prints a summary table.
import GEO from '../src/data/geo.js';
import { Game, STEP } from '../src/sim/game.js';
import { hasStats } from '../src/sim/countryStats.js';
import { templateCount } from '../src/sim/news.js';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const flag = (name) => args.includes(`--${name}`);
const SEEDS = +opt('seeds', 16);
const THREATS = opt('threat', 'swarm,optimizer,hydra,ghost').split(',');
const DIFFS = opt('diff', 'casual,normal,brutal').split(',');
const BOTS = opt('bot', 'idle,greedy').split(',');
const VERBOSE = flag('verbose');
const TRACE = flag('trace');

// --------------------------------------------------------------------------- bots
const idleBot = { name: 'idle', daily() {} };

const PRIORITY = [
  'r_field', 'c_monitor', 'o_briefings', 'r_grants', 'o_funding', 'c_firewall', 'r_reverse', 'c_traffic',
  'c_airgap', 'r_compute', 'o_intel', 'r_honeypots', 'o_literacy', 'c_patch', 'r_sandbox', 'o_coalition',
  'r_quantum', 'o_bonds', 'r_interp', 'c_cable', 'o_command', 'c_zerotrust', 'c_hardened', 'r_rollout',
  'c_counterdrone', 'r_firmware', 'o_civdef', 'r_deadhand', 'c_gridkill', 'o_powers', 'o_analog', 'c_jamming',
  'c_emp', 'o_rapid',
];

function makeGreedy(rng) {
  // Bot-side randomness (reaction delays) uses its own PRNG so the sim stays deterministic.
  let s = rng >>> 0 || 1;
  const rand = () => { s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0; return s / 4294967296; };
  const qSince = new Map();
  return {
    name: 'greedy',
    daily(g) {
      const C = g.countries, p = g.player;
      // Collect bubbles (a human misses some).
      for (const id of [...g.bubbles.keys()]) if (rand() < 0.7) g.collectBubble(id);
      // Labs: target the richest healthy nations.
      const labTarget = Math.min(10, 3 + Math.floor(g.day / 60));
      if (g.isOwned('r_grants') && p.research < 1) {
        const cand = C.filter((c) => c.playable && c.status !== 'fallen' && c.labLevel < 3 && !c.shutdown)
          .sort((a, b) => b.wealth * Math.sqrt(b.population) * (1 - b.lost / b.population)
            - a.wealth * Math.sqrt(a.population) * (1 - a.lost / a.population))
          .slice(0, labTarget);
        for (const c of cand) {
          if (g.actionCost(c.index, 'fundLab') <= p.ops - 2) g.doAction(c.index, 'fundLab');
        }
      }
      // Upgrades in priority order (save for the next one).
      for (const id of PRIORITY) {
        if (g.isOwned(id)) continue;
        const r = g.canBuy(id);
        if (r.ok) { g.buy(id); continue; }
        if (/Ops/.test(r.reason || '')) break;
      }
      // Investigate: before detection sweep hubs; after, neighbours of known infections.
      if (g.isOwned('r_field') && p.ops >= 6) {
        let target = null;
        if (!g.world.detectedCountries) {
          target = C.filter((c) => c.playable && !c.detected && g.canDoAction(c.index, 'investigate').ok)
            .sort((a, b) => b.digital * Math.sqrt(b.population) - a.digital * Math.sqrt(a.population))[rand() < 0.5 ? 0 : 1];
        } else if (rand() < 0.5) {
          const front = new Set();
          for (const c of C) if (c.detected) for (const l of g.links[c.index]) if (!C[l.to].detected) front.add(l.to);
          target = [...front].map((i) => C[i]).filter((c) => g.canDoAction(c.index, 'investigate').ok)
            .sort((a, b) => b.population * b.digital - a.population * a.digital)[0];
        }
        if (target) g.doAction(target.index, 'investigate');
      }
      // Quarantine fresh hot spots early (before they seed their neighbours), release after a while.
      if (g.isOwned('c_airgap') && !process.env.NOQ) {
        for (const c of C.filter((x) => x.quarantined)) {
          const since = g.day - (qSince.get(c.index) ?? g.day);
          if (p.trust < 0.4 || since > 70 || c.killSwitchDeployed) g.doAction(c.index, 'quarantine');
        }
        if (p.trust > 0.55 && C.filter((c) => c.quarantined).length < 3) {
          const hot = C.filter((c) => c.detected && !c.quarantined && c.status !== 'fallen' && !c.killSwitchDeployed
            && g.day - (qSince.get(c.index) ?? -1e9) > 100)
            .sort((a, b) => b.infected - a.infected)[0];
          if (hot && g.canDoAction(hot.index, 'quarantine').ok) { g.doAction(hot.index, 'quarantine'); qSince.set(hot.index, g.day); }
        }
      }
      // Endgame: push the Kill Switch to the worst-hit nations.
      if (p.research >= 1 && !p.killSwitchDeployed) {
        const worst = C.filter((c) => c.playable && !c.killSwitchDeployed && c.aiPresent)
          .sort((a, b) => b.infected - a.infected)[0];
        if (worst && g.canDoAction(worst.index, 'deployKillSwitch').ok) g.doAction(worst.index, 'deployKillSwitch');
      }
    },
  };
}

// --------------------------------------------------------------------------- run one game
function run({ threat, difficulty, seed, bot }) {
  const g = new Game({ geo: GEO, threat, difficulty, aiName: 'NEXUS', seed });
  const ev = {};
  let over = null;
  const issues = [];
  for (const t of ['news', 'bubble:add', 'bubble:remove', 'transmission', 'detected', 'evolve', 'upgrade', 'action', 'research:complete', 'gameover']) {
    g.on(t, (e) => {
      ev[t] = (ev[t] || 0) + 1;
      if (t === 'gameover') { if (over) issues.push('gameover twice'); over = e; }
      if (t === 'news' && (!e.text || /\{|undefined|NaN/.test(e.text))) issues.push(`bad news: ${e.text}`);
      if (t === 'transmission' && !['cable', 'satellite', 'wireless'].includes(e.route)) issues.push(`bad route ${e.route}`);
    });
  }
  const b = bot === 'greedy' ? makeGreedy(seed * 7 + 3) : idleBot;
  let lastDay = -1;
  while (g.status === 'playing') {
    g.advance(STEP);
    const d = Math.floor(g.day);
    if (d !== lastDay) {
      lastDay = d;
      b.daily(g);
      if (TRACE && d % 20 === 0) {
        const w = g.world;
        console.log(`  d${d} inf ${(w.infected / 1e6).toFixed(0)}M lost ${(w.lost / w.population * 100).toFixed(1)}% ic ${w.infectedCountries} det ${w.detectedCountries} fall ${w.fallenCountries} aw ${g.ai.awareness.toFixed(2)} esc ${g.ai.escalation.toFixed(2)} res ${g.player.research.toFixed(3)} rate ${(g.player.researchRate * 1000).toFixed(2)}e-3 trust ${g.player.trust.toFixed(2)} ops ${g.player.ops.toFixed(0)} traits ${g.ai.traits.length} upg ${g.stats.upgradesBought} labs ${g.countries.reduce((s, c) => s + c.labLevel, 0)} dep ${g.player.deployProgress.toFixed(2)}`);
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
  }
  if ((ev['bubble:add'] || 0) !== (ev['bubble:remove'] || 0)) issues.push('bubble add/remove mismatch');
  return {
    won: g.status === 'won', days: g.day, lostPct: g.world.lost / g.world.population, research: g.player.research,
    firstDet: g.stats.firstDetectionDay, resDay: g.stats.researchCompleteDay, traits: g.ai.traits.length,
    upgrades: g.stats.upgradesBought, firstPop: g._firstDetectedIndex != null ? g.countries[g._firstDetectedIndex].population : null, reason: over && over.reason, ev, issues, fallen: g.world.fallenCountries,
    g,
  };
}

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
  // Real-time tick path.
  const g = new Game({ geo: GEO, seed: 9 });
  g.speed = 3; for (let i = 0; i < 600; i++) g.tick(1 / 60);
  console.log(`tick(): 10s at speed 3 -> day ${g.day.toFixed(2)} (expect ~20)`);
  g.speed = 0; const d0 = g.day; g.tick(1); console.log(`paused tick no-op: ${g.day === d0 ? 'OK' : 'FAIL'}`);
  console.log(`date: ${g.date.toISOString().slice(0, 10)}`);
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

// --------------------------------------------------------------------------- main
const median = (xs) => { const s = [...xs].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const pct = (x) => `${(x * 100).toFixed(0)}%`;

if (flag('check')) {
  const ok = checks();
  if (!flag('table')) process.exit(ok ? 0 : 1);
}

const t0 = Date.now();
const rows = [];
let allIssues = [];
for (const bot of BOTS) {
  for (const difficulty of DIFFS) {
    for (const threat of THREATS) {
      const res = [];
      for (let k = 0; k < SEEDS; k++) {
        const r = run({ threat, difficulty, seed: 1000 + k * 7919, bot });
        res.push(r);
        allIssues = allIssues.concat(r.issues.map((x) => `${bot}/${difficulty}/${threat}/seed${k}: ${x}`));
        if (r.firstPop != null && r.firstPop < 1e6) allIssues.push(`${bot}/${difficulty}/${threat}/seed${k}: first detection in a tiny territory (pop ${r.firstPop})`);
        if (VERBOSE) console.log(bot, difficulty, threat, k, r.won ? 'WIN ' : 'LOSE', Math.round(r.days), pct(r.lostPct), r.research.toFixed(2), 'det', r.firstDet, 'res', r.resDay, 'traits', r.traits, 'upg', r.upgrades, r.won ? '' : r.reason.slice(0, 40));
      }
      const wins = res.filter((r) => r.won).length;
      const reasons = {};
      for (const r of res) if (!r.won) { const k = /trust/i.test(r.reason) ? 'trust' : /Every nation/.test(r.reason) ? 'allfallen' : /assimilated/.test(r.reason) ? 'assim' : 'other'; reasons[k] = (reasons[k] || 0) + 1; }
      rows.push({
        bot, difficulty, threat, win: wins / res.length,
        days: median(res.map((r) => r.days)), lost: median(res.map((r) => r.lostPct)),
        research: median(res.map((r) => r.research)), det: median(res.map((r) => r.firstDet ?? 999)),
        resDay: median(res.filter((r) => r.resDay != null).map((r) => r.resDay)),
        reasons: Object.entries(reasons).map(([k, v]) => `${k}:${v}`).join(' '),
      });
    }
  }
}

const pad = (s, n) => String(s).padEnd(n);
console.log(`\n${pad('bot', 7)}${pad('diff', 8)}${pad('threat', 10)}${pad('win', 6)}${pad('medDays', 9)}${pad('medLost', 9)}${pad('medRes', 8)}${pad('det@', 6)}${pad('resDone@', 9)}losses`);
for (const r of rows) {
  console.log(`${pad(r.bot, 7)}${pad(r.difficulty, 8)}${pad(r.threat, 10)}${pad(pct(r.win), 6)}${pad(Math.round(r.days), 9)}${pad(pct(r.lost), 9)}${pad(r.research.toFixed(2), 8)}${pad(r.det, 6)}${pad(Number.isNaN(r.resDay) ? '-' : r.resDay, 9)}${r.reasons}`);
}
for (const bot of BOTS) for (const d of DIFFS) {
  const rs = rows.filter((r) => r.bot === bot && r.difficulty === d);
  console.log(`  ${bot}/${d}: overall win ${pct(rs.reduce((s, r) => s + r.win, 0) / rs.length)}`);
}
console.log(`\n${rows.length * SEEDS} games in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (allIssues.length) {
  console.log(`ISSUES (${allIssues.length}):`);
  for (const x of [...new Set(allIssues)].slice(0, 30)) console.log('  ' + x);
  process.exitCode = 1;
} else console.log('sanity: no NaN / overflow / stale bubbles / duplicate gameovers');
