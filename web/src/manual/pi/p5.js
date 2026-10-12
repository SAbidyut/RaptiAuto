import * as A from './art-pi.js';
import { note, tip, warn, tryIt, steps, ul, table, pre, code, openPi, k } from '../helpers.js';

export default {
  id: 'pi-code', no: 'P5', title: 'GPIO programming', icon: 'bolt',
  blurb: 'gpiozero, RPi.GPIO and machine: outputs, inputs, pull-ups, PWM, events, analog values — and the same task in each library.',
  sections: [
    {
      id: 'libs', title: 'Three libraries, one job',
      html: `
${A.heroLibs()}
<p>To touch a pin from Python you need a <b>library</b>. The lab has the three you will find in tutorials:</p>
${ul(
  '<b><code>gpiozero</code></b> (Pi 4 / Pi 5) — friendly and short. You say what the part <i>is</i>: <code>LED(17)</code>, <code>Button(2)</code>. It looks after pull-ups, pins and clean-up.',
  '<b><code>RPi.GPIO</code></b> (Pi 4 / Pi 5) — the classic. You say what the <i>pin</i> does: <code>GPIO.setup(17, GPIO.OUT)</code>. More lines, more control, found in thousands of old programs.',
  '<b><code>machine</code></b> (Pico) — MicroPython\'s own: <code>Pin</code>, <code>PWM</code>, <code>ADC</code>, <code>I2C</code>.')}
${A.libMap()}
${tip('If you are new, start with <b>gpiozero</b>. Learn <b>RPi.GPIO</b> when you meet it in someone else\'s code.')}
${note('Use one library <b>per pin</b>. If <code>gpiozero</code> has taken GPIO17 and you then <code>GPIO.setup(17, …)</code>, the pin is "in use" (chapter P8).')}`,
    },
    {
      id: 'zero-out', title: 'gpiozero: outputs',
      html: `
${A.gpiozeroDevices()}
<p>Every class in the picture is one <b>part</b>. You create it with its pin number(s) and then use its methods:</p>
${code(`from gpiozero import LED, Buzzer, PWMLED
from time import sleep

led = LED(17)         # an LED on GPIO17
led.on()              # HIGH
sleep(1)
led.off()             # LOW
led.toggle()          # the other state
led.blink(0.2, 0.8)   # on 0.2 s, off 0.8 s, in the background

buzzer = Buzzer(22)
buzzer.beep(0.1, 0.1, n=3)    # three short beeps

dim = PWMLED(18)
dim.value = 0.25      # a quarter of full brightness
dim.pulse()           # fade in and out`, 'py')}
${ul(
  '<code>on()</code> / <code>off()</code> / <code>toggle()</code> / <code>value</code> work for every output.',
  '<code>blink()</code> and <code>beep()</code> run in the <b>background</b>: your program goes on. If it ends at once, the blinking ends too — so finish with <code>from signal import pause</code> and <code>pause()</code>.',
  '<code>PWMLED</code>, <code>Motor</code>, <code>Servo</code> use PWM (see below); <code>RGBLED(red=13, green=19, blue=26)</code> mixes colours; <code>TrafficLights(red=17, amber=27, green=22)</code> bundles three LEDs.')}
${openPi('rgb_colors.py', 'Open: RGB LED colours')}`,
    },
    {
      id: 'zero-in', title: 'gpiozero: inputs, pull-ups and events',
      html: `
${A.pullUpFig()}
<p>A <b>Button</b> connects the GPIO to <b>GND</b> when pressed. The Pi has a resistor inside that pulls the pin up to 3.3 V while nothing is pressed — a <b>pull-up</b>. gpiozero turns it on for you and reports <code>is_pressed</code> = <code>True</code> when the pin goes LOW.</p>
${code(`from gpiozero import Button

button = Button(2)               # GPIO2, wired to GND
print(button.is_pressed)         # True or False right now
button.wait_for_press()          # wait here until pressed
print("pressed!")`, 'py')}
<h3>Polling or events?</h3>
${A.pollVsEvents()}
${A.edgeEvents()}
<p>With <b>events</b> you hand gpiozero a function and it calls it at the right moment:</p>
${code(`from gpiozero import LED, Button
from signal import pause

led = LED(17)
button = Button(2)

button.when_pressed = led.on      # no brackets: the function itself
button.when_released = led.off

pause()                           # keep the program alive`, 'py', { mark: [7, 8] })}
<p>Other input classes: <code>MotionSensor(4)</code> (<code>when_motion</code>), <code>DistanceSensor(echo=24, trigger=23)</code> (<code>distance</code> in metres), <code>LightSensor</code>, <code>LineSensor</code>, <code>MCP3008(channel=0)</code> (<code>value</code> from 0 to 1).</p>
${openPi('button_led.py', 'Open: Button controls an LED')}`,
    },
    {
      id: 'pwm', title: 'PWM: dimming and servos',
      html: `
${A.pwmDuty()}
<p>A pin is either HIGH or LOW — but if you switch it on and off <b>fast</b>, the average voltage lies in between. The share of "on" time is the <b>duty cycle</b>: 0 % = always off, 50 % = half, 100 % = always on. An LED looks dimmer, a motor slower.</p>
${A.servoPulse()}
<p>A <b>servo</b> uses PWM in a different way: it listens to the <b>width of the pulse</b>, repeated every 20 ms. A short pulse turns the arm one way, a long pulse the other way.</p>
${code(`from gpiozero import AngularServo
from time import sleep

servo = AngularServo(12, min_angle=0, max_angle=180,
                     min_pulse_width=0.5/1000, max_pulse_width=2.5/1000)

for angle in (0, 90, 180, 90):
    servo.angle = angle
    sleep(1)`, 'py')}
${openPi('servo_sweep.py', 'Open: Servo sweep')}`,
    },
    {
      id: 'rpigpio', title: 'RPi.GPIO: the classic way',
      html: `
${A.rpiGpioFlow()}
${code(`import RPi.GPIO as GPIO
import time

GPIO.setmode(GPIO.BCM)                 # BCM numbers
GPIO.setup(17, GPIO.OUT)               # LED
GPIO.setup(2, GPIO.IN, pull_up_down=GPIO.PUD_UP)   # button to GND

try:
    while True:
        if GPIO.input(2) == GPIO.LOW:  # pressed
            GPIO.output(17, GPIO.HIGH)
        else:
            GPIO.output(17, GPIO.LOW)
        time.sleep(0.05)
except KeyboardInterrupt:
    pass
finally:
    GPIO.cleanup()                     # give the pins back`, 'py')}
${ul(
  '<b>Always</b> call <code>setmode</code> first. Without it you get <code>RuntimeError: Please set pin numbering mode …</code>.',
  '<code>GPIO.setup(pin, GPIO.OUT)</code> before <code>GPIO.output</code>, <code>GPIO.IN</code> before <code>GPIO.input</code>. <code>pull_up_down</code> is <code>GPIO.PUD_UP</code>, <code>GPIO.PUD_DOWN</code> or <code>GPIO.PUD_OFF</code>.',
  '<b>PWM:</b> <code>pwm = GPIO.PWM(18, 100)</code> (100 Hz), <code>pwm.start(0)</code>, <code>pwm.ChangeDutyCycle(50)</code>, <code>pwm.stop()</code>.',
  '<b>Events:</b> <code>GPIO.add_event_detect(2, GPIO.FALLING, callback=f, bouncetime=200)</code>; or <code>GPIO.wait_for_edge(2, GPIO.FALLING)</code> to wait here.',
  '<code>GPIO.cleanup()</code> in a <code>finally:</code> block makes sure the pins are freed when you press Stop.',
  '<code>GPIO.setwarnings(False)</code> hides the "channel is already in use" warning.')}
${openPi('rpi_gpio_blink.py', 'Open: Blink with RPi.GPIO')}
${openPi('pwm_fade.py', 'Open: Fade an LED with PWM')}`,
    },
    {
      id: 'analog', title: 'Analog values',
      html: `
${A.adcMcp()}
<p>A pin only knows HIGH and LOW. To read a <b>voltage</b> (a potentiometer, a light sensor) the Pi needs help: an <b>MCP3008</b> chip converts it to a number and sends it over SPI. With gpiozero it is one line, and the value is a number between 0 and 1:</p>
${code(`from gpiozero import MCP3008, PWMLED
from time import sleep

pot = MCP3008(channel=0)     # the pot is on CH0 of the chip
led = PWMLED(18)

while True:
    led.value = pot.value    # pot turned up: LED brighter
    print(f"pot = {pot.value:.2f}  ({pot.voltage:.2f} V)")
    sleep(0.2)`, 'py')}
<p>The chip must be wired to the SPI pins (CLK → GPIO11, DOUT → GPIO9, DIN → GPIO10, CS → GPIO8) and powered; if not, the lab prints a hint such as <i>MCP3008: wire CLK → GPIO11 …</i>. A <b>Pico</b> does not need the chip: its pins GP26 – GP28 are analog inputs.</p>
${openPi('pot_dimmer.py', 'Open: Potentiometer dimmer (MCP3008)')}`,
    },
    {
      id: 'pico', title: 'machine on the Pico',
      html: `
${A.picoMachine()}
${code(`from machine import Pin, PWM, ADC
import time

led = Pin(15, Pin.OUT)                       # output
button = Pin(14, Pin.IN, Pin.PULL_UP)        # input with pull-up
dim = PWM(Pin(16))                           # PWM on GP16
dim.freq(1000)
pot = ADC(26)                                # GP26 = ADC0

while True:
    if button.value() == 0:                  # pressed
        led.on()
    else:
        led.off()
    raw = pot.read_u16()                     # 0 ... 65535
    dim.duty_u16(raw)                        # brightness follows the pot
    time.sleep(0.05)`, 'py', { mark: [4, 5, 6, 8] })}
${ul(
  'Pin numbers are the <b>GP numbers</b>: <code>Pin(15)</code> is GP15. <code>Pin("LED")</code> is the on-board LED.',
  '<code>duty_u16()</code> takes 0 … 65535 (16 bit): 0 = off, 65535 = full. <code>read_u16()</code> gives the same range: volts = raw × 3.3 ÷ 65535.',
  'Edges: <code>button.irq(trigger=Pin.IRQ_FALLING, handler=f)</code> calls <code>f(pin)</code> when the pin falls.',
  'I²C: <code>i2c = I2C(0, scl=Pin(5), sda=Pin(4))</code> then <code>i2c.scan()</code> lists device addresses.')}
${openPi('pot_adc.py', 'Open (Pico): Potentiometer on ADC0')}`,
    },
    {
      id: 'compare', title: 'The same task in all three',
      html: `
${A.libCheat()}
${table(['Task', '<code>gpiozero</code>', '<code>RPi.GPIO</code>', '<code>machine</code> (Pico)'], [
  ['Set up an LED', '<code>led = LED(17)</code>', '<code>GPIO.setmode(GPIO.BCM)</code><br><code>GPIO.setup(17, GPIO.OUT)</code>', '<code>led = Pin(15, Pin.OUT)</code>'],
  ['Switch it on', '<code>led.on()</code>', '<code>GPIO.output(17, GPIO.HIGH)</code>', '<code>led.on()</code>'],
  ['Read a button', '<code>b = Button(2)</code><br><code>b.is_pressed</code>', '<code>GPIO.setup(2, GPIO.IN, pull_up_down=GPIO.PUD_UP)</code><br><code>GPIO.input(2) == 0</code>', '<code>b = Pin(14, Pin.IN, Pin.PULL_UP)</code><br><code>b.value() == 0</code>'],
  ['React to a press', '<code>b.when_pressed = f</code>', '<code>GPIO.add_event_detect(2, GPIO.FALLING, f)</code>', '<code>b.irq(handler=f, trigger=Pin.IRQ_FALLING)</code>'],
  ['Dim an LED', '<code>PWMLED(18).value = 0.5</code>', '<code>p = GPIO.PWM(18, 100)</code><br><code>p.start(50)</code>', '<code>p = PWM(Pin(15))</code><br><code>p.duty_u16(32768)</code>'],
  ['Clean up', 'automatic', '<code>GPIO.cleanup()</code>', 'automatic'],
])}
${note('<b>Remember:</b> gpiozero describes parts, RPi.GPIO describes pins, machine is for the Pico · a button between GPIO and GND needs the pull-up (gpiozero does it for you) · events beat polling · PWM = fast on / off, the duty cycle is the "on" share · the Pi has no analog pins: use an MCP3008 · RPi.GPIO needs <code>setmode</code> first and <code>cleanup()</code> last.')}
${tryIt('<b>Exercises.</b> (1) Rewrite the button + LED program with <code>RPi.GPIO</code>. (2) Make an LED on GPIO18 fade up and down with <code>PWMLED.pulse()</code>. (3) Use <code>button.when_held</code> (hold for a second) to turn the LED on for good.')}`,
    },
  ],
};
