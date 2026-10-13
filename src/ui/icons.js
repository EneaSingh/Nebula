// Inline stroke icons (24x24, currentColor). Every IconKey from docs/ARCHITECTURE.md
// is implemented, plus a few UI glyphs. No emoji anywhere.

const P = {
  // ---- contract IconKeys ----
  shield: '<path d="M12 3l7 3v5.2c0 4.4-2.9 8.1-7 9.8-4.1-1.7-7-5.4-7-9.8V6z"/><path d="M9 12l2 2 4-4"/>',
  firewall: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 9.7h18M3 14.3h18M8 5v4.7M16 5v4.7M12 9.7v4.6M8 14.3V19M16 14.3V19"/>',
  cable: '<path d="M3 17c3 0 3-4 6-4s3 4 6 4 3-4 6-4"/><path d="M3 9c3 0 3-4 6-4s3 4 6 4 3-4 6-4" opacity=".45"/><circle cx="3" cy="17" r="1.2"/><circle cx="21" cy="13" r="1.2"/>',
  satellite: '<rect x="9.5" y="9.5" width="5" height="5" rx="1"/><rect x="2" y="10" width="5" height="4" rx=".5"/><rect x="17" y="10" width="5" height="4" rx=".5"/><path d="M7 12h2.5M14.5 12H17M12 9.5V7"/><path d="M9.5 4.5a3.5 3.5 0 0 0 5 0"/>',
  wifi: '<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.2" r=".9" fill="currentColor"/>',
  lab: '<path d="M5 21h14M8 21v-2.5h8V21"/><path d="M10.2 3.2l3.6 1.8-2.6 5.4-3.6-1.8z"/><path d="M9.6 9.6L8.4 12M14 9.5a4.5 4.5 0 0 1 1 8.8"/><path d="M7 15h5"/>',
  flask: '<path d="M9 3h6M10 3v6.2L4.8 18a2 2 0 0 0 1.7 3h11a2 2 0 0 0 1.7-3L14 9.2V3"/><path d="M7.2 14.5h9.6"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="1.5"/><rect x="9.5" y="9.5" width="5" height="5" rx=".5"/><path d="M9 2.5V6M15 2.5V6M9 18v3.5M15 18v3.5M2.5 9H6M2.5 15H6M18 9h3.5M18 15h3.5"/>',
  brain: '<path d="M12 5.5A3 3 0 0 0 6.6 4 3 3 0 0 0 4 8.8a3.2 3.2 0 0 0 .4 5.7A3 3 0 0 0 8 19.4a2.6 2.6 0 0 0 4 .6z"/><path d="M12 5.5A3 3 0 0 1 17.4 4 3 3 0 0 1 20 8.8a3.2 3.2 0 0 1-.4 5.7 3 3 0 0 1-3.6 4.9 2.6 2.6 0 0 1-4 .6"/><path d="M12 5.5V20M8.5 10.5c1 .3 2 0 2.5-.8M15.5 10.5c-1 .3-2 0-2.5-.8M8.8 15c1-.4 2-.2 2.6.5M15.2 15c-1-.4-2-.2-2.6.5"/>',
  eye: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12l6.4-6.4"/><circle cx="15.2" cy="14.8" r="1" fill="currentColor"/>',
  megaphone: '<path d="M3 10.2v3.6a1 1 0 0 0 1 1h3l8.5 4.2V5L7 9.2H4a1 1 0 0 0-1 1z"/><path d="M7 14.8L8.6 20H11l-1.1-4.6M18.6 9.4a3.6 3.6 0 0 1 0 5.2"/>',
  handshake: '<path d="M2 9l3.5-2.5L9 8l3-1.8L15 7l3.5-.5L22 9"/><path d="M5.5 6.5L2 13l4.5 4.2M18.5 6.5L22 13l-4.5 4.5"/><path d="M12 6.2L8.6 9.4a1.3 1.3 0 0 0 1.8 1.9l2.4-1.8 4.7 4.5a1.3 1.3 0 0 1-1.8 1.8M15.7 15.8a1.3 1.3 0 0 1-1.8 1.8l-1.3-1.2M12.6 16.4a1.3 1.3 0 0 1-1.8 1.8L6.5 17.2"/>',
  money: '<rect x="2" y="6" width="20" height="12" rx="1.5"/><circle cx="12" cy="12" r="2.8"/><path d="M5.5 9.5h.01M18.5 14.5h.01"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3M12 15v2.2"/>',
  power: '<path d="M12 3v8.5M6.3 6.6a8 8 0 1 0 11.4 0"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z"/>',
  bolt: '<path d="M13 2.5L4.5 14H11l-1 7.5L18.5 10H12z"/>',
  drone: '<rect x="9" y="10" width="6" height="4" rx="1"/><path d="M9 11L6.8 8.8M15 11l2.2-2.2M9 13l-2.2 2.2M15 13l2.2 2.2"/><circle cx="5.5" cy="7.5" r="2.3"/><circle cx="18.5" cy="7.5" r="2.3"/><circle cx="5.5" cy="16.5" r="2.3"/><circle cx="18.5" cy="16.5" r="2.3"/>',
  factory: '<path d="M3 21V10.5l5 3v-3l5 3v-3l5 3V4h3v17z"/><path d="M7 17.5h2M12 17.5h2M3 21h18"/>',
  robot: '<rect x="5" y="8" width="14" height="11" rx="2"/><path d="M12 8V5M9 19v2M15 19v2M2.5 12.5H5M19 12.5h2.5M9.5 16h5"/><circle cx="12" cy="4" r="1"/><circle cx="9.5" cy="12.5" r="1.2"/><circle cx="14.5" cy="12.5" r="1.2"/>',
  skull: '<path d="M12 3a8 8 0 0 0-8 8c0 2.6 1.2 4.4 3 5.5V20h10v-3.5c1.8-1.1 3-2.9 3-5.5a8 8 0 0 0-8-8z"/><circle cx="9" cy="11.5" r="1.7"/><circle cx="15" cy="11.5" r="1.7"/><path d="M10 20v-2M14 20v-2M12 14.6l-.9 1.6h1.8z"/>',
  mask: '<path d="M4 6c5.3-2 10.7-2 16 0v5c0 5-3.6 9-8 9s-8-4-8-9z"/><path d="M7.4 10.8c1.1-.9 2.5-.9 3.6 0M13 10.8c1.1-.9 2.5-.9 3.6 0M9.5 15.5c1.6 1.1 3.4 1.1 5 0"/>',
  code: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M13.8 4l-3.6 16"/>',
  server: '<rect x="3" y="4" width="18" height="7" rx="1.5"/><rect x="3" y="13" width="18" height="7" rx="1.5"/><path d="M7 7.5h.01M7 16.5h.01M11 7.5h6M11 16.5h6"/>',
  plane: '<path d="M21 16l-7.5-4.6V5a1.5 1.5 0 0 0-3 0v6.4L3 16v2l7.5-2.4v3.6L8.5 21v1.2L12 21.4l3.5.8V21l-2-1.8v-3.6L21 18z"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M15.5 4.7a3.5 3.5 0 0 1 0 6.6M18 14a6.5 6.5 0 0 1 3.5 6"/>',
  scale: '<path d="M12 4v17M8 21h8M4.5 6.5h15M12 4V3"/><path d="M5 7l-2.5 6a2.5 2.5 0 0 0 5 0zM19 7l-2.5 6a2.5 2.5 0 0 0 5 0z"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/><path d="M12 1.5V5M12 19v3.5M1.5 12H5M19 12h3.5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z"/>',

  // ---- UI glyphs ----
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  play: '<path d="M7.5 5.5l11 6.5-11 6.5z"/>',
  play2: '<path d="M3.5 6l8 6-8 6zM12.5 6l8 6-8 6z"/>',
  sound: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  mute: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  play3: '<path d="M1.5 6.5l6.5 5.5-6.5 5.5zM8.75 6.5l6.5 5.5-6.5 5.5zM16 6.5l6.5 5.5L16 17.5z"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  chevronRight: '<path d="M9 6l6 6-6 6"/>',
  news: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M7 9h10M7 12h10M7 15h6"/>',
  dossier: '<path d="M3.5 5h6l2 2h9v12.5h-17z"/><path d="M7.5 12h9M7.5 15.5h5.5"/>',
  alert: '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.2h.01"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8h.01"/>',
  hex: '<path d="M12 2.8l8 4.6v9.2l-8 4.6-8-4.6V7.4z"/>',
  ops: '<path d="M12 2.8l8 4.6v9.2l-8 4.6-8-4.6V7.4z"/><path d="M12 7.5l3.9 2.25v4.5L12 16.5l-3.9-2.25v-4.5z" fill="currentColor" stroke="none" opacity=".9"/>',
  tree: '<circle cx="5.5" cy="12" r="2.2"/><circle cx="18.5" cy="5.5" r="2.2"/><circle cx="18.5" cy="18.5" r="2.2"/><path d="M7.7 12h4.3M12 5.5v13M12 5.5h4.3M12 18.5h4.3"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1.1" fill="currentColor"/><circle cx="15" cy="15" r="1.1" fill="currentColor"/><circle cx="15" cy="9" r="1.1" fill="currentColor"/><circle cx="9" cy="15" r="1.1" fill="currentColor"/>',
  arrowRight: '<path d="M4 12h15M13 6l6 6-6 6"/>',
  restart: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4.5v4h4"/>',
  trust: '<path d="M12 3l7 3v5.2c0 4.4-2.9 8.1-7 9.8-4.1-1.7-7-5.4-7-9.8V6z"/><path d="M8.5 12.2c1 .9 2.3 1.7 3.5 1.7s2.5-.8 3.5-1.7"/>',
};

const ALIASES = {};

/** SVG markup for an icon key. Unknown keys fall back to a hexagon. */
export function icon(key, cls = '') {
  const body = P[key] || P[ALIASES[key]] || P.hex;
  return `<svg class="ico${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

export const ICON_KEYS = Object.keys(P);
