// Wiring pictures of the projects (chapter P6): every project is a "recipe" (parts + wires in steps) that is
// drawn once per step with the engine of art-pi-kit.js. Pins: g17 = BCM 17 (GP17 on a Pico), p6 = physical pin 6.
// Each export takes the captions of the steps and returns the figures [step 1, step 2, …].
import { scene, K, T, R, L, P, fig } from './art-pi-kit.js';

const BB = { x: 48, y: 90, c0: 1, c1: 18, p: 15 };
const HY = 322;
const stepsOf = (spec, caps) => caps.map((c, i) => scene(spec, i + 1, `Step ${i + 1} of ${caps.length} — ${c}`));
/** LED with its 330 Ω at breadboard column c: resistor across the channel, LED in the top half (anode c, cathode c+1). */
const ledAt = (s, c, color) => [{ s, k: 'res', a: `f${c}`, b: `d${c}`, v: 330 }, { s, k: 'led', a: `a${c}`, c: `a${c + 1}`, color, lift: 15 }];
/** Push button across the channel at columns c … c+2. */
const btnAt = (s, c) => ({ s, k: 'btn', tl: `e${c}`, bl: `f${c}`, tr: `e${c + 2}`, br: `f${c + 2}` });

// ---------------------------------------------------------------- 1 blink
export const BLINK = { hdr: { y: HY, c0: 0, c1: 9 }, h: 378, bb: BB, items: [
  ...ledAt(1, 5, 'red'),
  { s: 2, k: 'jump', a: 'e6', b: 'tn6', col: 'blk' },
  { s: 2, k: 'wire', from: 'p9', to: 'tn3', col: 'blk' },
  { s: 3, k: 'wire', from: 'g17', to: 'j5', col: 'org' },
] };
export const wBlink = (caps) => stepsOf(BLINK, caps);

// ---------------------------------------------------------------- 2 button + LED
export const BTNLED = { hdr: { y: HY, c0: 0, c1: 9 }, h: 378, bb: BB, items: [
  ...ledAt(1, 5, 'red'), btnAt(1, 11),
  { s: 2, k: 'jump', a: 'e6', b: 'tn6', col: 'blk' },
  { s: 2, k: 'jump', a: 'a11', b: 'tn11', col: 'blk' },
  { s: 2, k: 'wire', from: 'p9', to: 'tn3', col: 'blk' },
  { s: 3, k: 'wire', from: 'g17', to: 'j5', col: 'org' },
  { s: 3, k: 'wire', from: 'g2', to: 'j11', col: 'blu' },
] };
export const wButtonLed = (caps) => stepsOf(BTNLED, caps);

// ---------------------------------------------------------------- 3 traffic lights
export const TRAFFIC = { hdr: { y: HY, c0: 5, c1: 19 }, h: 378, bb: BB, items: [
  ...ledAt(1, 2, 'red'), ...ledAt(1, 6, 'yellow'), ...ledAt(1, 10, 'green'), btnAt(1, 14),
  { s: 2, k: 'jump', a: 'e3', b: 'tn3', col: 'blk' }, { s: 2, k: 'jump', a: 'e7', b: 'tn7', col: 'blk' }, { s: 2, k: 'jump', a: 'e11', b: 'tn11', col: 'blk' }, { s: 2, k: 'jump', a: 'a14', b: 'tn15', col: 'blk' },
  { s: 2, k: 'wire', from: 'p14', to: 'tn5', col: 'blk' },
  { s: 3, k: 'wire', from: 'g18', to: 'j2', col: 'red' }, { s: 3, k: 'wire', from: 'g23', to: 'j6', col: 'yel' }, { s: 3, k: 'wire', from: 'g25', to: 'j10', col: 'grn' }, { s: 3, k: 'wire', from: 'g21', to: 'j14', col: 'blu' },
] };
export const wTraffic = (caps) => stepsOf(TRAFFIC, caps);

// ---------------------------------------------------------------- 4 PWM fade (one LED on GPIO18)
export const PWMLED = { hdr: { y: HY, c0: 0, c1: 9 }, h: 378, bb: BB, items: [
  ...ledAt(1, 5, 'red'),
  { s: 1, k: 'jump', a: 'e6', b: 'tn6', col: 'blk' }, { s: 1, k: 'wire', from: 'p9', to: 'tn3', col: 'blk' },
  { s: 1, k: 'wire', from: 'g18', to: 'j5', col: 'org' },
] };
export const wPwm = (cap) => scene(PWMLED, 1, cap);

// ---------------------------------------------------------------- 5 doorbell
export const BELL = { hdr: { y: HY, c0: 5, c1: 19 }, h: 378, bb: BB, items: [
  ...ledAt(1, 2, 'green'), { s: 1, k: 'buzz', plus: 'h8', minus: 'h10', lift: 24 }, btnAt(1, 14),
  { s: 2, k: 'jump', a: 'e3', b: 'tn3', col: 'blk' }, { s: 2, k: 'jump', a: 'a14', b: 'tn15', col: 'blk' },
  { s: 2, k: 'wire', from: 'p25', to: 'tn5', col: 'blk' }, { s: 2, k: 'wire', from: 'p20', to: 'j10', col: 'blk' },
  { s: 3, k: 'wire', from: 'g18', to: 'j2', col: 'org' }, { s: 3, k: 'wire', from: 'g12', to: 'j8', col: 'pur' }, { s: 3, k: 'wire', from: 'g21', to: 'j14', col: 'blu' },
] };
export const wBell = (caps) => stepsOf(BELL, caps);

// ---------------------------------------------------------------- 6 servo
export const SERVO = { h: 228, hdr: { y: 174, c0: 0, c1: 16 }, mods: [
  { id: 'sv', x: 100, y: 26, w: 160, h: 76, kind: 'servo', pins: [{ id: 'GND', name: 'GND', at: 0.2, color: '#a16207' }, { id: 'V', name: '5V', at: 0.5, color: '#ef4444' }, { id: 'PWM', name: 'PWM', at: 0.8, color: '#f97316' }] },
], items: [
  { s: 2, k: 'wire', from: 'p6', to: 'sv.GND', col: 'blk' }, { s: 2, k: 'wire', from: 'p2', to: 'sv.V', col: 'red' },
  { s: 3, k: 'wire', from: 'g12', to: 'sv.PWM', col: 'org' },
] };
export const wServo = (caps) => stepsOf(SERVO, caps);

// ---------------------------------------------------------------- 7 ultrasonic: sensor, divider, outputs
const US = { id: 'us', x: 40, y: 20, w: 170, h: 80, kind: 'hcsr04', pins: [{ id: 'VCC', at: 0.15 }, { id: 'TRIG', at: 0.38 }, { id: 'ECHO', at: 0.62 }, { id: 'GND', at: 0.85 }] };
export const SONAR = { h: 258, hdr: { y: 204, c0: 0, c1: 11 }, mods: [US], items: [
  { s: 2, k: 'wire', from: 'p6', to: 'us.GND', col: 'blk' }, { s: 2, k: 'wire', from: 'p2', to: 'us.VCC', col: 'red' },
  { s: 3, k: 'wire', from: 'g23', to: 'us.TRIG', col: 'pur' },
] };
export const wSonar = (caps) => stepsOf(SONAR, caps);
export const DIVIDER = { h: 258, hdr: { y: 204, c0: 0, c1: 11 }, mods: [US], items: [
  { s: 1, k: 'res', a: [145, 112], b: [145, 142], v: 1000, side: 1 }, { s: 1, k: 'res', a: [148, 162], b: [208, 162], v: 2000 },
  { s: 2, k: 'cable', pts: ['us.ECHO', [145, 112]], col: 'pur' }, { s: 2, k: 'cable', pts: [[145, 142], [145, 162]], col: 'pur' },
  { s: 3, k: 'wire', from: 'p6', to: [208, 162], col: 'blk', lane: 0 }, { s: 3, k: 'wire', from: 'g24', to: [145, 162], col: 'pur', lane: 1 },
] };
export const wDivider = (caps) => stepsOf(DIVIDER, caps);
export const OUTS = { hdr: { y: HY, c0: 3, c1: 12 }, h: 378, bb: BB, items: [
  ...ledAt(1, 4, 'red'), { s: 1, k: 'buzz', plus: 'h10', minus: 'h12', lift: 24 },
  { s: 2, k: 'jump', a: 'e5', b: 'tn5', col: 'blk' }, { s: 2, k: 'wire', from: 'p9', to: 'tn3', col: 'blk' }, { s: 2, k: 'wire', from: 'p14', to: 'j12', col: 'blk' },
  { s: 3, k: 'wire', from: 'g17', to: 'j4', col: 'org' }, { s: 3, k: 'wire', from: 'g22', to: 'j10', col: 'pur' },
] };
export const wOuts = (caps) => stepsOf(OUTS, caps);

// ---------------------------------------------------------------- 8 DHT22
export const DHT = { h: 206, hdr: { y: 152, c0: 0, c1: 5 }, mods: [
  { id: 'd', x: 120, y: 22, w: 130, h: 68, kind: 'dht22', pins: [{ id: 'VCC', at: 0.14 }, { id: 'DATA', at: 0.38 }, { id: 'NC', at: 0.62, color: '#94a3b8' }, { id: 'GND', at: 0.86 }] },
], items: [
  { s: 2, k: 'wire', from: 'p1', to: 'd.VCC', col: 'red' }, { s: 2, k: 'wire', from: 'p6', to: 'd.GND', col: 'blk' },
  { s: 3, k: 'wire', from: 'g4', to: 'd.DATA', col: 'grn' },
] };
export const wDht = (caps) => stepsOf(DHT, caps);

// ---------------------------------------------------------------- 9 I²C LCD
export const LCD = { h: 226, hdr: { y: 172, c0: 0, c1: 4 }, mods: [
  { id: 'l', x: 50, y: 22, w: 260, h: 92, kind: 'lcd', pins: [{ id: 'GND', at: 0.12 }, { id: 'VCC', at: 0.37 }, { id: 'SDA', at: 0.62 }, { id: 'SCL', at: 0.87 }] },
], items: [
  { s: 2, k: 'wire', from: 'p6', to: 'l.GND', col: 'blk' }, { s: 2, k: 'wire', from: 'p2', to: 'l.VCC', col: 'red' },
  { s: 3, k: 'wire', from: 'g2', to: 'l.SDA', col: 'grn' }, { s: 3, k: 'wire', from: 'g3', to: 'l.SCL', col: 'yel' },
] };
export const wLcd = (caps) => stepsOf(LCD, caps);

// ---------------------------------------------------------------- 10 DC motor with an L298N driver
export const MOTOR = { h: 316, hdr: { y: 262, c0: 0, c1: 19 }, mods: [
  { id: 'm', x: 120, y: 12, w: 100, h: 56, kind: 'motor', title: ' ', pins: [{ id: '1', name: 'M1', at: 0.3 }, { id: '2', name: 'M2', at: 0.7 }] },
  { id: 'd', x: 96, y: 100, w: 170, h: 70, kind: 'l298n', pins: [{ id: 'ENA', at: 0.08 }, { id: 'IN1', at: 0.24 }, { id: 'IN2', at: 0.4 }, { id: 'GND', at: 0.6 }, { id: 'V12', name: '12V', at: 0.8 }, { id: 'O1', name: 'OUT1', at: 0.3, side: 'top' }, { id: 'O2', name: 'OUT2', at: 0.7, side: 'top' }] },
  { id: 'b', x: 292, y: 90, w: 60, h: 52, kind: 'generic', title: '9 V', pins: [{ id: 'P', name: '+', at: 0.3, color: '#ef4444' }, { id: 'N', name: '−', at: 0.7 }] },
], items: [
  { s: 2, k: 'cable', pts: ['m.1', [150, 84], [147, 84], 'd.O1'], col: 'org' }, { s: 2, k: 'cable', pts: ['m.2', [190, 84], [210, 84], 'd.O2'], col: 'blu' },
  { s: 2, k: 'cable', pts: ['b.P', [310, 186], [232, 186], 'd.V12'], col: 'red' }, { s: 2, k: 'cable', pts: ['b.N', [334, 196], [198, 196], 'd.GND'], col: 'blk' },
  { s: 3, k: 'wire', from: 'p4', to: 'd.ENA', col: 'red' }, { s: 3, k: 'wire', from: 'g20', to: 'd.IN1', col: 'grn' }, { s: 3, k: 'wire', from: 'g21', to: 'd.IN2', col: 'yel' }, { s: 3, k: 'wire', from: 'p39', to: 'd.GND', col: 'blk' },
] };
export const wMotor = (caps) => stepsOf(MOTOR, caps);

// ---------------------------------------------------------------- 11 PIR
export const PIR = { h: 216, hdr: { y: 162, c0: 0, c1: 5 }, mods: [
  { id: 'p', x: 120, y: 22, w: 130, h: 76, kind: 'pir', title: ' ', pins: [{ id: 'VCC', at: 0.17 }, { id: 'OUT', at: 0.5 }, { id: 'GND', at: 0.83 }] },
], items: [
  { s: 2, k: 'wire', from: 'p2', to: 'p.VCC', col: 'red' }, { s: 2, k: 'wire', from: 'p6', to: 'p.GND', col: 'blk' },
  { s: 3, k: 'wire', from: 'g4', to: 'p.OUT', col: 'grn' },
] };
export const wPir = (caps) => stepsOf(PIR, caps);

// ---------------------------------------------------------------- 12 MCP3008 + potentiometer
export const MCP = { h: 232, hdr: { y: 178, c0: 0, c1: 14 }, mods: [
  { id: 'a', x: 30, y: 24, w: 252, h: 56, kind: 'generic', title: 'MCP3008', pins: ['VDD', 'VREF', 'AGND', 'CLK', 'DOUT', 'DIN', 'CS', 'DGND', 'CH0'].map((n, i) => ({ id: n, at: (i + 0.5) / 9 })) },
  { id: 'r', x: 294, y: 24, w: 58, h: 56, kind: 'generic', title: 'Pot', pins: [{ id: 'GND', at: 0.2 }, { id: 'SIG', at: 0.5 }, { id: 'VCC', at: 0.8 }] },
], items: [
  { s: 2, k: 'wire', from: 'p17', to: 'a.VDD', col: 'red' }, { s: 2, k: 'cable', pts: ['a.VDD', [44, 92], [72, 92], 'a.VREF'], col: 'red' }, { s: 2, k: 'wire', from: 'p20', to: 'a.AGND', col: 'blk' }, { s: 2, k: 'wire', from: 'p25', to: 'a.DGND', col: 'blk' },
  { s: 3, k: 'wire', from: 'g11', to: 'a.CLK', col: 'yel' }, { s: 3, k: 'wire', from: 'g9', to: 'a.DOUT', col: 'grn' }, { s: 3, k: 'wire', from: 'g10', to: 'a.DIN', col: 'blu' }, { s: 3, k: 'wire', from: 'g8', to: 'a.CS', col: 'pur' },
  { s: 4, k: 'wire', from: 'p1', to: 'r.VCC', col: 'red' }, { s: 4, k: 'wire', from: 'p14', to: 'r.GND', col: 'blk' },
] };
export const wMcp = (caps) => stepsOf(MCP, caps);

// ---------------------------------------------------------------- Pico: LED on GP15, potentiometer on GP26
export const PICOLED = { hdr: { y: HY, c0: 10, c1: 19, pico: true }, h: 378, bb: BB, items: [
  ...ledAt(1, 5, 'red'),
  { s: 2, k: 'jump', a: 'e6', b: 'tn6', col: 'blk' }, { s: 2, k: 'wire', from: 'p18', to: 'tn3', col: 'blk' },
  { s: 3, k: 'wire', from: 'g15', to: 'j5', col: 'org' },
] };
export const wPicoLed = (caps) => stepsOf(PICOLED, caps);
export const PICOPOT = { h: 214, hdr: { y: 160, c0: 2, c1: 11, pico: true }, mods: [
  { id: 'r', x: 120, y: 24, w: 110, h: 64, kind: 'generic', title: 'Potentiometer', pins: [{ id: 'GND', at: 0.17 }, { id: 'SIG', at: 0.5 }, { id: 'VCC', at: 0.83 }] },
], items: [
  { s: 2, k: 'wire', from: 'p33', to: 'r.GND', col: 'blk' }, { s: 2, k: 'wire', from: 'p36', to: 'r.VCC', col: 'red' },
  { s: 3, k: 'wire', from: 'g26', to: 'r.SIG', col: 'grn' },
] };
export const wPicoPot = (caps) => stepsOf(PICOPOT, caps);

// ---------------------------------------------------------------- hero and small charts of chapter P6
export function projectsHero() {
  const tiles = [['1', 'Blink', '#ef4444'], ['2', 'PWM fade', '#fb923c'], ['3', 'Button', '#3b82f6'], ['4', 'Doorbell', '#22c55e'], ['5', 'Traffic light', '#facc15'], ['6', 'Servo', '#60a5fa'], ['7', 'Motor', '#94a3b8'], ['8', 'Distance', '#a855f7'], ['9', 'Motion alarm', '#f87171'], ['10', 'DHT22', '#06b6d4'], ['11', 'LCD clock', '#4ade80'], ['12', 'Dimmer', '#fde047'], ['13', 'Pico blink', '#c4b5fd'], ['14', 'Pico ADC', '#c4b5fd']];
  let s = '';
  tiles.forEach(([n, t, c], i) => {
    const x = 6 + (i % 3) * 118, y = 6 + Math.floor(i / 3) * 52;
    s += R(x, y, 112, 46, { fill: K.box, stroke: c, rx: 11 }) + `<circle cx="${x + 20}" cy="${y + 23}" r="11" fill="${c}" fill-opacity=".2" stroke="${c}"/>` + T(x + 20, y + 27, n, { size: 11, anchor: 'middle', weight: 800, fill: c }) + T(x + 38, y + 21, t, { size: 10, weight: 800 }) + T(x + 38, y + 34, i < 12 ? 'Pi 4 / Pi 5' : 'Pico', { size: 8, fill: K.dim });
  });
  return fig(360, 266, s, 'Fourteen projects, from a blinking LED to a motor with a driver. Each one: parts, wiring in steps, the program, and an example to open.');
}

export function fadeChart() {
  let s = '';
  const x0 = 30, W = 310, base = 126, top = 22;
  s += L(x0, base, x0 + W, base, { stroke: '#475569' }) + L(x0, top - 6, x0, base, { stroke: '#475569' });
  s += T(8, top + 4, '100 %', { size: 8.4, fill: K.dim }) + T(8, base + 3, '0 %', { size: 8.4, fill: K.dim });
  const pts = [];
  for (let k = 0; k <= 80; k++) { const ph = (k / 80) * 2; const v = ph <= 1 ? ph : 2 - ph; pts.push(`${x0 + (k / 80) * W} ${base - v * (base - top)}`); }
  s += P('M' + pts.join(' L'), { stroke: '#fb923c', sw: 2.4 });
  s += T(x0 + W * 0.25, base + 16, 'up: 0 → 100 %', { size: 9, anchor: 'middle', fill: K.ok }) + T(x0 + W * 0.75, base + 16, 'down: 100 → 0 %', { size: 9, anchor: 'middle', fill: K.err });
  s += T(180, 14, 'ChangeDutyCycle(dc) every 0.05 s', { size: 9.4, anchor: 'middle', fill: K.acc, weight: 700 });
  return fig(360, 156, s, 'The duty cycle of pwm_fade.py over time: 21 steps up, 21 steps down, for ever.');
}
