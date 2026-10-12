// Behaviour of every IoT example of the gallery: the sketch runs on the virtual network while a "browser", an MQTT phone,
// the Telegram chat, the Blynk app … poke it, and the circuit (LED, LCD, OLED, servo, lamp …) must react.
//   node tests/iot-examples.mjs [id-filter]
import '../web/src/components/index.js';
import { EXAMPLES } from '../web/src/examples/index.js';
import { SimEngine } from '../web/src/sim/engine.js';
import { VirtualNet } from '../web/src/net/network.js';

const filter = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lcdRow = (eng, id, r) => { const d = eng.parts.get(id).visual.dev; return Array.from({ length: d.cols || 16 }, (_, c) => String.fromCharCode(d.charAt(c, r) ?? 32)).join('').trimEnd(); };
const lit = (eng, id) => eng.parts.get(id).visual.b > 0.2;

/** Runs example `id`; `plan` = [[ms, async (ctx) => …], …]; `ctx` = { eng, net, serial, get(url) → response, ip, got }. */
async function run(id, plan, { ms = 6000, net = new VirtualNet(), deviceId = 'esp' } = {}) {
  const ex = EXAMPLES.find((e) => e.id === id);
  let serial = '';
  const warns = [], errors = [];
  const eng = new SimEngine({ code: ex.code, parts: ex.parts, wires: ex.wires }, {
    net, onSerial: (p, t) => { serial += t; }, onWarning: (m) => warns.push(typeof m === 'string' ? m : m.text || m.message), onError: (e) => errors.push(e && e.message),
  });
  const r = eng.start();
  if (!r.ok) return { ok: false, error: r.error, serial, warns, errors };
  const dev = () => net.devices.get(deviceId);
  const ctx = {
    eng, net, ex, get serial() { return serial; }, got: {}, dev,
    get ip() { const d = dev(); return d && d.connected ? d.ip : ''; },
    req: (name, method, path, body, headers) => { net.request({ method, url: path.startsWith('http') ? path : `http://${ctx.ip}${path}`, body: body || '', headers: headers || {} }, null).then((res) => { ctx.got[name] = res; }); },
  };
  let wall = 1000;
  eng.tick(wall);
  const steps = plan.map(([t, fn]) => ({ t, fn, done: false })).sort((a, b) => a.t - b.t);
  for (let t = 0; t < ms; t += 16) {
    for (const s of steps) if (!s.done && t >= s.t) { s.done = true; await s.fn(ctx); }
    wall += 16;
    eng.tick(wall);
    if (t % 64 === 0) await sleep(0);
    if (errors.length) break;
  }
  await sleep(30);
  return { ok: true, ctx, get serial() { return serial; }, warns, errors, stop: () => eng.stop() };
}

const CHECKS = {
  'iot-hello': { ms: 7000, check: (r) => r.serial.includes('Connected!') && /IP address : 192\.168\.1\.\d+/.test(r.serial) && r.serial.includes('Public IP  : 103.4.145.20') && lit(r.ctx.eng, 'led') },
  'iot-web-led': {
    ms: 6500, plan: [[3500, (c) => c.req('home', 'GET', '/')], [3800, (c) => c.req('on', 'GET', '/on')], [4300, (c) => c.req('home2', 'GET', '/')]],
    check: (r) => r.ctx.got.home.body.includes('The LED is ') && r.ctx.got.home.body.includes('OFF') && r.ctx.got.on.status === 303 && r.ctx.got.on.headers.location === '/' && r.ctx.got.home2.body.includes('ON') && lit(r.ctx.eng, 'led'),
  },
  'iot-dht-web': {
    ms: 7000, plan: [[5000, (c) => c.req('api', 'GET', '/api')], [5100, (c) => c.req('home', 'GET', '/')]],
    check: (r) => { const j = JSON.parse(r.ctx.got.api.body); return j.temperature === 24 && j.humidity === 55 && r.ctx.got.home.body.includes('24.0'); },
  },
  'iot-rest-api': {
    ms: 6500, plan: [[3500, (c) => c.req('st', 'GET', '/api/status')], [3700, (c) => c.req('led', 'POST', '/api/led', '{"on":true}')], [3900, (c) => c.req('sv', 'GET', '/api/servo?angle=45')], [4100, (c) => c.req('bad', 'POST', '/api/led', 'nope')], [4300, (c) => c.req('home', 'GET', '/')]],
    check: (r) => { const g = r.ctx.got; return JSON.parse(g.st.body).led === false && JSON.parse(g.led.body).led === true && lit(r.ctx.eng, 'led') && JSON.parse(g.sv.body).servo === 45 && Math.abs(r.ctx.eng.parts.get('servo').visual.angle - 45) < 3 && g.bad.status === 400 && g.home.body.includes('ESP32 REST API'); },
  },
  'iot-access-point': {
    ms: 5000, plan: [[3000, (c) => c.req('p', 'GET', 'http://192.168.4.1/pwm?v=128')], [3200, (c) => c.req('home', 'GET', 'http://192.168.4.1/')]],
    check: (r) => r.serial.includes('Access point "RaptiAuto-ESP" is up') && r.serial.includes('192.168.4.1') && r.ctx.got.p.body === '128' && r.ctx.got.home.body.includes('LED dimmer') && Math.abs(r.ctx.eng.parts.get('led').visual.b - 0.5) < 0.25,
  },
  'iot-wifi-scanner': { ms: 6000, check: (r) => /\d+ networks found/.test(r.serial) && r.serial.includes('RaptiNet') && r.ctx.eng.parts.get('oled').visual.dev.fb.reduce((a, b) => a + b, 0) > 100 },
  'iot-bluetooth-led': {
    ms: 4000, plan: [[1500, (c) => c.net.btSend('esp', 'on')], [2200, (c) => c.net.btSend('esp', 'status')]],
    check: (r) => { const log = r.ctx.dev().bt.log.map((l) => l.text).join(''); return r.serial.includes('Command: on') && log.includes('LEDs ON') && /LED1=1 LED2=1/.test(log) && lit(r.ctx.eng, 'led'); },
  },
  'iot-esp8266-relay': {
    ms: 6000, plan: [[3500, (c) => c.req('t', 'GET', '/toggle')], [4200, (c) => c.req('s', 'GET', '/state')]],
    check: (r) => r.ctx.got.t.status === 303 && r.ctx.got.s.body === '1' && r.serial.includes('Lamp ON') && r.ctx.eng.parts.get('lamp').visual.b > 0.5,
  },
  'iot-r4-web': {
    ms: 12000, deviceId: 'uno', plan: [[9000, (c) => c.req('h', 'GET', '/heart')], [9500, (c) => c.req('l', 'GET', '/led/on')]],
    check: (r) => r.ctx.got.h && r.ctx.got.h.body.includes('Uno R4 WiFi') && r.ctx.eng.parts.get('uno').visual.matrix.filter(Boolean).length > 10 && r.ctx.got.l.status === 200,
  },
  'iot-mqtt-light': {
    ms: 9000,
    plan: [[5000, (c) => { c.phone = c.net.mqtt.connect('phone', 'broker.hivemq.com', 1883, {}, null).client; c.net.mqtt.subscribe(c.phone, 'rapti/home/light/state'); }],
      [6000, (c) => c.net.mqtt.publish(c.phone, 'rapti/home/light/set', 'ON')],
      [7000, (c) => { c.litOn = lit(c.eng, 'led'); c.net.mqtt.publish(c.phone, 'rapti/home/light/set', 'toggle'); }],
      [8000, (c) => { c.litOff = lit(c.eng, 'led'); }]],
    check: (r) => { const c = r.ctx; const states = []; let m; while ((m = c.net.mqtt.poll(c.phone))) states.push(m.payload); return c.litOn && !c.litOff && states.includes('ON') && states.includes('OFF') && r.serial.includes('Light ON'); },
  },
  'iot-mqtt-dht': {
    ms: 9000,
    plan: [[2000, (c) => { c.phone = c.net.mqtt.connect('phone', 'broker.hivemq.com', 1883, {}, null).client; c.net.mqtt.subscribe(c.phone, 'rapti/lab/#'); }]],
    check: (r) => { const c = r.ctx; const msgs = []; let m; while ((m = c.net.mqtt.poll(c.phone))) msgs.push(m.topic + '=' + m.payload); const data = msgs.find((x) => x.startsWith('rapti/lab/dht=')); return msgs.includes('rapti/lab/status=online') && data && JSON.parse(data.slice(14)).temperature === 24 && r.serial.includes('"humidity":55'); },
  },
  'iot-thingspeak': {
    ms: 9000,
    check: (r) => { const ch = [...r.ctx.net.cloud.thingspeak.values()][0]; return ch && ch.entries.length === 1 && +ch.entries[0].field1 === 24 && +ch.entries[0].field2 === 55 && r.serial.includes('Logged  T=24.0  H=55.0'); },
  },
  'iot-blynk': {
    ms: 11000,
    plan: [[8000, (c) => { const b = c.net.cloud.blynk.get('Rapti_Demo_Token_00000000000001'); b.pins.set('V1', '1'); b.dirty.add('V1'); }]],
    check: (r) => { const b = r.ctx.net.cloud.blynk.get('Rapti_Demo_Token_00000000000001'); return r.serial.includes('Connected to Blynk') && +b.pins.get('V2') === 24 && r.serial.includes('V1 = 1') && lit(r.ctx.eng, 'led'); },
  },
  'iot-telegram-pir': {
    ms: 12000,
    plan: [[5000, (c) => c.eng.input('pir', 'motion', true)], [6000, (c) => c.net.cloud.telegram.inbox.push({ update_id: 11, message: { message_id: 1, from: { id: 1, first_name: 'Me' }, chat: { id: 123456789 }, date: 1, text: '/status' } })]],
    check: (r) => { const t = r.ctx.net.notes.map((n) => n.text); return t.includes('Security alarm online') && t.includes('Motion detected!') && t.some((x) => /^Alarm is ARMED/.test(x)); },
  },
  'iot-ntp-clock': { ms: 8000, check: (r) => /^\w{3} \d\d\/\d\d\/20\d\d$/.test(lcdRow(r.ctx.eng, 'lcd', 0)) && /^ {4}\d\d:\d\d:\d\d$/.test(lcdRow(r.ctx.eng, 'lcd', 1)) },
  'iot-crypto-lcd': { ms: 6000, check: (r) => /^BTC \$\d+/.test(lcdRow(r.ctx.eng, 'lcd', 0)) && /^ETH \$\d+/.test(lcdRow(r.ctx.eng, 'lcd', 1)) && /BTC \d+/.test(r.serial) },
  'iot-ifttt-door': {
    ms: 9000, plan: [[300, (c) => c.eng.input('door', 'press', true)], [5000, (c) => c.eng.input('door', 'press', false)]],
    check: (r) => r.serial.includes('Door monitor ready (door is closed)') && r.serial.includes('DOOR OPENED') && r.ctx.net.notes.some((n) => /door_open/.test(n.title) && /Front/.test(n.text)) && r.serial.includes('IFTTT -> HTTP 200'),
  },
  'iot-gas-mqtt': {
    ms: 10000,
    plan: [[2500, (c) => { c.phone = c.net.mqtt.connect('phone', 'broker.hivemq.com', 1883, {}, null).client; c.net.mqtt.subscribe(c.phone, 'rapti/gas/#'); }], [5000, (c) => c.eng.input('gas', 'ppm', 9000)]],
    check: (r) => { const c = r.ctx; const got = []; let m; while ((m = c.net.mqtt.poll(c.phone))) got.push(m.topic + '=' + m.payload); return got.some((x) => x.startsWith('rapti/gas/level=')) && got.includes('rapti/gas/alert=GAS LEAK!') && r.serial.includes('GAS LEAK!'); },
  },
  'iot-soil-plant': {
    ms: 14000, plan: [[2000, (c) => c.eng.input('soil', 'moist', 5)], [9000, (c) => c.eng.input('soil', 'moist', 95)]],
    check: (r) => r.serial.includes('Soil is dry -> pump ON') && r.serial.includes('POST {"device":"plant-1"') && r.serial.includes('-> 200') && r.serial.includes('server saw: {') && r.serial.includes('Soil is wet -> pump OFF'),
  },
  'iot-parking-web': {
    ms: 6000, plan: [[4000, (c) => c.req('d', 'GET', '/distance')], [4100, (c) => c.req('p', 'GET', '/')]],
    check: (r) => { const j = JSON.parse(r.ctx.got.d.body); return typeof j.cm === 'number' && j.cm > 0 && r.ctx.got.p.body.includes('Parking assistant'); },
  },
  'iot-neopixel-web': {
    ms: 6500, plan: [[3500, (c) => c.req('c', 'GET', '/color?hex=ff0000')], [4200, (c) => { c.red = [...c.eng.parts.get('ring').visual.px]; c.req('m', 'GET', '/mode?m=rainbow'); }]],
    check: (r) => { const c = r.ctx; const px = c.eng.parts.get('ring').visual.px; return c.red.every((v) => ((v >> 16) & 255) > 20 && (v & 255) < 5) && new Set(px).size > 6 && /colour #ff0000/.test(c.got.c.body); },
  },
  'iot-two-boards-mqtt': { ms: 13000, deviceId: 'node', check: (r) => /^Temp: 24\.0 C$/.test(lcdRow(r.ctx.eng, 'lcd', 0)) && /^Hum : 55\.0 %$/.test(lcdRow(r.ctx.eng, 'lcd', 1)) },
  'iot-wifi-multi': { ms: 9000, check: (r) => /Connected to RAPTI-Lab\s+IP 192\.168\.1\.\d+/.test(r.serial) && lit(r.ctx.eng, 'led') },
  'iot-ip-location': { ms: 7000, check: (r) => r.serial.includes('Dhaka, Bangladesh  (Asia/Dhaka)') && /\d{4}-\d\d-\d\d \d\d:\d\d:\d\d/.test(r.serial) && r.ctx.eng.parts.get('oled').visual.dev.fb.reduce((a, b) => a + b, 0) > 200 },
  // live data (simulated offline): air quality, prayer times, rates, ISS, sun, forecast, temperature, quotes, quakes
  'iot-air-quality': { ms: 7000, check: (r) => { const m = /AQI (\d+) \(/.exec(r.serial); const aqi = m && +m[1]; const e = r.ctx.eng; return aqi > 0 && /^AQI \d+ \w/.test(lcdRow(e, 'lcd', 0)) && /^PM2\.5 \d+\.\d ug$/.test(lcdRow(e, 'lcd', 1)) && lit(e, 'ledG') === aqi <= 50 && lit(e, 'ledY') === (aqi > 50 && aqi <= 150) && lit(e, 'ledR') === aqi > 150; } },
  'iot-prayer-times': { ms: 8000, check: (r) => /Fajr +0\d:\d\d/.test(r.serial) && /Isha +\d\d:\d\d/.test(r.serial) && /Hijri: \d\d-\d\d-14\d\d/.test(r.serial) && /^(Fajr|Dhuhr|Asr|Maghrib|Isha) +\d\d:\d\d$/.test(lcdRow(r.ctx.eng, 'lcd', 0)) && /^in \d+h\d\dm  \d\d:\d\d$/.test(lcdRow(r.ctx.eng, 'lcd', 1)) },
  'iot-currency-oled': { ms: 7000, check: (r) => /1 USD = 1\d\d\.\d\d BDT/.test(r.serial) && /1 EUR = 1\d\d\.\d\d BDT/.test(r.serial) && /1 SAR = \d\d\.\d\d BDT/.test(r.serial) && r.ctx.eng.parts.get('oled').visual.dev.fb.reduce((a, b) => a + b, 0) > 300 },
  'iot-iss-tracker': { ms: 9000, check: (r) => { const m = /ISS at -?\d+\.\d\d, -?\d+\.\d\d  -  (\d+) km from home/.exec(r.serial); return m && lit(r.ctx.eng, 'led') === +m[1] < 2000 && r.ctx.eng.parts.get('oled').visual.dev.fb.reduce((a, b) => a + b, 0) > 300; } },
  'iot-sunset-light': { ms: 9000, check: (r) => { const m = /Sunrise (0\d:\d\d)  Sunset (1\d:\d\d)/.exec(r.serial); const on = /lamp ON/.test(r.serial); return m && (on || /lamp OFF/.test(r.serial)) && (r.ctx.eng.parts.get('lamp').visual.b > 0.5) === on; } },
  'iot-forecast-dial': { ms: 7000, check: (r) => { const m = /Tomorrow \d{4}-\d\d-\d\d: code (\d+), \d+-\d+ C, rain (\d+) %/.exec(r.serial); if (!m) return false; const code = +m[1], want = code <= 1 ? 0 : code <= 48 ? 90 : 180; return Math.abs(r.ctx.eng.parts.get('servo').visual.angle - want) < 4 && lit(r.ctx.eng, 'led') === +m[2] > 50; } },
  'iot-weather-neopixel': { ms: 7000, check: (r) => { const m = /Outside: (\d+\.\d) C/.exec(r.serial); if (!m) return false; const n = Math.max(1, Math.min(16, Math.floor(1 + (Math.floor(+m[1]) * 15) / 40))); return r.ctx.eng.parts.get('ring').visual.px.filter((v) => v).length === n; } },
  'iot-quote-lcd': { ms: 7000, check: (r) => /^".+"  - .+$/m.test(r.serial) && lcdRow(r.ctx.eng, 'lcd', 1).startsWith('- ') && lcdRow(r.ctx.eng, 'lcd', 0).trim().length > 0 },
  'iot-tm1637-temp': { ms: 7000, check: (r) => { const v = r.ctx.eng.parts.get('tm').visual; const s = v.segs || (v.dev && v.dev.segs) || []; return /Dhaka \+?-?\d+°C -> -?\d+/.test(r.serial) && s[2] === 0x63 && s[3] === 0x39; } },
  'iot-earthquake-alert': { ms: 8000, check: (r) => /M\d\.\d  .+  \(\d+ km\)/.test(r.serial) && r.ctx.eng.parts.get('oled').visual.dev.fb.reduce((a, b) => a + b, 0) > 300 },
};

/** Boot counter: the flash survives a restart, so the second run says "Boot #2". */
async function prefsCounter() {
  const first = await run('iot-prefs-counter', [], { ms: 3500 });
  first.stop();
  const second = await run('iot-prefs-counter', [[3000, (c) => c.req('home', 'GET', '/')], [3300, (c) => c.req('name', 'GET', '/name?n=Rapti')], [3800, (c) => c.req('home2', 'GET', '/')]], { ms: 5000 });
  const ok = first.serial.includes('Boot #1, owner = maker') && second.serial.includes('Boot #2, owner = maker') && second.ctx.got.home.body.includes('<b>2</b> time(s)') && second.ctx.got.home2.body.includes('Hello Rapti!');
  second.stop();
  return { ok, serial: first.serial + ' || ' + second.serial, ctx: second.ctx, warns: [], errors: [] };
}

let failures = 0;
for (const ex of EXAMPLES) {
  if (!ex.id.startsWith('iot-')) continue;
  if (filter && !ex.id.includes(filter)) continue;
  if (ex.id === 'iot-prefs-counter') {
    const r = await prefsCounter();
    if (!r.ok) failures++;
    console.log(`${r.ok ? '✓' : '✗'} ${ex.id.padEnd(22)} ${r.ok ? '' : 'check failed'}`);
    if (!r.ok) console.log('     serial: ' + JSON.stringify(r.serial.slice(0, 300)));
    continue;
  }
  const c = CHECKS[ex.id];
  if (!c) { failures++; console.log(`✗ ${ex.id}: no behaviour check`); continue; }
  const r = await run(ex.id, c.plan || [], { ms: c.ms, deviceId: c.deviceId || 'esp' });
  let msg = '';
  if (!r.ok) msg = 'start failed: ' + JSON.stringify(r.error);
  else if (r.errors.length) msg = 'runtime error: ' + r.errors.join(' | ');
  else if (r.warns.length) msg = 'warnings: ' + [...new Set(r.warns)].join(' | ');
  else {
    try { if (!c.check(r)) msg = 'check failed'; } catch (e) { msg = 'check threw: ' + e.message; }
  }
  if (r.stop) r.stop();
  if (msg) failures++;
  console.log(`${msg ? '✗' : '✓'} ${ex.id.padEnd(22)} ${msg}`);
  if (msg || process.env.V) {
    console.log('     serial: ' + JSON.stringify((r.serial || '').slice(0, 400)));
    if (r.ctx) console.log('     got: ' + JSON.stringify(Object.fromEntries(Object.entries(r.ctx.got).map(([k, v]) => [k, `${v.status} ${String(v.body || v.error).slice(0, 80)}`]))));
  }
}
console.log(failures ? `\n${failures} IoT example(s) failed` : '\nall IoT examples behave');
process.exit(failures ? 1 : 0);
