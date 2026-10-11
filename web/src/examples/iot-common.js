// Shared layout helpers of the IoT examples (ESP32 on the left, a half breadboard to its right, modules below / above).
import { P, plug, at, W, R, C, rail, holePos } from './helpers.js';

export const ESP = () => P('esp32-devkit', 0, 0, {}, 0, 'esp');
export const NODEMCU = () => P('nodemcu-esp8266', 0, 0, {}, 0, 'esp');
export const BB = () => P('breadboard-half', 210, 40, {}, 0, 'bb');

export const WIFI = `const char* WIFI_SSID = "RaptiNet";      // the simulated router (password: rapti1234)
const char* WIFI_PASS = "rapti1234";
`;

/** Wires from the bottom-row pins of the board to a module below it (its pins face down): one channel per wire. */
export function hookDown(esp, mod, pairs, base = 18) {
  const items = pairs.map(([ep, mp, col]) => ({ ep, mp, col, ex: holePos(esp, ep)[0], my: holePos(mod, mp)[1] })).sort((a, b) => a.ex - b.ex);
  const n = items.length;
  return items.map((it, i) => R(esp, it.ep, mod, it.mp, it.col, [it.my + base + (n - 1 - i) * 9]));
}

/** Same for a module above the board, wired to the top-row pins. */
export function hookUp(esp, mod, pairs, base = 14) {
  const items = pairs.map(([ep, mp, col]) => ({ ep, mp, col, ex: holePos(esp, ep)[0], my: holePos(mod, mp)[1] })).sort((a, b) => a.ex - b.ex);
  return items.map((it, i) => R(esp, it.ep, mod, it.mp, it.col, [it.my + base + i * 8]));
}

/**
 * LED + 220 Ω on the breadboard at column `col`: resistor e{col}…e{col+4}, LED anode c{col+4}, cathode a{col+5} → GND rail.
 * `chan` (116, 122, …) keeps the wires of several rigs apart.
 */
export function ledRig(esp, bb, pin, col, color, id, chan = 116, wireColor = C.green, topY = 28) {
  const r = plug('resistor', '1', bb, `e${col}`, { value: 220 });
  const l = plug('led', 'A', bb, `c${col + 4}`, { color }, 0, id);
  const wires = [
    R(esp, pin, bb, `a${col}`, wireColor, [chan, 195 - (chan - 116) / 2, topY]),
    W(bb, `a${col + 5}`, bb, rail(bb, 'tn', col + 5), C.black),
  ];
  return { parts: [r, l], wires };
}

/** GND of the board to the top (−) rail of the breadboard. */
export const gndTop = (esp, bb) => R(esp, 'GND.2', bb, rail(bb, 'tn', 3), C.black, [126, 200]);
/** 3V3 of the board to the top (+) rail. */
export const vccTop = (esp, bb) => R(esp, '3V3', bb, rail(bb, 'tp', 3), C.red, [132, 205]);

/** Same for a module whose pins are on its TOP edge (an I²C LCD hangs below its header): the channels lie between board and header. */
export function hookTop(esp, mod, pairs, base = 14) {
  const items = pairs.map(([ep, mp, col]) => ({ ep, mp, col, ex: holePos(esp, ep)[0], my: holePos(mod, mp)[1] })).sort((a, b) => a.ex - b.ex);
  return items.map((it, i) => R(esp, it.ep, mod, it.mp, it.col, [it.my - base - i * 8]));
}

/** A tactile button on the breadboard at column `col` (rows e/f); `pin` of the board → a{col}, the other side → the bottom (−) rail. */
export function buttonRig(esp, bb, pin, col, id, chan = 130, wireColor = C.blue, topY = 22) {
  const b = plug('pushbutton', '1.l', bb, `e${col}`, { color: 'blue' }, 0, id);
  const wires = [
    R(esp, pin, bb, `a${col}`, wireColor, [chan, 195 - (chan - 116) / 2, topY]),
    W(bb, `g${col}`, bb, rail(bb, 'bn', col), C.black),
  ];
  return { parts: [b], wires };
}
/** GND of the board to the bottom (−) rail (for the buttons). */
export const gndBottom = (esp, bb) => R(esp, 'GND.2', bb, rail(bb, 'bn', 3), C.black, [210, 205]);

/** 16×2 I²C LCD whose header sits at (x, y); it hangs below. */
export const LCD = (x = 20, y = 200, id = 'lcd') => at('lcd-i2c', 'GND', x, y, { size: '1602', backlight: 'blue', address: '39' }, 0, id);
/** LCD wiring: I²C on D21/D22, GND, and 5 V from VIN (the long way round the board's right edge); dx = x of the board. */
export const lcdWires = (esp, lcd, dx = 0) => [
  ...hookTop(esp, lcd, [['D22', 'SCL', C.yellow], ['D21', 'SDA', C.blue], ['GND.2', 'GND', C.black]]),
  R(esp, 'VIN', lcd, 'VCC', C.red, [-20, dx + 175, 154]),
];
