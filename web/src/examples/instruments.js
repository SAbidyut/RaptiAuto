// Examples for the oscilloscope, logic analyser and function generator.
import { C, at, R, W, UNO } from './helpers.js';

export function scopePwm() {
  const u = UNO();
  const sc = at('oscilloscope', 'CH1', 150, -40, { tdiv0: '9' }, 0, 'scope');
  return {
    id: 'scope-pwm', name: 'Oscilloscope: square, PWM and tone', category: 'tools', level: 'beginner',
    description: 'See three kinds of signal on the 4-channel oscilloscope: a 1 kHz square wave (CH1), analogWrite() PWM that sweeps its duty cycle (CH2) and a 440 Hz tone (CH3). Open the scope controls while running to change the time per division.',
    parts: [u, sc],
    wires: [
      R(sc, 'CH1', u, 'D8', C.yellow, [-20]),
      R(sc, 'CH2', u, 'D9', C.cyan, [-26]),
      R(sc, 'CH3', u, 'D6', C.pink, [-32]),
      R(sc, 'GND', u, 'GND.1', C.black, [-38]),
    ],
    code: `// Three signals for the oscilloscope
//  CH1 (D8): 1 kHz square wave made with delayMicroseconds()
//  CH2 (D9): PWM from analogWrite(), duty sweeps 0 -> 100 %
//  CH3 (D6): 440 Hz tone

int duty = 0;
int dir = 5;
unsigned long lastStep = 0;

void setup() {
  pinMode(8, OUTPUT);
  tone(6, 440);
}

void loop() {
  digitalWrite(8, HIGH);
  delayMicroseconds(500);
  digitalWrite(8, LOW);
  delayMicroseconds(500);

  if (millis() - lastStep > 40) {      // change the duty cycle every 40 ms
    lastStep = millis();
    duty += dir;
    if (duty >= 255 || duty <= 0) dir = -dir;
    analogWrite(9, duty);
  }
}
`,
  };
}

export function logicBitbang() {
  const u = UNO();
  const la = at('logic-analyzer', 'D0', 120, -40, { tdiv0: '6' }, 0, 'la');
  return {
    id: 'logic-bitbang', name: 'Logic analyzer: bit-banged data', category: 'tools', level: 'intermediate',
    description: 'The sketch shifts the byte 0xA5 out on a data pin with a clock and a latch pulse — exactly what a 74HC595 sees. The logic analyzer shows DATA, CLOCK and LATCH together; zoom with the time/div slider.',
    parts: [u, la],
    wires: [
      R(la, 'D0', u, 'D2', C.yellow, [-20]),
      R(la, 'D1', u, 'D3', C.cyan, [-26]),
      R(la, 'D2', u, 'D4', C.pink, [-32]),
      R(la, 'GND', u, 'GND.1', C.black, [-38]),
    ],
    code: `// Bit-banged shift register protocol: DATA (D2), CLOCK (D3), LATCH (D4)
const int DATA = 2, CLOCK = 3, LATCH = 4;

void sendByte(byte value) {
  digitalWrite(LATCH, LOW);
  for (int bit = 7; bit >= 0; bit--) {
    digitalWrite(DATA, (value >> bit) & 1);   // MSB first
    delayMicroseconds(40);
    digitalWrite(CLOCK, HIGH);                // data is read on the rising edge
    delayMicroseconds(40);
    digitalWrite(CLOCK, LOW);
  }
  digitalWrite(LATCH, HIGH);                  // copy to the output pins
  delayMicroseconds(40);
  digitalWrite(LATCH, LOW);
}

void setup() {
  pinMode(DATA, OUTPUT);
  pinMode(CLOCK, OUTPUT);
  pinMode(LATCH, OUTPUT);
}

void loop() {
  sendByte(0xA5);        // 10100101
  delay(10);
}
`,
  };
}

export function fgAdc() {
  const u = UNO();
  const fg = at('function-generator', 'OUT', 150, -40, { wave: 'sine' }, 0, 'fg');
  const sc = at('oscilloscope', 'CH1', 20, -40, { tdiv0: '15' }, 0, 'scope');
  return {
    id: 'fg-adc', name: 'Function generator → analogRead()', category: 'tools', level: 'intermediate',
    description: 'A slow sine wave from the function generator is read with analogRead() and drawn in the Serial Plotter, while the oscilloscope shows the same signal. Change the frequency and amplitude in the generator controls.',
    parts: [u, fg, sc],
    wires: [
      R(fg, 'OUT', u, 'A0', C.orange, [-60, 300, 230]),
      R(fg, 'GND', u, 'GND.2', C.black, [-70, 310, 240]),
      R(sc, 'CH1', fg, 'OUT', C.yellow, [-50]),
      R(sc, 'GND', fg, 'GND', C.black, [-56]),
    ],
    code: `// Sample a function generator with the ADC and print for the Serial Plotter
void setup() {
  Serial.begin(115200);
}

void loop() {
  int raw = analogRead(A0);
  float volts = raw * 5.0 / 1023.0;
  Serial.print("V:");
  Serial.println(volts);
  delay(20);            // 50 samples per second
}
`,
  };
}

export const BUILDERS = [scopePwm, logicBitbang, fgAdc];
