// Network graph: wireless (land neighbours), submarine cables (coastal/hub links) and
// satellites (handled globally in game.js). Pure data, deterministic.
import { HUBS, LANDLOCKED } from './countryStats.js';

const RAD = Math.PI / 180;

export function greatCircle(a, b) {
  const [lon1, lat1] = a, [lon2, lat2] = b;
  const p1 = lat1 * RAD, p2 = lat2 * RAD;
  const dp = p2 - p1, dl = (lon2 - lon1) * RAD;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h))); // radians
}

/**
 * Returns adjacency: links[i] = [{ to, route: 'wireless'|'cable', weight }].
 * `playable[i]` false → country excluded (Antarctica).
 */
export function buildNetwork(geo, playable) {
  const n = geo.length;
  const links = Array.from({ length: n }, () => []);
  const seen = new Set();
  const add = (a, b, route, weight) => {
    if (a === b || !playable[a] || !playable[b]) return;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (seen.has(key)) {
      // Upgrade an existing link's weight if this one is stronger.
      for (const l of links[a]) if (l.to === b && l.weight < weight) { l.weight = weight; }
      for (const l of links[b]) if (l.to === a && l.weight < weight) { l.weight = weight; }
      return;
    }
    seen.add(key);
    links[a].push({ to: b, route, weight });
    links[b].push({ to: a, route, weight });
  };

  // Wireless: land neighbours.
  for (let i = 0; i < n; i++) for (const j of geo[i].neighbors) add(i, j, 'wireless', 1);

  const tier = geo.map((c) => HUBS[c.id] || 0);
  const tier1 = [], tier2 = [];
  for (let i = 0; i < n; i++) {
    if (!playable[i]) continue;
    if (tier[i] === 1) tier1.push(i);
    else if (tier[i] === 2) tier2.push(i);
  }
  const dist = (a, b) => greatCircle(geo[a].centroid, geo[b].centroid);
  const nearest = (i, pool, k) =>
    pool.filter((j) => j !== i).map((j) => [j, dist(i, j)]).sort((x, y) => x[1] - y[1]).slice(0, k).map((x) => x[0]);

  // Tier-1 backbone: full mesh.
  for (let a = 0; a < tier1.length; a++)
    for (let b = a + 1; b < tier1.length; b++) add(tier1[a], tier1[b], 'cable', 1.4);
  // Tier-2: to the 3 nearest backbone hubs and the 2 nearest regional hubs.
  for (const i of tier2) {
    for (const j of nearest(i, tier1, 3)) add(i, j, 'cable', 1.0);
    for (const j of nearest(i, tier2, 2)) add(i, j, 'cable', 0.8);
  }
  // Everyone else with a coastline: nearest regional/backbone hub + nearest backbone hub.
  const hubs = tier1.concat(tier2);
  for (let i = 0; i < n; i++) {
    if (!playable[i] || tier[i] || LANDLOCKED.has(geo[i].id)) continue;
    const [h] = nearest(i, hubs, 1);
    if (h != null) add(i, h, 'cable', 0.6);
    const [t] = nearest(i, tier1, 1);
    if (t != null) add(i, t, 'cable', 0.5);
  }
  return links;
}
