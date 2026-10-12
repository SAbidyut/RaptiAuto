import * as A from './art-ard.js';
import { note, tip, warn, tryIt, steps, ul, table, code, project, openArd } from '../helpers.js';

const hero = (figure, text) => `<div class="mx-ard-hero">${figure}<p class="mx-ard-promise">${text}</p></div>`;
const tn = (col) => 'B/' + A.railId('tn', col);

/** One LED with its resistor: resistor from column X to X+4 (row e), LED in columns X+4 / X+5 (row c), signal wire to column X, cathode to the − rail. */
const ledPair = (id, X, color, pin, wire, lit = false) => ({
  parts: [
    { id: id + 'r', type: 'resistor', props: { value: 220 }, pin: '1', hole: `e${X}` },
    { id: id + 'd', type: 'led', props: { color }, pin: 'A', hole: `c${X + 4}`, mod: lit ? A.ledMod(color) : undefined },
  ],
  wires: [
    { a: `R/${pin}`, b: `B/a${X}`, color: wire },
    { a: `B/d${X + 5}`, b: tn(X + 6), color: 'black', pts: ({ from }) => [[from[0] + 10, from[1]]] },
  ],
});

// ---------------------------------------------------------------- project 2: LED + resistor
const ledBase = (lit) => {
  const p = ledPair('a', 10, 'red', 'D13', 'green', lit);
  return { cols: [3, 25], board: { pins: ['D13', 'GND'] }, gapDown: 28, parts: p.parts, wires: [...p.wires, { a: 'R/GND', b: tn(19), color: 'black' }] };
};
const ledFigs = () => {
  const b = ledBase(false);
  return [
    A.bench({ ...b, show: [], showWires: [], bands: [], cap: 'Step 1 · The Uno (the teal strip shows the pins we use) and the breadboard. Nothing is plugged in yet.' }),
    A.bench({ ...b, show: ['ar'], showWires: [], hi: ['ar'], bands: [10, 14], cap: 'Step 2 · The resistor: one leg in column 10, the other in column 14 (row e). A resistor has no direction.' }),
    A.bench({ ...b, show: ['ar', 'ad'], showWires: [], hi: ['ad'], bands: [14, 15], cap: 'Step 3 · The LED: the long leg (anode, +) in column 14 — the same column as the resistor — and the short leg (cathode, −) in column 15.' }),
    A.bench({ ...ledBase(true), cap: 'Step 4 · Three wires: D13 → column 10 (green), the LED cathode → the − rail and GND → the − rail (black). Run it!' }),
  ];
};

// ---------------------------------------------------------------- project 3: push button
const btnBase = (lit) => {
  const p = ledPair('a', 6, 'green', 'D13', 'green', lit);
  return {
    cols: [3, 25], board: { pins: ['D13', 'D2', 'GND'] }, gapDown: 28,
    parts: [...p.parts, { id: 'bt', type: 'pushbutton', props: { color: 'blue' }, pin: '1.l', hole: 'c18', rot: 90 }],
    wires: [...p.wires, { a: 'R/D2', b: 'B/a18', color: 'blue' }, { a: 'B/a15', b: tn(15), color: 'black' }, { a: 'R/GND', b: tn(21), color: 'black' }],
  };
};

// ---------------------------------------------------------------- project 4: traffic light
const trafficBase = (lit) => {
  const r = ledPair('r', 3, 'red', 'D12', 'red', lit === 'red');
  const y = ledPair('y', 11, 'yellow', 'D11', 'yellow', lit === 'yellow');
  const g = ledPair('g', 19, 'green', 'D10', 'green', lit === 'green');
  return { cols: [1, 28], board: { pins: ['D12', 'D11', 'D10', 'GND'] }, gapDown: 30, parts: [...r.parts, ...y.parts, ...g.parts], wires: [...r.wires, ...y.wires, ...g.wires, { a: 'R/GND', b: tn(27), color: 'black' }] };
};

// ---------------------------------------------------------------- project 5: potentiometer + LED
const potBase = (lit) => {
  const p = ledPair('a', 12, 'blue', 'D9', 'green', lit);
  return {
    cols: [2, 24], board: { pins: ['5V', 'GND', 'A0', 'D9'] }, gapDown: 30,
    parts: [{ id: 'pot', type: 'potentiometer', pin: 'GND', hole: 'e4' }, ...p.parts],
    wires: [
      { a: 'R/5V', b: 'B/' + A.railId('tp', 9), color: 'red' }, { a: 'R/GND', b: tn(21), color: 'black' },
      { a: 'B/a4', b: tn(4), color: 'black' }, { a: 'B/a6', b: 'B/' + A.railId('tp', 6), color: 'red' }, { a: 'R/A0', b: 'B/a5', color: 'yellow' },
      ...p.wires,
    ],
  };
};

export default {
  id: 'ard-proj1', no: 'A5', title: 'Projects 1 · lights, buttons and knobs', icon: 'bulb',
  blurb: 'Six step-by-step projects: Blink, an LED with a resistor, a push button, a traffic light, a dimmer knob and an RGB colour mixer.',
  sections: [
    {
      id: 'howto', title: 'How to read a project',
      html: `
${hero(A.holeNames(), 'Every project below has the same shape: the parts, the wiring in pictures, the sketch, how it works and something to try. Each one opens as a real example in the app.')}
${ul(
  '<b>The parts</b> are in the card at the top of every project, with the level and the time it takes.',
  '<b>The wiring</b> is built up picture by picture. The <b style="color:#22d3ee">cyan dashed box</b> marks what is new in that picture. The teal strip is the Arduino: it shows only the pins this project uses, with their real names.',
  '<b>Wire colours</b>: red = 5 V, black = GND, other colours = signals.',
  '<b>Hole names</b>: a letter for the row (a – e above the centre channel) and a number for the column — <code>a10</code> is row a, column 10.',
  '<b>The sketch</b> has the lines we talk about marked in yellow.')}
${note('Your breadboard does not have to look exactly like the picture. What matters is <b>which columns are joined</b>. If you build it a few columns to the left, it works the same. The example you open from the button is wired as in the app, which differs a little in the positions.')}
${table(['#', 'Project', 'Level', 'You learn'], [
  ['1', 'Blink', 'beginner', 'setup, loop, delay'],
  ['2', 'LED + resistor', 'beginner', 'the breadboard, a resistor'],
  ['3', 'Push button', 'beginner', 'digitalRead, INPUT_PULLUP, if'],
  ['4', 'Traffic light', 'beginner', 'several outputs, a function'],
  ['5', 'Dimmer knob', 'beginner', 'analogRead, analogWrite, map'],
  ['6', 'RGB colour mixer', 'intermediate', 'PWM on three pins, loops'],
])}`,
    },
    {
      id: 'blink', title: 'Project 1 · Blink',
      html: `
${project({ level: 'Beginner', time: '5 min', parts: ['Arduino Uno R3'], learn: 'setup(), loop(), pinMode, digitalWrite, delay' })}
<p>The "Hello World" of electronics: make a light blink. The Uno already has an LED on board, so you need <b>no parts and no wires</b>.</p>
${A.unoBlink()}
${code(`// Blink: the built-in LED (L) turns on and off every second.

void setup() {
  pinMode(LED_BUILTIN, OUTPUT);   // pin 13 on the Uno
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);  // LED on
  delay(1000);                      // wait 1 second
  digitalWrite(LED_BUILTIN, LOW);   // LED off
  delay(1000);
}`, 'c', { mark: [4, 8, 9], numbers: true })}
${A.blinkTiming()}
<h4>How it works</h4>
${ul(
  '<b>Line 4</b>: in <code>setup()</code> pin 13 is made an output. <code>LED_BUILTIN</code> is a name the Arduino knows for that pin.',
  '<b>Line 8</b>: <code>HIGH</code> puts 5 V on the pin. The LED lights.',
  '<b>Line 9</b>: <code>delay(1000)</code> waits 1000 milliseconds. Then <code>LOW</code> gives 0 V and the LED goes out.',
  'After the last line <code>loop()</code> starts again — so it blinks for ever.')}
${tryIt('Change both delays to <b>100</b>: it flickers fast. Make the first 100 and the second 900: a short flash once a second, like a lighthouse.')}
${openArd('blink', 'Open: Blink')}`,
    },
    {
      id: 'led', title: 'Project 2 · An LED on the breadboard',
      html: `
${project({ level: 'Beginner', time: '10 min', parts: ['Arduino Uno R3', 'half breadboard', 'resistor 220 Ω', 'red LED', '3 wires'], learn: 'the breadboard, a resistor, polarity' })}
<p>Now an <b>external</b> LED: the first circuit you build yourself. The resistor is not optional (chapter A4: it limits the current).</p>
${steps(
  'Add the <b>half breadboard</b> and the <b>Arduino Uno</b> (＋ → Power &amp; Breadboards / Microcontrollers).',
  'Add a <b>resistor</b> (220 Ω is the default) and plug it in as shown.',
  'Add a <b>red LED</b>. Mind the <b>polarity</b>: the long leg is the anode (+) and goes towards the resistor.',
  'Draw the three wires (tap a pin, tap a hole). Red and black wires get their colour by themselves when they touch power pins.')}
${ledFigs().join('\n')}
${code(`// LED + resistor on pin 13
const int LED_PIN = 13;

void setup() {
  pinMode(LED_PIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_PIN, HIGH);
  delay(500);
  digitalWrite(LED_PIN, LOW);
  delay(500);
}`, 'c', { mark: [2, 5], numbers: true })}
<h4>How it works</h4>
${ul(
  'Current flows: <b>pin 13 → resistor → LED anode → LED cathode → − rail → GND</b>. Break the chain anywhere and the LED stays dark.',
  'The resistor and the LED share column 14 — that is what connects them (chapter A2).',
  'Line 2 gives the pin a name; if you move the wire to pin 12, change one number.')}
${warn('LED dark? Check, in this order: 1) the LED the right way round, 2) both legs in the columns shown, 3) the wire of the cathode really reaches the − rail, 4) GND on the − rail.')}
${tryIt('Pull the resistor out and press Run: the LED glares and burns in seconds. Add it again, Stop, Run: a fresh LED. Then open the next example to see that on purpose.')}
${openArd('led-resistor', 'Open: LED + Resistor')} ${openArd('burn-demo', 'Open: Why Resistors Matter')}`,
    },
    {
      id: 'button', title: 'Project 3 · A push button',
      html: `
${project({ level: 'Beginner', time: '15 min', parts: ['Arduino Uno R3', 'half breadboard', 'push button', 'resistor 220 Ω', 'green LED', '5 wires'], learn: 'digitalRead, INPUT_PULLUP, if / else' })}
<p>The LED lights while you hold the button. The button connects pin 2 to GND; <code>INPUT_PULLUP</code> (chapter A4) keeps the pin HIGH when nobody presses.</p>
${steps(
  'Build the LED with its resistor as in project 2 — this time with a <b>green</b> LED further to the left.',
  'Add a <b>push button</b>. In the picture it lies on its side, so both of its halves stay on the top half of the board.',
  'Wire <b>D2</b> to one side of the button and <b>GND</b> to the other side. Run, then <b>press the button on the canvas</b>.')}
${A.bench({ ...btnBase(false), show: ['ar', 'ad'], showWires: [0, 1], hi: ['ar', 'ad'], cropTo: 52, cap: 'Step 1 · The LED branch: D13 → resistor → LED → − rail (as in project 2).' })}
${A.bench({ ...btnBase(false), show: ['ar', 'ad', 'bt'], showWires: [0, 1], hi: ['bt'], bands: [15, 18], cropTo: 52, cap: 'Step 2 · The button: its two halves are in column 15 and column 18. Pressing joins the halves.' })}
${A.bench({ ...btnBase(true), cropTo: 52, cap: 'Step 3 · D2 → column 18, and column 15 → the − rail, GND → the − rail. Press the button: the LED lights.' })}
${A.buttonStates()}
${code(`const int BUTTON_PIN = 2;
const int LED_PIN = 13;

void setup() {
  pinMode(BUTTON_PIN, INPUT_PULLUP);  // idle = HIGH
  pinMode(LED_PIN, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int state = digitalRead(BUTTON_PIN);
  if (state == LOW) {          // pressed
    digitalWrite(LED_PIN, HIGH);
  } else {
    digitalWrite(LED_PIN, LOW);
  }
  static int last = HIGH;
  if (state != last) {
    Serial.println(state == LOW ? "Pressed" : "Released");
    last = state;
  }
  delay(10);
}`, 'c', { mark: [5, 11, 12], numbers: true })}
<h4>How it works</h4>
${ul(
  '<b>Line 5</b>: pin 2 is an input with the pull-up on. Released = <code>HIGH</code>.',
  '<b>Lines 11 – 12</b>: pressed connects the pin to GND, so <code>digitalRead</code> gives <code>LOW</code> and the LED lights.',
  'The second <code>if</code> prints a message only when the state <b>changes</b> (the <code>last</code> variable remembers the old state). Look at the Serial tab.',
  '<code>delay(10)</code> keeps the loop calm and filters the bouncing of a real button.')}
${tryIt('Make the button a <b>toggle</b>: each press switches the LED on or off. Hint: act only when <code>state != last</code> and <code>state == LOW</code>, and flip a <code>bool</code>.')}
${openArd('button-led', 'Open: Button controls LED')}`,
    },
    {
      id: 'traffic', title: 'Project 4 · A traffic light',
      html: `
${project({ level: 'Beginner', time: '20 min', parts: ['Arduino Uno R3', 'half breadboard', '3 LEDs (red, yellow, green)', '3 resistors 220 Ω', '7 wires'], learn: 'three outputs, your own function' })}
<p>Three LEDs, each with its own resistor, switched in the order of a real junction. One wire for each LED plus one shared ground.</p>
${A.bench({ ...trafficBase(false), show: ['rr', 'rd'], showWires: [0, 1], hi: ['rr', 'rd'], cropTo: 52, cap: 'Step 1 · The red lamp: D12 → resistor (columns 3 – 7) → LED (columns 7 / 8) → the − rail.' })}
${A.bench({ ...trafficBase(false), show: ['rr', 'rd', 'yr', 'yd'], showWires: [0, 1, 2, 3], hi: ['yr', 'yd'], cropTo: 52, cap: 'Step 2 · The yellow lamp, eight columns to the right, on D11.' })}
${A.bench({ ...trafficBase(false), hi: ['gr', 'gd'], cropTo: 52, cap: 'Step 3 · The green lamp on D10, and one GND wire to the − rail.' })}
${A.bench({ ...trafficBase('green'), cropTo: 52, cap: 'Step 4 · Run it: the lamps follow the sequence. Here GO (green) is on.' })}
${A.trafficTiming()}
${code(`const int RED = 12;
const int YELLOW = 11;
const int GREEN = 10;

void setup() {
  pinMode(RED, OUTPUT);
  pinMode(YELLOW, OUTPUT);
  pinMode(GREEN, OUTPUT);
  Serial.begin(9600);
}

void light(int pin, int ms, const char* name) {
  digitalWrite(RED, LOW);
  digitalWrite(YELLOW, LOW);
  digitalWrite(GREEN, LOW);
  digitalWrite(pin, HIGH);      // only this lamp
  Serial.println(name);
  delay(ms);
}

void loop() {
  light(RED, 3000, "STOP");
  light(GREEN, 3000, "GO");
  light(YELLOW, 1000, "WAIT");
}`, 'c', { mark: [12, 13, 14, 15, 21, 22, 23], numbers: true })}
<h4>How it works</h4>
${ul(
  'The function <code>light()</code> (lines 12 – 19) switches <b>all lamps off</b>, then one on, prints its name and waits. It is written once and used three times.',
  '<code>loop()</code> (lines 21 – 25) reads like the sequence itself: STOP 3 s, GO 3 s, WAIT 1 s.',
  'To change the time of a colour, change one number in <code>loop()</code>.')}
${tryIt('Add a button for pedestrians on pin 2 (project 3): when pressed, wait for the red phase and keep red for 6 seconds.')}
${openArd('traffic-light', 'Open: Traffic Light')}`,
    },
    {
      id: 'dimmer', title: 'Project 5 · A dimmer knob',
      html: `
${project({ level: 'Beginner', time: '20 min', parts: ['Arduino Uno R3', 'half breadboard', 'potentiometer 10 kΩ', 'blue LED', 'resistor 220 Ω', '8 wires'], learn: 'analogRead, analogWrite (PWM), map()' })}
<p>Turn a knob, the LED gets brighter or dimmer. The potentiometer is a voltage divider (chapter A4): its middle pin gives 0 … 5 V to <b>A0</b>; the sketch turns that into a PWM value for pin <b>9</b>.</p>
${A.bench({ ...potBase(false), show: [], showWires: [0, 1], hi: [], bandRails: ['tp', 'tn'], cropTo: 8, cap: 'Step 1 · Power first: 5V → the + rail (red), GND → the − rail (black).' })}
${A.bench({ ...potBase(false), show: ['pot'], showWires: [0, 1, 2, 3, 4], hi: ['pot'], cropTo: 52, cap: 'Step 2 · The potentiometer in columns 4, 5, 6. Left pin → − rail, right pin → + rail, middle pin (the wiper) → A0.' })}
${A.bench({ ...potBase(true), show: ['pot', 'ar', 'ad'], showWires: [0, 1, 2, 3, 4, 5, 6], hi: ['ar', 'ad'], cropTo: 52, cap: 'Step 3 · The LED branch on D9 — a pin with PWM (marked ~ on the board).' })}
${code(`const int POT = A0;
const int LED = 9;      // PWM pin (~)

void setup() {
  pinMode(LED, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int raw = analogRead(POT);             // 0 .. 1023
  int brightness = map(raw, 0, 1023, 0, 255);
  analogWrite(LED, brightness);          // 0 .. 255
  Serial.print("pot:");
  Serial.print(raw);
  Serial.print(" pwm:");
  Serial.println(brightness);
  delay(50);
}`, 'c', { mark: [10, 11, 12], numbers: true })}
<h4>How it works</h4>
${ul(
  '<b>Line 10</b>: <code>analogRead</code> measures the voltage on A0: 0 (knob left) … 1023 (knob right).',
  '<b>Line 11</b>: <code>map()</code> rescales 0 … 1023 to 0 … 255, because <code>analogWrite</code> wants 0 … 255.',
  '<b>Line 12</b>: PWM — the pin switches on and off fast; the LED shows the average (chapter A4).',
  'The printed numbers show the knob and the PWM value side by side. Open the <b>Plotter</b> in the Serial tab and turn the knob: a line follows it.')}
${tryIt('Make the LED <b>brighter when the knob is turned left</b>. Which numbers in <code>map()</code> do you swap?')}
${openArd('fade-pot', 'Open: Dimmer with Potentiometer')}`,
    },
    {
      id: 'rgb', title: 'Project 6 · RGB colour mixer',
      html: `
${project({ level: 'Intermediate', time: '25 min', parts: ['Arduino Uno R3', 'breadboard', 'RGB LED (common cathode)', '3 resistors 220 Ω', '5 wires'], learn: 'PWM on three pins, for loops, a colour function' })}
<p>An RGB LED holds a red, a green and a blue LED in one housing. With PWM on all three you can mix any colour. It has <b>four legs</b>: one for each colour and the common <b>cathode</b> (−).</p>
${A.rgbMix()}
${A.exampleView('rgb-led', { hide: ['uno'], crop: [388, 44, 520, 192], w: 360, cap: 'The circuit of the example (the Uno is out of the picture). Each colour leg has its own 220 Ω resistor, standing across the centre channel; the common leg goes to GND.' })}
${table(['RGB leg', 'Resistor', 'Arduino pin', 'Wire'], [
  ['R (red)', '220 Ω', 'D9 (PWM)', 'red'],
  ['G (green)', '220 Ω', 'D10 (PWM)', 'green'],
  ['B (blue)', '220 Ω', 'D11 (PWM)', 'blue'],
  ['COM (common cathode)', '—', 'GND', 'black'],
])}
${code(`// RGB LED rainbow (common cathode)
const int R = 9, G = 10, B = 11;

void setColor(int r, int g, int b) {
  analogWrite(R, r);
  analogWrite(G, g);
  analogWrite(B, b);
}

void setup() {
  Serial.begin(9600);
}

void loop() {
  for (int i = 0; i < 256; i += 3) { setColor(255 - i, i, 0); delay(15); }  // red -> green
  for (int i = 0; i < 256; i += 3) { setColor(0, 255 - i, i); delay(15); }  // green -> blue
  for (int i = 0; i < 256; i += 3) { setColor(i, 0, 255 - i); delay(15); }  // blue -> red
}`, 'c', { mark: [4, 16, 17, 18], numbers: true })}
<h4>How it works</h4>
${ul(
  '<code>setColor(r, g, b)</code> (line 4) hides the three <code>analogWrite</code> calls behind one name.',
  'Each <code>for</code> loop fades one colour out while the next fades in: <code>255 - i</code> goes down as <code>i</code> goes up.',
  'A <b>common anode</b> RGB LED (Edit → Type) works the other way round: its common leg goes to 5 V and <code>0</code> means bright.')}
${tryIt('Pick your own colour: <code>setColor(255, 80, 0)</code> is orange. Find purple and pink by trying.')}
${note(`<b>Remember</b><br>• A project = parts · wiring in steps · sketch · how it works.<br>• An LED always needs a resistor; the long leg is +.<br>• A button wired to GND with <code>INPUT_PULLUP</code> reads <code>LOW</code> when pressed.<br>• <code>analogRead</code> 0 … 1023 → <code>map()</code> → <code>analogWrite</code> 0 … 255 on a ~ pin.`)}
${openArd('rgb-led', 'Open: RGB Colour Mixer')}`,
    },
  ],
};
void tip;
