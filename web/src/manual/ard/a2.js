import * as A from './art-ard.js';
import { allDefs, CATEGORIES } from '../../components/index.js';
import { note, tip, warn, tryIt, steps, ul, table, openArd } from '../helpers.js';

const hero = (figure, text) => `<div class="mx-ard-hero">${figure}<p class="mx-ard-promise">${text}</p></div>`;
const inCat = (id) => allDefs().filter((d) => d.category === id && !d.hidden).length;
const catRows = {
  boards: 'Uno, Nano, Mega, Leonardo, ESP32, NodeMCU, Blue Pill, ATtiny85',
  basic: 'resistor, capacitors, diodes, transistors, MOSFET',
  output: 'LED, RGB LED, buzzer, light bulb, LED bar, NeoPixel',
  display: 'LCD (parallel and I²C), OLED, 7-segment, TM1637, MAX7219',
  input: 'push button, switches, potentiometers, joystick, keypad, encoder, IR receiver',
  sensors: 'ultrasonic, DHT22, PIR, light, sound, gas, soil, LM35, DS18B20, MPU6050, RTC …',
  motors: 'servo, DC motor, steppers, relay, L298N',
  power: 'breadboards, 9 V battery, 4×AA pack, DC power supply',
  ics: '74HC595 shift register, MCP3008 ADC',
  meters: 'multimeter (volts), ammeter',
};

export default {
  id: 'ard-canvas', no: 'A2', title: 'The circuit canvas', icon: 'circuit',
  blurb: 'Add parts, move and turn them, the breadboard and how it connects, wires and colours, select, undo, power, and the messages of the app.',
  sections: [
    {
      id: 'parts', title: 'Adding parts',
      html: `
${hero(A.heroCanvas(), 'The canvas is where the circuit lives. After this chapter you can place any part, plug it into the breadboard and connect it with wires — in the right colours.')}
${A.libSheet()}
${steps(
  'Tap the round <b>＋</b> button (bottom right). The parts library slides up.',
  'Search by name (<i>led</i>, <i>servo</i>, <i>sensor</i>) or tap a group chip. Every card shows the real picture of the part.',
  'Tap a part. It lands in the <b>middle of the canvas</b> and is already selected, with its bar at the bottom.')}
${A.addSteps()}
${table(['Group', 'Parts', 'Examples'], CATEGORIES.map((c) => [`<b>${c.name}</b>`, String(inCat(c.id)), catRows[c.id] || '']))}
${note('A project can have <b>more than one board</b> (up to four). When you add a second board the app asks first: every board gets its own sketch, chosen by the tabs on top of the Code screen (chapter A8).')}`,
    },
    {
      id: 'move', title: 'Moving, rotating, mirroring, editing',
      html: `
${steps(
  '<b>Drag</b> a part to move it. It snaps to the 0.1" grid, and its legs jump into a breadboard hole or a board socket like a magnet when they come close.',
  '<b>Tap</b> a part to select it. A dashed box appears and the bar shows <b>Rotate · Mirror · Flip · Edit · Copy · Delete</b>.',
  '<b>Press and hold</b> a part (or a wire) for the same actions in a menu, plus <b>Properties</b>, <b>Duplicate</b> and <b>Delete connected wires</b>.')}
${A.selBar()}
${A.rotMirror()}
${ul(
  '<b>Rotate</b> turns the part by 90° each time. <b>Mirror</b> swaps left and right, <b>Flip</b> swaps top and bottom. Pins change sides with the picture, wires follow, and the lettering is turned back so it stays readable.',
  '<b>Edit</b> opens the values of the part: the resistance of a resistor (type <code>4.7k</code> or tap a preset), the colour of an LED, the model of a servo, the I²C address of a display … Parts with nothing to set show <b>Info</b> instead. Double-tapping a selected part opens the same sheet.',
  '<b>Copy</b> makes a duplicate next to the original. Select several parts and copy them together: the wires between them are copied too.',
  'Drag a <b>breadboard</b> and everything plugged into it comes with it. Drag a part off the board and it is unplugged.')}
${tip('Part with a long label or small pins? <b>Zoom in</b> first. Pins are easier to hit, and the name of a pin pops up when you touch it.')}`,
    },
    {
      id: 'bb', title: 'The breadboard: what is connected to what',
      html: `
<p>A breadboard is a plastic board full of holes. Under the holes, metal strips connect some of them. If you know the strips, you know every circuit you will ever build.</p>
${A.bbInside()}
${ul(
  'Look at the picture. In every column the <b>five holes a–e</b> are one connection, and the <b>five holes f–j</b> are another one. Columns are numbered along the top.',
  'The <b>centre channel</b> separates the two halves. A chip (IC) straddles the channel, so that each of its pins gets its own strip.',
  'The four <b>power rails</b> (two at the top, two at the bottom) are long strips: <b>+</b> (red line) and <b>−</b> (blue line). In the app a rail is connected over its <b>whole length</b>, so you can tap into it anywhere.',
  'Parts plugged into the same strip are connected to each other. Nothing else is: two neighbouring columns do <b>not</b> touch.')}
${A.bbRules()}
${warn('A part whose two legs go into the <b>same strip</b> is short-circuited and does nothing. A resistor is four columns long and an LED has its legs one column apart, so they normally fit; with a push button, check which legs go to which row.')}
${A.bbSizes()}
${table(['Board', 'Holes', 'Columns', 'Rails'], [
  ['Breadboard (full, 830)', '830', '63', '4'],
  ['Breadboard (half, 400)', '400', '30', '4'],
  ['Breadboard (mini, 170)', '170', '17', 'none'],
])}
<p>Add a breadboard like any other part (group <b>Power &amp; Breadboards</b>). The hint at the bottom says: <i>Breadboard added. Drag parts onto it — their legs snap into the holes.</i></p>`,
    },
    {
      id: 'wires', title: 'Drawing wires',
      html: `
<p>A wire joins any pin to any other pin: a board pin to a breadboard hole, a sensor pin to a rail, two holes together.</p>
${A.wireStep(1)}
${A.wireStep(2)}
${A.wireStep(3)}
${steps(
  '<b>Tap the first pin.</b> Its name pops up and a ghost wire starts. A bar at the bottom explains: <i>Tap a pin to connect · tap empty space to bend</i>.',
  '<b>Tap the second pin.</b> The wire is made and selected. (You can also <b>drag</b> from one pin straight to the other.)',
  'To make a wire tidy, <b>tap empty space</b> on the way: that adds a bend. <b>Point</b> in the bar takes the last bend back, <b>Cancel</b> (or the phone\'s Back button) drops the wire.')}
${A.wireBend()}
<p>Wires can be changed afterwards. Tap a wire to select it; then drag a round handle to move a bend, drag a small dot on a segment to create a new bend, double-tap a handle to remove it, or tap <b>Straight</b> to remove all bends. <b>Straight wires</b> in the ⋮ menu (or Settings) draws every wire with sharp corners instead of rounded ones.</p>
${A.wireColors()}
${table(['Colour', 'Use it for'], [
  [`<span style="color:#ef4444">●</span> red`, '5 V, 3.3 V, Vin, VCC and the + rail'],
  ['<span style="color:#9ca3af">●</span> black', 'GND, the − rail'],
  ['<span style="color:#22c55e">●</span> green · <span style="color:#3b82f6">●</span> blue · <span style="color:#eab308">●</span> yellow', 'signals: sensor outputs, data, buttons'],
  ['<span style="color:#f97316">●</span> orange', 'PWM and motor signals — whatever helps you to read the picture'],
])}
${tip('Use <b>one colour per job</b>, always the same. When something does not work, a circuit with red power, black ground and coloured signals is easy to check wire by wire.')}`,
    },
    {
      id: 'select', title: 'Select, copy, delete, undo and zoom',
      html: `
${A.selectBox()}
${ul(
  '<b>Select tool</b> (dashed box in the side bar): one finger draws a box. Drag to the <b>right</b> for a blue <i>window</i> (only what is completely inside), to the <b>left</b> for a green dashed <i>crossing</i> (everything it touches). Tap parts or wires to add them to the selection or take them out.',
  'Without the tool: <b>press and hold</b> on empty space, then drag, to draw the same box.',
  'A selection of several things shows <b>Mirror · Flip · Copy · Delete</b>. Drag one selected part and the whole selection moves.',
  '<b>Delete</b> removes the part together with the wires on it. To remove only the wires of a part, use <b>Delete connected wires</b> in the long-press menu.',
  '<b>Undo / Redo</b> (side bar) go back and forth through your last 80 changes of parts and wires. They are not available while the simulation runs.')}
${A.gestures()}
${ul(
  '<b>Move the view</b>: drag the empty background. <b>Zoom</b>: pinch, or the <b>＋ / −</b> tools, or double-tap and slide.',
  '<b>Fit to screen</b> (the arrows tool) zooms so that the whole circuit is on the screen. Lost? Tap it.',
  '<b>Show grid</b> in the ⋮ menu turns the dotted background on or off.')}`,
    },
    {
      id: 'power', title: 'Power: 5V, 3.3V and GND',
      html: `
<p>Every circuit needs a way for the current to come out of the supply, through the parts and back. The <b>board</b> is the supply: it gives <b>5V</b> (the Uno) or <b>3.3V</b> (the ESP32) and has several <b>GND</b> pins.</p>
${A.powerRails()}
${steps(
  'Wire the board\'s <b>5V</b> pin to the <b>+ rail</b> (red wire).',
  'Wire a board <b>GND</b> pin to the <b>− rail</b> (black wire).',
  'Now plug every part that needs 5 V into the + rail and everything that needs ground into the − rail.')}
${ul(
  'All <b>GND pins</b> of a board are the same connection, so you may use any of them. On the Uno, <b>A4 is also SDA</b> and <b>A5 is also SCL</b>.',
  'The Uno\'s <b>5V</b> pin can give about 0.5 A and its 3.3V pin about 0.15 A. The ESP32 board works at 3.3 V: its supply pins are <b>3V3</b> (about 0.6 A) and <b>VIN</b> (5 V).',
  'For motors, lamps and anything hungry use a <b>separate supply</b>: the <i>9 V Battery</i>, the <i>4×AA battery pack</i> or the adjustable <i>DC Power Supply</i> from the group Power &amp; Breadboards. Join its − to the board\'s GND so both share the same ground.',
  '<b>Never feed another supply into the board\'s 5V pin.</b> The app stops with <i>burned out: … V was forced onto its 5V pin</i>.')}
${A.shortCircuit()}
${warn('5V joined straight to GND is a <b>short circuit</b>. The simulation stops at once. Real boards would get hot or shut down — here you just lose a second.')}`,
    },
    {
      id: 'check', title: 'Does the app check my circuit?',
      html: `
<p>There is no "check" button. The app tells you <b>while the sketch runs</b>: it pops up a short message (a <i>toast</i>) and counts the messages in the ⚠ pill of the status bar. Tap the pill to read them all.</p>
${A.warnList()}
${table(['Message (shortened)', 'What it means', 'What to do'], [
  ['<code>Pin D13 is supplying 91 mA — more than the 40 mA maximum!</code>', 'A pin drives too much current (an LED with no resistor, a motor).', 'Add a resistor, or switch the load with a transistor or relay.'],
  ['<code>… burned out — …</code>', 'A part was destroyed by too much current or voltage (chapter A4).', 'Stop, fix the circuit, Run again: you get a new part.'],
  ['<code>Pin D2 is floating … reads random values</code>', 'An input is connected to nothing.', 'Use <code>INPUT_PULLUP</code>, or a pull-down resistor.'],
  ['<code>Pin D4 has no PWM — analogWrite() works like digitalWrite()</code>', '<code>analogWrite()</code> on a pin without the ~ mark.', 'Use a PWM pin (Uno: 3, 5, 6, 9, 10, 11).'],
  ['<code>analogRead(5): pin D5 is not an analog input</code>', 'A digital pin was used for analogRead.', 'Use A0 … A5 on the Uno.'],
  ['<code>Pin 25 does not exist on Arduino Uno R3</code>', 'The pin number is not on this board.', 'Check the pin names (chapter A9).'],
  ['<code>GPIO34 is input-only on ESP32 …</code>', 'Some ESP32 pins can only read.', 'Pick another pin for outputs.'],
  ['<code>5V supply overloaded: … mA</code>', 'More current than the 5V pin can give.', 'Power big loads from a separate supply.'],
])}
${note(`<b>Remember</b><br>• ＋ adds parts, drag to move, tap to select, press and hold for more.<br>• In a column the holes a–e touch each other, f–j touch each other; nothing crosses the centre channel; rails run the whole length.<br>• Tap pin, tap pin = a wire. Red = power, black = GND, other colours = signals.<br>• Stop before you edit; read the ⚠ messages when something is wrong.`)}
${tryIt('Open <b>LED + Resistor</b>. Select the LED, tap <b>Mirror</b> — it should now be reversed. Run it: nothing lights. Why? Mirror it back and Run again.')}
${openArd('led-resistor', 'Open: LED + Resistor')}`,
    },
  ],
};
void inCat;
