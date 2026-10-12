import * as E from './art-ard-ext.js';
import { note, tip, warn, tryIt, steps, ul, table, code as codeRaw, project, openArd, esc } from '../helpers.js';
import { allDefs, pinsOf, CATEGORIES } from '../../components/index.js';

// A code listing with no extra newline between the numbered lines (the lines are blocks already).
const code = (...a) => codeRaw(...a).replace(/<\/span>\n<span class="ln/g, '</span><span class="ln');
const hero = (figure, text) => `<div class="mx-ard-hero">${figure}<p class="mx-ard-promise">${text}</p></div>`;

/** The catalogue of one or more categories, built from the parts library itself (names, pins, what it is for). */
const shortText = (t) => {
  const s = String(t || '').trim();
  if (s.length <= 150) return s;
  const m = /^.{20,150}?[.!?](?=\s)/.exec(s);
  return m ? m[0] : s.slice(0, 147) + '…';
};
const pinsText = (type) => {
  if (type.startsWith('breadboard')) return 'holes a – j, + and − rails';
  const ids = pinsOf({ type, props: {} }).map((p) => p.id);
  return ids.length > 12 ? `${ids.length} pins` : ids.join(' · ');
};
const catalogue = (...cats) => table(['Part', 'What it is for'],
  allDefs().filter((d) => cats.includes(d.category)).map((d) => [`<b>${esc(d.name)}</b><br><small>${esc(pinsText(d.type))}</small>`, esc(shortText(d.description))]));

export default {
  id: 'ard-ref', no: 'A8', title: 'Boards, pins and reference', icon: 'chip',
  blurb: 'Every board of the lab side by side, pinouts of the Uno and the ESP32, the parts catalogue, a glossary, troubleshooting, gestures and shortcuts, resistor colours and Ohm\'s law.',
  sections: [
    {
      id: 'ref-boards', title: 'The boards of the lab',
      html: `
${hero(E.boardsHero(), 'Ten boards, three families. Pick the board when you start a project — or add one later with ＋ → Microcontrollers. They differ in speed, memory, pins and in the voltage that means HIGH.')}
<h3>The brains</h3>
${table(['Board', 'Chip', 'Clock', 'Logic'], [
  ['<b>Arduino Uno R3</b>', 'ATmega328P', '16 MHz', '5 V'],
  ['<b>Uno R4 Minima</b>', 'Renesas RA4M1 (Arm Cortex-M4)', '48 MHz', '5 V'],
  ['<b>Uno R4 WiFi</b>', 'RA4M1 + ESP32-S3, 12 × 8 LED matrix', '48 MHz', '5 V'],
  ['<b>Leonardo</b>', 'ATmega32U4, native USB', '16 MHz', '5 V'],
  ['<b>Nano</b>', 'ATmega328P, breadboard friendly', '16 MHz', '5 V'],
  ['<b>Mega 2560</b>', 'ATmega2560', '16 MHz', '5 V'],
  ['<b>ESP32 DevKit V1</b>', 'ESP32-WROOM-32, 2 cores, Wi-Fi + Bluetooth', '240 MHz', '3.3 V'],
  ['<b>NodeMCU ESP8266</b>', 'ESP-12E, Wi-Fi', '80 MHz', '3.3 V'],
  ['<b>STM32 Blue Pill</b>', 'STM32F103C8 (Arm Cortex-M3)', '72 MHz', '3.3 V'],
  ['<b>ATtiny85</b>', 'tiny 8-pin AVR', '8 MHz', '5 V'],
])}
<h3>The memory</h3>
${table(['Board', 'Flash', 'RAM', 'EEPROM', 'Wi-Fi'], [
  ['<b>Uno R3</b>', '31.5 KB', '2 KB', '1 KB', '—'],
  ['<b>Uno R4 Minima</b>', '256 KB', '32 KB', '8 KB', '—'],
  ['<b>Uno R4 WiFi</b>', '256 KB', '32 KB', '8 KB', 'yes'],
  ['<b>Leonardo</b>', '28 KB', '2.5 KB', '1 KB', '—'],
  ['<b>Nano</b>', '31.5 KB', '2 KB', '1 KB', '—'],
  ['<b>Mega 2560</b>', '248 KB', '8 KB', '4 KB', '—'],
  ['<b>ESP32 DevKit V1</b>', '1.25 MB', '320 KB', '512 B', 'yes'],
  ['<b>NodeMCU ESP8266</b>', '1 MB', '80 KB', '4 KB', 'yes'],
  ['<b>STM32 Blue Pill</b>', '64 KB', '20 KB', '1 KB', '—'],
  ['<b>ATtiny85</b>', '8 KB', '512 B', '512 B', '—'],
])}
<p><b>Flash</b> holds your sketch, <b>RAM</b> holds the variables while it runs, <b>EEPROM</b> keeps a few values when the power is off. The numbers come from the board data of the app — tap the board name in the editor to see them for your project.</p>
${E.memoryChart()}
<h3>The pins</h3>
${table(['Board', 'Analog in', 'PWM', 'Interrupt'], [
  ['<b>Uno R3</b>', '6 (A0 – A5)', '3 5 6 9 10 11', '2 · 3'],
  ['<b>Uno R4 Minima / WiFi</b>', '6 (A0 – A5)', '3 5 6 9 10 11', 'any pin'],
  ['<b>Leonardo</b>', '6 (A0 – A5)', '3 5 6 9 10 11 13', '0 1 2 3 7'],
  ['<b>Nano</b>', '8 (A0 – A7)', '3 5 6 9 10 11', '2 · 3'],
  ['<b>Mega 2560</b>', '16 (A0 – A15)', '2 – 13 and 44 – 46', '2 3 18 19 20 21'],
  ['<b>ESP32 DevKit V1</b>', '15 pins, 12-bit', 'any output pin', 'any pin'],
  ['<b>NodeMCU ESP8266</b>', '1 (A0)', 'any output pin', 'any pin'],
  ['<b>STM32 Blue Pill</b>', '10 (PA0 – PA7, PB0, PB1)', 'any output pin', 'any pin'],
  ['<b>ATtiny85</b>', '4 (A0 – A3)', 'PB0 · PB1 · PB4', 'PB2'],
])}
${table(['Board', 'I²C', 'SPI', 'Serial ports'], [
  ['<b>Uno R3</b>', 'A4 SDA · A5 SCL', '11 MOSI · 12 MISO · 13 SCK · 10 SS', 'Serial (USB, pins 0 / 1)'],
  ['<b>Uno R4 Minima / WiFi</b>', 'A4 SDA · A5 SCL', 'as the Uno', 'Serial, Serial1'],
  ['<b>Leonardo</b>', 'D2 SDA · D3 SCL', '11 · 12 · 13 · 10', 'Serial (USB), Serial1 (pins 0 / 1)'],
  ['<b>Nano</b>', 'A4 SDA · A5 SCL', '11 · 12 · 13 · 10', 'Serial'],
  ['<b>Mega 2560</b>', '20 SDA · 21 SCL', '51 MOSI · 50 MISO · 52 SCK · 53 SS', 'Serial, Serial1, Serial2, Serial3'],
  ['<b>ESP32 DevKit V1</b>', 'GPIO21 SDA · GPIO22 SCL', '23 MOSI · 19 MISO · 18 SCK · 5 SS', 'Serial, Serial2 (RX 16, TX 17)'],
  ['<b>NodeMCU ESP8266</b>', 'D2 SDA · D1 SCL', '13 MOSI · 12 MISO · 14 SCK · 15 SS', 'Serial, Serial1'],
  ['<b>STM32 Blue Pill</b>', 'PB7 SDA · PB6 SCL', '—', 'Serial, Serial1, Serial2'],
  ['<b>ATtiny85</b>', 'PB0 SDA · PB2 SCL', '—', 'none (no hardware Serial)'],
])}
<h3>5 V or 3.3 V?</h3>
<p>The most important difference after speed. A pin of a 5 V board gives and understands 5 V; a pin of a 3.3 V board gives 3.3 V and must <b>never</b> receive 5 V.</p>
${E.logicLevels()}
${tip('When you add a part, look at its supply. Most modules of the lab are good for 5 V (they burn above about 5.5 V — servos 6.5 V, MPU6050 and the sensor modules 6 V). On an ESP32 give them <b>3V3</b>, not 5V or VIN.')}
${openArd('blink', 'Open: Blink (any board)')}
${openArd('esp32-fade', 'Open: ESP32 Breathing LED')}`,
    },
    {
      id: 'ref-uno', title: 'The Uno pinout: which pin can do what',
      html: `
${E.unoPinout()}
${E.unoMatrix()}
${ul(
  '<b>D0 and D1</b> are also the USB serial line. Keep them free when you use <code>Serial</code>, or the Serial Monitor and your part fight over them. (They are the pins you wire to a second board in chapter A7.)',
  '<b>PWM</b> = <code>analogWrite()</code>. Only the pins with a <b>~</b> in front of the number: 3, 5, 6, 9, 10, 11. On any other pin the app warns you that <code>analogWrite()</code> works like <code>digitalWrite()</code>.',
  '<b>Interrupts</b> on D2 and D3: the chip stops for a moment and runs your function the moment the pin changes.',
  '<b>Analog in</b> is A0 – A5, 10 bit: 0 … 1023. They work as digital pins too (A0 is also pin 14).',
  '<b>I²C</b>: A4 is SDA and A5 is SCL (the same wires also come out at two pins near AREF).',
  '<b>SPI</b>: D11 MOSI, D12 MISO, D13 SCK, D10 SS. D13 also lights the <b>L</b> LED of the board: it blinks when you use <code>LED_BUILTIN</code> and may glow dimly when D13 is wired to a part.',
  'Each pin can give or take at most <b>40 mA</b>. The app warns above that. Drive a motor or a big lamp through a transistor, a MOSFET or a relay.')}
${table(['Power pin', 'What it is', 'Careful'], [
  ['<b>5V</b>', 'regulated 5 V output of the board', 'about 0.5 A in the simulator; never feed it from another supply'],
  ['<b>3.3V</b>', 'regulated 3.3 V output', 'about 0.15 A: enough for a sensor, not for a motor'],
  ['<b>VIN</b>', 'the raw supply input of the board', 'not a regulated 5 V: a part on VIN gets whatever the board is fed'],
  ['<b>GND</b> (three pins)', 'ground, 0 V', 'all GND pins are the same connection'],
  ['<b>AREF</b>', 'reference voltage of the analog inputs', 'normally left empty'],
  ['<b>RESET</b>', 'a LOW restarts the board', 'normally left empty'],
])}
<h3>Using an interrupt</h3>
${code(`volatile int pulses = 0;                 // changed inside the interrupt: volatile

void onPulse() {                         // keep it very short
  pulses++;
}

void setup() {
  Serial.begin(9600);
  pinMode(2, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(2), onPulse, FALLING);   // pin 2, when it falls
}

void loop() {
  Serial.println(pulses);
  delay(500);
}`, 'c', { mark: [1, 4, 10], numbers: true })}
<p>The three modes: <code>FALLING</code> (HIGH → LOW), <code>RISING</code> (LOW → HIGH) and <code>CHANGE</code> (both). The rotary encoder example reads its two pins this way.</p>
${openArd('fade-pot', 'Open: Dimmer with Potentiometer (analogRead + PWM)')}
${openArd('rotary-encoder', 'Open: Rotary Encoder')}`,
    },
    {
      id: 'ref-esp', title: 'ESP32, NodeMCU and the other boards',
      html: `
${E.esp32Pinout()}
${table(['Group', 'ESP32 DevKit V1 pins', 'Note'], [
  ['<b>Analog in</b>', 'GPIO 36 (VP), 39 (VN), 34, 35, 32, 33, 25, 26, 27, 14, 12, 13, 4, 2, 15', '12 bit: <code>analogRead()</code> gives 0 … 4095 for 0 … 3.3 V'],
  ['<b>Input only</b>', 'GPIO 34, 35, 36 (VP), 39 (VN)', 'They cannot give a voltage. The app warns: <i>GPIO34 is input-only on ESP32</i>'],
  ['<b>PWM</b>', 'any output pin', '<code>ledcAttach(pin, 5000, 8)</code> then <code>ledcWrite(pin, duty)</code>'],
  ['<b>I²C</b>', 'GPIO 21 SDA · GPIO 22 SCL', '<code>Wire.begin()</code> uses them'],
  ['<b>SPI</b>', 'GPIO 23 MOSI · 19 MISO · 18 SCK · 5 SS', ''],
  ['<b>Serial</b>', '<code>Serial</code> = USB (GPIO 1 TX, GPIO 3 RX); <code>Serial2</code> = RX GPIO 16, TX GPIO 17', 'the second port is for another board or a module'],
  ['<b>DAC</b>', 'GPIO 25 and 26', '<code>dacWrite(25, 128)</code> gives a real voltage, about 1.65 V'],
  ['<b>On-board LED</b>', 'GPIO 2', '<code>LED_BUILTIN</code> is 2'],
  ['<b>Power</b>', '3V3 (about 0.6 A), VIN (5 V in), GND × 2', 'the pins are 3.3 V: never connect 5 V to a GPIO'],
])}
<p>On the pictures of the lab the pins are named <code>D2</code>, <code>D21</code> … which means <b>GPIO2</b>, <b>GPIO21</b>. In the sketch you write the plain number.</p>
${code(`const int LED = 2;           // the on-board LED, GPIO2
const int POT = 34;          // an input-only pin is fine for analogRead

void setup() {
  Serial.begin(115200);
  ledcAttach(LED, 5000, 8);  // PWM on any pin: pin, frequency, resolution
}

void loop() {
  int raw = analogRead(POT);           // 0 … 4095
  ledcWrite(LED, raw / 16);            // scale to 0 … 255
  Serial.println(raw);
  delay(50);
}`, 'c', { mark: [6, 10, 11], numbers: true })}
<h3>NodeMCU ESP8266</h3>
${E.nodeMcuPinout()}
${ul(
  'The pins printed <b>D0 – D8</b> are <b>not</b> the GPIO numbers. In a sketch you may write <code>D1</code> (the lab knows the name) or the GPIO number (<code>5</code>). Do not mix them up: <code>pinMode(5, …)</code> is the pin printed D1.',
  '<b>A0</b> is the only analog input (10 bit: 0 … 1023).',
  'The on-board LED is on <b>D4 = GPIO2</b>.',
  'I²C: D2 = SDA (GPIO4), D1 = SCL (GPIO5).')}
<h3>Mega 2560: four serial ports</h3>
${E.megaPinout()}
<p>The Mega is the board for big projects: 54 digital pins, 16 analog inputs and four serial ports. <code>Serial1.begin(9600)</code> talks on pins 19 (RX1) and 18 (TX1) — the master of the Serial master – slave example.</p>
<h3>Blue Pill and ATtiny85</h3>
${ul(
  '<b>STM32 Blue Pill</b>: 3.3 V, 72 MHz, pins named <code>PA0 … PA15</code>, <code>PB0 … PB15</code>, <code>PC13 … PC15</code>. PC13 is the on-board LED.',
  '<b>ATtiny85</b>: eight legs, five usable pins <code>PB0 … PB4</code> (PB5 is also the reset pin). No hardware <code>Serial</code> — so <code>Serial.begin()</code> is not available. PWM on PB0, PB1 and PB4.')}`,
    },
    {
      id: 'ref-parts', title: 'The parts catalogue',
      html: `
<p>Tap <b>＋</b> to open the library. Parts are in ten groups; the names below are the names you see there. Tap a part in the library to place it. Then select it and tap <b>Edit</b> (or <b>Info</b>) for its settings, such as the colour of an LED or the value of a resistor. The Home page also has <b>Boards</b> and <b>Components</b> pages with pictures and pin names.</p>
<h3>Microcontrollers</h3>
<p>The ten boards of the first section. A project may have several (chapter A7).</p>
<h3>Basic &amp; Passive</h3>
${E.sheetBasic()}
${catalogue('basic')}
<h3>LEDs &amp; Output and Displays</h3>
${E.sheetOutput()}
${catalogue('output', 'display')}
<h3>Input &amp; Controls</h3>
${E.sheetInput()}
${catalogue('input')}
<h3>Sensors</h3>
<p>Their pictures, pin tables and wiring are in chapter A6. In short:</p>
${catalogue('sensors')}
<h3>Motors &amp; Actuators and ICs &amp; Drivers</h3>
${E.sheetMotors()}
${catalogue('motors', 'ics')}
<h3>Power &amp; Breadboards and Measurement</h3>
${E.sheetPower()}
${catalogue('power', 'meters')}
${note('The <b>Multimeter</b> and the <b>Ammeter</b> are for measuring: connect the multimeter in parallel (across a part) and the ammeter in series (in the wire). The <b>Voltage Divider</b> example is made for them.')}
${openArd('voltage-divider', 'Open: Voltage Divider (multimeter, no code)')}`,
    },
    {
      id: 'ref-gloss', title: 'Glossary',
      html: `
${table(['Term', 'Meaning'], [
  ['<b>Analog</b>', 'A value that can be anything between two limits, like a voltage that rises smoothly.'],
  ['<b>ADC</b>', 'Analog-to-digital converter: the part of the chip behind <code>analogRead()</code>.'],
  ['<b>Anode</b>', 'The + leg of an LED or diode. On an LED it is the long leg.'],
  ['<b>Baud</b>', 'Bits per second on a serial line. 9600 baud is about 960 characters a second.'],
  ['<b>Bit, byte</b>', 'A bit is 0 or 1. Eight bits make a byte, a number from 0 to 255.'],
  ['<b>Breadboard</b>', 'A board with holes that joins legs without solder. Holes in a column a – e (and f – j) are connected.'],
  ['<b>Broker</b>', 'The MQTT server in the middle that passes messages from publishers to subscribers.'],
  ['<b>Cathode</b>', 'The − leg of an LED or diode. On an LED it is the short leg.'],
  ['<b>Compile</b>', 'Turn the sketch into the program the chip runs. <b>Run</b> does it first and shows errors.'],
  ['<b>Current</b>', 'The flow of electricity, measured in amperes (A) or milliamperes (mA).'],
  ['<b>Debounce</b>', 'Ignoring the tiny bounces a button makes for a few milliseconds when it is pressed.'],
  ['<b>Digital</b>', 'Only two values: HIGH or LOW.'],
  ['<b>EEPROM</b>', 'Small memory that keeps its values when the power is off.'],
  ['<b>Flash</b>', 'The memory that holds the sketch. It stays when the power is off.'],
  ['<b>GND</b>', 'Ground, 0 V: the common return path of all the current.'],
  ['<b>GPIO</b>', 'General-purpose input/output: a pin your sketch can read or write. The ESP32 numbers its pins by GPIO.'],
  ['<b>HIGH / LOW</b>', 'The two levels of a digital pin: the supply voltage (5 V or 3.3 V) and 0 V.'],
  ['<b>I²C</b>', 'A bus with two wires (SDA, SCL). One master talks to many slaves; each slave has an address.'],
  ['<b>Interrupt</b>', 'A signal that makes the chip stop at once and run a short function.'],
  ['<b>IP address</b>', 'The number of a device on a network, such as 192.168.1.50.'],
  ['<b>JSON</b>', 'A text format for data, like <code>{"temp":24.5}</code>. <code>ArduinoJson</code> reads it.'],
  ['<b>Library</b>', 'Ready-made code for a part or a service, added with <code>#include</code>.'],
  ['<b>Logic level</b>', 'The voltage that means HIGH: 5 V on an Uno, 3.3 V on an ESP32.'],
  ['<b>Master / slave</b>', 'The board that starts a conversation and the board that answers.'],
  ['<b>millis()</b>', 'The milliseconds since the sketch started. Used to time things without <code>delay()</code>.'],
  ['<b>MQTT</b>', 'A messaging protocol for IoT: publish to a topic, subscribe to a topic.'],
  ['<b>Ohm (Ω)</b>', 'The unit of resistance. kΩ = 1000 Ω, MΩ = 1 000 000 Ω.'],
  ['<b>Pin</b>', 'A metal contact of a board or part where you connect a wire.'],
  ['<b>Pull-up / pull-down</b>', 'A resistor that holds an input at HIGH / LOW when nothing else drives it. <code>INPUT_PULLUP</code> switches on the pull-up inside the chip.'],
  ['<b>PWM</b>', 'Pulse-width modulation: a pin switches on and off very fast; the share of "on" time acts like a lower voltage.'],
  ['<b>RAM</b>', 'The working memory for variables. It is empty again when the power is off.'],
  ['<b>Resistor</b>', 'A part that limits current. Its colour bands tell its value.'],
  ['<b>RSSI</b>', 'The signal strength of a Wi-Fi network in dBm: −42 is strong, −80 is weak.'],
  ['<b>Serial</b>', 'Sending characters one after the other over a wire (UART). The Serial Monitor shows them.'],
  ['<b>Short circuit</b>', 'A direct path from + to GND. The current is huge; the simulation stops.'],
  ['<b>Sketch</b>', 'An Arduino program: a <code>setup()</code> and a <code>loop()</code>.'],
  ['<b>SPI</b>', 'A fast bus with four wires (MOSI, MISO, SCK, SS) between a master and its parts.'],
  ['<b>SSID</b>', 'The name of a Wi-Fi network, such as RaptiNet.'],
  ['<b>Topic</b>', 'The name an MQTT message is sent to, like <code>rapti/lab/dht</code>.'],
  ['<b>UART</b>', 'The hardware behind <code>Serial</code>: two wires, TX and RX.'],
  ['<b>VIN</b>', 'The pin where the board takes its supply; on some boards also the way to get 5 V out.'],
  ['<b>Voltage</b>', 'The electrical "push", measured in volts (V).'],
  ['<b>WL_CONNECTED</b>', 'Wi-Fi status 3: the board has joined the network and has an IP address.'],
])}
${tip('Use the search box of the manual (top of the Manual page) to jump to any word of this list.')}`,
    },
    {
      id: 'ref-trouble', title: 'Troubleshooting',
      html: `
${E.troubleFlow()}
<h3>The LED stays dark</h3>
${E.ledChecklist()}
${steps(
  '<b>Pin</b>: does the number in <code>pinMode()</code> / <code>digitalWrite()</code> match the pin where the wire starts? (The strip in the pictures shows the real name.)',
  '<b>Resistor</b>: the path must be pin → resistor → LED → GND. A missing resistor burns the LED; a missing wire keeps it dark.',
  '<b>Direction</b>: the long leg (anode) points towards the pin side. A reversed LED stays dark — Mirror it in the part bar to test.',
  '<b>Strips</b>: the two legs must be in <b>different columns</b>, and each leg shares its column (a – e) with exactly the wire you meant.',
  '<b>GND</b>: the − rail must be joined to a GND pin of the board.')}
<h3>Code problems</h3>
${table(['What you see', 'Usual cause', 'What to do'], [
  ['The Code tab opens with a red bar when you press Run', 'The sketch has an error: the line is underlined.', 'Read the message, fix the line, Run again. The usual ones are in chapter A3.'],
  ['<code>\'x\' was not declared in this scope</code>', 'A typing mistake, or a capital letter that differs.', 'Compare the name with where it was created.'],
  ['<code>expected \';\' at end of line</code>', 'A semicolon is missing at the end of the marked line.', 'Add it. Check the line above too.'],
  ['<code>fatal error: WiFi.h: No such file or directory</code>', 'The board has no Wi-Fi.', 'Use an ESP32, NodeMCU or Uno R4 WiFi (A7).'],
  ['The sketch stops: <i>Runtime error · line N</i>', 'A mistake that only shows while running, such as too deep a recursion.', 'The same text is in the Serial Monitor. Fix the line it names.'],
  ['Nothing in the Serial Monitor', '<code>Serial.begin()</code> is missing, the sketch never prints, or it is not running.', 'Add <code>Serial.begin(9600)</code>; print in <code>setup()</code>; Run (A6).'],
  ['The Serial send box does nothing', 'The simulation is stopped, or the line ending is wrong for the sketch.', 'Run first; use <b>Newline</b> with <code>readStringUntil(\'\\n\')</code>.'],
  ['A "0" appears after you send a number', '<code>parseInt()</code> found only the line ending and waited for digits.', 'Read a whole line with <code>readStringUntil()</code> and <code>toInt()</code> (A6).'],
  ['<code>analogWrite()</code> does not dim', 'The pin has no ~ (PWM).', 'Use 3, 5, 6, 9, 10 or 11 on the Uno.'],
  ['The sketch seems slow (speed under 70 %)', 'Many parts or very busy code; the status bar turns amber.', 'Print less, use fewer parts, avoid very short <code>delay()</code> loops.'],
  ['The LCD shows blocks, or nothing', 'Wrong I²C address, or contrast (V0) not set, or SDA / SCL swapped.', 'Address 0x27 in the sketch and in the part; V0 to GND (A6).'],
])}
<h3>Circuit problems</h3>
${table(['What you see', 'Usual cause', 'What to do'], [
  ['The LED is on all the time', 'Wired to 5V instead of a pin, or the sketch writes HIGH and never LOW.', 'Follow the wire from the LED back to the board.'],
  ['The LED glares, flashes and stays black: <code>💥 burned out</code>', 'No resistor (or too small): the LED got 60 mA or more.', 'Stop, add 220 Ω – 1 kΩ, Run again: you get a new LED.'],
  ['A button reads random values', 'The input floats: it is connected to nothing when the button is open.', '<code>INPUT_PULLUP</code> and the other leg to GND (A4).'],
  ['Pressed reads LOW', 'That is normal with <code>INPUT_PULLUP</code>.', 'Test with <code>== LOW</code>.'],
  ['A sensor shows the same number', 'It has no VCC / GND, or you did not change what it measures.', 'Wire VCC and GND; tap the sensor and move its slider.'],
  ['<code>analogRead()</code> jumps around', 'The pin is not connected (it floats).', 'Connect the sensor to the pin; join the grounds.'],
  ['A part burns: <code>💥 … burned out — …</code>', 'Too much voltage or current for that part, or the supply the wrong way round.', 'Check the supply of the part (A4, the catalogue); a module on 5 V, a 3.3 V board on 3V3.'],
  ['<b>Simulation stopped</b>: a short circuit', '5V (or a battery +) joined straight to GND.', 'Remove the wire between them; check the red and black wires.'],
  ['You cannot add, move or wire a part', 'The simulation is running.', 'Press <b>Stop</b>. Edit. Run again.'],
  ['A wire does not stay on its pin', 'You tapped empty space, which adds a <b>bend</b>, instead of the second pin.', 'Tap the pin where the wire must end. The bar says "Tap a pin to connect · tap empty space to bend".'],
  ['A part does not plug into the breadboard', 'Its legs are not exactly over holes.', 'Drag it so the legs are on holes (they snap); zoom in for a closer look.'],
  ['The part is plugged in but nothing connects', 'The legs are in the same column strip, or across the centre channel.', 'a – e of one column are joined, f – j of one column are joined, nothing crosses the channel (A2).'],
])}
${openArd('burn-demo', 'Open: Why Resistors Matter (see a burn-out)')}
${tip('When something goes wrong, <b>read</b> before you change: the red bar, the ⚠ pill and the Serial Monitor each name the pin or the line. Change <b>one thing</b> at a time and Run again.')}`,
    },
    {
      id: 'ref-gestures', title: 'Gestures, keys and shortcuts',
      html: `
${E.gestureSheet()}
${table(['Where', 'What you do', 'Result'], [
  ['Circuit', 'tap a part', 'selects it; the bar shows <b>Rotate · Mirror · Flip · Edit/Info · Copy · Delete</b>'],
  ['Circuit', 'tap a wire', 'selects it; the bar shows <b>Colour · Straight · Delete</b>'],
  ['Circuit', 'tap a pin, then another pin', 'draws a wire (tap empty space between them to add a bend)'],
  ['Circuit', 'press and hold a part or a wire', 'the menu: Rotate, Mirror, Flip, Properties, Duplicate, Delete connected wires, Delete'],
  ['Circuit', 'drag a part', 'moves it (only while stopped)'],
  ['Circuit', 'drag the background', 'moves the view'],
  ['Circuit', 'pinch · double-tap and slide · the ＋ − tools', 'zoom'],
  ['Circuit', 'the arrows tool (Fit)', 'shows the whole circuit'],
  ['Circuit', 'press and hold on empty space, then drag · or the Select tool', 'selection box: right = window, left = crossing'],
  ['Running', 'tap a sensor', 'opens its sliders'],
  ['Running', 'press a button, drag a knob or slider, flip a switch', 'works like the real part'],
  ['Code', 'the bar above the keyboard', '<code>{ } ( ) ; = &lt; &gt;</code> and more'],
  ['Code', 'A− / A+', 'text size; the magnifier searches'],
  ['Landscape', 'tap a tab', 'opens it beside the screen you have; tap again to close it'],
  ['Full screen', 'the round ☰ button', 'the menus; drag it to a place you like'],
  ['Everywhere', 'Back (the phone\'s button)', 'one step back: full screen → selection → Circuit tab → Home'],
])}
<h3>Keyboard</h3>
${E.keyCaps()}
${note('Everything has a touch way. The keys are only a convenience on a computer.')}`,
    },
    {
      id: 'ref-calc', title: 'Resistor colours and Ohm\'s law',
      html: `
${E.colorCode()}
${E.resistorDecode()}
${table(['Standard values (E12)', 'times 1, 10, 100 …'], [
  ['10 · 12 · 15 · 18 · 22 · 27', '… 220 Ω · 270 Ω · 1 kΩ · 1.5 kΩ · 2.2 kΩ · 10 kΩ · 100 kΩ'],
  ['33 · 39 · 47 · 56 · 68 · 82', '… 330 Ω · 470 Ω · 4.7 kΩ · 5.6 kΩ · 6.8 kΩ · 47 kΩ'],
])}
<p>Resistors only come in these steps. If your calculation gives 200 Ω, take the next standard value up: <b>220 Ω</b>. A bigger resistor makes an LED a little dimmer; a smaller one makes it brighter and hotter.</p>
<h3>Ohm's law</h3>
<p>Three quantities belong together: <b>voltage</b> V (volts), <b>current</b> I (amperes) and <b>resistance</b> R (ohms). Double the voltage across a resistor and double the current flows: <b>V = I × R</b>. Add <b>power</b> P (watts) and you get the wheel:</p>
${E.ohmWheel()}
${E.ohmWorked()}
${table(['Unit', 'Short', 'Same as'], [
  ['volt', 'V', '1000 mV'],
  ['ampere', 'A', '1000 mA'],
  ['ohm', 'Ω', '1000 Ω = 1 kΩ · 1000 kΩ = 1 MΩ'],
  ['watt', 'W', '1000 mW'],
])}
${tryIt('Open <b>Voltage Divider</b>. Two resistors (10 kΩ and 4.7 kΩ) on a 9 V battery. Use the formula <b>Vout = Vin × R2 ÷ (R1 + R2)</b> and calculate what the multimeter must show, then Run and check.')}
${openArd('voltage-divider', 'Open: Voltage Divider (multimeter)')}
${openArd('led-resistor', 'Open: LED + Resistor')}
${note(`<b>Remember</b><br>• Check the <b>logic level</b> of your board: 5 V (Uno, Mega, Nano) or 3.3 V (ESP32, NodeMCU, Blue Pill).<br>• Uno: PWM on 3 5 6 9 10 11 · interrupts on 2 and 3 · I²C on A4 / A5 · USB serial on 0 and 1. ESP32: pins are GPIO numbers, 34 – 39 can only read.<br>• Each pin gives at most 40 mA — use a resistor for an LED, a transistor or relay for a load.<br>• Resistor: two digits, a multiplier, a tolerance. R = (supply − LED drop) ÷ current.<br>• When something fails: red bar → ⚠ pill → Serial Monitor → pin numbers → VCC and GND.`)}`,
    },
  ],
};
void project; void warn;
