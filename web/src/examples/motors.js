// Motor & actuator examples: servo, steppers, relay, H-bridge.
import { C, at, R, UNO } from './helpers.js';

export function servoSweep() {
  const u = UNO();
  const sv = at('servo', 'PWM', 164, -40, { model: 'sg90' }, 0, 'servo');
  return {
    id: 'servo-sweep', name: 'Servo Sweep', category: 'motors', level: 'beginner',
    description: 'Sweep a micro servo from 0° to 180° and back with the Servo library.',
    parts: [u, sv],
    wires: [
      R(sv, 'PWM', u, 'D9', C.orange),
      R(sv, 'GND', u, 'GND.1', C.black, [-20]),
      R(sv, 'V+', u, '5V', C.red, [-28, -24, 236]),
    ],
    code: `// Servo sweep
#include <Servo.h>

Servo myServo;

void setup() {
  myServo.attach(9);      // signal wire on pin 9
}

void loop() {
  for (int angle = 0; angle <= 180; angle += 2) {
    myServo.write(angle);
    delay(15);
  }
  for (int angle = 180; angle >= 0; angle -= 2) {
    myServo.write(angle);
    delay(15);
  }
}
`,
  };
}

export function servoKnob() {
  const u = UNO();
  const sv = at('servo', 'PWM', 164, -40, { model: 'sg90' }, 0, 'servo');
  // Rotated 180° so the legs point up towards the Uno's analog header.
  const pot = at('potentiometer', 'SIG', 190, 244, { value: 10000 }, 180, 'pot');
  return {
    id: 'servo-knob', name: 'Servo + Potentiometer', category: 'motors', level: 'beginner',
    description: 'Turn the knob and the servo follows — analogRead() mapped to an angle. Tap the potentiometer to turn it.',
    parts: [u, sv, pot],
    wires: [
      R(sv, 'PWM', u, 'D9', C.orange),
      R(sv, 'GND', u, 'GND.1', C.black, [-20]),
      R(sv, 'V+', u, '5V', C.red, [-28, -24, 236]),
      R(u, 'A0', pot, 'SIG', C.yellow),
      R(u, '5V', pot, 'VCC', C.red, [224]),
      R(u, 'GND.3', pot, 'GND', C.black, [216]),
    ],
    code: `// Servo follows a potentiometer
#include <Servo.h>

Servo myServo;

void setup() {
  myServo.attach(9);
  Serial.begin(9600);
}

void loop() {
  int raw = analogRead(A0);                 // 0..1023
  int angle = map(raw, 0, 1023, 0, 180);    // 0..180 degrees
  myServo.write(angle);
  Serial.print("angle:");
  Serial.println(angle);
  delay(20);
}
`,
  };
}

export function stepper28byj() {
  const u = UNO();
  const st = at('stepper-28byj', 'IN1', 144, -40, {}, 0, 'stepper');
  return {
    id: 'stepper-28byj', name: 'Stepper Motor 28BYJ-48', category: 'motors', level: 'intermediate',
    description: 'The ULN2003 board drives the 28BYJ-48 geared stepper: one revolution clockwise, then back. Watch the phase LEDs!',
    parts: [u, st],
    wires: [
      R(st, 'IN1', u, 'D11', C.blue),
      R(st, 'IN2', u, 'D10', C.pink),
      R(st, 'IN3', u, 'D9', C.yellow),
      R(st, 'IN4', u, 'D8', C.orange),
      R(st, '-', u, 'GND.2', C.black, [-20, 284, 228]),
      R(st, '+', u, '5V', C.red, [-28, 292, 240]),
    ],
    code: `// 28BYJ-48 stepper with ULN2003 driver
// IN1..IN4 are wired to pins 11, 10, 9, 8.
// The Stepper library needs the order IN1, IN3, IN2, IN4.
#include <Stepper.h>

const int STEPS_PER_REV = 2048;   // 28BYJ-48 in full-step mode
Stepper motor(STEPS_PER_REV, 11, 9, 10, 8);

void setup() {
  motor.setSpeed(12);             // RPM (max ~15 for this motor)
  Serial.begin(9600);
}

void loop() {
  Serial.println("Clockwise 1/4 turn");
  motor.step(STEPS_PER_REV / 4);
  delay(500);
  Serial.println("Counter-clockwise 1/4 turn");
  motor.step(-STEPS_PER_REV / 4);
  delay(500);
}
`,
  };
}

export function stepperA4988() {
  const u = UNO();
  const st = at('stepper-a4988', 'EN', 220, -40, {}, 0, 'stepper');
  return {
    id: 'stepper-a4988', name: 'NEMA17 Stepper + A4988', category: 'motors', level: 'intermediate',
    description: 'STEP/DIR stepper driver used in 3D printers and CNC machines, driven with the AccelStepper library (smooth acceleration).',
    parts: [u, st],
    wires: [
      R(st, 'EN', u, 'D4', C.purple),
      R(st, 'STEP', u, 'D3', C.orange),
      R(st, 'DIR', u, 'D2', C.yellow),
      R(st, 'VDD', u, '5V', C.red, [-28, 292, 240]),
      R(st, 'GND', u, 'GND.2', C.black, [-20, 284, 228]),
    ],
    code: `// NEMA17 stepper + A4988 driver with AccelStepper
#include <AccelStepper.h>

const int EN_PIN = 4;     // LOW = driver enabled
const int STEP_PIN = 3;
const int DIR_PIN = 2;

AccelStepper stepper(AccelStepper::DRIVER, STEP_PIN, DIR_PIN);

void setup() {
  pinMode(EN_PIN, OUTPUT);
  digitalWrite(EN_PIN, LOW);
  stepper.setMaxSpeed(800);       // steps per second
  stepper.setAcceleration(400);   // steps per second^2
  stepper.moveTo(400);            // 2 turns (200 steps/rev)
  Serial.begin(9600);
}

void loop() {
  if (stepper.distanceToGo() == 0) {
    stepper.moveTo(-stepper.currentPosition());   // go back the other way
    Serial.print("Turning to ");
    Serial.println(stepper.targetPosition());
  }
  stepper.run();
}
`,
  };
}

export function relayLamp() {
  const u = UNO();
  const relay = at('relay', 'IN', 190, -40, { trigger: 'high' }, 0, 'relay');
  const lamp = at('lamp', '1', 260, -150, { rating: '12' }, 0, 'lamp');
  const psu = at('power-supply', '-', 330, -150, { voltage: 12 }, 0, 'psu');
  return {
    id: 'relay-lamp', name: 'Relay switches a 12 V Lamp', category: 'motors', level: 'beginner',
    description: 'A small 5 V signal from the Arduino controls a separate 12 V circuit through a relay — the basis of home automation.',
    parts: [u, relay, lamp, psu],
    wires: [
      R(relay, 'IN', u, 'D7', C.orange),
      R(relay, 'VCC', u, '5V', C.red, [-20, -24, 236]),
      R(relay, 'GND', u, 'GND.1', C.black, [-8]),
      R(relay, 'NO', lamp, '1', C.yellow, [-134]),
      R(relay, 'COM', psu, '+', C.red, [-122]),
      R(lamp, '2', psu, '-', C.black, [-142]),
    ],
    code: `// Relay module controlling a 12 V lamp
// COM and NO act like a switch that the Arduino can close.
const int RELAY = 7;

void setup() {
  pinMode(RELAY, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  digitalWrite(RELAY, HIGH);     // relay clicks, lamp turns on
  Serial.println("Lamp ON");
  delay(2000);
  digitalWrite(RELAY, LOW);
  Serial.println("Lamp OFF");
  delay(2000);
}
`,
  };
}

export function l298nMotor() {
  const u = UNO();
  const drv = at('l298n', 'ENA', 154, -40, {}, 0, 'drv');
  const motor = at('dc-motor', '1', 154, -170, { look: 'wheel' }, 0, 'motor');
  const bat = at('battery-9v', '-', 330, 250, { voltage: 9 }, 0, 'bat');
  return {
    id: 'l298n-motor', name: 'DC Motor Speed & Direction (L298N)', category: 'motors', level: 'intermediate',
    description: 'An H-bridge lets the Arduino run a DC motor forwards, backwards and at any speed with PWM. The motor has its own 9 V battery.',
    parts: [u, drv, motor, bat],
    wires: [
      R(drv, 'ENA', u, 'D10', C.purple),
      R(drv, 'IN1', u, 'D9', C.orange),
      R(drv, 'IN2', u, 'D8', C.yellow),
      R(drv, 'OUT1', motor, '1', C.blue),
      R(drv, 'OUT2', motor, '2', C.green, [-150]),
      R(drv, '12V', bat, '+', C.red, [-158, 400, 236]),
      R(drv, 'GND', bat, '-', C.black, [-150, 390, 226]),
      R(u, 'GND.2', bat, '-', C.black, [250]),
    ],
    code: `// DC motor with an L298N H-bridge
// ENA = speed (PWM), IN1/IN2 = direction.
const int ENA = 10;
const int IN1 = 9;
const int IN2 = 8;

void drive(int speed) {        // -255 .. 255
  digitalWrite(IN1, speed > 0 ? HIGH : LOW);
  digitalWrite(IN2, speed < 0 ? HIGH : LOW);
  analogWrite(ENA, abs(speed));
}

void setup() {
  pinMode(ENA, OUTPUT);
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  Serial.println("Forward, speeding up");
  for (int s = 0; s <= 255; s += 15) { drive(s); delay(60); }
  delay(800);
  Serial.println("Stop");
  drive(0);
  delay(600);
  Serial.println("Reverse, half speed");
  drive(-140);
  delay(1500);
  drive(0);
  delay(600);
}
`,
  };
}
