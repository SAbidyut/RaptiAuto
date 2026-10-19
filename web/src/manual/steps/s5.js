import * as A from '../art.js';
import * as S from './art-steps.js';
import { ladder, par } from '../ladder.js';
import { note, tip, warn, tryIt, steps, ul, table, pre } from '../helpers.js';
import { stepLab } from './kit.js';

export default {
  id: 'st-modbus', no: 5, title: 'Modbus made simple', icon: 'network',
  blurb: 'Steps 10–12: RS-485, master and slave, D1120 / M1143, MODRW taken apart, the command word, writing and reading the speed, and finding the mistakes in a student design.',
  sections: [
    {
      id: 'why', title: 'Fewer wires: why Modbus',
      html: `
<p>Step 9 needed a wire for every command (MI1, MI2, MI3 …). With ten drives on a machine that is a lot of wires! With <b>Modbus</b> one two-wire cable (RS-485) does it all — start, stop, direction, speed — and you can read the drive\'s current and fault code back too.</p>
${S.masterSlave()}
${ul(
  '<b>RS-485</b> = the wires (physical): two wires D+ and D−, up to 1200 m.',
  '<b>Modbus RTU</b> = the language: the rules for who says what to whom.',
  'The PLC\'s <b>COM2</b> is its RS-485 port. In the lab one cable runs from PLC COM2 to the drive\'s RJ45 (RS-485).')}
${A.rs485Wiring()}`,
    },
    {
      id: 'setup', title: 'Match the settings on both sides',
      html: `
<p>Two people can only talk if they speak the same language at the same speed. So can the PLC and the VFD:</p>
${table(['', 'PLC (in the program)', 'VFD (parameters)'], [
  ['Speed', 'baud rate in <code>D1120</code>', 'Pr.09-01 = 9.6 (9600 bps)'],
  ['Format', '<code>D1120</code>: 8 bits, Even, 1 stop', 'Pr.09-04'],
  ['Language', '<code>M1143</code> ON = RTU, OFF = ASCII', 'part of Pr.09-04 (RTU / ASCII)'],
  ['Address', 'first operand of MODRW (K1)', 'Pr.09-00 = 1'],
])}
${ladder([{ note: 'Once, on the first scan: 9600, 8, E, 1 (H87), keep the setting (M1120), RTU (M1143)', net: ['M1002'], out: ['MOV H87 D1120', 'SET M1120', 'SET M1143'] }], 'The first rung of every Modbus program.')}
${table(['D1120', 'Meaning', 'VFD Pr.09-04'], [
  ['<code>H87</code>', '9600 bps, 8 bits, Even, 1 stop', '14 (8,E,1 RTU) — M1143 ON'],
  ['<code>H86</code>', '9600 bps, 7 bits, Even, 1 stop', '2 (7,E,1 ASCII) — M1143 OFF'],
  ['<code>H88</code>', '9600 bps, 7 bits, None, 2 stop', '1 (7,N,2 ASCII) — M1143 OFF'],
  ['<code>H81</code>', '9600 bps, 8 bits, None, 1 stop', '12 (8,N,1 RTU) — M1143 ON'],
])}
${warn('If one setting differs the drive does not answer: the PLC sets <code>M1129</code> (time-out). Check the lab says "set to … — it cannot read the frames".')}`,
    },
    {
      id: 'modrw', title: 'MODRW taken apart',
      html: `
${pre(`MODRW  K1    K6    H2000   D10   K1
       │     │     │       │     └─ how many registers (1)
       │     │     │       └─ which D of the PLC to send from / read into
       │     │     └─ which register of the drive (2000H = command)
       │     └─ function: K6 = write one, K3 = read, K16 = write several
       └─ station: which drive (Pr.09-00)`)}
${S.frameSteps()}
${table(['Function', 'Job', 'Example'], [
  ['<b>K3</b> (03)', 'read registers', '<code>MODRW K1 K3 H2103 D20 K2</code> → D20 = Hz, D21 = A'],
  ['<b>K6</b> (06)', 'write one register', '<code>MODRW K1 K6 H2001 D11 K1</code> → speed'],
  ['<b>K16</b> (10H)', 'write several in a row', '<code>MODRW K1 K16 H2000 D10 K2</code> → command + speed together'],
])}
${note('On the ES2 a MODRW sends by itself, again and again, as long as its rung has power — several MODRWs take turns. Older DVPs (ES / SS) needed <code>M1122</code> (send request) set by the program; this lab does not. <code>M1127</code> = done, <code>M1129</code> = time-out.')}`,
    },
    {
      id: 'cmd', title: 'The MS300 registers that matter',
      html: `
${table(['Address', 'What', 'Values'], [
  ['<b>2000H</b>', 'command word (write)', '<code>H1</code> = STOP · <code>H12</code> = RUN forward · <code>H22</code> = RUN reverse · <code>H2</code> = RUN (same direction)'],
  ['<b>2001H</b>', 'speed (write)', 'units of 0.01 Hz: <code>K3000</code> = 30.00 Hz'],
  ['<b>2002H</b>', 'fault reset (write)', '<code>H2</code> = reset'],
  ['<b>2100H</b>', 'fault code (read)', '0 = no fault'],
  ['<b>2103H</b>', 'output frequency (read)', '0.01 Hz'],
  ['<b>2104H</b>', 'output current (read)', '0.01 A'],
])}
<p>Where does the command word come from? It is made of bits: bits 1-0 = <b>10</b> means RUN (01 = STOP), bits 5-4 = <b>01</b> forward, <b>10</b> reverse. So run forward = <code>0001 0010</code> = <b>H12</b>, reverse = <code>0010 0010</code> = <b>H22</b>.</p>`,
    },
    {
      id: 's10', title: 'Step 10 · Start / stop with one cable',
      html: `
${ladder([
  { note: 'START / STOP latch', net: [par(['X0|START'], ['M0']), 'X1|STOP'], out: 'OUT M0' },
  { note: 'Running → H12', net: ['M0'], out: 'MOV H12 D10' },
  { note: 'Stopped → H1', net: ['/M0'], out: 'MOV H1 D10' },
  { note: '2000H ← D10', net: ['M1000'], out: 'MODRW K1 K6 H2000 D10 K1' },
  { note: '2001H ← D11 (30.00 Hz)', net: ['M1000'], out: 'MODRW K1 K6 H2001 D11 K1' },
], 'The heart of step 10 (the first rung sets D1120 / M1143 and D11 = K3000).')}
${steps(
  'Open the lab and Simulate. The PLC LED on the drive\'s keypad is lit — the drive takes outside commands.',
  'Press START → the motor runs at 30 Hz.',
  'Tap the <b>Network</b> chip: small lights (data packets) run along the COM2 cable.',
  'In the <b>Monitor</b> tab the COM2 log shows every TX (PLC → VFD) and RX (reply) frame in hex.')}
${stepLab('step-10-modbus-run', 10)}`,
    },
    {
      id: 's11', title: 'Step 11 · FORWARD / REVERSE / STOP over Modbus',
      html: `
${ladder([
  { note: 'Forward M0 (interlocked)', net: [par(['X0|FORWARD'], ['M0']), 'X2|STOP', '/M1'], out: 'OUT M0' },
  { note: 'Reverse M1 (interlocked)', net: [par(['X1|REVERSE'], ['M1']), 'X2|STOP', '/M0'], out: 'OUT M1' },
  { note: 'Forward → H12', net: ['M0'], out: ['MOV H12 D10', 'OUT Y0'] },
  { note: 'Reverse → H22', net: ['M1'], out: ['MOV H22 D10', 'OUT Y1'] },
  { note: 'Neither → H1', net: ['/M0', '/M1'], out: 'MOV H1 D10' },
  { note: 'Send', net: ['M1000'], out: 'MODRW K1 K6 H2000 D10 K1' },
], 'The logic of step 9 — only a number (D10) is sent instead of switching wires.')}
${stepLab('step-11-modbus-fwd-rev', 11)}`,
    },
    {
      id: 'yours', title: 'Your own design (Lab 67) — finding the mistakes',
      html: `
<p>A typical first Modbus forward / reverse program, written with MODWR — a correct way too (<code>MODWR K1 H2000 D1</code> = write D1 into 2000H of station 1, function 06). A few places need fixing:</p>
${table(['Your rung', 'Problem', 'Fix'], [
  ['<code>X1 — /X1 → M1</code>', 'The same X1 as NO and NC in series — this is <b>never</b> true, so M1 never turns on.', 'Use the REVERSE input and the STOP input: <code>X1 X2 /M0 → M1</code>'],
  ['<code>M1 → MOV H1 D1</code>', '<code>H1</code> means <b>STOP</b>, not reverse.', 'Reverse = <code>MOV H22 D1</code>'],
  ['No STOP rung', 'With no button pressed D1 keeps its old value → the motor keeps running.', '<code>/M0 /M1 → MOV H1 D1</code>'],
  ['<code>MOV H88 D1120</code> + <code>RST M1143</code>', '9600, <b>7 bits, None, 2 stop, ASCII</b>. Fine — if the drive is set the same.', 'VFD Pr.09-04 = <b>1</b> (7,N,2 ASCII). Or RTU on both: <code>H87</code> + <code>SET M1143</code>, Pr.09-04 = 14'],
  ['Speed never written', 'With Pr.00-20 = 1 the speed is 0 Hz unless 2001H is written.', '<code>MODWR K1 H2001 D2</code> with D2 = K3000; or keep Pr.00-20 = 0 and set the speed on the keypad'],
  ['No interlock between FWD and REV', 'Both can be on together.', '<code>/M1</code> in the M0 rung, <code>/M0</code> in the M1 rung'],
])}
${pre(`// corrected version (in your MODWR style)
M1002 ──[MOV H87 D1120]──[SET M1120]──[SET M1143]──[MOV K3000 D2]
X0 ─┬─ X2 ── /M1 ──( M0 )          // FORWARD, STOP (NC) = X2
M0 ─┘
X1 ─┬─ X2 ── /M0 ──( M1 )          // REVERSE
M1 ─┘
M0 ───────────[MOV H12 D1]
M1 ───────────[MOV H22 D1]
/M0 ── /M1 ───[MOV H1 D1]
M1000 ────────[MODWR K1 H2000 D1]   // command
M1000 ────────[MODWR K1 H2001 D2]   // speed 30.00 Hz`)}
${tip('The step 11 lab is exactly this program (written with MODRW). Open it and compare it with yours rung by rung.')}`,
    },
    {
      id: 's12', title: 'Step 12 · Speed up / down, read the drive',
      html: `
${ladder([
  { note: '+5 Hz: once per press', net: ['X2|+5 Hz'], out: 'ADDP D11 K500 D11' },
  { note: '−5 Hz', net: ['X3|−5 Hz'], out: 'SUBP D11 K500 D11' },
  { note: 'Limit 50 Hz', net: ['D11>K5000'], out: 'MOV K5000 D11' },
  { note: 'Read: Hz and current → D20, D21', net: ['M1000'], out: 'MODRW K1 K3 H2103 D20 K2' },
], 'The P of ADDP / SUBP means pulse: it adds once, at the moment the button is pressed.')}
${warn('Without the P (<code>ADD</code>) it adds 500 on every scan (every millisecond) while the button is held — 50 Hz in one press!')}
${stepLab('step-12-modbus-speed', 12)}
${tryIt('Watch D20 in Monitor — it rises slowly as the motor speeds up (acceleration). D21 = current.')}`,
    },
    {
      id: 'trouble', title: 'When Modbus does not work — checklist',
      html: `
${steps(
  'Is the cable there? PLC <b>COM2</b> ↔ VFD <b>RS-485</b>.',
  'Does the drive have power (is its keypad lit)?',
  'Station: is the K1 of MODRW = the drive\'s Pr.09-00?',
  'Format: D1120 + M1143 = Pr.09-01 + Pr.09-04?',
  'Will the drive obey: Pr.00-21 = 2 (RUN / STOP), Pr.00-20 = 1 (speed)?',
  '<code>M1129</code> ON in Monitor? → time-out (no answer). <code>M1140</code> → the drive answered with an "exception" (wrong address).')}
${note('Check the lab (⚠) names almost every mistake — look there first.')}`,
    },
  ],
};
