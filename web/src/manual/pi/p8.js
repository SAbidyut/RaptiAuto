import * as A from './art-pi.js';
import { note, tip, warn, tryIt, steps, ul, table, pre, code, openPi, k } from '../helpers.js';
import { BOARDS, BOARD_ORDER } from '../../pi/boards.js';

const boardRows = BOARD_ORDER.map((id) => {
  const b = BOARDS[id], pico = b.kind === 'pico';
  return [`<b>${b.name}</b>`, String(b.year), b.mcu || b.soc.replace('Broadcom ', ''), b.cpu.replace('Quad-core ', '4 × ').replace('Dual-core ', '2 × '), b.ram + (b.flash ? ' · ' + b.flash + ' flash' : ''), pico ? 'MicroPython · Thonny' : 'Python 3 · Desktop · Terminal · Thonny'];
});

export default {
  id: 'pi-ref', no: 'P8', title: 'Reference and troubleshooting', icon: 'list',
  blurb: 'Boards, parts, libraries, a troubleshooting path, the error messages explained, gestures, keys and a glossary.',
  sections: [
    {
      id: 'boards', title: 'The boards',
      html: `
${A.heroRef()}
<p>Quick facts about the six boards of the lab (from the board sheets of the app):</p>
${table(['Board', 'Year', 'Chip', 'CPU', 'Memory', 'Runs'], boardRows)}
${table(['', 'Pi 5 · Pi 4', 'Pico · Pico W · Pico 2 · Pico 2 W'], [
  ['<b>GPIO count</b>', '28 (GPIO0 – GPIO27)', '26 (GP0 – GP22, GP26 – GP28)'],
  ['<b>Logic level</b>', '3.3 V', '3.3 V'],
  ['<b>Pin current in the lab</b>', 'about 16 mA per pin', 'about 12 mA per pin'],
  ['<b>Analog inputs</b>', 'none (use an MCP3008)', 'ADC0 – ADC2 on GP26 – GP28, ADC4 = chip temperature'],
  ['<b>I²C default</b>', 'GPIO2 SDA · GPIO3 SCL', 'GP4 SDA · GP5 SCL (I²C0)'],
  ['<b>SPI default</b>', 'GPIO10 MOSI · GPIO9 MISO · GPIO11 SCLK · GPIO8 CE0', 'GP19 MOSI · GP16 MISO · GP18 SCK · GP17 CS (SPI0)'],
  ['<b>UART</b>', 'GPIO14 TX · GPIO15 RX', 'GP0 TX · GP1 RX (UART0), GP4 / GP5 (UART1)'],
  ['<b>Wi-Fi</b>', 'built in (simulated network)', 'Pico W and Pico 2 W only'],
])}
<p>Pin diagrams: chapter P2. Choosing a board: chapter P1.</p>`,
    },
    {
      id: 'parts', title: 'The parts you can wire',
      html: `
${A.partsTiles()}
<p>The library has <b>68 parts</b>. These are the ones the Pi and Pico examples use, with their pins and the Python class that talks to them:</p>
${table(['Part', 'Pins', 'Typical Python'], [
  ['LED', 'A (anode, +), C (cathode, −)', '<code>LED(17)</code> · <code>PWMLED(18)</code> · <code>Pin(15, Pin.OUT)</code>'],
  ['RGB LED', 'R, G, B, COM', '<code>RGBLED(13, 19, 26)</code>'],
  ['Push button', '1.l / 1.r, 2.l / 2.r', '<code>Button(2)</code> · <code>Pin(14, Pin.IN, Pin.PULL_UP)</code>'],
  ['Buzzer', '+, −', '<code>Buzzer(22)</code> · <code>TonalBuzzer</code> (passive)'],
  ['Servo SG90', 'GND, V+, PWM', '<code>AngularServo(12, …)</code> · <code>PWM(Pin(16))</code>'],
  ['HC-SR04', 'VCC, TRIG, ECHO, GND', '<code>DistanceSensor(echo=24, trigger=23)</code> · <code>time_pulse_us</code>'],
  ['DHT22 / DHT11', 'VCC, DATA, NC, GND', '<code>adafruit_dht.DHT22(board.D4)</code> · <code>dht.DHT22(Pin(16))</code>'],
  ['PIR HC-SR501', 'VCC, OUT, GND', '<code>MotionSensor(4)</code>'],
  ['LCD 16×2 (I²C)', 'GND, VCC, SDA, SCL', '<code>RPLCD.i2c.CharLCD</code> · <code>i2c_lcd</code>'],
  ['OLED SSD1306', 'GND, VCC, SCL, SDA', '<code>adafruit_ssd1306</code> · <code>ssd1306</code>'],
  ['TM1637', 'CLK, DIO, VCC, GND', '<code>tm1637.TM1637(clk=23, dio=24)</code>'],
  ['MAX7219 matrix', 'VCC, GND, DIN, CS, CLK', '<code>max7219</code> (+ <code>spidev</code> on the Pi)'],
  ['NeoPixel strip', 'GND, VCC, DIN, DOUT', '<code>neopixel</code>'],
  ['MCP3008', 'VDD, VREF, AGND, DGND, CLK, DOUT, DIN, CS, CH0 … CH7', '<code>MCP3008(channel=0)</code>'],
  ['Potentiometer', 'GND, SIG, VCC', 'read through an <code>MCP3008</code> (Pi) or <code>ADC(26)</code> (Pico)'],
  ['Relay module', 'VCC, GND, IN, NO, COM, NC', '<code>OutputDevice(26)</code>'],
  ['L298N + DC motor', 'ENA, IN1 … IN4, ENB, 12V, GND, 5V, OUT1 … OUT4', '<code>Motor(forward=20, backward=21)</code>'],
])}
${tip('Not sure which pins a part has? Add it, tap it and choose <b>Info</b> / <b>Edit</b>; touch a pin to see its name.')}`,
    },
    {
      id: 'libs', title: 'Library cheat-sheet',
      html: `
${A.libCheat()}
<h3>gpiozero</h3>
${table(['Class', 'Use it for', 'Handy members'], [
  ['<code>LED</code>, <code>Buzzer</code>', 'on / off outputs', '<code>on() off() toggle() blink() beep()</code>'],
  ['<code>PWMLED</code>', 'dimming', '<code>value = 0 … 1</code>, <code>pulse()</code>'],
  ['<code>RGBLED</code>', 'colours', '<code>color = (r, g, b)</code>'],
  ['<code>TrafficLights</code>, <code>LEDBoard</code>', 'several LEDs', '<code>.red.on()</code>, <code>.on()</code>'],
  ['<code>Motor</code>, <code>Robot</code>', 'motors with a driver', '<code>forward(s) backward(s) stop()</code>'],
  ['<code>Servo</code>, <code>AngularServo</code>', 'servos', '<code>value = -1 … 1</code>, <code>angle</code>'],
  ['<code>Button</code>', 'push buttons', '<code>is_pressed when_pressed when_released when_held wait_for_press()</code>'],
  ['<code>MotionSensor</code>', 'PIR', '<code>when_motion when_no_motion</code>'],
  ['<code>DistanceSensor</code>', 'HC-SR04', '<code>distance</code> (m), <code>when_in_range</code>'],
  ['<code>MCP3008</code>', 'analog values', '<code>value voltage raw_value</code>'],
  ['<code>CPUTemperature</code>', 'the Pi\'s own chip', '<code>temperature</code>'],
])}
<p>Pins can be given as <code>17</code>, <code>"GPIO17"</code> or <code>"BOARD11"</code>. Use <code>device.close()</code> or a <code>with</code> block to free a pin.</p>
<h3>RPi.GPIO</h3>
${table(['Call', 'Does'], [
  ['<code>GPIO.setmode(GPIO.BCM)</code> / <code>GPIO.BOARD</code>', 'choose the numbering (first!)'],
  ['<code>GPIO.setup(pin, GPIO.OUT)</code>', 'make an output'],
  ['<code>GPIO.setup(pin, GPIO.IN, pull_up_down=GPIO.PUD_UP)</code>', 'make an input (PUD_UP / PUD_DOWN / PUD_OFF)'],
  ['<code>GPIO.output(pin, GPIO.HIGH)</code> · <code>GPIO.input(pin)</code>', 'write / read'],
  ['<code>GPIO.PWM(pin, hz)</code> → <code>start() ChangeDutyCycle() ChangeFrequency() stop()</code>', 'software PWM'],
  ['<code>add_event_detect(pin, edge, callback, bouncetime)</code> · <code>wait_for_edge</code> · <code>event_detected</code>', 'edges: RISING, FALLING, BOTH'],
  ['<code>GPIO.cleanup()</code> · <code>GPIO.setwarnings(False)</code>', 'free the pins · hide warnings'],
])}
<h3>machine (Pico)</h3>
${table(['Call', 'Does'], [
  ['<code>Pin(15, Pin.OUT)</code> · <code>Pin(14, Pin.IN, Pin.PULL_UP)</code>', 'output / input'],
  ['<code>pin.on() off() toggle() value()</code>', 'write / read'],
  ['<code>pin.irq(trigger=Pin.IRQ_FALLING, handler=f)</code>', 'edge event'],
  ['<code>PWM(Pin(15)); .freq(1000); .duty_u16(0 … 65535)</code>', 'PWM'],
  ['<code>ADC(26).read_u16()</code>', 'analog 0 … 65535'],
  ['<code>I2C(0, scl=Pin(5), sda=Pin(4)).scan()</code>', 'I²C bus'],
  ['<code>Timer</code>, <code>time_pulse_us</code>, <code>machine.reset()</code>', 'timer · pulse length · restart'],
])}`,
    },
    {
      id: 'debug', title: 'Nothing works: a path to the answer',
      html: `
${A.debugFlow()}
${steps(
  '<b>Run first.</b> The circuit is dark until Run (or a program started anywhere) powers it.',
  '<b>Read the Output.</b> Red text is an error; the last line tells you what is wrong (next section).',
  '<b>Check the number.</b> <code>LED(17)</code> is GPIO17, which is <b>pin 11</b>. A common slip is wiring pin 17 and coding 17.',
  '<b>Check the ground.</b> Every LED, button and sensor needs a path back to a GND pin.',
  '<b>Open the Pinout tab.</b> Does the pin change colour when it should? Yes → wiring problem. No → program problem.',
  '<b>Look for warnings.</b> The ⚠ pill on the canvas lists hints (<i>HC-SR04 has no power …</i>). Burnt parts are announced there: press <b>Stop</b>, then <b>Run</b> to get new ones.',
  '<b>Make it small.</b> Open the matching example, check that it works, then change one thing at a time.')}
${tip('The best friend of a debugger is <code>print()</code>. Print a value before and after the line you doubt, and look at the Output.')}`,
    },
    {
      id: 'errors', title: 'Error messages explained',
      html: `
${A.errorCards()}
${table(['What you see', 'Why', 'Fix'], [
  ['<code>ImportError: no module named \'numpy\'</code>', 'The library is not in the lab (numpy, OpenCV, pandas …).', 'Use the libraries of chapter P5. Real Python names this error <code>ModuleNotFoundError</code>.'],
  ['<code>ImportError: can\'t import name LEd</code>', 'A name that the library does not have: a typo.', 'Check upper / lower case: <code>LED</code>.'],
  ['<code>GPIOPinInUse: pin GPIO17 is already in use by …</code>', 'Two gpiozero objects on one pin, or the last run did not finish.', '<code>close()</code> the first, or create the object once. Press Stop and run again.'],
  ['<code>RuntimeWarning: This channel is already in use</code>', 'RPi.GPIO: the pin was set up before.', '<code>GPIO.cleanup()</code> at the end, or <code>GPIO.setwarnings(False)</code>.'],
  ['<code>RuntimeError: Please set pin numbering mode …</code>', 'RPi.GPIO: <code>setmode</code> is missing.', '<code>GPIO.setmode(GPIO.BCM)</code> at the top.'],
  ['<code>RuntimeError: The GPIO channel has not been set up as an OUTPUT</code>', 'RPi.GPIO: <code>output()</code> without <code>setup()</code>.', '<code>GPIO.setup(pin, GPIO.OUT)</code> first. (For inputs: <i>You must setup() the GPIO channel first</i>.)'],
  ['<code>PinInvalidPin: 99 is not a valid pin</code>', 'gpiozero knows BCM 0 – 27.', 'Use a BCM number from the header.'],
  ['<code>DeviceClosed: LED is closed or uninitialized</code>', 'The device was <code>close()</code>d.', 'Create it again, or do not close it.'],
  ['<code>ValueError: invalid pin</code> (Pico)', 'A GP number outside 0 – 29.', 'Look at the Pico pinout.'],
  ['<code>ValueError: Pin doesn\'t have ADC capabilities</code>', '<code>ADC()</code> only works on GP26 – GP28 and 4.', 'Move the wire to GP26 – GP28.'],
  ['<code>SyntaxError: invalid syntax</code>', 'A colon, bracket or indentation is wrong at or just before the line.', 'Look at the line before, too.'],
  ['<code>NameError: name \'x\' isn\'t defined</code>', 'A typo or a missing <code>import</code>.', 'Check the spelling.'],
  ['The Output shows a question and nothing moves', 'The program waits at <code>input()</code>.', 'Type the answer and press Enter.'],
  ['<i>Stop the program to change the circuit</i>', 'You tried to edit while it is powered.', 'Press Stop first.'],
  ['<i>💥 … burned out</i>', 'Too much current or voltage (chapter P3).', 'Fix the cause, then Stop / Run.'],
  ['<i>⚡ Power cut</i>', 'A short circuit on 3V3 / 5V.', 'Find the wire that joins 3V3 / 5V to GND.'],
  ['<i>Backend terminated. Press Stop to restart.</i>', 'Another window (Terminal) took the Python.', 'Press Stop in Thonny.'],
  ['<code>bash: foo: command not found</code>', 'The Terminal does not have that command.', 'Type <code>help</code> for the list.'],
])}`,
    },
    {
      id: 'gest', title: 'Gestures and keys',
      html: `
${A.gestures()}
${table(['Where', 'Key', 'Does'], [
  ['Output, Thonny, Terminal key bar', '<kbd>Ctrl+C</kbd>', 'interrupt the program (KeyboardInterrupt)'],
  ['Thonny shell · Pico', '<kbd>Ctrl+D</kbd>', 'restart the backend · Pico: soft reboot, runs main.py'],
  ['Terminal', '<kbd>Tab</kbd>', 'complete a name'],
  ['Shell and Terminal', '<kbd>↑</kbd> <kbd>↓</kbd>', 'old lines / commands'],
  ['Terminal', '<kbd>Ctrl+L</kbd> · <kbd>Ctrl+D</kbd>', 'clear · close'],
  ['Text Editor', '<kbd>Ctrl+S</kbd>', 'save'],
  ['nano', '<kbd>Ctrl+O</kbd> · <kbd>Ctrl+X</kbd>', 'write out · exit'],
])}
${table(['Tab bar (landscape)', 'Result'], [
  ['tap a closed tab', 'opens it beside the current screen'],
  ['tap an open tab', 'closes it (not the last one)'],
  ['tap a third tab', 'replaces the second screen'],
  ['Run', 'opens Output next to the circuit or code'],
])}`,
    },
    {
      id: 'glossary', title: 'Glossary',
      html: `
${table(['Word', 'Meaning'], [
  ['<b>ADC</b>', 'Analog-to-digital converter: turns a voltage into a number. Built into the Pico; a separate chip (MCP3008) for the Pi.'],
  ['<b>Anode / cathode</b>', 'The + leg and the − leg of an LED. Current flows from anode to cathode.'],
  ['<b>BCM</b>', 'The GPIO numbers of the chip (GPIO17). Not the pin positions.'],
  ['<b>BOARD</b>', 'Numbering by position on the 40-pin header (pin 11).'],
  ['<b>Breadboard</b>', 'A board with connected holes for building circuits without solder.'],
  ['<b>Callback</b>', 'A function you give to a library; it calls it when something happens (<code>when_pressed</code>).'],
  ['<b>Duty cycle</b>', 'The share of time a PWM signal is HIGH, in percent.'],
  ['<b>Edge</b>', 'The moment a signal changes: rising (LOW → HIGH) or falling (HIGH → LOW).'],
  ['<b>Event</b>', 'Something that happens (a press, motion) and triggers a callback.'],
  ['<b>GND</b>', 'Ground, 0 V: the common return of every circuit.'],
  ['<b>GPIO</b>', 'General Purpose Input / Output: a pin your program controls.'],
  ['<b>HIGH / LOW</b>', 'The two logic levels: about 3.3 V and about 0 V.'],
  ['<b>I²C</b>', 'A two-wire bus (SDA, SCL) for displays and sensors; every device has an address.'],
  ['<b>MicroPython</b>', 'A small Python for microcontrollers like the Pico — and the engine behind the lab.'],
  ['<b>PIR</b>', 'Passive infrared sensor: detects moving warm bodies.'],
  ['<b>Pull-up / pull-down</b>', 'A resistor that holds an input at HIGH / LOW while nothing drives it.'],
  ['<b>PWM</b>', 'Pulse-width modulation: fast on / off switching to dim or to position a servo.'],
  ['<b>REPL / Shell</b>', 'The <code>&gt;&gt;&gt;</code> prompt where Python runs your lines at once.'],
  ['<b>SPI</b>', 'A fast bus (MOSI, MISO, SCLK, CS) for chips such as the MCP3008 and MAX7219.'],
  ['<b>Traceback</b>', 'The report Python prints when an error stops the program.'],
  ['<b>UART</b>', 'A serial line (TX, RX) between two devices.'],
  ['<b>Voltage divider</b>', 'Two resistors that cut a voltage to a fraction (5 V → 3.3 V with 1 kΩ + 2 kΩ).'],
])}
${note('<b>Remember:</b> when something fails, read the last line of the error, check the BCM number, the ground and the pin colour in the Pinout tab — in that order.')}`,
    },
  ],
};
