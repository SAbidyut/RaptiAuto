// Diagrams of the Step-by-step part: small inline SVG pictures in the style of the rest of the manual.
import { K, T, R, L, P, AR, DOT, BADGE, fig } from '../art.js';

/** Button → input → program → output → lamp / motor. */
export const plcIdea = () => fig(380, 150,
  [['Button / sensor', 'START, limit', 14], ['Input X', 'X0 … X7', 104], ['Program', 'ladder', 194], ['Output Y', 'Y0 … Y7', 284]].map(([a, b, x], i) =>
    R(x, 34, 78, 54, { fill: i === 2 ? '#123a2a' : K.box2, stroke: i === 2 ? K.ok : K.line }) + T(x + 39, 56, a, { size: 10, anchor: 'middle', weight: 700 }) + T(x + 39, 74, b, { size: 9, anchor: 'middle', fill: K.dim }) +
    (i < 3 ? AR(x + 80, 61, x + 101, 61, { stroke: K.acc, m: 'mfb' }) : '')).join('') +
  AR(323, 90, 323, 112, { stroke: K.acc, m: 'mfb' }) + T(323, 130, 'lamp · motor · VFD', { size: 10, anchor: 'middle', fill: K.ok, weight: 700 }) +
  T(190, 20, 'A PLC is a small rugged computer: it reads inputs and drives outputs by its program', { size: 9.5, anchor: 'middle', fill: K.ink }),
  'Press a button and its input X turns on; the program decides; an output Y switches a lamp or a motor.');

/** The scan: read inputs → run the program top to bottom → write outputs, again and again. */
export const scanSteps = () => fig(360, 210,
  `<circle cx="180" cy="108" r="70" fill="none" stroke="${K.box2}" stroke-width="14"/>` +
  P('M180 38 A70 70 0 0 1 240 143', { stroke: K.acc, sw: 3 }) + P('M240 143 A70 70 0 0 1 120 143', { stroke: K.ok, sw: 3 }) + P('M120 143 A70 70 0 0 1 180 38', { stroke: K.warn, sw: 3 }) +
  BADGE(180, 38, '1') + BADGE(240, 143, '2') + BADGE(120, 143, '3') +
  T(258, 70, 'Read inputs', { size: 10.5, fill: K.acc, weight: 700 }) + T(258, 84, 'state of X0 … X7', { size: 9, fill: K.dim }) +
  T(180, 198, 'Run the program: top to bottom, rung 1 → last', { size: 10.5, anchor: 'middle', fill: K.ok, weight: 700 }) +
  T(14, 70, 'Write outputs', { size: 10.5, fill: K.warn, weight: 700 }) + T(14, 84, 'Y0 … Y7 on / off', { size: 9, fill: K.dim }) +
  T(180, 104, 'SCAN', { size: 13, anchor: 'middle', weight: 800 }) + T(180, 120, '≈ 1 ms, again and again', { size: 9.5, anchor: 'middle', fill: K.dim }),
  'The PLC never stops: it reads the inputs, runs the whole program, writes the outputs — and starts again. This loop is the scan.');

/** Digital (on / off) against analog (any value in between). */
export const analogVsDigital = () => fig(380, 168,
  R(14, 20, 170, 120, { fill: K.box }) + R(196, 20, 170, 120, { fill: K.box }) +
  T(99, 38, 'Digital: only ON / OFF', { size: 10.5, anchor: 'middle', weight: 700 }) + T(281, 38, 'Analog: any value in between', { size: 10.5, anchor: 'middle', weight: 700 }) +
  P('M28 120 H64 V64 H112 V120 H140 V64 H172', { stroke: K.ok, sw: 2.4 }) + T(24, 68, '1', { size: 9, fill: K.dim }) + T(24, 124, '0', { size: 9, fill: K.dim }) +
  P('M210 120 C 236 120, 246 60, 272 70 S 318 116, 352 58', { stroke: K.acc, sw: 2.4 }) + T(206, 62, '10 V', { size: 9, fill: K.dim, anchor: 'end' }) + T(206, 124, '0 V', { size: 9, fill: K.dim, anchor: 'end' }) +
  T(99, 158, 'buttons, limit switches → X inputs', { size: 9.5, anchor: 'middle', fill: K.line }) + T(281, 158, 'temperature, pressure, level, pot → AD module', { size: 9.5, anchor: 'middle', fill: K.line }),
  'A digital signal has two states: there or not there. An analog signal has many: any value from 0 to 10 V.');

/** Three scales side by side: volts, raw counts, engineering units. */
export const scaleSteps = () => {
  const x0 = 70, x1 = 330, y = [44, 98, 152];
  const at = (k) => x0 + (x1 - x0) * k;
  const row = (yy, label, a, b, mid, col) => L(x0, yy, x1, yy, { stroke: col, sw: 3 }) + DOT(x0, yy, col) + DOT(x1, yy, col) +
    T(x0, yy - 9, a, { size: 9.5, anchor: 'middle', fill: col, weight: 700 }) + T(x1, yy - 9, b, { size: 9.5, anchor: 'middle', fill: col, weight: 700 }) +
    T(at(0.35), yy - 9, mid, { size: 10, anchor: 'middle', fill: K.ink, weight: 800 }) + T(14, yy + 4, label, { size: 10, fill: K.line, weight: 700 });
  return fig(360, 190,
    row(y[0], 'Signal', '0 V', '10 V', '3.5 V', K.acc) + row(y[1], 'AD value', '0', '32000', '11200', K.warn) + row(y[2], '°C', '0.0', '100.0', '35.0', K.ok) +
    L(at(0.35), y[0] + 4, at(0.35), y[2] - 4, { stroke: K.ink, sw: 1.2, dash: '3 3' }) +
    T(180, 178, 'D10 = D0 ÷ 32   (32000 ÷ 32 = 1000 = 100.0 °C)', { size: 10, anchor: 'middle', fill: K.ink, mono: true }),
    'Scaling: one value three ways — volts, the module\'s number (0–32000) and the real unit (°C). Dividing takes you from one scale to the other.');
};

/** Transmitter → DVP04AD-E2 CH1, module on the right of the PLC, 24 V supply. */
export const adWiring = () => fig(380, 236,
  R(14, 20, 80, 92, { fill: K.box2 }) + T(54, 36, '24 V supply', { size: 10, anchor: 'middle', weight: 700 }) +
  T(84, 62, '+V', { size: 10, anchor: 'end', fill: K.err, weight: 700 }) + DOT(94, 58, K.err) + T(84, 96, '−V', { size: 10, anchor: 'end', fill: K.blue, weight: 700 }) + DOT(94, 92, K.blue) +
  R(170, 20, 82, 100, { fill: '#16181b', stroke: K.line }) + T(211, 64, 'DVP16ES2', { size: 10, anchor: 'middle', weight: 700 }) + T(211, 80, 'PLC', { size: 9, anchor: 'middle', fill: K.dim }) +
  R(254, 20, 112, 100, { fill: '#16181b', stroke: K.acc }) + T(310, 36, 'DVP04AD-E2', { size: 10, anchor: 'middle', weight: 800, fill: K.acc }) + T(310, 50, 'clipped on the right', { size: 8.5, anchor: 'middle', fill: K.dim }) +
  [['24V', 268, K.err], ['24G', 292, K.blue], ['V1+', 322, K.vio], ['VI1−', 350, K.blue]].map(([n, x, c]) => DOT(x, 120, c) + T(x, 112, n, { size: 8.5, anchor: 'middle', fill: c, weight: 700 })).join('') +
  R(96, 166, 120, 50, { fill: K.box2 }) + T(156, 196, 'Temperature transmitter', { size: 9.5, anchor: 'middle', weight: 700 }) + T(156, 209, '0–100 °C → 0–10 V', { size: 8.5, anchor: 'middle', fill: K.dim }) +
  [['BN', 116, K.err], ['BU', 156, K.blue], ['BK', 196, K.vio]].map(([n, x, c]) => DOT(x, 166, c) + T(x, 180, n, { size: 8.5, anchor: 'middle', fill: c, weight: 700 })).join('') +
  P('M94 58 H140 V138 H268 V120', { stroke: K.err }) + P('M140 138 H116 V166', { stroke: K.err }) +
  P('M94 92 H130 V146 H292 V120', { stroke: K.blue }) + P('M156 146 V166', { stroke: K.blue }) +
  P('M196 166 V156 H322 V120', { stroke: K.vio, sw: 2 }) + P('M350 120 V146 H292', { stroke: K.blue, dash: '4 3' }),
  'Module wiring: 24V / 24G from a 24 V source; transmitter BN to +24 V, BU to 0 V, the signal BK to V1+; the channel common VI1− to 0 V.');

/** 4–20 mA: a current loop, I+ bridged to V+. */
export const loop420 = () => fig(380, 196,
  R(20, 30, 110, 96, { fill: K.box2 }) + T(75, 48, 'Pressure transmitter', { size: 10, anchor: 'middle', weight: 700 }) + T(75, 64, '4–20 mA (0–10 bar)', { size: 9, anchor: 'middle', fill: K.dim }) +
  R(250, 30, 110, 96, { fill: '#16181b', stroke: K.acc }) + T(305, 48, 'CH2', { size: 11, anchor: 'middle', weight: 800, fill: K.acc }) +
  [['I2+', 272], ['V2+', 305], ['VI2−', 338]].map(([n, x]) => DOT(x, 126, K.vio) + T(x, 118, n, { size: 8.5, anchor: 'middle', fill: K.vio, weight: 700 })).join('') +
  P('M272 126 V140 H305 V126', { stroke: K.warn, sw: 2.4 }) + T(289, 154, 'jumper', { size: 9, anchor: 'middle', fill: K.warn, weight: 700 }) +
  P('M130 70 H200 V170 H272 V126', { stroke: K.vio, sw: 2 }) + T(165, 64, 'BK', { size: 9, anchor: 'middle', fill: K.vio, weight: 700 }) +
  P('M338 126 V176 H190 V100 H130', { stroke: K.blue, sw: 1.6, dash: '4 3' }) + T(160, 96, '0 V', { size: 9, anchor: 'middle', fill: K.blue }) +
  T(190, 22, 'The current flows round a loop: a long cable does not change the value', { size: 9.5, anchor: 'middle', fill: K.ink }),
  '4–20 mA: I+ and V+ are joined by a short wire (jumper) — then the module measures current. 4 mA = 0 (no pressure), 20 mA = 32000 (full pressure).');

/** One Modbus RTU request from the PLC: station, function, address, data, CRC. */
export const frameSteps = () => {
  const cells = [['01', 'station', K.acc], ['06', 'function', K.warn], ['20 00', 'address 2000H', K.ok], ['00 12', 'data H12', K.vio], ['CRC', 'check', K.dim]];
  let x = 14;
  const parts = cells.map(([v, n, c]) => { const w = v.length > 3 ? 78 : 58; const s = R(x, 44, w, 40, { fill: K.box2, stroke: c }) + T(x + w / 2, 69, v, { size: 12, anchor: 'middle', fill: c, weight: 800, mono: true }) + T(x + w / 2, 102, n, { size: 9, anchor: 'middle', fill: K.line }); x += w + 6; return s; });
  return fig(380, 150, T(190, 28, 'PLC → VFD: "station 1, write H12 into register 2000H"', { size: 10.5, anchor: 'middle', weight: 700 }) + parts.join('') +
    T(190, 132, 'The VFD sends the same frame back = "OK, written"', { size: 9.5, anchor: 'middle', fill: K.ok }),
  'One Modbus RTU frame: to whom (station), what to do (function 06 = write one register), where (2000H), what (H12 = run forward) and a CRC to catch errors.');
};

/** PLC master asks, the drive (slave) answers. */
export const masterSlave = () => fig(380, 170,
  R(14, 40, 120, 70, { fill: K.box2, stroke: K.acc }) + T(74, 64, 'PLC = master', { size: 11, anchor: 'middle', weight: 800, fill: K.acc }) + T(74, 82, 'asks and commands', { size: 9, anchor: 'middle', fill: K.dim }) + T(74, 98, 'COM2 (RS-485)', { size: 9, anchor: 'middle', fill: K.line }) +
  R(246, 40, 120, 70, { fill: K.box2 }) + T(306, 64, 'VFD = slave', { size: 11, anchor: 'middle', weight: 800 }) + T(306, 82, 'only answers', { size: 9, anchor: 'middle', fill: K.dim }) + T(306, 98, 'station 1 (Pr.09-00)', { size: 9, anchor: 'middle', fill: K.line }) +
  AR(136, 62, 244, 62, { stroke: K.acc, m: 'mfb' }) + T(190, 54, 'request (TX)', { size: 9.5, anchor: 'middle', fill: K.acc }) +
  AR(244, 92, 136, 92, { stroke: K.ok, m: 'mfc' }) + T(190, 108, 'reply (RX)', { size: 9.5, anchor: 'middle', fill: K.ok }) +
  T(190, 140, 'Up to 32 slaves on one bus — each with its own station number', { size: 9.5, anchor: 'middle', fill: K.ink }) +
  T(190, 156, 'Same settings on both sides: 9600 bps, 8 bits, Even, 1 stop, RTU', { size: 9.5, anchor: 'middle', fill: K.line }),
  'On Modbus one device talks (the master); the others only answer when they are called (the slaves).');
