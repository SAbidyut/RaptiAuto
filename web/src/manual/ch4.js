import * as A from './art.js';
import { ladder, par } from './ladder.js';
import { note, tip, warn, tryIt, steps, ul, table, pre, open } from './helpers.js';

export default {
  id: 'vfd', no: 4, title: 'Variable frequency drive (VFD)', icon: 'motor',
  blurb: 'How a drive works, the MS300 keypad and parameters, and three ways to control it from the PLC.',
  sections: [
    {
      id: 'what', title: 'What a VFD does',
      html: `
<p>An AC induction motor turns at a speed set by the <b>frequency</b> of its supply: 50 Hz → about 1400 rpm (4-pole motor), 25 Hz → about 700 rpm. A <b>variable frequency drive</b> (VFD, inverter) makes any frequency you ask for, so you can start a motor softly, run it at any speed and stop it gently.</p>
${A.vfdBlocks()}
${ul(
  '<b>Soft start / soft stop</b>: the motor gets its speed in seconds instead of a violent jerk (and takes far less starting current).',
  '<b>Speed control</b>: conveyor speed, pump flow, fan air — without mechanical gears.',
  '<b>Energy saving</b>: a pump running at 80 % speed uses about half the power.',
  '<b>Protection</b>: over-current, over-voltage, overload and motor thermal protection built in.')}
${A.vfCurve()}
<p>The drive keeps the ratio <b>voltage ÷ frequency</b> constant (V/F control), so the motor keeps its torque. Above the base frequency (50 Hz) the voltage cannot rise any more.</p>`,
    },
    {
      id: 'ms300', title: 'The Delta MS300 in the lab',
      html: `
<p>The lab's drive is a <b>Delta MS300</b> (1.5 kW class, single-phase 230 V in, three-phase out) driving a 0.75 kW, 4-pole motor. Its terminals are drawn as on the real drive:</p>
${table(['Terminals', 'What they are'], [
  ['<code>R/L1  S/L2</code>', 'Power input: 1-phase 230 V (from the MCB: L and N).'],
  ['<code>U/T1  V/T2  W/T3</code>', 'Power output to the motor (or to a contactor, then the motor).'],
  ['<code>⏚ PE</code>', 'Protective earth.'],
  ['<code>MI1 … MI7</code>, <code>DCM</code>, <code>+24V</code>', '<b>Digital inputs</b>. A contact between MI and DCM is a command: run forward, run reverse, choose a speed … What each MI does is set by parameters.'],
  ['<code>+10V  AVI  ACI  ACM</code>', '<b>Analog inputs</b>: AVI 0 – 10 V, ACI 4 – 20 mA or 0 – 10 V. <code>+10V</code> feeds a speed potentiometer, <code>ACM</code> is the analog common.'],
  ['<code>AFM</code>', 'Analog output: a voltage that shows frequency or current.'],
  ['<code>RA  RB  RC</code>', 'Relay output (default: fault).'],
  ['<code>MO1  MO2  MCM</code>', 'Open-collector outputs (running, speed reached …).'],
  ['<code>RS-485</code> (RJ45)', 'Modbus RTU / ASCII communication (see chapter 6).'],
])}
<p>In the <b>VFD tab</b> you see a big copy of the keypad, a live trend of frequency / current, the <b>parameter table</b> (edit it online or offline) and a Modbus register reference. In 3D you can press the keypad right on the drive in <b>Operate</b> mode.</p>`,
    },
    {
      id: 'keypad', title: 'Using the keypad',
      html: `
${A.keypad()}
${table(['Key', 'Does'], [
  ['<b>RUN</b>', 'Starts the motor (when the run command source is the keypad, Pr.00-21 = 0).'],
  ['<b>STOP / RESET</b>', 'Stops the motor; also clears a fault.'],
  ['<b>MODE</b>', 'Changes the page: <b>F</b> (frequency command) → <b>H</b> (actual output frequency) → <b>U</b> (a value chosen by Pr.00-04: current, DC bus voltage, output voltage, power, rpm …) → <b>PrG</b> (parameters) → <b>Frd / rEv</b> (direction) → back to F.'],
  ['<b>▲</b>', 'Increases a value. Hold it to repeat.'],
  ['<b>◀ / ▼</b>', 'One key with two jobs: a <b>tap</b> decreases the value, a <b>hold</b> moves the blinking digit to the left.'],
  ['<b>ENTER</b>', 'Stores a value ("End" flashes) or opens the next level.'],
  ['<b>Speed dial</b>', 'The knob in the corner (works as frequency source when Pr.00-20 = 7).'],
])}
<p>The <b>LEDs</b>: RUN, FWD and REV show the state (they <i>blink</i> while the drive decelerates or changes direction); STOP and PLC show the command source.</p>
<h3>Run the motor from the keypad</h3>
${steps(
  'Press <b>Simulate</b> and switch to <b>Operate</b> mode. The display shows <code>88888</code> then <code>dELtA</code> (start-up) and then <code>F 0.00</code>.',
  'On the <b>F</b> page press <b>▲</b> until it reads <code>F 30.00</code> (hold <b>◀/▼</b> to move the digit you change). Press <b>ENTER</b>.',
  'Press <b>RUN</b>. The motor accelerates: look at the <b>H</b> page (press MODE) for the real output frequency, and at the motor in 3D.',
  'Press <b>STOP</b>. The drive decelerates in the time of Pr.01-13.')}
<h3>Change a parameter</h3>
${steps(
  'Press <b>MODE</b> until <code>PrG</code> shows, then <b>ENTER</b>.',
  'Choose the group (00 … 09) with ▲ / ▼ and press <b>ENTER</b>, then the parameter number, <b>ENTER</b>.',
  'The value blinks: change it with ▲ and ◀/▼, then <b>ENTER</b> — "End" confirms. (In the <b>VFD tab</b> you can also edit the table directly.)')}
${tip('If RUN "does nothing" the keypad tells you why in a toast: for example <i>RUN key is not the run command now: it comes from external terminals (Pr.00-21 = 1)</i>.')}`,
    },
    {
      id: 'params', title: 'Parameters you will use',
      html: `
<p>Drive settings are <b>parameters</b> named <code>Pr.GG-NN</code>: a group (GG) and a number. The MS300 has hundreds; these are the important ones (default values in the lab):</p>
${table(['Pr.', 'Name', 'Default', 'Notes'], [
  ['<code>00-20</code>', 'Frequency command source', '0', '0 keypad · 1 RS-485 · 2 analog AVI/ACI · 3 UP/DOWN terminals · 7 keypad dial'],
  ['<code>00-21</code>', 'Run command source', '0', '0 keypad · 1 external terminals · 2 RS-485'],
  ['<code>00-02</code>', 'Parameter reset', '0', '9 = back to factory settings (50 Hz base)'],
  ['<code>00-04</code>', 'Content of the U page', '3', 'current, DC bus, output voltage, power, rpm, torque, temperature …'],
  ['<code>01-00</code>', 'Maximum operating frequency', '50 Hz', 'The highest frequency the drive will ever give.'],
  ['<code>01-01 · 01-02</code>', 'Base frequency · base voltage', '50 Hz · 220 V', 'The V/F curve corner.'],
  ['<code>01-09</code>', 'Start-up frequency', '0.5 Hz', 'A command below this does not start the motor.'],
  ['<code>01-10 · 01-11</code>', 'Frequency upper / lower limit', '599 / 0 Hz', ''],
  ['<code>01-12 · 01-13</code>', 'Acceleration / deceleration time 1', '10 s · 10 s', 'Time to go from 0 to Pr.01-00 and back.'],
  ['<code>02-00</code>', '2-wire / 3-wire control', '1', '1: MI1 FWD / STOP, MI2 REV / STOP · 2: MI1 RUN, MI2 REV/FWD · 3: 3-wire'],
  ['<code>02-01 … 02-07</code>', 'Function of MI1 … MI7', 'see below', '1 – 4 multi-step · 5 reset · 6 JOG · 10 external fault …'],
  ['<code>02-12</code>', 'MI contact type (bit per MI)', '0', 'Make a terminal normally closed.'],
  ['<code>02-13 · 02-16</code>', 'Relay RA/RB/RC · MO1 function', '11 · 0', '11 = fault, 1 = running, 2 = speed reached …'],
  ['<code>03-00 · 03-01</code>', 'AVI · ACI function', '1 · 0', '1 = frequency command'],
  ['<code>04-00 … 04-14</code>', 'Step speeds 1 – 15', '0', 'Frequencies for the multi-step inputs.'],
  ['<code>05-01 … 05-05</code>', 'Motor data', '3.2 A · 0.75 kW · 1410 rpm · 4 poles', 'Set from the motor nameplate.'],
  ['<code>06-03</code>', 'Stall prevention (acceleration)', '150 %', '0 = off: a too short ramp then trips <b>ocA</b>.'],
  ['<code>06-13</code>', 'Electronic thermal relay', 'disabled', 'Motor overload protection (EoL1).'],
  ['<code>07-11</code>', 'Auto restart after fault', '0', 'Number of automatic restarts.'],
  ['<code>08-00 … 08-04</code>', 'PID control of the drive', '', 'Feedback source, P, I, D of the built-in PID (pumps, fans).'],
  ['<code>09-00 · 09-01 · 09-04</code>', 'Modbus address · speed · format', '1 · 9.6 · 1', 'Communication settings (chapter 6). Format 14 = 8E1 RTU.'],
])}
${note('A parameter changed while the drive runs may be refused: some can only be changed when stopped. The drive then shows "Err" and the table explains why.')}`,
    },
    {
      id: 'control', title: 'Three ways to control the drive from a PLC',
      html: `
<h3>A · Terminals: the simplest</h3>
<p>The PLC closes contacts between MI and DCM. Wire the PLC output group <code>C1</code> to <code>DCM</code> and <code>Y4 → MI1</code> (FWD), <code>Y5 → MI2</code> (REV), <code>Y6 → MI3</code>, <code>Y7 → MI4</code> (speed steps). Set the drive to <b>Pr.00-21 = 1</b> (run from terminals).</p>
${A.vfdTerminals()}
${table(['MI3 (step 1)', 'MI4 (step 2)', 'The drive runs at'], [
  ['off', 'off', 'the frequency command (Pr.00-20)'],
  ['<b>on</b>', 'off', 'Pr.04-00 (1st step)'],
  ['off', '<b>on</b>', 'Pr.04-01 (2nd step)'],
  ['<b>on</b>', '<b>on</b>', 'Pr.04-02 (3rd step)'],
])}
<p>The multi-step inputs work as <b>binary numbers</b>: the commands 1, 2, 3, 4 (give any MI that function in Pr.02-01 … 02-07; by default MI3 = command 1, MI4 = command 2, MI5 = command 3) have the weights 1, 2, 4, 8, so up to 15 speeds. The PLC program only has to switch the right outputs:</p>
${ladder([
  { note: 'Forward and reverse with an interlock → MI1, MI2', net: ['M0'], out: 'OUT Y4' },
  { net: ['M1'], out: 'OUT Y5' },
  { note: 'Speed selector: low → MI3, high → MI4', net: ['/X3'], out: 'OUT Y6' },
  { net: ['X3'], out: 'OUT Y7' },
], 'The program of the example "VFD forward / reverse, 2 speeds" (the latching rungs M0 / M1 are shown in chapter 2).')}
${open('vfd-terminals', 'Open: VFD forward / reverse, 2 speeds')}
<h3>B · Analog: the PLC sets the speed with a voltage</h3>
<p>A DVP20EX2 writes a value to its analog output <code>D1116</code> (0 – 2000 = 0 – 10 V) and the output <code>VO0</code> is wired to the drive's <code>AVI</code> (with <code>AG0</code> → <code>ACM</code>). Set <b>Pr.00-20 = 2</b> (analog frequency). 10 V = the maximum frequency. Direction and run still go through the MI terminals.</p>
${open('analog-speed', 'Open: Analog speed: pot → EX2 → VFD')}
<h3>C · Modbus: no wires for speed and run</h3>
<p>Over the RS-485 cable the PLC (COM2) writes to the drive's registers: <code>2000H</code> = command word and <code>2001H</code> = frequency. Set <b>Pr.00-20 = 1</b>, <b>Pr.00-21 = 2</b>, <b>Pr.09-00 = 1</b> (station), <b>09-01 = 9.6</b>, <b>09-04 = 14</b> (8E1 RTU). The program uses <code>MODRW</code>:</p>
${ladder([
  { note: 'Command word: H12 = run forward · H1 = stop', net: ['M2'], out: 'MOV H12 D0' },
  { net: ['/M2'], out: 'MOV H1 D0' },
  { note: 'Write the command word (FC06 → 2000H) and the frequency (2001H)', net: ['M1000'], out: 'MODRW K1 K6 H2000 D0 K1' },
  { net: ['M1000'], out: 'MODRW K1 K6 H2001 D10 K1' },
  { note: 'Read the output frequency and current (FC03 → 2103H, 2104H)', net: ['M1000'], out: 'MODRW K1 K3 H2103 D20 K2' },
], 'D10 = 3000 means 30.00 Hz (0.01 Hz units). Chapter 6 explains every number of MODRW.')}
${open('vfd-modbus-hmi', 'Open: VFD speed control · Modbus RTU + HMI')}
<h3>Delta shortcuts</h3>
<p>For Delta drives the PLC has ready-made instructions that write to the same registers: <code>FWD</code> (run forward at a frequency), <code>REV</code>, <code>STOP</code>, <code>RDST</code> (read status) and <code>RSTEF</code> (reset a fault). They are found under <b>ƒ API → Comm</b>.</p>
${table(['Register', 'Meaning', 'Write / read'], [
  ['<code>2000H</code>', 'Command word: bits 0–1: 01 stop · 10 run; bits 4–5: 01 forward · 10 reverse · 11 change direction', 'W (FC06)'],
  ['<code>2001H</code>', 'Frequency command (0.01 Hz)', 'W'],
  ['<code>2002H</code>', 'Bit 0 external fault (EF) · bit 1 reset', 'W'],
  ['<code>2100H</code>', 'Error code (fault number)', 'R'],
  ['<code>2101H</code>', 'Drive status bits (run, direction, command sources)', 'R'],
  ['<code>2102H</code>', 'Frequency command', 'R'],
  ['<code>2103H</code>', 'Output frequency (0.01 Hz)', 'R'],
  ['<code>2104H</code>', 'Output current (0.01 A)', 'R'],
  ['<code>2105H · 2106H</code>', 'DC bus voltage · output voltage (0.1 V)', 'R'],
  ['<code>210CH</code>', 'Motor speed (rpm)', 'R'],
  ['<code>GGNNH</code>', 'Any parameter: group in the high byte, number in the low byte — Pr.01-12 → <code>010CH</code>, Pr.04-00 → <code>0400H</code>', 'R / W'],
])}`,
    },
    {
      id: 'protect', title: 'Faults and protection',
      html: `
<p>When the drive trips, the display shows a fault code, the motor coasts or stops, and the relay RA/RB/RC switches. Press <b>STOP / RESET</b> after removing the cause. The VFD tab lists the fault history (Pr.06-17 …). The most common faults:</p>
${table(['Code', 'Meaning', 'What to do'], [
  ['<b>ocA</b>', 'Over-current during acceleration', 'Longer acceleration time (01-12), lighter load, or stall prevention on (06-03).'],
  ['<b>ocd</b>', 'Over-current during deceleration', 'Longer deceleration time (01-13).'],
  ['<b>ocn</b>', 'Over-current at constant speed', 'The load is too heavy or jammed.'],
  ['<b>ovd</b>', 'Over-voltage during deceleration', 'The motor feeds energy back: longer deceleration time.'],
  ['<b>oL · EoL1</b>', 'Drive overload · motor overload', 'Lower the load; check motor data 05-01 and Pr.06-13.'],
  ['<b>EF · EF1</b>', 'External fault · emergency stop input', 'An MI set to 10 / 28 is ON — release the E-stop.'],
  ['<b>AFE · ACE</b>', 'PID feedback / analog signal lost', 'Check the sensor wiring.'],
  ['<b>CE10</b>', 'Modbus time-out (Pr.09-03)', 'The PLC stopped talking — check COM2 and the program.'],
  ['<b>CE1 – CE4</b>', 'Illegal Modbus function / address / value / write to read-only', 'Check the register address and value you write.'],
])}
${tryIt('Open the terminals example. Switch stall prevention off (Pr.06-03 = 0), set Pr.01-12 to 0.1 s and press FWD: the drive trips with <b>ocA</b>. Press STOP/RESET and put the values back.')}`,
    },
  ],
};
