// IoT examples (4/4): live data from the internet on real hardware — air quality, prayer times, exchange
// rates, the ISS, a sunset street light, a forecast dial, a NeoPixel thermometer, a quote ticker, a TM1637
// thermometer and an earthquake alert. The services are real public APIs: with Settings → Real internet on
// (and the phone online) the board gets the real data, offline the simulator answers in the same format.
import { at, plug, R, C, W, rail } from './helpers.js';
import { ESP, NODEMCU, BB, WIFI, LCD, lcdWires, hookDown, hookTop } from './iot-common.js';

/** LED + 220 Ω on the breadboard at column `col`, fed from a TOP-row pin of the ESP32 over the board (`y` = height of the run). */
function topLed(esp, bb, pin, col, color, id, y, wireColor) {
  const r = plug('resistor', '1', bb, `e${col}`, { value: 220 });
  const l = plug('led', 'A', bb, `c${col + 4}`, { color }, 0, id);
  return { parts: [r, l], wires: [R(esp, pin, bb, `a${col}`, wireColor, [y]), W(bb, `a${col + 5}`, bb, rail(bb, 'tn', col + 5), C.black)] };
}
/** GND of the top row (GND.1) to the top (−) rail of the breadboard, over the board. */
const gndTopRow = (esp, bb, y = -11) => R(esp, 'GND.1', bb, rail(bb, 'tn', 2), C.black, [y]);

const OLED = () => at('oled-ssd1306', 'GND', 60, 250, { color: 'white', address: '60' }, 0, 'oled');
const oledWires = (esp, oled) => hookDown(esp, oled, [['D22', 'SCL', C.yellow], ['D21', 'SDA', C.blue], ['3V3', 'VCC', C.red], ['GND.2', 'GND', C.black]]);

// ------------------------------------------------------------------ 1. air quality → LCD + traffic light
export function iotAirQuality() {
  const esp = ESP(), bb = BB(), lcd = LCD();
  const g = topLed(esp, bb, 'D27', 6, 'green', 'ledG', -17, C.green);
  const y = topLed(esp, bb, 'D26', 13, 'yellow', 'ledY', -24, C.yellow);
  const r = topLed(esp, bb, 'D25', 20, 'red', 'ledR', -31, C.orange);
  return {
    id: 'iot-air-quality', name: 'Air Quality Monitor (AQI + PM2.5)', category: 'iot', level: 'intermediate',
    description: 'Downloads the air quality of Dhaka (US AQI and PM2.5 from the Open-Meteo air quality API) and shows it on the LCD; a green / yellow / red LED tells at a glance whether the air is good, unhealthy for sensitive people or unhealthy.',
    tags: ['AQI', 'PM2.5', 'pollution', 'open-meteo', 'HTTPS', 'LCD', 'LED', 'JSON'],
    parts: [bb, esp, lcd, ...g.parts, ...y.parts, ...r.parts],
    wires: [
      // the LCD's 5 V runs from VIN between the board and the breadboard, under the LED wires
      ...hookTop(esp, lcd, [['D22', 'SCL', C.yellow], ['D21', 'SDA', C.blue], ['GND.2', 'GND', C.black]]),
      R(esp, 'VIN', lcd, 'VCC', C.red, [-5, 190, 154]),
      ...g.wires, ...y.wires, ...r.wires, gndTopRow(esp, bb),
    ],
    code: `// Air quality monitor: Open-Meteo air quality API -> LCD + 3 LEDs
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <LiquidCrystal_I2C.h>

${WIFI}// Dhaka — change latitude / longitude for your city
const char* URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
                  "?latitude=23.81&longitude=90.41&current=us_aqi,pm2_5,pm10";
const int GREEN = 27, YELLOW = 26, RED = 25;

LiquidCrystal_I2C lcd(0x27, 16, 2);

const char* level(int aqi) {
  if (aqi <= 50) return "Good";
  if (aqi <= 100) return "Moderate";
  if (aqi <= 150) return "Sensitive";       // unhealthy for sensitive groups
  if (aqi <= 200) return "Unhealthy";
  if (aqi <= 300) return "Very unhlthy";
  return "Hazardous";
}

void setup() {
  Serial.begin(115200);
  pinMode(GREEN, OUTPUT); pinMode(YELLOW, OUTPUT); pinMode(RED, OUTPUT);
  lcd.init();
  lcd.backlight();
  lcd.print("Air quality...");
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(300);
}

void loop() {
  WiFiClientSecure client;
  client.setInsecure();                 // no certificate check (fine for a demo)
  HTTPClient http;
  http.begin(client, URL);
  int code = http.GET();
  if (code == HTTP_CODE_OK) {
    StaticJsonDocument<768> doc;
    if (!deserializeJson(doc, http.getString())) {
      int aqi = doc["current"]["us_aqi"];
      float pm25 = doc["current"]["pm2_5"];
      float pm10 = doc["current"]["pm10"];
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("AQI "); lcd.print(aqi); lcd.print(" "); lcd.print(level(aqi));
      lcd.setCursor(0, 1);
      lcd.print("PM2.5 "); lcd.print(pm25, 1); lcd.print(" ug");
      digitalWrite(GREEN, aqi <= 50);
      digitalWrite(YELLOW, aqi > 50 && aqi <= 150);
      digitalWrite(RED, aqi > 150);
      Serial.printf("AQI %d (%s)  PM2.5 %.1f  PM10 %.1f ug/m3\\n", aqi, level(aqi), pm25, pm10);
    }
  } else {
    Serial.printf("HTTP error %d\\n", code);
    lcd.clear();
    lcd.print("No data");
  }
  http.end();
  delay(10 * 60 * 1000UL);               // the data changes once an hour
}
`,
  };
}

// ------------------------------------------------------------------ 2. prayer times → LCD + buzzer
export function iotPrayerTimes() {
  const esp = ESP(), lcd = LCD();
  const buz = at('buzzer', '+', 60, -50, { kind: 'active' }, 0, 'buzzer');
  return {
    id: 'iot-prayer-times', name: 'Prayer Times Clock (Azan reminder)', category: 'iot', level: 'intermediate',
    description: 'Gets today\'s prayer times for Dhaka from the AlAdhan API and the time from NTP. The LCD shows the next prayer and how long until it; at prayer time the buzzer beeps. Change CITY / COUNTRY / METHOD for your place.',
    tags: ['salah', 'namaz', 'azan', 'aladhan', 'NTP', 'clock', 'LCD', 'buzzer', 'HTTPS'],
    parts: [esp, lcd, buz],
    wires: [...lcdWires(esp, lcd), R(esp, 'D25', buz, '+', C.orange, [-30]), R(esp, 'GND.1', buz, '-', C.black, [-20])],
    code: `// Prayer times (AlAdhan API) + NTP clock -> LCD, buzzer at prayer time
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <LiquidCrystal_I2C.h>
#include <time.h>

${WIFI}const char* URL = "https://api.aladhan.com/v1/timingsByCity?city=Dhaka&country=Bangladesh&method=1";
const long GMT_OFFSET = 6 * 3600;       // Bangladesh: UTC+6
const int BUZZER = 25;

const char* NAMES[5] = { "Fajr", "Dhuhr", "Asr", "Maghrib", "Isha" };
int minutesOf[5];                        // prayer times in minutes after midnight
int loadedDay = -1, beepedFor = -1;

LiquidCrystal_I2C lcd(0x27, 16, 2);

bool loadTimes() {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  http.begin(client, URL);
  int code = http.GET();
  bool ok = false;
  if (code == HTTP_CODE_OK) {
    DynamicJsonDocument doc(4096);
    if (!deserializeJson(doc, http.getString())) {
      JsonObject t = doc["data"]["timings"];
      for (int i = 0; i < 5; i++) {
        String hm = t[NAMES[i]].as<String>();          // "15:05"
        minutesOf[i] = hm.substring(0, 2).toInt() * 60 + hm.substring(3, 5).toInt();
        Serial.printf("%-8s %s\\n", NAMES[i], hm.c_str());
      }
      Serial.println(String("Hijri: ") + (const char*)doc["data"]["date"]["hijri"]["date"]);
      ok = true;
    }
  }
  http.end();
  return ok;
}

void setup() {
  Serial.begin(115200);
  pinMode(BUZZER, OUTPUT);
  lcd.init();
  lcd.backlight();
  lcd.print("Prayer times...");
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(300);
  configTime(GMT_OFFSET, 0, "pool.ntp.org");
}

void loop() {
  struct tm now;
  if (!getLocalTime(&now)) { delay(500); return; }
  if (now.tm_yday != loadedDay && loadTimes()) loadedDay = now.tm_yday;
  if (loadedDay < 0) { delay(5000); return; }

  int m = now.tm_hour * 60 + now.tm_min;
  int next = 0;                          // first prayer still to come (after Isha: Fajr tomorrow)
  while (next < 5 && minutesOf[next] <= m) next++;
  int left = next < 5 ? minutesOf[next] - m : minutesOf[0] + 1440 - m;
  int idx = next % 5;

  char line[17];
  lcd.setCursor(0, 0);
  snprintf(line, sizeof line, "%-7s %02d:%02d   ", NAMES[idx], minutesOf[idx] / 60, minutesOf[idx] % 60);
  lcd.print(line);
  lcd.setCursor(0, 1);
  snprintf(line, sizeof line, "in %dh%02dm  %02d:%02d", left / 60, left % 60, now.tm_hour, now.tm_min);
  lcd.print(line);

  // the minute a prayer begins: beep three times
  for (int i = 0; i < 5; i++) {
    if (m == minutesOf[i] && beepedFor != i) {
      beepedFor = i;
      Serial.printf("It is time for %s\\n", NAMES[i]);
      for (int k = 0; k < 3; k++) { digitalWrite(BUZZER, HIGH); delay(300); digitalWrite(BUZZER, LOW); delay(300); }
    }
  }
  delay(1000);
}
`,
  };
}

// ------------------------------------------------------------------ 3. exchange rates → OLED
export function iotCurrencyOled() {
  const esp = ESP(), oled = OLED();
  return {
    id: 'iot-currency-oled', name: 'Currency Rates Board (OLED)', category: 'iot', level: 'intermediate',
    description: 'Downloads today\'s exchange rates (open.er-api.com, base USD) and shows how many taka one dollar, euro, pound, riyal and rupee cost on the OLED, refreshed every hour.',
    tags: ['exchange rate', 'currency', 'taka', 'BDT', 'dollar', 'OLED', 'HTTPS', 'JSON'],
    parts: [esp, oled],
    wires: oledWires(esp, oled),
    code: `// Exchange rates -> OLED: 1 USD / EUR / GBP / SAR / INR in taka
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

${WIFI}const char* URL = "https://open.er-api.com/v6/latest/USD";
const char* SHOW[] = { "USD", "EUR", "GBP", "SAR", "INR" };

Adafruit_SSD1306 display(128, 64, &Wire, -1);

void setup() {
  Serial.begin(115200);
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  display.setTextColor(SSD1306_WHITE);
  display.clearDisplay();
  display.print("Rates...");
  display.display();
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(300);
}

void loop() {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  http.begin(client, URL);
  if (http.GET() == HTTP_CODE_OK) {
    DynamicJsonDocument doc(8192);
    // only keep what we need: the result, the date and the rates
    StaticJsonDocument<128> filter;
    filter["result"] = true;
    filter["time_last_update_utc"] = true;
    filter["rates"] = true;
    if (!deserializeJson(doc, http.getString(), DeserializationOption::Filter(filter))) {
      float bdt = doc["rates"]["BDT"];              // taka for 1 USD
      display.clearDisplay();
      display.setTextSize(1);
      display.setCursor(0, 0);
      display.println("Taka (BDT) for 1:");
      display.drawFastHLine(0, 9, 128, SSD1306_WHITE);
      display.setCursor(0, 12);
      for (const char* c : SHOW) {
        float rate = doc["rates"][c];              // units of c for 1 USD
        float taka = bdt / rate;
        display.printf("%s  %8.2f\\n", c, taka);
        Serial.printf("1 %s = %.2f BDT\\n", c, taka);
      }
      String upd = doc["time_last_update_utc"].as<String>();   // "Mon, 12 Oct 2026 00:01:00 +0000"
      display.setCursor(0, 56);
      display.print(upd.substring(5, 16));
      display.display();
    }
  } else Serial.println("no data");
  http.end();
  delay(60 * 60 * 1000UL);
}
`,
  };
}

// ------------------------------------------------------------------ 4. ISS tracker → OLED map + LED
export function iotIssTracker() {
  const esp = ESP(), bb = BB(), oled = OLED();
  const led = topLed(esp, bb, 'D27', 8, 'blue', 'led', -17, C.cyan);
  return {
    id: 'iot-iss-tracker', name: 'ISS Tracker (OLED world map)', category: 'iot', level: 'advanced',
    description: 'Where is the International Space Station? Every 5 s the board asks open-notify.org, draws the ISS and its track on a little world map on the OLED and lights the LED when it flies within 2000 km of Dhaka.',
    tags: ['space', 'ISS', 'satellite', 'map', 'open-notify', 'OLED', 'haversine', 'JSON'],
    parts: [bb, esp, oled, ...led.parts],
    wires: [...oledWires(esp, oled), ...led.wires, gndTopRow(esp, bb)],
    code: `// ISS tracker: position from open-notify.org -> OLED map, LED when it is near
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

${WIFI}const char* URL = "http://api.open-notify.org/iss-now.json";
const float HOME_LAT = 23.81, HOME_LON = 90.41;    // Dhaka
const int LED = 27;

Adafruit_SSD1306 display(128, 64, &Wire, -1);
int trackX[60], trackY[60], trackN = 0, trackHead = 0;   // the last 60 positions (a ring buffer)

// map: longitude -180..180 -> x 0..127, latitude 90..-90 -> y 0..55
int mapX(float lon) { return (int)((lon + 180) / 360 * 127); }
int mapY(float lat) { return (int)((90 - lat) / 180 * 55); }

float distanceKm(float lat1, float lon1, float lat2, float lon2) {   // haversine
  float p = PI / 180;
  float a = 0.5 - cos((lat2 - lat1) * p) / 2 + cos(lat1 * p) * cos(lat2 * p) * (1 - cos((lon2 - lon1) * p)) / 2;
  return 12742 * asin(sqrt(a));
}

void drawMap(float lat, float lon, float km) {
  display.clearDisplay();
  display.drawRect(0, 0, 128, 56, SSD1306_WHITE);
  display.drawFastHLine(1, mapY(0), 126, SSD1306_WHITE);              // equator
  for (int lo = -120; lo <= 120; lo += 60)
    for (int y = 2; y < 55; y += 4) display.drawPixel(mapX(lo), y, SSD1306_WHITE);
  display.drawCircle(mapX(HOME_LON), mapY(HOME_LAT), 2, SSD1306_WHITE); // home
  for (int i = 0; i < trackN; i++) display.drawPixel(trackX[i], trackY[i], SSD1306_WHITE);
  display.fillCircle(mapX(lon), mapY(lat), 3, SSD1306_WHITE);         // the ISS
  display.setCursor(0, 57);
  display.printf("%5.1f %6.1f %5dkm", lat, lon, (int)km);
  display.display();
}

void setup() {
  Serial.begin(115200);
  pinMode(LED, OUTPUT);
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  display.setTextColor(SSD1306_WHITE);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(300);
}

void loop() {
  HTTPClient http;
  http.begin(URL);
  if (http.GET() == HTTP_CODE_OK) {
    StaticJsonDocument<256> doc;
    if (!deserializeJson(doc, http.getString())) {
      float lat = atof(doc["iss_position"]["latitude"]);     // the numbers come as strings
      float lon = atof(doc["iss_position"]["longitude"]);
      float km = distanceKm(HOME_LAT, HOME_LON, lat, lon);
      trackX[trackHead] = mapX(lon);
      trackY[trackHead] = mapY(lat);
      trackHead = (trackHead + 1) % 60;
      if (trackN < 60) trackN++;
      drawMap(lat, lon, km);
      digitalWrite(LED, km < 2000);
      Serial.printf("ISS at %.2f, %.2f  -  %.0f km from home\\n", lat, lon, km);
    }
  }
  http.end();
  delay(5000);
}
`,
  };
}

// ------------------------------------------------------------------ 5. sunset street light (ESP8266 + relay)
export function iotSunsetLight() {
  const esp = NODEMCU();
  const relay = at('relay', 'VCC', 130, 380, { trigger: 'high' }, 0, 'relay');
  const lamp = at('lamp', '1', 250, 250, { rating: '12' }, 0, 'lamp');
  const psu = at('power-supply', '-', 330, 250, { voltage: 12 }, 0, 'psu');
  return {
    id: 'iot-sunset-light', name: 'Sunset Street Light (NodeMCU)', category: 'iot', level: 'intermediate',
    description: 'A NodeMCU gets today\'s sunrise and sunset for its location (sunrise-sunset.org) and the time from NTP, and switches a 12 V lamp through a relay on at sunset and off at sunrise — no light sensor needed.',
    tags: ['ESP8266', 'sunrise', 'sunset', 'relay', 'lamp', 'NTP', 'automation', 'HTTPS'],
    parts: [esp, relay, lamp, psu],
    wires: [
      R(esp, 'D1', relay, 'IN', C.orange, [400]),
      R(esp, 'GND.4', relay, 'GND', C.black, [410]),
      R(esp, 'VIN', relay, 'VCC', C.red, [-20, 175, 420]),
      R(relay, 'NO', lamp, '1', C.yellow, [280]),
      R(relay, 'COM', psu, '+', C.red, [290]),
      R(lamp, '2', psu, '-', C.black, [270]),
    ],
    code: `// Street light: on from sunset to sunrise (sunrise-sunset.org + NTP), NodeMCU + relay
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <time.h>

${WIFI}const char* URL = "https://api.sunrise-sunset.org/json?lat=23.81&lng=90.41&formatted=0&tzid=Asia/Dhaka";
const int RELAY = D1;
int sunrise = -1, sunset = -1;           // minutes after midnight (local time)
int loadedDay = -1;
bool lampOn = false;

// "2026-10-12T17:35:44+06:00" -> 17 * 60 + 35
int minutesOf(String iso) { return iso.substring(11, 13).toInt() * 60 + iso.substring(14, 16).toInt(); }

bool loadSun() {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  http.begin(client, URL);
  bool ok = false;
  if (http.GET() == HTTP_CODE_OK) {
    StaticJsonDocument<1024> doc;
    if (!deserializeJson(doc, http.getString())) {
      sunrise = minutesOf(doc["results"]["sunrise"].as<String>());
      sunset = minutesOf(doc["results"]["sunset"].as<String>());
      Serial.printf("Sunrise %02d:%02d  Sunset %02d:%02d\\n", sunrise / 60, sunrise % 60, sunset / 60, sunset % 60);
      ok = true;
    }
  }
  http.end();
  return ok;
}

void setup() {
  Serial.begin(115200);
  pinMode(RELAY, OUTPUT);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(300);
  configTime(6 * 3600, 0, "pool.ntp.org");
}

void loop() {
  time_t t = time(nullptr);
  if (t < 100000) { delay(500); return; }             // NTP not there yet
  struct tm* now = localtime(&t);
  if (now->tm_yday != loadedDay && loadSun()) loadedDay = now->tm_yday;
  if (sunrise < 0) { delay(5000); return; }

  int m = now->tm_hour * 60 + now->tm_min;
  bool dark = m >= sunset || m < sunrise;
  static bool first = true;
  if (dark != lampOn || first) {
    first = false;
    lampOn = dark;
    digitalWrite(RELAY, lampOn);
    Serial.printf("%02d:%02d  lamp %s\\n", now->tm_hour, now->tm_min, lampOn ? "ON (night)" : "OFF (day)");
  }
  delay(1000);
}
`,
  };
}

// ------------------------------------------------------------------ 6. tomorrow's forecast → servo dial + umbrella LED
export function iotForecastDial() {
  const esp = ESP(), bb = BB();
  const servo = at('servo', 'GND', 20, 250, { model: 'sg90' }, 0, 'servo');
  const led = topLed(esp, bb, 'D27', 8, 'blue', 'led', -17, C.cyan);
  return {
    id: 'iot-forecast-dial', name: 'Weather Forecast Dial (servo)', category: 'iot', level: 'intermediate',
    description: 'Reads tomorrow\'s forecast for Dhaka (Open-Meteo daily forecast). A servo points at sunny / cloudy / rain on a printed dial, and the blue "umbrella" LED lights when the chance of rain is over 50 %.',
    tags: ['forecast', 'weather', 'rain', 'servo', 'open-meteo', 'umbrella', 'JSON'],
    parts: [bb, esp, servo, ...led.parts],
    wires: [
      R(esp, 'D18', servo, 'PWM', C.orange, [270]),
      R(esp, 'GND.2', servo, 'GND', C.black, [290]),
      R(esp, 'VIN', servo, 'V+', C.red, [-5, 190, 300]),
      ...led.wires, gndTopRow(esp, bb),
    ],
    code: `// Tomorrow's weather on a servo dial: 0 = sunny, 90 = cloudy, 180 = rain
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>

${WIFI}const char* URL = "http://api.open-meteo.com/v1/forecast?latitude=23.81&longitude=90.41"
                  "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max"
                  "&timezone=auto&forecast_days=2";
const int SERVO_PIN = 18, UMBRELLA = 27;
Servo dial;

int angleFor(int code) {                 // WMO weather code -> dial position
  if (code <= 1) return 0;               // clear
  if (code <= 48) return 90;             // clouds, fog
  return 180;                            // drizzle, rain, showers, thunder
}

void setup() {
  Serial.begin(115200);
  pinMode(UMBRELLA, OUTPUT);
  dial.attach(SERVO_PIN);
  dial.write(90);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(300);
}

void loop() {
  HTTPClient http;
  http.begin(URL);
  if (http.GET() == HTTP_CODE_OK) {
    StaticJsonDocument<1536> doc;
    if (!deserializeJson(doc, http.getString())) {
      JsonObject d = doc["daily"];
      int code = d["weather_code"][1];                  // [0] = today, [1] = tomorrow
      int rain = d["precipitation_probability_max"][1];
      float hi = d["temperature_2m_max"][1], lo = d["temperature_2m_min"][1];
      dial.write(angleFor(code));
      digitalWrite(UMBRELLA, rain > 50);
      Serial.printf("Tomorrow %s: code %d, %.0f-%.0f C, rain %d %%%s\\n", (const char*)d["time"][1], code, lo, hi, rain, rain > 50 ? "  -> take an umbrella!" : "");
    }
  }
  http.end();
  delay(30 * 60 * 1000UL);
}
`,
  };
}

// ------------------------------------------------------------------ 7. real temperature on a NeoPixel ring
export function iotWeatherNeopixel() {
  const esp = ESP();
  const ring = at('neopixel', 'GND', 170, 250, { layout: 'ring16' }, 0, 'ring');
  return {
    id: 'iot-weather-neopixel', name: 'NeoPixel Outdoor Thermometer', category: 'iot', level: 'beginner',
    description: 'The outdoor temperature of Dhaka (Open-Meteo) as a ring of light: more LEDs = warmer, blue when cool, green when pleasant, orange and red when hot. The first LED blinks while it updates.',
    tags: ['temperature', 'weather', 'NeoPixel', 'WS2812', 'open-meteo', 'colour', 'JSON'],
    parts: [esp, ring],
    wires: [
      R(esp, 'D18', ring, 'DIN', C.green, [270]),
      R(esp, 'GND.2', ring, 'GND', C.black, [290]),
      R(esp, 'VIN', ring, 'VCC', C.red, [-20, 160, 280]),
    ],
    code: `// Outdoor thermometer: temperature from the internet -> NeoPixel ring (16 LEDs)
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Adafruit_NeoPixel.h>

${WIFI}const char* URL = "http://api.open-meteo.com/v1/forecast?latitude=23.81&longitude=90.41&current=temperature_2m";
const int PIN = 18, COUNT = 16;
Adafruit_NeoPixel ring(COUNT, PIN, NEO_GRB + NEO_KHZ800);

uint32_t colorFor(float t) {
  if (t < 15) return ring.Color(0, 60, 255);       // cold: blue
  if (t < 24) return ring.Color(0, 200, 120);      // pleasant: green
  if (t < 32) return ring.Color(255, 120, 0);      // warm: orange
  return ring.Color(255, 0, 0);                    // hot: red
}

void show(float t) {
  int n = constrain(map((int)t, 0, 40, 1, COUNT), 1, COUNT);   // 0 C -> 1 LED, 40 C -> 16 LEDs
  ring.clear();
  for (int i = 0; i < n; i++) ring.setPixelColor(i, colorFor(t));
  ring.show();
}

void setup() {
  Serial.begin(115200);
  ring.begin();
  ring.setBrightness(80);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(300);
}

void loop() {
  ring.setPixelColor(0, ring.Color(255, 255, 255));    // "updating"
  ring.show();
  HTTPClient http;
  http.begin(URL);
  if (http.GET() == HTTP_CODE_OK) {
    StaticJsonDocument<512> doc;
    if (!deserializeJson(doc, http.getString())) {
      float t = doc["current"]["temperature_2m"];
      show(t);
      Serial.printf("Outside: %.1f C\\n", t);
    }
  }
  http.end();
  delay(10 * 60 * 1000UL);
}
`,
  };
}

// ------------------------------------------------------------------ 8. quote of the moment, scrolling on an LCD
export function iotQuoteLcd() {
  const esp = ESP(), lcd = LCD();
  return {
    id: 'iot-quote-lcd', name: 'Quote Ticker (scrolling LCD)', category: 'iot', level: 'beginner',
    description: 'Fetches a random quote from a JSON API (dummyjson.com) every minute and scrolls it across the first line of the LCD, the author on the second line.',
    tags: ['quote', 'text', 'scrolling', 'LCD', 'dummyjson', 'HTTPS', 'JSON'],
    parts: [esp, lcd],
    wires: lcdWires(esp, lcd),
    code: `// Quote ticker: random quote (JSON API) scrolling on a 16x2 LCD
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <LiquidCrystal_I2C.h>

${WIFI}LiquidCrystal_I2C lcd(0x27, 16, 2);
String quote = "Loading...", author = "";
unsigned long lastFetch = 0;
int pos = 0;

void fetchQuote() {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  http.begin(client, "https://dummyjson.com/quotes/random");
  if (http.GET() == HTTP_CODE_OK) {
    StaticJsonDocument<1024> doc;
    if (!deserializeJson(doc, http.getString())) {
      quote = doc["quote"].as<String>();
      author = doc["author"].as<String>();
      Serial.println("\\"" + quote + "\\"  - " + author);
      pos = 0;
      lcd.setCursor(0, 1);
      lcd.print(("- " + author + "                ").substring(0, 16));
    }
  }
  http.end();
}

void setup() {
  Serial.begin(115200);
  lcd.init();
  lcd.backlight();
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(300);
  fetchQuote();
  lastFetch = millis();
}

void loop() {
  if (millis() - lastFetch > 60000) { fetchQuote(); lastFetch = millis(); }
  // a 16-character window that slides over the text
  String text = "                " + quote + "   ";
  lcd.setCursor(0, 0);
  lcd.print(text.substring(pos, pos + 16));
  pos = (pos + 1) % (text.length() - 15);
  delay(300);
}
`,
  };
}

// ------------------------------------------------------------------ 9. TM1637: outdoor temperature
export function iotTm1637Temp() {
  const esp = ESP();
  const tm = at('tm1637', 'CLK', 50, -50, {}, 0, 'tm');
  return {
    id: 'iot-tm1637-temp', name: 'Outdoor Temperature on TM1637', category: 'iot', level: 'beginner',
    description: 'Reads the outdoor temperature as plain text from wttr.in (format=%t) and shows it on a 4-digit TM1637 display as "29°C". Two signal wires and one line of HTTP.',
    tags: ['temperature', 'wttr.in', 'TM1637', '7-segment', 'weather', 'plain text'],
    parts: [esp, tm],
    wires: [
      R(tm, 'CLK', esp, 'D32', C.yellow),
      R(tm, 'DIO', esp, 'D33', C.green),
      R(tm, 'VCC', esp, '3V3', C.red, [-20, 185, 104]),
      R(tm, 'GND', esp, 'GND.2', C.black, [-30, 195, 112]),
    ],
    code: `// Outdoor temperature (wttr.in, plain text) -> TM1637 "29°C"
#include <WiFi.h>
#include <HTTPClient.h>
#include <TM1637Display.h>

${WIFI}const int CLK = 32, DIO = 33;
TM1637Display display(CLK, DIO);

const uint8_t DEGREE = SEG_A | SEG_B | SEG_F | SEG_G;
const uint8_t LETTER_C = SEG_A | SEG_D | SEG_E | SEG_F;
const uint8_t MINUS = SEG_G;

void showTemp(int t) {
  uint8_t d[4] = { 0, 0, DEGREE, LETTER_C };
  int a = abs(t);
  d[1] = display.encodeDigit(a % 10);
  if (a >= 10) d[0] = display.encodeDigit(a / 10 % 10);
  if (t < 0) d[0] = MINUS;
  display.setSegments(d);
}

void setup() {
  Serial.begin(115200);
  display.setBrightness(4);
  uint8_t dashes[4] = { MINUS, MINUS, MINUS, MINUS };
  display.setSegments(dashes);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(300);
}

void loop() {
  HTTPClient http;
  http.begin("http://wttr.in/Dhaka?format=%t");   // answers e.g. "+29°C"
  if (http.GET() == HTTP_CODE_OK) {
    String s = http.getString();
    int t = s.toInt();                              // "+29°C" -> 29
    showTemp(t);
    Serial.println("Dhaka " + s + " -> " + String(t));
  }
  http.end();
  delay(15 * 60 * 1000UL);
}
`,
  };
}

// ------------------------------------------------------------------ 10. earthquakes → OLED + buzzer
export function iotEarthquakeAlert() {
  const esp = ESP(), oled = OLED();
  const buz = at('buzzer', '+', 60, -50, { kind: 'active' }, 0, 'buzzer');
  return {
    id: 'iot-earthquake-alert', name: 'Earthquake Alert (USGS feed)', category: 'iot', level: 'advanced',
    description: 'Reads the USGS feed of the world\'s M4.5+ earthquakes of the past day (GeoJSON), lists the strongest ones on the OLED with their distance from Dhaka, and beeps for a new quake of M6 or more, or any quake within 1000 km.',
    tags: ['earthquake', 'USGS', 'GeoJSON', 'alarm', 'OLED', 'buzzer', 'HTTPS', 'haversine'],
    parts: [esp, oled, buz],
    wires: [...oledWires(esp, oled), R(esp, 'D25', buz, '+', C.orange, [-30]), R(esp, 'GND.1', buz, '-', C.black, [-20])],
    code: `// Earthquake alert: USGS GeoJSON feed -> OLED list + buzzer
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

${WIFI}const char* URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson";
const float HOME_LAT = 23.81, HOME_LON = 90.41;
const int BUZZER = 25;
Adafruit_SSD1306 display(128, 64, &Wire, -1);
String lastAlarm = "";

float distanceKm(float lat1, float lon1, float lat2, float lon2) {
  float p = PI / 180;
  float a = 0.5 - cos((lat2 - lat1) * p) / 2 + cos(lat1 * p) * cos(lat2 * p) * (1 - cos((lon2 - lon1) * p)) / 2;
  return 12742 * asin(sqrt(a));
}

void setup() {
  Serial.begin(115200);
  pinMode(BUZZER, OUTPUT);
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  display.setTextColor(SSD1306_WHITE);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(300);
}

void loop() {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  http.begin(client, URL);
  if (http.GET() == HTTP_CODE_OK) {
    // keep only magnitude, place, time, id and coordinates of every quake
    StaticJsonDocument<256> filter;
    filter["metadata"]["count"] = true;
    JsonObject f = filter["features"].createNestedObject();
    f["id"] = true;
    f["properties"]["mag"] = true;
    f["properties"]["place"] = true;
    f["geometry"]["coordinates"] = true;
    DynamicJsonDocument doc(16384);
    if (!deserializeJson(doc, http.getString(), DeserializationOption::Filter(filter))) {
      JsonArray quakes = doc["features"];
      display.clearDisplay();
      display.setCursor(0, 0);
      display.printf("Quakes M4.5+ 24h: %d\\n", (int)doc["metadata"]["count"]);
      int shown = 0;
      for (JsonObject q : quakes) {                       // newest first
        float mag = q["properties"]["mag"];
        float lon = q["geometry"]["coordinates"][0], lat = q["geometry"]["coordinates"][1];
        int km = distanceKm(HOME_LAT, HOME_LON, lat, lon);
        String place = q["properties"]["place"].as<String>();
        if (shown < 5) {
          String where = place.substring(place.lastIndexOf(" of ") >= 0 ? place.lastIndexOf(" of ") + 4 : 0);
          display.printf("M%.1f %5dkm %s\\n", mag, km, where.substring(0, 7).c_str());
          shown++;
        }
        String id = q["id"].as<String>();
        if ((mag >= 6.0 || km < 1000) && id != lastAlarm && shown == 1) {
          lastAlarm = id;
          Serial.printf("ALERT: M%.1f %s (%d km away)\\n", mag, place.c_str(), km);
          for (int k = 0; k < 5; k++) { digitalWrite(BUZZER, HIGH); delay(150); digitalWrite(BUZZER, LOW); delay(150); }
        }
        if (shown <= 3) Serial.printf("M%.1f  %s  (%d km)\\n", mag, place.c_str(), km);
      }
      display.display();
    }
  } else Serial.println("feed not available");
  http.end();
  delay(5 * 60 * 1000UL);
}
`,
  };
}
