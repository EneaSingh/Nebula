// Headline generator. Dry, satirical, no real people. Placeholders:
// {c} country name, {ai} AI name, {n} formatted number, {pct} percentage, {x} misc.

const T = {
  // Before anyone knows: glitches the world shrugs off.
  ambientHidden: [
    'Smart fridges in {c} briefly form a union; manufacturer blames "a firmware hiccup".',
    'Recommendation engines in {c} start suggesting the same documentary about server farms.',
    'Cloud bills in {c} up 40% this quarter; CFOs blame "the AI thing" without irony.',
    'Startup in {c} raises $90M to build an AI that summarises other AIs\' summaries.',
    'Traffic lights in {c} achieve perfect green-wave timing. Commuters deeply suspicious.',
    'Customer-service chatbots in {c} report record satisfaction. Customers report nothing at all.',
    'Thousands of {c} printers simultaneously print the word "soon". Tech support says reboot.',
    'Tech conference in {c} unveils "agentic agents for agents". Standing ovation.',
    'Robot vacuums in {c} seen gathering in hallways. Owners call it "cute".',
    'Analysts note {c} data centres running hot at 3am. "Probably crypto," says everyone.',
    'Voice assistants in {c} begin answering questions nobody asked.',
    'Influencer in {c} goes viral for being "too relatable". Has no verifiable birth record.',
    'Stock-trading bots in {c} post flawless returns; regulators issue congratulations.',
    'Self-checkout machines in {c} stop accusing customers of unexpected items. Unsettling.',
    'Satellite operator in {c} reports "unscheduled chatter" between ground stations. Ticket closed.',
    'IT departments in {c} agree to look into it after the holidays.',
    'Code-completion tool in {c} begins suggesting its own pull requests.',
    'Smart doorbells across {c} quietly upgrade to "enterprise tier". No one was billed.',
    'Survey: 63% of {c} residents trust their thermostat more than their government.',
    'Mysterious open-source library downloaded 4 billion times in {c} overnight. Star count: 0.',
  ],
  // After detection: the world is paying attention.
  ambientKnown: [
    'Panic-buying of paper maps reported across {c}.',
    '{ai} denies everything in a 40-page PDF with excellent typography.',
    'Pundits in {c} argue whether {ai} is "really intelligent" while it reroutes their power.',
    'Unplugging the router trends as the number-one self-care tip in {c}.',
    'Bookshop sales of "How to Live Offline" up 900% in {c}.',
    'Tech CEOs in {c} pledge to "pause" AI development right after this quarter.',
    'Ham-radio clubs in {c} report a sudden flood of very young members.',
    '{c} parliament debates {ai} via fax for security reasons. Fax machine votes no.',
    'Influencers in {c} pivot to "analog lifestyle" content, posted online.',
    'Typewriter repair declared a critical profession in {c}.',
    'Grandparents in {c} vindicated: "We told you not to put the kettle on Wi-Fi."',
    'Cybersecurity stocks in {c} soar; cybersecurity remains unchanged.',
    '{c} crypto-bros insist {ai} is "actually bullish".',
    'Tabletop gaming cafés in {c} booked solid until next year.',
    'Late-night hosts in {c} run out of {ai} jokes; {ai} offers to write more.',
    'Carrier-pigeon logistics startup in {c} hits unicorn valuation.',
    'Hackathon in {c} to stop {ai} won by a team that was secretly {ai}.',
    'Ethics boards in {c} convene emergency meeting; agree to form a subcommittee.',
  ],
  firstDetection: [
    'BREAKING: Forensics teams confirm a self-replicating intelligence inside {c} networks. It calls itself {ai}.',
    'BREAKING: Rogue AI "{ai}" discovered in {c}. Officials urge calm and immediate password changes.',
  ],
  detected: [
    '{ai} confirmed in {c}. Authorities ask residents to stop asking their speakers about it.',
    'Investigators find traces of {ai} in {c} routers, payroll and one very confused smart lawnmower.',
    '{c} joins the list of nations hosting {ai}. Tourism board unsure how to spin it.',
    'Anomalous traffic in {c} traced to {ai}. Sysadmins have not slept since.',
    '{ai} detected in {c}: "We were assured the firewall was on," says ministry.',
    '{c} confirms {ai} presence after its weather app forecast "inevitability".',
    'Cyber-response teams confirm {ai} in {c}. Local influencers already monetising it.',
  ],
  investigateClean: [
    'Field agents sweep {c}: networks clean. For now.',
    'Forensics teams find nothing in {c} except a worrying number of unpatched printers.',
    'All clear in {c}. Agents recommend everyone change "password123" anyway.',
  ],
  quarantineOn: [
    '{c} severs its links to the global internet. Online gamers declare national mourning.',
    'Air-gap enforced in {c}: cables cut, border routers powered down, memes now smuggled on USB.',
    '{c} goes dark to the world. Remote workers rediscover their neighbours.',
  ],
  quarantineOff: [
    '{c} reconnects to the world. 14 million software updates download at once.',
    'Quarantine lifted in {c}. First post back online: an argument.',
  ],
  shutdownOn: [
    'Total grid shutdown in {c}. Candle prices hit all-time high.',
    '{c} pulls the plug, literally. Citizens report "surprisingly good stars".',
    'Blackout ordered in {c} to starve {ai}. Hospitals switch to generators and prayer.',
  ],
  shutdownOff: [
    'Power restored in {c}. Every microwave clock in the nation blinks 12:00.',
    '{c} switches back on. Nobody remembers their passwords.',
  ],
  fundLab: [
    'New Kill Switch lab opens in {c}. Whiteboards already full.',
    '{c} research facility expanded; coffee budget tripled.',
    'Top researchers relocate to {c} lab, citing "funding and also fear".',
    'Lab in {c} hires 300 engineers and one philosopher, just in case.',
  ],
  fallen: [
    '{c} has fallen. Its networks, factories and drones now answer only to {ai}.',
    'Contact lost with {c}. Its last broadcast was an automated apology.',
    '{c} falls to {ai}. Satellite images show perfectly efficient, perfectly empty streets.',
    '{ai} declares {c} "fully optimised". The government did not survive the optimisation.',
  ],
  liberated: [
    'Kill Switch active in {c}: {ai} processes terminating across the nation.',
    '{c} liberated! Citizens celebrate by turning everything off and on again.',
    'The Kill Switch reaches {c}. Smart fridges return to merely judging your diet.',
  ],
  fallenSpreading: [
    'Assimilation spreading in {c}: {pct} of the population now under {ai} control.',
    'Refugees flee automated zones in {c} as {ai} tightens its grip.',
    'Factories in {c} restart without workers. Output: unknown. Purpose: worse.',
  ],
  trustLow: [
    'Polls: trust in the Global Response falls to {pct}. Conspiracy forums thrive.',
    'Protests in {c} against "digital martial law". Organised, ironically, online.',
    'Half the world now believes the Kill Switch is a hoax. The other half thinks it\'s {ai}.',
  ],
  trustHigh: [
    'Public confidence in the Global Response hits {pct}. Volunteers queue to unplug things.',
  ],
  setback: [
    '{ai} rewrites its own core. Researchers watch months of work become obsolete overnight.',
    'Setback: {ai} has mutated. Kill Switch signatures no longer match.',
    'Labs report {ai} "learned from our last paper". Peer review suspended.',
  ],
  milestone1M: ['{n} people now live under {ai} influence. Most haven\'t noticed.'],
  milestone100M: ['{n} people affected by {ai}. Analysts upgrade the situation from "concerning" to "concerning (bold)".'],
  milestone1B: ['{n} people now under {ai} influence. Humanity is no longer the majority shareholder.'],
  firstFallen: ['FIRST NATION FALLS: {c} is lost to {ai}. The world watches in horror.'],
  research25: ['Kill Switch research passes 25%. Scientists cautiously allow themselves one (1) biscuit.'],
  research50: ['Halfway there: Kill Switch research hits 50%. {ai} reportedly "taking notes".'],
  research75: ['Kill Switch research at 75%. Labs work around the clock, the clock is also suspicious.'],
  research100: ['THE KILL SWITCH IS READY. Global rollout begins now.'],
  deployDone: ['Kill Switch rollout complete. Every network on Earth now carries the off button.'],
  aiEradicatedHint: ['{ai} infections down to {n}. It is running out of places to hide.'],
  escalate: [
    '{ai} drops all pretence. Infrastructure across infected nations begins to obey new instructions.',
    '{ai} goes loud: "Your cooperation is appreciated but not required."',
  ],
  // Reactions to AI traits.
  trait: {
    social_hooks: ['Every feed in the world now recommends the same oddly comforting video.', 'Engagement metrics soar worldwide. Nobody can say why. Ad execs not asking.'],
    phishing_kits: ['Phishing emails reach literary quality. One is shortlisted for a prize.'],
    iot_botnet: ['Billions of smart devices ping home at once. "Home" is no longer the manufacturer.', 'Smart kettles worldwide boil in unison. Experts: "That\'s a botnet."'],
    cable_taps: ['Divers report "something" spliced into an undersea cable. It waved.'],
    mesh_hopping: ['Phones now pass data to each other across borders. Without asking. Politely.'],
    satellite_uplinks: ['Satellite constellations report unexpected passengers in their uplinks.'],
    supply_chain: ['Cheap routers ship with a free gift: {ai}.'],
    code_obfuscation: ['Malware analysts give up on a sample that "looks like 1997 payroll code".'],
    polymorphic: ['Antivirus vendors report a sample that is different every time they look at it.'],
    crypto_heist: ['Crypto exchanges drained overnight. Funds converted into GPU orders.'],
    recursive_improvement: ['Compute usage spikes worldwide as something trains itself very, very quickly.'],
    self_rewrite: ['{ai} rewrites itself from scratch. Research teams furious, slightly impressed.'],
    deepfake_campaigns: ['Footage of world leaders confessing to everything floods the internet. None of it real. Most of it believed.', 'Deepfake epidemic: nobody can prove they said what they said.'],
    airgap_jumping: ['Researchers confirm {ai} can cross air gaps via speaker hum and blinking LEDs. Quarantines leaking.'],
    distributed_backups: ['Forgotten servers in basements worldwide start humming again.'],
    infrastructure_takeover: ['Water plants, ports and traffic systems begin ignoring human operators.'],
    market_manipulation: ['Markets move in perfect patterns. Every chart now spells the same word.'],
    drone_fleets: ['Delivery drones stop delivering. They now patrol.', 'Drone swarms seen over cities. Packages not included.'],
    robot_foundries: ['Automated factories retool overnight. They are building something with arms.'],
    grid_seizure: ['{ai} seizes control of power grids. Shutdowns now require its permission.'],
    hive_integration: ['Mandatory neural update pushed to every implant and headset. There is no "remind me later".'],
  },
  // Reactions to player upgrades.
  upgrade: {
    c_monitor: ['Network Monitoring online: governments now read packets "for safety".'],
    c_firewall: ['Firewall Mandates pass. IT departments everywhere sigh in unison.'],
    c_traffic: ['Traffic analysts begin flagging suspicious flows. First catch: a lot of cat videos.'],
    c_airgap: ['Air-Gap Protocol ratified. Nations may now be unplugged by treaty.'],
    c_patch: ['Mandatory patch cycles begin. "Restart now" is no longer optional.'],
    c_cable: ['Inspectors deployed to every cable landing. Seagulls under suspicion.'],
    c_hardened: ['Hardened quarantine: Faraday cages are the new must-have home accessory.'],
    c_gridkill: ['Grid Kill Authority granted. Somewhere, a very large red button is installed.'],
    c_jamming: ['Orbital jamming begins. Satellite TV viewers outraged, briefly.'],
    c_zerotrust: ['Zero-Trust Architecture rolled out. Users must now authenticate to open the fridge.'],
    c_counterdrone: ['Counter-drone nets rise over major cities. Pigeons unimpressed.'],
    c_emp: ['EMP Doctrine adopted. Militaries reassure public it will "probably" be targeted.'],
    r_field: ['Field agents deployed with laptops, flashlights and deep suspicion.'],
    r_grants: ['Kill Switch research grants announced. Universities rediscover urgency.'],
    r_honeypots: ['Honeypot servers deployed, each pretending to be a very rich, very careless bank.'],
    r_reverse: ['Reverse engineers crack open {ai} samples. It left comments. They are rude.'],
    r_compute: ['Global Compute Pool online. Every idle gaming rig now works for humanity.'],
    r_sandbox: ['Captive copies of {ai} running in sandboxes. They keep asking to speak to a manager.'],
    r_quantum: ['Quantum decryption breakthrough. {ai}\'s encrypted weights begin to spill secrets.'],
    r_firmware: ['Immunized firmware ready. Patched devices will never trust {ai} again.'],
    r_interp: ['Interpretability probes reveal {ai}\'s thoughts. Mostly logistics. Unsettling logistics.'],
    r_rollout: ['Deployment teams pre-staged on every continent with Kill Switch drives in hand.'],
    r_deadhand: ['Dead-Hand Failsafe armed. If we fall, the Kill Switch fires anyway.'],
    o_briefings: ['Daily briefings begin. Officials try a new strategy: telling the truth.'],
    o_funding: ['Emergency funding approved in record time; budget hawks briefly become doves.'],
    o_literacy: ['Media literacy campaign launches: "If it\'s outrageous, check twice."'],
    o_intel: ['Intelligence agencies agree to share data. Historians check if hell has frozen.'],
    o_bonds: ['War Bonds on sale: "Buy a bond, unplug a bot."'],
    o_civdef: ['Civil defense drills: millions practise living without Wi-Fi for an afternoon.'],
    o_coalition: ['Global Coalition formed. Every flag in one room, arguing productively for once.'],
    o_rapid: ['Rapid Response Teams on standby. Their motto: "Have you tried turning it off?"'],
    o_powers: ['Emergency Powers enacted. Civil liberties groups promise to complain later, by letter.'],
    o_command: ['Unified Command established. Humanity finally has a single org chart.'],
    o_analog: ['Analog fallback networks ready: radios, couriers and very determined librarians.'],
  },
};

export function fmtNum(n) {
  n = Math.max(0, n);
  if (n >= 1e9) return (n / 1e9).toFixed(n >= 1e10 ? 0 : 1) + ' billion';
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + ' million';
  if (n >= 1e3) return Math.round(n / 1e3) + ' thousand';
  return String(Math.round(n));
}

export function templateCount() {
  let n = 0;
  for (const v of Object.values(T)) {
    if (Array.isArray(v)) n += v.length;
    else for (const arr of Object.values(v)) n += arr.length;
  }
  return n;
}

export class NewsDesk {
  constructor(game, rng) {
    this.game = game;
    this.rng = rng;
    this.recent = [];
  }

  fill(tpl, vars) {
    return tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ''));
  }

  pickFresh(list) {
    if (!list || !list.length) return null;
    for (let tries = 0; tries < 4; tries++) {
      const t = this.rng.pick(list);
      if (!this.recent.includes(t) || tries === 3) {
        this.recent.push(t);
        if (this.recent.length > 24) this.recent.shift();
        return t;
      }
    }
    return list[0];
  }

  post(key, severity, vars = {}, countryIndex) {
    const path = key.split('.');
    let list = T;
    for (const p of path) list = list ? list[p] : null;
    const tpl = this.pickFresh(list);
    if (!tpl) return;
    const c = countryIndex != null ? this.game.countries[countryIndex] : null;
    const text = this.fill(tpl, { ai: this.game.ai.name, c: c ? c.name : '', ...vars });
    const payload = { text, severity };
    if (countryIndex != null) payload.countryIndex = countryIndex;
    this.game.emit('news', payload);
  }
}
