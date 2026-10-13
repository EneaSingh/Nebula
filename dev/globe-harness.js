// Dev harness for the globe module: mock game + controls. Open /dev/globe.html.
import GEO from '../src/data/geo.js';
import { Globe } from '../src/globe/globe.js';
import { MockGame } from './mock-game.js';

const params = new URLSearchParams(location.search);
const globe = new Globe(document.getElementById('globe'), { geo: GEO, quality: params.get('quality') || 'auto' });
let game = params.has('menu') ? null : new MockGame(GEO, globe);
let paused = params.has('paused');
const $ = (id) => document.getElementById(id);
const tip = $('tip');

globe.onCountryHover = (i, x, y) => {
  $('hov').textContent = i == null ? '-' : `${i} ${GEO[i].name}`;
  if (i == null) { tip.style.display = 'none'; return; }
  tip.style.display = 'block';
  tip.style.left = x + 14 + 'px';
  tip.style.top = y + 14 + 'px';
  tip.textContent = GEO[i].name;
};
globe.onCountryClick = (i) => {
  $('clk').textContent = i == null ? 'ocean' : `${i} ${GEO[i].name}`;
  globe.setSelected(i);
  window.__lastClick = i;
};
globe.onBubbleClick = (id) => {
  $('clk').textContent = 'bubble ' + id;
  window.__lastBubble = id;
  if (game) game.collectBubble(id);
};

$('menu').onclick = () => { game = game ? null : new MockGame(GEO, globe); };
$('pause').onclick = () => { paused = !paused; };
$('arc').onclick = () => game && game.burstArcs(8);
$('bub').onclick = () => game && game.spawnBubble();
$('sel').onclick = () => { const i = GEO.findIndex((c) => c.name === 'Brazil'); globe.setSelected(i); globe.focusCountry(i); };

let last = performance.now(), acc = 0, frames = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (game && !paused) game.tick(dt);
  globe.update(dt, game);
  globe.render();
  acc += dt; frames++;
  if (acc > 0.5) { $('fps').textContent = (frames / acc).toFixed(0); acc = 0; frames = 0; if (game) $('day').textContent = game.day.toFixed(0); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Regression stress: rapid bubble churn (dupes, unknown ids, removal mid-pop) + arcs, while frames run.
function stress(seconds = 5) {
  const t0 = performance.now();
  let n = 0;
  const live = [];
  return new Promise((resolve) => {
    const step = () => {
      for (let k = 0; k < 6; k++) {
        const id = 's' + (n++);
        const kind = ['breach', 'intel', 'research', 'bogus'][n % 4];
        const ci = Math.floor(Math.random() * (GEO.length + 3)) - 1; // includes invalid indices
        globe.addBubble({ id, kind, countryIndex: ci, value: 1 });
        globe.addBubble({ id, kind, countryIndex: ci, value: 1 }); // duplicate
        live.push(id);
        if (Math.random() < 0.5) globe.removeBubble(id, Math.random() < 0.5); // still popping
        if (live.length > 30) globe.removeBubble(live.splice(Math.floor(Math.random() * live.length), 1)[0], true);
        globe.removeBubble('unknown-' + n, true);
        globe.addArc(Math.floor(Math.random() * GEO.length), Math.floor(Math.random() * GEO.length), ['cable', 'satellite', 'wireless', 'x'][n % 4]);
        globe.addArc(-1, 9999, 'cable');
      }
      globe.setSelected(Math.random() < 0.2 ? null : Math.floor(Math.random() * GEO.length));
      if (performance.now() - t0 < seconds * 1000) requestAnimationFrame(step);
      else { for (const id of live) globe.removeBubble(id, false); resolve(n); }
    };
    requestAnimationFrame(step);
  });
}
if (params.has('stress')) stress(+params.get('stress') || 5).then((n) => { window.__stressDone = n; });

// Synchronous variant: thousands of globe.update() calls interleaved with churn; returns counts or the error.
function stressSync(frames = 3000) {
  const live = [];
  try {
    for (let f = 0; f < frames; f++) {
      for (let k = 0; k < 3; k++) {
        const id = 'z' + f + '_' + k;
        globe.addBubble({ id, kind: ['breach', 'intel', 'research'][k], countryIndex: (f * 7 + k) % GEO.length, value: 1 });
        globe.addBubble({ id, kind: 'intel', countryIndex: 3, value: 1 });
        live.push(id);
        if ((f + k) % 3 === 0) globe.removeBubble(id, true);
        if (live.length > 40) globe.removeBubble(live.shift(), f % 2 === 0);
        globe.removeBubble('nope' + f, true);
        globe.addArc(f % GEO.length, (f * 13) % GEO.length, ['cable', 'satellite', 'wireless'][f % 3]);
      }
      if (f % 50 === 0) globe.focusCountry(f % GEO.length);
      globe.update(f % 10 === 0 ? 0.1 : 0.016, f % 500 < 250 ? game : null);
    }
  } catch (e) {
    return { ok: false, error: String(e.stack || e) };
  } finally {
    for (const id of live) globe.removeBubble(id, false);
  }
  const b = globe.bubbles;
  return { ok: true, bubbles: b.items.size, dying: b.dying.length, arcs: globe.arcs.items.length, fx: globe.surfaceFx.items.length };
}

window.DEV = { stress, stressSync, globe, GEO, get game() { return game; }, set game(g) { game = g; }, MockGame, setPaused(p) { paused = p; } };
