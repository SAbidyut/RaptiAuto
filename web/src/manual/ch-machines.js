import * as A from './art.js';
import { ladder, par } from './ladder.js';
import { note, tip, warn, tryIt, steps, ul, table, open } from './helpers.js';

export default {
  id: 'machines', no: 9, title: 'Motors, machines and fault finding', icon: 'factory',
  blurb: 'The 3-phase supply, DOL / reversing / star-delta starters, the overload relay, a conveyor, a tank, pneumatic sequences with SFC, encoders, and finding faults with the multimeter.',
  sections: [
    {
      id: 'mains3', title: 'The 3-phase supply and the 6-terminal motor',
      html: `
<p>Industrial motors run on the <b>3-phase mains</b>: three live conductors <b>L1 L2 L3</b>, the neutral <b>N</b> and the protective earth <b>PE</b>. The lab's <b>Main supply 3~ 400 V</b> feeds them through a 4-pole breaker (Q1).</p>
${table(['Between', 'Voltage', 'Used for'], [
  ['Two phases (L1–L2, L2–L3, L3–L1)', '400 V', 'Motors, the windings in delta'],
  ['A phase and N (L1–N)', '230 V', 'Power supply, PLC, 230 V contactor coils, lamps'],
  ['A phase and PE', '230 V', 'Never a working circuit — PE only carries a fault current'],
])}
<p>The <b>1.5 kW motor</b> has all six ends of its three windings in the terminal box: <code>U1–U2</code>, <code>V1–V2</code>, <code>W1–W2</code>. How you join them decides the voltage each winding gets:</p>
${A.motorBox()}
${ul(
  '<b>Delta (Δ)</b> — the links join U1–W2, V1–U2, W1–V2: every winding sits between two phases, <b>400 V</b>. This is the motor\'s running connection (its plate says <i>400 V Δ</i>).',
  '<b>Star (Y)</b> — W2 U2 V2 are tied together: every winding gets 400 V / √3 = <b>230 V</b>. The current and the torque drop to <b>one third</b>.',
  '<b>Direction</b> — L1 → L2 → L3 is the phase sequence. Swap <i>any two</i> phases and the motor turns the other way.')}
${note('Tap the motor → Settings to fit the Δ links, the Y links or none (for a star-delta starter). The 3D lab shows the bars in the terminal box.')}
${warn('A phase-to-phase short circuit trips the main breaker at once — the lab tells you which phases touched. Switch Q1 back ON after you have fixed the cause.')}`,
    },
    {
      id: 'dol', title: 'Direct-on-line and reversing starters',
      html: `
<p>The simplest starter switches the motor <b>straight onto the mains</b> with a contactor: <b>Q1 → KM1 → F1 (overload relay) → motor</b>. The PLC only switches the contactor <i>coil</i> (24 V or 230 V); the contactor's main contacts carry the motor current.</p>
<p>A <b>reversing starter</b> has a second contactor KM2 that feeds the motor with <b>two phases swapped</b>:</p>
${A.reversingPower()}
${ladder([
  { note: 'Forward latch: FWD sets it; STOP and F1 95–96 (both NC) break it; never while reverse runs', net: [par(['X0|FWD'], ['M0']), 'X2|STOP', 'X3|F1', '/M1'], out: 'OUT M0' },
  { note: 'Reverse latch: the same, the other way round', net: [par(['X1|REV'], ['M1']), 'X2|STOP', 'X3|F1', '/M0'], out: 'OUT M1' },
  { note: 'KM1 — software interlock with KM2', net: ['M0', '/Y1|KM2'], out: 'OUT Y0' },
  { note: 'KM2 — software interlock with KM1', net: ['M1', '/Y0|KM1'], out: 'OUT Y1' },
], 'The ladder of the reversing starter: two latches, each locked out by the other, and the contactors interlocked once more.')}
${warn('KM1 and KM2 closed together short L1 to L3. That is why the interlock is done <b>twice</b>: in the ladder (<code>/Y1</code>, <code>/Y0</code>) and in the wiring — each coil is fed through the other contactor\'s NC auxiliary contact 21–22. Even if a contactor welds or someone pushes it in by hand, the other one cannot pull in.')}
${tryIt('In the example, press FWD, then hold KM2 in by hand (tap it): the main breaker trips with "short circuit between L1 and L3".')}
${open('dol-reversing')}`,
    },
    {
      id: 'star-delta', title: 'The star-delta starter',
      html: `
<p>Started direct on line, a motor takes about <b>6 × its rated current</b> for a second or two. On a weak supply that dips the voltage for everybody. A <b>star-delta starter</b> starts the motor in star (⅓ of the current and the torque) and switches to delta once it is up to speed.</p>
${table(['Contactor', 'Connects', 'When'], [
  ['KM1 main', 'L1 L2 L3 → U1 V1 W1', 'the whole time the motor runs'],
  ['KM3 star', 'W2 U2 V2 joined together', 'the first seconds (T0)'],
  ['KM2 delta', 'W2 U2 V2 → L1 L2 L3', 'after T0 and a short pause'],
])}
${A.starDeltaTiming()}
${ladder([
  { note: 'Run latch', net: [par(['X0|START'], ['M0']), 'X1|STOP', 'X2|F1'], out: 'OUT M0' },
  { note: 'KM1 main', net: ['M0'], out: 'OUT Y0' },
  { note: 'Star time 5 s', net: ['M0'], out: 'TMR T0 K50' },
  { note: 'KM3 star until T0 — never with KM2', net: ['M0', '/T0', '/Y2|KM2'], out: 'OUT Y1' },
  { note: 'A 0.2 s pause once KM3 has opened', net: ['M0', 'T0', '/Y1|KM3'], out: 'TMR T1 K2' },
  { note: 'KM2 delta — never with KM3', net: ['M0', 'T1', '/Y1|KM3'], out: 'OUT Y2' },
], 'The star-delta program of the example.')}
${ul(
  '<b>The pause</b> (T1) lets the arc in KM3 die before KM2 closes — otherwise the phases short through the arc.',
  '<b>KM2 and KM3 together</b> short the phases through the star point: interlock them in the ladder and with their NC contacts.',
  '<b>F1 in the winding branch</b> — in the example KM2 is fed from F1\'s line side, so F1 carries the winding current: set it to <b>0.58 × the rated current</b> (3.4 A × 0.58 = 2.0 A).')}
${tip('Watch the <b>Monitor</b> tab while it starts: the motor current, the speed, and the star current dropping to a third.')}
${open('star-delta')}`,
    },
    {
      id: 'olr', title: 'The thermal overload relay and motor faults',
      html: `
<p>The overload relay <b>F1</b> sits under the contactor. Three bimetal strips heat up with the motor current; set the dial to the motor's <b>rated current</b>. When it trips, its NC contact <b>95–96 opens</b> (wire it in series with the coil, or to a PLC input as in the examples) and the NO <b>97–98</b> closes for a fault lamp.</p>
${table(['Current (× setting)', 'Class 10 relay trips after', 'Typical cause'], [
  ['1.05 ×', 'never (within 2 h)', 'normal running'],
  ['1.2 ×', 'many minutes', 'a heavy load'],
  ['1.5 – 2 ×', '1 – 2 minutes', 'overload, a setting that is too low'],
  ['6 – 7 ×', '4 – 10 s', 'a stalled motor, a lost phase'],
])}
<p><b>Single phasing</b> — one phase lost (a blown fuse, a burnt contact, a loose wire): a standing motor <b>hums and does not start</b>, a running one slows down and draws much more current in the two remaining phases. The overload relay must trip it.</p>
${tryIt('In the star-delta example, delete the wire F1 T3 → motor W1 and press START: the motor hums (you hear it), the current is several times too high, and after a few seconds F1 trips. Undo the change afterwards.')}
${note('After a trip the bimetals must cool down before RESET works — just like a real relay. Find the cause first: a relay that trips again and again is telling you something.')}`,
    },
    {
      id: 'conveyor', title: 'Process model: the sorting conveyor',
      html: `
<p>The <b>belt conveyor</b> is a small machine on the bench: a feeder at the left puts boxes on the belt, the gear motor (here on the MS300 drive) moves it, four PNP sensors watch it and a pneumatic pusher can kick a box into the reject chute.</p>
${A.conveyorTop()}
${table(['Sensor', 'Kind', 'PLC input', 'Sees'], [
  ['S1', 'photo-eye at the entry', 'X0', 'every box'],
  ['S2', 'inductive, above the belt', 'X1', '<b>only metal</b>'],
  ['S3', 'photo-eye in front of the pusher', 'X2', 'every box'],
  ['S4', 'photo-eye at the end', 'X3', 'every box'],
])}
${ladder([
  { note: 'S2 sees metal → remember it', net: ['^X1|S2'], out: 'SET M10' },
  { note: 'The box reaches the pusher (S3) and it was metal → push', net: ['^X2|S3', 'M10'], out: 'SET M11' },
  { note: 'Pusher stroke 0.4 s', net: ['M11'], out: 'TMR T0 K4' },
  { note: 'Pusher valve while the stroke runs', net: ['M11', '/T0'], out: 'OUT Y0' },
  { note: 'Stroke done: forget the box, count it', net: ['T0'], out: ['RST M11', 'RST M10', 'CNT C1 K9999'] },
], 'Sorting: a flag (M10) carries "this box is metal" from S2 to the pusher.')}
${tip('Tap the feeder to drop a box by hand, or tap the conveyor → Settings → <b>Box feeder</b> (automatic every 4 s or 2 s) and <b>Boxes</b> (metal, plastic or mixed).')}
${tryIt('Feed every 2 s: now two boxes can be between S2 and S3 and the single flag M10 is not enough — the wrong box gets pushed. A real machine tracks every box with a shift register (<code>SFTL</code>) or with the encoder position.')}
${open('conveyor-sort')}`,
    },
    {
      id: 'tank', title: 'Process model: the water tank',
      html: `
<p>The <b>tank</b> has a 24 V pump that fills it from the sump, a 24 V drain valve, a hand valve at the bottom (the consumer — tap the tank to open it), two <b>float switches</b> and a <b>level transmitter</b> (0–10 V for 0–360 mm, on an analog input of the DVP20EX2).</p>
${A.tankHysteresis()}
${ul(
  '<b>LL</b> (low float, X0) is closed while the water is above the low mark, <b>LH</b> (high float, X1) closes at the high mark.',
  'In AUTO the pump starts when LL opens and keeps running (self-holding) until LH closes — <b>two-point control</b>.',
  'The transmitter value <code>D1110</code> (0 … 2000) becomes per cent with <code>DIV D1110 K20 D100</code>; the HMI shows it as a bar and a trend.')}
${warn('In HAND mode a jog button must still be stopped by the high float — never let an operator overflow the tank. The example does it with <code>/X1</code> in the jog branch.')}
${open('tank-level')}`,
    },
    {
      id: 'sfc', title: 'Sequences: STL steps and the live SFC view',
      html: `
<p>Many machines do <b>one thing after another</b>: extend A, then extend B, then retract B, then retract A. Write that as a <b>step ladder</b> (<code>STL</code>): each step <code>S20 … S23</code> has its own little program, and only the <b>active</b> step runs. <code>SET S21</code> inside S20 moves to the next step — and switches S20 off.</p>
${A.sfcChart()}
${table(['SFC element', 'In the ladder'], [
  ['Initial step (double frame)', '<code>S0</code> … <code>S9</code>, set on the first scan: <code>M1002 → SET S0</code>'],
  ['Step', 'a network that starts with the <code>STL Sn</code> contact'],
  ['Action', 'every output in the step: <code>OUT</code>, <code>SET</code>, <code>RST</code>, timers …'],
  ['Transition', 'a row in the step with <code>SET Sm</code> (or <code>OUT Sm</code> for a jump back)'],
  ['End', '<code>RET</code> after the last step'],
])}
${steps(
  'Open the pneumatic example, press <b>Simulate</b> and <b>START</b>.',
  'Open the <b>Ladder</b> tab and tap <b>SFC</b> in its toolbar: the program is drawn as a chart.',
  'Watch it live: the <b>active step is green</b>, its transition turns <b>yellow</b> as soon as the condition is true, and the chart scrolls to follow the active step.',
  'Turn CYCLE ON: S23 jumps back to S20 and the sequence repeats.')}
${tip('Each step waits for a sensor (the reed switch "A out", "B back" …), not for a time. Make cylinder B slow (tap it → Settings → Speed) and the sequence still works — it simply waits longer.')}
${open('pneumatic-sequence')}`,
    },
    {
      id: 'encoder', title: 'Encoders and high-speed counters',
      html: `
<p>An <b>incremental encoder</b> on the motor shaft gives a number of pulses per turn (<b>PPR</b>, here 100) on two channels <b>A</b> and <b>B</b>, 90° apart, and one <b>Z</b> pulse per turn. At 1440 rpm that is 2400 pulses per second — far too fast for a normal input that is read once per scan. The DVP's <b>high-speed counters</b> count them in hardware.</p>
${A.quadrature()}
${table(['Counter', 'Inputs', 'Counts'], [
  ['C235 … C242', 'X0 … X7 (one each)', 'pulses on one input; M1235 … M1242 ON = count down'],
  ['C251', 'X0 = A, X1 = B', 'A/B phase: up forwards, down backwards'],
  ['C252 / C253 / C254', 'X2/X3 · X4/X5 · X6/X7', 'the same on the other input pairs'],
])}
${ladder([
  { note: 'The A/B counter runs all the time', net: ['M1000'], out: 'DCNT C251 K2000000000' },
  { note: 'RESET clears the position', net: ['X2|RESET'], out: 'RST C251' },
  { note: 'SPD: pulses on X0 in 1000 ms → D0', net: ['M1000'], out: 'SPD X0 K1000 D0' },
  { note: 'rpm = pulses/s × 60 / 100 PPR', net: ['M1000'], out: ['MUL D0 K6 D10', 'DIV D10 K10 D12'] },
], 'Position and speed from the encoder: C251 counts the position, SPD measures the speed.')}
${ul(
  '<b>Position</b> — C251 / PPR = turns. On the conveyor\'s head pulley 1 pulse = 1 mm of belt.',
  '<b>Speed</b> — <code>SPD</code> counts the pulses in a time window: 1473 pulses in 1 s = 884 rpm with 100 PPR.',
  '<b>Compare</b> — <code>DHSCS K5000 C251 Y0</code> sets Y0 the moment the counter reaches 5000, without waiting for the scan.')}
${note('Turn on the encoder with the motor\'s Settings (100, 360 or 1000 PPR). Wire E+ / E0 to the 24 V supply and A / B to X0 / X1; S/S goes to 0 V for these PNP outputs.')}
${open('encoder-speed')}`,
    },
    {
      id: 'faults', title: 'Fault finding with the multimeter',
      html: `
<p>The tool rail has a <b>Multimeter</b>. Tap it, then tap two terminals: the first is the <b>red</b> probe, the second the black <b>COM</b>. The meter shows what a real one would:</p>
${table(['Mode', 'Use it', 'Reads'], [
  ['<b>V ~⎓</b>', 'with the power <b>on</b>', 'AC (400 V between phases, 230 V to N) or DC (24 V, the PLC inputs)'],
  ['<b>Ω ♪</b>', 'with the power <b>off</b> (Q1 / MCB off, or the simulation stopped)', 'coils (≈ 62 Ω), windings, lamps, contacts — beeps for continuity, OL for open'],
])}
${A.voltageHunt()}
<h3>The method</h3>
${steps(
  '<b>Operate the machine</b> and note exactly what does not work (no motor, but the lamp lights? only in reverse?).',
  '<b>Read the drawing</b>: which circuit makes that function? Power (400 V) or control (24 V)?',
  '<b>Measure voltages</b> with the power on: black probe on 0 V (or N), walk the red probe along the circuit from the supply. The fault is between the last good reading and the first bad one.',
  '<b>Confirm with Ω</b> with the power off: a broken wire reads OL from end to end; a burnt contact stays OL when it should close; a burnt coil or lamp reads OL across it.',
  '<b>Report</b> the fault, repair it, test the machine again.')}
<h3>The fault-finding challenge</h3>
<p>Tap <b>Fault finding</b> on the tool rail: the lab hides a fault — a broken wire, a burnt contactor contact, an open coil, a lamp, a sensor, a motor winding. Choose <b>Easy</b> (with a hint), <b>Normal</b> or <b>Hard</b> (two faults); a teacher can pick the faults instead. Find it, tap <b>Report</b>, tap the wire or device and say what is wrong. The time, the number of measurements and wrong reports give your score (★★★), and the best score of every lab is kept.</p>
${warn('Ω on a live circuit is refused ("LIVE") — on a real meter it can blow the fuse or the meter. Always switch off and check that it is dead (V mode) before you measure resistance.')}
${tip('Ω readings can include parallel paths: two PLC inputs share S/S, so from one input wire to another you may read a few kΩ through the input circuits. Voltage readings with the power on are usually quicker and clearer.')}
${open('dol-reversing', 'Open the reversing starter to practise')}`,
    },
  ],
};
