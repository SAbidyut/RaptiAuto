// Cables and wires: sagging tubes between port positions, with ferrules, banana plugs or
// connector bodies (RJ45, D-sub 9, mini-DIN, USB, pluggable terminal) at the ends.
import { THREE, MAT, mat, canvasTexture, rbox, box, cyl } from './kit.js';

const V = (a) => new THREE.Vector3(...a);

let flowBase = null, commBase = null, peBase = null;
function flowTexture() {
  if (!flowBase) {
    flowBase = canvasTexture(64, 8, (g, w, h) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
      const gr = g.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(16, 0, 32, h);
    }, { repeat: true, srgb: false });
  }
  return flowBase;
}
function commTexture() {
  if (!commBase) {
    commBase = canvasTexture(64, 8, (g, w, h) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff';
      for (let i = 0; i < 3; i++) g.fillRect(8 + i * 18, 0, 6, h);
    }, { repeat: true, srgb: false });
  }
  return commBase;
}
function peTexture() {
  if (!peBase) {
    peBase = canvasTexture(64, 64, (g, w, h) => {
      g.fillStyle = '#2f9e44'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#f5d90a';
      for (let i = -2; i < 4; i++) { g.beginPath(); g.moveTo(i * 24, 0); g.lineTo(i * 24 + 12, 0); g.lineTo(i * 24 + 12 + 32, h); g.lineTo(i * 24 + 32, h); g.closePath(); g.fill(); }
    }, { repeat: true });
  }
  return peBase;
}

const COMM_COLORS = { rs485: 0x5b6470, rs232: 0x23262c, usb: 0x2b2e35 };

/** Connector body for comm cables (+Y = out of the port). Returns {group, len}. */
function connector(kind) {
  const g = new THREE.Group();
  let len = 14;
  const add = (geo, m, x, y, z) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.castShadow = true; g.add(me); return me; };
  switch (kind) {
    case 'rj45': {
      const clear = mat('rjClear', { color: 0xdfe8f2, roughness: 0.15, transparent: true, opacity: 0.75 });
      add(box(11.6, 14, 8), clear, 0, 4, 0);
      add(box(9, 1, 1), MAT.gold, 0, -2.6, 2.6);
      add(rbox(9, 12, 9, 2), mat('boot485', { color: 0x4a5563, roughness: 0.6 }), 0, 16, 0);
      len = 22; break;
    }
    case 'db9': {
      add(box(31, 4, 12.5), MAT.steel, 0, 1.5, 0);
      add(rbox(38, 16, 16, 3), mat('dbHood', { color: 0x6b7280, roughness: 0.55 }), 0, 11, 0);
      add(cyl(1.8, 1.8, 10, 10), MAT.steel, -15, 9, 0);
      add(cyl(1.8, 1.8, 10, 10), MAT.steel, 15, 9, 0);
      len = 20; break;
    }
    case 'minidin':
      add(cyl(6.2, 6.2, 16, 20), MAT.blackPlastic, 0, 8, 0);
      add(cyl(4.8, 4.8, 3, 20), MAT.steel, 0, 0.5, 0);
      len = 18; break;
    case 'usba':
      add(box(12, 12, 4.6), MAT.steel, 0, 6, 0);
      add(rbox(16, 22, 8, 2.5), MAT.blackPlastic, 0, 22, 0);
      len = 32; break;
    case 'usbmini':
      add(box(7, 6, 3), MAT.steel, 0, 3, 0);
      add(rbox(11, 16, 7, 2), MAT.blackPlastic, 0, 13, 0);
      len = 21; break;
    case 'plug3':
      add(rbox(16, 12, 9, 1.5), MAT.greenPlug, 0, 6, 0);
      add(box(16, 2, 6), MAT.steel, 0, 12.5, 0);
      len = 14; break;
    default:
      add(box(8, 10, 8), MAT.blackPlastic, 0, 5, 0);
  }
  return { group: g, len };
}

function orientAt(obj, pos, dir) {
  obj.position.copy(pos);
  obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
}

/**
 * Build the 3D cable for a connection.
 * ends: [{pos:[x,y,z], dir:[x,y,z], port, dev}] (world space)
 */
export function buildCable(conn, ends) {
  const [A, B] = ends;
  const group = new THREE.Group();
  group.userData.connId = conn.id;
  const pa = A.port, pb = B.port;
  const comm = !!conn.comm;
  const patch = !comm && (pa.kind === 'sock' || pb.kind === 'sock');
  const motor = !comm && pa.sig === 'mot' && pb.sig === 'mot';
  const radius = comm ? 2.8 : motor ? 2.3 : patch ? 1.9 : 1.35;
  const pos0 = V(A.pos), pos1 = V(B.pos), d0 = V(A.dir).normalize(), d1 = V(B.dir).normalize();
  // end fittings
  const color = new THREE.Color(conn.color && conn.color !== 'pe' ? conn.color : comm ? COMM_COLORS[pa.bus] || 0x444a55 : 0x2f9e44);
  const ins = new THREE.MeshStandardMaterial({ color, roughness: comm ? 0.62 : 0.42, metalness: 0.02 });
  if (conn.color === 'pe') { const t = peTexture().clone(); t.needsUpdate = true; ins.map = t; ins.color.set(0xffffff); }
  const ends3 = [];
  for (const [p, d, info] of [[pos0, d0, A], [pos1, d1, B]]) {
    let len;
    if (comm) {
      const c = connector(info.port.conn);
      orientAt(c.group, p, d);
      group.add(c.group);
      len = c.len;
    } else if (info.port.kind === 'sock') {
      const plug = new THREE.Group();
      const sleeve = new THREE.Mesh(cyl(3.3, 3.6, 16, 16), ins);
      sleeve.position.y = 9;
      const tip = new THREE.Mesh(cyl(2, 2, 3, 12), MAT.brass);
      tip.position.y = 1;
      const grip = new THREE.Mesh(cyl(2.6, 3.3, 6, 14), ins);
      grip.position.y = 19.5;
      plug.add(sleeve, tip, grip);
      orientAt(plug, p, d);
      group.add(plug);
      len = 22;
    } else {
      const fer = new THREE.Group();
      const sleeve = new THREE.Mesh(cyl(radius + 0.5, radius + 0.3, 7, 12), ins);
      sleeve.position.y = 7.5;
      const metal = new THREE.Mesh(cyl(1.0, 1.0, 5, 10), MAT.steel);
      metal.position.y = 2;
      fer.add(sleeve, metal);
      orientAt(fer, p, d);
      group.add(fer);
      len = 10;
    }
    ends3.push(p.clone().add(d.clone().multiplyScalar(len)));
  }
  // route
  const [e0, e1] = ends3;
  const dist = e0.distanceTo(e1);
  const lead = comm ? 24 : patch ? 16 : 10;
  const p1 = e0.clone().add(d0.clone().multiplyScalar(lead));
  const q1 = e1.clone().add(d1.clone().multiplyScalar(lead));
  const mid = p1.clone().add(q1).multiplyScalar(0.5);
  const sag = Math.max(14, Math.min(240, dist * (patch ? 0.26 : 0.2)));
  mid.y -= sag;
  if (Math.max(p1.z, q1.z) < 170) mid.z = Math.max(p1.z, q1.z) + 18 + dist * 0.05;
  mid.y = Math.max(mid.y, 5 + radius);
  const pts = [e0, e0.clone().lerp(p1, 0.55), p1, mid, q1, e1.clone().lerp(q1, 0.55), e1];
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
  const segs = Math.max(24, Math.min(110, Math.round(curve.getLength() / 9)));
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, radius, comm ? 10 : 7, false), ins);
  tube.castShadow = true;
  tube.userData.connId = conn.id;
  tube.userData.isCable = true;
  group.add(tube);
  const length = curve.getLength();
  if (ins.map) { ins.map.repeat.set(length / 12, 1); }
  group.userData = { connId: conn.id, tube, ins, length, comm, baseColor: color.clone(), flow: null };
  return group;
}

/** Live animation: current flow along powered wires, data pulses on busy comm cables. */
export function setCableFlow(cable, mode) {
  const u = cable.userData;
  if (u.flowMode === mode) return false;
  u.flowMode = mode;
  const m = u.ins;
  if (!mode) {
    m.emissiveMap = null; m.emissive.set(0x000000); m.emissiveIntensity = 0; m.needsUpdate = true;
    u.flow = null;
    return true;
  }
  const t = (mode === 'data' ? commTexture() : flowTexture()).clone();
  t.needsUpdate = true;
  t.repeat.set(Math.max(1, u.length / (mode === 'data' ? 60 : 40)), 1);
  m.emissiveMap = t;
  m.emissive.set(mode === 'data' ? 0x22d3ee : 0xfff1a8);
  m.emissiveIntensity = mode === 'data' ? 1.6 : 0.55;
  m.needsUpdate = true;
  u.flow = t;
  return true;
}

export function setCableHighlight(cable, on) {
  const u = cable.userData;
  if (u.hl === on) return;
  u.hl = on;
  if (on) { u.ins.emissive.set(0x22d3ee); u.ins.emissiveIntensity = 0.8; u.ins.emissiveMap = null; u.ins.needsUpdate = true; u.flowMode = '__hl'; }
  else { u.flowMode = undefined; u.ins.emissive.set(0x000000); u.ins.emissiveIntensity = 0; u.ins.needsUpdate = true; }
}

export function disposeCable(cable) {
  cable.traverse((o) => {
    if (o.isMesh && o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
  });
  const u = cable.userData;
  if (u.ins) { if (u.ins.map) u.ins.map.dispose(); if (u.flow) u.flow.dispose(); u.ins.dispose(); }
}
