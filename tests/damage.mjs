// Wear-and-burn model: parts burn when — and only when — the real thing would, once, with time.
//   node tests/damage.mjs
import '../web/src/components/index.js';
import '../web/src/pi/circuit-parts.js';
import { SimEngine } from '../web/src/sim/engine.js';
import { ledStress, resistorStress, pinCurrentStress, supplyStress } from '../web/src/sim/damage.js';

let failed = 0, passed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log('  ok  ' + name); } else { failed++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}
const W = (a, ap, b, bp) => ({ id: 'w' + Math.random().toString(36).slice(2, 7), from: { part: a, pin: ap }, to: { part: b, pin: bp }, points: [] });
const uno = { id: 'u', type: 'uno-r3', x: 0, y: 0 };
const esp = { id: 'u', type: 'esp32-devkit', x: 0, y: 0 };
const blink = (pin) => `void setup(){ pinMode(${pin}, OUTPUT); } void loop(){ digitalWrite(${pin}, HIGH); delay(500); }`;

/** Run a project; returns { eng, warns, burnedAt(id), t() } stepping virtual time to `secs`. */
function run(project, secs, { sample } = {}) {
  const warns = [], burns = [];
  const eng = new SimEngine(project, { onWarning: (m) => warns.push([eng.time() / 1e6, m]), onBurn: (id) => burns.push([eng.time() / 1e6, id]), onError: (e) => warns.push([eng.time() / 1e6, 'ERROR ' + e.message]) });
  const r = eng.start();
  if (!r.ok) throw new Error('start failed: ' + JSON.stringify(r.error));
  let wall = 1000;
  eng.tick(wall);
  for (let i = 0; i < secs * 62.5; i++) {
    wall += 16; eng.tick(wall);
    if (sample) sample(eng, eng.time() / 1e6);
  }
  const burnT = (id) => { const b = burns.find((x) => x[1] === id); return b ? b[0] : null; };
  return { eng, warns, burns, burnT };
}

console.log('stress curves');
check('LED at its rating never wears out (20 mA)', ledStress(0.02) * 3600 < 1);
check('LED at 60 mA lasts about 20 s', 1 / ledStress(0.06) > 12 && 1 / ledStress(0.06) < 30, 1 / ledStress(0.06));
check('LED at 90 mA lasts a few seconds', 1 / ledStress(0.09) > 1.5 && 1 / ledStress(0.09) < 6, 1 / ledStress(0.09));
check('LED across 5 V (300 mA) goes in milliseconds', 1 / ledStress(0.3) < 0.02, 1 / ledStress(0.3));
check('resistor at its rating lasts for ever', resistorStress(0.25) === 0);
check('resistor at 4× power lasts about a second', 1 / resistorStress(1.0) > 0.5 && 1 / resistorStress(1.0) < 3, 1 / resistorStress(1.0));
check('pin at 80 mA lasts about ten seconds, at 53 mA over a minute', 1 / pinCurrentStress(0.08) < 15 && 1 / pinCurrentStress(0.053) > 40);
check('module at its supply voltage is fine, at double it is not', supplyStress(5, 5.5) === 0 && 1 / supplyStress(10, 5.5) < 5);

console.log('LED with a resistor (the normal case) never burns');
{
  const p = { code: blink(13), parts: [uno, { id: 'r', type: 'resistor', x: 300, y: 100, props: { value: 220 } }, { id: 'l', type: 'led', x: 360, y: 100, props: { color: 'red' } }],
    wires: [W('u', 'D13', 'r', '1'), W('r', '2', 'l', 'A'), W('l', 'C', 'u', 'GND.1')] };
  const { eng, warns } = run(p, 60);
  check('LED + 220 Ω survives a minute', !eng.parts.get('l').burnt && !eng.parts.get('r').burnt);
  check('and it is lit', eng.parts.get('l').visual.b > 0.2);
  check('without a single warning', warns.length === 0, JSON.stringify(warns));
}

console.log('three LEDs wired straight to the pins (no resistors)');
{
  const code = 'void setup(){ pinMode(8,OUTPUT); pinMode(5,OUTPUT); pinMode(2,OUTPUT); digitalWrite(8,HIGH); digitalWrite(5,HIGH); digitalWrite(2,HIGH); } void loop(){}';
  const p = { code, parts: [uno, { id: 'a', type: 'led', x: 300, y: 100, props: { color: 'red' } }, { id: 'b', type: 'led', x: 340, y: 100, props: { color: 'green' } }, { id: 'c', type: 'led', x: 380, y: 100, props: { color: 'blue' } }],
    wires: [W('u', 'D8', 'a', 'A'), W('u', 'GND.1', 'a', 'C'), W('u', 'D5', 'b', 'A'), W('u', 'GND.1', 'b', 'C'), W('u', 'D2', 'c', 'A'), W('u', 'GND.1', 'c', 'C')] };
  let litAt1 = null;
  const { eng, warns, burnT } = run(p, 60, { sample: (e, t) => { if (litAt1 === null && t >= 1) litAt1 = e.parts.get('a').visual.b; } });
  check('they glow (hard) at first instead of dying at once', litAt1 > 0.9, litAt1);
  const ta = burnT('a'), tb = burnT('b'), tc = burnT('c');
  check('every LED burns', ta && tb && tc, JSON.stringify([ta, tb, tc]));
  check('not instantly: the first one lasts 1 – 15 s', ta > 1 && ta < 15, ta);
  check('the blue one (lower current) outlives the red', tc > ta, JSON.stringify([ta, tc]));
  const burnWarns = warns.filter((w) => /burned out/.test(w[1]));
  check('exactly one burn message per LED, never repeated', burnWarns.length === 3, burnWarns.length + ': ' + burnWarns.map((w) => w[1].slice(0, 30)).join(' | '));
  check('the pin overload is reported once per pin', warns.filter((w) => /is supplying/.test(w[1])).length === 3);
  check('burnt LEDs are dark and stay dark', eng.parts.get('a').visual.b === 0 && eng.parts.get('a').visual.burnt === true);
}

console.log('an LED straight across 5 V');
{
  const p = { code: 'void setup(){} void loop(){}', parts: [uno, { id: 'l', type: 'led', x: 300, y: 100 }], wires: [W('u', '5V', 'l', 'A'), W('u', 'GND.1', 'l', 'C')] };
  const { burnT } = run(p, 2);
  check('burns within 100 ms', burnT('l') !== null && burnT('l') < 0.1, burnT('l'));
}

console.log('resistor power');
{
  const p = { code: 'void setup(){} void loop(){}', parts: [{ id: 'b', type: 'battery-9v', x: 0, y: 0 }, { id: 'r', type: 'resistor', x: 100, y: 0, props: { value: 47 } }],
    wires: [W('b', '+', 'r', '1'), W('r', '2', 'b', '-')] };
  const { eng, burnT, warns } = run(p, 40);
  check('47 Ω across 9 V (1.6 W in a ¼ W resistor) burns', burnT('r') !== null && burnT('r') > 0.05 && burnT('r') < 5, burnT('r'));
  check('the resistor opens: no current any more', Math.abs(eng.parts.get('r').visual.i) < 1e-6);
  check('burn message once', warns.filter((w) => /Resistor .* burned out/.test(w[1])).length === 1);
  const ok = { code: 'void setup(){} void loop(){}', parts: [{ id: 'b', type: 'battery-9v', x: 0, y: 0 }, { id: 'r', type: 'resistor', x: 100, y: 0, props: { value: 470 } }],
    wires: [W('b', '+', 'r', '1'), W('r', '2', 'b', '-')] };
  check('470 Ω across 9 V (0.17 W) is fine', !run(ok, 60).eng.parts.get('r').burnt);
}

console.log('a pin shorted to ground');
{
  const p = { code: blink(7), parts: [uno], wires: [W('u', 'D7', 'u', 'GND.1')] };
  const { eng, burnT, warns } = run(p, 10);
  check('pin D7 burns in a few seconds', eng.pins.get(7).dead === true && eng.pins.get(7).stress.v >= 1);
  check('the board says which pin', warns.some((w) => /pin D7 burned out/.test(w[1])), JSON.stringify(warns.map((w) => w[1])));
  check('other pins are fine', !eng.pins.get(8).dead);
  void burnT;
}

console.log('5 V on a 3.3 V pin');
{
  const p = { code: 'void setup(){ pinMode(4, INPUT); } void loop(){}', parts: [esp, { id: 'ps', type: 'power-supply', x: 300, y: 100, props: { voltage: 5 } }],
    wires: [W('ps', '+', 'u', 'D4'), W('ps', '-', 'u', 'GND.1')] };
  const { eng, warns } = run(p, 60);
  check('the ESP32 GPIO burns (not at once)', eng.pins.get(4).dead === true);
  check('and the message tells what to do', warns.some((w) => /voltage divider/.test(w[1])));
  const ok = { code: 'void setup(){ pinMode(4, INPUT); } void loop(){}', parts: [esp, { id: 'ps', type: 'power-supply', x: 300, y: 100, props: { voltage: 3.3 } }],
    wires: [W('ps', '+', 'u', 'D4'), W('ps', '-', 'u', 'GND.1')] };
  check('3.3 V on it is fine', !run(ok, 60).eng.pins.get(4).dead);
}

console.log('modules on too much voltage / the wrong way round');
{
  const p = { code: 'void setup(){} void loop(){}', parts: [{ id: 'b', type: 'battery-9v', x: 0, y: 0 }, { id: 'sv', type: 'servo', x: 100, y: 100 }],
    wires: [W('b', '+', 'sv', 'V+'), W('b', '-', 'sv', 'GND')] };
  const { eng, burnT } = run(p, 20);
  check('a servo on 9 V burns', burnT('sv') !== null && burnT('sv') < 15, burnT('sv'));
  void eng;
  const rev = { code: 'void setup(){} void loop(){}', parts: [{ id: 'b', type: 'battery-9v', x: 0, y: 0 }, { id: 'd', type: 'dht22', x: 100, y: 100 }],
    wires: [W('b', '+', 'd', 'GND'), W('b', '-', 'd', 'VCC')] };
  const r2 = run(rev, 5);
  check('a DHT22 with reversed power burns fast', r2.burnT('d') !== null && r2.burnT('d') < 3, r2.burnT('d'));
  const ok = { code: 'void setup(){} void loop(){}', parts: [uno, { id: 'd', type: 'dht22', x: 300, y: 100 }], wires: [W('u', '5V', 'd', 'VCC'), W('u', 'GND.2', 'd', 'GND')] };
  check('on 5 V it is fine', !run(ok, 30).eng.parts.get('d').burnt);
}

console.log('a shorted battery');
{
  const p = { code: 'void setup(){} void loop(){}', parts: [{ id: 'b', type: 'battery-9v', x: 0, y: 0 }], wires: [W('b', '+', 'b', '-')] };
  const { burnT } = run(p, 20);
  check('burns out within seconds', burnT('b') !== null && burnT('b') < 8, burnT('b'));
}

console.log('7-segment: one bad segment');
{
  const code = 'void setup(){ pinMode(2,OUTPUT); digitalWrite(2,HIGH); } void loop(){}';
  const p = { code, parts: [uno, { id: 's', type: 'seven-segment', x: 300, y: 150 }], wires: [W('u', 'D2', 's', 'A'), W('s', 'COM.1', 'u', 'GND.1')] };
  const { eng, warns } = run(p, 25);
  check('segment A burns, no warning repeats', eng.parts.get('s').visual.b[0] === 0 && warns.filter((w) => /segment A/.test(w[1])).length === 1, JSON.stringify(warns.map((w) => w[1])));
}

console.log('the next run starts fresh');
{
  const p = { code: 'void setup(){} void loop(){}', parts: [uno, { id: 'l', type: 'led', x: 300, y: 100 }], wires: [W('u', '5V', 'l', 'A'), W('u', 'GND.1', 'l', 'C')] };
  run(p, 1);
  const again = run({ ...p, wires: [W('u', 'D13', 'l', 'A'), W('u', 'GND.1', 'l', 'C')], code: 'void setup(){ pinMode(13,OUTPUT); } void loop(){ digitalWrite(13,HIGH); delay(10); digitalWrite(13,LOW); delay(1000);}' }, 5);
  check('a new engine starts with an unburnt LED', !again.eng.parts.get('l').burnt);
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
