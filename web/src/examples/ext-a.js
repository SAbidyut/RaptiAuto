// Examples for the group A parts (power, pressure sensor, current / voltage sensing, DIP switch, optocoupler).
import { P, at, W, R, C, UNO } from './helpers.js';

export function regulator5v() {
  const bat = at('battery-9v', '-', 60, 200, {}, 0, 'bat');
  const reg = at('regulator', 'IN', 160, 200, { model: '7805' }, 0, 'reg');
  const r = at('resistor', '1', 240, 200, { value: 330 }, 0, 'r');
  const led = at('led', 'A', 310, 200, { color: 'green' }, 0, 'led');
  const vm = at('voltmeter', 'V', 400, 200, {}, 0, 'vm');
  return {
    id: 'regulator-5v', name: '9 V → 5 V with a 7805 regulator', category: 'electrical', level: 'beginner',
    description: 'A 7805 linear regulator turns a 9 V battery into a steady 5 V. The multimeter shows the output and a green LED runs from it. Change the model to 7812 or AMS1117-3.3 in the part properties.',
    parts: [bat, reg, r, led, vm],
    wires: [
      W(bat, '+', reg, 'IN', C.red, [[80, 180], [160, 180]]),
      W(bat, '-', reg, 'GND', C.black, [[60, 235], [170, 235]]),
      W(reg, 'OUT', r, '1', C.red, [[180, 190], [240, 190]]),
      W(r, '2', led, 'A', C.red),
      W(led, 'C', bat, '-', C.black, [[320, 235], [60, 235]]),
      W(reg, 'OUT', vm, 'V', C.red, [[180, 165], [400, 165]]),
      W(vm, 'COM', bat, '-', C.black, [[380, 235], [60, 235]]),
    ],
    code: `// This example has no microcontroller.
// Press Run to simulate the electronics only.
`,
  };
}

export function bmp280Weather() {
  const u = UNO();
  const b = at('bmp280', 'VCC', 90, -50, { address: '118' }, 0, 'bmp');
  return {
    id: 'bmp280-weather', name: 'Barometer & altimeter (BMP280)', category: 'sensors', level: 'intermediate',
    description: 'Read temperature, air pressure and altitude from a BMP280 over I²C with the Adafruit_BMP280 library. Tap the sensor while running and change the pressure to "climb" a hill.',
    parts: [u, b],
    wires: [
      R(b, 'SCL', u, 'SCL', C.yellow, [-30]),
      R(b, 'SDA', u, 'SDA', C.blue, [-36]),
      R(b, 'GND', u, 'GND.1', C.black, [-24]),
      R(b, 'VCC', u, '5V', C.red, [-44, -22, 230]),
    ],
    code: `// BMP280 pressure / temperature sensor on I2C (address 0x76)
#include <Wire.h>
#include <Adafruit_BMP280.h>

Adafruit_BMP280 bmp;

void setup() {
  Serial.begin(9600);
  if (!bmp.begin(0x76)) {
    Serial.println("BMP280 not found - check the wiring");
    while (true) delay(10);
  }
}

void loop() {
  float t = bmp.readTemperature();           // degrees C
  float p = bmp.readPressure() / 100.0;      // Pa -> hPa
  float alt = bmp.readAltitude(1013.25);     // metres above sea level

  Serial.print("T = ");  Serial.print(t, 1);   Serial.print(" C   ");
  Serial.print("P = ");  Serial.print(p, 1);   Serial.print(" hPa   ");
  Serial.print("Altitude = "); Serial.print(alt, 0); Serial.println(" m");
  delay(1000);
}
`,
  };
}

export function acs712Current() {
  const u = UNO();
  const acs = at('acs712', 'VCC', 300, -60, { range: '5' }, 0, 'acs');
  const bat = at('battery-aa4', '-', 430, 0, {}, 0, 'bat');
  const l1 = at('lamp', '1', 480, 110, { rating: '5' }, 0, 'l1');
  const l2 = at('lamp', '1', 540, 110, { rating: '5' }, 0, 'l2');
  return {
    id: 'acs712-current', name: 'Current meter (ACS712)', category: 'sensors', level: 'intermediate',
    description: 'A 6 V battery pack lights two 5 V lamps through an ACS712 current sensor. The sketch measures the current (about 0.5 A) from the sensor\'s analog output; switch a lamp off in the circuit editor to see it drop.',
    parts: [u, acs, bat, l1, l2],
    wires: [
      R(acs, 'VCC', u, '5V', C.red, [-30, 280, 225]),
      R(acs, 'GND', u, 'GND.2', C.black, [-20, 290, 232]),
      R(acs, 'OUT', u, 'A0', C.green, [-40, 285, 218]),
      W(bat, '+', acs, 'IP+', C.red, [[440, -120], [340, -120]]),
      W(acs, 'IP-', l1, '1', C.orange, [[370, -82], [370, 110]]),
      W(l1, '1', l2, '1', C.orange, [[480, 125], [540, 125]]),
      W(l1, '2', l2, '2', C.black, [[500, 150], [560, 150]]),
      W(l1, '2', bat, '-', C.black, [[500, 160], [420, 160], [420, 0]]),
      R(bat, '-', u, 'GND.3', C.black, [250, 150]),
    ],
    code: `// ACS712 5 A current sensor: 185 mV per ampere, 2.5 V at 0 A
const int SENSOR = A0;
const float ZERO = 2.5;         // sensor output with no current (VCC / 2)

float readVolts() {
  long sum = 0;
  for (int i = 0; i < 20; i++) sum += analogRead(SENSOR);
  return (sum / 20.0) * 5.0 / 1023.0;
}

void setup() {
  Serial.begin(9600);
  Serial.println("ACS712 current meter");
}

void loop() {
  float v = readVolts();
  float amps = (v - ZERO) / 0.185;
  Serial.print("Sensor = ");  Serial.print(v, 3);
  Serial.print(" V   Current = "); Serial.print(amps, 2); Serial.println(" A");
  delay(500);
}
`,
  };
}

export function dipSwitch() {
  const u = UNO();
  const dip = at('dip-switch-8', 'a1', 100, -60, {}, 0, 'dip');
  return {
    id: 'dip-switch-binary', name: 'DIP switch → binary number', category: 'basics', level: 'beginner',
    description: 'Four DIP switches are read with INPUT_PULLUP and shown as a 4-bit binary and decimal number. Tap the switch bank while running and flip the switches.',
    parts: [u, dip],
    wires: [
      R(dip, 'a1', u, 'D2', C.yellow, [-84]), R(dip, 'a2', u, 'D3', C.green, [-90]),
      R(dip, 'a3', u, 'D4', C.blue, [-96]), R(dip, 'a4', u, 'D5', C.orange, [-102]),
      W(dip, 'b1', dip, 'b2', C.black), W(dip, 'b2', dip, 'b3', C.black), W(dip, 'b3', dip, 'b4', C.black),
      R(dip, 'b4', u, 'GND.1', C.black, [-20]),
    ],
    code: `// 4 DIP switches on D2..D5 (switch ON = connected to GND = bit 1)
const int pins[4] = {2, 3, 4, 5};
int last = -1;

void setup() {
  Serial.begin(9600);
  for (int i = 0; i < 4; i++) pinMode(pins[i], INPUT_PULLUP);
}

void loop() {
  int value = 0;
  for (int i = 0; i < 4; i++) {
    if (digitalRead(pins[i]) == LOW) value |= (1 << i);
  }
  if (value != last) {
    last = value;
    Serial.print("Value: ");
    Serial.print(value);
    Serial.print("  binary ");
    for (int b = 3; b >= 0; b--) Serial.print((value >> b) & 1);
    Serial.println();
  }
  delay(20);
}
`,
  };
}

export function optoIsolation() {
  const u = UNO();
  const r1 = at('resistor', '1', 40, -90, { value: 330 }, 0, 'r1');
  const r2 = at('resistor', '1', 200, -90, { value: 10000 }, 0, 'r2');
  const op = at('optocoupler', 'A', 130, -50, {}, 0, 'op');
  return {
    id: 'optocoupler-isolation', name: 'Optocoupler (galvanic isolation)', category: 'electrical', level: 'intermediate',
    description: 'D8 lights the LED inside a PC817 through 330 Ω; the phototransistor pulls D3 low (through a 10 kΩ pull-up) while the LED is on. The two sides share no connection.',
    parts: [u, r1, r2, op],
    wires: [
      R(r1, '1', u, 'D8', C.yellow, [-70]),
      W(r1, '2', op, 'A', C.yellow, [[80, -90], [80, -50], [130, -50]]),
      W(op, 'K', u, 'GND.1', C.black, [[150, -64], [114, -64], [114, 10]]),
      R(r2, '1', u, '5V', C.red, [-110, 300, 225]),
      W(r2, '2', op, 'C', C.green, [[260, -90], [260, -20], [150, -20]]),
      W(r2, '2', u, 'D3', C.green, [[260, -20], [230, -20], [230, 10]]),
      W(op, 'E', u, 'GND.2', C.black, [[130, -20], [110, -20], [110, 30], [-14, 30], [-14, 250], [140, 250], [140, 200]]),
    ],
    code: `// Optocoupler test: D8 -> LED side, D3 reads the transistor side
void setup() {
  Serial.begin(9600);
  pinMode(8, OUTPUT);
  pinMode(3, INPUT);          // 10k pull-up is on the breadboard side
}

void loop() {
  digitalWrite(8, HIGH);
  delay(500);
  Serial.print("LED on  -> D3 = ");
  Serial.println(digitalRead(3) ? "HIGH" : "LOW");
  digitalWrite(8, LOW);
  delay(500);
  Serial.print("LED off -> D3 = ");
  Serial.println(digitalRead(3) ? "HIGH" : "LOW");
}
`,
  };
}

export const BUILDERS = [regulator5v, bmp280Weather, acs712Current, dipSwitch, optoIsolation];
void P;
