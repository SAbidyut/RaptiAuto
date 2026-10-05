// Automatic placement of devices in the lab: DIN rails on the mounting panel, the sloped operator
// console in front of it, the HMI stand, the motor bench and the programming laptop.
import { DEVICE_DEFS } from './defs.js';

export const SCENE = {
  panel: { x0: -470, x1: 470, y0: 0, y1: 680, z: 0 },
  rail1Y: 505,
  rail2Y: 255,
  ducts: [{ y: 625, h: 44 }, { y: 395, h: 44 }, { y: 95, h: 44 }],
  deviceZ: 12,
  console: { cx: 10, zBack: 250, zFront: 445, hBack: 150, hFront: 58, pitch: 74, perRow: 7 },
  hmi: { x: -450, z: 330, tilt: 0.32 },
  motor: { x: 470, z: 320, dz: 250 },
  laptop: { x: -250, z: 640, rotY: 0.22 },
};

const RAIL1_ORDER = { mcb: 0, power: 1, plc: 2 };

/**
 * Returns Map(deviceId → {pos:[x,y,z], rot:[rx,ry,rz], zone}) plus `console` geometry.
 */
export function layoutDevices(devices) {
  const out = new Map();
  const S = SCENE;
  const rail1 = [], rail2 = [], consoleDevs = [], motors = [];
  for (const d of devices) {
    const def = DEVICE_DEFS[d.type];
    if (!def) continue;
    if (def.zone === 'rail1') rail1.push(d);
    else if (def.zone === 'rail2') rail2.push(d);
    else if (def.zone === 'console') consoleDevs.push(d);
    else if (def.zone === 'motor') motors.push(d);
    else if (def.zone === 'hmi') out.set(d.id, { pos: [S.hmi.x, 70, S.hmi.z], rot: [-S.hmi.tilt, 0.18, 0], zone: 'hmi' });
    else if (def.zone === 'desk') out.set(d.id, { pos: [S.laptop.x, 0, S.laptop.z], rot: [0, S.laptop.rotY, 0], zone: 'desk' });
  }
  // rail 1: left → right (MCB, power supplies, PLC)
  rail1.sort((a, b) => (RAIL1_ORDER[cat(a)] ?? 3) - (RAIL1_ORDER[cat(b)] ?? 3));
  let x = S.panel.x0 + 34;
  for (const d of rail1) {
    const [w, h] = DEVICE_DEFS[d.type].size;
    out.set(d.id, { pos: [x + w / 2, S.rail1Y - h / 2, S.deviceZ], rot: [0, 0, 0], zone: 'rail1' });
    x += w + 16;
  }
  // rail 2: drives from the right
  x = S.panel.x1 - 40;
  for (const d of rail2) {
    const [w, h] = DEVICE_DEFS[d.type].size;
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
  motors.forEach((d, i) => out.set(d.id, { pos: [S.motor.x, 0, S.motor.z + i * S.motor.dz], rot: [0, 0, 0], zone: 'motor' }));
  return { places: out, console: { cx: C.cx, width, zBack: C.zBack, zFront: C.zFront, hBack: C.hBack, hFront: C.hFront, slope: L, theta, show: consoleDevs.length > 0 } };
}

function cat(d) {
  const def = DEVICE_DEFS[d.type];
  if (d.type === 'mcb') return 'mcb';
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
