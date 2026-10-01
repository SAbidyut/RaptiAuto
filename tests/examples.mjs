// Run every gallery example headless: node tests/examples.mjs [id-filter]
// Fails on compile/runtime errors, unexpected warnings, wires to missing pins, or a failed per-example check.
import { EXAMPLES } from '../web/src/examples/index.js';
import { SimEngine } from '../web/src/sim/engine.js';
import { pinsOf, getDef } from '../web/src/components/registry.js';

const filter = process.argv[2];

/** Keypad presses: each key held for 120 ms, one every 250 ms. */
function keys(pid, seq, t0) {
  const a = {};
  [...seq].forEach((k, i) => { a[t0 + i * 250] = [pid, 'key', k, true]; a[t0 + i * 250 + 120] = [pid, 'key', k, false]; });
  return a;
}

// Per-example expectations (serial substrings, part state after the run, user input during the run).
const CHECKS = {
  'burn-demo': { allowWarn: ['burned', 'supplying'] },
  'ultrasonic': { ms: 1500, serial: ['Distance:', 'cm'] },
  'dht22-monitor': { ms: 4500, serial: ['Temperature', '24.0', 'Humidity', '55.0'] },
  'pir-alarm': { ms: 2500, act: { 900: ['pir', 'motion', true] }, serial: ['Motion detected'] },
  'lm35-thermometer': { ms: 1500, serial: ['°C'] },
  'gas-alarm': { ms: 2500, act: { 800: ['gas', 'ppm', 4000] }, serial: ['GAS'] },
  'ds18b20-temp': { ms: 2500, serial: ['Temperature:'] },
  'mpu6050-tilt': { ms: 1500, serial: ['Pitch'] },
  'joystick': { ms: 1200, serial: ['X:'] },
  'plant-watering': { ms: 2500, act: { 500: ['soil', 'moist', 10] }, serial: ['Pump ON'] },
  'lcd-i2c-hello': { ms: 1500 },
  'lcd-parallel': { ms: 1500 },
  'oled-graphics': { ms: 3000 },
  'tm1637-counter': { ms: 1500 },
  'max7219-matrix': { ms: 2000 },
  'seven-segment': { ms: 2500 },
  'neopixel-ring': { ms: 1500 },
  'r4-matrix': { ms: 2000 },
  'weather-station': { ms: 4500 },
  'keypad-lock': { ms: 2500, act: keys('kp', '1234#', 300), serial: ['Access granted'] },
  'servo-sweep': { ms: 2500 },
  'servo-knob': { ms: 1500 },
  'stepper-28byj': { ms: 3000 },
  'stepper-a4988': { ms: 3000 },
  'relay-lamp': { ms: 2500, serial: ['Lamp ON'] },
  'l298n-motor': { ms: 2500 },
  'transistor-motor': { ms: 2000 },
  'shift-register': { ms: 2000 },
  'buzzer-melody': { ms: 3000 },
  'ir-remote': { ms: 2000, act: { 600: ['ir', 'ir', 0x0c] }, serial: ['Button'] },
  'rotary-encoder': { ms: 1500, serial: ['Position'] },
  'rtc-clock': { ms: 2500 },
};

let failures = 0;
const ids = new Set();
for (const ex of EXAMPLES) {
  if (filter && !ex.id.includes(filter)) continue;
  const problems = [];
  if (ids.has(ex.id)) problems.push('duplicate id');
  ids.add(ex.id);
  // Static checks: every wire endpoint must exist.
  const parts = new Map(ex.parts.map((p) => [p.id, p]));
  if (parts.size !== ex.parts.length) problems.push('duplicate part id');
  for (const p of ex.parts) if (!getDef(p.type)) problems.push(`unknown part type ${p.type}`);
  for (const w of ex.wires) {
    for (const end of [w.from, w.to]) {
      const p = parts.get(end.part);
      if (!p) { problems.push(`wire ${w.id} → missing part ${end.part}`); continue; }
      if (!pinsOf(p).some((q) => q.id === end.pin)) problems.push(`wire ${w.id} → ${p.type} has no pin ${end.pin}`);
    }
  }
  const chk = CHECKS[ex.id] || { ms: 1500 };
  let serial = '';
  const warns = [], errors = [];
  const eng = new SimEngine({ code: ex.code, parts: ex.parts, wires: ex.wires, board: ex.board }, {
    onSerial: (port, t) => { serial += t; },
    onWarning: (m) => warns.push(typeof m === 'string' ? m : m.text || m.message || JSON.stringify(m)),
    onError: (e) => errors.push(typeof e === 'string' ? e : e.message || JSON.stringify(e)),
  });
  const r = eng.start();
  if (!r.ok) problems.push('start failed: ' + JSON.stringify(r.error));
  else {
    let wall = 1000;
    eng.tick(wall);
    const acts = Object.entries(chk.act || {}).map(([t, a]) => [+t, a]).sort((a, b) => a[0] - b[0]);
    for (let t = 0; t < chk.ms; t += 16) {
      while (acts.length && acts[0][0] <= t) {
        const [, [pid, key, val, extra]] = acts.shift();
        eng.input(pid, key, val, extra);
      }
      wall += 16;
      eng.tick(wall);
    }
    if (errors.length) problems.push('errors: ' + errors.join(' | '));
    for (const s of chk.serial || []) if (!serial.includes(s)) problems.push(`serial missing "${s}"`);
    if (chk.check) { const c = chk.check(eng, serial); if (c !== true) problems.push(String(c)); }
    const bad = warns.filter((w) => !(chk.allowWarn || []).some((a) => w.includes(a)));
    if (bad.length) problems.push('warnings: ' + [...new Set(bad)].join(' | '));
    eng.stop?.();
  }
  if (problems.length) failures++;
  console.log(`${problems.length ? '✗' : '✓'} ${ex.id.padEnd(22)} ${problems.join('; ')}`);
  if (problems.length || process.env.V) console.log('     serial: ' + JSON.stringify(serial.slice(0, 240)));
}
console.log(failures ? `\n${failures} example(s) failed` : '\nall examples ok');
process.exit(failures ? 1 : 0);
