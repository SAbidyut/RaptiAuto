// MicroPython examples (ESP32 / Raspberry Pi Pico). Each builder returns an example with `lang: 'python'`.
import { P, at, W, R, C } from './helpers.js';

const esp = () => P('esp32-devkit', 30, 0, {}, 0, 'esp');
// ESP32 header: top row y = 0 (x = 30 + pin offset), bottom row y = 90. D4 = (130, 90), D21 = (70, 90), GND.2 = (160, 90).

/** LED + 220 Ω on D4 and a push button (to GND) on D21. */
function ledButtonKit(e) {
  const r = at('resistor', '1', 190, 200, { value: 220 }, 0, 'r1');
  const led = at('led', 'A', 250, 200, { color: 'red' }, 0, 'led');
  const btn = at('pushbutton', '1.l', 330, 150, {}, 0, 'btn');
  const wires = [
    R(e, 'D4', r, '1', C.orange, [150]),
    W(r, '2', led, 'A', C.orange),
    R(led, 'C', e, 'GND.2', C.black, [240]),
    R(e, 'D21', btn, '1.l', C.green, [120]),
    R(btn, '2.l', e, 'GND.2', C.black, [260]),
  ];
  return { parts: [r, led, btn], wires };
}

export function pyBlink() {
  const e = esp();
  return {
    id: 'py-blink', lang: 'python', name: 'MicroPython Blink', category: 'python', level: 'beginner',
    description: 'The first MicroPython program: blink the on-board LED (GPIO 2) of an ESP32 and print to the Serial Monitor.',
    parts: [e], wires: [],
    code: `# RaptiAuto — MicroPython Blink (ESP32)
from machine import Pin
import time

led = Pin(2, Pin.OUT)      # the blue LED on the board

while True:
    led.value(1)
    print("LED on")
    time.sleep(0.5)
    led.value(0)
    print("LED off")
    time.sleep(0.5)
`,
  };
}

export function pyPicoBlink() {
  const pico = P('rpi-pico', 0, 0, {}, 0, 'pico');
  return {
    id: 'py-pico-blink', lang: 'python', name: 'Pico MicroPython Blink', category: 'python', level: 'beginner',
    description: 'Blink the on-board LED of a Raspberry Pi Pico with MicroPython: Pin("LED") and toggle().',
    parts: [pico], wires: [],
    code: `# Raspberry Pi Pico — MicroPython blink
from machine import Pin
from time import sleep

led = Pin("LED", Pin.OUT)
count = 0

while True:
    led.toggle()
    count += 1
    print("blink", count)
    sleep(0.4)
`,
  };
}

export function pyButtonLed() {
  const e = esp();
  const kit = ledButtonKit(e);
  return {
    id: 'py-button-led', lang: 'python', name: 'Button toggles LED', category: 'python', level: 'beginner',
    description: 'A push button on GPIO 21 (internal pull-up) switches an LED on GPIO 4 on and off. Tap the button while it runs.',
    parts: [e, ...kit.parts], wires: kit.wires,
    code: `# Button toggles an LED (ESP32)
from machine import Pin
import time

led = Pin(4, Pin.OUT)
button = Pin(21, Pin.IN, Pin.PULL_UP)   # pressed = 0

state = 0
last = 1
while True:
    now = button.value()
    if last == 1 and now == 0:          # falling edge: the button was just pressed
        state = 1 - state
        led.value(state)
        print("LED", "ON" if state else "OFF")
    last = now
    time.sleep_ms(20)                   # simple debounce
`,
  };
}

export function pyPwmFade() {
  const e = esp();
  const r = at('resistor', '1', 190, 200, { value: 220 }, 0, 'r1');
  const led = at('led', 'A', 250, 200, { color: 'purple' }, 0, 'led');
  return {
    id: 'py-pwm-fade', lang: 'python', name: 'PWM breathing LED', category: 'python', level: 'beginner',
    description: 'Fade an LED smoothly in and out with machine.PWM (duty 0–1023 on the ESP32).',
    parts: [e, r, led],
    wires: [R(e, 'D4', r, '1', C.purple, [150]), W(r, '2', led, 'A', C.purple), R(led, 'C', e, 'GND.2', C.black, [240])],
    code: `# PWM breathing LED (ESP32): duty goes 0..1023
from machine import Pin, PWM
import time

led = PWM(Pin(4), freq=1000)

while True:
    for duty in range(0, 1024, 16):
        led.duty(duty)
        time.sleep_ms(10)
    for duty in range(1023, -1, -16):
        led.duty(duty)
        time.sleep_ms(10)
`,
  };
}

export function pyAdcPot() {
  const e = esp();
  const pot = at('potentiometer', 'GND', 250, 220, {}, 0, 'pot');
  return {
    id: 'py-adc-pot', lang: 'python', name: 'Read a potentiometer (ADC)', category: 'python', level: 'beginner',
    description: 'Read an analog voltage with machine.ADC and print the raw value, the voltage and a bar. Turn the knob while it runs.',
    parts: [e, pot],
    wires: [R(pot, 'SIG', e, 'D34', C.yellow, [-30]), R(pot, 'VCC', e, '3V3', C.red, [150]), R(pot, 'GND', e, 'GND.2', C.black, [170])],
    code: `# Potentiometer on GPIO 34 -> ADC (ESP32)
from machine import Pin, ADC
import time

adc = ADC(Pin(34))
adc.atten(ADC.ATTN_11DB)      # measure the full 0 – 3.3 V range

while True:
    raw = adc.read()          # 0 .. 4095
    volts = raw / 4095 * 3.3
    bar = "#" * (raw * 20 // 4095)
    print("raw={:4d}  {:.2f} V  [{:<20}]".format(raw, volts, bar))
    time.sleep(0.5)
`,
  };
}

export function pyDht22() {
  const e = esp();
  const dht = at('dht22', 'VCC', 250, 230, { model: '22' }, 0, 'dht');
  return {
    id: 'py-dht22', lang: 'python', name: 'DHT22 weather (MicroPython)', category: 'python', level: 'beginner',
    description: 'Read temperature and humidity with the MicroPython dht module. Tap the sensor while running to change the weather.',
    parts: [e, dht],
    wires: [R(dht, 'DATA', e, 'D15', C.green, [190]), R(dht, 'VCC', e, '3V3', C.red, [160]), R(dht, 'GND', e, 'GND.2', C.black, [210])],
    code: `# DHT22 on GPIO 15 (ESP32)
import dht
from machine import Pin
import time

sensor = dht.DHT22(Pin(15))

while True:
    try:
        sensor.measure()
        t = sensor.temperature()
        h = sensor.humidity()
        print("Temp: {:.1f} C  Humidity: {:.1f} %".format(t, h))
    except OSError:
        print("Sensor error — check the wiring")
    time.sleep(2)
`,
  };
}

export function pyOled() {
  const e = esp();
  const oled = at('oled-ssd1306', 'GND', 240, 250, { color: 'white', address: '60' }, 0, 'oled');
  return {
    id: 'py-oled', lang: 'python', name: 'OLED display (ssd1306)', category: 'python', level: 'intermediate',
    description: 'Scan the I²C bus and draw text and a moving bar on a 128×64 SSD1306 OLED with the ssd1306 driver.',
    parts: [e, oled],
    wires: [
      R(oled, 'SCL', e, 'D22', C.yellow, [200]), R(oled, 'SDA', e, 'D21', C.blue, [185]),
      R(oled, 'VCC', e, '3V3', C.red, [215]), R(oled, 'GND', e, 'GND.2', C.black, [230]),
    ],
    code: `# SSD1306 OLED on I2C (SDA = GPIO 21, SCL = GPIO 22)
from machine import Pin, I2C
import ssd1306
import time

i2c = I2C(0, scl=Pin(22), sda=Pin(21))
print("I2C devices:", [hex(a) for a in i2c.scan()])

oled = ssd1306.SSD1306_I2C(128, 64, i2c)
oled.fill(0)
oled.text("Hello, RaptiAuto!", 0, 0)
oled.text("MicroPython", 0, 12)
oled.rect(0, 26, 128, 38, 1)
oled.show()

x = 2
step = 4
while True:
    oled.fill_rect(2, 28, 124, 34, 0)
    oled.text("t = %d s" % (time.ticks_ms() // 1000), 8, 32)
    oled.fill_rect(x, 48, 12, 8, 1)
    oled.show()
    x += step
    if x > 112 or x < 4:
        step = -step
    time.sleep_ms(80)
`,
  };
}

export function pyNeopixel() {
  const e = esp();
  const ring = at('neopixel', 'DIN', 260, 260, { layout: 'ring16' }, 0, 'ring');
  return {
    id: 'py-neopixel', lang: 'python', name: 'NeoPixel rainbow (MicroPython)', category: 'python', level: 'intermediate',
    description: '16 WS2812 LEDs on one pin with the neopixel module: a spinning rainbow made with a small HSV function.',
    parts: [e, ring],
    wires: [R(ring, 'DIN', e, 'D5', C.green, [200]), R(ring, 'VCC', e, 'VIN', C.red, [-30]), R(ring, 'GND', e, 'GND.2', C.black, [230])],
    code: `# NeoPixel ring (16 LEDs) on GPIO 5
from machine import Pin
from neopixel import NeoPixel
import time

N = 16
np = NeoPixel(Pin(5), N)

def wheel(pos):
    # 0..255 -> (r, g, b) colour wheel
    pos = pos % 256
    if pos < 85:
        return (255 - pos * 3, pos * 3, 0)
    if pos < 170:
        pos -= 85
        return (0, 255 - pos * 3, pos * 3)
    pos -= 170
    return (pos * 3, 0, 255 - pos * 3)

offset = 0
while True:
    for i in range(N):
        r, g, b = wheel(i * 256 // N + offset)
        np[i] = (r // 4, g // 4, b // 4)     # dimmed
    np.write()
    offset = (offset + 8) % 256
    time.sleep_ms(40)
`,
  };
}

export function pyServo() {
  const e = esp();
  const sv = at('servo', 'GND', 230, 240, { model: 'sg90' }, 0, 'servo');
  return {
    id: 'py-servo', lang: 'python', name: 'Servo sweep (PWM 50 Hz)', category: 'python', level: 'intermediate',
    description: 'A hobby servo needs a 50 Hz PWM signal with a 0.5 – 2.4 ms pulse. machine.PWM and duty_ns() make that easy.',
    parts: [e, sv],
    wires: [R(sv, 'PWM', e, 'D18', C.orange, [190]), R(sv, 'V+', e, 'VIN', C.red, [-30]), R(sv, 'GND', e, 'GND.2', C.black, [215])],
    code: `# Servo on GPIO 18: 50 Hz PWM, pulse 0.5 ms (0°) .. 2.4 ms (180°)
from machine import Pin, PWM
import time

servo = PWM(Pin(18), freq=50)

def set_angle(deg):
    pulse_us = 500 + deg * (2400 - 500) / 180
    servo.duty_ns(int(pulse_us * 1000))

while True:
    for deg in range(0, 181, 5):
        set_angle(deg)
        time.sleep_ms(30)
    print("at 180")
    for deg in range(180, -1, -5):
        set_angle(deg)
        time.sleep_ms(30)
    print("at 0")
`,
  };
}

export function pyTimerIrq() {
  const e = esp();
  const kit = ledButtonKit(e);
  return {
    id: 'py-timer-irq', lang: 'python', name: 'Timer + button interrupt', category: 'python', level: 'advanced',
    description: 'A hardware Timer blinks the LED every 500 ms while a pin interrupt (IRQ) counts button presses — both run while the main loop sleeps.',
    parts: [e, ...kit.parts], wires: kit.wires,
    code: `# Timer + IRQ (ESP32): LED on GPIO 4, button on GPIO 21
from machine import Pin, Timer
import time

led = Pin(4, Pin.OUT)
button = Pin(21, Pin.IN, Pin.PULL_UP)

presses = 0
last = 0

def on_press(pin):
    global presses, last
    now = time.ticks_ms()
    if time.ticks_diff(now, last) > 150:      # ignore bounces
        last = now
        presses += 1
        print("Button pressed", presses, "times")

button.irq(trigger=Pin.IRQ_FALLING, handler=on_press)

def tick(timer):
    led.value(not led.value())

Timer(0).init(period=500, mode=Timer.PERIODIC, callback=tick)

while True:
    time.sleep(1)       # everything happens in the callbacks
`,
  };
}

export function pyBluetooth() {
  const e = esp();
  const bt = at('hc05', 'STATE', 100, 300, {}, 0, 'bt');
  const r = at('resistor', '1', 230, 200, { value: 330 }, 0, 'r1');
  const led = at('led', 'A', 290, 200, { color: 'blue' }, 0, 'led');
  return {
    id: 'py-bluetooth', lang: 'python', name: 'Bluetooth LED (machine.UART)', category: 'python', level: 'intermediate',
    description: 'machine.UART(2) talks to an HC-05 on GPIO 16 / 17. Tap the HC-05 while running, press Connect phone and send ON or OFF to switch the LED on GPIO 4.',
    parts: [e, bt, r, led],
    wires: [
      W(bt, 'TXD', e, 'RX2', C.green, [[120, 270], [120, 120]]), W(bt, 'RXD', e, 'TX2', C.yellow, [[110, 280], [110, 90]]),
      W(bt, 'VCC', e, '3V3', C.red, [[140, 250], [170, 250]]), W(bt, 'GND', e, 'GND.2', C.black, [[130, 260], [160, 260]]),
      R(e, 'D4', r, '1', C.orange, [150]), W(r, '2', led, 'A', C.orange), R(led, 'C', e, 'GND.2', C.black, [240]),
    ],
    code: `# Bluetooth serial (HC-05) on UART2: TX = GPIO 17, RX = GPIO 16
from machine import UART, Pin
import time

uart = UART(2, baudrate=9600, tx=17, rx=16)
led = Pin(4, Pin.OUT)
uart.write("Send ON or OFF\\r\\n")

buffer = b""
while True:
    if uart.any():
        buffer += uart.read()
        while b"\\n" in buffer:
            line, buffer = buffer.split(b"\\n", 1)
            cmd = line.decode().strip().upper()
            print("Command:", cmd)
            if cmd == "ON":
                led.value(1)
                uart.write("LED is ON\\r\\n")
            elif cmd == "OFF":
                led.value(0)
                uart.write("LED is OFF\\r\\n")
            else:
                uart.write("Unknown command\\r\\n")
    time.sleep_ms(20)
`,
  };
}

export function pyGps() {
  const e = esp();
  const gps = at('gps-neo6m', 'VCC', 100, 300, {}, 0, 'gps');
  return {
    id: 'py-gps', lang: 'python', name: 'GPS position (MicroPython)', category: 'python', level: 'advanced',
    description: 'Read the NEO-6M on UART2 (RX = GPIO 16) and decode the $GPRMC sentence with plain Python string methods. Tap the module while running to drive it around.',
    parts: [e, gps],
    wires: [
      W(gps, 'TXD', e, 'RX2', C.green, [[120, 270], [120, 120]]),
      W(gps, 'VCC', e, '3V3', C.red, [[100, 250], [170, 250]]), W(gps, 'GND', e, 'GND.2', C.black, [[130, 260], [160, 260]]),
    ],
    code: `# NEO-6M GPS on UART2 (GPIO 16): decode $GPRMC
from machine import UART
import time

uart = UART(2, baudrate=9600, tx=17, rx=16)

def to_degrees(raw, hemi):
    value = float(raw)
    deg = int(value // 100)
    d = deg + (value - deg * 100) / 60
    return -d if hemi in ("S", "W") else d

buffer = b""
print("Waiting for a GPS fix...")
while True:
    if uart.any():
        buffer += uart.read()
        while b"\\n" in buffer:
            line, buffer = buffer.split(b"\\n", 1)
            text = line.decode().strip()
            if text.startswith("$GPRMC"):
                f = text.split(",")
                if f[2] == "A":
                    lat = to_degrees(f[3], f[4])
                    lon = to_degrees(f[5], f[6])
                    kmh = float(f[7]) * 1.852
                    print("Lat {:.5f}  Lon {:.5f}  {:.1f} km/h".format(lat, lon, kmh))
                else:
                    print("No fix yet")
    time.sleep_ms(50)
`,
  };
}

export const BUILDERS = [pyBlink, pyPicoBlink, pyButtonLed, pyPwmFade, pyAdcPot, pyDht22, pyOled, pyNeopixel, pyServo, pyTimerIrq, pyBluetooth, pyGps];
