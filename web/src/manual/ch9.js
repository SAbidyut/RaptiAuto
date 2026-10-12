import { note, tip, warn, steps, ul, table, open } from './helpers.js';

const GLOSSARY = [
  ['AC drive', 'See VFD.'],
  ['Address', 'The number that tells where a value lives: a PLC device (D10) or a Modbus register (1001H).'],
  ['ASCII', 'A Modbus mode that sends readable text; RTU is the compact binary mode.'],
  ['Baud rate', 'The speed of a serial line in bits per second (9600 bps).'],
  ['Bit', 'A value that is 0 or 1 (X, Y, M, S and the bits of T and C).'],
  ['Coil', 'In Modbus a 1-bit output; in ladder the "round" output symbol.'],
  ['Contact', 'A ladder symbol that conducts depending on a device: normally open (NO) or normally closed (NC).'],
  ['COM1 / COM2', 'The serial ports of the PLC. COM1 is RS-232 (HMI, laptop), COM2 is RS-485 (Modbus).'],
  ['CRC', 'The checksum at the end of an RTU frame.'],
  ['Device', 'A named PLC memory cell: X0, Y1, M10, T0, C0, D100 …'],
  ['Double coil', 'Two OUT instructions on the same device — the lower one wins. Avoid.'],
  ['Download', 'Writing the program from the laptop into the PLC.'],
  ['Function code (FC)', 'The Modbus "verb": read, write …'],
  ['HMI', 'Human-machine interface: the touch screen.'],
  ['Interlock', 'A contact that prevents two actions at once (forward and reverse).'],
  ['Ladder diagram', 'The graphical PLC language drawn between two power rails.'],
  ['Latched', 'Memory that keeps its value when the PLC stops (M500+, D200+, C100+).'],
  ['Master / slave', 'The device that asks / the device that answers on a Modbus line.'],
  ['MCB', 'Miniature circuit breaker: the main switch of the panel.'],
  ['MODRW', 'The PLC instruction that makes the PLC a Modbus master.'],
  ['Network (rung)', 'One horizontal line of a ladder program.'],
  ['NC / NO', 'Normally closed / normally open.'],
  ['Octal', 'Counting in eights — X and Y addresses: …X7, X10.'],
  ['PB', 'Proportional band of a PID controller, in °C.'],
  ['PE', 'Protective earth.'],
  ['PID', 'Proportional-integral-derivative control.'],
  ['PV / SV', 'Process value (measured) / set value (wanted).'],
  ['Pr.', 'A parameter of the drive: Pr.01-12.'],
  ['Register', 'A 16-bit memory word (D…, or a Modbus holding register).'],
  ['RS-232 / RS-485', 'Serial cable standards: point-to-point / multi-drop (many devices on one pair).'],
  ['RTU', 'The compact binary mode of Modbus.'],
  ['Scan', 'One round of the PLC: read inputs, run the program, write outputs, communicate.'],
  ['SSR', 'Solid-state relay, used to switch heaters on and off quickly.'],
  ['Station', 'The Modbus address of a device (1 – 247).'],
  ['Ti / Td', 'Integral time / derivative time of a PID controller, in seconds.'],
  ['VFD', 'Variable frequency drive (inverter).'],
  ['V/F', 'Voltage-to-frequency ratio kept constant by the drive.'],
];

export default {
  id: 'ref', no: 9, title: 'Quick reference, FAQ and glossary', icon: 'list',
  blurb: 'Gestures, shortcuts, the most-used instructions, frequent questions and the glossary.',
  sections: [
    {
      id: 'gestures', title: 'Gestures and shortcuts',
      html: `
${table(['I want to …', 'Do this'], [
  ['Open a second screen next to this one', 'Landscape: tap another tab at the bottom. Tap it again to close it.'],
  ['Zoom the 3D lab / 2D schematic', 'Pinch; or double-tap, hold and slide.'],
  ['Zoom the HMI', 'Two fingers on the HMI tab, or the ＋ / − buttons in the HMI bar. Double-tap the frame to fit.'],
  ['Select several devices or cables', 'Select tool: drag right = window, left = crossing.'],
  ['Go back to the whole lab', 'Tap the <b>Overview</b> chip.'],
  ['Run faster / slower', '⋮ menu → Simulation speed (0.25 × … 4 ×).'],
  ['Hide all menus', '⋮ menu → Full screen. Use ☰ / ✕ in the corner to show or hide the bars.'],
  ['Edit a ladder element', 'Tap the cell, tap a toolbar button; long-press for the menu.'],
  ['Open the Android back action', 'Back closes sheets and full screen first, then returns to the Lab tab, then to the lab list.'],
])}`,
    },
    {
      id: 'instr', title: 'The instructions you use most',
      html: `
${table(['Group', 'Instructions'], [
  ['Contacts', '<code>LD · LDI · AND · ANI · OR · ORI</code> (as ladder contacts) · <code>LDP · LDF</code> rising / falling edge · <code>INV</code>'],
  ['Coils', '<code>OUT · SET · RST · PLS · PLF</code>'],
  ['Timers / counters', '<code>TMR · TON · TOF</code> · <code>CNT · DCNT</code>'],
  ['Compare', '<code>LD= LD&gt; LD&lt; LD&gt;= LD&lt;= LD&lt;&gt;</code> · <code>CMP · ZCP</code>'],
  ['Move', '<code>MOV · DMOV · BMOV · FMOV · XCH · BCD · BIN</code>'],
  ['Math', '<code>ADD · SUB · MUL · DIV · INC · DEC · NEG · ABS · SQR · MEAN · SCAL</code> (and D… for 32 bit, floating point <code>DEADD …</code>)'],
  ['Logic', '<code>WAND · WOR · WXOR · ROR · ROL · SFTR · SFTL · ZRST · ALT</code>'],
  ['Flow', '<code>CJ · CALL · SRET · FEND · FOR · NEXT · MC · MCR · STL · RET</code>'],
  ['Communication', '<code>MODRW · MODRD · MODWR · FWD · REV · STOP · RDST · RSTEF</code>'],
  ['Clock', '<code>TRD · TWR</code> (real-time clock D1313 …)'],
])}
<p>The full DVP-ES2 / EX2 instruction set (more than 200 instructions) is available from <b>ƒ API</b>, grouped and searchable.</p>`,
    },
    {
      id: 'faq', title: 'Frequently asked questions',
      html: `
${table(['Question', 'Answer'], [
  ['Why did my change not take effect?', 'The ladder must be <b>downloaded</b> again, and the PLC must be in RUN. Look for the "Edited — the PLC still runs the old program" banner.'],
  ['Why is X8 or Y9 refused?', 'X and Y are <b>octal</b>: after X7 comes X10.'],
  ['The lamp does not light, but Y0 is on in the Monitor.', 'Check C0 (+24 V), the lamp\'s return to 0 V, and that the lamp is wired to the right Y.'],
  ['My STOP button works backwards.', 'An NC button gives X = 1 at rest. Use <code>X1</code> (normally open contact) for an NC button, and <code>/X1</code> for an NO button.'],
  ['Why does the HMI say "no response"?', 'Cable HMI COM1 → PLC COM1, PLC powered and in RUN, station number 1, and the PLC COM1 not in use by something else.'],
  ['"COM2 time-out" in the status line.', 'See chapter 6, section "Troubleshooting". Most often the baud / format / RTU setting or the station number.'],
  ['Can I use two PLCs?', 'Yes — add a second PLC from ＋ → PLCs; the chip at the top chooses which one you program. Connect COM2 to COM2.'],
  ['How do I make the drive run at a speed from the HMI?', 'Chapter 4 (option C) and the example <i>VFD speed control · Modbus RTU + HMI</i>.'],
  ['The oven never reaches the SV.', 'P-only control (Ti = 0), or the SV is above the controller limit (1002H), or the controller is in STOP / manual mode.'],
  ['Where is my project saved?', 'On the phone, in <b>My projects</b> of the PLC Lab page. Use ⋮ → Export lab for a file you can copy elsewhere.'],
  ['The 3D view is slow.', '⋮ → <b>3D quality</b> → Fast, and re-open the lab. Or work in 2D.'],
  ['Can I lose a program by pressing "PLC memory clear"?', 'It clears the PLC and the latched memory; the ladder in the editor stays and can be downloaded again.'],
])}`,
    },
    {
      id: 'glossary', title: 'Glossary',
      html: `${table(['Term', 'Meaning'], GLOSSARY.map(([a, b]) => ['<b>' + a + '</b>', b]))}`,
    },
    {
      id: 'about', title: 'About this manual',
      html: `
<p>This manual belongs to <b>RaptiAuto</b>, made by <b>RAPTI — Resonance Automation Professional Training Institute</b> in Bangladesh. The PLC Lab follows the behaviour of Delta DVP-ES2 / EX2 PLCs, the DOP-107BV HMI, the MS300 drive and the DTB4848 controller as described in their manuals; where the simulation simplifies something (for example the oven or the energy meter), it says so.</p>
${note('A simulator is a teaching tool. Before you work on a real panel, read the maker\'s manual and follow your workplace safety rules — real mains voltage is dangerous.')}
${ul(
  'Open the <b>About</b> page of the app for courses and contact details of RAPTI.',
  'Every chapter has examples that open with one tap — use them as models for your own projects.')}`,
    },
  ],
};
