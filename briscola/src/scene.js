// three.js view: table, lights, card meshes, tweens, picking, theme blend.
// Knows nothing about the rules; main.js tells it where cards go.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { drawFace, drawBack } from './cards.js';

export const CW = 1.0; // card width in world units
export const CH = 1.552;
const TABLE_W = 30;
const TABLE_D = 22;

// ---------------------------------------------------------------- geometry
function cardGeometry(mirrorU) {
  const r = 0.07;
  const w = CW / 2;
  const h = CH / 2;
  const s = new THREE.Shape();
  s.moveTo(-w + r, -h);
  s.lineTo(w - r, -h);
  s.quadraticCurveTo(w, -h, w, -h + r);
  s.lineTo(w, h - r);
  s.quadraticCurveTo(w, h, w - r, h);
  s.lineTo(-w + r, h);
  s.quadraticCurveTo(-w, h, -w, h - r);
  s.lineTo(-w, -h + r);
  s.quadraticCurveTo(-w, -h, -w + r, -h);
  const g = new THREE.ShapeGeometry(s, 4);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const u = (pos.getX(i) + w) / CW;
    uv.setXY(i, mirrorU ? 1 - u : u, (pos.getY(i) + h) / CH);
  }
  return g;
}

// ------------------------------------------------------------------ shader
// One material per card face. Shared uniform objects (theme mix, time,
// light) are referenced by every material so one write updates them all.
const shared = {
  uMix: { value: 0 }, // 0 = classic, 1 = sci-fi
  uTime: { value: 0 },
  uAmbient: { value: 0.72 },
  uLightDir: { value: new THREE.Vector3(0.3, 1, 0.45).normalize() },
  uWipeColor: { value: new THREE.Color('#5ff2ff') },
};

const cardVert = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const cardFrag = /* glsl */ `
  uniform sampler2D mapA;
  uniform sampler2D mapB;
  uniform float uMix;
  uniform float uTime;
  uniform float uAmbient;
  uniform vec3 uLightDir;
  uniform vec3 uWipeColor;
  uniform float uHighlight;
  uniform vec3 uHighlightColor;
  uniform float uDim;
  varying vec2 vUv;
  varying vec3 vWorld;
  varying vec3 vNormal;

  void main() {
    vec4 a = texture2D(mapA, vUv);
    vec4 b = texture2D(mapB, vUv);
    // The theme change sweeps across the table as a glowing scan line.
    float sweep = uMix * 18.0 - 9.0;
    float edge = vWorld.x + vWorld.z * 0.35 + sin(vUv.y * 38.0 + uTime * 4.0) * 0.04;
    float m = smoothstep(edge - 0.06, edge + 0.06, sweep);
    vec3 col = mix(a.rgb, b.rgb, m);
    float inTransition = step(0.001, uMix) * step(uMix, 0.999);
    float band = 1.0 - smoothstep(0.0, 0.16, abs(edge - sweep));
    col += uWipeColor * band * 1.6 * inTransition;

    float diff = max(dot(normalize(vNormal), uLightDir), 0.0);
    col *= uAmbient + (1.0 - uAmbient) * diff;

    // Playable cards get a pulsing rim.
    vec2 d = abs(vUv - 0.5) * vec2(1.0, 1.552);
    float rimDist = min(0.5 - d.x, 0.776 - d.y);
    float rim = 1.0 - smoothstep(0.0, 0.05, rimDist);
    float pulse = 0.65 + 0.35 * sin(uTime * 4.0);
    col = mix(col, uHighlightColor, rim * uHighlight * pulse);

    col *= 1.0 - uDim * 0.5;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

function faceMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: cardVert,
    fragmentShader: cardFrag,
    toneMapped: false,
    uniforms: {
      mapA: { value: null },
      mapB: { value: null },
      uHighlight: { value: 0 },
      uHighlightColor: { value: new THREE.Color('#ffd76a') },
      uDim: { value: 0 },
      ...shared,
    },
  });
}

// ------------------------------------------------------------------ tables
function woodTexture() {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 1502;
  const ctx = c.getContext('2d');
  const W = c.width;
  const H = c.height;
  ctx.fillStyle = '#3b2213';
  ctx.fillRect(0, 0, W, H);
  // Planks and grain.
  let s = 11;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const plank = H / 9;
  for (let p = 0; p < 10; p++) {
    const y0 = p * plank;
    ctx.fillStyle = `hsl(24, ${38 + rnd() * 10}%, ${16 + rnd() * 6}%)`;
    ctx.fillRect(0, y0, W, plank);
    for (let i = 0; i < 60; i++) {
      const y = y0 + rnd() * plank;
      ctx.strokeStyle = `rgba(${rnd() < 0.5 ? '20,10,4' : '120,72,36'},${0.12 + rnd() * 0.18})`;
      ctx.lineWidth = 1 + rnd() * 2.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= W; x += 64) ctx.lineTo(x, y + Math.sin(x * 0.004 + i) * 4 + (rnd() - 0.5) * 2);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, y0, W, 3);
  }
  // Felt mat.
  const fx = (x) => (x / TABLE_W + 0.5) * W;
  const fz = (z) => (z / TABLE_D + 0.5) * H;
  const x0 = fx(-5.6);
  const x1 = fx(5.6);
  const y0 = fz(-4.3);
  const y1 = fz(4.9);
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 30;
  ctx.fillStyle = '#145232';
  ctx.beginPath();
  ctx.roundRect(x0, y0, x1 - x0, y1 - y0, 60);
  ctx.fill();
  ctx.restore();
  const felt = ctx.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, (x1 - x0) * 0.6);
  felt.addColorStop(0, '#1d7246');
  felt.addColorStop(1, '#0f4428');
  ctx.fillStyle = felt;
  ctx.beginPath();
  ctx.roundRect(x0, y0, x1 - x0, y1 - y0, 60);
  ctx.fill();
  ctx.save();
  ctx.clip();
  for (let i = 0; i < 40000; i++) {
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.04)';
    ctx.fillRect(x0 + rnd() * (x1 - x0), y0 + rnd() * (y1 - y0), 2, 2);
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(226,179,60,0.55)';
  ctx.setLineDash([14, 10]);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(x0 + 22, y0 + 22, x1 - x0 - 44, y1 - y0 - 44, 44);
  ctx.stroke();
  ctx.setLineDash([]);
  // Gold-leaf lettering by the deck.
  ctx.fillStyle = 'rgba(226,179,60,0.35)';
  ctx.font = '700 44px "Cinzel", Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('BRISCOLA', fx(0), fz(1.75));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function gridTexture(emissive) {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 1502;
  const ctx = c.getContext('2d');
  const W = c.width;
  const H = c.height;
  const fx = (x) => (x / TABLE_W + 0.5) * W;
  const fz = (z) => (z / TABLE_D + 0.5) * H;
  ctx.fillStyle = emissive ? '#000000' : '#070b16';
  ctx.fillRect(0, 0, W, H);
  if (!emissive) {
    const g = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.5);
    g.addColorStop(0, '#111c36');
    g.addColorStop(1, '#03050b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  const k = emissive ? 1 : 0.5;
  // Fine grid.
  ctx.strokeStyle = `rgba(56,232,255,${0.16 * k})`;
  ctx.lineWidth = 1.5;
  const step = W / TABLE_W / 2;
  for (let x = 0; x < W; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y < H; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  // Play-field outline.
  ctx.strokeStyle = `rgba(56,232,255,${0.8 * k})`;
  ctx.lineWidth = 4;
  ctx.beginPath();
  const x0 = fx(-5.6);
  const x1 = fx(5.6);
  const y0 = fz(-4.3);
  const y1 = fz(4.9);
  const ch = 50;
  ctx.moveTo(x0 + ch, y0);
  ctx.lineTo(x1 - ch, y0);
  ctx.lineTo(x1, y0 + ch);
  ctx.lineTo(x1, y1 - ch);
  ctx.lineTo(x1 - ch, y1);
  ctx.lineTo(x0 + ch, y1);
  ctx.lineTo(x0, y1 - ch);
  ctx.lineTo(x0, y0 + ch);
  ctx.closePath();
  ctx.stroke();
  // Zones: stock, trick, piles.
  const zone = (x, z, w, d, color) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    const px = fx(x - w / 2);
    const py = fz(z - d / 2);
    const pw = (w / TABLE_W) * W;
    const pd = (d / TABLE_D) * H;
    const b = 18;
    for (const [cx, cy, dx, dy] of [[px, py, 1, 1], [px + pw, py, -1, 1], [px, py + pd, 1, -1], [px + pw, py + pd, -1, -1]]) {
      ctx.beginPath();
      ctx.moveTo(cx + dx * b, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + dy * b);
      ctx.stroke();
    }
  };
  zone(-3.7, -0.2, 2.2, 2.0, `rgba(255,198,64,${0.9 * k})`);
  zone(4.1, 1.6, 1.4, 1.9, `rgba(112,255,106,${0.9 * k})`);
  zone(4.1, -2.0, 1.4, 1.9, `rgba(255,79,176,${0.9 * k})`);
  ctx.strokeStyle = `rgba(56,232,255,${0.7 * k})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(fx(0.05), fz(0.1), (1.6 / TABLE_W) * W, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = '700 30px "Orbitron", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = `rgba(56,232,255,${0.6 * k})`;
  ctx.fillText('ENGAGEMENT ZONE', fx(0.05), fz(1.95));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// ------------------------------------------------------------------- tween
const ease = {
  outCubic: (t) => 1 - (1 - t) ** 3,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outBack: (t) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2,
};

// ---------------------------------------------------------------- the view
export class TableView {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
    this.clock = new THREE.Clock();
    this.cards = new Map(); // id -> card view
    this.themesLoaded = new Set();
    this.tweens = [];
    this.hovered = null;
    this.pickable = new Set();
    this.onPick = null;
    this.mix = 0;
    this.mixTarget = 0;
    this.mixFrom = 0;
    this.mixStart = 0;
    this.themeDuration = 1.6;

    this._buildTable();
    this._buildLights();
    this._buildSciFiExtras();
    this._buildComposer();
    this._bindPointer();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.renderer.setAnimationLoop(() => this._frame());
  }

  // --------------------------------------------------------------- building
  _buildTable() {
    const geo = new THREE.PlaneGeometry(TABLE_W, TABLE_D);
    this.tableClassic = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.85, metalness: 0.0 }),
    );
    this.tableClassic.rotation.x = -Math.PI / 2;
    this.tableClassic.receiveShadow = true;
    this.scene.add(this.tableClassic);

    this.tableSciFi = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        map: gridTexture(false),
        emissiveMap: gridTexture(true),
        emissive: new THREE.Color('#ffffff'),
        emissiveIntensity: 1.2,
        roughness: 0.35,
        metalness: 0.6,
        transparent: true,
        opacity: 0,
      }),
    );
    this.tableSciFi.rotation.x = -Math.PI / 2;
    this.tableSciFi.position.y = 0.002;
    this.tableSciFi.receiveShadow = true;
    this.scene.add(this.tableSciFi);

    this.bgClassic = new THREE.Color('#140b06');
    this.bgSciFi = new THREE.Color('#02030a');
    this.scene.background = this.bgClassic.clone();
  }

  _buildLights() {
    this.hemi = new THREE.HemisphereLight(0xfff0d8, 0x2a1a0e, 1.1);
    this.scene.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xffe2b8, 2.4);
    this.key.position.set(3, 12, 6);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    const sc = this.key.shadow.camera;
    sc.left = -8;
    sc.right = 8;
    sc.top = 7;
    sc.bottom = -7;
    sc.near = 1;
    sc.far = 30;
    this.key.shadow.bias = -0.0004;
    this.key.shadow.radius = 4;
    this.scene.add(this.key);
    // Accent rim lights only used by the sci-fi look.
    this.rimA = new THREE.PointLight(0x38e8ff, 0, 18, 1.5);
    this.rimA.position.set(-6, 3, 2);
    this.rimB = new THREE.PointLight(0xff4fb0, 0, 18, 1.5);
    this.rimB.position.set(6, 3, -2);
    this.scene.add(this.rimA, this.rimB);
    this.lightsClassic = { hemi: new THREE.Color(0xfff0d8), ground: new THREE.Color(0x2a1a0e), key: new THREE.Color(0xffe2b8), hemiI: 1.1, keyI: 2.4 };
    this.lightsSciFi = { hemi: new THREE.Color(0x7090ff), ground: new THREE.Color(0x05060f), key: new THREE.Color(0xb8d8ff), hemiI: 0.6, keyI: 1.4 };
  }

  _buildSciFiExtras() {
    this.scifi = new THREE.Group();
    this.scene.add(this.scifi);
    // Star field.
    const n = 1500;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 40 + Math.random() * 40;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(Math.random() * 0.9 + 0.1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.cos(ph) - 4;
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th) - 20;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(
      sg,
      new THREE.PointsMaterial({ color: 0xbfe6ff, size: 0.18, transparent: true, opacity: 0, depthWrite: false }),
    );
    this.scifi.add(this.stars);
    // Rotating holo rings around the trick zone.
    const ringMat = (color, o) =>
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, userData: { o } });
    this.rings = [];
    const mk = (rIn, rOut, segs, thetaLen, color, o, y) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(rIn, rOut, segs, 1, 0, thetaLen), ringMat(color, o));
      m.rotation.x = -Math.PI / 2;
      m.position.set(0.05, y, 0.1);
      this.scifi.add(m);
      this.rings.push(m);
      return m;
    };
    mk(1.75, 1.8, 96, Math.PI * 1.5, 0x38e8ff, 0.9, 0.01);
    mk(1.9, 1.94, 96, Math.PI * 0.6, 0xff4fb0, 0.9, 0.012);
    mk(2.06, 2.08, 96, Math.PI * 2, 0x38e8ff, 0.35, 0.014);
    // Scan line sweeping across the table.
    this.scan = new THREE.Mesh(new THREE.PlaneGeometry(11.2, 0.04), ringMat(0x38e8ff, 0.6));
    this.scan.rotation.x = -Math.PI / 2;
    this.scan.position.y = 0.02;
    this.scifi.add(this.scan);
  }

  _buildComposer() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0, 0.5, 0.55);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloom.setSize(w / 2, h / 2);
    const aspect = w / h;
    this.camera.aspect = aspect;
    this.portrait = aspect < 0.9;
    // Keep the play field (about 11.5 x 10 units) in view at any aspect.
    const vt = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const needW = 6.1 / (vt * aspect);
    const needH = 6.4 / vt;
    const dist = Math.max(needW, needH) * (this.portrait ? 0.92 : 1);
    const dir = new THREE.Vector3(0, 1.25, 1).normalize();
    this.lookAt = new THREE.Vector3(0, 0, this.portrait ? 0.9 : 0.55);
    this.camera.position.copy(this.lookAt).addScaledVector(dir, dist);
    this.camera.lookAt(this.lookAt);
    this.camera.updateProjectionMatrix();
    this.onResize?.();
  }

  // ------------------------------------------------------------------ cards
  // Textures are built lazily per theme and cached.
  _texture(key, draw) {
    this._tex ??= new Map();
    if (!this._tex.has(key)) {
      const t = new THREE.CanvasTexture(draw());
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      this._tex.set(key, t);
    }
    return this._tex.get(key);
  }

  faceTexture(card, theme) {
    return this._texture(`${theme}:${card.id}`, () => drawFace(card, theme));
  }

  backTexture(theme) {
    return this._texture(`${theme}:back`, () => drawBack(theme));
  }

  // Throw away cached art (after web fonts arrive, for instance).
  rebuildTextures() {
    for (const t of this._tex?.values() ?? []) t.dispose();
    this._tex = new Map();
    for (const c of this.cards.values()) this._applyTextures(c);
  }

  // A deck's art is only drawn and uploaded once that theme is first used;
  // until then the shader samples the other deck in both slots.
  _applyTextures(c) {
    const has = this.themesLoaded;
    const a = has.has('classic') ? 'classic' : 'scifi';
    const b = has.has('scifi') ? 'scifi' : 'classic';
    c.front.material.uniforms.mapA.value = this.faceTexture(c.card, a);
    c.front.material.uniforms.mapB.value = this.faceTexture(c.card, b);
    c.back.material.uniforms.mapA.value = this.backTexture(a);
    c.back.material.uniforms.mapB.value = this.backTexture(b);
  }

  createCards(deck) {
    this._frontGeo ??= cardGeometry(false);
    this._backGeo ??= cardGeometry(true);
    if (!this.themesLoaded.size) this.themesLoaded.add('classic');
    for (const card of deck) {
      const group = new THREE.Group();
      const front = new THREE.Mesh(this._frontGeo, faceMaterial());
      front.position.z = 0.002;
      const back = new THREE.Mesh(this._backGeo, faceMaterial());
      back.rotation.y = Math.PI;
      back.position.z = -0.002;
      front.castShadow = back.castShadow = true;
      group.add(front, back);
      group.userData.id = card.id;
      front.userData.id = back.userData.id = card.id;
      const c = {
        card,
        group,
        front,
        back,
        pos: new THREE.Vector3(),
        rot: new THREE.Vector3(),
        hover: 0,
        lift: 0,
        tween: null,
      };
      this._applyTextures(c);
      this.scene.add(group);
      this.cards.set(card.id, c);
    }
  }

  get(id) {
    return this.cards.get(id);
  }

  // Instantly place a card.
  place(id, pos, rot) {
    const c = this.cards.get(id);
    c.tween?.resolve();
    c.tween = null;
    c.pos.set(pos.x, pos.y, pos.z);
    c.rot.set(rot.x, rot.y, rot.z);
    c.lift = 0;
  }

  // Animate a card to a pose. `arc` lifts it mid-flight.
  move(id, pos, rot, { duration = 0.5, delay = 0, arc = 0.6, easing = 'inOutCubic' } = {}) {
    const c = this.cards.get(id);
    c.tween?.resolve(); // a superseded move still settles its promise
    return new Promise((resolve) => {
      c.tween = {
        from: { pos: c.pos.clone(), rot: c.rot.clone() },
        to: { pos: new THREE.Vector3(pos.x, pos.y, pos.z), rot: new THREE.Vector3(rot.x, rot.y, rot.z) },
        start: this.clock.elapsedTime + delay,
        duration,
        arc,
        easing: ease[easing],
        resolve,
      };
    });
  }

  setPickable(ids) {
    this.pickable = new Set(ids);
    for (const c of this.cards.values()) c.front.material.uniforms.uHighlight.value = this.pickable.has(c.card.id) ? 0.55 : 0;
    if (this.hovered && !this.pickable.has(this.hovered)) this.hovered = null;
    this.renderer.domElement.style.cursor = '';
  }

  setDim(id, on) {
    const c = this.cards.get(id);
    if (c) c.front.material.uniforms.uDim.value = on ? 1 : 0;
  }

  setWinnerGlow(ids, color) {
    for (const id of ids) {
      const u = this.cards.get(id).front.material.uniforms;
      u.uHighlightColor.value.set(color);
      u.uHighlight.value = 1;
    }
  }

  clearGlow() {
    for (const c of this.cards.values()) {
      c.front.material.uniforms.uHighlight.value = 0;
      c.front.material.uniforms.uHighlightColor.value.set(this.mixTarget ? '#5ff2ff' : '#ffd76a');
    }
  }

  // ------------------------------------------------------------------ theme
  setTheme(theme, instant = false) {
    if (!this.themesLoaded.has(theme)) {
      this.themesLoaded.add(theme);
      for (const c of this.cards.values()) this._applyTextures(c);
    }
    const target = theme === 'scifi' ? 1 : 0;
    this.mixFrom = this.mix;
    this.mixTarget = target;
    this.mixStart = this.clock.elapsedTime;
    if (instant) this.mix = this.mixFrom = target;
    const hl = target ? '#5ff2ff' : '#ffd76a';
    for (const c of this.cards.values()) c.front.material.uniforms.uHighlightColor.value.set(hl);
  }

  _applyMix(m) {
    // Smooth for lights and backdrop, linear for the shader sweep.
    const k = THREE.MathUtils.smoothstep(m, 0.15, 0.85);
    shared.uMix.value = m;
    shared.uAmbient.value = THREE.MathUtils.lerp(0.72, 0.95, k);
    this.tableSciFi.material.opacity = k;
    this.tableClassic.visible = k < 0.999;
    this.scene.background.copy(this.bgClassic).lerp(this.bgSciFi, k);
    const A = this.lightsClassic;
    const B = this.lightsSciFi;
    this.hemi.color.copy(A.hemi).lerp(B.hemi, k);
    this.hemi.groundColor.copy(A.ground).lerp(B.ground, k);
    this.hemi.intensity = THREE.MathUtils.lerp(A.hemiI, B.hemiI, k);
    this.key.color.copy(A.key).lerp(B.key, k);
    this.key.intensity = THREE.MathUtils.lerp(A.keyI, B.keyI, k);
    this.rimA.intensity = this.rimB.intensity = 30 * k;
    this.stars.material.opacity = k;
    for (const r of this.rings) r.material.opacity = r.material.userData.o * k;
    this.scan.material.opacity = 0.6 * k;
    this.scifi.visible = k > 0.001;
    this.bloom.strength = 0.75 * k;
    this.bloom.enabled = k > 0.001;
    this.renderer.toneMappingExposure = THREE.MathUtils.lerp(1.0, 1.1, k);
  }

  // ---------------------------------------------------------------- picking
  _bindPointer() {
    const el = this.renderer.domElement;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const pick = (e) => {
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, this.camera);
      const meshes = [];
      for (const id of this.pickable) {
        const c = this.cards.get(id);
        meshes.push(c.front, c.back);
      }
      const hit = ray.intersectObjects(meshes, false)[0];
      return hit ? hit.object.userData.id : null;
    };
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      this.hovered = pick(e);
      el.style.cursor = this.hovered ? 'pointer' : '';
    });
    el.addEventListener('pointerleave', () => (this.hovered = null));
    el.addEventListener('click', (e) => {
      const id = pick(e);
      if (id) this.onPick?.(id);
    });
  }

  // ------------------------------------------------------------------ frame
  _frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;
    shared.uTime.value = t;

    if (this.mix !== this.mixTarget) {
      const p = Math.min(1, (t - this.mixStart) / this.themeDuration);
      this.mix = THREE.MathUtils.lerp(this.mixFrom, this.mixTarget, p);
      if (p >= 1) this.mix = this.mixTarget;
    }
    this._applyMix(this.mix);

    if (this.scifi.visible) {
      this.rings[0].rotation.z = t * 0.4;
      this.rings[1].rotation.z = -t * 0.7;
      this.scan.position.z = -4.2 + ((t * 1.6) % 9.1);
      this.stars.rotation.y = t * 0.005;
    }

    for (const c of this.cards.values()) {
      const tw = c.tween;
      if (tw && t >= tw.start) {
        const p = Math.min(1, (t - tw.start) / tw.duration);
        const e = tw.easing(p);
        c.pos.lerpVectors(tw.from.pos, tw.to.pos, e);
        c.rot.lerpVectors(tw.from.rot, tw.to.rot, e);
        c.lift = Math.sin(Math.PI * p) * tw.arc;
        if (p >= 1) {
          c.tween = null;
          c.lift = 0;
          tw.resolve();
        }
      }
      const target = this.hovered === c.card.id ? 1 : 0;
      c.hover += (target - c.hover) * Math.min(1, dt * 14);
      const g = c.group;
      g.position.copy(c.pos);
      g.position.y += c.lift + c.hover * 0.35;
      g.position.z -= c.hover * 0.25;
      g.rotation.set(c.rot.x + c.hover * 0.12, c.rot.y, c.rot.z * (1 - c.hover));
      g.scale.setScalar(1 + c.hover * 0.08);
    }

    if (this.bloom.enabled) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }
}
