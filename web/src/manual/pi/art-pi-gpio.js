// Pictures of chapter P2: the 40-pin header, pin groups, numbering, 3.3 V logic, safe wiring, the Pico pinout.
import { K, T, R, L, P, AR, DOT, BADGE, fig, WC, PC, headerStrip, cable, resG, ledG, pinLabel } from './art-pi-kit.js';
import { PI_HEADER, PICO_HEADER } from '../../pi/boards.js';

const SHORT = { 0: 'ID_SD', 1: 'ID_SC', 2: 'I²C SDA', 3: 'I²C SCL', 4: 'GPCLK0', 7: 'SPI CE1', 8: 'SPI CE0', 9: 'SPI MISO', 10: 'SPI MOSI', 11: 'SPI SCLK', 12: 'PWM0', 13: 'PWM1', 14: 'UART TX', 15: 'UART RX', 16: 'SPI1 CE2', 18: 'PWM0', 19: 'PWM1', 20: 'SPI1 MOSI', 21: 'SPI1 SCLK' };
const TCOL = (t) => PC[t] || PC.gpio;

export function heroGpio() {
  let s = `<defs><linearGradient id="hg2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#14301f"/><stop offset="1" stop-color="#1b1442"/></linearGradient></defs><rect x="4" y="4" width="352" height="196" rx="18" fill="url(#hg2)" stroke="#1e3a5f"/>`;
  s += T(180, 34, '40 pins · 28 GPIOs', { size: 20, anchor: 'middle', weight: 800 }) + T(180, 52, 'power, ground and the pins you can program', { size: 10.5, anchor: 'middle', fill: K.acc });
  const hs = headerStrip(10, 82, { w: 340, c0: 0, c1: 19, pcb: false });
  s += hs.svg;
  [[PC.power3, '3.3 V'], [PC.power5, '5 V'], [PC.gnd, 'GND'], [PC.gpio, 'GPIO'], [PC.i2c, 'I²C'], [PC.spi, 'SPI'], [PC.uart, 'UART']].forEach(([c, t], i) => {
    const x = 20 + i * 48; s += `<rect x="${x}" y="150" width="11" height="11" rx="3" fill="${c}"/>` + T(x + 15, 159.5, t, { size: 9.5, fill: '#cbd5e1', weight: 700 });
  });
  s += T(180, 186, 'Numbers on the pins are BCM GPIO numbers', { size: 9.5, anchor: 'middle', fill: K.dim });
  return fig(360, 206, s, 'The 40-pin header of the Pi 4 and Pi 5, drawn like the Pinout tab: every pin has its colour.');
}

export function header40() {
  let s = '';
  const cx = 180, rowH = 15.2, y0 = 34;
  s += T(cx - 31, 14, 'odd pins', { size: 9.5, anchor: 'middle', fill: K.dim }) + T(cx + 31, 14, 'even pins', { size: 9.5, anchor: 'middle', fill: K.dim });
  for (let r = 0; r < 20; r++) {
    const y = y0 + r * rowH;
    for (const side of [0, 1]) {
      const p = PI_HEADER[r * 2 + side], left = side === 0, gx = left ? cx - 31 : cx + 31;
      const c = TCOL(p.type), name = p.gpio != null ? `GPIO${p.gpio}` : p.type === 'gnd' ? 'GND' : p.type === 'power3' ? '3V3' : '5V';
      s += `<rect x="${gx - 14}" y="${y - 6.2}" width="28" height="12.4" rx="3" fill="${c}" stroke="#0b1226" stroke-width=".8"/>` + T(gx, y + 3, String(p.phys), { size: 9, anchor: 'middle', weight: 800, fill: '#0b1226' });
      const alt = p.gpio != null ? SHORT[p.gpio] || '' : '';
      s += T(left ? gx - 19 : gx + 19, y + 3.4, name, { size: 10.5, anchor: left ? 'end' : 'start', weight: 800, fill: c });
      if (alt) s += T(left ? 6 : 354, y + 3.2, alt, { size: 8.6, anchor: left ? 'start' : 'end', fill: p.type === 'gpio' ? K.dim : c });
    }
  }
  s += L(cx, 30, cx, y0 + 19 * rowH + 8, { stroke: '#334155', sw: 1, dash: '2 3' });
  return fig(360, y0 + 20 * rowH + 4, s, 'All 40 pins, pin 1 at the top. The number in the box is the physical pin (1 – 40); the name is the BCM GPIO number or the supply. Coloured text on the outside = the special job of that pin.');
}

export function pinGroups() {
  const card = (x, y, w, h, title, color, lines, sw = null) => R(x, y, w, h, { fill: K.box, stroke: color, rx: 11 }) + `<rect x="${x + 10}" y="${y + 11}" width="12" height="12" rx="3" fill="${color}"/>` + T(x + 28, y + 21.5, title, { size: 12, weight: 800, fill: color }) + lines.map((l, i) => T(x + 10, y + 40 + i * 13.5, l, { size: 9.4, fill: '#cbd5e1' })).join('');
  let s = '';
  s += card(8, 8, 170, 100, 'Power', PC.power3, ['3V3: pins 1 and 17', '5V: pins 2 and 4', 'supply for parts — not for', 'programming']);
  s += card(182, 8, 170, 100, 'Ground (GND)', PC.gnd, ['pins 6, 9, 14, 20, 25,', '30, 34 and 39', 'the 0 V return of every', 'circuit']);
  s += card(8, 112, 170, 100, 'GPIO (general)', PC.gpio, ['27 pins from GPIO2 to GPIO27', 'any pin: input or output', 'logic level 3.3 V', 'PWM on every one (soft)']);
  s += card(182, 112, 170, 100, 'I²C', PC.i2c, ['GPIO2 = SDA (pin 3)', 'GPIO3 = SCL (pin 5)', 'two wires for displays,', 'sensors, an RTC']);
  s += card(8, 216, 170, 100, 'SPI', PC.spi, ['GPIO10 = MOSI (pin 19)', 'GPIO9 = MISO (pin 21)', 'GPIO11 = SCLK (pin 23)', 'GPIO8 = CE0 (pin 24)', 'MAX7219, MCP3008']);
  s += card(182, 216, 170, 100, 'UART', PC.uart, ['GPIO14 = TX (pin 8)', 'GPIO15 = RX (pin 10)', 'serial link, /dev/serial0', 'TX goes to the other', "device's RX"]);
  return fig(360, 324, s, 'The pin groups. A GPIO that is not used for I²C, SPI or UART is free for LEDs, buttons and everything else.');
}

export function numbering() {
  const use = { 11: PC.gpio };
  const hs = headerStrip(20, 52, { w: 320, c0: 3, c1: 8, use, nums: true });
  let s = hs.svg;
  s += T(180, 22, 'The same pin, two names', { size: 14, anchor: 'middle', weight: 800 });
  const [px, py] = hs.pos(11);
  const ly = hs.box.y1 + 2;
  s += P(`M${px} ${ly} V144 H94 V150`, { stroke: PC.gpio, sw: 1.6, dash: '3 3' });
  s += R(14, 150, 160, 84, { fill: K.box, stroke: PC.gpio, rx: 10 }) + T(94, 168, 'BCM — the GPIO number', { size: 10.5, anchor: 'middle', weight: 800, fill: PC.gpio });
  s += T(94, 185, 'GPIO17', { size: 15, anchor: 'middle', weight: 800 }) + T(94, 202, 'LED(17)', { size: 10.5, anchor: 'middle', fill: '#cbd5e1', mono: true }) + T(94, 217, 'GPIO.setmode(GPIO.BCM)', { size: 8.6, anchor: 'middle', fill: '#cbd5e1', mono: true });
  s += R(186, 150, 160, 84, { fill: K.box, stroke: K.dim, rx: 10 }) + T(266, 168, 'BOARD — the pin position', { size: 10.5, anchor: 'middle', weight: 800, fill: '#cbd5e1' });
  s += T(266, 185, 'pin 11', { size: 15, anchor: 'middle', weight: 800 }) + T(266, 202, 'LED("BOARD11")', { size: 10.5, anchor: 'middle', fill: '#cbd5e1', mono: true }) + T(266, 217, 'GPIO.setmode(GPIO.BOARD)', { size: 8.6, anchor: 'middle', fill: '#cbd5e1', mono: true });
  s += P(`M${px + 3} ${ly} V144 H266 V150`, { stroke: K.dim, sw: 1.4, dash: '3 3' });
  return fig(360, 246, s, 'GPIO17 is the pin in position 11. In this manual every number is a BCM number unless it says "pin" or "BOARD".');
}

export function logic33() {
  const X0 = 150, Y = (v) => 214 - v * 34; // 0..5.5 V
  let s = '';
  const zone = (v0, v1, c, label, sub) => `<rect x="${X0}" y="${Y(v1)}" width="46" height="${Y(v0) - Y(v1)}" fill="${c}" fill-opacity=".85"/>` + T(X0 + 56, (Y(v0) + Y(v1)) / 2 + 3, label, { size: 10.5, weight: 800, fill: c }) + (sub ? T(X0 + 56, (Y(v0) + Y(v1)) / 2 + 15, sub, { size: 8.6, fill: '#94a3b8' }) : '');
  s += zone(0, 1.65, '#3b82f6', 'LOW  = 0', 'reads as False / 0');
  s += zone(1.65, 3.3, '#22c55e', 'HIGH  = 3.3 V', 'reads as True / 1');
  s += zone(3.3, 3.7, '#facc15', 'limit', '');
  s += zone(3.7, 5.5, '#ef4444', 'DANGER', '');
  s += T(X0 + 56, Y(4.7) + 14, 'pin wears out, then dies', { size: 8.6, fill: '#fca5a5' });
  for (const v of [0, 1, 2, 3, 4, 5]) s += L(X0 - 6, Y(v), X0, Y(v), { stroke: '#94a3b8' }) + T(X0 - 10, Y(v) + 3.5, `${v} V`, { size: 10, anchor: 'end', fill: '#cbd5e1' });
  s += L(X0, Y(0), X0, Y(5.5), { stroke: '#94a3b8' });
  s += L(X0 - 6, Y(1.65), X0 + 46, Y(1.65), { stroke: '#fff', sw: 1, dash: '3 2' }) + T(14, Y(1.65) + 3, '≈ 1.65 V: the dividing line', { size: 8.6, fill: '#e2e8f0' });
  s += T(14, Y(5) + 3, '5 V pins and parts', { size: 9, fill: '#fca5a5' }) + L(14 + 90, Y(5), X0 - 6, Y(5), { stroke: '#ef4444', dash: '3 3' });
  s += T(14, Y(3.3) + 3, 'GPIO output', { size: 9, fill: '#86efac' }) + T(14, Y(0) + 3, 'GND', { size: 9, fill: '#93c5fd' });
  return fig(360, 236, s, 'A GPIO is a 3.3 V pin: HIGH is about 3.3 V, LOW is about 0 V. Anything above about 3.7 V is outside what the chip can take.');
}

const resBox = (x, y, label, vert = false) => vert ? `<rect x="${x - 5}" y="${y - 14}" width="10" height="28" rx="2" fill="#d9bf92" stroke="#0b1226"/>` + T(x + 10, y + 3, label, { size: 9.5, fill: '#fde68a', weight: 700 }) : `<rect x="${x - 14}" y="${y - 5}" width="28" height="10" rx="2" fill="#d9bf92" stroke="#0b1226"/>` + T(x, y - 9, label, { size: 9.5, anchor: 'middle', fill: '#fde68a', weight: 700 });

export function fiveVoltDanger() {
  let s = '';
  const sensor = (x, y) => R(x, y, 84, 46, { fill: '#1e3a8a', stroke: K.blue, rx: 6 }) + T(x + 42, y + 19, 'HC-SR04', { size: 10.5, anchor: 'middle', weight: 800 }) + T(x + 42, y + 34, 'ECHO = 5 V', { size: 9, anchor: 'middle', fill: '#fca5a5' });
  const pi = (x, y) => R(x, y, 84, 46, { fill: '#166534', stroke: K.ok, rx: 6 }) + T(x + 42, y + 19, 'Pi GPIO24', { size: 10.5, anchor: 'middle', weight: 800 }) + T(x + 42, y + 34, '3.3 V only', { size: 9, anchor: 'middle', fill: '#bbf7d0' });
  s += T(12, 20, 'WRONG', { size: 12, weight: 800, fill: K.err });
  s += sensor(30, 30) + pi(246, 30) + cable([[114, 53], [246, 53]], WC.pur) + `<path d="M170 41 l20 24 M190 41 l-20 24" stroke="${K.err}" stroke-width="3.4" stroke-linecap="round"/>`;
  s += T(180, 98, '5 V straight into a 3.3 V pin: the pin burns', { size: 10, anchor: 'middle', fill: '#fca5a5' });
  s += L(12, 112, 348, 112, { stroke: '#1e293b' });
  s += T(12, 134, 'RIGHT: a voltage divider (1 kΩ + 2 kΩ)', { size: 12, weight: 800, fill: K.ok });
  s += sensor(30, 146) + pi(246, 146);
  s += cable([[114, 169], [150, 169]], WC.pur) + resBox(170, 169, '1 kΩ') + cable([[184, 169], [246, 169]], WC.pur);
  s += cable([[214, 169], [214, 196]], WC.pur) + resBox(214, 214, '2 kΩ', true) + cable([[214, 228], [214, 242]], WC.blk);
  s += L(204, 244, 224, 244, { stroke: '#94a3b8', sw: 2 }) + L(207, 249, 221, 249, { stroke: '#94a3b8', sw: 2 }) + L(211, 254, 217, 254, { stroke: '#94a3b8', sw: 2 });
  s += DOT(214, 169, '#e2e8f0') + T(268, 212, '5 V × 2 ÷ (1 + 2)', { size: 9.5, fill: K.dim }) + T(268, 232, '= 3.3 V  ✓', { size: 13, fill: K.ok, weight: 800 });
  return fig(360, 266, s, 'The HC-SR04 sends a 5 V pulse on ECHO. Two resistors (1 kΩ and 2 kΩ) cut it down to 3.3 V before it reaches the Pi.');
}

export function safeLed() {
  let s = '';
  // schematic: GPIO17 -> R -> LED -> GND
  s += R(8, 14, 70, 56, { fill: '#166534', stroke: K.ok, rx: 8 }) + T(43, 36, 'GPIO17', { size: 11, anchor: 'middle', weight: 800 }) + T(43, 50, 'pin 11', { size: 9, anchor: 'middle', fill: '#bbf7d0' }) + T(43, 63, '3.3 V', { size: 9, anchor: 'middle', fill: '#bbf7d0' });
  s += cable([[78, 42], [118, 42]], WC.org) + resBox(138, 42, '330 Ω') + cable([[152, 42], [196, 42]], WC.org);
  // LED symbol (triangle + bar)
  s += `<path d="M196 28 V56 L218 42z" fill="${K.err}" fill-opacity=".85" stroke="#fecaca"/><line x1="219" y1="27" x2="219" y2="57" stroke="#fecaca" stroke-width="2.4"/>`;
  s += T(207, 22, 'LED', { size: 9.5, anchor: 'middle', weight: 700 }) + P('M222 30 l10 -9 m-5 0 h5 v5 M226 38 l10 -9 m-5 0 h5 v5', { stroke: '#fecaca', sw: 1.4 });
  s += cable([[219, 42], [258, 42], [258, 80]], WC.blk) + L(248, 82, 268, 82, { stroke: '#94a3b8', sw: 2 }) + L(251, 87, 265, 87, { stroke: '#94a3b8', sw: 2 }) + L(255, 92, 261, 92, { stroke: '#94a3b8', sw: 2 }) + T(258, 106, 'GND', { size: 9.5, anchor: 'middle', fill: '#cbd5e1', weight: 700 });
  s += `<path d="M96 33 h18" stroke="${K.warn}" stroke-width="1.6" marker-end="url(#mfa)"/>` + T(105, 27, 'I', { size: 11, anchor: 'middle', fill: K.warn, weight: 800 });
  // calculation
  s += R(8, 118, 344, 98, { fill: K.box, stroke: K.line, rx: 12 });
  s += T(20, 138, 'How big must the resistor be?', { size: 11, weight: 800, fill: K.acc });
  s += T(20, 158, 'R = ( 3.3 V − 2 V ) ÷ I', { size: 12, fill: K.ink, mono: true }) + T(20, 177, 'LED about 2 V, I about 4 – 10 mA', { size: 9.8, fill: '#cbd5e1' });
  s += T(20, 196, '330 Ω → (3.3 − 2) ÷ 330 = 4 mA   ✓ safe, clearly lit', { size: 10, fill: '#86efac', weight: 700 });
  s += T(20, 210, 'No resistor → far too much current: LED and pin burn', { size: 9.6, fill: '#fca5a5' });
  return fig(360, 226, s, 'The safe LED circuit: always put a resistor (220 – 330 Ω) in series with an LED. The current limit of one pin is 16 mA in this lab.');
}

export function picoPinout() {
  const cx = 180, rowH = 15, y0 = 30;
  const ALT = { 0: 'UART0 TX', 1: 'UART0 RX', 4: 'I²C0 SDA', 5: 'I²C0 SCL', 16: 'SPI0 MISO', 17: 'SPI0 CS', 18: 'SPI0 SCK', 19: 'SPI0 MOSI', 26: 'ADC0', 27: 'ADC1', 28: 'ADC2' };
  let s = R(cx - 38, y0 - 14, 76, rowH * 20 + 10, { fill: '#166534', stroke: '#22c55e', rx: 8 });
  s += R(cx - 14, y0 - 20, 28, 18, { fill: '#cbd5e1', stroke: '#94a3b8', rx: 3 }) + T(cx, y0 - 7, 'USB', { size: 8, anchor: 'middle', fill: '#334155', weight: 800 });
  s += T(cx, y0 + 140, 'Raspberry', { size: 9, anchor: 'middle', fill: '#dcfce7', weight: 700 }) + T(cx, y0 + 152, 'Pi Pico', { size: 9, anchor: 'middle', fill: '#dcfce7', weight: 700 });
  s += `<rect x="${cx - 12}" y="${y0 + 20}" width="24" height="20" rx="3" fill="#e5e7eb"/>` + T(cx, y0 + 53, 'BOOTSEL', { size: 7, anchor: 'middle', fill: '#bbf7d0' });
  for (let r = 0; r < 20; r++) {
    const y = y0 + r * rowH;
    for (const side of [0, 1]) {
      const ph = side === 0 ? r + 1 : 40 - r, p = PICO_HEADER[ph - 1], left = side === 0, gx = left ? cx - 50 : cx + 50;
      const c = TCOL(p.type), name = p.gpio != null ? `GP${p.gpio}` : p.name;
      s += `<rect x="${gx - 11}" y="${y - 6}" width="22" height="12" rx="3" fill="${c}" stroke="#0b1226" stroke-width=".8"/>` + T(gx, y + 3, String(ph), { size: 8.6, anchor: 'middle', weight: 800, fill: '#0b1226' });
      s += T(left ? gx - 16 : gx + 16, y + 3.4, name, { size: 10, anchor: left ? 'end' : 'start', weight: 800, fill: c });
      const alt = p.gpio != null ? ALT[p.gpio] : '';
      if (alt) s += T(left ? 6 : 354, y + 3.2, alt, { size: 8.4, anchor: left ? 'start' : 'end', fill: p.type === 'adc' ? PC.adc : K.dim });
    }
  }
  return fig(360, y0 + 20 * rowH + 6, s, 'The Pico pinout (USB at the top). GP = GPIO number; the number in the box is the physical pin. GP26 – GP28 can also read analog voltages (ADC0 – ADC2).');
}

export function safeRules() {
  const rules = [
    ['Stop, then wire', 'Change the circuit only while it is powered off — press Stop.', K.acc],
    ['A resistor for every LED', '220 – 330 Ω in series. Never LED straight to a pin.', K.warn],
    ['3.3 V on the GPIOs', 'A 5 V signal needs a divider or a level shifter.', K.err],
    ['One common GND', 'Every part shares a GND pin with the Pi.', '#9ca3af'],
    ['Small loads only', 'About 16 mA per pin. Motors and relays need a driver.', K.vio],
    ['Look before you Run', 'Check BCM numbers, the 5V pin and GND with the Pinout tab.', K.ok],
  ];
  let s = '';
  rules.forEach(([t, d, c], i) => {
    const x = 8 + (i % 2) * 176, y = 8 + Math.floor(i / 2) * 84;
    s += R(x, y, 168, 76, { fill: K.box, stroke: c, rx: 11 }) + BADGE(x + 14, y + 16, i + 1) + T(x + 28, y + 20, t, { size: 10.2, weight: 800, fill: c });
    const w = d.split(' '); let l1 = '', l2 = '';
    for (const word of w) { if ((l1 + ' ' + word).length < 30 && !l2) l1 += (l1 ? ' ' : '') + word; else l2 += (l2 ? ' ' : '') + word; }
    s += T(x + 10, y + 42, l1, { size: 8.8, fill: '#cbd5e1' }) + T(x + 10, y + 55, l2.slice(0, 34), { size: 8.8, fill: '#cbd5e1' }) + (l2.length > 34 ? T(x + 10, y + 68, l2.slice(34), { size: 8.8, fill: '#cbd5e1' }) : '');
  });
  return fig(360, 262, s, 'Six rules that keep the Pi and its parts alive. The lab burns parts the way the real world does — see chapter P3.');
}
