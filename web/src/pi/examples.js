// Example programs for the virtual Raspberry Pi (Python 3 style, gpiozero / RPi.GPIO) and the Pico
// (MicroPython). Each lists the parts it expects on the header; opening one wires them up.

import { bbTrafficLights, bbDoorbell, piI2cMaster, piUartMaster } from './bb-examples.js';
import { PI_MORE, PICO_MORE } from './examples-more.js';
import { PI_IOT, PICO_IOT } from './examples-iot.js';

const L = (pin, color = 'red') => ({ type: 'led', pins: { a: pin }, props: { color } });
const B = (pin) => ({ type: 'button', pins: { a: pin } });

export const PI_EXAMPLES = [
  { file: 'hello.py', title: 'Hello, Raspberry Pi', tags: ['basics'], parts: [], code: `# Your first program: print, input and a loop
import time

name = input("What is your name? ")
print(f"Hello {name}, welcome to the Raspberry Pi!")

for i in range(5, 0, -1):
    print(i, "...")
    time.sleep(0.5)
print("Lift off! 🚀")
` },
  { file: 'blink.py', title: 'Blink an LED (gpiozero)', tags: ['gpiozero', 'LED'], parts: [L(17)], code: `# Blink the LED on GPIO17 (pin 11)
from gpiozero import LED
from time import sleep

led = LED(17)

while True:
    led.on()
    sleep(0.5)
    led.off()
    sleep(0.5)
` },
  { file: 'button_led.py', title: 'Button controls an LED', tags: ['gpiozero', 'button'], parts: [L(17), B(2)], code: `# Press the button on GPIO2 to light the LED on GPIO17
from gpiozero import LED, Button
from signal import pause

led = LED(17)
button = Button(2)

button.when_pressed = led.on
button.when_released = led.off

print("Press the button (hold it on the Board tab)...")
pause()
` },
  { file: 'traffic_lights.py', title: 'Traffic lights + pedestrian button', tags: ['gpiozero', 'project'], parts: [L(22, 'green'), L(27, 'yellow'), L(17, 'red'), B(2)], code: `# UK-style traffic lights; the button asks for a pedestrian crossing
from gpiozero import TrafficLights, Button
from time import sleep

lights = TrafficLights(red=17, amber=27, green=22)
button = Button(2)

while True:
    lights.green.on()
    print("GREEN - waiting for a pedestrian")
    button.wait_for_press()
    print("Button pressed!")
    sleep(1)
    lights.green.off()
    lights.amber.on()
    sleep(2)
    lights.amber.off()
    lights.red.on()
    print("RED - walk now")
    sleep(4)
    lights.amber.on()
    sleep(1.5)
    lights.red.off()
    lights.amber.off()
` },
  { file: 'bb_traffic_lights.py', title: 'Breadboard: traffic lights', tags: ['breadboard', 'gpiozero'], circuit: bbTrafficLights, code: `# Traffic lights built on a breadboard (Raspberry Pi 4 / 5)
# Red LED GPIO18, amber GPIO23, green GPIO25 (each through 330 ohm), button GPIO21 to GND.
from gpiozero import TrafficLights, Button
from time import sleep

lights = TrafficLights(red=18, amber=23, green=25)
button = Button(21)

while True:
    lights.green.on()
    print("GREEN - press the button to cross")
    button.wait_for_press()
    lights.green.off()
    lights.amber.on()
    sleep(1.5)
    lights.amber.off()
    lights.red.on()
    print("RED - walk now")
    sleep(4)
    lights.red.off()
` },
  { file: 'bb_doorbell.py', title: 'Breadboard: doorbell', tags: ['breadboard', 'gpiozero'], circuit: bbDoorbell, code: `# Doorbell on a breadboard: the button (GPIO21) rings the buzzer (GPIO12)
# and flashes the LED (GPIO18). Counts the visitors.
from gpiozero import Button, Buzzer, LED
from time import sleep

button = Button(21)
buzzer = Buzzer(12)
led = LED(18)
visitors = 0

print("Press the doorbell button...")
while True:
    button.wait_for_press()
    visitors += 1
    print("Ding dong! visitor", visitors)
    for _ in range(2):
        buzzer.on(); led.on()
        sleep(0.25)
        buzzer.off(); led.off()
        sleep(0.15)
    button.wait_for_release()
` },
  { file: 'i2c_master_arduino.py', title: 'Pi master → Arduino slave (I²C)', tags: ['master-slave', 'I2C', 'Arduino'], circuit: piI2cMaster, code: `# Raspberry Pi = I2C MASTER, Arduino Uno = SLAVE at address 8.
# Wiring: GPIO2 (SDA) -> Uno SDA, GPIO3 (SCL) -> Uno SCL, GND -> GND.
# The Pi blinks the Uno's LED and reads the Uno's button. Press it on the canvas!
# (Tap the Uno, then Sketch, to see the Arduino program.)
from smbus2 import SMBus
import time

ADDR = 8
bus = SMBus(1)
print("Devices on the I2C bus:", [hex(a) for a in bus.scan()])

led = 0
while True:
    led = 1 - led
    bus.write_byte_data(ADDR, 0, led)                  # register 0 <- LED on / off
    pressed, presses = bus.read_i2c_block_data(ADDR, 1, 2)   # register 1 -> button, count
    print("LED", "ON " if led else "OFF", "| button", "DOWN" if pressed else "up", "| presses", presses)
    time.sleep(0.5)
` },
  { file: 'uart_master_arduino.py', title: 'Pi master → Arduino slave (Serial)', tags: ['master-slave', 'UART', 'Arduino'], circuit: piUartMaster, code: `# Raspberry Pi = SERIAL MASTER, Arduino Uno = SLAVE.
# Wiring (crossed): GPIO14 TXD -> Uno RX (D0), GPIO15 RXD <- Uno TX (D1), GND -> GND.
# The Pi sends "L1" / "L0" and prints the Uno's answer.
import serial
import time

ser = serial.Serial('/dev/serial0', 9600, timeout=1)
led = 0
while True:
    led = 1 - led
    ser.write(b'L1\\n' if led else b'L0\\n')
    reply = ser.readline().decode().strip()
    print("sent L%d -> Uno says: %s" % (led, reply or "(no answer)"))
    time.sleep(0.5)
` },
  { file: 'rpi_gpio_blink.py', title: 'Blink with RPi.GPIO', tags: ['RPi.GPIO', 'LED'], parts: [L(18, 'green')], code: `# The classic RPi.GPIO way (BCM numbering)
import RPi.GPIO as GPIO
import time

LED_PIN = 18
GPIO.setmode(GPIO.BCM)
GPIO.setwarnings(False)
GPIO.setup(LED_PIN, GPIO.OUT)

try:
    for i in range(20):
        GPIO.output(LED_PIN, GPIO.HIGH)
        print("LED on")
        time.sleep(0.4)
        GPIO.output(LED_PIN, GPIO.LOW)
        print("LED off")
        time.sleep(0.4)
except KeyboardInterrupt:
    print("Stopped")
finally:
    GPIO.cleanup()
` },
  { file: 'pwm_fade.py', title: 'Fade an LED with PWM', tags: ['RPi.GPIO', 'PWM'], parts: [L(18, 'blue')], code: `# Software PWM: fade the LED on GPIO18 up and down
import RPi.GPIO as GPIO
import time

GPIO.setmode(GPIO.BCM)
GPIO.setup(18, GPIO.OUT)
pwm = GPIO.PWM(18, 100)      # 100 Hz
pwm.start(0)

try:
    while True:
        for dc in range(0, 101, 5):
            pwm.ChangeDutyCycle(dc)
            time.sleep(0.05)
        for dc in range(100, -1, -5):
            pwm.ChangeDutyCycle(dc)
            time.sleep(0.05)
except KeyboardInterrupt:
    pass
pwm.stop()
GPIO.cleanup()
` },
  { file: 'servo_sweep.py', title: 'Servo sweep', tags: ['gpiozero', 'servo'], parts: [{ type: 'servo', pins: { sig: 12 } }], code: `# Sweep an SG90 servo on GPIO12 from 0 to 180 degrees
from gpiozero import AngularServo
from time import sleep

servo = AngularServo(12, min_angle=0, max_angle=180,
                     min_pulse_width=0.5/1000, max_pulse_width=2.5/1000)

while True:
    for angle in range(0, 181, 15):
        servo.angle = angle
        print("angle:", angle)
        sleep(0.15)
    for angle in range(180, -1, -15):
        servo.angle = angle
        sleep(0.15)
` },
  { file: 'distance_alarm.py', title: 'Parking sensor (HC-SR04)', tags: ['gpiozero', 'sensor'], parts: [{ type: 'ultrasonic', pins: { trig: 23, echo: 24 }, props: { cm: 80 } }, { type: 'buzzer', pins: { a: 22 } }, L(17)], code: `# Beep faster as an object comes closer (move the distance slider)
from gpiozero import DistanceSensor, Buzzer, LED
from time import sleep

sensor = DistanceSensor(echo=24, trigger=23, max_distance=2)
buzzer = Buzzer(22)
led = LED(17)

while True:
    cm = sensor.distance * 100
    print(f"Distance: {cm:.1f} cm")
    if cm < 15:
        buzzer.on(); led.on()
    elif cm < 60:
        buzzer.beep(0.05, cm / 300, n=1)
        led.blink(0.05, cm / 300, n=1)
    else:
        buzzer.off(); led.off()
    sleep(0.3)
` },
  { file: 'motion_alarm.py', title: 'Motion alarm (PIR)', tags: ['gpiozero', 'sensor'], parts: [{ type: 'pir', pins: { out: 4 } }, L(17), { type: 'buzzer', pins: { a: 22 } }], code: `# Sound the alarm when the PIR sensor sees motion
from gpiozero import MotionSensor, LED, Buzzer
from signal import pause
from datetime import datetime

pir = MotionSensor(4)
led = LED(17)
buzzer = Buzzer(22)

def alarm():
    print(datetime.now(), "Motion detected!")
    led.blink(0.1, 0.1)
    buzzer.beep(0.2, 0.2)

def clear():
    print("All quiet")
    led.off()
    buzzer.off()

pir.when_motion = alarm
pir.when_no_motion = clear
print("Alarm armed. Tap 'Wave a hand' on the sensor.")
pause()
` },
  { file: 'relay_lamp.py', title: 'Relay: lamp with timer', tags: ['automation', 'relay'], parts: [{ type: 'relay', pins: { a: 26 } }, B(2)], code: `# Staircase timer: a press switches the 230 V lamp on for 5 s
from gpiozero import OutputDevice, Button
from time import sleep

relay = OutputDevice(26, active_high=True, initial_value=False)
button = Button(2)

while True:
    button.wait_for_press()
    print("Lamp ON")
    relay.on()
    sleep(5)
    relay.off()
    print("Lamp OFF")
` },
  { file: 'motor_control.py', title: 'DC motor: forward / reverse', tags: ['gpiozero', 'motor'], parts: [{ type: 'motor', pins: { fwd: 20, back: 21 } }, B(5), B(6)], code: `# GPIO5 button = forward, GPIO6 button = backward, speed ramps with PWM
from gpiozero import Motor, Button
from time import sleep

motor = Motor(forward=20, backward=21)
fwd = Button(5)
rev = Button(6)

while True:
    if fwd.is_pressed:
        for s in range(1, 11):
            motor.forward(s / 10)
            sleep(0.05)
        print("forward")
    elif rev.is_pressed:
        motor.backward(0.6)
        print("backward")
    else:
        motor.stop()
    sleep(0.1)
` },
  { file: 'weather.py', title: 'DHT22 + CPU temperature', tags: ['sensor', 'adafruit'], parts: [{ type: 'dht', pins: { data: 4 }, props: { t: 29.5, h: 64 } }], code: `# Read a DHT22 on GPIO4 and the Pi's own CPU temperature
import time
import board
import adafruit_dht
from gpiozero import CPUTemperature

dht = adafruit_dht.DHT22(board.D4)
cpu = CPUTemperature()

while True:
    try:
        print(f"Room: {dht.temperature:.1f} °C  {dht.humidity:.0f} %   CPU: {cpu.temperature:.1f} °C")
    except RuntimeError as e:
        print("Sensor error:", e)
    time.sleep(2)
` },
  { file: 'pot_dimmer.py', title: 'Potentiometer dimmer (MCP3008)', tags: ['gpiozero', 'analog'], parts: [{ type: 'pot', pins: {}, props: { ch: 0, value: 0.4 } }, L(18, 'yellow')], code: `# The Pi has no analog inputs: an MCP3008 ADC on SPI reads the pot
from gpiozero import MCP3008, PWMLED
from time import sleep

pot = MCP3008(channel=0)
led = PWMLED(18)

while True:
    led.value = pot.value
    print(f"pot = {pot.value:.2f}  ({pot.voltage:.2f} V)")
    sleep(0.2)
` },
  { file: 'rgb_colors.py', title: 'RGB LED colours', tags: ['gpiozero', 'LED'], parts: [{ type: 'rgb', pins: { r: 13, g: 19, b: 26 } }], code: `from gpiozero import RGBLED
from time import sleep

led = RGBLED(red=13, green=19, blue=26)
colors = {"red": (1, 0, 0), "green": (0, 1, 0), "blue": (0, 0, 1),
          "yellow": (1, 1, 0), "cyan": (0, 1, 1), "magenta": (1, 0, 1), "white": (1, 1, 1)}

for name, c in colors.items():
    print(name)
    led.color = c
    sleep(0.8)
led.pulse(1, 1, on_color=(0.3, 0, 1))
sleep(6)
` },
  { file: 'neopixel_rainbow.py', title: 'NeoPixel rainbow', tags: ['neopixel'], parts: [{ type: 'neopixel', pins: { din: 18 } }], code: `# WS2812 strip on GPIO18 (Adafruit neopixel library)
import board
import neopixel
import time

pixels = neopixel.NeoPixel(board.D18, 8, brightness=0.5)

def wheel(pos):
    if pos < 85:
        return (255 - pos * 3, pos * 3, 0)
    if pos < 170:
        pos -= 85
        return (0, 255 - pos * 3, pos * 3)
    pos -= 170
    return (pos * 3, 0, 255 - pos * 3)

j = 0
while True:
    for i in range(8):
        pixels[i] = wheel((i * 32 + j) & 255)
    j = (j + 8) % 256
    time.sleep(0.05)
` },
];

export const PICO_EXAMPLES = [
  { file: 'main.py', title: 'Blink the onboard LED', tags: ['basics', 'LED'], parts: [], code: `from machine import Pin
import time

led = Pin("LED", Pin.OUT)   # Pico: GP25 · Pico W: the LED on the wireless chip

while True:
    led.toggle()
    time.sleep(0.5)
` },
  { file: 'button_led.py', title: 'Button + LED', tags: ['Pin', 'button'], parts: [L(15), B(14)], code: `from machine import Pin
import time

led = Pin(15, Pin.OUT)
button = Pin(14, Pin.IN, Pin.PULL_UP)   # pressed = 0

while True:
    if button.value() == 0:
        led.on()
    else:
        led.off()
    time.sleep(0.01)
` },
  { file: 'pwm_fade.py', title: 'PWM fade', tags: ['PWM'], parts: [L(15, 'blue')], code: `from machine import Pin, PWM
import time

pwm = PWM(Pin(15))
pwm.freq(1000)

while True:
    for duty in range(0, 65536, 1024):
        pwm.duty_u16(duty)
        time.sleep(0.01)
    for duty in range(65535, -1, -1024):
        pwm.duty_u16(duty)
        time.sleep(0.01)
` },
  { file: 'pot_adc.py', title: 'Potentiometer on ADC0', tags: ['ADC', 'analog'], parts: [{ type: 'pot', pins: { a: 26 }, props: { value: 0.3 } }, L(15, 'yellow')], code: `from machine import ADC, Pin, PWM
import time

pot = ADC(26)            # GP26 = ADC0
led = PWM(Pin(15))
led.freq(1000)

while True:
    raw = pot.read_u16()
    volts = raw * 3.3 / 65535
    led.duty_u16(raw)
    print("raw:", raw, " voltage: %.2f V" % volts)
    time.sleep(0.3)
` },
  { file: 'temperature.py', title: 'Internal temperature sensor', tags: ['ADC'], parts: [], code: `import machine
import time

sensor = machine.ADC(4)
factor = 3.3 / 65535

while True:
    v = sensor.read_u16() * factor
    temp = 27 - (v - 0.706) / 0.001721
    print("Temperature: %.1f C" % temp)
    time.sleep(1)
` },
  { file: 'traffic_light.py', title: 'Traffic light', tags: ['project'], parts: [L(13, 'red'), L(12, 'yellow'), L(11, 'green')], code: `from machine import Pin
from time import sleep

red = Pin(13, Pin.OUT)
amber = Pin(12, Pin.OUT)
green = Pin(11, Pin.OUT)

while True:
    red.on();   print("STOP");   sleep(3)
    amber.on(); sleep(1)
    red.off(); amber.off()
    green.on(); print("GO");     sleep(3)
    green.off()
    amber.on(); sleep(1)
    amber.off()
` },
  { file: 'timer_blink.py', title: 'Timer interrupt blink', tags: ['Timer'], parts: [], code: `from machine import Pin, Timer

led = Pin("LED", Pin.OUT)
tim = Timer()

def tick(timer):
    led.toggle()

tim.init(freq=2.5, mode=Timer.PERIODIC, callback=tick)
print("The LED blinks from a hardware timer; the REPL stays free.")
` },
  { file: 'irq_counter.py', title: 'Count presses with an IRQ', tags: ['IRQ', 'button'], parts: [B(14), L(15)], code: `from machine import Pin
import time

button = Pin(14, Pin.IN, Pin.PULL_UP)
led = Pin(15, Pin.OUT)
count = 0

def pressed(pin):
    global count
    count += 1
    led.toggle()
    print("pressed", count, "times")

button.irq(trigger=Pin.IRQ_FALLING, handler=pressed)

while True:
    time.sleep(1)
` },
  { file: 'servo.py', title: 'Servo with PWM', tags: ['PWM', 'servo'], parts: [{ type: 'servo', pins: { sig: 16 } }], code: `from machine import Pin, PWM
import time

servo = PWM(Pin(16))
servo.freq(50)

def angle(deg):
    # 0.5 ms .. 2.5 ms pulse in a 20 ms frame
    us = 500 + deg * 2000 / 180
    servo.duty_ns(int(us * 1000))

while True:
    for a in (0, 45, 90, 135, 180, 90):
        angle(a)
        print(a, "deg")
        time.sleep(0.6)
` },
  { file: 'neopixel_ring.py', title: 'NeoPixel colours', tags: ['neopixel'], parts: [{ type: 'neopixel', pins: { din: 0 } }], code: `import neopixel
from machine import Pin
import time

np = neopixel.NeoPixel(Pin(0), 8)
colors = [(255, 0, 0), (255, 120, 0), (255, 255, 0), (0, 255, 0), (0, 120, 255), (120, 0, 255)]

i = 0
while True:
    for k in range(8):
        np[k] = colors[(i + k) % len(colors)]
    np.write()
    i += 1
    time.sleep(0.15)
` },
  { file: 'ultrasonic.py', title: 'HC-SR04 distance', tags: ['sensor'], parts: [{ type: 'ultrasonic', pins: { trig: 3, echo: 2 }, props: { cm: 42 } }], code: `from machine import Pin, time_pulse_us
import time

trig = Pin(3, Pin.OUT)
echo = Pin(2, Pin.IN)

def distance_cm():
    trig.low()
    time.sleep_us(2)
    trig.high()
    time.sleep_us(10)
    trig.low()
    t = time_pulse_us(echo, 1, 30000)
    return t * 0.0343 / 2

while True:
    print("Distance: %.1f cm" % distance_cm())
    time.sleep(0.5)
` },
  { file: 'dht22.py', title: 'DHT22 temperature & humidity', tags: ['sensor'], parts: [{ type: 'dht', pins: { data: 16 } }], code: `import dht
from machine import Pin
import time

sensor = dht.DHT22(Pin(16))

while True:
    sensor.measure()
    print("Temp: {:.1f} C   Humidity: {:.1f} %".format(sensor.temperature(), sensor.humidity()))
    time.sleep(2)
` },
  { file: 'wifi.py', title: 'Connect to Wi-Fi (Pico W)', tags: ['Pico W', 'network'], boards: ['picow', 'pico2w'], parts: [], code: `import network
import time

wlan = network.WLAN(network.STA_IF)
wlan.active(True)
wlan.connect("RAPTI-Lab", "password123")

while not wlan.isconnected():
    print("connecting...")
    time.sleep(0.5)

print("Connected! IP address:", wlan.ifconfig()[0])
` },
  { file: 'bootsel.py', title: 'Read the BOOTSEL button', tags: ['rp2'], parts: [], code: `import rp2
from machine import Pin
import time

led = Pin("LED", Pin.OUT)
print("Tap and hold BOOTSEL on the board picture")
while True:
    led.value(rp2.bootsel_button())
    time.sleep(0.05)
` },
];

// displays and IoT (examples-more.js)
PI_EXAMPLES.push(...PI_MORE, ...PI_IOT);
PICO_EXAMPLES.push(...PICO_MORE, ...PICO_IOT);
