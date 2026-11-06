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

const COMM_COLORS = { rs485: 0x6a4c9c, rs232: 0x23262c, usb: 0x2b2e35 };

/**
 * RS-485 wires on screw terminals: a sleeve `shift` mm to the side (+X) of the terminals with one
 * ferrule wire per terminal (D+ white, D− blue, SG black), bent from the sleeve into the terminal.
 */
function screwWires(g, n, shift) {
  const cols = [0xf2f2f2, 0x2563eb, 0x1b1d22];
  const pitch = n === 3 ? 5.5 : 6;
  const lift = shift ? 20 : 15; // sleeve height above the terminal
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * pitch;
    const m = mat('rsw' + i, { color: cols[i], roughness: 0.6 });
    const fer = new THREE.Mesh(cyl(0.9, 0.9, 6, 8), MAT.steel); fer.position.set(x, 3, 0); g.add(fer);
    // insulated wire from the ferrule to the sleeve (straight up, or bent toward a sleeve to the side)
    const a = new THREE.Vector3(x, 6, 0), b = new THREE.Vector3(x * 0.8 + shift, lift - 3, 0);
    const len = a.distanceTo(b);
    const w = new THREE.Mesh(cyl(1.15, 1.15, len, 8), m);
    w.position.copy(a).add(b).multiplyScalar(0.5);
    w.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    g.add(w);
  }
  const sl = new THREE.Mesh(rbox(n === 3 ? 15 : 11, 6, 4.6, 1.8), mat('rsSleeve', { color: 0x3a3f47, roughness: 0.7 }));
  sl.position.set(shift, lift, 0);
  g.add(sl);
}

/** Connector body for comm cables (+Y = out of the port). Returns {group, len}. */
function connector(kind, shift = 0) {
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
    case 'term3': case 'term2':
      // RS-485 cable on screw terminals: D+ / D− / SG (or a pair D+ / D−, A+ / B−)
      screwWires(g, kind === 'term3' ? 3 : 2, shift);
      len = shift ? 20 : 16; break;
    case 'plug3':
      add(rbox(16, 12, 9, 1.5), MAT.greenPlug, 0, 6, 0);
      add(box(16, 2, 6), MAT.steel, 0, 12.5, 0);
      len = 14; break;
    default:
      add(box(8, 10, 8), MAT.blackPlastic, 0, 5, 0);
  }
  return { group: g, len };
}

/** Place a fitting at pos with +Y along dir and (when given) +X along the device's side axis. */
function orientAt(obj, pos, dir, side = null) {
  obj.position.copy(pos);
  const y = dir.clone().normalize();
  if (side) {
    const x = V(side);
    x.addScaledVector(y, -x.dot(y));
    // a port that points along the device's side axis (the laptop's USB on its left edge) has no
    // side left over: take the horizontal at right angles to the port instead of a zero vector
    if (x.lengthSq() < 1e-6) x.set(-y.z, 0, y.x);
    if (x.lengthSq() < 1e-6) x.set(1, 0, 0);
    x.normalize();
    const z = new THREE.Vector3().crossVectors(x, y);
    obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    return;
  }
  obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), y);
}

const FILLET = { wire: 7, patch: 11, comm: 15, motor: 10, mains: 18 };
const RADIAL = { wire: 7, patch: 8, comm: 10, motor: 8, mains: 10 };

/** Polyline with rounded corners (a quadratic arc at every bend), as dense points. */
export function filleted(pts, R) {
  const P = pts.map(V);
  const out = [P[0].clone()];
  for (let i = 1; i < P.length - 1; i++) {
    const a = P[i - 1], b = P[i], c = P[i + 1];
    const u = b.clone().sub(a), v = c.clone().sub(b);
    const lu = u.length(), lv = v.length();
    if (lu < 1e-6 || lv < 1e-6) continue;
    u.divideScalar(lu); v.divideScalar(lv);
    const cos = Math.max(-1, Math.min(1, u.dot(v)));
    if (cos > 0.99995) { out.push(b.clone()); continue; }
    const k = Math.min(R, lu * 0.49, lv * 0.49);
    const p0 = b.clone().addScaledVector(u, -k), p1 = b.clone().addScaledVector(v, k);
    const n = Math.max(2, Math.min(14, Math.ceil(Math.acos(cos) / 0.2)));
    for (let j = 0; j <= n; j++) {
      const t = j / n, w0 = (1 - t) * (1 - t), w1 = 2 * (1 - t) * t, w2 = t * t;
      out.push(new THREE.Vector3(p0.x * w0 + b.x * w1 + p1.x * w2, p0.y * w0 + b.y * w1 + p1.y * w2, p0.z * w0 + b.z * w1 + p1.z * w2));
    }
  }
  out.push(P[P.length - 1].clone());
  return out;
}

/**
 * Tube along dense points with rotation-minimising frames: one ring per point, so straight runs
 * stay cheap (two rings) and bends stay round. uv.x runs 0 → 1 along the length.
 */
export function tubeGeometry(line, radius, radial = 8) {
  const n = line.length;
  const T = line.map((p, i) => line[Math.min(n - 1, i + 1)].clone().sub(line[Math.max(0, i - 1)]).normalize());
  const t0 = T[0];
  const ax = Math.abs(t0.x) <= Math.abs(t0.y) && Math.abs(t0.x) <= Math.abs(t0.z) ? new THREE.Vector3(1, 0, 0) : Math.abs(t0.y) <= Math.abs(t0.z) ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
  let N = new THREE.Vector3().crossVectors(t0, ax).normalize();
  const s = [0];
  for (let i = 1; i < n; i++) s.push(s[i - 1] + line[i].distanceTo(line[i - 1]));
  const total = s[n - 1] || 1;
  const ring = radial + 1;
  const pos = new Float32Array(n * ring * 3), nor = new Float32Array(n * ring * 3), uv = new Float32Array(n * ring * 2);
  const axis = new THREE.Vector3(), Bv = new THREE.Vector3(), d = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      axis.crossVectors(T[i - 1], T[i]);
      const l = axis.length();
      if (l > 1e-8) N.applyAxisAngle(axis.divideScalar(l), Math.acos(Math.max(-1, Math.min(1, T[i - 1].dot(T[i])))));
      N.addScaledVector(T[i], -N.dot(T[i])).normalize();
    }
    Bv.crossVectors(T[i], N);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      d.set(N.x * c + Bv.x * sn, N.y * c + Bv.y * sn, N.z * c + Bv.z * sn);
      const k = (i * ring + j) * 3;
      pos[k] = line[i].x + d.x * radius; pos[k + 1] = line[i].y + d.y * radius; pos[k + 2] = line[i].z + d.z * radius;
      nor[k] = d.x; nor[k + 1] = d.y; nor[k + 2] = d.z;
      uv[(i * ring + j) * 2] = s[i] / total; uv[(i * ring + j) * 2 + 1] = j / radial;
    }
  }
  const idx = [];
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < radial; j++) {
    const a = i * ring + j, b = (i + 1) * ring + j;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  g.userData.length = total;
  return g;
}

/**
 * Build the 3D cable for a connection along its route (devices/routing.js):
 * route = { pts (fitting to fitting), r, kind, ends: [{pos, dir, kind: ferrule|plug|conn, conn, len}] }.
 */
export function buildCable(conn, route) {
  const group = new THREE.Group();
  const comm = route.kind === 'comm';
  const radius = route.r;
  const bus = route.ends[0] && route.ends[0].bus;
  const color = new THREE.Color(conn.color && conn.color !== 'pe' ? conn.color : comm ? COMM_COLORS[bus] || 0x444a55 : 0x2f9e44);
  const ins = new THREE.MeshStandardMaterial({ color, roughness: comm ? 0.62 : 0.42, metalness: 0.02 });
  if (conn.color === 'pe') { const t = peTexture().clone(); t.needsUpdate = true; ins.map = t; ins.color.set(0xffffff); }
  for (const f of route.ends) {
    const p = V(f.pos), d = V(f.dir).normalize();
    if (f.kind === 'conn') {
      const c = connector(f.conn, f.shift || 0);
      orientAt(c.group, p, d, f.side);
      group.add(c.group);
    } else if (f.kind === 'plug') {
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
    } else {
      const fer = new THREE.Group();
      const sleeve = new THREE.Mesh(cyl(radius + 0.5, radius + 0.3, 7, 12), ins);
      sleeve.position.y = 7.5;
      const metal = new THREE.Mesh(cyl(1.0, 1.0, 5, 10), MAT.steel);
      metal.position.y = 2;
      fer.add(sleeve, metal);
      orientAt(fer, p, d);
      group.add(fer);
    }
  }
  const line = filleted(route.pts, FILLET[route.kind] || 8);
  const tube = new THREE.Mesh(tubeGeometry(line, radius, RADIAL[route.kind] || 7), ins);
  tube.castShadow = true;
  tube.userData.connId = conn.id;
  tube.userData.isCable = true;
  group.add(tube);
  const length = tube.geometry.userData.length;
  if (ins.map) ins.map.repeat.set(length / 12, 1);
  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  group.userData = { connId: conn.id, tube, ins, length, comm, baseColor: color.clone(), flow: null, line };
  return group;
}

/** A plain cable without fittings (the MCB's mains supply). */
export function buildPlainCable(pts, r, color = 0x3c4048) {
  const line = filleted(pts, FILLET.mains);
  const m = new THREE.Mesh(tubeGeometry(line, r, RADIAL.mains), mat('mainsCable', { color, roughness: 0.7 }));
  m.castShadow = true; m.receiveShadow = true;
  return m;
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
