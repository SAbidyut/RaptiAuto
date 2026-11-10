// 3D toolkit: cached materials, canvas textures and decals, rounded boxes and a static-geometry
// merger (keeps draw calls low on phones). Units are millimetres.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export { THREE };

const matCache = new Map();
export function mat(key, params) {
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0, ...params });
    m.name = key;
    matCache.set(key, m);
  }
  return m;
}

export const MAT = {
  get plcBody() { return mat('plcBody', { color: 0xe8eae6, roughness: 0.55 }); },
  get plcFront() { return mat('plcFront', { color: 0xdcdfdb, roughness: 0.5 }); },
  get termBlock() { return mat('termBlock', { color: 0x2b2f36, roughness: 0.7 }); },
  get termBlockLight() { return mat('termBlockLight', { color: 0x9aa0a8, roughness: 0.6 }); },
  get screw() { return mat('screw', { color: 0xc4cad2, metalness: 0.9, roughness: 0.32 }); },
  get slot() { return mat('slot', { color: 0x30343a, metalness: 0.5, roughness: 0.6 }); },
  get blackPlastic() { return mat('blackPlastic', { color: 0x16181c, roughness: 0.55 }); },
  get darkPlastic() { return mat('darkPlastic', { color: 0x24272d, roughness: 0.6 }); },
  get charcoal() { return mat('charcoal', { color: 0x2c3036, roughness: 0.5 }); },
  get steel() { return mat('steel', { color: 0xb9bfc7, metalness: 0.85, roughness: 0.3 }); },
  get chrome() { return mat('chrome', { color: 0xe6e9ee, metalness: 1, roughness: 0.16 }); },
  get brass() { return mat('brass', { color: 0xcfb36a, metalness: 0.9, roughness: 0.3 }); },
  get gold() { return mat('gold', { color: 0xd4af37, metalness: 1, roughness: 0.25 }); },
  get rubber() { return mat('rubber', { color: 0x15171a, roughness: 0.9 }); },
  get greenPlug() { return mat('greenPlug', { color: 0x1f8a4c, roughness: 0.55 }); },
  get white() { return mat('white', { color: 0xf2f3f1, roughness: 0.5 }); },
  get paintBlue() { return mat('paintBlue', { color: 0x3a5a88, roughness: 0.42, metalness: 0.35 }); },
  get alu() { return mat('alu', { color: 0x8e96a2, metalness: 0.75, roughness: 0.38 }); },
  get panelGrey() { return mat('panelGrey', { color: 0xd5d8d4, roughness: 0.62 }); },
};

/** Self-lit material for LEDs etc.; returns a new material each call (state per instance). */
export function ledMat(color, on = false) {
  const c = new THREE.Color(color);
  const m = new THREE.MeshStandardMaterial({ color: c.clone().lerp(new THREE.Color(0x1a1c20), 0.82), emissive: c, emissiveIntensity: on ? 1.25 : 0, roughness: 0.3 });
  m.toneMapped = false;
  return m;
}
export function setLed(m, on, k = 1.25) {
  const v = on ? Math.min(k, 1.4) : 0;
  if (m.emissiveIntensity !== v) { m.emissiveIntensity = v; return true; }
  return false;
}

// ------------------------------------------------------------------ canvas textures
let maxAniso = 4;
export function setMaxAnisotropy(a) { maxAniso = a; }

export function canvasTexture(w, h, draw, { srgb = true, repeat = false, mip = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  if (!mip) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }
  t.userData.canvas = c;
  return t;
}

export const FONT = "'Inter', system-ui, sans-serif";
export const FONT_D = "'Space Grotesk', 'Inter', sans-serif";
export const FONT_M = "'JetBrains Mono', ui-monospace, monospace";

/**
 * While FLIP.on, decals are drawn for a module that is turned half way round (the operator console modules, see
 * models.js): the picture is turned with it, so each text is turned back on the spot to stay upright.
 */
export const FLIP = { on: false };

export function txt(g, s, x, y, { size = 20, color = '#111', weight = 700, align = 'center', base = 'middle', font = FONT, spacing = 0 } = {}) {
  g.font = `${weight} ${size}px ${font}`;
  g.fillStyle = color;
  g.textBaseline = base;
  if (spacing && 'letterSpacing' in g) g.letterSpacing = spacing + 'px';
  if (g.__flipText) {
    g.save(); g.translate(x, y); g.rotate(Math.PI);
    g.textAlign = align === 'left' ? 'right' : align === 'right' ? 'left' : align;
    g.fillText(s, 0, 0);
    g.restore();
  } else {
    g.textAlign = align;
    g.fillText(s, x, y);
  }
  if (spacing && 'letterSpacing' in g) g.letterSpacing = '0px';
}

export function rrect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Delta-style logo mark: a triangle followed by the word DELTA. */
export function deltaLogo(g, x, y, h, color = '#1d4f9c', align = 'left') {
  g.save();
  g.font = `800 ${h}px ${FONT_D}`;
  const tw = g.measureText('DELTA').width;
  const tri = h * 0.95;
  const total = tri + h * 0.25 + tw;
  let x0 = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x0, y + h * 0.42);
  g.lineTo(x0 + tri / 2, y - h * 0.48);
  g.lineTo(x0 + tri, y + h * 0.42);
  g.closePath();
  g.fill();
  g.fillStyle = '#ffffff';
  g.globalCompositeOperation = 'destination-out';
  g.beginPath();
  g.moveTo(x0 + tri * 0.3, y + h * 0.2);
  g.lineTo(x0 + tri / 2, y - h * 0.18);
  g.lineTo(x0 + tri * 0.7, y + h * 0.2);
  g.closePath();
  g.fill();
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = color;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillText('DELTA', x0 + tri + h * 0.25, y + h * 0.02);
  g.restore();
}

/**
 * Pull a surface that lies on another one towards the camera in the depth test (polygon offset), so
 * prints, labels and screens never z-fight with the face below them (no flicker while orbiting).
 */
export function offsetMat(m, k = 1) {
  m.polygonOffset = true;
  m.polygonOffsetFactor = -1 - k;
  m.polygonOffsetUnits = -2 - 2 * k;
  return m;
}

/** A textured plane (decal) facing +z. ppm = canvas pixels per mm. */
export function decal(wmm, hmm, draw, { ppm = 6, transparent = true, rough = 0.55, emissive = false, metal = 0 } = {}) {
  const flip = FLIP.on;
  const tex = canvasTexture(Math.ceil(wmm * ppm), Math.ceil(hmm * ppm), (g, w, h) => { g.scale(ppm, ppm); g.__flipText = flip; draw(g, wmm, hmm); });
  const m = offsetMat(new THREE.MeshStandardMaterial({ map: tex, transparent, roughness: rough, metalness: metal, depthWrite: !transparent }));
  if (emissive) { m.emissive = new THREE.Color(0xffffff); m.emissiveMap = tex; m.emissiveIntensity = 0; }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(wmm, hmm), m);
  mesh.userData.tex = tex;
  return mesh;
}

// ------------------------------------------------------------------ geometry
const rboxCache = new Map();
export function rbox(w, h, d, r = 2, seg = 2) {
  const k = [w, h, d, r, seg].join(',');
  let g = rboxCache.get(k);
  if (!g) { g = new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01)); g.userData.shared = true; rboxCache.set(k, g); }
  return g;
}
export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export const cyl = (rt, rb, h, seg = 20) => new THREE.CylinderGeometry(rt, rb, h, seg);

/** Matrix from position + euler (rx, ry, rz) + optional scale. */
export function M4(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) {
  const m = new THREE.Matrix4();
  m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(s, s, s));
  return m;
}

/** Matrix that orients +Y along `dir` at `pos` (for screws, sockets, plugs). */
export function alongDir(pos, dir, extraRot = 0) {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...dir).normalize());
  if (extraRot) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), extraRot));
  return new THREE.Matrix4().compose(new THREE.Vector3(...pos), q, new THREE.Vector3(1, 1, 1));
}

/** Collects static geometry per material and merges it into a few meshes. */
export class Builder {
  constructor() { this.parts = new Map(); }
  add(geo, material, matrix) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (matrix) g.applyMatrix4(matrix);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!this.parts.has(material)) this.parts.set(material, []);
    this.parts.get(material).push(g);
    return this;
  }
  build(group, { shadow = true } = {}) {
    for (const [m, list] of this.parts) {
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      const mesh = new THREE.Mesh(merged, m);
      mesh.castShadow = shadow; mesh.receiveShadow = true;
      group.add(mesh);
    }
    this.parts.clear();
    return group;
  }
}

/** Screw terminal head pointing along dir (slot visible). */
export function addScrew(B, pos, dir, r = 2.1) {
  const m = alongDir(pos, dir, Math.PI / 4);
  B.add(cyl(r, r, 1.6, 16), MAT.screw, m.clone().multiply(M4(0, 0.2, 0)));
  B.add(box(r * 1.7, 0.6, 0.55), MAT.slot, m.clone().multiply(M4(0, 1.05, 0)));
  B.add(cyl(r * 1.25, r * 1.25, 1.2, 16), MAT.termBlock, m.clone().multiply(M4(0, -0.9, 0)));
}

/** 4 mm banana socket. */
export function addSocket(B, pos, dir, color) {
  const m = alongDir(pos, dir);
  B.add(cyl(4.4, 4.6, 3.2, 20), mat('sock-' + color, { color, roughness: 0.45 }), m.clone().multiply(M4(0, 0.6, 0)));
  B.add(cyl(2.4, 2.4, 0.4, 16), MAT.brass, m.clone().multiply(M4(0, 2.25, 0)));
  B.add(cyl(1.6, 1.6, 0.5, 12), MAT.blackPlastic, m.clone().multiply(M4(0, 2.5, 0)));
}

/** Small glow sprite for lamps / LEDs. */
let glowTex = null;
export function glowSprite(color, size) {
  if (!glowTex) {
    glowTex = canvasTexture(128, 128, (g) => {
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.25, 'rgba(255,255,255,.55)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    });
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  s.scale.set(size, size, 1);
  return s;
}

/** Text label sprite (always faces the camera). */
export function labelSprite(text, { size = 26, color = '#f4f6ff', bg = 'rgba(11,16,38,.86)', border = 'rgba(255,217,46,.75)', scale = 0.26 } = {}) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  g.font = `700 ${size}px ${FONT}`;
  const w = Math.ceil(g.measureText(text).width + size * 1.1), h = Math.ceil(size * 1.7);
  c.width = w; c.height = h;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false }));
  sp.renderOrder = 10;
  sp.userData.set = (s) => {
    g.clearRect(0, 0, c.width, c.height);
    g.font = `700 ${size}px ${FONT}`;
    const ww = Math.ceil(g.measureText(s).width + size * 1.1);
    if (ww !== c.width) { c.width = ww; t.dispose(); }
    rrect(g, 1, 1, c.width - 2, c.height - 2, c.height / 2 - 1);
    g.fillStyle = bg; g.fill();
    g.lineWidth = 2; g.strokeStyle = border; g.stroke();
    txt(g, s, c.width / 2, c.height / 2 + 1, { size, color, weight: 700 });
    t.needsUpdate = true;
    sp.scale.set(c.width * scale, c.height * scale, 1);
  };
  sp.userData.set(text);
  return sp;
}

// ------------------------------------------------------------------ freeing GPU memory
/**
 * Frees what an object tree holds on the GPU: its own geometries, materials and canvas textures.
 * The cached materials (mat), the shared rounded boxes and the glow texture stay; anything freed
 * that is drawn again later is simply uploaded again by three.js.
 */
export function disposeObject(root) {
  root.traverse((o) => {
    if (o.geometry && !(o.geometry.userData && o.geometry.userData.shared)) o.geometry.dispose();
    const ms = !o.material ? [] : Array.isArray(o.material) ? o.material : [o.material];
    for (const m of ms) {
      if (matCache.get(m.name) === m) continue;
      for (const k of ['map', 'emissiveMap', 'alphaMap']) { const t = m[k]; if (t && t !== glowTex) t.dispose(); }
      m.dispose();
    }
  });
}

/** Lab closed: the module caches let go of the old renderer (three.js keeps a listener on each). */
export function disposeCaches() {
  for (const m of matCache.values()) m.dispose();
  for (const g of rboxCache.values()) g.dispose();
  if (glowTex) glowTex.dispose();
}
