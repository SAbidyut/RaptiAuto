// 3D cable routing for the lab, worked out like a real control panel:
//  • a panel wire leaves its terminal, bends into the nearest slotted wire duct and runs inside it
//    on a track of its own (a depth layer no other wire uses over the same stretch), changes rows
//    through the vertical ducts at the panel sides and leaves the panel through the bottom duct;
//  • wires from front terminals (VFD, PLC comm ports) drop down in front of the device, each on its
//    own plane, so nothing passes through a device, a terminal or another wire;
//  • on the bench a cable takes the shortest way around the console, HMI stand, motor base and
//    laptop, and lies over the cables it crosses;
//  • console patch cords come over the back edge of the console; cords between console sockets
//    arc above the console. Stacked banana plugs and twin ferrules share a socket / terminal.
// Pure geometry without three.js, so it runs (and is tested) headless.
import { DEVICE_DEFS, devicePorts } from './defs.js';
import { SCENE, toWorld, dirToWorld } from './layout.js';

// ------------------------------------------------------------------ vectors ([x, y, z])
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vlen = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = vlen(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dist = (a, b) => vlen(sub(a, b));

// ------------------------------------------------------------------ cable styles
const CONN_LEN = { rj45: 22, db9: 20, minidin: 18, usba: 32, usbmini: 21, plug3: 14, term3: 16, term2: 16 };
const CONN_HALF = { rj45: 7, db9: 19, minidin: 6.5, usba: 8, usbmini: 6, plug3: 8, term3: 8, term2: 6 };
/** Length of the fitting (ferrule, banana plug or connector body) along the port direction. */
export const fitLength = (port) => (port.kind === 'comm' ? CONN_LEN[port.conn] || 14 : port.kind === 'sock' ? 22 : 10);
const fitHalfWidth = (port, r) => (port.kind === 'comm' ? CONN_HALF[port.conn] || 6 : port.kind === 'sock' ? 3.7 : r + 0.6);

/** Kind and radius of the cable for a connection. */
export function cableStyle(conn, pa, pb) {
  if (conn.comm) return { kind: 'comm', r: 2.8 };
  if (pa.sig === 'mot' && pb.sig === 'mot') return { kind: 'motor', r: 2.3 };
  if (pa.kind === 'sock' || pb.kind === 'sock') return { kind: 'patch', r: 1.9 };
  return { kind: 'wire', r: 1.35 };
}
const LEAD = { wire: 8, patch: 12, comm: 18, motor: 10 };
const GAP = 0.8; // clear space kept between two cables
// distance of a bench end from the obstacle it belongs to: clear of the cables that pass along the
// obstacle, so the cables crossing there have room to lie over it
const APPROACH = 34;
const LANE = 6.4; // bench cables pass an obstacle in lanes this far apart (4 lanes)
const EXIT_RUN = 82; // where cables leaving the panel bottom start across the bench

// ------------------------------------------------------------------ device geometry
/** Device-local bounding box (a little larger than the model). */
function localBox(def) {
  const [w, h, d] = def.size;
  if (def.sim === 'motor') return [[-158, 0, -88], [202, 206, 88]];
  if (def.sim === 'hmi') return [[-101, -9, -3], [101, 147, 48]];
  if (def.sim === 'laptop') return [[-162, 0, -54], [162, 228, 222]];
  if (def.zone === 'console') return [[-33, 0, -1], [33, 87, 30]];
  return [[-w / 2 - 1, 0, 0], [w / 2 + 1, h, d + 4]];
}
function corners(lb) {
  const out = [];
  for (const x of [lb[0][0], lb[1][0]]) for (const y of [lb[0][1], lb[1][1]]) for (const z of [lb[0][2], lb[1][2]]) out.push([x, y, z]);
  return out;
}
function worldBox(place, lb) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const c of corners(lb)) {
    const p = toWorld(place, c);
    for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], p[i]); max[i] = Math.max(max[i], p[i]); }
  }
  return { min, max };
}

// ------------------------------------------------------------------ 2D helpers (bench plane x, z)
function hull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  return lo.slice(0, -1).concat(hi.slice(0, -1)); // counter-clockwise in (x, z)
}
const rect = (x0, z0, x1, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
/** Grow a convex counter-clockwise polygon by d. */
function inflate(poly, d) {
  const n = poly.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = poly[(i + n - 1) % n], b = poly[i], c = poly[(i + 1) % n];
    const n1 = normal2(a, b), n2 = normal2(b, c);
    const k = 1 + n1[0] * n2[0] + n1[1] * n2[1];
    out.push([b[0] + ((n1[0] + n2[0]) / k) * d, b[1] + ((n1[1] + n2[1]) / k) * d]);
  }
  return out;
}
/** Outward normal of edge a→b of a counter-clockwise polygon. */
function normal2(a, b) { const dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; return [dz / l, -dx / l]; }
function insidePoly(poly, p) {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], n = normal2(a, b);
    if (n[0] * (p[0] - a[0]) + n[1] * (p[1] - a[1]) > -0.01) return false;
  }
  return true;
}
/** Does segment p0→p1 run through the interior of a convex polygon? */
function cutsPoly(poly, p0, p1) {
  let t0 = 0, t1 = 1;
  const d = [p1[0] - p0[0], p1[1] - p0[1]];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], n = normal2(a, b);
    const num = n[0] * (a[0] - p0[0]) + n[1] * (a[1] - p0[1]);
    const den = n[0] * d[0] + n[1] * d[1];
    if (Math.abs(den) < 1e-9) { if (num < 0) return false; continue; }
    const t = num / den;
    if (den < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return (t1 - t0) * Math.hypot(d[0], d[1]) > 0.5;
}
/** Shortest path from s to g around convex obstacles (visibility graph + Dijkstra). */
function benchPath(s, g, obstacles, clear) {
  const block = obstacles.map((o) => inflate(o, clear)).filter((p) => !insidePoly(p, s) && !insidePoly(p, g));
  const nodes = [s, g];
  for (const o of obstacles) for (const v of inflate(o, clear + 1.2)) if (!block.some((p) => insidePoly(p, v))) nodes.push(v);
  const free = (a, b) => !block.some((p) => cutsPoly(p, a, b));
  if (free(s, g)) return [s, g];
  const n = nodes.length, best = new Array(n).fill(Infinity), prev = new Array(n).fill(-1), done = new Array(n).fill(false);
  best[0] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && best[i] < Infinity && (u < 0 || best[i] < best[u])) u = i;
    if (u < 0 || u === 1) break;
    done[u] = true;
    for (let v = 0; v < n; v++) {
      if (done[v] || v === u) continue;
      const w = best[u] + Math.hypot(nodes[v][0] - nodes[u][0], nodes[v][1] - nodes[u][1]);
      if (w < best[v] && free(nodes[u], nodes[v])) { best[v] = w; prev[v] = u; }
    }
  }
  if (prev[1] < 0) return [s, g];
  const path = [];
  for (let i = 1; i >= 0; i = prev[i]) path.unshift(nodes[i]);
  return path;
}

/** Least-squares positions near `want` (sorted) that keep the gaps (pool-adjacent-violators). */
function spread(want, gaps) {
  const n = want.length;
  const G = [0];
  for (let i = 1; i < n; i++) G.push(G[i - 1] + gaps[i - 1]);
  const blocks = [];
  for (let i = 0; i < n; i++) {
    blocks.push({ sum: want[i] - G[i], n: 1 });
    while (blocks.length > 1 && blocks[blocks.length - 2].sum / blocks[blocks.length - 2].n > blocks[blocks.length - 1].sum / blocks[blocks.length - 1].n) {
      const b = blocks.pop();
      blocks[blocks.length - 1].sum += b.sum; blocks[blocks.length - 1].n += b.n;
    }
  }
  const out = [];
  for (const b of blocks) for (let k = 0; k < b.n; k++) out.push(b.sum / b.n + G[out.length]);
  return out;
}

// ------------------------------------------------------------------ 3D distance checks
function segSeg(p1, q1, p2, q2) {
  const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2);
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
  let s, t;
  if (a < 1e-9 && e < 1e-9) return vlen(r);
  if (a < 1e-9) { s = 0; t = Math.max(0, Math.min(1, f / e)); } else {
    const c = dot(d1, r);
    if (e < 1e-9) { t = 0; s = Math.max(0, Math.min(1, -c / a)); } else {
      const b = dot(d1, d2), den = a * e - b * b;
      s = den > 1e-9 ? Math.max(0, Math.min(1, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)); } else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)); }
    }
  }
  return dist(add(p1, mul(d1, s)), add(p2, mul(d2, t)));
}
function segsOf(pts) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    out.push({ a, b, min: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])], max: [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])] });
  }
  return out;
}
const boxNear = (a, b, m) => a.min[0] - m < b.max[0] && b.min[0] - m < a.max[0] && a.min[1] - m < b.max[1] && b.min[1] - m < a.max[1] && a.min[2] - m < b.max[2] && b.min[2] - m < a.max[2];
function bounds(segs) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const s of segs) for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], s.min[i]); max[i] = Math.max(max[i], s.max[i]); }
  return { min, max };
}
/** Do two cable paths come closer than their radii allow (ignoring the bits at a shared port)? */
function clash(A, B) {
  const need = A.r + B.r + GAP;
  if (!boxNear(A.box, B.box, need)) return false;
  const shared = A.ports.filter((p) => B.ports.some((q) => q.key === p.key));
  for (const s of A.segs) {
    if (!boxNear(s, B.box, need)) continue;
    for (const t of B.segs) {
      if (!boxNear(s, t, need)) continue;
      if (segSeg(s.a, s.b, t.a, t.b) >= need) continue;
      if (shared.some((p) => Math.min(dist(s.a, p.pos), dist(s.b, p.pos)) < 34 && Math.min(dist(t.a, p.pos), dist(t.b, p.pos)) < 34)) continue;
      return true;
    }
  }
  return false;
}
function shape(pts, r, ports) { const segs = segsOf(pts); return { pts, r, ports, segs, box: bounds(segs) }; }

function dedupe(pts) {
  const out = [];
  for (const p of pts) if (!out.length || dist(out[out.length - 1], p) > 0.05) out.push(p);
  // drop points in the middle of a straight run
  for (let i = out.length - 2; i > 0; i--) {
    const u = sub(out[i], out[i - 1]), v = sub(out[i + 1], out[i]);
    const lu = vlen(u), lv = vlen(v);
    if (lu > 0 && lv > 0 && dot(u, v) / (lu * lv) > 0.99999) out.splice(i, 1);
  }
  return out;
}

// ====================================================================== the router
const DUCT_LEVELS = [0, 6.5, -6.5, 13, -13];

/**
 * Route every connection of the project.
 * Returns { routes: Map(connId → {pts, r, kind, ends: [fitting, fitting]}), gaps, mains } where pts run
 * from one fitting to the other and gaps lists where wires pass the duct walls:
 * gaps[duct] = { lo: [{x, r}], hi: [{x, r}] } (lo = bottom wall, hi = top wall); mains is the
 * route of the MCB's supply cable ({pts, r}) or null.
 */
export function routeLab(project, layout) {
  const devs = new Map();
  for (const dev of project.devices) {
    const def = DEVICE_DEFS[dev.type];
    const place = layout.places.get(dev.id);
    if (!def || !place) continue;
    devs.set(dev.id, { dev, def, place, box: worldBox(place, localBox(def)), zone: def.zone });
  }
  const D = SCENE.duct, HD = SCENE.ducts;
  const ductY = HD.map((d) => d.y);
  const wallLo = (i) => HD[i].y - HD[i].h / 2, wallHi = (i) => HD[i].y + HD[i].h / 2;
  const C = layout.console;
  const slopeN = norm([0, C.zFront - C.zBack, C.hBack - C.hFront]);
  const downSlope = norm([0, C.hFront - C.hBack, C.zFront - C.zBack]);

  // ---- connection ends (with stacked plugs / twin ferrules on shared ports)
  const use = new Map();
  const conns = project.conns.filter((c) => devs.has(c.a.dev) && devs.has(c.b.dev));
  for (const c of conns) for (const e of [c.a, c.b]) { const k = e.dev + '|' + e.port; if (!use.has(k)) use.set(k, []); use.get(k).push(c.id); }
  const styles = new Map();
  for (const c of conns) {
    const pa = devicePorts(devs.get(c.a.dev).dev).find((p) => p.id === c.a.port), pb = devicePorts(devs.get(c.b.dev).dev).find((p) => p.id === c.b.port);
    if (pa && pb) styles.set(c.id, { pa, pb, ...cableStyle(c, pa, pb) });
  }
  const cables = [];
  for (const c of conns) {
    const st = styles.get(c.id);
    if (!st) continue;
    const ends = [[c.a, devs.get(c.a.dev), st.pa], [c.b, devs.get(c.b.dev), st.pb]].map(([e, d, port]) => endOf(c, e, d, port, st));
    cables.push({ conn: c, kind: st.kind, r: st.r, ends });
  }

  /** Side-by-side position of the k-th cable on a shared terminal (twin ferrules, centred). */
  function sideOffset(list, k, port) {
    const w = list.map((id) => (port.kind === 'comm' ? 9 : (styles.get(id) || { r: 1.35 }).r));
    const at = [0];
    for (let i = 1; i < w.length; i++) at.push(at[i - 1] + w[i - 1] + w[i] + GAP + 0.25);
    return at[k] - at[at.length - 1] / 2;
  }

  function endOf(c, e, d, port, st) {
    const key = e.dev + '|' + e.port;
    const list = use.get(key);
    const k = list.indexOf(c.id), n = list.length;
    const P0 = toWorld(d.place, port.pos), dir = norm(dirToWorld(d.place, port.dir));
    const side = norm(dirToWorld(d.place, [1, 0, 0]));
    let pos = P0, E, lead = dir, shift = 0;
    const flen = fitLength(port);
    if (port.kind === 'sock') {
      // banana plugs stack: plug k sits in the back of plug k-1; lower plugs let their cord out sideways
      pos = add(P0, mul(dir, 22 * k));
      if (k < n - 1) {
        // lower plugs let their cord out on the side facing where it goes
        const other = c.a === e ? c.b : c.a, od = devs.get(other.dev);
        const toward = od ? dot(sub(toWorld(od.place, [0, 0, 0]), P0), side) : 1;
        const s = mul(side, toward < 0 ? -1 : 1);
        E = add(add(pos, mul(dir, 15)), mul(s, 3.2));
        lead = norm(add(mul(s, 0.8), mul(dir, 0.6)));
      } else E = add(pos, mul(dir, flen));
    } else if (n > 1 && (port.conn === 'term2' || port.conn === 'term3')) {
      // two RS-485 cables on the same screw terminals (daisy chain): the sleeves sit side by side
      // and their wires fan into the same terminals
      shift = (k - (n - 1) / 2) * (port.conn === 'term3' ? 17 : 13);
      E = add(add(P0, mul(side, shift)), mul(dir, flen + 4));
    } else {
      if (n > 1) pos = add(P0, mul(side, sideOffset(list, k, port)));
      E = add(pos, mul(dir, flen));
    }
    const L = add(E, mul(lead, LEAD[st.kind]));
    return {
      key, port, dev: d, P0, dir, E, L, r: st.r,
      zone: d.zone === 'rail1' || d.zone === 'rail2' ? 'panel' : d.zone,
      cls: dir[1] > 0.3 ? 'up' : dir[1] < -0.3 ? 'down' : 'front',
      // a front port may leave upwards only from the upper part of the device: below that the wire
      // would cross the keypad, display or LEDs on its way up
      upOk: dir[1] > 0.3 || (dir[1] >= -0.3 && port.pos[1] >= 0.6 * d.def.size[1]),
      fit: { pos, dir, side, shift, kind: port.kind === 'comm' ? 'conn' : port.kind === 'sock' ? 'plug' : 'ferrule', conn: port.conn, bus: port.bus, len: flen },
      half: fitHalfWidth(port, st.r),
    };
  }

  // ---- ducts: which one an end goes to, and the cost of a duct path
  const ductAbove = (box) => { let best = -1; HD.forEach((d, i) => { if (d.y > box.max[1] && (best < 0 || d.y < HD[best].y)) best = i; }); return best; };
  const ductBelow = (box) => { let best = -1; HD.forEach((d, i) => { if (d.y < box.min[1] && (best < 0 || d.y > HD[best].y)) best = i; }); return best; };
  /** Ways through the ducts from duct ia at x xa to duct ib at x xb (vertical ducts used), cheapest first. */
  const pathCache = new Map();
  const ductPaths = (ia, xa, ib, xb) => {
    const key = ia + ',' + xa.toFixed(2) + ',' + ib + ',' + xb.toFixed(2);
    let out = pathCache.get(key);
    if (out) return out;
    let states = [{ x: xa, cost: 0, via: [] }];
    for (let i = ia; i !== ib; i += Math.sign(ib - ia)) {
      const j = i + Math.sign(ib - ia), next = [];
      for (const v of SCENE.vducts) {
        if (v.from > Math.min(i, j) || v.to < Math.max(i, j)) continue;
        for (const st of states) next.push({ x: v.x, cost: st.cost + Math.abs(st.x - v.x), via: [...st.via, { x: v.x, from: i, to: j }] });
      }
      states = next;
    }
    out = states.map((st) => ({ ...st, cost: st.cost + Math.abs(st.x - xb) + Math.abs(ductY[ia] - ductY[ib]) })).sort((p, q) => p.cost - q.cost);
    pathCache.set(key, out);
    return out;
  };
  const ductPath = (ia, xa, ib, xb) => ductPaths(ia, xa, ib, xb)[0];
  const ductCost = (ia, xa, ib, xb) => ductPath(ia, xa, ib, xb).cost;
  const ductFor = (end, s) => (s > 0 ? ductAbove(end.dev.box) : ductBelow(end.dev.box));
  const bottom = HD.length - 1;

  // ---- 1. decide up / down for every panel end
  for (const cab of cables) {
    const [a, b] = cab.ends;
    cab.type = a.zone === 'panel' && b.zone === 'panel' ? 'pp' : a.zone === 'panel' || b.zone === 'panel' ? 'po' : 'oo';
    if (cab.type === 'pp') {
      let best = null;
      const opts = (e) => (e.cls === 'up' ? [1] : e.cls === 'down' || !e.upOk ? [-1] : [1, -1]);
      for (const sa of opts(a)) for (const sb of opts(b)) {
        const ia = ductFor(a, sa), ib = ductFor(b, sb);
        if (ia < 0 || ib < 0) continue;
        const cost = Math.abs(ductY[ia] - a.L[1]) + Math.abs(ductY[ib] - b.L[1]) + ductCost(ia, a.L[0], ib, b.L[0]);
        if (!best || cost < best.cost) best = { cost, sa, sb, ia, ib };
      }
      if (!best) best = { sa: -1, sb: -1, ia: Math.max(0, ductFor(a, -1)), ib: Math.max(0, ductFor(b, -1)) };
      Object.assign(a, { s: best.sa, duct: best.ia }); Object.assign(b, { s: best.sb, duct: best.ib });
    } else if (cab.type === 'po') {
      const p = a.zone === 'panel' ? a : b;
      p.s = p.cls === 'up' ? 1 : -1;
      p.duct = ductFor(p, p.s);
      if (p.duct < 0) { p.s = -p.s; p.duct = Math.max(0, ductFor(p, p.s)); }
    }
  }

  // ---- 2. per device: drop planes and turning heights so escaping wires never cross each other
  const panelEnds = cables.flatMap((c) => c.ends.filter((e) => e.zone === 'panel' && e.s));
  const groups = new Map();
  const groupOf = (e) => { const k = e.dev.dev.id + (e.s > 0 ? '+' : '-'); if (!groups.has(k)) groups.set(k, []); return groups.get(k); };
  /** Lane, drop plane and turning height of end p, given the ends of its device side placed before. */
  function settle(p, done) {
    const s = p.s, box = p.dev.box;
    const wall = s > 0 ? wallLo(p.duct) : wallHi(p.duct);
    const base = s > 0 ? box.max[1] + 5 + p.r : box.min[1] - 5 - p.r;
    const lim = s > 0 ? wall - 9 - p.r : wall + 9 + p.r;
    p.x = p.L[0];
    if (p.cls !== 'front') {
      p.dropZ = p.L[2];
      p.turnY = s > 0 ? Math.max(p.L[1], Math.min(base, lim)) : Math.min(p.L[1], Math.max(base, lim));
      return;
    }
    // a lane of its own: jog sideways (in front of the device) to an x no other wire of this device
    // side uses, so nothing has to nest; only when there is none, nest in front
    const free = (x) => done.every((q) => Math.abs(x - q.x) >= p.r + q.r + 2);
    for (let k = 0; k <= 40; k++) {
      const jog = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 2.5;
      if (free(p.L[0] + jog)) { p.x = p.L[0] + jog; break; }
    }
    let z = p.L[2], y = base;
    for (const q of done) {
      const dx = Math.abs(p.x - q.x);
      if (dx < p.r + q.r + 2) { z = Math.max(z, q.dropZ + p.r + q.r + 1.5); y = s > 0 ? Math.max(y, q.turnY + p.r + q.r + 1.5) : Math.min(y, q.turnY - p.r - q.r - 1.5); }
      if (Math.abs(p.x - q.L[0]) < q.half + p.r + 1 || (Math.min(p.x, p.L[0]) < q.L[0] + q.half && Math.max(p.x, p.L[0]) > q.L[0] - q.half && Math.abs(q.L[1] - p.L[1]) < q.half + p.r + 1)) z = Math.max(z, q.L[2] + p.r + q.r + 1);
    }
    p.dropZ = z;
    p.turnY = s > 0 ? Math.min(y, lim) : Math.max(y, lim);
  }
  // inner wires (up / down terminals) first, then front ones from the duct side outwards
  const order = (p, q) => (p.cls === 'front') - (q.cls === 'front') || (p.s < 0 ? p.L[1] - q.L[1] : q.L[1] - p.L[1]) || p.L[2] - q.L[2];
  for (const e of panelEnds.slice().sort(order)) { const g = groupOf(e); settle(e, g); g.push(e); }

  // ---- 3. bench ends: approach paths from the bench up to the port
  const obstacles = [];
  const P = SCENE.panel;
  obstacles.push(rect(P.x0 - 45, -60, P.x1 + 45, EXIT_RUN - 24));
  // the console, including the strip behind it where the patch cords come down its back
  const consoleBack = C.zBack - 3 - 10 - 2.8 - 4;
  if (C.show) obstacles.push(rect(C.cx - C.width / 2 - 3, consoleBack, C.cx + C.width / 2 + 3, C.zFront + 3));
  for (const d of devs.values()) {
    if (d.zone === 'hmi') obstacles.push(rect(d.place.pos[0] - 75, d.place.pos[2] - 65, d.place.pos[0] + 75, d.place.pos[2] + 85));
    else if (d.zone === 'motor') obstacles.push(rect(d.place.pos[0] - 180, d.place.pos[2] - 100, d.place.pos[0] + 200, d.place.pos[2] + 100));
    else if (d.zone === 'desk') obstacles.push(hull(corners(localBox(d.def)).map((c) => { const w = toWorld(d.place, c); return [w[0], w[2]]; })));
  }
  // cords over the back edge of the console: keep them apart along the edge
  const overEdge = [];
  for (const cab of cables) {
    if (cab.type === 'oo' && cab.ends[0].zone === 'console' && cab.ends[1].zone === 'console') continue;
    for (const e of cab.ends) if (e.zone === 'console') overEdge.push(e);
  }
  overEdge.sort((p, q) => p.L[0] - q.L[0] || q.L[2] - p.L[2]);
  const ex = spread(overEdge.map((e) => e.L[0]), overEdge.slice(1).map((e, i) => e.r + overEdge[i].r + 1.6));
  overEdge.forEach((e, i) => { e.edgeX = ex[i]; });

  /** Points from the bench up to the fitting (bench point first). */
  function approach(e) {
    const { L, E, r } = e;
    const d = e.dev;
    if (e.zone === 'console') {
      const x = e.edgeX ?? L[0];
      const edge = [x, C.hBack + 3, C.zBack - 3];
      const T = add(edge, mul(slopeN, 36));
      const zb = C.zBack - 3 - 10 - r;
      // down the back of the console, then straight back on the bench, clear of the console strip
      return [[x, r, consoleBack - r - APPROACH], [x, r, zb], [x, C.hBack + 3 + 16 + r, zb], T, L, E];
    }
    if (e.zone === 'hmi') {
      const hx = d.place.pos[0], z0 = d.place.pos[2] - 65, z1 = d.place.pos[2] + 85, top = 10 + r + 0.3;
      const back = Math.abs(L[0] - hx) > 11 + r + 4;
      const zEdge = back ? z0 - 1 : z1 + 1, zFoot = back ? z0 - 8 - r : z1 + 8 + r, zRun = back ? z0 - APPROACH - r : z1 + APPROACH + r;
      return [[L[0], r, zRun], [L[0], r, zFoot], [L[0], top, zEdge], [L[0], top, L[2]], L, E];
    }
    if (e.zone === 'motor') {
      const yTop = d.box.max[1] + 10 + r, z0 = d.place.pos[2] - 100;
      return [[L[0], r, z0 - APPROACH - r], [L[0], r, z0 - 8 - r], [L[0], yTop, z0 - 8 - r], [L[0], yTop, L[2]], L, E];
    }
    // laptop and anything else on the bench: down onto the bench, then a short way out along the port
    const out = norm([e.dir[0], 0, e.dir[2]]);
    const foot = [L[0], r, L[2]];
    return [add(foot, mul(out, 24)), foot, L, E];
  }
  for (const cab of cables) for (const e of cab.ends) if (e.zone !== 'panel') e.appr = approach(e);

  // ---- 4. where cables leave the panel (bottom duct): sorted by where they go, kept apart
  const exits = cables.filter((c) => c.type === 'po');
  exits.forEach((c) => { const o = c.ends.find((e) => e.zone !== 'panel'); c.exitWant = Math.max(D.x0 + 14, Math.min(D.x1 - 14, o.appr[0][0])); });
  exits.sort((p, q) => p.exitWant - q.exitWant);
  const xs = spread(exits.map((c) => c.exitWant), exits.slice(1).map((c, i) => c.r + exits[i].r + 2.4));
  exits.forEach((c, i) => { c.exitX = xs[i]; });
  // keep the exits inside the duct
  const lo = D.x0 + 12, hi = D.x1 - 12;
  if (exits.length && exits[0].exitX < lo) { const k = lo - exits[0].exitX; exits.forEach((c) => { c.exitX += k; }); }
  if (exits.length && exits[exits.length - 1].exitX > hi) { const k = exits[exits.length - 1].exitX - hi; exits.forEach((c) => { c.exitX -= k; }); }

  // ---- 5. panel part of a cable for a given duct depth z and level
  function escape(e, z, lv) {
    const wall = e.s > 0 ? wallLo(e.duct) : wallHi(e.duct);
    const pts = [e.E, e.L];
    if (e.dropZ > e.L[2] + 0.05) pts.push([e.L[0], e.L[1], e.dropZ]);
    pts.push([e.x, e.L[1], e.dropZ], [e.x, e.turnY, e.dropZ], [e.x, e.turnY, z], [e.x, wall - e.s * (6 + e.r), z], [e.x, ductY[e.duct] + lv, z]);
    return pts;
  }
  /** Points through the vertical ducts between two horizontal ducts. */
  function through(ia, xa, ib, xb, z, lv, alt = 0) {
    const all = ductPaths(ia, xa, ib, xb);
    const out = [];
    for (const v of (all[alt] || all[0]).via) out.push([v.x + lv, ductY[v.from] + lv, z], [v.x + lv, ductY[v.to] + lv, z]);
    return out;
  }
  /** How many different ways through the ducts a cable has. */
  function ways(cab) {
    const [a, b] = cab.ends;
    if (cab.type === 'pp') return ductPaths(a.duct, a.x, b.duct, b.x).length;
    const p = a.zone === 'panel' ? a : b;
    return ductPaths(p.duct, p.x, bottom, cab.exitX).length;
  }
  function panelPart(cab, z, level, alt = 0) {
    const lv = DUCT_LEVELS[level];
    const [a, b] = cab.ends;
    if (cab.type === 'pp') {
      const A = escape(a, z, lv), B = escape(b, z, lv).reverse();
      return [...A, ...through(a.duct, a.x, b.duct, b.x, z, lv, alt), ...B];
    }
    const p = a.zone === 'panel' ? a : b;
    const A = escape(p, z, lv);
    const x = cab.exitX, yb = ductY[bottom] + lv;
    A.push(...through(p.duct, p.x, bottom, x, z, lv, alt));
    // out of the bottom duct, over the enclosure sill and a short way out on the bench
    A.push([x, yb, z], [x, wallLo(bottom) - 9 - cab.r, z], [x, 38 + cab.r, 47 + cab.r], [x, cab.r, 52 + cab.r], [x, cab.r, EXIT_RUN]);
    return A;
  }

  // ---- 6. duct tracks: first free depth (then level) that clashes with no wire placed so far
  const placed = [];
  const portsOf = (cab) => cab.ends.map((e) => ({ key: e.key, pos: e.P0 }));
  // the mains cable of the MCB goes up into the top duct, to the left side duct and out at the top
  let mains = null;
  const mcb = [...devs.values()].find((d) => d.def.sim === 'mcb');
  if (mcb) {
    const m0 = toWorld(mcb.place, [-9, 84, 60]), zM = 22, vx = SCENE.vducts[0].x, y0 = wallLo(0) - 14;
    mains = { r: 4.2, pts: [m0, [m0[0], y0, m0[2]], [m0[0], y0, zM], [m0[0], ductY[0], zM], [vx, ductY[0], zM], [vx, P.y1 + 30, zM]] };
    placed.push(shape(mains.pts, mains.r, []));
  }
  const inner = cables.filter((c) => c.type !== 'oo');
  const keyZ = (c) => { const pe = c.ends.filter((e) => e.zone === 'panel'); return pe.reduce((s, e) => s + e.dropZ, 0) / pe.length; };
  inner.sort((p, q) => keyZ(p) - keyZ(q) || q.r - p.r);
  for (const cab of inner) {
    const zMin = D.web + cab.r + 0.6, zMax = D.depth - 1 - cab.r;
    const search = () => {
      // the cheapest way through the ducts first, then (when that is full) up to two others
      for (let alt = 0, n = Math.min(3, ways(cab)); alt < n; alt++) {
        for (let level = 0; level < DUCT_LEVELS.length; level++) {
          for (let z = zMin; z <= zMax + 1e-6; z += 0.5) {
            const sh = shape(dedupe(panelPart(cab, z, level, alt)), cab.r, portsOf(cab));
            if (!placed.some((o) => clash(sh, o))) return sh;
          }
        }
      }
      return null;
    };
    let found = search();
    // no room: let a front end leave the other way (up instead of down, or down instead of up)
    for (const e of cab.ends) {
      if (found || e.zone !== 'panel' || e.cls !== 'front' || (e.s < 0 && !e.upOk)) continue;
      const keep = { s: e.s, duct: e.duct, x: e.x, dropZ: e.dropZ, turnY: e.turnY };
      e.s = -e.s;
      e.duct = ductFor(e, e.s);
      if (e.duct >= 0) { settle(e, groupOf(e)); found = search(); }
      if (found) { groupOf(e).push(e); const old = groups.get(e.dev.dev.id + (keep.s > 0 ? '+' : '-')); old.splice(old.indexOf(e), 1); } else Object.assign(e, keep);
    }
    if (!found) {
      // the ducts are full here: take the track that touches the fewest wires
      let best = Infinity;
      for (let alt = 0, n = Math.min(3, ways(cab)); alt < n && best > 0; alt++) {
        for (let level = 0; level < DUCT_LEVELS.length; level++) {
          for (let z = zMin; z <= zMax + 1e-6; z += 2) {
            const sh = shape(dedupe(panelPart(cab, z, level, alt)), cab.r, portsOf(cab));
            let k = 0;
            for (const o of placed) if (clash(sh, o) && ++k >= best) break;
            if (k < best) { best = k; found = sh; }
          }
        }
      }
    }
    cab.panel = found.pts;
    placed.push(found);
  }

  // ---- 7. bench parts: shortest way around the obstacles, lying over cables already there
  // the low parts of the approach paths (cords lying on the bench or on the HMI stand base) are
  // there before any bench path: those lie over them where they cross
  const benchDone = [];
  for (const cab of cables) if (cab.type === 'po') { const n = cab.panel.length, sh = shape([cab.panel[n - 2], cab.panel[n - 1]], cab.r, []); sh.owner = cab; benchDone.push(sh); }
  for (const cab of cables) for (const e of cab.ends) {
    if (!e.appr) continue;
    for (let i = 0; i < e.appr.length - 1; i++) {
      const a = e.appr[i], b = e.appr[i + 1];
      if (a[1] < 22 && b[1] < 22 && dist(a, b) > 0.5) { const sh = shape([a, b], cab.r, []); sh.owner = cab; benchDone.push(sh); }
    }
  }
  const benchOf = (cab) => {
    const [a, b] = cab.ends;
    if (cab.type === 'po') { const o = a.zone === 'panel' ? b : a; const s = cab.panel[cab.panel.length - 1]; return [s, o.appr[0]]; }
    if (cab.type === 'oo' && !(a.zone === 'console' && b.zone === 'console')) return [a.appr[0], b.appr[0]];
    return null;
  };
  const benchCabs = cables.filter((c) => benchOf(c));
  benchCabs.sort((p, q) => p.r - q.r);
  benchCabs.forEach((cab, i) => {
    const [s, g] = benchOf(cab);
    // a lane of its own around the obstacles, so cables passing the same corner run side by side
    const path2 = benchPath([s[0], s[2]], [g[0], g[2]], obstacles, cab.r + 4 + (i % 4) * LANE);
    let pts = [];
    for (let i = 0; i < path2.length - 1; i++) {
      const a = path2[i], b = path2[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 5));
      for (let k = 0; k < n; k++) pts.push([a[0] + ((b[0] - a[0]) * k) / n, cab.r, a[1] + ((b[1] - a[1]) * k) / n]);
    }
    pts.push([g[0], cab.r, g[2]]);
    // lie over the cables already on the bench
    const h = pts.map(() => cab.r);
    for (const o of benchDone) {
      if (o.owner === cab) continue;
      if (!boxNear({ min: [Math.min(s[0], g[0]) - 400, -1, Math.min(s[2], g[2]) - 400], max: [Math.max(s[0], g[0]) + 400, 99, Math.max(s[2], g[2]) + 400] }, o.box, 0)) continue;
      const need = cab.r + o.r + GAP;
      pts.forEach((p, i) => {
        for (const sg of o.segs) {
          if (p[0] < sg.min[0] - need || p[0] > sg.max[0] + need || p[2] < sg.min[2] - need || p[2] > sg.max[2] + need) continue;
          const dx = sg.b[0] - sg.a[0], dz = sg.b[2] - sg.a[2], l2 = dx * dx + dz * dz;
          const t = l2 ? Math.max(0, Math.min(1, ((p[0] - sg.a[0]) * dx + (p[2] - sg.a[2]) * dz) / l2)) : 0;
          // samples are 5 mm apart: count a crossing between two samples as under both
          const d2 = Math.max(0, Math.hypot(p[0] - sg.a[0] - dx * t, p[2] - sg.a[2] - dz * t) - 2.6);
          if (d2 >= need) continue;
          const oy = sg.a[1] + (sg.b[1] - sg.a[1]) * t, dy = Math.sqrt(need * need - d2 * d2);
          if (oy - cab.r >= dy - 0.25) continue; // that cable already lies over this spot: pass under it
          h[i] = Math.max(h[i], oy + dy);
        }
      });
    }
    // gentle ramps up and over
    for (let i = 1; i < h.length; i++) h[i] = Math.max(h[i], h[i - 1] - 0.55 * dist(pts[i], pts[i - 1]));
    for (let i = h.length - 2; i >= 0; i--) h[i] = Math.max(h[i], h[i + 1] - 0.55 * dist(pts[i], pts[i + 1]));
    pts = dedupe(pts.map((p, i) => [p[0], h[i], p[2]]));
    cab.bench = pts;
    benchDone.push(shape(pts, cab.r, []));
  });

  // ---- 8. cords between two console sockets: an arc above the console
  const arcs = cables.filter((c) => c.type === 'oo' && !c.bench);
  const others = cables.filter((c) => !arcs.includes(c));
  const everything = () => others.map((c) => shape(assemble(c), c.r, portsOf(c)));
  const world = everything();
  for (const cab of arcs) {
    const [a, b] = cab.ends;
    const d = dist(a.L, b.L);
    let lift = 16 + 0.08 * d, fwd = 26 + 0.1 * d, sh = null;
    for (let tries = 0; tries < 6; tries++) {
      // bow toward the operator, away from the cords that go over the back edge
      const M = add(add(mul(add(a.L, b.L), 0.5), mul(slopeN, lift)), mul(downSlope, fwd));
      const pts = [a.E];
      for (let i = 0; i <= 14; i++) { const t = i / 14, u = 1 - t; pts.push(add(add(mul(a.L, u * u), mul(M, 2 * u * t)), mul(b.L, t * t))); }
      pts.push(b.E);
      sh = shape(dedupe(pts), cab.r, portsOf(cab));
      if (!world.some((o) => clash(sh, o))) break;
      lift *= 1.3; fwd *= 1.25;
    }
    cab.arc = sh.pts;
    world.push(sh);
  }

  function assemble(cab) {
    const [a, b] = cab.ends;
    if (cab.arc) return cab.arc;
    if (cab.type === 'pp') return cab.panel;
    if (cab.type === 'po') {
      const o = a.zone === 'panel' ? b : a;
      const pts = [...cab.panel, ...(cab.bench || []), ...o.appr];
      return a.zone === 'panel' ? pts : pts.reverse();
    }
    return [...a.appr.slice().reverse(), ...(cab.bench || []), ...b.appr];
  }

  // ---- result
  const routes = new Map();
  for (const cab of cables) routes.set(cab.conn.id, { pts: dedupe(assemble(cab)), r: cab.r, kind: cab.kind, ends: cab.ends.map((e) => e.fit) });
  const gaps = HD.map(() => ({ lo: [], hi: [] }));
  if (mains) gaps[0].lo.push({ x: mains.pts[0][0], r: mains.r });
  for (const cab of cables) {
    for (const e of cab.ends) if (e.zone === 'panel' && e.s) gaps[e.duct][e.s > 0 ? 'lo' : 'hi'].push({ x: e.x, r: e.r });
    if (cab.type === 'po') gaps[bottom].lo.push({ x: cab.exitX, r: cab.r });
  }
  return { routes, gaps, mains };
}
