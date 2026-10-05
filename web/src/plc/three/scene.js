// The 3D lab view: renderer, camera + orbit controls, device models, cables, port markers,
// picking (ports, controls, devices, cables), camera focus animation and the render loop.
import { THREE, canvasTexture, setMaxAnisotropy, labelSprite } from './kit.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { setupLights, buildEnvironment } from './environment.js';
import { buildModel, disposeModel } from './models.js';
import { buildCable, disposeCable, setCableFlow, setCableHighlight } from './cables.js';
import { layoutDevices, toWorld, dirToWorld } from '../devices/layout.js';
import { DEVICE_DEFS, devicePorts, deviceProps } from '../devices/defs.js';

const ringTexCache = new Map();
function ringTexture(color) {
  let t = ringTexCache.get(color);
  if (!t) {
    t = canvasTexture(64, 64, (g) => {
      g.strokeStyle = color; g.lineWidth = 7;
      g.beginPath(); g.arc(32, 32, 24, 0, Math.PI * 2); g.stroke();
      g.fillStyle = color; g.globalAlpha = 0.28;
      g.beginPath(); g.arc(32, 32, 20, 0, Math.PI * 2); g.fill();
    });
    ringTexCache.set(color, t);
  }
  return t;
}

export class LabScene {
  constructor(host, { quality = 'high', hmiCanvas, laptopCanvas } = {}) {
    this.host = host;
    this.quality = quality;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality === 'low' ? 1 : 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = quality !== 'low';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.domElement.className = 'lab-3d';
    host.appendChild(renderer.domElement);
    setMaxAnisotropy(renderer.capabilities.getMaxAnisotropy());
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 5, 14000);
    this.camera.position.set(0, 950, 1900);
    setupLights(this.scene, renderer, { shadows: quality !== 'low' });
    const c = new OrbitControls(this.camera, renderer.domElement);
    c.enableDamping = true;
    c.dampingFactor = 0.1;
    c.screenSpacePanning = true;
    c.minDistance = 90;
    c.maxDistance = 4200;
    c.minPolarAngle = 0.08;
    c.maxPolarAngle = 1.52;
    c.minAzimuthAngle = -1.5;
    c.maxAzimuthAngle = 1.5;
    c.rotateSpeed = 0.75;
    c.zoomSpeed = 1.1;
    c.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    c.target.set(0, 300, 200);
    c.addEventListener('change', () => { this.dirty = true; });
    c.addEventListener('start', () => { this.anim = null; });
    this.controls = c;

    this.hmiTexture = canvasTexture(8, 8, () => {});
    if (hmiCanvas) { this.hmiTexture.image = hmiCanvas; this.hmiTexture.userData.canvas = hmiCanvas; this.hmiTexture.needsUpdate = true; }
    this.laptopTexture = canvasTexture(8, 8, () => {});
    if (laptopCanvas) { this.laptopTexture.image = laptopCanvas; this.laptopTexture.userData.canvas = laptopCanvas; this.laptopTexture.needsUpdate = true; }

    this.models = new Map();
    this.cables = new Map();
    this.world = new THREE.Group();
    this.cableGroup = new THREE.Group();
    this.markerGroup = new THREE.Group();
    this.scene.add(this.world, this.cableGroup, this.markerGroup);
    this.env = null;
    this.envKey = '';
    this.raycaster = new THREE.Raycaster();
    this.dirty = true;
    this.t = 0;
    this.running = false;
    this.selBox = null;

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    const loop = (now) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - (this.lastNow || now)) / 1000);
      this.lastNow = now;
      this.tick(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  resize() {
    const r = this.host.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.renderer.setSize(r.width, r.height, false);
    this.camera.aspect = r.width / r.height;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.controls.dispose();
    for (const m of this.models.values()) disposeModel(m.model);
    for (const c of this.cables.values()) disposeCable(c);
    this.renderer.dispose();
    this.renderer.forceContextLoss && this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  // ------------------------------------------------------------------ project sync
  setProject(project) {
    this.project = project;
    this.syncDevices(true);
  }

  modelKey(dev) { return dev.type + '|' + JSON.stringify(deviceProps(dev)); }

  /** Build / update / remove device models to match the project; relayout; rebuild cables. */
  syncDevices(force = false) {
    const devs = this.project.devices;
    this.layout = layoutDevices(devs);
    const ids = new Set();
    for (const dev of devs) {
      ids.add(dev.id);
      const key = this.modelKey(dev);
      let entry = this.models.get(dev.id);
      if (entry && entry.key !== key) { this.world.remove(entry.model.group); disposeModel(entry.model); entry = null; }
      if (!entry) {
        const model = buildModel(dev, { hmiTexture: this.hmiTexture, laptopTexture: this.laptopTexture });
        if (!model) continue;
        entry = { model, key, dev };
        this.models.set(dev.id, entry);
        this.world.add(model.group);
      }
      entry.dev = dev;
      const pl = this.layout.places.get(dev.id);
      entry.place = pl;
      if (pl) {
        entry.model.group.position.set(...pl.pos);
        entry.model.group.rotation.set(pl.rot[0], pl.rot[1], pl.rot[2] || 0, 'YXZ');
        entry.model.group.updateMatrixWorld(true);
      }
    }
    for (const [id, entry] of [...this.models]) {
      if (ids.has(id)) continue;
      this.world.remove(entry.model.group);
      disposeModel(entry.model);
      this.models.delete(id);
    }
    const envKey = JSON.stringify(this.layout.console) + '|' + devs.filter((d) => ['hmi', 'motor'].includes(DEVICE_DEFS[d.type].zone)).map((d) => d.id).join(',');
    if (force || envKey !== this.envKey) {
      if (this.env) this.scene.remove(this.env);
      this.env = buildEnvironment(this.layout, devs);
      this.scene.add(this.env);
      this.envKey = envKey;
    }
    this.syncCables();
    this.renderer.shadowMap.needsUpdate = true;
    this.dirty = true;
  }

  syncCables() {
    for (const c of this.cables.values()) { this.cableGroup.remove(c); disposeCable(c); }
    this.cables.clear();
    for (const conn of this.project.conns) {
      const a = this.portWorld(conn.a.dev, conn.a.port), b = this.portWorld(conn.b.dev, conn.b.port);
      if (!a || !b) continue;
      const cab = buildCable(conn, [a, b]);
      this.cables.set(conn.id, cab);
      this.cableGroup.add(cab);
    }
    if (this.selConn) { const c = this.cables.get(this.selConn); if (c) setCableHighlight(c, true); }
    this.renderer.shadowMap.needsUpdate = true;
    this.dirty = true;
  }

  portWorld(devId, portId) {
    const entry = this.models.get(devId);
    if (!entry || !entry.place) return null;
    const port = devicePorts(entry.dev).find((p) => p.id === portId);
    if (!port) return null;
    return { pos: toWorld(entry.place, port.pos), dir: dirToWorld(entry.place, port.dir), port, dev: entry.dev };
  }

  // ------------------------------------------------------------------ frame
  tick(dt) {
    this.t += dt;
    const changed = this.controls.update();
    if (this.anim) this.stepAnim();
    let dirty = this.dirty || changed || !!this.anim;
    if (this.system) {
      const ctx = { t: this.t, dt, running: this.running };
      for (const [id, entry] of this.models) {
        const rt = this.system.rts.get(id);
        if (rt && entry.model.update(rt, ctx)) dirty = true;
      }
    }
    for (const c of this.cables.values()) {
      const f = c.userData.flow;
      if (f) { f.offset.x -= dt * (c.userData.flowMode === 'data' ? 1.6 : 0.45); dirty = true; }
    }
    if (this.markers && this.markers.length) {
      const k = 1 + Math.sin(this.t * 6) * 0.18;
      for (const m of this.markers) if (m.userData.pulse) m.scale.setScalar(m.userData.base * k);
      dirty = true;
    }
    if (this.hmiDirty) { this.hmiTexture.needsUpdate = true; this.hmiDirty = false; dirty = true; }
    if (this.laptopDirty) { this.laptopTexture.needsUpdate = true; this.laptopDirty = false; dirty = true; }
    if (dirty && this.visible !== false) {
      this.renderer.render(this.scene, this.camera);
      this.dirty = false;
    }
  }

  setSystem(sys) { this.system = sys; this.dirty = true; }
  setRunning(on) { this.running = on; this.dirty = true; }

  /** Update cable flow animations from the simulator (called a few times a second). */
  updateFlows(liveConn, busyLinks) {
    for (const [id, cab] of this.cables) {
      const conn = this.project.conns.find((c) => c.id === id);
      if (!conn || cab.userData.hl) continue;
      const mode = !this.running ? null : conn.comm ? (busyLinks(conn) ? 'data' : null) : liveConn(conn) ? 'flow' : null;
      if (setCableFlow(cab, mode)) this.dirty = true;
    }
  }

  // ------------------------------------------------------------------ camera
  focus(target = 'overview', animate = true, dur = 650) {
    const box = new THREE.Box3();
    const aspect = this.camera.aspect || 1;
    const portrait = aspect < 0.85;
    let dir = new THREE.Vector3(0, 0.42, 1);
    let margin = 1.12;
    if (target === 'overview') {
      for (const e of this.models.values()) {
        if (portrait && e.place && e.place.zone !== 'console' && e.place.zone !== 'rail1' && e.place.zone !== 'rail2') continue;
        box.expandByObject(e.model.group);
      }
      box.expandByPoint(new THREE.Vector3(-420, 0, 0)).expandByPoint(new THREE.Vector3(420, 700, 0));
      dir = portrait ? new THREE.Vector3(0, 0.8, 0.95) : new THREE.Vector3(0, 0.5, 1);
      margin = portrait ? 0.98 : 1.04;
    } else if (target === 'console') {
      for (const e of this.models.values()) if (e.place && e.place.zone === 'console') box.expandByObject(e.model.group);
      dir = new THREE.Vector3(0, 0.95, 0.75);
      margin = 1.18;
    } else if (target === 'panel') {
      box.expandByPoint(new THREE.Vector3(-420, 60, 0)).expandByPoint(new THREE.Vector3(420, 660, 140));
      dir = new THREE.Vector3(0, 0.12, 1);
      margin = 1.04;
    } else {
      const e = this.models.get(target);
      if (!e) return;
      box.setFromObject(e.model.group);
      const zone = e.place && e.place.zone;
      const n = new THREE.Vector3(0, 0, 1).applyQuaternion(e.model.group.quaternion);
      if (zone === 'motor') dir = new THREE.Vector3(0.55, 0.55, 1);
      else if (zone === 'desk') dir = new THREE.Vector3(0.35, 0.8, 1);
      else dir = n.add(new THREE.Vector3(0, 0.18, 0));
      margin = 1.22;
    }
    if (box.isEmpty()) return;
    dir.normalize();
    const center = box.getCenter(new THREE.Vector3());
    const dist = this.fitDistance(box, center, dir, margin);
    const pos = center.clone().add(dir.multiplyScalar(dist));
    if (!animate) { this.camera.position.copy(pos); this.controls.target.copy(center); this.controls.update(); this.camera.updateMatrixWorld(); this.dirty = true; return; }
    this.anim = { t0: performance.now(), dur, p0: this.camera.position.clone(), p1: pos, c0: this.controls.target.clone(), c1: center };
  }

  /** Smallest camera distance (along dir from center) at which every corner of box is on screen. */
  fitDistance(box, center, dir, margin = 1.1) {
    const cam = new THREE.PerspectiveCamera(this.camera.fov, this.camera.aspect || 1, 1, 50000);
    const corners = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
    const fits = (d) => {
      cam.position.copy(center).addScaledVector(dir, d);
      cam.lookAt(center);
      cam.updateMatrixWorld();
      for (const c of corners) {
        const v = c.clone().project(cam);
        if (v.z > 1 || Math.abs(v.x) * margin > 1 || Math.abs(v.y) * margin > 1) return false;
      }
      return true;
    };
    let lo = 40, hi = 8000;
    for (let i = 0; i < 28; i++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
    return hi;
  }

  stepAnim() {
    const a = this.anim;
    let k = (performance.now() - a.t0) / a.dur;
    if (k >= 1) { k = 1; this.anim = null; }
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    this.camera.position.lerpVectors(a.p0, a.p1, e);
    this.controls.target.lerpVectors(a.c0, a.c1, e);
    this.dirty = true;
  }

  /** Small JPEG of the current view (for the lab list). */
  snapshot(w = 240, h = 150) {
    this.renderer.render(this.scene, this.camera);
    const src = this.renderer.domElement;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    const k = Math.max(w / src.width, h / src.height);
    const sw = w / k, sh = h / k;
    g.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.72);
  }

  getView() { return { p: this.camera.position.toArray().map((x) => Math.round(x)), t: this.controls.target.toArray().map((x) => Math.round(x)) }; }
  setView(v) { if (!v) return; this.camera.position.fromArray(v.p); this.controls.target.fromArray(v.t); this.controls.update(); this.dirty = true; }

  // ------------------------------------------------------------------ picking
  ndc(x, y) {
    const r = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  }

  toScreen(p) {
    this.camera.updateMatrixWorld();
    const r = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector3(...p).project(this.camera);
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height, behind: v.z > 1 };
  }

  raycast(x, y, objects) {
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.ndc(x, y), this.camera);
    return this.raycaster.intersectObjects(objects, true);
  }

  pickControl(x, y) {
    const list = [];
    for (const e of this.models.values()) list.push(...e.model.controls);
    const hits = this.raycast(x, y, list);
    if (!hits.length) return null;
    const h = hits[0];
    let o = h.object;
    while (o && !o.userData.control) o = o.parent;
    if (!o) return null;
    // make sure nothing (another device) is in front of the control
    const front = this.raycast(x, y, [this.world]);
    if (front.length && front[0].distance < h.distance - 25 && front[0].object.userData.devId !== o.userData.control.devId) return null;
    return { ...o.userData.control, uv: h.uv, point: h.point };
  }

  pickDevice(x, y) {
    const hits = this.raycast(x, y, [this.world]);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.devId) o = o.parent;
      if (o) return o.userData.devId;
    }
    return null;
  }

  /** Cable nearest to a screen point (within px). */
  pickCable(x, y, px = 16) {
    let best = null, bd = px;
    for (const [id, cab] of this.cables) {
      const tube = cab.userData.tube;
      const pos = tube.geometry.attributes.position;
      const step = Math.max(1, Math.floor(pos.count / 120));
      for (let i = 0; i < pos.count; i += step) {
        const s = this.toScreen([pos.getX(i), pos.getY(i), pos.getZ(i)]);
        if (s.behind) continue;
        const d = Math.hypot(s.x - x, s.y - y);
        if (d < bd) { bd = d; best = id; }
      }
    }
    return best;
  }

  /** Ports near a screen point, nearest first: [{devId, port, d, sx, sy}]. */
  portsNear(x, y, px = 30, filter) {
    const out = [];
    const cam = this.camera.position;
    for (const e of this.models.values()) {
      if (!e.place) continue;
      for (const port of devicePorts(e.dev)) {
        if (filter && !filter(e.dev, port)) continue;
        const wp = toWorld(e.place, port.pos);
        const wd = dirToWorld(e.place, port.dir);
        const toCam = [cam.x - wp[0], cam.y - wp[1], cam.z - wp[2]];
        const facing = (toCam[0] * wd[0] + toCam[1] * wd[1] + toCam[2] * wd[2]) / Math.hypot(...toCam);
        if (facing < -0.15) continue;
        const s = this.toScreen(wp);
        if (s.behind) continue;
        const d = Math.hypot(s.x - x, s.y - y);
        if (d <= px) out.push({ devId: e.dev.id, dev: e.dev, port, d, sx: s.x, sy: s.y });
      }
    }
    return out.sort((a, b) => a.d - b.d);
  }

  /** Show rings on ports: list of {devId, portId, color, pulse}. */
  setMarkers(list) {
    for (const m of this.markerGroup.children.slice()) { this.markerGroup.remove(m); m.material.dispose(); }
    this.markers = [];
    for (const it of list || []) {
      const pw = this.portWorld(it.devId, it.portId);
      if (!pw) continue;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTexture(it.color || '#34d399'), transparent: true, depthWrite: false, depthTest: true }));
      const base = pw.port.kind === 'comm' ? 20 : pw.port.kind === 'sock' ? 13 : 9;
      sp.scale.setScalar(base);
      sp.userData.base = base;
      sp.userData.pulse = !!it.pulse;
      sp.position.set(pw.pos[0] + pw.dir[0] * 3, pw.pos[1] + pw.dir[1] * 3, pw.pos[2] + pw.dir[2] * 3);
      sp.renderOrder = 5;
      this.markerGroup.add(sp);
      this.markers.push(sp);
    }
    this.dirty = true;
  }

  selectDevice(id) {
    if (this.selBox) { this.scene.remove(this.selBox); this.selBox.geometry.dispose(); this.selBox = null; }
    if (this.selLabel) { this.scene.remove(this.selLabel); this.selLabel = null; }
    const e = id && this.models.get(id);
    if (e) {
      const box = new THREE.Box3().setFromObject(e.model.group).expandByScalar(4);
      this.selBox = new THREE.Box3Helper(box, 0x22d3ee);
      this.scene.add(this.selBox);
      const def = DEVICE_DEFS[e.dev.type];
      const props = deviceProps(e.dev);
      this.selLabel = labelSprite(def.category === 'field' && props.label ? `${def.short} · ${props.label}` : def.name, { scale: 0.4 });
      const c = box.getCenter(new THREE.Vector3());
      this.selLabel.position.set(c.x, box.max.y + 22, c.z);
      this.scene.add(this.selLabel);
    }
    this.dirty = true;
  }

  selectCable(id) {
    if (this.selConn) { const c = this.cables.get(this.selConn); if (c) setCableHighlight(c, false); }
    this.selConn = id;
    if (id) { const c = this.cables.get(id); if (c) setCableHighlight(c, true); }
    this.dirty = true;
  }

  modelOf(id) { const e = this.models.get(id); return e ? e.model : null; }

  /** Render a device thumbnail (data URL) — used by the device library. */
  thumbnail(dev, w = 200, h = 150) {
    const model = buildModel(dev, { hmiTexture: this.hmiTexture, laptopTexture: this.laptopTexture });
    if (!model) return '';
    const sc = new THREE.Scene();
    sc.environment = this.scene.environment;
    sc.add(new THREE.HemisphereLight(0xffffff, 0x334155, 1.2));
    const dl = new THREE.DirectionalLight(0xffffff, 1.8); dl.position.set(300, 500, 800); sc.add(dl);
    sc.add(model.group);
    const box = new THREE.Box3().setFromObject(model.group);
    const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    const cam = new THREE.PerspectiveCamera(30, w / h, 1, 5000);
    const def = DEVICE_DEFS[dev.type];
    const d = def.sim === 'motor' ? new THREE.Vector3(0.7, 0.5, 1) : def.sim === 'laptop' ? new THREE.Vector3(0.3, 0.8, 1) : new THREE.Vector3(0.5, 0.35, 1);
    const dist = (s.length() / 2) / Math.tan((15 * Math.PI) / 180) * 1.05;
    cam.position.copy(c).add(d.normalize().multiplyScalar(dist));
    cam.lookAt(c);
    const rt = new THREE.WebGLRenderTarget(w * 2, h * 2, { samples: 4 });
    rt.texture.colorSpace = THREE.SRGBColorSpace;
    const r = this.renderer;
    const prevBg = sc.background;
    r.setRenderTarget(rt);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(sc, cam);
    const px = new Uint8Array(w * 2 * h * 2 * 4);
    r.readRenderTargetPixels(rt, 0, 0, w * 2, h * 2, px);
    r.setRenderTarget(null);
    void prevBg;
    rt.dispose();
    disposeModel(model);
    const canvas = document.createElement('canvas');
    canvas.width = w * 2; canvas.height = h * 2;
    const g = canvas.getContext('2d');
    const img = g.createImageData(w * 2, h * 2);
    for (let y = 0; y < h * 2; y++) img.data.set(px.subarray((h * 2 - 1 - y) * w * 2 * 4, (h * 2 - y) * w * 2 * 4), y * w * 2 * 4);
    g.putImageData(img, 0, 0);
    this.dirty = true;
    return canvas.toDataURL('image/png');
  }
}

/** Stand-in used when WebGL 2 is not available: the rest of the lab keeps working. */
export class NullScene {
  constructor(host) {
    this.host = host;
    this.controls = { enabled: true };
    this.renderer = { shadowMap: {} };
    this.visible = true;
    this.failed = true;
  }
  setProject(p) { this.project = p; }
  setSystem(s) { this.system = s; }
  setRunning() {}
  syncDevices() {}
  syncCables() {}
  focus() {}
  selectDevice() {}
  selectCable() {}
  setMarkers() {}
  modelOf() { return null; }
  portsNear() { return []; }
  pickControl() { return null; }
  pickDevice() { return null; }
  pickCable() { return null; }
  portWorld() { return null; }
  getView() { return null; }
  setView() {}
  updateFlows() {}
  resize() {}
  snapshot() { throw new Error('no WebGL'); }
  thumbnail() { return ''; }
  dispose() {}
}
