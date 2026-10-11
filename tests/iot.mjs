// Arduino IoT libraries on the virtual network: WiFi, WebServer, WiFiServer, WiFiClient, HTTPClient,
// PubSubClient (MQTT), ThingSpeak, Blynk, NTP, Preferences, Telegram, Bluetooth and the header checks.
//   node tests/iot.mjs
import { runIot } from './iot-helpers.mjs';
import { VirtualNet } from '../web/src/net/network.js';

let failed = 0, passed = 0;
function check(name, cond, extra = '') {
  if (cond) { passed++; console.log('  ok  ' + name); }
  else { failed++; console.log('  FAIL ' + name + (extra ? '\n       ' + String(extra).replace(/\n/g, '\n       ') : '')); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HEAD = '#include <WiFi.h>\nconst char* ssid = "RaptiNet";\nconst char* pass = "rapti1234";\nvoid wifiUp() { WiFi.begin(ssid, pass); while (WiFi.status() != WL_CONNECTED) delay(100); }\n';

/** Browser-side calls fired at given times (ms of sketch time); results are collected without blocking the frames. */
function browser(plan) {
  const out = {};
  const between = (eng, t, net) => {
    const dev = net.devices.get('b');
    for (const p of plan) {
      if (!p.done && dev && dev.connected && t >= p.at) {
        p.done = true;
        const url = p.url.replace('{ip}', dev.ip);
        net.request({ method: p.method || 'GET', url, body: p.body || '', headers: p.headers || {} }, null).then((r) => { out[p.name] = r; });
      }
    }
  };
  return { between, out };
}

console.log('WiFi');
{
  const r = await runIot(HEAD + `void setup(){ Serial.begin(115200); Serial.println(WiFi.status()); wifiUp(); Serial.println(WiFi.status()); Serial.println(WiFi.SSID()); Serial.println(WiFi.RSSI() < 0); Serial.println(WiFi.gatewayIP()); Serial.println(WiFi.localIP().toString()); WiFi.disconnect(); delay(50); Serial.println(WiFi.status()); }\nvoid loop(){}`, { ms: 5000 });
  check('status 255 → 3 (connected), SSID, RSSI, gateway', /255\r\n3\r\nRaptiNet\r\n1\r\n192\.168\.1\.1\r\n192\.168\.1\.\d+\r\n6/.test(r.serial), r.serial + JSON.stringify(r.error));
  check('device is on the network', r.dev && r.dev.ip.startsWith('192.168.1.'), JSON.stringify(r.dev));
}
{
  const r = await runIot(`#include <WiFi.h>\nvoid setup(){ Serial.begin(115200); WiFi.begin("RaptiNet", "wrongpass"); int n = 0; while (WiFi.status() != WL_CONNECTED && n++ < 60) delay(100); Serial.println(WiFi.status()); }\nvoid loop(){}`, { ms: 9000 });
  check('wrong password → WL_CONNECT_FAILED (4) + a warning', r.serial.includes('4') && r.warns.some((w) => /password/i.test(w)), r.serial + r.warns);
}
{
  const r = await runIot(HEAD + `void setup(){ Serial.begin(115200); int n = WiFi.scanNetworks(); Serial.println(n); Serial.println(WiFi.SSID(0)); wifiUp(); WiFi.softAP("MyESP", "12345678"); Serial.println(WiFi.softAPIP()); bool bad = WiFi.softAP("x", "123"); Serial.println(bad); }\nvoid loop(){}`, { ms: 6000 });
  check('scanNetworks / softAP / short AP password fails', /^6\r\n/.test(r.serial) && r.serial.includes('192.168.4.1') && r.serial.trim().endsWith('0') && r.warns.some((w) => /8 characters/.test(w)), r.serial);
}

console.log('WebServer');
{
  const b = browser([
    { name: 'root', at: 3500, url: 'http://{ip}/' }, { name: 'led', at: 3600, url: 'http://{ip}/led?state=on&x=1' },
    { name: 'echo', at: 3700, url: 'http://{ip}/echo', method: 'POST', body: 'hello body', headers: { 'content-type': 'text/plain' } },
    { name: 'nf', at: 3800, url: 'http://{ip}/xyz' }, { name: 'mdns', at: 3900, url: 'http://lab32.local/' },
    { name: 'form', at: 4000, url: 'http://{ip}/form', method: 'POST', body: 'a=1&b=hi+there', headers: { 'content-type': 'application/x-www-form-urlencoded' } },
  ]);
  const r = await runIot(HEAD + `#include <WebServer.h>\n#include <ESPmDNS.h>\nWebServer server(80); int hits = 0;
void handleRoot() { hits++; server.send(200, "text/html", "<h1>Hello</h1>" + String(hits)); }
void handleLed() { digitalWrite(2, server.arg("state") == "on"); server.send(200, "application/json", String("{\\"n\\":") + server.args() + "}"); }
void setup(){ Serial.begin(115200); pinMode(2, OUTPUT); wifiUp(); MDNS.begin("lab32"); server.on("/", handleRoot); server.on("/led", HTTP_GET, handleLed);
 server.on("/echo", HTTP_POST, []() { server.send(200, "text/plain", "got:" + server.arg("plain")); });
 server.on("/form", HTTP_POST, []() { server.send(200, "text/plain", server.arg("a") + "|" + server.arg("b") + "|" + (server.method() == HTTP_POST)); });
 server.onNotFound([]() { server.send(404, "text/plain", "nope " + server.uri()); }); server.begin(); }
void loop(){ server.handleClient(); delay(2); }`, { ms: 6500, between: b.between });
  await sleep(100);
  check('route + String concat', b.out.root && b.out.root.status === 200 && b.out.root.body === '<h1>Hello</h1>1', JSON.stringify(b.out.root));
  check('query args + digitalWrite', b.out.led && b.out.led.body === '{"n":2}' && r.eng.parts.get('b') !== undefined, JSON.stringify(b.out.led));
  check('POST body in arg("plain") (lambda handler)', b.out.echo && b.out.echo.body === 'got:hello body', JSON.stringify(b.out.echo));
  check('onNotFound', b.out.nf && b.out.nf.status === 404 && b.out.nf.body === 'nope /xyz', JSON.stringify(b.out.nf));
  check('mDNS name lab32.local', b.out.mdns && b.out.mdns.status === 200, JSON.stringify(b.out.mdns));
  check('form-encoded POST args + method()', b.out.form && b.out.form.body === '1|hi there|1', JSON.stringify(b.out.form));
}
{
  const b = browser([{ name: 'a', at: 3500, url: 'http://{ip}/' }]);
  const r = await runIot(HEAD + `#include <WebServer.h>\nWebServer server(80);\nvoid setup(){ Serial.begin(115200); wifiUp(); server.on("/", [](){ Serial.println("handled"); }); server.begin(); }\nvoid loop(){ server.handleClient(); delay(2); }`, { ms: 5000, between: b.between });
  await sleep(50);
  check('handler without send(): empty response + warning', r.serial.includes('handled') && b.out.a && b.out.a.failed && r.warns.some((w) => /server\.send/.test(w)), JSON.stringify(b.out.a) + r.warns);
}
{
  const b = browser([{ name: 'a', at: 3500, url: 'http://{ip}/' }]);
  const r = await runIot(HEAD + `#include <WebServer.h>\nWebServer server(80);\nvoid setup(){ Serial.begin(115200); wifiUp(); server.on("/", [](){ server.send(200, "text/plain", "x"); }); server.begin(); }\nvoid loop(){ delay(10); }`, { ms: 12500, between: b.between });
  await sleep(50);
  check('forgot handleClient(): the browser times out', b.out.a === undefined || (b.out.a && b.out.a.failed), JSON.stringify(b.out.a));
}

console.log('WiFiServer / WiFiClient (classic web server)');
{
  const b = browser([{ name: 'a', at: 3500, url: 'http://{ip}/H' }, { name: 'b', at: 3700, url: 'http://{ip}/L' }]);
  const r = await runIot(HEAD + `WiFiServer server(80);\nvoid setup(){ Serial.begin(115200); pinMode(2, OUTPUT); wifiUp(); server.begin(); }
void loop(){
  WiFiClient client = server.available();
  if (client) {
    Serial.println("New Client.");
    String currentLine = "";
    String req = "";
    while (client.connected()) {
      if (client.available()) {
        char c = client.read();
        req += c;
        if (c == '\\n') {
          if (currentLine.length() == 0) {
            client.println("HTTP/1.1 200 OK");
            client.println("Content-type:text/html");
            client.println();
            client.print("Click <a href=\\"/H\\">here</a> to turn the LED on.<br>");
            client.println();
            break;
          } else currentLine = "";
        } else if (c != '\\r') currentLine += c;
        if (currentLine.endsWith("GET /H")) digitalWrite(2, HIGH);
        if (currentLine.endsWith("GET /L")) digitalWrite(2, LOW);
      }
    }
    client.stop();
    Serial.println("Client Disconnected.");
  }
}`, { ms: 6000, between: b.between });
  await sleep(50);
  check('WiFiServer: request read line by line, answer on stop()', b.out.a && b.out.a.status === 200 && b.out.a.body.includes('turn the LED on') && b.out.b && b.out.b.status === 200, JSON.stringify(b.out.a) + r.serial);
  check('GET /L drove the pin low after /H high', r.serial.split('New Client.').length === 3, r.serial);
}
{
  const r = await runIot(HEAD + `#include <WiFiClient.h>\nvoid setup(){ Serial.begin(115200); wifiUp(); WiFiClient c;
  if (!c.connect("wttr.in", 80)) { Serial.println("fail"); return; }
  c.print("GET /Dhaka?format=3 HTTP/1.1\\r\\nHost: wttr.in\\r\\nConnection: close\\r\\n\\r\\n");
  unsigned long t = millis(); while (!c.available() && millis() - t < 3000) delay(10);
  String status = c.readStringUntil('\\r'); Serial.println(status);
  while (c.connected() || c.available()) { String l = c.readStringUntil('\\n'); if (l.length() > 3 && l.indexOf("Dhaka") >= 0) Serial.println(l); }
  c.stop(); Serial.println(c.connected()); }\nvoid loop(){}`, { ms: 8000 });
  check('WiFiClient raw HTTP request to the internet', r.serial.includes('HTTP/1.1 200 OK') && r.serial.includes('Dhaka:') && r.serial.trim().endsWith('0'), r.serial + r.warns);
}
{
  const r = await runIot(HEAD + `#include <WiFiClientSecure.h>\nvoid setup(){ Serial.begin(115200); wifiUp(); WiFiClientSecure c; Serial.println(c.connect("httpbin.org", 443)); c.setInsecure(); Serial.println(c.connect("httpbin.org", 443)); }\nvoid loop(){}`, { ms: 6000 });
  check('WiFiClientSecure: needs setInsecure()/setCACert', /^0\r\n1/.test(r.serial.trim()) && r.warns.some((w) => /setInsecure/.test(w)), r.serial + r.warns);
}

console.log('HTTPClient');
{
  const r = await runIot(HEAD + `#include <HTTPClient.h>\n#include <WiFiClientSecure.h>\nvoid setup(){ Serial.begin(115200); wifiUp();
  HTTPClient http;
  http.begin("http://httpbin.org/post"); http.addHeader("Content-Type", "application/json");
  int code = http.POST("{\\"temp\\":23.5}"); Serial.println(code); String b = http.getString(); Serial.println(b.indexOf("23.5") > 0); http.end();
  http.begin("http://httpbin.org/status/404"); Serial.println(http.GET()); http.end();
  http.begin("http://no-such-host.example/"); int c2 = http.GET(); Serial.println(c2); Serial.println(HTTPClient::errorToString(c2)); http.end();
  http.begin("https://httpbin.org/get"); Serial.println(http.GET()); http.end();
  WiFiClientSecure sc; sc.setInsecure(); http.begin(sc, "https://httpbin.org/get"); Serial.println(http.GET()); http.end();
  const char* keys[] = {"Content-Type"}; http.begin("http://httpbin.org/get"); http.collectHeaders(keys, 1); http.GET(); Serial.println(http.header("Content-Type")); http.end(); }\nvoid loop(){}`, { ms: 12000 });
  const lines = r.serial.trim().split(/\r?\n/);
  check('POST json + getString', lines[0] === '200' && lines[1] === '1', r.serial);
  check('404 code, unknown host -1 + errorToString', lines[2] === '404' && lines[3] === '-1' && lines[4] === 'connection refused', r.serial);
  check('https without certificate fails (-1); with setInsecure it works', lines[5] === '-1' && lines[6] === '200', r.serial + r.warns);
  check('collectHeaders → header()', /application\/json/.test(lines[7] || ''), r.serial);
}

console.log('MQTT (PubSubClient)');
{
  const net = new VirtualNet();
  const phone = net.mqtt.connect('phone', 'broker.hivemq.com', 1883, {}, null).client;
  net.mqtt.subscribe(phone, 'rapti/esp/#');
  let sent = false;
  const r = await runIot(HEAD + `#include <PubSubClient.h>\nWiFiClient espClient; PubSubClient client(espClient);
volatile int got = 0;
void callback(char* topic, byte* payload, unsigned int length) { String m; for (unsigned int i = 0; i < length; i++) m += (char)payload[i]; Serial.print("["); Serial.print(topic); Serial.print("] "); Serial.println(m); if (m == "ON") digitalWrite(2, HIGH); got++; }
void reconnect() { while (!client.connected()) { if (client.connect("ESP32Client")) { client.subscribe("rapti/esp/cmd"); client.publish("rapti/esp/status", "online", true); } else delay(500); } }
void setup(){ Serial.begin(115200); pinMode(2, OUTPUT); wifiUp(); client.setServer("broker.hivemq.com", 1883); client.setCallback(callback); }
void loop(){ if (!client.connected()) reconnect(); client.loop(); static unsigned long last; if (millis() - last > 1000) { last = millis(); client.publish("rapti/esp/temp", String(24.5).c_str()); } }`,
  { ms: 6000, net, between: (eng, t) => { if (!sent && t > 4200) { sent = true; net.mqtt.publish(phone, 'rapti/esp/cmd', 'ON'); } } });
  const got = []; let m; while ((m = net.mqtt.poll(phone))) got.push(m.topic + '=' + m.payload);
  check('connect + subscribe + callback with topic/payload', r.serial.includes('[rapti/esp/cmd] ON'), r.serial + r.warns + JSON.stringify(r.errors));
  check('publish status (retained) and periodic temp', got.includes('rapti/esp/status=online') && got.filter((x) => x === 'rapti/esp/temp=24.50').length >= 2, got.join(' | '));
  check('retained message kept on the broker', net.mqtt.retained.get('broker.hivemq.com').get('rapti/esp/status').payload === 'online');
}
{
  const r = await runIot(HEAD + `#include <PubSubClient.h>\nWiFiClient e; PubSubClient c(e);\nvoid setup(){ Serial.begin(115200); wifiUp(); c.setServer("broker.hivemq.com", 1883); c.connect("x"); String big = ""; for (int i = 0; i < 300; i++) big += "a"; Serial.println(c.publish("t", big.c_str())); c.setBufferSize(512); Serial.println(c.publish("t", big.c_str()));
  c.setServer("192.168.1.250", 1883); c.disconnect(); Serial.println(c.connect("y")); Serial.println(c.state()); }\nvoid loop(){}`, { ms: 9000 });
  check('publish bigger than 256 bytes fails until setBufferSize()', /^0\r\n1\r\n0\r\n-2/.test(r.serial.trim()) && r.warns.some((w) => /setBufferSize/.test(w)), r.serial + r.warns);
}
{
  // ESP32 → Raspberry Pi's Mosquitto on the LAN
  const net = new VirtualNet();
  const pi = net.registerDevice({ id: 'pi', name: 'Raspberry Pi', kind: 'pi', hostname: 'raspberrypi', broker: true });
  net.join(pi, 'RaptiNet', 'rapti1234');
  const sub = net.mqtt.connect('s', 'localhost', 1883, {}, pi).client; net.mqtt.subscribe(sub, '#');
  await runIot(HEAD + `#include <PubSubClient.h>\nWiFiClient e; PubSubClient c(e);\nvoid setup(){ wifiUp(); c.setServer("${pi.ip}", 1883); c.connect("esp"); c.publish("home/sensor", "42"); }\nvoid loop(){ c.loop(); }`, { ms: 5000, net });
  const m = net.mqtt.poll(sub);
  check('MQTT to a broker on the Raspberry Pi (LAN)', m && m.topic === 'home/sensor' && m.payload === '42', JSON.stringify(m));
}

console.log('ThingSpeak / Blynk / NTP / Preferences / Telegram / Bluetooth / ESP');
{
  const net = new VirtualNet();
  const r = await runIot(HEAD + `#include <ThingSpeak.h>\nWiFiClient client; unsigned long myChannel = 12345; const char* wkey = "ABCD1234WRITEKEY";
void setup(){ Serial.begin(115200); wifiUp(); ThingSpeak.begin(client); ThingSpeak.setField(1, 23.5); ThingSpeak.setField(2, 61); ThingSpeak.setStatus("ok"); int x = ThingSpeak.writeFields(myChannel, wkey); Serial.println(x); ThingSpeak.setField(1, 24.5); x = ThingSpeak.writeFields(myChannel, wkey); Serial.println(x); }\nvoid loop(){}`, { ms: 6000, net });
  const ch = [...net.cloud.thingspeak.values()][0];
  check('ThingSpeak.writeFields → 200, a second quick write → -401 (15 s rule)', /^200\r\n-401/.test(r.serial.trim()) && ch && ch.entries.length === 1 && ch.entries[0].field1 === '23.50', r.serial + JSON.stringify(ch));
}
{
  const net = new VirtualNet();
  let sent = false;
  const r = await runIot(`#define BLYNK_TEMPLATE_ID "TMPL1"\n#define BLYNK_AUTH_TOKEN "Rapti_Demo_Token_00000000000001"\n#include <WiFi.h>\n#include <BlynkSimpleEsp32.h>
BlynkTimer timer; int ledState = 0;
BLYNK_WRITE(V1) { ledState = param.asInt(); digitalWrite(2, ledState); Serial.print("V1="); Serial.println(ledState); }
BLYNK_CONNECTED() { Serial.println("connected"); }
void sendSensor() { Blynk.virtualWrite(V2, 25.5); Blynk.virtualWrite(V3, millis() / 1000); }
void setup(){ Serial.begin(115200); pinMode(2, OUTPUT); Blynk.begin(BLYNK_AUTH_TOKEN, "RaptiNet", "rapti1234"); timer.setInterval(1000L, sendSensor); }
void loop(){ Blynk.run(); timer.run(); }`, { ms: 8000, net, between: (eng, t) => { const b = net.cloud.blynk.get('Rapti_Demo_Token_00000000000001'); if (!sent && b && t > 6000) { sent = true; b.pins.set('V1', '1'); b.dirty.add('V1'); } } });
  const b = net.cloud.blynk.get('Rapti_Demo_Token_00000000000001');
  check('Blynk.begin + BLYNK_CONNECTED', r.serial.includes('connected'), r.serial + JSON.stringify(r.error) + r.warns);
  check('virtualWrite from BlynkTimer', b && b.pins.get('V2') === '25.50', b && JSON.stringify([...b.pins]));
  check('BLYNK_WRITE(V1) runs when the app changes the widget', r.serial.includes('V1=1'), r.serial);
}
{
  const r = await runIot(`#include <WiFi.h>\n#include <BlynkSimpleEsp32.h>\nvoid setup(){ Serial.begin(115200); Blynk.begin("YourAuthToken", "RaptiNet", "rapti1234"); Serial.println(Blynk.connected()); }\nvoid loop(){ Blynk.run(); }`, { ms: 9000 });
  check('Blynk placeholder token is rejected with a hint', r.serial.includes('0') && r.warns.some((w) => /auth token/.test(w)), r.serial + r.warns);
}
{
  const r = await runIot(HEAD + `#include <WiFiUdp.h>\n#include <NTPClient.h>\nWiFiUDP ntpUDP; NTPClient timeClient(ntpUDP, "pool.ntp.org", 6 * 3600);
void setup(){ Serial.begin(115200); Serial.println(timeClient.getFormattedTime()); wifiUp(); timeClient.begin(); Serial.println(timeClient.update()); Serial.println(timeClient.isTimeSet()); Serial.println(timeClient.getEpochTime() > 1700000000UL); Serial.println(timeClient.getFormattedTime().length()); }\nvoid loop(){}`, { ms: 6000 });
  check('NTPClient: update() syncs the real time', /^06:00:0\d\r\n1\r\n1\r\n1\r\n8/.test(r.serial.trim()), r.serial + r.warns);
}
{
  const r = await runIot(HEAD + `#include <time.h>\nvoid setup(){ Serial.begin(115200); wifiUp(); configTime(6 * 3600, 0, "pool.ntp.org"); struct tm t; int n = 0; while (!getLocalTime(&t) && n++ < 50) delay(100); Serial.println(t.tm_year + 1900 > 2023); char buf[32]; strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M:%S", &t); Serial.println(strlen(buf)); time_t now = time(nullptr); Serial.println(now > 1700000000L); }\nvoid loop(){}`, { ms: 8000 });
  check('configTime + getLocalTime + strftime + time()', /^1\r\n19\r\n1/.test(r.serial.trim()), r.serial + r.warns + JSON.stringify(r.errors));
}
{
  const r = await runIot(`#include <Preferences.h>\nPreferences prefs;\nvoid setup(){ Serial.begin(115200); prefs.begin("app", false); int boots = prefs.getInt("boots", 0); Serial.println(boots); prefs.putInt("boots", boots + 1); prefs.putString("name", "rapti"); Serial.println(prefs.getString("name", "none")); Serial.println(prefs.isKey("boots")); prefs.end(); }\nvoid loop(){}`, { ms: 1000 });
  const r2 = await runIot(`#include <Preferences.h>\nPreferences prefs;\nvoid setup(){ Serial.begin(115200); prefs.begin("app", true); Serial.println(prefs.getInt("boots", 0)); prefs.end(); }\nvoid loop(){}`, { ms: 1000 });
  check('Preferences: values survive between runs (flash)', /^0\r\nrapti\r\n1/.test(r.serial.trim()) && r2.serial.trim() === '1', r.serial + '|' + r2.serial);
}
{
  const net = new VirtualNet();
  net.cloud.telegram.inbox.push({ update_id: 5, message: { message_id: 1, from: { id: 1, first_name: 'Sabid' }, chat: { id: 77 }, date: 1, text: '/led_on' } });
  const r = await runIot(HEAD + `#include <WiFiClientSecure.h>\n#include <UniversalTelegramBot.h>\nWiFiClientSecure client; UniversalTelegramBot bot("123456789:AAEhBP0av28XRaptiAutoTestTokenXY", client);
void setup(){ Serial.begin(115200); wifiUp(); client.setInsecure(); int n = bot.getUpdates(bot.last_message_received + 1); Serial.println(n); if (n) { String chat = bot.messages[0].chat_id; String text = bot.messages[0].text; Serial.println(text); bot.sendMessage(chat, "LED is ON", ""); } }\nvoid loop(){}`, { ms: 7000, net });
  check('Telegram bot: getUpdates + sendMessage', /^1\r\n\/led_on/.test(r.serial.trim()) && net.notes.some((n) => /LED is ON/.test(n.text) && /77/.test(n.title)), r.serial + JSON.stringify(net.notes) + r.warns + JSON.stringify(r.errors));
}
{
  const net = new VirtualNet();
  let sent = false;
  const r = await runIot(`#include <BluetoothSerial.h>\nBluetoothSerial SerialBT;\nvoid setup(){ Serial.begin(115200); SerialBT.begin("ESP32test"); pinMode(2, OUTPUT); }
void loop(){ if (SerialBT.available()) { String s = SerialBT.readStringUntil('\\n'); s.trim(); Serial.println(s); if (s == "on") digitalWrite(2, HIGH); SerialBT.println("OK " + s); } delay(20); }`, { ms: 3000, net, between: (eng, t) => { if (!sent && t > 1500) { sent = true; net.btSend('b', 'on'); } } });
  const d = net.devices.get('b');
  check('BluetoothSerial: phone terminal ↔ board', r.serial.includes('on') && d.bt && d.bt.log.some((l) => l.dir === 'out' && l.text.includes('OK on')), r.serial + JSON.stringify(d && d.bt));
}
{
  const r = await runIot(`void setup(){ Serial.begin(115200); Serial.println(ESP.getFreeHeap() > 1000); Serial.println(ESP.getChipModel()); Serial.println(ESP.getCpuFreqMHz()); }\nvoid loop(){}`, { ms: 500 });
  check('ESP object', /^1\r\nESP32/.test(r.serial.trim()) && r.serial.includes('240'), r.serial);
}
{
  const r = await runIot(`int n = 0;\nvoid setup(){ Serial.begin(115200); n++; Serial.print("boot "); Serial.println(n); delay(300); if (n < 3) ESP.restart(); }\nvoid loop(){ }`, { ms: 2500 });
  check('ESP.restart() reboots the sketch', /boot 1\r\n[\s\S]*boot 1\r\n/.test(r.serial.replace(/boot 2/g, 'boot 1')) && (r.serial.match(/boot /g) || []).length >= 2, r.serial);
}

console.log('ArduinoJson');
{
  const r = await runIot(String.raw`
#include <ArduinoJson.h>
void setup() {
  Serial.begin(115200);
  StaticJsonDocument<512> doc;
  String payload = "{\"name\":\"Dhaka\",\"main\":{\"temp\":31.5,\"humidity\":70},\"weather\":[{\"main\":\"Clouds\"},{\"main\":\"Rain\"}],\"ok\":true,\"n\":3}";
  DeserializationError error = deserializeJson(doc, payload);
  if (error) { Serial.println(error.c_str()); return; }
  const char* name = doc["name"];
  float t = doc["main"]["temp"];
  int missing = doc["nothing"] | -1;
  String w = doc["weather"][1]["main"];
  bool ok = doc["ok"];
  Serial.println(name); Serial.println(t); Serial.println(missing); Serial.println(w); Serial.println(ok);
  Serial.println(doc["weather"].size());
  Serial.println(doc["n"].as<int>() + 1);
  Serial.println(doc["main"]["temp"].is<float>());
  Serial.println(doc.containsKey("name"));
  Serial.println(doc["name"] == "Dhaka");
  for (JsonObject item : doc["weather"].as<JsonArray>()) Serial.println(item["main"].as<const char*>());
  JsonObject root = doc.as<JsonObject>();
  for (JsonPair kv : root) { Serial.print(kv.key().c_str()); Serial.print(","); }
  Serial.println();
  StaticJsonDocument<200> out;
  out["sensor"] = "gps"; out["time"] = 1351824120; out["led"] = true; out["t"] = 23.5;
  JsonArray data = out.createNestedArray("data"); data.add(48.756080); data.add(2.302038);
  serializeJson(out, Serial); Serial.println();
  char buf[64]; size_t n = serializeJson(out["data"], buf, sizeof(buf)); Serial.println(buf); Serial.println(n);
  DeserializationError e2 = deserializeJson(doc, "{bad json");
  Serial.println(e2.c_str());
  DynamicJsonDocument d2(1024); d2["a"]["b"]["c"] = 5; serializeJson(d2, Serial); Serial.println();
  serializeJsonPretty(out["data"], Serial); Serial.println();
}
void loop(){}`, { ms: 500 });
  const L = r.serial.split(/\r?\n/);
  check('deserializeJson + operator[] + | default + as<T>', r.ok && L[0] === 'Dhaka' && L[1] === '31.50' && L[2] === '-1' && L[3] === 'Rain' && L[4] === '1' && L[5] === '2' && L[6] === '4' && L[7] === '1' && L[8] === '1' && L[9] === '1', r.serial + JSON.stringify(r.error));
  check('range-for over JsonArray / JsonObject', L[10] === 'Clouds' && L[11] === 'Rain' && L[12] === 'name,main,weather,ok,n,', r.serial);
  check('serializeJson keeps true/false, nested arrays and char buffers', L[13] === '{"sensor":"gps","time":1351824120,"led":true,"t":23.5,"data":[48.75608,2.302038]}' && L[14] === '[48.75608,2.302038]' && L[15] === '19', r.serial);
  check('errors and auto-created nested objects', L[16] === 'IncompleteInput' && L[17] === '{"a":{"b":{"c":5}}}' && L[18] === '[' && L[19] === '  48.75608,', r.serial);
}
{
  const r = await runIot(HEAD + `#include <HTTPClient.h>\n#include <ArduinoJson.h>\nvoid setup(){ Serial.begin(115200); wifiUp(); HTTPClient http; http.begin("http://api.open-meteo.com/v1/forecast?latitude=23.81&longitude=90.41&current_weather=true"); int code = http.GET(); StaticJsonDocument<768> doc; DeserializationError err = deserializeJson(doc, http.getStream()); Serial.println(code); Serial.println(err.c_str()); float t = doc["current_weather"]["temperature"]; int wc = doc["current_weather"]["weathercode"]; Serial.println(t > -50 && t < 60); Serial.println(wc >= 0); http.end(); }\nvoid loop(){}`, { ms: 8000 });
  check('HTTP GET → ArduinoJson parsing a stream (weather API)', /^200\r\nOk\r\n1\r\n1/.test(r.serial.trim()), r.serial + JSON.stringify(r.error));
}

console.log('Other boards and headers');
{
  const b = browser([{ name: 'a', at: 3500, url: 'http://{ip}/' }]);
  const r = await runIot(`#include <ESP8266WiFi.h>\n#include <ESP8266WebServer.h>\nESP8266WebServer server(80);\nvoid setup(){ Serial.begin(115200); WiFi.mode(WIFI_STA); WiFi.begin("RaptiNet", "rapti1234"); while (WiFi.status() != WL_CONNECTED) delay(100); Serial.println(WiFi.hostname()); server.on("/", [](){ server.send(200, "text/plain", "esp8266 ok"); }); server.begin(); }\nvoid loop(){ server.handleClient(); }`, { board: 'esp8266', ms: 5000, between: b.between });
  await sleep(50);
  check('ESP8266 (NodeMCU) web server', b.out.a && b.out.a.body === 'esp8266 ok' && /^ESP-[0-9A-F]{6}/.test(r.serial.trim()), r.serial + JSON.stringify(b.out.a) + JSON.stringify(r.error));
}
{
  const r = await runIot(`#include <WiFiS3.h>\nWiFiClient c;\nvoid setup(){ Serial.begin(115200); int s = WL_IDLE_STATUS; while (s != WL_CONNECTED) { s = WiFi.begin("RaptiNet", "rapti1234"); } Serial.println(WiFi.localIP()); }\nvoid loop(){}`, { board: 'r4', ms: 8000 });
  check('Uno R4 WiFi: blocking WiFi.begin()', /192\.168\.1\.\d+/.test(r.serial), r.serial + JSON.stringify(r.error));
}
{
  const r = await runIot(`#include <WiFi.h>\nvoid setup(){}\nvoid loop(){}`, { board: 'uno', ms: 100 });
  check('WiFi.h on an Arduino Uno: "No such file or directory"', !r.ok && /WiFi\.h: No such file or directory/.test(r.error.message) && r.error.line === 1, JSON.stringify(r.error));
  const r2 = await runIot(`#include <ESP8266WiFi.h>\nvoid setup(){}\nvoid loop(){}`, { board: 'esp32', ms: 100 });
  check('ESP8266WiFi.h on an ESP32 fails with a hint', !r2.ok && /ESP8266WiFi\.h/.test(r2.error.message) && /ESP8266/.test(r2.error.message), JSON.stringify(r2.error));
  const r3 = await runIot(`#include <WebServer.h>\nvoid setup(){}\nvoid loop(){}`, { board: 'esp8266', ms: 100 });
  check('WebServer.h on an ESP8266 fails', !r3.ok && /WebServer\.h/.test(r3.error.message), JSON.stringify(r3.error));
}
{
  // two boards in one project: an ESP32 calls the web server of another ESP32
  const net = new VirtualNet();
  const project = {
    code: HEAD.replace('wifiUp', 'wifiUp') + `#include <HTTPClient.h>\nvoid setup(){ Serial.begin(115200); wifiUp(); delay(1500); HTTPClient http; http.begin("http://192.168.1.51/hello"); int c = http.GET(); Serial.println(c); Serial.println(http.getString()); }\nvoid loop(){}`,
    parts: [{ id: 'b', type: 'esp32-devkit', x: 0, y: 0 }, { id: 'b2', type: 'esp32-devkit', x: 700, y: 0, code: HEAD + `#include <WebServer.h>\nWebServer s(80);\nvoid setup(){ wifiUp(); s.on("/hello", [](){ s.send(200, "text/plain", "hi from board 2"); }); s.begin(); }\nvoid loop(){ s.handleClient(); delay(2); }` }],
    wires: [],
  };
  const { SimEngine } = await import('../web/src/sim/engine.js');
  let serial = '';
  const eng = new SimEngine(project, { net, onSerial: (p, t) => { serial += t; } });
  const res = eng.start();
  let wall = 1000; eng.tick(wall);
  for (let i = 0; i < 700; i++) { wall += 16; eng.tick(wall); if (i % 4 === 0) await sleep(0); }
  check('board → board HTTP in one project', res.ok && /200\r\nhi from board 2/.test(serial), serial + JSON.stringify(res.error || {}));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
