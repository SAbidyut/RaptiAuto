import * as A from './art-ard.js';
import * as E from './art-ard-ext.js';
import { note, tip, warn, tryIt, steps, ul, table, code as codeRaw, project, openArd } from '../helpers.js';

// A code listing with no extra newline between the numbered lines (the lines are blocks already).
const code = (...a) => codeRaw(...a).replace(/<\/span>\n<span class="ln/g, '</span><span class="ln');
/** A sensor table for a phone: part and pins, signal and what you can change, code. */
const sens = (rows) => table(['Part and pins', 'Signal · in the lab', 'Code'], rows.map(([p, pins, sig, lab, c]) => [`${p}<br><small>${pins}</small>`, `${sig}<br><small>In the lab: ${lab}</small>`, c]));
const hero = (figure, text) => `<div class="mx-ard-hero">${figure}<p class="mx-ard-promise">${text}</p></div>`;

export default {
  id: 'ard-serial', no: 'A6', title: 'Serial Monitor, sensors and displays', icon: 'terminal',
  blurb: 'The Serial tab and the Plotter, every sensor and display of the lab with pin tables, wiring pictures and short sketches, and examples that open with one tap.',
  sections: [
    {
      id: 'ser-tab', title: 'The Serial tab',
      html: `
${hero(E.serialHero(), 'The Serial tab is the window of your sketch: it shows everything the program prints and lets you type back. It is the best helper you have when something does not work.')}
${ul(
  '<b>1 · Monitor / Plotter</b> switch between text and a live graph (next section).',
  '<b>2 · Auto-scroll</b> keeps the newest line in view. Switch it off to read old lines.',
  '<b>3 · Timestamps</b> put the time of day (the phone\'s clock, with milliseconds) in front of every line.',
  '<b>4 · Clear</b> empties the screen. The app also clears it by itself every time you press <b>Run</b>.',
  '<b>5 · Send box</b>, <b>6 · line ending</b> and <b>7 · Send</b>: type text and the sketch can read it (see "Typing back").',
  '<b>8 · The text area</b> keeps the last 1500 lines.')}
${table(['Fact', 'In the app'], [
  ['Where is it?', 'The <b>Serial</b> tab (the third tab). A small dot appears on it when new text arrives while you look at another tab. In landscape you can open it beside the circuit.'],
  ['Does it need a baud rate?', 'The sketch chooses it with <code>Serial.begin(9600)</code>. There is no baud menu: the Monitor always listens at the speed the sketch uses. Use <b>9600</b> on Uno-type boards and <b>115200</b> on the ESP32 examples.'],
  ['Why is it empty?', 'Either the sketch has no <code>Serial.begin()</code> (the app says so in the ⚠ list), or it never prints, or you are not running.'],
  ['Sending while stopped', 'The send button needs a running simulation. Otherwise a message says <i>Run the simulation first</i>.'],
  ['Runtime errors', 'A mistake that stops the sketch while it runs is also written here as <code>[Runtime error at line N] …</code>.'],
])}
${E.serialFlow()}
<p>The picture shows the two directions. The sketch writes into a small <b>send buffer</b> (64 characters) that empties at the speed of the baud rate. If a sketch prints more than the line can carry, <code>Serial.print()</code> <b>waits</b> — a sketch that prints a lot at 9600 baud really runs slower, just like on the real board.</p>
${tip('Print less, print shorter. Pick a short text and one value per line while you test: <code>Serial.println(light);</code> is easier to read than a whole sentence on every loop.')}
${openArd('dht22-monitor', 'Open: Temperature &amp; Humidity (prints every 2 s)')}`,
    },
    {
      id: 'ser-code', title: 'Printing, plotting and typing back',
      html: `
${table(['In the sketch', 'The Monitor shows'], [
  ['<code>Serial.print(42)</code>', '42 (no new line)'],
  ['<code>Serial.println("Hi")</code>', 'Hi, then a new line'],
  ['<code>Serial.println()</code>', 'only a new line'],
  ['<code>Serial.print(3.14159, 2)</code>', '3.14 (two decimals)'],
  ['<code>Serial.print(255, HEX)</code>', 'FF'],
  ['<code>Serial.print(5, BIN)</code>', '101'],
  ['<code>Serial.print(\'A\')</code>', 'A (a single character)'],
  ['<code>Serial.write(65)</code>', 'the character with the code 65 — A'],
  ['<code>Serial.printf("%d  %.1f\\n", n, x)</code>', 'formatted text. <b>Only</b> on ESP32, ESP8266 and Uno R4 — not on Uno, Nano or Mega.'],
])}
<h3>The Plotter: numbers as a graph</h3>
${E.plotterShot()}
<p>Tap <b>Plotter</b> and every number the sketch prints is drawn as a line, one point per printed line. Give each value a <b>name and a colon</b> and it gets its own colour and a legend:</p>
${code(`const int LIGHT = A0;
const int KNOB  = A1;

void setup() {
  Serial.begin(9600);
}

void loop() {
  Serial.print("light:");              // a name, a colon …
  Serial.print(analogRead(LIGHT));     // … and the number
  Serial.print(" knob:");              // a space between the values
  Serial.println(analogRead(KNOB));    // println ends the line = one point
  delay(50);
}`, 'c', { mark: [9, 10, 11, 12], numbers: true })}
${ul(
  'Separate values with a space, a comma or a tab. Both <code>temp:24.5</code> and <code>temp=24.5</code> work.',
  'Without names the lines are called <i>value 1</i>, <i>value 2</i> …',
  'Up to <b>8 lines</b> are drawn, the last 600 points of each. The vertical scale adjusts itself.',
  'Text in the middle of a line (<i>"Temperature: 24 C"</i>) is not a number and is skipped — print only numbers for a clean graph.')}
${openArd('night-light', 'Open: Night Light (prints light: for the Plotter)')}
<h3>Typing back: the line ending</h3>
<p>What you type in the send box goes to the sketch as characters. The menu next to it adds an ending:</p>
${E.lineEndings()}
<p>Characters wait in a queue until the sketch reads them. <code>Serial.available()</code> says how many are waiting; <code>Serial.read()</code> takes the oldest.</p>
${E.rxQueue()}
${table(['Function', 'What it does'], [
  ['<code>Serial.available()</code>', 'How many characters are waiting (0 = none).'],
  ['<code>Serial.read()</code>', 'One character as a number, or <b>-1</b> when nothing is waiting.'],
  ['<code>Serial.parseInt()</code> / <code>parseFloat()</code>', 'Reads the next number. Waits up to <b>1 second</b> (<code>Serial.setTimeout(ms)</code> changes it).'],
  ['<code>Serial.readStringUntil(\'\\n\')</code>', 'Reads text up to the line ending — the safest way to read a command.'],
  ['<code>Serial.readString()</code>', 'Reads everything until the timeout.'],
  ['<code>Serial.peek()</code>', 'Looks at the next character without taking it.'],
])}
${code(`void setup() {
  Serial.begin(9600);
  Serial.println("Type a number and press Send");
}

void loop() {
  if (Serial.available()) {
    String line = Serial.readStringUntil('\\n');   // the whole line
    line.trim();                                  // drop a stray CR
    int n = line.toInt();
    Serial.print("You sent ");
    Serial.print(n);
    Serial.print(", twice that is ");
    Serial.println(n * 2);
  }
}`, 'c', { mark: [8, 9, 10], numbers: true })}
${warn('<code>Serial.parseInt()</code> leaves the line ending in the queue. The next call finds only a line ending, waits one second for digits and returns <b>0</b>. If you see a surprise "0", this is why: read a whole line with <code>readStringUntil()</code> instead.')}
<h3>What travels on the wire</h3>
${E.uartFrame()}
<p>You will meet the same ten-bit frame again in chapter A7, when two boards talk to each other over <code>Serial1</code>.</p>
${tryIt('Open <b>Serial Commands</b>. Run it, type <code>blink 5</code> and tap Send. Then set the menu to <b>No ending</b> and try again. What changes? (The sketch waits for the line ending, so nothing happens.)')}
${openArd('serial-commands', 'Open: Serial Commands (on, off, blink n)')}`,
    },
    {
      id: 'sens-how', title: 'How a sensor talks to the Arduino',
      html: `
${hero(E.sensorFamilies(), 'Every sensor does one job: it turns something in the world into electricity. How the Arduino listens depends on what kind of signal comes out.')}
<h3>Analog: a voltage</h3>
<p>A potentiometer, a light sensor or a temperature sensor gives a voltage that changes smoothly. Connect it to an <b>analog pin</b> (A0 … A5 on the Uno) and call <code>analogRead()</code>. You get a whole number that grows with the voltage:</p>
${E.adcScale()}
<h3>Digital: HIGH or LOW</h3>
<p>A PIR, a hall sensor or an obstacle sensor only answers yes or no. Connect it to any digital pin and call <code>digitalRead()</code>. A sensor that has no pull-up of its own needs <code>INPUT_PULLUP</code> or a resistor (chapter A4).</p>
<h3>Bus and library: a conversation</h3>
<p>The DHT22, the DS18B20 and the MPU6050 send little digital messages. You do not decode them yourself: <code>#include</code> the library and call a function such as <code>dht.readTemperature()</code>. The HC-SR04 answers with a pulse whose <i>length</i> you measure with <code>pulseIn()</code> — or let the <b>NewPing</b> library do it.</p>
<h3>Modules with four pins</h3>
<p>Many cheap modules (gas, soil, rain, flame, sound, light) carry <b>two outputs</b>:</p>
${E.moduleAoDo()}
${ul(
  '<b>VCC</b> and <b>GND</b> power the module. Below about 2.5 V it does not work at all.',
  '<b>AO</b> follows the sensor smoothly — read it with <code>analogRead()</code>.',
  '<b>DO</b> is HIGH or LOW depending on a limit — read it with <code>digitalRead()</code>. Some modules go LOW when something is detected (gas, soil, flame, hall); others go HIGH (sound, vibration). The table in the next section tells you which.')}
<h3>Playing with a sensor in the simulator</h3>
<p>A real sensor needs the real world. In the lab you <b>tap it while the sketch runs</b>:</p>
${E.tapSensor()}
${warn('On a <b>3.3 V board</b> (ESP32, NodeMCU) power the sensor from <b>3V3</b>, not 5V. A module on 5 V puts 5 V on its DO pin, and 5 V on a 3.3 V pin burns it out — the app tells you.')}
${openArd('ultrasonic', 'Open: Ultrasonic Distance Meter')}`,
    },
    {
      id: 'sens-all', title: 'Every sensor in the lab',
      html: `
<p>Open the <b>＋</b> menu and choose <b>Sensors</b> or <b>Input &amp; Controls</b>. These are all the parts that measure something, in three groups. The column <i>In the lab</i> says what you can change by tapping the part while the sketch runs.</p>
<h3>Analog sensors (use analogRead)</h3>
${E.sensorSheetA()}
${sens([
  ['<b>Potentiometer</b>, <b>Slide potentiometer</b>', 'GND · SIG · VCC', 'SIG = 0 V … supply', 'knob 0 – 100 %', '<code>analogRead(A0)</code> 0 – 1023'],
  ['<b>Photoresistor (LDR)</b>', '1 · 2', 'resistance: about 1 kΩ bright, 1 MΩ dark. Needs a <b>10 kΩ resistor</b> (divider)', 'light 0 – 2000 lux', '<code>analogRead(A0)</code> at the middle of the divider'],
  ['<b>Light module (LDR)</b>', 'VCC · GND · DO · AO', 'AO: <b>lower</b> voltage = brighter. DO LOW when bright', 'light 0 – 2000 lux', '<code>analogRead(A0)</code>'],
  ['<b>Sound KY-038</b>', 'VCC · GND · DO · AO', 'AO follows the loudness. DO HIGH when loud (clap)', 'sound 0 – 100 dB', '<code>analogRead(A0)</code>'],
  ['<b>Flame KY-026</b>', 'VCC · GND · DO · AO', 'AO <b>drops</b> near a flame. DO LOW on flame', 'flame 0 – 100 %', '<code>analogRead(A0)</code>'],
  ['<b>Gas MQ-2</b>', 'VCC · GND · DO · AO', 'AO <b>rises</b> with gas, smoke, LPG. DO LOW above the limit', 'gas 100 – 10 000 ppm', '<code>analogRead(A0)</code> (example alarm at 400)'],
  ['<b>Soil moisture</b>', 'VCC · GND · DO · AO', 'AO high = <b>dry</b>, low = wet. DO LOW when wet enough', 'moisture 0 – 100 %', '<code>analogRead(A0)</code>'],
  ['<b>Rain sensor</b>', 'VCC · GND · DO · AO', 'AO <b>drops</b> as it gets wet. DO LOW on rain', 'rain 0 – 100 %', '<code>analogRead(A0)</code>'],
  ['<b>Water level</b>', 'VCC · GND · AO', 'AO rises with the level', 'level 0 – 100 %', '<code>analogRead(A0)</code>'],
  ['<b>NTC thermistor module</b>', 'VCC · GND · AO', '10 kΩ NTC (B = 3950) with a 10 kΩ divider: hotter = <b>lower</b> voltage', '−20 – 100 °C', '<code>analogRead(A0)</code> + a formula'],
  ['<b>LM35</b>', 'VS · OUT · GND', '10 mV per °C', '−10 – 150 °C', '<code>analogRead(A0) * 500.0 / 1024.0</code> = °C (5 V board)'],
  ['<b>Joystick</b>', 'GND · 5V · VRx · VRy · SW', 'two potentiometers and a button', 'X and Y −100 … 100 %, tap = click', '<code>analogRead(A0)</code>, <code>analogRead(A1)</code>, <code>digitalRead(2)</code> with <code>INPUT_PULLUP</code>'],
])}
<h3>Digital sensors (use digitalRead) and bus sensors (use a library)</h3>
${E.sensorSheetD()}
${sens([
  ['<b>PIR HC-SR501</b>', 'VCC · OUT · GND', 'OUT HIGH while it sees motion (hold time 1, 3, 5 or 10 s)', 'button <i>Simulate motion</i>', '<code>digitalRead(pin)</code>'],
  ['<b>IR obstacle</b>', 'VCC · GND · DO', 'DO LOW when an object is closer than about 10 cm', 'distance 0 – 30 cm', '<code>digitalRead(pin)</code>'],
  ['<b>Line tracking TCRT5000</b>', 'VCC · GND · DO', 'DO HIGH over a black line, LOW over white', 'switch <i>Black line</i>', '<code>digitalRead(pin)</code>'],
  ['<b>Hall KY-003</b>', 'VCC · GND · DO', 'DO LOW when a magnet is near', 'switch <i>Magnet nearby</i>', '<code>digitalRead(pin)</code>'],
  ['<b>Vibration SW-420</b>', 'VCC · GND · DO', 'DO HIGH while shaking', 'button <i>Shake!</i>', '<code>digitalRead(pin)</code>'],
  ['<b>Touch TTP223</b>', 'SIG · VCC · GND', 'SIG HIGH while touched', 'press and hold the part', '<code>digitalRead(pin)</code>'],
  ['<b>Tilt switch SW-520D</b>', '1 · 2', 'a ball switch: closed when upright, open when tilted', 'tap to tilt', '<code>INPUT_PULLUP</code> to GND'],
  ['<b>Rotary encoder KY-040</b>', 'GND · + · SW · DT · CLK', 'two pulse trains (quadrature) and a button', 'drag to turn, tap to press', 'read CLK / DT, or an interrupt'],
  ['<b>IR receiver + remote</b>', 'OUT · GND · VCC', 'codes of a 21-key NEC remote', 'tap the receiver to open the remote', '<code>#include &lt;IRremote.h&gt;</code>'],
  ['<b>HC-SR04 ultrasonic</b>', 'VCC · TRIG · ECHO · GND', 'a 10 µs pulse on TRIG, then ECHO stays HIGH for the echo time; cm = µs / 58', 'distance 2 – 400 cm', '<code>pulseIn(ECHO, HIGH)</code> or <code>NewPing</code>'],
  ['<b>DHT22 / DHT11</b>', 'VCC · DATA · NC · GND', 'one data wire, a digital message', '−40 – 80 °C, 0 – 100 %', '<code>#include &lt;DHT.h&gt;</code> (wait 2 s between reads)'],
  ['<b>DS18B20</b>', 'GND · DQ · VDD', '1-Wire thermometer, needs a <b>4.7 kΩ pull-up</b> on DQ', '−55 – 125 °C', '<code>OneWire</code> + <code>DallasTemperature</code>'],
  ['<b>MPU6050</b>', 'VCC · GND · SCL · SDA (+ XDA XCL AD0 INT)', 'I²C, address 0x68: acceleration, rotation, temperature', 'accel ±2 g, gyro ±250 °/s', '<code>Adafruit_MPU6050</code>, <code>MPU6050</code> or <code>Wire</code>'],
  ['<b>RTC DS1307 / DS3231</b>', 'GND · VCC · SDA · SCL', 'I²C, address 0x68: a clock that starts at your phone\'s time', '—', '<code>#include &lt;RTClib.h&gt;</code>'],
])}
${note('The two I²C parts (MPU6050 and RTC) both answer at <b>0x68</b>. On a real bus they would clash — use one of them per project, or set the MPU\'s AD0 pin as the data sheet says.')}
${openArd('joystick', 'Open: Joystick Reader')}
${openArd('gas-alarm', 'Open: Gas Leak Alarm (MQ-2)')}`,
    },
    {
      id: 'sens-analog', title: 'Wiring analog sensors',
      html: `
<h3>LDR: a light sensor from two parts</h3>
${project({ level: 'Beginner', time: '10 min', parts: ['Uno R3', 'Breadboard', 'Photoresistor', '10 kΩ resistor', '3 wires'], learn: 'a voltage divider with a sensor, analogRead' })}
<p>The bare <b>Photoresistor</b> changes its <i>resistance</i>, and the Arduino can only measure <i>voltage</i>. A second resistor turns one into the other: this is the <b>voltage divider</b> of chapter A4.</p>
${E.wireLdr()}
${code(`const int LDR = A0;

void setup() {
  Serial.begin(9600);
}

void loop() {
  int light = analogRead(LDR);   // dark: small number, bright: big number
  Serial.print("light:");
  Serial.println(light);         // watch it in the Plotter
  delay(100);
}`, 'c', { numbers: true })}
<p>With the LDR on the 5 V side and the 10 kΩ resistor to GND, a <b>brighter</b> light gives a <b>higher</b> reading: about 930 at 1 kΩ and about 10 at 1 MΩ. Swap the two parts and it turns around.</p>
${tryIt('Run it, tap the LDR and slide the light from 0 to 2000 lux. Open the Plotter: the line follows your finger. Where would you put a limit for "it is dark"?')}
${openArd('night-light', 'Open: Night Light (LDR + LED)')}
<h3>LM35: a temperature sensor with three legs</h3>
${E.wireLm35()}
${code(`void setup() {
  Serial.begin(9600);
}

void loop() {
  int raw = analogRead(A0);
  float celsius = raw * 500.0 / 1024.0;     // 10 mV per °C on a 5 V board
  Serial.print(celsius, 1);
  Serial.println(" C");
  delay(500);
}`, 'c', { numbers: true })}
${openArd('lm35-thermometer', 'Open: LM35 Thermometer')}
<h3>NTC thermistor module</h3>
${E.wireNtc()}
<p>The module has a 10 kΩ NTC and a 10 kΩ resistor in a divider, so the reading follows the resistance of the NTC. A formula turns it into degrees:</p>
${code(`const float BETA = 3950.0;                       // the NTC's constant

void setup() {
  Serial.begin(9600);
}

void loop() {
  int raw = analogRead(A0);
  float r = 10000.0 * raw / (1023.0 - raw);      // resistance of the NTC
  float kelvin = 1.0 / (1.0 / 298.15 + log(r / 10000.0) / BETA);
  Serial.println(kelvin - 273.15);               // °C
  delay(500);
}`, 'c', { numbers: true })}
<p>The formula is the <i>beta equation</i>: at 25 °C (298.15 K) the NTC has exactly 10 kΩ. A hotter NTC has less resistance and gives a <b>lower</b> reading.</p>
<h3>Gas, soil, rain, flame, sound and light modules</h3>
${E.wireGas()}
${code(`const int GAS_AO = A0;       // how much
const int GAS_DO = 2;        // past the limit?

void setup() {
  Serial.begin(9600);
  pinMode(GAS_DO, INPUT);
}

void loop() {
  int level = analogRead(GAS_AO);
  bool alarm = digitalRead(GAS_DO) == LOW;     // the MQ-2 pulls DO LOW on gas
  Serial.print("gas:");
  Serial.print(level);
  Serial.println(alarm ? "  ALARM" : "");
  delay(300);
}`, 'c', { mark: [11], numbers: true })}
${tip('Soil moisture works the same way, but a <b>high</b> reading means <b>dry</b>. The plant-watering example waters above 600 and stops below 400 — two limits, so the pump does not flicker.')}
<h3>Joystick</h3>
${E.wireJoy()}
<p>Two potentiometers (X and Y) and one button. The knob at rest reads about 512 on both axes.</p>
${code(`void setup() {
  Serial.begin(9600);
  pinMode(2, INPUT_PULLUP);          // SW connects to GND when pressed
}

void loop() {
  Serial.print(analogRead(A0));      // X: 0 left … 1023 right
  Serial.print("  ");
  Serial.print(analogRead(A1));      // Y
  Serial.println(digitalRead(2) == LOW ? "  CLICK" : "");
  delay(150);
}`, 'c', { numbers: true })}
${openArd('plant-watering', 'Open: Automatic Plant Watering (soil sensor)')}`,
    },
    {
      id: 'sens-digital', title: 'Wiring digital and bus sensors',
      html: `
<h3>HC-SR04: distance with sound</h3>
${E.wireHc()}
${steps(
  'Make <b>TRIG</b> LOW for 2 µs, then HIGH for <b>10 µs</b>: the sensor sends a burst of sound.',
  'The sensor sets <b>ECHO</b> HIGH for as long as the echo takes to come back.',
  '<code>pulseIn(ECHO, HIGH)</code> measures that time in microseconds. Sound needs about 58 µs per centimetre of distance (there and back).')}
${code(`const int TRIG = 3;
const int ECHO = 2;

void setup() {
  Serial.begin(9600);
  pinMode(TRIG, OUTPUT);
  pinMode(ECHO, INPUT);
}

void loop() {
  digitalWrite(TRIG, LOW);  delayMicroseconds(2);
  digitalWrite(TRIG, HIGH); delayMicroseconds(10);
  digitalWrite(TRIG, LOW);

  long us = pulseIn(ECHO, HIGH, 30000);   // time of the echo, 30 ms at most
  float cm = us / 58.0;
  Serial.print(cm, 1);
  Serial.println(" cm");
  delay(250);
}`, 'c', { mark: [11, 12, 13, 15, 16], numbers: true })}
${tip('The <b>NewPing</b> library does all of this for you: <code>NewPing sonar(3, 2, 200);</code> and then <code>sonar.ping_cm()</code>.')}
${openArd('ultrasonic', 'Open: Ultrasonic Distance Meter')}
<h3>DHT22: temperature and humidity</h3>
${E.wireDht()}
${code(`#include <DHT.h>

DHT dht(2, DHT22);          // data pin 2; write DHT11 for the blue sensor

void setup() {
  Serial.begin(9600);
  dht.begin();
}

void loop() {
  delay(2000);                           // the DHT needs 2 s between readings
  float t = dht.readTemperature();       // °C
  float h = dht.readHumidity();          // %
  if (isnan(t) || isnan(h)) {            // not a number = the read failed
    Serial.println("Read failed");
    return;
  }
  Serial.print(t, 1);  Serial.print(" C   ");
  Serial.print(h, 0);  Serial.println(" %");
}`, 'c', { mark: [11, 12, 13, 14], numbers: true })}
${tryIt('Run it and tap the DHT22. Raise the temperature to 31 °C and watch the lines change two seconds later. Then pull the DATA wire out and run again: what does the Monitor say?')}
${openArd('dht22-monitor', 'Open: Temperature &amp; Humidity (DHT22)')}
<h3>PIR: has someone moved?</h3>
${E.wirePir()}
${code(`const int PIR = 6;
int last = LOW;

void setup() {
  Serial.begin(9600);
  pinMode(PIR, INPUT);
}

void loop() {
  int now = digitalRead(PIR);
  if (now != last) {                       // print only when it CHANGES
    Serial.println(now == HIGH ? "Motion!" : "All clear");
    last = now;
  }
}`, 'c', { mark: [10, 11], numbers: true })}
<p>The PIR keeps OUT HIGH for its <b>hold time</b> (1, 3, 5 or 10 s — edit the part to change it) after the last movement. Tap the PIR and press <i>Simulate motion</i>.</p>
${openArd('pir-alarm', 'Open: Motion Alarm (PIR)')}
<h3>DS18B20: a thermometer on one wire</h3>
${E.wireDs()}
${code(`#include <OneWire.h>
#include <DallasTemperature.h>

OneWire bus(2);                       // the DQ wire is on pin 2
DallasTemperature sensors(&bus);

void setup() {
  Serial.begin(9600);
  sensors.begin();
}

void loop() {
  sensors.requestTemperatures();      // start a measurement
  Serial.println(sensors.getTempCByIndex(0));
  delay(1000);
}`, 'c', { numbers: true })}
<p>Without the 4.7 kΩ pull-up the bus never goes HIGH and the sensor is not found: <code>getTempCByIndex</code> returns -127 (<code>DEVICE_DISCONNECTED_C</code>).</p>
${openArd('ds18b20-temp', 'Open: Waterproof Thermometer (DS18B20)')}
<h3>MPU6050: tilt and shake over I²C</h3>
${E.wireMpu()}
<p>I²C needs only two wires for any number of parts, because every part has an <b>address</b> (the MPU6050 is 0x68). The Uno has fixed pins for it: <b>SDA = A4</b> and <b>SCL = A5</b> (also marked SDA and SCL near AREF).</p>
${code(`#include <Adafruit_MPU6050.h>
#include <Wire.h>

Adafruit_MPU6050 mpu;

void setup() {
  Serial.begin(115200);
  if (!mpu.begin()) {
    Serial.println("MPU6050 not found - check SDA and SCL");
    while (1) delay(10);
  }
}

void loop() {
  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);
  Serial.print("ax:"); Serial.print(a.acceleration.x);
  Serial.print(" ay:"); Serial.print(a.acceleration.y);
  Serial.print(" az:"); Serial.println(a.acceleration.z);
  delay(100);
}`, 'c', { numbers: true })}
${openArd('mpu6050-tilt', 'Open: Tilt Sensor (MPU6050)')}`,
    },
    {
      id: 'disp-text', title: 'Text displays: the LCD and the OLED',
      html: `
${table(['Display', 'Pins', 'Library', 'Good for'], [
  ['<b>LCD 16×2 I²C</b>', 'GND · VCC · SDA · SCL', '<code>LiquidCrystal_I2C</code>', 'two lines of text with 4 wires. Address 0x27.'],
  ['<b>LCD 16×2 (parallel)</b>', '16 pins: VSS VDD V0 RS RW E D0 – D7 A K', '<code>LiquidCrystal</code>', 'the classic; needs 6 signal wires'],
  ['<b>OLED 0.96" SSD1306</b>', 'GND · VCC · SCL · SDA', '<code>Adafruit_SSD1306</code> + <code>Adafruit_GFX</code>', 'text and graphics, 128 × 64 pixels. Address 0x3C.'],
])}
<h3>LCD with I²C backpack</h3>
${E.wireLcdI2c()}
${code(`#include <Wire.h>
#include <LiquidCrystal_I2C.h>

LiquidCrystal_I2C lcd(0x27, 16, 2);    // address, columns, rows

void setup() {
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);                 // column 0, row 0
  lcd.print("Hello RaptiAuto!");
}

void loop() {
  lcd.setCursor(0, 1);                 // second row
  lcd.print("Uptime: ");
  lcd.print(millis() / 1000);
  lcd.print(" s   ");                  // spaces wipe a longer old text
  delay(200);
}`, 'c', { mark: [4, 9, 10, 14, 15], numbers: true })}
${E.lcdGrid()}
${ul(
  '<code>lcd.clear()</code> empties the screen. It also flickers if you call it in every <code>loop()</code>; overwrite with spaces instead.',
  '<code>lcd.print()</code> takes text and numbers, like <code>Serial.print()</code>. A line is only <b>16 characters</b> long — more is cut off.',
  'If the screen shows blocks or nothing, the address is wrong. The part\'s <i>Edit</i> sheet lets you set the address (0x27 or 0x3F) — the sketch must use the same.')}
${openArd('lcd-i2c-hello', 'Open: LCD 16×2 I²C — Hello World')}
<h3>LCD with parallel wiring</h3>
<p>The parallel LCD has no backpack: you wire every pin yourself. In <b>4-bit mode</b> the four lines D4 – D7 carry the data, so D0 – D3 stay empty.</p>
${E.wireLcdPar()}
${E.lcdPinMap()}
${code(`#include <LiquidCrystal.h>

LiquidCrystal lcd(2, 3, 4, 5, 6, 7);   // RS, E, D4, D5, D6, D7

void setup() {
  lcd.begin(16, 2);
  lcd.print("Parallel LCD");
}

void loop() {
  lcd.setCursor(0, 1);
  lcd.print(millis() / 1000);
  delay(250);
}`, 'c', { mark: [3], numbers: true })}
<p>The numbers in <code>LiquidCrystal lcd(...)</code> are Arduino pin numbers in the order RS, E, D4, D5, D6, D7. If your wires differ from the picture, change the numbers to match your wires.</p>
${openArd('lcd-parallel', 'Open: LCD 16×2 (parallel, 4-bit)')}
<h3>OLED with graphics</h3>
${E.wireOled()}
${E.oledGrid()}
${code(`#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

Adafruit_SSD1306 display(128, 64, &Wire, -1);

void setup() {
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  display.clearDisplay();
  display.setTextSize(2);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(10, 20);
  display.println("RaptiAuto");
  display.drawRect(0, 0, 128, 64, SSD1306_WHITE);
  display.display();                  // nothing shows until this line
}

void loop() { }`, 'c', { mark: [14], numbers: true })}
${openArd('oled-graphics', 'Open: OLED Graphics (SSD1306)')}`,
    },
    {
      id: 'disp-other', title: 'Digits, matrices and pixels',
      html: `
${table(['Display', 'Pins', 'Library', 'Good for'], [
  ['<b>TM1637</b> 4 digits', 'CLK · DIO · VCC · GND', '<code>TM1637Display</code>', 'clocks and counters, 2 signal wires'],
  ['<b>MAX7219</b> 8×8 matrix', 'VCC · GND · DIN · CS · CLK', '<code>LedControl</code>', 'icons and scrolling text; "Modules" 1 – 4 chains them'],
  ['<b>7-segment</b> digit', 'A B C D E F G DP · 2 × COM', 'no library: <code>digitalWrite</code>', 'learning how a digit is built'],
  ['<b>NeoPixel</b> (WS2812B)', 'GND · VCC · DIN · DOUT', '<code>Adafruit_NeoPixel</code>', 'full-colour LEDs on one wire'],
  ['<b>LED bar</b> (10)', 'A1 – A10 · C1 – C10', 'no library', '10 LEDs in one part (a level meter)'],
  ['<b>Uno R4 WiFi matrix</b>', 'on the board, no wires', '<code>Arduino_LED_Matrix</code>', 'a 12 × 8 red matrix built into the R4 WiFi'],
])}
<h3>TM1637: four digits, two wires</h3>
${E.wireTm()}
${E.tmDigits()}
${code(`#include <TM1637Display.h>

TM1637Display display(3, 2);           // CLK = D3, DIO = D2

void setup() {
  display.setBrightness(5);            // 0 … 7
}

void loop() {
  unsigned long s = millis() / 1000;
  int mmss = (s / 60) * 100 + s % 60;  // 75 s → 115 → shows 01:15
  display.showNumberDecEx(mmss, 0b01000000, true);
  delay(200);
}`, 'c', { mark: [3, 11, 12], numbers: true })}
${openArd('tm1637-counter', 'Open: 4-Digit Clock (TM1637)')}
<h3>MAX7219: 64 LEDs on three wires</h3>
${E.wireMax()}
${E.matrixBits()}
${code(`#include <LedControl.h>

LedControl lc(12, 10, 11, 1);          // DIN, CLK, CS, number of modules

byte heart[8] = { 0x00, 0x66, 0xFF, 0xFF, 0xFF, 0x7E, 0x3C, 0x18 };

void setup() {
  lc.shutdown(0, false);               // wake the chip up
  lc.setIntensity(0, 8);               // brightness 0 … 15
  lc.clearDisplay(0);
  for (int row = 0; row < 8; row++) lc.setRow(0, row, heart[row]);
}

void loop() { }`, 'c', { mark: [3, 5, 8], numbers: true })}
<p>Careful with the order: <b>LedControl(DIN, CLK, CS)</b> lists CLK before CS, while the module is usually read DIN, CS, CLK. The picture and the example agree: DIN D12, CLK D10, CS D11.</p>
${openArd('max7219-matrix', 'Open: 8×8 LED Matrix (MAX7219)')}
<h3>7-segment digit</h3>
${E.sevenSegPart()}
${E.sevenSegMap()}
${code(`const int SEG[7] = {2, 3, 4, 5, 6, 7, 8};        // a b c d e f g
const byte DIGITS[10] = {                          // bit 0 = a … bit 6 = g
  0b0111111, 0b0000110, 0b1011011, 0b1001111, 0b1100110,
  0b1101101, 0b1111101, 0b0000111, 0b1111111, 0b1101111
};

void show(int n) {
  for (int i = 0; i < 7; i++) {
    digitalWrite(SEG[i], (DIGITS[n] >> i) & 1);    // pick bit i of the pattern
  }
}

void setup() {
  for (int i = 0; i < 7; i++) pinMode(SEG[i], OUTPUT);
}

void loop() {
  for (int n = 0; n < 10; n++) { show(n); delay(600); }
}`, 'c', { mark: [9], numbers: true })}
${tip('<code>(DIGITS[n] &gt;&gt; i) &amp; 1</code> slides the pattern i places to the right and keeps only the last bit: 1 lights the segment, 0 switches it off. On a <b>common-anode</b> digit (edit the part: <i>Type → Common anode</i>) the COM pin goes to 5V and the logic turns around: LOW lights a segment.')}
<h3>NeoPixel: one wire, many colours</h3>
${E.wireNeo()}
${code(`#include <Adafruit_NeoPixel.h>

Adafruit_NeoPixel ring(16, 6, NEO_GRB + NEO_KHZ800);   // 16 LEDs on pin 6

void setup() {
  ring.begin();
  ring.setBrightness(60);                 // 0 … 255; keep it low
}

void loop() {
  for (int i = 0; i < 16; i++) {
    ring.clear();
    ring.setPixelColor(i, ring.Color(0, 150, 255));    // red, green, blue
    ring.show();                          // nothing changes until show()
    delay(60);
  }
}`, 'c', { mark: [10, 11, 12, 13], numbers: true })}
${openArd('neopixel-ring', 'Open: NeoPixel Rainbow Ring')}
<h3>Mini project: a weather station</h3>
${project({ level: 'Intermediate', time: '15 min', parts: ['Uno R3', 'DHT22', 'LCD 16×2 I²C'], learn: 'a sensor and a display together; if / else on a reading' })}
${A.exampleView('weather-station', { w: 360, cap: 'The finished example: the DHT22 on D2 and the I²C LCD on A4 / A5. Tap the DHT22 while it runs to change the weather.' })}
<p>The sketch reads the DHT22 every two seconds, prints the numbers on the LCD and a comfort message on the second line. It combines two parts of this chapter — nothing new, only a bigger picture.</p>
${openArd('weather-station', 'Open: Mini Weather Station')}
${tryIt('Make the message on the second row say "Hot! Drink water" from 28 °C instead of 30 °C. Which line of the sketch do you change?')}
${note(`<b>Remember</b><br>• The Serial tab shows what the sketch prints; <b>Plotter</b> draws numbers. Name them: <code>temp:24.5</code>. Use <b>Newline</b> and <code>readStringUntil('\\n')</code> to read commands.<br>• <b>Analog</b> sensors: <code>analogRead</code> (0 – 1023 on a Uno). <b>Digital</b>: <code>digitalRead</code>. <b>Bus</b>: a library.<br>• Modules have AO (how much) and DO (past the limit); VCC and GND must be wired.<br>• LDR and NTC need a divider; DS18B20 needs 4.7 kΩ; I²C parts use SDA / SCL (A4 / A5 on the Uno).<br>• Displays: <code>setCursor(col, row)</code> on the LCD, <code>display.display()</code> on the OLED, <code>show()</code> on NeoPixels.`)}
${openArd('rtc-clock', 'Open: Digital Clock (RTC DS3231)')}`,
    },
  ],
};
void A;
