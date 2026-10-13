// Computer opponent. Never peeks at hidden cards: it reasons from its own
// hand, the cards already played, and (once the stock is empty) the
// opponent's hand, which by then is fully deducible from what is unseen.
import { beats, points, strength } from './rules.js';

// What it costs to spend a trump: high trumps are worth keeping.
function trumpCost(card, deckLeft) {
  const base = 2 + strength(card) * 0.6;
  return deckLeft ? base : base * 0.4;
}

function respondUtility(card, lead, game) {
  const gain = points(lead) + points(card);
  let u = beats(card, lead, game.trumpSuit) ? gain : -gain;
  if (card.suit === game.trumpSuit) u -= trumpCost(card, game.stockCount);
  // When losing anyway, throw the weakest card.
  if (!beats(card, lead, game.trumpSuit)) u -= strength(card) * 0.1;
  return u;
}

function leadUtility(card, game) {
  let u = -points(card) * 1.2 - strength(card) * 0.1;
  if (card.suit === game.trumpSuit) u -= trumpCost(card, game.stockCount) * 0.8;
  return u;
}

// Exact play once the stock is empty: both hands are known, so a tiny
// minimax over at most 3 tricks each finds the best card.
function solve(myHand, oppHand, leaderIsMe, trumpSuit, leadCard = null) {
  if (!myHand.length && !oppHand.length) return { value: 0 };
  let best = null;
  const consider = (value, card) => {
    if (!best || value > best.value) best = { value, card };
  };
  if (leadCard) {
    // I respond to the opponent's lead.
    for (const c of myHand) {
      const iWin = beats(c, leadCard, trumpSuit);
      const pts = points(c) + points(leadCard);
      const rest = myHand.filter((x) => x !== c);
      const sub = solve(rest, oppHand, iWin, trumpSuit);
      consider((iWin ? pts : -pts) + sub.value, c);
    }
    return best;
  }
  if (leaderIsMe) {
    for (const c of myHand) {
      const rest = myHand.filter((x) => x !== c);
      // Opponent picks the reply that is worst for me.
      let worst = Infinity;
      for (const o of oppHand) {
        const oppWins = beats(o, c, trumpSuit);
        const pts = points(c) + points(o);
        const sub = solve(rest, oppHand.filter((x) => x !== o), !oppWins, trumpSuit);
        worst = Math.min(worst, (oppWins ? -pts : pts) + sub.value);
      }
      consider(worst, c);
    }
    return best;
  }
  // Opponent leads: they pick the lead that is worst for me.
  let worst = Infinity;
  for (const o of oppHand) {
    const sub = solve(myHand, oppHand.filter((x) => x !== o), false, trumpSuit, o);
    worst = Math.min(worst, sub.value);
  }
  return { value: worst };
}

export function chooseCard(game, player, difficulty = 'normal') {
  const hand = game.hands[player];
  if (hand.length === 1) return hand[0];
  if (difficulty === 'easy' && game.rng() < 0.55) return hand[Math.floor(game.rng() * hand.length)];

  const lead = game.trick.length ? game.trick[0].card : null;

  if (!game.stockCount && difficulty !== 'easy') {
    const opp = game.unseenBy(player);
    const res = solve(hand, opp, !lead, game.trumpSuit, lead);
    if (res.card) return res.card;
  }

  let best = hand[0];
  let bestU = -Infinity;
  for (const c of hand) {
    const u = lead ? respondUtility(c, lead, game) : leadUtility(c, game);
    if (u > bestU) {
      bestU = u;
      best = c;
    }
  }
  return best;
}
