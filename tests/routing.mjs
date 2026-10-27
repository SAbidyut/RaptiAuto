// Headless tests of the 3D cable routing: node tests/routing.mjs
// Every example lab: each connection routed, no cable through a device, the console, the HMI stand,
// the motor base or the bench, no two cables overlapping, and wires inside the ducts.
import { routeLab } from '../web/src/plc/devices/routing.js';
import { layoutDevices, SCENE, toWorld } from '../web/src/plc/devices/layout.js';
import { DEVICE_DEFS, devicePorts } from '../web/src/plc/devices/defs.js';
import { LAB_EXAMPLES, buildExample } from '../web/src/plc/examples.js';

let failures = 0;
function check(name, cond, detail = '') {
  if (!cond) failures++;
  console.log(`${cond ? '✓' : '✗'} ${name}${!cond && detail ? ' — ' + detail : ''}`);
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(...a);
function segSeg(p1, q1, p2, q2) {
  // closest distance by dense sampling of the shorter segment against the other (robust, test only)
  const n = Math.max(2, Math.ceil(Math.max(len(sub(q1, p1)), len(sub(q2, p2))) / 1.5));
  let best = Infinity;
  for (let i = 0; i <= n; i++) {
    const t = i / n, p = [p1[0] + (q1[0] - p1[0]) * t, p1[1] + (q1[1] - p1[1]) * t, p1[2] + (q1[2] - p1[2]) * t];
    best = Math.min(best, pointSeg(p, p2, q2));
  }
  return best;
}
function pointSeg(p, a, b) {
  const d = sub(b, a), l2 = dot(d, d);
  const t = l2 ? Math.max(0, Math.min(1, dot(sub(p, a), d) / l2)) : 0;
  return len(sub(p, [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t]));
}
const samples = (pts, step = 2) => {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], n = Math.max(1, Math.ceil(len(sub(b, a)) / step));
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n, a[2] + ((b[2] - a[2]) * k) / n]);
  }
  out.push(pts[pts.length - 1]);
  return out;
};

// the solid parts of the machines (their footprints include the air above the terminal strips)
const MACHINE_SOLIDS = {
  conveyor: [[[-360, 4, -72], [360, 160, 72]], [[-368, 100, -156], [-180, 168, -100]], [[290, 70, -240], [400, 190, -80]], [[310, 4, -58], [470, 76, 58]]],
  tank: [[[-20, 4, -90], [225, 125, -5]], [[0, 255, -73], [200, 600, 73]], [[-236, 4, -48], [-144, 142, 48]], [[-130, 10, -26], [-30, 66, 26]]],
  cyl: [[[-200, 0, -95], [320, 9, 95]], [[-150, 34, 4], [70, 74, 44]], [[-128, 12, -52], [-52, 40, -24]]],
};

for (const ex of LAB_EXAMPLES) {
  const p = buildExample(ex.id);
  const layout = layoutDevices(p.devices);
  const { routes, mains } = routeLab(p, layout);
  check(`${ex.id}: all ${p.conns.length} connections routed`, p.conns.every((c) => routes.get(c.id) && routes.get(c.id).pts.length >= 2));

  // device bodies (shrunk a little: models are smaller than these boxes at the edges)
  const boxes = [];
  for (const d of p.devices) {
    const def = DEVICE_DEFS[d.type], pl = layout.places.get(d.id);
    if (!pl) continue;
    const [w, h, dd] = def.size;
    const lbs = def.sim === 'motor' ? [[[-150, 4, -72], [140, 196, 72]]] : def.sim === 'hmi' ? [[[-96, 4, 2], [96, 142, 44]]] : def.sim === 'laptop' ? [[[-156, 2, 4], [156, 12, 216]]]
      : def.sim === 'mcb' ? [[[-22, 3, 3], [10, 87, 62]], [[13, 26, 2], [21, 64, 48]]] // body + PE block
        : def.sim === 'mains3' ? [[[-43, 3, 3], [25, 87, 62]], [[32, 26, 2], [40, 64, 48]]]
          : def.sim === 'motor6' ? [[[-150, 4, -72], [140, 196, 72]]]
            : MACHINE_SOLIDS[def.sim] ? MACHINE_SOLIDS[def.sim]
        : def.zone === 'console' ? [[[-30, 0, 0], [30, 84, 4]]] : [[[-w / 2 + 2, 3, 3], [w / 2 - 2, h - 3, Math.min(dd, def.sim === 'vfd' ? 126 : dd) - 3]]];
    for (const lb of lbs) {
      const c = [];
      for (const x of [lb[0][0], lb[1][0]]) for (const y of [lb[0][1], lb[1][1]]) for (const z of [lb[0][2], lb[1][2]]) c.push(toWorld(pl, [x, y, z]));
      const rot = def.zone === 'console' || def.zone === 'hmi' || def.zone === 'desk';
      boxes.push({ id: d.id, pl, lb, rot, min: [0, 1, 2].map((i) => Math.min(...c.map((v) => v[i]))), max: [0, 1, 2].map((i) => Math.max(...c.map((v) => v[i]))) });
    }
  }
  // a world point inside a (possibly rotated) device box?
  const inside = (b, q) => {
    if (!b.rot) return q[0] > b.min[0] && q[0] < b.max[0] && q[1] > b.min[1] && q[1] < b.max[1] && q[2] > b.min[2] && q[2] < b.max[2];
    // back to device-local coordinates (inverse of toWorld)
    const [rx, ry] = b.pl.rot;
    let [x, y, z] = sub(q, b.pl.pos);
    const cy = Math.cos(-ry), sy = Math.sin(-ry);
    [x, z] = [x * cy + z * sy, -x * sy + z * cy];
    const cx = Math.cos(-rx), sx = Math.sin(-rx);
    [y, z] = [y * cx - z * sx, y * sx + z * cx];
    return x > b.lb[0][0] && x < b.lb[1][0] && y > b.lb[0][1] && y < b.lb[1][1] && z > b.lb[0][2] && z < b.lb[1][2];
  };
  const C = layout.console;
  const belowSlope = (q) => C.show && q[0] > C.cx - C.width / 2 - 3 && q[0] < C.cx + C.width / 2 + 3 && q[2] > C.zBack - 3 && q[2] < C.zFront + 3
    && q[1] < C.hBack + 3 - ((q[2] - C.zBack) / (C.zFront - C.zBack)) * (C.hBack - C.hFront);

  let through = [], under = [];
  for (const c of p.conns) {
    const rt = routes.get(c.id);
    if (!rt) continue;
    const ends = [c.a, c.b].map((e) => { const d = p.devices.find((x) => x.id === e.dev); return toWorld(layout.places.get(d.id), devicePorts(d).find((q) => q.id === e.port).pos); });
    for (const q of samples(rt.pts)) {
      if (q[1] < rt.r - 0.05) under.push(c.id);
      if (ends.some((e) => len(sub(q, e)) < 26)) continue; // the fitting itself
      const hit = boxes.find((b) => inside(b, q));
      if (hit) { through.push(`${c.a.dev}.${c.a.port}→${c.b.dev}.${c.b.port} in ${hit.id} at ${q.map((v) => v.toFixed(0))}`); break; }
      if (belowSlope(q)) { through.push(`${c.a.dev}.${c.a.port}→${c.b.dev}.${c.b.port} in the console at ${q.map((v) => v.toFixed(0))}`); break; }
    }
  }
  check(`${ex.id}: no cable passes through a device or the console`, !through.length, through.slice(0, 4).join('; '));
  check(`${ex.id}: no cable below the bench top`, !under.length, [...new Set(under)].join(', '));

  // cable against cable
  const list = p.conns.map((c) => ({ c, rt: routes.get(c.id) })).filter((x) => x.rt);
  for (const m of mains) list.push({ c: { a: { dev: 'mains', port: '' }, b: { dev: 'mains', port: '' } }, rt: m });
  const clashes = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const A = list[i], B = list[j];
    const need = A.rt.r + B.rt.r - 0.05;
    const shared = [A.c.a, A.c.b].filter((e) => [B.c.a, B.c.b].some((f) => f.dev === e.dev && f.port === e.port)).map((e) => { const d = p.devices.find((x) => x.id === e.dev); return toWorld(layout.places.get(d.id), devicePorts(d).find((q) => q.id === e.port).pos); });
    let bad = null;
    for (let s = 0; s < A.rt.pts.length - 1 && !bad; s++) {
      const a0 = A.rt.pts[s], a1 = A.rt.pts[s + 1];
      for (let t = 0; t < B.rt.pts.length - 1; t++) {
        const b0 = B.rt.pts[t], b1 = B.rt.pts[t + 1];
        const lo = (u, v, k) => Math.min(u[k], v[k]), hi = (u, v, k) => Math.max(u[k], v[k]);
        if ([0, 1, 2].some((k) => lo(a0, a1, k) - need > hi(b0, b1, k) || lo(b0, b1, k) - need > hi(a0, a1, k))) continue;
        const d = segSeg(a0, a1, b0, b1);
        if (d >= need) continue;
        if (shared.some((e) => Math.min(len(sub(a0, e)), len(sub(a1, e))) < 36 && Math.min(len(sub(b0, e)), len(sub(b1, e))) < 36)) continue;
        bad = `${A.c.a.dev}.${A.c.a.port}→${A.c.b.dev}.${A.c.b.port} × ${B.c.a.dev}.${B.c.a.port}→${B.c.b.dev}.${B.c.b.port} (${d.toFixed(1)} mm near ${a0.map((v) => v.toFixed(0))})`;
        break;
      }
    }
    if (bad) clashes.push(bad);
  }
  check(`${ex.id}: no two cables overlap`, !clashes.length, `${clashes.length}: ` + clashes.slice(0, 4).join('; '));

  // panel wires run inside the duct volume while they are between the duct walls
  const D = SCENE.duct;
  let outOfDuct = 0;
  for (const { rt } of list) for (const q of rt.pts) for (const d of SCENE.ducts) {
    if (Math.abs(q[1] - d.y) < d.h / 2 - 3 && q[0] > D.x0 && q[0] < D.x1 && q[2] < D.depth + 20 && (q[2] < rt.r || q[2] > D.depth - rt.r + 0.01)) outOfDuct++;
  }
  check(`${ex.id}: duct runs stay inside the ducts`, !outOfDuct, `${outOfDuct} points`);
}

console.log(failures ? `\n${failures} routing check(s) failed` : '\nall routing checks passed');
process.exit(failures ? 1 : 0);
