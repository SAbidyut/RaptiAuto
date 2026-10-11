// More Raspberry Pi / Pico examples: displays (LCD, OLED, TM1637, MAX7219) and IoT (Wi-Fi, web servers, MQTT, cloud APIs).
// Same format as examples.js — the circuit is wired automatically (autowire.js) from `parts`.

const L = (pin, color = 'red') => ({ type: 'led', pins: { a: pin }, props: { color } });
const B = (pin) => ({ type: 'button', pins: { a: pin } });
const LCD = { type: 'lcd', pins: {} };
const OLED = { type: 'oled', pins: {} };
const DHT = (pin) => ({ type: 'dht', pins: { data: pin } });

const WIFI_PI = `# the Raspberry Pi is already on the Wi-Fi (simulated network "RaptiNet")`;

export const PI_MORE = [
  // ------------------------------------------------------------------ displays
  { file: 'lcd_clock.py', title: 'LCD clock + CPU temperature', tags: ['display', 'LCD', 'I2C'], parts: [LCD], code: `# 16x2 LCD (I2C backpack, address 0x27): date, time and the Pi's CPU temperature
# SDA = GPIO2 (pin 3), SCL = GPIO3 (pin 5), VCC = 5V, GND
import time
from RPLCD.i2c import CharLCD
from gpiozero import CPUTemperature

lcd = CharLCD('PCF8574', 0x27, cols=16, rows=2)
cpu = CPUTemperature()
lcd.clear()

while True:
    now = time.localtime()
    lcd.cursor_pos = (0, 0)                       # (row, column)
    lcd.write_string(time.strftime("%a %d/%m %H:%M", now))
    lcd.cursor_pos = (1, 0)
    lcd.write_string("CPU {:4.1f}C    {:02d}".format(cpu.temperature, now[5]))
    time.sleep(0.5)
` },
  { file: 'lcd_parking.py', title: 'LCD parking sensor (HC-SR04)', tags: ['display', 'LCD', 'sensor'], parts: [LCD, { type: 'ultrasonic', pins: { trig: 23, echo: 24 }, props: { cm: 70 } }, { type: 'buzzer', pins: { a: 22 } }], code: `# Distance on the LCD with a bar graph; the buzzer sounds when the object is close
from gpiozero import DistanceSensor, Buzzer
from RPLCD.i2c import CharLCD
from time import sleep

sensor = DistanceSensor(echo=24, trigger=23, max_distance=2)
buzzer = Buzzer(22)
lcd = CharLCD('PCF8574', 0x27, cols=16, rows=2)
lcd.write_string("Parking sensor")
sleep(1)
lcd.clear()

while True:
    cm = sensor.distance * 100
    bars = int(max(0, min(16, (120 - cm) / 120 * 16)))
    lcd.cursor_pos = (0, 0)
    lcd.write_string("Distance {:4.0f} cm".format(cm))
    lcd.cursor_pos = (1, 0)
    lcd.write_string("{:<16}".format("#" * bars))
    if cm < 25:
        buzzer.on()
    else:
        buzzer.off()
    sleep(0.15)
` },
  { file: 'lcd_menu.py', title: 'LCD menu with two buttons', tags: ['display', 'LCD', 'project'], parts: [LCD, B(5), B(6), L(17, 'green')], code: `# A tiny menu: button on GPIO5 = next item, button on GPIO6 = select
from gpiozero import Button, LED, CPUTemperature
from RPLCD.i2c import CharLCD
from signal import pause

lcd = CharLCD('PCF8574', 0x27, cols=16, rows=2)
nxt, ok = Button(5), Button(6)
led = LED(17)
cpu = CPUTemperature()

items = ["LED on/off", "Blink LED", "CPU temperature", "About"]
index = 0
message = ""

def draw():
    lcd.clear()
    lcd.write_string(("> " + items[index])[:16])
    lcd.cursor_pos = (1, 0)
    lcd.write_string(message[:16])

def go_next():
    global index, message
    index = (index + 1) % len(items)
    message = ""
    draw()

def select():
    global message
    if index == 0:
        led.toggle()
        message = "LED is " + ("ON" if led.is_lit else "OFF")
    elif index == 1:
        led.blink(0.2, 0.2, n=5, background=True)
        message = "Blinking x5"
    elif index == 2:
        message = "{:.1f} C".format(cpu.temperature)
    else:
        message = "RaptiAuto Pi"
    draw()

nxt.when_pressed = go_next
ok.when_pressed = select
draw()
print("Press the buttons on the Circuit tab")
pause()
` },
  { file: 'oled_hello.py', title: 'OLED: text, frame and bouncing box', tags: ['display', 'OLED', 'I2C'], parts: [OLED], code: `# 128x64 SSD1306 OLED on I2C (SDA = GPIO2, SCL = GPIO3, address 0x3C)
import time
import board
import adafruit_ssd1306

i2c = board.I2C()
oled = adafruit_ssd1306.SSD1306_I2C(128, 64, i2c, addr=0x3C)

x, y, dx, dy = 20, 30, 3, 2
while True:
    oled.fill(0)                                  # clear the frame buffer
    oled.rect(0, 0, 128, 64, 1)                   # border
    oled.text("Raspberry Pi", 20, 4, 1)           # text, x, y, colour
    oled.fill_rect(x, y, 10, 10, 1)               # the box
    x += dx
    y += dy
    if x < 2 or x > 116: dx = -dx
    if y < 16 or y > 52: dy = -dy
    oled.show()                                   # send the buffer to the display
    time.sleep(0.03)
` },
  { file: 'oled_sysmon.py', title: 'OLED system monitor', tags: ['display', 'OLED', 'psutil'], parts: [OLED], code: `# CPU, memory, temperature, IP address and uptime of the Pi on an OLED
import time
import socket
import board
import psutil
import adafruit_ssd1306
from gpiozero import CPUTemperature

oled = adafruit_ssd1306.SSD1306_I2C(128, 64, board.I2C(), addr=0x3C)
cpu_temp = CPUTemperature()
host = socket.gethostname()

def bar(x, y, w, percent):
    oled.rect(x, y, w, 7, 1)
    oled.fill_rect(x + 1, y + 1, int((w - 2) * percent / 100), 5, 1)

while True:
    cpu = psutil.cpu_percent()
    mem = psutil.virtual_memory().percent
    up = int(time.time() - psutil.boot_time())
    oled.fill(0)
    oled.text(host, 0, 0, 1)
    oled.text(socket.gethostbyname(host), 0, 10, 1)
    oled.text("CPU %3d%% %4.1fC" % (cpu, cpu_temp.temperature), 0, 22, 1)
    bar(0, 31, 128, cpu)
    oled.text("RAM %3d%%" % mem, 0, 41, 1)
    bar(0, 50, 128, mem)
    oled.text("up %dh%02dm" % (up // 3600, up // 60 % 60), 72, 41, 1)
    oled.show()
    time.sleep(1)
` },
  { file: 'oled_weather_station.py', title: 'OLED weather station (DHT22)', tags: ['display', 'OLED', 'sensor'], parts: [OLED, DHT(4)], code: `# Temperature and humidity with bars on an OLED (DHT22 on GPIO4)
import time
import board
import adafruit_dht
import adafruit_ssd1306

oled = adafruit_ssd1306.SSD1306_I2C(128, 64, board.I2C(), addr=0x3C)
dht = adafruit_dht.DHT22(board.D4)

def meter(y, label, value, lo, hi, unit):
    oled.text("%s %5.1f%s" % (label, value, unit), 0, y, 1)
    oled.rect(0, y + 10, 128, 8, 1)
    width = int((value - lo) / (hi - lo) * 126)
    oled.fill_rect(1, y + 11, max(0, min(126, width)), 6, 1)

while True:
    try:
        t, h = dht.temperature, dht.humidity
        oled.fill(0)
        meter(0, "Temp", t, 0, 50, "C")
        meter(32, "Hum ", h, 0, 100, "%")
        oled.show()
        print("T=%.1f H=%.1f" % (t, h))
    except RuntimeError as e:                    # the DHT sometimes needs a retry
        print("sensor:", e)
    time.sleep(2)
` },
  { file: 'tm1637_clock.py', title: 'TM1637 digital clock', tags: ['display', 'TM1637'], parts: [{ type: 'tm1637', pins: { clk: 23, dio: 24 } }], code: `# 4-digit 7-segment clock: hours and minutes with a blinking colon (CLK = GPIO23, DIO = GPIO24)
import time
import tm1637

tm = tm1637.TM1637(clk=23, dio=24)
tm.brightness(4)
colon = True
while True:
    now = time.localtime()
    tm.numbers(now[3], now[4], colon)             # hours, minutes, colon on/off
    colon = not colon
    time.sleep(0.5)
` },
  { file: 'tm1637_counter.py', title: 'TM1637 button counter', tags: ['display', 'TM1637', 'button'], parts: [{ type: 'tm1637', pins: { clk: 23, dio: 24 } }, B(2)], code: `# Every press of the button on GPIO2 adds one; hold it for 2 s to reset
from gpiozero import Button
import tm1637
from signal import pause

tm = tm1637.TM1637(clk=23, dio=24)
button = Button(2, hold_time=2)
count = 0

def pressed():
    global count
    count += 1
    tm.number(count)
    print("count", count)

def reset():
    global count
    count = 0
    tm.show("----")

button.when_pressed = pressed
button.when_held = reset
tm.number(0)
pause()
` },
  { file: 'max7219_scroll.py', title: 'MAX7219 scrolling text (SPI)', tags: ['display', 'MAX7219', 'SPI'], parts: [{ type: 'max7219', pins: { din: 10, clk: 11, cs: 8 }, props: { modules: 4 } }], code: `# Four 8x8 matrices (32x8) on SPI0: DIN = GPIO10 (MOSI), CLK = GPIO11 (SCLK), CS = GPIO8 (CE0)
import time
import spidev
import max7219

spi = spidev.SpiDev()
spi.open(0, 0)
spi.max_speed_hz = 8000000

display = max7219.Matrix8x8(spi, num=4)
display.brightness(3)

message = "  RaptiAuto on the Raspberry Pi  "
width = len(message) * 8

while True:
    for x in range(32, -width, -1):               # slide the text from right to left
        display.fill(0)
        display.text(message, x, 0, 1)
        display.show()
        time.sleep(0.03)
` },
  { file: 'display_dashboard.py', title: 'LCD + OLED + TM1637 together', tags: ['display', 'project'], parts: [LCD, OLED, { type: 'tm1637', pins: { clk: 23, dio: 24 } }, DHT(4)], code: `# Three displays on one Pi: LCD (I2C 0x27), OLED (I2C 0x3C) and a TM1637 — they share the I2C bus
import time
import board
import adafruit_dht
import adafruit_ssd1306
import tm1637
from RPLCD.i2c import CharLCD

lcd = CharLCD('PCF8574', 0x27, cols=16, rows=2)
oled = adafruit_ssd1306.SSD1306_I2C(128, 64, board.I2C(), addr=0x3C)
tm = tm1637.TM1637(clk=23, dio=24)
dht = adafruit_dht.DHT22(board.D4)

history = []
while True:
    t, h = dht.temperature, dht.humidity
    history = (history + [t])[-28:]
    # LCD: numbers
    lcd.cursor_pos = (0, 0)
    lcd.write_string("Temp %5.1f C" % t)
    lcd.cursor_pos = (1, 0)
    lcd.write_string("Humid %4.1f %%" % h)
    # TM1637: temperature
    tm.temperature(int(round(t)))
    # OLED: graph of the last readings
    oled.fill(0)
    oled.text("Temperature", 0, 0, 1)
    for i, v in enumerate(history):
        top = 62 - int(max(0, min(40, (v - 15) * 2)))
        oled.fill_rect(8 + i * 4, top, 3, 63 - top, 1)
    oled.show()
    time.sleep(2)
` },

  // ------------------------------------------------------------------ IoT
  { file: 'iot_weather_oled.py', title: 'IoT: weather from the internet on OLED', tags: ['IoT', 'requests', 'OLED'], parts: [OLED], code: `# Download the current weather (JSON) and show it on the OLED
import time
import board
import requests
import adafruit_ssd1306

URL = "http://api.open-meteo.com/v1/forecast?latitude=23.81&longitude=90.41&current_weather=true"
CODES = {0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 51: "Drizzle",
         61: "Rain", 63: "Rain", 65: "Heavy rain", 80: "Showers", 95: "Thunderstorm"}

oled = adafruit_ssd1306.SSD1306_I2C(128, 64, board.I2C(), addr=0x3C)

def show(*lines):
    oled.fill(0)
    for i, line in enumerate(lines):
        oled.text(line[:16], 0, i * 10, 1)
    oled.show()

while True:
    try:
        r = requests.get(URL, timeout=5)
        w = r.json()["current_weather"]           # {'temperature': 31.5, 'windspeed': 12.2, ...}
        show("Dhaka weather", "", "Temp %.1f C" % w["temperature"], "Wind %.1f km/h" % w["windspeed"],
             CODES.get(w["weathercode"], "code %d" % w["weathercode"]), "", "updated " + w["time"][11:])
        print("OK", w)
    except Exception as e:
        show("No internet?", str(e)[:16])
        print("error:", e)
    time.sleep(30)
` },
  { file: 'iot_flask_led.py', title: 'IoT: Flask web server — LED + DHT22', tags: ['IoT', 'Flask', 'web'], parts: [L(17, 'green'), DHT(4)], code: `# A web server on the Pi: open the Chromium on the Desktop tab and visit http://localhost:5000/
from flask import Flask, jsonify, redirect
from gpiozero import LED
import adafruit_dht
import board

app = Flask(__name__)
led = LED(17)
dht = adafruit_dht.DHT22(board.D4)

PAGE = """
<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="5">
<style>body{font-family:sans-serif;text-align:center;margin-top:30px}
a{display:inline-block;padding:14px 28px;margin:8px;border-radius:10px;color:#fff;text-decoration:none;font-size:20px}
.on{background:#16a34a}.off{background:#dc2626}</style></head><body>
<h1>Raspberry Pi</h1>
<p>Temperature <b>{{ t }} &deg;C</b> &middot; Humidity <b>{{ h }} %</b></p>
<h2>LED is {{ 'ON' if lit else 'OFF' }}</h2>
<a class="on" href="/led/on">ON</a><a class="off" href="/led/off">OFF</a>
<p><a style="background:#334155" href="/api/status">JSON</a></p>
</body></html>
"""

def readings():
    try:
        return round(dht.temperature, 1), round(dht.humidity, 1)
    except RuntimeError:
        return None, None

@app.route("/")
def home():
    from flask import render_template_string
    t, h = readings()
    return render_template_string(PAGE, t=t, h=h, lit=led.is_lit)

@app.route("/led/<state>")
def set_led(state):
    if state == "on":
        led.on()
    elif state == "off":
        led.off()
    return redirect("/")

@app.route("/api/status")
def status():
    t, h = readings()
    return jsonify(led=led.is_lit, temperature=t, humidity=h)

print("Open http://localhost:5000/ in Chromium")
app.run(host="0.0.0.0", port=5000)
` },
  { file: 'iot_http_server.py', title: 'IoT: http.server status page', tags: ['IoT', 'http.server', 'web'], parts: [L(17, 'blue')], code: `# The standard-library web server: no extras needed (open http://localhost:8000/ in Chromium)
from http.server import BaseHTTPRequestHandler, HTTPServer
from gpiozero import LED, CPUTemperature
import time

led = LED(17)
cpu = CPUTemperature()
started = time.time()

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/led/on":
            led.on()
        elif self.path == "/led/off":
            led.off()
        body = f"""<!doctype html><html><body style="font-family:sans-serif;text-align:center">
<h1>Pi status</h1>
<p>CPU temperature: <b>{cpu.temperature:.1f} &deg;C</b></p>
<p>Uptime: <b>{int(time.time() - started)} s</b></p>
<p>LED: <b>{'ON' if led.is_lit else 'OFF'}</b></p>
<p><a href="/led/on">LED on</a> | <a href="/led/off">LED off</a></p>
</body></html>"""
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.end_headers()
        self.wfile.write(body.encode())
        print(self.client_address[0], self.command, self.path)

server = HTTPServer(("0.0.0.0", 8000), Handler)
print("Serving on http://localhost:8000/")
server.serve_forever()
` },
  { file: 'iot_mqtt_sensor.py', title: 'IoT: MQTT sensor + LED (paho)', tags: ['IoT', 'MQTT', 'paho'], parts: [DHT(4), L(17, 'yellow')], code: `# Publish the DHT22 readings as JSON and switch the LED with MQTT messages
# Open the IoT dashboard in Chromium (http://dashboard.rapti.net/) and publish  ON / OFF  to  rapti/pi/led
import json
import time
import adafruit_dht
import board
import paho.mqtt.client as mqtt
from gpiozero import LED

BROKER = "broker.hivemq.com"
TOPIC_DATA = "rapti/pi/dht"
TOPIC_LED = "rapti/pi/led"

led = LED(17)
dht = adafruit_dht.DHT22(board.D4)

def on_connect(client, userdata, flags, rc, *args):
    print("connected, result code", rc)
    client.subscribe(TOPIC_LED)

def on_message(client, userdata, msg):
    text = msg.payload.decode().strip().upper()
    print(msg.topic, "->", text)
    if text == "ON":
        led.on()
    elif text == "OFF":
        led.off()

client = mqtt.Client()
client.on_connect = on_connect
client.on_message = on_message
client.connect(BROKER, 1883)
client.loop_start()                              # network loop in the background

while True:
    try:
        data = {"temperature": round(dht.temperature, 1), "humidity": round(dht.humidity, 1), "led": led.is_lit}
        client.publish(TOPIC_DATA, json.dumps(data))
        print("published", data)
    except RuntimeError as e:
        print("sensor:", e)
    time.sleep(5)
` },
  { file: 'iot_thingspeak.py', title: 'IoT: log DHT22 to ThingSpeak', tags: ['IoT', 'ThingSpeak', 'requests'], parts: [DHT(4)], code: `# One update every 16 s (the free plan allows 15 s). See the charts in http://dashboard.rapti.net/
import time
import adafruit_dht
import board
import requests

API_KEY = "RAPTI4LOGGER2024"
dht = adafruit_dht.DHT22(board.D4)

while True:
    try:
        t, h = dht.temperature, dht.humidity
        r = requests.get("http://api.thingspeak.com/update", params={"api_key": API_KEY, "field1": t, "field2": h})
        entry = r.text.strip()                    # the new entry number, or 0 when rejected
        print("T=%.1f H=%.1f -> entry %s" % (t, h, entry))
    except RuntimeError as e:
        print("sensor:", e)
    except requests.exceptions.RequestException as e:
        print("network:", e)
    time.sleep(16)
` },
  { file: 'iot_telegram_alarm.py', title: 'IoT: Telegram motion alarm', tags: ['IoT', 'Telegram', 'PIR'], parts: [{ type: 'pir', pins: { out: 4 } }, { type: 'buzzer', pins: { a: 22 } }, L(17)], code: `# PIR motion -> Telegram message; the bot also answers /status, /alarm_on and /alarm_off
# (chat with the bot in http://dashboard.rapti.net/ — "Notifications" card)
import time
import requests
from gpiozero import MotionSensor, Buzzer, LED

TOKEN = "123456789:AAEhBP0av28XRaptiAutoTestTokenXY"   # from @BotFather
CHAT_ID = "123456789"
API = "https://api.telegram.org/bot" + TOKEN

pir = MotionSensor(4)
buzzer = Buzzer(22)
led = LED(17)
armed = True
offset = 0
quiet_until = 0

def send(text, chat=CHAT_ID):
    requests.post(API + "/sendMessage", json={"chat_id": chat, "text": text})

def check_commands():
    global armed, offset
    r = requests.get(API + "/getUpdates", params={"offset": offset + 1}).json()
    for update in r.get("result", []):
        offset = update["update_id"]
        msg = update.get("message", {})
        text, chat = msg.get("text", ""), msg.get("chat", {}).get("id", CHAT_ID)
        print("Telegram:", text)
        if text == "/status":
            send("Alarm is " + ("ARMED" if armed else "OFF"), chat)
        elif text == "/alarm_on":
            armed = True
            send("Alarm armed", chat)
        elif text == "/alarm_off":
            armed = False
            send("Alarm switched off", chat)
        else:
            send("Commands: /status /alarm_on /alarm_off", chat)

send("Security alarm online")
last_check = 0
while True:
    if armed and time.time() > quiet_until and pir.motion_detected:
        print("Motion!")
        quiet_until = time.time() + 8              # do not message again for 8 s
        led.on()
        buzzer.on()
        send("Motion detected!")
        time.sleep(1)
        buzzer.off()
    if time.time() > quiet_until:
        led.off()
    if time.time() - last_check > 2:
        last_check = time.time()
        check_commands()
    time.sleep(0.1)
` },
  { file: 'iot_internet_clock.py', title: 'IoT: internet clock on LCD', tags: ['IoT', 'requests', 'LCD'], parts: [LCD], code: `# The time comes from a time server (JSON), not from the Pi's own clock
import time
import requests
from RPLCD.i2c import CharLCD

lcd = CharLCD('PCF8574', 0x27, cols=16, rows=2)
lcd.write_string("Getting time...")
offset = 0          # seconds between the server time and our uptime clock
base = 0
zone = "Asia/Dhaka"

def sync():
    global base, offset
    r = requests.get("http://worldtimeapi.org/api/timezone/" + zone, timeout=5).json()
    # "2025-05-17T14:03:22.123456+06:00"
    dt = r["datetime"]
    h, m, s = int(dt[11:13]), int(dt[14:16]), int(dt[17:19])
    base = time.time()
    offset = h * 3600 + m * 60 + s
    return dt[:10]

date = sync()
lcd.clear()
last_sync = time.time()
while True:
    secs = int(offset + (time.time() - base)) % 86400
    lcd.cursor_pos = (0, 0)
    lcd.write_string(date + "  " + zone[-5:][:4])
    lcd.cursor_pos = (1, 0)
    lcd.write_string("   %02d:%02d:%02d" % (secs // 3600, secs // 60 % 60, secs % 60))
    if time.time() - last_sync > 60:                # re-sync once a minute
        date = sync()
        last_sync = time.time()
    time.sleep(0.2)
` },
  { file: 'iot_ip_location_oled.py', title: 'IoT: where am I? (IP location on OLED)', tags: ['IoT', 'requests', 'OLED'], parts: [OLED], code: `# Ask a web service where our public IP address is and show it
import time
import board
import requests
import adafruit_ssd1306

oled = adafruit_ssd1306.SSD1306_I2C(128, 64, board.I2C(), addr=0x3C)

def show(*lines):
    oled.fill(0)
    for i, line in enumerate(lines):
        oled.text(str(line)[:16], 0, i * 10, 1)
    oled.show()

show("Looking up...")
info = requests.get("http://ip-api.com/json").json()
show("You are in:", info["city"], info["country"], "", "lat %.2f" % info["lat"], "lon %.2f" % info["lon"], info["timezone"])
print(info)
while True:
    time.sleep(1)
` },
  { file: 'iot_socket_server.py', title: 'IoT: raw TCP socket web server', tags: ['IoT', 'socket'], parts: [L(17, 'red'), { type: 'buzzer', pins: { a: 22 } }], code: `# A web server written with plain sockets: http://localhost:8080/on  /off  /beep
import socket
import time
from gpiozero import LED, Buzzer

led = LED(17)
buzzer = Buzzer(22)

server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
server.bind(("0.0.0.0", 8080))
server.listen(5)
print("Listening on port 8080")

while True:
    client, addr = server.accept()                # waits for a browser
    request = client.recv(1024).decode()
    line = request.split("\\r\\n")[0]              # e.g. "GET /on HTTP/1.1"
    path = line.split(" ")[1] if " " in line else "/"
    print(addr[0], line)
    if path == "/on":
        led.on()
    elif path == "/off":
        led.off()
    elif path == "/beep":
        buzzer.beep(0.1, 0.1, n=3, background=True)
    body = "<h1>Pi socket server</h1><p>LED: %s</p><p><a href='/on'>on</a> <a href='/off'>off</a> <a href='/beep'>beep</a></p>" % ("ON" if led.is_lit else "OFF")
    client.send(("HTTP/1.1 200 OK\\r\\nContent-Type: text/html\\r\\nContent-Length: %d\\r\\nConnection: close\\r\\n\\r\\n%s" % (len(body), body)).encode())
    client.close()
` },
  { file: 'iot_uptime_monitor.py', title: 'IoT: website uptime monitor', tags: ['IoT', 'requests', 'LCD'], parts: [LCD, L(17, 'green'), L(27, 'red'), { type: 'buzzer', pins: { a: 22 } }], code: `# Check some websites every 20 s: green LED = all up, red LED + buzzer = something is down
# (switch the router or the internet off in http://dashboard.rapti.net/ to see an outage)
import time
import requests
from gpiozero import LED, Buzzer
from RPLCD.i2c import CharLCD

SITES = ["http://httpbin.org/status/200", "http://wttr.in/", "http://no-such-site.example/"]
lcd = CharLCD('PCF8574', 0x27, cols=16, rows=2)
green, red, buzzer = LED(17), LED(27), Buzzer(22)

def check(url):
    try:
        return requests.get(url, timeout=4).status_code == 200
    except Exception:
        return False

while True:
    results = [(url, check(url)) for url in SITES]
    down = [url for url, ok in results if not ok]
    for url, ok in results:
        print("UP  " if ok else "DOWN", url)
    lcd.clear()
    lcd.write_string("Up: %d / %d" % (len(SITES) - len(down), len(SITES)))
    lcd.cursor_pos = (1, 0)
    lcd.write_string(down[0].split("//")[1][:16] if down else "all good")
    green.value = 0 if down else 1
    red.value = 1 if down else 0
    if down:
        buzzer.beep(0.1, 0.1, n=2, background=True)
    time.sleep(20)
` },
  { file: 'iot_door_ifttt.py', title: 'IoT: door alarm → IFTTT webhook', tags: ['IoT', 'IFTTT', 'button'], parts: [B(2), { type: 'buzzer', pins: { a: 22 } }, L(17)], code: `# The button is a door switch (pressed = door closed). Opening the door sounds the buzzer and calls an IFTTT webhook.
import time
import requests
from gpiozero import Button, Buzzer, LED

KEY = "RaptiDemoKey123"                          # ifttt.com/maker_webhooks
door = Button(2)
buzzer = Buzzer(22)
led = LED(17)

def notify(text):
    url = "http://maker.ifttt.com/trigger/door_open/with/key/" + KEY
    r = requests.post(url, json={"value1": text})
    print("IFTTT ->", r.status_code, r.text[:40])

def opened():
    print("DOOR OPENED")
    led.on()
    buzzer.beep(0.2, 0.2, n=3, background=True)
    notify("Front door opened at " + time.strftime("%H:%M:%S"))

def closed():
    print("Door closed")
    led.off()

door.when_released = opened                      # switch released = door open
door.when_pressed = closed
print("Door monitor ready. Hold the button (door closed), then release it.")
while True:
    time.sleep(1)
` },
  { file: 'iot_system_dashboard.py', title: 'IoT: live system dashboard (Flask + JS)', tags: ['IoT', 'Flask', 'psutil'], parts: [], code: `# A live dashboard of the Pi itself: the page asks /api/system every second with fetch()
# Run it, open Chromium on the Desktop tab and go to http://localhost:5000/
import time
import psutil
from flask import Flask, jsonify, render_template_string
from gpiozero import CPUTemperature

app = Flask(__name__)
cpu_temp = CPUTemperature()
boot = psutil.boot_time()

PAGE = """
<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:sans-serif;background:#0f172a;color:#e2e8f0;text-align:center}
.card{display:inline-block;margin:10px;padding:16px 26px;border-radius:14px;background:#1e293b;min-width:130px}
.v{font-size:34px;font-weight:700;color:#38bdf8}
.bar{height:10px;background:#334155;border-radius:5px;margin-top:8px}.fill{height:100%;background:#22c55e;border-radius:5px;width:0}</style></head>
<body><h1>{{ host }}</h1>
<div class="card">CPU<div class="v" id="cpu">--</div><div class="bar"><div class="fill" id="cpub"></div></div></div>
<div class="card">Temperature<div class="v" id="temp">--</div></div>
<div class="card">Memory<div class="v" id="mem">--</div><div class="bar"><div class="fill" id="memb"></div></div></div>
<div class="card">Uptime<div class="v" id="up">--</div></div>
<script>
function tick(){ fetch('/api/system').then(r=>r.json()).then(j=>{
  cpu.textContent=j.cpu+'%'; cpub.style.width=j.cpu+'%';
  temp.textContent=j.temp+'\\u00b0C'; mem.textContent=j.mem+'%'; memb.style.width=j.mem+'%';
  up.textContent=Math.floor(j.uptime/60)+' min'; }); }
tick(); setInterval(tick, 1000);
</script></body></html>
"""

@app.route("/")
def home():
    import socket
    return render_template_string(PAGE, host=socket.gethostname())

@app.route("/api/system")
def system():
    return jsonify(cpu=round(psutil.cpu_percent(), 1), temp=round(cpu_temp.temperature, 1),
                   mem=round(psutil.virtual_memory().percent, 1), uptime=int(time.time() - boot))

app.run(host="0.0.0.0", port=5000)
` },
];

// ====================================================================== Pico / Pico W
const PICO_TM = { type: 'tm1637', pins: { clk: 2, dio: 3 } };
const PICO_LCD = { type: 'lcd', pins: {} };

export const PICO_MORE = [
  { file: 'oled_text.py', title: 'OLED: text and animation', tags: ['display', 'OLED', 'I2C'], parts: [OLED], code: `# SSD1306 128x64 OLED on I2C0 (SDA = GP4, SCL = GP5)
from machine import Pin, I2C
import ssd1306
import time

i2c = I2C(0, sda=Pin(4), scl=Pin(5), freq=400000)
print("I2C devices:", [hex(a) for a in i2c.scan()])
oled = ssd1306.SSD1306_I2C(128, 64, i2c)

oled.fill(0)
oled.text("Raspberry Pi", 16, 8)
oled.text("Pico + MicroPython", 0, 24)
oled.show()
time.sleep(1.5)

x = 0
while True:
    oled.fill(0)
    oled.rect(0, 0, 128, 64, 1)
    oled.text("Frame %d" % x, 30, 6)
    oled.fill_rect(4 + x % 110, 28, 12, 12, 1)
    oled.show()
    x += 3
    time.sleep(0.03)
` },
  { file: 'lcd_counter.py', title: 'LCD: counter with a button', tags: ['display', 'LCD', 'I2C', 'button'], parts: [PICO_LCD, B(14)], code: `# 16x2 LCD on I2C0 (SDA = GP4, SCL = GP5): counts button presses on GP14
from machine import Pin, I2C
from pico_i2c_lcd import I2cLcd
import time

i2c = I2C(0, sda=Pin(4), scl=Pin(5), freq=400000)
lcd = I2cLcd(i2c, 0x27, 2, 16)
button = Pin(14, Pin.IN, Pin.PULL_UP)

count = 0
lcd.putstr("Button counter")
last = 1
while True:
    now = button.value()
    if last == 1 and now == 0:                   # falling edge = pressed
        count += 1
        lcd.move_to(0, 1)
        lcd.putstr("Presses: %d   " % count)
        print("presses", count)
    last = now
    time.sleep(0.02)
` },
  { file: 'tm1637_counter.py', title: 'TM1637 display counter', tags: ['display', 'TM1637'], parts: [PICO_TM, B(14)], code: `# TM1637 4-digit display (CLK = GP2, DIO = GP3); the button on GP14 counts up, long press resets
from machine import Pin
import tm1637
import time

tm = tm1637.TM1637(clk=Pin(2), dio=Pin(3))
button = Pin(14, Pin.IN, Pin.PULL_UP)
count = 0
tm.number(count)

pressed_at = None
while True:
    if button.value() == 0 and pressed_at is None:
        pressed_at = time.ticks_ms()
    if button.value() == 1 and pressed_at is not None:
        held = time.ticks_diff(time.ticks_ms(), pressed_at)
        pressed_at = None
        count = 0 if held > 1500 else count + 1
        tm.number(count)
        print("count", count)
    time.sleep_ms(20)
` },
  { file: 'max7219_text.py', title: 'MAX7219 scrolling text (SPI)', tags: ['display', 'MAX7219', 'SPI'], parts: [{ type: 'max7219', pins: { din: 3, clk: 2, cs: 5 }, props: { modules: 4 } }], code: `# 4 x 8x8 LED matrices: SPI0 SCK = GP2, MOSI = GP3, CS = GP5
from machine import Pin, SPI
import max7219
import time

spi = SPI(0, baudrate=10000000, sck=Pin(2), mosi=Pin(3))
cs = Pin(5, Pin.OUT)
display = max7219.Matrix8x8(spi, cs, 4)
display.brightness(3)

text = "  Hello Raspberry Pi Pico!  "
while True:
    for x in range(32, -len(text) * 8, -1):
        display.fill(0)
        display.text(text, x, 0, 1)
        display.show()
        time.sleep(0.03)
` },
  { file: 'oled_dht.py', title: 'OLED thermometer (DHT22)', tags: ['display', 'OLED', 'sensor'], parts: [OLED, DHT(16)], code: `# Temperature and humidity on an OLED (DHT22 on GP16)
from machine import Pin, I2C
import ssd1306
import dht
import time

oled = ssd1306.SSD1306_I2C(128, 64, I2C(0, sda=Pin(4), scl=Pin(5)))
sensor = dht.DHT22(Pin(16))

while True:
    try:
        sensor.measure()
        t, h = sensor.temperature(), sensor.humidity()
        oled.fill(0)
        oled.text("Temperature", 0, 0)
        oled.text("%.1f C" % t, 0, 12)
        oled.rect(0, 24, 128, 8, 1)
        oled.fill_rect(1, 25, int(max(0, min(126, t * 2.5))), 6, 1)
        oled.text("Humidity", 0, 38)
        oled.text("%.1f %%" % h, 0, 50)
        oled.show()
    except OSError:
        oled.fill(0)
        oled.text("sensor error", 0, 0)
        oled.show()
    time.sleep(2)
` },
  { file: 'oled_pot_meter.py', title: 'OLED voltmeter (potentiometer)', tags: ['display', 'OLED', 'ADC'], parts: [OLED, { type: 'pot', pins: { a: 26 }, props: { value: 0.4 } }], code: `# The ADC reads the potentiometer on GP26 (ADC0); the OLED draws a voltmeter
from machine import Pin, I2C, ADC
import ssd1306
import time

oled = ssd1306.SSD1306_I2C(128, 64, I2C(0, sda=Pin(4), scl=Pin(5)))
adc = ADC(26)

while True:
    raw = adc.read_u16()
    volts = raw / 65535 * 3.3
    oled.fill(0)
    oled.text("Voltmeter", 28, 0)
    oled.text("%.2f V" % volts, 36, 16)
    oled.rect(4, 32, 120, 14, 1)
    oled.fill_rect(6, 34, int(raw / 65535 * 116), 10, 1)
    oled.text("raw %5d" % raw, 28, 52)
    oled.show()
    time.sleep(0.1)
` },
  { file: 'w_web_led.py', title: 'Pico W: web server LED control', tags: ['Pico W', 'IoT', 'socket'], boards: ['picow', 'pico2w'], parts: [], code: `# The classic Pico W web server: tap the Pico W's address in Chromium... (use the IoT dashboard in the Pi Lab)
import network
import socket
import time
from machine import Pin

led = Pin("LED", Pin.OUT)

wlan = network.WLAN(network.STA_IF)
wlan.active(True)
wlan.connect("RaptiNet", "rapti1234")
while not wlan.isconnected():
    print("waiting for Wi-Fi...")
    time.sleep(0.5)
ip = wlan.ifconfig()[0]
print("Connected, open http://" + ip + "/")

addr = socket.getaddrinfo("0.0.0.0", 80)[0][-1]
s = socket.socket()
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.bind(addr)
s.listen(1)

html = """HTTP/1.0 200 OK\\r\\nContent-Type: text/html\\r\\n\\r\\n
<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center">
<h1>Pico W</h1><p>LED is %s</p>
<p><a href="/led/on">LED on</a> | <a href="/led/off">LED off</a></p></body></html>"""

while True:
    cl, addr = s.accept()
    request = cl.recv(1024).decode()
    print("client", addr[0], request.split("\\r\\n")[0])
    if "/led/on" in request:
        led.value(1)
    elif "/led/off" in request:
        led.value(0)
    cl.send(html % ("ON" if led.value() else "OFF"))
    cl.close()
` },
  { file: 'w_mqtt_light.py', title: 'Pico W: MQTT light + temperature', tags: ['Pico W', 'IoT', 'MQTT'], boards: ['picow', 'pico2w'], parts: [L(15, 'yellow'), DHT(16)], code: `# umqtt.simple: switch the LED with  rapti/picow/led  (ON / OFF) and publish the temperature every 5 s
import network
import time
import ujson as json
from machine import Pin
from umqtt.simple import MQTTClient
import dht

led = Pin(15, Pin.OUT)
sensor = dht.DHT22(Pin(16))

wlan = network.WLAN(network.STA_IF)
wlan.active(True)
wlan.connect("RaptiNet", "rapti1234")
while not wlan.isconnected():
    time.sleep(0.3)
print("Wi-Fi:", wlan.ifconfig()[0])

def on_message(topic, msg):
    print(topic, msg)
    if msg.upper() == b"ON":
        led.value(1)
    elif msg.upper() == b"OFF":
        led.value(0)

client = MQTTClient("picow-light", "broker.hivemq.com")
client.set_callback(on_message)
client.connect()
client.subscribe(b"rapti/picow/led")
print("MQTT connected")

last = 0
while True:
    client.check_msg()                           # non-blocking: handle incoming messages
    if time.ticks_diff(time.ticks_ms(), last) > 5000:
        last = time.ticks_ms()
        sensor.measure()
        payload = json.dumps({"t": sensor.temperature(), "h": sensor.humidity(), "led": led.value()})
        client.publish(b"rapti/picow/dht", payload)
        print("published", payload)
    time.sleep(0.05)
` },
  { file: 'w_weather_oled.py', title: 'Pico W: weather on OLED (urequests)', tags: ['Pico W', 'IoT', 'OLED'], boards: ['picow', 'pico2w'], parts: [OLED], code: `# Download the weather as JSON and show it on an SSD1306 OLED
import network
import time
import urequests
from machine import Pin, I2C
import ssd1306

oled = ssd1306.SSD1306_I2C(128, 64, I2C(0, sda=Pin(4), scl=Pin(5)))

def show(*lines):
    oled.fill(0)
    for i, line in enumerate(lines):
        oled.text(line[:16], 0, i * 10)
    oled.show()

wlan = network.WLAN(network.STA_IF)
wlan.active(True)
wlan.connect("RaptiNet", "rapti1234")
show("Connecting...")
while not wlan.isconnected():
    time.sleep(0.3)

URL = "http://api.open-meteo.com/v1/forecast?latitude=23.81&longitude=90.41&current_weather=true"
while True:
    try:
        r = urequests.get(URL)
        w = r.json()["current_weather"]
        r.close()
        show("Dhaka", "", "Temp %.1f C" % w["temperature"], "Wind %.1f km/h" % w["windspeed"], "code %d" % w["weathercode"], "", w["time"][11:])
        print("weather", w)
    except Exception as e:
        show("error", str(e)[:16])
    time.sleep(30)
` },
  { file: 'w_ntp_clock.py', title: 'Pico W: NTP clock on TM1637', tags: ['Pico W', 'IoT', 'TM1637'], boards: ['picow', 'pico2w'], parts: [PICO_TM], code: `# Set the clock from the internet (ntptime) and show hours:minutes in Bangladesh time (UTC+6)
import network
import ntptime
import time
import tm1637
from machine import Pin

tm = tm1637.TM1637(clk=Pin(2), dio=Pin(3))
tm.show("conn")

wlan = network.WLAN(network.STA_IF)
wlan.active(True)
wlan.connect("RaptiNet", "rapti1234")
while not wlan.isconnected():
    time.sleep(0.3)

ntptime.settime()                                # the RTC now holds UTC
print("UTC time set:", time.localtime())

colon = True
while True:
    t = time.localtime(time.time() + 6 * 3600)   # UTC+6
    tm.numbers(t[3], t[4], colon)
    colon = not colon
    time.sleep(0.5)
` },
  { file: 'w_thingspeak.py', title: 'Pico W: log DHT22 to ThingSpeak', tags: ['Pico W', 'IoT', 'ThingSpeak'], boards: ['picow', 'pico2w'], parts: [DHT(16)], code: `# Pico W + DHT22 -> ThingSpeak channel (one update every 16 s)
import network
import time
import urequests
import dht
from machine import Pin

API_KEY = "RAPTI4PICOW2024"
sensor = dht.DHT22(Pin(16))

wlan = network.WLAN(network.STA_IF)
wlan.active(True)
wlan.connect("RaptiNet", "rapti1234")
while not wlan.isconnected():
    time.sleep(0.3)
print("connected", wlan.ifconfig()[0])

while True:
    sensor.measure()
    t, h = sensor.temperature(), sensor.humidity()
    url = "http://api.thingspeak.com/update?api_key=%s&field1=%s&field2=%s" % (API_KEY, t, h)
    r = urequests.get(url)
    print("T=%.1f H=%.1f -> entry %s" % (t, h, r.text))
    r.close()
    time.sleep(16)
` },
  { file: 'w_access_point.py', title: 'Pico W: own Wi-Fi network (access point)', tags: ['Pico W', 'IoT', 'AP'], boards: ['picow', 'pico2w'], parts: [], code: `# The Pico W creates its own Wi-Fi network and serves a page at 192.168.4.1
import network
import socket
import time
from machine import Pin

led = Pin("LED", Pin.OUT)

ap = network.WLAN(network.AP_IF)
ap.config(essid="PicoW-RaptiAuto", password="12345678")
ap.active(True)
while not ap.active():
    time.sleep(0.1)
print("Access point up:", ap.config("essid"), ap.ifconfig())

s = socket.socket()
s.bind(("0.0.0.0", 80))
s.listen(2)

while True:
    cl, addr = s.accept()
    req = cl.recv(1024).decode()
    if "GET /toggle" in req:
        led.toggle()
    body = "<html><body style='font-family:sans-serif;text-align:center'><h1>Pico W AP</h1><p>LED %s</p><p><a href='/toggle'>toggle</a></p></body></html>" % ("ON" if led.value() else "OFF")
    cl.send("HTTP/1.0 200 OK\\r\\nContent-Type: text/html\\r\\n\\r\\n" + body)
    cl.close()
` },
  { file: 'w_telegram_button.py', title: 'Pico W: button sends a Telegram message', tags: ['Pico W', 'IoT', 'Telegram'], boards: ['picow', 'pico2w'], parts: [B(14), L(15)], code: `# Press the button on GP14: the Pico W sends a message to your Telegram chat (see the dashboard)
import network
import time
import urequests
from machine import Pin

TOKEN = "123456789:AAEhBP0av28XRaptiAutoTestTokenXY"
CHAT_ID = "123456789"
button = Pin(14, Pin.IN, Pin.PULL_UP)
led = Pin(15, Pin.OUT)

wlan = network.WLAN(network.STA_IF)
wlan.active(True)
wlan.connect("RaptiNet", "rapti1234")
while not wlan.isconnected():
    time.sleep(0.3)

def send(text):
    url = "https://api.telegram.org/bot%s/sendMessage?chat_id=%s&text=%s" % (TOKEN, CHAT_ID, text.replace(" ", "%20"))
    r = urequests.get(url)
    ok = r.json().get("ok")
    r.close()
    return ok

send("Pico W is online")
presses = 0
while True:
    if button.value() == 0:
        presses += 1
        led.value(1)
        print("press", presses, send("Button pressed %d times" % presses))
        led.value(0)
        while button.value() == 0:
            time.sleep(0.05)
    time.sleep(0.05)
` },
];
