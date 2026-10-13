// KILL SWITCH — 3D globe: rendering, country state visualization, picking.
// Contract: docs/ARCHITECTURE.md ("Globe — src/globe/globe.js exports class Globe").
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { prepareGeo, bakeIds, bakeGlow, bakeDetail, bakeNoise } from './bake.js';
import {
  earthVertex, earthFragment, atmoVertex, atmoFragment,
  starsVertex, starsFragment, skyVertex, skyFragment,
} from './shaders.js';
import { Arcs, Bubbles, SurfaceFx, LabMarkers, lonLatToVec3, vec3ToLonLat } from './effects.js';

const ATMO_RADIUS = 1.1;
const CYAN = new THREE.Color('#3de0ff');
const MAGENTA = new THREE.Color('#ff3df0');
const GREEN = new THREE.Color('#3dff9a');

function detectLowPower() {
  try {
    const small = Math.min(window.screen?.width || 1e4, window.screen?.height || 1e4) < 600;
    const coarse = window.matchMedia?.('(pointer: coarse)').matches;
    const cores = navigator.hardwareConcurrency || 8;
    const mem = navigator.deviceMemory || 8;
    return small || (coarse && cores <= 6) || mem <= 3 || cores <= 2;
  } catch {
    return false;
  }
}

function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export class Globe {
  /**
   * @param {HTMLElement} container
   * @param {{ geo: Array, quality?: 'auto'|'high'|'low' }} opts
   */
  constructor(container, { geo, quality = 'auto' } = {}) {
    this.container = container;
    this.geo = geo;
    this.n = geo.length;
    this.quality = quality;
    this.lowPower = quality === 'low' || (quality === 'auto' && detectLowPower());
    this.touch = (() => { try { return window.matchMedia('(pointer: coarse)').matches; } catch { return false; } })();
    this.reducedMotion = false;
    try {
      this._rmq = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.reducedMotion = this._rmq.matches;
      this._onRmq = (e) => { this.reducedMotion = e.matches; this._applyMotion(); };
      this._rmq.addEventListener?.('change', this._onRmq);
    } catch { /* ignore */ }

    this.onCountryClick = null;
    this.onCountryHover = null;
    this.onBubbleClick = null;

    this.time = 0;
    this.selected = null;
    this.hovered = null;
    this._game = undefined;
    this._pointer = null; // last pointer {x,y} in CSS px relative to canvas
    this._idle = 0;
    this._focus = null;
    this._disposed = false;
    this._frameTimes = [];
    this._degraded = 0;

    this._initRenderer();
    this._initScene();
    this._bake();
    this._initEarth();
    this._initEffects();
    this._initControls();
    this._initEvents();
    this.resize();
    this._applyMotion();
  }

  // ------------------------------------------------------------------ setup
  _initRenderer() {
    const r = new THREE.WebGLRenderer({ antialias: !this.lowPower, alpha: false, powerPreference: 'high-performance' });
    this.renderer = r;
    this.maxPixelRatio = this.lowPower ? 1.5 : 2;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.maxPixelRatio));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    r.setClearColor(0x020409, 1);
    const c = r.domElement;
    c.style.display = 'block';
    c.style.width = '100%';
    c.style.height = '100%';
    c.style.outline = 'none';
    c.style.touchAction = 'none';
    c.setAttribute('aria-label', 'World map globe');
    this.container.appendChild(c);
    this.canvas = c;
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 500);
    this.camera.position.set(0.35, 0.6, 3.6).normalize().multiplyScalar(3.8);
    // Start over the Atlantic/Europe-ish.
    lonLatToVec3(10, 22, 3.8, this.camera.position);
    this.camera.lookAt(0, 0, 0);
    this.globeGroup = new THREE.Group();
    this.scene.add(this.globeGroup);

    // Sky (faint nebula) + stars
    if (!this.lowPower) {
      this.sky = new THREE.Mesh(
        new THREE.SphereGeometry(200, 48, 24),
        new THREE.ShaderMaterial({ vertexShader: skyVertex, fragmentShader: skyFragment, uniforms: { uTime: { value: 0 } }, side: THREE.BackSide, depthWrite: false }),
      );
      this.sky.renderOrder = -10;
      this.scene.add(this.sky);
    }
    const nStars = this.lowPower ? 1200 : 2600;
    const pos = new Float32Array(nStars * 3), size = new Float32Array(nStars), phase = new Float32Array(nStars), col = new Float32Array(nStars * 3);
    const v = new THREE.Vector3();
    const tint = [new THREE.Color('#ffffff'), new THREE.Color('#a8d8ff'), new THREE.Color('#ffd9b0'), new THREE.Color('#c9b8ff')];
    for (let k = 0; k < nStars; k++) {
      v.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
      if (v.lengthSq() > 1 || v.lengthSq() < 0.01) { k--; continue; }
      v.normalize().multiplyScalar(150);
      pos.set([v.x, v.y, v.z], k * 3);
      const big = Math.random();
      size[k] = 0.8 + Math.pow(big, 6) * 3.2;
      phase[k] = Math.random();
      const c = tint[Math.floor(Math.random() * tint.length)];
      const b = 0.25 + Math.pow(Math.random(), 3) * 0.75;
      col.set([c.r * b, c.g * b, c.b * b], k * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    sg.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    sg.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    this.stars = new THREE.Points(sg, new THREE.ShaderMaterial({
      vertexShader: starsVertex, fragmentShader: starsFragment,
      uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 } },
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.stars.renderOrder = -9;
    this.scene.add(this.stars);
  }

  _bake() {
    const maxTex = this.renderer.capabilities.maxTextureSize || 4096;
    const W = Math.min(this.lowPower ? 2048 : 4096, maxTex);
    const H = W / 2;
    this.idW = W;
    this.idH = H;
    this.prepared = prepareGeo(this.geo);
    this.ids = bakeIds(this.prepared, W, H);
    const gw = 1024, gh = 512;
    const glow = bakeGlow(this.ids, W, H, gw, gh);
    const detailCanvas = bakeDetail(this.geo, this.prepared, this.ids, W, H, glow.float, gw, gh, { metros: this.lowPower ? 600 : 900 });

    const idTex = new THREE.DataTexture(this.ids, W, H, THREE.RedFormat, THREE.UnsignedByteType);
    idTex.magFilter = idTex.minFilter = THREE.NearestFilter;
    idTex.wrapS = THREE.RepeatWrapping;
    idTex.wrapT = THREE.ClampToEdgeWrapping;
    idTex.generateMipmaps = false;
    idTex.unpackAlignment = 1;
    idTex.needsUpdate = true;
    this.idTex = idTex;

    const detailTex = new THREE.CanvasTexture(detailCanvas);
    detailTex.flipY = false;
    detailTex.colorSpace = THREE.NoColorSpace;
    detailTex.wrapS = THREE.RepeatWrapping;
    detailTex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    detailTex.minFilter = THREE.LinearMipmapLinearFilter;
    this.detailTex = detailTex;

    const glowTex = new THREE.DataTexture(glow.data, gw, gh, THREE.RedFormat, THREE.UnsignedByteType);
    glowTex.magFilter = glowTex.minFilter = THREE.LinearFilter;
    glowTex.wrapS = THREE.RepeatWrapping;
    glowTex.unpackAlignment = 1;
    glowTex.needsUpdate = true;
    this.glowTex = glowTex;

    const noiseTex = new THREE.DataTexture(bakeNoise(256), 256, 256, THREE.RGBAFormat, THREE.UnsignedByteType);
    noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping;
    noiseTex.magFilter = THREE.LinearFilter;
    noiseTex.minFilter = THREE.LinearMipmapLinearFilter;
    noiseTex.generateMipmaps = true;
    noiseTex.needsUpdate = true;
    this.noiseTex = noiseTex;

    // Per-country state: 256 x 2 RGBA8, slot = index + 1 (slot 0 = ocean).
    this.stateData = new Uint8Array(256 * 2 * 4);
    this.stateTex = new THREE.DataTexture(this.stateData, 256, 2, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.stateTex.magFilter = this.stateTex.minFilter = THREE.NearestFilter;
    this.stateTex.needsUpdate = true;
    // Current (smoothed) and target per-country values.
    const F = 8; // inf, lost, quar, shut, lab, ks, ice, flash
    this.cur = new Float32Array(this.n * F);
    this.tgt = new Float32Array(this.n * F);
    this._prevFlags = new Array(this.n).fill(null);
    this.geo.forEach((c, i) => { if (c.id === '010') { this.cur[i * F + 6] = this.tgt[i * F + 6] = 1; } });

    // Country centroid directions + uv boxes.
    this.dirs = this.geo.map((c) => lonLatToVec3(c.centroid[0], c.centroid[1], 1));
    this.boxes = this.prepared.map(({ bbox }) => {
      let [lo0, lo1, la0, la1] = bbox;
      let u0 = (lo0 + 180) / 360, u1 = (lo1 + 180) / 360;
      if (lo0 < -180 || lo1 > 180 || lo1 - lo0 > 300) { u0 = 0; u1 = 1; }
      return new THREE.Vector4(u0, u1, (90 - la1) / 180, (90 - la0) / 180);
    });
  }

  _initEarth() {
    const segs = this.lowPower ? [112, 72] : [192, 128];
    const geom = new THREE.SphereGeometry(1, segs[0], segs[1]);
    this.earthMat = new THREE.ShaderMaterial({
      vertexShader: earthVertex,
      fragmentShader: earthFragment,
      defines: this.lowPower ? { LOW_QUALITY: 1 } : {},
      uniforms: {
        uIds: { value: this.idTex },
        uIdSize: { value: new THREE.Vector2(this.idW, this.idH) },
        uState: { value: this.stateTex },
        uDetail: { value: this.detailTex },
        uGlow: { value: this.glowTex },
        uNoise: { value: this.noiseTex },
        uTime: { value: 0 },
        uLightDir: { value: new THREE.Vector3(0, 0, 1) },
        uAtmo: { value: CYAN.clone() },
        uSel: { value: 0 },
        uHover: { value: 0 },
        uSelBox: { value: new THREE.Vector4() },
        uHoverBox: { value: new THREE.Vector4() },
        uSelCenter: { value: new THREE.Vector2() },
        uIntro: { value: 1 },
      },
      extensions: { derivatives: true },
    });
    this.earth = new THREE.Mesh(geom, this.earthMat);
    this.globeGroup.add(this.earth);

    const edge = Math.sqrt(1 - 1 / (ATMO_RADIUS * ATMO_RADIUS));
    this.atmoMat = new THREE.ShaderMaterial({
      vertexShader: atmoVertex,
      fragmentShader: atmoFragment,
      uniforms: { uColor: { value: CYAN.clone() }, uLightDir: { value: new THREE.Vector3(0, 0, 1) }, uEdge: { value: edge } },
      side: THREE.BackSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.atmo = new THREE.Mesh(new THREE.SphereGeometry(ATMO_RADIUS, 96, 48), this.atmoMat);
    this.globeGroup.add(this.atmo);
  }

  _initEffects() {
    this.surfaceFx = new SurfaceFx(this.globeGroup);
    this.arcs = new Arcs(this.globeGroup, this.surfaceFx, { max: this.lowPower ? 24 : 48, reducedMotion: this.reducedMotion });
    this.bubbles = new Bubbles(this.globeGroup, this.surfaceFx, { reducedMotion: this.reducedMotion, touch: this.touch });
    this.labs = new LabMarkers(this.globeGroup);
    this._labLevels = new Int8Array(this.n);

    this.useBloom = !this.lowPower;
    if (this.useBloom) this._initComposer();
  }

  _initComposer() {
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.5, 0.42);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  _initControls() {
    const c = new OrbitControls(this.camera, this.canvas);
    c.enablePan = false;
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.rotateSpeed = 0.5;
    c.zoomSpeed = 0.8;
    c.minDistance = 1.35;
    c.maxDistance = 6.5;
    c.minPolarAngle = 0.12;
    c.maxPolarAngle = Math.PI - 0.12;
    c.autoRotateSpeed = 0.35;
    c.addEventListener('start', () => {
      this._idle = 0;
      this._focus = null;
      this._userInteracted = true;
    });
    this.controls = c;
  }

  _initEvents() {
    const el = this.canvas;
    this._down = null;
    this._touches = new Set();
    this._onPointerDown = (e) => {
      this._touches.add(e.pointerId);
      if (this._touches.size > 1) { this._down = null; return; }
      if (e.button !== undefined && e.button !== 0) return;
      this._down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, moved: 0 };
    };
    this._onPointerMove = (e) => {
      const rect = el.getBoundingClientRect();
      this._pointer = { x: e.clientX - rect.left, y: e.clientY - rect.top, cx: e.clientX, cy: e.clientY, type: e.pointerType };
      if (this._down && this._down.id === e.pointerId) {
        this._down.moved = Math.max(this._down.moved, Math.hypot(e.clientX - this._down.x, e.clientY - this._down.y));
      }
      if (e.pointerType !== 'touch') this._updateHover(true);
    };
    this._onPointerUp = (e) => {
      this._touches.delete(e.pointerId);
      const d = this._down;
      this._down = null;
      if (!d || d.id !== e.pointerId) return;
      const moved = Math.max(d.moved, Math.hypot(e.clientX - d.x, e.clientY - d.y));
      const slop = e.pointerType === 'touch' ? 12 : 6;
      if (moved > slop || performance.now() - d.t > 800) return;
      this._handleClick(e.clientX, e.clientY);
    };
    this._onPointerCancel = (e) => { this._touches.delete(e.pointerId); this._down = null; };
    this._onPointerLeave = (e) => {
      if (e.pointerType === 'touch') return;
      this._pointer = null;
      this._setHover(null, e.clientX, e.clientY);
      this.bubbles.hovered = null;
      el.style.cursor = '';
    };
    el.addEventListener('pointerdown', this._onPointerDown);
    el.addEventListener('pointermove', this._onPointerMove);
    el.addEventListener('pointerup', this._onPointerUp);
    el.addEventListener('pointercancel', this._onPointerCancel);
    el.addEventListener('pointerleave', this._onPointerLeave);

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => this.resize());
      this._ro.observe(this.container);
    }
    this._raycaster = new THREE.Raycaster();
    this._sphere = new THREE.Sphere(new THREE.Vector3(), 1);
    this._ndc = new THREE.Vector2();
    this._hit = new THREE.Vector3();
  }

  _applyMotion() {
    if (this.arcs) this.arcs.reduced = this.reducedMotion;
    if (this.bubbles) this.bubbles.reduced = this.reducedMotion;
  }

  // ------------------------------------------------------------------ public API
  resize() {
    if (this._disposed) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    if (!w || !h) return;
    const pr = Math.min(window.devicePixelRatio || 1, this.maxPixelRatio);
    if (w === this._w && h === this._h && pr === this._pr) return;
    this._w = w; this._h = h; this._pr = pr;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setPixelRatio(pr);
      this.composer.setSize(w, h);
    }
    this.stars.material.uniforms.uPixelRatio.value = pr;
    // Distance at which the globe comfortably fits the viewport.
    const vf = THREE.MathUtils.degToRad(this.camera.fov) / 2;
    const hf = Math.atan(Math.tan(vf) * this.camera.aspect);
    const fitV = 1 / Math.sin(vf * 0.80);
    const fitH = 1 / Math.sin(hf * 0.94);
    this.fitDistance = Math.max(fitV, fitH);
    this.controls.maxDistance = Math.max(4.5, this.fitDistance * 1.6);
    if (!this._initialFit) {
      this._initialFit = true;
      this.camera.position.setLength(this.fitDistance * 1.08);
    }
  }

  setSelected(index) {
    const i = index == null || index < 0 || index >= this.n ? null : index;
    this.selected = i;
    const u = this.earthMat.uniforms;
    u.uSel.value = i == null ? 0 : i + 1;
    if (i != null) {
      u.uSelBox.value.copy(this.boxes[i]);
      const [lon, lat] = this.geo[i].centroid;
      u.uSelCenter.value.set((lon * Math.PI) / 180, (lat * Math.PI) / 180);
      this.surfaceFx.ring(this.dirs[i], '#3de0ff', { size: 0.12, life: 0.8, grow: 1 });
    }
  }

  focusCountry(index) {
    if (index == null || index < 0 || index >= this.n) return;
    const [lon, lat] = this.geo[index].centroid;
    const target = lonLatToVec3(lon, THREE.MathUtils.clamp(lat, -72, 72), 1);
    const from = this.camera.position.clone();
    const dist = from.length();
    const area = this.geo[index].area || 0.01;
    const want = THREE.MathUtils.clamp(1.9 + Math.sqrt(area) * 3.2, 2.1, Math.max(2.2, this.fitDistance || 3.2));
    this._focus = {
      q0: new THREE.Quaternion(),
      q1: new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), target),
      d0: dist,
      d1: Math.min(dist, Math.max(want, Math.min(dist, 2.2))),
      fromDir: from.clone().normalize(),
      t: 0,
      dur: this.reducedMotion ? 0.25 : 1.2,
    };
    this._idle = 0;
  }

  addArc(fromIndex, toIndex, route) {
    if (fromIndex == null || toIndex == null || fromIndex === toIndex) return;
    const a = this.dirs[fromIndex], b = this.dirs[toIndex];
    if (!a || !b) return;
    this.arcs.add(a, b, route);
  }

  addBubble(b) {
    if (!b || b.id == null) return;
    const dir = this.dirs[b.countryIndex];
    if (!dir) return;
    this.bubbles.add(b, dir);
  }

  removeBubble(id, collected) {
    this.bubbles.remove(id, collected);
  }

  update(dt, game) {
    if (this._disposed) return;
    dt = Math.min(Math.max(dt || 0, 0), 0.1);
    const motion = this.reducedMotion ? 0.3 : 1;
    this.time += dt * motion;
    const t = this.time;

    if (game !== this._game) this._onGameChange(game);
    this._guard('state', () => this._updateState(dt, game));

    // Camera: focus animation, auto-rotate, menu dolly.
    this._idle += dt;
    const c = this.controls;
    if (this._focus) {
      const f = this._focus;
      f.t += dt / f.dur;
      const e = easeInOut(Math.min(1, f.t));
      const q = new THREE.Quaternion().slerpQuaternions(f.q0, f.q1, e);
      const dir = f.fromDir.clone().applyQuaternion(q);
      this.camera.position.copy(dir.multiplyScalar(THREE.MathUtils.lerp(f.d0, f.d1, e)));
      this.camera.lookAt(0, 0, 0);
      if (f.t >= 1) this._focus = null;
    } else if (!game && this.fitDistance) {
      // Menu: drift towards a cinematic distance.
      const want = this.fitDistance * 1.08;
      const d = this.camera.position.length();
      if (!this._userInteracted) this.camera.position.setLength(d + (want - d) * Math.min(1, dt * 1.5));
    }
    c.autoRotate = !this.reducedMotion && !this._focus && (!game || this._idle > 25) && !this._down;
    c.autoRotateSpeed = game ? 0.25 : 0.45;
    // Slower rotation when zoomed in.
    c.rotateSpeed = THREE.MathUtils.clamp((this.camera.position.length() - 1) * 0.28, 0.08, 0.6);
    c.update();

    // Camera-relative key light: from upper-left-front, so the right limb falls into night.
    const cam = this.camera;
    const fwd = cam.position.clone().normalize();
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    const L = fwd.multiplyScalar(0.62).addScaledVector(right, -0.7).addScaledVector(up, 0.35).normalize();
    const u = this.earthMat.uniforms;
    u.uLightDir.value.copy(L);
    u.uTime.value = t;
    this.atmoMat.uniforms.uLightDir.value.copy(L);
    this.stars.material.uniforms.uTime.value = t;

    this._guard('arcs', () => this.arcs.update(dt, t));
    this._guard('bubbles', () => this.bubbles.update(dt, t, cam, this._h || 800));
    this._guard('surfaceFx', () => this.surfaceFx.update(dt));
    this._guard('labs', () => this.labs.update(t, this.reducedMotion));

    // Keep hover accurate while the globe moves under a stationary mouse.
    if (this._pointer && this._pointer.type !== 'touch' && !this._down) this._updateHover(false);

    this._adapt(dt);
  }

  render() {
    if (this._disposed || !this._w) return;
    if (this.composer && this.useBloom) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    const el = this.canvas;
    el.removeEventListener('pointerdown', this._onPointerDown);
    el.removeEventListener('pointermove', this._onPointerMove);
    el.removeEventListener('pointerup', this._onPointerUp);
    el.removeEventListener('pointercancel', this._onPointerCancel);
    el.removeEventListener('pointerleave', this._onPointerLeave);
    window.removeEventListener('resize', this._onResize);
    this._ro?.disconnect();
    this._rmq?.removeEventListener?.('change', this._onRmq);
    this.controls.dispose();
    this.arcs.dispose();
    this.bubbles.dispose();
    this.surfaceFx.dispose();
    this.labs.dispose();
    this.scene.traverse((o) => {
      o.geometry?.dispose?.();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
    [this.idTex, this.detailTex, this.glowTex, this.stateTex, this.noiseTex].forEach((tx) => tx.dispose());
    this.composer?.dispose?.();
    this.bloom?.dispose?.();
    this.renderer.dispose();
    el.remove();
  }

  /** Country index at client coordinates, or null (ocean / off-globe). */
  pickCountry(clientX, clientY) {
    const p = this._pickLonLat(clientX, clientY);
    if (!p) return null;
    return this.countryAtLonLat(p[0], p[1]);
  }

  countryAtLonLat(lon, lat) {
    const W = this.idW, H = this.idH;
    let x = Math.floor(((lon + 180) / 360) * W);
    x = ((x % W) + W) % W;
    const y = Math.min(H - 1, Math.max(0, Math.floor(((90 - lat) / 180) * H)));
    const id = this.ids[y * W + x];
    return id ? id - 1 : null;
  }

  /** Screen position (CSS px, relative to the container) of a country's centroid, or null if hidden. */
  projectCountry(index) {
    const d = this.dirs[index];
    if (!d) return null;
    this.camera.updateMatrixWorld();
    const v = d.clone().project(this.camera);
    const visible = d.dot(this.camera.position.clone().normalize()) > 1 / this.camera.position.length();
    return { x: (v.x * 0.5 + 0.5) * this._w, y: (-v.y * 0.5 + 0.5) * this._h, visible };
  }

  // ------------------------------------------------------------------ internals
  _pickLonLat(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    this.camera.updateMatrixWorld();
    this._ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this._raycaster.setFromCamera(this._ndc, this.camera);
    const hit = this._raycaster.ray.intersectSphere(this._sphere, this._hit);
    if (!hit) return null;
    return vec3ToLonLat(hit);
  }

  _handleClick(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const bid = this.bubbles.pick(clientX - rect.left, clientY - rect.top, this.camera, rect);
    if (bid != null) {
      this.onBubbleClick?.(bid);
      return;
    }
    const idx = this.pickCountry(clientX, clientY);
    this.onCountryClick?.(idx);
  }

  _updateHover(fromMove) {
    const p = this._pointer;
    if (!p) return;
    const rect = this.canvas.getBoundingClientRect();
    const bid = this.bubbles.pick(p.x, p.y, this.camera, rect);
    this.bubbles.hovered = bid;
    const idx = bid != null ? null : this.pickCountry(p.cx, p.cy);
    this.canvas.style.cursor = bid != null || idx != null ? 'pointer' : '';
    if (fromMove || idx !== this.hovered) this._setHover(idx, p.cx, p.cy);
  }

  _setHover(idx, x, y) {
    const changed = idx !== this.hovered;
    this.hovered = idx;
    const u = this.earthMat.uniforms;
    u.uHover.value = idx == null ? 0 : idx + 1;
    if (idx != null) u.uHoverBox.value.copy(this.boxes[idx]);
    if (changed || idx != null) this.onCountryHover?.(idx, x, y);
  }

  _onGameChange(game) {
    const prev = this._game;
    this._game = game;
    if (!game) {
      this.arcs.clear();
      this._userInteracted = false;
    } else if (!prev && this.fitDistance) {
      // Entering a game: gentle dolly to the play distance.
      const from = this.camera.position.clone();
      this._focus = {
        q0: new THREE.Quaternion(), q1: new THREE.Quaternion(),
        fromDir: from.clone().normalize(), d0: from.length(), d1: this.fitDistance, t: 0,
        dur: this.reducedMotion ? 0.2 : 1.4,
      };
    }
    this._prevFlags.fill(null);
  }

  _updateState(dt, game) {
    const F = 8;
    const n = this.n;
    const tgt = this.tgt, cur = this.cur;
    let threat = 0, popSum = 0, ksAll = false, deploy = 0;
    const countries = game && Array.isArray(game.countries) ? game.countries : null;
    const flashes = [];
    for (let i = 0; i < n; i++) {
      const o = i * F;
      const c = countries ? countries[i] : null;
      const isIce = this.geo[i].id === '010';
      if (!c || isIce) {
        tgt[o] = tgt[o + 1] = tgt[o + 2] = tgt[o + 3] = tgt[o + 4] = tgt[o + 5] = 0;
        tgt[o + 6] = isIce ? 1 : 0;
        if (this._labLevels[i]) { this._labLevels[i] = 0; this.labs.set(i, 0); }
        continue;
      }
      const pop = c.population || 0;
      const detected = !!c.detected;
      const infected = Math.max(0, c.infected || 0);
      const lost = Math.max(0, c.lost || 0);
      const showLost = detected || c.status === 'fallen';
      const fi = pop > 0 ? infected / pop : 0;
      const fl = pop > 0 ? lost / pop : 0;
      tgt[o] = detected && infected > 0 ? Math.min(1, 0.12 + 0.88 * Math.pow(fi, 0.35)) : 0;
      tgt[o + 1] = showLost && lost > 0 ? Math.min(1, 0.1 + 0.9 * Math.pow(fl, 0.5)) : 0;
      tgt[o + 2] = c.quarantined ? 1 : 0;
      tgt[o + 3] = c.shutdown ? 1 : 0;
      const lab = Math.max(0, Math.min(3, c.labLevel | 0));
      tgt[o + 4] = lab / 3;
      const ks = c.killSwitchDeployed || c.status === 'liberated';
      tgt[o + 5] = ks ? 1 : 0;
      tgt[o + 6] = 0;
      if (lab !== this._labLevels[i]) { this._labLevels[i] = lab; this.labs.set(i, lab, this.dirs[i]); }
      // Flash on notable transitions (newly detected, fallen, liberated).
      const flags = (detected ? 1 : 0) | (c.status === 'fallen' ? 2 : 0) | (ks ? 4 : 0) | (c.quarantined ? 8 : 0);
      const pf = this._prevFlags[i];
      if (pf != null && (flags & ~pf & 15)) {
        cur[o + 7] = 1;
        flashes.push(i, flags);
      }
      this._prevFlags[i] = flags;
      if (c.playable !== false && pop > 0) {
        popSum += pop;
        if (detected) threat += infected + lost;
      }
    }
    // Surface pings for state changes; skipped when many change at once (fast-forward, load).
    if (flashes.length && flashes.length <= 8) {
      for (let f = 0; f < flashes.length; f += 2) {
        const fl = flashes[f + 1];
        const col = fl & 4 ? '#3dff9a' : fl & 8 ? '#3de0ff' : '#ff2d55';
        this.surfaceFx.ring(this.dirs[flashes[f]], col, { size: 0.14, life: 1.4, grow: 1 });
      }
    }
    if (game && game.player) {
      ksAll = !!game.player.killSwitchDeployed;
      deploy = +game.player.deployProgress || 0;
    }
    // Smooth toward targets and pack into the state texture.
    const k = Math.min(1, dt * 3.5);
    const data = this.stateData;
    let dirty = false;
    for (let i = 0; i < n; i++) {
      const o = i * F;
      for (let j = 0; j < 7; j++) cur[o + j] += (tgt[o + j] - cur[o + j]) * k;
      cur[o + 7] = Math.max(0, cur[o + 7] - dt * 1.2);
      const s = i + 1;
      const p0 = s * 4, p1 = (256 + s) * 4;
      const v = [cur[o], cur[o + 1], cur[o + 2], cur[o + 3], cur[o + 4], cur[o + 5], cur[o + 6], cur[o + 7]];
      for (let j = 0; j < 4; j++) {
        const b0 = Math.round(Math.min(1, Math.max(0, v[j])) * 255);
        const b1 = Math.round(Math.min(1, Math.max(0, v[4 + j])) * 255);
        if (data[p0 + j] !== b0) { data[p0 + j] = b0; dirty = true; }
        if (data[p1 + j] !== b1) { data[p1 + j] = b1; dirty = true; }
      }
    }
    if (dirty) this.stateTex.needsUpdate = true;

    // Atmosphere mood: cyan (humanity) → magenta (AI) → green (kill switch).
    const share = popSum > 0 ? threat / popSum : 0;
    const want = CYAN.clone().lerpHSL(MAGENTA, THREE.MathUtils.smoothstep(share, 0.03, 0.6) * 0.9);
    if (ksAll) want.lerpHSL(GREEN, Math.min(1, 0.4 + deploy * 0.6));
    this.atmoMat.uniforms.uColor.value.lerp(want, Math.min(1, dt * 1.5));
    this.earthMat.uniforms.uAtmo.value.copy(this.atmoMat.uniforms.uColor.value);

    // Bubble sync: drop bubbles the game no longer knows about (safety net).
    if (game && game.bubbles && typeof game.bubbles.has === 'function') {
      for (const id of this.bubbles.ids()) {
        const it = this.bubbles.items.get(id);
        if (it.age > 1.5 && !game.bubbles.has(id)) this.bubbles.remove(id, false);
      }
    }
  }

  /** Run an effect subsystem; a bug there is logged once instead of breaking the frame. */
  _guard(name, fn) {
    try {
      fn();
    } catch (err) {
      this._errs = this._errs || new Set();
      if (!this._errs.has(name)) { this._errs.add(name); console.error(`[globe] ${name} update failed`, err); }
    }
  }

  _adapt(dt) {
    if (this.quality !== 'auto' || this._degraded >= 2) return;
    if (dt >= 0.099) return; // backgrounded tab / hitch, not steady-state cost
    const ft = this._frameTimes;
    ft.push(dt);
    if (ft.length < 180) return;
    const avg = ft.reduce((a, b) => a + b, 0) / ft.length;
    ft.length = 0;
    if (avg > 1 / 32) {
      this._degraded++;
      if (this._degraded === 1 && this.useBloom) {
        this.useBloom = false;
      } else {
        this.maxPixelRatio = 1;
        this._pr = 0;
        this.resize();
      }
    }
  }
}

export default Globe;
