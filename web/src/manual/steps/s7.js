import { ladder, par } from '../ladder.js';
import { note, tip, tryIt, steps, table } from '../helpers.js';
import { stepLab } from './kit.js';

export default {
  id: 'st-final', no: 7, title: 'Final project and reference', icon: 'target',
  blurb: 'Step 16: pot → 04AD → PLC → Modbus → VFD. Exercises to do on your own and every important address on one page.',
  sections: [
    {
      id: 's16', title: 'Step 16 · Everything together',
      html: `
<p>Everything so far in one machine: the operator sets the <b>speed with a pot</b>, the direction with <b>FORWARD / REVERSE / STOP</b>, and the PLC tells the drive everything over <b>one RS-485 cable</b>. It reads the drive\'s real frequency back too.</p>
${ladder([
  { note: 'Forward M0', net: [par(['X0|FORWARD'], ['M0']), 'X2|STOP', '/M1'], out: 'OUT M0' },
  { note: 'Reverse M1', net: [par(['X1|REVERSE'], ['M1']), 'X2|STOP', '/M0'], out: 'OUT M1' },
  { note: 'Pot → D0', net: ['M1000'], out: 'FROM K0 K12 D0 K1' },
  { note: '0 … 32000 → 0 … 1000 %', net: ['M1000'], out: 'DIV D0 K32 D12' },
  { note: '% × 5 → 0 … 5000 (0.01 Hz)', net: ['M1000'], out: 'MUL D12 K5 D14' },
  { note: 'Write the speed', net: ['M1000'], out: 'MODRW K1 K6 H2001 D14 K1' },
], 'The core (the H12 / H22 / H1 command word and 2000H as before).')}
${steps(
  'Open the lab, Simulate.',
  'Press FORWARD — the pot is at 60 %, so the motor runs at 30 Hz.',
  'Tap the pot and drag its slider: 0 % → stops, 100 % → 50 Hz.',
  'STOP, then REVERSE — the other way.',
  'In Monitor put D0 (raw), D12 (%), D14 (set Hz) and D20 (real Hz) side by side.')}
${stepLab('step-16-analog-modbus-speed', 16)}`,
    },
    {
      id: 'practice', title: 'Do it yourself: six exercises',
      html: `
${tryIt('<b>1.</b> In step 3 add a second START button (X2) — the motor can be started from two places. (Hint: X2 in parallel with X0.)')}
${tryIt('<b>2.</b> In step 5 make the lamp flash when the time is up. (Hint: <code>T0 M1013 → OUT Y1</code>.)')}
${tryIt('<b>3.</b> In step 9 make the motor wait 3 seconds after STOP before it may reverse — with a timer. (Hint: T1 K30 after STOP, block REV until T1 is done.)')}
${tryIt('<b>4.</b> In step 12 read the drive\'s fault code (2100H → D22) and light a red lamp on a fault.')}
${tryIt('<b>5.</b> In step 13 sound a buzzer above 70 °C and stop it below 65 °C (hysteresis).')}
${tryIt('<b>6.</b> In step 16 limit the top speed to 40 Hz. (Hint: <code>MUL D12 K4 D14</code>, or <code>D14>K4000 → MOV K4000 D14</code>.)')}
${tip('After every exercise Download and test in Operate mode. Mistakes are fine — Undo is in the Lab menu (⋮), or open the example again.')}`,
    },
    {
      id: 'ref', title: 'Reference on one page',
      html: `
<h3>Addresses</h3>
${table(['', 'Range (DVP16ES2)', 'Job'], [
  ['X', 'X0 – X7 (octal: there is no X8 or X9)', 'inputs'],
  ['Y', 'Y0 – Y7', 'relay outputs (C0: Y0–Y3, C1: Y4–Y7)'],
  ['M', 'M0 – M4095 (M1000 – M1999 special)', 'internal bits'],
  ['T', 'T0 – T255', 'timers'],
  ['C', 'C0 – C199 (16-bit)', 'counters'],
  ['D', 'D0 – D9999 (D1000+ special)', 'numbers'],
])}
<h3>Special M and D</h3>
${table(['Address', 'Job'], [
  ['M1000 / M1002', 'always ON / ON for the first scan'],
  ['M1011 / M1012 / M1013 / M1014', '10 ms / 100 ms / 1 s / 1 min clocks'],
  ['D1120', 'COM2 format (H87 = 9600 8E1)'],
  ['M1120 / M1143', 'keep the COM2 setting / RTU mode'],
  ['M1127 / M1129 / M1140', 'Modbus done / time-out / exception'],
  ['M1067', 'operation error (e.g. no module found)'],
])}
<h3>MS300 over Modbus</h3>
${table(['Address', 'Job'], [
  ['2000H', 'H1 STOP · H12 forward · H22 reverse'],
  ['2001H', 'speed (0.01 Hz)'],
  ['2002H', 'H2 = fault reset'],
  ['2100H / 2103H / 2104H', 'fault code / output Hz / current'],
  ['Pr.00-20 / 00-21', 'speed / RUN source (1 / 2 = RS-485)'],
  ['Pr.09-00 / 09-01 / 09-04', 'station / baud rate / format'],
])}
<h3>DVP04AD-E2</h3>
${table(['', ''], [
  ['FROM K0 K12 D0 K4', 'present values of CH1–CH4 → D0–D3'],
  ['FROM K0 K6 D0 K4', 'averaged values of CH1–CH4 → D0–D3'],
  ['TO K0 K1 H…. K1', 'input mode (one hex digit per channel: 0 ±10 V, 1 0–10 V, 2 ±20 mA, 3 0–20 mA, 4 4–20 mA)'],
  ['TO K0 K2 K20 K1', 'CH1 averages 20 readings'],
  ['0–10 V / 4–20 mA', '0 … 32000'],
])}
${note('The PLC Lab tab of the manual goes deeper: chapter 2 (PLC programming), 4 (VFD), 6 (Modbus) and 8 (reference). After this part they will feel easy.')}`,
    },
  ],
};
