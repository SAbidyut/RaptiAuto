import * as A from './art.js';
import { ladder, par } from './ladder.js';
import { note, tip, warn, tryIt, steps, ul, table, open } from './helpers.js';
import { TempController } from '../plc/sim/mbdevices.js';

/** Runs the lab's own DTB4848 model (same code as in the simulation) and measures the response. */
function oven({ pb = 8, ti = 30, td = 3, mode = 0, sv = 120, secs = 400, at = false } = {}) {
  const dev = { state: { sv, run: true, mode, pb, ti, td } };
  const tc = new TempController(dev, () => ({ station: 1 }));
  tc.powered = true;
  const dt = 0.05;
  let peak = 0, settle = null, low = 1e9, high = -1e9;
  if (at) { tc.startAT(); for (let t = 0; t < 14; t += dt) tc.step(dt); }
  const t0 = at ? 14 : 0;
  for (let t = 0; t < secs; t += dt) {
    tc.step(dt);
    peak = Math.max(peak, tc.pv);
    if (settle === null && Math.abs(tc.pv - sv) < 1) settle = t;
    if (t > secs - 60) { low = Math.min(low, tc.pv); high = Math.max(high, tc.pv); }
  }
  void t0;
  return { final: tc.pv, peak, settle, ripple: high - low, state: dev.state };
}
const R0 = oven();
const RP = oven({ pb: 30, ti: 0, td: 0 });
const RPI = oven({ pb: 30, ti: 30, td: 0 });
const RPID = oven({ pb: 30, ti: 30, td: 5 });
const RFAST = oven({ pb: 100, ti: 10, td: 0 });
const RSLOW = oven({ pb: 10, ti: 200, td: 0 });
const RATrun = oven({ at: true, pb: 8, ti: 30, td: 3 });
const RAT = { ...oven({ pb: RATrun.state.pb, ti: RATrun.state.ti, td: RATrun.state.td }), state: RATrun.state };
const RON = oven({ mode: 1 });
const f1 = (v) => v.toFixed(1);
const t = (s) => (s === null ? 'never' : Math.round(s) + ' s');
const row = (name, p, r) => [name, p, f1(r.final) + ' °C', f1(Math.max(0, r.peak - 120)) + ' °C', t(r.settle)];

export default {
  id: 'pid', no: 7, title: 'PID temperature control', icon: 'thermometer',
  blurb: 'What PID means, the Delta DTB4848 controller, tuning PB / Ti / Td, auto-tune, and two PID projects.',
  sections: [
    {
      id: 'what', title: 'What a PID controller does',
      html: `
<p>Imagine holding a bath at 40 °C with a tap. If the water is cold you open the tap a lot; as it nears 40 °C you close it a little at a time; you keep it a tiny bit open to replace the heat that is lost. You are acting as a <b>PID controller</b>.</p>
${A.pidLoop()}
<p>The controller compares the measured temperature <b>PV</b> (<i>process value</i>) with the wanted <b>SV</b> (<i>set value</i>). The difference <code>e = SV − PV</code> is the <b>error</b>. The controller turns the error into a heater output between 0 and 100 %, using three actions:</p>
${table(['Action', 'Reacts to', 'Effect', 'Setting in the DTB'], [
  ['<b>P</b> — proportional', 'the error now', 'Big error → big output. Small error → small output. Alone it leaves a small steady offset.', '<b>PB</b>, the <i>proportional band</i> in °C: the error that gives 100 % output. <b>Smaller PB = stronger reaction.</b>'],
  ['<b>I</b> — integral', 'how long the error lasted', 'Keeps adding to the output until the error is exactly zero: removes the offset.', '<b>Ti</b>, integral time in seconds. <b>Smaller Ti = stronger integral action.</b> 0 = off.'],
  ['<b>D</b> — derivative', 'how fast the error changes', 'Brakes before the target: less overshoot, calmer approach.', '<b>Td</b>, derivative time in seconds. 0 = off.'],
])}
${A.pidResponse()}
<h3>PID or ON/OFF?</h3>
<p>The simplest controller is <b>ON/OFF</b> (like a kettle or a fridge): heater fully on below SV, fully off above. The temperature swings around the SV and the heater switches constantly. A <b>PID</b> controller sets <i>how much</i> heat is needed, so the temperature stays almost perfectly flat and the heater (or an SSR) lasts longer.</p>`,
    },
    {
      id: 'dtb', title: 'The Delta DTB4848 in the lab',
      html: `
${A.ovenSystem()}
<p>The <b>DTB4848</b> is a 48 × 48 mm Delta temperature controller with two 4-digit displays: <span style="color:#f87171"><b>red = PV</b></span> and <span style="color:#4ade80"><b>green = SV</b></span>. Next to the displays: LEDs <b>OUT1</b> (heater on), <b>AT</b> (auto-tuning), <b>ALM</b> (the temperature is 10 °C above SV), and the keys <b>SET ◀ ▼ ▲</b>.</p>
${ul(
  'In the lab it controls a small <b>oven</b> with a 500 W heater on OUT1 and a thermocouple: about 3.2 °C of temperature rise for every 1 % of heater power, and a time constant of 30 s — it takes about a minute to heat up, and several minutes to cool down.',
  '<b>Wiring</b>: mains <code>L</code> and <code>N</code> to the controller (it runs on 100 – 240 V AC) and RS-485 <code>D+ D−</code> to the PLC (COM2). The factory communication setting is station 1, 9600 bps, 7E1 ASCII; set it to match your PLC (the examples use 8E1 RTU).',
  '<b>In Operate mode</b> tap <b>▲ / ▼</b> to change SV by 1 °C, or tap the display (or the device in the bar → card) to open the card: an SV slider, <b>RUN / STOP</b>, the <b>control method</b> (PID · ON/OFF · Manual 30 %) and an <b>Auto-tune</b> chip. The card also shows the current PB / Ti / Td.',
  'If the PLC writes the SV or the RUN coil every scan (like the examples do), a value changed by hand comes straight back: change it on the HMI instead.')}
${table(['Register', 'What', 'Chapter 6 table'], [
  ['<code>1000H</code> PV · <code>1001H</code> SV', 'Read the temperature, set the target', '✔'],
  ['<code>1005H</code>', 'Control method (PID / ON/OFF / manual)', '✔'],
  ['<code>1009H · 100AH · 100BH</code>', 'PB · Ti · Td', '✔'],
  ['<code>1012H</code>', 'Heater output in 0.1 %', '✔'],
  ['<code>0813H · 0814H</code> (coils)', 'Auto-tune · RUN / STOP', '✔'],
])}`,
    },
    {
      id: 'tune', title: 'Tuning: finding PB, Ti and Td',
      html: `
<p>"Tuning" means finding settings that make the temperature reach the SV quickly, without overshoot and without swinging. The DTB can do it for you (auto-tune) or you can do it by hand.</p>
<h3>Auto-tune</h3>
${steps(
  'Put the controller in <b>PID mode</b> and <b>RUN</b>.',
  'Start it: tap <b>Auto-tune</b> on the card, or write <code>1</code> to the coil <code>0813H</code> (FC05). The <b>AT</b> LED blinks.',
  'For 12 seconds the heater runs at 100 %. From how the temperature rises the controller measures the oven\'s time constant and gain and calculates <b>PB, Ti and Td</b>.',
  'The AT LED goes out, the coil <code>0813H</code> returns to 0 and the three new values are in <code>1009H … 100BH</code>.')}
<p>In the lab\'s oven (default settings) auto-tune finds <b>PB ${f1(RAT.state.pb)} °C, Ti ${RAT.state.ti} s, Td ${RAT.state.td} s</b>.</p>
<h3>Experiments with the lab oven (SV 120 °C)</h3>
<p>These numbers come from the same oven model the simulation uses:</p>
${table(['Setting', 'PB · Ti · Td', 'Final PV', 'Overshoot', 'Within ±1 °C after'], [
  row('<b>P only</b>', '30 · 0 · 0', RP),
  row('<b>PI</b>', '30 · 30 · 0', RPI),
  row('<b>PID</b>', '30 · 30 · 5', RPID),
  row('<b>Default</b>', '8 · 30 · 3', R0),
  row('<b>Auto-tuned</b>', f1(RAT.state.pb) + ' · ' + RAT.state.ti + ' · ' + RAT.state.td, RAT),
  row('<b>Integral too fast</b>', '100 · 10 · 0', RFAST),
  row('<b>Integral too slow</b>', '10 · 200 · 0', RSLOW),
  row('<b>ON/OFF</b>', 'method 1005H = 1', RON),
])}
${ul(
  '<b>P only</b> never reaches the SV — the offset of about ' + f1(120 - RP.final) + ' °C is the proof that the integral action is needed.',
  '<b>PI</b> removes the offset. <b>PID</b> (with Td) gets there sooner.',
  'An integral that is <b>too fast</b> (small Ti with a wide PB) overshoots by about ' + f1(RFAST.peak - 120) + ' °C; one that is <b>too slow</b> needs ' + t(RSLOW.settle) + ' to settle.',
  '<b>ON/OFF</b> ripples by about ' + f1(RON.ripple) + ' °C around the SV and the heater switches constantly.')}
<h3>Tuning by hand</h3>
${table(['Problem', 'Change'], [
  ['Temperature <b>overshoots</b> and comes back slowly', 'Increase PB (weaker reaction) and / or increase Ti; add some Td.'],
  ['Takes <b>too long</b> to reach the SV', 'Decrease PB (stronger), or decrease Ti a little.'],
  ['<b>Steady offset</b> that never closes', 'Ti is 0 or too big: decrease Ti.'],
  ['The temperature <b>oscillates</b> around the SV (a slow oven with a long delay does this when PB and Ti are both small)', 'Increase PB and Ti.'],
  ['The output is <b>nervous</b> / noisy', 'Reduce Td.'],
])}
${tip('Change <b>one</b> value at a time and watch the trend for a few minutes (simulation speed ×4 helps). Write down what you tried.')}`,
    },
    {
      id: 'modes', title: 'ON/OFF and manual mode',
      html: `
${ul(
  '<b>PID (1005H = 0)</b>: the normal mode.',
  '<b>ON/OFF (1005H = 1)</b>: output 100 % when PV is more than 0.5 °C below SV, 0 % when more than 0.5 °C above. Simple and robust, but the heater switches often.',
  '<b>Manual (1005H = 2)</b>: you decide the output. The controller accepts a write to <code>1012H</code> (0.1 % units: 300 = 30.0 %) <b>only in manual mode</b> — otherwise the answer is exception 02. Use it to test a heater or to measure the oven\'s response yourself.')}
${warn('A writes to the SV (1001H) outside the range 1003H … 1002H is refused with exception 03. Change the limits first when you need a very high or low target.')}`,
    },
    {
      id: 'plc', title: 'The PLC and HMI around the controller',
      html: `
<p>The DTB regulates the oven <b>by itself</b>, even if the PLC stops. The PLC adds what a controller alone cannot do: recipes, interlocks with the conveyor, alarms, logging, and a touch screen. That is the normal division of work in a factory.</p>
${ladder([
  { note: 'Read PV and SV (station 2, 1000H, 2 registers) → D30, D31', net: ['M1000'], out: 'MODRW K2 K3 H1000 D30 K2' },
  { note: 'Write the recipe\'s set value D40 → SV (1001H)', net: ['M1000'], out: 'MODRW K2 K6 H1001 D40 K1' },
  { note: 'Error and its absolute value (0.1 °C)', net: ['M1000'], out: ['SUB D30 D31 D32', 'MOV D32 D33'] },
  { net: ['M1000'], out: 'ABS D33' },
  { note: 'Oven stable: |error| below 5.0 °C for 5 s', net: ['D33<K50'], out: 'TMR T0 K50' },
  { note: 'Conveyor allowed only when the oven is stable', net: ['M0', 'T0'], out: 'OUT M2' },
], 'The supervision logic of the oven line example (shortened).')}
${ul(
  'Show <b>PV</b>, <b>SV</b> and the <b>output %</b> on the HMI with numeric displays and a <b>trend</b> (PV and SV on one chart).',
  'Let the operator type the SV with a <b>numeric input</b>; limit it (min / max) to a safe range.',
  'Use <b>recipe buttons</b> that load SV and conveyor speed together.',
  'Raise an alarm when <code>PV − SV</code> is above 20 °C or when COM2 times out.')}`,
    },
    {
      id: 'projects', title: 'Project 1: PID oven line with recipes',
      html: `
<p>A baking line: the DTB controls the oven, an MS300 drive runs the conveyor, the HMI loads recipes. The belt waits until the oven is stable.</p>
${ul(
  '<b>Press START</b>: the oven heats (SV 150 °C by default). The belt starts only after the temperature has stayed within ±5 °C of the SV for 5 s (OVEN STABLE lamp).',
  '<b>RECIPES screen</b> on the HMI: <b>DRY</b> 80 °C / 20 Hz, <b>BAKE</b> 150 °C / 30 Hz, <b>CURE</b> 200 °C / 15 Hz. Load a recipe and watch the PV follow the new SV; the belt speed changes at once.',
  'The HMI <b>OVEN RUN</b> switch writes the coil 0814H; the trend shows PV, SV and the heater output.')}
${tryIt('Load DRY while the oven is at 150 °C: the controller stops heating (OUT1 LED off), the oven cools slowly, and the belt stops until it is stable at 80 °C. Then tap the DTB in 3D and press <b>Auto-tune</b>.')}
${open('pid-oven-recipes', 'Open: PID oven line: recipes')}
<h3>Project 2: PID tuning lab</h3>
<p>One screen with everything for tuning: SV, the three PID numbers (type new ones and hold <b>APPLY</b> — one FC16 request writes 1009H … 100BH), the three control methods, <b>AUTO-TUNE</b> and the trend.</p>
${steps(
  'Press Simulate and watch the oven climb to 120 °C with the default PID.',
  'Type SV <b>150</b>. Watch the trend and note how long it takes and the overshoot.',
  'Press <b>AUTO-TUNE</b>; the AUTO-TUNING lamp lights for 12 s; the PB / Ti / Td read back change.',
  'Type <b>PB 3.0, Ti 0, Td 0</b> and hold APPLY: a P-only controller. See the offset.',
  'Choose <b>ON/OFF</b>: the swinging starts. Choose <b>MANUAL</b> and an output of 30 %: the temperature settles where heat gain equals heat loss.')}
${open('pid-tuning-lab', 'Open: PID tuning lab')}
${note('Both examples have a task list (the Tasks pill in the Lab tab) that checks your steps.')}`,
    },
  ],
};
