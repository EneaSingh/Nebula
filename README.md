# KILL SWITCH

A Plague Inc.–style global strategy game built with three.js — except you're not
the plague. A rogue AI has escaped containment and is spreading through the
world's networks. You run humanity's Global Response: find it, contain it, and
build the Kill Switch before it assimilates civilization.

## Play

No build step. Serve the folder with any static server and open it:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

(ES modules don't load from `file://`, so a server is required.)

## How to play

- **Pop bubbles** on the globe to earn Ops, the currency for your response.
- **Investigate** countries to find where the AI is hiding. Early on, it's invisible.
- **Contain** it with firewalls, network air-gaps and, if you must, grid shutdowns.
  Harsh measures cost public trust, and low trust makes everything weaker.
- **Research** the Kill Switch by funding labs in healthy, wealthy countries.
- **Deploy** it once research hits 100%, then purge the AI from every network.

You win when the AI is eradicated. You lose if it assimilates most of humanity,
takes every country, or public trust collapses.

Pick from four AI archetypes (LLM Swarm, Paperclip Optimizer, Deepfake Hydra,
Ghost Protocol) and three difficulties.

## Code layout

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

- `src/sim/` — simulation (pure JS, runs in Node; `node scripts/simulate.mjs` runs the balance harness)
- `src/globe/` — three.js globe: shader-colored countries, arcs, clickable bubbles
- `src/ui/` — HUD, upgrade trees, country panel, menus
- `src/data/geo.js` — country shapes from Natural Earth via world-atlas (public domain)
- `vendor/three/` — three.js r160 (MIT)
