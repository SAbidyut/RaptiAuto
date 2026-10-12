import * as A from './art-pi.js';
import { note, tip, warn, tryIt, steps, ul, table, code, project, openPi, k } from '../helpers.js';

export default {
  id: 'pi-projects', no: 'P6', title: 'Projects, step by step', icon: 'target',
  blurb: 'Fourteen projects: blink, button, traffic light, PWM, doorbell, servo, distance, DHT22, LCD, motor, PIR, dimmer and two Pico projects.',
  sections: [
    {
      id: 'how', title: 'How the projects work',
      html: `
${A.projectsHero()}
<p>Every project has the same parts, in the same order. Work through them from the top, or jump to the one you like:</p>
${steps(
  '<b>The card</b> — level, time, parts and what you learn.',
  '<b>The wiring</b> — three or four pictures that build the circuit up. In each picture the <b>new</b> parts and wires are bright, the older ones are faded.',
  '<b>The program</b> — complete, with the important lines marked.',
  '<b>How it works</b> and a <b>Try it</b> idea.',
  '<b>▶ Open this example</b> — one tap opens the real example in the lab, with its circuit built.')}
<h3>Reading the wiring pictures</h3>
${ul(
  'The <b>strip</b> at the bottom is the Pi\'s header (part of it). The <b>number in each pin box is its BCM number</b> (the gold ones are GPIOs, <span style="color:#fb923c">3V3</span> orange, <span style="color:#f87171">5V</span> red, GND grey). A pin that has a wire gets a white ring.',
  'Wire colours follow the rule of chapter P3: <b>red</b> = power, <b>black</b> = GND, other colours = signals.',
  'On the <b>breadboard</b>, rows are <b>a – j</b> and columns are numbers. The five holes of a column are connected, top half (a – e) and bottom half (f – j) separately. The rows on top are the + and − rails.',
  'The example you open builds <b>the same circuit</b> with the same pins — the holes may be a column or two different. Any free column works.')}
${tip('Wire with the circuit <b>stopped</b>. Add a part, draw the wires, <b>then</b> press Run.')}
<p>You need nothing except the lab: a Pi 5 (or Pi 4) for projects 1 – 12 and a Pico for 13 – 14. Start a new project (chapter P1) so that the board is alone on the canvas, add the parts of the card, and follow the pictures.</p>`,
    },
    {
      id: 'out', title: 'Outputs: blink and fade',
      html: `
<h3>Project 1 — Blink an LED</h3>
${project({ level: 'Beginner', time: '10 min', parts: ['Pi 5', 'half breadboard', 'red LED', '330 Ω resistor', '2 wires + 1 jumper'], learn: 'an LED and its resistor, GND, a loop' })}
<p>The "hello world" of electronics: an LED on <b>GPIO17</b> (pin 11) that blinks once a second.</p>
${A.wBlink(['place the resistor across the channel (f5 → d5) and the LED in the top half: anode (long leg, +) in column 5, cathode in column 6.', 'ground: a short jumper from the LED\'s cathode column (e6) to the − rail, and a wire from the Pi\'s GND pin 9 to the − rail.', 'signal: a wire from GPIO17 (pin 11) to the bottom half of the resistor\'s column (j5).']).join('')}
${table(['From', 'To', 'Why'], [
  ['GPIO17 (pin 11)', 'hole j5', 'the signal enters the resistor\'s column'],
  ['resistor f5 → d5', 'LED anode (a5)', 'the resistor limits the current'],
  ['LED cathode (a6)', '− rail (via e6)', 'current flows back to GND'],
  ['GND (pin 9)', '− rail', 'the Pi\'s 0 V joins the rail'],
])}
${code(`# Blink the LED on GPIO17 (pin 11)
from gpiozero import LED
from time import sleep

led = LED(17)

while True:
    led.on()
    sleep(0.5)
    led.off()
    sleep(0.5)`, 'py', { mark: [5, 8, 9] })}
<p><b>How it works.</b> <code>LED(17)</code> makes GPIO17 an output. <code>led.on()</code> sets it HIGH (3.3 V): a current of about 4 mA flows through the resistor and the LED. <code>sleep(0.5)</code> waits half a second. <code>while True:</code> repeats for ever.</p>
${tryIt('Change both <code>0.5</code> to <code>0.1</code> for a fast flicker. Then swap the LED\'s legs and see that nothing lights: an LED works in <b>one direction</b> only.')}
${openPi('blink.py', 'Open this example: blink.py')}

<h3>Project 2 — Fade an LED with PWM</h3>
${project({ level: 'Beginner', time: '10 min', parts: ['the Project 1 circuit', 'LED on GPIO18'], learn: 'PWM and duty cycle, RPi.GPIO, try / finally' })}
<p>Same circuit as Project 1 — only the signal wire moves to <b>GPIO18</b> (pin 12). The program makes the LED glow brighter and dimmer.</p>
${A.wPwm('the circuit of Project 1 with the signal wire on GPIO18 (pin 12).')}
${A.fadeChart()}
${code(`# Software PWM: fade the LED on GPIO18 up and down
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
GPIO.cleanup()`, 'py', { mark: [7, 8, 13] })}
<p><b>How it works.</b> <code>GPIO.PWM(18, 100)</code> switches the pin on and off 100 times a second. <code>ChangeDutyCycle(dc)</code> sets the "on" share from 0 to 100 %. The two <code>for</code> loops count up and down in steps of 5. When you press <b>Stop</b>, the <code>KeyboardInterrupt</code> ends the loop and <code>cleanup()</code> frees the pin.</p>
${tryIt('Change <code>range(0, 101, 5)</code> to <code>range(0, 101, 1)</code> for a smoother fade. Open the <b>Pinout</b> tab while it runs: GPIO18 shows <b>orange</b> (PWM).')}
${openPi('pwm_fade.py', 'Open this example: pwm_fade.py')}`,
    },
    {
      id: 'in', title: 'Inputs: button, doorbell, traffic light',
      html: `
<h3>Project 3 — A button controls the LED</h3>
${project({ level: 'Beginner', time: '15 min', parts: ['Pi 5', 'breadboard', 'LED', '330 Ω', 'push button'], learn: 'inputs, the built-in pull-up, events' })}
<p>Press the button and the LED lights; let go and it goes out. The button sits between <b>GPIO2</b> (pin 3) and GND — no resistor, the Pi\'s pull-up does that job.</p>
${A.wButtonLed(['add the LED circuit of Project 1 and a push button across the channel (columns 11 – 13).', 'ground: the LED\'s cathode jumper, the button\'s top half (a11) to the − rail, and the GND wire from pin 9.', 'signals: GPIO17 → the resistor (j5) and GPIO2 (pin 3) → the button\'s bottom half (j11).']).join('')}
${code(`# Press the button on GPIO2 to light the LED on GPIO17
from gpiozero import LED, Button
from signal import pause

led = LED(17)
button = Button(2)

button.when_pressed = led.on
button.when_released = led.off

print("Press the button ...")
pause()`, 'py', { mark: [8, 9] })}
<p><b>How it works.</b> <code>Button(2)</code> turns on the internal pull-up of GPIO2. Pressed, the button connects the pin to GND (LOW). <code>when_pressed</code> and <code>when_released</code> take a <b>function</b> (<code>led.on</code>, without brackets) that gpiozero calls at the right moment. <code>pause()</code> keeps the program alive.</p>
${tryIt('Add <code>button.when_held = led.blink</code> and hold the button for a second. Press and hold the button part on the canvas while it runs.')}
${openPi('button_led.py', 'Open this example: button_led.py')}

<h3>Project 4 — A doorbell with a visitor counter</h3>
${project({ level: 'Beginner', time: '20 min', parts: ['breadboard', 'green LED + 330 Ω', 'active buzzer', 'push button'], learn: 'three parts together, a counter, wait_for_release' })}
<p>The button rings the buzzer and flashes an LED; the program counts the visitors. Button on <b>GPIO21</b> (pin 40), buzzer on <b>GPIO12</b> (pin 32), LED on <b>GPIO18</b> (pin 12).</p>
${A.wBell(['the LED with its resistor (columns 2 – 3), the buzzer in the bottom half (+ in h8, − in h10) and the button (columns 14 – 16).', 'ground: LED jumper and button jumper to the − rail, a GND wire (pin 25) to the rail, and a second GND wire (pin 20) to the buzzer\'s − column (j10).', 'signals: GPIO18 → the LED (j2), GPIO12 → the buzzer + (j8), GPIO21 → the button (j14).']).join('')}
${code(`# Doorbell: the button (GPIO21) rings the buzzer (GPIO12)
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
    button.wait_for_release()`, 'py', { mark: [13, 14, 16, 21] })}
<p><b>How it works.</b> <code>wait_for_press()</code> stops the program until the button goes down. <code>visitors += 1</code> adds one to the counter. The <code>for</code> loop rings twice: buzzer and LED on for 0.25 s, off for 0.15 s. <code>wait_for_release()</code> makes sure one long press counts as <b>one</b> visitor.</p>
${tryIt('Make the doorbell ring three times, and print "Welcome!" after the tenth visitor with an <code>if visitors == 10:</code>.')}
${openPi('bb_doorbell.py', 'Open this example: bb_doorbell.py')}

<h3>Project 5 — Traffic lights with a pedestrian button</h3>
${project({ level: 'Intermediate', time: '25 min', parts: ['breadboard', 'red, yellow, green LED', '3 × 330 Ω', 'push button'], learn: 'many outputs, a sequence, wait_for_press' })}
<p>Green stays on until a pedestrian presses the button; then amber, red, and back to green. Red <b>GPIO18</b> (pin 12), amber <b>GPIO23</b> (pin 16), green <b>GPIO25</b> (pin 22), button <b>GPIO21</b> (pin 40).</p>
${A.wTraffic(['three LEDs with a resistor each (columns 2, 6, 10) and the button (columns 14 – 16).', 'ground: one jumper from each cathode column and from the button to the − rail, and a GND wire (pin 14) to the rail.', 'signals: GPIO18 → red, GPIO23 → yellow, GPIO25 → green, GPIO21 → the button.']).join('')}
${code(`# Traffic lights built on a breadboard
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
    lights.red.off()`, 'py', { mark: [5, 11, 13, 16] })}
<p><b>How it works.</b> <code>TrafficLights</code> bundles three LEDs under their colour names. The loop is a little <b>state machine</b>: green → (wait for the button) → amber 1.5 s → red 4 s → green again.</p>
${tryIt('Add a flashing amber phase: <code>lights.amber.blink()</code> then <code>sleep(2)</code> and <code>lights.amber.off()</code>. Or turn the lights into a one-way system with no button at all.')}
${openPi('bb_traffic_lights.py', 'Open this example: bb_traffic_lights.py')}`,
    },
    {
      id: 'move', title: 'Things that move: servo and motor',
      html: `
<h3>Project 6 — A servo arm</h3>
${project({ level: 'Beginner', time: '15 min', parts: ['Pi 5', 'SG90 servo', '3 wires'], learn: 'servo pulses, AngularServo, 5 V power' })}
<p>A servo has three wires: <b>GND</b> (brown), <b>V+</b> (red, 5 V) and <b>signal</b> (orange). Signal on <b>GPIO12</b> (pin 32), power from <b>5V</b> (pin 2), ground from pin 6.</p>
${A.wServo(['the servo (part Servo Motor SG90) above the Pi.', 'power: GND (pin 6) to the servo\'s GND and 5V (pin 2) to its V+.', 'signal: GPIO12 (pin 32) to the servo\'s PWM pin.']).join('')}
${code(`# Sweep an SG90 servo on GPIO12 from 0 to 180 degrees
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
        sleep(0.15)`, 'py', { mark: [5, 6, 10] })}
<p><b>How it works.</b> <code>AngularServo</code> converts an angle into the pulse width of the picture in chapter P5 (0.5 ms … 2.5 ms for this servo). Setting <code>servo.angle</code> sends the matching pulses. The loops walk the arm up and down in steps of 15°.</p>
${warn('A real servo pulls current when it moves. A small SG90 may run from the Pi\'s 5V pin, but bigger servos need their <b>own 5 V supply</b> (with its GND joined to the Pi\'s GND).')}
${tryIt('Make the arm point to 90° and stay: <code>servo.angle = 90</code> followed by <code>sleep(60)</code>.')}
${openPi('servo_sweep.py', 'Open this example: servo_sweep.py')}

<h3>Project 7 — A DC motor, forward and backward</h3>
${project({ level: 'Advanced', time: '30 min', parts: ['L298N motor driver', 'DC motor', '9 V supply', '2 buttons'], learn: 'a driver for big loads, a separate supply, Motor' })}
<p>A GPIO pin can give about 16 mA. A motor needs far more, so it never connects to the Pi directly: an <b>L298N driver</b> switches the motor current from its own <b>9 V supply</b> while the Pi only sends signals. The driver\'s <b>IN1</b> and <b>IN2</b> pins decide the direction: GPIO20 (pin 38) and GPIO21 (pin 40).</p>
${A.wMotor(['the motor, the L298N driver and a 9 V supply above the Pi.', 'the motor current: OUT1 / OUT2 to the motor, the supply\'s + to 12V and its − to GND.', 'the Pi: 5V (pin 4) to ENA, GPIO20 to IN1, GPIO21 to IN2, GND (pin 39) to the driver\'s GND.']).join('')}
${note('The motor shares <b>GND</b> with the Pi: both grounds meet at the driver\'s GND pin. Without a common ground the signals mean nothing. The two <b>buttons</b> (forward on GPIO5, backward on GPIO6) are wired from the pin to GND exactly like the button of Project 3.')}
${code(`# GPIO5 button = forward, GPIO6 button = backward, speed ramps with PWM
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
    sleep(0.1)`, 'py', { mark: [5, 10, 12, 16] })}
<p><b>How it works.</b> <code>Motor(forward=20, backward=21)</code> drives the two inputs of the driver. <code>motor.forward(0.5)</code> gives half speed with PWM; <code>backward()</code> reverses; <code>stop()</code> stops it. While the forward button is held, the speed ramps from 10 % to 100 %.</p>
${tryIt('Press the forward button part on the canvas and watch the motor speed up. Change <code>backward(0.6)</code> to <code>backward(1)</code>.')}
${openPi('motor_control.py', 'Open this example: motor_control.py')}`,
    },
    {
      id: 'sense', title: 'Sensors: distance, motion, temperature',
      html: `
<h3>Project 8 — A parking sensor (HC-SR04)</h3>
${project({ level: 'Intermediate', time: '30 min', parts: ['HC-SR04', '1 kΩ + 2 kΩ', 'LED + 330 Ω', 'buzzer'], learn: 'an ultrasonic sensor, a voltage divider, beeping faster as you come close' })}
<p>The sensor sends a sound pulse and times the echo. The closer the object, the faster the buzzer beeps. It needs <b>5 V</b> — and its ECHO signal is 5 V too, so a <b>voltage divider</b> protects the Pi. Trigger on <b>GPIO23</b> (pin 16), echo on <b>GPIO24</b> (pin 18).</p>
${A.wSonar(['the HC-SR04 above the Pi.', 'power: 5V (pin 2) to VCC, GND (pin 6) to GND.', 'trigger: GPIO23 (pin 16) to TRIG.']).join('')}
${A.scene(A.DIVIDER, 3, 'Echo: ECHO → 1 kΩ → a junction that goes to GPIO24 (pin 18); from the junction a 2 kΩ resistor goes to GND (pin 6). The Pi sees 3.3 V.')}
${A.scene(A.OUTS, 3, 'The outputs: an LED (GPIO17) and a buzzer (GPIO22) on a breadboard, wired like the earlier projects.')}
${code(`# Beep faster as an object comes closer (move the distance slider)
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
    sleep(0.3)`, 'py', { mark: [5, 10, 12, 14] })}
<p><b>How it works.</b> <code>sensor.distance</code> is in <b>metres</b>, so <code>× 100</code> gives centimetres. Under 15 cm: continuous tone and the LED on. Between 15 and 60 cm: one short beep whose pause grows with the distance. Further away: silence.</p>
${tryIt('Press <b>Run</b>, tap the HC-SR04 part and move the <b>distance slider</b>. Change the 15 and 60 to make a "garage" that warns earlier.')}
${openPi('distance_alarm.py', 'Open this example: distance_alarm.py')}

<h3>Project 9 — A motion alarm (PIR)</h3>
${project({ level: 'Beginner', time: '20 min', parts: ['HC-SR501 PIR', 'LED', 'buzzer'], learn: 'a digital sensor, events from a sensor' })}
<p>The PIR sensor sees warm bodies move. Its OUT pin goes HIGH on motion: <b>GPIO4</b> (pin 7). Power from <b>5V</b> (pin 2).</p>
${A.wPir(['the PIR sensor above the Pi.', 'power: 5V (pin 2) to VCC and GND (pin 6) to GND.', 'signal: GPIO4 (pin 7) to OUT.']).join('')}
${A.scene(A.OUTS, 3, 'The outputs: the LED (GPIO17) and the buzzer (GPIO22), the same output stage as in Project 8.')}
${code(`# Sound the alarm when the PIR sensor sees motion
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
pause()`, 'py', { mark: [10, 15, 20, 21] })}
<p><b>How it works.</b> Two small <b>functions</b> hold what should happen. <code>pir.when_motion = alarm</code> tells gpiozero to call <code>alarm</code> as soon as the sensor reports motion, <code>when_no_motion</code> calls <code>clear</code> when it is quiet again. <code>pause()</code> lets the program wait for those events.</p>
${tryIt('Run it, tap the PIR part and press <b>Wave a hand</b>. Add a counter that prints how many alarms there have been.')}
${openPi('motion_alarm.py', 'Open this example: motion_alarm.py')}

<h3>Project 10 — Temperature and humidity (DHT22)</h3>
${project({ level: 'Beginner', time: '20 min', parts: ['DHT22 / DHT11 sensor', '3 wires'], learn: 'a sensor library, try / except, f-strings' })}
<p>The DHT22 measures temperature and humidity and sends them on <b>one data wire</b>: <b>GPIO4</b> (pin 7). Power it from <b>3V3</b> (pin 1) — so its signal is 3.3 V.</p>
${A.wDht(['the DHT22 above the Pi.', 'power: 3V3 (pin 1) to VCC and GND (pin 6) to GND.', 'data: GPIO4 (pin 7) to DATA.']).join('')}
${code(`# Read a DHT22 on GPIO4 and the Pi's own CPU temperature
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
    time.sleep(2)`, 'py', { mark: [7, 12, 13] })}
<p><b>How it works.</b> <code>board.D4</code> is GPIO4 in the <code>board</code> library\'s language. <code>dht.temperature</code> and <code>dht.humidity</code> read the sensor. Real DHT sensors sometimes fail a reading, so the reading is inside <code>try … except RuntimeError</code>: on an error the program prints it and tries again after two seconds. <code>CPUTemperature()</code> is the temperature of the Pi\'s own chip.</p>
${tip('Tap the DHT22 part while it runs and move the temperature and humidity sliders. Real DHT22 chips need two seconds between readings — the <code>sleep(2)</code>.')}
${openPi('weather.py', 'Open this example: weather.py')}`,
    },
    {
      id: 'disp', title: 'Display and analog: LCD clock and dimmer',
      html: `
<h3>Project 11 — An LCD clock (I²C)</h3>
${project({ level: 'Intermediate', time: '25 min', parts: ['16×2 LCD with I²C backpack', '4 wires'], learn: 'I²C, a display library, formatting text' })}
<p>The LCD has a small <b>I²C backpack</b> so it needs only four wires: power <b>5V</b> (pin 2) and <b>GND</b> (pin 6), and the two I²C lines <b>SDA = GPIO2</b> (pin 3) and <b>SCL = GPIO3</b> (pin 5). It answers to the address <b>0x27</b>.</p>
${A.wLcd(['the LCD above the Pi.', 'power: GND (pin 6) and 5V (pin 2).', 'I²C: GPIO2 (pin 3) to SDA and GPIO3 (pin 5) to SCL.']).join('')}
${code(`# 16x2 LCD (I2C backpack, address 0x27): date, time and the Pi's CPU temperature
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
    time.sleep(0.5)`, 'py', { mark: [7, 13, 14] })}
<p><b>How it works.</b> <code>CharLCD('PCF8574', 0x27, cols=16, rows=2)</code> says: a PCF8574 backpack at address 0x27 with 16 columns and 2 rows. <code>cursor_pos = (row, column)</code> chooses where the next text goes, <code>write_string()</code> writes it. <code>strftime</code> formats the date and time; <code>"{:4.1f}"</code> prints the temperature with one decimal.</p>
${tryIt('Print your name on line 1 and the seconds on line 2. Then try the OLED display instead (<code>oled_hello.py</code>, powered from <b>3V3</b>, address 0x3C).')}
${openPi('lcd_clock.py', 'Open this example: lcd_clock.py')}
${openPi('oled_hello.py', 'Also: an OLED display')}

<h3>Project 12 — A dimmer with a potentiometer (MCP3008)</h3>
${project({ level: 'Advanced', time: '35 min', parts: ['MCP3008 chip', 'potentiometer', 'LED + 330 Ω (GPIO18)', '14 wires'], learn: 'analog input on a Pi, SPI, mapping a value' })}
<p>The Pi cannot read a potentiometer by itself, so an <b>MCP3008</b> reads it and talks to the Pi over <b>SPI</b>: CLK → GPIO11 (pin 23), DOUT → GPIO9 (pin 21), DIN → GPIO10 (pin 19), CS → GPIO8 (pin 24). The pot\'s middle pin (SIG) goes to the chip\'s <b>CH0</b>.</p>
${A.wMcp(['the MCP3008 chip and the potentiometer above the Pi.', 'power: 3V3 (pin 17) to VDD (and VREF), GND (pin 20) to AGND, GND (pin 25) to DGND.', 'SPI: GPIO11 → CLK, GPIO9 → DOUT, GPIO10 → DIN, GPIO8 → CS.', 'the potentiometer: 3V3 (pin 1) to its VCC, GND (pin 14) to its GND, its SIG to CH0.']).join('')}
<p>The LED with its resistor goes on <b>GPIO18</b> exactly as in Project 4 (wire GPIO18 to the resistor).</p>
${code(`# The Pi has no analog inputs: an MCP3008 ADC on SPI reads the pot
from gpiozero import MCP3008, PWMLED
from time import sleep

pot = MCP3008(channel=0)
led = PWMLED(18)

while True:
    led.value = pot.value
    print(f"pot = {pot.value:.2f}  ({pot.voltage:.2f} V)")
    sleep(0.2)`, 'py', { mark: [5, 9] })}
<p><b>How it works.</b> The chip turns the voltage on CH0 (0 – 3.3 V) into a number between 0 and 1023; gpiozero hands it over as <code>value</code> between 0.0 and 1.0 and as <code>voltage</code>. <code>PWMLED.value</code> takes the same 0 … 1, so the pot sets the brightness directly.</p>
${warn('If the lab prints <i>MCP3008: wire CLK → GPIO11 …</i> or <i>MCP3008 has no power</i>, check the SPI wires and the power pins: VDD and VREF to 3V3, AGND and DGND to GND.')}
${tryIt('Turn the potentiometer part on the canvas while the program runs and watch the printed value and the LED.')}
${openPi('pot_dimmer.py', 'Open this example: pot_dimmer.py')}`,
    },
    {
      id: 'pico', title: 'Pico projects: blink and ADC',
      html: `
<h3>Project 13 — Blink on a Raspberry Pi Pico</h3>
${project({ level: 'Beginner', time: '10 min', parts: ['Pico (any)', 'LED + 330 Ω (optional)'], learn: 'MicroPython, Pin, the on-board LED' })}
<p>Every Pico has an LED on the board: no wires, no parts. <code>Pin("LED")</code> finds it on a Pico, Pico 2 <b>and</b> on the W models.</p>
${code(`from machine import Pin
import time

led = Pin("LED", Pin.OUT)   # Pico: GP25 · Pico W: the LED on the wireless chip

while True:
    led.toggle()
    time.sleep(0.5)`, 'py', { mark: [4, 7] })}
<p>For an <b>external LED</b> change the pin to <code>Pin(15, Pin.OUT)</code> (GP15, physical pin 20) and wire it with a resistor to a GND pin:</p>
${A.wPicoLed(['the resistor across the channel and the LED in the top half, as in Project 1.', 'ground: jumper to the − rail and a wire from the Pico\'s GND (pin 18) to the rail.', 'signal: GP15 (pin 20) to the resistor\'s column.']).join('')}
<p><b>How it works.</b> <code>Pin("LED", Pin.OUT)</code> makes an output pin. <code>toggle()</code> flips it: on becomes off, off becomes on. On the Pico there is no GPIO number problem — the number you write is the <b>GP</b> number printed on the board.</p>
${tryIt('In the Thonny toolbar press <b>Run</b>, then in the Pinout tab watch the LED beside the USB connector blink. Press <b>Stop</b>, then try the traffic-light example <code>traffic_light.py</code> for three LEDs.')}
${openPi('main.py', 'Open this example (Pico): main.py')}
${openPi('traffic_light.py', 'More: a Pico traffic light')}

<h3>Project 14 — A potentiometer on the ADC (Pico)</h3>
${project({ level: 'Beginner', time: '15 min', parts: ['Pico', 'potentiometer', 'LED + 330 Ω on GP15'], learn: 'analog input, ADC, PWM duty from a value' })}
<p>A Pico reads voltages on its own: <b>GP26 = ADC0</b> (pin 31). Power the pot from <b>3V3(OUT)</b> (pin 36) and the analog ground <b>AGND</b> (pin 33).</p>
${A.wPicoPot(['the potentiometer above the Pico.', 'power: AGND (pin 33) to GND and 3V3(OUT) (pin 36) to VCC.', 'signal: GP26 (pin 31) to the pot\'s SIG.']).join('')}
${code(`from machine import ADC, Pin, PWM
import time

pot = ADC(26)            # GP26 = ADC0
led = PWM(Pin(15))
led.freq(1000)

while True:
    raw = pot.read_u16()
    volts = raw * 3.3 / 65535
    led.duty_u16(raw)
    print("raw:", raw, " voltage: %.2f V" % volts)
    time.sleep(0.3)`, 'py', { mark: [4, 9, 11] })}
<p><b>How it works.</b> <code>read_u16()</code> returns a number from 0 (0 V) to 65535 (3.3 V). Multiplying by <code>3.3 / 65535</code> turns it into volts. The same number goes to <code>duty_u16()</code>, so the LED on GP15 gets brighter as the voltage rises.</p>
${tryIt('Replace <code>ADC(26)</code> with <code>ADC(4)</code> — the chip\'s <b>temperature sensor</b> — and compute <code>27 - (volts - 0.706) / 0.001721</code>. That is the example <code>temperature.py</code>.')}
${openPi('pot_adc.py', 'Open this example (Pico): pot_adc.py')}
${openPi('temperature.py', 'More: the internal temperature sensor')}
${note('<b>Remember:</b> LED + resistor, always · a button goes between the GPIO and GND · a driver (L298N, relay) carries big loads · 5 V signals need a divider · sensors give values (<code>distance</code>, <code>temperature</code>) or events (<code>when_motion</code>) · the Pi needs a chip for analog values, the Pico has ADC pins.')}
${tryIt('<b>Exercises.</b> (1) Combine Projects 3 and 5: a traffic light whose pedestrian button is on GPIO2. (2) Let the distance sensor of Project 8 control the servo of Project 6. (3) Show the DHT22 temperature on the LCD.')}`,
    },
  ],
};
