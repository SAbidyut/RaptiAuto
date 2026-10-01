// Sensor examples: distance, temperature, motion, gas, soil, IMU, joystick.
import { plug, W, C, at, R, UNO, HALF, railPower } from './helpers.js';

export function ultrasonic() {
  const u = UNO();
  const hc = at('hc-sr04', 'VCC', 220, -40, {}, 0, 'sonar');
  return {
    id: 'ultrasonic', name: 'Ultrasonic Distance Meter', category: 'sensors', level: 'beginner',
    description: 'Measure distance with an HC-SR04 and pulseIn(). Tap the sensor while running and drag the slider to move the object.',
    parts: [u, hc],
    wires: [
      R(hc, 'TRIG', u, 'D3', C.orange),
      R(hc, 'ECHO', u, 'D2', C.green),
      R(hc, 'VCC', u, '5V', C.red, [-22, -24, 236]),
      R(hc, 'GND', u, 'GND.2', C.black, [-28, 292, 228]),
    ],
    code: `// Ultrasonic distance meter (HC-SR04)
// Tap the sensor while the simulation runs and move the slider.

const int TRIG_PIN = 3;
const int ECHO_PIN = 2;

void setup() {
  Serial.begin(9600);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  // A 10 µs pulse on TRIG starts one measurement
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  // ECHO stays HIGH for the round-trip time of the sound wave
  long duration = pulseIn(ECHO_PIN, HIGH, 30000);
  float distance = duration * 0.0343 / 2;   // sound travels 0.0343 cm per µs

  Serial.print("Distance: ");
  Serial.print(distance, 1);
  Serial.println(" cm");

  // The "L" LED warns when something is closer than 20 cm
  digitalWrite(LED_BUILTIN, distance > 0 && distance < 20 ? HIGH : LOW);
  delay(250);
}
`,
  };
}

export function dht22Monitor() {
  const u = UNO();
  const dht = at('dht22', 'VCC', 230, -40, { model: '22' }, 0, 'dht');
  return {
    id: 'dht22-monitor', name: 'Temperature & Humidity (DHT22)', category: 'sensors', level: 'beginner',
    description: 'Read temperature, humidity and heat index from a DHT22. Tap the sensor while running to change the weather.',
    parts: [u, dht],
    wires: [
      R(dht, 'DATA', u, 'D2', C.green),
      R(dht, 'VCC', u, '5V', C.red, [-22, -24, 236]),
      R(dht, 'GND', u, 'GND.2', C.black, [-28, 292, 228]),
    ],
    code: `// DHT22 temperature & humidity monitor
#include <DHT.h>

#define DHTPIN  2
#define DHTTYPE DHT22     // change to DHT11 for the blue sensor

DHT dht(DHTPIN, DHTTYPE);

void setup() {
  Serial.begin(9600);
  Serial.println("DHT22 weather monitor");
  dht.begin();
}

void loop() {
  delay(2000);                        // the DHT22 needs 2 s between readings

  float humidity = dht.readHumidity();
  float tempC = dht.readTemperature();
  if (isnan(humidity) || isnan(tempC)) {
    Serial.println("Failed to read from the DHT sensor!");
    return;
  }
  float feelsLike = dht.computeHeatIndex(tempC, humidity, false);

  Serial.print("Temperature: ");
  Serial.print(tempC, 1);
  Serial.print(" C   Humidity: ");
  Serial.print(humidity, 1);
  Serial.print(" %   Feels like: ");
  Serial.print(feelsLike, 1);
  Serial.println(" C");
}
`,
  };
}

export function pirAlarm() {
  const u = UNO(), bb = HALF();
  const bz = at('buzzer', '+', 420, -44, { kind: 'active' }, 0, 'bz');
  const pir = at('pir', 'VCC', 510, -44, { hold: '3' }, 0, 'pir');
  const r = plug('resistor', '1', bb, 'e2', { value: 220 });
  const led = plug('led', 'A', bb, 'c6', { color: 'red' });
  return {
    id: 'pir-alarm', name: 'Motion Alarm (PIR)', category: 'sensors', level: 'beginner',
    description: 'A PIR sensor detects people. The alarm flashes the LED and beeps. Tap the PIR while running and press "Simulate motion".',
    parts: [bb, u, bz, pir, r, led],
    wires: [
      ...railPower(u, bb),
      R(u, 'D7', bz, '+', C.orange, [-30]),
      R(u, 'D6', pir, 'OUT', C.yellow, [-20]),
      R(u, 'D5', bb, 'a2', C.green, [-8]),
      W(bb, 'a7', bb, 'tn.5', C.black),
      R(bz, '-', bb, 'tn.9', C.black),
      R(pir, 'VCC', bb, 'tp.15', C.red),
      R(pir, 'GND', bb, 'tn.16', C.black),
    ],
    code: `// Motion alarm: PIR sensor + LED + active buzzer
const int BUZZER = 7;
const int PIR = 6;
const int LED = 5;

int lastState = LOW;

void setup() {
  pinMode(PIR, INPUT);
  pinMode(LED, OUTPUT);
  pinMode(BUZZER, OUTPUT);
  Serial.begin(9600);
  Serial.println("Alarm armed. Waiting for motion...");
}

void loop() {
  int motion = digitalRead(PIR);

  if (motion == HIGH) {
    // Flash + beep while motion is present
    digitalWrite(LED, HIGH);
    digitalWrite(BUZZER, HIGH);
    delay(100);
    digitalWrite(LED, LOW);
    digitalWrite(BUZZER, LOW);
    delay(100);
  }

  if (motion != lastState) {
    Serial.println(motion == HIGH ? "Motion detected!" : "All clear.");
    lastState = motion;
  }
}
`,
  };
}

export function lm35Thermometer() {
  const u = UNO();
  const lm = at('lm35', 'VS', 300, 240, {}, 0, 'lm35');
  return {
    id: 'lm35-thermometer', name: 'LM35 Thermometer', category: 'sensors', level: 'beginner',
    description: 'The LM35 outputs 10 mV per °C. Convert the analog reading to Celsius and Fahrenheit. Tap the sensor to change the temperature.',
    parts: [u, lm],
    wires: [
      R(u, '5V', lm, 'VS', C.red, [268]),
      R(u, 'A0', lm, 'OUT', C.yellow, [256]),
      R(u, 'GND.3', lm, 'GND', C.black, [280]),
    ],
    code: `// LM35 analog thermometer: 10 mV per degree Celsius
const int SENSOR = A0;

void setup() {
  Serial.begin(9600);
}

void loop() {
  int raw = analogRead(SENSOR);              // 0..1023 for 0..5 V
  float volts = raw * (5.0 / 1023.0);
  float celsius = volts * 100.0;             // 10 mV/°C
  float fahrenheit = celsius * 9.0 / 5.0 + 32.0;

  Serial.print("Temperature: ");
  Serial.print(celsius, 1);
  Serial.print(" °C  /  ");
  Serial.print(fahrenheit, 1);
  Serial.println(" °F");
  delay(500);
}
`,
  };
}

export function gasAlarm() {
  const u = UNO();
  const gas = at('gas-sensor', 'VCC', 300, 250, {}, 0, 'gas');
  const bz = at('buzzer', '+', 200, -40, { kind: 'passive' }, 0, 'bz');
  return {
    id: 'gas-alarm', name: 'Gas Leak Alarm (MQ-2)', category: 'sensors', level: 'intermediate',
    description: 'The MQ-2 senses smoke and LPG. Above the limit, a siren sounds on the buzzer. Tap the sensor and raise the gas level.',
    parts: [u, gas, bz],
    wires: [
      R(u, '5V', gas, 'VCC', C.red, [282]),
      R(u, 'GND.2', gas, 'GND', C.black, [272]),
      R(u, 'A0', gas, 'AO', C.yellow, [262]),
      R(bz, '+', u, 'D6', C.orange),
      R(bz, '-', u, 'GND.1', C.black, [-24]),
    ],
    code: `// Gas leak alarm with an MQ-2 sensor and a buzzer siren
const int GAS_PIN = A0;
const int BUZZER = 6;
const int LIMIT = 400;        // analog level that triggers the alarm

void setup() {
  Serial.begin(9600);
  pinMode(LED_BUILTIN, OUTPUT);
  Serial.println("MQ-2 warming up...");
}

void loop() {
  int level = analogRead(GAS_PIN);
  Serial.print("gas:");
  Serial.println(level);

  if (level > LIMIT) {
    Serial.println("!!! GAS DETECTED !!!");
    digitalWrite(LED_BUILTIN, HIGH);
    // Two-tone siren
    for (int f = 800; f < 1600; f += 40) { tone(BUZZER, f); delay(8); }
    for (int f = 1600; f > 800; f -= 40) { tone(BUZZER, f); delay(8); }
  } else {
    noTone(BUZZER);
    digitalWrite(LED_BUILTIN, LOW);
    delay(300);
  }
}
`,
  };
}

export function ds18b20Temp() {
  const u = UNO(), bb = HALF();
  const ds = at('ds18b20', 'GND', 450, 262, {}, 0, 'ds');
  const pull = plug('resistor', '1', bb, 'h14', { value: 4700 });
  return {
    id: 'ds18b20-temp', name: 'Waterproof Thermometer (DS18B20)', category: 'sensors', level: 'intermediate',
    description: '1-Wire digital temperature sensor with the OneWire and DallasTemperature libraries. Note the 4.7 kΩ pull-up resistor from DATA to 5V.',
    parts: [bb, u, ds, pull],
    wires: [
      R(u, 'GND.2', bb, 'bn.2', C.black, [236]),
      R(u, '5V', bb, 'bp.3', C.red, [246]),
      R(u, 'D2', bb, 'a14', C.yellow, [-10]),
      W(bb, 'e14', bb, 'f14', C.yellow),
      R(ds, 'DQ', bb, 'j14', C.yellow),
      R(ds, 'GND', bb, 'bn.10', C.black),
      R(ds, 'VDD', bb, 'bp.11', C.red),
      W(bb, 'j18', bb, 'bp.14', C.red),
    ],
    code: `// DS18B20 1-Wire temperature sensor
#include <OneWire.h>
#include <DallasTemperature.h>

#define ONE_WIRE_BUS 2        // data pin (needs a 4.7k pull-up to 5V)

OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);

void setup() {
  Serial.begin(9600);
  sensors.begin();
  Serial.print("Sensors found: ");
  Serial.println(sensors.getDeviceCount());
}

void loop() {
  sensors.requestTemperatures();          // start a conversion
  float c = sensors.getTempCByIndex(0);   // first sensor on the bus
  if (c == DEVICE_DISCONNECTED_C) {
    Serial.println("Sensor not found!");
  } else {
    Serial.print("Temperature: ");
    Serial.print(c, 2);
    Serial.println(" C");
  }
  delay(1000);
}
`,
  };
}

export function mpu6050Tilt() {
  const u = UNO();
  const mpu = at('mpu6050', 'VCC', 150, -44, {}, 0, 'mpu');
  return {
    id: 'mpu6050-tilt', name: 'Tilt Sensor (MPU6050)', category: 'sensors', level: 'intermediate',
    description: 'Read the accelerometer and gyroscope over I²C and calculate pitch and roll angles. Tap the module to tilt it.',
    parts: [u, mpu],
    wires: [
      R(mpu, 'SCL', u, 'SCL', C.yellow, [-30]),
      R(mpu, 'SDA', u, 'SDA', C.blue, [-20]),
      R(mpu, 'GND', u, 'GND.1', C.black, [-10]),
      R(mpu, 'VCC', u, '5V', C.red, [-36, -24, 236]),
    ],
    code: `// MPU6050 tilt meter (Adafruit MPU6050 library)
#include <Adafruit_MPU6050.h>
#include <Wire.h>

Adafruit_MPU6050 mpu;

void setup() {
  Serial.begin(115200);
  if (!mpu.begin()) {
    Serial.println("MPU6050 not found - check the wiring!");
    while (1) delay(10);
  }
  mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
  mpu.setGyroRange(MPU6050_RANGE_500_DEG);
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
  Serial.println("MPU6050 ready");
}

void loop() {
  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);

  // Angles from the direction of gravity
  float pitch = atan2(a.acceleration.x, sqrt(a.acceleration.y * a.acceleration.y + a.acceleration.z * a.acceleration.z)) * 180.0 / PI;
  float roll  = atan2(a.acceleration.y, a.acceleration.z) * 180.0 / PI;

  Serial.print("Pitch: ");
  Serial.print(pitch, 1);
  Serial.print("  Roll: ");
  Serial.print(roll, 1);
  Serial.print("  Gyro Z: ");
  Serial.print(g.gyro.z, 2);
  Serial.print(" rad/s  Temp: ");
  Serial.print(temp.temperature, 1);
  Serial.println(" C");
  delay(300);
}
`,
  };
}

export function joystick() {
  const u = UNO();
  const js = at('joystick', 'GND', 300, 252, {}, 0, 'js');
  return {
    id: 'joystick', name: 'Joystick Reader', category: 'sensors', level: 'beginner',
    description: 'A two-axis joystick gives two analog values and a push button. Tap the joystick while running and drag the knob.',
    parts: [u, js],
    wires: [
      R(u, 'GND.3', js, 'GND', C.black, [262]),
      R(u, '5V', js, '5V', C.red, [292]),
      R(u, 'A0', js, 'VRx', C.yellow, [270]),
      R(u, 'A1', js, 'VRy', C.green, [278]),
      R(u, 'D2', js, 'SW', C.blue, [-14, 380, 300]),
    ],
    code: `// Joystick: two potentiometers (X, Y) and a push button
const int X_PIN = A0;
const int Y_PIN = A1;
const int SW_PIN = 2;

void setup() {
  pinMode(SW_PIN, INPUT_PULLUP);   // the button connects SW to GND
  Serial.begin(9600);
}

void loop() {
  int x = analogRead(X_PIN);       // 0 (left) .. 512 (centre) .. 1023 (right)
  int y = analogRead(Y_PIN);
  bool pressed = digitalRead(SW_PIN) == LOW;

  String dir = "centre";
  if (y < 300) dir = "up";
  else if (y > 700) dir = "down";
  else if (x < 300) dir = "left";
  else if (x > 700) dir = "right";

  Serial.print("X: ");
  Serial.print(x);
  Serial.print("  Y: ");
  Serial.print(y);
  Serial.print("  ");
  Serial.print(dir);
  Serial.println(pressed ? "  [CLICK]" : "");
  delay(150);
}
`,
  };
}

export function plantWatering() {
  const u = UNO(), bb = HALF();
  const relay = at('relay', 'VCC', 410, -50, { trigger: 'high' }, 0, 'relay');
  const soil = at('soil-sensor', 'VCC', 530, -50, {}, 0, 'soil');
  const pump = at('dc-motor', '1', 300, -150, { look: 'shaft' }, 0, 'pump');
  const bat = at('battery-aa4', '-', 150, -200, {}, 0, 'bat');
  return {
    id: 'plant-watering', name: 'Automatic Plant Watering', category: 'sensors', level: 'intermediate',
    description: 'When the soil gets dry, the relay switches on a water pump powered by its own battery pack. Tap the soil sensor to change the moisture.',
    parts: [bb, u, relay, soil, pump, bat],
    wires: [
      ...railPower(u, bb),
      R(relay, 'VCC', bb, 'tp.6', C.red),
      R(relay, 'GND', bb, 'tn.7', C.black),
      R(u, 'D7', relay, 'IN', C.orange, [-36]),
      R(soil, 'VCC', bb, 'tp.16', C.red),
      R(soil, 'GND', bb, 'tn.17', C.black),
      R(soil, 'AO', u, 'A0', C.yellow, [-40, 660, 256]),
      R(relay, 'COM', bat, '+', C.red, [-240]),
      R(relay, 'NO', pump, '2', C.blue, [-130]),
      R(pump, '1', bat, '-', C.black, [-126, 120, -216]),
    ],
    code: `// Automatic plant watering
// Soil sensor AO: high value = dry, low value = wet.
const int SOIL = A0;
const int RELAY = 7;
const int DRY = 600;    // start watering above this
const int WET = 400;    // stop watering below this

bool pumping = false;

void setup() {
  pinMode(RELAY, OUTPUT);
  digitalWrite(RELAY, LOW);
  Serial.begin(9600);
}

void loop() {
  int moisture = analogRead(SOIL);
  Serial.print("soil:");
  Serial.println(moisture);

  // Hysteresis: two thresholds stop the pump from flickering on and off
  if (!pumping && moisture > DRY) {
    pumping = true;
    digitalWrite(RELAY, HIGH);
    Serial.println("Soil is dry -> Pump ON");
  } else if (pumping && moisture < WET) {
    pumping = false;
    digitalWrite(RELAY, LOW);
    Serial.println("Soil is wet -> Pump OFF");
  }
  delay(500);
}
`,
  };
}
