// Circuits for the Raspberry Pi 4 / 5 examples that are built on a breadboard: jumpers from the
// 40-pin header to the parts, and a common GND rail
// over I²C or the UART. Each builder takes the board ('pi5' | 'pi4') and returns { parts, wires }.
import { P, plug, rail, W, R, C, resetIds } from '../examples/helpers.js';
import { CIRCUIT_TYPE } from './circuit-parts.js';

const pi = (board) => P(CIRCUIT_TYPE[board], 0, 0, {}, 0, 'pi');

/** Half breadboard over the header: column c sits at x = (c − 1) × 10, right above the pins. */
function bbOverPi() { return P('breadboard-half', 0, -250, {}, 0, 'bb'); }

/** Pi GND → the breadboard's top − rail, round the left end of the breadboard. */
const gndRail = (p, bb) => R(p, 'GND.1', bb, 'tn.1', C.black, [-30, -30, -280]);

/**
 * LED with its resistor across the centre gap: GPIO wire → j<col>, resistor f<col> → d<col>,
 * LED anode b<col>, cathode b<col+1> → a<col+1> → − rail.
 */
function ledAt(p, bb, col, gpio, color, wireColor) {
  const r = plug('resistor', '1', bb, 'f' + col, { value: 330 }, 270, 'r' + col);
  const d = plug('led', 'A', bb, 'b' + col, { color }, 0, 'led' + col);
  return {
    parts: [r, d],
    wires: [R(p, gpio, bb, 'j' + col, wireColor), W(bb, 'a' + (col + 1), bb, rail(bb, 'tn', col + 1), C.black)],
  };
}

/** Push button across the centre gap: GPIO wire → j<col>, the other side a<col> → − rail. */
function buttonAt(p, bb, col, gpio, color = 'blue') {
  const b = plug('pushbutton', '1.l', bb, 'e' + col, { color }, 0, 'btn' + col);
  return { parts: [b], wires: [R(p, gpio, bb, 'j' + col, C.blue), W(bb, 'a' + col, bb, rail(bb, 'tn', col), C.black)] };
}

function merge(...groups) {
  const parts = [], wires = [];
  for (const g of groups) { parts.push(...g.parts); wires.push(...g.wires); }
  return { parts, wires };
}

/** Traffic lights on a breadboard: red GPIO18, amber GPIO23, green GPIO25, button GPIO21. */
export function bbTrafficLights(board) {
  resetIds();
  const p = pi(board), bb = bbOverPi();
  return merge(
    { parts: [bb, p], wires: [gndRail(p, bb)] },
    ledAt(p, bb, 9, 'GPIO18', 'red', C.orange),
    ledAt(p, bb, 11, 'GPIO23', 'yellow', C.yellow),
    ledAt(p, bb, 14, 'GPIO25', 'green', C.green),
    buttonAt(p, bb, 23, 'GPIO21'),
  );
}

/** Doorbell: a button (GPIO21) rings an active buzzer (GPIO12) and flashes an LED (GPIO18). */
export function bbDoorbell(board) {
  resetIds();
  const p = pi(board), bb = bbOverPi();
  const bz = plug('buzzer', '+', bb, 'b19', { kind: 'active' }, 0, 'bz');
  return merge(
    { parts: [bb, p, bz], wires: [gndRail(p, bb), R(p, 'GPIO12', bb, 'e19', C.purple), W(bb, 'a21', bb, rail(bb, 'tn', 21), C.black)] },
    ledAt(p, bb, 9, 'GPIO18', 'green', C.orange),
    buttonAt(p, bb, 23, 'GPIO21'),
  );
}
