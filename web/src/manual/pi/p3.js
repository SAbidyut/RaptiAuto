import * as A from './art-pi.js';
import { note, tip, warn, tryIt, steps, ul, table, code, openPi, k } from '../helpers.js';

export default {
  id: 'pi-circuit', no: 'P3', title: 'The circuit canvas for the Pi', icon: 'circuit',
  blurb: 'Add parts, draw wires, use the breadboard, power the circuit on and off, read the live pinout and learn what burns.',
  sections: [
    {
      id: 'canvas', title: 'Meet the canvas',
      html: `
${A.heroCircuit()}
<p>The <b>Circuit</b> tab is a drawing board with a fixed <b>Pi</b> (or Pico) in the middle and everything else around it. It is the same canvas, parts library and circuit solver as the Arduino editor — so what you learn here works there too.</p>
${table(['You want to …', 'Do this'], [
  ['Look around', 'Drag the empty canvas. <b>Pinch</b> to zoom, or tap <b>＋ / −</b> on the tool rail. <b>Fit</b> (⤢) shows everything.'],
  ['Zoom like a map', 'Double-tap and hold on the second tap, then slide up or down.'],
  ['Move a part', 'Drag it. Parts snap to the 0.1 inch grid, like holes in a breadboard.'],
  ['Select many things', 'Tap the <b>Select</b> tool (dashed box) and drag a box — or touch and hold on empty space, then drag.'],
  ['Undo a mistake', '<b>Undo</b> and <b>Redo</b> arrows at the top of the tool rail.'],
])}
<p>The <b>board cannot be deleted</b> (the lab says: <i>The board stays</i>). To use another board, tap the board chip at the top.</p>
${tip('Look at the dotted background: the distance between two dots is one hole of the breadboard (0.1 inch, 2.54 mm). The header pins and the breadboard holes sit exactly on these dots.')}`,
    },
    {
      id: 'add', title: 'Adding parts',
      html: `
${A.addPartFlow()}
${steps(
  'Tap the round <b>＋</b> button at the bottom right.',
  'The library <i>Add a part to the Pi</i> opens: type in the search box or use the group chips (<i>Basic · LEDs · Displays · Input · Sensors · Motors · Power & Breadboards · ICs · Measurement</i>).',
  'Tap a part. It appears in free space <b>above the board</b>, already selected.',
  'Drag it where you want it. A bar at the bottom offers <b>Rotate · Mirror · Flip · Edit · Copy · Delete</b>.')}
<p>Parts you will use most:</p>
${ul(
  '<b>LED</b>, <b>RGB LED</b>, <b>Buzzer</b>, <b>Lamp</b>, <b>NeoPixel</b> strip — outputs.',
  '<b>Push button</b>, <b>slide switch</b>, <b>potentiometer</b> — inputs.',
  '<b>HC-SR04</b>, <b>DHT22</b>, <b>PIR</b>, <b>LDR module</b> — sensors.',
  '<b>LCD (I²C)</b>, <b>OLED</b>, <b>TM1637</b>, <b>MAX7219</b> — displays.',
  '<b>Servo</b>, <b>DC motor</b> with the <b>L298N</b>, <b>relay module</b> — things that move.',
  '<b>Resistor</b>, <b>breadboard</b> (half size) and the <b>MCP3008</b> analog chip.')}
<p>Tap <b>Edit</b> (or <b>Info</b>) on a selected part to change its values: the colour of an LED, the ohms of a resistor, the I²C address of a display.</p>
${warn('You cannot change the circuit while it is powered. If you tap ＋ while the program runs, the lab says <i>Stop the program to change the circuit</i> — press <b>Stop</b> first.')}`,
    },
    {
      id: 'wires', title: 'Drawing wires',
      html: `
${A.wireFlow()}
${steps(
  'Tap a <b>pin</b> of a part (the LED\'s A pin, say). A bar with the text <i>Tap a pin to connect · tap empty space to bend</i> appears.',
  'Tap a <b>pin of the Pi</b> (GPIO17, 3V3, GND …). The wire is drawn and selected.',
  'Want a neat route? While drawing, <b>tap empty space</b> to put a bend point there. <b>↶ Point</b> removes the last bend, <b>✕ Cancel</b> abandons the wire.')}
${A.selectionBars()}
<ul>
<li><b>Colours:</b> a wire that ends on a <b>power</b> pin turns <b>red</b>, one that ends on <b>GND</b> turns <b>black</b>. For signals pick any colour in the bar (green, blue, orange, yellow, purple …).</li>
<li><b>Edit a wire:</b> tap it. The bar offers <b>Colour</b>, <b>Straight</b> (remove the bends) and <b>Delete</b>.</li>
<li><b>Touch and hold</b> a part or a wire for a context menu: rotate, mirror, flip, properties, duplicate, <i>delete connected wires</i>.</li>
<li>A pin shows its name when you touch it: <i>GPIO17 (pin 11)</i>.</li>
</ul>
${tip('Use the colours like an electrician: <b>red</b> = power, <b>black</b> = ground, anything else = signal. A circuit that is easy to read is easy to debug.')}`,
    },
    {
      id: 'bb', title: 'The breadboard',
      html: `
${A.breadboardLogic()}
<p>A breadboard lets you build without soldering. Add one from <b>＋ ▸ Power &amp; Breadboards</b> (the half-size one with 30 columns is a good choice). The rules are simple:</p>
${ul(
  'The five holes of a <b>column</b> are joined. The top half (<b>a – e</b>) and the bottom half (<b>f – j</b>) of a column are <b>two separate</b> connections.',
  'The <b>channel</b> in the middle separates the halves. That is where a chip or a button goes, with its legs on both sides.',
  'The <b>rails</b> along the top are long connections: use the <b>red (+)</b> one for 3.3 V and the <b>blue (−)</b> one for GND. The rail holes come in groups of five.')}
${A.legsSnap()}
<p>Parts with legs plug in by themselves: drag an LED or a resistor near the holes and the legs <b>snap in</b>. Then draw wires from the Pi\'s pins to the holes — tap the pin, tap the hole.</p>
${note('Not every hole is a good choice: a wire on <b>d5</b> and a leg on <b>b5</b> are connected (same column, same half), but a leg on <b>g5</b> is <b>not</b>. When something does not work, check the half first.')}`,
    },
    {
      id: 'run', title: 'Power on: Run and Stop',
      html: `
${A.runStates()}
<p>While you edit, the circuit is <b>off</b>. Press <b>Run</b> and three things happen together: the circuit is <b>powered</b> (the lab solves the voltages and currents of every wire many times a second), your Python file <b>starts</b>, and the Output screen shows what it prints. <b>Stop</b> ends both.</p>
${ul(
  'A status pill on the canvas says <b>Powered</b> (circuit on, no program) or <b>Python running</b>, with the board name. A <b>⚠ number</b> beside it counts warnings — tap it for the list (<i>Simulation messages</i>).',
  'A program started from <b>Thonny</b>, from the <b>Terminal</b> or from the Run button always powers the circuit.',
  'If the circuit changes while it runs, a banner says <b>Circuit changed — Stop and Run again to apply</b>. Tap it to restart.')}
<h3>Touching the parts while it runs</h3>
<p>The parts react to your finger, like real ones:</p>
${ul(
  '<b>Push button</b> — press and hold it on the canvas.',
  '<b>Potentiometer, slider, joystick</b> — drag them.',
  '<b>Sensors</b> (HC-SR04, DHT22, PIR, light) — tap one and a small sheet opens with sliders: distance, temperature, humidity, "wave a hand" …')}
${tryIt('Open <b>button_led.py</b>, press <b>Run</b>, then press and hold the button part on the canvas. The LED follows your finger.')}
${openPi('button_led.py', 'Open: Button + LED')}`,
    },
    {
      id: 'pinout', title: 'The Pinout screen: live pins',
      html: `
${A.pinoutLive()}
<p>The <b>Pinout</b> tab shows the board drawing and, under it, a strip with every pin of the header: its <b>BCM number</b> in colour and its <b>physical number</b> below. While a program runs the pins change colour:</p>
${table(['Look', 'Meaning'], [
  ['Red glow', 'An <b>output</b> that is HIGH (3.3 V).'],
  ['Blue ring', 'An <b>output</b> that is LOW.'],
  ['Orange', '<b>PWM</b>: the pin switches fast; the stronger the colour, the higher the duty cycle.'],
  ['Green ring / grey ring', 'An <b>input</b> that reads HIGH / LOW.'],
  ['Plain', 'A pin the program does not use.'],
])}
<p>The legend below the drawing repeats these colours (3V3, 5V, GND, GPIO, HIGH, PWM, Input). Tap a pin for its <b>sheet</b>: physical pin, type, BCM number, alternative functions, mode, level, pull, how many wires end on it on the canvas, and the Python to use it. On the Pico the ACT / user LED and the <b>BOOTSEL</b> button are live too.</p>
${tip('The Pinout tab is the best <b>debugger</b>: if the LED does not light, look whether the pin turns red. If it does, the problem is in the wiring; if not, it is in the program.')}`,
    },
    {
      id: 'burn', title: 'When things burn',
      html: `
${A.damageModel()}
<p>The lab does not just draw lines: it <b>calculates</b> the current in every wire. A part that carries too much current or too much voltage collects "stress"; at 100 % it <b>burns</b> — with a flash, smoke and a scorch mark. A burnt part stays dead until the next <b>Run</b>.</p>
${ul(
  '<b>LED without a resistor</b> → the GPIO pin gives far more than its 16 mA and burns out first. The Output keeps working, but that pin is dead.',
  '<b>5 V on a GPIO</b> → a warning, then the pin burns (use a divider, chapter P2).',
  '<b>Supply backwards</b> or <b>more volts than a part likes</b> → the part burns (<i>💥 … burned out — …</i> with advice).',
  '<b>3V3 or 5V wired to GND</b> → <b>⚡ Power cut</b>: the board\'s protection shuts the circuit down and the program stops.')}
<p>Warnings also tell you about wiring slips <i>before</i> they burn: <i>HC-SR04 has no power: VCC to 5V, GND to GND</i>, <i>MCP3008: wire CLK → GPIO11 …</i>, <i>TM1637 display not found on CLK=…</i>. Read them — they are written as hints.</p>
${note('<b>Remember:</b> Run = power on, Stop = power off · you edit only while it is stopped · red wire = power, black = GND · the five holes of a half column are one connection · the Pinout tab shows live pin states · too much current or voltage burns a part until the next Run.')}
${tryIt('<b>Exercises.</b> (1) Add an LED, wire it from GPIO17 straight to GND <i>without</i> a resistor and press Run for ten seconds — read the warning, then fix it with a 330 Ω resistor. (2) Find out in the Pinout tab which colour GPIO17 has when <code>led.on()</code> runs.')}`,
    },
  ],
};
