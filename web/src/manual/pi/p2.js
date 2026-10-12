import * as A from './art-pi.js';
import { note, tip, warn, tryIt, steps, ul, table, pre, code, openPi, k } from '../helpers.js';

export default {
  id: 'pi-gpio', no: 'P2', title: 'The Raspberry Pi and its GPIO', icon: 'chip',
  blurb: 'The 40-pin header pin by pin, BCM and BOARD numbers, 3.3 V logic, safe wiring and the Pico pinout.',
  sections: [
    {
      id: 'what', title: 'What GPIO is',
      html: `
${A.heroGpio()}
<p><b>GPIO</b> means <i>General Purpose Input / Output</i>. A GPIO is a metal pin of the Pi that your program can use in two ways:</p>
${ul(
  '<b>Output</b> — the program sets the pin to <b>HIGH</b> (about 3.3 V) or <b>LOW</b> (0 V). Use it to light an LED or sound a buzzer.',
  '<b>Input</b> — the program <b>reads</b> whether the pin is HIGH or LOW. Use it for a button, a motion sensor or a switch.')}
<p>The pins sit in a double row on the edge of the board, the <b>40-pin header</b>. Not all 40 are GPIOs: some give <b>power</b> (3.3 V and 5 V) and some are <b>ground</b> (GND, 0 V). In this chapter you learn which pin is which, and how to connect things without hurting the Pi.</p>
${note('The Pi 5 and the Pi 4 have the <b>same</b> header, so every wiring picture in this manual fits both.')}`,
    },
    {
      id: 'header', title: 'The 40 pins, one by one',
      html: `
${A.header40()}
<p>The header has two columns. The <b>odd</b> pins (1, 3, 5 …) are in one row, the <b>even</b> pins (2, 4, 6 …) in the other. Pin 1 is at the corner marked with a square (in the lab drawings it is the bottom-left pin of the strip).</p>
${table(['Kind', 'Pins', 'Remark'], [
  ['<span style="color:#fb923c"><b>3V3</b></span> (3.3 V power)', '1, 17', 'For sensors and displays that run on 3.3 V.'],
  ['<span style="color:#f87171"><b>5V</b></span> (5 V power)', '2, 4', 'Straight from the Pi\'s supply: for servos, HC-SR04, relays, LCDs.'],
  ['<span style="color:#9ca3af"><b>GND</b></span> (ground, 0 V)', '6, 9, 14, 20, 25, 30, 34, 39', 'Any of them; they are all the same wire.'],
  ['<b>GPIO</b>', 'the other 28 pins', 'GPIO0 – GPIO27. GPIO0 and GPIO1 are kept for HAT identification (ID EEPROM): leave them alone.'],
])}
${tip('Tap any pin in the <b>Pinout</b> tab: a sheet tells you its type, its BCM number, its alternative functions and its live state.')}`,
    },
    {
      id: 'groups', title: 'Pins with a special job',
      html: `
${A.pinGroups()}
<p>Every GPIO can be a plain input or output. A few also have a <b>special job</b> that other chips understand:</p>
${ul(
  '<b>I²C</b> (GPIO2 = SDA, GPIO3 = SCL): two wires that talk to many devices at once — an LCD or OLED display, a clock chip, an accelerometer. Each device has an address.',
  '<b>SPI</b> (GPIO10 MOSI, GPIO9 MISO, GPIO11 SCLK, GPIO8 CE0 and GPIO7 CE1): a faster link with an extra "chip select" wire per device — the MCP3008 analog chip, the MAX7219 display.',
  '<b>UART</b> (GPIO14 = TX, GPIO15 = RX): a serial line. Remember: TX of one device goes to <b>RX</b> of the other.')}
<p>Using GPIO2 or GPIO3 for a plain button is fine as long as you do not also connect an I²C device — then the two would fight.</p>`,
    },
    {
      id: 'numbers', title: 'BCM and BOARD: two ways to count',
      html: `
${A.numbering()}
<p>The same pin has two numbers:</p>
${ul(
  '<b>BCM</b> — the number the chip uses (<b>GPIO17</b>). This is what <code>gpiozero</code> uses by default: <code>LED(17)</code>.',
  '<b>BOARD</b> — the <b>position</b> on the header (<b>pin 11</b>). With <code>RPi.GPIO</code> you choose: <code>GPIO.setmode(GPIO.BCM)</code> or <code>GPIO.setmode(GPIO.BOARD)</code>.')}
<p><code>gpiozero</code> also understands names: <code>LED("GPIO17")</code> and <code>LED("BOARD11")</code> are the same pin as <code>LED(17)</code>.</p>
${table(['BCM', 'Pin', 'Often used for', 'BCM', 'Pin', 'Often used for'], [
  ['GPIO2', '3', 'I²C SDA · a button', 'GPIO18', '12', 'PWM · LED, buzzer'],
  ['GPIO3', '5', 'I²C SCL', 'GPIO23', '16', 'HC-SR04 trigger'],
  ['GPIO4', '7', 'DHT22 · PIR', 'GPIO24', '18', 'HC-SR04 echo'],
  ['GPIO17', '11', 'the first LED', 'GPIO25', '22', 'a green LED'],
  ['GPIO27', '13', 'a second LED', 'GPIO12', '32', 'servo · buzzer'],
  ['GPIO22', '15', 'a buzzer, an LED', 'GPIO21', '40', 'a button'],
  ['GPIO10 / 9 / 11 / 8', '19 / 21 / 23 / 24', 'SPI: MOSI / MISO / SCLK / CE0', 'GPIO20 / 21', '38 / 40', 'motor driver inputs'],
])}
${warn('Mixing the two systems is the number one beginner mistake: <code>LED(11)</code> means GPIO11, <b>not</b> pin 11. In this manual a bare number is always BCM.')}`,
    },
    {
      id: 'logic', title: '3.3 V logic: HIGH and LOW',
      html: `
${A.logic33()}
<p>A GPIO pin works with just <b>two voltage levels</b>:</p>
${ul(
  '<b>LOW</b> ≈ <b>0 V</b> — the same as GND. In Python: <code>0</code>, <code>False</code>, <code>.off()</code>.',
  '<b>HIGH</b> ≈ <b>3.3 V</b>. In Python: <code>1</code>, <code>True</code>, <code>.on()</code>.')}
<p>As an <b>input</b> the pin decides at about <b>half</b> the supply (≈ 1.65 V): above is 1, below is 0. As an <b>output</b> a pin can only give a few milliamps — enough for an LED, not for a motor.</p>
${note('Arduino Uno pins are 5 V. The Pi\'s pins are <b>3.3 V</b>. Parts that were made for an Uno usually still work, but 5 V <b>signals</b> must never reach a Pi pin.')}`,
    },
    {
      id: 'danger', title: 'Why 5 V on a pin is dangerous',
      html: `
${A.fiveVoltDanger()}
<p>The chip inside the Pi cannot take more than about 3.3 V on a pin. A 5 V signal pushes current through the chip\'s protection diodes, and the pin <b>wears out and then dies</b>. In the lab the pin shows a warning first (<i>… sees 5.0 V — Raspberry Pi GPIOs are 3.3 V only!</i>) and after some seconds it burns out, with flash and smoke.</p>
<p>Where do 5 V signals come from?</p>
${ul(
  'The <b>HC-SR04</b> ultrasonic sensor: its ECHO pin gives 5 V. Fix: a <b>voltage divider</b> — a 1 kΩ resistor from ECHO to the GPIO and a 2 kΩ resistor from the GPIO to GND. The GPIO then sees 5 V × 2 ÷ (1 + 2) = 3.3 V.',
  'Any module powered from the <b>5V</b> pin whose output pin is connected to a GPIO. Look at its datasheet: many modules give out the voltage they are powered with.',
  'A <b>button wired to 5V</b> instead of to GND or 3V3.')}
${tip('Power a module from <b>3V3</b> when it allows it (DHT22, OLED, potentiometers): its signals then stay at 3.3 V by themselves.')}
${openPi('distance_alarm.py', 'Open: HC-SR04 with the divider')}`,
    },
    {
      id: 'led', title: 'A safe LED circuit',
      html: `
${A.safeLed()}
<p>An LED is not a lamp: it takes <b>as much current as it is given</b> and burns if that is too much. A <b>resistor</b> in series limits the current. The recipe:</p>
${pre(`R = (supply voltage − LED voltage) ÷ current
  = (3.3 V − 2 V) ÷ 0.004 A
  ≈ 330 Ω`)}
<p>A red LED drops about 2 V. With 330 Ω the current is about 4 mA: bright enough, far below the limit. A <b>220 Ω</b> resistor gives about 6 mA. Both are fine.</p>
${ul(
  'One Pi pin may deliver about <b>16 mA</b> in the lab (a Pico pin 12 mA).',
  'The <b>3V3</b> pins are good for small loads only (the pin sheet says about 50 mA).',
  'Bigger loads (motors, relays, a strip of LEDs) need a <b>driver</b>: a transistor, a relay module or an L298N — see chapter P6.')}
${warn('<b>Never</b> connect an LED straight between a GPIO and GND. In the lab the LED lasts only seconds, and the pin is damaged too.')}`,
    },
    {
      id: 'rules', title: 'Six safe wiring rules',
      html: `
${A.safeRules()}
<p>The lab treats these rules like the real world does: a wrong connection burns a part (chapter P3 explains how), and a part that has burnt stays dead until the next <b>Run</b>. That is the cheapest possible lesson.</p>`,
    },
    {
      id: 'pico', title: 'The Pico pinout',
      html: `
${A.picoPinout()}
<p>The Pico is a flat board with <b>40 pins</b> in two rows of 20 — but the pin <b>numbers are different</b> from the Pi:</p>
${ul(
  'Pins are called <b>GP0 … GP22</b> and <b>GP26 … GP28</b>. The number after GP is the number you use in code: <code>Pin(15)</code> is GP15 (physical pin 20).',
  '<b>Eight GND</b> pins (pins 3, 8, 13, 18, 23, 28, 33 and 38; pin 33 is the analog ground AGND).',
  '<b>3V3(OUT)</b> (pin 36) gives 3.3 V for small parts. <b>VBUS</b> (pin 40) is the 5 V from the USB cable, <b>VSYS</b> (pin 39) the board\'s supply.',
  '<b>GP26, GP27, GP28</b> can also measure voltages: <b>ADC0, ADC1, ADC2</b>. The Pi has no such pins!',
  'Default <b>I²C0</b>: GP4 = SDA, GP5 = SCL. Default <b>SPI0</b>: GP16 MISO, GP17 CS, GP18 SCK, GP19 MOSI. <b>UART0</b>: GP0 TX, GP1 RX.',
  'The <b>on-board LED</b> is not on the header: <code>Pin("LED", Pin.OUT)</code> (GP25 on a Pico, a pin of the wireless chip on a Pico W).',
  'The <b>BOOTSEL</b> button can be pressed in the Pinout tab.')}
${note('<b>Remember:</b> GPIO = 3.3 V pins that are inputs or outputs · BCM numbers (GPIO17) are not pin positions (pin 11) · 5 V on a GPIO kills it — use a divider · an LED always needs a resistor · a Pico has GP numbers and three analog pins.')}
${tryIt('<b>Exercises.</b> (1) Which physical pin is GPIO27? (2) Which pins are 5 V? (3) You want a 5 V sensor on GPIO24: what do you add? (4) Which three Pico pins can measure a voltage? <i>Answers: pin 13 · pins 2 and 4 · a 1 kΩ + 2 kΩ divider · GP26, GP27, GP28.</i>')}`,
    },
  ],
};
