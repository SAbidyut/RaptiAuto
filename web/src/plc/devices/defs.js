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

/** DVP04AD-E2: as tall and deep as the PLC, terminal rows like the PLC (CH1 / CH2 on top, CH3 / CH4 below). */
export const AD_GEO = {
  w: 62,
  top: ['24V', '0V', 'FE', 'V1+', 'I1+', 'VI1-', 'V2+', 'I2+', 'VI2-'],
  bottom: ['V3+', 'I3+', 'VI3-', 'V4+', 'I4+', 'VI4-'],
  groups: { top: [[0, 1, 'DC IN'], [3, 5, 'CH1'], [6, 8, 'CH2']], bottom: [[0, 2, 'CH3'], [3, 5, 'CH4']] },
};
export const adTermLabel = (id) => ({ '0V': '24G', FE: '⏚' }[id] || id.replace(/-$/, '−'));
function adPorts() {
  const G = PLC_GEO, m = { w: AD_GEO.w };
  const ports = [];
  for (const [list, y, dir] of [[AD_GEO.top, G.holeTop, up(0.35)], [AD_GEO.bottom, G.holeBot, down(0.35)]]) {
    list.forEach((id, i) => ports.push({ id, label: adTermLabel(id), kind: 'term', pos: [plcTermX(m, list.length, i), y, G.face], dir, sig: id === '24V' ? '+24' : id === '0V' ? '0V' : id === 'FE' ? 'PE' : 'an', pitch: (m.w - 8) / list.length }));
  }
  return ports;
}

/** Old (≤ 2.9) PLC terminal ids → the real terminal names. */
export const PLC_PORT_RENAMES = { 'dvp-20ex2': { AIG: 'VI0-', AOG: 'AG0', C0: 'ZP', C1: 'ZP' } };

const SIG_COLOR = {
  L: '#7c4a1e', N: '#2563eb', PE: 'pe', '+24': '#dc2626', '0V': '#1e3a8a', in: '#f97316', ss: '#dc2626', out: '#e5e7eb', com: '#dc2626',
  an: '#a855f7', mot: '#111827', ctl: '#f97316', ac: '#7c4a1e',
};
/** Motor phase wires follow the R-Y-B convention: phase 1 red, phase 2 yellow, phase 3 blue. */
const PHASE_COLOR = ['#dc2626', '#facc15', '#2563eb'];
export function phaseOf(portId) {
  const m = /^(?:U|U1|U2|L1|T1|U\/T1)$/.test(portId) ? 0 : /^(?:V|V1|V2|L2|T2|V\/T2)$/.test(portId) ? 1 : /^(?:W|W1|W2|L3|T3|W\/T3)$/.test(portId) ? 2 : -1;
  return m;
}
/** Default colour of a wire for a signal; `portId` picks the phase colour for the motor-circuit (3~) terminals. */
export function wireColorFor(sig, portId) {
  if (sig === 'mot' && portId) { const k = phaseOf(portId); if (k >= 0) return PHASE_COLOR[k]; }
  return SIG_COLOR[sig] || '#f97316';
}

// field modules on the operator console: 64 × 86 mm plates with 4 mm banana sockets
const OUTPUT_PROP = { id: 'output', label: 'Output', type: 'select', options: { PNP: 'PNP (switches +24 V)', NPN: 'NPN (switches 0 V)' } };
const sockRow = (ids, labels, sig) => row(ids, { x0: -((ids.length - 1) * 17) / 2, x1: ((ids.length - 1) * 17) / 2, y: 69, z: 6, dir: FRONT, sig, kind: 'sock', labels }); // top of the module = toward the back of the console (the modules are built turned, see three/models.js)

/** Incremental encoder on a motor shaft: 24 V HTL push-pull outputs A, B (90° apart) and Z (once a turn). */
const ENCODER_PROP = { id: 'encoder', label: 'Encoder on the shaft', type: 'select', options: { none: 'None', 100: '100 PPR', 360: '360 PPR', 1000: '1000 PPR' } };
export const encoderPpr = (p) => (p && p.encoder && p.encoder !== 'none' ? +p.encoder || 0 : 0);
/** The encoder's terminal block (E+ E0 A B Z) on top of the encoder, behind the shaft coupling. */
const encoderPorts = (p) => (encoderPpr(p) ? row(['E+', 'E0', 'A', 'B', 'Z'], { x0: -24, x1: 24, y: 136, z: 0, dir: [0, 1, 0.15], sig: (id) => (id === 'E+' ? '+24' : id === 'E0' ? '0V' : 'in'), labels: ['+24', '0V', 'A', 'B', 'Z'] }).map((q) => ({ ...q, pos: [186, q.pos[1], q.pos[0]] })) : []);
const LOAD_PROP = { id: 'load', label: 'Mechanical load (%)', type: 'number', min: 0, max: 200 };

export const DEVICE_DEFS = {
  // ---------------------------------------------------------------- PLC
  'dvp-16es2': plcDef('dvp-16es2', 'DVP16ES200R: 8 inputs X0–X7 (S/S common, sink or source), 8 relay outputs Y0–Y7 in two groups (C0: Y0–Y3, C1: Y4–Y7), 100–240 V AC supply with a 24 V DC 0.5 A output (+24V / 24G), COM1 RS-232, COM2 and COM3 RS-485. The most popular Delta starter PLC.'),
  'dvp-32es2': plcDef('dvp-32es2', 'DVP32ES200R: 16 inputs X0–X17, 16 relay outputs Y0–Y17 in four groups of four (C0 … C3), 24 V DC output +24V / 24G, COM1 RS-232, COM2 and COM3 RS-485.'),
  'dvp-20ex2': plcDef('dvp-20ex2', 'DVP20EX200T: 8 inputs X0–X7, 6 NPN transistor outputs Y0–Y5 (power UP = +24 V, ZP = 0 V; an ON output pulls its load to ZP), 4 analog inputs V0+ / I0+ / VI0− … (±10 V, or ±20 mA with In+ bridged to Vn+; D1110–D1113, ±2000) and 2 analog outputs VO0 / IO0 / AG (0–10 V or 0–20 mA; D1116–D1117, 0–2000).'),

  // ---------------------------------------------------------------- right-side expansion (clips onto the PLC)
  'dvp04ad-e2': {
    type: 'dvp04ad-e2', name: 'Delta DVP04AD-E2 analog input module', short: 'DVP04AD-E2', part: '4 AI · ±10 V · ±20 mA · 4–20 mA', brand: 'Delta', category: 'ext', sim: 'ad', zone: 'rail1', max: 2,
    size: [AD_GEO.w, PLC_GEO.h, PLC_GEO.d],
    description: 'Analog input module for the DVP-ES2 / EX2: it clips onto the right side of the PLC. 24 V DC on 24V / 0V. Four channels CH1–CH4, each with V+ (voltage), I+ (current: bridge I+ to V+) and VI− (the channel common). The PLC reads it with FROM: FROM K0 K12 D0 K4 → present values of CH1–CH4 in D0–D3 (CR#12–15); CR#6–9 are the averaged values, CR#1 the input mode (one hex digit per channel: 0 = ±10 V, 1 = 0–10 V, 2 = ±20 mA, 3 = 0–20 mA, 4 = 4–20 mA). Full scale is ±32000 (0–10 V → 0–32000, 4–20 mA → 0–32000).',
    props: [], defaults: {},
    ports: () => adPorts(),
  },

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

  'mains3': {
    type: 'mains3', name: 'Main supply 3-phase 400 V + MCCB 4P', short: 'Supply 3~ 400 V', part: 'MCCB 4P C16 · 400 / 230 V 50 Hz', brand: '', category: 'power', sim: 'mains3', zone: 'rail1', max: 1,
    size: [92, 90, 72],
    description: 'Three-phase mains 400 V / 230 V 50 Hz (L1 L2 L3 N PE) through a 4-pole C16 breaker. Between two phases there are 400 V, between a phase and N 230 V. L1 → L2 → L3 is the phase sequence: a motor wired U–V–W to L1–L2–L3 turns clockwise, swap two phases to reverse it. Feeds contactors, overload relays and the 400 V motors; a 230 V device (power supply, PLC, contactor coil) goes between one phase and N. Trips on a short circuit between two phases or a phase and N.',
    props: [], defaults: {}, state: { on: true },
    ports: () => [
      ...row(['L1', 'L2', 'L3', 'N'], { x0: -36, x1: 18, y: 10, z: 64, dir: down(0.6), sig: (id) => (id === 'N' ? 'N' : 'mot') }),
      { id: 'PE', label: '⏚ PE', kind: 'term', pos: [36, 60, 50], dir: FRONT, sig: 'PE', pitch: 10 },
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
    type: 'olr', name: 'Thermal overload relay', short: 'Overload relay', part: '0.6–6 A · 1NC + 1NO · class 10', brand: '', category: 'switchgear', sim: 'olr', zone: 'rail2', max: 4,
    size: [45, 66, 86],
    description: 'Thermal overload relay that goes under the contactor: the motor current passes 1/L1–2/T1, 3/L2–4/T2, 5/L3–6/T3 and heats three bimetals. Set the dial to the motor\'s rated current: 1.2 × the setting trips it after a few minutes, 6 × (a stalled motor, a lost phase) in a few seconds (class 10). On a trip the NC 95–96 opens (wire it in series with the contactor coil or to a PLC input) and the NO 97–98 closes. In a star-delta starter it carries the winding current: set it to 0.58 × the motor current. Tap the button to test-trip it, tap again to reset (once the bimetals have cooled).',
    props: [{ id: 'label', label: 'Label', type: 'text' }, { id: 'setting', label: 'Current setting (A)', type: 'number', min: 0.5, max: 10 }], defaults: { label: 'F1', setting: 3.6 }, state: { tripped: false },
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
    type: 'dtb4848', name: 'Delta DTB4848 PID temperature controller', short: 'DTB4848 PID', part: 'DTB4848VR · PID · RS-485', brand: 'Delta', category: 'modbus', sim: 'tc', zone: 'rail2', max: 3,
    size: [56, 124, 76],
    description: '48 × 48 mm PID temperature controller (100–240 V AC on L / N) with a thermocouple in a small oven and the 500 W heater on OUT1. RS-485 on D+ / D−, Modbus ASCII or RTU (factory setting: station 1, 9600 bps 7E1 ASCII). Registers: 1000H PV, 1001H SV, 1002H / 1003H range, 1005H control (0 PID, 1 ON/OFF, 2 manual), 1009H PB, 100AH Ti, 100BH Td (the PID settings), 1012H output 1 %, bit 0813H auto-tuning, bit 0814H RUN / STOP — temperatures in 0.1 °C. Tap ▲ / ▼ to change SV, tap the display for RUN / STOP.',
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
    description: '0.75 kW 4-pole squirrel-cage motor, 220 V Δ, 50 Hz, 1420 rpm. Connect U, V, W to the VFD output. Swap two phases to reverse it. With an encoder on the shaft its A / B / Z pulses go to the PLC high-speed counter inputs (X0, X1).',
    props: [LOAD_PROP, ENCODER_PROP],
    defaults: { load: 40, encoder: 'none' },
    ports: (p) => [
      ...row(['U', 'V', 'W', 'PE'], { x0: -22, x1: 22, y: 186, z: 0, dir: [0, 1, 0.25], sig: (id) => (id === 'PE' ? 'PE' : 'mot'), labels: ['U', 'V', 'W', '⏚'] }),
      ...encoderPorts(p),
    ],
  },
  'motor6': {
    type: 'motor6', name: '3-phase motor, 6 terminals (Y / Δ)', short: 'Motor 1.5 kW Y/Δ', part: '1.5 kW · 400 V Δ · 3.4 A · 1440 rpm', brand: '', category: 'motor', sim: 'motor6', zone: 'motor', max: 3,
    size: [300, 205, 170],
    description: '1.5 kW 4-pole motor for the 400 V mains, connected in delta. All six winding ends are in the terminal box: U1–U2, V1–V2, W1–W2 (back row W2 U2 V2, front row U1 V1 W1). Fit the Δ links (U1–W2, V1–U2, W1–V2) for a direct-on-line start from a contactor, or take the links out for a star-delta starter: KM1 feeds U1 V1 W1, KM2 (delta) joins W2 U2 V2 to L1 L2 L3, KM3 (star) joins W2 U2 V2 together. Every winding is made for 400 V: in star it gets only 230 V — a third of the starting current and of the torque. A lost phase makes it hum without starting.',
    props: [{ id: 'links', label: 'Links in the terminal box', type: 'select', options: { delta: 'Δ links (direct-on-line)', star: 'Y links (star)', none: 'No links (star-delta starter)' } }, LOAD_PROP, ENCODER_PROP],
    defaults: { links: 'delta', load: 30, encoder: 'none' },
    ports: (p) => [
      ...row(['W2', 'U2', 'V2'], { x0: -24, x1: 24, y: 186, z: -13, dir: [0, 1, -0.2], sig: 'mot' }),
      ...row(['U1', 'V1', 'W1'], { x0: -24, x1: 24, y: 186, z: 13, dir: [0, 1, 0.25], sig: 'mot' }),
      { id: 'PE', label: '⏚', kind: 'term', pos: [34, 186, 0], dir: [0, 1, 0.25], sig: 'PE', pitch: 12 },
      ...encoderPorts(p),
    ],
  },

  // ---------------------------------------------------------------- machines (process models on the bench)
  'conveyor': {
    type: 'conveyor', name: 'Belt conveyor with sensors + pusher', short: 'Conveyor', part: '700 mm belt · 0.25 kW gear motor · 4 sensors · pusher', brand: '', category: 'machine', sim: 'conveyor', zone: 'machine', max: 1,
    size: [890, 290, 512], box: [[-410, 0, -262], [480, 290, 250]],
    description: 'A 700 mm belt on a Ø32 mm rubber-lagged head drum and a tail drum with screw take-ups, driven by a 0.25 kW gear motor on the head shaft (i ≈ 9.2: 150 rpm, 250 mm/s at 50 Hz; U V W: 230 V Δ for the MS300 drive, or 400 V Y for a contactor on the 3-phase mains). Boxes come from the feeder at the left — tap it, or set an automatic feed — metal (grey) and plastic (blue) mixed. Sensors (PNP, 24 V from +24 / 0V): S1 photo-eye at the entry, S2 inductive above the belt (metal only), S3 photo-eye at the pusher, S4 photo-eye at the end. Y1 (24 V coil to 0V) fires the pneumatic pusher: a box in front of it is pushed into the reject chute. Boxes that reach the end drop into the bin. With an encoder on the head pulley A / B give 100 pulses per 100 mm of belt.',
    props: [
      { id: 'label', label: 'Label', type: 'text' },
      { id: 'conn', label: 'Gear motor connection', type: 'select', options: { D230: 'Δ 230 V (MS300 drive)', Y400: 'Y 400 V (3-phase mains)' } },
      { id: 'feed', label: 'Box feeder', type: 'select', options: { manual: 'By hand (tap the feeder)', slow: 'Automatic · every 4 s', fast: 'Automatic · every 2 s' } },
      { id: 'mix', label: 'Boxes', type: 'select', options: { mixed: 'Metal + plastic', metal: 'Metal only', plastic: 'Plastic only' } },
      LOAD_PROP,
      { id: 'encoder', label: 'Encoder on the head pulley', type: 'select', options: { none: 'None', 100: '100 PPR (1 pulse / mm)' } },
    ],
    defaults: { label: 'CONVEYOR', conn: 'D230', feed: 'manual', mix: 'mixed', load: 30, encoder: 'none' }, state: { boxes: [], done: 0, rejected: 0, fed: 0 },
    ports: (p) => [
      ...row(['U', 'V', 'W', 'PE', '+24', '0V'], { x0: -355, x1: -225, y: 176, z: -140, dir: [0, 1, -0.3], sig: (id) => (id === 'PE' ? 'PE' : id === '+24' ? '+24' : id === '0V' ? '0V' : 'mot'), labels: ['U', 'V', 'W', '⏚', '+24', '0V'] }),
      ...row(['S1', 'S2', 'S3', 'S4', 'Y1', ...(encoderPpr(p) ? ['A', 'B'] : [])], { x0: -355, x1: -355 + 26 * (encoderPpr(p) ? 6 : 4), y: 176, z: -116, dir: [0, 1, 0.3], sig: (id) => (id === 'Y1' ? 'out' : 'in') }),
    ],
  },
  'tank': {
    type: 'tank', name: 'Water tank: pump, drain valve, level sensors', short: 'Level tank', part: '10 L tank · 24 V pump · 24 V valve · 2 floats · 0–10 V level', brand: '', category: 'machine', sim: 'tank', zone: 'machine', max: 1,
    size: [470, 660, 300], box: [[-240, 0, -150], [230, 660, 150]],
    description: 'A clear process tank (360 mm, about 10.8 L) over a sump. The 24 V DC pump (P+ / P−, about 12 L/min) fills it; SPD (0–10 V against P−) sets its speed — leave it open for full speed. The drain valve (V+ / V−, 24 V, normally closed) empties it back into the sump; the hand valve at the bottom is the consumer (tap the tank to open it). Floats (dry contacts from FC): LL closes above the low mark (60 mm), LH above the high mark (300 mm). The level transmitter on top (+24 / 0V, LT) gives 0–10 V for 0–360 mm. Above 350 mm the tank overflows.',
    props: [{ id: 'label', label: 'Label', type: 'text' }],
    defaults: { label: 'TANK' }, state: { level: 90, demand: 0 },
    ports: () => [
      ...row(['P+', 'P-', 'SPD', 'V+', 'V-', 'FC'], { x0: -228, x1: -153, y: 150, z: -15, dir: [0, 1, -0.3], sig: (id) => (id === 'P+' || id === 'V+' ? 'out' : id === 'SPD' ? 'an' : id === 'FC' ? 'in' : '0V'), labels: ['P+', 'P−', 'SPD', 'V+', 'V−', 'FC'] }),
      ...row(['LL', 'LH', '+24', '0V', 'LT'], { x0: -228, x1: -168, y: 150, z: 15, dir: [0, 1, 0.3], sig: (id) => (id === '+24' ? '+24' : id === '0V' ? '0V' : id === 'LT' ? 'an' : 'in') }),
    ],
  },
  'cylinder': {
    type: 'cylinder', name: 'Pneumatic cylinder + 5/2 valve', short: 'Cylinder', part: 'Ø32 × 100 mm double-acting · 5/2 valve 24 V · 2 reed sensors', brand: '', category: 'machine', sim: 'cyl', zone: 'machine', max: 3,
    size: [420, 150, 200], box: [[-210, 0, -100], [330, 150, 100]],
    description: 'A double-acting cylinder (Ø32, 100 mm stroke) with its 5/2 solenoid valve and two reed sensors on the barrel: B1 = retracted (−), B2 = extended (+), PNP 24 V from +24 / 0V. Single-solenoid valve: Y1 ON extends, Y1 OFF lets the spring retract it. Double-solenoid valve: a pulse on Y1 extends, a pulse on Y2 retracts — the valve remembers the last one. Coils: 24 V DC from Y1 / Y2 to 0V. Name the cylinders A, B … for sequences like A+ B+ B− A−.',
    props: [
      { id: 'label', label: 'Label', type: 'text' },
      { id: 'valve', label: 'Valve', type: 'select', options: { single: '5/2 single solenoid (spring return)', double: '5/2 double solenoid (memory)' } },
      { id: 'speed', label: 'Speed (flow control)', type: 'select', options: { slow: 'Slow · 1.5 s', normal: 'Normal · 0.8 s', fast: 'Fast · 0.4 s' } },
    ],
    defaults: { label: 'A', valve: 'single', speed: 'normal' }, state: { pos: 0 },
    ports: (p) => row(['+24', '0V', 'B1', 'B2', 'Y1', ...(p.valve === 'double' ? ['Y2'] : [])], { x0: -190, x1: -190 + 24 * (p.valve === 'double' ? 5 : 4), y: 46, z: -78, dir: [0, 1, -0.2], sig: (id) => (id === '+24' ? '+24' : id === '0V' ? '0V' : /^Y/.test(id) ? 'out' : 'in'), labels: ['+24', '0V', 'B1 −', 'B2 +', 'Y1', 'Y2'] }),
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
  { id: 'ext', name: 'PLC expansion modules', icon: 'cpu' },
  { id: 'hmi', name: 'Delta HMI', icon: 'display' },
  { id: 'vfd', name: 'Delta VFD', icon: 'motor' },
  { id: 'power', name: 'Power', icon: 'bolt' },
  { id: 'switchgear', name: 'Contactors, relays & panel parts', icon: 'magnet' },
  { id: 'field', name: 'Field devices', icon: 'button' },
  { id: 'sensor', name: 'Industrial sensors', icon: 'sensor' },
  { id: 'modbus', name: 'Modbus RS-485 devices', icon: 'network' },
  { id: 'motor', name: 'Motors', icon: 'settings' },
  { id: 'machine', name: 'Machines & process models', icon: 'factory' },
  { id: 'pc', name: 'Computer', icon: 'display' },
];

/** Devices that carry a user label (START, KM1, LS1 …) shown with their name. */
export const hasLabel = (def) => !!def && ['field', 'sensor', 'switchgear', 'modbus', 'machine'].includes(def.category);

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
