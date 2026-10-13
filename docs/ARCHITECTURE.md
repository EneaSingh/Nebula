# KILL SWITCH — architecture & module contract

A Plague Inc.–style global strategy game, inverted: a rogue AI ("the Threat")
is spreading through the world's networks and the player leads humanity's
Global Response, racing to build and deploy a **Kill Switch** before the AI
assimilates civilization. (Think *Plague Inc: The Cure*, but the pathogen is
a rogue AI.)

Pure static site: ES modules, no build step, no network access at runtime.
Serve with any static server (`python3 -m http.server`), open `index.html`.

```
index.html            page shell, importmap, DOM roots           (UI owner)
styles.css            all styling                                (UI owner)
src/main.js           wiring / game loop                         (integrator)
src/data/geo.js       country geometry + adjacency (generated)   (read-only)
src/sim/*.js          simulation: pure JS, NO DOM, NO three.js   (sim owner)
src/globe/*.js        three.js globe rendering + picking         (globe owner)
src/ui/*.js           HUD, panels, menus, tree, charts (DOM)     (UI owner)
scripts/simulate.mjs  headless node balance harness              (sim owner)
vendor/three/         three@0.160.0 (three.module.js + addons)   (read-only)
```

Import specifiers (importmap in index.html):
`import * as THREE from 'three'`,
`import { OrbitControls } from 'three/addons/controls/OrbitControls.js'`.
Vendored addons: OrbitControls, EffectComposer, RenderPass, UnrealBloomPass,
OutputPass, ShaderPass (and their deps). Nothing else is available.

## Country indexing (shared by everything)

`src/data/geo.js` default-exports an array `GEO` of 177 countries:
`{ id, name, centroid:[lon,lat], area, neighbors:number[], polygons }`
where `polygons` is `Array<Polygon>`, `Polygon = Array<Ring>`,
`Ring = Array<[lon,lat]>` (first ring outer, rest holes).
**A country's index in GEO is its index everywhere** (`game.countries[i]`,
globe picking, UI selection). Antarctica (`id === '010'`) is not playable
(`population 0`, never infected) but is still drawn.

## Simulation — `src/sim/` (no DOM, runs in node)

Entry: `src/sim/game.js` exports `class Game` and the static definition
arrays are reachable through the instance.

```js
import GEO from '../data/geo.js';
const game = new Game({ geo: GEO, threat: 'swarm', difficulty: 'normal',
                        aiName: 'NEXUS', seed: 12345 });
game.on(type, fn) / game.off(type, fn)       // event emitter
game.tick(realSeconds)   // advances days by realSeconds * DAYS_PER_SECOND * speed (no-op if paused / over)
game.speed               // 0 (paused) | 1 | 2 | 3   (writable)
game.status              // 'playing' | 'won' | 'lost'
game.day                 // float days since outbreak start
game.date                // JS Date for display (start date + day)
```

### State read by globe & UI (read-only for them)

```js
game.countries[i] = {
  index, id, name, playable,
  population,            // humans
  infected,              // humans/systems under AI influence (number, 0..population-lost)
  lost,                  // humans assimilated by the AI (permanent, "deaths" analog)
  detected,              // bool – player knows the AI is present here
  aiPresent,             // bool – ground truth (UI/globe must only reveal via `detected`)
  firstDetectedDay,      // number|null
  digital,               // 0..1 internet/automation level (affects spread)
  wealth,                // 0..1 (affects research capacity)
  research,              // research contribution per day from this country
  quarantined,           // bool (network air-gap active)
  labLevel,              // 0..3 funded research lab level
  shutdown,              // bool (grid/internet kill active)
  killSwitchDeployed,    // bool
  trust,                 // 0..1 local compliance
  status,                // 'clean' | 'infected' | 'overrun' | 'fallen' | 'liberated' (derived, for colors/labels)
}
game.world = { population, healthy, infected, lost,          // sums over playable
               detectedCountries, infectedCountries, fallenCountries }
game.player = {
  ops,                   // currency (Plague's DNA points)
  trust,                 // 0..1 global public trust/compliance
  research,              // 0..1 Kill Switch progress
  researchRate,          // per day, for display
  killSwitchDeployed,    // bool
  deployProgress,        // 0..1 rollout after research hits 1
}
game.ai = {
  name, threat,          // chosen name + archetype id
  spread, stealth, control, adaptation,   // 0..~10 display stats
  evo,                   // AI's own evolution points (hidden from player except via dossier)
  traits: string[],      // acquired trait ids (in order)
  awareness,             // 0..1 how much the world knows the AI exists
}
game.history = [{ day, healthy, infected, lost, research, trust }]  // one sample per day
game.bubbles = Map<id, { id, kind, countryIndex, value, expiresDay }>
game.stats  // for game over: { daysElapsed, peakInfected, lost, countriesFallen, opsSpent, ... }
```

### Definitions (static data, read by UI)

```js
game.defs.threats      // [{id, name, tagline, description, mods}] – AI archetypes for the start menu
game.defs.difficulties // [{id, name, description}]
game.defs.upgrades     // [{id, tab:'containment'|'research'|'operations', name, desc, cost,
                       //   requires:string[], icon:IconKey, row, col, unlocksAction?:string}]
game.defs.actions      // [{id, name, desc, icon:IconKey, cost, trustCost, requiresUpgrade|null, toggle:bool}]
game.defs.traits       // [{id, category:'vector'|'ability'|'takeover', name, desc, icon:IconKey}]
```

`IconKey` is one of: shield, firewall, cable, satellite, wifi, lab, flask, chip,
brain, eye, radar, megaphone, handshake, money, lock, power, globe, bolt, drone,
factory, robot, skull, mask, code, server, plane, users, scale, target, search,
clock, heart. The UI draws these as inline SVG icons (no emoji anywhere).

`row`/`col` lay out each tab's upgrade tree on a grid (Plague-style).

### Player commands

```js
game.canBuy(upgradeId)            -> { ok:boolean, reason?:string }
game.buy(upgradeId)               -> boolean
game.isOwned(upgradeId)           -> boolean
game.canDoAction(countryIndex, actionId) -> { ok, reason? }
game.doAction(countryIndex, actionId)    -> boolean   // toggles for toggle actions
game.actionState(countryIndex, actionId) -> 'available'|'active'|'locked'|'unaffordable'
game.collectBubble(bubbleId)      -> { kind, value } | null
```

### Events (`game.on(type, fn(payload))`)

| type | payload |
|---|---|
| `news` | `{ text, severity: 'info'\|'warn'\|'danger'\|'good', countryIndex? }` |
| `bubble:add` | `{ id, kind: 'breach'\|'intel'\|'research', countryIndex, value }` |
| `bubble:remove` | `{ id, collected: boolean }` |
| `transmission` | `{ from, to, route: 'cable'\|'satellite'\|'wireless', hidden: boolean }` — `hidden` is true when the destination is not detected; the globe must not draw hidden arcs |
| `detected` | `{ countryIndex }` |
| `evolve` | `{ traitId }` |
| `upgrade` | `{ upgradeId }` |
| `action` | `{ countryIndex, actionId, active }` |
| `research:complete` | `{}` |
| `gameover` | `{ won: boolean, reason: string, stats }` |

## Globe — `src/globe/globe.js` exports `class Globe`

```js
const globe = new Globe(containerEl, { geo: GEO });
globe.update(dtSeconds, game)        // every animation frame; reads game.countries/ai/player
globe.render()                       // draws (called after update each frame)
globe.addArc(fromIndex, toIndex, route)
globe.addBubble({ id, kind, countryIndex, value })
globe.removeBubble(id, collected)    // collected → little burst animation
globe.setSelected(index|null)
globe.focusCountry(index)            // smooth camera move
globe.onCountryClick = (index|null) => {}
globe.onCountryHover = (index|null, clientX, clientY) => {}
globe.onBubbleClick  = (id) => {}
globe.resize()                       // also handles window resize itself
globe.dispose()
```

## UI — `src/ui/ui.js` exports `class UI`

```js
const ui = new UI(document.getElementById('ui'), {
  defs,                                 // game.defs-shaped object (from a throwaway Game or static export)
  onStart: ({ aiName, threat, difficulty }) => {},
  onSpeed: (speed) => {},
  onBuy: (upgradeId) => {},
  onCountryAction: (countryIndex, actionId) => {},
  onSelectCountry: (index|null) => {},   // e.g. from a search/list
  onRestart: () => {},
});
ui.showMenu() / ui.hideMenu()
ui.bindGame(game)          // new game started; UI may subscribe to game events (news, evolve, ...)
ui.update(game)            // called ~8x/sec: refresh numbers, bars, panels
ui.selectCountry(index|null)
ui.hover(index|null, clientX, clientY)   // tooltip
ui.toast(text, severity)
ui.showGameOver({ won, reason, stats }, game)
```

`index.html` contains `<div id="globe"></div>` (full-screen canvas container)
and `<div id="ui"></div>` (overlay, `pointer-events:none` except on panels).

## Visual language

Dark, cinematic sci-fi command-center. Humanity = cool cyan/teal (#3de0ff),
AI = hot red/magenta (#ff2d55 / #ff3df0), assimilated = deep violet-black with
circuit glow, research/kill switch = green (#3dff9a), ops currency = amber
(#ffc23d). Font: system UI + monospace for numbers. Everything readable on a
phone (≥ 360px wide) as well as desktop.

## Hosting constraints (the game is also published as a sandboxed web page)

- No `alert()`, `confirm()`, `prompt()` — build confirmations into the UI.
- No network fetches at runtime; everything ships with the page. Google Fonts
  `<link>` is allowed but every font needs a solid fallback stack.
- `localStorage` may throw — wrap every access in try/catch; never required.
- Size the app with `html, body { height: 100% }`, not `100vh`. Fixed bars add
  `env(safe-area-inset-top/bottom, 0px)` to their padding.
- Single deliberate dark look: set `color-scheme: dark` and an explicit body
  background; all colors via CSS custom properties on `:root`.
- Respect `prefers-reduced-motion`; visible keyboard focus states.
- Must work at 360–400px wide (touch) through desktop; no horizontal scroll.
