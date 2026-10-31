import * as THREE from 'three';
import { OutlineEffect } from 'three/addons/effects/OutlineEffect.js';

const Q = new URLSearchParams(location.search);
const GOD = Q.has('god');
const IS_MOBILE = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent);
const $ = id => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const LANES = [-2.2, 0, 2.2];
const OUTLINE = [0x3a / 255, 0x1d / 255, 0x08 / 255];

// ---------- Renderer ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
let pixelRatio = Math.min(devicePixelRatio, IS_MOBILE ? 1.5 : 2);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const outline = new OutlineEffect(renderer, { defaultThickness: 0.0045, defaultColor: OUTLINE, defaultAlpha: 1 });
let useOutline = true;

const scene = new THREE.Scene();
const FOG_COL = new THREE.Color(0xffe9c4);
scene.background = new THREE.Color(0xbfdcf0);
scene.fog = new THREE.Fog(FOG_COL, 70, 230);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 900);
camera.position.set(0, 4.2, 7.5);

// ---------- Textures ----------
const loader = new THREE.TextureLoader();
const aniso = renderer.capabilities.getMaxAnisotropy();
const NAMES_ALL = ['tex_sandstone.jpg', 'tex_cobble.jpg', 'tex_facade1.jpg', 'tex_facade2.jpg', 'bg_jerusalem.jpg', ...['run0', 'run1', 'jump', 'slide', 'coin', 'scroll', 'lamp', 'sandals', 'shield', 'magnet', 'camel', 'donkey', 'cart', 'baskets', 'olive', 'palm', 'stall', 'pots'].map(n => n + '.png')];
const CACHE = {};
await Promise.all(NAMES_ALL.map(async n => { CACHE[n] = await loader.loadAsync('assets/' + n); }));
function load(name, rx = 1, ry = 1) {
  const t = CACHE[name]; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
  if (rx !== 1 || ry !== 1) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); }
  return t;
}
function makeCanvas(size, draw) { const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size); return c; }
function cloth(c1, c2) {
  const t = new THREE.CanvasTexture(makeCanvas(256, (g, s) => {
    for (let x = 0; x < s; x += 32) { g.fillStyle = (x / 32) % 2 ? c1 : c2; g.fillRect(x, 0, 32, s); }
    g.fillStyle = 'rgba(255,255,255,.18)'; for (let x = 0; x < s; x += 32) g.fillRect(x + 4, 0, 6, s);
    g.fillStyle = 'rgba(58,29,8,.25)'; g.fillRect(0, s - 18, s, 18);
  })); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 1); return t;
}
const TX = {
  sand: load('tex_sandstone.jpg', 1, 1), cobble: load('tex_cobble.jpg', 3, 80),
  facades: [load('tex_facade1.jpg'), load('tex_facade2.jpg')], bg: load('bg_jerusalem.jpg'),
};
const SPR = {};
for (const n of ['run0', 'run1', 'jump', 'slide', 'coin', 'scroll', 'lamp', 'sandals', 'shield', 'magnet', 'camel', 'donkey', 'cart', 'baskets', 'olive', 'palm', 'stall', 'pots']) SPR[n] = load(n + '.png');
function sandTex(w, h) { const t = TX.sand.clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(Math.max(1, w / 3.5), Math.max(1, h / 3.5)); t.needsUpdate = true; return t; }

// Toon gradient (soft 3-band painted shading)
const grad = new THREE.DataTexture(new Uint8Array([150, 150, 150, 255, 205, 205, 205, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true;
const toon = (o) => new THREE.MeshToonMaterial({ gradientMap: grad, ...o });
const noOutline = m => { m.userData.outlineParameters = { visible: false }; return m; };

// ---------- Materials ----------
const M = {
  sand: toon({ map: sandTex(4, 4) }),
  sandW: toon({ map: sandTex(4, 4), color: 0xfff4e0 }),
  sandD: toon({ map: sandTex(4, 2), color: 0xf0cf98 }),
  ground: toon({ map: TX.cobble }),
  wood: toon({ color: 0xc98a4b }), darkWood: toon({ color: 0x6b4a2e }),
  cloths: [cloth('#ff6040', '#fff4cf'), cloth('#3f7fc9', '#fff4cf'), cloth('#ffd34d', '#ff7a7a'), cloth('#5aa86a', '#ffe066')].map(t => toon({ map: t, side: THREE.DoubleSide })),
  gold: toon({ color: 0xffd34d, emissive: 0x6a3c00, emissiveIntensity: 0.3 }),
  lantern: noOutline(new THREE.MeshBasicMaterial({ color: 0xffe066 })),
  rope: new THREE.LineBasicMaterial({ color: 0x6b4a2e }),
};
function spriteMat(tex) { return noOutline(new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, fog: true, toneMapped: false })); }
const planeG = new THREE.PlaneGeometry(1, 1); planeG.translate(0, 0.5, 0);
const planeC = new THREE.PlaneGeometry(1, 1);
// billboard of given height (keeps texture aspect once loaded)
function billboard(name, h, parent, x = 0, z = 0, center = false) {
  const m = new THREE.Mesh(center ? planeC : planeG, spriteMat(SPR[name])); m.castShadow = true;
  const img = SPR[name].image; const asp = img && img.width ? img.width / img.height : 0.75;
  m.scale.set(h * asp, h, 1); m.userData.h = h; m.position.set(x, 0, z);
  if (!img || !img.width) SPR[name].onUpdate = () => { const i = SPR[name].image; m.scale.x = h * i.width / i.height; };
  billboards.push(m); if (parent) parent.add(m); return m;
}
const billboards = [];
function fixAspects() { for (const m of billboards) { const i = m.material.map.image; if (i && i.width) m.scale.x = m.userData.h * i.width / i.height; } }

// ---------- Lighting ----------
const sunDir = new THREE.Vector3(-0.5, 0.75, 0.45).normalize();
scene.add(new THREE.HemisphereLight(0xfff6dc, 0xd9a86a, 1.5));
const sun = new THREE.DirectionalLight(0xfff0d0, 2.0);
sun.castShadow = true;
sun.shadow.mapSize.set(IS_MOBILE ? 1024 : 2048, IS_MOBILE ? 1024 : 2048);
const sc = sun.shadow.camera; sc.left = -18; sc.right = 18; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 140;
sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
scene.add(sun, sun.target);
sun.target.position.set(0, 0, -20); sun.position.copy(sun.target.position).addScaledVector(sunDir, 60);

// ---------- Painted backdrop (Jerusalem + Temple) ----------
const skyMat = noOutline(new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `varying vec3 vP; void main(){ float h=vP.y; vec3 c=mix(vec3(1.,.93,.78), vec3(.62,.80,.95), smoothstep(0.,.45,h)); gl_FragColor=vec4(pow(c,vec3(2.2)),1.); }` }));
const sky = new THREE.Mesh(new THREE.SphereGeometry(700, 24, 12), skyMat); scene.add(sky);
const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(560, 315), noOutline(new THREE.MeshBasicMaterial({ map: TX.bg, fog: false })));
backdrop.position.set(0, 95, -330); sky.renderOrder = -2; scene.add(backdrop);

// ---------- Ground ----------
const ground = new THREE.Mesh(new THREE.PlaneGeometry(10, 300), M.ground);
ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, -130); ground.receiveShadow = true; scene.add(ground);
const sideGround = new THREE.Mesh(new THREE.PlaneGeometry(400, 600), noOutline(toon({ color: 0xe9c97e })));
sideGround.rotation.x = -Math.PI / 2; sideGround.position.set(0, -0.02, -200); sideGround.receiveShadow = true; scene.add(sideGround);
for (const s of [-1, 1]) { const g = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 300), M.sandD); g.position.set(s * 4.85, 0.11, -130); g.receiveShadow = true; scene.add(g); }

// ---------- Helpers ----------
function mesh(geo, mat, x = 0, y = 0, z = 0, parent, shadow = true) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
  if (shadow) { m.castShadow = true; m.receiveShadow = true; }
  if (parent) parent.add(m); return m;
}
const G = { box: new THREE.BoxGeometry(1, 1, 1), sph: new THREE.SphereGeometry(0.5, 16, 12) };
function rbox(w, h, d, r = 0.12) { // chunky rounded box
  const sh = new THREE.Shape(); const x = -w / 2, y = -h / 2; r = Math.min(r, w / 2, h / 2);
  sh.moveTo(x + r, y); sh.lineTo(x + w - r, y); sh.quadraticCurveTo(x + w, y, x + w, y + r); sh.lineTo(x + w, y + h - r); sh.quadraticCurveTo(x + w, y + h, x + w - r, y + h); sh.lineTo(x + r, y + h); sh.quadraticCurveTo(x, y + h, x, y + h - r); sh.lineTo(x, y + r); sh.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(sh, { depth: d - 2 * r, bevelEnabled: true, bevelSize: r, bevelThickness: r, bevelSegments: 3, curveSegments: 4 });
  g.translate(0, 0, -(d - 2 * r) / 2);
  // planar UVs by world size
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) { const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)); uv.setXY(i, ax > 0.5 ? p.getZ(i) / 3.5 : p.getX(i) / 3.5, ay > 0.5 ? p.getZ(i) / 3.5 : p.getY(i) / 3.5); }
  return g;
}
function boxM(w, h, d, mat, x, y, z, p, sh = true, r) { return mesh(rbox(w, h, d, r ?? Math.min(0.15, Math.min(w, h, d) * 0.25)), mat, x, y, z, p, sh); }

// ---------- Street decor ----------
const SEG_LEN = 14, SEG_N = 15;
const houseSand = toon({ map: (() => { const t = sandTex(1, 1); t.repeat.set(2.6, 2.6); return t; })() }), houseSandW = toon({ map: houseSand.map, color: 0xfff4e0 });
const sideMats = [houseSand, houseSandW, houseSand];
function buildHouse(side) {
  const g = new THREE.Group();
  const h = rand(7, 10), d = Math.min(12.5, h * rand(0.95, 1.15)), w = 7;
  const bx = side * (5.1 + w / 2);
  const facade = toon({ map: pick(TX.facades) });
  const s = pick(sideMats);
  // box material order: +x,-x,+y,-y,+z,-z -> street face is -x for right side, +x for left side
  const mats = [s, s, s, s, s, s]; mats[side > 0 ? 1 : 0] = facade;
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats); body.position.set(bx, h / 2, 0); body.castShadow = body.receiveShadow = true; g.add(body);
  if (side > 0) { /* mirror facade on -x face so it reads correctly */ }
  boxM(w + 0.4, 0.4, d + 0.4, M.sandD, bx, h + 0.2, 0, g);
  if (Math.random() < 0.35) { const dm = mesh(new THREE.SphereGeometry(2.2, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.sandW, bx, h + 0.4, 0, g); }
  return g;
}
function buildDecor(side, kind) {
  const g = buildHouse(side);
  const x = side * 4.75;
  if (kind === 'olive') billboard('olive', 4.6, g, side * 5.6, rand(-3, 3));
  if (kind === 'palm') billboard('palm', 6.5, g, side * 5.4, rand(-3, 3));
  if (kind === 'stall') billboard('stall', 3.2, g, x - side * 0.1, rand(-2, 2));
  if (kind === 'pots') billboard('pots', 1.5, g, x, rand(-4, 4));
  return g;
}
function buildArch(gate) {
  const g = new THREE.Group();
  const mat = gate ? M.sandD : M.sand;
  const pw = gate ? 2.6 : 1.2, ph = gate ? 5.5 : 4.4;
  for (const s of [-1, 1]) {
    boxM(pw, ph, gate ? 3 : 1.4, mat, s * (4.6 + pw / 2), ph / 2, 0, g);
    if (gate) { boxM(pw + 0.6, 4.5, 3.6, mat, s * (4.6 + pw / 2), ph + 2.25, 0, g); for (let k = -1; k <= 1; k++) boxM(0.7, 0.9, 0.7, mat, s * (4.6 + pw / 2) + k * 1.1, ph + 4.9, 1.4, g); }
  }
  const ring = mesh(new THREE.TorusGeometry(4.75, gate ? 0.75 : 0.5, 10, 32, Math.PI), mat, 0, ph, 0, g); ring.scale.z = gate ? 3.5 : 2.6;
  boxM(10.8 + (gate ? 4 : 0), gate ? 2.2 : 1.3, gate ? 3 : 1.4, mat, 0, ph + 4.75 + (gate ? 0.9 : 0.45), 0, g);
  if (gate) { for (let x = -6.6; x <= 6.6; x += 1.32) boxM(0.6, 0.7, 0.8, mat, x, ph + 6.4, 1.1, g); }
  const l = mesh(G.sph, M.lantern, 0, ph + (gate ? 3.2 : 3.6), gate ? 1.8 : 0.8, g, false); l.scale.setScalar(0.4);
  return g;
}
function buildBanners() {
  const g = new THREE.Group(); const y = rand(6, 7.5);
  const pts = []; for (let i = 0; i <= 12; i++) { const x = -5 + i * 10 / 12; pts.push(new THREE.Vector3(x, y - Math.sin(i / 12 * Math.PI) * 0.8, 0)); }
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), M.rope));
  const tri = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.3, 0, 0), new THREE.Vector3(0.3, 0, 0), new THREE.Vector3(0, -0.7, 0)]); tri.computeVertexNormals();
  const cols = [0xff6040, 0x3f7fc9, 0xffd34d, 0x5aa86a, 0xff7a7a].map(c => noOutline(new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })));
  for (let i = 1; i < 12; i++) { const f = new THREE.Mesh(tri, cols[i % cols.length]); f.position.copy(pts[i]); f.castShadow = true; g.add(f); }
  return g;
}
const segments = []; let gateCounter = 0;
const decorRoot = new THREE.Group(); scene.add(decorRoot);
const KINDS = ['none', 'olive', 'stall', 'palm', 'pots'];
for (let i = 0; i < SEG_N; i++) {
  const seg = { g: new THREE.Group(), L: [], R: [], arch: buildArch(false), gate: buildArch(true), banner: buildBanners() };
  for (const [arr, s] of [[seg.L, -1], [seg.R, 1]]) { for (const k of KINDS) arr.push(buildDecor(s, k)); arr.forEach(o => seg.g.add(o)); }
  seg.g.add(seg.arch, seg.gate, seg.banner);
  seg.g.position.z = 10 - i * SEG_LEN;
  randomizeSeg(seg, i < 2);
  decorRoot.add(seg.g); segments.push(seg);
}
function randomizeSeg(seg, plain) {
  const a = (Math.random() * KINDS.length) | 0, b = (Math.random() * KINDS.length) | 0;
  seg.L.forEach((o, k) => o.visible = k === a); seg.R.forEach((o, k) => o.visible = k === b);
  gateCounter++;
  const gate = !plain && gateCounter % 18 === 0;
  seg.gate.visible = gate; seg.arch.visible = !gate && !plain && Math.random() < 0.14;
  seg.banner.visible = !gate && !seg.arch.visible && Math.random() < 0.4;
}

// ---------- Player (painted billboard sprite) ----------
const player = new THREE.Group(); scene.add(player);
const P = {};
(function buildPlayer() {
  P.body = new THREE.Group(); player.add(P.body);
  P.sprite = new THREE.Mesh(planeG, spriteMat(SPR.run0)); P.sprite.castShadow = true; P.body.add(P.sprite);
  P.setFrame = (n, h) => { const t = SPR[n]; if (P.sprite.material.map !== t) { P.sprite.material.map = t; P.sprite.material.needsUpdate = true; } const i = t.image; P.sprite.scale.set(h * (i && i.width ? i.width / i.height : 0.6), h, 1); };
  P.shield = new THREE.Mesh(new THREE.SphereGeometry(1.3, 24, 16), noOutline(new THREE.MeshBasicMaterial({ color: 0x9fe0ff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false })));
  P.shield.position.y = 1.15; P.shield.visible = false; player.add(P.shield);
  P.magRing = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.06, 6, 40), noOutline(new THREE.MeshBasicMaterial({ color: 0xe05cff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending })));
  P.magRing.rotation.x = Math.PI / 2; P.magRing.position.y = 0.1; P.magRing.visible = false; player.add(P.magRing);
  P.blob = new THREE.Mesh(new THREE.CircleGeometry(0.6, 24), noOutline(new THREE.MeshBasicMaterial({ color: 0x3a1d08, transparent: true, opacity: 0.28, depthWrite: false })));
  P.blob.rotation.x = -Math.PI / 2; P.blob.position.y = 0.03; scene.add(P.blob);
})();

// ---------- Obstacles ----------
function spriteOb(name, h, box, extra = {}) {
  const g = new THREE.Group(); const b = billboard(name, h, g);
  const sh = new THREE.Mesh(new THREE.CircleGeometry(1, 20), P.blob.material); sh.rotation.x = -Math.PI / 2; sh.position.y = 0.02; sh.scale.set(box.hw * 1.1, box.hd * 0.9 + 0.3, 1); g.add(sh);
  g.userData.spr = b; return { g, box, ...extra };
}
const mkCart = () => spriteOb('cart', 1.9, { hw: 0.95, hd: 1.0, y0: 0, y1: 1.3 });
const mkBaskets = () => spriteOb('baskets', 1.75, { hw: 0.85, hd: 0.5, y0: 0, y1: 1.2 });
const mkCamel = () => spriteOb('camel', 3.4, { hw: 0.85, hd: 1.2, y0: 0, y1: 3.2 });
const mkDonkeyCart = () => spriteOb('donkey', 2.5, { hw: 0.95, hd: 2.0, y0: 0, y1: 1.4 }, { moving: true });
function mkBarrier() {
  const g = new THREE.Group();
  boxM(7, 0.85, 0.8, M.sandD, 0, 0.43, 0, g, true, 0.2);
  for (let x = -3; x <= 3; x += 1.5) boxM(0.8, 0.3, 0.9, M.sand, x, 0.98, 0, g, true, 0.12);
  for (const x of [-2.2, 0, 2.2]) billboard('pots', 0.9, g, x + 0.7, 0.45);
  return { g, box: { hw: 3.5, hd: 0.45, y0: 0, y1: 1.1 }, wide: true };
}
function mkAwning() {
  const g = new THREE.Group();
  for (const s of [-1, 1]) boxM(0.28, 2.8, 0.28, M.darkWood, s * 3.55, 1.4, 0, g, true, 0.1);
  boxM(7.4, 0.26, 0.3, M.wood, 0, 2.7, 0, g, true, 0.1); boxM(7.4, 0.2, 0.26, M.wood, 0, 1.28, 0, g, true, 0.08);
  const cl = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.3, 14, 2), pick(M.cloths)); cl.position.set(0, 1.95, 0.05); cl.castShadow = true; g.add(cl);
  const p = cl.geometry.attributes.position; for (let i = 0; i < p.count; i++) { if (p.getY(i) < 0) p.setY(i, p.getY(i) - Math.abs(Math.sin(p.getX(i) * 2.2)) * 0.18); } p.needsUpdate = true;
  noOutline(cl.material);
  return { g, box: { hw: 3.5, hd: 0.2, y0: 1.1, y1: 3 }, wide: true };
}
const OB_TYPES = { cart: mkCart, baskets: mkBaskets, barrier: mkBarrier, awning: mkAwning, camel: mkCamel, donkey: mkDonkeyCart };
const obPool = {}, obstacles = [];
for (const k in OB_TYPES) { obPool[k] = []; for (let i = 0; i < 6; i++) { const o = OB_TYPES[k](); o.type = k; o.g.visible = false; scene.add(o.g); obPool[k].push(o); } }
function spawnOb(type, lane, z) {
  const o = obPool[type].pop() || Object.assign(OB_TYPES[type](), { type });
  if (!o.g.parent) scene.add(o.g);
  o.lane = lane; o.x = o.wide ? 0 : LANES[lane]; o.z = z; o.hitFx = 0; o.g.visible = true; o.g.position.set(o.x, 0, z); obstacles.push(o); return o;
}

// ---------- Collectibles (painted icons) ----------
const PCOL = { sandals: 0xffb030, shield: 0x7fd0ff, magnet: 0xe05cff };
let _glow;
function glowTex() { if (_glow) return _glow; const c = makeCanvas(64, (g, s) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); }); _glow = new THREE.CanvasTexture(c); return _glow; }
const ISZ = { coin: 0.85, scroll: 0.95, lamp: 0.95, sandals: 1.1, shield: 1.1, magnet: 1.1 };
function mkItem(kind) {
  const g = new THREE.Group();
  if (kind !== 'coin') { const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: PCOL[kind] || 0xffe066, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8 })); glow.scale.setScalar(kind in PCOL ? 2.4 : 1.8); g.add(glow); }
  const b = billboard(kind, ISZ[kind], g, 0, 0, true); b.castShadow = false;
  g.userData.spr = b; return { g, kind };
}
const items = [];
const itemPool = { coin: [], scroll: [], lamp: [], sandals: [], shield: [], magnet: [] };
const ITEM_MK = k => mkItem(k);
for (let i = 0; i < 70; i++) { const c = mkItem('coin'); c.g.visible = false; scene.add(c.g); itemPool.coin.push(c); }
function spawnItem(kind, x, y, z) {
  const it = itemPool[kind].pop() || ITEM_MK(kind); it.kind = kind;
  if (!it.g.parent) scene.add(it.g);
  it.x = x; it.y = y; it.z = z; it.g.visible = true; it.g.position.set(x, y, z); it.phase = Math.random() * 6; it.mag = false; items.push(it); return it;
}
// ---------- Particles ----------
const PMAX = 600;
const pGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(PMAX * 3), pCol = new Float32Array(PMAX * 3), pSize = new Float32Array(PMAX);
const pVel = new Float32Array(PMAX * 3), pLife = new Float32Array(PMAX), pMaxLife = new Float32Array(PMAX), pBase = new Float32Array(PMAX);
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3)); pGeo.setAttribute('size', new THREE.BufferAttribute(pSize, 1));
const pMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
  uniforms: { map: { value: glowTex() }, scale: { value: innerHeight / 2 } },
  vertexShader: `attribute float size; varying vec3 vC; void main(){ vC = color; vec4 mv = modelViewMatrix*vec4(position,1.); gl_PointSize = size * 300. / -mv.z; gl_Position = projectionMatrix*mv; }`,
  fragmentShader: `uniform sampler2D map; varying vec3 vC; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC*t.a, t.a); }`
});
const points = new THREE.Points(pGeo, pMat); points.frustumCulled = false; scene.add(points);
let pIdx = 0;
function emit(x, y, z, n, color, speed = 4, size = 0.35, life = 0.7, up = 2) {
  const c = new THREE.Color(color);
  for (let k = 0; k < n; k++) {
    const i = pIdx = (pIdx + 1) % PMAX;
    pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
    const th = Math.random() * 6.28, ph = Math.random() * 3.14, s = speed * rand(0.4, 1);
    pVel[i * 3] = Math.cos(th) * Math.sin(ph) * s; pVel[i * 3 + 1] = Math.cos(ph) * s + up; pVel[i * 3 + 2] = Math.sin(th) * Math.sin(ph) * s;
    pCol[i * 3] = c.r; pCol[i * 3 + 1] = c.g; pCol[i * 3 + 2] = c.b;
    pLife[i] = pMaxLife[i] = life * rand(0.6, 1.2); pBase[i] = size * rand(0.6, 1.3);
  }
}
function updateParticles(dt, worldDz) {
  for (let i = 0; i < PMAX; i++) {
    if (pLife[i] <= 0) { pSize[i] = 0; continue; }
    pLife[i] -= dt;
    pVel[i * 3 + 1] -= 6 * dt;
    pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt + worldDz;
    pSize[i] = pBase[i] * Math.max(0, pLife[i] / pMaxLife[i]);
  }
  pGeo.attributes.position.needsUpdate = pGeo.attributes.color.needsUpdate = pGeo.attributes.size.needsUpdate = true;
}
// floating dust motes in sunbeams
const DM = 160; const dGeo = new THREE.BufferGeometry(); const dPos = new Float32Array(DM * 3);
for (let i = 0; i < DM; i++) { dPos[i * 3] = rand(-6, 6); dPos[i * 3 + 1] = rand(0.5, 7); dPos[i * 3 + 2] = rand(-80, 10); }
dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
const dust = new THREE.Points(dGeo, new THREE.PointsMaterial({ map: glowTex(), color: 0xffd9a0, size: 0.12, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
dust.frustumCulled = false; scene.add(dust);

// ---------- Audio (synthesized) ----------
const Sfx = {
  ctx: null, master: null, muted: localStorage.getItem('jr_muted') === '1', musicT: null,
  live: 0,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.6;
    this.hp = this.ctx.createBiquadFilter(); this.hp.type = 'highpass'; this.hp.frequency.value = 120; this.hp.Q.value = 0.7;
    this.master.connect(this.hp); this.hp.connect(this.ctx.destination);
    this.music = this.ctx.createGain(); this.music.gain.value = 0.32; this.music.connect(this.master);
    const len = this.ctx.sampleRate; this.noise = this.ctx.createBuffer(1, len, len); const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  },
  _track(node, ...chain) { this.live++; node.onended = () => { this.live--; node.disconnect(); chain.forEach(n => n.disconnect()); }; },
  tone(f, dur, type = 'sine', vol = 0.2, f2, delay = 0, dest) {
    if (!this.ctx) return; const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.02);
    o.connect(g); g.connect(dest || this.master); o.start(t); o.stop(t + dur + 0.04); this._track(o, g);
  },
  pluck(f, t, vol = 0.12, dur = 0.5) { // lyre/oud-like: bright attack, filtered decay, short
    const c = this.ctx, o1 = c.createOscillator(), o2 = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain();
    o1.type = 'triangle'; o2.type = 'sawtooth'; o1.frequency.value = f; o2.frequency.value = f * 1.003;
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(f * 7, t); lp.frequency.exponentialRampToValueAtTime(f * 1.5, t + dur * 0.6); lp.Q.value = 2;
    const g2 = c.createGain(); g2.gain.value = 0.25;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.02);
    o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(this.music);
    o1.start(t); o2.start(t); o1.stop(t + dur + 0.05); o2.stop(t + dur + 0.05); this._track(o1, lp, g); this._track(o2, g2);
  },
  drum(t, f, q, vol, dur) { // soft hand percussion (filtered noise tap)
    const c = this.ctx, s = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bp); bp.connect(g); g.connect(this.music); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02); this._track(s, bp, g);
  },
  noiseHit(dur, f, vol = 0.3, type = 'lowpass', f2) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource(); s.buffer = this.noise; const fl = this.ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(this.master); s.start(t); s.stop(t + dur + 0.02); this._track(s, fl, g);
  },
  coin() { this.tone(1318, 0.12, 'sine', 0.12); this.tone(1976, 0.22, 'sine', 0.1, null, 0.06); },
  jump() { this.noiseHit(0.25, 600, 0.15, 'bandpass', 2500); this.tone(220, 0.2, 'triangle', 0.08, 440); },
  slide() { this.noiseHit(0.35, 2000, 0.15, 'bandpass', 400); },
  lane() { this.noiseHit(0.12, 1500, 0.07, 'bandpass', 3000); },
  item() { [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.1, null, i * 0.06)); },
  power() { [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(f, 0.35, 'sawtooth', 0.05, null, i * 0.07)); this.tone(1046, 0.8, 'sine', 0.1, null, 0.35); },
  crash() { this.noiseHit(0.6, 900, 0.5, 'lowpass', 80); this.tone(220, 0.4, 'triangle', 0.1, 130); },
  shieldBreak() { this.noiseHit(0.4, 4000, 0.25, 'highpass', 800); this.tone(880, 0.4, 'sine', 0.12, 220); },
  setMuted(m) { this.muted = m; localStorage.setItem('jr_muted', m ? '1' : '0'); if (this.master) this.master.gain.value = m ? 0 : 0.6; },
  startMusic() {
    if (!this.ctx || this.musicT) return;
    // G major pentatonic, cheerful storybook tune; 8th notes at ~126 bpm, scheduled ahead
    const N = { G3: 196, A3: 220, B3: 246.9, D4: 293.7, E4: 329.6, G4: 392, A4: 440, B4: 493.9, D5: 587.3, E5: 659.3, G5: 784 };
    const mel = ['G4', 'B4', 'D5', 'B4', 'E5', 'D5', 'B4', 'A4', 'G4', 'A4', 'B4', 'D5', 'B4', 'A4', 'G4', '-',
                 'E4', 'G4', 'A4', 'B4', 'A4', 'G4', 'E4', 'D4', 'E4', 'G4', 'A4', 'B4', 'D5', 'E5', 'D5', '-',
                 'G5', 'E5', 'D5', 'B4', 'D5', 'B4', 'A4', 'G4', 'A4', 'B4', 'A4', 'G4', 'E4', 'D4', 'E4', '-',
                 'D4', 'E4', 'G4', 'A4', 'B4', 'D5', 'B4', 'A4', 'G4', 'B4', 'A4', 'E4', 'G4', '-', 'G4', '-'];
    const bass = ['G3', 'D4', 'E4', 'B3', 'A3', 'E4', 'D4', 'G3'];
    const step = 60 / 126 / 2; let i = 0, next = this.ctx.currentTime + 0.1;
    const tick = () => {
      while (next < this.ctx.currentTime + 0.3) {
        const n = mel[i % mel.length]; if (n !== '-') this.pluck(N[n], next, 0.1, 0.45);
        if (i % 4 === 0) this.pluck(N[bass[(i / 4 | 0) % bass.length]], next, 0.07, 0.6);
        if (i % 8 === 0 || i % 8 === 3) this.drum(next, 380, 1.2, 0.22, 0.12);   // dum
        if (i % 2 === 1) this.drum(next, 3500, 2, 0.08, 0.05);                   // tek
        if (i % 8 === 6) this.drum(next, 2200, 1.5, 0.12, 0.07);
        i++; next += step;
      }
    };
    tick(); this.musicT = setInterval(tick, 100);
  },
  stopMusic() { if (this.musicT) { clearInterval(this.musicT); this.musicT = null; } },
};

// ---------- Game state ----------
const S = {
  state: 'loading', lane: 1, x: 0, y: 0, vy: 0, sliding: 0, speed: 0, dist: 0, score: 0, coins: 0, mult: 1, runT: 0,
  power: { sandals: 0, shield: 0, magnet: 0 }, nextRow: 0, dead: 0, shake: 0, best: +localStorage.getItem('jr_best') || 0, invuln: 0,
};
const BASE_SPEED = 15, MAX_SPEED = 36, GRAV = 40, JUMP_V = 13.2;
const DUR = { sandals: 6, shield: 14, magnet: 10 };
const VERSES = [
  ['Pray for the peace of Jerusalem. Say, “May those who love you be secure.”', 'Psalm 122:6'],
  ['A huge cloud of witnesses is all around us. So let us throw off everything that stands in our way. Let us throw off any sin that holds on to us so tightly. And let us keep on running the race marked out for us. Let us keep looking to Jesus. He is the one who started this journey of faith. And he is the one who completes the journey of faith. He paid no attention to the shame of the cross. He suffered there because of the joy he was looking forward to. Then he sat down at the right hand of the throne of God.', 'Hebrews 12:1-2'],
  ['I have fought the good fight. I have finished the race. I have kept the faith.', '2 Timothy 4:7'],
  ['But those who trust in the Lord will receive new strength. They will fly as high as eagles. They will run and not get tired. They will walk and not grow weak.', 'Isaiah 40:31'],
  ['Also, pick up the shield of faith. With it you can put out all the flaming arrows of the evil one.', 'Ephesians 6:16'],
  ['Your word is like a lamp that shows me the way. It is like a light that guides me.', 'Psalm 119:105'],
  ['Like the mountains around Jerusalem, the Lord is all around his people both now and forever.', 'Psalm 125:2'],
  ['Do not gather for yourselves riches on earth. Moths and rats can destroy them. Thieves can break in and steal them. Instead, gather for yourselves riches in heaven. There, moths and rats do not destroy them. There, thieves do not break in and steal them.', 'Matthew 6:19-20'],
  ['In a race all the runners run. But only one gets the prize. You know that, don’t you? So run in a way that will get you the prize.', '1 Corinthians 9:24'],
  ['Jerusalem, our feet are standing inside your gates.', 'Psalm 122:2'],
  ['What a beautiful sight it is to see messengers coming with good news! How beautiful to see them coming down from the mountains with a message about peace! How wonderful it is when they bring the good news that we are saved! How wonderful when they say to Zion, “Your God rules!”', 'Isaiah 52:7'],
  ['The name of the Lord is like a strong tower. Godly people run to it and are safe.', 'Proverbs 18:10'],
];

function fitOver(){const ov=$('over'),q=$('verse');if(!ov||!q)return;q.style.fontSize='';let f=parseFloat(getComputedStyle(q).fontSize);while(ov.scrollHeight>ov.clientHeight+1&&f>11){f-=.5;q.style.fontSize=f+'px'}}
addEventListener('resize',()=>{if($('over')&&!$('over').classList.contains('hidden'))fitOver()});
function clearWorld() {
  for (const o of obstacles) { o.g.visible = false; obPool[o.type].push(o); } obstacles.length = 0;
  for (const it of items) { it.g.visible = false; itemPool[it.kind].push(it); } items.length = 0;
}
function resetRun() {
  clearWorld();
  Object.assign(S, { lane: 1, x: 0, y: 0, vy: 0, sliding: 0, speed: BASE_SPEED, dist: 0, score: 0, coins: 0, mult: 1, runT: 0, dead: 0, shake: 0, invuln: 0, nextRow: -45 });
  S.power = { sandals: 0, shield: 0, magnet: 0 };
  player.position.set(0, 0, 0); P.body.rotation.set(0, 0, 0);
  // pre-populate
  let z = -45; while (z > -170) { spawnRow(z); z -= rowGap(); } S.nextRow = z;
}
const rowGap = () => 15 + S.speed * 0.42;

function coinLine(lane, z0, n, arcOver) {
  for (let i = 0; i < n; i++) {
    const z = z0 + i * 2.2; let y = 1;
    if (arcOver != null) { const t = (z - (arcOver - 6)) / 12; if (t > 0 && t < 1) y = 1 + Math.sin(t * Math.PI) * 2; }
    spawnItem('coin', LANES[lane], y, z);
  }
}
function spawnRow(z) {
  const d = S.dist;
  const r = Math.random();
  const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);
  const hard = Math.min(1, d / 2500);
  if (r < 0.12 && d > 150) { // full-width awning -> slide
    spawnOb('awning', 1, z); coinLine(lanes[0], z - 3, 4); for (const it of items.slice(-4)) { it.y = 0.6; it.g.position.y = 0.6; }
  } else if (r < 0.22 && d > 80) { // stone barrier -> jump
    spawnOb('barrier', 1, z); coinLine(lanes[0], z - 6, 6, z);
  } else if (r < 0.34 && d > 250) { // moving donkey cart
    spawnOb('donkey', lanes[0], z - 40); coinLine(lanes[1], z - 6, 6);
  } else {
    const nObs = Math.random() < 0.35 + hard * 0.4 ? 2 : 1;
    const types = ['cart', 'baskets', 'camel', 'cart', 'baskets'];
    for (let k = 0; k < nObs; k++) {
      const t = pick(types); spawnOb(t, lanes[k], z + (t === 'camel' ? -0.5 : 0));
      if (k === 0 && t !== 'camel' && Math.random() < 0.5) coinLine(lanes[k], z - 6, 6, z);
    }
    if (Math.random() < 0.8) coinLine(lanes[2], z - 6, 7);
  }
  // bonus items
  const rr = Math.random();
  const free = LANES[lanes[2]];
  if (rr < 0.07) spawnItem(pick(['sandals', 'shield', 'magnet']), free, 1.2, z + 7);
  else if (rr < 0.16) spawnItem('scroll', free, 1.1, z + 7);
  else if (rr < 0.27) spawnItem('lamp', free, 1.0, z + 7);
}

// ---------- Input ----------
function act(a) {
  if (S.state !== 'play' || S.dead) return;
  if (a === 'left' && S.lane > 0) { S.lane--; Sfx.lane(); P.lean = 1; }
  if (a === 'right' && S.lane < 2) { S.lane++; Sfx.lane(); P.lean = -1; }
  if (a === 'up' && S.y <= 0.001) { S.vy = JUMP_V; S.sliding = 0; Sfx.jump(); emit(S.x, 0.1, 0, 12, 0xd9b783, 3, 0.4, 0.5, 1); }
  if (a === 'down') { if (S.y > 0.01) S.vy = -24; S.sliding = 0.75; Sfx.slide(); }
}
addEventListener('keydown', e => {
  const k = e.key;
  if (['ArrowLeft', 'a', 'A'].includes(k)) act('left');
  else if (['ArrowRight', 'd', 'D'].includes(k)) act('right');
  else if (['ArrowUp', 'w', 'W', ' '].includes(k)) { act('up'); if (S.state === 'menu' || S.state === 'over') { if (k === ' ') startGame(); } }
  else if (['ArrowDown', 's', 'S'].includes(k)) act('down');
  else if (k === 'p' || k === 'P' || k === 'Escape') togglePause();
  else if (k === 'm' || k === 'M') toggleMute();
  else if (k === 'Enter' && (S.state === 'menu' || S.state === 'over')) startGame();
  if (k.startsWith('Arrow') || k === ' ') e.preventDefault();
});
let tStart = null;
addEventListener('touchstart', e => { const t = e.touches[0]; tStart = { x: t.clientX, y: t.clientY, used: false }; }, { passive: true });
addEventListener('touchmove', e => {
  if (!tStart || tStart.used) return; const t = e.touches[0]; const dx = t.clientX - tStart.x, dy = t.clientY - tStart.y;
  if (Math.hypot(dx, dy) > 30) { tStart.used = true; if (Math.abs(dx) > Math.abs(dy)) act(dx > 0 ? 'right' : 'left'); else act(dy > 0 ? 'down' : 'up'); }
}, { passive: true });
addEventListener('touchend', () => { tStart = null; });

// ---------- UI ----------
function show(id, on) { $(id).classList.toggle('hidden', !on); }
function startGame() {
  Sfx.init(); Sfx.startMusic();
  resetRun(); S.state = 'play';
  show('menu', false); show('over', false); show('paused', false); show('hud', true);
}
function gameOver() {
  S.state = 'over'; Sfx.stopMusic();
  const sc = Math.floor(S.score), nb = sc > S.best; if (nb) { S.best = sc; localStorage.setItem('jr_best', sc); }
  $('fScore').textContent = sc.toLocaleString(); $('fCoins').textContent = S.coins; $('fDist').textContent = Math.floor(S.dist) + " cubits";
  $('bestOver').textContent = S.best.toLocaleString(); $('bestMenu').textContent = S.best.toLocaleString(); show('newBest', nb);
  const showV = localStorage.getItem('jr_verse') !== '0'; $('verseToggle').checked = showV;
  const v = pick(VERSES); $('verse').innerHTML = `&ldquo;${v[0]}&rdquo;<cite>${v[1]} (NIrV)</cite><small class="nirv-note">Scripture quotations taken from The Holy Bible, New International Reader&#39;s Version®, NIrV® Copyright © 1995, 1996, 1998, 2014 by Biblica, Inc.® Used by permission. All rights reserved worldwide.</small>`; show('verse', showV);
  show('over', true); requestAnimationFrame(fitOver);
}
function togglePause() {
  if (S.state === 'play') { S.state = 'paused'; show('paused', true); if (Sfx.ctx) Sfx.ctx.suspend(); }
  else if (S.state === 'paused') { S.state = 'play'; show('paused', false); if (Sfx.ctx) Sfx.ctx.resume(); }
}
function toggleMute() { Sfx.init(); Sfx.setMuted(!Sfx.muted); $('muteBtn').style.opacity = Sfx.muted ? 0.4 : 1; }
$('playBtn').onclick = startGame; $('againBtn').onclick = startGame;
$('menuBtn').onclick = () => { show('over', false); show('hud', false); show('menu', true); S.state = 'menu'; clearWorld(); };
$('resumeBtn').onclick = togglePause; $('pauseBtn').onclick = togglePause; $('muteBtn').onclick = toggleMute;
$('muteBtn').style.opacity = Sfx.muted ? 0.4 : 1;
$('verseToggle').onchange = e => { localStorage.setItem('jr_verse', e.target.checked ? '1' : '0'); show('verse', e.target.checked); };
$('bestMenu').textContent = S.best.toLocaleString();
let toastT = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); toastT = 1.4; }
const NAMES = { sandals: 'Sandals of Speed', shield: 'Shield of Faith', magnet: 'Coin Magnet' };
let lastPowHTML = '';
function updateHUD() {
  $('score').textContent = Math.floor(S.score).toLocaleString();
  $('dist').textContent = Math.floor(S.dist) + " cubits";
  $('coins').textContent = S.coins; $('mult').textContent = S.mult;
  let h = '';
  for (const k in S.power) if (S.power[k] > 0) h += `<div class="pbar" style="border-color:#${PCOL[k].toString(16)}">${NAMES[k]}<div class="fill" style="width:${(S.power[k] / DUR[k] * 100).toFixed(0)}%;background:#${PCOL[k].toString(16)}"></div></div>`;
  if (h !== lastPowHTML) { $('powers').innerHTML = h; lastPowHTML = h; }
}

// ---------- Main loop ----------
const clock = new THREE.Clock();
let lowN = 0, fpsAcc = 0, fpsN = 0, qualityLevel = 0, animT = 0;
const camTarget = new THREE.Vector3(), lookTarget = new THREE.Vector3(0, 1.2, -8), curLook = new THREE.Vector3(0, 1.2, -8);

function playerBox() { const h = S.sliding > 0 ? 0.85 : 1.9; return { x0: S.x - 0.38, x1: S.x + 0.38, y0: S.y, y1: S.y + h, z0: -0.35, z1: 0.35 }; }

function update(dt) {
  const playing = S.state === 'play';
  let speed = 0;
  if (playing && !S.dead) {
    S.runT += dt;
    S.speed = Math.min(MAX_SPEED, BASE_SPEED + S.dist * 0.0075);
    speed = S.speed * (S.power.sandals > 0 ? 1.45 : 1);
    S.dist += speed * dt;
    S.mult = 1 + Math.floor(S.dist / 500) + (S.power.sandals > 0 ? 1 : 0);
    S.score += speed * dt * 0.5 * S.mult;
    for (const k in S.power) S.power[k] = Math.max(0, S.power[k] - dt);
    if (S.invuln > 0) S.invuln -= dt;
  } else if (S.state === 'menu' || S.state === 'loading') speed = 7; // gentle attract-mode scroll
  const dz = speed * dt;
  animT += dt * (speed > 0 ? speed * 0.55 : 2);

  // world scroll
  TX.cobble.offset.y = (TX.cobble.offset.y + dz / (300 / 80)) % 1;
  for (const seg of segments) { seg.g.position.z += dz; if (seg.g.position.z > 10 + SEG_LEN) { seg.g.position.z -= SEG_N * SEG_LEN; randomizeSeg(seg, false); } }
  for (let i = 0; i < DM; i++) { dPos[i * 3 + 2] += dz * 0.9; dPos[i * 3 + 1] += Math.sin(animT * 0.05 + i) * 0.003; if (dPos[i * 3 + 2] > 10) dPos[i * 3 + 2] -= 90; }
  dGeo.attributes.position.needsUpdate = true;

  if (playing || S.state === 'over' || S.state === 'paused') {
    // spawn
    if (playing && !S.dead) { S.nextRow += dz; while (S.nextRow > -170) { spawnRow(S.nextRow); S.nextRow -= rowGap(); } }

    // player physics
    if (!S.dead) {
      const tx = LANES[S.lane]; S.x += (tx - S.x) * (1 - Math.exp(-14 * dt));
      S.vy -= GRAV * dt; S.y += S.vy * dt; if (S.y < 0) { if (S.vy < -5 && playing) emit(S.x, 0.1, 0.2, 6, 0xd9b783, 2, 0.35, 0.4, 0.5); S.y = 0; S.vy = 0; }
      if (S.sliding > 0) S.sliding -= dt;
    }
    // obstacles
    const pb = playerBox();
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];
      o.z += dz + (o.moving && playing && !S.dead ? 9 * dt : 0); o.g.position.z = o.z;
      if (o.moving) { o.g.userData.spr.position.y = Math.abs(Math.sin(animT * 0.9)) * 0.12; o.g.userData.spr.rotation.z = Math.sin(animT * 0.9) * 0.04; }
      if (o.z > 2.5 && !o.wide) o.g.visible = false;
      if (o.z > 18) { o.g.visible = false; obPool[o.type].push(o); obstacles.splice(i, 1); continue; }
      if (!playing || S.dead) continue;
      const b = o.box, zc = o.z + (o.zoff || 0);
      if (pb.x1 > o.x - b.hw && pb.x0 < o.x + b.hw && pb.z1 > zc - b.hd && pb.z0 < zc + b.hd && pb.y1 > b.y0 && pb.y0 < b.y1) {
        if (GOD || S.power.sandals > 0 || S.invuln > 0) { if (S.power.sandals > 0 && !o.hitFx) { o.hitFx = 1; emit(o.x, 1, o.z, 30, 0xffb050, 7, 0.5, 0.6); } continue; }
        if (S.power.shield > 0) { S.power.shield = 0; S.invuln = 1.2; Sfx.shieldBreak(); emit(S.x, 1.2, 0, 50, 0x7fd0ff, 8, 0.5, 0.8); S.shake = 0.4; toast('Faith Protected You!'); continue; }
        S.dead = 1; S.deadT = 0; Sfx.crash(); S.shake = 0.8; emit(S.x, 1, -0.5, 40, 0xd9b783, 6, 0.6, 0.9);
      }
    }
    // items
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      it.z += dz;
      if (S.power.magnet > 0 && it.kind === 'coin' && it.z > -18 && it.z < 2) it.mag = true;
      if (it.mag && !S.dead) { const k = (1 - Math.exp(-10 * dt)); it.x += (S.x - it.x) * k; it.y += (S.y + 1 - it.y) * k; it.z += (0 - it.z) * k; }
      it.phase += dt;
      it.g.position.set(it.x, it.y + (it.kind === 'coin' ? 0 : Math.sin(it.phase * 3) * 0.15), it.z);
      { const sp = it.g.userData.spr, s0 = ISZ[it.kind]; if (it.kind === 'coin') sp.scale.x = s0 * (0.25 + 0.75 * Math.abs(Math.cos(it.phase * 3))); else sp.rotation.z = Math.sin(it.phase * 2) * 0.12; }
      if (it.g.userData.flame) it.g.userData.flame.scale.y = 1 + Math.sin(it.phase * 20) * 0.2;
      if (it.z > 12) { it.g.visible = false; itemPool[it.kind].push(it); items.splice(i, 1); continue; }
      if (!playing || S.dead) continue;
      if (Math.abs(it.x - S.x) < 0.95 && Math.abs(it.z) < 1.0 && it.y > S.y - 0.3 && it.y < S.y + 2.3) {
        collect(it); it.g.visible = false; itemPool[it.kind].push(it); items.splice(i, 1);
      }
    }
  }
  if (S.dead) { S.deadT += dt; if (S.deadT > 1.3 && S.state === 'play') gameOver(); }
  updateParticles(dt, dz);
  if (S.power.sandals > 0 && playing && Math.random() < 0.8) emit(S.x + rand(-0.2, 0.2), 0.15 + S.y, 0.3, 1, 0xffa040, 1, 0.35, 0.4, 0.5);
  if (playing && S.y === 0 && !S.dead && Math.random() < 0.25) emit(S.x, 0.05, 0.4, 1, 0xc9a06a, 0.6, 0.3, 0.5, 0.6);

  // player animation
  player.position.set(S.x, S.y, 0);
  P.blob.position.x = S.x;
  P.lean = (P.lean || 0) * Math.pow(0.02, dt);
  if (S.dead) { P.setFrame('slide', 1.7); P.body.rotation.z = Math.min(0.5, S.deadT * 2); player.position.z = Math.min(0.8, S.deadT * 2); }
  else {
    const air = S.y > 0.01, sl = S.sliding > 0;
    if (sl) { P.setFrame('slide', 1.45); P.body.position.y = 0; }
    else if (air) { P.setFrame('jump', 2.35); P.body.position.y = 0; }
    else { const f = Math.floor(animT / 1.6) % 2; P.setFrame(f ? 'run1' : 'run0', 2.3); P.body.position.y = Math.abs(Math.sin(animT * 0.98)) * 0.06; }
    P.body.rotation.z = P.lean * 0.07;
  }
  P.blob.scale.setScalar(1 - Math.min(0.6, S.y * 0.2));
  P.shield.visible = S.power.shield > 0 || S.invuln > 0; P.shield.material.opacity = 0.16 + Math.sin(animT * 0.5) * 0.06;
  P.magRing.visible = S.power.magnet > 0; P.magRing.scale.setScalar(1 + Math.sin(animT * 0.6) * 0.15);
  player.visible = !(S.invuln > 0 && Math.floor(S.invuln * 12) % 2);

  // camera
  const fovT = 60 + (speed - BASE_SPEED) * 0.45;
  camera.fov += (Math.min(78, Math.max(58, fovT)) - camera.fov) * (1 - Math.exp(-1.5 * dt)); camera.updateProjectionMatrix();
  if (S.state === 'menu' || S.state === 'loading') { const t = performance.now() * 0.00015; camTarget.set(Math.sin(t) * 1.5, 3.2, 6.5); lookTarget.set(0, 3.5, -40); }
  else { camTarget.set(S.x * 0.65, 3.7 + S.y * 0.35, 6.8); lookTarget.set(S.x * 0.45, 1.3 + S.y * 0.25, -9); }
  camera.position.lerp(camTarget, (1 - Math.exp(-6 * dt))); curLook.lerp(lookTarget, (1 - Math.exp(-7 * dt)));
  if (S.shake > 0) { S.shake -= dt; camera.position.x += rand(-1, 1) * S.shake * 0.4; camera.position.y += rand(-1, 1) * S.shake * 0.3; }
  camera.lookAt(curLook);
  sky.position.copy(camera.position);

  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('show'); }
  if (playing) updateHUD();
}
function collect(it) {
  const x = it.x, y = it.y, z = it.z;
  switch (it.kind) {
    case 'coin': S.coins++; S.score += 10 * S.mult; Sfx.coin(); emit(x, y, z, 10, 0xffd24a, 3, 0.35, 0.45, 1.5); break;
    case 'scroll': S.score += 250 * S.mult; Sfx.item(); emit(x, y, z, 30, 0xfff0c0, 5, 0.45, 0.8); toast('Sacred Scroll +' + 250 * S.mult); break;
    case 'lamp': S.score += 100 * S.mult; S.coins += 5; Sfx.item(); emit(x, y, z, 30, 0xff9a2e, 5, 0.45, 0.8); toast('Oil Lamp +' + 100 * S.mult); break;
    default: S.power[it.kind] = DUR[it.kind]; Sfx.power(); emit(x, y, z, 50, PCOL[it.kind], 7, 0.55, 0.9); toast(NAMES[it.kind] + '!');
  }
}

function adaptQuality(dt) {
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 2.5) {
    const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
    lowN = fps < 45 ? lowN + 1 : 0;
    if (lowN >= 2 && qualityLevel < 3 && S.state === 'play') { lowN = 0;
      qualityLevel++;
      if (qualityLevel === 1) { sun.shadow.mapSize.set(1024, 1024); sun.shadow.map?.dispose(); sun.shadow.map = null; }
      if (qualityLevel === 2) { pixelRatio = Math.max(1, pixelRatio * 0.75); renderer.setPixelRatio(pixelRatio); onResize(); }
      if (qualityLevel === 3) useOutline = false;
      console.info('[quality] lowered to level', qualityLevel, 'fps', fps.toFixed(1));
    }
  }
}
function onResize() {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', onResize);
document.addEventListener('visibilitychange', () => { if (document.hidden && S.state === 'play') togglePause(); });

function frame() {
  const rawDt = Math.min(1 / 30, clock.getDelta()); sdt += (rawDt - sdt) * 0.2; const dt = sdt;
  if (S.state !== 'paused') update(dt);
  for (const b of billboards) b.rotation.y = b.userData.fixed ?? 0; // fixed facing: no per-frame wobble when the camera moves
  if (useOutline) outline.render(scene, camera); else renderer.render(scene, camera);
  adaptQuality(dt);
  requestAnimationFrame(frame);
}
const _wp = new THREE.Vector3(); let sdt = 1 / 60; if (Q.has('nooutline')) useOutline = false;
S.state = 'menu'; show('loading', false);
// spawn a few attract-mode items on menu
frame();
window.__game = { camera, S, startGame, act, Sfx };
