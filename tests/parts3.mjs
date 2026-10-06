// New 3.0 parts: regulator, BMP280, ACS712, voltage sensor, DIP switch, optocoupler, TB6612, solenoid, HC-05, GPS, robot car.
import '../web/src/components/index.js';
import { SimEngine } from '../web/src/sim/engine.js';
import { P, at, W, C } from '../web/src/examples/helpers.js';

let failed = 0;
const check = (cond, msg) => { if (!cond) { failed++; console.log('✗', msg); } else console.log('✓', msg); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

/** Wraps a list of [ms, fn] steps into a hook that fires each once when the time is reached. */
const steps = (list) => { const done = new Set(); return (t, e) => { list.forEach(([at_, fn], i) => { if (t >= at_ && !done.has(i)) { done.add(i); fn(e); } }); }; };

function run({ parts, wires, code, lang, ms = 1000, board }, hook) {
  let serial = '';
  const errors = [], warns = [];
  const eng = new SimEngine({ code, parts, wires, lang, board }, {
    onSerial: (p, t) => { serial += t; }, onError: (e) => errors.push(e.message || String(e)), onWarning: (m) => warns.push(typeof m === 'string' ? m : m.message || JSON.stringify(m)),
  });
  const r = eng.start();
  if (!r.ok) { failed++; console.log('✗ start failed', JSON.stringify(r.error)); return { eng, serial, errors, warns }; }
  let wall = 1000; eng.tick(wall);
  for (let t = 0; t < ms; t += 16) { if (hook) hook(t, eng); wall += 16; eng.tick(wall); }
  return { eng, serial, errors, warns };
}
const uno = () => P('uno-r3', 0, 0, {}, 0, 'uno');

// ---- regulator: 9 V -> 5 V and 3.3 V
{
  const bat = at('battery-9v', '+', 100, 300, {}, 0, 'bat');
  const reg = at('regulator', 'IN', 200, 300, { model: '7805' }, 0, 'reg');
  const reg2 = at('regulator', 'IN', 300, 300, { model: 'ams1117-3v3' }, 0, 'reg2');
  const vm = at('voltmeter', 'V', 400, 300, {}, 0, 'vm');
  const vm2 = at('voltmeter', 'V', 500, 300, {}, 0, 'vm2');
  const u = uno();
  const { eng } = run({ parts: [u, bat, reg, reg2, vm, vm2], code: 'void setup(){} void loop(){}', wires: [
    W(bat, '+', reg, 'IN'), W(bat, '+', reg2, 'IN'), W(bat, '-', reg, 'GND'), W(bat, '-', reg2, 'GND'), W(bat, '-', u, 'GND.1'),
    W(reg, 'OUT', vm, 'V'), W(reg2, 'OUT', vm2, 'V'), W(bat, '-', vm, 'COM'), W(bat, '-', vm2, 'COM'),
  ] }, null);
  check(near(eng.parts.get('vm').visual.v, 5, 0.1) && near(eng.parts.get('vm2').visual.v, 3.3, 0.1), `regulators: 7805 → ${eng.parts.get('vm').visual.v.toFixed(2)} V, AMS1117 → ${eng.parts.get('vm2').visual.v.toFixed(2)} V`);
}

// ---- BMP280 with the Adafruit library
{
  const u = uno();
  const b = at('bmp280', 'VCC', 300, 300, { address: '118' }, 0, 'bmp');
  const { eng, serial, errors } = run({ parts: [u, b], code: `#include <Wire.h>
#include <Adafruit_BMP280.h>
Adafruit_BMP280 bmp;
void setup(){ Serial.begin(9600); if (!bmp.begin(0x76)) { Serial.println("no sensor"); return; } }
void loop(){ Serial.print(bmp.readTemperature()); Serial.print(" C, "); Serial.print(bmp.readPressure() / 100.0); Serial.print(" hPa, "); Serial.print(bmp.readAltitude(1013.25)); Serial.println(" m"); delay(500); }`, wires: [
    W(u, '5V', b, 'VCC'), W(u, 'GND.1', b, 'GND'), W(u, 'SCL', b, 'SCL'), W(u, 'SDA', b, 'SDA'),
  ], ms: 1200 }, steps([[700, (e) => { e.input('bmp', 'press', 900); e.input('bmp', 'temp', 31.5); }]]));
  check(!errors.length && /24\.00 C, 1013\.00 hPa, \d\.\d+ m/.test(serial) && /31\.50 C, 900\.00 hPa, 9\d\d\.\d+ m/.test(serial), `BMP280: ${JSON.stringify(serial.split('\n').filter(Boolean).slice(-1)[0])}`);
}

// ---- ACS712 + voltage sensor
{
  const u = uno();
  const bat = at('battery-9v', '+', 100, 300, {}, 0, 'bat');
  const acs = at('acs712', 'VCC', 250, 300, { range: '5' }, 0, 'acs');
  const r = at('resistor', '1', 360, 300, { value: 18 }, 0, 'r');
  const vs = at('voltage-sensor', 'S', 450, 300, {}, 0, 'vs');
  const { serial } = run({ parts: [u, bat, acs, r, vs], code: `void setup(){ Serial.begin(9600); }
void loop(){ Serial.print(analogRead(A0)); Serial.print(' '); Serial.println(analogRead(A1)); delay(200); }`, wires: [
    W(u, '5V', acs, 'VCC'), W(u, 'GND.1', acs, 'GND'), W(acs, 'OUT', u, 'A0'),
    W(bat, '+', acs, 'IP+'), W(acs, 'IP-', r, '1'), W(r, '2', bat, '-'), W(bat, '-', u, 'GND.2'),
    W(bat, '+', vs, 'VIN'), W(bat, '-', vs, 'GND'), W(vs, 'S', u, 'A1'),
  ], ms: 800 });
  const [a0, a1] = serial.trim().split('\n').pop().split(' ').map(Number);
  // 9 V / 18 Ω = 0.5 A -> 2.5 V + 0.0925 V = 2.5925 V -> 531; 9 V / 5 = 1.8 V -> 368
  check(near(a0, 531, 12) && near(a1, 350, 22), `ACS712 reads ${a0} (≈531 for 0.5 A), voltage sensor ${a1} (≈350: a loaded 9 V battery sags to ~8.5 V)`);
}

// ---- DIP switch + optocoupler
{
  const u = uno();
  const dip = at('dip-switch-8', 'a1', 300, 300, {}, 0, 'dip');
  const op = at('optocoupler', 'A', 520, 300, {}, 0, 'op');
  const r1 = at('resistor', '1', 420, 300, { value: 330 }, 0, 'r1');
  const r2 = at('resistor', '1', 600, 300, { value: 10000 }, 0, 'r2');
  const { eng, serial } = run({ parts: [u, dip, op, r1, r2], code: `void setup(){ Serial.begin(9600); pinMode(2, INPUT_PULLUP); pinMode(3, INPUT); pinMode(8, OUTPUT); }
void loop(){ digitalWrite(8, millis() % 1000 < 500); Serial.print(digitalRead(2)); Serial.println(digitalRead(3)); delay(100); }`, wires: [
    W(u, 'D2', dip, 'a1'), W(dip, 'b1', u, 'GND.1'),
    W(u, 'D8', r1, '1'), W(r1, '2', op, 'A'), W(op, 'K', u, 'GND.1'),
    W(u, '5V', r2, '1'), W(r2, '2', op, 'C'), W(r2, '2', u, 'D3'), W(op, 'E', u, 'GND.2'),
  ], ms: 1400 }, steps([[600, (e) => e.input('dip', 's1', true)]]));
  const lines = serial.trim().split('\n');
  check(lines.some((l) => l[0] === '1') && lines.some((l) => l[0] === '0'), `DIP switch changes D2: ${[...new Set(lines.map((l) => l[0]))].join('/')}`);
  check(lines.some((l) => l[1] === '0') && lines.some((l) => l[1] === '1'), `optocoupler pulls D3 low while its LED is on: ${[...new Set(lines.map((l) => l[1]))].join('/')}`);
}

// ---- TB6612 + DC motor, solenoid
{
  const u = uno();
  const bat = at('battery-9v', '+', 100, 300, {}, 0, 'bat');
  const drv = at('tb6612', 'VM', 220, 300, {}, 0, 'drv');
  const m = at('dc-motor', '1', 420, 300, {}, 0, 'm');
  const sol = at('solenoid', '1', 520, 300, {}, 0, 'sol');
  const { eng, serial } = run({ parts: [u, bat, drv, m, sol], code: `void setup(){ pinMode(2,OUTPUT); pinMode(3,OUTPUT); pinMode(5,OUTPUT); pinMode(7,OUTPUT); digitalWrite(7,HIGH); digitalWrite(5,HIGH); }
void loop(){ digitalWrite(2,HIGH); digitalWrite(3,LOW); delay(800); digitalWrite(2,LOW); digitalWrite(3,HIGH); delay(800); }`, wires: [
    W(bat, '+', drv, 'VM'), W(bat, '-', u, 'GND.1'), W(u, '5V', drv, 'VCC'), W(u, 'GND.2', drv, 'GND'),
    W(u, 'D2', drv, 'AIN1'), W(u, 'D3', drv, 'AIN2'), W(u, 'D5', drv, 'PWMA'), W(u, 'D7', drv, 'STBY'),
    W(drv, 'AO1', m, '1'), W(drv, 'AO2', m, '2'),
    W(bat, '+', sol, '1'), W(sol, '2', bat, '-'),
  ], ms: 400 });
  const rpm1 = eng.parts.get('m').visual.rpm;
  let wall = 1000 + 400 + 400 + 16;
  for (let t = 0; t < 1000; t += 16) { wall += 16; eng.tick(wall); }
  const rpm2 = eng.parts.get('m').visual.rpm;
  check(Math.abs(rpm1) > 500 && Math.abs(rpm2) > 500 && Math.sign(rpm1) !== Math.sign(rpm2), `TB6612 drives the motor forward (${Math.round(rpm1)} rpm) and reverse (${Math.round(rpm2)} rpm)`);
  check(eng.parts.get('sol').visual.pull === 1, 'solenoid pulls in on 9 V');
}

// ---- HC-05 + SoftwareSerial (Arduino) and machine.UART (MicroPython)
{
  const u = uno();
  const bt = at('hc05', 'STATE', 300, 300, {}, 0, 'bt');
  const { eng, serial, warns } = run({ parts: [u, bt], code: `#include <SoftwareSerial.h>
SoftwareSerial bt(10, 11); // RX, TX
void setup(){ Serial.begin(9600); bt.begin(9600); bt.println("ready"); }
void loop(){ while (bt.available()) { char c = bt.read(); Serial.print("got:"); Serial.println((int)c); bt.print("echo "); bt.println(c); } }`, wires: [
    W(u, '5V', bt, 'VCC'), W(u, 'GND.1', bt, 'GND'), W(u, 'D10', bt, 'TXD'), W(u, 'D11', bt, 'RXD'),
  ], ms: 1400 }, steps([[100, (e) => e.input('bt', 'connect', true)], [600, (e) => e.input('bt', 'send', 'A')]]));
  const log = eng.parts.get('bt').log;
  check(serial.includes('got:65') && log.some((m) => m.dir === 'phone' && m.text === 'A') && log.some((m) => m.dir === 'mcu' && /echo A/.test(m.text)), `HC-05 round trip: ${JSON.stringify(log.map((m) => m.dir + ':' + m.text.trim()))}`);
}
{
  const esp = P('esp32-devkit', 30, 0, {}, 0, 'esp');
  const bt = at('hc05', 'STATE', 300, 300, {}, 0, 'bt');
  const { eng, serial, errors } = run({ lang: 'python', parts: [esp, bt], code: `from machine import UART, Pin
import time
uart = UART(2, baudrate=9600, tx=17, rx=16)
uart.write("hello phone\\n")
while True:
    if uart.any():
        line = uart.readline()
        print("rx", line)
        uart.write(b"ack " + line)
    time.sleep_ms(50)
`, wires: [W(esp, '3V3', bt, 'VCC'), W(esp, 'GND.2', bt, 'GND'), W(esp, 'RX2', bt, 'TXD'), W(esp, 'TX2', bt, 'RXD')], ms: 1200 }, steps([[100, (e) => e.input('bt', 'connect', true)], [300, (e) => e.input('bt', 'send', 'led on\n')]]));
  const log = eng.parts.get('bt').log;
  check(!errors.length && /rx b'led on\\n'/.test(serial) && log.some((m) => m.dir === 'mcu' && /ack led on/.test(m.text)), `MicroPython UART ↔ HC-05: ${JSON.stringify(serial.trim())}`);
}

// ---- GPS NEO-6M
{
  const u = uno();
  const gps = at('gps-neo6m', 'VCC', 300, 300, {}, 0, 'gps');
  const { eng, serial } = run({ parts: [u, gps], code: `#include <SoftwareSerial.h>
SoftwareSerial gpsSerial(4, 3);
String line;
void setup(){ Serial.begin(9600); gpsSerial.begin(9600); }
void loop(){ while (gpsSerial.available()) { char c = gpsSerial.read(); if (c == '\\n') { if (line.startsWith("$GPRMC")) Serial.println(line); line = ""; } else if (c != '\\r') line += c; } }`, wires: [
    W(u, '5V', gps, 'VCC'), W(u, 'GND.1', gps, 'GND'), W(u, 'D4', gps, 'TXD'),
  ], ms: 9500 });
  const lines = serial.trim().split('\n').map((l) => l.trim());
  const first = lines[0], last = lines[lines.length - 1];
  const ck = (l) => { const m = /^\$(.*)\*([0-9A-F]{2})$/.exec(l); if (!m) return false; let c = 0; for (const ch of m[1]) c ^= ch.charCodeAt(0); return c.toString(16).toUpperCase().padStart(2, '0') === m[2]; };
  check(lines.length >= 7 && ck(first) && ck(last) && /,V,/.test(first) && /,A,2348\.\d+,N,09024\.\d+,E,/.test(last), `GPS: first "${first.slice(0, 40)}…" last "${last.slice(0, 60)}…"`);
}

// ---- robot car
{
  const u = uno();
  const car = at('robot-car', 'L+', 100, 400, {}, 0, 'car');
  const bat = at('battery-aa4', '+', 100, 300, {}, 0, 'bat');
  const { eng } = run({ parts: [u, car, bat], code: 'void setup(){} void loop(){}', wires: [
    W(bat, '+', car, 'L+'), W(bat, '+', car, 'R+'), W(bat, '-', car, 'L-'), W(bat, '-', car, 'R-'), W(bat, '-', u, 'GND.1'),
  ], ms: 1000 });
  const c = eng.parts.get('car').car;
  check(c.x > 95 && Math.abs(c.y - 50) < 3 && Math.abs(c.a) < 0.01, `robot car drives straight on a 4×AA pack: x=${c.x.toFixed(1)} y=${c.y.toFixed(1)}`);
  const { eng: e2 } = run({ parts: [u, car, bat], code: 'void setup(){} void loop(){}', wires: [W(bat, '+', car, 'L+'), W(bat, '-', car, 'L-'), W(bat, '-', car, 'R+'), W(bat, '-', car, 'R-'), W(bat, '-', u, 'GND.1')], ms: 1000 });
  check(Math.abs(e2.parts.get('car').car.a) > 0.5, `robot car turns when only one wheel runs: angle=${e2.parts.get('car').car.a.toFixed(2)} rad`);
}
console.log(failed ? `\n${failed} FAILED` : '\nall 3.0 part tests passed');
process.exit(failed ? 1 : 0);
