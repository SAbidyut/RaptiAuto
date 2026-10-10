// Circuits for the Raspberry Pi 4 / 5 examples that are built on a breadboard: jumpers from the
// 40-pin header to the parts, a common GND rail, and (master–slave) an Arduino Uno talking to the Pi
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

/**
 * Pi + Arduino Uno: the Uno sits right of the Pi, a half breadboard under it carries its LED (A2)
 * and button (A1); GND is shared through the Uno's bottom header. `link` adds the I²C or UART wires.
 */
function piAndUno(board, sketch, link) {
  resetIds();
  const p = pi(board);
  const u = P('uno-r3', 420, 60, {}, 0, 'uno');
  u.title = 'Arduino (slave)';
  u.code = sketch;
  const bb = P('breadboard-half', 500, 360, {}, 0, 'bbu');
  const res = plug('resistor', '1', bb, 'c14', { value: 220 }, 0, 'r1');
  const led = plug('led', 'A', bb, 'b18', { color: 'red' }, 0, 'led');
  const btn = plug('pushbutton', '1.l', bb, 'e13', { color: 'green' }, 0, 'btn');
  return {
    parts: [bb, p, u, res, led, btn],
    wires: [
      ...link(p, u),
      // common ground: Pi GND → Uno GND (round the right of the Pi, under the Uno)
      R(p, 'GND.6', u, 'GND.2', C.black, [-20, 375, 300, 560]),
      // the Uno's GND to the breadboard rails (top − rail, bridged to the bottom − rail)
      R(u, 'GND.3', bb, rail(bb, 'tn', 8), C.black),
      W(bb, 'tn.1', bb, 'bn.1', C.black, [[480, 330], [480, 510]]),
      // LED on A2 through 220 Ω, cathode to −; button from A1 to −
      R(u, 'A2', bb, 'a14', C.orange),
      W(bb, 'a19', bb, rail(bb, 'tn', 19), C.black),
      R(u, 'A1', bb, 'a13', C.green),
      W(bb, 'j13', bb, rail(bb, 'bn', 13), C.black),
    ],
  };
}

export function piI2cMaster(board) {
  return piAndUno(board, UNO_I2C_SLAVE, (p, u) => [
    // I²C: Pi GPIO2 (SDA) → Uno SDA, GPIO3 (SCL) → Uno SCL
    R(p, 'GPIO2', u, 'SDA', C.blue, [-40]),
    R(p, 'GPIO3', u, 'SCL', C.yellow, [-30]),
  ]);
}

export function piUartMaster(board) {
  return piAndUno(board, UNO_UART_SLAVE, (p, u) => [
    // UART, crossed: Pi TXD (GPIO14) → Uno RX (D0), Pi RXD (GPIO15) ← Uno TX (D1)
    R(p, 'GPIO14', u, 'D0', C.green, [-40]),
    R(p, 'GPIO15', u, 'D1', C.blue, [-30]),
  ]);
}

const UNO_I2C_SLAVE = `// Arduino Uno = I2C SLAVE at address 8 for the Raspberry Pi (the master).
// Register 0: the Pi writes the LED state. Register 1: the Pi reads [button, presses].
// (On a real bench use a 3.3 V <-> 5 V level shifter between the Pi and the Uno.)
#include <Wire.h>

const int LED = A2;
const int BUTTON = A1;            // to GND, internal pull-up
volatile byte reg = 0;
volatile byte ledState = 0;
volatile byte presses = 0;
bool last = HIGH;

// the Pi wrote [register, data...]
void receiveEvent(int n) {
  reg = Wire.read();
  if (reg == 0 && Wire.available()) ledState = Wire.read();
  while (Wire.available()) Wire.read();
}

// the Pi asks for data
void requestEvent() {
  Wire.write(digitalRead(BUTTON) == LOW ? 1 : 0);
  Wire.write(presses);
}

void setup() {
  Wire.begin(8);
  Wire.onReceive(receiveEvent);
  Wire.onRequest(requestEvent);
  pinMode(LED, OUTPUT);
  pinMode(BUTTON, INPUT_PULLUP);
}

void loop() {
  digitalWrite(LED, ledState);
  bool b = digitalRead(BUTTON);
  if (last == HIGH && b == LOW) presses++;
  last = b;
  delay(20);
}
`;

const UNO_UART_SLAVE = `// Arduino Uno = SERIAL SLAVE for the Raspberry Pi (the master).
// Pi TXD (GPIO14) -> Uno RX (D0), Uno TX (D1) -> Pi RXD (GPIO15), GND -> GND.
// The Pi sends "L1" / "L0"; the Uno switches its LED and answers "OK led=1 presses=3".
// (On a real bench put a 1k / 2k divider on the Uno's 5 V TX before the Pi's RXD.)
const int LED = A2;
const int BUTTON = A1;
byte presses = 0;
bool last = HIGH;

void setup() {
  Serial.begin(9600);
  pinMode(LED, OUTPUT);
  pinMode(BUTTON, INPUT_PULLUP);
}

void loop() {
  bool b = digitalRead(BUTTON);
  if (last == HIGH && b == LOW) presses++;
  last = b;
  if (Serial.available()) {
    char c = Serial.read();
    if (c == 'L') {
      int v = Serial.parseInt();
      digitalWrite(LED, v ? HIGH : LOW);
      Serial.print("OK led=");
      Serial.print(v);
      Serial.print(" presses=");
      Serial.println(presses);
    }
  }
  delay(5);
}
`;
