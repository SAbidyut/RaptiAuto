// More projects: shift register, music, IR remote, encoder, real-time clock, keypad lock.
import { P, plug, W, C, at, R, UNO, railPower } from './helpers.js';

export function shiftRegister() {
  const u = UNO();
  const bb = P('breadboard', 330, 60, {}, 0, 'bb');
  const ic = plug('74hc595', 'VCC', bb, 'e4', {}, 0, 'sr');
  const parts = [bb, u, ic];
  const wires = [
    ...railPower(u, bb),
    W(bb, 'a4', bb, 'tp.2', C.red),            // VCC
    W(bb, 'a7', bb, 'tn.5', C.black),          // OE  -> GND (outputs enabled)
    W(bb, 'a10', bb, 'tp.7', C.red),           // SRCLR -> 5V (no reset)
    W(bb, 'j11', bb, 'bn.8', C.black),         // GND
    W(bb, 'tn.34', bb, 'bn.34', C.black),      // join the two GND rails
    R(u, 'D2', bb, 'a6', C.blue, [-6]),        // SER (data)
    R(u, 'D3', bb, 'a8', C.green, [-14]),      // RCLK (latch)
    R(u, 'D4', bb, 'a9', C.yellow, [-22]),     // SRCLK (clock)
  ];
  // Eight LEDs, each with a 220 Ω resistor from its cathode straight into the GND rail.
  const anodes = [15, 18, 21, 24, 27, 30, 33, 36];
  const colors = ['red', 'red', 'yellow', 'yellow', 'green', 'green', 'blue', 'blue'];
  anodes.forEach((a, i) => {
    parts.push(plug('led', 'A', bb, 'h' + a, { color: colors[i] }));
    parts.push(plug('resistor', '1', bb, 'j' + (a + 1), { value: 220 }, 90));
  });
  // QA (top row) runs between rows c and d to the last LED; QB..QH (bottom row) loop under the board.
  wires.push(W(bb, 'c5', bb, 'g36', C.orange, [[370, 85], [680, 85]]));
  const outs = ['QB', 'QC', 'QD', 'QE', 'QF', 'QG', 'QH'];
  outs.forEach((q, i) => {
    const col = 4 + i, a = anodes[6 - i], lane = 284 - i * 8;
    const x0 = 330 + (col - 1) * 10, x1 = 330 + (a - 1) * 10;
    wires.push(W(bb, 'j' + col, bb, 'j' + a, [C.purple, C.blue, C.cyan, C.green, C.yellow, C.orange, C.pink][i], [[x0, lane], [x1, lane]]));
  });
  return {
    id: 'shift-register', name: '8 LEDs with 3 Pins (74HC595)', category: 'basics', level: 'intermediate',
    description: 'A 74HC595 shift register turns 3 Arduino pins into 8 outputs. Shows a binary counter and a light chaser with shiftOut().',
    parts, wires,
    code: `// 74HC595 shift register: 8 outputs from 3 pins
const int DATA_PIN = 2;    // SER   (pin 14)
const int LATCH_PIN = 3;   // RCLK  (pin 12)
const int CLOCK_PIN = 4;   // SRCLK (pin 11)

void writeByte(byte value) {
  digitalWrite(LATCH_PIN, LOW);
  shiftOut(DATA_PIN, CLOCK_PIN, MSBFIRST, value);
  digitalWrite(LATCH_PIN, HIGH);     // copy the shifted bits to the outputs
}

void setup() {
  pinMode(DATA_PIN, OUTPUT);
  pinMode(LATCH_PIN, OUTPUT);
  pinMode(CLOCK_PIN, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  // Binary counter 0..31
  for (int n = 0; n < 32; n++) {
    writeByte(n);
    Serial.print("Value: ");
    Serial.println(n, BIN);
    delay(120);
  }
  // Light chaser
  for (int i = 0; i < 8; i++) { writeByte(1 << i); delay(80); }
  for (int i = 7; i >= 0; i--) { writeByte(1 << i); delay(80); }
}
`,
  };
}

export function buzzerMelody() {
  const u = UNO();
  const bz = at('buzzer', '+', 174, -40, { kind: 'passive' }, 0, 'bz');
  return {
    id: 'buzzer-melody', name: 'Play a Melody (tone)', category: 'basics', level: 'beginner',
    description: 'Play "Happy Birthday" on a passive buzzer with tone(). Turn your phone volume up!',
    parts: [u, bz],
    wires: [
      R(bz, '+', u, 'D8', C.orange),
      R(bz, '-', u, 'GND.2', C.black, [-20, 292, 228]),
    ],
    code: `// Happy Birthday on a passive buzzer
#define NOTE_C4 262
#define NOTE_D4 294
#define NOTE_E4 330
#define NOTE_F4 349
#define NOTE_G4 392
#define NOTE_A4 440
#define NOTE_AS4 466
#define NOTE_C5 523

const int BUZZER = 8;

int melody[] = {
  NOTE_C4, NOTE_C4, NOTE_D4, NOTE_C4, NOTE_F4, NOTE_E4,
  NOTE_C4, NOTE_C4, NOTE_D4, NOTE_C4, NOTE_G4, NOTE_F4,
  NOTE_C4, NOTE_C4, NOTE_C5, NOTE_A4, NOTE_F4, NOTE_E4, NOTE_D4,
  NOTE_AS4, NOTE_AS4, NOTE_A4, NOTE_F4, NOTE_G4, NOTE_F4
};
// 4 = quarter note, 8 = eighth note, 2 = half note
int beats[] = {
  8, 8, 4, 4, 4, 2,
  8, 8, 4, 4, 4, 2,
  8, 8, 4, 4, 4, 4, 2,
  8, 8, 4, 4, 4, 2
};

void setup() {
  Serial.begin(9600);
}

void loop() {
  int notes = sizeof(melody) / sizeof(melody[0]);
  for (int i = 0; i < notes; i++) {
    int duration = 1000 / beats[i];
    tone(BUZZER, melody[i], duration);
    delay(duration * 1.3);       // short pause between notes
  }
  noTone(BUZZER);
  Serial.println("Happy Birthday!");
  delay(1500);
}
`,
  };
}

export function irRemote() {
  const u = UNO();
  const ir = at('ir-receiver', 'OUT', 240, -40, {}, 0, 'ir');
  return {
    id: 'ir-remote', name: 'IR Remote Control', category: 'sensors', level: 'intermediate',
    description: 'Decode an infrared remote with IRremote. Tap the receiver while running, press keys on the remote; 1 and 2 switch the built-in LED.',
    parts: [u, ir],
    wires: [
      R(ir, 'OUT', u, 'D2', C.green),
      R(ir, 'GND', u, 'GND.2', C.black, [-20, 284, 228]),
      R(ir, 'VCC', u, '5V', C.red, [-28, 292, 240]),
    ],
    code: `// IR remote receiver (IRremote library v4)
#include <IRremote.hpp>

const int IR_PIN = 2;

void setup() {
  Serial.begin(9600);
  pinMode(LED_BUILTIN, OUTPUT);
  IrReceiver.begin(IR_PIN, ENABLE_LED_FEEDBACK);
  Serial.println("Press a key on the remote...");
}

String keyName(uint8_t cmd) {
  switch (cmd) {
    case 0x16: return "0";
    case 0x0C: return "1";
    case 0x18: return "2";
    case 0x5E: return "3";
    case 0x08: return "4";
    case 0x1C: return "5";
    case 0x5A: return "6";
    case 0x42: return "7";
    case 0x52: return "8";
    case 0x4A: return "9";
    case 0x45: return "CH-";
    case 0x46: return "CH";
    case 0x47: return "CH+";
    case 0x15: return "VOL+";
    case 0x07: return "VOL-";
    case 0x43: return "PLAY";
    default:   return "?";
  }
}

void loop() {
  if (IrReceiver.decode()) {
    uint8_t cmd = IrReceiver.decodedIRData.command;
    Serial.print("Button: ");
    Serial.print(keyName(cmd));
    Serial.print("  (0x");
    Serial.print(cmd, HEX);
    Serial.println(")");
    if (cmd == 0x0C) digitalWrite(LED_BUILTIN, HIGH);   // key 1
    if (cmd == 0x18) digitalWrite(LED_BUILTIN, LOW);    // key 2
    IrReceiver.resume();
  }
}
`,
  };
}

export function rotaryEncoder() {
  const u = UNO();
  const enc = at('rotary-encoder', 'SW', 220, -40, {}, 0, 'enc');
  return {
    id: 'rotary-encoder', name: 'Rotary Encoder', category: 'sensors', level: 'intermediate',
    description: 'Count clicks of a KY-040 encoder (CLK/DT quadrature) and read its push button. Drag the knob to turn it, tap to press.',
    parts: [u, enc],
    wires: [
      R(enc, 'CLK', u, 'D2', C.yellow),
      R(enc, 'DT', u, 'D3', C.green),
      R(enc, 'SW', u, 'D4', C.blue),
      R(enc, 'GND', u, 'GND.1', C.black, [-20]),
      R(enc, '+', u, '5V', C.red, [-28, -24, 236]),
    ],
    code: `// Rotary encoder KY-040
const int CLK = 2;
const int DT = 3;
const int SW = 4;

int position = 0;
int lastClk;

void setup() {
  pinMode(CLK, INPUT);
  pinMode(DT, INPUT);
  pinMode(SW, INPUT_PULLUP);
  Serial.begin(9600);
  lastClk = digitalRead(CLK);
  Serial.println("Turn the knob!");
}

void loop() {
  int clk = digitalRead(CLK);
  if (clk != lastClk && clk == LOW) {      // falling edge on CLK = one click
    if (digitalRead(DT) != clk) position++;  // clockwise
    else position--;                         // counter-clockwise
    Serial.print("Position: ");
    Serial.println(position);
  }
  lastClk = clk;

  if (digitalRead(SW) == LOW) {
    position = 0;
    Serial.println("Reset to 0");
    delay(250);
  }
}
`,
  };
}

export function rtcClock() {
  const u = UNO();
  const rtc = at('rtc-ds1307', 'GND', 40, -40, {}, 0, 'rtc');
  const lcd = at('lcd-i2c', 'GND', 300, 290, { size: '1602', backlight: 'green', address: '39' }, 0, 'lcd');
  return {
    id: 'rtc-clock', name: 'Digital Clock (RTC DS3231)', category: 'displays', level: 'intermediate',
    description: 'A real-time clock keeps the time even when the Arduino is off. Both the RTC and the LCD share the I²C bus.',
    parts: [u, rtc, lcd],
    wires: [
      R(rtc, 'SCL', u, 'SCL', C.yellow, [-14]),
      R(rtc, 'SDA', u, 'SDA', C.blue, [-8]),
      R(rtc, 'GND', u, 'GND.2', C.black, [-30, -30, 284]),
      R(rtc, 'VCC', u, '3.3V', C.red, [-20, -22, 276]),
      R(u, '5V', lcd, 'VCC', C.red, [270]),
      R(u, 'GND.2', lcd, 'GND', C.black, [260]),
      R(u, 'A4', lcd, 'SDA', C.blue, [250]),
      R(u, 'A5', lcd, 'SCL', C.yellow, [240]),
    ],
    code: `// Digital clock: DS3231 real-time clock + LCD 16x2 I2C
#include <Wire.h>
#include <RTClib.h>
#include <LiquidCrystal_I2C.h>

RTC_DS3231 rtc;
LiquidCrystal_I2C lcd(0x27, 16, 2);
const char* days[] = { "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat" };

void print2(int v) {
  if (v < 10) lcd.print('0');
  lcd.print(v);
}

void setup() {
  Serial.begin(9600);
  lcd.init();
  lcd.backlight();
  if (!rtc.begin()) {
    lcd.print("RTC not found!");
    while (1);
  }
  if (rtc.lostPower()) {
    rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));   // set to compile time
  }
}

void loop() {
  DateTime now = rtc.now();
  lcd.setCursor(0, 0);
  lcd.print(days[now.dayOfTheWeek()]);
  lcd.print(' ');
  print2(now.day());
  lcd.print('/');
  print2(now.month());
  lcd.print('/');
  lcd.print(now.year());

  lcd.setCursor(4, 1);
  print2(now.hour());
  lcd.print(':');
  print2(now.minute());
  lcd.print(':');
  print2(now.second());

  Serial.println(now.timestamp());
  delay(500);
}
`,
  };
}

export function keypadLock() {
  const u = UNO();
  const kp = at('keypad-4x4', 'R1', 164, -40, {}, 0, 'kp');
  const sv = at('servo', 'GND', 300, 300, { model: 'sg90' }, 0, 'servo');
  const jog = (pin, kpin, i) => R(kp, kpin, u, pin, [C.orange, C.yellow, C.green, C.blue, C.purple, C.pink, C.cyan, C.white][i], [-20]);
  return {
    id: 'keypad-lock', name: 'Keypad Door Lock', category: 'displays', level: 'intermediate',
    description: 'Enter the code 1234 and press # to open the lock (servo turns, L LED lights). * clears. Tap the keypad to type.',
    parts: [u, kp, sv],
    wires: [
      jog('D9', 'R1', 0), jog('D8', 'R2', 1), jog('D7', 'R3', 2), jog('D6', 'R4', 3),
      jog('D5', 'C1', 4), jog('D4', 'C2', 5), jog('D3', 'C3', 6), jog('D2', 'C4', 7),
      R(u, 'A0', sv, 'PWM', C.orange, [308]),
      R(u, 'GND.3', sv, 'GND', C.black, [316]),
      R(u, '5V', sv, 'V+', C.red, [324]),
    ],
    code: `// Keypad door lock: code 1234, # = enter, * = clear
#include <Keypad.h>
#include <Servo.h>

const byte ROWS = 4, COLS = 4;
char keys[ROWS][COLS] = {
  { '1', '2', '3', 'A' },
  { '4', '5', '6', 'B' },
  { '7', '8', '9', 'C' },
  { '*', '0', '#', 'D' }
};
byte rowPins[ROWS] = { 9, 8, 7, 6 };
byte colPins[COLS] = { 5, 4, 3, 2 };
Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS);

Servo lock;
const String SECRET = "1234";
String input = "";

void setup() {
  Serial.begin(9600);
  pinMode(LED_BUILTIN, OUTPUT);
  lock.attach(A0);
  lock.write(0);                 // locked
  Serial.println("Enter code and press #");
}

void loop() {
  char key = keypad.getKey();
  if (!key) return;

  if (key == '*') {
    input = "";
    Serial.println("Cleared");
  } else if (key == '#') {
    if (input == SECRET) {
      Serial.println("Access granted - door open");
      digitalWrite(LED_BUILTIN, HIGH);
      lock.write(90);
      delay(3000);
      lock.write(0);
      digitalWrite(LED_BUILTIN, LOW);
      Serial.println("Locked again");
    } else {
      Serial.println("Wrong code!");
    }
    input = "";
  } else {
    input += key;
    Serial.print("Code: ");
    for (unsigned int i = 0; i < input.length(); i++) Serial.print('*');
    Serial.println();
  }
}
`,
  };
}
