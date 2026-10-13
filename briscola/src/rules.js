// Briscola rules: pure JS, no DOM, no three.js (runs in node).
//
// 40-card Italian deck, four suits, ranks 1..10 where 8/9/10 are
// Fante / Cavallo / Re. Card strength order (high to low):
// Asso, 3, Re, Cavallo, Fante, 7, 6, 5, 4, 2. The deck holds 120 points;
// more than 60 wins, exactly 60 is a draw.

export const SUITS = ['coppe', 'denari', 'spade', 'bastoni'];
export const RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const POINTS = { 1: 11, 3: 10, 10: 4, 9: 3, 8: 2 };
const STRENGTH = { 1: 10, 3: 9, 10: 8, 9: 7, 8: 6, 7: 5, 6: 4, 5: 3, 4: 2, 2: 1 };

export const points = (card) => POINTS[card.rank] || 0;
export const strength = (card) => STRENGTH[card.rank];
export const cardId = (card) => `${card.suit}-${card.rank}`;

export function makeDeck() {
  const deck = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ suit, rank, id: `${suit}-${rank}` });
  return deck;
}

// Mulberry32: small seeded PRNG so games can be replayed.
export function makeRng(seed = (Math.random() * 2 ** 32) >>> 0) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Does `b` (played second) beat `a` (led)?
export function beats(b, a, trumpSuit) {
  if (b.suit === a.suit) return strength(b) > strength(a);
  return b.suit === trumpSuit;
}

// Index (0 = leader, 1 = follower) of the trick winner.
export const trickWinner = (lead, follow, trumpSuit) => (beats(follow, lead, trumpSuit) ? 1 : 0);

/**
 * Two-player game state. Players are 0 (human) and 1 (computer).
 * Mutating methods return event descriptions the view can animate.
 */
export class Briscola {
  constructor({ seed, firstLeader = 0 } = {}) {
    this.rng = makeRng(seed);
    this.deck = shuffle(makeDeck(), this.rng); // deck[deck.length-1] is the top
    this.hands = [[], []];
    this.won = [[], []];
    this.trick = []; // [{ player, card }]
    this.leader = firstLeader;
    this.turn = firstLeader;
    this.history = []; // completed tricks: { cards:[{player,card}], winner }
    this.trump = null; // the face-up briscola card (taken by the last draw)
    this.trumpSuit = null;
  }

  // Deal three cards each, alternating, starting with the non-leader as
  // tradition has it, then turn up the briscola. Returns deal order.
  deal() {
    const order = [];
    for (let i = 0; i < 3; i++) {
      for (const p of [1 - this.leader, this.leader]) {
        const card = this.deck.pop();
        this.hands[p].push(card);
        order.push({ player: p, card });
      }
    }
    // The briscola goes face up at the bottom of the stock.
    this.trump = this.deck.pop();
    this.trumpSuit = this.trump.suit;
    this.deck.unshift(this.trump);
    return order;
  }

  get stockCount() {
    return this.deck.length;
  }

  score(p) {
    return this.won[p].reduce((s, c) => s + points(c), 0);
  }

  legal(p) {
    return p === this.turn && this.trick.length < 2 ? this.hands[p].slice() : [];
  }

  play(p, cardIdStr) {
    if (p !== this.turn) throw new Error(`not player ${p}'s turn`);
    const hand = this.hands[p];
    const i = hand.findIndex((c) => c.id === cardIdStr);
    if (i < 0) throw new Error(`card ${cardIdStr} not in hand`);
    const [card] = hand.splice(i, 1);
    this.trick.push({ player: p, card });
    this.turn = 1 - p;
    return card;
  }

  get trickComplete() {
    return this.trick.length === 2;
  }

  // Resolve the finished trick: award cards, then draw (winner first).
  // Returns { winner, points, draws:[{player, card, isTrump}] }.
  resolveTrick() {
    if (!this.trickComplete) throw new Error('trick not complete');
    const [lead, follow] = this.trick;
    const winner = trickWinner(lead.card, follow.card, this.trumpSuit) ? follow.player : lead.player;
    const pts = points(lead.card) + points(follow.card);
    this.won[winner].push(lead.card, follow.card);
    this.history.push({ cards: this.trick, winner });
    this.trick = [];

    const draws = [];
    if (this.deck.length) {
      for (const p of [winner, 1 - winner]) {
        const card = this.deck.pop();
        this.hands[p].push(card);
        draws.push({ player: p, card, isTrump: card === this.trump });
      }
    }
    this.leader = winner;
    this.turn = winner;
    return { winner, points: pts, draws };
  }

  get over() {
    return !this.deck.length && !this.hands[0].length && !this.hands[1].length && !this.trick.length;
  }

  result() {
    const s = [this.score(0), this.score(1)];
    return { scores: s, winner: s[0] > 60 ? 0 : s[1] > 60 ? 1 : -1 };
  }

  // Every card not yet visible to player `p`: used by the AI to reason about
  // what the opponent might hold without peeking.
  unseenBy(p) {
    const seen = new Set([
      ...this.hands[p].map((c) => c.id),
      ...this.won[0].map((c) => c.id),
      ...this.won[1].map((c) => c.id),
      ...this.trick.map((t) => t.card.id),
    ]);
    if (this.deck.length) seen.add(this.trump.id); // still face up on the table
    return makeDeck().filter((c) => !seen.has(c.id));
  }
}
