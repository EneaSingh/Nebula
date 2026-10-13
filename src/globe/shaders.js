// KILL SWITCH — GLSL for the globe. Colors authored in sRGB and converted with srgb().

const COMMON = /* glsl */ `
vec3 srgb(vec3 c) { return pow(c, vec3(2.2)); }
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 hash32(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}
// 3D value noise (cheap, smooth)
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i), n100 = hash13(i + vec3(1,0,0)), n010 = hash13(i + vec3(0,1,0)), n110 = hash13(i + vec3(1,1,0));
  float n001 = hash13(i + vec3(0,0,1)), n101 = hash13(i + vec3(1,0,1)), n011 = hash13(i + vec3(0,1,1)), n111 = hash13(i + vec3(1,1,1));
  return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y), mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
}
float fbm3(vec3 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s / 0.9375;
}
`;

export const earthVertex = /* glsl */ `
varying vec2 vUv;
varying vec3 vObj;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
void main() {
  vUv = uv;
  vObj = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const earthFragment = /* glsl */ `
uniform sampler2D uIds;
uniform vec2 uIdSize;
uniform sampler2D uState;
uniform sampler2D uDetail;
uniform sampler2D uGlow;
uniform sampler2D uNoise;
uniform float uTime;
uniform vec3 uLightDir;
uniform vec3 uAtmo;
uniform float uSel;
uniform float uHover;
uniform vec4 uSelBox;   // uMin, uMax, vMin, vMax in texture space (v = 0 at north)
uniform vec4 uHoverBox;
uniform vec2 uSelCenter; // lon, lat (radians)
uniform float uIntro;    // 0..1 fade-in of country state (0 in the menu)

varying vec2 vUv;
varying vec3 vObj;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;

${COMMON}

vec4 nz(vec2 p) { return texture2D(uNoise, p); }
// Triplanar noise on the unit sphere: isotropic and seam-free.
vec4 tri(vec3 p, float s, vec2 o) {
  vec3 w = pow(abs(p), vec3(8.0));
  w /= (w.x + w.y + w.z);
  return nz(p.yz * s + o) * w.x + nz(p.zx * s + o + 0.37) * w.y + nz(p.xy * s + o + 0.71) * w.z;
}
float idAt(vec2 tc) { return floor(texture2D(uIds, tc).r * 255.0 + 0.5); }
vec4 st0(float id) { return texture2D(uState, vec2((id + 0.5) / 256.0, 0.125)); }
vec4 st1(float id) { return texture2D(uState, vec2((id + 0.5) / 256.0, 0.375)); }
float anchorLon(float id) { return texture2D(uState, vec2((id + 0.5) / 256.0, 0.625)).r * 360.0 - 180.0; }

bool inBox(vec2 tc, vec4 box, vec2 m) {
  return tc.x >= box.x - m.x && tc.x <= box.y + m.x && tc.y >= box.z - m.y && tc.y <= box.w + m.y;
}

// Seamless (in longitude) grid coordinates: cells of size s degrees, longitude cell count
// quantised per latitude band so the pattern stays roughly square and wraps exactly.
vec2 bandGrid(vec2 ll, float s, float bandRows) {
  float y = (ll.y + 90.0) / s;
  float band = floor(y / bandRows);
  float latc = (band + 0.5) * bandRows * s - 90.0;
  float count = max(4.0, floor(360.0 * cos(radians(latc)) / s));
  return vec2((ll.x + 180.0) / 360.0 * count, y);
}

// Procedural circuit-board traces. Returns (trace, pad, pulse).
vec3 circuit(vec2 p, float t) {
  vec2 c = floor(p);
  vec2 f = fract(p) - 0.5;
  float r = hash12(c + vec2(0.5, 0.0));
  float l = hash12(c - vec2(0.5, 0.0));
  float u = hash12(c + vec2(0.0, 0.5));
  float d = hash12(c - vec2(0.0, 0.5));
  float th = 0.52;
  float dist = 10.0;
  float n = 0.0;
  if (r > th) { dist = min(dist, f.x >= 0.0 ? abs(f.y) : length(f)); n += 1.0; }
  if (l > th) { dist = min(dist, f.x <= 0.0 ? abs(f.y) : length(f)); n += 1.0; }
  if (u > th) { dist = min(dist, f.y >= 0.0 ? abs(f.x) : length(f)); n += 1.0; }
  if (d > th) { dist = min(dist, f.y <= 0.0 ? abs(f.x) : length(f)); n += 1.0; }
  float aa = max(fwidth(p.x), 0.02) * 1.2;
  float trace = 1.0 - smoothstep(0.07, 0.07 + aa, dist);
  vec3 h = hash32(c);
  float padOn = (n == 1.0 || h.x > 0.82) ? 1.0 : 0.0;
  float pr = length(f);
  float pad = padOn * (1.0 - smoothstep(0.17, 0.17 + aa, pr)) * smoothstep(0.06, 0.06 + aa, pr) + padOn * (1.0 - smoothstep(0.04, 0.04 + aa, pr));
  float flow = fract((c.x + f.x) * 0.11 + (c.y + f.y) * 0.07 - t * 0.35 + h.y * 0.3);
  float pulse = pow(flow, 18.0) * trace;
  return vec3(trace, pad, pulse);
}

void main() {
  vec2 tc = vec2(vUv.x, 1.0 - vUv.y);
  vec2 ll = vec2(vUv.x * 360.0 - 180.0, vUv.y * 180.0 - 90.0);
  vec2 texel = 1.0 / uIdSize;

  // ---- country lookup (bilinear-blended state for smooth borders) ----
  float idN = idAt(tc);
#ifdef LOW_QUALITY
  float land = step(0.5, idN);
  vec4 S0 = st0(idN);
  vec4 S1 = st1(idN);
  float selW = (uSel > 0.5 && abs(idN - uSel) < 0.5) ? 1.0 : 0.0;
  float hovW = (uHover > 0.5 && abs(idN - uHover) < 0.5) ? 1.0 : 0.0;
#else
  vec2 pp = tc * uIdSize - 0.5;
  vec2 fr = fract(pp);
  vec2 b = (floor(pp) + 0.5) * texel;
  float ia = idAt(b), ib = idAt(b + vec2(texel.x, 0.0)), ic = idAt(b + vec2(0.0, texel.y)), id4 = idAt(b + texel);
  float wa = (1.0 - fr.x) * (1.0 - fr.y), wb = fr.x * (1.0 - fr.y), wc = (1.0 - fr.x) * fr.y, wd = fr.x * fr.y;
  float land = wa * step(0.5, ia) + wb * step(0.5, ib) + wc * step(0.5, ic) + wd * step(0.5, id4);
  vec4 S0 = wa * st0(ia) + wb * st0(ib) + wc * st0(ic) + wd * st0(id4);
  vec4 S1 = wa * st1(ia) + wb * st1(ib) + wc * st1(ic) + wd * st1(id4);
  float selW = 0.0, hovW = 0.0;
  if (uSel > 0.5) selW = wa * step(abs(ia - uSel), 0.5) + wb * step(abs(ib - uSel), 0.5) + wc * step(abs(ic - uSel), 0.5) + wd * step(abs(id4 - uSel), 0.5);
  if (uHover > 0.5) hovW = wa * step(abs(ia - uHover), 0.5) + wb * step(abs(ib - uHover), 0.5) + wc * step(abs(ic - uHover), 0.5) + wd * step(abs(id4 - uHover), 0.5);
#endif
  float landInv = 1.0 / max(land, 0.001);
  S0 *= landInv; S1 *= landInv;
  S0 *= uIntro; S1.rg *= uIntro;
  float inf = S0.r, lost = S0.g, quar = S0.b, shut = S0.a;
  float lab = S1.r, ks = S1.g, ice = S1.b, flash = S1.a;
  float infV = inf * (1.0 - ks * 0.85);

  // ---- lighting ----
  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float ndl = dot(N, uLightDir);
  float day = smoothstep(-0.30, 0.40, ndl);
  float night = 1.0 - smoothstep(-0.35, 0.15, ndl);
  float light = mix(0.30, 1.0, day);
  float ndv = max(dot(N, V), 0.0);
  float fres = pow(1.0 - ndv, 3.0);

  vec4 det = texture2D(uDetail, tc);
  float glow = texture2D(uGlow, tc).r;
  vec2 gw = fwidth(ll);

  // ---- ocean ----
  vec3 ocean = srgb(vec3(0.010, 0.040, 0.075));
  ocean += srgb(vec3(0.02, 0.06, 0.10)) * nz(tc * vec2(4.0, 2.0) + vec2(uTime * 0.002, 0.0)).a;
  // lat/long grid every 15 degrees
  vec2 gd = abs(fract(ll / 15.0 + 0.5) - 0.5) * 15.0;
  float gridL = 1.0 - smoothstep(0.0, gw.x * 1.5, gd.x * cos(radians(ll.y)) / max(cos(radians(ll.y)), 0.15));
  float gridB = 1.0 - smoothstep(0.0, gw.y * 1.5, gd.y);
  float grid = max(gridL * smoothstep(88.0, 70.0, abs(ll.y)), gridB);
  ocean += srgb(vec3(0.10, 0.45, 0.60)) * grid * 0.22;
  // data-flow shimmer: dashes streaming along latitude lanes
  float lane = floor((ll.y + 90.0) / 0.9);
  float lh = hash12(vec2(lane, 7.0));
  float laneY = abs(fract((ll.y + 90.0) / 0.9) - 0.5);
  float laneOn = step(0.86, lh) * (1.0 - smoothstep(0.06, 0.06 + gw.y / 0.9 * 1.5, laneY));
  float dir = lh > 0.81 ? 1.0 : -1.0;
  float dash = fract((ll.x + 180.0) / 360.0 * (14.0 + floor(lh * 16.0)) + dir * uTime * (0.015 + 0.03 * fract(lh * 7.0)) + lh * 3.0);
  float stream = pow(dash, 22.0) * laneOn * (1.0 - smoothstep(0.25, 0.9, gw.y / 0.9));
  ocean += srgb(vec3(0.24, 0.88, 1.0)) * stream * 0.16;
  // coastal glow
  float coastGlow = smoothstep(0.0, 0.7, glow) * (1.0 - land);
  ocean += srgb(vec3(0.10, 0.55, 0.75)) * coastGlow * 0.18;
  ocean *= mix(0.55, 1.0, day);

  // ---- land base ----
  vec3 col = srgb(vec3(0.035, 0.16, 0.21));
  vec3 sp = normalize(vObj);
  float relief = tri(sp, 1.6, vec2(0.0)).g * 0.6 + tri(sp, 4.5, vec2(0.0)).a * 0.4;
  col *= 0.75 + 0.5 * relief;
  col = mix(col, srgb(vec3(0.16, 0.24, 0.30)), ice * 0.65);
  // dot matrix
  vec2 dp = bandGrid(ll, 0.75, 8.0);
  float dsz = fwidth(dp.y);
  float dots = (1.0 - smoothstep(0.16, 0.16 + dsz * 1.5, length(fract(dp) - 0.5))) * (1.0 - smoothstep(0.12, 0.5, dsz));
  vec3 dotC = mix(srgb(vec3(0.24, 0.88, 1.0)), srgb(vec3(1.0, 0.2, 0.4)), smoothstep(0.0, 0.25, infV));
  col += dotC * (dots * 0.10 + smoothstep(0.12, 0.5, dsz) * 0.012);
  col *= light;

  float tt = uTime;

  // ---- infection: hot corruption bleeding through ----
  vec3 emis = vec3(0.0);
  if (infV > 0.002) {
    float cn = mix(tri(sp, 1.3, vec2(tt * 0.0016, tt * 0.0011)).r, tri(sp, 3.2, -vec2(tt * 0.0021, 0.0)).g, 0.3);
    float thr = mix(0.92, 0.02, infV);
    float m = smoothstep(thr - 0.06, thr + 0.03, cn);
    float edge = 1.0 - smoothstep(0.0, 0.035, abs(cn - thr));
    float pulse = 0.5 + 0.5 * sin(tt * 2.6 - cn * 26.0);
    vec3 dark = srgb(vec3(0.30, 0.02, 0.07));
    vec3 hot = srgb(vec3(1.0, 0.176, 0.333));
    float heat = tri(sp, 2.4, vec2(-tt * 0.003, tt * 0.002)).a;
    col = mix(col * vec3(1.0, 0.45, 0.5), dark * (0.6 + 0.4 * light), min(1.0, infV * 0.8 + 0.2));
    vec3 corr = mix(srgb(vec3(0.40, 0.03, 0.10)), hot, 0.18 * pulse + 0.45 * heat * heat * heat);
    col = mix(col, corr * (0.6 + 0.4 * light), m);
    // veins of corrupted data
    float vein = smoothstep(0.86, 0.97, tri(sp, 5.0, vec2(0.0, tt * 0.001)).b);
    emis += hot * vein * m * (0.25 + 0.35 * pulse);
    // the dot matrix glitches hot inside corrupted areas
    float glitch = step(0.9, hash12(floor(dp) + floor(tt * 3.0)));
    emis += srgb(vec3(1.0, 0.3, 0.6)) * dots * m * (0.06 + 0.6 * glitch);
    emis += srgb(vec3(1.0, 0.24, 0.94)) * edge * (0.45 + 0.4 * pulse) * smoothstep(0.0, 0.08, infV);
  }

  // ---- lost / assimilated: the machine's circuitry ----
  if (lost > 0.002) {
    float ln = tri(sp, 1.2, vec2(0.31, 0.17)).r;
    float lthr = mix(0.94, 0.0, lost);
    float lm = smoothstep(lthr - 0.04, lthr + 0.04, ln);
    vec2 cp = bandGrid(ll, 0.55, 12.0);
    vec3 ci = circuit(cp, tt);
    vec3 ci2 = circuit(cp * 0.33 + 41.0, tt * 0.7);
    float cfade = 1.0 - smoothstep(0.15, 0.6, fwidth(cp.x));
    vec3 voidC = srgb(vec3(0.04, 0.012, 0.08));
    vec3 traceC = srgb(vec3(0.48, 0.17, 1.0));
    vec3 pulseC = srgb(vec3(1.0, 0.24, 0.94));
    vec3 lc = voidC * (0.7 + 0.3 * light);
    float tr = max(ci.x * 0.55 + ci.y, ci2.x * 0.8 + ci2.y) * cfade;
    lc += traceC * tr * 0.42;
    lc += traceC * 0.10 * (1.0 - cfade);
    vec3 le = pulseC * (ci.z + ci2.z) * cfade * 1.4 + traceC * tr * 0.18;
    float lEdge = 1.0 - smoothstep(0.0, 0.03, abs(ln - lthr));
    col = mix(col, lc, lm);
    emis = mix(emis, le, lm) + traceC * lEdge * 0.5;
  }

  // ---- shutdown: grid down, flickering dark ----
  float flick = 0.75 + 0.25 * step(0.85, hash12(vec2(floor(tt * 9.0), 3.0)));
  col *= 1.0 - shut * (0.62 - 0.12 * flick);
  emis *= 1.0 - shut * 0.5;

  // ---- quarantine: cyan hatching + sweeping scanline ----
  if (quar > 0.01) {
    // local equal-area-ish coords around the country's anchor meridian (seam lies outside it)
    float dlon = mod(ll.x - anchorLon(idN) + 540.0, 360.0) - 180.0;
    vec2 hp = vec2(dlon * cos(radians(ll.y)), ll.y) / 0.35;
    float hfade = 1.0 - smoothstep(0.25, 0.7, fwidth(hp.y));
    float hs = fract((hp.x + hp.y) * 0.5);
    float aa = fwidth(hp.y) * 0.7 + 0.02;
    float hatch = smoothstep(0.5 - aa, 0.5, hs) - smoothstep(0.78, 0.78 + aa, hs);
    float scan = pow(fract(ll.y * 0.08 - tt * 0.25), 24.0);
    vec3 cy = srgb(vec3(0.24, 0.88, 1.0));
    emis += cy * quar * (hatch * hfade * 0.22 + (1.0 - hfade) * 0.06 + scan * 0.35);
    col = mix(col, col * 0.8 + cy * 0.03, quar);
  }

  // ---- kill switch / liberated: green wash ----
  if (ks > 0.01) {
    vec3 gr = srgb(vec3(0.24, 1.0, 0.60));
    float wave = 0.5 + 0.5 * sin(tt * 1.6 - length(vObj.xy) * 6.0 + vObj.z * 6.0);
    col = mix(col, srgb(vec3(0.03, 0.30, 0.16)) * (0.6 + 0.4 * light), ks * 0.75);
    emis += gr * ks * (0.05 + 0.08 * wave);
  }

  // flash on state change
  emis += srgb(vec3(1.0, 0.6, 0.8)) * flash * 0.35;

  // ---- borders & coasts ----
  vec3 cyan = srgb(vec3(0.24, 0.88, 1.0));
  vec3 bc = mix(cyan, srgb(vec3(1.0, 0.24, 0.6)), clamp(max(infV * 1.4, lost), 0.0, 1.0));
  bc = mix(bc, srgb(vec3(0.24, 1.0, 0.6)), ks);
  float borderI = det.r * 0.35 + det.g * 0.85;
  vec3 borderC = bc * borderI * mix(0.55, 1.0, day) * (1.0 - shut * 0.5);

  // ---- city lights (night side) ----
  float lights = det.b;
  vec3 lightC = mix(srgb(vec3(1.0, 0.86, 0.62)), srgb(vec3(1.0, 0.18, 0.4)), clamp(lost * 1.5 + infV * 0.6, 0.0, 1.0));
  float lflick = 1.0 - infV * 0.5 * step(0.5, hash12(vec2(floor(tt * 6.0), floor(ll.x * 2.0))));
  vec3 cityC = lightC * lights * night * (1.0 - shut) * lflick * 0.9 * (1.0 - ice);

  // ---- hover / selection ----
  col *= 1.0 + hovW * 0.45 + selW * 0.25;
  emis += cyan * hovW * 0.04;
  float outline = 0.0, hovLine = 0.0;
#ifndef LOW_QUALITY
  vec2 px = fwidth(tc);
  vec2 margin = px * 8.0;
  bool doSel = uSel > 0.5 && inBox(tc, uSelBox, margin);
  bool doHov = uHover > 0.5 && uHover != uSel && inBox(tc, uHoverBox, margin);
  if (doSel || doHov) {
    float ms = 0.0, mh = 0.0;
    for (int k = 0; k < 12; k++) {
      float a = float(k) * 0.5236 + 0.26;
      float rad = mod(float(k), 2.0) < 0.5 ? 2.5 : 5.0;
      float tid = idAt(tc + vec2(cos(a), sin(a)) * px * rad);
      ms += step(abs(tid - uSel), 0.5);
      mh += step(abs(tid - uHover), 0.5);
    }
    ms /= 12.0; mh /= 12.0;
    if (doSel) outline = 1.0 - abs(2.0 * ms - 1.0);
    if (doHov) hovLine = 1.0 - abs(2.0 * mh - 1.0);
  }
#else
  outline = selW * (1.0 - selW) * 4.0;
  hovLine = hovW * (1.0 - hovW) * 4.0;
#endif
  vec3 selC = vec3(1.0);
  if (outline > 0.0) {
    vec3 p = normalize(vObj);
    vec3 cdir = vec3(cos(uSelCenter.y) * cos(uSelCenter.x), sin(uSelCenter.y), -cos(uSelCenter.y) * sin(uSelCenter.x));
    vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), cdir) + vec3(1e-5));
    vec3 north = cross(cdir, east);
    float ang = atan(dot(p, north), dot(p, east));
    float march = 0.55 + 0.45 * step(0.5, fract(ang * 9.0 / 6.2832 - tt * 0.6));
    selC = mix(cyan, vec3(1.0), 0.55) * outline * march * (0.85 + 0.15 * sin(tt * 4.0)) * 1.3;
  } else selC = vec3(0.0);

  // ---- compose ----
  vec3 landCol = col + emis + borderC + cityC;
  vec3 c = mix(ocean, landCol, land);
  c += borderC * (1.0 - land) * 0.8; // coast strokes extend over water
  c += selC + cyan * hovLine * 0.45;
  c += uAtmo * fres * (0.3 + 0.7 * day) * 0.45;

  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const atmoVertex = /* glsl */ `
varying vec3 vN;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
void main() {
  vN = normalize(normalMatrix * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const atmoFragment = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uLightDir;
uniform float uEdge;
varying vec3 vN;
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
void main() {
  vec3 V = normalize(cameraPosition - vWorldPos);
  float d = -dot(normalize(vWorldNormal), V); // back faces: 0 at shell rim -> uEdge at globe limb
  float g = clamp(d / uEdge, 0.0, 1.0);
  float a = pow(g, 5.0);
  float lit = 0.45 + 0.55 * smoothstep(-0.6, 0.6, dot(normalize(vWorldNormal), uLightDir) * -1.0 + 0.2);
  gl_FragColor = vec4(uColor * a * lit * 0.75, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const starsVertex = /* glsl */ `
attribute float aSize;
attribute float aPhase;
attribute vec3 aColor;
uniform float uTime;
uniform float uPixelRatio;
varying vec3 vColor;
varying float vTw;
void main() {
  vColor = aColor;
  vTw = 0.65 + 0.35 * sin(uTime * (0.6 + aPhase * 1.7) + aPhase * 40.0);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uPixelRatio;
}
`;

export const starsFragment = /* glsl */ `
varying vec3 vColor;
varying float vTw;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d);
  float a = smoothstep(0.5, 0.0, r);
  a = a * a;
  gl_FragColor = vec4(vColor * a * vTw, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const skyVertex = /* glsl */ `
varying vec3 vCol;
${COMMON}
void main() {
  vec3 d = normalize(position);
  float n1 = fbm3(d * 2.2 + vec3(3.0, 1.0, 0.0));
  float n2 = fbm3(d * 3.7 + vec3(-7.0, 2.0, 5.0));
  vec3 c = srgb(vec3(0.006, 0.010, 0.022));
  c += srgb(vec3(0.10, 0.04, 0.18)) * smoothstep(0.50, 0.80, n1) * 0.35;
  c += srgb(vec3(0.02, 0.12, 0.18)) * smoothstep(0.52, 0.82, n2) * 0.30;
  vCol = c;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const skyFragment = /* glsl */ `
varying vec3 vCol;
void main() {
  gl_FragColor = vec4(vCol, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const arcVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const arcFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uHead;    // 0..1+ draw-in progress
uniform float uFade;    // 0..1 overall alpha
uniform float uTime;
uniform float uDashed;
varying vec2 vUv;
void main() {
  float t = vUv.x;
  if (t > uHead) discard;
  float behind = uHead - t;
  float trail = 0.35 + 0.65 * exp(-behind * 4.0);
  float head = exp(-behind * 60.0) * step(uHead, 1.0001) * 2.5;
  float packets = pow(fract(t * 3.0 - uTime * 0.9), 10.0) * 1.6;
  float dash = mix(1.0, step(0.45, fract(t * 48.0 - uTime * 2.0)), uDashed);
  float ends = smoothstep(0.0, 0.03, t);
  float i = (trail * dash + head + packets) * uFade * ends;
  gl_FragColor = vec4(uColor * i, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
