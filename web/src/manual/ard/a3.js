import * as A from './art-ard.js';
import { note, tip, warn, tryIt, steps, ul, table, code, openArd } from '../helpers.js';

const hero = (figure, text) => `<div class="mx-ard-hero">${figure}<p class="mx-ard-promise">${text}</p></div>`;

export default {
  id: 'ard-code', no: 'A3', title: 'Arduino programming basics', icon: 'code',
  blurb: 'A sketch is setup() and loop(); pins, analog and PWM, time with millis(), variables, loops, functions, Serial, libraries and error messages.',
  sections: [
    {
      id: 'sketch', title: 'A sketch is two functions',
      html: `
${hero(A.heroCode(), 'A program for the Arduino is called a <b>sketch</b>. It has only two parts you must know. After this chapter you can read — and change — any example in the app.')}
${A.sketchAnatomy()}
${code(`// Blink with a name
const int LED = 13;      // pin 13 (the L LED on the board)

void setup() {
  pinMode(LED, OUTPUT);  // make the pin an output
}

void loop() {
  digitalWrite(LED, HIGH);  // 5 V: LED on
  delay(500);               // wait half a second
  digitalWrite(LED, LOW);   // 0 V: LED off
  delay(500);
}`, 'c', { mark: [2, 5, 9, 11], numbers: true })}
${ul(
  '<b>setup()</b> runs <b>once</b>, when you press Run. Use it to prepare the pins and start things (<code>pinMode</code>, <code>Serial.begin</code>).',
  '<b>loop()</b> runs <b>again and again</b>, as fast as it can, until you press Stop. This is where your program lives.',
  '<code>const int LED = 13;</code> gives a pin a <b>name</b>. Now <code>LED</code> is easier to read than a lonely 13, and you change the pin in one place.',
  'Every instruction ends with a <b>semicolon</b> <code>;</code>. Blocks sit between <b>curly braces</b> <code>{ }</code>. <code>//</code> starts a <b>comment</b> that the Arduino ignores.',
  'Capital letters matter: <code>HIGH</code> is a word the Arduino knows, <code>high</code> is not.')}
${A.programFlow()}
${note('Do not worry about the C++ words yet. Copy the pattern of a working example, change one number, and watch what changes. That is how everyone learns this.')}
${openArd('led-resistor', 'Open: LED + Resistor (a Blink with a name)')}`,
    },
    {
      id: 'pins', title: 'Talking to the pins',
      html: `
${table(['Function', 'What it does'], [
  ['<code>pinMode(pin, OUTPUT)</code>', 'The pin will <b>give</b> a voltage (an LED, a buzzer).'],
  ['<code>pinMode(pin, INPUT)</code>', 'The pin will <b>listen</b> to a voltage from a sensor.'],
  ['<code>pinMode(pin, INPUT_PULLUP)</code>', 'Listen, and hold the pin at HIGH with a small resistor inside the chip. A button to GND then reads <b>LOW when pressed</b> (chapter A4).'],
  ['<code>digitalWrite(pin, HIGH)</code> / <code>LOW</code>', 'Give 5 V (3.3 V on an ESP32) or 0 V.'],
  ['<code>digitalRead(pin)</code>', 'Is the voltage HIGH or LOW? Returns <code>HIGH</code> (1) or <code>LOW</code> (0).'],
])}
${A.pinLevels()}
<p>Pins are numbered on the board. On the Uno the digital pins are <b>0 … 13</b>; the analog pins <b>A0 … A5</b> can also be used as digital pins. The ESP32 uses the numbers of its <b>GPIO</b> pins (<code>GPIO4</code> is simply <code>4</code>).</p>
${code(`const int BUTTON = 2;
const int LED = 13;

void setup() {
  pinMode(BUTTON, INPUT_PULLUP);  // idle = HIGH
  pinMode(LED, OUTPUT);
}

void loop() {
  if (digitalRead(BUTTON) == LOW) {  // pressed?
    digitalWrite(LED, HIGH);
  } else {
    digitalWrite(LED, LOW);
  }
}`, 'c', { mark: [5, 10], numbers: true })}
${A.controlFlow()}
${ul(
  '<b><code>if (condition) { … } else { … }</code></b> chooses. <code>==</code> asks "is it equal?" — one <code>=</code> would <i>set</i> a value. Combine conditions with <code>&amp;&amp;</code> (and), <code>||</code> (or) and <code>!</code> (not).',
  'A pin that is an <b>input and connected to nothing</b> floats and reads random values. The app warns you: <i>Pin D2 is floating … Use INPUT_PULLUP or a pull-down resistor.</i>')}
${warn('Pins 0 and 1 of the Uno are also used by the USB serial line. Keep them free when you use <code>Serial</code>.')}
${openArd('button-led', 'Open: Button controls LED')}`,
    },
    {
      id: 'analog', title: 'Analog values and PWM',
      html: `
${A.waveforms()}
${table(['Function', 'Range', 'Notes'], [
  ['<code>analogRead(A0)</code>', '0 … 1023 (Uno), 0 … 4095 (ESP32)', 'Measures a voltage. On a 5 V Uno one step is about 4.9 mV. Only the analog pins (A0 … A5) can do it.'],
  ['<code>analogWrite(pin, 0…255)</code>', '0 = off, 255 = full on', 'PWM. Only pins marked <b>~</b>: Uno 3, 5, 6, 9, 10, 11. Other pins act like digitalWrite and the app warns you.'],
  ['<code>map(x, a, b, c, d)</code>', '—', 'Rescales a number: x from [a, b] to [c, d].'],
  ['<code>constrain(x, a, b)</code>', '—', 'Keeps x between a and b.'],
])}
${code(`const int POT = A0;
const int LED = 9;      // a PWM pin (~)

void setup() {
  pinMode(LED, OUTPUT);
}

void loop() {
  int raw = analogRead(POT);                  // 0 … 1023
  int brightness = map(raw, 0, 1023, 0, 255); // 0 … 255
  analogWrite(LED, brightness);
}`, 'c', { mark: [9, 10, 11], numbers: true })}
${table(['Knob position', 'analogRead', 'Voltage', 'brightness', 'LED is on'], [
  ['all the way left', '0', '0 V', '0', '0 % of the time'],
  ['middle', '512', '2.5 V', '127', 'about half of the time'],
  ['all the way right', '1023', '5 V', '255', 'always'],
])}
${tip('<b>PWM is not a real analog voltage.</b> The pin switches between 0 V and 5 V about 500 times a second. An LED or a motor is too slow to follow, so it reacts to the average — that is why it dims.')}
${openArd('fade-pot', 'Open: Dimmer with Potentiometer')}`,
    },
    {
      id: 'time', title: 'Time: delay() and millis()',
      html: `
${A.millisTimeline()}
${table(['Function', 'What it does'], [
  ['<code>delay(ms)</code>', 'Stop and wait for <b>ms</b> milliseconds (1000 = one second).'],
  ['<code>delayMicroseconds(us)</code>', 'The same in microseconds (millionths of a second).'],
  ['<code>millis()</code>', 'Milliseconds since the sketch started. It keeps counting while you do other things.'],
  ['<code>micros()</code>', 'The same in microseconds.'],
])}
<p><code>delay()</code> is easy but it makes the Arduino <b>deaf</b>: while it waits, no button is read. For a sketch that must do two things at once, ask the clock instead of sleeping:</p>
${code(`const int LED = 13;
unsigned long last = 0;     // when did we last toggle?
bool ledOn = false;

void setup() {
  pinMode(LED, OUTPUT);
}

void loop() {
  if (millis() - last >= 1000) {  // has a second passed?
    last = millis();              // remember this moment
    ledOn = !ledOn;               // flip the state
    digitalWrite(LED, ledOn);
  }
  // …anything else here runs thousands of times a second
}`, 'c', { mark: [10, 11, 12], numbers: true })}
${note('In the simulator <code>millis()</code> counts <b>simulated time</b>, starting at 0 each time you press Run. It is the same time you see in the green status bar.')}
${tryIt('Add a second LED on pin 12 and make it blink twice as fast with its own <code>last2</code> variable — all in the same <code>loop()</code>, with no <code>delay()</code>.')}`,
    },
    {
      id: 'lang', title: 'Variables, decisions, loops and functions',
      html: `
${A.intRange()}
${table(['Type', 'Holds', 'Example'], [
  ['<code>int</code>', 'whole numbers', '<code>int count = 0;</code>'],
  ['<code>long</code> / <code>unsigned long</code>', 'big whole numbers (time!)', '<code>unsigned long t = millis();</code>'],
  ['<code>float</code>', 'numbers with a decimal point (about 7 digits)', '<code>float volts = 2.5;</code>'],
  ['<code>bool</code>', '<code>true</code> or <code>false</code>', '<code>bool pressed = false;</code>'],
  ['<code>byte</code> / <code>char</code>', 'one small number / one letter', '<code>char c = \'A\';</code>'],
  ['<code>String</code>', 'text', '<code>String name = "Rapti";</code>'],
  ['arrays', 'a row of values', '<code>int pins[] = {2, 3, 4};</code>'],
])}
<p>A variable declared <b>outside</b> every function (at the top) is <b>global</b>: every function sees it and it keeps its value between loops. A variable declared <b>inside</b> a function is <b>local</b>: it starts again every time. Add <code>const</code> to a value that never changes.</p>
${code(`int leds[] = {2, 3, 4, 5, 6, 7};   // an array: six pins in a row
const int COUNT = 6;

void setup() {
  for (int i = 0; i < COUNT; i++) {  // i = 0, 1, 2 … 5
    pinMode(leds[i], OUTPUT);
  }
}

void flash(int pin, int ms) {        // our own function
  digitalWrite(pin, HIGH);
  delay(ms);
  digitalWrite(pin, LOW);
}

void loop() {
  for (int i = 0; i < COUNT; i++) {
    flash(leds[i], 80);              // call it with a pin and a time
  }
}`, 'c', { mark: [1, 5, 10, 18], numbers: true })}
${ul(
  '<b>for</b> repeats a block a known number of times: start, condition, step. <b>while (condition) { … }</b> repeats as long as the condition is true. <b>switch / case</b> chooses between many values.',
  'A <b>function</b> is a named block you can call. <code>void</code> means it gives nothing back; <code>int add(int a, int b) { return a + b; }</code> gives a number back.',
  'Arrays count from <b>0</b>: <code>leds[0]</code> is the first.',
  'The simulator understands arrays, structs, classes, pointers, references, <code>String</code>, <code>#define</code> and lambdas without captured variables. <b>Templates</b> are not supported.')}
${openArd('knight-rider', 'Open: LED Chaser (arrays and for loops)')}`,
    },
    {
      id: 'serial', title: 'Serial in one minute',
      html: `
<p>The <b>Serial Monitor</b> is the Arduino\'s way of talking to you. Print what the sketch is thinking and read it in the <b>Serial</b> tab.</p>
${code(`void setup() {
  Serial.begin(9600);          // open the line, 9600 bits per second
  Serial.println("Hello!");    // text, then a new line
}

void loop() {
  int raw = analogRead(A0);
  Serial.print("raw = ");      // text, no new line
  Serial.println(raw);         // a number, then a new line
  delay(500);
}`, 'c', { numbers: true })}
${table(['Function', 'What it does'], [
  ['<code>Serial.begin(9600)</code>', 'Starts the serial line (once, in <code>setup()</code>).'],
  ['<code>Serial.print(x)</code> / <code>println(x)</code>', 'Prints text or a number; <code>println</code> adds a new line.'],
  ['<code>Serial.available()</code>', 'How many characters you sent from the Monitor and the sketch has not read yet.'],
  ['<code>Serial.read()</code>, <code>readStringUntil(\'\\n\')</code>, <code>parseInt()</code>', 'Read what you typed in the Monitor.'],
])}
<p>More about the Monitor, the Plotter and sensors in chapter <b>A6</b>.</p>`,
    },
    {
      id: 'libs', title: 'Libraries',
      html: `
<p>A <b>library</b> is a ready-made set of functions for a part. Instead of sending 100 pulses to a display, you write <code>lcd.print("Hi")</code>. You add one with <code>#include</code> at the top of the sketch.</p>
${A.libMap()}
${table(['Part', 'Library', 'Example'], [
  ['Servo motor', '<code>#include &lt;Servo.h&gt;</code>', '<code>Servo s; s.attach(9); s.write(90);</code>'],
  ['LCD with I²C backpack', '<code>#include &lt;LiquidCrystal_I2C.h&gt;</code>', '<code>lcd.init(); lcd.print("Hi");</code>'],
  ['DHT22 temperature', '<code>#include &lt;DHT.h&gt;</code>', '<code>dht.readTemperature()</code>'],
  ['NeoPixel ring', '<code>#include &lt;Adafruit_NeoPixel.h&gt;</code>', '<code>strip.setPixelColor(0, strip.Color(255,0,0))</code>'],
])}
${warn('Libraries for Wi-Fi exist only on boards that have Wi-Fi. An <code>#include &lt;WiFi.h&gt;</code> on an Uno stops with <i>fatal error: WiFi.h: No such file or directory</i> and the hint to use an ESP32, a NodeMCU or an Uno R4 WiFi — just like the real IDE.')}`,
    },
    {
      id: 'errors', title: 'When something goes wrong',
      html: `
${A.errorShot()}
<p>Press <b>Run</b> and the app <b>compiles</b> your sketch first. If it finds a mistake it does not start: the <b>Code</b> tab opens, the line is underlined and a red bar says what is wrong. Fix it, press Run again.</p>
${table(['Message', 'Usually means'], [
  ['<code>expected \';\' at end of line</code>', 'A semicolon is missing at the end of the line it names.'],
  ['<code>\'ledd\' was not declared in this scope</code>', 'A typing mistake: the name does not exist (or capital letters differ).'],
  ['<code>expected \'}\' at end of input</code>', 'A curly brace was opened and never closed.'],
  ['<code>undefined reference to \'loop\' …</code>', 'The sketch has no <code>void loop()</code> (or no <code>setup()</code>).'],
  ['<code>too few arguments to function \'flash\'</code>', 'A call has fewer values than the function needs.'],
  ['<code>redeclaration of \'x\'</code>', 'Two variables with the same name in the same place.'],
  ['<code>fatal error: WiFi.h: No such file or directory</code>', 'The board has no Wi-Fi (see Libraries).'],
])}
<p>A mistake that only shows <b>while running</b> stops the simulation. The Code tab opens with <i>Runtime error · line N</i> and the message is also printed in the Serial Monitor (for example <i>Stack overflow (too deep recursion)</i>). Electrical problems — a short circuit — open a <b>Simulation stopped</b> box instead.</p>
<h3>How fast does it run?</h3>
<p>The simulator runs your sketch against a clock: a <code>delay(1000)</code> takes one second of simulated time, which is one second of your time too. The status bar shows the <b>speed</b>. If the phone cannot keep up (a very busy sketch, many parts), the number drops below 100 % and turns amber: the sketch still sees its own correct clock, but simulated time runs behind the real one.</p>
${note(`<b>Remember</b><br>• <code>setup()</code> once, <code>loop()</code> for ever.<br>• <code>pinMode</code> first; then <code>digitalWrite</code>, <code>digitalRead</code>, <code>analogRead</code>, <code>analogWrite</code>.<br>• <code>delay()</code> is deaf; <code>millis()</code> lets the loop keep looking.<br>• <code>int</code> is 16 bits on the Uno. Libraries are added with <code>#include</code>.<br>• Read the red bar, the ⚠ pill and the Serial Monitor.`)}
${tryIt('Remove one semicolon in the Blink sketch and press Run. Which line does the app mark? Now rename <code>LED</code> to <code>LEDD</code> in one place only. What does the message say?')}`,
    },
  ],
};
