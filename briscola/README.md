# Briscola

The classic Italian trick-taking card game in three.js. It ships with two decks:
**Classic** (Napoletane-style Italian cards) and **Sci‑Fi** (holographic panels on a
neon grid). Switch between them at any time, mid-game included, with the toggle in
the top bar or the <kbd>T</kbd> key. A scan line sweeps across the table and redraws every card.

All card art is drawn procedurally on `<canvas>`, so there are no image files.

## Play

Serve the repository root (the page loads three.js and PeerJS from `../vendor/`):

```sh
python3 -m http.server 8000
# open http://localhost:8000/briscola/
```

You start seated at an empty table:

- **Play vs computer**: Easy or Normal opponent (see the menu).
- **Open a room**: you get a link (and a short room code). Send it to a friend;
  whoever opens it sits down as player two and the game deals right away. A third
  visitor is told the table is full. If your friend leaves, the room stays open
  for someone else to join on the same link.

Each player sees themselves at the bottom of the table and picks their own card
style. The host can restart; the guest can ask for a rematch at the end.

Keys: <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> play a card · <kbd>T</kbd> switch style.

## How online play works

Rooms use WebRTC data channels via [PeerJS](https://peerjs.com) (vendored in
`vendor/peerjs/`, MIT). PeerJS's free public broker (`0.peerjs.com`) only introduces
the two browsers. After that they talk directly (falling back to PeerJS's public
TURN relay on strict networks), so the site stays fully static.

Both browsers run the same seeded game in lockstep: the host sends
`{seed, firstLeader}` to start, and after that the only messages are the cards
played. This is a casual friends-only setup: the guest's browser has the whole
shuffled deck in memory, so someone digging through devtools could peek.

To use your own broker (`npm i peer`, `npx peerjs --port 9000`), add
`?peer=host:port` to the URL. It is carried into the room links. With a
`localhost` broker the public STUN/TURN servers are skipped, for offline testing.

## Rules

Forty cards in four suits (Coppe, Denari, Spade, Bastoni). Card order, from high to low, is
Ace, 3, King (Re), Knight (Cavallo), Jack (Fante), 7, 6, 5, 4, 2. Points: Ace 11,
3 is 10, King 4, Knight 3, Jack 2. The deck holds 120 points. The card turned up
under the stock sets the trump suit (*briscola*). You don't have to follow suit:
the highest trump wins the trick, otherwise the highest card of the suit that was led. The winner
draws first and leads the next trick. Over 60 points wins, and 60–60 is a draw.

## Code

```
index.html, styles.css   page shell and HUD (two looks via html[data-theme])
src/rules.js             game rules: pure JS, runs in node
src/ai.js                computer player (heuristics; exact minimax once the stock is empty)
src/cards.js             canvas card art for both decks
src/scene.js             three.js table, card meshes and theme-sweep shader, tweens, picking, bloom
src/net.js               rooms over WebRTC (PeerJS)
src/main.js              lobby, seats (local / ai / remote), game loop, layout
src/sound.js             synthesized sound effects
scripts/selfplay.mjs     `node briscola/scripts/selfplay.mjs` plays AI vs AI games to check the rules
dev/cards.html           contact sheet of every card (?theme=scifi)
```
