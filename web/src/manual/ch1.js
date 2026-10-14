import * as A from './art.js';
import { note, tip, warn, tryIt, steps, ul, table, open } from './helpers.js';

export default {
  id: 'start', no: 1, title: 'Getting started with the PLC Lab', icon: 'rocket',
  blurb: 'The screen, the tabs, simulate / operate / wire, two screens at once, saving and sharing.',
  sections: [
    {
      id: 'what', title: 'What the PLC Lab is',
      html: `
<p>The <b>PLC Lab</b> is a complete automation trainer on your phone. You get the same parts you find on a real training panel — and you can wire, program and run all of them without touching a screwdriver:</p>
${ul(
  '<b>Delta DVP PLCs</b> (DVP16ES2, DVP32ES2 and the analog model DVP20EX2) — programmed in ladder diagram, exactly in the way you would do it in ISPSoft.',
  '<b>Delta DOP-107BV HMI</b> touch screen — you design its screens and touch them like a real panel.',
  '<b>Delta MS300 variable frequency drive (VFD)</b> with its real keypad and parameters, driving a 3-phase motor.',
  '<b>Delta DTB4848 PID temperature controller</b>, an RS-485 temperature / humidity sensor and an energy meter — Modbus slaves on one RS-485 line.',
  '<b>Field devices</b>: push buttons, E-stop, selector switches, lamps, buzzer, proximity / photo sensors, limit and float switches, transmitters, contactors, overload relay, relays, breakers.',
  'A <b>24 V power supply</b>, an <b>MCB</b> (the main switch), and the <b>laptop</b> that downloads your program over USB.')}
<p>Everything behaves like the real thing: a wrong wire does nothing (or trips something), a wrong Modbus setting gives a time-out, and an overloaded drive shows a fault code. That is the point — you learn by seeing what happens.</p>
${tip('You do not need to read this manual from the first page to the last. Open the chapter you need: <b>2 · PLC programming</b>, <b>4 · VFD</b>, <b>5 · HMI</b> or <b>6 · Modbus</b>. Every chapter has examples you can open with one tap.')}`,
    },
    {
      id: 'open', title: 'Opening a lab',
      html: `
${steps(
  'Open the <b>☰ menu</b> (top left of the Home page) and choose <b>Delta PLC Lab</b> — or tap the <b>PLC Lab</b> tile on the Home page.',
  'Tap <b>New project</b> for an empty panel, or pick one of the <b>Examples</b>. An example is copied into <b>My projects</b> when you open it, so you can change it freely.',
  'Your own labs are listed under <b>My projects</b>. Tap one to continue where you stopped.')}
<p>A new lab is an <b>empty bench</b>: nothing is placed and nothing is wired. You choose every part yourself with <b>＋ Add device</b> — typically the main switch (MCB), the 24 V supply, a PLC, the laptop, and then the HMI, VFD, motor, buttons and lamps your project needs — and wire them. If you would rather start with the PLC, supply and laptop already connected, open the <b>starter lab</b> from the examples:</p>
${open('blank', 'Open the starter lab (PLC + power)')}`,
    },
    {
      id: 'tour', title: 'The screen, tab by tab',
      html: `
${A.tour()}
${ul(
  '<b>1 · Simulate / Stop</b> powers the whole panel. While it runs, time runs inside the simulation too.',
  '<b>2 · ⋮ menu</b>: Save, Rename, Export lab (<code>.raptiplc</code>), Undo / Redo wiring, side-by-side layout, Full screen, Simulation speed, 3D quality, Lab tasks and Help.',
  '<b>3 · Operate / Wire</b>: <i>Wire</i> draws cables; <i>Operate</i> lets you press buttons, turn selectors and touch the HMI right in the picture.',
  '<b>4 · Tool rail</b>: <b>＋ Add device</b>, <b>Wiring list</b>, <b>Check the lab</b> (⚠), the <b>Select</b> box tool, undo / redo, <b>Overview</b>, zoom and <b>Full screen</b>.',
  '<b>5 · 2D / 3D</b>: the same lab as a wiring schematic or as a 3D panel — everything you do shows in both.',
  '<b>6 · Jump chips</b>: tap <i>Overview</i>, <i>Network</i>, <i>Panel</i> or a device name and the camera flies there.',
  '<b>7 · The five tabs</b>: <b>Lab</b> (wiring and operating), <b>Ladder</b> (the PLC program), <b>HMI</b> (touch-screen designer), <b>VFD</b> (drive keypad and parameters) and <b>Monitor</b> (live data, watch list, Modbus network and the communication log).',
  '<b>8 · Status line</b> (while simulating): the time, PLC RUN / STOP, the HMI link, COM2, the drive frequency and the number of warnings.')}`,
    },
    {
      id: 'two', title: 'Two screens at once, and full screen',
      html: `
${A.twoPane()}
<p>When you hold the phone <b>sideways</b> (or use a tablet) there is room for two screens. The bottom tabs then work like switches:</p>
${ul(
  'Tap a tab that is not open → it opens <b>beside</b> the screen you are looking at.',
  'Tap an open tab again → it <b>closes</b>. The last screen cannot be closed.',
  'Two screens are open and you tap a third tab → the <b>second</b> screen is swapped, the first stays.',
  'The open screens are highlighted in the tab bar.')}
<p>This works in <b>Full screen</b> too (⋮ menu → <b>Full screen</b>, or the ⛶ tool). Full screen hides every bar; the <b>☰</b> button in the corner brings the menus back and the <b>✕</b> hides them again. In full screen a lab that is <i>not</i> simulating shows one screen; when you press Simulate it opens the Lab + a second screen. Whatever you choose with the tabs stays until you leave full screen.</p>
${tip('A good working layout is <b>Lab + Ladder</b>: watch the lamp light in 3D while the ladder shows the green power flow. For HMI work use <b>HMI + Ladder</b>.')}
${note('Held upright, the phone shows one screen at a time — tap a tab to switch.')}`,
    },
    {
      id: 'run', title: 'The working routine: wire → program → download → run',
      html: `
${steps(
  '<b>Wire</b> (Lab tab → <b>Wire</b> mode). Tap a terminal, then tap the terminal it must go to. Green rings show the ports that fit. (More in chapter 3.)',
  '<b>Program</b> (Ladder tab). Write the ladder diagram. The footer says <code>0 errors</code> when it compiles. (Chapter 2.)',
  '<b>Download</b> the program to the PLC (Ladder tab → <b>Download</b>). The laptop\'s USB cable must be plugged into the PLC — it is, in a new lab.',
  '<b>Simulate</b> (top right). Check the MCB is ON and the PLC is in RUN (the green <b>RUN</b> button in the Ladder bar, or the RUN/STOP slide switch on the PLC).',
  '<b>Operate</b>: switch to <b>Operate</b> mode and press your START button in 3D. Watch lamps, the motor, the HMI and the ladder (green = power flow).',
  '<b>Watch</b> in the Monitor tab: X / Y / M / T / C / D live values, and the real Modbus frames in the Comm log.')}
${warn('Changes in the ladder reach the PLC only after <b>Download</b>. If your change "does nothing", you forgot to download (a banner in the Ladder tab says the PLC has an older program).')}
<p><b>Simulation speed</b> (⋮ menu): run slower to watch fast things, or faster (up to ×4) to wait for slow processes such as an oven heating.</p>`,
    },
    {
      id: 'nav', title: 'Moving around: 3D, 2D, selecting',
      html: `
${table(['Do this', 'In 3D', 'In 2D'], [
  ['Move the view', 'Drag = orbit, two fingers = pan', 'Drag'],
  ['Zoom', 'Pinch, or double-tap-and-hold then slide down / up (like Google Maps)', 'Same'],
  ['Jump to a device', 'Tap a chip at the bottom', 'Same'],
  ['Select many things', 'Tool <b>Select</b> (dashed box) or press-and-hold, then drag', 'Same'],
])}
<p>The <b>Select box</b> works like AutoCAD: drag to the <b>right</b> for a blue <i>window</i> (only what is completely inside is selected); drag to the <b>left</b> for a green dashed <i>crossing</i> box (everything it touches). Tap devices or wires to add or remove them from the selection.</p>
<p>The <b>Overview</b> chip is your home button — if you are lost in 3D, tap it.</p>`,
    },
    {
      id: 'save', title: 'Saving, undo and sharing',
      html: `
${ul(
  'A lab <b>saves itself</b> a moment after every change and when you leave. ⋮ → <b>Save</b> does it at once.',
  '<b>Undo / Redo</b> (tool rail or ⋮ menu) cover wiring and devices. The ladder editor has its own undo and redo buttons.',
  '<b>Rename</b>: tap the title at the top.',
  '<b>Export lab (.raptiplc)</b> saves the whole lab — wiring, ladder, HMI screens, drive settings — as a file you can send to a friend or keep as a backup. To open one, use <b>Open / import file</b> on the Home page.')}
${note('The PLC keeps its <i>latched</i> memory (M500 … M999, D200 … D999, C100 … C199) between simulations, like a PLC with a battery. A memory clear is in the Ladder tab ⋯ menu.')}`,
    },
    {
      id: 'check', title: 'Lab check and lab tasks',
      html: `
<p>The <b>⚠ Check the lab</b> tool lists problems: no power, a wire in the wrong place, a short circuit, a device with no 24 V, a Modbus time-out, two slaves with the same address … Tap <b>Show</b> next to an entry to fly to the device.</p>
<p>Many examples have a <b>Tasks</b> pill (top of the Lab view). It opens a short list of exercises that tick themselves off when you do them — a good way to learn an example step by step.</p>
${tryIt('Open the example <i>Start / Stop latching circuit</i>, tap the Tasks pill and do the five tasks.')}
${open('start-stop', 'Open: Start / Stop latching circuit')}`,
    },
  ],
};
