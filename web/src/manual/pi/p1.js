import * as A from './art-pi.js';
import { note, tip, warn, tryIt, steps, ul, table, code, openPi, k } from '../helpers.js';

export default {
  id: 'pi-start', no: 'P1', title: 'Getting started with the Raspberry Pi Lab', icon: 'cpu',
  blurb: 'What the lab is, the boards, a new project, the five tabs, two screens at once, full screen, saving.',
  sections: [
    {
      id: 'what', title: 'What the Raspberry Pi Lab is',
      html: `
${A.heroStart()}
<p>The <b>Raspberry Pi Lab</b> is a Raspberry Pi in your pocket. You wire a circuit on a breadboard, write <b>Python</b>, press <b>Run</b> — and the LEDs light, the buzzer sounds and the display shows your text. Nothing can break and nothing has to be bought.</p>
<p>The lab has four big parts:</p>
${ul(
  '<b>The circuit</b> — a canvas with a Pi (or Pico), a breadboard, LEDs, buttons, sensors, motors and displays. The same parts and the same circuit solver as the Arduino editor.',
  '<b>Python</b> — a real MicroPython engine runs your programs. The libraries you meet in books and videos work: <code>gpiozero</code>, <code>RPi.GPIO</code>, and on a Pico <code>machine</code>.',
  '<b>The Pi OS desktop</b> — menu, File Manager, Text Editor, Chromium, Terminal and Thonny, in the style of Raspberry Pi OS (Bookworm).',
  '<b>Examples</b> — dozens of ready programs that build their own circuit, from blinking an LED to an IoT weather display.')}
${note('A few things are <b>not</b> simulated: a real Linux kernel, real <code>apt</code> / <code>pip</code> installs, the camera, PIO programs and CPython-only libraries such as numpy or OpenCV. Everything you need to learn GPIO, sensors and displays is there.')}`,
    },
    {
      id: 'boards', title: 'Pi 5, Pi 4 and the Pico family',
      html: `
${A.boardFamily()}
<p>There are two kinds of board, and they feel different:</p>
${table(['', 'Raspberry Pi 5 · Pi 4', 'Raspberry Pi Pico family'], [
  ['What it is', 'A small computer with an operating system', 'A microcontroller: one program, no operating system'],
  ['Language', 'Python 3 programs', 'MicroPython'],
  ['Libraries', '<code>gpiozero</code>, <code>RPi.GPIO</code>, many more', '<code>machine</code>, <code>rp2</code>, <code>neopixel</code> …'],
  ['Screens (tabs)', 'Circuit · Pinout · Desktop · Thonny · Output', 'Circuit · Pinout · Thonny · Output'],
  ['Pins', '40-pin header, BCM numbers (GPIO17)', '40 pins, GP numbers (GP15)'],
  ['Your files', '<code>/home/pi</code> (the "SD card")', 'the Pico\'s flash: <code>/main.py</code>'],
])}
<p>Pico <b>W</b> and Pico 2 <b>W</b> add Wi-Fi (simulated, with the <code>network</code> library); Pico 2 and Pico 2 W have the newer RP2350 chip. For learning GPIO the four Picos behave the same.</p>
${tip('Start with the <b>Pi 5</b>: it has the desktop and the Terminal, so you see all of the lab. Switch to a Pico when you want to learn MicroPython.')}`,
    },
    {
      id: 'new', title: 'Your first project',
      html: `
${A.newProjectFlow()}
${steps(
  'Open the <b>Raspberry Pi</b> tile on the Home page (or <b>☰ ▸ Raspberry Pi Lab</b>).',
  'Tap <b>＋ New project</b>.',
  'Choose a board in the list <i>New Raspberry Pi project</i>.',
  'The lab opens on the <b>Circuit</b> tab with the board alone on the canvas, and a new file <code>project1.py</code> is ready in Thonny.',
  'Tap <b>＋</b> to add parts, wire them (chapter P3), write the program in Thonny (chapter P4) and press <b>Run</b>.')}
<p>The new file already holds a small program (a blinking LED on GPIO17 for a Pi, on GP15 for a Pico) so you can see the lab work at once. Every new project is called <code>project1.py</code>, <code>project2.py</code> … — the lab takes the next free number.</p>
<p><b>My workspace</b> on the Pi Lab page takes you back to where you stopped: the last board, its circuit and its files.</p>
<h3>Starting from an example</h3>
<p>Below <b>New project</b> the page lists <b>Examples</b> with a search box and filters: <i>All · Pi 4 / 5 · Pico · IoT · Displays · Breadboard</i>. An example opens with its circuit already built; just press <b>Run</b>.</p>
${openPi('blink.py', 'Open: Blink an LED')}
${tryIt('Open the blink example, press <b>Run</b>, then tap <b>Stop</b>. You have just run your first Pi program.')}`,
    },
    {
      id: 'tour', title: 'The screen, tab by tab',
      html: `
${A.screenTour()}
${ul(
  '<b>1 · Back, title, board chip.</b> The chip shows the board; tap it to choose another one. The dot next to the title lights up while a program runs.',
  '<b>2 · Run / Stop.</b> Run powers the circuit and runs the file shown in the file chip. While it runs the button is red and says Stop.',
  '<b>3 · ⋮ menu.</b> Change board · Full screen · Mute the buzzer · Default circuit · Clear the circuit (keep the board) · Reset the SD card (Pico: Erase the flash) · About the simulator.',
  '<b>4 · File chip.</b> The Python file that Run starts. Tap it to pick another file or to open it in Thonny.',
  '<b>5 · Tool rail.</b> Undo · Redo · Select (box) · Zoom in · Zoom out · Fit · Full screen.',
  '<b>6 · Canvas.</b> The board, your parts and wires. Drag to move the view, pinch to zoom.',
  '<b>7 · ＋ button.</b> The parts library.',
  '<b>8 · Tabs.</b> The five screens of the lab.')}
${A.fiveTabs()}
${table(['Tab', 'What it is for', 'Chapter'], [
  ['<b>Circuit</b>', 'Add parts, draw wires, power the circuit on and off', 'P3'],
  ['<b>Pinout</b>', 'The board with the live state of every pin; tap a pin for its details', 'P2, P3'],
  ['<b>Desktop</b>', 'Pi OS: menu, File Manager, Text Editor, Chromium, Terminal (Pi 5 / Pi 4 only)', 'P7'],
  ['<b>Thonny</b>', 'The code editor: tabs, Run, Stop, Examples, Files', 'P4'],
  ['<b>Output</b>', 'The Shell: what <code>print()</code> writes, <code>input()</code>, the <code>&gt;&gt;&gt;</code> prompt', 'P4'],
])}
${note('The <b>Back</b> arrow of the phone steps back through the tabs: first out of full screen, then from a wire you are drawing, then to the Circuit tab, and only then out of the lab.')}`,
    },
    {
      id: 'two', title: 'Two screens at once',
      html: `
${A.twoPaneLandscape()}
<p>Hold the phone <b>sideways</b> (or use a tablet) and there is room for two screens. The bottom tabs then work like switches:</p>
${ul(
  'Tap a tab that is closed → it opens <b>beside</b> the screen you have.',
  'Tap an open tab again → it <b>closes</b>. The last screen cannot be closed.',
  'Two screens are open and you tap a third tab → the <b>second</b> screen is swapped, the first stays.',
  '<b>Run</b> opens the <b>Output</b> screen next to your circuit or code, so you can watch the program talk.',
  'The <b>Desktop</b> and the Thonny / Output screens are never shown together: Thonny can only be in one place.')}
<p>Held upright the phone shows one screen at a time. Pressing Run then only shows a short message: <i>Running — the output is on the Output tab</i>.</p>
${tip('A great working layout: <b>Circuit + Thonny</b>. Edit the code on one side, watch the LED on the other, and open <b>Output</b> by pressing Run.')}`,
    },
    {
      id: 'full', title: 'Full screen',
      html: `
${A.fullScreenFig()}
<p>Tap <b>⋮ ▸ Full screen</b> (or the ⛶ tool on the rail) to hide every bar. The circuit, Thonny or the desktop then use the whole display.</p>
${ul(
  'The round <b>☰</b> button is all that is left. Tap it and a small bar opens with <b>exit full screen · Run · Circuit · Thonny · Output · Pinout</b>.',
  'Tap <b>✕</b> (the same button) to close the bar again.',
  '<b>Drag the ☰ button</b> anywhere you like. The lab remembers the spot, and the bar opens on the side where it fits.',
  'The tabs of the bar work like the bottom tabs: in landscape they open and close a second screen.')}
${tip('Full screen is the best way to use the Desktop and the Terminal: you get nearly the whole display for text.')}`,
    },
    {
      id: 'save', title: 'Saving, examples and starting over',
      html: `
${A.savedWhere()}
${ul(
  'The <b>circuit</b> saves itself a moment after every change and when you leave the lab. There is one saved circuit per board.',
  'Your <b>programs</b> are files. <b>Thonny ▸ Save</b> stores them in <code>/home/pi</code> (Pico: in the flash). Pressing <b>Run</b> on a Pi saves a changed file first.',
  'Thonny remembers its <b>open tabs</b>, even text you have not saved yet.',
  'Opening an <b>example</b> copies its file into <code>/home/pi</code> if it is not there yet (the Pico gets an open tab) and builds its circuit. <b>Undo</b> in the Circuit tab brings your old circuit back.')}
<h3>Starting over</h3>
${table(['Menu ⋮ entry', 'What it does'], [
  ['<b>Default circuit</b>', 'Replaces the circuit with the first one the lab shows (a Pi: two LEDs, a button and a buzzer).'],
  ['<b>Clear the circuit (keep the board)</b>', 'Removes every part and wire except the board.'],
  ['<b>Reset the SD card (files)</b>', 'Puts the example files back and removes yours. On a Pico: <b>Erase the Pico flash</b>.'],
])}
${warn('<b>Reset the SD card</b> deletes your own files after a confirmation. Copy a program you want to keep to a safe place first (for example into a note) — or simply do not use this entry.')}
${note('<b>Remember:</b> five tabs (Pico: four) · Run powers the circuit and starts the file · landscape = tap a tab to open or close a second screen · the ☰ button of full screen can be dragged · the circuit saves itself, programs are saved with Thonny.')}
${tryIt('<b>Exercises.</b> (1) Create a new project for a Pico, then switch back to the Pi 5 with the board chip. (2) Open Circuit + Thonny side by side in landscape and press Run. (3) Go to full screen and move the ☰ button to the other corner.')}`,
    },
  ],
};
