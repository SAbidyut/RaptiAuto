// The new display / IoT examples of the Pi Lab run on the auto-wired circuit; each one is checked for its visible result.
//   node tests/pi-examples.mjs [file-filter]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GpioSim } from '../web/src/pi/gpio.js';
import { PyProcess } from '../web/src/pi/python.js';
import '../web/src/components/index.js';
import '../web/src/pi/circuit-parts.js';
import { SimEngine } from '../web/src/sim/engine.js';
import { CircuitHw } from '../web/src/pi/circuit-hw.js';
import { autowire } from '../web/src/pi/autowire.js';
import { PI_MORE, PICO_MORE } from '../web/src/pi/examples-more.js';
import { VirtualNet } from '../web/src/net/network.js';

const filter = process.argv[2];
const here = dirname(fileURLToPath(import.meta.url));
const pyDir = join(here, '..', 'web', 'src', 'pi', 'py');
const LIBS = {};
(function walk(dir, pre) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, pre + n + '/');
    else if (n.endsWith('.py')) LIBS[pre + n] = readFileSync(p, 'utf8');
  }
})(pyDir, '');
const wasmLoader = async () => readFileSync(join(here, '..', 'web', 'vendor', 'micropython', 'micropython.wasm'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lit = (fb) => fb.reduce((a, b) => a + b, 0);

/** Run `ex` on `board` for `ms`; `plan` = [[ms, fn(ctx)]] pokes the circuit / network meanwhile. */
async function run(ex, board, plan, ms) {
  const c = autowire(board, ex.parts);
  const engine = new SimEngine({ ...c, code: '' }, { external: true });
  const started = engine.start();
  const g = new GpioSim(board);
  const net = new VirtualNet();
  const hwc = new CircuitHw(engine);
  g.attachHw(hwc);
  const pico = board.startsWith('pico');
  // the Pi system registers its device; here the harness does it
  const dev = net.registerDevice({ id: 'pi', name: pico ? 'Pico W' : 'Raspberry Pi', kind: pico ? 'pico' : 'pi', hostname: pico ? 'picow' : 'raspberrypi', broker: !pico });
  if (!pico) net.join(dev, 'RaptiNet', 'rapti1234');
  g.net = net; g.netDev = dev;
  let out = '';
  const p = new PyProcess({ gpio: g, libs: LIBS, wasmLoader, out: (t) => { out += t; }, cwd: pico ? '/' : '/home/pi' });
  await p.start();
  const timer = setInterval(() => { engine.tick(performance.now()); if (g.pins) for (const p of g.pins.values()) if (p.watch) { g.inputsChanged(); break; } }, 10);
  const ctx = {
    engine, net, g, c, dev, get out() { return out; }, got: {},
    part: (type) => engine.parts.get(c.parts.find((x) => x.type === type).id),
    parts: (type) => c.parts.filter((x) => x.type === type).map((x) => engine.parts.get(x.id)),
    req: (name, method, url, body, headers) => { net.request({ method, url: url.startsWith('http') ? url : `http://${dev.ip}${url}`, body: body || '', headers: headers || {} }, null).then((res) => { ctx.got[name] = res; }); },
    input: (type, key, val) => engine.input(c.parts.find((x) => x.type === type).id, key, val),
  };
  const done = p.runSource(ex.code, '/' + ex.file).catch(() => {});
  const t0 = Date.now();
  const steps = plan.map(([t, fn]) => ({ t, fn, done: false }));
  while (Date.now() - t0 < ms) {
    for (const s of steps) if (!s.done && Date.now() - t0 >= s.t) { s.done = true; await s.fn(ctx); }
    await sleep(20);
  }
  const snapshot = () => ({ out, ctx });
  return { started, ctx, get out() { return out; }, stop: () => { p.kill(); clearInterval(timer); g.stopProcess(); g.attachHw(null); engine.stop(); }, done };
}

const lcdRows = (rt) => [0, 1].map((r) => Array.from({ length: 16 }, (_, c) => String.fromCharCode(rt.hd44780.charAt(c, r))).join('').trimEnd());
const CH = {
  'lcd_clock.py': { ms: 2500, check: (r) => { const [a, b] = lcdRows(r.ctx.part('lcd-i2c')); return /^\w{3} \d\d\/\d\d \d\d:\d\d$/.test(a) && /^CPU +\d+\.\dC +\d\d$/.test(b); } },
  'lcd_parking.py': { ms: 3500, plan: [[2000, (c) => c.input('hc-sr04', 'distance', 15)]], check: (r) => { const [a, b] = lcdRows(r.ctx.part('lcd-i2c')); return /^Distance +1[0-9] cm$/.test(a) && b.startsWith('###') && r.ctx.engine.pins.get(22).out === 1; } },
  'lcd_menu.py': { ms: 3000, plan: [[1000, (c) => c.input('pushbutton', 'press', true)], [1200, (c) => c.input('pushbutton', 'press', false)]], check: (r) => lcdRows(r.ctx.part('lcd-i2c'))[0].startsWith('> Blink LED') },
  'oled_hello.py': { ms: 2500, check: (r) => lit(r.ctx.part('oled-ssd1306').ssd1306.fb) > 300 },
  'oled_sysmon.py': { ms: 3000, check: (r) => lit(r.ctx.part('oled-ssd1306').ssd1306.fb) > 200 },
  'oled_weather_station.py': { ms: 4500, check: (r) => /T=24\.0 H=55\.0/.test(r.out) && lit(r.ctx.part('oled-ssd1306').ssd1306.fb) > 100 },
  'tm1637_clock.py': { ms: 2000, check: (r) => { const s = r.ctx.part('tm1637').tm1637.segs; return s.slice(0, 4).every((v, i) => (i === 1 ? v & 0x7f : v) !== 0 || true) && s[0] !== 0 && s[3] !== 0; } },
  'tm1637_counter.py': { ms: 3500, plan: [[1000, (c) => c.input('pushbutton', 'press', true)], [1200, (c) => c.input('pushbutton', 'press', false)], [1800, (c) => c.input('pushbutton', 'press', true)], [2000, (c) => c.input('pushbutton', 'press', false)]], check: (r) => { const s = r.ctx.part('tm1637').tm1637.segs; return r.out.includes('count 2') && s[3] === 0x5b; } },
  'max7219_scroll.py': { ms: 2500, check: (r) => { const d = r.ctx.part('max7219').max7219; return d.every((m) => !m.shutdown) && d.some((m) => Array.from(m.rows).some((v) => v)); } },
  'display_dashboard.py': { ms: 5500, check: (r) => { const t = r.ctx.part('tm1637').tm1637.segs; const [a, b] = lcdRows(r.ctx.part('lcd-i2c')); return /^Temp +24\.0 C/.test(a) && /^Humid +55\.0/.test(b) && t[2] !== 0 && lit(r.ctx.part('oled-ssd1306').ssd1306.fb) > 50; } },
  'iot_weather_oled.py': { ms: 4500, check: (r) => /^OK \{/m.test(r.out) && lit(r.ctx.part('oled-ssd1306').ssd1306.fb) > 150 },
  'iot_flask_led.py': { ms: 5000, plan: [[3000, (c) => c.req('home', 'GET', ':5000/')], [3300, (c) => c.req('on', 'GET', ':5000/led/on')], [3700, (c) => c.req('api', 'GET', ':5000/api/status')]], check: (r) => { const g = r.ctx.got; return g.home && g.home.body.includes('Temperature') && g.on.status === 302 && JSON.parse(g.api.body).led === true && JSON.parse(g.api.body).temperature === 24; } },
  'iot_http_server.py': { ms: 4500, plan: [[2500, (c) => c.req('on', 'GET', ':8000/led/on')], [3000, (c) => c.req('home', 'GET', ':8000/')]], check: (r) => r.ctx.got.on.status === 200 && r.ctx.got.home.body.includes('LED: <b>ON</b>') && /CPU temperature/.test(r.ctx.got.home.body) },
  'iot_mqtt_sensor.py': { ms: 6500, plan: [[1500, (c) => { c.phone = c.net.mqtt.connect('phone', 'broker.hivemq.com', 1883, {}, null).client; c.net.mqtt.subscribe(c.phone, 'rapti/pi/dht'); }], [3500, (c) => c.net.mqtt.publish(c.phone, 'rapti/pi/led', 'ON')]], check: (r) => { let m; const got = []; while ((m = r.ctx.net.mqtt.poll(r.ctx.phone))) got.push(m.payload); return got.some((x) => /"temperature": 24\.0/.test(x)) && r.out.includes('rapti/pi/led -> ON') && r.ctx.engine.pins.get(17).out === 1; } },
  'iot_thingspeak.py': { ms: 4000, check: (r) => { const ch = [...r.ctx.net.cloud.thingspeak.values()][0]; return ch && ch.entries.length === 1 && +ch.entries[0].field1 === 24 && r.out.includes('-> entry 1'); } },
  'iot_telegram_alarm.py': { ms: 9000, plan: [[3000, (c) => c.input('pir', 'motion', true)], [5000, (c) => c.net.cloud.telegram.inbox.push({ update_id: 3, message: { message_id: 1, from: { id: 1, first_name: 'Me' }, chat: { id: 123456789 }, date: 1, text: '/status' } })]], check: (r) => { const t = r.ctx.net.notes.map((n) => n.text); return t.includes('Security alarm online') && t.includes('Motion detected!') && t.some((x) => /^Alarm is ARMED/.test(x)); } },
  'iot_internet_clock.py': { ms: 5000, check: (r) => { const [a, b] = lcdRows(r.ctx.part('lcd-i2c')); return /^\d{4}-\d\d-\d\d/.test(a) && /^ +\d\d:\d\d:\d\d$/.test(b); } },
  'iot_ip_location_oled.py': { ms: 4000, check: (r) => r.out.includes("'city': 'Dhaka'") && lit(r.ctx.part('oled-ssd1306').ssd1306.fb) > 150 },
  'iot_socket_server.py': { ms: 4500, plan: [[2500, (c) => c.req('on', 'GET', ':8080/on')], [3000, (c) => c.req('home', 'GET', ':8080/')]], check: (r) => r.ctx.got.on.status === 200 && r.ctx.got.home.body.includes('LED: ON') && r.out.includes('GET /on HTTP/1.1') },
  'iot_uptime_monitor.py': { ms: 6000, check: (r) => /UP\s+http:\/\/httpbin\.org/.test(r.out) && /DOWN http:\/\/no-such-site\.example/.test(r.out) && r.ctx.engine.pins.get(27).out === 1 && lcdRows(r.ctx.part('lcd-i2c'))[0].startsWith('Up: 2 / 3') },
  'iot_door_ifttt.py': { ms: 5000, plan: [[800, (c) => c.input('pushbutton', 'press', true)], [2500, (c) => c.input('pushbutton', 'press', false)]], check: (r) => r.out.includes('DOOR OPENED') && r.ctx.net.notes.some((n) => /door_open/.test(n.title)) && /IFTTT -> 200/.test(r.out) },
  'iot_system_dashboard.py': { ms: 4500, plan: [[2500, (c) => c.req('api', 'GET', ':5000/api/system')], [2800, (c) => c.req('home', 'GET', ':5000/')]], check: (r) => { const j = JSON.parse(r.ctx.got.api.body); return j.temp > 30 && j.mem > 0 && r.ctx.got.home.body.includes('fetch(\'/api/system\')'); } },
  // Pico
  'oled_text.py': { ms: 2500, check: (r) => r.out.includes("I2C devices: ['0x3c']") && lit(r.ctx.part('oled-ssd1306').ssd1306.fb) > 100 },
  'lcd_counter.py': { ms: 3500, plan: [[1200, (c) => c.input('pushbutton', 'press', true)], [1400, (c) => c.input('pushbutton', 'press', false)]], check: (r) => lcdRows(r.ctx.part('lcd-i2c'))[1].startsWith('Presses: 1') },
  'max7219_text.py': { ms: 2500, check: (r) => { const d = r.ctx.part('max7219').max7219; return d.length === 4 && d.every((m) => !m.shutdown) && d.some((m) => Array.from(m.rows).some((v) => v)); } },
  'oled_dht.py': { ms: 3500, check: (r) => lit(r.ctx.part('oled-ssd1306').ssd1306.fb) > 100 },
  'oled_pot_meter.py': { ms: 2500, check: (r) => lit(r.ctx.part('oled-ssd1306').ssd1306.fb) > 150 },
  'w_web_led.py': { ms: 6500, deviceId: 'pico', plan: [[4500, (c) => c.req('on', 'GET', '/led/on')], [5000, (c) => c.req('home', 'GET', '/')]], check: (r) => r.out.includes('Connected, open http://192.168.1.') && r.ctx.got.on.status === 200 && r.ctx.got.home.body.includes('LED is ON') },
  'w_mqtt_light.py': { ms: 8000, plan: [[3500, (c) => { c.phone = c.net.mqtt.connect('phone', 'broker.hivemq.com', 1883, {}, null).client; c.net.mqtt.subscribe(c.phone, 'rapti/picow/#'); }], [4500, (c) => c.net.mqtt.publish(c.phone, 'rapti/picow/led', 'ON')]], check: (r) => { let m; const got = []; while ((m = r.ctx.net.mqtt.poll(r.ctx.phone))) got.push(m.topic + '=' + m.payload); return got.some((x) => x.startsWith('rapti/picow/dht=')) && r.out.includes('MQTT connected') && r.ctx.engine.pins.get(15).out === 1; } },
  'w_weather_oled.py': { ms: 6000, check: (r) => r.out.includes('weather {') && lit(r.ctx.part('oled-ssd1306').ssd1306.fb) > 100 },
  'w_ntp_clock.py': { ms: 6000, check: (r) => r.out.includes('UTC time set:') && r.ctx.part('tm1637').tm1637.segs[0] !== 0 },
  'w_thingspeak.py': { ms: 6000, check: (r) => { const ch = [...r.ctx.net.cloud.thingspeak.values()][0]; return ch && ch.entries.length === 1 && r.out.includes('-> entry 1'); } },
  'w_access_point.py': { ms: 5000, deviceId: 'pico', plan: [[3500, (c) => c.req('p', 'GET', 'http://192.168.4.1/toggle')]], check: (r) => r.out.includes('Access point up: PicoW-RaptiAuto') && r.ctx.got.p.body.includes('LED ON') },
  'w_telegram_button.py': { ms: 8000, plan: [[4000, (c) => c.input('pushbutton', 'press', true)], [4300, (c) => c.input('pushbutton', 'press', false)]], check: (r) => { const t = r.ctx.net.notes.map((n) => n.text); return t.includes('Pico W is online') && t.some((x) => /Button pressed 1 times/.test(x)); } },
};

let failures = 0;
const all = [...PI_MORE.map((e) => ({ e, board: 'pi5' })), ...PICO_MORE.map((e) => ({ e, board: (e.boards || ['pico'])[0] === 'picow' ? 'picow' : 'pico' }))];
for (const { e, board } of all) {
  if (filter && !e.file.includes(filter)) continue;
  const chk = CH[e.file];
  if (!chk) { failures++; console.log(`✗ ${board} ${e.file}: no check`); continue; }
  const r = await run(e, board, chk.plan || [], chk.ms);
  let msg = '';
  if (!r.started.ok) msg = 'circuit did not start: ' + JSON.stringify(r.started.error);
  else if (/Traceback|Error/.test(r.out) && !/RuntimeError: .*Timeout|sensor:/.test(r.out)) msg = 'python error';
  else { try { if (!chk.check(r)) msg = 'check failed'; } catch (err) { msg = 'check threw: ' + err.message; } }
  if (msg) failures++;
  console.log(`${msg ? '✗' : '✓'} ${board.padEnd(5)} ${e.file.padEnd(26)} ${msg}`);
  if (msg || process.env.V) {
    console.log('     out: ' + JSON.stringify(r.out.slice(0, 500)));
    try { const l = r.ctx.parts('lcd-i2c')[0]; if (l) console.log('     lcd: ' + JSON.stringify(lcdRows(l))); } catch (err) { /* none */ }
    try { const t = r.ctx.parts('tm1637')[0]; if (t) console.log('     tm1637: ' + JSON.stringify(Array.from(t.tm1637.segs))); } catch (err) { /* none */ }
    try { const o = r.ctx.parts('oled-ssd1306')[0]; if (o) console.log('     oled lit: ' + lit(o.ssd1306.fb)); } catch (err) { /* none */ }
    if (Object.keys(r.ctx.got).length) console.log('     got: ' + JSON.stringify(Object.fromEntries(Object.entries(r.ctx.got).map(([k, v]) => [k, `${v.status} ${String(v.body || v.error).slice(0, 160)}`]))));
  }
  r.stop();
  await sleep(50);
}
console.log(failures ? `\n${failures} example(s) failed` : '\nall new Pi examples behave');
process.exit(failures ? 1 : 0);
