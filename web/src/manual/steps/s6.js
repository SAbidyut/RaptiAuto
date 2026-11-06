import * as S from './art-steps.js';
import { ladder } from '../ladder.js';
import { note, warn, tryIt, steps, ul, table, pre } from '../helpers.js';
import { stepLab } from './kit.js';

export default {
  id: 'st-analog', no: 6, title: 'Analog input (DVP04AD-E2)', icon: 'thermometer',
  blurb: 'Steps 13–15: what analog is, 0–10 V and 4–20 mA, fitting and wiring the module, FROM / TO, CRs, scaling, averaging.',
  sections: [
    {
      id: 'what', title: 'What an analog signal is',
      html: `
${S.analogVsDigital()}
<p>A button has two states: pressed or not. But a temperature of 35.7 °C, a pressure of 4.2 bar, a tank 63 % full — these have <b>many</b> values. A sensor turns such a value into an electrical signal; it is called a <b>transmitter</b>:</p>
${table(['Signal', 'Zero', 'Full', 'Where you see it'], [
  ['<b>0–10 V</b>', '0 V', '10 V', 'pots, simple transmitters, the VFD\'s AVI'],
  ['<b>4–20 mA</b>', '4 mA', '20 mA', 'almost every industrial transmitter'],
  ['±10 V', '−10 V', '+10 V', 'values in both directions (e.g. servo speed)'],
])}
${note('Why 4–20 mA and not 0? Because 0 mA means "the wire is broken" — the PLC can tell that the sensor is dead. And a current does not drop along a long cable the way a voltage does. That is why factories use 4–20 mA.')}`,
    },
    {
      id: 'module', title: 'The DVP04AD-E2 module',
      html: `
<p>The DVP16ES2 has no analog inputs. So a module is clipped onto the PLC\'s <b>right side</b> — the <b>DVP04AD-E2</b>: four analog input channels (CH1–CH4). In the lab add it with <b>＋ Add device → PLC expansion modules</b> — it sits down next to the PLC by itself.</p>
${S.adWiring()}
${table(['Terminal', 'What'], [
  ['<code>24V</code> / <code>24G</code>', 'power for the module: +V and −V of a 24 V supply — or the PLC\'s own <code>+24V</code> / <code>24G</code> output (the labs of steps 13–16 do that: shorter wires)'],
  ['<code>V1+</code>', 'CH1 voltage input (0–10 V, ±10 V)'],
  ['<code>I1+</code>', 'CH1 current input (4–20 mA) — <b>join I1+ and V1+ with a jumper</b>'],
  ['<code>VI1−</code>', 'CH1 common — to the sensor\'s 0 V'],
  ['CH2, CH3, CH4', 'the same: V2+ I2+ VI2− …'],
])}
${warn('Without 24 V on the module every value stays 0 and FROM fails (<code>M1067</code> ON). Check the lab says "DVP04AD-E2 has no power".')}
${note('In the field you will also meet the DVP20EX2 — it has four analog inputs inside the PLC (values straight in <code>D1110 … D1113</code>, ±2000). The lab example "Analog speed: pot → EX2 → VFD" shows it. The idea is the same: signal → number → scaling.')}`,
    },
    {
      id: 'cr', title: 'CRs and FROM / TO: talking to the module',
      html: `
<p>Inside the module are registers called <b>CR</b> (control registers). The PLC reads a CR with <b>FROM</b> and writes one with <b>TO</b>.</p>
${pre(`FROM  K0    K12   D0    K4
      │     │     │     └─ how many CRs (4: CR#12 … 15)
      │     │     └─ where in the PLC (D0 … D3)
      │     └─ first CR (CR#12 = present value of CH1)
      └─ which module (the first one next to the PLC = K0, then K1)

TO    K0    K1    H40   K1
      │     │     │     └─ one CR
      │     │     └─ what to write (H40)
      │     └─ CR#1 = input mode
      └─ module K0`)}
${table(['CR#', 'What', 'Read / write'], [
  ['0', 'module code (is it there?)', 'read'],
  ['1', 'input mode — one hex digit per channel; CH1 = the last digit', 'write (TO)'],
  ['2 – 5', 'number of readings CH1–CH4 average (1–100, default 10)', 'write'],
  ['6 – 9', '<b>averaged values</b> of CH1–CH4', 'read'],
  ['12 – 15', '<b>present values</b> of CH1–CH4', 'read'],
])}
${table(['Mode', 'Input', 'Value'], [
  ['0 (default)', '±10 V', '−32000 … +32000 (0–10 V → 0 … 32000)'],
  ['1', '0–10 V', '0 … 32000'],
  ['2', '±20 mA', '−32000 … +32000'],
  ['3', '0–20 mA', '0 … 32000'],
  ['4', '4–20 mA', '0 … 32000 (4 mA = 0)'],
])}
<p>Example: CH1 0–10 V (mode 0), CH2 4–20 mA (mode 4) → CR#1 = <code>H0040</code> (4 in CH2\'s digit, 0 in CH1\'s).</p>
${warn('These CR numbers and modes are those of the lab\'s module. When you buy a real module, check the CR table on its instruction sheet once — it can differ slightly between models and firmware versions.')}`,
    },
    {
      id: 'scale', title: 'Scaling: from a number to a real unit',
      html: `
${S.scaleSteps()}
<p>The module gives 0 … 32000. We want °C or bar. The rule is always the same:</p>
${pre(`real value = raw value × (full scale in units ÷ 32000)

0–100.0 °C  →  1000 (units of 0.1 °C) ÷ 32000 = 1/32   →  DIV D0 K32 D10
0–10.0 bar  →  100  (units of 0.1 bar) ÷ 32000 = 1/320 →  DIV D1 K320 D11
0–50.00 Hz  →  5000 (units of 0.01 Hz) ÷ 32000         →  DIV D0 K32 D12, MUL D12 K5 D14`)}
${ul(
  '<b>Keeping a decimal</b>: a PLC only holds whole numbers, so 35.0 °C is kept as <b>350</b> (units of 0.1 °C). On an HMI "1 decimal" shows it as 35.0.',
  '<code>DIV</code> puts the remainder in the next D (quotient in D10, remainder in D11) — so do not use D11 for anything else.',
  'The result of <code>MUL</code> is 32-bit (two Ds: D14, D15). Below 32767, D14 alone is enough.')}`,
    },
    {
      id: 's13', title: 'Step 13 · Read 0–10 V: a temperature',
      html: `
${ladder([
  { note: 'Present value of CH1 → D0', net: ['M1000'], out: 'FROM K0 K12 D0 K1' },
  { note: 'D0 ÷ 32 → D10 (0.1 °C)', net: ['M1000'], out: 'DIV D0 K32 D10' },
  { note: 'Above 60.0 °C → HOT lamp', net: ['D10>K600'], out: 'OUT Y0' },
], 'Read → scale → compare. Almost every analog program is these three lines.')}
${steps(
  'Open the lab, Simulate. The transmitter reads 35 °C.',
  'Monitor: <code>D0</code> ≈ 11200, <code>D10</code> = 350.',
  'In Operate mode tap the TEMP transmitter and drag its slider to 80 °C → the HOT lamp lights.',
  'In the 2D view the module shows the raw value of each channel live.')}
${stepLab('step-13-analog-read', 13)}
${tryIt('Change the limit to 40.0 °C (<code>D10>K400</code>) and Download.')}`,
    },
    {
      id: 's14', title: 'Step 14 · 4–20 mA and TO: pump control',
      html: `
${S.loop420()}
${ladder([
  { note: 'First scan: CH2 = mode 4 (4–20 mA)', net: ['M1002'], out: 'TO K0 K1 H40 K1' },
  { note: 'CH2 → D1', net: ['M1000'], out: 'FROM K0 K13 D1 K1' },
  { note: 'D1 ÷ 320 → D11 (0.1 bar)', net: ['M1000'], out: 'DIV D1 K320 D11' },
  { note: 'Below 3.0 bar → pump on', net: ['D11<K30'], out: 'SET Y0' },
  { note: 'Above 6.0 bar → pump off', net: ['D11>K60'], out: 'RST Y0' },
], 'Hysteresis: separate on and off limits, so between 3 and 6 bar the pump does not keep switching.')}
${note('With one limit (say 4.5 bar) the pump would switch on and off every second while the pressure wobbles around it — bad for the motor and the contactor. Two limits = a calm pump.')}
${stepLab('step-14-analog-4-20ma', 14)}
${tryIt('Delete the jumper (I2+ ↔ V2+) and see how the value changes. Then delete the TO rung (mode 0) — 4 mA no longer reads as zero.')}`,
    },
    {
      id: 's15', title: 'Step 15 · Four channels at once, averaging',
      html: `
${ladder([
  { note: 'CH1: average of the last 20 readings', net: ['M1002'], out: 'TO K0 K2 K20 K1' },
  { note: 'Averages of the four channels → D0 … D3', net: ['M1000'], out: 'FROM K0 K6 D0 K4' },
  { note: 'Present values of CH1, CH2 → D4, D5', net: ['M1000'], out: 'FROM K0 K12 D4 K2' },
], 'Four channels in one FROM.')}
<p>A real sensor value always wobbles a little (noise). An <b>average</b> keeps it steady but follows changes a little later. CR#2–5 set how many readings are averaged: few = fast but jumpy, many = steady but slow.</p>
${stepLab('step-15-analog-average', 15)}
${tryIt('Put D0 (average) and D4 (present) side by side in Monitor. Change TEMP suddenly from 25 to 75 °C: D4 jumps at once, D0 climbs slowly.')}`,
    },
  ],
};
