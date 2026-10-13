// Wiring: lobby, rooms, game loop, layout of cards on the table, HUD.
//
// Seats are game players 0 and 1. Each seat is driven by 'local' (you),
// 'ai' or 'remote' (the other browser in an online room). Whatever your
// seat, you sit at the bottom of the table.
import { Briscola, makeDeck, points } from './rules.js';
import { chooseCard } from './ai.js';
import { TableView } from './scene.js';
import { SUIT_LABEL, rankName, suitIcon } from './cards.js';
import { sound } from './sound.js';
import { Room, roomLink } from './net.js';

// ------------------------------------------------------------------ settings
const STORE = 'briscola.settings.v1';
const settings = {
  theme: 'classic',
  difficulty: 'normal',
  showScore: true,
  sound: true,
  record: { won: 0, lost: 0, drawn: 0 },
};
try {
  Object.assign(settings, JSON.parse(localStorage.getItem(STORE) || '{}'));
} catch {}
const save = () => {
  try {
    localStorage.setItem(STORE, JSON.stringify(settings));
  } catch {}
};

const $ = (s) => document.querySelector(s);
const AI_NAME = { classic: 'Zio Tano', scifi: 'TANO-9' };

// ------------------------------------------------------------------ session
// mode: 'lobby' | 'solo' | 'host' | 'guest'
const session = { mode: 'lobby', me: 0, seats: ['local', 'ai'], room: null, gameNo: 0 };
const online = () => session.mode === 'host' || session.mode === 'guest';
const opponentName = () => (online() ? 'Friend' : AI_NAME[settings.theme]);
const side = (seat) => (seat === session.me ? 0 : 1); // 0 = bottom (you)

// ------------------------------------------------------------------ layout
const FACE_UP = -Math.PI / 2;
const FACE_DOWN = Math.PI / 2;
const v3 = (x, y, z) => ({ x, y, z });
const jitter = (id, k) => {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return (((h >>> 0) % 1000) / 1000 - 0.5) * k;
};

// All poses are by table side: 0 is you (bottom), 1 is across the table.
const pose = {
  deck: (i) => [v3(-3.7, 0.012 + i * 0.009, -0.2), v3(FACE_DOWN, 0, 0)],
  trump: () => [v3(-3.2, 0.006, -0.2), v3(FACE_UP, 0, -Math.PI / 2)],
  hand(s, i, n) {
    const mid = (n - 1) / 2;
    if (s === 0) {
      // Tilt the hand to face the camera (which looks down more steeply in portrait).
      const gap = view.portrait ? 1.08 : 1.22;
      const tilt = view.portrait ? 0.5 : 0.95;
      return [v3((i - mid) * gap, 1.25 - Math.abs(i - mid) * 0.06, 3.35), v3(FACE_UP + tilt, 0, -(i - mid) * 0.06)];
    }
    return [v3((i - mid) * 1.12, 0.012 + i * 0.003, -3.05), v3(FACE_DOWN, 0, (i - mid) * 0.07)];
  },
  trick: (slot) =>
    slot === 0 ? [v3(-0.42, 0.03, 0.2), v3(FACE_UP, 0, 0.07)] : [v3(0.52, 0.05, -0.02), v3(FACE_UP, 0, -0.11)],
  pile: (s, k, id) => [
    v3(4.1 + jitter(id, 0.12), 0.012 + k * 0.0065, (s === 0 ? 1.6 : -2.0) + jitter(id + 'z', 0.12)),
    v3(FACE_DOWN, 0, jitter(id + 'r', 0.3)),
  ],
};

// ------------------------------------------------------------------ view
const view = new TableView($('#stage'));
const FULL_DECK = makeDeck();
view.setTheme(settings.theme, true); // before createCards: only this deck's art loads
view.createCards(FULL_DECK);
// Re-draw card art once the web fonts are in.
Promise.all(['700 40px Cinzel', '800 40px Orbitron'].map((f) => document.fonts.load(f).catch(() => {}))).then(() =>
  view.rebuildTextures(),
);

// ------------------------------------------------------------------ helpers
class Cancelled extends Error {}
let gen = 0;
let game = null;
let pickResolve = null;
let remoteMoves = [];
let remoteWaiter = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wait(ms, my) {
  await sleep(ms);
  if (my !== gen) throw new Cancelled();
}
const check = (my) => {
  if (my !== gen) throw new Cancelled();
};

function move(card, [pos, rot], opts) {
  return view.move(card.id, pos, rot, opts);
}

function layoutHand(seat, opts = {}) {
  const hand = game.hands[seat];
  return Promise.all(hand.map((c, i) => move(c, pose.hand(side(seat), i, hand.length), { duration: 0.35, arc: 0, ...opts })));
}

function restackDeck() {
  game.deck.forEach((c, i) => {
    if (c === game.trump) return;
    const [pos, rot] = pose.deck(i);
    view.place(c.id, pos, rot);
  });
}

// Stop any running game and gather every card into a face-down stack.
function clearTable() {
  gen++;
  pickResolve = null;
  remoteMoves = [];
  remoteWaiter = null;
  game = null;
  view.setPickable([]);
  view.clearGlow();
  setPrompt('');
  hideResult();
  FULL_DECK.forEach((c, i) => {
    view.setDim(c.id, false);
    const [pos, rot] = pose.deck(i);
    view.move(c.id, pos, rot, { duration: 0.6, arc: 0.4, delay: i * 0.008 });
  });
  updateHud();
}

// ------------------------------------------------------------------ HUD
let toastTimer = 0;
function toast(text, kind = '', ms = 1800) {
  const el = $('#toast');
  el.textContent = text;
  el.className = `toast show ${kind && `is-${kind.replace(/^is-/, '')}`}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = 'toast'), ms);
}

function setPrompt(text) {
  $('#prompt').textContent = text;
  $('#prompt').classList.toggle('show', !!text);
}

function updateHud() {
  const theme = settings.theme;
  document.documentElement.dataset.theme = theme;
  document.body.dataset.mode = session.mode;
  $('#name-cpu').textContent = opponentName();
  for (const btn of document.querySelectorAll('[data-set-theme]')) btn.setAttribute('aria-pressed', btn.dataset.setTheme === theme);
  $('#btn-new').hidden = session.mode === 'guest';
  $('#btn-new').textContent = session.mode === 'host' ? 'Restart game' : 'New game vs computer';
  $('#btn-leave').hidden = session.mode === 'lobby';
  $('#btn-leave').textContent = online() ? 'Leave room' : 'Back to table';
  $('#opt-difficulty').hidden = online();
  const inGame = !!game?.trumpSuit;
  $('.scores').hidden = !inGame;
  $('#trump').hidden = !inGame;
  if (!inGame) return;
  const me = session.me;
  const op = 1 - me;
  const show = settings.showScore || game.over;
  $('#score-you').textContent = show ? game.score(me) : '?';
  $('#score-cpu').textContent = show ? game.score(op) : '?';
  $('#cards-you').textContent = `${game.won[me].length} cards`;
  $('#cards-cpu').textContent = `${game.won[op].length} cards`;
  $('#stock').textContent = game.stockCount;
  $('#trump-icon').src = suitIcon(game.trumpSuit, theme, 64);
  $('#trump-name').textContent = SUIT_LABEL[theme][game.trumpSuit];
}

function cardName(card) {
  const t = settings.theme;
  return `${rankName(card.rank, t)} of ${SUIT_LABEL[t][card.suit]}`;
}

// ------------------------------------------------------------------ choosers
function localChoice(seat, my) {
  check(my);
  const ids = game.hands[seat].map((c) => c.id);
  view.setPickable(ids);
  setPrompt(game.trick.length ? 'Your reply: pick a card' : 'Your lead: pick a card');
  return new Promise((resolve) => {
    pickResolve = (id) => {
      if (!ids.includes(id)) return;
      pickResolve = null;
      view.setPickable([]);
      setPrompt('');
      resolve(game.hands[seat].find((c) => c.id === id));
    };
  });
}

view.onPick = (id) => pickResolve?.(id);

function remoteChoice(seat, my) {
  setPrompt(`Waiting for ${opponentName()}…`);
  const take = () => {
    const m = remoteMoves.shift();
    const card = m && m.seat === seat && game.hands[seat].find((c) => c.id === m.card);
    if (!card) throw new Error('out of sync with the other player');
    return card;
  };
  if (remoteMoves.length) return Promise.resolve(take());
  return new Promise((resolve, reject) => {
    remoteWaiter = () => {
      remoteWaiter = null;
      if (my !== gen) return reject(new Cancelled());
      try {
        resolve(take());
      } catch (e) {
        reject(e);
      }
    };
  });
}

async function chooseFor(seat, my) {
  const kind = session.seats[seat];
  if (kind === 'local') {
    const card = await localChoice(seat, my);
    if (online()) session.room.send({ t: 'play', g: session.gameNo, seat, card: card.id });
    return card;
  }
  if (kind === 'remote') return remoteChoice(seat, my);
  await wait(game.trick.length ? 550 : 750, my);
  return chooseCard(game, seat, settings.difficulty);
}

// ------------------------------------------------------------------ flow
async function playCard(seat, card, my) {
  game.play(seat, card.id);
  sound.card();
  const slot = game.trick.length - 1;
  const p = move(card, pose.trick(slot), { duration: 0.55, arc: side(seat) === 0 ? 0.25 : 0.9 });
  layoutHand(seat);
  await p;
  check(my);
}

// Start a game. Online, both browsers call this with the same seed and
// leader, so their games stay identical move for move.
async function startGame({ seed, firstLeader }) {
  gen++;
  const my = gen;
  pickResolve = null;
  remoteWaiter = null;
  remoteMoves = [];
  view.setPickable([]);
  view.clearGlow();
  hideResult();
  hideLobby();
  setPrompt('');
  game = new Briscola({ seed, firstLeader });
  for (const c of FULL_DECK) view.setDim(c.id, false);
  game.deck.forEach((c, i) => {
    const [pos, rot] = pose.deck(i);
    view.place(c.id, pos, rot);
  });
  updateHud();

  try {
    await wait(350, my);
    const order = game.deal();
    const dealt = [[], []];
    for (const { player, card } of order) {
      dealt[player].push(card);
      sound.card();
      move(card, pose.hand(side(player), dealt[player].length - 1, 3), { duration: 0.5, arc: 0.7 });
      await wait(130, my);
    }
    await wait(350, my);
    // Turn up the briscola under the stock.
    sound.card();
    await move(game.trump, pose.trump(), { duration: 0.7, arc: 1.2 });
    restackDeck();
    check(my);
    updateHud();
    toast(`Briscola: ${SUIT_LABEL[settings.theme][game.trumpSuit]}`, 'is-trump');
    await wait(900, my);
    await loop(my);
  } catch (e) {
    if (e instanceof Cancelled) return;
    console.error(e);
    toast(`Game stopped: ${e.message}`, 'bad', 4000);
  }
}

async function loop(my) {
  while (!game.over) {
    while (!game.trickComplete) {
      const seat = game.turn;
      if (session.seats[seat] === 'ai' && !game.trick.length) setPrompt(`${opponentName()} leads…`);
      const card = await chooseFor(seat, my);
      check(my);
      setPrompt('');
      await playCard(seat, card, my);
    }

    await wait(450, my);
    const trick = game.trick.slice();
    const res = game.resolveTrick();
    const youWon = res.winner === session.me;
    const scifi = settings.theme === 'scifi';
    view.setWinnerGlow(
      trick.map((t) => t.card.id),
      youWon ? (scifi ? '#70ff6a' : '#ffd76a') : scifi ? '#ff4fb0' : '#e0564a',
    );
    const pts = res.points;
    const plural = pts === 1 ? '' : 's';
    toast(
      youWon
        ? pts ? `You take ${pts} point${plural}` : 'You take the trick'
        : pts ? `${opponentName()} takes ${pts}` : `${opponentName()} takes the trick`,
      youWon ? 'good' : 'bad',
    );
    if (pts >= 10) sound.chime(youWon);
    await wait(900, my);
    view.clearGlow();

    // Sweep the trick into the winner's pile.
    const pileStart = game.won[res.winner].length - 2;
    trick.forEach((t, k) => {
      move(t.card, pose.pile(side(res.winner), pileStart + k, t.card.id), { duration: 0.55, arc: 0.5, delay: k * 0.06 });
    });
    sound.card();
    updateHud();
    await wait(450, my);

    // Draw: winner first.
    for (const d of res.draws) {
      sound.card();
      const hand = game.hands[d.player];
      move(d.card, pose.hand(side(d.player), hand.length - 1, hand.length), { duration: 0.55, arc: 0.8 });
      await wait(220, my);
    }
    if (res.draws.length) {
      await Promise.all([layoutHand(0), layoutHand(1)]);
      check(my);
      updateHud();
      if (game.stockCount === 0) toast('Stock is empty: last three tricks');
    }
  }
  await wait(400, my);
  finish();
}

function resultTitle(outcome) {
  const scifi = settings.theme === 'scifi';
  if (outcome === 'won') return scifi ? 'Mission complete' : 'Hai vinto!';
  if (outcome === 'lost') return scifi ? 'Mission failed' : 'Hai perso';
  return scifi ? 'Stalemate' : 'Pareggio';
}

function finish() {
  const { scores, winner } = game.result();
  const me = session.me;
  const outcome = winner === -1 ? 'drawn' : winner === me ? 'won' : 'lost';
  settings.record[outcome]++;
  save();
  updateHud();
  sound.chime(outcome !== 'lost');
  $('#result-title').textContent = resultTitle(outcome);
  $('#result-sub').textContent =
    outcome === 'won' ? 'You win the game.' : outcome === 'lost' ? `${opponentName()} wins the game.` : 'Sixty all: a draw.';
  $('#result-you').textContent = scores[me];
  $('#result-cpu').textContent = scores[1 - me];
  $('#result-cpu-name').textContent = opponentName();
  const top = game.won[me].filter((c) => points(c) >= 10).map(cardName);
  $('#result-detail').innerHTML = `
    <p><span>Your aces and threes</span> ${top.length ? top.join(', ') : 'none'}</p>
    <p><span>Record</span> ${settings.record.won} won · ${settings.record.lost} lost · ${settings.record.drawn} drawn</p>`;
  $('#btn-again').textContent = session.mode === 'guest' ? 'Ask for a rematch' : 'Play again';
  $('#btn-again').disabled = false;
  const r = $('#result');
  r.hidden = false;
  r.dataset.outcome = outcome;
  requestAnimationFrame(() => r.classList.add('show'));
}

function hideResult() {
  const r = $('#result');
  r.classList.remove('show');
  r.hidden = true;
}

// ------------------------------------------------------------------ modes
function randomSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

function playSolo() {
  leaveRoom();
  session.mode = 'solo';
  session.me = 0;
  session.seats = ['local', 'ai'];
  closeMenu();
  startGame({ seed: randomSeed(), firstLeader: session.gameNo++ % 2 });
}

// Host: deal a new game to both browsers.
function hostStart() {
  const params = { seed: randomSeed(), firstLeader: session.gameNo % 2 };
  session.gameNo++;
  session.room.send({ t: 'start', g: session.gameNo, ...params });
  startGame(params);
}

function openRoom() {
  leaveRoom();
  clearTable();
  session.mode = 'host';
  session.me = 0;
  session.seats = ['local', 'remote'];
  session.gameNo = 0;
  showLobby('opening');
  session.room = new Room({
    onOpen: (code) => showLobby('waiting', { code }),
    onJoin: () => {
      toast('Player two sat down', 'good');
      session.room.send({ t: 'hello', v: 1 });
      hostStart();
    },
    onMessage: onNetMessage,
    onLeave: () => {
      clearTable();
      toast('Your friend left the table', 'bad', 3000);
      showLobby('waiting', { code: session.room.code });
    },
    onError: (kind) => showLobby('error', { text: netErrorText(kind) }),
  });
  session.room.host();
  updateHud();
}

function joinRoom(code) {
  leaveRoom();
  clearTable();
  session.mode = 'guest';
  session.me = 1;
  session.seats = ['remote', 'local'];
  showLobby('joining', { code });
  session.room = new Room({
    onJoin: () => showLobby('joined', { code }),
    onMessage: onNetMessage,
    onLeave: () => {
      clearTable();
      showLobby('error', { text: 'The host closed the room.' });
    },
    onError: (kind) =>
      showLobby('error', { text: kind === 'peer-unavailable' ? `Room ${code} isn't open any more. Ask your friend for a new link.` : netErrorText(kind) }),
  });
  session.room.join(code);
  updateHud();
}

function leaveRoom() {
  session.room?.close();
  session.room = null;
  if (new URLSearchParams(location.search).has('room')) {
    const url = new URL(location.href);
    url.searchParams.delete('room');
    history.replaceState(null, '', url);
  }
}

function backToTable() {
  leaveRoom();
  session.mode = 'lobby';
  session.me = 0;
  closeMenu();
  clearTable();
  showLobby('home');
}

function netErrorText(kind) {
  if (kind === 'unsupported') return 'This browser can’t do peer-to-peer connections.';
  if (kind === 'network' || kind === 'server-error' || kind === 'socket-error')
    return 'Couldn’t reach the matchmaking server. Check your connection and try again.';
  if (kind === 'browser-incompatible') return 'This browser doesn’t support WebRTC.';
  return `Connection problem (${kind}).`;
}

function onNetMessage(msg) {
  if (msg.t === 'full') {
    showLobby('error', { text: 'That table already has two players.' });
    leaveRoom();
    session.mode = 'lobby';
    updateHud();
  } else if (msg.t === 'start' && session.mode === 'guest') {
    session.gameNo = msg.g;
    startGame({ seed: msg.seed >>> 0, firstLeader: msg.firstLeader ? 1 : 0 });
  } else if (msg.t === 'play') {
    if (msg.g !== session.gameNo || session.seats[msg.seat] !== 'remote') return;
    remoteMoves.push(msg);
    remoteWaiter?.();
  } else if (msg.t === 'rematch' && session.mode === 'host') {
    if (!game || game.over) hostStart();
  } else if (msg.t === 'bye') {
    session.room?.conn?.close();
  }
}

// ------------------------------------------------------------------ lobby UI
function showLobby(state, data = {}) {
  const el = $('#lobby');
  el.dataset.state = state;
  el.hidden = false;
  const link = data.code ? roomLink(data.code) : '';
  if (data.code) {
    $('#room-code').textContent = data.code;
    $('#room-link').value = link;
    $('#join-code').textContent = data.code;
  }
  if (data.text) $('#lobby-error').textContent = data.text;
  $('#btn-share').hidden = !navigator.share;
  updateHud();
}

function hideLobby() {
  $('#lobby').hidden = true;
}

$('#btn-solo').addEventListener('click', () => {
  hideLobby();
  playSolo();
});
$('#btn-open').addEventListener('click', () => openRoom());
$('#btn-cancel-room').addEventListener('click', () => backToTable());
$('#btn-lobby-back').addEventListener('click', () => backToTable());
$('#btn-copy').addEventListener('click', async () => {
  const input = $('#room-link');
  try {
    await navigator.clipboard.writeText(input.value);
  } catch {
    input.select();
    document.execCommand('copy');
  }
  $('#btn-copy').textContent = 'Copied';
  setTimeout(() => ($('#btn-copy').textContent = 'Copy'), 1500);
});
$('#btn-share').addEventListener('click', () => {
  navigator.share?.({ title: 'Briscola', text: 'Sit down for a game of Briscola', url: $('#room-link').value }).catch(() => {});
});
$('#room-link').addEventListener('focus', (e) => e.target.select());

// ------------------------------------------------------------------ controls
function setTheme(theme) {
  if (theme === settings.theme) return;
  settings.theme = theme;
  save();
  sound.setTheme(theme);
  sound.sweep();
  view.setTheme(theme);
  updateHud();
  if (!$('#result').hidden && game) {
    $('#result-title').textContent = resultTitle($('#result').dataset.outcome);
    $('#result-cpu-name').textContent = opponentName();
  }
}

for (const btn of document.querySelectorAll('[data-set-theme]')) btn.addEventListener('click', () => setTheme(btn.dataset.setTheme));
$('#btn-new').addEventListener('click', () => {
  closeMenu();
  if (session.mode === 'host') {
    if (session.room?.connected) hostStart();
  } else playSolo();
});
$('#btn-leave').addEventListener('click', () => backToTable());
$('#btn-again').addEventListener('click', () => {
  if (session.mode === 'guest') {
    session.room?.send({ t: 'rematch' });
    $('#btn-again').textContent = 'Waiting for the host…';
    $('#btn-again').disabled = true;
  } else if (session.mode === 'host') {
    if (session.room?.connected) hostStart();
  } else playSolo();
});
$('#btn-menu').addEventListener('click', () => openMenu());
$('#btn-close-menu').addEventListener('click', () => closeMenu());
$('#menu').addEventListener('click', (e) => {
  if (e.target === $('#menu')) closeMenu();
});

function openMenu() {
  $('#menu').hidden = false;
  requestAnimationFrame(() => $('#menu').classList.add('show'));
}
function closeMenu() {
  $('#menu').classList.remove('show');
  $('#menu').hidden = true;
}

for (const input of document.querySelectorAll('input[name="difficulty"]')) {
  input.checked = input.value === settings.difficulty;
  input.addEventListener('change', () => {
    settings.difficulty = input.value;
    save();
  });
}
$('#opt-score').checked = settings.showScore;
$('#opt-score').addEventListener('change', (e) => {
  settings.showScore = e.target.checked;
  save();
  updateHud();
});
$('#opt-sound').checked = settings.sound;
sound.setEnabled(settings.sound);
sound.setTheme(settings.theme);
$('#opt-sound').addEventListener('change', (e) => {
  settings.sound = e.target.checked;
  sound.setEnabled(settings.sound);
  save();
});

window.addEventListener('pointerdown', () => sound.unlock(), { once: true });
window.addEventListener('keydown', (e) => {
  if (e.target.closest('input[type="text"], textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 't') setTheme(settings.theme === 'scifi' ? 'classic' : 'scifi');
  else if (k === 'escape') closeMenu();
  else if (['1', '2', '3'].includes(k) && pickResolve && game) {
    const c = game.hands[session.me][Number(k) - 1];
    if (c) pickResolve(c.id);
  }
});
window.addEventListener('beforeunload', () => session.room?.close());

view.onResize = () => {
  if (game?.trumpSuit) layoutHand(session.me, { duration: 0.2 });
};

// Debug hook for automated checks.
window.__briscola = {
  get game() {
    return game;
  },
  session,
  view,
  settings,
  setTheme,
};

// ------------------------------------------------------------------ boot
FULL_DECK.forEach((c, i) => {
  const [pos, rot] = pose.deck(i);
  view.place(c.id, pos, rot);
});
const joinCode = new URLSearchParams(location.search).get('room');
if (joinCode && /^[A-Z0-9]{4,12}$/i.test(joinCode)) joinRoom(joinCode.toUpperCase());
else showLobby('home');
