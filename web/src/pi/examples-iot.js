// IoT projects with live data for the Raspberry Pi and the Pico W: air quality, prayer times, exchange
// rates, the ISS, a sunset light, a Flask weather dashboard, earthquakes, quotes, a NeoPixel and a
// TM1637 thermometer. The services are real public APIs: with Settings → Real internet on (and the
// phone online) the programs get the real data; offline the simulator answers in the same format.
// Same format as examples.js — the circuit is wired automatically (autowire.js) from `parts`.

const L = (pin, color = 'red') => ({ type: 'led', pins: { a: pin }, props: { color } });
const LCD = { type: 'lcd', pins: {} };
const OLED = { type: 'oled', pins: {} };

export const PI_IOT = [
  { file: 'iot_air_quality.py', title: 'IoT: air quality monitor (AQI on LCD + traffic light)', tags: ['IoT', 'requests', 'LCD', 'AQI', 'PM2.5', 'pollution'], parts: [LCD, L(17, 'green'), L(27, 'yellow'), L(22, 'red')], code: `# Air quality of Dhaka (US AQI + PM2.5, Open-Meteo) on the LCD; green / yellow / red LED = good / moderate / unhealthy
import time
import requests
from gpiozero import TrafficLights
from RPLCD.i2c import CharLCD

URL = ("https://air-quality-api.open-meteo.com/v1/air-quality"
       "?latitude=23.81&longitude=90.41&current=us_aqi,pm2_5,pm10")
LEVELS = [(50, "Good"), (100, "Moderate"), (150, "Sensitive"), (200, "Unhealthy"), (300, "Very unhlthy"), (999, "Hazardous")]

lcd = CharLCD('PCF8574', 0x27, cols=16, rows=2)
lights = TrafficLights(red=22, amber=27, green=17)

def level(aqi):
    for limit, name in LEVELS:
        if aqi <= limit:
            return name

while True:
    try:
        now = requests.get(URL, timeout=10).json()["current"]
        aqi, pm25 = now["us_aqi"], now["pm2_5"]
        lcd.clear()
        lcd.write_string("AQI %d %s" % (aqi, level(aqi)))
        lcd.cursor_pos = (1, 0)
        lcd.write_string("PM2.5 %.1f ug" % pm25)
        lights.off()
        if aqi <= 50:
            lights.green.on()
        elif aqi <= 150:
            lights.amber.on()
        else:
            lights.red.on()
        print("AQI", aqi, level(aqi), " PM2.5", pm25, " PM10", now["pm10"])
    except Exception as e:
        print("error:", e)
    time.sleep(600)
` },
  { file: 'iot_prayer_times.py', title: 'IoT: prayer times clock (LCD + buzzer)', tags: ['IoT', 'requests', 'LCD', 'salah', 'namaz', 'azan', 'aladhan'], parts: [LCD, { type: 'buzzer', pins: { a: 18 } }], code: `# Today's prayer times (AlAdhan API) — the LCD shows the next one and the time left; the buzzer beeps when it starts
import time
import requests
from gpiozero import Buzzer
from RPLCD.i2c import CharLCD

CITY, COUNTRY, METHOD = "Dhaka", "Bangladesh", 1      # method 1 = University of Islamic Sciences, Karachi
NAMES = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"]

lcd = CharLCD('PCF8574', 0x27, cols=16, rows=2)
buzzer = Buzzer(18)

def load():
    url = "https://api.aladhan.com/v1/timingsByCity?city=%s&country=%s&method=%d" % (CITY, COUNTRY, METHOD)
    data = requests.get(url, timeout=10).json()["data"]
    times = {}
    for name in NAMES:
        h, m = data["timings"][name].split(":")
        times[name] = int(h) * 60 + int(m)
        print("%-8s %s" % (name, data["timings"][name]))
    print("Hijri date:", data["date"]["hijri"]["date"], data["date"]["hijri"]["month"]["en"])
    return times

times, day, beeped = None, None, None
while True:
    now = time.localtime()
    if now[7] != day:                     # a new day: load the new times
        try:
            times, day = load(), now[7]
        except Exception as e:
            print("error:", e)
            time.sleep(10)
            continue
    minute = now[3] * 60 + now[4]
    upcoming = [n for n in NAMES if times[n] > minute]
    nxt = upcoming[0] if upcoming else "Fajr"
    left = (times[nxt] - minute) % 1440
    lcd.cursor_pos = (0, 0)
    lcd.write_string("%-7s %02d:%02d   " % (nxt, times[nxt] // 60, times[nxt] % 60))
    lcd.cursor_pos = (1, 0)
    lcd.write_string("in %dh%02dm  %02d:%02d" % (left // 60, left % 60, now[3], now[4]))
    for name in NAMES:
        if times[name] == minute and beeped != name:
            beeped = name
            print("It is time for", name)
            buzzer.beep(0.3, 0.3, n=3, background=True)
    time.sleep(1)
` },
  { file: 'iot_currency_oled.py', title: 'IoT: exchange rates board (OLED)', tags: ['IoT', 'requests', 'OLED', 'currency', 'taka', 'BDT'], parts: [OLED], code: `# How many taka for 1 dollar, euro, pound, riyal, rupee? (open.er-api.com, updated once a day)
import time
import board
import requests
import adafruit_ssd1306

URL = "https://open.er-api.com/v6/latest/USD"
SHOW = ["USD", "EUR", "GBP", "SAR", "INR"]

oled = adafruit_ssd1306.SSD1306_I2C(128, 64, board.I2C(), addr=0x3C)

while True:
    try:
        data = requests.get(URL, timeout=10).json()
        rates = data["rates"]                       # units of each currency for 1 USD
        bdt = rates["BDT"]
        oled.fill(0)
        oled.text("Taka (BDT) for 1", 0, 0, 1)
        oled.hline(0, 9, 128, 1)
        for i, code in enumerate(SHOW):
            taka = bdt / rates[code]
            oled.text("%s %9.2f" % (code, taka), 0, 12 + i * 10, 1)
            print("1 %s = %.2f BDT" % (code, taka))
        oled.show()
        print("updated:", data["time_last_update_utc"])
    except Exception as e:
        print("error:", e)
    time.sleep(3600)
` },
  { file: 'iot_iss_tracker.py', title: 'IoT: ISS tracker on an OLED world map', tags: ['IoT', 'requests', 'OLED', 'space', 'ISS', 'map'], parts: [OLED, L(17, 'blue')], code: `# Where is the International Space Station? A dot on a little world map; the LED lights when it is within 2000 km
import math
import time
import board
import requests
import adafruit_ssd1306
from gpiozero import LED

HOME = (23.81, 90.41)                       # Dhaka
oled = adafruit_ssd1306.SSD1306_I2C(128, 64, board.I2C(), addr=0x3C)
near_led = LED(17)
track = []

def xy(lat, lon):                           # equirectangular map 128 x 56
    return int((lon + 180) / 360 * 127), int((90 - lat) / 180 * 55)

def distance_km(a, b):                      # haversine
    p = math.pi / 180
    h = 0.5 - math.cos((b[0] - a[0]) * p) / 2 + math.cos(a[0] * p) * math.cos(b[0] * p) * (1 - math.cos((b[1] - a[1]) * p)) / 2
    return 12742 * math.asin(math.sqrt(h))

while True:
    try:
        pos = requests.get("http://api.open-notify.org/iss-now.json", timeout=10).json()["iss_position"]
        iss = (float(pos["latitude"]), float(pos["longitude"]))
        km = distance_km(HOME, iss)
        track = (track + [xy(*iss)])[-60:]
        oled.fill(0)
        oled.rect(0, 0, 128, 56, 1)
        oled.hline(1, xy(0, 0)[1], 126, 1)          # equator
        hx, hy = xy(*HOME)
        oled.rect(hx - 1, hy - 1, 3, 3, 1)          # home
        for x, y in track:
            oled.pixel(x, y, 1)
        x, y = track[-1]
        oled.fill_rect(x - 2, y - 2, 5, 5, 1)       # the ISS
        oled.text("%.0f,%.0f %dkm" % (iss[0], iss[1], km), 0, 57, 1)
        oled.show()
        near_led.value = km < 2000
        print("ISS at %.2f, %.2f - %d km from home" % (iss[0], iss[1], km))
    except Exception as e:
        print("error:", e)
    time.sleep(5)
` },
  { file: 'iot_sunset_light.py', title: 'IoT: sunset street light (relay + lamp)', tags: ['IoT', 'requests', 'relay', 'sunrise', 'sunset', 'automation'], parts: [{ type: 'relay', pins: { a: 17 } }], code: `# The lamp turns on at sunset and off at sunrise — the times come from sunrise-sunset.org for your place
import time
import requests
from gpiozero import OutputDevice

URL = "https://api.sunrise-sunset.org/json?lat=23.81&lng=90.41&formatted=0&tzid=Asia/Dhaka"
relay = OutputDevice(17, active_high=True, initial_value=False)

def minutes(iso):                           # "2026-10-12T17:35:44+06:00" -> 17 * 60 + 35
    return int(iso[11:13]) * 60 + int(iso[14:16])

day, sunrise, sunset, state = None, 0, 0, None
while True:
    now = time.localtime()
    if now[7] != day:
        try:
            r = requests.get(URL, timeout=10).json()["results"]
            sunrise, sunset, day = minutes(r["sunrise"]), minutes(r["sunset"]), now[7]
            print("Sunrise %02d:%02d  Sunset %02d:%02d  (day length %d min)" % (sunrise // 60, sunrise % 60, sunset // 60, sunset % 60, r["day_length"] // 60))
        except Exception as e:
            print("error:", e)
            time.sleep(10)
            continue
    m = now[3] * 60 + now[4]
    dark = m >= sunset or m < sunrise
    if dark != state:
        state = dark
        relay.value = dark
        print("%02d:%02d lamp %s" % (now[3], now[4], "ON (night)" if dark else "OFF (day)"))
    time.sleep(1)
` },
  { file: 'iot_weather_dashboard.py', title: 'IoT: Flask weather dashboard (forecast + air + sun)', tags: ['IoT', 'Flask', 'web', 'forecast', 'weather', 'AQI', 'dashboard'], parts: [L(17, 'blue')], code: `# A web page on http://localhost:5000/ with the 3-day forecast, the air quality and sunrise / sunset,
# made from two web APIs. The blue LED means "rain likely tomorrow". JSON for other programs: /api/weather
import time
import requests
from flask import Flask, jsonify
from gpiozero import LED

LAT, LON = 23.81, 90.41
umbrella = LED(17)
app = Flask(__name__)
cache = {"at": 0, "data": None}
ICON = {0: "☀️", 1: "🌤", 2: "⛅", 3: "☁️", 45: "🌫", 51: "🌦", 61: "🌧", 63: "🌧", 65: "🌧", 80: "🌦", 95: "⛈"}

def weather():
    if cache["data"] and time.time() - cache["at"] < 600:
        return cache["data"]
    fc = requests.get("http://api.open-meteo.com/v1/forecast?latitude=%s&longitude=%s&timezone=auto&forecast_days=3"
                      "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset" % (LAT, LON), timeout=10).json()["daily"]
    air = requests.get("https://air-quality-api.open-meteo.com/v1/air-quality?latitude=%s&longitude=%s&current=us_aqi,pm2_5" % (LAT, LON), timeout=10).json()["current"]
    days = []
    for i in range(3):
        days.append({"date": fc["time"][i], "code": fc["weather_code"][i], "max": fc["temperature_2m_max"][i],
                     "min": fc["temperature_2m_min"][i], "rain": fc["precipitation_probability_max"][i]})
    data = {"days": days, "aqi": air["us_aqi"], "pm25": air["pm2_5"], "sunrise": fc["sunrise"][0][11:], "sunset": fc["sunset"][0][11:]}
    umbrella.value = days[1]["rain"] > 50
    cache["at"], cache["data"] = time.time(), data
    print("updated:", data["days"][0], "AQI", data["aqi"])
    return data

@app.route("/api/weather")
def api():
    return jsonify(weather())

@app.route("/")
def home():
    w = weather()
    cards = "".join('<div class="c"><b>%s</b><span class="i">%s</span>%.0f° / %.0f°<br><small>rain %d %%</small></div>'
                    % (d["date"][5:], ICON.get(d["code"], "?"), d["max"], d["min"], d["rain"]) for d in w["days"])
    return ('<!doctype html><meta name="viewport" content="width=device-width"><title>Weather - Raspberry Pi</title>'
            '<style>body{font-family:sans-serif;background:#0f172a;color:#e2e8f0;margin:0;padding:18px}'
            '.r{display:flex;gap:10px}.c{flex:1;background:#1e293b;border-radius:14px;padding:12px;text-align:center}'
            '.i{display:block;font-size:34px;margin:6px 0}.a{margin-top:14px;background:#1e293b;border-radius:14px;padding:12px}</style>'
            '<h2>Dhaka weather</h2><div class="r">%s</div>'
            '<div class="a">Air quality: <b>AQI %d</b> (PM2.5 %.1f µg/m³)<br>Sunrise %s · Sunset %s</div>'
            % (cards, w["aqi"], w["pm25"], w["sunrise"], w["sunset"]))

print("Open http://localhost:5000/ in Chromium")
app.run(host="0.0.0.0", port=5000)
` },
  { file: 'iot_earthquake_alert.py', title: 'IoT: earthquake alert (USGS feed, LCD + buzzer)', tags: ['IoT', 'requests', 'LCD', 'earthquake', 'USGS', 'GeoJSON', 'alarm'], parts: [LCD, { type: 'buzzer', pins: { a: 18 } }], code: `# The world's M4.5+ earthquakes of the last day (USGS GeoJSON). The LCD shows the latest one;
# the buzzer sounds for a new quake of M6 or more, or any quake within 1000 km of home.
import math
import time
import requests
from gpiozero import Buzzer
from RPLCD.i2c import CharLCD

URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson"
HOME = (23.81, 90.41)
lcd = CharLCD('PCF8574', 0x27, cols=16, rows=2)
buzzer = Buzzer(18)
alarmed = set()

def distance_km(a, b):
    p = math.pi / 180
    h = 0.5 - math.cos((b[0] - a[0]) * p) / 2 + math.cos(a[0] * p) * math.cos(b[0] * p) * (1 - math.cos((b[1] - a[1]) * p)) / 2
    return 12742 * math.asin(math.sqrt(h))

while True:
    try:
        feed = requests.get(URL, timeout=15).json()
        quakes = feed["features"]                     # newest first
        print(feed["metadata"]["title"], "-", len(quakes), "quakes")
        for q in quakes[:5]:
            lon, lat, depth = q["geometry"]["coordinates"]
            print("  M%.1f  %-40s %5d km away, %d km deep" % (q["properties"]["mag"], q["properties"]["place"], distance_km(HOME, (lat, lon)), depth))
        if quakes:
            q = quakes[0]
            mag, place = q["properties"]["mag"], q["properties"]["place"]
            lon, lat = q["geometry"]["coordinates"][:2]
            km = distance_km(HOME, (lat, lon))
            lcd.clear()
            lcd.write_string("M%.1f %5dkm" % (mag, km))
            lcd.cursor_pos = (1, 0)
            lcd.write_string(place.split(" of ")[-1][:16])
            if (mag >= 6 or km < 1000) and q["id"] not in alarmed:
                alarmed.add(q["id"])
                print("ALERT:", place)
                buzzer.beep(0.15, 0.15, n=5, background=True)
    except Exception as e:
        print("error:", e)
    time.sleep(300)
` },
  { file: 'iot_quote_matrix.py', title: 'IoT: quote ticker on MAX7219 matrices', tags: ['IoT', 'requests', 'MAX7219', 'SPI', 'quote', 'text'], parts: [{ type: 'max7219', pins: { din: 10, clk: 11, cs: 8 }, props: { modules: 4 } }], code: `# A random quote from a JSON API scrolls across four 8x8 LED matrices; a new one every time it has scrolled by
import time
import spidev
import requests
import max7219

spi = spidev.SpiDev()
spi.open(0, 0)
spi.max_speed_hz = 8000000
display = max7219.Matrix8x8(spi, num=4)
display.brightness(2)

def get_quote():
    try:
        q = requests.get("https://dummyjson.com/quotes/random", timeout=10).json()
        print('"%s" - %s' % (q["quote"], q["author"]))
        return "%s - %s" % (q["quote"], q["author"])
    except Exception as e:
        print("error:", e)
        return "No internet"

while True:
    text = "   " + get_quote() + "   "
    for x in range(32, -len(text) * 8, -1):
        display.fill(0)
        display.text(text, x, 0, 1)
        display.show()
        time.sleep(0.02)
` },
  { file: 'iot_weather_neopixel.py', title: 'IoT: NeoPixel outdoor thermometer', tags: ['IoT', 'requests', 'neopixel', 'temperature', 'weather'], parts: [{ type: 'neopixel', pins: { din: 18 } }], code: `# The outdoor temperature (Open-Meteo) as a light bar on an 8-LED NeoPixel stick: more LEDs = warmer,
# blue = cool, green = pleasant, orange = warm, red = hot
import time
import board
import requests
import neopixel

URL = "http://api.open-meteo.com/v1/forecast?latitude=23.81&longitude=90.41&current=temperature_2m"
pixels = neopixel.NeoPixel(board.D18, 8, brightness=0.4)

def colour(t):
    if t < 15:
        return (0, 60, 255)
    if t < 24:
        return (0, 200, 120)
    if t < 32:
        return (255, 120, 0)
    return (255, 0, 0)

while True:
    try:
        t = requests.get(URL, timeout=10).json()["current"]["temperature_2m"]
        n = max(1, min(8, int(t / 40 * 8 + 0.5)))     # 0 °C -> 1 LED, 40 °C -> 8 LEDs
        for i in range(8):
            pixels[i] = colour(t) if i < n else (0, 0, 0)
        pixels.show()
        print("Outside %.1f C -> %d LEDs" % (t, n))
    except Exception as e:
        print("error:", e)
    time.sleep(600)
` },
  { file: 'iot_temp_tm1637.py', title: 'IoT: outdoor temperature on TM1637', tags: ['IoT', 'requests', 'TM1637', 'temperature', 'wttr.in'], parts: [{ type: 'tm1637', pins: { clk: 23, dio: 24 } }], code: `# wttr.in answers the temperature as plain text ("+29°C") — show it on the 4-digit display as "29*C"
import time
import requests
import tm1637

tm = tm1637.TM1637(clk=23, dio=24)
tm.show("----")

while True:
    try:
        text = requests.get("http://wttr.in/Dhaka?format=%t", timeout=10).text.strip()
        t = int(text.replace("°C", "").replace("+", ""))
        tm.temperature(t)                  # shows e.g. " 29°C"
        print("Dhaka", text, "->", t)
    except Exception as e:
        tm.show("Err ")
        print("error:", e)
    time.sleep(900)
` },
];

export const PICO_IOT = [
  { file: 'w_air_quality.py', title: 'Pico W: air quality traffic light', tags: ['Pico W', 'IoT', 'AQI', 'urequests', 'LED'], boards: ['picow', 'pico2w'], parts: [L(13, 'green'), L(14, 'yellow'), L(15, 'red')], code: `# The air quality index of Dhaka (Open-Meteo) as a traffic light: green good, yellow moderate, red unhealthy
import network
import time
import urequests
from machine import Pin

green, yellow, red = Pin(13, Pin.OUT), Pin(14, Pin.OUT), Pin(15, Pin.OUT)
URL = "https://air-quality-api.open-meteo.com/v1/air-quality?latitude=23.81&longitude=90.41&current=us_aqi,pm2_5"

wlan = network.WLAN(network.STA_IF)
wlan.active(True)
wlan.connect("RaptiNet", "rapti1234")
while not wlan.isconnected():
    time.sleep(0.3)
print("Wi-Fi OK", wlan.ifconfig()[0])

while True:
    try:
        r = urequests.get(URL)
        now = r.json()["current"]
        r.close()
        aqi = now["us_aqi"]
        green.value(aqi <= 50)
        yellow.value(50 < aqi <= 150)
        red.value(aqi > 150)
        print("AQI", aqi, "PM2.5", now["pm2_5"])
    except Exception as e:
        print("error:", e)
    time.sleep(600)
` },
  { file: 'w_iss_oled.py', title: 'Pico W: where is the ISS? (OLED)', tags: ['Pico W', 'IoT', 'OLED', 'space', 'ISS'], boards: ['picow', 'pico2w'], parts: [OLED], code: `# The position of the International Space Station every 5 s, and how many people are in space right now
import network
import time
import urequests
from machine import Pin, I2C
import ssd1306

oled = ssd1306.SSD1306_I2C(128, 64, I2C(0, sda=Pin(4), scl=Pin(5)))
wlan = network.WLAN(network.STA_IF)
wlan.active(True)
wlan.connect("RaptiNet", "rapti1234")
while not wlan.isconnected():
    time.sleep(0.3)

r = urequests.get("http://api.open-notify.org/astros.json")
people = r.json()["number"]
r.close()
print("People in space:", people)

while True:
    try:
        r = urequests.get("http://api.open-notify.org/iss-now.json")
        p = r.json()["iss_position"]
        r.close()
        lat, lon = float(p["latitude"]), float(p["longitude"])
        oled.fill(0)
        oled.text("ISS position", 0, 0)
        oled.text("lat %8.2f" % lat, 0, 16)
        oled.text("lon %8.2f" % lon, 0, 28)
        oled.text("%s" % ("north" if lat >= 0 else "south") + " / " + ("east" if lon >= 0 else "west"), 0, 40)
        oled.text("in space: %d" % people, 0, 54)
        oled.show()
        print("ISS", lat, lon)
    except Exception as e:
        print("error:", e)
    time.sleep(5)
` },
];
