// IoT examples (3/3): sensors that report over the network — gas leak (MQTT), plant watering (HTTP POST JSON), parking
// sensor (web dashboard), NeoPixel lamp (web colour picker), two ESP32 boards talking over MQTT, WiFiMulti, IP geolocation
// on an OLED and a boot counter kept in flash (Preferences).
import { P, at, plug, W, R, C, rail } from './helpers.js';
import { ESP, BB, WIFI, LCD, lcdWires, hookDown, hookUp, ledRig, gndTop } from './iot-common.js';

// ------------------------------------------------------------------ 1. gas leak → MQTT
export function iotGasMqtt() {
  const esp = ESP(), bb = BB();
  const led = ledRig(esp, bb, 'D2', 8, 'red', 'led');
  const gas = at('gas-sensor', 'VCC', 60, -70, {}, 0, 'gas');
  const buz = at('buzzer', '+', 20, 230, { kind: 'active' }, 0, 'buzzer');
  return {
    id: 'iot-gas-mqtt', name: 'Gas Leak Monitor (MQ sensor + MQTT)', category: 'iot', level: 'intermediate',
    description: 'An MQ gas sensor on an ADC1 pin. The gas level is published to MQTT, and above the limit the buzzer sounds, the LED lights and an alert message is published. Drag the sensor\'s ppm value while running.',
    parts: [bb, esp, ...led.parts, gas, buz],
    wires: [
      ...led.wires, gndTop(esp, bb),
      ...hookUp(esp, gas, [['3V3', 'VCC', C.red], ['D34', 'AO', C.green], ['GND.1', 'GND', C.black]]),
      R(esp, 'D23', buz, '+', C.orange, [200]),
      R(esp, 'GND.2', buz, '-', C.black, [150]),
    ],
    code: `// Gas leak monitor: MQ sensor -> MQTT alert
// (a real MQ-2 module needs 5 V for its heater and a voltage divider on AO — here it runs from 3.3 V)
#include <WiFi.h>
#include <PubSubClient.h>

${WIFI}const char* MQTT_HOST = "broker.hivemq.com";
const int GAS = 34;          // ADC1 channel (ADC2 pins do not work while Wi-Fi is on)
const int LED = 2, BUZZER = 23;
const int LIMIT = 1800;      // raw ADC value (0-4095) that means "gas!"

WiFiClient net;
PubSubClient mqtt(net);
bool alarmOn = false;
unsigned long lastReport = 0;

void connectMqtt() {
  while (!mqtt.connected()) {
    if (mqtt.connect("rapti-gas-sensor")) Serial.println("MQTT connected");
    else delay(1500);
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(LED, OUTPUT);
  pinMode(BUZZER, OUTPUT);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(300);
  mqtt.setServer(MQTT_HOST, 1883);
}

void loop() {
  if (!mqtt.connected()) connectMqtt();
  mqtt.loop();

  int level = analogRead(GAS);
  bool gas = level > LIMIT;
  digitalWrite(LED, gas);
  digitalWrite(BUZZER, gas && (millis() / 250) % 2);   // beeping
  if (gas && !alarmOn) {
    alarmOn = true;
    mqtt.publish("rapti/gas/alert", "GAS LEAK!", true);
    Serial.println("GAS LEAK! level=" + String(level));
  }
  if (!gas && alarmOn) {
    alarmOn = false;
    mqtt.publish("rapti/gas/alert", "air is clean", true);
    Serial.println("Air is clean again");
  }
  if (millis() - lastReport > 3000) {
    lastReport = millis();
    mqtt.publish("rapti/gas/level", String(level).c_str());
    Serial.println("gas level " + String(level));
  }
}
`,
  };
}

// ------------------------------------------------------------------ 2. plant watering → HTTP POST
export function iotSoilPlant() {
  const esp = ESP();
  const soil = at('soil-sensor', 'VCC', 60, -70, {}, 0, 'soil');
  const relay = at('relay', 'VCC', 150, 380, { trigger: 'high' }, 0, 'relay');
  const motor = at('dc-motor', '1', 240, 290, { look: 'fan' }, 0, 'pump');
  return {
    id: 'iot-soil-plant', name: 'Smart Plant Monitor (HTTP POST)', category: 'iot', level: 'advanced',
    description: 'A soil-moisture sensor waters the plant through a relay-driven pump when the soil is dry, and every 10 s posts a JSON report to a web service (httpbin echoes it back). Change the soil moisture while running.',
    parts: [esp, soil, relay, motor],
    wires: [
      ...hookUp(esp, soil, [['3V3', 'VCC', C.red], ['D35', 'AO', C.green], ['GND.1', 'GND', C.black]]),
      R(esp, 'D5', relay, 'IN', C.orange, [400]),
      R(esp, 'GND.2', relay, 'GND', C.black, [410]),
      R(esp, 'VIN', relay, 'VCC', C.red, [-20, 185, 420]),
      R(esp, 'VIN', relay, 'COM', C.red, [-26, 192, 296]),
      R(relay, 'NO', motor, '1', C.yellow, [300]),
      R(motor, '2', relay, 'GND', C.black, [396]),
    ],
    code: `// Plant monitor: soil sensor + pump + HTTP POST of JSON
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

${WIFI}const int SOIL = 35;          // ADC1
const int PUMP = 5;           // relay
const int DRY = 2800;         // raw ADC above this = dry soil (sensor output rises when dry)
const int WET = 1500;

bool pumping = false;
unsigned long lastReport = 0;

int moisturePercent(int raw) {
  return constrain(map(raw, 3300, 800, 0, 100), 0, 100);
}

void report(int raw, int percent) {
  StaticJsonDocument<200> doc;
  doc["device"] = "plant-1";
  doc["moisture"] = percent;
  doc["raw"] = raw;
  doc["pump"] = pumping;
  String body;
  serializeJson(doc, body);

  HTTPClient http;
  http.begin("http://httpbin.org/post");
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(body);
  Serial.printf("POST %s -> %d\\n", body.c_str(), code);
  if (code == 200) {                         // httpbin echoes what it received
    StaticJsonDocument<768> answer;
    if (!deserializeJson(answer, http.getString())) Serial.println(String("  server saw: ") + (const char*)answer["data"]);
  }
  http.end();
}

void setup() {
  Serial.begin(115200);
  pinMode(PUMP, OUTPUT);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(300);
  Serial.println("Plant monitor online");
}

void loop() {
  int raw = analogRead(SOIL);
  int percent = moisturePercent(raw);
  if (!pumping && raw > DRY) { pumping = true; digitalWrite(PUMP, HIGH); Serial.println("Soil is dry -> pump ON"); }
  if (pumping && raw < WET)  { pumping = false; digitalWrite(PUMP, LOW);  Serial.println("Soil is wet -> pump OFF"); }
  if (millis() - lastReport > 10000) {
    lastReport = millis();
    report(raw, percent);
  }
  delay(200);
}
`,
  };
}

// ------------------------------------------------------------------ 3. parking sensor web dashboard
export function iotParkingWeb() {
  const esp = ESP(), bb = BB();
  const us = at('hc-sr04', 'VCC', 60, 250, {}, 0, 'sonar');
  // ECHO is a 5 V signal: a 1 k + 2 k voltage divider brings it down to 3.3 V for the ESP32 pin
  const r1 = plug('resistor', '1', bb, 'e8', { value: 1000 }, 0, 'r1');
  const r2 = plug('resistor', '1', bb, 'd12', { value: 2000 }, 0, 'r2');
  return {
    id: 'iot-parking-web', name: 'Parking Sensor Web Dashboard', category: 'iot', level: 'intermediate',
    description: 'An HC-SR04 ultrasonic sensor measures the distance to the wall; the web page draws a live bar that turns from green to red as you get closer (it polls /distance with fetch). The 5 V ECHO signal goes through a 1 k + 2 k voltage divider — straight into the ESP32 pin it would burn it. Move the obstacle while running.',
    parts: [bb, esp, us, r1, r2],
    wires: [
      R(esp, 'D5', us, 'TRIG', C.green, [280]),
      R(us, 'ECHO', bb, 'a8', C.yellow, [300, 195, 28]),
      R(esp, 'D18', bb, 'a12', C.orange, [120, 190, 22]),
      W(bb, 'a16', bb, rail(bb, 'tn', 16), C.black),
      gndTop(esp, bb),
      R(esp, 'GND.2', us, 'GND', C.black, [320]),
      R(esp, 'VIN', us, 'VCC', C.red, [-20, 170, 330]),
    ],
    code: `// Ultrasonic distance + live web dashboard
#include <WiFi.h>
#include <WebServer.h>

${WIFI}const int TRIG = 5, ECHO = 18;
WebServer server(80);
float distanceCm = 0;

float measure() {
  digitalWrite(TRIG, LOW);  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH); delayMicroseconds(10);
  digitalWrite(TRIG, LOW);
  long us = pulseIn(ECHO, HIGH, 30000);
  return us ? us * 0.0343 / 2 : -1;          // cm, -1 = nothing in range
}

const char PAGE[] PROGMEM = R"rawliteral(
<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:sans-serif;text-align:center;background:#111827;color:#f9fafb}
#track{width:80%;height:46px;margin:30px auto;background:#374151;border-radius:23px;overflow:hidden}
#bar{height:100%;width:0;background:#22c55e;transition:width .3s,background .3s}
#cm{font-size:56px;font-weight:700}</style></head><body>
<h1>Parking assistant</h1><div id="cm">--</div><div>centimetres to the wall</div>
<div id="track"><div id="bar"></div></div><p id="msg"></p>
<script>
function tick(){ fetch('/distance').then(r=>r.json()).then(j=>{
  var d=j.cm; cm.textContent = d<0 ? '--' : d.toFixed(0);
  var pct = d<0 ? 0 : Math.max(0, Math.min(100, 100 - d/2)); bar.style.width = pct + '%';
  bar.style.background = d<0||d>100 ? '#22c55e' : d>40 ? '#eab308' : '#ef4444';
  msg.textContent = d<0 ? 'No object' : d>100 ? 'Plenty of room' : d>40 ? 'Slow down' : 'STOP!';
}); }
tick(); setInterval(tick, 500);
</script></body></html>
)rawliteral";

void setup() {
  Serial.begin(115200);
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(300);
  Serial.print("Dashboard: http://"); Serial.println(WiFi.localIP());
  server.on("/", []() { server.send(200, "text/html", PAGE); });
  server.on("/distance", []() {
    server.send(200, "application/json", "{\\"cm\\":" + String(distanceCm, 1) + "}");
  });
  server.begin();
}

unsigned long last = 0;
void loop() {
  server.handleClient();
  if (millis() - last > 200) { last = millis(); distanceCm = measure(); }
}
`,
  };
}

// ------------------------------------------------------------------ 4. NeoPixel colour picker
export function iotNeopixelWeb() {
  const esp = ESP();
  const ring = at('neopixel', 'GND', 170, 250, { layout: 'ring16' }, 0, 'ring');
  return {
    id: 'iot-neopixel-web', name: 'Web Colour Picker — NeoPixel Lamp', category: 'iot', level: 'intermediate',
    description: 'A 16-LED NeoPixel ring is the lamp. The web page has a colour picker and brightness slider; presets run animations (rainbow, chase). Pick a colour in the IoT tab and watch the ring.',
    parts: [esp, ring],
    wires: [
      R(esp, 'D18', ring, 'DIN', C.green, [270]),
      R(esp, 'GND.2', ring, 'GND', C.black, [290]),
      R(esp, 'VIN', ring, 'VCC', C.red, [-20, 160, 280]),
    ],
    code: `// NeoPixel lamp with a web colour picker
#include <WiFi.h>
#include <WebServer.h>
#include <Adafruit_NeoPixel.h>

${WIFI}const int PIN = 18, COUNT = 16;
Adafruit_NeoPixel ring(COUNT, PIN, NEO_GRB + NEO_KHZ800);
WebServer server(80);

uint32_t color = 0x3366FF;
int brightness = 120;
String mode = "solid";
int step = 0;

const char PAGE[] PROGMEM = R"rawliteral(
<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:sans-serif;text-align:center;background:#0f172a;color:#e2e8f0}
button{font-size:18px;padding:10px 18px;margin:5px;border-radius:10px;border:0;background:#334155;color:#fff}
input[type=color]{width:140px;height:80px;border:0;background:none}</style></head><body>
<h1>RGB Lamp</h1>
<input type="color" id="c" value="#3366ff" onchange="send('/color?hex='+this.value.substring(1))"><br>
Brightness <input type="range" min="5" max="255" value="120" oninput="send('/bright?v='+this.value)"><br>
<button onclick="send('/mode?m=solid')">Solid</button><button onclick="send('/mode?m=rainbow')">Rainbow</button>
<button onclick="send('/mode?m=chase')">Chase</button><button onclick="send('/mode?m=off')">Off</button>
<p id="s"></p>
<script>function send(u){ fetch(u).then(r=>r.text()).then(t=>{ s.textContent=t; }); }</script>
</body></html>
)rawliteral";

void apply() {
  ring.setBrightness(brightness);
  if (mode == "off") ring.clear();
  else if (mode == "solid") for (int i = 0; i < COUNT; i++) ring.setPixelColor(i, color);
  ring.show();
}

void animate() {
  if (mode == "rainbow") {
    for (int i = 0; i < COUNT; i++) ring.setPixelColor(i, ring.ColorHSV((step * 700 + i * 65536L / COUNT) & 0xFFFF));
    ring.show();
  } else if (mode == "chase") {
    ring.clear();
    for (int k = 0; k < 4; k++) ring.setPixelColor((step + k) % COUNT, color);
    ring.show();
  }
  step++;
}

void setup() {
  Serial.begin(115200);
  ring.begin();
  apply();
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(300);
  Serial.print("Lamp page: http://"); Serial.println(WiFi.localIP());
  server.on("/", []() { server.send(200, "text/html", PAGE); });
  server.on("/color", []() {
    color = strtol(server.arg("hex").c_str(), NULL, 16);
    mode = "solid"; apply();
    server.send(200, "text/plain", "colour #" + server.arg("hex"));
  });
  server.on("/bright", []() { brightness = server.arg("v").toInt(); apply(); server.send(200, "text/plain", "brightness " + String(brightness)); });
  server.on("/mode", []() { mode = server.arg("m"); apply(); server.send(200, "text/plain", "mode " + mode); });
  server.begin();
}

unsigned long last = 0;
void loop() {
  server.handleClient();
  if (mode != "solid" && mode != "off" && millis() - last > 60) { last = millis(); animate(); }
}
`,
  };
}

// ------------------------------------------------------------------ 5. two ESP32 boards over MQTT
export function iotTwoBoardsMqtt() {
  const a = P('esp32-devkit', 0, 0, {}, 0, 'node');
  a.title = 'Sensor node';
  const b = P('esp32-devkit', 480, 0, {}, 0, 'display');
  b.title = 'Display node';
  const dht = at('dht22', 'VCC', 170, 250, { model: '22' }, 0, 'dht');
  const lcd = LCD(500, 200);
  b.code = DISPLAY_NODE;
  return {
    id: 'iot-two-boards-mqtt', name: 'Two ESP32 Boards over MQTT', category: 'iot', level: 'advanced',
    description: 'Board 1 reads a DHT22 and publishes the values to MQTT; board 2 (its own sketch: tap its tab in the Code view) subscribes and shows them on an LCD. They only know each other through the broker — just like real IoT devices.',
    parts: [a, b, dht, lcd],
    wires: [
      ...hookDown(a, dht, [['3V3', 'VCC', C.red], ['D4', 'DATA', C.green], ['GND.2', 'GND', C.black]]),
      ...lcdWires(b, lcd, 480),
    ],
    code: `// Board 1 — sensor node: DHT22 -> MQTT
#include <WiFi.h>
#include <PubSubClient.h>
#include "DHT.h"

${WIFI}DHT dht(4, DHT22);
WiFiClient net;
PubSubClient mqtt(net);
unsigned long last = 0;

void setup() {
  Serial.begin(115200);
  dht.begin();
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(300);
  mqtt.setServer("broker.hivemq.com", 1883);
}

void loop() {
  while (!mqtt.connected()) { if (!mqtt.connect("rapti-sensor-node")) delay(1000); }
  mqtt.loop();
  if (millis() - last > 4000) {
    last = millis();
    float t = dht.readTemperature(), h = dht.readHumidity();
    if (isnan(t) || isnan(h)) return;
    char msg[32];
    snprintf(msg, sizeof(msg), "%.1f,%.1f", t, h);
    mqtt.publish("rapti/node1/climate", msg);
    Serial.print("published "); Serial.println(msg);
  }
}
`,
  };
}

const DISPLAY_NODE = `// Board 2 — display node: MQTT -> LCD
#include <WiFi.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

${WIFI}LiquidCrystal_I2C lcd(0x27, 16, 2);
WiFiClient net;
PubSubClient mqtt(net);
unsigned long lastMsg = 0;

void onMessage(char* topic, byte* payload, unsigned int length) {
  String msg;
  for (unsigned int i = 0; i < length; i++) msg += (char)payload[i];
  int comma = msg.indexOf(',');
  if (comma < 0) return;
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print("Temp: " + msg.substring(0, comma) + " C");
  lcd.setCursor(0, 1); lcd.print("Hum : " + msg.substring(comma + 1) + " %");
  lastMsg = millis();
  Serial.println("Got " + msg);
}

void setup() {
  Serial.begin(115200);
  lcd.init();
  lcd.backlight();
  lcd.print("Waiting for");
  lcd.setCursor(0, 1);
  lcd.print("sensor node...");
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(300);
  mqtt.setServer("broker.hivemq.com", 1883);
  mqtt.setCallback(onMessage);
}

void loop() {
  while (!mqtt.connected()) {
    if (mqtt.connect("rapti-display-node")) mqtt.subscribe("rapti/node1/climate");
    else delay(1000);
  }
  mqtt.loop();
  if (lastMsg && millis() - lastMsg > 15000) {      // the sensor node went quiet
    lcd.clear(); lcd.print("Sensor offline!");
    lastMsg = 0;
  }
}
`;

// ------------------------------------------------------------------ 6. WiFiMulti
export function iotWifiMulti() {
  const esp = ESP(), bb = BB();
  const led = ledRig(esp, bb, 'D2', 8, 'blue', 'led');
  return {
    id: 'iot-wifi-multi', name: 'WiFiMulti — Pick the Best Network', category: 'iot', level: 'intermediate',
    description: 'Give the ESP32 several networks and it connects to the strongest one that is in range (try switching the router off, or the "Strict Wi-Fi" mode in the dashboard). The LED shows the state: slow blink = searching, solid = connected.',
    parts: [bb, esp, ...led.parts],
    wires: [...led.wires, gndTop(esp, bb)],
    code: `// WiFiMulti: several networks, the strongest wins
#include <WiFi.h>
#include <WiFiMulti.h>

WiFiMulti wifiMulti;
const int LED = 2;

void setup() {
  Serial.begin(115200);
  pinMode(LED, OUTPUT);
  wifiMulti.addAP("Office-5G", "admin1234");        // known networks, any order
  wifiMulti.addAP("Home-WiFi", "12345678");
  wifiMulti.addAP("RAPTI-Lab", "password123");
  wifiMulti.addAP("NotInRange", "whatever1");
  Serial.println("Looking for a network...");
}

unsigned long lastBlink = 0;
void loop() {
  if (wifiMulti.run() == WL_CONNECTED) {            // reconnects by itself if the link drops
    static bool announced = false;
    if (!announced) {
      announced = true;
      Serial.print("Connected to "); Serial.print(WiFi.SSID());
      Serial.print("  IP "); Serial.print(WiFi.localIP());
      Serial.print("  signal "); Serial.print(WiFi.RSSI()); Serial.println(" dBm");
    }
    digitalWrite(LED, HIGH);
  } else {
    if (millis() - lastBlink > 800) { lastBlink = millis(); digitalWrite(LED, !digitalRead(LED)); }
    Serial.println("No network yet...");
    delay(500);
  }
}
`,
  };
}

// ------------------------------------------------------------------ 7. IP geolocation on OLED
export function iotIpLocation() {
  const esp = ESP();
  const oled = at('oled-ssd1306', 'GND', 60, 250, { color: 'white', address: '60' }, 0, 'oled');
  return {
    id: 'iot-ip-location', name: 'Where Am I? IP Geolocation on OLED', category: 'iot', level: 'intermediate',
    description: 'Asks a web service where your public IP is located (JSON), then the local time of that place, and draws the city, country and clock on an OLED.',
    parts: [esp, oled],
    wires: hookDown(esp, oled, [['D22', 'SCL', C.yellow], ['D21', 'SDA', C.blue], ['3V3', 'VCC', C.red], ['GND.2', 'GND', C.black]]),
    code: `// IP geolocation + world time on an OLED
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

${WIFI}Adafruit_SSD1306 display(128, 64, &Wire, -1);

String city, country, zone, timeText;
float lat, lon;

bool getJson(const char* url, JsonDocument &doc) {
  HTTPClient http;
  http.begin(url);
  int code = http.GET();
  if (code != HTTP_CODE_OK) { Serial.printf("%s -> HTTP %d\\n", url, code); http.end(); return false; }
  DeserializationError err = deserializeJson(doc, http.getString());
  http.end();
  return !err;
}

void draw() {
  display.clearDisplay();
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println("You are in:");
  display.setTextSize(2);
  display.setCursor(0, 12);
  display.println(city);
  display.setTextSize(1);
  display.println(country);
  display.print(lat, 2); display.print(", "); display.println(lon, 2);
  display.println(zone);
  display.setCursor(0, 56);
  display.print(timeText);
  display.display();
}

void setup() {
  Serial.begin(115200);
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  display.setTextColor(SSD1306_WHITE);
  display.clearDisplay();
  display.setCursor(0, 0);
  display.print("Connecting...");
  display.display();
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(300);

  StaticJsonDocument<512> geo;
  if (getJson("http://ip-api.com/json", geo)) {
    city = (const char*)geo["city"];
    country = (const char*)geo["country"];
    zone = (const char*)geo["timezone"];
    lat = geo["lat"];
    lon = geo["lon"];
    Serial.println(city + ", " + country + "  (" + zone + ")");
  }
}

void loop() {
  StaticJsonDocument<512> t;
  String url = "http://worldtimeapi.org/api/timezone/" + zone;
  if (zone.length() && getJson(url.c_str(), t)) {
    String dt = (const char*)t["datetime"];          // 2025-05-17T14:03:22.123456+06:00
    timeText = dt.substring(0, 10) + " " + dt.substring(11, 19);
    Serial.println(timeText);
  }
  draw();
  delay(5000);
}
`,
  };
}

// ------------------------------------------------------------------ 8. Preferences boot counter
export function iotPrefsCounter() {
  const esp = ESP(), bb = BB();
  const led = ledRig(esp, bb, 'D2', 8, 'purple', 'led');
  return {
    id: 'iot-prefs-counter', name: 'Boot Counter in Flash (Preferences)', category: 'iot', level: 'intermediate',
    description: 'The ESP32 keeps small values in flash memory (Preferences / NVS). It counts how often it starts, stores a name, and serves both on a web page — stop and run again: the counter goes up, the data survives.',
    parts: [bb, esp, ...led.parts],
    wires: [...led.wires, gndTop(esp, bb)],
    code: `// Preferences (NVS): values that survive a reboot
#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>

${WIFI}Preferences prefs;
WebServer server(80);
unsigned int boots;
String owner;

void handleRoot() {
  String html = "<!DOCTYPE html><html><body style='font-family:sans-serif;text-align:center;margin-top:40px'>";
  html += "<h1>Hello " + owner + "!</h1>";
  html += "<p>This board has started <b>" + String(boots) + "</b> time(s).</p>";
  html += "<form action='/name'>New name: <input name='n'><button>Save</button></form>";
  html += "<p><a href='/reset'>Reset the counter</a></p></body></html>";
  server.send(200, "text/html", html);
}

void setup() {
  Serial.begin(115200);
  pinMode(2, OUTPUT);
  prefs.begin("rapti", false);                     // namespace "rapti", read/write
  boots = prefs.getUInt("boots", 0) + 1;
  prefs.putUInt("boots", boots);
  owner = prefs.getString("owner", "maker");
  Serial.printf("Boot #%u, owner = %s\\n", boots, owner.c_str());
  for (unsigned int i = 0; i < boots && i < 10; i++) { digitalWrite(2, HIGH); delay(150); digitalWrite(2, LOW); delay(150); }   // blink once per boot

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(300);
  Serial.print("Open http://"); Serial.println(WiFi.localIP());
  server.on("/", handleRoot);
  server.on("/name", []() {
    owner = server.arg("n");
    prefs.putString("owner", owner);
    server.sendHeader("Location", "/");
    server.send(303);
  });
  server.on("/reset", []() {
    prefs.putUInt("boots", 0);
    boots = 0;
    server.sendHeader("Location", "/");
    server.send(303);
  });
  server.begin();
}

void loop() { server.handleClient(); }
`,
  };
}
