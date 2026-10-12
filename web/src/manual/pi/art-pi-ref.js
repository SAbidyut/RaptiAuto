// Pictures of chapter P8: reference cards, troubleshooting flow, error messages, gestures.
import { K, T, R, L, P, AR, DOT, BADGE, fig, WC } from './art-pi-kit.js';
import { codeLine } from './art-pi-python.js';

const CK = { kw: '#c792ea', fn: '#82aaff', num: '#f78c6c', str: '#c3e88d', cm: '#66789c', tx: '#e2e8f0', cls: '#ffcb6b' };

export function heroRef() {
  let s = `<defs><linearGradient id="hg8" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#14264a"/><stop offset="1" stop-color="#2a1442"/></linearGradient></defs><rect x="4" y="4" width="352" height="176" rx="18" fill="url(#hg8)" stroke="#1e3a5f"/>`;
  s += T(180, 34, 'Look it up', { size: 20, anchor: 'middle', weight: 800 }) + T(180, 52, 'boards · parts · libraries · errors · gestures', { size: 10.5, anchor: 'middle', fill: K.acc });
  [['Boards', K.ok, 'Pi 5 · Pi 4 · 4 Picos'], ['Parts', K.warn, 'the part library'], ['Libraries', K.vio, 'gpiozero · RPi.GPIO · machine'], ['Errors', K.err, 'what the message means'], ['Gestures', K.acc, 'taps, holds, pinch'], ['Glossary', K.blue, 'words explained']].forEach(([t, c, d], i) => { const x = 14 + (i % 3) * 114, y = 70 + Math.floor(i / 3) * 52; s += R(x, y, 106, 44, { fill: K.box, stroke: c, rx: 10 }) + T(x + 53, y + 19, t, { size: 12, anchor: 'middle', weight: 800, fill: c }) + T(x + 53, y + 34, d, { size: 7.8, anchor: 'middle', fill: '#cbd5e1' }); });
  return fig(360, 188, s, 'Chapter P8: the pages to come back to when something is unclear or does not work.');
}

export function partsTiles() {
  const cats = [['Basic & passive', 8, 'resistor · capacitor · diode · transistors · MOSFET', K.warn], ['LEDs & output', 6, 'LED · RGB LED · lamp · buzzer · LED bar · NeoPixel', '#fca5a5'], ['Input & controls', 12, 'push button · switches · potentiometers · keypads · joystick · encoder', K.ok], ['Sensors', 20, 'HC-SR04 · DHT22 · PIR · LDR · gas · flame · DS18B20 · MPU6050 · RTC …', K.blue], ['Displays', 6, 'LCD 16×2 · LCD I²C · OLED · TM1637 · MAX7219 · 7-segment', K.vio], ['Motors & actuators', 6, 'servo · DC motor · steppers · relay · L298N', K.acc], ['ICs & drivers', 2, '74HC595 · MCP3008', '#fdba74'], ['Power & breadboards', 6, 'breadboards · batteries · DC power supply', '#94a3b8'], ['Measurement', 2, 'multimeter (volts) · ammeter', '#86efac']];
  let s = '';
  cats.forEach(([t, n, d, c], i) => { const y = 6 + i * 36; s += R(6, y, 348, 31, { fill: K.box, stroke: c, rx: 9 }) + T(14, y + 14, t, { size: 10.5, weight: 800, fill: c }) + T(342, y + 14, String(n), { size: 12, anchor: 'end', weight: 800 }) + T(14, y + 26, d.length > 66 ? d.slice(0, 65) + '…' : d, { size: 7.8, fill: '#94a3b8' }); });
  return fig(360, 336, s, 'The parts library of the Circuit tab: 68 parts in 9 groups (the same library as the Arduino editor; the boards themselves are chosen with the board chip).');
}

export function libCheat() {
  const rows = [['LED on', 'led.on()', 'output(17, 1)', 'led.on()'], ['blink', 'led.blink()', 'loop + sleep', 'led.toggle()'], ['read a button', 'is_pressed', 'input(2)', 'btn.value()'], ['on a press', 'when_pressed', 'add_event_detect', 'btn.irq()'], ['PWM', 'PWMLED(18)', 'GPIO.PWM(18,100)', 'PWM(Pin(15))'], ['analog in', 'MCP3008(0)', '(chip needed)', 'ADC(26)'], ['finish', 'automatic', 'cleanup()', 'automatic']];
  const xs = [76, 164, 262];
  let s = '';
  [['gpiozero', K.ok], ['RPi.GPIO', K.warn], ['machine (Pico)', K.vio]].forEach(([t, c], i) => { s += T(xs[i], 14, t, { size: 9.4, weight: 800, fill: c }); });
  rows.forEach((r, i) => { const y = 22 + i * 30; s += R(4, y, 352, 26, { fill: i % 2 ? K.box : '#0d1830', stroke: 'none', rx: 6 }) + T(10, y + 16, r[0], { size: 8.6, fill: '#cbd5e1', weight: 700 }); r.slice(1).forEach((t, j) => { s += `<text x="${xs[j]}" y="${y + 16}" font-size="7.8" fill="#e2e8f0" font-family="JetBrains Mono, ui-monospace, monospace">${t}</text>`; }); });
  return fig(360, 238, s, 'The same task in the three libraries (RPi.GPIO calls are written without the GPIO. prefix).');
}

export function debugFlow() {
  let s = '';
  const q = (y, n, text, fix, c) => R(8, y, 224, 40, { fill: K.box, stroke: c, rx: 10 }) + BADGE(22, y + 20, n) + T(38, y + 17, text, { size: 9.6, weight: 800, fill: '#e2e8f0' }) + T(38, y + 30, 'no →', { size: 8, fill: '#fca5a5', weight: 800 }) + T(58, y + 30, fix, { size: 8.4, fill: '#cbd5e1' });
  s += q(8, 1, 'Did you press Run?', 'the circuit is only powered while it runs', K.ok);
  s += q(54, 2, 'Is the Output free of red text?', 'read the last line of the error', K.warn);
  s += q(100, 3, 'Right pin number (BCM)?', 'GPIO17 is pin 11: use 17, not 11', K.blue);
  s += q(146, 4, 'Does every part reach GND?', 'a missing ground = nothing happens', K.vio);
  s += q(192, 5, 'Any warning or smoke?', 'open the ⚠ pill: a part may be burnt', K.err);
  s += q(238, 6, 'Is the part powered?', '5 V parts on 5V, GPIO parts 3.3 V', K.acc);
  [0, 1, 2, 3, 4].forEach((i) => { s += AR(120, 48 + i * 46, 120, 54 + i * 46, { m: 'mfc', stroke: K.ok }) + T(128, 53 + i * 46, 'yes', { size: 7.6, fill: K.ok, weight: 800 }); });
  s += R(244, 8, 108, 270, { fill: 'rgba(148,163,184,.05)', stroke: K.line, rx: 12, dash: '4 3' }) + T(298, 28, 'Still stuck?', { size: 10.5, anchor: 'middle', weight: 800, fill: K.acc });
  ['Pinout tab: is the', 'pin HIGH / LOW?', '', 'print() the values', 'your program reads', '', 'Stop, then Run', 'again: a clean start', '', 'Try the example', 'with the same part'].forEach((t, i) => { s += T(298, 52 + i * 13, t, { size: 8.4, anchor: 'middle', fill: '#cbd5e1' }); });
  return fig(360, 286, s, 'Nothing happens? Walk down the list.');
}

export function errorCards() {
  const cards = [
    ["ImportError: no module named 'numpy'", 'The lab has no such library. Use gpiozero, RPi.GPIO, machine …', K.warn],
    ['GPIOPinInUse: pin GPIO17 is already in use', 'Two objects on one pin. close() the first or use one object.', K.err],
    ['RuntimeError: Please set pin numbering mode', 'RPi.GPIO: call GPIO.setmode(GPIO.BCM) first.', K.vio],
    ['RuntimeError: … has not been set up as an OUTPUT', 'RPi.GPIO: GPIO.setup(pin, GPIO.OUT) before output().', K.vio],
    ["NameError: name 'LEd' isn't defined", 'A typo or a missing import. Check upper / lower case.', K.blue],
    ['SyntaxError: invalid syntax', 'A missing ":" or bracket, or a block that is not indented.', K.acc],
  ];
  let s = '';
  cards.forEach(([m, f, c], i) => { const y = 6 + i * 52; s += R(6, y, 348, 46, { fill: K.box, stroke: c, rx: 9 }) + `<text x="14" y="${y + 17}" font-size="8" fill="#fca5a5" font-family="JetBrains Mono, ui-monospace, monospace" font-weight="700">${m.replace(/&/g, '&amp;')}</text>` + T(14, y + 34, f, { size: 8.8, fill: '#cbd5e1' }); });
  return fig(360, 322, s, 'The error messages you will meet most often, as the lab prints them.');
}

export function gestures() {
  const g = (x, y, title, body, glyph, c = K.acc) => R(x, y, 112, 76, { fill: K.box, stroke: '#1e293b', rx: 11 }) + glyph + T(x + 56, y + 52, title, { size: 9.6, anchor: 'middle', weight: 800, fill: c }) + T(x + 56, y + 65, body, { size: 7.8, anchor: 'middle', fill: '#94a3b8' });
  const dot = (x, y) => `<circle cx="${x}" cy="${y}" r="9" fill="#fff" fill-opacity=".25" stroke="#fff" stroke-opacity=".8" stroke-width="1.4"/><circle cx="${x}" cy="${y}" r="2.6" fill="#fff"/>`;
  let s = '';
  s += g(6, 6, 'Tap a pin', 'start or end a wire', dot(62, 28));
  s += g(124, 6, 'Tap empty space', 'bend the wire being drawn', dot(180, 28) + `<path d="M150 36 H210" stroke="#22c55e" stroke-width="2" stroke-dasharray="3 3"/>`);
  s += g(242, 6, 'Drag a part', 'move it; it snaps to the grid', `<rect x="276" y="18" width="20" height="14" rx="3" fill="#475569"/>` + `<path d="M300 25 h22" stroke="#22d3ee" stroke-width="2"/><path d="M322 25l-5-4v8z" fill="#22d3ee"/>`);
  s += g(6, 88, 'Touch and hold', 'a part or wire: menu', dot(62, 110) + `<circle cx="62" cy="110" r="16" fill="none" stroke="#22d3ee" stroke-width="1.4" stroke-dasharray="3 2"/>`);
  s += g(124, 88, 'Hold on empty space', 'then drag: select box', `<rect x="152" y="98" width="56" height="26" rx="3" fill="rgba(34,211,238,.12)" stroke="#22d3ee" stroke-dasharray="3 2"/>` + dot(152, 98));
  s += g(242, 88, 'Pinch', 'zoom the canvas', dot(284, 106) + dot(312, 124) + `<path d="M292 112 l12 8" stroke="#22d3ee" stroke-width="1.6"/>`);
  s += g(6, 170, 'Double-tap + slide', 'zoom like a map', dot(62, 192) + dot(62, 206));
  s += g(124, 170, 'Tap a tab', 'landscape: open / close', `<rect x="146" y="184" width="68" height="16" rx="5" fill="none" stroke="#22d3ee"/>` + dot(180, 192));
  s += g(242, 170, 'While running', 'tap / drag the parts', `<rect x="284" y="184" width="28" height="18" rx="4" fill="#1f2937" stroke="#475569"/><circle cx="298" cy="193" r="5" fill="#3b82f6"/>` + dot(298, 193));
  return fig(360, 254, s, 'The gestures of the circuit canvas. While the circuit runs, a tap presses a button part, a drag turns a knob, other parts open a small control sheet.');
}
