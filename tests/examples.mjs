// Run every gallery example headless: node tests/examples.mjs [id-filter]
// Fails on compile/runtime errors, unexpected warnings, wires to missing pins, or a failed per-example check.
import { EXAMPLES } from '../web/src/examples/index.js';
import { SimEngine } from '../web/src/sim/engine.js';
import { pinsOf, getDef } from '../web/src/components/registry.js';

const filter = process.argv[2];

const part = (eng, id) => eng.parts.get(id);
const lcdRow = (eng, id, r) => { const d = part(eng, id).visual.dev; return Array.from({ length: d.cols || 16 }, (_, c) => String.fromCharCode(d.charAt(c, r) ?? 32)).join('').trimEnd(); };
const lit = (eng, id) => part(eng, id).visual.b > 0.2;
const expect = (cond, msg) => (cond ? true : msg);

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
  'lcd-i2c-hello': { ms: 1500, check: (e) => expect(lcdRow(e, 'lcd', 0) === 'Hello RaptiAuto!' && lcdRow(e, 'lcd', 1).startsWith('Uptime: 00:0'), `lcd="${lcdRow(e, 'lcd', 0)}|${lcdRow(e, 'lcd', 1)}"`) },
  'lcd-parallel': { ms: 1500, check: (e) => expect(lcdRow(e, 'lcd', 0) === 'I \x00 Arduino \x01' && lcdRow(e, 'lcd', 1).startsWith('Count: '), `lcd=${JSON.stringify(lcdRow(e, 'lcd', 0))}`) },
  'oled-graphics': { ms: 3000, check: (e) => { const n = part(e, 'oled').visual.dev.fb.reduce((a, b) => a + b, 0); return expect(n > 300, 'oled px=' + n); } },
  'tm1637-counter': { ms: 2300, check: (e) => { const s = part(e, 'tm').visual.dev.segs; return expect(s[0] === 0x3f && s[3] === 0x5b, 'segs=' + s.slice(0, 4).map((x) => x.toString(16))); } },
  'max7219-matrix': { ms: 500, check: (e) => { const r = part(e, 'mx').visual.devs[0].rows; return expect(r[1] === 0x66 && r[7] === 0x18, 'rows=' + Array.from(r)); } },
  'seven-segment': { ms: 2500 },
  'neopixel-ring': { ms: 1500, check: (e) => { const px = part(e, 'ring').visual.px; return expect(new Set(px).size > 8 && px.every((c) => c > 0), 'px=' + px.slice(0, 4)); } },
  'r4-matrix': { ms: 500, check: (e) => { const m = part(e, 'uno').visual.matrix; const n = m.filter(Boolean).length; return expect(n === 18, 'matrix on=' + n); } },
  'weather-station': { ms: 4500, check: (e) => expect(lcdRow(e, 'lcd', 0).startsWith('24.0') && lcdRow(e, 'lcd', 1) === 'Comfortable :)', `lcd=${JSON.stringify(lcdRow(e, 'lcd', 0) + '|' + lcdRow(e, 'lcd', 1))}`) },
  'keypad-lock': { ms: 2500, act: keys('kp', '1234#', 300), serial: ['Access granted'] },
  'servo-sweep': { ms: 1500, check: (e) => expect(part(e, 'servo').visual.angle > 120, 'angle=' + part(e, 'servo').visual.angle) },
  'servo-knob': { ms: 1500, act: { 200: ['pot', 'knob', 0.25] }, check: (e) => expect(Math.abs(part(e, 'servo').visual.angle - 45) < 4, 'angle=' + part(e, 'servo').visual.angle) },
  'stepper-28byj': { ms: 1500, check: (e) => expect(Math.abs(part(e, 'stepper').visual.angle - 90) < 2, 'angle=' + part(e, 'stepper').visual.angle) },
  'stepper-a4988': { ms: 3000, check: (e) => expect(part(e, 'stepper').visual.angle !== 0, 'angle=0') },
  'relay-lamp': { ms: 1000, serial: ['Lamp ON'], check: (e) => expect(part(e, 'lamp').visual.b > 0.9, 'lamp b=' + part(e, 'lamp').visual.b) },
  'l298n-motor': { ms: 1500, check: (e) => expect(part(e, 'motor').visual.rpm > 1000, 'rpm=' + part(e, 'motor').visual.rpm) },
  'transistor-motor': { ms: 2000 },
  'shift-register': { ms: 2000, serial: ['Value: 1100'] },
  'buzzer-melody': { ms: 3000 },
  'ir-remote': { ms: 2000, act: { 600: ['ir', 'ir', 0x0c] }, serial: ['Button'] },
  'rotary-encoder': { ms: 1500, act: { 300: ['enc', 'rotate', 1], 500: ['enc', 'rotate', 1], 700: ['enc', 'rotate', -1] }, serial: ['Position: 2', 'Position: 1'] },
  'py-blink': { ms: 1800, serial: ['LED on', 'LED off', 'LED on'] },
  'py-pico-blink': { ms: 1500, serial: ['blink 1', 'blink 2', 'blink 3'] },
  'py-button-led': { ms: 1500, act: { 400: ['btn', 'press', true], 600: ['btn', 'press', false], 900: ['btn', 'press', true], 1100: ['btn', 'press', false] }, serial: ['LED ON', 'LED OFF'], check: (e) => expect(!lit(e, 'led'), 'led should be off after the second press') },
  'py-pwm-fade': { ms: 1500, check: (e) => expect(part(e, 'led').visual.b > 0.01, 'led b=' + part(e, 'led').visual.b) },
  'py-adc-pot': { ms: 2000, act: { 600: ['pot', 'knob', 1] }, serial: ['raw=', ' V ', 'raw=4095'] },
  'py-dht22': { ms: 2600, serial: ['Temp: 24.0 C  Humidity: 55.0 %'] },
  'py-oled': { ms: 1500, serial: ['I2C devices: [\'0x3c\']'], check: (e) => { const n = part(e, 'oled').visual.dev.fb.reduce((a, b) => a + b, 0); return expect(n > 150, 'oled px=' + n); } },
  'py-neopixel': { ms: 1000, check: (e) => { const px = part(e, 'ring').visual.px; return expect(new Set(px).size > 8, 'px=' + px.slice(0, 4)); } },
  'py-servo': { ms: 2500, check: (e) => expect(part(e, 'servo').visual.angle > 30, 'angle=' + part(e, 'servo').visual.angle) },
  'py-timer-irq': { ms: 1600, act: { 300: ['btn', 'press', true], 450: ['btn', 'press', false], 900: ['btn', 'press', true], 1050: ['btn', 'press', false] }, serial: ['Button pressed 1 times', 'Button pressed 2 times'] },
  'scope-pwm': { ms: 1200, check: (e) => { const m = part(e, 'scope').measure(0); const m2 = part(e, 'scope').measure(2); return expect(Math.abs(m.freq - 988) < 80 && Math.abs(m2.freq - 440) < 40, `ch1 ${m.freq} ch3 ${m2.freq}`); } },
  'logic-bitbang': { ms: 500, check: (e) => { const l = part(e, 'la'); l.input('tdiv', 9); const m = l.measure(1); return expect(m.edges >= 1 && m.vpp > 4, `clock edges=${m.edges} vpp=${m.vpp}`); } },
  'fg-adc': { ms: 1500, serial: ['V:'] },
  'regulator-5v': { ms: 600, check: (e) => expect(Math.abs(part(e, 'vm').visual.v - 5) < 0.1 && lit(e, 'led'), `vout=${part(e, 'vm').visual.v}`) },
  'bmp280-weather': { ms: 1500, act: { 800: ['bmp', 'press', 1000] }, serial: ['T = 24.0 C', 'P = 1013.0 hPa', 'P = 1000.0 hPa'] },
  'acs712-current': { ms: 1500, serial: ['Current = 0.4', 'Sensor = 2.5'] },
  'dip-switch-binary': { ms: 1200, act: { 300: ['dip', 's1', true], 400: ['dip', 's3', true] }, serial: ['Value: 0  binary 0000', 'Value: 1  binary 0001', 'Value: 5  binary 0101'] },
  'optocoupler-isolation': { ms: 2200, serial: ['LED on  -> D3 = LOW', 'LED off -> D3 = HIGH'] },
  'tb6612-motors': { ms: 2500, serial: ['full speed forward'], check: (e) => expect(Math.abs(part(e, 'm1').visual.rpm) > 200 && Math.abs(part(e, 'm2').visual.rpm) > 200, `rpm=${part(e, 'm1').visual.rpm}/${part(e, 'm2').visual.rpm}`) },
  'robot-car-drive': { ms: 4500, serial: ['side 1', 'side 2'], check: (e) => { const c = part(e, 'car').car; return expect(Math.abs(c.x - 75) + Math.abs(c.y - 50) > 3 || c.a !== 0, `car=${c.x},${c.y},${c.a}`); } },
  'bluetooth-led': { ms: 1500, act: { 200: ['bt', 'connect', true], 500: ['bt', 'send', 'ON\n'], 900: ['bt', 'send', 'off\n'] }, serial: ['Command: ON', 'Command: OFF'], check: (e) => expect(part(e, 'bt').log.some((m) => /LED is ON/.test(m.text)) && !lit(e, 'led'), 'log=' + JSON.stringify(part(e, 'bt').log)) },
  'gps-tracker': { ms: 9000, serial: ['No fix yet', 'Lat 23.81030  Lon 90.41250  Speed 0.0 km/h'] },
  'solenoid-pulse': { ms: 2200, serial: ['PUSH', 'release'] },
  'py-bluetooth': { ms: 1500, act: { 200: ['bt', 'connect', true], 500: ['bt', 'send', 'on\n'] }, serial: ['Command: ON'], check: (e) => expect(lit(e, 'led') && part(e, 'bt').log.some((m) => /LED is ON/.test(m.text)), 'bt log=' + JSON.stringify(part(e, 'bt').log)) },
  'py-gps': { ms: 9500, serial: ['No fix yet', 'Lat 23.81030  Lon 90.41250  0.0 km/h'] },
  'rtc-clock': { ms: 2500, check: (e) => expect(/^\w{3} \d\d\/\d\d\/20\d\d$/.test(lcdRow(e, 'lcd', 0)) && /^ {4}\d\d:\d\d:\d\d$/.test(lcdRow(e, 'lcd', 1)), `lcd=${JSON.stringify(lcdRow(e, 'lcd', 0) + '|' + lcdRow(e, 'lcd', 1))}`) },
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
  const eng = new SimEngine({ code: ex.code, parts: ex.parts, wires: ex.wires, board: ex.board, lang: ex.lang }, {
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
