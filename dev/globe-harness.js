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

window.DEV = { globe, GEO, get game() { return game; }, set game(g) { game = g; }, MockGame, setPaused(p) { paused = p; } };
