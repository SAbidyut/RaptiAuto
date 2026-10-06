// Examples for the group B parts (motor drivers, communication, robotics).
import { P, at, W, R, C, UNO } from './helpers.js';

export function tb6612Motors() {
  const u = UNO();
  const drv = at('tb6612', 'VM', 60, -60, {}, 0, 'drv');
  const m1 = at('dc-motor', '1', 40, -190, { look: 'wheel' }, 0, 'm1');
  const m2 = at('dc-motor', '1', 150, -190, { look: 'wheel' }, 0, 'm2');
  const bat = at('battery-aa4', '-', 320, -80, {}, 0, 'bat');
  return {
    id: 'tb6612-motors', name: 'Two motors with a TB6612 driver', category: 'motors', level: 'intermediate',
    description: 'A TB6612FNG H-bridge runs two DC motors from a 4×AA pack: direction pins AIN / BIN, speed on the PWM pins D10 / D6, and STBY on D9. The sketch ramps both motors forward and back.',
    parts: [u, drv, m1, m2, bat],
    wires: [
      R(drv, 'AIN1', u, 'D12', C.yellow, [-52]), R(drv, 'AIN2', u, 'D11', C.green, [-46]), R(drv, 'PWMA', u, 'D10', C.orange, [-40]),
      R(drv, 'STBY', u, 'D9', C.purple, [-34]), R(drv, 'BIN1', u, 'D8', C.yellow, [-28]), R(drv, 'BIN2', u, 'D7', C.green, [-22]),
      R(drv, 'PWMB', u, 'D6', C.orange, [-16]),
      W(drv, 'AO1', m1, '1', C.red, [[70, -170], [40, -170]]), W(drv, 'AO2', m1, '2', C.black, [[80, -150], [60, -150]]),
      W(drv, 'BO1', m2, '1', C.red, [[140, -150], [150, -150]]), W(drv, 'BO2', m2, '2', C.black, [[130, -165], [170, -165]]),
      W(bat, '+', drv, 'VM', C.red, [[330, -100], [60, -100]]),
      W(bat, '-', drv, 'GND', C.black, [[320, -96], [80, -96]]),
      R(drv, 'VCC', u, '5V', C.red, [-56, -22, 230]),
      R(bat, '-', u, 'GND.2', C.black, [260, 140]),
    ],
    code: `// TB6612FNG dual motor driver
const int AIN1 = 12, AIN2 = 11, PWMA = 10;
const int BIN1 = 8,  BIN2 = 7,  PWMB = 6;
const int STBY = 9;

void motor(int in1, int in2, int pwm, int speed) {       // speed -255 .. 255
  digitalWrite(in1, speed > 0);
  digitalWrite(in2, speed < 0);
  analogWrite(pwm, abs(speed));
}

void setup() {
  Serial.begin(9600);
  int pins[] = {AIN1, AIN2, PWMA, BIN1, BIN2, PWMB, STBY};
  for (int i = 0; i < 7; i++) pinMode(pins[i], OUTPUT);
  digitalWrite(STBY, HIGH);               // driver on
}

void loop() {
  for (int s = 0; s <= 255; s += 15) { motor(AIN1, AIN2, PWMA, s); motor(BIN1, BIN2, PWMB, s); delay(60); }
  Serial.println("full speed forward");
  delay(800);
  for (int s = 255; s >= -255; s -= 15) { motor(AIN1, AIN2, PWMA, s); motor(BIN1, BIN2, PWMB, s); delay(60); }
  Serial.println("full speed reverse");
  delay(800);
  for (int s = -255; s <= 0; s += 15) { motor(AIN1, AIN2, PWMA, s); motor(BIN1, BIN2, PWMB, s); delay(60); }
  delay(500);
}
`,
  };
}

export function robotCar() {
  const u = UNO();
  const drv = at('tb6612', 'VM', 60, -60, {}, 0, 'drv');
  const car = at('robot-car', 'L+', 10, -200, {}, 0, 'car');
  const bat = at('battery-aa4', '-', 330, -80, {}, 0, 'bat');
  return {
    id: 'robot-car-drive', name: 'Robot car: drive a square', category: 'robotics', level: 'intermediate',
    description: 'A two-wheel robot in a small arena, driven by a TB6612 and an Arduino: forward, turn, forward, turn… The trail on the floor shows the path it drove. Use the controls to put the car back at the start.',
    parts: [u, drv, car, bat],
    wires: [
      R(drv, 'AIN1', u, 'D12', C.yellow, [-52]), R(drv, 'AIN2', u, 'D11', C.green, [-46]), R(drv, 'PWMA', u, 'D10', C.orange, [-40]),
      R(drv, 'STBY', u, 'D9', C.purple, [-34]), R(drv, 'BIN1', u, 'D8', C.yellow, [-28]), R(drv, 'BIN2', u, 'D7', C.green, [-22]),
      R(drv, 'PWMB', u, 'D6', C.orange, [-16]),
      W(drv, 'AO1', car, 'L+', C.red, [[70, -170], [10, -170]]), W(drv, 'AO2', car, 'L-', C.black, [[80, -160], [20, -160]]),
      W(drv, 'BO1', car, 'R+', C.red, [[140, -160], [150, -160]]), W(drv, 'BO2', car, 'R-', C.black, [[130, -170], [160, -170]]),
      W(bat, '+', drv, 'VM', C.red, [[340, -100], [60, -100]]),
      W(bat, '-', drv, 'GND', C.black, [[330, -96], [80, -96]]),
      R(drv, 'VCC', u, '5V', C.red, [-56, -22, 230]),
      R(bat, '-', u, 'GND.2', C.black, [270, 140]),
    ],
    code: `// Drive a robot car in a square (TB6612 driver)
const int AIN1 = 12, AIN2 = 11, PWMA = 10;
const int BIN1 = 8,  BIN2 = 7,  PWMB = 6;
const int STBY = 9;

void drive(int left, int right) {            // -255 .. 255 for each wheel
  digitalWrite(AIN1, left > 0);  digitalWrite(AIN2, left < 0);  analogWrite(PWMA, abs(left));
  digitalWrite(BIN1, right > 0); digitalWrite(BIN2, right < 0); analogWrite(PWMB, abs(right));
}

void setup() {
  Serial.begin(9600);
  int pins[] = {AIN1, AIN2, PWMA, BIN1, BIN2, PWMB, STBY};
  for (int i = 0; i < 7; i++) pinMode(pins[i], OUTPUT);
  digitalWrite(STBY, HIGH);
}

void loop() {
  for (int side = 0; side < 4; side++) {
    Serial.print("side "); Serial.println(side + 1);
    drive(150, 150);  delay(900);            // straight ahead
    drive(160, -160); delay(520);            // spin on the spot (about 90 degrees)
    drive(0, 0);      delay(200);
  }
  Serial.println("square done");
  delay(1500);
}
`,
  };
}

export function bluetoothLed() {
  const u = UNO();
  const bt = at('hc05', 'STATE', 100, -60, {}, 0, 'bt');
  const r = at('resistor', '1', 200, -100, { value: 330 }, 0, 'r');
  const led = at('led', 'A', 270, -100, { color: 'blue' }, 0, 'led');
  return {
    id: 'bluetooth-led', name: 'Bluetooth LED control (HC-05)', category: 'comm', level: 'beginner',
    description: 'Control an LED from a virtual phone. HC-05 TXD → pin 10 and RXD → pin 11 (SoftwareSerial). Run, tap the HC-05, press Connect phone, then send ON or OFF. In real life use a voltage divider on RXD (5 V → 3.3 V).',
    parts: [u, bt, r, led],
    wires: [
      R(bt, 'TXD', u, 'D10', C.green, [-40]), R(bt, 'RXD', u, 'D11', C.yellow, [-30]),
      R(bt, 'GND', u, 'GND.1', C.black, [-22]), R(bt, 'VCC', u, '5V', C.red, [-50, -22, 230]),
      R(r, '1', u, 'D8', C.orange, [-80]), W(r, '2', led, 'A', C.orange),
      R(led, 'C', u, 'GND.1', C.black, [-70]),
    ],
    code: `// LED control over Bluetooth (HC-05 on SoftwareSerial)
#include <SoftwareSerial.h>

SoftwareSerial bluetooth(10, 11);     // RX, TX
const int LED = 8;

void setup() {
  Serial.begin(9600);
  bluetooth.begin(9600);
  pinMode(LED, OUTPUT);
  bluetooth.println("Send ON or OFF");
}

String command = "";

void loop() {
  while (bluetooth.available()) {
    char c = bluetooth.read();
    if (c == '\\n') {
      command.trim();
      command.toUpperCase();
      Serial.print("Command: "); Serial.println(command);
      if (command == "ON" || command == "1") {
        digitalWrite(LED, HIGH);
        bluetooth.println("LED is ON");
      } else if (command == "OFF" || command == "0") {
        digitalWrite(LED, LOW);
        bluetooth.println("LED is OFF");
      } else {
        bluetooth.println("Unknown command");
      }
      command = "";
    } else {
      command += c;
    }
  }
}
`,
  };
}

export function gpsTracker() {
  const u = UNO();
  const gps = at('gps-neo6m', 'VCC', 100, -60, {}, 0, 'gps');
  return {
    id: 'gps-tracker', name: 'GPS position (NEO-6M)', category: 'comm', level: 'intermediate',
    description: 'Read NMEA sentences from a GPS module on SoftwareSerial pin 4 and print the position. After about 6 s the module gets a fix. Tap the module while running to move it on the map.',
    parts: [u, gps],
    wires: [
      R(gps, 'TXD', u, 'D4', C.green, [-40]),
      R(gps, 'GND', u, 'GND.1', C.black, [-26]), R(gps, 'VCC', u, '5V', C.red, [-50, -22, 230]),
    ],
    code: `// GPS NEO-6M: parse the $GPRMC sentence (position, speed)
#include <SoftwareSerial.h>

SoftwareSerial gpsSerial(4, 3);       // RX = 4 (GPS TXD), TX = 3 (unused)
String line = "";

// Returns field number n (0 = "$GPRMC") of a comma separated sentence
String field(String s, int n) {
  int start = 0;
  for (int i = 0; i < n; i++) {
    start = s.indexOf(',', start) + 1;
    if (start == 0) return "";
  }
  int end = s.indexOf(',', start);
  if (end < 0) end = s.length();
  return s.substring(start, end);
}

// ddmm.mmmm -> decimal degrees
float toDegrees(String v, String hemi) {
  float raw = v.toFloat();
  int deg = (int)(raw / 100);
  float d = deg + (raw - deg * 100) / 60.0;
  return (hemi == "S" || hemi == "W") ? -d : d;
}

void setup() {
  Serial.begin(9600);
  gpsSerial.begin(9600);
  Serial.println("Waiting for a GPS fix...");
}

void loop() {
  while (gpsSerial.available()) {
    char c = gpsSerial.read();
    if (c == '\\n') {
      if (line.startsWith("$GPRMC")) {
        if (field(line, 2) == "A") {
          float lat = toDegrees(field(line, 3), field(line, 4));
          float lon = toDegrees(field(line, 5), field(line, 6));
          float kmh = field(line, 7).toFloat() * 1.852;
          Serial.print("Lat "); Serial.print(lat, 5);
          Serial.print("  Lon "); Serial.print(lon, 5);
          Serial.print("  Speed "); Serial.print(kmh, 1); Serial.println(" km/h");
        } else {
          Serial.println("No fix yet");
        }
      }
      line = "";
    } else if (c != '\\r') {
      line += c;
    }
  }
}
`,
  };
}

export function solenoidPulse() {
  const u = UNO();
  const sol = at('solenoid', '1', 230, -50, {}, 0, 'sol');
  const q = at('npn', 'E', 150, -50, {}, 0, 'q');
  const rb = at('resistor', '1', 40, -90, { value: 1000 }, 0, 'rb');
  const d = at('diode', 'A', 270, -110, {}, 0, 'd');
  const bat = at('battery-9v', '-', 340, -50, {}, 0, 'bat');
  return {
    id: 'solenoid-pulse', name: 'Solenoid with a transistor', category: 'motors', level: 'intermediate',
    description: 'An Arduino pin cannot drive a solenoid directly. An NPN transistor switches the 9 V coil; the diode across it absorbs the voltage spike when the coil turns off. The plunger pulses once a second.',
    parts: [u, sol, q, rb, d, bat],
    wires: [
      R(rb, '1', u, 'D8', C.yellow, [-70]),
      W(rb, '2', q, 'B', C.yellow, [[80, -90], [160, -90], [160, -50]]),
      W(q, 'E', u, 'GND.1', C.black, [[150, -30], [114, -30], [114, 10]]),
      W(q, 'C', sol, '2', C.orange, [[170, -70], [250, -70]]),
      W(bat, '+', sol, '1', C.red, [[350, -130], [230, -130]]),
      W(bat, '-', u, 'GND.2', C.black, [[340, 250], [140, 250], [140, 200]]),
      W(d, 'A', sol, '2', C.orange, [[270, -70], [250, -70]]),
      W(d, 'K', sol, '1', C.red, [[310, -110], [310, -130], [230, -130]]),
    ],
    code: `// Solenoid on an NPN transistor (flyback diode across the coil)
const int SOLENOID = 8;

void setup() {
  Serial.begin(9600);
  pinMode(SOLENOID, OUTPUT);
}

void loop() {
  digitalWrite(SOLENOID, HIGH);
  Serial.println("PUSH");
  delay(300);
  digitalWrite(SOLENOID, LOW);
  Serial.println("release");
  delay(700);
}
`,
  };
}

export const BUILDERS = [tb6612Motors, robotCar, bluetoothLed, gpsTracker, solenoidPulse];
void P;
