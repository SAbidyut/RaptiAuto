import * as A from './art-ard.js';
import { note, tip, warn, tryIt, steps, ul, table, code, openArd } from '../helpers.js';

const hero = (figure, text) => `<div class="mx-ard-hero">${figure}<p class="mx-ard-promise">${text}</p></div>`;

export default {
  id: 'ard-elec', no: 'A4', title: 'Electronics you need', icon: 'bolt',
  blurb: 'Voltage, current and resistance; the resistor of an LED; pull-ups; voltage dividers; PWM; and why parts burn out in the simulator.',
  sections: [
    {
      id: 'basics', title: 'Voltage, current and resistance',
      html: `
${hero(A.heroOhm(), 'You do not need a lot of electronics for Arduino — just three ideas and one formula. We explain them with the most common circuit in the world: an LED with a resistor.')}
<p>Electricity is a flow of electric charge. Three numbers describe it:</p>
${A.waterAnalogy()}
<p>In a circuit the <b>voltage</b> pushes, the <b>resistance</b> holds back, and the <b>current</b> is what results. The three are tied together by <b>Ohm's law</b>:</p>
${A.ohmTriangle()}
${table(['Quantity', 'Symbol', 'Unit', 'On an Arduino'], [
  ['Voltage', 'V', 'volt (V)', 'a pin gives 5 V (HIGH) or 0 V (LOW); ESP32 gives 3.3 V'],
  ['Current', 'I', 'ampere (A), milliampere (mA)', 'an LED needs about 10 – 20 mA; a pin may give at most about 40 mA'],
  ['Resistance', 'R', 'ohm (Ω), kΩ = 1000 Ω', 'resistors of 220 Ω – 10 kΩ'],
])}
${tip('<b>Open the example <i>Voltage Divider</i></b> and press Run: the multimeter shows a voltage you can calculate. Real electronics, no code.')}
${openArd('voltage-divider', 'Open: Voltage Divider (no code)')}`,
    },
    {
      id: 'led', title: 'An LED needs a resistor',
      html: `
<p>An LED is not like a lamp. Once the voltage is high enough it lets <b>almost any current</b> through — until it burns. The resistor in series limits the current. The recipe:</p>
${A.ledCalc()}
${steps(
  'Look up the <b>forward voltage</b> V<sub>LED</sub> of the LED (about 1.8 V for red).',
  'Decide the current: <b>10 – 15 mA</b> is bright enough; 20 mA is the limit.',
  'Calculate <code>R = (V<sub>supply</sub> − V<sub>LED</sub>) ÷ I</code> and take the next bigger value that exists: <b>220 Ω</b> works for almost every LED on 5 V.')}
${table(['LED colour', 'V<sub>LED</sub> in the app', 'R for 15 mA at 5 V', 'Current with 220 Ω'], [
  ['red', '1.8 V', '213 Ω', '12.5 mA'],
  ['orange', '1.9 V', '207 Ω', '12.2 mA'],
  ['green · yellow', '2.0 V', '200 Ω', '11.8 mA'],
  ['blue · white', '2.9 V', '140 Ω', '8.1 mA'],
  ['purple · pink', '3.0 V', '133 Ω', '7.7 mA'],
])}
<p>The currents in the last column are what the simulator measures, including the small resistance (about 25 Ω) inside the board's pin. They are all safe, and all clearly visible.</p>
${A.resistorColors()}
${A.schemVsBoard()}
${warn('On a <b>3.3 V board</b> (ESP32, NodeMCU) there is less voltage to spare: a blue or white LED (2.9 V) gets only 0.4 V across the resistor and glows very weakly. On 3.3 V boards use red or green LEDs.')}
${tryIt('Open <b>LED + Resistor</b>. Select the resistor → <b>Edit</b> → try 100 Ω, 330 Ω, 1 kΩ and 10 kΩ. The LED gets dimmer (and at 10 kΩ almost off). Which value is the dimmest that you still like?')}
${openArd('led-resistor', 'Open: LED + Resistor')}`,
    },
    {
      id: 'pull', title: 'Pull-up and pull-down resistors',
      html: `
<p>A <b>push button</b> only <i>connects</i> two wires. When it is open, the Arduino pin is connected to <b>nothing</b>: it <b>floats</b> and picks up noise, so <code>digitalRead()</code> returns random answers. The cure is a resistor that gently pulls the pin to a known level.</p>
${A.pullups()}
${table(['Method', 'Wiring', 'Pressed reads', 'Needs'], [
  ['<b>INPUT_PULLUP</b>', 'button between the pin and GND', '<code>LOW</code>', '<code>pinMode(pin, INPUT_PULLUP)</code>. No extra part.'],
  ['<b>Pull-down</b>', 'button between the pin and 5 V, a 10 kΩ resistor from the pin to GND', '<code>HIGH</code>', 'one resistor'],
  ['<b>Nothing</b>', 'only the button', 'random when open', 'never do this'],
])}
${code(`pinMode(2, INPUT_PULLUP);      // the chip pulls pin 2 up to 5 V

if (digitalRead(2) == LOW) {   // LOW = the button is pressed
  // do something
}`, 'c', { mark: [1, 3] })}
<p>The pull-up inside the chip is a resistor of tens of kilo-ohms (about 35 kΩ in the simulator's Uno): strong enough to hold the pin HIGH, weak enough that the button can pull it to ground without a problem.</p>
${note('That is why a button wired with <code>INPUT_PULLUP</code> seems "backwards": <code>LOW</code> means pressed. Everyone gets used to it within a day.')}
${openArd('button-led', 'Open: Button controls LED')}`,
    },
    {
      id: 'divider', title: 'The voltage divider',
      html: `
<p>Two resistors in a row share the voltage. The voltage at the point between them is a <b>fraction</b> of the supply — and a fraction is exactly what an analog input wants to measure.</p>
${A.voltageDivider()}
<p>Many parts are voltage dividers in disguise:</p>
${A.potDivider()}
${ul(
  'A <b>potentiometer</b> is a resistor with a sliding middle contact. Outer pins to 5 V and GND, the middle pin gives 0 … 5 V: <code>analogRead()</code> returns 0 … 1023.',
  'An <b>LDR</b> (light-dependent resistor) changes its resistance with light. With a fixed 10 kΩ resistor it makes a divider whose voltage follows the light — the <b>Automatic Night Light</b> example.',
  '<b>Level shifting</b>: a 5 V signal into a 3.3 V pin needs a divider, for example 1 kΩ on top and 2 kΩ below: 5 V × 2 ÷ 3 = 3.3 V. (The app tells you this when a 3.3 V pin sees 5 V.)')}
${tryIt('In the Voltage Divider example, change R2 from 4.7 kΩ to 10 kΩ. Calculate the new voltage first (9 V × 10 ÷ 20 = 4.5 V), then run and check the multimeter.')}
${openArd('night-light', 'Open: Automatic Night Light (LDR divider)')}`,
    },
    {
      id: 'pwm', title: 'PWM: a pin that fakes an analog voltage',
      html: `
<p>An Arduino pin cannot give 2.5 V — only 0 V or 5 V. But it can switch between them <b>very fast</b>. This is called <b>PWM</b> (pulse-width modulation). The fraction of time spent at 5 V is the <b>duty cycle</b>; the average voltage is <i>duty × 5 V</i>.</p>
${A.pwmAverage()}
${table(['analogWrite value', 'Duty cycle', 'Average voltage', 'An LED looks'], [
  ['0', '0 %', '0 V', 'off'],
  ['64', '25 %', '1.25 V', 'dim'],
  ['128', '50 %', '2.5 V', 'half'],
  ['191', '75 %', '3.75 V', 'bright'],
  ['255', '100 %', '5 V', 'full'],
])}
${ul(
  'An <b>LED</b> or a <b>motor</b> is too slow to follow the fast switching and reacts to the average: <code>analogWrite(9, 128)</code> dims the LED to half.',
  'Only pins marked <b>~</b> can do PWM (Uno: 3, 5, 6, 9, 10, 11). The pin itself still gives only pulses; the smooth average appears in the LED or motor.',
  'A <b>servo</b> is also controlled by pulses, but with a different meaning (the width tells the angle). The <code>Servo</code> library does it for you.')}
${openArd('fade-pot', 'Open: Dimmer with Potentiometer (PWM)')}`,
    },
    {
      id: 'burn', title: 'Why parts burn',
      html: `
<p>The simulator keeps a <b>wear meter</b> for every part that can be damaged, just like heat building up in the real thing. The more current (or voltage) above the limit, the faster the meter fills. When it is full, the part <b>burns out</b>: a flash, a puff of smoke for a few seconds, a scorch mark — and it stays dead until you Run again.</p>
${A.burnTimeline()}
${A.burnChart()}
${table(['Part', 'Safe', 'What kills it', 'How fast'], [
  ['<b>LED</b>', 'up to about 20 mA', 'no resistor (a pin gives about 90 mA)', '60 mA: about 20 s · 90 mA: a few seconds · straight across 5 V: milliseconds'],
  ['<b>Resistor</b> (¼ W)', 'up to about 0.25 W', 'dissipating twice that or more', 'twice: about 20 s · four times: about 1 s'],
  ['<b>Board pin</b>', 'up to about 40 mA', 'an LED or motor straight on a pin; a pin shorted to GND or 5 V', '80 mA: about 10 s · a short: a fraction of a second'],
  ['<b>3.3 V pin</b>', '0 … 3.3 V', 'a 5 V signal (for example the ECHO of an HC-SR04 without a divider)', 'about 15 s'],
  ['<b>Sensor / display module</b>', 'its rated supply (usually 5 V)', 'about 12 % more than the rating, or the supply connected the wrong way round', 'seconds'],
  ['<b>Battery, supply</b>', 'its rated current', 'a short circuit', 'a few seconds, or the simulation stops'],
])}
<p>Before a part burns the app <b>warns</b> you: <i>Pin D13 is supplying 91 mA — more than the 40 mA maximum!</i>, then <i>💥 red LED burned out — 91 mA is far above its 20 mA limit. Put a current-limiting resistor (220 Ω – 1 kΩ) in series with every LED</i>. The phone gives a short vibration and a pop (Settings → Sound and Vibration switch them off).</p>
${warn('<b>Burning is a lesson, not a failure.</b> Stop, find the cause with the message, fix the circuit and Run again: the part is new.')}
${tryIt('Open <b>Why Resistors Matter</b> and press Run. Two LEDs, one with a resistor and one without. Watch the first one glare and die while the other lives on. Then add a resistor to the dead one.')}
${openArd('burn-demo', 'Open: Why Resistors Matter')}`,
    },
    {
      id: 'habits', title: 'Good habits on the breadboard',
      html: `
${A.etiquette()}
${ul(
  '<b>Plan before you wire.</b> Draw the circuit (even roughly), name the pins, then build it.',
  '<b>Build in small steps.</b> Add one part, run, check. Do not wire ten things and then wonder.',
  '<b>Check the power first.</b> If a sensor does nothing, is its VCC on 5 V and its GND on ground?',
  '<b>Use the rails.</b> Everything that needs 5 V or GND goes to a rail, not to a pin of the board.',
  '<b>Read the messages.</b> The ⚠ pill and the Serial Monitor tell you more than staring at the picture.')}
${note(`<b>Remember</b><br>• V = I × R. An LED needs a resistor: R = (5 V − V<sub>LED</sub>) ÷ I, 220 Ω is a good start.<br>• A button needs a pull-up: use <code>INPUT_PULLUP</code>; pressed reads LOW.<br>• Two resistors make a voltage divider: V<sub>out</sub> = V<sub>in</sub> × R2 ÷ (R1 + R2).<br>• PWM fakes an analog voltage by switching fast; the average counts.<br>• Too much current or voltage burns parts. Read the warning before it happens.`)}
${tryIt(`<b>Exercises</b> (answers at the end of the line)<br>1. A blue LED (2.9 V) on 5 V at 10 mA: which resistor? <i>(5 − 2.9) ÷ 0.010 = 210 Ω → 220 Ω</i><br>2. 5 V, R1 = 1 kΩ, R2 = 2 kΩ: what is V<sub>out</sub>? <i>5 × 2 ÷ 3 = 3.33 V</i><br>3. A pin gives 5 V into 330 Ω and a red LED: current? <i>(5 − 1.8) ÷ 330 ≈ 9.7 mA (the app shows 8.8 mA because of the pin's own resistance)</i><br>4. <code>analogWrite(9, 64)</code>: what is the average voltage? <i>64 ÷ 255 × 5 ≈ 1.25 V</i>`)}`,
    },
  ],
};
