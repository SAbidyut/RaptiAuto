// Beginner examples: LEDs, buttons, potentiometers, Serial.
import { P, plug, rail, W, C } from './helpers.js';

const uno = () => P('uno-r3', 0, 0, {}, 0, 'uno');
const half = () => P('breadboard-half', 330, 60, {}, 0, 'bb');

export function blink() {
  return {
    id: 'blink', name: 'Blink', category: 'basics', level: 'beginner',
    description: 'The "Hello World" of Arduino — blink the built-in LED on pin 13.',
    parts: [uno()], wires: [],
    code: `// Blink — the built-in LED (L) turns on and off every second.

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);   // pin 13 on the Uno
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);  // LED on
  delay(1000);                      // wait 1 second
  digitalWrite(LED_BUILTIN, LOW);   // LED off
  delay(1000);
}
`,
  };
}

export function ledResistor() {
  const u = uno(), bb = half();
  const r = plug('resistor', '1', bb, 'e10', { value: 220 });
  const l = plug('led', 'A', bb, 'c14', { color: 'red' });
  return {
    id: 'led-resistor', name: 'LED + Resistor', category: 'basics', level: 'beginner',
    description: 'Your first breadboard circuit: an LED with a 220 Ω current-limiting resistor.',
    parts: [bb, u, r, l],
    wires: [
      W(u, 'D13', bb, 'a10', C.green, [[124, -12], [420, -12]]),
      W(bb, 'a15', bb, rail(bb, 'tn', 15), C.black),
      W(u, 'GND.1', bb, rail(bb, 'tn', 24), C.black, [[114, -24], [560, -24]]),
    ],
    code: `// LED + Resistor
// Pin 13 -> 220 ohm resistor -> LED anode (long leg) -> LED cathode -> GND
// Try: remove the resistor in the circuit and see what happens!

const int LED_PIN = 13;

void setup() {
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_PIN, HIGH);
  delay(500);
  digitalWrite(LED_PIN, LOW);
  delay(500);
}
`,
  };
}

export function buttonLed() {
  const u = uno(), bb = half();
  const btn = plug('pushbutton', '1.l', bb, 'e20', { color: 'blue' });
  const r = plug('resistor', '1', bb, 'e6', { value: 220 });
  const l = plug('led', 'A', bb, 'c10', { color: 'green' });
  return {
    id: 'button-led', name: 'Button controls LED', category: 'basics', level: 'beginner',
    description: 'Read a push button with INPUT_PULLUP and switch an LED. Press the button while running!',
    parts: [bb, u, btn, r, l],
    wires: [
      W(u, 'D2', bb, 'a20', C.blue, [[240, -12], [520, -12]]),
      W(bb, 'j20', bb, rail(bb, 'bn', 20), C.black),
      W(u, 'D13', bb, 'a6', C.green, [[124, -24], [380, -24]]),
      W(bb, 'a11', bb, rail(bb, 'tn', 11), C.black),
      W(bb, rail(bb, 'tn', 29), bb, rail(bb, 'bn', 29), C.black, [[650, 30], [650, 210]]),
      W(u, 'GND.2', bb, rail(bb, 'bn', 2), C.black, [[140, 240], [340, 240]]),
    ],
    code: `// Button controls LED
// The button connects pin 2 to GND when pressed.
// INPUT_PULLUP keeps the pin HIGH when the button is released.

const int BUTTON_PIN = 2;
const int LED_PIN = 13;

void setup() {
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int state = digitalRead(BUTTON_PIN);
  if (state == LOW) {          // pressed
    digitalWrite(LED_PIN, HIGH);
  } else {
    digitalWrite(LED_PIN, LOW);
  }
  static int last = HIGH;
  if (state != last) {
    Serial.println(state == LOW ? "Pressed" : "Released");
    last = state;
  }
  delay(10);
}
`,
  };
}

export function trafficLight() {
  const u = uno(), bb = half();
  const parts = [bb, u];
  const wires = [];
  const leds = [['red', 'D12', 8], ['yellow', 'D11', 16], ['green', 'D10', 24]];
  leds.forEach(([color, pin, x], i) => {
    const r = plug('resistor', '1', bb, 'e' + (x - 4), { value: 220 });
    const l = plug('led', 'A', bb, 'c' + x, { color });
    parts.push(r, l);
    const ux = { D12: 134, D11: 144, D10: 154 }[pin];
    wires.push(W(u, pin, bb, 'a' + (x - 4), [C.red, C.yellow, C.green][i], [[ux, -8 - i * 9], [330 + (x - 5) * 10, -8 - i * 9]]));
    wires.push(W(bb, 'a' + (x + 1), bb, rail(bb, 'tn', x + 1), C.black));
  });
  wires.push(W(u, 'GND.1', bb, rail(bb, 'tn', 29), C.black, [[114, -40], [610, -40]]));
  return {
    id: 'traffic-light', name: 'Traffic Light', category: 'basics', level: 'beginner',
    description: 'Red → green → yellow sequence with three LEDs, just like a real junction.',
    parts, wires,
    code: `// Traffic light
const int RED = 12;
const int YELLOW = 11;
const int GREEN = 10;

void setup() {
  pinMode(RED, OUTPUT);
  pinMode(YELLOW, OUTPUT);
  pinMode(GREEN, OUTPUT);
  Serial.begin(9600);
}

void light(int pin, int ms, const char* name) {
  digitalWrite(RED, LOW);
  digitalWrite(YELLOW, LOW);
  digitalWrite(GREEN, LOW);
  digitalWrite(pin, HIGH);
  Serial.println(name);
  delay(ms);
}

void loop() {
  light(RED, 3000, "STOP");
  light(GREEN, 3000, "GO");
  light(YELLOW, 1000, "WAIT");
}
`,
  };
}

export function fadePot() {
  const u = uno(), bb = half();
  const pot = plug('potentiometer', 'GND', bb, 'j6');
  const r = plug('resistor', '1', bb, 'e16', { value: 220 });
  const l = plug('led', 'A', bb, 'c20', { color: 'blue' });
  return {
    id: 'fade-pot', name: 'Dimmer with Potentiometer', category: 'basics', level: 'beginner',
    description: 'Turn the knob to change LED brightness using analogRead() and PWM. Open the Serial Plotter!',
    parts: [bb, u, pot, r, l],
    wires: [
      W(u, '5V', bb, rail(bb, 'bp', 3), C.red, [[130, 236], [350, 236]]),
      W(u, 'GND.2', bb, rail(bb, 'bn', 2), C.black, [[140, 246], [340, 246]]),
      W(bb, rail(bb, 'bn', 6), bb, 'i6', C.black),
      W(bb, rail(bb, 'bp', 8), bb, 'i8', C.red),
      W(u, 'A0', bb, 'g7', C.yellow, [[190, 226], [300, 226], [300, 150], [390, 150]]),
      W(u, 'D9', bb, 'a16', C.green, [[164, -12], [480, -12]]),
      W(bb, 'a21', bb, rail(bb, 'tn', 21), C.black),
      W(bb, rail(bb, 'tn', 29), bb, rail(bb, 'bn', 29), C.black, [[650, 30], [650, 210]]),
    ],
    code: `// Dimmer: potentiometer -> LED brightness
const int POT = A0;
const int LED = 9;      // PWM pin (~)

void setup() {
  pinMode(LED, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int raw = analogRead(POT);             // 0 .. 1023
  int brightness = map(raw, 0, 1023, 0, 255);
  analogWrite(LED, brightness);          // 0 .. 255
  Serial.print("pot:");
  Serial.print(raw);
  Serial.print(" pwm:");
  Serial.println(brightness);
  delay(50);
}
`,
  };
}

export function rgbLed() {
  const u = uno(), bb = half();
  const rgb = plug('rgb-led', 'R', bb, 'h10', { common: 'cathode' });
  const rr = plug('resistor', '1', bb, 'd10', { value: 220 }, 90);
  const rg = plug('resistor', '1', bb, 'd12', { value: 220 }, 90);
  const rb = plug('resistor', '1', bb, 'd14', { value: 220 }, 90);
  return {
    id: 'rgb-led', name: 'RGB Colour Mixer', category: 'basics', level: 'beginner',
    description: 'Mix red, green and blue with PWM to make a smooth rainbow.',
    parts: [bb, u, rgb, rr, rg, rb],
    wires: [
      W(u, 'D9', bb, 'a10', C.red, [[164, -10], [420, -10]]),
      W(u, 'D10', bb, 'a12', C.green, [[154, -20], [440, -20]]),
      W(u, 'D11', bb, 'a14', C.blue, [[144, -30], [460, -30]]),
      W(bb, 'g14', bb, 'i13', C.blue),
      W(bb, 'j11', bb, rail(bb, 'bn', 11), C.black),
      W(u, 'GND.2', bb, rail(bb, 'bn', 2), C.black, [[140, 240], [340, 240]]),
    ],
    code: `// RGB LED rainbow (common cathode)
const int R = 9, G = 10, B = 11;

void setColor(int r, int g, int b) {
  analogWrite(R, r);
  analogWrite(G, g);
  analogWrite(B, b);
}

void setup() {
  Serial.begin(9600);
}

void loop() {
  for (int i = 0; i < 256; i += 3) { setColor(255 - i, i, 0); delay(15); }  // red -> green
  for (int i = 0; i < 256; i += 3) { setColor(0, 255 - i, i); delay(15); }  // green -> blue
  for (int i = 0; i < 256; i += 3) { setColor(i, 0, 255 - i); delay(15); }  // blue -> red
}
`,
  };
}

export function knightRider() {
  const u = uno(), bb = half();
  const parts = [bb, u];
  const wires = [];
  const pins = [['D2', 240], ['D3', 230], ['D4', 220], ['D5', 210], ['D6', 200], ['D7', 190]];
  pins.forEach(([pin, ux], i) => {
    const col = 4 + i * 4;
    const r = plug('resistor', '1', bb, 'd' + col, { value: 220 }, 90);
    const l = plug('led', 'A', bb, 'h' + col, { color: 'red' });
    parts.push(r, l);
    wires.push(W(u, pin, bb, 'a' + col, [C.orange, C.yellow, C.green, C.blue, C.purple, C.cyan][i], [[ux, -8 - i * 6], [330 + (col - 1) * 10, -8 - i * 6]]));
    wires.push(W(bb, 'j' + (col + 1), bb, rail(bb, 'bn', col + 1), C.black));
  });
  wires.push(W(u, 'GND.2', bb, rail(bb, 'bn', 2), C.black, [[140, 240], [340, 240]]));
  return {
    id: 'knight-rider', name: 'LED Chaser (Knight Rider)', category: 'basics', level: 'beginner',
    description: 'Six LEDs scanning back and forth using arrays and for-loops.',
    parts, wires,
    code: `// Knight Rider LED chaser
int leds[] = {2, 3, 4, 5, 6, 7};
const int COUNT = sizeof(leds) / sizeof(leds[0]);

void setup() {
  for (int i = 0; i < COUNT; i++) pinMode(leds[i], OUTPUT);
}

void loop() {
  for (int i = 0; i < COUNT; i++) {
    digitalWrite(leds[i], HIGH);
    delay(80);
    digitalWrite(leds[i], LOW);
  }
  for (int i = COUNT - 2; i > 0; i--) {
    digitalWrite(leds[i], HIGH);
    delay(80);
    digitalWrite(leds[i], LOW);
  }
}
`,
  };
}

export function burnDemo() {
  const u = uno(), bb = half();
  const l1 = plug('led', 'A', bb, 'c8', { color: 'red' });
  const r = plug('resistor', '1', bb, 'e14', { value: 220 });
  const l2 = plug('led', 'A', bb, 'c18', { color: 'green' });
  return {
    id: 'burn-demo', name: 'Why Resistors Matter', category: 'basics', level: 'beginner',
    description: 'Two LEDs: one with a resistor, one without. Run it and watch what happens to the unprotected LED!',
    parts: [bb, u, l1, r, l2],
    wires: [
      W(u, 'D12', bb, 'a8', C.orange, [[134, -12], [400, -12]]),
      W(bb, 'a9', bb, rail(bb, 'tn', 9), C.black),
      W(u, 'D11', bb, 'a14', C.green, [[144, -24], [460, -24]]),
      W(bb, 'a19', bb, rail(bb, 'tn', 19), C.black),
      W(u, 'GND.1', bb, rail(bb, 'tn', 27), C.black, [[114, -36], [590, -36]]),
    ],
    code: `// Why resistors matter
// LED on pin 12 has NO resistor  -> too much current -> it burns out!
// LED on pin 11 has a 220 ohm resistor -> safe ~12 mA

void setup() {
  pinMode(12, OUTPUT);
  pinMode(11, OUTPUT);
  Serial.begin(9600);
  Serial.println("Turning both LEDs on...");
}

void loop() {
  digitalWrite(12, HIGH);
  digitalWrite(11, HIGH);
  delay(1000);
}
`,
  };
}

export function serialCommands() {
  const u = uno(), bb = half();
  const r = plug('resistor', '1', bb, 'e10', { value: 220 });
  const l = plug('led', 'A', bb, 'c14', { color: 'yellow' });
  return {
    id: 'serial-commands', name: 'Serial Commands', category: 'basics', level: 'intermediate',
    description: 'Type "on", "off" or "blink 5" in the Serial Monitor to control the LED.',
    parts: [bb, u, r, l],
    wires: [
      W(u, 'D13', bb, 'a10', C.yellow, [[124, -12], [420, -12]]),
      W(bb, 'a15', bb, rail(bb, 'tn', 15), C.black),
      W(u, 'GND.1', bb, rail(bb, 'tn', 24), C.black, [[114, -24], [560, -24]]),
    ],
    code: `// Serial commands: on | off | blink <n>
const int LED = 13;

void setup() {
  pinMode(LED, OUTPUT);
  Serial.begin(9600);
  Serial.println("Commands: on, off, blink <times>");
}

void loop() {
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\\n');
    cmd.trim();
    cmd.toLowerCase();
    if (cmd == "on") {
      digitalWrite(LED, HIGH);
      Serial.println("LED is ON");
    } else if (cmd == "off") {
      digitalWrite(LED, LOW);
      Serial.println("LED is OFF");
    } else if (cmd.startsWith("blink")) {
      int n = cmd.substring(5).toInt();
      if (n <= 0) n = 3;
      Serial.print("Blinking ");
      Serial.print(n);
      Serial.println(" times");
      for (int i = 0; i < n; i++) {
        digitalWrite(LED, HIGH); delay(200);
        digitalWrite(LED, LOW);  delay(200);
      }
    } else {
      Serial.print("Unknown command: ");
      Serial.println(cmd);
    }
  }
}
`,
  };
}

export function nightLight() {
  const u = uno(), bb = half();
  const ldr = plug('ldr', '1', bb, 'c6');
  const r10 = plug('resistor', '1', bb, 'd7', { value: 10000 }, 90);
  const r = plug('resistor', '1', bb, 'e16', { value: 220 });
  const l = plug('led', 'A', bb, 'c20', { color: 'white' });
  return {
    id: 'night-light', name: 'Automatic Night Light', category: 'basics', level: 'intermediate',
    description: 'A light sensor (LDR) turns the LED on when it gets dark. Tap the LDR while running to change the light level.',
    parts: [bb, u, ldr, r10, r, l],
    wires: [
      W(u, '5V', bb, rail(bb, 'tp', 3), C.red, [[130, 236], [300, 236], [300, 0], [350, 0]]),
      W(bb, rail(bb, 'tp', 6), bb, 'a6', C.red),
      W(bb, 'j7', bb, rail(bb, 'bn', 7), C.black),
      W(u, 'A0', bb, 'a7', C.yellow, [[190, 226], [290, 226], [290, 46], [390, 46]]),
      W(u, 'D9', bb, 'a16', C.green, [[164, -12], [480, -12]]),
      W(bb, 'a21', bb, rail(bb, 'tn', 21), C.black),
      W(bb, rail(bb, 'tn', 29), bb, rail(bb, 'bn', 29), C.black, [[650, 30], [650, 210]]),
      W(u, 'GND.2', bb, rail(bb, 'bn', 2), C.black, [[140, 246], [340, 246]]),
    ],
    code: `// Automatic night light with an LDR voltage divider
const int LDR = A0;
const int LED = 9;
const int DARK = 300;   // adjust threshold

void setup() {
  pinMode(LED, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int light = analogRead(LDR);
  Serial.print("light:");
  Serial.println(light);
  if (light < DARK) {
    // darker -> brighter LED
    analogWrite(LED, map(light, 0, DARK, 255, 40));
  } else {
    analogWrite(LED, 0);
  }
  delay(100);
}
`,
  };
}

export function esp32Fade() {
  const esp = P('esp32-devkit', 30, 0, {}, 0, 'esp');
  const bb = P('breadboard-half', 240, 40, {}, 0, 'bb');
  const r = plug('resistor', '1', bb, 'e8', { value: 220 });
  const l = plug('led', 'A', bb, 'c12', { color: 'purple' });
  return {
    id: 'esp32-fade', name: 'ESP32 Breathing LED', category: 'iot', level: 'beginner',
    description: 'Smooth LED fading on an ESP32 using the LEDC PWM peripheral.',
    parts: [bb, esp, r, l],
    wires: [
      W(esp, 'D2', bb, 'a8', C.purple, [[140, 116], [215, 116], [215, 24], [310, 24]]),
      W(bb, 'a13', bb, rail(bb, 'tn', 13), C.black),
      W(esp, 'GND.2', bb, rail(bb, 'tn', 3), C.black, [[160, 126], [225, 126], [225, 10]]),
    ],
    code: `// ESP32 breathing LED with LEDC PWM
const int LED_PIN = 2;

void setup() {
  Serial.begin(115200);
  ledcAttach(LED_PIN, 5000, 8);   // pin, frequency, resolution (ESP32 core 3.x)
  Serial.println("ESP32 breathing LED");
}

void loop() {
  for (int d = 0; d <= 255; d += 5) { ledcWrite(LED_PIN, d); delay(20); }
  for (int d = 255; d >= 0; d -= 5) { ledcWrite(LED_PIN, d); delay(20); }
}
`,
  };
}

export function picoBlink() {
  const pico = P('rpi-pico', 0, 0, {}, 0, 'pico');
  return {
    id: 'pico-blink', name: 'Raspberry Pi Pico Blink', category: 'iot', level: 'beginner',
    description: 'Blink the on-board LED (GP25) of a Raspberry Pi Pico using the Arduino core.',
    parts: [pico], wires: [],
    code: `// Raspberry Pi Pico — blink the onboard LED
void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
  Serial.begin(115200);
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  Serial.println("LED on");
  delay(300);
  digitalWrite(LED_BUILTIN, LOW);
  Serial.println("LED off");
  delay(300);
}
`,
  };
}

export function voltageDivider() {
  const bat = P('battery-9v', 20, 30, {}, 0, 'bat');
  const bb = P('breadboard-mini', 130, 60, {}, 0, 'bb');
  const r1 = plug('resistor', '1', bb, 'a3', { value: 10000 });
  const r2 = plug('resistor', '1', bb, 'b7', { value: 4700 });
  const vm = P('voltmeter', 340, 200, {}, 0, 'vm');
  const lamp = P('lamp', 340, 30, { rating: '12' }, 0, 'lamp');
  return {
    id: 'voltage-divider', name: 'Voltage Divider (no code)', category: 'electrical', level: 'beginner',
    description: 'Pure electronics: a 9 V battery, two resistors, a bulb and a multimeter. Vout = Vin × R2 / (R1 + R2).',
    parts: [bb, bat, r1, r2, vm, lamp],
    wires: [
      W(bat, '+', bb, 'c3', C.red, [[40, 10], [110, 10], [110, 80], [150, 80]]),
      W(bat, '-', bb, 'c11', C.black, [[20, 150], [230, 150], [230, 80]]),
      W(bb, 'd7', vm, 'V', C.red, [[190, 180], [360, 180]]),
      W(bb, 'd11', vm, 'COM', C.black, [[230, 190], [340, 190]]),
      W(bat, '+', lamp, '1', C.red, [[40, 0], [340, 0]]),
      W(bat, '-', lamp, '2', C.black, [[0, 30], [0, 160], [300, 160], [300, 50], [360, 50]]),
    ],
    code: `// This example has no microcontroller.
// Press Run to simulate the electronics only.
`,
  };
}
