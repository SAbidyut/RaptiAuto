// Web pages of the simulated internet (what the Raspberry Pi's Chromium and the phone browser can open).
// Each host maps paths → HTML (or a function(url, net) → HTML).

const CSS = `*{box-sizing:border-box}body{margin:0;font:16px/1.55 system-ui,Segoe UI,Roboto,sans-serif;color:#1f2937;background:#fff}
header{background:#0f172a;color:#e2e8f0;padding:14px 22px;display:flex;gap:14px;align-items:center;flex-wrap:wrap}
header b{font-size:20px;color:#22d3ee}header a{color:#cbd5e1;text-decoration:none;font-size:14px}
main{max-width:860px;margin:0 auto;padding:22px}h1{font-size:28px;margin:.2em 0}h2{margin-top:1.4em;font-size:21px}
code,pre{background:#f1f5f9;border-radius:6px;font:14px ui-monospace,Menlo,monospace}code{padding:1px 5px}pre{padding:12px;overflow:auto}
a{color:#0b6bcb}.card{border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;margin:10px 0}.tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}
.tile{display:block;border:1px solid #dbe4ee;border-radius:14px;padding:14px;text-decoration:none;color:inherit;background:#f8fafc}.tile b{display:block;color:#0f172a}.tile span{font-size:13px;color:#64748b}
footer{color:#94a3b8;font-size:13px;text-align:center;padding:24px}`;

const page = (title, body, extra = '') => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${CSS}${extra}</style></head><body>${body}</body></html>`;
const nav = '<header><b>RAPTI Web</b><a href="http://rapti.net/">Home</a><a href="http://rapti.net/docs/">Docs</a><a href="http://dashboard.rapti.net/">IoT dashboard</a><a href="http://wttr.in/Dhaka">Weather</a><a href="http://httpbin.org/">httpbin</a></header>';

export const DOCS = [
  { path: '/docs/gpio', title: 'GPIO: LEDs, buttons and PWM on the Raspberry Pi', tags: 'gpio led button pwm gpiozero rpi.gpio pins', body: `<p>A <b>GPIO</b> pin is a wire the Pi can switch on (3.3 V) or off (0 V), or read. With <code>gpiozero</code> it takes two lines:</p><pre>from gpiozero import LED
LED(17).blink()</pre><p>Always put a 220 Ω – 1 kΩ resistor in series with an LED, and never connect 5 V to a GPIO pin: the Pi's pins are 3.3 V only (and can supply only about 16 mA).</p>` },
  { path: '/docs/i2c', title: 'I²C: talking to displays and sensors with two wires', tags: 'i2c sda scl lcd oled smbus address display', body: `<p>I²C uses <b>SDA</b> (GPIO2) and <b>SCL</b> (GPIO3). Every device has an address, e.g. an LCD backpack at <code>0x27</code> and an OLED at <code>0x3C</code>. Enable it in <i>Raspberry Pi Configuration → Interfaces</i> and scan with <code>i2cdetect -y 1</code>.</p>` },
  { path: '/docs/mqtt', title: 'MQTT: publish and subscribe for IoT', tags: 'mqtt broker publish subscribe topic hivemq paho iot', body: `<p>MQTT is a tiny messaging protocol. Devices <b>publish</b> to topics (<code>home/kitchen/temp</code>) and others <b>subscribe</b>. A <b>broker</b> relays messages: this simulator has <code>broker.hivemq.com</code> and <code>test.mosquitto.org</code>.</p><pre>import paho.mqtt.client as mqtt
c = mqtt.Client()
c.connect("broker.hivemq.com", 1883)
c.publish("rapti/demo", "hello")</pre><p>Watch the messages on the <a href="http://dashboard.rapti.net/">IoT dashboard</a>.</p>` },
  { path: '/docs/http', title: 'HTTP and REST APIs from Python and Arduino', tags: 'http rest api requests httpclient get post json', body: `<p>A web service answers <b>requests</b> (GET reads, POST sends data) with a status code (200 OK, 404 Not Found) and usually JSON. Python: <code>requests.get(url).json()</code>. Arduino (ESP32): <code>HTTPClient http; http.begin(url); http.GET();</code>.</p><p>Try the simulated services: <a href="http://httpbin.org/get">httpbin.org/get</a>, <a href="http://wttr.in/Dhaka?format=3">wttr.in/Dhaka</a>, <a href="http://api.open-meteo.com/v1/forecast?latitude=23.8&amp;longitude=90.4&amp;current_weather=true">open-meteo</a>.</p>` },
  { path: '/docs/flask', title: 'Flask: a web server on the Raspberry Pi', tags: 'flask web server python route localhost 5000', body: `<p>Flask turns a Python program into a web server:</p><pre>from flask import Flask
app = Flask(__name__)

@app.route("/")
def home():
    return "Hello from the Pi!"

app.run(host="0.0.0.0", port=5000)</pre><p>Run it in Thonny, then open <a href="http://localhost:5000/">http://localhost:5000/</a> in Chromium.</p>` },
  { path: '/docs/thingspeak', title: 'ThingSpeak: send sensor data to the cloud', tags: 'thingspeak cloud channel field api key chart iot', body: `<p>ThingSpeak stores readings in <b>channels</b> with up to 8 <b>fields</b>. Write with <code>/update?api_key=KEY&amp;field1=23.5</code> (once every 15 s on the free plan) and read with <code>/channels/ID/feeds.json</code>. Charts appear on the <a href="http://dashboard.rapti.net/">dashboard</a>.</p>` },
  { path: '/docs/blynk', title: 'Blynk: control a project from a phone app', tags: 'blynk virtual pin app dashboard iot token', body: `<p>Blynk links <b>virtual pins</b> (V0, V1 …) to widgets on your phone. <code>Blynk.virtualWrite(V1, temp)</code> shows a value; a switch on V2 triggers <code>BLYNK_WRITE(V2)</code>. In RaptiAuto use the <a href="http://dashboard.rapti.net/">dashboard</a> as the app.</p>` },
  { path: '/docs/pwm', title: 'PWM: dimming LEDs and driving servos', tags: 'pwm duty servo dimming analogwrite', body: `<p>PWM switches a pin on and off very fast; the <b>duty cycle</b> (percent of time on) sets the brightness. A servo wants a 50 Hz signal with a 0.5–2.5 ms pulse.</p>` },
];

const docIndex = DOCS.map((d) => `<div class="card"><a href="http://rapti.net${d.path}"><b>${d.title}</b></a></div>`).join('');

const searchPage = (u) => {
  const q = (u.searchParams.get('q') || '').toLowerCase().trim();
  const words = q.split(/\s+/).filter(Boolean);
  const hits = DOCS.filter((d) => words.every((w) => (d.title + ' ' + d.tags).toLowerCase().includes(w)));
  const ext = [
    ['http://dashboard.rapti.net/', 'RAPTI IoT dashboard — devices, MQTT, ThingSpeak, Blynk', 'dashboard iot cloud mqtt thingspeak blynk devices'],
    ['http://www.raspberrypi.com/', 'Raspberry Pi — official site', 'raspberry pi raspberrypi'],
    ['http://www.arduino.cc/', 'Arduino — open-source electronics', 'arduino uno esp32'],
    ['http://en.wikipedia.org/wiki/Internet_of_things', 'Internet of things — Wikipedia', 'iot internet of things wikipedia'],
    ['http://pinout.xyz/', 'Raspberry Pi GPIO pinout', 'pinout gpio raspberry pi pins'],
    ['http://httpbin.org/', 'httpbin.org — HTTP request and response service', 'http httpbin api test'],
  ].filter(([, t, tags]) => words.every((w) => (t + ' ' + tags).toLowerCase().includes(w)));
  const items = [...hits.map((d) => [`http://rapti.net${d.path}`, d.title, d.body.replace(/<[^>]+>/g, '').slice(0, 150)]), ...ext.map(([url, t]) => [url, t, url.replace('http://', '')])];
  return page(`${q} - Search`, `${nav}<main><form action="/search"><input name="q" value="${q.replace(/"/g, '&quot;')}" style="width:100%;padding:12px;font-size:17px;border:1px solid #cbd5e1;border-radius:24px"></form><p style="color:#64748b">About ${items.length} results (simulated search engine)</p>${items.map(([url, t, s]) => `<div class="card"><a href="${url}"><b>${t}</b></a><br><small style="color:#15803d">${url}</small><p style="margin:.3em 0 0">${s}</p></div>`).join('') || '<p>No results — try “gpio”, “mqtt”, “flask”, “thingspeak”.</p>'}</main>`);
};

const home = page('RAPTI Start', `${nav}<main><h1>RaptiAuto start page</h1><p>This virtual Raspberry Pi has a simulated internet: the sites below work offline.</p>
<form action="http://google.com/search"><input name="q" placeholder="Search the simulated web: gpio, mqtt, flask …" style="width:100%;padding:13px 18px;font-size:17px;border:1px solid #cbd5e1;border-radius:26px"></form>
<h2>IoT</h2><div class="tiles">
<a class="tile" href="http://dashboard.rapti.net/"><b>IoT dashboard</b><span>Devices, MQTT topics, ThingSpeak charts, Blynk pins, notifications</span></a>
<a class="tile" href="http://localhost:5000/"><b>localhost:5000</b><span>Your Flask app (run it in Thonny first)</span></a>
<a class="tile" href="http://localhost:8000/"><b>localhost:8000</b><span>Your http.server app</span></a>
<a class="tile" href="http://api.thingspeak.com/"><b>ThingSpeak</b><span>Cloud charts for sensor data</span></a>
<a class="tile" href="http://broker.hivemq.com/"><b>HiveMQ broker</b><span>Public MQTT broker</span></a></div>
<h2>Services to call from code</h2><div class="tiles">
<a class="tile" href="http://wttr.in/Dhaka?format=3"><b>wttr.in</b><span>Weather as text</span></a>
<a class="tile" href="http://api.open-meteo.com/v1/forecast?latitude=23.81&amp;longitude=90.41&amp;current_weather=true"><b>open-meteo</b><span>Weather JSON</span></a>
<a class="tile" href="http://worldtimeapi.org/api/timezone/Asia/Dhaka"><b>worldtimeapi</b><span>Date and time JSON</span></a>
<a class="tile" href="http://httpbin.org/get"><b>httpbin</b><span>Echo your requests</span></a>
<a class="tile" href="http://jsonplaceholder.typicode.com/todos/1"><b>JSONPlaceholder</b><span>Fake REST API</span></a>
<a class="tile" href="http://api.coingecko.com/api/v3/simple/price?ids=bitcoin&amp;vs_currencies=usd"><b>CoinGecko</b><span>Bitcoin price</span></a></div>
<h2>Learn</h2>${docIndex}</main><footer>RAPTI — Resonance Automation Professional Training Institute · rapti.net (simulated)</footer>`);

const wiki = page('Internet of things - Wikipedia', `<header><b style="color:#fff">Wikipedia</b><a href="http://rapti.net/">Home</a></header><main><h1>Internet of things</h1><p>The <b>Internet of things</b> (IoT) describes physical objects with sensors, processing ability, software and other technologies that connect and exchange data with other devices and systems over the Internet or other communication networks.</p><h2>Typical building blocks</h2><ul><li><b>Things</b>: microcontrollers such as the ESP32 or Raspberry Pi with sensors and actuators.</li><li><b>Connectivity</b>: Wi-Fi, Bluetooth, LoRa, Ethernet.</li><li><b>Protocols</b>: HTTP/REST, MQTT, CoAP.</li><li><b>Cloud</b>: ThingSpeak, Blynk, AWS IoT, Adafruit IO.</li><li><b>Applications</b>: smart homes, agriculture, industrial monitoring.</li></ul><p>See also: <a href="http://rapti.net/docs/mqtt">MQTT</a>, <a href="http://rapti.net/docs/http">HTTP APIs</a>.</p></main>`);

export const PAGES = {
  'rapti.net': { '/': home, '/docs': page('RAPTI docs', `${nav}<main><h1>Docs</h1>${docIndex}</main>`), '/docs/': page('RAPTI docs', `${nav}<main><h1>Docs</h1>${docIndex}</main>`), ...Object.fromEntries(DOCS.map((d) => [d.path, page(d.title, `${nav}<main><h1>${d.title}</h1>${d.body}</main>`)])) },
  'google.com': { '/': page('Google', `<main style="text-align:center;padding-top:90px"><div style="font:700 64px/1 sans-serif;letter-spacing:-2px"><span style="color:#4285f4">G</span><span style="color:#ea4335">o</span><span style="color:#fbbc05">o</span><span style="color:#4285f4">g</span><span style="color:#34a853">l</span><span style="color:#ea4335">e</span></div><form action="/search" style="margin-top:26px"><input name="q" autofocus style="width:90%;max-width:560px;padding:14px 22px;font-size:17px;border:1px solid #dfe1e5;border-radius:26px"></form><p style="color:#94a3b8;font-size:13px">Simulated search: try “gpio”, “mqtt”, “flask”, “thingspeak”</p></main>`), '/search': (u) => searchPage(u) },
  'example.com': { '/': '<!doctype html><html><head><title>Example Domain</title><meta charset="utf-8"><style>body{background:#f0f0f2;margin:0;font-family:system-ui,sans-serif}div{width:600px;max-width:90%;margin:15vh auto;padding:2em;background:#fdfdff;border-radius:.5em;box-shadow:2px 3px 7px 2px rgba(0,0,0,.02)}a{color:#38488f;text-decoration:none}</style></head><body><div><h1>Example Domain</h1><p>This domain is for use in illustrative examples in documents. You may use this domain in literature without prior coordination or asking for permission.</p><p><a href="https://www.iana.org/domains/example">More information...</a></p></div></body></html>' },
  'www.raspberrypi.com': { '/': page('Raspberry Pi', `<header><b style="color:#f43f5e">Raspberry Pi</b><a href="http://rapti.net/">Home</a></header><main><h1>Raspberry Pi — computers for everyone</h1><p>The Raspberry Pi 5 has a quad-core Arm Cortex-A76 at 2.4 GHz, up to 16 GB RAM, two micro-HDMI ports, PCIe 2.0 and the RP1 I/O chip. Use the 40-pin header for GPIO, I²C, SPI and UART.</p><p>Learn more: <a href="http://pinout.xyz/">GPIO pinout</a> · <a href="http://rapti.net/docs/gpio">GPIO guide</a></p></main>`) },
  'www.arduino.cc': { '/': page('Arduino', `<header><b style="color:#00979d">ARDUINO</b><a href="http://rapti.net/">Home</a></header><main><h1>Open-source electronics</h1><p>Arduino boards read inputs — light on a sensor, a finger on a button — and turn them into outputs. The Uno R4 WiFi and ESP32 boards add Wi-Fi for IoT.</p></main>`) },
  'en.wikipedia.org': { '/wiki/Internet_of_things': wiki, '/wiki/IoT': wiki, '/': wiki },
  'pinout.xyz': { '/': (u, net) => page('Raspberry Pi Pinout', `<header><b style="color:#fff">pinout.xyz</b><a href="http://rapti.net/">Home</a></header><main><h1>Raspberry Pi GPIO pinout</h1><table style="border-collapse:collapse;font:14px monospace">${pinoutRows()}</table><p style="color:#64748b">Physical pin · BCM GPIO · function. 3V3 pins give max 50 mA; GPIO pins are 3.3 V and about 16 mA each.</p></main>`) },
  'broker.hivemq.com': { '/': page('HiveMQ public broker', `<main><h1>HiveMQ public MQTT broker</h1><p>Host: <code>broker.hivemq.com</code> · TCP port <code>1883</code> · WebSocket <code>8000</code>.</p><p>Everything published here is public. Watch it on the <a href="http://dashboard.rapti.net/">IoT dashboard</a>.</p></main>`) },
  'test.mosquitto.org': { '/': page('Eclipse Mosquitto test server', `<main><h1>test.mosquitto.org</h1><p>Public MQTT test server on port <code>1883</code>.</p></main>`) },
};

function pinoutRows() {
  const names = { 1: '3V3', 2: '5V', 3: 'GPIO2 (SDA)', 4: '5V', 5: 'GPIO3 (SCL)', 6: 'GND', 7: 'GPIO4', 8: 'GPIO14 (TXD)', 9: 'GND', 10: 'GPIO15 (RXD)', 11: 'GPIO17', 12: 'GPIO18 (PWM)', 13: 'GPIO27', 14: 'GND', 15: 'GPIO22', 16: 'GPIO23', 17: '3V3', 18: 'GPIO24', 19: 'GPIO10 (MOSI)', 20: 'GND', 21: 'GPIO9 (MISO)', 22: 'GPIO25', 23: 'GPIO11 (SCLK)', 24: 'GPIO8 (CE0)', 25: 'GND', 26: 'GPIO7 (CE1)', 27: 'ID_SD', 28: 'ID_SC', 29: 'GPIO5', 30: 'GND', 31: 'GPIO6', 32: 'GPIO12 (PWM)', 33: 'GPIO13 (PWM)', 34: 'GND', 35: 'GPIO19', 36: 'GPIO16', 37: 'GPIO26', 38: 'GPIO20', 39: 'GND', 40: 'GPIO21' };
  const c = (n) => { const v = names[n]; const bg = /3V3/.test(v) ? '#fed7aa' : /5V/.test(v) ? '#fecaca' : /GND/.test(v) ? '#d1d5db' : '#fef9c3'; return `<td style="padding:4px 10px;background:${bg};border:1px solid #fff">${n}</td><td style="padding:4px 10px;background:${bg};border:1px solid #fff">${v}</td>`; };
  let r = '';
  for (let i = 1; i <= 40; i += 2) r += `<tr>${c(i)}${c(i + 1)}</tr>`;
  return r;
}
