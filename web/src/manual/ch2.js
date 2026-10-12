import * as A from './art.js';
import { ladder, par } from './ladder.js';
import { note, tip, warn, tryIt, steps, ul, table, pre, open } from './helpers.js';

const STOP = 'X1|STOP';
const LATCH = [{ net: [par(['X0|START'], ['Y0']), STOP], out: 'OUT Y0' }];

export default {
  id: 'plc', no: 2, title: 'PLC programming', icon: 'ladder',
  blurb: 'How a PLC works, devices X Y M T C D, ladder diagrams, timers, counters, numbers — with exercises.',
  sections: [
    {
      id: 'how', title: 'What a PLC is and how it works',
      html: `
<p>A <b>PLC</b> (Programmable Logic Controller) is a small industrial computer that reads <b>inputs</b> (buttons, sensors), decides with a <b>program</b>, and switches <b>outputs</b> (lamps, contactors, valves, drives). It replaces the tangle of relays and wires that older panels needed: to change how the machine behaves you change the program, not the wiring.</p>
${A.scan()}
<p>The PLC does not run the program once — it repeats the <b>scan</b> over and over, thousands of times a second:</p>
${steps(
  '<b>Read the inputs.</b> The state of X0, X1 … is copied into memory. During the rest of the scan the program sees this frozen picture.',
  '<b>Run the program</b> from the first network to the last, top to bottom, using the memory.',
  '<b>Update the outputs.</b> Y0, Y1 … are switched together at the end of the scan.',
  '<b>Communicate</b> with the HMI, the laptop and Modbus devices.')}
${note('Because outputs change only at the end of a scan, the order of networks matters: a network lower in the program sees the result of the networks above it in the <i>same</i> scan, but a network above sees it only in the <i>next</i> scan.')}`,
    },
    {
      id: 'hw', title: 'The Delta DVP PLCs of the lab',
      html: `
${table(['Model', 'Inputs', 'Outputs', 'Extra'], [
  ['<b>DVP16ES2</b>', '8 (X0 – X7)', '8 relays (Y0 – Y7), two groups C0 / C1', 'COM1 RS-232, COM2 RS-485, USB'],
  ['<b>DVP32ES2</b>', '16 (X0 – X7, X10 – X17)', '16 relays (Y0 – Y7, Y10 – Y17), four groups', 'same'],
  ['<b>DVP20EX2</b>', '8 (X0 – X7)', '6 transistors (Y0 – Y5, NPN, supply UP / ZP)', '4 analog inputs (V0+ … or I0+ …), 2 analog outputs, COM ports'],
])}
<p>The front of the PLC has the <b>RUN / STOP</b> slide switch, the POWER / RUN / ERROR LEDs, a row of <b>IN</b> and <b>OUT</b> LEDs (they light with the state of each X and Y), and the COM LEDs that blink with communication. The terminals are printed exactly as on the real unit: <code>L N ⏚</code> for the 100–240 V AC supply, <code>S/S 24G +24V</code> and <code>X0 … X7</code> for inputs, <code>Y0 … C0 …</code> for outputs, <code>D+ D− SG</code> for RS-485.</p>
<p>A lab can hold <b>two PLCs</b> (a master and a slave). Tap the chip at the top (<i>Delta DVP16ES2 …</i>) to choose which PLC you are programming. Each has its own ladder.</p>`,
    },
    {
      id: 'io', title: 'Wiring inputs and outputs',
      html: `
${A.ioWiring()}
<h3>Inputs</h3>
<p>In the lab every input is wired the same way: <code>S/S</code> goes to <b>0 V</b> (−V1), and the switch brings <b>+24 V</b> to the input terminal. When the switch closes, 24 V reaches X0 and the PLC sees a <b>1</b>.</p>
${ul(
  'A <b>push button NO</b> (normally open): X = 0 at rest, 1 while pressed. Wire +24 V → terminal <code>13</code>, terminal <code>14</code> → X0.',
  'A <b>push button NC</b> (normally closed, used for STOP): X = <b>1</b> at rest, 0 while pressed — and 0 when the wire breaks, which is why STOP buttons are NC. Wire it in series: +24 V → <code>11</code>, <code>12</code> → X1.',
  'A <b>3-wire sensor</b> (inductive, capacitive, photo): brown (BN) → +24 V, blue (BU) → 0 V, black (BK) → input X.',
  'A <b>selector</b>, <b>limit switch</b> or <b>float switch</b> works like a button: a contact between +24 V and the input.')}
<h3>Outputs</h3>
<p>The DVP16ES2 has <b>relay outputs</b>: inside there is a relay contact between the common (<code>C0</code>) and the output (<code>Y0</code>). Connect <code>C0</code> to <b>+24 V</b> (+V2), the load between <code>Y0</code> and <b>0 V</b> (−V2). When Y0 turns on the contact closes and the lamp lights. One common serves a group of outputs: <b>C0 for Y0 – Y3</b> and <b>C1 for Y4 – Y7</b>. Because they are dry contacts, a group can also switch a different voltage, such as the drive's MI terminals (see chapter 4).</p>
${warn('Never connect a lamp, coil or motor straight between +24 V and 0 V without the PLC output in the circuit — the lab shows a short circuit and the power supply protects itself.')}`,
    },
    {
      id: 'devices', title: 'Devices: X, Y, M, S, T, C, D, K, H',
      html: `
${A.memory()}
<p>Everything a PLC remembers has a name made of a <b>letter</b> and a <b>number</b>. These names are called <b>devices</b>.</p>
${table(['Device', 'Meaning', 'Range (ES2 / EX2)', 'Notes'], [
  ['<code>X</code>', 'Input relay', 'X0 – X377', '<b>Octal</b>: …X6, X7, <b>X10</b>, X11 … (no X8, X9). Read only.'],
  ['<code>Y</code>', 'Output relay', 'Y0 – Y377', 'Octal too. Each Y drives a real output terminal.'],
  ['<code>M</code>', 'Auxiliary relay (internal bit)', 'M0 – M4095', 'M0 – M499 general, <b>M500 – M999 latched</b> (kept when the PLC stops). M1000 and above are special.'],
  ['<code>S</code>', 'Step relay (step ladder)', 'S0 – S1023', 'S500 – S899 latched.'],
  ['<code>T</code>', 'Timer', 'T0 – T255', 'A bit (done) and a 16-bit word (present value).'],
  ['<code>C</code>', 'Counter', 'C0 – C255', 'C0 – C199 16-bit up counters, C100 – C199 latched, C200 – C234 32-bit up / down.'],
  ['<code>D</code>', 'Data register', 'D0 – D9999', '16-bit word, −32768 … 32767. D0 – D199 general, <b>D200 – D999 latched</b>, D1000 and above include special registers.'],
  ['<code>K</code>', 'Decimal constant', 'K10, K−5', 'A fixed number: <code>MOV K100 D0</code>.'],
  ['<code>H</code>', 'Hexadecimal constant', 'H1F, H2000', 'Used for Modbus addresses and bit patterns.'],
  ['<code>K4M0</code>', 'Group of bits as a number', 'K1 – K4 (×4 bits)', '<code>K4M0</code> = M0 … M15 read as one 16-bit number. Also K4X0, K4Y0.'],
])}
<h3>Special relays and registers you will use all the time</h3>
${table(['Device', 'What it does'], [
  ['<code>M1000</code>', 'Always ON while the PLC runs (a "normally open" contact that is always closed).'],
  ['<code>M1001</code>', 'Always OFF while the PLC runs.'],
  ['<code>M1002</code>', 'ON for the <b>first scan only</b> — use it to set start-up values.'],
  ['<code>M1011 · M1012 · M1013 · M1014</code>', 'Clock pulses: 10 ms, 100 ms, <b>1 s</b>, 1 min (half the time on, half off). <code>M1013</code> makes a lamp blink once per second.'],
  ['<code>D1010</code>', 'Present scan time in 0.1 ms steps.'],
  ['<code>M1120 · D1120 · D1121 · M1143</code>', 'COM2 settings and station address — see chapter 6.'],
  ['<code>M1127 · M1129</code>', 'COM2 transaction finished / time-out.'],
])}
${tip('Give your devices names. In the Ladder tab ⋯ → <b>Device comments</b> you can write "X0 = START button", "Y0 = RUN lamp". Comments appear under the contacts and make a program readable a year later.')}`,
    },
    {
      id: 'ladder', title: 'Reading a ladder diagram',
      html: `
<p>A ladder diagram looks like a relay circuit drawn sideways. The two vertical lines are the <b>power rails</b>; each horizontal line between them is a <b>network</b> (also called a <i>rung</i>). On the left of a network are <b>conditions</b> (contacts), on the right is the <b>action</b> (a coil or an instruction). When the conditions let "power" flow from the left rail, the action happens.</p>
${A.symbols()}
${ul(
  '<b>Normally open contact</b> <code>X0</code> (LD, AND, OR): conducts when the device is <b>ON</b>.',
  '<b>Normally closed contact</b> <code>/X0</code> (LDI, ANI, ORI): conducts when the device is <b>OFF</b>.',
  '<b>Output coil</b> <code>OUT Y0</code>: turns the device on when power reaches it, off when it does not.',
  '<b>SET</b> turns a device on and <i>keeps</i> it on; <b>RST</b> turns it off and clears it.',
  '<b>Instruction boxes</b> (TMR, CNT, MOV, ADD, MODRW …) sit on the right, like coils, and run when power reaches them.')}
${A.andOr()}
<h3>The one-coil rule</h3>
<p>Use <code>OUT Y0</code> <b>once</b> in a program. If two networks drive the same output, the <i>lower</i> one wins and the upper one seems to do nothing (a "double coil"). To switch one output from several conditions, put the conditions in <b>parallel</b> in a single network.</p>
<h3>Ladder and instruction list</h3>
<p>Behind every ladder diagram is a list of instructions the PLC really runs. The self-holding circuit above is simply:</p>
${pre(`LD   X0     // start a block with X0
OR   Y0     // ... or Y0 (the holding contact)
AND  X1     // ... and X1 (the stop button, wired NC)
OUT  Y0     // switch Y0`)}
<p>In the Ladder tab, <b>⋯ → Instruction list (IL)</b> shows this list for your own program.</p>`,
    },
    {
      id: 'editor', title: 'Writing a ladder in RaptiAuto',
      html: `
<p>The Ladder tab works like a small ISPSoft. You always edit at the <b>cursor</b> (a blue frame on a cell).</p>
${steps(
  '<b>Tap a cell</b> to put the cursor on it.',
  'Tap a <b>contact button</b> in the toolbar (normally open, normally closed, rising edge …). A keypad opens: type the device (<code>X0</code>, <code>M10</code>, <code>T0</code> …) and press <b>OK</b>. X and Y are octal, as on the real PLC.',
  'The cursor moves to the next cell. Add more contacts, or tap an <b>output</b>: <b>OUT</b>, <b>SET</b>, <b>RST</b>, <b>TMR</b>, <b>CNT</b>, <b>MOV</b>, <b>ADD</b> …',
  'For a <b>parallel branch</b>: put the cursor on the cell below and add the contact there, then tap the <b>vertical line</b> button to join the rows. The <b>parallel contact</b> buttons do this in one tap.',
  'Use <b>MATH</b>, <b>LOGIC</b> and <b>ƒ API</b> for every other instruction (compare, shift, floating point, Modbus, clock, pulse …). The list can be filtered and searched.',
  'The footer says <code>N1 · R1 · C1 · ✓ 0 errors · 149 steps</code>: network, row, column, errors, and the program size.')}
<h3>The buttons at the top</h3>
${table(['Button', 'Does'], [
  ['<b>Download</b>', 'Writes the program into the PLC over the laptop\'s USB cable.'],
  ['<b>RUN / STOP</b>', 'Puts the PLC in RUN or STOP (needs the simulation running and the USB cable).'],
  ['<b>Monitor</b>', 'Shows the live <b>power flow</b> in green on the diagram while the PLC runs, and live values of timers and registers.'],
  ['<b>Undo / Redo</b>', 'Steps through your edits.'],
  ['<b>⋯ More</b>', 'Insert / delete / duplicate / move a network, <b>network comment</b>, pointer label, <b>Upload from PLC</b>, <b>PLC memory clear</b>, <b>Instruction list</b>, <b>Compile / check</b>, <b>Device comments</b>, help.'],
])}
${tip('<b>Long-press</b> a contact or coil for a menu: edit the operands, change NO ↔ NC, add a device comment, insert or delete a cell, delete. Long-press a network <i>number</i> for the network menu. While the PLC is online and in RUN, <b>tap</b> a contact to set the device ON or OFF (like ISPSoft).')}
${note('A rung can have up to 8 contact columns, any number of rows, and one or more outputs on the right.')}`,
    },
    {
      id: 'latch', title: 'Program 1 — start / stop (the self-holding circuit)',
      html: `
<p>The task: a START button turns a lamp (or a motor contactor) on, and it stays on until STOP is pressed.</p>
${A.latch()}
<p>The STOP button is a <b>normally closed (NC)</b> button, so input X1 is <b>1</b> when nobody touches it. In the ladder X1 is therefore a normal contact that conducts at rest. When STOP is pressed (or the wire breaks!) X1 becomes 0 and the circuit is broken. This is a <i>fail-safe</i> design.</p>
<p>Watch the power flow in three moments:</p>
${ladder(LATCH, 'Idle: nothing is pressed. Y0 is off.', { on: { X1: 1 } })}
${ladder(LATCH, 'START pressed: power reaches Y0 through X0.', { on: { X0: 1, X1: 1 } })}
${ladder(LATCH, 'START released: Y0\'s own contact keeps the power flowing.', { on: { X0: 0, X1: 1, Y0: 1 } })}
${ladder(LATCH, 'STOP pressed (X1 = 0): the chain is cut and Y0 falls.', { on: { X0: 0, X1: 0, Y0: 1 } })}
${tryIt('Open the example, press <b>Simulate</b>, switch to <b>Operate</b> mode and press START and STOP. Then open the Ladder tab and watch the green power flow. In the Monitor tab tap <code>Y0</code> and <b>Force</b> it on and off.')}
${open('start-stop', 'Open: Start / Stop latching circuit')}`,
    },
    {
      id: 'interlock', title: 'Program 2 — forward / reverse with an interlock',
      html: `
<p>A motor must never get forward and reverse at the same time. The <b>interlock</b> puts the <i>other</i> direction\'s relay as a normally <b>closed</b> contact in each rung:</p>
${ladder([
  { note: 'Forward: latches, STOP breaks, blocked while reverse runs', net: [par(['X0|FWD'], ['M0']), 'X2|STOP', '/M1'], out: 'OUT M0' },
  { note: 'Reverse: the same, blocked while forward runs', net: [par(['X1|REV'], ['M1']), 'X2|STOP', '/M0'], out: 'OUT M1' },
  { note: 'The outputs for the drive (MI1 = FWD, MI2 = REV)', net: ['M0'], out: 'OUT Y4' },
  { net: ['M1'], out: 'OUT Y5' },
], 'Mutual interlock: /M1 in the forward rung and /M0 in the reverse rung.')}
<p>This is exactly the program of the example <i>VFD forward / reverse, 2 speeds</i> — you will use it again in chapter 4.</p>
${open('vfd-terminals', 'Open: VFD forward / reverse, 2 speeds')}`,
    },
    {
      id: 'timers', title: 'Timers',
      html: `
${A.timerChart()}
<p>A timer is an instruction box: <code>TMR T0 K50</code>. While its rung has power, the timer counts. When the value reaches <b>K</b> the timer's contact <code>T0</code> turns on. When the rung loses power the timer is cleared.</p>
${ladder([{ note: 'On-delay: Y0 comes on 5 s after X0', net: ['X0'], out: 'TMR T0 K50' }, { net: ['T0'], out: 'OUT Y0' }], 'TMR T0 K50 counts 50 × 100 ms = 5 s.')}
${table(['Timers', 'Time base', 'K = 10 means'], [
  ['T0 – T199', '100 ms', '1 second'],
  ['T200 – T239', '10 ms', '0.1 second'],
  ['T240 – T245', '10 ms, <b>accumulative</b>', '0.1 s (keeps the value when the rung is off)'],
  ['T246 – T249', '1 ms, accumulative', '10 ms'],
  ['T250 – T255', '100 ms, accumulative', '1 s'],
])}
<p>An <b>accumulative</b> timer does not clear when its rung loses power — it keeps counting later and needs <code>RST T250</code> to start again (an "hour meter").</p>
<h3>A flasher with two timers</h3>
${ladder([
  { note: 'T0 counts 1 s while T1 is not done', net: ['X0', '/T1'], out: 'TMR T0 K10' },
  { note: 'T1 counts 1 s once T0 is done', net: ['T0'], out: 'TMR T1 K10' },
  { note: 'Lamp on while T0 is done and T1 is not', net: ['T0', '/T1'], out: 'OUT Y0' },
], 'Y0 blinks: 1 s off, 1 s on, as long as X0 is on. When T1 is done, T0 is reset, and the cycle starts again.')}
${tip('For a simple 1-second blinker you do not need timers at all: <code>M1013 → OUT Y0</code>.')}
<h3>A start delay with a warning horn</h3>
<p>Before a conveyor starts a horn sounds for 5 seconds.</p>
${ladder([
  { note: 'START / STOP latch', net: [par(['X0|START'], ['M0']), STOP], out: 'OUT M0' },
  { note: 'Count 5 s after START', net: ['M0'], out: 'TMR T0 K50' },
  { note: 'Horn while waiting', net: ['M0', '/T0'], out: 'OUT Y1' },
  { note: 'Conveyor starts when the time is over', net: ['T0'], out: 'OUT Y0' },
], 'Y1 (horn) sounds for 5 s, then Y0 (conveyor) runs. STOP stops everything and clears T0.')}
${open('traffic-light', 'Open: Traffic light with timers')}`,
    },
    {
      id: 'counters', title: 'Counters',
      html: `
${A.counterChart()}
<p><code>CNT C0 K5</code> counts the <b>rising edges</b> of its rung. When the count reaches K the counter's contact <code>C0</code> turns on and stays on. The count is cleared only by <code>RST C0</code>.</p>
${ladder([
  { note: 'Count every part that passes the sensor', net: ['X0|SENSOR'], out: 'CNT C0 K12' },
  { note: 'Batch full: lamp on and 3 s later reset', net: ['C0'], out: ['OUT Y0', 'TMR T0 K30'] },
  { note: 'Reset the counter', net: ['T0'], out: 'RST C0' },
], 'A bottle counter: after 12 bottles the lamp lights for 3 s, then the counter starts again from 0.')}
${ul(
  '<b>C0 – C199</b> are 16-bit counters (0 – 32767). C100 – C199 keep their value when the PLC is stopped.',
  '<b>C200 – C234</b> are 32-bit up / down counters (<code>DCNT</code>); the relay <code>M1200</code> … selects counting down.',
  '<b>C235 and above</b> are high-speed hardware counters for encoders on X0 – X7.')}
${tryIt('In the example below, tap the proximity sensor in Operate mode to count parts. The HMI shows the count and lets you set the target.')}
${open('part-counter', 'Open: Part counter with sensor + HMI')}`,
    },
    {
      id: 'numbers', title: 'Working with numbers',
      html: `
<p>Bits are on / off; <b>words</b> hold numbers. The <b>D registers</b> are the PLC's number memory. Instructions with a <b>D</b> in front (<code>DMOV</code>, <code>DADD</code> …) work on 32 bits: two registers together (<code>D0</code> = low word, <code>D1</code> = high word).</p>
${table(['Instruction', 'Meaning', 'Example'], [
  ['<code>MOV S D</code>', 'Copy a value or register', '<code>MOV K100 D0</code> → D0 = 100'],
  ['<code>ADD S1 S2 D</code>', 'D = S1 + S2', '<code>ADD D0 D1 D2</code>'],
  ['<code>SUB S1 S2 D</code>', 'D = S1 − S2', '<code>SUB D30 D31 D32</code>'],
  ['<code>MUL S1 S2 D</code>', 'D = S1 × S2 (32-bit result in D, D+1)', '<code>MUL D0 K10 D2</code>'],
  ['<code>DIV S1 S2 D</code>', 'D = S1 ÷ S2, D+1 = remainder', '<code>DIV D0 K3 D4</code>'],
  ['<code>INC / DEC</code>', 'Add / subtract 1 (use the pulse form <code>INCP</code> to count once per press)', '<code>INCP D0</code>'],
  ['<code>CMP / ZCP</code>', 'Compare / zone compare → three bits', '<code>CMP D0 K100 M10</code>'],
  ['<code>SCAL</code>', 'Scale: D = S1 × S2 ÷ 1000 + S3', 'convert 0 – 2000 counts to engineering units'],
  ['<code>D0>K10</code> (LD&gt;)', 'A <b>compare contact</b>: conducts when D0 is greater than 10', 'also =, &lt;, ≥, ≤, ≠'],
])}
${ladder([
  { note: 'Start-up values (only in the first scan)', net: ['M1002'], out: ['MOV K300 D60', 'MOV K1500 D40'] },
  { note: 'Fan on when the temperature (0.1 °C) is above the limit', net: ['D50>D60'], out: 'SET M0' },
  { note: 'Keep a copy of the sum', net: ['M1000'], out: 'ADD D0 D1 D2' },
], 'Moving constants, comparing registers and adding — three typical networks.')}
<h3>Scaling and units</h3>
<p>The PLC calculates with <b>whole numbers</b>. Devices that measure tenths of a degree send <code>315</code> for 31.5 °C. Keep the value as it is, and show the decimal point on the HMI (decimals = 1). Compare in the same unit: a limit of 30.0 °C is <code>K300</code>.</p>
<h3>Analog signals (DVP20EX2)</h3>
<p>The EX2 reads 4 analog inputs into <code>D1110 – D1113</code> (0 – 2000 for 0 – 10 V) and writes 2 analog outputs from <code>D1116</code> and <code>D1117</code>. The example <i>Analog speed</i> reads a pot on AI0 and gives the same value to the drive's AVI input.</p>
${open('analog-speed', 'Open: Analog speed: pot → EX2 → VFD')}`,
    },
    {
      id: 'edges', title: 'Edges, SET / RST and pulses',
      html: `
<p>A normal contact is ON for as long as the device is ON. Sometimes you need only the <b>moment</b> it changes:</p>
${ul(
  '<b>Rising-edge contact</b> <code>^X0</code> (LDP) is ON for <b>one scan</b> when X0 goes from OFF to ON.',
  '<b>Falling-edge contact</b> <code>vX0</code> (LDF) is ON for one scan when X0 goes ON → OFF.',
  '<b>PLS / PLF</b> are coils that give a one-scan pulse on the rising / falling edge of the network.',
  'Many instructions have a <b>pulse form</b> with a P at the end: <code>MOVP</code>, <code>INCP</code>, <code>ADDP</code> run once per rising edge instead of in every scan.')}
${ladder([
  { note: 'Count one press, not 1000 scans', net: ['^X0'], out: 'INCP D0' },
  { note: 'Toggle a lamp with one button (ALTP flips M0 on every press)', net: ['^X1'], out: 'ALT M0' },
  { net: ['M0'], out: 'OUT Y0' },
], 'A pulse makes an instruction run once.')}
<h3>SET and RST instead of a holding contact</h3>
${ladder([{ net: ['X0|START'], out: 'SET Y0' }, { net: ['X1|STOP'], out: 'RST Y0' }], 'SET keeps Y0 on until RST. Same job as the self-holding circuit; here STOP is a NO button (X1 = 1 when pressed).')}
${warn('When SET and RST are both ON in the same scan, the one that is <i>lower</i> in the program wins — put RST under SET if "stop" must be stronger than "start".')}`,
    },
    {
      id: 'flow', title: 'Program flow: jumps, subroutines, steps',
      html: `
<p>Bigger programs are easier to read when they are split up.</p>
${ul(
  '<b>CJ P0</b> (conditional jump): when its rung is ON the PLC skips to the network with the pointer label <code>P0</code> — useful for an "auto / manual" split. Set the pointer with ⋯ → <i>Pointer label</i> (or long-press the network number).',
  '<b>CALL P1 … SRET</b>: a subroutine. Put the subroutine after <code>FEND</code> (the end of the main program), mark its first network <code>P1</code> and finish with <code>SRET</code>. <code>CALL P1</code> runs it.',
  '<b>MC / MCR</b>: when the master-control contact is OFF, everything between MC and MCR is switched off.',
  '<b>STL S0 … RET</b> (step ladder): write a sequence as steps. Only the active step runs; <code>SET S21</code> moves to the next step. Great for machines that do one thing after another.',
  '<b>FOR … NEXT</b>: repeat a block n times in one scan.')}
${note('The lab supports the full DVP-ES2/EX2 instruction set — more than 200 instructions. Pick any of them from <b>ƒ API</b>; each shows its name and what the operands mean.')}`,
    },
    {
      id: 'debug', title: 'Testing and finding faults',
      html: `
${ul(
  '<b>Ladder → Monitor</b> shows the power flow. A contact that is not green is the reason the output is off.',
  '<b>Monitor tab → Devices</b> lists X, Y, M, T, C, D live. Tap a device to <b>force</b> it ON / OFF (a forced device shows a mark) — release it when you are done. <b>Watch</b> lets you collect the devices you care about in one list.', '<b>32-bit values</b>: in the keypad tap <b>16-bit</b> to get the D… form (DMOV, DADD …); the value then uses two registers.',
  'The scan time is in <code>D1010</code> (0.1 ms).',
  '<b>Compile / check</b> (⋯ menu) lists errors: an unknown device, X8, a coil in the wrong place, a jump to a missing pointer.')}
<h3>Common mistakes</h3>
${table(['Symptom', 'Usually'], [
  ['Nothing happens after I change the ladder', 'You did not press <b>Download</b>, or the PLC is in <b>STOP</b>.'],
  ['The lamp does not light but Y0 is ON in Monitor', 'Wiring: output common C0 not on +24 V, or the lamp not returned to 0 V.'],
  ['The motor starts by itself / will not stop', 'STOP wired as NO but used as NC (or the other way round). Remember: an NC button gives <b>X = 1</b> at rest.'],
  ['The output flickers', 'The same Y is driven by two <code>OUT</code> instructions (double coil).'],
  ['A timer never finishes', 'Its rung loses power before K is reached, or you counted in the wrong unit (K10 on T0 is 1 s, not 10 s).'],
  ['The counter jumps by many', 'Use a rising-edge contact or a sensor that really toggles once per part.'],
  ['PLC ERROR LED is on', 'Program error or the operand is out of range (for example X19). Check <b>Compile</b>.'],
])}`,
    },
    {
      id: 'exercises', title: 'Exercises',
      html: `
<p>Try these in a <b>blank lab</b> (wire buttons to X0, X1 and lamps to Y0, Y1 as shown in the chapter 3 recipes). The solution is under each task — try first!</p>
<h3>1 · Two-hand safety</h3>
<p>A press may start only when <b>both</b> buttons X0 and X1 are held. Y0 = the press.</p>
${ladder([{ net: ['X0', 'X1'], out: 'OUT Y0' }], 'Series contacts = AND.')}
<h3>2 · Alternating pumps</h3>
<p>Every time the tank calls (X0 rising) the other pump runs: Y0 now, Y1 next time.</p>
${ladder([{ net: ['^X0'], out: 'ALT M0' }, { net: ['X0', 'M0'], out: 'OUT Y0' }, { net: ['X0', '/M0'], out: 'OUT Y1' }], 'ALT flips M0 on each press; the pumps follow M0 and its opposite.')}
<h3>3 · Parts per batch with a reject</h3>
<p>Count good parts on X0. After 10 parts the batch lamp Y0 lights; an operator pressing X2 resets the batch.</p>
${ladder([{ net: ['X0'], out: 'CNT C0 K10' }, { net: ['C0'], out: 'OUT Y0' }, { net: ['X2'], out: 'RST C0' }], 'Counter, lamp and manual reset.')}
${tip('Check your own solutions with <b>Monitor → Devices</b>: press the inputs in Operate mode and watch the devices change.')}`,
    },
  ],
};
