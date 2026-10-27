import * as A from '../art.js';
import { ladder, par } from '../ladder.js';
import { note, warn, tryIt, steps, ul, table } from '../helpers.js';
import { stepLab } from './kit.js';

export default {
  id: 'st-vfd', no: 4, title: 'Running a VFD on its terminals', icon: 'motor',
  blurb: 'Steps 8–9: what a VFD is, the keypad, the parameters that matter, MI1 / MI2 / DCM, forward / reverse with an interlock.',
  sections: [
    {
      id: 'what', title: 'What a VFD is',
      html: `
${A.vfdBlocks()}
<p>A <b>VFD</b> (variable frequency drive, inverter) changes the speed of a motor. It turns the 50 Hz of the mains into any frequency (0 – 50 Hz or more) for the motor. For a 4-pole motor <b>rpm ≈ Hz × 28</b> (50 Hz ≈ 1420 rpm, 25 Hz ≈ 710 rpm).</p>
${ul(
  'Input: <code>R/L1</code>, <code>S/L2</code> → 230 V from the MCB.',
  'Output: <code>U/T1</code>, <code>V/T2</code>, <code>W/T3</code> → the motor. Swap any two phases and the motor turns the other way.',
  'Control terminals: <code>MI1 … MI7</code> (command inputs), <code>DCM</code> (their common), <code>AVI</code> / <code>ACI</code> (analog speed), <code>RS-485</code> (Modbus).')}`,
    },
    {
      id: 'params', title: 'The parameters to know first',
      html: `
${A.keypad()}
<p>Whom the drive obeys — the keypad, the wires or Modbus — is set by parameters. Change them in the VFD tab or on the keypad (MODE → group → ENTER).</p>
${table(['Parameter', 'Meaning', 'Steps 8–9', 'Steps 10–16 (Modbus)'], [
  ['<b>00-20</b>', 'where the speed comes from', '0 = keypad', '1 = RS-485'],
  ['<b>00-21</b>', 'where RUN / STOP comes from', '1 = terminals (MI1 / MI2)', '2 = RS-485'],
  ['<b>02-00</b>', 'two-wire control mode', '1 = MI1 FWD, MI2 REV', '—'],
  ['<b>01-12 / 01-13</b>', 'acceleration / deceleration time', '3 s', '4 s'],
  ['<b>09-00</b>', 'Modbus station number', '—', '1'],
  ['<b>09-01 / 09-04</b>', 'baud rate / format', '—', '9.6 kbps / 14 = 8,E,1 RTU'],
])}
${warn('With a wrong parameter the drive silently ignores the command. Check the lab (⚠) says so: "ignores RS-485 RUN/STOP because Pr.00-21 is not 2".')}`,
    },
    {
      id: 's8', title: 'Step 8 · Start the VFD from the PLC (MI1)',
      html: `
${A.vfdTerminals()}
<p>The MS300 inputs work in "sink" mode: <b>when MI1 is joined to DCM</b>, MI1 is ON. That is exactly what a PLC relay output does — when Y4 is ON the contact between Y4 and C1 closes.</p>
${steps(
  'Wiring: PLC <code>C1</code> → VFD <code>DCM</code>, PLC <code>Y4</code> → VFD <code>MI1</code>.',
  'Parameters: 00-21 = 1 (terminals), 00-20 = 0 (speed from the keypad, ▲ ▼).',
  'Program: a START / STOP latch M0, then <code>M0 → OUT Y4</code>.')}
${ladder([
  { note: 'START / STOP latch', net: [par(['X0|START'], ['M0']), 'X1|STOP'], out: 'OUT M0' },
  { note: 'M0 → Y4 → MI1 (FWD)', net: ['M0'], out: 'OUT Y4' },
], 'Relay Y4 = the drive\'s "run" button.')}
${note('Y0–Y3 (group C0) switch 24 V lamps, Y4–Y7 (group C1) the VFD\'s DCM — two separate groups keep the two circuits apart.')}
${stepLab('step-08-vfd-run', 8)}
${tryIt('In the VFD tab press ▲ on the keypad to set 40 Hz. Then set Pr.01-12 to 1 s and see how fast the motor speeds up.')}`,
    },
    {
      id: 's9', title: 'Step 9 · Forward / reverse with an interlock',
      html: `
${ladder([
  { note: 'Forward M0: not while reverse (M1) runs', net: [par(['X0|FWD'], ['M0']), 'X2|STOP', '/M1|interlock'], out: 'OUT M0' },
  { note: 'Reverse M1: not while forward (M0) runs', net: [par(['X1|REV'], ['M1']), 'X2|STOP', '/M0|interlock'], out: 'OUT M1' },
  { note: 'Forward → MI1', net: ['M0'], out: ['OUT Y4', 'OUT Y0'] },
  { note: 'Reverse → MI2', net: ['M1'], out: ['OUT Y5', 'OUT Y1'] },
], 'Interlock: each rung has the other\'s NC contact. The two can never be on together.')}
<p>Why an interlock? Forward and reverse together cause a short circuit in a real reversing starter, and confuse a VFD. So <b>while it runs forward the reverse button does nothing</b> — STOP first.</p>
${stepLab('step-09-vfd-fwd-rev', 9)}
${tryIt('Delete the interlock contacts (<code>/M1</code>, <code>/M0</code>) and Download. Press FWD and REV — Monitor shows M0 and M1 both ON! Think about why that is dangerous.')}`,
    },
  ],
};
