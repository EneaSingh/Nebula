# KILL SWITCH — balance notes

This document records the "make every upgrade meaningful" pass on the simulation (`src/sim/`). Every
number below comes from the headless harness, so it can be reproduced:

```sh
node scripts/simulate.mjs --check                                  # sanity + determinism + defs checks
node scripts/simulate.mjs --seeds 40 --bot idle,greedy,contain,research,ops   # overall table
node scripts/simulate.mjs --gift all   --seeds 40                  # per-upgrade value (normal, greedy)
node scripts/simulate.mjs --ablate all --seeds 40                  # results when the bot never buys it
node scripts/simulate.mjs --buys --bot greedy --seeds 40           # when each upgrade gets bought
node scripts/simulate.mjs --seeds 1 --first 3 --threat ghost --trace --log   # one game, day by day
```

Other harness options: `--ban a,b` (bots never buy these), `--with a,b` (grant these free at first detection
+ 10 days), `--threat`, `--diff`, `--first k` (start at seed index k). Env `NOQ=1` / `NOSD=1` / `NOINV=1`
switch off the bots' quarantine, shutdown or investigation use.

## Bots

All non-idle bots collect about 70% of alerts. They investigate sparingly: every 7 days while hunting for
the first detection, then occasionally at the frontier. They quarantine newly detected nations first, then
the biggest outbreaks, holding each quarantine about 60 days within a trust budget. They also run 18-day
shutdowns on large nations whose assimilation is accelerating (up to 3 at a time). As research nears
completion they prepare the rollout, and they push the Kill Switch to the worst-hit nations once it is
ready. They differ only in upgrade priority and in how much of their spending goes to labs.

| bot | personality |
|---|---|
| `idle` | does nothing |
| `greedy` | balanced: cheap basics, then quarantine, research, economy and shutdown interleaved |
| `contain` | containment tree first (Air-Gap → Hardened → Grid Kill → EMP → Zero-Trust → Counter-Drone …) |
| `research` | research tree first (labs + Reverse/Compute/Sandbox/Quantum/Firmware/Interp/Dead-Hand/Rollout) |
| `ops` | operations tree first (Funding → Bonds → Intel → Rapid Response → Coalition → Command → Analog …) |

## Results: before → after

"Before" means the balance at commit `2adafdd` measured with the same new harness and bots. The new bots
play better than the old greedy bot, which is why "before" normal is 99% rather than the 74% the old bot
got.

| bot / difficulty | before: win, median days, median lost, upgrades owned | after: win, median days, median lost, owned |
|---|---|---|
| idle casual / normal / brutal | 0% / 0% / 0% | **0% / 0% / 0%** (≈ 257 / 215 / 212 days) |
| greedy casual | 100%, 287 d, 0%, 29 | **100%**, 250 d, 0%, 21 |
| greedy normal | 99%, 320 d, 3%, **33.5 of 34** | **78%**, 335 d, 41%, **27.5 of 34** |
| greedy brutal | 98%, 352 d, 17%, 34 | **41%**, 335 d, 70%, 30 |
| contain normal | 98% | **83%** (390 d, 30 owned) |
| research normal | 100% | **57%** (255 d, 23 owned) |
| ops normal | 100% | **67%** (282 d, 33 owned) |

Every personality is viable on normal (≥ 50%) and plays out differently. Containment-first games run long,
around 390 days, with the AI held in check. Research-first games are fast, around 255 days, and won or lost
on time. Operations-first players buy nearly the whole tree.

## What changed (mechanics)

* **The AI now behaves like SIS.** Sysadmins reclaim infected systems (`K.gamma`), so the share of a
  country the AI holds settles at a level set by spread versus cleanup. Spread reducers (Firewall, Patch,
  Zero-Trust, Firmware, Quarantine) now lower how much of the world the AI holds. Before, they only delayed
  a saturation that always reached 100%.
* **Takeover traits multiply less** (×3.3 combined instead of ×9.4). Assimilation used to be limited only by
  how fast the AI could infect people, so takeover reducers (Counter-Drone, Civil Defense, Zero-Trust,
  Analog) did nothing. Now they work.
* **Stalling loses.** Once fully escalated, the AI keeps compounding: assimilation +0.45% and spread
  +0.23% per day. Containment alone cannot win, so research upgrades matter.
* **Detection is rewarded, not punished.** Awareness and the knowledge that drives research now grow
  mostly with time since first detection, so containing the AI no longer starves your income or research.
  AI escalation is driven by its own reach and by your research, not by your detections. Each nation
  exposed by Investigate yields +1.2% research.
* **Quarantine costs trust only** (0.02 to start plus a small daily drain), not Ops. While active it cuts
  links by 15–50% depending on trust, local spread −40% and assimilation −30%.
* **Shutdown costs Ops** (3) and 0.01 trust, plus local trust. It cuts assimilation 85% and purges 7% of
  infection a day. When lifted, the nation rebuilds from clean backups for 120 days (spread −40%,
  cleanup ×2). Grid Kill no longer requires Air-Gap.
* **Endgame:** once the Kill Switch exists, nations still waiting for it are assimilated 3× faster. The
  rollout takes 60 days at base, so Rapid Rollout and Dead-Hand matter.
* **Economy:**
  * Base income now grows with awareness and escalation (`K.opsBase/opsAware/opsEsc`).
  * Flat income upgrades are smaller.
  * Alerts are fewer: breach alerts only for the first 4 detections, then 25% of detections.
  * Labs are cheaper (4/6/9 Ops) and stronger, and every 4 lab levels worldwide add +1 Op to the next.
  * Research bonuses stack additively ("+50%" means +50% of base).
  * Upper-tier costs were reshaped so a focused player reaches their tab's bottom row well before the
    Kill Switch is ready.
* **Difficulty:** casual research ×0.55, normal ×0.27, brutal ×0.23, with faster AI evolution, less
  detection, less trust and less Ops on brutal.

## Economy and purchase timing

* **How much of the tree gets bought:** the greedy bot owns a median 27.5 of 34 upgrades at game end
  (was 33.5 of 34). Contain owns 30, research 23 (it spends more on labs) and ops 33.
* **Before research completes:** on normal, every upgrade a focused player prioritises arrives before the
  Kill Switch is ready.
* **Greedy bot timing:** it spreads its Ops and gets to some bottom-row picks late. Its research completes
  around day 255, and the rollout finishes around day 314.


Bottom-tier arrival (normal, 40 seeds × 4 threats):

| bottom-tier upgrade | greedy: owned / median day / before research done | tab-first persona: owned / median day / before research done |
|---|---|---|
| `c_gridkill` | 100% / d170 / 100% | contain: 100% / d119 / 100% |
| `c_zerotrust` | 92% / d237 / 66% | contain: 100% / d159 / 100% |
| `c_jamming` | 25% / d350 / 14% | contain: 100% / d193 / 100% |
| `c_counterdrone` | 57% / d281 / 36% | contain: 100% / d182 / 100% |
| `c_emp` | 100% / d180 / 100% | contain: 100% / d168 / 100% |
| `r_firmware` | 100% / d212 / 93% | research: 100% / d144 / 100% |
| `r_interp` | 89% / d246 / 88% | research: 100% / d153 / 100% |
| `r_deadhand` | 57% / d283 / 46% | research: 100% / d138 / 100% |
| `r_rollout` | 71% / d269 / 59% | research: 100% / d161 / 100% |
| `o_powers` | 28% / d340 / 16% | ops: 100% / d139 / 100% |
| `o_command` | 32% / d326 / 19% | ops: 100% / d116 / 100% |
| `o_analog` | 18% / d361 / 9% | ops: 100% / d157 / 100% |

- greedy: research done median day 255, rollout done day 314
- contain: research done median day 297, rollout done day 368
- research: research done median day 211, rollout done day 243
- ops: research done median day 219, rollout done day 257

## Per-upgrade value

### Gift table (each upgrade + prerequisites free at first detection + 10 days, vs. prerequisites only with the upgrade banned)

Normal difficulty, greedy bot, 40 seeds × 4 threats, paired seeds. Δ = change in mean % of humanity lost (negative = better); ± is the paired standard error.

| upgrade | cost before→after | BEFORE: win, Δlost | before verdict | AFTER: win, Δlost | after verdict |
|---|---|---|---|---|---|
| `c_monitor` | 4→4 | 100→99%, 0.1±0.8 | NONE/– | 36→78%, **-16.3±1.7** | clear + |
| `c_firewall` | 8→9 | 100→100%, -1.7±0.4 | clear + | 53→85%, **-10.3±1.4** | clear + |
| `c_traffic` | 7→9 | 100→99%, 3.6±0.7 | NONE/– | 62→85%, **-4.4±1.3** | clear + |
| `c_airgap` | 9→7 | 100→100%, 0.6±0.2 | NONE/– | 73→90%, **-14.7±1.2** | clear + |
| `c_patch` | 12→17 | 100→100%, -0.5±0.2 | clear + | 73→96%, **-8.5±1.2** | clear + |
| `c_cable` | 10→10 | 100→100%, -0.9±0.5 | clear + | 84→89%, **-5.6±1.0** | clear + |
| `c_hardened` | 11→12 | 100→100%, -0.5±0.2 | weak + | 87→93%, **-7.4±1.0** | clear + |
| `c_gridkill` | 14→12 | 100→100%, 0.5±0.1 | NONE/– | 87→98%, **-2.5±0.8** | clear + |
| `c_zerotrust` | 18→20 | 100→100%, -2.6±0.4 | clear + | 96→100%, **-11.6±1.0** | clear + |
| `c_jamming` | 12→10 | 100→100%, 0.2±0.2 | NONE/– | 89→93%, **-4.4±1.0** | clear + |
| `c_counterdrone` | 16→16 | 100→100%, -0.6±0.1 | clear + | 92→98%, **-2.9±0.6** | clear + |
| `c_emp` | 16→16 | 100→100%, -0.1±0.0 | clear + | 94→99%, **-3.7±0.6** | clear + |
| `r_field` | 3→3 | 99→99%, -6.6±1.1 | clear + | 71→78%, **-6.0±1.5** | clear + |
| `r_grants` | 5→5 | 0→99%, -63.2±0.8 | clear + | 0→78%, **-30.6±1.9** | clear + |
| `r_honeypots` | 7→9 | 100→100%, -4.6±0.6 | clear + | 68→89%, **-11.3±1.2** | clear + |
| `r_reverse` | 9→13 | 97→100%, -9.3±0.9 | clear + | 81→87%, **-9.0±0.8** | clear + |
| `r_compute` | 13→18 | 100→100%, -7.5±0.7 | clear + | 91→90%, **-8.7±0.8** | clear + |
| `r_sandbox` | 12→17 | 100→100%, -1.6±0.3 | clear + | 89→93%, **-5.1±0.7** | clear + |
| `r_quantum` | 20→20 | 100→100%, -3.7±0.4 | clear + | 94→95%, **-8.7±0.7** | clear + |
| `r_firmware` | 12→14 | 100→100%, -0.0±0.0 | clear + | 93→98%, **-8.9±0.9** | clear + |
| `r_interp` | 18→18 | 100→100%, -1.0±0.1 | clear + | 98→99%, **-4.3±0.5** | clear + |
| `r_deadhand` | 14→10 | 100→100%, -0.0±0.0 | clear + | 94→94%, **-2.5±0.2** | clear + |
| `r_rollout` | 14→12 | 100→100%, -0.0±0.0 | clear + | 99→99%, **-1.1±0.1** | clear + |
| `o_briefings` | 4→4 | 99→99%, -1.4±0.6 | clear + | 59→78%, **0.9±1.5** | clear + |
| `o_funding` | 5→5 | 88→99%, -19.1±1.5 | clear + | 63→86%, **-12.8±1.0** | clear + |
| `o_literacy` | 8→9 | 100→100%, -0.4±0.1 | clear + | 66→85%, **-4.8±0.8** | clear + |
| `o_intel` | 9→12 | 99→100%, -3.3±0.6 | clear + | 82→88%, **-3.3±1.1** | clear + |
| `o_bonds` | 8→15 | 99→100%, -6.5±0.7 | clear + | 86→94%, **-10.6±1.0** | clear + |
| `o_civdef` | 10→11 | 100→100%, -1.0±0.2 | clear + | 84→93%, **-5.0±0.7** | clear + |
| `o_coalition` | 13→20 | 100→100%, -5.0±0.6 | clear + | 93→93%, **-3.2±0.7** | clear + |
| `o_rapid` | 9→14 | 100→100%, -1.7±0.3 | clear + | 96→100%, **-14.3±1.1** | clear + |
| `o_powers` | 14→12 | 100→100%, -0.5±0.1 | clear + | 96→97%, **-3.4±0.5** | clear + |
| `o_command` | 16→16 | 100→100%, -1.4±0.3 | clear + | 93→96%, **-3.2±0.8** | clear + |
| `o_analog` | 20→18 | 100→100%, -0.2±0.0 | clear + | 98→98%, **-1.8±0.4** | clear + |

### Ablation table (the bot never buys the upgrade)

Normal, greedy bot, 40 seeds × 4 threats. Baseline before (new harness, old balance): 99% win; after: 78% win. "Coordinator (old bot)" is the original measurement that triggered this pass: win% / median lost% with the upgrade banned, against a 74.0 / 34.8 baseline.

| upgrade | coordinator (old bot) | BEFORE (new bot): win, Δlost | AFTER: win, Δlost |
|---|---|---|---|
| `c_monitor` | 40.2 / 70 | 99→100%, -0.1 | 78→36%, 16.3±1.7 |
| `c_firewall` | 45.8 / 69.8 | 99→100%, 0.1 | 78→53%, 3.7±1.4 |
| `c_traffic` | 60.2 / 53 | 99→100%, -3.9 | 78→62%, -1.7±1.2 |
| `c_airgap` | **89.0 / 27.8** | 99→100%, -3.8 | 78→73%, 4.1±1.2 |
| `c_patch` | 60 / 56 | 99→100%, -2.5 | 78→53%, 3.3±1.0 |
| `c_cable` | identical (never bought) | 99→100%, -0.5 | 78→78%, -0.0±0.0 |
| `c_hardened` | identical (never bought) | 99→100%, -0.2 | 78→76%, 0.3±0.6 |
| `c_gridkill` | identical (never bought) | 99→100%, -4.2 | 78→55%, 1.9±0.9 |
| `c_zerotrust` | identical (never bought) | 99→100%, 1.5 | 78→76%, 1.1±0.2 |
| `c_jamming` | identical (never bought) | 99→100%, -0.2 | 78→78%, -0.0±0.0 |
| `c_counterdrone` | identical (never bought) | 99→99%, 1.1 | 78→77%, 0.3±0.1 |
| `c_emp` | identical (never bought) | 99→100%, -1.1 | 78→65%, 2.4±0.6 |
| `r_field` | 68 / 38 | 99→99%, 6.6 | 78→71%, 6.0±1.5 |
| `r_grants` | 0 / 70 | 99→0%, 63.2 | 78→0%, 30.5±1.9 |
| `r_honeypots` | 70.8 / 36 | 99→100%, 2.2 | 78→68%, 2.5±0.7 |
| `r_reverse` | 29 / 70 | 99→97%, 7.7 | 78→81%, 2.6±0.9 |
| `r_compute` | 72.5 / 40.5 | 99→100%, 5.4 | 78→91%, -0.4±0.7 |
| `r_sandbox` | 60 / 49 | 99→100%, 0.9 | 78→81%, -1.3±0.5 |
| `r_quantum` | 75.2 / 33.8 | 99→100%, 2.1 | 78→84%, -0.5±0.3 |
| `r_firmware` | identical (never bought) | 99→100%, -1.0 | 78→79%, -0.8±0.3 |
| `r_interp` | identical (never bought) | 99→100%, 0.7 | 78→78%, -0.8±0.2 |
| `r_deadhand` | identical (never bought) | 99→100%, -0.3 | 78→77%, 0.5±0.1 |
| `r_rollout` | identical (never bought) | 99→100%, -0.0 | 78→78%, 0.3±0.1 |
| `o_briefings` | 51 / 61 | 99→99%, 1.4 | 78→59%, -0.9±1.5 |
| `o_funding` | 28 / 70 | 99→88%, 18.8 | 78→63%, 7.0±1.0 |
| `o_literacy` | 72.8 / 37 | 99→100%, -0.4 | 78→66%, 1.4±0.5 |
| `o_intel` | 66 / 48 | 99→99%, 1.7 | 78→82%, -4.2±0.9 |
| `o_bonds` | ~0 | 99→99%, 2.8 | 78→82%, -1.0±0.7 |
| `o_civdef` | identical (never bought) | 99→99%, 0.4 | 78→76%, 0.3±0.1 |
| `o_coalition` | 60 / 53 | 99→99%, 3.0 | 78→86%, -3.7±0.6 |
| `o_rapid` | identical (never bought) | 99→100%, -0.1 | 78→81%, -0.8±0.1 |
| `o_powers` | identical (never bought) | 99→99%, 0.1 | 78→77%, 0.0±0.0 |
| `o_command` | identical (never bought) | 99→99%, 0.2 | 78→78%, 0.0±0.0 |
| `o_analog` | identical (never bought) | 99→99%, 0.1 | 78→78%, 0.0±0.0 |

**Reading the two tables.**
* **Gift table:** measures each upgrade on its own. All 34 now show a clear positive effect: mean lost
  falls by more than 2 standard errors, or win% rises by at least 4 points. Before this pass, 7 showed
  none or a negative effect, and most showed under 1 point because the game was trivially won.
* **Ablation table:** measures "this bot without it". The bot then spends those Ops on whatever it ranks
  next.
  * Banning **Air-Gap, Grid Kill or EMP now makes results worse** in both win% and lost%. Before, banning
    Air-Gap made results better (89% win against 74%).
  * Banning a research multiplier, Intel or Coalition makes the greedy bot slightly better. Its fixed
    priority buys them before items that are worth more to its containment-heavy style, so this is the
    bot's ordering, not the upgrade.
  * The research-first bot shows the opposite pattern.
  * Cheap economy and early upgrades (Funding, Monitoring, Field Agents, Literacy) remain the most
    valuable per Op, as early investments should.
* **Smaller effects:** Rapid Rollout, Dead-Hand and Analog have the smallest measured effects (about
  1–2.5 points of lost), because they only matter in the endgame or in already-good worlds. They are
  insurance picks.

## What each upgrade is for

**Containment**
* `c_monitor` Network Monitoring (4): +60% detection. The gateway to the containment tree and early
  detection.
* `c_firewall` Firewall Mandates (9): −12% spread everywhere. Cheap, permanent and always useful.
* `c_traffic` Traffic Analysis (9): −25% cross-border jumps, +20% detection. Slows how many countries the
  AI reaches.
* `c_airgap` Air-Gap Protocol (7): unlocks Quarantine, which costs trust instead of Ops. Use it on fresh
  detections and big outbreaks.
* `c_patch` Mandatory Patch Cycles (17): −12% spread, −3% trust. The second permanent spread cut, and the
  gate to Zero-Trust and Grid Kill.
* `c_cable` Cable Landing Inspections (10): −50% undersea-cable jumps. Protects islands and distant
  continents.
* `c_hardened` Hardened Quarantine (12): quarantine leaks half as much, bites harder and drains 40% less
  trust. For quarantine-heavy play.
* `c_gridkill` Grid Kill Authority (12): unlocks Shutdown, the Ops-priced emergency brake for a nation
  being assimilated. Each use leaves the nation hardened for 120 days.
* `c_zerotrust` Zero-Trust Architecture (20): −15% spread and −15% assimilation. The strongest late
  containment upgrade.
* `c_jamming` Orbital Jamming (10): −80% satellite hops and −15% AI evolution income. Slows the AI's trait
  tree.
* `c_counterdrone` Counter-Drone Grid (16): −30% assimilation everywhere. The answer to Drone Fleets and
  Robot Foundries.
* `c_emp` EMP Doctrine (16): shutdowns purge about 18% a day, stop 97% of assimilation, rebuild for twice
  as long, and Grid Seizure only half-counters them.

**Research**
* `r_field` Field Agents (3): +40% detection. Unlocks Investigate (1 Op), which hunts the hidden AI and
  pays +1.2% research per nation exposed.
* `r_grants` Research Grants (5): unlocks Fund Lab. Without it you cannot win.
* `r_honeypots` Honeypots (9): +35% detection and 60% more intel alerts. Detection plus a stream of Ops.
* `r_reverse` Reverse Engineering (13): +50% research and halves AI rewrite setbacks. The first big
  research multiplier.
* `r_compute` Global Compute Pooling (18): +60% research. The biggest single research boost.
* `r_sandbox` Sandboxed Replicas (17): +50% research. Leads to Firmware and Interp.
* `r_quantum` Quantum Decryption (20): +65% research. Needs 30% awareness.
* `r_firmware` Immunized Firmware (14): −10% spread everywhere. Kill Switch nations purge 50% faster,
  cannot be reinfected and stop being assimilated.
* `r_interp` Interpretability Probes (18): +50% research and halves rewrite setbacks. The late research
  push.
* `r_deadhand` Dead-Hand Failsafe (10): every lab nation is protected the instant research completes, the
  rollout starts 25% complete, and research cannot drop below the last 25% milestone. Endgame insurance.
* `r_rollout` Rapid Rollout (12): rollout twice as fast, and nations still waiting suffer 60% less
  assimilation. Blunts the AI's last push.

**Operations**
* `o_briefings` Public Briefings (4): +8% trust, recovers 50% faster, +4% awareness. Opens the operations
  tree and gives a trust buffer for quarantines.
* `o_funding` Emergency Funding (5): +0.2 Ops a day. The best early investment.
* `o_literacy` Media Literacy (9): −60% deepfake trust damage and 25% faster trust recovery. Essential
  against Deepfake Hydra.
* `o_intel` Intelligence Sharing (12): +30% detection, detected nations clean the AI out 50% faster, and
  investigations expose every infected neighbour.
* `o_bonds` War Bonds (15): +0.2 Ops a day for −4% trust. Economy, and leads to Rapid Response.
* `o_civdef` Civil Defense Drills (11): −20% assimilation and 50% faster trust recovery. A cheap takeover
  reducer.
* `o_coalition` Global Coalition (20): +20% research and −30% quarantine trust cost. Needs 25% awareness.
* `o_rapid` Rapid Response Teams (14): breach alerts +2 Ops and every alert lasts 50% longer. The strongest
  economy upgrade.
* `o_powers` Emergency Powers (12): half the trust to start measures, quarantines drain 40% less, and
  spread and assimilation inside quarantines −10% more.
* `o_command` Unified Command (16): +10% base Ops and +10% research. A mid-late economy and research
  boost.
* `o_analog` Analog Fallback Networks (18): −25% assimilation, and damaged nations keep at least 30% of
  their research. The late-game safety net.

## Caveats

* The research-first personality is the weakest on normal (57%). It finishes fastest (about day 211) but
  under-invests in containment, so some games are lost to assimilation before or during the rollout.
* Containment-first games are the longest. A median of 390 days is above the 300–450 target band for
  greedy play, but within reason for a turtling style.
* The balance knobs most worth touching are:
  * `K.beta`: AI spread, which sets how hard containment is.
  * `DIFFICULTIES[].mods.research`: race length.
  * `K.compound`: how hard stalling is punished.
  * `K.desperation`: endgame danger.
  * `K.opsBase/opsAware/opsEsc`: how much of the tree a player affords.
