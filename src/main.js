// KILL SWITCH — wiring between simulation, globe and UI. See docs/ARCHITECTURE.md.
import GEO from './data/geo.js';
import { Game } from './sim/game.js';
import { Globe } from './globe/globe.js';
import { UI } from './ui/ui.js';

const globe = new Globe(document.getElementById('globe'), { geo: GEO });

// A throwaway game supplies the static definitions for the start menu.
const defs = new Game({ geo: GEO, seed: 1 }).defs;

let game = null;
let unsubscribers = [];

const ui = new UI(document.getElementById('ui'), {
  defs,
  onStart: startGame,
  onSpeed: (speed) => { if (game) game.speed = speed; },
  onBuy: (id) => { if (game) game.buy(id); },
  onCountryAction: (index, actionId) => { if (game) game.doAction(index, actionId); },
  onSelectCountry: selectCountry,
  onRestart: () => {
    teardown();
    ui.showMenu();
  },
});

function selectCountry(index) {
  globe.setSelected(index);
  ui.selectCountry(index);
  if (index != null) globe.focusCountry(index);
}

globe.onCountryClick = (index) => {
  globe.setSelected(index);
  ui.selectCountry(index);
};
globe.onCountryHover = (index, x, y) => ui.hover(index, x, y);
globe.onBubbleClick = (id) => { if (game) game.collectBubble(id); };

function listen(type, fn) {
  game.on(type, fn);
  unsubscribers.push(() => game.off(type, fn));
}

function teardown() {
  for (const off of unsubscribers) off();
  unsubscribers = [];
  if (game) for (const id of game.bubbles.keys()) globe.removeBubble(id, false);
  game = null;
  selectCountry(null);
}

function startGame({ aiName, threat, difficulty }) {
  teardown();
  game = new Game({ geo: GEO, aiName, threat, difficulty, seed: (Math.random() * 2 ** 31) | 0 });
  listen('transmission', (e) => { if (!e.hidden) globe.addArc(e.from, e.to, e.route); });
  listen('bubble:add', (b) => globe.addBubble(b));
  listen('bubble:remove', (e) => globe.removeBubble(e.id, e.collected));
  listen('gameover', (result) => {
    game.speed = 0;
    ui.showGameOver(result, game);
  });
  ui.bindGame(game);
  ui.hideMenu();
}

// Main loop. Simulation steps are capped so a backgrounded tab doesn't fast-forward months.
let last = performance.now();
let uiAccum = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (game && game.status === 'playing') game.tick(dt);
  globe.update(dt, game);
  globe.render();
  uiAccum += dt;
  if (game && uiAccum >= 0.125) {
    uiAccum = 0;
    ui.update(game);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

ui.showMenu();

// Debug handle for the console / automated tests.
window.KILLSWITCH = { get game() { return game; }, globe, ui, GEO };
