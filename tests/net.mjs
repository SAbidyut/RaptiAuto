// The virtual network: Wi-Fi router / DNS / simulated internet / MQTT / device web servers, and the
// Python libraries on top of it (requests, socket, http.server, flask, paho, umqtt, network).
//   node tests/net.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GpioSim } from '../web/src/pi/gpio.js';
import { PyProcess } from '../web/src/pi/python.js';
import { VirtualNet, WL } from '../web/src/net/network.js';

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

let failed = 0, passed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log('  ok  ' + name); }
  else { failed++; console.log('  FAIL ' + name + (extra ? '\n       ' + String(extra).replace(/\n/g, '\n       ') : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('Virtual network (JS)');
{
  const net = new VirtualNet();
  const esp = net.registerDevice({ id: 'e', name: 'ESP32', kind: 'esp32', hostname: 'esp32-lab' });
  const pi = net.registerDevice({ id: 'pi', name: 'Raspberry Pi', kind: 'pi', hostname: 'raspberrypi', broker: true });
  check('device is offline until it joins', !net.online(esp) && !esp.ip);
  let r = net.join(esp, 'RaptiNet', 'wrong-pass');
  check('wrong password fails', r.status === WL.CONNECT_FAILED, JSON.stringify(r));
  r = net.join(esp, 'RaptiNet', 'rapti1234');
  check('joining gives an IP', r.status === WL.CONNECTED && /^192\.168\.1\.\d+$/.test(r.ip), JSON.stringify(r));
  net.join(pi, 'RaptiNet', 'rapti1234');
  check('devices get different IPs', esp.ip !== pi.ip);
  check('mDNS name resolves', net.resolve('esp32-lab.local', pi) === esp.ip);

  let res = await net.request({ method: 'GET', url: 'http://wttr.in/Dhaka?format=3' }, esp);
  check('internet service answers', res.status === 200 && /Dhaka/.test(res.body), res.body);
  res = await net.request({ method: 'GET', url: 'http://api.open-meteo.com/v1/forecast?latitude=23.8&longitude=90.4&current_weather=true' }, esp);
  const j = JSON.parse(res.body);
  check('open-meteo gives current_weather', j.current_weather && typeof j.current_weather.temperature === 'number', res.body);
  res = await net.request({ method: 'GET', url: 'http://no-such-site.example/' }, esp);
  check('unknown host → name not resolved', res.failed && res.error === 'ERR_NAME_NOT_RESOLVED', JSON.stringify(res));
  res = await net.request({ method: 'GET', url: `http://${pi.ip}:5000/` }, esp);
  check('no server → connection refused', res.failed && res.error === 'ERR_CONNECTION_REFUSED', JSON.stringify(res));

  // a device web server
  const srv = net.listen(pi, 5000);
  const p = net.request({ method: 'GET', url: `http://${pi.ip}:5000/hello?x=1` }, esp);
  check('request waits in the server queue', srv.pending.length === 1 && srv.pending[0].req.path === '/hello?x=1');
  srv.pending.shift().respond({ status: 200, headers: { 'content-type': 'text/plain' }, body: 'hi' });
  res = await p;
  check('server answer reaches the client', res.status === 200 && res.body === 'hi');

  // router off / internet off
  net.setInternet(false);
  res = await net.request({ method: 'GET', url: 'http://wttr.in/Dhaka' }, esp);
  check('internet switched off', res.failed && /INTERNET/.test(res.error), JSON.stringify(res));
  net.setInternet(true);
  net.setRouter(false);
  check('router off → everyone offline', !net.online(esp) && !net.online(pi));
  check('router off → no networks in range', net.scan().length === 0);
  net.setRouter(true);

  // ThingSpeak
  res = await net.request({ method: 'GET', url: 'http://api.thingspeak.com/update?api_key=ABC123&field1=23.5&field2=60' }, esp);
  check('ThingSpeak update returns an entry id', res.status === 200 && /^\d+$/.test(res.body.trim()) && res.body.trim() !== '0', res.body);
  const tsChan = [...net.cloud.thingspeak.values()][0];
  res = await net.request({ method: 'GET', url: `http://api.thingspeak.com/channels/${tsChan.id}/feeds.json?results=1` }, esp);
  check('ThingSpeak feeds readable', res.status === 200 && JSON.parse(res.body).feeds.length === 1, res.body.slice(0, 120));

  // MQTT
  const a = net.mqtt.connect('a', 'broker.hivemq.com', 1883, {}, esp).client;
  const b = net.mqtt.connect('b', 'broker.hivemq.com', 1883, {}, pi).client;
  net.mqtt.subscribe(b, 'rapti/+/temp');
  net.mqtt.publish(a, 'rapti/lab/temp', '24.5');
  const m = net.mqtt.poll(b);
  check('MQTT wildcard subscribe delivers', m && m.topic === 'rapti/lab/temp' && m.payload === '24.5', JSON.stringify(m));
  net.mqtt.publish(a, 'rapti/lab/hum', '60');
  check('non-matching topic is not delivered', net.mqtt.poll(b) === null);
  const bad = net.mqtt.connect('c', 'localhost', 1883, {}, esp);
  check('ESP32 has no local broker (refused)', !bad.ok);
  const loc = net.mqtt.connect('d', 'localhost', 1883, {}, pi);
  check('Pi runs a local Mosquitto', loc.ok);
}

// ---------------------------------------------------------------- Python on the network
let live = null;
async function run(src, { net, dev, gpio, wait = 0, name = '<stdin>' } = {}) {
  if (live) live.kill();
  gpio = gpio || new GpioSim('pi5');
  gpio.net = net; gpio.netDev = dev;
  let text = '';
  const p = new PyProcess({ gpio, libs: LIBS, wasmLoader, out: (t) => { text += t; }, cwd: '/home/pi' });
  live = p;
  await p.start();
  const done = p.runSource(src, name).catch(() => {});
  return { p, done, get text() { return text; }, gpio };
}
async function once(src, ctx) { const t = await run(src, ctx); await t.done; t.p.kill(); return t.text; }
function lan() {
  const net = new VirtualNet();
  const pi = net.registerDevice({ id: 'pi', name: 'Raspberry Pi', kind: 'pi', hostname: 'raspberrypi', broker: true });
  net.join(pi, 'RaptiNet', 'rapti1234');
  return { net, pi };
}

console.log('requests');
{
  const { net, pi } = lan();
  let out = await once('import requests\nr = requests.get("http://wttr.in/Dhaka?format=3")\nprint(r.status_code, r.ok, r.text[:5])\nd = requests.get("http://api.open-meteo.com/v1/forecast?latitude=23.8&longitude=90.4&current_weather=true").json()\nprint(type(d["current_weather"]["temperature"]).__name__)\n', { net, dev: pi });
  check('requests.get text + json', /200 True Dhaka/.test(out) && /float|int/.test(out), out);
  out = await once('import requests\nr = requests.post("http://httpbin.org/post", json={"a": 1, "b": [1, 2]})\nprint(r.status_code, r.json()["json"])\nr = requests.get("http://httpbin.org/get", params={"q": "x y"})\nprint(r.json()["args"])\n', { net, dev: pi });
  check('requests.post(json=) / params=', /200 \{.*'a': 1/.test(out) && /\{'q': 'x y'\}/.test(out), out);
  out = await once('import requests\ntry:\n    requests.get("http://no-such-host.example/")\nexcept requests.exceptions.ConnectionError as e:\n    print("ConnectionError")\nr = requests.get("http://httpbin.org/status/404")\nprint(r.status_code)\ntry:\n    r.raise_for_status()\nexcept requests.exceptions.HTTPError:\n    print("HTTPError")\n', { net, dev: pi });
  check('requests errors: ConnectionError + HTTPError', out.includes('ConnectionError') && out.includes('404') && out.includes('HTTPError'), out);
  net.setInternet(false);
  out = await once('import requests\ntry:\n    requests.get("http://wttr.in/")\nexcept Exception as e:\n    print("failed", type(e).__name__)\n', { net, dev: pi });
  check('requests with no internet raises', out.includes('failed'), out);
  net.setInternet(true);
  out = await once('import requests\nprint(requests.get("http://api.thingspeak.com/update?api_key=K1&field1=7").text)', { net, dev: pi });
  const chan = [...net.cloud.thingspeak.values()][0];
  check('ThingSpeak through requests', chan && out.trim() === '1' && chan.entries.length === 1, out);
  out = await once(`import requests\nd = requests.get("http://api.thingspeak.com/channels/${chan.id}/feeds.json?results=1").json()\nprint(d["feeds"][0]["field1"])`, { net, dev: pi });
  check('ThingSpeak feeds JSON', out.trim() === '7', out);
}

console.log('urllib / socket client');
{
  const { net, pi } = lan();
  let out = await once('import urllib.request, json\nr = urllib.request.urlopen("http://api.ipify.org?format=json")\nprint(json.loads(r.read())["ip"])\nimport urllib.parse\nprint(urllib.parse.quote("a b&c"), urllib.parse.urlparse("http://x.com:81/p?q=1").port)\n', { net, dev: pi });
  check('urllib.request / urllib.parse', out.includes('103.4.145.20') && out.includes('a%20b%26c') && out.includes('81'), out);
  out = await once('import socket\nip = socket.gethostbyname("wttr.in")\nprint(ip.count("."))\ns = socket.socket()\ns.connect(("wttr.in", 80))\ns.send(b"GET /Dhaka?format=3 HTTP/1.1\\r\\nHost: wttr.in\\r\\n\\r\\n")\nd = s.recv(1024)\nprint(d.split(b"\\r\\n")[0])\ns.close()\n', { net, dev: pi });
  check('socket client does a raw HTTP request', out.includes('3') && /HTTP\/1\.\d 200/.test(out), out);
}

console.log('http.server / flask / socket server (browser → Pi)');
{
  const { net, pi } = lan();
  let t = await run('from http.server import BaseHTTPRequestHandler, HTTPServer\nclass H(BaseHTTPRequestHandler):\n    def do_GET(self):\n        self.send_response(200)\n        self.send_header("Content-Type", "text/html")\n        self.end_headers()\n        self.wfile.write(b"<h1>Hello from the Pi</h1>" + self.path.encode())\nHTTPServer(("0.0.0.0", 8000), H).serve_forever()\n', { net, dev: pi });
  await sleep(1200);
  let res = await net.request({ method: 'GET', url: `http://${pi.ip}:8000/x?y=2` }, null);
  check('http.server answers a browser', res.status === 200 && res.body.includes('Hello from the Pi') && res.body.includes('/x?y=2'), JSON.stringify(res).slice(0, 200));
  res = await net.request({ method: 'GET', url: `http://raspberrypi.local:8000/` }, null);
  check('.local name works', res.status === 200, JSON.stringify(res).slice(0, 160));
  t.p.kill(); t.gpio.stopProcess(); await sleep(100);
  check('server drops when the program stops', !net.serverFor(pi, 8000));

  t = await run('from flask import Flask, jsonify, request, render_template_string\napp = Flask(__name__)\n@app.route("/")\ndef home():\n    return "<h1>Flask on Pi</h1>"\n@app.route("/api/led/<state>", methods=["GET", "POST"])\ndef led(state):\n    return jsonify(led=state, method=request.method)\n@app.route("/add", methods=["POST"])\ndef add():\n    d = request.get_json()\n    return jsonify(sum=d["a"] + d["b"])\n@app.route("/hi")\ndef hi():\n    return render_template_string("<p>Hi {{ name }}!</p>", name=request.args.get("n", "you"))\napp.run(host="0.0.0.0", port=5000)\n', { net, dev: pi });
  await sleep(1500);
  res = await net.request({ method: 'GET', url: `http://${pi.ip}:5000/` }, null);
  check('flask route', res.status === 200 && res.body.includes('Flask on Pi'), JSON.stringify(res).slice(0, 200) + t.text);
  res = await net.request({ method: 'POST', url: `http://${pi.ip}:5000/api/led/on` }, null);
  check('flask <converter> + jsonify + request.method', res.status === 200 && JSON.parse(res.body).led === 'on' && JSON.parse(res.body).method === 'POST', res.body);
  res = await net.request({ method: 'POST', url: `http://${pi.ip}:5000/add`, headers: { 'content-type': 'application/json' }, body: '{"a":2,"b":40}' }, null);
  check('flask get_json', res.status === 200 && JSON.parse(res.body).sum === 42, res.body);
  res = await net.request({ method: 'GET', url: `http://${pi.ip}:5000/hi?n=Rapti` }, null);
  check('render_template_string', res.body.includes('Hi Rapti!'), res.body);
  res = await net.request({ method: 'GET', url: `http://${pi.ip}:5000/nope` }, null);
  check('flask 404', res.status === 404, JSON.stringify(res).slice(0, 120));
  t.p.kill(); await sleep(100);

  t = await run('import socket\ns = socket.socket()\ns.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)\ns.bind(("", 80))\ns.listen(5)\nwhile True:\n    c, a = s.accept()\n    req = c.recv(1024).decode()\n    c.send(b"HTTP/1.1 200 OK\\r\\nContent-Type: text/plain\\r\\n\\r\\nraw socket server: " + req.split()[1].encode())\n    c.close()\n', { net, dev: pi });
  await sleep(1200);
  res = await net.request({ method: 'GET', url: `http://${pi.ip}/led` }, null);
  check('raw socket web server', res.status === 200 && res.body.includes('raw socket server: /led'), JSON.stringify(res).slice(0, 200) + t.text);
  t.p.kill();
}

console.log('MQTT in Python');
{
  const { net, pi } = lan();
  const phone = net.mqtt.connect('phone', 'broker.hivemq.com', 1883, {}, null).client;
  net.mqtt.subscribe(phone, 'rapti/pi/#');
  let t = await run('import paho.mqtt.client as mqtt, time\ngot = []\ndef on_connect(c, u, f, rc, *a):\n    c.subscribe("rapti/cmd")\ndef on_message(c, u, m):\n    got.append(m.payload.decode())\n    c.publish("rapti/pi/ack", "got " + m.payload.decode())\nc = mqtt.Client()\nc.on_connect = on_connect\nc.on_message = on_message\nc.connect("broker.hivemq.com", 1883)\nc.loop_start()\nc.publish("rapti/pi/online", "yes", retain=True)\nt0 = time.time()\nwhile not got and time.time() - t0 < 5:\n    time.sleep(0.1)\nprint("received", got)\nc.loop_stop()\n', { net, dev: pi });
  await sleep(1200);
  net.mqtt.publish(phone, 'rapti/cmd', 'LED_ON');
  await t.done;
  check('paho: subscribe + publish + callbacks', t.text.includes("received ['LED_ON']"), t.text);
  const msgs = []; let m; while ((m = net.mqtt.poll(phone))) msgs.push(m.topic + '=' + m.payload);
  check('phone saw online + ack', msgs.includes('rapti/pi/online=yes') && msgs.includes('rapti/pi/ack=got LED_ON'), msgs.join(' | '));
  t.p.kill();
}

console.log('Pico W umqtt')
{
  const net = new VirtualNet();
  const pico = net.registerDevice({ id: 'pi', name: 'Pico W', kind: 'pico', hostname: 'picow' });
  net.join(pico, 'RaptiNet', 'rapti1234');
  const phone = net.mqtt.connect('phone', 'broker.hivemq.com', 1883, {}, null).client;
  net.mqtt.subscribe(phone, 'rapti/pi/#');
  const t = await run('from umqtt.simple import MQTTClient\nimport time\nc = MQTTClient("u1", "broker.hivemq.com")\ngot = []\nc.set_callback(lambda tp, mg: got.append((tp, mg)))\nc.connect()\nc.subscribe(b"rapti/u")\nc.publish(b"rapti/pi/umqtt", b"hello")\nt0 = time.time()\nwhile not got and time.time() - t0 < 5:\n    c.check_msg()\n    time.sleep(0.1)\nprint(got)\nc.disconnect()\n', { net, dev: pico, gpio: new GpioSim('picow') });
  await sleep(1200);
  net.mqtt.publish(phone, 'rapti/u', 'ping');
  await t.done;
  check('umqtt.simple', t.text.includes("(b'rapti/u', b'ping')"), t.text);
  t.p.kill();
}

console.log('Pico W network.WLAN');
{
  const net = new VirtualNet();
  const pico = net.registerDevice({ id: 'pi', name: 'Pico W', kind: 'pico', hostname: 'picow' });
  const g = new GpioSim('picow');
  let out = await once('import network, time\nw = network.WLAN(network.STA_IF)\nw.active(True)\nprint([n[0] for n in w.scan()][:2])\nw.connect("RaptiNet", "rapti1234")\nn = 0\nwhile not w.isconnected() and n < 50:\n    time.sleep(0.1); n += 1\nprint(w.isconnected(), w.ifconfig()[0].startswith("192.168.1."), w.status())\nimport urequests\nprint(urequests.get("http://wttr.in/Dhaka?format=3").status_code)\n', { net, dev: pico, gpio: g });
  check('WLAN scan/connect/ifconfig + urequests', /RaptiNet/.test(out) && out.includes('True True 3') && out.includes('200'), out);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
