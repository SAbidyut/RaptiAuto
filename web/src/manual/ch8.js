import * as A from './art.js';
import { ladder, par } from './ladder.js';
import { note, tip, warn, tryIt, steps, ul, table, open, esc } from './helpers.js';
import { LAB_EXAMPLES } from '../plc/examples.js';

const catalog = () => table(['Example', 'Level', 'You learn', ''], LAB_EXAMPLES.filter((e) => e.id !== 'blank').map((e) => [
  `<b>${esc(e.name)}</b>`,
  esc(e.level),
  esc(e.description.length > 150 ? e.description.slice(0, 147).replace(/\s+\S*$/, '') + ' …' : e.description),
  `<button class="mx-open" data-ex="${e.id}" style="margin:0;padding:7px 11px;font-size:13px">▶ Open</button>`,
]));

export default {
  id: 'projects', no: 8, title: 'Projects: build it yourself', icon: 'target',
  blurb: 'Four complete projects from a blank lab, and the list of all ready-made examples.',
  sections: [
    {
      id: 'method', title: 'How to build a project',
      html: `
<p>Every automation project follows the same six steps. Do them in this order and you will always know what went wrong:</p>
${steps(
  '<b>Describe</b> what the machine must do, in plain sentences. What starts it? What stops it? What happens on a fault?',
  '<b>List the inputs and outputs</b> and give each an address (X0 = START, X1 = STOP, Y0 = motor …). Write them as device comments.',
  '<b>Wire</b> the lab (chapter 3) and check with <b>⚠ Check the lab</b> and the Monitor tab.',
  '<b>Write the ladder</b> (chapter 2) — one network for one idea. Compile, Download.',
  '<b>Test</b> every function and every fault: press, release, break a wire, overload the sensor.',
  '<b>Add the HMI</b> (chapter 5) and the drive / Modbus parts (chapters 4 and 6).')}
${tip('Start small. Get a button to switch a lamp first; then add the timer; then the drive. Download and test after every step.')}`,
    },
    {
      id: 'p1', title: 'Project 1 — Conveyor with a part counter',
      html: `
<p><b>Task:</b> A conveyor runs while START has been pressed (STOP stops it). A proximity sensor counts the parts that pass. After 10 parts the conveyor stops for 3 s and the BATCH lamp lights, then the count starts again.</p>
${table(['Address', 'Device', 'Wiring'], [
  ['X0', 'START push button (NO)', '+V1 → 13 · 14 → X0'],
  ['X1', 'STOP push button (NC)', 'START 13 → STOP 11 · 12 → X1'],
  ['X2', 'Proximity sensor (PNP)', 'BN → +V1 · BU → −V1 · BK → X2'],
  ['Y0', 'Conveyor lamp / contactor', 'C0 → +V2 · Y0 → lamp X1 · lamp X2 → −V2'],
  ['Y1', 'BATCH lamp (yellow)', 'Y1 → lamp X1 · lamp X2 → −V2'],
])}
${ladder([
  { note: 'Line latch: START / STOP', net: [par(['X0|START'], ['M0']), 'X1|STOP'], out: 'OUT M0' },
  { note: 'Count the parts only while the conveyor runs', net: ['M0', '^X2|SENSOR'], out: 'CNT C0 K10' },
  { note: 'Batch complete: pause 3 s', net: ['C0'], out: ['OUT Y1', 'TMR T0 K30'] },
  { note: 'Then reset the counter', net: ['T0'], out: 'RST C0' },
  { note: 'The conveyor runs when the line is on and no batch pause', net: ['M0', '/C0'], out: 'OUT Y0' },
], 'The program of Project 1.')}
${steps(
  'Open the <b>Blank lab</b>. Add 1 NO button, 1 NC button, 1 proximity sensor, 2 lamps with <b>＋</b>.',
  'Wire as in the table. Write the ladder. Download. Simulate.',
  'In <b>Operate</b> mode press START, tap the sensor ten times (each tap is a part). Watch C0 in the Monitor tab.')}
${tryIt('Add an HMI with a numeric display on <code>C0</code> (that is a word device too!) and a button for START. Chapter 5 tells you how.')}
${open('blank', 'Open the starter lab (PLC + power)')}`,
    },
    {
      id: 'p2', title: 'Project 2 — Tank filling with two level switches',
      html: `
<p><b>Task:</b> A pump fills a tank. It starts when the level drops below the LOW float, and stops when the level reaches the HIGH float. A selector switch AUTO / OFF enables it. A buzzer sounds if the pump runs for more than 20 s without reaching HIGH (a leak or a dry well).</p>
${table(['Address', 'Device', 'Meaning'], [
  ['X2', 'Float switch LOW (NO)', 'Closed (1) when the liquid is above the low mark.'],
  ['X3', 'Float switch HIGH (NO)', 'Closed (1) when the tank is full.'],
  ['X4', 'Selector (NO)', '1 = AUTO.'],
  ['Y0', 'Pump contactor / lamp', ''],
  ['Y1', 'Buzzer', ''],
])}
${ladder([
  { note: 'Pump run: starts when LOW is open (tank low), holds itself, stops at HIGH or when the selector is OFF', net: [par(['/X2|LOW'], ['M0']), '/X3|HIGH', 'X4|AUTO'], out: 'OUT M0' },
  { note: 'The pump', net: ['M0'], out: 'OUT Y0' },
  { note: 'Watchdog: 20 s of pumping', net: ['M0'], out: 'TMR T0 K200' },
  { note: 'Alarm', net: ['T0', 'M1013'], out: 'OUT Y1' },
], 'The program of Project 2. T0 is reset when M0 ends (the tank is full) so the buzzer stops.')}
${ul(
  'In Operate mode tap the LOW float to lower / raise the level, then the HIGH float.',
  'Extend it: a second pump taking turns (use <code>ALT</code>, chapter 2 exercise 2) or a level display on the HMI (tank object).')}`,
    },
    {
      id: 'p3', title: 'Project 3 — Speed control of a motor over Modbus with an HMI',
      html: `
<p><b>Task:</b> From the HMI the operator starts and stops a conveyor motor, sets its speed (0 – 50 Hz) and reads the actual speed and the current. The PLC talks to the MS300 over RS-485.</p>
${steps(
  'Add to the Blank lab: an <b>MS300</b>, a <b>motor</b>, a <b>DOP-107BV</b>. Wire the drive power (MCB → R/L1, S/L2) and the motor (U V W, PE). Power the HMI from +V2 / −V2; cable <b>HMI COM1 → PLC COM1</b>; cable <b>PLC COM2 → drive RS485</b>.',
  'Set the drive (VFD tab, parameter table): <code>00-20 = 1</code> (frequency from RS-485), <code>00-21 = 2</code> (run from RS-485), <code>09-00 = 1</code>, <code>09-01 = 9.6</code>, <code>09-04 = 14</code> (8E1 RTU).',
  'Write the ladder (below), Download.',
  'Design the HMI: START button <code>M10</code>, STOP button <code>M11</code> (momentary), numeric input <code>D10</code> (2 decimals, 0 – 50 Hz), numeric displays <code>D20</code> (Hz, 2 decimals) and <code>D21</code> (A, 2 decimals), a motor object on <code>M2</code>.',
  'Simulate, Operate: start from the HMI, type 45 → the drive accelerates to 45 Hz.')}
${ladder([
  { note: 'First scan: COM2 = 9600 8E1 RTU; start speed 30.00 Hz', net: ['M1002'], out: ['MOV H87 D1120', 'SET M1120', 'SET M1143', 'MOV K3000 D10'] },
  { note: 'Run latch from the HMI', net: [par(['M10|HMI START'], ['M2']), '/M11|HMI STOP'], out: 'OUT M2' },
  { note: 'Command word: H12 run forward · H1 stop', net: ['M2'], out: 'MOV H12 D0' },
  { net: ['/M2'], out: 'MOV H1 D0' },
  { note: 'Write 2000H and 2001H; read 2103H, 2104H', net: ['M1000'], out: ['MODRW K1 K6 H2000 D0 K1', 'MODRW K1 K6 H2001 D10 K1', 'MODRW K1 K3 H2103 D20 K2'] },
], 'The program of Project 3 (it is the same pattern as the example "VFD speed control · Modbus RTU + HMI").')}
${open('vfd-modbus-hmi', 'Open the finished example to compare')}`,
    },
    {
      id: 'p4', title: 'Project 4 — Oven with a PID controller and alarms',
      html: `
<p><b>Task:</b> Keep an oven at a temperature set on the HMI. Light a READY lamp when it is within ±3 °C for 10 s. Sound a buzzer if the oven is more than 20 °C above the SV or if the controller stops answering.</p>
${steps(
  'Add a <b>DTB4848</b> (power: <code>L</code> / <code>N</code> from the supply; <b>PLC COM2 → DTB RS485</b>). In its settings choose station 1, 9600, 8E1, RTU.',
  'Ladder: first-scan COM2 setup (chapter 6), <code>MODRW K1 K3 H1000 D30 K2</code> (PV, SV), <code>MODRW K1 K6 H1001 D40 K1</code> (SV from the HMI), the stability timer and the alarms (see chapter 7).',
  'HMI: PV meter, SV input (<code>D40</code>), a trend, READY and ALARM lamps.',
  'Test: change the SV, watch the PV; tap the DTB and press Auto-tune; break the RS-485 cable and see the alarm.')}
${open('pid-oven-recipes', 'Open the finished example: PID oven line')}`,
    },
    {
      id: 'catalog', title: 'All the ready-made examples',
      html: `
<p>In <b>PLC Lab → Examples</b> (and in the <b>Examples</b> tab of the app) you find these projects. Each opens as your own copy with the wiring, the ladder, the HMI screens and a task list.</p>
${catalog()}`,
    },
  ],
};
