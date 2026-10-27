import * as A from '../art.js';
import * as S from './art-steps.js';
import { note, tip, warn, tryIt, steps, ul, table } from '../helpers.js';
import { stepLab } from './kit.js';

export default {
  id: 'st-start', no: 1, title: 'Before you start', icon: 'rocket',
  blurb: 'What a PLC is, how to use this part, opening a lab, Simulate · Operate · Wire, and your first program.',
  sections: [
    {
      id: 'why', title: 'Why this part',
      html: `
<p>The Delta manuals are thick, full of tables and hard to start with. This part goes the other way: <b>every chapter adds one small new thing</b>, and every step has a lab that opens with one tap and runs at once.</p>
${ul(
  '<b>Steps 1–7</b>: the ladder basics — button, lamp, latch, SET / RST, timer, counter.',
  '<b>Steps 8–9</b>: running a VFD (Delta MS300) through wires on its MI1 / MI2 terminals.',
  '<b>Steps 10–12</b>: Modbus RTU — start / stop, forward / reverse and speed over one RS-485 cable.',
  '<b>Steps 13–15</b>: analog input — temperature and pressure (0–10 V, 4–20 mA) with the DVP04AD-E2 module.',
  '<b>Step 16</b>: the final project — speed from a pot, direction from buttons, everything over Modbus.')}
<p>Each step builds on the one before, so read them <b>in order</b> and run every lab yourself. Inside every lab, the <b>Guide</b> button (top of the Lab screen) walks you through it step by step — parts, wiring, every rung, how to test it and what to do when it does not work — and the <b>Tasks</b> button lists small jobs that tick themselves off when you do them.</p>
${note('All the step labs together: <b>PLC Lab</b> page → <b>Step by step</b> tab. Every chapter here also has "Open the lab of step n" buttons.')}`,
    },
    {
      id: 'plc', title: 'What a PLC is — in one minute',
      html: `
<p>A <b>PLC</b> (Programmable Logic Controller) is a small, rugged computer made for factories. It does three things:</p>
${S.plcIdea()}
${steps(
  '<b>Look at the inputs</b> — is a button pressed, does a sensor see something? Inputs are called <code>X0, X1 … X7</code>.',
  '<b>Decide by its program</b> — "START pressed → motor on, STOP pressed → motor off". The program is drawn as a <b>ladder</b>.',
  '<b>Drive the outputs</b> — close relays that switch lamps, contactors and VFDs. Outputs are called <code>Y0, Y1 … Y7</code>.')}
<p>The PLC in these labs is the <b>Delta DVP16ES2</b>: 8 inputs (X0–X7), 8 relay outputs (Y0–Y7), RS-232 (COM1), RS-485 (COM2) and a USB port. The <b>DVP04AD-E2</b> analog module can be clipped onto its right side (chapter 6).</p>
${table(['Name', 'What it is', 'Example'], [
  ['<code>X</code>', 'input (comes in from outside)', 'X0 = START button'],
  ['<code>Y</code>', 'output (goes out)', 'Y0 = motor contactor'],
  ['<code>M</code>', 'internal bit (a note in the PLC\'s memory, no wire outside)', 'M0 = "the motor is running"'],
  ['<code>T</code>', 'timer', 'T0 K50 = 5 seconds'],
  ['<code>C</code>', 'counter', 'C0 K5 = count to 5'],
  ['<code>D</code>', 'data register (holds a number, −32768 … 32767)', 'D10 = speed 3000 (30.00 Hz)'],
  ['<code>K</code> / <code>H</code>', 'constants: K = decimal, H = hexadecimal', 'K50, H12'],
])}`,
    },
    {
      id: 'scan', title: 'The scan: how a PLC runs its program',
      html: `
${S.scanSteps()}
<p>A PLC does not run its program once and stop. Very fast (about once a millisecond) it repeats the same three jobs: <b>read the inputs → run every rung from top to bottom → write the outputs</b>. This is the <b>scan</b>.</p>
${note('If the same output (for example <code>OUT Y0</code>) is written in two rungs, <b>the lower rung wins</b> — it runs later. So use <code>OUT</code> for an output only once.')}`,
    },
    {
      id: 'lab', title: 'Opening and running a lab',
      html: `
${steps(
  'Home page <b>☰ menu</b> → <b>Delta PLC Lab</b>, then open <b>Step 01</b> from the <b>Step by step</b> tab.',
  'Tap <b>Guide</b> at the top of the Lab screen — it explains this lab step by step.',
  'Press the green <b>Simulate</b> button — the panel gets power and the PLC goes to <b>RUN</b>.',
  'Choose <b>Operate</b> at the top left. Now you can press the buttons in the picture with your finger.',
  'Hold the button — the lamp lights. Let go — it goes out.',
  'Open the <b>Ladder</b> tab at the bottom: there is the program. While it runs, the path the power takes is drawn <b>green</b>.')}
${A.tour()}
${table(['Button / tab', 'What it does'], [
  ['<b>Simulate / Stop</b>', 'power for the panel on / off'],
  ['<b>Guide</b>', 'the step-by-step guide of this lab'],
  ['<b>Tasks</b>', 'small jobs that tick themselves off'],
  ['<b>Operate</b>', 'press buttons, turn selectors, touch the HMI'],
  ['<b>Wire</b>', 'draw wires: tap one terminal, then the other'],
  ['<b>2D / 3D</b>', 'the simple schematic (2D) or the real panel (3D)'],
  ['<b>Ladder</b>', 'write the program and <b>Download</b> it'],
  ['<b>VFD</b>', 'the drive\'s keypad and parameters'],
  ['<b>Monitor</b>', 'live values of X, Y, M, D; the COM2 log'],
])}
${tip('Without the <b>USB cable</b> between the laptop and the PLC there is no Download. In a new project add the laptop and wire its USB to the PLC\'s USB.')}
${stepLab('step-01-button-lamp', 1)}`,
    },
    {
      id: 'download', title: 'Changing the program and Download',
      html: `
<p>What you write in the Ladder tab lives on the laptop. To send it to the PLC press <b>Download</b> — just like in the real ISPSoft.</p>
${steps(
  'In the Ladder tab tap a contact or coil and change its address (for example <code>X0</code> → <code>X1</code>).',
  '<b>0 errors</b> at the bottom means the program is fine. A mistake is underlined red with the reason.',
  'Press <b>Download</b> → the PLC goes to STOP, takes the new program and goes back to <b>RUN</b>.',
  'Go to Operate mode and test it.')}
${warn('Without Download the PLC keeps running the old program. "I changed it, why does nothing happen?" — almost always this is the reason.')}
${tryIt('In step 1 change <code>OUT Y0</code> to <code>OUT Y1</code> and Download. Which lamp lights? (None — nothing is wired to Y1. Wire it: Y1 → a new lamp\'s X1, the lamp\'s X2 → −V.)')}`,
    },
    {
      id: 'wiring', title: 'Wiring inputs and outputs',
      html: `
${A.ioWiring()}
${ul(
  '<b>Input</b>: 24 V supply <code>+V</code> → button <code>13</code>, button <code>14</code> → PLC <code>X0</code>. PLC <code>S/S</code> → supply <code>−V</code>. Press the button and 24 V reaches X0 → X0 is ON.',
  '<b>Output</b>: PLC <code>C0</code> (relay common) → <code>+V</code>. <code>Y0</code> → lamp <code>X1</code>, lamp <code>X2</code> → <code>−V</code>. When Y0 is ON the relay closes and the lamp gets 24 V.',
  'The DVP16ES2 outputs are in two groups: <code>C0</code> = Y0–Y3, <code>C1</code> = Y4–Y7. Each group can switch a different circuit (for example C1 → the VFD\'s DCM).')}
${note('The ⚠ button in the Lab (<b>Check the lab</b>) finds wrong wiring and says what is wrong: "230 V on a 24 V lamp!", "the PLC has no power", "COM2 time-out" and so on.')}`,
    },
  ],
};
