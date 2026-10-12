import { note, tip, warn, tryIt, steps, ul, table, open } from './helpers.js';

export default {
  id: 'wiring', no: 3, title: 'Wiring the lab', icon: 'wire',
  blurb: 'Power, 24 V, inputs, outputs, sensors, contactors — wiring recipes you can copy.',
  sections: [
    {
      id: 'wire-mode', title: 'How wiring works in the app',
      html: `
${steps(
  'In the <b>Lab</b> tab tap <b>⚡ Wire</b>.',
  'Tap a <b>terminal</b> (a small dot on a device). It lights up and its name appears.',
  'Tap the <b>terminal it must connect to</b>. Green rings show every port that is allowed; if a terminal has several holes, a chooser lets you pick one.',
  'The cable appears in 3D along the ducts and in 2D as a line. A terminal can take <b>more than one wire</b> (as a real screw terminal does) — daisy-chain +24 V from one switch to the next.')}
${ul(
  '<b>Tap a cable</b> to recolour it, delete it, or (for communication cables) open its <b>Pin-out</b>.',
  '<b>＋ Add device</b> (tool rail) opens the parts library: PLCs, HMI, VFD, power, field devices, sensors, switchgear, Modbus devices, motors. Devices land on the DIN rails, in the console or on the motor stand. Each type has a maximum number.',
  '<b>Wiring list</b> shows every cable as <i>from → to</i>. It is the best place to check your work — and to find a cable you cannot see.',
  '<b>2D</b> shows the same cables as a schematic: easier to read, and all terminal names are printed.',
  'A wire\'s colour is only for your eyes (red for +24 V, blue for 0 V, black / grey for others); the simulator works from the connections.')}
${tip('You can wire in <b>2D</b> and operate in <b>3D</b>. Many students find 2D quicker for wiring and 3D nicer to show the finished machine.')}
${warn('Switch <b>Wire</b> mode off (use <b>Operate</b>) before you press buttons — in Wire mode a tap on a terminal starts a cable.')}`,
    },
    {
      id: 'power', title: 'Power: main switch, 24 V supply, PLC',
      html: `
<p>Every lab starts with the supply wired. You can see how it is done in the <b>Blank lab</b>:</p>
${table(['From', 'To', 'Why'], [
  ['MCB <code>L</code>, <code>N</code>, <code>PE</code>', '24 V supply <code>L</code>, <code>N</code>, <code>PE</code>', 'Mains for the DRP024 power supply.'],
  ['MCB <code>L</code>, <code>N</code>, <code>PE</code>', 'PLC <code>L</code>, <code>N</code>, <code>⏚</code>', 'The PLC runs on 100 – 240 V AC.'],
  ['PLC <code>S/S</code>', 'supply <code>−V1</code>', 'Input common to 0 V (all inputs are "24 V = ON").'],
  ['laptop <code>USB</code>', 'PLC <code>USB</code>', 'Programming cable.'],
])}
<p>The supply has <b>two + and two − terminals</b> (<code>+V1 +V2</code> and <code>−V1 −V2</code>) — they are the same 24 V, but by convention we use <code>V1</code> for the <b>input side</b> (buttons, sensors) and <code>V2</code> for the <b>output side</b> (lamps, relay coils, the HMI), so the wiring stays tidy.</p>
${note('<b>PE</b> (protective earth) is wired from the supply to the PLC, drive and motor, as on a real panel.')}`,
    },
    {
      id: 'inputs', title: 'Recipes for inputs',
      html: `
${table(['Device', 'Wiring', 'In the ladder'], [
  ['<b>Push button NO</b> (START)', '+V1 → <code>13</code> · <code>14</code> → <b>X0</b>', '<code>X0</code> is 1 only while pressed.'],
  ['<b>Push button NC</b> (STOP)', '+V1 → <code>11</code> · <code>12</code> → <b>X1</b>', '<code>X1</code> is 1 at rest; 0 when pressed <i>or the wire breaks</i>.'],
  ['<b>E-stop</b> (mushroom, NC)', '+V1 → <code>11</code> · <code>12</code> → X2', 'Same as NC. Tap it to press (it latches), tap again to release.'],
  ['<b>Selector</b> 2-position (NO)', '+V1 → <code>13</code> · <code>14</code> → X3', '1 in position 1.'],
  ['<b>3-position selector</b> FWD–0–REV', '+V1 → <code>13</code> and <code>23</code> · <code>14</code> → X4, <code>24</code> → X5', 'Left: X4 = 1; right: X5 = 1; both 0 in the middle.'],
  ['<b>Limit switch / float switch</b>', '+V1 → <code>13</code> · <code>14</code> → X (NO) or <code>21 / 22</code> (NC)', 'A mechanical contact like a button.'],
  ['<b>Proximity / photo sensor</b> (3-wire)', 'BN → +24 V · BU → 0 V · BK → X', 'Inductive = metal, capacitive = any material, photo = light. <b>PNP</b> sensors switch +24 V to X (the lab default); NPN switch 0 V. Tap it in Operate mode to put a "part" in front.'],
  ['<b>Temperature / pressure transmitter</b>', 'BN → +24 V · BU → 0 V · BK (signal) → EX2 <code>V0+</code> (and <code>VI0−</code> to 0 V)', '0 – 10 V = 0 – 150 °C or 0 – 10 bar (D1110 = 0 – 2000). Tap it to change the value.'],
])}
${tip('Chain the +24 V: +V1 → START <code>13</code>, START <code>13</code> → STOP <code>11</code>, STOP <code>11</code> → next switch. Real panels use a terminal strip; here a terminal may take several wires.')}
<h3>Why NC for STOP?</h3>
<p>If a wire to an NC STOP button comes loose, the PLC sees a pressed STOP and stops the machine — a <b>safe failure</b>. If it were an NO button, a broken wire would make STOP useless. Always use NC for stop and emergency stop.</p>`,
    },
    {
      id: 'outputs', title: 'Recipes for outputs',
      html: `
${table(['Load', 'Wiring', 'Notes'], [
  ['<b>Pilot lamp 24 V</b>', 'PLC <code>C0</code> → +V2 · PLC <b>Y0</b> → lamp <code>X1</code> · lamp <code>X2</code> → −V2', 'Several lamps can share: connect their <code>X2</code> terminals together to −V2.'],
  ['<b>Buzzer 24 V</b>', 'Y1 → buzzer <code>+</code> · buzzer <code>−</code> → −V2', 'Sounds while Y1 is on (turn sound off in Settings).'],
  ['<b>Contactor coil</b> (KM1)', 'Y0 → <code>A1</code> · <code>A2</code> → −V2', 'Main contacts <code>1/L1 3/L2 5/L3</code> → <code>2/T1 4/T2 6/T3</code> carry the motor current.'],
  ['<b>Interface relay</b>', 'Y2 → <code>A1+</code> · <code>A2−</code> → −V2', 'Its contact <code>11–14</code> / <code>11–12</code> switches another circuit.'],
  ['<b>VFD command</b> (MI1 …)', 'PLC <code>C1</code> → VFD <code>DCM</code> · Y4 → <code>MI1</code>, Y5 → <code>MI2</code> …', 'A closed relay contact between MI and DCM is the command. See chapter 4.'],
])}
<p>Remember the groups: <b>C0 serves Y0 – Y3, C1 serves Y4 – Y7</b> on the DVP16ES2. A group that is not wired to a supply cannot switch anything — a very common beginner mistake.</p>`,
    },
    {
      id: 'motor', title: 'A motor starter: contactor, overload relay, drive',
      html: `
<p>Real motor circuits have two parts: the <b>power circuit</b> (high current, mains voltage) and the <b>control circuit</b> (24 V from the PLC).</p>
${table(['Power circuit', ''], [
  ['MCB → VFD <code>R/L1</code>, <code>S/L2</code> (1-phase 230 V in)', 'the drive makes 3-phase'],
  ['VFD <code>U/T1 V/T2 W/T3</code> → contactor <code>1/L1 3/L2 5/L3</code>', 'contactor = remote switch'],
  ['contactor <code>2/T1 4/T2 6/T3</code> → overload relay <code>1/L1 3/L2 5/L3</code>', 'overload relay = thermal protection'],
  ['overload relay <code>2/T1 4/T2 6/T3</code> → motor <code>U V W</code>', 'and PE to the motor earth'],
])}
${table(['Control circuit', ''], [
  ['PLC Y0 → contactor <code>A1</code>, contactor <code>A2</code> → −V2', 'the PLC pulls the contactor in'],
  ['contactor auxiliary <code>13–14</code> → PLC input X3 (from +V1)', 'feedback: the PLC knows the contactor closed'],
  ['overload relay <code>95–96</code> (NC) → PLC input X2 (from +V1)', 'opens when the motor overheats'],
])}
<p>The PLC program makes sure the drive may only run when the contactor really closed and the overload is not tripped. You can test the overload in 3D: tap the relay to <i>test-trip</i> it, then reset.</p>
${open('contactor-starter', 'Open: Motor starter: contactor + overload relay')}`,
    },
    {
      id: 'comm', title: 'Communication cables',
      html: `
${table(['Cable', 'From → To', 'Used for'], [
  ['<b>USB</b>', 'laptop <code>USB</code> → PLC <code>USB</code>', 'Download, upload, RUN / STOP.'],
  ['<b>RS-232</b>', 'HMI <code>COM1</code> → PLC <code>COM1</code>', 'The touch screen reads and writes PLC devices (9600 7E1, station 1).'],
  ['<b>RS-485</b>', 'PLC <code>COM2</code> (D+ D− SG) → slave <code>RS485</code> → next slave …', 'Modbus: the PLC (master) talks to drives, PLCs, controllers, sensors. Daisy chain!'],
  ['<b>24 V</b> for the HMI', 'HMI <code>+</code> → +V2, <code>−</code> → −V2', 'The DOP-107 needs power: without it the screen says "no 24 V power".'],
])}
<p>Tap a communication cable → <b>Pin-out</b> shows both connectors and which pin goes where (for example RS-485 <code>D+</code> → pin 5 of the MS300 RJ45 plug). The <b>Network</b> chip draws only the communication in 3D.</p>
${note('Communication parameters are checked: wrong baud rate, data format or station address makes a time-out. Chapter 6 explains how to find and fix this.')}`,
    },
    {
      id: 'check', title: 'Checking your wiring',
      html: `
${ul(
  '<b>⚠ Check the lab</b> before you press Simulate: it tests the power, finds loads with no supply, wrong polarity, short circuits and communication problems.',
  'In <b>Monitor → Devices</b> press a button in Operate mode: does the matching <b>X</b> turn on? If not, the wiring from the button to the PLC is wrong.',
  'For an output, <b>force</b> the Y on in the Monitor tab: does the lamp light? If not, check C0, the lamp\'s 0 V and the lamp\'s other terminal.',
  'The PLC front LEDs (<b>IN</b> / <b>OUT</b>) show the same thing in 3D.')}
${table(['Mistake', 'What you see'], [
  ['S/S not connected', 'No input ever turns on.'],
  ['Common C0 not on +24 V', 'The Y LED is on but the lamp stays off.'],
  ['Lamp not returned to 0 V', 'The lamp stays off, or glows weakly.'],
  ['+24 V connected straight to 0 V', 'A short-circuit warning in the lab check.'],
  ['NC and NO terminals swapped', 'STOP acts like START (the X is 1 when it should be 0).'],
  ['COM2 settings differ between master and slave', 'Time-out on COM2 (M1129).'],
])}
${tryIt('Open the <b>Blank lab</b>, add a push button and a pilot lamp, wire them as shown above, write <code>X0 → OUT Y0</code>, Download and press the button. That is the whole chain from input to output.')}
${open('blank', 'Open the starter lab (PLC + power)')}`,
    },
  ],
};
