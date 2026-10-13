// Procedural card art drawn on <canvas>: no image files.
// Two decks share one layout: "classic" (Napoletane-style Italian cards)
// and "scifi" (holographic panels). Every function draws in card pixels.
import { points } from './rules.js';

export const CARD_W = 384;
export const CARD_H = 596;
const R = 26; // corner radius in px

const RANK_NAMES = { 1: 'Asso', 8: 'Fante', 9: 'Cavallo', 10: 'Re' };
export const SUIT_LABEL = {
  classic: { coppe: 'Coppe', denari: 'Denari', spade: 'Spade', bastoni: 'Bastoni' },
  scifi: { coppe: 'Flux', denari: 'Credits', spade: 'Blades', bastoni: 'Rods' },
};
export const SCIFI_COLOR = { coppe: '#38e8ff', denari: '#ffc640', spade: '#ff4fb0', bastoni: '#70ff6a' };
const SCIFI_RANK = { 1: 'ACE', 2: 'TWO', 3: 'THREE', 4: 'FOUR', 5: 'FIVE', 6: 'SIX', 7: 'SEVEN', 8: 'PILOT', 9: 'MECH', 10: 'ADMIRAL' };

export const rankName = (rank, theme) =>
  theme === 'scifi' ? SCIFI_RANK[rank][0] + SCIFI_RANK[rank].slice(1).toLowerCase() : RANK_NAMES[rank] || String(rank);

const FONT = {
  classic: '"Cinzel", "Palatino Linotype", Georgia, serif',
  scifi: '"Orbitron", "Saira Condensed", "Segoe UI", sans-serif',
};

function canvas() {
  const c = document.createElement('canvas');
  c.width = CARD_W;
  c.height = CARD_H;
  return c;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Chamfered rectangle for the sci-fi frame.
function chamfer(ctx, x, y, w, h, c) {
  ctx.beginPath();
  ctx.moveTo(x + c, y);
  ctx.lineTo(x + w - c, y);
  ctx.lineTo(x + w, y + c);
  ctx.lineTo(x + w, y + h - c);
  ctx.lineTo(x + w - c, y + h);
  ctx.lineTo(x + c, y + h);
  ctx.lineTo(x, y + h - c);
  ctx.lineTo(x, y + c);
  ctx.closePath();
}

// Deterministic noise so textures don't shimmer between rebuilds.
function speckle(ctx, n, color, seed, w = CARD_W, h = CARD_H) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) ctx.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
}

// ---------------------------------------------------------------- classic pips
const GOLD = ['#fbe08a', '#e2b33c', '#a8761b'];

function goldGrad(ctx, x0, y0, x1, y1) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, GOLD[0]);
  g.addColorStop(0.5, GOLD[1]);
  g.addColorStop(1, GOLD[2]);
  return g;
}

function coin(ctx, r) {
  ctx.save();
  ctx.lineWidth = Math.max(1.5, r * 0.06);
  ctx.strokeStyle = '#5a3510';
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
  g.addColorStop(0, GOLD[0]);
  g.addColorStop(0.6, GOLD[1]);
  g.addColorStop(1, GOLD[2]);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#b3261e';
  ctx.lineWidth = r * 0.1;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2);
  ctx.stroke();
  // Rosette.
  for (let i = 0; i < 8; i++) {
    ctx.save();
    ctx.rotate((i * Math.PI) / 4);
    ctx.fillStyle = i % 2 ? '#2f7d4a' : '#b3261e';
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.38, r * 0.12, r * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#1f4fa0';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function cup(ctx, s) {
  ctx.save();
  ctx.lineWidth = Math.max(1.5, s * 0.025);
  ctx.strokeStyle = '#5a3510';
  ctx.lineJoin = 'round';
  // Bowl.
  ctx.fillStyle = goldGrad(ctx, -s * 0.4, 0, s * 0.4, 0);
  ctx.beginPath();
  ctx.moveTo(-s * 0.36, -s * 0.42);
  ctx.bezierCurveTo(-s * 0.36, -s * 0.05, -s * 0.15, s * 0.02, 0, s * 0.02);
  ctx.bezierCurveTo(s * 0.15, s * 0.02, s * 0.36, -s * 0.05, s * 0.36, -s * 0.42);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Red band and rim.
  ctx.fillStyle = '#b3261e';
  ctx.fillRect(-s * 0.33, -s * 0.3, s * 0.66, s * 0.07);
  ctx.strokeRect(-s * 0.33, -s * 0.3, s * 0.66, s * 0.07);
  ctx.fillStyle = '#7a4c12';
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.42, s * 0.36, s * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Stem with knot.
  ctx.fillStyle = goldGrad(ctx, -s * 0.06, 0, s * 0.06, 0);
  ctx.fillRect(-s * 0.045, s * 0.02, s * 0.09, s * 0.3);
  ctx.strokeRect(-s * 0.045, s * 0.02, s * 0.09, s * 0.3);
  ctx.fillStyle = '#1f4fa0';
  ctx.beginPath();
  ctx.ellipse(0, s * 0.15, s * 0.1, s * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // Foot.
  ctx.fillStyle = goldGrad(ctx, -s * 0.25, 0, s * 0.25, 0);
  ctx.beginPath();
  ctx.moveTo(-s * 0.06, s * 0.3);
  ctx.quadraticCurveTo(-s * 0.26, s * 0.38, -s * 0.26, s * 0.46);
  ctx.lineTo(s * 0.26, s * 0.46);
  ctx.quadraticCurveTo(s * 0.26, s * 0.38, s * 0.06, s * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function sword(ctx, len) {
  ctx.save();
  ctx.lineWidth = Math.max(1.2, len * 0.012);
  ctx.strokeStyle = '#1d2a3a';
  ctx.lineJoin = 'round';
  const w = len * 0.055;
  // Blade (point at top).
  const g = ctx.createLinearGradient(-w, 0, w, 0);
  g.addColorStop(0, '#dfe8f2');
  g.addColorStop(0.5, '#8fa6c0');
  g.addColorStop(1, '#4e6a8c');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, -len * 0.5);
  ctx.quadraticCurveTo(w * 1.2, -len * 0.2, w, len * 0.22);
  ctx.lineTo(-w, len * 0.22);
  ctx.quadraticCurveTo(-w * 1.2, -len * 0.2, 0, -len * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(30,45,70,0.5)';
  ctx.beginPath();
  ctx.moveTo(0, -len * 0.44);
  ctx.lineTo(0, len * 0.2);
  ctx.stroke();
  ctx.strokeStyle = '#1d2a3a';
  // Crossguard.
  ctx.fillStyle = goldGrad(ctx, 0, len * 0.21, 0, len * 0.27);
  ctx.beginPath();
  ctx.moveTo(-len * 0.17, len * 0.2);
  ctx.quadraticCurveTo(0, len * 0.26, len * 0.17, len * 0.2);
  ctx.lineTo(len * 0.17, len * 0.25);
  ctx.quadraticCurveTo(0, len * 0.3, -len * 0.17, len * 0.25);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Grip and pommel.
  ctx.fillStyle = '#8a2a1c';
  ctx.fillRect(-w * 0.75, len * 0.27, w * 1.5, len * 0.16);
  ctx.strokeRect(-w * 0.75, len * 0.27, w * 1.5, len * 0.16);
  ctx.fillStyle = goldGrad(ctx, 0, len * 0.43, 0, len * 0.5);
  ctx.beginPath();
  ctx.arc(0, len * 0.46, w * 1.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function baton(ctx, len) {
  ctx.save();
  ctx.lineWidth = Math.max(1.2, len * 0.012);
  ctx.strokeStyle = '#2b1a0c';
  const top = len * 0.09;
  const bot = len * 0.045;
  const g = ctx.createLinearGradient(-top, 0, top, 0);
  g.addColorStop(0, '#9bc46a');
  g.addColorStop(0.5, '#5f8a35');
  g.addColorStop(1, '#3a5a1f');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-top, -len * 0.42);
  ctx.quadraticCurveTo(0, -len * 0.52, top, -len * 0.42);
  ctx.lineTo(bot, len * 0.46);
  ctx.quadraticCurveTo(0, len * 0.5, -bot, len * 0.46);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // Knots where branches were cut.
  ctx.fillStyle = '#c9a05a';
  for (let i = 0; i < 5; i++) {
    const t = -0.32 + i * 0.17;
    const side = i % 2 ? 1 : -1;
    const half = top + (bot - top) * ((t + 0.42) / 0.88);
    ctx.beginPath();
    ctx.ellipse(side * half * 0.95, len * t, half * 0.35, half * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  // Red bands.
  ctx.fillStyle = '#b3261e';
  ctx.fillRect(-top * 0.98, -len * 0.38, top * 1.96, len * 0.035);
  ctx.fillRect(-bot * 1.1, len * 0.38, bot * 2.2, len * 0.03);
  ctx.restore();
}

// ----------------------------------------------------------------- sci-fi pips
function glow(ctx, color, blur) {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
}

function sfCredit(ctx, r, color) {
  ctx.save();
  glow(ctx, color, r * 0.4);
  ctx.lineWidth = Math.max(2, r * 0.09);
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3 + Math.PI / 6;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.lineWidth = Math.max(1.5, r * 0.05);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.34);
  ctx.lineTo(r * 0.22, 0);
  ctx.lineTo(0, r * 0.34);
  ctx.lineTo(-r * 0.22, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function sfFlux(ctx, s, color) {
  ctx.save();
  glow(ctx, color, s * 0.15);
  ctx.lineWidth = Math.max(2, s * 0.035);
  ctx.lineJoin = 'round';
  // Faceted chalice holding a plasma orb.
  ctx.beginPath();
  ctx.moveTo(-s * 0.32, -s * 0.2);
  ctx.lineTo(-s * 0.2, s * 0.08);
  ctx.lineTo(-s * 0.05, s * 0.14);
  ctx.lineTo(-s * 0.05, s * 0.32);
  ctx.lineTo(-s * 0.22, s * 0.44);
  ctx.lineTo(s * 0.22, s * 0.44);
  ctx.lineTo(s * 0.05, s * 0.32);
  ctx.lineTo(s * 0.05, s * 0.14);
  ctx.lineTo(s * 0.2, s * 0.08);
  ctx.lineTo(s * 0.32, -s * 0.2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-s * 0.32, -s * 0.2);
  ctx.lineTo(s * 0.32, -s * 0.2);
  ctx.stroke();
  const g = ctx.createRadialGradient(0, -s * 0.3, 0, 0, -s * 0.3, s * 0.18);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.4, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, -s * 0.3, s * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function sfBlade(ctx, len, color) {
  ctx.save();
  glow(ctx, color, len * 0.06);
  ctx.lineWidth = Math.max(1.5, len * 0.014);
  const w = len * 0.05;
  ctx.beginPath();
  ctx.moveTo(0, -len * 0.5);
  ctx.lineTo(w, len * 0.18);
  ctx.lineTo(-w, len * 0.18);
  ctx.closePath();
  ctx.globalAlpha = 0.35;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -len * 0.42);
  ctx.lineTo(0, len * 0.16);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1, len * 0.006);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, len * 0.014);
  ctx.beginPath();
  ctx.moveTo(-len * 0.14, len * 0.22);
  ctx.lineTo(-len * 0.08, len * 0.18);
  ctx.lineTo(len * 0.08, len * 0.18);
  ctx.lineTo(len * 0.14, len * 0.22);
  ctx.stroke();
  ctx.strokeRect(-w * 0.6, len * 0.24, w * 1.2, len * 0.18);
  ctx.beginPath();
  ctx.moveTo(-w * 0.6, len * 0.30);
  ctx.lineTo(w * 0.6, len * 0.30);
  ctx.moveTo(-w * 0.6, len * 0.36);
  ctx.lineTo(w * 0.6, len * 0.36);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, len * 0.46, w * 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function sfRod(ctx, len, color) {
  ctx.save();
  glow(ctx, color, len * 0.06);
  ctx.lineWidth = Math.max(1.5, len * 0.014);
  const w = len * 0.045;
  const segs = 5;
  for (let i = 0; i < segs; i++) {
    const y0 = -len * 0.42 + (i * len * 0.84) / segs;
    const h = (len * 0.84) / segs - len * 0.025;
    ctx.strokeRect(-w, y0, w * 2, h);
    ctx.globalAlpha = 0.25;
    ctx.fillRect(-w, y0, w * 2, h);
    ctx.globalAlpha = 1;
  }
  ctx.beginPath();
  ctx.arc(0, -len * 0.46, w * 1.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-w * 1.8, len * 0.45);
  ctx.lineTo(w * 1.8, len * 0.45);
  ctx.stroke();
  ctx.restore();
}

// --------------------------------------------------------------------- layout
// Pip placement for 1..7 within the inner area, in [-1, 1] coordinates.
const ROUND_LAYOUT = {
  2: [[0, -0.5], [0, 0.5]],
  3: [[0, -0.62], [0, 0], [0, 0.62]],
  4: [[-0.48, -0.5], [0.48, -0.5], [-0.48, 0.5], [0.48, 0.5]],
  5: [[-0.48, -0.55], [0.48, -0.55], [0, 0], [-0.48, 0.55], [0.48, 0.55]],
  6: [[-0.48, -0.64], [0.48, -0.64], [-0.48, 0], [0.48, 0], [-0.48, 0.64], [0.48, 0.64]],
  7: [[-0.48, -0.66], [0.48, -0.66], [0, -0.33], [-0.48, 0], [0.48, 0], [-0.48, 0.66], [0.48, 0.66]],
};

const LONG_SUITS = new Set(['spade', 'bastoni']);

function drawPip(ctx, theme, suit, size) {
  if (theme === 'classic') {
    if (suit === 'denari') coin(ctx, size * 0.42);
    else if (suit === 'coppe') cup(ctx, size);
    else if (suit === 'spade') sword(ctx, size);
    else baton(ctx, size);
  } else {
    const c = SCIFI_COLOR[suit];
    if (suit === 'denari') sfCredit(ctx, size * 0.42, c);
    else if (suit === 'coppe') sfFlux(ctx, size, c);
    else if (suit === 'spade') sfBlade(ctx, size, c);
    else sfRod(ctx, size, c);
  }
}

function drawPips(ctx, theme, card, area) {
  const { x, y, w, h } = area;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const n = card.rank;
  if (n === 1) {
    ctx.save();
    ctx.translate(cx, cy);
    if (LONG_SUITS.has(card.suit)) ctx.rotate(-0.12);
    drawPip(ctx, theme, card.suit, LONG_SUITS.has(card.suit) ? h * 0.92 : h * 0.62);
    ctx.restore();
    return;
  }
  if (LONG_SUITS.has(card.suit)) {
    // Long pips stand side by side, alternately tilted, in one or two rows.
    const rows = n <= 2 ? [n] : [Math.ceil(n / 2), Math.floor(n / 2)];
    const len = rows.length === 1 ? h * 0.9 : h * 0.47;
    const span = w * 1.2;
    rows.forEach((count, r) => {
      const rowY = rows.length === 1 ? cy : y + h * (r === 0 ? 0.25 : 0.75);
      for (let i = 0; i < count; i++) {
        const px = cx + (i - (count - 1) / 2) * (span / Math.max(count, 2.4));
        ctx.save();
        ctx.translate(px, rowY);
        ctx.rotate((i % 2 ? 1 : -1) * 0.13);
        drawPip(ctx, theme, card.suit, len);
        ctx.restore();
      }
    });
    return;
  }
  const size = Math.min(w, h) * (n <= 3 ? 0.5 : 0.42);
  for (const [u, v] of ROUND_LAYOUT[n]) {
    ctx.save();
    ctx.translate(cx + (u * w) / 2, cy + (v * h) / 2 * 0.9);
    drawPip(ctx, theme, card.suit, card.suit === 'denari' ? size * 1.15 : size);
    ctx.restore();
  }
}

// ------------------------------------------------------------- classic figures
function classicFigure(ctx, card, area) {
  const { x, y, w, h } = area;
  const cx = x + w / 2;
  const palette = {
    8: { bg: '#2d5f9a', robe: '#1f4fa0', trim: '#e2b33c' },
    9: { bg: '#3d7a4a', robe: '#8a3a1c', trim: '#e2b33c' },
    10: { bg: '#a12a22', robe: '#b3261e', trim: '#e2b33c' },
  }[card.rank];

  // Arched panel.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + w / 2);
  ctx.arc(cx, y + w / 2, w / 2, Math.PI, 0);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  const bg = ctx.createLinearGradient(0, y, 0, y + h);
  bg.addColorStop(0, palette.bg);
  bg.addColorStop(1, '#f3e6c4');
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#5a3510';
  ctx.stroke();
  ctx.clip();

  ctx.lineWidth = 3;
  ctx.strokeStyle = '#3a220c';
  ctx.lineJoin = 'round';
  const skin = '#f2c9a0';
  const headY = y + h * 0.36;
  const headR = w * 0.13;

  if (card.rank === 9) {
    // Horse head and neck, with the rider's lance-bearing arm suggested by the pip.
    ctx.fillStyle = '#f0ebe0';
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.36, y + h);
    ctx.bezierCurveTo(cx - w * 0.34, y + h * 0.62, cx - w * 0.22, y + h * 0.4, cx - w * 0.02, y + h * 0.26);
    ctx.lineTo(cx + w * 0.02, y + h * 0.17); // ear
    ctx.lineTo(cx + w * 0.08, y + h * 0.26);
    ctx.bezierCurveTo(cx + w * 0.2, y + h * 0.3, cx + w * 0.34, y + h * 0.42, cx + w * 0.38, y + h * 0.5);
    ctx.quadraticCurveTo(cx + w * 0.4, y + h * 0.56, cx + w * 0.32, y + h * 0.57); // muzzle
    ctx.bezierCurveTo(cx + w * 0.2, y + h * 0.54, cx + w * 0.08, y + h * 0.52, cx + w * 0.02, y + h * 0.58);
    ctx.bezierCurveTo(cx + w * 0.0, y + h * 0.72, cx + w * 0.1, y + h * 0.88, cx + w * 0.16, y + h);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Mane.
    ctx.fillStyle = '#5a3510';
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.02, y + h * 0.27);
    ctx.bezierCurveTo(cx - w * 0.28, y + h * 0.36, cx - w * 0.4, y + h * 0.66, cx - w * 0.36, y + h);
    ctx.lineTo(cx - w * 0.3, y + h);
    ctx.bezierCurveTo(cx - w * 0.3, y + h * 0.7, cx - w * 0.2, y + h * 0.42, cx + w * 0.01, y + h * 0.3);
    ctx.closePath();
    ctx.fill();
    // Eye and bridle.
    ctx.fillStyle = '#1a1008';
    ctx.beginPath();
    ctx.arc(cx + w * 0.1, y + h * 0.34, w * 0.022, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = palette.robe;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(cx + w * 0.04, y + h * 0.29);
    ctx.lineTo(cx + w * 0.16, y + h * 0.52);
    ctx.lineTo(cx + w * 0.34, y + h * 0.5);
    ctx.stroke();
    ctx.strokeStyle = palette.trim;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.12, y + h * 0.6);
    ctx.lineTo(cx + w * 0.05, y + h * 0.66);
    ctx.stroke();
  } else {
    // Bust: robe, head, hair, headwear.
    ctx.fillStyle = palette.robe;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.42, y + h);
    ctx.quadraticCurveTo(cx - w * 0.4, y + h * 0.55, cx, y + h * 0.5);
    ctx.quadraticCurveTo(cx + w * 0.4, y + h * 0.55, cx + w * 0.42, y + h);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = palette.trim;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(cx, y + h * 0.52);
    ctx.lineTo(cx, y + h);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#3a220c';
    // Collar.
    ctx.fillStyle = '#f7f1e2';
    ctx.beginPath();
    ctx.ellipse(cx, y + h * 0.52, w * 0.17, h * 0.035, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Head.
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.ellipse(cx, headY, headR, headR * 1.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#2a1a0c';
    ctx.beginPath();
    ctx.arc(cx - headR * 0.38, headY - headR * 0.1, headR * 0.09, 0, Math.PI * 2);
    ctx.arc(cx + headR * 0.38, headY - headR * 0.1, headR * 0.09, 0, Math.PI * 2);
    ctx.fill();
    if (card.rank === 10) {
      // Beard and crown.
      ctx.fillStyle = '#6b4220';
      ctx.beginPath();
      ctx.moveTo(cx - headR * 0.95, headY + headR * 0.1);
      ctx.quadraticCurveTo(cx - headR * 0.6, headY + headR * 1.9, cx, headY + headR * 1.95);
      ctx.quadraticCurveTo(cx + headR * 0.6, headY + headR * 1.9, cx + headR * 0.95, headY + headR * 0.1);
      ctx.quadraticCurveTo(cx, headY + headR * 0.75, cx - headR * 0.95, headY + headR * 0.1);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = goldGrad(ctx, 0, headY - headR * 2.2, 0, headY - headR * 0.8);
      const cy0 = headY - headR * 0.85;
      ctx.beginPath();
      ctx.moveTo(cx - headR * 1.1, cy0);
      ctx.lineTo(cx - headR * 1.2, cy0 - headR * 1.2);
      ctx.lineTo(cx - headR * 0.6, cy0 - headR * 0.6);
      ctx.lineTo(cx, cy0 - headR * 1.4);
      ctx.lineTo(cx + headR * 0.6, cy0 - headR * 0.6);
      ctx.lineTo(cx + headR * 1.2, cy0 - headR * 1.2);
      ctx.lineTo(cx + headR * 1.1, cy0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#b3261e';
      for (const dx of [-0.6, 0, 0.6]) {
        ctx.beginPath();
        ctx.arc(cx + headR * dx, cy0 - headR * 0.25, headR * 0.13, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Page's cap with a feather.
      ctx.fillStyle = '#6b4220';
      ctx.beginPath();
      ctx.ellipse(cx, headY - headR * 0.2, headR * 1.05, headR * 0.9, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#b3261e';
      ctx.beginPath();
      ctx.ellipse(cx + headR * 0.1, headY - headR * 0.95, headR * 1.35, headR * 0.45, -0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#f7f1e2';
      ctx.beginPath();
      ctx.moveTo(cx + headR * 0.8, headY - headR * 1.2);
      ctx.quadraticCurveTo(cx + headR * 2.2, headY - headR * 2.6, cx + headR * 2.4, headY - headR * 1.4);
      ctx.quadraticCurveTo(cx + headR * 1.8, headY - headR * 1.6, cx + headR * 0.8, headY - headR * 1.2);
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();

  // The figure holds its suit.
  ctx.save();
  const long = LONG_SUITS.has(card.suit);
  ctx.translate(x + w * (card.rank === 9 ? 0.2 : 0.78), y + h * (long ? 0.6 : 0.72));
  if (long) ctx.rotate(card.rank === 9 ? -0.35 : 0.3);
  drawPip(ctx, 'classic', card.suit, long ? h * 0.75 : w * 0.34);
  ctx.restore();
}

// -------------------------------------------------------------- sci-fi figures
function scifiFigure(ctx, card, area) {
  const { x, y, w, h } = area;
  const cx = x + w / 2;
  const cy = y + h * 0.44;
  const color = SCIFI_COLOR[card.suit];
  ctx.save();
  glow(ctx, color, 14);
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';

  // Rotating-reticle backdrop.
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.arc(cx, cy, w * 0.42, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([6, 10]);
  ctx.beginPath();
  ctx.arc(cx, cy, w * 0.36, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  const s = w * 0.3;
  if (card.rank === 8) {
    // Pilot helmet with visor.
    ctx.beginPath();
    ctx.moveTo(cx - s, cy + s * 0.9);
    ctx.lineTo(cx - s, cy - s * 0.2);
    ctx.quadraticCurveTo(cx - s, cy - s * 1.1, cx, cy - s * 1.1);
    ctx.quadraticCurveTo(cx + s, cy - s * 1.1, cx + s, cy - s * 0.2);
    ctx.lineTo(cx + s, cy + s * 0.9);
    ctx.lineTo(cx + s * 0.5, cy + s * 1.1);
    ctx.lineTo(cx - s * 0.5, cy + s * 1.1);
    ctx.closePath();
    ctx.stroke();
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.8, cy - s * 0.25);
    ctx.lineTo(cx + s * 0.8, cy - s * 0.25);
    ctx.lineTo(cx + s * 0.6, cy + s * 0.25);
    ctx.lineTo(cx - s * 0.6, cy + s * 0.25);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 1.1);
    ctx.lineTo(cx, cy - s * 0.5);
    ctx.moveTo(cx - s * 0.4, cy + s * 0.65);
    ctx.lineTo(cx + s * 0.4, cy + s * 0.65);
    ctx.stroke();
  } else if (card.rank === 9) {
    // Starfighter (the mech-steed).
    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 1.25);
    ctx.lineTo(cx + s * 0.25, cy - s * 0.2);
    ctx.lineTo(cx + s * 1.1, cy + s * 0.5);
    ctx.lineTo(cx + s * 1.1, cy + s * 0.8);
    ctx.lineTo(cx + s * 0.3, cy + s * 0.6);
    ctx.lineTo(cx + s * 0.2, cy + s * 1.0);
    ctx.lineTo(cx - s * 0.2, cy + s * 1.0);
    ctx.lineTo(cx - s * 0.3, cy + s * 0.6);
    ctx.lineTo(cx - s * 1.1, cy + s * 0.8);
    ctx.lineTo(cx - s * 1.1, cy + s * 0.5);
    ctx.lineTo(cx - s * 0.25, cy - s * 0.2);
    ctx.closePath();
    ctx.globalAlpha = 0.2;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx, cy - s * 0.25, s * 0.12, s * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx - s * 0.12, cy + s * 1.15, s * 0.08, 0, Math.PI * 2);
    ctx.arc(cx + s * 0.12, cy + s * 1.15, s * 0.08, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Admiral insignia: star over three chevrons.
    const star = (r) => {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? r * 0.42 : r;
        ctx.lineTo(cx + Math.cos(a) * rr, cy - s * 0.55 + Math.sin(a) * rr);
      }
      ctx.closePath();
    };
    star(s * 0.55);
    ctx.globalAlpha = 0.35;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.stroke();
    for (let i = 0; i < 3; i++) {
      const yy = cy + s * 0.25 + i * s * 0.32;
      ctx.beginPath();
      ctx.moveTo(cx - s, yy - s * 0.25);
      ctx.lineTo(cx, yy + s * 0.05);
      ctx.lineTo(cx + s, yy - s * 0.25);
      ctx.stroke();
    }
  }
  ctx.restore();

  // Suit glyph badge.
  ctx.save();
  ctx.translate(cx, y + h * 0.93);
  if (LONG_SUITS.has(card.suit)) ctx.rotate(Math.PI / 2);
  drawPip(ctx, 'scifi', card.suit, LONG_SUITS.has(card.suit) ? w * 0.62 : w * 0.3);
  ctx.restore();
}

// ---------------------------------------------------------------------- faces
function classicFace(card) {
  const c = canvas();
  const ctx = c.getContext('2d');
  // Paper.
  const paper = ctx.createRadialGradient(CARD_W / 2, CARD_H / 2, 40, CARD_W / 2, CARD_H / 2, CARD_H * 0.7);
  paper.addColorStop(0, '#fbf5e6');
  paper.addColorStop(1, '#eadcb8');
  ctx.fillStyle = paper;
  roundRect(ctx, 0, 0, CARD_W, CARD_H, R);
  ctx.fill();
  speckle(ctx, 900, 'rgba(120,90,40,0.10)', card.rank * 31 + card.suit.length);
  // Double frame.
  ctx.strokeStyle = '#8a2a1c';
  ctx.lineWidth = 3;
  roundRect(ctx, 12, 12, CARD_W - 24, CARD_H - 24, R - 8);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  roundRect(ctx, 19, 19, CARD_W - 38, CARD_H - 38, R - 12);
  ctx.stroke();

  // Corner indices.
  const label = String(card.rank);
  ctx.fillStyle = card.suit === 'denari' || card.suit === 'coppe' ? '#8a2a1c' : '#1d2a3a';
  ctx.font = `700 46px ${FONT.classic}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const flip of [false, true]) {
    ctx.save();
    if (flip) {
      ctx.translate(CARD_W, CARD_H);
      ctx.rotate(Math.PI);
    }
    ctx.fillText(label, 46, 56);
    ctx.translate(46, 104);
    drawPip(ctx, 'classic', card.suit, LONG_SUITS.has(card.suit) ? 48 : 28);
    ctx.restore();
  }

  const area = { x: 84, y: 40, w: CARD_W - 168, h: CARD_H - 80 };
  if (card.rank >= 8) {
    const fig = { x: 76, y: 50, w: CARD_W - 152, h: CARD_H - 140 };
    classicFigure(ctx, card, fig);
    // Name banner.
    ctx.fillStyle = '#f7f1e2';
    ctx.strokeStyle = '#5a3510';
    ctx.lineWidth = 2;
    ctx.fillRect(fig.x - 6, fig.y + fig.h + 8, fig.w + 12, 52);
    ctx.strokeRect(fig.x - 6, fig.y + fig.h + 8, fig.w + 12, 52);
    ctx.fillStyle = '#5a3510';
    ctx.font = `700 30px ${FONT.classic}`;
    ctx.fillText(RANK_NAMES[card.rank].toUpperCase(), CARD_W / 2, fig.y + fig.h + 36);
  } else {
    drawPips(ctx, 'classic', card, area);
  }
  return c;
}

function scifiFace(card) {
  const c = canvas();
  const ctx = c.getContext('2d');
  const color = SCIFI_COLOR[card.suit];
  const bg = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
  bg.addColorStop(0, '#0b1426');
  bg.addColorStop(1, '#04070f');
  ctx.fillStyle = bg;
  roundRect(ctx, 0, 0, CARD_W, CARD_H, R);
  ctx.fill();

  // Hex grid texture.
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.07;
  ctx.lineWidth = 1;
  const hs = 18;
  for (let row = 0; row * hs * 1.5 < CARD_H + hs; row++) {
    for (let col = 0; col * hs * 1.732 < CARD_W + hs; col++) {
      const hx = col * hs * 1.732 + (row % 2 ? hs * 0.866 : 0);
      const hy = row * hs * 1.5;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3 + Math.PI / 6;
        ctx.lineTo(hx + Math.cos(a) * hs, hy + Math.sin(a) * hs);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.restore();

  // Neon frame with corner brackets.
  ctx.save();
  glow(ctx, color, 16);
  ctx.lineWidth = 3;
  chamfer(ctx, 14, 14, CARD_W - 28, CARD_H - 28, 22);
  ctx.stroke();
  ctx.lineWidth = 6;
  const b = 34;
  for (const [px, py, dx, dy] of [[14, 60, 1, 1], [CARD_W - 14, 60, -1, 1], [14, CARD_H - 60, 1, -1], [CARD_W - 14, CARD_H - 60, -1, -1]]) {
    ctx.beginPath();
    ctx.moveTo(px, py + dy * b * 0.6);
    ctx.lineTo(px, py);
    ctx.lineTo(px + dx * 8, py - dy * 8);
    ctx.stroke();
  }
  ctx.restore();

  // Index: rank glyph, suit name, point value.
  const label = card.rank === 1 ? 'A' : card.rank >= 8 ? SCIFI_RANK[card.rank].slice(0, 3) : String(card.rank);
  ctx.save();
  glow(ctx, color, 10);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${label.length > 1 ? 26 : 50}px ${FONT.scifi}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(label, 54, 66);
  ctx.save();
  ctx.translate(CARD_W, CARD_H);
  ctx.rotate(Math.PI);
  ctx.fillText(label, 54, 66);
  ctx.restore();
  ctx.font = `600 22px ${FONT.scifi}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'right';
  ctx.fillText(SCIFI_RANK[card.rank], CARD_W - 34, 48);
  ctx.fillText(SUIT_LABEL.scifi[card.suit].toUpperCase(), CARD_W - 34, 74);
  const pts = points(card);
  if (pts) {
    ctx.textAlign = 'center';
    ctx.font = `700 22px ${FONT.scifi}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`+${pts}`, CARD_W / 2, CARD_H - 48);
    ctx.globalAlpha = 0.85;
    const bars = Math.ceil(pts / 2);
    for (let i = 0; i < bars; i++) ctx.fillRect(CARD_W / 2 - (bars * 12) / 2 + i * 12 + 2, CARD_H - 30, 8, 5);
  }
  ctx.restore();

  const area = { x: 80, y: 104, w: CARD_W - 160, h: CARD_H - 208 };
  if (card.rank >= 8) scifiFigure(ctx, card, area);
  else drawPips(ctx, 'scifi', card, area);
  return c;
}

function classicBack() {
  const c = canvas();
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f3ead2';
  roundRect(ctx, 0, 0, CARD_W, CARD_H, R);
  ctx.fill();
  ctx.save();
  roundRect(ctx, 16, 16, CARD_W - 32, CARD_H - 32, R - 10);
  ctx.clip();
  ctx.fillStyle = '#8f1f1a';
  ctx.fillRect(0, 0, CARD_W, CARD_H);
  // Diamond lattice.
  ctx.strokeStyle = 'rgba(240,200,110,0.55)';
  ctx.lineWidth = 2;
  for (let i = -CARD_H; i < CARD_W + CARD_H; i += 28) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + CARD_H, CARD_H);
    ctx.moveTo(i, 0);
    ctx.lineTo(i - CARD_H, CARD_H);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(240,200,110,0.8)';
  for (let yy = 0; yy < CARD_H; yy += 28) {
    for (let xx = (yy / 28) % 2 ? 14 : 0; xx < CARD_W; xx += 28) {
      ctx.beginPath();
      ctx.arc(xx, yy, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
  ctx.strokeStyle = '#e2b33c';
  ctx.lineWidth = 4;
  roundRect(ctx, 16, 16, CARD_W - 32, CARD_H - 32, R - 10);
  ctx.stroke();
  // Medallion.
  ctx.save();
  ctx.translate(CARD_W / 2, CARD_H / 2);
  ctx.fillStyle = '#f3ead2';
  ctx.strokeStyle = '#e2b33c';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.ellipse(0, 0, 92, 128, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#8f1f1a';
  ctx.beginPath();
  ctx.ellipse(0, 0, 80, 116, 0, 0, Math.PI * 2);
  ctx.stroke();
  coin(ctx, 52);
  ctx.restore();
  return c;
}

function scifiBack() {
  const c = canvas();
  const ctx = c.getContext('2d');
  const bg = ctx.createRadialGradient(CARD_W / 2, CARD_H / 2, 10, CARD_W / 2, CARD_H / 2, CARD_H * 0.6);
  bg.addColorStop(0, '#13203f');
  bg.addColorStop(1, '#03060d');
  ctx.fillStyle = bg;
  roundRect(ctx, 0, 0, CARD_W, CARD_H, R);
  ctx.fill();
  // Circuit traces.
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  ctx.save();
  glow(ctx, '#38e8ff', 6);
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 2;
  for (let i = 0; i < 26; i++) {
    let px = 30 + rnd() * (CARD_W - 60);
    let py = 30 + rnd() * (CARD_H - 60);
    ctx.beginPath();
    ctx.moveTo(px, py);
    for (let k = 0; k < 3; k++) {
      if (rnd() < 0.5) px += (rnd() - 0.5) * 120;
      else py += (rnd() - 0.5) * 120;
      px = Math.max(30, Math.min(CARD_W - 30, px));
      py = Math.max(30, Math.min(CARD_H - 30, py));
      ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px, py, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // Frame and emblem.
  ctx.save();
  glow(ctx, '#38e8ff', 18);
  ctx.lineWidth = 3;
  chamfer(ctx, 14, 14, CARD_W - 28, CARD_H - 28, 22);
  ctx.stroke();
  ctx.translate(CARD_W / 2, CARD_H / 2);
  ctx.fillStyle = '#04070f';
  ctx.beginPath();
  ctx.arc(0, 0, 84, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#38e8ff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, 84, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.arc(0, 0, 68, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = `800 64px ${FONT.scifi}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('B', 0, 4);
  ctx.restore();
  return c;
}

export function drawFace(card, theme) {
  return theme === 'scifi' ? scifiFace(card) : classicFace(card);
}

export function drawBack(theme) {
  return theme === 'scifi' ? scifiBack() : classicBack();
}

// Small suit icon for the HUD (data URL).
export function suitIcon(suit, theme, size = 64) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  ctx.translate(size / 2, size / 2);
  const long = LONG_SUITS.has(suit);
  if (long) ctx.rotate(Math.PI / 4);
  drawPip(ctx, theme, suit, long ? size * 1.15 : suit === 'denari' ? size * 1.9 : size * 0.85);
  return c.toDataURL();
}
