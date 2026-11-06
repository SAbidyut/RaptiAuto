// Component registry + geometry helpers shared by the editor, the netlist builder and the simulator.

export const PITCH = 10; // 0.1 inch in world units

const defs = new Map();
export const CATEGORIES = [
  { id: 'boards', name: 'Microcontrollers', icon: 'chip' },
  { id: 'basic', name: 'Basic & Passive', icon: 'resistor' },
  { id: 'output', name: 'LEDs & Output', icon: 'bulb' },
  { id: 'display', name: 'Displays', icon: 'display' },
  { id: 'input', name: 'Input & Controls', icon: 'button' },
  { id: 'sensors', name: 'Sensors', icon: 'sensor' },
  { id: 'motors', name: 'Motors & Actuators', icon: 'motor' },
  { id: 'power', name: 'Power & Breadboards', icon: 'battery' },
  { id: 'ics', name: 'ICs & Drivers', icon: 'ic' },
  { id: 'meters', name: 'Measurement', icon: 'meter' },
];

export function register(def) {
  if (!def.type) throw new Error('component without type');
  def.props = def.props || [];
  def.category = def.category || 'basic';
  defs.set(def.type, def);
  return def;
}

export function getDef(type) { return defs.get(type); }
export function allDefs() { return [...defs.values()]; }

export function defaultProps(def) {
  const p = {};
  for (const pr of def.props) p[pr.key] = pr.default;
  return p;
}

export function partProps(part) {
  const def = getDef(part.type);
  return { ...defaultProps(def), ...(part.props || {}) };
}

/** Pins of a part (resolved for its props). */
export function pinsOf(part) {
  const def = getDef(part.type);
  if (!def) return [];
  if (typeof def.pins === 'function') {
    const props = partProps(part);
    const key = def.type + JSON.stringify(props);
    def._pinCache = def._pinCache || new Map();
    let pins = def._pinCache.get(key);
    if (!pins) { pins = def.pins(props); def._pinCache.set(key, pins); }
    return pins;
  }
  return def.pins;
}

export function boxOf(part) {
  const def = getDef(part.type);
  if (typeof def.box === 'function') return def.box(partProps(part));
  return def.box;
}

export function rotatePoint(lx, ly, rot) {
  switch (((rot % 360) + 360) % 360) {
    case 90: return [-ly, lx];
    case 180: return [-lx, -ly];
    case 270: return [ly, -lx];
    default: return [lx, ly];
  }
}

/**
 * A part is placed as  world = position + flip(rotate(local)):  rotate first (part.rot), then mirror
 * on the screen (part.flipX = left ↔ right, part.flipY = up ↔ down), so "Mirror" always swaps left
 * and right whatever the rotation is.
 */
export function toWorld(part, lx, ly) {
  let [rx, ry] = rotatePoint(lx, ly, part.rot || 0);
  if (part.flipX) rx = -rx;
  if (part.flipY) ry = -ry;
  return [part.x + rx, part.y + ry];
}

export function toLocal(part, wx, wy) {
  let dx = wx - part.x, dy = wy - part.y;
  if (part.flipX) dx = -dx;
  if (part.flipY) dy = -dy;
  return rotatePoint(dx, dy, 360 - (part.rot || 0));
}

/** World position of a pin (used by the screenshot tool). */
export function pinWorld(part, pinId) {
  const pin = pinsOf(part).find((p) => p.id === pinId);
  if (!pin) return null;
  return toWorld(part, pin.x, pin.y);
}

/** World-space bounding box [x0,y0,x1,y1]. */
export function worldBox(part) {
  const b = boxOf(part);
  const pts = [toWorld(part, b[0], b[1]), toWorld(part, b[2], b[1]), toWorld(part, b[0], b[3]), toWorld(part, b[2], b[3])];
  return [
    Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])),
    Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1])),
  ];
}

export function partTransform(part) {
  const fx = part.flipX ? -1 : 1, fy = part.flipY ? -1 : 1;
  return `translate(${part.x} ${part.y})${fx < 0 || fy < 0 ? ` scale(${fx} ${fy})` : ''}${part.rot ? ` rotate(${part.rot})` : ''}`;
}

/**
 * Counter-scale for the text of a mirrored part, in the part's own (rotated) axes: the artwork is
 * mirrored but its lettering stays readable (each label is mirrored back around its own centre).
 */
export function textCounterScale(part) {
  const fx = part.flipX ? -1 : 1, fy = part.flipY ? -1 : 1;
  const quarter = (((part.rot || 0) % 180) + 180) % 180 === 90;
  return quarter ? [fy, fx] : [fx, fy];
}

/** Ohm value formatting: 220 -> "220Ω", 4700 -> "4.7kΩ". */
export function fmtOhms(v) {
  if (v >= 1e6) return trim(v / 1e6) + 'MΩ';
  if (v >= 1e3) return trim(v / 1e3) + 'kΩ';
  return trim(v) + 'Ω';
}
function trim(x) { return String(+x.toFixed(2)); }

export function parseOhms(s) {
  if (typeof s === 'number') return s;
  const m = /^\s*([\d.]+)\s*([kKmM]?)\s*(Ω|ohm|R)?\s*$/.exec(String(s));
  if (!m) return NaN;
  let v = parseFloat(m[1]);
  if (m[2] === 'k' || m[2] === 'K') v *= 1e3;
  if (m[2] === 'M') v *= 1e6;
  if (m[2] === 'm') v *= 1e-3;
  return v;
}

let idCounter = 0;
export function newId(prefix = 'p') {
  idCounter = (idCounter + 1) % 1e6;
  return prefix + Date.now().toString(36).slice(-5) + Math.floor(Math.random() * 1e4).toString(36) + idCounter.toString(36);
}
