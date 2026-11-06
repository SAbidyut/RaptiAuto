// Automatic placement of devices in the lab: DIN rails on the mounting panel, the sloped operator
// console in front of it, the HMI stand, the motor bench and the programming laptop.
import { DEVICE_DEFS } from './defs.js';

export const SCENE = {
  panel: { x0: -460, x1: 460, y0: 0, y1: 680, z: 0 },
  rail1Y: 505,
  rail2Y: 255,
  // horizontal slotted wire ducts (top → bottom) between x0 and x1, and the vertical ducts at
  // both sides that join them; all are `depth` deep, open at the front so the wiring stays visible
  ducts: [{ y: 625, h: 44 }, { y: 395, h: 44 }, { y: 95, h: 44 }],
  duct: { x0: -418, x1: 418, depth: 70, wall: 2, web: 9 },
  // `from`/`to`: the horizontal ducts a vertical duct joins (the middle one sits under the PLC,
  // left of the drives, so PLC wires drop straight to the bottom duct)
  vducts: [{ x: -437, w: 36, from: 0, to: 2 }, { x: 437, w: 36, from: 0, to: 2 }, { x: -200, w: 36, from: 1, to: 2 }],
  deviceZ: 12,
  console: { cx: 10, zBack: 250, zFront: 445, hBack: 150, hFront: 58, pitch: 74, perRow: 7 },
  hmi: { x: -420, z: 330, tilt: 0.32 },
  motor: { x: 470, z: 320, dz: 250 },
  // machines (conveyor, tank, cylinders) right of the motors, back to front; a full column wraps right
  machine: { x: 1180, z0: 40, z1: 1280, gap: 120, dx: 660 },
  laptop: { x: -760, z: 300, rotY: 0.62 },
};

const RAIL1_ORDER = { mcb: 0, power: 1, plc: 2, ext: 2.5, mains3: 3 };
const MACHINE_ORDER = { conveyor: 0, tank: 1, cylinder: 2 };

/**
 * Returns Map(deviceId → {pos:[x,y,z], rot:[rx,ry,rz], zone}) plus `console` geometry.
 */
export function layoutDevices(devices) {
  const out = new Map();
  const S = SCENE;
  const rail1 = [], rail2 = [], consoleDevs = [], motors = [], machines = [];
  for (const d of devices) {
    const def = DEVICE_DEFS[d.type];
    if (!def) continue;
    if (def.zone === 'rail1') rail1.push(d);
    else if (def.zone === 'rail2') rail2.push(d);
    else if (def.zone === 'console') consoleDevs.push(d);
    else if (def.zone === 'motor') motors.push(d);
    else if (def.zone === 'machine') machines.push(d);
    else if (def.zone === 'hmi') out.set(d.id, { pos: [S.hmi.x, 70, S.hmi.z], rot: [-S.hmi.tilt, 0.18, 0], zone: 'hmi' });
    else if (def.zone === 'desk') out.set(d.id, { pos: [S.laptop.x, 0, S.laptop.z], rot: [0, S.laptop.rotY, 0], zone: 'desk' });
  }
  // rail 1: left → right (MCB, power supplies, PLC)
  rail1.sort((a, b) => (RAIL1_ORDER[cat(a)] ?? 3) - (RAIL1_ORDER[cat(b)] ?? 3));
  let x = S.duct.x0 + 32, prev = null;
  for (const d of rail1) {
    const [w, h] = DEVICE_DEFS[d.type].size;
    // an expansion module clips onto the right side of the PLC (or of the module before it)
    if (prev && cat(d) === 'ext' && (prev === 'plc' || prev === 'ext')) x -= 15;
    out.set(d.id, { pos: [x + w / 2, S.rail1Y - h / 2, S.deviceZ], rot: [0, 0, 0], zone: 'rail1' });
    x += w + 16;
    prev = cat(d);
  }
  // rail 2: drives from the right; a device never sits on the middle vertical duct (it goes on its left)
  x = S.duct.x1 - 38;
  const mid = S.vducts.filter((v) => v.from <= 1 && v.to >= 2 && Math.abs(v.x) < S.duct.x1 - 40);
  for (const d of rail2) {
    const [w, h] = DEVICE_DEFS[d.type].size;
    for (const v of mid) if (x - w < v.x + v.w / 2 + 10 && x > v.x - v.w / 2 - 10) x = v.x - v.w / 2 - 10;
    out.set(d.id, { pos: [x - w / 2, S.rail2Y - h / 2 + 10, S.deviceZ], rot: [0, 0, 0], zone: 'rail2' });
    x -= w + 40;
  }
  // operator console
  const C = S.console;
  const n = Math.max(1, consoleDevs.length);
  const perRow = Math.min(C.perRow, n);
  const rows = Math.ceil(consoleDevs.length / C.perRow) || 1;
  const width = Math.max(260, perRow * C.pitch + 44);
  const dz = C.zFront - C.zBack, dy = C.hBack - C.hFront;
  const L = Math.hypot(dz, dy);
  const theta = Math.atan2(dy, dz);
  const upDir = [0, dy / L, -dz / L]; // up the slope
  const rotX = theta - Math.PI / 2;
  consoleDevs.forEach((d, i) => {
    const r = Math.floor(i / C.perRow), c = i % C.perRow;
    const inRow = Math.min(C.perRow, consoleDevs.length - r * C.perRow);
    const s = rows === 1 ? 0.5 : (r + 0.5) / rows; // 0 = back-top, 1 = front-bottom
    const cy = C.hBack - dy * s, cz = C.zBack + dz * s;
    const px = C.cx + (c - (inRow - 1) / 2) * C.pitch;
    const half = 43;
    out.set(d.id, { pos: [px, cy - upDir[1] * half + 1, cz - upDir[2] * half], rot: [rotX, 0, 0], zone: 'console', row: r });
  });
  motors.forEach((d, i) => out.set(d.id, { pos: [S.motor.x, 14, S.motor.z + i * S.motor.dz], rot: [0, 0, 0], zone: 'motor' }));
  // machines: each one's footprint (def.box) centred on the column, back edge at the cursor
  const M = S.machine;
  let mx = M.x, mz = M.z0;
  machines.sort((a, b) => (MACHINE_ORDER[a.type] ?? 9) - (MACHINE_ORDER[b.type] ?? 9));
  for (const d of machines) {
    const [[x0, , z0], [x1, , z1]] = DEVICE_DEFS[d.type].box;
    if (mz > M.z0 && mz + (z1 - z0) > M.z1) { mx += M.dx; mz = M.z0; }
    out.set(d.id, { pos: [mx - (x0 + x1) / 2, 0, mz - z0], rot: [0, 0, 0], zone: 'machine' });
    mz += z1 - z0 + M.gap;
  }
  return { places: out, console: { cx: C.cx, width, zBack: C.zBack, zFront: C.zFront, hBack: C.hBack, hFront: C.hFront, slope: L, theta, show: consoleDevs.length > 0 } };
}

function cat(d) {
  const def = DEVICE_DEFS[d.type];
  if (d.type === 'mcb' || d.type === 'mains3') return d.type;
  return def.category;
}

/** Device-local point → world (rotation order: Y, then X, then Z — matches three.js 'YXZ'). */
export function toWorld(place, p) {
  const [rx, ry] = place.rot;
  let [x, y, z] = p;
  // rotate about X
  const cx = Math.cos(rx), sx = Math.sin(rx);
  [y, z] = [y * cx - z * sx, y * sx + z * cx];
  // rotate about Y
  const cy = Math.cos(ry), sy = Math.sin(ry);
  [x, z] = [x * cy + z * sy, -x * sy + z * cy];
  return [x + place.pos[0], y + place.pos[1], z + place.pos[2]];
}

export function dirToWorld(place, d) {
  const o = toWorld({ ...place, pos: [0, 0, 0] }, d);
  return o;
}
