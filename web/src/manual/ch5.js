import * as A from './art.js';
import { ladder, par } from './ladder.js';
import { note, tip, warn, tryIt, steps, ul, table, open } from './helpers.js';

export default {
  id: 'hmi', no: 5, title: 'Designing an HMI', icon: 'screen',
  blurb: 'The DOP-107 touch panel: link it to the PLC, build screens step by step, all object types.',
  sections: [
    {
      id: 'what', title: 'What an HMI is',
      html: `
<p>An <b>HMI</b> (Human-Machine Interface) is the touch screen on a machine: the operator starts and stops, changes set values and reads what the machine is doing — without opening the cabinet. The lab has a <b>Delta DOP-107BV</b>, a 7-inch, 800 × 480 pixel panel.</p>
${A.hmiFlow()}
<p>The key idea: <b>the HMI has no program of its own.</b> Every button, lamp and number on the screen is <i>linked to a PLC device</i>. A button writes a bit (for example <code>M10</code>); a number display reads a register (<code>D20</code>). The PLC program does the real work — the HMI is a window onto the PLC memory.</p>
${ul(
  'Link: HMI <code>COM1</code> (RS-232) → PLC <code>COM1</code>, 9600 bps, 7 data bits, even parity, 1 stop bit (7E1), PLC station 1 — the PLC default, so you do not need to change anything in the PLC. (The HMI can also use COM2 RS-485: choose it in the HMI\'s device settings.)',
  'Power: 24 V DC from the supply (<code>+</code> → +V2, <code>−</code> → −V2). Without power the screen shows <i>"The HMI has no 24 V power"</i>.',
  'The HMI tab shows <b>● online</b> when the PLC answers, or the reason when it does not.')}`,
    },
    {
      id: 'tab', title: 'The HMI tab: Operate and Design',
      html: `
${ul(
  '<b>Operate</b>: the live screen. Touch it like the real panel (needs Simulate). The screen chips (<i>1 · Drive</i>, <i>2 · Alarms</i> …) switch screens.',
  '<b>Design</b>: edit the screens. Tools: <b>＋ Object</b>, <b>Edit</b> (properties of the selected object), <b>Duplicate</b>, <b>Delete</b> and <b>⚙ Screen settings</b> (rename, start screen, background colour, add / delete screen).',
  '<b>Zoom</b>: use two fingers to pinch the panel bigger or smaller (and drag it); the ＋ − and fit buttons in the bar do the same. Handy on a small phone — a 800 × 480 screen is small when it shares the display with another screen.',
  'You can design with the simulation <b>stopped</b>; run it to test.')}
${note('In 3D the HMI also works: in Operate mode touch the screen of the panel directly. A long press (about 1 second) in the top-left corner of the HMI opens its system menu (brightness, clear alarms).')}`,
    },
    {
      id: 'first', title: 'Tutorial: your first HMI screen',
      html: `
<p>We build a motor panel. The PLC program is the familiar start / stop circuit, extended with two HMI bits: <code>M10</code> = HMI START, <code>M11</code> = HMI STOP.</p>
${ladder([
  { note: 'Run latch: the START button X0 or the HMI START M10; STOP button X1 (NC) and the HMI STOP M11', net: [par(['X0|START button'], ['M10|HMI START'], ['M0']), 'X1|STOP', '/M11|HMI STOP'], out: 'OUT M0' },
  { note: 'Motor output', net: ['M0'], out: 'OUT Y0' },
  { note: 'Speed set from the HMI (D10, 0.01 Hz) is copied for the display', net: ['M1000'], out: 'MOV D10 D20' },
], 'M10 and M11 only exist in the PLC memory; the HMI buttons switch them.')}
${A.hmiPanel()}
${steps(
  'Open the <b>HMI</b> tab and switch to <b>Design</b>. A new lab has one empty screen called <i>Main</i>.',
  'Tap <b>＋ Object</b> and choose <b>Static text</b>. Edit its text to <code>MOTOR 1</code>, size 24. Drag it to the top.',
  '<b>＋ Object → Button</b>: text <code>START</code>, bit device <code>M10</code>, action <b>Momentary</b>, colour green. Type the address in the field or tap one of the suggested chips (the addresses already used in your ladder).',
  'Add a second <b>Button</b>: <code>STOP</code>, <code>M11</code>, Momentary, red.',
  '<b>＋ Object → Indicator lamp</b>: bit <code>Y0</code>, text <code>RUN</code>.',
  '<b>＋ Object → Numeric display</b>: word device <code>D20</code>, decimals <b>2</b>, unit <code>Hz</code>.',
  '<b>＋ Object → Numeric input</b>: word <code>D10</code>, decimals <b>2</b>, unit <code>Hz</code>, minimum 0, maximum 50.',
  'Drag objects into place (they snap to a 10 px grid); drag the corner handle to resize. Tap a selected object again to edit it.',
  'Switch to <b>Operate</b>, press <b>Simulate</b>, touch START: the lamp lights. Touch the input field: a keypad opens — type <code>30</code> <b>ENT</b> and the number display shows 30.00.')}
${tip('<b>Decimals</b> only change how a value is <i>displayed</i>. The PLC holds whole numbers: with 2 decimals, the number 3000 is shown as 30.00 and typing 30.00 writes 3000.')}`,
    },
    {
      id: 'objects', title: 'All the objects',
      html: `
<p>The designer offers 21 object types. Each needs a <b>bit</b> (X, Y, M, S, T, C) or a <b>word</b> (D, T, C) device; the editor checks the address as you type.</p>
${table(['Object', 'Device', 'What it does'], [
  ['<b>Button</b>', 'bit', 'Writes a bit. Actions: <i>Momentary</i> (ON while pressed), <i>Toggle</i> (flips on each touch), <i>Set ON</i>, <i>Reset OFF</i>. Colour choices.'],
  ['<b>Indicator lamp</b>', 'bit', 'Shows a bit: ON colour, OFF colour, round or rectangular, with text.'],
  ['<b>Numeric display</b>', 'word', 'Shows a register with a label, decimals and unit.'],
  ['<b>Numeric input</b>', 'word', 'Opens a keypad; the entered value is written to the register (min / max in display units).'],
  ['<b>Meter</b>', 'word', 'Analog gauge between a minimum and a maximum.'],
  ['<b>Bar graph</b>', 'word', 'Vertical bar for a level.'],
  ['<b>Tank / level</b>', 'word', 'A tank with liquid; colour and range.'],
  ['<b>Trend graph</b>', 'word (+ word 2)', 'A live chart of up to two registers; choose the time span in seconds.'],
  ['<b>Static text</b>', '—', 'A label: size, colour, alignment, bold.'],
  ['<b>Panel / frame</b>', '—', 'A background rectangle with a title to group objects.'],
  ['<b>Date / time</b>', '—', 'The HMI clock (date, time or both).'],
  ['<b>Screen button</b>', '—', 'Jumps to another screen — build menus.'],
  ['<b>Motor / fan</b>', 'bit', 'An animated fan that turns while the bit is ON.'],
  ['<b>Pipe (flow)</b>', 'bit', 'A pipe with flowing liquid while the bit is ON.'],
  ['<b>Valve</b>', 'bit', 'A valve symbol: green when open.'],
  ['<b>Multi-state indicator</b>', 'word or bit', 'Text and colour for each value: <code>0:STOPPED:#475569|1:RUNNING:#22c55e|2:FAULT:#ef4444</code>.'],
  ['<b>Set value ( ± ) button</b>', 'word', 'Adds, subtracts or writes a constant to a register (a step, a minimum, a maximum).'],
  ['<b>Slider</b>', 'word', 'Drag to set a register between min and max.'],
  ['<b>Selector switch</b>', 'bit', 'Two-position switch (for example MAN / AUTO) that writes a bit.'],
  ['<b>Alarm banner</b>', 'bit', 'A flashing banner while the bit is ON; each alarm is logged.'],
  ['<b>Alarm history</b>', '—', 'A time-stamped list of alarms; tap it to acknowledge.'],
])}
<h3>Properties you meet again and again</h3>
${ul(
  '<b>Bit device / word device</b>: the PLC address. Tap a suggested chip to use an address you already have in the ladder; comments you wrote for devices are shown under the field.',
  '<b>Position &amp; size</b> (X, Y, W, H in pixels) at the bottom of the property sheet, for exact placement.',
  '<b>Colours</b> are chosen from a palette; dark backgrounds with bright objects are easiest to read.')}`,
    },
    {
      id: 'screens', title: 'Several screens, alarms and recipes',
      html: `
${ul(
  '<b>Add a screen</b> with the ＋ chip (Design) or ⚙ → <i>Add screen</i>. <b>Screen button</b> objects jump between screens; always give the user a way back.',
  '<b>Start screen</b>: ⚙ → <i>Make start screen</i> chooses what shows when the HMI boots.',
  '<b>Alarms</b>: put an <i>Alarm banner</i> for each fault bit (for example <code>M1129</code> = COM2 time-out), and one <i>Alarm history</i> on an Alarms screen.',
  '<b>Recipes</b>: buttons with the action <i>Momentary</i> set bits <code>M30, M31 …</code>; the PLC copies the matching numbers into the registers. See the oven line example.')}
${A.hmiLayout()}
<h3>Layout rules that make a good panel</h3>
${ul(
  'Use a <b>header band</b> with the machine name and a screen button.',
  'Keep touch objects <b>at least 60 px</b> high — fingers are bigger than mouse pointers.',
  'Use <b>colour consistently</b>: green = start / OK, red = stop / alarm, yellow = warning, blue = settings.',
  'Group related objects with a <b>panel / frame</b> and a title.',
  'Show <b>units</b> (Hz, °C, A) and decimals that match the sensor.',
  'Never put a dangerous action (like a motor start) on a button that can be hit by accident — keep space around it.')}
${open('part-counter', 'Open: Part counter with sensor + HMI')}
${open('modbus-network', 'Open: Modbus network (two-screen HMI)')}`,
    },
    {
      id: 'trouble', title: 'The HMI does not work — checklist',
      html: `
${table(['What you see', 'Check'], [
  ['"The HMI is off"', 'Press Simulate.'],
  ['"The HMI has no 24 V power"', 'Wire HMI <code>+</code> and <code>−</code> to the 24 V supply.'],
  ['<b>● no response</b> in the info bar', 'The cable HMI COM1 → PLC COM1 is missing, the PLC is in STOP / unpowered, or the station number is wrong.'],
  ['Buttons do nothing', 'The bit address is wrong (X and Y are octal!), or the ladder does not use that bit.'],
  ['The number is 10 times too big or small', 'The decimals do not match the unit of the register (the PLC holds 0.1 °C as 315).'],
  ['A screen is empty in Operate', 'Objects are outside the 800 × 480 area, or the screen chip shows another screen.'],
])}
${tryIt('In the HMI tab tap <b>Design</b>, select an object and tap it once more: its property sheet opens. Change a colour and a device address, then check the effect in Operate.')}`,
    },
  ],
};
