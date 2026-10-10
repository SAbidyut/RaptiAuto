// Device catalogue of the PLC lab: Delta DVP PLCs, Delta DOP HMI, Delta MS300 VFD, Delta power
// supply, MCB, field devices (push buttons, lamps, sensors …), motor and the programming laptop.
// Geometry is in millimetres in a device-local frame: origin at the bottom-centre of the back
// (mounting) face, x → right, y → up, z → front. Port positions are used by the 3D models,
// cable routing and picking; the simulator only uses port ids.

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

const plcInSig = (id) => (id === 'L' ? 'L' : id === 'N' ? 'N' : id === 'PE' ? 'PE' : id === '+24V' ? '+24' : id === '0V' ? '0V' : id === 'S/S' ? 'ss' : /^V\d\+|^AIG/.test(id) ? 'an' : 'in');
const plcOutSig = (id) => (/^C\d/.test(id) ? 'com' : /^VO|^AOG/.test(id) ? 'an' : 'out');

export const PLC_MODELS = {
  'dvp-16es2': { name: 'DVP16ES200R', short: 'DVP-16ES2', inputs: 8, outputs: 8, ai: 0, ao: 0, w: 120, relayGroups: [4, 4], steps: 15872 },
  'dvp-32es2': { name: 'DVP32ES200R', short: 'DVP-32ES2', inputs: 16, outputs: 16, ai: 0, ao: 0, w: 160, relayGroups: [4, 4, 4, 4], steps: 15872 },
  'dvp-20ex2': { name: 'DVP20EX200R', short: 'DVP-20EX2', inputs: 8, outputs: 6, ai: 4, ao: 2, w: 160, relayGroups: [4, 2], steps: 15872 },
};

const oct = (n) => n.toString(8);

function plcPorts(type) {
  const m = PLC_MODELS[type];
  const w = m.w;
  const top = ['L', 'N', 'PE', '+24V', '0V', 'S/S'];
  for (let i = 0; i < m.inputs; i++) top.push('X' + oct(i));
  for (let i = 0; i < m.ai; i++) top.push(`V${i}+`);
  if (m.ai) top.push('AIG');
  const bottom = [];
  let y = 0;
  m.relayGroups.forEach((n, g) => { bottom.push('C' + g); for (let i = 0; i < n; i++) bottom.push('Y' + oct(y++)); });
  for (let i = 0; i < m.ao; i++) bottom.push('VO' + i);
  if (m.ao) bottom.push('AOG');
  const x0 = -w / 2 + 7, x1 = w / 2 - 7;
  const ports = [
    ...row(top, { x0, x1, y: 80, z: 60, dir: up(0.7), sig: plcInSig, labels: top.map((t) => (t === 'PE' ? '⏚' : t)) }),
  ];
  // bottom row leaves room for the COM2 plug at the right end
  const bx1 = x1 - 20;
  ports.push(...row(bottom, { x0, x1: bx1, y: 10, z: 60, dir: down(0.7), sig: plcOutSig }));
  ports.push({ id: 'COM2', label: 'COM2 RS-485', kind: 'comm', bus: 'rs485', conn: 'plug3', pos: [x1 - 6, 10, 62], dir: down(0.7), max: 2 });
  ports.push({ id: 'COM1', label: 'COM1 RS-232', kind: 'comm', bus: 'rs232', conn: 'minidin', pos: [-w / 2 + 17, 33, 82], dir: FRONT, max: 1 });
  ports.push({ id: 'USB', label: 'USB (programming)', kind: 'comm', bus: 'usb', conn: 'usbmini', pos: [-w / 2 + 17, 57, 82], dir: FRONT, max: 1 });
  return ports;
}

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
  'dvp-16es2': plcDef('dvp-16es2', 'Compact PLC, 8 inputs (X0–X7) and 8 relay outputs (Y0–Y7), RS-232 + RS-485 + USB. The most popular Delta starter PLC.'),
  'dvp-32es2': plcDef('dvp-32es2', 'Standard PLC with 16 inputs (X0–X17) and 16 relay outputs (Y0–Y17).'),
  'dvp-20ex2': plcDef('dvp-20ex2', 'PLC with 8 DI / 6 relay DO plus 4 analog inputs (D1110–D1113) and 2 analog outputs (D1116–D1117, 0–2000 = 0–10 V).'),

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
    description: 'Compact AC motor drive, 1.5 kW, 1-phase 230 V in → 3-phase out. Keypad, MI1–MI5 inputs, AVI 0–10 V, relay RA/RB/RC and RS-485 Modbus (RJ45).',
    props: [],
    defaults: {},
    ports: () => [
      ...row(['MI1', 'MI2', 'MI3', 'MI4', 'MI5', 'DCM', '+24V'], { x0: -39, x1: 39, y: 88, z: 136, dir: FRONT, sig: (id) => (id === '+24V' ? '+24' : id === 'DCM' ? '0V' : 'ctl') }),
      ...row(['+10V', 'AVI', 'ACM', 'AFM', 'RA', 'RB', 'RC'], { x0: -39, x1: 39, y: 72, z: 136, dir: FRONT, sig: (id) => (/^R/.test(id) ? 'ctl' : 'an') }),
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
    description: 'PT100 temperature transmitter, 24 V DC, 3-wire: BN (+24 V), BU (0 V), BK (0–10 V signal = range). Wire BK to an analog input (DVP-20EX2 V0+ … with AIG to 0 V). Tap to set the temperature.',
    props: [{ id: 'label', label: 'Label', type: 'text' }, { id: 'min', label: 'Range low (°C)', type: 'number', min: -200, max: 1000 }, { id: 'max', label: 'Range high (°C)', type: 'number', min: -200, max: 1000 }],
    defaults: { label: 'TEMP', min: 0, max: 150, unit: '°C' }, state: { pos: 0.2 },
    ports: () => sockRow(['BN', 'BU', 'BK'], ['+24', '0V', 'OUT'], 'an'),
  },
  'press-tx': {
    type: 'press-tx', name: 'Pressure transmitter', short: 'Pressure transmitter', part: '0–10 bar → 0–10 V', category: 'sensor', sim: 'atx', look: 'press', zone: 'console', max: 4,
    size: [64, 86, 6],
    description: 'Pressure transmitter, 24 V DC, 3-wire: BN (+24 V), BU (0 V), BK (0–10 V signal = range). Wire BK to an analog input (DVP-20EX2 V0+ … with AIG to 0 V). Tap to set the pressure.',
    props: [{ id: 'label', label: 'Label', type: 'text' }, { id: 'min', label: 'Range low (bar)', type: 'number', min: -1, max: 1000 }, { id: 'max', label: 'Range high (bar)', type: 'number', min: -1, max: 1000 }],
    defaults: { label: 'PRESSURE', min: 0, max: 10, unit: 'bar' }, state: { pos: 0.4 },
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
    type, name: `Delta ${m.short}`, short: m.short, part: m.name, brand: 'Delta', category: 'plc', sim: 'plc', zone: 'rail1', max: 1,
    size: [m.w, 90, 82], model: m, description,
    props: [], defaults: {}, state: { run: true },
    ports: () => plcPorts(type),
  };
}

export const CATEGORIES = [
  { id: 'plc', name: 'Delta PLC', icon: 'cpu' },
  { id: 'hmi', name: 'Delta HMI', icon: 'display' },
  { id: 'vfd', name: 'Delta VFD', icon: 'motor' },
  { id: 'power', name: 'Power', icon: 'bolt' },
  { id: 'switchgear', name: 'Contactors & protection', icon: 'magnet' },
  { id: 'field', name: 'Field devices', icon: 'button' },
  { id: 'sensor', name: 'Industrial sensors', icon: 'sensor' },
  { id: 'motor', name: 'Motors', icon: 'settings' },
  { id: 'pc', name: 'Computer', icon: 'display' },
];

export const getDeviceDef = (type) => DEVICE_DEFS[type] || null;

/** Devices that carry a user label (START, KM1, LS1 …) shown with their name. */
export const hasLabel = (def) => !!def && ['field', 'sensor', 'switchgear'].includes(def.category);

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
