// KILL SWITCH — wiring between simulation, globe and UI. See docs/ARCHITECTURE.md.
import GEO from './data/geo.js';
import { Game } from './sim/game.js';
import { Globe } from './globe/globe.js';
import { UI } from './ui/ui.js';
import { knownWorld } from './ui/util.js';
import { Sound } from './audio/sound.js';

const globe = new Globe(document.getElementById('globe'), { geo: GEO });

// A throwaway game supplies the static definitions for the start menu.
const defs = new Game({ geo: GEO, seed: 1 }).defs;

let game = null;
let unsubscribers = [];
const sound = new Sound();

const ui = new UI(document.getElementById('ui'), {
  defs,
  onStart: startGame,
  onSpeed: (speed) => { if (game) game.speed = speed; },
  onBuy: (id) => { if (game && !game.buy(id)) sound.play('deny'); },
  onCountryAction: (index, actionId) => { if (game && !game.doAction(index, actionId)) sound.play('deny'); },
  onToggleSound: () => ui.setSoundEnabled(sound.toggle()),
  onSelectCountry: selectCountry,
  onRestart: () => {
    teardown();
    ui.showMenu();
    sound.setPaused(false);
    sound.setMode('menu');
  },
});
ui.setSoundEnabled(sound.enabled);

// Audio may only start after a user gesture. Browsers differ on which events count
// (iOS ignores touch-down), so keep trying on each gesture until the output is running.
function tryUnlock() {
  if (!sound.enabled) return;
  sound.unlock();
  sound.setMode(game ? (game.status === 'playing' ? 'playing' : game.status) : 'menu');
  if (sound.running) for (const type of GESTURES) window.removeEventListener(type, tryUnlock, true);
}
const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'];
for (const type of GESTURES) window.addEventListener(type, tryUnlock, true);
document.getElementById('ui').addEventListener('click', (e) => {
  if (e.target.closest('button, [role="tab"], [role="radio"], summary')) sound.play('click');
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
globe.onBubbleClick = (id) => {
  if (!game) return;
  const got = game.collectBubble(id);
  if (got) sound.play('collect', { kind: got.kind });
};

function listen(type, fn) {
  game.on(type, fn);
  unsubscribers.push(() => game.off(type, fn));
}

function teardown() {
  for (const off of unsubscribers) off();
  unsubscribers = [];
  if (game) for (const id of game.bubbles.keys()) globe.removeBubble(id, false);
  game = null;
  audioState = null;
  selectCountry(null);
}

// Sounds driven by state changes the sim doesn't announce as events.
let audioState = null;
function updateAudio() {
  const known = knownWorld(game);
  const pop = known.population || 1;
  sound.setTension(Math.min(1, (known.lost * 2 + known.infected) / pop));
  sound.setPaused(game.status === 'playing' && game.speed === 0);
  const p = game.player;
  const fallen = game.countries.reduce((n, c) => n + (c.status === 'fallen'), 0);
  const liberated = game.countries.reduce((n, c) => n + (c.status === 'liberated'), 0);
  const quarter = Math.floor(Math.min(p.research, 0.999) * 4);
  if (audioState) {
    if (fallen > audioState.fallen) sound.play('fallen');
    if (liberated > audioState.liberated) sound.play('liberated');
    if (quarter > audioState.quarter) sound.play('milestone');
  }
  audioState = { fallen, liberated, quarter };
}

function startGame({ aiName, threat, difficulty }) {
  teardown();
  game = new Game({ geo: GEO, aiName, threat, difficulty, seed: (Math.random() * 2 ** 31) | 0 });
  listen('transmission', (e) => { if (!e.hidden) globe.addArc(e.from, e.to, e.route); });
  listen('transmission', (e) => { if (!e.hidden) sound.play('transmission'); });
  listen('bubble:add', (b) => { globe.addBubble(b); sound.play('bubble'); });
  listen('bubble:remove', (e) => globe.removeBubble(e.id, e.collected));
  let detections = 0;
  listen('detected', () => sound.play(detections++ === 0 ? 'firstDetection' : 'detected'));
  listen('evolve', () => { if (detections > 0) sound.play('evolve'); });
  listen('upgrade', () => sound.play('upgrade'));
  listen('action', (e) => sound.play('action', e));
  listen('research:complete', () => sound.play('researchDone'));
  listen('gameover', (result) => {
    game.speed = 0;
    ui.showGameOver(result, game);
    sound.play(result.won ? 'win' : 'lose');
    sound.setPaused(false);
    sound.setMode(result.won ? 'won' : 'lost');
  });
  ui.bindGame(game);
  ui.hideMenu();
  sound.unlock();
  sound.setMode('playing');
}

// Main loop. Simulation steps are capped so a backgrounded tab doesn't fast-forward months.
let last = performance.now();
let uiAccum = 0;
// Each subsystem is guarded so one exception can't stop the loop and freeze the game.
const reported = new Set();
function guard(name, fn) {
  try {
    fn();
  } catch (err) {
    if (!reported.has(name)) {
      reported.add(name);
      console.error(`[${name}]`, err);
    }
  }
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (game && game.status === 'playing') guard('sim', () => game.tick(dt));
  guard('globe', () => {
    globe.update(dt, game);
    globe.render();
  });
  uiAccum += dt;
  if (game && uiAccum >= 0.125) {
    uiAccum = 0;
    guard('ui', () => ui.update(game));
    guard('audio', updateAudio);
  }
}
requestAnimationFrame(frame);

ui.showMenu();

// Debug handle for the console / automated tests.
window.KILLSWITCH = { get game() { return game; }, globe, ui, sound, GEO };
