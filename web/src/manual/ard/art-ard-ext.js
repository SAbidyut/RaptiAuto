// Diagrams of the last three chapters of the Arduino part of the manual (A6 Serial · sensors · displays,
// A7 IoT · Wi-Fi · master–slave, A8 boards · pins · reference). Same look as art-ard.js: small inline SVGs in the app's
// dark colours; parts are drawn by the app's own component library. Nothing here touches the DOM.
import * as A from './art-ard.js';
import { fig, K, T, R, L, P, AR, DOT, BADGE } from '../art.js';
import { icon } from '../../ui/icons.js';
import { getDef, allDefs } from '../../components/index.js';
import { SHARED_DEFS } from '../../components/draw.js';
import { NETWORKS } from '../../net/network.js';

const { bench, partIn, partSvg, mkPart, pinXY, boxOf, ledMod, WC } = A;
const f1 = (n) => +Number(n).toFixed(2);
const esc = A.esc;
const SHARED = `<defs>${SHARED_DEFS}</defs>`;
const MONO = 'JetBrains Mono, ui-monospace, monospace';
const CANVAS = '#0a1124', BAR = '#0b1226', PHONE = '#070b16', LINE2 = 'rgba(148,163,184,.22)';
const INK2 = '#08101f';

const UIDEFS = `<defs><linearGradient id="extBrand" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset=".55" stop-color="#3b82f6"/><stop offset="1" stop-color="#8b5cf6"/></linearGradient></defs>`;
const iconBody = (name) => icon(name, 24).replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
/** An icon of the app at a place. */
const ico = (name, x, y, size = 16, color = '#cbd5e1') => `<g transform="translate(${f1(x)} ${f1(y)}) scale(${f1(size / 24)})" style="color:${color}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconBody(name)}</g>`;
const mono = (x, y, s, o = {}) => T(x, y, s, { mono: true, ...o });
/** A small rounded label centred at (x, y-baseline). */
const chip = (x, y, text, { c = K.acc, fill = 'rgba(15,23,43,.92)', size = 9, w = 0, h = 15 } = {}) => {
  const ww = w || text.length * size * 0.58 + 12;
  return R(x - ww / 2, y - h + 3, ww, h, { fill, stroke: c, rx: h / 2, sw: 1 }) + T(x, y - 1.5, text, { size, anchor: 'middle', fill: c, weight: 700 });
};
const card = (x, y, w, h, c = K.line) => R(x, y, w, h, { fill: 'rgba(15,23,43,.9)', stroke: c, rx: 12 });
/** Phone-like frame. */
const phoneBox = (x, y, w, h, rx = 16) => R(x, y, w, h, { fill: PHONE, stroke: K.line, rx, sw: 1.3 });
const navBar = (x, y, w, active, iot = true) => {
  const names = [['circuit', 'Circuit'], ['code', 'Code'], ['terminal', 'Serial'], ['globe', 'IoT']].slice(0, iot ? 4 : 3);
  const cw = w / names.length;
  return R(x, y, w, 46, { fill: BAR, stroke: 'none', rx: 18 }) + names.map(([n, l], i) => {
    const on = n === active;
    return (on ? `<rect x="${f1(x + i * cw + cw / 2 - 11)}" y="${y + 2}" width="22" height="2.4" rx="1.2" fill="url(#extBrand)"/>` : '') + ico(n, x + i * cw + cw / 2 - 8, y + 9, 16, on ? K.acc : '#5d6c8c') + T(x + i * cw + cw / 2, y + 36, l, { size: 8.5, anchor: 'middle', fill: on ? '#e8eef9' : '#5d6c8c', weight: 600 });
  }).join('');
};
/** A rounded-rect "button" with centred label. */
const btn = (x, y, w, h, label, { fill = K.box2, stroke = 'none', ink = K.ink, size = 9, weight = 700, rx } = {}) => R(x, y, w, h, { fill, stroke, rx: rx ?? h / 2 }) + T(x + w / 2, y + h / 2 + size * 0.36, label, { size, anchor: 'middle', fill: ink, weight });
/** Byte chips: [{t, c}] in a row starting at x. */
const bytes = (x, y, list, { w = 34, h = 26, gap = 4, size = 10 } = {}) => list.map((b, i) => {
  const c = b.c || K.line;
  return R(x + i * (w + gap), y, w, h, { fill: b.fill || 'rgba(15,23,43,.95)', stroke: c, rx: 6, sw: 1.2 }) + T(x + i * (w + gap) + w / 2, y + h / 2 + size * 0.36, b.t, { size, anchor: 'middle', fill: b.ink || c, weight: 800, mono: true });
}).join('');
/** An arrow with a label above its middle. */
const lab = (x1, y1, x2, y2, text, { c = K.line, m = 'mfa', dy = -5, anchor = 'middle', size = 8.5, fill = K.line } = {}) => AR(x1, y1, x2, y2, { stroke: c, m }) + T((x1 + x2) / 2, (y1 + y2) / 2 + dy, text, { size, anchor, fill });
/** One part, drawn to fit (x, y, w, h). */
const part = (type, x, y, w, h, props = {}, rot = 0, mod) => partIn(type, x, y, w, h, props, rot, mod);
/** A part drawn to fit a box; returns the svg and a function that maps a pin id to the picture's coordinates. */
function partFit(type, x, y, w, h, props = {}, rot = 0) {
  const p = mkPart(type, 0, 0, props, rot);
  const b = boxOf(p);
  const k = Math.min(w / (b[2] - b[0]), h / (b[3] - b[1]));
  const tx = x + (w - (b[2] - b[0]) * k) / 2 - b[0] * k, ty = y + (h - (b[3] - b[1]) * k) / 2 - b[1] * k;
  return {
    svg: `<g transform="translate(${f1(tx)} ${f1(ty)}) scale(${f1(k * 1000) / 1000})">${partSvg(p)}</g>`,
    at: (id) => { const [px, py] = pinXY(p, id); return [tx + px * k, ty + py * k]; },
    k, box: [tx + b[0] * k, ty + b[1] * k, tx + b[2] * k, ty + b[3] * k],
  };
}
const regOf = (type) => getDef(type);

// ============================================================================================ A6 · Serial
export const serialHero = () => {
  const X = 10, Y = 6, W = 360, H = 292;
  let s = UIDEFS + phoneBox(X, Y, W, H, 22);
  // toolbar
  s += R(X + 10, Y + 10, 138, 30, { fill: '#0d1528', stroke: LINE2, rx: 15 }) + R(X + 13, Y + 13, 70, 24, { fill: 'rgba(34,211,238,.16)', stroke: 'none', rx: 12 }) +
    ico('terminal', X + 20, Y + 18, 14, K.acc) + T(X + 38, Y + 29.5, 'Monitor', { size: 9.5, fill: K.acc, weight: 700 }) + ico('chart', X + 90, Y + 18, 14, '#7f8db0') + T(X + 108, Y + 29.5, 'Plotter', { size: 9.5, fill: '#7f8db0', weight: 700 });
  s += R(X + 252, Y + 12, 28, 26, { fill: 'rgba(34,211,238,.16)', stroke: K.acc, rx: 8, sw: 1 }) + ico('arrowDown', X + 257, Y + 17, 16, K.acc);
  s += R(X + 286, Y + 12, 28, 26, { fill: 'rgba(34,211,238,.16)', stroke: K.acc, rx: 8, sw: 1 }) + ico('clock', X + 291, Y + 17, 16, K.acc);
  s += R(X + 320, Y + 12, 28, 26, { fill: '#0d1528', stroke: LINE2, rx: 8 }) + ico('eraser', X + 325, Y + 17, 16, '#cbd5e1');
  // output
  s += R(X + 10, Y + 48, W - 20, 150, { fill: INK2, stroke: LINE2, rx: 10 });
  const rows = [['12:04:31.250', 'DHT22 weather monitor'], ['12:04:33.252', 'Temperature: 24.0 C  Hum: 55.0 %'], ['12:04:35.254', 'Temperature: 24.0 C  Hum: 55.0 %'], ['12:04:37.256', 'Temperature: 27.5 C  Hum: 60.0 %'], ['12:04:39.258', 'Temperature: 27.5 C  Hum: 60.0 %'], ['12:04:41.260', 'Temperature: 31.0 C  Hum: 62.5 %'], ['12:04:43.262', 'Temperature: 31.0 C  Hum: 62.5 %']];
  rows.forEach(([t, m], i) => { s += `<text x="${X + 18}" y="${Y + 69 + i * 18}" font-size="8.6" font-family="${MONO}" xml:space="preserve" style="white-space:pre"><tspan fill="#5d7090">${t} →</tspan> <tspan fill="#a3e635">${esc(m)}</tspan></text>`; });
  // input row
  s += R(X + 10, Y + 206, 196, 30, { fill: '#0d1528', stroke: LINE2, rx: 10 }) + T(X + 20, Y + 225, 'Send to Arduino…', { size: 9.5, fill: K.dim });
  s += R(X + 212, Y + 206, 88, 30, { fill: '#0d1528', stroke: LINE2, rx: 10 }) + T(X + 222, Y + 225, 'Newline', { size: 9.5, fill: K.ink, weight: 600 }) + ico('chevronDown', X + 278, Y + 213, 14, K.dim);
  s += R(X + 306, Y + 206, 44, 30, { fill: 'url(#extBrand)', stroke: 'none', rx: 10 }) + ico('send', X + 318, Y + 213, 16, '#04121a');
  s += navBar(X + 6, Y + H - 52, W - 12, 'terminal', true);
  // badges
  s += BADGE(X + 18, Y + 8, 1) + BADGE(X + 266, Y + 8, 2) + BADGE(X + 300, Y + 8, 3) + BADGE(X + 334, Y + 8, 4) + BADGE(X + 30, Y + 203, 5) + BADGE(X + 226, Y + 203, 6) + BADGE(X + 340, Y + 203, 7) + BADGE(X + 330, Y + 66, 8);
  return fig(380, 304, s, 'The Serial tab. 1 Monitor / Plotter · 2 auto-scroll · 3 timestamps · 4 clear · 5 the text you send · 6 the line ending · 7 Send · 8 what the sketch prints.');
};

export const serialFlow = () => {
  let s = '';
  // sketch box
  s += card(8, 8, 112, 168, K.blue) + T(64, 26, 'Your sketch', { size: 11, anchor: 'middle', weight: 800, fill: K.blue });
  s += R(18, 36, 92, 50, { fill: INK2, stroke: K.ok, rx: 8 }) + mono(64, 56, 'Serial.print', { size: 8.5, anchor: 'middle', fill: '#c3e88d' }) + mono(64, 68, 'Serial.println', { size: 8.5, anchor: 'middle', fill: '#c3e88d' }) + mono(64, 80, '(21.5)', { size: 8.5, anchor: 'middle', fill: '#f78c6c' });
  s += R(18, 108, 92, 56, { fill: INK2, stroke: K.acc, rx: 8 }) + mono(64, 128, 'Serial.available', { size: 8, anchor: 'middle', fill: '#e6edf7' }) + mono(64, 140, 'Serial.read', { size: 8.5, anchor: 'middle', fill: '#e6edf7' }) + mono(64, 152, 'parseInt …', { size: 8.5, anchor: 'middle', fill: '#e6edf7' });
  // buffers
  s += R(138, 40, 98, 40, { fill: K.box, stroke: K.ok, rx: 8 }) + T(187, 56, 'send buffer', { size: 9.5, anchor: 'middle', weight: 700, fill: K.ok }) + T(187, 70, '64 characters', { size: 8.5, anchor: 'middle', fill: K.line });
  s += R(138, 112, 98, 40, { fill: K.box, stroke: K.acc, rx: 8 }) + T(187, 128, 'receive buffer', { size: 9.5, anchor: 'middle', weight: 700, fill: K.acc }) + T(187, 142, '64 (AVR) · 256 (others)', { size: 8, anchor: 'middle', fill: K.line });
  // monitor
  s += card(254, 8, 98, 168, K.warn) + T(303, 26, 'Serial tab', { size: 11, anchor: 'middle', weight: 800, fill: K.warn });
  s += R(262, 36, 82, 50, { fill: INK2, stroke: LINE2, rx: 8 }) + mono(268, 52, '21.5', { size: 9, fill: '#a3e635' }) + mono(268, 64, '21.6', { size: 9, fill: '#a3e635' }) + mono(268, 76, '21.6', { size: 9, fill: '#a3e635' });
  s += R(262, 108, 82, 56, { fill: INK2, stroke: LINE2, rx: 8 }) + T(268, 124, 'Send to…', { size: 8, fill: K.dim }) + R(268, 132, 52, 14, { fill: '#0d1528', stroke: LINE2, rx: 5 }) + mono(274, 142, '42', { size: 8.5, fill: K.ink }) + R(324, 132, 14, 14, { fill: 'url(#extBrand)', stroke: 'none', rx: 5 }) + T(303, 160, '+ line ending', { size: 8, anchor: 'middle', fill: K.line });
  s += AR(111, 61, 137, 61, { stroke: K.ok, m: 'mfc' }) + AR(237, 61, 261, 61, { stroke: K.ok, m: 'mfc' });
  s += AR(261, 132, 237, 132, { stroke: K.acc, m: 'mfb' }) + AR(137, 132, 111, 132, { stroke: K.acc, m: 'mfb' });
  s += T(180, 24, 'out: text for you', { size: 9, anchor: 'middle', fill: K.ok, weight: 700 }) + T(180, 100, 'in: what you type', { size: 9, anchor: 'middle', fill: K.acc, weight: 700 });
  s += T(180, 196, 'The line is as slow as the baud rate: at 9600 about 960 characters a second.', { size: 9, anchor: 'middle', fill: K.line });
  return fig(360, 206, s, 'Two one-way streets. Text printed by the sketch waits in the send buffer and shows in the Monitor; what you send waits in the receive buffer until the sketch reads it.');
};

export const lineEndings = () => {
  const rows = [['Newline', [{ t: '4' }, { t: '2' }, { t: 'LF', c: K.warn }], 'the usual choice · \\n'], ['No ending', [{ t: '4' }, { t: '2' }], 'just the characters'], ['CR', [{ t: '4' }, { t: '2' }, { t: 'CR', c: K.vio }], 'carriage return · \\r'], ['NL & CR', [{ t: '4' }, { t: '2' }, { t: 'CR', c: K.vio }, { t: 'LF', c: K.warn }], 'both · \\r\\n']];
  let s = T(10, 14, 'You type  42  and tap Send:', { size: 10, weight: 700, fill: K.dim });
  rows.forEach(([name, list, note], i) => {
    const y = 26 + i * 40;
    s += R(8, y, 344, 34, { fill: 'rgba(15,23,43,.9)', stroke: LINE2, rx: 10 }) + T(18, y + 21, name, { size: 11, weight: 800 }) + bytes(100, y + 4, list.map((b) => ({ ...b, c: b.c || K.ok })), { w: 32, h: 26 }) + T(344, y + 21, note, { size: 8.5, anchor: 'end', fill: K.line });
  });
  s += T(180, 196, 'readStringUntil(\'\\n\') waits for the LF — keep Newline.', { size: 9, anchor: 'middle', fill: K.warn, weight: 600 });
  return fig(360, 206, s, 'The line-ending menu next to the send box decides which extra characters are added after your text.');
};

export const plotterShot = () => {
  const X = 10, Y = 6, W = 360, H = 232;
  let s = UIDEFS + phoneBox(X, Y, W, H, 18);
  s += R(X + 10, Y + 10, 138, 30, { fill: '#0d1528', stroke: LINE2, rx: 15 }) + ico('terminal', X + 20, Y + 18, 14, '#7f8db0') + T(X + 38, Y + 29.5, 'Monitor', { size: 9.5, fill: '#7f8db0', weight: 700 }) + R(X + 80, Y + 13, 65, 24, { fill: 'rgba(34,211,238,.16)', stroke: 'none', rx: 12 }) + ico('chart', X + 86, Y + 18, 14, K.acc) + T(X + 104, Y + 29.5, 'Plotter', { size: 9.5, fill: K.acc, weight: 700 });
  const px0 = X + 52, px1 = X + W - 14, py0 = Y + 56, py1 = Y + 176;
  s += R(X + 10, Y + 48, W - 20, 134, { fill: INK2, stroke: LINE2, rx: 10 });
  for (let k = 0; k <= 4; k++) { const y = py0 + ((py1 - py0) * k) / 4; s += L(px0, y, px1, y, { stroke: 'rgba(148,163,184,.14)', sw: 1 }) + T(px0 - 6, y + 3.5, String([600, 450, 300, 150, 0][k]), { size: 8, anchor: 'end', fill: '#6b7a99' }); }
  const pts = (f) => Array.from({ length: 60 }, (_, i) => { const x = px0 + ((px1 - px0) * i) / 59; return [x, py0 + (py1 - py0) * (1 - f(i) / 600)]; });
  const line = (arr, c) => P('M' + arr.map(([x, y]) => `${f1(x)} ${f1(y)}`).join(' L'), { stroke: c, sw: 2 });
  s += line(pts((i) => 320 + 190 * Math.sin(i / 7) * Math.exp(-i / 90) + 60 * Math.sin(i / 2.1)), '#22d3ee') + line(pts((i) => 170 + 80 * Math.sin(i / 9 + 1)), '#f97316');
  s += chip(X + 80, Y + 211, 'temp: 31.4', { c: '#22d3ee', size: 9 }) + chip(X + 172, Y + 211, 'light: 296', { c: '#f97316', size: 9 });
  s += T(X + W - 12, Y + 214, 'one line = one point', { size: 8, anchor: 'end', fill: K.dim });
  return fig(380, 248, s, 'The Plotter draws every number the sketch prints. Name a value with a label (temp:31.4) and it gets its own coloured line and legend.');
};

export const uartFrame = () => {
  const x0 = 52, bw = 26, yH = 36, yL = 80;
  const bits = [1, 0, 0, 0, 0, 0, 1, 0];                    // 'A' = 0x41 = 01000001, sent LSB first
  let d = `M${x0 - 36} ${yH} H${x0}`, lvl = yH, x = x0;
  const go = (b) => { const y = b ? yH : yL; if (y !== lvl) d += ` V${y}`; d += ` H${x + bw}`; lvl = y; x += bw; };
  go(0); bits.forEach(go); go(1);
  d += ` H${x + 24}`;
  let s = P(d, { stroke: K.ok, sw: 2.2 });
  s += T(x0 - 40, yH + 4, '1', { size: 9, fill: K.dim, anchor: 'end' }) + T(x0 - 40, yL + 4, '0', { size: 9, fill: K.dim, anchor: 'end' });
  for (let i = 0; i <= 10; i++) s += L(x0 + i * bw, 26, x0 + i * bw, 92, { stroke: 'rgba(148,163,184,.18)', sw: 1, dash: '2 3' });
  const names = ['start', ...bits.map((b) => String(b)), 'stop'];
  names.forEach((n, i) => { const c = i === 0 ? K.err : i === 9 ? K.blue : K.ink; s += T(x0 + i * bw + bw / 2, 108, n, { size: i === 0 || i === 9 ? 8 : 10, anchor: 'middle', fill: c, weight: 700 }); });
  s += P(`M${x0 + bw} 120 V126 H${x0 + 9 * bw} V120`, { stroke: K.line, sw: 1 }) + T(x0 + 5 * bw, 141, '8 data bits, the lowest bit first', { size: 9.5, anchor: 'middle', fill: K.ink, weight: 600 });
  s += R(8, 150, 344, 40, { fill: 'rgba(15,23,43,.9)', stroke: LINE2, rx: 10 }) + mono(20, 168, "'A' = 65 = 01000001", { size: 9.5, fill: '#c3e88d' }) + T(20, 182, '10 bits per character  →  at 9600 baud: 10 / 9600 s ≈ 1.04 ms', { size: 9, fill: K.line });
  s += T(8, 14, 'One character on the wire (pin TX)', { size: 10, weight: 800 });
  return fig(360, 198, s, 'Serial sends one character as ten bits: a start bit, eight data bits and a stop bit. At 9600 baud that is about 960 characters a second.');
};

export const rxQueue = () => {
  const row = (y, title, list, note, c) => T(10, y, title, { size: 10, weight: 800, fill: c }) + R(8, y + 8, 344, 40, { fill: 'rgba(15,23,43,.9)', stroke: LINE2, rx: 10 }) + (list.length ? bytes(18, y + 15, list, { w: 38, h: 26 }) : T(20, y + 33, '(empty)', { size: 10, fill: K.dim })) + T(344, y + 33, note, { size: 9, anchor: 'end', fill: K.ink, weight: 600 });
  let s = row(14, '① You send  42  + Newline', [{ t: '4', c: K.ok }, { t: '2', c: K.ok }, { t: 'LF', c: K.warn }], 'available() = 3', K.acc);
  s += T(37, 78, '52', { size: 8.5, fill: K.dim, anchor: 'middle' }) + T(79, 78, '50', { size: 8.5, fill: K.dim, anchor: 'middle' }) + T(121, 78, '10', { size: 8.5, fill: K.dim, anchor: 'middle' }) + T(150, 78, '← the ASCII codes', { size: 8.5, fill: K.dim });
  s += row(100, '② int n = Serial.parseInt();', [], 'n = 42 · available() = 0', K.ok);
  s += T(10, 170, '③ char c = Serial.read();  takes the FIRST character: c = \'4\' (52).', { size: 9.5, fill: K.line });
  s += T(10, 186, '    read() gives -1 when nothing is waiting.', { size: 9.5, fill: K.line });
  return fig(360, 196, s, 'Characters you send wait in a queue. read() takes the oldest one; parseInt() takes digits until a non-digit — your line ending ends the number.');
};
// ---------------------------------------------------------------------------------------------- sensors: the families
export const sensorFamilies = () => {
  const colW = 112, gap = 8;
  const cols = [
    { c: K.ok, title: 'Analog', parts: [['potentiometer', {}], ['ldr-module', {}]], sig: 'curve', rule: 'a voltage', fn: 'analogRead(A0)', res: '0 … 1023', ex: 'pot · LDR · LM35 · MQ-2 AO' },
    { c: K.warn, title: 'Digital', parts: [['pir', {}], ['hall-sensor', {}]], sig: 'square', rule: 'HIGH or LOW', fn: 'digitalRead(2)', res: '0 or 1', ex: 'PIR · IR · hall · DO pins' },
    { c: K.blue, title: 'Bus / library', parts: [['dht22', {}], ['mpu6050', {}]], sig: 'burst', rule: 'little messages', fn: 'dht.readTemperature()', res: '24.5', ex: 'DHT · DS18B20 · MPU6050' },
  ];
  let s = SHARED;
  cols.forEach((k, i) => {
    const x = 6 + i * (colW + gap);
    s += card(x, 6, colW, 238, k.c) + T(x + colW / 2, 24, k.title, { size: 12, anchor: 'middle', weight: 800, fill: k.c });
    s += part(k.parts[0][0], x + 6, 32, 46, 56, k.parts[0][1]) + part(k.parts[1][0], x + 58, 32, 46, 56, k.parts[1][1]);
    const sy = 100, sx = x + 8, sw = colW - 16;
    s += R(sx, sy, sw, 40, { fill: INK2, stroke: LINE2, rx: 7 });
    if (k.sig === 'curve') s += P(`M${sx + 6} ${sy + 30} C${sx + 24} ${sy + 4} ${sx + 40} ${sy + 38} ${sx + 58} ${sy + 18} S${sx + 84} ${sy + 8} ${sx + sw - 6} ${sy + 24}`, { stroke: k.c, sw: 2 });
    if (k.sig === 'square') s += P(`M${sx + 6} ${sy + 30} H${sx + 28} V${sy + 10} H${sx + 54} V${sy + 30} H${sx + 70} V${sy + 10} H${sx + sw - 6}`, { stroke: k.c, sw: 2 });
    if (k.sig === 'burst') s += P(`M${sx + 6} ${sy + 12} H${sx + 22} ` + [0, 1, 2, 3, 4, 5, 6].map((j) => `V${j % 2 ? sy + 12 : sy + 30} H${sx + 22 + (j + 1) * 7.5 + (j % 3) * 2}`).join(' ') + ` V${sy + 12} H${sx + sw - 6}`, { stroke: k.c, sw: 2 });
    s += T(x + colW / 2, 158, k.rule, { size: 10, anchor: 'middle', weight: 700, fill: K.ink });
    s += R(x + 6, 166, colW - 12, 22, { fill: INK2, stroke: 'none', rx: 6 }) + mono(x + colW / 2, 181, k.fn, { size: k.fn.length > 18 ? 7.2 : 8.3, anchor: 'middle', fill: '#c3e88d' });
    s += T(x + colW / 2, 205, 'you get', { size: 8, anchor: 'middle', fill: K.dim }) + T(x + colW / 2, 218, k.res, { size: 11, anchor: 'middle', weight: 800, fill: k.c });
    s += T(x + colW / 2, 236, k.ex, { size: 7.4, anchor: 'middle', fill: K.line });
  });
  return fig(360, 250, s, 'Three ways a sensor talks. Analog: a voltage that follows the world. Digital: just HIGH or LOW. Bus: a short digital conversation that a library decodes for you.');
};

export const adcScale = () => {
  const bar = (y, title, vmax, top, lo, c) => {
    const x0 = 30, w = 300, id = 'adc' + Math.round(vmax * 10);
    let s = T(x0, y, title, { size: 10.5, weight: 800, fill: c }) + `<defs><linearGradient id="${id}" x1="0" x2="1"><stop offset="0" stop-color="#0b2a4a"/><stop offset="1" stop-color="${c}"/></linearGradient></defs>` +
      `<rect x="${x0}" y="${y + 8}" width="${w}" height="22" rx="7" fill="url(#${id})" stroke="${K.line}" stroke-width="1"/>`;
    for (let i = 0; i <= 4; i++) {
      const x = x0 + (w * i) / 4;
      s += L(x, y + 30, x, y + 36, { stroke: K.line }) + T(x, y + 46, f1((vmax * i) / 4) + ' V', { size: 9, anchor: 'middle', fill: K.ink, weight: 600 }) + T(x, y + 58, String(Math.round((top * i) / 4)), { size: 9.5, anchor: 'middle', fill: c, weight: 800, mono: true });
    }
    return s + T(x0 + w, y, lo, { size: 8.5, anchor: 'end', fill: K.dim });
  };
  let s = bar(14, 'Uno · Nano · Mega  (5 V, 10 bit)', 5, 1023, '1 step ≈ 4.9 mV', K.ok) + bar(100, 'ESP32  (3.3 V, 12 bit in the lab)', 3.3, 4095, '1 step ≈ 0.8 mV', K.blue);
  s += T(180, 192, 'reading = voltage ÷ supply × highest value', { size: 10, anchor: 'middle', weight: 700, fill: K.warn });
  return fig(360, 204, s, 'analogRead() turns a voltage into a whole number. The same knob position gives 512 on an Uno and about 2048 on an ESP32.');
};

export const moduleAoDo = () => {
  let s = SHARED + R(8, 14, 98, 100, { fill: K.box, stroke: K.warn, rx: 12 }) + T(57, 32, 'sensor element', { size: 10, anchor: 'middle', weight: 800, fill: K.warn }) + T(57, 46, 'LDR · MQ-2 · soil', { size: 8.5, anchor: 'middle', fill: K.line }) + T(57, 58, 'flame · microphone', { size: 8.5, anchor: 'middle', fill: K.line });
  s += part('gas-sensor', 28, 64, 58, 46, {}, 0);
  s += L(106, 46, 150, 46) + AR(150, 46, 238, 46, { stroke: K.ok, m: 'mfc' }) + chip(280, 50, 'AO  analog', { c: K.ok, size: 10, w: 82 }) + T(280, 70, 'analogRead(A0)', { size: 9, anchor: 'middle', fill: K.line, mono: true });
  s += L(150, 46, 150, 104) + AR(150, 104, 180, 104, { stroke: K.blue, m: 'mfb' });
  s += P('M180 84 L226 104 L180 124 Z', { stroke: K.blue, sw: 1.6, fill: 'rgba(96,165,250,.12)' }) + T(194, 108, 'limit', { size: 8, anchor: 'middle', fill: K.blue });
  s += AR(226, 104, 238, 104, { stroke: K.blue, m: 'mfb' }) + chip(280, 108, 'DO  digital', { c: K.blue, size: 10, w: 82 }) + T(280, 128, 'digitalRead(2)', { size: 9, anchor: 'middle', fill: K.line, mono: true });
  s += `<circle cx="203" cy="146" r="9" fill="#2563eb" stroke="#93c5fd" stroke-width="1"/>` + L(203, 137, 203, 119, { stroke: K.blue, sw: 1.4 }) + T(203, 168, 'threshold knob', { size: 8.5, anchor: 'middle', fill: K.blue, weight: 700 });
  s += T(8, 138, 'VCC + GND power', { size: 8.5, fill: K.err, weight: 700 }) + T(8, 150, 'the module (> 2.5 V)', { size: 8.5, fill: K.line });
  s += T(180, 192, 'AO tells you how much. DO tells you "past the limit?"', { size: 9.5, anchor: 'middle', fill: K.ink, weight: 600 });
  return fig(360, 202, s, 'A four-pin sensor module has two outputs. AO follows the sensor. DO is AO compared with a limit — on a real module a small blue knob sets it; in the lab the limit is fixed.');
};

export const tapSensor = () => {
  const X = 10, Y = 6, W = 360, H = 226;
  let s = SHARED + UIDEFS + phoneBox(X, Y, W, H, 20) + R(X + 4, Y + 4, W - 8, 120, { fill: CANVAS, stroke: 'none', rx: 16 });
  s += part('hc-sr04', X + 50, Y + 14, 200, 104, {});
  s += ico('pointer', X + 236, Y + 64, 26, K.acc) + `<circle cx="${X + 238}" cy="${Y + 66}" r="15" fill="none" stroke="${K.acc}" stroke-width="1.6" stroke-dasharray="3 3"/>`;
  s += R(X + 4, Y + 126, W - 8, 96, { fill: '#0f172b', stroke: LINE2, rx: 18 }) + R(X + W / 2 - 18, Y + 131, 36, 4, { fill: '#2a3556', stroke: 'none', rx: 2 });
  s += ico('sliders', X + 16, Y + 142, 16, K.acc) + T(X + 38, Y + 155, 'Ultrasonic Sensor HC-SR04', { size: 11, weight: 800 });
  s += T(X + 18, Y + 184, 'Object distance', { size: 9.5, fill: K.line }) + T(X + W - 18, Y + 184, '100 cm', { size: 10, anchor: 'end', fill: K.acc, weight: 800 });
  s += R(X + 18, Y + 196, W - 36, 6, { fill: '#1b2744', stroke: 'none', rx: 3 }) + R(X + 18, Y + 196, 100, 6, { fill: K.acc, stroke: 'none', rx: 3 }) + `<circle cx="${X + 118}" cy="${Y + 199}" r="9" fill="#e8f9ff" stroke="${K.acc}" stroke-width="2"/>`;
  s += BADGE(X + 262, Y + 54, 1) + BADGE(X + 26, Y + 143, 2);
  return fig(380, 238, s, 'While the sketch runs, tap a sensor: a sheet opens with a slider for what it measures (here the distance of an object). Move it and the numbers in the Serial Monitor follow.');
};

/** A sheet of parts: tiles with the real artwork, a name and a small tag. items: [type, label, tag, props?, tagColor?] */
export function partSheet(items, { cols = 4, ch = 82, cap = '', title = '' } = {}) {
  const rows = Math.ceil(items.length / cols), gap = 4, W = 360;
  const cw = (W - gap * (cols + 1)) / cols;
  let s = SHARED, y0 = 4;
  if (title) { s += T(8, 14, title, { size: 10, weight: 800, fill: K.dim }); y0 = 22; }
  items.forEach(([type, label, tag, props, tc], i) => {
    const x = gap + (i % cols) * (cw + gap), y = y0 + Math.floor(i / cols) * (ch + gap);
    s += R(x, y, cw, ch, { fill: 'rgba(15,23,43,.9)', stroke: LINE2, rx: 10 });
    s += part(type, x + 8, y + 5, cw - 16, ch - 40, props || {});
    s += T(x + cw / 2, y + ch - 17, label, { size: label.length > 15 ? 7.6 : 8.6, anchor: 'middle', weight: 700, fill: K.ink });
    if (tag) s += chip(x + cw / 2, y + ch - 3, tag, { c: tc || K.acc, size: 7.6, h: 13 });
  });
  return fig(W, y0 + rows * (ch + gap), s, cap);
}
export const sensorSheetA = () => partSheet([
  ['ldr', 'Photoresistor', '2 pins · divider', {}, K.ok], ['ldr-module', 'Light module', 'AO + DO', {}, K.ok], ['potentiometer', 'Potentiometer', 'SIG → A0', {}, K.ok], ['lm35', 'LM35', 'OUT → A0', {}, K.ok],
  ['ntc-module', 'NTC thermistor', 'AO', {}, K.ok], ['gas-sensor', 'Gas MQ-2', 'AO + DO', {}, K.ok], ['soil-sensor', 'Soil moisture', 'AO + DO', {}, K.ok], ['rain-sensor', 'Rain sensor', 'AO + DO', {}, K.ok],
  ['water-level', 'Water level', 'AO', {}, K.ok], ['sound-sensor', 'Sound KY-038', 'AO + DO', {}, K.ok], ['flame-sensor', 'Flame KY-026', 'AO + DO', {}, K.ok], ['joystick', 'Joystick', 'VRx VRy · SW', {}, K.ok],
], { cap: 'Sensors that give a voltage (green tags): wire the analog output to A0 … A5 and use analogRead().' });
export const sensorSheetD = () => partSheet([
  ['pir', 'PIR HC-SR501', 'OUT HIGH', {}, K.warn], ['ir-obstacle', 'IR obstacle', 'DO LOW', {}, K.warn], ['line-sensor', 'Line TCRT5000', 'DO', {}, K.warn], ['hall-sensor', 'Hall KY-003', 'DO LOW', {}, K.warn],
  ['vibration-sensor', 'Vibration SW-420', 'DO HIGH', {}, K.warn], ['touch-sensor', 'Touch TTP223', 'SIG HIGH', {}, K.warn], ['hc-sr04', 'Ultrasonic HC-SR04', 'TRIG + ECHO', {}, K.blue], ['dht22', 'DHT22 / DHT11', 'DATA · library', {}, K.blue],
  ['ds18b20', 'DS18B20', '1-Wire · 4.7 kΩ', {}, K.blue], ['mpu6050', 'MPU6050', 'I²C 0x68', {}, K.blue], ['rtc-ds1307', 'RTC DS1307/3231', 'I²C 0x68', {}, K.blue], ['ir-receiver', 'IR receiver', 'OUT · IRremote', {}, K.blue],
], { cap: 'Digital sensors (yellow) give HIGH or LOW; bus sensors (blue) talk to a library over one wire, TRIG / ECHO or I²C.' });
// ---------------------------------------------------------------------------------------------- sensors: wiring pictures
const tnr = (col) => 'B/' + A.railId('tn', col);
const tpr = (col) => 'B/' + A.railId('tp', col);
/** A module above the Uno strip, wired straight to the pins: pairs = [[boardPin, modulePin, colour]…]. */
const direct = ({ type, x, props = {}, pairs, labels = {}, cap, tags, id = 'm', rot, gapUp, badges, name, w }) => bench({
  bb: null, ww: 260, w, board: { pins: [...new Set(pairs.map((p) => p[0]))], labels, name }, gapUp,
  up: [{ id, type, x, props, rot }], wires: pairs.map(([bp, mp, c]) => ({ a: 'R/' + bp, b: id + '/' + mp, color: c })), tags, badges, cap,
});
const I2C_LABELS = { A4: 'A4 SDA', A5: 'A5 SCL' };

export const wireLdr = (step = 4) => {
  const base = {
    cols: [3, 22], board: { pins: ['5V', 'A0', 'GND.2'] }, gapDown: 30,
    parts: [{ id: 'ldr', type: 'ldr', pin: '1', hole: 'e8' }, { id: 'r', type: 'resistor', props: { value: 10000 }, pin: '1', hole: 'a9' }],
    wires: [
      { a: 'R/5V', b: tpr(8), color: 'red' }, { a: 'B/a8', b: tpr(8), color: 'red', pts: ({ from }) => [] },
    ],
  };
  const full = {
    ...base,
    wires: [
      { a: 'R/5V', b: tpr(6), color: 'red' }, { a: 'R/GND.2', b: tnr(15), color: 'black' }, { a: 'R/A0', b: 'B/b9', color: 'yellow' },
      { a: 'B/b8', b: tpr(8), color: 'red' }, { a: 'B/a13', b: tnr(13), color: 'black' },
    ],
  };
  return bench({ ...full, cap: 'The LDR and a 10 kΩ resistor make a voltage divider. A0 listens at the middle (column 9). Bright light: the LDR lets more current pass, so A0 rises.' });
};
export const wireLm35 = () => direct({ type: 'lm35', x: 125, pairs: [['5V', 'VS', 'red'], ['A0', 'OUT', 'yellow'], ['GND.2', 'GND', 'black']], cap: 'LM35: +Vs to 5V, Vout to A0, GND to GND. Look at the flat face: the legs read +Vs, Vout, GND from the left.' });
export const wireHc = () => direct({ type: 'hc-sr04', x: 115, pairs: [['5V', 'VCC', 'red'], ['D3', 'TRIG', 'orange'], ['D2', 'ECHO', 'green'], ['GND.2', 'GND', 'black']], cap: 'HC-SR04: TRIG (output of the Uno) → D3, ECHO (input) → D2, plus 5V and GND — the same as in the Ultrasonic example.' });
export const wireDht = () => direct({ type: 'dht22', x: 115, pairs: [['5V', 'VCC', 'red'], ['D2', 'DATA', 'green'], ['GND.2', 'GND', 'black']], cap: 'DHT22: VCC to 5V, DATA to D2, GND to GND. The third pin (NC) stays empty.' });
export const wirePir = () => direct({ type: 'pir', x: 120, pairs: [['5V', 'VCC', 'red'], ['D6', 'OUT', 'yellow'], ['GND.2', 'GND', 'black']], cap: 'PIR: VCC to 5V, OUT to a digital pin (D6 here), GND to GND. OUT is HIGH while it sees motion.' });
export const wireNtc = () => direct({ type: 'ntc-module', x: 120, pairs: [['5V', 'VCC', 'red'], ['A0', 'AO', 'yellow'], ['GND.2', 'GND', 'black']], cap: 'NTC thermistor module: three pins. AO goes to A0 — a hotter sensor gives a lower voltage.' });
export const wireGas = () => direct({ type: 'gas-sensor', x: 110, pairs: [['5V', 'VCC', 'red'], ['A0', 'AO', 'yellow'], ['D2', 'DO', 'blue'], ['GND.2', 'GND', 'black']], cap: 'Gas, soil, rain, flame, sound and light modules share this pin order: VCC, GND, DO, AO. Use AO (A0) for the amount, DO (D2) for the yes / no.' });
export const wireJoy = () => direct({ type: 'joystick', x: 110, pairs: [['5V', '5V', 'red'], ['A0', 'VRx', 'orange'], ['A1', 'VRy', 'yellow'], ['D2', 'SW', 'blue'], ['GND.2', 'GND', 'black']], cap: 'Joystick: VRx → A0, VRy → A1, SW → D2 (use INPUT_PULLUP: pressed = LOW), 5V and GND.' });
export const wireMpu = () => direct({ type: 'mpu6050', x: 95, pairs: [['5V', 'VCC', 'red'], ['GND.2', 'GND', 'black'], ['A5', 'SCL', 'yellow'], ['A4', 'SDA', 'blue']], labels: I2C_LABELS, cap: 'MPU6050 on the I²C pins: SDA to A4, SCL to A5 (on an ESP32: D21 and D22). Only four wires are needed.' });
export const wireDs = (full = true) => bench({
  cols: [3, 22], board: { pins: ['5V', 'D2', 'GND.2'] }, gapDown: 30,
  parts: [{ id: 'ds', type: 'ds18b20', pin: 'GND', hole: 'e10' }, { id: 'r', type: 'resistor', props: { value: 4700 }, pin: '1', hole: 'a11' }],
  wires: [{ a: 'R/GND.2', b: tnr(5), color: 'black' }, { a: 'B/b10', b: tnr(10), color: 'black' }, { a: 'R/5V', b: tpr(14), color: 'red' }, { a: 'B/b12', b: tpr(12), color: 'red' }, { a: 'R/D2', b: 'B/b11', color: 'yellow' }, { a: 'B/a15', b: tpr(15), color: 'red' }],
  cap: 'DS18B20: GND and VDD to the rails, DQ to D2 — and a 4.7 kΩ resistor from DQ to 5V (the pull-up the 1-Wire bus needs).',
});
// ---------------------------------------------------------------------------------------------- displays: wiring pictures
/** A module BELOW the strip (pins on top, like an LCD), wired to the pins: pairs = [[boardPin, modulePin, colour]…]; crop = world units of the module that are shown. */
const below = ({ type, x, props = {}, pairs, labels = {}, cap, id = 'm', ww = 310, gapDown = 44, crop = 96, showWires, hi }) => {
  const hh = 34 + gapDown + crop;
  return bench({
    bb: null, ww, hh, board: { pins: [...new Set(pairs.map((p) => p[0]))], labels }, gapDown,
    dn: [{ id, type, x, props }], wires: pairs.map(([bp, mp, c]) => ({ a: 'R/' + bp, b: id + '/' + mp, color: c })), showWires, hi, cap,
    over: ({ wUnits }) => `<rect x="0" y="${hh - 14}" width="${wUnits}" height="14" fill="url(#ardFade)"/>`,
  });
};
export const wireLcdI2c = () => below({ type: 'lcd-i2c', x: 16, props: { size: '1602', backlight: 'blue', address: '39' }, pairs: [['GND.2', 'GND', 'black'], ['5V', 'VCC', 'red'], ['SDA', 'SDA', 'blue'], ['SCL', 'SCL', 'yellow']], cap: 'LCD with the I²C backpack: four wires only — GND, 5V, SDA (= A4) and SCL (= A5). Its address is 0x27.' });
const LCD_PAR = [['D2', 'RS', 'orange'], ['D3', 'E', 'yellow'], ['D4', 'D4', 'green'], ['D5', 'D5', 'blue'], ['D6', 'D6', 'purple'], ['D7', 'D7', 'white']];
export const wireLcdPar = () => below({
  type: 'lcd1602', x: 20, props: { size: '1602', backlight: 'green' }, pairs: LCD_PAR, gapDown: 50,
  cap: 'LCD 16×2, signals: RS → D2, E → D3 and the four data lines D4 – D7 → D4 – D7 (4-bit mode). The power pins are in the next picture.',
});
export const lcdPinMap = () => {
  const pins = [['VSS', 'GND', 'g'], ['VDD', '5V', 'p'], ['V0', 'GND', 'g'], ['RS', 'D2', 's'], ['RW', 'GND', 'g'], ['E', 'D3', 's'], ['D0', '—', 'x'], ['D1', '—', 'x'], ['D2', '—', 'x'], ['D3', '—', 'x'], ['D4', 'D4', 's'], ['D5', 'D5', 's'], ['D6', 'D6', 's'], ['D7', 'D7', 's'], ['A', '5V', 'p'], ['K', 'GND', 'g']];
  const col = { g: ['#9ca3af', 'GND'], p: [K.err, '5 V'], s: [K.acc, 'signal'], x: [K.dim, 'unused'] };
  const x0 = 8, cw = 21.5;
  let s = T(8, 14, 'The 16 pins of the LCD, left to right', { size: 10, weight: 800, fill: K.dim });
  pins.forEach(([n, to, k], i) => {
    const x = x0 + i * cw, c = col[k][0];
    s += R(x + 1, 24, cw - 3, 22, { fill: INK2, stroke: c, rx: 4 }) + T(x + cw / 2 - 0.5, 39, n, { size: n.length > 2 ? 7.4 : 8.4, anchor: 'middle', weight: 800, fill: K.ink });
    s += L(x + cw / 2 - 0.5, 46, x + cw / 2 - 0.5, 58, { stroke: c, sw: 1.4 });
    s += R(x + 1, 58, cw - 3, 22, { fill: k === 'x' ? 'rgba(15,23,43,.5)' : c + '33', stroke: c, rx: 4 }) + T(x + cw / 2 - 0.5, 73, to, { size: to.length > 2 ? 7.4 : 8.4, anchor: 'middle', weight: 800, fill: k === 'x' ? K.dim : K.ink });
  });
  s += P(`M${x0 + 3 * cw + 2} 90 V96 H${x0 + 14 * cw - 4} V90`, { stroke: K.acc, sw: 1 }) + T(x0 + 8.5 * cw, 110, 'data and control (D0 – D3 stay empty in 4-bit mode)', { size: 8.5, anchor: 'middle', fill: K.acc });
  s += chip(60, 138, 'GND', { c: '#9ca3af', size: 8.5, w: 44 }) + T(90, 141, 'VSS · V0 · RW · K', { size: 8.5, fill: K.line }) + chip(228, 138, '5 V', { c: K.err, size: 8.5, w: 44 }) + T(256, 141, 'VDD · A (backlight)', { size: 8.5, fill: K.line });
  s += T(8, 164, 'V0 = contrast: GND is darkest. A potentiometer here gives a knob.', { size: 8.5, fill: K.line });
  return fig(360, 172, s, 'LCD 16×2, power: every pin and where it goes. Six signals, four grounds (VSS, V0, RW, K), two 5 V (VDD, A).');
};
export const wireOled = () => direct({ type: 'oled-ssd1306', x: 115, pairs: [['5V', 'VCC', 'red'], ['A5', 'SCL', 'yellow'], ['A4', 'SDA', 'blue'], ['GND.2', 'GND', 'black']], labels: I2C_LABELS, cap: 'OLED SSD1306 on I²C: SDA to A4, SCL to A5, VCC to 5V, GND to GND (address 0x3C).' });
export const wireTm = () => direct({ type: 'tm1637', x: 115, pairs: [['5V', 'VCC', 'red'], ['D3', 'CLK', 'yellow'], ['D2', 'DIO', 'green'], ['GND.2', 'GND', 'black']], cap: 'TM1637 4-digit display: CLK → D3, DIO → D2, VCC to 5V, GND. Only two signal wires.' });
export const wireMax = () => direct({ type: 'max7219', x: 100, pairs: [['5V', 'VCC', 'red'], ['D12', 'DIN', 'green'], ['D11', 'CS', 'orange'], ['D10', 'CLK', 'yellow'], ['GND.1', 'GND', 'black']], cap: 'MAX7219 LED matrix: DIN → D12, CS → D11, CLK → D10 (the sketch tells LedControl these numbers), VCC to 5V, GND.' });
export const wireNeo = () => direct({ type: 'neopixel', x: 115, props: { layout: 'ring16' }, pairs: [['5V', 'VCC', 'red'], ['D6', 'DIN', 'green'], ['GND.1', 'GND', 'black']], cap: 'NeoPixel ring: DIN → D6, VCC to 5V, GND to GND. One data wire drives all 16 LEDs; DOUT passes the signal on to the next ring.' });
// ---------------------------------------------------------------------------------------------- displays: what you draw on them
/** One seven-segment digit; `ch` is '0'…'9', '-' or ' '. */
const SEG7 = { '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg', '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '-': 'g', ' ': '' };
function digit7(x, y, w, h, ch, { on = '#ff5a4d', off = 'rgba(255,255,255,.07)', dp = false, only = null } = {}) {
  const t = w * 0.17, hh = (h - 3 * t) / 2;
  const seg = { a: [x + t, y, w - 2 * t, t], g: [x + t, y + t + hh, w - 2 * t, t], d: [x + t, y + h - t, w - 2 * t, t], f: [x, y + t, t, hh + 2], b: [x + w - t, y + t, t, hh + 2], e: [x, y + 2 * t + hh, t, hh + 2], c: [x + w - t, y + 2 * t + hh, t, hh + 2] };
  const lit = SEG7[ch] || '';
  let s = '';
  for (const [k, [sx, sy, sw, sh]] of Object.entries(seg)) s += `<rect x="${f1(sx)}" y="${f1(sy)}" width="${f1(sw)}" height="${f1(sh)}" rx="${f1(t / 2)}" fill="${lit.includes(k) && (!only || only.includes(k)) ? on : off}"/>`;
  if (dp) s += `<circle cx="${f1(x + w + t * 0.7)}" cy="${f1(y + h - t / 2)}" r="${f1(t * 0.55)}" fill="${on}"/>`;
  return s;
}
export const lcdGrid = () => {
  const x0 = 20, y0 = 44, cw = 20, chh = 30;
  let s = R(x0 - 8, y0 - 8, 16 * cw + 16, 2 * chh + 16, { fill: '#1f4fc4', stroke: '#0f2a6b', rx: 8 });
  const txt = ['Hello RaptiAuto!', 'Uptime: 00:12'];
  for (let r = 0; r < 2; r++) for (let c = 0; c < 16; c++) {
    s += R(x0 + c * cw + 1, y0 + r * chh + 1, cw - 2, chh - 2, { fill: '#2e66e8', stroke: 'rgba(255,255,255,.10)', rx: 2, sw: 1 });
    const ch = txt[r][c];
    if (ch && ch !== ' ') s += T(x0 + c * cw + cw / 2, y0 + r * chh + 20, ch, { size: 14, anchor: 'middle', fill: '#fff', weight: 800, mono: true });
  }
  for (let c = 0; c < 16; c++) s += T(x0 + c * cw + cw / 2, y0 - 13, String(c), { size: 8, anchor: 'middle', fill: K.line });
  s += T(8, y0 + 19, '0', { size: 9, fill: K.line }) + T(8, y0 + chh + 19, '1', { size: 9, fill: K.line });
  s += `<rect x="${x0 - 1}" y="${y0 + chh}" width="${cw + 2}" height="${chh}" rx="3" fill="none" stroke="${K.warn}" stroke-width="2"/>`;
  s += T(180, 13, 'columns 0 … 15', { size: 9, anchor: 'middle', fill: K.dim, weight: 700 });
  s += R(20, 130, 320, 50, { fill: INK2, stroke: LINE2, rx: 8 }) + `<text x="30" y="149" font-size="10" font-family="${MONO}" fill="#e6edf7">lcd.setCursor(<tspan fill="#f78c6c">0</tspan>, <tspan fill="#f78c6c">1</tspan>);  <tspan fill="#66789c" font-style="italic">// column 0, row 1</tspan></text>` +
    `<text x="30" y="167" font-size="10" font-family="${MONO}" fill="#e6edf7">lcd.print(<tspan fill="#c3e88d">"Uptime: "</tspan>);</text>`;
  return fig(360, 188, s, 'The LCD is a grid of 16 columns and 2 rows. setCursor(column, row) puts the next print at that cell — counting starts at 0.');
};

export const oledGrid = () => {
  const k = 2.2, X = 24, Y = 26;
  let s = R(X - 6, Y - 6, 128 * k + 12, 64 * k + 12, { fill: '#05070d', stroke: K.line, rx: 8 }) + R(X, Y, 128 * k, 64 * k, { fill: '#0a0f1a', stroke: 'rgba(255,255,255,.12)', rx: 2 });
  const W = '#e8f4ff';
  s += `<rect x="${X + 1}" y="${Y + 1}" width="${128 * k - 2}" height="${64 * k - 2}" fill="none" stroke="${W}" stroke-width="1.2"/>`;
  s += T(X + 10 * k, Y + 33 * k, 'RaptiAuto', { size: 16, fill: W, weight: 800, mono: true });
  s += `<circle cx="${X + 98 * k}" cy="${Y + 34 * k}" r="${5 * k}" fill="${W}"/>`;
  for (let i = 0; i < 6; i++) { const h = 6 + ((i * 7) % 16); s += `<rect x="${X + (84 + i * 7) * k}" y="${Y + (60 - h) * k}" width="${5 * k}" height="${h * k}" fill="${W}"/>`; }
  s += T(X + 4 * k, Y + 13 * k, 't=12s', { size: 9, fill: W, mono: true });
  s += T(X, Y - 10, '(0, 0)', { size: 8.5, fill: K.acc, weight: 700 }) + T(X + 128 * k, Y - 10, '(127, 0)', { size: 8.5, fill: K.acc, anchor: 'end', weight: 700 }) + T(X, Y + 64 * k + 17, '(0, 63)', { size: 8.5, fill: K.acc, weight: 700 }) + T(X + 128 * k, Y + 64 * k + 17, '(127, 63)', { size: 8.5, fill: K.acc, anchor: 'end', weight: 700 });
  s += BADGE(X + 20, Y + 22 * k, 1) + BADGE(X + 98 * k, Y + 20 * k - 4, 2) + BADGE(X + 79 * k, Y + 48 * k, 3) + BADGE(X + 14, Y + 4, 4);
  const lines = [['1', 'setCursor(10, 20); println("RaptiAuto");'], ['2', 'fillCircle(98, 34, 5, WHITE);'], ['3', 'fillRect(84 + i*7, 60 - h, 5, h, WHITE);'], ['4', 'drawRect(0, 0, 128, 64, WHITE);']];
  lines.forEach(([n, t], i) => { s += BADGE(18, 214 + i * 17, n) + mono(32, 218 + i * 17, 'display.' + t, { size: 8.6, fill: '#c3e88d' }); });
  return fig(360, 288, s, 'The OLED is a grid of 128 × 64 pixels. x counts from the left (0 – 127), y from the top (0 – 63). Draw everything, then call display.display() to show it.');
};

export const tmDigits = () => {
  const X = 60, Y = 22, dw = 38, dh = 66, gap = 14;
  let s = R(30, 8, 300, 96, { fill: '#10131a', stroke: K.line, rx: 12 });
  const chars = ['1', '2', '3', '4'];
  chars.forEach((c, i) => { const x = X + i * (dw + gap) + (i > 1 ? 14 : 0); s += digit7(x, Y, dw, dh, c, { on: '#ff4d3d' }) + T(x + dw / 2, 118, String(i), { size: 9.5, anchor: 'middle', fill: K.acc, weight: 800 }); });
  s += `<circle cx="${X + 2 * (dw + gap) + 2}" cy="${Y + 22}" r="3.6" fill="#ff4d3d"/><circle cx="${X + 2 * (dw + gap) + 2}" cy="${Y + 46}" r="3.6" fill="#ff4d3d"/>`;
  s += T(180, 134, 'positions 0 … 3, and the colon between 1 and 2', { size: 8.5, anchor: 'middle', fill: K.dim });
  s += R(20, 144, 320, 56, { fill: INK2, stroke: LINE2, rx: 8 }) + `<text x="30" y="163" font-size="9.6" font-family="${MONO}" fill="#e6edf7">display.showNumberDecEx(<tspan fill="#f78c6c">1234</tspan>, <tspan fill="#f78c6c">0b01000000</tspan>, <tspan fill="#f78c6c">true</tspan>);</text>` +
    `<text x="30" y="181" font-size="9.2" font-family="${MONO}" fill="#66789c" font-style="italic">// number · colon on (bit 6) · keep leading zeros</text>`;
  return fig(360, 210, s, 'The TM1637 shows four digits and a colon. showNumberDec() writes a number; showNumberDecEx() also switches the colon on.');
};

export const matrixBits = () => {
  const rows = [0x00, 0x66, 0xFF, 0xFF, 0xFF, 0x7E, 0x3C, 0x18];
  const X = 18, Y = 22, c = 22;
  let s = R(X - 6, Y - 6, 8 * c + 12, 8 * c + 12, { fill: '#0b0d12', stroke: K.line, rx: 8 });
  rows.forEach((v, r) => { for (let b = 0; b < 8; b++) { const on = v & (0x80 >> b); s += `<circle cx="${X + b * c + c / 2}" cy="${Y + r * c + c / 2}" r="${on ? 8 : 6.5}" fill="${on ? '#ff3b3b' : '#3a1414'}"${on ? ' filter="url(#extGlow)"' : ''}/>`; } });
  s += `<defs><filter id="extGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="1.4"/></filter></defs>`.replace('<feGaussianBlur stdDeviation="1.4"/>', '<feGaussianBlur stdDeviation="0.8"/>');
  s += T(X + 4 * c, 14, '8 columns', { size: 9, anchor: 'middle', fill: K.dim, weight: 700 });
  rows.forEach((v, r) => {
    const y = Y + r * c + c / 2 + 4;
    s += L(X + 8 * c + 10, y - 4, X + 8 * c + 22, y - 4, { stroke: K.dim, sw: 1 }) + mono(X + 8 * c + 28, y, '0b' + v.toString(2).padStart(8, '0'), { size: 9, fill: '#c3e88d' }) + mono(X + 8 * c + 108, y, '= 0x' + v.toString(16).toUpperCase().padStart(2, '0'), { size: 9, fill: '#f78c6c' });
  });
  s += T(18, 218, 'for (row = 0; row < 8; row++)  lc.setRow(0, row, img[row]);', { size: 8.6, fill: K.ink, mono: true });
  return fig(360, 228, s, 'A picture on the matrix is eight bytes — one per row. A 1 lights the LED, a 0 leaves it dark. setRow() sends one row to the MAX7219.');
};

export const sevenSegPart = () => {
  const pf = partFit('seven-segment', 14, 30, 150, 140, { common: 'cathode', color: 'red' });
  let s = SHARED + T(14, 16, 'the part', { size: 10, weight: 800, fill: K.dim }) + pf.svg;
  const dx = 232, dy = 40, dw = 62, dh = 104;
  s += T(dx + 30, 16, 'its segments', { size: 10, weight: 800, fill: K.dim, anchor: 'middle' }) + R(dx - 22, dy - 14, dw + 56, dh + 30, { fill: '#10131a', stroke: LINE2, rx: 10 }) + digit7(dx, dy, dw, dh, '8', { on: '#ff5a4d', dp: true });
  const t = dw * 0.17, hh = (dh - 3 * t) / 2;
  const lbl = (k, x, y) => T(x, y, k, { size: 11, weight: 800, fill: '#ffd1cc', anchor: 'middle' });
  s += lbl('a', dx + dw / 2, dy - 3) + lbl('g', dx + dw / 2, dy + t + hh - 3) + lbl('d', dx + dw / 2, dy + dh + 13) + lbl('f', dx - 9, dy + 12 + hh / 2) + lbl('b', dx + dw + 9, dy + 12 + hh / 2) + lbl('e', dx - 9, dy + 22 + hh * 1.5) + lbl('c', dx + dw + 9, dy + 22 + hh * 1.5) + lbl('DP', dx + dw + 22, dy + dh + 4);
  s += T(180, 196, 'Each letter is one LED. COM joins all of their cathodes (or anodes).', { size: 9, anchor: 'middle', fill: K.line });
  return fig(360, 206, s, 'The 7-segment part has ten pins: the segments A – G, the dot DP and two COM pins (they are joined inside).');
};
export const sevenSegMap = () => {
  const rows = [['a', 'A', 'D2'], ['b', 'B', 'D3'], ['c', 'C', 'D4'], ['d', 'D', 'D5'], ['e', 'E', 'D6'], ['f', 'F', 'D7'], ['g', 'G', 'D8']];
  let s = T(14, 16, 'segment', { size: 9, fill: K.dim, weight: 700 }) + T(110, 16, 'resistor', { size: 9, fill: K.dim, weight: 700 }) + T(238, 16, 'Arduino pin', { size: 9, fill: K.dim, weight: 700 });
  rows.forEach(([k, pin, d], i) => {
    const y = 28 + i * 24;
    s += chip(34, y + 11, 'pin ' + pin, { c: '#ff8a80', size: 9, w: 54 }) + L(62, y + 6, 100, y + 6, { stroke: WC.yellow, sw: 1.6 }) + R(100, y, 44, 12, { fill: '#c9b48a', stroke: '#8a734a', rx: 4, sw: 1 }) + T(122, y + 9.5, '220 Ω', { size: 7.5, anchor: 'middle', fill: '#3b2f14', weight: 800 }) + L(144, y + 6, 214, y + 6, { stroke: WC.yellow, sw: 1.6 }) + chip(238, y + 11, d, { c: K.acc, size: 9.5, w: 46 });
    s += T(276, y + 10, `bit ${i} of the pattern`, { size: 8, fill: K.line });
  });
  s += L(34, 200, 34, 212, { stroke: '#9ca3af', sw: 1.6 }) + chip(34, 226, 'COM', { c: '#9ca3af', size: 9, w: 54 }) + L(62, 220, 214, 220, { stroke: '#9ca3af', sw: 1.6 }) + chip(238, 226, 'GND', { c: '#9ca3af', size: 9.5, w: 46 }) + T(276, 224, 'common cathode', { size: 8, fill: K.line });
  return fig(360, 238, s, 'Seven segments, seven resistors, seven pins (D2 – D8). Write HIGH to a pin and its segment lights; the COM pin goes to GND.');
};
// ============================================================================================ A7 · IoT, Wi-Fi, master–slave
/** Lifelines with arrows between them. cols: [{x, label, c}], steps: [{from, to, text, c?, sub?, note?}] (from === to draws a note on the line). */
function sequence(cols, steps, { top = 6, rowH = 38, head = 26, bw = 84 } = {}) {
  const bottom = top + head + steps.length * rowH + 8;
  let s = '';
  cols.forEach((c) => {
    s += L(c.x, top + head, c.x, bottom, { stroke: 'rgba(148,163,184,.3)', dash: '3 4', sw: 1 }) + R(c.x - bw / 2, top, bw, head, { fill: K.box, stroke: c.c, rx: 8 }) + T(c.x, top + 17, c.label, { size: 9.5, anchor: 'middle', weight: 800, fill: c.c });
  });
  steps.forEach((st, i) => {
    const y = top + head + rowH * (i + 0.62), a = cols[st.from].x, b = cols[st.to].x, c = st.c || K.line;
    const m = st.m || (c === K.acc ? 'mfb' : c === K.ok ? 'mfc' : 'mfa');
    s += BADGE(10, y - 3, i + 1);
    if (st.from === st.to) {
      const w = st.w || 150;
      s += R(a - w / 2 + (st.dx || 0), y - 14, w, 24, { fill: 'rgba(15,23,43,.95)', stroke: c, rx: 7, sw: 1 }) + T(a + (st.dx || 0), y + 1, st.text, { size: 8.6, anchor: 'middle', fill: K.ink, weight: 600 });
    } else {
      s += AR(a + (b > a ? 3 : -3), y + 4, b + (b > a ? -3 : 3), y + 4, { stroke: c, m });
      s += T((a + b) / 2, y - 6, st.text, { size: 8.8, anchor: 'middle', fill: K.ink, weight: 700 }) + (st.sub ? T((a + b) / 2, y + 16, st.sub, { size: 8, anchor: 'middle', fill: K.line }) : '');
    }
  });
  return { svg: s, h: bottom + 6 };
}

const cloudPath = (x, y, k = 1) => `<path transform="translate(${x} ${y}) scale(${k})" d="M-38 18 C-56 18 -58 -6 -40 -8 C-40 -26 -12 -32 0 -18 C10 -34 40 -26 38 -6 C58 -6 58 18 40 18 Z" fill="rgba(96,165,250,.13)" stroke="${K.blue}" stroke-width="${f1(1.6 / k)}" stroke-linejoin="round"/>`;
const wifiArcs = (x, y, c = K.acc, up = true, k = 1) => [5, 10, 15].map((r) => { const rr = r * k, d = rr * 0.72; return P(`M${f1(x - d)} ${f1(y + (up ? -d : d))} A${f1(rr)} ${f1(rr)} 0 0 ${up ? 1 : 0} ${f1(x + d)} ${f1(y + (up ? -d : d))}`, { stroke: c, sw: 1.8 }); }).join('') + `<circle cx="${x}" cy="${y}" r="1.8" fill="${c}"/>`;
const routerIcon = (x, y, { on = true, label = 'Router', sub = 'RaptiNet' } = {}) => {
  const c = on ? K.vio : K.dim;
  return L(x - 24, y - 8, x - 30, y - 24, { stroke: c, sw: 2.2 }) + L(x + 24, y - 8, x + 30, y - 24, { stroke: c, sw: 2.2 }) + R(x - 38, y - 10, 76, 24, { fill: K.box2, stroke: c, rx: 7, sw: 1.4 }) +
    [0, 1, 2, 3].map((i) => `<circle cx="${x - 24 + i * 9}" cy="${y + 2}" r="2" fill="${on ? K.ok : K.dim}"/>`).join('') + (on ? wifiArcs(x, y - 20, K.vio, true, 0.9) : '') +
    T(x, y + 30, label, { size: 9.5, anchor: 'middle', weight: 800, fill: c }) + T(x, y + 42, sub, { size: 8.5, anchor: 'middle', fill: K.line });
};
const phoneIcon = (x, y, { label = 'IoT tab', sub = 'the phone / PC', url = '192.168.1.50' } = {}) =>
  R(x - 20, y - 34, 40, 64, { fill: PHONE, stroke: K.acc, rx: 8, sw: 1.4 }) + R(x - 16, y - 28, 32, 52, { fill: '#f8fafc', stroke: 'none', rx: 3 }) + R(x - 16, y - 28, 32, 8, { fill: '#e2e8f0', stroke: 'none', rx: 3 }) + T(x, y - 22, url, { size: 4.6, anchor: 'middle', fill: '#334155', weight: 700 }) +
  R(x - 9, y - 6, 18, 8, { fill: '#22c55e', stroke: 'none', rx: 4 }) + R(x - 9, y + 6, 18, 8, { fill: '#ef4444', stroke: 'none', rx: 4 }) + T(x, y + 42, label, { size: 9.5, anchor: 'middle', weight: 800, fill: K.acc }) + T(x, y + 54, sub, { size: 8.5, anchor: 'middle', fill: K.line });
const boardIcon = (x, y, { type = 'esp32-devkit', label = 'ESP32', sub = '', on = true, w = 78, h = 48 } = {}) =>
  `<g opacity="${on ? 1 : 0.35}">${part(type, x - w / 2, y - h / 2, w, h)}</g>` + T(x, y + h / 2 + 12, label, { size: 9.5, anchor: 'middle', weight: 800, fill: on ? K.ok : K.dim }) + (sub ? T(x, y + h / 2 + 24, sub, { size: 8.5, anchor: 'middle', fill: K.line, mono: true }) : '');
const dashBox = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9" fill="${K.acc}" fill-opacity=".06" stroke="${K.acc}" stroke-width="1.3" stroke-dasharray="4 3"/>`;

/** The network, built up step by step (1 = a board alone … 4 = with the internet). */
export const netStep = (n = 4) => {
  const bx = 70, by = 150, rx = 182, ry = 112, px = 296, py = 150, cx = 182, cy = 38;
  let s = SHARED;
  if (n >= 4) s += dashBox(cx - 82, cy - 34, 164, 76) + cloudPath(cx, cy, 1.15) + T(cx, cy - 2, 'internet', { size: 11, anchor: 'middle', weight: 800, fill: K.blue }) + T(cx, cy + 12, n === 4 ? 'http · https · MQTT' : '', { size: 8, anchor: 'middle', fill: K.line });
  if (n >= 4) s += L(rx, ry - 38, rx, ry - 50, { stroke: K.blue }) + AR(rx, ry - 50, cx, cy + 22, { stroke: K.blue, m: 'mfa' });
  if (n >= 2) s += (n === 2 ? dashBox(rx - 56, ry - 40, 112, 92) : '') + routerIcon(rx, ry);
  if (n >= 3) s += (n === 3 ? dashBox(px - 34, py - 48, 68, 112) : '') + phoneIcon(px, py);
  s += (n === 1 ? dashBox(bx - 54, by - 36, 108, 98) : '') + boardIcon(bx, by, { sub: n >= 2 ? '192.168.1.50' : '' });
  if (n >= 2) s += wifiArcs(bx + 40, by - 30, K.ok, true, 1.1) + P(`M${bx + 30} ${by - 30} Q${(bx + rx) / 2} ${by - 60} ${rx - 40} ${ry}`, { stroke: K.ok, sw: 1.4, dash: '4 3' }) + T((bx + rx) / 2 + 2, by - 54, 'Wi-Fi', { size: 8.5, fill: K.ok, weight: 700 });
  if (n >= 3) s += wifiArcs(px - 30, py - 40, K.acc, true, 1.1) + P(`M${px - 24} ${py - 40} Q${(px + rx) / 2} ${py - 62} ${rx + 40} ${ry}`, { stroke: K.acc, sw: 1.4, dash: '4 3' }) + T((px + rx) / 2 - 6, py - 58, 'same Wi-Fi', { size: 8.5, fill: K.acc, weight: 700 });
  const note = ['1 · A board with Wi-Fi (ESP32, NodeMCU, Uno R4 WiFi) and a sketch that uses WiFi.', '2 · The simulated router RaptiNet: the board joins it and gets an IP address.', '3 · The IoT tab is a phone on the same Wi-Fi: it can open the board\'s web page.', '4 · The router leads to the internet: weather, time, MQTT brokers, web pages.'][n - 1];
  s += T(180, 222, note, { size: 8.8, anchor: 'middle', fill: K.line });
  return fig(360, 232, s, ['Step 1 · The board. Nothing is online yet.', 'Step 2 · The router. The board joins it with WiFi.begin() and gets 192.168.1.50.', 'Step 3 · The phone. The IoT tab sees the board and opens its pages.', 'Step 4 · The internet. Services answer through the router.'][n - 1]);
};
export const iotHero = () => {
  const bx = 66, by = 156, rx = 186, ry = 120, px = 304, py = 156, cx = 186, cy = 44;
  let s = SHARED + cloudPath(cx, cy, 1.5) + T(cx, cy - 8, 'the internet', { size: 12, anchor: 'middle', weight: 800, fill: K.blue }) + T(cx, cy + 8, 'weather · time · MQTT · ThingSpeak', { size: 8.4, anchor: 'middle', fill: K.line });
  s += L(rx, ry - 28, rx, ry - 42, { stroke: K.blue }) + AR(rx, ry - 42, cx, cy + 30, { stroke: K.blue, m: 'mfa' });
  s += routerIcon(rx, ry) + boardIcon(bx, by, { sub: '192.168.1.50' }) + phoneIcon(px, py);
  s += wifiArcs(bx + 38, by - 32, K.ok, true, 1.2) + P(`M${bx + 28} ${by - 32} Q${(bx + rx) / 2} ${by - 66} ${rx - 40} ${ry - 4}`, { stroke: K.ok, sw: 1.5, dash: '4 3' });
  s += wifiArcs(px - 28, py - 42, K.acc, true, 1.2) + P(`M${px - 22} ${py - 42} Q${(px + rx) / 2} ${py - 66} ${rx + 40} ${ry - 4}`, { stroke: K.acc, sw: 1.5, dash: '4 3' });
  s += BADGE(bx - 40, by - 30, 1) + BADGE(rx + 54, ry + 6, 2) + BADGE(px + 26, py - 30, 3) + BADGE(cx + 86, cy + 16, 4);
  s += T(180, 238, '1 board · 2 router · 3 IoT tab · 4 the internet', { size: 9.2, anchor: 'middle', fill: K.line });
  return fig(380, 248, s, 'Your project is a small network: a Wi-Fi board, a router called RaptiNet, the IoT tab (a phone on the same Wi-Fi) and the internet behind the router.');
};

export const iotTab = () => {
  const X = 10, Y = 6, W = 360, H = 316;
  let s = UIDEFS + phoneBox(X, Y, W, H, 22);
  s += R(X + 8, Y + 10, W - 16, 28, { fill: 'rgba(34,197,94,.08)', stroke: 'none', rx: 14 });
  s += R(X + 12, Y + 14, 74, 20, { fill: 'rgba(34,197,94,.18)', stroke: K.ok, rx: 10, sw: 1 }) + ico('wifi', X + 17, Y + 17, 14, K.ok) + T(X + 34, Y + 28, 'RaptiNet', { size: 8.6, fill: K.ok, weight: 800 });
  s += R(X + 92, Y + 14, 142, 20, { fill: 'rgba(15,23,43,.9)', stroke: K.ok, rx: 10, sw: 1 }) + `<circle cx="${X + 103}" cy="${Y + 24}" r="3.4" fill="${K.ok}"/>` + T(X + 111, Y + 28, 'ESP32 DevKit V1 · 192.168.1.50', { size: 6.8, fill: K.ink, weight: 600 });
  s += R(X + 240, Y + 14, 52, 20, { fill: 'rgba(34,211,238,.14)', stroke: K.acc, rx: 10, sw: 1 }) + T(X + 266, Y + 28, '192.168.1.50', { size: 6.3, anchor: 'middle', fill: K.acc, weight: 700 }) + R(X + 296, Y + 14, 50, 20, { fill: 'rgba(34,211,238,.14)', stroke: K.acc, rx: 10, sw: 1 }) + T(X + 321, Y + 28, 'esp32.local', { size: 6.8, anchor: 'middle', fill: K.acc, weight: 700 });
  // browser bar
  s += R(X + 8, Y + 44, W - 16, 28, { fill: '#0d1528', stroke: LINE2, rx: 10 }) + ico('arrowLeft', X + 13, Y + 50, 15, '#94a3b8') + ico('arrowRight', X + 33, Y + 50, 15, '#475569') + ico('restart', X + 53, Y + 50, 15, '#94a3b8') + ico('home', X + 73, Y + 50, 15, '#94a3b8');
  s += R(X + 96, Y + 49, W - 116, 18, { fill: '#05070d', stroke: LINE2, rx: 9 }) + ico('globe', X + 101, Y + 52, 12, K.dim) + T(X + 118, Y + 61.5, 'http://192.168.1.50/', { size: 8.4, fill: K.ink });
  const marks = ['Dashboard', 'Weather', 'ThingSpeak', 'Docs', 'Start', 'RAPTI'];
  let mx = X + 10;
  marks.forEach((m) => { const w = m.length * 5.4 + 14; s += R(mx, Y + 78, w, 16, { fill: '#10203f', stroke: 'none', rx: 8 }) + T(mx + w / 2, Y + 89.5, m, { size: 7.8, anchor: 'middle', fill: '#cbd5e1', weight: 600 }); mx += w + 4; });
  // page
  s += R(X + 8, Y + 100, W - 16, 154, { fill: '#f8fafc', stroke: 'none', rx: 8 }) + T(X + W / 2, Y + 138, 'ESP32 LED', { size: 18, anchor: 'middle', fill: '#0f172a', weight: 800 }) + T(X + W / 2, Y + 162, 'The LED is ON', { size: 12, anchor: 'middle', fill: '#334155', weight: 700 });
  s += R(X + 74, Y + 182, 100, 34, { fill: '#16a34a', stroke: 'none', rx: 10 }) + T(X + 124, Y + 204, 'Turn ON', { size: 12, anchor: 'middle', fill: '#fff', weight: 800 }) + R(X + 184, Y + 182, 100, 34, { fill: '#dc2626', stroke: 'none', rx: 10 }) + T(X + 234, Y + 204, 'Turn OFF', { size: 12, anchor: 'middle', fill: '#fff', weight: 800 });
  s += navBar(X + 6, Y + H - 52, W - 12, 'globe', true);
  s += BADGE(X + 20, Y + 8, 1) + BADGE(X + 112, Y + 8, 2) + BADGE(X + 292, Y + 8, 3) + BADGE(X + 18, Y + 44, 4) + BADGE(X + 300, Y + 76, 5) + BADGE(X + 330, Y + 112, 6);
  return fig(380, 328, s, 'The IoT tab. 1 the Wi-Fi network · 2 the boards that joined it · 3 buttons that open a board\'s web server · 4 browser buttons · 5 bookmarks · 6 the page.');
};

export const iotGate = () => {
  const items = [['uno-r3', 'Uno R3', 0], ['uno-r4-minima', 'R4 Minima', 0], ['uno-r4-wifi', 'Uno R4 WiFi', 1], ['leonardo', 'Leonardo', 0], ['nano', 'Nano', 0], ['mega2560', 'Mega 2560', 0], ['esp32-devkit', 'ESP32 DevKit', 1], ['nodemcu-esp8266', 'NodeMCU ESP8266', 1], ['stm32-bluepill', 'Blue Pill', 0], ['attiny85', 'ATtiny85', 0]];
  let s = SHARED;
  items.forEach(([t, n, w], i) => {
    const col = i % 5, row = Math.floor(i / 5), x = 4 + col * 71, y = 6 + row * 86;
    s += R(x, y, 67, 80, { fill: 'rgba(15,23,43,.9)', stroke: w ? K.ok : LINE2, rx: 10, sw: w ? 1.6 : 1 }) + part(t, x + 5, y + 6, 57, 40) + T(x + 33.5, y + 58, n, { size: n.length > 12 ? 6.6 : 7.6, anchor: 'middle', weight: 700, fill: K.ink }) +
      (w ? R(x + 8, y + 64, 51, 12, { fill: 'rgba(34,197,94,.18)', stroke: K.ok, rx: 6, sw: 1 }) + ico('wifi', x + 12, y + 65, 10, K.ok) + T(x + 38, y + 73, 'IoT tab', { size: 7, anchor: 'middle', fill: K.ok, weight: 800 }) : T(x + 33.5, y + 73, 'no Wi-Fi', { size: 7.2, anchor: 'middle', fill: K.dim }));
  });
  return fig(360, 182, s, 'Only boards with Wi-Fi get the IoT tab: the ESP32 DevKit, the NodeMCU ESP8266 and the Uno R4 WiFi. With any other board the tab is hidden.');
};

export const wifiSteps = () => {
  const cols = [{ x: 62, label: 'Your board', c: K.ok }, { x: 190, label: 'Router RaptiNet', c: K.vio }, { x: 306, label: 'Serial Monitor', c: K.warn }];
  const q = sequence(cols, [
    { from: 0, to: 1, text: 'WiFi.begin("RaptiNet", "rapti1234")', sub: 'name + password', c: K.ok },
    { from: 1, to: 1, text: 'checks name and password', c: K.vio },
    { from: 1, to: 0, text: 'WL_CONNECTED + IP 192.168.1.50', sub: 'after about 1 to 2 s', c: K.vio },
    { from: 0, to: 2, text: 'Serial.println(WiFi.localIP())', sub: 'IP address: 192.168.1.50', c: K.warn },
  ], { rowH: 46 });
  return fig(360, q.h, q.svg, 'Joining the Wi-Fi: the sketch sends the name and password, the router says yes, and the board gets an IP address — the address you open in the IoT tab.');
};
export const wlStatus = () => {
  const box = (x, y, w, h, t1, t2, c) => R(x, y, w, h, { fill: 'rgba(15,23,43,.95)', stroke: c, rx: 9, sw: 1.4 }) + mono(x + w / 2, y + 15, t1, { size: 8.6, anchor: 'middle', fill: c, weight: 800 }) + T(x + w / 2, y + 28, t2, { size: 7.8, anchor: 'middle', fill: K.line });
  let s = box(8, 80, 88, 36, 'WL_IDLE_STATUS', '0 · waiting', K.line) + box(136, 8, 112, 36, 'WL_CONNECTED', '3 · you have an IP', K.ok) + box(136, 74, 112, 36, 'WL_CONNECT_FAILED', '4 · wrong password', K.err) + box(136, 140, 112, 36, 'WL_NO_SSID_AVAIL', '1 · router off, unknown name', K.warn);
  s += AR(97, 92, 135, 30, { stroke: K.ok, m: 'mfc' }) + AR(97, 98, 135, 92, { stroke: K.err }) + AR(97, 106, 135, 156, { stroke: K.warn });
  s += box(268, 8, 88, 36, 'CONNECTION_LOST', '5 · router off later', K.warn) + AR(249, 26, 267, 26, { stroke: K.warn }) + box(268, 74, 88, 36, 'WL_DISCONNECTED', '6 · you called it', K.line) + AR(249, 34, 280, 73, { stroke: K.line });
  s += T(8, 142, 'WiFi.begin()', { size: 9, fill: K.ok, weight: 700 }) + T(8, 156, 'starts here', { size: 8.5, fill: K.line }) + T(8, 190, 'The status changes only after the join time (1 – 2 s; 3.5 s when it fails).', { size: 8.4, fill: K.line });
  return fig(360, 198, s, 'WiFi.status() tells how the join went. Check for WL_CONNECTED in a loop before the sketch uses the network.');
};
export const wifiNetworks = () => {
  const x0 = 8;
  let s = T(14, 14, 'network name', { size: 8.6, fill: K.dim, weight: 700 }) + T(150, 14, 'password', { size: 8.6, fill: K.dim, weight: 700 }) + T(250, 14, 'signal', { size: 8.6, fill: K.dim, weight: 700 }) + T(346, 14, 'channel', { size: 8.6, fill: K.dim, weight: 700, anchor: 'end' });
  NETWORKS.forEach((n, i) => {
    const y = 22 + i * 34, bars = n.rssi > -50 ? 4 : n.rssi > -60 ? 3 : n.rssi > -75 ? 2 : 1;
    s += R(x0, y, 344, 30, { fill: i === 0 ? 'rgba(34,211,238,.1)' : 'rgba(15,23,43,.9)', stroke: i === 0 ? K.acc : LINE2, rx: 9 }) + ico('wifi', 16, y + 7, 16, n.pass ? K.ok : K.warn) + T(38, y + 19.5, n.ssid, { size: 11, weight: 800 });
    s += n.pass ? mono(150, y + 19, n.pass, { size: 9.6, fill: '#c3e88d' }) : T(150, y + 19, 'open — no password', { size: 9, fill: K.warn });
    for (let b = 0; b < 4; b++) s += R(250 + b * 7, y + 22 - (b + 1) * 4, 5, (b + 1) * 4, { fill: b < bars ? K.ok : 'rgba(148,163,184,.25)', stroke: 'none', rx: 1 });
    s += T(282, y + 19, `${n.rssi} dBm`, { size: 8, fill: K.line }) + T(342, y + 19, String(n.ch), { size: 9, anchor: 'end', fill: K.line });
  });
  return fig(360, 232, s, 'The six networks of the simulated Wi-Fi. RaptiNet is the one the examples use. Any other name also works unless Strict Wi-Fi is on.');
};

export const requestSeq = () => {
  const cols = [{ x: 56, label: 'IoT tab', c: K.acc }, { x: 172, label: 'Router', c: K.vio }, { x: 296, label: 'Your sketch', c: K.ok }];
  const q = sequence(cols, [
    { from: 0, to: 1, text: 'GET http://192.168.1.50/on', sub: 'you tapped Turn ON', c: K.acc },
    { from: 1, to: 2, text: 'forwards it to the board', sub: 'waits in the server queue', c: K.vio },
    { from: 2, to: 2, text: 'handleClient() finds "/on"', c: K.ok, w: 142, dx: -40 },
    { from: 2, to: 2, text: 'handleOn() lights the LED', c: K.ok, w: 142, dx: -40 },
    { from: 2, to: 1, text: 'server.send(200, "text/html", page)', sub: 'the answer', c: K.ok },
    { from: 1, to: 0, text: 'the page appears', sub: 'LED is ON', c: K.acc },
  ], { rowH: 42 });
  return fig(360, q.h, q.svg, 'One tap on a web button: the request travels to the board, a handler runs in your sketch, and the answer comes back. The board only answers while loop() calls server.handleClient().');
};
export const urlAnatomy = () => {
  const y = 52, cw = 7.4;
  const parts = [['http://', K.line, 'protocol'], ['192.168.1.50', K.acc, 'host: the IP address of the board (or name.local)'], [':8080', K.warn, 'port; 80 if you leave it out'], ['/led', K.ok, 'path: picks the handler of server.on()'], ['?on=1', K.vio, 'arguments: read with server.arg()']];
  let s = R(8, 26, 344, 34, { fill: '#05070d', stroke: LINE2, rx: 12 }) + ico('globe', 16, 34, 16, K.dim);
  let cx = 38;
  parts.forEach(([t, c, lab], i) => {
    const w = t.length * cw, ly = 84 + i * 17;
    s += mono(cx, y - 2, t, { size: 12.4, fill: c, weight: 700 }) + L(cx, y + 6, cx + w, y + 6, { stroke: c, sw: 2 });
    s += `<circle cx="18" cy="${ly - 3.5}" r="4" fill="${c}"/>` + mono(30, ly, t, { size: 9, fill: c, weight: 700 }) + T(110, ly, lab, { size: 8.6, fill: K.ink });
    cx += w;
  });
  s += R(8, 176, 344, 46, { fill: INK2, stroke: LINE2, rx: 8 }) + `<text x="18" y="193" font-size="9.4" font-family="${MONO}" fill="#e6edf7">server.on(<tspan fill="#c3e88d">"/led"</tspan>, handleLed);</text><text x="18" y="211" font-size="9.4" font-family="${MONO}" fill="#e6edf7">String v = server.arg(<tspan fill="#c3e88d">"on"</tspan>);  <tspan fill="#66789c" font-style="italic">// "1"</tspan></text>`;
  return fig(360, 230, s, 'A web address in five parts. The path picks the handler you registered with server.on(); arguments after the ? arrive in server.arg().');
};
export const dashSwitches = () => {
  const sw = (x, label, on, w) => R(x, 36, w, 24, { fill: '#0b1328', stroke: '#24304f', rx: 12 }) + `<circle cx="${x + 12}" cy="48" r="4.5" fill="${on ? '#34d399' : '#f87171'}"/>` + T(x + 22, 52, label, { size: 8.6, fill: '#e5ecff', weight: 600 });
  let s = R(6, 6, 348, 62, { fill: '#0e1630', stroke: '#24304f', rx: 12 }) + T(16, 26, 'RAPTI IoT Cloud', { size: 11.5, fill: '#22d3ee', weight: 800 }) + T(250, 26, 'Clear logs', { size: 8.5, fill: '#8b9bc2' }) +
    sw(14, 'Router', true, 62) + sw(82, 'Internet', true, 68) + sw(156, 'Strict Wi-Fi', false, 84) + sw(246, 'Real internet', true, 96);
  const rows = [
    ['Router', K.vio, 'The Wi-Fi network disappears. Boards lose it (status 5) and new joins fail.'],
    ['Internet', K.blue, 'Boards stay on the Wi-Fi and still reach each other, but every request to the internet fails.'],
    ['Strict Wi-Fi', K.warn, 'On: a wrong network name or password fails like on a real router. Off: any name works.'],
    ['Real internet', K.ok, 'On: weather, time, prices and web pages come from the phone\'s real internet (if it is online).'],
  ];
  rows.forEach(([n, c, t], i) => {
    const y = 80 + i * 44;
    s += R(6, y, 348, 38, { fill: 'rgba(15,23,43,.9)', stroke: c, rx: 9, sw: 1 }) + T(16, y + 15, n, { size: 9.6, weight: 800, fill: c });
    const words = t.split(' '); let line = '', ly = y + 15, out = [];
    words.forEach((w) => { if ((line + ' ' + w).length > 54) { out.push(line); line = w; } else line = (line + ' ' + w).trim(); }); out.push(line);
    out.forEach((l, k) => { s += T(94, ly + k * 11, l, { size: 8.3, fill: K.ink }); });
  });
  return fig(360, 262, s, 'The four switches in the dashboard header. They let you test how your sketch behaves when the Wi-Fi or the internet is gone.');
};

export const routeFlow = () => {
  const dec = (x, y, w, h, t) => R(x, y, w, h, { fill: K.box2, stroke: K.acc, rx: 10, sw: 1.3 }) + t.map((l, i) => T(x + w / 2, y + 16 + i * 11.5, l, { size: 8.6, anchor: 'middle', weight: 700, fill: K.ink })).join('');
  const out = (x, y, w, h, t, c) => R(x, y, w, h, { fill: 'rgba(15,23,43,.95)', stroke: c, rx: 9, sw: 1.3 }) + t.map((l, i) => T(x + w / 2, y + 15 + i * 11, l, { size: 8.3, anchor: 'middle', weight: 600, fill: c })).join('');
  const dx = 10, dw = 148, ox = 214, ow = 140;
  let s = T(dx + dw / 2, 12, 'a request leaves the board', { size: 9, anchor: 'middle', fill: K.dim, weight: 700 });
  const ys = [22, 90, 158, 226];
  s += dec(dx, ys[0], dw, 44, ['Is the address a board', 'on the Wi-Fi? (IP, name.local)']) + dec(dx, ys[1], dw, 44, ['Are the router', 'and the internet on?']) + dec(dx, ys[2], dw, 44, ['Real internet on and', 'the host is a normal site?']) + dec(dx, ys[3], dw, 44, ['Does the simulator have', 'a service of that name?']);
  s += out(ox, ys[0] + 2, ow, 40, ['that board\'s web server', 'answers (refused if none)'], K.ok) + out(ox, ys[1] + 2, ow, 40, ['ERR_INTERNET_DISCONNECTED', 'the request fails'], K.err) + out(ox, ys[2] + 2, ow, 40, ['the REAL web answers', '(simulated if it fails)'], K.ok) + out(ox, ys[3] + 2, ow, 40, ['simulated answer', '(weather, ThingSpeak …)'], K.warn);
  s += T(188, ys[0] + 19, 'yes', { size: 8.5, anchor: 'middle', fill: K.ok, weight: 700 }) + AR(dx + dw + 2, ys[0] + 24, ox - 2, ys[0] + 24, { stroke: K.ok, m: 'mfc' });
  s += T(188, ys[1] + 19, 'no', { size: 8.5, anchor: 'middle', fill: K.err, weight: 700 }) + AR(dx + dw + 2, ys[1] + 24, ox - 2, ys[1] + 24, { stroke: K.err });
  s += T(188, ys[2] + 19, 'yes', { size: 8.5, anchor: 'middle', fill: K.ok, weight: 700 }) + AR(dx + dw + 2, ys[2] + 24, ox - 2, ys[2] + 24, { stroke: K.ok, m: 'mfc' });
  s += T(188, ys[3] + 19, 'yes', { size: 8.5, anchor: 'middle', fill: K.warn, weight: 700 }) + AR(dx + dw + 2, ys[3] + 24, ox - 2, ys[3] + 24, { stroke: K.warn });
  [[0, 'no'], [1, 'yes'], [2, 'no']].forEach(([i, t]) => { s += AR(dx + dw / 2, ys[i] + 44, dx + dw / 2, ys[i + 1] - 1, { stroke: K.line }) + T(dx + dw / 2 + 6, ys[i] + 56, t, { size: 8.5, fill: t === 'yes' ? K.ok : K.line, weight: 700 }); });
  s += AR(dx + dw / 2, ys[3] + 44, dx + dw / 2, ys[3] + 58, { stroke: K.err }) + T(dx + dw / 2 + 6, ys[3] + 56, 'no', { size: 8.5, fill: K.line, weight: 700 }) + chip(dx + dw / 2, ys[3] + 72, 'ERR_NAME_NOT_RESOLVED', { c: K.err, size: 8.2, h: 15, w: 154 });
  return fig(360, 312, s, 'Where does a request go? The simulator checks, from the top, who can answer. Account services (ThingSpeak, Blynk, Telegram …) never leave the simulator.');
};

export const liveVsSim = () => {
  const col = (x, title, c, sub, items) => card(x, 6, 170, 196, c) + T(x + 85, 26, title, { size: 11, anchor: 'middle', weight: 800, fill: c }) + T(x + 85, 40, sub, { size: 8, anchor: 'middle', fill: K.line }) +
    items.map((t, i) => `<circle cx="${x + 16}" cy="${58 + i * 17}" r="2.6" fill="${c}"/>` + T(x + 25, 61.5 + i * 17, t, { size: 8.8, fill: K.ink })).join('');
  let s = col(8, 'Real internet', K.ok, 'needs Settings → Real internet', ['weather and forecast', 'time and date', 'your public IP address', 'exchange rates, crypto prices', 'air quality, prayer times', 'earthquakes, the ISS', 'quotes, random facts', 'any web page', 'httpbin and JSON test APIs']);
  s += col(182, 'Always simulated', K.warn, 'they need your own account', ['ThingSpeak channels', 'Blynk pins', 'Telegram bot', 'IFTTT and other webhooks', 'Adafruit IO feeds', 'Slack / Discord / ntfy', 'NTP time servers', 'the MQTT broker', 'the RAPTI pages']);
  s += T(180, 222, 'Offline, or when a real service fails, the simulator answers in the same format.', { size: 9, anchor: 'middle', fill: K.line });
  return fig(360, 232, s, 'Two kinds of internet. The sketch cannot tell the difference — the same code works with both.');
};

export const mqttPubSub = () => {
  let s = SHARED;
  s += card(6, 20, 104, 78, K.ok) + T(58, 38, 'publisher', { size: 9, anchor: 'middle', fill: K.dim, weight: 700 }) + part('esp32-devkit', 16, 44, 84, 30) + T(58, 90, 'sensor node', { size: 9.5, anchor: 'middle', weight: 800, fill: K.ok });
  s += card(130, 14, 100, 90, K.vio) + cloudPath(180, 52, 0.7) + T(180, 50, 'broker', { size: 11, anchor: 'middle', weight: 800, fill: K.vio }) + T(180, 94, 'broker.hivemq.com', { size: 7.4, anchor: 'middle', fill: K.line });
  s += card(250, 8, 104, 46, K.acc) + T(302, 26, 'board 2', { size: 9.5, anchor: 'middle', weight: 800, fill: K.acc }) + T(302, 40, 'subscriber · LCD', { size: 8, anchor: 'middle', fill: K.line });
  s += card(250, 62, 104, 46, K.acc) + T(302, 80, 'dashboard', { size: 9.5, anchor: 'middle', weight: 800, fill: K.acc }) + T(302, 94, 'subscriber · IoT tab', { size: 8, anchor: 'middle', fill: K.line });
  s += AR(112, 60, 128, 60, { stroke: K.ok, m: 'mfc' }) + AR(232, 36, 248, 32, { stroke: K.acc, m: 'mfb' }) + AR(232, 78, 248, 84, { stroke: K.acc, m: 'mfb' });
  s += R(8, 120, 344, 70, { fill: INK2, stroke: LINE2, rx: 8 }) + `<text x="18" y="138" font-size="9" font-family="${MONO}" fill="#e6edf7"><tspan fill="#66789c" font-style="italic">// publisher</tspan></text><text x="18" y="152" font-size="9" font-family="${MONO}" fill="#e6edf7">mqtt.publish(<tspan fill="#c3e88d">"rapti/lab/dht"</tspan>, json);</text>` +
    `<text x="18" y="170" font-size="9" font-family="${MONO}" fill="#66789c" font-style="italic">// subscribers, once after connecting</text><text x="18" y="184" font-size="9" font-family="${MONO}" fill="#e6edf7">mqtt.subscribe(<tspan fill="#c3e88d">"rapti/lab/dht"</tspan>);</text>`;
  
  s += T(180, 206, 'The publisher and the subscribers never meet: only the broker knows them.', { size: 9, anchor: 'middle', fill: K.line });
  return fig(360, 214, s, 'MQTT in one picture. Whoever publishes to a topic, every subscriber of that topic gets the message through the broker.');
};
export const mqttTopics = () => {
  const topics = [['rapti', 'home', 'light', 'set'], ['rapti', 'home', 'light', 'state'], ['rapti', 'lab', 'dht'], ['rapti', 'lab', 'status'], ['rapti', 'demo', 'cmd']];
  const cols = [K.vio, K.vio, K.blue, K.warn];
  let s = T(8, 14, 'topics from the examples', { size: 8.8, fill: K.dim, weight: 700 });
  topics.forEach((t, i) => {
    let x = 8;
    const y = 22 + i * 23;
    t.forEach((seg, k) => {
      const w = seg.length * 6.4 + 16;
      s += R(x, y, w, 19, { fill: 'rgba(15,23,43,.95)', stroke: cols[k], rx: 9.5, sw: 1.2 }) + mono(x + w / 2, y + 13, seg, { size: 9, anchor: 'middle', fill: K.ink, weight: 700 });
      x += w;
      if (k < t.length - 1) s += T(x + 3, y + 13.5, '/', { size: 11, anchor: 'middle', fill: K.dim, weight: 800 }), x += 6;
    });
  });
  const rows = [['rapti/lab/dht', 'exactly this topic'], ['rapti/home/+/state', '+ = one level: …/light/state, …/fan/state'], ['rapti/#', '# = everything below rapti/'], ['#', 'every topic']];
  s += T(8, 152, 'filter', { size: 8.4, fill: K.dim, weight: 700 }) + T(140, 152, 'matches', { size: 8.4, fill: K.dim, weight: 700 });
  rows.forEach(([f, m], i) => { const y = 158 + i * 22; s += R(6, y, 348, 19, { fill: 'rgba(15,23,43,.9)', stroke: LINE2, rx: 7 }) + mono(14, y + 13, f, { size: 8.8, fill: '#c3e88d', weight: 700 }) + T(140, y + 13, m, { size: 8.6, fill: K.ink }); });
  return fig(360, 252, s, 'Topics are paths separated by slashes. A subscriber can use + (one level) and # (everything below) as wildcards.');
};
export const dashMqtt = () => {
  const bg = '#121a33', line = '#24304f';
  let s = R(6, 6, 348, 238, { fill: bg, stroke: line, rx: 12 }) + T(18, 26, 'MQTT', { size: 9.5, fill: '#8b9bc2', weight: 800 }) + T(340, 26, '2 clients', { size: 8.5, anchor: 'end', fill: '#8b9bc2' });
  s += T(18, 46, 'Topic', { size: 8.6, fill: '#8b9bc2', weight: 700 }) + T(190, 46, 'Last payload', { size: 8.6, fill: '#8b9bc2', weight: 700 }) + L(14, 52, 346, 52, { stroke: '#1b2745', sw: 1 });
  [['rapti/home/light/state', 'ON'], ['rapti/lab/dht', '{"t":24.5,"h":55.0}'], ['rapti/lab/status', 'online']].forEach(([t, p], i) => { s += mono(18, 68 + i * 18, t, { size: 8.6, fill: '#e5ecff' }) + mono(190, 68 + i * 18, p, { size: 8.6, fill: '#e5ecff' }) + L(14, 74 + i * 18, 346, 74 + i * 18, { stroke: '#1b2745', sw: 1 }); });
  s += R(14, 128, 120, 22, { fill: '#0b1328', stroke: line, rx: 7 }) + mono(20, 143, 'rapti/demo/cmd', { size: 8.4, fill: '#e5ecff' }) + R(140, 128, 74, 22, { fill: '#0b1328', stroke: line, rx: 7 }) + mono(146, 143, 'ON', { size: 8.4, fill: '#e5ecff' }) + R(220, 128, 70, 22, { fill: '#16335c', stroke: '#2b4d82', rx: 7 }) + T(255, 143, 'Publish', { size: 9, anchor: 'middle', fill: '#e5ecff', weight: 600 });
  s += R(14, 156, 140, 22, { fill: '#0b1328', stroke: line, rx: 7 }) + mono(20, 171, 'broker.hivemq.com', { size: 8.4, fill: '#e5ecff' }) + R(162, 160, 12, 12, { fill: '#0b1328', stroke: line, rx: 3 }) + T(180, 170, 'retain', { size: 8.5, fill: '#8b9bc2' });
  s += T(18, 196, 'Log', { size: 8.6, fill: '#8b9bc2', weight: 800 });
  [['12:04:31', 'rapti/lab/dht', '{"t":24.5,"h":55.0}', 'ESP32'], ['12:04:35', 'rapti/home/light/state', 'ON', 'ESP32'], ['12:04:36', 'rapti/demo/cmd', 'ON', 'dashboard']].forEach(([t, tp, pl, fr], i) => { s += `<text x="18" y="${210 + i * 12}" font-size="7.6" font-family="${MONO}"><tspan fill="#8b9bc2">${t}</tspan> <tspan fill="#e5ecff" font-weight="700">${tp}</tspan> <tspan fill="#e5ecff">${esc(pl)}</tspan> <tspan fill="#8b9bc2">← ${fr}</tspan></text>`; });
  s += BADGE(20, 127, 1) + BADGE(146, 127, 2) + BADGE(20, 155, 3);
  return fig(360, 252, s, 'The MQTT card of the IoT dashboard: every topic with its last payload, a box to publish a message yourself (1 topic · 2 payload · 3 broker and retain), and a log.');
};

export const jsonFlow = () => {
  const stage = (y, n, title, c, body) => card(8, y, 344, 48, c) + BADGE(24, y + 24, n) + T(40, y + 18, title, { size: 9.6, weight: 800, fill: c }) + body;
  let s = stage(8, 1, 'HTTPClient asks a web service', K.blue, mono(40, 40, 'http.begin(client, URL);  int code = http.GET();', { size: 8.4, fill: '#e6edf7' }));
  s += AR(180, 57, 180, 68, { stroke: K.line });
  s += stage(70, 2, 'Text comes back (JSON)', K.warn, mono(40, 102, '{"current":{"us_aqi":42,"pm2_5":9.8}}', { size: 9, fill: '#fcd34d' }));
  s += AR(180, 119, 180, 130, { stroke: K.line });
  s += stage(132, 3, 'ArduinoJson pulls out the numbers', K.ok, `<text x="40" y="164" font-size="8.6" font-family="${MONO}" fill="#e6edf7">deserializeJson(doc, http.getString());</text>`);
  s += `<text x="40" y="176" font-size="8.6" font-family="${MONO}" fill="#e6edf7">int aqi = doc[<tspan fill="#fcd34d">"current"</tspan>][<tspan fill="#fcd34d">"us_aqi"</tspan>];</text>`;
  s += AR(180, 181, 180, 192, { stroke: K.line });
  s += stage(194, 4, 'Show it', K.acc, mono(40, 226, 'lcd.print("AQI "); lcd.print(aqi);   // AQI 42', { size: 8.4, fill: '#e6edf7' }));
  return fig(360, 250, s, 'A live-data sketch in four steps: ask, receive text, take out the numbers, show them.');
};
// ---------------------------------------------------------------------------------------------- master and slave
const miniBoard = (x, y, w, h, title, sub, c) => R(x, y, w, h, { fill: '#0c6f73', stroke: c, rx: 7, sw: 1.4 }) + T(x + w / 2, y + 13, title, { size: 8.6, anchor: 'middle', weight: 800, fill: '#eafcff' }) + (sub ? T(x + w / 2, y + 24, sub, { size: 7.4, anchor: 'middle', fill: '#bdeff2' }) : '');
export const msRoles = () => {
  const cw = 114, gap = 7;
  let s = '';
  // UART
  let x = 4;
  s += card(x, 6, cw, 168, K.ok) + T(x + cw / 2, 24, 'UART', { size: 11, anchor: 'middle', weight: 800, fill: K.ok }) + T(x + cw / 2, 36, 'Serial · 2 wires', { size: 8, anchor: 'middle', fill: K.line });
  s += miniBoard(x + 6, 46, 32, 64, 'A', 'master', K.ok) + miniBoard(x + cw - 38, 46, 32, 64, 'B', 'slave', K.ok);
  s += A.wireSvg([[x + 38, 76], [x + cw - 38, 96]], WC.green, { w: 2 }) + A.wireSvg([[x + 38, 96], [x + cw - 38, 76]], WC.blue, { w: 2 });
  s += T(x + 22, 92, 'TX', { size: 7.4, anchor: 'middle', fill: '#eafcff', weight: 800 }) + T(x + 22, 102, 'RX', { size: 7.4, anchor: 'middle', fill: '#eafcff', weight: 800 }) + T(x + cw - 22, 82, 'RX', { size: 7.4, anchor: 'middle', fill: '#eafcff', weight: 800 }) + T(x + cw - 22, 102, 'TX', { size: 7.4, anchor: 'middle', fill: '#eafcff', weight: 800 });
  s += T(x + cw / 2, 122, 'TX → RX', { size: 8.6, anchor: 'middle', fill: K.ink, weight: 700 }) + T(x + cw / 2, 134, 'RX ← TX', { size: 8.6, anchor: 'middle', fill: K.ink, weight: 700 }) + T(x + cw / 2, 146, 'and a common GND', { size: 8, anchor: 'middle', fill: K.line }) + T(x + cw / 2, 164, 'text lines, any style', { size: 8, anchor: 'middle', fill: K.dim });
  // I2C
  x = 4 + cw + gap;
  s += card(x, 6, cw, 168, K.blue) + T(x + cw / 2, 24, 'I²C', { size: 11, anchor: 'middle', weight: 800, fill: K.blue }) + T(x + cw / 2, 36, 'Wire · SDA + SCL', { size: 8, anchor: 'middle', fill: K.line });
  s += miniBoard(x + 30, 44, 54, 24, 'master', '', K.blue) + L(x + 12, 82, x + cw - 12, 82, { stroke: WC.blue, sw: 1.8 }) + L(x + 12, 90, x + cw - 12, 90, { stroke: WC.yellow, sw: 1.8 }) + L(x + 46, 68, x + 46, 82, { stroke: WC.blue, sw: 1.4 }) + L(x + 62, 68, x + 62, 90, { stroke: WC.yellow, sw: 1.4 });
  [[16, '8'], [47, '9'], [78, '0x68']].forEach(([dx, a]) => { s += R(x + dx, 102, 26, 18, { fill: '#0c6f73', stroke: K.blue, rx: 5 }) + T(x + dx + 13, 114.5, a, { size: 7.6, anchor: 'middle', fill: '#eafcff', weight: 800 }) + L(x + dx + 8, 90, x + dx + 8, 102, { stroke: WC.yellow, sw: 1.2 }) + L(x + dx + 16, 82, x + dx + 16, 102, { stroke: WC.blue, sw: 1.2 }); });
  s += T(x + cw / 2, 134, 'every slave has an address', { size: 8.4, anchor: 'middle', fill: K.ink, weight: 700 }) + T(x + cw / 2, 146, 'the master calls it', { size: 8, anchor: 'middle', fill: K.line }) + T(x + cw / 2, 164, 'small packets of bytes', { size: 8, anchor: 'middle', fill: K.dim });
  // Wi-Fi
  x = 4 + 2 * (cw + gap);
  s += card(x, 6, cw, 168, K.vio) + T(x + cw / 2, 24, 'Wi-Fi + MQTT', { size: 10.5, anchor: 'middle', weight: 800, fill: K.vio }) + T(x + cw / 2, 36, 'no wires between boards', { size: 8, anchor: 'middle', fill: K.line });
  s += miniBoard(x + 6, 74, 36, 40, 'ESP32', '', K.vio) + miniBoard(x + cw - 42, 74, 36, 40, 'ESP32', '', K.vio) + cloudPath(x + cw / 2, 56, 0.55) + T(x + cw / 2, 59, 'broker', { size: 7.6, anchor: 'middle', fill: K.blue, weight: 800 });
  s += AR(x + 24, 72, x + 44, 62, { stroke: K.vio, m: 'mfa' }) + AR(x + cw - 44, 62, x + cw - 24, 72, { stroke: K.vio, m: 'mfa' });
  s += T(x + cw / 2, 134, 'publish / subscribe', { size: 8.4, anchor: 'middle', fill: K.ink, weight: 700 }) + T(x + cw / 2, 146, 'over the router', { size: 8, anchor: 'middle', fill: K.line }) + T(x + cw / 2, 164, 'boards far apart', { size: 8, anchor: 'middle', fill: K.dim });
  return fig(360, 182, s, 'Three ways for boards to work together. The lab\'s master – slave examples use UART and I²C; the Wi-Fi way is shown by the two-ESP32 example.');
};

const pinChip = (x, y, text, c, anchor = 'start') => { const w = text.length * 5.4 + 10; const x0 = anchor === 'start' ? x : x - w; return R(x0, y - 9, w, 13, { fill: 'rgba(15,23,43,.95)', stroke: c, rx: 6.5, sw: 1 }) + T(x0 + w / 2, y + 0.5, text, { size: 7.8, anchor: 'middle', fill: c, weight: 800 }); };
export const uartWiring = () => {
  let s = SHARED + card(6, 6, 130, 190, K.ok) + T(71, 24, 'Master', { size: 11, anchor: 'middle', weight: 800, fill: K.ok }) + T(71, 36, 'Arduino Mega 2560', { size: 8, anchor: 'middle', fill: K.line });
  s += card(224, 6, 130, 190, K.acc) + T(289, 24, 'Slave', { size: 11, anchor: 'middle', weight: 800, fill: K.acc }) + T(289, 36, 'Arduino Uno R3', { size: 8, anchor: 'middle', fill: K.line });
  s += part('mega2560', 16, 44, 110, 52) + part('uno-r3', 234, 44, 110, 52);
  const yTx = 120, yRx = 150, yG = 180;
  s += pinChip(130, yTx, 'TX1 · D18', WC.green, 'end') + pinChip(130, yRx, 'RX1 · D19', WC.blue, 'end') + pinChip(130, yG, 'GND', '#9ca3af', 'end');
  s += pinChip(230, yTx, 'D1 · TX', WC.blue, 'start') + pinChip(230, yRx, 'D0 · RX', WC.green, 'start') + pinChip(230, yG, 'GND', '#9ca3af', 'start');
  // crossing wires
  s += wireLine([[136, yTx - 3], [156, yTx - 3], [156, yRx - 3], [218, yRx - 3]], WC.green) + wireLine([[136, yRx - 3], [172, yRx - 3], [172, yTx - 3], [218, yTx - 3]], WC.blue) + wireLine([[136, yG - 3], [218, yG - 3]], '#9ca3af');
  s += T(180, 106, 'TX → RX and RX → TX', { size: 8.6, anchor: 'middle', fill: K.ink, weight: 700 }) + T(180, 196, 'GND to GND', { size: 8.4, anchor: 'middle', fill: K.line });
  return fig(360, 206, s, 'UART wiring: the two data wires cross over (TX of one board to RX of the other) and both boards share GND. A Mega has extra ports: Serial1 uses pins 18 (TX1) and 19 (RX1).');
};
/** A wire in the editor's look through points. */
function wireLine(pts, color) { return A.wireSvg(pts, WC[color] || color, { w: 2.4 }); }

export const i2cWiring = () => {
  let s = SHARED + card(6, 6, 130, 190, K.blue) + T(71, 24, 'Master', { size: 11, anchor: 'middle', weight: 800, fill: K.blue }) + T(71, 36, 'Arduino Uno R3', { size: 8, anchor: 'middle', fill: K.line });
  s += card(224, 6, 130, 190, K.acc) + T(289, 24, 'Slave · address 8', { size: 10.5, anchor: 'middle', weight: 800, fill: K.acc }) + T(289, 36, 'Arduino Uno R3', { size: 8, anchor: 'middle', fill: K.line });
  s += part('uno-r3', 16, 44, 110, 52) + part('uno-r3', 234, 44, 110, 52);
  const ys = [120, 148, 176];
  s += pinChip(130, ys[0], 'A4 · SDA', WC.blue, 'end') + pinChip(130, ys[1], 'A5 · SCL', WC.yellow, 'end') + pinChip(130, ys[2], 'GND', '#9ca3af', 'end');
  s += pinChip(230, ys[0], 'A4 · SDA', WC.blue, 'start') + pinChip(230, ys[1], 'A5 · SCL', WC.yellow, 'start') + pinChip(230, ys[2], 'GND', '#9ca3af', 'start');
  s += wireLine([[136, ys[0] - 3], [218, ys[0] - 3]], WC.blue) + wireLine([[136, ys[1] - 3], [218, ys[1] - 3]], WC.yellow) + wireLine([[136, ys[2] - 3], [218, ys[2] - 3]], '#9ca3af');
  s += T(180, 110, 'SDA to SDA', { size: 8.6, anchor: 'middle', fill: K.ink, weight: 700 }) + T(180, 138, 'SCL to SCL', { size: 8.6, anchor: 'middle', fill: K.ink, weight: 700 }) + T(180, 166, 'GND to GND', { size: 8.6, anchor: 'middle', fill: K.ink, weight: 700 });
  return fig(360, 206, s, 'I²C wiring: SDA to SDA and SCL to SCL, straight across (no crossing, unlike UART), plus a common GND. The same two wires can reach many more slaves.');
};

export const i2cSeq = () => {
  const cols = [{ x: 70, label: 'Master', c: K.blue }, { x: 290, label: 'Slave · address 8', c: K.acc }];
  const q = sequence(cols, [
    { from: 0, to: 1, text: 'beginTransmission(8) · write(angle) · write(led)', sub: 'endTransmission() = 0 means "the slave answered"', c: K.blue },
    { from: 1, to: 1, text: 'receiveEvent() reads angle and led', c: K.acc, w: 190, dx: -40 },
    { from: 0, to: 1, text: 'Wire.requestFrom(8, 2)', sub: 'please send me two bytes', c: K.blue },
    { from: 1, to: 1, text: 'requestEvent() writes messages, angle', c: K.acc, w: 200, dx: -50 },
    { from: 1, to: 0, text: 'two bytes', sub: 'Wire.read() · Wire.read()', c: K.acc },
  ], { rowH: 44, bw: 110 });
  return fig(360, q.h, q.svg, 'One round of the I²C example. The master always starts: it writes to the slave, then asks for an answer.');
};
export const uartSeq = () => {
  const cols = [{ x: 64, label: 'Master (Mega)', c: K.ok }, { x: 296, label: 'Slave (Uno)', c: K.acc }];
  const q = sequence(cols, [
    { from: 0, to: 1, text: 'Serial1.println(level)   →   B128 ↵', sub: 'knob 0 … 255 as text', c: K.ok },
    { from: 1, to: 1, text: 'read "B", parseInt() = 128', c: K.acc, w: 170, dx: -40 },
    { from: 1, to: 1, text: 'analogWrite(LED, 128)', c: K.acc, w: 150, dx: -30 },
    { from: 1, to: 0, text: 'Serial.println("OK 128")  →  OK 128 ↵', sub: 'the reply', c: K.acc },
    { from: 0, to: 0, text: 'prints "slave says: OK 128"', c: K.warn, w: 160, dx: 40 },
  ], { rowH: 44, bw: 112 });
  return fig(360, q.h, q.svg, 'One round of the UART example: a text line goes over, the slave acts on it and answers with a text line.');
};

export const addBoard = () => {
  const pw = 112, ph = 176, xs = [6, 124, 242], y = 8;
  let s = UIDEFS;
  // 1 library
  s += phoneBox(xs[0], y, pw, ph, 12) + T(xs[0] + 8, y + 18, 'Add a part', { size: 9, weight: 800 }) + R(xs[0] + 6, y + 26, pw - 12, 14, { fill: '#0d1528', stroke: LINE2, rx: 7 }) + T(xs[0] + 12, y + 36, 'Microcontrollers', { size: 7, fill: K.acc, weight: 700 });
  ['Arduino Uno R3', 'Arduino Uno R4 WiFi', 'Arduino Mega 2560', 'ESP32 DevKit V1', 'NodeMCU ESP8266'].forEach((n, i) => { s += R(xs[0] + 6, y + 46 + i * 22, pw - 12, 18, { fill: i === 0 ? 'rgba(34,211,238,.14)' : 'rgba(15,23,43,.9)', stroke: i === 0 ? K.acc : LINE2, rx: 6 }) + T(xs[0] + 12, y + 58 + i * 22, n, { size: 7.2, fill: K.ink, weight: 600 }); });
  s += T(xs[0] + pw / 2, y + 168, '＋ → Microcontrollers', { size: 7.2, anchor: 'middle', fill: K.dim });
  // 2 dialog
  s += phoneBox(xs[1], y, pw, ph, 12) + R(xs[1] + 8, y + 34, pw - 16, 112, { fill: '#10203f', stroke: K.line, rx: 10 }) + T(xs[1] + pw / 2, y + 52, 'Add a second board?', { size: 8.6, anchor: 'middle', weight: 800 });
  ['This project already', 'has an Arduino Uno R3.', 'The new board gets its', 'own sketch: pick it at', 'the top of the Code tab.'].forEach((t, i) => { s += T(xs[1] + pw / 2, y + 68 + i * 10, t, { size: 6.6, anchor: 'middle', fill: K.line }); });
  s += btn(xs[1] + 14, y + 124, 40, 16, 'Cancel', { size: 7, fill: '#17305c' }) + btn(xs[1] + 60, y + 124, 40, 16, 'Add', { size: 7.4, fill: '#22d3ee', ink: '#04121a' });
  // 3 code tabs
  s += phoneBox(xs[2], y, pw, ph, 12) + R(xs[2] + 6, y + 8, pw - 12, 30, { fill: '#0d1528', stroke: LINE2, rx: 8 });
  s += R(xs[2] + 9, y + 11, 44, 24, { fill: 'rgba(34,211,238,.16)', stroke: K.acc, rx: 6 }) + T(xs[2] + 31, y + 21, 'Master', { size: 7, anchor: 'middle', weight: 800, fill: K.acc }) + T(xs[2] + 31, y + 30, 'Uno R3', { size: 5.8, anchor: 'middle', fill: K.line }) + R(xs[2] + 56, y + 11, 44, 24, { fill: 'none', stroke: LINE2, rx: 6 }) + T(xs[2] + 78, y + 21, 'Slave', { size: 7, anchor: 'middle', weight: 800, fill: K.ink }) + T(xs[2] + 78, y + 30, 'Uno R3', { size: 5.8, anchor: 'middle', fill: K.line }) + ico('edit', xs[2] + 100, y + 16, 10, K.dim);
  s += R(xs[2] + 6, y + 44, pw - 12, ph - 52, { fill: INK2, stroke: 'none', rx: 6 });
  ['// Slave', '#include <Wire.h>', 'void setup() {', '  Wire.begin(8);', '}'].forEach((t, i) => { s += `<text x="${xs[2] + 12}" y="${y + 60 + i * 11}" font-size="6.8" font-family="${MONO}" fill="${i === 0 ? '#66789c' : '#e6edf7'}">${esc(t)}</text>`; });
  s += AR(xs[0] + pw + 1, y + 90, xs[1] - 1, y + 90, { stroke: K.acc, m: 'mfb' }) + AR(xs[1] + pw + 1, y + 90, xs[2] - 1, y + 90, { stroke: K.acc, m: 'mfb' });
  s += T(xs[0] + pw / 2, y + ph + 16, '① pick a second board', { size: 8.6, anchor: 'middle', fill: K.ink, weight: 700 }) + T(xs[1] + pw / 2, y + ph + 16, '② confirm', { size: 8.6, anchor: 'middle', fill: K.ink, weight: 700 }) + T(xs[2] + pw / 2, y + ph + 16, '③ one tab per board', { size: 8.6, anchor: 'middle', fill: K.ink, weight: 700 });
  return fig(360, 212, s, 'Adding a second board: it gets its own sketch, shown as a second tab at the top of the Code screen.');
};
export const monitorTags = () => {
  const lines = [['', 'Master ready', K.ok], ['[Slave] ', 'Slave #8 listening', K.acc], ['', 'angle 90 led 0 > slave: 1 msgs, servo 90', K.ok], ['', 'angle 142 led 1 > slave: 2 msgs, servo 142', K.ok]];
  let s = R(8, 8, 344, 22, { fill: '#0d1528', stroke: LINE2, rx: 10 }) + ico('terminal', 16, 12, 14, K.acc) + T(36, 23, 'Serial · Monitor', { size: 9, fill: K.ink, weight: 700 }) + R(8, 36, 344, 96, { fill: INK2, stroke: LINE2, rx: 10 });
  lines.forEach(([tag, t, c], i) => { s += `<text x="18" y="${58 + i * 20}" font-size="8.8" font-family="${MONO}" xml:space="preserve" style="white-space:pre"><tspan fill="#fcd34d" font-weight="700">${esc(tag)}</tspan><tspan fill="${c === K.ok ? '#a3e635' : '#7dd3fc'}">${esc(t)}</tspan></text>`; });
  s += T(180, 150, 'The first board prints plainly; every other board is tagged with its name.', { size: 8.6, anchor: 'middle', fill: K.line });
  s += T(180, 164, 'What you type in the send box goes to the first board.', { size: 8.6, anchor: 'middle', fill: K.line });
  return fig(360, 172, s, 'One Serial Monitor for all boards. Lines of the other boards start with their name in square brackets.');
};
export const twoMqtt = () => {
  let s = SHARED;
  s += card(6, 8, 98, 150, K.ok) + T(55, 26, 'Sensor node', { size: 10, anchor: 'middle', weight: 800, fill: K.ok }) + part('esp32-devkit', 12, 34, 86, 34) + part('dht22', 33, 78, 44, 52) + T(55, 148, 'DHT22 on D4', { size: 7.8, anchor: 'middle', fill: K.line });
  s += card(256, 8, 98, 150, K.acc) + T(305, 26, 'Display node', { size: 10, anchor: 'middle', weight: 800, fill: K.acc }) + part('esp32-devkit', 262, 34, 86, 34) + part('lcd-i2c', 264, 78, 82, 56) + T(305, 148, 'LCD on D21 / D22', { size: 7.8, anchor: 'middle', fill: K.line });
  s += cloudPath(180, 60, 0.7) + T(180, 58, 'broker', { size: 9.5, anchor: 'middle', weight: 800, fill: K.blue }) + T(180, 70, 'hivemq', { size: 7, anchor: 'middle', fill: K.line });
  s += AR(106, 66, 142, 62, { stroke: K.ok, m: 'mfc' }) + AR(218, 62, 254, 66, { stroke: K.acc, m: 'mfb' });
  s += T(124, 50, 'publish', { size: 7.4, anchor: 'middle', fill: K.ok, weight: 700 }) + T(236, 50, 'subscribe', { size: 7.4, anchor: 'middle', fill: K.acc, weight: 700 });
  s += R(118, 100, 124, 44, { fill: INK2, stroke: LINE2, rx: 8 }) + mono(180, 117, 'rapti/node1/climate', { size: 7.4, anchor: 'middle', fill: '#c3e88d' }) + mono(180, 133, '"24.5,55.0"', { size: 8.4, anchor: 'middle', fill: '#fcd34d' });
  s += T(180, 176, 'No wire between the two boards — only Wi-Fi and the broker.', { size: 9, anchor: 'middle', fill: K.line });
  return fig(360, 186, s, 'The two-ESP32 example. The sensor node publishes "temperature,humidity" to one topic; the display node subscribes to it and writes the numbers on its LCD.');
};
// ============================================================================================ A8 · boards, pins, reference
const BOARD_ORDER = ['uno-r3', 'uno-r4-minima', 'uno-r4-wifi', 'leonardo', 'nano', 'mega2560', 'esp32-devkit', 'nodemcu-esp8266', 'stm32-bluepill', 'attiny85'];
const BOARD_SHORT = { 'uno-r3': 'Uno R3', 'uno-r4-minima': 'Uno R4 Minima', 'uno-r4-wifi': 'Uno R4 WiFi', leonardo: 'Leonardo', nano: 'Nano', mega2560: 'Mega 2560', 'esp32-devkit': 'ESP32 DevKit', 'nodemcu-esp8266': 'NodeMCU', 'stm32-bluepill': 'Blue Pill', attiny85: 'ATtiny85' };
const FAMILY_C = { avr: K.ok, arm: K.blue, xtensa: K.vio };
const kb = (n) => (n >= 1048576 ? f1(n / 1048576) + ' MB' : n >= 102400 ? Math.round(n / 1024) + ' KB' : n >= 1024 ? f1(n / 1024) + ' KB' : n + ' B');

export const boardsHero = () => {
  const cw = 176, ch = 76, gap = 4;
  let s = SHARED;
  BOARD_ORDER.forEach((t, i) => {
    const d = getDef(t), b = d.board, x = gap + (i % 2) * (cw + gap), y = gap + Math.floor(i / 2) * (ch + gap), c = FAMILY_C[b.arch] || K.line;
    s += R(x, y, cw, ch, { fill: 'rgba(15,23,43,.9)', stroke: LINE2, rx: 10 }) + part(t, x + 6, y + 8, 86, 60);
    s += T(x + 98, y + 18, BOARD_SHORT[t], { size: 9.4, weight: 800, fill: K.ink }) + T(x + 98, y + 31, `${b.mhz} MHz · ${b.vcc} V`, { size: 8.4, fill: c, weight: 700 }) + T(x + 98, y + 43, `flash ${kb(b.flash)}`, { size: 8, fill: K.line }) + T(x + 98, y + 54, `RAM ${kb(b.ram)}`, { size: 8, fill: K.line });
    if (b.wifi) s += R(x + 98, y + 59, 44, 12, { fill: 'rgba(34,197,94,.18)', stroke: K.ok, rx: 6, sw: 1 }) + T(x + 120, y + 68, 'Wi-Fi', { size: 7.4, anchor: 'middle', fill: K.ok, weight: 800 });
  });
  const ly = 4 + 5 * (ch + gap) + 10;
  s += `<circle cx="20" cy="${ly - 3}" r="4" fill="${K.ok}"/>` + T(30, ly, 'AVR', { size: 8.6, fill: K.line }) + `<circle cx="70" cy="${ly - 3}" r="4" fill="${K.blue}"/>` + T(80, ly, 'Arm', { size: 8.6, fill: K.line }) + `<circle cx="120" cy="${ly - 3}" r="4" fill="${K.vio}"/>` + T(130, ly, 'Espressif (Xtensa)', { size: 8.6, fill: K.line });
  return fig(360, ly + 10, s, 'The ten boards of the lab, with the data the app knows about them (tap the board name at the top of the editor to see it for your project).');
};

export const logicLevels = () => {
  const col = (x, title, v, c, names) => card(x, 6, 172, 92, c) + T(x + 86, 24, title, { size: 11, anchor: 'middle', weight: 800, fill: c }) +
    R(x + 10, 34, 40, 46, { fill: 'rgba(15,23,43,.95)', stroke: c, rx: 6 }) + T(x + 30, 54, 'HIGH', { size: 8.4, anchor: 'middle', weight: 800, fill: c }) + T(x + 30, 68, v, { size: 11, anchor: 'middle', weight: 800, fill: K.ink }) +
    names.map((n, i) => T(x + 60, 44 + i * 11.5, n, { size: 8.2, fill: K.ink })).join('');
  let s = col(6, '5 V boards', '5 V', K.ok, ['Uno R3 · Nano', 'Mega · Leonardo', 'Uno R4 Minima / WiFi', 'ATtiny85']) + col(182, '3.3 V boards', '3.3 V', K.blue, ['ESP32 DevKit V1', 'NodeMCU ESP8266', 'STM32 Blue Pill']);
  const row = (y, ok, a, b, c) => R(6, y, 348, 34, { fill: 'rgba(15,23,43,.9)', stroke: c, rx: 9 }) + T(24, y + 21, ok ? '✓' : '✗', { size: 15, anchor: 'middle', weight: 800, fill: c }) + T(40, y + 15, a, { size: 9.2, weight: 800, fill: K.ink }) + T(40, y + 27, b, { size: 8.2, fill: K.line });
  s += row(108, true, 'a 3.3 V output into a 5 V pin', 'reads HIGH, because anything above 3 V counts as HIGH', K.ok);
  s += row(146, false, 'a 5 V output into a 3.3 V pin', 'damages the pin: the app says "burned out" (HC-SR04 ECHO, 5 V modules)', K.err);
  s += row(184, true, 'the fix: a voltage divider  1 kΩ + 2 kΩ', '5 V × 2 / (1 + 2) = 3.3 V  — or power the module from 3V3', K.ok);
  return fig(360, 226, s, 'Logic level = the voltage that means HIGH. Never put the 5 V of an Uno-type module onto the pin of a 3.3 V board.');
};

export const memoryChart = () => {
  const data = BOARD_ORDER.map((t) => ({ ...getDef(t).board, t })).map((b) => ({ n: BOARD_SHORT[b.t], f: b.flash / 1024, r: b.ram / 1024, a: b.arch }));
  const mk = (title, key, y0) => {
    const sorted = [...data].sort((a, b) => a[key] - b[key]);
    const x0 = 100, w = 220, lo = Math.log10(0.4), hi = Math.log10(2000);
    let s = T(8, y0, title, { size: 10, weight: 800, fill: K.warn });
    [1, 10, 100, 1000].forEach((v) => { const x = x0 + ((Math.log10(v) - lo) / (hi - lo)) * w; s += L(x, y0 + 6, x, y0 + 6 + sorted.length * 15, { stroke: 'rgba(148,163,184,.16)', sw: 1 }) + T(x, y0 + 16 + sorted.length * 15, v >= 1000 ? '1 MB' : v + ' KB', { size: 7.4, anchor: 'middle', fill: K.dim }); });
    sorted.forEach((d, i) => {
      const y = y0 + 8 + i * 15, bw = ((Math.log10(d[key]) - lo) / (hi - lo)) * w, c = FAMILY_C[d.a];
      s += T(x0 - 6, y + 8.4, d.n, { size: 8, anchor: 'end', fill: K.ink }) + R(x0, y + 1, Math.max(3, bw), 10, { fill: c, stroke: 'none', rx: 3 }).replace('<rect', '<rect fill-opacity=".85"') + T(x0 + Math.max(3, bw) + 5, y + 9, kb(d[key] * 1024), { size: 7.6, fill: K.line });
    });
    return s;
  };
  return fig(360, 378, mk('Flash — where your sketch lives', 'f', 14) + mk('RAM — where the variables live', 'r', 202), 'Memory of the boards on a log scale (each gridline is ten times more). An Uno has 2 KB of RAM; an ESP32 has about 320 KB.');
};

/** A board drawn big, with coloured rings round the pins that have a job. spec: { pinId: [colours…] } */
function pinout({ type, spec, w = 352, h = 220, y = 26, labels = {}, legend = [], gpio = null, adc = null, cap, extraH = 0, r0 = 5.4, rs = 2.8 }) {
  const pf = partFit(type, (360 - w) / 2, y, w, h, {}, 0);
  let s = SHARED + pf.svg;
  Object.entries(spec).forEach(([id, cols]) => {
    const [x, yy] = pf.at(id);
    cols.forEach((c, i) => { s += `<circle cx="${f1(x)}" cy="${f1(yy)}" r="${f1(r0 + i * rs)}" fill="none" stroke="${c.c || c}" stroke-width="2"${c.dash ? ' stroke-dasharray="2.5 2"' : ''}/>`; });
  });
  if (gpio) Object.entries(gpio).forEach(([id, n]) => { const [x, yy] = pf.at(id); s += T(x, yy + 22, String(n), { size: 8.6, anchor: 'middle', fill: K.acc, weight: 800 }); });
  if (adc) { const [x, yy] = pf.at(adc); s += T(x + 2, yy - 10, 'ADC', { size: 7.6, anchor: 'middle', fill: C_ADC, weight: 800 }); }
  const ly = y + h + 14 + extraH;
  let lx = 8, row = 0;
  legend.forEach(([t, c]) => { const wd = t.length * 5 + 22; if (lx + wd > 356) { lx = 8; row++; } s += `<circle cx="${lx + 5}" cy="${ly + row * 16 - 3}" r="4.6" fill="none" stroke="${c}" stroke-width="2"/>` + T(lx + 14, ly + row * 16, t, { size: 8.2, fill: K.ink }); lx += wd; });
  return fig(360, ly + row * 16 + 12, s + (labels.title ? T(8, 16, labels.title, { size: 10, weight: 800, fill: K.dim }) : ''), cap);
}
const C_PWM = '#f97316', C_INT = '#f87171', C_UART = '#facc15', C_SPI = '#c4b5fd', C_I2C = '#60a5fa', C_ADC = '#4ade80', C_DAC = '#f472b6';

export const unoPinout = () => {
  const spec = {};
  const add = (id, c) => { (spec[id] = spec[id] || []).push(c); };
  ['D3', 'D5', 'D6', 'D9', 'D10', 'D11'].forEach((p) => add(p, C_PWM));
  ['D2', 'D3'].forEach((p) => add(p, C_INT));
  ['D0', 'D1'].forEach((p) => add(p, C_UART));
  ['D10', 'D11', 'D12', 'D13'].forEach((p) => add(p, C_SPI));
  ['A4', 'A5', 'SDA', 'SCL'].forEach((p) => add(p, C_I2C));
  ['A0', 'A1', 'A2', 'A3', 'A4', 'A5'].forEach((p) => add(p, C_ADC));
  return pinout({ type: 'uno-r3', spec, y: 22, h: 232, labels: { title: 'Arduino Uno R3' }, legend: [['PWM (~)', C_PWM], ['interrupt', C_INT], ['UART', C_UART], ['SPI', C_SPI], ['I²C', C_I2C], ['analog in', C_ADC]], cap: 'The Uno with its pin jobs ringed. D3 is PWM and an interrupt; D10 – D13 are SPI (and D13 has the L LED); A4 / A5 are analog and I²C.' });
};
export const esp32Pinout = () => {
  const spec = {};
  const add = (id, c) => { (spec[id] = spec[id] || []).push(c); };
  ['VP', 'VN', 'D34', 'D35', 'D32', 'D33', 'D25', 'D26', 'D27', 'D14', 'D12', 'D13', 'D4', 'D2', 'D15'].forEach((p) => add(p, C_ADC));
  ['VP', 'VN', 'D34', 'D35'].forEach((p) => add(p, { c: '#ffffff', dash: true }));
  ['D21', 'D22'].forEach((p) => add(p, C_I2C));
  ['D23', 'D19', 'D18', 'D5'].forEach((p) => add(p, C_SPI));
  ['TX0', 'RX0', 'TX2', 'RX2'].forEach((p) => add(p, C_UART));
  ['D25', 'D26'].forEach((p) => add(p, C_DAC));
  return pinout({ type: 'esp32-devkit', spec, y: 24, h: 134, labels: { title: 'ESP32 DevKit V1' }, legend: [['analog in (ADC)', C_ADC], ['input only (white)', '#ffffff'], ['I²C', C_I2C], ['SPI', C_SPI], ['UART', C_UART], ['DAC', C_DAC]], cap: 'The ESP32 DevKit. Any output pin can do PWM and any pin can take an interrupt. GPIO 34, 35, 36 (VP) and 39 (VN) can only read.' });
};
export const nodeMcuPinout = () => {
  const spec = {};
  const add = (id, c) => { (spec[id] = spec[id] || []).push(c); };
  ['D1', 'D2'].forEach((p) => add(p, C_I2C));
  ['D5', 'D6', 'D7', 'D8'].forEach((p) => add(p, C_SPI));
  ['RX', 'TX'].forEach((p) => add(p, C_UART));
  add('A0', C_ADC);
  return pinout({ type: 'nodemcu-esp8266', spec, y: 34, h: 132, extraH: 22, labels: { title: 'NodeMCU ESP8266' }, gpio: { D0: 16, D1: 5, D2: 4, D3: 0, D4: 2, D5: 14, D6: 12, D7: 13, D8: 15, RX: 3, TX: 1 }, adc: 'A0', legend: [['I²C', C_I2C], ['SPI', C_SPI], ['UART', C_UART], ['analog in', C_ADC], ['blue numbers = GPIO', K.acc]], cap: 'NodeMCU: the printed D numbers are not the GPIO numbers. D1 is GPIO 5, D2 is GPIO 4, D4 is GPIO 2 (the on-board LED). The blue numbers below the pins show the GPIO.' });
};

export const unoMatrix = () => {
  const cols = [['PWM', C_PWM], ['INT', C_INT], ['ADC', C_ADC], ['UART', C_UART], ['SPI', C_SPI], ['I²C', C_I2C]];
  const rows = [
    ['D0', [3], 'RX · USB'], ['D1', [3], 'TX · USB'], ['D2', [1], 'interrupt 0'], ['D3', [0, 1], 'interrupt 1'], ['D4', [], ''], ['D5', [0], ''], ['D6', [0], ''], ['D7', [], ''], ['D8', [], ''],
    ['D9', [0], ''], ['D10', [0, 4], 'SS'], ['D11', [0, 4], 'MOSI'], ['D12', [4], 'MISO'], ['D13', [4], 'SCK · LED "L"'],
    ['A0', [2], ''], ['A1', [2], ''], ['A2', [2], ''], ['A3', [2], ''], ['A4', [2, 5], 'SDA'], ['A5', [2, 5], 'SCL'],
  ];
  const x0 = 56, cw = 32, y0 = 30, rh = 17;
  let s = T(8, 16, 'pin', { size: 8.6, fill: K.dim, weight: 800 });
  cols.forEach(([n, c], i) => { s += R(x0 + i * cw + 2, 4, cw - 4, 18, { fill: 'rgba(15,23,43,.95)', stroke: c, rx: 6, sw: 1.1 }) + T(x0 + i * cw + cw / 2, 16, n, { size: 8, anchor: 'middle', weight: 800, fill: c }); });
  s += T(x0 + 6 * cw + 8, 16, 'name', { size: 8.6, fill: K.dim, weight: 800 });
  rows.forEach(([n, on, note], r) => {
    const y = y0 + r * rh;
    s += (r % 2 ? '' : `<rect x="4" y="${y - 1}" width="352" height="${rh}" rx="4" fill="rgba(148,163,184,.07)"/>`) + T(10, y + 12, n, { size: 9.4, weight: 800, fill: K.ink });
    on.forEach((k) => { s += `<circle cx="${x0 + k * cw + cw / 2}" cy="${y + 7.5}" r="5" fill="${cols[k][1]}"/>`; });
    s += T(x0 + 6 * cw + 8, y + 11.5, note, { size: 8, fill: K.line });
    if (r === 13) s += L(4, y + rh - 1, 356, y + rh - 1, { stroke: K.dim, sw: 0.8, dash: '2 3' });
  });
  return fig(360, y0 + rows.length * rh + 8, s, 'Every pin of the Uno and what it can do. All of D0 – D13 can be digital inputs and outputs; A0 – A5 can too.');
};
export const megaPinout = () => {
  const spec = {};
  const add = (id, c) => { (spec[id] = spec[id] || []).push(c); };
  const P0 = '#facc15', P1 = '#f97316', P2 = '#4ade80', P3 = '#60a5fa', SPI = C_SPI, I2C = '#f472b6';
  ['D0', 'D1'].forEach((p) => add(p, P0)); ['D18', 'D19'].forEach((p) => add(p, P1)); ['D16', 'D17'].forEach((p) => add(p, P2)); ['D14', 'D15'].forEach((p) => add(p, P3));
  ['D50', 'D51', 'D52', 'D53'].forEach((p) => add(p, SPI)); ['D20', 'D21'].forEach((p) => add(p, I2C));
  return pinout({ type: 'mega2560', spec, y: 24, h: 150, r0: 3.4, rs: 1.9, labels: { title: 'Arduino Mega 2560' }, legend: [['Serial 0 · 1 (USB)', P0], ['Serial1 · 19 / 18', P1], ['Serial2 · 17 / 16', P2], ['Serial3 · 15 / 14', P3], ['I²C · 20 SDA, 21 SCL', I2C], ['SPI · 50 – 53', SPI]], cap: 'The Mega has four serial ports. Serial1 (RX 19, TX 18) is the one the master – slave example uses. Its I²C pins are 20 and 21, not A4 / A5.' });
};

/** Part sheets of the catalogue: one picture per group of categories. */
export const sheetBasic = () => partSheet([
  ['resistor', 'Resistor', 'value in Ω', {}, K.warn], ['capacitor', 'Capacitor', 'ceramic', {}, K.warn], ['capacitor-elec', 'Electrolytic cap', 'has polarity', {}, K.warn], ['diode', 'Diode 1N4007', 'A → K', {}, K.warn],
  ['zener', 'Zener 5.1 V', 'A → K', {}, K.warn], ['npn', 'NPN 2N2222', 'E · B · C', {}, K.warn], ['pnp', 'PNP 2N2907', 'E · B · C', {}, K.warn], ['mosfet', 'N-MOSFET IRF520', 'G · D · S', {}, K.warn],
], { cap: 'Basic & Passive: the small parts of every circuit. A transistor or a MOSFET lets a pin switch a bigger load.' });
export const sheetOutput = () => partSheet([
  ['led', 'LED', 'A (long) · C', {}, K.err], ['rgb-led', 'RGB LED', 'R · COM · G · B', {}, K.err], ['lamp', 'Light bulb', '12 V · 2 W', {}, K.err], ['buzzer', 'Buzzer', 'active / passive', {}, K.err],
  ['led-bar', 'LED bar (10)', 'A1–A10 · C1–C10', {}, K.err], ['neopixel', 'NeoPixel', 'DIN · VCC · GND', {}, K.err], ['seven-segment', '7-segment', 'A–G · DP · COM', {}, K.vio], ['lcd1602', 'LCD 16×2', '16 pins', {}, K.vio],
  ['lcd-i2c', 'LCD I²C', 'SDA · SCL', {}, K.vio], ['oled-ssd1306', 'OLED 0.96"', 'SDA · SCL', {}, K.vio], ['tm1637', 'TM1637', 'CLK · DIO', {}, K.vio], ['max7219', 'MAX7219 8×8', 'DIN · CS · CLK', {}, K.vio],
], { cap: 'LEDs and output (red) and displays (violet).' });
export const sheetInput = () => partSheet([
  ['pushbutton', 'Push button', 'press = join', {}, K.acc], ['slide-switch', 'Slide switch', 'SPDT', {}, K.acc], ['toggle-switch', 'Toggle switch', 'ON / OFF', {}, K.acc], ['potentiometer', 'Potentiometer', 'GND · SIG · VCC', {}, K.acc],
  ['slide-pot', 'Slide pot', 'GND · SIG · VCC', {}, K.acc], ['keypad-4x4', 'Keypad 4×4', '8 pins', {}, K.acc], ['keypad-4x3', 'Keypad 4×3', '7 pins', {}, K.acc], ['joystick', 'Joystick', 'X · Y · SW', {}, K.acc],
  ['rotary-encoder', 'Rotary encoder', 'CLK · DT · SW', {}, K.acc], ['touch-sensor', 'Touch TTP223', 'SIG', {}, K.acc], ['tilt-switch', 'Tilt switch', '2 pins', {}, K.acc], ['ir-receiver', 'IR receiver', '+ 21-key remote', {}, K.acc],
], { cap: 'Input & Controls: everything you can press, turn or touch. The sensors have their own pictures in chapter A6.' });
export const sheetMotors = () => partSheet([
  ['servo', 'Servo SG90', 'GND · V+ · PWM', {}, K.ok], ['dc-motor', 'DC motor', '2 pins', {}, K.ok], ['stepper-28byj', '28BYJ-48 + ULN2003', 'IN1 – IN4', {}, K.ok], ['stepper-a4988', 'NEMA17 + A4988', 'STEP · DIR · EN', {}, K.ok],
  ['relay', 'Relay module', 'IN · COM · NO · NC', {}, K.ok], ['l298n', 'L298N driver', '2 motors', {}, K.ok], ['74hc595', '74HC595', 'shift register', {}, K.blue], ['mcp3008', 'MCP3008', '8-ch ADC (SPI)', {}, K.blue],
], { cap: 'Motors and actuators (green) and the two ICs of the lab (blue).' });
export const sheetPower = () => partSheet([
  ['breadboard', 'Breadboard 830', 'full', {}, K.warn], ['breadboard-half', 'Breadboard 400', 'half', {}, K.warn], ['breadboard-mini', 'Breadboard 170', 'mini', {}, K.warn], ['battery-9v', '9 V battery', '− · +', {}, K.err],
  ['battery-aa4', '4×AA pack', '6 V', {}, K.err], ['power-supply', 'DC supply', 'adjustable', {}, K.err], ['voltmeter', 'Multimeter (V)', 'COM · V', {}, K.dim], ['ammeter', 'Ammeter (mA)', 'in series', {}, K.dim],
], { cap: 'Power & Breadboards (yellow, red) and Measurement (grey).' });

// ---------------------------------------------------------------------------------------------- troubleshooting
export const troubleFlow = () => {
  const steps = [
    ['Press Run. Does the button turn into Stop and a green status bar appear?', 'no: the Code tab opened with a red bar — read the line it marks, fix it, Run again', K.err],
    ['Does the ⚠ pill show a number?', 'yes: tap it. The messages name the pin and the problem', K.warn],
    ['Put Serial.println("loop"); into loop(). Does it print?', 'no: the sketch stopped (Runtime error in the Monitor) or waits in a long delay() / while loop', K.blue],
    ['Do the pin numbers in the sketch match the wires?', 'compare the name on the board strip (D13, A0 …) with the number in the code', K.acc],
    ['Does every part have VCC and GND?', 'sensors and modules do nothing without power; all GND must be joined', K.ok],
  ];
  const wrap = (t, n) => { const w = t.split(' '); const out = []; let l = ''; w.forEach((x) => { if ((l + ' ' + x).trim().length > n) { out.push(l); l = x; } else l = (l + ' ' + x).trim(); }); out.push(l); return out; };
  let s = '';
  steps.forEach(([q, a, c], i) => {
    const y = 6 + i * 70;
    s += R(6, y, 348, 62, { fill: 'rgba(15,23,43,.92)', stroke: c, rx: 12, sw: 1.3 }) + BADGE(24, y + 31, i + 1);
    const ql = wrap(q, 52);
    ql.forEach((l, k) => { s += T(40, y + 17 + k * 11, l, { size: 9, weight: 800, fill: K.ink }); });
    wrap(a, 62).forEach((l, k) => { s += T(40, y + 31 + (ql.length - 1) * 11 + k * 10, l, { size: 8.2, fill: c === K.err ? '#fca5a5' : K.line }); });
    if (i < steps.length - 1) s += AR(24, y + 63, 24, y + 69, { stroke: K.line });
  });
  return fig(360, 6 + steps.length * 70, s, 'When nothing seems to happen, go through these five questions in order. Most problems are found by the first three.');
};

export const ledChecklist = () => {
  const X = 10;
  return bench({
    cols: [3, 25], board: { pins: ['D13', 'GND.1'] }, gapDown: 30,
    parts: [{ id: 'r', type: 'resistor', props: { value: 220 }, pin: '1', hole: `e${X}` }, { id: 'd', type: 'led', props: { color: 'red' }, pin: 'A', hole: `c${X + 4}` }],
    wires: [{ a: 'R/D13', b: `B/a${X}`, color: 'green' }, { a: `B/d${X + 5}`, b: tnr(X + 6), color: 'black', pts: ({ from }) => [[from[0] + 10, from[1]]] }, { a: 'R/GND.1', b: tnr(21), color: 'black' }],
    badges: [{ at: `B/e${X + 2}`, n: 2, dx: 0, dy: 16 }, { at: `B/c${X + 4}`, n: 3, dx: -17, dy: -14 }, { at: `B/d${X + 5}`, n: 4, dx: 19, dy: 8 }],
    over: ({ s, stripX, yStrip }) => [['D13', 1], ['GND.1', 5]].map(([id, n]) => `<circle cx="${f1(stripX(id) + 24 / s)}" cy="${f1(yStrip + 13)}" r="${f1(8 / s)}" fill="${K.acc}"/><text x="${f1(stripX(id) + 24 / s)}" y="${f1(yStrip + 13 + 3.7 / s)}" font-size="${f1(10.5 / s)}" font-weight="800" fill="#04121a" text-anchor="middle">${n}</text>`).join(''),
    bands: [X + 4, X + 5], cap: 'The LED does not light? 1 right pin in the sketch · 2 a resistor in the path · 3 the LED the right way round: long leg (anode) towards the pin · 4 the short leg (cathode) to GND · 5 GND of the board to the − rail.',
  });
};

// ---------------------------------------------------------------------------------------------- gestures & keys
const fingerDot = (x, y, c = K.acc) => `<circle cx="${x}" cy="${y}" r="8" fill="rgba(255,255,255,.26)" stroke="${c}" stroke-width="1.6"/>`;
export const gestureSheet = () => {
  const cells = [
    ['Tap a part', 'selects it, the action bar appears', (x, y) => R(x + 14, y + 22, 40, 26, { fill: K.box2, stroke: K.line, rx: 5 }) + fingerDot(x + 34, y + 34) + `<circle cx="${x + 34}" cy="${y + 34}" r="15" fill="none" stroke="${K.acc}" stroke-width="1" stroke-dasharray="2 3"/>`],
    ['Tap pin, tap pin', 'draws a wire between them', (x, y) => `<circle cx="${x + 14}" cy="${y + 46}" r="4" fill="${K.line}"/><circle cx="${x + 56}" cy="${y + 20}" r="4" fill="${K.line}"/>` + P(`M${x + 14} ${y + 46} C${x + 14} ${y + 24} ${x + 56} ${y + 44} ${x + 56} ${y + 20}`, { stroke: WC.green, sw: 2.4 }) + fingerDot(x + 18, y + 52)],
    ['Press and hold', 'a part or a wire: a menu opens', (x, y) => R(x + 14, y + 26, 40, 24, { fill: K.box2, stroke: K.line, rx: 5 }) + fingerDot(x + 34, y + 38) + P(`M${x + 34} ${y + 18} A16 16 0 1 1 ${x + 33.9} ${y + 18}`, { stroke: K.warn, sw: 2, dash: '5 3' }) + R(x + 44, y + 8, 22, 28, { fill: '#10203f', stroke: K.acc, rx: 4 })],
    ['Drag a part', 'moves it, legs snap into holes', (x, y) => R(x + 10, y + 32, 28, 18, { fill: 'none', stroke: K.dim, rx: 4, dash: '3 3' }) + R(x + 34, y + 18, 28, 18, { fill: K.box2, stroke: K.line, rx: 4 }) + AR(x + 24, y + 42, x + 40, y + 28, { stroke: K.acc, m: 'mfb' }) + fingerDot(x + 48, y + 28)],
    ['Drag empty space', 'moves the view', (x, y) => `<rect x="${x + 6}" y="${y + 10}" width="60" height="46" rx="6" fill="url(#ardGrid2)" stroke="${LINE2}"/>` + AR(x + 20, y + 44, x + 52, y + 24, { stroke: K.acc, m: 'mfb' }) + fingerDot(x + 20, y + 44)],
    ['Pinch', 'zooms; or double-tap and slide', (x, y) => fingerDot(x + 22, y + 44) + fingerDot(x + 50, y + 22) + AR(x + 18, y + 48, x + 8, y + 58, { stroke: K.acc, m: 'mfb' }) + AR(x + 54, y + 18, x + 64, y + 8, { stroke: K.acc, m: 'mfb' })],
    ['Hold, then drag', 'on empty space: a selection box', (x, y) => fingerDot(x + 14, y + 14, '#3b82f6') + `<rect x="${x + 14}" y="${y + 14}" width="44" height="36" fill="rgba(59,130,246,.15)" stroke="#3b82f6" stroke-width="1.5"/>` + AR(x + 20, y + 58, x + 56, y + 58, { stroke: '#60a5fa', m: 'mfa' })],
    ['Tap a sensor', 'while running: its sliders open', (x, y) => R(x + 8, y + 8, 36, 26, { fill: '#1d4ed8', stroke: 'none', rx: 4 }) + fingerDot(x + 26, y + 22) + R(x + 6, y + 40, 60, 16, { fill: '#10203f', stroke: K.acc, rx: 8 }) + R(x + 12, y + 47, 30, 3, { fill: K.acc, stroke: 'none', rx: 1.5 }) + `<circle cx="${x + 42}" cy="${y + 48.5}" r="4" fill="#e8f9ff"/>`],
  ];
  const wrap = (t, n) => { const w = t.split(' '); const o = []; let l = ''; w.forEach((q) => { if ((l + ' ' + q).trim().length > n) { o.push(l); l = q; } else l = (l + ' ' + q).trim(); }); o.push(l); return o; };
  let s = `<defs><pattern id="ardGrid2" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="0" cy="0" r=".8" fill="rgba(148,163,184,.3)"/></pattern></defs>`;
  cells.forEach(([t, sub, draw], i) => {
    const x = 4 + (i % 2) * 178, y = 4 + Math.floor(i / 2) * 76;
    s += R(x, y, 174, 70, { fill: CANVAS, stroke: LINE2, rx: 10 }) + draw(x + 2, y + 2) + T(x + 78, y + 24, t, { size: 9.4, weight: 800, fill: K.ink }) + wrap(sub, 21).map((l, k) => T(x + 78, y + 38 + k * 11, l, { size: 8, fill: K.line })).join('');
  });
  return fig(360, 4 + 4 * 76, s, 'The eight gestures you need in the circuit view. The first six build and arrange; the last two select and play.');
};
const keycap = (x, y, t, w = 0) => { const ww = w || Math.max(26, t.length * 7 + 14); return R(x, y, ww, 24, { fill: '#17233f', stroke: '#2d3b5e', rx: 6, sw: 1.2 }) + R(x + 2, y + 2, ww - 4, 17, { fill: '#223157', stroke: 'none', rx: 4 }) + T(x + ww / 2, y + 15, t, { size: 9.4, anchor: 'middle', weight: 800, fill: K.ink }); };
export const keyCaps = () => {
  const rows = [
    [[['Ctrl', 34], ['S', 26]], 'Save the project now (a toast says "Saved")'],
    [[['Esc', 34]], 'Same as the phone\'s Back button: leave full screen, cancel a wire, deselect, go back'],
    [[['Enter', 44]], 'In the Serial send box: send the line'],
    [[['mouse wheel', 78]], 'Zoom the circuit, around the pointer'],
    [[['Ctrl', 34], ['wheel', 48]], 'Zoom (also a trackpad pinch)'],
  ];
  let s = '';
  rows.forEach(([keys, text], i) => {
    const y = 6 + i * 34;
    s += R(4, y, 352, 30, { fill: 'rgba(15,23,43,.9)', stroke: LINE2, rx: 9 });
    let x = 12;
    keys.forEach(([k, w], j) => { s += keycap(x, y + 3, k, w); x += w + 4; if (j < keys.length - 1) { s += T(x - 1, y + 19, '+', { size: 11, anchor: 'middle', fill: K.dim, weight: 800 }); x += 8; } });
    const words = text.split(' '); let line = '', out = [];
    words.forEach((w) => { if ((line + ' ' + w).length > 44) { out.push(line); line = w; } else line = (line + ' ' + w).trim(); }); out.push(line);
    out.forEach((l, k) => { s += T(128, y + 13 + k * 11 - (out.length > 1 ? 1 : -3), l, { size: 8.8, fill: K.ink }); });
  });
  return fig(360, 6 + rows.length * 34, s, 'The few keyboard shortcuts of the lab (on a computer, or a phone with a keyboard). Everything else is touch.');
};

// ---------------------------------------------------------------------------------------------- resistors and Ohm's law
const BANDC = ['#111111', '#8a4b1f', '#e01b1b', '#ff8a1f', '#ffd21f', '#1fae4b', '#1f5fe0', '#8a2be2', '#8a8a8a', '#f5f5f5'];
const BANDN = ['black', 'brown', 'red', 'orange', 'yellow', 'green', 'blue', 'violet', 'grey', 'white'];
const bandsOf = (v) => { let exp = Math.floor(Math.log10(v)) - 1; let d = Math.round(v / 10 ** exp); if (d >= 100) { d = Math.round(d / 10); exp++; } return [Math.floor(d / 10), d % 10, exp]; };
const bigResistor = (x, y, w, bands, h = 34) => {
  const bx = x + 26, bw = w - 52;
  let s = L(x, y + h / 2, x + 26, y + h / 2, { stroke: '#b8bfc9', sw: 3 }) + L(x + w - 26, y + h / 2, x + w, y + h / 2, { stroke: '#b8bfc9', sw: 3 }) + R(bx, y, bw, h, { fill: '#d8c28f', stroke: '#8a734a', rx: h / 2.4, sw: 1.2 });
  bands.forEach((c, i) => { s += `<rect x="${f1(bx + 16 + i * (bw - 44) / Math.max(1, bands.length - 1))}" y="${y + 1}" width="9" height="${h - 2}" fill="${c}" stroke="rgba(0,0,0,.25)" stroke-width=".6"/>`; });
  return s;
};
export const colorCode = () => {
  const mult = ['×1', '×10', '×100', '×1k', '×10k', '×100k', '×1M', '×10M', '×100M', '×1G'];
  let s = T(8, 14, 'digit · colour · multiplier', { size: 9.4, weight: 800, fill: K.dim });
  BANDC.forEach((c, i) => {
    const x = 6 + i * 35;
    s += R(x, 22, 31, 40, { fill: c, stroke: 'rgba(148,163,184,.4)', rx: 6, sw: 1 }) + T(x + 15.5, 46, String(i), { size: 16, anchor: 'middle', weight: 800, fill: [0, 1, 5, 6, 7].includes(i) ? '#fff' : '#111' }) + T(x + 15.5, 74, BANDN[i], { size: 7.2, anchor: 'middle', fill: K.ink, weight: 600 }) +
      T(x + 15.5, 87, mult[i], { size: 8, anchor: 'middle', fill: K.warn, weight: 800 });
  });
  s += R(6, 96, 28, 14, { fill: '#d4af37', stroke: 'none', rx: 4 }) + T(40, 107, 'gold  ×0.1 · ±5 %', { size: 8.4, fill: K.ink }) + R(150, 96, 28, 14, { fill: '#c0c0c0', stroke: 'none', rx: 4 }) + T(184, 107, 'silver  ×0.01 · ±10 %', { size: 8.4, fill: K.ink });
  const rx = 30, ry = 132, rw = 300;
  s += bigResistor(rx, ry, rw, ['#ffd21f', '#8a2be2', '#e01b1b', '#d4af37'], 40);
  const centers = [0, 1, 2, 3].map((i) => rx + 26 + 16 + i * (rw - 52 - 44) / 3 + 4.5);
  [['1st digit', 'yellow = 4', K.warn], ['2nd digit', 'violet = 7', K.vio], ['multiplier', 'red = ×100', K.err], ['tolerance', 'gold = ±5 %', '#d4af37']].forEach(([a, b, c], i) => { s += L(centers[i], ry + 40, centers[i], ry + 52, { stroke: c, sw: 1.2 }) + T(centers[i], ry + 63, a, { size: 8, anchor: 'middle', fill: c, weight: 700 }) + T(centers[i], ry + 74, b, { size: 7.6, anchor: 'middle', fill: K.line }); });
  s += T(180, 230, '4  7  × 100  =  4700 Ω  =  4.7 kΩ  (± 5 %)', { size: 11, anchor: 'middle', weight: 800, fill: K.ink });
  return fig(360, 242, s, 'The resistor colour code. Read from the end with the closest band: two digits, a multiplier, then the tolerance. Gold or silver at the end means the tolerance.');
};
export const resistorDecode = () => {
  const vals = [220, 1000, 4700, 10000, 100000];
  const fmt = (v) => (v >= 1000 ? f1(v / 1000) + ' kΩ' : v + ' Ω');
  let s = SHARED;
  vals.forEach((v, i) => {
    const y = 6 + i * 44, [d1, d2, e] = bandsOf(v);
    s += R(4, y, 352, 40, { fill: 'rgba(15,23,43,.9)', stroke: LINE2, rx: 10 }) + part('resistor', 10, y + 6, 94, 28, { value: v });
    [[d1, 0], [d2, 1], [e, 2]].forEach(([k, j]) => { s += `<circle cx="${122 + j * 52}" cy="${y + 15}" r="6" fill="${BANDC[k]}" stroke="rgba(148,163,184,.5)"/>` + T(122 + j * 52, y + 33, BANDN[k], { size: 7.6, anchor: 'middle', fill: K.line }); });
    s += T(344, y + 25, fmt(v), { size: 13, anchor: 'end', weight: 800, fill: K.warn });
  });
  return fig(360, 6 + vals.length * 44, s, 'Five common values, drawn by the lab\'s own resistor. The part in the editor shows the same bands for the value you choose.');
};
export const ohmWheel = () => {
  const cx = 180, cy = 118, R1 = 36, R2 = 108;
  const quad = [
    ['V', ['V = I × R', 'V = P ÷ I', 'V = √(P × R)'], K.warn, -135],
    ['I', ['I = V ÷ R', 'I = P ÷ V', 'I = √(P ÷ R)'], K.ok, -45],
    ['P', ['P = V × I', 'P = I² × R', 'P = V² ÷ R'], K.err, 45],
    ['R', ['R = V ÷ I', 'R = V² ÷ P', 'R = P ÷ I²'], K.acc, 135],
  ];
  const pt = (r, a) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)];
  let s = '';
  quad.forEach(([n, fs, c, mid]) => {
    const [x1, y1] = pt(R2, mid - 45), [x2, y2] = pt(R2, mid + 45), [x3, y3] = pt(R1, mid + 45), [x4, y4] = pt(R1, mid - 45);
    s += `<path d="M${f1(x1)} ${f1(y1)} A${R2} ${R2} 0 0 1 ${f1(x2)} ${f1(y2)} L${f1(x3)} ${f1(y3)} A${R1} ${R1} 0 0 0 ${f1(x4)} ${f1(y4)} Z" fill="${c}" fill-opacity=".13" stroke="${c}" stroke-width="1.4"/>`;
    const [lx, ly] = pt(24, mid), [fx, fy] = pt(76, mid);
    s += T(lx, ly + 5, n, { size: 15, anchor: 'middle', weight: 800, fill: c });
    fs.forEach((f, k) => { s += T(fx, fy - 10 + k * 14, f, { size: 9.4, anchor: 'middle', fill: K.ink, weight: 700 }); });
  });
  s += `<circle cx="${cx}" cy="${cy}" r="${R1}" fill="none" stroke="${K.line}" stroke-width="1"/>`;
  s += T(cx - 150, 24, 'V  volts  (V)', { size: 8.6, fill: K.warn, weight: 800 }) + T(cx + 150, 24, 'I  current  (A)', { size: 8.6, fill: K.ok, weight: 800, anchor: 'end' }) + T(cx + 150, 228, 'P  power  (W)', { size: 8.6, fill: K.err, weight: 800, anchor: 'end' }) + T(cx - 150, 228, 'R  resistance  (Ω)', { size: 8.6, fill: K.acc, weight: 800 });
  return fig(360, 240, s, 'Ohm\'s wheel: pick the quantity you want in a quarter and use any of its three formulas.');
};
export const ohmWorked = () => {
  const card2 = (y, h, title, c, lines) => R(6, y, 348, h, { fill: 'rgba(15,23,43,.92)', stroke: c, rx: 12, sw: 1.3 }) + T(16, y + 18, title, { size: 10, weight: 800, fill: c }) + lines.map(([t, f], i) => `<text x="16" y="${y + 36 + i * 15}" font-size="9.2" font-family="${MONO}" fill="${f || '#e6edf7'}">${esc(t)}</text>`).join('');
  let s = card2(6, 98, 'A red LED on an Uno pin (5 V)', K.err, [['R = (5 V − 2 V) ÷ 0.015 A = 200 Ω', ''], ['next standard value: 220 Ω', '#fcd34d'], ['I = 3 V ÷ 220 Ω = 13.6 mA', ''], ['P = 3 V × 13.6 mA = 41 mW: a ¼ W part is plenty', '#86efac']]);
  s += card2(112, 98, 'The same LED on an ESP32 pin (3.3 V)', K.blue, [['R = (3.3 V − 2 V) ÷ 0.010 A = 130 Ω', ''], ['next standard value: 150 Ω', '#fcd34d'], ['I = 1.3 V ÷ 150 Ω = 8.7 mA', ''], ['a little dimmer, but it shines', '#86efac']]);
  s += card2(218, 84, 'How low may the resistor be?', K.warn, [['pin limit 40 mA:  R ≥ 3 V ÷ 0.04 A = 75 Ω', ''], ['below that the app warns about the 40 mA', '#fca5a5'], ['an LED at 60 mA lasts only about 20 s', '#fca5a5']]);
  return fig(360, 312, s, 'Three worked examples. The red LED drops about 2 V; the resistor takes up the rest of the supply voltage.');
};
// @@END
