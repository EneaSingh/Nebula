// KILL SWITCH — globe texture baking (procedural, no external assets).
// Everything is equirectangular with row 0 = north pole (lat +90), col 0 = lon -180.

/** Unwrap a ring's longitudes so consecutive points never jump by > 180 degrees. */
function unwrapRing(ring) {
  const out = new Array(ring.length);
  let prev = ring[0][0];
  let acc = prev;
  out[0] = [acc, ring[0][1], ring[0][0]];
  for (let k = 1; k < ring.length; k++) {
    let d = ring[k][0] - prev;
    if (d > 180) d -= 360;
    else if (d < -180) d += 360;
    acc += d;
    prev = ring[k][0];
    out[k] = [acc, ring[k][1], ring[k][0]]; // [unwrappedLon, lat, originalLon]
  }
  return out;
}

/**
 * Prepare per-country ring data: unwrapped rings for stroking, fill rings
 * (pole-encircling rings closed over the pole) and a lon/lat bounding box.
 */
export function prepareGeo(geo) {
  return geo.map((c) => {
    const polys = [];
    let lonMin = Infinity, lonMax = -Infinity, latMin = Infinity, latMax = -Infinity;
    for (const poly of c.polygons) {
      const fill = [];
      const stroke = [];
      for (const ring of poly) {
        if (!ring || ring.length < 3) continue;
        const u = unwrapRing(ring);
        stroke.push(u);
        let f = u.map((p) => [p[0], p[1]]);
        const net = u[u.length - 1][0] - u[0][0];
        if (Math.abs(net) > 180) {
          let latSum = 0;
          for (const p of u) latSum += p[1];
          const pole = latSum / u.length < 0 ? -90 : 90;
          f = f.concat([[u[u.length - 1][0], pole], [u[0][0], pole]]);
        }
        for (const p of f) {
          if (p[0] < lonMin) lonMin = p[0];
          if (p[0] > lonMax) lonMax = p[0];
          if (p[1] < latMin) latMin = p[1];
          if (p[1] > latMax) latMax = p[1];
        }
        fill.push(f);
      }
      polys.push({ fill, stroke });
    }
    return { polys, bbox: [lonMin, lonMax, latMin, latMax] };
  });
}

/** Even-odd scanline fill of a polygon (array of rings in pixel coords) into buf, wrapping x. */
function fillPolygon(buf, W, H, rings, value) {
  const edges = [];
  let yMin = Infinity, yMax = -Infinity;
  for (const r of rings) {
    for (let k = 0; k < r.length; k++) {
      const a = r[k];
      const b = r[(k + 1) % r.length];
      if (a[1] === b[1]) continue;
      edges.push(a[0], a[1], b[0], b[1]);
      if (a[1] < yMin) yMin = a[1];
      if (a[1] > yMax) yMax = a[1];
      if (b[1] < yMin) yMin = b[1];
      if (b[1] > yMax) yMax = b[1];
    }
  }
  const r0 = Math.max(0, Math.ceil(yMin - 0.5));
  const r1 = Math.min(H - 1, Math.floor(yMax - 0.5));
  const xs = [];
  for (let row = r0; row <= r1; row++) {
    const yc = row + 0.5;
    xs.length = 0;
    for (let e = 0; e < edges.length; e += 4) {
      const y0 = edges[e + 1], y1 = edges[e + 3];
      if ((yc >= y0 && yc < y1) || (yc >= y1 && yc < y0)) {
        const x0 = edges[e], x1 = edges[e + 2];
        xs.push(x0 + ((yc - y0) * (x1 - x0)) / (y1 - y0));
      }
    }
    xs.sort((p, q) => p - q);
    const base = row * W;
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.ceil(xs[k] - 0.5);
      const c1 = Math.floor(xs[k + 1] - 0.5);
      for (let c = c0; c <= c1; c++) buf[base + (((c % W) + W) % W)] = value;
    }
  }
}

/** Rasterize the country-id map: value = index + 1, ocean = 0. */
export function bakeIds(prepared, W, H) {
  const ids = new Uint8Array(W * H);
  const sx = W / 360, sy = H / 180;
  prepared.forEach((c, i) => {
    for (const poly of c.polys) {
      const rings = poly.fill.map((r) => r.map((p) => [(p[0] + 180) * sx, (90 - p[1]) * sy]));
      fillPolygon(ids, W, H, rings, i + 1);
    }
  });
  return ids;
}

function segKey(a, b) {
  const n = (p) => `${(p[2] === 180 ? -180 : p[2]).toFixed(2)},${p[1].toFixed(2)}`;
  const ka = n(a), kb = n(b);
  return ka < kb ? ka + '|' + kb : kb + '|' + ka;
}

function mulberry(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Low-res blurred land mask (for coastal glow + city placement). */
export function bakeGlow(ids, W, H, gw, gh) {
  const out = new Float32Array(gw * gh);
  const fx = W / gw, fy = H / gh;
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      // 2x2 supersample
      let s = 0;
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
        const px = Math.floor((x + 0.25 + i * 0.5) * fx);
        const py = Math.floor((y + 0.25 + j * 0.5) * fy);
        if (ids[py * W + px]) s += 0.25;
      }
      out[y * gw + x] = s;
    }
  }
  const tmp = new Float32Array(gw * gh);
  const R = Math.max(2, Math.round(gw / 220));
  for (let pass = 0; pass < 3; pass++) {
    // horizontal (wrap)
    for (let y = 0; y < gh; y++) {
      let acc = 0;
      for (let k = -R; k <= R; k++) acc += out[y * gw + ((k + gw) % gw)];
      for (let x = 0; x < gw; x++) {
        tmp[y * gw + x] = acc / (2 * R + 1);
        acc += out[y * gw + ((x + R + 1) % gw)] - out[y * gw + ((x - R + gw) % gw)];
      }
    }
    // vertical (clamp)
    for (let x = 0; x < gw; x++) {
      for (let y = 0; y < gh; y++) {
        let acc = 0;
        for (let k = -R; k <= R; k++) acc += tmp[Math.min(gh - 1, Math.max(0, y + k)) * gw + x];
        out[y * gw + x] = acc / (2 * R + 1);
      }
    }
  }
  const bytes = new Uint8Array(gw * gh);
  for (let k = 0; k < bytes.length; k++) bytes[k] = Math.min(255, Math.round(out[k] * 255));
  return { data: bytes, float: out };
}

/**
 * Detail canvas: R = internal borders, G = coastlines, B = city lights.
 */
export function bakeDetail(geo, prepared, ids, W, H, glow, gw, gh, opts = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'lighter';
  const sx = W / 360, sy = H / 180;

  // Classify edges: shared by two countries => internal border; else coastline.
  const counts = new Map();
  prepared.forEach((c) => {
    for (const poly of c.polys) for (const r of poly.stroke) {
      for (let k = 0; k + 1 < r.length; k++) {
        const key = segKey(r[k], r[k + 1]);
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
  });
  const internal = new Path2D();
  const coast = new Path2D();
  prepared.forEach((c) => {
    for (const poly of c.polys) for (const r of poly.stroke) {
      let minX = Infinity, maxX = -Infinity;
      for (const p of r) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); }
      const offsets = [0];
      if (minX < -180) offsets.push(360);
      if (maxX > 180) offsets.push(-360);
      for (let k = 0; k + 1 < r.length; k++) {
        const a = r[k], b = r[k + 1];
        const dLon = b[0] - a[0], dLat = b[1] - a[1];
        if (Math.abs(dLon) < 1e-6 && Math.abs(dLat) < 1e-6) continue;
        // Artificial cut along the antimeridian.
        if (Math.abs(Math.abs(a[2]) - 180) < 0.01 && Math.abs(Math.abs(b[2]) - 180) < 0.01 && Math.abs(dLon) < 0.01) continue;
        const shared = (counts.get(segKey(a, b)) || 0) > 1;
        const path = shared ? internal : coast;
        for (const off of offsets) {
          path.moveTo((a[0] + off + 180) * sx, (90 - a[1]) * sy);
          path.lineTo((b[0] + off + 180) * sx, (90 - b[1]) * sy);
        }
      }
    }
  });
  const lw = W / 4096;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgb(255,0,0)';
  ctx.lineWidth = 1.6 * lw;
  ctx.stroke(internal);
  ctx.strokeStyle = 'rgb(0,255,0)';
  ctx.lineWidth = 2.4 * lw;
  ctx.stroke(coast);

  // City lights: clustered dots, biased toward coasts and temperate latitudes.
  const rnd = mulberry(1337);
  const antarctica = geo.findIndex((c) => c.id === '010') + 1;
  const greenland = geo.findIndex((c) => c.id === '304') + 1;
  const metros = opts.metros || 900;
  const dotScale = Math.max(1, W / 4096);
  let placed = 0;
  for (let tries = 0; placed < metros && tries < metros * 60; tries++) {
    const lon = rnd() * 360 - 180;
    const lat = (Math.asin(rnd() * 2 - 1) * 180) / Math.PI;
    const px = Math.floor((lon + 180) * sx), py = Math.floor((90 - lat) * sy);
    const id = ids[py * W + px];
    if (!id || id === antarctica) continue;
    const g = glow[Math.floor(((90 - lat) / 180) * gh) * gw + Math.floor(((lon + 180) / 360) * gw)] || 0;
    const coastal = 1 - Math.abs(g - 0.55) * 1.6; // highest near coasts
    let p = 0.15 + 0.85 * Math.max(0, coastal);
    const al = Math.abs(lat);
    if (al > 58) p *= 0.25;
    if (al > 66) p *= 0.2;
    if (id === greenland) p *= 0.05;
    if (rnd() > p) continue;
    placed++;
    const size = 0.3 + rnd() * rnd() * 1.6; // metro size in degrees
    const n = 6 + Math.floor(size * 26);
    // core glow
    const grd = ctx.createRadialGradient(px, py, 0, px, py, size * sx * 0.9);
    grd.addColorStop(0, 'rgba(0,0,255,0.55)');
    grd.addColorStop(1, 'rgba(0,0,255,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(px - size * sx, py - size * sx, size * sx * 2, size * sx * 2);
    for (let k = 0; k < n; k++) {
      const r = size * Math.sqrt(-2 * Math.log(rnd() + 1e-6)) * 0.5;
      const a = rnd() * Math.PI * 2;
      const qlon = lon + (r * Math.cos(a)) / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
      const qlat = lat + r * Math.sin(a);
      const qx = (qlon + 180) * sx, qy = (90 - qlat) * sy;
      const qi = ids[Math.max(0, Math.min(H - 1, Math.floor(qy))) * W + ((Math.floor(qx) % W) + W) % W];
      if (!qi || qi === antarctica) continue;
      const b = 0.35 + rnd() * 0.65;
      ctx.fillStyle = `rgba(0,0,255,${b.toFixed(3)})`;
      const s = dotScale * (rnd() < 0.15 ? 2 : 1.2);
      ctx.fillRect(qx - s / 2, qy - s / 2, s, s);
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  return canvas;
}

/**
 * Tileable (periodic in both axes) multi-octave value noise, 4 independent channels.
 * R/G: fbm, B: ridged fbm (veins), A: fine fbm. Returns Uint8Array RGBA of size N*N.
 */
export function bakeNoise(N = 256) {
  const out = new Uint8Array(N * N * 4);
  const acc = new Float32Array(N * N * 4);
  const hash = (x, y, s) => {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const sm = (t) => t * t * (3 - 2 * t);
  for (let ch = 0; ch < 4; ch++) {
    let amp = 0.5, norm = 0;
    const base = ch === 3 ? 8 : 4;
    for (let o = 0; o < 5; o++) {
      const P = base << o;
      const seed = ch * 97 + o * 13 + 1;
      const cell = N / P;
      for (let y = 0; y < N; y++) {
        const fy = y / cell, iy = Math.floor(fy), ty = sm(fy - iy);
        const y0 = iy % P, y1 = (iy + 1) % P;
        for (let x = 0; x < N; x++) {
          const fx = x / cell, ix = Math.floor(fx), tx = sm(fx - ix);
          const x0 = ix % P, x1 = (ix + 1) % P;
          const a = hash(x0, y0, seed), b = hash(x1, y0, seed), c = hash(x0, y1, seed), d = hash(x1, y1, seed);
          let v = (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
          if (ch === 2) v = 1 - Math.abs(v * 2 - 1); // ridged
          acc[(y * N + x) * 4 + ch] += v * amp;
        }
      }
      norm += amp;
      amp *= 0.5;
    }
    for (let k = 0; k < N * N; k++) acc[k * 4 + ch] /= norm;
  }
  // Histogram-equalize each channel to a uniform 0..1 distribution, so a threshold of
  // (1 - f) covers ~f of the area (except B, which is only contrast-stretched).
  const BINS = 4096;
  for (let ch = 0; ch < 4; ch++) {
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < N * N; k++) { const v = acc[k * 4 + ch]; if (v < lo) lo = v; if (v > hi) hi = v; }
    const span = hi - lo || 1;
    if (ch === 2) {
      for (let k = 0; k < N * N; k++) out[k * 4 + ch] = Math.round(((acc[k * 4 + ch] - lo) / span) * 255);
      continue;
    }
    const hist = new Float64Array(BINS);
    for (let k = 0; k < N * N; k++) hist[Math.min(BINS - 1, Math.floor(((acc[k * 4 + ch] - lo) / span) * BINS))]++;
    let run = 0;
    for (let i = 0; i < BINS; i++) { run += hist[i]; hist[i] = run / (N * N); }
    for (let k = 0; k < N * N; k++) out[k * 4 + ch] = Math.round(hist[Math.min(BINS - 1, Math.floor(((acc[k * 4 + ch] - lo) / span) * BINS))] * 255);
  }
  return out;
}
