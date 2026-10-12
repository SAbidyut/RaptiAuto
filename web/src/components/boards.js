// Microcontroller boards. Header coordinates follow the real boards (10 units = 0.1").
import { register } from './registry.js';
import {
  rect, circle, text, line, path, femaleHeader, maleHeader, smdLed, chipDIP, chipQFP, mountHole, pad, g,
  silk, silkBox, smdRow, smdElec, regulator, crystal, polyfuse, via, traces, smallChip,
} from './draw.js';
import { rowArt, nanoArt, esp32Art, nodemcuArt, bluePillArt, megaDetails } from './board-art.js';

const range = (a, b) => { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; };

// ------------------------------------------------------------------ UNO form factor (R3 / R4 / Leonardo)
const UNO_TOP = [
  ['SCL', 84], ['SDA', 94], ['AREF', 104], ['GND.1', 114, 'GND'], ['D13', 124, '13'], ['D12', 134, '12'], ['D11', 144, '~11'],
  ['D10', 154, '~10'], ['D9', 164, '~9'], ['D8', 174, '8'],
  ['D7', 190, '7'], ['D6', 200, '~6'], ['D5', 210, '~5'], ['D4', 220, '4'], ['D3', 230, '~3'], ['D2', 240, '2'],
  ['D1', 250, 'TX→1'], ['D0', 260, 'RX←0'],
];
const UNO_BOTTOM = [
  ['NC', 90, ''], ['IOREF', 100], ['RESET', 110], ['3.3V', 120], ['5V', 130], ['GND.2', 140, 'GND'], ['GND.3', 150, 'GND'], ['VIN', 160, 'Vin'],
  ['A0', 190], ['A1', 200], ['A2', 210], ['A3', 220], ['A4', 230], ['A5', 240],
];
const ICSP = [['ICSP.MISO', 250, 95], ['ICSP.5V', 260, 95], ['ICSP.SCK', 250, 105], ['ICSP.MOSI', 260, 105], ['ICSP.RST', 250, 115], ['ICSP.GND', 260, 115]];

function unoPins(names = {}) {
  const pins = [];
  for (const [id, x, label] of UNO_TOP) pins.push({ id, x, y: 10, label: names[id] ?? label ?? id, socket: true });
  for (const [id, x, label] of UNO_BOTTOM) pins.push({ id, x, y: 200, label: names[id] ?? label ?? id, socket: true });
  for (const [id, x, y] of ICSP) pins.push({ id, x, y, label: id.split('.')[1], noPlug: false });
  return pins;
}

const UNO_INTERNAL = [
  ['GND.1', 'GND.2', 'GND.3', 'ICSP.GND'], ['A4', 'SDA'], ['A5', 'SCL'], ['5V', 'IOREF', 'ICSP.5V'],
  ['D12', 'ICSP.MISO'], ['D13', 'ICSP.SCK'], ['D11', 'ICSP.MOSI'], ['RESET', 'ICSP.RST'],
];

function unoLabels() {
  let s = '';
  for (const [, x, label] of UNO_TOP) {
    const l = label ?? '';
    s += text(x, 22.5, l.replace('GND', 'GND'), { size: 4.2, rot: -90, anchor: 'end', fill: '#eafcff' });
  }
  for (const [id, x, label] of UNO_BOTTOM) {
    const l = label ?? id;
    if (!l) continue;
    s += text(x, 188, l, { size: 4.2, rot: -90, anchor: 'start', fill: '#eafcff' });
  }
  s += text(120, 39, 'DIGITAL (PWM ~)', { size: 4.2, fill: '#eafcff', anchor: 'start', weight: 600 });
  // the header names (rotated, 188 → 175) are 12 units clear of these; the chip pins end at 159
  s += text(125, 170, 'POWER', { size: 4.6, fill: '#eafcff', weight: 700 });
  s += text(215, 170, 'ANALOG IN', { size: 4.6, fill: '#eafcff', weight: 700 });
  return s;
}

function unoBase(color, o = {}) {
  let s = '';
  s += `<g filter="url(#softShadow)">`;
  s += path('M3 0 H256 L270 14 V196 L262 204 V210 H3 A3 3 0 0 1 0 207 V3 A3 3 0 0 1 3 0Z', { fill: color, stroke: 'rgba(0,0,0,.4)', sw: 0.8 });
  s += `</g>`;
  // copper traces under the solder mask (kept clear of the lettering)
  s += traces('M46 92 H88 V108 H100 M104 112 H236 M60 150 H100 V158 H240 M120 30 H180 M30 186 H80') + traces('M262 36 V150', { sw: 1 });
  s += mountHole(60, 10, 3.2) + mountHole(55, 200, 3.2) + mountHole(260, 70, 3.2) + mountHole(260, 180, 3.2);
  // silkscreen outlines
  s += rect(78, 3.5, 102, 13, { stroke: '#e9fbff', sw: 0.5, rx: 1 });
  s += rect(184, 3.5, 82, 13, { stroke: '#e9fbff', sw: 0.5, rx: 1 });
  s += rect(84, 193.5, 82, 13, { stroke: '#e9fbff', sw: 0.5, rx: 1 });
  s += rect(184, 193.5, 62, 13, { stroke: '#e9fbff', sw: 0.5, rx: 1 });
  s += femaleHeader(UNO_TOP.slice(0, 10).map((p) => p[1]), 10);
  s += femaleHeader(UNO_TOP.slice(10).map((p) => p[1]), 10);
  s += femaleHeader(UNO_BOTTOM.slice(0, 8).map((p) => p[1]), 200);
  s += femaleHeader(UNO_BOTTOM.slice(8).map((p) => p[1]), 200);
  s += maleHeader(ICSP.map((p) => [p[1], p[2]]));
  s += text(255, 125, 'ICSP', { size: 4, fill: '#eafcff', weight: 700 });
  s += unoLabels();
  return s;
}

function powerJack() {
  return rect(-8, 150, 54, 38, { fill: 'url(#blackPlastic)', rx: 2 }) + rect(-8, 156, 10, 26, { fill: '#09090b' }) +
    circle(14, 169, 7, { fill: '#111214', stroke: '#2c2d31', sw: 1 }) + circle(14, 169, 2.2, { fill: '#b9bec6' });
}

function usbB() {
  return rect(-7, 30, 52, 46, { fill: 'url(#silver)', rx: 1.5, stroke: '#7b818a', sw: 0.6 }) +
    rect(-7, 39, 6, 28, { fill: '#5d636c' }) + rect(2, 36, 38, 34, { fill: 'none', stroke: '#8e949d', sw: 0.6 });
}

function usbC(y = 38) {
  return rect(-6, y, 24, 22, { fill: 'url(#silver)', rx: 4, stroke: '#7b818a', sw: 0.6 }) + rect(-6, y + 6, 6, 10, { fill: '#30343a', rx: 2 });
}

function resetButton(x, y) {
  return rect(x - 7, y - 7, 14, 14, { fill: 'url(#silver)', rx: 1.5, stroke: '#888', sw: 0.5 }) + circle(x, y, 4.2, { fill: '#c0392b', stroke: '#7d2219', sw: 0.6 });
}

function boardLeds(xL, yL, more = true) {
  let s = smdLed(xL, yL, { cls: 'led-L', color: '#ffb000', off: '#d8cfb4' }) + text(xL + 7, yL, 'L', { size: 4, anchor: 'start', fill: '#eafcff' });
  if (more) {
    s += smdLed(xL, yL + 10, { cls: 'led-TX', color: '#ffb000', off: '#d8cfb4' }) + text(xL + 7, yL + 10, 'TX', { size: 4, anchor: 'start', fill: '#eafcff' });
    s += smdLed(xL, yL + 18, { cls: 'led-RX', color: '#ffb000', off: '#d8cfb4' }) + text(xL + 7, yL + 18, 'RX', { size: 4, anchor: 'start', fill: '#eafcff' });
  }
  return s;
}

function onLed(x, y) {
  return smdLed(x, y, { cls: 'led-ON', color: '#39ff6a', off: '#cfdccf' }) + text(x - 7, y, 'ON', { size: 4, anchor: 'end', fill: '#eafcff' });
}

function smdParts(list) {
  let s = '';
  for (const [x, y, w, h, c] of list) s += rect(x, y, w, h, { fill: c || '#2b2b2b', rx: 0.4 }) + rect(x, y, 1.2, h, { fill: '#c9ccd1' }) + rect(x + w - 1.2, y, 1.2, h, { fill: '#c9ccd1' });
  return s;
}

function unoR3Art() {
  let s = unoBase('#008f95');
  s += usbB() + powerJack() + resetButton(20, 14) + silk(32, 14, 'RESET', { size: 3.2, anchor: 'start' });
  s += polyfuse(50, 36) + silk(54.5, 44, 'F1', { size: 2.6 });
  // ATmega16U2 (USB ↔ serial), its crystal, ICSP header and the passives around it
  s += chipQFP(78, 58, 18, { pins: 8, label: '16U2' });
  s += crystal(90, 73, 10, '16M');
  s += maleHeader([[56, 84], [66, 84], [56, 94], [66, 94], [56, 104], [66, 104]]) + silk(73, 94, 'ICSP', { size: 3, anchor: 'start' });
  s += smdRow([[93, 50], [93, 55], [93, 60, 'c'], [93, 65, 'c'], [99, 50, 'cv'], [99, 58, 'rv'], [105, 50, 'r'], [105, 55, 'r']]);
  // main chip, resonator, voltage regulator, electrolytics
  s += chipDIP(103, 126, 28, { label: 'ATMEGA328P-PU', h: 28, size: 6 });
  s += crystal(68, 110, 16, '16.000');
  s += circle(55, 133, 7, { fill: 'url(#silver)', stroke: '#777', sw: 0.6 }) + path('M50 128 A7 7 0 0 1 60 128', { stroke: '#222', sw: 2 });
  s += circle(55, 116, 7, { fill: 'url(#silver)', stroke: '#777', sw: 0.6 }) + path('M50 111 A7 7 0 0 1 60 111', { stroke: '#222', sw: 2 });
  s += regulator(50, 172, 'REG') + silk(56, 168, '5V', { size: 2.6 });
  s += smdRow([[108, 112, 'r'], [115, 112, 'c'], [122, 112, 'c'], [160, 112, 'r'], [168, 112, 'c'], [176, 112, 'r'], [64, 150, 'r'], [64, 155, 'r'], [72, 152, 'c'], [78, 152, 'c'], [84, 150, 'rv']]);
  s += smallChip(150, 100, 14, 6, 'M7') + smdRow([[226, 98, 'cv'], [226, 106, 'cv']]);
  s += via(100, 108) + via(236, 112) + via(84, 168) + via(240, 160);
  s += boardLeds(128, 32 + 22, true);
  s += onLed(250, 44);
  s += g(text(0, 0, '∞', { size: 30, fill: '#eafcff', weight: 700 }), { tr: 'translate(160 82)' });
  s += text(180, 74, 'UNO', { size: 24, fill: '#eafcff', weight: 800, anchor: 'start', ls: 1 });
  s += text(181, 92, 'ARDUINO', { size: 6.5, fill: '#eafcff', weight: 700, anchor: 'start', ls: 1.6 });
  s += text(181, 101, 'R3', { size: 6, fill: '#eafcff', weight: 700, anchor: 'start' });
  s += silk(18, 202, 'arduino.cc', { size: 2.8, anchor: 'start', weight: 500 });
  return s;
}

function unoR4Art(wifi) {
  let s = unoBase(wifi ? '#008a90' : '#00979d');
  s += usbC(40) + powerJack() + resetButton(30, 22) + silk(41, 22, 'RESET', { size: 3.2, anchor: 'start' });
  s += regulator(50, 172, 'REG') + silk(56, 168, '5V', { size: 2.6 }) + polyfuse(24, 68) + silk(28.5, 76, 'F1', { size: 2.6 });
  s += traces('M30 88 H90 V104 M104 112 H236 M60 150 H92 M150 36 H190') + traces('M262 36 V150', { sw: 1 });
  s += chipQFP(wifi ? 108 : 150, wifi ? 140 : 128, 32, { pins: 14, label: 'RA4M1' });
  s += crystal(wifi ? 62 : 104, wifi ? 118 : 110, 12, '16M');
  s += smdRow([[60, 90, 'r'], [60, 95, 'r'], [66, 90, 'c'], [66, 95, 'c'], [74, 90, 'rv'], [190, 150, 'r'], [198, 150, 'c'], [206, 150, 'r'], [72, 172, 'c'], [78, 172, 'c'], [84, 168, 'rv']]);
  s += smallChip(wifi ? 62 : 104, 150, 14, 6, wifi ? 'LDO' : 'EEPR');
  s += via(100, 108) + via(236, 112) + via(90, 164) + via(240, 160);
  s += boardLeds(128, 54, true);
  s += onLed(250, 44);
  if (wifi) {
    // ESP32-S3 module
    s += rect(34, 62, 46, 40, { fill: 'url(#silver)', rx: 1.5, stroke: '#7d828a', sw: 0.6 });
    s += rect(34, 62, 46, 8, { fill: '#2b5da8' }) + path('M37 66 h6 v-2 h6 v2 h6 v-2 h6 v2 h6', { stroke: '#d4a83a', sw: 1 });
    s += text(57, 84, 'ESP32-S3', { size: 4.6, fill: '#444', weight: 700 }) + text(57, 92, 'MINI-1', { size: 3.2, fill: '#666' });
    // 12x8 LED matrix
    s += rect(150, 104, 82, 56, { fill: '#0b0b0d', rx: 2 });
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 12; c++) {
        const x = 156 + c * 6.3, y = 110 + r * 6.3;
        s += rect(x - 1.6, y - 1.1, 3.2, 2.2, { fill: '#3b1414', cls: `mx mx-${r}-${c}`, rx: 0.4 });
      }
    }
    s += `<g class="mx-glow" filter="url(#glow)"></g>`;
    s += text(186, 76, 'UNO', { size: 22, fill: '#eafcff', weight: 800, anchor: 'start' });
    s += text(187, 94, 'R4 WiFi', { size: 8, fill: '#eafcff', weight: 700, anchor: 'start' });
  } else {
    s += text(180, 76, 'UNO', { size: 22, fill: '#eafcff', weight: 800, anchor: 'start' });
    s += text(181, 94, 'R4 MINIMA', { size: 7.5, fill: '#eafcff', weight: 700, anchor: 'start' });
  }
  return s;
}

function leonardoArt() {
  let s = unoBase('#00838a');
  s += rect(-6, 36, 26, 22, { fill: 'url(#silver)', rx: 2, stroke: '#7b818a', sw: 0.6 }) + rect(-6, 42, 5, 10, { fill: '#30343a' });
  s += powerJack() + resetButton(30, 16) + silk(41, 16, 'RESET', { size: 3.2, anchor: 'start' });
  s += regulator(50, 172, 'REG') + silk(56, 168, '5V', { size: 2.6 }) + polyfuse(30, 66) + silk(34.5, 74, 'F1', { size: 2.6 });
  s += traces('M30 90 H100 V108 M104 112 H236 M60 150 H92') + traces('M262 36 V150', { sw: 1 });
  s += chipQFP(150, 125, 30, { pins: 11, label: 'ATmega32U4' });
  s += crystal(108, 110, 12, '16M') + circle(66, 120, 6, { fill: 'url(#silver)', stroke: '#777', sw: 0.6 }) + path('M62 116 A6 6 0 0 1 70 116', { stroke: '#222', sw: 2 });
  s += smdRow([[72, 140, 'r'], [72, 145, 'r'], [80, 140, 'c'], [80, 145, 'c'], [190, 140, 'r'], [198, 140, 'c'], [206, 140, 'rv'], [96, 168, 'c'], [102, 168, 'r']]);
  s += via(100, 108) + via(236, 112) + via(84, 164);
  s += boardLeds(128, 54, true) + onLed(250, 44);
  s += text(180, 78, 'LEONARDO', { size: 13, fill: '#eafcff', weight: 800, anchor: 'start' });
  s += text(182, 92, 'ARDUINO', { size: 6, fill: '#eafcff', weight: 700, anchor: 'start', ls: 1.4 });
  return s;
}

const UNO_UPDATE = (el, v) => {
  const set = (cls, on) => {
    const e = el.querySelector('.' + cls + '-glow');
    if (e) e.setAttribute('opacity', on ? Math.min(1, 0.25 + on * 0.75) : 0);
    const b = el.querySelector('.' + cls);
    if (b) b.setAttribute('fill', on ? (cls === 'led-ON' ? '#5dff86' : '#ffd24a') : (cls === 'led-ON' ? '#cfdccf' : '#d8cfb4'));
  };
  set('led-L', v.L);
  set('led-TX', v.tx);
  set('led-RX', v.rx);
  set('led-ON', v.on ? 1 : 0);
  if (v.matrix && el._mx === undefined) el._mx = Array.from(el.querySelectorAll('.mx'));
  if (el._mx) {
    const m = v.matrix || [];
    el._mx.forEach((cell, i) => {
      const on = m[i];
      if (cell._on !== on) { cell._on = on; cell.setAttribute('fill', on ? '#ff3b3b' : '#3b1414'); }
    });
  }
};

const unoBoard = (extra) => ({
  arch: 'avr', mhz: 16, vcc: 5, adcBits: 10, ledBuiltin: 13,
  pinMap: Object.fromEntries([...range(0, 13).map((i) => [i, 'D' + i]), ...range(0, 5).map((i) => [14 + i, 'A' + i])]),
  analogPins: range(14, 19), analogChannelBase: 14, pwmPins: [3, 5, 6, 9, 10, 11], interruptPins: [2, 3],
  i2c: { sda: 18, scl: 19 }, spi: { mosi: 11, miso: 12, sck: 13, ss: 10 },
  gndPins: ['GND.1', 'GND.2', 'GND.3'],
  supplies: [{ pin: '5V', v: 5, r: 0.05, maxI: 0.5 }, { pin: '3.3V', v: 3.3, r: 0.4, maxI: 0.15 }, { pin: 'VIN', v: 4.6, diode: true, r: 0.2 }],
  serialPorts: ['Serial'], eeprom: 1024, ram: 2048, flash: 32256, numDigital: 20,
  rout: 25, rpull: 35000,
  ...extra,
});

register({
  type: 'uno-r3', name: 'Arduino Uno R3', category: 'boards', tags: ['arduino', 'atmega328p', 'uno'],
  description: 'ATmega328P · 5V · 16 MHz · 14 digital (6 PWM) · 6 analog',
  box: [-8, 0, 270, 210], pins: unoPins(), internal: UNO_INTERNAL, socket: true,
  board: unoBoard({ name: 'Arduino Uno R3', macros: { ARDUINO: 10819, ARDUINO_AVR_UNO: 1, ARDUINO_ARCH_AVR: 1, __AVR__: 1, __AVR_ATmega328P__: 1 } }),
  render: unoR3Art, update: UNO_UPDATE,
});

register({
  type: 'uno-r4-minima', name: 'Arduino Uno R4 Minima', category: 'boards', tags: ['arduino', 'renesas', 'ra4m1', 'uno', 'r4'],
  description: 'Renesas RA4M1 (Arm Cortex-M4) · 5V · 48 MHz · 14-bit ADC · DAC',
  box: [-8, 0, 270, 210], pins: unoPins(), internal: UNO_INTERNAL, socket: true,
  board: unoBoard({
    name: 'Arduino Uno R4 Minima', arch: 'arm', mhz: 48, ram: 32768, flash: 262144, eeprom: 8192, interruptPins: null,
    serialPorts: ['Serial', 'Serial1'], rout: 30,
    macros: { ARDUINO: 10819, ARDUINO_UNOR4_MINIMA: 1, ARDUINO_ARCH_RENESAS: 1, ARDUINO_ARCH_RENESAS_UNO: 1 },
  }),
  render: () => unoR4Art(false), update: UNO_UPDATE,
});

register({
  type: 'uno-r4-wifi', name: 'Arduino Uno R4 WiFi', category: 'boards', tags: ['arduino', 'renesas', 'esp32-s3', 'wifi', 'led matrix', 'r4'],
  description: 'RA4M1 + ESP32-S3 · 12×8 LED matrix · 5V · 48 MHz',
  box: [-8, 0, 270, 210], pins: unoPins(), internal: UNO_INTERNAL, socket: true,
  board: unoBoard({
    name: 'Arduino Uno R4 WiFi', wifi: true, arch: 'arm', mhz: 48, ram: 32768, flash: 262144, eeprom: 8192, interruptPins: null,
    serialPorts: ['Serial', 'Serial1'], rout: 30, ledMatrix: true,
    macros: { ARDUINO: 10819, ARDUINO_UNOR4_WIFI: 1, ARDUINO_ARCH_RENESAS: 1, ARDUINO_ARCH_RENESAS_UNO: 1 },
  }),
  render: () => unoR4Art(true), update: UNO_UPDATE,
});

register({
  type: 'leonardo', name: 'Arduino Leonardo', category: 'boards', tags: ['arduino', 'atmega32u4'],
  description: 'ATmega32U4 · native USB · 5V · 16 MHz',
  box: [-8, 0, 270, 210], pins: unoPins(), internal: UNO_INTERNAL.filter((g0) => g0[0] !== 'A4' && g0[0] !== 'A5').concat([['D2', 'SDA'], ['D3', 'SCL']]), socket: true,
  board: unoBoard({
    name: 'Arduino Leonardo',
    pinMap: Object.fromEntries([...range(0, 13).map((i) => [i, 'D' + i]), ...range(0, 5).map((i) => [18 + i, 'A' + i])]),
    analogPins: range(18, 23), analogChannelBase: 18, pwmPins: [3, 5, 6, 9, 10, 11, 13], interruptPins: [3, 2, 0, 1, 7],
    i2c: { sda: 2, scl: 3 }, serialPorts: ['Serial', 'Serial1'], ram: 2560, flash: 28672, numDigital: 24, uart: { Serial1: { rx: 0, tx: 1 } },
    macros: { ARDUINO: 10819, ARDUINO_AVR_LEONARDO: 1, ARDUINO_ARCH_AVR: 1, __AVR__: 1, __AVR_ATmega32U4__: 1 },
  }),
  render: leonardoArt, update: UNO_UPDATE,
});

// ------------------------------------------------------------------ dual-row breadboard boards
function dualRow(top, bottom, x0, yTop, yBot) {
  const pins = [];
  top.forEach((p, i) => { if (p) pins.push({ id: p[0], x: x0 + i * 10, y: yTop, label: p[1] ?? p[0] }); });
  bottom.forEach((p, i) => { if (p) pins.push({ id: p[0], x: x0 + i * 10, y: yBot, label: p[1] ?? p[0] }); });
  return pins;
}

// Arduino Nano: rows 0.6" apart
const NANO_TOP = [['D13', '13'], ['3.3V', '3V3'], ['AREF'], ['A0'], ['A1'], ['A2'], ['A3'], ['A4'], ['A5'], ['A6'], ['A7'], ['5V'], ['RST.1', 'RST'], ['GND.1', 'GND'], ['VIN']];
const NANO_BOT = [['D12', '12'], ['D11', '~11'], ['D10', '~10'], ['D9', '~9'], ['D8', '8'], ['D7', '7'], ['D6', '~6'], ['D5', '~5'], ['D4', '4'], ['D3', '~3'], ['D2', '2'], ['GND.2', 'GND'], ['RST.2', 'RST'], ['D0', 'RX0'], ['D1', 'TX1']];
const NANO_PINS = dualRow(NANO_TOP, NANO_BOT, 0, 0, 60);

register({
  type: 'nano', name: 'Arduino Nano', category: 'boards', tags: ['arduino', 'atmega328p', 'breadboard'],
  description: 'ATmega328P · breadboard friendly · 8 analog inputs',
  box: [-26, -6, 146, 66], pins: NANO_PINS, internal: [['GND.1', 'GND.2'], ['RST.1', 'RST.2']],
  board: unoBoard({
    name: 'Arduino Nano', gndPins: ['GND.1', 'GND.2'],
    pinMap: Object.fromEntries([...range(0, 13).map((i) => [i, 'D' + i]), ...range(0, 7).map((i) => [14 + i, 'A' + i])]),
    analogPins: range(14, 21), supplies: [{ pin: '5V', v: 5, r: 0.05, maxI: 0.5 }, { pin: '3.3V', v: 3.3, r: 1, maxI: 0.05 }, { pin: 'VIN', v: 4.6, diode: true }],
    macros: { ARDUINO: 10819, ARDUINO_AVR_NANO: 1, ARDUINO_ARCH_AVR: 1, __AVR__: 1, __AVR_ATmega328P__: 1 },
  }),
  render: () => nanoArt(NANO_PINS),
  update: UNO_UPDATE,
});

// Mega 2560
const MEGA_TOP = UNO_TOP.concat([['D14', 280, 'TX3 14'], ['D15', 290, 'RX3 15'], ['D16', 300, 'TX2 16'], ['D17', 310, 'RX2 17'], ['D18', 320, 'TX1 18'], ['D19', 330, 'RX1 19'], ['D20', 340, 'SDA 20'], ['D21', 350, 'SCL 21']]);
const MEGA_BOTTOM = UNO_BOTTOM.concat(range(6, 7).map((i) => ['A' + i, 190 + i * 10])).concat(range(8, 15).map((i) => ['A' + i, 280 + (i - 8) * 10]));
function megaPins() {
  const pins = [];
  for (const [id, x, label] of MEGA_TOP) pins.push({ id, x, y: 10, label: label ?? id, socket: true });
  for (const [id, x, label] of MEGA_BOTTOM) pins.push({ id, x, y: 200, label: label ?? id, socket: true });
  // double header 22..53 at right end (vertical, two columns)
  pins.push({ id: '5V.2', x: 370, y: 20, label: '5V', socket: true }, { id: '5V.3', x: 380, y: 20, label: '5V', socket: true });
  for (let i = 0; i < 16; i++) {
    pins.push({ id: 'D' + (22 + i * 2), x: 370, y: 30 + i * 10, label: String(22 + i * 2), socket: true });
    pins.push({ id: 'D' + (23 + i * 2), x: 380, y: 30 + i * 10, label: String(23 + i * 2), socket: true });
  }
  pins.push({ id: 'GND.4', x: 370, y: 190, label: 'GND', socket: true }, { id: 'GND.5', x: 380, y: 190, label: 'GND', socket: true });
  return pins;
}
register({
  type: 'mega2560', name: 'Arduino Mega 2560', category: 'boards', tags: ['arduino', 'atmega2560', 'mega'],
  description: 'ATmega2560 · 54 digital (15 PWM) · 16 analog · 4 UARTs',
  box: [-8, 0, 400, 210], pins: megaPins(), socket: true,
  internal: [['GND.1', 'GND.2', 'GND.3', 'GND.4', 'GND.5'], ['5V', 'IOREF', '5V.2', '5V.3'], ['D20', 'SDA'], ['D21', 'SCL']],
  board: unoBoard({
    name: 'Arduino Mega 2560',
    pinMap: Object.fromEntries([...range(0, 53).map((i) => [i, 'D' + i]), ...range(0, 15).map((i) => [54 + i, 'A' + i])]),
    analogPins: range(54, 69), analogChannelBase: 54, pwmPins: [...range(2, 13), 44, 45, 46], interruptPins: [2, 3, 21, 20, 19, 18],
    i2c: { sda: 20, scl: 21 }, spi: { mosi: 51, miso: 50, sck: 52, ss: 53 }, gndPins: ['GND.1', 'GND.2', 'GND.3', 'GND.4', 'GND.5'],
    serialPorts: ['Serial', 'Serial1', 'Serial2', 'Serial3'], ram: 8192, flash: 253952, eeprom: 4096, numDigital: 70,
    uart: { Serial: { rx: 0, tx: 1 }, Serial1: { rx: 19, tx: 18 }, Serial2: { rx: 17, tx: 16 }, Serial3: { rx: 15, tx: 14 } },
    macros: { ARDUINO: 10819, ARDUINO_AVR_MEGA2560: 1, ARDUINO_ARCH_AVR: 1, __AVR__: 1, __AVR_ATmega2560__: 1 },
  }),
  render() {
    let s = `<g filter="url(#softShadow)">${path('M3 0 H392 A6 6 0 0 1 400 8 V202 A6 6 0 0 1 394 210 H3 A3 3 0 0 1 0 207 V3 A3 3 0 0 1 3 0Z', { fill: '#008f95', stroke: 'rgba(0,0,0,.4)', sw: 0.8 })}</g>`;
    s += mountHole(60, 10, 3.2) + mountHole(55, 200, 3.2) + mountHole(268, 150, 3.2) + mountHole(350, 70, 3.2);
    s += megaDetails();
    s += femaleHeader(MEGA_TOP.slice(0, 10).map((p) => p[1]), 10) + femaleHeader(MEGA_TOP.slice(10, 18).map((p) => p[1]), 10) + femaleHeader(MEGA_TOP.slice(18).map((p) => p[1]), 10);
    s += femaleHeader(UNO_BOTTOM.slice(0, 8).map((p) => p[1]), 200) + femaleHeader(range(0, 7).map((i) => 190 + i * 10), 200) + femaleHeader(range(0, 7).map((i) => 280 + i * 10), 200);
    s += femaleHeader(range(0, 17).map((i) => 20 + i * 10), 370, { vertical: true }) + femaleHeader(range(0, 17).map((i) => 20 + i * 10), 380, { vertical: true });
    s += usbB() + powerJack() + resetButton(20, 14) + silk(32, 14, 'RESET', { size: 3.2, anchor: 'start' });
    s += chipQFP(215, 100, 42, { pins: 16, label: 'ATMEGA2560' });
    for (const [, x, label] of MEGA_TOP) s += text(x, 22.5, label ?? '', { size: 3.8, rot: -90, anchor: 'end', fill: '#eafcff' });
    for (const [id, x, label] of MEGA_BOTTOM) { const l = label ?? id; if (l) s += text(x, 188, l, { size: 3.8, rot: -90, anchor: 'start', fill: '#eafcff' }); }
    // the two columns of digital pins 22 … 53 on the right edge
    for (let i = 0; i < 16; i++) {
      s += text(363, 30 + i * 10, String(22 + i * 2), { size: 3.4, anchor: 'end', fill: '#eafcff' }) + text(387, 30 + i * 10, String(23 + i * 2), { size: 3.4, anchor: 'start', fill: '#eafcff' });
    }
    s += silk(330, 39, 'COMMUNICATION', { size: 3.6, weight: 700, anchor: 'middle' });
    s += text(125, 170, 'POWER', { size: 4.6, fill: '#eafcff', weight: 700 }) + text(222, 170, 'ANALOG IN', { size: 4.6, fill: '#eafcff', weight: 700 }) + text(315, 170, 'ANALOG IN', { size: 4.6, fill: '#eafcff', weight: 700 });
    s += text(120, 39, 'DIGITAL (PWM ~)', { size: 4.2, fill: '#eafcff', anchor: 'start', weight: 600 });
    s += boardLeds(128, 54, true) + onLed(110, 92);
    s += text(285, 62, 'MEGA', { size: 20, weight: 800, fill: '#eafcff' }) + text(285, 80, '2560', { size: 9, weight: 700, fill: '#eafcff' });
    return s;
  },
  update: UNO_UPDATE,
});

// ESP32 DevKit V1 (30 pin), rows 0.9" apart
const ESP_TOP = [['EN'], ['VP', 'VP'], ['VN', 'VN'], ['D34'], ['D35'], ['D32'], ['D33'], ['D25'], ['D26'], ['D27'], ['D14'], ['D12'], ['D13'], ['GND.1', 'GND'], ['VIN']];
const ESP_BOT = [['D23'], ['D22'], ['TX0', 'TX0'], ['RX0', 'RX0'], ['D21'], ['D19'], ['D18'], ['D5'], ['TX2', 'TX2'], ['RX2', 'RX2'], ['D4'], ['D2'], ['D15'], ['GND.2', 'GND'], ['3V3']];
const ESP_PINS = dualRow(ESP_TOP, ESP_BOT, 0, 0, 90);
const espMap = { 36: 'VP', 39: 'VN', 34: 'D34', 35: 'D35', 32: 'D32', 33: 'D33', 25: 'D25', 26: 'D26', 27: 'D27', 14: 'D14', 12: 'D12', 13: 'D13', 23: 'D23', 22: 'D22', 1: 'TX0', 3: 'RX0', 21: 'D21', 19: 'D19', 18: 'D18', 5: 'D5', 17: 'TX2', 16: 'RX2', 4: 'D4', 2: 'D2', 15: 'D15' };
register({
  type: 'esp32-devkit', name: 'ESP32 DevKit V1', category: 'boards', tags: ['esp32', 'wifi', 'bluetooth', 'espressif'],
  description: 'ESP32-WROOM-32 · 240 MHz dual core · WiFi + BT · 3.3V logic',
  box: [-30, -8, 172, 98], pins: ESP_PINS, internal: [['GND.1', 'GND.2']],
  board: {
    name: 'ESP32 DevKit V1', wifi: true, arch: 'xtensa', family: 'esp32', mhz: 240, vcc: 3.3, adcBits: 12, ledBuiltin: 2,
    pinMap: espMap, analogPins: [36, 39, 34, 35, 32, 33, 25, 26, 27, 14, 12, 13, 4, 2, 15], gpioAnalog: true, anyAnalog: false,
    pwmPins: null, inputOnly: [34, 35, 36, 39], interruptPins: null,
    i2c: { sda: 21, scl: 22 }, spi: { mosi: 23, miso: 19, sck: 18, ss: 5 },
    gndPins: ['GND.1', 'GND.2'], supplies: [{ pin: '3V3', v: 3.3, r: 0.1, maxI: 0.6 }, { pin: 'VIN', v: 5, r: 0.1, maxI: 1 }],
    serialPorts: ['Serial', 'Serial1', 'Serial2'], eeprom: 512, ram: 327680, flash: 1310720, rout: 35, rpull: 45000,
    uart: { Serial: { rx: 3, tx: 1 }, Serial2: { rx: 16, tx: 17 } },
    constants: { A0: 36, A3: 39, A4: 32, A5: 33, A6: 34, A7: 35, A10: 4, A12: 2, A13: 15, A14: 13, A15: 12, A16: 14, A17: 27, A18: 25, A19: 26, T0: 4, T3: 15, T4: 13, T5: 12, T6: 14, T7: 27, T8: 33, T9: 32, DAC1: 25, DAC2: 26, SDA: 21, SCL: 22, SS: 5, MOSI: 23, MISO: 19, SCK: 18, TX: 1, RX: 3, BUILTIN_LED: 2 },
    macros: { ARDUINO: 10819, ESP32: 1, ARDUINO_ARCH_ESP32: 1, ARDUINO_ESP32_DEV: 1, CONFIG_IDF_TARGET_ESP32: 1 },
  },
  render: () => esp32Art(ESP_PINS),
  update: UNO_UPDATE,
});

// ESP8266 NodeMCU v2
const NODE_TOP = [['A0'], ['RSV.1', 'RSV'], ['RSV.2', 'RSV'], ['SD3'], ['SD2'], ['SD1'], ['CMD'], ['SD0'], ['CLK'], ['GND.1', 'GND'], ['3V3.1', '3V3'], ['EN'], ['RST'], ['GND.2', 'GND'], ['VIN']];
const NODE_BOT = [['D0'], ['D1'], ['D2'], ['D3'], ['D4'], ['3V3.2', '3V3'], ['GND.3', 'GND'], ['D5'], ['D6'], ['D7'], ['D8'], ['RX'], ['TX'], ['GND.4', 'GND'], ['3V3.3', '3V3']];
const NODE_PINS = dualRow(NODE_TOP, NODE_BOT, 0, 0, 90);
register({
  type: 'nodemcu-esp8266', name: 'NodeMCU ESP8266', category: 'boards', tags: ['esp8266', 'wifi', 'nodemcu'],
  description: 'ESP-12E · 80 MHz · WiFi · 3.3V logic',
  box: [-30, -8, 172, 98], pins: NODE_PINS, internal: [['GND.1', 'GND.2', 'GND.3', 'GND.4'], ['3V3.1', '3V3.2', '3V3.3']],
  board: {
    name: 'NodeMCU ESP8266', wifi: true, arch: 'xtensa', family: 'esp8266', mhz: 80, vcc: 3.3, adcBits: 10, ledBuiltin: 2,
    pinMap: { 16: 'D0', 5: 'D1', 4: 'D2', 0: 'D3', 2: 'D4', 14: 'D5', 12: 'D6', 13: 'D7', 15: 'D8', 3: 'RX', 1: 'TX', 17: 'A0' },
    analogPins: [17], pwmPins: null, interruptPins: null, i2c: { sda: 4, scl: 5 }, spi: { mosi: 13, miso: 12, sck: 14, ss: 15 },
    gndPins: ['GND.1', 'GND.2', 'GND.3', 'GND.4'], supplies: [{ pin: '3V3.1', v: 3.3, r: 0.1, maxI: 0.6 }, { pin: 'VIN', v: 5, r: 0.1 }],
    serialPorts: ['Serial', 'Serial1'], eeprom: 4096, ram: 81920, flash: 1044464, rout: 35, rpull: 45000,
    constants: { D0: 16, D1: 5, D2: 4, D3: 0, D4: 2, D5: 14, D6: 12, D7: 13, D8: 15, RX: 3, TX: 1, A0: 17, SDA: 4, SCL: 5, BUILTIN_LED: 2 },
    macros: { ARDUINO: 10819, ESP8266: 1, ARDUINO_ARCH_ESP8266: 1, ARDUINO_ESP8266_NODEMCU: 1 },
  },
  render: () => nodemcuArt(NODE_PINS),
  update: UNO_UPDATE,
});

// STM32 Blue Pill, rows 0.6" apart
const BP_TOP = [['PB12'], ['PB13'], ['PB14'], ['PB15'], ['PA8'], ['PA9'], ['PA10'], ['PA11'], ['PA12'], ['PA15'], ['PB3'], ['PB4'], ['PB5'], ['PB6'], ['PB7'], ['PB8'], ['PB9'], ['5V'], ['GND.1', 'GND'], ['3V3.1', '3V3']];
const BP_BOT = [['VBAT'], ['PC13'], ['PC14'], ['PC15'], ['PA0'], ['PA1'], ['PA2'], ['PA3'], ['PA4'], ['PA5'], ['PA6'], ['PA7'], ['PB0'], ['PB1'], ['PB10'], ['PB11'], ['RST'], ['3V3.2', '3V3'], ['GND.2', 'GND'], ['GND.3', 'GND']];
const BP_PINS = dualRow(BP_TOP, BP_BOT, 0, 0, 60);
const bpNum = {};
const bpMap = {};
let bpi = 0;
for (const port of ['PA', 'PB']) for (let i = 0; i < 16; i++) { bpNum[port + i] = bpi; bpi++; }
bpNum.PC13 = 32; bpNum.PC14 = 33; bpNum.PC15 = 34;
for (const [name, num] of Object.entries(bpNum)) if (BP_PINS.find((p) => p.id === name)) bpMap[num] = name;
register({
  type: 'stm32-bluepill', name: 'STM32 Blue Pill', category: 'boards', tags: ['stm32', 'arm', 'stm32f103'],
  description: 'STM32F103C8 Cortex-M3 · 72 MHz · 3.3V logic',
  box: [-24, -8, 214, 68], pins: BP_PINS, internal: [['GND.1', 'GND.2', 'GND.3'], ['3V3.1', '3V3.2']],
  board: {
    name: 'STM32 Blue Pill', arch: 'arm', family: 'stm32', mhz: 72, vcc: 3.3, adcBits: 10, ledBuiltin: 32,
    pinMap: bpMap, analogPins: [0, 1, 2, 3, 4, 5, 6, 7, 16, 17], gpioAnalog: true, pwmPins: null, interruptPins: null,
    i2c: { sda: bpNum.PB7, scl: bpNum.PB6 }, gndPins: ['GND.1', 'GND.2', 'GND.3'],
    supplies: [{ pin: '3V3.1', v: 3.3, r: 0.1, maxI: 0.3 }, { pin: '5V', v: 5, r: 0.1 }],
    serialPorts: ['Serial', 'Serial1', 'Serial2'], eeprom: 1024, ram: 20480, flash: 65536, rout: 40, rpull: 40000,
    constants: { ...bpNum, A0: 0, A1: 1, A2: 2, A3: 3, A4: 4, A5: 5, A6: 6, A7: 7, A8: 16, A9: 17 },
    macros: { ARDUINO: 10819, ARDUINO_ARCH_STM32: 1, STM32F1xx: 1, ARDUINO_BLUEPILL_F103C8: 1 },
  },
  render: () => bluePillArt(BP_PINS),
  update: (el, v) => UNO_UPDATE(el, { ...v, L: v.L ? 0 : 1 }),
});

// ATtiny85 (DIP-8)
const TINY_PINS = [
  { id: 'PB5', x: 0, y: 30, label: '1 RST' }, { id: 'PB3', x: 10, y: 30, label: '2 PB3' }, { id: 'PB4', x: 20, y: 30, label: '3 PB4' }, { id: 'GND', x: 30, y: 30, label: '4 GND' },
  { id: 'PB0', x: 30, y: 0, label: '5 PB0' }, { id: 'PB1', x: 20, y: 0, label: '6 PB1' }, { id: 'PB2', x: 10, y: 0, label: '7 PB2' }, { id: 'VCC', x: 0, y: 0, label: '8 VCC' },
];
register({
  type: 'attiny85', name: 'ATtiny85', category: 'boards', tags: ['attiny', 'avr', 'dip8'],
  description: 'Tiny 8-pin AVR · 8 MHz · 5 GPIO (no hardware Serial)',
  box: [-6, -8, 36, 38], pins: TINY_PINS,
  board: {
    name: 'ATtiny85', arch: 'avr', mhz: 8, vcc: 5, adcBits: 10, ledBuiltin: 1,
    pinMap: { 0: 'PB0', 1: 'PB1', 2: 'PB2', 3: 'PB3', 4: 'PB4', 5: 'PB5' },
    analogPins: [5, 2, 4, 3], analogChannelBase: 0, pwmPins: [0, 1, 4], interruptPins: [2],
    i2c: { sda: 0, scl: 2 }, gndPins: ['GND'], supplies: [{ pin: 'VCC', v: 5, r: 0.1, maxI: 0.5 }],
    serialPorts: [], eeprom: 512, ram: 512, flash: 8192, numDigital: 6, rout: 30, rpull: 35000,
    constants: { A0: 5, A1: 2, A2: 4, A3: 3, PB0: 0, PB1: 1, PB2: 2, PB3: 3, PB4: 4, PB5: 5 },
    macros: { ARDUINO: 10819, ARDUINO_ARCH_AVR: 1, __AVR__: 1, __AVR_ATtiny85__: 1 },
  },
  render() {
    let s = chipDIP(-5, 3, 8, { h: 24 });
    s = `<g transform="translate(0 0)">${rect(-5, 3, 40, 24, { fill: '#1f2023', rx: 2 })}${circle(-1, 23, 1.6, { fill: '#3a3a3e' })}`;
    for (const p of TINY_PINS) s += rect(p.x - 1.6, p.y === 0 ? 0 : 27, 3.2, 3, { fill: '#c8ccd2' });
    s += text(15, 11, 'ATTINY85', { size: 4.4, fill: '#cfd2d6', font: 'monospace' }) + text(15, 19, '20PU', { size: 3.4, fill: '#9a9da2', font: 'monospace' });
    s += `</g>`;
    for (const p of TINY_PINS) s += text(p.x, p.y === 0 ? -5 : 35, p.label.split(' ')[1], { size: 3, fill: '#c9d6ff' });
    return s;
  },
  update: () => {},
});

export const BOARD_TYPES = ['uno-r3', 'uno-r4-minima', 'uno-r4-wifi', 'nano', 'mega2560', 'leonardo', 'esp32-devkit', 'nodemcu-esp8266', 'stm32-bluepill', 'attiny85'];
