import * as E from './art-ard-ext.js';
import { note, tip, warn, tryIt, steps, ul, table, code as codeRaw, project, openArd } from '../helpers.js';

// A code listing with no extra newline between the numbered lines (the lines are blocks already).
const code = (...a) => codeRaw(...a).replace(/<\/span>\n<span class="ln/g, '</span><span class="ln');
const hero = (figure, text) => `<div class="mx-ard-hero">${figure}<p class="mx-ard-promise">${text}</p></div>`;

export default {
  id: 'ard-iot', no: 'A7', title: 'IoT, Wi-Fi and master–slave', icon: 'wifi',
  blurb: 'ESP32, ESP8266 and Uno R4 WiFi on the simulated network: the IoT tab, web servers, MQTT and cloud services, live data from the internet, and several boards in one project.',
  sections: [
    {
      id: 'iot-start', title: 'Wi-Fi boards and the IoT tab',
      html: `
${hero(E.iotHero(), 'IoT means "Internet of Things": small boards that talk over a network. The lab has a whole simulated network, so a web server, an MQTT light or a weather display works without any real hardware.')}
<p>Three boards of the lab have Wi-Fi. Add one of them (or open an example from <b>Examples → IoT &amp; Wi-Fi</b>) and the <b>IoT</b> tab appears in the tab bar. With any other board the tab stays hidden.</p>
${E.iotGate()}
${table(['Board', 'Chip', 'Logic', 'Wi-Fi libraries to include'], [
  ['<b>ESP32 DevKit V1</b>', 'ESP32-WROOM-32, 240 MHz, 2 cores, Wi-Fi + Bluetooth', '3.3 V', '<code>WiFi.h</code>, <code>WebServer.h</code>, <code>HTTPClient.h</code>, <code>PubSubClient.h</code>'],
  ['<b>NodeMCU ESP8266</b>', 'ESP-12E, 80 MHz, Wi-Fi', '3.3 V', '<code>ESP8266WiFi.h</code>, <code>ESP8266WebServer.h</code>, <code>ESP8266HTTPClient.h</code>'],
  ['<b>Arduino Uno R4 WiFi</b>', 'Renesas RA4M1 + ESP32-S3, 12 × 8 LED matrix', '5 V', '<code>WiFiS3.h</code>, <code>WiFiServer</code>'],
])}
${warn('Include the right library for the board. <code>#include &lt;WiFi.h&gt;</code> on an Uno stops with <i>fatal error: WiFi.h: No such file or directory</i>; <code>ESP8266WiFi.h</code> on an ESP32 says the ESP32 uses the library without "ESP8266" in its name. The messages are the same you would get in the real IDE.')}
<h3>The network, step by step</h3>
${E.netStep(1)}
${E.netStep(2)}
${E.netStep(3)}
${E.netStep(4)}
<h3>The IoT tab</h3>
<p>The IoT tab is a <b>phone on the same Wi-Fi as your board</b>. It is a small web browser:</p>
${E.iotTab()}
${ul(
  'The <b>chips</b> at the top list the Wi-Fi network and every board that has joined it with its address. A button for each web server the board runs opens it (for example <code>192.168.1.50</code>, or <code>esp32.local</code> when the sketch sets a name).',
  'The <b>bookmarks</b> open the <b>Dashboard</b> (devices, MQTT, ThingSpeak, Blynk, Telegram — section 5), a weather page, ThingSpeak, the docs and the start page.',
  'You can type any address in the bar. A word without a dot is a search.',
  'A small dot on the IoT tab tells you when a board has started a web server while you were looking at another tab.')}
${tryIt('Open <b>Wi-Fi Hello</b> and press Run. Open the Serial tab: the board prints its IP address after a second or two. Then open the IoT tab and see the same address in the chips.')}
${openArd('iot-hello', 'Open: Wi-Fi Hello — IP &amp; Public IP')}`,
    },
    {
      id: 'iot-join', title: 'Joining the Wi-Fi',
      html: `
${E.wifiSteps()}
${code(`#include <WiFi.h>

const char* SSID = "RaptiNet";        // the simulated router
const char* PASS = "rapti1234";

void setup() {
  Serial.begin(115200);
  WiFi.begin(SSID, PASS);
  Serial.print("Connecting");
  while (WiFi.status() != WL_CONNECTED) {
    delay(300);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());
  Serial.print("Signal: ");
  Serial.print(WiFi.RSSI());
  Serial.println(" dBm");
}

void loop() { }`, 'c', { mark: [8, 10, 17], numbers: true })}
<p>On a <b>NodeMCU</b> change the first line to <code>#include &lt;ESP8266WiFi.h&gt;</code>; on an <b>Uno R4 WiFi</b> to <code>#include &lt;WiFiS3.h&gt;</code>. The rest is the same.</p>
<h3>The networks in range</h3>
${E.wifiNetworks()}
${ul(
  '<b>Known network, right password</b>: connected.',
  '<b>Known network, wrong password</b>: the join fails (status 4). An open network ("Guest", "Wokwi-GUEST") needs an empty password.',
  '<b>Any other name</b>: works too, as long as the password is empty or has <b>at least 8 characters</b> — the rule a real WPA2 network has. Switch <b>Strict Wi-Fi</b> on in the dashboard and an unknown name fails.',
  'A join takes about <b>1 to 2 seconds</b> of simulated time. A join that fails takes 3.5 seconds, then the status says why.',
  'The first board gets <code>192.168.1.50</code>, the next <code>192.168.1.51</code> and so on.')}
${E.wlStatus()}
${table(['Message in the ⚠ list', 'Cause'], [
  ['<code>WiFi: could not join "X" — Wrong password for "RaptiNet"</code>', 'The password does not match the network.'],
  ['<code>… "Guest" is an open network</code>', 'You gave a password to an open network.'],
  ['<code>… the router is switched off</code>', 'The Router switch of the dashboard is off.'],
  ['<code>… A WPA2 password needs at least 8 characters</code>', 'A password of 1 – 7 characters on an unknown network.'],
  ['<code>… No Wi-Fi network called "X". Networks here: …</code>', 'Strict Wi-Fi is on and the name is not one of the six.'],
])}
${tip('Keep <code>WiFi.status() == WL_CONNECTED</code> in the <code>loop()</code> too. If someone switches the router off, the status becomes <b>5</b> (connection lost); call <code>WiFi.reconnect()</code> and the board comes back when the router does.')}
<h3>Which networks are around?</h3>
<p><code>WiFi.scanNetworks()</code> lists the six networks above with their signal strength. The example below shows them on an OLED.</p>
${openArd('iot-wifi-scanner', 'Open: Wi-Fi Scanner on OLED')}`,
    },
    {
      id: 'iot-web', title: 'A web server on your board',
      html: `
<p>A <b>web server</b> waits for a browser to ask for a page and answers with HTML. On the ESP32 it is only a few lines: you list the addresses (the <b>paths</b>) and write a small function for each.</p>
${E.requestSeq()}
${code(`#include <WiFi.h>
#include <WebServer.h>

WebServer server(80);                  // port 80 = the usual web port
const int LED = 2;
bool ledOn = false;

void handleRoot() {
  String html = "<h1>ESP32 LED</h1><p>The LED is ";
  html += ledOn ? "ON" : "OFF";
  html += "</p><a href='/on'>Turn ON</a> <a href='/off'>Turn OFF</a>";
  server.send(200, "text/html", html);
}

void handleOn() {
  ledOn = true;
  digitalWrite(LED, HIGH);
  server.sendHeader("Location", "/");  // go back to the main page
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
  WiFi.begin("RaptiNet", "rapti1234");
  while (WiFi.status() != WL_CONNECTED) delay(300);
  Serial.print("Open http://");
  Serial.println(WiFi.localIP());

  server.on("/", handleRoot);          // path → function
  server.on("/on", handleOn);
  server.on("/off", handleOff);
  server.begin();
}

void loop() {
  server.handleClient();               // answer the browser — call it often!
}`, 'c', { mark: [4, 40, 41, 42, 43, 47], numbers: true })}
${E.urlAnatomy()}
${ul(
  '<b>Run it</b>, open the IoT tab and tap the address in the chips. The page with two buttons appears. Tap <i>Turn ON</i>: the LED lights.',
  '<code>server.on(path, function)</code> registers a handler. <code>server.send(code, type, text)</code> answers. <code>server.arg("name")</code> reads a value after the <b>?</b> of the address.',
  'Code <b>200</b> means OK; <b>303</b> with a <code>Location</code> header sends the browser to another page; <b>404</b> means not found.',
  'A name instead of a number: <code>MDNS.begin("esp32");</code> (include <code>ESPmDNS.h</code>) and the board answers to <code>http://esp32.local/</code>.',
  'A handler that forgets <code>server.send()</code> gives an empty page — the app warns you. The board answers only while <b>loop()</b> calls <code>server.handleClient()</code>; a long <code>delay()</code> makes the page slow.')}
<h3>When the page does not open</h3>
<p>The browser shows the same pages a real one would:</p>
${table(['Page says', 'Meaning', 'Check'], [
  ['<code>ERR_CONNECTION_REFUSED</code>', 'The board is there, but nothing listens on that port.', '<code>server.begin()</code> missing? Wrong port?'],
  ['<code>ERR_TIMED_OUT</code>', 'The server did not answer in time.', 'Is <code>server.handleClient()</code> running in <code>loop()</code>?'],
  ['<code>ERR_ADDRESS_UNREACHABLE</code>', 'No board has that address, or it has no Wi-Fi.', 'Is the sketch running and connected? Is the address typed right?'],
  ['<code>ERR_INTERNET_DISCONNECTED</code>', 'The router (or the internet) is off.', 'The dashboard switches.'],
  ['<code>ERR_NAME_NOT_RESOLVED</code>', 'The name does not exist.', 'Spelling; <code>.local</code> names need <code>MDNS.begin()</code>.'],
])}
<h3>Pages that show data</h3>
<p>A page can also show a sensor. The <b>DHT22 web page</b> refreshes itself every few seconds, and <code>/api</code> gives the same numbers as JSON for apps. The <b>REST API</b> example goes further: a page with buttons and a slider that talk to the board with <code>fetch()</code>, and a server that answers in JSON.</p>
${openArd('iot-web-led', 'Open: Web Page LED Switch')}
${openArd('iot-dht-web', 'Open: Temperature Web Page (DHT22)')}
${openArd('iot-rest-api', 'Open: REST API with JSON (LED + Servo)')}
${openArd('iot-esp8266-relay', 'Open: NodeMCU Web Relay (ESP8266)')}
${openArd('iot-r4-web', 'Open: Uno R4 WiFi — Web Server &amp; LED Matrix')}`,
    },
    {
      id: 'iot-net', title: 'The simulated network and the real internet',
      html: `
<p>Open the <b>Dashboard</b> bookmark of the IoT tab (<code>http://dashboard.rapti.net/</code>). It is the "cloud" side of the lab: it shows the devices, the HTTP requests, MQTT topics, ThingSpeak charts, Blynk pins and Telegram messages, and it has four switches:</p>
${E.dashSwitches()}
${E.routeFlow()}
<h3>Real internet or simulated?</h3>
<p>By default the simulator imitates the internet. When the phone is online and <b>Settings → Real internet</b> is on (the dashboard has the same switch), requests for weather, time, prices, web pages and so on go out for <b>real</b>. The sketch cannot tell the difference — the same <code>HTTPClient</code> code works with both.</p>
${E.liveVsSim()}
${ul(
  'In the <b>Android app</b> the request is made by the phone itself, so any site works. In a desktop <b>browser</b> only sites that allow it (CORS) answer.',
  'When a real request fails (offline, slow, a busy server), the <b>simulated</b> service answers in the same format — the weather even with the real weather when it is known. Nothing ever stops the sketch for that.',
  'Services that need <b>your own account</b> (ThingSpeak, Blynk, Telegram, IFTTT, webhooks) are never sent for real. Their data stays in the lab and shows in the dashboard.',
  '<b>HTTPS</b>: <code>WiFiClientSecure</code> must call <code>client.setInsecure();</code> first, otherwise the app warns that the certificate cannot be verified — exactly what a real ESP32 does.')}
${warn('A sketch that asks a real server too often can be blocked by that server. Ask once every few minutes, not every second — the examples use 10 minutes for data that changes once an hour.')}
${tryIt('Run <b>Wi-Fi Hello</b>. In the dashboard switch <b>Router</b> off, wait a moment and read the Serial Monitor: "Wi-Fi lost — reconnecting…". Switch it on again. How long until the board is back?')}
${openArd('iot-hello', 'Open: Wi-Fi Hello — IP &amp; Public IP')}`,
    },
    {
      id: 'iot-mqtt', title: 'MQTT and cloud services',
      html: `
<h3>MQTT: messages with topics</h3>
<p><b>MQTT</b> is the language of smart homes. Nobody calls anybody: a board <b>publishes</b> a message to a <b>topic</b>, and every board that has <b>subscribed</b> to that topic gets it. A server in the middle, the <b>broker</b>, passes the messages on.</p>
${E.mqttPubSub()}
${E.mqttTopics()}
${ul(
  'The lab has a broker for every public address: <code>broker.hivemq.com</code>, <code>test.mosquitto.org</code>, <code>mqtt.eclipseprojects.io</code>, <code>broker.emqx.io</code>, <code>mqtt.rapti.net</code>, <code>io.adafruit.com</code> and <code>public.mqtthq.com</code>. Everybody on the same broker shares the same topics.',
  'Port 1883 (and 8883, plus a few web ports) works. A <b>retained</b> message is kept by the broker and handed to every new subscriber at once; a <b>last will</b> is sent when a board disappears.',
  '<code>PubSubClient</code> has a default buffer of <b>256 bytes</b>. A bigger message is not sent and the app tells you to call <code>setBufferSize()</code>.')}
${code(`#include <WiFi.h>
#include <PubSubClient.h>

WiFiClient net;
PubSubClient mqtt(net);

void onMessage(char* topic, byte* payload, unsigned int length) {
  String msg;
  for (unsigned int i = 0; i < length; i++) msg += (char)payload[i];
  Serial.print(topic); Serial.print(" = "); Serial.println(msg);
  if (msg == "ON")  digitalWrite(2, HIGH);
  if (msg == "OFF") digitalWrite(2, LOW);
}

void setup() {
  Serial.begin(115200);
  pinMode(2, OUTPUT);
  WiFi.begin("RaptiNet", "rapti1234");
  while (WiFi.status() != WL_CONNECTED) delay(300);
  mqtt.setServer("broker.hivemq.com", 1883);
  mqtt.setCallback(onMessage);         // what to do when a message arrives
}

unsigned long last = 0;

void loop() {
  if (!mqtt.connected()) {
    if (mqtt.connect("my-esp32")) mqtt.subscribe("rapti/demo/cmd");
    else delay(1000);
  }
  mqtt.loop();                         // receive messages, keep the link alive

  if (millis() - last > 5000) {
    last = millis();
    mqtt.publish("rapti/demo/temp", "24.5");
  }
}`, 'c', { mark: [6, 22, 28, 29, 33], numbers: true })}
<p>Run this, open the dashboard and look at the <b>MQTT</b> card: the topic <code>rapti/demo/temp</code> appears. Type <code>ON</code> in the payload box (the topic <code>rapti/demo/cmd</code> is already filled in) and tap <b>Publish</b>: the LED on pin 2 lights.</p>
${E.dashMqtt()}
<h3>Cloud services of the lab</h3>
<p>Each of these has an example. Run it, then open the dashboard to see the other side:</p>
${table(['Service', 'What it is', 'See it in the dashboard', 'Example'], [
  ['<b>MQTT</b>', 'publish / subscribe messages', 'MQTT card with a publish box', 'MQTT Smart Light · MQTT Sensor Node'],
  ['<b>ThingSpeak</b>', 'a data logger with charts', 'ThingSpeak card: a chart per field', 'ThingSpeak Data Logger'],
  ['<b>Blynk</b>', 'virtual pins for a phone app', 'Blynk card: change a pin and the board reacts', 'Blynk Smart Home'],
  ['<b>Telegram</b>', 'a chat bot', 'Notifications and chat: send a message to the bot', 'Telegram Security Alarm (PIR)'],
  ['<b>IFTTT / webhooks</b>', 'a trigger that starts an action', 'Notifications list', 'Door Alarm → IFTTT Webhook'],
  ['<b>NTP</b>', 'the time of day from the internet', 'the clock on the LCD', 'Internet Clock (NTP) on LCD'],
  ['<b>Bluetooth serial</b>', 'text to a phone over Bluetooth', 'Bluetooth terminal: type to send text to the board', 'Bluetooth Serial LED Control'],
])}
${openArd('iot-mqtt-light', 'Open: MQTT Smart Light')}
${openArd('iot-mqtt-dht', 'Open: MQTT Sensor Node (JSON + Last Will)')}
${openArd('iot-thingspeak', 'Open: ThingSpeak Data Logger')}
${openArd('iot-blynk', 'Open: Blynk Smart Home')}
${openArd('iot-telegram-pir', 'Open: Telegram Security Alarm (PIR)')}`,
    },
    {
      id: 'iot-data', title: 'Live data from the internet',
      html: `
<p>The most fun IoT project is a <b>display of real data</b>: the weather outside, the price of a coin, the next prayer, the air quality of your town. The recipe is always the same four steps:</p>
${E.jsonFlow()}
${code(`#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// Dhaka — change latitude and longitude for your city
const char* URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
                  "?latitude=23.81&longitude=90.41&current=us_aqi,pm2_5";

void setup() {
  Serial.begin(115200);
  WiFi.begin("RaptiNet", "rapti1234");
  while (WiFi.status() != WL_CONNECTED) delay(300);

  WiFiClientSecure client;
  client.setInsecure();                 // no certificate check (fine for a demo)
  HTTPClient http;
  http.begin(client, URL);
  int code = http.GET();
  if (code == HTTP_CODE_OK) {
    StaticJsonDocument<768> doc;
    deserializeJson(doc, http.getString());
    int aqi = doc["current"]["us_aqi"];
    float pm25 = doc["current"]["pm2_5"];
    Serial.printf("AQI %d   PM2.5 %.1f\\n", aqi, pm25);
  } else {
    Serial.printf("HTTP error %d\\n", code);
  }
  http.end();
}

void loop() { }`, 'c', { mark: [14, 18, 19, 23, 24, 25], numbers: true })}
${ul(
  '<b>JSON</b> is text that looks like <code>{"current":{"us_aqi":42}}</code>. <code>ArduinoJson</code> turns it into a <code>doc</code> you index with <code>doc["current"]["us_aqi"]</code>.',
  '<code>StaticJsonDocument&lt;768&gt;</code> reserves 768 bytes for the data. If the answer is bigger, the document stays empty — take a larger number or use a filter.',
  'Always check the <b>HTTP code</b>: 200 is OK. A negative number means the connection failed; the app tells you the reason in the ⚠ list.',
  'With <b>Real internet</b> on, the numbers are the real ones of today; offline they come from the simulator.')}
<h3>Ten projects with real data</h3>
${table(['Project', 'Data', 'Shows it on'], [
  ['Air Quality Monitor', 'US AQI and PM2.5 (Open-Meteo)', 'LCD + green / yellow / red LEDs'],
  ['Prayer Times Clock', 'AlAdhan prayer times + NTP time', 'LCD + buzzer at prayer time'],
  ['Currency Rates Board', 'today\'s exchange rates (USD base)', 'OLED, refreshed every hour'],
  ['ISS Tracker', 'where the International Space Station is (every 5 s)', 'OLED world map + LED'],
  ['Sunset Street Light', 'sunrise and sunset + NTP time', 'a NodeMCU switches a 12 V lamp with a relay'],
  ['Weather Forecast Dial', 'tomorrow\'s forecast', 'a servo on a dial + an umbrella LED'],
  ['NeoPixel Outdoor Thermometer', 'the temperature outside', 'a ring: more LEDs = warmer'],
  ['Quote Ticker', 'a random quote every minute', 'scrolling LCD'],
  ['Outdoor Temperature on TM1637', 'plain text from wttr.in', '4-digit display'],
  ['Earthquake Alert', 'USGS feed of M4.5+ earthquakes', 'OLED list + buzzer'],
])}
${openArd('iot-air-quality', 'Open: Air Quality Monitor')}
${openArd('iot-prayer-times', 'Open: Prayer Times Clock')}
${openArd('iot-weather-neopixel', 'Open: NeoPixel Outdoor Thermometer')}
${openArd('iot-iss-tracker', 'Open: ISS Tracker (OLED world map)')}
${openArd('iot-crypto-lcd', 'Open: Bitcoin Price Ticker (LCD)')}
${openArd('iot-earthquake-alert', 'Open: Earthquake Alert (USGS feed)')}
${tip('Looking for an example? The <b>Examples</b> page has one search box for all of them: try <i>weather</i>, <i>MQTT</i>, <i>prayer</i> or <i>air quality</i>.')}`,
    },
    {
      id: 'iot-ms', title: 'Master and slave: several boards in one project',
      html: `
<p>Sometimes one board is not enough: a second board reads the sensors, or moves the motors, or shows the data. The lab lets you put <b>several boards in one project</b>. Each runs its <b>own sketch</b>, and you wire them together.</p>
${E.msRoles()}
<h3>Adding a second board</h3>
${E.addBoard()}
${steps(
  'Tap <b>＋</b> and choose a second board from <b>Microcontrollers</b>. A box explains what will happen — tap <b>Add</b>.',
  'The Code screen now has <b>one tab per board</b> at the top. Tap a tab to write that board\'s sketch. The pencil button next to the tabs renames the board — call them <i>Master</i> and <i>Slave</i>.',
  'Wire the boards: <b>GND to GND</b> first, then <b>SDA / SCL</b> (I²C) or <b>TX → RX</b> (UART).',
  'Press <b>Run</b>: every board is compiled. A compile error names the board and opens its tab.')}
${E.monitorTags()}
<p>The first board is the "main" one: its sketch is the project\'s sketch, and the send box of the Serial Monitor talks to it. The other boards print into the same Monitor, with their name in front of each line.</p>
<h3>UART: two boards talk with text</h3>
<p>A <b>UART</b> link needs only two wires and a common GND. The master prints text, the slave reads it. On a Mega the second serial port is called <code>Serial1</code>; the Uno has only <code>Serial</code> on pins 0 and 1.</p>
${E.uartWiring()}
${E.uartSeq()}
${code(`// MASTER (Arduino Mega 2560)
const int KNOB = A0;

void setup() {
  Serial.begin(9600);       // to the Serial Monitor
  Serial1.begin(9600);      // to the slave — the same speed on both sides!
}

void loop() {
  int level = map(analogRead(KNOB), 0, 1023, 0, 255);
  Serial1.print('B');
  Serial1.println(level);               // "B128" and a line ending
  delay(50);
  while (Serial1.available()) {
    String reply = Serial1.readStringUntil('\\n');
    reply.trim();
    Serial.print("slave says: ");
    Serial.println(reply);
  }
  delay(250);
}`, 'c', { mark: [6, 11, 12, 15], numbers: true })}
${code(`// SLAVE (Arduino Uno): pins 0 (RX) and 1 (TX) are wired to the master
const int LED = 9;

void setup() {
  Serial.begin(9600);
  pinMode(LED, OUTPUT);
}

void loop() {
  if (Serial.available()) {
    char cmd = Serial.read();
    if (cmd == 'B') {
      int level = constrain(Serial.parseInt(), 0, 255);
      analogWrite(LED, level);
      Serial.print("OK ");               // the reply goes back to the master
      Serial.println(level);
    }
  }
}`, 'c', { mark: [10, 11, 12, 14, 15], numbers: true })}
${note('Pins <b>0 and 1</b> of an Uno are also its USB line. When a wire from another board is connected to them, the slave listens to the master. The text the master sends to the slave does <b>not</b> show up in the Serial Monitor; the slave\'s own <code>Serial.print</code> does.')}
${openArd('uart-master-slave', 'Open: Two boards — Serial Master → Slave')}
<h3>I²C: one master, many slaves</h3>
<p>With <b>I²C</b> two wires — <b>SDA</b> (data) and <b>SCL</b> (clock) — connect any number of boards and parts. The <b>master</b> starts every conversation; every <b>slave</b> has an <b>address</b> (1 – 127) and only answers when its address is called. The LCD, the OLED and the MPU6050 of chapter A6 are I²C slaves too.</p>
${E.i2cWiring()}
${E.i2cSeq()}
${code(`// MASTER: sends two bytes to slave #8, then asks for two
#include <Wire.h>

void setup() {
  Wire.begin();                          // no address = master
  Serial.begin(9600);
}

void loop() {
  byte angle = map(analogRead(A0), 0, 1023, 0, 180);

  Wire.beginTransmission(8);
  Wire.write(angle);
  Wire.write(1);
  byte error = Wire.endTransmission();   // 0 = the slave answered

  Wire.requestFrom(8, 2);                // ask for two bytes
  byte a = Wire.read();
  byte b = Wire.read();

  Serial.print(error == 0 ? "ok " : "no answer ");
  Serial.print(a);
  Serial.print(" ");
  Serial.println(b);
  delay(400);
}`, 'c', { mark: [5, 12, 13, 14, 15, 17], numbers: true })}
${code(`// SLAVE #8: the master sends [angle, led]; this board answers requests
#include <Wire.h>

volatile byte angle = 90;
volatile byte count = 0;

void receiveEvent(int howMany) {         // the master wrote to us
  angle = Wire.read();
  byte led = Wire.read();
  count++;
}

void requestEvent() {                    // the master asked us for data
  Wire.write(count);
  Wire.write(angle);
}

void setup() {
  Wire.begin(8);                         // join the bus as slave #8
  Wire.onReceive(receiveEvent);
  Wire.onRequest(requestEvent);
}

void loop() { }`, 'c', { mark: [8, 14, 19, 20, 21], numbers: true })}
${tip('Two boards can only talk if they share the <b>same ground</b>. If nothing arrives, check GND first, then that TX goes to RX (UART) or SDA to SDA (I²C). A master that gets no answer from an I²C slave sees <code>endTransmission()</code> return a number other than 0.')}
${warn('In the lab the examples use <b>UART</b> and <b>I²C</b> between boards. The SPI pins (MOSI, MISO, SCK) exist on the boards and are used by parts such as the MAX7219 display, but there is no board-to-board SPI example.')}
${openArd('i2c-master-slave', 'Open: Two Arduinos — I²C Master → Slave')}`,
    },
    {
      id: 'iot-two', title: 'Two boards over Wi-Fi, and when it does not work',
      html: `
<p>Boards on the same Wi-Fi do not need a wire between them. In the <b>two ESP32 boards</b> example, one reads a DHT22 and publishes the numbers; the other subscribes and writes them on an LCD.</p>
${E.twoMqtt()}
${code(`// Board 1 — sensor node
  mqtt.publish("rapti/node1/climate", "24.5,55.0");   // "temperature,humidity"

// Board 2 — display node
  mqtt.subscribe("rapti/node1/climate");
  // in onMessage():  split the text at the comma, print both parts on the LCD`, 'c')}
<p>Open the example, tap the <b>second tab</b> in the Code screen to read the display node\'s sketch, press Run, then tap the DHT22 and change the temperature. A few seconds later the LCD of the other board shows it. If the sensor node goes quiet for 15 seconds, the display shows <i>Sensor offline!</i>.</p>
${openArd('iot-two-boards-mqtt', 'Open: Two ESP32 Boards over MQTT')}
<h3>When it does not work</h3>
${table(['What you see', 'Usual cause', 'What to do'], [
  ['No <b>IoT</b> tab', 'The board has no Wi-Fi.', 'Use an ESP32, a NodeMCU or an Uno R4 WiFi.'],
  ['<code>fatal error: WiFi.h: No such file or directory</code>', 'The library does not belong to the board.', 'ESP32: <code>WiFi.h</code> · NodeMCU: <code>ESP8266WiFi.h</code> · R4: <code>WiFiS3.h</code>.'],
  ['The dots never stop; <code>WiFi: could not join</code>', 'Router off, wrong password, or Strict Wi-Fi with an unknown name.', 'Dashboard: Router on. Use <code>rapti1234</code>. Read the reason in the ⚠ list.'],
  ['Joined, but the web page times out', '<code>server.handleClient()</code> is not called, or a long <code>delay()</code> blocks it.', 'Call it in every <code>loop()</code>. Remove long delays.'],
  ['<code>ERR_CONNECTION_REFUSED</code>', '<code>server.begin()</code> is missing or the port is different.', 'Add <code>server.begin();</code> in <code>setup()</code>.'],
  ['<code>WiFiClientSecure: the TLS certificate … cannot be verified</code>', 'HTTPS without <code>setInsecure()</code>.', '<code>client.setInsecure();</code> before <code>http.begin()</code>.'],
  ['<code>HTTP error -1</code> (or another negative number)', 'The connection failed: Wi-Fi lost, name not found, internet off.', 'Check <code>WiFi.status()</code> and the dashboard switches.'],
  ['MQTT: <code>mqtt.connect()</code> returns false', 'Unknown broker name, or the board is offline.', 'Use one of the public brokers; print <code>mqtt.state()</code>.'],
  ['MQTT message never arrives', 'Forgot <code>mqtt.loop()</code> or <code>subscribe()</code>, or the topic differs by one letter.', 'Compare the topics in the dashboard\'s MQTT card.'],
  ['A message is not published', 'It is bigger than the 256-byte buffer.', '<code>mqtt.setBufferSize(512);</code>'],
  ['5 V on a 3.3 V pin: <i>burned out</i>', 'A 5 V sensor wired to an ESP32 pin.', 'Power the sensor from <b>3V3</b>.'],
  ['Two boards, no talk', 'No common GND, TX and RX not crossed, different baud rates, or SDA / SCL swapped.', 'Compare with the wiring pictures above.'],
])}
${note(`<b>Remember</b><br>• IoT = a board on a Wi-Fi network. ESP32, NodeMCU and Uno R4 WiFi have it; their libraries differ. The <b>IoT tab</b> is the phone on the same network.<br>• <code>WiFi.begin("RaptiNet", "rapti1234")</code>, wait for <code>WL_CONNECTED</code>, read <code>WiFi.localIP()</code>.<br>• A web server needs <code>server.on()</code>, <code>server.begin()</code> and <code>server.handleClient()</code> in every loop.<br>• The dashboard has the Router, Internet, Strict and Real internet switches; ThingSpeak, Blynk, Telegram and IFTTT always stay simulated.<br>• MQTT = topics + broker. Live data = HTTPClient + JSON + a display.<br>• Several boards: one tab and one sketch each. GND to GND, TX → RX for UART, SDA → SDA and SCL → SCL for I²C.`)}
${tryIt('Open <b>MQTT Smart Light</b>. Press Run, then in the dashboard publish <code>TOGGLE</code> to <code>rapti/home/light/set</code>. Now switch the <b>Internet</b> off and publish again — what happens to the light? And when you switch it on?')}`,
    },
  ],
};
