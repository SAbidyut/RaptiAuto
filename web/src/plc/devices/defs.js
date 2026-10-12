// Device catalogue of the PLC lab: Delta DVP PLCs, Delta DOP HMI, Delta MS300 VFD, Delta power
// supply, MCB, field devices (push buttons, lamps, sensors …), motor and the programming laptop.
// Geometry is in millimetres in a device-local frame: origin at the bottom-centre of the back
// (mounting) face, x → right, y → up, z → front. Port positions are used by the 3D models,
// cable routing and picking; the simulator only uses port ids.

import { MB_PROPS } from '../sim/mbdevices.js';

const FRONT = [0, 0, 1];
const up = (k = 0.55) => norm([0, k, 1]);
const down = (k = 0.55) => norm([0, -k, 1]);
function norm(v) { const l = Math.hypot(...v); return v.map((x) => x / l); }

/** Evenly spaced terminal row. */
function row(ids, { x0, x1, y, z, dir, sig, kind = 'term', labels }) {
  const n = ids.length;
  const pitch = n > 1 ? (x1 - x0) / (n - 1) : 0;
  return ids.map((id, i) => ({ id, label: (labels && labels[i]) || id, kind, pos: [x0 + pitch * i, y, z], dir, sig: typeof sig === 'function' ? sig(id) : sig, pitch }));
}

const plcSig = (id) => (id === 'L' ? 'L' : id === 'N' ? 'N' : id === 'PE' || /^FE/.test(id) ? 'PE' : id === '+24V' || id === 'UP' ? '+24' : id === '0V' || id === 'ZP' ? '0V'
  : id === 'S/S' ? 'ss' : /^C\d/.test(id) ? 'com' : /^Y/.test(id) ? 'out' : /^(V\d|I\d|VI\d|VO|IO|AG)/.test(id) ? 'an' : 'in');

const oct = (n) => n.toString(8);
const Xs = (n) => Array.from({ length: n }, (_, i) => 'X' + oct(i));
const Ys = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => 'Y' + oct(a + i));
const COM23 = ['COM2:D+', 'COM2:D-', 'COM2:SG', 'COM3:D+', 'COM3:D-'];

/**
 * Delta DVP-ES2 / EX2 as on the real units (black housing, grey removable terminal blocks). `top` /
 * `bottom` list the terminal positions left → right exactly as printed on the PLC; `COMn:x` are the
 * RS-485 screw terminals (COM2 is one cable port, COM3 is drawn but not simulated). `groups` are
 * the bracket captions printed next to the terminal names.
 */
export const PLC_MODELS = {
  'dvp-16es2': {
    name: 'DVP16ES200R', short: 'DVP16ES2', spec: '8DI/8DO', badge: 'R', inputs: 8, outputs: 8, ai: 0, ao: 0, w: 105, out: 'relay', relayGroups: [4, 4], steps: 15872,
    top: ['L', 'N', 'PE', 'NC', '+24V', '0V', 'S/S', ...Xs(8)],
    bottom: [...COM23, 'C0', ...Ys(0, 3), 'C1', ...Ys(4, 7)],
    groups: { top: [[0, 1, 'AC IN'], [4, 5, 'DC OUT'], [7, 14, 'IN']], bottom: [[0, 2, 'COM2'], [3, 4, 'COM3'], [5, 9, 'OUT'], [10, 14, 'OUT']] },
  },
  'dvp-32es2': {
    name: 'DVP32ES200R', short: 'DVP32ES2', spec: '16DI/16DO', badge: 'R', inputs: 16, outputs: 16, ai: 0, ao: 0, w: 145, out: 'relay', relayGroups: [4, 4, 4, 4], steps: 15872,
    top: ['L', 'N', 'PE', 'NC', '+24V', '0V', 'S/S', ...Xs(16)],
    bottom: [...COM23, 'C0', ...Ys(0, 3), 'C1', ...Ys(4, 7), 'C2', ...Ys(8, 11), 'C3', ...Ys(12, 15)],
    groups: { top: [[0, 1, 'AC IN'], [4, 5, 'DC OUT'], [7, 22, 'IN']], bottom: [[0, 2, 'COM2'], [3, 4, 'COM3'], [5, 9, 'OUT'], [10, 14, 'OUT'], [15, 19, 'OUT'], [20, 24, 'OUT']] },
  },
  'dvp-20ex2': {
    name: 'DVP20EX200T', short: 'DVP20EX2', spec: '8DI/6DO/4AI/2AO', badge: 'T', inputs: 8, outputs: 6, ai: 4, ao: 2, w: 145, out: 'npn', steps: 15872,
    top: ['L', 'N', 'PE', 'NC', 'S/S', ...Xs(8), 'FE', 'V0+', 'I0+', 'VI0-', 'V1+', 'I1+', 'VI1-', 'V2+', 'I2+', 'VI2-'],
    bottom: [...COM23, '+24V', '0V', 'UP', 'ZP', ...Ys(0, 5), 'FE2', 'V3+', 'I3+', 'VI3-', 'VO0', 'IO0', 'AG0', 'VO1', 'IO1', 'AG1'],
    groups: { top: [[0, 1, 'AC IN'], [4, 12, 'IN'], [14, 22, 'A→D']], bottom: [[0, 2, 'COM2'], [3, 4, 'COM3'], [5, 6, 'DC OUT'], [7, 14, 'OUT'], [16, 18, 'A→D'], [19, 24, 'D→A']] },
  },
};

const PLC_LABEL = { PE: '⏚', '0V': '24G', FE2: 'FE', AG0: 'AG', AG1: 'AG', 'COM2:D+': 'D+', 'COM2:D-': 'D−', 'COM2:SG': 'SG', 'COM3:D+': 'D+', 'COM3:D-': 'D−' };
export const plcTermLabel = (id) => PLC_LABEL[id] || id.replace(/-$/, '−');

/** Housing of the ES2 / EX2 (mm): height, depth, terminal hole rows, terminal x positions. */
export const PLC_GEO = { h: 110, d: 82, holeTop: 95.5, holeBot: 14.5, face: 70, swY: 71, com1Y: 54, usbY: 34, colX: (m) => -m.w / 2 + 17 };
export function plcTermX(m, n, i) {
  const x0 = -m.w / 2 + 4, x1 = m.w / 2 - 4;
  return x0 + ((x1 - x0) * (i + 0.5)) / n;
}

function plcPorts(type) {
  const m = PLC_MODELS[type];
  const G = PLC_GEO;
  const ports = [];
  for (const [list, y, dir] of [[m.top, G.holeTop, up(0.35)], [m.bottom, G.holeBot, down(0.35)]]) {
    const pitch = (m.w - 8) / list.length;
    list.forEach((id, i) => {
      if (id.startsWith('COM')) return;
      ports.push({ id, label: plcTermLabel(id), kind: 'term', pos: [plcTermX(m, list.length, i), y, G.face], dir, sig: plcSig(id), pitch });
    });
  }
  // COM2: one RS-485 cable landing on D+ / D− / SG
  const nb = m.bottom.length;
  ports.push({ id: 'COM2', label: 'COM2 RS-485 (D+ D− SG)', kind: 'comm', bus: 'rs485', conn: 'term3', pos: [plcTermX(m, nb, 1), G.holeBot, G.face + 1], dir: down(0.35), max: 2 });
  ports.push({ id: 'COM1', label: 'COM1 RS-232', kind: 'comm', bus: 'rs232', conn: 'minidin', pos: [G.colX(m), G.com1Y, G.d], dir: FRONT, max: 1 });
  // mini-USB programming port under COM1
  ports.push({ id: 'USB', label: 'USB (programming)', kind: 'comm', bus: 'usb', conn: 'usbmini', pos: [G.colX(m), G.usbY, G.d], dir: FRONT, max: 1 });
  return ports;
}

/** Old (≤ 2.9) PLC terminal ids → the real terminal names. */
export const PLC_PORT_RENAMES = { 'dvp-20ex2': { AIG: 'VI0-', AOG: 'AG0', C0: 'ZP', C1: 'ZP' } };

const SIG_COLOR = {
  L: '#7c4a1e', N: '#2563eb', PE: 'pe', '+24': '#dc2626', '0V': '#1e3a8a', in: '#f97316', ss: '#dc2626', out: '#e5e7eb', com: '#dc2626',
  an: '#a855f7', mot: '#111827', ctl: '#f97316', ac: '#7c4a1e',
};
export function wireColorFor(sig) { return SIG_COLOR[sig] || '#f97316'; }

// field modules on the operator console: 64 × 86 mm plates with 4 mm banana sockets
const OUTPUT_PROP = { id: 'output', label: 'Output', type: 'select', options: { PNP: 'PNP (switches +24 V)', NPN: 'NPN (switches 0 V)' } };
const sockRow = (ids, labels, sig) => row(ids, { x0: -((ids.length - 1) * 17) / 2, x1: ((ids.length - 1) * 17) / 2, y: 17, z: 6, dir: FRONT, sig, kind: 'sock', labels });

export const DEVICE_DEFS = {
  // ---------------------------------------------------------------- PLC
  'dvp-16es2': plcDef('dvp-16es2', 'DVP16ES200R: 8 inputs X0–X7 (S/S common, sink or source), 8 relay outputs Y0–Y7 in two groups (C0: Y0–Y3, C1: Y4–Y7), 100–240 V AC supply with a 24 V DC 0.5 A output (+24V / 24G), COM1 RS-232, COM2 and COM3 RS-485. The most popular Delta starter PLC.'),
  'dvp-32es2': plcDef('dvp-32es2', 'DVP32ES200R: 16 inputs X0–X17, 16 relay outputs Y0–Y17 in four groups of four (C0 … C3), 24 V DC output +24V / 24G, COM1 RS-232, COM2 and COM3 RS-485.'),
  'dvp-20ex2': plcDef('dvp-20ex2', 'DVP20EX200T: 8 inputs X0–X7, 6 NPN transistor outputs Y0–Y5 (power UP = +24 V, ZP = 0 V; an ON output pulls its load to ZP), 4 analog inputs V0+ / I0+ / VI0− … (±10 V, or ±20 mA with In+ bridged to Vn+; D1110–D1113, ±2000) and 2 analog outputs VO0 / IO0 / AG (0–10 V or 0–20 mA; D1116–D1117, 0–2000).'),

  // ---------------------------------------------------------------- HMI
  'dop-107bv': {
    type: 'dop-107bv', name: 'Delta DOP-107BV', short: 'DOP-107BV', part: 'DOP-107BV', brand: 'Delta', category: 'hmi', sim: 'hmi', zone: 'hmi', max: 1,
    size: [200, 146, 46],
    description: '7" (800 × 480) touch-screen HMI. Talks to the PLC with the Delta DVP protocol on COM1 (RS-232) or COM2 (RS-485). Needs 24 V DC.',
    props: [
      { id: 'port', label: 'PLC link port', type: 'select', options: { COM1: 'COM1 · RS-232', COM2: 'COM2 · RS-485' } },
      { id: 'station', label: 'PLC station number', type: 'number', min: 0, max: 254 },
    ],
    defaults: { port: 'COM1', station: 1 },
    ports: () => [
      { id: '+', label: '+24V', kind: 'term', pos: [-74, 0, 22], dir: [0, -1, 0], sig: '+24' },
      { id: '-', label: '0V', kind: 'term', pos: [-64, 0, 22], dir: [0, -1, 0], sig: '0V' },
      { id: 'PE', label: '⏚', kind: 'term', pos: [-54, 0, 22], dir: [0, -1, 0], sig: 'PE' },
      { id: 'COM1', label: 'COM1 RS-232', kind: 'comm', bus: 'rs232', conn: 'db9', pos: [-14, 0, 22], dir: [0, -1, 0], max: 1 },
      { id: 'COM2', label: 'COM2 RS-485', kind: 'comm', bus: 'rs485', conn: 'db9', pos: [28, 0, 22], dir: [0, -1, 0], max: 1 },
    ],
  },

  // ---------------------------------------------------------------- VFD
  'ms300': {
    type: 'ms300', name: 'Delta VFD MS300', short: 'MS300', part: 'VFD7A5MS21ANSAA', brand: 'Delta', category: 'vfd', sim: 'vfd', zone: 'rail2', max: 3,
    size: [100, 190, 150],
    description: 'Compact AC motor drive, 1.5 kW, 1-phase 230 V in → 3-phase out. Keypad with speed dial, MI1–MI7 inputs, AVI 0–10 V and ACI 4–20 mA / 0–10 V, AFM output, relay RA/RB/RC, MO1 / MO2 open-collector outputs (MCM common), PID control and RS-485 Modbus (RJ45).',
    props: [],
    defaults: {},
    ports: () => [
      ...row(['MI1', 'MI2', 'MI3', 'MI4', 'MI5', 'MI6', 'MI7', 'DCM', '+24V'], { x0: -40, x1: 40, y: 88, z: 136, dir: FRONT, sig: (id) => (id === '+24V' ? '+24' : id === 'DCM' ? '0V' : 'ctl') }),
      ...row(['MO1', 'MO2', 'MCM', '+10V', 'AVI', 'ACI', 'ACM', 'AFM', 'RA', 'RB', 'RC'], { x0: -41, x1: 41, y: 72, z: 136, dir: FRONT, sig: (id) => (/^R|^MO|^MCM/.test(id) ? 'ctl' : 'an') }),
      { id: 'RS485', label: 'RS-485 (RJ45)', kind: 'comm', bus: 'rs485', conn: 'rj45', pos: [26, 54, 137], dir: FRONT, max: 2 },
      ...row(['R/L1', 'S/L2', 'PE', 'U/T1', 'V/T2', 'W/T3'], { x0: -38, x1: 38, y: 22, z: 138, dir: down(0.35), sig: (id) => (id === 'R/L1' ? 'L' : id === 'S/L2' ? 'N' : id === 'PE' ? 'PE' : 'mot'), labels: ['R/L1', 'S/L2', '⏚', 'U/T1', 'V/T2', 'W/T3'] }),
    ],
  },

  // ---------------------------------------------------------------- power
  'drp024': {
    type: 'drp024', name: 'Delta 24 V power supply', short: 'DRP024V060W', part: 'DRP024V060W1AZ', brand: 'Delta', category: 'power', sim: 'psu', zone: 'rail1', max: 2,
    size: [50, 125, 110],
    description: 'Delta CliQ DIN-rail power supply, 100–240 V AC in → 24 V DC 2.5 A out. Powers the HMI, sensors, push buttons and lamps.',
    props: [], defaults: {},
    ports: () => [
      ...row(['L', 'N', 'PE'], { x0: -15, x1: 15, y: 114, z: 100, dir: up(0.6), sig: (id) => id, labels: ['L', 'N', '⏚'] }),
      ...row(['+V1', '+V2', '-V1', '-V2'], { x0: -18, x1: 18, y: 11, z: 100, dir: down(0.6), sig: (id) => (id[0] === '+' ? '+24' : '0V'), labels: ['+V', '+V', '−V', '−V'] }),
    ],
  },
  'mcb': {
    type: 'mcb', name: 'Main supply + MCB 2P', short: 'MCB C10', part: 'MCB 2P C10', brand: '', category: 'power', sim: 'mcb', zone: 'rail1', max: 1,
    size: [48, 90, 72],
    description: '230 V AC mains with a 2-pole C10 miniature circuit breaker and an earth (PE) terminal. Trips on a short circuit.',
    props: [], defaults: {}, state: { on: true },
    ports: () => [
      { id: 'L', label: 'L (230 V)', kind: 'term', pos: [-15, 10, 64], dir: down(0.6), sig: 'L', pitch: 12 },
      { id: 'N', label: 'N', kind: 'term', pos: [-3, 10, 64], dir: down(0.6), sig: 'N', pitch: 12 },
      { id: 'PE', label: '⏚ PE', kind: 'term', pos: [17, 60, 50], dir: FRONT, sig: 'PE', pitch: 10 },
    ],
  },

  // ---------------------------------------------------------------- field devices (operator console)
  'pb': {
    type: 'pb', name: 'Push button', short: 'Push button', category: 'field', sim: 'pb', zone: 'console', max: 16,
    size: [64, 86, 6],
    description: '22 mm momentary push button with an NO (13–14) or NC (11–12) contact. Hold it pressed in Operate mode.',
    props: [
      { id: 'label', label: 'Label', type: 'text' },
      { id: 'color', label: 'Colour', type: 'select', options: { green: 'Green', red: 'Red', yellow: 'Yellow', blue: 'Blue', black: 'Black', white: 'White' } },
      { id: 'contact', label: 'Contact', type: 'select', options: { NO: 'NO (13–14)', NC: 'NC (11–12)' } },
    ],
    defaults: { label: 'START', color: 'green', contact: 'NO' },
    ports: (p) => (p.contact === 'NC' ? sockRow(['11', '12'], null, 'in') : sockRow(['13', '14'], null, 'in')),
  },
  'estop': {
    type: 'estop', name: 'Emergency stop', short: 'E-stop', category: 'field', sim: 'estop', zone: 'console', max: 4,
    size: [64, 86, 6],
    description: 'Red mushroom emergency stop with an NC contact (11–12). Tap to press (it latches), tap again to release.',
    props: [{ id: 'label', label: 'Label', type: 'text' }], defaults: { label: 'E-STOP' }, state: { pressed: false },
    ports: () => sockRow(['11', '12'], null, 'in'),
  },
  'selector': {
    type: 'selector', name: 'Selector switch', short: 'Selector', category: 'field', sim: 'selector', zone: 'console', max: 8,
    size: [64, 86, 6],
    description: '2-position maintained selector switch with an NO contact (13–14), closed in position 1.',
    props: [{ id: 'label', label: 'Label', type: 'text' }, { id: 'pos0', label: 'Position 0 text', type: 'text' }, { id: 'pos1', label: 'Position 1 text', type: 'text' }],
    defaults: { label: 'MODE', pos0: 'MAN', pos1: 'AUTO' }, state: { on: false },
    ports: () => sockRow(['13', '14'], null, 'in'),
  },
  'selector3': {
    type: 'selector3', name: 'Selector switch 3-position', short: '3-pos selector', part: 'FWD – 0 – REV · 2 NO', category: 'field', sim: 'selector3', zone: 'console', max: 6,
    size: [64, 86, 6],
    description: '3-position maintained selector switch (e.g. FWD – 0 – REV or HAND – OFF – AUTO). Left closes 13–14, right closes 23–24, the middle position opens both. Tap to turn it: it goes through 0 to the other side.',
    props: [{ id: 'label', label: 'Label', type: 'text' }, { id: 'pos0', label: 'Left position text', type: 'text' }, { id: 'pos1', label: 'Right position text', type: 'text' }],
    defaults: { label: 'DIRECTION', pos0: 'FWD', pos1: 'REV' }, state: { pos: 0, last: 1 },
    ports: () => sockRow(['13', '14', '23', '24'], null, 'in'),
  },
  'lamp': {
    type: 'lamp', name: 'Pilot lamp 24 V', short: 'Pilot lamp', category: 'field', sim: 'lamp', zone: 'console', max: 16,
    size: [64, 86, 6],
    description: '22 mm LED pilot lamp, 24 V AC/DC, terminals X1 and X2.',
    props: [
      { id: 'label', label: 'Label', type: 'text' },
      { id: 'color', label: 'Colour', type: 'select', options: { green: 'Green', red: 'Red', yellow: 'Amber', blue: 'Blue', white: 'White' } },
    ],
    defaults: { label: 'RUN', color: 'green' },
    ports: () => sockRow(['X1', 'X2'], null, 'out'),
  },
  'buzzer': {
    type: 'buzzer', name: 'Buzzer 24 V', short: 'Buzzer', category: 'field', sim: 'buzzer', zone: 'console', max: 4,
    size: [64, 86, 6],
    description: '24 V DC panel buzzer (+ / −). Sounds while powered.',
    props: [{ id: 'label', label: 'Label', type: 'text' }], defaults: { label: 'ALARM' },
    ports: () => sockRow(['+', '-'], ['+', '−'], 'out'),
  },
  'pot': {
    type: 'pot', name: 'Potentiometer 10 kΩ', short: 'Speed pot', category: 'field', sim: 'pot', zone: 'console', max: 4,
    size: [64, 86, 6],
    description: '10 kΩ speed potentiometer. Wire 1 to +10V, 3 to ACM and 2 (wiper) to the VFD AVI input — or to a PLC analog input.',
    props: [{ id: 'label', label: 'Label', type: 'text' }], defaults: { label: 'SPEED' }, state: { pos: 0.5 },
    ports: () => sockRow(['1', '2', '3'], null, 'an'),
  },

  // ---------------------------------------------------------------- industrial sensors (console)
  'prox': {
    type: 'prox', name: 'Inductive proximity sensor', short: 'Prox sensor', part: 'M18 inductive · 3-wire', category: 'sensor', sim: 'prox', look: 'ind', zone: 'console', max: 6,
    size: [64, 86, 6],
    description: 'M18 inductive proximity sensor (detects metal), NO, 3-wire: BN (+24 V), BU (0 V), BK (output → PLC input). PNP switches +24 V, NPN switches 0 V. Tap to move a metal part in front of it.',
    props: [{ id: 'label', label: 'Label', type: 'text' }, OUTPUT_PROP], defaults: { label: 'SENSOR', output: 'PNP' }, state: { target: false },
    ports: () => sockRow(['BN', 'BU', 'BK'], null, 'in'),
  },
  'prox-cap': {
    type: 'prox-cap', name: 'Capacitive proximity sensor', short: 'Capacitive sensor', part: 'M18 capacitive · 3-wire', category: 'sensor', sim: 'prox', look: 'cap', zone: 'console', max: 6,
    size: [64, 86, 6],
    description: 'M18 capacitive sensor: detects metal, plastic, wood, powder and liquids (also through a plastic tank wall, as a level sensor). NO, 3-wire BN / BU / BK, PNP or NPN. Tap to bring material in front of it.',
    props: [{ id: 'label', label: 'Label', type: 'text' }, OUTPUT_PROP], defaults: { label: 'LEVEL', output: 'PNP' }, state: { target: false },
    ports: () => sockRow(['BN', 'BU', 'BK'], null, 'in'),
  },
  'photo': {
    type: 'photo', name: 'Photoelectric sensor', short: 'Photo sensor', part: 'Diffuse reflective · 3-wire', category: 'sensor', sim: 'prox', look: 'photo', zone: 'console', max: 6,
    size: [64, 86, 6],
    description: 'Diffuse-reflective photoelectric sensor (light beam, range ≈ 300 mm), NO, 3-wire BN / BU / BK, PNP or NPN. Tap to put a box in the beam.',
    props: [{ id: 'label', label: 'Label', type: 'text' }, OUTPUT_PROP], defaults: { label: 'PHOTO', output: 'PNP' }, state: { target: false },
    ports: () => sockRow(['BN', 'BU', 'BK'], null, 'in'),
  },
  'limit': {
    type: 'limit', name: 'Limit switch', short: 'Limit switch', part: 'Roller lever · 1NO + 1NC', category: 'sensor', sim: 'limit', look: 'limit', zone: 'console', max: 8,
    size: [64, 86, 6],
    description: 'Roller-lever limit switch with an NO (13–14) and an NC (21–22) contact. No supply needed — wire it like a push button. Tap to push the lever (a cam / end stop).',
    props: [{ id: 'label', label: 'Label', type: 'text' }], defaults: { label: 'LS1' }, state: { on: false },
    ports: () => sockRow(['13', '14', '21', '22'], null, 'in'),
  },
  'float': {
    type: 'float', name: 'Float level switch', short: 'Float switch', part: 'Tank float · 1NO + 1NC', category: 'sensor', sim: 'limit', look: 'float', zone: 'console', max: 6,
    size: [64, 86, 6],
    description: 'Float level switch for a tank: NO (13–14) closes and NC (21–22) opens when the liquid reaches the float. Tap to raise / lower the level.',
    props: [{ id: 'label', label: 'Label', type: 'text' }], defaults: { label: 'HIGH LVL' }, state: { on: false },
    ports: () => sockRow(['13', '14', '21', '22'], null, 'in'),
  },
  'temp-tx': {
    type: 'temp-tx', name: 'Temperature transmitter', short: 'Temp transmitter', part: 'PT100 → 0–10 V · 0–150 °C', category: 'sensor', sim: 'atx', look: 'temp', zone: 'console', max: 4,
    size: [64, 86, 6],
    description: 'PT100 temperature transmitter, 24 V DC, 3-wire: BN (+24 V), BU (0 V), BK (0–10 V signal = range). Wire BK to an analog input (DVP20EX2 V0+ with VI0− to 0 V, MS300 AVI / ACI with ACM). The 4–20 mA version goes to the EX2 I0+ (bridged to V0+) or the MS300 ACI. Tap to set the temperature.',
    props: [{ id: 'label', label: 'Label', type: 'text' }, { id: 'min', label: 'Range low (°C)', type: 'number', min: -200, max: 1000 }, { id: 'max', label: 'Range high (°C)', type: 'number', min: -200, max: 1000 }, { id: 'signal', label: 'Output signal', type: 'select', options: { '0-10V': '0–10 V', '4-20mA': '4–20 mA (current loop)' } }],
    defaults: { label: 'TEMP', min: 0, max: 150, unit: '°C', signal: '0-10V' }, state: { pos: 0.2 },
    ports: () => sockRow(['BN', 'BU', 'BK'], ['+24', '0V', 'OUT'], 'an'),
  },
  'press-tx': {
    type: 'press-tx', name: 'Pressure transmitter', short: 'Pressure transmitter', part: '0–10 bar → 0–10 V', category: 'sensor', sim: 'atx', look: 'press', zone: 'console', max: 4,
    size: [64, 86, 6],
    description: 'Pressure transmitter, 24 V DC, 3-wire: BN (+24 V), BU (0 V), BK (0–10 V signal = range). Wire BK to an analog input (DVP20EX2 V0+ with VI0− to 0 V, MS300 AVI / ACI with ACM). The 4–20 mA version goes to the EX2 I0+ (bridged to V0+) or the MS300 ACI. Tap to set the pressure.',
    props: [{ id: 'label', label: 'Label', type: 'text' }, { id: 'min', label: 'Range low (bar)', type: 'number', min: -1, max: 1000 }, { id: 'max', label: 'Range high (bar)', type: 'number', min: -1, max: 1000 }, { id: 'signal', label: 'Output signal', type: 'select', options: { '0-10V': '0–10 V', '4-20mA': '4–20 mA (current loop)' } }],
    defaults: { label: 'PRESSURE', min: 0, max: 10, unit: 'bar', signal: '0-10V' }, state: { pos: 0.4 },
    ports: () => sockRow(['BN', 'BU', 'BK'], ['+24', '0V', 'OUT'], 'an'),
  },

  // ---------------------------------------------------------------- switchgear (DIN rail 2)
  'contactor': {
    type: 'contactor', name: 'Magnetic contactor 3P', short: 'Contactor', part: '9 A · AC-3 4 kW · 1NO + 1NC', brand: '', category: 'switchgear', sim: 'contactor', zone: 'rail2', max: 4,
    size: [45, 82, 86],
    description: 'Magnetic contactor: when the coil A1–A2 is energised the 3 main contacts (1/L1–2/T1, 3/L2–4/T2, 5/L3–6/T3) and the auxiliary NO 13–14 close and the NC 21–22 opens. Drive the coil from a PLC output, use 13–14 as feedback or a hard-wired self-holding contact, and switch a motor between the drive and the motor. Hold it in Operate mode to push it in by hand.',
    props: [
      { id: 'label', label: 'Label', type: 'text' },
      { id: 'coil', label: 'Coil voltage', type: 'select', options: { '24DC': '24 V DC', '230AC': '230 V AC' } },
    ],
    defaults: { label: 'KM1', coil: '24DC' },
    ports: () => [
      ...row(['A1', 'L1', 'L2', 'L3', '13', '21'], { x0: -18, x1: 18, y: 74, z: 80, dir: up(0.6), sig: (id) => (id === 'A1' ? 'ctl' : /^L/.test(id) ? 'mot' : 'in'), labels: ['A1', '1/L1', '3/L2', '5/L3', '13', '21'] }),
      ...row(['A2', 'T1', 'T2', 'T3', '14', '22'], { x0: -18, x1: 18, y: 8, z: 80, dir: down(0.6), sig: (id) => (id === 'A2' ? 'ctl' : /^T/.test(id) ? 'mot' : 'in'), labels: ['A2', '2/T1', '4/T2', '6/T3', '14', '22'] }),
    ],
  },
  'olr': {
    type: 'olr', name: 'Thermal overload relay', short: 'Overload relay', part: '2.5–4 A · 1NC + 1NO', brand: '', category: 'switchgear', sim: 'olr', zone: 'rail2', max: 4,
    size: [45, 66, 86],
    description: 'Thermal overload relay that goes under the contactor: the motor current passes 1/L1–2/T1, 3/L2–4/T2, 5/L3–6/T3; on overload the NC 95–96 opens (wire it in series with the contactor coil or to a PLC input) and the NO 97–98 closes. Tap the button to test-trip it, tap again to reset.',
    props: [{ id: 'label', label: 'Label', type: 'text' }], defaults: { label: 'F1' }, state: { tripped: false },
    ports: () => [
      ...row(['L1', 'L2', 'L3', '95', '97'], { x0: -17, x1: 17, y: 58, z: 80, dir: up(0.6), sig: (id) => (/^L/.test(id) ? 'mot' : 'in'), labels: ['1/L1', '3/L2', '5/L3', '95', '97'] }),
      ...row(['T1', 'T2', 'T3', '96', '98'], { x0: -17, x1: 17, y: 8, z: 80, dir: down(0.6), sig: (id) => (/^T/.test(id) ? 'mot' : 'in'), labels: ['2/T1', '4/T2', '6/T3', '96', '98'] }),
    ],
  },

  'relay': {
    type: 'relay', name: 'Interface relay 24 V DC', short: 'Relay', part: 'Plug-in relay + socket · 1 CO · 10 A', brand: '', category: 'switchgear', sim: 'relay', zone: 'rail2', max: 8,
    size: [28, 80, 76],
    description: 'Plug-in interface relay on a DIN-rail socket with an LED: 24 V DC coil A1 (+) / A2 (−) and one change-over contact — 11 (common) to 14 (NO) closes, 11 to 12 (NC) opens when the coil is ON. Use it between a PLC output and a bigger load, a 230 V coil or a VFD input.',
    props: [{ id: 'label', label: 'Label', type: 'text' }], defaults: { label: 'K1' },
    ports: () => [
      ...row(['A1', '11'], { x0: -7, x1: 7, y: 72, z: 70, dir: up(0.6), sig: (id) => (id === 'A1' ? 'ctl' : 'in'), labels: ['A1+', '11'] }),
      ...row(['A2', '12', '14'], { x0: -9, x1: 9, y: 8, z: 70, dir: down(0.6), sig: (id) => (id === 'A2' ? 'ctl' : 'in'), labels: ['A2−', '12', '14'] }),
    ],
  },
  'breaker': {
    type: 'breaker', name: 'Circuit breaker (MCB / MCCB)', short: 'Breaker', part: 'Miniature circuit breaker', brand: '', category: 'switchgear', sim: 'cb', zone: 'rail2', max: 6,
    size: [36, 90, 72],
    description: 'Miniature / moulded-case circuit breaker: 1-pole for a control circuit (24 V or 230 V) or 3-pole to protect a motor feeder. Top terminals in, bottom terminals out; tap the lever to switch it ON / OFF.',
    props: [
      { id: 'label', label: 'Label', type: 'text' },
      { id: 'poles', label: 'Poles', type: 'select', options: { '1P': '1-pole (control)', '3P': '3-pole (motor / MCCB)' } },
      { id: 'rating', label: 'Rating', type: 'select', options: { C2: 'C2', C6: 'C6', C10: 'C10', C16: 'C16', C32: 'C32' } },
    ],
    defaults: { label: 'QF1', poles: '1P', rating: 'C6' }, state: { on: true },
    ports: (p) => (p.poles === '3P'
      ? [...row(['L1', 'L2', 'L3'], { x0: -14, x1: 14, y: 82, z: 64, dir: up(0.6), sig: 'mot', labels: ['1', '3', '5'] }), ...row(['T1', 'T2', 'T3'], { x0: -14, x1: 14, y: 8, z: 64, dir: down(0.6), sig: 'mot', labels: ['2', '4', '6'] })]
      : [{ id: '1', label: '1', kind: 'term', pos: [0, 82, 64], dir: up(0.6), sig: 'ctl', pitch: 12 }, { id: '2', label: '2', kind: 'term', pos: [0, 8, 64], dir: down(0.6), sig: 'ctl', pitch: 12 }]),
  },
  'tb': {
    type: 'tb', name: 'Terminal block strip', short: 'Terminals', part: '6 × feed-through · 4 mm²', brand: '', category: 'switchgear', sim: 'tb', zone: 'rail2', max: 4,
    size: [60, 56, 48],
    description: 'Six DIN-rail feed-through terminals (X1:1 … X1:6). Each top terminal is joined to the bottom terminal with the same number — the field wiring lands on one side, the panel wiring on the other.',
    props: [{ id: 'label', label: 'Label', type: 'text' }], defaults: { label: 'X1' },
    ports: () => [
      ...row(['1', '2', '3', '4', '5', '6'], { x0: -25, x1: 25, y: 50, z: 44, dir: up(0.6), sig: 'in', labels: ['1', '2', '3', '4', '5', '6'] }),
      ...row(['1b', '2b', '3b', '4b', '5b', '6b'], { x0: -25, x1: 25, y: 6, z: 44, dir: down(0.6), sig: 'in', labels: ['1', '2', '3', '4', '5', '6'] }),
    ],
  },

  // ---------------------------------------------------------------- Modbus RS-485 slaves (DIN rail 2)
  'dtb4848': {
    type: 'dtb4848', name: 'Delta DTB4848 temperature controller', short: 'DTB4848', part: 'DTB4848VR · PID · RS-485', brand: 'Delta', category: 'modbus', sim: 'tc', zone: 'rail2', max: 3,
    size: [56, 124, 76],
    description: '48 × 48 mm PID temperature controller (100–240 V AC on L / N) with a thermocouple in a small oven and the 500 W heater on OUT1. RS-485 on D+ / D−, Modbus ASCII or RTU (factory setting: station 1, 9600 bps 7E1 ASCII). Registers: 1000H PV, 1001H SV, 1002H / 1003H range, 1005H control (0 PID, 1 ON/OFF, 2 manual), 1012H output 1 %, bit 0814H RUN / STOP — all in 0.1 °C. Tap ▲ / ▼ to change SV, tap the display for RUN / STOP.',
    props: [{ id: 'label', label: 'Label', type: 'text' }, ...MB_PROPS],
    defaults: { label: 'OVEN', station: 1, baud: '9600', format: '7E1', protocol: 'ASCII' }, state: { sv: 120, run: true, mode: 0 },
    ports: () => [
      ...row(['L', 'N'], { x0: -9, x1: 9, y: 113, z: 66, dir: up(0.6), sig: (id) => id }),
      { id: 'RS485', label: 'RS-485 (D+ D−)', kind: 'comm', bus: 'rs485', conn: 'term2', pins: ['D+', 'D−'], pos: [0, 9, 66], dir: down(0.6), max: 2 },
    ],
  },
  'th-rs485': {
    type: 'th-rs485', name: 'RS-485 temperature & humidity sensor', short: 'T/H sensor', part: 'Modbus RTU · 10–30 V DC', brand: '', category: 'modbus', sim: 'mbth', zone: 'rail2', max: 4,
    size: [54, 100, 38],
    description: 'Temperature and humidity transmitter with an LCD and an RS-485 Modbus RTU interface: V+ / V− (10–30 V DC) and A+ / B−. Registers (function 03 or 04): 0000H temperature, 0001H humidity, 0002H dew point, in 0.1 °C / 0.1 %RH. Factory setting: station 1, 9600 bps 8N1. Tap it to change the temperature and humidity.',
    props: [{ id: 'label', label: 'Label', type: 'text' }, ...MB_PROPS],
    defaults: { label: 'CABINET', station: 1, baud: '9600', format: '8N1', protocol: 'RTU' }, state: { temp: 26.5, rh: 55 },
    ports: () => [
      { id: 'V+', label: 'V+ (24 V)', kind: 'term', pos: [-16, 8, 36], dir: down(0.6), sig: '+24', pitch: 7 },
      { id: 'V-', label: 'V− (0 V)', kind: 'term', pos: [-9, 8, 36], dir: down(0.6), sig: '0V', pitch: 7 },
      { id: 'RS485', label: 'RS-485 (A+ B−)', kind: 'comm', bus: 'rs485', conn: 'term2', pins: ['A+', 'B−'], pos: [9, 8, 36], dir: down(0.6), max: 2 },
    ],
  },
  'em-rs485': {
    type: 'em-rs485', name: 'Energy meter 1-phase (Modbus)', short: 'Energy meter', part: 'DIN rail · 230 V · RS-485', brand: '', category: 'modbus', sim: 'meter', zone: 'rail2', max: 2,
    size: [36, 90, 66],
    description: 'DIN-rail energy meter on the main incomer: L / N for the voltage, a current transformer for the power the panel takes (drives, supplies, PLCs, the oven heater). RS-485 A+ / B−, Modbus RTU (factory setting: station 1, 9600 bps 8N1). Registers (03 or 04): 0000H voltage (0.1 V), 0001H current (0.01 A), 0002H power (W), 0003H power factor (0.01), 0004H frequency (0.01 Hz), 0005H / 0006H energy in Wh (32-bit, low word first).',
    props: [{ id: 'label', label: 'Label', type: 'text' }, ...MB_PROPS],
    defaults: { label: 'MAIN', station: 1, baud: '9600', format: '8N1', protocol: 'RTU' }, state: { wh: 0 },
    ports: () => [
      ...row(['L', 'N'], { x0: -8, x1: 8, y: 82, z: 65, dir: up(0.6), sig: (id) => id }),
      { id: 'RS485', label: 'RS-485 (A+ B−)', kind: 'comm', bus: 'rs485', conn: 'term2', pins: ['A+', 'B−'], pos: [0, 8, 65], dir: down(0.6), max: 2 },
    ],
  },

  // ---------------------------------------------------------------- machines
  'motor': {
    type: 'motor', name: '3-phase induction motor', short: 'Motor 0.75 kW', part: '0.75 kW · 4-pole · 1420 rpm', brand: '', category: 'motor', sim: 'motor', zone: 'motor', max: 3,
    size: [300, 205, 170],
    description: '0.75 kW 4-pole squirrel-cage motor, 220 V Δ, 50 Hz, 1420 rpm. Connect U, V, W to the VFD output. Swap two phases to reverse it.',
    props: [{ id: 'load', label: 'Mechanical load (%)', type: 'number', min: 0, max: 200 }],
    defaults: { load: 40 },
    ports: () => [
      ...row(['U', 'V', 'W', 'PE'], { x0: -22, x1: 22, y: 186, z: 0, dir: [0, 1, 0.25], sig: (id) => (id === 'PE' ? 'PE' : 'mot'), labels: ['U', 'V', 'W', '⏚'] }),
    ],
  },
  'laptop': {
    type: 'laptop', name: 'Laptop · ISPSoft', short: 'Laptop', part: 'Programming PC', brand: '', category: 'pc', sim: 'laptop', zone: 'desk', max: 1,
    size: [320, 210, 220],
    description: 'Programming computer running the ladder editor. Connect its USB cable to the PLC to download programs and monitor online.',
    props: [], defaults: {},
    ports: () => [{ id: 'USB', label: 'USB', kind: 'comm', bus: 'usb', conn: 'usba', pos: [-160, 8, 150], dir: [-1, 0, 0], max: 1 }],
  },
};

function plcDef(type, description) {
  const m = PLC_MODELS[type];
  return {
    type, name: `Delta ${m.short}`, short: m.short, part: m.name, brand: 'Delta', category: 'plc', sim: 'plc', zone: 'rail1', max: 2,
    size: [m.w, PLC_GEO.h, PLC_GEO.d], model: m, description,
    props: [], defaults: {}, state: { run: true },
    ports: () => plcPorts(type),
  };
}

export const CATEGORIES = [
  { id: 'plc', name: 'Delta PLC', icon: 'cpu' },
  { id: 'hmi', name: 'Delta HMI', icon: 'display' },
  { id: 'vfd', name: 'Delta VFD', icon: 'motor' },
  { id: 'power', name: 'Power', icon: 'bolt' },
  { id: 'switchgear', name: 'Contactors, relays & panel parts', icon: 'magnet' },
  { id: 'field', name: 'Field devices', icon: 'button' },
  { id: 'sensor', name: 'Industrial sensors', icon: 'sensor' },
  { id: 'modbus', name: 'Modbus RS-485 devices', icon: 'network' },
  { id: 'motor', name: 'Motors', icon: 'settings' },
  { id: 'pc', name: 'Computer', icon: 'display' },
];

export const getDeviceDef = (type) => DEVICE_DEFS[type] || null;

/** Devices that carry a user label (START, KM1, LS1 …) shown with their name. */
export const hasLabel = (def) => !!def && ['field', 'sensor', 'switchgear', 'modbus'].includes(def.category);

export function deviceProps(dev) {
  const d = DEVICE_DEFS[dev.type];
  return { ...(d ? d.defaults : {}), ...(dev.props || {}) };
}

const portCache = new Map();
export function devicePorts(dev) {
  const d = DEVICE_DEFS[dev.type];
  if (!d) return [];
  const props = deviceProps(dev);
  const key = dev.type + JSON.stringify(props);
  let p = portCache.get(key);
  if (!p) { p = d.ports(props); portCache.set(key, p); }
  return p;
}

export function findPort(dev, portId) { return devicePorts(dev).find((p) => p.id === portId) || null; }

/** Can a cable/wire join these two ports? Returns null when OK or a reason. */
export function compatible(pa, pb) {
  const ca = pa.kind === 'comm', cb = pb.kind === 'comm';
  if (ca !== cb) return 'A communication port can only be joined to another communication port';
  if (ca && pa.bus !== pb.bus) return `${busName(pa.bus)} cannot be connected to ${busName(pb.bus)}`;
  return null;
}

export const busName = (b) => ({ rs232: 'RS-232', rs485: 'RS-485', usb: 'USB' }[b] || b);
