// Headless check of the rules and AI: plays many games and reports results.
// usage: node briscola/scripts/selfplay.mjs [games]
import { Briscola, makeDeck, points } from '../src/rules.js';
import { chooseCard } from '../src/ai.js';

const N = Number(process.argv[2] || 2000);
const total = makeDeck().reduce((s, c) => s + points(c), 0);
if (total !== 120) throw new Error(`deck totals ${total}`);

function match(diffs, seed) {
  const g = new Briscola({ seed, firstLeader: seed % 2 });
  g.deal();
  let tricks = 0;
  while (!g.over) {
    while (!g.trickComplete) g.play(g.turn, chooseCard(g, g.turn, diffs[g.turn]).id);
    g.resolveTrick();
    tricks++;
  }
  const r = g.result();
  if (tricks !== 20 || r.scores[0] + r.scores[1] !== 120) throw new Error('bad game');
  return r.winner;
}

for (const pair of [['normal', 'easy'], ['easy', 'normal'], ['normal', 'normal']]) {
  const w = [0, 0, 0];
  for (let s = 0; s < N; s++) w[match(pair, s + 1) + 1]++;
  console.log(`${pair[0]} vs ${pair[1]}: P0 ${w[1]}  P1 ${w[2]}  draws ${w[0]}`);
}
