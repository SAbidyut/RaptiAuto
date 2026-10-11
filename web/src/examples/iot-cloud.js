// IoT examples (2/3): cloud services — MQTT, ThingSpeak, Blynk, Telegram, IFTTT, NTP and web APIs. Open the IoT tab while
// they run: the dashboard shows the MQTT topics (and lets you publish), ThingSpeak charts, Blynk pins, Telegram chat …
import { P, at, W, R, C, rail } from './helpers.js';
import { ESP, BB, WIFI, LCD, lcdWires, hookDown, hookUp, ledRig, buttonRig, gndTop, gndBottom } from './iot-common.js';

// ------------------------------------------------------------------ 1. MQTT light
export function iotMqttLight() {
  const esp = ESP(), bb = BB();
  const led = ledRig(esp, bb, 'D2', 8, 'yellow', 'led');
  const btn = buttonRig(esp, bb, 'D15', 24, 'btn', 130);
  return {
    id: 'iot-mqtt-light', name: 'MQTT Smart Light', category: 'iot', level: 'intermediate',
    description: 'A light controlled over MQTT (public broker). Publish ON / OFF / TOGGLE to  rapti/home/light/set  from the IoT dashboard, or press the button. The state is published (retained) to  rapti/home/light/state.',
    parts: [bb, esp, ...led.parts, ...btn.parts],
    wires: [...led.wires, ...btn.wires, gndTop(esp, bb), gndBottom(esp, bb)],
    code: `// MQTT smart light with PubSubClient
#include <WiFi.h>
#include <PubSubClient.h>

${WIFI}const char* MQTT_HOST = "broker.hivemq.com";
const int   MQTT_PORT = 1883;
const char* TOPIC_SET   = "rapti/home/light/set";     // ON / OFF / TOGGLE
const char* TOPIC_STATE = "rapti/home/light/state";   // ON / OFF (retained)

const int LED = 2, BUTTON = 15;
WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);
bool lightOn = false;

void setLight(bool on) {
  lightOn = on;
  digitalWrite(LED, on);
  mqtt.publish(TOPIC_STATE, on ? "ON" : "OFF", true);   // retained: new subscribers get it at once
  Serial.println(on ? "Light ON" : "Light OFF");
}

// called by mqtt.loop() for every message we subscribed to
void onMessage(char* topic, byte* payload, unsigned int length) {
  String msg;
  for (unsigned int i = 0; i < length; i++) msg += (char)payload[i];
  msg.toUpperCase();
  Serial.print("["); Serial.print(topic); Serial.print("] "); Serial.println(msg);
  if (msg == "ON") setLight(true);
  else if (msg == "OFF") setLight(false);
  else if (msg == "TOGGLE") setLight(!lightOn);
}

void connectMqtt() {
  while (!mqtt.connected()) {
    Serial.print("Connecting to MQTT...");
    String id = "rapti-light-" + String((uint32_t)ESP.getEfuseMac(), HEX);
    if (mqtt.connect(id.c_str())) {
      Serial.println(" connected");
      mqtt.subscribe(TOPIC_SET);
      mqtt.publish(TOPIC_STATE, lightOn ? "ON" : "OFF", true);
    } else {
      Serial.print(" failed, rc="); Serial.println(mqtt.state());
      delay(2000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(LED, OUTPUT);
  pinMode(BUTTON, INPUT_PULLUP);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(300);
  Serial.print("IP: "); Serial.println(WiFi.localIP());
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(onMessage);
}

bool lastButton = HIGH;
void loop() {
  if (!mqtt.connected()) connectMqtt();
  mqtt.loop();                                   // receive messages, keep the connection alive

  bool b = digitalRead(BUTTON);
  if (lastButton == HIGH && b == LOW) { setLight(!lightOn); delay(50); }   // local switch
  lastButton = b;
}
`,
  };
}

// ------------------------------------------------------------------ 2. MQTT sensor
export function iotMqttDht() {
  const esp = ESP();
  const dht = at('dht22', 'VCC', 170, 250, { model: '22' }, 0, 'dht');
  return {
    id: 'iot-mqtt-dht', name: 'MQTT Sensor Node (JSON + Last Will)', category: 'iot', level: 'intermediate',
    description: 'Publishes temperature and humidity as JSON every few seconds. A "last will" message marks the node offline if it disappears. Publish a number to  rapti/lab/interval  to change the period.',
    parts: [esp, dht],
    wires: hookDown(esp, dht, [['3V3', 'VCC', C.red], ['D4', 'DATA', C.green], ['GND.2', 'GND', C.black]]),
    code: `// MQTT sensor node: DHT22 -> JSON, availability with a last will
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include "DHT.h"

${WIFI}const char* MQTT_HOST = "broker.hivemq.com";
const char* TOPIC_DATA   = "rapti/lab/dht";
const char* TOPIC_STATUS = "rapti/lab/status";
const char* TOPIC_INTERVAL = "rapti/lab/interval";   // seconds, e.g. 2

DHT dht(4, DHT22);
WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);
unsigned long periodMs = 5000, lastSend = 0;

void onMessage(char* topic, byte* payload, unsigned int length) {
  String msg;
  for (unsigned int i = 0; i < length; i++) msg += (char)payload[i];
  int s = msg.toInt();
  if (s >= 1 && s <= 60) { periodMs = s * 1000UL; Serial.printf("Period is now %d s\\n", s); }
}

void connectMqtt() {
  while (!mqtt.connected()) {
    // clientId, user, pass, will topic, will QoS, will retain, will message
    if (mqtt.connect("rapti-dht-node", NULL, NULL, TOPIC_STATUS, 0, true, "offline")) {
      mqtt.publish(TOPIC_STATUS, "online", true);
      mqtt.subscribe(TOPIC_INTERVAL);
      Serial.println("MQTT connected");
    } else {
      delay(1500);
    }
  }
}

void publishReading() {
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  if (isnan(t) || isnan(h)) { Serial.println("Sensor error"); return; }
  StaticJsonDocument<128> doc;
  doc["temperature"] = round(t * 10) / 10.0;
  doc["humidity"] = round(h * 10) / 10.0;
  doc["rssi"] = WiFi.RSSI();
  char buffer[128];
  size_t n = serializeJson(doc, buffer);
  mqtt.publish(TOPIC_DATA, buffer, n);
  Serial.println(buffer);
}

void setup() {
  Serial.begin(115200);
  dht.begin();
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(300);
  mqtt.setServer(MQTT_HOST, 1883);
  mqtt.setCallback(onMessage);
}

void loop() {
  if (!mqtt.connected()) connectMqtt();
  mqtt.loop();
  if (millis() - lastSend >= periodMs) { lastSend = millis(); publishReading(); }
}
`,
  };
}

// ------------------------------------------------------------------ 3. ThingSpeak
export function iotThingspeak() {
  const esp = ESP();
  const dht = at('dht22', 'VCC', 170, 250, { model: '22' }, 0, 'dht');
  return {
    id: 'iot-thingspeak', name: 'ThingSpeak Data Logger', category: 'iot', level: 'intermediate',
    description: 'Logs temperature and humidity to a ThingSpeak channel every 16 seconds (the free plan allows one update per 15 s). Open the dashboard to see the live charts; write too often and ThingSpeak answers with error −401.',
    parts: [esp, dht],
    wires: hookDown(esp, dht, [['3V3', 'VCC', C.red], ['D4', 'DATA', C.green], ['GND.2', 'GND', C.black]]),
    code: `// DHT22 -> ThingSpeak
#include <WiFi.h>
#include <ThingSpeak.h>
#include "DHT.h"

${WIFI}unsigned long CHANNEL_ID = 2468101;                 // your channel
const char* WRITE_API_KEY = "RAPTI4LOGGER2024";         // its write key

DHT dht(4, DHT22);
WiFiClient client;
unsigned long lastUpdate = 0;

void setup() {
  Serial.begin(115200);
  dht.begin();
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(300);
  Serial.println("Wi-Fi connected");
  ThingSpeak.begin(client);
}

void loop() {
  if (millis() - lastUpdate > 16000 || lastUpdate == 0) {
    lastUpdate = millis();
    float t = dht.readTemperature();
    float h = dht.readHumidity();
    if (isnan(t) || isnan(h)) { Serial.println("Sensor error"); return; }

    ThingSpeak.setField(1, t);                    // field 1 = temperature
    ThingSpeak.setField(2, h);                    // field 2 = humidity
    ThingSpeak.setStatus("RaptiAuto logger");
    int code = ThingSpeak.writeFields(CHANNEL_ID, WRITE_API_KEY);
    if (code == 200) Serial.printf("Logged  T=%.1f  H=%.1f\\n", t, h);
    else Serial.printf("Update failed, error %d\\n", code);
  }
  delay(200);
}
`,
  };
}

// ------------------------------------------------------------------ 4. Blynk
export function iotBlynk() {
  const esp = ESP(), bb = BB();
  const led = ledRig(esp, bb, 'D2', 8, 'green', 'led');
  const dht = at('dht22', 'VCC', 170, 250, { model: '22' }, 0, 'dht');
  return {
    id: 'iot-blynk', name: 'Blynk Smart Home (LED + Sensor)', category: 'iot', level: 'intermediate',
    description: 'Blynk-style app control: virtual pin V1 is a switch for the LED, V2 and V3 show temperature and humidity. In the IoT dashboard (Blynk card) change V1 to switch the LED, and watch V2/V3 update.',
    parts: [bb, esp, ...led.parts, dht],
    wires: [...led.wires, gndTop(esp, bb), ...hookDown(esp, dht, [['3V3', 'VCC', C.red], ['D4', 'DATA', C.orange], ['GND.2', 'GND', C.black]])],
    code: `// Blynk: virtual pins V1 (switch), V2 (temperature), V3 (humidity)
#define BLYNK_TEMPLATE_ID   "TMPL0RaptiAuto"
#define BLYNK_TEMPLATE_NAME "Smart Home"
#define BLYNK_AUTH_TOKEN    "Rapti_Demo_Token_00000000000001"   // from the Blynk console

#include <WiFi.h>
#include <BlynkSimpleEsp32.h>
#include "DHT.h"

${WIFI}const int LED = 2;
DHT dht(4, DHT22);
BlynkTimer timer;

// runs when the app changes the widget on V1
BLYNK_WRITE(V1) {
  int value = param.asInt();
  digitalWrite(LED, value);
  Serial.print("V1 = "); Serial.println(value);
}

// runs once the device is connected to the Blynk cloud
BLYNK_CONNECTED() {
  Serial.println("Connected to Blynk");
  Blynk.syncVirtual(V1);                     // restore the switch state
}

void sendSensor() {
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  if (isnan(t) || isnan(h)) return;
  Blynk.virtualWrite(V2, t);
  Blynk.virtualWrite(V3, h);
  Serial.printf("Sent T=%.1f H=%.1f\\n", t, h);
}

void setup() {
  Serial.begin(115200);
  pinMode(LED, OUTPUT);
  dht.begin();
  Blynk.begin(BLYNK_AUTH_TOKEN, WIFI_SSID, WIFI_PASS);
  timer.setInterval(3000L, sendSensor);       // every 3 s
}

void loop() {
  Blynk.run();
  timer.run();
}
`,
  };
}

// ------------------------------------------------------------------ 5. Telegram + PIR
export function iotTelegramPir() {
  const esp = ESP();
  const pir = at('pir', 'VCC', 80, -70, { hold: '3' }, 0, 'pir');
  const buz = at('buzzer', '+', 20, 230, { kind: 'active' }, 0, 'buzzer');
  return {
    id: 'iot-telegram-pir', name: 'Telegram Security Alarm (PIR)', category: 'iot', level: 'advanced',
    description: 'A PIR motion sensor sends a Telegram message when someone moves, and the bot obeys commands: /status, /alarm_on, /alarm_off. Tap the PIR to simulate motion, and chat with the bot in the dashboard (Notifications card).',
    parts: [esp, pir, buz],
    wires: [
      ...hookUp(esp, pir, [['VIN', 'VCC', C.red], ['D34', 'OUT', C.green], ['GND.1', 'GND', C.black]]),
      R(esp, 'D23', buz, '+', C.orange, [200]),
      R(esp, 'GND.2', buz, '-', C.black, [150]),
    ],
    code: `// PIR -> Telegram bot (UniversalTelegramBot)
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <UniversalTelegramBot.h>

${WIFI}#define BOT_TOKEN "123456789:AAEhBP0av28XRaptiAutoTestTokenXY"   // from @BotFather
#define CHAT_ID   "123456789"                                    // your chat

const int PIR = 34, BUZZER = 23;
WiFiClientSecure secureClient;
UniversalTelegramBot bot(BOT_TOKEN, secureClient);

bool alarmArmed = true;
unsigned long lastCheck = 0, lastAlert = 0;

void handleMessages(int count) {
  for (int i = 0; i < count; i++) {
    String chat = bot.messages[i].chat_id;
    String text = bot.messages[i].text;
    Serial.println("Telegram: " + text);
    if (text == "/status") {
      bot.sendMessage(chat, String("Alarm is ") + (alarmArmed ? "ARMED" : "OFF") + ", uptime " + String(millis() / 1000) + " s", "");
    } else if (text == "/alarm_on") {
      alarmArmed = true;
      bot.sendMessage(chat, "Alarm armed", "");
    } else if (text == "/alarm_off") {
      alarmArmed = false;
      bot.sendMessage(chat, "Alarm switched off", "");
    } else {
      bot.sendMessage(chat, "Commands: /status /alarm_on /alarm_off", "");
    }
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(PIR, INPUT);
  pinMode(BUZZER, OUTPUT);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(300);
  secureClient.setInsecure();               // skip the certificate check (fine for a demo)
  bot.sendMessage(CHAT_ID, "Security alarm online", "");
  Serial.println("Bot started");
}

void loop() {
  if (alarmArmed && digitalRead(PIR) == HIGH && (lastAlert == 0 || millis() - lastAlert > 10000)) {
    lastAlert = millis();
    Serial.println("Motion!");
    digitalWrite(BUZZER, HIGH);
    bot.sendMessage(CHAT_ID, "Motion detected!", "");
    delay(500);
    digitalWrite(BUZZER, LOW);
  }
  if (millis() - lastCheck > 2000) {         // look for new chat messages
    lastCheck = millis();
    int n = bot.getUpdates(bot.last_message_received + 1);
    if (n) handleMessages(n);
  }
}
`,
  };
}

// ------------------------------------------------------------------ 6. NTP clock on LCD
export function iotNtpClock() {
  const esp = ESP(), lcd = LCD();
  return {
    id: 'iot-ntp-clock', name: 'Internet Clock (NTP) on LCD', category: 'iot', level: 'beginner',
    description: 'The time comes from the internet (NTP) — no RTC chip needed. The 16×2 LCD shows the date and the time in Bangladesh (UTC+6) and keeps counting between updates.',
    parts: [esp, lcd],
    wires: lcdWires(esp, lcd),
    code: `// NTP clock on an I2C LCD
#include <WiFi.h>
#include <WiFiUdp.h>
#include <NTPClient.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

${WIFI}const long UTC_OFFSET = 6 * 3600;          // Dhaka: UTC+6
LiquidCrystal_I2C lcd(0x27, 16, 2);
WiFiUDP ntpUDP;
NTPClient timeClient(ntpUDP, "pool.ntp.org", UTC_OFFSET, 60000);   // asks the server every 60 s

const char* DAYS[] = {"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"};

void setup() {
  Serial.begin(115200);
  lcd.init();
  lcd.backlight();
  lcd.print("Connecting...");
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(300);
  lcd.clear();
  lcd.print("Getting time...");
  timeClient.begin();
  while (!timeClient.update()) delay(500);
  lcd.clear();
  Serial.println("Time: " + timeClient.getFormattedTime());
}

void loop() {
  timeClient.update();
  unsigned long epoch = timeClient.getEpochTime();
  unsigned long days = epoch / 86400UL;

  // civil date from the day count (Howard Hinnant's algorithm)
  long z = days + 719468;
  long era = z / 146097;
  long doe = z - era * 146097;
  long yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
  long y = yoe + era * 400;
  long doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
  long mp = (5 * doy + 2) / 153;
  int d = doy - (153 * mp + 2) / 5 + 1;
  int m = mp < 10 ? mp + 3 : mp - 9;
  if (m <= 2) y++;

  char line1[17], line2[17];
  snprintf(line1, sizeof(line1), "%s %02d/%02d/%04ld", DAYS[timeClient.getDay()], d, m, y);
  snprintf(line2, sizeof(line2), "    %s", timeClient.getFormattedTime().c_str());
  lcd.setCursor(0, 0); lcd.print(line1);
  lcd.setCursor(0, 1); lcd.print(line2);
  delay(250);
}
`,
  };
}

// ------------------------------------------------------------------ 7. Crypto ticker
export function iotCryptoLcd() {
  const esp = ESP(), lcd = LCD();
  return {
    id: 'iot-crypto-lcd', name: 'Bitcoin Price Ticker (LCD)', category: 'iot', level: 'intermediate',
    description: 'Fetches Bitcoin and Ethereum prices from a web API (JSON), shows them on the LCD and prints the change since the last reading.',
    parts: [esp, lcd],
    wires: lcdWires(esp, lcd),
    code: `// Crypto price ticker: HTTP + ArduinoJson + LCD
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

${WIFI}const char* URL = "http://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd";

LiquidCrystal_I2C lcd(0x27, 16, 2);
float lastBtc = 0;

bool fetchPrices(float &btc, float &eth) {
  HTTPClient http;
  http.begin(URL);
  int code = http.GET();
  if (code != HTTP_CODE_OK) { http.end(); return false; }
  StaticJsonDocument<256> doc;
  DeserializationError err = deserializeJson(doc, http.getString());
  http.end();
  if (err) { Serial.println(err.c_str()); return false; }
  btc = doc["bitcoin"]["usd"];
  eth = doc["ethereum"]["usd"];
  return true;
}

void setup() {
  Serial.begin(115200);
  lcd.init();
  lcd.backlight();
  lcd.print("Connecting...");
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(300);
}

void loop() {
  float btc, eth;
  if (fetchPrices(btc, eth)) {
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("BTC $"); lcd.print((long)btc);
    lcd.setCursor(0, 1);
    lcd.print("ETH $"); lcd.print((long)eth);
    if (lastBtc > 0) {
      float change = (btc - lastBtc) / lastBtc * 100.0;
      lcd.setCursor(11, 0);
      lcd.print(change >= 0 ? "+" : "");
      lcd.print(change, 1);
      lcd.print("%");
    }
    lastBtc = btc;
    Serial.printf("BTC %.0f  ETH %.0f\\n", btc, eth);
  } else {
    lcd.clear();
    lcd.print("No data");
    Serial.println("Request failed");
  }
  delay(15000);
}
`,
  };
}

// ------------------------------------------------------------------ 8. IFTTT door alarm
export function iotIftttDoor() {
  const esp = ESP(), bb = BB();
  const led = ledRig(esp, bb, 'D2', 8, 'red', 'led');
  const btn = buttonRig(esp, bb, 'D15', 24, 'door', 130);
  const buz = at('buzzer', '+', 20, 230, { kind: 'active' }, 0, 'buzzer');
  return {
    id: 'iot-ifttt-door', name: 'Door Alarm → IFTTT Webhook', category: 'iot', level: 'intermediate',
    description: 'The push button is a door switch. When the door opens the ESP32 sounds a buzzer, lights the LED and calls an IFTTT webhook (it shows in the dashboard\'s Notifications card). Hold the button = door closed; let go = door opens.',
    parts: [bb, esp, ...led.parts, ...btn.parts, buz],
    wires: [
      ...led.wires, ...btn.wires, gndTop(esp, bb), gndBottom(esp, bb),
      R(esp, 'D23', buz, '+', C.orange, [200]),
      R(esp, 'GND.2', buz, '-', C.black, [150]),
    ],
    code: `// Door alarm: reed switch (button) -> buzzer + IFTTT webhook
#include <WiFi.h>
#include <HTTPClient.h>

${WIFI}const char* IFTTT_KEY = "RaptiDemoKey123";    // from ifttt.com/maker_webhooks
const char* EVENT = "door_open";

const int DOOR = 15, LED = 2, BUZZER = 23;
bool doorOpen = false;

void notify(const String& what) {
  HTTPClient http;
  String url = String("http://maker.ifttt.com/trigger/") + EVENT + "/with/key/" + IFTTT_KEY + "?value1=" + what;
  http.begin(url);
  int code = http.GET();
  Serial.printf("IFTTT -> HTTP %d\\n", code);
  http.end();
}

void setup() {
  Serial.begin(115200);
  pinMode(DOOR, INPUT_PULLUP);              // LOW = switch closed = door closed
  pinMode(LED, OUTPUT);
  pinMode(BUZZER, OUTPUT);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(300);
  doorOpen = digitalRead(DOOR) == HIGH;     // remember the state at start-up, alarm only on changes
  Serial.println(doorOpen ? "Door monitor ready (door is open)" : "Door monitor ready (door is closed)");
}

void loop() {
  bool open = digitalRead(DOOR) == HIGH;
  if (open && !doorOpen) {
    Serial.println("DOOR OPENED");
    digitalWrite(LED, HIGH);
    digitalWrite(BUZZER, HIGH);
    notify("Front+door+opened");
    delay(800);
    digitalWrite(BUZZER, LOW);
  }
  if (!open && doorOpen) {
    Serial.println("Door closed");
    digitalWrite(LED, LOW);
  }
  doorOpen = open;
  delay(50);
}
`,
  };
}
