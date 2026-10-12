// The Network view of the 3D lab (x-ray of the communication): power wiring, ducts and the devices
// that do not communicate fade out, the RS-485 / RS-232 / USB cables glow in their bus colour, every
// device gets a tag with its role and station address (MASTER, ID 1 …, the serial format), every comm
// port a label, each cable its bus name, and the two ends of an RS-485 line their 120 Ω terminating
// resistors. While the lab runs, the ring of a port pulses when its device is addressed (green =
// answered, red = no answer / exception). Labels keep the same size on screen at any zoom and switch
// to a compact form when small.
import { THREE, canvasTexture, rrect, txt, mat, cyl, FONT } from './kit.js';
import { DEVICE_DEFS, devicePorts, deviceProps, busName } from '../devices/defs.js';
import { mbStation, mbFormat } from '../sim/mbdevices.js';
import { vfdFormat, defaultParams } from '../sim/vfd.js';
import { fmtName } from '../sim/modbus.js';

export const BUS_HEX = { rs485: '#a78bfa', rs232: '#fbbf24', usb: '#38bdf8' };
const PKT = { res: '#34d399', err: '#f87171' };
const V = (a) => new THREE.Vector3(...a);
const keyOf = (dev, port) => dev + '|' + port;

// ------------------------------------------------------------------ screen-sized labels
/**
 * A label that keeps its size on screen (sizeAttenuation off): lines = [{text, size, color, bold}].
 * `accent` draws a coloured bar on the left. anchor: the point of the label at its position.
 */
function makeTag(lines, { accent = null, bg = 'rgba(9,14,28,.9)', border = 'rgba(148,163,184,.45)', anchor = [0.5, 0], pad = 7, radius = 9 } = {}) {
  const dpr = 2;
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  let w = 0, h = pad * 2 - 2;
  for (const l of lines) { g.font = `${l.bold ? 800 : 600} ${l.size}px ${FONT}`; w = Math.max(w, g.measureText(l.text).width); h += l.size * 1.28; }
  const bar = accent ? 5 : 0;
  const W = Math.ceil(w + pad * 2 + bar), H = Math.ceil(h);
  c.width = W * dpr; c.height = H * dpr;
  g.scale(dpr, dpr);
  rrect(g, 1, 1, W - 2, H - 2, Math.min(radius, H / 2 - 1));
  g.fillStyle = bg; g.fill();
  g.lineWidth = 1.4; g.strokeStyle = border; g.stroke();
  if (accent) { g.save(); rrect(g, 1, 1, W - 2, H - 2, Math.min(radius, H / 2 - 1)); g.clip(); g.fillStyle = accent; g.fillRect(0, 0, bar + 1, H); g.restore(); }
  let y = pad - 1;
  for (const l of lines) {
    txt(g, l.text, pad + bar, y + l.size * 0.66, { size: l.size, color: l.color || '#e2e8f0', weight: l.bold ? 800 : 600, align: 'left' });
    y += l.size * 1.28;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false, toneMapped: false }));
  sp.center.set(anchor[0], anchor[1]);
  sp.renderOrder = 22;
  sp.userData.px = [W, H];
  return sp;
}
function disposeSprite(sp) { if (!sp) return; sp.material.map.dispose(); sp.material.dispose(); }

let ringTex = null;
function ringTexture() {
  if (!ringTex) {
    ringTex = canvasTexture(64, 64, (g) => {
      g.strokeStyle = '#fff'; g.lineWidth = 5; g.beginPath(); g.arc(32, 32, 25, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = 0.22; g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 32, 22, 0, Math.PI * 2); g.fill();
    });
  }
  return ringTex;
}

// ------------------------------------------------------------------ the overlay
export class NetOverlay {
  constructor(scene) {
    this.s = scene;
    this.group = new THREE.Group();
    this.group.renderOrder = 20;
    this.viewGroup = new THREE.Group();
    this.group.add(this.viewGroup);
    this.on = false;
    this.lastN = 0;
    this.links = [];
    this.adj = new Map();
    this.tags = [];
    this.rings = new Map();
    this.faded = [];
    this.fadeCache = new Map();
    this.textT = 0;
  }

  dispose() { this.clearView(); for (const m of this.fadeCache.values()) m.dispose(); }

  // ---------------------------------------------------------------- topology
  /** Comm cables as a graph of ports (dev|port), after the cables were (re)built. */
  rebuild() {
    const S = this.s, P = S.project;
    this.links = [];
    this.adj = new Map();
    if (!P) return;
    const byId = new Map(P.devices.map((d) => [d.id, d]));
    for (const c of P.conns) {
      if (!c.comm) continue;
      const cab = S.cables.get(c.id);
      const da = byId.get(c.a.dev);
      const pa = da && devicePorts(da).find((p) => p.id === c.a.port);
      if (!cab || !pa) continue;
      const link = { conn: c, cab, bus: pa.bus, a: keyOf(c.a.dev, c.a.port), b: keyOf(c.b.dev, c.b.port), line: cab.userData.line };
      this.links.push(link);
      for (const [k, o] of [[link.a, link.b], [link.b, link.a]]) { if (!this.adj.has(k)) this.adj.set(k, []); this.adj.get(k).push({ link, other: o }); }
    }
    this.netDevs = new Set(this.links.flatMap((l) => [l.conn.a.dev, l.conn.b.dev]));
    if (this.on) { this.clearView(); this.buildView(); }
  }

  // ---------------------------------------------------------------- activity
  /** New frames in the simulator's comm log make the rings of the ports involved pulse. */
  poll(sys) {
    const log = sys.log;
    if (!log.length) return;
    if (this.lastN > log[log.length - 1].n) this.lastN = 0; // a new simulation
    for (let i = log.length - 1; i >= 0 && log[i].n > this.lastN; i--) {
      const l = log[i], ids = l.ids;
      if (!ids) continue;
      if (l.dir === 'TX' && ids.to) this.flash(keyOf(ids.to, ids.toPort), '#f8fafc');
      else if (l.dir === 'RX' && ids.from) this.flash(keyOf(ids.from, ids.fromPort), PKT.res);
      else if (l.dir === 'ERR') this.flash(ids.from ? keyOf(ids.from, ids.fromPort) : keyOf(ids.to, ids.toPort), PKT.err);
    }
    this.lastN = log[log.length - 1].n;
  }

  flash(key, color) {
    const r = this.rings.get(key);
    if (r) { r.userData.flash = 1; r.material.color.set(color); }
  }

  /** Per frame (only the Network view draws anything). Returns true when something changed. */
  tick(dt, sys, running) {
    if (!this.on) return false;
    if (sys && running) this.poll(sys);
    return this.updateView(dt);
  }

  // ---------------------------------------------------------------- Network view
  setOn(on) {
    if (on === this.on) return;
    this.on = on;
    if (on) { this.buildView(); this.applyFade(true); } else { this.applyFade(false); this.clearView(); }
  }

  clearView() {
    for (const o of this.viewGroup.children.slice()) {
      this.viewGroup.remove(o);
      o.traverse((m) => {
        if (m.isSprite && m.userData.px) { disposeSprite(m); return; }
        if (m.material && !m.material.name) m.material.dispose();
        if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
      });
    }
    this.tags = [];
    this.rings.clear();
    this.cableTags = [];
  }

  /** Text of a device's tag: [title, compact, sub line, accent]. */
  describe(dev) {
    const def = DEVICE_DEFS[dev.type];
    const sys = this.s.system;
    const rt = sys && sys.rts.get(dev.id);
    const pr = deviceProps(dev);
    switch (def.sim) {
      case 'plc': {
        const cpu = rt && rt.cpu && rt.cpu.powered ? rt.cpu : null;
        const master = cpu && cpu.mbReq.size > 0;
        const st = cpu ? cpu.D[1121] || 1 : 1;
        const slave = cpu && !master && this.adj.has(keyOf(dev.id, 'COM2')) && [...this.s.models.values()].some((e) => e.dev.id !== dev.id && DEVICE_DEFS[e.dev.type].sim === 'plc');
        const role = master ? 'MODBUS MASTER' : slave ? `SLAVE · ID ${st}` : 'PLC';
        return [`${def.short} · ${role}`, master ? 'MASTER' : slave ? `ID ${st}` : 'PLC', cpu ? `COM2 ${fmtName(cpu.com2Format())}` : 'COM1 RS-232 · COM2 RS-485', master ? '#3b82f6' : '#a78bfa'];
      }
      case 'vfd': {
        const p = { ...defaultParams(), ...((rt && rt.vfd && rt.vfd.params) || dev.state.params || {}) };
        return [`${def.short} · ID ${p['09-00']}`, `ID ${p['09-00']}`, `RS-485 ${fmtName(vfdFormat(p))}`, '#a78bfa'];
      }
      case 'tc': case 'mbth': case 'meter':
        return [`${def.short}${pr.label ? ' ' + pr.label : ''} · ID ${mbStation(pr)}`, `ID ${mbStation(pr)}`, `RS-485 ${fmtName(mbFormat(pr))}`, '#a78bfa'];
      case 'hmi':
        return [`HMI · ${def.short}`, 'HMI', `${pr.port} → PLC station ${pr.station ?? 1} · Delta DVP`, '#06b6d4'];
      case 'laptop':
        return ['Laptop · ISPSoft', 'PC', 'USB → PLC (program / monitor)', '#38bdf8'];
      default:
        return [def.short, def.short, '', '#64748b'];
    }
  }

  buildView() {
    const S = this.s;
    // device tags
    for (const [id, e] of S.models) {
      if (!this.netDevs.has(id) && !devicePorts(e.dev).some((p) => p.kind === 'comm' && ['tc', 'mbth', 'meter'].includes(DEVICE_DEFS[e.dev.type].sim))) continue;
      const box = new THREE.Box3().setFromObject(e.model.group);
      const anchor = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y + 6, (box.min.z + box.max.z) / 2 + (box.max.z - box.min.z) * 0.3);
      const tag = { id, e, box, anchor, text: '', full: null, compact: null, mode: null };
      this.tags.push(tag);
      this.refreshTag(tag);
    }
    // rings on every comm port of the network devices
    for (const [id, e] of S.models) {
      for (const p of devicePorts(e.dev)) {
        if (p.kind !== 'comm') continue;
        const k = keyOf(id, p.id);
        const used = this.adj.has(k);
        if (!used && !this.netDevs.has(id)) continue;
        const pw = S.portWorld(id, p.id);
        if (!pw) continue;
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTexture(), color: used ? BUS_HEX[p.bus] : '#64748b', transparent: true, opacity: used ? 0.95 : 0.55, depthTest: false, depthWrite: false, toneMapped: false }));
        sp.position.set(pw.pos[0] + pw.dir[0] * 4, pw.pos[1] + pw.dir[1] * 4, pw.pos[2] + pw.dir[2] * 4);
        sp.userData.base = p.conn === 'db9' ? 30 : 20;
        sp.userData.color = used ? BUS_HEX[p.bus] : '#64748b';
        sp.scale.setScalar(sp.userData.base);
        sp.renderOrder = 18;
        this.rings.set(k, sp);
        this.viewGroup.add(sp);
        // port label: what the connector is
        const lbl = makeTag([{ text: portText(e.dev, p), size: 10.5, bold: true, color: used ? '#f8fafc' : '#94a3b8' }], { accent: used ? BUS_HEX[p.bus] : '#475569', anchor: [0.5, 1.25], pad: 4, radius: 6 });
        lbl.position.copy(sp.position);
        lbl.userData.ofDev = id;
        lbl.userData.portLabel = true;
        this.viewGroup.add(lbl);
        this.tags.push({ id, port: true, sprite: lbl, e });
      }
    }
    // a bus label on the longest cable of each line, and the RS-485 terminators
    const comps = this.components();
    this.cableTags = [];
    for (const comp of comps) {
      const longest = comp.links.reduce((a, l) => (l.cab.userData.length > (a ? a.cab.userData.length : 0) ? l : a), null);
      if (!longest) continue;
      const line = longest.line;
      const mid = line[Math.floor(line.length * 0.42)].clone();
      const txtL = comp.bus === 'rs485' ? `RS-485 · Modbus · ${comp.nodes.size - 1} link${comp.links.length > 1 ? 's' : ''}` : comp.bus === 'rs232' ? 'RS-232 · COM1' : 'USB';
      const sp = makeTag([{ text: txtL, size: 11, bold: true, color: '#0b1220' }], { bg: BUS_HEX[comp.bus], border: 'rgba(255,255,255,.6)', anchor: [0.5, 0.5], pad: 4, radius: 7 });
      sp.position.copy(mid);
      this.viewGroup.add(sp);
      this.cableTags.push(sp);
      if (comp.bus === 'rs485') for (const k of comp.ends) this.addTerminator(k);
    }
    this.applyGlow(true);
    this.updateView(0, true);
  }

  /** Lines (connected comm cables): {bus, links, nodes, ends (ports with one cable)}. */
  components() {
    const seen = new Set(), out = [];
    for (const l of this.links) {
      if (seen.has(l)) continue;
      const comp = { bus: l.bus, links: [], nodes: new Set(), ends: [] };
      const stack = [l.a];
      comp.nodes.add(l.a);
      while (stack.length) {
        const k = stack.pop();
        for (const e of this.adj.get(k) || []) {
          if (!seen.has(e.link)) { seen.add(e.link); comp.links.push(e.link); }
          if (!comp.nodes.has(e.other)) { comp.nodes.add(e.other); stack.push(e.other); }
        }
      }
      comp.ends = [...comp.nodes].filter((k) => (this.adj.get(k) || []).length === 1);
      out.push(comp);
    }
    return out;
  }

  /** 120 Ω resistor across D+ / D− at the end of an RS-485 line. */
  addTerminator(key) {
    const [dev, port] = key.split('|');
    const pw = this.s.portWorld(dev, port);
    const e = this.s.models.get(dev);
    if (!pw || !e) return;
    const side = new THREE.Vector3(1, 0, 0).applyQuaternion(e.model.group.quaternion);
    const dir = V(pw.dir).normalize();
    const out = dir.clone().multiplyScalar(port === 'RS485' && pw.port.conn === 'rj45' ? 10 : 7);
    const sideK = pw.port.conn === 'rj45' ? 14 : -15;
    const pos = V(pw.pos).add(out).addScaledVector(side, sideK);
    const g = new THREE.Group();
    const body = new THREE.Mesh(cyl(1.7, 1.7, 7.5, 14), mat('res120', { color: 0xd8c8a0, roughness: 0.5 }));
    g.add(body);
    // colour code 120 Ω: brown red brown, gold
    [[-2.2, 0x7c4a1e], [-0.8, 0xdc2626], [0.6, 0x7c4a1e], [2.4, 0xd4af37]].forEach(([y, c]) => { const b = new THREE.Mesh(cyl(1.78, 1.78, 0.8, 14), mat('resBand' + c, { color: c, roughness: 0.5 })); b.position.y = y; g.add(b); });
    for (const s of [-1, 1]) { const lead = new THREE.Mesh(cyl(0.35, 0.35, 5, 6), mat('resLead', { color: 0xc4cad2, metalness: 0.8, roughness: 0.3 })); lead.position.y = s * 6.2; g.add(lead); }
    g.position.copy(pos);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), side);
    this.viewGroup.add(g);
    // its label beside it (the port's own label sits above the port)
    const lbl = makeTag([{ text: '120 Ω', size: 10.5, bold: true, color: '#fde68a' }], { border: 'rgba(253,230,138,.6)', anchor: sideK > 0 ? [-0.25, 0.5] : [1.25, 0.5], pad: 4, radius: 6 });
    lbl.position.copy(pos);
    lbl.userData.ofDev = dev;
    lbl.userData.portLabel = true;
    this.viewGroup.add(lbl);
    this.tags.push({ id: dev, port: true, sprite: lbl, e });
  }

  refreshTag(tag) {
    const [title, compact, sub, accent] = this.describe(tag.e.dev);
    const text = title + '|' + sub + '|' + compact;
    if (text === tag.text) return;
    tag.text = text;
    for (const k of ['full', 'compact']) if (tag[k]) { this.viewGroup.remove(tag[k]); disposeSprite(tag[k]); }
    tag.full = makeTag([{ text: title, size: 13, bold: true }, ...(sub ? [{ text: sub, size: 10.5, color: '#a5b4fc' }] : [])], { accent, anchor: [0.5, 0] });
    tag.compact = makeTag([{ text: compact, size: 11.5, bold: true, color: '#0b1220' }], { bg: accent, border: 'rgba(255,255,255,.7)', anchor: [0.5, 0], pad: 4, radius: 8 });
    for (const sp of [tag.full, tag.compact]) { sp.position.copy(tag.anchor); sp.visible = false; this.viewGroup.add(sp); }
    tag.mode = null;
  }

  /** Label size / level of detail, ring pulses; text refresh about once a second. */
  updateView(dt, force = false) {
    const S = this.s, cam = S.camera;
    const vh = S.renderer.domElement.clientHeight || 600;
    const k = (2 * Math.tan((cam.fov * Math.PI) / 360)) / vh;
    let moved = false;
    this.textT -= dt;
    const refresh = this.textT <= 0;
    if (refresh) this.textT = 1;
    // how big is each device on screen?
    const sizeOf = new Map();
    const v = new THREE.Vector3();
    for (const tag of this.tags) {
      if (tag.port || sizeOf.has(tag.id)) continue;
      const b = tag.box;
      v.set((b.min.x + b.max.x) / 2, b.min.y, (b.min.z + b.max.z) / 2).project(cam);
      const y0 = v.y;
      v.set((b.min.x + b.max.x) / 2, b.max.y, (b.min.z + b.max.z) / 2).project(cam);
      sizeOf.set(tag.id, Math.abs(v.y - y0) * vh / 2);
    }
    for (const tag of this.tags) {
      if (tag.port) {
        const big = (sizeOf.get(tag.id) ?? 0) > 150;
        if (tag.sprite.visible !== big) { tag.sprite.visible = big; moved = true; }
        tag.sprite.scale.set(tag.sprite.userData.px[0] * k, tag.sprite.userData.px[1] * k, 1);
        continue;
      }
      if (refresh) this.refreshTag(tag);
      const mode = (sizeOf.get(tag.id) ?? 0) > 70 ? 'full' : 'compact';
      if (mode !== tag.mode) { tag.mode = mode; tag.full.visible = mode === 'full'; tag.compact.visible = mode !== 'full'; moved = true; }
      const sp = tag[mode];
      sp.scale.set(sp.userData.px[0] * k, sp.userData.px[1] * k, 1);
    }
    for (const sp of this.cableTags || []) {
      sp.scale.set(sp.userData.px[0] * k, sp.userData.px[1] * k, 1);
      const near = cam.position.distanceTo(sp.position) < 1100;
      if (sp.visible !== near) { sp.visible = near; moved = true; }
    }
    for (const r of this.rings.values()) {
      const f = r.userData.flash || 0;
      if (f > 0) { r.userData.flash = Math.max(0, f - dt * 2.2); moved = true; if (!r.userData.flash) r.material.color.set(r.userData.color); }
      r.scale.setScalar(r.userData.base * (1 + f * 0.9));
    }
    return moved || force;
  }

  /** Comm cables glow in their bus colour while the Network view is on. */
  applyGlow(on) {
    for (const l of this.links) {
      const u = l.cab.userData;
      if (u.hl) continue;
      if (on) { u.ins.emissive.set(BUS_HEX[l.bus]); u.ins.emissiveIntensity = 1.5; u.ins.emissiveMap = null; u.ins.needsUpdate = true; u.flowMode = 'net'; u.flow = null; } else { u.ins.emissive.set(0x000000); u.ins.emissiveIntensity = 0; u.ins.needsUpdate = true; u.flowMode = undefined; }
    }
  }

  /** X-ray: fade the power wiring, the ducts, the mains cable and the devices that do not communicate. */
  applyFade(on) {
    const S = this.s;
    if (!on) {
      for (const [o, m0] of this.faded) { o.material = m0; }
      this.faded = [];
      for (const cab of S.cables.values()) if (!cab.userData.comm) cab.traverse((o) => { o.visible = true; });
      this.applyGlow(false);
      return;
    }
    const fade = (o, k = 0.14) => {
      if (!o.isMesh || !o.material || Array.isArray(o.material)) return;
      let f = this.fadeCache.get(o.material.uuid + k);
      if (!f) { f = o.material.clone(); f.transparent = true; f.opacity = k; f.depthWrite = false; this.fadeCache.set(o.material.uuid + k, f); }
      this.faded.push([o, o.material]);
      o.material = f;
    };
    for (const [id, e] of S.models) if (!this.netDevs.has(id)) e.model.group.traverse((o) => fade(o, 0.16));
    for (const obj of [S.ducts, S.mains]) if (obj) obj.traverse((o) => fade(o, 0.1));
    for (const cab of S.cables.values()) {
      if (cab.userData.comm) continue;
      cab.traverse((o) => { if (o !== cab.userData.tube && o !== cab) o.visible = false; });
      fade(cab.userData.tube, 0.08);
    }
  }

  /** The cables were rebuilt (new materials): put the Network view back on them. */
  reapply() {
    if (!this.on) return;
    for (const [o, m0] of this.faded) o.material = m0;
    this.faded = [];
    this.applyFade(true);
  }

  /** Box around every device that communicates (for the camera). */
  bounds() {
    const box = new THREE.Box3();
    for (const [id, e] of this.s.models) if (this.netDevs.has(id) && e.place && e.place.zone !== 'desk') box.expandByObject(e.model.group);
    return box;
  }
}

/** "COM2 · RS-485 (D+ D− SG)" etc. */
function portText(dev, p) {
  const def = DEVICE_DEFS[dev.type];
  const conn = { term3: 'D+ D− SG', term2: (p.pins || ['D+', 'D−']).join(' '), rj45: 'RJ45', db9: 'DB9', minidin: 'mini-DIN 8', usbmini: 'mini-USB', usba: 'USB-A' }[p.conn] || '';
  const name = def.sim === 'plc' || def.sim === 'hmi' ? p.id : '';
  return [...new Set([name, busName(p.bus), conn].filter(Boolean))].join(' · ');
}
