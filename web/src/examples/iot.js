// IoT examples (1/3): Wi-Fi basics and web servers on the ESP32 / ESP8266 / Uno R4 WiFi. Every sketch is a normal
// Arduino program — WiFi, WebServer, HTTPClient, ArduinoJson — talking to the simulated network. Run it, then open
// the IoT tab: tap the board's address to see its web page, or open the dashboard (devices, router switches …).
import { P, at, W, R, C, rail } from './helpers.js';
import { ESP, NODEMCU, BB, WIFI, hookDown, ledRig, gndTop } from './iot-common.js';

// ------------------------------------------------------------------ 1. hello internet
export function iotHello() {
  const esp = ESP(), bb = BB();
  const led = ledRig(esp, bb, 'D2', 8, 'blue', 'led');
  return {
    id: 'iot-hello', name: 'Wi-Fi Hello — IP & Public IP', category: 'iot', level: 'beginner',
    description: 'Join the Wi-Fi, show the IP address, signal strength and MAC, then ask the internet for your public IP. The LED blinks while connecting and stays on when connected.',
    parts: [bb, esp, ...led.parts],
    wires: [...led.wires, gndTop(esp, bb)],
    code: `// ESP32 Wi-Fi hello: connect, show the IP address, call the internet
#include <WiFi.h>
#include <HTTPClient.h>

${WIFI}const int LED = 2;

void setup() {
  Serial.begin(115200);
  pinMode(LED, OUTPUT);
  Serial.print("Connecting to ");
  Serial.println(WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {      // blink while we wait
    digitalWrite(LED, !digitalRead(LED));
    delay(300);
    Serial.print(".");
  }
  digitalWrite(LED, HIGH);
  Serial.println();
  Serial.println("Connected!");
  Serial.print("IP address : "); Serial.println(WiFi.localIP());
  Serial.print("MAC address: "); Serial.println(WiFi.macAddress());
  Serial.print("Signal     : "); Serial.print(WiFi.RSSI()); Serial.println(" dBm");

  HTTPClient http;                              // ask a web service "what is my public IP?"
  http.begin("http://api.ipify.org");
  int code = http.GET();
  if (code == HTTP_CODE_OK) {
    Serial.print("Public IP  : ");
    Serial.println(http.getString());
  } else {
    Serial.printf("HTTP error %d (%s)\\n", code, HTTPClient::errorToString(code).c_str());
  }
  http.end();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {          // e.g. the router was switched off in the IoT tab
    digitalWrite(LED, LOW);
    Serial.println("Wi-Fi lost — reconnecting...");
    WiFi.reconnect();
    delay(3000);
  }
  delay(500);
}
`,
  };
}

// ------------------------------------------------------------------ 2. web LED
export function iotWebLed() {
  const esp = ESP(), bb = BB();
  const led = ledRig(esp, bb, 'D2', 8, 'green', 'led');
  return {
    id: 'iot-web-led', name: 'Web Page LED Switch', category: 'iot', level: 'beginner',
    description: 'The ESP32 runs a small web server. Open the IoT tab, tap the board\'s address and use the ON / OFF buttons to switch the LED.',
    parts: [bb, esp, ...led.parts],
    wires: [...led.wires, gndTop(esp, bb)],
    code: `// A web page that switches an LED
#include <WiFi.h>
#include <WebServer.h>

${WIFI}const int LED = 2;
WebServer server(80);                 // HTTP port 80
bool ledOn = false;

String page() {
  String html = "<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>";
  html += "<style>body{font-family:sans-serif;text-align:center;margin-top:40px}";
  html += "a.btn{display:inline-block;padding:18px 34px;margin:10px;border-radius:12px;color:#fff;text-decoration:none;font-size:22px}";
  html += ".on{background:#16a34a}.off{background:#dc2626}</style></head><body>";
  html += "<h1>ESP32 LED</h1><h2>The LED is ";
  html += ledOn ? "ON" : "OFF";
  html += "</h2><a class='btn on' href='/on'>Turn ON</a><a class='btn off' href='/off'>Turn OFF</a>";
  html += "</body></html>";
  return html;
}

void handleRoot() { server.send(200, "text/html", page()); }

void handleOn() {
  ledOn = true;
  digitalWrite(LED, HIGH);
  server.sendHeader("Location", "/");       // go back to the main page
  server.send(303);
}

void handleOff() {
  ledOn = false;
  digitalWrite(LED, LOW);
  server.sendHeader("Location", "/");
  server.send(303);
}

void setup() {
  Serial.begin(115200);
  pinMode(LED, OUTPUT);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(300);
  Serial.print("Open http://");
  Serial.println(WiFi.localIP());

  server.on("/", handleRoot);
  server.on("/on", handleOn);
  server.on("/off", handleOff);
  server.begin();
  Serial.println("Web server started");
}

void loop() {
  server.handleClient();                    // answer the browser
}
`,
  };
}

// ------------------------------------------------------------------ 3. DHT web page
export function iotDhtWeb() {
  const esp = ESP();
  const dht = at('dht22', 'VCC', 170, 250, { model: '22' }, 0, 'dht');
  return {
    id: 'iot-dht-web', name: 'Temperature Web Page (DHT22)', category: 'iot', level: 'beginner',
    description: 'A DHT22 sensor and a web server: the page refreshes itself every few seconds, and /api gives the same numbers as JSON for apps. Tap the sensor while running to change the weather.',
    parts: [esp, dht],
    wires: hookDown(esp, dht, [['3V3', 'VCC', C.red], ['D4', 'DATA', C.green], ['GND.2', 'GND', C.black]]),
    code: `// DHT22 + web server (HTML page and JSON API)
#include <WiFi.h>
#include <WebServer.h>
#include "DHT.h"

${WIFI}#define DHTPIN 4
DHT dht(DHTPIN, DHT22);
WebServer server(80);

float lastT = NAN, lastH = NAN;

void readSensor() {
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  if (!isnan(t) && !isnan(h)) { lastT = t; lastH = h; }
}

void handleRoot() {
  String html = "<!DOCTYPE html><html><head><meta http-equiv='refresh' content='3'>";
  html += "<meta name='viewport' content='width=device-width,initial-scale=1'>";
  html += "<style>body{font-family:sans-serif;text-align:center;background:#0f172a;color:#e2e8f0}";
  html += ".card{display:inline-block;margin:14px;padding:22px 34px;border-radius:16px;background:#1e293b}";
  html += ".v{font-size:44px;font-weight:700;color:#38bdf8}</style></head><body>";
  html += "<h1>ESP32 Weather</h1>";
  html += "<div class='card'>Temperature<div class='v'>" + String(lastT, 1) + " &deg;C</div></div>";
  html += "<div class='card'>Humidity<div class='v'>" + String(lastH, 1) + " %</div></div>";
  html += "<p>Updated " + String(millis() / 1000) + " s after boot &middot; <a href='/api'>JSON</a></p>";
  html += "</body></html>";
  server.send(200, "text/html", html);
}

void handleApi() {
  String json = "{\\"temperature\\":" + String(lastT, 1) + ",\\"humidity\\":" + String(lastH, 1) + ",\\"uptime\\":" + String(millis() / 1000) + "}";
  server.send(200, "application/json", json);
}

void setup() {
  Serial.begin(115200);
  dht.begin();
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(300);
  Serial.print("Open http://"); Serial.println(WiFi.localIP());
  server.on("/", handleRoot);
  server.on("/api", handleApi);
  server.begin();
  readSensor();
}

unsigned long lastRead = 0;
void loop() {
  server.handleClient();
  if (millis() - lastRead > 2500) {          // the DHT22 needs 2 s between readings
    lastRead = millis();
    readSensor();
    Serial.printf("T=%.1f C  H=%.1f %%\\n", lastT, lastH);
  }
}
`,
  };
}

// ------------------------------------------------------------------ 4. REST API with ArduinoJson
export function iotRestApi() {
  const esp = ESP(), bb = BB();
  const led = ledRig(esp, bb, 'D2', 8, 'yellow', 'led');
  const servo = at('servo', 'GND', 20, 250, { model: 'sg90' }, 0, 'servo');
  return {
    id: 'iot-rest-api', name: 'REST API with JSON (LED + Servo)', category: 'iot', level: 'intermediate',
    description: 'A tiny REST API: GET /api/status returns JSON, POST /api/led {"on":true} switches the LED, /api/servo?angle=90 moves the servo. The home page is a small app that calls the API with fetch().',
    parts: [bb, esp, ...led.parts, servo],
    wires: [
      ...led.wires, gndTop(esp, bb),
      R(esp, 'D18', servo, 'PWM', C.orange, [270]),
      R(esp, 'GND.2', servo, 'GND', C.black, [290]),
      R(esp, 'VIN', servo, 'V+', C.red, [-20, 170, 300]),
    ],
    code: `// REST API on the ESP32 with ArduinoJson
#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>

${WIFI}const int LED = 2;
WebServer server(80);
Servo servo;
bool ledOn = false;
int angle = 90;

const char PAGE[] PROGMEM = R"rawliteral(
<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:sans-serif;max-width:420px;margin:30px auto;text-align:center}
button{font-size:20px;padding:12px 24px;margin:6px;border-radius:10px;border:0;background:#2563eb;color:#fff}
input{width:90%}</style></head><body>
<h1>ESP32 REST API</h1>
<button onclick="led(true)">LED on</button><button onclick="led(false)">LED off</button>
<p>Servo angle: <b id="a">90</b></p>
<input type="range" min="0" max="180" value="90" oninput="servo(this.value)">
<pre id="out">loading...</pre>
<script>
function show(){ fetch('/api/status').then(r=>r.json()).then(j=>{ out.textContent = JSON.stringify(j,null,2); }); }
function led(on){ fetch('/api/led',{method:'POST',body:JSON.stringify({on:on})}).then(show); }
function servo(v){ a.textContent=v; fetch('/api/servo?angle='+v).then(show); }
show(); setInterval(show, 2000);
</script></body></html>
)rawliteral";

void handleRoot() { server.send(200, "text/html", PAGE); }

void sendStatus() {
  StaticJsonDocument<200> doc;
  doc["led"] = ledOn;
  doc["servo"] = angle;
  doc["uptime"] = millis() / 1000;
  doc["rssi"] = WiFi.RSSI();
  String out;
  serializeJson(doc, out);
  server.send(200, "application/json", out);
}

void handleLed() {
  StaticJsonDocument<100> doc;
  DeserializationError err = deserializeJson(doc, server.arg("plain"));   // the request body
  if (err) {
    server.send(400, "application/json", "{\\"error\\":\\"bad json\\"}");
    return;
  }
  ledOn = doc["on"] | false;
  digitalWrite(LED, ledOn);
  sendStatus();
}

void handleServo() {
  angle = constrain(server.arg("angle").toInt(), 0, 180);
  servo.write(angle);
  sendStatus();
}

void setup() {
  Serial.begin(115200);
  pinMode(LED, OUTPUT);
  servo.attach(18);
  servo.write(angle);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(300);
  Serial.print("API on http://"); Serial.println(WiFi.localIP());
  server.on("/", handleRoot);
  server.on("/api/status", HTTP_GET, sendStatus);
  server.on("/api/led", HTTP_POST, handleLed);
  server.on("/api/servo", HTTP_GET, handleServo);
  server.begin();
}

void loop() { server.handleClient(); }
`,
  };
}

// ------------------------------------------------------------------ 5. access point
export function iotAccessPoint() {
  const esp = ESP(), bb = BB();
  const led = ledRig(esp, bb, 'D2', 8, 'orange', 'led');
  return {
    id: 'iot-access-point', name: 'Access Point + Dimmer Page', category: 'iot', level: 'intermediate',
    description: 'No router needed: the ESP32 creates its own Wi-Fi network ("RaptiAuto-ESP", password 12345678) and serves a page at 192.168.4.1 with a slider that dims the LED (PWM).',
    parts: [bb, esp, ...led.parts],
    wires: [...led.wires, gndTop(esp, bb)],
    code: `// ESP32 as an access point with a brightness slider
#include <WiFi.h>
#include <WebServer.h>

const char* AP_SSID = "RaptiAuto-ESP";
const char* AP_PASS = "12345678";          // at least 8 characters
const int LED = 2;
WebServer server(80);
int level = 0;

void handleRoot() {
  String html = "<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>";
  html += "<style>body{font-family:sans-serif;text-align:center;margin-top:40px}input{width:80%}</style></head><body>";
  html += "<h1>LED dimmer</h1><p>Brightness: <b id='v'>" + String(level) + "</b></p>";
  html += "<input type='range' min='0' max='255' value='" + String(level) + "' oninput='set(this.value)'>";
  html += "<script>function set(x){document.getElementById('v').textContent=x;fetch('/pwm?v='+x);}</script>";
  html += "</body></html>";
  server.send(200, "text/html", html);
}

void handlePwm() {
  level = constrain(server.arg("v").toInt(), 0, 255);
  ledcWrite(LED, level);
  server.send(200, "text/plain", String(level));
}

void setup() {
  Serial.begin(115200);
  ledcAttach(LED, 5000, 8);
  WiFi.mode(WIFI_AP);
  if (!WiFi.softAP(AP_SSID, AP_PASS)) {
    Serial.println("Could not start the access point");
    while (true) delay(1000);
  }
  Serial.print("Access point \\""); Serial.print(AP_SSID); Serial.println("\\" is up");
  Serial.print("Page: http://"); Serial.println(WiFi.softAPIP());
  server.on("/", handleRoot);
  server.on("/pwm", handlePwm);
  server.begin();
}

void loop() { server.handleClient(); }
`,
  };
}

// ------------------------------------------------------------------ 6. wi-fi scanner on OLED
export function iotWifiScanner() {
  const esp = ESP();
  const oled = at('oled-ssd1306', 'GND', 60, 250, { color: 'white', address: '60' }, 0, 'oled');
  return {
    id: 'iot-wifi-scanner', name: 'Wi-Fi Scanner on OLED', category: 'iot', level: 'intermediate',
    description: 'Scan the air for Wi-Fi networks and list them on a 128×64 OLED with signal bars. Switch the router off in the IoT dashboard and the list becomes empty.',
    parts: [esp, oled],
    wires: hookDown(esp, oled, [['D22', 'SCL', C.yellow], ['D21', 'SDA', C.blue], ['3V3', 'VCC', C.red], ['GND.2', 'GND', C.black]]),
    code: `// Wi-Fi scanner with an SSD1306 OLED
#include <WiFi.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

Adafruit_SSD1306 display(128, 64, &Wire, -1);

// 0-4 signal bars from the RSSI
int bars(int rssi) { return rssi > -55 ? 4 : rssi > -65 ? 3 : rssi > -75 ? 2 : rssi > -85 ? 1 : 0; }

void drawBars(int x, int y, int n) {
  for (int i = 0; i < 4; i++) {
    int h = 2 + i * 2;
    if (i < n) display.fillRect(x + i * 3, y + 8 - h, 2, h, SSD1306_WHITE);
    else display.drawFastHLine(x + i * 3, y + 7, 2, SSD1306_WHITE);
  }
}

void scan() {
  display.clearDisplay();
  display.setCursor(0, 0);
  display.print("Scanning...");
  display.display();
  int n = WiFi.scanNetworks();                 // blocks for a couple of seconds
  Serial.printf("%d networks found\\n", n);
  display.clearDisplay();
  display.setCursor(0, 0);
  display.print(n);
  display.print(" networks");
  for (int i = 0; i < n && i < 6; i++) {
    int y = 12 + i * 9;
    String name = WiFi.SSID(i);
    if (name.length() > 14) name = name.substring(0, 14);
    display.setCursor(0, y);
    display.print(name);
    display.setCursor(86, y);
    display.print(WiFi.encryptionType(i) == WIFI_AUTH_OPEN ? " " : "*");
    drawBars(100, y, bars(WiFi.RSSI(i)));
    display.setCursor(114, y);
    display.print(WiFi.channel(i));
    Serial.printf("%2d: %-14s %4d dBm  ch %d  %s\\n", i + 1, WiFi.SSID(i).c_str(), WiFi.RSSI(i), WiFi.channel(i),
                  WiFi.encryptionType(i) == WIFI_AUTH_OPEN ? "open" : "secured");
  }
  display.display();
  WiFi.scanDelete();
}

void setup() {
  Serial.begin(115200);
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) { Serial.println("OLED not found"); for (;;); }
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
}

void loop() {
  scan();
  delay(8000);
}
`,
  };
}

// ------------------------------------------------------------------ 7. bluetooth serial
export function iotBluetoothLed() {
  const esp = ESP(), bb = BB();
  const l1 = ledRig(esp, bb, 'D2', 8, 'blue', 'led');
  const l2 = ledRig(esp, bb, 'D4', 16, 'red', 'led2', 124, C.orange, 20);
  return {
    id: 'iot-bluetooth-led', name: 'Bluetooth Serial LED Control', category: 'iot', level: 'beginner',
    description: 'Control two LEDs from a phone Bluetooth terminal (ESP32 classic Bluetooth SPP). Use the Bluetooth terminal in the IoT dashboard: type  on  off  blink  status.',
    parts: [bb, esp, ...l1.parts, ...l2.parts],
    wires: [...l1.wires, ...l2.wires, gndTop(esp, bb)],
    code: `// Bluetooth Serial: commands from a phone terminal
#include <BluetoothSerial.h>

BluetoothSerial SerialBT;
const int LED1 = 2, LED2 = 4;
bool blinking = false;
unsigned long lastBlink = 0;

void setup() {
  Serial.begin(115200);
  pinMode(LED1, OUTPUT);
  pinMode(LED2, OUTPUT);
  SerialBT.begin("ESP32-RaptiAuto");           // the name your phone sees
  Serial.println("Bluetooth ready — pair with \\"ESP32-RaptiAuto\\"");
}

void loop() {
  if (SerialBT.available()) {
    String cmd = SerialBT.readStringUntil('\\n');
    cmd.trim();
    cmd.toLowerCase();
    Serial.println("Command: " + cmd);
    if (cmd == "on")       { blinking = false; digitalWrite(LED1, HIGH); digitalWrite(LED2, HIGH); SerialBT.println("LEDs ON"); }
    else if (cmd == "off") { blinking = false; digitalWrite(LED1, LOW);  digitalWrite(LED2, LOW);  SerialBT.println("LEDs OFF"); }
    else if (cmd == "blink") { blinking = true; SerialBT.println("Blinking"); }
    else if (cmd == "status") {
      SerialBT.printf("LED1=%d LED2=%d blinking=%d uptime=%lus\\n", digitalRead(LED1), digitalRead(LED2), blinking, millis() / 1000);
    } else SerialBT.println("Unknown command. Try: on off blink status");
  }
  if (blinking && millis() - lastBlink > 400) {
    lastBlink = millis();
    digitalWrite(LED1, !digitalRead(LED1));
    digitalWrite(LED2, !digitalRead(LED1));
  }
}
`,
  };
}

// ------------------------------------------------------------------ 8. ESP8266 relay
export function iotEsp8266Relay() {
  const esp = NODEMCU();
  const relay = at('relay', 'VCC', 130, 380, { trigger: 'high' }, 0, 'relay');
  const lamp = at('lamp', '1', 250, 250, { rating: '12' }, 0, 'lamp');
  const psu = at('power-supply', '-', 330, 250, { voltage: 12 }, 0, 'psu');
  return {
    id: 'iot-esp8266-relay', name: 'NodeMCU Web Relay (ESP8266)', category: 'iot', level: 'intermediate',
    description: 'An ESP8266 NodeMCU serves a page with a big switch; a relay turns a 12 V lamp on and off. The state is also available as plain text at /state for other devices.',
    parts: [esp, relay, lamp, psu],
    wires: [
      R(esp, 'D1', relay, 'IN', C.orange, [400]),
      R(esp, 'GND.4', relay, 'GND', C.black, [410]),
      R(esp, 'VIN', relay, 'VCC', C.red, [-20, 175, 420]),
      R(relay, 'NO', lamp, '1', C.yellow, [280]),
      R(relay, 'COM', psu, '+', C.red, [290]),
      R(lamp, '2', psu, '-', C.black, [270]),
    ],
    code: `// NodeMCU (ESP8266) web relay
#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>

${WIFI}const int RELAY = D1;                  // GPIO5
ESP8266WebServer server(80);
bool lampOn = false;

void setLamp(bool on) {
  lampOn = on;
  digitalWrite(RELAY, on ? HIGH : LOW);
  Serial.println(on ? "Lamp ON" : "Lamp OFF");
}

void handleRoot() {
  String html = "<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>";
  html += "<style>body{font-family:sans-serif;text-align:center;margin-top:50px;background:";
  html += lampOn ? "#fef9c3" : "#1e293b";
  html += ";color:";
  html += lampOn ? "#111" : "#eee";
  html += "}a{display:inline-block;margin-top:20px;padding:20px 50px;border-radius:50px;font-size:26px;color:#fff;text-decoration:none;background:";
  html += lampOn ? "#dc2626" : "#16a34a";
  html += "}</style></head><body><h1>Living-room lamp</h1><h2>";
  html += lampOn ? "ON" : "OFF";
  html += "</h2><a href='/toggle'>";
  html += lampOn ? "Switch OFF" : "Switch ON";
  html += "</a></body></html>";
  server.send(200, "text/html", html);
}

void setup() {
  Serial.begin(115200);
  pinMode(RELAY, OUTPUT);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(300);
  Serial.print("Open http://"); Serial.println(WiFi.localIP());
  Serial.print("Host name: "); Serial.println(WiFi.hostname());

  server.on("/", handleRoot);
  server.on("/toggle", []() {
    setLamp(!lampOn);
    server.sendHeader("Location", "/");
    server.send(303);
  });
  server.on("/state", []() { server.send(200, "text/plain", lampOn ? "1" : "0"); });
  server.begin();
}

void loop() { server.handleClient(); }
`,
  };
}

// ------------------------------------------------------------------ 9. Uno R4 WiFi
export function iotR4Web() {
  const u = P('uno-r4-wifi', 0, 0, {}, 0, 'uno');
  return {
    id: 'iot-r4-web', name: 'Uno R4 WiFi — Web Server & LED Matrix', category: 'iot', level: 'intermediate',
    description: 'The Arduino Uno R4 WiFi (WiFiS3 library) serves a page: pick a picture and it appears on the 12×8 LED matrix; the on-board LED follows the page buttons.',
    parts: [u], wires: [],
    code: `// Arduino Uno R4 WiFi: web server + LED matrix
#include <WiFiS3.h>
#include "ArduinoGraphics.h"
#include "Arduino_LED_Matrix.h"

const char* ssid = "RaptiNet";
const char* pass = "rapti1234";

WiFiServer server(80);
ArduinoLEDMatrix matrix;

const uint32_t heart[] = { 0x3184a444, 0x42081100, 0xa0040000 };
const uint32_t smile[] = { 0x19819, 0x80000001, 0xf8000 };
const uint32_t blank[] = { 0, 0, 0 };

void setup() {
  Serial.begin(115200);
  pinMode(LED_BUILTIN, OUTPUT);
  matrix.begin();
  int status = WL_IDLE_STATUS;
  while (status != WL_CONNECTED) {            // WiFi.begin() waits until it is connected
    Serial.print("Connecting to "); Serial.println(ssid);
    status = WiFi.begin(ssid, pass);
  }
  Serial.print("Open http://"); Serial.println(WiFi.localIP());
  server.begin();
}

void loop() {
  WiFiClient client = server.available();
  if (!client) return;
  String request = "";
  while (client.connected()) {
    if (client.available()) {
      char c = client.read();
      request += c;
      if (c == '\\n' && request.endsWith("\\r\\n\\r\\n")) break;
    }
  }
  if (request.indexOf("GET /heart") >= 0) matrix.loadFrame(heart);
  else if (request.indexOf("GET /smile") >= 0) matrix.loadFrame(smile);
  else if (request.indexOf("GET /clear") >= 0) matrix.loadFrame(blank);
  if (request.indexOf("GET /led/on") >= 0) digitalWrite(LED_BUILTIN, HIGH);
  if (request.indexOf("GET /led/off") >= 0) digitalWrite(LED_BUILTIN, LOW);

  client.println("HTTP/1.1 200 OK");
  client.println("Content-Type: text/html");
  client.println("Connection: close");
  client.println();
  client.println("<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'></head>");
  client.println("<body style='font-family:sans-serif;text-align:center'><h1>Uno R4 WiFi</h1>");
  client.println("<p><a href='/heart'>Heart</a> | <a href='/smile'>Smile</a> | <a href='/clear'>Clear</a></p>");
  client.println("<p><a href='/led/on'>LED on</a> | <a href='/led/off'>LED off</a></p></body></html>");
  client.stop();
}
`,
  };
}
