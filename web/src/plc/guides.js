// The Guide inside a lab: a step-by-step walk-through of the open project. Every lab gets the parts
// list, the wiring list (wire by wire), the program rung by rung and how to build it yourself, all
// generated from the project; the Step-by-step labs add hand-written explanations: the goal, every
// rung in plain words, how to run and test it, what to watch, things to try and fault finding.
import { DEVICE_DEFS, deviceProps, findPort, hasLabel } from './devices/defs.js';
import { rungIL } from './sim/ladder.js';
import { PARAM_BY_ID } from './sim/vfd.js';
import { LAB_TASKS } from './tasks.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ol = (items) => `<ol class="mx-steps">${items.map((i) => `<li>${i}</li>`).join('')}</ol>`;
const ul = (items) => `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
const c = (t) => `<code>${esc(t)}</code>`;

// the first steps of every lab: power, RUN, Operate
const START = [
  'Press the green <b>Simulate</b> button (top right). The panel gets power and the PLC switches to <b>RUN</b> — the status bar shows <b>PLC RUN</b>.',
  'Choose <b>Operate</b> (top left) so that a tap presses a button instead of starting a wire.',
];
const MODBUS_TROUBLE = [
  ['The motor does not start and <code>M1129</code> is ON (Monitor)', 'The drive does not answer: check the RS-485 cable (PLC COM2 ↔ VFD RS-485), the drive\'s power, its station Pr.09-00 = 1 and its format Pr.09-01 = 9.6, Pr.09-04 = 14 (8,E,1 RTU) — the same as D1120 = H87 with M1143 ON.'],
  ['The drive answers but ignores the commands', 'Pr.00-21 must be 2 (run command from RS-485) and Pr.00-20 must be 1 (speed from RS-485). Check the lab (⚠) names the parameter.'],
  ['You changed the program but nothing changed', 'Press <b>Download</b> in the Ladder tab — the PLC runs the program that was downloaded, not the one on the screen.'],
];
const AD_TROUBLE = [
  ['Every value is 0 and <code>M1067</code> is ON', 'The module has no 24 V: wire its 24V terminal to +24 V and 24G to 0 V (here from the PLC\'s own +24V / 24G).'],
  ['The value stays 0 although the module has power', 'The signal is not wired: transmitter BK → V+ of the channel, and the channel common VI− must go to the transmitter\'s 0 V (BU).'],
  ['The value is wrong by a fixed amount', 'Check the channel\'s mode in CR#1 (TO K0 K1 …): a 4–20 mA signal read in mode 0 reads 4 mA as 6400, not 0.'],
];

/** Hand-written parts of the guides of the Step-by-step labs. `rungs` explains every network in order. */
export const STEP_GUIDES = {
  'step-01-button-lamp': {
    course: ['st-ladder', 's1'],
    goal: 'Make a lamp light while a push button is held down. It is the smallest PLC program there is — one contact and one coil — and it shows the whole path: button → input X0 → program → output Y0 → lamp.',
    learn: ['what an input (X) and an output (Y) are', 'how a NO contact passes power', 'how to run a lab and watch the live ladder'],
    rungs: [
      'Contact ' + c('X0') + ' is a normally open (NO) contact: it passes power while input X0 is ON, i.e. while the PUSH button is pressed. The power reaches the coil ' + c('OUT Y0') + ', so output Y0 is ON; the PLC\'s relay Y0 closes and the lamp gets 24 V. Release the button: X0 OFF → no power → Y0 OFF.',
    ],
    run: [
      ...START,
      'Tap and <b>hold</b> the green <b>PUSH</b> button on the console. The <b>LAMP</b> lights.',
      'Look at the PLC: the <b>IN 0</b> LED and the <b>OUT 0</b> LED are lit while you hold the button.',
      'Let go — the lamp and both LEDs go out.',
      'Open the <b>Ladder</b> tab and press the button again: the path the power takes turns <b>green</b>.',
    ],
    watch: ['Monitor tab: type ' + c('X0') + ' and ' + c('Y0') + ' — they change together.'],
    tryIt: ['Make the contact NC (' + c('/X0') + '): tap it in the Ladder tab, choose the NC contact, <b>Download</b>. The lamp is now on all the time and goes out while you press.', 'Add a second lamp on Y1 and the rung ' + c('X0 → OUT Y1') + '.'],
    trouble: [['Nothing lights', 'Is the lab running (Simulate)? Are you in Operate mode? Without Operate a tap starts a wire.']],
  },
  'step-02-no-nc': {
    course: ['st-ladder', 's2'],
    goal: 'See the difference between a normally open (NO) and a normally closed (NC) contact. One button drives two lamps: green through a NO contact, red through an NC contact.',
    learn: ['NO contact = passes when the address is ON', 'NC contact = passes when the address is OFF', 'the ladder\'s NO / NC is not the button\'s NO / NC'],
    rungs: [
      'NO contact ' + c('X0') + ': passes power only while X0 is ON (button pressed) → ' + c('OUT Y0') + ', the green lamp.',
      'NC contact ' + c('/X0') + ': passes power while X0 is OFF (button not pressed) → ' + c('OUT Y1') + ', the red lamp. As soon as you press, X0 turns ON and this contact opens.',
    ],
    run: [
      ...START,
      'Without touching anything the <b>red (NC)</b> lamp is lit and the green one is off.',
      'Hold the <b>PUSH</b> button: green on, red off.',
      'Let go: back to red.',
    ],
    watch: ['Ladder tab: in rest the second rung is green, while pressed the first one.'],
    tryIt: ['Change rung 2 to ' + c('X0') + ' (NO) and Download — now both lamps do the same.'],
    trouble: [['Both lamps stay dark', 'C0 (the common of Y0–Y3) must be wired to +24 V, the lamps\' X2 to 0 V.']],
  },
  'step-03-latch': {
    course: ['st-ladder', 's3'],
    goal: 'Start a motor with one press of START and keep it running after the button is released, until STOP is pressed. This "self-holding" or "latch" circuit is in almost every machine.',
    learn: ['the self-holding contact', 'why STOP is an NC button', 'NC button → NO contact in the ladder'],
    rungs: [
      'Two parallel paths lead to ' + c('OUT Y0') + ': the START contact ' + c('X0') + ' and Y0\'s own contact ' + c('Y0') + '. Press START → Y0 ON → the ' + c('Y0') + ' contact closes, so when START is released the power still flows through it: Y0 holds itself. In series with both is ' + c('X1') + ', the STOP button. STOP is an <b>NC</b> button, so X1 is normally ON and the NO contact X1 passes power; pressing STOP turns X1 OFF, the path breaks and Y0 drops out.',
    ],
    run: [
      ...START,
      'Press <b>START</b> once and let go — the <b>RUN</b> lamp stays on.',
      'Open the <b>Ladder</b> tab: the green power now flows through the lower ' + c('Y0') + ' contact, not through X0.',
      'Press <b>STOP</b> — the lamp goes out and stays out.',
    ],
    watch: ['Monitor: X1 is ON while nobody touches STOP (the NC contact is closed).'],
    tryIt: ['Add a second START button on X2 in parallel with X0 (start from two places).', 'Delete the ' + c('Y0') + ' contact and Download — now the lamp only stays on while you hold START.'],
    trouble: [['The lamp never lights', 'If the ladder has ' + c('/X1') + ' instead of ' + c('X1') + ' the NC STOP button blocks it all the time. NC button → NO contact.']],
  },
  'step-04-set-rst': {
    course: ['st-ladder', 's4'],
    goal: 'Latch an output with SET and release it with RST — the same job as step 3, written as two rungs.',
    learn: ['SET keeps an output ON until it is reset', 'RST switches it OFF', 'when two rungs write the same output, the lower one wins'],
    rungs: [
      'While the ON button (' + c('X0') + ') is pressed, ' + c('SET Y0') + ' switches Y0 ON. When you let go nothing switches it off — SET does not undo itself.',
      'While the OFF button (' + c('X1') + ') is pressed, ' + c('RST Y0') + ' switches Y0 OFF. This rung comes after rung 1, so if both buttons are held it has the last word: OFF wins.',
    ],
    run: [
      ...START,
      'Press <b>ON</b> once — the yellow lamp stays on.',
      'Press <b>OFF</b> — it goes out.',
      'Hold both buttons at the same time — the lamp stays off (the lower RST rung wins).',
    ],
    watch: ['Ladder tab: with the lamp on, neither rung is green — Y0 stays ON without power.'],
    tryIt: ['Swap the two rungs and hold both buttons: now ON wins.'],
    trouble: [],
  },
  'step-05-timer': {
    course: ['st-timer', 's5'],
    goal: 'Do something a fixed time after a start command: START lights a WAIT lamp, after 5 seconds the DONE lamp takes over.',
    learn: ['the 100 ms timer TMR', 'K50 = 50 × 0.1 s = 5 s', 'the timer contact T0'],
    rungs: [
      'A start / stop latch on the internal bit ' + c('M0') + ': START (' + c('X0') + ') sets it, M0 holds itself, the NC STOP button (' + c('X1') + ') breaks it.',
      'While M0 is ON the timer ' + c('TMR T0 K50') + ' counts in steps of 100 ms. At 50 counts (5 s) the T0 contact turns ON. When M0 goes OFF, T0 goes back to 0.',
      c('M0') + ' AND NOT ' + c('T0') + ' → ' + c('Y0') + ': the yellow WAIT lamp is on while the timer is still running.',
      c('T0') + ' → ' + c('Y1') + ': once the 5 s are up the green DONE lamp lights.',
    ],
    run: [
      ...START,
      'Press <b>START</b>. The yellow <b>WAIT</b> lamp lights.',
      'Open <b>Monitor</b> and type ' + c('T0') + ': the value climbs 0 → 50.',
      'At 50 the <b>DONE</b> lamp lights and WAIT goes out.',
      'Press <b>STOP</b>: both lamps off, T0 back to 0.',
    ],
    watch: ['Monitor: T0 (present value) and M0.'],
    tryIt: ['Make it 10 s: ' + c('TMR T0 K100') + ', Download.', 'Make DONE flash: ' + c('T0 M1013 → OUT Y1') + '.'],
    trouble: [['DONE never lights', 'The timer only counts while M0 is ON — is the latch holding (step 3)?']],
  },
  'step-06-blink': {
    course: ['st-timer', 's6'],
    goal: 'Flash an alarm lamp once a second with the PLC\'s built-in clock bit M1013 — no timer needed.',
    learn: ['special M bits that the PLC drives itself', 'M1013 = 1 s clock, M1012 = 0.1 s, M1000 = always ON, M1002 = first scan'],
    rungs: [
      'Selector ' + c('X0') + ' in series with the clock bit ' + c('M1013') + ' → ' + c('OUT Y0') + '. M1013 is ON for 0.5 s and OFF for 0.5 s, all by itself; while the selector is ON the lamp follows it.',
    ],
    run: [
      ...START,
      'Tap the <b>BLINK</b> selector to turn it ON. The red <b>ALARM</b> lamp flashes once a second.',
      'Turn the selector OFF — the lamp stays dark.',
    ],
    watch: ['Monitor: type ' + c('M1013') + ' and watch it switch by itself.'],
    tryIt: ['Use ' + c('M1012') + ' (0.1 s) — a fast flash.', 'Flash only after 3 s: add a timer like step 5.'],
    trouble: [],
  },
  'step-07-counter': {
    course: ['st-timer', 's7'],
    goal: 'Count button presses: after 5 presses a FULL lamp lights, RESET clears the count. Exactly how a PLC counts boxes on a conveyor.',
    learn: ['the counter CNT counts rising edges', 'the counter contact C0', 'a counter needs RST'],
    rungs: [
      c('CNT C0 K5') + ' adds one each time ' + c('X0') + ' changes from OFF to ON (the moment the press starts). Holding the button counts only once.',
      'When the count reaches 5 the ' + c('C0') + ' contact turns ON → ' + c('OUT Y0') + ', the FULL lamp.',
      c('X1') + ' (RESET) → ' + c('RST C0') + ': count back to 0, the C0 contact OFF.',
    ],
    run: [
      ...START,
      'Open <b>Monitor</b> and type ' + c('C0') + '.',
      'Press <b>COUNT</b> five times — the value goes 1, 2 … 5 and at 5 the <b>FULL</b> lamp lights.',
      'Press <b>RESET</b> — back to 0, the lamp goes out.',
    ],
    watch: ['Monitor: C0 (the count).'],
    tryIt: ['Count to 10 (' + c('K10') + ').', 'Reset automatically 2 s after FULL with a timer.'],
    trouble: [],
  },
  'step-08-vfd-run': {
    course: ['st-vfd', 's8'],
    goal: 'Start and stop a 3-phase motor through a Delta MS300 drive: the PLC\'s relay output Y4 joins the drive\'s MI1 input to DCM, which is the drive\'s "run forward" command.',
    learn: ['the drive\'s control terminals MI1 and DCM', 'Pr.00-20 (speed source) and Pr.00-21 (run source)', 'using the second output group C1 for the drive'],
    rungs: [
      'The usual start / stop latch on ' + c('M0') + ' (START ' + c('X0') + ', NC STOP ' + c('X1') + ').',
      c('M0') + ' → ' + c('OUT Y4') + '. Relay Y4 closes the contact Y4–C1; C1 is wired to the drive\'s DCM and Y4 to MI1, so MI1 is joined to DCM and the drive runs forward at the keypad speed.',
    ],
    run: [
      ...START,
      'Open the <b>VFD</b> tab and check: Pr.00-21 = 1 (terminals), Pr.00-20 = 0 (keypad). The display shows the set frequency.',
      'Back in <b>Lab</b>, press <b>START</b>. The drive ramps up (Pr.01-12 = 3 s) and the motor turns.',
      'Press <b>STOP</b> — the drive ramps down to 0 Hz.',
      'In the VFD tab press ▲ on the keypad while it runs: the speed changes.',
    ],
    watch: ['The status bar shows the output Hz; the motor\'s rpm is on its nameplate tag in 3D.'],
    tryIt: ['Pr.01-12 = 1 s: faster start.', 'Add a RUN lamp on Y0.'],
    trouble: [['START does nothing', 'Pr.00-21 must be 1 (terminals). C1 must be wired to DCM, Y4 to MI1.'], ['The drive runs at 0 Hz', 'Set a frequency on the keypad (▲), Pr.00-20 = 0.']],
  },
  'step-09-vfd-fwd-rev': {
    course: ['st-vfd', 's9'],
    goal: 'Run the motor forward or reverse from two buttons, with an interlock so both directions can never be commanded at once.',
    learn: ['MI1 = forward, MI2 = reverse (Pr.02-00 = 1)', 'the interlock: each latch contains the other\'s NC contact'],
    rungs: [
      'Forward latch ' + c('M0') + ': FWD (' + c('X0') + ') or M0 itself, in series with STOP (' + c('X2') + ', NC button) and ' + c('/M1') + ' — it cannot start while reverse runs.',
      'Reverse latch ' + c('M1') + ': REV (' + c('X1') + ') or M1, in series with STOP and ' + c('/M0') + '.',
      c('M0') + ' → ' + c('Y4') + ' (MI1, forward) and ' + c('Y0') + ' (FWD lamp).',
      c('M1') + ' → ' + c('Y5') + ' (MI2, reverse) and ' + c('Y1') + ' (REV lamp).',
    ],
    run: [
      ...START,
      'Press <b>FWD</b>: the FWD lamp lights and the motor turns forward.',
      'While it runs press <b>REV</b>: nothing happens — the interlock.',
      'Press <b>STOP</b>, wait until the motor stops, then <b>REV</b>: it turns the other way (the status bar shows a negative frequency).',
    ],
    watch: ['Monitor: M0 and M1 are never ON together.'],
    tryIt: ['Remove ' + c('/M1') + ' and ' + c('/M0') + ', Download, press FWD and REV — both bits turn on. Put them back!', 'Add a 3 s pause before a direction change (exercise 3 in the course).'],
    trouble: [['REV does nothing even after STOP', 'Pr.02-00 must be 1 (MI1 forward, MI2 reverse); Y5 must go to MI2.']],
  },
  'step-10-modbus-run': {
    course: ['st-modbus', 's10'],
    goal: 'Start and stop the drive without any MI wires: one RS-485 cable from PLC COM2 to the drive carries the commands as Modbus RTU frames.',
    learn: ['the COM2 set-up rung (D1120 = H87, M1143 = RTU)', 'MODRW with function 06 (write one register)', 'the command word 2000H and the speed 2001H'],
    rungs: [
      'First scan only (' + c('M1002') + '): ' + c('MOV H87 D1120') + ' sets COM2 to 9600 bps, 8 data bits, even parity, 1 stop bit; ' + c('SET M1120') + ' keeps that setting; ' + c('MOV K3000 D11') + ' gives the speed 30.00 Hz; ' + c('SET M1143') + ' selects Modbus RTU.',
      'Start / stop latch on ' + c('M0') + ' (START ' + c('X0') + ', NC STOP ' + c('X1') + ').',
      'While running: ' + c('MOV H12 D10') + ' — H12 is the command word "RUN + forward".',
      'While stopped: ' + c('MOV H1 D10') + ' — H1 means "STOP".',
      c('MODRW K1 K6 H2000 D10 K1') + ': to station 1, function 6 (write one register), register 2000H (the command), the value from D10, 1 register. ' + c('M1000') + ' keeps it sending all the time.',
      c('MODRW K1 K6 H2001 D11 K1') + ': the same for register 2001H, the frequency, in units of 0.01 Hz (3000 = 30.00 Hz).',
    ],
    run: [
      ...START,
      'Look at the drive keypad (VFD tab): its <b>PLC</b> LED shows it takes commands from outside. Pr.00-20 = 1 and Pr.00-21 = 2 (both RS-485).',
      'Press <b>START</b> → the motor ramps up to <b>30 Hz</b>. The status bar shows <b>COM2</b> in green.',
      'Tap the <b>Network</b> chip at the bottom: the data packets run along the COM2 cable.',
      'Open <b>Monitor</b> → the COM2 log lists every request (TX) and answer (RX).',
      'Press <b>STOP</b> → H1 is sent and the motor ramps down.',
    ],
    watch: ['Monitor: D10 (H12 / H1), D11 (3000), M1129 (time-out, must stay OFF).'],
    tryIt: ['Change ' + c('MOV K3000 D11') + ' to ' + c('MOV K4500 D11') + ' (45 Hz), Download.', 'Write both registers in one frame: ' + c('MODRW K1 K16 H2000 D10 K2') + ' and delete the 2001H rung.'],
    trouble: MODBUS_TROUBLE,
  },
  'step-11-modbus-fwd-rev': {
    course: ['st-modbus', 's11'],
    goal: 'Forward, reverse and stop over Modbus — the same logic as step 9, but the direction is a number in the command word: H12 forward, H22 reverse, H1 stop.',
    learn: ['building the command word from the latches', 'H12 / H22 / H1', 'a STOP command when no direction is active'],
    rungs: [
      'COM2 set-up on the first scan (9600 8E1 RTU, speed D11 = 30.00 Hz).',
      'Forward latch ' + c('M0') + ' — FORWARD ' + c('X0') + ', NC STOP ' + c('X2') + ', interlock ' + c('/M1') + '.',
      'Reverse latch ' + c('M1') + ' — REVERSE ' + c('X1') + ', NC STOP ' + c('X2') + ', interlock ' + c('/M0') + '.',
      'Forward: ' + c('MOV H12 D10') + ' (RUN + FWD) and the FWD lamp ' + c('Y0') + '.',
      'Reverse: ' + c('MOV H22 D10') + ' (RUN + REV) and the REV lamp ' + c('Y1') + '.',
      'Neither latch on: ' + c('MOV H1 D10') + ' (STOP). Without this rung D10 would keep the last value and the motor would never stop.',
      'Send D10 to 2000H (command).',
      'Send D11 to 2001H (speed).',
    ],
    run: [
      ...START,
      'Press <b>FORWARD</b> → FWD lamp, the motor runs forward at 30 Hz. Monitor: D10 = 18 (H12).',
      'Press <b>REVERSE</b> while it runs → nothing (interlock).',
      'Press <b>STOP</b> → D10 = 1, the motor stops.',
      'Press <b>REVERSE</b> → D10 = 34 (H22), the motor runs backwards (−30 Hz).',
    ],
    watch: ['Monitor: D10 in hex, the COM2 log ("Write 2000H = 0012H → RUN FWD").'],
    tryIt: ['Compare with your own MODWR program: the course chapter "Modbus made simple" lists the usual mistakes.', 'Add a fault lamp: read 2100H into D22 and light a lamp when D22 ≠ 0.'],
    trouble: MODBUS_TROUBLE,
  },
  'step-12-modbus-speed': {
    course: ['st-modbus', 's12'],
    goal: 'Change the speed with +5 Hz / −5 Hz buttons and read the real output frequency and current back from the drive (function 03).',
    learn: ['pulse instructions ADDP / SUBP', 'limiting a value with compare contacts', 'reading registers with MODRW function 3'],
    rungs: [
      'COM2 set-up on the first scan; start speed D11 = 2000 (20.00 Hz).',
      'START / STOP latch ' + c('M0') + '.',
      'Running → command H12.',
      'Stopped → command H1.',
      c('ADDP D11 K500 D11') + ': each press of +5 Hz (' + c('X2') + ') adds 500 once (the P makes it a one-shot on the rising edge).',
      c('SUBP D11 K500 D11') + ': each press of −5 Hz (' + c('X3') + ') subtracts 500.',
      'If D11 > 5000 it is set back to 5000 — never more than 50.00 Hz.',
      'If D11 < 0 it is set to 0.',
      'Write the command (2000H).',
      'Write the speed D11 (2001H).',
      c('MODRW K1 K3 H2103 D20 K2') + ': read 2 registers from 2103H — the output frequency into D20 and the output current into D21.',
    ],
    run: [
      ...START,
      'Press <b>START</b> → 20 Hz.',
      'Press <b>+5 Hz</b> twice → 30 Hz. In Monitor D20 climbs to 3000 while the drive accelerates.',
      'Press <b>+5 Hz</b> many times → it stops at 50 Hz (D11 = 5000).',
      'Press <b>−5 Hz</b> → the speed drops.',
    ],
    watch: ['Monitor: D11 (set), D20 (real Hz × 100), D21 (current × 100).'],
    tryIt: ['Make the steps 1 Hz (K100).', 'Show the motor rpm: ' + c('MUL D20 K28 D30') + ' then divide by 100.'],
    trouble: [...MODBUS_TROUBLE, ['One press jumps straight to 50 Hz', 'You used ADD instead of ADDP — without the P it adds on every scan while the button is held.']],
  },
  'step-13-analog-read': {
    course: ['st-analog', 's13'],
    goal: 'Read a 0–10 V temperature transmitter (0–100 °C) with the DVP04AD-E2 analog module, convert it to °C and light a HOT lamp above 60 °C.',
    learn: ['the right-side analog module and its wiring', 'FROM: reading a control register (CR)', 'scaling 0–32000 to 0.0–100.0 °C'],
    rungs: [
      c('FROM K0 K12 D0 K1') + ': from module 0 (the first one next to the PLC), control register CR#12 (the present value of CH1), into D0, one register. 0 V = 0, 10 V = 32000.',
      c('DIV D0 K32 D10') + ': 32000 ÷ 32 = 1000, so D10 runs 0 … 1000 = 0.0 … 100.0 °C (one decimal kept: 350 means 35.0 °C). The remainder goes into D11.',
      'Compare contact ' + c('D10 > K600') + ' → ' + c('OUT Y0') + ': above 60.0 °C the HOT lamp lights.',
    ],
    run: [
      ...START,
      'The module\'s <b>POWER</b> LED is on and <b>A→D</b> blinks (converting).',
      'Open <b>Monitor</b> and type ' + c('D0') + ' and ' + c('D10') + ': about 11200 and 350 (35.0 °C).',
      'Back in Lab, tap the <b>TEMP</b> transmitter and drag its value above 60 °C → the <b>HOT</b> lamp lights.',
      'Drag it back below 60 °C → the lamp goes out.',
      'Switch to <b>2D</b>: the module shows the raw value of every channel live.',
    ],
    watch: ['Monitor: D0 (raw), D10 (0.1 °C).'],
    tryIt: ['Alarm at 40.0 °C: ' + c('D10>K400') + '.', 'Show whole degrees: ' + c('DIV D0 K320 D10') + '.'],
    trouble: AD_TROUBLE,
  },
  'step-14-analog-4-20ma': {
    course: ['st-analog', 's14'],
    goal: 'Read a 4–20 mA pressure transmitter (0–10 bar) and run a pump with two limits: on below 3 bar, off above 6 bar.',
    learn: ['current input: I+ bridged to V+', 'TO: setting the channel mode (CR#1)', 'hysteresis with SET / RST'],
    rungs: [
      'First scan: ' + c('TO K0 K1 H40 K1') + ' writes H0040 into CR#1 — one hex digit per channel, CH1 = the last digit: CH1 mode 0 (±10 V), CH2 mode 4 (4–20 mA, 4 mA = 0).',
      c('FROM K0 K13 D1 K1') + ': CR#13 = the present value of CH2 → D1 (4 mA = 0, 20 mA = 32000).',
      c('DIV D1 K320 D11') + ': 32000 ÷ 320 = 100, so D11 = 0 … 100 = 0.0 … 10.0 bar.',
      'Below 3.0 bar (' + c('D11 < K30') + ') → ' + c('SET Y0') + ': the pump starts.',
      'Above 6.0 bar (' + c('D11 > K60') + ') → ' + c('RST Y0') + ': the pump stops. Between 3 and 6 bar neither rung acts, so the pump keeps what it was doing — that gap is the hysteresis.',
    ],
    run: [
      ...START,
      'Monitor: ' + c('D11') + ' ≈ 50 (5.0 bar). The pump is off.',
      'Tap <b>PRESSURE</b> and set 2 bar → the <b>PUMP</b> lamp lights.',
      'Raise it to 5 bar → the pump keeps running (between the limits).',
      'Raise it to 7 bar → the pump stops.',
      'Lower it to 4 bar → the pump stays off until the pressure drops below 3 bar.',
    ],
    watch: ['Monitor: D1 (raw), D11 (0.1 bar), Y0.'],
    tryIt: ['Delete the jumper I2+ ↔ V2+ (Wire mode, tap the wire, delete) and watch the value.', 'Delete the TO rung: in mode 0 a 4 mA signal reads 6400, not 0.'],
    trouble: AD_TROUBLE,
  },
  'step-15-analog-average': {
    course: ['st-analog', 's15'],
    goal: 'Read all four channels with one FROM and compare the averaged value with the present value.',
    learn: ['FROM with several registers', 'averaging (CR#2–5) against the present value (CR#12–15)'],
    rungs: [
      'First scan: ' + c('TO K0 K2 K20 K1') + ' — CR#2 = 20: CH1 averages its last 20 readings (CH2–CH4 keep the default 10).',
      c('FROM K0 K6 D0 K4') + ': CR#6 … CR#9, the averaged values of CH1 … CH4 → D0 … D3.',
      c('FROM K0 K12 D4 K2') + ': CR#12, CR#13, the present (not averaged) values of CH1, CH2 → D4, D5.',
      c('DIV D0 K32 D10') + ': temperature 0.0 … 100.0 °C.',
      c('DIV D1 K320 D12') + ': pressure 0.0 … 10.0 bar.',
    ],
    run: [
      ...START,
      'Monitor: type ' + c('D0') + ', ' + c('D4') + ', ' + c('D10') + ', ' + c('D12') + '. D0 and D4 are equal (25 °C → 8000).',
      'Tap <b>TEMP</b> and jump it from 25 to 75 °C. D4 jumps at once; D0 follows over a fraction of a second — that is the average.',
    ],
    watch: ['Monitor: D0 against D4.'],
    tryIt: ['Average 50 readings: ' + c('TO K0 K2 K50 K1') + '.', 'Average CH2 too: ' + c('TO K0 K3 K20 K1') + '.'],
    trouble: AD_TROUBLE,
  },
  'step-16-analog-modbus-speed': {
    course: ['st-final', 's16'],
    goal: 'The final project: an operator sets the motor speed with a pot and the direction with FORWARD / REVERSE / STOP; the PLC reads the pot through the analog module and drives the VFD over Modbus.',
    learn: ['combining analog input, scaling and Modbus', 'MUL and its 32-bit result', 'reading the drive back'],
    rungs: [
      'COM2 set-up on the first scan (9600 8E1 RTU).',
      'Forward latch ' + c('M0') + ' (FORWARD ' + c('X0') + ', NC STOP ' + c('X2') + ', interlock ' + c('/M1') + ').',
      'Reverse latch ' + c('M1') + ' (REVERSE ' + c('X1') + ', NC STOP, interlock ' + c('/M0') + ').',
      'Forward → command H12.',
      'Reverse → command H22.',
      'Neither → command H1 (STOP).',
      c('FROM K0 K12 D0 K1') + ': the pot on CH1 → D0 = 0 … 32000. The pot is fed by the drive\'s +10V / ACM, so its wiper gives 0–10 V.',
      c('DIV D0 K32 D12') + ': D12 = 0 … 1000 (0.0 … 100.0 %).',
      c('MUL D12 K5 D14') + ': D14 = 0 … 5000 = 0.00 … 50.00 Hz. MUL writes a 32-bit result into D14 + D15; the value fits in D14.',
      'Write the command D10 to 2000H.',
      'Write the speed D14 to 2001H.',
      'Read the output frequency 2103H into D20.',
    ],
    run: [
      ...START,
      'Press <b>FORWARD</b> → the motor runs at the pot\'s speed: 60 % = 30 Hz.',
      'Tap the <b>SPEED</b> pot and drag it: 0 % → 0 Hz, 100 % → 50 Hz. The drive ramps to every new speed.',
      'Press <b>STOP</b>, then <b>REVERSE</b> → the motor runs backwards.',
      'Monitor: D0 (raw), D12 (%), D14 (set Hz × 100), D20 (real Hz × 100).',
    ],
    watch: ['Network chip: the COM2 packets; 2D view: the module\'s CH1 value.'],
    tryIt: ['Top speed 40 Hz: ' + c('MUL D12 K4 D14') + '.', 'A minimum speed of 10 Hz: ' + c('D14<K1000 → MOV K1000 D14') + '.', 'Read the current (2104H) and light a lamp above 2.00 A.'],
    trouble: [...MODBUS_TROUBLE, ...AD_TROUBLE.slice(0, 2)],
  },
};

// ------------------------------------------------------------------ generated sections
const NAMES = { drp024: '24 V supply', mcb: 'MCB (main switch)', laptop: 'Laptop', motor: 'Motor' };
/** Readable device name: "START push button", "24 V supply", "DVP16ES2". */
export function devName(dev) {
  const def = DEVICE_DEFS[dev.type];
  if (!def) return dev.id;
  const pr = deviceProps(dev);
  if (hasLabel(def) && pr.label) return `${pr.label} ${def.short.toLowerCase()}`;
  return NAMES[dev.type] || def.short;
}
function portName(dev, portId) {
  const p = findPort(dev, portId);
  if (!p) return portId;
  if (p.kind === 'comm') return portId === 'RS485' ? 'RS-485' : portId;
  return p.label || portId;
}
/** Which group a connection belongs to in the wiring list. */
function wireGroup(cn, P) {
  if (cn.comm) return 'comm';
  const sigs = [cn.a, cn.b].map((e) => { const d = P.devices.find((x) => x.id === e.dev); const p = d && findPort(d, e.port); return p ? p.sig : ''; });
  if (sigs.some((s) => s === 'L' || s === 'N' || s === 'PE')) return 'mains';
  if (sigs.some((s) => s === 'mot')) return 'motor';
  if (sigs.some((s) => s === 'an')) return 'analog';
  if (sigs.some((s) => s === 'out' || s === 'com')) return 'out';
  if (sigs.some((s) => s === 'ctl')) return 'ctl';
  return 'in';
}
const GROUPS = [
  ['mains', '230 V and earth', 'Wire these first: the MCB feeds the supply, the PLC and the drive.'],
  ['in', '24 V and the inputs', 'Buttons, selectors and sensors get +24 V and switch it to a PLC input X; S/S goes to 0 V.'],
  ['out', 'Outputs', 'A relay common (C0 / C1) gets its voltage; each output Y switches a lamp, a coil or a drive input.'],
  ['ctl', 'Drive control terminals', 'The PLC relays switch the drive\'s MI inputs to DCM.'],
  ['analog', 'Analog signals and the module', 'Transmitter and pot signals to the analog inputs, the module\'s 24 V.'],
  ['motor', 'Drive → motor', 'U / V / W from the drive to the motor (swap two of them and it turns the other way), PE to the motor frame.'],
  ['comm', 'Communication cables', 'USB = programming; RS-485 = Modbus to the drive and other slaves; RS-232 = the HMI.'],
];

function wiringHtml(P) {
  const dev = (id) => P.devices.find((d) => d.id === id);
  let n = 0, out = '';
  for (const [g, title, sub] of GROUPS) {
    const list = P.conns.filter((cn) => wireGroup(cn, P) === g);
    if (!list.length) continue;
    out += `<h3>${esc(title)}</h3><p class="lg-sub">${esc(sub)}</p><ol class="lg-wires" start="${n + 1}">` + list.map((cn) => {
      n++;
      const a = dev(cn.a.dev), b = dev(cn.b.dev);
      const col = cn.color && cn.color !== 'pe' ? `<i class="lg-col" style="background:${esc(cn.color)}"></i>` : cn.color === 'pe' ? '<i class="lg-col pe"></i>' : '';
      return `<li>${col}<b>${esc(devName(a))}</b> ${esc(portName(a, cn.a.port))} → <b>${esc(devName(b))}</b> ${esc(portName(b, cn.b.port))}</li>`;
    }).join('') + '</ol>';
  }
  return out || '<p>Nothing is wired yet.</p>';
}

function partsHtml(P) {
  return '<ul class="lg-parts">' + P.devices.map((d) => {
    const def = DEVICE_DEFS[d.type];
    if (!def) return '';
    return `<li><b>${esc(devName(d))}</b><small>${esc(def.part || def.name)}</small></li>`;
  }).join('') + '</ul>';
}

/** Drive parameters that differ from the factory setting. */
function vfdParams(P) {
  const out = [];
  for (const d of P.devices.filter((x) => DEVICE_DEFS[x.type] && DEVICE_DEFS[x.type].sim === 'vfd')) {
    const p = (d.state && d.state.params) || {};
    for (const [id, v] of Object.entries(p)) {
      const def = PARAM_BY_ID[id];
      if (!def || v === def.def) continue;
      const opt = def.opts && def.opts[v];
      out.push(`<li><b>Pr.${id}</b> = ${esc(v)}${opt ? ' — ' + esc(opt) : def.unit ? ' ' + esc(def.unit) : ''} <small>(${esc(def.name)})</small></li>`);
    }
  }
  return out.length ? `<ul class="lg-params">${out.join('')}</ul>` : '';
}

function programHtml(P, explain) {
  const prog = P.program;
  if (!prog || !prog.rungs.length) return '<p>The program is empty.</p>';
  let out = '';
  prog.rungs.forEach((r, i) => {
    const il = rungIL(r);
    const lines = il.error ? '' : il.lines.map((l) => esc(l.text)).join('\n');
    if (!lines && !r.comment) return;
    out += `<div class="lg-rung"><div class="lg-rn">Network ${i + 1}${r.comment ? ' · ' + esc(r.comment) : ''}</div>` +
      (lines ? `<pre class="lg-il">${lines}</pre>` : '') + (explain && explain[i] ? `<p>${explain[i]}</p>` : '') + '</div>';
  });
  if (!out) out = '<p>The program is still empty: write it in the <b>Ladder</b> tab and press <b>Download</b>.</p>';
  const cm = Object.entries(prog.comments || {});
  if (cm.length) out += '<h3>Device comments</h3><table class="lg-cm"><tbody>' + cm.map(([k, v]) => `<tr><td><code>${esc(k)}</code></td><td>${esc(v)}</td></tr>`).join('') + '</tbody></table>';
  return out;
}

function buildHtml(P) {
  const kinds = [];
  for (const d of P.devices) { const n = devName(d); if (!kinds.includes(n)) kinds.push(n); }
  const params = vfdParams(P);
  return ol([
    'PLC Lab → <b>New project</b>: an empty bench.',
    `<b>＋ Add device</b> for every part: ${kinds.map((k) => '<b>' + esc(k) + '</b>').join(', ')}. Buttons, lamps and sensors land on the operator console, the PLC and supply on the top rail, the drive on the lower rail.`,
    'Set each device\'s label (START, STOP …) in its settings so the wiring list reads the same.',
    '<b>Wire</b> mode: for each line of the wiring list tap the first terminal, then the second. Do the 230 V group first, then 24 V, then the rest.',
    ...(params ? [`<b>VFD</b> tab: set the drive parameters ${params}`] : []),
    '<b>Ladder</b> tab: enter the networks of the program (the instruction list shows exactly what goes in each one), then <b>Download</b>.',
    'Press <b>Simulate</b> and test it like the guide says. ⚠ <b>Check the lab</b> lists any wiring mistake.',
  ]);
}

/** The guide of a lab: { title, intro, sections: [{ id, title, html }] }. */
export function buildGuide(P, ex) {
  const g = ex && STEP_GUIDES[ex.id];
  const tasks = ex && LAB_TASKS[ex.id];
  const secs = [];
  const sec = (id, title, html) => { if (html) secs.push({ id, title, html }); };
  sec('goal', 'What this lab does', `<p>${g ? g.goal : esc(ex ? ex.description : 'Your own lab: below are its parts, its wiring list wire by wire and its program network by network.')}</p>` +
    (g && g.learn.length ? `<p class="lg-learn"><b>You learn</b></p>${ul(g.learn)}` : ''));
  if (g || tasks) {
    const run = g ? g.run : [...START, ...tasks.map((t) => esc(t.text) + (t.hint ? ` <small>(${esc(t.hint)})</small>` : ''))];
    sec('run', 'Run it, step by step', ol(run) + (g && g.watch && g.watch.length ? `<p><b>Watch</b></p>${ul(g.watch)}` : ''));
  }
  sec('parts', 'Parts in this lab', partsHtml(P));
  const params = vfdParams(P);
  sec('wiring', 'Wiring list, wire by wire', wiringHtml(P) + (params ? `<h3>Drive parameters (different from the factory setting)</h3>${params}` : ''));
  sec('program', 'The program, network by network', programHtml(P, g && g.rungs));
  if (g && g.tryIt.length) sec('try', 'Try it yourself', ol(g.tryIt));
  const trouble = [...(g ? g.trouble : []), ['Nothing happens at all', 'Is the lab running (<b>Simulate</b>) and the PLC in <b>RUN</b>? Is the <b>MCB</b> ON? Tap ⚠ <b>Check the lab</b> — it names wiring and setting mistakes.']];
  sec('trouble', 'If it does not work', `<table class="lg-trouble"><tbody>${trouble.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</tbody></table>`);
  sec('build', 'Build it yourself from an empty bench', buildHtml(P));
  return { title: ex ? ex.name : P.name, course: g ? g.course : null, tasks: !!tasks, sections: secs };
}
