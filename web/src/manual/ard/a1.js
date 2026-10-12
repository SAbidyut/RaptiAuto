import * as A from './art-ard.js';
import { allDefs } from '../../components/index.js';
import { EXAMPLES } from '../../examples/index.js';
import { note, tip, warn, tryIt, steps, ul, table, openArd, k } from '../helpers.js';

const BOARDS = allDefs().filter((d) => d.board).length;
const PARTS = allDefs().filter((d) => !d.board && !d.hidden).length;
const hero = (figure, text) => `<div class="mx-ard-hero">${figure}<p class="mx-ard-promise">${text}</p></div>`;

export default {
  id: 'ard-start', no: 'A1', title: 'Getting started with the Arduino lab', icon: 'sparkles',
  blurb: 'What the lab is, how to start a project, the screen tab by tab, two screens at once, full screen, saving and sharing.',
  sections: [
    {
      id: 'what', title: 'What the Arduino lab is',
      html: `
${hero(A.heroArd(), 'In this chapter you meet the lab. In ten minutes you will know every button on the screen, and you will have a first LED blinking.')}
<p>The <b>Arduino lab</b> is a small electronics bench on your phone. You build a circuit with real-looking parts, write the program (a <b>sketch</b>) and press <b>Run</b>. The LEDs glow, the motors turn and the Serial Monitor prints — with no wires to buy and nothing that can really burn.</p>
${ul(
  `<b>${BOARDS} boards</b>: Arduino Uno R3, Uno R4 Minima, Uno R4 WiFi, Leonardo, Nano, Mega 2560, ESP32, NodeMCU ESP8266, STM32 Blue Pill and ATtiny85.`,
  `<b>${PARTS} parts</b>: breadboards, resistors, LEDs, buttons, potentiometers, sensors, displays, motors, relays, ICs, batteries and meters.`,
  '<b>Arduino C++</b>: the same language and the same libraries (Servo, LiquidCrystal, DHT, WiFi …) you use on a real board.',
  '<b>Real electronics</b>: Ohm\'s law is simulated. A wrong wire does nothing; an LED without a resistor really burns out.',
  `<b>${EXAMPLES.length} ready-made examples</b> that open with one tap.`)}
${A.cycle()}
<p>Every project in this manual follows the loop above: <b>wire</b> the parts, <b>code</b> the sketch, <b>run</b> it, <b>watch</b> what happens — and when it is wrong, stop, change and run again. Mistakes are free here. That is the point.</p>
${tip('You do not have to read this manual in order. Chapter <b>A5</b> and <b>A6</b> are step-by-step projects: pick one, open its example and follow the pictures.')}`,
    },
    {
      id: 'open', title: 'Opening or creating a project',
      html: `
${A.homeFlow()}
${steps(
  'Open the <b>☰ menu</b> (top left of the Home page) and tap <b>New Project</b> — or tap the big <b>New Project</b> button on the Home page.',
  'A list of boards opens (<b>Choose a board</b>). <b>Arduino Uno R3</b> is the best board to start with.',
  'The editor opens with the board alone on the canvas and a short hint. Tap <b>＋</b> to add parts (chapter A2).')}
<p>Another way: tap <b>Examples</b>. An example is <b>copied</b> into <b>My projects</b> when you open it, so you can change it as much as you like — the original stays untouched.</p>
${A.examplesPage()}
${table(['Where', 'What you find'], [
  ['<b>Home</b>', 'New Project and Examples, your recent projects (or a few examples to start with), and tiles for the Manual and the Guide.'],
  ['<b>My Projects</b>', 'Everything you saved on this phone. Tap one to continue; the <b>⋮</b> on a card renames, duplicates, exports, shares or deletes it.'],
  ['<b>Examples</b>', `All ${EXAMPLES.length} Arduino examples in seven groups (Basics, Sensors, Displays, Motors, IoT &amp; Wi-Fi, Electrical, Master–Slave) with one search box.`],
  ['<b>Boards</b> / <b>Components</b>', 'Pictures and pin names of every board and part, with the examples that use them.'],
  ['<b>Open / import file</b>', 'Loads a <code>.rapti</code> project, or a plain <code>.ino</code> / <code>.txt</code> sketch (it becomes a new Uno project).'],
])}
${tryIt('Open the <b>Blink</b> example now and press <b>Run</b>. The small LED marked <b>L</b> on the board blinks once a second.')}
${openArd('blink', 'Open: Blink')}`,
    },
    {
      id: 'tour', title: 'The screen, tab by tab',
      html: `
${A.editorTour()}
${ul(
  '<b>1 · Back</b> saves the project and returns to the Home page.',
  '<b>2 · Name and board</b>. Tap the name to rename the project. Tap the board name for the <b>board data</b>: processor, clock, logic voltage, memory, serial ports, PWM pins and the I²C pins.',
  '<b>3 · Run / Stop</b> compiles the sketch and starts the simulation (next section).',
  '<b>4 · ⋮ menu</b>: Save, Rename, Export, Share, Board info, wire style, grid and Clear circuit.',
  '<b>5 · Side tools</b>: Undo, Redo, <b>Select</b> (box), Zoom in, Zoom out, <b>Fit to screen</b> and <b>Full screen</b>. While the simulation runs, Undo and Redo hide.',
  '<b>6 · ＋</b> opens the parts library. When you select something, the ＋ is replaced by that thing\'s action bar.',
  '<b>7 · Tabs</b>: <b>Circuit</b>, <b>Code</b>, <b>Serial</b> and — only when the circuit has a board with Wi-Fi — <b>IoT</b>.',
  '<b>8 · Canvas</b>: drag the empty background to move around, pinch with two fingers to zoom.')}
${A.fourTabs()}
${table(['Tab', 'What it is for', 'Details'], [
  ['<b>Circuit</b>', 'Put parts on the canvas, wire them, and play with them while the sketch runs.', 'chapter A2'],
  ['<b>Code</b>', 'The sketch. A symbol bar sits above the keyboard (<code>{ } ( ) ; = &lt; &gt;</code> …); <b>A−</b> / <b>A+</b> change the text size, the magnifier searches, and the code view has its own full-screen button. Typing shows suggestions for Arduino functions and libraries.', 'chapter A3'],
  ['<b>Serial</b>', 'Everything your sketch prints with <code>Serial.print()</code>, a box to send text to it, and a <b>Plotter</b> that draws graphs.', 'chapter A7'],
  ['<b>IoT</b>', 'The phone browser on the simulated Wi-Fi: it opens the web pages of your ESP32 and the IoT dashboard.', 'chapter A8'],
])}
${note('A project with <b>several boards</b> (for example a master and a slave) shows one tab per board at the top of the Code screen, each with its own sketch (chapter A8).')}`,
    },
    {
      id: 'run', title: 'Run, Stop and the status bar',
      html: `
${A.runStates()}
${steps(
  'Press <b>Run</b>. The app compiles your sketch. If something is wrong, the Code tab opens with the line marked in red (chapter A3).',
  'The button turns red and says <b>Stop</b>. A green status bar shows the <b>simulated time</b>, the <b>speed</b> and — when the app has something to tell you — a <b>⚠ pill</b> with the number of messages (tap it to read them).',
  'Play with the circuit: press buttons, turn potentiometers, flip switches. <b>Tap a sensor</b> (distance, temperature, motion, gas …) to open its sliders and change what it measures.',
  'Press <b>Stop</b> to end the run. Parts that burnt out are replaced by fresh ones the next time you Run.')}
${ul(
  '<b>Stop to edit the circuit.</b> Adding, moving, wiring and deleting only work while stopped; a toast says so. If you change the circuit while it runs, a banner appears — tap it to restart.',
  '<b>Code can be edited while it runs</b>, but it only takes effect on the next Run (the banner says <i>Code changed — restart to apply</i>).',
  '<b>Speed</b> is how close to real time the phone keeps up. 100 % is perfect; under 70 % the number turns amber (a very busy sketch or a slow phone).',
  '<b>Current flow</b>: with <i>Show current flow</i> on (⋮ menu or Settings) little dots run along the wires that carry current.')}
${warn('<b>Do not wait for the app to guess.</b> If a part does nothing, read the ⚠ messages and the Serial Monitor first — they usually name the pin and the problem.')}`,
    },
    {
      id: 'two', title: 'Two screens at once, and full screen',
      html: `
${A.twoPaneArd()}
<p>When the phone is held <b>sideways</b> (or on a tablet) there is room for two screens. By default the editor shows <b>Circuit and Code side by side</b> (Settings → <i>Side by side in landscape</i>). The tab bar then works like a set of switches:</p>
${ul(
  'Tap a tab that is <b>not open</b> → it opens <b>beside</b> the screen you are looking at.',
  'Tap an <b>open</b> tab again → it <b>closes</b>. The last screen cannot be closed.',
  'Two screens are open and you tap a third tab → the <b>second</b> screen is replaced; the first stays.',
  'The open screens are highlighted in the tab bar.')}
${tip('Good working layouts: <b>Circuit + Code</b> while you build; <b>Circuit + Serial</b> while you test.')}
${A.fullScreenFig()}
<p><b>Full screen</b> (the ⛶ tool in the side bar, or the button above the code) hides every bar, so the circuit or the code gets the whole display. The round <b>☰</b> button is your way back to the menus:</p>
${steps(
  'Tap <b>☰</b>. It turns into <b>✕</b> and a bar opens next to it: <i>exit full screen</i>, <i>Run / Stop</i>, and the <i>Circuit</i>, <i>Code</i>, <i>Serial</i> and <i>IoT</i> screens.',
  '<b>Drag</b> the ☰ button (or the empty edge of the bar) to any place on the screen. The app remembers the place. The bar always opens on the side where it fits.',
  'Tap <b>✕</b> to hide the bar again, or <b>Back</b> (the phone\'s Back button) to leave full screen.')}
<p>In full screen, one screen is shown at a time. But when you Run a sketch that uses <code>Serial</code>, the <b>circuit and the Serial Monitor appear together</b> (side by side in landscape, one above the other in portrait) and go back to one screen when you Stop. Settings → <i>Side by side in full screen</i> makes two screens the normal in full screen as well.</p>`,
    },
    {
      id: 'save', title: 'Saving, exporting and sharing',
      html: `
${A.menuShot()}
${ul(
  '<b>Auto-save</b>: the project saves itself a moment after every change and when you leave. <b>Save</b> in the ⋮ menu does it at once. Projects live on this phone; if its storage is full, the app says so.',
  '<b>Undo / Redo</b> remember the last 80 changes of parts and wires (not of the code — the code editor has its own undo and redo buttons in the symbol bar).',
  '<b>Rename</b>: tap the project name at the top.',
  '<b>Export project (.rapti)</b> saves parts, wires and code in one file — to send to a friend or keep as a backup. Open it again with <b>Open / import file</b>.',
  '<b>Export sketch (.ino)</b> saves only the code, so you can open it in the Arduino IDE. <b>Share code</b> sends the code as text to any app.',
  '<b>Board info</b> shows the data sheet of the board (also by tapping the board name).',
  '<b>Clear circuit (keep board)</b> removes every part and wire except the board — after a confirmation.')}
${note('Opening an example never changes the example. Every time you open one, you get a fresh copy in <b>My projects</b>.')}`,
    },
    {
      id: 'first', title: 'Your first five minutes',
      html: `
${steps(
  'Open the <b>Blink</b> example (button below).',
  'Press <b>Run</b>. Watch the small <b>L</b> LED next to pin 13 on the board blink.',
  'Open the <b>Code</b> tab. Change both <code>delay(1000)</code> to <code>delay(200)</code>.',
  'Press <b>Stop</b>, then <b>Run</b>. It blinks five times faster.',
  'Open <b>Serial</b>: nothing printed — this sketch has no <code>Serial.println()</code>. Add one line, run again, and see the text appear.')}
${openArd('blink', 'Open: Blink')}
${note(`<b>Remember</b><br>• New Project → pick a board → ＋ parts → wire → Code → <b>Run</b>.<br>• Stop to edit the circuit; code changes apply at the next Run.<br>• Landscape: tap a tab to open or close a second screen. Full screen: the round ☰ is the way back.<br>• The ⚠ pill and the Serial Monitor are your first helpers.`)}
${tryIt('Open the <b>Traffic Light</b> example. Without reading the code, change the red light time from 3 seconds to 5 seconds. Which tab do you need?')}`,
    },
  ],
};
void k;
