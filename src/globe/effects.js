// KILL SWITCH — globe effects: transmission arcs, pickup bubbles, bursts, lab markers.
import * as THREE from 'three';
import { arcVertex, arcFragment } from './shaders.js';

export function lonLatToVec3(lon, lat, r = 1, out = new THREE.Vector3()) {
  const lo = (lon * Math.PI) / 180, la = (lat * Math.PI) / 180;
  return out.set(Math.cos(la) * Math.cos(lo) * r, Math.sin(la) * r, -Math.cos(la) * Math.sin(lo) * r);
}

export function vec3ToLonLat(v) {
  const r = v.length();
  return [(Math.atan2(-v.z, v.x) * 180) / Math.PI, (Math.asin(THREE.MathUtils.clamp(v.y / r, -1, 1)) * 180) / Math.PI];
}

const ROUTES = {
  cable: { color: '#ff2d55', lift: (ang) => 0.035 + 0.16 * (ang / Math.PI), radius: 0.0032, dashed: 0, speed: 0.9 },
  satellite: { color: '#ff3df0', lift: (ang) => 0.22 + 0.22 * (ang / Math.PI), radius: 0.0026, dashed: 1, speed: 0.7 },
  wireless: { color: '#ff7a3d', lift: (ang) => 0.012 + 0.09 * (ang / Math.PI), radius: 0.0036, dashed: 0, speed: 1.4 },
};

class ArcCurve extends THREE.Curve {
  constructor(a, b, lift) {
    super();
    this.a = a.clone().normalize();
    this.b = b.clone().normalize();
    this.ang = Math.acos(THREE.MathUtils.clamp(this.a.dot(this.b), -1, 1));
    this.lift = lift;
    this.sin = Math.sin(this.ang) || 1e-6;
  }
  getPoint(t, out = new THREE.Vector3()) {
    const s = this.sin;
    const wa = Math.sin((1 - t) * this.ang) / s, wb = Math.sin(t * this.ang) / s;
    out.copy(this.a).multiplyScalar(wa).addScaledVector(this.b, wb).normalize();
    return out.multiplyScalar(1.002 + this.lift * Math.sin(Math.PI * t));
  }
}

function makeRingTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 30, 64, 64, 62);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.75, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.85, 'rgba(255,255,255,1)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeFlareTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------------------
// Ground rings (impact / pulse markers lying on the surface)
// ---------------------------------------------------------------------------
export class SurfaceFx {
  constructor(parent) {
    this.group = new THREE.Group();
    parent.add(this.group);
    this.ringTex = makeRingTexture();
    this.flareTex = makeFlareTexture();
    this.geo = new THREE.PlaneGeometry(1, 1);
    this.items = [];
  }
  ring(dir, color, { size = 0.08, life = 1.0, alt = 1.003, grow = 1 } = {}) {
    const mat = new THREE.MeshBasicMaterial({
      map: this.ringTex, color: new THREE.Color(color), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(this.geo, mat);
    m.position.copy(dir).normalize().multiplyScalar(alt);
    m.lookAt(m.position.clone().multiplyScalar(2));
    m.renderOrder = 3;
    this.group.add(m);
    this.items.push({ m, age: 0, life, size, grow });
  }
  flare(pos, color, { size = 0.06, life = 0.6 } = {}) {
    const mat = new THREE.SpriteMaterial({
      map: this.flareTex, color: new THREE.Color(color), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const s = new THREE.Sprite(mat);
    s.position.copy(pos);
    s.renderOrder = 4;
    this.group.add(s);
    this.items.push({ m: s, age: 0, life, size, grow: 0.6, flare: true });
  }
  update(dt) {
    for (let k = this.items.length - 1; k >= 0; k--) {
      const it = this.items[k];
      it.age += dt;
      const p = it.age / it.life;
      if (p >= 1) {
        this.group.remove(it.m);
        it.m.material.dispose();
        this.items.splice(k, 1);
        continue;
      }
      const e = 1 - Math.pow(1 - p, 3);
      const s = it.size * (it.flare ? 1 + e * it.grow : 0.15 + e * it.grow);
      it.m.scale.set(s, s, s);
      it.m.material.opacity = it.flare ? (1 - p) * (1 - p) : (1 - p);
    }
  }
  clear() {
    for (const it of this.items) { this.group.remove(it.m); it.m.material.dispose(); }
    this.items.length = 0;
  }
  dispose() {
    this.clear();
    this.geo.dispose();
    this.ringTex.dispose();
    this.flareTex.dispose();
  }
}

// ---------------------------------------------------------------------------
// Transmission arcs
// ---------------------------------------------------------------------------
export class Arcs {
  constructor(parent, surfaceFx, { max = 48, reducedMotion = false } = {}) {
    this.group = new THREE.Group();
    parent.add(this.group);
    this.fx = surfaceFx;
    this.max = max;
    this.reduced = reducedMotion;
    this.items = [];
  }
  add(a, b, route) {
    const cfg = ROUTES[route] || ROUTES.cable;
    const curve = new ArcCurve(a, b, cfg.lift(Math.acos(THREE.MathUtils.clamp(a.clone().normalize().dot(b.clone().normalize()), -1, 1))));
    if (curve.ang < 1e-3) return;
    const segs = Math.max(16, Math.round(24 + curve.ang * 40));
    const geom = new THREE.TubeGeometry(curve, segs, cfg.radius, 5, false);
    const mat = new THREE.ShaderMaterial({
      vertexShader: arcVertex,
      fragmentShader: arcFragment,
      uniforms: {
        uColor: { value: new THREE.Color(cfg.color).multiplyScalar(1.6) },
        uHead: { value: 0 },
        uFade: { value: 1 },
        uTime: { value: 0 },
        uDashed: { value: cfg.dashed },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.renderOrder = 2;
    this.group.add(mesh);
    const travel = (0.55 + curve.ang * 0.5) / cfg.speed;
    const item = { mesh, mat, geom, age: 0, travel, hold: 2.2, fadeOut: 1.0, to: b.clone(), from: a.clone(), color: cfg.color, landed: false };
    this.items.push(item);
    this.fx.ring(a, cfg.color, { size: 0.05, life: 0.8, grow: 0.8 });
    while (this.items.length > this.max) this._remove(0);
  }
  _remove(k) {
    const it = this.items[k];
    this.group.remove(it.mesh);
    it.geom.dispose();
    it.mat.dispose();
    this.items.splice(k, 1);
  }
  update(dt, time) {
    for (let k = this.items.length - 1; k >= 0; k--) {
      const it = this.items[k];
      it.age += dt;
      const head = Math.min(1.0001, it.age / it.travel);
      const u = it.mat.uniforms;
      u.uHead.value = this.reduced ? 1.0001 : head;
      u.uTime.value = time;
      if (!it.landed && head >= 1) {
        it.landed = true;
        this.fx.ring(it.to, it.color, { size: 0.09, life: 1.1, grow: 1 });
        this.fx.flare(it.to.clone().normalize().multiplyScalar(1.01), it.color, { size: 0.07, life: 0.5 });
      }
      const end = it.travel + it.hold;
      u.uFade.value = it.age < end ? 1 : Math.max(0, 1 - (it.age - end) / it.fadeOut);
      if (it.age > end + it.fadeOut) this._remove(k);
    }
  }
  clear() { while (this.items.length) this._remove(0); }
  dispose() { this.clear(); }
}

// ---------------------------------------------------------------------------
// Bubbles (clickable pickups)
// ---------------------------------------------------------------------------
const BUBBLE_COLORS = { breach: '#ff2d55', intel: '#ffc23d', research: '#3dff9a' };

function drawGlyph(g, kind, color) {
  g.save();
  g.translate(64, 64);
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = 6;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (kind === 'breach') {
    // warning triangle with exclamation mark
    g.beginPath();
    g.moveTo(0, -24); g.lineTo(23, 17); g.lineTo(-23, 17); g.closePath();
    g.stroke();
    g.beginPath(); g.moveTo(0, -8); g.lineTo(0, 4); g.stroke();
    g.beginPath(); g.arc(0, 11, 3.2, 0, Math.PI * 2); g.fill();
  } else if (kind === 'intel') {
    // eye
    g.beginPath();
    g.moveTo(-26, 0);
    g.quadraticCurveTo(0, -24, 26, 0);
    g.quadraticCurveTo(0, 24, -26, 0);
    g.closePath();
    g.stroke();
    g.beginPath(); g.arc(0, 0, 8, 0, Math.PI * 2); g.fill();
  } else {
    // flask
    g.beginPath();
    g.moveTo(-8, -24); g.lineTo(8, -24);
    g.moveTo(-6, -24); g.lineTo(-6, -8); g.lineTo(-22, 20); g.lineTo(22, 20); g.lineTo(6, -8); g.lineTo(6, -24);
    g.stroke();
    g.globalAlpha = 0.85;
    g.beginPath(); g.moveTo(-15, 8); g.lineTo(15, 8); g.lineTo(20, 17); g.lineTo(-20, 17); g.closePath(); g.fill();
  }
  g.restore();
}

function makeBubbleTexture(kind) {
  const color = BUBBLE_COLORS[kind] || BUBBLE_COLORS.breach;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  // outer glow
  const grd = g.createRadialGradient(64, 64, 30, 64, 64, 64);
  grd.addColorStop(0, color + 'aa');
  grd.addColorStop(0.45, color + '55');
  grd.addColorStop(1, color + '00');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  // dark core
  g.beginPath(); g.arc(64, 64, 40, 0, Math.PI * 2);
  g.fillStyle = 'rgba(4,8,16,0.92)';
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = color;
  g.stroke();
  // ticks
  g.lineWidth = 3;
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + Math.PI / 4;
    g.beginPath();
    g.moveTo(64 + Math.cos(a) * 45, 64 + Math.sin(a) * 45);
    g.lineTo(64 + Math.cos(a) * 52, 64 + Math.sin(a) * 52);
    g.stroke();
  }
  drawGlyph(g, kind, color);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 2;
  return t;
}

export class Bubbles {
  constructor(parent, surfaceFx, { reducedMotion = false, touch = false } = {}) {
    this.group = new THREE.Group();
    parent.add(this.group);
    this.fx = surfaceFx;
    this.reduced = reducedMotion;
    this.touch = touch;
    this.textures = {};
    for (const k of Object.keys(BUBBLE_COLORS)) this.textures[k] = makeBubbleTexture(k);
    this.items = new Map();
    this.dying = [];
    this.hovered = null;
    this._v = new THREE.Vector3();
    this.particles = [];
  }
  add({ id, kind, countryIndex }, dir) {
    if (this.items.has(id)) return;
    const k = BUBBLE_COLORS[kind] ? kind : 'breach';
    const mat = new THREE.SpriteMaterial({ map: this.textures[k], transparent: true, depthWrite: false, depthTest: true });
    const sprite = new THREE.Sprite(mat);
    sprite.renderOrder = 10;
    const tetherGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const tether = new THREE.Line(tetherGeo, new THREE.LineBasicMaterial({
      color: new THREE.Color(BUBBLE_COLORS[k]), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.group.add(sprite, tether);
    // Slight random offset so bubbles stacked on one country don't overlap exactly.
    const jitter = new THREE.Vector3((Math.random() - 0.5) * 0.04, (Math.random() - 0.5) * 0.04, (Math.random() - 0.5) * 0.04);
    const base = dir.clone().normalize().add(jitter).normalize();
    const item = { id, kind: k, countryIndex, sprite, tether, base, age: 0, phase: Math.random() * 6.28, screen: { x: 0, y: 0, r: 0, visible: false } };
    this.items.set(id, item);
    this.fx.ring(base, BUBBLE_COLORS[k], { size: 0.07, life: 0.9, grow: 1 });
  }
  remove(id, collected) {
    const it = this.items.get(id);
    if (!it) return;
    this.items.delete(id);
    if (this.hovered === id) this.hovered = null;
    it.dieAge = 0;
    it.collected = !!collected;
    this.dying.push(it);
    if (collected) {
      const color = BUBBLE_COLORS[it.kind];
      this.fx.flare(it.sprite.position, color, { size: it.sprite.scale.x * 1.6, life: 0.55 });
      this.fx.ring(it.base, color, { size: 0.16, life: 0.9, grow: 1, alt: 1.004 });
      this._burst(it.sprite.position, color, it.sprite.scale.x);
    }
  }
  _burst(pos, color, scale) {
    const n = 22;
    const geo = new THREE.BufferGeometry();
    const p = new Float32Array(n * 3);
    const v = [];
    for (let k = 0; k < n; k++) {
      p[k * 3] = pos.x; p[k * 3 + 1] = pos.y; p[k * 3 + 2] = pos.z;
      v.push(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(scale * (1.2 + Math.random() * 1.6)));
    }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const mat = new THREE.PointsMaterial({ color: new THREE.Color(color).multiplyScalar(1.5), size: 3.5, sizeAttenuation: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const pts = new THREE.Points(geo, mat);
    pts.renderOrder = 11;
    this.group.add(pts);
    this.particles.push({ pts, v, age: 0, origin: pos.clone() });
  }
  update(dt, time, camera, viewH, pxRatioUnused) {
    const camPos = camera.position;
    const fovK = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / Math.max(1, viewH);
    const targetPx = this.touch ? 50 : 42;
    const v = this._v;
    for (const it of this.items.values()) {
      it.age += dt;
      const bob = this.reduced ? 0 : Math.sin(time * 2 + it.phase) * 0.008;
      const alt = 1.075 + bob;
      it.sprite.position.copy(it.base).multiplyScalar(alt);
      const dist = it.sprite.position.distanceTo(camPos);
      const pop = Math.min(1, it.age / 0.45);
      const popE = 1 + 2.2 * Math.pow(pop - 1, 3) + 1.2 * Math.pow(pop - 1, 2); // ease-out-back
      const pulse = this.reduced ? 1 : 1 + 0.06 * Math.sin(time * 4 + it.phase);
      const hov = this.hovered === it.id ? 1.18 : 1;
      const s = targetPx * fovK * dist * popE * pulse * hov;
      it.sprite.scale.set(s, s, 1);
      const pos = it.tether.geometry.attributes.position;
      pos.setXYZ(0, it.base.x * 1.002, it.base.y * 1.002, it.base.z * 1.002);
      v.copy(it.base).multiplyScalar(alt - s * 0.45);
      pos.setXYZ(1, v.x, v.y, v.z);
      pos.needsUpdate = true;
      it.tether.geometry.computeBoundingSphere();
      // Occlusion: is the bubble behind the globe (as seen from the camera)?
      const occluded = rayHitsSphereBefore(camPos, it.sprite.position, 1.0);
      it.screen.visible = !occluded;
      it.sprite.material.opacity = occluded ? 0.0 : 1;
      it.tether.material.opacity = occluded ? 0 : 0.55;
      it.screen.r = (s / (fovK * dist)) * 0.5;
    }
    for (let k = this.dying.length - 1; k >= 0; k--) {
      const it = this.dying[k];
      it.dieAge += dt;
      const p = it.dieAge / (it.collected ? 0.25 : 0.4);
      if (p >= 1) {
        this.group.remove(it.sprite, it.tether);
        it.sprite.material.dispose();
        it.tether.geometry.dispose();
        it.tether.material.dispose();
        this.dying.splice(k, 1);
        continue;
      }
      const sc = it.collected ? 1 + p * 0.6 : 1 - p;
      it.sprite.scale.multiplyScalar(it.collected ? 1 : 1).setScalar(it.sprite.scale.x * (it.collected ? 1 + dt * 2.4 : 1 - dt * 2.5));
      it.sprite.scale.z = 1;
      it.sprite.material.opacity = (1 - p) * (it.screen.visible ? 1 : 0);
      it.tether.material.opacity = (1 - p) * 0.5;
      void sc;
    }
    for (let k = this.particles.length - 1; k >= 0; k--) {
      const pa = this.particles[k];
      pa.age += dt;
      const p = pa.age / 0.7;
      if (p >= 1) {
        this.group.remove(pa.pts);
        pa.pts.geometry.dispose();
        pa.pts.material.dispose();
        this.particles.splice(k, 1);
        continue;
      }
      const e = 1 - Math.pow(1 - p, 3);
      const arr = pa.pts.geometry.attributes.position;
      for (let j = 0; j < pa.v.length; j++) {
        arr.setXYZ(j, pa.origin.x + pa.v[j].x * e, pa.origin.y + pa.v[j].y * e, pa.origin.z + pa.v[j].z * e);
      }
      arr.needsUpdate = true;
      pa.pts.material.opacity = 1 - p;
    }
  }
  /** Project bubbles to screen; returns the id of the bubble under (x,y) CSS px, or null. */
  pick(x, y, camera, rect) {
    let best = null, bestD = Infinity;
    const v = this._v;
    const minR = this.touch ? 34 : 26;
    for (const it of this.items.values()) {
      if (!it.screen.visible || it.age < 0.15) continue;
      v.copy(it.sprite.position).project(camera);
      if (v.z > 1) continue;
      const sx = (v.x * 0.5 + 0.5) * rect.width;
      const sy = (-v.y * 0.5 + 0.5) * rect.height;
      const d = Math.hypot(sx - x, sy - y);
      const r = Math.max(minR, it.screen.r * 1.25);
      if (d < r && d < bestD) { best = it.id; bestD = d; }
    }
    return best;
  }
  has(id) { return this.items.has(id); }
  ids() { return [...this.items.keys()]; }
  clear() {
    for (const id of [...this.items.keys()]) this.remove(id, false);
  }
  dispose() {
    for (const it of [...this.items.values(), ...this.dying]) {
      this.group.remove(it.sprite, it.tether);
      it.sprite.material.dispose();
      it.tether.geometry.dispose();
      it.tether.material.dispose();
    }
    for (const pa of this.particles) { pa.pts.geometry.dispose(); pa.pts.material.dispose(); }
    this.items.clear();
    this.dying.length = 0;
    this.particles.length = 0;
    for (const t of Object.values(this.textures)) t.dispose();
  }
}

/** True if the segment camera→p intersects the sphere (radius r at origin) before reaching p. */
export function rayHitsSphereBefore(cam, p, r) {
  const dx = p.x - cam.x, dy = p.y - cam.y, dz = p.z - cam.z;
  const len = Math.hypot(dx, dy, dz);
  const ux = dx / len, uy = dy / len, uz = dz / len;
  const b = cam.x * ux + cam.y * uy + cam.z * uz;
  const c = cam.x * cam.x + cam.y * cam.y + cam.z * cam.z - r * r;
  const disc = b * b - c;
  if (disc < 0) return false;
  const t = -b - Math.sqrt(disc);
  return t > 0 && t < len - 1e-4;
}

// ---------------------------------------------------------------------------
// Research lab markers (green hex glyphs on the surface)
// ---------------------------------------------------------------------------
function makeLabTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.translate(64, 64);
  g.strokeStyle = '#3dff9a';
  g.lineWidth = 6;
  g.beginPath();
  for (let k = 0; k <= 6; k++) {
    const a = (k * Math.PI) / 3 + Math.PI / 6;
    const x = Math.cos(a) * 50, y = Math.sin(a) * 50;
    if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.stroke();
  g.lineWidth = 3;
  g.globalAlpha = 0.6;
  g.beginPath();
  g.arc(0, 0, 34, 0, Math.PI * 2);
  g.stroke();
  g.globalAlpha = 1;
  g.lineWidth = 8;
  g.lineCap = 'round';
  g.beginPath(); g.moveTo(-14, 0); g.lineTo(14, 0); g.moveTo(0, -14); g.lineTo(0, 14); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class LabMarkers {
  constructor(parent) {
    this.group = new THREE.Group();
    parent.add(this.group);
    this.tex = makeLabTexture();
    this.geo = new THREE.PlaneGeometry(1, 1);
    this.mat = new THREE.MeshBasicMaterial({
      map: this.tex, color: new THREE.Color('#3dff9a'), transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.markers = new Map();
  }
  set(index, level, dir) {
    let m = this.markers.get(index);
    if (!level) {
      if (m) { this.group.remove(m); this.markers.delete(index); }
      return;
    }
    if (!m) {
      m = new THREE.Mesh(this.geo, this.mat);
      m.position.copy(dir).normalize().multiplyScalar(1.004);
      m.lookAt(m.position.clone().multiplyScalar(2));
      m.renderOrder = 3;
      this.group.add(m);
      this.markers.set(index, m);
    }
    const s = 0.03 + 0.012 * level;
    m.scale.set(s, s, s);
  }
  update(time, reduced) {
    this.mat.opacity = reduced ? 0.8 : 0.65 + 0.3 * (0.5 + 0.5 * Math.sin(time * 2.2));
  }
  clear() {
    for (const m of this.markers.values()) this.group.remove(m);
    this.markers.clear();
  }
  dispose() {
    this.clear();
    this.geo.dispose();
    this.mat.dispose();
    this.tex.dispose();
  }
}
