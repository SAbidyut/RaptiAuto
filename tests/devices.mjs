// Headless device/library tests: node tests/devices.mjs
import '../web/src/components/index.js';
import { SimEngine } from '../web/src/sim/engine.js';

let failures = 0;
function run(name, project, ms, { onFrame, check } = {}) {
  let serial = '';
  const warns = [];
  const errors = [];
  const eng = new SimEngine(project, {
    onSerial: (p, t) => { serial += t; },
    onWarning: (m) => warns.push(m),
    onError: (e) => errors.push(e),
  });
  const r = eng.start();
  if (!r.ok) { console.log(`✗ ${name}: start failed`, r.error); failures++; return null; }
  let wall = 1000;
  eng.tick(wall);
  for (let i = 0; i < ms / 16; i++) { wall += 16; eng.tick(wall); if (onFrame) onFrame(eng, wall - 1000); }
  const res = { eng, serial, warns, errors };
  let ok = !errors.length;
  let msg = '';
  if (check) { try { const c = check(res); if (c !== true) { ok = false; msg = String(c); } } catch (e) { ok = false; msg = e.stack; } }
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${name}${msg ? ' — ' + msg : ''}${errors.length ? ' ERR ' + JSON.stringify(errors) : ''}`);
  if (!ok || process.env.V) { console.log('   serial:', JSON.stringify(serial.slice(0, 300))); if (warns.length) console.log('   warns:', warns); }
  return res;
}
const W = (a, ap, b, bp) => ({ id: 'w' + Math.random().toString(36).slice(2, 7), from: { part: a, pin: ap }, to: { part: b, pin: bp }, points: [] });
const uno = { id: 'u', type: 'uno-r3', x: 0, y: 0 };

run('servo sweep', {
  code: `#include <Servo.h>\nServo s;\nvoid setup(){ s.attach(9); s.write(0); delay(500); s.write(180); }\nvoid loop(){}`,
  parts: [uno, { id: 's', type: 'servo', x: 300, y: 200 }],
  wires: [W('u', 'D9', 's', 'PWM'), W('u', '5V', 's', 'V+'), W('u', 'GND.2', 's', 'GND')],
}, 1200, { check: ({ eng }) => (Math.abs(eng.parts.get('s').visual.angle - 180) < 1 ? true : 'angle=' + eng.parts.get('s').visual.angle) });

run('lcd i2c', {
  code: `#include <LiquidCrystal_I2C.h>\nLiquidCrystal_I2C lcd(0x27,16,2);\nvoid setup(){ lcd.init(); lcd.backlight(); lcd.setCursor(0,0); lcd.print("Hello RAPTI"); lcd.setCursor(0,1); lcd.print(42); }\nvoid loop(){}`,
  parts: [uno, { id: 'l', type: 'lcd-i2c', x: 300, y: 200 }],
  wires: [W('u', 'A4', 'l', 'SDA'), W('u', 'A5', 'l', 'SCL'), W('u', '5V', 'l', 'VCC'), W('u', 'GND.2', 'l', 'GND')],
}, 300, {
  check: ({ eng }) => {
    const d = eng.parts.get('l').hd44780;
    const row = (r) => Array.from({ length: 16 }, (_, c) => String.fromCharCode(d.charAt(c, r))).join('').trimEnd();
    return row(0) === 'Hello RAPTI' && row(1) === '42' && eng.parts.get('l').visual.light ? true : `rows="${row(0)}"/"${row(1)}" light=${eng.parts.get('l').visual.light}`;
  },
});

run('lcd parallel', {
  code: `#include <LiquidCrystal.h>\nLiquidCrystal lcd(12, 11, 5, 4, 3, 2);\nvoid setup(){ lcd.begin(16,2); lcd.print("Temp: "); lcd.print(23.5,1); lcd.write(223); }\nvoid loop(){}`,
  parts: [uno, { id: 'l', type: 'lcd1602', x: 300, y: 200 }],
  wires: [W('u', 'D12', 'l', 'RS'), W('u', 'D11', 'l', 'E'), W('u', 'D5', 'l', 'D4'), W('u', 'D4', 'l', 'D5'), W('u', 'D3', 'l', 'D6'), W('u', 'D2', 'l', 'D7'),
    W('u', '5V', 'l', 'VDD'), W('u', 'GND.2', 'l', 'VSS'), W('u', 'GND.2', 'l', 'RW'), W('u', 'GND.2', 'l', 'V0'), W('u', '5V', 'l', 'A'), W('u', 'GND.3', 'l', 'K')],
}, 300, {
  check: ({ eng }) => {
    const d = eng.parts.get('l').hd44780;
    const row = Array.from({ length: 16 }, (_, c) => d.charAt(c, 0));
    return String.fromCharCode(...row.slice(0, 10)) === 'Temp: 23.5' && row[10] === 223 ? true : JSON.stringify(row);
  },
});

run('oled', {
  code: `#include <Adafruit_SSD1306.h>\nAdafruit_SSD1306 display(128, 64, &Wire, -1);\nvoid setup(){ Serial.begin(9600); if(!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) { Serial.println("fail"); for(;;); } display.clearDisplay(); display.setTextSize(1); display.setTextColor(SSD1306_WHITE); display.setCursor(0,0); display.println("Hi"); display.drawRect(10,10,20,20,SSD1306_WHITE); display.display(); Serial.println("ok"); }\nvoid loop(){}`,
  parts: [uno, { id: 'o', type: 'oled-ssd1306', x: 300, y: 200 }],
  wires: [W('u', 'A4', 'o', 'SDA'), W('u', 'A5', 'o', 'SCL'), W('u', '5V', 'o', 'VCC'), W('u', 'GND.2', 'o', 'GND')],
}, 400, { check: ({ eng, serial }) => { const fb = eng.parts.get('o').ssd1306.fb; const n = fb.reduce((a, b) => a + b, 0); return serial.includes('ok') && n > 50 ? true : `px=${n} serial=${serial}`; } });

run('neopixel', {
  code: `#include <Adafruit_NeoPixel.h>\nAdafruit_NeoPixel strip(16, 6, NEO_GRB + NEO_KHZ800);\nvoid setup(){ strip.begin(); strip.setPixelColor(0, strip.Color(255,0,0)); strip.setPixelColor(1, 0, 0, 255); strip.show(); }\nvoid loop(){}`,
  parts: [uno, { id: 'n', type: 'neopixel', x: 300, y: 200, props: { layout: 'ring16' } }],
  wires: [W('u', 'D6', 'n', 'DIN'), W('u', '5V', 'n', 'VCC'), W('u', 'GND.2', 'n', 'GND')],
}, 200, { check: ({ eng }) => { const px = eng.parts.get('n').visual.px; return px[0] === 0xff0000 && px[1] === 0x0000ff ? true : px.slice(0, 3).map((x) => x.toString(16)).join(','); } });

run('dht22', {
  code: `#include <DHT.h>\nDHT dht(2, DHT22);\nvoid setup(){ Serial.begin(9600); dht.begin(); delay(2000); Serial.println(dht.readTemperature()); Serial.println(dht.readHumidity()); }\nvoid loop(){}`,
  parts: [uno, { id: 'd', type: 'dht22', x: 300, y: 200 }],
  wires: [W('u', 'D2', 'd', 'DATA'), W('u', '5V', 'd', 'VCC'), W('u', 'GND.2', 'd', 'GND')],
}, 2600, { check: ({ serial }) => (serial.includes('24.00') && serial.includes('55.00') ? true : serial) });

run('hc-sr04 pulseIn', {
  code: `void setup(){ Serial.begin(9600); pinMode(9, OUTPUT); pinMode(10, INPUT); }\nvoid loop(){ digitalWrite(9, LOW); delayMicroseconds(2); digitalWrite(9, HIGH); delayMicroseconds(10); digitalWrite(9, LOW); long d = pulseIn(10, HIGH); Serial.println(d * 0.034 / 2); delay(200); }`,
  parts: [uno, { id: 'h', type: 'hc-sr04', x: 300, y: 200 }],
  wires: [W('u', 'D9', 'h', 'TRIG'), W('u', 'D10', 'h', 'ECHO'), W('u', '5V', 'h', 'VCC'), W('u', 'GND.2', 'h', 'GND')],
}, 500, { onFrame: (e, t) => { if (t === 256) e.input('h', 'distance', 50); }, check: ({ serial }) => (/99\.\d+/.test(serial) && /49\.\d+/.test(serial) ? true : serial) });

run('hc-sr04 newping', {
  code: `#include <NewPing.h>\nNewPing sonar(9, 10, 200);\nvoid setup(){ Serial.begin(9600); }\nvoid loop(){ Serial.println(sonar.ping_cm()); delay(100); }`,
  parts: [uno, { id: 'h', type: 'hc-sr04', x: 300, y: 200 }],
  wires: [W('u', 'D9', 'h', 'TRIG'), W('u', 'D10', 'h', 'ECHO'), W('u', '5V', 'h', 'VCC'), W('u', 'GND.2', 'h', 'GND')],
}, 300, { check: ({ serial }) => (serial.includes('102') || serial.includes('100') ? true : serial) });

run('keypad', {
  code: `#include <Keypad.h>\nconst byte ROWS = 4; const byte COLS = 4;\nchar keys[ROWS][COLS] = {{'1','2','3','A'},{'4','5','6','B'},{'7','8','9','C'},{'*','0','#','D'}};\nbyte rowPins[ROWS] = {9, 8, 7, 6};\nbyte colPins[COLS] = {5, 4, 3, 2};\nKeypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS);\nvoid setup(){ Serial.begin(9600); }\nvoid loop(){ char k = keypad.getKey(); if (k) { Serial.print("Key: "); Serial.println(k); } }`,
  parts: [uno, { id: 'k', type: 'keypad-4x4', x: 300, y: 300 }],
  wires: [W('u', 'D9', 'k', 'R1'), W('u', 'D8', 'k', 'R2'), W('u', 'D7', 'k', 'R3'), W('u', 'D6', 'k', 'R4'), W('u', 'D5', 'k', 'C1'), W('u', 'D4', 'k', 'C2'), W('u', 'D3', 'k', 'C3'), W('u', 'D2', 'k', 'C4')],
}, 600, { onFrame: (e, t) => { if (t === 160) e.input('k', 'key', '5', true); if (t === 320) e.input('k', 'key', '5', false); if (t === 400) e.input('k', 'key', '#', true); }, check: ({ serial }) => (serial === 'Key: 5\r\nKey: #\r\n' ? true : serial) });

run('74hc595', {
  code: `int latch=8, clock=12, data=11;\nvoid setup(){ pinMode(latch,OUTPUT); pinMode(clock,OUTPUT); pinMode(data,OUTPUT); digitalWrite(latch,LOW); shiftOut(data, clock, MSBFIRST, 0b10100101); digitalWrite(latch,HIGH); }\nvoid loop(){}`,
  parts: [uno, { id: 'sr', type: '74hc595', x: 300, y: 200 }],
  wires: [W('u', 'D8', 'sr', 'RCLK'), W('u', 'D12', 'sr', 'SRCLK'), W('u', 'D11', 'sr', 'SER'), W('u', '5V', 'sr', 'VCC'), W('u', 'GND.2', 'sr', 'GND'), W('u', 'GND.2', 'sr', 'OE'), W('u', '5V', 'sr', 'SRCLR')],
}, 200, { check: ({ eng }) => (eng.parts.get('sr').latch === 0b10100101 ? true : 'latch=' + eng.parts.get('sr').latch.toString(2)) });

run('stepper 28byj', {
  code: `#include <Stepper.h>\nStepper motor(2048, 8, 10, 9, 11);\nvoid setup(){ motor.setSpeed(10); motor.step(512); }\nvoid loop(){}`,
  parts: [uno, { id: 'st', type: 'stepper-28byj', x: 300, y: 300 }],
  wires: [W('u', 'D8', 'st', 'IN1'), W('u', 'D9', 'st', 'IN2'), W('u', 'D10', 'st', 'IN3'), W('u', 'D11', 'st', 'IN4'), W('u', '5V', 'st', '+'), W('u', 'GND.2', 'st', '-')],
}, 2000, { check: ({ eng }) => { const a = eng.parts.get('st').visual.angle; return Math.abs(Math.abs(a) - 90) < 3 ? true : 'angle=' + a; } });

run('accelstepper a4988', {
  code: `#include <AccelStepper.h>\nAccelStepper st(AccelStepper::DRIVER, 3, 4);\nvoid setup(){ st.setMaxSpeed(1000); st.setAcceleration(2000); st.moveTo(200); st.runToPosition(); }\nvoid loop(){}`,
  parts: [uno, { id: 'a', type: 'stepper-a4988', x: 300, y: 300 }],
  wires: [W('u', 'D3', 'a', 'STEP'), W('u', 'D4', 'a', 'DIR'), W('u', '5V', 'a', 'VDD'), W('u', 'GND.2', 'a', 'GND')],
}, 1500, { check: ({ eng }) => (eng.parts.get('a').steps === 200 ? true : 'steps=' + eng.parts.get('a').steps) });

run('relay + lamp', {
  code: `void setup(){ pinMode(7, OUTPUT); digitalWrite(7, HIGH); }\nvoid loop(){}`,
  parts: [uno, { id: 'r', type: 'relay', x: 300, y: 200 }, { id: 'ps', type: 'power-supply', x: 500, y: 100, props: { voltage: 12 } }, { id: 'lp', type: 'lamp', x: 600, y: 100 }],
  wires: [W('u', 'D7', 'r', 'IN'), W('u', '5V', 'r', 'VCC'), W('u', 'GND.2', 'r', 'GND'), W('ps', '+', 'r', 'COM'), W('r', 'NO', 'lp', '1'), W('lp', '2', 'ps', '-')],
}, 300, { check: ({ eng }) => (eng.parts.get('lp').visual.b > 0.9 && eng.parts.get('r').visual.on ? true : 'lamp=' + eng.parts.get('lp').visual.b) });

run('l298n + motor pwm', {
  code: `void setup(){ pinMode(8,OUTPUT); pinMode(9,OUTPUT); digitalWrite(8,HIGH); digitalWrite(9,LOW); analogWrite(10, 128); }\nvoid loop(){}`,
  parts: [uno, { id: 'd', type: 'l298n', x: 300, y: 300 }, { id: 'ps', type: 'power-supply', x: 500, y: 100, props: { voltage: 12 } }, { id: 'm', type: 'dc-motor', x: 600, y: 100 }],
  wires: [W('u', 'D8', 'd', 'IN1'), W('u', 'D9', 'd', 'IN2'), W('u', 'D10', 'd', 'ENA'), W('u', 'GND.2', 'd', 'GND'), W('ps', '+', 'd', '12V'), W('ps', '-', 'd', 'GND'), W('d', 'OUT1', 'm', '1'), W('d', 'OUT2', 'm', '2')],
}, 1500, { check: ({ eng }) => { const r = eng.parts.get('m').visual.rpm; return r > 1500 && r < 12000 ? true : 'rpm=' + r; } });

run('mpu6050 adafruit', {
  code: `#include <Adafruit_MPU6050.h>\nAdafruit_MPU6050 mpu;\nvoid setup(){ Serial.begin(115200); if(!mpu.begin()){ Serial.println("no mpu"); while(1) delay(10);} sensors_event_t a, g, temp; mpu.getEvent(&a, &g, &temp); Serial.println(a.acceleration.z); Serial.println(temp.temperature); }\nvoid loop(){}`,
  parts: [uno, { id: 'm', type: 'mpu6050', x: 300, y: 200 }],
  wires: [W('u', 'A4', 'm', 'SDA'), W('u', 'A5', 'm', 'SCL'), W('u', '5V', 'm', 'VCC'), W('u', 'GND.2', 'm', 'GND')],
}, 400, { check: ({ serial }) => (serial.includes('9.81') && serial.includes('25.00') ? true : serial) });

run('mpu6050 raw wire', {
  code: `#include <Wire.h>\nvoid setup(){ Serial.begin(9600); Wire.begin(); Wire.beginTransmission(0x68); Wire.write(0x6B); Wire.write(0); Wire.endTransmission(true);\n Wire.beginTransmission(0x68); Wire.write(0x3B); Wire.endTransmission(false); Wire.requestFrom(0x68, 6, true);\n int16_t ax = Wire.read()<<8 | Wire.read(); int16_t ay = Wire.read()<<8 | Wire.read(); int16_t az = Wire.read()<<8 | Wire.read(); Serial.println(az); }\nvoid loop(){}`,
  parts: [uno, { id: 'm', type: 'mpu6050', x: 300, y: 200 }],
  wires: [W('u', 'A4', 'm', 'SDA'), W('u', 'A5', 'm', 'SCL'), W('u', '5V', 'm', 'VCC'), W('u', 'GND.2', 'm', 'GND')],
}, 200, { check: ({ serial }) => (serial.trim() === '16384' ? true : serial) });

run('i2c scanner', {
  code: `#include <Wire.h>\nvoid setup(){ Serial.begin(9600); Wire.begin(); for (byte a = 1; a < 127; a++) { Wire.beginTransmission(a); if (Wire.endTransmission() == 0) { Serial.print("0x"); Serial.println(a, HEX); } } }\nvoid loop(){}`,
  parts: [uno, { id: 'l', type: 'lcd-i2c', x: 300, y: 200 }, { id: 'o', type: 'oled-ssd1306', x: 300, y: 400 }],
  wires: [W('u', 'A4', 'l', 'SDA'), W('u', 'A5', 'l', 'SCL'), W('u', '5V', 'l', 'VCC'), W('u', 'GND.2', 'l', 'GND'), W('u', 'A4', 'o', 'SDA'), W('u', 'A5', 'o', 'SCL'), W('u', '5V', 'o', 'VCC'), W('u', 'GND.2', 'o', 'GND')],
}, 300, { check: ({ serial }) => (serial === '0x27\r\n0x3C\r\n' ? true : serial) });

run('rtc', {
  code: `#include <RTClib.h>\nRTC_DS1307 rtc;\nvoid setup(){ Serial.begin(9600); if (!rtc.begin()) Serial.println("no rtc"); rtc.adjust(DateTime(2024, 5, 17, 10, 30, 0)); delay(2000); DateTime now = rtc.now(); Serial.print(now.year()); Serial.print('/'); Serial.print(now.month()); Serial.print('/'); Serial.print(now.day()); Serial.print(' '); Serial.print(now.hour()); Serial.print(':'); Serial.print(now.minute()); Serial.print(':'); Serial.println(now.second()); }\nvoid loop(){}`,
  parts: [uno, { id: 'r', type: 'rtc-ds1307', x: 300, y: 200 }],
  wires: [W('u', 'A4', 'r', 'SDA'), W('u', 'A5', 'r', 'SCL'), W('u', '5V', 'r', 'VCC'), W('u', 'GND.2', 'r', 'GND')],
}, 2500, { check: ({ serial }) => (serial.startsWith('2024/5/17 10:30:2') ? true : serial) });

run('tm1637', {
  code: `#include <TM1637Display.h>\nTM1637Display display(2, 3);\nvoid setup(){ display.setBrightness(7); display.showNumberDec(1234); }\nvoid loop(){}`,
  parts: [uno, { id: 't', type: 'tm1637', x: 300, y: 200 }],
  wires: [W('u', 'D2', 't', 'CLK'), W('u', 'D3', 't', 'DIO'), W('u', '5V', 't', 'VCC'), W('u', 'GND.2', 't', 'GND')],
}, 200, { check: ({ eng }) => { const s = eng.parts.get('t').tm1637.segs; return s[0] === 0x06 && s[3] === 0x66 ? true : s.join(','); } });

run('max7219', {
  code: `#include <LedControl.h>\nLedControl lc(12, 11, 10, 1);\nvoid setup(){ lc.shutdown(0, false); lc.setIntensity(0, 8); lc.clearDisplay(0); lc.setLed(0, 2, 3, true); lc.setRow(0, 7, 0xFF); }\nvoid loop(){}`,
  parts: [uno, { id: 'm', type: 'max7219', x: 300, y: 200 }],
  wires: [W('u', 'D12', 'm', 'DIN'), W('u', 'D11', 'm', 'CLK'), W('u', 'D10', 'm', 'CS'), W('u', '5V', 'm', 'VCC'), W('u', 'GND.2', 'm', 'GND')],
}, 200, { check: ({ eng }) => { const d = eng.parts.get('m').max7219[0]; return d.rows[2] === 0x10 && d.rows[7] === 0xff && !d.shutdown ? true : Array.from(d.rows).join(','); } });

run('ir remote', {
  code: `#include <IRremote.h>\nvoid setup(){ Serial.begin(9600); IrReceiver.begin(11, ENABLE_LED_FEEDBACK); }\nvoid loop(){ if (IrReceiver.decode()) { Serial.println(IrReceiver.decodedIRData.command, HEX); IrReceiver.resume(); } }`,
  parts: [uno, { id: 'ir', type: 'ir-receiver', x: 300, y: 200 }],
  wires: [W('u', 'D11', 'ir', 'OUT'), W('u', '5V', 'ir', 'VCC'), W('u', 'GND.2', 'ir', 'GND')],
}, 300, { onFrame: (e, t) => { if (t === 96) e.input('ir', 'ir', 0x45); }, check: ({ serial }) => (serial === '45\r\n' ? true : serial) });

run('ir remote old api', {
  code: `#include <IRremote.h>\nIRrecv irrecv(11);\ndecode_results results;\nvoid setup(){ Serial.begin(9600); irrecv.enableIRIn(); }\nvoid loop(){ if (irrecv.decode(&results)) { Serial.println(results.value, HEX); irrecv.resume(); } }`,
  parts: [uno, { id: 'ir', type: 'ir-receiver', x: 300, y: 200 }],
  wires: [W('u', 'D11', 'ir', 'OUT'), W('u', '5V', 'ir', 'VCC'), W('u', 'GND.2', 'ir', 'GND')],
}, 300, { onFrame: (e, t) => { if (t === 96) e.input('ir', 'ir', 0x45); }, check: ({ serial }) => (serial === 'FFA25D\r\n' ? true : serial) });

run('ds18b20', {
  code: `#include <OneWire.h>\n#include <DallasTemperature.h>\nOneWire oneWire(2);\nDallasTemperature sensors(&oneWire);\nvoid setup(){ Serial.begin(9600); sensors.begin(); sensors.requestTemperatures(); Serial.println(sensors.getTempCByIndex(0)); }\nvoid loop(){}`,
  parts: [uno, { id: 't', type: 'ds18b20', x: 300, y: 200 }, { id: 'r', type: 'resistor', x: 300, y: 100, props: { value: 4700 } }],
  wires: [W('u', 'D2', 't', 'DQ'), W('u', '5V', 't', 'VDD'), W('u', 'GND.2', 't', 'GND'), W('r', '1', 't', 'DQ'), W('r', '2', 't', 'VDD')],
}, 1200, { check: ({ serial }) => (serial.trim() === '23.00' ? true : serial) });

run('sensor module ldr', {
  code: `void setup(){ Serial.begin(9600); pinMode(7, INPUT); }\nvoid loop(){ Serial.print(analogRead(A0)); Serial.print(' '); Serial.println(digitalRead(7)); delay(100); }`,
  parts: [uno, { id: 's', type: 'ldr-module', x: 300, y: 200 }],
  wires: [W('u', 'A0', 's', 'AO'), W('u', 'D7', 's', 'DO'), W('u', '5V', 's', 'VCC'), W('u', 'GND.2', 's', 'GND')],
}, 400, { onFrame: (e, t) => { if (t === 192) e.input('s', 'lux', 10); }, check: ({ serial }) => { const l = serial.trim().split('\r\n'); return l[0].endsWith(' 0') && l[l.length - 1].endsWith(' 1') ? true : serial; } });

run('pir + buzzer tone', {
  code: `void setup(){ Serial.begin(9600); pinMode(2, INPUT); }\nvoid loop(){ if (digitalRead(2)) { tone(8, 1000); Serial.println("motion"); delay(500); } else noTone(8); delay(50); }`,
  parts: [uno, { id: 'p', type: 'pir', x: 300, y: 200 }, { id: 'b', type: 'buzzer', x: 400, y: 200 }],
  wires: [W('u', 'D2', 'p', 'OUT'), W('u', '5V', 'p', 'VCC'), W('u', 'GND.2', 'p', 'GND'), W('u', 'D8', 'b', '+'), W('u', 'GND.3', 'b', '-')],
}, 800, { onFrame: (e, t) => { if (t === 160) e.input('p', 'motion', true); if (t === 400) e.__f = e.parts.get('b').visual.freq; }, check: ({ serial, eng }) => (serial.includes('motion') && eng.__f === 1000 ? true : serial + ' f=' + eng.__f) });

run('r4 wifi matrix', {
  code: `#include "Arduino_LED_Matrix.h"\nArduinoLEDMatrix matrix;\nconst uint32_t heart[] = { 0x3184a444, 0x44042081, 0x100a0040 };\nvoid setup(){ matrix.begin(); matrix.loadFrame(heart); }\nvoid loop(){}`,
  parts: [{ id: 'u', type: 'uno-r4-wifi', x: 0, y: 0 }],
  wires: [],
}, 200, { check: ({ eng }) => { const m = eng.boardRt.visual.matrix; return m && m.filter(Boolean).length > 10 ? true : 'matrix=' + (m && m.join('')); } });

run('encoder', {
  code: `int last; int count = 0;\nvoid setup(){ Serial.begin(9600); pinMode(2, INPUT); pinMode(3, INPUT); last = digitalRead(2); }\nvoid loop(){ int c = digitalRead(2); if (c != last && c == LOW) { if (digitalRead(3) != c) count++; else count--; Serial.println(count); } last = c; }`,
  parts: [uno, { id: 'e', type: 'rotary-encoder', x: 300, y: 200 }],
  wires: [W('u', 'D2', 'e', 'CLK'), W('u', 'D3', 'e', 'DT'), W('u', '5V', 'e', '+'), W('u', 'GND.2', 'e', 'GND')],
}, 400, { onFrame: (e, t) => { if (t === 96) e.input('e', 'rotate', 1); if (t === 160) e.input('e', 'rotate', 1); if (t === 256) e.input('e', 'rotate', -1); }, check: ({ serial }) => (serial === '1\r\n2\r\n1\r\n' ? true : serial) });

run('hc-sr04 echo timed by a CHANGE interrupt (pulse shorter than a frame)', {
  code: `volatile unsigned long t0 = 0, width = 0;\nvoid echoIsr(){ if (digitalRead(2)) t0 = micros(); else width = micros() - t0; }\nvoid setup(){ Serial.begin(115200); pinMode(9, OUTPUT); pinMode(2, INPUT); attachInterrupt(digitalPinToInterrupt(2), echoIsr, CHANGE); }\nvoid loop(){ digitalWrite(9, HIGH); delayMicroseconds(10); digitalWrite(9, LOW); delay(100); Serial.println(width); }`,
  parts: [uno, { id: 's', type: 'hc-sr04', x: 300, y: 200 }],
  wires: [W('u', '5V', 's', 'VCC'), W('u', 'GND.2', 's', 'GND'), W('u', 'D9', 's', 'TRIG'), W('u', 'D2', 's', 'ECHO')],
}, 450, { check: ({ serial }) => { const v = serial.trim().split(/\r\n/).map(Number); return v.length >= 3 && v.every((x) => Math.abs(x - 5830) < 10) ? true : serial; } });

run('LOW interrupt fires while the button is held', {
  code: `volatile int n = 0;\nvoid isr(){ n++; }\nvoid setup(){ Serial.begin(9600); pinMode(2, INPUT_PULLUP); attachInterrupt(0, isr, LOW); }\nvoid loop(){ Serial.println(n); delay(200); }`,
  parts: [uno, { id: 'b', type: 'pushbutton', x: 300, y: 200 }],
  wires: [W('u', 'D2', 'b', '1.l'), W('u', 'GND.2', 'b', '2.l')],
}, 800, {
  onFrame: (e, t) => { if (t === 304) e.input('b', 'press', true); if (t === 496) e.input('b', 'press', false); },
  check: ({ serial }) => { const v = serial.trim().split(/\r\n/).map(Number); return v[1] === 0 && v[2] > 0 && v[3] > v[2] ? true : serial; },
});

run('ESP.restart() resets the board (globals, pins, ISRs) but not Preferences', {
  code: `#include <Preferences.h>\nPreferences p; int n; volatile int hits;\nvoid isr(){ hits++; }\nvoid setup(){ Serial.begin(115200); n++; p.begin("t", false); int b = p.getInt("b", 0) + 1; p.putInt("b", b);\n  Serial.printf("boot %d nvs %d ms %d\\n", n, b, (int)(millis() / 100));\n  if (b == 1) { pinMode(4, OUTPUT); digitalWrite(4, HIGH); attachInterrupt(5, isr, CHANGE); }\n  delay(300); if (b < 3) ESP.restart(); }\nvoid loop(){}`,
  parts: [{ id: 'esp', type: 'esp32-devkit', x: 0, y: 0 }],
  wires: [],
}, 1500, { check: ({ eng, serial }) => { const st = eng.pins.get(4); const isr = eng.pins.get(5).isr; return (serial.match(/boot 1 nvs \d ms 0/g) || []).length === 3 && /nvs 3/.test(serial) && st.mode === 0 && !isr ? true : serial; } });

run('NeoPixel NEO_GRBW: green is green, white LED lights', {
  code: `#include <Adafruit_NeoPixel.h>\nAdafruit_NeoPixel s(16, 6, NEO_GRBW + NEO_KHZ800);\nvoid setup(){ s.begin(); s.setPixelColor(0, s.Color(0, 255, 0)); s.setPixelColor(1, 0, 0, 0, 200); s.show(); }\nvoid loop(){}`,
  parts: [uno, { id: 'r', type: 'neopixel', x: 300, y: 0, props: {} }],
  wires: [W('u', 'D6', 'r', 'DIN'), W('u', '5V', 'r', 'VCC'), W('u', 'GND.2', 'r', 'GND')],
}, 200, { check: ({ eng }) => { const px = eng.parts.get('r').visual.px; return px[0] === 0x00ff00 && px[1] === 0xc8c8c8 ? true : px.slice(0, 2).map((c) => c.toString(16)).join(','); } });

run('C++: reference returns, default ctors of array elements / members, lazy static locals', {
  code: `struct P { int x; P() { x = 7; } };\nstruct Outer { P in; };\nP pts[3]; Outer o;\nP& at(int i) { return pts[i]; }\nint g = 5; int& r() { return g; }\nstruct V { int s = 1; V& add(int k) { s += k; return *this; } };\nint f(int x) { static int first = x; return first; }\nvoid setup(){ Serial.begin(9600); V v; v.add(2).add(3); at(0).x = 9; f(4);\n  Serial.print(r() + 1); Serial.print(' '); Serial.print(at(1).x); Serial.print(' '); Serial.print(pts[0].x); Serial.print(' '); Serial.print(o.in.x); Serial.print(' '); Serial.print(v.s); Serial.print(' '); Serial.println(f(8)); }\nvoid loop(){}`,
  parts: [uno],
  wires: [],
}, 100, { check: ({ serial }) => (serial === '6 7 9 7 6 4\r\n' ? true : serial) });

console.log(failures ? `\n${failures} FAILED` : '\nall device tests passed');
process.exit(failures ? 1 : 0);
