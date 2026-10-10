// Two boards working together: an I²C master and slave (Wire), and a UART master and slave
// (Serial1 → Serial). Each board runs its own sketch; the second board's sketch is part.code.
import { P, plug, rail, W, R, C } from './helpers.js';

export function i2cMasterSlave() {
  const m = P('uno-r3', 0, 0, {}, 0, 'master');
  m.title = 'Master';
  const s = P('uno-r3', 420, 0, {}, 0, 'slave');
  s.title = 'Slave';
  const bb = P('breadboard', 30, 300, {}, 0, 'bb');
  const pot = plug('potentiometer', 'GND', bb, 'e22', {}, 0, 'pot');
  const btn = plug('pushbutton', '1.l', bb, 'e28', { color: 'blue' }, 0, 'btn');
  const res = plug('resistor', '1', bb, 'e55', { value: 220 }, 0, 'r1');
  const led = plug('led', 'A', bb, 'c59', { color: 'green' }, 0, 'led');
  const sv = P('servo', 0, 0, {}, 0, 'servo');
  sv.x = 750; sv.y = 140;
  s.code = SLAVE_I2C;
  return {
    id: 'i2c-master-slave', name: 'Two Arduinos: I²C Master → Slave', category: 'multi', level: 'intermediate',
    description: 'The master reads a knob and a button and sends them over I²C (A4 SDA, A5 SCL) to slave #8, which moves a servo and lights an LED, then answers back.',
    parts: [bb, m, s, pot, btn, res, led, sv],
    wires: [
      // the I²C bus: SDA to SDA, SCL to SCL (the Uno's SDA/SCL pins are A4/A5)
      R(m, 'SDA', s, 'SDA', C.blue, [-22]),
      R(m, 'SCL', s, 'SCL', C.yellow, [-34]),
      // master: 5 V and GND to the breadboard rails, knob on A0, button on A1
      R(m, '5V', bb, rail(bb, 'tp', 11), C.red),
      R(m, 'GND.2', bb, rail(bb, 'tn', 12), C.black),
      R(m, 'A0', bb, 'a23', C.orange, [235]),
      R(m, 'A1', bb, 'a28', C.blue, [225]),
      W(bb, 'a22', bb, rail(bb, 'tn', 22), C.black),
      W(bb, 'a24', bb, rail(bb, 'tp', 24), C.red),
      W(bb, 'j28', bb, rail(bb, 'bn', 28), C.black),
      W(bb, 'tn.1', bb, 'bn.1', C.black, [[12, 270], [12, 450]]),
      // the slave shares GND (a common ground is a must) and drives the LED and the servo
      R(s, 'GND.2', bb, rail(bb, 'tn', 54), C.black),
      R(s, 'A2', bb, 'a55', C.green, [240]),
      W(bb, 'a60', bb, rail(bb, 'tn', 60), C.black),
      R(s, 'GND.3', sv, 'GND', C.black, [262], false),
      R(s, '5V', sv, 'V+', C.red, [270]),
      R(s, 'A3', sv, 'PWM', C.orange, [230]),
    ],
    code: MASTER_I2C,
  };
}

export function uartMasterSlave() {
  const m = P('mega2560', 0, 0, {}, 0, 'master');
  m.title = 'Master';
  const s = P('uno-r3', 520, 0, {}, 0, 'slave');
  s.title = 'Slave';
  const bbm = P('breadboard-mini', 110, 260, {}, 0, 'bbm');
  const pot = plug('potentiometer', 'GND', bbm, 'e5', {}, 180, 'pot');
  const bbs = P('breadboard-mini', 594, -200, {}, 0, 'bbs');
  const res = plug('resistor', '1', bbs, 'g10', { value: 220 }, 0, 'r1');
  const led = plug('led', 'A', bbs, 'h14', { color: 'yellow' }, 0, 'led');
  s.code = SLAVE_UART;
  return {
    id: 'uart-master-slave', name: 'Two boards: Serial Master → Slave', category: 'multi', level: 'intermediate',
    description: 'A Mega sends the knob value as text over Serial1 (TX1 → RX) to an Uno, which sets an LED\'s brightness and replies "OK". TX and RX cross over; GND is shared.',
    parts: [bbm, bbs, m, s, pot, res, led],
    wires: [
      // crossover: master TX1 → slave RX (D0), slave TX (D1) → master RX1
      R(m, 'D18', s, 'D0', C.green, [-34]),
      R(m, 'D19', s, 'D1', C.blue, [-22]),
      R(m, 'GND.2', s, 'GND.2', C.black, [240]),
      // knob on the master's A0
      R(m, '5V', bbm, 'a3', C.red),
      R(m, 'A0', bbm, 'a4', C.orange, [236]),
      R(m, 'GND.4', bbm, 'a5', C.black, [250]),
      // LED on the slave's PWM pin 9
      R(s, 'D9', bbs, 'j10', C.orange),
      R(s, 'GND.1', bbs, 'j15', C.black, [-60]),
    ],
    code: MASTER_UART,
  };
}

const MASTER_I2C = `// I2C MASTER: reads the knob (A0) and the button (A1), sends both to the
// slave at address 8, then asks the slave for a 2-byte answer.
// Open the Serial Monitor, turn the knob and press the button while it runs.
#include <Wire.h>

const int SLAVE_ADDR = 8;
const int KNOB = A0;
const int BUTTON = A1;            // to GND, uses the internal pull-up

void setup() {
  Wire.begin();                   // no address = this board is the master
  Serial.begin(9600);
  pinMode(BUTTON, INPUT_PULLUP);
  pinMode(LED_BUILTIN, OUTPUT);
  delay(200);                     // give the slave time to start
  Serial.println("Master ready");
}

void loop() {
  byte angle = map(analogRead(KNOB), 0, 1023, 0, 180);
  byte led = digitalRead(BUTTON) == LOW ? 1 : 0;

  // master -> slave: two bytes
  Wire.beginTransmission(SLAVE_ADDR);
  Wire.write(angle);
  Wire.write(led);
  byte error = Wire.endTransmission();   // 0 = the slave answered (ACK)

  // slave -> master: ask for two bytes
  Wire.requestFrom(SLAVE_ADDR, 2);
  byte messages = Wire.read();
  byte servoAngle = Wire.read();

  digitalWrite(LED_BUILTIN, error == 0);   // L LED = link OK
  Serial.print("angle ");
  Serial.print(angle);
  Serial.print(" led ");
  Serial.print(led);
  if (error == 0) {
    Serial.print(" > slave: ");
    Serial.print(messages);
    Serial.print(" msgs, servo ");
    Serial.println(servoAngle);
  } else {
    Serial.println(" > no answer!");
  }
  delay(400);
}
`;

const SLAVE_I2C = `// I2C SLAVE at address 8: the master sends [angle, led];
// this board moves the servo, switches the LED and answers requests.
#include <Wire.h>
#include <Servo.h>

Servo servo;
const int LED = A2;
volatile byte angle = 90;
volatile byte led = 0;
volatile byte messages = 0;

// runs when the master writes to us
void receiveEvent(int howMany) {
  if (howMany >= 2) {
    angle = Wire.read();
    led = Wire.read();
    messages++;
  }
  while (Wire.available()) Wire.read();
}

// runs when the master asks us for data
void requestEvent() {
  Wire.write(messages);
  Wire.write(angle);
}

void setup() {
  Wire.begin(8);                  // join the bus as slave #8
  Wire.onReceive(receiveEvent);
  Wire.onRequest(requestEvent);
  servo.attach(A3);               // the Servo library works on any pin
  pinMode(LED, OUTPUT);
  Serial.begin(9600);
  Serial.println("Slave #8 listening");
}

void loop() {
  servo.write(angle);
  digitalWrite(LED, led);
  delay(20);
}
`;

const MASTER_UART = `// SERIAL MASTER (Arduino Mega): Serial = USB (Serial Monitor),
// Serial1 = pins 18 (TX1) and 19 (RX1), wired to the slave Uno.
// Every 300 ms it sends the knob as text, e.g. "B128", and prints the reply.

const int KNOB = A0;

void setup() {
  Serial.begin(9600);     // to the Serial Monitor
  Serial1.begin(9600);    // to the slave (same baud rate on both sides!)
  Serial.println("Master: turn the knob");
}

void loop() {
  int level = map(analogRead(KNOB), 0, 1023, 0, 255);
  Serial1.print('B');
  Serial1.println(level);          // "B128\\n" -> slave

  delay(50);                       // give the slave time to answer
  while (Serial1.available()) {
    String reply = Serial1.readStringUntil('\\n');
    reply.trim();
    Serial.print("sent B");
    Serial.print(level);
    Serial.print("  slave says: ");
    Serial.println(reply);
  }
  delay(250);
}
`;

const SLAVE_UART = `// SERIAL SLAVE (Arduino Uno): pins 0 (RX) and 1 (TX) are wired to the
// master's TX1 / RX1. It reads "B<number>" lines and sets the LED brightness.

const int LED = 9;   // PWM pin

void setup() {
  Serial.begin(9600);
  pinMode(LED, OUTPUT);
}

void loop() {
  if (Serial.available()) {
    char cmd = Serial.read();
    if (cmd == 'B') {
      int level = Serial.parseInt();
      level = constrain(level, 0, 255);
      analogWrite(LED, level);
      Serial.print("OK ");         // reply goes back to the master
      Serial.println(level);
    }
  }
}
`;
