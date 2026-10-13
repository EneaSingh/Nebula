// Small DOM + formatting helpers shared by the UI modules.

/** Create an element. attrs: class, text, html, dataset {}, style {}, on* handlers, other attributes. */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Set textContent only when it changed (cheap to call 8x/sec). */
export function setText(el, text) {
  const s = String(text);
  if (el.textContent !== s) el.textContent = s;
}

export function setWidth(el, frac) {
  const v = `${(clamp01(frac) * 100).toFixed(2)}%`;
  if (el.style.width !== v) el.style.width = v;
}

export function toggleClass(el, cls, on) {
  if (el.classList.contains(cls) !== !!on) el.classList.toggle(cls, !!on);
}

export const clamp01 = (x) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

/** 1.2B, 340M, 12.5K, 950 */
export function fmtNum(n) {
  if (!Number.isFinite(n)) return '0';
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  const unit = (v, s) => {
    const d = v >= 100 ? 0 : v >= 10 ? 1 : 2;
    return sign + trim(v.toFixed(d)) + s;
  };
  if (a >= 1e12) return unit(a / 1e12, 'T');
  if (a >= 1e9) return unit(a / 1e9, 'B');
  if (a >= 1e6) return unit(a / 1e6, 'M');
  if (a >= 1e4) return unit(a / 1e3, 'K');
  return sign + Math.round(a).toLocaleString('en-US');
}
function trim(s) {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

/** 0..1 -> "64%" (or with decimals) */
export function fmtPct(x, digits = 0) {
  const v = (Number.isFinite(x) ? x : 0) * 100;
  return `${v.toFixed(digits)}%`;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
export function fmtDate(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '--';
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function pad3(n) {
  return String(Math.max(0, Math.floor(n || 0))).padStart(3, '0');
}

/** localStorage that never throws. */
export const store = {
  get(key, fallback = null) {
    try {
      const v = window.localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable: ignore */
    }
  },
};

export const reducedMotion = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

export const isPhone = () => {
  try {
    return window.matchMedia('(max-width: 760px)').matches;
  } catch {
    return false;
  }
};

export function camelToWords(k) {
  return k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

/** Status labels used in pills/tooltips. Undetected countries never reveal ground truth. */
export const STATUS_LABEL = {
  clean: 'Clean',
  infected: 'Infected',
  overrun: 'Overrun',
  fallen: 'Fallen',
  liberated: 'Liberated',
  unknown: 'No known AI activity',
};

/** The status the player is allowed to see for a country. */
export function visibleStatus(c) {
  if (!c || !c.playable) return 'none';
  if (!c.detected) return 'unknown';
  return c.status || 'infected';
}

/** Phone bottom sheets: drag the grip/header down to dismiss. */
export function enableSheetSwipe(sheet, handles, onClose) {
  let y0 = null;
  let dy = 0;
  const down = (e) => {
    if (!isPhone() || e.target.closest('button')) return;
    y0 = e.clientY;
    dy = 0;
    sheet.style.transition = 'none';
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const move = (e) => {
    if (y0 == null) return;
    dy = Math.max(0, e.clientY - y0);
    sheet.style.transform = `translateY(${dy}px)`;
  };
  const up = () => {
    if (y0 == null) return;
    y0 = null;
    sheet.style.transition = '';
    sheet.style.transform = '';
    if (dy > 70) onClose();
  };
  for (const hd of handles) {
    hd.style.touchAction = 'none';
    hd.addEventListener('pointerdown', down);
    hd.addEventListener('pointermove', move);
    hd.addEventListener('pointerup', up);
    hd.addEventListener('pointercancel', up);
  }
}
